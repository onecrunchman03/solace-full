// SURVIVORZ REVIEW — a recorded show, measured (docs/survivorz/RUBRIC.md: the "run" lines).
//
//   node scripts/survivorz/review/score-run.mjs <recording.jsonl> [status.json] [--json out.json]
//
// The recording is every frame the server sent a watcher (record.mjs), each with `wall` (ms since the recorder
// connected). This replays them: the bodies' positions for the movement lines, the say/think/decide/goal frames
// for speech and decisions, the events against the cue table for sound, and the show's own director
// (client/src/survivorz/show/director.ts, pure) for the camera.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
// (DIRECTOR_TS=<path> scores another director over the same recording: before and after a change)
const { Director, DIRECTOR } = process.env.DIRECTOR_TS ? await import(pathToFileURL(path.resolve(process.env.DIRECTOR_TS)).href) : await imp("client/src/survivorz/show/director.ts");
const { CUES, partsFor } = await imp("client/src/survivorz/audio/cues.ts");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const [file, statusFile] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
if (!file) throw new Error("usage: score-run.mjs <recording.jsonl> [status.json]");
const frames = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const name = (id) => String(id ?? "").replace(/^s:/, "");

// ── the bodies, replayed ────────────────────────────────────────────────────────────────────────────────────
const bodies = new Map();       // id -> { pos, h, pose, room, job, kind, t }
const deadAt = new Map();       // survivor id -> show clock
const downAt = [];              // { id, t }
const BIG = new Set(["survivor.dead", "survivor.down", "survivor.grabbed", "survivor.bitten"]);
const bigs = [];                // { event, victim, t, wall }
const turn = [], accel = [], speeds = [];      // per-sample, walking survivors
// EVERY step on their feet (the probe's reading, off the wire): walking into a stop or out of one changes the pose,
// and the walking-only reading above never saw a dead stop. Calm: not alert before or after. In a fight: the rest.
const accelCalm = [], accelFight = [], turnAll = [];
const PLACED = new Set(["down", "dead", "sleep", "sit", "grabbed", "revive"]);
let runSamples = 0, moveSamples = 0, calmRun = 0, calmMove = 0;
let closest = { d: Infinity, a: "", b: "", t: 0 };
const still = new Map();        // id -> { since, job, pos }
let worstStill = { s: 0, id: "", job: "" };
const jobLog = new Map();       // id -> [{ t, job }]
const says = [], thinks = [], decides = [], goals = [], evs = [];
let t0 = null, tEnd = 0, snapGoals = null, lastGoals = null;
const LOCO = new Set(["walk", "jog", "sprint", "crouch-walk"]);
const linkOrPair = (b) => b.link || ["grabbed", "revive", "fight", "bandage", "hit", "interact"].includes(String(b.pose ?? ""));
const worstTurn = [], worstAccel = [];
const keepWorst = (list, x) => { list.push(x); list.sort((a, b) => b.v - a.v); if (list.length > 6) list.pop(); };

