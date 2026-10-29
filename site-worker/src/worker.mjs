import {COOKIE,cookie,SESSION_SECONDS,randomToken,digest,sessionId,verifyPassword,validPasswordHash,bodyJSON,imageExtension} from './security.mjs';
import {schema,validate,repository,slugPattern} from './content.mjs';
const privateHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'};
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: blob: data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{...privateHeaders,...extra}});
function configured(env){return env.ADMIN_USERNAME && validPasswordHash(env.ADMIN_PASSWORD_HASH) && env.GITHUB_CONTENT_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(env.CONTENT_REPO||'') && env.SITE_ORIGIN && env.ADMIN_STATE;}
async function state(env,data){if(data.sid)data={...data,sid:await digest(data.sid)};const id=env.ADMIN_STATE.idFromName('epiphany-admin');const response=await env.ADMIN_STATE.get(id).fetch('https://internal/',{method:'POST',body:JSON.stringify(data)});return response.json();}
async function fingerprint(env){return digest(env.ADMIN_USERNAME+'\n'+env.ADMIN_PASSWORD_HASH);}
async function session(request,env){
  const sid=sessionId(request);if(!sid)return null;
  const saved=await state(env,{action:'get',sid});
  if(!saved || saved.user!==env.ADMIN_USERNAME || saved.version!==await fingerprint(env) || saved.origin!==env.SITE_ORIGIN)return null;
  return {...saved,sid};
}
function sha(value){return typeof value==='string'&&/^[a-f0-9]{40,64}$/.test(value);}
async function asset(request,env,privatePage=false){
  const response=await env.ASSETS.fetch(request);if(!privatePage)return response;
  const headers=new Headers(response.headers);for(const [k,v]of Object.entries(privateHeaders))headers.set(k,v);headers.set('Content-Security-Policy',csp);
  return new Response(response.body,{status:response.status,headers});
}
export function createSiteWorker(fetcher=fetch){return {async fetch(request,env){
  const url=new URL(request.url);let route;
  try{route=decodeURIComponent(url.pathname);}catch{return json({error:'Некорректный адрес.'},400);}
  const privateRoute=route==='/admin'||route.startsWith('/admin/')||route.startsWith('/api/');
  if(!privateRoute)return asset(request,env);
  if(url.protocol!=='https:')return json({error:'Для входа нужен HTTPS.'},400);
  if(env.SITE_ORIGIN && url.origin!==env.SITE_ORIGIN)return json({error:'Этот адрес не настроен для панели управления.'},403);
  const publicAdmin=['/admin/login/','/admin/login.html','/admin/admin.css','/admin/auth.js'];
  if(publicAdmin.includes(route))return asset(request,env,true);
  if(route==='/admin/login')return new Response(null,{status:302,headers:{...privateHeaders,Location:'/admin/login/'}});
  if(!configured(env))return json({error:'Панель ещё не настроена. Владелец сайта должен завершить настройку сервера.'},503);
  try{
    if(route.startsWith('/api/') && !['GET','POST','PUT','DELETE'].includes(request.method))return json({error:'Метод не поддерживается.'},405);
    // A session cookie alone is never enough to authorize a cross-site write.
    if(route.startsWith('/api/') && request.method!=='GET' && request.headers.get('Origin')!==env.SITE_ORIGIN)return json({error:'Недопустимый источник запроса.'},403);
    if(route==='/api/login'){
      if(request.method!=='POST')return json({error:'Метод не поддерживается.'},405);
      const attempt=await state(env,{action:'attempt',key:await digest(request.headers.get('CF-Connecting-IP')||'unknown')});
      if(!attempt.allowed)return json({error:'Слишком много попыток входа. Подождите минуту.'},429,{'Retry-After':'60'});
      const data=await bodyJSON(request,3000);
      const passwordOK=await verifyPassword(data.password,env.ADMIN_PASSWORD_HASH);
      if(!passwordOK||data.username!==env.ADMIN_USERNAME)return json({error:'Неверный логин или пароль.'},401);
      const sid=randomToken();const saved={user:env.ADMIN_USERNAME,csrf:randomToken(),version:await fingerprint(env),origin:env.SITE_ORIGIN,expires:Date.now()+SESSION_SECONDS*1000};
      await state(env,{action:'create',sid,session:saved});return json({ok:true},200,{'Set-Cookie':cookie(sid)});
    }
    const user=await session(request,env);
    if(!user){
      if(route==='/admin'||route.startsWith('/admin/'))return new Response(null,{status:302,headers:{...privateHeaders,Location:'/admin/login/','Set-Cookie':cookie('')}});
      return json({error:'Сессия закончилась. Войдите снова.'},401,{'Set-Cookie':cookie('')});
    }
    if(!route.startsWith('/api/'))return asset(request,env,true);
    if(request.method!=='GET'&&request.headers.get('X-CSRF-Token')!==user.csrf)return json({error:'Обновите панель и повторите действие.'},403);
    if(route==='/api/session'&&request.method==='GET')return json({username:user.user,csrf:user.csrf});
    if(route==='/api/logout'&&request.method==='POST'){await state(env,{action:'delete',sid:user.sid});return json({ok:true},200,{'Set-Cookie':cookie('')});}
    if(route==='/api/schema'&&request.method==='GET')return json(schema);
    const repo=repository(env,fetcher);
    if(route==='/api/projects'&&request.method==='GET'){
      let files;try{files=await repo.list();}catch(error){if(error.status!==404)throw error;files=[];}
      return json({projects:files});
    }
    if(route==='/api/upload'&&request.method==='POST'){
      const {content}=await bodyJSON(request,7100000);
      if(typeof content!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(content))return json({error:'Некорректный файл.'},400);
      let bytes;try{bytes=Uint8Array.from(atob(content),c=>c.charCodeAt(0));}catch{return json({error:'Некорректный файл.'},400);}
      if(bytes.length>5*1024*1024)return json({error:'Фотография должна быть не больше 5 МБ.'},413);
      const ext=imageExtension(bytes);if(!ext)return json({error:'Поддерживаются фотографии JPG, PNG и WebP.'},400);
      return json(await repo.upload('assets/uploads/'+crypto.randomUUID()+'.'+ext,content));
    }
    const page=route.match(/^\/api\/pages\/([a-z]+)$/);const project=route.match(/^\/api\/projects\/([a-z0-9-]+)$/);
    const definition=page?schema.pages.find(p=>p.id===page[1]):null;
    const slug=project?.[1];if(!definition&&!(slug&&slugPattern.test(slug)))return json({error:'Раздел не найден.'},404);
    const file=definition?.path||`content/projects/${slug}.json`;const fields=definition?.fields||schema.projectFields;
    if(request.method==='GET')return json(await repo.read(file));
    const body=await bodyJSON(request);
    if(request.method==='DELETE'&&project){if(!sha(body.sha))return json({error:'Сначала откройте проект заново.'},400);return json(await repo.remove(file,body.sha));}
    if(request.method!=='PUT')return json({error:'Метод не поддерживается.'},405);
    if(body.sha!=null&&!sha(body.sha))return json({error:'Некорректная версия записи.'},400);
    if(page&&!body.sha)return json({error:'Сначала загрузите страницу.'},409);
    try{validate(fields,body.data);}catch(error){return json({error:error.message},400);}
    if(project&&body.data.slug!==slug)return json({error:'Адрес существующего проекта менять нельзя.'},400);
    return json(await repo.save(file,body.data,body.sha));
  }catch(error){return json({error:error.status?error.message:'Не удалось выполнить действие. Повторите позже.'},error.status||500);}
}};}
export default createSiteWorker();
