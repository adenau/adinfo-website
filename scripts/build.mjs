import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const output = path.resolve(root, '_site');
if (output !== path.join(root, '_site') || path.dirname(output) !== root) throw new Error('Invalid build directory');
// Remove only generated output so deleted posts and former drafts cannot linger.
await fs.rm(output, { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/@11ty/eleventy/cmd.cjs'], { stdio: 'inherit' });
