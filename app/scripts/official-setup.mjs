// Create the official exam and its people from a JSON file, then print each person's passphrase ONCE.
//   LP_MODE=official LP_DATA_DIR=... LP_KEY_DIR=... node scripts/official-setup.mjs deploy/official.example.json [--demo] [--out creds.md]
// Hand each slip to its owner in person; nothing secret is stored in plain text anywhere.
// Every account must set its own passphrase at first login, so the printed one (which the operator saw) stops working.
// --demo: accounts keep the printed passphrase (shared demo pods; no forced change).  --out <file>: write the credentials as a
// markdown table to <file> (mode 0600) instead of printing passphrases.
import fs from 'node:fs';
import { loadConfig, loadKey } from '../src/config.mjs';
import { openDb, tx } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';

const args = process.argv.slice(2);
const demo = args.includes('--demo');
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : null, outAt = oi >= 0 ? oi + 1 : -1;
const file = args.find((a, i) => !a.startsWith('--') && i !== outAt);
if (!file || (oi >= 0 && (!out || out.startsWith('--')))) { console.error('usage: node scripts/official-setup.mjs <exam.json> [--demo] [--out <file>]'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const p of cfg.people || []) if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(p.username)) { console.error(`username "${p.username}" must be 3 to 32 lowercase letters, digits, dot, dash or underscore (logins are lower-cased)`); process.exit(2); }
const config = loadConfig();
if (config.mode !== 'official') { console.error('Run with LP_MODE=official (or LP_INSTANCE=official).'); process.exit(2); }

const db = openDb(config.dataDir);
const app = createApp({ db, config, serverKey: loadKey(config.keyDir, 'server.key', db), logKey: loadKey(config.keyDir, 'log.key', db) });
const holders = cfg.people.filter((p) => p.caps.includes('hold'));
if (holders.length !== 5) throw new Error('exactly five people must hold a key card');

const made = [];
for (const p of cfg.people) made.push({ p, acc: await app.createAccount(p.username, p.display, { mustChange: !demo }) });
const examId = tx(db, () => {
  const id = app.exams.createExam({ title: cfg.title, topics: cfg.topics, winStart: Date.parse(cfg.window.start), winEnd: Date.parse(cfg.window.end), seatLimit: cfg.seatLimit, practice: false });
  let slot = 0;
  for (const { p, acc } of made) for (const cap of p.caps) app.exams.assign(acc.id, id, cap, cap === 'hold' ? ++slot : null);
  return id;
});
console.log(`Official exam ${examId} created: ${cfg.title}`);
const role = (p) => `${p.display} (${p.caps.join(', ')})`;
if (out) {
  const cell = (v) => String(v).replace(/\|/g, '\\|');
  const rows = made.map(({ p, acc }) => `| ${cell(role(p))} | ${cell(p.username)} | ${acc.passphrase} | ${acc.recovery} |`);
  fs.writeFileSync(out, ['| role | username | passphrase | recovery code |', '|---|---|---|---|', ...rows, ''].join('\n'), { mode: 0o600 });
  fs.chmodSync(out, 0o600);
  console.log(`Credentials for ${made.length} accounts written to ${out} (mode 0600).`);
} else {
  const note = demo ? '(demo account: this passphrase keeps working)' : '(first login asks for a new passphrase; this slip then stops working)';
  for (const { p, acc } of made) console.log(`\n${role(p)}\n  username: ${p.username}\n  passphrase: ${acc.passphrase}\n  recovery code: ${acc.recovery}\n  ${note}`);
}
db.close();
