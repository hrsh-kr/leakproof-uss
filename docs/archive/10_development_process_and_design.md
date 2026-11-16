# Phase II: Development Process and Design (council outcome)

Status: v1, 12 Nov 2026. Produced from a two-round council of 16 role-played personas (three security, two system design, four HCI/UX/visual, two verification and validation, two PM/dev, three advisors in the style of Collison, Graham and Thiel). The personas are lenses for a student project, not the views of real people. Their full proposals are in `dev_council/round1/` and the three debates in `dev_council/round2/`. This document replaces the schedule in `04_tool_spec_and_test_plan.md` (written for a longer timeline) and narrows `09_build_requirements_and_user_flow.md`.

---

## 1. Where we stand

**Phase I is complete** against the guideline's Phase I list: user study report (32 pages, 3 waves, 103 coded public voices, 52 requirements), design prototypes (guidebook plus live click-through), poster, consent register.

**What Phase II must deliver** (from `Course Project - inclass.pdf`):

| Item | Date | Notes |
| --- | --- | --- |
| Final source code, via the Classroom link | **17 Nov, midnight (5 days)** | At least 50% original |
| Executable on a file server, plus user guide | by 17 Nov | Course VMs available only if we tell the TAs early |
| Peers test our tool | 18 Nov noon to 25 Nov | 8+ classmates, **alone**, must prove each vulnerability with screenshots |
| Poster session 2, live demo | 26 Nov | Usability and security features |
| Recorded video, at most 20 min | 29 Nov | Part A: how studies shaped the tool. Part B: security requirements, how addressed, **classes of vulnerabilities classmates reported, causes, lessons** |

Marks for development: usability of the tool 25%, security requirements satisfaction 25%, quality of software 15%, functional correctness 10%, presentations 25%.

**What we actually have in code:** the working, tested crypto and pipeline logic is in the JS demo (`site/src/js/logic.mjs`, `pipeline-core.mjs`, 170 passing tests). The Python `tool/` is almost empty (a permission matrix file). There are no real users, roles, sessions or exam database anywhere yet.

## 2. What the council agreed (no debate needed)

1. **Stay in Node.** Do not rewrite in Python. We keep the tested crypto and tests; new code is about 3,000 lines against about 300 reused, so the 50% rule holds if the TAs count our own Phase I work (ask).
2. **One vertical slice, not eight roles.** Setter submits, admin draws, system seals, 3 of 5 custodians approve, the centre prints a copy per seat, everything is logged, an auditor can verify and trace.
3. **VM first.** Ask the TAs today; a login "hello world" must be live on the VM by the end of 13 Nov; deploy every day after.
4. **Authorization on the server, deny by default.** One middleware, one role table, a test for every route. Identity comes from the session, never the request body. This is the first thing classmates will probe.
5. **Every blocked state names its gate and the next step** in plain words (never a code, never a secret).
6. **Feature freeze at 22:00 on Sunday 15 Nov.** Monday is pilot and fixes; Tuesday morning is fixes and packaging only.
7. **Keep a vulnerability log from day one.** Each finding, ours or a classmate's, becomes: class, cause, fix, regression test, lesson. That log is Part B of the video.
8. **Claims say "no single application role can read the paper", never "nobody".** State the limits openly (section 7).

## 3. Rulings on the three debates

### 3.1 Key architecture (S1 versus D1 and P2)

*Positions.* S1: setters encrypt to a pool public key, one ceremony, no plaintext before release. D1 and P2: the server decrypts only the drawn ten at sealing.

*What the debate exposed.* Both sides conceded: S1 admitted that rebuilding a pool key at release would open all ~100 questions, not the ten drawn; D1 and P2 admitted that the VM operator holds the pool key and so can read everything, and that "no plaintext on the server" was false in their design. A malicious operator can also serve altered JavaScript, so neither design defends against that.

**Ruling.** Adopt S1's separation of concerns with A2's custody, and simplify one step further:

- Each question is encrypted under its **own random 256-bit AES-GCM key**; that key is wrapped under a **pool key-encryption key (KEK)** held in a root-owned `0400` credential file, never in the database. The authenticated data binds exam, question and version.
- **The server performs the encryption** when a question arrives (plaintext lives in memory for milliseconds), instead of the setter's browser. *Reason:* the pool private key already lives on the same VM, and the same server serves the page, so browser-side encryption adds almost no security here while costing about a day and requiring HTTPS-only WebCrypto on the setter side. We record it as a known upgrade path (switch the wrapping to a public key and move encryption to the browser) and do not claim it. This departs from both sides; S1 would object, and the objection is noted.
- The **draw runs on question IDs only** and never touches content.
- **Sealing** unwraps only the ten drawn question keys, builds the paper in memory, encrypts it under a **fresh 256-bit exam key** (raw random bytes; no hashing of a hex string), and that exam key is split 3 of 5 and then wiped. **Release exposes only the ten-question paper**, never the pool.
- One release ceremony per exam for the custodians (sealing is triggered by the admin with a custodian approval card; release is the second card).
- Fallback if the end-to-end test is not green by Friday 14 Nov noon: skip per-question keys and encrypt the pool as a whole; state the limit.

### 3.2 Scope: three roles or five (B1 versus B2)

*Both sides converged.* B1 conceded that leak tracing is the best demo, that setter confidentiality needs a real setter endpoint, and that a lone tester cannot honestly form a 3-of-5 quorum. B2 conceded that breadth kills schedules and that tracing a cropped photo needs a windowed matcher (the current `traceSeats` matches a fixed prefix only).

**Ruling.** **Three full screens and two thin ones on one auth system:**

| Role | Weight | Does |
| --- | --- | --- |
| Exam admin | full | Create exam, view counts only, lock pool, draw, request sealing |
| Custodian | full | One approval card with live "x of 3", refuse with a reason, undo until the quorum completes |
| Centre superintendent | full | Five-gate checklist, seating report, release, print one copy per seat |
| Setter | thin | One form, submit and list own questions |
| Auditor | thin | Read-only: verify the log chain, trace a leak from partial text or a pasted order |

Users are seeded by a script; there is **no user-management UI**. **Per-tester practice exam:** a button creates an exam from a template with five labelled demo personas scoped to that exam (needed anyway because every row carries an `exam_id`), plus a reset button. The role switcher in practice mode is labelled as a demo artefact and every switch is logged. A separate **official demo exam** has real per-role logins, so the live demo on 26 Nov is honest. Cut order if time slips: auditor UI becomes a scripted trace (stated as such), then the practice sandbox becomes one shared exam with a reset.

### 3.3 Custodian shares and approval (C1 versus C2)

*Both sides converged.* C2 conceded that shares stored on the server can be brute-forced offline if the database leaks and a passphrase is weak. C1 conceded that the server combines shares in RAM for seconds either way, so offline shares cut only at-rest exposure, and that pure typing fails a lone tester.

**Ruling.**

- At sealing, each custodian's **key card** (their share) is shown once in their browser. The browser encrypts it under **their own passphrase** (never sent to the server) and saves it as a file; the server deletes its copy and keeps only a hash of each share.
- A **release request** carries a single-use nonce, a **15-minute expiry** and a **two-word check** derived from the nonce. The custodian compares the words with the superintendent's screen by eye (no typing of key material) and approves by uploading the card and entering the passphrase; the browser decrypts it locally and posts the share. The server accepts shares in RAM only, combines at quorum, wipes, and records who approved.
- Approval is bound to one request: a replayed share fails (nonce spent), an expired request fails, and one account cannot supply two shares.
- The **fallback** (four of five plus a written reason) lives behind a deliberate link, not on the main screen, and is shown to the auditor. It is a SHOULD: cut first if time slips.
- Fallback for the whole mechanism, decided Sunday morning: if card handling slips, keep server-stored wrapped shares with request-bound approval, and say so.
- Main risk, accepted: one XSS in the custodian page could expose a share in the browser. Mitigated by `textContent` rendering, a strict CSP and no third-party scripts.

