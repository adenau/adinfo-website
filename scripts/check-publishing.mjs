// Exercise the actual Markdown publishing workflow in an isolated output directory.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const published = 'src/posts/publishing-check.md';
const draft = 'src/posts/draft-check.md';
const output = '.cache/publishing-check';
for (const file of [published, draft]) assert.equal(await fs.stat(file).catch(() => null), null, `Fixture already exists: ${file}`);
try {
  const content = title => `---\ntitle: ${title}\ndescription: Publishing verification\ndate: 2026-10-23\nimage: /content/images/2022/09/logo-large-5.jpg\n`;
  await fs.writeFile(published, content('Publishing fixture') + '---\n\nA new Markdown article.\n');
  await fs.writeFile(draft, content('Private draft fixture') + 'draft: true\n---\n\nUnpublished text.\n');
  execFileSync(process.execPath, ['node_modules/@11ty/eleventy/cmd.cjs', '--output=' + output], { stdio: 'inherit' });
  for (const file of ['index.html', 'archive/index.html', 'author/alexandre/index.html', 'rss/index.xml', 'sitemap.xml']) {
    const text = await fs.readFile(`${output}/${file}`, 'utf8');
    assert.ok(text.includes('/publishing-check/'), `New post missing from ${file}`);
    assert.ok(!text.includes('/draft-check/') && !text.includes('Private draft fixture'), `Draft leaked into ${file}`);
  }
  assert.ok((await fs.readFile(`${output}/publishing-check/index.html`, 'utf8')).includes('A new Markdown article.'));
  assert.equal(await fs.stat(`${output}/draft-check/index.html`).catch(() => null), null);
  console.log('Verified that new Markdown posts publish automatically and drafts generate no page or listing.');
} finally {
  await fs.unlink(published).catch(() => {});
  await fs.unlink(draft).catch(() => {});
  const cacheRoot = path.resolve('.cache');
  const testOutput = path.resolve(output);
  assert.equal(path.dirname(testOutput), cacheRoot, 'Test output must stay inside the cache directory');
  await fs.rm(testOutput, { recursive: true, force: true });
}
