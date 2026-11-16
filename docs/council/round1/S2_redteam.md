# S2 Red-team: how 8+ classmates will break us (role-played lens)

Facts from files: current API has a single shared `x-admin-key` header (`api/_lib/auth.js`), no rate limit anywhere in `api/`, no sessions or roles. `site/.env.local` holds live Upstash and Vercel OIDC tokens; `.gitignore` covers it but a plain `scp`/`rsync`/zip of `site/` does not. Pipeline demo runs all crypto in browser JS.

## (a) Top 10, ranked by likelihood x damage

| # | Attack | L | D |
|---|---|---|---|
| 1 | Missing server-side authz: change role or ID in the request, hit `/api/*` unauthenticated, reach another setter's cell (IDOR) | H | H |
| 2 | Secrets and keys in client JS, or shipped in the deploy (`.env.local`, shares or seed in DOM/localStorage/HAR) | H | H |
| 3 | Stored/DOM XSS in question text, names, log viewer (`innerHTML` is used in many files) | H | M |
| 4 | Plaintext in logs, errors, stack traces, DB, `/export` | H | H |
| 5 | Admin/debug/seed routes and default credentials; the shared admin key | H | H |
| 6 | Brute force login/admin key, no lockout | H | M |
| 7 | Replay of submission, release token, unlock; double-submit races | M | H |
| 8 | Unauthenticated reset or "create user" endpoints | M | H |
| 9 | Injection (SQL, path traversal, JSON shape, huge payload) | M | M |
| 10 | VM/OS: open ports (DB, SSH password login, debug), world-readable data dir, app as root, no TLS | M | H |

DoS is likely but cheap to excuse (see d).

## (b) Hardening, 2 days

| Option | Pros | Cons |
|---|---|---|
| A. One server, default-deny middleware, session cookies (HttpOnly, SameSite) + CSRF token, role table checked per route | Kills #1,#5,#8 together; matches AB-08/09 | Needs discipline on every route |
| B. Keep key-header auth, add per-role keys | Fast | Keys in client; fails #2, #6 |
| C. Reverse proxy (nginx/Caddy) with TLS, rate limits, only 443 open | Cheap, covers #6,#10 | Does nothing for logic bugs |

**Recommend A + C.** Checklist: route-matrix test that fails on any unlisted route; every handler takes the user from the session, never the body; ownership check on every ID; `textContent` not `innerHTML`, CSP `default-src 'self'`; argon2/scrypt hashes; 5 failures -> lockout plus per-IP limit; body size cap; single-use nonces with expiry; strict schema validation; generic error bodies, stack traces only to a root-only log; redaction test greps logs for canary strings; no seed/demo accounts in the final build; rotate and delete `.env.local`, deploy from `git archive`; SSH keys only, firewall to 22/443, app as non-root, data dir 0700; `npm audit`.

## (c) Our own break-it day (Sat 15 Nov)

Run AB-01 to AB-31 as a checklist plus the ten above, with two reviewers who did not write the code. Log each finding **before** fixing in `logs/vulnerabilities.csv`: `id, AB-ref, class (CWE name), where, proof (screenshot path), cause, fix commit, retest result, lesson`. Classes map to the video: Access control, Injection/XSS, Secrets exposure, Auth/session, Replay/race, Misconfig, DoS. Keep failed attacks too (evidence of "requirement satisfied"). Re-run the whole list after the 17 Nov freeze; a fix commit needs a regression test.

## (d) Declare out of scope

Volumetric DoS and flooding the shared VM; compromise of the course VM host or other teams' VMs; physical access, shoulder surfing, camera photos of a printed paper (we trace, not prevent); social engineering of officials; browser/OS zero-days; quantum; k colluding custodians (the Shamir limit); attacks on the AI pair-programmer or supply chain beyond `npm audit`; the Phase I research-site admin on Vercel (separate system).

**Biggest risk:** one forgotten route that skips the default-deny check.
