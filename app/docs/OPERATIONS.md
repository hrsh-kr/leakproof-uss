# LeakProof operations handbook

For the three team members (M1, M2, M3). Written so that you can follow it cold, at 2 a.m., without asking anyone.
Every command below was written for Ubuntu 24.04 on the course VM (192.168.2.238, user `iiitd`). Nothing here was run on
the VM before this was written, so the first run of each command is a rehearsal: do it before the freeze (section 12).

Contents: 1 Rules - 2 Roles - 3 Workflow - 4 CI/CD - 5 Layout - 6 First deployment - 7 Release and rollback - 8 Watchdog -
9 Clean slate - 10 Backups and keys - 11 Demo pods - 12 Calendar - 13 Duty checklist - 14 Exam night - 15 Submission package -
16 Incident log - 17 After the freeze - 18 Troubleshooting - 19 SSH and firewall

## 1. The ten rules

1. GitHub `main` is the source of truth. The clone `~/leakproof` on the VM only pulls; nobody edits files on the VM.
2. Code reaches the VM only through `deploy/release.sh <tag>`. Never copy files into `/srv/leakproof` by hand.
3. Official and demo instances are never restarted automatically, and never by hand during an exam (a restart re-locks an open paper).
4. After the freeze (17 Nov, midnight) there is no code change. Only operations (section 17).
5. Nothing secret goes into git: no passphrases, keys, `.env` files, databases. CI checks this.
6. Credentials files live on the VM only (`/etc/leakproof/*`, mode 0600, root).
7. Every scripted change is announced in the group chat: tag, time, result.
8. Before any destructive step, there is a backup. The scripts move data to `quarantine/`, they do not delete it.
9. Never edit sshd or the firewall without a second SSH session open.
10. Every incident gets a row in the incident log (section 16), also the boring ones. Part B is built from it.

## 2. Roles

| Who | Is | Owns |
|---|---|---|
| M1 | repo owner | GitHub settings, merges, tags, the freeze, duty rota |
| M2 | VM lead | everything under `sudo` on the VM: install, releases, firewall, SSH, demo pods, exam night |
| M3 | tests and docs | CI, user guide, testers' document, submission package, incident log, video |

Any of the three may deploy (section 7) from a tag whose CI run is green. Any of the three may run the clean-slate runbook (section 9).

## 3. Workflow

| Topic | Rule |
|---|---|
| Branches | `main` is always green and deployable. Work on `feat/<area>-<who>` or `fix/<area>-<who>`, under a day |
| Review | A pull request needs one approval from someone other than the author, plus green CI. Squash merge. The PR template has the checklist |
| Branch protection | Turn it on if the GitHub plan allows (require PR, 1 approval, status check `test`, no force push). If not, the same rules apply by convention and CI still runs on every push to `main` |
| Commits | `area: imperative summary`; areas: `app`, `ui`, `deploy`, `tests`, `docs`, `ci`. The body says why |
| Tags | `v0.9.N` release candidates on `main`; the final one is `v1.0.0` (annotated). A tag is never moved: `release.sh` refuses a tag whose content changed |
| Hotfix before the freeze | branch from `main`, fix and test, PR, one approval, merge, tag `v0.9.N+1`, `release.sh`. Target: 30 minutes |
| Hotfix after the freeze | None for code. See section 17 |

Freeze, precisely: the annotated tag `v1.0.0` on the final `main` commit; the tarball `leakproof-v1.0.0.tar.gz` and its SHA-256
(from `make-package.sh`) posted with the submission and copied to `/srv/leakproof/dist/` on the VM; the VM runs
`/srv/leakproof/releases/v1.0.0`. The SHA-256 is the proof, because a tag can be moved and a hash cannot.

## 4. CI/CD

```
 laptop                GitHub                              VM (192.168.2.238)
 ------                ------                              ------------------
 branch + PR  ----->   CI "test" job:                      ~/leakproof (clone, pull-only)
                        secrets + innerHTML check                |
                        node --check public/*.js                 |  sudo bash deploy/release.sh vX.Y.Z
                        bash -n + shellcheck deploy/*.sh         v
                        SECURITY.md cites real tests       /srv/leakproof/releases/vX.Y.Z   (new, root-owned, read-only)
                        npm test (>= 52 pass, 0 fail)            |  npm test again in a copy
 merge to main --->    (runs again on main + tags)               |  caddy validate (before anything switches)
 git tag vX.Y.Z -->                                              v
                                                           /srv/leakproof/current  (atomic symlink)
                                                                 |  restart leakproof@practice
                                                                 v
                                                           health check; failure = automatic rollback
```

