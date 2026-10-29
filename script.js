import { vkEmbed, contactURL, imageURL } from './content-utils.mjs';
const $ = selector => document.querySelector(selector);
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
function icon(name = 'arrow-up-right') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`); svg.append(use); return svg;
}
function setImage(el, source, alt) {
  const url = imageURL(source, document.baseURI);
  el.style.backgroundImage = url ? `url(${JSON.stringify(url)})` : 'none';
  if (alt) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', alt); }
}
const menuButton = $('.menu-toggle');
const navigation = $('#navigation');
function closeMenu(restoreFocus = false) {
  const wasOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', 'false'); navigation.classList.remove('open');
  if (restoreFocus && wasOpen) menuButton.focus();
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open)); navigation.classList.toggle('open', open);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(true); });
document.addEventListener('click', event => { if (!navigation.contains(event.target) && !menuButton.contains(event.target)) closeMenu(); });
matchMedia('(max-width: 900px)').addEventListener('change', () => closeMenu());
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  closeMenu();
}));
const dialog = $('#project-dialog');
let projectPhotos = [];
let photoIndex = 0;
function showPhoto(index) {
  if (!projectPhotos.length) return;
  photoIndex = (index + projectPhotos.length) % projectPhotos.length;
  const current = projectPhotos[photoIndex];
  const photo = $('#dialog-photo'); photo.src = current.url; photo.alt = current.alt;
  $('#photo-count').textContent = `${photoIndex + 1} / ${projectPhotos.length}`;
  $('#project-gallery').querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === photoIndex)));
}
function openProject(project) {
  $('#dialog-title').textContent = project.title;
  $('#dialog-description').textContent = project.description;
  $('#dialog-label').textContent = project.is_concept ? 'КОНЦЕПЦИЯ ИНТЕРЬЕРА' : 'ПРОЕКТ ИНТЕРЬЕРА';
  $('#dialog-note').hidden = !project.is_concept;
  projectPhotos = [{ image: project.image, alt: project.image_alt || project.title }, ...(project.images || [])]
    .map(item => ({ url: imageURL(item.image, document.baseURI), alt: item.alt || project.title })).filter(item => item.url);
  const gallery = $('#project-gallery'); gallery.replaceChildren();
  $('#viewer-controls').hidden = projectPhotos.length < 2;
  $('#project-viewer').hidden = projectPhotos.length === 0;
  if (projectPhotos.length > 1) projectPhotos.forEach((item, i) => {
    const button = node('button', 'gallery-thumb'); button.type = 'button';
    button.setAttribute('aria-label', `Фото ${i + 1}: ${item.alt}`);
    const img = node('img'); img.src = item.url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    button.append(img); button.addEventListener('click', () => showPhoto(i)); gallery.append(button);
  });
  showPhoto(0);
  dialog.showModal(); dialog.scrollTop = 0; document.body.classList.add('modal-open');
}
$('#photo-previous').addEventListener('click', () => showPhoto(photoIndex - 1));
$('#photo-next').addEventListener('click', () => showPhoto(photoIndex + 1));
dialog.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || projectPhotos.length < 2) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); showPhoto(photoIndex + (event.key === 'ArrowLeft' ? -1 : 1)); }
});
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
  $('#videos').hidden = videos.length === 0;
  document.querySelectorAll('[data-video-nav]').forEach(link => { link.hidden = videos.length === 0; });
  if (!videos.length) return;
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
      const u = new URL(embed); const link = node('a', 'video-source', 'Открыть во ВКонтакте '); link.append(icon());
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
    const image = node('div', `project-image interior-image ${['first','second','third'][i % 3]}`); setImage(image, project.image, project.image_alt || project.title); const arrow = node('span', 'project-arrow'); arrow.append(icon()); image.append(arrow);
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
  for (const [kind, label] of Object.entries({telegram: 'Написать в Telegram', email: 'Написать на почту', vk: 'Группа ВКонтакте', youtube: 'YouTube'})) {
    const url = contactURL(kind, data.contacts?.[kind]); if (!url) continue;
    const a = node('a', '', label); a.href = url; a.append(icon());
    if (kind !== 'email') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    contacts.append(a);
  }
  contacts.hidden = !contacts.children.length;
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