function put(b, t) {
  const cur = bodies.get(b.id) ?? { id: b.id, kind: b.id.startsWith("s:") ? "survivor" : "zombie" };
  const pos = b.pos ?? b.p, h = b.heading ?? b.h;
  if (pos && cur.pos && cur.t != null && t > cur.t && cur.kind === "survivor" && !deadAt.has(b.id)) {
    const dt = (t - cur.t) / 1000;
    if (dt > 0 && dt < 0.5) {
      const v = Math.hypot(pos[0] - cur.pos[0], pos[2] - cur.pos[2]) / dt;
      // only plain walking and running: a fight, a grab and a flinch turn and stop as fast as they like
      const loco = LOCO.has(cur.pose) && LOCO.has(b.pose ?? cur.pose);
      if (v > 0.25 && loco) {
        moveSamples++; speeds.push(v); if (v > 2.6) runSamples++; if (cur.alert === false && v > 2.6) calmRun++; if (cur.alert === false) calmMove++;
        if (h != null && cur.h != null) { let d = Math.abs(h - cur.h) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; const w = (d * 180 / Math.PI) / dt; turn.push(w); keepWorst(worstTurn, { v: Math.round(w), who: name(b.id), min: r1((t - t0) / 60000), pose: cur.pose, job: cur.job }); }
      }
      if (cur.v != null && loco && cur.loco) { const a = Math.abs(v - cur.v) / dt; accel.push(a); keepWorst(worstAccel, { v: r1(a), who: name(b.id), min: r1((t - t0) / 60000), pose: cur.pose, job: cur.job, from: r2(cur.v), to: r2(v) }); }
      const upNow = !PLACED.has(String(b.pose ?? cur.pose)) && !b.link && !cur.link, upWas = cur.up === true;
      if (upNow && upWas && cur.v != null && v < 12 && (v > 0.25 || cur.v > 0.25)) {
        const a = Math.abs(v - cur.v) / dt;
        (cur.alert === false && (b.alert ?? cur.alert) === false ? accelCalm : accelFight).push(a);
        if (h != null && cur.h != null) { let d = Math.abs(h - cur.h) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; turnAll.push((d * 180 / Math.PI) / dt); }
      }
      cur.up = upNow;
      cur.v = v; cur.loco = loco;
    }
  }
  if (pos) cur.pos = pos;
  if (h != null) cur.h = h;
  for (const k of ["pose", "room", "link", "hp", "alert"]) if (b[k] !== undefined) cur[k] = b[k];
  if (b.vitals?.job !== undefined || b.job !== undefined) {
    const job = b.vitals?.job ?? b.job;
    if (job !== cur.job) { cur.job = job; (jobLog.get(b.id) ?? jobLog.set(b.id, []).get(b.id)).push({ t, job }); }
  }
  if (b.why !== undefined) cur.why = b.why;
  cur.t = t;
  bodies.set(b.id, cur);
}

// ── the camera, replayed ────────────────────────────────────────────────────────────────────────────────────
const dir = new Director();
const shots = [];               // { target, shot, start, end, big, reason }
let onAir = null, nextBeat = 0;
const air = new Map();
// THE RUNNER'S OWN RE-TAKES (show/direct.ts track): a close, a two-shot or a body shot stands on a tripod, and a
// subject who walks out of it is re-framed — a cut the director never decided. Estimated here: the subject 2.5 m
// from where the shot found them, 2.5 s or more since the last cut.
let retakes = 0, tookAt = null, tookT = 0;
const FIXED = new Set(["close", "two", "body"]);
function beat(now) {
  const d = dir.tick(now);
  const b = d.target ? dir.bodies.get(d.target) : null;
  if (!onAir || d.cut !== "none") {
    // (a close or a two-shot handed to the follow under the minimum: its subject walked out of it)
    const left = !!onAir && d.target === onAir.target && (onAir.shot === "close" || onAir.shot === "two") && d.shot === "follow" && now - onAir.start < DIRECTOR.MIN_SHOT_MS - 150;
    if (onAir) { onAir.end = now; onAir.left = left; shots.push(onAir); }
    onAir = { target: d.target, shot: d.shot, start: now, big: d.big, reason: d.reason };
    tookAt = b ? [...b.pos] : null; tookT = now;
  } else if (b && tookAt && FIXED.has(d.shot) && now - tookT >= 2500 && Math.hypot(b.pos[0] - tookAt[0], b.pos[2] - tookAt[2]) > 2.5) { retakes++; tookAt = [...b.pos]; tookT = now; }
  if (d.target) air.set(d.target, (air.get(d.target) ?? 0) + 100);
}

