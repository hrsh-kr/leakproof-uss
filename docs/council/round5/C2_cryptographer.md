# C2 Cryptographer / key-management review (role-played lens)

Scope: snapshot `/private/tmp/claude-501/uss-r5/app-snapshot`. Snippets run on a copy in `/private/tmp/claude-501/c2`. "Unverified" = not run. All code is node:crypto / WebCrypto; no home-made ciphers. The core is sound. The weak points are policy-versus-crypto gaps and a few over-claims.

## 1. Mechanism table

| # | Purpose | Primitive / parameters | Key source, lifetime | Where | Attacker needs | Verdict |
|---|---|---|---|---|---|---|
| M1 | Questions at rest | AES-256-GCM, random 96-bit IV, AAD `q\|exam\|qid` | `server.key` (32 B file, systemd credential from /etc/leakproof), lives until the instance is retired | crypto.mjs:14-26; exam.mjs:83 | DB + `server.key` (root on the VM), before seal | sound |
| M2 | Paper | AES-256-GCM, fresh `rand(32)` paper key, AAD `paper\|exam` | Paper key exists in memory only, then is split and wiped | exam.mjs:136-139 | 3 shares + the `paper` blob (which sits unwrapped in the DB) | sound. Gates are not part of the crypto (see 3.1) |
| M3 | Shamir 3-of-5 | GF(2^521-1), x=1..5, y uniform; share = x(1 B) + y(66 B) | `rand(66)` with mask and rejection | crypto.mjs:56-95 | 3 shares | sound (details in 3.1) |
| M4 | Share wrapped until verified | AES-GCM under `server.key`, AAD `card\|exam\|slot` | Until verify, then NULL + secure_delete + checkpoint | exam.mjs:142,175 | DB + `server.key` before verify | sound, but it is only software quorum until verified |
| M5 | Share check | sha256(share) compare via timingSafeEqual | share has 521 bits of entropy, so the hash is not guessable | exam.mjs:173,282 | n/a | sound |
| M6 | Browser card | PBKDF2-HMAC-SHA256 600k, 16 B salt, AES-256-GCM, 12 B random IV, AAD `exam\|slot` | User passphrase (min 10 chars, length check only) | public/app.js:165-173,187-203 | card file + passphrase guess | weak at the passphrase, fine primitive (3.5) |
| M7 | Passwords | scrypt N=2^15 r=8 p=1, 16 B salt, timingSafeEqual | Server-generated 80-bit secrets (crypto.mjs:46); recovery 60-bit | crypto.mjs:30-42 | DB; 2^80 work | sound. Cost parameter is below OWASP, but irrelevant at 80 bits |
| M8 | Sessions | `rand(32)` sid, stored as sha256; csrf `rand(24)` | 30 min idle, 8 h absolute | app.mjs:22-31 | guess 256 bits, or steal the cookie | sound |
| M9 | CSRF | per-session token, timingSafeEqual, Origin check, SameSite=Strict, `__Host-` | per session | app.mjs:~300 | same-origin script | sound |
| M10 | Draw | HMAC-SHA256-CTR `Stream`, rejection sampling, 32-byte seed | seed `rand(32)` at seal, wrapped, revealed after release | crypto.mjs:98-113; exam.mjs:126,412 | operator can grind the seed (3.2) | sound math, replay proves consistency only |
| M11 | Two-word check | sha256(nonce\|seats\|exam\|expires) -> 2 of 128 words = 14 bits | nonce `rand(16)` in DB, per request | exam.mjs:187 | 5 tries per request, shared by all holders | weak by design (documented); presence check, not crypto |
| M12 | Seat order | `Stream(copySecret,"order\|s\|c")`, Fisher-Yates for questions and options | copySecret 256-bit, wrapped in DB | exam.mjs:314-327 | copySecret (server memory or DB + `server.key`) | sound PRF |
| M13 | Copy id | 40-bit HMAC tag + seat | copySecret | exam.mjs:339 | n/a | cosmetic: nothing ever verifies a copy id (grep: no route takes it). Tracing uses text order only |
| M14 | Keyed log | HMAC-SHA256 chain over prev, exam, at, actor, action, detail; append-only triggers | `log.key` separate from `server.key` | log.mjs:15 | DB write only: truncation (3.7). DB + `log.key`: full forgery | sound for edit/insert, partial for truncation |

## 2. Compromise matrix

Y = yes, N = no, "partial" = qualified. Columns: (a) read paper before release, (b) forge or alter the log undetectably, (c) learn which setter wrote which question, (d) trace a seat or evade tracing, (e) predict another seat's order.

