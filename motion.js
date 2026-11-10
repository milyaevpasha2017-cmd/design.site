import {observeAppearances} from './viewport-appearance.mjs';
import {watch} from './page-lifecycle.js';
// Native scrolling remains in charge; no wheel interception or forced sections.
export function initMotion(signal){
  initHeaderOffset(signal);
  initImageAppearance(signal);
  initBackToTop(signal);
  if(document.body.dataset.page!=='home')return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const grid=document.querySelector('#selected-projects .project-grid'),controls=document.querySelector('.project-rail-controls');
  if(grid&&controls&&grid.children.length>1){
    grid.classList.add('project-rail');grid.setAttribute('aria-label','Избранные проекты: листайте галерею');
    controls.hidden=false;grid.tabIndex=0;grid.setAttribute('role','region');grid.setAttribute('aria-roledescription','карусель');
    const stage=grid.closest('.project-rail-stage');
    const cards=[...grid.children],prev=controls.querySelector('[data-rail-prev]'),next=controls.querySelector('[data-rail-next]');
    let index=0,targetIndex=0,paint=0,moving=false,finishTimer;
    const limit=()=>Math.max(0,grid.scrollWidth-grid.clientWidth);
    const position=card=>Math.min(limit(),card.offsetLeft-grid.firstElementChild.offsetLeft);
    const update=()=>{
      paint=0;if(signal.aborted)return;
      const photo=cards[0].querySelector('.project-image');
      if(photo&&stage)stage.style.setProperty('--rail-photo-height',photo.getBoundingClientRect().height+'px');
      const positions=cards.map(position),left=grid.scrollLeft,max=limit();
      index=positions.reduce((best,x,i)=>Math.abs(x-left)<Math.abs(positions[best]-left)?i:best,0);
      if(!moving)targetIndex=index;
      prev.disabled=moving?targetIndex===0:left<=2;next.disabled=moving?targetIndex===cards.length-1:left>=max-2;
      const label=controls.querySelector('.project-rail-count'),count=String(index+1).padStart(2,'0')+' / '+String(cards.length).padStart(2,'0');
      if(label.textContent!==count)label.textContent=count;
      controls.style.setProperty('--rail-progress',String(max?left/max:1));
    };
    const queue=()=>{if(!paint)paint=requestAnimationFrame(update);};
    const stop=()=>{clearTimeout(finishTimer);moving=false;update();};
    const go=delta=>{
      targetIndex=Math.max(0,Math.min(cards.length-1,(moving?targetIndex:index)+delta));
      moving=true;grid.scrollTo({left:position(cards[targetIndex]),behavior:reduced.matches?'instant':'smooth'});update();
      clearTimeout(finishTimer);finishTimer=setTimeout(stop,1000);
    };
    prev.addEventListener('click',()=>go(-1),{signal});next.addEventListener('click',()=>go(1),{signal});
    grid.addEventListener('keydown',event=>{
      if(event.target!==grid||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();go(event.key==='Home'?-cards.length:event.key==='End'?cards.length:event.key==='ArrowLeft'?-1:1);
    },{signal});
    grid.addEventListener('scroll',queue,{passive:true,signal});grid.addEventListener('scrollend',stop,{signal});
    grid.addEventListener('pointerdown',stop,{passive:true,signal});grid.addEventListener('wheel',stop,{passive:true,signal});
    if('ResizeObserver' in window)watch(new ResizeObserver(queue),signal).observe(grid);
    addEventListener('resize',stop,{signal});reduced.addEventListener('change',stop,{signal});
    signal.addEventListener('abort',()=>{cancelAnimationFrame(paint);clearTimeout(finishTimer);},{once:true});update();
  }
  const art=document.querySelector('.quiz-teaser-art');
  if(art&&'IntersectionObserver' in window){
    art.classList.add('art-moving');
    watch(new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('art-visible',entry.isIntersecting)),{rootMargin:'100px'}),signal).observe(art);
  }
}

function initImageAppearance(signal){
  if(!('IntersectionObserver' in window)||!Element.prototype.animate)return;
  const groups='.steps article,.service-teasers>a,.quiz-teaser>div:first-child,.page-cta>div:first-child,.project-narrative,.project-title';
  const textTargets=groups+',h1,h2,.page-intro,.body-copy,.hero-description,.project-card>p,.legal-document p';
  // A grouped block animates once; its descendants must not animate a second time.
  const textCandidate=element=>element.closest('main')&&!element.parentElement?.closest(groups);
  const items=[...document.querySelectorAll(textTargets)].filter(textCandidate).map(element=>({element,image:false}));
  const effects=observeAppearances(items,{signal});if(!effects)return;
  const register=image=>{if(!image.closest('header,footer'))effects.register(image,true);};
  document.querySelectorAll('img').forEach(register);
  const mutations=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.removedNodes)if(node.nodeType===1){effects.remove(node);node.querySelectorAll(textTargets+',img').forEach(element=>effects.remove(element));}
      for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches('img'))register(node);node.querySelectorAll('img').forEach(register);if(node.matches(textTargets)&&textCandidate(node))effects.register(node);node.querySelectorAll(textTargets).forEach(element=>{if(textCandidate(element))effects.register(element);});}
    }
  });
  mutations.observe(document.body,{childList:true,subtree:true});signal.addEventListener('abort',()=>mutations.disconnect(),{once:true});
}

function initBackToTop(signal){
  const button=document.createElement('button');button.type='button';button.className='back-to-top';
  button.setAttribute('aria-label','Вернуться наверх');button.title='Вернуться наверх';button.hidden=true;
  button.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 20V4M5 11l7-7 7 7"/></svg>';
  document.body.append(button);
  const update=()=>{button.hidden=scrollY<Math.max(400,innerHeight*.6);};
  button.addEventListener('click',()=>{
    window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    document.querySelector('#main-content')?.focus({preventScroll:true});
  },{signal});
  addEventListener('scroll',update,{passive:true,signal});addEventListener('resize',update,{signal});update();
  signal.addEventListener('abort',()=>button.remove(),{once:true});
}



function initHeaderOffset(signal){
  const header=document.querySelector('.header');if(!header)return;
  let previous=0;
  const update=()=>{
    if(signal.aborted)return;
    const height=Math.ceil(header.getBoundingClientRect().height);
    if(height!==previous){previous=height;document.documentElement.style.setProperty('--header-height',height+'px');}
  };
  update();
  if('ResizeObserver' in window)watch(new ResizeObserver(update),signal).observe(header);
  else addEventListener('resize',update,{signal});
  document.fonts?.ready.then(update).catch(()=>{});
}
