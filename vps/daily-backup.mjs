import {mkdir,lstat,chmod,readdir,unlink,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {backupDatabase} from './backup.mjs';

export async function dailyBackup({source='/var/lib/epiphany/state.sqlite',directory='/var/backups/epiphany',now=Date.now()}={}){
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid())throw new Error('Backup directory must be owned by the backup operator and must not be a symlink');
  await chmod(directory,0o700);
  const destination=join(directory,`daily-${new Date(now).toISOString().slice(0,10)}-${randomUUID()}.sqlite`);
  await backupDatabase(source,destination);
  // Only rotate recognized files after a new snapshot passed integrity_check.
  let removed=0;
  for(const name of await readdir(directory)){
    if(!/^daily-\d{4}-\d{2}-\d{2}-[a-f0-9-]{36}\.sqlite$/.test(name))continue;
    const file=join(directory,name),entry=await lstat(file);
    if(file!==destination&&entry.isFile()&&!entry.isSymbolicLink()&&entry.mtimeMs<now-30*86400000){await unlink(file);removed++;}
  }
  return {destination,removed};
}
if(process.argv[1]&&await realpath(process.argv[1])===fileURLToPath(import.meta.url)){
  process.umask(0o077);
  const result=await dailyBackup();
  console.log(`Verified daily SQLite backup created; expired copies removed: ${result.removed}`);
}