| Adversary | (a) read paper early | (b) forge log | (c) setter to question | (d) tracing | (e) other seat order |
|---|---|---|---|---|---|
| Stolen data dir only (no keys) | N after seal. Before seal: ciphertexts only. Paper blob + 3 stolen shares needed | Truncate tail: Y (drop triggers, delete rows; detected only if a later printed head exists). Edit or insert: N | **Partial Y**: `questions.setter_id` survives seal, and `exams.drawn` lists drawn ids, so drawn id -> setter (not text) | n/a | N |
| Data dir + key files | Before seal: Y, all questions. After seal while at least 3 cards are unverified: Y (unwrap shares). After 4+ verified: N | Y (full re-chain) | Y (text and setter) before seal. After seal: id-to-setter | Y: unwrap copySecret, so can compute any seat's layout and evade or frame | Y |
| One key holder | N (2 shares carry no information) | N | N | N | N. Can veto: 5 wrong word tries close the request with login only (3.9) |
| Two holders | N | N | N | N | N |
| Three colluding holders | **Y, offline, no gates**: 3 shares + the `paper` blob (needs DB read, not `server.key`). Window, words and seat gates are policy only. SECURITY.md says "the log shows it", but offline use leaves no log entry | N | Only if they also have the DB | N | N |
| Exam cell (print + run) | After release: Y, by design. Before: N. Sees counts only | N | N | Sees the answer key and every copy, so can frame or evade | Y (it prints all seats) |
| A setter | N | N | Only own questions. After release learns whether their id was drawn | N | N |
| VM operator / root | **Y**: reads memory, hooks `decide` to capture 3 shares, serves altered JS, or reads `server.key` + DB. Stated in SECURITY.md section 4 | Y (has `log.key`) | Y | Y | Y. Can also grind the draw seed (3.2) |
| Network observer (TLS) | N. TLS terminates at Caddy (internal CA, trust-on-first-use) | N | N | N | N |
| Malicious extension on a holder's machine | Gets that holder's share (plaintext in JS at makeCard/openCard) and the passphrase, and can ride the session. One share is useless alone. Three infected holders = (a) | N | N | N | N |

Setter and student leak cases:
- **Evade tracing**: leak fewer than 3 consecutive questions, reorder them, paraphrase, or photograph a different seat.
- **Frame**: copy a neighbour's visible order. SECURITY.md says only "a seat, not a person".

Docs over-claims:
- 12 section 6.4 says "scrypt + AES-GCM". The code uses PBKDF2.
- 11 and 12 say "the quorum is cryptographic after verification". True only against a data-at-rest thief. Verify and approve both post the plaintext share to the server, which always held every share at seal.
- SR9 "copy id is an HMAC tag" implies a checkable id. None exists.
- SR8 "replayable" does not mean unbiased against the operator.
- The refusal comment "only someone in the room can refuse" is false (3.9).
- SR9 and SR12 imply a trace identifies a seat. See 3.6: stems-only leaks are ambiguous.

## 3. Specific questions

**3.1 Shamir.**
- Format: 1 byte x, then 66 bytes y, so 67 bytes (`SHARE_BYTES`).
- y < 2^521 fits in 132 hex digits.
- Coefficients come from `randField`, which masks 521 bits and rejects only the value P itself, so they are uniform.
- Ran: 3-of-5 round trip OK; all-zero and all-0xff secrets OK.
- Ran: a duplicate share gives "duplicate share"; x=0 gives "bad share"; a flipped y bit gives "bad shares" (fail-closed).
- `combine` has no integrity of its own. `decide` pre-checks the sha256 against the stored hash and `aeOpen` GCM-checks the result. Malleability is not exploitable.
- x is fixed 1..5 and public.
- A failed `openPaper` leaves 3 approvals and no shares, so the request is stuck until a new one (rare, since hashes are pre-checked).
- BigInt arithmetic is not constant-time. It runs server-side over shares the server already knows. Negligible.

**3.2 Draw.**
- `below` uses rejection (lim = floor(2^32/n)*n), so there is no modulo bias. Ran `below(3)` x 30000: [10003, 9918, 10079].
- Fisher-Yates is correct.
- Replay is deterministic: ids are sorted, and SQL `ORDER BY id` matches default string sort for hex.
- The server alone chooses the seed, and there is no commitment before the pool closes. A root operator (who can decrypt questions) can grind seeds to favour a question, and replay will still pass. Fixing this needs external randomness. State it as a limit.
- `draw` with an empty candidate list would loop forever (`below(0)` gives NaN). The seal precondition `ready` prevents it.

**3.3 IV and AAD.**
- Random 96-bit IVs, all under a handful of keys. Collision risk is negligible at this volume. The browser derives a fresh key per card (fresh salt).
- AAD binds question to exam and id, paper to exam, share to exam and slot, seed and copy secret to exam.
- The card AAD is built from the caller's expected exam and slot, so the unauthenticated JSON `e`/`s` fields cannot redirect it. Good.

