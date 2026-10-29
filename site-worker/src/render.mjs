// Server-rendered HTML for live CMS content. Keep the static Python build as a
// deployment fallback and check both renderers against the same content.
export const routes={home:'',projects:'projects/',about:'about/',services:'services/',videos:'videos/',contact:'contact/'};
const e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
const icon=(name='arrow-up-right')=>`<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const paragraphs=items=>(items||[]).map(item=>`<p class="body-copy">${e(item)}</p>`).join('');
const heading=(title,emphasis='',level=1)=>`<h${level}><span>${e(title)}</span>${emphasis?'<br><em>'+e(emphasis)+'</em>':''}</h${level}>`;
const safeJSON=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('&','\\u0026');

export class Site {
  constructor(content,url,icons){
    this.url=url.replace(/\/$/,'')+'/';this.icons=icons;
    this.settings=content['content/settings.json'];this.ui=this.settings.ui;
    this.pages=Object.fromEntries(Object.keys(routes).map(key=>[key,content[`content/pages/${key}.json`]]));
    this.projects=Object.entries(content).filter(([file,p])=>file.startsWith('content/projects/')&&p.published!==false).map(([,p])=>p)
      .sort((a,b)=>(a.order??10)-(b.order??10)||(a.slug<b.slug?-1:a.slug>b.slug?1:0));
  }
  link(key){return '/'+routes[key];}
  projectLink(p){return '/projects/'+p.slug+'/';}
  image(value){
    if(typeof value!=='string'||!value)return '';
    if(/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)){
      try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?value:'';}catch{return '';}
    }
    let path=value.replace(/^\/+/, '');if(path==='assets/living.png')path='assets/living-1536.webp';return path.startsWith('assets/')&&!path.split('/').includes('..')?'/'+path:'';
  }
  photo(value,alt,cls='',priority=false){
    const src=this.image(value);if(!src)return '';
    let responsive='';
    if(value.replace(/^\/+/, '')==='assets/living.png'){
      const sizes=cls==='hero-photo'?'(max-width: 600px) 150vw, (max-width: 1600px) 90vw, 1440px':priority?'(max-width: 1600px) 90vw, 1440px':'(max-width: 600px) 88vw, (max-width: 1600px) 44vw, 704px';
      const srcset=[480,960,1536].map(width=>`/assets/living-${width}.webp ${width}w`).join(', ');
      responsive=` width="1536" height="1024" srcset="${srcset}" sizes="${sizes}"`;
    }
    return `<img src="${e(src)}" alt="${e(alt)}" class="${cls}" decoding="async"${responsive} ${priority?'fetchpriority=high':'loading=lazy'}>`;
  }
  button(key,label,cls='text-link'){return `<a class="${cls}" href="${this.link(key)}">${e(label)}${icon()}</a>`;}
  contacts(){
    const links=[];
    for(const key of ['telegram','email','vk','youtube']){
      const value=(this.settings.contacts[key]||'').trim();if(!value)continue;
      let url;
      if(key==='email'){if(!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value))continue;url='mailto:'+value;}
      else{
        try{const parsed=new URL(value),hosts={telegram:['t.me'],youtube:['youtube.com','www.youtube.com','youtu.be'],vk:['vk.com','www.vk.com','vk.ru','www.vk.ru']};
          if(parsed.protocol!=='https:'||!hosts[key].includes(parsed.hostname)||parsed.username||parsed.password)continue;url=value;
        }catch{continue;}
      }
      links.push(`<a href="${e(url)}"${key!=='email'?' target="_blank" rel="noopener noreferrer"':''}>${e(this.ui[key])}${icon()}</a>`);
    }
    return links.length?'<div class="contact-links">'+links.join('')+'</div>':'';
  }
  nav(current){return ['projects','about','services','videos','contact'].map(key=>`<a href="${this.link(key)}"${current===key?' aria-current="page"':''}>${e(this.ui[key])}</a>`).join('');}
  shell(title,description,body,current,path='',extra=''){
    const s=this.settings,canonical=this.url+path;
    const logo=`<a class="logo" href="/"><span class="brand-name">${e(s.brand)}</span><span>${e(s.brand_subtitle)}</span></a>`;
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(title)}</title><meta name="description" content="${e(description)}"><meta name="theme-color" content="#f5f3ee"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}"><meta property="og:locale" content="ru_RU"><link rel="canonical" href="${e(canonical)}"><link rel="stylesheet" href="/style.css"><script type="module" src="/script.js"></script></head><body><a class="skip-link" href="#main-content">${e(this.ui.skip)}</a>${this.icons}<header class="header">${logo}<button class="menu-toggle" aria-expanded="false" aria-controls="navigation">${e(this.ui.menu)}${icon('menu')}</button><nav id="navigation" aria-label="Основная навигация">${this.nav(current)}</nav></header><main id="main-content" tabindex="-1">${body}</main><footer>${logo}<p>${e(s.footer_tagline)}</p><a href="#main-content">${e(this.ui.top)} ↑</a><nav class="footer-nav" aria-label="Навигация в подвале">${this.nav(current)}</nav><p class="footer-note">${e(s.footer_note)}</p></footer>${extra}</body></html>`;
  }
  pageHead(p,current){return `<section class="page-heading section"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">${e(this.ui.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${e(this.ui[current])}</span></nav><p class="eyebrow">${e(p.label)}</p>${heading(p.title,p.emphasis)}<p class="page-intro">${e(p.intro)}</p></section>`;}
  cta(p){return `<section class="contact section page-cta"><div><p class="eyebrow">${e(p.label)}</p>${heading(p.title,p.emphasis,2)}<p>${e(p.intro)}</p></div><div>${this.button('contact',p.button,'submit')}${this.contacts()}</div></section>`;}
  cards(projects,level=3){
    return projects.length?'<div class="project-grid">'+projects.map((p,i)=>`<a class="project-card${i%3===2?' wide':''}" href="${this.projectLink(p)}"><div class="project-image">${this.photo(p.image,p.image_alt,'card-photo')}<span class="project-arrow">${icon()}</span></div><div class="project-title"><h${level}>${e(p.title)}</h${level}><span>${String(i+1).padStart(2,'0')}</span></div><p>${e(p.subtitle)}</p></a>`).join('')+'</div>':`<p class="empty-state">${e(this.ui.empty_projects)}</p>`;
  }
  steps(p){return `<section class="process section"><p class="eyebrow">${e(p.process_label)}</p>${heading(p.process_title,p.process_emphasis,2)}<div class="steps">`+this.pages.services.steps.map(x=>`<article><span>${e(x.label)}</span><h3>${e(x.title)}</h3><p>${e(x.description)}</p></article>`).join('')+'</div></section>';}
  home(){
    const p=this.pages.home;
    const body=`<section class="hero"><div class="hero-top"><p class="eyebrow">${e(p.label)}</p><span class="availability"><i></i>${e(p.availability)}</span></div><div class="hero-title"><h1><span>${e(p.title)}</span> <em>${e(p.emphasis)}</em></h1><div class="hero-intro"><div class="hero-intro-copy"><p>${e(p.intro)}</p>${this.button('contact',p.button,'hero-cta')}</div><a class="circle-link" href="/projects/" aria-label="${e(p.explore)}">${icon('arrow-down')}</a></div></div><div class="hero-image">${this.photo(p.image,p.image_alt,'hero-photo',true)}<div class="image-caption"><span>${e(p.caption)}</span><span>${e(p.image_note)}</span></div></div><div class="hero-bottom"><p>${e(p.bottom)}</p>${this.button('projects',p.explore)}</div></section>
<section class="projects section"><div class="section-heading"><div><p class="eyebrow">${e(p.projects_label)}</p>${heading(p.projects_title,p.projects_emphasis,2)}</div><p class="small-note">${e(p.projects_note)}</p></div>${this.cards(this.projects.slice(0,3))}<div class="section-more">${this.button('projects',this.ui.all_projects)}</div></section>
<section class="intro section"><p class="eyebrow">${e(p.about_label)}</p><div>${heading(p.about_title,p.about_emphasis,2)}<p class="body-copy">${e(p.about_intro)}</p>${this.button('about',this.ui.more_about)}</div></section>
<section class="section home-services"><p class="eyebrow">${e(p.services_label)}</p>${heading(p.services_title,p.services_emphasis,2)}<div class="service-teasers">`+
      this.pages.services.items.map((item,i)=>`<a href="/services/#service-${i+1}"><span class="eyebrow">${String(i+1).padStart(2,'0')}</span><h3>${e(item.title)}</h3>${icon()}</a>`).join('')+`</div>${this.button('services',this.ui.all_services)}</section>`+this.cta(p.cta);
    return this.shell(p.seo_title,p.seo_description,body,'home');
  }
  form(p){
    const f=p.form;
    const fields=['name','contact','message'].map(name=>{
      const field=name==='message'?`<textarea dir="auto" id="${name}" name="${name}" rows="3" required maxlength="3000" placeholder="${e(f[name+'_placeholder'])}"></textarea>`:`<input dir="auto" id="${name}" name="${name}" required maxlength="150" autocomplete="${name==='name'?'name':'email'}" placeholder="${e(f[name+'_placeholder'])}">`;
      return `<label for="${name}">${e(f[name+'_label'])}</label>${field}`;
    }).join('');
    return `<noscript><p class="body-copy">${e(f.nojs_note)}</p></noscript><form id="brief-form" hidden><h2 class="form-title">${e(p.form_title)}</h2>${fields}<button class="submit" type="submit">${e(f.submit)}${icon()}</button><p class="form-note">${e(f.note)}</p><div id="brief-result" hidden role="status"><p>${e(f.result)}</p><textarea id="brief-text" readonly aria-label="Текст обращения" rows="6"></textarea><button type="button" id="copy-brief">${e(f.copy)}</button><span id="copy-status" aria-live="polite"></span><a class="email-brief" id="email-brief" hidden>${e(f.email_button)}${icon()}</a></div></form><script id="form-data" type="application/json">${safeJSON({form:f,email:this.settings.contacts.email||''})}</script>`;
  }
  standardPage(key){
    const p=this.pages[key];let body=this.pageHead(p,key);
    if(key==='projects')body+='<section class="section portfolio-section">'+this.cards(this.projects,2)+'</section>';
    else if(key==='about')body+=`<section class="section about-story"><div class="about-image">${this.photo(p.image,p.image_alt)}</div><div class="about-copy">${paragraphs(p.paragraphs)}<h2 class="minor-title">${e(p.principles_title)}</h2><div class="principles">`+p.principles.map(x=>`<span>${e(x)}</span>`).join('')+'</div></div></section>'+this.steps(p);
    else if(key==='services')body+='<section class="section service-editorial">'+p.items.map((x,i)=>`<article id="service-${i+1}"><span class="eyebrow">${String(i+1).padStart(2,'0')}</span><div><h2>${e(x.title)}</h2><p class="body-copy">${e(x.description)}</p></div>${this.button('contact',this.ui.discuss)}</article>`).join('')+'</section>'+this.steps(p);
    else if(key==='videos'){
      body+='<section class="section videos-page"><div class="video-grid">';
      for(const video of p.items||[])body+=`<article class="video-card" data-video-url="${e(video.url)}"><div class="video-frame">${this.photo(video.poster||'',video.title,'video-poster')}<button class="video-play" type="button">${e(this.ui.watch_video)}</button></div><h2>${e(video.title)}</h2><p>${e(video.description)}</p><a class="video-source" hidden>${e(this.ui.open_vk)}${icon()}</a></article>`;
      if(!p.items?.length)body+=`<div class="empty-video"><span class="eyebrow">EPIPHANY INTERIOR</span><h2>${e(p.empty_title)}</h2><p class="body-copy">${e(p.empty_text)}</p>${this.contacts()}</div>`;
      body+='</div></section><script id="video-data" type="application/json">'+safeJSON({unavailable:this.ui.video_unavailable})+'</script>';
    }else if(key==='contact')body+=`<section class="contact section contact-page"><div>${this.contacts()}</div>${this.form(p)}</section>`;
    if(p.cta)body+=this.cta(p.cta);
    return this.shell(p.seo_title,p.seo_description,body,key,routes[key]);
  }
  galleryDialog(){return `<dialog id="project-dialog" aria-labelledby="dialog-title"><div class="dialog-toolbar"><p class="eyebrow" id="dialog-title"></p><button class="dialog-close" aria-label="Закрыть фотографии">${icon('close')}</button></div><div class="project-viewer" id="project-viewer"><img id="dialog-photo" alt="" decoding="async"><div class="viewer-controls" id="viewer-controls" hidden><button type="button" id="photo-previous" aria-label="Предыдущее фото">${icon('arrow-left')}</button><span id="photo-count" aria-live="polite"></span><button type="button" id="photo-next" aria-label="Следующее фото">${icon('arrow-right')}</button></div></div><div class="project-gallery" id="project-gallery" role="group" aria-label="Фотографии проекта"></div></dialog>`;}
  projectPage(p,index){
    const photos=[{image:p.image,alt:p.image_alt},...(p.images||[])].filter(x=>this.image(x.image||'')).map(x=>({url:this.image(x.image),alt:x.alt??p.title}));
    const crumbs=`<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">${e(this.ui.home)}</a><span>/</span><a href="/projects/">${e(this.ui.projects)}</a><span>/</span><span aria-current="page">${e(p.title)}</span></nav>`;
    let body=`<section class="section project-heading">${crumbs}<p class="eyebrow">${e(p.is_concept?this.ui.concept_label:this.ui.project_label)}</p>${heading(p.title)}<p class="page-intro">${e(p.subtitle)}</p><div class="project-facts">`+['location','area','year'].filter(k=>p[k]).map(k=>`<span>${e(p[k])}</span>`).join('')+'</div></section>';
    body+='<section class="section project-story">';
    if(photos.length)body+=`<button class="project-cover" data-gallery-open="0" aria-label="${e(this.ui.open_photo)}">${this.photo(p.image,p.image_alt,'',true)}<span class="project-arrow">${icon()}</span></button>`;
    body+=`<div class="project-narrative"><p class="project-lead">${e(p.description)}</p>${paragraphs(p.body)}</div>`;
    if(p.is_concept)body+=`<p class="form-note concept-note">${e(this.ui.concept_note)}</p>`;
    body+='<div class="project-photo-grid">';
    for(const [i,photo]of photos.slice(1).entries())body+=`<figure><button data-gallery-open="${i+1}" aria-label="${e(this.ui.open_photo)}: ${e(photo.alt)}"><img src="${e(photo.url)}" alt="${e(photo.alt)}" loading="lazy" decoding="async"></button><figcaption>${e(photo.alt)}</figcaption></figure>`;
    body+='</div></section><nav class="project-pagination section" aria-label="Другие проекты">';
    if(index>0)body+=`<a href="${this.projectLink(this.projects[index-1])}">${icon('arrow-left')}<span><small>${e(this.ui.previous_project)}</small>${e(this.projects[index-1].title)}</span></a>`;
    body+=this.button('projects',this.ui.back_projects);
    if(index+1<this.projects.length)body+=`<a href="${this.projectLink(this.projects[index+1])}"><span><small>${e(this.ui.next_project)}</small>${e(this.projects[index+1].title)}</span>${icon()}</a>`;
    body+='</nav>'+this.cta(this.pages.projects.cta);
    const extra=this.galleryDialog()+`<script id="gallery-data" type="application/json">${safeJSON({title:p.title,photos})}</script>`;
    return this.shell(p.title+' — Epiphany Interior',p.seo_description||p.description,body,'projects','projects/'+p.slug+'/',extra);
  }
  notFound(){const u=this.ui;return this.shell(u.not_found_title,u.not_found_text,`<section class="section page-heading"><p class="eyebrow">404</p>${heading(u.not_found_title)}<p class="page-intro">${e(u.not_found_text)}</p>${this.button('home',u.home)}</section>`,'');}
  failure(){return this.shell('Сайт временно недоступен — Epiphany Interior','Не удалось загрузить актуальные данные.',`<section class="section page-heading state-page"><p class="eyebrow">ВРЕМЕННАЯ ОШИБКА</p>${heading('Не удалось загрузить страницу')}<p class="page-intro">Повторите загрузку через несколько секунд. Если вопрос срочный, напишите нам напрямую.</p><a class="text-link" href="">Повторить загрузку ${icon()}</a>${this.contacts()}</section>`,'');}
  sitemap(){return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...Object.values(routes),...this.projects.map(p=>'projects/'+p.slug+'/')].map(path=>'<url><loc>'+e(this.url+path)+'</loc></url>').join('')+'</urlset>';}
  response(path){
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'text/html; charset=utf-8'};
    if(path==='/sitemap.xml')return new Response(this.sitemap(),{headers:{...headers,'Content-Type':'application/xml; charset=utf-8'}});
    if(path.endsWith('/index.html'))return new Response(null,{status:301,headers:{...headers,Location:path.slice(0,-10)}});
    const key=Object.keys(routes).find(key=>'/'+routes[key]===path);
    if(key)return new Response(key==='home'?this.home():this.standardPage(key),{headers});
    const match=path.match(/^\/projects\/([a-z0-9-]+)\/$/);
    const index=match?this.projects.findIndex(p=>p.slug===match[1]):-1;
    if(index>=0)return new Response(this.projectPage(this.projects[index],index),{headers});
    if(!path.endsWith('/')&&(Object.values(routes).includes(path.slice(1)+'/')||this.projects.some(p=>path==='/projects/'+p.slug)))return new Response(null,{status:301,headers:{...headers,Location:path+'/'}});
    return new Response(this.notFound(),{status:404,headers});
  }
}
