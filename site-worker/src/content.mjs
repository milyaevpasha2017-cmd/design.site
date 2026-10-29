import schema from '../../password-admin/schema.json' with { type: 'json' };
export { schema };
export const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validate(fields,data) {
  if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('Нужен объект данных.');
  const known=new Set(fields.map(f=>f.name));for(const key of Object.keys(data))if(!known.has(key))throw new Error(`Неизвестное поле: ${key}`);
  for(const field of fields){const value=data[field.name];const required=field.required!==false;
    if(value===undefined || value===null || value===''){if(required)throw new Error(`Заполните поле «${field.label}».`);continue;}
    if(field.widget==='object')validate(field.fields,value);
    else if(field.widget==='list'){
      if(!Array.isArray(value)||value.length>150)throw new Error(`Некорректный список «${field.label}».`);
      for(const item of value){if(field.fields)validate(field.fields,item);else validate([{...field.field,name:'value'}],{value:item});}
    }else if(field.widget==='boolean'){if(typeof value!=='boolean')throw new Error(`Некорректное поле «${field.label}».`);}
    else if(field.widget==='number'){if(!Number.isSafeInteger(value) || value<0)throw new Error(`Некорректное число «${field.label}».`);}
    else {
      if(typeof value!=='string'||value.length>20000||(!value.trim()&&required))throw new Error(`Некорректный текст «${field.label}».`);
      if(field.pattern&&!new RegExp(field.pattern[0]).test(value))throw new Error(field.pattern[1]);
      if(field.widget==='image' && !(/^assets\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.split('/').includes('..')) && !/^https:\/\//.test(value))throw new Error('Некорректный адрес фотографии.');
    }
  }
}
export function encodeText(text) {
  const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
function decodeText(text){const binary=atob(text.replaceAll('\n',''));return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
export function repository(env,fetcher) {
  const branch=env.CONTENT_BRANCH||'main';const base=`https://api.github.com/repos/${env.CONTENT_REPO}/`;
  async function requestJSON(path,method='GET',body){
    const url=base+path;
    // Workers supports manual/follow, not error. Reject redirects below without
    // forwarding the server credential to the Location supplied by an upstream.
    const response=await fetcher(url,{method,redirect:'manual',headers:{Authorization:`Bearer ${env.GITHUB_CONTENT_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Epiphany-Content-Admin',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,branch})}:{})});
    if(!response.ok){const status=[409,422].includes(response.status)?409:response.status===404?404:502;throw Object.assign(new Error(status===409?'Запись уже изменена. Скопируйте свои правки и откройте её заново, чтобы избежать перезаписи.':status===404?'Запись не найдена.':'Не удалось сохранить или загрузить данные. Проверьте доступ сервера к хранилищу.'),{status});}
    return response.json();
  }
  const request=(file,method='GET',body)=>requestJSON('contents/'+file.split('/').map(encodeURIComponent).join('/')+(method==='GET'?'?ref='+encodeURIComponent(branch):''),method,body);
  async function projectTree(){
    let ref=branch;
    for(const directory of ['content','projects']){
      const tree=await requestJSON('git/trees/'+encodeURIComponent(ref));
      if(tree.truncated||!Array.isArray(tree.tree))throw Object.assign(new Error('Хранилище вернуло неполный список. Проекты не обрезаны: загрузка остановлена, обратитесь к владельцу сайта.'),{status:502});
      const entry=tree.tree.find(item=>item.type==='tree'&&item.path===directory);
      if(!entry)return [];
      ref=entry.sha;
    }
    const tree=await requestJSON('git/trees/'+encodeURIComponent(ref));
    if(tree.truncated||!Array.isArray(tree.tree))throw Object.assign(new Error('Хранилище вернуло неполный список. Проекты не обрезаны: загрузка остановлена, обратитесь к владельцу сайта.'),{status:502});
    return tree.tree.filter(item=>item.type==='blob').map(item=>({type:'file',name:item.path,sha:item.sha}));
  }
  return {
    async archive(){
      const response=await fetcher(base+'zipball/'+encodeURIComponent(branch),{method:'GET',redirect:'manual',headers:{Authorization:`Bearer ${env.GITHUB_CONTENT_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'Epiphany-Content-Admin','X-GitHub-Api-Version':'2022-11-28'}});
      let archive=response;
      if([301,302,303,307,308].includes(response.status)){
        let location;try{location=new URL(response.headers.get('Location'));}catch{}
        await response.body?.cancel();
        if(!location||location.protocol!=='https:'||location.hostname!=='codeload.github.com'||location.username||location.password||location.port)throw Object.assign(new Error('Не удалось безопасно подготовить архив.'),{status:502});
        // Never forward the repository credential to a redirect target. The
        // temporary codeload URL stays on the server and is not returned.
        archive=await fetcher(location.href,{method:'GET',redirect:'manual',headers:{'User-Agent':'Epiphany-Content-Admin'}});
      }
      if(!archive.ok||!archive.body||!/(?:zip|octet-stream)/i.test(archive.headers.get('Content-Type')||'')){await archive.body?.cancel();throw Object.assign(new Error('Не удалось скачать архив. Проверьте доступ к репозиторию и повторите позже.'),{status:502});}
      return archive;
    },
    async read(file){const result=await request(file);if(!result.content||result.type!=='file')throw Object.assign(new Error('Некорректный файл.'),{status:502});return {sha:result.sha,data:JSON.parse(decodeText(result.content))};},
    async list(){
      let files,usedTree=false;
      try{files=await request('content/projects');}catch(error){if(error.status!==404)throw error;files=await projectTree();usedTree=true;}
      if(!Array.isArray(files))throw Object.assign(new Error('Хранилище вернуло некорректный список проектов.'),{status:502});
      if(!usedTree&&files.length>=1000)files=await projectTree();
      return files.filter(f=>f.type==='file'&&/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(f.name)).map(f=>({id:f.name.slice(0,-5),sha:f.sha}));
    },
    async save(file,data,sha){const result=await request(file,'PUT',{message:`Обновление контента: ${file}`,content:encodeText(JSON.stringify(data,null,2)+'\n'),...(sha?{sha}:{})});return {sha:result.content.sha,commit:result.commit?.sha};},
    async upload(file,content){const result=await request(file,'PUT',{message:'Добавлена фотография проекта',content});return {path:file,sha:result.content.sha,commit:result.commit?.sha};},
    async remove(file,sha){const result=await request(file,'DELETE',{message:`Удалён проект: ${file}`,sha});return {ok:true,commit:result.commit?.sha};}
  };
}
