# Leak-Resistant Examination Paper System (working title)

Usable Security and Privacy, Course Project, Monsoon 2026
Status: DRAFT v1 for team review. Step 1 of Phase I (problem statement and scope).

---

## Part A. Audit of the original idea

### A1. What is already strong

1. **The pool idea limits what any one person knows.** If 1,000 setters each write 5 questions and a paper is drawn late and at random, a single leaking setter exposes a tiny slice of a paper. Under uniform random selection, compromising a fraction *p* of the pool exposes on average a fraction *p* of any paper. One setter out of 1,000 is 0.1%. Leaking questions before the draw has little value to a buyer.
2. **Late, local printing shrinks the exposure window.** Removing physical transport of printed papers attacks the stage that the Radhakrishnan panel called the most exploitable one.
3. **The leak is treated as a graph and tracing problem, not only a prevention problem.** Detection and attribution are what make deterrence credible.
4. **The goal is stated honestly as risk reduction.** The statement already admits electricity, printer and connectivity limits.

### A2. Gaps and risks we must handle (ranked by how much they affect the project)

| # | Issue | Why it matters | What we do about it |
|---|---|---|---|
| 1 | **Print-at-centre is not new.** The Radhakrishnan committee (Oct 2024) proposed "Computer-assisted Secure Pen-and-Paper Testing (CPPT)": encrypted papers sent to secure centre servers and printed shortly before the exam. Per reporting, it was never piloted and NEET-UG 2026 was cancelled after a leak. | A reviewer will ask what is new. | Position the project as *making CPPT work in practice*: add distributed authorship, leak attribution, and usability of the ceremony for non-technical staff. Cite CPPT as prior art, do not hide it. |
| 2 | **The pool does not protect the assembler.** Whoever assembles, vets or prints the final paper sees all of it. Setters are only one of several insider classes. | The 1,000-setter design secures the wrong end of the pipeline if assembly is a human step. | Assembly is automated from a committed blueprint. No human sees the full paper before the centre print. Human review is done per question on the pool, with each reviewer seeing a limited subset. |
| 3 | **Vetting vs secrecy tension.** Someone must check the final paper for errors, ambiguity and wrong keys. | Skipping vetting causes bad papers, court cases and re-exams. Doing it creates a leak point. | Review at pool level (many reviewers, each sees few items); constrained assembly (no near-duplicates, balanced topics) so the final paper needs no human read. |
| 4 | **Attribution is weaker than the statement suggests.** A leaked question links to its *setter* only if the leak happened before the draw. After the draw, many parties had access. | Falsely accusing a setter is a serious harm. | Treat attribution as evidence with confidence, not proof. Add **per-copy fingerprinting** (option order, numeric variants, invisible marks, per-seat set codes) so a leaked photo points to a centre and seat. The panel also suggested multiple sets with long codes. |
| 5 | **Where real leaks happened.** NEET-UG 2024: the Supreme Court found the leak limited to Patna and Hazaribagh, tied to a centre where the strong-room back door was reportedly left open. | Real leaks were physical and procedural, human error and corruption, not cryptography failures. | The threat model must include the centre superintendent and in-exam leaks (photographing the paper after printing), not only transport. |
| 6 | **Availability.** Printers jam, power fails, internet is absent, centres run to the thousands. | The fallback path becomes the attack path ("the printer broke, so use the backup"). | Design the failure modes first. Every fallback must carry the same controls (threshold keys, logging) as the normal path. Say plainly that some centres will need a degraded mode. |
| 7 | **Difficulty and normalisation.** New questions have no calibration data. | Different shifts will differ in difficulty. NTA uses equi-percentile normalisation across shifts. | Out of scope to invent psychometrics. We model blueprint balancing and show normalisation as a downstream consumer. Treat calibration as a stated limitation. |
| 8 | **"Blockchain and crypto everywhere" can become security theatre.** | The Quiz/Lecture lens is trade-offs and justified controls. | Use each primitive only for a named property: threshold secret sharing (no single key holder), hash-chained signed audit log (integrity and non-repudiation), timed key release (nothing readable before the window), per-copy watermark (traceability). A public blockchain is optional and must be justified, a permissioned append-only log is enough for most needs. |
| 9 | **Crawling Telegram and Reddit.** Private channels are unreachable, and collecting personal data has legal and ethical limits. | Feasibility and ethics. | Public sources only, matching on question content (fuzzy text match, OCR), no profiling of individuals. Demonstrate on a **simulated** leak corpus. Document ethics in the report. |
| 10 | **Multi-language and accessibility.** Papers are translated into many languages and need large print/Braille/scribe variants. | Each variant is more people with access and more material to leak. | Keep as a stated requirement and a study question, not a feature to build in Phase II. |
| 11 | **The course grades usable security, not only security.** | Phase I deliverables are user-study reports, requirements and prototypes. | Frame the human problem: can setters, reviewers, centre staff and candidates actually operate and trust this? (Section B3.) |
| 12 | **Topic approval.** The brief's list is password managers, secure storage, authentication, calendar agent, permission managers, or "any domain you know well (need prior approval from TAs)". | Risk of rework if not approved. | **Get TA approval today.** Best fit pitch: secure distribution/storage of sensitive documents plus authentication and access control under time pressure. |
| 13 | **Unsourced claims in the statement.** "Millions suffer", the suicide reference, and "promised but not delivered". | Poster and report need citations. | Use the sourced facts in B1. Drop or cite the suicide statement carefully. It is sensitive, and we should cite a credible source or leave it out. |

