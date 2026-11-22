#!/usr/bin/env bash
# Solace host security collector — the OS half of Admin Panel > Security.
#
# WHY THIS IS A SEPARATE PROCESS. The app answers "did anyone get into an
# ACCOUNT" from its own database. It cannot answer "did anyone get into the
# BOX", because solace.service is deliberately sandboxed (NoNewPrivileges,
# ProtectSystem=strict, no child processes) and it should stay that way —
# widening a Node process's privileges to power a read-only screen trades real
# containment for a dashboard. So this runs as root on a timer, writes ONE
# json file into the app's data directory, and the app merely reads it.
#
# Install:
#   sudo cp deploy/security-collector.sh /opt/solace/deploy/
#   sudo cp deploy/solace-security.{service,timer} /etc/systemd/system/
#   sudo systemctl daemon-reload && sudo systemctl enable --now solace-security.timer
#
# Read-only by design: nothing here mutates the app, the DB, or the system.
# Any missing tool degrades to a note; the collector never exits non-zero for
# a failed probe, because a crashed collector would silently freeze the panel
# on a stale snapshot.
#
# ONE HONEST CAVEAT, repeated in the panel: if the box is genuinely rooted,
# everything below is editable by the attacker. Local logs can only tell you
# about an intruder who didn't bother to clean up. Off-box, append-only copies
# are the real integrity story.

set -u
APP=${APP_DIR:-/opt/solace}
OUT="$APP/data/security-snapshot.json"
# The draft is written in root's own (private) /tmp, never in the data dir:
# that folder belongs to the app user, who could plant a symlink at a known
# name and have root write through it (Oct 2026 review).
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
OWNER=${SNAPSHOT_OWNER:-solace:solace}
DOMAIN=${SOLACE_DOMAIN:-solace.zone}
# Everything that is SUPPOSED to be listening. Anything else is reported.
# 8443 is the app, and it must be on loopback only — if it ever appears on
# 0.0.0.0 the reverse proxy has been bypassed and Caddy's header rewrite (the
# thing that makes clientIp trustworthy) is no longer in the path.
# 53 + 8081 are the backup Pi-hole (home DNS replica of slopbot's, Oct 2026):
# DNS and its admin page, both LAN-only in ufw — Caddy keeps 80/443.
EXPECT_TCP=${EXPECT_TCP:-"22 53 80 443 7880 7881 8081"}

now_ms=$(( $(date +%s) * 1000 ))
checks=""
notes=""

# --- json helpers ------------------------------------------------------------
# Escape for a JSON string: backslash, quote, then strip control characters.
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/ /g' | tr -d '\000-\037'; }
# check <name> <ok:0|1> <severity> <detail>
check() {
  local sep=""
  [ -n "$checks" ] && sep=","
  local okj="false"; [ "$2" = "1" ] && okj="true"
  checks="$checks$sep{\"name\":\"$(esc "$1")\",\"ok\":$okj,\"severity\":\"$3\",\"detail\":\"$(esc "$4")\"}"
}
note() { notes="$notes$([ -n "$notes" ] && echo " | ")$1"; }

has() { command -v "$1" >/dev/null 2>&1; }

# --- 1. SSH: the front door of the machine -----------------------------------
# An accepted PASSWORD login is the loudest single signal available here. The
# hardening guide sets PasswordAuthentication no, so a successful password
# auth means either the config was changed or the guide was never applied —
# and in both cases the box is reachable by guessing.
if has journalctl; then
  SSHLOG=$(journalctl -u ssh -u sshd --since "24 hours ago" -q --no-pager 2>/dev/null)
  # ANCHORED to sshd's own message (Oct 2026 review): a username can hold
  # spaces, so "Invalid user x Accepted password for root" in a failed
  # attempt counted as an accepted password login and rang the CRIT alarm.
  SSHD_OK='sshd(-session)?\[[0-9]+\]: Accepted'
  ACC_KEY=$(printf '%s\n' "$SSHLOG" | grep -cE "$SSHD_OK publickey for [^ ]+ from " || true)
  ACC_PW=$(printf '%s\n' "$SSHLOG"  | grep -cE "$SSHD_OK password for [^ ]+ from "  || true)
  FAILED=$(printf '%s\n' "$SSHLOG"  | grep -c "Failed password"    || true)
  INVALID=$(printf '%s\n' "$SSHLOG" | grep -c "Invalid user"       || true)
  LASTACC=$(printf '%s\n' "$SSHLOG" | grep -E "$SSHD_OK (password|publickey) for [^ ]+ from " | tail -3 | tr '\n' ';' | cut -c1-300)

  if [ "${ACC_PW:-0}" -gt 0 ]; then
    check "SSH password logins" 0 crit \
      "$ACC_PW password-based SSH login(s) accepted in 24h. Keys only is the rule — check PasswordAuthentication in sshd_config."
  else
    check "SSH password logins" 1 info "None — key authentication only, as configured."
  fi
  check "SSH accepted logins (24h)" 1 info "${ACC_KEY:-0} by key. ${LASTACC:-none}"
  if [ "${FAILED:-0}" -gt 200 ]; then
    check "SSH failed logins (24h)" 0 warn "$FAILED failed passwords, $INVALID for users that don't exist. Normal internet noise unless fail2ban is idle."
  else
    check "SSH failed logins (24h)" 1 info "${FAILED:-0} failed, ${INVALID:-0} at nonexistent users."
  fi
