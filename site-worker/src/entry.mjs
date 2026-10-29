import {DurableObject} from 'cloudflare:workers';
import {AdminState as StateCore} from './state.mjs';
import worker from './worker.mjs';
import snapshot from '../generated/site.json' with {type:'json'};
export default {fetch(request,env,ctx){return worker.fetch(request,{...env,SITE_CONTENT:snapshot},ctx);}};
// Keep the state machine independently testable, and use the native runtime
// base class for the actual SQLite-backed Cloudflare Durable Object.
export class AdminState extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.core=new StateCore(ctx);}
  fetch(request){return this.core.fetch(request);}
  alarm(){return this.core.alarm();}
}
