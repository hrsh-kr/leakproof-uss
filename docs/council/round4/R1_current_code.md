# R1: Audit of our current code (S2/V1, red-team and verification lens)

Scope: `/Users/hrshkr/Downloads/sem8/uss/project/app/`. Every file was read in full: server.mjs, src/*, public/*, tests/*, deploy/*, scripts/, SECURITY.md, USER_GUIDE.md, README.md.
Method: code reading, `npm test` (30/30 pass, Node 25.0.0 locally), and a probe server on port 8790 with a temporary data directory, since deleted. Port 8080 and app/data were not touched. Probe scripts are in the session scratchpad (`/private/tmp/claude-501/-Users-hrshkr-Downloads-sem8-uss/29dd3dd2-a7a9-4bdd-b465-6e19cbfa674a/scratchpad/{logcost,forensic,forensic2,restart}.mjs`).
"Verified" = reproduced. "Unverified" = read from code or inferred, not run. nginx is not installed locally, so nothing behind nginx was run.

---

## 1. Security measures we already have

| # | Measure | Where | Protects | Test that proves it |
|---|---|---|---|---|
| S1 | One route table and one middleware chain: rate limit, session, CSRF/Origin, capability, body | app.mjs:141-299 | Missing auth on a route (SR1) | `SR1 route matrix…` (iterates `app.routes`) |
| S2 | No capability returns 404, the same answer as "no such exam" | app.mjs:279-285 | Exam-id probing, IDOR (SR1) | `SR1 route matrix…`, `SR3 setters read only…` |
| S3 | Route params must be 32-hex or 1-4 digits | app.mjs:261 | Injection and odd ids in paths | `SR10 inputs…` (`' OR 1=1` returns 404) |
| S4 | Practice-only routes return 404 on the official instance | app.mjs:258 | Self-registration on official | `SR1 official instance…` |
| S5 | One key card per account on official; slot uniqueness | exam.mjs:38-46 | One person holding two shares | `SR1 official instance…` |
| S6 | scrypt N=2^15 on the thread pool, per-user salt | crypto.mjs:30-40 | Offline cracking; login flood freezing the event loop | `passwords…`, `FCS-G1/G2 a login flood…` |
| S7 | Same error for unknown user and wrong passphrase, plus a dummy hash | app.mjs:148-150, crypto.mjs:41-42 | Username enumeration at login | `SR2 login…` (message only; timing untested) |
| S8 | Generated 80-bit passphrase and 60-bit recovery code; no user-chosen passwords | crypto.mjs:46-54, app.mjs:42-45 | Weak passwords, guessing | `passwords…` (format) |
| S9 | Backoff keyed on user and IP (exponential, 15 min cap) | app.mjs:84-94 | Brute force without locking out the real user | `SR2 login…` |
| S10 | Server-side sessions storing only sha256(sid); 30 min idle, 8 h absolute | app.mjs:22-37 | Session theft from the DB, stale sessions | `SR2 sessions…` (idle only; **absolute untested**; hash-only storage **untested**) |
| S11 | `__Host-` cookie, HttpOnly, Secure, SameSite=Strict | app.mjs:18-19 | Cookie theft, CSRF | `SR2 sessions…`, `SR2 HTTPS mode…` |
| S12 | New login deletes the presented old session; logout deletes the row | app.mjs:152-160 | Session fixation, replay after logout | `SR2 sessions…` |
| S13 | Session-bound CSRF token (timing-safe compare) plus Origin check on every non-GET | app.mjs:269-277 | CSRF, login CSRF | `SR2 sessions…` |
| S14 | JSON only (415), 16 KB cap (413), object bodies only | http.mjs:24-48 | Form-post CSRF, oversize bodies | `SR10 inputs…` (Content-Length path only; chunked path see W17) |
| S15 | Field validation for questions: topic, text 5-500, 4 distinct options 1-200, correct 0-3 | exam.mjs:54-65 | Malformed or abusive input | `SR10 inputs…` |
| S16 | Parameterised SQL everywhere | all `db.prepare(...).run/get(?)` | SQL injection | `SR10 inputs…` |
| S17 | Client builds DOM with textContent only; no HTML sinks | public/app.js:6-19 | Stored and reflected XSS | `SR10 the client renders…` (static grep) |
| S18 | CSP (no inline script or style), XFO DENY, nosniff, no-referrer, COOP, CORP, Permissions-Policy, HSTS | http.mjs:5-14, app.mjs:244-245 | XSS impact, clickjacking, MIME sniffing | `SR10/SR11 security headers…` (/, /app.js, /api/me, /nope, /api/nope) |
| S19 | Static files are an in-memory map built at startup | http.mjs:62-69 | Path traversal | `SR10 inputs…` (raw traversal requests) |
| S20 | 500 returns a reference code only | app.mjs:295-297 | Stack and path disclosure | **Untested** (the test checks 4xx bodies only). I verified a 500 by hand (W4). |
| S21 | AES-256-GCM with AAD binding exam/question/slot | crypto.mjs:14-26, exam.mjs:74,133 | Ciphertext swapping, tampering | `AES-GCM: round trip…` |
| S22 | Shamir 3-of-5 over 2^521-1; duplicate shares and out-of-range y refused | crypto.mjs:57-95 | Fewer than 3 cards opening the paper | `SR4 Shamir 3 of 5…` |
| S23 | Seal is one transaction: draw, encrypt, split, wrap cards, null question ciphertexts | exam.mjs:106-144 | Half-sealed state; question pool surviving | `SR7…`, `seal preconditions…` |
| S24 | Seal refused unless every topic has 2 or more distinct setters and 5 holders | exam.mjs:110-114 | P2 (one setter controls a topic) | `seal preconditions…` |
| S25 | Verify-on-claim: the server deletes its wrapped share after the holder proves the card | exam.mjs:158-167 | Server holding the shares (SR4) | `SR4 release is locked…` (logical only; see W9) |
| S26 | Release locked until 4 of 5 cards are verified | exam.mjs:186-187 | Release with an unrecoverable card set | `SR4 release is locked…` |
| S27 | Gates G1 quorum, G2 window, G3 seats; request bound to nonce, seats and 15 min TTL; two words; refusal closes the request | exam.mjs:179-257 | Unauthorised or replayed release (SR5) | `SR5 gates…` |
| S28 | Approval share must hash-match its own slot; one answer per slot | exam.mjs:231, 249 | Cross-slot share reuse, double approval | `SR4 release is locked…` |
| S29 | Opened paper kept in memory only; a restart re-locks it | exam.mjs:19, 299-301 | Plaintext paper at rest | `restart: the paper locks again…` (simulated via `_opened.delete`) |
| S30 | Per-seat order from a 256-bit HMAC stream; neighbours never share the first 3; HMAC copy id | exam.mjs:281-316 | Copying from a neighbour; forged copy ids (SR9) | `SR9 copies…`, `SR9 the order generator…` |
| S31 | Trace logs counts only, never the seat | exam.mjs:344-346 | Public accusation from the log (SR12) | golden path |
| S32 | Draw seed revealed after release; draw is replayable | exam.mjs:349-354, 364-371 | Rigged draw (SR8) | `SR8 …` (both) |
| S33 | HMAC-keyed hash chain, key outside DB, append-only triggers, allow-listed detail fields | log.mjs, db.mjs:42-43 | Quiet log edits (SR6), secrets in the log | `SR6 log…` |
| S34 | Public log without actors; check-head | app.mjs:228-239 | Copy authenticity check without names | `SR6 the log head…` |
| S35 | Rate limits: global 600/min per IP, auth 10/min per IP, sensitive 20/min per account, register 5/day per IP, 300 accounts in total, 10 practice exams per account; 429 + Retry-After | app.mjs:166-169, 224, 256-267; config.mjs:18-24 | Brute force, sign-up abuse | `FCS-G1/G2 rate limits…`, `FCS-G1 no unverified mass sign-up…` |
| S36 | Limiter with a capped key map | http.mjs:72-83 | Memory exhaustion of the limiter | untested |
| S37 | Socket limits: headersTimeout checked every 1 s, keep-alive 5 s, per-IP socket cap, maxHeaderSize 8 KB, 40 headers | server.mjs:20-45 | Slowloris, connection floods | `FCS-G1/G2 connection flood…` |
| S38 | `X-Real-IP` trusted only from 127.0.0.1 with LP_TRUST_PROXY; nginx overwrites it | app.mjs:74-78, proxy.conf:6 | IP spoofing to dodge limits | `SR2 login…` (uses the header) |
| S39 | nginx: TLS 1.2/1.3, limit_req, limit_conn 20, timeouts, 32 KB body, gzip off, server_tokens off, dotfile block, http→https | deploy/nginx.conf | DoS, BREACH, fingerprinting | untested (deploy) |
| S40 | systemd sandbox: own user, ProtectSystem=strict, read-only keys, MemoryMax, Restart=always | deploy/leakproof@.service | Blast radius; recovery after a crash | untested |
| S41 | iptables connlimit 50 per IP; Node ports dropped from outside | deploy/firewall.sh | SYN and connection floods | untested |
| S42 | Keys generated on the VM at 0440 root:leakproof, never in git | install.sh:10-17, config.mjs:29-36 | Key leakage via repo | untested |
| S43 | Recovery rotates both secrets and kills all sessions | app.mjs:179-194 | Lost passphrase; account takeover persistence | `FCS-G1 no forgotten-passphrase…` |
| S44 | Card encrypted in the browser with PBKDF2 600k + AES-GCM, AAD exam\|slot | public/app.js:78-96 | Card file theft without the passphrase | **untested** (no browser or WebCrypto test) |
| S45 | No user directory; explicit response fields | app.mjs:195-199 | Data over-exposure (FCS-G1 search leak) | `FCS-G1 no user directory…` |

## 2. Usability measures we already have

| Measure | Evidence |
|---|---|
| "Next step" box always states what to do now, computed per role and stage | app.js:186-206, 221 |
| Three-stage progress strip with `aria-current="step"` | app.js:185, 220 |
| Default tab = the tab where the next step lives | app.js:211-214 |
| Home "Waiting for you" list (verify card, approve request) with links | app.mjs:119-136, app.js:176-178 |
| Refusals are plain sentences that say what to do ("Ask key holders to verify…", "Request release again") | exam.mjs throughout, e.g. 187, 211-213, 300 |
| Server errors shown next to the button that caused them; button disabled while running | app.js:55-63 |
| Secrets shown once with Copy, Download and a required "I have saved" checkbox | app.js:120-133 |
| Recovery path from the login page | app.js:110, 153-165 |
| Two-step card claim (create, then prove by paste-back), with re-fetch allowed until verified | app.js:353-386, exam.mjs:152-157 |
| Card file load from disk (no retyping), local only | app.js:31-38 |
| Client-side checks before slow crypto (10+ chars, the two entries match, mark the correct option) | app.js:328, 360-361 |
| Seal confirmation panel ("cannot be undone") | app.js:234-238 |
| Release screen auto-refreshes every 5 s; shows gates as icon + word + colour; "Request again" when closed | app.js:262-279 |
| Seat grid shows printed seats and reprint counts | app.js:280-287 |
| Practice banner explains that one person plays every role | app.js:449-450 |
| "Start a fresh practice exam" (up to 10) | app.js:172-174, app.mjs:222-227 |
| Status always uses icon + text + colour (not colour alone) | app.js:22, styles.css:68-71 |
| Labels tied to inputs; aria-labels on option inputs, radios and seat buttons; role=alert errors; aria-live toast; focus moved to main on page change | app.js:26-29, 323-324, 287, 23, index.html:19, app.js:20 |
| `:focus-visible` outline, 42 px touch targets, reduced-motion, dark mode, viewport meta, responsive grids | styles.css:29, 45, 120, 11-18, index.html:5 |
| Print stylesheet hides chrome on copies | styles.css:115-119 |
| Autocomplete hints (username, current-password, new-password) for password managers | app.js:104-105, 356 |
| Practice is self-contained: 4 simulated setters, all roles, 5 labelled cards | app.mjs:55-71 |

---

## 3. Gaps and weaknesses, ranked by likelihood × damage (8+ attackers for a week)

### W1. One HTTP request crashes the server: **CRITICAL, verified**
- **Evidence:** `new URL(req.url, 'http://x')` sits at app.mjs:246, outside the `try` at 248. `handle` is async and server.mjs:21 calls `app.handle(req, res)` without a `.catch`, so the throw becomes an unhandled rejection and Node exits.
- **Reproduced:** `printf 'GET //a:b HTTP/1.1\r\nHost: x\r\n\r\n' | nc 127.0.0.1 8790` kills the process (`TypeError: Invalid URL … app.mjs:246`). The targets `//[`, `//[::1`, `http://[` and `//x:99999/` also kill it.
- **Attack:** fuzzers (ZAP, Burp intruder, nikto) send paths like these by accident. One loop sending a request every 2 s keeps systemd (RestartSec=2) in a restart loop: a permanent outage from one laptop.
- **Side effects of each crash:** the open paper re-locks (S29), pending approvals are lost (W3), and every in-memory rate limit and login backoff resets.
- **Behind nginx: unverified.** `proxy_pass http://$lp_upstream;` has no URI part, so nginx forwards the client's raw request URI. I expect it to pass, but did not run it.
- **Smallest fix:** move `new URL` inside the `try` and answer 400 on failure. Add `.catch(() => res.destroy())` at server.mjs:21 and a `process.on('unhandledRejection', log)` safety net. Add a test with `//a:b` and `http://[`.

### W2. Unauthenticated endpoints re-verify the whole log on every call; any account can grow the log: **HIGH, measured**
- **Evidence:** `GET /api/public/log/:id` (app.mjs:228-233, no auth) and `POST /api/public/check-head` (234-239) both call `log.verify()`, which walks every row and HMACs it on the main thread (log.mjs:23-30). `forExam` returns every entry of the exam with no cap (log.mjs:33).
- **Measured** (logcost.mjs, this Mac): 10k entries 32 ms; 100k 326 ms; 300k 962 ms of blocking per request. The VM is probably slower.
- **Growth vector:** every `GET /copies/:seat` reprint appends a row (exam.mjs:305-307), and so does every `GET /cards/:slot` before verify (exam.mjs:155). Both are capped only by the 600/min global limit, and nginx `lp_api` (10 r/s) allows the same rate. One IP adds about 36k rows an hour, so 300k rows in about 8 h; several attackers get there faster.
- **Attack:** after that, 10 req/s to `/api/public/log/<own exam id>` keeps the event loop busy permanently. The same request also builds a multi-MB JSON response, against MemoryMax=512M. The damage gets worse as the week goes on.
- **Smallest fix:**
  1. Keep `{seq, hash}` of the last verified row in memory and verify only newer rows (O(new)).
  2. Return at most the last ~200 entries plus a count.
  3. Log only the first `card.fetched` per slot, and throttle reprints per seat (or count them in `copies.fetches` without a new row after the first N).

### W3. A restart during approvals leaves the release stuck at "4 of 3 approved": **HIGH, verified**
- **Evidence:** approvals are written to the DB (exam.mjs:253), but the shares live only in the in-memory `pending` Map (exam.mjs:20, 251-252). After a restart, G1 counts DB approvals (exam.mjs:206) while opening counts in-memory shares (255).
- **Reproduced** (restart.mjs, 4 verified cards; slots 1 and 2 approve; restart; slots 3 and 4 approve):
  - state stays `pending`;
  - G1 shows ✓ "Quorum: 3 of 3";
  - next reads "4 of 3 approved. Waiting for: no verified card left";
  - slot 1 cannot re-approve ("already answered").
- **UI dead end:** the exam-cell screen shows "Request again" only when `state !== 'pending'` (app.js:275), so the cell waits out the 15 min expiry.
- **Likelihood:** an attacker can trigger the restart with W1. A tester would report it as a broken release with a screenshot.
- **Smallest fix:** at startup in `makeExams`, run `UPDATE releases SET state='expired' WHERE state='pending'` and log it. Also make `next` say "Server restarted; request release again" whenever approvals ≥ 3 and the paper is not open.

### W4. A malformed cookie returns 500 on every session route: **MEDIUM, verified**
- **Evidence:** `decodeURIComponent` is called on every cookie value (http.mjs:54) and throws URIError.
- **Reproduced:** `curl -H 'Cookie: lp_sid=%E0%A4%A' /api/me` returns 500 "Something went wrong. Quote reference …". Login also calls `session(req)` (app.mjs:152), so the user cannot log in either until the cookie is cleared.
- **Report risk:** a tester can file "unhandled exception / 500 on crafted cookie". Any cookie name on the same host triggers it, including one set by another service on the same IP.
- **Smallest fix:** wrap the decode in try/catch and skip bad cookies.

### W5. No answer key for shuffled copies (missing functional feature): **MEDIUM-HIGH likelihood, medium damage**
- **Evidence:** each seat gets its own question and option order (exam.mjs:281-316), and `copy()` correctly strips `correct`. But no route, screen or guide line produces a per-seat marking key: `grep -i answer` over src, public and both docs finds nothing.
- **Impact:** an examiner cannot mark the papers, and P6 ("same questions, same marks", 11_minimal_system.md:16) cannot be demonstrated. Phase I found that 49% of students fear wrong answer keys.
- **Report risk:** a thoughtful tester reports it as missing core functionality.
- **Smallest fix:** add `GET /api/exams/:id/key/:seat` (cap `run`, only while open) that returns `lay.map(x => 'ABCD'[x.opts.indexOf(paper[x.q].correct)])`, plus an "Answer key" button next to each seat.

### W6. Shared-IP testers lock each other out; a few IPs can fill practice: **MEDIUM (network unverified)**
- **Evidence:**
  - Registration allows 5 per IP per day, and the count includes attempts with a taken username (app.mjs:166; the test comment at security.test.mjs:130 confirms).
  - One auth bucket of 10/min per IP is shared by login, register, recover **and** check-head (app.mjs:234, 259).
  - nginx `lp_auth` allows 10 r/min, burst 5, per IP (nginx.conf:5, 46-47).
  - The total cap is 300 accounts (config.mjs:18).
- **Scenario A:** if classmates reach the VM through hostel Wi-Fi or lab NAT, the 6th person that day gets "This network has created 5 practice accounts today", and a lab session gets 429s at login. This is a lone tester stuck at step 1.
- **Scenario B:** one attacker with about 60 IP-days (switching a phone hotspot on and off) fills the 300 accounts, and everyone else gets 503 "Practice is full".
- **Unverified:** whether testers' source IPs are distinct or NATed. Ask the TAs.
- **Smallest fix:**
  - Raise `LP_REGISTER_PER_IP` to about 30 and count only successful registrations.
  - Raise the account cap to about 2000; accounts are a few KB each.
  - Take check-head out of the auth bucket.
  - Loosen nginx `lp_auth` to about 30 r/m.

### W7. The client shows "Something went wrong." for every non-JSON error: **MEDIUM (usability)**
- **Evidence:** in `api()`, `res.json()` fails, `data={}`, and the message falls back to "Something went wrong." (app.js:46-50). nginx 429 (limit_req), 413 and 502 (during a W1 restart) all return HTML bodies. A network failure surfaces as the raw "Failed to fetch".
- **Impact:** under pressure the user cannot tell whether to wait, reload or report.
- **Smallest fix:** map statuses in `api()`: 429 "Too many requests: wait a minute"; 502/503 or a fetch error "Server is restarting: try again in a few seconds"; 413 "Too long".

### W8. Some responses carry no security headers: **MEDIUM likelihood, low damage**
- **Evidence:**
  - nginx adds no headers of its own (nginx.conf has no `add_header`). Its own responses therefore lack CSP, XFO, nosniff and HSTS: `/.env` and other blocked paths (`return 404`, nginx.conf:44), limit_req and limit_conn 429s, 413, the 502 during restarts, and the port-80 301.
  - Node's `clientError` raw replies (400/408/431, server.mjs:42-45) also have none.
  - `HEAD /` returns 404 (app.mjs:250 serves GET only; verified).
- **Report risk:** scanner output ("Missing anti-clickjacking header on /.env") is a common student report.
- **Smallest fix:** in the 443 server block, set `add_header … always` for nosniff, XFO, HSTS and a minimal CSP on nginx-generated responses, and `proxy_hide_header` the same names to avoid duplicates. Alternatively, drop the dotfile `location` and let the app's 404 answer (it already has the headers). Treat HEAD like GET for static files.

### W9. "Deleted" secrets stay on disk; SR4 and SR7 overstate: **LOW likelihood, high for the poster/video claim, verified**
- **Evidence:** `UPDATE … SET ct = NULL` (exam.mjs:140) and `share_wrapped = NULL` (exam.mjs:164) leave old bytes in SQLite free space and the WAL; `secure_delete` is 0.
- **Reproduced** (forensic.mjs) after seal and verifying all 5 cards:
  - before a checkpoint: 40/40 question ciphertexts and 5/5 wrapped shares are still in the data files;
  - after `wal_checkpoint(TRUNCATE)`: 29/40 and 2/5 remain.
  - `server.key` on the same VM decrypts them.
- **SR7 test is vacuous:** flow.test.mjs:117-129 searches for a plaintext canary, but questions are encrypted before they reach disk, so the test passes whatever happens.
- **Fix, verified** (forensic2.mjs, 0/40 and 0/5): add `PRAGMA secure_delete = ON;` to the db.mjs SCHEMA, and run `PRAGMA wal_checkpoint(TRUNCATE)` after seal and after each verify. Change the SR7 test to search for the stored ciphertext bytes.

### W10. One key holder can veto any release; refusing needs no card: **LOW in practice, design weakness on official**
- **Evidence:** the `refuse` branch (exam.mjs:233-241) runs before the verified, words and share checks. A holder with an unverified card, anywhere, closes every request.
- **Impact:** 3-of-5 is meant to tolerate 2 missing or hostile holders, but one hostile holder blocks release indefinitely. The exam cell can re-request; each one gets refused again.
- **Fix:** require the two words for refusal too, and record a refusal as an objection that stays visible without closing the request, or close only after 3 refusals. Or state the veto openly in SECURITY.md §4 as deliberate.

### W11. The two-word check can be guessed online; failed attempts are silent: **LOW**
- **Evidence:** 2 words from 128 = 14 bits (exam.mjs:175). Wrong words are neither logged nor counted (exam.mjs:245-247). The sensitive bucket allows 20/min per account (app.mjs:267), so about 300 guesses fit in the 15 min TTL, roughly a 1.8% success chance per request.
- **Fix:** log `release.words_failed` and close the request after 3 failures per slot.

### W12. Shares from replaced or expired requests are never wiped from memory: **LOW**
- **Evidence:** `requestRelease` marks old requests `replaced` (exam.mjs:188) but leaves `pending.get(oldRid)` in place. Expired requests are refused at decide:230 and also kept. Plaintext shares sit in RAM until a restart, which contradicts the intent stated at exam.mjs:276.
- **Fix:** wipe and delete the `pending` entries for replaced or expired requests in both places.

### W13. Claims in SECURITY.md, USER_GUIDE.md or the UI not backed by code or tests: **MEDIUM (presentation risk)**
SECURITY.md:3 says "Every claim below has a test". These are not tested:
- the 8 h absolute session timeout (app.mjs:10, 34);
- "only a hash of the id is stored";
- dummy-hash timing equality;
- browser card encryption, PBKDF2 600k + AES-GCM (`makeCard`/`openCard`, app.js:78-96, never run in any test);
- "unexpected errors return a reference code only" (no 500 is tested);
- nginx, firewall and systemd limits;
- "every screen was exercised end to end in a real browser" (unverified).

Other mismatches:
- "Typed confirmation before an irreversible step" (SECURITY.md:40): seal, the main irreversible step, is a click confirmation (app.js:234-238).
- The UI says "After release the random seed is public, so anyone can confirm" (app.js:305), but `/seed` needs the `run` capability (app.mjs:221). The public cannot fetch it, and no replay tool exists.
- SR4 "server holds no share" and SR7 are false at the byte level (W9).
- USER_GUIDE.md:6-7 still has the placeholders `<VM address>`, `<printed by install.sh>`, `<from install.sh>`.
- README says 30 tests: true.

### W14. A lone tester faces about 30 form steps before seeing a copy: **MEDIUM (usability, Phase I "steps heavy")**
- **Evidence:** MIN_VERIFIED=4 (exam.mjs:7). Each card needs: passphrase twice, Create, Download, Load file, passphrase, Verify (app.js:353-386). Each of 3 approvals needs: words, Load file, passphrase (app.js:387-402).
- **Speed:** PBKDF2 600k runs on every create, verify and approve (app.js:80), with only a disabled button as feedback. That is probably several seconds on a phone (unverified).
- **Smallest fix (practice only):**
  - A "Use one passphrase for all my cards" option, plus "Create and download all my cards" that produces one file, verified once.
  - A "Working… (about 2 s)" label on the button while crypto runs.
  - Official keeps per-card steps.

### W15. Time and window confusion: **LOW-MEDIUM (usability)**
- Gate messages print UTC (`fmt`, exam.mjs:177), while the exam header shows local time (app.js:24, 219). IST testers see "06:30 UTC".
- The practice print window ends 7 days after registration (app.mjs:57). A tester who registered on 18 Nov hits a G2 refusal on 25 Nov night, and the message does not suggest "Start a fresh practice exam".
- After a restart with no pending request, the cell tab says "Last request: open." (app.js:256) while the paper is locked.
- **Fix:** format times on the client, use a 14-day practice window, and add the hint to the G2 message.

### W16. Accessibility gaps: **LOW-MEDIUM**
- `document.title` never changes (WCAG 2.4.2).
- Tabs have role=tab but no tabpanel, aria-controls or arrow keys (app.js:222).
- The release screen replaces its DOM every 5 s (app.js:269, 278), so keyboard and screen-reader position is lost on the most time-critical screen. Fix: update only the gates and next-step text, in an aria-live region.
- Errors are not linked to fields (no aria-invalid or aria-describedby).
- Clipboard writes have no `.catch` (app.js:130, 380), so failures are silent.
- No skip link.

### W17. Smaller robustness items
- Unguarded awaits: `questionsTab` (app.js:310), and `homePage` reading `me.instance` when `loadMe` failed on a 429 or network error (app.js:169-172). Both leave a blank or stale page.
- A chunked body over 16 KB gets a connection reset instead of a 413 (http.mjs:34 destroys before replying; verified: empty reply).
- `Retry-After` is always 60 even when backoff says N seconds (app.mjs:292).
- Two concurrent recoveries with the same code both succeed (await at app.mjs:185 before the update at 190), so "single-use" is not strict. Low impact: the attacker already has the code.
- `layoutFor` loops forever on a 1-question paper (exam.mjs:285-291). Only reachable through an official JSON with one topic.
- Registration reveals whether a username exists (409, app.mjs:170; verified). This is commonly filed; mention it in §4.
- No change-passphrase or sign-out-everywhere while logged in; it exists only via recovery. May be filed as a missing feature.
- Cookies ignore ports, so practice (443) and official (8443) overwrite each other's session (demo only).
- The self-signed certificate has a CN but no SAN (install.sh:23).
- iptables rules are not persisted across a reboot and are IPv4 only (firewall.sh).

---

## 4. Unnecessary code (Occam)

| Item | Where | Why it can go (or shrink) |
|---|---|---|
| App-level per-IP socket cap | server.mjs:31-41 | Skipped behind nginx (line 35) and duplicated by nginx `limit_conn` and iptables `connlimit`. Three layers for one threat; keep it only if its test is wanted as evidence. |
| iptables DROP for 8080/8081 | firewall.sh:9-10 | Node binds 127.0.0.1 by default (config.mjs:14), so the rule is redundant. |
| `LP_ORIGIN` / `config.origin` | config.mjs:16, app.mjs:271 | Never set by install. |
| Per-fetch `card.fetched` log rows | exam.mjs:155 | Adds nothing after the first fetch and feeds W2. Log the first fetch only. |
| Unused static MIME types `.mjs .ico .png .txt` | http.mjs:60-61 | No such files in public/. |
| Unused CSS `.grid2`, `.mono`; `.wrap` used in index.html:20 but never defined | styles.css:28, 40-41 | Dead. |
| Write-only columns `copies.first_at`, `approvals.at`, `accounts.created` | db.mjs | Stored, never read. Harmless; drop or use (e.g. show the first print time). |
| "Check the draw" card | app.js:297-305 | Promises public verifiability it does not deliver (cell-only, no replay tool). Make `/seed` public after release with a one-line replay command, or cut the card. |
| MIN_VERIFIED=4 in practice | exam.mjs:7 | Doubles the heaviest step for lone testers. Keep 4 on official; consider 3 in practice. |
