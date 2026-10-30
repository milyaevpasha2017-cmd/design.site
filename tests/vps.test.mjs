import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {application,httpServer} from '../vps/server.mjs';
import {SQLiteNamespace} from '../vps/storage.mjs';
import {backupDatabase} from '../vps/backup.mjs';
import {fixture,TEST_PASSWORD} from './helpers/password-site.mjs';

test('VPS: real HTTP, trusted HTTPS proxy, login, publication, restart and backup restore',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'epiphany-vps-'));let app,server;
  try{
    const f=await fixture(),assets=join(dir,'public');await mkdir(join(assets,'admin/login'),{recursive:true});
    await writeFile(join(assets,'admin/login/index.html'),'LOGIN');await writeFile(join(assets,'admin/index.html'),'EDITOR');
    await writeFile(join(assets,'admin/formatting.mjs'),'export const formatting = true;');
    await writeFile(join(assets,'rich-text.mjs'),'export const richText = true;');
    await writeFile(join(dir,'secret.txt'),'private');await symlink(join(dir,'secret.txt'),join(assets,'outside.txt'));
    const snapshot=join(dir,'snapshot.json');await writeFile(snapshot,JSON.stringify(f.env.SITE_CONTENT));
    const config={...f.env,DATABASE_PATH:join(dir,'state.sqlite'),ASSETS_PATH:assets,SNAPSHOT_PATH:snapshot};
    app=await application(config,{fetcher:f.fetcher});server=httpServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    const request=(path,options={})=>new Promise((resolve,reject)=>{
      const req=httpRequest(base+path,{method:options.method||'GET',headers:{Host:'studio.example','X-Forwarded-Proto':'https','X-Real-IP':'203.0.113.4',...options.headers}},response=>{
        const parts=[];response.on('data',part=>parts.push(part));response.on('error',reject);response.on('end',()=>resolve(new Response(Buffer.concat(parts),{status:response.statusCode,headers:response.headers})));
      });req.on('error',reject);req.end(options.body);
    });
    assert.equal((await request('/healthz')).status,200);
    assert.equal((await request('/api/session',{headers:{Host:'attacker.example'}})).status,400);
    assert.equal((await request('/api/session',{headers:{'X-Forwarded-Proto':'http'}})).status,400);
    assert.equal((await request('/api/schema')).status,401);
    assert.equal((await request('/admin/')).headers.get('location'),'/admin/login/');
    assert.equal(await(await request('/admin/login/')).text(),'LOGIN');
    assert.equal((await request('/outside.txt')).status,404);
    const login=await request('/api/login',{method:'POST',headers:{Origin:config.SITE_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:TEST_PASSWORD})});
    assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    for(const path of ['/admin/formatting.mjs','/rich-text.mjs']){
      const module=await request(path,{headers:{Cookie:cookie}});
      assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/^text\/javascript\b/);
      assert.equal(module.headers.get('x-content-type-options'),'nosniff');assert.match(await module.text(),/^export const/);
    }
    const session=await(await request('/api/session',{headers:{Cookie:cookie}})).json();
    const record=await(await request('/api/pages/home',{headers:{Cookie:cookie}})).json();
    const title="VPS · O'Neil 👩🏽‍🎨 שלום";record.data.title=title;
    const saved=await request('/api/pages/home',{method:'PUT',headers:{Cookie:cookie,Origin:config.SITE_ORIGIN,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:JSON.stringify(record)});
    assert.equal(saved.status,200);assert.equal((await saved.json()).published,true);
    assert.match(await(await request('/')).text(),/VPS · O&#(?:x27|39);Neil/);
    const exported=await(await request('/api/export',{headers:{Cookie:cookie}})).json();assert.equal(exported.content['content/pages/home.json'].title,title);
    const photo='iVBORw0KGgo=';
    await app.namespace.get('epiphany-published-content').fetch('https://internal/',{method:'POST',body:JSON.stringify({action:'publish:upload',path:'assets/uploads/test.png',sha:'abc',content:photo,type:'image/png'})});
    // Snapshot backup is safe with the source open in WAL mode.
    const backup=join(dir,'backup.sqlite');await backupDatabase(config.DATABASE_PATH,backup);
    await assert.rejects(backupDatabase(config.DATABASE_PATH,backup),/already exists/);
    const backupCLI=join(dir,'backup.mjs');await symlink(new URL('../vps/backup.mjs',import.meta.url),backupCLI);
    const command=await promisify(execFile)(process.execPath,[backupCLI,config.DATABASE_PATH,join(dir,'cli-copy.sqlite')]);
    assert.match(command.stdout,/Verified SQLite backup created/);
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;await app.namespace.close();app=null;
    const restored=await application({...config,DATABASE_PATH:backup},{fetcher:f.fetcher});app=restored;
    const get=(path)=>app.fetch(new Request(config.SITE_ORIGIN+path,{headers:{Cookie:cookie}}));
    assert.equal((await get('/api/session')).status,200);
    assert.equal((await(await get('/api/export')).json()).content['content/pages/home.json'].title,title);
    assert.equal(Buffer.from(await(await get('/assets/uploads/test.png')).arrayBuffer()).toString('base64'),photo);
    const logout=await app.fetch(new Request(config.SITE_ORIGIN+'/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:config.SITE_ORIGIN,'X-CSRF-Token':session.csrf}}));assert.equal(logout.status,200);
    assert.equal((await get('/api/session')).status,401);
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await app?.namespace.close();await rm(dir,{recursive:true,force:true});}
});

test('SQLite: serial transactions, rollback, namespace isolation and range pagination',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'epiphany-storage-'));const namespace=new SQLiteNamespace(join(dir,'state.sqlite'));
  try{
    const storage=namespace.storage('one'),other=namespace.storage('two');
    await storage.put('count',0);
    await Promise.all(Array.from({length:20},()=>storage.transaction(async tx=>{const count=await tx.get('count');await new Promise(resolve=>setTimeout(resolve,1));await tx.put('count',count+1);} )));
    assert.equal(await storage.get('count'),20);assert.equal(await other.get('count'),undefined);
    await assert.rejects(storage.transaction(async tx=>{await tx.put('count',99);throw new Error('rollback');}));assert.equal(await storage.get('count'),20);
    await storage.transaction(async tx=>{for(let i=0;i<1005;i++)await tx.put('content:'+String(i).padStart(4,'0'),{i});});
    const all=[];let cursor;do{const page=await storage.list({prefix:'content:',limit:500,startAfter:cursor});all.push(...page.keys());if(page.size<500)break;cursor=[...page.keys()].at(-1);}while(cursor);
    assert.equal(all.length,1005);assert.equal(new Set(all).size,1005);
    const expired=namespace.get('epiphany-admin').storage;await expired.put('session:expired',{expires:0});await expired.setAlarm(1);await namespace.sweep();assert.equal(await expired.get('session:expired'),undefined);
  }finally{await namespace.close();await rm(dir,{recursive:true,force:true});}
});

test('SQLite schema migration and down SQL run on a disposable empty database',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(await readFile(new URL('../vps/sql/001-up.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);
    db.exec(await readFile(new URL('../vps/sql/001-down.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,0);
    assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table'").get().count,0);
  }finally{db.close();}
});
