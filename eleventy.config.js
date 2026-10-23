export default function (config) {
  config.addPassthroughCopy('src/assets');
  config.addPassthroughCopy('src/content/images');
  config.addPassthroughCopy('src/public');
  config.addPassthroughCopy('src/rss/index.xml');
  config.addPassthroughCopy('src/robots.txt');
  config.addWatchTarget('src/_includes');
  return { dir: { input: 'src', output: '_site' }, templateFormats: ['html', '11ty.js'], htmlTemplateEngine: false };
}
