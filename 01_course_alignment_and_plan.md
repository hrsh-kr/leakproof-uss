# Course Alignment and Working Plan

Companion to `00_problem_statement_and_scope.md`. Source of truth for requirements: `reference/Course Project - inclass.pdf`.
Status: DRAFT v1. Today is Thu Oct 1, 2026.

---

## 1. Decisions locked so far

| Item | Decision |
|---|---|
| Topic | Leak-resistant paper-based exam pipeline. **Approved by TA.** |
| Team | 4 people covering CS, hardware, design, cryptography |
| Dates | Phase I due **Sun Oct 4**. Poster submission **Tue Oct 6**. Poster session **Wed Oct 7** (per brief) |
| Exam coverage | Flexible: one engine, five **exam profiles** (section 5) |
| Phase II tool | Working prototype of the **entire pipeline**, with every step visible and explainable |

---

## 2. Brief clause to our artifact (traceability)

| Brief says | What it means for us | Our artifact |
|---|---|---|
| Phase I: user studies to evolve requirements, design and workflows | Studies come first and must visibly change the design | Study report with a "finding -> requirement -> design decision" table |
| Deliverable: User Study Evaluation reports | Primary and secondary research, with data | `phase1_deliverables/user_study_reports/` |
| Deliverable: Requirements | Usability **and** security requirements | `phase1_deliverables/requirements/` |
| Deliverable: Design Prototypes | Prototypes plus workflows | `phase1_deliverables/prototypes/` |
| "Collect relevant qualitative **and quantitative** data" | We need numbers (time on task, error counts, Likert, SUS) as well as quotes | Survey with scales, think-aloud timing, SUS on prototype |
| Methods: questionnaires, focus groups, contextual interviews, comparative analyses | Use at least one of each family | Section 4 |
| Poster 1 (Oct 7): compile usability studies and design themes | A synthesis, not a system description | Poster outline, section 6 |
| Phase II: executable plus user guide, **by Nov 17** | Peers test from Nov 18, 8 a.m. | Tool plus guide, release freeze Nov 16 |
| At least 50% original code | Libraries for crypto primitives are fine, protocol and application logic must be ours | Originality ledger (section 7) |
| VM or cloud simulators on request ("inform us earlier") | Decide early if we need a hosted server | Ask TAs by Oct 10 |
| Peers test us individually, 8+ projects each | Our tool must be testable by strangers without our help | Test accounts, quick-start, reset button |
| Test reports: usability description and **validated** vulnerabilities with screenshots | We must also do this well for others | Individual checklist, section 8 |
| Final video, 20 min, Part A (usability studies and design themes) | Needs evidence of how studies shaped the tool | Keep a "design decision log" from day one |
| Final video, Part B: security requirements, how addressed, classes of reported vulnerabilities, causes and lessons | We need a vulnerability tracker from the first bug | Tracker in section 7 |

---

## 3. Where the grade is, and what we do about it

Project is 35% of the course: **Development 20%** + **Usability and Security Testing 15%**. Weights within Development, as listed in the brief:

| Component | Weight (of Development) | What earns it |
|---|---|---|
| **Satisfaction of security requirements** | 25 | Explicit security requirements, each with a control, a test, and evidence. Threat model drives these |
| **Usability of the tool** | 25 | Evidence from rounds of user testing. Peer testers experience a clear, guided tool |
| Quality of developed software | 15 | Clean modules, tests, README, CI-style checks |
| Final group presentation | 15 | Both parts, with real data |
| Functional correctness | 10 | Whole pipeline works end to end |
| Presentations (posters) | 10 | Two posters |
| Peer evaluation (varying impact) | modifier | Contribution log per member |

Testing (15%) is **individual**:
- **Participation in other groups' usability studies: 5%, 1% per five studies.** That is **25 studies per person** for the full 5%. Four of us means about 100 sessions; trade participation with other groups from now.
- **Testing other projects: 10%, 0.5% per validated functional or security bug**, so about 20 bugs per person for full marks. We need a repeatable method (section 8).
- One best project gets a 5% bonus.

Implication: security requirements and usability are half the Development grade, so the tool should be **built as an evidence-producing system**, where each requirement can be demonstrated live.

---

## 4. Phase I: what we produce by Oct 4

Follows Lecture 3 (goals, protocol, pilot, conduct, analyse). Participant guidance: 4 to 5 per user class finds about 80% of issues (Nielsen). Assignment 1 precedent was seven participants.

### 4.1 User Study Evaluation Report

