import fs from 'node:fs';
export default class {
  data() { return { permalink: '/sitemap.xml', eleventyExcludeFromCollections: true }; }
  render() {
    const { pages } = JSON.parse(fs.readFileSync('migration-report.json', 'utf8'));
    return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + pages.map(page => `<url><loc>https://www.adinfo.ca${page.route}</loc></url>`).join('') + '</urlset>';
  }
}
