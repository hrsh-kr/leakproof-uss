# Council brief: how do we build LeakProof Phase II in the time we have?

Read this fully. It is the same brief every council member gets. Today is **12 Nov 2026**.

## The product (one paragraph)
LeakProof stops exam-paper leaks and cheating for a **college written exam (MCQ)**. Many setters each write one question per topic; a computer draws the paper late and at random; the paper is AES-256-GCM encrypted and the key is Shamir-split 3-of-5 between officials; at the centre a quorum + seating report + time window unlock it and each seat gets its own copy (own question/option order, copy ID with check digit) so a leaked photo points to a seat; everything goes in a hash-chained log. Core idea: **stop cheating and leaks in our niche: exams.**

## Hard constraints (from the course guideline PDF, `/Users/hrshkr/Downloads/sem8/uss/Course Project - inclass.pdf`)
- **Phase II = development of the tool. Final source code due 17 Nov 2026, midnight (5 days).** At least 50% of the source must be original. Deliverables: **executable for testing + user guide.**
- **The executable must be posted on a file server by the deadline.** Cloud simulators can be provided on the course VMs *if we tell the TAs early*. **We must build and run this on a VM.**
- **18 Nov 8am**: every group's executable + guide is posted. Each student then tests >= 8 other groups' projects (18 Nov noon to 25 Nov midnight), **individually**, and reports usability features and **vulnerabilities with proof (screenshots)**. Our classmates will attack our system.
- **26 Nov**: poster session 2: live demonstration of usability and security features. **29 Nov**: <=20 min recorded video. Part A: how studies shaped the tool, design themes. Part B: security requirements identified, how addressed, **classes of vulnerabilities students reported, causes, lessons learnt.**
- **Grading of the development part:** usability of the tool 25%, security requirements satisfaction 25%, quality of software 15%, functional correctness 10%, presentations 25%. Separately 10% of each student is for finding bugs in *others'* projects.

## What we already have (verify in the files, do not assume)
- Phase I submission (done): `/Users/hrshkr/Downloads/sem8/uss/Phase_1_submission/` (report PDF 32 pp, poster, prototype guidebook, consent forms). Report text extracted at `/private/tmp/claude-501/-Users-hrshkr-Downloads-sem8-uss/report.txt`: findings F1-F11, five design themes T1-T5, nine-stage service design (section 5.4), 52-requirement register (Appendix C), future-direction list (5.6).
- Key Phase I findings: 25 interviewees all followed the 8-step flow but found the **number of steps heavy at first**; students worry about **waiting in the hall while the paper prints** (decision: print on the day *before* entry, sealed, transferred under surveillance, still undesigned); fairness of different-order papers (44% worry some orders are harder, 49% fear wrong answer keys); the after-print custody window; fallback when a key holder is absent or a printer fails. Sample was mostly classmates; teachers/exam staff not reached.
- Code today: `/Users/hrshkr/Downloads/sem8/uss/project/site/` is a **Node/JS static site + Vercel functions** with tested real code: `src/js/logic.mjs` (Shamir over GF(2^127-1) prime field, AES-GCM via WebCrypto, SHA-256 hash chain, seeded shuffle, per-seat copies, copy-ID check digit, answer key per copy), `src/js/pipeline-core.mjs` (draw, assemble, encrypt, split, distribute, unlock, print), `src/js/exam-bank.mjs` (100 sample questions), 170 passing node tests. **No real users, no database of exam data, no auth, no roles** in that code.
- `/Users/hrshkr/Downloads/sem8/uss/project/tool/` is the earlier planned **Python/FastAPI/SQLite** tool: it is essentially **empty** (a permission-matrix file and 24 trivial tests).
- Plan docs: `project/04_tool_spec_and_test_plan.md` (8 roles, matrix, abuse catalogue AB-xx, build order B0-B13 written for a longer timeline), `project/09_build_requirements_and_user_flow.md` (v1 requirements + user flow for 5 roles: setter, exam admin, custodian, centre superintendent, auditor; slices A-H), `project/06_requirements_register.md`, `project/05_threat_model_v0.md`.

## Team and resources
The user is the main builder (works with an AI coding assistant); a team of up to six exists but only reviews. Assume **one effective builder + an AI pair-programmer for 5 days**, VM specs unknown (assume a Linux VM with ssh, a few GB RAM, ports we can ask to open, Node and/or Python installable). Peers test with ordinary browsers.

## What we need from the council
A **process and a design** we can execute in 5 days that (1) is genuinely secure and survives 8+ attacking classmates, (2) is usable (25% of grade; remember the Phase I lesson: people must understand and operate it under pressure), (3) runs on a VM and is reachable by the testers, (4) comes with a user guide, (5) leaves evidence for the video (security requirements -> how addressed -> vulnerabilities found -> lessons).

## Rules for your response
- Stay in your assigned persona's professional lens, but be concrete and honest about trade-offs. **Disagree with other lenses where your discipline demands it**; do not be agreeable. Do not invent facts about the project; if you need one, read the files above.
- Think about the **5-day reality**. Propose what to cut as much as what to build.
- Give **2-3 distinct options per question you cover, each with pros and cons**, then your recommendation and the single biggest risk of it.
- Keep it **under 450 words**. Plain language. Tables welcome. No fluff.
- Write your full proposal to the file path you are given, and reply with a <=120 word digest: your recommendation, your top 3 non-negotiables, and the one thing you most expect others to get wrong.
- These are role-played lenses for a student project, not the views of real people.
