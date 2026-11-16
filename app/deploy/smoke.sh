#!/usr/bin/env bash
# Post-deploy checks against the live VM, run from a laptop (read-only, no root):
#   bash deploy/smoke.sh https://192.168.2.238:8443     practice
#   bash deploy/smoke.sh https://192.168.2.238:7443     demo pods
# Changes nothing on the server except that it burns the caller's login rate-limit bucket for a minute.
# Exit code = number of failures > 0. Expects a build with S11 (unknown paths 404) and the help page.
# Each check asserts an exact status and body or header (G1's self-audits passed for the wrong reasons).
set -uo pipefail
BASE="${1:?usage: smoke.sh https://<host>[:port]}"
HOST="${BASE#https://}"; HOST="${HOST%%/*}"; HOST="${HOST%%:*}"
C=(curl -sk --max-time 10)
fails=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; fails=$((fails + 1)); fi; }
has() { if grep -qi "$2" <<<"$3"; then echo "ok   $1"; else echo "FAIL $1 (missing '$2')"; fails=$((fails + 1)); fi; }
code() { "${C[@]}" -o /dev/null -w '%{http_code}' "$@"; }

# Health and headers.
check "healthz 200" "$(code "$BASE/healthz")" 200
has "healthz body says ok" '"ok":true' "$("${C[@]}" "$BASE/healthz")"
check "help page 200" "$(code "$BASE/help.html")" 200
check "/admin 404 (no SPA catch-all)" "$(code "$BASE/admin")" 404
check "/metrics 404" "$(code "$BASE/metrics")" 404
H="$("${C[@]}" -D - -o /dev/null "$BASE/")"
for h in 'strict-transport-security: max-age' 'content-security-policy:' 'x-frame-options: DENY' 'x-content-type-options: nosniff'; do has "/ has $h" "$h" "$H"; done
if grep -qi '^server:' <<<"$H"; then echo "FAIL server version shown"; fails=$((fails + 1)); else echo "ok   no server version"; fi
check "/.env 404" "$(code "$BASE/.env")" 404
check "/.git/config 404" "$(code "$BASE/.git/config")" 404
E="$("${C[@]}" -D - -o /dev/null "$BASE/.env")"
has "/.env reply has nosniff" 'x-content-type-options: nosniff' "$E"
check "unknown API 404" "$(code "$BASE/api/nope")" 404

# A malformed request target must not kill the service (it used to).
check "GET //a:b is 400" "$(code --path-as-is "$BASE//a:b")" 400
sleep 1
check "still up after GET //a:b" "$(code "$BASE/healthz")" 200

# CSRF: a state change from another site is refused.
check "foreign Origin 403" "$(code -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{"username":"a","password":"b"}' "$BASE/api/login")" 403

# Login flood: 429 arrives, with Retry-After.
got=""
for i in $(seq 1 60); do
  R="$("${C[@]}" -D - -o /dev/null -X POST -H 'Content-Type: application/json' -d '{"username":"smoke-nobody","password":"x"}' "$BASE/api/login")"
  if grep -q '^HTTP/[0-9.]* 429' <<<"$R"; then got="$R"; break; fi
done
if [ -n "$got" ]; then echo "ok   login flood gets 429"; has "429 has Retry-After" 'retry-after:' "$got"; else echo "FAIL no 429 after 60 logins"; fails=$((fails + 1)); fi

# The Node ports (8080 practice, 7090 demo, 9090 official), plain HTTP and the Caddy admin API are not reachable from outside.
for p in 8080 7090 9090 80 2019; do
  if curl -s --max-time 3 -o /dev/null "http://$HOST:$p/healthz"; then echo "FAIL port $p reachable"; fails=$((fails + 1)); else echo "ok   port $p closed"; fi
done

echo "$fails failure(s)"
exit $((fails > 0))
