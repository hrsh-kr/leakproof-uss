// Turns the question form (one question field, four option fields) into a clean, registered question.
// Pure functions, no DOM, so they can be tested.

export const LIMITS = { question: 200, option: 80, minQuestion: 8 };
export const LETTERS = ['a', 'b', 'c', 'd'];
const INTERROGATIVE = /^(what|which|who|whom|whose|when|where|why|how|is|are|was|were|do|does|did|can|could|will|would|should|has|have|had|name)\b/i;

export const PRESETS = [
  { id: 'phy', label: 'Physics', question: 'Which unit measures electric current?', options: ['volt', 'ampere', 'ohm', 'watt'], correct: 1 },
  { id: 'chem', label: 'Chemistry', question: 'What is the chemical symbol for sodium?', options: ['Na', 'K', 'S', 'Sn'], correct: 0 },
  { id: 'bio', label: 'Biology', question: 'Which part of a cell makes most of its energy?', options: ['Mitochondria', 'Ribosome', 'Nucleus', 'Golgi body'], correct: 0 },
  { id: 'math', label: 'Maths', question: 'What is 15% of 200?', options: ['15', '20', '30', '45'], correct: 2 },
  { id: 'geo', label: 'Geography', question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: 1 },
  { id: 'gk', label: 'General', question: 'In which year did India become independent?', options: ['1942', '1945', '1947', '1950'], correct: 2 },
];

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function cleanQuestionText(raw) {
  let t = squash(raw);
  t = t.replace(/^(?:q(?:uestion)?\s*\d*\s*[.:)\]-]\s*|\d+\s*[.)]\s*)/i, '');   // "Q1.", "Question 2:", "3)"
  if (!t) return '';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[?.!:_]$/.test(t) && INTERROGATIVE.test(t)) t += '?';
  return t;
}
export function cleanOptionText(raw) {
  return squash(raw).replace(/^\(?[a-dA-D1-4][).:]\s+/, '').replace(/^\(?[a-dA-D1-4][).:](?=\S)/, '').trim();
}

/** input: { question, options: [4 strings], correct?: 0..3 | null }
 *  returns { ok, errors: { question, options: [4], general }, value: { text, options, correct } | null, display } */
export function formatQuestion(input) {
  const errors = { question: null, options: [null, null, null, null], general: null };
  const text = cleanQuestionText(input && input.question);
  if (!text) errors.question = 'Write the question first.';
  else if (text.length < LIMITS.minQuestion) errors.question = 'That is very short. Add a few more words.';
  else if (text.length > LIMITS.question) errors.question = `Keep it under ${LIMITS.question} characters (now ${text.length}).`;

  const raw = Array.isArray(input && input.options) ? input.options : [];
  const options = [0, 1, 2, 3].map((i) => cleanOptionText(raw[i]));
  const seen = new Map();
  options.forEach((o, i) => {
    if (!o) { errors.options[i] = `Option ${LETTERS[i].toUpperCase()} is empty.`; return; }
    if (o.length > LIMITS.option) { errors.options[i] = `Keep it under ${LIMITS.option} characters.`; return; }
    const key = o.toLowerCase();
    if (seen.has(key)) errors.options[i] = `Same as option ${LETTERS[seen.get(key)].toUpperCase()}.`; else seen.set(key, i);
  });

  let correct = null;
  if (input && input.correct !== undefined && input.correct !== null && input.correct !== '') {
    const c = Number(input.correct);
    if (Number.isInteger(c) && c >= 0 && c <= 3) correct = c; else errors.general = 'Pick the correct answer from A to D, or leave it blank.';
  }
  const ok = !errors.question && errors.options.every((e) => !e) && !errors.general;
  const value = ok ? { text, options, correct } : null;
  const display = ok ? `${text}\n${options.map((o, i) => `${LETTERS[i]}) ${o}`).join('\n')}` : '';
  return { ok, errors, value, display };
}

/** Choose a preset that is not already on the paper; deterministic given `pick` in [0,1). */
export function pickPreset(usedTexts, pick = Math.random()) {
  const used = new Set(usedTexts.map((t) => t.toLowerCase()));
  const free = PRESETS.filter((p) => !used.has(p.question.toLowerCase()));
  const pool = free.length ? free : PRESETS;
  return pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
}