No credential for the VM exists in GitHub, and CI never runs on the VM. The deploy is a deliberate human step.
CI is the gate before it; `release.sh` runs the tests once more on the VM (skip with `--skip-tests` only for an emergency).

## 5. Layout on the VM

| Path | Content |
|---|---|
| `~/leakproof` | git clone (pull-only), the place `release.sh` is run from |
| `/srv/leakproof/releases/<tag>` | immutable copies of tags, root-owned, read-only. Never deleted |
| `/srv/leakproof/current`, `previous` | symlink to the live release; path of the one before it |
| `/srv/leakproof/dist` | frozen tarball and `SHA256SUMS` |
| `/var/lib/leakproof/<instance>` | databases (`practice`, `demo`, `official`), owned by `leakproof`, mode 0700 |
| `/var/lib/leakproof/quarantine` | data moved aside by resets (evidence; delete only after Part B) |
| `/etc/leakproof/<instance>/{server,log}.key` | keys, root 0400. A lost key cannot be recreated over existing data |
| `/etc/leakproof/<instance>.env` | per-instance settings: `LP_PORT`, `LP_MODE`, practice course code. Editable after the freeze |
| `/etc/leakproof/demo-credentials.md` | demo passwords (root, 0600) |
| `/var/backups/leakproof` | hourly DB copies, key archive, golden demo snapshot |
| `/var/log/caddy/access.log` | Caddy access log, JSON, rolled by Caddy (evidence for Part B) |
| `/var/log/leakproof-deploy.log` | what every `release.sh` run printed |
| `/usr/local/sbin/lp-*` | `lp-health`, `lp-rollback`, `lp-backup`, `lp-reset-practice`, `lp-demo-reset`, `lp-firewall` (copies installed by `release.sh`, so they work even if the release tree is broken) |

| Instance | Node (loopback) | Public (Caddy, TLS) | Mode | Auto-restart by the watchdog |
|---|---|---|---|---|
| practice | 8080 | 8443 | practice | yes (after 3 failed probes, at most 4 per hour) |
| demo | 7090 | 7443 | official | never |
| official | 9090 | 9443 (only after `enable-official.sh`) | official | never |

## 6. First deployment (M2, once; rehearse it twice)

Before you start: `ssh` into the VM and keep that terminal open; open a second one for later checks. Every step that changes the
network or SSH has a safety check, but this is a single VM and a lockout is the worst outcome.

```bash
# 0. Make sure the tag exists on GitHub (M1 pushed v0.9.1 after green CI).
cd ~/leakproof && git pull --ff-only && git fetch --tags
# 1. Read-only checks. Fix every FAIL line first.
bash deploy/preflight.sh
# 2. Bootstrap: user, dirs, keys, env files, units, Caddy, timers, firewall, then the first release.
sudo -v
sudo bash deploy/install.sh v0.9.1 --vm-ip 192.168.2.238
#    (optional flags: --course-code CODE, --skip-tests, --no-firewall)
# 3. From ANOTHER terminal: can you still log in over ssh? Then from a laptop:
bash deploy/smoke.sh https://192.168.2.238:8443
# 4. Prove the safety nets (section 8): kill -9 and SIGSTOP tests, then the rollback timing (section 7).
# 5. Later, once key login works from every member's laptop:
sudo bash deploy/harden-ssh.sh            # shows the change
sudo bash deploy/harden-ssh.sh --apply    # only after a second terminal is logged in
# 6. Demo pods (section 11), backups check (section 10), package (section 15).
```

`install.sh` prints the role-based course codes (`LP-PROF-G19`, `LP-TA-G19`, `LP-STU-G19`) and, once Caddy has made its root certificate, the root
certificate SHA-256. If the root certificate is not there yet, open `https://192.168.2.238:8443/` once in a browser and rerun
`make-package.sh` later. Re-running `install.sh` is safe: existing keys, env files and data are never overwritten (an existing
practice course code is kept; edit `/etc/leakproof/practice.env` and `sudo systemctl restart leakproof@practice` to change it).

## 7. Release and rollback

Checklist (every release):