| Study | Method | Who | Target n | Gives us |
|---|---|---|---|---|
| S1 Candidate survey | Questionnaire, mixed scales plus open | Students who took JEE, NEET, CUET, state or police exams | 30+ | Trust, what they believe causes leaks, tolerance for delay, acceptance of in-centre printing, accessibility needs |
| S2 Setter and reviewer interviews | Semi-structured interview | Faculty or TAs who set exam papers | 5 | How questions are written, shared and stored today, what secure submission would cost them, fear of being blamed |
| S3 Centre staff and invigilator interviews | Contextual interview | Exam-cell staff, invigilators, faculty who run midsems | 4 to 5 | Real exam-day workflow, time pressure, printer and power failures, workarounds |
| S4 Contextual walk-through | Observation of how our institute prints and handles a paper | Exam cell | 1 or 2 sessions | Ground truth of the physical process |
| S5 Prototype think-aloud | Task-based, think-aloud, critical-incident log, SUS | Mix of S1 to S3 types | 5 per major role | Usability problems in our flows before building |
| S6 Comparative analysis | Feature and workflow comparison | NTA CBT and CPPT proposal, SAT-style multiple forms, TCS-style CBT, state practices, other countries | 5 to 6 systems | Gaps and design precedents |
| S7 Incident analysis | Secondary research | NEET 2024, NEET 2026, UP Police 2024, UGC-NET 2024, UPPSC RO/ARO 2024 and others | 5+ | Where in the pipeline each leak happened (feeds threat model) |
| S8 Literature | Secondary research | Secret sharing, traitor tracing and fingerprinting, item banking, usable security of key ceremonies | 8 to 10 papers | Technical grounding and citations |

Note on recruiting: we cannot reach real NTA officials in three days. Faculty, TAs and exam-cell staff are honest proxies; **say so in the report as a limitation** and plan a second round with better access before Poster 2.

Required content per study, from Lecture 3: goals, participants and recruitment, consent or study information sheet, tasks (scenario, goal, end criterion, time limit), data collected, pilot notes, critical incidents (problem statement, user goal, immediate intention, possible causes), consolidation and insights. Use the same report structure as the Assignment 1 report, with the Research folder holding raw instruments and data.

### 4.2 Requirements

- Functional, **usability** and **security** requirements, each with an ID, a priority, the **evidence source** (study finding ID), and an acceptance test.
- A STRIDE-style threat model, with the stakeholders from the scope doc.
- A requirements-to-design traceability table, which becomes the backbone of the final video's Part A and Part B.

### 4.3 Design Prototypes

- **Workflow diagrams** for each role: setter, reviewer, admin, centre staff, investigator.
- **Low-fidelity** screens (paper or Figma), tested in S5.
- **Medium-fidelity clickable prototype** for the key flows: setter submission, authority draw, centre print ceremony, leak trace view.
- **Design themes** extracted from the studies, to be reused on the poster.

---

## 5. Five exam profiles

One engine, five configurations. Chosen because they differ in scale, shifts, languages and how they leaked, so that the design is not tuned to a single exam. Candidate counts are from news reports and should be double-checked before they go on the poster.

| # | Profile | Why included | Stresses in design |
|---|---|---|---|
| 1 | **NEET-UG** (about 22 to 24 lakh) | Leaked 2024 and 2026, 2026 cancelled | Single large shift, thousands of centres, many languages |
| 2 | **UP Police Constable 2024** (about 48 lakh) | Largest candidate impact, cancelled | Multi-day, multi-shift recruitment, mass print volume |
| 3 | **UGC-NET 2024** (about 9 lakh) | Cancelled within 24 hours of the exam | Multi-subject, multi-shift, integrity signals after the exam |
| 4 | **UPPSC RO/ARO 2024** (state PSC style) | Leaked on social media, recurring pattern across state commissions | State-level, smaller infrastructure, degraded-mode needs |
| 5 | **SSC / Railway recruitment style** | Repeatedly leaked historically (RRB at least six times), moved toward CBT | Multi-shift normalisation, CBT versus paper handover |

Candidates to swap in if you prefer: CBSE board exams (2018 leak), BPSC TRE-3, JEE Main (CBT, large multi-shift).
**Profile file contents** (one JSON per profile): candidates, centres, shifts, sections, topic and difficulty blueprint, languages, marking scheme, print-window rules, fallback mode.

---

## 6. Poster 1 outline (submit Oct 6, present Oct 7)

Goal: a synthesis of usability studies and design themes, readable in 90 seconds.
1. Problem and why paper exams still leak (two numbers, one timeline).
2. Our idea in one diagram (pipeline).
3. How we studied it (study map with n per study).
4. What we heard: 4 to 6 findings with quotes and counts.
5. Design themes (3 to 5), each linked to a requirement and a prototype screen.
6. Prototype snapshots (before and after a test iteration).
7. Security requirements preview and threat model.
8. Next steps and limits.