## 4. Development process (the course steps, mapped to the days)

| Course step | What we do | Evidence it leaves |
| --- | --- | --- |
| Requirements | Phase I register narrowed to 12 testable security requirements SR1 to SR12 and the usability targets below; the other ~40 rows are declared design-only | Section 5 and the trace table |
| Design | This document | Sections 3 to 6 |
| Implementation | Vertical slices in section 8; tests before glue on all crypto; every AI-written diff reviewed | Commit history, tests |
| Verification ("did we build it right") | Table-driven matrix and gate tests; abuse suite (AB ids) on every commit and against the VM; canary-plaintext scan | `make evidence` output |
| Validation ("did we build the right thing") | Five to six acceptance scenarios; pilot on three strangers using only the guide; 5-minute recording and five questions to two or three faculty | Scenario results, pilot log |
| Deployment | VM, TLS, systemd, one-command install, reset and restore | Tarball, checksum, live URL |
| Maintenance | 18 to 25 Nov: triage reports daily, fix security bugs, log everything | `logs/vulnerabilities.csv` |

**Process rules.** Write the failing test first for anything security-critical. Do not weaken a test to make it pass. Review every diff the AI pair writes. Commit small and deploy daily. Any route without a role test, or any thin role page without tests, is deleted rather than shipped.

## 5. Security requirements we commit to, and how each is proved

Source: S3's list, merged with S2's attack list and V1's test plan. "Design-only" rows from Phase I are named in section 7 so the video does not overclaim.

| ID | Requirement | Proof |
| --- | --- | --- |
| SR1 | Deny by default: every route and role, an unlisted route fails the build | Route-by-role matrix test generated from one JSON file read by both server and tests |
| SR2 | Login: slow password hash (scrypt), per-account backoff and per-IP limit, secure cookie flags, CSRF protection | AB-07 and AB-08 |
| SR3 | A setter reads only their own questions; the admin sees counts only | AB-01 |
| SR4 | Fewer than three shares open nothing; one account cannot supply two shares; duplicate share values rejected | Property tests, abuse test |
| SR5 | Release fails closed: wrong window, wrong centre, replayed or expired request, missing seating, missing quorum; every subset of missing gates refuses, only the full set opens | Gate tests, AB-16 to AB-20 |
| SR6 | Log edit, delete, reorder and truncate are detected; the chain is keyed with a key outside the database and its head hash is posted to a second place after each stage | AB-24, AB-25 |
| SR7 | After a full run, a planted canary plaintext is absent from the database, files, logs and error bodies | Canary grep test (AB-15, AB-30) |
| SR8 | Seed committed at lock; draw replays identically; seed has 256 bits | Replay test, seed-grinding test |
| SR9 | Per-seat copies: unpredictable order, neighbouring seats differ, a planted leak traces to its seat, copy ID is an HMAC tag | Simulation test |
| SR10 | XSS, SQL, path traversal, oversize and malformed inputs are inert; no `innerHTML`; CSP `default-src 'self'` | AB-04 to AB-06, AB-28 |
| SR11 | Errors and logs leak no secrets or paths; logs use an allowlist of fields | Log scan |
| SR12 | A trace result is a lead, not a verdict: reasons, scores, and a human confirms | UI test |

**Known defects in the existing code that must be fixed before reuse** (found by S1, P2, D1 and V1; all verified by reading the code, and each gets a test):

1. `rngFrom` collapses any seed to 32 bits, and it drives the draw and every seat's order. Anyone holding one printed copy could brute-force the seed and predict every other seat. Replace with an HMAC-SHA-256 generator keyed by a 256-bit secret.
2. The copy-ID check digit is not authentication. Replace with an HMAC tag verified by the server.
3. The exam secret is 120 bits and the AES key is a SHA-256 of its hex string; the Shamir prime is 127 bits. Use raw 256-bit random keys; move Shamir to a larger field (the Mersenne prime 2^521 minus 1 is the cheapest, or a pinned library after checking its audit status; verify before citing it).
4. `combine()` silently accepts duplicate share numbers. Reject them.
5. The demo keeps `keyHex` and `paperText` in memory after the "wipe". The server code must not.
6. The existing shared `x-admin-key` and unrate-limited API are demo-grade; they are not reused.
7. `site/.env.local` holds live Upstash and Vercel tokens. Rotate them, and build the VM bundle from `git archive` so they never ship.

