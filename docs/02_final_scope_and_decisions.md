# Final Scope, Assumptions and Decision Log

Status: v1, final scope for Phase I. Decisions marked REVISIT can be overturned by study evidence.
Companion docs: `00_problem_statement_and_scope.md` (why), `03_phase1_plan_oct4.md` (what we do until Oct 4), `04_tool_spec_and_test_plan.md` (how we build and test), `05_threat_model_v0.md`, `06_requirements_register.md`.

How to read this file: the course has no single right answer. Every choice below lists the options we looked at, the pros and cons of each, what we picked, why, and what evidence would make us change our mind. If a study contradicts a decision, we change the decision and log the change in `logs/design_decisions.csv`.

---

## 1. Scope in one paragraph

We build a leak-resistant workflow for paper-based exams and a working tool that demonstrates it end to end. Many setters write a few questions each. A program draws a paper from the pool late and at random. The paper is stored encrypted, with the key split among several custodians. At the exam centre, after candidates are seated and a quorum approves, the paper is printed locally, and each printed copy is different so a leaked photo points to one seat. Every step is logged in a tamper-evident log. If a leak appears, a matcher compares public text against our pool and copies and ranks likely sources with stated confidence. We judge ourselves by user studies with each role, by security requirements that each have a control and a test, and by whether a stranger can use the tool without our help.

## 2. In scope, out of scope

| Level | Item | Done means (observable) |
| --- | --- | --- |
| Must | Setter submission, signed and encrypted | A setter can submit 5 questions; a tampered submission is rejected; no other role can read it |
| Must | Pool with blueprint cells and duplicate check | Near-duplicate questions are flagged; cells over-filled are refused |
| Must | Draw per shift with balance report | Same inputs and seed give the same paper; quotas for topic and difficulty are met or the draw reports why not |
| Must | Split-key sealing and quorum release | Fewer than k custodians cannot open the paper; k can |
| Must | Centre print with per-candidate order | Each copy has a unique ID; the order can be recovered from a partial photo |
| Must | Hash-chained signed audit log with verify | Editing, deleting or reordering any entry makes verify fail |
| Must | Leak matcher and suspect list on a simulated corpus | Planted leaks are found; suspects carry a confidence and a reason |
| Must | Role-scoped permissions with a test matrix | Every role, action and ownership case has an expected allow or deny, tested |
| Must | Inspector panel at every step | A user can see what just happened without reading code |
| Must | Five exam profiles as config files | Switching profile changes size, shifts, blueprint with no code change |
| Should | Reviewer role seeing limited subsets | No reviewer sees more than the cap |
| Should | Offline fallback at the centre | Same controls, longer ceremony, logged |
| Should | Collusion simulator | Shows exposure against the number of compromised setters |
| Should | Scripted attack demos (red-team console) | Each demo shows a control stopping or detecting an attack |
| Should | Guided tour and user guide | A peer tester completes the main flow unaided |
| Could | Hardware demo (printer, USB keys) | Only if everything above is done |
| Could | QR on each copy, score normalisation preview, Hindi rendering | |
| Will not | Blockchain network, real crawling of Telegram or Reddit, trained ML, real exam content, biometric hardware, impersonation, psychometric calibration | Stated as limits in the report |

## 3. Assumptions

An assumption is something we choose to believe so we can build. Each one says what breaks if it is false and how we check it.

