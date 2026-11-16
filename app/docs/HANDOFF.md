# LeakProof: handoff (read this first)

Written 14 Nov 2026 for anyone, human or AI agent, who picks the project up. It states what exists, what is verified, what is not,
and exactly what to do next. Why each choice was made: `docs/DECISIONS.md`. How to operate the VM: `docs/OPERATIONS.md`.
What is claimed about security and the test behind each claim: `SECURITY.md`. Rules for agents sharing this repo: `CLAUDE.md`
and `COORDINATION.md` (repo root, VM copy). The wider project story (Phase I research, councils, history): the laptop repo's `docs/HANDOFF.md`.

## 1. What this is, in five lines
LeakProof is a web app that runs one university multiple-choice exam from question collection to printed per-seat copies so that
**nobody can read the paper before the exam** and **a leaked copy points to a seat**. Setters submit encrypted questions; **Seal** draws the
paper late and locks it under a key split 3 of 5 between key holders; **Release** needs three verified key cards, two typed words, the
print window and a seat count; each seat gets its own order; every step goes in a keyed, tamper-evident log.
It is the Phase II deliverable of the course *Usable Security and Privacy* (CSE 347/547, IIIT-Delhi, Monsoon 2026): the class attacks every
group's system on a VM from 18 to 25 Nov and each valid bug found in ours costs us marks.

## 2. Deadlines that matter
| When | What |
|---|---|
| **Tue 17 Nov 2026, midnight** | **Code freeze and submission** (source on the file server and Classroom, executable, user guide). Code cannot change afterwards. |
| Wed 18 Nov, before 8:00 | Executable and guide posted for the class. Demo credentials per role go in this post (not in the 17 Nov upload). |
| 18 Nov noon to 25 Nov midnight | Classmates test us (everything except DDoS). Keep the VM serving. |
| 25 Nov night | Start the official instance for the demo. |
| 26 Nov | Poster session 2, live demo. |
| 28 Nov midnight | Our own test reports on the groups we were assigned. |
| 29 Nov midnight | Recorded video (at most 20 min). Part B needs classes of vulnerabilities reported, causes, lessons: use `logs/vulnerabilities.csv` and Caddy's access log. |

## 3. State at handoff (verified unless marked)
- **Code:** zero npm dependencies, Node 22+ (`node:http`, `node:sqlite`, `node:crypto`). About 2,500 lines in `server.mjs`, `src/`, `public/`.
- **Tests:** `npm test` = **107 passing**, no flakes over repeated runs. Coverage 99.3% lines, 94.3% branches. Mutation testing on the final code: 80 of 125 planted
  bugs caught (64%); none revealed a wrong behaviour, the survivors are mostly equivalent mutants and clock-dependent cases.
- **Reviews and testing done:** five councils (`laptop repo docs/council/`), round 5 with 6 critics and 5 of 7 testers; two regression passes. 14 real bugs found and fixed are in `logs/vulnerabilities.csv`.
- **NOT done (be honest about these in the video):** (a) the access-control penetration test and the cryptanalysis/offline-attack test were stopped by the model safeguards and never ran; (b) nothing has been clicked in a
  real browser (jsdom only): print layout at A4, contrast, phone width, `help.html` rendering; (c) the deploy scripts were never run on the VM (only `bash -n`, stubs and a temp-repo package build);
  (d) no pilot with strangers yet; (e) the certificate steps in the guide are not checked in real browsers.
- **VM `192.168.2.238` (hostname `uss04`, Ubuntu 24.04, Node 22.23, Caddy 2.11, 6 CPU, 5.8 GB RAM):** this repo is committed in `~/leakproof` (branch `main`, last commit `846e0d3`, old scaffold kept as tag `scaffold-v0`).
  **Our app is not deployed.** The old scaffold's placeholder service still answers on 127.0.0.1:8080 and Caddy runs its default config. Deploying needs the `iiitd` user's sudo password.
  Not pushed to GitHub (`origin` = `git@github.com:Abhishekjha18/leakproof.git`).
