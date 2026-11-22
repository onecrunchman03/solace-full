// SOLACE SURVIVORZ — THE DIRECTOR CAMERA + THE BROADCAST GRAPHICS, pure, on a fake clock.
//
// Drives client/src/survivorz/show/director.ts with synthetic frames (the wire's own shapes,
// src/survivorz/sim/wire.ts), the shot finder (show/shots.ts) over the REAL walk + sight grids and
// SITE_9's rooms, and the overlay's rows (show/overlay.ts). Pins:
//  1. A FIGHT steals the camera from a quiet body (once the quiet shot has been read).
//  2. A GRAB, someone going DOWN and a DEATH are shown — a grab takes the camera at once, down and
//     dead get the body shot, and a death is HELD while another fight goes on.
//  3. PACING: over a busy 10-minute run no subject is on screen under MIN_SHOT_MS except when a
//     bigger moment took it, and every cut to a new subject is a dip (same subject: a hard cut).
//  4. AIRTIME: one survivor fighting the whole 10 minutes never has more than 65% of the screen
//     when the others have anything going on, and everybody gets seen.
//  5. NEVER INTO A VOID: a cut to a body whose zone isn't drawn asks for it (`prepare`) and waits —
//     the picture doesn't move until the zone is ready, then it cuts.
//  6. A camera spot is never on a blocked walk cell (walls AND furniture), in every room — and
//     never in another body, nor with one standing between the lens and the subject.
//  7. THE OVERLAY never shows a hidden bite (`bitten`) or the brain's `why`; the in-memoriam card
//     and the lower third name the right survivor.
//  8. AN ESCAPED SURVIVOR is never the subject (their actor is gone: a cut to them froze the picture
//     under a lower third naming somebody who wasn't there).
//  9. A NEW RUN (a snapshot naming a different `run`) clears the old run's deaths, heat and shot: a
//     survivor dead last run who dies again gets their card; a reconnect's snapshot of the SAME run
//     clears nothing.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Director, DIRECTOR } from "../../client/src/survivorz/show/director.ts";
import { Geo, roomsFrom } from "../../client/src/survivorz/show/geo.ts";
import { wideShot, closeShot, twoShot, bodyShot, BODY_CLEAR_M, LINE_CLEAR_M } from "../../client/src/survivorz/show/shots.ts";
import { castRows, nameCard, memoriam, decisionShown } from "../../client/src/survivorz/show/overlay.ts";
import { BUNKER } from "../../src/survivorz/bunker-map.ts";
// THE BUNKER (docs/survivorz/BUNKER.md): one floor, the map the sim and the show both run on
const SITE_9 = { rooms: BUNKER.rooms.map((r) => ({ ...r, floor: 0 })) };
import { FLOOR_Y } from "../../src/survivorz/facility.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error(`  ✗ ${n}. ${name}`); } else console.log(`  ✓ ${n}. ${name}`); };

const WHO = ["rick", "johanna", "dale", "ben", "sarah", "rollo"];
// six survivors, each in a room of their own (world metres; floor 0)
const HOME = { rick: [10, 0, 10], johanna: [40, 0, 10], dale: [70, 0, 10], ben: [10, 0, 40], sarah: [40, 0, 40], rollo: [70, 0, 40] };
const body = (who, extra = {}) => ({ id: `s:${who}`, kind: "survivor", who, body: who, pos: HOME[who], heading: 0, pose: "idle", room: `room-${who}`, hp: 100, hpMax: 100,
  vitals: { stamina: 1, hunger: 0, thirst: 0, tired: 0, morale: 60, infected: false, bleeding: 0, job: "explore" }, ...extra });
const zombie = (id, at) => ({ id, kind: "zombie", zkind: "shambler", body: "zombie-m05", pos: at, heading: 0, pose: "z-chase", room: null, hp: 60, hpMax: 60 });
const snap = (t, extra = []) => ({ type: "snap", t, day: 3, bodies: [...WHO.map((w) => body(w)), ...extra], doors: [], power: {}, director: { phase: "build", tension: {} } });
let seed = 1;
const ev = (event, t, f) => ({ type: "ev", event, t, seed: seed++, ...f });
const near = (who, dx = 1) => [HOME[who][0] + dx, HOME[who][1], HOME[who][2]];

/** run a director on a fake clock: `script(t)` returns frames for that beat; `ready` gates zones */
function run(ms, script, { ready, start = 1_000_000, step = 250, d = new Director() } = {}) {
  const log = [];
  let t = start;
  d.feed(snap(t, script.zombies ?? []), t);
  for (; t < start + ms; t += step) {
    for (const f of script(t - start, d) ?? []) d.feed(f, t);
    const dec = d.tick(t, ready ? (at, room) => ready(at, room, t - start) : undefined);
    log.push({ t: t - start, ...dec });
  }
  return { d, log };
}
const targetAt = (log, ms) => [...log].reverse().find((x) => x.t <= ms)?.target;

// ---------------------------------------------------------------------------------------------------
console.log("A FIGHT STEALS THE CAMERA");
{
  const F0 = 30_000;
  const s = (t) => (t >= F0 && t % 1500 === 0 ? [ev("melee.hit", t, { by: "s:ben", victim: "z:1", weapon: "pipe", part: "torso", at: near("ben") })] : []);
  s.zombies = [zombie("z:1", near("ben"))];
  const { log } = run(60_000, s);
  const quiet = targetAt(log, F0 - 1_000);
  ok(quiet && quiet !== "s:ben", `before the fight the camera is on a quiet survivor (${quiet})`);
  const firstBen = log.find((x) => x.target === "s:ben" && x.t >= F0);
  ok(!!firstBen && firstBen.t - F0 <= DIRECTOR.MIN_SHOT_MS + 1_000, `Ben's fight takes the camera ${firstBen ? firstBen.t - F0 : "never"} ms after it starts`);
  ok(firstBen?.cut === "dip", "and the change of subject is a dip through black");
  const later = log.filter((x) => firstBen && x.t > firstBen.t && x.t <= firstBen.t + DIRECTOR.WIDE_MS + 2_000 && x.target === "s:ben");
  ok(later.some((x) => x.shot === "two" && x.other === "z:1"), "the fight goes to a TWO-SHOT with the zombie in the frame");
}

