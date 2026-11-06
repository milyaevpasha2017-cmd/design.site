import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/password-site.mjs';
test('text blocks publish safely, reorder and delete immediately; existing text may be cleared',async()=>{
 const f=await fixture(),user=await f.login();
 let doc=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();
 doc.data.intro='';doc.data.text_blocks=[{title:'Первый',text:'**Новый текст** <script>evil</script>'},{title:'Второй',text:'Ещё текст'}];
 const save=async()=>{const res=await f.request('/api/pages/home',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:doc});assert.equal(res.status,200,await res.clone().text());doc.sha=(await res.json()).sha;return (await f.request('/')).text();};
 let html=await save();assert.ok(html.includes('<strong>Новый текст</strong>'));assert.ok(!html.includes('<script>evil</script>'));assert.ok(html.indexOf('Первый')<html.indexOf('Второй'));
 doc.data.text_blocks.reverse();html=await save();assert.ok(html.indexOf('Второй')<html.indexOf('Первый'));
 doc.data.text_blocks=[];html=await save();assert.ok(!html.includes('Новый текст'));assert.ok(!html.includes('class="text-block"'));
 assert.ok(!html.includes('class="project-type"'));
});
