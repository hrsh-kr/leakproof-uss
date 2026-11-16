# T5: recovery, durability, low-rate resource exhaustion (Round 5)

Tester T5, ports 8850-8859, copy of the snapshot, Node 25.0.0 on macOS (VM runs Node 22: absolute times will differ, ratios will not). Everything below was run unless marked "unverified". Scripts are in `/private/tmp/claude-501/-Users-hrshkr-Downloads-sem8-uss/29dd3dd2-a7a9-4bdd-b465-6e19cbfa674a/scratchpad/t5/` (rec1, fi, corrupt, ro, cost, avail, logv, mem, wd .mjs; runbook.sh). No load above ~300 requests per test.

## Verdict
Crash recovery is good: every kill point I could hit left the database atomic. The weak spots are (1) unbounded log growth that makes the unauthenticated public verify freeze the event loop, (2) a `/healthz` that stays green when the app is broken, (3) no integrity checks at boot.

## Findings (ranked by marks impact)

| ID | Title | Class | Sev | Evidence | Smallest fix | Conf |
|---|---|---|---|---|---|---|
| T5-1 | Log grows without bound per copy fetch; public verify is a synchronous full walk | resource exhaustion | high (practice) | `exams.copy` appends a row on every fetch (`exam.mjs` copy()); measured 1 row/fetch, ~180 B/row, 0.4 ms/op, so the 600 req/min/IP global limit allows ~860k rows/day/IP. `log.verify` is sync: 4.7 ms per 1000 rows (300k rows 1.4 s; 100k rows once 3.1 s under load). The 30 s cache is refreshed by any anonymous `GET /api/public/log/:id` or `check-head`. Log is append-only by trigger, so rows cannot be pruned. | Log reprints only for the first 3 fetches per seat (`copies.fetches`), and verify incrementally (remember last verified seq and hash, walk only new rows). | high (cost measured, projection extrapolated) |
| T5-2 | `/healthz` is a constant; hang, read-only disk, deleted DB and wrong log key all look healthy | recovery/monitoring | high | SIGSTOP: healthz times out, but systemd sees `running` (Type=simple, no WatchdogSec) so it is never restarted. Read-only data dir: process up, healthz 200, login and register return 500. DB files unlinked while running: healthz 200, writes "work" into the deleted inode, after restart the accounts are gone (login 401). | Make `/healthz` do `SELECT 1` plus a write probe; add a VM timer (script below). | high |
| T5-3 | No integrity check at boot; S13 covers only a missing key | durability | med | Wrong but well-formed `log.key`: boots, healthz 200, public chain `{"ok":false,"brokenAt":1}` forever. Wrong `server.key`: boots. DB deleted, keys kept: silently starts empty. 4 KB of a DB page overwritten: boots, no error. Truncated DB or destroyed header: exits with an SQLite message (good). Edited log row: public verify flags it within 30 s (good), healthz stays 200. | At boot: `PRAGMA quick_check` and `log.verify()`; refuse (or serve a degraded 503 healthz) on failure; refuse if the keys exist but the DB has no rows and a `.db-wal` or backup exists. | high |
| T5-4 | Crash right after seal leaves the pool ciphertexts in `-wal` | durability | low | Fault injection (self-SIGKILL after COMMIT, before `checkpoint`): 40 of 40 pool ciphertexts found in `leakproof.db-wal` (272 KB), still there after restart; normal seal: 0 found. Ciphertext only (server key), not plaintext. | `checkpoint(db)` at the end of `openDb`. | high |
| T5-5 | `opened` papers never evicted; practice memory reachable from many accounts | memory | med | 99 KB heap per fully printed 60-seat exam (40 exams: +4.1 MB heap, +38 MB RSS). Needs 8 "sensitive" calls per exam, limit 20/min/account, so ~2.5 exams/min/account. | Evict `opened` when the window ends; cap opened exams per instance. | med |
| T5-6 | `sessions` rows are never swept; no busy timeout | hygiene | low | Each valid login adds a row (+9 KB incl. WAL); deleted only when presented again. While another process held a write lock: register, login returned 500 in 50-100 ms (no `busy_timeout`). A second server on the same dir started and wrote without complaint. | `DELETE FROM sessions WHERE seen < ?` at start; `PRAGMA busy_timeout=3000`. | high |