1. CI is green on the tag's commit; the tag is annotated and pushed (`git tag -a v0.9.2 -m "..." && git push origin v0.9.2`).
2. On the VM: `cd ~/leakproof && git pull --ff-only`.
3. `sudo bash deploy/release.sh v0.9.2`. It fetches the tag, builds `/srv/leakproof/releases/v0.9.2`, runs the tests, validates the Caddyfile, refreshes units and `lp-*` helpers, switches `current`, restarts practice, checks health on loopback and through Caddy. If health fails it rolls back by itself.
4. From a laptop: `bash deploy/smoke.sh https://192.168.2.238:8443` shows 0 failures.
5. Post in the group chat: tag, time, result. Testers lose their sessions on a restart: announce it in the class post if testing is on.
6. The certificate fingerprint must be unchanged (the root never changes).

Useful variants:

```bash
sudo bash deploy/release.sh v1.0.0 --instance demo          # demo picks up the new code (restart; pods lock again)
sudo bash deploy/release.sh v1.0.0 --tarball /srv/leakproof/dist/leakproof-v1.0.0.tar.gz   # no GitHub needed
sudo bash deploy/release.sh v0.9.3 --skip-tests          # emergency only, e.g. a flaky timing test on a busy VM
```

All instances share `current`, but an instance only runs new code when it is restarted. Demo and official therefore keep their
code until you deliberately release to them; an unplanned restart of either picks up whatever `current` is then. After the
freeze there is only one release, so this cannot bite.

Rollback, one command (works even if the new release is broken):

```bash
sudo lp-rollback            # practice: current <-> previous, restart, health check
sudo lp-rollback --instance demo
```

It swaps `current` and `previous`, so running it twice returns to where you were. Rolling back is safe while releases share the
database schema (the only migration so far only adds a column). Release directories are never removed, so rollback has nothing to
restore. Time it once; the target is under 30 seconds.

## 8. The watchdog

`lp-health@practice.timer`, `lp-health@demo.timer`, `lp-health@official.timer` run `lp-health <instance>` every 30 seconds.

| Situation | Practice | Demo and official |
|---|---|---|
| `/healthz` fails once or twice | warning in the journal | warning in the journal |
| fails 3 times in a row (about 90 s) | restart the service, at most 4 per hour, then critical message | critical message "NOT restarted", a human decides |
| unit enabled but stopped | critical message, not started (it may be stopped on purpose) | same |
| Caddy inactive, or HTTPS front door failing 3 times | restart Caddy (same budget) | (checked once, from the practice probe) |
| disk 85 % or 95 % full, certificate under 2 h left | warning or critical | |

Read it: `journalctl -t lp-health --since -1h`, `sudo lp-health --status`, `systemctl list-timers 'lp-*'`.
systemd itself restarts a crashed process after 3 seconds, with no start limit (`leakproof@.service.d/10-ops.conf`); the
watchdog exists for hangs that systemd cannot see. The unit also has `MemoryHigh=400M`, `CPUQuota=300%`, no core dumps.

Test before the freeze (practice only):

```bash
sudo systemctl kill -s SIGKILL leakproof@practice    # back within about 3 s (systemd)
sudo systemctl kill -s SIGSTOP leakproof@practice    # frozen; the watchdog restarts it after about 90 s
journalctl -t lp-health -n 20 --no-pager
```

To pause the watchdog for an investigation: `sudo systemctl stop lp-health@practice.timer` (start it again afterwards).

## 9. Clean-slate runbook (practice, target under 2 minutes)

Use it when practice is full (2000 accounts, "Practice is full"), corrupted, or abused beyond repair.

1. Announce in the class channel: "Practice is reset in 2 minutes, all practice accounts disappear, the course code stays."
2. `sudo lp-reset-practice`. It stops practice, moves the data to `/var/lib/leakproof/quarantine/practice-<time>`, creates an empty data dir, starts the service and waits for health. The keys and the course code stay, which is fine because a fresh database is accepted.
3. `bash deploy/smoke.sh https://192.168.2.238:8443` from a laptop.
4. Incident log row (section 16): what filled it, how long it took, evidence kept in quarantine.

