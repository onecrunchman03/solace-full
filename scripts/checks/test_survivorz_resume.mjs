// SOLACE SURVIVORZ — SAVE AND RESUME (src/survivorz/sim/save.ts, SimWorld.saveState/loadState,
// broadcast.ts). Josh, Oct 31 2026: "Save and resume the world — a deploy or crash resumes the same
// survivors, zombies and progress within seconds." Four weeks unattended means dozens of deploys.
//
//  1. THE SAME WORLD, STEP FOR STEP (in-process; THE BUNKER: a seed whose show is still going): the world is
//     saved at several moments — a few minutes in, MID-FIGHT, MID-INFECTION with the turn falling inside the
//     window — a FRESH world is built from each save, and the original and the restored world are
//     run side by side: every frame they make must be identical, byte for byte, and so must their whole
//     state at the end. The codec reads back exactly what it wrote, a field nobody taught it about throws
//     rather than being dropped, and every own field of the world is saved or deliberately left out.
//  2. BODIES STAY WHERE THEY FALL (BUNKER.md 42): no corpse is ever retired; the director's log stays trimmed.
//  3. A VOICE LINE HELD FROM AN OLD WORLD never reaches anybody once that world has gone.
//  4. OVER A REAL SERVER (port 8574, a save every sim-second): the snapshot carries the run id; every
//     watch socket gets a keepalive `ka` every 5 s, paused or not; a server killed while PAUSED comes back
//     paused with the SAME run and the very same snapshot; killed while running, it comes back running
//     within a save interval of where it was; a reset is a different run; a stop is remembered.

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const dist = (p) => path.join(ROOT, "dist", p);
const { SimWorld } = require(dist("survivorz/sim/world.js"));
const { INFECTION } = require(dist("survivorz/sim/infection.js"));
const { encodeGraph, decodeGraph } = require(dist("survivorz/sim/save.js"));
const voices = require(dist("survivorz/voices.js"));
const { WebSocket } = require(path.join(ROOT, "node_modules", "ws"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const START = Date.UTC(2026, 10, 2, 22, 0, 0);
const STEP = 100;
const MIN = 60_000 / STEP;
const hash = (s) => createHash("sha1").update(s).digest("hex");

// ---- 1. the same world, step for step ----------------------------------------------------------------
console.log("THE CODEC");
{
  const shared = { k: 1 };
  const m = new Map([["b", 2], ["a", 1]]);
  const g = { nan: NaN, neg0: -0, inf: Infinity, ninf: -Infinity, u: undefined, m, s: new Set([3, 1, 2]), f: new Float32Array([1.5, NaN, -0]), i8: new Int8Array([-1, 2]), x: shared, y: shared, arr: [shared, 1] };
  g.arr.length = 4;   // two holes
  const back = decodeGraph(encodeGraph(g));
  const fine = Number.isNaN(back.nan) && Object.is(back.neg0, -0) && back.inf === Infinity && back.ninf === -Infinity
    && "u" in back && back.u === undefined && [...back.m.keys()].join() === "b,a" && [...back.s].join() === "3,1,2"
    && back.f instanceof Float32Array && Number.isNaN(back.f[1]) && Object.is(back.f[2], -0) && back.i8[0] === -1
    && back.x === back.y && back.arr[0] === back.x && back.arr.length === 4 && !(2 in back.arr);
  ok(fine, "the codec keeps NaN, ±Infinity, -0, an undefined member, Map/Set order, typed arrays, holes and SHARED objects");
  let threw = 0;
  try { encodeGraph({ f: () => 1 }); } catch { threw++; }
  try { encodeGraph({ x: new (class Gizmo {})() }); } catch { threw++; }
  ok(threw === 2, "a function or an unknown class instance in the world THROWS rather than being silently dropped");
}

// THE BUNKER's shows can end inside the windows (a rescue at ~18 minutes): the seed is one still going at 25 minutes
// — and one with a fight still to come after the first seven minutes (the mid-fight save needs one: a seed whose
// survivors clear every zombie early has none left to fight)
const fightingNow = (w) => w.survivors.some((s) => s.alive && (s.mode === "fight" || s.mode === "grabbed" || s.swing.phase > 0)) && w.zombies.some((z) => z.alive && (z.state === "attack" || z.state === "chase"));
const SEED = (() => { for (let seed = 1; seed < 80; seed++) { const w = new SimWorld({ seed, start: START }); let late = false; for (let i = 0; i < 25 * MIN && !w.overAt; i++) { w.tick(STEP); if (!late && i > 7 * MIN && fightingNow(w)) late = true; } if (late && !w.overAt && w.survivors.filter((x) => x.alive).length >= 3) return seed; } return 7; })();
const A = new SimWorld({ seed: SEED, start: START });
const NOT_SAVED = ["nav", "stepMs", "hooks", "listeners", "fac", "rng", "doorOpenIdx"];
{
  const st = A.saveState();
  const missing = Object.keys(A).filter((k) => !NOT_SAVED.includes(k) && !(k in st));
  ok(missing.length === 0 && "rng" in st && "fac" in st && "mod" in st, `every own field of the world is in the save (or deliberately rebuilt)${missing.length ? ": missing " + missing : ""}`);
}

// BODIES STAY: no `gone` frame for one of the dead, ever
let goneFrames = 0;
A.onFrame((f) => { if (f.type === "gone" && f.id.startsWith("z:")) goneFrames++; });

const run = (w, minutes) => { for (let i = 0; i < minutes * MIN; i++) w.tick(STEP); };
const runUntil = (w, pred, maxMinutes) => { for (let i = 0; i < maxMinutes * MIN; i++) { w.tick(STEP); if (pred(w)) return true; } return false; };
const sizes = [];

/** Save A, build a fresh world from it, run both `minutes` side by side: identical frames, identical state. */
function sameWorld(label, minutes, after) {
  const t0 = performance.now();
  const S = encodeGraph(A.saveState());
  const encMs = performance.now() - t0;
  const z = deflateRawSync(Buffer.from(S));
  sizes.push({ label, raw: S.length, z: z.length, encMs, bodies: A.bodies.length });
  ok(encodeGraph(decodeGraph(S)) === S, `${label}: the save reads back to exactly what was written`);
  const t1 = performance.now();
  const B = new SimWorld({ seed: 99, start: 1 });   // a different world, made into this one
  B.loadState(decodeGraph(S));
  sizes[sizes.length - 1].loadMs = performance.now() - t1;
  ok(B.run === A.run && B.t === A.t && B.seed === A.seed && JSON.stringify(B.snapshot()) === JSON.stringify(A.snapshot()),
    `${label}: the restored world is the same run at the same clock, and shows a joining screen the same snapshot`);
  const fa = [], fb = [];
  const offA = A.onFrame((f) => fa.push(hash(JSON.stringify(f))));
  const offB = B.onFrame((f) => fb.push(hash(JSON.stringify(f))));
  let diverged = -1;
  for (let i = 0; i < minutes * MIN && diverged < 0; i++) {
    A.tick(STEP); B.tick(STEP);
    if (fa.length !== fb.length || fa[fa.length - 1] !== fb[fb.length - 1]) diverged = i;
  }
  offA(); offB();
  ok(diverged < 0 && fa.length === fb.length && fa.length > minutes * MIN * 0.5,
    `${label}: ${minutes} sim-minutes side by side — all ${fa.length} frames identical${diverged >= 0 ? ` (diverged at step ${diverged})` : ""}`);
  ok(encodeGraph(A.saveState()) === encodeGraph(B.saveState()), `${label}: …and their whole state identical at the end`);
  after?.(B);
}

console.log("THE SAME WORLD, STEP FOR STEP");
run(A, 3);
sameWorld("three minutes in", 4);

const fighting = (w) => w.survivors.some((s) => s.alive && (s.mode === "fight" || s.mode === "grabbed" || s.swing.phase > 0)) && w.zombies.some((z) => z.alive && (z.state === "attack" || z.state === "chase"));
ok(runUntil(A, fighting, 40), "a fight breaks out");
sameWorld("MID-FIGHT", 4);

// MID-INFECTION: infected, the turn ~4 minutes off — inside the window (THE BUNKER: a bite turns in ~40 minutes)
const victim = A.survivors.find((s) => s.alive && !s.infected && s.mode !== "down");
// nobody holds an antiviral for this, or the turn waits 12 h (they find them now the search works)
for (const s of A.survivors) s.pack.spare = s.pack.spare.filter((x) => x !== "antiviral");
A.group.box.gear = A.group.box.gear.filter((x) => x !== "antiviral");
for (const d of A.group.drops) d.items = d.items.filter((x) => x !== "antiviral");
for (const [k, v] of A.group.loot) if (Array.isArray(v)) A.group.loot.set(k, v.filter((x) => x !== "antiviral"));
ok(!!victim && A.infect(victim.id, INFECTION.turnH - 4 / 60), `${victim?.who ?? "somebody"} is infected, the turn ~4 minutes off`);
run(A, 1);
ok(victim.alive && victim.infected && victim.sick >= 4 && !victim.turned, "…sick and not yet turned when the world is saved");
sameWorld("MID-INFECTION", 6, (B) => {
  const vb = B.survivors.find((s) => s.who === victim.who);
  ok(victim.turned && vb.turned && B.zombies.some((z) => z.turnedFrom === victim.who), `…and they turn inside the window, in BOTH worlds (${victim.who}: turned ${victim.turned}, alive ${victim.alive}, mode ${victim.mode}, cause ${victim.cause}, h ${((A.t - victim.infectedAt) / 3.6e6).toFixed(2)}, spare ${victim.pack.spare})`);
});

console.log("BODIES STAY WHERE THEY FALL");
run(A, 5);
ok(goneFrames === 0 && A.zombies.filter((z) => !z.alive).every((z) => !z.gone), `no corpse is ever retired (${A.zombies.filter((z) => !z.alive).length} dead lie where they fell)`);
ok(A.dir.log.length <= 50, `the director's log stays trimmed (${A.dir.log.length})`);
for (const s of sizes) console.log(`    · ${s.label}: ${s.bodies} bodies, save ${Math.round(s.raw / 1024)} KB raw / ${Math.round(s.z / 1024)} KB deflated, encode ${s.encMs.toFixed(1)} ms, load ${s.loadMs.toFixed(1)} ms`);
ok(sizes.every((s) => s.z < 1_000_000 && s.encMs < 500), "a save is under a megabyte deflated and takes under half a second");

// ---- 3. a voice line from an old world ---------------------------------------------------------------
console.log("A VOICE LINE FROM AN OLD WORLD");
{
  voices.resetVoices();
  voices.agentSeen();
  const sent = [];
  const held = voices.holdForVoice({ type: "say", t: 1, by: "s:rick", text: "Old world." }, (f) => sent.push(f));
  voices.dropHeldVoices();
  const take = voices.voiceTake();
  const late = voices.voiceAudio(1, Buffer.alloc(3200), 16000);
  await sleep(voices.VOICE.takeWaitMs + 300);
  ok(held && take.length === 0 && late === false && sent.length === 0, "a line held for its voice when the world went is never sent — not voiced, not silent");
  voices.resetVoices();
}

// ---- 4. over a real server ---------------------------------------------------------------------------
console.log("OVER A REAL SERVER");
const PORT = 8574;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "survivorz-resume-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const ADMIN_PW = "Harness!Admin9xy";
let log = "";
const boot = async () => {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
    SURVIVORZ_SAVE_SIM_MS: "1000", SURVIVORZ_COUNTDOWN_MS: "0",
  };
  const srv = spawn(process.execPath, [dist("index.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (d) => { log += d; });
  srv.stderr.on("data", (d) => { log += d; });
  let up = false;
  for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
  return { srv, up };
};
/** a CRASH: no shutdown hook gets to run (on Windows a kill is always this; on Linux SIGKILL) */
const crash = async (srv) => {
  const gone = new Promise((r) => srv.once("exit", r));
  srv.kill("SIGKILL");
  await Promise.race([gone, sleep(5000)]);
};
const api = async (method, url, token, body) => {
  const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const lever = (token, op, extra = {}) => api("POST", "/api/admin/survivorz/show", token, { op, ...extra });
const status = (token) => api("GET", "/api/admin/survivorz/show", token).then((r) => r.body);
const watch = (token) => new Promise((resolve) => {
  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-survivorz?token=${encodeURIComponent(token)}`);
  const w = { ws, frames, raw: [] };
  ws.on("message", (d) => { w.raw.push(String(d)); try { frames.push({ at: Date.now(), f: JSON.parse(String(d)) }); } catch {} });
  ws.on("open", () => resolve(w));
  ws.on("error", () => resolve(w));
});
const framesOf = (w, type, since = 0) => w.frames.filter((x) => x.f.type === type && x.at >= since);
const login = async () => (await api("POST", "/api/login", null, { username: "admin", password: ADMIN_PW })).body?.token;

let { srv, up } = await boot();
process.on("exit", () => { try { srv.kill("SIGKILL"); } catch {} });
ok(up, "the server boots");
let admin = await login();
let snapBefore;
let runId;
{
  const w = await watch(admin);
  await sleep(200);
  const s = (await lever(admin, "start", { seed: 5151 })).body;
  runId = s?.run;
  await sleep(400);
  const snap = framesOf(w, "snap")[0]?.f;
  ok(typeof runId === "string" && runId.length > 4 && snap?.run === runId, `the snapshot carries the run id (${runId})`);
  await sleep(2500);
  const st = await status(admin);
  ok(st?.saved && st.saved.bytes > 1000 && st.run === runId, `the running world is saved (${Math.round((st?.saved?.bytes ?? 0) / 1024)} KB, ${st?.saved?.ms} ms)`);
  const t0 = Date.now();
  await sleep(5600);
  const ka = framesOf(w, "ka", t0);
  ok(ka.length >= 1 && ka.every((x) => typeof x.f.t === "number"), `a running show's watch socket gets a keepalive {type:"ka", t} (${ka.length} in 5.6 s)`);
  await lever(admin, "pause");
  await sleep(300);
  const t1 = Date.now();
  await sleep(5600);
  ok(framesOf(w, "ka", t1).length >= 1 && framesOf(w, "tick", t1).length === 0, "…and so does a PAUSED one, which sends nothing else");
  w.ws.close();
  const w2 = await watch(admin);
  await sleep(400);
  snapBefore = w2.raw.find((r) => r.startsWith('{"type":"snap"'));
  w2.ws.close();
}
const pausedT = (await status(admin))?.t;
await crash(srv);
({ srv, up } = await boot());
ok(up, "the server comes back after a crash");
admin = await login();
{
  const st = await status(admin);
  ok(st?.running === true && st.paused === true && st.run === runId, "the show is running again, STILL PAUSED, on the same run");
  ok(st?.t === pausedT, "…at exactly the clock it was paused at");
  const w = await watch(admin);
  await sleep(400);
  const snapAfter = w.raw.find((r) => r.startsWith('{"type":"snap"'));
  ok(!!snapBefore && snapAfter === snapBefore, "…and a watcher's snapshot is the very same — every survivor, zombie, door and goal where it was");
  await lever(admin, "resume");
  const t0 = Date.now();
  await sleep(1500);
  const ticks = framesOf(w, "tick", t0);
  ok(ticks.length >= 5 && ticks.at(-1).f.t > pausedT, "resumed, it carries on from there");
  await sleep(2500);
  w.ws.close();
}
let tBefore = (await status(admin))?.t;
await crash(srv);
({ srv, up } = await boot());
admin = await login();
{
  const st = await status(admin);
  ok(st?.running === true && st.paused === false && st.run === runId && st.t >= tBefore - 1500 && st.t < tBefore + 20000,
    `a crash while running loses at most a save interval (was ${tBefore}, back at ${st?.t})`);
  const w = await watch(admin);
  await sleep(1200);
  ok(framesOf(w, "snap")[0]?.f.run === runId && framesOf(w, "tick").length >= 3, "…and the watcher's run goes on");
  const r = (await lever(admin, "reset", { seed: 6262 })).body;
  await sleep(400);
  const snaps = framesOf(w, "snap");
  ok(r?.run && r.run !== runId && snaps.at(-1)?.f.run === r.run, "a RESET is a different run, and the snapshot says so (screens clear on it)");
  await lever(admin, "stop");
  w.ws.close();
}
await crash(srv);
({ srv, up } = await boot());
admin = await login();
ok((await status(admin))?.running === false, "a stopped show stays stopped after a restart");

await crash(srv);
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\n${n - bad}/${n} passed`);
if (bad) { console.log(log.split("\n").slice(-30).join("\n")); process.exit(1); }
