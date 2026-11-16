# C1: security architect / threat modeller, Round 5

Role-played lens. Read: README, SECURITY, USER_GUIDE, server.mjs, src/*, public/app.js (grepped for sinks, read the API/cards/poll parts), deploy/*, scripts/*, `docs/11_minimal_system.md`, Lecture 7 (recon, port scan, vuln scan, then password cracking, fault injection, recovery, pentest). Nothing was run against a live instance. "Unverified" marks every claim I only reasoned about. Tests were not re-run. Note: `fcs_bugs.csv` holds 1,635 reports (the "10k rows" are multi-line cells), 25 groups.

## 1. Attacker model, 18-25 Nov

| Persona | Goal | Capability | Tries first |
|---|---|---|---|
| P1 LAN black-box classmate | Any Valid report (+0.5 each) | Browser, curl, nmap, nikto/ZAP, Burp; no account | nmap the VM (22, 8443, 9443 open; 80/8080 filtered), cert warning, headers, `/.env`, `/api/*` unauthenticated, register flood, login brute force |
| P2 practice-account classmate | IDOR, privilege, CSRF, session, XSS, logic | Own account holds all roles on own exam; knows course code | Swap exam/release/seat ids, other user's exam id, replay after logout, CSRF without token, XSS in display/question text, tamper `slot`/`seats`/`seat`, seal early, trace without options |
| P3 holder of official role creds | Escalate role, bypass gates | One role (e.g. holder or setter) | Setter reads others' questions, holder approves without words, exam cell sees paper before quorum, 2nd card per account |
| P4 reads our source (GitHub or VM) | Find a crafted bug, hardcoded secret | Full code, `SECURITY.md` "limits" list | Limits section (veto, 14-bit words, restart re-lock, enumeration), `USS-PRACTICE` default code, `X-Real-IP` trust, log scans without index |
| P5 shares NAT with other testers | Lockout, rate-limit side effects | Same source IP as victims | Burn the 30/min auth bucket or 600/min global bucket, hit `connlimit 50`, get blamed for "unfair lockout" |

Cross-persona: any of them will file functional bugs too (flaky UI, cert warning, no password choice). Functional bugs were 262/757 Valid (35%) in FCS.

### What classmates filed (all 25 groups)
Crude keyword themes on category + impact text (overlapping, so counts do not sum). Total 1,635 reports, 613 Valid (37.5%); Security 351/878 Valid (40%), Functionality 262/757 (35%). Per-group Valid rate ranges 2% (G2) to 71% (G21); hardened groups (G2 2%, G7 6%, G12 9%, G3 12%) show what a clean target yields.

| Theme | Reports | Valid | Valid % |
|---|---|---|---|
| Feature/UI "does not work" | 682 | 279 | 41 |
| IDOR / other users' data / admin | 357 | 157 | 44 |
| DoS / crash / flood / large input | 286 | 134 | 47 (64% inside the "Denial of Service" category) |
| No verification, bot or mass sign-up | 270 | 117 | 43 |
| User enumeration / info disclosure / errors | 242 | 89 | 37 |
| HTTP/HTTPS, HSTS, headers, certificate | 227 | 106 | 47 |
| Brute force / no rate limit / lockout | 225 | 87 | 39 |
| Input validation | 166 | 49 | 30 |
| Session survives logout, token reuse | 122 | 56 | 46 |
| Forgot/reset password missing | 115 | 69 | **60** |
| Plaintext or weak hashing | 78 | 45 | **58** |
| XSS / HTML injection | 92 | 30 | 33 |
| CSRF | 47 | 21 | 45 |
| Weak password policy | 58 | 9 | 16 |
| SQL injection | 9 | 2 | 22 |

Lessons: staff reward "reproducible and in scope". DoS from one host, missing features and transport/header complaints are Valid about half the time. Password policy and SQLi are mostly Invalid.

### 15 reports we will most likely get
| # | Report | Our answer |
|---|---|---|
| 1 | Certificate warning / self-signed / "insecure" | Rebuttal (internal CA, fingerprint published). See D3: the published fingerprint may be wrong |
| 2 | Brute force login | Blocked (backoff per user+IP, 30/min per IP, 80-bit generated passphrase) |
| 3 | Mass or bot sign-up, no email verification | Rebuttal (course code, 30/day/IP, 2000 cap). Weak spot: 2000 cap can be filled from about 67 source addresses (IPv6 makes it cheaper, F2) |
| 4 | Username enumeration via register 409 | Rebuttal (stated, SECURITY s4, guide "works as designed") |
| 5 | IDOR on exam, release, seat, question ids | Blocked (404 without capability; tests) |
| 6 | Session valid after logout / after passphrase change | Blocked (server-side delete; other sessions deleted) |
| 7 | CSRF on state change | Blocked (token + Origin; SameSite=Strict) |
| 8 | XSS in display name, question text | Blocked (`textContent`, CSP without inline) |
| 9 | Single-host DoS (slowloris, large body, many requests) | Mostly blocked (10 s header timeout, 16 KB cap, 429s). Vulnerable at the margin: public log O(N) scan (F3) |
| 10 | Rate limit locks other users on shared network | Rebuttal (NAT-friendly design stated; but P5 can burn the shared bucket) |
| 11 | No HTTP redirect on port 80 / HTTP not served | Rebuttal (HTTPS only, port 80 dropped by design; smoke asserts closed) |
| 12 | Missing security headers on some responses (Caddy 502/413/408, official port 9443 returns 502 while off) | Rebuttal; low (F8) |
| 13 | Cannot choose own password; no MFA/TOTP | Rebuttal (generated 80-bit passphrase; TOTP cut with reasons) |
| 14 | Trace gives several seats / wrong seat | Answerable by rebuttal only if options are included; vulnerable if the tester pastes questions without options (SR9 check) |
| 15 | Server restart re-locks paper, one holder vetoes, 14-bit words | Rebuttal (documented design). Open ports 22 / SSH reports: out of scope (VM host) but they will file them |

## 2. STRIDE per component

| Component | S | T | R | I | D | E | Residual |
|---|---|---|---|---|---|---|---|
| Browser client | Fake page cannot steal cookie (HttpOnly, `__Host-`) | Card file edited: GCM rejects | Not needed | Card passphrase stays local; share POSTed on approve over TLS | Client polls 5/10 s; NAT of 10 testers is about 3 req/s well under 600/min, fine | Malicious VM operator could ship altered JS (stated) | Low |
| Caddy | IP cert from internal CA; leaf lifetime short (D3) | h1 only, body cap 32 KB | Caddy access log not enabled (no audit of client IPs) | `-Server` | Timeouts set; no Caddy-level rate limit; 502 pages | Runs as `caddy`; VM root equals game over | Med: cert fingerprint story |
| Node | `X-Real-IP` trusted only from loopback | JSON schema, parameterised SQL | Keyed log | Errors by ref code; `console.error` logs messages to journal | Sync log verify, no log index, scrypt on pool, `maxConnections` 1000 | `uncaughtException` not handled: crash re-locks paper (Restart=always) | Med: F3 |
| SQLite | File 0600 owned by `leakproof` | Triggers block UPDATE/DELETE on log; a DB writer can drop triggers but chain is keyed | Log | Paper ciphertext, wrapped shares (server key) | WAL grows; no purge of sessions or releases | Anyone with `leakproof` uid reads DB, but not keys | Low |
| Key files | Root 0400 hex, delivered via `LoadCredential` | Missing key refuses start | n/a | Not in git (.gitignore not in snapshot listing: verify `data/`, `*.key` ignore exists in the repo) | Key loss bricks data; no backup procedure | Root only | Med: no backup |
| systemd | Unit installed by root | Unit hardened but minimal | journald | PrivateTmp/ProtectHome | MemoryMax 512M, Restart=always | `ExecStartPre=+` runs a leakproof-owned script as root (D2) | Med |
| Firewall | n/a | Rules appended, not flushed | no logging of drops | Hides 80/8080/9090 | `connlimit` per /32; policy DROP lockout risk (D1) | iptables-nft vs ufw (D1) | Med |
| Deploy scripts | `install.sh` needs sudo; builds on SUDO_USER | `rsync --delete` into `/srv`; tests as gate | Output only | Prints invite code and fingerprint | Test gate can block a hotfix | root runs repo files | Low |

## 3. SR1-SR12 claim check (SECURITY.md)

| SR | Verdict | Evidence |
|---|---|---|
| SR1 | True | Route table `app.mjs:148-268`; cap check `app.mjs:310-316` returns 404; params regex line 291. Nit: any dot-less path serves index with 200 (`app.mjs:279`), `/healthz` names the instance |
| SR2 | True | scrypt `crypto.mjs:30-42`; `__Host-` flags `app.mjs:18-19`; idle/absolute `app.mjs:34`; backoff per `user|ip` (`app.mjs:153`, `fail` line 93). Nit: backoff map is in memory and cleared at 50k keys; sessions are never purged (growth, harmless) |
| SR2b | True | `must_change` gate `app.mjs:308`; passphrase endpoint 206-223. Nit: the printed recovery code also works until used, same operator-trust limit as the passphrase (stated in s4 only for the passphrase) |
| SR3 | True | AAD binds exam+question `exam.mjs:83`; `myQuestions` filters by setter |
| SR4 | True | Wrapped share set to NULL at verify `exam.mjs:175`; MIN_VERIFIED=4 line 206; shares wiped `drop`/`openPaper` finally. Caveat already stated: before verify the server can open the paper |
| SR5 | True, with a nit | Gates at request (200-206); words bound (187); 5 tries (263). Nit: window is not rechecked at `decide`/`openPaper`; approvals up to 15 min later can open the paper after the window closes, but `copy` rechecks (335) |
| SR6 | Partly | Keyed chain `log.mjs:15`; start-up refusal `config.mjs:35`. Tail truncation by someone who can drop the triggers is only caught by a printed head (stated). The "within 30 s" detection only runs when someone calls the public endpoint |
| SR7 | Partly | Pool ciphertext nulled `exam.mjs:149`, WAL truncated. True at file level (tested with a canary); block-level remnants on the filesystem are not covered; the paper itself stays encrypted (by design) |
| SR8 | True | `draw` deterministic; `seedReveal` 397-402 |
| SR9 | Partly | Adjacent-seat rule 322 is true. "A 3-question fragment names its seat": `trace` returns a list `matches` (line 383-390); with questions only and no options, `isSubsequence([],..)` is true so several seats match (my estimate: about 1% per seat per 3 of 10 questions, so a 60-seat hall is ambiguous about half the time; unverified by running). With options included it is specific |
| SR10 | True | Parameterised SQL; 415 only when body non-empty (`http.mjs:41-42`); static map from `readdirSync` (`http.mjs:65-72`); no innerHTML/eval/localStorage in `app.js` (grep) |
| SR11 | Mostly true | 500 returns ref code (`app.mjs:326-328`). Caddy-generated errors carry no app headers; messages go to journal |
| SR12 | True | Note text in `trace`; public log stores only the count |

Other claims: SECURITY s2 "re-verifies the chain at most every 30 s, so it costs the same however long the log grows" is **false**: `verify()` walks every row synchronously (`log.mjs:25-32`); frequency is bounded, cost is O(N) and blocks the event loop. Also `recent`, `countFor`, `has` filter `exam_id` with no index (`db.ts` schema, `db.mjs:41-43`), so the unauthenticated `/api/public/log/:id` and every card fetch scan the whole log. README says 51 tests, task says 52 (doc nit).

## 4. Deploy hardening review

| ID | File | Issue | Severity |
|---|---|---|---|
| D1 | `firewall.sh` | Uses `iptables` (Ubuntu 24.04 maps it to nft; the `iptables` package may be absent on a minimal image: check `command -v iptables`). If `ufw` is active its chains run first and may drop 8443. Policy DROP with only established, 22, 8443, 9443, ICMP: DHCP/DHCPv6 renewals on a DHCP VM could break, so keep console access. A failing script blocks service start (ExecStartPre) = outage. `iptables -A` appends after existing rules. Counts work: `--syn` + `connlimit --mask 32` per source. IPv6 has no connlimit | Med |
| D2 | `leakproof@.service` + `install.sh:18` | `ExecStartPre=+` runs `/srv/leakproof/deploy/firewall.sh` as root but `chown -R leakproof` makes it writable by the service user. `ProtectSystem=strict` keeps `/srv` read-only inside the unit, but any other `leakproof`-uid code path becomes root at next start | Med |
| D3 | `Caddyfile` / `install.sh:51` | Caddy's internal CA issues short-lived leaf certificates (default about 12 h, from my knowledge of Caddy; unverified here). The fingerprint printed by `install.sh` is the leaf, so the value in the guide goes stale in hours and testers who check it see a mismatch. Publish the root CA fingerprint (`/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`) or set a longer `lifetime` | Med |
| D4 | unit | `%d` in `Environment=` and `%i` in `LoadCredential` are valid on systemd 255 (Ubuntu 24.04). SQLite WAL works: data dir is the only RW path and holds `-wal`/`-shm`; `PrivateTmp` is fine. Missing hardening: `CapabilityBoundingSet=`, `RestrictNamespaces`, `LockPersonality`, `ProtectKernelModules`, `RestrictSUIDSGID`, `UMask=0077`. Do not add `MemoryDenyWriteExecute` (V8 JIT) | Low |
| D5 | unit | `ExecStart=/usr/bin/node`, `ProtectHome=yes`: if node came from nvm in a home directory it fails with 203/EXEC. `install.sh:12` runs `sudo -u $SUDO_USER npm test`, and sudo's PATH may not find an nvm npm. Check `command -v node` as root | Med |
| D6 | `install.sh` | Test gate prints nothing (`>/dev/null`) and cannot be skipped: a flaky timing test on a busy VM blocks a hotfix. `rsync` assumed present. Needs sudo (no sudo-less path); confirm the team has it. Official keys are created at first install: good, never overwritten | Med |
| D7 | `Caddyfile` | Syntax is valid for Caddy 2.6+ (`protocols h1`, `timeouts`, `request_body max_size`). `header_up X-Real-IP {remote_host}` replaces client-supplied values; `-X-Forwarded-For` removes it. 9443 listens (502 while official is off) and appears in scans. Caddy also opens :80 for redirects: dropped by the firewall, but if something else owns :80, Caddy fails to start (unverified) | Low |
| D8 | `smoke.sh` | Fine. Login-flood step burns the tester IP's 30/min bucket, harmless. HSTS check is moot for IP hosts (browsers ignore HSTS on IP literals), harmless | Low |

## 5. Ranked changes

Hard rule: after 17 Nov midnight the repo (code, Caddyfile, unit, firewall, scripts, guide text) is frozen. **Still changeable after freeze without code:** `/etc/leakproof/*.env` (all `LP_*` limits, invite code, `LP_MAX_ACCOUNTS`, `LP_REGISTER_PER_IP`, `LP_AUTH_PER_MIN`), key files, official JSON and its accounts, the posted guide as a separate document, VM settings (ufw, caddy data). The default `127.0.0.1` bind, key handling and gate logic must be right now.

### Fix before freeze
| # | Change | Diff | Risk of fix |
|---|---|---|---|
| 1 | Index the log: `CREATE INDEX IF NOT EXISTS log_exam ON log(exam_id, seq);` in `db.mjs` SCHEMA. Reword SECURITY s2 "costs the same" to "at most every 30 s" | 1 line + 1 sentence | Very low (additive, idempotent, triggers unaffected) |
| 2 | `install.sh` after the chown: `chown -R root:root "$DEST/deploy"` (keeps service read access) | 1 line | Low (service never writes there) |
| 3 | Certificate story (D3): add `lifetime` to `tls internal`, or publish the root fingerprint and change the guide/`install.sh` print to the root cert | 2-5 lines | Low-med: `caddy validate` before reload (already in install.sh) |
| 4 | `install.sh`: allow `SKIP_TESTS=1`, show test output on failure, print `command -v node npm iptables rsync` check up front | 4 lines | Low |
| 5 | Check `ufw status`, `ip -6 addr`, `which node` on the VM now. If a global IPv6 address exists, key the limiter by /64 in `clientIp`; if not, skip (the code change has a compression-expansion bug risk) | 0 or about 5 lines | Med if coded; none if skipped |
| 6 | Decide the demo-credential plan (below) and rehearse a full official run once before 18 Nov | no code | none |
| 7 | systemd extras (D4) except `MemoryDenyWriteExecute`; start the unit and run the smoke script after | 5 lines | Low-med (a wrong directive stops the service: test) |
| 8 | `uncaughtException` handler: do not add (continuing in an unknown state is worse than a re-lock) | none | n/a |

**Demo credentials (deliverable due 8 am 18 Nov).** The official instance is off and `must_change` means the first person who logs in with a posted slip owns the account and locks out everyone else, including staff. Options: post one official set only to staff/TA, give every other tester practice accounts (they hold all roles there), or start official with a unique set per tester. Decide, do not leave it implicit. Also fill the guide placeholders (fingerprint, course code) before posting; that is a post-freeze doc, not code.

### Accept and prepare a rebuttal
Username enumeration (409); single-holder veto; 14-bit words with 5 tries; restart re-locks the paper; plaintext at seal and print; practice self-registration limited by course code; NAT bucket shared (tell testers to space out; raise `LP_AUTH_PER_MIN` via env if complaints); cert warning (internal CA, guide has fingerprint); no HTTP redirect (port 80 closed on purpose); no TOTP/MFA, no chosen passphrase; port 22 open (VM host out of scope; confirm sshd uses keys only); Caddy-generated error pages without app headers; official port 9443 answering 502 while off; trace ambiguity without options (guide says paste options; consider one line of text).

## Appendix: evidence commands
- Reports parsed with Python `csv` (field limit raised): 1,635 rows, Type counts Security 878 / Functionality 757, Valid 613. Keyword themes are regexes over columns 6 and 8 (category and impact), so a report can count in several themes.
- Citations above are file:line from the frozen snapshot read with `cat -n`. No process was started; no port or VM was touched.