- **Uncommitted, unreviewed work by another session:** on the laptop copy only, `deploy/accounts.sh` and one added line in `deploy/release.sh` (`accounts:lp-accounts`) appeared at 17:50 on 14 Nov from a different Claude session
  (`uss-e4` or `uss-5e`). `accounts.sh` runs `scripts/accounts.mjs`, which does not exist, so the feature is half built. It is **not** on the VM and not in the reviewed release. Either finish it with tests and a review, or delete both.
  Adding features now adds bug surface before the freeze; the default is to delete.

## 4. Invariants: do not break these
1. Zero dependencies. No framework. The browser renders with `textContent` only (a test scans `public/`).
2. Every route is in the one route table in `src/app.mjs`; a missing capability answers 404, never 403; an unlisted route must fail the route-matrix test.
3. No plaintext question or paper is ever stored. Keys never go in the database or git (`*.key`, `*.env`, `*credentials*`, `secrets/`, `submission/` are ignored).
4. Official and demo instances are never auto-restarted (a restart re-locks the open paper).
5. Never weaken a test to make it pass. Every claim in `SECURITY.md` names a test.
6. Practice, demo and official share nothing: separate process, port, data directory, keys.
7. After the freeze: no code changes. Only env files, keys, accounts, data, documents.
8. Never put a password, key or credentials file in the repo or in a message. (The VM password was pasted in a chat on 14 Nov; it must be changed with `passwd`.)

## 5. Map
```
server.mjs         entry: socket limits, timeouts, crash guards            src/app.mjs   routes + the one middleware chain
src/exam.mjs       pipeline: submit, seal, cards, release, copies, key, trace   src/crypto.mjs   AES-GCM, scrypt, Shamir, HMAC streams
src/log.mjs        keyed hash chain     src/db.mjs   SQLite schema     src/config.mjs   env config (LP_MODE, ports, limits)
src/http.mjs       headers, body reader, rate limiter, static files        src/bank.mjs   sample questions for practice
public/            index.html, app.js, styles.css, help.html (no script)
tests/             crypto, flow, security, hardening, round5, extra, extra2 (names start with SR*, FCS-*, S*, R5-*, X*)
scripts/           official-setup.mjs (--demo, --out)
deploy/            preflight, install, release, rollback, health, backup, demo-setup/reset, enable-official, official-init, make-package, smoke, firewall, harden-ssh,
                   Caddyfile, leakproof@.service, systemd/ (timers), official.example.json
.github/           ci.yml, PR template, ci/ checkers       docs/   OPERATIONS.md, TESTERS.template.md, DECISIONS.md, HANDOFF.md, 11_ and 12_ design docs (VM copy)
USER_GUIDE.md      the tester/user guide        SECURITY.md   requirements, measures, FCS lessons, limits, tests    logs/vulnerabilities.csv   Part B evidence
```
Ports: practice 127.0.0.1:8080 (https :8443), demo 7090 (:7443), official 9090 (:9443). Default dev ports for tests are random.

## 6. Run, test, sync
```bash
cd project/app && npm test                                     # 107 tests, about 15 s
LP_DEV_HTTP=1 LP_PORT=8790 LP_DATA_DIR=/tmp/lp-dev node --disable-warning=ExperimentalWarning server.mjs   # a dev copy; course code USS-PRACTICE by default
```
Working copy: laptop `project/app`. VM copy: `~/leakproof` (git). Sync: `rsync -a --exclude data --exclude node_modules --exclude .DS_Store ./ uss-vm:leakproof/` (never `--delete`), then
`ssh uss-vm 'cd ~/leakproof && npm test && git add -A && git commit'`. `ssh uss-vm` works from the owner's laptop with a key (`~/.ssh/uss_vm_ed25519`); other people need their own key in `~/.ssh/authorized_keys` on the VM.

