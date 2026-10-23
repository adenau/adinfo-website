import fs from 'node:fs';
import { load } from 'cheerio';

export default class {
  render(data) {
    const $ = load(fs.readFileSync('src/_includes/header.html', 'utf8'), null, false);
    $('.nav li').removeClass('nav-current');
    $('.nav a').each((i, el) => {
      if ($(el).attr('href') === data.permalink) $(el).parent().addClass('nav-current');
    });
    return `<!DOCTYPE html><html lang="en"><head>${data.head}</head><body class="${data.bodyClass}"><div class="viewport">${$.html()}<div class="site-content">${data.content}</div>${fs.readFileSync('src/_includes/footer.html', 'utf8')}</div><script src="/assets/site.js" defer></script></body></html>`;
  }
}