## Recovery results (all `PRAGMA integrity_check` = ok)

| Scenario | Result |
|---|---|
| SIGKILL while sealing, delay swept 0-15 ms (6 runs) | Always fully SEALED (5 cards, 0 pool rows with ciphertext, 43 log rows) or untouched; 2 runs had the response lost, so the user sees a reset, the exam is sealed, a retry says "already sealed". Sessions survive. |
| Self-SIGKILL inside the seal transaction (after cards, after pool delete) | Rolled back completely: COLLECTING, 40 questions intact, 0 cards, log 42 rows, re-seal works (200), chain ok. |
| Self-SIGKILL inside openPaper transaction | 3 approvals kept, release marked `interrupted`, exam stays SEALED, re-request and 3 new approvals reopens. |
| SIGKILL with the paper OPEN | Exam RELEASED, copies refused with "locked again", release `interrupted`, a new release request is accepted. Message is clear. |
| Kill during 12 parallel registrations; inside the registration tx | 7 complete, 0 orphan accounts/sims; mid-tx: 0 accounts, 0 exams, same username registers afterwards. |
| In-flight login killed | Client sees a reset; login and old session work after restart. |
| Restart time | 56-58 ms to `/healthz`; systemd `RestartSec=2` dominates. |
| Missing `server.key` / `log.key` | S13 refusal, exit 1, no new key written. Garbage or empty key: exit 1. |
| Read-only data dir | Boots (see T5-2). DB write-locked by another process: boots, writes 500 until released, then recovers. |
| WAL | Registration fills the WAL to ~4 MB and it stays at that size (no truncate except seal/verify). A pinned reader grew it to 13 MB; the app has no long readers. Deleting `-wal` after SIGKILL lost nothing here because the checkpoint had run (unverified for un-checkpointed data). |

## Per-operation cost (in-process, 1 core, includes SQLite writes)

| Operation | CPU/op | Disk/op (db+wal) | Rows added |
|---|---|---|---|
| register | 90 ms (2x scrypt, 32 MiB each) | 142 KB | 1 acct + 4 sims, 1 exam, 40 questions, 12 assignments, 1 session, 42 log |
| login | 48 ms | 9 KB | 1 session |
| recover | 140 ms | 17 KB | 0 |
| practice reset (max 10 exams/account) | 2.7 ms (no scrypt) | 147 KB | 4 sims, 40 questions, 41 log |
| seal | 2 ms | negative (WAL truncated) | 1 log |
| copy / reprint / key / trace (60 seats) | 0.4-1.1 ms | 10-18 KB | 1 log (copy, key), trace 8000 chars: 0.5 ms |

Trace on 60 seats with adversarial text is not an issue (8000-char cap, 0.5-1 ms). Log verify: see T5-1.

## Projection: hostile classmates within `config.mjs` limits

- One IP: 30 registrations/day. 15 IPs x 7 days = 3150 attempts, above `maxAccounts` 2000, hit after ~4.4 days: honest users then get 503 "Practice is full". **This is the first limit reached** (before disk, RAM or CPU). Fix: `registerPerIp` 30 to 5.
- Disk: 2000 accounts x 142 KB = 284 MB; with 10 resets each, 2000 x 1.6 MB = ~3 GB. Disk size of the VM is unknown (unverified).
- Log: 2000 accounts x (42 + 9 x 41) = ~820k rows, so a verify of ~4 s of frozen event loop every 30 s (13% of time). With copy reprints (T5-1) 5 hostile accounts add 4M rows/day: verify >20 s, effectively down within two days, and not repairable without wiping the DB.
- RAM: baseline RSS 100-155 MB; scrypt threadpool of 4 x 32 MiB = 128 MB transient. Opened exams: 15 attackers x 30 accounts x 10 exams = 4500 x 99 KB = 450 MB heap, near `MemoryMax=512M` (OOM kill, then Restart=always clears memory; data survives).
- CPU: scrypt capacity ~4 threads / 48 ms = ~5000 logins/min; limits allow 30/min/IP, so 15 IPs use ~9%. Not reachable.
- Maps: limiter capped at 50k keys (evicts oldest), `failures` cleared at 50k, `pending`/`wrongWords` dropped on decision or replacement (expired partial approvals linger until restart, KBs), `opened` unbounded (T5-5), sessions unbounded (T5-6).

