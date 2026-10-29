import importlib.util
import json
import shutil
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('site_build',ROOT/'scripts/build.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Links(HTMLParser):
    def __init__(self): super().__init__();self.urls=[];self.titles=0
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='h1': self.titles+=1
        if tag in ['a','img','script','link']:
            value=d.get('src') or d.get('href')
            if value:self.urls.append(value)
class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.content=self.root/'content';shutil.copytree(ROOT/'content',self.content)
        # Fixed project fixtures keep CMS additions/removals from invalidating the test suite.
        for path in (self.content/'projects').glob('*.json'):path.unlink()
        for i,(slug,title) in enumerate([('warm-minimalism','Тёплый минимализм'),('closer-to-nature','Ближе к природе'),('art-of-simplicity','Искусство простого')]):
            data=dict(slug=slug,title=title,subtitle='Тестовая подпись',description='Описание проекта',image='assets/living.png',image_alt='Фотография интерьера',is_concept=True,published=True,order=i,images=[],body=[])
            (self.content/'projects'/f'{slug}.json').write_text(json.dumps(data))
    def tearDown(self): self.temp.cleanup()
    def build(self,base='https://example.test/design.site/'):
        return module.build(self.content,self.root/'public',base)
    def test_all_pages_have_real_links_and_one_main_heading(self):
        pages=self.build()
        self.assertEqual(len(pages),10)
        for path,body in pages.items():
            parser=Links();parser.feed(body);self.assertEqual(parser.titles,1,path)
            for value in parser.urls:
                u=urlsplit(value)
                if u.scheme or value.startswith('#'):continue
                self.assertTrue(u.path.startswith('/design.site/'),(path,value))
                local=self.root/'public'/u.path.removeprefix('/design.site/')
                if u.path.endswith('/'):local=local/'index.html'
                self.assertTrue(local.exists(),(path,value))
        self.assertIn('rel="canonical" href="https://example.test/design.site/about/"',pages['about/index.html'])
        self.assertIn('Тёплый минимализм',pages['projects/warm-minimalism/index.html'])
    def test_new_project_gets_own_page_and_deleted_or_unpublished_is_absent(self):
        p=json.loads((self.content/'projects/warm-minimalism.json').read_text());p.update(slug='new-project',title='Новый проект',is_concept=False,order=0,images=[{'image':'assets/living.png','alt':'Гостиная'}])
        (self.content/'projects/new-project.json').write_text(json.dumps(p))
        pages=self.build();self.assertIn('projects/new-project/index.html',pages);self.assertIn('/projects/new-project/',pages['projects/index.html'])
        self.assertIn('Гостиная',pages['projects/new-project/index.html'])
        p['published']=False;(self.content/'projects/new-project.json').write_text(json.dumps(p));pages=self.build();self.assertNotIn('projects/new-project/index.html',pages)
        self.assertFalse((self.root/'public/projects/new-project').exists())
    def test_cms_text_changes_and_html_is_escaped_in_static_output(self):
        p=self.content/'pages/about.json';d=json.loads(p.read_text());d['title']='<script>alert("x")</script>';d['paragraphs']=['Новый текст из админки'];p.write_text(json.dumps(d))
        body=self.build()['about/index.html'];self.assertIn('&lt;script&gt;',body);self.assertNotIn('<script>alert',body);self.assertIn('Новый текст из админки',body)
    def test_optional_lists_can_be_null_and_nojs_form_cannot_submit_data(self):
        path=self.content/'projects/warm-minimalism.json';p=json.loads(path.read_text());p['images']=None;p['body']=None;path.write_text(json.dumps(p))
        path=self.content/'pages/videos.json';p=json.loads(path.read_text());p['items']=None;path.write_text(json.dumps(p))
        pages=self.build();self.assertIn('<form id="brief-form" hidden>',pages['contact/index.html']);self.assertIn('<noscript>',pages['contact/index.html'])

    def test_invalid_and_duplicate_project_urls_fail_build(self):
        p=self.content/'projects/warm-minimalism.json';d=json.loads(p.read_text());d['slug']='../escape';p.write_text(json.dumps(d))
        with self.assertRaisesRegex(ValueError,'Invalid project slug'):self.build()
        d['slug']='closer-to-nature';p.write_text(json.dumps(d))
        with self.assertRaisesRegex(ValueError,'Duplicate project slug'):self.build()
    def test_custom_domain_paths_and_empty_portfolio(self):
        for path in (self.content/'projects').glob('*.json'):path.unlink()
        pages=self.build('https://interior.example/');self.assertIn('href="/about/"',pages['index.html']);self.assertIn(module.e(json.loads((self.content/'settings.json').read_text())['ui']['empty_projects']),pages['projects/index.html'])
        self.assertTrue((self.root/'public/sitemap.xml').exists())
if __name__=='__main__':unittest.main()
