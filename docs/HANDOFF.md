# LeakProof project: handoff for a new person or agent

Written 14 Nov 2026. This is the whole-project view: what the project is, how it got here, where everything lives, what is done and not done.
For the code itself start with `app/docs/HANDOFF.md` (state, rules, next steps) and `app/docs/DECISIONS.md` (every decision with its reason).

## 1. The project in one paragraph
Group project for **CSE 347/547 | DES306/525 Usable Security and Privacy** (IIIT-Delhi, Dr. Arun Balaji Buduru, Monsoon 2026), a team of three (the repo author is "USS Group 19").
Topic, approved by the TA: **a leak-resistant paper-based exam pipeline** ("LeakProof"): a pool of questions from many setters, a late automated random draw, a paper locked under a key split 3 of 5
between officials, release only with a quorum inside a time window, a different but fair copy per seat so a leaked copy points to a seat, and a keyed tamper-evident log.
**Phase I** (user studies, requirements, prototypes) was submitted 4 Oct. **Phase II** (the working tool) is due **17 Nov midnight**; then the class tests every group's tool on a VM (18-25 Nov), poster 2 on 26 Nov,
our own test reports 28 Nov, a recorded video 29 Nov. The course's grading and rules are in `reference/Course Project - inclass.pdf`.

## 2. What counts for marks (why many decisions look the way they do)
Development 20%: usability of the tool 25%, security requirements satisfied 25%, software quality 15%, functional correctness 10%, presentations (10% + 15% video). Separately 15% for testing: 5% for taking
part in usability studies and 10% for security and usability testing of others' tools, **+0.5% for every functional or security bug a student finds in someone else's system**. So a bug in our frozen code
both loses us marks and gives a classmate marks. The code cannot change after the freeze, DDoS is not allowed, and testers may attack everything else.

