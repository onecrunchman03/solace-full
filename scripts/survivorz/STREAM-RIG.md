# SOLACE SURVIVORZ — the stream rig: going live on YouTube

The rig is `streamer.mjs`, kept running (standing by between runs) by Windows Task Scheduler (`stream-task.ps1`,
`stream-run.ps1`). It opens the real show's stream page in Edge on the workstation
(`https://solace.zone/#survivorz-stream`), records that window's picture (Windows Graphics Capture) and
that Edge's own sound (`proc-audio.exe`, Windows' per-program audio capture — never the PC's other
sounds), scales the 1080p page up to **1440p** and encodes it once on the CPU (x264 `faster`, a steady
18 Mbit/s, 60 fps, AAC 192k), and sends it to YouTube's main **and** backup ingest and to a local
recording. (1440p because YouTube gives a 1440p upload its better VP9/AV1 versions, which every viewer
sees, 1080p ones included. All of it is CPU work, with nothing added to the 3090 Ti's memory.)
(Until Nov 1 2026 the page recorded itself; Edge's encoder sent 17–25 Mbit/s at an uneven
~50 fps, which YouTube played as choppy.) Nobody signs that browser in, and the show does not need to
be "on air" inside Solace — the rig uses its own stream token, which opens the show's read-only
doors and nothing else.

## One-time setup

1. **The stream token** (both ends must match, 24+ characters — any long random string):
   - on the R220, in `/opt/solace/.env`: `SURVIVORZ_STREAM_TOKEN=<token>` → restart the service;
   - on the workstation, in the repo's `.env`: the same `SURVIVORZ_STREAM_TOKEN=<token>`.

   Admin Panel → Survivorz → **Stream** then says "No stream running" instead of "No stream rig".
2. **`npm install`** in the repo on the workstation (brings in `playwright-core`, pinned), and **build the
   rig's ears**: `cargo build --release` in `scripts\survivorz\proc-audio` (Rust; the rig refuses to start
   without `target\release\proc-audio.exe`). `SURVIVORZ_OUT_H` (1440, or 1080), `SURVIVORZ_KBPS`
   (18000 at 1440, 9000 at 1080), `SURVIVORZ_PRESET` (faster) and `SURVIVORZ_AUDIO_KBPS` (192) tune the
   encode. The upload is ~37 Mbit/s with both legs (the house line measured ~120 up, Nov 3 2026).
3. **YouTube Studio** (once your account can go live):
   - Go live → Stream → **create a stream key** (a reusable one, "Default stream key" is fine).
   - In the stream settings: turn **Auto-start ON** and **Auto-stop ON**, and leave **DVR ON**.
     Auto-start/auto-stop are what make every 11-hour part its own broadcast and its own replay:
     the rig ends the connection every 11 hours, waits 90 s for YouTube to close the broadcast,
     and connects again — YouTube may not keep a replay of anything over 12 hours.
   - Visibility, title, category, "made for kids: no" — set the defaults on the key so each new
     part comes up the same.
   - **Stream latency: Normal** (not Low or Ultra-low). Normal gives YouTube the most room to make the
     best-quality versions, and a 24/7 show doesn't need a short delay.
   - Nothing to set up for the **backup ingest**: the rig sends the same stream with the same key to
     `b.rtmp.youtube.com` by itself, and Studio's stream health shows it as "backup". If one ingest
     drops, the broadcast carries on through the other.
4. **The key** goes in the repo's `.env` on the workstation, never anywhere else:
   `SURVIVORZ_RTMP=rtmp://a.rtmp.youtube.com/live2/<your-stream-key>`
   Without it the rig records locally only.
5. **Register the task** (once):
   `powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Install`
   (Delete the old Oct 20 test task "Solace Survivorz Stream Test" in Task Scheduler.)
