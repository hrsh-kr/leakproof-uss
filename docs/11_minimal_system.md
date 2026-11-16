# The Minimal System (v2, after the council attacked v1)

Status: v2, 12 Nov 2026. v1 cut the design down to the smallest set that delivers the idea. Seven personas then attacked v1 (red team, cryptographer, threat modeler, HCI, validation, PM, Thiel lens; replies in `dev_council/round3/`). **All seven said "accept with changes"**, so the minimal direction stands. They also found genuine holes in v1. This version fixes them. Where this document and `10_development_process_and_design.md` disagree, **this one wins**. The personas are role-played lenses, not real people.

## 1. Method (unchanged)

List the properties we must deliver; for every role, stage, route and field ask "what property is lost without it?"; cut it if the answer is none, or if it can be done outside the system for free.

| # | Property | Grading link |
| --- | --- | --- |
| P1 | No single person can read the paper before the exam | SR4, SR5 |
| P2 | One compromised setter exposes only a small part | SR8 |
| P3 | A leaked copy points to a seat | SR9, our differentiator |
| P4 | Quiet edits to the record are visible | SR6 |
| P5 | An official can operate it correctly under pressure | usability, 25% |
| P6 | Every candidate gets the same questions for the same marks | F4 |

## 2. What the review found, and what we did about it

| # | Finding | Raised by | Ruling | Day cost |
| --- | --- | --- | --- | --- |
| 1 | Practice accounts and the official demo exam share one server. A classmate could hammer the Dean's account, trip the lockout, claim someone's key cards, or sink the 26 Nov demo | S2, S3 | **Accepted.** Two instances: *practice* (own process, port, database, key file, log chain) and *official* (separate; not started until 25 Nov night; ships **no secrets** in the package; random exam IDs; a missing capability returns 404, not 403) | +0.3 |
| 2 | Quorum is not cryptographic: the pool key stays on the VM and the five shares sit in plaintext until claimed, and claiming is a first-login race | S1 | **Accepted.** Seal is **one transaction** that also **deletes every question ciphertext** (so afterwards only the paper locked under the split key exists). Shares are held **wrapped under the server key until verified**, then deleted. Until all cards are verified we say plainly that the quorum is a software rule | +0.1 |
| 3 | A lost card or forgotten passphrase is found only at release, with no recovery | H1, P1 | **Accepted.** **Verify-on-claim:** the card is shown again until the holder pastes it back and the server checks its hash; the exam page shows "cards verified n of 5"; **release is locked until at least 4 are verified** (so one loss still leaves 3). Before verification the owner can re-fetch the card; after it, no recovery (stated) | +0.5 |
| 4 | Practice mode gives one account all five key slots, which contradicts "three different key holders" and makes SR4 false | V2, P1, S3 | **Accepted.** G1 counts **distinct key cards**. Practice shows a PRACTICE banner and a card picker. SR4 is reworded per card. In the official instance a database constraint allows one card per account | +0.1 |
| 5 | A lone tester picks from a pool of one setter, so P2 cannot be shown | V2 | **Accepted.** Each practice exam is seeded with **4 simulated setters** (clearly labelled). **Seal refuses unless every topic has at least 2 distinct setters** | +0.25 |
| 6 | The plain SHA-256 chain with its head on the same server can be recomputed by anyone who can write to the database; truncation goes undetected | S3, S1 | **Accepted.** Restore the **keyed chain** (key outside the database). **The head hash is printed in the footer of every copy and shown on every approval screen**, so it is anchored in the physical world and in key holders' browsers. The public log page checks that a given head appears in the chain. Practice resets create a **new exam ID** and never delete log rows | +0.2 |
| 7 | "Every print is logged and capped" is an overclaim: copies arrive in one HTML response | S3 | **Accepted.** Copies are fetched **one seat at a time**; each fetch is logged; distinct seats cannot exceed the entered seat count; reprints of the same seat are counted | +0.1 |
| 8 | Window and seat count are set by the exam cell, so only the quorum gate is independent | S3 | **Accepted, with honest wording.** Key holders see the window and seat count, and the approval is **bound to the request nonce, the seat count and the window** (and the two words derive from all three). The gates are a guard against accidental early release, not against a malicious exam cell | +0.1 |
| 9 | A seed hash logged at Seal commits to nothing | S3, S1 | **Accepted.** We claim the draw is **replayable**, not "unsteerable". The draw seed is **revealed when the exam is released** so anyone can re-run the draw | +0.25 |
| 10 | The leak trace is now just one route, yet it is our differentiator | A3 | **Accepted.** The matcher is an **acceptance test**: a 3-question fragment with a cropped header names the seat; a wrong order names none. The route is a **POST**, so paper content stays out of URL logs. Scripted trace if not working by noon on 15 Nov | +0.75 |
| 11 | Neighbouring seats could share an order; no code enforced it | V2 | **Accepted.** If seat n matches seat n minus 1 in the first three positions, regenerate | +0.25 |
| 12 | Fairness is asserted but never shown to the candidate | V2, H1 | **Accepted.** Each copy prints a **"same questions, same marks" line and a set hash** (a hash of the question set, identical on every copy) | +0.1 |
| 13 | The key holder merely clicks; the two words are not really checked | H1 | **Accepted.** The key holder **types the two words**, an equal-size **Refuse** button sits beside Approve, and the words appear **only on the exam cell's screen** | +0.1 |
| 14 | Notifications are cut, so a key holder does not know a request exists | H1 | **Accepted.** A **"Waiting for you"** row on Home and a **5-second refresh** on the Release page | +0.15 |
| 15 | Phase I Musts R-S06 (signed submissions) and R-S08 (committed seed) are dropped | V2 | **Label design-only**, state it in the video; do not spend time on them | 0 |
| 16 | Per-question keys add nothing once Seal deletes the pool | S1 | **Accepted.** Each question is encrypted under the server key with authenticated data binding exam and question; no per-question keys | -0.25 |
| 17 | Drop the CLOSED stage | A3 | **Accepted.** Trace and seed reveal are available once the exam is RELEASED | -0.1 |
| 18 | The exam cell sees the paper at print time; a trace names a seat, not a person; the likeliest leaker is whoever holds the printed copies | A3 | **State all three as limits** in the guide and video | 0 |
| 19 | Self-register versus a shipped list of 80 tester accounts | S2, V2 | **Self-register on the practice instance only** (rate limited, capped, one account per roll number; see section 5). With the instance split, a shipped list is no longer a takeover risk of the official exam, but anyone could still log in as another tester, and the passphrase would not be private | +0.3 |
| 20 | A key card encrypted under a passphrase (H1 asks: drop it for a 12-word card) | H1 | **Keep the passphrase.** A card that is only a word list is exposed if the file leaks; the extra step costs about 0.25 day | 0 |

