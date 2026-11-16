# C5: process, CI/CD, watchdog, demo credentials, calendar (role-played DevSecOps lead)

Scope: research only. Read `deploy/*`, `scripts/official-setup.mjs`, `server.mjs`, `src/config.mjs`, `src/db.mjs`, `src/app.mjs`, `SECURITY.md` of the snapshot. I could not read the VM repo's `CLAUDE.md` / `COORDINATION.md` (not on this machine): the agent-protocol part is **unverified**. Verified by running in a copy: `npm test` = 52 pass; `node --check public/app.js` ok; the SECURITY.md test-name checker in Appendix B reports `51 cited test names, 0 missing`. Anything about the VM itself (systemd drop-in precedence, disk size, outbound internet, `sqlite3` CLI) is **unverified**.

## 0. Findings that change the plan (ranked by marks impact)

| ID | Finding | Evidence | Will a classmate hit it | Fix cost / risk |
|---|---|---|---|---|
| C5-1 | A hung or crash-looping practice instance stays dead. `Restart=always` does nothing for a frozen event loop, and the default start limit (5 starts in 10 s) can trip with `RestartSec=2` and leave the unit `failed` | `leakproof@.service` lines `Restart=always RestartSec=2`; no `StartLimitIntervalSec` | Yes, any crash class bug becomes "site down all night" | Drop-in + health timer (App. D). No code change |
| C5-2 | `install.sh` rsyncs over the live tree (not atomic, no rollback, `--delete` would erase `releases/`); `ExecStartPre` runs `firewall.sh` from the live tree, so a half-copied tree can stop the service starting | `install.sh` rsync line; unit `ExecStartPre=+/bin/bash /srv/leakproof/deploy/firewall.sh` | Only us, but a bad deploy on 17 Nov costs everything | `release.sh` + `current` symlink (App. C); unit edits (App. C.1) |
| C5-3 | SSH (22) is open to the whole LAN with no rate limit, and `iiitd` uses a password. A classmate who owns the box owns every instance and the keys | `firewall.sh`: `-dports 22,8443,9443 -j ACCEPT`; connlimit covers only 8443/9443 | Yes, "recon, port scan, password cracking" are in Lecture 7 | Key-only SSH + `hashlimit` on 22 (App. D.6). 5 min; risk is locking ourselves out, so keep a second session open |
| C5-4 | Shared demo accounts from `official-setup.mjs` have `must_change`: the first tester to log in changes the passphrase and locks out the graders and everyone else. Passphrases are random, so a re-run after reset produces different credentials | `official-setup.mjs` line `{ mustChange: true }`; `newSecrets()` random | Yes, certain | Separate `demo` instance + restore from a golden snapshot (section 4). No code change |
| C5-5 | Caddy has no access log. After a week of attacks we cannot show classes of attack in Part B | `deploy/Caddyfile` has no `log` block | Not a bug, but Part B evidence is lost | 4 lines in the Caddyfile before freeze |
| C5-6 | Free private GitHub repos cannot enforce branch protection (needs Pro/Team; the student pack gives Pro). Unverified which plan the owner has | GitHub plan rules | n/a | Fallback: rule by convention plus the tag SHA (section 1) |
| C5-7 | Restart relocks an open paper and marks the in-progress release `interrupted` (`exam.mjs` lines 19, 32). An automatic restart on the official instance during the exam destroys the demo | SECURITY.md section 4; `exam.mjs:32` | n/a | Official is alert-only (section 3) |

## 1. Development workflow (3 people)

**Source of truth: GitHub `main`.** The VM clone `~/leakproof` is a deploy mirror: it only ever runs `git fetch --tags` and `git archive <tag>`. Nobody edits files on the VM tree, human or agent, after today. Divergence is prevented by `release.sh` refusing to run if `git status --porcelain` is non-empty or if the tag is not on `origin/main`.

| Topic | Rule |
|---|---|
| Branches | `main` always green and deployable. Work on `feat/<area>-<who>`, `fix/<area>-<who>`. Short lived (under a day) |
| Review | Every PR needs 1 approval from someone who is not the author, plus green CI. Squash merge. Author never merges own PR if two others are online |
| Branch protection | If the plan allows: require PR, 1 approval, status check `test`, no force push, no deletion. If it does not: same rules by convention, and CI runs on `main` pushes so a violation is visible. Ask the owner today to add the other two as collaborators (Write) |
| Commits | `area: imperative summary` (areas: `app`, `ui`, `deploy`, `tests`, `docs`, `ci`). Body says why. One logical change per commit. No secrets, no `*.key`, `*.db`, `*.env`, `data/` (CI enforces) |
| Who may deploy | Any of the three, only from a tag that CI passed, only with `release.sh`. Tell the other two in the group chat before and after (one line: tag, time, result) |
| Tags | `v0.9.N` release candidates on `main`; final `v1.0.0` on 17 Nov |
| Hotfix before freeze | Branch from `main`, fix + test, PR, one approval, merge, tag `v0.9.N+1`, deploy. Target under 30 min |
| Hotfix after freeze | **There is none for code.** The submitted artefact is v1.0.0. Operational fixes (restart, reset, config under `/etc`) are allowed and logged in the incident log. A code bug found by a classmate is recorded, rebutted or acknowledged in Part B; it is not patched on the VM |
| Agent protocol (VM repo) | Unverified text, so: keep claim-before-edit as the lock for working trees, but map a claim to a branch (`claim` = branch name plus a line in `COORDINATION.md` on that branch). Agents on the VM never commit to `main` and never edit `/srv/leakproof`; they push a branch and a human opens the PR. Before 17 Nov midnight, delete stale claims; after freeze, agents are read-only |

