import IMAGE_MANIFEST from './image-manifest.json' with {type:'json'};
import {typography} from './typography.mjs';
import DECISIONS from './decisions.json' with {type:'json'};
import QUIZ from './quiz.json' with {type:'json'};
import {DOCUMENTS,LEGAL_VERSION,legalFooter,cookieBanner} from './legal.mjs';
import {richText,plainText} from '../../rich-text.mjs';
// Server-rendered HTML for live CMS content. Keep the static Python build as a
// deployment fallback and check both renderers against the same content.
export const routes={home:'',projects:'projects/',about:'about/',services:'services/',videos:'videos/',contact:'contact/'};
const e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
const icon=(name='arrow-up-right')=>name.startsWith('arrow-')?(name==='arrow-left'||name==='arrow-right'?`<span class="viewer-direction">${name==='arrow-left'?'Назад':'Вперёд'}</span>`:''):`<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const r=richText;
const inline=value=>richText(value,{links:false});
const paragraphs=items=>(items||[]).map(item=>`<p class="body-copy">${r(item)}</p>`).join('');
const heading=(title,emphasis='',level=1)=>`<h${level}><span>${inline(title)}</span>${emphasis?'<br><em>'+inline(emphasis)+'</em>':''}</h${level}>`;
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
    const optimized=IMAGE_MANIFEST[value.replace(/^\/+/, '')];
    if(optimized?.variants){
      const variants=optimized.variants,src=this.image(variants.at(-1).path);
      const sizes=cls==='hero-photo'||cls==='project-photo'||priority?'(max-width: 1600px) 100vw, 1680px':'(max-width: 700px) 90vw, 45vw';
      return `<img src="${e(src)}" srcset="${variants.map(v=>e(this.image(v.path))+' '+v.width+'w').join(', ')}" sizes="${sizes}" width="${optimized.width}" height="${optimized.height}" alt="${e(alt)}" class="${cls}" decoding="async" ${priority?'fetchpriority=high loading=eager':'loading=lazy'}>`;
    }
    let responsive=optimized?.width?` width="${optimized.width}" height="${optimized.height}"`:'';
    if(value.replace(/^\/+/, '')==='assets/living.png'){
      const sizes=cls==='hero-photo'?'(max-width: 1600px) 100vw, 1680px':priority?'(max-width: 1600px) 90vw, 1440px':'(max-width: 600px) 88vw, (max-width: 1600px) 44vw, 704px';
      const srcset=[480,960,1536].map(width=>`/assets/living-${width}.webp ${width}w`).join(', ');
      responsive=` width="1536" height="1024" srcset="${srcset}" sizes="${sizes}"`;
    }
    return `<img src="${e(src)}" alt="${e(alt)}" class="${cls}" decoding="async"${responsive} ${priority?'fetchpriority=high':'loading=lazy'}>`;
  }
  button(key,label,cls='text-link'){return `<a class="${cls}" href="${this.link(key)}${key==='contact'?'#brief-form':''}">${e(label)}${icon()}</a>`;}
  contacts(){
    const links=[];
    for(const key of ['telegram','vk','youtube','email']){
      const value=(this.settings.contacts[key]||'').trim();if(!value)continue;
      let url;
      if(key==='email'){if(!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value))continue;url='mailto:'+value;}
      else{
        try{const parsed=new URL(value),hosts={telegram:['t.me'],youtube:['youtube.com','www.youtube.com','youtu.be'],vk:['vk.com','www.vk.com','vk.ru','www.vk.ru']};
          if(parsed.protocol!=='https:'||!hosts[key].includes(parsed.hostname)||parsed.username||parsed.password)continue;url=value;
        }catch{continue;}
      }
      links.push(`<a href="${e(url)}"${key!=='email'?' target="_blank" rel="noopener noreferrer"':''}><svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-social-${key}"></use></svg><span>${e(key==='email'?value:this.ui[key])}</span></a>`);
    }
    return links.length?'<div class="contact-links">'+links.join('')+'</div>':'';
  }
  nav(current){return ['projects','about','services','videos','contact'].map(key=>`<a href="${this.link(key)}"${current===key?' aria-current="page"':''}>${e(this.ui[key])}</a>`).join('');}
  legalPage(key){
    const doc=DOCUMENTS[key];
    const crumbs=`<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">${e(this.ui.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${e(doc.title)}</span></nav>`;
    const body=`<article class="section legal-document">${crumbs}${heading(doc.title)}<p class="legal-version">Редакция от ${LEGAL_VERSION.split('-v')[0]}</p>`+doc.sections.map(([title,text])=>`<section><h2>${e(title)}</h2><p>${r(text)}</p></section>`).join('')+'</article>';
    return this.shell(doc.title+' — Epiphany Interior',doc.sections[0][1],body,key,key+'/');
  }
  indexable(key){return Boolean(key)&&(key!=='videos'||Boolean(this.pages.videos.items?.length));}
  robots(){return 'User-agent: *\nDisallow: /api/\nDisallow: /deployment.json\n\nSitemap: '+this.url+'sitemap.xml\n';}
  structured(title,description,current,path){
    const canonical=this.url+path;
    const org={'@type':'Organization','@id':this.url+'#organization',name:'Epiphany Interior',url:this.url,logo:this.url+'assets/branding/icon-192.png',email:this.settings.contacts.email||'',sameAs:Object.entries(this.settings.contacts).filter(([k,v])=>k!=='email'&&v.startsWith('https://')).map(([,v])=>v)};
    const website={'@type':'WebSite','@id':this.url+'#website',url:this.url,name:'Epiphany Interior',inLanguage:'ru-RU',publisher:{'@id':org['@id']}};
    const page={'@type':({about:'AboutPage',contact:'ContactPage',projects:'CollectionPage',videos:'CollectionPage'})[current]||'WebPage','@id':canonical+'#webpage',url:canonical,name:plainText(title),description:plainText(description),inLanguage:'ru-RU',isPartOf:{'@id':website['@id']}};
    const graph=[org,website,page],crumbs=[[this.ui.home,this.url]];
    if(path.startsWith('projects/')&&path!=='projects/'){
      const project=this.projects.find(p=>path==='projects/'+p.slug+'/');
      if(project){crumbs.push([this.ui.projects,this.url+'projects/'],[plainText(project.title),canonical]);page['@type']='WebPage';page.primaryImageOfPage={'@type':'ImageObject',url:new URL(this.image(project.image),this.url).href};}
    }else if(current!=='home')crumbs.push([this.ui[current]||DOCUMENTS[current]?.title||(current==='quiz'?'Интерьерный квиз':''),canonical]);
    if(crumbs.length>1){graph.push({'@type':'BreadcrumbList','@id':canonical+'#breadcrumb',itemListElement:crumbs.map(([name,item],i)=>({'@type':'ListItem',position:i+1,name,item}))});page.breadcrumb={'@id':canonical+'#breadcrumb'};}
    return '<script type="application/ld+json">'+safeJSON({'@context':'https://schema.org','@graph':graph})+'</script>';
  }
  social(title,description,current,path){
    const project=this.projects.find(p=>path==='projects/'+p.slug+'/');
    const candidate=project||this.pages[current];
    const record=candidate?.image?candidate:(current==='projects'&&this.projects[0]?.image?this.projects[0]:this.pages.home);
    const source=this.image(record?.image)?record:this.pages.home;
    const data=IMAGE_MANIFEST[source.image?.replace(/^\/+/, '')],preview=data?.social;
    const image=new URL(this.image(preview?.path||source.image),this.url).href;
    const alt=plainText(source.image_alt||source.title||title);
    const tags=[['og:type','website'],['og:site_name','Epiphany Interior'],['og:title',title],['og:description',description],['og:url',this.url+path],['og:locale','ru_RU'],['og:image',image]];
    if(image.startsWith('https:'))tags.push(['og:image:secure_url',image]);
    const type=preview?.type||({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','avif':'image/avif'})[new URL(image).pathname.split('.').at(-1).toLowerCase()];
    if(type)tags.push(['og:image:type',type]);
    if(preview)tags.push(['og:image:width',preview.width],['og:image:height',preview.height]);
    tags.push(['og:image:alt',alt]);
    return tags.map(([property,content])=>`<meta property="${property}" content="${e(content)}">`).join('')+[['twitter:card','summary_large_image'],['twitter:title',title],['twitter:description',description],['twitter:image',image],['twitter:image:alt',alt]].map(([name,content])=>`<meta name="${name}" content="${e(content)}">`).join('');
  }
  shell(title,description,body,current,path='',extra=''){
    const record=this.projects.find(p=>path==='projects/'+p.slug+'/')||this.pages[current];
    const blocks=(record?.text_blocks||[]).filter(b=>b.title?.trim()||b.text?.trim());
    body+=blocks.map(b=>`<section class="section text-block">${b.title?.trim()?heading(b.title,'',2):''}${b.text?.trim()?`<div class="body-copy">${r(b.text)}</div>`:''}</section>`).join('');
    const fonts=typography(this.settings);
    title=plainText(title);description=plainText(description);
    const s=this.settings,canonical=this.url+path,indexable=this.indexable(current);
    const project=this.projects.find(p=>path==='projects/'+p.slug+'/');
    const seo=(current?`<link rel="canonical" href="${e(canonical)}">`:'')+(indexable?'<meta name="robots" content="index,follow,max-image-preview:large">'+this.structured(title,description,current,path):'<meta name="robots" content="noindex,follow">');
    const logo=`<a class="logo logo-with-mark" href="/"><img class="brand-mark" src="/assets/branding/logo-mark.png" width="64" height="74" alt="" aria-hidden="true"><span class="brand-wordmark"><span class="brand-name">${e(s.brand)}</span><span class="brand-subtitle">${e(s.brand_subtitle)}</span></span></a>`;
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(title)}</title><meta name="description" content="${e(description)}"><meta name="theme-color" content="#f5f3ee"><link rel="icon" type="image/x-icon" href="/favicon.ico?v=epiphany-1"><link rel="icon" type="image/png" sizes="32x32" href="/assets/branding/icon-32.png?v=epiphany-1"><link rel="icon" type="image/png" sizes="192x192" href="/assets/branding/icon-192.png?v=epiphany-1"><link rel="apple-touch-icon" sizes="180x180" href="/assets/branding/icon-180.png?v=epiphany-1">${this.social(title,description,current,path)}${seo}${[...new Set([fonts.body.file,fonts.display.file,fonts.display.italic].filter(Boolean))].map(file=>`<link rel="preload" href="/assets/fonts/${file}" as="font" type="font/woff2" crossorigin>`).join('')}<link rel="preload" href="/assets/fonts/amsterdam-three-slant.woff" as="font" type="font/woff" crossorigin><link rel="modulepreload" href="/motion.js"><link rel="modulepreload" href="/navigation.js"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/design.css"><script defer src="/metrika.js"></script><script type="module" src="/script.js"></script></head><body data-page="${e(current||'error')}" data-font-body="${fonts.body.id}" data-font-display="${fonts.display.id}"><div class="reading-progress" aria-hidden="true"></div><a class="skip-link" href="#main-content">${e(this.ui.skip)}</a>${this.icons}<header class="header">${logo}<nav id="navigation" aria-label="Основная навигация">${this.nav(current)}</nav><a class="header-apply" href="/contact/#brief-form" aria-label="Оставить заявку"><span class="apply-long">Оставить заявку</span><span class="apply-short">Заявка</span>${icon()}</a><button class="menu-toggle" aria-label="${e(this.ui.menu)}" aria-expanded="false" aria-controls="navigation"><span class="menu-label">${e(this.ui.menu)}</span>${icon('menu')}</button></header><main id="main-content" tabindex="-1">${body}</main><footer>${logo}<nav class="footer-nav" aria-label="Навигация в подвале">${this.nav(current)}</nav><p class="footer-note">${r(s.footer_note)}</p>${legalFooter()}</footer>${cookieBanner()}${extra}</body></html>`;
  }
  pageHead(p,current){return `<section class="page-heading section"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">${e(this.ui.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${e(this.ui[current])}</span></nav><p class="eyebrow">${e(p.label)}</p>${heading(p.title,p.emphasis)}<p class="page-intro">${r(p.intro)}</p></section>`;}
  cta(p){return `<section class="contact section page-cta"><div><p class="eyebrow">${e(p.label)}</p>${heading(p.title,p.emphasis,2)}<p>${r(p.intro)}</p></div><div>${this.button('contact',p.button,'submit')}${this.contacts()}</div></section>`;}
  cards(projects,level=3){
    return projects.length?'<div class="project-grid">'+projects.map((p,i)=>`<a class="project-card${i%3===2?' wide':''}" href="${this.projectLink(p)}"><div class="project-image">${this.photo(p.image,p.image_alt,'card-photo')}<span class="project-arrow">${icon()}</span></div><div class="project-title"><h${level}>${inline(p.title)}</h${level}><span>${String(i+1).padStart(2,'0')}</span></div><p>${inline(p.subtitle)}</p></a>`).join('')+'</div>':`<p class="empty-state">${e(this.ui.empty_projects)}</p>`;
  }
  steps(p){return `<section class="process section"><p class="eyebrow">${e(p.process_label)}</p>${heading(p.process_title,p.process_emphasis,2)}<div class="steps">`+this.pages.services.steps.map(x=>`<article><span>${e(x.label)}</span><h3>${inline(x.title)}</h3><p>${r(x.description)}</p></article>`).join('')+'</div></section>';}
  decisions(){
    const d=this.pages.home.decisions??DECISIONS.defaults;
    const topics=['layout','light','materials'];
    const pins=topics.map((key,i)=>`<button type="button" class="decision-pin pin-${key}" data-decision="${key}" aria-controls="decision-${key}" aria-expanded="${i===0}" aria-label="${e(plainText(d[key]?.label||''))}"><span>0${i+1}</span><small>${inline(d[key]?.label||'')}</small></button>`).join('');
    const notes=topics.map((key,i)=>{const x=d[key]||{};return `<details id="decision-${key}" class="decision-note"${i===0?' open':''}><summary><span>0${i+1}</span>${inline(x.label||'')}</summary><div class="decision-note-body"><h3 tabindex="-1">${inline(x.title||'')}</h3><p>${r(x.description||'')}</p><div class="decision-deliverable"><span>${inline(x.deliverable_label||'')}</span><p>${r(x.deliverable||'')}</p></div><a class="decision-cta" href="/contact/?interest=${key}#brief-form">${inline(x.button||'')}</a></div></details>`;}).join('');
    return `<section class="decision-section" aria-labelledby="decision-heading"><div class="decision-intro"><p class="eyebrow">${inline(d.label||'')}</p><h2 id="decision-heading">${inline(d.title||'')}${d.emphasis?'<br><em>'+inline(d.emphasis)+'</em>':''}</h2><p>${r(d.intro||'')}</p></div><div class="decision-workbench"><figure class="decision-scene">${this.photo(d.image||'',d.image_alt||'')}<div class="decision-pins" hidden>${pins}</div><figcaption>${r(d.image_note||'')}</figcaption></figure><div class="decision-notes"><p class="eyebrow">${inline(d.notes_label||'')}</p>${notes}</div></div><div class="decision-bottom"><span>${inline(d.bottom||'')}</span><a href="/services/">${inline(d.services_link||'')}</a></div></section>`;
  }
  home(){
    const p=this.pages.home;
    const body=`<section class="hero hero-editorial"><div class="hero-top"><p class="eyebrow">${e(p.label)}</p><span class="availability"><i></i>${e(p.availability)}</span></div><div class="hero-composition"><div class="hero-copy"><h1><span>${inline(p.title)}</span> <em>${inline(p.emphasis)}</em></h1><p class="hero-description">${r(p.intro)}</p><div class="hero-actions">${this.button('contact',p.button,'hero-cta')}<a class="hero-secondary" href="#selected-projects">${e(p.explore)}${icon('arrow-down')}</a></div></div><a class="hero-image" href="/projects/" aria-label="${e(p.explore)}">${this.photo(p.image,p.image_alt,'hero-photo',true)}<span class="hero-image-label">EPIPHANY / INTERIOR</span><div class="image-caption"><span>${inline(p.caption)}</span><span>${inline(p.image_note)}</span></div></a></div><div class="hero-bottom"><p>${r(p.bottom)}</p></div></section>
${this.decisions()}
${this.quizTeaser()}
<section id="selected-projects" class="projects section"><div class="section-heading"><div><p class="eyebrow">${e(p.projects_label)}</p>${heading(p.projects_title,p.projects_emphasis,2)}</div><p class="small-note">${r(p.projects_note)}</p></div><div class="project-rail-stage">${this.cards(this.projects.slice(0,3))}<div class="project-rail-controls" hidden><button type="button" data-rail-prev aria-label="Предыдущий проект"><svg class="icon" aria-hidden="true"><use href="#icon-arrow-left"></use></svg></button><span class="project-rail-count" role="status" aria-live="polite" aria-atomic="true"></span><button type="button" data-rail-next aria-label="Следующий проект"><svg class="icon" aria-hidden="true"><use href="#icon-arrow-right"></use></svg></button></div></div><div class="section-more">${this.button('projects',this.ui.all_projects)}</div></section>
<section class="intro section"><div class="intro-side"><p class="eyebrow">${e(p.about_label)}</p>${p.about_image?this.photo(p.about_image,p.about_image_alt||'Дизайнер Epiphany','intro-portrait'):'<img class="intro-mark" src="/assets/branding/logo-mark.png" width="180" height="208" alt="" aria-hidden="true" loading="lazy">'}</div><div class="intro-copy">${heading(p.about_title,p.about_emphasis,2)}<div class="body-copy">${r(p.about_intro)}</div>${this.button('about',this.ui.more_about)}</div></section>
<section class="section home-services"><p class="eyebrow">${e(p.services_label)}</p>${heading(p.services_title,p.services_emphasis,2)}<div class="service-teasers">`+
      this.pages.services.items.map((item,i)=>`<a href="/services/#service-${i+1}"><span class="eyebrow">${String(i+1).padStart(2,'0')}</span><h3>${inline(item.title)}</h3>${icon()}</a>`).join('')+`</div>${this.button('services',this.ui.all_services)}</section>`+this.cta(p.cta);
    return this.shell(p.seo_title,p.seo_description,body,'home');
  }
  quizTeaser(){return `<section class="section quiz-teaser"><div><p class="eyebrow">ВАШ ИНТЕРЬЕР НАЧИНАЕТСЯ С ВАС</p><h2>Найдите настроение<br><em>своего интерьера.</em></h2><p class="body-copy">Выберите атмосферу будущего интерьера. Результат — сразу, без регистрации.</p><a class="hero-cta" href="/quiz/">Подобрать настроение ${icon()}</a><p class="small-note">Около 2 минут · без расчёта стоимости</p></div><div class="quiz-teaser-art" aria-hidden="true">`+['warm','calm','expressive'].map(name=>`<img src="/assets/quiz/${name}.svg" alt="" loading="lazy" width="720" height="560">`).join('')+'</div></section>';}
  quizPage(){
    const questions=QUIZ.questions.map((q,i)=>`<fieldset class="quiz-step" data-quiz-step="${i}"${i?' hidden':''}><legend>${e(q.title)}</legend><p class="quiz-hint" id="quiz-hint-${i}">${e(q.hint)}</p><div class="quiz-options${q.id==='mood'?' quiz-moods':''}">`+q.options.map(o=>`<label class="quiz-option"><input class="ym-disable-keys" type="${q.multiple?'checkbox':'radio'}" name="${q.id}" value="${o[0]}" aria-describedby="quiz-hint-${i}">${o[3]?`<img src="/${o[3]}" alt="" width="720" height="560" loading="lazy">`:''}<span class="quiz-option-copy"><strong>${e(o[1])}</strong>${o[2]?`<small>${e(o[2])}</small>`:''}<span class="quiz-check" aria-hidden="true">✓</span></span></label>`).join('')+`</div>${q.area?'<div class="quiz-area"><label for="quiz-area">Примерная площадь, м² · необязательно</label><input class="ym-disable-keys" id="quiz-area" name="area" type="text" inputmode="decimal" maxlength="8" placeholder="Например, 65"></div>':''}</fieldset>`).join('');
    const body=`<section class="section quiz-page"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">${e(this.ui.home)}</a><span aria-hidden="true">/</span><span aria-current="page">Интерьерный квиз</span></nav><p class="eyebrow">ПЯТЬ ШАГОВ К ВАШЕЙ ИДЕЕ</p><h1>Какой интерьер<br><em>вам близок?</em></h1><p class="page-intro">Выберите атмосферу и расскажите о задаче. Покажем направление и подходящий формат работы — контакт понадобится только если захотите обсудить результат.</p><noscript><p class="body-copy">Для квиза нужен JavaScript. Вы можете написать дизайнеру напрямую.</p></noscript><div id="interior-quiz" hidden><form id="quiz-questions" novalidate><div class="quiz-progress"><span id="quiz-count" aria-live="polite">Шаг 1 из 5</span><progress id="quiz-progress" value="1" max="5" aria-label="Прогресс квиза"></progress><span>≈ 2 минуты</span></div>${questions}<p id="quiz-error" role="alert" tabindex="-1" hidden></p><div class="quiz-actions"><button type="button" class="text-link" id="quiz-back" disabled>Назад</button><button type="submit" class="submit" id="quiz-next">Далее ${icon()}</button></div></form><section id="quiz-result" aria-labelledby="quiz-result-title" hidden><p class="eyebrow">ВАШЕ НАПРАВЛЕНИЕ</p><h2 id="quiz-result-title" tabindex="-1"></h2><p id="quiz-result-text" class="body-copy"></p><ul id="quiz-tips"></ul><div class="quiz-recommendation"><p class="eyebrow">С ЧЕГО МОЖНО НАЧАТЬ</p><h3 id="quiz-format-title"></h3><p id="quiz-format-text"></p></div><button type="button" class="hero-cta quiz-result-cta" id="quiz-discuss-open">Обсудить результат с дизайнером ${icon()}</button><details class="quiz-summary"><summary>Ваши ответы</summary><dl id="quiz-answer-list"></dl></details><p class="small-note">Это отправная точка для разговора, а не готовый проект. Точный объём работ и стоимость обсуждаются с дизайнером.</p><button type="button" class="text-link" id="quiz-edit">Изменить ответы</button></section></div><dialog id="quiz-contact" class="quiz-modal" aria-labelledby="quiz-dialog-title" aria-describedby="quiz-dialog-description"><div class="inquiry-form quiz-modal-panel"><button type="button" id="quiz-dialog-close" class="quiz-dialog-close" aria-label="Закрыть окно">×</button><h2 id="quiz-dialog-title">Обсудим ваш результат</h2><p id="quiz-dialog-description">Укажите имя и удобный контакт. Дизайнер получит их в Telegram вместе с вашими ответами.</p>${this.form(this.pages.contact,true)}</div></dialog><div class="quiz-direct">${this.button('contact','Перейти к обычной форме')}${this.contacts()}</div><script id="quiz-data" type="application/json">${safeJSON(QUIZ)}</script></section>`;
    return this.shell('Какой интерьер вам близок? — квиз Epiphany Interior','Выберите атмосферу будущего интерьера и получите рекомендации без регистрации. Пять шагов: пространство, настроение, приоритеты, этап и сроки.',body,'quiz','quiz/');
  }
  form(p,quiz=false){
    const f=quiz?{...p.form,submit:'Отправить дизайнеру',note:'Ответы квиза прикрепятся автоматически.',result:'Спасибо! Ваши контакты и результаты приняты. Дизайнер свяжется с вами.'}:p.form;
    const fields=(quiz?['name','contact']:['name','contact','message']).map(name=>{
      const field=name==='message'?`<textarea class="ym-disable-keys" dir="auto" id="${name}" name="${name}" rows="4" maxlength="3000" placeholder="${e(f[name+'_placeholder'])}"></textarea>`:`<input class="ym-disable-keys" dir="auto" id="${name}" name="${name}" required maxlength="${name==='name'?100:150}" autocomplete="${name==='name'?'name':'off'}" placeholder="${e(f[name+'_placeholder'])}">`;
      return `<label for="${name}">${e(f[name+'_label'])}</label>${field}`;
    }).join('');
    return `<noscript><p class="body-copy">${r(f.nojs_note)}</p></noscript><form id="brief-form" hidden><h2 class="form-title">${inline(p.form_title)}</h2>${fields}<div class="form-trap" aria-hidden="true"><label for="website">Ваш сайт</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div><input type="hidden" name="consent_version" value="${LEGAL_VERSION}"><label class="consent-check" for="personal-consent"><input type="checkbox" id="personal-consent" name="consent" required><span>Я даю <a href="/consent/" target="_blank" rel="noopener">согласие на обработку персональных данных</a> ${quiz?'для ответа на обращение и передачи имени, контакта и результатов квиза дизайнеру в Telegram.':'для ответа на обращение.'} <a href="/privacy/" target="_blank" rel="noopener">Политика обработки данных</a>.</span></label><button class="submit" type="submit">${e(f.submit)}${icon()}</button><p class="form-note">${r(f.note)}</p><p id="brief-status" role="status" aria-live="polite" tabindex="-1"></p><p id="brief-error" role="alert" tabindex="-1" hidden></p></form><script id="form-data" type="application/json">${safeJSON({form:f})}</script>`;
  }
  standardPage(key){
    const p=this.pages[key];let body=key==='contact'?'':this.pageHead(p,key);
    if(key==='projects')body+='<section class="section portfolio-section" data-project-layout="gallery"><div class="portfolio-toolbar"><p class="eyebrow">Всего: '+String(this.projects.length).padStart(2,'0')+'</p></div>'+this.cards(this.projects,2)+'</section>';
    else if(key==='about')body+=`<section class="section about-story"><div class="about-image">${this.photo(p.image,p.image_alt)}</div><div class="about-copy">${paragraphs(p.paragraphs)}<h2 class="minor-title">${inline(p.principles_title)}</h2><div class="principles">`+p.principles.map(x=>`<span>${inline(x)}</span>`).join('')+'</div></div></section>'+this.steps(p);
    else if(key==='services')body+='<section class="section service-editorial">'+p.items.map((x,i)=>`<details class="service-detail" id="service-${i+1}"${i===0?' open':''}><summary><span class="eyebrow">${String(i+1).padStart(2,'0')}</span><h2>${inline(x.title)}</h2><span class="service-toggle" aria-hidden="true">+</span></summary><div class="service-detail-body"><p class="body-copy">${r(x.description)}</p><div class="service-action">${x.price?'<p class="service-price">'+e(x.price)+'</p>':''}${this.button('contact',this.ui.discuss)}</div></div></details>`).join('')+'</section>'+this.steps(p);
    else if(key==='videos'){
      body+='<section class="section videos-page"><div class="video-grid">';
      for(const video of p.items||[])body+=`<article class="video-card" data-video-url="${e(video.url)}"><div class="video-frame">${this.photo(video.poster||'',video.title,'video-poster')}<button class="video-play" type="button">${e(this.ui.watch_video)}</button></div><h2>${inline(video.title)}</h2><p>${r(video.description)}</p><a class="video-source" hidden>${e(this.ui.open_vk)}${icon()}</a></article>`;
      if(!p.items?.length)body+=`<div class="empty-video"><span class="eyebrow">EPIPHANY INTERIOR</span><h2>${inline(p.empty_title)}</h2><p class="body-copy">${r(p.empty_text)}</p>${this.contacts()}</div>`;
      body+='</div></section><script id="video-data" type="application/json">'+safeJSON({unavailable:this.ui.video_unavailable})+'</script>';
    }else if(key==='contact')body+=`<section class="section inquiry-page"><div class="inquiry-intro"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">${e(this.ui.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${e(this.ui.contact)}</span></nav><p class="eyebrow">${e(p.label)}</p>${heading(p.title,p.emphasis)}<p class="page-intro">${r(p.intro)}</p></div><div class="inquiry-form">${this.form(p)}</div><aside class="inquiry-alternatives" aria-label="Другие способы связи"><h2>Удобнее написать напрямую?</h2>${this.contacts()}</aside></section>`;
    if(p.cta)body+=this.cta(p.cta);
    return this.shell(p.seo_title,p.seo_description,body,key,routes[key]);
  }
  galleryDialog(){return `<dialog id="project-dialog" aria-labelledby="dialog-title"><div class="dialog-toolbar"><p class="eyebrow" id="dialog-title"></p><button class="dialog-close" aria-label="Закрыть фотографии">${icon('close')}</button></div><div class="project-viewer" id="project-viewer"><img id="dialog-photo" alt="" decoding="async"><div class="viewer-controls" id="viewer-controls" hidden><button type="button" id="photo-previous" aria-label="Предыдущее фото">${icon('arrow-left')}</button><span id="photo-count" aria-live="polite"></span><button type="button" id="photo-next" aria-label="Следующее фото">${icon('arrow-right')}</button></div></div><div class="project-gallery" id="project-gallery" role="group" aria-label="Фотографии проекта"></div></dialog>`;}
  projectPage(p,index){
    const photos=[{image:p.image,alt:p.image_alt},...(p.images||[])].filter(x=>this.image(x.image)).map(x=>({url:this.image(x.image),alt:x.alt||p.title,source:x.image,thumbnail:this.image(IMAGE_MANIFEST[x.image.replace(/^\/+/, '')]?.variants?.[0]?.path||x.image)}));
    const crumbs=`<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">${e(this.ui.home)}</a><span>/</span><a href="/projects/">${e(this.ui.projects)}</a><span>/</span><span aria-current="page">${inline(p.title)}</span></nav>`;
    let body=`<section class="section project-heading">${crumbs}${heading(p.title)}<p class="page-intro">${inline(p.subtitle)}</p><div class="project-facts">`+['location','area','year'].filter(k=>p[k]).map(k=>`<span>${e(p[k])}</span>`).join('')+'</div></section>';
    body+='<section class="section project-story">';
    if(photos.length)body+=`<button class="project-cover" data-gallery-open="0" aria-label="${e(this.ui.open_photo)}">${this.photo(p.image,p.image_alt,'',true)}<span class="project-arrow">${icon()}</span></button>`;
    body+=`<div class="project-narrative"><p class="project-lead">${r(p.description)}</p>${paragraphs(p.body)}</div>`;
    if(p.is_concept)body+=`<p class="form-note concept-note">${e(this.ui.concept_note)}</p>`;
    body+='<div class="project-photo-grid">';
    for(const [i,photo]of photos.slice(1).entries())body+=`<figure><button data-gallery-open="${i+1}" aria-label="${e(this.ui.open_photo)}: ${e(photo.alt)}">${this.photo(photo.source,photo.alt,'project-photo')}</button><figcaption>${e(photo.alt)}</figcaption></figure>`;
    body+='</div></section><nav class="project-pagination section" aria-label="Другие проекты">';
    if(index>0)body+=`<a class="project-step project-previous" href="${this.projectLink(this.projects[index-1])}" aria-label="${e(this.ui.previous_project+': '+plainText(this.projects[index-1].title))}"><svg class="icon" aria-hidden="true"><use href="#icon-arrow-left"></use></svg></a>`;
    body+=this.button('projects',this.ui.back_projects);
    if(index+1<this.projects.length)body+=`<a class="project-step project-next" href="${this.projectLink(this.projects[index+1])}" aria-label="${e(this.ui.next_project+': '+plainText(this.projects[index+1].title))}"><svg class="icon" aria-hidden="true"><use href="#icon-arrow-right"></use></svg></a>`;
    body+='</nav>'+this.cta(this.pages.projects.cta);
    const extra=this.galleryDialog()+`<script id="gallery-data" type="application/json">${safeJSON({title:plainText(p.title),photos})}</script>`;
    return this.shell(plainText(p.title)+' — дизайн интерьера'+' — Epiphany Interior',p.seo_description||p.description,body,'projects','projects/'+p.slug+'/',extra);
  }
  notFound(){const u=this.ui;return this.shell(u.not_found_title,u.not_found_text,`<section class="section page-heading"><p class="eyebrow">404</p>${heading(u.not_found_title)}<p class="page-intro">${e(u.not_found_text)}</p>${this.button('home',u.home)}</section>`,'');}
  failure(){return this.shell('Сайт временно недоступен — Epiphany Interior','Не удалось загрузить актуальные данные.',`<section class="section page-heading state-page"><p class="eyebrow">ВРЕМЕННАЯ ОШИБКА</p>${heading('Не удалось загрузить страницу')}<p class="page-intro">Повторите загрузку через несколько секунд. Если вопрос срочный, напишите нам напрямую.</p><a class="text-link" href="">Повторить загрузку ${icon()}</a>${this.contacts()}</section>`,'');}
  sitemap(){return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...Object.entries(routes).filter(([key])=>this.indexable(key)).map(([,path])=>path),'quiz/',...Object.keys(DOCUMENTS).map(key=>key+'/'),...this.projects.map(p=>'projects/'+p.slug+'/')].map(path=>'<url><loc>'+e(this.url+path)+'</loc></url>').join('')+'</urlset>';}
  response(path){
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'text/html; charset=utf-8'};
    if(path==='/robots.txt')return new Response(this.robots(),{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
    if(path==='/sitemap.xml')return new Response(this.sitemap(),{headers:{...headers,'Content-Type':'application/xml; charset=utf-8'}});
    if(path.endsWith('/index.html')){
      const target=path.slice(0,-10);
      if(target==='/'||Object.values(routes).some(route=>'/'+route===target)||target==='/quiz/'||Object.keys(DOCUMENTS).some(key=>'/'+key+'/'===target)||this.projects.some(p=>'/projects/'+p.slug+'/'===target))return new Response(null,{status:301,headers:{...headers,Location:target}});
    }
    if(path==='/quiz/')return new Response(this.quizPage(),{headers});
    if(path==='/quiz')return new Response(null,{status:301,headers:{...headers,Location:'/quiz/'}});
    const legalKey=Object.keys(DOCUMENTS).find(key=>'/'+key+'/'===path);
    if(legalKey)return new Response(this.legalPage(legalKey),{headers});
    if(Object.keys(DOCUMENTS).some(key=>path==='/'+key))return new Response(null,{status:301,headers:{...headers,Location:path+'/'}});
    const key=Object.keys(routes).find(key=>'/'+routes[key]===path);
    if(key)return new Response(key==='home'?this.home():this.standardPage(key),{headers});
    const match=path.match(/^\/projects\/([a-z0-9-]+)\/$/);
    const index=match?this.projects.findIndex(p=>p.slug===match[1]):-1;
    if(index>=0)return new Response(this.projectPage(this.projects[index],index),{headers});
    if(!path.endsWith('/')&&(Object.values(routes).includes(path.slice(1)+'/')||this.projects.some(p=>path==='/projects/'+p.slug)))return new Response(null,{status:301,headers:{...headers,Location:path+'/'}});
    return new Response(this.notFound(),{status:404,headers:{...headers,'X-Robots-Tag':'noindex, follow'}});
  }
}