### A3. Facts we can safely cite (verified from search, links at the end)

- NEET-UG 2026 was held on May 3 and cancelled on May 12 after leak allegations. A re-exam was set for June 21, with student protests across party lines. About 22 lakh candidates were affected.
- The Radhakrishnan committee made 101 recommendations, including CPPT. Reporting says CPPT was never piloted, and the secure-centre programme was not started.
- NEET-UG 2024: the Supreme Court held no systemic breach, leak limited to Patna and Hazaribagh, at least 155 students directly benefited.
- Public Examinations (Prevention of Unfair Means) Act, 2024: 3 to 5 years imprisonment and a fine up to Rs 10 lakh for individuals, up to Rs 1 crore for service providers.
- Reported tally: 41 to 48 leaks across 15 to 16 states in 2019 to 2024, with 1.4 crore plus candidates affected. Only two convictions in 45 major leaks over 2002 to 2025 (secondary source, cross-check before the poster).

---

## Part B. Formal problem statement and scope

### B1. Problem statement

Question paper leaks in India recur every year across national and state examinations, including NEET-UG, which was cancelled in 2026 after a leak affecting about 22 lakh candidates. Computer-based testing reduces some leak routes, but many large exams are still taken on paper, and for these the printed paper must be written, stored, moved and handled by many people before the exam. Each handover is a point where a trusted insider can leak the paper. Existing responses (stronger laws, better policing, and the proposed CPPT scheme of printing at the centre) reduce risk but have not been shown to work operationally, and none gives the authority a reliable way to find where a leak came from.

This project designs and prototypes a leak-resistant workflow for paper-based examinations. The paper is built late and automatically from a large pool of questions contributed by many setters. It stays encrypted until a short window before the exam. It is printed at the exam centre only after candidates are seated. Every copy carries a fingerprint, and every action is logged. If a leak does occur, the system helps trace it to a stage, a centre or a small set of people, with stated confidence.

### B2. Goals

1. **Prevent**: no single person or device can read a full paper before the exam window.
2. **Limit damage**: a compromise of one setter, reviewer or centre exposes only a small fraction of the paper.
3. **Detect and trace**: find leaked questions in public sources and attribute them to a stage with quantified confidence.
4. **Stay operable**: setters, reviewers, centre staff and the authority can use it correctly under real exam-day pressure without inventing unsafe workarounds.
5. **Preserve fairness and integrity**: balanced topic and difficulty, minimal repetition, confidentiality, integrity, authentication and non-repudiation of every step.

### B3. Stakeholders (our "users" for the user studies)

| Stakeholder | Role | Main concern |
|---|---|---|
| Question setters | Write 5 blueprint-assigned questions | Easy secure submission, fair credit, not being blamed wrongly |
| Reviewers / moderators | Check pool questions | Seeing enough to review without holding the full paper |
| Exam authority admin | Defines blueprint, runs draw, handles incidents | Control, accountability, audit |
| Centre superintendent and invigilators | Run the centre, operate print ceremony | Time pressure, printer/power failure, clear steps |
| Candidates | Take the exam | Trust, fairness, no delay, accessibility |
| Investigators / public | Look into leaks | Evidence quality |

### B4. Threat model (summary)

Attackers: a malicious setter or reviewer; a colluding group; an admin or developer insider; a centre superintendent or invigilator; an outsider who breaks into a server or printer; a candidate or paid helper who photographs the paper in the exam; leak brokers selling on Telegram and similar channels.

Assumptions: the exam authority root keys are generated and held under threshold control; there is some way to authenticate candidates at the centre (for example biometrics, already adopted by NTA); a majority of key custodians are honest.

Not assumed: reliable electricity or internet at every centre; trustworthy individuals.

### B5. Scope

**In scope**
- Question collection, blueprint-driven assignment, pool management
- Automated, committed, randomised paper assembly and per-shift balancing
- Encrypted storage and threshold-controlled timed release
- Centre-side secure printing workflow, with a defined degraded mode
- Per-copy fingerprinting and a hash-chained signed audit log
- Leak detection on a simulated public corpus, and graph-based attribution
- Usability and trust studies of all human roles
- Security requirements and a threat model (graded at 25% of development)

