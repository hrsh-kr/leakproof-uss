# LeakProof: A Leak-Resistant Paper Examination System

**Usable Security and Privacy (USS), Monsoon 2026, IIIT-Delhi**
**Phase I Report: User Studies, Requirements and Prototypes**

---

## Contents

1. Problem Statement (What?)
2. Motivation (Why?)
3. Methodology (How?)
4. Findings
5. Design and Future Direction

---

## 1. Problem Statement (What?)

### 1.1 The Core Problem

Question paper leaks in India recur every year across national and state examinations. The most recent high-profile instance was **NEET-UG 2026**, which was cancelled nine days after being conducted, affecting approximately **22 lakh candidates**. This is not an isolated event: NEET-UG was also compromised in 2024 (limited to Patna and Hazaribagh, with at least 155 students directly benefiting), UGC-NET 2024 was cancelled within 24 hours after a paper appeared on Telegram, and UP Police Constable 2024 was cancelled impacting 48 lakh candidates.

The underlying pattern across all these cases is consistent: **leaks happen because people handle the paper**, not because cryptographic systems were broken. Every handover in the chain — from the question setters to the printing press to the courier to the exam centre strong room — is a point where a trusted insider can extract and sell the paper.

### 1.2 What is Missing Today

| Approach | Who can read the paper | Traceable if leaked? | Key gap |
|---|---|---|---|
| Printed paper chain (current) | Press staff, couriers, storeroom keepers | Weak | Too many handovers, each trusting a person |
| Computer-based test (CBT) | System administrators | Depends on logs | Needs labs and stable connectivity; multiple shifts create normalisation complexity |
| Print-at-centre proposal (2024 panel) | Server operators, centre staff | Not described | Never piloted; key control and copy tracing unspecified |
| Legal deterrence (2024 Act) | n/a | Only after the fact | Deters but does not prevent |

Existing approaches — stronger laws, better policing, and the proposed Computer-assisted Secure Pen-and-Paper Testing (CPPT) scheme — reduce risk but have not been shown to work operationally. None gives the authority a reliable way to determine **where a leak came from**.

### 1.3 Our Problem Statement

This project designs and evaluates a **leak-resistant workflow for paper-based examinations** that satisfies five goals:

1. **Prevent:** No single person or device can read a full paper before the exam window opens.
2. **Limit damage:** A compromise of one setter, reviewer, or centre exposes only a small fraction of the paper.
3. **Detect and trace:** If a leak does occur, the system helps narrow it down to a stage, a centre, or a small set of seats with stated confidence.
4. **Stay operable:** Centre staff, setters, reviewers and candidates can use it correctly under real exam-day pressure without improvising unsafe workarounds.
5. **Preserve fairness:** Every candidate takes the same questions for the same marks; the design does not sacrifice integrity for security.

The system rests on four mechanisms: (1) many setters contributing to a pool from which the paper is drawn late and randomly; (2) a split key requiring several custodians to approve before the paper can be opened; (3) a unique question order per printed copy so a leaked photo points to a seat; and (4) a tamper-evident activity log that makes quiet edits detectable.

---

## 2. Motivation (Why?)

### 2.1 Scale and Human Cost

The recurring cancellation of large examinations has concrete costs:
- **NEET-UG 2026**: ~22 lakh candidates, cancelled 12 May, re-exam set for 21 June. Student protests erupted across party lines nationwide.
- **NEET-UG 2024**: Supreme Court found the leak limited to Patna and Hazaribagh, at least 155 benefited. Extensive legal proceedings followed.
- **UP Police Constable 2024**: ~48 lakh candidates affected.
- **UGC-NET 2024**: ~9 lakh candidates; cancelled within 24 hours of the leaked paper appearing on Telegram.

A re-examination costs families money, time and psychological stability. Coaching teachers report students losing momentum. Parents describe years of preparation upended overnight.

### 2.2 Why Existing Responses Are Insufficient

**Legal deterrence alone does not prevent.** The 2024 Public Examinations (Prevention of Unfair Means) Act raises penalties to 3-5 years imprisonment and fines up to Rs 1 crore for service providers. Deterrence reduces the probability of a leak only if the probability of being caught is meaningful — but as public voices note, "the real criminals have neither been properly caught nor given strict punishment" (quoted in Newslaundry). Two convictions in 45 major leaks over 2002-2025 (secondary source) suggests detection remains the core unsolved problem.

