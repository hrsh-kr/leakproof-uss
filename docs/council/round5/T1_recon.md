# T1 recon: what a scanner-wielding classmate finds

Method: copy of the snapshot on 127.0.0.1:8810 (dev HTTP, temp data), curl, nc, nmap 7.99 (`-sV` plus http scripts; nikto not installed). The deploy review of the real VM is by reasoning only, with no scanning of it. Server killed (nothing listens on 8810).

## Black-box summary (all verified locally)
- Stack: Node `http`, JSON API under `/api`, static SPA. No `Server`, `X-Powered-By` or version header. nmap reports `8810 open unknown` and cannot name the service.
- Every response, including 404, 401, 403, 413, 429, 431 and the 408 sent for a stray blank line, carries CSP, nosniff, DENY, Referrer-Policy, Permissions-Policy, COOP and CORP. API responses carry `Cache-Control: no-store`, static ones `no-cache`. 429 carries `Retry-After`.
- CORS: no `Access-Control-*` header on any reply. A preflight (OPTIONS with a hostile Origin) gets a plain 404. A POST with `Origin: https://evil.example` gets 403.
- Cookie (production): `__Host-lp_sid; Path=/; HttpOnly; SameSite=Strict; Secure`. This is correct (`app.mjs` cookieAttrs). Dev mode drops `Secure` and the prefix.
- Unauthenticated sweep of all 19 session routes: 401. Unknown path or method: 404 (the PUT test was 404). `/api/public/log/:id` and `/api/public/check-head` are public by design.
- Login for an existing versus a missing username: same message, and timing 44 to 55 ms either way (3 samples each). No timing oracle seen.
- Errors: malformed JSON 400, wrong content type 415, a 20 KB body 413, a 9 KB header 431. No stack trace or internal path appeared. A 500 would show only `reference <hex>`.
- Path probes: `/.git/config`, `/.env`, `/app.js.map`, `/server.mjs`, `/src/app.mjs`, `/package.json`, `/../server.mjs`, `/%2e%2e/server.mjs` and `/app.js%00` all gave 404. Static files are an allow-list built at start-up, so there is no traversal surface.
- TRACE and OPTIONS give 404, not 405.

## Findings

| ID | Title | Class | Sev | Evidence / PoC | Impact (valid? found in a week?) | Smallest fix | Conf. |
|---|---|---|---|---|---|---|---|
| F1 | SPA fallback gives soft-404 (200 + HTML) for any extensionless path | scanner noise | low | `/admin`, `/metrics`, `/server-status`, `/debug`, `/deploy/Caddyfile`, `/data/`, `/public/`, `//x` all gave `200 text/html 919` (`app.mjs` static branch: no dot means index.html). | Nikto and dirb will list dozens of "found" paths. A careless classmate may file "Caddyfile exposed". Invalid on rebuttal (the body is the shell), but costs us a rebuttal. Very likely to be filed. | Return the shell only when `Accept` includes text/html and the path has no extra segments (or 404 everything except `/`). Optional. Document in SECURITY.md under "known scanner noise". | high |
| F2 | Wrong method gives 404, never 405 or `Allow` | functional / hygiene | low | `POST /`, `OPTIONS /`, `TRACE /`, `PUT /api/me` all gave 404. | A "functional" report is plausible. Probably Invalid (404 is deliberate, to hide routes). | Leave. Note it in the guide. | high |
| F3 | Public log leaks global counters | info leak | low | `GET /api/public/log/<examId>` returns `chain.entries` (42 on a fresh instance with one signup, all exams) and the global `head`. | Anyone can watch total platform activity and sign-up rate. Needs a valid 128-bit exam id, which is unguessable. Probably Invalid or "by design" (the head is printed on copies). | Return only `total` for that exam, and drop `chain.entries`. Skip if time is short. | high |
| F4 | Username enumeration via register | auth | low | `409 "That username is taken."` versus 201. It needs the course code. Login, recover and timing are uniform. | Probably Invalid (practice only, a code is required). | Leave. | high |
| F5 | Published certificate fingerprint will go stale | deploy / usability | **med** | `install.sh` prints the **leaf** fingerprint of `:8443`. Caddy's internal CA issues short-lived leaves, roughly 12 h by default and auto-renewed (from memory, **unverified**). `USER_GUIDE.md` lines 7 and 8 are still placeholders. | Within a day the guide's fingerprint will not match what testers see. Testers will file "invalid certificate / MITM warning" or "functional: cannot connect". High chance of a report, and it blocks a whole group of testers. | Publish the **root CA** fingerprint (`/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`) and tell testers to import that root. Alternatively give a `curl --cacert root.crt` recipe. Fill the placeholders before 18 Nov 08:00. | med |
| F6 | Port 9443 is open while "official" is off | scanner | low | `Caddyfile` defines both sites and `firewall.sh` accepts 9443. With the upstream down Caddy returns 502. | nmap shows a second TLS service, and a 502 is a "bug" a tester could file (it is the expected state). Probably Invalid. | Either start official early, or add `respond "Not open yet" 503` for 9443 until 25 Nov. Do not change before verifying with `caddy validate`. | med |
| F7 | Firewall DROPs (filtered, not closed); ICMP fully open | scanner | low | `firewall.sh`: policy DROP, `-p icmp -j ACCEPT`, SSH 22 open to everyone. | nmap lists 22, 8443 and 9443 open and the rest `filtered`. Nessus: ICMP timestamp, SSH banner and algorithm notes, a self-signed or untrusted certificate. Informational only. Invalid (out of app scope or intended). | Restrict ICMP to echo-request. SSH is the course VM norm. | med |
| F8 | HSTS `max-age=31536000` on a bare IP | scanner | info | `app.mjs` handle sets it. Browsers ignore HSTS for IP hosts. There is no `includeSubDomains` or `preload`. | A scanner may say "HSTS not effective". Not exploitable. | None. | high |
| F9 | `/healthz` is public and says which instance | info leak | info | `{"ok":true,"instance":"practice"}`, no auth, and it goes through the global per-IP limiter. | Trivial. The client uses it. A tester might write "service fingerprinting". Invalid. | None. | high |
| F10 | Responses to HEAD and 413 (Content-Length path) keep the connection alive | hygiene | info | `413` reply shows `Connection: keep-alive` when Content-Length is over 16 KB. The body is drained (`req.resume`). | The drain makes a slow-drip abuse possible but the header timeout bounds it. Not a finding unless paired with load (DDoS is forbidden). | None. | med |
| F11 | Caddy leaves `Via` and `Date` (unverified) | scanner | info | `Caddyfile` removes only `Server`. I recall `reverse_proxy` adds `Via: 1.1 Caddy`, **unverified**. `smoke.sh` checks only `Server`. | A scanner can name the proxy as Caddy. Harmless. | `header -Via` if `smoke.sh` shows it. | low |

