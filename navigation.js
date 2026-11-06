// Progressive SPA navigation over the existing server-rendered public pages.
export function publicPage(url,base){
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return false;
  const path=url.pathname.slice(base.pathname.length);
  return /^(?:(?:projects(?:\/[a-z0-9-]+)?|about|services|videos|contact|quiz|terms|privacy|consent|cookies)\/?)?$/.test(path);
}
export function startNavigation(mount,dispose){
  if(!history.pushState||!window.fetch||!window.DOMParser)return;
  const base=new URL(document.querySelector('.logo').href),positions=new Map();
  let serial=0,currentURL=location.href,transition=null,loading=null;
  const key=()=>history.state?.epiphanyPage;
  const newKey=()=>crypto.randomUUID?.()||String(Date.now())+':'+Math.random();
  history.replaceState({...history.state,epiphanyPage:key()||newKey()},'');history.scrollRestoration='manual';
  const save=()=>positions.set(key(),[scrollX,scrollY]);
  addEventListener('scroll',save,{passive:true});
  const metadata='meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"],script[type="application/ld+json"]';
  function settle(url,position){
    let target=null;
    try{target=url.hash&&document.getElementById(decodeURIComponent(url.hash.slice(1)));}catch{}
    if(position)scrollTo({left:position[0],top:position[1],behavior:'instant'});
    else if(target)target.scrollIntoView({block:'start',behavior:'instant'});
    else scrollTo({top:0,left:0,behavior:'instant'});
    (target||document.querySelector('main'))?.focus({preventScroll:true});
  }
  async function navigate(url,{pop=false,position=null}={}){
    const ticket=++serial,from=currentURL;
    loading?.abort();loading=new AbortController();transition?.skipTransition();
    document.documentElement.classList.add('page-loading');
    try{
      const response=await fetch(url.href,{credentials:'same-origin',headers:{Accept:'text/html'},signal:AbortSignal.any([loading.signal,AbortSignal.timeout(12000)])});
      if(ticket!==serial)return;
      if(!response.ok||!response.headers.get('Content-Type')?.includes('text/html'))throw Error('Navigation fallback');
      const next=new DOMParser().parseFromString(await response.text(),'text/html');
      if(ticket!==serial)return;
      const finalURL=new URL(response.url||url.href);finalURL.hash=url.hash;
      if(!publicPage(finalURL,base)||!next.querySelector('main')||!next.body.dataset.page||!next.title)throw Error('Unsupported page');
      const commit=()=>{
        if(ticket!==serial)return;
        const cookie=document.querySelector('#cookie-banner');
        if(cookie)next.querySelector('#cookie-banner')?.replaceWith(cookie);
        dispose();document.body.replaceChildren(...[...next.body.childNodes].map(node=>document.adoptNode(node)));
        document.body.className=next.body.className;document.body.dataset.page=next.body.dataset.page;
        for(const role of ['fontBody','fontDisplay'])document.body.dataset[role]=next.body.dataset[role]||'';
        document.title=next.title;document.head.querySelectorAll(metadata).forEach(el=>el.remove());
        next.head.querySelectorAll(metadata).forEach(el=>document.head.append(document.adoptNode(el)));
        if(!pop)history.pushState({epiphanyPage:newKey()},'',finalURL.href);
        else if(finalURL.href!==location.href)history.replaceState({...history.state},'',finalURL.href);
        currentURL=location.href;mount({fromNavigation:true});settle(finalURL,position);
        document.dispatchEvent(new CustomEvent('site:navigated'));
        try{window.ym?.(113965901,'hit',finalURL.href,{title:document.title,referer:from});}catch{}
      };
      if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        let committed=false;
        try{transition=document.startViewTransition(()=>{commit();committed=true;});await transition.updateCallbackDone;await transition.finished.catch(()=>{});}
        catch{if(!committed)commit();}
      }else commit();
    }catch(error){if(ticket===serial&&error.name!=='AbortError')location.assign(url.href);}
    finally{if(ticket===serial){document.documentElement.classList.remove('page-loading');loading=null;}}
  }
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest?.('a[href]');if(!link||link.target||link.hasAttribute('download')||link.hasAttribute('data-no-spa'))return;
    const url=new URL(link.href);if(!publicPage(url,base)||url.pathname===location.pathname&&url.search===location.search)return;
    if(document.querySelector('#brief-form[aria-busy="true"]')){event.preventDefault();return;}
    event.preventDefault();save();void navigate(url);
  });
  addEventListener('popstate',()=>{
    const url=new URL(location.href);
    if(!publicPage(url,base)){location.reload();return;}
    if(url.pathname+url.search===new URL(currentURL).pathname+new URL(currentURL).search){currentURL=url.href;settle(url,positions.get(key()));return;}
    void navigate(url,{pop:true,position:positions.get(key())||null});
  });
  addEventListener('pageshow',event=>{if(event.persisted){currentURL=location.href;document.documentElement.classList.remove('page-loading');}});
}
