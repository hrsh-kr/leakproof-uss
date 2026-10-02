// Assembles public/ from src/: pages + layout, css, js, and tables generated from the project docs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGenerators, esc } from './docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public');
const PARENT = path.resolve(ROOT, '..');
const DOCS = path.join(SRC, 'docs');
const DOC_FILES = ['02_final_scope_and_decisions.md', '05_threat_model_v0.md', '06_requirements_register.md'];

// The site carries its own copy of the docs it renders, because deploying uploads only this folder.
// When the project docs are next door (local work), refresh the copy first.
function syncDocs() {
  fs.mkdirSync(DOCS, { recursive: true });
  for (const f of DOC_FILES) {
    const from = path.join(PARENT, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(DOCS, f));
    else if (!fs.existsSync(path.join(DOCS, f))) throw new Error(`missing ${f}: not in ${PARENT} and no snapshot in src/docs`);
  }
}

const NAV = [
  ['index', '/', 'Overview'],
  ['how', '/how', 'How it works'],
  ['try', '/try', 'Try it'],
  ['prototypes', '/prototypes', 'Prototypes'],
  ['research', '/research', 'Research'],
  ['requirements', '/requirements', 'Requirements'],
];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

export function build() {
  syncDocs();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyDir(path.join(SRC, 'css'), path.join(OUT, 'css'));
  copyDir(path.join(SRC, 'js'), path.join(OUT, 'js'));
  if (fs.existsSync(path.join(SRC, 'data'))) copyDir(path.join(SRC, 'data'), path.join(OUT, 'data'));

  const layout = fs.readFileSync(path.join(SRC, 'layout.html'), 'utf8');
  const gens = makeGenerators(DOCS);
  const written = [];
  for (const file of fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html'))) {
    const slug = file.replace(/\.html$/, '');
    let raw = fs.readFileSync(path.join(SRC, 'pages', file), 'utf8');
    const meta = {};
    raw = raw.replace(/^<!--\s*(\w+):\s*([\s\S]*?)-->\s*/gm, (_, k, v) => { meta[k] = v.trim(); return ''; });
    raw = raw.replace(/\{\{gen:(\w+)\}\}/g, (_, name) => {
      if (!gens[name]) throw new Error(`unknown generator ${name} in ${file}`);
      return gens[name]();
    });
    const nav = NAV.map(([s, href, label]) => `<a href="${href}"${s === slug ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
    const scripts = (meta.js || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => `<script type="module" src="/js/${s}.js"></script>`).join('\n');
    const html = layout
      .replace('{{title}}', esc(meta.title || 'LeakProof'))
      .replace('{{desc}}', esc(meta.desc || 'A leak-resistant paper exam system, prototyped for a usable security course.'))
      .replace('{{nav}}', nav)
      .replace('{{review_current}}', slug === 'review' ? ' aria-current="page"' : '')
      .replace('{{bodyclass}}', esc(meta.bodyclass || ''))
      .replace('{{content}}', raw)
      .replace('{{scripts}}', scripts);
    const leftover = /\{\{[a-z_:]+\}\}/.exec(html);
    if (leftover) throw new Error(`unresolved placeholder ${leftover[0]} in ${file}`);
    fs.writeFileSync(path.join(OUT, slug + '.html'), html);
    written.push(slug);
  }
  console.log('built', written.length, 'pages:', written.join(', '));
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