console.log("A GRAB, A FALL, A DEATH");
{
  const s = (t) => {
    const out = [];
    if (t >= 5_000 && t < 60_000 && t % 1500 === 0) out.push(ev("melee.hit", t, { by: "s:ben", victim: "z:1", at: near("ben") }));
    if (t === 10_000) out.push(ev("survivor.grabbed", t, { victim: "s:sarah", by: "z:2", at: near("sarah") }), { type: "tick", t, b: [{ id: "s:sarah", p: HOME.sarah, h: 0, pose: "grabbed" }] });
    if (t === 30_000) out.push(ev("survivor.down", t, { victim: "s:dale", at: HOME.dale }), { type: "tick", t, b: [{ id: "s:dale", p: HOME.dale, h: 0, pose: "down" }] });
    if (t === 50_000) out.push(ev("survivor.dead", t, { victim: "s:dale", at: HOME.dale, cause: "eaten" }), { type: "tick", t, b: [{ id: "s:dale", p: HOME.dale, h: 0, pose: "dead", hp: 0 }] });
    return out;
  };
  s.zombies = [zombie("z:1", near("ben")), zombie("z:2", near("sarah", 0.8))];
  const { d, log } = run(75_000, s);
  const g = log.find((x) => x.t >= 10_000 && x.target === "s:sarah");
  ok(!!g && g.t - 10_000 <= 250, `the GRAB takes the camera at once (${g ? g.t - 10_000 : "never"} ms)`);
  ok(g?.big === true, "and is marked a big moment (the only thing allowed under the minimum shot)");
  ok(g?.shot === "two" && g.other === "z:2", "a grab frames the zombie and its victim together");
  const dn = log.find((x) => x.t >= 30_000 && x.target === "s:dale");
  ok(!!dn && dn.t - 30_000 <= 250 && dn.shot === "body", `someone going DOWN is shown at once, on the body shot (${dn?.shot})`);
  const dd = log.filter((x) => x.t >= 50_000 && x.t < 50_000 + DIRECTOR.DEATH_HOLD_MS);
  ok(dd.length > 0 && dd.every((x) => x.target === "s:dale" && x.shot === "body"), "a DEATH holds on the body for the death hold, the fight next door notwithstanding");
  ok(d.deaths.length === 1 && d.deaths[0].who === "dale" && d.deaths[0].day === 3, "the death is recorded for the in-memoriam card, with its day");
  const m = memoriam(d.deaths[0]);
  ok(m.name === "Dale Hutchins" && m.day === 3 && m.cause === "taken by the dead", `the card reads "${m.name} · day ${m.day} · ${m.cause}"`);
  ok(log.filter((x) => x.t > 50_000 + DIRECTOR.DEATH_HOLD_MS * 1.6).every((x) => x.target !== "s:dale"), "and after it the dead leave the show's subjects");
}

console.log("PACING: minimum shot, hold, cuts");
// a busy ten minutes: Ben fights the whole time; everyone else has something now and then; a grab
// and a fall land in the middle
function busy(t) {
  const out = [];
  if (t % 2000 === 0) out.push(ev("melee.hit", t, { by: "s:ben", victim: "z:1", at: near("ben") }));
  const other = ["rick", "johanna", "dale", "sarah", "rollo"];
  for (let i = 0; i < other.length; i++) {
    const w = other[i];
    if ((t + i * 9_000) % 45_000 === 0) out.push(ev("room.explored", t, { by: `s:${w}`, room: `r-${t}` }));
    if ((t + i * 13_000) % 70_000 === 0) out.push(ev("item.found", t, { by: `s:${w}`, items: ["food"] }));
  }
  if (t === 200_000) out.push(ev("survivor.grabbed", t, { victim: "s:rollo", by: "z:2", at: near("rollo") }));
  if (t === 380_000) out.push(ev("survivor.down", t, { victim: "s:johanna" }), { type: "tick", t, b: [{ id: "s:johanna", p: HOME.johanna, h: 0, pose: "down" }] });
  if (t === 400_000) out.push(ev("survivor.revived", t, { victim: "s:johanna", by: "s:rick" }), { type: "tick", t, b: [{ id: "s:johanna", p: HOME.johanna, h: 0, pose: "idle" }] });
  return out;
}
busy.zombies = [zombie("z:1", near("ben")), zombie("z:2", near("rollo", 0.8))];
const B = run(600_000, busy);
{
  const segs = [];
  let cur = null;
  for (const x of B.log) {
    if (!cur || x.target !== cur.target) { if (cur) segs.push({ ...cur, end: x.t, nextBig: x.big }); cur = { target: x.target, start: x.t }; }
  }
  const short = segs.filter((s) => s.end - s.start < DIRECTOR.MIN_SHOT_MS && !s.nextBig);
  ok(segs.length >= 8, `the camera moves round the facility (${segs.length} subjects in 10 minutes)`);
  ok(short.length === 0, `no subject is on screen under ${DIRECTOR.MIN_SHOT_MS} ms unless a bigger moment took it (${short.length} short)`);
  const subjectCuts = B.log.filter((x, i) => i > 0 && x.target !== B.log[i - 1].target);
  ok(subjectCuts.every((x) => x.cut === "dip"), "every change of subject is a dip");
  const shotCuts = B.log.filter((x, i) => i > 0 && x.target === B.log[i - 1].target && x.shot !== B.log[i - 1].shot);
  ok(shotCuts.length > 0 && shotCuts.every((x) => x.cut === "hard"), `a new shot on the same subject is a hard cut (${shotCuts.length})`);
  ok(segs.every((s) => s.end - s.start <= DIRECTOR.MAX_SUBJECT_MS + 1_000 || s.target === null), "nobody holds the camera past the longest subject hold");
  // the grammar: a new subject opens wide (a big moment excepted)
  const opens = subjectCuts.filter((x) => !x.big);
  ok(opens.length > 0 && opens.every((x) => x.shot === "wide" || x.shot === "body"), "a new subject opens on the WIDE (a big moment goes straight to its shot)");
  ok(B.log.some((x) => x.shot === "follow") && B.log.some((x) => x.shot === "close" || x.shot === "two"), "and the grammar uses follow and close/two shots too");
}