else
  note "journalctl unavailable — SSH history not collected"
fi

# --- 2. fail2ban: is anything actually pushing back? -------------------------
if has fail2ban-client; then
  JAILS=$(fail2ban-client status 2>/dev/null | sed -n 's/.*Jail list:\s*//p' | tr -d '\t')
  if [ -n "${JAILS:-}" ]; then
    SUMMARY=""
    for j in $(echo "$JAILS" | tr ',' ' '); do
      CUR=$(fail2ban-client status "$j" 2>/dev/null | sed -n 's/.*Currently banned:\s*//p')
      TOT=$(fail2ban-client status "$j" 2>/dev/null | sed -n 's/.*Total banned:\s*//p')
      SUMMARY="$SUMMARY $j: ${CUR:-?} now / ${TOT:-?} total;"
    done
    check "fail2ban" 1 info "Jails —$SUMMARY"
  else
    check "fail2ban" 0 warn "Installed but no jails are active — SSH brute force is unthrottled."
  fi
else
  check "fail2ban" 0 warn "Not installed. SSH brute force is unthrottled (see deploy/HARDENING.md)."
fi

# --- 3. Listening sockets vs what we expect ----------------------------------
# The question isn't "is the firewall on", it's "is anything listening that I
# didn't put there" — a shell, a miner, a forgotten test server.
if has ss; then
  # "Public" means bound anywhere that isn't loopback. Match the WHOLE
  # 127.0.0.0/8 block, not just 127.0.0.1: systemd-resolved sits on
  # 127.0.0.53 and 127.0.0.54, and a naive filter reports the machine's own
  # DNS stub as an unexpected public listener. (It did, on first run.)
  PORTS=$(ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' ')
  PUBLIC=$(ss -ltnH 2>/dev/null \
    | awk '$4 !~ /^127\./ && $4 !~ /^\[::1\]/ && $4 !~ /^\[::ffff:127\./ && $4 !~ /%lo:/ {print $4}' \
    | sed 's/.*://' | sort -un | tr '\n' ' ')
  UNEXPECTED=""
  for p in $PUBLIC; do
    case " $EXPECT_TCP " in *" $p "*) ;; *) UNEXPECTED="$UNEXPECTED $p" ;; esac
  done
  if [ -n "$UNEXPECTED" ]; then
    check "Listening ports" 0 crit "UNEXPECTED public listener(s):$UNEXPECTED (expected: $EXPECT_TCP). Identify with: sudo ss -ltnp"
  else
    check "Listening ports" 1 info "Public listeners as expected ($PUBLIC), all others on loopback."
  fi
  # The app itself must never be public — Caddy's header rewrite is what makes
  # the recorded client IP trustworthy, and a direct listener bypasses it.
  if printf '%s' "$PUBLIC" | grep -qw 8443; then
    check "App binding" 0 crit "The Node app is listening PUBLICLY on 8443, bypassing Caddy. Set HOST=127.0.0.1."
  else
    check "App binding" 1 info "The app is on loopback only; all traffic arrives through Caddy."
  fi
  note "tcp listeners: ${PORTS:-none}"
else
  note "ss unavailable — listening sockets not collected"
fi

# --- 4. Firewall -------------------------------------------------------------
if has ufw; then
  UFW=$(ufw status 2>/dev/null | head -1)
  if printf '%s' "$UFW" | grep -qi "active"; then
    RULES=$(ufw status numbered 2>/dev/null | grep -c '^\[' || true)
    check "Firewall (ufw)" 1 info "Active, ${RULES:-0} rules."
  else
    check "Firewall (ufw)" 0 crit "ufw is INACTIVE — every listening port is exposed."
  fi
else
  note "ufw not installed"
fi

# --- 5. Patch state ----------------------------------------------------------
if [ -f /var/run/reboot-required ]; then
  check "Pending reboot" 0 warn "A kernel or libc update is installed but not running. Reboot when convenient."
else
  check "Pending reboot" 1 info "None — the running kernel is the installed one."
