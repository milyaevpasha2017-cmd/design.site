import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('inbox entry remains in the header outside collapsible mobile navigation',async()=>{
 const html=await readFile(new URL('../password-admin/index.html',import.meta.url),'utf8');
 assert.match(html.match(/<header\b[\s\S]*?<\/header>/)[0],/href="\/admin\/leads\.html"/);
});
test('old leads without notification metadata stay visible and a failed refresh keeps the current list',async()=>{
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.listeners={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(){}
  addEventListener(name,callback){this.listeners[name]=callback;}
 }
 const nodes=Object.fromEntries(['refresh','more','leads-error','leads-list','leads-status','notification-status','logout'].map(id=>['#'+id,new Element('div')]));
 let fail=false;const requests=[];
 const fetch=async(url,options)=>{
  requests.push({url,options});if(url==='/api/session')return Response.json({csrf:'test-only'});
  if(fail)return Response.json({error:'Сервис временно недоступен'},{status:503});
  return Response.json({leads:[{id:'old',name:'Старая заявка',contact:'@test',createdAt:0,status:'new'},{id:'new',name:'Новая заявка',contact:'@test',createdAt:1,status:'new',notification:{state:'sent'}}],nextCursor:null});
 };
 const source=await readFile(new URL('../password-admin/leads.js',import.meta.url),'utf8');
 await vm.runInNewContext('(async()=>{'+source+'})()',{document:{querySelector:s=>nodes[s],createElement:tag=>new Element(tag),getElementById:()=>null},location:{hash:''},fetch,Response,Date,JSON,encodeURIComponent,confirm:()=>false});
 assert.equal(nodes['#leads-list'].children.length,2);assert.equal(nodes['#leads-status'].textContent,'Показано заявок: 2');assert.equal(nodes['#leads-error'].textContent,'');
 const original=nodes['#leads-list'].children;fail=true;await nodes['#refresh'].listeners.click();
 assert.deepEqual(nodes['#leads-list'].children,original);assert.equal(nodes['#leads-error'].textContent,'Сервис временно недоступен');assert.equal(nodes['#leads-status'].textContent,'Показано заявок: 2');
 assert.ok(requests.every(r=>r.options.cache==='no-store'));
});
