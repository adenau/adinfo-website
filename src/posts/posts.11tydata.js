export default {
  layout: 'post.njk',
  tags: ['post'],
  eleventyComputed: {
    permalink: data => data.draft ? false : (data.permalink || `/${data.page.fileSlug}/`),
    eleventyExcludeFromCollections: data => Boolean(data.draft),
  },
};
