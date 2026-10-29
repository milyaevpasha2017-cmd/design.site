export const SESSION_SECONDS = 8 * 60 * 60;
export const COOKIE = '__Host-epiphany-admin';
export const cookie = sid => `${COOKIE}=${sid}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${sid ? SESSION_SECONDS : 0}`;
export function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''); }
export async function digest(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''); }
export function sessionId(request) {
  const value=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  return /^[a-f0-9]{64}$/.test(value||'') ? value : null;
}
export function validPasswordHash(hash) { return typeof hash==='string' && /^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/.test(hash); }
function bytes(hex) {return Uint8Array.from(hex.match(/../g),value=>parseInt(value,16));}
export async function verifyPassword(password,hash) {
  if (!validPasswordHash(hash) || typeof password!=='string' || password.length>512) return false;
  const [,iterations,salt,expected]=hash.split('$');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const result=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:Number(iterations)},key,256));
  const target=bytes(expected);let difference=0;for(let i=0;i<target.length;i++)difference|=target[i]^result[i];return difference===0;
}
export async function bodyJSON(request,limit=300000) {
  if (!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Нужен JSON-запрос.'),{status:415});
  if(Number(request.headers.get('Content-Length')||0)>limit)throw Object.assign(new Error('Слишком большой файл.'),{status:413});
  if(!request.body)throw Object.assign(new Error('Пустой запрос.'),{status:400});
  const reader=request.body.getReader();const chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Object.assign(new Error('Слишком большой файл.'),{status:413});}chunks.push(value);}
  const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output));}catch{throw Object.assign(new Error('Некорректные данные запроса.'),{status:400});}
}
export function imageExtension(bytes) {
  if(bytes.length>=8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'png';
  if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'jpg';
  if(bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'webp';
  return null;
}