| ID | Assumption | Why we assume it | What breaks if false | How we check |
| --- | --- | --- | --- | --- |
| A1 | Candidate identity is checked at the centre by existing means | Verification is a separate, large problem | Impersonation defeats seat-level tracing | Out of scope; stated limit |
| A2 | At least k of n custodians are honest and available (default 3 of 5) | Threshold schemes need it | A quorum of dishonest custodians opens the paper early | Study: who can serve as custodians; sensitivity test with k and n |
| A3 | Each centre has one working printer and power during the window, or invokes the fallback | Print-at-centre needs it | Exam delayed or fallback becomes the weak path | Interviews with centre staff; fallback tests |
| A4 | The authority can identify and authenticate setters | Needed to sign submissions | Fake setters inject questions | Interviews with setters |
| A5 | The admin is not individually trusted | Insiders caused real leaks | If admin can read plaintext, the pool idea protects nothing | Permission tests show admin cannot read questions |
| A6 | Each centre has connectivity at some point before the exam, not necessarily during | Bundles must arrive | Centres with none need courier of an encrypted drive | Interviews; fallback design |
| A7 | Centre clocks may be wrong by minutes | Real devices drift | Early or late release | Clock-skew tests |
| A8 | The draw is uniform within blueprint cells | Gives the exposure result of about a fraction p for p compromised | Skewed draw concentrates exposure | Simulation tests |
| A9 | Leaks appear as text or photos of questions in public places | Matches real cases | Private or encrypted sharing is invisible to us | Stated limit |
| A10 | Proxy participants (faculty, TAs, exam-cell staff, students) represent real roles imperfectly | We cannot reach NTA staff | Findings may not transfer | Stated limit; second round later |
| A11 | The sealing machine, where plaintext briefly exists, is run as a witnessed, logged ceremony | Some component must assemble the paper | One malicious operator could copy the paper | Decision D9; logged and witnessed |

## 4. Decision log

Format per decision: options with pros and cons, our choice, why, revisit if. Tests that check each decision are in `04_tool_spec_and_test_plan.md`.

### D1. Overall approach
- **A. Sealed print only.** Pros: simplest, matches the 2024 panel's idea. Cons: not new; ignores how questions are written.
- **B. Pool and draw only.** Pros: interesting algorithms. Cons: final paper still readable by operators.
- **C. Trace only.** Pros: novel; useful when prevention fails. Cons: acts only after a leak; evidence is probabilistic.
- **D. Thin slice of all three, joined by one log.** Pros: whole story, each part earns its place. Cons: risk of shallowness; needs strict scope.
- **Choice: D.** Why: each of A, B and C alone leaves a stage of the real chain uncovered, and the brief wants usability and security requirements demonstrated across a workflow. Revisit if: study shows stakeholders reject in-centre printing (then B and C matter more).

### D2. Who can open the paper
- **Single admin key.** Pros: trivial. Cons: one person or one stolen key leaks everything. Lecture 2 notes a key distribution centre can impersonate any node and is a single point of failure.
- **Hardware security module.** Pros: strong key protection. Cons: cost, setup, still one authority.
- **Split key, k of n custodians (Shamir).** Pros: no single person is enough; easy to explain with a bank-locker picture; a cryptographic fit to quorum approval. Cons: custodians must be available; ceremony adds time and error chances.
- **Time-lock encryption.** Pros: opens by itself at a time. Cons: needs outside infrastructure; no human check that candidates are seated.
- **Choice: split key, default 3 of 5, configurable per profile.** Revisit if: studies show custodians cannot be assembled in the window; then lower k or add a fallback.

### D3. Shamir implementation
- **Library only.** Pros: fewer bugs. Cons: no originality credit; black box for the inspector.
- **Write our own over a prime field.** Pros: counts as original code; we can show each step; teaches the scheme. Cons: risk of subtle error.
- **Choice: write our own, but test against a trusted library and known vectors as a reference.** Why: we use vetted libraries for AES-GCM and Ed25519 (never write those) and own only the sharing logic, with differential tests as the safety net. Revisit if: tests find any mismatch we cannot explain; then switch to the library.

### D4. Making copies traceable
- **Set codes (A to D).** Pros: simple. Cons: only 4 groups; hundreds share one set.
- **Invisible marks in print.** Pros: invisible to candidates. Cons: needs printer-specific work; may not survive a phone photo.
- **Per-candidate question and option order (a permutation seeded by copy ID).** Pros: no special hardware; visible in any photo of a page; recoverable from partial photos; easy to test. Cons: question order can affect difficulty slightly; answer key must map per copy; candidates may notice.
- **Choice: per-candidate permutation, with a visible copy ID and check digits.** Revisit if: studies show candidates or staff find varied order unfair or confusing.