**3.4 Timing.**
- All secret compares use sha256 then timingSafeEqual, or a length check that leaks only length: share hash, CSRF, invite code, scrypt result.
- Sessions are looked up by hash of the sid, which is not exploitable.
- The words compare uses `!==`. A timing leak of "first word matched" is not practical over the network and is capped at 5 tries.
- Unknown users burn a dummy scrypt hash.
- Ran scrypt: about 43 ms per check on this Mac; 8 parallel checks took 97 ms. The "~60 ms" claim is the right order of magnitude. Unverified on the VM.

**3.5 Offline brute force on a card file.**
- Verification is the GCM tag.
- Measured on this Mac: PBKDF2 600k takes about 45 ms per core, so about 22 guesses/s/core.
- GPU rates are an unverified estimate: roughly 10^4 guesses/s per high-end GPU.
- A random 10-character lowercase passphrase (26^10 = 1.4e14) is about 10^10 s on one GPU, fine.
- A human 10-character passphrase ("password12", names and years) falls to a top-1e8 list in hours.
- The only gate is `a.length < 10` (app.js `checkNewPass`).
- A cracked card yields one share. The attacker still needs 2 more and the paper blob.

**3.6 Tracing.**
- Simulated with the real layout logic (300 trials each):

| Leak | Mean matching seats | Ambiguous |
|---|---|---|
| N=10, 60 seats, stems only | 1.62 | 49% |
| N=10, 60 seats, with options | 1.00 | 0% |
| N=5, 60 seats, stems only | 3.9 | 95% |
| N=10, 200 seats, stems only | 3.34 | 92% |

- The UI text "the order identifies the copy" over-claims for stems-only leaks.

**3.7 Keyed log.**
- The key stops anyone with DB write access but not the key from editing or inserting. Appending is blocked too.
- Triggers are in the DB file, so file-level access can drop them.
- Truncation is undetectable by the chain alone. A head printed on a paper copy (or quoted elsewhere) later than the cut makes `check-head` return `found:false`. The head is global across exams.
- The `check-head` oracle only confirms hashes already shown publicly. It leaks nothing and is rate-limited.

**3.8 Does verify weaken SR4?**
- The server sees the plaintext share at fetch, verify and approve. It generated all five at seal.
- "After verification the server holds no share" is true on disk only.
- It reveals "this holder can open the card" (the point of verification) and nothing else. The sha256 of a 521-bit share is not a guessing oracle.

**3.9 Words check.**
- 14 bits, 5 tries per release shared across all holders.
- `decide` checks the words before `verified`. Any holder with only a login can burn 5 wrong tries and close the release, with no words and no card. So "refusing needs the words" is false for a veto.
- Words are not bound to a holder or slot. Anyone who learns them can use them for 15 minutes, still needing login + card.

**3.10 Endpoints.**
- Answer key: needs `run`, an open paper, the window and a seat in range. No early leak.
- Seed reveal: only when stage is RELEASED. Pool entries expose ids and topics, not setters or text.
- `/api/public/log` before release shows `setHash`, which is a 64-bit hash over id, text and sorted options. Ids are secret until release, so it is not guessable.

## 4. Ranked change list (fix before freeze)

| Rank | Change | Diff | Regression risk |
|---|---|---|---|
| 1 | Raise the card passphrase floor: generate it (reuse `generatePassphrase`, e.g. 4 groups) or require 14+ characters and a wordlist/zxcvbn-style reject. Edit `checkNewPass` in `public/app.js` | small | low. Test expectations that use short passphrases need updating |
| 2 | Words check: apply the 5-try counter only to the pair (holder, slot), or make a veto require a verified card, so one login cannot kill a release. Alternatively state it as a limit | small | low-med: tests S9/S10 |
| 3 | Fix doc over-claims: the scrypt wording in `12_detailed_design.md` section 6.4; "cryptographic after verification" -> "against a data-at-rest thief"; the SR9 wording on the copy id; the "only someone in the room can refuse" comment; the trace guidance (paste options, 3+ questions) in the user guide | docs only | none |
| 4 | Clear `setter_id` for drawn rows at seal, or null it for all rows (setters can still list their own questions, so keep it for pre-seal only) | small | med: `myQuestions` after seal and the `UNIQUE(exam_id, topic, setter_id)` constraint |
| 5 | Surface "stems-only leak: N seats match" in the trace result (add ambiguity count to the note) | tiny | none |
| 6 | Record `sha256(seed)` in the `exam.sealed` log entry (`seed` is already in ALLOWED) | tiny | low |
| 7 | Show the log head on the exam page for holders and the printed copy (already done), and tell staff to record it off-system at seal and release (truncation defence) | none | none |

Not worth changing before freeze: scrypt N (secrets are 80-bit generated); a copy-id verifier (nothing needs it).

**State openly as limits:**
- Three holders plus a DB copy open the paper offline, with no log entry.
- The gates are policy, not crypto.
- An operator can grind the draw seed.
- Truncating the log tail is undetectable without an off-system head.
- A drawn question id maps to its setter in the DB.
- Tracing is ambiguous on stems-only leaks and can be framed or evaded.
- The server sees every share in plaintext at fetch, verify and approve.
