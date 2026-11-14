import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceSnapshot} from './helpers/password-site.mjs';
import {Site} from '../site-worker/src/render.mjs';

test('home portfolio keeps its arrow controls beside the photo rail, outside project links',async()=>{
 const snapshot=await sourceSnapshot(),site=new Site(snapshot.content,'https://example.test',snapshot.icons);
 const home=await site.response('/').text();
 assert.ok(home.indexOf('id="decision-heading"')<home.indexOf('id="selected-projects"'));
 assert.ok(home.indexOf('id="selected-projects"')<home.indexOf('class="section quiz-teaser'));
 const html=home,section=html.match(/<section id="selected-projects"[\s\S]*?<\/section>/)?.[0];
 assert.ok(section);
 assert.match(section,/<div class="project-rail-stage"><div class="project-grid">/);
 assert.match(section,/<button type="button" data-rail-prev aria-label="Предыдущий проект"><svg[\s\S]*?#icon-arrow-left/);
 assert.match(section,/<button type="button" data-rail-next aria-label="Следующий проект"><svg[\s\S]*?#icon-arrow-right/);
 assert.match(section,/aria-live="polite" aria-atomic="true"/);
 for(const link of section.matchAll(/<a\b[\s\S]*?<\/a>/g))assert.ok(!link[0].includes('data-rail-'));
 assert.ok(!section.includes('>Назад</button>'));assert.ok(!section.includes('>Далее</button>'));
});

test('individual projects retain their original bottom navigation and photo viewer without floating arrows',async()=>{
 const snapshot=await sourceSnapshot(),site=new Site(snapshot.content,'https://example.test',snapshot.icons);
 for(const project of site.projects){
  const html=await site.response('/projects/'+project.slug+'/').text();
  assert.ok(html.includes('class="project-pagination section"'));assert.ok(html.includes('data-gallery-open="0"'));
  assert.ok(!html.includes('class="project-switcher"'));assert.ok(!html.includes('data-rail-next'));
 }
});
