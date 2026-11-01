import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../metrika.js',import.meta.url),'utf8');
const KEY='epiphany.analytics-consent';
function run(saved,{broken=false,path='/contact/'}={}){
 const items=new Map(saved?[[KEY,JSON.stringify(saved)]]:[]),inserted=[];
 const button=()=>({listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},focus(){this.focused=true;}});
 const accept=button(),reject=button(),settings=button();
 const banner={hidden:true,querySelector:()=>accept};
 const context={window:{},Date,Number,JSON,Object,location:{pathname:path,href:'https://studio.example'+path,hostname:'studio.example',reload(){context.reloads++;}},reloads:0,
 localStorage:{getItem(key){if(broken)throw Error();return items.get(key)||null;},setItem(key,value){if(broken)throw Error();items.set(key,value);},removeItem(key){items.delete(key);}},
 document:{cookie:'',referrer:'',querySelector(selector){return ({'#cookie-banner':banner,'[data-cookie-accept]':accept,'[data-cookie-reject]':reject})[selector];},querySelectorAll:()=>[settings],createElement:()=>({}),getElementsByTagName:()=>[{parentNode:{insertBefore(el){inserted.push(el);}}}]}};
 vm.runInNewContext(source,context);return {context,banner,accept,reject,settings,inserted,items};
}
test('cookie choice: no analytics before consent or after refusal; accept loads once and preferences can be changed',()=>{
 const f=run();assert.equal(f.banner.hidden,false);assert.equal(f.inserted.length,0);assert.equal(f.context.window.ym,undefined);
 f.reject.listeners.click();assert.equal(f.inserted.length,0);assert.equal(JSON.parse(f.items.get(KEY)).accepted,false);
 f.settings.listeners.click();assert.equal(f.banner.hidden,false);assert.equal(f.accept.focused,true);
 f.accept.listeners.click();f.accept.listeners.click();assert.equal(f.inserted.length,1);assert.equal(f.context.window.ym.a[0][0],113965901);assert.equal(f.context.window.ym.a[0][1],'init');
 f.reject.listeners.click();assert.equal(f.context.reloads,1);assert.equal(JSON.parse(f.items.get(KEY)).accepted,false);
});
test('cookie choice: stored version/expiry, unavailable storage and admin pages do not cause accidental tracking',()=>{
 const saved={version:'2026-11-01',accepted:true,at:Date.now()};
 assert.equal(run(saved).inserted.length,1);
 assert.equal(run({...saved,accepted:false}).inserted.length,0);
 for(const stale of [{...saved,version:'old'},{...saved,at:0},{...saved,at:Date.now()+60000},{...saved,accepted:'true'}]){const f=run(stale);assert.equal(f.inserted.length,0);assert.equal(f.banner.hidden,false);}
 const f=run(saved,{broken:true});assert.equal(f.inserted.length,0);f.accept.listeners.click();assert.equal(f.inserted.length,1);
 assert.equal(run(saved,{path:'/admin/login/'}).inserted.length,0);
});