for (const f of frames) {
  const now = f.wall;
  if (f.t != null) { t0 ??= f.t; tEnd = Math.max(tEnd, f.t); }
  if (f.type === "snap") { for (const b of f.bodies) put(b, f.t); snapGoals = f.goals ?? null; lastGoals = f.goals ?? lastGoals; }
  else if (f.type === "spawn") put(f.body, f.t ?? tEnd);
  else if (f.type === "tick") {
    for (const b of f.b) put(b, f.t);
    if (f.goals) lastGoals = f.goals;
    // personal space + who's stuck, once a tick
    const alive = [...bodies.values()].filter((b) => b.kind === "survivor" && !deadAt.has(b.id) && b.pose !== "down" && b.pose !== "dead" && b.pos);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      if (linkOrPair(a) || linkOrPair(b)) continue;
      const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
      if (d < closest.d) closest = { d, a: a.id, b: b.id, t: f.t };
    }
    for (const b of alive) {
      const s = still.get(b.id);
      if (!s || Math.hypot(b.pos[0] - s.pos[0], b.pos[2] - s.pos[2]) > 0.3 || s.job !== b.job) still.set(b.id, { since: f.t, job: b.job, pos: b.pos });
      else if (/explore|clear|escort|regroup|flee|goto|move|follow/.test(String(b.job)) && (f.t - s.since) / 1000 > worstStill.s) worstStill = { s: (f.t - s.since) / 1000, id: b.id, job: b.job };
    }
  } else if (f.type === "ev") {
    evs.push(f);
    if (f.event === "survivor.dead" && typeof f.victim === "string") deadAt.set(f.victim, f.t);
    if (f.event === "survivor.turned" && typeof f.victim === "string" && !deadAt.has(f.victim)) deadAt.set(f.victim, f.t);
    if (BIG.has(f.event)) bigs.push({ event: f.event, victim: f.victim, t: f.t, wall: now, room: bodies.get(f.victim)?.room ?? null });
  } else if (f.type === "say") says.push({ ...f, room: bodies.get(f.by)?.room ?? null });
  else if (f.type === "think") thinks.push(f);
  else if (f.type === "decide") decides.push(f);
  else if (f.type === "goal") goals.push(f);
  if (["snap", "tick", "ev", "spawn", "gone", "say"].includes(f.type)) dir.feed(f, now);
  while (nextBeat <= now) { if (bodies.size) beat(nextBeat); nextBeat += 100; }
}
if (onAir) { onAir.end = nextBeat; shots.push(onAir); }
const minutes = (tEnd - t0) / 60_000;
const cast = [...bodies.values()].filter((b) => b.kind === "survivor").map((b) => b.id);

