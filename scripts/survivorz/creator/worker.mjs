// SURVIVORZ CREATOR: the worker on Josh's PC (docs/survivorz/CREATOR.md). It asks the server for a
// body dropped into Admin Panel → Characters, bakes it here (scripts/survivorz/creator/bake.mjs,
// the 3090 Ti, the LLM paused for the length of it), reports every step to the panel as it goes,
// and sends the packed body back into the server's game/ folder. One body at a time.
//
//   node scripts/survivorz/creator/worker.mjs [--server https://solace.zone] [--once]
//
// The token is SURVIVORZ_WORKER_TOKEN, or the file %USERPROFILE%\.solace-gpu\worker-token (the
// workstation's supervisor home: a Claude session can't keep anything alive, so Task Scheduler
// starts this, the way it starts solace-gpu.ps1).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bodies from "../bodies.cjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..", "..");
const STAGE = bodies.STAGE;
const argv = process.argv.slice(2);
const arg = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const SERVER = (arg("--server") ?? process.env.SOLACE_URL ?? "https://solace.zone").replace(/\/$/, "");
const HOME = path.join(os.homedir(), ".solace-gpu");
const TOKEN = process.env.SURVIVORZ_WORKER_TOKEN || (fs.existsSync(path.join(HOME, "worker-token")) ? fs.readFileSync(path.join(HOME, "worker-token"), "utf8").trim() : "");
const NAME = os.hostname().toLowerCase();
const GPU = path.join(HOME, "solace-gpu.ps1");
const POLL_MS = 20_000;

if (TOKEN.length < 24) {
  console.error("no worker token: set SURVIVORZ_WORKER_TOKEN or write it to " + path.join(HOME, "worker-token"));
  process.exit(1);
}
// --log <file>: the task scheduler runs this with no console, so it writes its own log
const LOG_FILE = arg("--log");
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  if (LOG_FILE) try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* the log is best-effort */ }
};
const api = (p, opts = {}) => fetch(`${SERVER}${p}`, { ...opts, headers: { authorization: `Bearer ${TOKEN}`, ...(opts.headers ?? {}) } });
const postJson = (p, body) => api(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The model comes as the bytes Josh dropped: an FBX, a GLB, or a zip holding one with its textures. */
async function fetchModel(job) {
  const dir = path.join(STAGE, "creator", job.id, "source");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // (through a deploy's 502s and a dropped download, like the uploads)
  let bytes = null;
  const r = await retry(`${job.id} model`, async () => { const x = await api(`/api/survivorz/worker/model/${job.id}`); if (x.ok) bytes = Buffer.from(await x.arrayBuffer()); return x; });
  if (!r.ok || !bytes) throw new Error(`couldn't fetch the model (${r.status})`);
  const file = path.join(dir, `model.${job.kind}`);
  fs.writeFileSync(file, bytes);
  if (job.kind !== "zip") return file;
  // Windows 10+ ships bsdtar, which reads zips — by its full path: Git's GNU tar on the PATH reads "C:" as a
  // remote host and can't open a zip at all
  const sysTar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const x = spawnSync(fs.existsSync(sysTar) ? sysTar : "tar", ["-xf", file, "-C", dir], { encoding: "utf8", windowsHide: true });
  if (x.status !== 0) throw new Error("couldn't open the zip: " + (x.stderr || x.stdout).slice(0, 300));
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(fbx|glb|gltf)$/i.test(e.name)) found.push({ p, size: fs.statSync(p).size });
    }
  };
  walk(dir);
  if (!found.length) throw new Error("the zip has no FBX, GLB or glTF in it");
  // the biggest model file in it is the character (zips carry LODs and props beside it)
  return found.sort((a, b) => b.size - a.size)[0].p;
}