## 6. The design

### 6.1 Architecture (one VM, boring technology)

```
 Browser (vanilla ES modules, no framework)
   |  HTTPS (Caddy or nginx: TLS, HSTS, CSP, 64 KB body limit, per-IP rate limit)
   v
 Node 22 process, `node:http`, runs as user `leakproof` on 127.0.0.1
   middleware: session -> CSRF -> role/route table -> handler
   modules: auth | exams | questions | draw | seal | release | copies | trace | log
   crypto : reused and fixed logic.mjs + node:crypto (no new primitives)
   |
 SQLite file (0600): ciphertext, wrapped keys, share hashes, audit log. No plaintext column.
 /etc/leakproof/key (0400, systemd LoadCredential): the pool KEK and the log key.
```

- Stack choice: Node 22 with `node:http` and SQLite (`node:sqlite`, zero dependencies, if the VM's Node supports it; otherwise `better-sqlite3`). Check the VM's Node on day 1.
- Packaging: `leakproof-v1.tar.gz` plus its SHA-256, `USER_GUIDE.pdf` and the live URL, so either reading of "executable on a file server" is covered. `make install`, `make seed`, `make reset`, `make verify`, `make run-local` (graders can run it without the VM).
- **HTTPS is required for more than looks:** `crypto.subtle` does not exist on plain http pages, and the key card is decrypted in the browser. If the TAs give a hostname, use Let's Encrypt. If only an IP, use a self-signed certificate and publish its SHA-256 fingerprint in the guide (teaching users to click through warnings is itself a usability flaw).
- Operations during the testing window: hourly SQLite snapshots (48 kept), restore button and one-liner, `/healthz` with an external curl, structured logs with a field allowlist, backoff instead of lockout (lockout is a DoS lever).

### 6.2 The exam lifecycle (one `exam.stage` field drives everything)

`SETUP -> COLLECTING -> LOCKED -> DRAWN -> SEALED -> RELEASE_REQUESTED -> RELEASED -> CLOSED`

Every transition is logged, checks the previous stage, and refuses otherwise. All roles see the same stage bar on top and their own panel below.

### 6.3 Screens (about nine)

Login · Setter form and my list · Admin exam page (setup, counts, lock, draw, seal) · Custodian approval card · Superintendent release checklist and print queue · Auditor (verify and trace) · Practice exam creator · Help (the guide) · "Report a problem" (captures an error ID and the page).

### 6.4 Release gates (the superintendent's screen)

| Gate | Check | If it fails the screen says |
| --- | --- | --- |
| G1 Quorum | 3 of 5 custodians approved this request | "2 of 3 approved. Waiting for: Dean, Registrar" |
| G2 Seating | Seating report received for this centre | "Seating report missing. Upload it" |
| G3 Window | Now is inside the exam's print window | "Opens 08:30. Try again in 14 minutes" |
| G4 Identity | Request is from this centre's superintendent for this centre's paper | "This paper belongs to another centre" |
| G5 Integrity | Locked paper hash matches the log and decryption verifies | "Integrity check failed. Stop and call the auditor" |

If any gate fails, nothing prints and the top line names the first failing gate and who must act. G5 failures never show internals.

### 6.5 Leak tracing (the memorable demo)

The fingerprint is the **order of questions and options on the page**, not the printed ID, so cropping off the copy ID does not defeat tracing. The auditor pastes or enters what is visible (any contiguous window of questions and their option orders). A windowed matcher compares it to every seat's copy and returns a short list of seats with scores and reasons, labelled "a lead, not a verdict". Neighbouring seats are guaranteed to differ in the first three positions. If the matcher is not working by noon on 15 Nov, we show a scripted trace and say so.

### 6.6 Usability design rules (from Phase I findings F1 to F11 and the HCI and UX personas)

- One plain card for the custodian; no key material typed; approvals are bound to one displayed request and expire; fallback is deliberate, not on the main screen.
- The whole path is visible up front as a stage bar (F10: the step count felt heavy at first); the existing `/pipeline` demo is reused as a "What is happening?" drawer by importing its plain-language text, so nothing is built twice.
- Every status is words plus icon plus colour; refusals name the rule that fired; the padlock is shown only when data really is encrypted; secrets and plaintext are marked with a distinct "Secret" style and never appear in URLs or toasts.
- Phase I hypotheses we ignore for now: the 20-minute ceremony clock as a rule, a reviewer role, rich maths input. Keep UTF-8 working end to end.
- F11 (waiting in the hall): print-before-entry is only a design note. We build release and print at the centre and state the custody gap as a limit.

### 6.6.1 Visual system (one capped day)

Promote the existing `pipeline.css` tokens (cool off-white and a soft slate, one indigo accent, cards) into one `tokens.css` used by every page, because `site.css` still carries a second palette. Eight components: Button, Card, Field, StatusPill, Banner, Table, Stepper, confirm Modal. Fix the contrast failures U2 measured: white on the dark-mode accent (2.7:1) and green text (3.6:1); never use amber for text. Keep focus rings, native controls and the reduced-motion block. Cut: more animation, custom icons and marketing scenes.

## 7. Honest limits (state them in the guide and the video)

- The VM operator and the server process handle plaintext for seconds at sealing and at release. We claim "no single application role can read the paper before release", not "nobody".
- A malicious operator could serve altered JavaScript; we do not defend against that.
- Three colluding custodians can open the paper early; we log it, we do not prevent it.
- We cannot stop a photograph of a printed copy; we trace it.
- The hash chain shows tampering; it does not prevent it. A trace is a lead, not proof.
- **Design-only (not built, not claimed):** signed client-side submissions and encryption in the browser, key revocation, print-the-day-before custody and seals, reviewer role, case reply rights and retention, log sharding, real printers.
- Out of scope for attackers (state it so reports stay valid): volumetric DoS, compromise of the course VM host or other teams, physical and social engineering, browser zero-days, colluding custodians beyond the quorum, the Phase I Vercel research site.

## 8. Schedule, cut-lines and go/no-go

Today is Thursday 12 Nov. This is a very tight plan for one builder with an AI pair. The minimum shippable version is below the table.

| Day | Build | Deploy and test | Gate at end of day |
| --- | --- | --- | --- |
| **Thu 12** | Email TAs. Rotate tokens. Fix crypto defects 1 to 5 with tests. Repo layout, server skeleton with login, sessions, CSRF, role middleware, route-matrix JSON and its test | Make the install script | Crypto tests green; every route has a role test |
| **Fri 13** | Setter form and own list; admin exam setup; per-question encryption and wrapping; SQLite schema | **VM hello-world with login live** | **VM reachable and login works.** If not, escalate to the TA and fall back to a team-owned host |
| **Sat 14** | Lock, committed seed, draw, seal, key cards, custodian approval card, release gates, per-seat copies, practice exam button | Deploy | **Draw-to-unlock works on the VM.** If not, cut the SHOULDs |
| **Sun 15** | Auditor verify and trace, log anchoring, security pass, our own break-it day against AB-01 to AB-31 with two reviewers who did not write the code, `make evidence` | Deploy | **22:00 feature freeze.** All abuse tests green |
| **Mon 16** | User guide final (written alongside the build); pilot on three strangers who run the guide cold; fix the top five issues; accessibility smoke test | Deploy; full retest on the VM URL | **22:00 go/no-go** |
| **Tue 17** | Fixes only. Tag the release, build the tarball, checksum, guide PDF | **Post by 18:00** (six hours of buffer) | Posted |
| **18 to 25 Nov** | Triage reports daily, fix security bugs, log each in the vulnerability log, "v1.1" notes | Redeploy if allowed (ask) | Daily log |
| **26 Nov** | Rehearse on 25 Nov; live demo in four acts: submit, draw, three-of-five release, leak trace | | |
| **27 to 29 Nov** | Record and submit the video | | |

**Cut order if time slips:** (1) the four-of-five fallback UI, (2) the practice sandbox becomes one shared exam with a reset, (3) the auditor UI becomes a scripted trace, (4) key cards fall back to server-wrapped shares, (5) tracing keeps only exact-fingerprint matching.

**Minimum shippable:** VM-hosted, real login, setter, admin, custodian and superintendent roles, draw, encrypt, 3-of-5 release with the five gates, per-seat copies, the log with verification, a user guide, and a known-issues list.

### 8.1 Using the team (five reviewers, no coordination needed)

R1 writes the guide from the live build with screenshots (13 to 16 Nov). R2 and R3 attack on 15 and 16 Nov and log findings in the shared table. R4 runs the three pilot sessions and records timing. R5 owns video evidence and script and the 29 Nov submission. The builder never reviews their own security.

## 9. Usability evaluation (25% of the grade)

Three light rounds, using the course's study method: a team walkthrough on 13 Nov; think-aloud with five or six strangers on 15 and 16 Nov (each doing two roles, every role at least three times); then peer testing 18 to 25 Nov. Every task has a pass or fail end criterion and a timer. UMUX-Lite after each role and SUS after the whole flow. Log about twelve events in our own table (task start and end, blocked-gate views, errors). Targets: a custodian approves after a two-minute walkthrough with no help; a superintendent knows within five seconds why Release is disabled; a setter submits a question in under 90 seconds. One 8 to 10 page PDF guide, the same text at `/help`, tested on a stranger. A single feedback ledger (`logs/peer_feedback.csv`) and an in-app "Report a problem" button, because peer reports go to the course and we may never see them.

## 10. Evidence for the video

`make evidence` runs every test and writes `evidence/SRn.txt`; screenshots are named `SRn-attack.png` and `SRn-refused.png`. Part B is one 30-second slot per requirement: statement, the attack tried, the refusal, the test ID. The vulnerability classes in Part B come straight from `logs/vulnerabilities.csv` (access control, injection, secrets exposure, authentication, replay, misconfiguration, availability), each with cause and lesson. Part A uses the Phase I findings F1 to F11 and the "you said, we changed" log.

## 11. TA email (send today)

> Subject: Group 19, LeakProof: VM request and two questions
>
> Hello, we want to host our Phase II tool on a course VM. Could you tell us: (1) the OS, whether we get sudo or root, and which of Node, Python and Docker are installed; (2) whether the VM has a public IP or a hostname, and whether it is reachable from the whole campus or only by VPN; (3) which ports are open and whether we can have 443 and 80; (4) whether we can have a DNS name or a certificate (otherwise we will use a self-signed one and publish its fingerprint); (5) RAM, disk and CPU limits, and whether snapshots exist; (6) whether the VM runs 24/7, any maintenance window, and who to contact if it is down; (7) the file-server path, size limit and format for the executable; (8) whether others will scan or load-test the VM.
>
> Two policy questions: are hotfix redeploys allowed during 18 to 25 Nov while classmates test, and do our own Phase I code and tested modules count toward the 50% original-source rule? If you cannot confirm the VM by tomorrow, we will use a team-owned host and give you the same package and URL.

## 12. Items only you can do

1. Send the TA email (section 11) today.
2. Rotate the Upstash and Vercel tokens in their dashboards.
3. Decide who plays R1 to R5, and send them this document.
4. Say yes or no to two judgement calls of mine: moving setter encryption to the server (section 3.1) and using the 2^521 minus 1 field instead of a Shamir library (section 5, defect 3).