### D5. Audit log
- **Ordinary database table.** Pros: simple. Cons: an admin can edit it silently.
- **Hash-chained, signed log.** Pros: any edit breaks the chain; cheap; easy to verify. Cons: only detects tampering, does not prevent deletion of the tail unless the latest hash is published elsewhere.
- **Public blockchain.** Pros: strong outside witness. Cons: cost, complexity, delay, no extra property we need.
- **Choice: hash-chained, signed log, with the latest hash printed on each copy batch sheet or posted publicly as an optional outside witness.** Revisit if: reviewers demand a third-party witness; then add a public timestamp service.

### D6. Leak detection
- **Real crawler of Telegram and Reddit.** Pros: realistic. Cons: Telegram is largely private or blocked (and admitted it cannot proactively police such channels); terms of service and data protection issues; hard to test.
- **Simulated corpus of leak posts.** Pros: repeatable tests; no ethics issue; lets us plant known leaks. Cons: less realistic; we must justify the simulation.
- **Paste-in or upload tool for investigators.** Pros: matches how investigators receive material. Cons: manual.
- **Choice: simulated corpus plus a paste-in tool, with the matcher based on text similarity.** Revisit if: TA wants real data; we can add a read-only importer for public posts.

### D7. Finding the source of a leak
- **List of everyone who could have seen the item.** Pros: simple, explainable. Cons: coarse.
- **Small hand-built probability model (Bayesian-style, per Lecture 5).** Pros: combines several leaked items; shows confidence; no training data needed. Cons: our priors are assumptions.
- **Trained ML.** Pros: flexible. Cons: no labelled data; opaque; costly errors (Lecture 5 lists these challenges).
- **Choice: access list first, then the probability model, always with a person reviewing the result.** Revisit if: simulations show the model does worse than the access list.

### D8. Building the paper
- **Pure random.** Pros: simple. Cons: breaks topic and difficulty balance.
- **Random with quotas, then greedy repair.** Pros: meets rules, still unpredictable, easy to test. Cons: may fail on tight rules.
- **Optimisation solver (integer programming).** Pros: exact. Cons: heavier dependency, harder to explain.
- **Choice: random with quotas plus repair, reporting any rule it could not meet.** Revisit if: repair fails often in simulations on tight profiles.

### D9. Where plaintext exists (the hardest decision)
Questions must be decrypted once so a paper can be sealed. Options:
- **Admin decrypts and assembles by hand.** Pros: familiar. Cons: this is the leak point.
- **Automated sealing step run as a witnessed ceremony with the pool key reconstructed from custodian shares, used in memory, then wiped; logged.** Pros: no human reads the paper; needs a quorum; evidence in the log. Cons: the machine and its code become the trust anchor; memory wiping is best effort.
- **Never decrypt (computation on encrypted data).** Pros: strongest in theory. Cons: not practical here.
- **Choice: automated, quorum-authorised sealing, explicit assumption A11.** Revisit if: studies or the TA require stronger separation; then add a second independent machine that checks the sealed output.

### D10. Time-limited release and clocks
- **Centre device clock decides.** Pros: simple. Cons: wrong clock opens early or late.
- **Authority-signed release token with a validity window and tolerance (like an expiring ticket, Lecture 2).** Pros: one source of time; replay-resistant with a nonce. Cons: needs a signed token reaching the centre; failure when none arrives.
- **Time-lock puzzle.** Pros: no server. Cons: complex, not tied to seating.
- **Choice: signed token with window plus nonce, release also needs the centre's signed seating report and a quorum; fail closed.** Fail closed means: if anything is missing, nothing prints and the fallback is used. Why: availability loss is recoverable; an early leak is not. Revisit if: studies show failures are too frequent for staff to tolerate.

### D11. Platform
- **Native or mobile apps.** Pros: nice. Cons: slower to build and to have peers test.
- **Web app: Python backend (FastAPI), SQLite, server-rendered pages with light JavaScript.** Pros: runs on a laptop; peers test in a browser; one language for logic and tests; our crypto library is already installed. Cons: UI polish takes effort.
- **Choice: web app as above, plus a simulated centre screen.** Revisit if: a hardware demo needs a different client.

