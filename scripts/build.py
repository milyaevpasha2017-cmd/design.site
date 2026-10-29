#!/usr/bin/env python3
"""Build all public HTML from CMS JSON; Python standard library only."""
import argparse
import html
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = 'https://milyaevpasha2017-cmd.github.io/design.site/'
ROUTES = {'home':'', 'projects':'projects/', 'about':'about/', 'services':'services/', 'videos':'videos/', 'contact':'contact/'}
def e(value): return html.escape(str(value), quote=True)
def icon(name='arrow-up-right'): return f'<svg class="icon" aria-hidden="true"><use href="#icon-{name}"/></svg>'
def paragraphs(items, cls='body-copy'): return ''.join(f'<p class="{cls}">{e(item)}</p>' for item in (items or []))
def heading(title, emphasis='', level=1): return f'<h{level}><span>{e(title)}</span>{"<br><em>"+e(emphasis)+"</em>" if emphasis else ""}</h{level}>'
def safe_json(data): return json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('&','\\u0026')

class Site:
    def __init__(self, content, url):
        self.content = Path(content)
        parsed = urlsplit(url)
        if parsed.scheme not in ('https','http') or not parsed.netloc or parsed.query or parsed.fragment: raise ValueError('Invalid site URL')
        self.url = url.rstrip('/')+'/'
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
        return self.base+path
    def photo(self,value,alt,cls='',priority=False):
        src=self.image(value)
        if not src:return ''
        return f'<img src="{e(src)}" alt="{e(alt)}" class="{cls}" decoding="async" {"fetchpriority=high" if priority else "loading=lazy"}>'
    def button(self,key,label,cls='text-link'): return f'<a class="{cls}" href="{self.link(key)}">{e(label)}{icon()}</a>'
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
    def shell(self,title,description,body,current,path='',extra=''):
        s=self.settings;canonical=self.url+path
        logo=f'<a class="logo" href="{self.link("home")}"><span class="brand-name">{e(s["brand"])}</span><span>{e(s["brand_subtitle"])}</span></a>'
        return f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)}</title><meta name="description" content="{e(description)}"><meta name="theme-color" content="#f5f3ee"><meta property="og:type" content="website"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(description)}"><meta property="og:url" content="{e(canonical)}"><meta property="og:locale" content="ru_RU"><link rel="canonical" href="{e(canonical)}"><link rel="stylesheet" href="{self.base}style.css"><script type="module" src="{self.base}script.js"></script></head><body><a class="skip-link" href="#main-content">{e(self.ui['skip'])}</a>{(ROOT/'templates/icons.svg').read_text()}<header class="header">{logo}<button class="menu-toggle" aria-expanded="false" aria-controls="navigation">{e(self.ui['menu'])}{icon('menu')}</button><nav id="navigation" aria-label="Основная навигация">{self.nav(current)}</nav></header><main id="main-content" tabindex="-1">{body}</main><footer>{logo}<p>{e(s['footer_tagline'])}</p><a href="#main-content">{e(self.ui['top'])} ↑</a><nav class="footer-nav" aria-label="Навигация в подвале">{self.nav(current)}</nav><p class="footer-note">{e(s['footer_note'])}</p></footer>{extra}</body></html>'''
    def page_head(self,p,current):
        return f'<section class="page-heading section"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="{self.link("home")}">{e(self.ui["home"])}</a><span aria-hidden="true">/</span><span aria-current="page">{e(self.ui[current])}</span></nav><p class="eyebrow">{e(p["label"])}</p>{heading(p["title"],p["emphasis"])}<p class="page-intro">{e(p["intro"])}</p></section>'
    def cta(self,p):
        return f'<section class="contact section page-cta"><div><p class="eyebrow">{e(p["label"])}</p>{heading(p["title"],p["emphasis"],2)}<p>{e(p["intro"])}</p></div><div>{self.button("contact",p["button"],"submit")}{self.contacts()}</div></section>'
    def cards(self,projects,level=3):
        cards=[]
        for i,p in enumerate(projects):
            cards.append(f'<a class="project-card{" wide" if i%3==2 else ""}" href="{self.project_link(p)}"><div class="project-image">{self.photo(p["image"],p["image_alt"],"card-photo")}<span class="project-arrow">{icon()}</span></div><div class="project-title"><h{level}>{e(p["title"])}</h{level}><span>{i+1:02d}</span></div><p>{e(p["subtitle"])}</p></a>')
        return '<div class="project-grid">'+''.join(cards)+'</div>' if cards else f'<p class="empty-state">{e(self.ui["empty_projects"])}</p>'
    def steps(self,p):
        items=self.pages['services']['steps']
        return f'<section class="process section"><p class="eyebrow">{e(p["process_label"])}</p>{heading(p["process_title"],p["process_emphasis"],2)}<div class="steps">'+''.join(f'<article><span>{e(x["label"])}</span><h3>{e(x["title"])}</h3><p>{e(x["description"])}</p></article>' for x in items)+'</div></section>'
    def home(self):
        p=self.pages['home']
        body=f'''<section class="hero"><div class="hero-top"><p class="eyebrow">{e(p['label'])}</p><span class="availability"><i></i>{e(p['availability'])}</span></div><div class="hero-title"><h1><span>{e(p['title'])}</span> <em>{e(p['emphasis'])}</em></h1><div class="hero-intro"><div class="hero-intro-copy"><p>{e(p['intro'])}</p>{self.button('contact',p['button'],'hero-cta')}</div><a class="circle-link" href="{self.link('projects')}" aria-label="{e(p['explore'])}">{icon('arrow-down')}</a></div></div><div class="hero-image">{self.photo(p['image'],p['image_alt'],'hero-photo',True)}<div class="image-caption"><span>{e(p['caption'])}</span><span>{e(p['image_note'])}</span></div></div><div class="hero-bottom"><p>{e(p['bottom'])}</p>{self.button('projects',p['explore'])}</div></section>
<section class="projects section"><div class="section-heading"><div><p class="eyebrow">{e(p['projects_label'])}</p>{heading(p['projects_title'],p['projects_emphasis'],2)}</div><p class="small-note">{e(p['projects_note'])}</p></div>{self.cards(self.projects[:3])}<div class="section-more">{self.button('projects',self.ui['all_projects'])}</div></section>
<section class="intro section"><p class="eyebrow">{e(p['about_label'])}</p><div>{heading(p['about_title'],p['about_emphasis'],2)}<p class="body-copy">{e(p['about_intro'])}</p>{self.button('about',self.ui['more_about'])}</div></section>
<section class="section home-services"><p class="eyebrow">{e(p['services_label'])}</p>{heading(p['services_title'],p['services_emphasis'],2)}<div class="service-teasers">'''
        for i,item in enumerate(self.pages['services']['items']):
            body+=f'<a href="{self.link("services")}#service-{i+1}"><span class="eyebrow">{i+1:02d}</span><h3>{e(item["title"])}</h3>{icon()}</a>'
        body+=f'</div>{self.button("services",self.ui["all_services"])}</section>'+self.cta(p['cta'])
        return self.shell(p['seo_title'],p['seo_description'],body,'home')
    def form(self,p):
        f=p['form'];fields=''
        for name in ['name','contact','message']:
            label=f'{name}_label';placeholder=f'{name}_placeholder'
            field=f'<textarea id="{name}" name="{name}" rows="3" required maxlength="3000" placeholder="{e(f[placeholder])}"></textarea>' if name=='message' else f'<input id="{name}" name="{name}" required maxlength="150" autocomplete="{"name" if name=="name" else "email"}" placeholder="{e(f[placeholder])}">'
            fields+=f'<label for="{name}">{e(f[label])}</label>{field}'
        return f'<noscript><p class="body-copy">{e(f["nojs_note"])}</p></noscript><form id="brief-form" hidden><h2 class="form-title">{e(p["form_title"])}</h2>{fields}<button class="submit" type="submit">{e(f["submit"])}{icon()}</button><p class="form-note">{e(f["note"])}</p><div id="brief-result" hidden role="status"><p>{e(f["result"])}</p><textarea id="brief-text" readonly aria-label="Текст обращения" rows="6"></textarea><button type="button" id="copy-brief">{e(f["copy"])}</button><span id="copy-status" aria-live="polite"></span><a class="email-brief" id="email-brief" hidden>{e(f["email_button"])}{icon()}</a></div></form><script id="form-data" type="application/json">{safe_json(dict(form=f,email=self.settings["contacts"].get("email","")))}</script>'
    def standard_page(self,key):
        p=self.pages[key];body=self.page_head(p,key)
        if key=='projects':body+='<section class="section portfolio-section">'+self.cards(self.projects,2)+'</section>'
        elif key=='about':
            body+=f'<section class="section about-story"><div class="about-image">{self.photo(p["image"],p["image_alt"])}</div><div class="about-copy">{paragraphs(p["paragraphs"])}<h2 class="minor-title">{e(p["principles_title"])}</h2><div class="principles">'+''.join(f'<span>{e(x)}</span>' for x in p['principles'])+'</div></div></section>'+self.steps(p)
        elif key=='services':
            body+='<section class="section service-editorial">'+''.join(f'<article id="service-{i+1}"><span class="eyebrow">{i+1:02d}</span><div><h2>{e(x["title"])}</h2><p class="body-copy">{e(x["description"])}</p></div>{self.button("contact",self.ui["discuss"])}</article>' for i,x in enumerate(p['items']))+'</section>'+self.steps(p)
        elif key=='videos':
            body+='<section class="section videos-page"><div class="video-grid">'
            for video in (p.get('items') or []):
                poster=self.photo(video.get('poster',''),video['title'],'video-poster')
                body+=f'<article class="video-card" data-video-url="{e(video["url"])}"><div class="video-frame">{poster}<button class="video-play" type="button">{e(self.ui["watch_video"])}</button></div><h2>{e(video["title"])}</h2><p>{e(video["description"])}</p><a class="video-source" hidden>{e(self.ui["open_vk"])}{icon()}</a></article>'
            if not p.get('items'):
                body+=f'<div class="empty-video"><span class="eyebrow">EPIPHANY INTERIOR</span><h2>{e(p["empty_title"])}</h2><p class="body-copy">{e(p["empty_text"])}</p>{self.contacts()}</div>'
            body+='</div></section><script id="video-data" type="application/json">'+safe_json({'unavailable':self.ui['video_unavailable']})+'</script>'
        elif key=='contact':body+=f'<section class="contact section contact-page"><div>{self.contacts()}</div>{self.form(p)}</section>'
        if 'cta' in p:body+=self.cta(p['cta'])
        return self.shell(p['seo_title'],p['seo_description'],body,key,ROUTES[key])
    def gallery_dialog(self):
        return f'''<dialog id="project-dialog" aria-labelledby="dialog-title"><div class="dialog-toolbar"><p class="eyebrow" id="dialog-title"></p><button class="dialog-close" aria-label="Закрыть фотографии">{icon('close')}</button></div><div class="project-viewer" id="project-viewer"><img id="dialog-photo" alt="" decoding="async"><div class="viewer-controls" id="viewer-controls" hidden><button type="button" id="photo-previous" aria-label="Предыдущее фото">{icon('arrow-left')}</button><span id="photo-count" aria-live="polite"></span><button type="button" id="photo-next" aria-label="Следующее фото">{icon('arrow-right')}</button></div></div><div class="project-gallery" id="project-gallery" role="group" aria-label="Фотографии проекта"></div></dialog>'''
    def project_page(self,p,index):
        photos=[dict(image=p['image'],alt=p['image_alt'])]+(p.get('images') or [])
        photos=[dict(url=self.image(x['image']),alt=x.get('alt',p['title'])) for x in photos if self.image(x.get('image',''))]
        crumbs=f'<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="{self.link("home")}">{e(self.ui["home"])}</a><span>/</span><a href="{self.link("projects")}">{e(self.ui["projects"])}</a><span>/</span><span aria-current="page">{e(p["title"])}</span></nav>'
        body=f'<section class="section project-heading">{crumbs}<p class="eyebrow">{e(self.ui["concept_label"] if p.get("is_concept") else self.ui["project_label"])}</p>{heading(p["title"])}<p class="page-intro">{e(p["subtitle"])}</p><div class="project-facts">'+''.join(f'<span>{e(p[k])}</span>' for k in ['location','area','year'] if p.get(k))+'</div></section>'
        body+='<section class="section project-story">'
        if photos:body+=f'<button class="project-cover" data-gallery-open="0" aria-label="{e(self.ui["open_photo"])}">{self.photo(p["image"],p["image_alt"],priority=True)}<span class="project-arrow">{icon()}</span></button>'
        body+=f'<div class="project-narrative"><p class="project-lead">{e(p["description"])}</p>{paragraphs(p.get("body",[]))}</div>'
        if p.get('is_concept'):body+=f'<p class="form-note concept-note">{e(self.ui["concept_note"])}</p>'
        body+='<div class="project-photo-grid">'
        for i,photo in enumerate(photos[1:],1):body+=f'<figure><button data-gallery-open="{i}" aria-label="{e(self.ui["open_photo"])}: {e(photo["alt"])}"><img src="{e(photo["url"])}" alt="{e(photo["alt"])}" loading="lazy" decoding="async"></button><figcaption>{e(photo["alt"])}</figcaption></figure>'
        body+='</div></section><nav class="project-pagination section" aria-label="Другие проекты">'
        if index>0: body+=f'<a href="{self.project_link(self.projects[index-1])}">{icon("arrow-left")}<span><small>{e(self.ui["previous_project"])}</small>{e(self.projects[index-1]["title"])}</span></a>'
        body+=self.button('projects',self.ui['back_projects'])
        if index+1<len(self.projects):body+=f'<a href="{self.project_link(self.projects[index+1])}"><span><small>{e(self.ui["next_project"])}</small>{e(self.projects[index+1]["title"])}</span>{icon()}</a>'
        body+='</nav>'+self.cta(self.pages['projects']['cta'])
        extra=self.gallery_dialog()+f'<script id="gallery-data" type="application/json">{safe_json(dict(title=p["title"],photos=photos))}</script>'
        return self.shell(p['title']+' — Epiphany Interior',p.get('seo_description') or p['description'],body,'projects','projects/'+p['slug']+'/',extra)

