import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
const errors = [];
async function htmlFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}
async function checkLink(value, route) {
  if (!value?.startsWith('/') || value.startsWith('//')) return;
  const url = new URL(value, 'https://www.adinfo.ca');
  const file = path.join('_site', decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
  try { await fs.access(file); } catch { errors.push(`${route}: missing ${value}`); }
}
const pages = await htmlFiles('_site');
for (const file of pages) {
  const page = { route: '/' + path.relative('_site', file).replaceAll('\\', '/').replace(/index\.html$/, '') };
  const $ = load(await fs.readFile(file, 'utf8'));
  if (page.route === '/rss/') { await checkLink($('a').attr('href'), page.route); continue; }
  assert.equal($('h1').length, 1, `Expected one heading on ${page.route}`);
  assert.ok($('title').text().trim(), `Missing title on ${page.route}`);
  assert.equal($('[data-ghost-search], [data-sodo-search], [data-cfemail]').length, 0);
  assert.equal($('script[src]').length, page.route === '/contact/' ? 1 : 0, 'Only the contact page needs browser JavaScript');
  assert.equal($('nav[aria-label="Main navigation"] a').length, 4);
  assert.ok($('nav[aria-label="Main navigation"] a[href="/contact/"]').length, `Missing contact CTA on ${page.route}`);
  assert.equal($('link[rel="stylesheet"]').attr('href'), '/assets/site.css');
  for (const el of $('[href], [src], [poster], [srcset]').toArray()) {
    for (const attr of ['href', 'src', 'poster']) await checkLink($(el).attr(attr), page.route);
    for (const entry of ($(el).attr('srcset') || '').split(',')) await checkLink(entry.trim().split(/\s+/)[0], page.route);
  }
  for (const el of $('img').toArray()) {
    assert.ok($(el).attr('alt') !== undefined, `Missing alt on ${page.route}`);
    assert.ok($(el).attr('src').endsWith('.webp'), `Expected WebP image on ${page.route}`);
    for (const entry of ($(el).attr('srcset') || '').split(',').filter(Boolean)) assert.ok(entry.trim().split(/\s+/)[0].endsWith('.webp'), `Non-WebP responsive image on ${page.route}`);
  }
  const logo = $('header a[aria-label="ADInfo home"] img');
  assert.equal(logo.attr('alt'), 'ADInfo');
  assert.ok(logo.attr('srcset').includes('224w'), 'Missing high-density logo');
}
const css = await fs.readFile('_site/assets/site.css', 'utf8');
assert.ok(css.includes('tailwindcss') && css.includes('.article-prose') && css.includes('.grid'), 'Compiled Tailwind styles missing');
const feed = load(await fs.readFile('_site/rss/index.xml', 'utf8'), { xml: true });
const home = load(await fs.readFile('_site/index.html', 'utf8'));
const archive = load(await fs.readFile('_site/archive/index.html', 'utf8'));
const sitemap = load(await fs.readFile('_site/sitemap.xml', 'utf8'), { xml: true });
for (const [index, item] of feed('item').toArray().entries()) {
  const route = new URL(feed(item).find('link').text()).pathname;
  if (index < 6) assert.ok(home(`a[href="${route}"]`).length, `${route} missing from homepage`);
  assert.ok(archive(`a[href="${route}"]`).length, `${route} missing from archive`);
  assert.ok(sitemap('loc').toArray().some(el => sitemap(el).text().endsWith(route)), `${route} missing from sitemap`);
}
assert.deepEqual(errors, [], errors.join('\n'));
console.log(`Verified local links, WebP images, Tailwind CSS, navigation, homepage, archive, RSS, and sitemap across ${pages.length} pages.`);
