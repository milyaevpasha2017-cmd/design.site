import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {staticAssets} from '../vps/assets.mjs';
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
