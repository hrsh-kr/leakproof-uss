// Builds a self-contained copy of just the pipeline panel, ready to drop on any static host (Vercel, Netlify, GitHub Pages).
// Usage: node scripts/export-pipeline.mjs [outDir]   ->  writes the folder and a .zip next to it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const JS = ['pipeline.js', 'pipeline-core.mjs', 'exam-bank.mjs', 'logic.mjs', 'dom.js'];

const BASE_CSS = `/* Minimal base for the standalone pipeline panel (the full site has its own). */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.47 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
h1, h2, h3, p, ol, dl, dd { margin: 0; }
h1, h2, h3 { line-height: 1.15; letter-spacing: -0.02em; font-weight: 600; }
a { color: var(--accent); }
button, input { font-family: inherit; }
.muted { color: var(--muted); }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: .82em; }
.hp { position: absolute; left: -9999px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
`;

export function exportPipeline(outDir = path.join(ROOT, 'dist-pipeline')) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'js'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'css'), { recursive: true });
  for (const f of JS) fs.copyFileSync(path.join(SRC, 'js', f), path.join(outDir, 'js', f));
  fs.copyFileSync(path.join(SRC, 'css', 'pipeline.css'), path.join(outDir, 'css', 'pipeline.css'));
  fs.writeFileSync(path.join(outDir, 'css', 'base.css'), BASE_CSS);
  const body = fs.readFileSync(path.join(SRC, 'pages', 'pipeline.html'), 'utf8')
    .replace(/^<!--[\s\S]*?-->\s*/gm, '').replace(/<link rel="stylesheet" href="\/css\/pipeline.css">\s*/, '').replace(/<noscript>[\s\S]*?<\/noscript>\s*/, '');
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Build the pipeline</title>
<meta name="description" content="Click through eight steps and watch a sample university exam paper get drawn, encrypted, split between five officials and printed.">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/pipeline.css">
</head>
<body class="pl-page">
<noscript><p style="padding:16px">This page needs JavaScript.</p></noscript>
${body.trim()}
<script type="module" src="js/pipeline.js"></script>
</body>
</html>
`);
  fs.writeFileSync(path.join(outDir, 'vercel.json'), JSON.stringify({ cleanUrls: true }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), `# Build the pipeline (standalone panel)

A click-by-click demo of a leak-resistant exam pipeline: random draw, encrypt (AES-256-GCM), split key (Shamir 3 of 5), hand out keys, unlock with 3 officials, print per seat. Sample data only. No build step, no dependencies, no backend, nothing is stored.

## Put it on Vercel
1. Drag this folder onto vercel.com/new (or run \`npx vercel\` inside it).
2. Framework preset: **Other**. Build command: leave empty. Output directory: leave empty (the root).
3. Open the URL it gives you.

It also works on Netlify, GitHub Pages, or locally: \`npx serve .\` (browsers block ES modules from file://, so use a server).

## Files
- \`index.html\`: the page
- \`js/pipeline.js\`: the screen and animations. \`js/pipeline-core.mjs\`: the pipeline steps (real crypto). \`js/exam-bank.mjs\`: the 100 sample questions. \`js/logic.mjs\`: Shamir, AES-GCM, hash chain. \`js/dom.js\`: tiny helpers.
- \`css/pipeline.css\`, \`css/base.css\`: styles
`);
  const zip = outDir.replace(/\/$/, '') + '.zip';
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', path.basename(zip), path.basename(outDir)], { cwd: path.dirname(outDir) });
  return { outDir, zip };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = exportPipeline(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log('exported', r.outDir, '\nzip     ', r.zip);
}
