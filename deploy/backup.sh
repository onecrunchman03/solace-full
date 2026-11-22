#!/usr/bin/env bash
#
# Solace backup — a consistent SQLite snapshot plus user uploads, rotated.
#
# Uses `sqlite3 .backup`, which takes a crash-consistent copy even while the
# server is actively writing (WAL-safe) — do NOT just `cp` the .db file, the
# -wal may hold un-checkpointed writes. Requires the sqlite3 CLI:
#   sudo apt install -y sqlite3
#
# Override any of these with environment variables (see solace-backup.service):
set -euo pipefail
# The archive is the whole database — raw session tokens, password and
# recovery hashes, every DM. Nobody but its owner reads it (Oct 2026 review:
# it was written 0644 under a 0755 folder).
umask 077

APP_DIR="${SOLACE_DIR:-/opt/solace}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
DB="$DATA_DIR/solace.db"
UPLOADS="$DATA_DIR/uploads"
DEST="${BACKUP_DIR:-/var/backups/solace}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [ ! -f "$DB" ]; then
  echo "backup: no database at $DB" >&2
  exit 1
fi

mkdir -p "$DEST"
chmod 700 "$DEST" 2>/dev/null || true
# Archives written before the umask was set are closed up too.
find "$DEST" -maxdepth 1 -name "solace-*.tar.gz" -perm /044 -exec chmod 600 {} + 2>/dev/null || true
ts="$(date +%Y%m%d-%H%M%S)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Crash-consistent snapshot of the live database.
sqlite3 "$DB" ".backup '$work/solace.db'"

# The archive is written under a TEMP name, verified, then moved into place
# (Sep 2026 review): a run that died mid-tar used to leave a truncated
# solace-<ts>.tar.gz that the health check — which only looks at the newest
# file's timestamp — read as a fresh, good backup. And uploads are streamed
# straight from the data dir into the archive rather than copied through
# /tmp first: the jukebox library alone is tens of MB, on the same disk.
final="$DEST/solace-$ts.tar.gz"
partial="$DEST/.solace-$ts.partial"
if [ -d "$UPLOADS" ]; then
  # An upload changing or vanishing mid-run (the hourly attachment sweep, an
  # avatar replaced) makes tar exit 1, and under set -e that wrote no backup
  # at all that night. Exit 1 is a warning; the verification below is the
  # real test of the archive.
  rc=0
  tar -czf "$partial" --warning=no-file-changed --ignore-failed-read \
    -C "$work" solace.db -C "$DATA_DIR" uploads || rc=$?
  [ "$rc" -le 1 ] || { echo "backup: tar failed ($rc)" >&2; rm -f "$partial"; exit 1; }
else
  tar -czf "$partial" -C "$work" solace.db
fi
# Verify before it can count: the archive must list cleanly and hold the db.
# (One listing, captured whole: a grep -q on a pipe quits at the first match,
# tar then dies on the broken pipe, and under pipefail that read as a failed
# verification of a perfectly good archive — the first run did exactly that.)
if ! listing="$(tar -tzf "$partial" 2>/dev/null)" || ! grep -qx "solace.db" <<<"$listing"; then
  echo "backup: archive failed verification, discarding $partial" >&2
  rm -f "$partial"
  exit 1
fi
mv -f "$partial" "$final"

# Rotate: drop archives older than KEEP_DAYS, and any partial older than 3h.
find "$DEST" -maxdepth 1 -name "solace-*.tar.gz" -mtime +"$KEEP_DAYS" -delete
find "$DEST" -maxdepth 1 -name ".solace-*.partial" -mmin +180 -delete

echo "backup written: $final"
