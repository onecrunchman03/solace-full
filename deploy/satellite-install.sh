#!/usr/bin/env bash
# Solace Satellite — Ubuntu installer + management CLI (F8).
#
# Fresh setup (asks its questions, or takes flags):
#   curl -fsSL https://solace.zone/api/satellite/install.sh | sudo bash -s -- --key <KEY>
#
# Once installed, the same script lives at /usr/local/bin/solace-satellite:
#   solace-satellite status | config | logs | backup | update | restart | stop | start | uninstall
#
# Flags (any question can be pre-answered; unanswered ones are asked, or
# take their default when no terminal is attached):
#   --key <KEY>            provisioning key from a hub admin (required, fresh installs)
#   --name "My Place"      community name
#   --privacy open|request|invite     who may join (default open)
#   --discoverable yes|no  show the community card to non-members (default yes)
#   --storage <dir>        where messages+files live (default /var/lib/solace-satellite)
#   --backup-dir <dir>     daily backup folder (default: off)
#   --keep-animated <days> gif retention (default 30)
#   --keep-files <days>    image/file retention (default 90)
#   --no-voice             don't host voice calls on this box (default: host them)
#   --hub <url>            the Solace server (default https://solace.zone)
#   --accept-host-agreement  you have read <hub>/legal/hosting.html and agree
#                          (asked interactively otherwise; REQUIRED with --yes —
#                          an unattended install can't agree on your behalf)
#   --yes                  take defaults for anything not flagged, ask nothing
set -euo pipefail

BIN_DIR=/opt/solace-satellite
DATA_DIR=/var/lib/solace-satellite
SVC=solace-satellite
UNIT=/etc/systemd/system/$SVC.service
TOOL=/usr/local/bin/solace-satellite

# ---- looks ------------------------------------------------------------------
if [ -e /dev/tty ] && ( : > /dev/tty ) 2>/dev/null; then HAVE_TTY=1; else HAVE_TTY=0; fi
if [ "$HAVE_TTY" = 1 ]; then
  B=$'\e[1m'; D=$'\e[2m'; C=$'\e[36m'; G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; N=$'\e[0m'
else
  B=""; D=""; C=""; G=""; R=""; Y=""; N=""
fi
say()  { printf '%b\n' "$*"; }
die()  { say "${R}✗${N} $*" >&2; exit 1; }
good() { say "${G}✓${N} $*"; }

# ---- tiny settings helpers (settings.json is flat; python3 ships on Ubuntu) --
sget() { # sget <key> <default>
  python3 - "$DATA_DIR/settings.json" "$1" "$2" 2>/dev/null <<'PY' || printf '%s' "$2"
import json,sys
try: v=json.load(open(sys.argv[1])).get(sys.argv[2])
except Exception: v=None
print(sys.argv[3] if v is None else (("yes" if v else "no") if isinstance(v,bool) else v), end="")
PY
}
swrite() { # swrite <animatedDays> <staticDays> <voice yes|no> <contentDir|""> <backupDir|"">
  python3 - "$DATA_DIR/settings.json" "$1" "$2" "$3" "$4" "$5" <<'PY'
import json,sys
f,anim,stat,voice,cdir,bdir=sys.argv[1:7]
s={"animatedDays":int(anim),"staticDays":int(stat),"voice":voice=="yes",
   "contentDir":cdir or None,"backupDir":bdir or None}
import os,tempfile
# A fresh, exclusive temp file (never a pre-planted symlink — the folder is the
# service user's, and this runs as root).
fd,tmp=tempfile.mkstemp(prefix=".settings.",dir=os.path.dirname(f))
with os.fdopen(fd,"w") as h: h.write(json.dumps(s,indent=2))
os.replace(tmp,f)
PY
  chown -h $SVC:$SVC "$DATA_DIR/settings.json" 2>/dev/null || true
}

