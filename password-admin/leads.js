const $=selector=>document.querySelector(selector);
const make=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
let csrf='',cursor=null,loading=false;
const labels={new:'Новая',contacted:'В работе',closed:'Завершена'};
async function api(path='',options={}){
  const response=await fetch('/api/'+path,{...options,headers:{...(options.method?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{}),...options.headers}});
  if(response.status===401){location.replace('/admin/login/');throw new Error('Войдите снова.');}
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось загрузить заявки.');return data;
}
function card(record){
  const article=make('article','lead-card');article.id=record.id;
  const head=make('div','lead-heading');head.append(make('h2','',record.name),make('time','hint',new Date(record.createdAt).toLocaleString('ru-RU')));
  const contact=make('p','lead-contact',record.contact);
  const message=make('p','lead-message',record.message||'Описание проекта не указано');message.dir='auto';contact.dir='auto';
  const reference=make('p','hint','№ '+record.id);
  const controls=make('div','lead-controls'),label=make('label','','Статус'),select=make('select');select.setAttribute('aria-label','Статус заявки от '+record.name);
  for(const [value,text]of Object.entries(labels)){const option=make('option','',text);option.value=value;select.append(option);}select.value=record.status;
  select.addEventListener('change',async()=>{const previous=record.status;select.disabled=true;$('#leads-error').textContent='';try{const saved=await api('leads/'+record.id,{method:'PUT',body:JSON.stringify({status:select.value})});record.status=saved.status;$('#leads-status').textContent='Статус сохранён';}catch(e){select.value=previous;$('#leads-error').textContent=e.message;}finally{select.disabled=false;}});
  label.append(select);controls.append(label);
  if(record.notification.state!=='sent'){
    const retry=make('button','secondary','Повторить уведомление');retry.type='button';
    retry.addEventListener('click',async()=>{retry.disabled=true;try{await api('leads/'+record.id,{method:'PUT',body:JSON.stringify({retryNotification:true})});await load();}catch(e){$('#leads-error').textContent=e.message;retry.disabled=false;}});controls.append(retry);
  }

  const remove=make('button','danger','Удалить');remove.type='button';remove.addEventListener('click',async()=>{
    if(!confirm('Удалить эту заявку из панели? Действие нельзя отменить. Резервные копии могут содержать прежнюю запись.'))return;
    remove.disabled=true;try{await api('leads/'+record.id,{method:'DELETE',body:'{}'});article.remove();$('#leads-status').textContent='Заявка удалена';}catch(e){$('#leads-error').textContent=e.message;remove.disabled=false;}
  });controls.append(remove);
  const notices={sent:record.notification.channel==='email'?'Заявка отправлена по резервной почте':'Уведомление в Telegram отправлено',pending:'Уведомление ожидает отправки',failed:'Не удалось доставить уведомление. Заявка сохранена здесь.'};
  const deliveryErrors={telegram_timeout:'Telegram не ответил вовремя. Заявка сохранена.',telegram_network:'Сервер не смог подключиться к Telegram.',telegram_unauthorized:'Telegram отклонил токен бота. Нужна проверка настройки.',telegram_forbidden:'Боту запрещено писать получателю. Проверьте, что дизайнер запустил бота и не заблокировал его.',telegram_chat_not_found:'Чат получателя не найден. Проверьте настройку Telegram.',telegram_message_too_long:'Telegram отклонил слишком длинное сообщение.',telegram_bad_request:'Telegram отклонил запрос. Нужна проверка настройки.',telegram_rate_limited:'Telegram ограничил частоту отправки. Повтор запланирован.',telegram_unavailable:'Telegram временно недоступен.'};
  const deliveryNote=deliveryErrors[record.notification.lastError]||'';
  const consent=make('details','lead-consent');
  consent.append(make('summary','hint',record.consent?.accepted?'Согласие: '+new Date(record.consent.acceptedAt).toLocaleString('ru-RU')+' · версия '+record.consent.version:'Заявка поступила до введения отдельной фиксации согласия'));
  if(record.consent?.text)consent.append(make('p','lead-message',record.consent.text));
  article.append(head,contact,message,reference,make('p','hint',notices[record.notification.state]+(deliveryNote?' '+deliveryNote:'')),consent,controls);return article;
}
async function load(append=false){
  if(loading)return;loading=true;$('#refresh').disabled=true;$('#more').disabled=true;$('#leads-error').textContent='';
  try{
    const result=await api('leads?limit=30'+(append&&cursor?'&cursor='+encodeURIComponent(cursor):''));
    if(!append)$('#leads-list').replaceChildren();for(const record of result.leads)$('#leads-list').append(card(record));
    cursor=result.nextCursor;$('#more').hidden=!cursor;$('#leads-status').textContent=$('#leads-list').children.length?'Показано заявок: '+$('#leads-list').children.length:'Пока нет заявок';
    $('#notification-status').textContent=(result.telegramConfigured?'Telegram подключён. ':'Telegram не подключён. ')+(result.emailConfigured?'Резервная почта подключена.':'Резервная почта не подключена. Заявки сохраняются в панели.');
    const target=document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView({block:'center'});
  }catch(e){$('#leads-error').textContent=e.message;$('#leads-status').textContent='';}finally{loading=false;$('#refresh').disabled=false;$('#more').disabled=false;}
}
$('#refresh').addEventListener('click',()=>load());$('#more').addEventListener('click',()=>load(true));
$('#logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:'{}'});location.replace('/admin/login/');}catch(e){$('#leads-error').textContent=e.message;}});
try{csrf=(await api('session')).csrf;await load();}catch(e){$('#leads-error').textContent=e.message;}
