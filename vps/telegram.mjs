import {request} from 'node:https';
// Fixed API host, IPv4 resolution, default TLS certificate/hostname verification.
export function telegramFetch(input,options={}){
  const url=new URL(input);
  if(url.origin!=='https://api.telegram.org'||url.username||url.password)throw new Error('Unexpected Telegram host');
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:options.method||'POST',family:4,headers:options.headers,signal:options.signal,timeout:10000},res=>{
      const chunks=[];let length=0;
      res.on('data',chunk=>{length+=chunk.length;if(length>65536){res.destroy(new Error('Telegram response too large'));return;}chunks.push(chunk);});
      res.on('error',()=>reject(new Error('Telegram connection failed')));
      res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });
    req.on('timeout',()=>req.destroy(new Error('Telegram connection timed out')));
    req.on('error',()=>reject(new Error('Telegram connection failed')));
    req.end(options.body);
  });
}
