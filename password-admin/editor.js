const $=selector=>document.querySelector(selector);
const make=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const copy=value=>JSON.parse(JSON.stringify(value));
let schema,csrf='',current=null,baseline='',busy=false,uploading=0,loadNumber=0;
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
function defaults(fields){const data={};for(const f of fields){if(f.default!==undefined)data[f.name]=copy(f.default);else if(f.widget==='object')data[f.name]=defaults(f.fields);else if(f.widget==='list')data[f.name]=[];else if(f.widget==='boolean')data[f.name]=false;else if(f.widget==='number')data[f.name]=0;else data[f.name]='';}return data;}
function assetURL(value){try{const url=new URL(value,location.origin+'/');return url.protocol==='https:' || url.origin===location.origin?url.href:'';}catch{return '';}}
function renderFields(container,fields,data,path=''){
  for(const field of fields){
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
      input=make(field.widget==='text'?'textarea':'input');
      if(field.widget==='text')input.rows=4;
      if(field.widget==='number'){input.type='number';input.min='0';input.step='1';}
      else if(input.tagName==='INPUT')input.type='text';
      input.value=data[key]??'';input.maxLength=20000;
      if(field.name==='slug'&&current?.kind==='projects'&&!current.isNew)input.readOnly=true;
      input.addEventListener('input',()=>{data[key]=field.widget==='number'?Number(input.value):input.value;input.setCustomValidity('');updateStatus();});
      if(field.required!==false)input.required=true;
      if(field.pattern)input.addEventListener('change',()=>{input.setCustomValidity(input.value&&!new RegExp(field.pattern[0]).test(input.value)?field.pattern[1]:'');});
    }
    input.id=id;group.append(input);
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
async function projects(){
  const result=await api('projects');const list=$('#project-list');list.replaceChildren();
  for(const project of result.projects){const button=make('button','nav-item',project.id);button.type='button';button.addEventListener('click',()=>openDocument('projects',project.id));list.append(button);api(`projects/${project.id}`).then(record=>{if(button.isConnected)button.textContent=record.data.title||project.id;}).catch(()=>{});}
}
async function openDocument(kind,id,isNew=false){
  if(busy||uploading)return;
  if(dirty()&&!confirm('Есть несохранённые изменения. Перейти без сохранения?'))return;
  const ticket=++loadNumber;$('#editor').inert=true;
  $('#error').textContent='';$('#loading').hidden=false;$('#loading').textContent='Загружаем запись…';
  try{
    const definition=kind==='pages'?schema.pages.find(page=>page.id===id):null;
    const fields=definition?.fields||schema.projectFields;
    const result=isNew?{data:defaults(fields),sha:null}:await api(`${kind}/${id}`);
    if(ticket!==loadNumber)return;
    for(const url of previews)URL.revokeObjectURL(url);previews.clear();
    current={kind,id,sha:result.sha,data:result.data,isNew};
    $('#editor-title').textContent=definition?.label||(isNew?'Новый проект':result.data.title||id);
    $('#editor').replaceChildren();renderFields($('#editor'),fields,current.data);baseline=isNew?'':JSON.stringify(current.data);
    $('#editor').hidden=false;$('#delete-project').hidden=kind!=='projects'||isNew;updateStatus();
    $('#editor-title').scrollIntoView({block:'start'});
  }catch(error){if(ticket===loadNumber)fail(error);}finally{if(ticket===loadNumber){$('#loading').hidden=true;$('#editor').inert=false;}}
}
$('#editor').addEventListener('submit',event=>event.preventDefault());
$('#save').addEventListener('click',async()=>{
  if(!current||busy||uploading||!$('#editor').reportValidity())return;
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
      $('#editor-title').textContent=target.data.title;
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
try{
  const user=await api('session');csrf=user.csrf;schema=await api('schema');
  for(const page of schema.pages){const button=make('button','nav-item',page.label);button.type='button';button.addEventListener('click',()=>openDocument('pages',page.id));$('#page-list').append(button);}
  await projects();await openDocument('pages','home');
}catch(error){$('#loading').hidden=true;fail(error);}
