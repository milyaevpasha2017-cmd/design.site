import {DurableObject} from 'cloudflare:workers';
import {AdminState as StateCore} from './state.mjs';
export {default} from './worker.mjs';
// Keep the state machine independently testable, and use the native runtime
// base class for the actual SQLite-backed Cloudflare Durable Object.
export class AdminState extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.core=new StateCore(ctx);}
  fetch(request){return this.core.fetch(request);}
  alarm(){return this.core.alarm();}
}
