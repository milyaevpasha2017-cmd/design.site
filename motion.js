import {watch} from './page-lifecycle.js';
// Native scrolling remains in charge; no wheel interception or forced sections.
export function initMotion(signal){
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