## Deploy-config reading (what Nessus/nmap on 192.168.2.238 would print)
- Open: 22/tcp (OpenSSH), 8443/tcp (TLS), 9443/tcp (TLS, 502 until official starts). 8080 and 9090 are bound to 127.0.0.1 and dropped by the firewall. Caddy admin API (2019) is loopback only. 80 is dropped.
- TLS: self-signed internal CA, IP SAN, HTTP/1.1 only (no ALPN h2, no HTTP/2 Rapid Reset). Caddy defaults mean TLS 1.2 and 1.3, modern ciphers (unverified, nothing scanned). Expected scanner notes: "untrusted certificate chain" and "certificate expires soon".
- Headers added by the app and passed through: the full security set plus HSTS. Caddy removes `Server`.
- `smoke.sh` is sound, but its closed-port check relies on a 3 s timeout against a DROP. A reachable `/healthz` returns 200, which is the intended state.
- `firewall.sh` runs via `ExecStartPre=+`. If `iptables` or `sysctl` is missing on the VM, `set -e` stops the service from starting at all (unverified; check `which iptables` on the VM before the freeze). This is a deploy risk, not a vulnerability.
- The `SECURITY.md` line 42 claim of "blocking of `.env`/`.git` paths" holds only by accident of the static allow-list (they return 404), not by an explicit rule. That is fine, but the wording is loose.

## Verdict
No Valid-grade exploit in the recon surface. Most likely marks loss: **F5** (fingerprint and trust story), then **F1** noise reports needing rebuttals. Both are doc or config fixes, with no app code risk. Do F5 and the placeholders before 17 Nov, and add one line on F1, F2 and F6 to the user guide's "known behaviours".

## Appendix: commands run
`curl -si` against `/`, `/robots.txt`, `/api/me`, `/healthz`, POST `/`, OPTIONS with hostile Origin, TRACE, HEAD. Register and login flows, 413/415/400/431 probes via curl and nc, a sweep of 20 routes without cookie (`/private/tmp/claude-501/t1/sweep.sh`), and `nmap -sV -p 8810,8811 -Pn --script http-headers,http-methods,http-enum,http-security-headers 127.0.0.1` (service unrecognised, fingerprint shown above).
