// SOLACE SURVIVORZ — THE STREAM RIG (SURVIVORZ.md §12 "The stream rig"; how to go live:
// scripts/survivorz/STREAM-RIG.md). It opens the REAL show's stream page in Edge
// (`<server>/#survivorz-stream`, client/src/survivorz/show/StreamView.svelte) on the rig's stream
// token, records that window and that Edge's own sound from outside the browser, encodes them ONCE on
// the CPU (2560x1440 60 fps, x264 CBR, AAC — see THE RECORDER), and sends the result two ways:
//
//   · THE RECORDER (ffmpeg #1, one per browser session): the window + the sound in → the encode →
//     1-hour fragmented MP4s in SURVIVORZ_REC_DIR (the oldest deleted past SURVIVORZ_REC_CAP_GB)
//     AND an MPEG-TS copy on its stdout.
//   · THE YOUTUBE LEGS (ffmpeg #2, and #3 for YouTube's backup ingest): that TS in → FLV, untouched. Each is its OWN
//     process so it can drop, reconnect and SPLIT without the recording noticing: every
//     SURVIVORZ_SPLIT_H hours (11) it is ended, the rig waits SURVIVORZ_SPLIT_GAP_S (90 s) so YouTube
//     closes the broadcast, and a new one starts — each part its own replay (YouTube may not archive
//     a stream over 12 hours). The browser is replaced at the split too, to shed a day's memory.
//
// STANDING BY (Nov 3 2026 — Josh: "press a button to start it all with a stream on youtube"): the rig
// runs all the time, but opens no browser and encodes nothing until the server WANTS a stream — the
// heartbeat's answer carries `want` (src/survivorz/stream.ts), set by the Show panel's "Start show +
// stream" and cleared by Stop. Wanted → it goes live within a beat; unwanted → it ends the YouTube legs
// and the browser and stands by again. A server that sends no `want` (an older one) gets a stream at once,
// as before.
//
// A WATCHDOG replaces the browser session on no picture for 15 s, the page under 30 fps for 30 s,
// the recorder dying, or the page's heap past SURVIVORZ_HEAP_MB. A HEARTBEAT goes to the server every
// 10 s (src/survivorz/stream.ts) and its health check reaches Sterling's alert DMs when the rig goes
// quiet or reports a problem. Windows is held awake for as long as the rig runs.
//
//   node scripts/survivorz/streamer.mjs [minutes=0]      0 = until stopped (the scheduled task)
//   node scripts/survivorz/streamer.mjs --notify-stopped  tell the server no run is expected (stream-task.ps1 -Stop)
//
// Settings, all SURVIVORZ_* (shell env wins over the repo's gitignored .env):
//   SERVER (https://solace.zone) · STREAM_TOKEN (required, the server's own) · RTMP (YouTube's
//   rtmp://a.rtmp.youtube.com/live2/<key>; unset = record only; a file path works for a test) ·
//   REC_DIR (D:\solace-data\survivorz-recordings; "off" = no recording) · REC_SEGMENT_S (3600) ·
//   REC_CAP_GB (600) · SPLIT_H (11) · SPLIT_GAP_S (90) · SPLIT_RESTART (1: replace Edge at the
//   split) · HEAP_MB (3500) · BROWSER (Edge's path) · LOG_DIR · KILL_AT (seconds: kill the browser,
//   to prove the watchdog)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// SURVIVORZ_* from the repo's .env (the stream key and the token above all — never on a command line)
{
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    const { parseEnv } = await import("node:util");
    for (const [k, v] of Object.entries(parseEnv(fs.readFileSync(envFile, "utf8")))) if (k.startsWith("SURVIVORZ_") && process.env[k] == null) process.env[k] = v;
  }
}
const E = (k, d) => (process.env[`SURVIVORZ_${k}`] ?? "").trim() || d;
const SERVER = E("SERVER", "https://solace.zone").replace(/\/+$/, "");
const TOKEN = E("STREAM_TOKEN", "");
const RTMP = E("RTMP", "");
// YouTube's backup ingest takes the same key on b.rtmp (see THE YOUTUBE LEGS); a file test may name its own
const YT_KEY = /^rtmps?:\/\/a\.rtmps?\.youtube\.com(?::\d+)?\/live2\/([\w-]+)$/.exec(RTMP)?.[1] ?? "";
const BACKUP = E("RTMP_BACKUP", "").toLowerCase() === "off" ? ""
  : E("RTMP_BACKUP", "") || (YT_KEY ? `rtmp://b.rtmp.youtube.com/live2?backup=1/${YT_KEY}` : "");
