import legal from './legal/2026-11-01.json' with {type:'json'};
export const LEGAL_VERSION=legal.version;
export const DOCUMENTS=legal.documents;
export const consentText=DOCUMENTS.consent.sections.map(([title,text])=>title+'\n'+text).join('\n\n');
export const legalFooter=(base='/')=>'<nav class="legal-links" aria-label="Правовая информация">'+Object.entries(DOCUMENTS).map(([key,doc])=>`<a href="${base}${key}/">${doc.title}</a>`).join('')+'<button type="button" data-cookie-settings>Настройки cookie</button></nav>';
export const cookieBanner=(base='/')=>`<section id="cookie-banner" class="cookie-banner" aria-label="Настройки cookie" hidden><div><h2>Настройки cookie</h2><p>С вашего согласия используем Яндекс Метрику и Вебвизор для анализа посещений. Вы можете отказаться — сайт и форма продолжат работать. <a href="${base}cookies/">Подробнее о cookie</a> · <a href="${base}privacy/">Политика обработки данных</a></p></div><div class="cookie-actions"><button type="button" data-cookie-accept>Принять</button><button type="button" data-cookie-reject>Отклонить</button></div></section>`;