# A folder we're willing to put in a service file or delete from: absolute,
# no spaces, no control characters (a newline in settings.json would become a
# line of the unit, which root then runs).
safe_path() {
  case "$1" in /*) :;; *) return 1;; esac
  case "$1" in *[[:space:]]*|*[[:cntrl:]]*) return 1;; esac
  return 0
}

# identity.json is written pretty-printed by the daemon; read it as JSON.
jget() { # jget <key>
  python3 - "$DATA_DIR/identity.json" "$1" 2>/dev/null <<'PY' || true
import json,sys
try: v=json.load(open(sys.argv[1])).get(sys.argv[2])
except Exception: v=None
print("" if v is None else v, end="")
PY
}

hub_of() { jget hub; }

write_unit() { # regenerates the service file from current settings
  local cdir bdir extra=""
  cdir=$(sget contentDir ""); bdir=$(sget backupDir "")
  if [ -n "$cdir" ]; then safe_path "$cdir" && extra=" $cdir" || say "${R}ignoring an unsafe storage path in settings.json${N}"; fi
  # The backup folder is OPTIONAL to the service: '-' lets it start with the
  # drive unplugged (the daemon treats a missing backup folder as a soft fail).
  if [ -n "$bdir" ]; then safe_path "$bdir" && extra="$extra -$bdir" || say "${R}ignoring an unsafe backup path in settings.json${N}"; fi
  cat > "$UNIT" <<UNIT
[Unit]
Description=Solace Satellite — community host daemon
After=network-online.target
Wants=network-online.target

[Service]
User=$SVC
ExecStart=$BIN_DIR/satellited run --data $DATA_DIR --voice
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR$extra
ProtectHome=true
PrivateTmp=true
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
}

download_bundle() { # download_bundle <hub> <key-or-empty> <dest.tar.gz>
  local hub="$1" key="$2" dest="$3" body="" tok=""
  if [ -x "$BIN_DIR/satellited" ] && [ -f "$DATA_DIR/identity.json" ]; then
    tok=$(runuser -u $SVC -- "$BIN_DIR/satellited" update-token --data "$DATA_DIR" 2>/dev/null \
          | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' || true)
  fi
  if [ -n "$tok" ]; then body="{\"tok\":\"$tok\"}"
  elif [ -n "$key" ]; then body="{\"key\":\"$key\"}"
  else die "need a provisioning key (--key) — or an intact install to sign an upgrade token"; fi
  local http
  http=$(curl -sS -o "$dest" -w '%{http_code}' \
    -X POST -H 'content-type: application/json' -d "$body" "$hub/api/satellite/app-linux")
  [ "$http" = "200" ] || die "bundle download refused (HTTP $http) — is the key valid, unused and unexpired?"
}

install_tool() { # keep /usr/local/bin/solace-satellite current
  local hub="$1" src="${BASH_SOURCE[0]:-}"
  # Already running AS the installed tool (a `solace-satellite update`)? Then
  # it's current — copying it onto itself is just a noisy error.
  if [ -n "$src" ] && [ -f "$src" ] && [ "$(readlink -f "$src" 2>/dev/null)" = "$(readlink -f "$TOOL" 2>/dev/null)" ]; then
    return 0
  fi
  if [ -n "$src" ] && [ -f "$src" ] && [ "$src" != "bash" ]; then
    cp "$src" "$TOOL"
  else
    # Piped from curl (no source file on disk) — fetch a fresh copy.
    curl -fsSL "$hub/api/satellite/install.sh" -o "$TOOL" || return 0
  fi
  chmod 755 "$TOOL"
}

need_root() { [ "$(id -u)" -eq 0 ] || die "run this with sudo."; }

# ---- the questions ----------------------------------------------------------
ASK=1 # flags/--yes/no-tty all lower this per-question or globally
askv() { # askv "prompt" "default" -> REPLY
  local prompt="$1" def="$2"
  if [ "$ASK" = 1 ] && [ "$HAVE_TTY" = 1 ]; then
    printf '%b' "$prompt" > /dev/tty
    IFS= read -r REPLY < /dev/tty || REPLY=""
    [ -n "$REPLY" ] || REPLY="$def"
  else
    REPLY="$def"
  fi
}

wizard() { # fills NAME PRIVACY DISCOVER STORAGE BAKDIR ANIM STAT VOICE
  say ""
  say "${B}${C}  ╭──────────────────────────────────────────╮${N}"
  say "${B}${C}  │   SOLACE SATELLITE — community setup     │${N}"
  say "${B}${C}  ╰──────────────────────────────────────────╯${N}"
  say "${D}  Enter accepts the [default] on every question.${N}"
  say ""
  # THE HOST AGREEMENT comes first, and it is the one question with no
  # default: hosting a community makes you its operator, responsible for
  # what's in it, and the hub records that you said yes.
  if [ "$AGREE" != 1 ]; then
    say "${B}0. The Satellite Host Agreement${N}"
    say "   Hosting a community makes you its operator: its messages live on"
    say "   this box, you keep it within the rules, and the Solace operator can"
    say "   disconnect it at any time. Read it: ${C}$HUB/legal/hosting.html${N}"
    if [ "$ASK" = 1 ] && [ "$HAVE_TTY" = 1 ]; then
      askv "   ${B}I have read it and I agree${N} [y/N] " "n"
      case "$REPLY" in y|Y|yes) AGREE=1;; *) die "no agreement, no satellite. Read it and run again.";; esac
    else
      die "an unattended install can't agree for you: read $HUB/legal/hosting.html and add --accept-host-agreement"
    fi
  fi
  if [ -z "$NAME" ]; then
    askv "${B}1. What's your community's name?${N} [My Solace Place] " "My Solace Place"
    NAME="$REPLY"
  fi
  if [ -z "$PRIVACY" ]; then
    say "${B}2. Who can join?${N}"
    say "   1) ${G}open${N}    — anyone can walk in ${D}(default)${N}"
    say "   2) request — people knock, you approve"
    say "   3) invite  — members are added by hand"
    askv "   pick [1]: " "1"
    case "$REPLY" in 2|request) PRIVACY=request;; 3|invite) PRIVACY=invite;; *) PRIVACY=open;; esac
  fi
  if [ "$PRIVACY" = open ]; then
    DISCOVER=yes # nobody can join a door they can't see
  elif [ -z "$DISCOVER" ]; then
    askv "${B}   Show the community's card to non-members?${N} [Y/n] " "y"
    case "$REPLY" in n|N|no) DISCOVER=no;; *) DISCOVER=yes;; esac
  fi
  if [ -z "$STORAGE" ]; then
    askv "${B}3. Where should messages & files live?${N}\n   ${D}(a bigger second drive is fine)${N} [$DATA_DIR] " "$DATA_DIR"
    STORAGE="$REPLY"
  fi
  safe_path "$STORAGE" || die "storage must be an absolute path with no spaces (got: $STORAGE)"
  if [ -z "$ANIM" ]; then
    askv "${B}4. Keep gifs for how many days?${N} [30] " "30"
    ANIM="$REPLY"
  fi
  if [ -z "$STAT" ]; then
    askv "${B}   Keep images & files for how many days?${N} [90] " "90"
    STAT="$REPLY"
  fi
  case "$ANIM$STAT" in *[!0-9]*) die "retention must be whole days";; esac
  if [ -z "$BAKDIR" ]; then
    askv "${B}5. Daily backup folder?${N} ${D}(second drive or NAS; blank = off)${N} [off] " ""
    case "$REPLY" in ""|off|no) BAKDIR="";; /*) BAKDIR="$REPLY";; *) die "backup folder must be an absolute path";; esac
  fi
  [ -z "$BAKDIR" ] || safe_path "$BAKDIR" || die "backup folder must be an absolute path with no spaces"
  if [ -z "$VOICE" ]; then
    askv "${B}6. Host voice calls on this box?${N} ${D}(needs router ports; falls back to the hub otherwise)${N} [Y/n] " "y"
    case "$REPLY" in n|N|no) VOICE=no;; *) VOICE=yes;; esac
  fi
  say ""
  say "${B}  Your community:${N}"
  say "    name        ${C}$NAME${N}"
  say "    joining     ${C}$PRIVACY${N}$( [ "$PRIVACY" != open ] && printf '%s' ", card visible: $DISCOVER" )"
  say "    storage     ${C}${STORAGE}${N}"
  say "    keep        ${C}gifs ${ANIM}d · files ${STAT}d${N}"
  say "    backups     ${C}${BAKDIR:-off}${N}"
  say "    voice here  ${C}$VOICE${N}"
  if [ "$ASK" = 1 ] && [ "$HAVE_TTY" = 1 ]; then
    askv "  ${B}Install?${N} [Y/n] " "y"
    case "$REPLY" in n|N|no) die "nothing installed.";; esac
  fi
}

# ---- install / upgrade ------------------------------------------------------
cmd_install() {
  need_root
  command -v curl >/dev/null 2>&1 || { say "installing curl…"; apt-get update -qq && apt-get install -y -qq curl; }
  command -v python3 >/dev/null 2>&1 || { say "installing python3…"; apt-get install -y -qq python3; }

  if [ -f "$DATA_DIR/identity.json" ]; then cmd_update; return; fi
  [ -n "$KEY" ] || die "need --key <provisioning key from a hub admin>"
  wizard

  say ""
  say "Downloading the satellite bundle…"
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  download_bundle "$HUB" "$KEY" "$TMP/bundle.tar.gz"
  mkdir -p "$BIN_DIR"
  tar -xzf "$TMP/bundle.tar.gz" -C "$BIN_DIR"
  chmod 755 "$BIN_DIR/satellited"
  [ -f "$BIN_DIR/livekit-server" ] && chmod 755 "$BIN_DIR/livekit-server"

  id -u $SVC >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin $SVC
  mkdir -p "$DATA_DIR"; chown -R $SVC:$SVC "$DATA_DIR"
  if [ "$STORAGE" != "$DATA_DIR" ]; then mkdir -p "$STORAGE"; chown $SVC:$SVC "$STORAGE"; fi
  if [ -n "$BAKDIR" ]; then mkdir -p "$BAKDIR"; chown $SVC:$SVC "$BAKDIR" 2>/dev/null || true; fi
  swrite "$ANIM" "$STAT" "$VOICE" "$( [ "$STORAGE" != "$DATA_DIR" ] && printf '%s' "$STORAGE" )" "$BAKDIR"

  # The acceptance is recorded against the KEY at the hub first, so it stands
  # whichever daemon version registers next (an older bundle doesn't carry
  # the flag); the daemon then says it again on the register call itself.
  say "Recording your Host Agreement acceptance with the hub…"
  local ahttp hver
  # The version in force comes from the hub, never a number baked in here —
  # a bumped agreement must not turn every fresh install into a mystery 400.
  hver=$(curl -sS "$HUB/api/legal" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hostingVersion"])' 2>/dev/null || true)
  [ -n "$hver" ] || die "couldn't read the agreement version from $HUB/api/legal"
  ahttp=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -d "{\"key\":\"$KEY\",\"version\":$hver}" "$HUB/api/satellite/accept-hosting")
  case "$ahttp" in
    200) :;;
    403) die "the hub refused the acceptance: the key is invalid, used or expired";;
    *)   die "the hub refused the acceptance (HTTP $ahttp)";;
  esac
  say "Registering with the hub…"
  runuser -u $SVC -- "$BIN_DIR/satellited" register --hub "$HUB" --key "$KEY" --name "$NAME" \
    --privacy "$PRIVACY" --discoverable "$DISCOVER" --data "$DATA_DIR" --accept-host-agreement

  write_unit
  systemctl enable --now $SVC
  install_tool "$HUB"
  sleep 3
  say ""
  if systemctl -q is-active $SVC; then good "your community ${B}$NAME${N} is ONLINE."
  else say "${R}the service didn't come up — journalctl -u $SVC -e${N}"; fi
  say ""
  say "  ${B}solace-satellite status${N}     how it's doing"
  say "  ${B}solace-satellite config${N}     change any of tonight's answers"
  say "  ${B}solace-satellite logs${N}       live log"
  say "  ${D}(full command list: solace-satellite help)${N}"
  if [ "$VOICE" = yes ]; then
    say ""
    say "  For calls hosted here, forward on the router to this machine:"
    say "    ${B}TCP 7880 · TCP 7881 · UDP 50000-50060${N}"
    say "  ${D}Unforwarded is fine — calls quietly run on the hub instead.${N}"
  fi
}

cmd_update() {
  need_root
  local hub; hub=$(hub_of); hub=${hub:-$HUB}
  [ -n "$hub" ] || die "no install found and no --hub given"
  say "Upgrading in place from $hub…"
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  download_bundle "$hub" "$KEY" "$TMP/bundle.tar.gz"
  systemctl stop $SVC 2>/dev/null || true
  tar -xzf "$TMP/bundle.tar.gz" -C "$BIN_DIR"
  chmod 755 "$BIN_DIR/satellited"
  [ -f "$BIN_DIR/livekit-server" ] && chmod 755 "$BIN_DIR/livekit-server"
  write_unit
  systemctl start $SVC
  install_tool "$hub"
  good "upgraded and restarted."
}

# ---- the config editor ------------------------------------------------------
cmd_config() {
  need_root
  [ -f "$DATA_DIR/identity.json" ] || die "no community here yet — run the installer first."
  [ "$HAVE_TTY" = 1 ] || die "config is interactive — run it from a terminal."
  while :; do
    local cdir bdir anim stat voice
    cdir=$(sget contentDir ""); bdir=$(sget backupDir "")
    anim=$(sget animatedDays 30); stat=$(sget staticDays 90); voice=$(sget voice yes)
    say ""
    say "${B}${C}  SOLACE SATELLITE — settings${N}"
    say "   1) storage location   ${C}${cdir:-$DATA_DIR}${N}"
    say "   2) daily backups      ${C}${bdir:-off}${N}"
    say "   3) keep gifs          ${C}${anim} days${N}"
    say "   4) keep images/files  ${C}${stat} days${N}"
    say "   5) host voice here    ${C}${voice}${N}"
    say "   ${D}(community name & privacy live in Solace → your page → Page Settings)${N}"
    askv "  change which? [done]: " "done"
    case "$REPLY" in
      1)
        askv "  new storage folder [keep]: " ""
        [ -z "$REPLY" ] && continue
        safe_path "$REPLY" || { say "${R}must be an absolute path with no spaces${N}"; continue; }
        local new="$REPLY" cur="${cdir:-$DATA_DIR}"
        [ "$new" = "$cur" ] && { say "already there."; continue; }
        say "  moving the community $cur → $new (the service pauses briefly)…"
        systemctl stop $SVC
        mkdir -p "$new/files"; chown $SVC:$SVC "$new" "$new/files"
        # A failed copy of the database stops the move: pointing the service at
        # an empty folder would bring the community up empty, and the next
        # question offers to delete the only real copy.
        if [ -f "$cur/content.db" ] && ! cp -a "$cur/content.db" "$new/"; then
          say "${R}couldn't copy the database to $new — nothing moved.${N}"
          systemctl start $SVC; continue
        fi
        cp -a "$cur/content.db-wal" "$cur/content.db-shm" "$new/" 2>/dev/null || true
        # The CONTENTS of files/, so a move back onto an old copy merges into
        # it instead of nesting files/files/.
        if [ -d "$cur/files" ] && ! cp -a "$cur/files/." "$new/files/"; then
          say "${R}couldn't copy the files to $new — nothing moved.${N}"
          systemctl start $SVC; continue
        fi
        chown -R $SVC:$SVC "$new/files" "$new/content.db"* 2>/dev/null || true
        swrite "$anim" "$stat" "$voice" "$( [ "$new" != "$DATA_DIR" ] && printf '%s' "$new" )" "$bdir"
        write_unit; systemctl start $SVC
        good "moved. the old copy still sits at $cur"
        askv "  delete the old copy? [y/N] " "n"
        case "$REPLY" in y|Y|yes)
          rm -f "$cur/content.db" "$cur/content.db-wal" "$cur/content.db-shm"
          rm -rf "$cur/files"; good "old copy removed.";;
        esac;;
      2)
        askv "  backup folder (blank = off) [${bdir:-off}]: " "$bdir"
        case "$REPLY" in ""|off|no) bdir="";; /*) safe_path "$REPLY" || { say "${R}no spaces in the path, please${N}"; continue; }; bdir="$REPLY"; mkdir -p "$bdir"; chown $SVC:$SVC "$bdir" 2>/dev/null || true;; *) say "${R}must be an absolute path${N}"; continue;; esac
        swrite "$anim" "$stat" "$voice" "$cdir" "$bdir"; write_unit; systemctl restart $SVC
        good "backups: ${bdir:-off}";;
      3)
        askv "  keep gifs how many days? [$anim] " "$anim"
        case "$REPLY" in *[!0-9]*|"") say "${R}whole days only${N}"; continue;; esac
        swrite "$REPLY" "$stat" "$voice" "$cdir" "$bdir"; good "gifs: $REPLY days";;
      4)
        askv "  keep images/files how many days? [$stat] " "$stat"
        case "$REPLY" in *[!0-9]*|"") say "${R}whole days only${N}"; continue;; esac
        swrite "$anim" "$REPLY" "$voice" "$cdir" "$bdir"; good "files: $REPLY days";;
      5)
        askv "  host voice calls on this box? [y/n, now $voice]: " "$voice"
        case "$REPLY" in n|N|no) voice=no;; y|Y|yes) voice=yes;; *) continue;; esac
        swrite "$anim" "$stat" "$voice" "$cdir" "$bdir"; systemctl restart $SVC
        good "voice hosting: $voice$( [ "$voice" = yes ] && printf '%s' ' (router: TCP 7880, TCP 7881, UDP 50000-50060)' )";;
      done|q|"") break;;
      *) :;;
    esac
  done
}

cmd_status() {
  local name sid hub
  name=$(jget name)
  sid=$(jget satelliteId)
  hub=$(hub_of)
  say "${B}community${N}  ${name:-not registered}${sid:+  ${D}(#$sid @ ${hub})${N}}"
  say "${B}service${N}    $(systemctl is-active $SVC 2>/dev/null || echo not-installed) · $(systemctl is-enabled $SVC 2>/dev/null || echo -)"
  say "${B}link${N}       $(journalctl -u $SVC -n 200 --no-pager 2>/dev/null | grep -oE 'linked\. holding the line\.|link closed[^\n]*' | tail -1 || echo unknown)"
  say "${B}storage${N}    $(sget contentDir "$DATA_DIR")"
  say "${B}backups${N}    $(sget backupDir off)"
  say "${B}keep${N}       gifs $(sget animatedDays 30)d · files $(sget staticDays 90)d"
  say "${B}voice${N}      $(sget voice yes)"
}

cmd_uninstall() {
  need_root
  [ "$HAVE_TTY" = 1 ] || die "uninstall is interactive — run it from a terminal."
  askv "${R}Take the community offline and remove the satellite from this machine?${N} [y/N] " "n"
  case "$REPLY" in y|Y|yes) :;; *) die "nothing removed.";; esac
  systemctl disable --now $SVC 2>/dev/null || true
  rm -f "$UNIT"; systemctl daemon-reload
  rm -rf "$BIN_DIR"
  askv "Also DELETE the community's data (messages, files, identity)? This is forever. [y/N] " "n"
  case "$REPLY" in y|Y|yes)
    local cdir; cdir=$(sget contentDir "")
    # Only what the satellite put there — the folder may be a whole drive the
    # host also uses (the wizard offers "a bigger second drive").
    if [ -n "$cdir" ] && safe_path "$cdir"; then
      rm -f "$cdir/content.db" "$cdir/content.db-wal" "$cdir/content.db-shm"
      rm -rf "$cdir/files"
    fi
    rm -rf "$DATA_DIR"
    userdel $SVC 2>/dev/null || true
    good "everything removed. ask the hub admin to delist the satellite.";;
  *)
    good "software removed; the community's data stays at $(sget contentDir "$DATA_DIR"). Reinstall with a rotation key to bring it back.";;
  esac
  rm -f "$TOOL"
}

usage() {
  say "${B}solace-satellite${N} — host a Solace community on this box"
  say "  status      how the community is doing"
  say "  config      change settings (storage, backups, retention, voice)"
  say "  logs        follow the live log"
  say "  backup      run a backup right now"
  say "  update      upgrade to the latest version in place"
  say "  restart     restart the service"
  say "  stop|start  take the community offline / bring it back"
  say "  uninstall   remove the satellite from this machine"
}

# ---- flags + dispatch -------------------------------------------------------
HUB="https://solace.zone"; KEY=""; NAME=""; PRIVACY=""; DISCOVER=""; STORAGE=""
BAKDIR=""; ANIM=""; STAT=""; VOICE=""; SUB=""; AGREE=0
while [ $# -gt 0 ]; do case "$1" in
  --key)           KEY="${2:-}"; shift 2;;
  --accept-host-agreement) AGREE=1; shift;;
  --name)          NAME="${2:-}"; shift 2;;
  --hub)           HUB="${2%/}"; shift 2;;
  --privacy)       PRIVACY="${2:-}"; shift 2;;
  --discoverable)  DISCOVER="${2:-}"; shift 2;;
  --storage)       STORAGE="${2:-}"; shift 2;;
  --backup-dir)    BAKDIR="${2:-}"; shift 2;;
  --keep-animated) ANIM="${2:-}"; shift 2;;
  --keep-files)    STAT="${2:-}"; shift 2;;
  --no-voice)      VOICE=no; shift;;
  --yes)           ASK=0; shift;;
  status|config|logs|backup|update|restart|stop|start|uninstall|help|install) SUB="$1"; shift;;
  *) die "unknown option: $1 (try: solace-satellite help)";;
esac; done
case "${PRIVACY:-}" in ""|open|request|invite) :;; *) die "--privacy must be open, request or invite";; esac
case "${DISCOVER:-}" in ""|yes|no) :;; *) die "--discoverable must be yes or no";; esac

case "${SUB:-install}" in
  install)   cmd_install;;
  update)    cmd_update;;
  config)    cmd_config;;
  status)    cmd_status;;
  logs)      journalctl -u $SVC -f;;
  backup)    need_root; runuser -u $SVC -- "$BIN_DIR/satellited" backup --data "$DATA_DIR";;
  restart)   need_root; systemctl restart $SVC; good "restarted.";;
  stop)      need_root; systemctl stop $SVC; good "community offline (start brings it back).";;
  start)     need_root; systemctl start $SVC; good "community online.";;
  uninstall) cmd_uninstall;;
  help)      usage;;
esac
