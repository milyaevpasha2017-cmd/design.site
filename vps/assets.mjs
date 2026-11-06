import {realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {resolve,sep,extname} from 'node:path';

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff'};
export async function staticAssets(directory){
  const root=await realpath(directory);
  return {async fetch(request){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    let path;try{path=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Bad path',{status:400});}
    if(path.includes('\0')||path.includes('\\')||path.split('/').some(part=>part==='..'||part.startsWith('.')))return new Response('Not found',{status:404});
    let file=resolve(root,'.'+path);
    if(!file.startsWith(root+sep)&&file!==root)return new Response('Not found',{status:404});
    try{
      let info=await stat(file);
      if(info.isDirectory()){file=resolve(file,'index.html');info=await stat(file);}
      file=await realpath(file);
      if(!file.startsWith(root+sep)||!info.isFile())return new Response('Not found',{status:404});
      const extension=extname(file).toLowerCase();
      const media=path.startsWith('/assets/')&&/\.(?:png|jpe?g|webp|avif|ico|svg|woff2?)$/i.test(path);
      const etag='W/"'+info.size.toString(16)+'-'+Math.trunc(info.mtimeMs).toString(16)+'"';
      const headers={'Content-Type':types[extension]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':media?'public, max-age=86400':'no-cache','ETag':etag,'Last-Modified':info.mtime.toUTCString()};
      const match=request.headers.get('If-None-Match'),modified=request.headers.get('If-Modified-Since');
      const unchanged=match?match.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,'')):modified&&Number.isFinite(Date.parse(modified))&&Math.trunc(info.mtimeMs/1000)<=Math.trunc(Date.parse(modified)/1000);
      if(unchanged)return new Response(null,{status:304,headers});
      headers['Content-Length']=String(info.size);
      return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(file)),{headers});
    }catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return new Response('Not found',{status:404});throw error;}
  }};
}

