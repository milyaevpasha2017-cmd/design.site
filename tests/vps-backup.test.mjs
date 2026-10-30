import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,lstat,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {dailyBackup} from '../vps/daily-backup.mjs';

test('daily backup restores committed WAL data, protects copies and prunes only after verified success',async()=>{
  const root=await mkdtemp(join(tmpdir(),'epiphany-daily-')),source=join(root,'source.sqlite'),directory=join(root,'backups');
  const db=new DatabaseSync(source);
  try{
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE example (value TEXT);');
    db.prepare('INSERT INTO example VALUES (?)').run("O’Neil 👩🏽‍🎨 שלום");
    await mkdir(directory);
    const old=join(directory,'daily-2000-01-01-11111111-1111-1111-1111-111111111111.sqlite');
    const manual=join(directory,'BEFORE-CUTOVER.sqlite');
    for(const path of [old,manual]){await writeFile(path,'keep until verified');await utimes(path,new Date(0),new Date(0));}
    await assert.rejects(dailyBackup({source:join(root,'missing.sqlite'),directory}));
    assert.ok((await readdir(directory)).includes(old.split('/').at(-1)));
    const result=await dailyBackup({source,directory});
    assert.equal(result.removed,1);assert.ok((await readdir(directory)).includes('BEFORE-CUTOVER.sqlite'));
    assert.equal((await lstat(result.destination)).mode&0o777,0o600);
    assert.equal((await lstat(directory)).mode&0o777,0o700);
    const copy=new DatabaseSync(result.destination,{readOnly:true});
    try{assert.equal(copy.prepare('SELECT value FROM example').get().value,"O’Neil 👩🏽‍🎨 שלום");}finally{copy.close();}
  }finally{db.close();await rm(root,{recursive:true,force:true});}
});
