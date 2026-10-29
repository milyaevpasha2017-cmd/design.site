import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/password-site.mjs';
import {createSiteWorker} from '../site-worker/src/worker.mjs';
import {repository} from '../site-worker/src/content.mjs';
import {publication} from '../site-worker/src/publication.mjs';

test('every sensitive API route requires a server-side session; login is the documented public exception',async()=>{
  const f=await fixture();
  for(const [method,path]of [['GET','/api/session'],['GET','/api/schema'],['GET','/api/projects'],['GET','/api/export'],['GET','/api/export/archive'],['POST','/api/logout'],['POST','/api/upload'],['GET','/api/pages/home'],['PUT','/api/pages/home'],['GET','/api/projects/warm-minimalism'],['PUT','/api/projects/new-project'],['DELETE','/api/projects/warm-minimalism']]){
    const response=await f.request(path,{method,...(method==='GET'?{}:{body:{}})});
    assert.equal(response.status,401,method+' '+path);
  }
  const user=await f.login();f.env.ADMIN_USERNAME='another-admin';
  assert.equal((await f.request('/api/export',{cookie:user.cookie})).status,401);
});

test('full archive is streamed to an authorized admin without exposing the signed URL or forwarding credentials',async()=>{
  const f=await fixture(),user=await f.login();let calls=0;
  const worker=createSiteWorker(async(input,options)=>{
    calls++;
    if(calls===1){assert.equal(new URL(input).hostname,'api.github.com');assert.equal(options.headers.Authorization,'Bearer '+f.env.GITHUB_CONTENT_TOKEN);return new Response(null,{status:302,headers:{Location:'https://codeload.github.com/owner/site/zip/main?token=synthetic-temporary'}});}
    assert.equal(new URL(input).hostname,'codeload.github.com');assert.equal(options.headers.Authorization,undefined);
    return new Response('synthetic-zip-bytes',{headers:{'Content-Type':'application/zip'}});
  });
  const response=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/export/archive',{headers:{Cookie:user.cookie}}),f.env);
  assert.equal(response.status,200);assert.match(response.headers.get('Content-Disposition'),/epiphany-content.zip/);assert.equal(response.headers.get('Location'),null);assert.equal(await response.text(),'synthetic-zip-bytes');assert.equal(calls,2);
  const rejected=repository(f.env,async()=>new Response(null,{status:302,headers:{Location:'https://other.example/archive'}}));
  await assert.rejects(()=>rejected.archive(),error=>error.status===502);
});

test('writes fail without CSRF/origin and GitHub rejects a read-only content token without publishing',async()=>{
  const f=await fixture(),user=await f.login();
  for(const route of ['/api/upload','/api/pages/home','/api/projects/new-project','/api/logout']){
    assert.equal((await f.request(route,{method:'POST',cookie:user.cookie,body:{}})).status,403,route);
    assert.equal((await f.request(route,{method:'POST',cookie:user.cookie,csrf:user.csrf,origin:'https://other.example',body:{}})).status,403,route);
  }
  const original=f.files.get('content/pages/home.json').content;
  const document=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();document.data.emphasis='Must not be saved';
  const worker=createSiteWorker((input,options)=>options.method==='PUT'?Response.json({message:'Resource not accessible by personal access token'},{status:403}):f.fetcher(input,options));
  const response=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/pages/home',{method:'PUT',headers:{Cookie:user.cookie,Origin:f.env.SITE_ORIGIN,'X-CSRF-Token':user.csrf,'Content-Type':'application/json'},body:JSON.stringify(document)}),f.env);
  assert.equal(response.status,502);assert.equal(f.files.get('content/pages/home.json').content,original);
});