**CBT is not universally deployable.** Multiple SSC and Railway candidates have reported system crashes, dead mice, and clueless invigilators. Connectivity is absent or unreliable in many centres. Multi-shift CBT exams require statistical normalisation, which itself becomes a source of fairness complaints.

**Print-at-centre (CPPT) is right in principle but untested.** The Radhakrishnan Committee (2024) proposed CPPT. Reporting says it was never piloted. A 2018 rollout of a similar scheme was reversed because centres could not follow the download-decrypt-print procedure on the first day; exams started late and the board returned to sealed printed papers. Without solved key control, copy tracing and a tested fallback procedure, the CPPT idea moves the leak point rather than eliminating it.

**The usability gap is the real barrier.** Even if the cryptography is sound, centre staff under time pressure with unfamiliar equipment will improvise — and improvised workarounds become the weak link. This is why our project frames itself as a *usable security* problem, not only a cryptographic one.

### 2.3 What People Affected Actually Say

We collected and coded 103 public voices from news reports and forums (60 candidates, 11 parents, 11 teachers, 4 exam-centre staff, and others) across NEET, UGC-NET, state recruitment exams, and JEE-related discussions:

| Theme | Share of 103 voices |
|---|---|
| Distrust of the conducting body | 20% |
| Cost and stress of re-exams | 14% |
| Different variants/shifts seen as unfair or corrupt | 10% |
| Fear that technology will fail | 9% |
| Papers sold on Telegram before the exam | 8% |
| Insiders and corruption; nobody held accountable | 7% |

Key insights from public voices:
- **Trust is about accountability, not mechanisms.** "It has completely broken our confidence" (a coaching student). People want to know who was responsible and what happened to them — this motivates the tamper-evident log and per-seat traceability.
- **Variants already worry people.** "Normalisation is not fair"; protesters want "every student must write the same paper, at the same time." A different question order per seat will be read as "different papers" unless it is clearly shown to be the same questions and marks.
- **Printing at centres has a real counter-example.** The 2018 reversal is a live warning; our fallback screen and 20-minute ceremony clock are designed around it.

---

## 3. Methodology (How?)

Our research proceeded in three distinct phases, each building on the previous. The methodology evolved in direct response to what we observed about participant behaviour — not just about the system being tested.

### 3.1 Phase Overview

| Phase | Method | Participants | Key instrument | What it gave us |
|---|---|---|---|---|
| **Phase 1: Initial Deployment** | Embedded form on prototype website | ~35 | 12-15 min interactive test with 4 tasks | Baseline comprehension, critical incidents; exposed problems with the instrument itself |
| **Phase 2: Pivoted Approach** | Picture-based simplified form + semi-structured interviews | ~25 interviews + ~120 form responses | 3-page, 10-question form with static images; 15-min interviews | Cleaner clarity ratings per idea; operational concerns from diverse roles |
| **Phase 3: Mid-fi Prototype Testing** | Think-aloud sessions on interactive prototype | ~12 | Revised clickable prototype; think-aloud protocol | Usability problems, interaction confusion, final requirement set |

### 3.2 Phase 1: Initial Form and Prototype (Version 1)

**What we built.** We first built a working web prototype with four interactive scenes demonstrating the core ideas: (1) a pool with many setters and a late random draw, (2) a split-key ceremony requiring 3 of 5 approvals, (3) per-seat question-order variation with a leaked photo tracer, and (4) a tamper-evident hash-chained activity log. The site ran on real encryption, real key splitting, and a real hash chain — all on simulated data.

**How we tested it.** We embedded a 12-15 minute review on the same site. Participants completed four interactive tasks, each followed by a comprehension check, an ease rating (1-7), and a "did you get stuck?" question. We also asked about trust, acceptance of print-at-centre, and collected free-text impressions.

**Participant profile.** The initial ~35 responses came primarily from classmates and peers who saw the link shared in class channels.

**What we observed about the instrument.** After seeing the first wave of responses, a critical pattern emerged:
- 13 of 35 participants spent under a minute on all four tasks combined.
- Many finished tasks in seconds without understanding them.
- In Task 2 (the split key), 20 people answered the comprehension check wrongly — but only 7 said they felt stuck. **15 wrong answers came from people who did not know they had misunderstood.**
- Free-text boxes produced filler responses: single repeated sentences, pasted-back task questions, vague one-liners.
- At least 5 participants explicitly said they did not understand the task at all.

