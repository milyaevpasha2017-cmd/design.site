const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
const fail=status=>reply(status,{ok:false,error_code:status});
async function authorized(actual,expected){
  const encode=new TextEncoder();
  const [a,b]=await Promise.all([actual,expected].map(v=>crypto.subtle.digest('SHA-256',encode.encode(v))));
  const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}
async function readBody(request){
  if(!request.body)return {};
  const reader=request.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new Error();}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createRelay(fetcher=fetch){return {async fetch(request,env){
  const url=new URL(request.url);
  if(url.search||!['/getMe','/sendMessage'].includes(url.pathname))return fail(404);
  if(request.method!=='POST')return fail(405);
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return fail(503);
  if(!await authorized(request.headers.get('Authorization')||'','Bearer '+env.TELEGRAM_BOT_TOKEN))return fail(401);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return fail(415);
  let payload;
  try{
    const input=await readBody(request);payload={};
    if(url.pathname==='/sendMessage'){
      if(String(input.chat_id)!==String(env.TELEGRAM_CHAT_ID)||typeof input.text!=='string'||!input.text.length||input.text.length>4096)return fail(400);
      payload={chat_id:env.TELEGRAM_CHAT_ID,text:input.text,link_preview_options:{is_disabled:true}};
    }
  }catch{return fail(400);}
  try{
    const upstream=await fetcher('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+url.pathname,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    const data=await upstream.json();
    if(upstream.ok&&data.ok===true){
      return reply(200,{ok:true,result:url.pathname==='/getMe'?{id:data.result.id,username:data.result.username}:true});
    }
    const code=[400,401,403,429].includes(data.error_code)?data.error_code:502;
    return reply(code,{ok:false,error_code:code,...(code===429?{parameters:{retry_after:Math.max(1,Math.min(3600,Number(data.parameters?.retry_after)||60))}}:{})});
  }catch{return fail(504);}
}};}
export default createRelay();
