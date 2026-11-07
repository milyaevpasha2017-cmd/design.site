// Visible-by-default enhancements. Rearm only after leaving a wider viewport,
// so a small scroll near an edge cannot restart or snap a running animation.
export function observeAppearances(items,{signal,Observer=globalThis.IntersectionObserver,reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')}={}){
  if(!Observer||signal?.aborted)return;
  const states=new Map();
  const appear=async state=>{
    const {element,image}=state;
    if(!state.inside||!state.armed||state.pending||state.animation||reduced?.matches||signal?.aborted)return;
    if(image&&(!element.complete||!element.naturalWidth))return;
    const source=image?element.currentSrc||element.src:'';
    state.pending=true;
    try{if(image&&element.decode)await element.decode();}catch{return;}finally{state.pending=false;}
    if(!state.inside||!state.armed||reduced?.matches||signal?.aborted||(image&&source!==(element.currentSrc||element.src)))return;
    state.armed=false;
    if(!element.animate)return;
    // Opacity never changes geometry or feeds back into intersection tests.
    const animation=element.animate([{opacity:image ? .15 : .35},{opacity:1}],{duration:image?650:600,easing:'cubic-bezier(.25,.46,.45,.94)'});
    state.animation=animation;
    animation.finished.catch(()=>{}).finally(()=>{if(state.animation===animation)state.animation=null;});
  };
  const enter=new Observer(entries=>{
    for(const entry of entries){const state=states.get(entry.target);if(!state)continue;state.inside=entry.isIntersecting;if(state.inside)void appear(state);}
  },{rootMargin:'0px 0px',threshold:0});
  const leave=new Observer(entries=>{
    for(const entry of entries){const state=states.get(entry.target);if(state&&!entry.isIntersecting)state.armed=true;}
  },{rootMargin:'200px 0px',threshold:0});
  const register=(element,image=false)=>{
    if(signal?.aborted||states.has(element))return;
    const state={element,image,inside:false,armed:true,pending:false,animation:null};states.set(element,state);enter.observe(element);leave.observe(element);
    if(image)element.addEventListener('load',()=>{state.armed=true;void appear(state);},{signal});
  };
  for(const {element,image} of items)register(element,image);
  const cancel=()=>states.forEach(state=>{state.animation?.cancel();state.animation=null;});
  reduced?.addEventListener('change',()=>{if(reduced.matches)cancel();},{signal});
  signal?.addEventListener('abort',()=>{enter.disconnect();leave.disconnect();cancel();states.clear();},{once:true});
  return {register,remove(element){enter.unobserve(element);leave.unobserve(element);const state=states.get(element);state?.animation?.cancel();states.delete(element);}};
}
