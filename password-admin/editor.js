import {plainText} from '../rich-text.mjs';
import {combineHeadings,combinedValue,addFormatting} from './formatting.mjs';
const $=selector=>document.querySelector(selector);
const make=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const copy=value=>JSON.parse(JSON.stringify(value));
let schema,csrf='',current=null,baseline='',busy=false,uploading=0,loadNumber=0,projectCursor=null,projectCount=0,projectTicket=0;
let retryLoad=null;
const previews=new Set();
const dirty=()=>current && JSON.stringify(current.data)!==baseline;
async function api(path,options={}){
  const response=await fetch('/api/'+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{}),...options.headers}});
  const data=await response.json();
  if(response.status===401){location.replace('/admin/login/');throw new Error('Войдите снова.');}
  if(!response.ok)throw new Error(data.error||'Не удалось выполнить действие.');return data;
}
function updateStatus(message){
  $('#save').disabled=!current||!dirty()||busy||uploading>0;
  $('#save').textContent=busy?'Сохраняем…':'Сохранить и опубликовать';
  $('#status').textContent=message||(uploading?'Загружаем фотографию…':dirty()?'Есть несохранённые изменения':'Все изменения сохранены');
}
function fail(error){$('#error').textContent=error.message||String(error);}
function loadError(error,retry){
  retryLoad=retry;$('#loading').hidden=true;$('#load-error').hidden=false;$('#load-error-text').textContent=error.message||String(error);
  $('#editor-title').textContent='Раздел недоступен';$('#editor').hidden=true;$('#delete-project').hidden=true;$('#save').disabled=true;
  document.querySelector('.app-layout main').setAttribute('aria-busy','false');
}
$('#retry-load').addEventListener('click',()=>{if(retryLoad)retryLoad();});
function defaults(fields){const data={};for(const f of fields){if(f.default!==undefined)data[f.name]=copy(f.default);else if(f.widget==='object')data[f.name]=defaults(f.fields);else if(f.widget==='list')data[f.name]=[];else if(f.widget==='boolean')data[f.name]=false;else if(f.widget==='number')data[f.name]=0;else data[f.name]='';}return data;}
function assetURL(value){try{const url=new URL(value,location.origin+'/');return url.protocol==='https:' || url.origin===location.origin?url.href:'';}catch{return '';}}
function renderFields(container,fields,data,path=''){
  for(const field of combineHeadings(fields)){
    const key=field.name,id='field-'+(path+key).replaceAll(/[^a-zA-Z0-9_-]/g,'-');
    const group=make('div','field');const optional=field.required===false?' · необязательно':'';
    if(field.widget==='object'){
      const details=make('details','object-group');details.open=!field.collapsed;details.append(make('summary','',field.label));
      const inner=make('div','object-fields');const object=data[key]&&typeof data[key]==='object'?data[key]:{};
      if(!data[key])data[key]=object;renderFields(inner,field.fields,object,path+key+'.');details.append(inner);container.append(details);continue;
    }
    if(field.widget==='list'){
      const section=make('section','list-field');section.append(make('h2','field-heading',field.label+optional));
      const list=make('div','list-items');const values=data[key]||[];
      const render=()=>{
        list.replaceChildren();values.forEach((item,index)=>{
          const row=make('div','list-item');const controls=make('div','item-controls');controls.append(make('span','',String(index+1).padStart(2,'0')));
          for(const [text,label,handler]of [ ['↑','Переместить выше',()=>{if(index){[values[index-1],values[index]]=[values[index],values[index-1]];render();updateStatus();}}],['↓','Переместить ниже',()=>{if(index+1<values.length){[values[index+1],values[index]]=[values[index],values[index+1]];render();updateStatus();}}],['Удалить','Удалить элемент',()=>{values.splice(index,1);render();updateStatus();}] ]){
            const button=make('button','quiet',text);button.type='button';button.setAttribute('aria-label',label);button.addEventListener('click',handler);controls.append(button);
          }
          row.append(controls);
          if(field.fields)renderFields(row,field.fields,item,path+key+'.'+index+'.');
          else{
            const holder={value:item};renderFields(row,[{...field.field,name:'value',label:field.field.label||field.label}],holder,path+key+'.'+index+'.');
            row.addEventListener('input',()=>{values[index]=holder.value;updateStatus();});
          }
          list.append(row);
        });
      };
      const add=make('button','secondary','+ Добавить');add.type='button';
      add.addEventListener('click',()=>{if(values.length>=150){fail(new Error('Достигнут предел: 150 элементов.'));return;}data[key]=values;values.push(field.fields?defaults(field.fields):'');render();updateStatus();});
      render();section.append(list,add);container.append(section);continue;
    }
    const label=make('label','',field.label+optional);label.htmlFor=id;group.append(label);
    if(field.hint)group.append(make('p','hint',field.hint));
    let input;
    if(field.widget==='boolean'){
      input=make('input','toggle');input.type='checkbox';input.checked=Boolean(data[key]);
      input.addEventListener('change',()=>{data[key]=input.checked;updateStatus();});
    }else{
      input=make(field.widget==='text'||field.rich?'textarea':'input');
      if(input.tagName==='TEXTAREA')input.rows=field.emphasisName?3:4;
      if(field.widget==='number'){input.type='number';input.min='0';input.step='1';}
      else if(input.tagName==='INPUT')input.type='text';
      input.value=combinedValue(field,data,current?.id==='home'&&!path&&key==='title');input.maxLength=20000;
      input.dir=field.widget==='image'||field.widget==='number'||field.name==='slug'?'ltr':'auto';
      if(field.name==='slug'&&current?.kind==='projects'&&!current.isNew)input.readOnly=true;
      input.addEventListener('input',()=>{data[key]=field.widget==='number'?Number(input.value):input.value;if(field.emphasisName)data[field.emphasisName]='';input.setCustomValidity('');updateStatus();});
      if(field.required!==false)input.required=true;
      if(field.pattern)input.addEventListener('change',()=>{input.setCustomValidity(input.value&&!new RegExp(field.pattern[0]).test(input.value)?field.pattern[1]:'');});
    }
    input.id=id;group.append(input);
    if(field.rich)addFormatting(group,input,field);
    if(field.widget==='image'){
      const preview=make('img','image-preview');preview.alt='Предпросмотр фотографии';preview.hidden=!assetURL(input.value);if(!preview.hidden)preview.src=assetURL(input.value);
      input.addEventListener('input',()=>{const url=assetURL(input.value);preview.hidden=!url;if(url)preview.src=url;});
      const upload=make('input','upload');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.setAttribute('aria-label','Загрузить фотографию: '+field.label);
      upload.addEventListener('change',async()=>{
        const file=upload.files[0];if(!file)return;
        if(file.size>5*1024*1024){fail(new Error('Выберите фотографию до 5 МБ.'));upload.value='';return;}
        uploading++;updateStatus();$('#error').textContent='';
        try{
          const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
          const result=await api('upload',{method:'POST',body:JSON.stringify({content:btoa(binary)})});
          input.value=result.path;data[key]=result.path;const objectURL=URL.createObjectURL(file);previews.add(objectURL);preview.src=objectURL;preview.hidden=false;
        }catch(error){fail(error);}finally{uploading--;upload.value='';updateStatus();}
      });
      group.append(preview,upload,make('p','hint','JPG, PNG или WebP, до 5 МБ. После загрузки сохраните запись.'));
    }
    container.append(group);
  }
}
function renderSections(container,fields,data,sections){
  if(!sections?.length){renderFields(container,fields,data);return;}
  const navigation=make('nav','section-nav');navigation.setAttribute('aria-label','Блоки страницы');
  const description=make('p','editor-help','Блоки расположены в порядке страницы. Заголовки редактируются целиком; форматирование видно в предпросмотре под текстом.');
  container.append(description,navigation);
  const used=new Set();
  sections.forEach((section,index)=>{
    const selected=section.fields.map(name=>fields.find(field=>field.name===name)).filter(Boolean);if(!selected.length)return;
    selected.forEach(field=>used.add(field.name));
    const card=make(section.collapsed?'details':'section','editor-section');card.id='editor-section-'+index;
    const title=make(section.collapsed?'summary':'h2','section-title',String(index+1).padStart(2,'0')+' / '+section.label);card.append(title);
    const inner=make('div','section-fields');if(section.hint)inner.append(make('p','section-hint',section.hint));renderFields(inner,selected,data);card.append(inner);container.append(card);
    const link=make('a','',section.label);link.href='#'+card.id;link.addEventListener('click',()=>{if(card.tagName==='DETAILS')card.open=true;});navigation.append(link);
  });
  const other=fields.filter(field=>!used.has(field.name));if(other.length)renderFields(container,other,data);
}