console.log("AIRTIME");
{
  const time = {};
  for (let i = 1; i < B.log.length; i++) { const x = B.log[i - 1]; if (x.target) time[x.target] = (time[x.target] ?? 0) + (B.log[i].t - x.t); }
  const total = Object.values(time).reduce((a, b) => a + b, 0);
  const benShare = (time["s:ben"] ?? 0) / total;
  ok(benShare <= 0.65, `Ben fights for 10 minutes and has ${Math.round(benShare * 100)}% of the screen (≤ 65%)`);
  ok(benShare >= 0.15, `…but the fight is still on screen a good deal (${Math.round(benShare * 100)}%)`);
  const seenAll = WHO.every((w) => (time[`s:${w}`] ?? 0) > 0);
  ok(seenAll, `every survivor is on camera at some point (${WHO.map((w) => `${w} ${Math.round(((time[`s:${w}`] ?? 0) / total) * 100)}%`).join(", ")})`);
}

console.log("NEVER CUT INTO A VOID");
{
  // Sarah's zone (x 40, z 40 — say, everything at x >= 35 && z >= 35) isn't drawn until 20 s in
  const READY_AT = 20_000;
  const isFar = (at) => at[0] >= 35 && at[2] >= 35;
  const s = (t) => (t === 12_000 ? [ev("survivor.grabbed", t, { victim: "s:sarah", by: "z:2", at: near("sarah") }), { type: "tick", t, b: [{ id: "s:sarah", p: HOME.sarah, h: 0, pose: "grabbed" }] }] : []);
  s.zombies = [zombie("z:2", near("sarah", 0.8))];
  const prepared = [];
  const { log } = run(30_000, s, { ready: (at, room, t) => { const r = !isFar(at) || t >= READY_AT; if (!r) prepared.push(t); return r; } });
  const before = log.filter((x) => x.t >= 12_000 && x.t < READY_AT);
  ok(before.some((x) => x.prepare.some((p) => p.at[0] === HOME.sarah[0] && p.at[2] === HOME.sarah[2])), "the director asks for Sarah's zone to be prepared");
  ok(before.length > 0 && before.every((x) => x.target !== "s:sarah"), "…and does not cut to her while it isn't drawn (the picture holds)");
  ok(before.some((x) => x.pending === "s:sarah"), "the cut waits as PENDING");
  const after = log.find((x) => x.t >= READY_AT && x.target === "s:sarah");
  ok(!!after && after.t - READY_AT <= 250, `once the zone is ready it cuts at once (${after ? after.t - READY_AT : "never"} ms)`);
  const firstAsk = log.find((x) => x.prepare.length);
  ok(!!firstAsk && firstAsk.t <= 12_250, "and the prepare was asked for on the beat the grab landed");
}

