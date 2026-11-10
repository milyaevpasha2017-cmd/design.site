import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceSnapshot} from './helpers/password-site.mjs';
import {Site} from '../site-worker/src/render.mjs';

test('project arrows cycle through published works and land on the photo without nesting links in its button',async()=>{
 const snapshot=await sourceSnapshot(),base=Object.entries(snapshot.content).find(([p])=>p.startsWith('content/projects/'))[1];
 for(const path of Object.keys(snapshot.content))if(path.startsWith('content/projects/'))delete snapshot.content[path];
 for(const [i,slug]of ['first','middle','last'].entries())snapshot.content['content/projects/'+slug+'.json']={...base,slug,title:slug,order:i,published:true};
 snapshot.content['content/projects/draft.json']={...base,slug:'draft',order:1,published:false};
 const site=new Site(snapshot.content,'https://example.test',snapshot.icons);
 for(const [slug,previous,next]of [['first','last','middle'],['middle','first','last'],['last','middle','first']]){
  const html=await site.response('/projects/'+slug+'/').text(),nav=html.match(/<nav class="project-switcher"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);assert.ok(nav.includes('href="/projects/'+previous+'/#project-visual"'));assert.ok(nav.includes('href="/projects/'+next+'/#project-visual"'));
  assert.ok(!nav.includes('draft'));assert.ok(!html.includes('class="project-pagination'));
  const button=html.match(/<button class="project-cover"[\s\S]*?<\/button>/)?.[0];assert.ok(button?.includes('data-gallery-open="0"'));assert.ok(!button.includes('<a '));
 }
});

test('one published work keeps its photo viewer without arrows pointing to itself',async()=>{
 const snapshot=await sourceSnapshot(),projects=Object.keys(snapshot.content).filter(p=>p.startsWith('content/projects/'));
 for(const path of projects.slice(1))delete snapshot.content[path];
 snapshot.content[projects[0]].published=true;
 const site=new Site(snapshot.content,'https://example.test',snapshot.icons),html=await site.response('/projects/'+site.projects[0].slug+'/').text();
 assert.ok(html.includes('id="project-visual"'));assert.ok(html.includes('data-gallery-open="0"'));assert.ok(!html.includes('class="project-switcher"'));
});
