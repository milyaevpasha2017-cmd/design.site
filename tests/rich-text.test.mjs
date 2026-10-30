import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {richText,plainText} from '../rich-text.mjs';
import {combineHeadings,combinedValue} from '../password-admin/formatting.mjs';
import {fixture,sourceSnapshot} from './helpers/password-site.mjs';
import {Site} from '../site-worker/src/render.mjs';
import {schema,validate} from '../site-worker/src/content.mjs';
const cases=JSON.parse(await readFile(new URL('./fixtures/rich-text.json',import.meta.url),'utf8'));
test('inline formatting has identical safe output in Python, live site and editor preview',()=>{
  const python=JSON.parse(execFileSync('python3',['-c','import json,sys;from scripts.rich_text import rich_text;print(json.dumps([rich_text(x[0]) for x in json.load(sys.stdin)]))'],{input:JSON.stringify(cases),encoding:'utf8'}));
  for(const [index,[source,expected]]of cases.entries()){
    assert.equal(richText(source),expected,source);assert.equal(python[index],expected,source);
  }
  assert.equal(richText('[**Подробнее**](https://example.com)',{links:false}),'<strong>Подробнее</strong>');
  assert.equal(plainText('Мой **дом** и *сад* [здесь](/about/)'),'Мой дом и сад здесь');
});
test('page sections cover every field once and keep heading pairs together',()=>{
  for(const page of [...schema.pages,{id:'project',fields:schema.projectFields,sections:schema.projectSections}]){
    const names=page.sections.flatMap(section=>section.fields);
    assert.deepEqual([...names].sort(),page.fields.map(field=>field.name).sort(),page.id);
    for(const section of page.sections){
      const fields=page.fields.filter(field=>section.fields.includes(field.name));
      for(const field of fields.filter(field=>field.name.endsWith('emphasis'))){
        const title=field.name==='emphasis'?'title':field.name.replace(/emphasis$/,'title');
        assert.ok(section.fields.includes(title),page.id+': '+title);
      }
    }
  }
});
test('combining old headings does not mutate content until the user edits',()=>{
  const fields=schema.pages.find(page=>page.id==='home').fields;
  const source={title:'Пространство,\nв котором',emphasis:'вы дома.'},before=structuredClone(source);
  const field=combineHeadings(fields).find(field=>field.name==='title');
  assert.equal(combinedValue(field,source,true),'Пространство,\nв котором *вы дома.*');
  assert.deepEqual(source,before);assert.ok(!combineHeadings(fields).some(field=>field.name==='emphasis'));
});
test('combined title and rich text survive save, reopen, shortening, and immediate live publication',async()=>{
  const f=await fixture(),user=await f.login();let record=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();
  for(const title of ['Пространство,\nв котором *вы дома.*','**Новый дом**','Дом']){
    record.data.title=title;record.data.emphasis='';record.data.intro='**Интерьеры** с характером.\n[Обсудить](https://t.me/epiphany)';
    const saved=await f.request('/api/pages/home',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:record});
    assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.published,true);
    record=await (await f.request('/api/pages/home',{cookie:user.cookie})).json();assert.equal(record.data.title,title);assert.equal(record.data.emphasis,'');
    const html=await (await f.request('/')).text();assert.ok(html.includes(richText(title,{links:false})));assert.ok(html.includes('<strong>Интерьеры</strong>'));assert.ok(html.includes('class="rich-link" href="https://t.me/epiphany"'));
  }
});
test('static and live renderers agree on formatted headings, lists, links, and literal HTML',async()=>{
  const {content,icons}=await sourceSnapshot();
  content['content/pages/home.json'].title='**Пространство**,\nв котором *вы дома.*';content['content/pages/home.json'].emphasis='';
  content['content/pages/home.json'].intro='__Интерьеры__\n• **Дом**\n• [Контакты](/contact/)\n<script>evil()</script>';
  const html=new Site(content,'https://studio.example/',icons).home();
  const python=execFileSync('python3',['-c',`import json,sys,tempfile,shutil\nfrom pathlib import Path\nfrom scripts.build import Site,ROOT\nwith tempfile.TemporaryDirectory() as d:\n p=Path(d)/'content';shutil.copytree(ROOT/'content',p)\n for name,data in json.load(sys.stdin).items():(p/name.removeprefix('content/')).write_text(json.dumps(data))\n print(Site(p,'https://studio.example/').home(),end='')`],{input:JSON.stringify(content),encoding:'utf8'});
  assert.equal(html,python);validate(schema.pages.find(page=>page.id==='home').fields,content['content/pages/home.json']);
});
