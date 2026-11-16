# C6 Compliance and grading strategy (role-played)

Sources read: `Course_Project___inclass.txt` (all of it), Lecture 4 and Lecture 7 in part (not all eight lectures or the cheat sheet in full; the guideline is what carries marks), `assignment2/endsem/midsem` rubrics (they grade *specificity, trade-off reasoning, concrete artefacts*, no group-project content), `app-snapshot/{README,SECURITY,USER_GUIDE}.md`, `deploy/Caddyfile`, `scripts/official-setup.mjs`, `docs/council/round4/R6_adoption_plan.md`, `fcs_bugs.csv`, `evidence/logs/vulnerabilities.csv`.

Two facts to say first:
1. **Today is 14 Nov; code freezes midnight 17 Nov.** Anything below that is a *document or data* change (guide, credentials, release hash, rebuttals) is still open after the freeze only if it is not "source". Treat the guide as part of the 17 Nov package anyway; do not edit it after 8 am 18 Nov except to add a "clarifications" note.
2. **Inconsistency to fix in docs before freeze:** `README.md` says "51 tests"; task brief says 52 passing. `USER_GUIDE.md` still has `<printed by install.sh>` and `<from install.sh>` placeholders (lines 5-6). A tester who sees a placeholder files a Valid-looking functional report. Fill them or the guide is not shippable.

## What the FCS data says about how staff rule (1,635 reports, 25 groups)
Column caveat: the CSV header is shifted. The Valid/Invalid ruling sits in the column headed "Demonstrate Impact"; "Rebuttal" is the defending group's text; "Comments" is the tester's counter, and the last, unnamed column is sometimes a group reply. Whether "Valid" is the staff's final ruling after rebuttal is **unverified**; some Comments quote "Decision: Invalid. Refs: OWASP..." which reads like staff/AI-assisted rulings.

| Slice | Valid / total | Reading |
|---|---|---|
| All reports | 613 / 1635 (37%) | Base rate: a random report has a 1 in 3 chance |
| Type "Functionality" | ~234 / ~757 (31%) | Functional bugs count and win about as often as security |
| Authentication/Access Control (security) | 112 / 334 | Vague "access control" claims mostly fail |
| DoS (security, any flavour) | 94 / 145 (65%) | Highest-yield class. Staff accepted "site was observably down for other clients"; rejected raw SYN/volumetric ("network attack, not an app bug") and PoCs without independent health check |
| HSTS-related | 4 / 26 | HSTS present with max-age=1 year but "no preload/includeSubDomains" = Invalid; "HSTS absent" mostly Invalid when HTTPS redirect exists |
| Self-signed certificate | 0 / 5 | Invalid; course says self-signed is expected |
| Cookie-flag reports | 2 / 17 | Mostly Invalid |
| CSP | 9 / 37 | Valid only when CSP **broke the app** (blocked inline script); "inline style allowed" with no exploit = Invalid |
| Security headers (Expect-CT, X-Frame etc.) | 10 / 51 | Invalid unless exploit shown |
| Weak password policy | 1 / 16 | Invalid when guide explained the choice |
| Rate-limit reports | 22 / 92 | Valid mainly when no limit existed or limit demonstrably bypassed |
| Forgot/reset password | 13 / 29 | A missing recovery path was a requirement-style functional bug |
| User enumeration | 5 / 11 | Coin flip; a group that explained "401 vs 404 is standard" still lost when the tester showed inconsistent behaviour |
| CSRF | 14 / 30, XSS 11 / 34, IDOR 6 / 16, session 8 / 22 | Valid only with a working exploit |
| Information disclosure | 16 / 71 (functional+security) | Mostly Invalid ("vague, speculative") |

