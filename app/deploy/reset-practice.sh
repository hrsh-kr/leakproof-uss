#!/usr/bin/env bash
# Clean-slate recovery of the PRACTICE instance (target: under 2 minutes). Installed as
# /usr/local/sbin/lp-reset-practice; run by whoever is on duty:
#   sudo lp-reset-practice          wipe practice data, keep keys, course code and code release
# What it changes: stops leakproof@practice, MOVES /var/lib/leakproof/practice to /var/lib/leakproof/quarantine/
# practice-<time> (evidence for Part B, nothing is deleted), creates an empty data dir, starts the service and
# waits for /healthz. (A damaged code release is a different problem: lp-rollback, or release.sh <tag> --tarball.)
# Consequences to announce: every practice account and exam is gone; the course code is unchanged; the
# in-memory rate limiters and the 30-sign-ups-per-day counter restart.
# Only practice: demo has lp-demo-reset, official is never reset by script.
set -euo pipefail
case "${1:-}" in
  --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;;
  "") ;;
  *) echo "unknown option $1" >&2; exit 2 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
START=$(date +%s); TS="$(date +%Y%m%d-%H%M%S)"; D=/var/lib/leakproof
systemctl stop leakproof@practice
install -d -m 0700 "$D/quarantine"
if [ -d "$D/practice" ]; then mv "$D/practice" "$D/quarantine/practice-$TS"; echo "old data kept in $D/quarantine/practice-$TS"; fi
install -d -o leakproof -g leakproof -m 0700 "$D/practice"
systemctl start leakproof@practice
for _ in $(seq 1 30); do curl -fs --max-time 3 http://127.0.0.1:8080/healthz | grep -q '"ok":true' && { echo "practice is up, empty. $(( $(date +%s) - START )) s. Course codes: $(f=/etc/leakproof/practice.env; for r in PROF:LP-PROF-G19:professor TA:LP-TA-G19:TA STUDENT:LP-STU-G19:student; do IFS=: read -r k d n <<<"$r"; v="$(sed -n "s/^LP_INVITE_$k=//p" "$f" 2>/dev/null | tail -1)"; printf '%s (%s) ' "${v:-$d}" "$n"; done)"; df -h "$D" | tail -1; exit 0; }; sleep 1; done
echo "practice did not come up: journalctl -u leakproof@practice -n 50" >&2; exit 1