function gpu(flag) {
  if (!fs.existsSync(GPU)) return;
  spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", GPU, flag], { stdio: "ignore", windowsHide: true });
}
// THE LLM COMES BACK (Nov 11 2026 review): the pause is a file (~/.solace-gpu/paused) that outlives this worker.
// Killed mid-bake, the restarted worker read it as "Josh paused it by hand" and never resumed — the LLM stayed
// off until somebody noticed. A pause this worker makes leaves its own marker; one found at start is undone.
const MY_PAUSE = path.join(HOME, "paused-by-worker");
const handPaused = () => fs.existsSync(path.join(HOME, "paused")) && !fs.existsSync(MY_PAUSE);
function pauseLlm() { try { fs.writeFileSync(MY_PAUSE, new Date().toISOString()); } catch { /* best-effort */ } gpu("-Pause"); }
function resumeLlm() { gpu("-Resume"); fs.rmSync(MY_PAUSE, { force: true }); }

// ---------- games: a bake gives the GPU back while one runs (the GPU supervisor's own list) ----------
const DEFAULT_GAMES = ["aces", "starcitizen"];   // War Thunder, Star Citizen (solace-gpu.ps1 $DefaultGames)
function games() {
  const list = new Set(DEFAULT_GAMES);
  try {
    for (const l of fs.readFileSync(path.join(HOME, "games.txt"), "utf8").split(/\r?\n/)) {
      const g = l.trim().replace(/\.exe$/i, "").toLowerCase();
      if (g && !g.startsWith("#")) list.add(g);
    }
  } catch { /* no list: the built-in two */ }
  return list;
}
/** The game that's running, if any (process names, case-insensitive, without .exe). */
function runningGame() {
  const r = spawnSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return null;
  const want = games();
  for (const line of r.stdout.split(/\r?\n/)) {
    const name = line.split('","')[0]?.replace(/^"/, "").replace(/\.exe$/i, "").toLowerCase();
    if (name && want.has(name)) return name;
  }
  return null;
}

/** The bake and everything it started (Blender, Chrome, the node steps): gone, so the GPU is free. */
function killTree(pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
}

/** An earlier bake of this body still running (its worker died without taking it along): stopped before another
 *  starts on the same files. Only a pid that is still a node process. */
function stopStale(id) {
  const f = path.join(STAGE, "creator", id, "bake.pid");
  let pid = 0;
  try { pid = Number(fs.readFileSync(f, "utf8")); } catch { return; }
  if (pid > 0) {
    const t = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
    if (/^"node\.exe"/im.test(t.stdout ?? "")) { killTree(pid); log(`${id}: an earlier bake was still running (pid ${pid}) — stopped`); }
  }
  fs.rmSync(f, { force: true });
}

/** The step a stopped bake was on (it restarts from scratch), from its status file. */
function stepOn(statusFile) {
  try {
    const s = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    const order = (s.order ?? []).map((o) => o.id);
    const running = Object.entries(s.steps ?? {}).find(([, v]) => v.state === "running")?.[0];
    if (running) return running;
    return order.find((id) => s.steps?.[id]?.state !== "done") ?? null;
  } catch {
    return null;
  }
}

/** WHERE A BODY THE SERVER HANDS BACK PICKS UP (Nov 11 2026): the first step not done on BOTH checklists — this
 *  PC's own (status.json) and the server's. The server's resume step can be stale (paused at "build", resumed,
 *  then the PC restarted mid-"law": it still said "build", and a 30-minute step ran again); this PC's checklist
 *  can be ahead of what the admin asked for (the "pairs" button clears pairs and verify on the server only).
 *  null = this PC has no record of the earlier bake: it bakes fresh. "deliver" = every step is done. */
function resumePoint(job, statusFile) {
  let s;
  try { s = JSON.parse(fs.readFileSync(statusFile, "utf8")); } catch { return null; }
  const order = (s.order ?? []).map((o) => o.id);
  if (!order.length) return null;
  const done = (steps, id) => steps?.[id]?.state === "done";
  return order.find((id) => !(done(s.steps, id) && done(job.steps, id))) ?? "deliver";
}

/** THE BAKE BAKES WHAT'S ON MASTER (Nov 8 2026): this worker runs from Josh's main checkout, which nothing else
 *  updates — realism work pushed from a worktree (the real jog and run, their measured speeds) sat ten commits
 *  away from the bake. Before each bake the checkout fast-forwards to origin's master: only on master, only a
 *  fast-forward (work in the checkout is never touched — a refusal is logged and the bake goes ahead on what's
 *  there), never asking for a password. The bake's steps are node scripts read fresh each time, so no rebuild. */
function freshen() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  const git = (...a) => spawnSync("git", ["-C", ROOT, ...a], { encoding: "utf8", env, timeout: 60_000, windowsHide: true });
  const br = (git("branch", "--show-current").stdout ?? "").trim();
  if (br !== "master") { log(`checkout on ${br || "?"}: baking what's there`); return; }
  const f = git("fetch", "-q", "origin", "master");
  if (f.status !== 0) { log(`fetch failed, baking what's there: ${(f.stderr ?? "").trim().slice(0, 200)}`); return; }
  const m = git("merge", "--ff-only", "-q", "origin/master");
  if (m.status !== 0) log(`not a fast-forward, baking what's there: ${(m.stderr ?? "").trim().slice(0, 200)}`);
  else log(`checkout at ${(git("rev-parse", "--short", "HEAD").stdout ?? "").trim()}`);
}

