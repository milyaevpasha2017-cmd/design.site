import {watch} from './page-lifecycle.js';
// Native scrolling remains in charge; no wheel interception or forced sections.
export function initMotion(signal){
  if(document.body.dataset.page!=='home')return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const grid=document.querySelector('#selected-projects .project-grid'),controls=document.querySelector('.project-rail-controls');
  if(grid&&controls&&grid.children.length>1){
    grid.classList.add('project-rail');grid.setAttribute('aria-label','Избранные проекты: листайте галерею');
    controls.hidden=false;const cards=[...grid.children],prev=controls.querySelector('[data-rail-prev]'),next=controls.querySelector('[data-rail-next]');let index=0,queued=false;
    const position=card=>card.getBoundingClientRect().left-grid.getBoundingClientRect().left+grid.scrollLeft;
    const update=()=>{queued=false;index=cards.reduce((best,card,i)=>Math.abs(position(card)-grid.scrollLeft)<Math.abs(position(cards[best])-grid.scrollLeft)?i:best,0);prev.disabled=grid.scrollLeft<=2;next.disabled=grid.scrollLeft>=grid.scrollWidth-grid.clientWidth-2;controls.querySelector('.project-rail-count').textContent=String(index+1).padStart(2,'0')+' / '+String(cards.length).padStart(2,'0');};
    const go=delta=>grid.scrollTo({left:position(cards[Math.max(0,Math.min(cards.length-1,index+delta))]),behavior:reduced.matches?'instant':'smooth'});
    prev.addEventListener('click',()=>go(-1));next.addEventListener('click',()=>go(1));
    grid.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update);}},{passive:true});addEventListener('resize',update,{signal});update();
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