**Lesson.** Finishing a task is not the same as understanding it. The interactive prototype was too complex to also serve as a clear explanation of the concept. Complexity in the instrument was masking comprehension failures rather than revealing them. We pivoted.

### 3.3 Phase 2: Picture-Based Form and Semi-Structured Interviews

**What changed and why.** We rebuilt the review instrument completely: a 3-page, 10-question form (~3 minutes) with **four static pictures and one plain sentence per idea**, replacing the interactive tasks. The goal was to isolate comprehension of the idea from ability to operate the interface.

**Form structure:**
- **Page 1 (About you):** Role selection and baseline trust rating (1-5)
- **Page 2 (Four ideas):** One static picture and one plain sentence for each design idea; one clarity rating each (Q3-Q6, scale 1-5)
- **Page 3 (Your view):** Comfort rating, trust-after rating, two short open questions

**Parallel interviews.** We conducted approximately 25 semi-structured interviews (15 minutes each, five core questions) with teachers, parents, students, exam-cell staff, and a security student. Interview questions probed:
1. How a paper reaches a candidate's desk in their experience
2. Explain the system back to us in your own words
3. A moment of doubt or a scenario that worried them
4. What would it take for them to trust such a system
5. The single change they would make

**Why this worked better.** Separating the evaluation of the concept from interaction with the prototype gave us much cleaner signal. Participants who had never touched the site could still rate how clearly a static picture explained an idea. Interviews with teachers and exam-cell staff surfaced concerns that the student-heavy initial sample had missed entirely — maths input requirements, realistic printing timelines, answer-key checking.

**Participant diversity in Phase 2.** To reach roles that classmates could not supply, we deliberately recruited:
- School students (Class 10, 11, 12; including a NEET repeater and a JEE topper)
- School teachers (maths, physics) and coaching faculty (chemistry, mock tests)
- Parents of exam aspirants
- University exam-cell staff

### 3.4 Phase 3: Mid-fi Prototype Think-Aloud Sessions

**What changed.** Based on clear insights from Phase 2 — particularly around language, fairness worries, and operational concerns at the centre — we made substantial revisions to the prototype (Version 2) and shifted to moderated think-aloud sessions.

**Key changes made before Phase 3:**
- Task cards that stay visible on screen while interacting (fixed scrolling-away issue on phones)
- Slider in Scene 1 starts at 0, with one headline answer
- Key holders in Scene 2 labelled by role (Registrar, Dean, Controller, Centre Head, Observer); participants try with 2 keys first, see the system stay locked, then complete the quorum
- "Fingerprint" replaced with "Seal" throughout; "Published" replaced with "Published outside the system"
- New screens added: Reviewer screen (sees limited subset for difficulty/answer-key check); Candidate screen (explains why question order differs); Centre Fallback screen (handles printer jam and unreachable key holders)
- Home page claim changed from "nobody can read the paper" to "no single person can read it"

**Think-aloud protocol.** Participants were given the revised prototype with no explanation of what each screen does. They were asked to think out loud as they explored, point out anything missing or unclear, and were not helped when stuck — instead asked: "what did you expect to happen?"

We ran approximately 12 think-aloud sessions, covering classmates, school students, teachers, parents, and others.

**What this phase gave us.** The think-aloud sessions revealed where interface assumptions failed for real users:
- The sticky task card helped laptop users but took a third of the screen on phones
- "Outside the system — outside where?" — the most common confusion on the log scene even after rewording
- School students and parents still could not follow the tamper-evident log concept without an analogy (a stamped-envelope visual was later added)

### 3.5 Secondary Research

Parallel to the primary studies, we conducted two streams of secondary research:

**Incident analysis.** We examined five documented leak cases (NEET-UG 2024, NEET-UG 2026, UP Police Constable 2024, UGC-NET 2024, UPPSC RO/ARO 2024), comparing where in the pipeline each leak was reported to have occurred. Every case involved people who handled the paper — not cryptographic failures.

**Public voices.** We coded 103 voices from news reports and forums, covering 60 candidates, 11 parents, 11 teachers, 4 exam-cell staff, and others. This gave us the distribution of public concerns and shaped the three design themes.

---

## 4. Findings

The following findings represent the consolidated output of all three phases of user study. Each finding is supported by evidence from the relevant study phase and concludes with the design implication it drove.

---

