export function watch(observer,signal){signal?.addEventListener('abort',()=>observer.disconnect(),{once:true});return observer;}