If the code release itself is damaged: `sudo lp-rollback`; or deploy again from the frozen tarball
(`sudo bash deploy/release.sh v1.0.0 --tarball /srv/leakproof/dist/leakproof-v1.0.0.tar.gz`, which first checks `SHA256SUMS`).
If the VM is rebuilt from scratch: section 6 with the tarball, then restore the keys (section 10) BEFORE restoring any database.
Demo: `sudo lp-demo-reset` (section 11). Official is never reset by script: stop, think, restore from a backup, with a human decision.

Rehearsed timing to fill in on the VM: reset ____ s, rollback ____ s, full first deployment ____ min.

## 10. Backups and keys

`lp-backup.timer` runs hourly: a `VACUUM INTO` copy of each instance's database (made by the `leakproof` user, integrity-checked,
newest 48 kept per instance) and a key archive (only when a key changed). All of it lands in `/var/backups/leakproof` (root, 0700).
Run by hand any time: `sudo lp-backup`.

Get the keys off the VM, once after install and again after any key change (treat the file as a secret, it unlocks every database):

```bash
sudo cp /var/backups/leakproof/keys-latest.tgz ~/keys.tgz && sudo chown "$USER" ~/keys.tgz
scp iiitd@192.168.2.238:keys.tgz ./          # from your laptop; store it encrypted, not in git
sudo shred -u ~/keys.tgz                     # on the VM
```

Restore a database: stop the instance, move the old data dir to `quarantine`, copy the chosen `<instance>-<time>.db` to
`/var/lib/leakproof/<instance>/leakproof.db`, `chown -R leakproof:leakproof` the directory, mode 0700, start the instance. Keys first.

## 11. Demo pods

Three independent pods of 5 accounts each (1 professor, 2 TAs, 2 students) on the demo instance (`https://192.168.2.238:7443/`),
running in official mode, accounts without the forced passphrase change, shared by honour system (one group per pod).

Provision (M2, once, after a release that has `official-setup.mjs --demo --out`):

```bash
sudo bash deploy/demo-setup.sh
sudo cat /etc/leakproof/demo-credentials.md      # the table to post (24 rows, root-only file, not in git)
```

It prints no passphrase, writes `/etc/leakproof/demo-credentials.md` (0600), takes the golden snapshot
`/var/backups/leakproof/golden-demo.tgz` (+ SHA-256) and enables the nightly reset (04:00). Check in a browser that the page
shows the Official label and that `p1-prof` can log in. Exam window defaults: 18 Nov 00:00 to 29 Nov 23:00 (`DEMO_START`, `DEMO_END`).

Reset (a tester changed a passphrase, or the pods are a mess): `sudo lp-demo-reset`. The same credentials work again, because the
golden snapshot holds the same hashes; the old data is kept in `quarantine`. `demo-setup.sh` refuses to run twice (a rebuild
creates new random passphrases and invalidates the posted table); `--force` does it anyway, then repost the table.
The credentials are for demo pods only. Real official credentials never go into this file.

## 12. Calendar, 14 to 29 November

M1 repo owner, M2 VM lead, M3 tests and docs. Adjust names and times to your lectures.

| Day | M1 | M2 | M3 |
|---|---|---|---|
| Sat 14 | add collaborators and branch rules; merge this operations work (CI green); review S, C and O changes | `preflight.sh`; plan the first install | run the new CI locally; start USER_GUIDE and TESTERS templates |
| Sun 15 | merge round-5 fixes; tag `v0.9.1` | first `install.sh v0.9.1`; kill -9 and SIGSTOP tests; time `lp-rollback` and `lp-reset-practice`; key login test from all laptops | `smoke.sh` from a laptop; guide draft against the real buttons |
| Mon 16 | feature freeze 18:00, only P0 fixes | `harden-ssh.sh --apply`; run `demo-setup.sh`; rehearse the demo-pod run with all three; dry run `make-package.sh` | fix the guide (course code, root fingerprint, demo file); originality statement |
| Tue 17 | 20:00 tag `v1.0.0`; protect or archive the repo after the upload | 21:00 `release.sh v1.0.0`, `smoke.sh`, `lp-backup`, key copy off the VM, tarball to `/srv/leakproof/dist` | `make-package.sh v1.0.0 --no-credentials --run-tests`; upload; 23:30 all three verify the checksum |
| Wed 18 | duty | 07:00 smoke; demo credentials to the Classroom post before 08:00 | `make-package.sh v1.0.0` (with credentials) for the post; start the incident log |
| Thu 19 to Tue 24 | duty rota M1, M2, M3, M1, M2, M3 (section 13), triage every report within 12 h | back-up for the duty person; weekly check of disk and backups | log incidents; classify reports; draft rebuttals |
| Wed 25 | practice closes; export logs (access log, journal) | exam night prep (section 14) | dry-run the exam flow |
| Thu 26 to Sun 29 | Part B: incidents into classes, causes, lessons | decide: leave practice up read-only or stop it | video (20 min max, due 29 Nov midnight) |