**Net effect on effort.** The additions total about **3.0 days** against the removals of about **0.35**. The minimal design is still smaller to attack and test than `10`, but v1's "saves 1 to 1.5 days" was wrong: after the fixes it **does not save build time**, it saves **surface**. We need a tiered plan (section 7) instead of hoping everything fits.

## 3. The minimal people, process and system (revised)

**Three kinds of people.** Setter (many) · Key holder (five officials) · Exam cell (one or two; holds `run` and `print`). The auditor is the public log page. One account type; four capabilities (`submit`, `run`, `hold`, `print`) in one `assignments(account, exam, capability)` table. One rule replaces the separation-of-duties matrix: **one key card per account** in the official instance.

**Three stages.**

```
 COLLECTING --seal--> SEALED --release--> RELEASED
 setters submit        paper locked, cards   3 of 5 approve (cards verified),
 (cell waits)          issued, pool deleted  copies printed per seat, trace and seed reveal open
```

Seal precondition: every topic has at least 2 distinct setters, every topic has at least one question, and no one setter contributes more than one question per topic.

**Three release gates**, all bound into the approval: **G1 quorum** (three different verified cards) · **G2 window** (inside the print window) · **G3 seats** (a seat count within the registered limit). Each failure names the gate, who must act, and the next step ("2 of 3 approved. Waiting for: Dean, Registrar"). Integrity is inherent: decryption fails if anything is wrong.

### Cryptography, summarised