### D12. Logging in
- **Passwords only.** Pros: simple. Cons: weak for custodians.
- **Password plus a key file the user holds (stands in for a hardware token).** Pros: custodian approvals are signatures, which gives non-repudiation (with the Lecture 2 caveat that a stolen key can be abused). Cons: key file handling for testers.
- **Choice: password for all roles; custodians and centre staff additionally sign actions with their key file.** Passwords are hashed with a standard slow hash. Revisit if: testers cannot manage key files.

### D13. Permissions
- **Role only (a setter can do setter things).** Pros: simple. Cons: allows reading other setters' questions.
- **Role plus ownership, assignment, centre and time scoping, deny by default.** Pros: matches least privilege and the real threats; testable as a table. Cons: more code and more tests.
- **Choice: the second, with the permission matrix in `04_tool_spec_and_test_plan.md` as the single source of truth and generated tests.** Revisit if: a legitimate workflow is blocked; log it and widen narrowly.

### D14. Exam profiles
- **Hard-code one exam.** Pros: fastest. Cons: does not show flexibility.
- **Config files per profile (size, shifts, blueprint, languages, window, k and n).** Pros: shows the engine is general; easy to demo five exams. Cons: needs validation code and tests.
- **Choice: config files with strict validation.** Profiles: NEET-UG, UP Police Constable, UGC-NET, UPPSC RO/ARO, SSC or Railway style.

### D15. Testing approach
- **Manual testing only.** Pros: cheap. Cons: no regression safety; weak evidence.
- **Unit tests only.** Pros: fast. Cons: miss abuse and permission mistakes.
- **Layered tests: unit, property-based, permission matrix, abuse cases written to break our system, simulation tests, end to end, plus user tests.** Pros: evidence for the security requirements grade; catches regressions; mirrors how peers will attack us. Cons: time cost.
- **Choice: layered, tests written before or with each module, failing tests block progress.** See `04_tool_spec_and_test_plan.md`.

### D16. Participants
- **Real NTA and exam-authority staff.** Pros: ideal. Cons: not reachable in the time.
- **Proxies: faculty who set papers, TAs, exam-cell staff, invigilators, students who took national exams.** Pros: reachable; close in activity. Cons: not identical; findings may not transfer.
- **Choice: proxies now, label as a limitation, plan a second round later.**

### D17. Feedback channel (revised 2 Oct)
- **Google Forms or Tally, typed.** Pros: quick to set up, familiar. Cons: a second place to send people, no task timing or tap counts, no live results on our own site, hard to tie to the prototype.
- **Tally plus a voice link (a WhatsApp voice note or a voice-form tool).** Pros: lowest effort for the person answering. Cons: WhatsApp shows the sender's number, another tool and account, free-plan limits not verified. This was the first plan.
- **Our own survey on the site, typed, with browser dictation.** Pros: talking is easier than typing, and nothing extra to install. Cons: dictation runs on the browser vendor's speech service. In a real test it failed with "speech service is not reachable", and it fails for many people on some browsers, networks and phones. A feature that fails for some people is worse than none.
- **Our own survey on the site, typed only, plus an interview booking form.** Pros: one place for everything; task timing, taps and ratings recorded; live results; contact details stored apart; people who prefer to talk book a real conversation, which is richer than a recording. Cons: typing takes more effort; we need our own storage and tests.
- **Choice: our own survey, typed, with interview booking. Dictation is switched off by a flag (`config.mjs`) and its code and tests are kept.** Revisit if: people skip the open questions because typing is hard. Then try recording short audio notes and transcribing them ourselves, with clear consent.

