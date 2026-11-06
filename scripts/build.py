#!/usr/bin/env python3
"""Build all public HTML from CMS JSON; Python standard library only."""
import argparse
import html
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from rich_text import rich_text as r, plain_text
from urllib.parse import urlsplit, urljoin
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parents[1]
LEGAL=json.loads((ROOT/'site-worker/src/legal/2026-11-01-v2.json').read_text())
DOCUMENTS=LEGAL['documents']
LEGAL_VERSION=LEGAL['version']
DECISIONS=json.loads((ROOT/'site-worker/src/decisions.json').read_text())
QUIZ=json.loads((ROOT/'site-worker/src/quiz.json').read_text())
DEFAULT_URL = 'https://milyaevpasha2017-cmd.github.io/design.site/'
ROUTES = {'home':'', 'projects':'projects/', 'about':'about/', 'services':'services/', 'videos':'videos/', 'contact':'contact/'}
def e(value): return html.escape(str(value), quote=True)
def icon(name='arrow-up-right'):
    if name.startswith('arrow-'): return '<span class="viewer-direction">'+('Назад' if name=='arrow-left' else 'Вперёд')+'</span>' if name in ['arrow-left','arrow-right'] else ''
    return f'<svg class="icon" aria-hidden="true"><use href="#icon-{name}"/></svg>'
def inline(value): return r(value,links=False)
def paragraphs(items, cls='body-copy'): return ''.join(f'<p class="{cls}">{r(item)}</p>' for item in (items or []))
def heading(title, emphasis='', level=1): return f'<h{level}><span>{inline(title)}</span>{"<br><em>"+inline(emphasis)+"</em>" if emphasis else ""}</h{level}>'
def safe_json(data): return json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('&','\\u0026')

