import {watch} from './page-lifecycle.js';
// Native scrolling remains in charge; no wheel interception or forced sections.
export function initMotion(signal){
  initImageAppearance(signal);
  initBackToTop(signal);
  if(document.body.dataset.page!=='home')return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const grid=document.querySelector('#selected-projects .project-grid'),controls=document.querySelector('.project-rail-controls');
  if(grid&&controls&&grid.children.length>1){
    grid.classList.add('project-rail');grid.setAttribute('aria-label','Избранные проекты: листайте галерею');
    controls.hidden=false;
    grid.tabIndex=0;grid.setAttribute('role','region');grid.setAttribute('aria-roledescription','карусель');
    const cards=[...grid.children],prev=controls.querySelector('[data-rail-prev]'),next=controls.querySelector('[data-rail-next]');
    let index=0,targetIndex=0,frame=0,paint=0,moving=false;
    const limit=()=>Math.max(0,grid.scrollWidth-grid.clientWidth);
    const position=card=>Math.min(limit(),card.offsetLeft-grid.firstElementChild.offsetLeft);
    const update=()=>{
      paint=0;if(signal.aborted)return;
      index=cards.reduce((best,card,i)=>Math.abs(position(card)-grid.scrollLeft)<Math.abs(position(cards[best])-grid.scrollLeft)?i:best,0);
      if(!moving)targetIndex=index;
      prev.disabled=(moving?targetIndex===0:grid.scrollLeft<=2);
      next.disabled=(moving?targetIndex===cards.length-1:grid.scrollLeft>=limit()-2);
      const count=String(index+1).padStart(2,'0')+' / '+String(cards.length).padStart(2,'0');
      const label=controls.querySelector('.project-rail-count');if(label.textContent!==count)label.textContent=count;
      controls.style.setProperty('--rail-progress',String(limit()?grid.scrollLeft/limit():1));
      cards.forEach(card=>{
        const distance=Math.max(-1,Math.min(1,(position(card)-grid.scrollLeft)/Math.max(1,grid.clientWidth)));
        card.style.setProperty('--rail-shift',reduced.matches?'0px':(distance*28).toFixed(2)+'px');
        card.style.setProperty('--rail-scale',reduced.matches?'1':String(1-Math.abs(distance)*.035));
      });
    };
    const queue=()=>{if(!paint)paint=requestAnimationFrame(update);};
    const stop=()=>{cancelAnimationFrame(frame);frame=0;moving=false;grid.classList.remove('rail-moving');update();};
    const go=delta=>{
      const destination=Math.max(0,Math.min(cards.length-1,(moving?targetIndex:index)+delta));
      cancelAnimationFrame(frame);targetIndex=destination;
      const from=grid.scrollLeft,to=position(cards[destination]);
      if(reduced.matches){moving=false;grid.classList.remove('rail-moving');grid.scrollTo({left:to,behavior:'instant'});update();return;}
      moving=true;grid.classList.add('rail-moving');update();let started;
      const tick=time=>{
        if(signal.aborted)return;
        started??=time;const progress=Math.min(1,(time-started)/700),ease=1-(1-progress)**4;
        grid.scrollLeft=from+(to-from)*ease;update();
        if(progress<1)frame=requestAnimationFrame(tick);else stop();
      };
      frame=requestAnimationFrame(tick);
    };
    prev.addEventListener('click',()=>go(-1),{signal});next.addEventListener('click',()=>go(1),{signal});
    grid.addEventListener('keydown',event=>{
      if(event.target!==grid||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();go(event.key==='Home'?-cards.length:event.key==='End'?cards.length:event.key==='ArrowLeft'?-1:1);
    },{signal});
    grid.addEventListener('scroll',queue,{passive:true,signal});
    grid.addEventListener('pointerdown',stop,{passive:true,signal});grid.addEventListener('wheel',stop,{passive:true,signal});
    addEventListener('resize',stop,{signal});reduced.addEventListener('change',stop,{signal});
    signal.addEventListener('abort',()=>{cancelAnimationFrame(frame);cancelAnimationFrame(paint);},{once:true});update();
  }
  if(!('IntersectionObserver' in window))return;
  const visible=new Set();let queued=false;
  const update=()=>{queued=false;if(signal.aborted||reduced.matches)return;for(const image of visible){const rect=image.parentElement.getBoundingClientRect(),range=innerHeight+rect.height,progress=Math.max(0,Math.min(1,(innerHeight-rect.top)/range));image.style.setProperty('--image-drift',((progress-.5)*24).toFixed(2)+'px');}};
  const queue=()=>{if(!queued&&!reduced.matches&&visible.size){queued=true;requestAnimationFrame(update);}};
  const watcher=watch(new IntersectionObserver(entries=>{entries.forEach(entry=>{entry.isIntersecting?visible.add(entry.target):visible.delete(entry.target);});queue();}),signal);
  document.querySelectorAll('#selected-projects .card-photo').forEach(image=>watcher.observe(image));
  const reveal=watch(new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){if(!reduced.matches)entry.target.classList.add('motion-arrived');reveal.unobserve(entry.target);}}),{threshold:.2}),signal);
  document.querySelectorAll('.decision-intro h2,.intro-copy h2,.home-services>h2,.quiz-teaser>div:first-child').forEach(el=>reveal.observe(el));
  const art=document.querySelector('.quiz-teaser-art');if(art)watch(new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('art-moving',entry.isIntersecting))),signal).observe(art);
  addEventListener('scroll',queue,{passive:true,signal});addEventListener('resize',queue,{signal});
  reduced.addEventListener('change',()=>{if(reduced.matches)visible.forEach(image=>image.style.removeProperty('--image-drift'));else queue();},{signal});
}

function initImageAppearance(signal){
  if(!('IntersectionObserver' in window)||!Element.prototype.animate)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const registered=new WeakSet(),seen=new WeakSet(),visible=new Set(),animations=new Set();
  const appear=image=>{
    if(signal.aborted||seen.has(image)||!image.complete||!image.naturalWidth)return;
    seen.add(image);
    if(reduced.matches)return;
    const animation=image.animate([{opacity:0},{opacity:1}],{duration:650,easing:'cubic-bezier(.22,.61,.36,1)'});
    animations.add(animation);animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
  };
  const observer=watch(new IntersectionObserver(entries=>{
    for(const entry of entries){if(entry.isIntersecting){visible.add(entry.target);appear(entry.target);}else visible.delete(entry.target);}
  },{threshold:0}),signal);
  const register=image=>{
    if(registered.has(image))return;registered.add(image);observer.observe(image);
    image.addEventListener('load',()=>{seen.delete(image);if(visible.has(image))appear(image);},{signal});
  };
  document.querySelectorAll('img').forEach(register);
  // Includes gallery thumbnails, enlarged photos and images added by page widgets.
  const mutations=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.removedNodes){if(node.nodeType===1){if(node.matches('img')){visible.delete(node);observer.unobserve(node);}node.querySelectorAll('img').forEach(image=>{visible.delete(image);observer.unobserve(image);});}}
      for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches('img'))register(node);node.querySelectorAll('img').forEach(register);}
    }
  });
  mutations.observe(document.body,{childList:true,subtree:true});
  reduced.addEventListener('change',()=>{if(reduced.matches)animations.forEach(animation=>animation.cancel());},{signal});
  signal.addEventListener('abort',()=>{mutations.disconnect();animations.forEach(animation=>animation.cancel());visible.clear();},{once:true});
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

