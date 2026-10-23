import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { load } from 'cheerio';
import { eleventyImageTransformPlugin } from '@11ty/eleventy-img';

export default function (config) {
  config.addPlugin(eleventyImageTransformPlugin, {
    formats: ['webp'],
    widths: [480, 800, 1200, 1600],
    urlPath: '/assets/images/',
    sharpWebpOptions: { quality: 82 },
    htmlOptions: {
      imgAttributes: {
        decoding: 'async',
        sizes: '(max-width: 768px) calc(100vw - 48px), (max-width: 1152px) calc(100vw - 96px), 1056px',
      },
    },
  });
  config.on('eleventy.before', () => {
    fs.mkdirSync('.cache', { recursive: true });
    execFileSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs', '-i', 'src/styles/tailwind.css', '-o', '.cache/site.css', '--minify'], { stdio: 'inherit' });
  });
  config.addPassthroughCopy({ '.cache/site.css': 'assets/site.css' });
  config.addPassthroughCopy('src/assets/vendor');
  config.addPassthroughCopy('src/assets/contact.js');
  config.addPassthroughCopy('src/content/images');
  config.addPassthroughCopy('src/robots.txt');
  config.addWatchTarget('src/styles');
  config.addCollection('posts', api => api.getFilteredByTag('post').filter(post => !post.data.draft).sort((a, b) => b.date - a.date));
  config.addFilter('readableDate', date => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date)));
  config.addFilter('isoDate', date => new Date(date).toISOString());
  config.addFilter('rssDate', date => new Date(date).toUTCString());
  config.addFilter('readingTime', html => `${Math.max(1, Math.ceil(load(html || '').text().split(/\s+/).length / 220))} min read`);
  config.addFilter('absolute', value => new URL(value || '/', 'https://www.adinfo.ca').href);
  config.addFilter('xml', value => String(value ?? '').replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]));
  config.addFilter('limit', (items, count) => items.slice(0, count));
  config.addGlobalData('buildYear', () => new Date().getUTCFullYear());
  return { dir: { input: 'src', output: '_site' }, templateFormats: ['md', 'njk', 'html'], markdownTemplateEngine: false, htmlTemplateEngine: false };
}
