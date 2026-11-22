#!/usr/bin/env bash
# ONE-TIME SETUP for automated deploys (Josh, Oct 2026). Run once, as root:
#
#   sudo bash setup-auto-deploy.sh
#
# What it does, and nothing else:
#   1. Gives the `solace` user its own SSH key (/opt/solace/.ssh/id_ed25519)
#      and points the repo at GitHub over SSH. The PUBLIC key is printed at the
#      end; it is added to the repo as a READ-ONLY deploy key (Claude does that
#      with Josh's GitHub CLI sign-in). From then on `git pull` needs no token.
#      GitHub's host key is checked against its published fingerprint, not
#      trusted on first sight.
#   2. Installs /usr/local/sbin/solace-deploy (root-owned; the deploy steps from
#      R220-SETUP-GUIDE.txt plus a health check) and a sudoers rule letting
#      josh run THAT ONE FILE without a password — nothing else.
#   3. Finishes a staged desktop-shell release if one is waiting in
#      ~josh/desktop-<version>/ (the Mac 0.3.6 step).
# Re-running it is harmless: an existing key is kept, files are replaced.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO=/opt/solace
SSHD="$REPO/.ssh"

# ---- 1. the server's own read-only way into the repo -------------------------
install -d -o solace -g solace -m 700 "$SSHD"
if [ ! -f "$SSHD/id_ed25519" ]; then
  sudo -u solace ssh-keygen -t ed25519 -N "" -C "solace@r220 deploy (read-only)" -f "$SSHD/id_ed25519" -q
fi
# GitHub's published ed25519 host key fingerprint (docs.github.com, "GitHub's
# SSH key fingerprints"). A mismatch stops the setup rather than trusting it.
GH_FP="SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"
SCAN="$(ssh-keyscan -t ed25519 github.com 2>/dev/null)"
FP="$(echo "$SCAN" | ssh-keygen -lf - | awk '{print $2}')"
if [ "$FP" != "$GH_FP" ]; then
  echo "github.com's host key fingerprint is $FP, expected $GH_FP — stopping."
  exit 1
fi
echo "$SCAN" > "$SSHD/known_hosts"
chown solace:solace "$SSHD/known_hosts"
chmod 644 "$SSHD/known_hosts"
sudo -u solace git -C "$REPO" remote set-url origin git@github.com:onecrunchman03/Solace.git

# ---- 2. the deploy command and the one sudo rule ------------------------------
install -o root -g root -m 755 "$HERE/solace-deploy.sh" /usr/local/sbin/solace-deploy
RULE=/etc/sudoers.d/solace-deploy
TMP="$(mktemp)"
echo "josh ALL=(root) NOPASSWD: /usr/local/sbin/solace-deploy" > "$TMP"
visudo -cf "$TMP" >/dev/null
install -o root -g root -m 440 "$TMP" "$RULE"
rm -f "$TMP"
touch /var/log/solace-deploy.log

# ---- 3. a desktop release left staged in josh's home --------------------------
for dir in /home/josh/desktop-*; do
  [ -d "$dir" ] || continue
  # update files first and the manifest LAST, so no installed app is ever
  # offered an update whose file isn't there yet
  find "$dir" -maxdepth 1 -type f ! -name latest.json -exec mv -t "$REPO/desktop-dist/" {} +
  [ -f "$dir/latest.json" ] && mv "$dir/latest.json" "$REPO/desktop-dist/"
  chmod 644 "$REPO"/desktop-dist/*
  rmdir "$dir" 2>/dev/null || true
  echo "published the staged desktop release from $dir"
done

echo
echo "=== DONE. The deploy key to add on GitHub (read-only): ==="
cat "$SSHD/id_ed25519.pub"