/**
 * Bake one body; "done", or how it was stopped: "me" (the admin pressed Pause) or "game" (a game
 * started). A stopped bake has already been killed and its step reported, so it can resume from it.
 */
async function bake(job, model, from) {
  const a = [path.join(HERE, "bake.mjs"), "--id", job.id];
  if (model) a.push("--in", model);
  if (job.heightM) a.push("--height", String(job.heightM));
  if (job.licence) a.push("--licence", job.licence);
  if (job.credit) a.push("--credit", job.credit);
  if (from) a.push("--from", from);
  const status = path.join(STAGE, "creator", job.id, "status.json");
  const intake = path.join(STAGE, "creator", job.id, "intake.json");
  // (a fresh bake starts its checklist clean; a resumed one keeps the steps already done)
  if (!from) fs.rmSync(status, { force: true });
  let stop = null;
  const send = async () => {
    try {
      const s = fs.existsSync(status) ? JSON.parse(fs.readFileSync(status, "utf8")) : null;
      const report = fs.existsSync(intake) ? JSON.parse(fs.readFileSync(intake, "utf8")) : undefined;
      if (!s) return;
      const r = await postJson(`/api/survivorz/worker/${job.id}/progress`, { steps: s.steps, report });
      if (r.ok && (await r.json()).pause) stop ??= "me";
      // (removed, or put back in the queue before this stop landed: it isn't this bake's any more)
      else if (r.status === 404 || r.status === 409) stop ??= "gone";
    } catch { /* the next tick tries again */ }
  };
  // (the bake's own detail goes to creator/<id>/bake.log; under the task there is no console to show it)
  const p = spawn(process.execPath, a, { cwd: ROOT, stdio: ["ignore", LOG_FILE ? "ignore" : "inherit", LOG_FILE ? "ignore" : "inherit"], env: { ...process.env, CREATOR_SERVER: SERVER } });
  const closed = new Promise((r) => p.on("close", r));
  let busy = false;
  const tick = setInterval(async () => {
    // (a slow server answer outlasting the 5 s tick used to start a second report on top of the first)
    if (busy) return;
    busy = true;
    try {
      if (!stop && runningGame()) stop = "game";
      if (!stop) await send();
      if (stop) killTree(p.pid);
    } finally { busy = false; }
  }, 5000);
  const code = await closed;
  clearInterval(tick);
  // (a report still on its way would land after the last one and leave a finished step reading "running")
  while (busy) await new Promise((r) => setTimeout(r, 100));
  if (stop === "gone") { log(`${job.id}: the server took it back (removed, or resumed before the pause landed) — stopped`); return stop; }
  if (stop) {
    const step = stepOn(status);
    await postJson(`/api/survivorz/worker/${job.id}/progress`, { resumeFrom: step, ...(stop === "game" ? { paused: "game" } : {}) }).catch(() => {});
    log(`${job.id}: paused at ${step ?? "the start"} (${stop === "me" ? "by you" : `a game: ${runningGame() ?? "closed"}`})`);
    return stop;
  }
  await send();
  if (code !== 0) {
    const s = fs.existsSync(status) ? JSON.parse(fs.readFileSync(status, "utf8")) : { steps: {} };
    const bad = Object.entries(s.steps).find(([, v]) => v.state === "failed");
    throw new Error(bad ? `${bad[0]}: ${bad[1].error ?? "failed"}` : `the bake exited ${code}`);
  }
  return "done";
}

