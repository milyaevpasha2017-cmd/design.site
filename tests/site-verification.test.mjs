import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture} from './helpers/password-site.mjs';
import {staticAssets} from '../vps/assets.mjs';
test('Yandex and Google ownership files survive build and live routing; GET and HEAD work without login',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'epiphany-verify-'));
 try{
  execFileSync('python3',['scripts/build.py','--site-url','https://studio.example/','--output',dir,'--admin-mode','password']);
  const f=await fixture();f.env.ASSETS=await staticAssets(dir);
  for(const path of ['/yandex_59d8ac18e7c2c0a9.html','/google2a6a1606b1efa065.html']){
  const expected=await readFile(new URL('..'+path,import.meta.url),'utf8');
  const response=await f.request(path);
  assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/^text\/html/);
  assert.equal(await response.text(),expected);assert.ok(expected.includes(path.includes('google')?'google-site-verification: google2a6a1606b1efa065.html':'Verification: 59d8ac18e7c2c0a9'));
  const head=await f.request(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await f.request('/yandex_0000000000000000.html')).status,404);
  assert.equal((await f.request(path,{method:'POST',body:{}})).status,405);
  }
  assert.equal((await f.request('/google0000000000000000.html')).status,404);
 }finally{await rm(dir,{recursive:true,force:true});}
});
