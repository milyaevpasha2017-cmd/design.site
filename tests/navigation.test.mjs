import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const moduleFrom=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(path,import.meta.url),'utf8')).toString('base64'));
const {publicPage}=await moduleFrom('../navigation.js');
const {watch}=await moduleFrom('../page-lifecycle.js');
test('SPA allowlist includes public SSR pages and excludes APIs, admin, assets and other origins',()=>{
 const base=new URL('https://studio.example/');
 for(const path of ['/','/projects/','/projects/warm-minimalism/','/about/','/services/','/videos/','/contact/?interest=light#brief-form','/quiz/','/terms/','/privacy/','/consent/','/cookies/'])assert.equal(publicPage(new URL(path,base),base),true,path);
 for(const path of ['/admin/','/admin/leads.html','/api/leads','/assets/photo.jpg','/404.html','/projects/x/private/','https://outside.example/contact/','mailto:studio@example.com'])assert.equal(publicPage(new URL(path,base),base),false,path);
});
test('SPA uses the actual installation base without intercepting sibling applications',()=>{
 const base=new URL('https://studio.example/design.site/');
 for(const path of ['/design.site/','/design.site/quiz/','/design.site/contact/#brief-form'])assert.equal(publicPage(new URL(path,base),base),true);
 for(const path of ['/contact/','/design.site-other/quiz/','/design.site/admin/'])assert.equal(publicPage(new URL(path,base),base),false);
});
test('page teardown disconnects observers exactly once and supports an optional lifecycle',()=>{
 const controller=new AbortController();let disconnected=0;
 const observer={disconnect(){disconnected++;}};
 assert.equal(watch(observer,controller.signal),observer);
 controller.abort();controller.abort();assert.equal(disconnected,1);
 assert.equal(watch(observer),observer);
});
