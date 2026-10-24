const COOKIE = '__Host-epiphany-oauth';
const COOKIE_OPTIONS = 'Path=/; HttpOnly; Secure; SameSite=Lax';
const clearCookie = `${COOKIE}=; ${COOKIE_OPTIONS}; Max-Age=0`;
const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
};
function text(message, status = 200, extra = {}) {
  return new Response(message, { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
}
function popup(origin, result, success) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const payload = `authorization:github:${success ? 'success' : 'error'}:${JSON.stringify(result)}`;
  const safe = value => JSON.stringify(value).replaceAll('<', '\\u003c');
  const body = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Вход в Epiphany Interior</title><p>Возвращаемся в панель управления. Если окно не закрылось, вернитесь во вкладку админки.</p><script nonce="${nonce}">
const origin = ${safe(origin)};
if (window.opener) {
  const receive = event => {
    if (event.origin !== origin || event.source !== window.opener || event.data !== 'authorizing:github') return;
    window.removeEventListener('message', receive);
    window.opener.postMessage(${safe(payload)}, origin);
    window.close();
  };
  window.addEventListener('message', receive);
  window.opener.postMessage('authorizing:github', origin);
}
</script></html>`;
  return new Response(body, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearCookie, 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'` } });
}
function configuration(env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SITE_ORIGIN || !env.REPO) return null;
  try {
    const site = new URL(env.SITE_ORIGIN);
    if (site.protocol !== 'https:' || site.origin !== env.SITE_ORIGIN || !/^[\w.-]+\/[\w.-]+$/.test(env.REPO)) return null;
    return { origin: site.origin, host: site.hostname };
  } catch { return null; }
}
export function createWorker(fetcher = fetch) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (request.method !== 'GET') return text('Method not allowed', 405, { Allow: 'GET' });
      if (url.protocol !== 'https:') return text('HTTPS is required', 400);
      const config = configuration(env);
      if (!config) return text('Авторизация ещё не настроена. Проверьте переменные Worker по инструкции ADMIN-SETUP.md.', 503);
      if (url.pathname === '/') return text('Epiphany Interior: сервис авторизации запущен. Для входа откройте /admin/ на сайте.');
      if (url.pathname === '/auth') {
        if (url.searchParams.get('provider') !== 'github' || url.searchParams.get('site_id') !== config.host) return text('Недопустимый сайт или провайдер.', 400);
        const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        const authorize = new URL('https://github.com/login/oauth/authorize');
        authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
        authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
        authorize.searchParams.set('scope', 'public_repo'); authorize.searchParams.set('state', state);
        return new Response(null, { status: 302, headers: { ...headers, Location: authorize.href, 'Set-Cookie': `${COOKIE}=${state}; ${COOKIE_OPTIONS}; Max-Age=600` } });
      }
      if (url.pathname !== '/callback') return text('Not found', 404);
      const cookie = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      const state = url.searchParams.get('state');
      if (!cookie || !/^[a-f0-9]{64}$/.test(cookie) || state !== cookie) return text('Сессия входа истекла или не прошла проверку. Повторите вход из админки.', 400, { 'Set-Cookie': clearCookie });
      const failure = message => popup(config.origin, { message }, false);
      if (url.searchParams.has('error')) return failure('Вход через GitHub отменён.');
      const code = url.searchParams.get('code');
      if (!code || code.length > 1024) return failure('GitHub не вернул код авторизации.');
      try {
        const response = await fetcher('https://github.com/login/oauth/access_token', {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/callback` }),
        });
        if (!response.ok) return failure('Не удалось завершить авторизацию GitHub. Повторите вход.');
        const token = await response.json();
        if (!token.access_token || token.error) return failure('GitHub отклонил авторизацию. Проверьте настройки OAuth App.');
        const repo = await fetcher(`https://api.github.com/repos/${env.REPO}`, { headers: {
          Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json',
          'User-Agent': 'Epiphany-Interior-CMS', 'X-GitHub-Api-Version': '2022-11-28',
        } });
        if (!repo.ok) return failure('Не удалось проверить доступ к репозиторию сайта.');
        const permissions = await repo.json();
        if (!permissions.permissions?.push) return failure('У этой учётной записи нет права редактировать репозиторий сайта.');
        return popup(config.origin, { token: token.access_token, provider: 'github' }, true);
      } catch { return failure('Сервис GitHub временно недоступен. Повторите вход позже.'); }
    },
  };
}
export default createWorker();
