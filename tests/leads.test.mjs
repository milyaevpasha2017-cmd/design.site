import {LEGAL_VERSION} from '../site-worker/src/legal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SQLiteNamespace} from '../vps/storage.mjs';
import {LeadInbox} from '../vps/leads.mjs';
import {backupDatabase} from '../vps/backup.mjs';
import {fixture} from './helpers/password-site.mjs';
const data=()=>({id:crypto.randomUUID(),name:"O’Neil 👩🏽‍🎨",contact:'@test_customer',message:'<script>alert(1)</script> שלום',website:'',consent:true,consentVersion:LEGAL_VERSION});
async function environment(fn){
  const root=await mkdtemp(join(tmpdir(),'epiphany-leads-'));let ns=new SQLiteNamespace(join(root,'state.sqlite'));
  try{await fn({root,ns,service:(config={},fetcher)=>new LeadInbox(ns.storage('epiphany-leads'),{ADMIN_PASSWORD_HASH:'synthetic-salt',SITE_ORIGIN:'https://studio.example',...config},fetcher)});}
  finally{await ns.close();await rm(root,{recursive:true,force:true});}
}

test('lead API: public submission, private inbox, origin/CSRF, validation and durable backup restore',()=>environment(async({root,ns,service})=>{
  const f=await fixture();f.env.LEADS=service();const request=data();
  assert.equal((await f.request('/api/leads')).status,401);
  assert.equal((await f.request('/api/leads',{method:'POST',origin:'https://attacker.example',body:request})).status,403);
  assert.equal((await f.request('/api/leads',{method:'POST',body:{...request,name:' '}})).status,400);
  assert.equal((await f.request('/api/leads',{method:'POST',body:{...request,contact:'x'}})).status,400);
  assert.equal((await f.request('/api/leads',{method:'POST',body:{...request,website:'spam'}})).status,400);
  const result=await f.request('/api/leads',{method:'POST',body:request});assert.equal(result.status,201);assert.deepEqual(await result.json(),{ok:true,id:request.id});
  assert.equal((await f.request('/api/leads',{method:'POST',body:request})).status,201);
  assert.equal((await f.request('/api/leads',{method:'POST',body:{...request,message:'different'}})).status,409);
  const user=await f.login();const inbox=await (await f.request('/api/leads',{cookie:user.cookie})).json();
  assert.equal(inbox.leads.length,1);assert.equal(inbox.leads[0].message,request.message);assert.equal(inbox.leads[0].fingerprint,undefined);assert.equal(inbox.telegramConfigured,false);
  assert.equal((await f.request('/api/leads/'+request.id,{method:'PUT',cookie:user.cookie,body:{status:'contacted'}})).status,403);
  assert.equal((await f.request('/api/leads/'+request.id,{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:{status:'contacted'}})).status,200);
  const backup=join(root,'backup.sqlite');await backupDatabase(join(root,'state.sqlite'),backup);
  const restored=new SQLiteNamespace(backup);
  try{const saved=await new LeadInbox(restored.storage('epiphany-leads'),{}).list();assert.equal(saved.leads[0].contact,request.contact);assert.equal(saved.leads[0].status,'contacted');}finally{await restored.close();}
  assert.equal((await f.request('/api/leads/'+request.id,{method:'DELETE',cookie:user.cookie,csrf:user.csrf})).status,200);
  assert.equal((await f.env.LEADS.list()).leads.length,0);
}));

test('lead submission: transaction deduplicates concurrent retries and rate limits persist',()=>environment(async({service})=>{
  const inbox=service(),request=data();await Promise.all(Array.from({length:8},()=>inbox.submit(request,'203.0.113.1')));
  assert.equal((await inbox.list()).leads.length,1);
  for(let i=0;i<4;i++)await inbox.submit({...data(),message:''},'203.0.113.1');
  await assert.rejects(inbox.submit(data(),'203.0.113.1'),e=>e.status===429);
  await inbox.submit(data(),'203.0.113.2');
  assert.equal((await inbox.list({limit:2})).leads.length,2);
  const first=await inbox.list({limit:2});const next=await inbox.list({limit:100,cursor:first.nextCursor});
  assert.equal(new Set([...first.leads,...next.leads].map(x=>x.id)).size,6);
}));