Arguments that **won rebuttals** (copy these patterns): (a) "the server was under attack/down at that time, retest now" (worked 19+ times, so keep the instance observable and logs ready); (b) "no exploit shown, only a claim" (the staff's own phrase: "simply stating a weakness will not work, you have to exploit it"); (c) "design choice, documented in the guide before the report" (weak passwords, no 2FA, disabled links); (d) "wrong site / wrong IP / wrong instance" (a Valid DoS was contested because the PoC pointed at another IP); (e) "this is a deprecated header / not applicable to IP-only course VM"; (f) "requirement is not in the course outline" (partly won, partly lost: recruiter-registration reports were rebutted with "you could have mailed us"; **so a tester-facing email/contact route matters**). Arguments that **lost**: "temporary VM down but not a functional issue" (testers countered that a dead VM during the audit is a functional failure), "you were not able to exploit it" against CWE-style input-validation claims when a PoC existed, and any rebuttal that contradicts the tester's screenshots.

Implication: our **uptime during 18-25 Nov is itself graded** through "can't register / site down" functional reports (the Functionality "Can't Register" class was Invalid only when the group could show the VM was down because of someone else's flood).

---

## 1. Requirement-to-evidence matrix

Percentages are from the guideline. Owners are suggestions for a 3-person team (A = server/security, B = client/usability, C = docs/evidence/video).

### 1.1 Rubric lines

| Rubric line | What we have | Missing / risk | Owner |
|---|---|---|---|
| **Usability of the tool 25%** | Phase I studies and report (`docs/phase1_report.md`, `evidence/phase1_deliverables/user_study_reports`), round 3 and 4 usability fixes (C1 to C14 in R6), "Next step" box, "Create all my cards", plain-English refusals | No post-build usability evidence yet. Marks are likely awarded on evidence of studies feeding design (Part A of video) and on evaluators' experience of the tool. Need: 3 to 5 think-aloud sessions with the build before 17 Nov (even 20 min each) with SUS or task-time numbers; a one-page table "study finding -> design change -> where in UI" | B |
| **Functional correctness 10%** | `npm test` 52 passing; golden path over real HTTP; `deploy/smoke.sh` | Tester-visible correctness: user-guide placeholders; "official instance is off" so the full 5-role flow runs only in practice mode where one person plays all roles (looks like a design shortcut; say so up front); restart re-locks paper | A, C |
| **Quality of software 15%** | Zero-dependency, one route table, tests named by requirement ID, SECURITY.md traceability | Reviewer needs a short "architecture and where to look" note, test count consistent across docs, a clean repo (no stray `data/`, keys, `.db`), a LICENSE/original-code statement | A, C |
| **Presentations 10%** (poster 1: 7 Oct; poster 2 live demo: **26 Nov**) | Poster 1 presumably done (confirm artefact location) | Poster 2 needs a live demo that does not depend on the VM being up and unchanged. Official-instance demo is planned for 25 Nov night; rehearse with screenshots as fallback; restart re-locks the paper mid-demo | C (lead), all |
| **Final group presentation 15%** (recorded video, **<= 20 min**, **midnight 29 Nov**) | Material exists across rounds 1-4, `vulnerabilities.csv` | Part B item 3 requires "classes of vulnerabilities **reported by students**": cannot be written until 28 Nov; see section 4 | C |
| **Satisfaction of security requirements 25%** | SR1-SR12 each with a named test; section 5 of SECURITY.md for non-test measures; limits stated | Graders may judge "satisfaction" by tester evidence: every Valid report against an SR reduces it. SR2/SR6/SR9 are the claims testers will probe. Do not add new claims | A |
| **Peer evaluation from group members** | Team of 3, `evidence/logs/contributions.csv` | Keep contributions log current to the end (see 3-way balance); include commit counts per author, not only claims | all |
| **Usability and security testing 15%**: participation in usability studies 5% (1% per 5 studies) | `evidence/logs/participation_tally.csv` | Confirm each member's count is >= 25 for the full 5% (verify the tally; do not assume) | C |
| **Testing others 10%** (0.5% per functional/security bug, individual, 8+ groups, 18 Nov noon to 25 Nov midnight; report due **28 Nov midnight**) | Round 4 knowledge of FCS bug classes | Individual task, each member needs a plan: working PoC + screenshots; functional bugs count; **file bugs early** in the week because groups will patch nothing after freeze but may be down late | each member |
| **Best-project bonus +5%** | n/a | Unlikely to be awarded by anything other than overall quality and fewest valid bugs; do not optimise for it | n/a |

### 1.2 Explicit deliverables and deadlines

| Deliverable / rule | Date | Status | Gap and action | Owner |
|---|---|---|---|---|
| Phase I: study evaluation reports, requirements, prototypes | 4 Oct | Done (evidence folders exist) | Confirm submission receipt is saved | C |
| Poster 1 | 7 Oct | Done presumably | Keep file for the video | C |
| **Final source via Classroom link** | **17 Nov midnight** | In progress | Freeze at a tagged commit; put the SHA-256 of the release tarball in the guide, the Classroom note and the commit message | A |
| **At least 50% original source** | with source | Zero deps; Shamir over 2^521-1, HMAC streams, log chain, router, rate limiter all written by us; Node built-ins only | Add `ORIGINALITY.md`-style paragraph to README (below) | C |
| **Executable on file server** by deadline | 17 Nov | Needs: release archive + run script that works on a clean Ubuntu with Node 22 (we host a live instance on the VM at `https://192.168.2.238:8443`) | Decide what "executable" means for a Node app: (1) the live URL, (2) the tarball with `npm run practice`. Provide both | A |
| **User guide** | posted before 8 am 18 Nov | Draft exists with placeholders | Section 2 below | C |
| **Demo credentials per role** | with the executable | Not produced; practice instance lets any account hold all roles | Section 2.4 | A |
| Executable + guide on Classroom | before 8 am 18 Nov | Not done | Pre-stage upload on 17 Nov evening; set a phone alarm; do not wait for 7:59 | C |
| Testing window | noon 18 Nov to midnight 25 Nov | Our own testing plan not written | One tester per member, 8+ assigned groups each | all |
| Test reports | 28 Nov midnight | Not started | Template with PoC, screenshots, validity argument | each |
| Final video | **29 Nov midnight** (<= 20 min) | Outline in section 4 | Record on 28 Nov, buffer 29 Nov | C |
| Poster 2 live demo | 26 Nov | Plan exists (official instance 25 Nov night) | Rehearse; keep a recorded fallback | all |
| Rebuttals to staff rulings | deadline not given in the guideline | Unverified: ask TA when the rebuttal window is | Prepare the playbook (section 3) | all |

### 1.3 What to say about reused Phase I code and FCS ideas

Phase I produced a **demo prototype** (`evidence/phase1_deliverables/prototypes/leakproof_demo`) and a `site/` folder (a different, Vercel-style stack with its own `package.json`). Phase II `app/` is a zero-dependency Node rewrite. Draft statement for the README and the video (accurate only if true; check with the git log before posting):

> "Phase II code in `app/` is written by the team. It uses no third-party packages: only Node 22 built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:test`). Shamir secret sharing over GF(2^521-1), the HMAC-chained log, the seat-order generator, the router, rate limiter, session store and the browser client are our own code (about N lines in `src/` and `public/`). The Phase I prototype (`prototypes/leakproof_demo`) was a click-through UI mock; none of its code is in `app/` except the strings and layout ideas that came from usability testing. We read two other groups' FCS reports (published bug lists) and the course's validated bug data and wrote tests for each valid bug class; we copied no code from those projects (we did not run `reference/fcs`)."

Fill N from `wc -l app/src/*.mjs app/public/*` and confirm the "no code copied" sentence with each member. Ideas taken from FCS are listed in SECURITY.md section 3; that section already says what we kept and cut, which is the right transparency.

---

## 2. Submission package

### 2.1 Where each item goes
| Item | 17 Nov (Classroom source link + file server) | By 8 am 18 Nov (Classroom post for testers) |
|---|---|---|
| Source tarball `leakproof-1.0.tar.gz` (git tag `v1.0`, no `data/`, `*.key`, `*.db`, `.git` optional) | yes | yes (same file, same hash) |
| SHA-256 of tarball and git commit id | in the README and Classroom note | in the Classroom post |
| Executable | tarball with `npm run practice` (needs Node 22.5+); live URL | live URL + same tarball |
| `USER_GUIDE.md` (and PDF copy) | yes | yes |
| Demo credential sheet | no (secrets stay off the public file server; give to staff privately if asked) | in the Classroom post (it is a class-wide shared document, see 2.4) |
| `TESTERS.md` (scope + rules of engagement + reporting) | yes | yes |
| `SECURITY.md` | yes (graders) | yes (testers; it is our "known limits") |
| TLS certificate fingerprint | in guide | in the Classroom post |

### 2.2 Exact package contents (tarball)
`README.md`, `USER_GUIDE.md`, `TESTERS.md` (new), `SECURITY.md`, `package.json`, `server.mjs`, `src/`, `public/`, `tests/`, `deploy/`, `scripts/`, `LICENSE`-style originality note, `RELEASE.txt` (commit id, date, Node version, `npm test` result, SHA-256 of this tarball is *not* inside it; it is in the Classroom text).

### 2.3 Draft: Classroom post (8 am 18 Nov)
> **LeakProof (Group <N>): test package.** Practice instance: `https://192.168.2.238:8443/` (accept the self-signed certificate once; fingerprint SHA-256 `<fp>`). Source/executable: `leakproof-1.0.tar.gz`, SHA-256 `<hash>`, commit `<id>`. Start with `USER_GUIDE.md`, then `TESTERS.md`. Course code and demo accounts are in the credential sheet. Report issues to `<our email>` with the subject `LeakProof report` so we can retest quickly; your official report is still your own submission. We run no scheduled downtime; if the site is unreachable please tell us before filing it.

### 2.4 Demo credentials per role: sheet layout
The system has capabilities, not separate role logins: **setter**, **exam cell (run)**, **key holder (5 slots)**. In practice mode one registered account holds all of them on a fresh practice exam; that is a design choice and must be explained on the sheet. Propose:

| Role | How a tester gets it | Username | Passphrase | Notes |
|---|---|---|---|---|
| Any role on the practice exam (setter, exam cell, key holders 1-5) | Self-register: course code `<code>`, choose a username | yours | generated, shown once | Safest: no one else shares it |
| Pre-made demo account 1 | `demo-a` | `demo-a` | `<generated>` | Shared; may be locked or changed by another tester (see rules) |
| Pre-made demo account 2 | `demo-b` | `demo-b` | `<generated>` | For two-user tests (IDOR/CSRF between accounts) |
| Pre-made demo account 3 | `demo-c` | `demo-c` | `<generated>` | |
| Official instance roles (setter x4, exam cell, key holders x5) | Not running | n/a | n/a | Demonstrated live on 25/26 Nov; recording on request |

Each row also states: "this account can do X; changing its passphrase ends other sessions (by design)". Prepare demo accounts by registering through the normal API on the VM; that is data, not source. Do not use shared accounts for testers' attacks that mutate state; tell them to register their own (course code is on the sheet, so there is no barrier).

Reason for shared demo accounts: the guideline asks for "credentials for each role", and a grader with no time wants one login. Reason to limit them: a tester who changes the passphrase of `demo-a` locks everyone else out (that exact failure appears in FCS rebuttals as "I suspended our admin"). Mitigation: three accounts, plus self-registration, plus a note that if a demo account stops working, register your own.

### 2.5 Draft: `TESTERS.md` (scope and rules of engagement)
**In scope:** the practice instance at `https://192.168.2.238:8443/` and anything you can do from a browser or `curl` against it with accounts you registered or the demo accounts; the tarball run locally with `npm run practice` (source review). Functional bugs against the User Guide count.
**Out of scope:** any DDoS or flood (course rule), volumetric or SYN floods, the VM host and OS, SSH, the Caddy admin port, the official instance (not running), other groups' systems, social engineering of team members, anything that needs physical access.
**Low volume rules:** keep requests to a few hundred per test; do not script account creation beyond the documented cap; do not change the demo accounts' passphrases.
**What a valid report contains:** steps, exact request, response, screenshots, what you gained, and that it works on a fresh account. Reports pointing to another group's address are not reports against us.
**How to report:** email `<address>` for quick triage or tell us on the course channel; we will answer within hours. This does not replace your own official submission.
**Works as designed (do not report):** list from USER_GUIDE section 3 plus the additions in 2.6.
**Known limitations:** SECURITY.md section 4, reproduced as bullets.
**Our uptime:** the VM is on all week; a restart (deploy) is announced in the post; if you see it down, ping us before filing.

### 2.6 Known limitations list (add to guide; items not yet in section 3 are marked NEW)
Existing: refusal veto; verified card cannot be shown again; unique usernames; restart re-locks; rate limits; idle sign-out; no email/SMS; "Not found" for missing roles; trace names a seat.
NEW: self-signed certificate (browser warning is expected, fingerprint published); HSTS is sent with max-age 1 year but is not preloaded (IP address, not a domain); `/healthz` is public and returns `{ok, instance}` only; shared demo accounts can be disturbed by other testers; official instance not deployed during the test; practice mode: one account plays every role; passphrase and recovery code shown once; two-word check is 14 bits with 5 tries, logged; X-Real-IP is trusted only from the local proxy so direct requests to 8080 are not reachable from outside; DDoS and host compromise are out of scope; HTTP/1.1 only by design.

Note the guideline's testers are graded on bugs found in us, so these lists must be reachable and honest. Hiding nothing is correct here and also the best defence: the staff rulings above show "documented in the guide before the report" wins.

---

## 3. Predicted report list and rebuttal playbook (25)

"Validity" = chance staff rule Valid, using the past rates above. "Defence" = current state (cited from SECURITY.md or code). Rebuttals are written to be pasted; fill ports and screenshots at the time.

| # | Predicted report | Validity | Current defence | Pre-written rebuttal |
|---|---|---|---|---|
| 1 | **Self-signed certificate / browser warning, "insecure HTTPS"** | Low (0/5 in FCS) | Caddy internal CA, fingerprint in guide (after placeholder fix), SAN | "The course environment has no public domain, so a trusted certificate cannot be issued for an IP; the guide publishes the SHA-256 fingerprint so users can pin it. The traffic is TLS 1.2+ encrypted, and no exploit (MITM) is shown." |
| 2 | **Missing HSTS preload / includeSubDomains** | Low (FCS 4/26) | `Strict-Transport-Security: max-age=31536000` (src/app.mjs:273) | "HSTS is present for one year; preload and includeSubDomains need a registrable domain and do not apply to a bare IP. Report shows no attack the missing flags enable." |
| 3 | **Username enumeration on register (409) or login** | Medium (5/11 Valid) | Register says "taken" by design; login gives one error and burns a dummy hash (src/crypto.mjs `burnPasswordTime`); SECURITY.md section 4 states it; USER_GUIDE section 3 | "Usernames are public by design (no directory, no email), documented before the test; login returns one message and equal timing, and every passphrase is 80-bit generated, so knowing a name gives no attack path." Risk: timing claim is "code review, not tested"; do not assert timing equality as tested |
| 4 | **Shared demo accounts / session fixation or hijack between testers** | Low-Med | Server-side sessions, `__Host-` cookie, passphrase change kills other sessions | "Demo accounts are shared on purpose and labelled; sessions are bound to a random 256-bit id stored hashed, and a passphrase change ends every other session. Register your own account for isolated tests." |
| 5 | **Session not invalidated after logout in other tab / after password change** | Low | Logout server-side; change ends other sessions | "Logout destroys the server-side session (test `SR2`); a passphrase change ends all other sessions. Reuse of an already-destroyed cookie returns 401: show the request that works." |
| 6 | **Weak course code (guessable, shared) for registration** | Medium | Cap 30 successful registrations/IP/day, 2000 total (S8), documented | "The course code is a class-wide gate for a practice instance, not a secret; abuse is bounded by a per-client daily cap and an account cap, and accounts hold no real data. The official instance has no self-registration." |
| 7 | **Mass registration / resource exhaustion by account creation** | Medium | 2000-account cap, 30/IP/day | "Capped at 2000 accounts and 30 per address per day, so the database growth is bounded; reaching the cap is a documented limit, not a bypass." Risk: a tester fills the cap, and then **new testers cannot register** = functional Valid. Mitigation in section 5 |
| 8 | **Rate limit bypass via `X-Real-IP` / `X-Forwarded-For` header spoofing** | Medium | Caddy overwrites `X-Real-IP` with `{remote_host}` and drops XFF; app trusts only from 127.0.0.1 (`LP_TRUST_PROXY=1`) | "Caddy replaces X-Real-IP with the socket address and the app trusts it only from loopback, so a client-supplied header is discarded; showing the same 429 after changing the header (test `S8`) disproves the bypass." Have the curl proof ready |
| 9 | **Rate limit behind shared NAT locks out others** | Low-Med | Separate per-user and per-client backoff; failed registrations not counted | "Wrong passphrases back off per user and per client only, and the real wait is in Retry-After; one tester cannot lock a user on a different address." |
| 10 | **Exposed `/healthz`** | Low | Returns `{ok, instance}` only (app.mjs:149) | "It returns a status and the instance name, which the deploy smoke test needs; no version, path or data is disclosed and no exploit is shown." |
| 11 | **Missing/loose CSP (e.g. `img-src data:`)** | Low (9/37, mostly broke-the-app) | `default-src 'self'; script-src 'self'; style-src 'self'` (src/http.mjs:6) | "The CSP forbids inline script and style and all third-party origins; `data:` images cannot execute script. No injection path exists because the client renders with `textContent` only (test `SR10 the client renders…`)." Risk: if CSP blocks any page element for some browser, it is Valid (functional): do a pass on Firefox, Chrome, Safari before freeze |
| 12 | **Cookie flags / SameSite / no Secure over HTTP** | Low (2/17) | `__Host-`, HttpOnly, Secure, SameSite=Strict | "The session cookie is `__Host-` prefixed with HttpOnly, Secure, SameSite=Strict (test `SR2 sessions: cookie flags`); plain HTTP is not served." |
| 13 | **CSRF on logout/state change** | Low | Session-bound CSRF token + Origin check | "Every state-changing request needs a session-bound CSRF token and a matching Origin; a cross-site form post returns 403 (test shown). Logout CSRF in FCS was ruled Invalid when no impact." |
| 14 | **XSS via display name / question text** | Low | `textContent` only, CSP | "All user text is rendered with `textContent` and the CSP blocks inline script; your payload appears as inert text (screenshot)." |
| 15 | **IDOR on exam / copy / seat ids** | Low | Capability check returns 404 for no capability | "A missing capability answers 'Not found', identical to a missing exam; on your own exams you hold the capability by design. Show a request that reads an exam you do not hold." |
| 16 | **Error messages / stack traces / server banner** | Low | Plain sentences, reference code only, `-Server` removed | "Errors return a plain sentence and a reference code; no stack, path or version appears (test `S1 unexpected errors`)." Risk: Node's raw 400 for malformed requests: headers added (S1) |
| 17 | **Passphrase and recovery code shown once; lost = locked out; "no email recovery"** | Medium as *functional/usability*, low as security | Recovery code; guide explains | "This is deliberate: no email exists, so a recovery code shown once is the only way back; the guide states it before sign-up. Forgot-passphrase works with the recovery code (test `FCS-G1 no forgotten-passphrase`)." Predict 3+ reports because FCS "forgot password" was Valid 13/29 when absent; ours is present |
| 18 | **"Official instance is off", cannot test the 5-role flow** | Medium (functional) | Guide states, official on 25 Nov night | "The official instance is a one-night demonstration by the guideline's own role split; the practice instance exposes every role and gate and is what we ask you to test. Both are in the guide." |
| 19 | **Server restart re-locks the paper / loses requests** | Low-Med | Stated as designed; `interrupted` status | "Documented in USER_GUIDE section 3 and SECURITY.md section 4: the open paper exists only in memory so that it cannot be read from disk; the screen says why and the request can be re-issued." |
| 20 | **Single key holder can refuse (veto) = DoS on release** | Low-Med | Stated limit; refusal needs two words | "A refusal is the fail-safe choice for a leak-prevention system and is logged; the exam cell can re-request. Documented before the test as a known limit." |
| 21 | **14-bit two-word check is brute-forceable** | Low | 5 attempts per request then closed, each wrong try logged | "Five wrong tries close the request, so the chance is about 1 in 3,300 per request and every try is logged; opening also needs three verified cards, so words alone do nothing." |
| 22 | **DoS (slowloris, large body, many connections, public log CPU)** | **High if volumetric; DDoS is excluded**; app-level DoS 65% valid in FCS | Timeouts, 16 KB cap, rate limits, cached chain check, connlimit 50 | "DDoS and volume floods are excluded by the course; app-level cost is bounded (body cap 16 KB, cached log verification every 30 s, per-client rate limit, firewall connlimit); your own health check from a separate client shows the service up." Tester evidence of down service from a second client is what flips this to Valid |
| 23 | **Practice mode "you play every role" defeats the separation of duties (design critique reported as a bug)** | Medium | Documented | "Practice mode is a training sandbox where one person must be able to exercise every step; the official instance enforces separate people and accounts (SR1, SR2b). No security property is claimed for practice mode." |
| 24 | **Logging reveals/stores user data; public log has no names but leaks seat counts/timing** | Low | Public log no names; allow-listed fields | "The public log contains no names and only counts, by design; its purpose is public verification of the record (SR6). No sensitive datum is shown." |
| 25 | **Functional: page layout / mobile / long input / paste tricks / browser X fails (WebCrypto card creation takes seconds; Safari quirks)** | Medium-High (FCS 'other' functional 34% valid) | Busy state "Working…", accessibility pass | "Reproduced on `<browser>`: <result>. If reproduced: acknowledged as cosmetic; core flow completes (video attached)." If not reproduced: "Works on Chrome/Firefox/Safari versions X/Y (screenshots); please state your browser." Prevent by testing in 3 browsers before freeze |

Extra low-probability reports to have ready: missing `Cache-Control` on static files ("no-cache" present, app.mjs:281); HTTP/1.1 only ("by design"); HSTS on `/healthz`; no 2FA ("high-risk action needs card + passphrase + two words; login passphrases are 80-bit generated"); no password policy ("passphrases are generated"; but card passphrase has min length 10).

Rebuttal rules (from the FCS winners): lead with evidence (request/response), cite the guide section dated before 18 Nov, state "no exploit/impact shown" in one sentence, and never argue tone. Keep every rebuttal to the 2 sentences above. If the tester shows a real defect, concede quickly: a conceded Valid is cheaper than a lost argument and the video's Part B wants the lesson.

---

## 4. Final video outline (<= 20 min, due 29 Nov midnight)

| Time | Segment | Content | Evidence source |
|---|---|---|---|
| 0:00-1:00 | Intro | Problem, one-slide system, roles | Phase I report s1 |
| **Part A** 1:00-8:30 | | | |
| 1:00-3:00 | A1 How we designed the studies | Methods (survey, interviews, think-aloud, prototype tests), N participants, consent forms | `evidence/research/consent_and_instruments`, `participation_tally.csv`, `findings.csv` |
| 3:00-6:00 | A2 How the studies shaped the tool | 5 to 6 findings -> design decision pairs, with screenshots before/after (e.g. "steps heavy" -> "Create all my cards"; UTC vs local time -> relative times; seal confirm with Cancel selected) | `design_decisions.csv`, round 3-4 usability councils (R3, R5), R6 plan section B |
| 6:00-8:30 | A3 Design themes and methodology | 3 themes (plain-language, fail-safe defaults, show the next step), method (iterate with FCS usability studies as secondary research) | Phase I report s5, R3/R5 |
| **Part B** 8:30-19:00 | | | |
| 8:30-11:30 | B1 Security requirements identified | Threat model (insider handling paper), SR1-SR12 table | `docs/05_threat_model_v0.md`, `06_requirements_register.md`, SECURITY.md s1, round 1 S3 |
| 11:30-14:30 | B2 How addressed | 4 mechanisms: late draw + 3-of-5 key, per-seat order, keyed log, rate limits; show test names; live clip of a refused release and the leak trace | SECURITY.md s1-s2, s5; demo recording from 25/26 Nov |
| 14:30-17:30 | B3 Classes of vulnerabilities **reported by students** | Table below: class, cause, fix, lesson, with counts | collect 18-28 Nov |
| 17:30-19:00 | B4 Causes and lessons | 3 to 4 lessons, "what we would do differently" | `vulnerabilities.csv`, round 4 R1 |
| 19:00-20:00 | Close | Limits stated, thanks; leave 30 s slack | SECURITY.md s4 |

**Vulnerability class table to fill (columns):** `class | reports (valid/invalid) | cause | fix (or "by design") | lesson | evidence id`. Pre-populate with internal finds (`vulnerabilities.csv`: V-001 weak copy-id check digit etc.) and with the predicted classes (HTTPS/HSTS, enumeration, rate limits, CSP, availability). Log every report during the week into a copy of `vulnerabilities.csv` with two extra columns `reported_by_student` and `staff_ruling`; do this the day each report arrives (the video is recorded on 28 Nov, ruling may not exist yet: say "reported" and "ruled" separately). The guideline wants "classes of all the vulnerabilities reported by students", so include **invalid** classes too and explain why they were invalid; that is the lesson.

Artefacts that supply it: `evidence/logs/vulnerabilities.csv` (internal), SECURITY.md s2 (FCS classes, a good second row source), R1/R2/R4 findings (round 4), usability studies for Part A.

---

## 5. Risk register for test week (ranked by marks at stake)

| # | Risk | Marks affected | Likelihood | Mitigation without code change |
|---|---|---|---|---|
| 1 | **VM down/slow during 18-25 Nov** (power, disk full, accidental DDoS by 40 testers, reboot loses firewall) | Functional 10%, security 25%, testers' "can't use" reports (about 1 in 3 FCS functional reports) | High | `systemd Restart=always` already; check `df`, log rotation and DB size now; keep a second shell/phone alert; `smoke.sh` every few hours from a laptop; screenshot uptime log to prove rebuttals ("site was reachable at T"). Do not redeploy during the week unless a Valid critical bug demands it (code is frozen) |
| 2 | **Registration cap or per-IP cap exhausted by a tester** (2000 accounts / 30 per IP per day behind a shared lab NAT) | Functional (registration is the first feature) | Medium | Pre-create 3 demo accounts; publish them; tell testers in TESTERS.md; operator can raise the cap by environment/config on the VM (config, not source) if the app reads it from env: **check**; otherwise rely on demo accounts |
| 3 | **Guide placeholder or mismatch** (course code, fingerprint, test count, "official off") | Usability + functional | High if not done | Fix the three placeholders and README "51 tests" before the freeze; have a teammate follow the guide from scratch on a clean laptop |
| 4 | **Missed 8 am 18 Nov / 17 Nov midnight posting** | Direct deliverable marks | Low | Upload 17 Nov afternoon; verify the hash from a fresh download |
| 5 | **Valid report on a documented limitation judged "not documented enough"** (veto, enumeration, restart) | Security 25% | Medium | Section 2.5/2.6 lists; put the "works as designed" list at the **top** of the guide; link SECURITY.md s4; reply with the section quote |
| 6 | **Shared demo accounts disturbed** (passphrase changed, sessions killed) | Usability complaints | Medium | Three accounts + self-register; log an "account reset" procedure (operator registers new demo accounts) |
| 7 | **TLS-warning confusion makes testers skip pinning, produce "insecure" reports** | Security (low validity) | High (volume) | Guide step 0: how to accept the cert with a screenshot; fingerprint printed |
| 8 | **Browser compatibility on key-card creation (WebCrypto, 600k PBKDF2)** | Functional | Medium | Test Chrome, Firefox, Safari, mobile now; list tested browsers in the guide |
| 9 | **Rebuttal window missed or rebuttals unlinked to evidence** | Security marks | Medium | Ask TAs for the window; keep screenshots of each report; use section 3 text |
| 10 | **Team's own testing time collides with defence** (every member must test 8 groups and report by 28 Nov, video on 29 Nov) | Testing 10% x3, video 15% | High | Assign: A does reports 18-21 Nov, B 20-23 Nov, C 22-25 Nov with C on report triage; split rebuttals by day |
| 11 | **Restart during the 26 Nov demo re-locks the paper** | Poster 2 | Low-Med | Do not restart the service in the hour before; rehearse; keep a recorded run |
| 12 | **Originality challenge** (reused Phase I/other code) | Quality 15% | Low | The statement in 1.3 plus commit history; do not merge anything from `reference/fcs` |
| 13 | **Peer evaluation imbalance** | Individual marks | Low | Update `contributions.csv` now, with commit counts |

Mitigations that need no code after 17 Nov: a log of uptime, a rebuttal folder per report ID with request/response proof, a pre-agreed 2-sentence rebuttal (section 3), a stand-by operator account for demo resets, and a "known issues" note added to the Classroom post (not the source).

## Single most valuable action list (before midnight 17 Nov)
1. Fill guide placeholders; fix 51/52 tests; put "works as designed" first.
2. Pre-register 3 demo accounts; compose the credential sheet.
3. Run `bash deploy/smoke.sh` and a three-browser check; tag `v1.0`; SHA-256 into Classroom text.
4. Write TESTERS.md (2.5) and the originality paragraph (1.3).
5. Stage the Classroom post for 8 am.
