// SQLite schema. No plaintext question or paper column exists anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA secure_delete = ON;
PRAGMA busy_timeout = 1000;
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display TEXT NOT NULL,
  pw TEXT NOT NULL, recovery TEXT, simulated INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, stage TEXT NOT NULL, practice INTEGER NOT NULL,
  topics TEXT NOT NULL, win_start INTEGER NOT NULL, win_end INTEGER NOT NULL, seat_limit INTEGER NOT NULL,
  paper BLOB, seed BLOB, copy_secret BLOB, set_hash TEXT, drawn TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS assignments (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, exam_id TEXT NOT NULL REFERENCES exams(id),
  cap TEXT NOT NULL CHECK (cap IN ('submit','run','hold','print')), slot INTEGER,
  PRIMARY KEY (account_id, exam_id, cap, slot));
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL REFERENCES exams(id), topic INTEGER NOT NULL,
  setter_id TEXT NOT NULL, ct BLOB, created INTEGER NOT NULL,
  UNIQUE (exam_id, topic, setter_id));
CREATE TABLE IF NOT EXISTS cards (
  exam_id TEXT NOT NULL REFERENCES exams(id), slot INTEGER NOT NULL, holder_id TEXT NOT NULL,
  share_wrapped BLOB, share_hash TEXT NOT NULL, verified INTEGER, PRIMARY KEY (exam_id, slot));
CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL REFERENCES exams(id), nonce TEXT NOT NULL, seats INTEGER NOT NULL,
  expires INTEGER NOT NULL, state TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (
  release_id TEXT NOT NULL REFERENCES releases(id), slot INTEGER NOT NULL, account_id TEXT NOT NULL,
  decision TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (release_id, slot));
CREATE TABLE IF NOT EXISTS copies (
  exam_id TEXT NOT NULL REFERENCES exams(id), seat INTEGER NOT NULL, fetches INTEGER NOT NULL, first_at INTEGER NOT NULL,
  PRIMARY KEY (exam_id, seat));
CREATE TABLE IF NOT EXISTS log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, exam_id TEXT, at INTEGER NOT NULL, actor TEXT, action TEXT NOT NULL,
  detail TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS log_exam ON log(exam_id, seq);
CREATE TRIGGER IF NOT EXISTS log_no_update BEFORE UPDATE ON log BEGIN SELECT RAISE(ABORT, 'log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS log_no_delete BEFORE DELETE ON log BEGIN SELECT RAISE(ABORT, 'log is append-only'); END;
`;

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'leakproof.db');
  const db = new DatabaseSync(file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  db.exec(SCHEMA);
  // Databases made before must_change existed gain the column once.
  if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'must_change'))
    db.exec('ALTER TABLE accounts ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0');
  // Add 'attempt' cap (student view). SQLite cannot ALTER a CHECK constraint, so recreate the table.
  const asgSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='assignments'").get()?.sql ?? '';
  if (!asgSql.includes("'attempt'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE assignments_new (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        exam_id TEXT NOT NULL REFERENCES exams(id),
        cap TEXT NOT NULL CHECK (cap IN ('submit','run','hold','print','attempt')),
        slot INTEGER,
        PRIMARY KEY (account_id, exam_id, cap, slot))`);
      db.exec('INSERT INTO assignments_new SELECT * FROM assignments');
      db.exec('DROP TABLE assignments');
      db.exec('ALTER TABLE assignments_new RENAME TO assignments');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

// Old bytes of deleted rows are zeroed (secure_delete); the WAL is folded back so they do not linger there either.
export const checkpoint = (db) => db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

// One transaction; any throw rolls everything back.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
