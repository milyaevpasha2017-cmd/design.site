import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fixture,sourceSnapshot} from './helpers/password-site.mjs';
import {currentContent,publication} from '../site-worker/src/publication.mjs';
import {Site} from '../site-worker/src/render.mjs';

test('live renderer preserves every static page, including gallery, videos and form data',async()=>{
  const snapshot=await sourceSnapshot();
  const pages=JSON.parse(execFileSync('python3',['-c',`
import contextlib,io,json,tempfile
from scripts.build import build,ROOT
with tempfile.TemporaryDirectory() as output:
    with contextlib.redirect_stdout(io.StringIO()): pages=build(ROOT/'content',output,'https://studio.example/')
print(json.dumps(pages))
  `],{encoding:'utf8'}));
  const site=new Site(snapshot.content,'https://studio.example',snapshot.icons);
  const normalize=html=>html.replace(/(<script[^>]+type="application\/json">)([\s\S]*?)(<\/script>)/g,(_,a,json,b)=>a+JSON.stringify(JSON.parse(json))+b);
  for(const [file,expected]of Object.entries(pages)){
    const path='/'+file.replace(/index\.html$/,'');
    const response=site.response(path);
    assert.equal(normalize(await response.text()),normalize(expected),file);
  }
});

test('saved text and settings are public immediately, without rebuilding or exposing credentials',async()=>{
  const f=await fixture(),user=await f.login();
  const document=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();
  document.data.emphasis='Новый текст без ожидания <script>alert(1)</script>';
  let result=await f.request('/api/pages/home',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:document});
  assert.equal((await result.json()).published,true);
  let page=await f.request('/');let html=await page.text();
  assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');
  assert.ok(html.includes('Новый текст без ожидания &lt;script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('server-only-test-token'));assert.ok(!html.includes('pbkdf2'));
  const settings=await (await f.request('/api/pages/settings',{cookie:user.cookie})).json();
  settings.data.footer_tagline='Новый подвал на всех страницах';
  result=await f.request('/api/pages/settings',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:settings});
  assert.equal((await result.json()).published,true);
  for(const route of ['/','/about/','/projects/','/contact/'])assert.ok((await (await f.request(route)).text()).includes(settings.data.footer_tagline));
});

test('project creation, unpublishing and deletion update listings, routes and sitemap immediately',async()=>{
  const f=await fixture(),user=await f.login();
  const data=JSON.parse(f.files.get('content/projects/warm-minimalism.json').content);
  data.slug='instant-project';data.title='Проект без ожидания';data.published=true;
  const options={method:'PUT',cookie:user.cookie,csrf:user.csrf,body:{data,sha:null}};
  const created=await (await f.request('/api/projects/instant-project',options)).json();
  assert.equal(created.published,true);
  assert.ok((await (await f.request('/projects/')).text()).includes(data.title));
  assert.equal((await f.request('/projects/instant-project/')).status,200);
  assert.ok((await (await f.request('/sitemap.xml')).text()).includes('/projects/instant-project/'));
  data.published=false;options.body.sha=created.sha;
  const hidden=await (await f.request('/api/projects/instant-project',options)).json();
  assert.equal(hidden.published,true);
  assert.equal((await f.request('/projects/instant-project/')).status,404);
  assert.ok(!(await (await f.request('/projects/')).text()).includes(data.title));
  const deleted=await (await f.request('/api/projects/instant-project',{method:'DELETE',cookie:user.cookie,csrf:user.csrf,body:{sha:hidden.sha}})).json();
  assert.equal(deleted.published,true);
  assert.equal((await f.request('/projects/instant-project/')).status,404);
  // A statically deployed older project must also disappear immediately.
  const old=await (await f.request('/api/projects/warm-minimalism',{cookie:user.cookie})).json();
  await f.request('/api/projects/warm-minimalism',{method:'DELETE',cookie:user.cookie,csrf:user.csrf,body:{sha:old.sha}});
  assert.equal((await f.request('/projects/warm-minimalism/')).status,404);
});