**Out of scope (stated as limits)**
- Candidate impersonation and remote-solver gangs (assume biometrics exist)
- Psychometric calibration research (IRT); we only consume normalisation
- Real crawling of private channels; real access to NTA systems or real exam content
- Physical security of buildings, courier logistics beyond stating assumptions
- Full multi-language and Braille production (kept as requirements)

### B6. What "done" looks like for the course

| Milestone | Output |
|---|---|
| **Phase I, Oct 4** | User Study Evaluation report (primary and secondary research); Requirements (usability and security); Design prototypes (low-fi, workflow, clickable) |
| **Poster 1, Oct 6/7** | One poster compiling usability studies and design themes |
| Phase II, Nov 17 | Executable and user guide; at least 50% original code |
| Poster 2 and test reports | Live demo of usability and security features; peer testing of our tool |

### B7. Proposed high-level approach

```
Setters (1000 x 5 Qs)  ->  Pool + reviewer checks  ->  Committed random draw per shift
        |                                                    |
   signed, encrypted submission                    sealed (threshold-keyed) paper bundles
                                                             |
                      Centre: seats confirmed -> quorum releases key -> print with per-copy fingerprint
                                                             |
                    Audit log (hash-chained, signed) <-- every step
                                                             |
   Public sources -> crawler (simulated) -> match leaked text -> graph attribution
```

### B8. Research plan for Phase I (draft, for next step)

- **Primary**: (a) survey of candidates who took JEE/NEET/CUET/state exams (trust, experience, what they believe causes leaks); (b) interviews with faculty who set exam papers and with exam-cell or invigilation staff (proxy for setters and centre staff); (c) a contextual walk-through of how our own institute runs and prints a midsem; (d) think-aloud sessions on the low-fi prototype.
- **Secondary**: incident analysis (NEET 2024, NEET 2026, state leaks); comparative analysis (NTA CBT/CPPT proposal, TCS-style CBT, SAT-style multiple forms, other countries); literature on secret sharing, traitor tracing and item banking.
- The protocol follows Lecture 3: goals, participants (5 per user class is the Nielsen guideline), consent sheet, tasks with scenario and end criterion, pilot, critical-incident reporting.

---

## Open questions for the team

1. Has the topic been cleared with a TA? If not, who asks today?
2. Team size and roles (so we split studies: candidates, faculty, staff, prototype, requirements).
3. Is Oct 6 or Oct 7 the poster date for your section?
4. Which exam do we anchor on for the blueprint: JEE-style (multi-shift) or NEET-style (single shift)? I suggest JEE-style, because shifts and normalisation make the pool idea matter.
5. Phase II tool: web app prototype acceptable? Suggested modules: setter portal, assembly engine, threshold key release, centre print client (simulated), audit log, leak matcher.

## Sources

- [SC: NEET-UG 2024 leak limited to Patna and Hazaribagh (Outlook)](https://www.outlookindia.com/national/neet-ug-2024-paper-leak-supreme-court-patna-hazaribag-nta-centre)
- [WION on the same judgment](https://www.wionews.com/india-news/india-neet-ug-2024-paper-leak-was-limited-to-patna-and-hazaribagh-rules-supreme-court-746481)
- [NEET-UG 2026 cancellation and protests (The Print)](https://theprint.in/india/student-organisations-intensify-protest-over-alleged-neet-ug-paper-leak-after-exam-cancellation/2929464/)
- [Newslaundry on unimplemented Radhakrishnan recommendations](https://www.newslaundry.com/2026/05/14/behind-neets-cancelled-exam-are-22-lakh-students-and-a-report-barely-anyone-read)
- [Careers360: panel on secure centres, biometrics, CPPT](https://news.careers360.com/nta-exams-overhaul-neet-ug-2025-cuet-jee-main-digi-exam-centre-question-papers-national-testing-agency-panel-report-education-news)
- [Vajiram: Radhakrishnan Committee blueprint](https://vajiramandravi.com/current-affairs/k-radhakrishnan-committee-blueprint-for-secure-and-transparent-exam-reform-in-india/)
- [PRS: Public Examinations (Prevention of Unfair Means) Bill, 2024](https://prsindia.org/billtrack/the-public-examinations-prevention-of-unfair-means-bill-2024)
- [Wikipedia: List of paper leaks in India](https://en.wikipedia.org/wiki/List_of_paper_leaks_in_India) (secondary; verify numbers before citing on the poster)
- [Careers360: JEE Main 2026 normalisation explained](https://news.careers360.com/jee-main-2026-normalisation-explained-process-formula-faqs-result-cut-off-topper-list-marks-vs-percentile/amp)
