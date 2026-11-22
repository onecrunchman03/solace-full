#!/usr/bin/env bash
# Restart solace-voices when its heartbeat goes stale (Oct 13 2026). systemd's
# Restart= catches a CRASH; this catches a HANG — the agent alive but no
# longer checking in with the server. The agent touches the heartbeat file on
# every good check-in (about once a second; ROLLO_HEARTBEAT in the unit).
hb=/data/solace-ai/solace/heartbeat
[ "$(systemctl is-active solace-voices)" = active ] || exit 0   # Restart= has it
up=$(systemctl show -p ActiveEnterTimestamp --value solace-voices)
since=$(( $(date +%s) - $(date -d "$up" +%s) ))
[ "$since" -lt 180 ] && exit 0                                   # still loading models
age=$(( $(date +%s) - $(stat -c %Y "$hb" 2>/dev/null || echo 0) ))
if [ "$age" -gt 120 ]; then
  echo "heartbeat ${age}s stale - restarting solace-voices"
  systemctl restart solace-voices
fi