## 2. CI/CD options and recommendation

| Option | Fit for an unreachable VM | Security | Verdict |
|---|---|---|---|
| (a) GitHub Actions CI plus a member runs `release.sh` over SSH | Works: CI needs no access to the VM; members are on the LAN anyway | No credential for the VM ever sits in GitHub | **Recommended** |
| (b) Pull timer on the VM fetching a signed tag | Needs the VM to reach GitHub (unverified) and a deploy key on the VM; auto-deploy can ship a mistake at 3 am | Signed tags are good; auto-deploy is the problem | Reject for deploy. Keep `git verify-tag` (SSH-signed tags) inside `release.sh` as optional |
| (c) Self-hosted runner on the VM | Reachable | It executes PR code on the machine that holds the keys, as whichever user the runner uses. A malicious PR (or a compromised member account) reads `/etc/leakproof` if the runner is root-adjacent | Reject |
| (d) Manual rsync | Works | No gate, no history | Fallback only |

Freeze, technically: (1) tag `v1.0.0` on the final `main` commit, annotated, signed if keys exist; (2) `git archive` tarball `leakproof-v1.0.0.tar.gz` plus `SHA256SUMS`, posted with the submission and kept at `/srv/leakproof/dist/`; (3) the VM runs `releases/v1.0.0` via `current`; (4) afterwards turn on branch protection with "lock branch" (read-only) if the plan allows, otherwise archive the repo (Settings, Archive). Tags can be moved; the SHA-256 is the proof, so publish it in the submission and the user guide.

## 3. Watchdog and remediation (what needs no code change)

| Mechanism | Verdict |
|---|---|
| `Restart=always` | Already there. Covers crashes only |
| `StartLimit*` | Set `StartLimitIntervalSec=0` for practice so it never gives up (C5-1) |
| `WatchdogSec` | **Not usable without code.** `sd_notify` writes datagrams to the `AF_UNIX` socket in `$NOTIFY_SOCKET`; Node's `dgram` supports UDP only. The workaround is spawning `systemd-notify` every few seconds from `server.mjs` with `NotifyAccess=all`: a code change, a new failure mode, and no gain over an external probe. Rejected |
| External probe (health timer, App. D) | Replaces the watchdog: curls `/healthz` every 30 s and restarts **practice** after 3 consecutive failures (about 90 s), max 4 restarts per hour, and restarts Caddy if inactive |
| Never auto-restart official | A restart relocks the paper and marks the release `interrupted`; 3 key holders must approve again (`exam.mjs:32`). The probe only logs at `crit` for official; a human decides |
| Resource limits | Unit already has `MemoryMax=512M`, `TasksMax=64`, `LimitNOFILE=4096`. Add `MemoryHigh=400M`, `CPUQuota=300%` (6 CPUs, leaves room for Caddy and SSH), `LimitCORE=0` |
| Disk | Optional 2 GB loop-mounted data volume so a full store cannot starve journald, Caddy and SSH (App. D.5). The app caps accounts at 2000 and 10 exams per account, so growth is bounded but `log` rows are not capped (unverified how fast hostile traffic grows it) |
| Logs | journald cap 500 MB, 14 days; Caddy access log rolling 50 MB x 5 (App. D.4) |
| Backup | Hourly `VACUUM INTO` copy of practice (disposable), plus **golden snapshots** of demo and official and an off-VM copy of `/etc/leakproof` keys (a lost key cannot be recreated over existing data, `config.mjs`) |
| Standby instance | **Not worth it.** A second copy has its own database, so users and sessions split; a cold standby is the frozen tarball plus the runbook, which takes under 2 minutes |