console.log("CAMERA SPOTS: on walkable floor, in the room, seeing the subject");
{
  const walk = JSON.parse(readFileSync(path.join(ROOT, "src/survivorz/sim/walk.json"), "utf8"));
  const sight = JSON.parse(readFileSync(path.join(ROOT, "src/survivorz/sim/sight.json"), "utf8"));
  const rooms = roomsFrom(SITE_9.rooms, FLOOR_Y);
  const geo = new Geo(walk, sight, rooms);
  let tried = 0, found = { wide: 0, close: 0, two: 0, body: 0 }, badSpot = [], outside = [], blind = [];
  let rnd = 12345;
  const r01 = () => ((rnd = (rnd * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const room of rooms) {
    if (room.spans > 1) continue;
    const fy = FLOOR_Y[room.floor];
    for (let k = 0; k < 6; k++) {
      // a walkable spot in the room for the subject (a body only stands where it can)
      let p = null;
      for (let a = 0; a < 40 && !p; a++) {
        const x = room.x0 + 0.6 + r01() * (room.x1 - room.x0 - 1.2), z = room.z0 + 0.6 + r01() * (room.z1 - room.z0 - 1.2);
        if (geo.walkable(x, fy, z)) p = [x, fy, z];
      }
      if (!p) continue;
      tried++;
      const h = r01() * Math.PI * 2;
      const q = [p[0] + Math.sin(h) * 1.2, fy, p[2] + Math.cos(h) * 1.2];
      const shots = { wide: wideShot(geo, room, p, h), close: closeShot(geo, room, p, h), two: geo.walkable(...q) ? twoShot(geo, room, p, q) : null, body: bodyShot(geo, room, p, h) };
      for (const [kind, s] of Object.entries(shots)) {
        if (!s) continue;
        found[kind]++;
        if (!geo.walkable(s.from[0], s.from[1], s.from[2]) || !geo.clear(s.from[0], s.from[1], s.from[2])) badSpot.push(`${kind} in ${room.id}`);
        if (s.from[0] < room.x0 || s.from[0] > room.x1 || s.from[2] < room.z0 || s.from[2] > room.z1) outside.push(`${kind} in ${room.id}`);
        if (!geo.sees(s.from, s.at)) blind.push(`${kind} in ${room.id}`);
        if (geo.floorIdx(s.from[1]) !== room.floor || s.from[1] < fy + 0.3 || s.from[1] > fy + 3) badSpot.push(`${kind} at the wrong height in ${room.id}`);
      }
    }
  }
  ok(tried >= rooms.length * 5, `${tried} subjects placed across ${rooms.length} rooms`);
  ok(badSpot.length === 0, `no camera spot on a blocked walk cell or at the wrong height (${badSpot.slice(0, 4).join(", ") || "none"})`);
  ok(outside.length === 0, `every camera stands inside its subject's room (${outside.slice(0, 4).join(", ") || "none"})`);
  ok(blind.length === 0, `every camera sees its subject across no wall (${blind.slice(0, 4).join(", ") || "none"})`);
  ok(found.wide / tried >= 0.8 && found.close / tried >= 0.8 && found.body / tried >= 0.8, `a spot is found for most shots (wide ${found.wide}, close ${found.close}, two ${found.two}, body ${found.body} of ${tried})`);
  // BYSTANDERS: put two other bodies round each subject; no spot stands in one or films through one
  let crowd = 0, crowdBad = [];
  const segDist = (f, at, o) => { const dx = at[0] - f[0], dz = at[2] - f[2], l2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((o[0] - f[0]) * dx + (o[2] - f[2]) * dz) / l2)); return { t, d: Math.hypot(f[0] + dx * t - o[0], f[2] + dz * t - o[2]) }; };
  for (const room of rooms.filter((r) => r.spans === 1 && (r.x1 - r.x0) * (r.z1 - r.z0) > 60).slice(0, 30)) {
    const fy = FLOOR_Y[room.floor];
    const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
    if (!geo.walkable(cx, fy, cz)) continue;
    const p = [cx, fy, cz], h = 0;
    const others = [[cx + Math.sin(0.6) * 1.4, fy, cz + Math.cos(0.6) * 1.4], [cx - 1.6, fy, cz]];
    for (const [kind, s] of Object.entries({ wide: wideShot(geo, room, p, h, others), close: closeShot(geo, room, p, h, others), body: bodyShot(geo, room, p, h, others) })) {
      if (!s) continue;
      crowd++;
      for (const o of others) {
        if (Math.hypot(o[0] - s.from[0], o[2] - s.from[2]) < BODY_CLEAR_M) crowdBad.push(`${kind} in a body (${room.id})`);
        const q = segDist(s.from, s.at, o);
        if (q.t > 0 && q.t < 0.85 && q.d < LINE_CLEAR_M) crowdBad.push(`${kind} through a body (${room.id})`);
      }
    }
  }
  ok(crowd > 30 && crowdBad.length === 0, `${crowd} shots round a crowd: none stands in a bystander or films through one (${crowdBad.slice(0, 3).join(", ") || "none"})`);
  // a spot is never inside a wall: the four corners of the facility's own outer box are refused
  ok(!geo.clear(-5, 0, -5) && !geo.walkable(-5, 0, -5), "a point outside every room is never a camera spot");
}

