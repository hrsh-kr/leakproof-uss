#!/usr/bin/env bash
# Read-only checks to run FIRST on the VM, before install.sh. Changes nothing, needs no root
# (a few checks say "unknown" without it; run it with sudo for the full picture).
#   bash deploy/preflight.sh            exit code 1 if any check FAILs
# Prints PASS, WARN or FAIL per line. Safe to run at any time, also on a live system.
set -uo pipefail
fail=0
pass() { printf 'PASS  %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; }
bad()  { printf 'FAIL  %s\n' "$*"; fail=1; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "== system"
. /etc/os-release 2>/dev/null && pass "OS: ${PRETTY_NAME:-unknown}" || warn "cannot read /etc/os-release"
have systemctl && pass "systemd $(systemctl --version | awk 'NR==1{print $2}')" || bad "systemctl missing"
VM_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -n "$VM_IP" ] && pass "VM address: $VM_IP" || bad "no IPv4 address found"
[ -e /proc/net/if_inet6 ] && warn "IPv6 is enabled (the firewall script covers it; the app limiter keys on the full address)" || pass "IPv6 off"

echo "== runtime"
if have node; then
  np="$(readlink -f "$(command -v node)")"
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=5)?0:1)'; then pass "node $(node -v) at $np"; else bad "node $(node -v): need >= 22.5 (node:sqlite)"; fi
  case "$np" in /home/*|/root/*) bad "node lives under a home directory ($np): the service has ProtectHome=yes and would fail with 203/EXEC. Install node system-wide." ;; esac
  [ "$np" = /usr/bin/node ] || warn "the unit starts /usr/bin/node; node is at $np (adjust ExecStart or add a symlink)"
else bad "node missing"; fi
for c in npm git curl openssl tar flock sha256sum; do have "$c" && pass "$c present" || bad "$c missing"; done
if have caddy; then pass "$(caddy version | head -1)"; else bad "caddy missing"; fi
have gpg && pass "gpg present (optional, for encrypting key backups)" || warn "gpg missing (optional)"
have shellcheck && pass "shellcheck present" || warn "shellcheck missing (CI runs it)"

echo "== firewall"
have iptables && pass "iptables: $(iptables -V 2>/dev/null)" || bad "iptables missing (apt install iptables)"
if have ufw; then
  st="$(ufw status 2>/dev/null | head -1 || true)"
  if [ -z "$st" ]; then warn "ufw installed; status unknown without root"; else pass "ufw: $st"; fi
else warn "ufw not installed (firewall.sh then uses plain iptables)"; fi
for m in xt_connlimit xt_hashlimit xt_comment; do
  if [ -d /sys/module/$m ] || modinfo "$m" >/dev/null 2>&1; then pass "kernel module $m available"; else warn "kernel module $m not found (that rule is skipped by firewall.sh)"; fi
done

echo "== ssh and sudo"
ME="${SUDO_USER:-$(id -un)}"; MYHOME="$(getent passwd "$ME" | cut -d: -f6)"
if id -nG "$ME" 2>/dev/null | tr ' ' '\n' | grep -qxE 'sudo|admin|wheel'; then pass "$ME is in a sudo group"; else warn "$ME is not in a sudo group: release.sh and install.sh need root"; fi
sudo -n true 2>/dev/null && pass "sudo works without a password prompt (cached or NOPASSWD)" || warn "sudo will ask for the password (fine: run sudo -v before the scripts)"
if [ -s "$MYHOME/.ssh/authorized_keys" ] && grep -qE '^(ssh-|ecdsa-|sk-)' "$MYHOME/.ssh/authorized_keys"; then pass "$ME has an authorized SSH key (harden-ssh.sh can be used)"; else warn "no authorized SSH key for $ME: do NOT run harden-ssh.sh yet"; fi

echo "== ports (should be free before install)"
if have ss; then
  for p in 80 2019 7090 7443 8080 8443 9090 9443; do
    l="$(ss -Htlnp "sport = :$p" 2>/dev/null | head -1)"
    [ -z "$l" ] && pass "port $p free" || warn "port $p in use: $(awk '{print $6}' <<<"$l")  (fine if it is already LeakProof or Caddy)"
  done
else warn "ss missing: ports not checked"; fi

echo "== disk"
for d in / /var/lib /srv /var/log; do
  [ -d "$d" ] || continue
  free_mb="$(df -Pm "$d" | awk 'NR==2{print $4}')"
  if [ "$free_mb" -ge 4096 ]; then pass "$d: ${free_mb} MB free"; elif [ "$free_mb" -ge 1024 ]; then warn "$d: only ${free_mb} MB free"; else bad "$d: only ${free_mb} MB free"; fi
done

echo "== existing install"
[ -d /srv/leakproof/releases ] && pass "release layout present ($(ls /srv/leakproof/releases | tr '\n' ' '))" || warn "no /srv/leakproof/releases yet (install.sh creates it)"
[ -d /etc/leakproof ] && pass "/etc/leakproof exists" || warn "/etc/leakproof absent (first install)"
echo; [ "$fail" = 0 ] && echo "preflight: no blocking problem" || echo "preflight: FIX THE FAIL LINES FIRST"
exit "$fail"