def worker_snapshot(content, target):
    content=Path(content)
    files={};shas={}
    for file in content.rglob('*.json'):
        key='content/'+str(file.relative_to(content));raw=file.read_bytes()
        files[key]=json.loads(raw);shas[key]=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    commits=subprocess.run(['git','rev-list','HEAD'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.splitlines()
    target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(dict(content=files,shas=shas,commits=commits,icons=(ROOT/'templates/icons.svg').read_text()),ensure_ascii=False))

class Site:
    def __init__(self, content, url, canonical_url=None):
        self.content = Path(content)
        parsed = urlsplit(url)
        if parsed.scheme not in ('https','http') or not parsed.netloc or parsed.query or parsed.fragment: raise ValueError('Invalid site URL')
        self.url = (canonical_url or url).rstrip('/')+'/'
        canonical=urlsplit(self.url)
        if canonical.scheme not in ('http','https') or not canonical.netloc or canonical.query or canonical.fragment: raise ValueError('Invalid canonical URL')
        self.base = parsed.path.rstrip('/')+'/'
        self.settings = self.load('settings.json')
        self.ui = self.settings['ui']
        self.pages = {key:self.load(f'pages/{key}.json') for key in ROUTES}
        self.projects = []
        slugs = set()
        for file in sorted((self.content/'projects').glob('*.json')):
            p=json.loads(file.read_text())
            slug=p.get('slug','')
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',slug): raise ValueError(f'Invalid project slug in {file.name}')
            if slug in slugs: raise ValueError(f'Duplicate project slug: {slug}')
            slugs.add(slug)
            if p.get('published',True): self.projects.append(p)
        self.projects.sort(key=lambda p:(p.get('order',10),p['slug']))
    def load(self,path): return json.loads((self.content/path).read_text())
    def link(self,key): return self.base+ROUTES[key]
    def project_link(self,p): return self.link('projects')+p['slug']+'/'
    def image(self,value):
        if not isinstance(value,str) or not value: return ''
        u=urlsplit(value)
        if u.scheme: return value if u.scheme=='https' and not u.username and not u.password else ''
        # All CMS uploads are repository-root-relative, including legacy leading slashes.
        path=value.lstrip('/')
        if '..' in path.split('/') or not path.startswith('assets/'): return ''
        if path=='assets/living.png':path='assets/living-1536.webp'
        return self.base+path
    def photo(self,value,alt,cls='',priority=False):
        src=self.image(value)
        if not src:return ''
        responsive=''
        if value.lstrip('/')=='assets/living.png':
            sizes='(max-width: 1600px) 90vw, 1440px' if priority else '(max-width: 600px) 88vw, (max-width: 1600px) 44vw, 704px'
            if cls=='hero-photo':sizes='(max-width: 1600px) 100vw, 1680px'
            srcset=', '.join(f'{self.base}assets/living-{width}.webp {width}w' for width in (480,960,1536))
            responsive=f' width="1536" height="1024" srcset="{srcset}" sizes="{sizes}"'
        return f'<img src="{e(src)}" alt="{e(alt)}" class="{cls}" decoding="async"{responsive} {"fetchpriority=high" if priority else "loading=lazy"}>'
    def button(self,key,label,cls='text-link'): return f'<a class="{cls}" href="{self.link(key)}{"#brief-form" if key=="contact" else ""}">{e(label)}{icon()}</a>'
    def contacts(self):
        links=[]
        for key in ['telegram','email','vk','youtube']:
            value=self.settings['contacts'].get(key,'').strip()
            if not value:continue
            if key=='email':
                if not re.fullmatch(r'[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+',value):continue
                url='mailto:'+value
            else:
                parsed=urlsplit(value);hosts={'telegram':['t.me'],'youtube':['youtube.com','www.youtube.com','youtu.be'],'vk':['vk.com','www.vk.com','vk.ru','www.vk.ru']}
                if parsed.scheme!='https' or parsed.hostname not in hosts[key] or parsed.username or parsed.password:continue
                url=value
            links.append(f'<a href="{e(url)}"'+(' target="_blank" rel="noopener noreferrer"' if key!='email' else '')+f'>{e(self.ui[key])}{icon()}</a>')
        return '<div class="contact-links">'+''.join(links)+'</div>' if links else ''
    def nav(self,current):
        return ''.join(f'<a href="{self.link(key)}"'+(' aria-current="page"' if current==key else '')+f'>{e(self.ui[key])}</a>' for key in ['projects','about','services','videos','contact'])
    def legal_footer(self):
        return '<nav class="legal-links" aria-label="Правовая информация">'+''.join(f'<a href="{self.base}{key}/">{e(doc["title"])}</a>' for key,doc in DOCUMENTS.items())+'<button type="button" data-cookie-settings>Настройки cookie</button></nav>'
    def cookie_banner(self):
        return f'<section id="cookie-banner" class="cookie-banner" aria-label="Настройки cookie" hidden><div><h2>Настройки cookie</h2><p>С вашего согласия используем Яндекс Метрику и Вебвизор для анализа посещений. Вы можете отказаться — сайт и форма продолжат работать. <a href="{self.base}cookies/">Подробнее о cookie</a> · <a href="{self.base}privacy/">Политика обработки данных</a></p></div><div class="cookie-actions"><button type="button" data-cookie-accept>Принять</button><button type="button" data-cookie-reject>Отклонить</button></div></section>'
    def legal_page(self,key):
        doc=DOCUMENTS[key]
        crumbs=f'<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="{self.link("home")}">{e(self.ui["home"])}</a><span aria-hidden="true">/</span><span aria-current="page">{e(doc["title"])}</span></nav>'
        body=f'<article class="section legal-document">{crumbs}{heading(doc["title"])}<p class="legal-version">Редакция от {LEGAL_VERSION.split("-v")[0]}</p>'+''.join(f'<section><h2>{e(title)}</h2><p>{r(text)}</p></section>' for title,text in doc['sections'])+'</article>'
        return self.shell(doc['title']+' — Epiphany Interior',doc['sections'][0][1],body,key,key+'/')
    def indexable(self,key):
        return bool(key) and (key!='videos' or bool(self.pages['videos'].get('items')))
    def robots(self):
        return 'User-agent: *\nDisallow: '+self.base+'api/\nDisallow: '+self.base+'deployment.json\n\nSitemap: '+self.url+'sitemap.xml\n'
    def structured(self,title,description,current,path):
        canonical=self.url+path
        org={'@type':'Organization','@id':self.url+'#organization','name':'Epiphany Interior','url':self.url,'logo':self.url+'assets/branding/icon-192.png','email':self.settings['contacts'].get('email',''),'sameAs':[v for k,v in self.settings['contacts'].items() if k!='email' and v.startswith('https://')]}
        website={'@type':'WebSite','@id':self.url+'#website','url':self.url,'name':'Epiphany Interior','inLanguage':'ru-RU','publisher':{'@id':org['@id']}}
        page={'@type':{'about':'AboutPage','contact':'ContactPage','projects':'CollectionPage','videos':'CollectionPage'}.get(current,'WebPage'),'@id':canonical+'#webpage','url':canonical,'name':plain_text(title),'description':plain_text(description),'inLanguage':'ru-RU','isPartOf':{'@id':website['@id']}}
        graph=[org,website,page]
        crumbs=[(self.ui['home'],self.url)]
        if path.startswith('projects/') and path!='projects/':
            project=next((p for p in self.projects if path=='projects/'+p['slug']+'/'),None)
            if project:
                crumbs.extend([(self.ui['projects'],self.url+'projects/'),(plain_text(project['title']),canonical)])
                page['@type']='WebPage'
                image=self.image(project['image'])
                page['primaryImageOfPage']={'@type':'ImageObject','url':urljoin(self.url,image.removeprefix(self.base))}
        elif current!='home':crumbs.append((self.ui.get(current,DOCUMENTS.get(current,{}).get('title','Интерьерный квиз' if current=='quiz' else '')),canonical))
        if len(crumbs)>1:
            graph.append({'@type':'BreadcrumbList','@id':canonical+'#breadcrumb','itemListElement':[{'@type':'ListItem','position':i+1,'name':name,'item':url} for i,(name,url) in enumerate(crumbs)]})
            page['breadcrumb']={'@id':canonical+'#breadcrumb'}
        return '<script type="application/ld+json">'+json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('&','\\u0026')+'</script>'
    def shell(self,title,description,body,current,path='',extra=''):
        s=self.settings;fonts=json.loads((ROOT/'site-worker/src/font-library.json').read_text());chosen=s.get('typography') or {};body_font=next((f for f in fonts if f['id']==chosen.get('body')),fonts[0]);display_font=next((f for f in fonts if f['id']==chosen.get('display')),fonts[1]);canonical=self.url+path;indexable=self.indexable(current)
        record=next((p for p in self.projects if path=='projects/'+p['slug']+'/'),None) or self.pages.get(current,{})
        for block in record.get('text_blocks',[]):
            title_text=block.get('title','');text=block.get('text','')
            if title_text.strip() or text.strip():
                body+='<section class="section text-block">'+(heading(title_text,'',2) if title_text.strip() else '')+('<div class="body-copy">'+r(text)+'</div>' if text.strip() else '')+'</section>'
        title=plain_text(title);description=plain_text(description)
        project=next((p for p in self.projects if path=='projects/'+p['slug']+'/'),None)
        image_source=(project or self.pages.get(current,{}) or {}).get('image') or self.pages['home']['image']
        share_image=urljoin(self.url,self.image(image_source).removeprefix(self.base))
        seo=(f'<link rel="canonical" href="{e(canonical)}">' if current else '')+('<meta name="robots" content="index,follow,max-image-preview:large">'+self.structured(title,description,current,path) if indexable else '<meta name="robots" content="noindex,follow">')
        logo=f'<a class="logo logo-with-mark" href="{self.link("home")}"><img class="brand-mark" src="{self.base}assets/branding/logo-mark.png" width="64" height="74" alt="" aria-hidden="true"><span class="brand-wordmark"><span class="brand-name">{e(s["brand"])}</span><span class="brand-subtitle">{e(s["brand_subtitle"])}</span></span></a>'
        return f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>{e(title)}</title><meta name="description" content="{e(description)}"><meta name="theme-color" content="#f5f3ee"><link rel="icon" type="image/x-icon" href="{self.base}favicon.ico?v=epiphany-1"><link rel="icon" type="image/png" sizes="32x32" href="{self.base}assets/branding/icon-32.png?v=epiphany-1"><link rel="icon" type="image/png" sizes="192x192" href="{self.base}assets/branding/icon-192.png?v=epiphany-1"><link rel="apple-touch-icon" sizes="180x180" href="{self.base}assets/branding/icon-180.png?v=epiphany-1"><meta property="og:type" content="website"><meta property="og:site_name" content="Epiphany Interior"><meta property="og:image" content="{e(share_image)}"><meta name="twitter:card" content="summary_large_image"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(description)}"><meta property="og:url" content="{e(canonical)}"><meta property="og:locale" content="ru_RU">{seo}<link rel="preload" href="{self.base}assets/fonts/{body_font["file"]}" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="{self.base}fonts.css"><link rel="stylesheet" href="{self.base}style.css"><link rel="stylesheet" href="{self.base}design.css"><script defer src="{self.base}metrika.js"></script><script type="module" src="{self.base}script.js"></script></head><body data-page="{e(current or 'error')}" data-font-body="{body_font["id"]}" data-font-display="{display_font["id"]}"><div class="reading-progress" aria-hidden="true"></div><a class="skip-link" href="#main-content">{e(self.ui['skip'])}</a>{(ROOT/'templates/icons.svg').read_text()}<header class="header">{logo}<nav id="navigation" aria-label="Основная навигация">{self.nav(current)}</nav><a class="header-apply" href="{self.base}contact/#brief-form" aria-label="Оставить заявку"><span class="apply-long">Оставить заявку</span><span class="apply-short">Заявка</span>{icon()}</a><button class="menu-toggle" aria-label="{e(self.ui['menu'])}" aria-expanded="false" aria-controls="navigation"><span class="menu-label">{e(self.ui['menu'])}</span>{icon('menu')}</button></header><main id="main-content" tabindex="-1">{body}</main><footer>{logo}<p>{r(s['footer_tagline'])}</p><a href="#main-content">{e(self.ui['top'])}</a><nav class="footer-nav" aria-label="Навигация в подвале">{self.nav(current)}</nav><p class="footer-note">{r(s['footer_note'])}</p>{self.legal_footer()}</footer>{self.cookie_banner()}{extra}</body></html>'''
    def page_head(self,p,current):
        return f'<section class="page-heading section"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="{self.link("home")}">{e(self.ui["home"])}</a><span aria-hidden="true">/</span><span aria-current="page">{e(self.ui[current])}</span></nav><p class="eyebrow">{e(p["label"])}</p>{heading(p["title"],p["emphasis"])}<p class="page-intro">{r(p["intro"])}</p></section>'
    def cta(self,p):
        return f'<section class="contact section page-cta"><div><p class="eyebrow">{e(p["label"])}</p>{heading(p["title"],p["emphasis"],2)}<p>{r(p["intro"])}</p></div><div>{self.button("contact",p["button"],"submit")}{self.contacts()}</div></section>'
    def cards(self,projects,level=3):
        cards=[]
        for i,p in enumerate(projects):
            cards.append(f'<a class="project-card{" wide" if i%3==2 else ""}" href="{self.project_link(p)}"><div class="project-image">{self.photo(p["image"],p["image_alt"],"card-photo")}<span class="project-arrow">{icon()}</span></div><div class="project-title"><h{level}>{inline(p["title"])}</h{level}><span>{i+1:02d}</span></div><p>{inline(p["subtitle"])}</p></a>')
        return '<div class="project-grid">'+''.join(cards)+'</div>' if cards else f'<p class="empty-state">{e(self.ui["empty_projects"])}</p>'
    def steps(self,p):
        items=self.pages['services']['steps']
        return f'<section class="process section"><p class="eyebrow">{e(p["process_label"])}</p>{heading(p["process_title"],p["process_emphasis"],2)}<div class="steps">'+''.join(f'<article><span>{e(x["label"])}</span><h3>{inline(x["title"])}</h3><p>{r(x["description"])}</p></article>' for x in items)+'</div></section>'
    def home(self):
        p=self.pages['home']
        body=f'''<section class="hero hero-editorial"><div class="hero-top"><p class="eyebrow">{e(p['label'])}</p><span class="availability"><i></i>{e(p['availability'])}</span></div><div class="hero-composition"><div class="hero-copy"><h1><span>{inline(p['title'])}</span> <em>{inline(p['emphasis'])}</em></h1><p class="hero-description">{r(p['intro'])}</p><div class="hero-actions">{self.button('contact',p['button'],'hero-cta')}<a class="hero-secondary" href="#selected-projects">{e(p['explore'])}{icon('arrow-down')}</a></div></div><a class="hero-image" href="{self.link('projects')}" aria-label="{e(p['explore'])}">{self.photo(p['image'],p['image_alt'],'hero-photo',True)}<span class="hero-image-label">EPIPHANY / INTERIOR</span><div class="image-caption"><span>{inline(p['caption'])}</span><span>{inline(p['image_note'])}</span></div></a></div><div class="hero-bottom"><p>{r(p['bottom'])}</p><span>Свет. Материалы. Ощущения.</span></div></section>
{DECISIONS['html'].replace('__BASE__',self.base)}
{self.quiz_teaser()}
<section id="selected-projects" class="projects section"><div class="section-heading"><div><p class="eyebrow">{e(p['projects_label'])}</p>{heading(p['projects_title'],p['projects_emphasis'],2)}</div><p class="small-note">{r(p['projects_note'])}</p></div>{self.cards(self.projects[:3])}<div class="project-rail-controls" hidden><button type="button" data-rail-prev aria-label="Предыдущий проект">Назад</button><span class="project-rail-count" role="status" aria-live="polite"></span><button type="button" data-rail-next aria-label="Следующий проект">Далее</button></div><div class="section-more">{self.button('projects',self.ui['all_projects'])}</div></section>
<section class="intro section"><div class="intro-side"><p class="eyebrow">{e(p['about_label'])}</p><img class="intro-mark" src="{self.base}assets/branding/logo-mark.png" width="180" height="208" alt="" aria-hidden="true" loading="lazy"></div><div class="intro-copy">{heading(p['about_title'],p['about_emphasis'],2)}<div class="body-copy">{r(p['about_intro'])}</div>{self.button('about',self.ui['more_about'])}</div></section>
<section class="section home-services"><p class="eyebrow">{e(p['services_label'])}</p>{heading(p['services_title'],p['services_emphasis'],2)}<div class="service-teasers">'''
        for i,item in enumerate(self.pages['services']['items']):
            body+=f'<a href="{self.link("services")}#service-{i+1}"><span class="eyebrow">{i+1:02d}</span><h3>{inline(item["title"])}</h3>{icon()}</a>'
        body+=f'</div>{self.button("services",self.ui["all_services"])}</section>'+self.cta(p['cta'])
        return self.shell(p['seo_title'],p['seo_description'],body,'home')
    def quiz_teaser(self):
        return f'<section class="section quiz-teaser"><div><p class="eyebrow">ВАШ ИНТЕРЬЕР НАЧИНАЕТСЯ С ВАС</p><h2>Найдите настроение<br><em>своего интерьера.</em></h2><p class="body-copy">Выберите атмосферу будущего интерьера. Результат — сразу, без регистрации.</p><a class="hero-cta" href="{self.base}quiz/">Подобрать настроение {icon()}</a><p class="small-note">Около 2 минут · без расчёта стоимости</p></div><div class="quiz-teaser-art" aria-hidden="true">'+''.join(f'<img src="{self.base}assets/quiz/{name}.svg" alt="" loading="lazy" width="720" height="560">' for name in ['warm','calm','expressive'])+'</div></section>'
    def quiz_page(self):
        questions=''
        for i,q in enumerate(QUIZ['questions']):
            questions+=f'<fieldset class="quiz-step" data-quiz-step="{i}"{" hidden" if i else ""}><legend>{e(q["title"])}</legend><p class="quiz-hint" id="quiz-hint-{i}">{e(q["hint"])}</p><div class="quiz-options{" quiz-moods" if q["id"]=="mood" else ""}">'
            for o in q['options']:
                image=f'<img src="{self.base}{o[3]}" alt="" width="720" height="560" loading="lazy">' if len(o)>3 else ''
                small=f'<small>{e(o[2])}</small>' if len(o)>2 else ''
                questions+=f'<label class="quiz-option"><input class="ym-disable-keys" type="{"checkbox" if q.get("multiple") else "radio"}" name="{q["id"]}" value="{o[0]}" aria-describedby="quiz-hint-{i}">{image}<span class="quiz-option-copy"><strong>{e(o[1])}</strong>{small}<span class="quiz-check" aria-hidden="true">✓</span></span></label>'
            questions+='</div>'
            if q.get('area'):questions+='<div class="quiz-area"><label for="quiz-area">Примерная площадь, м² · необязательно</label><input class="ym-disable-keys" id="quiz-area" name="area" type="text" inputmode="decimal" maxlength="8" placeholder="Например, 65"></div>'
            questions+='</fieldset>'
        body=f'<section class="section quiz-page"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="{self.link("home")}">{e(self.ui["home"])}</a><span aria-hidden="true">/</span><span aria-current="page">Интерьерный квиз</span></nav><p class="eyebrow">ПЯТЬ ШАГОВ К ВАШЕЙ ИДЕЕ</p><h1>Какой интерьер<br><em>вам близок?</em></h1><p class="page-intro">Выберите атмосферу и расскажите о задаче. Покажем направление и подходящий формат работы — контакт понадобится только если захотите обсудить результат.</p><noscript><p class="body-copy">Для квиза нужен JavaScript. Вы можете написать дизайнеру напрямую.</p></noscript><div id="interior-quiz" hidden><form id="quiz-questions" novalidate><div class="quiz-progress"><span id="quiz-count" aria-live="polite">Шаг 1 из 5</span><progress id="quiz-progress" value="1" max="5" aria-label="Прогресс квиза"></progress><span>≈ 2 минуты</span></div>{questions}<p id="quiz-error" role="alert" tabindex="-1" hidden></p><div class="quiz-actions"><button type="button" class="text-link" id="quiz-back" disabled>Назад</button><button type="submit" class="submit" id="quiz-next">Далее {icon()}</button></div></form><section id="quiz-result" aria-labelledby="quiz-result-title" hidden><p class="eyebrow">ВАШЕ НАПРАВЛЕНИЕ</p><h2 id="quiz-result-title" tabindex="-1"></h2><p id="quiz-result-text" class="body-copy"></p><ul id="quiz-tips"></ul><div class="quiz-recommendation"><p class="eyebrow">С ЧЕГО МОЖНО НАЧАТЬ</p><h3 id="quiz-format-title"></h3><p id="quiz-format-text"></p></div><button type="button" class="hero-cta quiz-result-cta" id="quiz-discuss-open">Обсудить результат с дизайнером {icon()}</button><details class="quiz-summary"><summary>Ваши ответы</summary><dl id="quiz-answer-list"></dl></details><p class="small-note">Это отправная точка для разговора, а не готовый проект. Точный объём работ и стоимость обсуждаются с дизайнером.</p><button type="button" class="text-link" id="quiz-edit">Изменить ответы</button></section></div><dialog id="quiz-contact" class="quiz-modal" aria-labelledby="quiz-dialog-title" aria-describedby="quiz-dialog-description"><div class="inquiry-form quiz-modal-panel"><button type="button" id="quiz-dialog-close" class="quiz-dialog-close" aria-label="Закрыть окно">×</button><h2 id="quiz-dialog-title">Обсудим ваш результат</h2><p id="quiz-dialog-description">Укажите имя и удобный контакт. Дизайнер получит их в Telegram вместе с вашими ответами.</p>{self.form(self.pages["contact"],True)}</div></dialog><div class="quiz-direct">{self.button("contact","Перейти к обычной форме")}{self.contacts()}</div><script id="quiz-data" type="application/json">{safe_json(QUIZ)}</script></section>'
        return self.shell('Какой интерьер вам близок? — квиз Epiphany Interior','Выберите атмосферу будущего интерьера и получите рекомендации без регистрации. Пять шагов: пространство, настроение, приоритеты, этап и сроки.',body,'quiz','quiz/')
    def form(self,p,quiz=False):
        f={**p['form'],**(dict(submit='Отправить дизайнеру',note='Ответы квиза прикрепятся автоматически.',result='Спасибо! Ваши контакты и результаты приняты. Дизайнер свяжется с вами.') if quiz else {})};fields=''
        for name in (['name','contact'] if quiz else ['name','contact','message']):
            label=f'{name}_label';placeholder=f'{name}_placeholder'
            field=f'<textarea class="ym-disable-keys" dir="auto" id="{name}" name="{name}" rows="4" maxlength="3000" placeholder="{e(f[placeholder])}"></textarea>' if name=='message' else f'<input class="ym-disable-keys" dir="auto" id="{name}" name="{name}" required maxlength="{100 if name=="name" else 150}" autocomplete="{"name" if name=="name" else "off"}" placeholder="{e(f[placeholder])}">'
            fields+=f'<label for="{name}">{e(f[label])}</label>{field}'
        return f'<noscript><p class="body-copy">{r(f["nojs_note"])}</p></noscript><form id="brief-form" hidden><h2 class="form-title">{inline(p["form_title"])}</h2>{fields}<div class="form-trap" aria-hidden="true"><label for="website">Ваш сайт</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div><input type="hidden" name="consent_version" value="{LEGAL_VERSION}"><label class="consent-check" for="personal-consent"><input type="checkbox" id="personal-consent" name="consent" required><span>Я даю <a href="{self.base}consent/" target="_blank" rel="noopener">согласие на обработку персональных данных</a> {"для ответа на обращение и передачи имени, контакта и результатов квиза дизайнеру в Telegram." if quiz else "для ответа на обращение."} <a href="{self.base}privacy/" target="_blank" rel="noopener">Политика обработки данных</a>.</span></label><button class="submit" type="submit">{e(f["submit"])}{icon()}</button><p class="form-note">{r(f["note"])}</p><p id="brief-status" role="status" aria-live="polite" tabindex="-1"></p><p id="brief-error" role="alert" tabindex="-1" hidden></p></form><script id="form-data" type="application/json">{safe_json(dict(form=f))}</script>'
    def standard_page(self,key):
        p=self.pages[key];body='' if key=='contact' else self.page_head(p,key)
        if key=='projects':body+='<section class="section portfolio-section" data-project-layout="gallery"><div class="portfolio-toolbar"><p class="eyebrow">Всего: '+str(len(self.projects)).zfill(2)+'</p><div class="project-view-switch" role="group" aria-label="Вид портфолио" hidden><button type="button" data-project-view="gallery" aria-pressed="true">Галерея</button><button type="button" data-project-view="list" aria-pressed="false">Список</button></div></div>'+self.cards(self.projects,2)+'</section>'
        elif key=='about':
            body+=f'<section class="section about-story"><div class="about-image">{self.photo(p["image"],p["image_alt"])}</div><div class="about-copy">{paragraphs(p["paragraphs"])}<h2 class="minor-title">{inline(p["principles_title"])}</h2><div class="principles">'+''.join(f'<span>{inline(x)}</span>' for x in p['principles'])+'</div></div></section>'+self.steps(p)
        elif key=='services':
            body+='<section class="section service-editorial">'+''.join(f'<details class="service-detail" id="service-{i+1}"{" open" if i==0 else ""}><summary><span class="eyebrow">{i+1:02d}</span><h2>{inline(x["title"])}</h2><span class="service-toggle" aria-hidden="true">+</span></summary><div class="service-detail-body"><p class="body-copy">{r(x["description"])}</p>{self.button("contact",self.ui["discuss"])}</div></details>' for i,x in enumerate(p['items']))+'</section>'+self.steps(p)
        elif key=='videos':
            body+='<section class="section videos-page"><div class="video-grid">'
            for video in (p.get('items') or []):
                poster=self.photo(video.get('poster',''),video['title'],'video-poster')
                body+=f'<article class="video-card" data-video-url="{e(video["url"])}"><div class="video-frame">{poster}<button class="video-play" type="button">{e(self.ui["watch_video"])}</button></div><h2>{inline(video["title"])}</h2><p>{r(video["description"])}</p><a class="video-source" hidden>{e(self.ui["open_vk"])}{icon()}</a></article>'
            if not p.get('items'):
                body+=f'<div class="empty-video"><span class="eyebrow">EPIPHANY INTERIOR</span><h2>{inline(p["empty_title"])}</h2><p class="body-copy">{r(p["empty_text"])}</p>{self.contacts()}</div>'
            body+='</div></section><script id="video-data" type="application/json">'+safe_json({'unavailable':self.ui['video_unavailable']})+'</script>'
        elif key=='contact':body+=f'<section class="section inquiry-page"><div class="inquiry-intro"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="{self.link("home")}">{e(self.ui["home"])}</a><span aria-hidden="true">/</span><span aria-current="page">{e(self.ui["contact"])}</span></nav><p class="eyebrow">{e(p["label"])}</p>{heading(p["title"],p["emphasis"])}<p class="page-intro">{r(p["intro"])}</p></div><div class="inquiry-form">{self.form(p)}</div><aside class="inquiry-alternatives" aria-label="Другие способы связи"><h2>Удобнее написать напрямую?</h2>{self.contacts()}</aside></section>'
        if 'cta' in p:body+=self.cta(p['cta'])
        return self.shell(p['seo_title'],p['seo_description'],body,key,ROUTES[key])
    def gallery_dialog(self):
        return f'''<dialog id="project-dialog" aria-labelledby="dialog-title"><div class="dialog-toolbar"><p class="eyebrow" id="dialog-title"></p><button class="dialog-close" aria-label="Закрыть фотографии">{icon('close')}</button></div><div class="project-viewer" id="project-viewer"><img id="dialog-photo" alt="" decoding="async"><div class="viewer-controls" id="viewer-controls" hidden><button type="button" id="photo-previous" aria-label="Предыдущее фото">{icon('arrow-left')}</button><span id="photo-count" aria-live="polite"></span><button type="button" id="photo-next" aria-label="Следующее фото">{icon('arrow-right')}</button></div></div><div class="project-gallery" id="project-gallery" role="group" aria-label="Фотографии проекта"></div></dialog>'''
    def project_page(self,p,index):
        photos=[dict(image=p['image'],alt=p['image_alt'])]+(p.get('images') or [])
        photos=[dict(url=self.image(x['image']),alt=x.get('alt',p['title'])) for x in photos if self.image(x.get('image',''))]
        crumbs=f'<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="{self.link("home")}">{e(self.ui["home"])}</a><span>/</span><a href="{self.link("projects")}">{e(self.ui["projects"])}</a><span>/</span><span aria-current="page">{inline(p["title"])}</span></nav>'
        body=f'<section class="section project-heading">{crumbs}{heading(p["title"])}<p class="page-intro">{inline(p["subtitle"])}</p><div class="project-facts">'+''.join(f'<span>{e(p[k])}</span>' for k in ['location','area','year'] if p.get(k))+'</div></section>'
        body+='<section class="section project-story">'
        if photos:body+=f'<button class="project-cover" data-gallery-open="0" aria-label="{e(self.ui["open_photo"])}">{self.photo(p["image"],p["image_alt"],priority=True)}<span class="project-arrow">{icon()}</span></button>'
        body+=f'<div class="project-narrative"><p class="project-lead">{r(p["description"])}</p>{paragraphs(p.get("body",[]))}</div>'
        if p.get('is_concept'):body+=f'<p class="form-note concept-note">{e(self.ui["concept_note"])}</p>'
        body+='<div class="project-photo-grid">'
        for i,photo in enumerate(photos[1:],1):body+=f'<figure><button data-gallery-open="{i}" aria-label="{e(self.ui["open_photo"])}: {e(photo["alt"])}"><img src="{e(photo["url"])}" alt="{e(photo["alt"])}" loading="lazy" decoding="async"></button><figcaption>{e(photo["alt"])}</figcaption></figure>'
        body+='</div></section><nav class="project-pagination section" aria-label="Другие проекты">'
        if index>0: body+=f'<a href="{self.project_link(self.projects[index-1])}">{icon("arrow-left")}<span><small>{e(self.ui["previous_project"])}</small>{inline(self.projects[index-1]["title"])}</span></a>'
        body+=self.button('projects',self.ui['back_projects'])
        if index+1<len(self.projects):body+=f'<a href="{self.project_link(self.projects[index+1])}"><span><small>{e(self.ui["next_project"])}</small>{inline(self.projects[index+1]["title"])}</span>{icon()}</a>'
        body+='</nav>'+self.cta(self.pages['projects']['cta'])
        extra=self.gallery_dialog()+f'<script id="gallery-data" type="application/json">{safe_json(dict(title=plain_text(p["title"]),photos=photos))}</script>'
        return self.shell(plain_text(p['title'])+' — дизайн интерьера'+' — Epiphany Interior',p.get('seo_description') or p['description'],body,'projects','projects/'+p['slug']+'/',extra)