/** A game took the GPU: wait for it to close (or for the admin to pause it for good). true = carry on. */
async function waitOutGame(job) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 15000));
    if (runningGame()) {
      // still reporting, so the panel sees the worker alive and an admin pause lands
      const r = await postJson(`/api/survivorz/worker/${job.id}/progress`, {}).catch(() => null);
      if (r?.status === 404 || r?.status === 409 || (r?.ok && (await r.json()).pause)) return false;
      continue;
    }
    const r = await postJson(`/api/survivorz/worker/${job.id}/progress`, { paused: null }).catch(() => null);
    if (r?.status === 404 || r?.status === 409 || (r?.ok && (await r.json()).pause)) return false;
    log(`${job.id}: the game closed, carrying on`);
    return true;
  }
}

/** A DEPLOY RESTARTS THE SERVER (Nov 10 2026 review): a 502 or a dropped connection used to fail a ~90-minute
 *  bake at its last step. Anything that isn't a real answer is tried again, for about four minutes. */
async function retry(what, fn) {
  for (let i = 0, wait = 5000; ; i++, wait = Math.min(wait * 2, 60_000)) {
    let r = null, err = null;
    try { r = await fn(); } catch (e) { err = e; }
    if (r && r.status < 500 && r.status !== 429) return r;
    if (i >= 7) { if (r) return r; throw err; }
    log(`${what}: ${r ? `the server answered ${r.status}` : err.message} — trying again in ${wait / 1000} s`);
    await new Promise((res) => setTimeout(res, wait));
  }
}