async function projects(append=false){
  const ticket=++projectTicket;$('#project-more').disabled=true;
  try{
    const result=await api('projects?limit=50'+(append&&projectCursor?'&cursor='+encodeURIComponent(projectCursor):''));
    if(ticket!==projectTicket)return;
    const list=$('#project-list');if(!append){list.replaceChildren();projectCount=0;}
    const unknown=[];
    for(const project of result.projects){
      const button=make('button','nav-item',plainText(project.title||project.id));button.type='button';button.dir='auto';button.dataset.kind='projects';button.dataset.id=project.id;button.addEventListener('click',()=>openDocument('projects',project.id));list.append(button);
      if(!project.title)unknown.push({project,button});
    }
    projectCount+=result.projects.length;projectCursor=result.nextCursor;
    $('#project-count').textContent=result.total?'Показано '+projectCount+' из '+result.total:'';$('#project-empty').hidden=result.total!==0;
    $('#project-more').hidden=!projectCursor;
    // Usually titles are supplied from the current snapshot. When a title was
    // edited outside the CMS, avoid issuing hundreds of simultaneous reads.
    const fill=async()=>{while(unknown.length&&ticket===projectTicket){const {project,button}=unknown.shift();try{const record=await api(`projects/${project.id}`);if(button.isConnected)button.textContent=plainText(record.data.title||project.id);}catch{if(button.isConnected)button.title='Название не загружено. Нажмите, чтобы повторить загрузку проекта.';}}};
    await Promise.all(Array.from({length:Math.min(4,unknown.length)},fill));
  }finally{if(ticket===projectTicket)$('#project-more').disabled=false;}
}
$('#project-more').addEventListener('click',()=>projects(true).catch(fail));
$('#export-content').addEventListener('click',async()=>{
  const button=$('#export-content');button.disabled=true;
  try{const data=await api('export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const link=make('a');link.href=url;link.download='epiphany-content.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){fail(error);}finally{button.disabled=false;}
});
async function openDocument(kind,id,isNew=false){
  if(busy||uploading)return;
  if(dirty()&&!confirm('Есть несохранённые изменения. Перейти без сохранения?'))return;
  const ticket=++loadNumber;$('#editor').inert=true;
  current=null;baseline='';$('#save').disabled=true;$('#editor').hidden=true;$('#delete-project').hidden=true;$('#editor-title').textContent='Загрузка…';
  $('#error').textContent='';$('#load-error').hidden=true;$('#loading').hidden=false;$('#loading-text').textContent='Загружаем запись…';document.querySelector('.app-layout main').setAttribute('aria-busy','true');
  try{
    const definition=kind==='pages'?schema.pages.find(page=>page.id===id):null;
    const fields=definition?.fields||schema.projectFields;
    const result=isNew?{data:defaults(fields),sha:null}:await api(`${kind}/${id}`);
    if(ticket!==loadNumber)return;
    for(const url of previews)URL.revokeObjectURL(url);previews.clear();
    current={kind,id,sha:result.sha,data:result.data,isNew};
    document.querySelectorAll('.nav-item').forEach(button=>{const active=button.dataset.kind===kind&&button.dataset.id===id;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    $('#editor-title').textContent=definition?.label||(isNew?'Новый проект':plainText(result.data.title||id));
    $('#editor').replaceChildren();renderSections($('#editor'),fields,current.data,definition?.sections||schema.projectSections);baseline=isNew?'':JSON.stringify(current.data);
    $('#editor').hidden=false;$('#delete-project').hidden=kind!=='projects'||isNew;updateStatus();
    $('#editor-title').scrollIntoView({block:'start'});
  }catch(error){if(ticket===loadNumber)loadError(error,()=>openDocument(kind,id,isNew));}finally{if(ticket===loadNumber){$('#loading').hidden=true;$('#editor').inert=false;document.querySelector('.app-layout main').setAttribute('aria-busy','false');}}
}
$('#editor').addEventListener('submit',event=>event.preventDefault());
$('#save').addEventListener('click',async()=>{
  if(!current||busy||uploading)return;
  const invalid=$('#editor').querySelector('input:invalid,textarea:invalid');
  if(invalid)for(let parent=invalid.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  if(!$('#editor').reportValidity())return;
  const target=current;const saved=copy(target.data);
  const id=target.kind==='projects'?saved.slug:target.id;
  if(target.kind==='projects'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id||'')){fail(new Error('Укажите адрес проекта латиницей, цифрами и дефисами.'));return;}
  busy=true;$('#error').textContent='';updateStatus();
  try{
    const result=await api(`${target.kind}/${id}`,{method:'PUT',body:JSON.stringify({data:saved,sha:target.sha})});
    target.sha=result.sha;target.id=id;target.isNew=false;baseline=JSON.stringify(saved);
    // Keep edits typed while a save was in progress. Only the sent snapshot
    // becomes the baseline; every subsequent deletion is compared to it.
    $('#delete-project').hidden=target.kind!=='projects';
    if(target.kind==='projects'){
      $('#editor-title').textContent=plainText(target.data.title);
      $('#field-slug').readOnly=true;
      try{await projects();}catch(error){fail(error);}
    }
    updateStatus(dirty()?'Сохранено. Есть новые несохранённые изменения.':result.published?'Сохранено и опубликовано. Изменения уже доступны на сайте.':'Сохранено в репозитории. Быстрая публикация недоступна; сайт обновится после сборки.');
  }catch(error){fail(error);}finally{busy=false;$('#save').disabled=!dirty()||uploading>0;$('#save').textContent='Сохранить и опубликовать';}
});
$('#new-project').addEventListener('click',()=>openDocument('projects','',true));
$('#delete-project').addEventListener('click',async()=>{
  if(!current||current.kind!=='projects'||busy||!confirm('Удалить проект и его страницу с сайта?'))return;
  busy=true;
  try{const result=await api(`projects/${current.id}`,{method:'DELETE',body:JSON.stringify({sha:current.sha})});current=null;baseline='';$('#editor').hidden=true;$('#delete-project').hidden=true;$('#editor-title').textContent='Проект удалён';updateStatus(result.published?'Проект удалён с сайта.':'Удаление сохранено. Сайт обновится после сборки.');await projects();}catch(error){fail(error);}finally{busy=false;}
});
$('#logout').addEventListener('click',async()=>{
  if(dirty()&&!confirm('Выйти без сохранения изменений?'))return;
  try{await api('logout',{method:'POST',body:'{}'});current=null;location.replace('/admin/login/');}catch(error){fail(error);}
});
addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
async function initialize(){try{
  $('#load-error').hidden=true;$('#loading').hidden=false;$('#loading-text').textContent='Загружаем панель…';$('#page-list').replaceChildren();
  const user=await api('session');csrf=user.csrf;schema=await api('schema');
  for(const page of schema.pages){const button=make('button','nav-item',page.label);button.type='button';button.dataset.kind='pages';button.dataset.id=page.id;button.addEventListener('click',()=>openDocument('pages',page.id));$('#page-list').append(button);}
  await projects();await openDocument('pages','home');
}catch(error){loadError(error,initialize);}}
initialize();
