# R2: FCS Group 1 ("Secure Job Portal" / Nexora / Meridian) security catalogue

Lens: S1/S2/D2 (applied crypto, red team, SRE). Role-played, student project. Research only: nothing was run from the Group 1 repo; every claim comes from reading the files.

Paths: `G1/` = `/private/tmp/claude-501/-Users-hrshkr-Downloads-sem8-uss/29dd3dd2-a7a9-4bdd-b465-6e19cbfa674a/scratchpad/g1/Secure-Job-Portal-main/`. `BE/` = `G1/backend/app/`. `FE/` = `G1/frontend/src/`. `CSV Lnn` = line nn of `project/fcs/fcs_bugs.csv` (Group 1 rows only). `ours/` = `project/app/`.

Stack: FastAPI with 2 uvicorn workers (`G1/backend/Dockerfile:42`), Postgres, React SPA served by nginx in Docker, pull-based auto-deploy from GitHub. CSV: 72 reports, 13 Valid (L8, L9, L13, L24, L29, L31, L38, L50, L52, L59, L60, L62, L63).

---

## 1. Catalogue of measures

"Held?" says what classmates' reports show: the CSV row and the defence named in the rebuttal, or a Valid row, or "not tested". "Likely" marks a conclusion from reading the code that I did not execute.

### 1a. Authentication and sessions

