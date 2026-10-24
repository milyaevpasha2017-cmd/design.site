import { vkEmbed, contactURL, imageURL } from './content-utils.mjs';
const $ = selector => document.querySelector(selector);
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
function setImage(el, source, alt) {
  const url = imageURL(source, document.baseURI);
  el.style.backgroundImage = url ? `url(${JSON.stringify(url)})` : 'none';
  if (alt) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', alt); }
}
const menuButton = $('.menu-toggle');
const navigation = $('#navigation');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open)); navigation.classList.toggle('open', open);
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  navigation.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false');
}));
const dialog = $('#project-dialog');
function openProject(project) {
  $('#dialog-title').textContent = project.title;
  $('#dialog-description').textContent = project.description;
  $('#dialog-label').textContent = project.is_concept ? 'КОНЦЕПЦИЯ ИНТЕРЬЕРА' : 'ПРОЕКТ ИНТЕРЬЕРА';
  $('#dialog-note').hidden = !project.is_concept;
  setImage($('.dialog-image'), project.image, project.image_alt || project.title);
  $('#project-gallery').replaceChildren();
  for (const item of project.images || []) {
    const url = imageURL(item.image, document.baseURI); if (!url) continue;
    const img = node('img'); img.src = url; img.alt = item.alt || project.title; img.loading = 'lazy'; $('#project-gallery').append(img);
  }
  dialog.showModal(); document.body.classList.add('modal-open');
}
$('.dialog-close').addEventListener('click', () => dialog.close());
$('#dialog-contact').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
});
function renderVideos(videos) {
  const grid = $('#video-grid'); grid.replaceChildren();
  if (!videos.length) { grid.append(node('p', 'empty-state', 'Скоро здесь появятся видео о проектах.')); return; }
  for (const video of videos) {
    const card = node('article', 'video-card'); const embed = vkEmbed(video.url);
    const frame = node('div', 'video-frame');
    if (video.poster) setImage(frame, video.poster);
    if (embed) {
      const play = node('button', 'video-play', '▶ Смотреть видео'); play.type = 'button'; play.setAttribute('aria-label', `Смотреть: ${video.title}`);
      play.addEventListener('click', () => {
        const iframe = node('iframe'); iframe.src = embed; iframe.title = video.title; iframe.allow = 'fullscreen; picture-in-picture; encrypted-media'; iframe.allowFullscreen = true; iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.replaceChildren(iframe, node('span', 'sr-only', 'Если проигрыватель не загружается, откройте видео во ВКонтакте.'));
      }); frame.append(play);
    } else { frame.append(node('p', 'video-error', 'Для этого видео пока не настроено встраивание.')); }
    card.append(frame, node('h3', '', video.title), node('p', '', video.description));
    if (embed) {
      const u = new URL(embed); const link = node('a', 'video-source', 'Открыть во ВКонтакте ↗');
      link.href = `https://vk.com/video${u.searchParams.get('oid')}_${u.searchParams.get('id')}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
    }
    grid.append(card);
  }
}
function render(data) {
  document.querySelectorAll('[data-content]').forEach(el => {
    const value = data.texts[el.dataset.content]; if (typeof value === 'string') el.textContent = value;
  });
  document.title = data.texts.page_title;
  $('meta[name="description"]').content = data.texts.description;
  setImage($('#hero-image'), data.hero_image);
  $('#about-paragraphs').replaceChildren(...data.about.map(p => node('p', 'body-copy', p)));
  $('#principles').replaceChildren(...data.principles.map(p => node('span', '', p)));
  $('#project-grid').replaceChildren(...data.projects.map((project, i) => {
    const button = node('button', `project-card${i % 3 === 2 ? ' wide' : ''}`); button.type = 'button'; button.dataset.project = i;
    const image = node('div', `project-image interior-image ${['first','second','third'][i % 3]}`); setImage(image, project.image, project.image_alt || project.title); image.append(node('span', 'project-arrow', '↗'));
    const title = node('div', 'project-title'); title.append(node('h3', '', project.title), node('span', '', String(i + 1).padStart(2, '0')));
    button.append(image, title, node('p', '', project.subtitle)); button.addEventListener('click', () => openProject(project)); return button;
  }));
  $('#service-list').replaceChildren(...data.services.map((service, i) => {
    const details = node('details'); details.open = i === 0; const summary = node('summary');
    summary.append(node('span', '', String(i + 1).padStart(2,'0')), document.createTextNode(service.title), node('b', '', '+'));
    details.append(summary, node('p', '', service.description)); return details;
  }));
  $('#steps').replaceChildren(...data.steps.map(step => { const article = node('article'); article.append(node('span', '', step.label), node('h3', '', step.title), node('p', '', step.description)); return article; }));
  renderVideos(data.videos || []);
  const contacts = $('#contact-links'); contacts.replaceChildren();
  for (const [kind, label] of Object.entries({youtube: 'YouTube', telegram: 'Telegram', vk: 'ВКонтакте', email: 'Написать на почту'})) {
    const url = contactURL(kind, data.contacts?.[kind]); if (!url) continue;
    const a = node('a', '', label); a.href = url; a.append(node('span', '', '↗'));
    if (kind !== 'email') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    contacts.append(a);
  }
  if (!contacts.children.length) contacts.append(node('p', 'empty-state', 'Контакты скоро появятся.'));
  const email = contactURL('email', data.contacts?.email);
  const emailButton = $('#email-brief'); emailButton.hidden = !email;
  if (email) emailButton.dataset.email = email;
}
fetch(new URL('content/site.json', document.baseURI), { cache: 'no-cache' })
  .then(response => { if (!response.ok) throw new Error('Content request failed'); return response.json(); })
  .then(render).catch(error => {
    console.error('Не удалось загрузить контент сайта', error);
    const warning = node('p', 'content-error', 'Не удалось загрузить обновления сайта. Попробуйте обновить страницу.'); warning.setAttribute('role', 'alert'); $('main').prepend(warning);
  });
$('#brief-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  const text = `Здравствуйте! Меня зовут ${data.get('name').trim()}.\n\nМой проект: ${data.get('message').trim()}\n\nСвязаться со мной: ${data.get('contact').trim()}`;
  $('#brief-text').value = text; $('#brief-result').hidden = false; $('#copy-status').textContent = '';
  const emailButton = $('#email-brief');
  if (emailButton.dataset.email) emailButton.href = `${emailButton.dataset.email}?subject=${encodeURIComponent('Запрос на дизайн интерьера')}&body=${encodeURIComponent(text)}`;
  $('#brief-result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
});
$('#copy-brief').addEventListener('click', async () => {
  const field = $('#brief-text');
  try { await navigator.clipboard.writeText(field.value); $('#copy-status').textContent = 'Скопировано'; }
  catch { field.focus(); field.select(); $('#copy-status').textContent = 'Выделено — скопируйте текст вручную'; }
});
