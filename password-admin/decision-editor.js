import {plainText} from '../rich-text.mjs';

const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const button=(text,handler)=>{const el=make('button','secondary',text);el.type='button';el.addEventListener('click',handler);return el;};
const topics=['layout','light','materials'];

// Keep the existing content shape so already published text is never migrated,
// shortened or rewritten simply by opening the new editor.
export function renderDecisionEditor(container,field,data,{renderFields,api,updateStatus}){
  const root=make('div','decision-editor'),settings=make('div','decision-settings');
  const preview=make('dialog','decision-preview');preview.open=true;preview.setAttribute('aria-label','Предпросмотр всей секции');
  root.append(settings,preview);container.append(root);
  let disposed=false,timer,readyTimer,readyAttempts=0,revision=0,loaded=false,selectedTopic='layout',width=1280,frameDocument,latestResult;
  const fields=field.fields;
  const pick=(names,source=fields)=>names.map(name=>source.find(f=>f.name===name)).filter(Boolean);
  const fill=(parent,names,object=data,path='decisions.',source=fields)=>{
    renderFields(parent,pick(names,source),object,path);
    // Formatting controls stay, but the only preview is the whole construction.
    parent.querySelectorAll('.format-preview-panel').forEach(el=>el.remove());
    parent.querySelectorAll('label').forEach(el=>{if(el.htmlFor)el.textContent=el.textContent.replace(' · необязательно','');});
  };
  const extra=(parent,label,names,object=data,path='decisions.',source=fields)=>{
    const details=make('details','decision-extra');details.append(make('summary','',label));
    const body=make('div','decision-extra-fields');fill(body,names,object,path,source);details.append(body);parent.append(details);
  };
  settings.append(make('p','section-hint','Выберите крупную часть секции. Справа — весь блок с вашими несохранёнными правками. Точки на фото и заголовки пунктов переключаются.'));
  const nav=make('div','decision-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Части секции');settings.append(nav);
  const panels=[],tabButtons=[];
  const activate=index=>{panels.forEach((panel,i)=>{panel.hidden=i!==index;tabButtons[i].setAttribute('aria-selected',String(i===index));tabButtons[i].tabIndex=i===index?0:-1;});};
  const panel=(label,index)=>{
    const el=make('section','decision-settings-panel');el.id='decision-editor-panel-'+index;el.setAttribute('role','tabpanel');
    const tab=button(label,()=>activate(index));tab.id='decision-editor-tab-'+index;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',el.id);el.setAttribute('aria-labelledby',tab.id);
    nav.append(tab);tabButtons.push(tab);panels.push(el);settings.append(el);return el;
  };
  nav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const index=tabButtons.indexOf(document.activeElement);if(index<0)return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;activate(next);tabButtons[next].focus();
  });
  const intro=panel('Вступление',0);intro.append(make('h3','','Заголовок и вступление'));
  fill(intro,['title','emphasis','intro']);extra(intro,'Маленькая подпись над заголовком',['label']);
  const image=panel('Изображение',1);image.append(make('h3','','Фотография всей секции'));
  fill(image,['image']);extra(image,'Описание и подпись фотографии',['image_alt','image_note']);
  const points=panel('Три пункта',2);points.append(make('h3','','Точки на фото и раскрывающиеся описания'));
  const topicNav=make('div','decision-topics');topicNav.setAttribute('role','group');topicNav.setAttribute('aria-label','Пункт секции');points.append(topicNav);
  const topicPanels=new Map(),topicButtons=new Map();
  const selectTopic=(key,fromPreview=false)=>{
    selectedTopic=key;topicPanels.forEach((el,name)=>{el.hidden=name!==key;topicButtons.get(name).setAttribute('aria-pressed',String(name===key));});
    if(fromPreview)activate(2);syncFrame();
  };
  topics.forEach((key,index)=>{
    const definition=fields.find(f=>f.name===key),object=data[key]||{};if(!data[key])data[key]=object;
    const name=()=>String(index+1).padStart(2,'0')+' / '+(plainText(object.label||'')||definition.label);
    const tab=button(name(),()=>selectTopic(key));topicNav.append(tab);topicButtons.set(key,tab);
    const body=make('div','decision-topic-panel');body.dataset.topic=key;points.append(body);topicPanels.set(key,body);
    body.append(make('p','hint','Этот текст открывается при нажатии на точку '+String(index+1).padStart(2,'0')+' на фотографии.'));
    fill(body,['title','description','deliverable'],object,'decisions.'+key+'.',definition.fields);
    extra(body,'Название точки, подпись результата и кнопка',['label','deliverable_label','button'],object,'decisions.'+key+'.',definition.fields);
    body.addEventListener('input',()=>{tab.textContent=name();});
  });
  const ending=panel('Завершение',3);ending.append(make('h3','','Нижняя часть секции'));
  fill(ending,['bottom','services_link']);extra(ending,'Подпись над раскрывающимися пунктами',['notes_label']);
  activate(0);selectTopic('layout');

  const heading=make('div','decision-preview-heading');heading.append(make('h3','','Весь блок на сайте'));
  const controls=make('div','decision-preview-controls'),devices=make('div','decision-devices');devices.setAttribute('role','group');devices.setAttribute('aria-label','Размер предпросмотра');
  const desktop=button('Компьютер',()=>setWidth(1280)),mobile=button('Телефон',()=>setWidth(390));
  const setWidth=value=>{width=value;desktop.setAttribute('aria-pressed',String(width===1280));mobile.setAttribute('aria-pressed',String(width===390));if(loaded)status.textContent='Черновик · '+width+' px · изменения ещё не опубликованы';fit();};
  devices.append(desktop,mobile);controls.append(devices);preview.append(heading,controls);
  const status=make('p','hint decision-preview-status','Готовим предпросмотр…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');preview.append(status);
  const retry=button('Повторить предпросмотр',()=>refresh());retry.hidden=true;preview.append(retry);
  const viewport=make('div','decision-preview-viewport'),stage=make('div','decision-preview-stage'),frame=make('iframe','decision-preview-frame');
  frame.title='Реальный вид секции на сайте';frame.setAttribute('sandbox','allow-same-origin');
  stage.append(frame);viewport.append(stage);preview.append(viewport);
  controls.append(button('Развернуть',()=>{preview.close();preview.showModal();fit();}));
  const close=button('Закрыть',()=>preview.close());close.classList.add('decision-preview-close');controls.append(close);
  preview.addEventListener('close',()=>{if(!disposed&&!preview.open){preview.show();fit();}});
  function fit(){
    if(disposed||!frameDocument)return;
    const scale=Math.min(1,(viewport.clientWidth||600)/width),section=frameDocument.querySelector('.decision-section');
    frame.style.width=width+'px';
    const height=Math.ceil(section?.getBoundingClientRect().height||900);
    frame.style.height=height+'px';frame.style.transform='scale('+scale+')';
    stage.style.width=width*scale+'px';stage.style.height=height*scale+'px';
  }
  function syncFrame(){
    if(!frameDocument)return;
    const notes=[...frameDocument.querySelectorAll('.decision-note')];
    notes.forEach(note=>{note.open=note.id==='decision-'+selectedTopic;});
    frameDocument.querySelectorAll('.decision-pin').forEach(pin=>pin.setAttribute('aria-expanded',String(pin.dataset.decision===selectedTopic)));
    fit();
  }
  const observe=typeof ResizeObserver==='function'?new ResizeObserver(fit):null;
  observe?.observe(viewport);
  let contentObserver;
  function connectFrame(){
    if(disposed)return;
    const doc=frame.contentDocument;
    if(!doc?.querySelector('main[data-decision-preview]')){
      if(++readyAttempts<100)readyTimer=setTimeout(connectFrame,30);
      else{status.textContent='Не удалось открыть предпросмотр. Повторите попытку.';retry.hidden=false;}
      return;
    }
    if(frameDocument===doc)return;
    clearTimeout(readyTimer);frameDocument=doc;
    loaded=true;
    frameDocument.addEventListener('click',event=>{
      const target=event.target.closest('a,.decision-pin,.decision-note>summary');if(!target)return;
      event.preventDefault();
      if(target.matches('a'))return;
      const key=target.dataset.decision||target.parentElement.id.replace('decision-','');
      if(topics.includes(key))selectTopic(key,true);
    });
    contentObserver?.disconnect();contentObserver=typeof ResizeObserver==='function'?new ResizeObserver(fit):null;
    contentObserver?.observe(frameDocument.querySelector('main'));
    frameDocument.fonts?.ready.then(()=>{if(!disposed)fit();});if(latestResult)applyResult(latestResult);
  }
  frame.addEventListener('load',connectFrame);
  function applyResult(result){
    frameDocument.querySelector('main').innerHTML=result.html;
    frameDocument.body.dataset.fontBody=result.bodyFont;frameDocument.body.dataset.fontDisplay=result.displayFont;
    frameDocument.querySelector('.decision-pins').hidden=false;syncFrame();
  }
  function show(result){
    latestResult=result;
    readyAttempts=0;
    if(loaded&&frameDocument){
      applyResult(result);return;
    }
    // No scripts can execute in this frame. Content comes exclusively from the
    // same sanitized renderer that builds the public site, with its real CSS.
    if(!frame.hasAttribute('srcdoc'))frame.srcdoc='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/admin/decision-preview.css"></head><body data-page="home"><main data-decision-preview>'+result.html+'</main></body></html>';
    readyTimer=setTimeout(connectFrame,0);
  }
  async function refresh(ticket=++revision){
    if(disposed)return;
    status.textContent='Обновляем предпросмотр…';retry.hidden=true;frame.setAttribute('aria-busy','true');
    try{
      const result=await api('preview/decisions',{method:'POST',body:JSON.stringify({data})});
      if(disposed||ticket!==revision)return;
      show(result);status.textContent='Черновик · '+(width===390?'390':'1280')+' px · изменения ещё не опубликованы';
    }catch(error){if(!disposed&&ticket===revision){status.textContent='Предпросмотр не обновлён: '+error.message;retry.hidden=false;}}
    finally{if(!disposed&&ticket===revision)frame.setAttribute('aria-busy','false');}
  }
  root.addEventListener('input',()=>{updateStatus();clearTimeout(timer);const ticket=++revision;timer=setTimeout(()=>refresh(ticket),350);});
  setWidth(1280);refresh();
  return ()=>{disposed=true;clearTimeout(timer);clearTimeout(readyTimer);observe?.disconnect();contentObserver?.disconnect();if(preview.open)preview.close();};
}