| # | Measure | Evidence | Threat | Held? | Quality notes |
|---|---|---|---|---|---|
| 1 | Argon2id password hashing (t=3, 64 MiB, p=4) | `BE/security/password.py:18-25,34-48` | Offline cracking of a stolen DB | Not tested | Sound parameters, but it is **synchronous inside `async def` handlers** (`BE/routers/auth.py:148,202,225,251`), so each hash blocks the event loop of one of only 2 workers. With 30 concurrent logins they got a 502 (CSV L42, ruled Invalid). This is likely a big part of every "the site was down when you tried" rebuttal (L2, L3, L7, L20, L37, L41, L56) |
| 2 | Password complexity rule (8+ chars, upper, lower, digit, special) | `password.py:63-92`; `auth.py:164-170` | Weak passwords | L46 brute force: Invalid ("no exploit") | The rule broke the recruiter password printed in their own guide (L35, L33). That is a usability failure, not a security gain |
| 3 | Dummy Argon2 verify for an unknown email | `auth.py:221-232` | Timing-based user enumeration | Their audit says "2 ms diff", but both probes were rate-limited (`G1/deep_audit_report.txt`, section 11: "Too many requests"), so that test passed for the wrong reason | Enumeration still leaks through other paths: a suspended account returns 403 **before** the password check (`auth.py:235-239`), a locked one returns "Account locked" (`auth.py:242-248`), and register returns 400 versus 201 for an existing email (`auth.py:173-178`) |
| 4 | Per-account lockout: 5 failures, 15 min | `auth.py:47-49,250-263`; `BE/models/user.py:58-59` | Online guessing | L25, L46: Invalid ("lockouts do occur, rate limiting is present") | (a) It is keyed per account, so anyone can lock any known account. Their own shared recruiter test account got locked (L70). (b) The counter update is not atomic (read, `+= 1`, commit). (c) **Likely bug:** `locked_until` is a naive `DateTime` (`user.py:59`), but `auth.py:242` compares it with `datetime.now(timezone.utc)`. Once a row is reloaded this raises a TypeError, so every later login for that account returns 500, and the reset at `auth.py:273` is never reached. That fits L30's "intermittent 500s" and L70's permanently locked recruiter |
| 5 | Generic login error message | `auth.py:229-232,267-270` | Enumeration | Held for wrong passwords | See #3 for the leaks |
| 6 | JWT in HttpOnly cookies: access 15 min `SameSite=Strict`; refresh scoped to `/api/auth/refresh`, `Lax` | `auth.py:63-86`; `BE/security/jwt.py:57-103` | Token theft by XSS | L51, L57: Invalid ("no exploit") | Their own audit reported the refresh cookie as "HttpOnly missing" (`deep_audit_report.txt:44`). The current code sets it (`auth.py:81`), so either the audit or an older build was wrong |
| 7 | Algorithm pinned on decode; `type` claim checked | `jwt.py:127-144`; `BE/dependencies.py:67-72`; `auth.py:477` | alg=none or algorithm confusion; using a refresh token as an access token | Not tested | Correct. `verify-2fa` checks `sid=="pending-2fa"` but never checks `type=="temp_2fa"` or the fingerprint (`auth.py:321-344`) |
| 8 | Server-side session row checked on every request | `dependencies.py:84-96`; `BE/models/session.py` | Revocation | L19: Invalid (logging out one session leaves others alive, by design) | `expires_at` is never checked on use. The refresh path issues a fresh 24 h token on every rotation (`jwt.py:100`, `auth.py:558-567`), so an active session has **no absolute lifetime** and there is **no idle timeout** |
| 9 | Refresh-token rotation with reuse detection (reuse revokes all sessions; 5 s grace) | `auth.py:504-531,549-567`; `G1/backend/migrations/add_session_updated_at.sql` | Replay of a stolen refresh token | Not tested | Sound idea. Replaying any old refresh token is also a lever to log the victim out of every session |
| 10 | Device binding: SHA-256(IP \| User-Agent) inside tokens | `jwt.py:32-52`; `dependencies.py:74-82` | Use of a stolen cookie from another device | Not tested | The IP comes from `X-Real-IP` or `X-Forwarded-For` without checking who sent it (`dependencies.py:24-33`, `BE/utils.py:19-28`), so an attacker can forge it whenever the backend is reachable directly (see #45). It also logs out users whose IP changes (mobile, NAT) |
| 11 | Logout revokes the server session; list and revoke own sessions | `auth.py:580-665` | Session reuse after logout | L17 (back button after logout): Invalid ("could not exploit") | No `Cache-Control: no-store` anywhere in G1 (grep of `backend/` and `nginx.conf` finds none), so pages served before logout stay in the browser cache |
| 12 | Password change needs the current password plus a TOTP code, and revokes other sessions | `BE/routers/users.py:306-357` | Takeover via a hijacked session | Not tested | Good. It refuses to work at all unless 2FA is enabled (`users.py:321-323`), which is a usability cost |
| 13 | TOTP 2FA (pyotp, ±1 window); secret Fernet-encrypted at rest; used-code table against replay | `BE/security/totp.py:26-140`; `auth.py:310-443`; `BE/models/audit_log.py:47-65` | Password compromise; OTP replay | L20 (500 on the TOTP endpoint): Invalid ("we were under DoS"). L5 (2FA cannot be disabled): Invalid, by design | The replay check is check-then-insert with no unique constraint (`totp.py:112-130`), so two parallel requests with the same code both pass. 2FA guessing is limited only per IP (3/min, `BE/security/rate_limiter.py:84`). There is no per-account counter, and the temp token stays reusable for 5 min |
| 14 | Step-up OTP before high-risk actions (resume download, user deletion) | `BE/routers/resumes.py:180-198`; `BE/routers/admin.py:191-210` | Misuse of a hijacked session | L73 (no virtual keyboard on password reset): Invalid ("used for resume download and account deletion") | The OTP travels in the **URL query string** (`FE/api/client.js:137-140,151-153`), so it lands in proxy logs. A role change to admin (`admin.py:69-124`) has no step-up, although it is the more dangerous action |
| 15 | Virtual keyboard for OTP entry, reshuffled after every key | `FE/components/VirtualKeyboard.jsx:17-48`; used in `Login.jsx`, `Resumes.jsx`, `AdminPanel.jsx`, `Applicants.jsx` | Keyloggers | L73: Invalid | Shuffles with `Math.random`. It protects a single-use, 30-second code, so the gain is small and the cost is real friction |
| 16 | RBAC through `Depends(require_role)`; admins cannot change their own role, suspend themselves or delete themselves; ownership checks | `dependencies.py:117-140`; `admin.py:85-90,138-143,212-217`; `BE/routers/applications.py:35-40`; `BE/routers/jobs.py:59` | Privilege escalation, IDOR | L4, L11, L18, L22, L23: Invalid (role design) | Over-broad grant: **any** recruiter can download **any** resume, not just applicants' (`resumes.py:212-221`) |
| 17 | Suspension revokes all sessions and is checked on every request | `admin.py:152-165`; `dependencies.py:108-112` | Containment of an abusive account | L4, L34, L43: they suspended their own admin test account during testing (Invalid) | Operational choice: the shared admin was a liability |
| 18 | Random UUIDv4 primary keys | `user.py:33` and every model | ID enumeration | **L29 Valid**: the search endpoint leaked the IDs anyway (#20) | Random IDs are good. Unparsable IDs crash with 500 (L27, L28: Invalid; their reply "not a security bug") because path parameters are plain `str` with no exception handler |

### 1b. Web-layer controls

| # | Measure | Evidence | Threat | Held? | Quality notes |
|---|---|---|---|---|---|
| 19 | CSRF double-submit (cookie compared with `X-CSRF-Token` using `compare_digest`) | `BE/security/csrf.py:43-82`; `auth.py:670-688`; `FE/api/client.js:14-22`; `FE/context/AuthContext.jsx:24-38` | CSRF | Their audit: missing, wrong and right token give 403/403/200 (`deep_audit_report.txt`, section 3). No classmate CSRF report | The token is not bound to the session. Login and register are exempt. The token is kept in `localStorage` |
| 20 | Search with LIKE-wildcard escaping | `users.py:42-44,152-178` | Wildcard injection | **L29 Valid** (root cause below) | **Root cause of L29:** `search_users` returns `email` and `role` for anyone matching ≥2 characters, ignoring `privacy_settings` (`users.py:169-177`, compared with the privacy filter at `users.py:60-145`). The escape also does not escape `\` |
| 21 | CORS allow-list with credentials | `BE/main.py:46-53`; `G1/docker-compose.yml:53` | Cross-origin reads | Not tested | The default allow-list includes `http://localhost`. The comment "CORS must be outermost" is wrong: in Starlette the last middleware added runs first, so CSRF is outermost and CORS innermost. As a result, 403/429 responses carry no CORS headers, and requests rejected by CSRF are never counted by the rate limiter |
| 22 | Security headers, set twice (app and nginx): CSP, XFO DENY, nosniff, HSTS preload, Referrer-Policy, Permissions-Policy, X-XSS-Protection | `BE/security/headers.py:12-56`; `G1/frontend/nginx.conf:59-65` | Clickjacking, sniffing, XSS impact | L44 (missing headers), L45: Invalid ("no exploit") | CSP allows `style-src 'unsafe-inline'` and Google Fonts (`FE/../index.html:10`, a privacy leak and an external dependency). **`img-src 'self' data:` omits `blob:`, yet avatars are shown through `URL.createObjectURL` (`FE/api/client.js:89-92,116-122`; `FE/pages/Profile.jsx:41-45`)**. That is likely the root cause of the 3 Valid avatar reports (L8, L13, L38). HSTS `preload` on a bare IP has no effect. API responses carry duplicate headers |
| 23 | Strip all HTML with nh3 on every text field, in schema validators | `BE/security/sanitizer.py:16-41`; 59 `field_validator`/`sanitize_string` uses in `BE/schemas/*.py` | Stored XSS | L39: Invalid (XSS stripped) | It held, but it **changes the data** (the name became empty, L39). React escaping already prevents the XSS. The report claims `bleach` (`docs/report/sections/security.tex`), while the code uses `nh3` |
| 24 | ORM-only SQL | `BE/database.py`; their audit section 1 | SQL injection | No SQLi report succeeded | Their "UNION SQLi: no data leak (HTTP 000)" is a timeout counted as a pass (`deep_audit_report.txt`, section 1) |
| 25 | Pydantic validation (6-digit OTP, `EmailStr`) | `BE/schemas/auth.py` | Malformed input | L12 (blank screen on a bad email): Invalid | **No length cap anywhere**: 0 uses of `max_length`/`Field(` in `BE/schemas/*.py`. The only cap is nginx `client_max_body_size 3m` |
| 26 | API docs and OpenAPI disabled unless DEBUG | `main.py:38-39` | API discovery | L47, L61: Invalid; their audit shows 404 | Held. Local compose defaults to `DEBUG=true` (`G1/docker-compose.local.yml`) |
| 27 | User-Agent stripped of control characters and truncated before logging | `auth.py:55-60` | Log injection | Not tested | Good hygiene. `filename` goes into audit details unsanitised (`resumes.py:65,127`) |
| 28 | Content-Disposition filename sanitised | `resumes.py:249-258` | Header injection | Not tested | Fine |

### 1c. Rate limiting, DoS and availability

| # | Measure | Evidence | Threat | Held? | Quality notes |
|---|---|---|---|---|---|
| 29 | In-memory sliding-window limiter keyed by (IP, path): login 5/min, 2FA 3/min, register 5/min, default 60/min; key cap 100k; 429 with `Retry-After` | `rate_limiter.py:21-147` | Brute force, abuse | **L62 Valid** ("no limit on the API endpoints"); L46: Invalid | **Root causes of L62:** (a) **two uvicorn workers** (`Dockerfile:42`), each with its own in-memory map, double every limit. Their own audit got 10/10 logins through (`deep_audit_report.txt:59-60`); its "X-Forwarded-For bypass" label was the wrong diagnosis. (b) The key is the **full path** (`rate_limiter.py:132`), so `/api/users/<id>` gets a fresh bucket per ID, and the default 60/min applies per path, not per client. (c) `X-Real-IP` is trusted from any sender (`rate_limiter.py:103-105`), so it is forgeable if port 8000 is reachable (#45) |
| 30 | Body caps: nginx 3 MB, app 2 MB | `nginx.conf:47`; `BE/config.py:32` | Oversize uploads | Not tested | The app reads the whole upload before checking its size (`resumes.py:52`) |
| 31 | 10 s timeout on PDF parsing | `BE/security/resume_parser.py:100-114` | Parser DoS | Not tested | **Ineffective.** The timeout is raised inside `with ThreadPoolExecutor(...)`, and `__exit__` calls `shutdown(wait=True)`, so the request still waits for the parse to finish |
| 32 | DB connection pool limits (10+20) | `database.py:15-21` | DB exhaustion | Not tested | Fine |
| 33 | Watchdog: probes health every 30 s; after 3 failures restarts the container, then the whole stack (5 min cooldown); systemd unit; Docker `restart: unless-stopped` and healthchecks | `G1/watchdog.sh:31-129`; `G1/sjp-watchdog.service`; `G1/docker-compose.yml:28-34,65-71` | Crashes and hangs | **L31 Valid** (TCP connection flood took the site down) | Restarting does not stop a flood. It also **wipes the in-memory limiter** (#29), so a flood that triggers a restart resets the limits. Runs as root with `NoNewPrivileges=false` (`sjp-watchdog.service:9,18`) |
| 34 | (Missing) nginx connection and request limits and timeouts | `nginx.conf` has no `limit_conn`, `limit_req`, `client_header_timeout` or `keepalive_timeout` (grep) | Slowloris, socket floods | **L31 Valid** | Root cause of L31, together with the event-loop stall in #1. `http2` is on (`nginx.conf:12`), and L32 (HTTP/2 Rapid Reset) was tried, Invalid ("does not work") |

### 1d. Cryptography and integrity

| # | Measure | Evidence | Threat | Held? | Quality notes |
|---|---|---|---|---|---|
| 35 | Resumes encrypted at rest with Fernet (AES-128-CBC + HMAC); UUID file names; decrypted only in memory | `BE/security/file_encryption.py`; `resumes.py:83-101,200-235` | Disk or volume theft | Not tested | One static key from env, no rotation. The key lives on the same host as the files |
| 36 | PDF validation: extension, client MIME, magic bytes, libmagic, blocklist of `/JS`/`/Launch`/... | `BE/security/file_validator.py:45-114` | Malicious uploads | L68 (a JSON renamed `.pdf` was "uploaded"): Invalid ("no exploit") | Magic-byte checks at `:82` should reject JSON. The report probably saw client-side state; the rebuttal did not dispute it |
| 37 | Avatar validation by magic bytes; served only through an authenticated route | `BE/routers/profile.py:55-90,159-183` | Malicious images, scraping | Avatars never displayed (L8, L13, L38 Valid; see #22) | — |
| 38 | RSA-2048 server key (PSS) signs resumes, messages, audit entries and blocks | `BE/security/pki.py:38-148`; `resumes.py:104-108,222-230`; `utils.py:88-91` | Tampering | Not tested | (a) **The key is generated silently when the file is missing** (`pki.py:65-80`). That happened in production: `G1/backend/migrations/resign_all.py:7` ("The container generated new RSA keys, invalidating all existing signatures"). (b) **Fails open**: signing errors store `NULL` (`utils.py:88-91`, `resumes.py:104-108`, `blockchain.py:138-141`), and verification skips `NULL` (`admin.py:410`, `blockchain.py:266`, `resumes.py:223`). An attacker can edit a row, recompute the unkeyed hash and set `signature=NULL`. (c) Verification falls back from PSS to PKCS#1 v1.5 (`pki.py:136-148`). (d) The key sits on the same host as the data it protects, unencrypted. (e) The report says PKCS#1 v1.5 while the code uses PSS |
| 39 | Audit log as a SHA-256 hash chain plus signatures; admin "verify chain" endpoint; Postgres advisory lock to serialise writes | `utils.py:31-118`; `admin.py:359-422`; `audit_log.py:15-44` | Quiet edits to the record | Not tested | (a) **Unkeyed** SHA-256 over `|`-joined fields (`utils.py:43`), so anyone with DB write access can recompute it. (b) The repo ships the rewrite tool: `backfill_audit_hashes()` (`utils.py:121-151`) and `resign_all.py` recompute and re-sign the **whole chain**, and the report advertises this (`security_m3.tex`, "Data Integrity" subsection). (c) Rows with `entry_hash IS NULL` are skipped and the chain restarts (`admin.py:385-388`). (d) **No external anchor**, so deleting the newest rows goes undetected |
| 40 | "Blockchain": Merkle tree of 10 entries, proof of work with difficulty 2, signed blocks, JSON checkpoints on disk, signed export | `BE/security/blockchain.py:33-430`; `BE/models/blockchain.py` | Same as #39 | Not tested | Difficulty 2 means about 256 hashes. The checkpoints sit on the same host (and in git: `G1/backend/data/blockchain/block_00000*.json`). The Merkle tree has no leaf/node domain separation and duplicates the last node. The signature is NULL-tolerant. It adds no trust domain beyond #39 |
| 41 | "E2EE" for direct messages (ECDH P-256 → HKDF → AES-GCM, non-extractable keys in IndexedDB); group messages encrypted server-side with Fernet; server signs the ciphertext | `FE/utils/crypto.js:1-16,136-162`; `BE/routers/messaging.py:4-6,32-33,41,203,336-353` | Server or DB reading messages | **L24, L50, L63 Valid** | **Root cause:** public keys are uploaded to the server and served back unauthenticated (`messaging.py:41,203`), so the server can swap them (L24's "intercepted and changed"). Group messages are plaintext to the server. Signing with the server key proves nothing about the sender. The claim was larger than the design |

### 1e. Deployment, supply chain and process

| # | Measure | Evidence | Threat | Held? | Quality notes |
|---|---|---|---|---|---|
| 42 | TLS 1.2/1.3 with AEAD ciphers, session tickets off, HTTP→HTTPS 301 | `nginx.conf:1-28` | Eavesdropping | L49 (HTTP page): Invalid. Their audit shows the 301 and HSTS | **The private key is committed** (`G1/ssl/private.key`; cert CN=192.168.2.233, valid until Feb 2027) |
| 43 | `server_tokens off` | `nginx.conf:16` | Fingerprinting | Held | — |
| 44 | Non-root container user (uid 10001) | `Dockerfile:16-33` | Container breakout impact | Not tested | Fine |
| 45 | Network split (frontend cannot reach Postgres); backend bound to `127.0.0.1:8000` | `G1/docker-compose.yml:61,108-114` | Lateral movement; bypassing the proxy | Not tested | **`docker-compose.prod.yml:56` publishes `"8000:8000"` on every interface on a single flat network.** Whoever reaches :8000 bypasses TLS and nginx headers and can forge `X-Real-IP`, defeating #10 and #29. Docker-published ports also bypass ufw. `deploy.sh:12` uses the safer file; it is unclear which ran in production |
| 46 | Secrets from env; `JWT_SECRET` has no default in code | `BE/config.py:19-27` | Hard-coded secrets | Not tested | `docker-compose.yml:44` falls back to `super-secret-jwt-key-change-in-production...`, and Postgres to `postgres:postgres` (`:24,43`). `deploy.sh:56-58` only **warns** when `.env` is missing, then deploys with those defaults |
| 47 | CI: ruff, pytest, eslint, build, docker build. CD: build and push to GHCR | `G1/.github/workflows/ci.yml`, `cd.yml` | Regressions; supply chain | — | **`pytest -v ... \|\| echo "No tests collected yet"`** (`ci.yml:75`) can never fail. CI deletes `package-lock.json` before `npm install --no-audit` (`ci.yml:94-95`), and the Dockerfile ignores the lockfile (`frontend/Dockerfile:6-7`). No dependency audit. Actions pinned by tag; images by `:latest` |
| 48 | Pull-based auto-deploy: root cron every 2 min, `git pull`, `docker compose up --build` | `G1/auto-deploy.sh:1-117`; `cd.yml:100-108` | (Operational convenience) | — | Anyone who can push to `main` gets root code execution on the VM within 2 minutes, and the code can change mid-attack-window. Lock file in `/tmp` is predictable |
| 49 | Self-audit scripts against the live site, with saved reports | `G1/security_test.sh`, `G1/deep_audit.sh`, `security_report.txt`, `deep_audit_report.txt` | Regressions | — | **False passes**: `/.env` → "HTTP 200" marked SECURE (the SPA fallback serves `index.html`); HTTP 000 counted as SQLi-safe; enumeration "safe" because both probes were rate-limited. **False fails**: "/admin/audit-log … HTTP 404 — ADMIN PANEL EXPOSED". Final tally "44 SECURE / 4 VULN" (`deep_audit_report.txt`, last lines) |
| 50 | `.gitignore` covers `.env`, `backend/data/{resumes,avatars,pki}` | `G1/.gitignore:16-35` | Committing secrets | **Failed** | Misses `ssl/`, `*.dump`, `backend/data/blockchain/` (see section 2) |
| 51 | Health endpoint | `main.py:81-84` | Monitoring | — | Fine |
| 52 | Operational: suspended the shared admin during testing; credentials sent by email | CSV L4, L34, L43, L70 | Abuse of shared test accounts | Invalid rulings, but cost goodwill and testing time | A shipped credential with a typo (L33-L35) and a locked shared account (L70) made many testers file "can't log in" reports |

---

## 2. Their security mistakes, with evidence

1. **Committed secrets and data.**
   - TLS private key: `G1/ssl/private.key` (`-----BEGIN PRIVATE KEY-----`), matching `G1/ssl/certificate.crt` (CN=192.168.2.233, valid until 27 Feb 2027). Anyone with the repo can impersonate the server on the LAN.
   - Full Postgres dump: `G1/db_backup.dump` (pg custom format). It contains `COPY public.users (... hashed_password, ... totp_secret ...)`, `sessions`, `audit_logs` (with IPs), `messages`, `used_otps`.
   - Audit checkpoints: `G1/backend/data/blockchain/block_00000{0..4}.json`.
2. **Default secrets that fail open.**
   - `docker-compose.yml:44` defaults the JWT secret and `:24,43` default Postgres to `postgres`.
   - `deploy.sh:56-58` continues without `.env`.
   - The CI test JWT secret is in plaintext (`ci.yml:36`). It is harmless, but it is the pattern that leads to the mistakes above.
3. **Backend exposed past the proxy.** `docker-compose.prod.yml:56` (`8000:8000`) and the trust-anyone `X-Real-IP`/`X-Forwarded-For` readers (`rate_limiter.py:103-105`, `dependencies.py:24-33`, `utils.py:19-28`) together let a client choose its own IP for rate limiting, device binding and audit records.
4. **Blocking crypto on the event loop.** Argon2 at 64 MiB runs synchronously inside `async def` (`auth.py:225,251`; also `users.py:316`). With 2 workers, a handful of parallel logins stall everything, consistent with CSV L42 (502 after 30 parallel logins) and the many "we were under DoS" rebuttals.
5. **No transport-level DoS limits** in `nginx.conf`. This is the root cause of **L31 Valid**.
6. **Per-process rate limiter** with 2 workers, and keys that include the full path. This is the root cause of **L62 Valid** (#29).
7. **Tamper evidence that is not.**
   - Unkeyed chain (`utils.py:43`).
   - A shipped tool that rewrites and re-signs the chain (`utils.py:121-151`, `migrations/resign_all.py`).
   - `NULL` signatures accepted (`admin.py:410`, `blockchain.py:266`).
   - Rows with `NULL` hashes skipped (`admin.py:385-388`).
   - No external anchor, so truncation is invisible.
   - The signing key regenerates itself when missing (`pki.py:65-80`). This happened in production (`resign_all.py:7`).
8. **Over-claiming.**
   - "E2EE" with server-distributed, unauthenticated public keys and server-side group encryption: **3 Valid reports** (L24, L50, L63).
   - The report says `bleach` and PKCS#1 v1.5 while the code uses `nh3` and PSS.
   - The report claims "Forgery prevention … cannot forge the PKI signature" while NULL signatures are accepted (`docs/report/sections/security_m3.tex`, "Data Integrity" subsection).
9. **Privacy bypass.** `/api/users/search` returns every match's email and role, ignoring privacy settings (`users.py:152-178`): **L29 Valid**.
10. **No identity verification at sign-up** (`auth.py:147-196`): **L9, L52, L59, L60 Valid** (4 of 13).
11. **Their own security header broke a feature.** `img-src 'self' data:` blocks the `blob:` URLs used for avatars (`headers.py:41`, `nginx.conf:63` against `client.js:89-92`). Likely root cause of **L8, L13, L38 Valid**.
12. **Lockout bugs.** Lockout per account is a DoS lever (L70). The likely naive/aware datetime crash (`auth.py:242` against `user.py:59`) would make a lockout permanent.
13. **Error handling.** `admin.py:273` returns `str(e)` from a DB exception. There is no global exception handler, so unparsable UUID path parameters give 500 (L27, L28).
14. **Secrets in URLs.** OTP codes go in query strings (`client.js:137-140,151-153`).
15. **No input length caps** in any schema (0 `max_length`).
16. **No absolute or idle session limit** (#8). **No `Cache-Control: no-store`** (#11).
17. **Ineffective PDF timeout** (#31). **Middleware-order mistake** (#21).
18. **CI theatre and push-to-root deploy.**
    - `ci.yml:75` (`|| echo`).
    - `ci.yml:94` (lockfile deleted).
    - `auto-deploy.sh` (root cron pulls `main` every 2 min).
    - Self-audit scripts with false passes (#49).

---

## 3. Fit verdict for LeakProof

Verdicts: **ALREADY HAVE** (cites our file), **ADOPT**, **ADAPT**, **REJECT**. The filter is properties P1-P6 and SR1-SR12 (`11_minimal_system.md` section 4), plus Occam's razor.

| # | G1 measure | Verdict | Why / how |
|---|---|---|---|
| 1 | Memory-hard password hash | ALREADY HAVE | scrypt, async on the thread pool (`ours/src/crypto.mjs:28-39`). This is exactly the fix for G1's event-loop stall |
| 2 | Complexity rule | REJECT | We generate passphrases (`crypto.mjs:46`), so there is no user-chosen password to police. G1's rule broke their own guide (L35) |
| 3 | Dummy hash for unknown users | ALREADY HAVE | `burnPasswordTime` with a single error message (`ours/src/app.mjs:148-150`). We have no suspended or locked branch that leaks existence earlier |
| 4 | Per-account lockout | ALREADY HAVE (better) | Backoff keyed `username\|ip` (`app.mjs:84-95,146-150`), so a classmate cannot lock someone else's account (G1 L70). In-memory and single-threaded, so the counter is atomic |
| 5 | Generic login error | ALREADY HAVE | `app.mjs:150` |
| 6-7 | JWT cookies, pinned algorithm, type claim | REJECT | Server-side random session IDs, stored only as a hash (`app.mjs:22-37`). Nothing to forge, and revocation is a row delete. SECURITY.md section 3 already records the cut |
| 8 | Session check plus timeouts | ALREADY HAVE (better) | 30 min idle and 8 h absolute (`app.mjs:10,33`). G1 had neither |
| 9 | Refresh rotation with reuse detection | REJECT | There are no refresh tokens. One session cookie with `__Host-`, HttpOnly, Secure, SameSite=Strict (`app.mjs:19`) |
| 10 | IP+UA device binding | REJECT | Breaks on mobile and NAT. In G1 it rested on a forgeable header. Already cut in `ours/SECURITY.md` section 3 |
| 11 | Logout revokes the session | ALREADY HAVE | `app.mjs:157-160`. API responses are `Cache-Control: no-store` (`ours/src/http.mjs:18`), which covers the L17 class; the HTML holds no data |
| 12 | Re-auth and kill other sessions on credential change | ALREADY HAVE | Recovery code sets a new passphrase and signs out every session (`ours/SECURITY.md` section 2, row "No forgot-password path") |
| 13 | TOTP 2FA with replay table | REJECT | No property gained: the high-risk action (approve) already needs card, passphrase and two typed words. Cut in SECURITY.md section 3. The single-use idea is already in our approvals: one per distinct verified card, bound to the request nonce (`ours/src/exam.mjs:225-246`) |
| 14 | Step-up before high-risk actions | ALREADY HAVE (in our form) | Approve = card + passphrase + two words shown only on the exam cell's screen (`exam.mjs:245-246`). Seal has a typed "cannot be undone" confirmation (`ours/public/app.js:234-237`). Adding re-auth to Seal gains no confidentiality, because Seal reveals nothing. Keep secrets out of URLs: trace is a POST (`11_minimal_system.md`, finding 10) |
| 15 | Virtual keyboard | REJECT | Protects a single-use code and costs usability (25% of the grade). Already cut |
| 16 | RBAC with self-action guards and ownership checks | ALREADY HAVE (stronger) | Per-exam capabilities; missing capability gives 404 (`app.mjs:280-286`); one card per account in the official instance; distinct verified cards for G1 |
| 17 | Suspension kill switch | REJECT | No admin role. Revoking a key holder is design-only (`11_minimal_system.md` section 6). Our two-instance split solves G1's real problem (a shared admin abused during testing) |
| 18 | Random IDs; no 500 on bad IDs | ALREADY HAVE | 128-bit hex IDs (`app.mjs:45`). Path parameters must be hex or small integers, else 404 (`app.mjs:264-265`). Errors return only a reference code (`app.mjs:295-297`) |
| 19 | CSRF token | ALREADY HAVE (better) | Session-bound token plus an Origin check on every non-GET, login included (`app.mjs:271-279`) |
| 20 | Search, wildcard escaping | REJECT / ALREADY HAVE | There is no user search or directory (SECURITY.md section 2, row "Search endpoint leaked …"). L29 cannot happen to us |
| 21 | CORS allow-list | ALREADY HAVE (stronger) | No CORS headers at all, so same origin only. One ordered chain: rate limit, session, CSRF and origin, capability (`app.mjs:1-2,244-286`). G1's order mistake cannot occur |
| 22 | Security headers | ALREADY HAVE (stricter) | No `unsafe-inline`, no external fonts, `object-src 'none'`, COOP/CORP (`http.mjs:5-14`); HSTS (`app.mjs:245`). G1's lesson: a CSP can break a feature. Our `download()` uses a `blob:` link (`app.js:97-98`); downloads are not governed by `img-src`, so it should be fine. Still, click Copy, Download and Print under the **production** CSP (not `LP_DEV_HTTP`) during the pilot. This is a check, not a new measure |
| 23 | Strip HTML on input | REJECT | Changes user data (G1 L39 emptied a name). We validate, reject and render only with `textContent` (`app.js:1,11`; SECURITY.md SR10) |
| 24 | Parameterised SQL | ALREADY HAVE | `node:sqlite` prepared statements throughout `app.mjs`, `exam.mjs` |
| 25 | Schema validation with length caps | ALREADY HAVE | `str(v,max)` and `int()` (`app.mjs:79-80`); 16 KB body cap, JSON only (`http.mjs:24-47`) |
| 26 | Docs off in production | ALREADY HAVE (n/a) | There is no docs route; unknown routes give 404 |
| 27 | Log sanitising | ALREADY HAVE | Allow-list of log fields (`ours/src/log.mjs:6-16`); 500 logs carry only a reference (`app.mjs:296`) |
| 28 | Header-safe file names | REJECT (n/a) | No uploads or downloads from the server |
| 29 | Rate limiter | ALREADY HAVE (better) | Per client: global, auth and sensitive (per-account) buckets, keys **not** path-specific (`app.mjs:259,263,269`); key cap (`http.mjs:72-83`); 429 + `Retry-After` (`app.mjs:292-293`); `X-Real-IP` believed only from 127.0.0.1 with `LP_TRUST_PROXY=1` (`app.mjs:74-78`). One process per instance, so no per-worker split. **Rule: never add `cluster` or a second worker** without moving the limiter |
| 30 | Body caps | ALREADY HAVE | nginx 32k (`ours/deploy/nginx.conf:16`); app 16 KB, enforced while streaming (`http.mjs:30-35`) |
| 31 | Parser timeout | REJECT (n/a) | No parser. Per-request CPU is bounded by the 16 KB cap and the seat limit |
| 32 | DB pool | REJECT (n/a) | Embedded SQLite, one process |
| 33 | Watchdog restarts | **ADAPT (low, practice only)** | systemd `Restart=always` (`ours/deploy/leakproof@.service`) covers crashes but not a hung, still-alive process. For the **practice** instance only, a 1-minute systemd timer: `curl -fsS -m 5 http://127.0.0.1:8080/healthz \|\| systemctl restart leakproof@practice`. **Never on official**: a restart re-locks a released paper and needs a fresh quorum (SECURITY.md section 4). Low value, since scrypt is async and Node rarely hangs |
| 34 | nginx limits and timeouts (G1's missing measure) | ALREADY HAVE | `limit_conn`, `limit_req` (429), header/body/send timeouts, `gzip off` (`ours/deploy/nginx.conf:4-16,40-50`); iptables `connlimit` and Node ports reachable only from 127.0.0.1 (`ours/deploy/firewall.sh`); Node `headersTimeout` checked every second and a per-IP socket cap (`ours/server.mjs:20-41`) |
| 34b | `http2` on the TLS listener (G1 had it; L32 tried Rapid Reset) | **ADOPT** | Our nginx also listens `ssl http2` (`ours/deploy/nginx.conf:27-28`). HTTP/2 gives our ~16 small JSON routes nothing, and it opens the class classmates already tried on G1 (CVE-2023-44487 Rapid Reset, HPACK tricks) on Ubuntu's nginx 1.18. Change: `listen 443 ssl; listen 8443 ssl;`. Honest caveat: nginx says `limit_req`/`keepalive_requests` already blunt Rapid Reset, so this removes surface rather than closing a known hole |
| 35 | Encryption at rest under a key outside the DB | ALREADY HAVE (stronger) | AES-256-GCM with exam and question ID as AAD (`crypto.mjs:14-25`); keys in `/etc/leakproof/%i` with mode 0440 and read-only to the service (`ours/deploy/install.sh:10-17`, `leakproof@.service`). After Seal, the pool is deleted (SR7) |
| 36-37 | Upload validation | REJECT | No uploads (`11_minimal_system.md` section 3) |
| 38 | Server-key signatures | REJECT; **ADOPT the lesson as fail-closed keys** | Signing with a key on the same host adds no trust domain beyond our HMAC chain. The lesson is G1's silent key regeneration (`pki.py:65-80` → `resign_all.py`). Our `loadKey` also creates a key when the file is missing (`ours/src/config.mjs:29-35`). In production `ReadOnlyPaths` makes that write throw (fail closed), but a wrong `LP_KEY_DIR` or a dev or practice run would quietly mint a new `log.key`/`server.key` over an existing database: every log entry would fail verification and every sealed paper would be undecryptable, or an insider could rebuild the chain under a fresh key. **How:** in `server.mjs`, check whether the key file exists before calling `loadKey`; if it does not and the `log` table already has rows, throw `'key file missing for an existing database; refusing to create a new one'`. 3 lines plus 1 test (SR6, P4) |
| 39 | Hash-chained audit log | ALREADY HAVE (stronger) | Keyed HMAC chain with the key outside the DB and NUL-separated fields (`crypto.mjs:6-10`, `log.mjs:1-30`); append-only triggers (`ours/src/db.mjs:42-43`); external anchor, since the head is printed on every copy and shown on approvals, and truncation shows as a missing head (SR6). That fixes every G1 weakness listed in #39. **Never write a "backfill/resign" utility** (G1's `utils.py:121`) |
| 40 | Blockchain, Merkle tree, proof of work, checkpoints | REJECT | Same trust domain, no property gained. Our physical anchor (the head on paper) is the transferable idea, and we already have it |
| 41 | Browser E2EE with non-extractable keys | REJECT | Our card is deliberately portable text encrypted under a passphrase (SR4). G1's failure (keys served by the server, unauthenticated) maps to our stated limit: "a malicious VM operator could serve altered JavaScript" (SECURITY.md section 4). Lesson already applied: claim nothing without a test (SECURITY.md line 3) |
| 42 | TLS hardening and redirect | ALREADY HAVE | `ours/deploy/nginx.conf:20-37`; certificate generated on the VM, fingerprint published (`install.sh:21-28`) |
| 43 | `server_tokens off` | ALREADY HAVE | `nginx.conf:10` |
| 44 | Non-root runtime | ALREADY HAVE (stronger) | `User=leakproof`, `NoNewPrivileges`, `ProtectSystem=strict`, `MemoryMax`, … (`leakproof@.service`) |
| 45 | Backend not reachable past the proxy | ALREADY HAVE | Node binds 127.0.0.1 (`ours/src/config.mjs:14`); iptables drops 8080/8081 from anywhere else (`firewall.sh`); proxy overwrites `X-Real-IP` and clears `X-Forwarded-For` (`ours/deploy/proxy.conf`). G1's prod compose shows why this must be checked on the **live** VM; see the next row |
| 49 | Live self-audit scripts | **ADAPT** | Our 30 tests run in-process and cannot see deployment mistakes like G1's `8000:8000`. Add a ~30-line `scripts/smoke.sh <host>`, run from a laptop after each deploy. Lesson from G1's false passes: assert **status and body**, never "not 429" or "200". Checks: `http://` gives 301; HTTPS responses carry HSTS and CSP; `/.env` and `/.git/config` give 404 (G1's SPA served 200); `:8080`/`:8081` refuse from off-box; the 11th login in a minute gives 429 with `Retry-After`; no version in `Server`; an unknown `/api/x` gives 404 JSON; a POST with `Origin: https://evil` gives 403. Evidence for the report and for rebuttals |
| 46/50 | Secrets out of git and the package | **ADOPT (packaging check)** | `.gitignore` already excludes `app/data/`, `*.key`, `*.db` (`project/.gitignore:36-41`), and keys are made on the VM (`install.sh:13-16`). G1 had a `.gitignore` too, yet committed `ssl/private.key` and a DB dump through paths it did not list. Before posting on 17 Nov, run `git ls-files \| grep -Ei '\.(key\|pem\|crt\|db\|dump\|sqlite\|env)$'` (must be empty) and build the zip from `git archive`, not the working folder (the local `app/data/` exists) |
| 47 | CI test gate | **ADAPT** | No GitHub Actions needed. Make `install.sh` (and any hotfix redeploy during 18-25 Nov) run `npm test` first and abort on failure: `(cd "$SRC" && npm test) \|\| { echo 'tests failed, not deploying'; exit 1; }`. G1's `ci.yml:75` (`\|\| echo`) is the counterexample. Zero dependencies means there is nothing to audit on the supply-chain side |
| 48 | Auto-deploy from GitHub as root | REJECT | Gives anyone who can push to the repo code execution on the VM and moves the code under classmates mid-test. We deploy by hand with `install.sh` |
| 51 | Health endpoint | ALREADY HAVE | `/healthz` (`app.mjs:142`) |
| 52 | Operational lessons (shared admin suspended, wrong credentials in guide, shared account locked) | ALREADY HAVE | Self-registration with a course code; no shipped credentials; official instance off during testing (`11_minimal_system.md` section 5). **Ops note (no code):** keep nginx `access.log` for 18-25 Nov. G1's many "you tried while we were under DoS" rebuttals had no evidence attached; our logs would give it |

### Summary of non-ALREADY items, most valuable first

1. **ADAPT: live post-deploy smoke script** with exact assertions (#49). Catches the G1 class "prod config exposed the backend" and gives evidence for rebuttals. About 30 lines of bash.
2. **ADOPT: fail-closed key loading** when the database already holds data (#38). Prevents G1's silent key swap and its whole-chain rewrite. 3 lines plus a test (SR6, P4).
3. **ADOPT: secrets check on the package** (`git ls-files` grep plus `git archive`) (#46/50). G1 shipped its TLS key and a DB dump. 1 line.
4. **ADAPT: `npm test` gate in `install.sh`** for every redeploy (#47). 1 line.
5. **ADOPT: drop `http2`** from our nginx `listen` lines (#34b). Removes an attack class classmates tried on G1 (L32) at no cost. Modest real risk either way.
6. **ADAPT (optional): practice-only health-probe restart timer** (#33). Never on the official instance.

Everything else G1 did is either already in our code (usually in a stricter form: session timeouts, rate-limit keying, the anchored keyed chain, CSP, proxy trust) or tied to features we cut (uploads, chat, TOTP, roles, JWT).
