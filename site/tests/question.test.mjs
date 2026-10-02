import test from 'node:test';
import assert from 'node:assert/strict';
import { formatQuestion, cleanQuestionText, cleanOptionText, PRESETS, pickPreset, LIMITS } from '../src/js/question.mjs';
import { createPaper, SAMPLES } from '../src/js/paper.js';
import LP from '../src/js/logic.mjs';

const ok = (q, o, c) => formatQuestion({ question: q, options: o, correct: c });

test('a clean question and four options register as typed', () => {
  const r = ok('Which unit measures electric current?', ['volt', 'ampere', 'ohm', 'watt'], 1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { text: 'Which unit measures electric current?', options: ['volt', 'ampere', 'ohm', 'watt'], correct: 1 });
  assert.equal(r.display, 'Which unit measures electric current?\na) volt\nb) ampere\nc) ohm\nd) watt');
});

test('auto-format: spacing, capital letter, question mark, numbering and option labels', () => {
  const r = ok('  q1.   what   is the capital of france ', ['  a) London', 'b. Paris ', '(c) Rome', 'D)Berlin'], '1');
  assert.equal(r.ok, true);
  assert.equal(r.value.text, 'What is the capital of france?');
  assert.deepEqual(r.value.options, ['London', 'Paris', 'Rome', 'Berlin']);
  assert.equal(r.value.correct, 1);
  assert.equal(cleanQuestionText('3) how many legs does a spider have'), 'How many legs does a spider have?');
  assert.equal(cleanQuestionText('Question 2: Water boils at ____ degrees'), 'Water boils at ____ degrees');
  assert.equal(cleanQuestionText('Name the largest ocean'), 'Name the largest ocean?');
  assert.equal(cleanOptionText('1) one'), 'one');
  assert.equal(cleanOptionText('a. apple'), 'apple');
  assert.equal(cleanOptionText('Alpha'), 'Alpha', 'a word starting with a letter is not a label');
  assert.equal(cleanOptionText('A. Alpha'), 'Alpha');
});

test('a statement that is not a question does not get a question mark', () => {
  assert.equal(cleanQuestionText('the sum of angles in a triangle is'), 'The sum of angles in a triangle is');
  assert.equal(cleanQuestionText('Is water wet?'), 'Is water wet?');
});

test('empty or short questions and empty options are explained field by field', () => {
  const r = ok('', ['', 'b', '', 'd']);
  assert.equal(r.ok, false);
  assert.match(r.errors.question, /Write the question/);
  assert.match(r.errors.options[0], /Option A is empty/);
  assert.equal(r.errors.options[1], null);
  assert.match(r.errors.options[2], /Option C is empty/);
  assert.equal(r.value, null);
  assert.match(ok('Why?', ['a1', 'b2', 'c3', 'd4']).errors.question, /short/);
});

test('duplicate options (ignoring case and labels) are flagged on the later one', () => {
  const r = ok('Which one is the odd one out?', ['Mars', 'mars', 'Venus', 'b) Venus']);
  assert.equal(r.ok, false);
  assert.equal(r.errors.options[0], null);
  assert.match(r.errors.options[1], /Same as option A/);
  assert.match(r.errors.options[3], /Same as option C/);
});

test('length limits hold, and an invalid correct answer is refused', () => {
  assert.match(ok('x'.repeat(LIMITS.question + 1), ['a', 'b', 'c', 'd']).errors.question, /under 200/);
  assert.match(ok('Which is longer than allowed?', ['a'.repeat(81), 'b', 'c', 'd']).errors.options[0], /under 80/);
  for (const bad of [4, -1, 1.5, 'x']) assert.match(ok('Which is the right one?', ['a', 'b', 'c', 'd'], bad).errors.general, /correct answer/, String(bad));
  assert.equal(ok('Which is the right one?', ['a', 'b', 'c', 'd'], null).value.correct, null);
  assert.equal(ok('Which is the right one?', ['a', 'b', 'c', 'd'], '').value.correct, null);
  assert.equal(ok('Which is the right one?', ['a', 'b', 'c', 'd'], 0).value.correct, 0);
});