fi
if has apt; then
  UPG=$(apt list --upgradable 2>/dev/null | grep -c upgradable || true)
  SEC=$(apt list --upgradable 2>/dev/null | grep -ci security || true)
  # PENDING IS NORMAL FOR UP TO A DAY (Aug 2026, after Sterling nagged the
  # operator four times in one afternoon): kernel USNs publish mid-day, and
  # unattended-upgrades only runs at ~06:15 — so "security updates pending"
  # right after publication is the system WORKING, not failing. Track when
  # the pending state STARTED (a root-owned stamp, since this collector is
  # otherwise stateless) and only raise a warn once the updates have
  # survived a nightly pass (>30h) or the automation itself is off.
  STAMP=/var/lib/solace-security-pending-since
  if [ "${SEC:-0}" -gt 0 ]; then
    [ -f "$STAMP" ] || date +%s > "$STAMP" 2>/dev/null || true
    SINCE=$(cat "$STAMP" 2>/dev/null || date +%s)
    HOURS=$(( ( $(date +%s) - SINCE ) / 3600 ))
    if ! systemctl is-active --quiet apt-daily-upgrade.timer 2>/dev/null; then
      check "Security updates" 0 warn "$SEC security update(s) pending and the apt-daily-upgrade.timer is NOT active — nothing will install them. systemctl enable --now apt-daily-upgrade.timer"
    elif [ "$HOURS" -gt 30 ]; then
      check "Security updates" 0 warn "$SEC security update(s) still pending after ${HOURS}h — they survived a nightly pass, so unattended-upgrades is NOT clearing them. Check /var/log/unattended-upgrades/."
    else
      check "Security updates" 1 info "$SEC security update(s) pending of ${UPG:-0} total, published within the last ${HOURS}h — the nightly unattended-upgrades pass takes them."
    fi
  else
    rm -f "$STAMP" 2>/dev/null || true
    check "Security updates" 1 info "${UPG:-0} package update(s) pending, none flagged security."
  fi
fi

# --- 6. TLS ------------------------------------------------------------------
if has openssl; then
  END=$(echo | timeout 8 openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "${END:-}" ]; then
    DAYS=$(( ( $(date -d "$END" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 ))
    if [ "$DAYS" -lt 10 ]; then
      check "TLS certificate" 0 warn "Expires in $DAYS days ($END). Caddy renews automatically — this being low means renewal is failing."
    else
      check "TLS certificate" 1 info "Valid for $DAYS more days."
    fi
  else
    check "TLS certificate" 0 warn "Could not read the certificate for $DOMAIN."
  fi
fi

# --- 7. Things that shouldn't change quietly ---------------------------------
# Not integrity in the cryptographic sense — a root attacker rewrites these
# too. It catches the careless intruder and, more usefully, catches YOU
# forgetting that you added a key six months ago.
FINGERS=""
for home in /root /home/*; do
  AK="$home/.ssh/authorized_keys"
  [ -f "$AK" ] || continue
  # grep -c PRINTS 0 and EXITS 1 when there are no matches, so the obvious
  # `|| echo 0` appends a second zero and reports "root:00". Swallow the exit
  # status instead of substituting a value.
  COUNT=$(grep -c "^ssh-\|^ecdsa-\|^sk-" "$AK" 2>/dev/null) || true
  FINGERS="$FINGERS $(basename "$home"):${COUNT:-0}"
done
check "SSH authorized keys" 1 info "Keys per account —${FINGERS:- none found}. Any count you can't account for is a back door."

SUDOERS=$(getent group sudo 2>/dev/null | cut -d: -f4)
check "Sudo group" 1 info "Members: ${SUDOERS:-none}"

# --- 8. Services -------------------------------------------------------------
if has systemctl; then
  SVC=""
  for u in solace caddy livekit; do
    systemctl cat "$u" >/dev/null 2>&1 || continue
    ST=$(systemctl show -p ActiveState --value "$u" 2>/dev/null)
    NR=$(systemctl show -p NRestarts --value "$u" 2>/dev/null)
    SVC="$SVC $u=$ST(restarts:$NR);"
  done
  check "Services" 1 info "${SVC:-none installed}"
fi

# --- write it out ------------------------------------------------------------
{
  printf '{"at":%s,' "$now_ms"
  printf '"host":"%s",' "$(esc "$(hostname 2>/dev/null || echo unknown)")"
  printf '"uptime":"%s",' "$(esc "$(uptime -p 2>/dev/null || echo unknown)")"
  printf '"notes":"%s",' "$(esc "${notes:-}")"
  printf '"checks":[%s]}' "$checks"
} > "$TMP" 2>/dev/null

# Into place without ever following a link: a fresh random name opened
# O_EXCL|O_NOFOLLOW, owner and mode set on the open file, then renamed over
# the snapshot (a rename replaces a symlink, it does not write through one).
python3 - "$TMP" "$OUT" "$OWNER" <<'PY' 2>/dev/null || true
import os, sys, pwd, grp, secrets
src, out, owner = sys.argv[1:4]
u, _, g = owner.partition(":")
uid = pwd.getpwnam(u).pw_uid
gid = grp.getgrnam(g or u).gr_gid
new = os.path.join(os.path.dirname(out), ".snapshot." + secrets.token_hex(8))
fd = os.open(new, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
try:
    with open(src, "rb") as f:
        os.write(fd, f.read())
    os.fchown(fd, uid, gid)
    os.fchmod(fd, 0o640)
finally:
    os.close(fd)
os.rename(new, out)
PY
exit 0
