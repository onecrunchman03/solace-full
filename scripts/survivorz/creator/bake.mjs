// SURVIVORZ CREATOR: one dropped, rigged model → a survivor body with the whole animation library
// on it, checked. Chains the steps that used to be run one at a time by hand (SURVIVORZ.md,
// ROLLO'S BODY was the last body done that way). docs/survivorz/CREATOR.md is the design.
//
//   node scripts/survivorz/creator/bake.mjs --in <model.fbx|.glb> --id <body> [--height 1.78]
//        [--licence "CC-BY-4.0"] [--credit "Name"] [--from <step>] [--only <step>]
//   node scripts/survivorz/creator/bake.mjs --id <body> --from pack     (resume an earlier bake)
//
// It starts the page server on 8791 itself when nothing is serving it. Each step's state and
// time is written to assets/downloads/survivorz/creator/<body>/status.json (what the Admin
// Panel's checklist reads), its output to bake.log beside it. A step that fails stops the bake;
// --from that step resumes it. Everything stays in the gitignored stage until the body is sent
// to the server.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bodies from "../bodies.cjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..", "..");
const STAGE = bodies.STAGE;
const BLENDER = process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";

const argv = process.argv.slice(2);
const arg = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ID = arg("--id");
const SRC = arg("--in");
if (!ID || !/^[a-z0-9-]{2,32}$/.test(ID)) {
  console.error("usage: bake.mjs --in <model> --id <body> (2-32 characters, a-z 0-9 -)");
  process.exit(1);
}
if (bodies.BUILT_IN[ID]) {
  console.error(`${ID} is one of the seven bodies made by hand; give the new body its own id`);
  process.exit(1);
}
const DIR = path.join(STAGE, "creator", ID);
fs.mkdirSync(DIR, { recursive: true });
const LOG = path.join(DIR, "bake.log");
// the measuring scripts write into anim/<body>/ and expect it to be there
fs.mkdirSync(path.join(STAGE, "anim", ID), { recursive: true });
const STATUS = path.join(DIR, "status.json");
const node = (script, ...a) => [process.execPath, [path.join(ROOT, "scripts", "survivorz", script), ...a]];
// THE CORES (Nov 11 2026): the long steps split their work across processes — every zombie of the grabs and
// bites, the body's own moves, the recorded clips through the law — instead of one after another. A share is
// the same page doing the same bakes (checked: a move baked beside others is identical to one baked alone).
// CREATOR_PROCS overrides; a third of the PC's threads by default (8 on the 3090 Ti box's 24).
const PROCS = Math.max(1, Math.min(12, Number(process.env.CREATOR_PROCS) || Math.round(os.cpus().length / 3)));
/** the same command as n processes, each with SHARD=i/n */
const shards = (n, cmd) => Array.from({ length: Math.max(1, n) }, (_, i) => [cmd[0], cmd[1], { SHARD: `${i}/${Math.max(1, n)}` }]);
const BIG = Math.max(1, Math.round(PROCS / 3));

