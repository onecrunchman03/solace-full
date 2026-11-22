#!/usr/bin/env bash
# Solace weekly stability report.
#
# Run on the R220 as root:   sudo bash /opt/solace/deploy/weekly-report.sh
# Then paste the ENTIRE output into a Claude session. Every section is built
# to be read by Claude for the weekly health review: service restarts, error
# tables, journal noise, perf aggregates, economy drift, storage, backups,
# proxy errors, and security counters — the full picture in one paste.
#
# Read-only by design: nothing here mutates the app, the DB, or the system.
# Any missing tool or failed probe prints a note and the report keeps going.

set -u
APP=/opt/solace
DB="$APP/data/solace.db"
BK="${BACKUP_DIR:-/var/backups/solace}"
SINCE="7 days ago"
MS=$(( ($(date +%s) - 7*24*3600) * 1000 ))

say() { echo; echo "===== $1 ====="; }
sq()  { sqlite3 -readonly -column -header "$DB" "$1" 2>&1 || echo "(query failed)"; }

echo "SOLACE WEEKLY REPORT — $(date -u '+%Y-%m-%d %H:%M UTC') (covering last 7 days)"

say "VERSION & SERVICES"
git -C "$APP" log -1 --format="deployed: %h %s (%cr)" 2>/dev/null || echo "(git unavailable)"
echo "node: $(node -v 2>/dev/null || echo '?')  |  host up: $(uptime -p 2>/dev/null || echo '?')"
for u in solace caddy livekit solace-backup.timer; do
  if systemctl cat "$u" >/dev/null 2>&1; then
    printf "%-20s %s  restarts=%s  since=%s\n" "$u" \
      "$(systemctl show -p ActiveState --value "$u")" \
      "$(systemctl show -p NRestarts --value "$u" 2>/dev/null || echo '?')" \
      "$(systemctl show -p ActiveEnterTimestamp --value "$u")"
  else
    echo "$u: (unit not installed)"
  fi
done

say "HEALTH (basic probe)"
curl -fsS --max-time 5 http://127.0.0.1:8443/health || echo "BACKEND NOT ANSWERING"
echo
echo "(deep checks — heartbeats, disk, backups, LiveKit liveness — are in Admin Panel > Overview;"
echo " Sterling DMs admins within 5 min of any red flag, so silence there is itself a signal)"

say "APP ERRORS, LAST 7 DAYS (server exceptions + browser crash reports)"
sq "SELECT count(*) AS distinct_errors, coalesce(sum(count),0) AS total_hits FROM errors WHERE lastAt > $MS;"
echo
sq "SELECT kind, count AS hits, datetime(lastAt/1000,'unixepoch') AS last_seen,
           substr(coalesce(route,'-'),1,28) AS route, substr(message,1,88) AS message
    FROM errors WHERE lastAt > $MS ORDER BY lastAt DESC LIMIT 12;"

say "APP JOURNAL, LAST 7 DAYS"
if command -v journalctl >/dev/null 2>&1; then
  TOTAL=$(journalctl -u solace --since "$SINCE" -q --no-pager 2>/dev/null | wc -l)
  BAD=$(journalctl -u solace --since "$SINCE" -q --no-pager 2>/dev/null | grep -Eic "error|failed|exception|refused|cannot|fatal" || true)
  echo "lines: $TOTAL   error-ish: $BAD   (last 20 error-ish lines below)"
  journalctl -u solace --since "$SINCE" -q --no-pager 2>/dev/null \
    | grep -Ei "error|failed|exception|refused|cannot|fatal" | tail -20
else
  echo "(journalctl unavailable)"
fi

say "PERFORMANCE, LAST 7 DAYS (1-min samples)"
sq "SELECT count(*) AS samples, round(avg(cpu),1) AS avg_cpu, round(max(cpu),1) AS max_cpu,
           round(max(load1),2) AS max_load, round(max(rssMb)) AS max_rss_mb,
           round(min(diskFreeGb),1) AS min_disk_free_gb, max(wsClients) AS max_ws,
           max(httpReqs) AS max_http_per_min
    FROM perf_samples WHERE at > $MS;"

