# LeakProof (UsS course project)

**New here? Read `docs/HANDOFF.md` (whole project) then `app/docs/HANDOFF.md` (the tool) and `app/docs/DECISIONS.md` (why).**

A leak-resistant paper exam pipeline: late random draw, paper sealed under the professor's key card (AES-256-GCM, Shamir 1-of-1), release only inside the print window, a traceable per-seat copy, and a tamper-evident log.

| Folder | What | Status |
|---|---|---|
| `app/` | **Phase II tool** (the deliverable): server, client, tests, deploy scripts. Start with `app/README.md`, `app/USER_GUIDE.md`, `app/SECURITY.md`. | 107 tests pass; 3-role model (Professor/TA/Student) |
| `site/` | Phase I research site, live at https://uss-ten-theta.vercel.app (Vercel deploys this folder). `npm install` before running its tests. | Live |
| `docs/` | `HANDOFF.md` (start here), current design and requirements: `11_minimal_system.md` (the design), `12_detailed_design.md` (consolidated detail), `00`, `02`, `05`, `06` (scope, decisions, threats, requirements; the site renders 02/05/06), `phase1_report.md`. | Current |
| `docs/archive/` | Superseded plans (01, 03, 04, 07-10). Kept for the video's "how the design evolved". | History |
| `docs/council/` | Role-played design council, rounds 1-4 (round 4: lessons from FCS Groups 1 and 2, and the adoption plan). | History |
| `evidence/` | Phase I deliverables, study instruments, and logs (findings, decisions, vulnerabilities, participation). | Evidence |
| `reference/` | Course project brief (PDF) and `fcs/` (FCS Group 1 and 2 code, and the classmate bug reports used as a baseline). | Reference |

Deadlines: code and user guide 17 Nov; peer testing 18-25 Nov; poster and demo 26 Nov; test reports 28 Nov; video 29 Nov.
