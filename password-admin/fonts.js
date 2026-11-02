import {fonts,typography} from '../site-worker/src/typography.mjs';
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text)el.textContent=text;return el;};
const stack=font=>`"${font.family}",${font.fallback}`;
export function renderTypography(container,settings,onChange){
 const current=typography({typography:settings}),controls={};
 const intro=node('p','hint','Шрифты с кириллицей хранятся на сервере сайта. Предпросмотр меняется сразу; посетители увидят выбор после сохранения.');
 container.append(intro);
 const columns=node('div','font-controls');
 for(const [role,label] of [['body','Основной шрифт — текст, меню и кнопки'],['display','Акцентный шрифт — заголовки и курсив']]){
  const field=node('div','field'),caption=node('label','',label),select=node('select','font-select');
  select.id='font-'+role;caption.htmlFor=select.id;
  for(const font of fonts){const option=node('option','',font.name);option.value=font.id;select.append(option);}
  select.value=current[role].id;controls[role]=select;
  select.addEventListener('change',()=>{current[role]=fonts.find(font=>font.id===select.value);update();save();});
  field.append(caption,select);columns.append(field);
 }
 const preview=node('section','font-pair-preview');preview.setAttribute('aria-label','Предпросмотр сочетания шрифтов');
 const eyebrow=node('p','font-eyebrow','EPIPHANY / ВАШ БУДУЩИЙ ИНТЕРЬЕР');
 const heading=node('h3','font-heading','Пространство, в котором '),em=node('em','','вы дома.');heading.append(em);
 const text=node('p','font-body','Свет, материалы и ваши привычки. Создадим интерьер, в котором удобно жить каждый день.');
 const button=node('span','font-button','Обсудить проект');
 const status=node('p','hint font-selection');status.setAttribute('aria-live','polite');
 preview.append(eyebrow,heading,text,button,status);
 const update=()=>{
  for(const el of [eyebrow,heading,text,button])el.style.fontFamily=stack(current.body);
  em.style.fontFamily=stack(current.display);
  status.textContent=`Основной: ${current.body.name} · Акцентный: ${current.display.name}`;
 };
 const save=()=>onChange({body:current.body.id,display:current.display.id});
 const reset=node('button','secondary','Вернуть исходное сочетание');reset.type='button';
 reset.addEventListener('click',()=>{Object.assign(current,typography({}));for(const role of ['body','display'])controls[role].value=current[role].id;update();save();});
 const library=node('details','font-library'),summary=node('summary','','Посмотреть все шрифты');library.append(summary);
 const cards=node('div','font-catalog');
 for(const font of fonts){
  const card=node('article','font-card'),name=node('h4','',font.name),sample=node('p','font-sample','Ваш дом. Ваша история.');sample.style.fontFamily=stack(font);
  card.append(name,sample,node('p','hint',font.description));cards.append(card);
 }
 library.append(cards);container.append(columns,preview,reset,library);update();
}
