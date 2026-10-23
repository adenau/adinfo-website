# ADInfo — Eleventy + Tailwind

A custom editorial blog built with Eleventy 3, Tailwind CSS 4, and the Tailwind Typography plugin. The design uses a white background, charcoal text, navy-blue accents sampled from the original ADInfo logo (#020065), and image-led article cards. It does not use paid template source code. The content structure follows the sibling `stormtome-v3/blog`: Markdown posts, shared Nunjucks layouts, and generated collections.

## Run locally

Requires Node.js 22 or newer (Eleventy Image 7 requirement).

```powershell
npm.cmd ci
npm.cmd start
```

Open http://localhost:8080. If a previous preview is running, stop it with Ctrl+C and restart after dependency or configuration changes. Edits to Markdown, templates, and Tailwind styles rebuild automatically.

```powershell
npm.cmd run build
npm.cmd run check
npm.cmd run check:publishing
```

The production build cleans old output before compiling. There is no Ghost, database, browser framework, search, or external font dependency. Navigation is always available at small widths without a JavaScript menu. The contact page uses a small browser script and a Cloudflare Worker; publishing `_site/` alone does not enable email delivery.

## Contact form and Cloudflare Worker

Every page includes a contact call to action linking to `/contact/`. The form collects name, reply email, optional company, and message. The Worker validates submissions and Turnstile tokens, then calls Resend. It sends from **ADInfo <noreply@email.adinfo.ca>** to **alex@adinfo.ca**, with the visitor's email as **Reply-To**. It does not send autoresponders or store submissions in a database.

### Run the complete site locally

1. Copy `.dev.vars_example` to `.dev.vars` in the project root.
2. Set `RESEND_API_KEY` in `.dev.vars`. Verify **email.adinfo.ca** in Resend and add the DNS records Resend provides. The example's sender and recipient are already set.
3. For local use, keep the official Turnstile testing keys in the example.
4. Run:

```powershell
npm.cmd run dev:worker
```

Open **http://127.0.0.1:8787/contact/**. The command builds Eleventy and starts Wrangler with static assets and the API. Restart it after editing templates/content, or run `npm.cmd run build` in another terminal. Worker code reloads through Wrangler.

Submitting with a real Resend key sends a real email, even in local development. The example key is a placeholder, so the form remains disabled until you configure it. `npm.cmd start` still provides the fast static preview at port 8080, but its form cannot send because Eleventy's server does not run the Worker. LinkedIn remains available as an alternative.

### Production setup

This project deploys as a **Worker with Static Assets**, using `wrangler.jsonc`. Static pages and images are served directly; `/api/*` requests run the Worker. No paid Cloudflare Email Sending feature is used: Resend handles delivery.

1. Verify the sending subdomain **email.adinfo.ca** in Resend and obtain a sending API key.
2. Create a Cloudflare Turnstile widget allowing your production hostname(s), including `www.adinfo.ca` if used. Obtain its real site key and secret key. The Worker checks the token hostname and `contact` action. Test keys are rejected outside localhost.
3. Authenticate Wrangler with `npx.cmd wrangler login`.
4. Store the API key and Turnstile secret as Worker secrets, entering their values at the prompts. Store the public site key the same way for convenient runtime configuration:

```powershell
npx.cmd wrangler secret put RESEND_API_KEY
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY
npx.cmd wrangler secret put TURNSTILE_SITE_KEY
```

Wrangler may offer to create the named Worker if it does not exist. Secret commands can create a deployment/version; run them when ready to configure the production Worker. Sender and recipient are non-secret settings already in `wrangler.jsonc`.

5. Deploy with `npm.cmd run deploy`, then connect your custom domain to this Worker in Cloudflare. Deployment is intentionally a manual step; this repository has not been deployed by the implementation task.

Local `.dev.vars` values are not uploaded by deployment. Configure the production secrets separately. Never place credentials under `src/`, `_site/`, or in public client JavaScript. `.dev.vars`, `.env`, and their environment variants are ignored by Git; `.dev.vars_example` contains only placeholders and public test credentials.

### Contact checks

```powershell
npm.cmd run check:worker
```

The tests mock Cloudflare and Resend: they send no email. They cover sender/recipient restrictions, Reply-To, spam verification, request size and field validation, missing configuration, rejected test keys in production, and provider failures. Live delivery requires your credentials and verified domain.

## Write an article

Create `src/posts/my-new-article.md`:

```markdown
---
title: "A new perspective"
description: "A short summary for the homepage, social metadata, and RSS."
date: 2026-10-23
topic: Leadership
image: /content/images/my-cover.jpg
imageAlt: "Describe the cover image"
draft: false
---

Your article goes here. Use ordinary **Markdown**.

## A section heading

> A useful takeaway or callout.
```

Put its image in `src/content/images/`. The default URL is `/my-new-article/`; set `permalink` to override it. Existing article URLs are explicitly preserved. `draft: true` excludes a post from generated pages and listings, including during local preview. The publication date controls ordering; future-dated posts are not scheduled automatically.

The homepage shows the six newest published posts. The archive and author page show all posts. RSS, the sitemap, and reading times update automatically during every build. No manual inventory changes are needed. RSS contains article summaries and links; `/rss/` forwards to `/rss/index.xml`.

## Project structure

- `src/posts/*.md`: articles and their front matter.
- `src/pages/*.md`: About and Privacy content.
- `src/_includes/base.njk`: document head, navigation, and footer.
- `src/_includes/post.njk`, `page.njk`, `card.njk`: content layouts.
- `src/index.njk`: introduction, latest posts, and contact section.
- `src/_data/site.js`: name, description, author, and contact details.
- `src/styles/tailwind.css`: Tailwind entry point, colors, typography, and custom styles.
- `src/feed.njk`, `sitemap.njk`: generated publishing metadata.
- `src/content/images/`, `src/assets/vendor/`: local photography.
- `src/contact.njk`, `src/assets/contact.js`: contact form and client behavior.
- `worker/index.js`: static-asset fallback, public Turnstile configuration, and email API.
- `wrangler.jsonc`, `.dev.vars_example`: deployment configuration and local configuration example.

Tailwind compiles automatically through Eleventy's build hook into `.cache/site.css`, then copies it to `_site/assets/site.css`. Tailwind scans the templates and page content; add an `@source` entry if introducing utility classes elsewhere.

## Verification

Run npm.cmd run check after building to verify local links and assets, WebP output, navigation, Tailwind styles, homepage listings, RSS, and the sitemap. The checks use the current built site and require no migration snapshots.

The publishing check temporarily adds a published Markdown post and a draft, verifies automatic listing and draft exclusion in an isolated build, then removes its fixtures and generated output.

## Image delivery

The original ADInfo logo appears in the top-left header at 96px wide on mobile and 112px on larger screens, with 2x/3x variants. Eleventy Image generates responsive WebP versions of all rendered images, including images written directly in Markdown. Keep adding source JPG/PNG files as usual: no manual conversion is needed. Original files remain available for social metadata and compatibility; visible pages request WebP. Article cards use smaller image variants than full-width covers.