Ask TAs today: poster size and format, print or digital, and whether the Oct 6 submission is a file or a physical copy.

---

## 7. Systems and processes that will keep us on track

### 7.1 Iteration loop (the engine of the course)

```
Study -> findings (F-ids) -> requirements (R-ids) -> design (D-ids) -> prototype/tool
   ^                                                                        |
   +------------- usability test, security test, peer bugs (B-ids) ----------+
```

- **Evidence log**: one sheet with Finding ID, source study, participant, quote or datum, tag, requirement it created.
- **Requirement register**: ID, text, type (usability, security, functional), priority, evidence, test, status.
- **Design decision log**: date, decision, alternatives, reason, linked findings. This directly answers "how did your usability studies help you better design your tool?"
- **Round plan**: Round 1 (Oct 2 to 3, low-fi), Round 2 (about Oct 25 to Nov 1, first working pipeline), Round 3 (about Nov 8 to 12, near-final), then peer testing Nov 18 to 25.

### 7.2 Security tracking from day one

- **Security requirements list** with a control, a test and evidence screenshot or log for each, so "satisfaction of security requirements" is demonstrable.
- **Vulnerability tracker** (Part B of the final video): ID, class (use CWE-style names), cause, who found it, fix, lesson. Add our own red-team findings from the start.
- **Red-team console in the tool**: scripted attacks (malicious setter, curious admin, centre insider, leak broker) so reviewers can see each control stopping or detecting each attack.

### 7.3 Engineering

- Git repository with branches, code review for every merge, tests in CI, a README and a test-account sheet.
- **Originality ledger**: a file listing every third-party library and what we wrote ourselves, to defend the 50% original requirement. Use vetted crypto libraries for primitives, and write the protocols, workflows and tracing logic ourselves.
- **Testability for strangers**: seeded demo data, one-click reset, guided "tour" for each role, clear user guide, and a bug-report form that asks for steps, expected and actual results, and a screenshot.
- Decide hosting early: local executable plus optional VM. Message the TAs by Oct 10.

### 7.4 Team and roles

| Role | Primary ownership | Also |
|---|---|---|
| Design lead | Study protocols, prototypes, poster, usability rounds, SUS analysis | Runs think-aloud sessions |
| Cryptography lead | Threshold key release, commit-reveal draw, signatures, audit log, fingerprinting scheme | Threat model and security requirements |
| CS lead | Backend, assembly engine, pool and blueprint logic, leak matcher and graph attribution, web UI | Test harness |
| Hardware lead | Centre kiosk and print workflow, custodian tokens, power/printer failure modes, tamper evidence, degraded mode | Contextual inquiry at the exam cell |

Everyone runs sessions and writes up findings. Keep a one-line-per-day contribution log for peer evaluation.

### 7.5 Pipeline stages the tool will demonstrate (each with an "inspector" view)

| Stage | What happens | What the inspector shows |
|---|---|---|
| S0 Setup | Key ceremony: authority root key split among custodians (threshold) | Shares, quorum, who attended |
| S1 Setter onboarding | Blueprint cells assigned; authenticated setter identities | Who got which cell (not content) |
| S2 Submission | Setter writes 5 questions, signed and encrypted on submit | Ciphertext, signature, receipt |
| S3 Pool review | Reviewers see limited subsets; duplicate and similarity check | Reviewer view limits, dedupe result |
| S4 Draw and assembly | Committed randomness, blueprint-constrained selection per shift and profile | Commitment hash, balance report, repetition check |
| S5 Sealed distribution | Per-centre encrypted bundles, time-bound | Bundle ciphertext, key not present |
| S6 Centre ceremony | Candidate check-in, quorum key release, print with per-copy fingerprint | Quorum status, print log, copy IDs |
| S7 Exam and post-exam | Audit log, retire used questions, normalisation inputs | Hash chain verification |
| S8 Leak response | Simulated leak corpus, matching, attribution graph with confidence | Candidate sources and evidence trail |

---

## 8. Our testing duties (individual)

Per person: 25 study participations (5%) and about 20 validated bugs (10%). Process:
- Keep a **participation tally** with the organizer group, date and evidence.
- For each assigned project use a fixed checklist: usability walkthrough (tasks, time, errors), then security tests (input validation, authentication and authorisation, session handling, secrets, logging, error messages, business-logic abuse).
- Every bug needs reproduction steps and screenshots. Validate once before reporting.

---

## 9. Calendar

