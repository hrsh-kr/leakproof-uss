// With the shipped defaults, voice is off everywhere: no microphone buttons, no promises in the copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, click, type, text, fakeSpeech } from './dom-env.mjs';

globalThis.__LP_TEST = true;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Even in a browser that HAS speech recognition, nothing voice-related may appear.
const Rec = fakeSpeech();
setupDom('index', { speech: Rec });

const { FEATURES } = await import('../src/js/config.mjs');
const { voiceControl } = await import('../src/js/voice.js');
const { startReview } = await import('../src/js/review.js');
const { startInterview } = await import('../src/js/interview.js');
const { mountQuick } = await import('../src/js/quick.js');
const { SECTIONS, INTERVIEW } = await import('../src/js/survey-def.mjs');
const { mountQuestionForm } = await import('../src/js/qform.js');

const q = (id) => document.querySelector(`[data-q="${id}"]`);
const next = () => { click(document.querySelector('[data-nav=next]')); };
const WORDS = /\b(voice|speak|spoken|speech|microphone|dictat)/i;

test('voice is off by default', () => {
  assert.equal(FEATURES.voice, false);
  assert.equal(voiceControl(document.createElement('textarea')), null);
});

test('the review shows plain text boxes with no microphone, even where the browser supports speech', async () => {
  setupDom('review', { speech: Rec });
  startReview(document.getElementById('review-root'), { post: async () => ({ ok: true, data: { receipt: 'LP-X' } }) });
  click(document.querySelector('#consent-box')); type(q('email').querySelector('input'), 'a@example.com'); next();
  click(q('role').querySelector('input[value=other]')); click(q('device').querySelector('input[value=phone]')); next();
  assert.ok(q('model').querySelector('textarea'), 'the open question is still there');
  assert.equal(document.querySelectorAll('.mic, .mic-row').length, 0);
  assert.ok(!WORDS.test(document.body.textContent), 'no voice wording on the page');
  // the task page, the overall page, the optional pages and the finish page too
  click(q('leakwhere').querySelector('input[value=press]')); click(q('trust_before').querySelector('input[value="3"]')); click(q('accept_before').querySelector('input[value="3"]')); next();
  assert.ok(!WORDS.test(document.body.textContent), 'task page copy');
  assert.equal(document.querySelectorAll('.mic').length, 0);
});

test('the interview request and the quick comment box have no microphone either', () => {
  setupDom('interview', { speech: Rec });
  startInterview(document.getElementById('interview-root'), { post: async () => ({ ok: true, data: {} }) });
  assert.ok(q('c_when').querySelector('textarea,input'), 'the chat form still has its fields');
  assert.equal(document.querySelectorAll('.mic').length, 0);
  assert.ok(!WORDS.test(document.body.textContent));
  setupDom('index', { speech: Rec });
  const host = document.createElement('div'); document.body.append(host); mountQuick(host, 1);
  click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Not quite'));
  assert.equal(host.querySelectorAll('.mic').length, 0);
  assert.ok(host.querySelector('textarea'));
  assert.ok(!WORDS.test(host.textContent));
});

test('the question form and the whole survey definition never mention voice', () => {
  const root = document.createElement('div'); document.body.append(root); mountQuestionForm(root, {});
  assert.ok(!WORDS.test(root.textContent));
  const strings = [];
  const walk = (o) => { if (typeof o === 'string') strings.push(o); else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
  walk(SECTIONS.map((s) => ({ title: s.title, intro: s.intro, questions: s.questions }))); walk(INTERVIEW);
  const hits = strings.filter((s) => WORDS.test(s));
  assert.deepEqual(hits, [], 'survey copy must not promise voice');
});

test('built pages make no voice promises, and the site does not ask the browser for the microphone', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((x) => x.endsWith('.html'))) {
    // the decision log legitimately discusses dictation as a rejected option, so decision cards are excluded
    const body = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8').replace(/<details class="decision">[\s\S]*?<\/details>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    assert.ok(!WORDS.test(body), `${f} mentions voice`);
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const policy = cfg.headers.flatMap((h) => h.headers).find((h) => h.key === 'Permissions-Policy').value;
  assert.match(policy, /microphone=\(\)/, 'microphone is denied for the whole site');
});
