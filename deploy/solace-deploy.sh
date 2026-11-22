#!/usr/bin/env bash
# THE DEPLOY, AS ONE COMMAND (Josh, Oct 2026: "i want this deployment
# automated by you"). Installed root-owned at /usr/local/sbin/solace-deploy by
# setup-auto-deploy.sh, and the ONLY thing josh may run through sudo without a
# password (/etc/sudoers.d/solace-deploy). So the whole deploy is:
#
#   ssh you@YOUR_SERVER_IP sudo -n /usr/local/sbin/solace-deploy
#
# It takes NO arguments (any are ignored) — a password-free sudo rule must not
# be a door to anything else. The code comes from GitHub over the server's own
# read-only deploy key; every npm step runs as the unprivileged `solace` user;
# root only fixes the client's read bits and restarts the service.
# It is R220-SETUP-GUIDE.txt's "UPDATING THE SERVER" list, plus a health check.
set -euo pipefail
exec 9>/run/solace-deploy.lock
flock -n 9 || { echo "a deploy is already running"; exit 1; }

LOG=/var/log/solace-deploy.log
exec > >(tee -a "$LOG") 2>&1
echo "=== deploy $(date -Is) ==="

cd /opt/solace
before=$(sudo -u solace git rev-parse --short HEAD)
sudo -u solace git pull --ff-only
after=$(sudo -u solace git rev-parse --short HEAD)
echo "code: $before -> $after"

sudo -u solace npm ci --no-audit --no-fund
# --noEmitOnError (Oct 2026 review): plain tsc writes every .js even on a
# type error, so a failed deploy left a half-checked server in dist/ for the
# next restart (a crash, a reboot) to pick up.
sudo -u solace npx tsc --noEmitOnError
(cd client && sudo -u solace npm ci --no-audit --no-fund && sudo -u solace npm run build)
# As the files' owner, and never through a link: as root, chmod -R follows a
# symlink named on its command line, and the build that made dist runs code
# the solace user can edit (Oct 2026 review).
[ -d /opt/solace/client/dist ] && [ ! -L /opt/solace/client/dist ] || { echo "client/dist is missing or a link — refusing"; exit 1; }
sudo -u solace chmod -R o+rX /opt/solace/client/dist   # the build recreates dist

systemctl restart solace
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:8443/health; then
    echo "healthy after ${i}s — deployed $after"
    exit 0
  fi
  sleep 1
done
echo "NOT HEALTHY 30s after restart — last log lines:"
journalctl -u solace -n 40 --no-pager
exit 1
