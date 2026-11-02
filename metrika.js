// No requests to analytics before a separate explicit consent.
(() => {
  if (/^\/(admin|api)(?:\/|$)/.test(location.pathname)) return;
  const VERSION='2026-11-01',KEY='epiphany.analytics-consent',MAX_AGE=180*86400000;
  const banner=document.querySelector('#cookie-banner');
  let started=false;
  function load(){
    if(started)return;started=true;
    (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      k=e.createElement(t);a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;a.parentNode.insertBefore(k,a);
    })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=113965901','ym');
    window.ym(113965901,'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:'dataLayer',referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
  }
  function clearAnalytics(){
    try { for(const key of Object.keys(localStorage))if(/^_ym|^ymex$|^ytm_|^zz$/.test(key))localStorage.removeItem(key); } catch {}
    for(const entry of document.cookie.split(';')){
      const name=entry.split('=')[0].trim();if(!/^_ym/.test(name))continue;
      for(const domain of ['',location.hostname,'.'+location.hostname])document.cookie=name+'=; Max-Age=0; Path=/; Secure; SameSite=Lax'+(domain?'; Domain='+domain:'');
    }
  }
  function choose(accepted){
    try{localStorage.setItem(KEY,JSON.stringify({version:VERSION,accepted,at:Date.now()}));}catch{}
    if(banner)banner.hidden=true;
    if(accepted)load();else{clearAnalytics();if(started)location.reload();}
  }
  let saved;
  try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
  const valid=saved&&saved.version===VERSION&&typeof saved.accepted==='boolean'&&Number.isFinite(saved.at)&&Date.now()-saved.at>=0&&Date.now()-saved.at<MAX_AGE;
  if(valid){if(saved.accepted)load();else clearAnalytics();}else if(banner)banner.hidden=false;
  document.querySelector('[data-cookie-accept]')?.addEventListener('click',()=>choose(true));
  document.querySelector('[data-cookie-reject]')?.addEventListener('click',()=>choose(false));
  const bindSettings=()=>document.querySelectorAll('[data-cookie-settings]').forEach(button=>button.addEventListener('click',()=>{if(banner){banner.hidden=false;banner.querySelector('[data-cookie-accept]')?.focus();}}));
  bindSettings();
  document.addEventListener?.('site:navigated',bindSettings);
})();