## Availability under legal hostile traffic (X-Real-IP, LP_TRUST_PROXY=1)
20 source addresses, 300 wrong logins in 12 s (181 answered 429 by backoff): `/healthz` p50 0.7 ms, p99 2.7 ms, max 4.5 ms (idle: 0.8/4.9/4.9). scrypt runs on the thread pool, so the loop stays free. A single IP got 5 x 401 then 30 x 429. The thing that does freeze the loop is T5-1 (sync verify). Caddy sets `X-Real-IP` from `{remote_host}` so clients cannot choose their bucket (Caddyfile; Caddy not installed here, unverified).

## Watchdog options with evidence

| Failure | Does `Restart=always` fix it? | Does `/healthz` notice? | Signal to test |
|---|---|---|---|
| Crash / OOM | yes, 2 s + 56 ms | n/a | `systemctl is-active` |
| Hang (SIGSTOP, loop blocked) | no (no WatchdogSec, Type=simple) | yes, timeout | https healthz with 3 s timeout, then `systemctl restart` |
| Overload | n/a | yes only if loop is blocked (T5-1) | latency of healthz |
| Full / read-only disk | no | **no** (200) | write probe, `df` |
| DB deleted / wrong key / corrupt | no | **no** | deep health (T5-2/3) |
| Caddy down | no, separate unit | app-side 8080 fine | check `https://VM:8443/healthz` from the VM, not 8080 |
| Expired TLS cert (`tls internal`) | no | `curl -k` hides it | `openssl s_client ... \| openssl x509 -noout -enddate` with 7-day margin (Caddy renewal behaviour unverified) |

Recommended: a systemd timer every 30 s running the script below, restarting the unit after 2 consecutive failures; nothing in the app needs to change except the deep `/healthz`.

```bash
#!/usr/bin/env bash   # /usr/local/bin/lp-health.sh (VM), run by a timer as root
U=https://127.0.0.1:8443; fails=/run/lp-fails
ok=1
curl -fsk --max-time 3 "$U/healthz" | grep -q '"ok":true' || ok=0
[ "$(df --output=pcent /var/lib/leakproof | tail -1 | tr -dc 0-9)" -lt 90 ] || ok=0
d=$(echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -checkend 604800) || ok=0
systemctl is-active --quiet caddy || ok=0
if [ $ok = 1 ]; then rm -f $fails; else n=$(( $(cat $fails 2>/dev/null || echo 0) + 1 )); echo $n > $fails; logger -t lp-health "fail $n"; [ $n -ge 2 ] && systemctl restart leakproof@practice; fi
```

## Clean-slate rebuild (rehearsed with `runbook.sh`, local)
Timings: code copy 0.02 s, `npm test` 12.8 s, server answering 0.09 s after start, demo registration 0.1 s, `official-setup.mjs` 0.8 s for 8 accounts + 1 exam. Whole thing ~14 s locally; on the VM add `apt`/Caddy, `install.sh` (runs the tests too) and the 20 s health loop, so budget ~2-3 minutes (unverified).
Must be re-provisioned: keys (auto: `openssl rand` in install.sh; a restored DB needs the old keys), practice invite code (random per install, printed once, goes into USER_GUIDE), certificate fingerprint (regenerates, goes into USER_GUIDE), all practice accounts and their one-time passphrases, official accounts (`official-setup.mjs` prints slips once, `must_change` forces a new passphrase), demo credentials for every role, the official exam and its window (example JSON has 26 Nov), then cards must be saved again and the exam sealed. Backups: copy `/var/lib/leakproof/*` together with `/etc/leakproof/*/*.key`; a DB without its keys is dead (T5-3 shows the refusal), keys without DB start empty silently.

## Appendix: commands
`node rec1.mjs` (kill sweep), `node fi.mjs` (code-fi copy with `process.kill(process.pid,"SIGKILL")` injected at 5 points), `node walleak.mjs`, `node corrupt.mjs`, `node ro.mjs`, `node cost.mjs`, `node avail.mjs`, `node logv.mjs` (20k/100k/300k rows: 280/472/1422 ms), `node --expose-gc mem.mjs`, `node wd.mjs` (SIGSTOP: `FAIL TimeoutError after 2002ms`; unlinked DB: healthz 200, login 200, then 401 after restart). All servers on ports 8850-8859 were killed.
