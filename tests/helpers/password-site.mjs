import {createSiteWorker} from '../../site-worker/src/worker.mjs';
import {AdminState} from '../../site-worker/src/state.mjs';
import {encodeText} from '../../site-worker/src/content.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const TEST_PASSWORD='Only-for-tests-strong-password!';
export async function passwordHash(password=TEST_PASSWORD){const salt='aa'.repeat(32);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const result=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g),x=>parseInt(x,16)),iterations:100000},key,256));return 'pbkdf2-sha256$100000$'+salt+'$'+Buffer.from(result).toString('hex');}
class Storage {
 constructor(){this.data=new Map();this.alarm=null;this.queue=Promise.resolve();}
 async get(key){return structuredClone(this.data.get(key));}
 async put(key,value){this.data.set(key,structuredClone(value));}
 async delete(key){return this.data.delete(key);}
 async transaction(fn){const job=this.queue.then(()=>fn(this));this.queue=job.catch(()=>{});return job;}
 async getAlarm(){return this.alarm;}
 async setAlarm(value){this.alarm=value;}
 async list({limit,startAfter}={}){return new Map([...this.data].sort(([a],[b])=>a.localeCompare(b)).filter(([key])=>!startAfter||key>startAfter).slice(0,limit));}
}
export async function fixture(){
 const storage=new Storage();const state=new AdminState({storage});const files=new Map();const requests=[];
 for(const dir of ['content/pages','content/projects'])for(const name of await readdir(new URL('../../'+dir+'/',import.meta.url))){const file=dir+'/'+name;files.set(file,{content:await readFile(new URL('../../'+file,import.meta.url),'utf8'),sha:createHash('sha1').update(file).digest('hex')});}
 files.set('content/settings.json',{content:await readFile(new URL('../../content/settings.json',import.meta.url),'utf8'),sha:'a'.repeat(40)});
 let version=0;
 const fetcher=async(input,options)=>{
  const url=new URL(input);requests.push({url:input,...options});
  if(url.origin!=='https://api.github.com'||!url.pathname.startsWith('/repos/owner/site/contents/'))throw new Error('Unexpected upstream');
  if(options.headers.Authorization!=='Bearer server-only-test-token')throw new Error('Missing server credential');
  const file=decodeURIComponent(url.pathname.replace('/repos/owner/site/contents/',''));
  if(options.method==='GET'){
   if(file==='content/projects')return Response.json([...files.keys()].filter(p=>p.startsWith('content/projects/')).map(p=>({type:'file',name:p.split('/').at(-1),sha:files.get(p).sha})));
   const result=files.get(file);return result?Response.json({type:'file',sha:result.sha,content:encodeText(result.content)}):Response.json({message:'Not found'},{status:404});
  }
  const body=JSON.parse(options.body);const existing=files.get(file);
  if(body.sha!==existing?.sha)return Response.json({message:'Conflict'},{status:409});
  if(options.method==='DELETE'){files.delete(file);return Response.json({ok:true});}
  const content=Buffer.from(body.content,'base64').toString('utf8');const sha=createHash('sha1').update(content+ ++version).digest('hex');files.set(file,{content,sha});return Response.json({content:{sha}});
 };
 const env={SITE_ORIGIN:'https://studio.example',ADMIN_USERNAME:'admin',ADMIN_PASSWORD_HASH:await passwordHash(),GITHUB_CONTENT_TOKEN:'server-only-test-token',CONTENT_REPO:'owner/site',CONTENT_BRANCH:'main',ADMIN_STATE:{idFromName:()=>1,get:()=>({fetch:(input,options)=>state.fetch(new Request(input,options))})},ASSETS:{fetch:async()=>new Response('Public website')}};
 const worker=createSiteWorker(fetcher);
 const request=(route,{method='GET',cookie,csrf,body,origin=env.SITE_ORIGIN,ip='203.0.113.1',headers={}}={})=>worker.fetch(new Request(env.SITE_ORIGIN+route,{method,headers:{...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),'CF-Connecting-IP':ip,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 const login=async()=>{const response=await request('/api/login',{method:'POST',body:{username:'admin',password:TEST_PASSWORD}});const cookie=response.headers.get('Set-Cookie')?.split(';')[0];const user=await (await request('/api/session',{cookie})).json();return {response,cookie,csrf:user.csrf};};
 return {env,worker,request,login,files,requests,storage,state};
}
