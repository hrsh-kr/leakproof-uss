# Build Requirements and User Flow (University Exams, v1)

Status: v1 draft for review, 11 Nov. This is the requirements and flow for the tool we are about to build. It narrows `04_tool_spec_and_test_plan.md` (8 roles, 5 exam profiles) to one thing done properly: **a university written exam with multiple-choice questions.** It reuses requirement IDs from `06_requirements_register.md` (R-S, R-U, R-P, R-F) and decisions from `02_final_scope_and_decisions.md`. New requirements here are prefixed **M-**.

Principle: Occam's razor. The smallest system that really enforces the idea. Anything not needed to run one exam end to end, safely, is out (section 8).

---

## 1. What we are building, in one paragraph

A web application in which an exam office runs a real exam from question collection to printing. Many setters each write questions for every topic. A computer draws the paper late, at random. The paper is encrypted and the key is split between officials, so no single person can read it. At the exam centre, a quorum of officials, a seating report and a time window unlock it, and each seat gets its own copy. Everything is written to a tamper-evident log. If a photo leaks, the copy's order points to a seat.

The pipeline demo (`/pipeline`) is the picture of this. The tool is the real version of it: real users, real storage, real permissions, not a simulation of them.

## 2. Users and what each is trying to do

| Role | Who (university) | Goal | Must never be able to |
| --- | --- | --- | --- |
| **Setter** | Faculty who teach a topic | Submit my questions quickly and know they arrived | See anyone else's questions or the drawn paper |
| **Exam admin** | Exam cell staff (Controller's office) | Set up the exam, run the draw, trigger sealing, see progress | Read any question or the paper; act alone as a custodian |
| **Custodian** | Five officials (Controller, Dean, HoD, Registrar, Chief Proctor) | Approve sealing and release with my key piece | Open the paper alone; hold two pieces |
| **Centre superintendent** | Person running one exam hall | Print the right copies at the right time, with a clear reason if blocked | Print early, print for another centre, see the paper before print |
| **Auditor** | Independent faculty or internal audit | Verify the log; trace a leaked photo or text to a seat | Change anything; see keys |

Five roles, not eight. Reviewer is dropped for v1 (setters are trusted to write correct questions; quality review is a later add-on). Investigator is merged into auditor.

## 3. The user flow, end to end

```
 1 SET UP          2 COLLECT         3 LOCK + DRAW      4 SEAL            5 DISTRIBUTE      6 EXAM DAY         7 AFTER
 Exam admin        Setters           Exam admin         Custodians        System            Centre + custodians Auditor
 exam, topics,  -> each writes   -> pool locked,    -> quorum approves -> locked paper   -> quorum + seating -> log checked,
 setters, seats,   N questions     seed committed,     sealing; paper     goes to each      report + time       leak traced
 centres,          per topic       one question        built in memory,   centre; key        window -> print     to a seat
 custodians                        per topic drawn     encrypted, key     pieces to          per-seat copies
                                                       split, wiped       custodians
```

Every arrow is a state change that is written to the audit log. A step cannot start until the one before it is complete (fail closed).

### 3.1 Flow per role

**Exam admin (setup, draw, seal trigger)**
1. Log in. Create an exam: title, date, start time, print window (default: opens 60 minutes before start), topics, questions per topic on the paper (default 1), options per question (default 4).
2. Add setters and assign each to the topics they cover. Add centres with seat counts. Pick five custodians (three needed).
3. Watch the **progress board**: per topic, how many questions are in (counts only, never text), per setter, submitted or not. Send reminders.
4. When every topic has enough questions, **lock the pool.** After this no one can add or edit.
5. **Start the draw.** The system commits a seed, collects each custodian's contribution, then draws. The admin sees which positions were drawn per topic, a balance report, and a replay hash. Not the text.
6. **Request sealing.** Custodians approve (3.3). The admin sees status only.

**Setter**
1. Log in and see a single page: my topics, how many questions each needs, a deadline.
2. For each topic: a form with the question, four options and the correct answer. Auto-format, previews, and a clear error list (from the survey-form lessons, section 7).
3. Submit. The question is encrypted in the browser to the exam's pool key before it leaves, and signed. The setter gets a **receipt** (question ID, time, fingerprint). Can submit more, or replace their own before the lock.
4. After the lock the page says "closed" and shows only the receipts. The setter never sees the paper.

**Custodian**
1. Gets a notice when an action needs them. Logs in and sees **one plain card**: "Approve sealing of Exam X" or "Approve release at Centre Y", who requested it, why, and what will happen.
2. Approves by entering their key piece (or confirming with their stored key). The screen shows the live count: "2 of 3 approved". It never shows pieces of others.
3. Can **refuse**, with a reason, which is logged. A refused or timed-out ceremony stops and nothing opens.

**Centre superintendent (exam day)**
1. Log in on the centre machine. The screen shows the exam, the centre, the seat count and a **checklist** with the live state of each gate: *Quorum 0 of 3 · Seating report missing · Window opens at 08:30*.
2. Uploads or confirms the **seating report** (which seat numbers are occupied).
3. When all gates are green, **Release** becomes available. Press it. The paper is decrypted in memory only and the print queue appears: one copy per seat, each with its copy ID.
4. Print. Each print is logged. Reprints are allowed and logged with a reason.
5. If a gate fails (no quorum, outside window, wrong centre) the screen says which one and what to do. A logged **fallback** path exists (section 6).

**Auditor**
1. Log in read-only. See the whole log with a **Verify chain** button and the published head hash.
2. **Trace a leak:** upload a photo's text or paste leaked text. The matcher finds which paper question and which fingerprint (top question order, option order), then lists seats that match. A human confirms or dismisses. Nothing is accused automatically.
3. After the exam the seed is revealed, so anyone can replay the draw.

### 3.2 The five gates for release (all required)

| Gate | Check |
| --- | --- |
| G1 Quorum | At least 3 of 5 custodians approved this release |
| G2 Seating | Seating report received for this centre |
| G3 Window | Now is inside the exam's print window (server and centre clocks agree within tolerance) |
| G4 Identity | Request is from this centre's superintendent, for this centre's bundle |
| G5 Integrity | Locked paper's hash matches the log; decryption authentication tag verifies |

If any gate fails, nothing prints. The reason shown is the gate's name and a next step, never a secret.

### 3.3 Two ceremonies, and why

1. **Sealing** (after the draw): custodians rebuild the *pool key* in memory so the selected questions can be decrypted, the paper built and re-encrypted under a fresh *exam key*, which is split 3 of 5. All of it is then wiped.
2. **Release** (exam day): custodians rebuild the *exam key* at the centre to open that one paper.

The pool key is needed because setters encrypt before anyone knows which questions will be drawn. See open question Q1 for the simpler alternative.

## 4. Functional requirements

Priority: Must for v1, Should if time allows. "Maps to" links an existing requirement.

| ID | Requirement | Pri | Maps to |
| --- | --- | --- | --- |
| M-F01 | An admin can create an exam with topics, quotas, setters, centres, seat counts, five custodians and a print window | Must | R-F01 |
| M-F02 | A setter can submit, view receipts for, and replace their own questions until the pool lock | Must | R-U07 |
| M-F03 | Each question has text, four options and exactly one correct answer, validated on the server | Must | |
| M-F04 | The admin sees counts and progress per topic and setter, never content | Must | R-S01 |
| M-F05 | Locking the pool is one-way; after it, submissions are refused | Must | R-S08 |
| M-F06 | The draw picks one question per topic (quota configurable), from that topic's candidates only, using a committed seed; it can be replayed from seed and pool | Must | R-S08 |
| M-F07 | Sealing builds the paper, encrypts it (AES-256-GCM), splits the key (Shamir 3 of 5), wipes the key and plaintext | Must | R-S01, R-S02 |
| M-F08 | Custodians can approve or refuse a ceremony from a single card, with live progress | Must | R-U01 |
| M-F09 | Release at a centre requires gates G1 to G5 | Must | R-S03, R-S04 |
| M-F10 | Printing produces one copy per occupied seat with its own question order, option order and copy ID (with check digit), and a per-copy answer key | Must | R-S07 |
| M-F11 | A logged fallback exists for release when a gate cannot be met (e.g. one custodian unreachable): needs a stricter quorum (4 of 5) plus a written reason, and is shown to the auditor | Should | R-U06 |
| M-F12 | An auditor can verify the hash chain and see the published head hash | Must | R-S05 |
| M-F13 | An auditor can trace a leaked text or photo to a question, a copy fingerprint and a short list of seats, with scores and reasons | Must | R-S11 |
| M-F14 | After the exam, the seed and a replay tool let anyone check the draw | Should | R-S08 |
| M-F15 | Marks: the answer key per copy maps responses to scores (CSV in, marks out) | Could | |

## 5. Security requirements and how each is proven

Each Must has at least one test; tests are written with the code (`04` section 6).

| ID | Requirement | Proof |
| --- | --- | --- |
| M-S01 | No human role can read a question other than its own setter; no human role can read the paper before print | Permission-matrix test for every role and route; storage inspection finds no plaintext (R-S01, R-S10) |
| M-S02 | Fewer than 3 custodians cannot open the paper, by any path, including one holding several accounts | Property tests; abuse test with 2 pieces plus a forged third; separation rule S6 |
| M-S03 | Release is refused outside the window, for the wrong centre, with a reused token, or with a missing gate | Abuse tests AB-16 to AB-20 |
| M-S04 | The draw cannot be steered once the pool is locked: seed is committed before the lock, custodians contribute, final seed is a hash of all | Seed-grinding abuse test; replay test (R-S08) |
| M-S05 | Setter submissions are encrypted client-side and signed; tampering or replay is rejected | AB-01 to AB-03 (R-S06) |
| M-S06 | Every state change is in a hash-chained, signed log; edit, delete, reorder and truncate are all detected | AB-24, AB-25 (R-S05) |
| M-S07 | Each printed copy is traceable to its seat; a partial photo narrows to a short list | Simulation SIM-03; planted-leak recall measured |
| M-S08 | Default deny: any route or action not in the matrix returns 403 | Matrix completeness test (R-S09) |
| M-S09 | Passwords hashed with a slow method; login attempts rate-limited; sessions expire | AB-07 (R-S12) |
| M-S10 | Keys, key pieces and plaintext are never written to logs, errors, analytics or the browser console | Log-scan test; error-message test (R-U04) |
| M-S11 | A suspect from the matcher is a lead, not a verdict; action needs a human decision and the named person can reply | Case-flow test (R-S11, R-P02) |

## 6. Usability requirements

These come from what the remote usability test showed us about confusing points (to be confirmed against its coded findings, see Q3), and from the course (Lecture 3 tasks, Lecture 4 mental models).

| ID | Requirement | Target and check |
| --- | --- | --- |
| M-U01 | A custodian completes an approval after a 2-minute walkthrough, without help | 5 of 5 testers, under 2 minutes, no errors; think-aloud (R-U01) |
| M-U02 | A superintendent knows within 5 seconds why Release is disabled, and what to do | Every blocked state names its gate and next step; 5-second test (R-U02, R-U04) |
| M-U03 | Each step shows what just happened in plain words and, on demand, the technical detail (the "inspector") | Reviewed by someone outside the team (R-U03) |
| M-U04 | A setter submits a question in under 90 seconds, with errors fixed in place and a visible receipt | Task timing (R-U07) |
| M-U05 | Wrong clicks can be undone without weakening security (e.g. un-approve before the quorum completes) | Critical-incident review (R-U09) |
| M-U06 | The fallback path is no harder than the normal one to follow | Think-aloud (R-U06) |
| M-U07 | Works on a phone for custodians and setters; on a laptop for admin and centre; keyboard operable; light and dark | Manual checklist; automated accessibility smoke test |
| M-U08 | Candidates are told, on the paper, why their order differs from a neighbour's | One-line note on every copy (R-U08) |

Reuse from the survey build: field validation messages that say what to enter, masked values on receipts, one clear primary action per screen, and the Light/Dark balanced palette from `/pipeline`.

## 7. Privacy and data

| ID | Requirement | Check |
| --- | --- | --- |
| M-P01 | Store only what each role needs; setter and custodian identities are not shown to centres | Data-model review (R-P01) |
| M-P02 | Leak evidence and case records have a stated retention period (default: delete 12 months after the exam) | Policy text and deletion test (R-P04) |
| M-P03 | A person named in a case sees the case and can respond before any action | Case-flow test (R-P02) |
| M-P04 | Candidate seat lists hold seat numbers only; names stay in the university's own system | Schema review |

## 8. Out of scope for v1 (so we stay small)

Reviewer role and question quality checks · negative marking and subjective questions · multiple exam profiles (competitive exams) · real printers (we generate print-ready PDFs) · hardware tokens or HSMs (software keys, documented as the limit) · normalisation and difficulty balancing beyond topic quotas · email or SMS delivery (in-app notices plus a log) · full marks processing (M-F15 is a Could).

## 9. Build slices (each ends with something we can demo and tests that pass)

| Slice | We build | Demo | Gate |
| --- | --- | --- | --- |
| A | Crypto core: AES-GCM wrapper, Shamir, hash chain, per-seat permutation; port from the demo's `logic.mjs` with tests | Command-line: seal a sample paper, open with 3, fail with 2 | Property tests pass; matches reference vectors |
| B | Users, sessions, roles, permission matrix (default deny) | Log in as each role, see only their menu | Matrix test covers every cell |
| C | Exam setup + setter submission with client-side encryption and receipts | Admin creates exam; two setters submit; admin sees counts only | AB-01 to AB-03 pass |
| D | Lock, committed seed, draw, balance report, replay | Draw once, replay gives identical result | Seed-grinding test |
| E | Sealing ceremony and custodian approval card | Three custodians approve; fewer cannot; plaintext absent from storage | Storage scan finds no plaintext |
| F | Release gates and centre screen, per-seat print PDFs, fallback | Print 20 copies, all different, each with ID; early request refused | AB-16 to AB-20 pass |
| G | Auditor: log verify, leak trace, case flow | Plant a leak in a copy; the matcher finds its seat | Planted-leak recall measured |
| H | Usability round on custodian and superintendent flows; fixes; freeze | 5 testers, targets in section 6 | M-U01, M-U02 met or documented |

Order is fixed: each slice depends on the one before. A and B can proceed in parallel.

## 10. Assumptions and open questions

Assumptions (labelled so we can challenge them): A-1 five custodians at the university are reachable on exam morning; A-2 centres have a laptop, a printer and a connection (D11, D13); A-3 the university already holds seating plans; A-4 setters will use a browser, not a native app.

| # | Question | Recommendation |
| --- | --- | --- |
| Q1 | Do we need two ceremonies (pool key at sealing, exam key at release)? | Yes for v1: it lets setters encrypt before the draw. The simpler alternative is a trusted draw server that sees question text for minutes. It is easier but fails R-S01, so we reject it. Revisit only if the ceremony is too hard for testers (M-U01). |
| Q2 | Where does the centre client run: browser or small desktop app? | Browser, decrypting in memory in the tab, with printing through the browser. Simplest; document that a compromised machine is out of scope (A5). |
| Q3 | What did the 46 usability responses say should change? | Code them first. Requirements in section 6 are hypotheses until each cites a finding in `logs/findings.csv`. Do this before slice B. |
| Q4 | Who are the real custodians and centres for the demo? | Use named roles from your own university for the poster; label as simulated. |

## 11. Definition of done for v1

A new tester, using only the user guide, runs a ten-topic exam from setup to printed copies with five people in the five roles, in under 30 minutes; every Must requirement has a passing test; fewer than three custodians cannot open the paper; a planted leak is traced to the right seat; `logs/vulnerabilities.csv` is reviewed; and the limits (software keys, simulated printers) are stated plainly.
