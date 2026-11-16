#!/usr/bin/env bash
# LeakProof watchdog. Installed as /usr/local/sbin/lp-health and run every 30 s by lp-health@<instance>.timer
# as root.  Usage: lp-health <practice|demo|official>      (also: lp-health --status)
#
# What it does:
#   * asks the instance's deep /healthz on loopback (3 s timeout);
#   * PRACTICE ONLY: after 3 consecutive failures (about 90 s) restarts leakproof@practice, at most 4 times
#     per hour; after that it only raises a critical message;
#   * DEMO and OFFICIAL are ALERT-ONLY. A restart re-locks an opened paper and interrupts a release, so a
#     human decides. Nothing in this script ever restarts them;
#   * a unit that is enabled but not running is reported (never started: a stopped unit may be deliberate);
#   * practice run only: Caddy inactive or the TLS front door failing 3 times in a row restarts Caddy (same
#     budget), disk usage >= 85 % warns and >= 95 % is critical, leaf certificate expiring within 2 h warns.
# Messages go to the journal with tag lp-health:  journalctl -t lp-health --since -1h
# State lives in /run/lp-health (tmpfs, cleared by reboot). It changes nothing else on the system.
set -uo pipefail

STATE="${LP_STATE_DIR:-/run/lp-health}"   # override only for tests
log() { logger -t lp-health -p "user.$1" -- "$2"; echo "$1: $2"; }

if [ "${1:-}" = --status ]; then
  for f in "$STATE"/*.status; do [ -e "$f" ] && echo "$(basename "$f" .status): $(cat "$f")"; done
  exit 0
fi
case "${1:-}" in --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; esac
I="${1:-}"
case "$I" in
  practice) PORT=8080; CPORT=8443; RESTARTS=yes ;;
  demo)     PORT=7090; CPORT=7443; RESTARTS=no ;;
  official) PORT=9090; CPORT=9443; RESTARTS=no ;;
  *) echo "usage: lp-health <practice|demo|official> | --status" >&2; exit 2 ;;
esac
mkdir -p "$STATE"
# An LP_PORT in the instance's env file wins over the default.
if [ -r "/etc/leakproof/$I.env" ]; then p="$(sed -n 's/^LP_PORT=//p' "/etc/leakproof/$I.env" | tail -1)"; [[ "$p" =~ ^[0-9]+$ ]] && PORT="$p"; fi
UNIT="leakproof@$I"

# strikes <name> <ok 0|1>: keeps a consecutive-failure counter in tmpfs and prints it.
strikes() {
  local f="$STATE/$I.$1.fails" n=0
  if [ "$2" = 1 ]; then echo 0 > "$f"; echo 0; return; fi
  n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$f"; echo "$n"
}
# budget <name>: records a restart and succeeds while fewer than 5 happened in the last hour.
budget() {
  local f="$STATE/$I.$1.restarts" now; now=$(date +%s)
  { cat "$f" 2>/dev/null || true; echo "$now"; } | awk -v n="$now" 'n - $1 < 3600' > "$f.new"; mv "$f.new" "$f"
  [ "$(wc -l < "$f")" -le 4 ]
}

status=ok
if systemctl is-active --quiet "$UNIT"; then
  body="$(curl -fs --max-time 3 "http://127.0.0.1:$PORT/healthz" 2>/dev/null || true)"
  if grep -q '"ok":true' <<<"$body"; then
    strikes app 1 >/dev/null
  else
    status="unhealthy"
    n=$(strikes app 0); log warning "$I healthz failed ($n in a row): ${body:-no answer}"
    if [ "$n" -ge 3 ]; then
      if [ "$RESTARTS" = no ]; then
        log crit "$I UNHEALTHY and NOT restarted (alert-only, a restart re-locks the paper): a human decides. See OPERATIONS.md"
      elif budget app; then
        log err "restarting $UNIT"; systemctl restart "$UNIT"; strikes app 1 >/dev/null
      else
        log crit "$UNIT restart budget (4 per hour) used up: a human is needed"
      fi
    fi
  fi
elif systemctl is-enabled --quiet "$UNIT" 2>/dev/null; then
  status="enabled but not running"
  [ "$(systemctl is-active "$UNIT" 2>/dev/null)" = activating ] || log crit "$UNIT is enabled but not running (not started automatically)"
else
  status="off"
fi
echo "$status $(date -u +%FT%TZ)" > "$STATE/$I.status"

# The checks below are shared infrastructure: run them once, from the practice probe.
if [ "$I" = practice ]; then
  if ! systemctl is-active --quiet caddy; then
    log err "caddy inactive"; budget caddy && systemctl restart caddy
  else
    VM_IP="$(cat /etc/leakproof/vm_ip 2>/dev/null || true)"
    if [ -n "$VM_IP" ] && systemctl is-active --quiet "$UNIT"; then
      if curl -fsk --max-time 5 "https://$VM_IP:$CPORT/healthz" 2>/dev/null | grep -q '"ok":true'; then
        strikes caddy 1 >/dev/null
        if ! echo | openssl s_client -connect "127.0.0.1:$CPORT" -servername "$VM_IP" 2>/dev/null | openssl x509 -noout -checkend 7200 >/dev/null 2>&1; then
          log warning "TLS certificate on :$CPORT expires within 2 h (or could not be read)"
        fi
      elif [ "$status" = ok ]; then   # the app answers on loopback but not through Caddy
        n=$(strikes caddy 0); log warning "https front door :$CPORT failed ($n in a row) while the app is healthy"
        if [ "$n" -ge 3 ]; then
          if budget caddy; then log err "restarting caddy"; systemctl restart caddy; strikes caddy 1 >/dev/null
          else log crit "caddy restart budget used up: a human is needed"; fi
        fi
      fi
    fi
  fi
  for d in /var/lib/leakproof /; do
    pct=$(df --output=pcent "$d" 2>/dev/null | tail -1 | tr -dc 0-9)
    [ -n "$pct" ] || continue
    if [ "$pct" -ge 95 ]; then log crit "disk $d ${pct}% used"
    elif [ "$pct" -ge 85 ]; then log warning "disk $d ${pct}% used"; fi
  done
fi
exit 0
