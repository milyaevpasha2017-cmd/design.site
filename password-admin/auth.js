const form=document.querySelector('#login-form');const error=document.querySelector('#login-error');
form.addEventListener('submit',async event=>{
  event.preventDefault();error.textContent='';const button=form.querySelector('button');button.disabled=true;button.textContent='Входим…';
  try{
    const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.username.value.trim(),password:form.password.value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось войти.');form.password.value='';location.replace('/admin/');
  }catch(cause){error.textContent=cause.message;button.disabled=false;button.textContent='Войти';}
});
