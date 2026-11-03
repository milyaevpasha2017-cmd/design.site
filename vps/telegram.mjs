import {spawn} from 'node:child_process';
export function telegramRequestPlan(input,options={},config={}){
  const url=new URL(input);
  if(url.origin!=='https://api.telegram.org'||url.username||url.password||!url.pathname.startsWith('/bot'))throw new Error('Unexpected Telegram host');
  const quote=value=>JSON.stringify(value);
  let target=url.href,authorization='';
  if(config.TELEGRAM_RELAY_URL){
    const relay=new URL(config.TELEGRAM_RELAY_URL);
    if(relay.protocol!=='https:'||!/^epiphany-telegram-relay\.[a-z0-9-]+\.workers\.dev$/.test(relay.hostname)||relay.port||relay.username||relay.password||relay.pathname!=='/'||relay.search||relay.hash)throw new Error('Invalid Telegram relay origin');
    const match=url.pathname.match(/^\/bot([^/]+)\/(sendMessage|getMe)$/);
    if(!match||url.search||url.hash)throw new Error('Unexpected Telegram method');
    target=relay.origin+'/'+match[2];
    authorization='header = '+quote('Authorization: Bearer '+match[1])+'\n';
  }
  return {args:['--disable','-4','--silent','--show-error','--connect-timeout','10','--max-time','20','--max-filesize','1048576','--proto','=https','--config','-','--write-out','\n%{http_code}'],input:'url = '+quote(target)+'\nrequest = "POST"\nheader = "Content-Type: application/json"\ndata = '+quote(options.body||'{}')+'\n'+authorization};
}
// Use the HTTPS transport verified on the VPS. Never expose the URL token in argv/logs.
export function telegramFetch(input,options={},config={}){
  const plan=telegramRequestPlan(input,options,config);
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/curl',plan.args,{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['pipe','pipe','ignore']});
    const chunks=[];let length=0,done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);error?reject(Object.assign(new Error('Telegram connection failed'),{code:error==='timeout'?'TELEGRAM_TIMEOUT':'TELEGRAM_NETWORK'})):resolve(result);};
    const abort=()=>{child.kill('SIGKILL');finish('timeout');};
    const timer=setTimeout(abort,23000);timer.unref();
    child.stdout.on('data',chunk=>{length+=chunk.length;if(length>1049000){abort();return;}chunks.push(chunk);});
    child.on('error',()=>finish(true));
    child.on('close',code=>{
      if(code!==0){finish(code===28?'timeout':true);return;}
      try{const raw=Buffer.concat(chunks).toString('utf8'),split=raw.lastIndexOf('\n'),status=Number(raw.slice(split+1));if(split<0||status<200||status>599)throw new Error();finish(false,new Response(raw.slice(0,split),{status,headers:{'Content-Type':'application/json'}}));}catch{finish(true);}
    });
    child.stdin.on('error',()=>{});
    if(options.signal?.aborted){abort();return;}
    options.signal?.addEventListener('abort',abort,{once:true});
    child.stdin.end(plan.input);
  });
}