test('Telegram retries from durable queue, sends references only and preserves concurrent status edits',()=>environment(async({service,ns})=>{
  const request=data();let calls=0;
  const inbox=service({TELEGRAM_BOT_TOKEN:'synthetic',TELEGRAM_CHAT_ID:'123'},async(url,options)=>{
    calls++;const payload=JSON.parse(options.body);assert.equal(payload.chat_id,'123');assert.ok(!payload.text.includes(request.contact));assert.ok(!payload.text.includes(request.message));assert.ok(!payload.text.includes(request.name));
    assert.match(payload.text,/\/admin\/leads.html#/);
    if(calls===1)return Response.json({ok:false},{status:503});
    await inbox.update(request.id,'contacted');return Response.json({ok:true});
  });
  await inbox.submit(request,'ip');await inbox.notify();let record=(await inbox.list()).leads[0];assert.equal(record.notification.state,'pending');assert.equal(record.notification.attempts,1);
  const storage=ns.storage('epiphany-leads');const key=await storage.get('index:'+request.id);const raw=await storage.get(key);raw.notification.nextAt=0;await storage.put(key,raw);
  await Promise.all([inbox.notify(),inbox.notify()]);record=(await inbox.list()).leads[0];assert.equal(calls,2);assert.equal(record.notification.state,'sent');assert.equal(record.status,'contacted');
  await inbox.notify();assert.equal(calls,2);
}));

test('Telegram outage falls back to current designer email, both-channel failures stay queued',()=>environment(async({service,ns})=>{
  let sent=0;const config={TELEGRAM_BOT_TOKEN:'synthetic',TELEGRAM_CHAT_ID:'123',SMTP_HOST:'smtp.example',SMTP_USER:'test',SMTP_FROM:'sender@example.com',SMTP_PASSWORD_B64:'c3ludGhldGlj'};
  const inbox=new LeadInbox(ns.storage('epiphany-leads'),{...config,ADMIN_PASSWORD_HASH:'salt',SITE_ORIGIN:'https://studio.example'},async()=>{throw new Error('Telegram unavailable');},async(c,message)=>{sent++;assert.equal(message.to,'designer-new@example.com');assert.match(message.text,/@test_customer/);return true;});
  inbox.getContacts=async()=>({email:'designer-new@example.com'});
  await inbox.submit(data(),'ip');await inbox.notify();assert.equal(sent,1);assert.equal((await inbox.list()).leads[0].notification.channel,'email');
  await inbox.notify();assert.equal(sent,1);
  inbox.mailer=async()=>false;await inbox.submit(data(),'ip');await inbox.notify();assert.equal((await inbox.list()).leads.filter(x=>x.notification.state==='pending').length,1);
}));

test('mail recipient follows current contact settings and successful receipts are not resent',()=>environment(async({ns,service})=>{
  const {currentContacts}=await import('../vps/contacts.mjs');
  const f=await fixture();assert.equal((await currentContacts(ns,f.env.SITE_CONTENT)).email,f.env.SITE_CONTENT.content['content/settings.json'].contacts.email);
  const settings=structuredClone(f.env.SITE_CONTENT.content['content/settings.json']);settings.contacts.email='changed@example.com';
  const pub=ns.get('epiphany-published-content');await pub.fetch('https://internal/',{method:'POST',body:JSON.stringify({action:'publish:update',file:'content/settings.json',data:settings,commit:'new-commit',sha:'new-sha'})});
  assert.equal((await currentContacts(ns,f.env.SITE_CONTENT)).email,'changed@example.com');
  const inbox=service();const request=data();await inbox.submit(request,'ip');await inbox.retry(request.id);assert.equal((await inbox.list()).leads[0].notification.attempts,0);
}));

test('personal data consent: strict server validation, immutable text/version/time evidence and idempotency',()=>environment(async({ns,service})=>{
 const inbox=service(),request=data();
 for(const consent of [false,undefined,'true',1])await assert.rejects(inbox.submit({...request,consent},'ip'),e=>e.status===400);
 await assert.rejects(inbox.submit({...request,consentVersion:'outdated'},'ip'),e=>e.status===400);
 assert.equal((await inbox.list()).leads.length,0);
 await inbox.submit(request,'ip');
 const record=(await inbox.list()).leads[0];assert.equal(record.consent.accepted,true);assert.equal(record.consent.version,LEGAL_VERSION);
 assert.equal(record.consent.acceptedAt,record.createdAt);assert.match(record.consent.text,/Миляеву Павлу Сергеевичу/);assert.equal(record.consent.textHash.length,64);
 await inbox.submit(request,'ip');assert.deepEqual((await inbox.list()).leads[0].consent,record.consent);
 assert.ok(!record.consent.text.includes(request.contact));
}));
