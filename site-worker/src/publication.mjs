// Content is stored separately from login sessions, using another instance of
// the existing Durable Object binding. No new service or account setup needed.
export class Publication {
  constructor(ctx){this.storage=ctx.storage;}
  async fetch({action,...data}){
    if(action==='publish:read'){
      const records=await this.storage.transaction(async storage=>{
        const records={};let cursor;
        do{
          const rows=await storage.list({prefix:'content:',limit:500,...(cursor?{startAfter:cursor}:{})});
          for(const [key,meta]of rows){
            const file=key.slice(8);
            const parts=await Promise.all(Array.from({length:meta.chunks},(_,i)=>storage.get('document:'+file+':'+i)));
            records[file]={data:JSON.parse(parts.join('')),commit:meta.commit,sha:meta.sha};cursor=key;
          }
          if(rows.size<500)break;
        }while(cursor);
        return records;
      });
      return Response.json(records);
    }
    if(action==='publish:update'){
      await this.storage.transaction(async storage=>{
        const key='content:'+data.file,old=await storage.get(key);
        // A later GitHub write can reach this object before an earlier one.
        // Preserve the newest revision, including a deliberate text reversion.
        if(old && data.previousSha!==old.sha && old.ancestors.includes(data.sha))return;
        const ancestors=[...new Set([...(old?.ancestors||[]),old?.sha,data.previousSha].filter(value=>value!==undefined))].slice(-1024);
        const text=JSON.stringify(data.data);let chunks=0;
        for(let i=0;i<text.length;i+=15000)await storage.put('document:'+data.file+':'+chunks++,text.slice(i,i+15000));
        for(let i=chunks;i<(old?.chunks||0);i++)await storage.delete('document:'+data.file+':'+i);
        await storage.put(key,{chunks,sha:data.sha,commit:data.commit,ancestors});
      });
      return Response.json({ok:true});
    }
    if(action==='publish:upload'){
      const prefix='media:'+data.path;
      // DO values have a size limit; store immutable photos in small chunks.
      await this.storage.transaction(async storage=>{
        let chunks=0;
        for(let i=0;i<data.content.length;i+=60000)await storage.put(prefix+':'+chunks++,data.content.slice(i,i+60000));
        await storage.put(prefix,{chunks,type:data.type,etag:data.sha});
      });
      return Response.json({ok:true});
    }
    if(action==='publish:photo'){
      const prefix='media:'+data.path,meta=await this.storage.get(prefix);
      if(!meta)return new Response('Not found',{status:404});
      const chunks=await Promise.all(Array.from({length:meta.chunks},(_,i)=>this.storage.get(prefix+':'+i)));
      if(chunks.some(chunk=>typeof chunk!=='string'))return new Response('Photo unavailable',{status:503});
      return new Response(Uint8Array.from(atob(chunks.join('')),c=>c.charCodeAt(0)),{headers:{'Content-Type':meta.type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff',ETag:'"'+meta.etag+'"'}});
    }
    return Response.json({error:'Unknown publication operation'},{status:400});
  }
}

export function publication(env,data){
  const id=env.ADMIN_STATE.idFromName('epiphany-published-content');
  return env.ADMIN_STATE.get(id).fetch('https://internal/',{method:'POST',body:JSON.stringify(data)});
}

export function currentContent(snapshot,records){
  const content={...snapshot.content},included=new Set(snapshot.commits);
  for(const [file,record]of Object.entries(records)){
    // Once a deployment includes a saved commit, its checkout becomes the
    // baseline again. This also respects later edits made directly in GitHub.
    if(included.has(record.commit))continue;
    if(record.data===null)delete content[file];else content[file]=record.data;
  }
  return content;
}