**Network, honestly.** Firewall: default-deny inbound, only 22/8443/9443. `connlimit` rejects the 51st concurrent connection from one /32 on 8443/9443 (a hostel NAT counts as one address). It does not limit new-connection rate. App: 600 API calls/min per client, 30 auth/min, 20 sensitive/min per account, 30 registrations/day per client, 2000 accounts total, header timeout 10 s, 16 KB body. All limiter state is in memory, so a restart clears it. Caddy adds HTTP/1.1 only, 10 s header/body timeouts, 32 KB cap. Residual: someone can exhaust the 2000-account cap from many devices (503 "Practice is full"); fix is a reset, and the runbook covers it. **Deliberately not defended:** volumetric DoS (excluded from testing), ARP/MITM on the LAN (users must check the published certificate fingerprint), compromise of the VM host beyond the SSH hardening below, physical access.

## 4. Demo credentials

| Option | Problem |
|---|---|
| (a) shared accounts in practice | `official-setup.mjs` refuses to run unless `LP_INSTANCE=official`; practice self-registration cannot make fixed roles |
| (b) self-registration only | Satisfies testers (each account gets a private seeded exam where it holds every role), but the deliverable asks for credentials for each role and graders need the five-holder flow |
| (c) both (**chosen**) | Practice at `:8443` for everyone. A third instance `demo` at `:7443` running official mode, with three independent **pods** (8 accounts each: 2 setters, exam cell, 5 holders), so three groups can run the full 3-of-5 flow without colliding. Restored from a golden snapshot nightly and on demand |

Why restore instead of re-run: passphrases are random and printed once, so re-running changes them. Restoring the snapshot returns the same hashes, so the posted file stays valid. The `must_change` flag is cleared by a one-line SQL update (no code change); say in the guide that demo accounts deliberately skip SR2b and that the real official instance does not. Shared accounts can still be re-passphrased by a tester; the answer is the restore (logged in the incident log as a finding to rebut: "shared demo account, by design"). The credentials file contains live passwords: mode 0600 on the VM, never in git (`.gitignore`: `secrets/`), and the posted copy is for demo pods only. **Real official credentials never go in this file.**

Exact commands are in Appendix E. File format of `secrets/demo-credentials.md` (generated):

```
# LeakProof demo pods (instance https://<ip>:7443). Shared accounts, reset nightly 04:00 and on request.
| pod | role | username | passphrase | recovery code |
| 1 | setter | p1-setter-a | word-word-word-word | word-word-word |
| 1 | exam cell | p1-examcell | ... | ... |
| 1 | key holder 1 | p1-hold-1 | ... | ... |
```

## 5. Operations calendar (assumes practice 18-25 Nov, official on 25 Nov night, video after; M1 = repo owner, M2 = VM lead, M3 = tests/docs. Adjust names)

| Day | M1 | M2 | M3 |
|---|---|---|---|
| Sat 14 | Add collaborators, branch rules, merge `ci.yml` and scripts PR | Key-only SSH, journald, loop volume, drop-ins (D.1-D.6), Caddy log | Write `check-secrets.sh`, `check-sec-tests.mjs`, review CI |
| Sun 15 | Merge round-5 fixes, tag `v0.9.1` | First `release.sh v0.9.1`; kill -9 and SIGSTOP test of the health timer; time rollback | Demo pods provisioned on a scratch run; guide draft |
| Mon 16 | Feature freeze 18:00; only P0 fixes | Dry-run clean-slate runbook twice, time it (target under 2 min) | Fix user guide: fingerprint, course code, demo file; smoke from a laptop |
| Tue 17 | 20:00 tag `v1.0.0`, tarball + SHA-256 | 21:00 deploy, `smoke.sh`, golden snapshots, off-VM key copy | 22:00 upload submission, protect or archive repo; 23:30 all three verify checksum |
| Wed 18 | Duty | 07:00 smoke; creds posted before 08:00 | Start incident log |
| Thu 19 - Tue 24 | Duty rota M1, M2, M3, M1, M2, M3. Duty = check at 09:00 and 21:00 (5-minute checklist below), triage reports within 12 h, log incidents | Backup | Backup |
| Wed 25 | Practice closes; export logs | Start official (night): `official-setup`, hand slips in person | Dry-run the exam night flow |
| 26-29 | Part B: incident log into classes, causes, lessons | Disable practice or leave read-only decision | Video |

Duty checklist: `systemctl is-active leakproof@practice leakproof@demo caddy`; `journalctl -t lp-health -p warning --since -12h`; `df -h /var/lib/leakproof /`; `bash deploy/smoke.sh https://<ip>:8443`; new incident rows.

Incident log template (one row per event; feeds Part B):

```
id | UTC time | detected by (timer/duty/classmate) | what happened (symptom) | evidence (journal/access-log excerpt, bug report id) | class (auth, rate limit, injection, DoS-adjacent, availability, usability, other) | root cause | action taken (none/restart/reset/rebut) | downtime (min) | data lost? | report Valid/Invalid + rebuttal | lesson
```

Risks and owners:

| Risk | Owner | Mitigation |
|---|---|---|
| Bad deploy at freeze | M2 | Dry runs, rollback, `v1.0.0` tarball independent copy |
| Practice DB filled / 2000 accounts used | M2 | Loop volume, disk alert, reset runbook |
| SSH brute force or password reuse | M2 | Key-only SSH, `hashlimit` |
| A team member's laptop or GitHub account compromised | M1 | 2FA, no VM secrets in GitHub |
| Key files lost or leaked | M2 | Off-VM encrypted copy; never in git (CI check) |
| Demo accounts re-passphrased | M3 | Nightly restore, guide wording |
| Official restarted mid-exam | all | Alert-only rule, written in runbook |
| Nobody on duty / on leave | M1 | Rota with backup, shared chat |
| Rebuttals missed (marks) | M3 | Triage in 12 h, log each report |

---

# Appendices (copy-pasteable)

## A. `.github/workflows/ci.yml`

```yaml
name: ci
on:
  push: { branches: [main], tags: ['v*'] }
  pull_request: { branches: [main] }
permissions: { contents: read }
concurrency: { group: "ci-${{ github.ref }}", cancel-in-progress: true }
defaults: { run: { shell: bash } }   # bash -eo pipefail
jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - name: Secrets and forbidden files
        run: bash scripts/check-secrets.sh
      - name: Syntax check of browser code
        run: for f in public/*.js; do node --check "$f"; done
      - name: SECURITY.md cites only tests that exist
        run: node scripts/check-sec-tests.mjs
      - name: Tests (52 expected)
        run: |
          npm test 2>&1 | tee test.log
          awk '/^ℹ pass /{p=$3} /^ℹ fail /{f=$3} END{exit !(p>=52 && f==0)}' test.log
```

`scripts/check-secrets.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
bad=0
if git ls-files | grep -E '(^|/)(data/|.*\.(key|db|db-wal|db-shm|pem|env)$|secrets/)' | grep -v '\.example'; then echo 'forbidden file tracked'; bad=1; fi
if git grep -nIE -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e '(^|[^0-9a-fA-F])[0-9a-fA-F]{64}([^0-9a-fA-F]|$)' -- . ':!tests' ':!*.lock' ':!SECURITY.md' ':!docs'; then echo 'possible key material'; bad=1; fi
if git grep -nIE 'passphrase: [a-z]+-[a-z]+-[a-z]+' -- . ':!tests' ':!docs'; then echo 'possible credential'; bad=1; fi
exit $bad
```

(The 64-hex rule may flag test vectors or public-key text in `public/`; run it once locally and add paths to the exclusion list. Unverified against the snapshot.)

`scripts/check-sec-tests.mjs` is the script I ran: it takes the last column of the tables in SECURITY.md sections 1-2, strips a trailing `…`, and requires each backticked name to be a substring of some `test('…')` title.

