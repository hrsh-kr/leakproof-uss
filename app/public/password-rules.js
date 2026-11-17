// Password rules. ONE copy, used by the browser (live checklist while typing) and by the server (the check that counts).
// People choose their own password so they can remember it instead of storing a generated one somewhere unsafe.
// The rules stop the guesses an attacker tries first: short, single-type, common or personal passwords.
export const MIN_LEN = 12, MAX_LEN = 128, LONG_LEN = 20;

// Common passwords and the words this site's users would reach for first (checked after undoing l33t and stripping
// digits and symbols, so "P@ssw0rd2026!" counts as "password").
const COMMON = new Set(('password passw0rd passphrase letmein welcome qwerty qwertyuiop asdfgh asdfghjkl zxcvbn zxcvbnm ' +
  'iloveyou admin administrator login master monkey dragon football baseball cricket sunshine princess shadow superman ' +
  'batman trustno abc abcdef abcdefgh changeme secret default hello whatever freedom starwars pokemon google facebook ' +
  'leakproof leak proof iiitd iiit delhi india exam exams examcell professor student students teacher teaching assistant ' +
  'course class college university campus btech mtech semester midsem endsem question questions answer answers ' +
  'computer security cyber hacker hacking test testing tester demo practice official summer winter spring autumn ' +
  'january february march april may june july august september october november december monday sunday ' +
  'mypassword yourpassword newpassword oldpassword strongpassword securepassword').split(' '));
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's' };
const ROWS = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const CONTROL = /[\p{Cc}\p{Cf}]/u;

const leet = (s) => [...s.toLowerCase()].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
const onlyLetters = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
// The letters split into common words only, e.g. "password", "examstudent" or "leakproofexam".
function allCommon(base) {
  if (base.length < 3) return false; // (almost) no Latin letters: the length and mix rules judge it
  const ok = [true];
  for (let i = 1; i <= base.length; i++) { ok[i] = false; for (let j = Math.max(0, i - 15); j < i; j++) if (ok[j] && COMMON.has(base.slice(j, i))) { ok[i] = true; break; } }
  return ok[base.length];
}
// Three readings, any one common => weak: "P@ssw0rd" (l33t undone), "Password2026!" (digits and symbols dropped),
// "P@ssw0rd1" (digits and symbols at the ends dropped, then l33t undone).
function isCommon(pw) {
  const edges = pw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  return [leet(pw), onlyLetters(pw), leet(edges)].some(allCommon);
}
function hasRun(pw) {
  const s = pw.toLowerCase();
  if (/(.)\1\1\1/u.test(s)) return true; // aaaa
  for (const row of ROWS) for (const r of [row, [...row].reverse().join('')]) for (let i = 0; i + 4 <= r.length; i++) if (s.includes(r.slice(i, i + 4))) return true;
  return false;
}
const classes = (pw) => [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{Ll}\p{Lu}\p{Nd}]/u].filter((re) => re.test(pw)).length;

// Every rule with its status, for the checklist. ctx: { username, display } to forbid personal words.
export function passwordChecks(pw, { username = '', display = '' } = {}) {
  pw = String(pw ?? '').normalize('NFC');
  const len = [...pw].length, low = pw.toLowerCase();
  const personal = [username, ...String(display).split(/\s+/)].map((w) => String(w).toLowerCase().trim()).filter((w) => w.length >= 3);
  return [
    { id: 'length', ok: len >= MIN_LEN && len <= MAX_LEN, text: `${MIN_LEN} to ${MAX_LEN} characters`, why: `use ${MIN_LEN} to ${MAX_LEN} characters` },
    { id: 'mix', ok: classes(pw) >= 3 || len >= LONG_LEN, text: `At least 3 of: lower case, upper case, digit, symbol (or ${LONG_LEN}+ characters, like a sentence)`, why: `mix at least 3 of lower case, upper case, digits and symbols, or make it ${LONG_LEN}+ characters long` },
    { id: 'variety', ok: new Set(low).size >= 6 && !hasRun(pw), text: 'No runs like "aaaa", "1234", "abcd" or "qwer", and at least 6 different characters', why: 'it has a run like "aaaa", "1234" or "qwer", or fewer than 6 different characters' },
    { id: 'common', ok: len === 0 ? false : !isCommon(pw), text: 'Not a common password or made only of common words (password, exam, leakproof, a month…), even with 0 for o or @ for a', why: 'it is a common password or made only of common words (password, exam, leakproof, a month…)' },
    { id: 'personal', ok: len > 0 && !personal.some((w) => low.includes(w)), text: 'Does not contain your username or name', why: 'it contains your username or name' },
    { id: 'plain', ok: len > 0 && !CONTROL.test(pw) && pw.trim() === pw, text: 'No space at the start or end, no invisible characters', why: 'remove the space at the start or end, or the invisible character' },
  ];
}
// The first rule that fails, as a sentence, or null when the password is acceptable.
export function passwordProblem(pw, ctx) {
  const bad = passwordChecks(pw, ctx).find((c) => !c.ok);
  return bad ? `Password not accepted: ${bad.why}.` : null;
}
