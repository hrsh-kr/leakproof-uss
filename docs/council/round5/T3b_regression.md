# T3b: regression pass on `app-final` (96 tests pass)

Fresh copy, ports 8830-8833, scripts in the T3 scratchpad `t3/`. Local Node v25.0.0 (VM runs 22.x). All servers killed.

## Status of earlier findings
| ID | Status |
|---|---|
| F1 no-Host reply without headers | Fixed: HTTP/1.1 or 1.0 without Host, and empty `Host:`, give 400 JSON with all 7 headers |
| F2 Expect 417 without headers | Fixed: `Expect: foo` now goes through the normal pipeline. Only the interim `100 Continue` is bare (normal). `CONNECT` still closes with no reply (cosmetic, same as before) |
| F3 no busy_timeout | Changed: timeout now exists, but see N1 |
| F4 Kelvin sign alias | Fixed: `K` login 401, register 400; mixed case, trailing spaces/newline, `a.b-c_` OK; emoji, fullwidth, Devanagari, dotted-I, NUL rejected |
| F5 hidden characters | Fixed for display, text, options (zero-width, bidi, NUL, tab, newline rejected), but see N2. Lone surrogate (U+D800) and U+2028 are still accepted |
| F6 GET side effects via hash route | Reduced: reprint log rows capped at 3 per seat (counter still increments). Route is still auto-fetch |
| F7 unencoded ids in client paths | Still present (info): no `encodeURIComponent`; jsdom re-run: zero injected nodes, `__pwn` undefined on all 13 routes |
| F8 log indexes | Partly fixed: `log_exam` index added; `hash` lookup still a table scan (5 ms at 100k rows, harmless) |
| F9 wrong `server.key` / damaged db | Changed: wrong `log.key` now gives degraded 503 on everything but `/healthz` (good); wrong `server.key` still starts healthy (200); a db cut to 20 KB exits with "malformed"; read-only dir exits clearly; 200 corrupt bytes at offset 60000 passed quick_check (may be a free page, unverified) |
| F10 process handlers | Unchanged, fine |

Malformed-request set (49 cases, plus smuggling/Expect/CL/TE set): no exit, no hang, every reply has the 7 headers (except `CONNECT` no reply and interim 100). Static fallback now 404 for `/%`, `*`, `/%00`, `/..;/`.

## New or still-present problems
| ID | Finding | Sev | Evidence | Fix |
|---|---|---|---|---|
| N1 | `busy_timeout=5000` plus synchronous SQLite blocks the whole event loop | med-low | With another process holding the db, a `GET /api/me` waited 5.4 s and `/healthz` sent 200 ms later took 5179 ms (all clients frozen). A 1.5 s lock was survived (201 in 1599 ms) | Use about 750 ms, or keep 5000 only if blocking is accepted; document that backups must not hold locks |
| N2 | The `\p{Cc}\p{Cf}` ban rejects legitimate text | med (functional bug a classmate can file) | Rejected: Devanagari with ZWJ (`क्ष‍त्र`) and ZWNJ, Persian ZWNJ, emoji ZWJ family, any multi-line question or code. Accepted: plain Devanagari, Arabic, Chinese, Tamil, accents, punctuation, `O(n log n)`, plain emoji, NBSP | Allow U+200C/U+200D (strip them before the distinct-options check) and `\n` in question text only |
| N3 | `LP_MODE=OFFICIAL` (typo or case) silently starts practice mode | med (fail-open) | `loadConfig({LP_MODE:'OFFICIAL'})` gives mode=practice, port 8080, self-registration open. Also `LP_INSTANCE='a b'` silently ignored | If `LP_MODE` is set and not exactly `official` or `practice`, throw and exit |
| N4 | `official-setup` does not validate usernames | low-med (operator footgun) | JSON username `ExamCell` stored as is; login with `ExamCell` or `examcell` gives 401, account unusable. `dean cell` accepted. Display with newline or `|` breaks the `--out` markdown table. A second run on the same dir ends in a raw stack trace | Lowercase and test with the same USERNAME regex, fail with a message; strip `|`/newlines in `cell()` |
| N5 | Paper cap evicts the oldest-opened paper, not the least recently used | low | In-process run: opening 203 papers left 200 in memory; the first 3 became `interrupted` (log `reason: evicted`), copy then says "the server restarted" (misleading). 6 h idle eviction works (just under 6 h open, over 6 h locked; `last` refreshes on copy). Practice users hold 10 exams each, so about 20 accounts could evict a peer's open paper | Re-insert on touch (LRU) and word the message "locked again" |
| N6 | `/healthz` is "deep" for reads only | low | With the db write-locked it still answers 200 while every session request is 500 | Optional: `BEGIN IMMEDIATE; ROLLBACK` probe |
| N7 | Browser deep links such as `/login` or `/exam/x` return raw JSON 404 | low usability | `curl /login` gives 404 JSON (only `/`, `/index.html`, `/help.html`, assets are served). Encoded forms `/%68elp.html`, `/help%2ehtml`, `/help.html%00` 404; `//help.html` serves index; `/%2e/help.html` serves help; HEAD works; POST 404; `help.html` has no script, inline style or external link | Accept, or mention in the guide that links must use `/#/...` |

`--demo`/`--out` work: file mode 0600, 9 rows, demo logins keep the printed passphrase, bad usage exits with the usage line, practice mode refuses to run the script. Official instance: `/api/register` and `/api/practice/reset` 404.