console.log("THE OVERLAY");
{
  const d = new Director();
  d.feed(snap(1000), 1000);
  d.feed({ type: "tick", t: 1100, b: [
    { id: "s:ben", p: HOME.ben, h: 0, vitals: { stamina: 1, hunger: 0, thirst: 0, tired: 0, morale: 40, infected: false, bitten: true, bleeding: 1, job: "loot" }, why: "secret-plan", hp: 40 },
    { id: "s:rick", p: HOME.rick, h: 0, vitals: { stamina: 1, hunger: 0, thirst: 0, tired: 0, morale: 40, infected: true, bleeding: 0, job: "guard" } },
  ] }, 1100);
  const rows = castRows(d.bodies.values());
  const ben = rows.find((r) => r.who === "ben"), rick = rows.find((r) => r.who === "rick");
  ok(rows.length === 6, "the cast strip has six rows");
  ok(ben && ben.infected === false && ben.bitten === true && ben.bleeding === true && ben.hp === 40, "a bite the group doesn't know of reads BITTEN, not infected (BUNKER.md 38: the audience knows at once)");
  ok(rick && rick.infected === true, "a known infection shows");
  const wire = JSON.stringify(rows);
  ok(/"bitten":true/.test(wire) && !/secret-plan/.test(wire) && !/"why"/.test(wire), "the overlay's rows carry the bite but never the brain's `why`");
  ok(ben.doing === "looting" && rick.doing === "on guard", `doing reads plainly ("${ben.doing}", "${rick.doing}")`);
  ok(rows.map((r) => r.who).join(",") === "rick,johanna,dale,ben,sarah,rollo", "the strip runs in the cast's order");
  // WHAT THEY'RE THINKING: the latest `think` per survivor on their card; none on the dead; never a bite
  d.feed({ type: "think", t: 1200, by: "s:rick", text: "Old thought." }, 1200);
  d.feed({ type: "think", t: 1300, by: "s:rick", text: "Somebody has to keep watch." }, 1300);
  d.feed({ type: "think", t: 1300, by: "s:ben", text: "Nobody can see this bite." }, 1300);
  d.feed({ type: "think", t: 1300, by: "s:sarah", text: "I hate this place." }, 1300);
  d.feed({ type: "think", t: 1300, by: "s:dale", text: "Was I bitten back there?" }, 1300);
  d.feed({ type: "ev", event: "survivor.dead", t: 1400, seed: 1, victim: "s:sarah" }, 1400);
  const rows2 = castRows(d.bodies.values(), d.thoughts);
  const r2 = (w) => rows2.find((r) => r.who === w);
  ok(r2("rick").thought === "Somebody has to keep watch." && r2("rick").thoughtAt === 1300, "a card shows the survivor's latest thought, and when it came");
  ok(r2("sarah").dead && r2("sarah").thought === undefined, "the dead think nothing on their card");
  ok(r2("ben").thought === "Nobody can see this bite." && r2("dale").thought === undefined, "a bitten survivor's thought about it shows; one naming a bite on a card with no bite is dropped");
  // THEIR GOALS (wire `goal`) on the card, under the same bite rule; WHAT THEY DECIDED, never a hidden bite
  d.feed({ type: "goal", t: 1300, by: "s:rick", text: "Get everyone back to the safe room alive." }, 1300);
  d.feed({ type: "goal", t: 1300, by: "s:ben", text: "Hide this bite until I find a cure." }, 1300);
  const rows3 = castRows(d.bodies.values(), d.thoughts, d.goals);
  ok(rows3.find((r) => r.who === "rick").goal === "Get everyone back to the safe room alive." && rows3.find((r) => r.who === "ben").goal === "Hide this bite until I find a cure.", "a card shows their own goal — a bitten one's included");
  d.feed({ type: "decide", t: 1300, by: "s:rick", did: "go check the generator", reason: "lights are dying" }, 1300);
  ok(d.decisions.length === 1 && d.decisions[0].did === "go check the generator" && d.decisions[0].reason === "lights are dying", "a `decide` frame is kept for the DECIDED caption");
  const benB = d.bodies.get("s:ben");
  const daleB = d.bodies.get("s:dale");
  ok(decisionShown(benB, { did: "rest and hide the bite", reason: "this bite burns", social: false })?.reason === "this bite burns" && decisionShown(daleB, { did: "hide the bite", reason: "", social: false }) === null, "a caption about a bite shows for the bitten; one naming a bite nobody has is dropped");
  ok(decisionShown(benB, { did: "tell the others they've been bitten", reason: "they deserve to know", social: true })?.reason === "they deserve to know", "…owning up is the exception");
  // DOWN IS NOT DEAD (Josh, Nov 3 2026: "when a player goes down and needs a revive, their card says dead"): a
  // downed survivor has hp 0 and a bleed-out clock (vitals.downUntil, show clock) — the card reads DOWN with the
  // time left, and nothing about it is a death (no in-memoriam card) until the sim says survivor.dead
  const v0 = { stamina: 0.5, hunger: 0, thirst: 0, tired: 0, morale: 30, infected: false, bleeding: 1 };
  d.feed(ev("survivor.down", 1500, { victim: "s:johanna", cause: "wounds" }), 1500);
  d.feed({ type: "tick", t: 2000, b: [
    { id: "s:johanna", p: HOME.johanna, h: 0, pose: "down", hp: 0, vitals: { ...v0, job: "down", downUntil: 2000 + 42_000 } },
    { id: "s:rollo", p: HOME.rollo, h: 0, pose: "down", hp: 0, vitals: { ...v0, bitten: true, job: "turning", downUntil: 90_000 } },
  ] }, 2000);
  const rows4 = castRows(d.bodies.values(), d.thoughts, d.goals, d.simT ?? undefined);
  const jo = rows4.find((r) => r.who === "johanna"), ro = rows4.find((r) => r.who === "rollo");
  ok(jo && jo.dead === false && jo.down === true && jo.doing === "down — bleeding out 0:42" && jo.stats !== null, `a downed survivor's card reads DOWN with the time left, never dead ("${jo?.doing}")`);
  ok(ro && ro.dead === false && ro.down === true && ro.doing === "down — turning", `a survivor down and turning reads so, with no countdown ("${ro?.doing}")`);
  ok(castRows(d.bodies.values()).find((r) => r.who === "johanna")?.doing === "down — bleeding out", "…and without the show clock, just bleeding out");
  ok(!d.deaths.some((x) => x.who === "johanna"), "going down puts nobody on the in-memoriam list");
  d.feed(ev("survivor.dead", 2500, { victim: "s:johanna", cause: "bled out" }), 2500);
  const jo2 = castRows(d.bodies.values(), d.thoughts, d.goals, d.simT ?? undefined).find((r) => r.who === "johanna");
  ok(jo2?.dead === true && jo2.down === false && jo2.doing === "dead" && d.deaths.some((x) => x.who === "johanna"), "a real death (the bleed-out run out) reads dead, and gets the in-memoriam card");
  const c = nameCard("dale");
  ok(c.name === "Dale Hutchins" && c.tag === "Paramedic", "the lower third names the survivor and who they are");
  // the overlay's source never reads the brain's `why`
  const src = readFileSync(path.join(ROOT, "client/src/survivorz/show/Overlay.svelte"), "utf8") + readFileSync(path.join(ROOT, "client/src/survivorz/show/overlay.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  ok(!/\bwhy\b/.test(src), "Overlay.svelte and overlay.ts never read `why`");
}

console.log("AN ESCAPED SURVIVOR IS NEVER FILMED");
{
  // Rick fights (the hottest body on the floor), then walks out through the vault
  const { log } = run(240_000, (t) => {
    const out = [];
    if (t > 0 && t < 200_000 && t % 3000 === 0) out.push(ev("melee.hit", t, { by: "s:rick", victim: "z:1", at: HOME.rick }));
    if (t === 30_000) out.push(ev("survivor.escaped", t, { by: "s:rick" }), { type: "gone", id: "s:rick" });
    return out;
  });
  const before = log.filter((x) => x.t < 30_000);
  const after = log.filter((x) => x.t > 30_000);
  ok(before.some((x) => x.target === "s:rick"), "(the fighting survivor is on camera before they escape)");
  ok(after.length > 0 && after.every((x) => x.target !== "s:rick"), "after escaping, the escaped survivor is never the subject (even with their fight notes still fresh)");
  ok(after.some((x) => x.target && x.target !== "s:rick"), "the camera goes on filming the survivors still inside");
}

console.log("A NEW RUN CLEARS THE OLD ONE");
{
  const d = new Director();
  const T = 2_000_000;
  d.feed({ ...snap(T), run: "seed-1" }, T);
  ok(d.run === "seed-1", "the first snapshot's run is taken (and is not a change)");
  d.feed(ev("survivor.dead", T + 1000, { victim: "s:dale", cause: "eaten" }), T + 1000);
  ok(d.deaths.length === 1, "a death this run is recorded");
  // a reconnect: the same run again, nothing is cleared
  d.feed({ ...snap(T + 5000), run: "seed-1" }, T + 5000);
  ok(d.deaths.length === 1, "a reconnect's snapshot of the SAME run keeps the deaths");
  d.feed(ev("survivor.dead", T + 6000, { victim: "s:dale" }), T + 6000);
  ok(d.deaths.length === 1, "the same death twice in one run is one death");
  // a snapshot with no run (an older server) clears nothing either
  d.feed(snap(T + 7000), T + 7000);
  ok(d.deaths.length === 1 && d.run === "seed-1", "a snapshot with no run clears nothing and keeps the run");
  // the admin's restart: a fresh world
  for (let t = T + 7000; t < T + 20_000; t += 250) d.tick(t);
  d.feed({ ...snap(T + 20_000), run: "seed-2" }, T + 20_000);
  ok(d.run === "seed-2" && d.deaths.length === 0, "a snapshot of a DIFFERENT run clears the old run's deaths");
  ok(d.target === null && d.onAir().target === null, "...and the shot on air");
  d.feed(ev("survivor.dead", T + 21_000, { victim: "s:dale", cause: "fall" }), T + 21_000);
  ok(d.deaths.length === 1 && d.deaths[0].cause === "fall", "a survivor who died last run and dies again this run gets their card");
  const dec = d.tick(T + 21_250);
  ok(dec.target === "s:dale" && dec.shot === "body", "...and their death is held on camera again");
}

// ---------------------------------------------------------------------------------------------------
console.log("THE CONVERSATION + THE CUTS (REALISM.md: shots of 8-15 s, talk cut back and forth, dips only between rooms)");
{
  // Rick and Johanna in one room, the camera on Rick; Johanna answers him, then Rick her
  const d = new Director();
  const T = 9_000_000;
  const together = (w) => body(w, { room: "room-common", pos: w === "rick" ? [10, 0, 10] : [11.5, 0, 10] });
  d.feed({ type: "snap", t: T, day: 1, bodies: [together("rick"), together("johanna")], doors: [], power: {}, director: { phase: "build", tension: {} } }, T);
  let dec = null;
  for (let t = T; t < T + 12_000; t += 250) dec = d.tick(t);
  const subj0 = dec.target;
  ok(subj0 === "s:rick" || subj0 === "s:johanna", `the camera is on one of the two talking (${subj0})`);
  const other0 = subj0 === "s:rick" ? "s:johanna" : "s:rick";
  // (the picture on air — the follow, since the wide ended at WIDE_MS — is 4 s old: a line doesn't re-cut it)
  d.feed({ type: "say", t: T + 12_000, by: other0, to: subj0, text: "Hey." }, T + 12_000);
  ok(d.tick(T + 12_250).cut === "none", "a line doesn't re-cut a picture younger than TALK_CUT_MS");
  // let it settle on whoever it likes, until the picture on air has had its time
  let at = T + 12_500, since = at;
  for (; at < T + 90_000; at += 250) { dec = d.tick(at); if (dec.cut !== "none") since = at; if (at - since >= DIRECTOR.TALK_CUT_MS + 500 && at > T + 30_000) break; }
  const subj = dec.target, other = subj === "s:rick" ? "s:johanna" : "s:rick";
  at += 250;
  d.feed({ type: "say", t: at, by: other, to: subj, text: "We can't stay in here." }, at);
  const cut1 = d.tick(at += 250);
  ok(cut1.target === other && cut1.shot === "close", `once it has, a line said to the subject puts a close on the speaker (${cut1.target} ${cut1.shot})`);
  ok(cut1.cut === "hard", `...a HARD cut, not a dip: the same room (${cut1.cut})`);
  // an answer inside TALK_CUT_MS doesn't flick back at once
  const c1 = at;
  d.feed({ type: "say", t: at + 750, by: subj, to: other, text: "Then where?" }, at + 750);
  ok(d.tick(at += 1_000).target === other, "an answer inside TALK_CUT_MS doesn't flick the camera back at once");
  // after it, the next line cuts back
  for (at += 250; at < c1 + DIRECTOR.TALK_CUT_MS + 250; at += 250) d.tick(at);
  d.feed({ type: "say", t: at, by: subj, to: other, text: "The radio room." }, at);
  const cut2 = d.tick(at += 250);
  ok(cut2.target === subj && cut2.shot === "close" && cut2.cut === "hard", `...the next line cuts back to the other speaker (${cut2.target} ${cut2.shot} ${cut2.cut})`);
  // a line from somebody in ANOTHER room doesn't take the shot
  const c2 = at;
  for (at += 250; at < c2 + 4_000; at += 250) d.tick(at);
  d.feed({ type: "spawn", t: at - 100, body: body("dale") }, at - 100);
  d.feed({ type: "say", t: at, by: "s:dale", text: "Anybody hear that?" }, at);
  ok(d.tick(at + 250).target !== "s:dale", "a line from another room doesn't take the shot");
}
{
  // pacing: over a quiet run, every shot on a subject holds at least MIN_SHOT_MS unless a big moment cut it
  const s = (t) => (t % 9_000 === 0 ? [ev("item.found", t, { by: `s:${WHO[(t / 9_000) % WHO.length]}`, at: HOME[WHO[(t / 9_000) % WHO.length]] })] : []);
  const { log } = run(10 * 60_000, s);
  let short = 0, cuts = 0, prev = null;
  for (const x of log) {
    if (x.cut !== "none" && x.target !== prev?.target) { if (prev && x.t - prev.t < DIRECTOR.MIN_SHOT_MS && !x.big) short++; cuts++; prev = x; }
  }
  ok(DIRECTOR.MIN_SHOT_MS >= 8_000 && short === 0, `no subject held under ${DIRECTOR.MIN_SHOT_MS / 1000}s on a quiet run (${cuts} changes of subject, ${short} short)`);
}

// ---------------------------------------------------------------------------------------------------
console.log("A SHOT IS A SHOT (the Nov 12 2026 review: median shot 6 s, six in ten under 8 s)");
{
  // every PICTURE, not only every subject: over the busy ten minutes and a quiet ten, no cut of any kind lands
  // on a picture under MIN_SHOT_MS unless it is a big moment (a grab, somebody going down, a death)
  const pictures = (log) => { const out = []; let at = null; for (const x of log) { if (x.cut === "none" && at !== null) continue; if (at !== null) out.push({ len: x.t - at, big: x.big, to: x.shot }); at = x.t; } return out; };
  const quietRun = run(10 * 60_000, (t) => (t % 9_000 === 0 ? [ev("item.found", t, { by: `s:${WHO[(t / 9_000) % WHO.length]}`, at: HOME[WHO[(t / 9_000) % WHO.length]] })] : []));
  for (const [name, log] of [["busy", B.log], ["quiet", quietRun.log]]) {
    const p = pictures(log), short = p.filter((x) => x.len < DIRECTOR.MIN_SHOT_MS && !x.big);
    const lens = p.map((x) => x.len).sort((a, b) => a - b);
    ok(short.length === 0, `a ${name} ten minutes: no picture under ${DIRECTOR.MIN_SHOT_MS / 1000} s unless a big moment took it (${p.length} pictures, ${short.length} short)`);
    ok(lens[Math.floor(lens.length / 2)] >= DIRECTOR.MIN_SHOT_MS && p.length <= 75, `...and it isn't cut to pieces (median ${lens[Math.floor(lens.length / 2)] / 1000} s, ${p.length} pictures in ten minutes)`);
  }
  ok(DIRECTOR.WIDE_MS >= DIRECTOR.MIN_SHOT_MS && DIRECTOR.TALK_CUT_MS >= DIRECTOR.MIN_SHOT_MS && DIRECTOR.HOLD_MS >= DIRECTOR.MIN_SHOT_MS * 2, "the wide and a line of talk are held to the minimum shot too, and a subject gets two pictures");
}
{
  // THE TWO-SHOT KEEPS ITS OTHER BODY: a nearer zombie doesn't re-cut it; the one it framed dropping dead doesn't either
  const T0 = 20_000;
  const s = (t) => {
    const out = [];
    if (t === T0) out.push(ev("survivor.grabbed", t, { victim: "s:sarah", by: "z:2", at: near("sarah") }), { type: "tick", t, b: [{ id: "s:sarah", p: HOME.sarah, h: 0, pose: "grabbed" }] });
    if (t === T0 + 2_000) out.push({ type: "spawn", t, body: zombie("z:9", near("sarah", 0.4)) });
    if (t === T0 + 4_000) out.push({ type: "tick", t, b: [{ id: "z:2", p: near("sarah", 0.8), h: 0, pose: "z-dead", hp: 0 }, { id: "s:sarah", p: HOME.sarah, h: 0, pose: "fight" }] });
    return out;
  };
  s.zombies = [zombie("z:2", near("sarah", 0.8))];
  const { log } = run(T0 + 20_000, s);
  const two = log.filter((x) => x.t >= T0 && x.t < T0 + DIRECTOR.MIN_SHOT_MS);
  ok(two.length > 0 && two.every((x) => x.target === "s:sarah" && x.shot === "two" && x.other === "z:2"), "a two-shot keeps the body it was framed on: a nearer zombie arriving, and its own dropping dead, are no cut");
  ok(two.slice(1).every((x) => x.cut === "none"), `...the picture holds its ${DIRECTOR.MIN_SHOT_MS / 1000} s (${two.filter((x) => x.cut !== "none").length} cut, the grab's own)`);
  const after = log.find((x) => x.t >= T0 + DIRECTOR.MIN_SHOT_MS && x.cut !== "none" && x.target === "s:sarah");
  ok(!after || after.other !== "z:2", "once it has had its time, a dead partner is let go");
}
{
  // TWO DEATHS, three seconds apart: the first is held its whole hold, then the second is shown and held as long
  const T0 = 20_000;
  const die = (t, w) => [ev("survivor.dead", t, { victim: `s:${w}`, at: HOME[w], cause: "eaten" }), { type: "tick", t, b: [{ id: `s:${w}`, p: HOME[w], h: 0, pose: "dead", hp: 0 }] }];
  const { log } = run(T0 + 40_000, (t) => (t === T0 ? die(t, "dale") : t === T0 + 3_000 ? die(t, "sarah") : []));
  const first = log.filter((x) => x.t >= T0 + 250 && x.t < T0 + DIRECTOR.DEATH_HOLD_MS);
  ok(first.length > 0 && first.every((x) => x.target === "s:dale" && x.shot === "body"), "a death is held its whole hold, a second death three seconds later notwithstanding");
  const second = log.find((x) => x.t >= T0 + DIRECTOR.DEATH_HOLD_MS && x.target === "s:sarah");
  const left = second ? log.find((x) => x.t > second.t && x.target !== "s:sarah") : null;
  ok(!!second && second.t - T0 <= DIRECTOR.DEATH_HOLD_MS + 500 && second.shot === "body", `...then the second is shown (${second ? second.t - T0 : "never"} ms after the first death)`);
  ok(!!second && (!left || left.t - second.t >= DIRECTOR.DEATH_HOLD_MS), `...and held as long (${left && second ? left.t - second.t : "to the end"} ms)`);
}
{
  // TWO GRABS: one thirteen seconds old doesn't keep the camera from a fresh one next door
  const T0 = 20_000;
  const grab = (t, w, z) => [ev("survivor.grabbed", t, { victim: `s:${w}`, by: z, at: near(w) }), { type: "tick", t, b: [{ id: `s:${w}`, p: HOME[w], h: 0, pose: "grabbed" }] }];
  const s = (t) => (t === T0 ? grab(t, "ben", "z:1") : t === T0 + 13_000 ? grab(t, "sarah", "z:2") : []);
  s.zombies = [zombie("z:1", near("ben")), zombie("z:2", near("sarah", 0.8))];
  const { log } = run(T0 + 30_000, s);
  const g2 = log.find((x) => x.t >= T0 + 13_000 && x.target === "s:sarah");
  ok(!!g2 && g2.t - (T0 + 13_000) <= 500 && g2.big, `a fresh grab takes the camera from one that's fading (${g2 ? g2.t - T0 - 13_000 : "never"} ms)`);
}
{
  // A FIXED SHOT IS FOR SOMEBODY WHO STAYS IN IT
  const one = () => { const d = new Director(); return d; };
  const walk = (t, x, pose) => ({ type: "tick", t, b: [{ id: "s:rick", p: [x, 0, 10], h: 0, pose }] });
  // (a) a moment on somebody walking: the follow, never a close
  const a = run(40_000, (t) => {
    const out = [walk(t, 10 + (t / 1000) * 1.4, "walk")];
    if (t >= 2_000 && t % 3_000 === 0) out.push(ev("zombie.alert", t, { victim: "s:rick", by: "z:1", at: [10, 0, 10] }));
    return out;
  }, { d: one() });
  const onRick = a.log.filter((x) => x.target === "s:rick");
  ok(onRick.length > 20 && onRick.every((x) => x.shot === "wide" || x.shot === "follow"), `somebody walking is never given a close or a two-shot (${[...new Set(onRick.map((x) => x.shot))].join(", ")})`);
  // (b) a close on somebody standing, who then walks off: one hand-over to the follow, and no close after it
  const GO = 24_000;
  const b = run(50_000, (t) => {
    const out = [walk(t, t < GO ? 10 : 10 + ((t - GO) / 1000) * 1.4, t < GO ? "idle" : "walk")];
    if (t >= 2_000 && t % 3_000 === 0) out.push(ev("zombie.alert", t, { victim: "s:rick", by: "z:1", at: [10, 0, 10] }));
    return out;
  }, { d: one() });
  const closeAt = b.log.find((x) => x.target === "s:rick" && x.shot === "close");
  const off = b.log.filter((x) => x.t >= GO && x.target === "s:rick");
  const handed = off.find((x) => x.shot === "follow");
  ok(!!closeAt && closeAt.t < GO && !!handed && handed.t - GO <= 3_000, `a close whose subject walks off hands over to the follow (${handed ? handed.t - GO : "never"} ms after they set off; the close came at ${closeAt?.t})`);
  ok(off.filter((x) => x.t > (handed?.t ?? 0)).every((x) => x.shot === "follow"), "...once: no fixed shot is put back on them while they walk");
}
{
  // THE ROOM IS ALREADY ON SCREEN: a second subject in the same room opens without another establishing wide
  const d = new Director();
  const T = 5_000_000;
  const tog = (w, x) => body(w, { room: "room-common", pos: [x, 0, 10] });
  d.feed({ type: "snap", t: T, day: 1, bodies: [tog("rick", 10), tog("johanna", 13)], doors: [], power: {}, director: { phase: "build", tension: {} } }, T);
  let first = null, second = null;
  for (let t = T; t < T + 60_000; t += 250) {
    const x = d.tick(t);
    if (!first && x.target) first = x;
    if (first && !second && x.target && x.target !== first.target) second = x;
  }
  ok(first?.shot === "wide", "the first subject in a room opens on the wide");
  ok(!!second && second.shot !== "wide" && second.cut === "hard", `the next one in the same room doesn't get a second wide of it (${second?.shot}, a ${second?.cut} cut)`);
}

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
