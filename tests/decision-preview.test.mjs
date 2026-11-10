import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/password-site.mjs';
import {Site} from '../site-worker/src/render.mjs';
import {schema} from '../site-worker/src/content.mjs';

const draft=()=>structuredClone(schema.pages.find(p=>p.id==='home').fields.find(f=>f.name==='decisions').default);

test('section preview uses the public renderer and current fonts without publishing the draft',async()=>{
  const f=await fixture(),user=await f.login(),data=draft();
  const before=JSON.stringify([...f.files]),snapshot=JSON.stringify(f.env.SITE_CONTENT);
  data.title='Черновик **заголовка**';data.image_note='';data.light.description='<script>alert(1)</script> Свет';
  const response=await f.request('/api/preview/decisions',{method:'POST',cookie:user.cookie,csrf:user.csrf,body:{data}});
  assert.equal(response.status,200,await response.clone().text());
  const preview=await response.json(),content=structuredClone(f.env.SITE_CONTENT.content);
  content['content/pages/home.json'].decisions=data;
  assert.equal(preview.html,new Site(content,f.env.SITE_ORIGIN,'').decisions());
  assert.match(preview.html,/<strong>заголовка<\/strong>/);assert.ok(!preview.html.includes('<script>'));
  assert.match(preview.html,/decision-pin/);assert.match(preview.html,/decision-materials/);
  assert.equal(JSON.stringify([...f.files]),before);assert.equal(JSON.stringify(f.env.SITE_CONTENT),snapshot);
  assert.equal(f.requests.filter(r=>r.method!=='GET').length,0);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('preview requires a session, same origin, CSRF and valid section data',async()=>{
  const f=await fixture(),user=await f.login(),body={data:draft()};
  const request=options=>f.request('/api/preview/decisions',{method:'POST',body,...options});
  assert.equal((await request({})).status,401);
  assert.equal((await request({cookie:user.cookie})).status,403);
  assert.equal((await request({cookie:user.cookie,csrf:user.csrf,origin:'https://other.example'})).status,403);
  assert.equal((await request({cookie:user.cookie,csrf:user.csrf,body:{data:{unknown:'bad'}}})).status,400);
  assert.equal((await request({cookie:user.cookie,csrf:user.csrf,body:{data:{title:[]}}})).status,400);
});

test('preview includes freshly published typography and does not expose it to anonymous visitors',async()=>{
  const f=await fixture(),user=await f.login();
  const settings=await (await f.request('/api/pages/settings',{cookie:user.cookie})).json();
  settings.data.typography={body:'onest',display:'literata'};
  const saved=await f.request('/api/pages/settings',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:settings});
  assert.equal(saved.status,200);
  const result=await (await f.request('/api/preview/decisions',{method:'POST',cookie:user.cookie,csrf:user.csrf,body:{data:draft()}})).json();
  assert.equal(result.bodyFont,'onest');assert.equal(result.displayFont,'literata');
});

