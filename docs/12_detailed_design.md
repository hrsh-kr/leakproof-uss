# LeakProof: Detailed Design (current iteration)

Status: consolidated 14 Nov 2026. Merges `09`, `10` and `11`. **Where they disagree, `11_minimal_system.md` wins, then `10`, then `09`.** Items marked **[proposed]** are not specified in 09 to 11 and are my design to fill the gap; challenge them. Items marked **[open]** need a decision.

Principle (Occam): deliver properties P1 to P6 with the fewest roles, routes and moving parts. Anything not needed to run one exam end to end, safely, is out (section 14).

---

## 1. Purpose and properties

A web app that runs one university MCQ exam from question collection to printed per-seat copies, so that no single person can read the paper early and a leaked copy points to a seat.

| # | Property | Requirement link |
|---|---|---|
| P1 | No single person can read the paper before the exam | SR4, SR5 |
| P2 | One compromised setter exposes only a small part | SR3, SR8 |
| P3 | A leaked copy points to a seat | SR9, SR12 (differentiator) |
| P4 | Quiet edits to the record are visible | SR6 |
| P5 | An official can operate it correctly under pressure | usability (25% of grade) |
| P6 | Every candidate gets the same questions for the same marks | F4 |

Grading weights: usability 25%, security requirements 25%, software quality 15%, functional correctness 10%, presentations 25%.

## 2. Actors and capabilities

One account type. Four capabilities, stored as rows in `assignments(account, exam, capability)`.

| Capability | Held by | Can | Cannot |
|---|---|---|---|
| `submit` | Setter (many) | Add, list and delete **own** questions before Seal | See others' questions or the paper |
| `run` | Exam cell (1 to 2) | Create exam (official build only), Seal, trace; sees **counts only** | Read any question |
| `hold` | Key holder (5) | Fetch and verify own card; approve or refuse a release | Hold more than one card (official instance) |
| `print` | Exam cell | Request release, fetch one seat's copy | Print before quorum |
| none | Public / auditor | Read the public log page | Anything else |

Rule replacing a separation-of-duties matrix: **one key card per account** in the official instance. In practice, one account may hold several cards, labelled.

## 3. System architecture

```
 Browser (vanilla ES modules, no framework, textContent only)
   |  HTTPS  (Caddy/nginx: TLS, HSTS, CSP default-src 'self', 64 KB body cap, per-IP rate limit)
   v
 Node 22, node:http, user `leakproof`, 127.0.0.1
   middleware chain on EVERY route:
     session -> CSRF -> capability check (404 if none) -> stage check -> schema -> size cap
   modules: auth | exams | questions | seal | cards | release | copies | trace | log
   crypto : node:crypto only (AES-256-GCM, HMAC-SHA-256, scrypt, CSPRNG) + Shamir over 2^521-1
        |
 SQLite (file 0600): accounts, exams, assignments, question ciphertext (until Seal),
                     wrapped shares (until verified), share hashes, paper ciphertext, log
 /etc/leakproof/{server.key, log.key}  (0400, systemd LoadCredential; never in the DB)
```