say "ECONOMY SNAPSHOTS (drift check — total should only move with real mint/burn)"
# The goblin vault is part of the conserved constant (migration 75): a loan
# draw moves vault -> wallets and a repayment the reverse, so a total WITHOUT
# the vault term drifts on every loan. Pre-75 rows have vault NULL and print
# unmeasured rather than a number that cannot be compared.
# houseMints (migration 95) is the house paying a Tier-4 member's goblin debt
# into the vault — the one sanctioned mint the lender sees — and is subtracted.
# grant (migration 99) is Async's research budget: a relic turn-in moves it
# grant -> wallet and a purchase at Threshold-4 moves it back, so it belongs
# in the total for exactly the vault's reason. Pre-99 rows read 0.
# exchangeFloat (Oct 2026): the desk's float is part of the constant too —
# a winning close moves float -> wallet. Rows before the fix read unmeasured.
sq "SELECT day, totalCoins, escrow, potPending, vault, coalesce(\"grant\",0) AS grant, coalesce(houseMints,0) AS houseMints, exchangeFloat,
           CASE WHEN vault IS NULL OR exchangeFloat IS NULL THEN 'unmeasured' ELSE (totalCoins+escrow+potPending+vault+coalesce(\"grant\",0)+exchangeFloat-coalesce(houseMints,0)) END AS total
    FROM economy_snapshots ORDER BY day DESC LIMIT 8;"

say "ADMIN AUDIT TRAIL, LAST 7 DAYS"
sq "SELECT count(*) AS actions FROM audit WHERE at > $MS;"
sq "SELECT datetime(at/1000,'unixepoch') AS at_utc, coalesce(actorId,'auto') AS actor,
           action, substr(coalesce(detail,''),1,60) AS detail
    FROM audit WHERE at > $MS ORDER BY at DESC LIMIT 10;"

say "STORAGE"
df -h / | tail -1 | awk '{print "root fs: " $3 " used / " $2 " (" $5 "), " $4 " free"}'
for d in avatars banners sounds attachments pageicons music surfaces; do
  [ -d "$APP/data/uploads/$d" ] && du -sh "$APP/data/uploads/$d" 2>/dev/null
done
[ -d "$APP/emoji" ] && du -sh "$APP/emoji" 2>/dev/null
ls -lh "$DB" 2>/dev/null | awk '{print "db: " $5}'
if [ -f "$DB-wal" ]; then
  WAL=$(stat -c %s "$DB-wal" 2>/dev/null || echo 0)
  echo "wal: $(( WAL / 1024 / 1024 )) MB $( [ "$WAL" -gt 52428800 ] && echo '<-- LARGE: checkpoint starvation?' )"
fi

say "BACKUPS ($BK)"
if [ -d "$BK" ]; then
  echo "archives: $(ls "$BK"/*.tar.gz 2>/dev/null | wc -l)   newest three:"
  ls -lht "$BK"/*.tar.gz 2>/dev/null | head -3
else
  echo "BACKUP DIR MISSING"
fi

say "CADDY (proxy), LAST 7 DAYS"
if command -v journalctl >/dev/null 2>&1; then
  echo "journal errors: $(journalctl -u caddy --since "$SINCE" -p err -q --no-pager 2>/dev/null | wc -l) (last 5 below)"
  journalctl -u caddy --since "$SINCE" -p err -q --no-pager 2>/dev/null | tail -5
fi
if [ -f /var/log/caddy/solace.log ]; then
  echo "5xx responses in current access log (502/503 spikes = backend down mid-request):"
  grep -o '"status":5[0-9][0-9]' /var/log/caddy/solace.log 2>/dev/null | sort | uniq -c || echo "  none"
fi
echo "certificate:"
echo | timeout 8 openssl s_client -connect solace.zone:443 -servername solace.zone 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null || echo "  (cert probe failed — check manually if repeated)"

say "LIVEKIT (voice), LAST 7 DAYS"
if systemctl cat livekit >/dev/null 2>&1 && command -v journalctl >/dev/null 2>&1; then
  echo "journal errors: $(journalctl -u livekit --since "$SINCE" -p err -q --no-pager 2>/dev/null | wc -l) (last 5 below)"
  journalctl -u livekit --since "$SINCE" -p err -q --no-pager 2>/dev/null | tail -5
else
  echo "(livekit unit not installed)"
fi

say "SECURITY"
if command -v fail2ban-client >/dev/null 2>&1; then
  fail2ban-client status sshd 2>/dev/null | grep -E "Currently banned|Total banned" || echo "(fail2ban sshd jail not found)"
else
  echo "(fail2ban not installed)"
fi
if command -v journalctl >/dev/null 2>&1; then
  echo "app account lockouts (brute-force backoff hits): $(journalctl -u solace --since "$SINCE" -q --no-pager 2>/dev/null | grep -c '\[security\]' || true)"
fi

# The sign-in ledger (migration 65). The app's own weekly report covers this
# in prose; these are the raw numbers, straight out of the DB, so the two can
# be compared if they ever disagree.
echo
echo "sign-in attempts, last 7 days:"
sq "SELECT outcome, count(*) AS n, count(DISTINCT ip) AS addresses
    FROM login_events WHERE at > $MS GROUP BY outcome ORDER BY n DESC;"
echo
echo "addresses that tried more than one username (a stuffing run's signature):"
sq "SELECT ip, count(DISTINCT username) AS names, count(*) AS attempts,
           datetime(max(at)/1000,'unixepoch') AS last_seen
    FROM login_events
    WHERE at > $MS AND outcome IN ('bad_password','bad_secret','unknown_user','locked','rate_limited','reset_failed')
    GROUP BY ip HAVING names > 1 ORDER BY names DESC, attempts DESC LIMIT 8;"
echo
echo "new-network verifications + password resets (both mean full credentials changed hands):"
sq "SELECT datetime(at/1000,'unixepoch') AS at_utc, username, outcome, ip
    FROM login_events
    WHERE at > $MS AND outcome IN ('challenge_passed','reset_ok','secret_changed')
    ORDER BY at DESC LIMIT 10;"
echo
sq "SELECT count(*) AS live_sessions, count(DISTINCT userId) AS accounts,
           datetime(min(createdAt)/1000,'unixepoch') AS oldest_issued
    FROM sessions;"

# The host collector's own view, if it's installed (deploy/README §10).
SNAP="$APP/data/security-snapshot.json"
if [ -f "$SNAP" ]; then
  AGE=$(( ( $(date +%s) - $(stat -c %Y "$SNAP" 2>/dev/null || echo 0) ) / 60 ))
  echo
  echo "host security snapshot (${AGE}m old; over 30 means the timer is stuck):"
  grep -o '"name":"[^"]*","ok":false[^}]*' "$SNAP" 2>/dev/null | head -8 || echo "  (all host checks green)"
else
  echo
  echo "host security collector NOT INSTALLED (deploy/README.md section 10) — the"
  echo "  machine layer of Admin Panel > Security is blind on this box."
fi
[ -f /var/run/reboot-required ] && echo "REBOOT REQUIRED (kernel/libc update pending)" || echo "no reboot pending"
echo "packages upgradable: $(apt list --upgradable 2>/dev/null | grep -c upgradable || echo '?') (unattended-upgrades handles security patches)"

echo
echo "===== END OF REPORT — paste everything above into Claude ====="
