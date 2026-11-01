export const decisionTopics = Object.freeze({layout:'Планировка и удобство пространства',light:'Сценарии освещения',materials:'Материалы и комплектация'});
const goal = (name,id) => {try {window.ym?.(113965901,'reachGoal',name,{decision:id});} catch {}};
export function initDecisions(){
  const root=document.querySelector('.decision-section');
  if(root){
    const notes=[...root.querySelectorAll('.decision-note')],pins=[...root.querySelectorAll('.decision-pin')];
    const sync=()=>pins.forEach(pin=>pin.setAttribute('aria-expanded',String(document.getElementById('decision-'+pin.dataset.decision).open)));
    root.querySelector('.decision-pins').hidden=false;
    pins.forEach(pin=>pin.addEventListener('click',()=>{
      const selected=document.getElementById('decision-'+pin.dataset.decision);
      notes.forEach(note=>{note.open=note===selected;});sync();
      selected.querySelector('h3').focus({preventScroll:true});
      if(matchMedia('(max-width:900px)').matches) selected.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      goal('design_decision_open',pin.dataset.decision);
    }));
    notes.forEach(note=>note.addEventListener('toggle',sync));
    root.querySelectorAll('.decision-cta').forEach(link=>link.addEventListener('click',()=>goal('design_decision_contact',new URL(link.href).searchParams.get('interest'))));
  }
  const form=document.querySelector('#brief-form');
  if(!form||document.querySelector('#interior-quiz'))return null;
  const id=new URL(location.href).searchParams.get('interest');
  if(!Object.hasOwn(decisionTopics,id))return null;
  const context={summary:'Интерес к решению на главной: '+decisionTopics[id]};
  const box=document.createElement('div');box.className='decision-form-context';
  const label=document.createElement('p');label.textContent='Обсуждаем: '+decisionTopics[id];
  const clear=document.createElement('button');clear.type='button';clear.textContent='Убрать выбор';
  const message=form.querySelector('[name="message"]');if(message)message.maxLength=2700;
  clear.addEventListener('click',()=>{context.summary=null;if(message)message.maxLength=3000;box.remove();form.dispatchEvent(new Event('input',{bubbles:true}));});
  box.append(label,clear);form.prepend(box);return context;
}
