// The standalone pipeline export: every file the page needs is in the folder, nothing points outside it, and it really runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { exportPipeline } from '../scripts/export-pipeline.mjs';

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-export-')), 'leakproof-pipeline');
const { zip } = exportPipeline(out);

test('export: one page, its stylesheets and scripts, a README, and a zip', () => {
  for (const f of ['index.html', 'css/base.css', 'css/pipeline.css', 'js/pipeline.js', 'js/pipeline-core.mjs', 'js/exam-bank.mjs', 'js/logic.mjs', 'js/dom.js', 'README.md', 'vercel.json']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.ok(fs.statSync(zip).size > 10000, 'the zip has content');
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.equal((html.match(/<h1>/g) || []).length, 1); assert.match(html, /id="pipeline-root"/); assert.match(html, /class="pl-page"/);
  assert.ok(!/\/css\/|\/js\//.test(html.replace(/(href|src)="(css|js)\//g, '')), 'all links are relative, so it works at any URL');
});

test('export: every import resolves inside the folder, and nothing reaches the network or the rest of the site', () => {
  for (const f of fs.readdirSync(path.join(out, 'js'))) {
    const src = fs.readFileSync(path.join(out, 'js', f), 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) assert.ok(fs.existsSync(path.join(out, 'js', m[1])), `${f} imports ${m[1]}`);
    assert.ok(!/https?:\/\/|fetch\(|\/api\//.test(src.replace(/^\s*\/\/.*$/gm, '').replace('http://www.w3.org/2000/svg', '')), `${f} makes no network calls (the SVG namespace is just a name)`);
  }
});

test('export: the exported page actually runs: step 1 completes from the exported files alone', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(out, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/, ''), { url: 'http://localhost/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const k of ['window', 'document', 'localStorage', 'matchMedia', 'Event', 'HTMLElement']) Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
  globalThis.__LP_TEST = true;
  const { mountPipeline } = await import(path.join(out, 'js', 'pipeline.js'));
  mountPipeline(document.getElementById('pipeline-root'), { fast: true });
  document.querySelector('[data-step=banks]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const end = Date.now() + 3000; while (Date.now() < end && !document.querySelector('.pl-step.done')) await new Promise((r) => setTimeout(r, 10));
  assert.ok(document.querySelector('.pl-step.done'), 'step 1 ran');
  assert.equal(document.querySelectorAll('.pl-files .pl-file').length, 10);
});