def build(content,output,url=DEFAULT_URL):
    site=Site(content,url);output=Path(output)
    if output.resolve() in (ROOT.resolve(),Path(content).resolve()) or ROOT.resolve().is_relative_to(output.resolve()): raise ValueError('Unsafe output directory')
    if output.exists():shutil.rmtree(output)
    output.mkdir(parents=True)
    pages={'index.html':site.home()}
    for key in ROUTES:
        if key!='home':pages[ROUTES[key]+'index.html']=site.standard_page(key)
    for i,p in enumerate(site.projects):pages['projects/'+p['slug']+'/index.html']=site.project_page(p,i)
    u=site.ui
    pages['404.html']=site.shell(u['not_found_title'],u['not_found_text'],f'<section class="section page-heading"><p class="eyebrow">404</p>{heading(u["not_found_title"])}<p class="page-intro">{e(u["not_found_text"])}</p>{site.button("home",u["home"])}</section>','')
    for path,body in pages.items():
        target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(body)
    for directory in ['assets','admin']:shutil.copytree(ROOT/directory,output/directory)
    for file in ['style.css','script.js','content-utils.mjs','.nojekyll']:shutil.copy2(ROOT/file,output/file)
    # Formatted source JSON is private to the build/CMS, never needed by site visitors.
    urls=[site.url+(path.removesuffix('index.html')) for path in pages if path!='404.html']
    (output/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+xml_escape(url)+'</loc></url>' for url in urls)+'</urlset>')
    print(f'Built {len(pages)} HTML pages in {output}')
    return pages
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site-url',default=DEFAULT_URL);parser.add_argument('--output',default=str(ROOT/'_site'))
    args=parser.parse_args();build(ROOT/'content',args.output,args.site_url)