// ---------- the steps, in order ----------
// Each is a list of commands; a command that exits non-zero fails the step. `needs8791` steps
// drive the pages in headless Chrome through the page server.
const STEPS = [
  { id: "intake", label: "Take the model in", run: intake },
  { id: "jobs", label: "List its clips", run: () => [node("manifest.mjs")], env: { ONLY: ID } },
  { id: "retarget", label: "Put every clip on the body", needs8791: true, run: () => [node("retarget-batch.cjs", path.join(STAGE, "jobs", `${ID}.json`))] },
  // THE SHOULDERS COME DOWN (realism round 14): UAL's clips, made on the UE mannequin, hike a scanned body's shoulders
  // 30-37° up round the ears; turned to where the same body's Mixamo clips hold them, the arms kept pointing where they did
  { id: "shoulders", label: "Set the shoulders", run: () => [node("anim-shoulders.mjs", ID)] },
  { id: "pack", label: "Pack the body", run: () => [node("pack.mjs", ID)] },
  // the range this body's own converted mocap covers: what "natural" means for the clean and the built moves
  { id: "baseline", label: "Measure its natural range", needs8791: true, run: () => [node("anim-natural.cjs", ID)] },
  // the moves built in code read their base clips out of the PACKED body, so the clean is packed first
  { id: "clean", label: "Clean the mocap", needs8791: true, run: () => [node("anim-build.cjs", ID, "--clean"), node("pack.mjs", ID)] },
  // the gun moves seat the gun by this measure (anim-build.html h.gunCal), so it comes before them
  { id: "guns", label: "Seat the guns", needs8791: true, run: () => [node("anim-build.cjs", ID, "--gun-cal")] },
  // the five groups read only converted clips and write only their own files: run side by side
  // (the three big groups split again: each runs as BIG shares)
  // (the plain moves are asked for with NO recipe: "*" matched every group too, so one process re-baked all 230
  // moves on its own beside the shares — the step took as long as it ever had, two writers on every file)
  { id: "build", label: "Build the made-in-code moves", needs8791: true, run: () => [{ parallel: [node("anim-build.cjs", ID), ...["gr:", "gs:", "hd:"].flatMap((r) => shards(BIG, node("anim-build.cjs", ID, r))), ...shards(Math.max(1, BIG - 1), node("anim-build.cjs", ID, "gp:"))] }] },
  // STAND UP STRAIGHT (Nov 17 2026): the jog, the runs, the sprint and the armed walks came out of their recordings
  // hunched — the head hanging, the sprint bent 29° over. Their lean is capped against this body's own standing pose
  // (anim-posture.mjs), after the build has made the torch and gun moves from them and before the pack
  { id: "posture", label: "Stand up straight", run: () => [node("anim-posture.mjs", ID)] },
  { id: "repack", label: "Pack again", run: () => [node("pack.mjs", ID)] },
  { id: "law", label: "Check no limb goes through the body", needs8791: true, env: { LAW_PROCS: String(Math.min(PROCS, 6)) }, run: () => [node("anim-clip.cjs", ID), node("anim-law-recorded.cjs", ID), node("pack.mjs", ID)] },
  { id: "ground", label: "Feet on the floor", needs8791: true, run: () => [node("anim-ground.cjs", ID), node("anim-ground-fix.mjs", ID), node("pack.mjs", ID), node("anim-floor-fix.mjs", ID), node("pack.mjs", ID)] },
  // GRABS, BITES AND RESCUES (Josh, Nov 4 2026): every zombie's half baked against this body (the struggle
  // chains' links and the two bites, ZONLY), this body's pull-off on every zombie (VONLY), the body packed
  // with its pull-offs, the zombies' halves packed small (pack-pairclips.mjs), and the lot judged against
  // the law (pair-sweep.cjs → creator/<body>/pairs.json). After the ground fix: the zombies bake against
  // the body as it will play.
  { id: "pairs", label: "Grabs, bites and rescues", needs8791: true,
    env: { ZONLY: "^(zfit:fz-(front-struggle-(start|start-idle|free)|back-struggle-(start|idle|free))|zbite-(forearm|shoulder))$", VONLY: "^pull-off$" },
    // (the fresh pull-offs measured before the sweep reads the measure: the sweep drops a half that goes through
    // its own body, and read from the law step's measure, which ran before they existed, every one passed — Renner's
    // m09 went to the final check and failed the bake there)
    run: () => [{ parallel: shards(PROCS, node("anim-build.cjs", "--zpair", "", ID)) }, { parallel: shards(Math.min(PROCS, 4), node("anim-build.cjs", "--zvictim", ID)) }, node("pack.mjs", ID), node("pack-pairclips.mjs", ID), node("anim-clip.cjs", ID, "zv-pull-off"), node("pair-sweep.cjs", ID)] },
  { id: "verify", label: "Final checks", needs8791: true, run: () => [node("anim-clip.cjs", ID), node("anim-contact.cjs", ID), node("anim-spare.mjs", ID), node("anim-law-show.mjs", "--only", ID)] },
  // HOW FAST ITS LOOPS GO (realism round 10): the speed each walk and run covers the ground at, found off the
  // planted foot (loop-speeds.mjs, headless) — the show plays them at that rate and the feet stay put. Without it
  // the show falls back to an estimate 4-25% off, and a new body's feet skated
  { id: "speeds", label: "Measure its walking and running speeds", run: () => [node("loop-speeds.mjs", ID, "--out", path.join(DIR, "loopspeed.json"))] },
  // WHAT IT CARRIES SITS ON IT (Nov 12 2026 — the review's A8): where a backpack rides this body's back, and where
  // a holstered pistol, a tool through the belt and a slung rifle sit, each moved off the body until nothing passes
  // through it in any loop (kit-fit.mjs, then kit-stow.mjs — headless, no page). Until this step a creator-made
  // body carried nothing on screen until the two were run on it by hand. Last: it reads the body as it will play.
  { id: "kit", label: "Fit its pack and holsters", run: () => [fitter("kit-fit.mjs"), fitter("kit-stow.mjs")] },
];
/** the two fitters hold a whole body's clips in memory: the bigger heap they're run with by hand */
function fitter(script) { return [process.execPath, ["--max-old-space-size=4096", path.join(ROOT, "scripts", "survivorz", script), "--only", ID, "--out", path.join(DIR, "kitfit.json")]]; }