// ── speech ──────────────────────────────────────────────────────────────────────────────────────────────────
const lineMs = (s) => s.ms ?? 600 + words(s.text) * 330;
let overlaps = 0; const overlapEx = [];
const byRoom = new Map();
for (const s of says) (byRoom.get(s.room) ?? byRoom.set(s.room, []).get(s.room)).push(s);
for (const list of byRoom.values()) for (let i = 1; i < list.length; i++) {
  const a = list[i - 1], b = list[i];
  if (a.room != null && b.t < a.t + lineMs(a) - 400 && a.by !== b.by) { overlaps++; if (overlapEx.length < 4) overlapEx.push(`${name(a.by)}: "${a.text.slice(0, 50)}" / ${name(b.by)} ${r1((b.t - a.t) / 1000)}s later`); }
}
const afterDeath = says.filter((s) => deadAt.has(s.by) && s.t > deadAt.get(s.by) + 1500);
const wl = says.map((s) => words(s.text));
const toSomeone = says.filter((s) => s.to);
const names = new Set(cast.map(name));
const usesName = (s) => [...names].some((n) => n !== name(s.by) && new RegExp(`\\b${n}\\b`, "i").test(s.text));
const norm = (t) => t.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const seen = new Map(); let repeats = 0; const repEx = [];
for (const s of says) { const k = norm(s.text); if (seen.has(k)) { repeats++; if (repEx.length < 5) repEx.push(`${name(s.by)}: "${s.text.slice(0, 70)}"`); } else seen.set(k, s); }
// near-repeats: one speaker opening two lines with the same four words
const openers = new Map(); let sameOpen = 0;
for (const s of says) { const k = s.by + "|" + norm(s.text).split(" ").slice(0, 4).join(" "); if (words(s.text) >= 5) { if (openers.has(k)) sameOpen++; openers.set(k, 1); } }
// near-repeats: a line sharing three-quarters of its words with an earlier one (names left out), from anyone
const bag = (t) => new Set(norm(t).split(" ").filter((w) => w.length > 2 && !names.has(w)));
let alike = 0, alikeOther = 0; const alikeEx = [];
for (let i = 0; i < says.length; i++) {
  const a = bag(says[i].text); if (a.size < 4) continue;
  for (let j = 0; j < i; j++) {
    const b = bag(says[j].text); if (b.size < 4) continue;
    let both = 0; for (const w of a) if (b.has(w)) both++;
    if (both / Math.min(a.size, b.size) >= 0.75) { alike++; if (says[i].by !== says[j].by) { alikeOther++; if (alikeEx.length < 8) alikeEx.push(`${name(says[j].by)}: "${says[j].text.slice(0, 60)}" / ${name(says[i].by)}: "${says[i].text.slice(0, 60)}"`); } break; }
  }
}
// a name said (or put in a goal or a reason) before the two have met
const met = new Set(); const metAt = (a, b) => met.has(a + "|" + b) || met.has(b + "|" + a);
const early = []; let ei = 0;
const texts = [...says.map((x) => ({ t: x.t, by: x.by, text: x.text, k: "said" })), ...goals.map((x) => ({ t: x.t, by: x.by, text: x.text ?? "", k: "goal" })), ...decides.map((x) => ({ t: x.t, by: x.by, text: x.reason ?? "", k: "reason" }))].sort((a, b) => a.t - b.t);
const meets = evs.filter((e) => e.event === "survivor.meet").sort((a, b) => a.t - b.t);
for (const x of texts) {
  while (ei < meets.length && meets[ei].t <= x.t) { met.add(meets[ei].by + "|" + meets[ei].victim); ei++; }
  for (const n of names) if (n !== name(x.by) && new RegExp(`\\b${n}\\b`, "i").test(x.text) && !metAt(x.by, "s:" + n)) { early.push(`${r1((x.t - t0) / 60000)}m ${name(x.by)} (${x.k}) names ${n}: "${x.text.slice(0, 70)}"`); break; }
}
let reacted = 0; const noReact = [];
for (const b of bigs) {
  const hit = says.find((s) => s.by !== b.victim && s.t >= b.t && s.t <= b.t + 8000) || says.find((s) => s.by === b.victim && b.event !== "survivor.dead" && s.t >= b.t && s.t <= b.t + 8000);
  if (hit) reacted++; else noReact.push(`${b.event.replace("survivor.", "")} ${name(b.victim)} @${r1((b.t - t0) / 60000)}m`);
}
const perSpeaker = {}; for (const s of says) perSpeaker[name(s.by)] = (perSpeaker[name(s.by)] ?? 0) + 1;
const aliveMin = (id) => ((deadAt.get(id) ?? tEnd) - t0) / 60_000;
const rate = cast.map((id) => (perSpeaker[name(id)] ?? 0) / Math.max(0.5, aliveMin(id)));