## 7. What to do next, in order
1. **Decide the other session's `accounts.sh` change** (section 3): delete it and the `release.sh` line, or finish with tests.
2. **Pilot** USER_GUIDE.md with 2 or 3 strangers on a dev copy; fix guide wording (documents may still change after the freeze, code may not).
3. **Real-browser check** (15 min): `help.html` logged out; register (Continue locked until Copy/Download); a 13-character card passphrase refused; verify without saving shows the warning; seal then click "Exam cell";
   release; print preview A4 of a copy of 30+ questions (footer repeats on every page) and of an answer key (band shows); trace with and without options; phone width 375 px.
4. **First deploy on the VM** (rehearse before the freeze; keep a second SSH session open for the firewall step):
   ```
   cd ~/leakproof && git tag v0.9.1 && bash deploy/preflight.sh
   sudo ALLOW_OFF_MAIN=1 bash deploy/install.sh v0.9.1 --no-firewall      # ALLOW_OFF_MAIN because the commit is not on origin/main yet
   bash deploy/smoke.sh https://192.168.2.238:8443                         # from a laptop
   sudo bash deploy/demo-setup.sh && sudo lp-firewall                      # demo pods, then the firewall
   ```
   Then time the watchdog by hand (SIGKILL and SIGSTOP the practice process) and `sudo lp-rollback`.
5. **Package:** `bash deploy/make-package.sh v0.9.1 --contact "<email or class channel>"` (`--no-credentials` for the 17 Nov upload; with credentials for the 18 Nov post). It needs a contact line: it refuses without one.
6. **Tag `v1.0.0` before 17 Nov midnight**, push to GitHub, post the tarball and its SHA-256. Re-run `release.sh v1.0.0`, smoke test, verify the posted guide's address and course code.
7. **Key-only SSH** (`sudo bash deploy/harden-ssh.sh --apply`) only after every member's key login is proven; set `FW_ADMIN_IPS` for the people who use SSH heavily.
8. **18-25 Nov:** run the duty checklist in `docs/OPERATIONS.md` (section 13); log every report in the incident log (section 16) as class, cause, fix, lesson; reset practice or demo when abused.
9. **25 Nov night:** official instance (`deploy/enable-official.sh`, `deploy/official-init.sh`); rehearse once before.
10. **Video (29 Nov):** Part A from Phase I (`laptop repo evidence/`), Part B from `logs/vulnerabilities.csv`, Caddy's access log and SECURITY.md sections 2 to 4.

## 8. Known limits (also in SECURITY.md section 4 and the guide)
Plaintext paper exists in server memory for seconds at Seal and while open; the exam cell sees it at print time; three colluding holders plus a database copy can open the paper offline; the window and seat count are
set by the exam cell; an operator can grind the draw seed (it is committed at Seal); the log tail can be truncated without off-system anchoring; a trace names a seat not a person and is ambiguous on question stems alone;
a wrong-but-valid `server.key` is not detected at start-up; usernames are enumerable at sign-up (409); one key holder can refuse a request; the certificate is self-signed (internal CA), so testers see a warning; no email, no MFA.

## 9. Gotchas for AI agents
- Read `CLAUDE.md` and `COORDINATION.md` first; claim files before editing; one owner per file. Subagents given disjoint file ownership worked well.
- Do not run, reword or relaunch attack-style test prompts: this session's model cyber safeguards blocked two (access-control pentest, cryptanalysis). A human or an approved program should do those.
- Usage limits were hit twice with 13 parallel agents; resume stopped agents with their saved context rather than starting over; stagger heavy work.
- Never print or store passwords, `~/.ssh` contents, `/etc/leakproof` keys or the credentials file. Use scratch files under a temp directory.
- Tests use temp data directories and random ports; never use ports 8080/8443/7443/9443 or `/var/lib/leakproof` for experiments on the VM (those are live).
- `public/app.js` hash routing: after a state change, `refresh()` re-renders and replaces the URL hash; do not set the same hash expecting a re-render.
- Browser tools were not available in the latest sessions: UI claims rest on jsdom runs. Say so when you report.
