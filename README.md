# ADInfo — Eleventy

Static migration of https://www.adinfo.ca into JavaScript ES modules and Eleventy 3.1.7, following the sibling `impacts-website` project conventions. The original Ghost Casper layout, typography, responsive images, article formatting, navigation, dates, and public URLs are retained. Search is omitted as requested.

## Development

Requires Node.js 20.18.1 or newer.

```sh
npm ci
npm start
```

Open http://localhost:8080. On Windows PowerShell with restricted script execution, use `npm.cmd` instead of `npm`.

```sh
npm run build
npm run check
```

Deploy the `_site/` directory to a static host. Building and serving the site requires no Ghost server, database, or network access. The only client-side JavaScript controls the accessible mobile navigation.

## Editing

- `src/content/*.html`: editable page and article content.
- Adjacent `*.11tydata.json`: page title, URL, body classes, and original SEO head metadata.
- `src/_includes/base.11ty.js`: shared JavaScript layout.
- `src/_includes/header.html` and `footer.html`: shared navigation and footer.
- `src/assets/built/screen.css` and `src/public/cards.min.css`: original theme and content formatting.
- `src/assets/site.css` and `site.js`: focus styles, responsive video sizing, and mobile navigation.
- `src/content/images/` and `src/assets/vendor/`: local images, including all responsive variants and the original Unsplash photography.
- `src/rss/index.xml`: preserved RSS feed; update this when publishing new articles.

The seven imported routes cover the homepage, About, Privacy Policy, all three published leadership articles, and Alexandre Denault's author archive. `migration-report.json` records the complete route and asset inventory. The sitemap is generated from that inventory; add new routes there when adding pages.

## Migration and verification

`sources/` preserves the public HTML, sitemaps, and RSS downloaded on October 23, 2026. The importer discovers pages through all published sitemaps and internal links, downloads CSS dependencies and responsive images, and separates page bodies from the shared Eleventy layout. Original theme licensing comments are retained.

`npm run import` regenerates imported files using cached snapshots and assets. **It overwrites edits to imported content and shared navigation.** Missing downloads require internet access and Windows `curl.exe`. `npm run import -- --refresh` also refreshes the source snapshots and assets from the live website.

The verification command compares all visible main-content text and page titles against the snapshots, checks internal links and local assets (including srcset and CSS references), confirms search is absent, and checks the three-item RSS feed. Visual browser comparison could not be performed because no connected browser was available in the migration session.

Ghost search, remote analytics, jQuery, and Ghost runtime scripts have been removed. The footer credits Eleventy. Cloudflare-obscured public contact emails are decoded into working `mailto:` links at import time. External links remain external. RSS is served as `/rss/index.xml` for the correct XML MIME type on static hosts; `/rss/` forwards readers there. The feed is a source snapshot, not automatically regenerated from future edits.