| Step | Mechanism |
| --- | --- |
| Submit | Server encrypts the question under the server key (AES-256-GCM, random IV, authenticated data = exam and question) and stores only ciphertext |
| Seal | One transaction: draw per topic from the OS random source; unwrap the drawn questions; build the paper; encrypt under a **fresh raw 256-bit paper key**; split the paper key 3 of 5 (Shamir over the 521-bit Mersenne prime field, duplicate shares rejected); wrap each share; derive the **copy secret**; **delete every question ciphertext** |
| Cards | Each key holder claims once: the browser encrypts the share under their own passphrase and shows text to copy; they paste it back to verify; only then does the server delete its wrapped copy |
| Release | Approvals carry the share, bound to nonce, seat count and window; the server holds shares in memory only, combines at quorum, wipes; the paper decrypts in memory |
| Copies | One seat per request; order from an HMAC-SHA-256 generator keyed by the copy secret (not the weak 32-bit generator); copy ID is an HMAC tag; adjacent seats differ; each copy carries the set hash, "same questions, same marks", and the log head |
| Log | Hash chain keyed outside the database; head printed on copies and shown on approvals |

### The routes (about 16)

```
POST /login          POST /logout
GET  /exams                                     my exams, capabilities, "waiting for you"
POST /exams                    run (official build only)
POST /exams/:id/questions      submit           one per topic
GET  /exams/:id/questions      submit           my own only
DELETE /questions/:id          submit           mine, before sealing
POST /exams/:id/seal           run              draw + encrypt + split + delete pool
GET  /exams/:id/card           hold             fetch my card (re-fetchable until verified)
POST /exams/:id/card/verify    hold             paste back to verify
POST /exams/:id/release        print            request release with seat count
POST /releases/:id/approve     hold             type the two words, paste card, approve or refuse
GET  /releases/:id             print, hold      gate states (5-second refresh)
GET  /releases/:id/copy/:seat  print            one seat's copy, logged, capped
POST /exams/:id/trace          run              after RELEASED
GET  /public/log               none             chain, head, "check this head"
POST /practice/register        none             practice instance only; rate limited
```

Every route runs the same middleware: session, CSRF, capability check (404 if none), stage check, schema, size cap. No file uploads anywhere. No second way into anything.

### What stays cut

Multi-centre support, a second ceremony, the four-of-five fallback UI (three of five already tolerates two absent holders, and **reprinting the same seat is idempotent**), uploads, assignments, question editing, email and notifications beyond the "waiting for you" row, PDF generation, rich content (plain text only, rendered with `textContent`), per-question keys, signed client-side submissions and committed seeds (design-only), per-tester sandbox endpoints other than the one rate-limited registration route.

## 4. Updated security requirements (wording that is now honest)

| ID | Requirement | Change from `10` |
| --- | --- | --- |
| SR1 | Deny by default; unlisted route fails the build; no capability returns 404 | Adds 404 |
| SR2 | Login: scrypt, backoff, per-IP limit, cookie flags, CSRF | Practice and official are separate instances, so a lockout in one cannot affect the other |
| SR3 | A setter reads only their own questions; the exam cell sees counts only | Unchanged |
| SR4 | **Fewer than three verified key cards open nothing; after verification the server no longer holds any share.** In the practice instance one account can hold several cards, labelled | Per card, not per account |
| SR5 | Release fails closed on quorum, window and seat count; each is bound to the approval | Three gates |
| SR6 | Keyed chain; head printed on every copy and shown on approvals; a given head must appear in the chain; truncation shows as a missing head | Restored; anchor is physical |
| SR7 | Canary plaintext absent from database, files, logs and error bodies after a full run, **including that no question ciphertext remains after Seal** | Adds post-Seal check |
| SR8 | The draw is **replayable**: the seed is revealed at release | Not "unsteerable" |
| SR9 | Per-seat copies are unpredictable, adjacent seats differ, a cropped fragment of 3 questions names the seat, and a wrong order names none | Adds acceptance test |
| SR10 | XSS, SQL, traversal and oversize inputs are inert | Unchanged |
| SR11 | Errors and logs leak nothing | Unchanged |
| SR12 | A trace names a seat, not a person, and is a lead, not a verdict | Reworded |

## 5. Practice and the official demo (two instances)

| | Practice instance | Official instance |
| --- | --- | --- |
| Who uses it | 8+ classmates, alone, 18 to 25 Nov | The 26 Nov live demo and the video |
| Accounts | Self-registered: roll number plus a course code in the guide; one account per roll number; passphrase shown once; capped and rate limited | Pre-created, distinct, passphrases **not** in the package |
| Exam | Seeded per tester: 4 simulated setters, 5 labelled key cards held by the tester, banner "PRACTICE" | One real exam, real separate people |
| Data | Disposable; reset creates a new exam ID; log rows never deleted | Started on 25 Nov night; not running during testing |
| Secrets | Own key file and log key | Own key file and log key; none shipped |