| Date | Phase I and poster |
|---|---|
| **Thu Oct 1** | Lock plan and roles. Write instruments (survey, interview guide, consent sheet). Send survey tonight. Message TAs on poster format and hosting |
| **Fri Oct 2** | Pilot survey with 2 people, release. Interviews S2, S3 begin. Comparative and incident analysis. Low-fi flows drawn |
| **Sat Oct 3** | Finish interviews. Think-aloud S5. First pass of findings, requirement register, threat model |
| **Sun Oct 4** | Consolidate. Study report, requirements and prototypes finalised and **submitted** |
| Mon Oct 5 | Poster draft and review |
| **Tue Oct 6** | Poster submitted |
| **Wed Oct 7** | Poster session |

| Window | Phase II |
|---|---|
| Oct 8 to 20 | Architecture, crypto core, data model, profile files, UI skeleton |
| Oct 21 to Nov 1 | Pipeline end to end on one profile. Usability round 2 |
| Nov 2 to 12 | All five profiles, red-team console, leak simulator. Self-pentest. Round 3 |
| Nov 13 to 16 | Freeze, user guide, test accounts, release build |
| **Nov 17** | Source and executable submitted |
| Nov 18 to 25 | Peer testing of us, and our individual testing of 8 or more projects |
| Nov 26 | Poster 2 with live demo |
| Nov 28 | Individual test reports |
| Nov 29 | Final video, 20 minutes max |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Only three days for Phase I | Parallelise studies, accept proxy participants, document limits honestly |
| Scope creep from "entire pipeline" | Fixed stage list (7.5), one profile first, rest by configuration |
| Studies look decorative | Findings must change a requirement or design, record each change |
| Tool hard to test by strangers | Guided tours, reset, seeded data, guide, test accounts |
| Weak security evidence | Requirement-control-test-evidence table maintained weekly |
| Crawler legality and ethics | Simulated corpus only, public data, no profiling |
| Uneven contribution | Contribution log, rotate presenters |

---

## 11. Immediate questions

1. Poster size, format and Oct 6 submission method: should we ask the TA today?
2. Are you happy with the five profiles in section 5, or should CBSE boards or JEE Main replace one?
3. Who is on the team, by name, against the four roles in 7.4?
4. Can we use faculty or exam-cell staff at your institute for S2 to S4? If access is uncertain, start those requests tonight.
5. Which survey platform do you prefer (Google Forms is the default)?

## Sources used in this document

- Course brief: `reference/Course Project - inclass.pdf`; Lecture 3 (Usability Studies) and Lecture 1 (project structure)
- [Tribune: 2024 paper leaks and cancelled exams](https://www.tribuneindia.com/news/india/tough-year-for-aspirants-amid-series-of-paper-leaks-cancelled-exams/)
- [Careers360: 2024 year in review (NEET, UGC-NET, UPPSC, BPSC)](https://news.careers360.com/year-ender-2024-neet-cuet-ugc-net-uppsc-bpsc-paper-leaks-kolkata-rape-case-student-protests-exam-controversies-court-cases)
- [Wikipedia: List of paper leaks in India](https://en.wikipedia.org/wiki/List_of_paper_leaks_in_India) (secondary)

---

## 12. Alignment check against Lectures 1 to 5 (added Oct 1)

Full table is in the shared team doc ("How this lines up with class so far"). Changes made to this plan because of it:

1. **Studies come first.** Lecture 1 frames the project as "design, conduct, analyse a pilot user study" of a security application. Study depth must match system depth.
2. **Add mental-model elicitation** (Lecture 4) to S1 to S5: ask each role to draw how the paper travels and how a split key works. Use a bank-locker style analogy for 3-of-5.
3. **Use the Lecture 1 "human in the loop" six questions** as the analysis lens for each role's security task.
4. **Add a retention retest** (Lecture 1 metrics): repeat the ceremony task a day later in round 2.
5. **Group security requirements by the Lecture 2 properties** (confidentiality, integrity, availability, accountability, authentication; plus authentication, access control, auditing). Add **privacy requirements** (data minimisation, restricted suspect lists, retention limits, right of reply).
6. **Use Lecture 2 protocol ideas** for the centre release: mutual authentication, nonce, timestamp window, expiring tickets. Treat clock errors as a named failure.
7. **No trained ML** (Lecture 5 challenges: no labelled data, high cost of errors). Suspect scoring is a small hand-built probability model with human review.
8. **Questions for the TA**: separate proposal or ethics application (Lecture 1 mentions both, the 2026 brief does not)? Team of four OK (Lecture 1 says five)? Consent sheet enough for interviews?
