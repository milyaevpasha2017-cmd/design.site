import {COOKIE,cookie,SESSION_SECONDS,randomToken,digest,sessionId,verifyPassword,validPasswordHash,bodyJSON,imageExtension} from './security.mjs';
import {schema,validate,repository,slugPattern} from './content.mjs';
import {publication,currentContent} from './publication.mjs';
import {Site} from './render.mjs';
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
async function publicSite(request,env,path){
  if(!env.SITE_CONTENT)return asset(request,env);
  if(path.startsWith('/assets/uploads/')){
    const built=await asset(request,env);
    if(built.status!==404)return built;
    await built.body?.cancel();
    return publication(env,{action:'publish:photo',path:path.slice(1)});
  }
  if(path.split('/').at(-1).includes('.')&&!path.endsWith('.html')&&path!=='/sitemap.xml')return asset(request,env);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  try{
    const response=await publication(env,{action:'publish:read'});
    if(!response.ok)throw new Error('Publication unavailable');
    const content=currentContent(env.SITE_CONTENT,await response.json());
    const page=new Site(content,env.SITE_ORIGIN,env.SITE_CONTENT.icons).response(path);
    return request.method==='HEAD'?new Response(null,{status:page.status,headers:page.headers}):page;
  }catch{
    const site=new Site(env.SITE_CONTENT.content,env.SITE_ORIGIN,env.SITE_CONTENT.icons);
    return new Response(request.method==='HEAD'?null:site.failure(),{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'30','X-Content-Type-Options':'nosniff'}});
  }
}
async function publish(env,result,data){
  try{
    if(!result.commit)throw new Error('Missing commit');
    const response=await publication(env,{...data,commit:result.commit});
    if(!response.ok)throw new Error('Publication unavailable');
    return {...result,published:true};
  }catch{
    // The repository write already succeeded. Return its revision so another
    // edit remains safe; the ordinary build will publish this recovery path.
    return {...result,published:false};
  }
}
export function createSiteWorker(fetcher=fetch){return {async fetch(request,env){
  const url=new URL(request.url);let route;
  try{route=decodeURIComponent(url.pathname);}catch{return json({error:'Некорректный адрес.'},400);}
  const privateRoute=route==='/admin'||route.startsWith('/admin/')||route.startsWith('/api/');
  if(!privateRoute)return publicSite(request,env,route);
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
    if(route==='/api/export'&&request.method==='GET'){
      if(!env.SITE_CONTENT)return json({error:'Экспорт пока недоступен. Обратитесь к владельцу сайта.'},503);
      const response=await publication(env,{action:'publish:read'});
      if(!response.ok)return json({error:'Не удалось подготовить экспорт. Повторите позже.'},503);
      const content=currentContent(env.SITE_CONTENT,await response.json());
      return json({format:'epiphany-content-v1',exportedAt:new Date().toISOString(),content,mediaIncluded:false,note:'JSON содержит тексты, настройки и ссылки на фотографии. Файлы фотографий в этот экспорт не входят.'},200,{'Content-Disposition':'attachment; filename="epiphany-content.json"'});
    }
    const repo=repository(env,fetcher);
    if(route==='/api/export/archive'&&request.method==='GET'){
      const archive=await repo.archive();return new Response(archive.body,{headers:{...privateHeaders,'Content-Type':'application/zip','Content-Disposition':'attachment; filename="epiphany-content.zip"'}});
    }
    if(route==='/api/projects'&&request.method==='GET'){
      const limit=Number(url.searchParams.get('limit')||50),cursor=url.searchParams.get('cursor')||'';
      if(!Number.isSafeInteger(limit)||limit<1||limit>100||(cursor&&!slugPattern.test(cursor)))return json({error:'Некорректные параметры списка проектов.'},400);
      const files=await repo.list();
      files.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
      const start=cursor?files.findIndex(file=>file.id>cursor):0;
      const selected=start<0?[]:files.slice(start,start+limit);
      if(env.SITE_CONTENT&&selected.length){
        const result=await publication(env,{action:'publish:read'});
        if(result.ok){
          const records=await result.json(),content=currentContent(env.SITE_CONTENT,records),included=new Set(env.SITE_CONTENT.commits);
          for(const file of selected){
            const key=`content/projects/${file.id}.json`,record=records[key];
            const cachedSHA=record&&!included.has(record.commit)?record.sha:env.SITE_CONTENT.shas?.[key];
            if(cachedSHA===file.sha&&content[key])file.title=content[key].title;
          }
        }
      }
      return json({projects:selected,total:files.length,limit,nextCursor:start>=0&&start+limit<files.length?selected.at(-1).id:null});
    }
    if(route==='/api/upload'&&request.method==='POST'){
      const {content}=await bodyJSON(request,7100000);
      if(typeof content!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(content))return json({error:'Некорректный файл.'},400);
      let bytes;try{bytes=Uint8Array.from(atob(content),c=>c.charCodeAt(0));}catch{return json({error:'Некорректный файл.'},400);}
      if(bytes.length>5*1024*1024)return json({error:'Фотография должна быть не больше 5 МБ.'},413);
      const ext=imageExtension(bytes);if(!ext)return json({error:'Поддерживаются фотографии JPG, PNG и WebP.'},400);
      const result=await repo.upload('assets/uploads/'+crypto.randomUUID()+'.'+ext,content);
      return json(await publish(env,result,{action:'publish:upload',path:result.path,sha:result.sha,content,type:{png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[ext]}));
    }
    const page=route.match(/^\/api\/pages\/([a-z]+)$/);const project=route.match(/^\/api\/projects\/([a-z0-9-]+)$/);
    const definition=page?schema.pages.find(p=>p.id===page[1]):null;
    const slug=project?.[1];if(!definition&&!(slug&&slugPattern.test(slug)))return json({error:'Раздел не найден.'},404);
    const file=definition?.path||`content/projects/${slug}.json`;const fields=definition?.fields||schema.projectFields;
    if(request.method==='GET')return json(await repo.read(file));
    const body=await bodyJSON(request);
    if(request.method==='DELETE'&&project){if(!sha(body.sha))return json({error:'Сначала откройте проект заново.'},400);const result=await repo.remove(file,body.sha);return json(await publish(env,result,{action:'publish:update',file,data:null,sha:null,previousSha:body.sha}));}
    if(request.method!=='PUT')return json({error:'Метод не поддерживается.'},405);
    if(body.sha!=null&&!sha(body.sha))return json({error:'Некорректная версия записи.'},400);
    if(page&&!body.sha)return json({error:'Сначала загрузите страницу.'},409);
    try{validate(fields,body.data);}catch(error){return json({error:error.message},400);}
    if(project&&body.data.slug!==slug)return json({error:'Адрес существующего проекта менять нельзя.'},400);
    const result=await repo.save(file,body.data,body.sha);
    return json(await publish(env,result,{action:'publish:update',file,data:body.data,sha:result.sha,previousSha:body.sha}));
  }catch(error){return json({error:error.status?error.message:'Не удалось выполнить действие. Повторите позже.'},error.status||500);}
}};}
export default createSiteWorker();
