// Strict validation of submissions against the survey definition (the same file the page renders from).
import { flatten, visible, requiredNow, CONTACT_IDS, TASK_IDS, QUICK_SCENES, INTERVIEW } from '../../src/js/survey-def.mjs';
import { FORMATS } from '../../src/js/validators.mjs';

export const LIMITS = { body: 60000, quickComment: 1000 };
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const RESULTS = ['done', 'skipped', 'timeout'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const cleanText = (s) => s.replace(/\u0000/g, '').trim();

const REVIEW_QS = flatten().filter((q) => q.type !== 'task');
const INTERVIEW_QS = INTERVIEW.questions;

/** Checks `a` against question list `qs`. Returns { errors, clean }. */
function checkAnswers(qs, a) {
  const errors = [];
  const byId = new Map(qs.map((q) => [q.id, q]));
  for (const k of Object.keys(a)) if (!byId.has(k)) errors.push(`unknown answer ${k}`);
  const clean = {};
  for (const q of qs) {
    const present = Object.prototype.hasOwnProperty.call(a, q.id);
    const v = a[q.id];
    if (!visible(q, a)) { if (present) errors.push(`${q.id} was answered but should be hidden`); continue; }
    const need = requiredNow(q, a);
    if (!present) { if (need) errors.push(`${q.id} is required`); continue; }
    switch (q.type) {
      case 'consent':
        if (v !== true) errors.push('consent must be given'); else clean[q.id] = true; break;
      case 'single':
        if (typeof v !== 'string' || !q.options.some((o) => o.value === v)) errors.push(`${q.id} has an invalid choice`); else clean[q.id] = v; break;
      case 'multi': {
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string') || new Set(v).size !== v.length) { errors.push(`${q.id} must be a list of distinct choices`); break; }
        if (!v.every((x) => q.options.some((o) => o.value === x))) { errors.push(`${q.id} has an invalid choice`); break; }
        if (v.length > (q.max || q.options.length)) { errors.push(`${q.id} has too many choices`); break; }
        if (need && v.length === 0) { errors.push(`${q.id} is required`); break; }
        clean[q.id] = v; break;
      }
      case 'scale':
        if (!isInt(v) || v < q.scale.min || v > q.scale.max) errors.push(`${q.id} is out of range`); else clean[q.id] = v; break;
      case 'decision':
        if (!['agree', 'unsure', 'disagree'].includes(v)) errors.push(`${q.id} has an invalid choice`); else clean[q.id] = v; break;
      case 'text': {
        if (typeof v !== 'string') { errors.push(`${q.id} must be text`); break; }
        const t = cleanText(v);
        if (t.length > (q.maxLen || 1000)) { errors.push(`${q.id} is too long`); break; }
        if (t && q.minLen && t.length < q.minLen) { errors.push(`${q.id} is too short`); break; }
        if (need && !t) { errors.push(`${q.id} is required`); break; }
        if (t && q.format) {
          const F = FORMATS[q.format];
          if (!F || !F.check(t)) { errors.push(`${q.id} is not a valid ${q.format}`); break; }
          clean[q.id] = F.normalize(t);
          break;
        }
        if (t) clean[q.id] = t;
        break;
      }
      default: errors.push(`${q.id} has an unsupported type`);
    }
  }
  return { errors, clean };
}

function splitContact(clean) {
  const contact = {};
  for (const id of CONTACT_IDS) if (clean[id] !== undefined) { contact[id] = clean[id]; delete clean[id]; }
  return contact;
}

export function validateReview(body) {
  const errors = [];
  const allowedTop = ['kind', 'clientId', 'answers', 'metrics', 'totalSeconds', 'optionalDone', 'website'];
  for (const k of Object.keys(body)) if (!allowedTop.includes(k)) errors.push(`unknown field ${k}`);
  if (typeof body.clientId !== 'string' || !ID_RE.test(body.clientId)) errors.push('clientId is missing or malformed');
  if (!isObj(body.answers)) { errors.push('answers must be an object'); return { ok: false, errors }; }

  const r = checkAnswers(REVIEW_QS, body.answers);
  errors.push(...r.errors);

  const metrics = {};
  if (body.metrics !== undefined) {
    if (!isObj(body.metrics)) errors.push('metrics must be an object');
    else for (const [t, m] of Object.entries(body.metrics)) {
      if (!TASK_IDS.includes(t)) { errors.push(`unknown task ${t}`); continue; }
      if (!isObj(m) || Object.keys(m).some((k) => !['seconds', 'actions', 'result'].includes(k))) { errors.push(`${t} metrics are malformed`); continue; }
      if (!isInt(m.seconds) || m.seconds < 0 || m.seconds > 3600 || !isInt(m.actions) || m.actions < 0 || m.actions > 1000 || !RESULTS.includes(m.result)) { errors.push(`${t} metrics are out of range`); continue; }
      metrics[t] = { seconds: m.seconds, actions: m.actions, result: m.result };
    }
  }
  let totalSeconds = null;
  if (body.totalSeconds !== undefined) { if (!isInt(body.totalSeconds) || body.totalSeconds < 0 || body.totalSeconds > 7200) errors.push('totalSeconds is out of range'); else totalSeconds = body.totalSeconds; }
  if (body.optionalDone !== undefined && typeof body.optionalDone !== 'boolean') errors.push('optionalDone must be true or false');

  if (errors.length) return { ok: false, errors };
  const contact = splitContact(r.clean);
  return { ok: true, errors: [], clean: { clientId: body.clientId, answers: r.clean, metrics, totalSeconds, optionalDone: body.optionalDone === true, contact } };
}

export function validateInterview(body) {
  const errors = [];
  for (const k of Object.keys(body)) if (!['kind', 'clientId', 'answers', 'website'].includes(k)) errors.push(`unknown field ${k}`);
  if (typeof body.clientId !== 'string' || !ID_RE.test(body.clientId)) errors.push('clientId is missing or malformed');
  if (!isObj(body.answers)) { errors.push('answers must be an object'); return { ok: false, errors }; }
  const r = checkAnswers(INTERVIEW_QS, body.answers);
  errors.push(...r.errors);
  if (errors.length) return { ok: false, errors };
  // consent is kept with the request: it proves the person ticked the box before we may contact them
  return { ok: true, errors: [], clean: { clientId: body.clientId, contact: r.clean } };
}

export function validateQuick(body) {
  const errors = [];
  for (const k of Object.keys(body)) if (!['kind', 'clientId', 'scene', 'clear', 'comment', 'website'].includes(k)) errors.push(`unknown field ${k}`);
  if (typeof body.clientId !== 'string' || !ID_RE.test(body.clientId)) errors.push('clientId is missing or malformed');
  if (!QUICK_SCENES.includes(body.scene)) errors.push('scene is invalid');
  if (!['yes', 'no'].includes(body.clear)) errors.push('clear must be yes or no');
  let comment = '';
  if (body.comment !== undefined) {
    if (typeof body.comment !== 'string') errors.push('comment must be text');
    else { comment = cleanText(body.comment); if (comment.length > LIMITS.quickComment) errors.push('comment is too long'); }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], clean: { clientId: body.clientId, scene: body.scene, clear: body.clear, comment } };
}
