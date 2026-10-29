// Isolated end-to-end test: uses the real Worker handler, real DOM forms and
// HttpOnly cookies, with GitHub storage and Cloudflare DO storage replaced by
// local fixtures. No credentials or writes reach external services.
import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import https from 'node:https';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';import {createHash,createPublicKey} from 'node:crypto';
import {verifyPassword} from '../../site-worker/src/security.mjs';
import {fixture,TEST_PASSWORD} from '../helpers/password-site.mjs';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const f=await fixture();const root=path.resolve('_site-cloudflare');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mjs':'text/javascript','.json':'application/json','.png':'image/png'};
f.env.ASSETS.fetch=async request=>{const url=new URL(request.url);if(url.pathname==='/__credential-test')return new Response(await readFile('docs/create-admin-password.html'),{headers:{'Content-Type':'text/html'}});let file=decodeURIComponent(url.pathname).slice(1);if(file.endsWith('/'))file+='index.html';const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))return new Response('Not found',{status:404});try{return new Response(await readFile(target),{headers:{'Content-Type':types[path.extname(target)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}};
const temporary=await mkdtemp(path.join(tmpdir(),'epiphany-https-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',temporary+'/key.pem','-out',temporary+'/cert.pem','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
const cert=await readFile(temporary+'/cert.pem');
const publicKey=createPublicKey(execFileSync('openssl',['x509','-in',temporary+'/cert.pem','-pubkey','-noout']));
const pin=createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('base64');
const server=https.createServer({key:await readFile(temporary+'/key.pem'),cert},async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
  const request=new Request(f.env.SITE_ORIGIN+req.url,{method:req.method,headers:{...req.headers,'CF-Connecting-IP':'198.51.100.5'},...(body.length?{body}:{})});
  const response=await f.worker.fetch(request,f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error);res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
f.env.SITE_ORIGIN='https://127.0.0.1:'+server.address().port;
// Trust only this temporary test certificate's public key; do not disable TLS
// validation for other certificates or destinations.
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--ignore-certificate-errors-spki-list='+pin]});
try{
 const context=await browser.newContext();
 const page=await context.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(f.env.SITE_ORIGIN+'/admin/');await page.waitForURL('**/admin/login/');
 await page.getByLabel('Логин',{exact:true}).fill('admin');await page.getByLabel('Пароль',{exact:true}).fill('wrong');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByText('Неверный логин или пароль.',{exact:true}).waitFor();
 await page.getByLabel('Пароль',{exact:true}).fill(TEST_PASSWORD);await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByRole('heading',{name:'Главная',exact:true}).waitFor();
 const cookies=await context.cookies();assert.ok(cookies.some(cookie=>cookie.name==='__Host-epiphany-admin'&&cookie.httpOnly&&cookie.secure));
 const emphasis=page.locator('#field-emphasis');const original=await emphasis.inputValue();
 await emphasis.fill(original+' Дополнение.');await page.locator('#save').click();await page.getByText('Сохранено. Обновление сайта начнётся автоматически и займёт некоторое время.',{exact:true}).waitFor();
 await emphasis.fill(original);assert.equal(await page.locator('#save').isEnabled(),true);await page.locator('#save').click();await page.getByText('Сохранено. Обновление сайта начнётся автоматически и займёт некоторое время.',{exact:true}).waitFor();assert.equal(JSON.parse(f.files.get('content/pages/home.json').content).emphasis,original);
 // Navigation is guarded while a draft is dirty.
 await emphasis.fill(original+' Черновик');page.once('dialog',dialog=>dialog.dismiss());await page.locator('#page-list').getByRole('button',{name:'Видео',exact:true}).click();assert.equal(await page.locator('#editor-title').innerText(),'Главная');await emphasis.fill(original);
 await page.locator('#new-project').click();await page.getByRole('heading',{name:'Новый проект',exact:true}).waitFor();
 for(const [id,value]of Object.entries({slug:'browser-project',title:'Проект из панели',subtitle:'Квартира',description:'История проекта',image_alt:'Обложка',seo_description:'Описание для поиска'}))await page.locator('#field-'+id).fill(value);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await page.getByLabel('Загрузить фотографию: Обложка',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:png});
 await page.waitForFunction(()=>document.querySelector('#field-image').value.startsWith('assets/uploads/'));
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#editor-title').textContent==='Проект из панели');
 assert.ok(f.files.has('content/projects/browser-project.json'));assert.ok(JSON.parse(f.files.get('content/projects/browser-project.json').content).image.startsWith('assets/uploads/'));
 page.once('dialog',dialog=>dialog.accept());await page.locator('#delete-project').click();await page.getByRole('heading',{name:'Проект удалён',exact:true}).waitFor();assert.equal(f.files.has('content/projects/browser-project.json'),false);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/password-admin-mobile.png',fullPage:true});
 await page.locator('#logout').click();await page.waitForURL('**/admin/login/');assert.equal((await page.evaluate(async()=>{const response=await fetch('/api/session');return response.status})),401);
 await page.screenshot({path:'/tmp/password-login.png',fullPage:true});assert.deepEqual(errors,[]);
 const helper=await browser.newPage();await helper.goto(f.env.SITE_ORIGIN+'/__credential-test');
 await helper.locator('#password').fill(TEST_PASSWORD);await helper.locator('#repeat').fill(TEST_PASSWORD);await helper.getByRole('button',{name:'Подготовить хеш',exact:true}).click();await helper.locator('#hash').waitFor();const hash=await helper.locator('#hash').inputValue();assert.equal(await verifyPassword(TEST_PASSWORD,hash),true);assert.equal(await helper.locator('#password').inputValue(),'');await helper.close();
 console.log('PASS: password-only login/error, secure cookie, page save/delete-text/save, unsaved draft protection, image upload, create/delete project, mobile layout, logout/revocation. No external requests.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true});}