### F1. Baseline trust in paper examination security is low, but people believe a systemic solution would raise it

**Evidence.** Across all review waves, baseline trust ("How much do you trust that exam papers stay secret?") averaged 2.5-2.7 out of 5. When asked "A system like this would make me trust exam security more," the average was 3.9-4.0 out of 5. These are different questions, so the gap is a directional signal rather than a measured change.

Breakdown by group: Parents began lowest (1.7) and moved to 3.3 after seeing the system. School students went from 2.2 to 3.6. Exam-cell staff barely moved (3.0 to 3.4) — their doubt is about execution, not the idea.

**Implication.** People are willing to believe the approach has merit; what they doubt is whether it will work in practice. Every step of the interface must show what just happened in plain words.

---

### F2. Completing a task is not the same as understanding the concept — and most people do not know they misunderstood

**Evidence (Phase 1).** In Task 2 (the split key), 20 of 49 participants answered the comprehension check wrongly. Only 7 said they had been stuck — meaning **15 wrong answers came from people who thought they had understood**. Median task time was 17 seconds against a 2-minute guide.

**Evidence (Phase 3).** After switching to think-aloud, participants who said "okay I get it" often could not explain the concept back, and their commentary revealed active misunderstandings that self-report would have hidden.

**Implication.** Comprehension questions with a single correct answer, validated against self-reported confusion, are essential. Task completion rate and time on task are weak proxies for understanding.

---

### F3. The tamper-evident log is the least understood idea across all populations and all study phases

**Evidence.** Phase 1 (49 reviews): Task 4 (the log) was below 70% correct on the comprehension check (53%). Named hardest by 17 of 49 participants. Phase 2 version-2 check (12 reviews): Improved only modestly (53% to 58%). Half of participants said they got stuck; "outside where?" was the most common verbatim question. Phase 2 simplified form (121 responses): The log idea was rated clearly by only 44% of respondents (target: 70%). Live submissions rated it at 57%, still the weakest of the four ideas. Phase 3 think-alouds: An envelope-stamp analogy improved in-session follow-through but had not been re-tested at scale by Phase I close.

**Implication.** Plain-language wording helps but is not sufficient. A concrete everyday analogy and a picture of where the seal is published are required.

---

### F4. Printing at the centre and different question orders are accepted in principle but remain the two most doubted design choices

**Evidence.** Acceptance of print-at-centre was 3.9/5 before seeing the system and 3.9/5 after — it did not move. Different order per seat was the most doubted design choice: 12 of 31 voters said "not sure"; fairness averaged 3.6/5. Specific fairness worries: some orders might be harder (61%), answer keys could be wrong (55%), confusing for invigilators (39%). 5 of 8 interviewees raised fairness or anxiety about different orders. One coaching teacher: "My students will say, sir, mine is harder."

**Implication.** The candidate screen explaining why the order differs — and confirming it is the same questions and marks — is a hard requirement, not a nice-to-have. This concern must be addressed before the exam, not during it.

---

### F5. Operational concerns from teachers and exam-cell staff are fundamentally different from those raised by students

**Evidence (Phase 2 interviews).**
- Exam-cell assistant: "Ten minutes is not realistic. Printing 240 sheets on our printer takes 20 to 25 minutes if nothing jams." — Ceremony target changed from 10 to 20 minutes.
- Physics teacher: "A wrong key is as bad as a leak." — Led to the Reviewer screen.
- Maths teacher: "My questions have fractions, equations and diagrams. This will not work for us." — Requirement R-F04 raised; deferred to Phase II.
- Coaching teacher: "What stops a centre head photographing the paper after it is printed?" — Acknowledged as a stated design limit.
- 4 of 8 interviewees raised printer, power, or internet failure as a primary concern.

**Implication.** Students systematically underweight operational concerns that teachers and exam-cell staff raise immediately. Reaching these groups earlier would have changed prototype priorities sooner.

---

### F6. Language and wording — not the underlying ideas — were the primary usability problem

**Evidence (Phase 1 free text, coded themes).** Wording and jargon: 24% of reviewers. Unclear tasks: 18%. Fairness of different order: 14%. Printer/power failure: 12%. Who the key holders are: 10%.

Specific incidents:
- "Fingerprint? Like thumb? ... it said caught but I don't know why." (School student)
- "Published where?" (College peer)
- "Nobody can read the paper" — flagged as false by a security student. Corrected to "no single person can read it."
- "I did not know what it wanted me to do. What was the task?" (Multiple participants)

