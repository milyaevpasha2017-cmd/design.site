import test from 'node:test';
import assert from 'node:assert/strict';
import {createRelay} from '../telegram-relay/worker.mjs';
const env={TELEGRAM_BOT_TOKEN:'12345:test_only_not_a_real_token',TELEGRAM_CHAT_ID:'653315064'};
const request=(path='/sendMessage',body={chat_id:env.TELEGRAM_CHAT_ID,text:'Новая заявка'},extra={})=>new Request('https://relay.example'+path,{method:'POST',headers:{Authorization:'Bearer '+env.TELEGRAM_BOT_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),...extra});
test('relay rejects unauthenticated calls, arbitrary methods, wrong recipient and oversized payloads without contacting Telegram',async()=>{
 let calls=0;const worker=createRelay(()=>{calls++;throw new Error();});
 for(const [req,status] of [[request('/sendMessage',{}, {headers:{}}),401],[request('/deleteWebhook'),404],[request('/getMe?token=leak'),404],[request('/sendMessage',{chat_id:'other',text:'test'}),400],[request('/sendMessage',{chat_id:env.TELEGRAM_CHAT_ID,text:'a'.repeat(4097)}),400],[request('/getMe',{ignored:'a'.repeat(17000)}),400],[new Request('https://relay.example/sendMessage'),405]])assert.equal((await worker.fetch(req,env)).status,status);
 assert.equal((await worker.fetch(request(),{})).status,503);assert.equal(calls,0);
});
test('relay forwards only approved fields to fixed Telegram bot and does not echo client details',async()=>{
 const worker=createRelay(async(url,options)=>{
  assert.equal(url,'https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage');
  assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{'Content-Type':'application/json'});
  assert.deepEqual(JSON.parse(options.body),{chat_id:env.TELEGRAM_CHAT_ID,text:'Новая заявка',link_preview_options:{is_disabled:true}});
  return Response.json({ok:true,result:{text:'private',chat:{id:123}}});
 });
 const response=await worker.fetch(request('/sendMessage',{chat_id:env.TELEGRAM_CHAT_ID,text:'Новая заявка',parse_mode:'HTML',reply_markup:{}}),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(await response.json(),{ok:true,result:true});
});
test('relay verifies bot identity without sending messages and preserves rate-limit backoff',async()=>{
 const worker=createRelay(async(url)=>{assert.ok(url.endsWith('/getMe'));return Response.json({ok:true,result:{id:1,username:'epiphany_int_bot',extra:'omit'}});});
 assert.deepEqual(await (await worker.fetch(request('/getMe',{}),env)).json(),{ok:true,result:{id:1,username:'epiphany_int_bot'}});
 const limited=createRelay(async()=>Response.json({ok:false,error_code:429,parameters:{retry_after:91},description:'sensitive'},{status:429}));
 const response=await limited.fetch(request(),env);assert.equal(response.status,429);assert.deepEqual(await response.json(),{ok:false,error_code:429,stage:'telegram_api',parameters:{retry_after:91}});
 const timeout=createRelay(async()=>{throw new Error('token must not leak');});assert.deepEqual(await (await timeout.fetch(request(),env)).json(),{ok:false,error_code:504});
});