## 13. Duty checklist (twice a day, 09:00 and 21:00, 5 minutes)

```bash
systemctl is-active leakproof@practice leakproof@demo caddy
sudo lp-health --status
journalctl -t lp-health -p warning --since -12h --no-pager
df -h /var/lib/leakproof /
ls -t /var/backups/leakproof | head -3
bash deploy/smoke.sh https://192.168.2.238:8443        # from a laptop
tail -n 2000 /var/log/caddy/access.log | grep -c '"status":5'   # server errors
```

Then: new reports in the inbox or chat (reply within 12 hours: valid, invalid with rebuttal, or need more detail), and an incident
row for anything that was not normal. Hand over to the next person in the group chat with one line.

## 14. Exam night (official instance, M2 with M1 and M3 present)

Rule: the official instance is started once and is not restarted until the exam is over. The watchdog only reports on it.

```bash
cp deploy/official.example.json ~/secrets/official.json    # edit: real names, window, seat limit (the file stays out of git)
sudo bash deploy/official-init.sh ~/secrets/official.json   # creates the exam and the accounts, writes the slips file (root, 0600)
sudo bash deploy/enable-official.sh                         # opens 9443 and starts leakproof@official
bash deploy/smoke.sh https://192.168.2.238:9443
```

Hand each slip to its owner in person (print from the root file, then `sudo shred -u` it). Every official account must choose a new
passphrase at its first login. If official hangs: do not restart it. Check `journalctl -u leakproof@official -n 80`, decide as a
group, and log it. `deploy/enable-official.sh --off` closes it after the exam.

## 15. Submission package (M3)

```bash
# On the VM or any machine with the clone and the root certificate file:
bash deploy/make-package.sh v1.0.0 --no-credentials --run-tests --out ~/submission-17nov   # 17 Nov upload
bash deploy/make-package.sh v1.0.0 --out ~/submission-18nov                              # 18 Nov tester post (has demo passwords)
```

Each output folder holds: `leakproof-v1.0.0.tar.gz` and `SHA256SUMS`, `RELEASE.txt` (commit, date, node, test result),
`USER_GUIDE.md` and `TESTERS.md` with the placeholders filled (VM address, course code, root certificate SHA-256, credentials
table, tag, tarball SHA-256), `SECURITY.md`, `README.md`, `leakproof-root-ca.crt` (public, for testers to import). It reads from the TAG, so the
package is exactly the frozen release. Copy the tarball and `SHA256SUMS` to `/srv/leakproof/dist/` on the VM. All three of you
check `sha256sum -c SHA256SUMS` before 23:30 on 17 Nov. The folder with demo passwords is mode 0700: do not upload it with the source.

## 16. Incident log

Keep one table in a shared file (not in git if it contains evidence with credentials), one row per event, also for events that
turned out harmless. It feeds Part B (classes, causes, lessons).

```
id | UTC time | found by (timer / duty / classmate) | symptom | evidence (journal line, access-log excerpt, report id)
class (auth | rate limit | injection | DoS-adjacent | availability | usability | other) | root cause
action (none / restart / reset / rebuttal / fix after freeze not allowed) | downtime (min) | data lost? | report valid or invalid + rebuttal | lesson
```

Evidence sources: `journalctl -u leakproof@practice --since "2026-11-19"`, `journalctl -t lp-health`, `/var/log/caddy/access.log`
(JSON lines: `jq 'select(.status>=400)' ...` if jq is installed), `/var/lib/leakproof/quarantine`, `/var/log/leakproof-deploy.log`.
Copy what you need into the log the same day: journald keeps 14 days or 500 MB.

## 17. What may still change after the freeze

Allowed (operations, logged in the incident log): `/etc/leakproof/*.env` (limits such as `LP_AUTH_PER_MIN`, `LP_REGISTER_PER_IP`,
`LP_MAX_ACCOUNTS`, the course code), restarting practice, `lp-reset-practice`, `lp-demo-reset`, key and account handling on the
official instance, firewall and ufw settings, Caddy runtime data, the posted guide and testers' document as separate text,
documentation outside the tarball, GitHub settings (lock or archive the repo).