**Implication.** Every jargon term in the interface needs a plain-language alternative tested with non-technical participants. Claims must be only as strong as the system.

---

### F7. The two core ideas — many setters with a late draw, and the split key — are understood by most people

**Evidence (Phase 2 simplified form, 121 responses).** Many writers and a late draw: 78% rated it clearly (4 or 5 out of 5); average 4.1/5. The locked paper with several key holders: 84% rated it clearly; average 4.1/5. Every copy is different: 66% rated it clearly (just below our 70% target). A log nobody can edit: 44% rated it clearly.

**Implication.** The foundational concepts are accessible. The communication gap is concentrated in per-seat copy variation (66%) and especially the tamper-evident log (44%).

---

### F8. Small screens are a real constraint; 51% of Phase 1 participants used phones

**Evidence.** In the Phase 1 review (49 responses), 25 used a phone and 24 used a laptop. Phone-specific incidents included task text scrolling off screen while using the interactive slider; sticky task card occupying a third of the screen; small interactive controls with wrapped text.

**Implication.** Responsive layout, minimal page content per screen, and a sticky but collapsible task card are minimum requirements for both the review instrument and the prototype.

---

### F9. Public trust is about accountability, not only prevention — the log and traceability are the most socially valued features

**Evidence (secondary research, 103 voices).** Distrust of the conducting body was the top theme (20%) — not worry about the mechanism. "The tamper-evident log would deter local tampering." (r/AskIndia). Design votes in Phase 1: tamper-evident log (30 of 31 agree) and 3-of-5 split key (26 of 31) were the most accepted features — higher than print-at-centre acceptance.

**Implication.** The features that are hardest to communicate are also the features people most want once they understand them. Communication investment in the log and per-seat tracing pays off.

---

### F10. Comfort with the whole concept is moderate; 50% of respondents are neutral or uneasy

**Evidence (Phase 2 simplified form).** Comfort with the overall concept averaged 3.5/5. Only 50% rated comfort 4 or 5. Among the 7 live submissions, comfort was 3.9/5 and 71% were comfortable.

**Implication.** Reassurance about operational failure modes and fairness of per-seat variation will not fully resolve until a real pilot is run.

---

### 4.1 Evidence-to-Requirements Summary

| Finding | Requirement(s) produced |
|---|---|
| F1 (trust is directional) | Every step shows what just happened in plain words; inspector panel at each stage |
| F2 (finishing does not equal understanding) | R-U10: each step has a goal with one checkable outcome; "did you get stuck?" validated against the answer |
| F3 (log least understood) | R-U12: each idea needs a picture, a plain sentence, and an everyday analogy |
| F4 (order worries) | R-U08: candidates told the order differs and why, before the exam; R-U11: show same questions, same marks |
| F5 (operational concerns) | R-U02: target ceremony time 20 min; R-F05: reviewer screen; R-S17: fallback with same controls |
| F6 (language) | R-U10: plain words throughout; R-S15: precise claims only |
| F8 (phone layout) | R-U13: phone layout and basic accessibility tested |
| F9 (accountability) | R-S14: every action attributable to a named role; "evidence not proof" language throughout |

---

## 5. Design and Future Direction

### 5.1 What the Evidence Told Us to Build

The three phases of study produced design decisions directly traceable to evidence.

#### 5.1.1 The Four Core Mechanisms: Unchanged in Direction, Refined in Presentation

The four ideas that emerged from secondary research — many setters with a late draw; a split key (3 of 5 custodians must approve); per-seat question order variation; and a tamper-evident hash-chained log — remained the right design themes throughout all phases. No study reversed a core mechanism. What studies changed was how each is communicated, who performs each step, and what the fallback is when a step fails.

#### 5.1.2 New Screens Added Based on Study Findings

| Screen | Finding that produced it |
|---|---|
| **Reviewer screen** — teacher sees 3 assigned questions, rates difficulty, flags wrong answer keys; author hidden | F5: "A wrong key is as bad as a leak" (physics teacher); 2 of 8 interviewees |
| **Candidate screen** — explains different order, shows copy ID, compares with neighbour's sheet | F4: 61% worried about fairness of different order; 5 of 8 interviewees raised it |
| **Centre fallback screen** — key holder unreachable goes to reserve key holder with same signed approval; printer jams reprints only missing copies with same IDs; 20-minute ceremony clock | F5: "Ten minutes is not realistic"; 4 of 8 interviewees raised printer/power failure |

