import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {passwordHash,TEST_PASSWORD} from '../helpers/password-site.mjs';

const require=createRequire(new URL('../../site-worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://studio.example';
const home=JSON.parse(readFileSync(new URL('../../content/pages/home.json',import.meta.url),'utf8'));
let storedHome=structuredClone(home),revision='a'.repeat(40),redirectProjects=false;
const upstreamRequests=[];

// Mock only the remote GitHub service. The compiled Worker still uses native
// workerd fetch, including its redirect handling, headers and request bodies.
async function github(request){
  const url=new URL(request.url);
  upstreamRequests.push({url:request.url,method:request.method});
  assert.equal(url.origin,'https://api.github.com','Credentials must never follow a redirect to another host.');
  assert.equal(request.headers.get('Authorization'),'Bearer test-only-do-not-use');
  assert.equal(url.searchParams.get('ref'),request.method==='GET'?'main':null);
  if(url.pathname==='/repos/owner/site/contents/content/projects'){
    if(redirectProjects)return new Response(null,{status:302,headers:{Location:'https://untrusted.example/content'}});
    return Response.json([{type:'file',name:'sample-project.json',sha:'c'.repeat(40)}]);
  }
  assert.equal(url.pathname,'/repos/owner/site/contents/content/pages/home.json');
  if(request.method==='GET')return Response.json({type:'file',sha:revision,content:Buffer.from(JSON.stringify(storedHome)).toString('base64')});
  assert.equal(request.method,'PUT');
  const body=await request.json();
  assert.equal(body.branch,'main');
  assert.equal(body.sha,revision);
  storedHome=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
  revision='b'.repeat(40);
  return Response.json({content:{sha:revision}});
}

const mf=new Miniflare(convertV4MiniflareOptions({workers:[{
  name:'site',modules:true,
  script:readFileSync(process.argv[2]||'/tmp/epiphany-worker-bundle/entry.js','utf8'),
  compatibilityDate:'2026-10-01',
  durableObjects:{ADMIN_STATE:{className:'AdminState',useSQLite:true}},
  bindings:{SITE_ORIGIN:origin,CONTENT_REPO:'owner/site',CONTENT_BRANCH:'main',ADMIN_USERNAME:'admin',ADMIN_PASSWORD_HASH:await passwordHash(),GITHUB_CONTENT_TOKEN:'test-only-do-not-use'},
  outboundService:github,
}]}));

try{
  const response=await mf.dispatchFetch(origin+'/api/login',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({username:'admin',password:TEST_PASSWORD}),
  });
  assert.equal(response.status,200,await response.text());
  const cookie=response.headers.get('Set-Cookie').split(';')[0];
  const session=await mf.dispatchFetch(origin+'/api/session',{headers:{Cookie:cookie}});
  assert.equal(session.status,200);
  const user=await session.json();
  assert.ok(user.csrf);

  const projects=await mf.dispatchFetch(origin+'/api/projects',{headers:{Cookie:cookie}});
  assert.equal(projects.status,200,await projects.clone().text());
  assert.equal((await projects.json()).projects[0].id,'sample-project');
  const page=await mf.dispatchFetch(origin+'/api/pages/home',{headers:{Cookie:cookie}});
  assert.equal(page.status,200,await page.clone().text());
  const document=await page.json();
  assert.deepEqual(document.data,home);
  document.data.emphasis+=' проверка сохранения';
  const save=await mf.dispatchFetch(origin+'/api/pages/home',{
    method:'PUT',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':user.csrf},
    body:JSON.stringify(document),
  });
  assert.equal(save.status,200,await save.clone().text());
  assert.equal((await save.json()).sha,revision);
  const reload=await mf.dispatchFetch(origin+'/api/pages/home',{headers:{Cookie:cookie}});
  assert.equal((await reload.json()).data.emphasis,document.data.emphasis);

  redirectProjects=true;
  const before=upstreamRequests.length;
  const redirect=await mf.dispatchFetch(origin+'/api/projects',{headers:{Cookie:cookie}});
  assert.equal(redirect.status,502,await redirect.clone().text());
  assert.equal(upstreamRequests.length,before+1,'Upstream redirects must not be followed.');
  assert.ok(!(await redirect.text()).includes('test-only-do-not-use'));

  const logout=await mf.dispatchFetch(origin+'/api/logout',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':user.csrf},body:'{}',
  });
  assert.equal(logout.status,200);
  const expired=await mf.dispatchFetch(origin+'/api/session',{headers:{Cookie:cookie}});
  assert.equal(expired.status,401);
  console.log('PASS: native workerd + SQLite sessions, GitHub project/page loading, saving, redirect rejection and logout revocation.');
}finally{
  await mf.dispose();
}
