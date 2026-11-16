#!/usr/bin/env bash
# Operator tool wrapper, installed as /usr/local/sbin/lp-accounts by release.sh:
#   sudo lp-accounts <practice|demo|official> list | show U | activity [--user U --since 2h ...] | top | disable U --reason "..." | enable U | remove U --yes | actions
# What it changes: nothing by itself. It runs scripts/accounts.mjs from the current release as the service user against
# that instance's database, so the web app needs no admin role. disable/enable/remove edit the accounts table only
# (see scripts/accounts.mjs --help). Per-request web traffic (who called what, from which address, with which status)
# is in /var/log/caddy/access.log; this tool shows the application's own log (what accounts DID).
set -euo pipefail
case "${1:-}" in
  --help|-h|"") sed -n '2,/^set -/{/^set -/!p;}' "$0"; echo; echo "commands:"; sudo -u leakproof env LP_DATA_DIR=/var/lib/leakproof/practice node --disable-warning=ExperimentalWarning /srv/leakproof/current/scripts/accounts.mjs --help 2>/dev/null || true; exit 0 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
INST="$1"; shift
case "$INST" in practice|demo|official) ;; *) echo "first argument: practice, demo or official" >&2; exit 2 ;; esac
[ -d "/var/lib/leakproof/$INST" ] || { echo "no data directory for $INST" >&2; exit 1; }
exec sudo -u leakproof env SUDO_USER="${SUDO_USER:-root}" LP_DATA_DIR="/var/lib/leakproof/$INST" LP_INSTANCE="$INST" \
  node --disable-warning=ExperimentalWarning /srv/leakproof/current/scripts/accounts.mjs "$@"
