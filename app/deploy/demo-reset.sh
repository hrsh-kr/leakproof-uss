#!/usr/bin/env bash
# Put the demo instance back to its golden snapshot: same accounts, same passphrases, no leftover exams.
# Installed as /usr/local/sbin/lp-demo-reset; run nightly at 04:00 by lp-demo-reset.timer, and by hand:
#   sudo lp-demo-reset
# What it changes: stops leakproof@demo, MOVES /var/lib/leakproof/demo to /var/lib/leakproof/quarantine/
# demo-<time> (kept, never deleted), unpacks /var/backups/leakproof/golden-demo.tgz (SHA-256 verified first),
# starts the service, waits for /healthz. Nothing happens if the golden snapshot is missing or damaged
# (the running demo is left alone). Practice and official are never touched. Announce resets to testers:
# every demo session ends and open papers lock again.
set -euo pipefail
case "${1:-}" in --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; "") ;; *) echo "unknown option $1" >&2; exit 2 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
G=/var/backups/leakproof/golden-demo.tgz; D=/var/lib/leakproof; TS="$(date +%Y%m%d-%H%M%S)"
[ -f "$G" ] && [ -f "$G.sha256" ] || { echo "no golden snapshot: run demo-setup.sh first. Nothing changed." >&2; exit 1; }
(cd "$(dirname "$G")" && sha256sum -c --quiet "$(basename "$G").sha256") || { echo "golden snapshot FAILS its checksum. Nothing changed." >&2; logger -t lp-demo-reset -p user.crit "golden snapshot damaged"; exit 1; }
tar -tzf "$G" | grep -q '^demo/leakproof.db$' || { echo "golden snapshot has no demo/leakproof.db. Nothing changed." >&2; exit 1; }
systemctl stop leakproof@demo
install -d -m 0700 "$D/quarantine"
[ ! -d "$D/demo" ] || mv "$D/demo" "$D/quarantine/demo-$TS"
tar -xzf "$G" -C "$D"
chown -R leakproof:leakproof "$D/demo"; chmod 0700 "$D/demo"
systemctl start leakproof@demo
for _ in $(seq 1 30); do curl -fs --max-time 3 http://127.0.0.1:7090/healthz | grep -q '"ok":true' && { echo "demo restored from golden snapshot (old data: quarantine/demo-$TS)"; logger -t lp-demo-reset "demo restored"; exit 0; }; sleep 1; done
echo "demo did not come up: journalctl -u leakproof@demo -n 50" >&2; exit 1
