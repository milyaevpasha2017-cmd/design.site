import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../site-worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const source=readFileSync(new URL('../../telegram-relay/worker.mjs',import.meta.url),'utf8');
const token='12345:synthetic_token_for_runtime_test';
let calls=0,redirect=false;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{
 name:'relay',modules:true,script:source,compatibilityDate:'2026-10-01',
 bindings:{TELEGRAM_BOT_TOKEN:token,TELEGRAM_CHAT_ID:'653315064'},
 outboundService:async request=>{
  calls++;if(redirect)return new Response(null,{status:302,headers:{Location:"https://other.example/token-must-not-follow"}});assert.equal(new URL(request.url).origin,'https://api.telegram.org');
  return Response.json({ok:true,result:{id:12345,username:'epiphany_int_bot'}});
 }
}]}));
try{
 const response=await mf.dispatchFetch('https://relay.example/getMe',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'
 });
 assert.equal(response.status,200,await response.clone().text());
 assert.equal((await response.json()).result.username,'epiphany_int_bot');
 assert.equal(calls,1,'Native workerd fetch must actually reach the upstream.');
 redirect=true;
 const rejected=await mf.dispatchFetch('https://relay.example/getMe',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
 assert.equal(rejected.status,502);assert.equal((await rejected.json()).stage,'telegram_redirect');assert.equal(calls,2);
 console.log('PASS: real workerd fetch reaches Telegram upstream through the relay.');
}finally{await mf.dispose();}
