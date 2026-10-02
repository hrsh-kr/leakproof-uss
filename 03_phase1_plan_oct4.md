# Phase I Plan: Oct 2 to Oct 4 (and poster to Oct 7)

Status: v1. Deadline: Phase I due **Sun Oct 4**. Poster submitted **Tue Oct 6**, presented **Wed Oct 7**.
What Phase I must contain (from the brief): **User Study Evaluation reports, Requirements, Design Prototypes.** Studies must change the design, and we need quantitative and qualitative data.

Who does what: the project owner runs the people-facing work (recruiting, interviews, sessions). Claude drafts instruments, does secondary research, builds prototypes, codes the data the owner provides, and writes the reports. The team reviews the shared doc and helps recruit.

## 0. Rules for the next three days

1. **Evidence rule.** A requirement or design choice is written down only with a source: a finding ID (from our data), a cited document, or a labelled assumption. No source, no requirement.
2. **Smallest thing that works.** Each deliverable has a minimum version and a target version. We finish all minimums first.
3. **Everything gets a file.** Every output below has a path. If it is not in the folder, it does not count.
4. **Test our own work.** The prototype is tested with users. Instruments are piloted on 2 people. Requirements are checked against the traceability table. The vertical-slice code has a test suite that must pass.
5. **Log the changes.** Whenever a study changes a decision, add a row to `logs/design_decisions.csv`.

## 1. Minimum and target numbers

| Study | Minimum | Target | Reason |
| --- | --- | --- | --- |
| Candidate survey | 20 | 30+ | Quantitative base. A1 used 7; this is a bigger study |
| Setter or faculty interviews | 3 | 5 | Lecture 3: 4 to 5 per user class finds about 80% of issues |
| Centre staff, exam-cell or invigilator interviews | 3 | 5 | Same |
| Walk-through of how an exam is printed and stored | 1 | 2 | Ground truth for the centre flow |
| Prototype think-aloud | 4 | 5 per major role | Test of the ceremony and key screens |
| Secondary: incident cases | 5 | 8 | Threat model evidence |
| Secondary: compared systems | 4 | 6 | Gaps and precedents |
| Secondary: papers or reports | 5 | 8 to 10 | Technical grounding |

## 2. Phases

### P0. Foundations (Oct 2, morning) [Claude]
- **Output:** `02_final_scope_and_decisions.md`, `04_tool_spec_and_test_plan.md`, `05_threat_model_v0.md`, `06_requirements_register.md`, `logs/*.csv`, tool skeleton with a passing smoke test.
- **Done when:** the owner has read the scope and decision log and agreed or edited; the test runner works.

### P1. Study instruments (Oct 2) [Claude drafts, owner reviews and pilots]
- **Output** in `research/consent_and_instruments/`: study information sheet and consent, candidate survey (Google Forms-ready), interview guides for setters and for centre staff, mental-model drawing task, think-aloud script with 4 tasks, SUS questionnaire, recruitment message, anonymisation rules, data intake format.
- **Done when:** piloted on 2 people; timing recorded (survey under 10 minutes, interview under 30, think-aloud under 30); wording fixed.
- **Why now:** recruiting is the slowest step.

### P2. Secondary research (Oct 2 to 3) [Claude, with checks by owner]
- **Output** in `research/secondary/`: incident table (case, year, stage where the leak happened, mechanism, source, source quality), comparative analysis (system, how paper travels, who can read it, traceability, cost, gaps), reading list with one-line takeaways.
- **Done when:** every row has a link the owner has opened at least once; claims from secondary sources are labelled.
- **Risk:** Reddit is unreachable by my tools. Fallback: the owner pastes threads, or I use a browser the owner permits.

### P3. Primary data collection (Oct 2 to 3) [owner, with team help]
- **Output** in `research/primary/`: `survey_responses.csv`, `INT-S-01.txt` and similar transcripts, `walkthrough_notes.md`, `thinkaloud_P01.md` and similar, all with anonymous participant codes.
- **Done when:** minimum numbers in section 1 are met.
- **Intake rules:** codes only (P01, P02), no names or emails in files, a line saying whether consent was given, role, date, duration.

### P4. Prototypes (Oct 2 to 3) [Claude builds, owner tests]
- **Output** in `phase1_deliverables/prototypes/`:
  - Workflow diagram for each of 5 roles (setter, reviewer, admin, centre staff, investigator).
  - Low-fidelity paper pack for think-aloud (printable screens and a script for the "computer").
  - Clickable medium-fidelity HTML prototype of 4 flows: setter submission, authority draw and seal, **centre key ceremony and print** (the riskiest flow, built deeper), investigator leak trace.
  - Two storyboards.
  - A design-themes sheet, filled after studies.
