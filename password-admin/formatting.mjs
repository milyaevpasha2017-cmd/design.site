import {richText,plainText,safeTextLink} from '../rich-text.mjs';
const make=(tag,cls,text)=>{const element=document.createElement(tag);element.className=cls;if(text!==undefined)element.textContent=text;return element;};
export function combineHeadings(fields){
  return fields.filter(field=>!(field.name==='emphasis'||field.name.endsWith('_emphasis'))).map(field=>{
    const emphasis=field.name==='title'?'emphasis':field.name.endsWith('_title')?field.name.slice(0,-6)+'_emphasis':null;
    return emphasis&&fields.some(other=>other.name===emphasis)?{...field,widget:'text',rich:true,richLinks:false,emphasisName:emphasis,label:'Заголовок целиком',hint:'Весь заголовок в одном поле. Выделите нужные слова и нажмите «Курсив», чтобы сделать акцент.'}:field;
  });
}
export function combinedValue(field,data,space=false){
  const title=data[field.name]??'',accent=data[field.emphasisName];
  return field.emphasisName&&accent?title+(space?' ':'\n')+'*'+accent+'*':title;
}
export function addFormatting(group,input,field){
  const toolbar=make('div','format-toolbar');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Форматирование: '+field.label);
  const preview=make('div','format-preview'+(field.emphasisName?' heading-preview':''));
  preview.setAttribute('aria-label','Предпросмотр: '+field.label);preview.dir='auto';
  const update=()=>{preview.innerHTML=richText(input.value,{links:field.richLinks!==false});};
  const apply=(action)=>{
    const start=input.selectionStart,end=input.selectionEnd,selection=input.value.slice(start,end);
    let replacement,selectStart=0,selectEnd;
    if(action==='bullet'){
      const lineStart=input.value.lastIndexOf('\n',start-1)+1,lineEnd=input.value.indexOf('\n',end);
      const stop=lineEnd<0?input.value.length:lineEnd,text=input.value.slice(lineStart,stop),lines=text.split('\n');
      const remove=lines.every(line=>line.startsWith('• '));
      replacement=lines.map(line=>remove?line.slice(2):line.startsWith('• ')?line:'• '+line).join('\n');
      input.setRangeText(replacement,lineStart,stop,'select');
    }else{
      if(action==='link'){
        const url=prompt('Адрес ссылки (https://…, mailto:… или /страница/)','https://');
        if(url===null)return;if(!safeTextLink(url.trim())){alert('Укажите корректную HTTPS-ссылку, email с mailto: или путь /страница/.');return;}
        replacement='['+(selection||'Текст ссылки')+']('+url.trim()+')';selectStart=1;selectEnd=1+(selection||'Текст ссылки').length;
      }else if(action==='clear')replacement=plainText(selection||input.value);
      else{
        const marker={bold:'**',italic:'*',underline:'__'}[action];
        if(selection.startsWith(marker)&&selection.endsWith(marker)&&selection.length>marker.length*2)replacement=selection.slice(marker.length,-marker.length);
        else{replacement=marker+(selection||'Текст')+marker;selectStart=marker.length;selectEnd=marker.length+(selection||'Текст').length;}
      }
      if(action==='clear'&&!selection)input.setRangeText(replacement,0,input.value.length,'select');
      else{input.setRangeText(replacement,start,end,'select');input.setSelectionRange(start+selectStart,start+(selectEnd??replacement.length));}
    }
    input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  const actions=[['bold','Ж','Жирный'],['italic','К','Курсив'],['underline','Ч','Подчёркнутый'],['bullet','•','Маркированный список']];
  if(field.richLinks!==false)actions.push(['link','↗','Вставить ссылку']);
  actions.push(['clear','Сброс','Убрать форматирование']);
  for(const [action,text,label] of actions){
    const button=make('button','format-button format-'+action,text);button.type='button';button.title=label;button.setAttribute('aria-label',label);
    button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>apply(action));toolbar.append(button);
  }
  input.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['b','i','u'].includes(event.key.toLowerCase())){event.preventDefault();apply({b:'bold',i:'italic',u:'underline'}[event.key.toLowerCase()]);}});
  input.addEventListener('input',update);group.insertBefore(toolbar,input);
  const caption=make('p','preview-label','Предпросмотр');group.append(caption,preview);update();
}
