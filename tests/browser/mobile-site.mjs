// Public-site checks in Chromium with touch input. Fixtures and all HTTP
// responses are local; no real content, messages or VK requests are sent.
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const temporary=await mkdtemp(path.join(tmpdir(),'epiphany-mobile-'));
const root=path.join(temporary,'site');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.webp':'image/webp','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)&&file!==root)throw new Error('Invalid path');
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
execFileSync('python3',['-c',`
import json,shutil,sys
from pathlib import Path
from scripts.build import ROOT,build
content=Path(sys.argv[1])/'content';shutil.copytree(ROOT/'content',content)
homefile=content/'pages/home.json';home=json.loads(homefile.read_text());home['image']='assets/living.png';homefile.write_text(json.dumps(home))
p=dict(slug='mobile-gallery',title='Квартира для семьи: свет, искусство и спокойный ритм',subtitle='История интерьера',description='Светлый интерьер с характером',image='assets/living.png',image_alt='Обложка',is_concept=True,published=True,order=999,images=[dict(image='assets/living.png',alt='Второй ракурс'),dict(image='assets/living.png',alt='Третий ракурс')],body=[])
(content/'projects/mobile-gallery.json').write_text(json.dumps(p))
file=content/'pages/videos.json';video=json.loads(file.read_text());video['items']=[dict(title='Обзор проекта',description='Знакомство с интерьером',url='https://vk.com/video-123_456',poster='assets/living.png')];file.write_text(json.dumps(video))
build(content,sys.argv[2],sys.argv[3]+'/',admin_mode='password')
` ,temporary,root,origin],{stdio:'pipe'});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.continue();
    if(url.hostname==='vk.com')return route.fulfill({contentType:'text/html',body:'<html lang="ru"><body>Тестовый плеер</body></html>'});
    return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const width of [320,360,390,430,600,768,900,1024,1440]){
    await page.setViewportSize({width,height:844});
    for(const route of ['/','/projects/','/about/','/services/','/videos/','/contact/','/projects/mobile-gallery/']){
      await page.goto(origin+route);
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Horizontal overflow: ${width}px ${route}`);
      for(const target of await page.locator('.footer-nav a,footer>a:not(.logo),.hero-cta,.hero-bottom .text-link').all()){
        assert.ok((await target.boundingBox()).height>=44,`Touch target too short: ${width}px ${route}`);
      }
    }
  }
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/');
  const hero=page.locator('.hero-photo');await hero.evaluate(image=>image.decode());
  assert.match(await hero.evaluate(image=>image.currentSrc),/living-(480|960|1536)\.webp$/);
  assert.ok((await stat(path.join(root,new URL(await hero.evaluate(image=>image.currentSrc)).pathname))).size<350000);
  await page.screenshot({path:'/tmp/mobile-after-home.png',fullPage:true});

  // Navigation remains reachable after scrolling; outside tap and Escape close
  // it, and selecting a page navigates without a stale expanded state.
  await page.evaluate(()=>scrollTo(0,1500));
  const menu=page.locator('.menu-toggle');assert.ok((await menu.boundingBox()).y>=0);
  await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'true');
  await page.locator('#navigation a[href="/contact/"]').tap();
  await page.waitForURL(origin+'/contact/');assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await menu.tap();await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert.equal(await menu.evaluate(element=>element===document.activeElement),true);
  await menu.tap();await page.touchscreen.tap(388,824);assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await page.locator('#name').fill('Полина');await page.locator('#contact').fill('hello@example.com');await page.locator('#message').fill('Квартира 80 м², спокойные натуральные оттенки.');
  assert.equal(await page.locator('#name').evaluate(element=>getComputedStyle(element).fontSize),'16px');
  await page.locator('#brief-form .submit').tap();
  assert.ok((await page.locator('#brief-text').inputValue()).includes('Квартира 80 м²'));
  assert.match(await page.locator('#email-brief').getAttribute('href'),/^mailto:/);
  await page.screenshot({path:'/tmp/mobile-after-contact.png',fullPage:true});

  await page.goto(origin+'/projects/mobile-gallery/');await page.locator('.project-cover').tap();
  const dialog=page.locator('#project-dialog');await dialog.waitFor({state:'visible'});
  let box=await dialog.boundingBox();assert.equal(Math.round(box.height),844);assert.equal(Math.round(box.width),390);
  await page.locator('#photo-next').tap();await page.getByText('2 / 3',{exact:true}).waitFor({timeout:3000});
  await page.locator('#photo-previous').tap();await page.getByText('1 / 3',{exact:true}).waitFor({timeout:3000});
  await page.locator('.dialog-close').tap();await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.body.classList.contains('modal-open'));
  await page.setViewportSize({width:844,height:390});await page.locator('.project-cover').tap();
  box=await dialog.boundingBox();assert.equal(Math.round(box.height),390);assert.equal(Math.round(box.width),844);
  await page.locator('.dialog-close').tap();await dialog.waitFor({state:'hidden'});

  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/videos/');
  assert.equal(await page.locator('iframe').count(),0);await page.locator('.video-play').tap();
  await page.locator('.video-frame iframe').waitFor();
  assert.equal(await page.locator('.video-frame iframe').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

  // Keep the protocol-driven swipe after Playwright's own touch actions so two
  // separate input controllers do not share a gesture sequence.
  await page.goto(origin+'/projects/mobile-gallery/');await page.locator('.project-cover').tap();
  const viewer=await page.locator('#project-viewer').boundingBox();
  const client=await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:viewer.x+viewer.width*.8,y:viewer.y+viewer.height*.5}]});
  for(const fraction of [.65,.5,.35,.2])await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:viewer.x+viewer.width*fraction,y:viewer.y+viewer.height*.5}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.getByText('2 / 3',{exact:true}).waitFor();
  await page.screenshot({path:'/tmp/mobile-after-gallery.png'});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.body.classList.contains('modal-open'));
  await client.detach();
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: 320–1440px pages, 44px links, sticky touch menu, contact form, responsive WebP, fullscreen portrait/landscape gallery, real touch swipe and click-to-load video.');
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true});
}
