// SPDX-License-Identifier: Apache-2.0
// Builds dist/sfx-workbench.html: one self-contained file (CSS and bundled JS inlined) that runs from disk, offline.
// Usage: npm run build
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const bundle = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  legalComments: 'none',
  write: false,
  banner: { js: `/* SFX Workbench ${pkg.version} | Apache-2.0 | https://github.com/eigensoundlab/SFXWorkbench */` },
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(join(root, 'css/style.css'), 'utf8');
let html = await readFile(join(root, 'index.html'), 'utf8');

const cssTag = '<link rel="stylesheet" href="css/style.css">';
const jsTag = '<script type="module" src="src/main.js"></script>';
if (!html.includes(cssTag) || !html.includes(jsTag)) throw new Error('index.html no longer contains the expected stylesheet or script tag; update scripts/build.mjs.');
html = html.replace(cssTag, () => `<style>\n${css}</style>`).replace(jsTag, () => `<script>\n${js}</script>`);

await mkdir(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist/sfx-workbench.html');
await writeFile(out, html);
console.log(`Built ${out} (${(html.length / 1024).toFixed(0)} KB)`);
