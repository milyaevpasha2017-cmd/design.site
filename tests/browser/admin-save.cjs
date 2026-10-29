// Requires Playwright and a Chromium installation. Never writes to GitHub.
// Run: node tests/browser/admin-save.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '../..');
const backend = {};
for (const folder of ['content/pages', 'content/projects']) {
  for (const filename of fs.readdirSync(path.join(root, folder))) {
    const file = `${folder}/${filename}`;
    const parts = file.split('/'); let target = backend;
    for (const part of parts.slice(0,-1)) target = target[part] ??= {};
    target[parts.at(-1)] = { path: file, content: fs.readFileSync(path.join(root,file),'utf8') };
  }
}
backend.content['settings.json'] = {path:'content/settings.json', content:fs.readFileSync(path.join(root,'content/settings.json'),'utf8')};
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.yml':'text/yaml','.css':'text/css','.wasm':'application/wasm','.png':'image/png'};
const server = http.createServer((req,res) => {
  let file = decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  if (file.endsWith('/')) file += 'index.html';
  const absolute = path.resolve(root,file);
  if (!absolute.startsWith(root+path.sep) || !fs.existsSync(absolute)) {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(absolute).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({executablePath,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror',error => errors.push(error.message));
    await page.addInitScript(data => {
      window.repoFiles = data;
      // Test backend folder listings expect this alias; individual file reads
      // and writes use the nested tree. All of this is in browser memory only.
      window.repoFiles['content/projects'] = window.repoFiles.content.projects;
    },backend);
    await page.route('**/admin/setup.js*',route => route.fulfill({contentType:'text/javascript',body:`
      (async()=>{
        const {enableSaveRefresh}=await import('./save-refresh.mjs');
        if (${!process.env.ADMIN_BASELINE_NO_FIX}) enableSaveRefresh(CMS,'test-repo');
        document.querySelector('#setup').hidden=true;
        CMS.init({config:{backend:{name:'test-repo'}}});
      })();
    `}));
    await page.goto(address+'/admin/');
    // The shipping GitHub registration is also enabled by the same helper.
    assert.equal(await page.evaluate(async()=>{
      const {enableSaveRefresh}=await import('./save-refresh.mjs');
      enableSaveRefresh(CMS);
      return CMS.getBackend('github').BackendClass.prototype.reloadEntriesAfterPersist;
    }),true);
    await page.getByRole('button',{name:'Войти',exact:true}).click();
    await page.getByText('Главная',{exact:true}).click();
    const snapshot = async () => JSON.parse(await page.evaluate(()=>window.repoFiles.content.pages['home.json'].content));
    const save = async (key,expected) => {
      await page.getByRole('button',{name:'Опубликовать',exact:true}).click();
      await page.getByText('Опубликовать сейчас',{exact:true}).click();
      await page.waitForFunction(({key,expected})=>JSON.parse(window.repoFiles.content.pages['home.json'].content)[key]===expected,{key,expected});
      await page.getByRole('button',{name:'Опубликовано',exact:true}).waitFor();
    };
    async function editCycle(label,key) {
      const field = page.getByLabel(label,{exact:true}).first();
      const original = await field.inputValue();
      assert.ok(original.length>0);
      // Insert using ordinary keyboard events; avoid synthetic input changes.
      await field.focus(); await field.press('ControlOrMeta+End');
      await field.pressSequentially(' Дополнение.');
      assert.equal(await field.inputValue(),original+' Дополнение.');
      await save(key,original+' Дополнение.');
      // Mimic visiting the site in another tab, then returning to the editor.
      const other = await browser.newPage(); await other.goto('about:blank');
      await other.bringToFront(); await page.bringToFront(); await other.close();
      await field.focus();
      await field.evaluate((el,length)=>el.setSelectionRange(length,el.value.length),original.length);
      await field.press('Backspace');
      assert.equal(await field.inputValue(),original);
      // This assertion fails on the original CMS: reverting a published edit
      // incorrectly leaves the button as "Published".
      await page.getByRole('button',{name:'Опубликовать',exact:true}).waitFor();
      await save(key,original);
      assert.equal((await snapshot())[key],original);
      // Also verify deleting just one punctuation character and saving again.
      await field.focus();await field.press('ControlOrMeta+End');await field.press('Backspace');
      const shorter=original.slice(0,-1);assert.equal(await field.inputValue(),shorter);
      await save(key,shorter);assert.equal((await snapshot())[key],shorter);
      await field.focus();await field.press('ControlOrMeta+End');await field.pressSequentially(original.slice(-1));
      await save(key,original);
      console.log(`PASS: ${key}: save → switch tabs → remove added words → save → remove one character → save → restore, without reloading`);
    }
    await editCycle('Акцент курсивом','emphasis'); // string widget
    await editCycle('Вступительный текст','intro'); // text widget
    assert.deepEqual(errors,[]);
    console.log('PASS: no JavaScript errors; all saves were to the isolated test backend.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