function intake() {
  if (!SRC) throw new Error("--in <model> is needed for the intake step");
  const a = ["-b", "--python", path.join(HERE, "intake.py"), "--", "--in", path.resolve(SRC), "--id", ID, "--report", path.join(DIR, "intake.json")];
  if (arg("--height")) a.push("--height", arg("--height"));
  return [[BLENDER, a], afterIntake];
}

/** After the intake: the body joins the one list every step reads (bodies.cjs). */
function afterIntake() {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, "intake.json"), "utf8"));
  // the hug's roles go by shoulder height, measured the way the seven were (Eric's intake reads
  // 1.504 where the hand-measured table says 1.468: the same yardstick, scaled)
  const shoulder = r.shoulder ? +(r.shoulder * (1.468 / 1.504)).toFixed(3) : null;
  bodies.register(ID, {
    target: r.target, shoulder, height: r.height, family: r.family,
    source: path.basename(SRC), licence: arg("--licence"), credit: arg("--credit"),
    addedAt: new Date().toISOString(),
    // the server it came from (worker.mjs): only that server removing it makes the worker forget it
    server: process.env.CREATOR_SERVER ?? null,
  });
}

// ---------- how long each step takes (the panel's "about N min left") ----------
// Learned from every finished bake on this PC (creator/timings.json, a moving average), starting from
// what the first bakes measured (Nov 3 2026, the 3090 Ti box). The two long steps also report how far
// they are, by counting what they've written.
const TIMINGS = path.join(STAGE, "creator", "timings.json");
const KIT_GUESS = 120e3;   // (measured Nov 12 2026: 37 s for the packs, 75 s for the stow slots)
const GUESS = { intake: 15e3, jobs: 1e3, retarget: 300e3, pack: 5e3, baseline: 100e3, clean: 60e3, guns: 5e3, build: 1500e3, repack: 10e3, law: 560e3, ground: 60e3, pairs: 1500e3, verify: 30e3, speeds: 30e3, kit: KIT_GUESS };
const learned = (() => { try { return JSON.parse(fs.readFileSync(TIMINGS, "utf8")); } catch { return {}; } })();
const expectOf = (id) => Math.round(learned.ms?.[id] ?? GUESS[id] ?? 60e3);
const BUILT = /^(bd|gr|gs|gp|hd)-/;
function stepProgress(id) {
  const dir = path.join(STAGE, "out", ID);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return null; }
  if (id === "retarget") {
    const jobs = (() => { try { return JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${ID}.json`), "utf8")).jobs.filter((j) => !j.built).length; } catch { return 0; } })();
    return jobs ? Math.min(1, files.filter((f) => !BUILT.test(f)).length / jobs) : null;
  }
  if (id === "pairs") {
    // (8 zombie halves on each zombie, then a pull-off on each: counted as they're written)
    const zs = (() => { try { return fs.readdirSync(path.join(STAGE, "game")).filter((f) => /^zombie-.*\.glb$/.test(f)).map((f) => f.slice(0, -4)); } catch { return []; } })();
    if (!zs.length) return null;
    let halves = 0;
    for (const z of zs) { try { halves += fs.readdirSync(path.join(STAGE, "out", z)).filter((f) => f.startsWith("zd-") && f.endsWith(`-${ID}.json`)).length; } catch { /* not yet */ } }
    const pulls = files.filter((f) => f.startsWith("zv-pull-off-")).length;
    return Math.min(0.95, (halves + pulls) / (zs.length * 9));
  }
  if (id === "build") {
    const want = learned.builtCount ?? 227;
    return Math.min(0.99, files.filter((f) => BUILT.test(f)).length / want);
  }
  return null;
}

// ---------- the runner ----------
// (a status file cut short by a kill mid-write reads as a fresh checklist rather than crashing the resume)
const status = (() => { try { const s = JSON.parse(fs.readFileSync(STATUS, "utf8")); return s && typeof s.steps === "object" ? s : null; } catch { return null; } })() ?? { id: ID, steps: {} };
// every step not done yet carries what it's expected to take
for (const s of STEPS) if (status.steps[s.id]?.state !== "done") status.steps[s.id] = { ...(status.steps[s.id]?.state === "failed" ? {} : status.steps[s.id]), state: status.steps[s.id]?.state === "running" ? "pending" : status.steps[s.id]?.state ?? "pending", expectMs: expectOf(s.id) };
for (const s of STEPS) if (status.steps[s.id]?.state === "failed") status.steps[s.id] = { state: "pending", expectMs: expectOf(s.id) };
// (a bake picking up at a step runs it and everything after: those read as waiting, not ticked while they re-run)
{ const f = arg("--from"), o = arg("--only"), at = STEPS.findIndex((s) => s.id === f); if (f && at >= 0) for (const s of STEPS.slice(at)) if (!o || s.id === o) status.steps[s.id] = { state: "pending", expectMs: expectOf(s.id) }; }
// written beside and renamed over, so the worker (reading it every 5 s) and a kill never see half a file
// (Windows refuses the rename while the worker or a scanner has the file open: the next write lands it)
const save = () => { try { fs.writeFileSync(STATUS + ".tmp", JSON.stringify({ ...status, order: STEPS.map((s) => ({ id: s.id, label: s.label })), updatedAt: Date.now() }, null, 1)); fs.renameSync(STATUS + ".tmp", STATUS); } catch (e) { if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e; } };
// ONE BAKE OF A BODY AT A TIME: this bake's pid, so a worker that restarts while an old bake of the same body is
// still running (its worker died without its tree) stops that one first (worker.mjs)
const PIDFILE = path.join(DIR, "bake.pid");
try { fs.writeFileSync(PIDFILE, String(process.pid)); } catch { /* best-effort */ }
process.on("exit", () => { try { if (fs.readFileSync(PIDFILE, "utf8") === String(process.pid)) fs.rmSync(PIDFILE, { force: true }); } catch { /* gone */ } });
const log = (line) => fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`);

// A STUCK STEP IS STOPPED (Nov 11 2026): a headless page that never answers used to hold the bake — and the
// GPU, the LLM paused — until somebody noticed. A command that writes nothing (no output, no file in the
// body's stage) for STALL_MS is killed and the step fails, saying so; the bake resumes from it like any other.
const STALL_MS = Math.max(60e3, Number(process.env.CREATOR_STALL_MIN ?? 20) * 60e3);
// (the bake's own files don't count: the progress meter rewrites status.json every 5 s through the three longest
// steps, so the clock never ran out on exactly the steps that hang)
const WATCHED = ["out", "anim", "creator"].map((d) => path.join(STAGE, d, ID));
const OWN = new Set(["status.json", "status.json.tmp", "bake.log", "bake.pid"]);
function newestWrite() {
  let t = 0;
  for (const d of WATCHED) {
    try { for (const f of fs.readdirSync(d)) { if (OWN.has(f)) continue; try { t = Math.max(t, fs.statSync(path.join(d, f)).mtimeMs); } catch { /* gone */ } } } catch { /* not yet */ }
  }
  return t;
}
/** The whole tree a command started (Chrome, Blender, the node steps under it). */
function killTree(p) {
  if (!p.pid || p.exitCode != null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else p.kill("SIGKILL");
}
const live = new Set();

function exec([cmd, args, own], env, solo = true) {
  return new Promise((resolve) => {
    log(`$ ${own?.SHARD ? `[${own.SHARD}] ` : ""}${path.basename(cmd)} ${args.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(" ")}`);
    let tail = "", stalled = false, done = false;
    let lastOut = Date.now(), lastFile = newestWrite();
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env, ...own, EXCHANGE_PROVIDER: "off" }, windowsHide: true });
    live.add(p);
    const finish = (code) => {
      if (done) return;
      done = true;
      clearInterval(watch);
      live.delete(p);
      resolve({ code, tail: stalled ? `${tail}\nnothing written for ${Math.round(STALL_MS / 60e3)} min: stopped as stuck` : tail, proc: p });
    };
    const take = (d) => {
      const s = d.toString();
      lastOut = Date.now();
      fs.appendFileSync(LOG, s);
      tail = (tail + s).slice(-4000);
      process.stdout.write(s.split("\n").filter(Boolean).map((l) => `  ${l.slice(0, 160)}\n`).join(""));
    };
    const watch = setInterval(() => {
      // (side by side, the others' files would keep a hung one's clock alive: there each goes by its own output —
      // the page bakes print a line a clip)
      const f = solo ? newestWrite() : 0;
      if (f > lastFile) { lastFile = f; lastOut = Math.max(lastOut, Date.now()); }
      if (Date.now() - lastOut > STALL_MS) { stalled = true; log(`stuck: nothing written for ${Math.round(STALL_MS / 60e3)} min, stopping it`); killTree(p); }
    }, 30e3);
    p.stdout.on("data", take);
    p.stderr.on("data", take);
    // (a program that can't start — Blender moved, Chrome missing — fails the step instead of crashing the bake)
    p.on("error", (e) => { tail += `\n${e.message}`; finish(-1); });
    p.on("close", (code) => finish(code ?? -1));
  });
}
// a bake that's killed or dies takes what it started with it (the worker's taskkill /T does too; this covers the rest)
const killAll = () => { for (const p of live) killTree(p); };
process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => { killAll(); process.exit(130); });