test('new photos are public before Static Assets deployment and are chunked below DO value limits',async()=>{
  const f=await fixture(),user=await f.login();
  f.env.ASSETS.fetch=async()=>new Response('Not found',{status:404});
  const bytes=new Uint8Array(220000);bytes.set([137,80,78,71,13,10,26,10]);
  const content=Buffer.from(bytes).toString('base64');
  const upload=await (await f.request('/api/upload',{method:'POST',cookie:user.cookie,csrf:user.csrf,body:{content}})).json();
  assert.equal(upload.published,true);
  const photo=await f.request('/'+upload.path);
  assert.equal(photo.status,200);assert.equal(photo.headers.get('Content-Type'),'image/png');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),bytes);
  assert.match(photo.headers.get('Cache-Control'),/immutable/);
  for(const [key,value]of f.storage.data)if(key.startsWith('media:'))assert.ok(JSON.stringify(value).length<128000);
});

test('newer edits survive in-flight deployments, and later GitHub changes become the baseline',()=>{
  const old={'content/pages/home.json':{title:'A'}};
  const records={'content/pages/home.json':{data:{title:'C'},commit:'commit-c'}};
  assert.equal(currentContent({content:old,commits:['commit-a']},records)['content/pages/home.json'].title,'C');
  assert.equal(currentContent({content:old,commits:['commit-b','commit-a']},records)['content/pages/home.json'].title,'C');
  const newer={'content/pages/home.json':{title:'D'}};
  assert.equal(currentContent({content:newer,commits:['commit-d','commit-c','commit-b','commit-a']},records)['content/pages/home.json'].title,'D');
});

test('repository saves stay successful with a clear fallback if immediate publication fails',async()=>{
  const f=await fixture(),user=await f.login();
  const original=f.env.ADMIN_STATE.get;
  f.env.ADMIN_STATE.get=()=>({fetch:async(input,options)=>{
    if(JSON.parse(options.body).action.startsWith('publish:'))throw new Error('Temporary storage outage');
    return original().fetch(input,options);
  }});
  const document=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();
  document.data.emphasis='Сохранено даже при временном сбое';
  const response=await f.request('/api/pages/home',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:document});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.published,false);
  assert.equal(JSON.parse(f.files.get('content/pages/home.json').content).emphasis,document.data.emphasis);
  assert.equal(result.sha,f.files.get('content/pages/home.json').sha);
});

test('large page content is published in chunks, and shorter revisions remove leftover chunks',async()=>{
  const f=await fixture(),user=await f.login();
  const document=await (await f.request('/api/pages/about',{cookie:user.cookie})).json();
  document.data.paragraphs=Array.from({length:6},(_,i)=>String(i)+'я'.repeat(14000));
  const result=await (await f.request('/api/pages/about',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:document})).json();
  assert.equal(result.published,true);
  assert.ok((await (await f.request('/about/')).text()).includes(document.data.paragraphs[5]));
  for(const [key,value]of f.storage.data)if(key.startsWith('document:'))assert.ok(Buffer.byteLength(JSON.stringify(value))<128000);
  document.sha=result.sha;document.data.paragraphs=['Короткий текст'];
  assert.equal((await (await f.request('/api/pages/about',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:document})).json()).published,true);
  assert.equal([...f.storage.data.keys()].filter(key=>key.startsWith('document:content/pages/about.json:')).length,1);
});

test('out-of-order publications cannot undo newer writes, but deliberate reversions and recreation work',async()=>{
  const f=await fixture();
  const update=async(sha,previousSha,data)=>publication(f.env,{action:'publish:update',file:'content/projects/race.json',sha,previousSha,data,commit:sha||'deleted'});
  const read=async()=> (await (await publication(f.env,{action:'publish:read'})).json())['content/projects/race.json'].data;
  await update('c','b',{title:'C'});await update('b','a',{title:'B'});
  assert.equal((await read()).title,'C');
  await update('b','c',{title:'B'});assert.equal((await read()).title,'B');
  await update(null,'b',null);assert.equal(await read(),null);
  await update('new',null,{title:'Recreated'});await update(null,'b',null);
  assert.equal((await read()).title,'Recreated');
  assert.equal(await f.storage.getAlarm(),null,'Persistent content must not start the session cleanup alarm.');
});
