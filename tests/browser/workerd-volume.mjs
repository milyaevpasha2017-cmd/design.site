// Synthetic volume check in the native runtime, never in the live account.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fixture,passwordHash,TEST_PASSWORD} from '../helpers/password-site.mjs';

const require=createRequire(new URL('../../site-worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://studio.example',count=1005,sha='a'.repeat(40);
const entries=Array.from({length:count},(_,i)=>({name:'volume-'+String(i).padStart(4,'0')+'.json',type:'file',sha}));
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{
  name:'site',modules:true,script:readFileSync(process.argv[2]||'/tmp/epiphany-worker-bundle/entry.js','utf8'),compatibilityDate:'2026-10-01',
  durableObjects:{ADMIN_STATE:{className:'AdminState',useSQLite:true}},
  bindings:{SITE_ORIGIN:origin,CONTENT_REPO:'owner/site',CONTENT_BRANCH:'main',ADMIN_USERNAME:'admin',ADMIN_PASSWORD_HASH:await passwordHash(),GITHUB_CONTENT_TOKEN:'synthetic-volume-token'},
  outboundService:request=>{
    const path=new URL(request.url).pathname;
    if(path.endsWith('/contents/content/projects'))return Response.json(entries.slice(0,1000));
    if(path.endsWith('/git/trees/main'))return Response.json({tree:[{type:'tree',path:'content',sha:'content'}]});
    if(path.endsWith('/git/trees/content'))return Response.json({tree:[{type:'tree',path:'projects',sha:'projects'}]});
    if(path.endsWith('/git/trees/projects'))return Response.json({tree:entries.map(entry=>({type:'blob',path:entry.name,sha})),truncated:false});
    return Response.json({error:'Unexpected synthetic upstream'},{status:500});
  },
}]}));
try{
  const seed=await fixture(),project=JSON.parse(seed.files.get('content/projects/warm-minimalism.json').content);
  const namespace=await mf.getDurableObjectNamespace('ADMIN_STATE','site'),stub=namespace.get(namespace.idFromName('epiphany-published-content'));
  for(let i=0;i<count;i++){
    const id='volume-'+String(i).padStart(4,'0'),data={...project,slug:id,title:"Проект O'Neil 👩🏽‍🎨 "+i,order:i+10};
    const response=await stub.fetch('https://internal/',{method:'POST',body:JSON.stringify({action:'publish:update',file:'content/projects/'+id+'.json',sha,previousSha:null,commit:'synthetic-'+i,data})});
    assert.equal(response.status,200);await response.text();
  }
  const login=await mf.dispatchFetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:TEST_PASSWORD})});
  assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];await login.text();
  const timings={};
  for(const route of ['/','/projects/','/api/projects?limit=100']){
    const samples=[];let bytes=0;
    for(let i=0;i<6;i++){
      const start=performance.now(),response=await mf.dispatchFetch(origin+route,{headers:{Cookie:cookie}});
      assert.equal(response.status,200);const body=await response.text();bytes=Buffer.byteLength(body);samples.push(performance.now()-start);
      if(route.startsWith('/api/')){const data=JSON.parse(body);assert.equal(data.total,count);assert.equal(data.projects.length,100);assert.ok(data.nextCursor);assert.ok(data.projects.every(p=>p.title));}
    }
    samples.sort((a,b)=>a-b);timings[route]={medianMs:Number(samples[3].toFixed(2)),maxMs:Number(samples.at(-1).toFixed(2)),bytes};
  }
  const result={runtime:'local workerd + native SQLite Durable Object',syntheticProjects:count,measure:'wall time, six sequential local requests; not production CPU or regional network latency',timings};
  if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await mf.dispose();}
