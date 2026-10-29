import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSiteWorker} from '../site-worker/src/worker.mjs';
import {validPasswordHash} from '../site-worker/src/security.mjs';
import {SQLiteNamespace} from './storage.mjs';
import {staticAssets} from './assets.mjs';

export async function application(config,{fetcher=fetch}={}){
  const origin=new URL(config.SITE_ORIGIN);
  if(origin.protocol!=='https:'||origin.origin!==config.SITE_ORIGIN||origin.username||origin.password)throw new Error('SITE_ORIGIN must be an HTTPS origin without a trailing slash');
  if(!config.ADMIN_USERNAME||!validPasswordHash(config.ADMIN_PASSWORD_HASH)||!config.GITHUB_CONTENT_TOKEN||!/^\w[\w.-]*\/[\w.-]+$/.test(config.CONTENT_REPO||''))throw new Error('Missing or invalid server configuration');
  const namespace=new SQLiteNamespace(config.DATABASE_PATH);
  try{
    const env={...config,ADMIN_STATE:namespace,ASSETS:await staticAssets(config.ASSETS_PATH),SITE_CONTENT:JSON.parse(await readFile(config.SNAPSHOT_PATH,'utf8'))};
    const worker=createSiteWorker(fetcher);
    return {namespace,fetch:request=>worker.fetch(request,env),origin:origin.origin};
  }catch(error){await namespace.close();throw error;}
}

// Only Nginx may reach the loopback listener. It overwrites these headers;
// public CF-Connecting-IP / X-Forwarded-* values are never passed through.
export function httpServer(app){
  const host=new URL(app.origin).host;
  return createServer({headersTimeout:30000,requestTimeout:60000,maxHeaderSize:16384},async(incoming,outgoing)=>{
    try{
      if(incoming.headers.host!==host||!incoming.url?.startsWith('/')||incoming.url.startsWith('//')){outgoing.writeHead(400);outgoing.end('Bad request');return;}
      if(incoming.headers['x-forwarded-proto']!=='https'){outgoing.writeHead(400);outgoing.end('HTTPS required');return;}
      const headers=new Headers();
      for(const key of ['content-type','content-length','cookie','origin','x-csrf-token','accept'])if(incoming.headers[key])headers.set(key,incoming.headers[key]);
      headers.set('CF-Connecting-IP',incoming.headers['x-real-ip']||incoming.socket.remoteAddress||'unknown');
      const controller=new AbortController();incoming.on('aborted',()=>controller.abort());
      const method=incoming.method;
      const request=new Request(app.origin+incoming.url,{method,headers,signal:controller.signal,...(!['GET','HEAD'].includes(method)?{body:Readable.toWeb(incoming),duplex:'half'}:{})});
      const response=incoming.url==='/healthz'&&method==='GET'?(await app.namespace.run(()=>app.namespace.db.prepare('SELECT 1').get()),new Response('ok\n',{headers:{'Cache-Control':'no-store'}})):await app.fetch(request);
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      if(response.body&&method!=='HEAD')await pipeline(Readable.fromWeb(response.body),outgoing);
      else {await response.body?.cancel();outgoing.end();}
    }catch{
      if(outgoing.headersSent){outgoing.destroy();return;}
      outgoing.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});outgoing.end('Сервис временно недоступен. Повторите позже.');
    }
  });
}

if(process.argv[1]&&await realpath(process.argv[1])===fileURLToPath(import.meta.url)){
  process.umask(0o077);
  const root=fileURLToPath(new URL('../',import.meta.url));
  const app=await application({...process.env,DATABASE_PATH:process.env.DATABASE_PATH||'/var/lib/epiphany/state.sqlite',ASSETS_PATH:resolve(root,'_site-vps'),SNAPSHOT_PATH:resolve(root,'site-worker/generated/site.json')});
  const server=httpServer(app),timer=setInterval(()=>app.namespace.sweep().catch(()=>console.error('Session cleanup failed')),60000);timer.unref();
  const port=Number(process.env.PORT||3000);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid port');
  server.listen(port,'127.0.0.1',()=>console.log('Epiphany is listening on loopback port '+port));
  let closing=false;
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
    if(closing)return;closing=true;clearInterval(timer);
    const deadline=setTimeout(()=>process.exit(1),15000);deadline.unref();
    server.close(async()=>{await app.namespace.close();clearTimeout(deadline);});
  });
}
