# UsS Course Project: Leak-Resistant Paper Exams

CSE 347/652 | DES 306/525, Usable Security and Privacy (Monsoon 2026). Brief: `reference/Course Project - inclass.pdf`.
Team doc for review: https://claude.ai/code/artifact/aca027fe-24fa-44d1-b04b-37cca8f5c4ff

## Deadlines

| Date | Milestone | Deliverables |
|---|---|---|
| **Oct 4, 2026** | Phase I | User study evaluation reports, requirements, design prototypes |
| **Oct 6** | Poster submission | Compilation of usability studies and design themes |
| **Oct 7** | Poster session 1 | Per the brief |
| Nov 17 | Phase II | Executable and user guide; at least 50% original code |
| Nov 18 to 25 | Peer testing | Each student tests 8 or more other projects |
| Nov 26 | Poster session 2 | Live demo |
| Nov 28 | Test reports | Validated vulnerabilities with screenshots |
| Nov 29 | Final video | Under 20 minutes |

## Document map (read in this order)

| # | File | What it is | Status |
|---|---|---|---|
| 00 | `00_problem_statement_and_scope.md` | Audit of the idea, formal problem statement, first scope | Done (superseded by 02 where they differ) |
| 01 | `01_course_alignment_and_plan.md` | Brief-to-artifact traceability, grading map, calendar to Nov 29, lecture alignment | Done |
| **02** | `02_final_scope_and_decisions.md` | **Final scope, assumptions, 17 decisions with pros and cons, research questions** | **Final v1** |
| **03** | `03_phase1_plan_oct4.md` | **Phases P0 to P7 to Oct 4, minimum and target numbers, checklist** | **Final v1** |
| **04** | `04_tool_spec_and_test_plan.md` | **Architecture, permission matrix, build order B0 to B13, test layers, abuse catalogue** | **Final v1** |
| 05 | `05_threat_model_v0.md` | Assets, actors, 24 threats with controls and tests | v0, becomes v1 on Oct 4 |
| 06 | `06_requirements_register.md` | Usability, security, privacy, functional requirements (hypotheses until evidenced) | v0 seed |
| 08 | `08_phase1_deliverables_crosswalk.md` | What Phase I must contain: brief x lectures x Assignment 1 x outside practice, mapped to the site | v1 |
| 07 | `07_operating_principles.md` | How we work: Jobs, Graham, Thiel, Hormozi lenses turned into rules, scorecard and feedback design | v1 |
| | `logs/` | findings, design decisions, vulnerabilities, contributions, participation tally (CSV) | Live |
| | `tool/` | Working code and tests (`make test`) | B0 done |
| | **`site/`** | **The website that is the Phase I submission, deployable on Vercel (48 tests)** | **Built; needs deploy** |
| | `research/` | instruments (P1), primary data (P3), secondary research (P2) | Next |
| | `phase1_deliverables/` | What we submit on Oct 4 | Later |
| | `poster/` | Poster | Oct 5 to 6 |

## Phase I progress

| Phase | Output | Status |
|---|---|---|
| P0 Foundations | Docs 02 to 06, logs, tool skeleton | **Done** (24 tests passing) |
| P1 Study instruments | `research/consent_and_instruments/` | **Remote usability test built into the site** (`remote_usability_test.md`); interview guides, consent sheet, think-aloud script next |
| P2 Secondary research | `research/secondary/` | Pending |
| P3 Primary data | `research/primary/` | Pending (owner) |
| P4 Prototypes | `phase1_deliverables/prototypes/` | **Demo page v0.2 built and tested (Apple-style, 4 scenes)** (`leakproof_demo/`); role workflows, paper pack, storyboards next |
| P4b Vertical-slice code | `tool/` (Shamir, sealing, copy order, log) | Pending, gated |
| P5 Analysis and requirements | `logs/findings.csv`, requirements, threat model v1 | Pending |
| P6 Compile and check | `phase1_deliverables/` | Pending |
| P7 Poster | `poster/` | Pending |

## Working rules

0. Principles: see `07_operating_principles.md` (simple, user-first, talk to users, make feedback nearly free).
1. Evidence rule: no requirement without a source (finding ID, citation, or labelled assumption).
2. Every choice has options, pros and cons, a justification, and what would change our mind (doc 02).
3. Tests are not optional. We write tests that try to break our own system and log every real bug.
4. Smallest thing that works. Minimum first, then target.

## Tool quick start

    cd tool
    make setup   # first time only
    make test
