import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,chmod,lstat,unlink,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function backupDatabase(source,destination){
  if(resolve(source)===resolve(destination))throw new Error('Backup must use a different path');
  await mkdir(dirname(destination),{recursive:true,mode:0o700});
  try{await lstat(destination);throw new Error('Backup destination already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const db=new DatabaseSync(source,{readOnly:true});
  try{
    await backup(db,destination);await chmod(destination,0o600);
    const copy=new DatabaseSync(destination,{readOnly:true});
    try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed');}
    finally{copy.close();}
  }catch(error){await unlink(destination).catch(()=>{});throw error;}
  finally{db.close();}
}
if(process.argv[1]&&pathToFileURL(await realpath(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==4)throw new Error('Usage: node vps/backup.mjs SOURCE.sqlite NEW-BACKUP.sqlite');
  process.umask(0o077);await backupDatabase(process.argv[2],process.argv[3]);console.log('Verified SQLite backup created');
}
