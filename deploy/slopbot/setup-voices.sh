#!/usr/bin/env bash
# Put the voice agent on slopbot, or update it after a change to
# scripts/rollo. Since the casino regulars were removed (Nov 2026) it voices
# only the Solace Survivorz show, speaking only — no Whisper, nobody heard.
# Run from the repo root on Josh's PC (Git Bash):
#
#   SLOPBOT_SUDO_PW='…' bash deploy/slopbot/setup-voices.sh
#   ROLLO_EARS=1 SLOPBOT_SUDO_PW='…' bash deploy/slopbot/setup-voices.sh   (ears back on)
#
# Expects on slopbot (one-time, done Oct 13 2026):
#   /data/solace-ai/rollo-venv   the agent's venv (pip freeze of the PC's)
#   /data/solace-ai/voice-venv   Chatterbox's venv (torch 2.14.1 cu130)
#   /data/solace-ai/models       hf/ kokoro/ whisper/ voices/ rollo-voice/
# It copies the three scripts, writes the agent's .env from the repo's own
# (only the keys the agent reads), installs solace-voices.service and
# restarts it. Re-running it is the update path.
set -euo pipefail
HOST=${SLOPBOT:-you@YOUR_GPU_BOX_IP}
DEST=/data/solace-ai/solace
: "${SLOPBOT_SUDO_PW:?set SLOPBOT_SUDO_PW}"

ssh "$HOST" "mkdir -p $DEST/scripts/rollo"
scp -q scripts/rollo/agent.py scripts/rollo/listening.py scripts/rollo/voice_server.py "$HOST:$DEST/scripts/rollo/"
# the agent's settings: only what it reads, never the server's
grep -E '^(NPC_AGENT_SECRET|SOLACE_URL|HF_TOKEN|ROLLO_[A-Z_]+)=' .env \
  | grep -vE '^ROLLO_(MODELS|VOICES_DIR|VOICE_REF|CLONE_PY)=' \
  | ssh "$HOST" "umask 077 && cat > $DEST/.env"
# slopbot's own: TWO cloned voices (the second in half precision), so two
# survivors' lines render at once
ssh "$HOST" "echo ROLLO_CLONE_VOICES=2 >> $DEST/.env"
# SPEAKING ONLY for a show nobody talks to (SURVIVORZ.md section 11): the
# agent loads no Whisper and hears nobody, so the 3080 is the show's.
if [ "${ROLLO_EARS:-0}" = 0 ]; then ssh "$HOST" "echo ROLLO_EARS=0 >> $DEST/.env"; fi
# faster-whisper finds its GPU libraries (pip's nvidia-cublas/cudnn) by path
ssh "$HOST" "cd /data/solace-ai && rollo-venv/bin/python -c 'import os, nvidia.cublas, nvidia.cudnn; print(\"LD_LIBRARY_PATH=\" + \":\".join(os.path.join(list(m.__path__)[0], \"lib\") for m in (nvidia.cublas, nvidia.cudnn)))' > $DEST/voices.env"
scp -q deploy/slopbot/solace-voices.service deploy/slopbot/solace-voices-watchdog.service deploy/slopbot/solace-voices-watchdog.timer deploy/slopbot/solace-voices-watchdog.sh "$HOST:/tmp/"
printf '%s\n' "$SLOPBOT_SUDO_PW" | ssh "$HOST" "sudo -S -p '' bash -c 'install -m 644 /tmp/solace-voices.service /tmp/solace-voices-watchdog.service /tmp/solace-voices-watchdog.timer /etc/systemd/system/ && install -m 755 /tmp/solace-voices-watchdog.sh /usr/local/sbin/solace-voices-watchdog && systemctl daemon-reload && systemctl enable -q solace-voices && systemctl enable -q --now solace-voices-watchdog.timer && systemctl restart solace-voices && systemctl is-active solace-voices'"
echo "solace-voices is up on slopbot; logs: ssh $HOST journalctl -u solace-voices -f"
