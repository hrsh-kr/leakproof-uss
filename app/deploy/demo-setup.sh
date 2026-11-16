#!/usr/bin/env bash
# Build the DEMO instance: three independent pods (8 accounts each: 2 setters, exam cell, 5 key holders) running
# in official mode, so graders and testers can run the full 3-of-5 flow without disturbing each other.
#   sudo bash deploy/demo-setup.sh [--force]
# What it changes: creates the demo exam data in /var/lib/leakproof/demo with scripts/official-setup.mjs --demo
# (accounts WITHOUT forced passphrase change); writes the credentials table to /etc/leakproof/demo-credentials.md
# (root, 0600, outside the repo, never commit it); takes a golden snapshot /var/backups/leakproof/golden-demo.tgz
# (+ .sha256); enables leakproof@demo and the nightly lp-demo-reset.timer (04:00).
# Prints NO passphrase. Re-running is refused when demo data exists (new random passphrases would invalidate the
# posted file); --force moves the old data to /var/lib/leakproof/quarantine first and builds anew.
# Prerequisites: install.sh and one release.sh ran (needs /srv/leakproof/current with official-setup.mjs supporting
# --demo and --out); Caddy serves 7443 -> 7090. Environment: DEMO_START / DEMO_END (ISO times, default
# 2026-11-18T00:00:00+05:30 / 2026-11-29T23:00:00+05:30).
set -euo pipefail
FORCE=0
case "${1:-}" in --force) FORCE=1 ;; --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; "") ;; *) echo "unknown option $1" >&2; exit 2 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
CUR=/srv/leakproof/current; DATA=/var/lib/leakproof/demo; CRED=/etc/leakproof/demo-credentials.md
GOLD=/var/backups/leakproof/golden-demo.tgz
START="${DEMO_START:-2026-11-18T00:00:00+05:30}"; END="${DEMO_END:-2026-11-29T23:00:00+05:30}"
VM_IP="$(cat /etc/leakproof/vm_ip 2>/dev/null || hostname -I | awk '{print $1}')"
[ -f "$CUR/scripts/official-setup.mjs" ] || { echo "no release deployed ($CUR): run release.sh first" >&2; exit 1; }
grep -q -- '--demo' "$CUR/scripts/official-setup.mjs" && grep -q -- '--out' "$CUR/scripts/official-setup.mjs" \
  || { echo "this release's official-setup.mjs lacks --demo/--out: deploy a newer tag first" >&2; exit 1; }
[ -f /etc/leakproof/demo/server.key ] || { echo "run install.sh first (demo keys missing)" >&2; exit 1; }

if [ -f "$DATA/leakproof.db" ]; then
  [ "$FORCE" = 1 ] || { echo "demo data already exists. Nothing changed. (Restore with lp-demo-reset, or --force to rebuild with NEW passphrases.)"; exit 1; }
  systemctl stop leakproof@demo 2>/dev/null || true
  mv "$DATA" "/var/lib/leakproof/quarantine/demo-before-setup-$(date +%Y%m%d-%H%M%S)"
  install -d -o leakproof -g leakproof -m 0700 "$DATA"
fi
systemctl stop leakproof@demo 2>/dev/null || true
install -d -o leakproof -g leakproof -m 0700 "$DATA" /var/lib/leakproof/quarantine

# Working dir on tmpfs: keys are copied for the leakproof user only for this run, then removed.
W="$(mktemp -d /run/lp-demo.XXXXXX)"; trap 'rm -rf "$W"' EXIT
chown leakproof:leakproof "$W"; chmod 0700 "$W"
install -d -o leakproof -g leakproof -m 0700 "$W/keys"
for k in server.key log.key; do install -o leakproof -g leakproof -m 0400 "/etc/leakproof/demo/$k" "$W/keys/$k"; done

for p in 1 2 3; do
  cat > "$W/pod$p.json" <<JSON
{ "title": "Demo pod $p: B.Tech CS core", "topics": ["Data Structures","Operating Systems","Databases","Computer Networks","Algorithms"],
  "window": { "start": "$START", "end": "$END" }, "seatLimit": 40,
  "people": [
    { "username": "p$p-setter-a", "display": "Setter A", "caps": ["submit"] },
    { "username": "p$p-setter-b", "display": "Setter B", "caps": ["submit"] },
    { "username": "p$p-examcell", "display": "Exam cell", "caps": ["run","print"] },
    { "username": "p$p-hold-1", "display": "Key holder 1", "caps": ["hold"] },
    { "username": "p$p-hold-2", "display": "Key holder 2", "caps": ["hold"] },
    { "username": "p$p-hold-3", "display": "Key holder 3", "caps": ["hold"] },
    { "username": "p$p-hold-4", "display": "Key holder 4", "caps": ["hold"] },
    { "username": "p$p-hold-5", "display": "Key holder 5", "caps": ["hold"] } ] }
JSON
  chown leakproof:leakproof "$W/pod$p.json"
  runuser -u leakproof -- env LP_MODE=official LP_INSTANCE=demo LP_DATA_DIR="$DATA" LP_KEY_DIR="$W/keys" \
    node --disable-warning=ExperimentalWarning "$CUR/scripts/official-setup.mjs" "$W/pod$p.json" --demo --out "$W/pod$p.md" >/dev/null
  echo "pod $p created"
done

# One credentials file: header once, then the rows of the three pods.
{ echo "# LeakProof demo pods (https://$VM_IP:7443). Shared accounts, restored nightly at 04:00 and on request."
  echo; echo "| role | username | passphrase | recovery code |"; echo "|---|---|---|---|"
  for p in 1 2 3; do grep -E '^\| ' "$W/pod$p.md" | grep -vE '^\| role ' || true; done
} > "$W/all.md"
[ "$(grep -c '^| p[123]-' "$W/all.md")" = 24 ] || { echo "expected 24 account rows; the setup output has an unexpected format. Nothing published." >&2; exit 1; }
install -m 0600 -o root -g root "$W/all.md" "$CRED"

chown -R leakproof:leakproof "$DATA"
(umask 077; tar -czf "$GOLD" -C /var/lib/leakproof demo); chmod 0600 "$GOLD"
(cd "$(dirname "$GOLD")" && sha256sum "$(basename "$GOLD")" > "$GOLD.sha256")
systemctl enable --now leakproof@demo >/dev/null
systemctl enable --now lp-demo-reset.timer >/dev/null
for _ in $(seq 1 30); do curl -fs --max-time 3 http://127.0.0.1:7090/healthz | grep -q '"ok":true' && break; sleep 1; done
curl -fs --max-time 3 http://127.0.0.1:7090/healthz | grep -q '"ok":true' || { echo "demo did not start: journalctl -u leakproof@demo -n 50" >&2; exit 1; }
echo "demo ready: https://$VM_IP:7443/   24 accounts in $CRED (root only)"
echo "golden snapshot: $GOLD   Next: log in as p1-setter-a in a browser and check that the page says Official."
echo "Copy the credentials file to the person who posts it: sudo cat $CRED"
