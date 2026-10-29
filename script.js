import { vkEmbed, contactURL } from './content-utils.mjs';
const $ = selector => document.querySelector(selector);
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
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
// Full-size photographs on individual project pages.
const dialog = $('#project-dialog');
if (dialog) {
  const gallery = JSON.parse($('#gallery-data').textContent);
  const photos = gallery.photos;
  let index = 0;
  $('#dialog-title').textContent = gallery.title;
  function showPhoto(next) {
    index = (next + photos.length) % photos.length;
    $('#dialog-photo').src = photos[index].url;
    $('#dialog-photo').alt = photos[index].alt;
    $('#photo-count').textContent = `${index + 1} / ${photos.length}`;
    $('#project-gallery').querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  $('#viewer-controls').hidden = photos.length < 2;
  if (photos.length > 1) photos.forEach((photo, i) => {
    const button = node('button', 'gallery-thumb'); button.type = 'button'; button.setAttribute('aria-label', `${i + 1}: ${photo.alt}`);
    const img = node('img'); img.src = photo.url; img.alt = ''; img.loading = 'lazy'; button.append(img);
    button.addEventListener('click', () => showPhoto(i)); $('#project-gallery').append(button);
  });
  document.querySelectorAll('[data-gallery-open]').forEach(button => button.addEventListener('click', () => {
    showPhoto(Number(button.dataset.galleryOpen)); dialog.showModal(); dialog.scrollTop = 0; document.body.classList.add('modal-open');
  }));
  $('#photo-previous').addEventListener('click', () => showPhoto(index - 1));
  $('#photo-next').addEventListener('click', () => showPhoto(index + 1));
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || photos.length < 2) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); showPhoto(index + (event.key === 'ArrowLeft' ? -1 : 1)); }
  });
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return; const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
}
// VK is contacted only after the visitor chooses to open a player.
const videoSettings = $('#video-data') ? JSON.parse($('#video-data').textContent) : {};
document.querySelectorAll('[data-video-url]').forEach(card => {
  const embed = vkEmbed(card.dataset.videoUrl);
  const button = card.querySelector('.video-play'); const link = card.querySelector('.video-source');
  const frame = card.querySelector('.video-frame'); const title = card.querySelector('h2').textContent;
  if (!embed) { button.replaceWith(node('p', 'video-error', videoSettings.unavailable)); return; }
  const url = new URL(embed);
  link.hidden = false; link.href = `https://vk.com/video${url.searchParams.get('oid')}_${url.searchParams.get('id')}`;
  link.target = '_blank'; link.rel = 'noopener noreferrer'; button.setAttribute('aria-label', `${button.textContent}: ${title}`);
  button.addEventListener('click', () => {
    const iframe = node('iframe'); iframe.src = embed; iframe.title = title; iframe.allow = 'fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; frame.replaceChildren(iframe);
  });
});
// Prepare a message locally; opening a mail client never sends it automatically.
const form = $('#brief-form');
if (form) {
  form.hidden = false;
  const settings = JSON.parse($('#form-data').textContent); const copy = settings.form;
  const email = contactURL('email', settings.email);
  form.querySelectorAll('input, textarea:not([readonly])').forEach(field => field.addEventListener('input', () => field.setCustomValidity('')));
  form.addEventListener('submit', event => {
    event.preventDefault();
    for (const field of form.querySelectorAll('[required]')) {
      field.setCustomValidity(field.value.trim() ? '' : copy.whitespace_error);
      if (!field.reportValidity()) return;
    }
    const values = new FormData(form);
    const text = `${copy.greeting} ${values.get('name').trim()}.\n\n${copy.project_prefix} ${values.get('message').trim()}\n\n${copy.contact_prefix} ${values.get('contact').trim()}`;
    $('#brief-text').value = text; $('#brief-result').hidden = false; $('#copy-status').textContent = '';
    const emailButton = $('#email-brief'); emailButton.hidden = !email;
    if (email) emailButton.href = `${email}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(text)}`;
    $('#brief-result').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
  });
  $('#copy-brief').addEventListener('click', async () => {
    const field = $('#brief-text');
    try { await navigator.clipboard.writeText(field.value); $('#copy-status').textContent = copy.copied; }
    catch { field.focus(); field.select(); $('#copy-status').textContent = copy.copy_fallback; }
  });
}

// Existing links to sections of the original one-page site keep working.
if (location.pathname === new URL(document.querySelector('.logo').href).pathname) {
  const legacy = { '#projects':'projects/', '#approach':'about/', '#services':'services/', '#videos':'videos/', '#contact':'contact/' };
  if (legacy[location.hash]) location.replace(new URL(legacy[location.hash], document.querySelector('.logo').href));
}