const REC_DIR = E("REC_DIR", "D:\\solace-data\\survivorz-recordings");
const RECORD = REC_DIR.toLowerCase() !== "off";
const REC_SEGMENT_S = Math.max(60, Number(E("REC_SEGMENT_S", 3600)));
const REC_CAP_BYTES = Math.max(1, Number(E("REC_CAP_GB", 600))) * 1024 ** 3;
const SPLIT_MS = Math.max(0.01, Number(E("SPLIT_H", 11))) * 3_600_000;
const SPLIT_GAP_MS = Math.max(5, Number(E("SPLIT_GAP_S", 90))) * 1000;
const SPLIT_RESTART = E("SPLIT_RESTART", "1") !== "0";
const HEAP_MB = Number(E("HEAP_MB", 3500));
const EDGE = E("BROWSER", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const LOG_DIR = path.resolve(ROOT, E("LOG_DIR", "assets/downloads/survivorz/stream"));
const BEAT_MS = 10_000;

async function postBeat(body) {
  if (!TOKEN) return null;
  try {
    const r = await fetch(`${SERVER}/api/survivorz/stream/heartbeat`, {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return r.ok ? await r.json() : { error: r.status };
  } catch (e) { return { error: String(e.message ?? e) }; }
}

if (process.argv.includes("--notify-stopped")) {
  const r = await postBeat({ stopping: true });
  console.log(r?.ok ? "told the server: no stream run expected" : `could not tell the server (${r?.error ?? "no token"})`);
  process.exit(0);
}
if (TOKEN.length < 24) { console.error("SURVIVORZ_STREAM_TOKEN is missing (or under 24 characters) — set it in .env, the same value as the server's"); process.exit(2); }
if (!RTMP && !RECORD) { console.error("nothing to do: no SURVIVORZ_RTMP and SURVIVORZ_REC_DIR=off"); process.exit(2); }
let chromium;
try { ({ chromium } = require("playwright-core")); } catch { console.error("playwright-core is not installed — run `npm install` in the repo (it's a devDependency)"); process.exit(2); }

const MINUTES = Number(process.argv.find((a, i) => i >= 2 && /^\d+(\.\d+)?$/.test(a)) ?? 0);
const t0 = Date.now();
const END_AT = MINUTES > 0 ? t0 + MINUTES * 60_000 : Infinity;   // checked on a timer: no setTimeout overflow
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
fs.mkdirSync(LOG_DIR, { recursive: true });
if (RECORD) fs.mkdirSync(REC_DIR, { recursive: true });
const csv = fs.createWriteStream(path.join(LOG_DIR, `streamer-${stamp}.log.csv`));
csv.write("t,gpu_pct,enc_pct,mem_mib,fps,heap_mb,mbit_in,rtmp,recording,event\n");
const row = (o) => csv.write([((Date.now() - t0) / 1000).toFixed(1), o.gpu ?? "", o.enc ?? "", o.mem ?? "", o.fps ?? "", o.heap ?? "", o.mbit ?? "", o.rtmp ?? "", o.rec ?? "", (o.ev ?? "").replace(/[,\n]/g, " ")].join(",") + "\n");
const say = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);
const ev = (s) => { say(s); row({ ev: s.slice(0, 160) }); };
// the stream key never reaches a log: ffmpeg names its output in errors
const mask = (t) => {
  if (!RTMP) return t;
  for (const u of [RTMP, BACKUP]) if (u) t = t.split(u).join("<rtmp>");
  if (YT_KEY) t = t.split(YT_KEY).join("<key>");
  return t.replace(/live2\/[\w-]+/g, "live2/<key>");
};

// ======================================================================================
// THE RECORDER — one per browser session: the window and the sound, from OUTSIDE the browser
// ======================================================================================
// (Nov 1 2026 — Josh: "let's do the one path then so we can get the best quality".) The page used to
// record itself (getDisplayMedia + MediaRecorder): Edge's GPU encoder ignored the bitrate it was asked for
// (17–25 Mbit/s), delivered ~50 fps with hitches up to 300 ms while the 26B shared the card, and stamped its
// audio with jitter. Now the page only DRAWS the show, and the recorder takes:
//   · THE PICTURE by Windows Graphics Capture (ffmpeg's gfxcapture) of the rig browser's own window —
//     never the desktop, so a window on top of it (or anything else on the screen) never reaches the
//     stream — cropped to the 1920x1080 page, held at a constant 60 fps;
//   · THE SOUND by process loopback (proc-audio.exe, scripts/survivorz/proc-audio): exactly what the rig's
//     Edge plays, never the PC's other sounds;
// both stamped by the wall clock against one start, so they stay in step for an 11-hour part, and ONE
// encode (libx264, constant bitrate, on the CPU — the card has no memory to spare) feeds both the
// recording and the YouTube leg.
/** a tee output path: the tee muxer splits on | and treats : and \ specially, so escape them */
const teePath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
let rec = null;              // { proc, ears, session, startedAt, out }
let bytesIn = 0, lastChunkAt = 0;
const EARS = path.join(ROOT, "scripts", "survivorz", "proc-audio", "target", "release", "proc-audio.exe");
if (!fs.existsSync(EARS)) { console.error(`the rig's ears aren't built: cargo build --release in scripts\\survivorz\\proc-audio (${EARS})`); process.exit(2); }
// THE 1440p UPLOAD (Nov 3 2026 — Josh: "the best streaming possible"). The page still draws 1920x1080; the
// recorder scales it to 2560x1440 (lanczos, on the CPU) before the encode, because YouTube gives a 1440p
// upload its better VP9/AV1 versions, which every viewer sees, the 1080p ones included. A 1080p upload
// gets plain H.264 and goes to mush in the bunker's dark. All of it runs on the CPU: the 3090 Ti's memory
// is spoken for (the 26B and the page), and this adds nothing there.
// Measured on a real hour of the show (Ryzen 9 5900X, 1440p, 18 Mbit/s): veryfast ran at 2.39x real time, faster ~1.8x,
// fast 1.66x, medium 1.42x. "faster" leaves half the CPU free for Edge, so the encoder never falls behind.
// SURVIVORZ_OUT_H=1080 puts it back to a plain 1080p encode.
const OUT_H = E("OUT_H", "1440") === "1080" ? 1080 : 1440;
const OUT_W = OUT_H === 1440 ? 2560 : 1920;
const KBPS = Math.max(2500, Math.min(30000, Number(E("KBPS", OUT_H === 1440 ? "18000" : "9000")) || 9000));
const PRESET = E("PRESET", "faster");
// 192k AAC (was 160k): headroom for gunfire and voices together. YouTube takes up to 384k
const AUDIO_KBPS = Math.max(128, Math.min(384, Number(E("AUDIO_KBPS", "192")) || 192));
// the encoder and the ears run above Edge, so a busy page can never starve them: a starved encoder drops
// frames and a starved audio pipe crackles, which is the "unstable" this guards against
const raisePriority = (pid) => { if (E("PRIORITY", "1") === "0") return; try { os.setPriority(pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch {} };

const ps = (cmd) => new Promise((res) => execFile("powershell", ["-NoProfile", "-Command", cmd], { windowsHide: true, timeout: 20_000 }, (e, out) => res(e ? "" : String(out).trim())));
/** The rig browser: the Edge Playwright started (a child of THIS process, never Josh's own Edge), its root
 *  process (whose tree plays the sound) and its window. */
async function findBrowser() {
  for (let i = 0; i < 10; i++) {
    const out = await ps(`$p = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' AND ParentProcessId=${process.pid}" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1; ` +
      `if ($p) { $h = (Get-Process -Id $p.ProcessId).MainWindowHandle; "$($p.ProcessId) $h" }`);
    const [pid, hwnd] = out.split(/\s+/).map(Number);
    if (pid > 0 && hwnd > 0) return { pid, hwnd };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
/** The window's size as Windows Graphics Capture delivers it (one frame). */
async function windowSize(hwnd) {
  const out = await new Promise((res) => execFile("ffmpeg", ["-hide_banner", "-filter_complex", `gfxcapture=hwnd=${hwnd}:capture_cursor=0,hwdownload,format=bgra`, "-frames:v", "1", "-f", "null", "-"],
    { windowsHide: true, timeout: 20_000 }, (_e, _o, err) => res(String(err))));
  const m = /Video: .*?, (\d{3,5})x(\d{3,5})/.exec(out);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}
function startRecorder(target, size, session) {
  // the page is the bottom 1920x1080 of the window: Edge's tabs and address bar above it, an equal border
  // on the left, right and bottom (fitWindow made the page exactly that size)
  const side = Math.max(0, Math.floor((size.w - 1920) / 2));
  const crop = { l: side, r: Math.max(0, size.w - 1920 - side), b: side, t: Math.max(0, size.h - 1080 - side) };
  const outs = [];
  if (RECORD) {
    const pattern = path.join(REC_DIR, "survivorz-%Y%m%d-%H%M%S.mp4");
    outs.push(`[f=segment:segment_time=${REC_SEGMENT_S}:segment_format=mp4:reset_timestamps=1:strftime=1:` +
      `segment_format_options=movflags\\=+frag_keyframe+empty_moov+default_base_moof:onfail=ignore]${teePath(pattern)}`);
  }
  // the TS on stdout always runs: the YouTube leg reads it, and its bytes are the watchdog's proof of life
  // (the encoder writes its header up front for the MP4s; the TS wants it in-band, hence the bitstream filter)
  outs.push("[f=mpegts:bsfs/v=h264_mp4toannexb:onfail=ignore]pipe\\:1");
  const t0 = Date.now() * 1000;   // µs: the picture and the sound are both stamped against this
  // A FIXED LIFT, NOT loudnorm (Nov 1 2026 — Josh: "I don't hear anyone talking … the audio quality is still
  // bad"). The page's own mix is good — voices ~-28 dB in the speech band, the room's drone ~-38 — but at
  // -30.6 LUFS overall. loudnorm run live (single pass) chased -16 LUFS second by second: in every gap
  // between lines it turned the drone up to where the voices had been, then clamped down when someone
  // spoke — a loud pumping rumble the voices sank into. Now: a fixed lift to ~-16 LUFS (SURVIVORZ_GAIN_DB,
  // 14), a 60 Hz high-pass for the sub-rumble, and a limiter for the gunshots — the show's own balance kept.
  const gainDb = Number(E("GAIN_DB", "14")) || 0;
  const loud = `,highpass=f=60,volume=${gainDb}dB,alimiter=limit=0.89:attack=5:release=80:level=disabled`;
  const graph =
    `gfxcapture=hwnd=${target.hwnd}:capture_cursor=0:max_framerate=60:crop_left=${crop.l}:crop_right=${crop.r}:crop_top=${crop.t}:crop_bottom=${crop.b},` +
    `hwdownload,format=bgra,settb=1/1000000,setpts=RTCTIME-${t0},fps=60,` +
    (OUT_H === 1080 ? "format=yuv420p[v];" : `scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p[v];`) +
    // the sound arrives stamped by the wall clock; aresample keeps it continuous and eases any drift
    // between the sound card's clock and the system's; then the fixed lift above
    `[0:a]asettb=1/1000000,asetpts=PTS-${t0},aresample=async=1:min_hard_comp=0.100:max_soft_comp=0.02:first_pts=0${loud},aresample=48000[a]`;
  const args = ["-hide_banner", "-loglevel", "warning", "-stats_period", "5",
    "-thread_queue_size", "4096", "-use_wallclock_as_timestamps", "1", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", "pipe:0",
    "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-copyts",
    "-c:v", "libx264", "-preset", PRESET, "-pix_fmt", "yuv420p",
    "-b:v", `${KBPS}k`, "-maxrate", `${KBPS}k`, "-bufsize", `${KBPS * 2}k`, "-x264-params", "nal-hrd=cbr",
    "-g", "120", "-keyint_min", "120", "-sc_threshold", "0", "-bf", "2", "-flags:v", "+global_header",
    "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-ar", "48000", "-ac", "2", "-flags:a", "+global_header",
    "-f", "tee", outs.join("|")];
  const ears = spawn(EARS, [String(target.pid)], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const me = { proc, ears, session, startedAt: Date.now(), out: 0 };
  rec = me;
  raisePriority(proc.pid); raisePriority(ears.pid);
  proc.stdin.on("error", () => {});
  ears.stdout.on("data", (d) => { if (rec === me && !proc.stdin.write(d)) { /* ffmpeg reads as fast as it plays */ } });
  ears.stderr.on("data", (d) => { const s = String(d).trim(); if (s) ev(`[ears] ${s.slice(0, 200)}`); });
  ears.on("exit", (c) => { ev(`ears exited ${c}`); if (rec === me) { try { proc.kill(); } catch {} } });
  proc.stderr.on("data", (d) => { const s = mask(String(d)).trim(); if (s && !/^frame=|^\s*$/.test(s)) ev(`[recorder] ${s.slice(0, 200)}`); });
  proc.stdout.on("data", (chunk) => { me.out += chunk.length; bytesIn += chunk.length; lastChunkAt = Date.now(); if (RTMP) feedYoutube(chunk); });
  proc.on("exit", (c) => { ev(`recorder exited ${c}`); try { ears.kill(); } catch {} if (rec === me) rec = null; endYoutube("recorder ended"); });
  ev(`recorder: window ${size.w}x${size.h} crop l${crop.l} t${crop.t} r${crop.r} b${crop.b} -> ${OUT_W}x${OUT_H} x264 ${PRESET} ${KBPS} kbit/s 60 fps, AAC ${AUDIO_KBPS}k ->${[RECORD ? REC_DIR : null, RTMP ? "YouTube leg" : null].filter(Boolean).join(" + ")}`);
}
function endRecorder() {
  const r = rec; rec = null;
  if (!r) return Promise.resolve();
  try { r.ears.kill(); } catch {}
  return new Promise((res) => {
    // (stdin is the sound, so ffmpeg's "q" can't reach it; the segments are fragmented MP4, which a hard
    // stop leaves playable to the last fragment)
    const t = setTimeout(() => { try { r.proc.kill(); } catch {} res(); }, 1500);
    r.proc.once("exit", () => { clearTimeout(t); res(); });
    try { r.proc.stdin.end(); } catch {}
  });
}

// ======================================================================================
// THE YOUTUBE LEG — reconnects, splits, never touches the recording
// ======================================================================================
// TWO LEGS (Nov 3 2026): YouTube's MAIN ingest and its BACKUP ingest (b.rtmp, the same key) each get the
// same stream. When one ingest server or route fails, YouTube switches to the other without ending the
// broadcast. Each leg is its own process with its own redial and backoff, so one dropping never touches the
// other or the recording. A backup leg is a copy, no second encode (about 1% of a core and no GPU), and it
// doubles the upload (~37 Mbit/s at 18 Mbit/s each; the house line measured ~120 Mbit/s up on Nov 3).
// SURVIVORZ_RTMP_BACKUP names it (derived from SURVIVORZ_RTMP for a YouTube URL; "off" = main only).
// (The leg used to be able to re-encode — SURVIVORZ_YT_ENCODE — from when Edge did the encoding; since Nov 1
// the recorder makes one steady CBR stream, so both legs copy it untouched.)
const newLeg = (name, url) => ({ name, url, proc: null, state: "down", downSince: Date.now(), backoff: 5000, nextTry: 0, since: 0, n: 0 });
const legs = [RTMP ? newLeg("youtube", RTMP) : null, RTMP && BACKUP ? newLeg("backup", BACKUP) : null].filter(Boolean);
const [mainLeg, backupLeg] = legs;
let splitUntil = 0;
/** what the server is told: the main leg's state, "backup" while only the backup carries the broadcast */
const ytState = () => !mainLeg ? "off" : mainLeg.state !== "up" && backupLeg?.state === "up" ? "backup" : mainLeg.state;
/** the broadcast is down only when NO leg is up; how long it has been */
const ytDownFor = () => legs.some((l) => l.proc) ? 0 : Date.now() - Math.max(...legs.map((l) => l.downSince));
const ytSince = () => { const up = legs.filter((l) => l.proc); return up.length ? Math.min(...up.map((l) => l.since)) : null; };
function startLeg(leg) {
  // (loglevel error: a leg joins the TS between keyframes and its probe warns "non-existing PPS" until
  // the next one, at most 2 s — noise, not a fault; a real failure is still an error)
  const args = ["-hide_banner", "-loglevel", "error", "-f", "mpegts", "-i", "pipe:0", "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "copy", "-c:a", "copy",
    "-bsf:a", "aac_adtstoasc", "-flvflags", "no_duration_filesize", "-f", "flv", "-y", leg.url.replace("{n}", String(++leg.n))];
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  raisePriority(proc.pid);
  leg.proc = proc; leg.state = "up"; leg.since = Date.now();
  proc.stdin.on("error", () => {});
  proc.stderr.on("data", (d) => { const s = mask(String(d)).trim(); if (s) ev(`[${leg.name}] ${s.slice(0, 200)}`); });
  proc.on("exit", (c) => {
    if (leg.proc !== proc) return;   // ended on purpose (split / recorder change)
    leg.proc = null; leg.state = "down"; leg.downSince = Date.now();
    leg.nextTry = Date.now() + leg.backoff; ev(`${leg.name} leg dropped (exit ${c}) — retrying in ${leg.backoff / 1000}s`);
    leg.backoff = Math.min(60_000, leg.backoff * 2);
  });
  ev(`${leg.name} leg connected`);
}
function feedYoutube(chunk) {
  for (const leg of legs) {
    if (!leg.proc) continue;
    // a stuck leg must never hold up the recorder: past 32 MB queued it is thrown away and redialled
    if (leg.proc.stdin.writableLength > 32 * 1024 * 1024) { ev(`${leg.name} leg is not keeping up — redialling`); endLeg(leg, "stuck", true); continue; }
    leg.proc.stdin.write(chunk);
  }
}
/** end a leg on purpose. `retry` = a fault (backoff applies); otherwise it's a planned stop. */
function endLeg(leg, why, retry = false) {
  const p = leg.proc; if (!p) return;
  leg.proc = null;
  if (leg.state !== "split") { leg.state = "down"; leg.downSince = Date.now(); }
  if (retry) leg.nextTry = Date.now() + leg.backoff;
  p.stdin.end();
  setTimeout(() => { try { p.kill(); } catch {} }, 10_000).unref();
  say(`${leg.name} leg ended: ${why}`);
}
function endYoutube(why) { for (const leg of legs) endLeg(leg, why); }
/** the 11-hour split: end the broadcast (BOTH legs, or the backup would carry it on), wait for YouTube to
 *  close it, and (by default) replace Edge */
async function split() {
  ev(`THE SPLIT: ${(SPLIT_MS / 3_600_000).toFixed(2)} h on air — ending the YouTube session for ${SPLIT_GAP_MS / 1000}s so it becomes its own replay`);
  for (const leg of legs) leg.state = "split";
  endYoutube("the split");
  splitUntil = Date.now() + SPLIT_GAP_MS;
  if (SPLIT_RESTART) await replaceSession("the split (shedding Edge's memory)");
}
function tendYoutube() {
  if (!legs.length) return;
  const now = Date.now();
  const since = ytSince();
  if (since != null && now - since >= SPLIT_MS && !restarting) { void split(); return; }
  if (now < splitUntil) return;
  // only once the recorder is producing (a fresh leg must start on real pictures)
  if (!rec || !rec.out || now - lastChunkAt > 3000) return;
  for (const leg of legs) {
    if (leg.proc || now < leg.nextTry) continue;
    if (leg.state === "split") leg.backoff = 5000;
    startLeg(leg);
  }
}

// ======================================================================================
// THE BROWSER SESSION — Edge, drawing the stream page (the recorder takes its window and its sound)
// ======================================================================================
let browser = null, page = null, session = 0, restarts = 0, restarting = false, sessionFails = 0;
async function startSession() {
  session++;
  const my = session;
  // no --enable-automation: its "controlled by automated software" bar sits in the page's own area
  browser = await chromium.launch({ executablePath: EDGE, headless: false, ignoreDefaultArgs: ["--enable-automation"], args: [
    "--auto-accept-this-tab-capture", "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--force-device-scale-factor=1", "--window-size=1944,1172", "--window-position=0,0",
    "--disable-features=CalculateNativeWinOcclusion,Translate", "--no-first-run", "--no-default-browser-check",
  ] });
  const ctx = await browser.newContext({ viewport: null });
  // the token reaches the page before any of its code runs, and never sits in a URL
  await ctx.addInitScript((t) => { window.__survStreamToken = t; }, TOKEN);
  page = await ctx.newPage();
  page.on("pageerror", (e) => row({ ev: `page_error:${String(e.message).slice(0, 100)}` }));
  page.on("crash", () => ev("[page] crashed"));
  await page.goto(`${SERVER}/#survivorz-stream`);
  await page.waitForFunction(() => window.stream?.ready === true, null, { timeout: 240_000, polling: 1000 });
  await fitWindow();
  ev(`session ${my}: page ${await page.evaluate(() => `${innerWidth}x${innerHeight} @${devicePixelRatio}`)}`);
  // one click on the shield (a gesture, in case anything in the page's sound waits for one)
  await page.mouse.click(960, 540);
  // the picture and the sound are taken from OUTSIDE the browser (Nov 1 2026): the window by Windows
  // Graphics Capture, the sound by process loopback — the page only draws the show
  const target = await findBrowser();
  if (!target) throw new Error("couldn't find the rig browser's window");
  const size = await windowSize(target.hwnd);
  if (!size) throw new Error("couldn't grab the rig browser's window");
  if (my !== session) return;
  startRecorder(target, size, my);
  ev(`session ${my}: recording window ${target.hwnd} (${size.w}x${size.h}, page 1920x1080) and process ${target.pid}'s sound`);
}
// the page's surface must be EXACTLY 1920x1080: Edge's frame, its bars and display scaling all move it
async function fitWindow() {
  const cdp = await page.context().newCDPSession(page);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  for (let i = 0; i < 5; i++) {
    const { iw, ih } = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }));
    if (iw === 1920 && ih === 1080) break;
    const { bounds } = await cdp.send("Browser.getWindowBounds", { windowId });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: bounds.width + 1920 - iw, height: bounds.height + 1080 - ih } });
    await page.waitForTimeout(400);
  }
  await cdp.detach().catch(() => {});
}
async function endSession() {
  const b = browser; browser = null; page = null;
  await b?.close().catch(() => {});
  await endRecorder();
}
// a start that never finishes (a call into a page that stopped answering) must not leave the rig "restarting"
// for ever with the watchdog standing aside: it fails after START_MS and the browser is thrown away
const START_MS = 300_000;
function startWithin() {
  return Promise.race([startSession(), new Promise((_, rej) => setTimeout(() => rej(new Error("the page took over 5 minutes to start")), START_MS))]);
}
async function replaceSession(why) {
  if (restarting) return;
  restarting = true; restarts++;
  ev(`[watchdog] session ${session} replaced (${restarts}): ${why}`);
  await endSession();
  try { await startWithin(); sessionFails = 0; }
  catch (e) { sessionFails++; ev(`[watchdog] start failed (${sessionFails}): ${String(e.message).split("\n")[0].slice(0, 160)}`); await endSession(); }
  stalledSince = slowSince = 0; lastBytes = bytesIn;
  restarting = false;
}

// THE WATCHDOG: replace the session on no picture for 15 s, the page under 30 fps for 30 s, the
// recorder gone, the browser gone, or the page's heap past HEAP_MB. A failed start waits a little
// longer each time (5 s, 10 s … 2 min) so a dead server isn't hammered.
let lastBytes = 0, stalledSince = 0, slowSince = 0, nextStartAt = 0, statHungSince = 0;
// A CALL INTO THE PAGE NEVER WAITS FOR EVER (Oct 31 2026): with the GPU out of memory the tab lost its WebGL
// context, reloaded, and Edge then blocked WebGL for it — the page sat at "starting", and page.evaluate never
// answered, so the stats tick (and the watchdog behind it) stopped for the rest of the run: three minutes of a
// still frame with no replacement. Every call into the page now gives up after PAGE_CALL_MS, a stats call that
// gives up counts as a stall, and a tick never starts while the last is still running.
const PAGE_CALL_MS = 4000;
const PAGE_HUNG = Symbol("hung");
function pageCall(fn, arg) {
  const pg = page;
  if (!pg) return Promise.resolve(PAGE_HUNG);
  return Promise.race([pg.evaluate(fn, arg), new Promise((res) => setTimeout(() => res(PAGE_HUNG), PAGE_CALL_MS))]).catch(() => PAGE_HUNG);
}
// ---- standing by ----
/** the server's last word: true = stream, false = stand by, null = no word yet (or an older server) */
let wanted = null;
const standingBy = () => wanted === false && !browser && !restarting;
async function goIdle(why) {
  if (restarting) return;
  restarting = true;
  ev(`standing by: ${why}`);
  endYoutube("standing by");
  await endSession();
  sessionFails = 0; nextStartAt = 0;
  restarting = false;
}
function hearWant(r) {
  if (typeof r?.want !== "boolean") return;
  const was = wanted;
  wanted = r.want;
  if (wanted && was !== true) { nextStartAt = 0; if (was === false) ev("the server wants a stream — going live"); }
  if (!wanted && was !== false && (browser || rec)) void goIdle("the server stopped the stream");
}

async function watchdog(stats) {
  if (restarting) return;
  const now = Date.now();
  if (!browser) {
    if (wanted === false) return;   // standing by: nothing to watch
    if (now < nextStartAt) return;
    nextStartAt = now + Math.min(120_000, 5000 * 2 ** Math.min(5, sessionFails));
    return replaceSession(sessionFails ? `retrying (${sessionFails} failed starts)` : "no session");
  }
  let why = "";
  if (!browser.isConnected()) why = "the browser is gone";
  if (bytesIn === lastBytes) { stalledSince ||= now; if (now - stalledSince > 15_000) why ||= "no picture from the recorder for 15 s"; } else stalledSince = 0;
  lastBytes = bytesIn;
  if (stats.fps != null && stats.fps < 30) { slowSince ||= now; if (now - slowSince > 30_000) why ||= `the page at ${stats.fps} fps for 30 s`; } else slowSince = 0;
  if (stats.hung) { statHungSince ||= now; if (now - statHungSince > 15_000) why ||= "the page stopped answering for 15 s"; } else statHungSince = 0;
  if (!rec) why ||= "the recorder is not running";
  if (stats.heapMB && stats.heapMB > HEAP_MB) why ||= `the page's heap at ${stats.heapMB} MB`;
  if (why) await replaceSession(why);
}

// ======================================================================================
// THE RECORDING FOLDER — what's there, is it growing, and the size cap
// ======================================================================================
function recFiles() {
  try {
    return fs.readdirSync(REC_DIR).filter((f) => /^survivorz-\d{8}-\d{6}\.mp4$/.test(f)).sort()
      .map((f) => { const p = path.join(REC_DIR, f); const st = fs.statSync(p); return { p, size: st.size, mtime: st.mtimeMs }; });
  } catch { return []; }
}
let recDownSince = 0;
function recState() {
  if (!RECORD) return "off";
  const f = recFiles().at(-1);
  const up = !!rec && !!f && Date.now() - f.mtime < 30_000;
  if (up) recDownSince = 0; else recDownSince ||= Date.now();
  return up ? "up" : "down";
}
function pruneRecordings() {
  if (!RECORD) return;
  const files = recFiles();
  let total = files.reduce((a, f) => a + f.size, 0);
  // never the newest (it's the one being written)
  for (const f of files.slice(0, -1)) {
    if (total <= REC_CAP_BYTES) break;
    try { fs.unlinkSync(f.p); total -= f.size; ev(`recording cap: deleted ${path.basename(f.p)} (${(f.size / 1024 ** 3).toFixed(1)} GB)`); } catch {}
  }
}

// ---- the GPU, every 5 s
const smi = () => new Promise((res) => execFile("nvidia-smi", ["--query-gpu=utilization.gpu,utilization.encoder,memory.used", "--format=csv,noheader,nounits"],
  (e, out) => res(e ? {} : (([gpu, enc, mem]) => ({ gpu, enc, mem }))(String(out).trim().split(/,\s*/)))));

// a weeks-long run must not let Windows sleep or blank the display Edge draws on: a child PowerShell
// holds SetThreadExecutionState for as long as it lives, and dies with the rig
const awake = spawn("powershell", ["-NoProfile", "-Command",
  "Add-Type -Name P -Namespace W -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'; " +
  // (it watches the rig's pid too, so a force-killed rig never leaves the machine held awake)
  `[W.P]::SetThreadExecutionState([uint32]2147483651) | Out-Null; while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep 30 }`], { stdio: "ignore", windowsHide: true });
process.on("exit", () => { try { awake.kill(); } catch {} });

// ======================================================================================
// RUN
// ======================================================================================
say(`SURVIVORZ STREAM RIG — ${SERVER} -> ${[RTMP ? (BACKUP ? "YouTube (main + backup ingest)" : "YouTube") : null, RECORD ? `recording in ${REC_DIR}` : null].filter(Boolean).join(" + ")}` +
  ` · split every ${(SPLIT_MS / 3_600_000).toFixed(2)} h, gap ${SPLIT_GAP_MS / 1000}s · ${MINUTES ? `${MINUTES} min` : "until stopped"}`);
let last = { stats: {}, bytes: 0, at: Date.now() };
let stopping = false;
let statBusy = false;
const statTimer = setInterval(async () => {
  if (stopping || statBusy) return;
  statBusy = true;
  try { await statTick(); } finally { statBusy = false; }
}, 5000);
async function statTick() {
  const now = Date.now();
  if (now >= END_AT) return stop("the run's length is up");
  const got = page && !restarting ? await pageCall(() => window.stream?.stats() ?? {}) : {};
  const stats = got === PAGE_HUNG ? { hung: true } : got;
  last.stats = stats;
  const g = await smi();
  const mbit = ((bytesIn - last.bytes) * 8) / 1e6 / ((now - last.at) / 1000);
  last.bytes = bytesIn; last.at = now;
  row({ ...g, fps: stats.fps, heap: stats.heapMB, mbit: mbit.toFixed(1), rtmp: backupLeg ? `${mainLeg.state}/${backupLeg.state}` : ytState(), rec: RECORD ? recState() : "off" });
  tendYoutube();
  await watchdog(stats);
}
// the heartbeat — and the standby card comes back in its answer
let beatFails = 0;
const beatTimer = setInterval(async () => {
  if (stopping) return;
  const now = Date.now();
  const problems = [];
  const idle = standingBy();
  // (a backup leg down alone is not a problem: the broadcast is still on air through the main one)
  if (!idle && RTMP && ytDownFor() > 2 * 60_000) problems.push(`YouTube has been down ${Math.round(ytDownFor() / 60_000)} min`);
  if (!idle && RECORD && recDownSince && now - recDownSince > 2 * 60_000) problems.push(`the recording hasn't grown for ${Math.round((now - recDownSince) / 60_000)} min`);
  if (sessionFails >= 3) problems.push(`the stream page has failed to start ${sessionFails} times`);
  const r = await postBeat({
    fps: last.stats.fps ?? null, heapMB: last.stats.heapMB ?? null, lastFrameAt: lastChunkAt || null,
    rtmp: ytState(), recording: RECORD ? recState() : "off", ffmpeg: !!rec, session, restarts,
    rtmpSince: ytSince(), problem: problems.join("; ") || null, idle,
  });
  hearWant(r);
  if (r?.standby && page && !restarting) await pageCall((s) => window.stream?.setStandby(s), r.standby);
  if (r?.error) { if (beatFails++ % 30 === 0) ev(`heartbeat failed: ${r.error}`); } else beatFails = 0;
}, BEAT_MS);
const pruneTimer = setInterval(pruneRecordings, 5 * 60_000);
pruneRecordings();

async function stop(why) {
  if (stopping) return;
  stopping = true;
  clearInterval(statTimer); clearInterval(beatTimer); clearInterval(pruneTimer);
  ev(`stopping: ${why}`);
  endYoutube("stopping");
  await endSession();
  await postBeat({ stopping: true });
  csv.end();
  say(`done: ${(bytesIn / 1048576).toFixed(1)} MB recorded, ${session} session(s), ${restarts} restart(s)`);
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", () => stop("Ctrl+C"));
process.on("SIGTERM", () => stop("terminated"));
process.on("unhandledRejection", (e) => ev(`unhandled: ${String(e?.message ?? e).slice(0, 160)}`));
if (process.env.SURVIVORZ_KILL_AT) setTimeout(() => { ev("[test] killing the browser"); browser?.close(); }, Number(process.env.SURVIVORZ_KILL_AT) * 1000);

// ask the server first: stand by, or go live now (no word, or an older server: live now, as before)
hearWant(await postBeat({ idle: true, rtmp: RTMP ? "down" : "off", recording: RECORD ? "down" : "off", ffmpeg: false, session, restarts }));
if (wanted === false) say("standing by — Start show + stream in Admin Panel → Survivorz → Show puts it live");
else {
  // the first session starts under the same flag a replacement does, so the watchdog leaves it be
  restarting = true;
  try { await startWithin(); } catch (e) { sessionFails++; ev(`first start failed: ${String(e.message).split("\n")[0].slice(0, 160)}`); await endSession(); }
  stalledSince = slowSince = 0; lastBytes = bytesIn; restarting = false;
}
