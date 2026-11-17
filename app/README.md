# LeakProof (Phase II tool)

A leak-resistant exam pipeline: TAs submit encrypted questions, the paper is drawn late and sealed under the professor's key (AES-256-GCM, Shamir 1-of-1), it opens only with the verified card inside the print window, every seat gets its own traceable order, and every step is in a keyed, tamper-evident log.

Zero dependencies: Node 22.5+ only (`node:http`, `node:sqlite`, `node:crypto`, `node:test`).

## Run locally
```bash
npm run practice     # http://127.0.0.1:8080, course codes LP-PROF-G19 / LP-TA-G19 / LP-STU-G19 (TA and student also need the professor's class code)
npm test             # 107 tests: crypto, pipeline, access control, sessions, inputs, DoS, hardening, round-5 fixes
```

## Deploy (course VM: Ubuntu 24.04, Node 22.5+, Caddy)
The git working copy lives in `~/leakproof` on the VM; the service runs a copy in `/srv/leakproof` as user `leakproof`.
```bash
ssh uss-vm                        # key-based, see ~/.ssh/config
cd ~/leakproof && git pull        # or edit here
sudo bash deploy/install.sh       # tests, copy to /srv, keys, systemd, firewall, Caddy, health check
```
Practice: `https://<vm>:8443/`. Keys stay root-only in `/etc/leakproof/<instance>/` and reach the process through systemd credentials.
Official demo (25 Nov night only): edit `deploy/official.example.json`, then
`LP_MODE=official LP_DATA_DIR=/var/lib/leakproof/official LP_KEY_DIR=/etc/leakproof/official node scripts/official-setup.mjs <file> [--demo] [--out creds.md]`
and `systemctl start leakproof@official` (served on port 9443). Every official account must choose its own password at
first login (and gets a fresh recovery code), so the printed slips stop working once used. `--out <file>` writes the credentials as a markdown table (mode 0600) instead of printing passphrases; `--demo` makes accounts that keep their passphrase (shared demo pods, no forced change).

`LP_MODE` (`practice` or `official`) selects the behaviour and wins over `LP_INSTANCE`, which is then just the instance name shown by `/healthz`, e.g. `LP_MODE=official LP_INSTANCE=demo` for the demo instance (default port 9090, data in `data/demo`; set `LP_PORT` and `LP_DATA_DIR`). `/healthz` is deep (database and `quick_check`) and answers 503 with a reason when unsound. After any deploy, run `bash deploy/smoke.sh https://<vm>` from a laptop.

`install.sh` refuses to deploy if `npm test` fails. The server refuses to start if `server.key` or `log.key` is missing
while the database holds data: restore the key from backup instead of deleting the database.

## API (one route table in `src/app.mjs`)
| Route | Who |
|---|---|
| `POST /api/login` `{ username, password }` (sets the session cookie and a 30-day device cookie), `/api/logout`, `GET /api/me` | anyone / session |
| `POST /api/register` (practice) `{ invite, role, classCode?, username, display, password }` → `{ username, recovery, examId, role }` | anyone |
| `POST /api/recover` `{ username, recovery, next }` → `{ recovery }` (new code; ends every session) | anyone |
| `POST /api/password` `{ current, next }` → `{ ok }` (+ `recovery` on an operator-made account's first change; ends other sessions) | session |
| Password rules: `public/password-rules.js`, one file used by the page and the server | |
| `POST /api/exams/:id/members/:aid/remove` (members are listed in `GET /api/exams/:id` for the professor) | professor (`run`) |
| `GET /healthz` → `{ ok, instance, mode }` or 503 `{ ok:false, reason }` | anyone |
| `GET /api/exams/:id` (adds `serverNow`, `minVerified`), questions, seal, cards, release, copies, trace | session + capability |
| `GET /api/exams/:id/key/:seat` → `{ seat, copyId, answers }` while the paper is open | exam cell (`run`) |
| `GET /api/releases/:rid`, `POST /api/releases/:rid/decide` (approve and refuse both need the two words) | key holder / exam cell |
| `GET /api/public/log/:id[?before=<seq>]` → chain status, 200 entries per page, `total`, and after release the draw seed | anyone |
| `POST /api/public/check-head` | anyone |

Polling requests send `X-LP-Background: 1` so they do not keep an idle session alive. Optional `LP_ORIGIN` fixes the
origin used by the CSRF Origin check (default: `https://` + the Host header).

## Layout
| Path | What |
|---|---|
| `server.mjs` | Entry point, socket limits and timeouts |
| `src/app.mjs` | Route table and the one middleware chain: rate limit, session, CSRF/origin, capability, schema |
| `src/exam.mjs` | The pipeline: submit, seal, cards, release gates, copies, trace |
| `src/crypto.mjs` | AES-256-GCM, scrypt, Shamir 1-of-1, HMAC streams |
| `src/log.mjs` | Keyed hash-chained log |
| `src/db.mjs` | SQLite schema (no plaintext column) |
| `public/` | The browser client (plain JS, `textContent` only; key cards encrypted with WebCrypto) |
| `tests/` | `node:test` suites; names start with the requirement (SR*), round-4 fix (S*), round-5 fix (R5-S*) or extra check (X*) they prove |
| `deploy/` | Caddyfile, systemd unit, firewall, install script, post-deploy `smoke.sh`, official exam example |

`SECURITY.md` maps each requirement and each FCS lesson to its test. `USER_GUIDE.md` is for testers.