async function deliver(job) {
  // the grabs, bites and rescues first (the body's upload marks it ready): each zombie's halves, then
  // the table of what measured within the line (bake.mjs "pairs" → creator/<body>/)
  const pdir = path.join(STAGE, "creator", job.id, "pairclips");
  const ptable = path.join(STAGE, "creator", job.id, "pairs.json");
  if (fs.existsSync(ptable)) {
    let n = 0;
    for (const f of fs.existsSync(pdir) ? fs.readdirSync(pdir).filter((x) => x.endsWith(".glb")) : []) {
      const clip = fs.readFileSync(path.join(pdir, f));
      const pr = await retry(`${job.id} ${f}`, () => api(`/api/survivorz/worker/${job.id}/pairclip?zombie=${encodeURIComponent(f.slice(0, -4))}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: clip }));
      if (!pr.ok) throw new Error(`the server wouldn't take ${f} (${pr.status} ${await pr.text()})`);
      n++;
    }
    const table = JSON.parse(fs.readFileSync(ptable, "utf8"));
    const tr = await retry(`${job.id} pairs table`, () => postJson(`/api/survivorz/worker/${job.id}/pairs`, { table }));
    if (!tr.ok) throw new Error(`the server wouldn't take the pairs table (${tr.status} ${await tr.text()})`);
    log(`${job.id}: grabs, bites and rescues sent (${n} zombies)`);
  }
  // the gun seat and the loop speeds BEFORE the body: the body's upload marks it ready and puts it in the show,
  // so everything the show reads about it must already be there (the seat's answer used to go unchecked)
  const calFile = path.join(STAGE, "props", "guns", "cal.json");
  const cal = fs.existsSync(calFile) ? JSON.parse(fs.readFileSync(calFile, "utf8"))[job.id] : null;
  if (cal) { const cr = await retry(`${job.id} gun seat`, () => postJson(`/api/survivorz/worker/${job.id}/guncal`, { cal })); if (!cr.ok) throw new Error(`the server wouldn't take the gun seat (${cr.status} ${await cr.text()})`); }
  // how fast its loops go (the "speeds" step): the show matches its feet to these
  const spFile = path.join(STAGE, "creator", job.id, "loopspeed.json");
  const sp = fs.existsSync(spFile) ? Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(spFile, "utf8"))).map(([clip, by]) => [clip, by[job.id]]).filter(([, v]) => typeof v === "number")) : null;
  if (sp && Object.keys(sp).length) { const lr = await retry(`${job.id} loop speeds`, () => postJson(`/api/survivorz/worker/${job.id}/loopspeed`, { speeds: sp })); if (!lr.ok) throw new Error(`the server wouldn't take the loop speeds (${lr.status} ${await lr.text()})`); }
  // what it carries (the "kit" step): where its pack rides and its holstered, belted and slung kit sits
  const kfFile = path.join(STAGE, "creator", job.id, "kitfit.json");
  const kf = fs.existsSync(kfFile) ? JSON.parse(fs.readFileSync(kfFile, "utf8")) : null;
  const fit = kf ? { packs: kf.packs?.[job.id] ?? {}, stow: kf.stow?.[job.id] ?? {} } : null;
  if (fit && (Object.keys(fit.packs).length || Object.keys(fit.stow).length)) { const kr = await retry(`${job.id} kit fit`, () => postJson(`/api/survivorz/worker/${job.id}/kitfit`, { fit })); if (!kr.ok) throw new Error(`the server wouldn't take the pack and holster fits (${kr.status} ${await kr.text()})`); }
  const glb = path.join(STAGE, "game", `${job.id}.glb`);
  const buf = fs.readFileSync(glb);
  const r = await retry(`${job.id} body`, () => api(`/api/survivorz/worker/${job.id}/body`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: buf }));
  if (!r.ok) throw new Error(`the server wouldn't take the body (${r.status} ${await r.text()})`);
  log(`${job.id}: sent (${(buf.length / 1e6).toFixed(1)} MB)`);
}