Not allowed: any change to code, `deploy/`, `public/`, tests, or the tarball. A bug found by a classmate is recorded and either
rebutted or acknowledged in Part B; it is not patched on the VM. If a release is truly required (a data-loss bug), the three of you decide
together, tag `v1.0.1`, say so in the post, and the submitted artefact stays `v1.0.0`.

## 18. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Site unreachable from a laptop | firewall, Caddy or the service is down | `systemctl is-active caddy leakproof@practice`; `sudo lp-firewall --status`; `journalctl -u caddy -n 40`; `curl -s http://127.0.0.1:8080/healthz` on the VM |
| Browser says certificate not trusted | testers did not import the root | expected; guide has the root SHA-256 and `leakproof-root-ca.crt`; `sudo find /var/lib/caddy -name root.crt` |
| Cards or questions fail to open after a restore | `server.key` does not match the data (restored from another backup); `/healthz` stays green | stop the service, put back the key that was backed up WITH that data (`/etc/leakproof/<instance>/server.key`), start, open one sealed exam to confirm; never delete the database to "fix" it |
| Fingerprint changed | Caddy's data dir was wiped, so a new root was made | tell testers; update the guide; incident row |
| `release.sh`: "tag not on origin/main" | tag on a feature branch | merge first, or `ALLOW_OFF_MAIN=1` for a rehearsal |
| `release.sh`: "exists but holds different content" | someone moved the tag | do not override; make a new tag |
| `release.sh`: tests failed | real failure, or a flaky timing test on a busy VM | read `tail` printed; rerun once; `--skip-tests` only for an emergency and log it |
| `release.sh`: Caddyfile invalid | typo or unsupported option on Caddy 2.11 | nothing was switched; fix in the repo, new tag. Quick check of `lifetime`: `caddy validate --config /etc/caddy/Caddyfile` |
| Health check failed after release | bad release | automatic rollback ran; read `journalctl -u leakproof@practice -n 50` |
| Unit fails with status 203/EXEC | node is not at `/usr/bin/node` or sits under a home directory (`ProtectHome`) | `command -v node`; install node system-wide or symlink |
| "Refusing to start: key file ... missing" | key file lost but database has data | restore keys from the archive (section 10); never create new ones over existing data |
| Practice says "Practice is full" | 2000 accounts reached | section 9 |
| Many 429 from one address | one NAT, one bucket | raise `LP_AUTH_PER_MIN` in `practice.env`, restart practice, log it |
| Official shows "unhealthy, NOT restarted" | by design | do not restart during an exam; investigate, decide as a group |
| Demo passwords stopped working | a tester changed one | `sudo lp-demo-reset` |
| Locked out of SSH after hardening | key not accepted | use the still-open session: `sudo bash deploy/harden-ssh.sh --revert`; else the VM console |
| Disk full | quarantine, backups, journal | `df -h`, `du -sh /var/lib/leakproof/quarantine /var/backups/leakproof`; remove old `*.db` backups first, never the golden snapshot |
| Timer not running | not enabled | `systemctl list-timers 'lp-*'`; `sudo systemctl enable --now lp-health@practice.timer` |

## 19. SSH and firewall notes

`deploy/firewall.sh` (installed as `lp-firewall`, applied at every boot by `leakproof-firewall.service`) only adds rules, all tagged
`lp-fw`. With ufw active it allows ports 22, 8443, 7443 and 9443 through ufw and leaves ufw's policy alone. Without ufw it builds a plain
iptables set with a default DROP, applied only after the SSH accept rule is verified. Both modes limit concurrent connections per source on
the web ports (50) and, where the kernel module exists, new SSH connections per source (12 per minute, burst 8). Add trusted admin
addresses to the exemption list with `FW_ADMIN_IPS="a.b.c.d" sudo -E lp-firewall`. List what it added: `sudo iptables -S | grep lp-fw`.
To take a rule away: `sudo iptables -D INPUT <the exact rule from -S>` (the script never removes anything).

`deploy/harden-ssh.sh` makes SSH key-only. It prints the change first, refuses without an authorised key for your user, validates with
`sshd -t` and `sshd -T`, and reloads (your open session survives). Revert: `--revert`.
