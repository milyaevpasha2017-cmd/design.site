const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('open', open);
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  navigation.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));
const projects = [
  ['Тёплый минимализм', 'Мягкие оттенки, тактильные ткани и натуральное дерево. Концепция квартиры, где спокойная палитра помогает замедлиться, а открытое пространство объединяет близких.'],
  ['Ближе к природе', 'Идея загородного дома, построенная вокруг естественного света и природных фактур. Дерево, камень и живые растения создают связь интерьера с окружающим ландшафтом.'],
  ['Искусство простого', 'Лаконичные формы и выразительные детали. Концепция пространства, где у каждого предмета есть своё место, а красота рождается из удобства повседневной жизни.']
];
const dialog = document.querySelector('#project-dialog');
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
  const [title, description] = projects[Number(button.dataset.project)];
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-description').textContent = description;
  dialog.showModal();
  document.body.classList.add('modal-open');
}));
function closeProject() { dialog.close(); }
document.querySelector('.dialog-close').addEventListener('click', closeProject);
document.querySelector('#dialog-contact').addEventListener('click', closeProject);
dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeProject(); } });
document.querySelector('#brief-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  document.querySelector('#brief-text').value = `Здравствуйте! Меня зовут ${data.get('name').trim()}.\n\nМой проект: ${data.get('message').trim()}\n\nСвязаться со мной: ${data.get('contact').trim()}`;
  document.querySelector('#brief-result').hidden = false;
  document.querySelector('#copy-status').textContent = '';
  document.querySelector('#brief-result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
});
document.querySelector('#copy-brief').addEventListener('click', async () => {
  const field = document.querySelector('#brief-text');
  try { await navigator.clipboard.writeText(field.value); document.querySelector('#copy-status').textContent = 'Скопировано'; }
  catch { field.focus(); field.select(); document.querySelector('#copy-status').textContent = 'Выделено — скопируйте текст вручную'; }
});