- **Done when:** think-aloud with 4 or more people has been run on the paper or clickable version and critical incidents are recorded.
- **Why this shape:** Lecture 3 says use low fidelity early (horizontal, all roles) and go deeper where risk is highest (vertical, the ceremony).

### P4b. Vertical-slice code (Oct 3, only if P1 to P3 are on time) [Claude, tested]
- **Output** in `tool/`: Shamir sharing, sealed bundle, per-copy permutation, hash-chained log, with tests.
- **Done when:** the whole test suite passes and the four pieces demo from a script.
- **Why:** proves feasibility, gives Phase II a head start, and backs the prototype with something real.
- **Gate:** if survey or interviews are behind, skip it.

### P5. Analysis and requirements (Oct 3 to 4) [Claude drafts, owner checks]
- **Output:** `logs/findings.csv` filled; critical-incident reports (problem statement, user goal, immediate intention, possible causes); consolidated insights; requirements register with evidence IDs; threat model v1; an updated decision log showing what changed.
- **Done when:** every requirement has an evidence ID or an assumption label; every Must item in scope maps to at least one requirement.

### P6. Compile and check (Oct 4) [Claude drafts, owner submits]
- **Output** in `phase1_deliverables/`: `user_study_reports/` (report plus appendices), `requirements/` (requirements document), `prototypes/` (package), a README listing what is where.
- **Done when:** the brief checklist in section 4 is all ticked.

### P7. Poster (Oct 5 to 6) [Claude drafts, owner reviews]
- **Output** in `poster/`: poster file and a 90-second talk script.
- **Done when:** submitted on Oct 6; rehearsed once.

## 3. Day by day

| Day | Morning | Afternoon | Evening |
| --- | --- | --- | --- |
| **Fri Oct 2** | P0 complete. P1 drafts | Owner pilots survey on 2 people; survey released. P2 starts | Interviews begin; P4 workflows |
| **Sat Oct 3** | Interviews finish; P2 completes | Think-aloud sessions; P4 clickable prototype; P4b if on time | P5 coding of data; first findings |
| **Sun Oct 4** | P5 requirements and threat model v1 | P6 compile, check against the brief | **Submit**; start poster |
| Mon Oct 5 | P7 poster draft | Review | |
| **Tue Oct 6** | Final poster | **Submit poster** | |
| **Wed Oct 7** | Present | | |

## 4. Phase I submission checklist (from the brief and lectures)

- [ ] User Study Evaluation report present, with primary and secondary research
- [ ] Quantitative data (counts, scale scores, time on task, SUS) and qualitative data (quotes, themes)
- [ ] Study design shown: goals, participants and recruitment, consent, tasks with scenario, goal, end criterion and time limit, data collected, pilot notes (Lecture 3)
- [ ] Critical incidents recorded and consolidated
- [ ] Mental-model findings (Lecture 4)
- [ ] Findings show how they changed the design (decision log)
- [ ] Requirements: usability, security and privacy, each with evidence and a test idea
- [ ] Threat model with assumptions and limits
- [ ] Prototypes: workflows, low-fidelity, clickable, storyboards
- [ ] Limitations stated: proxy participants, sample sizes, simulated corpus
- [ ] Participant data anonymous and stored safely
- [ ] Everything in the folders listed in the README

## 5. What I need from the owner, by when

| Need | By | Note |
| --- | --- | --- |
| Approve scope and decision log, or mark edits | Oct 2 noon | Review `02_final_scope_and_decisions.md` |
| Pilot survey on 2 people and release | Oct 2 afternoon | I will give Google Forms-ready text |
| Run interviews and the walk-through | Oct 2 and 3 | Guides provided in P1 |
| Run 4 or 5 think-aloud sessions | Oct 3 | Script provided |
| Drop transcripts and responses into `research/primary/` | As done; all by Oct 3 night | Anonymous codes only |
| Ask TA the three questions (proposal, team size, consent) | Oct 2 | See team doc |

## 6. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Fewer interviews than the minimum | Substitute longer survey free-text plus the incident analysis, and say so |
| No access to an exam cell | Interview faculty who run midsems and describe their process; label as proxy |
| Prototype test sessions cannot be scheduled | Run shorter 15-minute sessions with classmates on the clickable version |
| Survey responses are low | Post in class groups and ask each teammate for 5 |
| Code slice slips | Drop P4b; it is a bonus for Phase I |
| Disagreement between sources | Report both; do not choose silently |