// ── decisions ───────────────────────────────────────────────────────────────────────────────────────────────
const withReason = decides.filter((d) => d.reason && words(d.reason) >= 3);
// A→B→A inside a minute. A fight's own back-and-forth (fight, flee, backoff) and the idle between two jobs aren't dithering.
const COMBAT = new Set(["fight", "flee", "backoff", "struggle", "idle", "down", "grabbed"]);
let flips = 0, combatFlips = 0; const flipEx = [];
for (const [id, log] of jobLog) for (let i = 2; i < log.length; i++) {
  if (log[i].job === log[i - 2].job && log[i].job !== log[i - 1].job && log[i].t - log[i - 2].t < 60_000) { if (COMBAT.has(log[i].job) || COMBAT.has(log[i - 1].job)) { combatFlips++; continue; } flips++; if (flipEx.length < 8) flipEx.push(`${name(id)} ${log[i - 2].job}→${log[i - 1].job}→${log[i].job} in ${r1((log[i].t - log[i - 2].t) / 1000)}s`); }
}
// how often a survivor's plan changes, and reasons that are the same sentence again
const perWho = {}; for (const d of decides) (perWho[name(d.by)] ??= []).push(d);
const dwell = []; for (const l of Object.values(perWho)) for (let i = 1; i < l.length; i++) dwell.push((l[i].t - l[i - 1].t) / 1000);
let sameReason = 0; const reasonEx = [];
for (const l of Object.values(perWho)) { const seenR = []; for (const d of l) { const a = bag(d.reason ?? ""); if (a.size < 4) continue; if (seenR.some((b) => { let both = 0; for (const w of a) if (b.has(w)) both++; return both / Math.min(a.size, b.size) >= 0.75; })) { sameReason++; if (reasonEx.length < 6) reasonEx.push(`${name(d.by)} | ${d.did} | ${(d.reason ?? "").slice(0, 80)}`); } seenR.push(a); } }
const stranger = decides.filter((d) => /the stranger/.test(d.did)).length;
const gives = evs.filter((e) => e.event === "survivor.give");
const givePairs = {}; for (const g of gives) { const k = name(g.by) + "→" + name(g.victim ?? g.to ?? "?"); givePairs[k] = (givePairs[k] ?? 0) + 1; }
const goalBy = {}; for (const g of goals) if (g.text) goalBy[name(g.by)] ??= { text: g.text, min: r1((g.t - t0) / 60000) };
const status = statusFile && fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, "utf8")) : [];
const minds = status.at(-1)?.s?.minds ?? null;

// ── sound ───────────────────────────────────────────────────────────────────────────────────────────────────
const evCount = {}; for (const e of evs) evCount[e.event] = (evCount[e.event] ?? 0) + 1;
const noCue = Object.entries(evCount).filter(([e]) => !CUES[e]).sort((a, b) => b[1] - a[1]);
const paPlayed = evs.filter((x) => partsFor(x.event, { ...x, who: name(x.victim ?? x.by) }).some((p) => p.pa)).length;
const emptyCue = Object.entries(evCount).filter(([e]) => CUES[e] && !evs.filter((x) => x.event === e).some((x) => partsFor(e, { ...x, who: name(x.victim ?? x.by) }).length));

// ── the camera ──────────────────────────────────────────────────────────────────────────────────────────────
const ord = shots.filter((s) => s.target && !s.big && s.end - s.start > 0);
const lens = ord.map((s) => (s.end - s.start) / 1000);
const short = ord.filter((s, i) => (s.end - s.start) < DIRECTOR.MIN_SHOT_MS - 150 && !shots[shots.indexOf(s) + 1]?.big);
// (of those: the subject walked out of a fixed shot — one hand-over to the follow, not a choice to cut)
const leftFrame = short.filter((s) => s.left).length;
const bigLag = [];
for (const b of bigs.filter((x) => x.event !== "survivor.bitten")) {
  const s = shots.find((x) => x.target === b.victim && x.end > b.wall && x.start <= b.wall + 30_000);
  if (s) bigLag.push(Math.max(0, s.start - b.wall) / 1000); else bigLag.push(Infinity);
}
const airTotal = [...air.values()].reduce((a, b) => a + b, 0) || 1;
const airShare = Object.fromEntries([...air].map(([id, ms]) => [name(id), Math.round(100 * ms / airTotal)]).sort((a, b) => b[1] - a[1]));
const deathHold = bigs.filter((b) => b.event === "survivor.dead").map((b) => {
  // from the death (or the cut to the body, if that came after it) to the camera leaving them
  const i = shots.findIndex((x) => x.target === b.victim && x.end > b.wall && x.start <= b.wall + 5_000);
  if (i < 0) return null;
  let j = i; while (shots[j + 1]?.target === b.victim) j++;
  return r1((shots[j].end - Math.max(b.wall, shots[i].start)) / 1000);
});