async function once() {
  const r = await api(`/api/survivorz/worker/next?worker=${encodeURIComponent(NAME)}`);
  if (r.status === 401) throw new Error("the server refused the worker token");
  if (!r.ok) throw new Error(`the server answered ${r.status}`);
  const { body: job, known } = await r.json();
  // a body removed in the panel leaves this PC too (left registered, every later hug would pair with it)
  // (only bodies that came from THIS server: a worker pointed somewhere else never touches the rest)
  if (Array.isArray(known)) for (const [id, b] of Object.entries(bodies.registered())) if (b.server === SERVER && !known.includes(id)) { bodies.forget(id); log(`${id}: removed in the panel, forgotten here`); }
  if (!job) return false;
  const statusFile = path.join(STAGE, "creator", job.id, "status.json");
  // A BODY ALREADY BEGUN (a resume, the "pairs" button, this worker restarting mid-bake, Resume pressed before the
  // pause landed) picks up where both checklists agree it got to; one this PC has no record of bakes fresh.
  const begun = !!job.resumeFrom || Object.values(job.steps ?? {}).some((s) => s?.state === "done");
  let from = begun ? resumePoint(job, statusFile) : null;
  if (begun && !from) log(`${job.id}: no record of the earlier bake on this PC — baking it fresh`);
  log(`${job.id}: ${from === "deliver" ? "sending what it finished" : from ? `resuming at ${from}` : "baking"} ${job.sourceName}`);
  // (a body paused for a game when this worker last ran: wait the game out first)
  if (job.paused === "game" && !(await waitOutGame(job))) return true;
  // (paused by hand already: leave it paused afterwards too)
  const wasPaused = handPaused();
  try {
    // A FRESH BAKE STARTS FROM NOTHING: the last bake of this id left its clips, its raw clips (the law step
    // copies those BACK over failing clips), its measures and its body here — a re-bake after a height change, or
    // a body removed and re-added under the same id, quietly baked with the old model's pieces in it
    // (inside the try: a file something still holds open used to throw here every 20 s, the body "baking" for good)
    stopStale(job.id);
    if (!from) bodies.forget(job.id);
    // the newest master for a bake that's starting or picking up (not between a game's pause and its resume)
    if (from !== "deliver") freshen();
    // (the model is only read by the intake: a bake picking up past it doesn't download it again)
    let model = null;
    for (; from !== "deliver";) {
      if (!model && (!from || from === "intake")) model = await fetchModel(job);
      if (!wasPaused) pauseLlm();
      const how = await bake(job, model, from);
      // stopped: the GPU goes back to the LLM straight away (the supervisor still yields it to a game)
      if (!wasPaused) resumeLlm();
      if (how === "done") break;
      if (how === "me" || how === "gone" || !(await waitOutGame(job))) return true;
      // (a game stop landing as the last step finished: every step is done, and "no step" used to mean a fresh bake)
      from = stepOn(statusFile) ?? "deliver";
    }
    await deliver(job);
  } catch (e) {
    log(`${job.id}: failed — ${e.message}`);
    await retry(`${job.id} failure report`, () => postJson(`/api/survivorz/worker/${job.id}/progress`, { status: "failed", error: String(e.message).slice(0, 2000) })).catch(() => {});
  } finally {
    if (!wasPaused) resumeLlm();
  }
  return true;
}

// THE VOICES THIS PC ALREADY HAS go into the server's library (src/routes/survivorz-voices.ts), so the
// creator can play and pick them; slopbot fetches from there. Once at start, then hourly.
// (the picked references, and every take ever designed — scripts/rollo/design-voice.mjs's previews)
const VOICE_DIRS = [process.env.ROLLO_VOICES_DIR || "D:/solace-ai/models/voices", path.join(ROOT, "scripts", "rollo", "voice-previews")];
let voicesSyncedAt = 0;
async function syncVoices() {
  voicesSyncedAt = Date.now();
  const local = [];
  for (const d of VOICE_DIRS) {
    try { for (const f of fs.readdirSync(d)) if (/^[a-z0-9-]{2,40}.mp3$/.test(f)) local.push(path.join(d, f)); } catch { /* not on this PC */ }
  }
  const r = await api("/api/survivorz/worker/voices");
  if (!r.ok) return;
  const have = new Set((await r.json()).names ?? []);
  for (const file of local) {
    const name = path.basename(file).replace(/.mp3$/, "");
    if (have.has(name)) continue;
    have.add(name);
    const up = await api(`/api/survivorz/worker/voice?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: fs.readFileSync(file) });
    log(`voice ${name}: ${up.ok ? "added to the library" : `not added (${up.status})`}`);
  }
}

log(`worker ${NAME} -> ${SERVER}`);
if (fs.existsSync(MY_PAUSE)) { resumeLlm(); log("the LLM was left paused by a bake that was cut short: resumed"); }
for (;;) {
  let worked = false;
  try {
    if (Date.now() - voicesSyncedAt > 3_600_000) await syncVoices();
    worked = await once();
  } catch (e) {
    log(e.message);
  }
  if (argv.includes("--once")) break;
  if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
}
