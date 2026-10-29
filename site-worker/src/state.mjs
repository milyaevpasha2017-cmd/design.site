// One Durable Object holds login throttles and revocable sessions. It is never
// exposed as a public route. SQLite-backed storage works on Workers Free.
export class AdminState {
  constructor(ctx) {this.ctx=ctx;}
  async fetch(request) {
    const {action,...data}=await request.json();const now=Date.now();
    let result;
    if(action==='attempt') {
      result=await this.ctx.storage.transaction(async storage=>{
        const key='attempt:'+data.key;const old=await storage.get(key);const entry=old && old.expires>now ? old : {count:0,expires:now+60000};
        if(entry.count>=5)return {allowed:false};
        entry.count++;await storage.put(key,entry);return {allowed:true};
      });
    } else if(action==='create') {
      await this.ctx.storage.put('session:'+data.sid,data.session);result={ok:true};
    } else if(action==='get') {
      const session=await this.ctx.storage.get('session:'+data.sid);
      if(session && session.expires>now)result=session;
      else {if(session)await this.ctx.storage.delete('session:'+data.sid);result=null;}
    } else if(action==='delete') {await this.ctx.storage.delete('session:'+data.sid);result={ok:true};}
    else return Response.json({error:'Unknown operation'},{status:400});
    if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(now+60000);
    return Response.json(result);
  }
  async alarm() {
    const now=Date.now();let cursor;let remaining=false;
    do {
      const entries=await this.ctx.storage.list({limit:500,...(cursor?{startAfter:cursor}:{})});
      for(const [key,value] of entries){cursor=key;if(value.expires<=now)await this.ctx.storage.delete(key);else remaining=true;}
      if(entries.size<500)break;
    }while(cursor);
    if(remaining)await this.ctx.storage.setAlarm(now+60000);
  }
}
