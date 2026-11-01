import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import config from '../site-worker/src/quiz.json' with {type:'json'};
import {quizResult,quizLeadMessage} from '../quiz-model.mjs';
import {LEGAL_VERSION} from '../site-worker/src/legal.mjs';
import {SQLiteNamespace} from '../vps/storage.mjs';
import {LeadInbox} from '../vps/leads.mjs';
import {fixture} from './helpers/password-site.mjs';
const answers={space:'apartment',mood:'warm',priorities:['cozy','order'],stage:'planning',timing:'quarter',area:'65,5'};
test('quiz: recommendations follow actual choices, all combinations fit the existing lead envelope',()=>{
  for(const space of config.questions[0].options.map(o=>o[0]))for(const mood of Object.keys(config.profiles))for(const stage of Object.keys(config.formats)) {
    const result=quizResult(config,{...answers,space,mood,stage,priorities:config.questions[2].options.map(o=>o[0]),area:'10000'});
    assert.equal(result.profile,config.profiles[mood]);assert.equal(result.format,config.formats[stage]);
    assert.ok(quizLeadMessage(result.message,'я'.repeat(1500)).length<=3000);
    assert.match(result.message,/Заявка из квиза/);assert.equal(result.summary.length,6);
  }
  assert.match(quizResult(config,answers).message,/65\.5 м²/);
  assert.match(quizResult(config,{...answers,area:''}).message,/Пока не указана/);
});
test('quiz: incomplete/unknown choices and invalid area cannot produce a result',()=>{
  for(const invalid of [{mood:'unknown'},{priorities:[]},{priorities:['cozy','cozy']},{priorities:['invalid']},{timing:''},{space:''},{stage:'invalid'},{area:'0'},{area:'10001'},{area:'NaN'},{area:'<script>'}])assert.throws(()=>quizResult(config,{...answers,...invalid}));
  assert.throws(()=>quizLeadMessage('', 'text'));
});
test('quiz: result and complete answers are stored in the private inbox with explicit consent and retry deduplication',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'quiz-lead-')); const ns=new SQLiteNamespace(join(dir,'state.sqlite'));
  try {
    const inbox=new LeadInbox(ns.storage('quiz'),{ADMIN_PASSWORD_HASH:'synthetic',SITE_ORIGIN:'https://studio.example'});
    const f=await fixture();f.env.LEADS=inbox;
    const result=quizResult(config,answers),message=quizLeadMessage(result.message,'Хотим обсудить свет.');
    const request={id:crypto.randomUUID(),name:'Тестовый клиент',contact:'test@example.com',message,website:'',consent:true,consentVersion:LEGAL_VERSION};
    assert.equal((await f.request('/api/leads',{method:'POST',body:{...request,consent:false}})).status,400);
    assert.equal((await f.request('/api/leads',{method:'POST',body:request})).status,201);
    assert.equal((await f.request('/api/leads',{method:'POST',body:request})).status,201);
    const records=await inbox.list();assert.equal(records.leads.length,1);assert.equal(records.leads[0].message,message);assert.equal(records.leads[0].consent.accepted,true);
    assert.equal((await f.request('/api/leads')).status,401);
  } finally {await ns.close();await rm(dir,{recursive:true,force:true});}
});

test('quiz Telegram delivery: current explicit consent sends full result once; ordinary receipts stay private',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'quiz-telegram-'));const ns=new SQLiteNamespace(join(dir,'state.sqlite'));const messages=[];
  try {
    const inbox=new LeadInbox(ns.storage('quiz'),{ADMIN_PASSWORD_HASH:'synthetic',SITE_ORIGIN:'https://studio.example',TELEGRAM_BOT_TOKEN:'synthetic',TELEGRAM_CHAT_ID:'123'},async(url,options)=>{messages.push(JSON.parse(options.body));return Response.json({ok:true});});
    const request={id:crypto.randomUUID(),name:'Synthetic quiz visitor',contact:'test@example.com',message:quizResult(config,answers).message,quizDelivery:true,consent:true,consentVersion:LEGAL_VERSION};
    for(const denied of [{consent:false},{consentVersion:'2026-11-01'}])await assert.rejects(inbox.submit({...request,...denied},'ip'),e=>e.status===400);
    await inbox.submit(request,'ip');await inbox.submit(request,'ip');
    await assert.rejects(inbox.submit({...request,quizDelivery:false},'ip'),e=>e.status===409);
    const record=(await inbox.list()).leads[0];assert.equal(record.source,'quiz');assert.equal(record.consent.telegramContent,true);
    await inbox.notify();await inbox.notify();assert.equal(messages.length,1);
    assert.ok(messages[0].text.includes(request.name));assert.ok(messages[0].text.includes(request.contact));assert.ok(messages[0].text.includes(request.message));assert.ok(messages[0].text.length<4096);assert.equal(messages[0].parse_mode,undefined);
    await inbox.submit({...request,id:crypto.randomUUID(),quizDelivery:false},'ip');await inbox.notify();assert.equal(messages.length,2);
    assert.ok(!messages[1].text.includes(request.name));assert.ok(!messages[1].text.includes(request.contact));assert.ok(!messages[1].text.includes(request.message));
  }finally{await ns.close();await rm(dir,{recursive:true,force:true});}
});
