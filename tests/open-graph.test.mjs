import test from 'node:test';
import assert from 'node:assert/strict';
import {Site} from '../site-worker/src/render.mjs';
import manifest from '../site-worker/src/image-manifest.json' with {type:'json'};
import {sourceSnapshot} from './helpers/password-site.mjs';
const metas=html=>Object.fromEntries([...html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)">/g)].map(m=>[m[1],m[2]]));
test('every public page has its own canonical social card and matching Twitter metadata',async()=>{
 const snapshot=await sourceSnapshot(),site=new Site(snapshot.content,'https://studio.example',snapshot.icons);
 const paths=['/','/about/','/services/','/projects/','/videos/','/contact/','/quiz/','/privacy/',...site.projects.map(p=>site.projectLink(p))];
 for(const path of paths){
  const html=await site.response(path).text(),m=metas(html);
  assert.equal(m['og:url'],'https://studio.example'+path,path);
  for(const key of ['og:title','og:description','og:image','og:image:alt'])assert.ok(m[key],key+' '+path);
  assert.match(m['og:image'],/^https:\/\/studio\.example\/assets\//);
  assert.equal(m['og:image:secure_url'],m['og:image']);assert.equal(m['twitter:image'],m['og:image']);assert.equal(m['twitter:title'],m['og:title']);assert.equal(m['twitter:description'],m['og:description']);assert.equal(m['twitter:image:alt'],m['og:image:alt']);
  assert.equal((html.match(/property="og:title"/g)||[]).length,1);
 }
 const project=site.projects[0],html=await site.response(site.projectLink(project)).text();assert.ok(metas(html)['og:title'].includes(project.title));
});
test('social previews are lightweight JPEGs with dimensions, escaped text and a project cover for portfolio',async()=>{
 const snapshot=await sourceSnapshot(),site=new Site(snapshot.content,'https://studio.example',snapshot.icons),project=site.projects[0];
 project.image='assets/og-fixture.jpg';project.image_alt='Комната "утро" <script> & свет';
 manifest[project.image]={width:1800,height:1200,variants:[{path:'assets/optimized/og-fixture.webp',width:1600}],social:{path:'assets/optimized/og-fixture.jpg',width:1200,height:630,type:'image/jpeg'}};
 try{
  for(const path of [site.projectLink(project),'/projects/']){
   const html=await site.response(path).text(),m=metas(html);
   assert.equal(m['og:image'],'https://studio.example/assets/optimized/og-fixture.jpg');assert.equal(m['og:image:type'],'image/jpeg');assert.equal(m['og:image:width'],'1200');assert.equal(m['og:image:height'],'630');assert.ok(m['og:image:alt'].includes('&quot;утро&quot;'));assert.ok(!m['og:image:alt'].includes('<script>'));
  }
 }finally{delete manifest[project.image];}
});

test('project grids and gallery thumbnails use responsive copies while full view retains original',async()=>{
 const snapshot=await sourceSnapshot(),site=new Site(snapshot.content,'https://studio.example',snapshot.icons),project=site.projects[0];
 const image='assets/gallery-test.jpg';project.images=[{image,alt:'Комната проекта'}];
 manifest[image]={width:2400,height:1600,variants:[{path:'assets/optimized/gallery-480.webp',width:480},{path:'assets/optimized/gallery-1600.webp',width:1600}]};
 try{
  const html=await site.response(site.projectLink(project)).text();
  const grid=html.match(/<div class="project-photo-grid">([\s\S]*?)<\/div>/)[1];
  assert.match(grid,/src="\/assets\/optimized\/gallery-1600.webp"/);assert.match(grid,/srcset=/);assert.match(grid,/width="2400" height="1600"/);assert.match(grid,/loading=lazy/);
  const data=JSON.parse(html.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.photos[1].url,'/assets/gallery-test.jpg');assert.equal(data.photos[1].thumbnail,'/assets/optimized/gallery-480.webp');
 }finally{delete manifest[image];}
});
