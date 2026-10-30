// Optional DOM regression: npm install linkedom in an external test workspace.
// Set LINKEDOM_MODULE_PATH to that installation; no browser or live credentials are used.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {fixture} from '../helpers/password-site.mjs';
const require=createRequire(import.meta.url),{parseHTML}=require(process.env.LINKEDOM_MODULE_PATH||'linkedom');
const root=new URL('../../',import.meta.url).pathname.replace(/\/$/,'');
const {window}=parseHTML(await readFile(root+'/password-admin/index.html','utf8'));
for(const key of ['document','Event','HTMLElement'])globalThis[key]=window[key];
globalThis.location={origin:'https://studio.example',replace:()=>{throw Error('Unexpected login redirect')}};
globalThis.addEventListener=()=>{};globalThis.confirm=()=>true;globalThis.prompt=()=>'/contact/';globalThis.alert=message=>{throw Error(message)};
window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLInputElement.prototype.setCustomValidity=function(){};
window.HTMLTextAreaElement.prototype.setCustomValidity=function(){};
window.HTMLTextAreaElement.prototype.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end;};
window.HTMLTextAreaElement.prototype.setRangeText=function(replacement,start,end){this.value=this.value.slice(0,start)+replacement+this.value.slice(end);this.selectionStart=start;this.selectionEnd=start+replacement.length;};
const form=document.querySelector('#editor'),query=form.querySelector.bind(form);
form.querySelector=selector=>selector.includes(':invalid')?null:query(selector);form.reportValidity=()=>true;
const f=await fixture(),user=await f.login();
globalThis.fetch=async(path,options={})=>f.worker.fetch(new Request(f.env.SITE_ORIGIN+path,{...options,headers:{Cookie:user.cookie,Origin:f.env.SITE_ORIGIN,...options.headers}}),f.env);
await import(root+'/password-admin/editor.js');
const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await setTimeout(10);}throw Error('Timed out: '+document.querySelector('#error').textContent);};
await wait(()=>document.querySelector('#field-title'));
assert.equal(document.querySelectorAll('.editor-section').length,7);
assert.equal(document.querySelector('#field-emphasis'),null);
const title=document.querySelector('#field-title');assert.ok(title.value.includes('*вы дома.*'));
assert.equal(document.querySelector('#save').disabled,true);
assert.ok(document.querySelector('#page-list [aria-current="page"]'));
const original=JSON.parse(f.files.get('content/pages/home.json').content);
assert.equal(original.emphasis,'вы дома.');
title.value='Пространство **вашего дома**';title.dispatchEvent(new Event('input',{bubbles:true}));
assert.equal(document.querySelector('#save').disabled,false);
assert.equal(title.parentElement.querySelector('.format-preview strong').textContent,'вашего дома');
document.querySelector('#save').click();await wait(()=>document.querySelector('#status').textContent.startsWith('Сохранено и опубликовано'));
let saved=JSON.parse(f.files.get('content/pages/home.json').content);assert.equal(saved.title,title.value);assert.equal(saved.emphasis,'');assert.equal(saved.intro,original.intro);
// Add inline formatting through actual toolbar click, not direct source edits.
title.setSelectionRange(0,"Пространство".length);title.parentElement.querySelector('[aria-label="Курсив"]').click();assert.ok(title.value.startsWith('*Пространство*'));
assert.ok(title.parentElement.querySelector('.format-preview em'));
document.querySelector('#save').click();await wait(()=>document.querySelector('#status').textContent.startsWith('Сохранено и опубликовано'));
const intro=document.querySelector('#field-intro');intro.value='Первая строка\nВторая строка';intro.dispatchEvent(new Event('input',{bubbles:true}));intro.setSelectionRange(0,intro.value.length);intro.parentElement.querySelector('[aria-label="Маркированный список"]').click();assert.equal(intro.value,'• Первая строка\n• Вторая строка');
intro.setSelectionRange(2,14);intro.parentElement.querySelector('[aria-label="Вставить ссылку"]').click();assert.ok(intro.value.includes('](/contact/)'));assert.equal(intro.parentElement.querySelector('.format-preview a').getAttribute('href'),'/contact/');
intro.value='<img src=x onerror=evil> **Текст**';intro.dispatchEvent(new Event('input',{bubbles:true}));assert.equal(intro.parentElement.querySelector('.format-preview img'),null);
document.querySelector('#save').click();await wait(()=>document.querySelector('#status').textContent.startsWith('Сохранено и опубликовано'));
// Removing text and saving again uses the returned revision, without a reload.
title.value='Дом';title.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#save').click();await wait(()=>document.querySelector('#status').textContent.startsWith('Сохранено и опубликовано'));assert.equal(JSON.parse(f.files.get('content/pages/home.json').content).title,'Дом');
// Nested CTA title is unified; paragraphs in lists get the same toolbar.
assert.ok(document.querySelector('#field-cta-title'));assert.equal(document.querySelector('#field-cta-emphasis'),null);
[...document.querySelectorAll('#page-list button')].find(button=>button.textContent==='О дизайнере').click();await wait(()=>document.querySelector('#field-paragraphs-0-value'));
const paragraph=document.querySelector('#field-paragraphs-0-value');assert.ok(paragraph.parentElement.querySelector('.format-toolbar'));paragraph.value='**История**';paragraph.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#save').click();await wait(()=>document.querySelector('#status').textContent.startsWith('Сохранено и опубликовано'));assert.equal(JSON.parse(f.files.get('content/pages/about.json').content).paragraphs[0],'**История**');
assert.equal(document.querySelector('#error').textContent,'');
console.log('PASS: actual editor DOM, grouped sections, unified legacy title, toolbar selection, safe live preview, bullets, links, nested CTA, list paragraphs, repeat saves and shortening. Writes only to in-memory fixtures.');
