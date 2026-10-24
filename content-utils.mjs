// Shared parsing, kept independent from the DOM so URL validation is testable.
export function vkEmbed(value) {
  if (typeof value !== 'string') return null;
  const iframeSource = value.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  const input = (iframeSource ? iframeSource[1] : value.trim()).replaceAll('&amp;', '&');
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['vk.com', 'www.vk.com', 'vkvideo.ru', 'www.vkvideo.ru'].includes(url.hostname)) return null;
    let oid, id;
    if (url.pathname === '/video_ext.php') {
      oid = url.searchParams.get('oid'); id = url.searchParams.get('id');
    } else {
      const match = url.pathname.match(/^\/video(-?\d+)_(\d+)\/?$/);
      if (!match) return null;
      [, oid, id] = match;
    }
    if (!/^-?\d+$/.test(oid || '') || !/^\d+$/.test(id || '')) return null;
    const embed = new URL('https://vk.com/video_ext.php');
    embed.searchParams.set('oid', oid); embed.searchParams.set('id', id);
    const hash = url.searchParams.get('hash');
    if (hash && /^[a-zA-Z0-9_-]{1,256}$/.test(hash)) embed.searchParams.set('hash', hash);
    embed.searchParams.set('hd', '2'); embed.searchParams.set('autoplay', '0');
    return embed.href;
  } catch { return null; }
}
export function contactURL(kind, value) {
  if (!value || typeof value !== 'string') return null;
  value = value.trim();
  if (kind === 'email') return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value) ? `mailto:${value}` : null;
  const hosts = { youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'], telegram: ['t.me'], vk: ['vk.com', 'www.vk.com', 'vk.ru', 'www.vk.ru'] };
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts[kind]?.includes(u.hostname) ? u.href : null; } catch { return null; }
}
export function imageURL(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value, base);
    return !u.username && !u.password && (u.protocol === 'https:' || (u.protocol === 'http:' && u.origin === new URL(base).origin)) ? u.href : null;
  } catch { return null; }
}
