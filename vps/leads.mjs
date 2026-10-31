import {telegramFetch} from './telegram.mjs';
import {mailConfigured,sendMail} from './mail.mjs';
import {digest} from '../site-worker/src/security.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const statuses=['new','contacted','closed'];
const publicRecord=({fingerprint,...record})=>record;
export class LeadInbox{
  constructor(storage,config,fetcher=telegramFetch,mailer=sendMail){this.mailer=mailer;this.storage=storage;this.config=config;this.fetcher=fetcher;this.running=false;}
  async submit(data,ip){
    if(!data||typeof data!=='object'||Array.isArray(data))throw error('Некорректная заявка.');
    if(!uuid.test(data.id||''))throw error('Обновите страницу и повторите отправку.');
    if(data.website)throw error('Не удалось отправить форму. Напишите напрямую.');
    const clean=(value,max,required=false)=>{
      if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw error('Проверьте поля формы.');
      const text=value.trim();if(required&&!text)throw error('Укажите имя и способ связи.');return text;
    };
    const name=clean(data.name,100,true),contact=clean(data.contact,150,true),message=clean(data.message??'',3000);
    if(contact.length<3)throw error('Укажите телефон, email или контакт в Telegram.');
    const fingerprint=await digest(JSON.stringify([name,contact,message]));
    const now=Date.now(),index='index:'+data.id,key='lead:'+String(9999999999999-now).padStart(13,'0')+':'+data.id;
    const ipKey='rate:'+await digest(this.config.ADMIN_PASSWORD_HASH+'\n'+ip);
    return this.storage.transaction(async store=>{
      const existingKey=await store.get(index);const existing=existingKey?await store.get(existingKey):null;
      if(existing){if(existing.fingerprint!==fingerprint)throw error('Эта отправка уже принята. Обновите страницу для новой заявки.',409);return {id:existing.id};}
      const rate=await store.get(ipKey)||{times:[]};
      const times=rate.times.filter(time=>time>now-86400000);
      const global=await store.get('rate:global')||{times:[]};
      const recent=global.times.filter(time=>time>now-3600000);
      if(times.length>=20||times.filter(time=>time>now-900000).length>=5||recent.length>=100)throw error('Слишком много обращений. Попробуйте позже или напишите напрямую.',429);
      await store.put(ipKey,{times:[...times,now],expires:now+86400000});
      await store.put('rate:global',{times:[...recent,now],expires:now+3600000});
      await store.put(index,key);
      await store.put(key,{id:data.id,name,contact,message,fingerprint,createdAt:now,status:'new',notification:{state:'pending',attempts:0,nextAt:now}});
      return {id:data.id};
    });
  }
  async list({cursor='',limit=30}={}){
    if((cursor&&!/^\d{13}:[0-9a-f-]{36}$/.test(cursor))||!Number.isInteger(limit)||limit<1||limit>100)throw error('Некорректная страница заявок.');
    // Inverted timestamps show newest first; cursor pagination stays stable during new submissions.
    const records=await this.storage.list({prefix:'lead:',startAfter:cursor?'lead:'+cursor:'',limit:limit+1});
    const selected=[...records.values()];const more=selected.length>limit;selected.length=Math.min(selected.length,limit);
    return {leads:selected.map(publicRecord),nextCursor:more?[...records.keys()][limit-1].slice(5):null,telegramConfigured:Boolean(this.config.TELEGRAM_BOT_TOKEN&&this.config.TELEGRAM_CHAT_ID),emailConfigured:mailConfigured(this.config)};
  }
  async update(id,status){
    if(!uuid.test(id)||!statuses.includes(status))throw error('Некорректный статус.');
    return this.storage.transaction(async store=>{
      const key=await store.get('index:'+id),record=key?await store.get(key):null;if(!record)throw error('Заявка не найдена.',404);
      record.status=status;await store.put(key,record);return publicRecord(record);
    });
  }
  async retry(id){
    if(!uuid.test(id))throw error('Некорректная заявка.');
    return this.storage.transaction(async store=>{
      const key=await store.get('index:'+id),record=key?await store.get(key):null;
      if(!record)throw error('Заявка не найдена.',404);
      if(record.notification.state!=='sent')record.notification={state:'pending',attempts:0,nextAt:Date.now()};
      await store.put(key,record);return publicRecord(record);
    });
  }
  async remove(id){
    if(!uuid.test(id))throw error('Некорректная заявка.');
    await this.storage.transaction(async store=>{const key=await store.get('index:'+id);if(key)await store.delete(key);await store.delete('index:'+id);});return {ok:true};
  }
  async notify(){
    const telegram=Boolean(this.config.TELEGRAM_BOT_TOKEN&&this.config.TELEGRAM_CHAT_ID);
    if(this.running||(!telegram&&!mailConfigured(this.config)))return;
    this.running=true;
    try{
      let cursor='',sent=0;
      do{
        const rows=await this.storage.list({prefix:'lead:',startAfter:cursor,limit:100});
        for(const [key,record]of rows){
          cursor=key;const n=record.notification;
          if(n.state==='sent'||n.state==='failed'||n.nextAt>Date.now())continue;
          let ok=false,channel=null;
          if(telegram)try{
            // Contact details remain on the VPS. Telegram receives only a receipt reference.
            const response=await this.fetcher('https://api.telegram.org/bot'+this.config.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:this.config.TELEGRAM_CHAT_ID,text:'Новая заявка на epiphany-int.ru\n№ '+record.id+'\nОткрыть: '+this.config.SITE_ORIGIN+'/admin/leads.html#'+record.id,link_preview_options:{is_disabled:true}})});
            ok=response.ok&&(await response.json()).ok===true;
          }catch{/* Never log Telegram URLs, credentials or customer messages. */}
          if(ok)channel='telegram';
          if(!ok&&mailConfigured(this.config)){
            try{
              const recipient=(await this.getContacts()).email;
              ok=await this.mailer(this.config,{to:recipient,id:record.id,text:'Заявка с сайта epiphany-int.ru\n№ '+record.id+'\n\nИмя: '+record.name+'\nКонтакт: '+record.contact+'\n\n'+(record.message||'Описание проекта не указано')+'\n\nАдминка: '+this.config.SITE_ORIGIN+'/admin/leads.html#'+record.id});
              if(ok)channel='email';
            }catch{/* Keep the receipt pending if both delivery channels fail. */}
          }
          await this.storage.transaction(async store=>{
            const current=await store.get(key);if(!current)return;
            const attempts=current.notification.attempts+1;
            current.notification={channel,state:ok?'sent':attempts>=8?'failed':'pending',attempts,nextAt:Date.now()+Math.min(3600000,30000*2**attempts)};
            await store.put(key,current);
          });
          if(++sent>=10)return;
        }
        if(rows.size<100)break;
      }while(cursor);
    }finally{this.running=false;}
  }
  async sweep(){
    let cursor='';
    do{
      const rows=await this.storage.list({prefix:'rate:',startAfter:cursor,limit:100});
      for(const [key,record]of rows){cursor=key;if(record.expires<=Date.now())await this.storage.delete(key);}
      if(rows.size<100)break;
    }while(cursor);
  }
}
