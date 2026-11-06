import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,sourceSnapshot} from './helpers/password-site.mjs';
import {Site} from '../site-worker/src/render.mjs';

const graphs=html=>[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m=>JSON.parse(m[1])['@graph']);
test('SEO: public routes, canonical hierarchy, escaped structured data and non-indexable error/empty pages',async()=>{
  const snapshot=await sourceSnapshot(),site=new Site(snapshot.content,'https://studio.example',snapshot.icons);
  const titles=new Set();
  for(const path of ['/','/about/','/services/','/contact/','/projects/',...site.projects.map(p=>'/projects/'+p.slug+'/')]){
    const response=site.response(path),html=await response.text();
    assert.equal(response.status,200);assert.match(html,/name="robots" content="index,follow,max-image-preview:large"/);
    assert.ok(html.includes('rel="canonical" href="https://studio.example'+path+'"'));
    assert.equal([...html.matchAll(/<h1[ >]/g)].length,1);
    const title=html.match(/<title>(.*?)<\/title>/)[1];assert.ok(!titles.has(title));titles.add(title);
    const graph=graphs(html);assert.ok(graph.some(n=>n['@type']==='WebSite'));
    if(path!=='/'){
      const crumbs=graph.find(n=>n['@type']==='BreadcrumbList').itemListElement;
      assert.equal(crumbs.at(-1).item,'https://studio.example'+path);
      assert.equal(crumbs.length,path.startsWith('/projects/')&&path!=='/projects/'?3:2);
    }
  }
  let html=await site.response('/videos/').text();assert.match(html,/noindex,follow/);assert.ok(!site.sitemap().includes('/videos/'));
  // Publishing a real video automatically makes its page eligible again.
  site.pages.videos.items=[{url:'https://vk.com/video-1_2',title:'Обзор',description:'Видео'}];
  assert.ok(site.sitemap().includes('/videos/'));assert.match(await site.response('/videos/').text(),/index,follow,max-image-preview/);
  const error=site.response('/missing-page/');assert.equal(error.status,404);html=await error.text();assert.match(html,/noindex,follow/);assert.ok(!html.includes('rel="canonical"'));assert.equal(graphs(html).length,0);
  assert.equal(site.response('/about').headers.get('Location'),'/about/');
  assert.equal(site.response('/about/index.html').status,301);
  assert.equal(site.response('/missing-page/index.html').status,404);
  site.pages.home.seo_title='Безопасный </script><script>alert(1)</script>';
  html=site.home();assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(graphs(html).length);
});

test('SEO: robots is publicly available, points to the live sitemap; admin and API have noindex headers',async()=>{
  const f=await fixture();
  const robots=await f.request('/robots.txt');assert.equal(robots.status,200);assert.match(robots.headers.get('Content-Type'),/text\/plain/);
  const body=await robots.text();assert.match(body,/Sitemap: https:\/\/studio\.example\/sitemap.xml/);assert.ok(!body.includes('Disallow: /\n'));
  for(const path of ['/admin/login/','/api/leads'])assert.match((await f.request(path)).headers.get('X-Robots-Tag'),/noindex/);
});

test('canonical redirects preserve search parameters while page canonical stays clean',async()=>{
 const f=await fixture();
 for(const path of ['/contact?interest=layout&utm_source=test','/about/index.html?utm_campaign=launch']){
  const response=await f.request(path);assert.equal(response.status,301);
  assert.equal(new URL(response.headers.get('Location'),'https://studio.example').search,new URL(path,'https://studio.example').search);
 }
 const html=await(await f.request('/contact/?interest=layout&utm_source=test')).text();assert.match(html,/rel="canonical" href="https:\/\/studio\.example\/contact\/"/);
});
