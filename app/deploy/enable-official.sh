#!/usr/bin/env bash
# Exam night: open the OFFICIAL instance to the network (port 9443) and start it.   Run by M2:
#   sudo bash deploy/enable-official.sh          # create exam + accounts must already exist (official-setup.mjs)
#   sudo bash deploy/enable-official.sh --off    # remove the Caddy site and stop the instance (NOT during an exam)
# What it changes: writes /etc/caddy/leakproof.d/official.caddy (the 9443 site), validates the whole Caddy
# config (a bad file is removed again and nothing is reloaded), reloads Caddy, then enables and starts
# leakproof@official (only if it is not already running: an already running official instance is NEVER
# restarted by this script, a restart re-locks the open paper). Idempotent.
# Prerequisite: deploy/install.sh ran; the official database was prepared with scripts/official-setup.mjs
# (see docs/OPERATIONS.md, "Exam night"). Port 9443 is already allowed by the firewall script.
set -euo pipefail
case "${1:-}" in --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
SNIP=/etc/caddy/leakproof.d/official.caddy
case "${1:-}" in
  --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;;
  --off)
    read -r -p "Stops the official instance and closes 9443. Type STOP: " a; [ "$a" = STOP ] || { echo aborted; exit 1; }
    rm -f "$SNIP"; systemctl reload caddy; systemctl disable --now leakproof@official; echo "official is off"; exit 0 ;;
  "") ;;
  *) echo "unknown option $1" >&2; exit 2 ;;
esac
VM_IP="$(cat /etc/leakproof/vm_ip 2>/dev/null || hostname -I | awk '{print $1}')"
[ -f /var/lib/leakproof/official/leakproof.db ] || { echo "No official database yet. Run scripts/official-setup.mjs first (see OPERATIONS.md)."; exit 1; }
install -d /etc/caddy/leakproof.d
OLD=""
if [ -f "$SNIP" ]; then OLD="$(mktemp)"; cp "$SNIP" "$OLD"; fi
cat > "$SNIP" <<CADDY
# Written by deploy/enable-official.sh. Removing this file closes port 9443 again.
https://$VM_IP:9443 {
	import leakproof 127.0.0.1:9090
}
CADDY
if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5 || true
  if [ -n "$OLD" ]; then mv "$OLD" "$SNIP"; else rm -f "$SNIP"; fi
  echo "Caddy config invalid with the official site: reverted, nothing reloaded" >&2; exit 1
fi
[ -z "$OLD" ] || rm -f "$OLD"
systemctl reload caddy
if systemctl is-active --quiet leakproof@official; then echo "leakproof@official already running: left alone"
else systemctl enable --now leakproof@official; fi
for _ in $(seq 1 20); do curl -fsk --max-time 3 "https://$VM_IP:9443/healthz" | grep -q '"ok":true' && { echo "official is up: https://$VM_IP:9443/"; exit 0; }; sleep 1; done
echo "official did not answer: journalctl -u leakproof@official -n 50" >&2; exit 1
