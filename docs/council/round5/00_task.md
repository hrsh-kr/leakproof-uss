# Round 5: critique and test LeakProof before the code freeze

Today is Sat 14 Nov 2026. **The source code is submitted on Tue 17 Nov (midnight) and cannot change afterwards.** From 18 Nov the whole class tests every other group's system on a VM. The only forbidden test is DDoS.

## What decides our marks (from the course guideline `Course_Project___inclass.txt` and Lecture 7)
- Development: usability of the tool 25%, **satisfaction of our security requirements 25%**, quality of software 15%, functional correctness 10%, presentations 25%.
- Separate 10% per student for *usability evaluation and security testing of other groups' projects*: **+0.5% for every functional or security bug they find in someone else's system**. Bugs found in ours cost us (the FCS precedent: staff rule each report Valid or Invalid; rebuttals are allowed; a report needs a working exploit with screenshots; "functional" bugs count too). Past data: `fcs_bugs.csv` (columns: group, type, category, impact, Valid/Invalid, rebuttal).
- Deliverables owed: executable on the file server + **user guide** + **demo credentials for each role in our pipeline**, posted before 8 am 18 Nov. Part B of the final video needs: security requirements, how addressed, classes of vulnerabilities students reported, causes, lessons learnt.
- Class methods (Lecture 7): target vulnerability *identification* (recon, port/service identification, vulnerability scanning) then *validation* (password cracking, unit, integration, regression, fault injection, recovery, penetration, social engineering); usability testing (think-aloud, key-task testing, metrics). Lectures 1-8 text is in `/private/tmp/claude-501/uss-r5/Lecture_*.txt`; the cheat sheet is `/private/tmp/claude-501/uss-r5/UsS_Cheat_Sheet.md`.
- Team: 3 members, all working; one VM (Ubuntu 24.04, Node 22.23, Caddy, 6 CPU, 5.8 GB RAM) at 192.168.2.238; code lives in a git repo on the VM with a GitHub remote.

## What we are testing
**Frozen snapshot (read-only for you): `/private/tmp/claude-501/uss-r5/app-snapshot/`** (zero-dependency Node 22+, `npm test` = 52 passing tests). Read in this order: `README.md`, `SECURITY.md`, `USER_GUIDE.md`, `server.mjs`, `src/*.mjs`, `public/*`, `tests/*.mjs`, `deploy/*`, `scripts/*`. Design intent: `/Users/hrshkr/Downloads/sem8/uss/project/docs/11_minimal_system.md` (wins) and `12_detailed_design.md`. Earlier councils: `docs/council/round1..4` (round 4 = lessons from FCS Groups 1 and 2, `round4/R6_adoption_plan.md`).

The system: setters submit encrypted questions; Seal draws the paper, locks it under a key split 3 of 5 (Shamir), deletes the pool; key holders verify cards (encrypted in their browser); release needs 3 verified cards + two words + window + seat gates; each seat gets its own copy order; keyed hash-chained log; leak trace by question order. Two instances, `practice` (self-registration, course code) and `official` (accounts made by `scripts/official-setup.mjs`).

## Rules for everyone
- **Do not edit the snapshot or anything under `/Users/hrshkr/Downloads/sem8/uss/project/app`.** Write only your report (path given in your prompt) and scratch files under your own temp directory. Never touch port 8080 or 8443 or the VM (`uss-vm`); never SSH anywhere. Never read or print `~/.ssh` or any password.
- Active testers run their own throwaway instance of a **copy** of the snapshot, on the port range given to them, with a temp data dir; kill what you start. Tests must be low volume: **no DDoS or flood-style load** (a few hundred requests at most per test, for measuring cost, is fine). Do not run anything from `reference/fcs`.
- Everything is role-played, for a student project. Be blunt, concrete and honest. Say "unverified" when you did not run it. No invented facts: cite file and line, or the exact command you ran and its output.
- **Rank every finding by marks impact:** (a) will a classmate find it in a week, (b) would it be accepted as Valid (exploit shown, in scope), (c) cost to fix before 17 Nov, and whether the fix could itself introduce a bug.
- Keep the report under 700 words plus tables; put long evidence in an appendix at the end of your file. Reply to the parent with a digest of at most 120 words: your top 5 findings.
- Report format for each finding: `ID | title | class | severity (critical/high/med/low) | evidence/PoC | impact | smallest fix | confidence`.