#### 5.1.3 Language and Claim Changes

| Before | After | Finding |
|---|---|---|
| "Nobody can read the paper" | "No single person can read it" | F6: security reviewer found the original claim false at the sealing step |
| "Fingerprint" | "Seal" | F6: "Fingerprint? Like thumb?" (school student) |
| "Published" | "Published outside the system" | F6: "Published where?" (college peer) |
| Slider started at the answer | Slider starts at 0, says "move the slider" | F2: tasks were being completed without being understood |
| Five unlabelled keys | Keys labelled by role (Registrar, Dean, Controller, Centre Head, Observer) | F5: "I felt like I was playing with five random buttons" |

### 5.2 Our Final Design: A Consolidated View

The pipeline, from writing to tracing:

```
Setters (many, each assigned a few questions)
    -> signed, encrypted submission
Pool (with reviewer checks on limited subsets)
    -> committed random draw, blueprint-balanced
Sealed paper bundles (threshold-keyed, one per centre and shift)
    -> distributed to centres before the exam
Centre ceremony
    -> candidates seated, seating report signed
    -> quorum of key holders approves (3 of 5, or reserve fallback)
    -> paper printed with per-copy fingerprint (unique question order per seat)
    -> 20-minute target; printer fallback logged and controlled
Audit log (hash-chained, signed, latest seal published outside the system)
If a leak appears:
    -> matcher compares leaked text or photo against pool and copy orders
    -> suspect list with stated confidence and reasons; human review required
```

**Security properties achieved:**
- Confidentiality: encrypted at rest, split key — no single person can read the paper
- Integrity: per-submission signatures, hash-chained log
- Availability: defined fallback path with the same controls as the normal path
- Accountability: every action attributable to a named role, per-seat traceability
- Authentication: role-scoped permissions; custodians sign approvals with key files

**Stated design limits (honest, not hidden):**
- We cannot prevent a person photographing a printed copy; per-seat IDs make it traceable
- A dishonest quorum of 3 could open the paper; we raise this cost and log everything they do
- The sealing machine is trusted for a short, witnessed, logged ceremony
- The in-exam-hall leak is a known gap; tracing after the fact is the best available control

### 5.3 Evidenced Requirements

By the end of Phase I, the following requirements are supported by multiple study findings:

| Requirement | Evidence |
|---|---|
| Every step has a goal with one checkable outcome; plain language throughout | Phase 1: comprehension 53-69%; F2; F6 |
| Each idea has one picture, one plain sentence, and an everyday analogy | Phase 2 form: log only 44% clear; F3 |
| Candidates are told the order differs and why, before the exam | F4: 61% of reviewers, 5 of 8 interviewees |
| Show "same questions, same marks" explicitly | F4: public voices, reviewer comments |
| Phone layout and basic accessibility | F8: 51% on phones |
| Precise claims only ("no single person", not "nobody") | F6: caught by security reviewer |
| Fallback keeps the same controls as the normal path | F5: teachers, interviews, 2018 rollout reversal |
| Every action attributable to a named role; "evidence, not proof" language | F9: distrust theme 20% of 103 voices |

### 5.4 What Remains Open: Phase II Agenda

**5.4.1 The Log Explanation Needs a Re-test**

The tamper-evident log concept improved with the envelope-stamp analogy and a notice-board picture, but was not re-tested at scale before Phase I closed. Immediate action: test the revised wording and picture with at least 5 new participants including parents and school students before Phase II development begins.

**5.4.2 Richer Question Input for Setters**

Two of eight interviewees and multiple free-text responses raised that maths questions need fractions, diagrams and equations — plain text input is not viable for real exam setters. This is the first Phase II feature: a question input interface supporting LaTeX, image upload, and Hindi rendering.

**5.4.3 Hindi and Large-Text Version**

Raised by parents and one teacher. Needs translation, rendering testing, and accessibility testing with those readers. A stated Phase II requirement.

**5.4.4 Operational Pilot Evidence**

Two interviewees stated they will trust the system only after it has been used in a real exam. The Phase II target is to run a simulated ceremony with real printers and real key holders at our institution's exam cell, and document what breaks.

**5.4.5 In-Exam-Hall Leaks**

