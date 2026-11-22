#!/usr/bin/env bash
# SURVIVORZ: unpacks the Sonniss GDC bundle parts Josh downloaded into
# D:/solace-ai/sonnis/<year>/<library>/, moving each zip into <year>/_zips/ once it
# has unpacked cleanly (nothing is deleted). A part that fails is left where it is
# and named in the log.
set -u
ROOT="D:/solace-ai/sonnis"
LOG="$ROOT/unpack-log.txt"
: > "$LOG"
for dir in "$ROOT"/*/; do
  year="$(basename "$dir")"
  mkdir -p "$dir/_zips"
  for z in "$dir"*.zip; do
    [ -e "$z" ] || continue
    name="$(basename "$z")"
    echo "$(date +%T) $year  $name" | tee -a "$LOG"
    unzip -o -q "$z" -d "$dir" 2>>"$LOG"; rc=$?
    # 1 = warnings only: several bundles carry an en dash in folder names whose two
    # copies inside the zip disagree, and unzip just uses the central one
    if [ "$rc" -le 1 ]; then
      mv "$z" "$dir/_zips/"
    else
      echo "   FAILED: $name (left in place)" | tee -a "$LOG"
    fi
  done
done
echo "$(date +%T) done" | tee -a "$LOG"
