import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {AdminState} from '../site-worker/src/state.mjs';

// One process owns this connection. All operations, including transactions
// spanning awaits in the shared state machine, run through a single queue.
export class SQLiteNamespace {
  constructor(path){
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);chmodSync(path,0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if(version===0){
      this.db.exec('BEGIN IMMEDIATE');
      try{this.db.exec(readFileSync(new URL('./sql/001-up.sql',import.meta.url),'utf8'));this.db.exec('COMMIT');}
      catch(error){this.db.exec('ROLLBACK');this.db.close();throw error;}
    }else if(version!==1){this.db.close();throw new Error('Unsupported database version');}
    this.queue=Promise.resolve();this.instances=new Map();
  }
  run(fn){const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
  storage(namespace){
    const db=this.db;
    const direct={
      async get(key){const row=db.prepare('SELECT value FROM kv WHERE namespace=? AND key=?').get(namespace,key);return row?JSON.parse(row.value):undefined;},
      async put(key,value){db.prepare('INSERT INTO kv VALUES(?,?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value').run(namespace,key,JSON.stringify(value));},
      async delete(key){return db.prepare('DELETE FROM kv WHERE namespace=? AND key=?').run(namespace,key).changes>0;},
      async list({prefix='',startAfter='',limit=500}={}){
        // Prefixes used by the state machine are ASCII. The range uses the
        // composite primary key; no LIKE wildcard interpretation or full scan.
        const rows=db.prepare('SELECT key,value FROM kv WHERE namespace=? AND key>=? AND key<? AND key>? ORDER BY key LIMIT ?').all(namespace,prefix,prefix+'\uffff',startAfter,limit);
        return new Map(rows.map(row=>[row.key,JSON.parse(row.value)]));
      },
      async getAlarm(){return db.prepare('SELECT expires FROM alarms WHERE namespace=?').get(namespace)?.expires??null;},
      async setAlarm(expires){db.prepare('INSERT INTO alarms VALUES(?,?) ON CONFLICT(namespace) DO UPDATE SET expires=excluded.expires').run(namespace,expires);},
      async deleteAlarm(){db.prepare('DELETE FROM alarms WHERE namespace=?').run(namespace);}
    };
    const queued=Object.fromEntries(Object.entries(direct).map(([key,fn])=>[key,(...args)=>this.run(()=>fn(...args))]));
    queued.transaction=fn=>this.run(async()=>{
      db.exec('BEGIN IMMEDIATE');
      try{const result=await fn(direct);db.exec('COMMIT');return result;}
      catch(error){db.exec('ROLLBACK');throw error;}
    });
    return queued;
  }
  idFromName(name){if(!['epiphany-admin','epiphany-published-content'].includes(name))throw new Error('Unknown state namespace');return name;}
  get(name){
    this.idFromName(name);
    if(!this.instances.has(name)){
      const storage=this.storage(name),state=new AdminState({storage});
      this.instances.set(name,{storage,state,fetch:(input,init)=>state.fetch(new Request(input,init))});
    }
    return this.instances.get(name);
  }
  async sweep(){
    const name='epiphany-admin',{storage,state}=this.get(name),expires=await storage.getAlarm();
    if(expires!==null&&expires<=Date.now()){await storage.deleteAlarm();await state.alarm();}
  }
  async close(){await this.queue;this.db.close();}
}
