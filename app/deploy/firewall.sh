#!/usr/bin/env bash
# LeakProof network rules. Installed as /usr/local/sbin/lp-firewall and run once per boot by
# leakproof-firewall.service (and by install.sh, once, by hand).  Needs root.  Idempotent.
#
# What it changes (it only ever ADDS rules; it never deletes or reorders a rule it did not add):
#   * ufw ACTIVE (the course VM): allow tcp 22 and the web ports through ufw. ufw's policy is left alone.
#   * ufw INACTIVE: plain iptables: loopback, established, SSH, web ports, ICMP, DHCP replies, then
#     policy DROP. The DROP is set only after the SSH accept rule is verified present, and not at all when
#     no listening sshd port can be found, so this script cannot lock you out of the VM.
#   * both: per-source limit of 50 concurrent connections on the web ports, and (if the kernel module
#     exists) a rate limit on NEW ssh connections per source. Every iptables rule carries the comment
#     "lp-fw", so `iptables -S | grep lp-fw` lists exactly what this script added.
# Failure of any optional rule prints a note and continues; the script never blocks the app.
#
# Usage: sudo bash deploy/firewall.sh [--status|--help]
#   FW_ADMIN_IPS="1.2.3.4 5.6.7.8"  these sources are never rate limited on SSH.
set -euo pipefail

WEB_PORTS="8443 7443 9443"
case "${1:-}" in
  --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;;
  --status) command -v ufw >/dev/null && ufw status verbose || true; iptables -S INPUT | grep -E 'lp-fw|^-P' || true; exit 0 ;;
  "") ;;
  *) echo "unknown option $1" >&2; exit 2 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
command -v iptables >/dev/null || { echo "iptables missing: nothing changed (apt install iptables)" >&2; exit 1; }

sysctl -w net.ipv4.tcp_syncookies=1 >/dev/null || true

# Listening sshd ports (the port in use right now, plus the configured one), so an unusual port is not cut off.
ssh_ports() {
  { ss -Htlnp 2>/dev/null | awk '/"sshd"/ {n=split($4, a, ":"); print a[n]}'
    sshd -T 2>/dev/null | awk '$1=="port" {print $2}'     # also right under ssh.socket activation (Ubuntu 24.04)
    [ -n "${SSH_CONNECTION:-}" ] && echo "${SSH_CONNECTION##* }"   # the port this very session came in on
  } | grep -E '^[0-9]+$' | sort -un | tr '\n' ' ' || true
}
SSH_PORTS="$(ssh_ports)"
SSH_ALLOW="$(printf '%s 22' "$SSH_PORTS" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -un | tr '\n' ' ')"

# ours: check (-C) first, then add. POS=append (-A) or POS=front (-I 1, so our limits sit before ufw's chains).
POS=append
ours() {
  iptables -w -C INPUT "$@" -m comment --comment lp-fw 2>/dev/null && return 0
  if [ "$POS" = front ]; then iptables -w -I INPUT 1 "$@" -m comment --comment lp-fw
  else iptables -w -A INPUT "$@" -m comment --comment lp-fw; fi
}
note=()

if command -v ufw >/dev/null && ufw status 2>/dev/null | head -1 | grep -qi '^Status: active'; then
  MODE=ufw
  for p in $SSH_ALLOW $WEB_PORTS; do ufw allow "$p/tcp" >/dev/null && echo "ufw: allow $p/tcp"; done
  POS=front   # ufw's chains sit first in INPUT, so our limits go in front of them
else
  MODE=iptables
  # Order matters: accepts first, policy last.
  ours -i lo -j ACCEPT
  ours -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
fi

# Per-source cap on concurrent connections to the web ports (a hostel NAT counts as one address).
# 25 concurrent connections is enough for any single legitimate browser; 50-thread floods are cut off.
lim_web() { ours -p tcp --syn -m multiport --dports "${WEB_PORTS// /,}" -m connlimit --connlimit-above 25 --connlimit-mask 32 -j REJECT --reject-with tcp-reset; }
lim_web || note+=("connlimit unavailable: skipped")

# Per-source rate limit on NEW TCP connections to the web ports (DOS-08/DOS-10: TLS-handshake flood defence).
# 20 new connections/sec with burst of 40; a human browser makes ≪1/sec, an attacker sending 50+ threads/sec is dropped.
for p in $WEB_PORTS; do
  ours -p tcp --dport "$p" --syn \
    -m hashlimit --hashlimit-name "lp-web-$p" --hashlimit-mode srcip \
    --hashlimit-above 20/sec --hashlimit-burst 40 \
    -j DROP 2>/dev/null \
    || note+=("hashlimit unavailable for web port $p: skipped")
done

# SSH: rate limit on NEW connections per source, with an exemption list. Needs xt_hashlimit; skipped if absent.
for p in $SSH_ALLOW; do
  ours -p tcp --dport "$p" --syn -m hashlimit --hashlimit-name lp-ssh --hashlimit-mode srcip --hashlimit-above 12/min --hashlimit-burst 8 -j DROP 2>/dev/null \
    || note+=("hashlimit unavailable for ssh port $p: skipped")
done
# Exempt admin addresses (inserted last at position 1 so they match before the rate limit).
for ip in ${FW_ADMIN_IPS:-}; do
  for p in $SSH_ALLOW; do iptables -w -C INPUT -s "$ip" -p tcp --dport "$p" -j ACCEPT -m comment --comment lp-fw 2>/dev/null \
    || iptables -w -I INPUT 1 -s "$ip" -p tcp --dport "$p" -j ACCEPT -m comment --comment lp-fw; done
done

if [ "$MODE" = iptables ]; then
  # shellcheck disable=SC2086
  for p in $SSH_ALLOW; do ours -p tcp --dport "$p" -j ACCEPT; done
  ours -p tcp -m multiport --dports "${WEB_PORTS// /,}" -j ACCEPT
  ours -p icmp -j ACCEPT
  ours -p udp --sport 67 --dport 68 -j ACCEPT   # DHCP replies, so the lease can be renewed
  # Safety check before DROP: a listening sshd must be known and its accept rule present.
  if [ -z "${SSH_PORTS// /}" ]; then
    note+=("no listening sshd found: policy left at ACCEPT (nothing is blocked by default)")
  else
    safe=1
    for p in $SSH_PORTS; do iptables -w -C INPUT -p tcp --dport "$p" -j ACCEPT -m comment --comment lp-fw 2>/dev/null || safe=0; done
    if [ "$safe" = 1 ]; then iptables -w -P INPUT DROP; else note+=("ssh accept rule missing: policy left at ACCEPT"); fi
  fi
  if command -v ip6tables >/dev/null && [ -e /proc/net/if_inet6 ]; then
    ours6() { ip6tables -w -C INPUT "$@" -m comment --comment lp-fw 2>/dev/null || ip6tables -w -A INPUT "$@" -m comment --comment lp-fw; }
    ours6 -i lo -j ACCEPT
    ours6 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    for p in $SSH_ALLOW; do ours6 -p tcp --dport "$p" -j ACCEPT; done
    ours6 -p tcp -m multiport --dports "${WEB_PORTS// /,}" -j ACCEPT
    ours6 -p ipv6-icmp -j ACCEPT   # neighbour discovery needs it
    if [ -n "$SSH_PORTS" ]; then ip6tables -w -P INPUT DROP; fi
  fi
fi

echo "firewall: mode=$MODE ssh=[${SSH_ALLOW% }] web=[$WEB_PORTS] rules tagged lp-fw"
for n in "${note[@]:-}"; do [ -n "$n" ] && echo "firewall note: $n"; done
exit 0