6. **Windows** for the month: pause Windows Update (or accept a reboot every so often — the task
   comes back at sign-in), and turn on **automatic sign-in** if the box should come back on its own
   after a reboot (the task needs Josh's desktop to draw Edge on). Leave the box signed in; locking
   it is fine.

## Going live

**Once, on the workstation**, start the rig and leave it running:

    powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Start
    powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Status

It **stands by** (no browser, no encode, a heartbeat every 10 s) until the server wants a stream.

**Every run, from the Admin Panel** (Survivorz → Show): pick the map, tick the survivors, press
**Start show + stream to YouTube**. The run starts its 5-minute countdown and, within a beat, the rig
opens Edge, encodes and connects; auto-start puts the broadcast live. **Stop** ends the run and the
stream together, and the rig stands by again. The Stream tab (and the run's card) also has a plain
**Go live now / Stop streaming** switch, for a stream without restarting the run.

Edge opens full 1920×1080 at the top-left of the main screen; leave it there. It can be covered by other
windows — only that window is recorded, never the screen — but it must not be minimised.

An older server that never says what it wants gets a stream straight away, as before.
`stream-task.ps1 -Stop` stops the rig itself (and tells the server no stream is expected, so Sterling
stays quiet).

## While it runs

- **Admin Panel → Survivorz → Stream**: the rig's last check-in, fps, YouTube leg, recording,
  restarts; and the **standby card** — "Put the card up" lays a "we'll be right back" card over the
  stream without stopping it (audited).
- **Sterling DMs you** when the health check "Survivorz stream" goes red: the rig hasn't checked in
  for 2 minutes, the YouTube leg has been down 2 minutes, the recording stopped growing, or the
  stream page keeps failing to start.
- **The GPU watcher** (`deploy/workstation/gpu-watch.ps1 -Install`, the task "Solace GPU Watch"):
  once a minute it reads the 3090 Ti's memory and its biggest users and posts them on the stream token.
  The health check "Workstation GPU memory" goes red (Sterling DMs you, and Windows pops a
  notification) when Windows' desktop compositor (dwm) has grown past 3 GB — only a restart shrinks
  it — or the card is nearly full. Log: `%USERPROFILE%\.solace-gpu\gpu-watch.csv`;
  `-Status` / `-Uninstall` on the installed copy there.
- **Recordings**: `D:\solace-data\survivorz-recordings\survivorz-YYYYMMDD-HHMMSS.mp4`, one an hour
  (~8 GB each at 1440p, so 600 GB keeps about three days), the oldest deleted past 600 GB
  (`SURVIVORZ_REC_CAP_GB`). A YouTube drop never stops the recording.
- **Logs**: `assets\downloads\survivorz\stream\rig-YYYYMMDD.out.txt` and `streamer-*.log.csv`
  (GPU, fps, Mbps every 5 s).

## What it does on its own

- Every 11 hours (`SURVIVORZ_SPLIT_H`): ends the YouTube session, waits 90 s
  (`SURVIVORZ_SPLIT_GAP_S`), replaces Edge (sheds memory), reconnects.
- Replaces Edge whenever the picture stalls 15 s, the page runs under 30 fps for 30 s, the recorder
  dies, or the page's heap passes 3.5 GB.
- Redials YouTube with backoff (5 s … 60 s) if the connection drops.
- If the streamer itself dies, `stream-run.ps1` starts it again in 15 s; if that dies, the task
  restarts it (and its 5-minute trigger catches anything else).

## Settings (`.env`, all optional but the two above)

`SURVIVORZ_SERVER` (https://solace.zone) · `SURVIVORZ_REC_DIR` (or `off`) · `SURVIVORZ_REC_SEGMENT_S`
(3600) · `SURVIVORZ_REC_CAP_GB` (600) · `SURVIVORZ_SPLIT_H` (11) · `SURVIVORZ_SPLIT_GAP_S` (90) ·
`SURVIVORZ_SPLIT_RESTART` (1) · `SURVIVORZ_HEAP_MB` (3500) · `SURVIVORZ_BROWSER` (Edge's path) ·
`SURVIVORZ_RTMP_BACKUP` (derived from `SURVIVORZ_RTMP`; `off` = main ingest only) · `SURVIVORZ_PRIORITY`
(1: the encoder and the ears run above normal priority).

## A test without YouTube

`SURVIVORZ_RTMP` may be a file path (`{n}` numbers each part):

    set SURVIVORZ_RTMP=D:\tmp\part-{n}.flv& set SURVIVORZ_SPLIT_H=0.05& node scripts\survivorz\streamer.mjs 6