def build(content,output,url=DEFAULT_URL,admin_mode="github",canonical_url=None):
    site=Site(content,url,canonical_url);output=Path(output)
    if output.resolve() in (ROOT.resolve(),Path(content).resolve()) or ROOT.resolve().is_relative_to(output.resolve()): raise ValueError('Unsafe output directory')
    if output.exists():shutil.rmtree(output)
    output.mkdir(parents=True)
    pages={'index.html':site.home(),'quiz/index.html':site.quiz_page()}
    for key in ROUTES:
        if key!='home':pages[ROUTES[key]+'index.html']=site.standard_page(key)
    for i,p in enumerate(site.projects):pages['projects/'+p['slug']+'/index.html']=site.project_page(p,i)
    for key in DOCUMENTS:pages[key+'/index.html']=site.legal_page(key)
    u=site.ui
    pages['404.html']=site.shell(u['not_found_title'],u['not_found_text'],f'<section class="section page-heading"><p class="eyebrow">404</p>{heading(u["not_found_title"])}<p class="page-intro">{e(u["not_found_text"])}</p>{site.button("home",u["home"])}</section>','')
    for path,body in pages.items():
        target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(body)
    shutil.copytree(ROOT/'assets',output/'assets')
    shutil.copy2(ROOT/'assets/branding/favicon.ico',output/'favicon.ico')
    for verification in ['yandex_59d8ac18e7c2c0a9.html', 'google2a6a1606b1efa065.html']:
        shutil.copy2(ROOT/verification,output/verification)
    if admin_mode == 'password':
        if site.base != '/': raise ValueError('Password admin requires a root domain URL')
        shutil.copytree(ROOT/'password-admin',output/'admin',ignore=shutil.ignore_patterns('schema.json'))
        fonts_ui=output/'admin/fonts.js';fonts_ui.write_text(fonts_ui.read_text().replace('../site-worker/src/typography.mjs','../typography.mjs'))
        login=output/'admin/login';login.mkdir();shutil.copy2(ROOT/'password-admin/login.html',login/'index.html')
    elif admin_mode == 'github': shutil.copytree(ROOT/'admin',output/'admin')
    else: raise ValueError('Unknown admin mode')
    for file in ['typography.mjs','font-library.json']:shutil.copy2(ROOT/'site-worker/src'/file,output/file)
    for file in ['fonts.css','style.css','design.css','script.js','quiz.js','quiz-model.mjs','decisions.js','motion.js','navigation.js','page-lifecycle.js','metrika.js','content-utils.mjs','rich-text.mjs','.nojekyll']:shutil.copy2(ROOT/file,output/file)
    # Formatted source JSON is private to the build/CMS, never needed by site visitors.
    urls=[site.url+(path.removesuffix('index.html')) for path in pages if path!='404.html' and (path!='videos/index.html' or site.indexable('videos'))]
    (output/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+xml_escape(url)+'</loc></url>' for url in urls)+'</urlset>')
    (output/'robots.txt').write_text(site.robots())
    print(f'Built {len(pages)} HTML pages in {output}')
    return pages
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site-url',default=DEFAULT_URL);parser.add_argument('--output',default=str(ROOT/'_site'))
    parser.add_argument('--canonical-url',default=None)
    parser.add_argument('--admin-mode',choices=['github','password'],default='github')
    args=parser.parse_args();build(ROOT/'content',args.output,args.site_url,args.admin_mode,args.canonical_url)
    if args.admin_mode=='password':worker_snapshot(ROOT/'content',ROOT/'site-worker/generated/site.json')