## 3. Folder map (laptop: `/Users/hrshkr/Downloads/sem8/uss/project/`)
| Path | What |
|---|---|
| `app/` | **Phase II tool** (the deliverable), a copy of the VM repo `~/leakproof`. Start at `app/docs/HANDOFF.md`. |
| `site/` | Phase I research site, live at https://uss-ten-theta.vercel.app (Vercel project `uss`, repo `hrsh-kr/leakproof-uss`; Vercel deploys this folder; `npm install` before its tests). It collected the Phase I study data. Secrets for it live in Vercel and `~/.leakproof-admin-key`, never in git. |
| `docs/` | Current design: `11_minimal_system.md` (wins), `12_detailed_design.md`; Phase I scope/threats/requirements `00`, `02`, `05`, `06` (the site renders 02/05/06); `phase1_report.md`. `docs/HANDOFF.md` = this file. |
| `docs/archive/` | Superseded plans 01, 03, 04, 07-10. Useful for the video's "how the design evolved". |
| `docs/council/` | The role-played councils, rounds 1-5 (section 5 below). Round 5 `R7_fix_plan.md` is the synthesis that drove the final build. |
| `evidence/` | Phase I deliverables (prototypes, requirements, study reports), study instruments, and the logs (`findings`, `design_decisions`, `vulnerabilities`, ...). |
| `reference/` | Course brief (PDF) and `fcs/`: FCS Group 1 and Group 2 code (zips) and `fcs_bugs.csv` (10,225 classmate bug reports with staff Valid/Invalid rulings). |
| `README.md` | One-screen map. |
Outside `project/`: `uss/A2_uss_2022198_final/` is the separate, finished Assignment 2 submission; `uss/_removed_from_project_2026-11-14/` holds what was moved out of the project (old Python `tool/`, `site/node_modules`,
dev data, and three `.mov` files named `grp1`, `grp7`, `grp13` that look like other groups' videos: check before deleting). Lecture slides, past papers, notes and the midsem are other course folders.

VM: `192.168.2.238` (`uss04`), user `iiitd`, repo `~/leakproof`, GitHub remote `git@github.com:Abhishekjha18/leakproof.git` (different from the Phase I site's repo). Access from the owner's laptop: `ssh uss-vm`.

## 4. Timeline
| Date (2026) | What happened |
|---|---|
| Sep to 4 Oct | Phase I: study design, three waves of studies (25 interviews, 103 coded public voices, 46 survey responses), findings F1-F11, design themes T1-T5, 52-requirement register, prototypes. Submitted 4 Oct (report, poster, guidebook, consent forms). |
| 1-5 Oct | Phase I research site built and deployed (Vercel, Upstash Redis): review/interview forms, a working 4-scene demo, a drag-and-drop `/pipeline` demo. Decisions D1-D20 in `docs/02_final_scope_and_decisions.md`. |
| 11-12 Nov | Phase II planning: build requirements (09), then a 16-persona council (rounds 1-3) produced the process and design (10) and the **minimal system (11)** after seven personas attacked it. |
| 14 Nov (morning) | Consolidated the detailed design (12). Built `app/` from scratch (zero dependencies), 30 tests, browser-checked the whole flow. |
| 14 Nov | **Round 4:** read FCS Group 1 and 2 code and 10,225 bug reports, five analysts, adoption plan R6, two implementers; 51 tests. Found and fixed a one-request server crash among others. |
| 14 Nov | Reorganised the folder (1.2 GB to 25 MB). Set up key-based SSH to the VM. Found an earlier scaffold there; replaced it with our app (kept as tag `scaffold-v0`). |
| 14 Nov | **Round 5:** 6 critics and 7 testers (2 blocked by model safeguards), fix plan R7, three implementers (server, client, operations), writer for the guide, regression pass, T3 findings fixed; 107 tests. Committed on the VM, not deployed. |
| 14 Nov (evening) | This handoff. Another session added an unreviewed `deploy/accounts.sh` (see `app/docs/HANDOFF.md` section 3). |

## 5. How the work was organised (so you can continue the same way)
- **Councils** (`docs/council/`): the AI assistant ran role-played personas as subagents. Round 1: 16 personas proposed designs; round 2: three debates; round 3: seven attacked the minimal system; round 4: analysts read our code and both FCS
  groups (R1 our code, R2 G1 security, R3 G1 usability, R4 G2 security, R5 G2 usability, R6 adoption plan); round 5: critics C1-C6 (security, cryptography, web design, HCI, process/CI-CD, compliance), testers T1-T7 (recon, access control,
  fuzzing, crypto attacks, recovery/resources, functional/usability, mutation testing), R7 fix plan, T3b/T6b/T7b regression passes. Each report states evidence and a ranked change list.
- **Implementation** went to subagents with **strict file ownership** (server/tests, client, operations, docs) so two writers never edited one file; the main session reviewed, merged and re-ran the tests.
- **Verification habit:** each claim in `SECURITY.md` names a test; important fixes were mutation-checked (revert the fix, watch the test fail, restore); every council recommendation was checked against the code before acting.
- **Limits met:** the model's 5-hour usage limit stopped parallel agents twice (resume them with their saved context); the model's cyber safeguards stopped the two attack-style testers (not retried, not reworded). Treat those two test types as **not done**.
- Memory: the assistant keeps notes in `~/.claude/projects/-Users-hrshkr-Downloads-sem8-uss/memory/` (not part of the repo); this file and `app/docs/*` are the durable record.

## 6. Where to find each kind of evidence (for the video and for graders)
| Need | Look at |
|---|---|
| How studies shaped the tool (Part A) | `docs/phase1_report.md`, `evidence/phase1_deliverables/`, `evidence/logs/findings.csv`, `docs/archive/` |
| Security requirements and how each is met (Part B) | `app/SECURITY.md` (SR1-SR15 with the test for each), `docs/05_threat_model_v0.md`, `docs/06_requirements_register.md` |
| Vulnerability classes, causes, lessons | `app/logs/vulnerabilities.csv` (14 so far), `docs/council/round4/R1-R6`, `docs/council/round5/`, and what classmates report from 18 Nov |
| What classmates will probably report and our rebuttals | `docs/council/round5/C6_compliance.md` section 3 (25 predicted reports with rebuttals) |
| Decisions and reasons | `app/docs/DECISIONS.md`; Phase I decisions D1-D20 in `docs/02_final_scope_and_decisions.md` |
| Operating the VM, release, rollback, watchdog, calendar | `app/docs/OPERATIONS.md` |

## 7. State, in one table
| Item | Status |
|---|---|
| Phase I deliverables | Done and submitted; research site live |
| Phase II code | Built; 107 tests pass; committed on the VM repo (`846e0d3`); **not pushed to GitHub, not deployed** |
| Guide, tester page, help page | Written and checked against the code; not piloted with strangers; not checked in real browsers |
| Demo credentials per role | Designed (3 demo pods) and scripted; **generated only at deploy time** (`deploy/demo-setup.sh`) |
| CI/CD, watchdog, release/rollback | Written and syntax-checked; **never run on the VM** |
| Attack-style testing | Access-control pentest and cryptanalysis **not done**; fuzzing, recon, recovery, mutation done |
| Freeze | 17 Nov midnight; tag `v1.0.0` not created yet |
Next steps, with commands: `app/docs/HANDOFF.md` section 7.

## 8. Things only a human can do
Provide the `sudo` password for the first deploy; change the VM password (it was pasted into a chat); decide who plays M1 (repo owner/tags), M2 (VM lead), M3 (tests/docs); supply the contact line for the tester page;
push to GitHub and cut `v1.0.0`; run the real-browser check and the pilot; decide whether an approved person should do the two missing attack tests; decide what to do with the three `.mov` files and the unreviewed `accounts.sh`.

## 9. Glossary
**Seal**: draw the paper and lock it, delete the pool. **Key card**: one person's share of the paper key, encrypted in their browser. **Holder**: a person with a key card. **Release**: opening the paper for printing after three cards approve.
**Exam cell**: staff who run Seal, request release and print. **Gate**: a release condition (quorum, window, seats). **Pod**: one group of eight demo accounts. **Practice / demo / official**: the three instances.
**FCS**: the course *Foundations of Computer Security*, whose Group 1 and Group 2 projects (and their bug reports) were our baseline. **Freeze**: the 17 Nov midnight point after which code cannot change.
