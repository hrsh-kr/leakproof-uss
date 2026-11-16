#!/usr/bin/env bash
# Create the OFFICIAL exam and its accounts from a JSON file (exam night prep, before enable-official.sh). M2 runs it:
#   sudo bash deploy/official-init.sh ~/secrets/official.json [--out /root/official-slips.md]
# What it changes: runs scripts/official-setup.mjs (without --demo: every account must choose a new passphrase at
# first login) against /var/lib/leakproof/official as the leakproof user, with the official keys copied to a tmpfs
# directory for the duration of the run only. Writes the slips table (role, username, passphrase, recovery code)
# to --out (default /root/official-slips-<time>.md, root, 0600) and prints NO passphrase. Print or hand the slips
# in person, then shred the file:  sudo shred -u <file>.
# Refuses when the official instance is running or already has a database (nothing is overwritten or moved).
# Prerequisite: install.sh and a release.sh ran. The JSON is NOT in the repo (deploy/official.example.json is the template).
set -euo pipefail
case "${1:-}" in --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
JSON="${1:?usage: official-init.sh <exam.json> [--out FILE]}"; shift
OUTF="/root/official-slips-$(date +%Y%m%d-%H%M%S).md"
while [ $# -gt 0 ]; do case "$1" in --out) OUTF="${2:?}"; shift 2 ;; *) echo "unknown option $1" >&2; exit 2 ;; esac; done
CUR=/srv/leakproof/current; DATA=/var/lib/leakproof/official
[ -f "$JSON" ] || { echo "no such file $JSON" >&2; exit 1; }
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$JSON" || { echo "$JSON is not valid JSON" >&2; exit 1; }
grep -q -- '--out' "$CUR/scripts/official-setup.mjs" || { echo "this release's official-setup.mjs has no --out: deploy a newer tag" >&2; exit 1; }
! systemctl is-active --quiet leakproof@official || { echo "leakproof@official is running; refusing" >&2; exit 1; }
[ ! -f "$DATA/leakproof.db" ] || { echo "$DATA already has a database; refusing (move it away by hand if you really want a new exam)" >&2; exit 1; }
install -d -o leakproof -g leakproof -m 0700 "$DATA"
W="$(mktemp -d /run/lp-official.XXXXXX)"; trap 'rm -rf "$W"' EXIT
chown leakproof:leakproof "$W"; chmod 0700 "$W"; install -d -o leakproof -g leakproof -m 0700 "$W/keys"
for k in server.key log.key; do install -o leakproof -g leakproof -m 0400 "/etc/leakproof/official/$k" "$W/keys/$k"; done
install -m 0600 -o leakproof -g leakproof "$JSON" "$W/exam.json"
runuser -u leakproof -- env LP_MODE=official LP_INSTANCE=official LP_DATA_DIR="$DATA" LP_KEY_DIR="$W/keys" \
  node --disable-warning=ExperimentalWarning "$CUR/scripts/official-setup.mjs" "$W/exam.json" --out "$W/slips.md"
install -m 0600 -o root -g root "$W/slips.md" "$OUTF"
echo "official exam created. Slips: $OUTF (root only). Next: sudo bash deploy/enable-official.sh"