test('apostrophes, composed emoji and RTL text survive save, read, public HTML and authenticated export',async()=>{
  const f=await fixture(),user=await f.login();
  const text="O'Neil · O’Connor 👩🏽‍🎨 — שלום مرحبا";
  const document=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();document.data.emphasis=text;
  assert.equal((await f.request('/api/pages/home',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:document})).status,200);
  assert.equal((await (await f.request('/api/pages/home',{cookie:user.cookie})).json()).data.emphasis,text);
  assert.ok((await (await f.request('/')).text()).includes('O&#x27;Neil'));
  const exported=await f.request('/api/export',{cookie:user.cookie});
  assert.match(exported.headers.get('Content-Disposition'),/attachment/);
  const data=await exported.json();assert.equal(data.content['content/pages/home.json'].emphasis,text);
  assert.equal(data.mediaIncluded,false);assert.match(data.exportedAt,/Z$/);
  const serialized=JSON.stringify(data);assert.ok(!serialized.includes(f.env.GITHUB_CONTENT_TOKEN));assert.ok(!serialized.includes(f.env.ADMIN_PASSWORD_HASH));assert.ok(!serialized.includes(user.csrf));
});

function largeRepository(truncated=false){
  const all=Array.from({length:1005},(_,i)=>({type:'file',name:'project-'+String(i).padStart(4,'0')+'.json',sha:String(i).padStart(40,'a')}));
  const calls=[];
  const fetcher=async input=>{
    const url=new URL(input);calls.push(url.pathname);
    if(url.pathname.endsWith('/contents/content/projects'))return Response.json(all.slice(0,1000));
    if(url.pathname.endsWith('/git/trees/main'))return Response.json({tree:[{type:'tree',path:'content',sha:'content-tree'}],truncated:false});
    if(url.pathname.endsWith('/git/trees/content-tree'))return Response.json({tree:[{type:'tree',path:'projects',sha:'projects-tree'}],truncated:false});
    if(url.pathname.endsWith('/git/trees/projects-tree'))return Response.json({tree:all.map(file=>({type:'blob',path:file.name,sha:file.sha})),truncated});
    throw new Error('Unexpected upstream URL');
  };
  return {fetcher,calls,all};
}

test('GitHub directory limit does not hide project 1001; truncated trees fail explicitly',async()=>{
  const env={CONTENT_REPO:'owner/site',CONTENT_BRANCH:'main',GITHUB_CONTENT_TOKEN:'synthetic'};
  const f=largeRepository();assert.equal((await repository(env,f.fetcher).list()).length,1005);assert.equal(f.calls.length,4);
  await assert.rejects(()=>repository(env,largeRepository(true).fetcher).list(),error=>error.status===502&&error.message.includes('неполный список'));
});

test('all 1005 projects are reachable through explicit cursor pages with a visible total',async()=>{
  const f=await fixture(),user=await f.login(),large=largeRepository();
  const worker=createSiteWorker(large.fetcher),ids=[];let cursor='';
  do{
    const response=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/projects?limit=100'+(cursor?'&cursor='+cursor:''),{headers:{Cookie:user.cookie}}),f.env);
    assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,1005);assert.ok(data.projects.length<=100);
    ids.push(...data.projects.map(project=>project.id));cursor=data.nextCursor;
  }while(cursor);
  assert.equal(ids.length,1005);assert.equal(new Set(ids).size,1005);assert.equal(ids.at(-1),'project-1004');
  assert.equal((await f.request('/api/projects?limit=1001',{cookie:user.cookie})).status,400);
});

test('publication storage traverses more than two 500-record pages without losing Unicode data',async()=>{
  const f=await fixture();
  for(let i=0;i<1005;i++)await publication(f.env,{action:'publish:update',file:`content/projects/project-${String(i).padStart(4,'0')}.json`,sha:String(i),previousSha:null,commit:String(i),data:{title:"O'Neil 👩🏽‍🎨 שלום "+i}});
  const response=await publication(f.env,{action:'publish:read'}),data=await response.json();
  assert.equal(Object.keys(data).length,1005);assert.equal(data['content/projects/project-1004.json'].data.title,"O'Neil 👩🏽‍🎨 שלום 1004");
});

test('public storage failure returns a separate branded 503 page with retry, not internal errors',async()=>{
  const f=await fixture();f.env.ADMIN_STATE.get=()=>({fetch:async()=>{throw new Error('private-storage-details');}});
  const response=await f.request('/');assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'30');
  const body=await response.text();assert.ok(body.includes('Повторить загрузку'));assert.ok(body.includes('<html'));assert.ok(!body.includes('private-storage-details'));
});
