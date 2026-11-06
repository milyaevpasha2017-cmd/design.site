import test from 'node:test';
import assert from 'node:assert/strict';
import {observeAppearances} from '../viewport-appearance.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(image=true){
 const observers=[];
 class Observer{constructor(callback,options){this.callback=callback;this.options=options;this.disconnected=false;observers.push(this);}observe(){}unobserve(){}disconnect(){this.disconnected=true;}emit(inside){this.callback([{target:element,isIntersecting:inside}]);}}
 const element=Object.assign(new EventTarget(),{complete:true,naturalWidth:1200,currentSrc:'/photo.webp',fetchPriority:'auto',decode:()=>Promise.resolve(),animate(frames,options){let animationFinish;const animation={frames,options,finished:new Promise(r=>animationFinish=r),cancel(){this.cancelled=true;animationFinish();},finish(){animationFinish();}};animations.push(animation);return animation;}});
 const animations=[],signal=new AbortController(),reduced=Object.assign(new EventTarget(),{matches:false});
 const effects=observeAppearances([{element,image}],{signal:signal.signal,Observer,reduced});
 return {observers,element,animations,signal,reduced,effects};
}
test('viewport edges do not restart motion; leaving the wider viewport rearms it',async()=>{
 const s=setup();s.observers[0].emit(true);await flush();assert.equal(s.animations.length,1);
 assert.equal(s.animations[0].frames[0].opacity,.72);assert.equal(s.animations[0].options.fill,undefined);
 s.animations[0].finish();await flush();
 s.observers[0].emit(false);s.observers[0].emit(true);await flush();assert.equal(s.animations.length,1);
 s.observers[0].emit(false);s.observers[1].emit(false);s.observers[0].emit(true);await flush();assert.equal(s.animations.length,2);
 s.signal.abort();assert.ok(s.observers.every(o=>o.disconnected));assert.ok(s.animations[1].cancelled);
});
test('image decode cannot animate a stale source or detached page',async()=>{
 const s=setup();let decoded;s.element.decode=()=>new Promise(r=>decoded=r);
 s.observers[0].emit(true);s.element.currentSrc='/new.webp';decoded();await flush();assert.equal(s.animations.length,0);
 s.element.decode=()=>Promise.resolve();s.element.dispatchEvent(new Event('load'));await flush();assert.equal(s.animations.length,1);
 s.signal.abort();
 const t=setup();let finish;t.element.decode=()=>new Promise(r=>finish=r);t.observers[0].emit(true);t.signal.abort();finish();await flush();assert.equal(t.animations.length,0);
});
test('critical images paint immediately; reduced motion cancels enhancements without hiding content',async()=>{
 const s=setup();s.element.fetchPriority='high';s.observers[0].emit(true);await flush();assert.equal(s.animations.length,0);
 s.observers[0].emit(false);s.observers[1].emit(false);s.observers[0].emit(true);await flush();assert.equal(s.animations.length,1);
 s.reduced.matches=true;s.reduced.dispatchEvent(new Event('change'));assert.ok(s.animations[0].cancelled);s.signal.abort();
 const t=setup(false);t.observers[0].emit(true);await flush();assert.equal(t.animations[0].frames[0].translate,'0 10px');assert.equal(t.animations[0].frames[0].transform,undefined);t.signal.abort();
});