The exam-cell respondent in Phase 2 had the lowest baseline trust (1) and wrote: "My worry is about exam paper getting out of exam hall." Per-seat copy IDs make a photographed copy traceable, but cannot prevent the photograph. This is a stated limit that Phase II cannot remove.

**5.4.6 Phase II Prototype Build Order**

Phase I produced a clickable simulation. The full working pipeline is the Phase II deliverable, prioritised as:
1. Setter submission with signed, encrypted upload
2. Split-key ceremony (3-of-5) including the reserve-key fallback
3. Blueprint-constrained random draw with balance report
4. Per-copy order generation and the centre print client (simulated)
5. Hash-chained audit log with public seal verification
6. Leak matcher on a simulated corpus

### 5.5 Honest Reflection: What We Would Do Differently

1. **Start with the short, picture-based review.** The Phase 1 interactive test taught us more about flaws in the test instrument than about user understanding. The short form should have been the first instrument.
2. **Reach teachers and exam-cell staff in week one.** Operational concerns emerged only in Phase 2 interviews. Reaching these stakeholders first would have changed prototype priorities sooner.
3. **Measure understanding, not completion.** Task completion rates and time on task are weak signals. A comprehension question per idea, validated against self-reported stuck moments, is far more informative.
4. **Make claims only as strong as the system.** "Nobody can read the paper" was our own overclaim. Participants caught it; it damaged credibility in free-text responses.

---

## Appendix A: Instruments Used

**Phase 1 Review (12-15 minutes).** Consent; email (stored separately); role, exams taken, device; prior beliefs (where leaks happen, baseline trust, acceptance of print-at-centre, own account of how a paper travels); four interactive tasks each with comprehension check, ease rating (1-7), "did you get stuck?" and incident description; overall impression (explain-it-back, UMUX-Lite, trust-after, hardest task, what to change first); optional design-choice votes.

**Phase 2 Simplified Form (3-4 minutes).** Consent and email (not analysed); Q1 role; Q2 baseline trust; Q3-Q6 clarity of each idea (1-5), each with a static picture and one plain sentence; Q7 comfort with the whole concept; Q8 trust-after; Q9 what confused or worried you most (free text); Q10 the one thing you would change (free text).

**Phase 2 Interview Guide (15 minutes).** Five questions: (1) How does a paper reach a candidate in your experience? (2) Explain this system back to us in your own words. (3) Tell us about a moment of doubt in what you saw. (4) What would it take for you to trust it? (5) The one thing you would change.

**Phase 3 Think-Aloud Sessions.** Revised prototype (Version 2). Participants given no explanation of what each screen does; asked to think out loud, point out anything unclear, and not be helped when stuck. Sessions logged; critical incidents coded.

---

## Appendix B: Participant Breakdown

| Study | Group | n |
|---|---|---|
| Phase 1 review | IIIT-Delhi classmates | 23 |
| Phase 1 review | Other college students | 7 |
| Phase 1 review | School students (Class 10, 11, 12) | 5 |
| Phase 1 review | School and coaching teachers | 4 |
| Phase 1 review | Parents of aspirants | 3 |
| Phase 1 review | Others | 7 |
| Phase 2 interviews | Teachers, parents, student, exam-cell staff, security student | ~25 total |
| Phase 2 simplified form | IIIT-Delhi students (outside course) and others | ~120 |
| Phase 3 think-aloud | Mixed (classmates, school students, teachers, parents) | ~12 |
| Secondary research | News reports and forum voices (candidates, parents, teachers, staff) | 103 coded voices |

---

## Appendix C: Key Sources

- NEET-UG 2026 cancellation: The Print, Newslaundry, PrintWeek India
- NEET-UG 2024 Supreme Court judgment: Outlook, WION
- Radhakrishnan Committee recommendations (2024): Careers360, Vajiram
- Public Examinations (Prevention of Unfair Means) Act, 2024: PRS India
- Telegram and exam-leak channels: BleepingComputer
- UGC-NET and UPPSC leaks: Careers360, The Tribune
- Public voices: Newslaundry, EastMojo, The Wire, ThePrint, Careers360, The Federal, Siasat, Republic World; r/JEENEETards, r/Indian_Academia, r/AskIndia, r/india, r/UGCNETEnglish, r/CUETards
- Course material: Lectures 1-4 (Usable Security and Privacy, Monsoon 2026, IIIT-Delhi)
