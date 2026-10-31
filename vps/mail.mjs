import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function mailConfigured(config){return Boolean(config.SMTP_HOST&&config.SMTP_USER&&config.SMTP_PASSWORD_B64&&config.SMTP_FROM);}
export function sendMail(config,message){
  return new Promise(resolve=>{
    const env={PATH:'/usr/bin:/bin',LANG:'C.UTF-8'};
    for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD_B64','SMTP_FROM'])if(config[key])env[key]=config[key];
    const child=spawn('/usr/bin/python3',[fileURLToPath(new URL('./send_mail.py',import.meta.url))],{env,stdio:['pipe','ignore','ignore']});
    const timer=setTimeout(()=>{child.kill('SIGKILL');resolve(false);},25000);timer.unref();
    child.on('error',()=>{clearTimeout(timer);resolve(false);});
    child.on('close',code=>{clearTimeout(timer);resolve(code===0);});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(message));
  });
}
