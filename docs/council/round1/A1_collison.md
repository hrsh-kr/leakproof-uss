# A1 (Collison-style builder lens): LeakProof Phase II in 5 days

Role-played lens, not the real person. Grounded in `00_brief.md` and a listing of `project/site/` (logic.mjs and pipeline-core.mjs exist and are tested; no auth, no roles, no persisted exam data).

## (a) What makes it feel "inevitable and trustworthy" to an exam office in 5 days

Trust here is not polish. It is that every action leaves a thing the office can hold, and the system refuses loudly when something is wrong.

| Option | Pros | Cons |
|---|---|---|
| 1. **One guided "exam day" run, start to finish** (setter submits, admin draws, custodians release shares, centre unlocks, seat copies print, auditor verifies log). Single Node server, SQLite, server-enforced roles. | Matches the 5 roles in doc 09. Reuses tested logic. Testers get one obvious path. | Auth + roles + persistence is a lot of new code in 5 days. |
| 2. **Receipts-first**: thin UI, but every step issues a signed receipt (what happened, who, hash, log position) and a public "verify this receipt/copy ID" page. | Cheap, very demonstrable, directly answers "who leaked it". Great for the video. | Looks sparse if the workflow around it is weak. |
| 3. **Role dashboards, many screens** | Looks complete. | Spreads thin; every screen is an attack surface. |

**Recommend 1 built around 2.** Each stage ends in a receipt. The office trusts what it can check.

## (b) Obsess vs leave rough

**Obsess (3 things):**
1. **The unlock ceremony screen.** One screen, one next action, plain statement of what is still missing ("2 of 3 custodians; seating report not filed; opens 09:00"). This is the Phase I "heavy steps under pressure" finding. Refusals say what, why, and what to do next.
2. **The receipts / copy-ID verification page.** The "leaked photo points to a seat" claim must be demonstrable in 10 seconds.
3. **The user guide.** Written as a runbook for the exam office, one page per role, screenshot per step, a "when things go wrong" section (absent key holder, printer failure). Graders and 8 testers read this first. Write it as you build, not at the end.

**Leave rough:** visual design, setter editor niceties, stats, the print-day physical logistics (describe it in the guide as a documented procedure, simulate it), mobile layout, i18n.

## (c) Building to iterate fast after feedback

- **One process, one DB file, one `deploy.sh`** that goes from git push to running on the VM in under a minute. Redeploying 10 times a day must be boring.
- **Seed script + reset endpoint** (demo-only): a fresh exam in one command, so testers and you can retry flows.
- **A tiny, boring API** with verbs that match the guide ("submit-question", "draw", "release-share", "unlock", "verify"). If the guide sentence is awkward, the API is wrong.
- **Every attack becomes a test.** Keep a `findings/` folder: screenshot, failing test, fix, commit. That is both the iteration loop and the video's Part B.
- **Structured logs and an in-app audit view** so you can see what attackers did within minutes.
- Freeze features by day 3 (15 Nov). Days 4-5 are hardening, guide, deploy, dry-run.

## (d) Pushback: biggest likely mistake

**Rewriting the stack (FastAPI/SQLite plan in `tool/`) or building features before deploying.** The crypto in `logic.mjs` is already tested; the Python tool is empty. Switching languages burns a day on re-porting crypto. Second-biggest: not deploying to the VM until day 4. **Deploy a hello-world with login to the VM today**, and tell the TAs now. Everything after that is incremental, and VM surprises (ports, Node version) surface when they are cheap.

Also: do not trust client-side logic for anything. The Vercel/static origin suggests browser-side flow; the secret shares and role checks must live on the server, or classmates will break it in the first hour.

## Single biggest risk of my recommendation
Auth + roles + persistence done in a hurry has holes. Mitigate by using one well-known pattern (server sessions, a deny-by-default permission check in one function, the matrix file in `tool/`) and by getting two teammates to attack it on day 3 before classmates do.