const out = {
  minutes: r1(minutes), frames: frames.length, cast: cast.map(name), dead: [...deadAt.keys()].map(name),
  goals: lastGoals ? { sealedMin: lastGoals.door?.sealed ? r1((lastGoals.door.sealed - t0) / 60000) : null, crank: lastGoals.door?.crank, inside: lastGoals.inside, clear: !!lastGoals.clear, radio: lastGoals.radio, ending: lastGoals.ending ?? null } : null,
  movement: {
    turnP50: Math.round(pct(turn, 0.5)), turnP99: Math.round(pct(turn, 0.99)), turnMax: Math.round(pct(turn, 1)),
    accelP99: r1(pct(accel, 0.99)), accelCalmP99: r1(pct(accelCalm, 0.99)), accelFightP99: r1(pct(accelFight, 0.99)), turnAllP99: Math.round(pct(turnAll, 0.99)), turnAllMax: Math.round(Math.max(0, ...turnAll.slice(-50_000))), speedP10: r2(pct(speeds, 0.1)), speedP50: r2(pct(speeds, 0.5)), speedP90: r2(pct(speeds, 0.9)),
    runShare: Math.round(100 * runSamples / Math.max(1, moveSamples)), calmRunShare: Math.round(100 * calmRun / Math.max(1, calmMove)),
    worstTurn, worstAccel,
    closest: { m: r2(closest.d), who: `${name(closest.a)} / ${name(closest.b)}`, min: r1((closest.t - t0) / 60000) },
    worstStill: { s: Math.round(worstStill.s), who: name(worstStill.id), job: worstStill.job },
  },
  speech: {
    lines: says.length, perMinute: r2(says.length / minutes), perSpeaker, ratePerSurvivorMin: rate.map(r2),
    wordsP50: pct(wl, 0.5), wordsP95: pct(wl, 0.95), wordsMax: pct(wl, 1),
    overlaps, overlapEx, afterDeath: afterDeath.map((s) => `${name(s.by)}: "${s.text.slice(0, 60)}"`),
    named: toSomeone.length ? Math.round(100 * toSomeone.filter(usesName).length / toSomeone.length) : null, namedAll: Math.round(100 * says.filter(usesName).length / Math.max(1, says.length)),
    repeats, repEx, sameOpen, alike, alikeOther, alikeEx, namedBeforeMet: early.length, namedBeforeMetEx: early.slice(0, 8), bigs: bigs.length, reacted, noReact: noReact.slice(0, 8), voiced: says.filter((s) => s.audio).length,
  },
  decisions: {
    decides: decides.length, withReason: withReason.length, social: decides.filter((d) => d.kind === "social").length,
    perSurvivorMin: r2(decides.length / Math.max(1, cast.length) / minutes), dwellP50: Math.round(pct(dwell, 0.5)), dwellP10: Math.round(pct(dwell, 0.1)), sameReason, reasonEx, stranger, gives: gives.length, givePairs,
    goals: goalBy, thinks: thinks.length, thinksPerSurvivorMin: r2(thinks.length / Math.max(1, cast.length) / minutes), flips, combatFlips, flipEx, jobChanges: [...jobLog.values()].reduce((a, l) => a + l.length, 0),
    minds: minds && { share: minds.share, thinksAi: minds.thinksAi, thinksCode: minds.thinksCode, said: minds.said, dropped: minds.dropped, modelUp: minds.modelUp },
  },
  sound: { events: evs.length, kinds: Object.keys(evCount).length, paPlayed, noCue, emptyCue: emptyCue.map(([e, n]) => [e, n]) },
  camera: {
    shots: shots.length, ordinary: ord.length, lenP10: r1(pct(lens, 0.1)), lenP50: r1(pct(lens, 0.5)), lenP90: r1(pct(lens, 0.9)),
    under8: short.length, under8Share: Math.round(100 * short.length / Math.max(1, ord.length)), leftFrame,
    under8Chosen: short.length - leftFrame, under8ChosenShare: Math.round(100 * (short.length - leftFrame) / Math.max(1, ord.length)),
    retakesEst: retakes, cutsAllPerMin: r1((shots.length + retakes) / minutes),
    bigLagMax: bigLag.length ? r1(Math.max(...bigLag.filter(Number.isFinite), 0)) : null, bigMissed: bigLag.filter((x) => !Number.isFinite(x)).length, bigs: bigLag.length,
    airShare, deathHold, cutsPerMin: r1(shots.length / minutes),
  },
};
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