test('hostile or odd input never throws and is kept as plain text', () => {
  for (const q of [undefined, null, 42, {}, '<script>alert(1)</script> which one?', '\u0000\u0001 which', '😀 which emoji is this?']) {
    const r = formatQuestion({ question: q, options: [undefined, null, 5, '<b>x</b>'] });
    assert.equal(typeof r.ok, 'boolean');
  }
  assert.equal(formatQuestion(undefined).ok, false);
  assert.equal(formatQuestion({ question: 'Which is it?', options: 'not an array' }).ok, false);
  const r = ok('What does <b>bold</b> do?', ['<i>x</i>', 'y', 'z', 'w']);
  assert.equal(r.ok, true);
  assert.equal(r.value.options[0], '<i>x</i>', 'kept literally; the page inserts it as text, never as HTML');
});

test('every preset is itself a valid question with a correct answer that exists', () => {
  assert.ok(PRESETS.length >= 6);
  for (const p of PRESETS) {
    const r = ok(p.question, p.options, p.correct);
    assert.equal(r.ok, true, p.id);
    assert.equal(r.value.text, p.question, `${p.id} is already in final form`);
    assert.ok(p.correct >= 0 && p.correct <= 3);
  }
  assert.equal(new Set(PRESETS.map((p) => p.question)).size, PRESETS.length);
});

test('pickPreset avoids questions already on the paper', () => {
  const used = SAMPLES.map((s) => s.text);
  for (let i = 0; i < 20; i++) assert.ok(!used.includes(pickPreset(used, i / 20).question));
  assert.ok(pickPreset(PRESETS.map((p) => p.question), 0.5).question, 'falls back when everything is used');
});

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test('demo paper: starts with four samples, adding puts the new question first and keeps four', () => {
  const st = memStore(); const p = createPaper(st);
  assert.equal(p.get().length, 4);
  assert.equal(p.isCustom(), false);
  const seen = [];
  p.onChange((x) => seen.push(x.length));
  p.add({ text: 'My own question?', options: ['a', 'b', 'c', 'd'], correct: 2 });
  const now = p.get();
  assert.equal(now.length, 4);
  assert.equal(now[0].text, 'My own question?');
  assert.equal(now[0].correct, 2);
  assert.equal(now[3].text, SAMPLES[2].text, 'the oldest sample was pushed out');
  assert.equal(p.isCustom(), true);
  assert.deepEqual(seen, [4]);
  assert.equal(createPaper(st).get()[0].text, 'My own question?', 'survives a reload through storage');
  p.reset();
  assert.equal(p.isCustom(), false);
});

test('demo paper: invalid questions are refused and corrupt storage falls back to samples', () => {
  const p = createPaper(memStore());
  assert.throws(() => p.add({ text: 'x', options: ['a', 'b'] }));
  assert.throws(() => p.add(null));
  const bad = memStore(); bad.setItem('lp-demo-paper-v1', '{"not":"a paper"}');
  assert.equal(createPaper(bad).get()[0].text, SAMPLES[0].text);
  const worse = memStore(); worse.setItem('lp-demo-paper-v1', 'not json');
  assert.equal(createPaper(worse).get().length, 4);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const t = createPaper(throwing);
  t.add({ text: 'Still works without storage?', options: ['a', 'b', 'c', 'd'] });
  assert.equal(t.get()[0].text, 'Still works without storage?');
});

test('answer key follows the shuffled options, so every copy has its own correct letters', () => {
  const paper = SAMPLES;
  let differing = 0;
  for (let seat = 1; seat <= 200; seat++) {
    const copy = LP.copyFor('leakproof-demo-exam-2026', seat);
    const key = LP.answerKeyFor(copy, paper);
    copy.order.forEach((qi, pos) => {
      const letter = 'abcd'.indexOf(key[pos]);
      const shownOption = paper[qi].options[copy.optionOrders[pos][letter]];
      assert.equal(shownOption, paper[qi].options[paper[qi].correct], `seat ${seat} pos ${pos}`);
    });
    if (key.join('') !== LP.answerKeyFor(LP.copyFor('leakproof-demo-exam-2026', 1), paper).join('')) differing++;
  }
  assert.ok(differing > 150, 'keys must differ between copies');
  assert.deepEqual(LP.answerKeyFor(LP.copyFor('x', 1), [{ correct: null }, { correct: null }, { correct: null }, { correct: null }]), [null, null, null, null]);
});
