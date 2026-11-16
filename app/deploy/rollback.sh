#!/usr/bin/env bash
# Switch back to the previous release. Installed as /usr/local/sbin/lp-rollback (a copy that does not depend on
# the release tree, so it works even when /srv/leakproof/current is broken). Run by a team member:
#   sudo lp-rollback [--instance practice|demo|official]
# What it changes: /srv/leakproof/current (atomic symlink swap), /srv/leakproof/previous (now holds the release
# just left, so running it twice swaps back), and restarts leakproof@<instance>, then health-checks it.
# Release directories and data are never touched. Rolling back is safe while releases share the database
# schema (the only migration so far is additive). Official needs FORCE_OFFICIAL=1 (restart re-locks the paper).
set -euo pipefail
R=/srv/leakproof; INST=practice
while [ $# -gt 0 ]; do
  case "$1" in --instance) INST="${2:?}"; shift 2 ;; --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; *) echo "unknown option $1" >&2; exit 2 ;; esac
done
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
case "$INST" in practice|demo|official) ;; *) echo "bad instance" >&2; exit 2 ;; esac
[ "$INST" != official ] || [ "${FORCE_OFFICIAL:-0}" = 1 ] || { echo "official: set FORCE_OFFICIAL=1 (the restart re-locks an open paper)" >&2; exit 2; }
case "$INST" in practice) PORT=8080 ;; demo) PORT=7090 ;; official) PORT=9090 ;; esac
p="$(sed -n 's/^LP_PORT=//p' "/etc/leakproof/$INST.env" 2>/dev/null | tail -1 || true)"; [[ "$p" =~ ^[0-9]+$ ]] && PORT="$p"
[ -s "$R/previous" ] || { echo "no previous release recorded in $R/previous"; exit 1; }
P="$(cat "$R/previous")"; [ -d "$P" ] || { echo "$P is gone"; exit 1; }
CUR="$(readlink -f "$R/current")"
[ "$P" != "$CUR" ] || { echo "previous equals current; nothing to do"; exit 1; }
echo "rolling back: $CUR -> $P"
echo "$CUR" > "$R/previous"
ln -sfn "$P" "$R/current.new" && mv -Tf "$R/current.new" "$R/current"
systemctl restart "leakproof@$INST"
for _ in $(seq 1 30); do curl -fs --max-time 3 "http://127.0.0.1:$PORT/healthz" | grep -q '"ok":true' && { echo "healthy on $P"; exit 0; }; sleep 1; done
echo "NOT healthy after rollback. Run lp-rollback again to swap back, or: journalctl -u leakproof@$INST -n 50"; exit 1