### D18. Knowing who gave each review (added 2 Oct)
- **Anonymous reviews only.** Pros: most honest answers; least data to protect. Cons: we cannot tell which classmate gave which feedback, cannot confirm participation for credit, cannot spot the same person submitting twice, cannot follow up.
- **Email asked but optional.** Pros: low friction. Cons: most people skip it, so we cannot rely on it; those who give it differ from those who do not; credit checks stay unreliable.
- **Email required for the 12-minute review, stored apart from the answers.** Pros: every review can be tied to a person for credit, swaps and follow-ups; repeats are flagged; analysis files and public results stay free of identity because the two are joined only by a receipt code, and only in the team-only admin view. Cons: a little more effort at the start; some people may leave or answer less candidly; we now hold personal data and must delete it.
- **Choice: required, stored in a separate record, never in the analysis export, public results or the report; masked on the receipt; deleted after the final report.** Assumption: people taking part are classmates, faculty and exam staff who are comfortable giving an email for a course study; no one under 18. The interview form and the quick one-tap comments are unchanged (the first needs contact details anyway; the second stays anonymous). Revisit if: the pilot shows people abandoning at the email field. Then make it optional for people outside the course and keep it required for classmates.

### D19. The swap link, a fair trade (added 2 Oct)
- **No swap.** Pros: simplest. Cons: we lose the chance to take part in return, which is how the course expects groups to help each other (1% per five studies).
- **Ask for a link, optional for everyone.** Pros: no friction. Cons: few will offer it; no fairness.
- **Required for everyone.** Pros: one simple rule. Cons: people outside the course have no study to share and would paste fake links; it forces an action that makes no sense for them.
- **Required for classmates, optional for everyone else.** Pros: matches the course; no fake links; the ask comes on the last page, after the person has already been helped by our study (the favour is asked after the value is given). Cons: it relies on people picking their own role honestly; we cannot verify it.
- **Choice: required when the person says they are a student in this course, optional otherwise.** The link must be a plain web link (https or http, no username or password, no scripts). The admin view makes it clickable only when it is a web link. Assumption: classmates will have a study link by the time they answer. Revisit if: classmates say they have nothing to share yet. Then allow "coming soon" and ask again later.

### D20. Asking for a chat: a separate, minimal form (added 2 Oct)
- **A time-slot picker inside the review** (what we had first). Pros: one trip for the person. Cons: we had to invent slots and call channels in advance; the review got longer; people who only want to talk still met the review.
- **A scheduling tool** (Calendly, Cal.com, Google Calendar booking). Pros: no back and forth. Cons: another account and third-party script (the site has none); we would have to publish real availability; free-plan limits not verified.
- **A separate minimal form on our own site: a consent box, when you are free in your own words, how to reach you, an optional name.** Pros: nothing for us to invent; short; people who only want to talk skip the review; the Send button stays off until the consent box is ticked and the server also refuses without it; the consent is stored with the request. Cons: we arrange the time by message, which costs one round of replies.
- **Choice: the separate minimal form; the review's receipt page points to it. We capture what people write and arrange the rest ourselves.** Revisit if: requests pile up and the replies become slow. Then use a scheduling tool.

## 5. What we do not know yet (research questions)

Each question can change a decision. The studies in `03_phase1_plan_oct4.md` are designed to answer them.

| ID | Question | Could change | Study |
| --- | --- | --- | --- |
| RQ1 | How do setters write and share questions today, and would they accept signed, encrypted submission? | D12, D9 | Setter interviews |
| RQ2 | What happens in a real exam-day printing and storage routine, and where do people improvise? | D2, D10, fallback | Centre interviews, walk-through |
| RQ3 | Will centre staff and candidates accept printing at the centre and varied question order? | D4, D1 | Survey, centre interviews |
| RQ4 | How do people picture how the paper travels and how a split key works? | Interface wording, ceremony design | Mental-model drawing task |
| RQ5 | Can a non-technical person complete the key ceremony under time pressure without errors? | D2, D10 | Think-aloud on prototype |
| RQ6 | How much do candidates trust such a system, and what makes them trust or distrust it? | Transparency features, inspector design | Survey |

## 6. Change control

- Any change to a Must item, or to a decision above, is a row in `logs/design_decisions.csv` with date, reason and evidence.
- The team doc is for review; this file is the record. When the team replies in the doc, copy decisions here.
