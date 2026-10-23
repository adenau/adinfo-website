import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { decodeEmails } from './email.mjs';

const report = JSON.parse(await fs.readFile('migration-report.json', 'utf8'));
const errors = [];
const text = $ => $('.site-content').text().replace(/\s+/g, ' ').trim();
async function checkLink(value, route) {
  if (!value?.startsWith('/') || value.startsWith('//')) return;
  const url = new URL(value, 'https://www.adinfo.ca');
  const file = path.join('_site', decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
  try { await fs.access(file); } catch { errors.push(`${route}: missing ${value}`); }
}
for (const page of report.pages) {
  const original = load(await fs.readFile(`sources/${page.slug}.html`, 'utf8'));
  decodeEmails(original);
  const $ = load(await fs.readFile(path.join('_site', page.route, 'index.html'), 'utf8'));
  assert.equal(text($), text(original), `Content changed on ${page.route}`);
  assert.equal($('title').text(), original('title').text());
  assert.equal($('[data-ghost-search], [data-sodo-search], [data-cfemail]').length, 0);
  assert.equal($('script[src]').length, 1, 'Only the local menu script should execute');
  for (const el of $('[href], [src], [poster], [srcset]').toArray()) {
    for (const attr of ['href', 'src', 'poster']) await checkLink($(el).attr(attr), page.route);
    for (const entry of ($(el).attr('srcset') || '').split(',')) await checkLink(entry.trim().split(/\s+/)[0], page.route);
  }
  for (const el of $('img').toArray()) assert.ok($(el).attr('alt') !== undefined, `Missing alt on ${page.route}`);
}
for (const local of Object.values(report.assets)) {
  await checkLink(local, 'asset inventory');
  if (local.endsWith('.css')) {
    const css = await fs.readFile(`_site${local}`, 'utf8');
    for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) await checkLink(match[1], local);
  }
}
const feed = load(await fs.readFile('_site/rss/index.xml', 'utf8'), { xml: true });
assert.equal(feed('item').length, 3);
assert.deepEqual(errors, [], errors.join('\n'));
console.log(`Verified exact content text, titles, local links, responsive images, CSS dependencies, absence of search, and RSS across ${report.pages.length} pages / ${Object.keys(report.assets).length} assets.`);