- **Two instances, never sharing anything** (finding 1): own process, port, database, `server.key`, `log.key`.
- Stack: Node 22, `node:sqlite` (or `better-sqlite3` if the VM's Node lacks it; check day 1). No framework, no file uploads.
- HTTPS is mandatory: key cards are decrypted in the browser with `crypto.subtle`, which does not exist on plain http. Real hostname gives Let's Encrypt; bare IP gives a self-signed cert with its SHA-256 fingerprint in the guide.
- Packaging: `leakproof-v1.tar.gz` + SHA-256, `USER_GUIDE.pdf`, live URL. `make install | seed | reset | verify | run-local | evidence`.

## 4. Two instances

| | Practice | Official |
|---|---|---|
| Users | 8+ classmates alone, 18 to 25 Nov | 26 Nov live demo and video |
| Accounts | Self-register: roll number + course code from the guide; one per roll number; passphrase shown once; capped and rate limited | Pre-created, distinct, passphrases not in the package |
| Exam | Seeded per tester: **4 simulated setters**, 5 labelled key cards held by the tester, `PRACTICE` banner | One real exam, separate real people |
| Data | Disposable; reset creates a **new exam ID**; log rows never deleted | Started 25 Nov night; **off** 17 to 25 Nov |
| Secrets | Own `server.key`, `log.key` | Own; none shipped |
| Missing capability | 404, not 403 | 404 |

## 5. Exam lifecycle

```
 COLLECTING --seal--> SEALED --release--> RELEASED
```

Every transition checks the previous stage, is one DB transaction, and appends to the log.

**Seal preconditions** (server refuses otherwise): every topic has at least one question; every topic has at least 2 distinct setters; no setter contributes more than one question per topic.

**RELEASED** also unlocks trace and seed reveal (the CLOSED stage was dropped).

## 6. Cryptography

### 6.1 Keys

| Key | Size | Lives | Purpose |
|---|---|---|---|
| `server.key` | 256 bit | root-owned file, outside DB | Encrypts questions at rest; wraps shares until verified |
| `log.key` | 256 bit | root-owned file, outside DB | Keys the audit chain |
| paper key | 256 bit raw CSPRNG | memory only; split then wiped | Encrypts the sealed paper |
| copy secret | 256 bit | derived at Seal, stored wrapped | Drives per-seat order and copy IDs |
| card passphrase | user-chosen | holder's head | Encrypts the holder's share in the browser |

No hashing of hex strings into keys; all keys are raw random bytes.

### 6.2 Submit

Server encrypts each question under `server.key`: AES-256-GCM, random 96-bit IV, **authenticated data = exam_id || question_id**. Stores only ciphertext. Plaintext exists in memory for milliseconds. Browser-side encryption is a recorded upgrade path, not claimed.

### 6.3 Seal (one DB transaction; any failure rolls back everything)

1. Check preconditions (section 5).
2. **Draw** per topic using the OS CSPRNG; record the draw seed (revealed at release).
3. Decrypt only the drawn questions; build the paper in memory.
4. Encrypt paper under a fresh **paper key** (AES-256-GCM, AAD = exam_id).
5. **Shamir split** the paper key 3-of-5 over GF(2^521 - 1); reject duplicate shares on combine.
6. Wrap each share under `server.key`; store its SHA-256 hash.
7. Derive the **copy secret** and store wrapped.
8. **Delete every question ciphertext.** Afterwards only the locked paper exists.
9. Wipe paper key and plaintext buffers; append `SEAL` to the log with the new head.

### 6.4 Cards: verify-on-claim

```
 holder logs in -> GET /exams/:id/card  (server unwraps share, sends once)
 browser: encrypt share under holder's passphrase (scrypt + AES-GCM) -> show text "card"
 holder copies card -> pastes it back with passphrase -> browser decrypts locally
 browser POSTs the share to /card/verify; server checks SHA-256(share) == stored hash
 (passphrase never leaves the browser)                                          [proposed detail]
 on match: server DELETES its wrapped copy; card marked verified.
```

- Until verified, the holder can re-fetch the card. After, **no recovery** (stated in the UI).
- Exam page shows "cards verified n of 5". **Release locked until at least 4 verified**, so one loss still leaves 3.
- Until all cards are verified, the quorum is a software rule; after, it is cryptographic.

### 6.5 Release

1. Exam cell requests release with a seat count. Server creates a request: single-use **nonce**, **seat count**, **window**, 15-minute expiry.
2. Two-word check = `words(SHA-256(nonce || seats || window))`. Shown **only on the exam cell's screen**.
3. A holder types the two words, pastes card + passphrase; browser decrypts and posts the share. Equal-size **Refuse** button sits beside **Approve**.
4. Approval is **bound** to nonce, seat count and window. Replay fails (nonce spent), expired fails, one account supplying two shares fails.
5. Server holds shares in memory only; at 3 distinct verified cards it combines, decrypts the paper in memory, then wipes shares and key.
6. Gates (section 7) must all pass before any copy is served.

### 6.6 Copies

```
 per seat s:
   stream  = HMAC-SHA-256(copy_secret, "order" || s || counter)   -> byte stream
   order   = Fisher-Yates over questions, then over each question's options,
             rejection sampling from the stream (no modulo bias)            [proposed]
   rule    : if order(s) agrees with order(s-1) in the first 3 positions, counter++ and redo
   copy_id = base32( HMAC-SHA-256(copy_secret, exam || s || set_hash)[:10] ) || "-" || s
   footer  : copy_id, set_hash, "same questions, same marks", log head
```

- `set_hash` = hash of the question set; identical on every copy (P6).
- The weak 32-bit generator in the demo (`rngFrom`) is **not reused**.
- Copies are fetched **one seat per request**, each fetch logged. Distinct seats cannot exceed the entered seat count. Reprinting the same seat is idempotent and counted.

### 6.7 Audit log

```
 entry_hash = HMAC-SHA-256(log.key, prev_hash || canonical_json(entry))
```

- Key outside the DB, so someone with DB write access cannot recompute.
- **Head hash printed in every copy footer and on every approval screen**, so it is anchored in paper and in holders' browsers. Team also posts the head to the team channel after each stage.
- Public page: paste a head, server says whether it appears in the chain. Truncation shows as a missing head.
- Log entries use a field allowlist; never keys, shares, passphrases, plaintext.
- Practice resets never delete rows.

## 7. Release gates

| Gate | Check | Screen says |
|---|---|---|
| G1 Quorum | 3 distinct **verified** cards approved this request | "2 of 3 approved. Waiting for: Dean, Registrar" |
| G2 Window | Now inside print window | "Opens 08:30. Try again in 14 minutes" |
| G3 Seats | Seat count within registered limit | "Seat 61 is above the limit of 60" |

Integrity is inherent: decryption fails if anything is wrong, and never shows internals. Honest wording: window and seat count are set by the exam cell, so G2 and G3 guard against accidents, not a malicious cell. Only G1 is independent.

## 8. Leak trace [proposed matcher]

Fingerprint = order of questions and options on the page, so cropping the copy ID does not defeat it.

- Input: a fragment of **3 or more consecutive questions**, each with its option order, as visible text (POSTed, so paper content stays out of URL logs).
- For each seat 1..N, regenerate its order and look for the fragment as a contiguous window. Score = fraction of positions matched.
- Output: list of seats with scores and reasons, labelled "a lead, not a verdict" (SR12).
- **Acceptance test:** a 3-question fragment with a cropped header returns the right seat; a wrong order returns none.
- Cut line: if not working by noon 15 Nov, show a scripted trace and say so.

## 9. Data model [proposed]

```
 accounts(id, roll_or_name, scrypt_hash, salt, created, instance)
 exams(id, title, stage, topics_json, window_start, window_end, seat_limit,
       draw_seed_wrapped, copy_secret_wrapped, set_hash, paper_ct, paper_iv, created)
 assignments(account_id, exam_id, capability, card_slot NULL)      -- UNIQUE(exam_id, card_slot) per account in official
 questions(id, exam_id, topic, setter_id, ct, iv, created)         -- rows deleted at Seal
 cards(exam_id, slot, holder_id, share_wrapped NULL, share_hash, verified_at NULL)
 releases(id, exam_id, nonce, seats, window, expires, state)
 approvals(release_id, card_slot, at)                              -- no share stored
 copy_fetches(exam_id, seat, count, first_at, last_at)
 log(seq, ts, actor, action, detail_json, prev_hash, hash)
 sessions(id, account_id, csrf, expires)
```

No plaintext column anywhere. SR7 canary check runs over the DB, files, logs and error bodies, including "no question ciphertext remains after Seal".

## 10. Routes (about 16)

```
POST   /login  /logout                       none / any       scrypt, backoff, per-IP limit
GET    /exams                                any              my exams, capabilities, "waiting for you"
POST   /exams                                run              official build only
POST   /exams/:id/questions                  submit           one per topic
GET    /exams/:id/questions                  submit           my own only
DELETE /questions/:id                        submit           mine, before Seal
POST   /exams/:id/seal                       run              draw + encrypt + split + delete pool
GET    /exams/:id/card                       hold             re-fetchable until verified
POST   /exams/:id/card/verify                hold
POST   /exams/:id/release                    print            request with seat count
POST   /releases/:id/approve                 hold             two words + card; or refuse
GET    /releases/:id                         print, hold      gate states, 5 s refresh
GET    /releases/:id/copy/:seat              print            one seat, logged, capped
POST   /exams/:id/trace                      run              RELEASED only
GET    /public/log                           none             chain, head, "check this head"
POST   /practice/register                    none             practice only, rate limited
```

Routes are listed in one JSON file read by both the server and the route-matrix test (SR1): an unlisted route fails the build.

## 11. Screens (about nine)

| Screen | For | Key content |
|---|---|---|
| Login / practice register | all | One field set; generic error for wrong user or password |
| Home | all | My exams; **"Waiting for you"** row |
| Setter form | `submit` | One form per topic; fix errors in place; receipt; delete own |
| Exam cell | `run`, `print` | Stage bar; counts only; Seal button with preconditions listed; seat count + request release |
| Key card | `hold` | Show card once; paste-back verify; "n of 5 verified" |
| Approve | `hold` | Type two words; paste card; Approve and Refuse equal size |
| Release status | `print`, `hold` | Gate checklist, names failing gate and who must act; 5 s refresh |
| Print queue | `print` | One seat at a time; copy shows set hash, "same questions, same marks", head |
| Public log / Trace | none / `run` | Verify head; trace form with scored seat list |

Usability rules: every blocked state names its gate and next step in plain words; status is words + icon + colour; secrets get a distinct "Secret" style and never appear in URLs or toasts; `textContent` rendering only; reuse `/pipeline` text as a "What is happening?" drawer.

## 12. Security requirements and proofs

| ID | Requirement | Proof |
|---|---|---|
| SR1 | Deny by default; unlisted route fails the build; no capability returns 404 | Route-by-capability matrix test from one JSON file |
| SR2 | scrypt, backoff, per-IP limit, cookie flags, CSRF; practice and official separate | AB-07, AB-08 |
| SR3 | Setter reads only own questions; exam cell sees counts only | AB-01 |
| SR4 | Fewer than 3 verified cards open nothing; after verification the server holds no share | Property tests, abuse test |
| SR5 | Release fails closed on quorum, window, seat count, each bound to the approval | Every subset of failed gates refuses; only full set opens |
| SR6 | Keyed chain; head on copies and approvals; truncation visible | AB-24, AB-25 |
| SR7 | Canary plaintext absent from DB, files, logs, errors, and no question ciphertext after Seal | Canary grep test |
| SR8 | Draw is replayable; seed revealed at release | Replay test |
| SR9 | Unpredictable copies; adjacent seats differ; 3-question fragment names the seat; wrong order names none | Simulation + acceptance test |
| SR10 | XSS, SQL, traversal, oversize inert | AB-04 to AB-06, AB-28 |
| SR11 | Errors and logs leak nothing | Log scan |
| SR12 | A trace names a seat, not a person; a lead, not a verdict | UI test |

Defects in the old demo code that must **not** carry over: 32-bit seed collapse; check digit as authentication (use HMAC); 120-bit secret and hash-of-hex key (use raw 256-bit); 127-bit Shamir prime (use 2^521 - 1); `combine()` accepting duplicate shares; `keyHex` and `paperText` surviving the "wipe"; shared `x-admin-key` with no rate limit.

## 13. Testing and evidence

- Test first for anything security-critical; never weaken a test to make it pass.
- Layers: crypto property tests; route-by-capability matrix; gate-subset tests; abuse suite AB-01..AB-31 on every commit and against the VM; canary scan; acceptance scenarios (5 to 6).
- `make evidence` writes `evidence/SRn.txt`; screenshots named `SRn-attack.png`, `SRn-refused.png`.
- Every finding, ours or a classmate's, goes to `../evidence/logs/vulnerabilities.csv` as: class, cause, fix, regression test, lesson. This is Part B of the video.
- Usability: walkthrough 13 Nov; think-aloud with 5 to 6 strangers 15 to 16 Nov; peer testing 18 to 25 Nov. UMUX-Lite per role, SUS overall. Targets: key holder approves after a 2-minute walkthrough with no help; exam cell knows within 5 seconds why Release is disabled; setter submits in under 90 seconds.

## 14. Out of scope and stated limits

Cut: multi-centre support, a second ceremony, four-of-five fallback UI, uploads, question editing, email and notifications beyond "waiting for you", PDF generation, rich content (plain text only), per-question keys, signed client-side submissions and committed seeds (design-only).

State in the guide and video:
- The VM operator and server handle plaintext for seconds at Seal and Release. The exam cell sees the paper at print time.
- A malicious operator could serve altered JavaScript; not defended.
- Three colluding key holders can open the paper early; we log it.
- Until all cards are verified, the quorum is software-enforced.
- A trace names a seat, not a person; the likeliest leaker is whoever holds the printed copies.
- A photo of a printed copy cannot be stopped, only traced. The chain shows tampering, it does not prevent it.
- If three or more holders are unreachable the system cannot print (manual process).
- Out of scope for attackers: volumetric DoS, VM host compromise, physical or social engineering, browser zero-days.

## 15. Build plan and cut order

| Tier | Items |
|---|---|
| **Must** | Two instances; crypto fixes with tests; Seal as one transaction (pool deleted); wrapped shares + verify-on-claim; G1 counts distinct cards; keyed chain + head on copies and approvals; per-seat logged fetch; approval bound to nonce/seats/window; simulated setters + Seal preconditions; windowed trace; practice self-registration |
| **Should** | Adjacent-seat rule; set hash + "same marks" line; typed two words + Refuse; "Waiting for you" + refresh; seed reveal |
| **Stretch** | Holder enrols own key before Seal (cryptographic quorum from the start); 12-word card |

Cut order: SHOULDs first, then self-registration becomes a shipped list (practice only), then windowed trace becomes scripted, then browser card encryption becomes a passphrase typed at approval.

Dates: code posted by **Tue 17 Nov 18:00** (deadline midnight); freeze Sun 15 Nov 22:00; pilot Mon 16; peers test 18 to 25 Nov; poster 26 Nov; test reports 28 Nov; video 29 Nov.

## 16. Decisions still open [open]

1. Practice accounts: self-register (recommended, +0.3 day) or shipped list.
2. Key card: passphrase (recommended) or 12-word card.
3. Shares: wrapped and deleted on verify (ruling) or enrolment before Seal (+0.5 day).
4. Log head anchoring: copies + approvals + team channel, or add a second automatic location.
5. State the limits in section 14 plainly in the video.
6. Official instance stays off 17 to 25 Nov.
7. From `10`: server-side question encryption instead of browser-side; 2^521 - 1 field instead of a Shamir library.
8. **Not in any doc:** the only evidence of code so far is the JS demo (`site/src/js/pipeline-core.mjs`, 170 tests) and an empty `tool/` skeleton. Confirm the build is Node in `site/` or a new folder, and the TA/VM answers.