const portOpen = (port) =>
  new Promise((res) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => { s.end(); res(true); });
    s.once("error", () => res(false));
  });

let server = null;
async function ensurePageServer() {
  if (await portOpen(8791)) {
    // (the pages are this checkout's code: a page server left running from another checkout would bake with its
    // pages, quietly — the clips would come out of whatever that copy of the code does)
    const r = await fetch("http://127.0.0.1:8791/scripts/survivorz/creator/bake.mjs").catch(() => null);
    const root = r?.headers.get("x-serve-root");
    const same = root ? path.resolve(decodeURIComponent(root)) === path.resolve(ROOT)
      : r?.ok && Buffer.from(await r.arrayBuffer()).equals(fs.readFileSync(fileURLToPath(import.meta.url)));
    if (!same) throw new Error(`port 8791 is serving ${root ? decodeURIComponent(root) : "another copy of the code"}, not ${ROOT}: stop that page server and the bake starts its own`);
    return;
  }
  server = spawn(process.execPath, [path.join(ROOT, "scripts", "serve-root.mjs"), "8791"], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50 && !(await portOpen(8791)); i++) await new Promise((r) => setTimeout(r, 200));
  log("started the page server on 8791");
}

const from = arg("--from"), only = arg("--only");
// (a step a newer checkout renamed would match nothing, run nothing, and hand the worker an old body as done)
for (const s of [from, only]) if (s && !STEPS.some((x) => x.id === s)) { console.error(`no step "${s}" (steps: ${STEPS.map((x) => x.id).join(", ")})`); process.exit(1); }
let started = !from;
let failed = null;
const t0 = Date.now();
for (const step of STEPS) {
  if (from && step.id === from) started = true;
  if (!started || (only && step.id !== only)) continue;
  status.steps[step.id] = { state: "running", startedAt: Date.now(), expectMs: expectOf(step.id) };
  save();
  const meter = setInterval(() => {
    const p = stepProgress(step.id);
    if (p != null && status.steps[step.id]?.state === "running") { status.steps[step.id].progress = +p.toFixed(3); save(); }
  }, 5000);
  console.log(`\n== ${step.label} (${step.id})`);
  log(`== ${step.id}`);
  try {
    if (step.needs8791) await ensurePageServer();
    for (const c of step.run()) {
      if (typeof c === "function") { await c(); continue; }
      const batch = c.parallel ?? [c];
      // (one of a parallel batch failing stops the others: they used to run on for up to twenty minutes first)
      let first = null;
      const rs = await Promise.all(batch.map((x, i) => exec(x, step.env, batch.length === 1).then((r) => {
        if (r.code !== 0 && first == null) { first = i; for (const p of live) killTree(p); }
        return r;
      })));
      if (first != null) {
        const r = rs[first], x = batch[first];
        throw new Error(`${path.basename(x[1][0] ?? x[0])} ${x[1].slice(1).join(" ")}${x[2]?.SHARD ? ` (share ${x[2].SHARD})` : ""} exited ${r.code}\n${r.tail.split("\n").slice(-8).join("\n")}`);
      }
    }
    status.steps[step.id] = { ...status.steps[step.id], state: "done", endedAt: Date.now(), progress: 1 };
  } catch (e) {
    status.steps[step.id] = { ...status.steps[step.id], state: "failed", endedAt: Date.now(), error: String(e.message ?? e).slice(0, 2000) };
    failed = step.id;
  }
  clearInterval(meter);
  save();
  const s = status.steps[step.id];
  console.log(`   ${s.state} in ${((s.endedAt - s.startedAt) / 1000).toFixed(0)}s`);
  if (failed) break;
}
if (server) server.kill();
// a finished bake teaches the next one how long each step takes
if (!failed) {
  const ms = { ...(learned.ms ?? {}) };
  for (const s of STEPS) {
    const st = status.steps[s.id];
    if (st?.state === "done" && st.startedAt && st.endedAt) { const d = st.endedAt - st.startedAt; ms[s.id] = ms[s.id] ? Math.round(ms[s.id] * 0.6 + d * 0.4) : d; }
  }
  let builtCount = learned.builtCount;
  try { builtCount = fs.readdirSync(path.join(STAGE, "out", ID)).filter((f) => BUILT.test(f)).length || builtCount; } catch { /* keep the old count */ }
  try { fs.writeFileSync(TIMINGS, JSON.stringify({ ms, builtCount, at: Date.now() }, null, 1)); } catch { /* best-effort */ }
}
console.log(failed ? `\nstopped at ${failed}: ${status.steps[failed].error}` : `\n${ID} baked in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
process.exit(failed ? 1 : 0);
