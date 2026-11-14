import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fixture,sourceSnapshot} from './helpers/password-site.mjs';
import {Site} from '../site-worker/src/render.mjs';
import {schema} from '../site-worker/src/content.mjs';

test('decision copy and optional portrait save and publish from the home editor; clearing text stays cleared',async()=>{
 const f=await fixture(),user=await f.login();let doc=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();
 doc.data.decisions=structuredClone(schema.pages.find(x=>x.id==='home').fields.find(x=>x.name==='decisions').default);
 doc.data.decisions.layout.title='**План для жизни**';doc.data.decisions.layout.description='<script>evil</script>';doc.data.decisions.image_note='';
 doc.data.about_image='assets/living-1536.webp';doc.data.about_image_alt='Портрет дизайнера';
 const saved=await f.request('/api/pages/home',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:doc});assert.equal(saved.status,200,await saved.clone().text());
 const html=await (await f.request('/')).text();assert.match(html,/<strong>План для жизни<\/strong>/);assert.ok(!html.includes('<script>evil</script>'));
 assert.match(html,/class="intro-portrait"/);assert.match(html,/alt="Портрет дизайнера"/);assert.ok(!html.includes('Свет. Материалы. Ощущения.'));
 const again=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();assert.equal(again.data.decisions.image_note,'');
});
test('custom decision fields, portrait and optional service prices render identically in Python and live HTML',async()=>{
 const {content,icons}=await sourceSnapshot();content['content/pages/home.json'].decisions=structuredClone(schema.pages.find(x=>x.id==='home').fields.find(x=>x.name==='decisions').default);
 content['content/pages/home.json'].decisions.title='Новый **заголовок**';content['content/pages/home.json'].about_image='assets/living-1536.webp';
 content['content/pages/services.json'].items[0].price='от 3 000 ₽/м²';
 const site=new Site(content,'https://studio.example/',icons);
 const python=JSON.parse(execFileSync('python3',['-c',`import json,sys,tempfile,shutil\nfrom pathlib import Path\nfrom scripts.build import Site,ROOT\nwith tempfile.TemporaryDirectory() as d:\n p=Path(d)/'content';shutil.copytree(ROOT/'content',p)\n for name,data in json.load(sys.stdin).items():(p/name.removeprefix('content/')).write_text(json.dumps(data))\n s=Site(p,'https://studio.example/');print(json.dumps([s.home(),s.standard_page('services')]))`],{input:JSON.stringify(content),encoding:'utf8'}));
 assert.equal(site.home(),python[0]);assert.equal(site.standardPage('services'),python[1]);assert.match(python[1],/<p class="service-price">от 3 000 ₽\/м²<\/p>/);
 for(const item of content['content/pages/services.json'].items)delete item.price;
 assert.ok(!new Site(content,'https://studio.example/',icons).standardPage('services').includes('class="service-price"'));
});
