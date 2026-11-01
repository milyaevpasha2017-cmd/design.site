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
  if (open) navigation.querySelector('a')?.focus();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(true); });
document.addEventListener('click', event => { if (!navigation.contains(event.target) && !menuButton.contains(event.target)) closeMenu(); });
document.addEventListener('focusin', event => { if (!navigation.contains(event.target) && !menuButton.contains(event.target)) closeMenu(); });
matchMedia('(max-width: 900px)').addEventListener('change', () => closeMenu());
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  closeMenu();
}));
// Progressive UI enhancements: source content remains visible without JS.
let progressQueued = false;
function updateProgress() {
  progressQueued = false;
  const root = document.documentElement, range = root.scrollHeight - root.clientHeight;
  root.style.setProperty('--page-progress', String(range > 0 ? Math.max(0, Math.min(1, root.scrollTop / range)) : 0));
}
function queueProgress() { if (!progressQueued) { progressQueued = true; requestAnimationFrame(updateProgress); } }
addEventListener('scroll', queueProgress, {passive:true});
addEventListener('resize', queueProgress); updateProgress();
const portfolio = $('.portfolio-section');
if (portfolio?.querySelector('.project-card')) {
  const switcher = portfolio.querySelector('.project-view-switch');
  if (switcher) {
    switcher.hidden = false;
    switcher.querySelectorAll('[data-project-view]').forEach(button => button.addEventListener('click', () => {
      portfolio.dataset.projectLayout = button.dataset.projectView;
      switcher.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      queueProgress();
    }));
  }
}
function revealLinkedService() {
  if (!/^#service-[1-9]\d*$/.test(location.hash)) return;
  const detail = document.getElementById(location.hash.slice(1));
  if (!detail?.matches('.service-detail')) return;
  detail.open = true;
  requestAnimationFrame(() => { detail.scrollIntoView({block:'start'}); detail.querySelector('summary')?.focus({preventScroll:true}); });
}
addEventListener('hashchange', revealLinkedService); revealLinkedService();
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('reveal-in'); observer.unobserve(entry.target); }
  }), {threshold:.12});
  document.querySelectorAll('.project-card,.steps article,.service-teasers>a').forEach(element => observer.observe(element));
}
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
  // Leave vertical scrolling and pinch zoom to the browser; a clear horizontal
  // swipe advances the photo without also activating the arrow controls.
  const viewer = $('#project-viewer');
  let swipe = null;
  viewer.addEventListener('pointerdown', event => {
    swipe = photos.length > 1 && event.isPrimary && event.pointerType !== 'mouse' && !event.target.closest('button')
      ? {id:event.pointerId,x:event.clientX,y:event.clientY} : null;
  });
  viewer.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) >= 48 && Math.abs(dy) < Math.abs(dx) * .65) showPhoto(index + (dx < 0 ? 1 : -1));
  });
  viewer.addEventListener('pointercancel', () => { swipe = null; });
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
// Submit the request only with separate personal-data consent.
const form = $('#brief-form');
if (form) {
  form.hidden = false;
  form.tabIndex = -1;
  // The form is revealed by JS; resolve the incoming anchor after it is visible.
  if (location.hash === '#brief-form') requestAnimationFrame(() => {
    form.scrollIntoView({block:'start'});
    form.focus({preventScroll:true});
  });
  const copy = JSON.parse($('#form-data').textContent).form;
  const status = $('#brief-status'), error = $('#brief-error'), button = form.querySelector('[type="submit"]');
  let sending = false, accepted = false, requestId = crypto.randomUUID();
  form.addEventListener('input', event => {
    event.target.setCustomValidity?.('');
    if (accepted) { accepted = false; requestId = crypto.randomUUID(); status.textContent = ''; button.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (sending || accepted) return;
    for (const field of form.querySelectorAll('[required]')) {
      field.setCustomValidity((field.type==='checkbox'?field.checked:field.value.trim()) ? '' : field.type==='checkbox'?'Подтвердите согласие на обработку персональных данных.':copy.whitespace_error);
      if (!field.reportValidity()) return;
    }
    const values = new FormData(form);
    const fields = [...form.querySelectorAll('input, textarea')];
    sending = true; button.disabled = true; fields.forEach(field => {field.readOnly = true;if(field.type==='checkbox')field.disabled=true;});
    error.hidden = true; status.textContent = copy.sending || 'Отправляем заявку…';
    form.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/leads', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: requestId, name: values.get('name'), contact: values.get('contact'), message: values.get('message'), website: values.get('website'), consent: values.get('consent') === 'on', consentVersion: values.get('consent_version') }) });
      let data; try { data = await response.json(); } catch { throw new Error('Не удалось подтвердить отправку. Повторите попытку или напишите напрямую.'); }
      if (!response.ok || !data.ok || data.id !== requestId) throw new Error(data.error || 'Не удалось подтвердить отправку. Повторите попытку или напишите напрямую.');
      accepted = true;
      // Count only server-confirmed acceptance; analytics must never break the form.
      try { window.ym?.(113965901, 'reachGoal', 'lead_submitted'); } catch {}
      form.reset(); status.textContent = copy.result; status.focus();
    } catch (failure) {
      status.textContent = ''; error.hidden = false;
      error.textContent = failure.name === 'TimeoutError' || failure instanceof TypeError ? 'Не удалось подтвердить отправку. Проверьте интернет и повторите: повторная попытка не создаст копию заявки.' : failure.message;
      error.focus();
    } finally {
      sending = false; fields.forEach(field => {field.readOnly = false;if(field.type==='checkbox')field.disabled=false;}); button.disabled = accepted;
      form.removeAttribute('aria-busy');
    }
  });
}

// Existing links to sections of the original one-page site keep working.
if (location.pathname === new URL(document.querySelector('.logo').href).pathname) {
  const legacy = { '#projects':'projects/', '#approach':'about/', '#services':'services/', '#videos':'videos/', '#contact':'contact/' };
  if (legacy[location.hash]) location.replace(new URL(legacy[location.hash], document.querySelector('.logo').href));
}
