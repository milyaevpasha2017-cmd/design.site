import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {staticAssets} from '../vps/assets.mjs';
import {httpServer} from '../vps/server.mjs';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
test('HTTP adapter forwards browser cache validators to static assets',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'epiphany-cache-http-'));let server;
 try{
  await mkdir(join(dir,'assets'));await writeFile(join(dir,'assets/photo.webp'),'photo');
  const assets=await staticAssets(dir);server=httpServer({origin:'https://example.test',fetch:r=>assets.fetch(r)});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const get=headers=>new Promise((resolve,reject)=>{
   const req=httpRequest({host:'127.0.0.1',port:server.address().port,path:'/assets/photo.webp',headers:{Host:'example.test','X-Forwarded-Proto':'https',...headers}},res=>{
    const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));res.on('error',reject);
   });req.on('error',reject);req.end();
  });
  const first=await get({});assert.equal(first.status,200);
  for(const headers of [{'If-None-Match':first.headers.etag},{'If-Modified-Since':first.headers['last-modified']}]){
   const cached=await get(headers);assert.equal(cached.status,304);assert.equal(cached.body.length,0);
  }
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(dir,{recursive:true,force:true});}
});
test('static media reuses browser cache and validators avoid resending unchanged files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'epiphany-cache-'));
 try{
  await mkdir(join(dir,'assets'));await writeFile(join(dir,'assets','photo.webp'),'photo');await writeFile(join(dir,'style.css'),'body{}');
  const assets=await staticAssets(dir),get=(p,headers={})=>assets.fetch(new Request('https://example.test'+p,{headers}));
  const first=await get('/assets/photo.webp');assert.equal(first.headers.get('Cache-Control'),'public, max-age=86400');assert.equal(await first.text(),'photo');
  const tag=first.headers.get('ETag');assert.ok(tag);const same=await get('/assets/photo.webp',{'If-None-Match':tag});assert.equal(same.status,304);assert.equal(await same.text(),'');assert.equal(same.headers.get('Content-Length'),null);
  assert.equal((await get('/assets/photo.webp',{'If-Modified-Since':first.headers.get('Last-Modified')})).status,304);
  assert.equal((await get('/assets/photo.webp',{'If-None-Match':'"different"','If-Modified-Since':first.headers.get('Last-Modified')})).status,200);
  const css=await get('/style.css');assert.equal(css.headers.get('Cache-Control'),'no-cache');await css.text();
  await writeFile(join(dir,'assets','photo.webp'),'changed photo');const changed=await get('/assets/photo.webp',{'If-None-Match':tag});assert.equal(changed.status,200);assert.equal(await changed.text(),'changed photo');
 }finally{await rm(dir,{recursive:true,force:true});}
});
