// Build : bundle TypeScript + Preact + CSS + polices en UNE page HTML autonome.
//   dist/index.html     → document complet, jouable hors-ligne (double-clic)
//   dist/artifact.html  → même contenu sans <html>/<head>/<body> (publication claude.ai)
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');

const result = await esbuild.build({
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  minify: !dev,
  sourcemap: false,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.woff2': 'dataurl', '.css': 'text', '.json': 'json' },
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  legalComments: 'none',
  logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const title = 'Mille Vies';
const head = `<title>${title}</title>
<meta name="description" content="Moteur de jeux narratifs 2D pixel art : vivez des centaines de vies, vos choix changent votre destin.">
<style>:root{color-scheme:dark;background:#0b0d14}html,body{height:100%;margin:0;background:#0b0d14;overflow:hidden}#app{position:fixed;inset:0}</style>`;
const bodyContent = `<div id="app"></div>
<script>${js}</script>`;

mkdirSync(join(root, 'dist'), { recursive: true });
const full = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${head}
</head>
<body>
${bodyContent}
</body>
</html>
`;
writeFileSync(join(root, 'dist/index.html'), full);
writeFileSync(join(root, 'dist/artifact.html'), `${head}\n${bodyContent}\n`);
const kb = (Buffer.byteLength(full) / 1024).toFixed(0);
console.log(`✔ dist/index.html (${kb} Ko) + dist/artifact.html`);