```js
import fs from 'node:fs';
const md = fs.readFileSync('SECURITY.md', 'utf8').split(/^## 3\./m)[0];
const titles = fs.readdirSync('tests').filter((f) => f.endsWith('.test.mjs'))
  .flatMap((f) => [...fs.readFileSync(`tests/${f}`, 'utf8').matchAll(/\btest\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]));
let bad = 0, n = 0;
for (const row of md.split('\n').filter((l) => /^\|/.test(l) && !/^\|[-| ]+\|$/.test(l))) {
  const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
  if (/^(ID|Valid bug)/.test(cells[0])) continue;
  for (const m of cells[cells.length - 1].matchAll(/`([^`]+)`/g)) {
    const name = m[1].replace(/…$|\.\.\.$/, '').trim(); n++;
    if (!titles.some((t) => t.includes(name))) { console.error(`MISSING test for "${cells[0].slice(0, 30)}": ${name}`); bad++; }
  }
}
console.log(`${n} cited test names, ${bad} missing`); process.exit(bad ? 1 : 0);
```

## C. Releases: layout, `release.sh`, `rollback.sh`

Layout: `/srv/leakproof/releases/<tag>/` (code, root-owned read-only, no data), `/srv/leakproof/current` -> symlink, `/srv/leakproof/dist/` (tarball + SHA256SUMS). Data stays in `/var/lib/leakproof/<inst>`, keys in `/etc/leakproof/<inst>`, so a release never touches state.

### C.1 One-time bootstrap (replace the rsync part of `install.sh`; do this before 17 Nov)

Edit `deploy/leakproof@.service`: `WorkingDirectory=/srv/leakproof/current` and `ExecStartPre=+/bin/bash /srv/leakproof/current/deploy/firewall.sh`. In `install.sh`, delete the `rsync` and `chown -R` lines and add `demo` to the `for inst in practice official` loop. First migration (run once, interactive sudo):

```bash
sudo install -d -o root -g root -m 0755 /srv/leakproof/releases /srv/leakproof/dist
sudo systemctl stop leakproof@practice
sudo mv /srv/leakproof /srv/leakproof.old && sudo install -d -m 0755 /srv/leakproof && sudo mv /srv/leakproof.old /srv/leakproof/releases/legacy
sudo ln -sfn /srv/leakproof/releases/legacy /srv/leakproof/current
# then run release.sh v0.9.1 below, which starts the service again
```

### C.2 `deploy/release.sh` (run as `sudo bash ~/leakproof/deploy/release.sh v0.9.1`)

```bash
#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
TAG="${1:?usage: release.sh <tag>}"; [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo bad tag; exit 2; }
REPO="${REPO:-/home/iiitd/leakproof}"; R=/srv/leakproof; INST="${INST:-practice}"
VM_IP="${VM_IP:-$(hostname -I | awk '{print $1}')}"
U="${SUDO_USER:-iiitd}"
sudo -u "$U" git -C "$REPO" fetch --tags --prune origin
[ -z "$(sudo -u "$U" git -C "$REPO" status --porcelain)" ] || { echo "VM working copy is dirty; refusing"; exit 1; }
git -C "$REPO" merge-base --is-ancestor "$TAG" origin/main || { echo "$TAG is not on origin/main"; exit 1; }
[ ! -e "$R/releases/$TAG" ] || { echo "$TAG already exists (releases are immutable)"; exit 1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
git -C "$REPO" archive --format=tar --prefix=r/ "$TAG" | tar -x -C "$T"
chown -R "$U" "$T"; (cd "$T/r" && sudo -u "$U" npm test >/dev/null) || { echo "tests failed, not deploying"; exit 1; }
cp -a "$T/r" "$R/releases/$TAG"; chown -R root:root "$R/releases/$TAG"; chmod -R a-w,a+rX "$R/releases/$TAG"
PREV="$(readlink -f "$R/current" || true)"; echo "$PREV" > "$R/previous"
ln -sfn "$R/releases/$TAG" "$R/current.new" && mv -Tf "$R/current.new" "$R/current"   # atomic switch
install -m 0644 "$R/current/deploy/leakproof@.service" /etc/systemd/system/leakproof@.service
sed "s/__VM_IP__/$VM_IP/g" "$R/current/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null && systemctl reload caddy
systemctl daemon-reload
systemctl restart "leakproof@$INST"           # never touches official
for _ in $(seq 1 20); do curl -fsk "https://$VM_IP:8443/healthz" >/dev/null && ok=1 && break; sleep 1; done
if [ -z "${ok:-}" ]; then echo "health check failed: rolling back to $PREV"; bash "$R/current/deploy/rollback.sh" || bash "$R/rollback-bootstrap.sh"; exit 1; fi
sha256sum "$R/releases/$TAG/server.mjs"; echo "deployed $TAG to $INST"
```

Note: it only restarts the instance named in `INST` (default practice). Releasing to official is a separate, deliberate command (`INST=official`) never run during an exam. Because it restarts the service, tell testers (restart clears sessions' in-memory limiter and locks any open paper).

### C.3 Rollback in one command

```bash
# /srv/leakproof/rollback.sh  (copy it out of the repo once so it works even if current is broken)
sudo bash -c 'P=$(cat /srv/leakproof/previous) && ln -sfn "$P" /srv/leakproof/current.new && mv -Tf /srv/leakproof/current.new /srv/leakproof/current && systemctl restart leakproof@practice && curl -fsk https://127.0.0.1:8443/healthz'
```

Schema note: rollback is safe only while releases are database-compatible. The only migration in the snapshot is the additive `must_change` column (`db.mjs`), so v0.9.x to v1.0.0 is safe either way if no new column is added.

### C.4 Release checklist

1. CI green on `main` at the tag commit. 2. `git tag -a vX -m ...` (sign if keys exist), push tag. 3. Working copy on VM clean. 4. `release.sh vX`. 5. `bash deploy/smoke.sh https://<ip>:8443` from a laptop: 0 failures. 6. Certificate fingerprint unchanged (guide still correct). 7. Golden snapshot taken (E.3). 8. Announce in chat: tag, time, SHA-256 of tarball. 9. For `v1.0.0`: `git archive --format=tar.gz --prefix=leakproof-v1.0.0/ v1.0.0 > leakproof-v1.0.0.tar.gz; sha256sum leakproof-v1.0.0.tar.gz > SHA256SUMS`; copy to `/srv/leakproof/dist/`.

## D. Watchdog and ops artefacts

D.1 Drop-in `/etc/systemd/system/leakproof@practice.service.d/10-ops.conf` (and the same file under `leakproof@demo.service.d`):

```ini
[Unit]
StartLimitIntervalSec=0
[Service]
Restart=always
RestartSec=3
MemoryHigh=400M
CPUQuota=300%
LimitCORE=0
TimeoutStopSec=10
```

`leakproof@official.service.d/10-ops.conf`: same but without `StartLimitIntervalSec=0` is acceptable; do not add any timer that restarts it. Caddy: `/etc/systemd/system/caddy.service.d/10-restart.conf` with `[Service]\nRestart=always\nRestartSec=3`. Then `sudo systemctl daemon-reload`. Check: `systemctl show leakproof@practice -p Restart -p MemoryHigh`.

D.2 `/usr/local/sbin/lp-health.sh` (root, 0755):

```bash
#!/usr/bin/env bash
# lp-health.sh <practice|demo|official> <port>.  Restarts practice/demo only; official is alert-only.
set -uo pipefail
I="$1"; P="$2"; S=/run/lp-health; mkdir -p "$S"; F="$S/$I.fails"; H="$S/$I.restarts"
systemctl is-active --quiet caddy || { logger -t lp-health -p user.err "caddy inactive, restarting"; systemctl restart caddy; }
systemctl is-active --quiet "leakproof@$I" || [ "$I" = official ] && true
body="$(curl -fs --max-time 5 "http://127.0.0.1:$P/healthz" 2>/dev/null || true)"
if grep -q '"ok":true' <<<"$body"; then echo 0 > "$F"; else
  n=$(( $(cat "$F" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$F"
  logger -t lp-health -p user.warning "$I healthz failed ($n)"
  if [ "$n" -ge 3 ]; then
    if [ "$I" = official ]; then logger -t lp-health -p user.crit "OFFICIAL unhealthy: NOT restarting, human decides"
    else
      now=$(date +%s); { cat "$H" 2>/dev/null; echo "$now"; } | awk -v n="$now" 'n-$1<3600' > "$H.new"; mv "$H.new" "$H"
      if [ "$(wc -l < "$H")" -le 4 ]; then logger -t lp-health -p user.err "restarting leakproof@$I"; systemctl restart "leakproof@$I"; echo 0 > "$F"
      else logger -t lp-health -p user.crit "$I restart budget used up, human needed"; fi
    fi
  fi
fi
pct=$(df --output=pcent /var/lib/leakproof | tail -1 | tr -dc 0-9); [ "$pct" -ge 85 ] && logger -t lp-health -p user.crit "disk ${pct}% used"
exit 0
```

(Remove the stray `systemctl is-active ... && true` line when copying; it is harmless but pointless.) `/etc/systemd/system/lp-health@.service`: `[Service]\nType=oneshot\nExecStart=/usr/local/sbin/lp-health.sh %i`. Instance names need ports; use three drop-in-free units instead: `ExecStart=/usr/local/sbin/lp-health.sh practice 8080`. `/etc/systemd/system/lp-health-practice.timer`: `[Timer]\nOnBootSec=60\nOnUnitActiveSec=30\nAccuracySec=1s\n[Install]\nWantedBy=timers.target`. Same for demo (7090) and official (9090). Enable: `sudo systemctl enable --now lp-health-practice.timer lp-health-demo.timer lp-health-official.timer`. A hang that does not answer `/healthz` is caught; a hang only on `/api` is not (unverified: healthz is cheap and shares the event loop, so a frozen loop fails it).

Test before 17 Nov: `sudo systemctl kill -s SIGSTOP leakproof@practice` (expect restart after about 90 s), `sudo systemctl kill -s SIGKILL leakproof@practice` (expect restart in 3 s).

D.3 journald `/etc/systemd/journald.conf.d/leakproof.conf`: `[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=14day\nRateLimitIntervalSec=30s\nRateLimitBurst=2000`, then `systemctl restart systemd-journald`.

D.4 Caddyfile addition (global options block, in the repo before freeze): 

```
log {
	output file /var/log/caddy/access.log {
		roll_size 50MiB
		roll_keep 5
		roll_keep_for 240h
	}
	format json
}
```

(Place it inside the existing global `{ }` as a `log` directive; run `caddy validate`. Unverified that the `caddy` user may write `/var/log/caddy`; the Debian package creates it.)

D.5 Optional capped data volume (stop the instance first; 2 GB):

```bash
sudo systemctl stop leakproof@practice
sudo mv /var/lib/leakproof/practice /var/lib/leakproof/practice.pre
sudo fallocate -l 2G /var/lib/lp-practice.img && sudo mkfs.ext4 -q /var/lib/lp-practice.img
sudo mkdir /var/lib/leakproof/practice && echo '/var/lib/lp-practice.img /var/lib/leakproof/practice ext4 loop,nosuid,nodev 0 2' | sudo tee -a /etc/fstab && sudo mount /var/lib/leakproof/practice
sudo cp -a /var/lib/leakproof/practice.pre/. /var/lib/leakproof/practice/ && sudo chown leakproof:leakproof /var/lib/leakproof/practice && sudo chmod 0700 /var/lib/leakproof/practice
sudo systemctl start leakproof@practice
```

D.6 SSH and firewall (keep a second SSH session open): copy your public key first, then `/etc/ssh/sshd_config.d/10-lp.conf`: `PasswordAuthentication no\nPermitRootLogin no\nMaxAuthTries 3\nLoginGraceTime 20`, `sudo sshd -t && sudo systemctl reload ssh`. Firewall: in `deploy/firewall.sh`, insert before the port-22 accept: `add -p tcp --dport 22 --syn -m hashlimit --hashlimit-above 6/min --hashlimit-mode srcip --hashlimit-name ssh -j DROP` and add 7443 to the web port lists and the connlimit rule (for the demo instance). `iptables-nft` supports hashlimit (unverified on the VM).

D.7 Backups `/usr/local/sbin/lp-backup.sh` (hourly timer, practice; keep 48):

```bash
#!/usr/bin/env bash
set -euo pipefail
D=/var/backups/leakproof; mkdir -p "$D"; chmod 0700 "$D"; f="$D/practice-$(date +%Y%m%d-%H%M).db"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/var/lib/leakproof/practice/leakproof.db',{readOnly:true});d.exec(\"VACUUM INTO '$f'\");d.close()" 2>/dev/null
chmod 0600 "$f"; ls -1t "$D"/practice-*.db | tail -n +49 | xargs -r rm --
```

Keys (once, and after any change): `sudo tar czf - /etc/leakproof | gpg -c > leakproof-keys.tgz.gpg`, then copy to a member laptop with `scp`.

## D.8 Clean-slate recovery runbook (target under 2 minutes; practice)

Pre-staged as `/usr/local/sbin/lp-reset-practice.sh` (root). Keys are kept (they live in `/etc/leakproof/practice`); a fresh DB is accepted because `loadKey` only refuses when keys are missing and data exists.

```bash
#!/usr/bin/env bash
set -euo pipefail
R=/srv/leakproof; INST=practice; TS=$(date +%Y%m%d-%H%M%S)
# 0. Verify the frozen release is intact (independent copy: extract from the tarball if not)
if ! (cd "$R/dist" && sha256sum -c --quiet SHA256SUMS); then echo "dist corrupt: restore tarball from laptop"; exit 1; fi
if [ ! -d "$R/releases/v1.0.0" ] || [ "${REBUILD:-0}" = 1 ]; then
  rm -rf "$R/releases/v1.0.0"; mkdir "$R/releases/v1.0.0"; tar xzf "$R/dist/leakproof-v1.0.0.tar.gz" -C "$R/releases/v1.0.0" --strip-components=1
  chown -R root:root "$R/releases/v1.0.0"; ln -sfn "$R/releases/v1.0.0" "$R/current.new"; mv -Tf "$R/current.new" "$R/current"
fi
# 1. Stop, move data aside (evidence, same filesystem so instant)
systemctl stop "leakproof@$INST"
mkdir -p /var/lib/leakproof/quarantine
mv "/var/lib/leakproof/$INST" "/var/lib/leakproof/quarantine/$INST-$TS" || { umount "/var/lib/leakproof/$INST"; }
install -d -o leakproof -g leakproof -m 0700 "/var/lib/leakproof/$INST"
# 2. Start empty; the course code in /etc/leakproof/practice.env is unchanged
systemctl start "leakproof@$INST"
for _ in $(seq 1 15); do curl -fs http://127.0.0.1:8080/healthz && break; sleep 1; done
echo; echo "reset done, old data in quarantine/$INST-$TS"
```

If the data volume (D.5) is full, `mv` of a mount point fails: the script's `umount` branch is wrong for that case; instead run `systemctl stop`, `umount /var/lib/leakproof/practice`, `mv /var/lib/lp-practice.img /var/lib/quarantine-$TS.img`, recreate (D.5), start. Test this branch once. Practice has no accounts to re-provision (self-registration with the unchanged course code). Re-announce: all practice accounts are gone, the 30-per-day registration counter also resets. For demo, see E.4. For official the answer is not a reset: it is restore from golden snapshot and a human decision.

## E. Demo provisioning (instance `demo`, pods)

E.1 One-time setup (as root; demo shares unit and Caddy, plus port 7443 in `firewall.sh` and Caddyfile):

```bash
sudo install -d -o leakproof -g leakproof -m 0700 /var/lib/leakproof/demo
sudo install -d -m 0700 /etc/leakproof/demo; for k in server.key log.key; do sudo sh -c "openssl rand -hex 32 > /etc/leakproof/demo/$k; chmod 0400 /etc/leakproof/demo/$k"; done
printf 'LP_INSTANCE=official\nLP_PORT=7090\n' | sudo tee /etc/leakproof/demo.env && sudo chmod 0640 /etc/leakproof/demo.env
```

`EnvironmentFile` overrides `Environment=LP_INSTANCE=%i` per systemd.exec (unverified here). Check after start: `curl -fsk https://127.0.0.1:7443/healthz` must show `"instance":"official"`. Add to the Caddyfile: `https://__VM_IP__:7443 { import leakproof 127.0.0.1:7090 }`.

E.2 Pod JSON files, generated (window opens now, closes 29 Nov; `seatLimit` 40):

```bash
mkdir -p ~/secrets && for p in 1 2 3; do cat > ~/secrets/pod$p.json <<EOF
{ "title": "Demo pod $p: B.Tech CS core", "topics": ["Data Structures","Operating Systems","Databases","Computer Networks","Algorithms"],
  "window": { "start": "2026-11-18T00:00:00+05:30", "end": "2026-11-29T23:00:00+05:30" }, "seatLimit": 40,
  "people": [
    { "username": "p$p-setter-a", "display": "Setter A", "caps": ["submit"] },
    { "username": "p$p-setter-b", "display": "Setter B", "caps": ["submit"] },
    { "username": "p$p-examcell", "display": "Exam cell", "caps": ["run","print"] },
    { "username": "p$p-hold-1", "display": "Key holder 1", "caps": ["hold"] },
    { "username": "p$p-hold-2", "display": "Key holder 2", "caps": ["hold"] },
    { "username": "p$p-hold-3", "display": "Key holder 3", "caps": ["hold"] },
    { "username": "p$p-hold-4", "display": "Key holder 4", "caps": ["hold"] },
    { "username": "p$p-hold-5", "display": "Key holder 5", "caps": ["hold"] } ] }
EOF
done
```

E.3 Run once (service stopped), capture, clear `must_change`, snapshot:

```bash
sudo systemctl stop leakproof@demo
cd /srv/leakproof/current
for p in 1 2 3; do sudo env LP_INSTANCE=official LP_DATA_DIR=/var/lib/leakproof/demo LP_KEY_DIR=/etc/leakproof/demo node --disable-warning=ExperimentalWarning scripts/official-setup.mjs ~/secrets/pod$p.json; done | sudo tee /root/demo-setup.out >/dev/null
sudo node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/var/lib/leakproof/demo/leakproof.db');d.exec('UPDATE accounts SET must_change=0');d.close()"
sudo chown -R leakproof:leakproof /var/lib/leakproof/demo
# credentials file
sudo awk 'BEGIN{print "| role | username | passphrase | recovery code |\n|---|---|---|---|"} /^[A-Z].*\(/{r=$0} /username:/{u=$2} /passphrase:/{p=$2} /recovery code:/{print "| " r " | " u " | " p " | " $3 " |"}' /root/demo-setup.out | sudo tee ~/secrets/demo-credentials.md >/dev/null
sudo chmod 0600 ~/secrets/demo-credentials.md /root/demo-setup.out
# golden snapshot (data only; keys unchanged under /etc)
sudo tar czf /var/backups/leakproof/golden-demo.tgz -C /var/lib/leakproof demo && sudo chmod 0600 /var/backups/leakproof/golden-demo.tgz
sudo systemctl start leakproof@demo
```

The setup script's output has `username:`, `passphrase:` and `recovery code:` lines under a header line `Display (caps)`; the `awk` above relies on that exact format (read from `official-setup.mjs`, not run). The `$3` for the recovery code assumes a single token only for a one-word code, but generated codes are three hyphen-joined words, so `$3` is the whole code. Delete `/root/demo-setup.out` after copying it to a laptop. Do not run this for the real official exam: there leave `must_change` as is.

E.4 Re-runnable after a reset (nightly 04:00 via a timer, or on demand):

```bash
sudo systemctl stop leakproof@demo
sudo mv /var/lib/leakproof/demo /var/lib/leakproof/quarantine/demo-$(date +%Y%m%d-%H%M%S)
sudo tar xzf /var/backups/leakproof/golden-demo.tgz -C /var/lib/leakproof
sudo systemctl start leakproof@demo && curl -fsk https://127.0.0.1:7443/healthz
```

The same credentials work again. If the golden snapshot is lost, re-run E.3 (new random passphrases) and repost the file. The user guide must state: practice = self-registration with the course code; demo = shared pods, honour system (one group per pod), reset nightly, passphrases may be changed by others.

## F. Appendix: assumptions I could not verify

VM outbound internet; GitHub plan; `sqlite3` CLI absent (hence `node:sqlite`); `hashlimit` availability; systemd `EnvironmentFile` precedence; the VM repo's `CLAUDE.md` and `COORDINATION.md` contents; the VM's free disk space; whether Caddy's log directory is writable.