## 6. What the minimal system gives up (say it in the video)

- One exam, one place, one paper; scale to many centres is design-only.
- If three or more key holders are unreachable, the system cannot print; that is a manual process.
- The VM operator and server handle plaintext for seconds at Seal and Release. The exam cell sees the paper at print time.
- Three colluding key holders can open the paper early; we log it.
- Until every card is verified, the quorum is enforced by software; after it, by cryptography.
- The window and seat count are set by the exam cell; they guard against accidents, not against a malicious cell.
- A trace names a seat, not a person; the likeliest leaker is whoever holds the printed copies.
- We cannot stop a photo of a printed copy; we trace it. The log shows tampering, it does not prevent it.
- Design-only: signed client-side submissions, committed seeds, revocation, print-before-entry custody, reviewer, case replies, retention.

## 7. Tiers, because it will not all fit

Remaining build time is about four days (12 to 15 Nov), then a pilot day (16) and a packaging day (17). A realistic plan:

| Tier | Items | Days |
| --- | --- | --- |
| **MUST** (security-correct core) | Two instances (+0.3); crypto fixes from `10` section 5; Seal as one transaction, pool deleted, no per-question keys (-0.25); shares wrapped, verify-on-claim, re-fetch (0.6); G1 counts distinct cards and practice banner (0.1); keyed chain plus head on copies and approvals (0.2); per-seat fetch logged and capped (0.1); approval bound to nonce, seats and window (0.1); simulated setters and Seal preconditions (0.25); windowed trace POST (0.75); practice self-registration (0.3) | about 2.5 on top of the base build |
| **SHOULD** | Adjacent-seat rule (0.25); same-set hash and "same marks" line (0.1); typed two words and Refuse (0.1); "Waiting for you" and refresh (0.15); seed reveal (0.25) | about 0.85 |
| **STRETCH** | Key holder enrols their own key before Seal (0.5, makes the quorum cryptographic from the start); 12-word card; extra polish | |

**Cut order if time slips:** SHOULDs first (adjacent-seat rule, seed reveal, refresh), then practice self-registration becomes a shipped list on the practice instance only, then the windowed trace becomes a scripted trace (said so), then browser card encryption becomes a passphrase typed at approval (**P1's checkpoint: decide at noon on 14 Nov, fallback agreed now**).

**Schedule (replaces the one in `10`; same dates and gates).** **Thu 12:** TA email, token rotation, crypto fixes with tests, skeleton with login, capability middleware, route matrix test. **Fri 13:** exam, questions, encryption, Seal transaction, two instance configs, VM hello-world with login live (gate). **Sat 14:** cards with verify, release, gates, per-seat copies, practice registration; draw-to-print working on the VM by 22:00 (gate; this is the day P1 says will slip, so SHOULDs wait). **Sun 15:** trace and its acceptance test, keyed chain and head on copies, public log, break-it day, `make evidence`; freeze at 22:00. **Mon 16:** guide, pilot with three strangers, fixes. **Tue 17:** package; post by 18:00. The official instance is not started until 25 Nov night.

## 8. Decisions for you

1. **Practice accounts:** self-register on the practice instance (my recommendation, +0.3 day, passphrase private to each tester) or a shipped list of numbered accounts (free, but anyone can log in as anyone)? Self-registration re-opens one door, behind limits, on disposable data.
2. **Key card:** keep the passphrase (my recommendation) or switch to a 12-word card (saves 0.25 day, but a leaked card file would be usable)?
3. **Shares:** accept wrapped shares deleted on verify (my ruling) or spend 0.5 day to have each key holder enrol a key before Seal (stronger, a stretch item)?
4. **Anchoring the log head:** printed on every copy and shown on approvals, plus a hand post to the team channel after each stage. Is that enough, or do you want a second automatic location?
5. **Limits in the video:** agree to state, in plain words, that a trace names a seat and not a person, and that the exam cell sees the paper at print time?
6. **Official instance off during testing:** agree it stays unstarted from 17 Nov to 25 Nov night, so classmates only ever attack the practice instance?

If you answer yes to these, I will update `10` and the user-flow doc to match and start Thursday's work: the crypto fixes with tests, then the server skeleton with login, the capability middleware and the route-matrix test.
