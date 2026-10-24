import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { vkEmbed, contactURL, imageURL } from '../content-utils.mjs';
test('VK ordinary links and exported iframe preserve only safe player parameters', () => {
  assert.equal(vkEmbed('https://vkvideo.ru/video-123_456'), 'https://vk.com/video_ext.php?oid=-123&id=456&hd=2&autoplay=0');
  assert.equal(vkEmbed('<iframe src="https://vk.com/video_ext.php?oid=-1&amp;id=2&amp;hash=abc123&amp;autoplay=1" onload="alert(1)"></iframe>'), 'https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123&hd=2&autoplay=0');
});
test('VK rejects untrusted hosts, incomplete identifiers and unsupported links', () => {
  for (const input of ['javascript:alert(1)','https://vk.com.evil.example/video-1_2','https://evil.example/video-1_2','https://user:pass@vk.com/video-1_2','https://vk.com:444/video-1_2','http://vk.com/video-1_2','https://vk.com/video_ext.php?id=1','https://vk.com/clip-1_2','<iframe src="https://evil.example/"></iframe>']) assert.equal(vkEmbed(input), null, input);
});
test('Contact URLs accept correct services and reject unsafe or unrelated URLs', () => {
  assert.equal(contactURL('email','hello@example.com'),'mailto:hello@example.com');
  assert.equal(contactURL('telegram','https://t.me/epiphany'),'https://t.me/epiphany');
  assert.equal(contactURL('youtube','https://www.youtube.com/@epiphany'),'https://www.youtube.com/@epiphany');
  for (const value of ['javascript:alert(1)','https://evil.example','https://t.me.evil.example/a']) assert.equal(contactURL('telegram', value),null);
  assert.equal(contactURL('email','hello@example.com?bcc=other@example.com'),null);
});
test('Uploaded image paths work under GitHub Pages project path and custom domain', () => {
  assert.equal(imageURL('assets/uploads/photo.jpg','https://example.github.io/design.site/'),'https://example.github.io/design.site/assets/uploads/photo.jpg');
  assert.equal(imageURL('assets/uploads/photo.jpg','https://example.com/'),'https://example.com/assets/uploads/photo.jpg');
  assert.equal(imageURL('javascript:alert(1)','https://example.com/'),null);
});
test('Published content has required site collections, safe images and explicit concept markers', async () => {
  const data=JSON.parse(await readFile(new URL('../content/site.json',import.meta.url)));
  for(const key of ['texts','about','principles','projects','services','steps','videos','contacts']) assert.ok(data[key]);
  assert.ok(data.projects.length>0);
  for(const p of data.projects) { assert.ok(p.title && p.description && p.image_alt); assert.equal(typeof p.is_concept,'boolean'); assert.ok(imageURL(p.image,'https://example.com/')); }
});
