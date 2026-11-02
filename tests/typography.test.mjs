import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fonts,typography} from '../site-worker/src/typography.mjs';
import {fixture,sourceSnapshot} from './helpers/password-site.mjs';
import {Site} from '../site-worker/src/render.mjs';
test('font changes publish across all public pages and persist through subsequent settings saves',async()=>{
 const f=await fixture(),user=await f.login();
 let record=await (await f.request('/api/pages/settings',{cookie:user.cookie})).json();
 record.data.typography={body:'onest',display:'literata'};
 const save=()=>f.request('/api/pages/settings',{method:'PUT',cookie:user.cookie,csrf:user.csrf,body:record});
 assert.equal((await (await save()).json()).published,true);
 for(const route of ['/','/contact/','/quiz/','/privacy/','/projects/']){
  const html=await (await f.request(route)).text();
  assert.match(html,/data-font-body="onest" data-font-display="literata"/);
  assert.match(html,/href="\/assets\/fonts\/onest.woff2" as="font"/);
 }
 record=await (await f.request('/api/pages/settings',{cookie:user.cookie})).json();
 record.data.footer_note='New footer';assert.equal((await (await save()).json()).published,true);
 record=await (await f.request('/api/pages/settings',{cookie:user.cookie})).json();
 assert.deepEqual(record.data.typography,{body:'onest',display:'literata'});
 record.data.typography.body='x" style="color:red';assert.equal((await save()).status,400);
});
test('legacy settings keep current fonts; unknown IDs cannot inject CSS or markup',()=>{
 assert.equal(typography({}).body.id,'manrope');assert.equal(typography({}).display.id,'cormorant');
 assert.equal(typography({typography:{body:'url(https://evil.example/font)',display:'<script>'}}).body.id,'manrope');
 assert.equal(typography({typography:{body:'url(https://evil.example/font)',display:'<script>'}}).display.id,'cormorant');
});
test('every selectable family has self-hosted assets and matching CMS validation choices',async()=>{
 const schema=JSON.parse(await readFile(new URL('../password-admin/schema.json',import.meta.url),'utf8'));
 const fields=schema.pages.find(p=>p.id==='settings').fields.find(f=>f.name==='typography').fields;
 for(const field of fields)assert.deepEqual(field.options,fonts.map(f=>f.id));
 for(const font of fonts)for(const file of [font.file,font.italic].filter(Boolean)){
  const bytes=await readFile(new URL('../assets/fonts/'+file,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'wOF2');
 }
});
test('static builds and live rendering agree for changed fonts, including selected font preload',async()=>{
 const snapshot=await sourceSnapshot();snapshot.content['content/settings.json'].typography={body:'montserrat',display:'literata'};
 const live=new Site(snapshot.content,'https://studio.example',snapshot.icons).home();
 const built=execFileSync('python3',['-c',`from scripts.build import Site,ROOT
s=Site(ROOT/'content','https://studio.example/')
s.settings['typography']={'body':'montserrat','display':'literata'}
print(s.home(),end='')`],{encoding:'utf8'});
 assert.equal(live,built);
});
