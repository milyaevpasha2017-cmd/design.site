import fonts from './font-library.json' with {type:'json'};
export {fonts};
export function fontChoice(id,role='body'){
 return fonts.find(font=>font.id===id)||fonts.find(font=>font.id===(role==='display'?'cormorant':'manrope'));
}
export function typography(settings){
 const value=settings?.typography;
 return {body:fontChoice(value?.body),display:fontChoice(value?.display,'display')};
}
