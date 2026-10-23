import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { decodeEmails } from './email.mjs';

const origin = 'https://www.adinfo.ca';
const refresh = process.argv.includes('--refresh');
await fs.mkdir('sources', { recursive: true });
await fs.mkdir('src/content', { recursive: true });
await fs.mkdir('src/_includes', { recursive: true });
const get = async (url, file) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (!refresh && await fs.stat(file).catch(() => false)) return;
  execFileSync('curl.exe', ['--fail', '--silent', '--show-error', '--location', '--retry', '2', url, '-o', file]);
};
const routes = new Set(['/']);
async function sitemap(url) {
  const file = `sources/${new URL(url).pathname.split('/').pop()}`;
  await get(url, file);
  const $ = load(await fs.readFile(file, 'utf8'), { xml: true });
  for (const el of $('sitemap > loc').toArray()) await sitemap($(el).text());
  for (const el of $('url > loc').toArray()) routes.add(new URL($(el).text()).pathname);
}
await sitemap(`${origin}/sitemap.xml`);
const assets = new Map();
async function asset(value, base = origin) {
  if (!value || /^(data:|#|blob:)/.test(value)) return value;
  const url = new URL(value, base);
  if (assets.has(url.href)) return assets.get(url.href);
  const local = url.hostname === 'www.adinfo.ca' ? decodeURIComponent(url.pathname) : `/assets/vendor/${createHash('sha256').update(url.href).digest('hex').slice(0,16)}${path.extname(url.pathname) || '.jpg'}`;
  assets.set(url.href, local);
  await get(url.href, `src${local}`);
  if (local.endsWith('.css')) {
    let css = await fs.readFile(`src${local}`, 'utf8');
    const refs = [...css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)];
    for (const ref of refs) {
      if (ref[1].startsWith('data:') || ref[1].startsWith('#')) continue;
      const target = await asset(ref[1], url.href);
      css = css.replace(ref[0], `url("${target}")`);
    }
    await fs.writeFile(`src${local}`, css);
  }
  return local;
}
const pages = [];
for (const route of routes) {
  const slug = route === '/' ? 'home' : route.split('/').filter(Boolean).join('--');
  await get(`${origin}${route}`, `sources/${slug}.html`);
  const $ = load(await fs.readFile(`sources/${slug}.html`, 'utf8'));
  decodeEmails($);
  $('link[type="application/rss+xml"]').attr('href', '/rss/index.xml');
  // Ghost search and analytics depend on remote services; this site has no search.
  $('[data-ghost-search], script[data-sodo-search], script[data-domain], link[rel="webmention"], meta[name="generator"]').remove();
  $('link[rel="preload"][as="script"]').remove();
  for (const el of $('script').toArray()) {
    if ($(el).attr('type') !== 'application/ld+json') $(el).remove();
  }
  for (const el of $('a[href]').toArray()) {
    const value = $(el).attr('href');
    const url = new URL(value, `${origin}${route}`);
    if (url.origin === origin) {
      $(el).attr('href', url.pathname + url.search + url.hash);
      if (url.pathname.endsWith('/') && !/^\/(ghost|members|webmentions)\//.test(url.pathname)) routes.add(url.pathname);
    }
  }
  for (const el of $('img[src], source[src], video[src], video[poster], audio[src], link[rel="stylesheet"], link[rel="icon"], link[rel="preload"][as="style"]').toArray()) {
    const attr = el.name === 'link' ? 'href' : $(el).attr('poster') ? 'poster' : 'src';
    $(el).attr(attr, await asset($(el).attr(attr)));
  }
  for (const el of $('[srcset]').toArray()) {
    const entries = $(el).attr('srcset').split(',');
    const rewritten = [];
    for (const entry of entries) {
      const [url, descriptor] = entry.trim().split(/\s+/);
      rewritten.push(`${await asset(url)} ${descriptor || ''}`.trim());
    }
    $(el).attr('srcset', rewritten.join(', '));
  }
  for (const el of $('[style]').toArray()) {
    let style = $(el).attr('style');
    for (const ref of [...style.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)]) style = style.replace(ref[0], `url('${await asset(ref[1])}')`);
    $(el).attr('style', style);
  }
  $('.gh-powered-by a').attr('href', 'https://www.11ty.dev/').text('Powered by Eleventy');
  $('.gh-burger').attr('aria-expanded', 'false').attr('aria-controls', 'main-navigation');
  $('.gh-head-menu').attr('id', 'main-navigation');
  $('head').append('<link rel="stylesheet" href="/assets/site.css">');
  $('body').append('<script src="/assets/site.js" defer></script>');
  const title = $('title').text();
  const content = $('.site-content').html();
  if (!content) throw new Error(`No site content at ${route}`);
  const data = { layout: 'base.11ty.js', title, permalink: route, head: $('head').html(), bodyClass: $('body').attr('class') || '' };
  await fs.writeFile(`src/content/${slug}.html`, content);
  await fs.writeFile(`src/content/${slug}.11tydata.json`, JSON.stringify(data, null, 2));
  if (route === '/') {
    // The layout updates the navigation's active item for each route.
    await fs.writeFile('src/_includes/header.html', $.html($('#gh-head')));
    await fs.writeFile('src/_includes/footer.html', $.html($('.site-footer')));
  }
  pages.push({ route, slug, title });
  console.log(`Imported ${route}`);
}
await get(`${origin}/rss/`, 'sources/rss.xml');
await fs.mkdir('src/rss', { recursive: true });
await fs.copyFile('sources/rss.xml', 'src/rss/index.xml');
await fs.writeFile('migration-report.json', JSON.stringify({ source: origin, pages, assets: Object.fromEntries(assets), failures: [] }, null, 2));
console.log(`Imported ${pages.length} pages and ${assets.size} assets.`);
