// SOLACE SURVIVORZ — WALK THE MAP (src/survivorz/sim/player.ts; docs/survivorz/GLENRIDGE.md, "Walk the map").
// The admin starts a private run on any map, drives ONE survivor by hand, and can do everything a survivor can do
// there, by the simulation's own rules. THE STANDARD FOR EVERY MAP: a map a run can start on (maps.ts) must pass
// this — a new map with no objective walk written for it below is a red run.
//
// IN PROCESS, on dist/ (run `npm run build` first), EVERY MAP, by INPUTS ONLY — the four the admin's socket sends
// (the stick, an action by its id, a blow, stop). Nothing here calls a job's insides; where a walk needs the dead
// out of the way it uses the control room's own levers (clear, spawn), as the admin would.
//   · the run: one survivor, driven; the AI chooses nothing for it; a long clock;
//   · the body walks where it is pushed, at the simulation's gaits, and is never off the walk grid nor in a shut door;
//   · a door it may open opens when walked into (a hand on it, half a second); one it may not stays shut, and says why;
//   · stairs are climbed by walking at them, both ways, and do not bounce;
//   · a container in reach is on the list of actions, and searching it loots it; a push lets go of a search, a tin is
//     seen through; the door in front can be shut and opened;
//   · one of the dead can be fought and killed by hand, and the dead bite;
//   · reading the list of actions changes nothing; the same inputs replay the same walk; a save comes back the walk;
//   · THE MAP'S OBJECTIVES, END TO END, BY HAND — the bunker to "rescued", Glenridge Hall to "survived".
// OVER A REAL SERVER (port 8616): the lever and the socket's contract — a member refused, a bad map / survivor
// refused, a walk run private to the admin, the `walk` frame behind the snapshot, the stick moving the body, an
// unknown action answered with a note, a flood of inputs survived, the walk commands dead in any other run, a walk
// giving way to a walk, and a restart coming back the same walk.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const dist = (p) => path.join(ROOT, "dist", "survivorz", p);
const { SimWorld } = require(dist("sim/world.js"));
const P = require(dist("sim/player.js"));
const S = require(dist("sim/survivor.js"));
const { SPEED, STATS, START_KIT } = require(dist("sim/tables.js"));
const { encodeGraph, decodeGraph } = require(dist("sim/save.js"));
const { SHOW_MAPS } = require(dist("maps.js"));
const { WALK_IN, ALL_IDS } = require(dist("cast/index.js"));
const { canSpeak } = require(dist("talk/minds.js"));
const { GLEN } = require(dist("sim/scenarios/glenridge.js"));
const { doorPlacement } = require(dist("facility.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = 1_800_000_000_000;
const MAPS = SHOW_MAPS.filter((m) => !m.building).map((m) => m.id);
// (the best hand with something to swing: a knife ends a grab by itself — the simulation's rule — and this is about the swing)
const FIGHTER = [...ALL_IDS].filter((id) => !["knife", "fists"].includes(START_KIT[id].melee)).sort((a, b) => STATS[b].melee - STATS[a].melee)[0];

/** A walk world and the hand that drives it. Every tick is checked: on the walk grid, never in a shut door. */
function walker(map, opts = {}) {
  const calls = { choose: 0 };
  const w = new SimWorld({ map, seed: opts.seed ?? 7, start: T0, player: opts.who ?? WALK_IN[0], zombies: opts.zombies ?? 0, hooks: { choose: () => { calls.choose++; return undefined; } } });
  const s = P.playerOf(w), nav = w.nav;
  const evs = [];
  w.onFrame((f) => { if (f.type === "ev") evs.push(f); });
  const H = { w, s, nav, evs, calls, ticks: 0, offGrid: 0, inShut: 0, floors: new Set([s.floor]), clearDead: opts.clearDead ?? false, notes: [] };
  H.tick = (k = 1) => {
    for (let i = 0; i < k; i++) {
      w.tick(100); H.ticks++;
      if (s.alive && !s.escaped && !s.link) {
        if (!nav.isWalk(s.cell) || nav.cellAt(s.floor, s.x, s.z) !== s.cell) H.offGrid++;
        const d = nav.door[s.cell];
        if (d >= 0 && !w.doorOpenIdx(d)) H.inShut++;
        H.floors.add(s.floor);
      }
      // (the control room's clear lever, where a walk is about the map and not the dead)
      if (H.clearDead && H.ticks % 50 === 0) w.killZombies();
    }
  };
  H.push = (mx, mz, run = false, crouch = false) => P.walkInput(w, mx, mz, run, crouch);
  H.offered = (id) => P.walkActions(w).some((a) => a.id === id);
  H.busy = () => s.busyUntil > w.t || !!s.busyAct || s.openDoor >= 0 || !!s.link || !!s.job;
  H.note = () => { const f = P.walkFrame(w); if (f?.note) H.notes.push(f.note); return f; };
  const defaultGate = (d) => { S.prepActor(w, s); return w.fac.canPass(s.actor, nav.doors[d].id).ok ? 1 : 0; };
  const clear = (x, z) => nav.segLine(s.floor, s.x, s.z, x, z, (k) => w.canStand(s, k));
  /** STEER to `cell` by the stick alone, along a route worked out from the map (kept, and walked point to point;
   *  worked out again when it runs out, the floor changes, or the body stops getting anywhere): until `until()`, or
   *  standing on the cell. A stair on the way is taken by its action; a shut door by walking into it. */
  H.goTo = (cell, until = () => false, max = 6000, gate = defaultGate) => {
    let pts = null, pi = 0, mark = [s.x, s.z, s.floor, H.ticks], stalls = 0;
    const tagAt = (k) => pts[k * 4 + 3], distTo = (k) => Math.hypot(pts[k * 4] - s.x, pts[k * 4 + 1] - s.z);
    const plan = () => {
      const p = nav.route(s.cell, cell, gate);
      if (!p || !p.reached) return false;
      pts = p.pts; pi = 0;
      // (the route starts at the middle of the cell the body is in, or the door it stands in: that is behind it)
      while ((pi + 1) * 4 < pts.length && tagAt(pi) < 2000 && pts[pi * 4 + 2] === s.floor && distTo(pi) < (tagAt(pi) >= 1000 ? 0.45 : 0.3)) pi++;
      return true;
    };
    for (let i = 0; i < max; i++) {
      if (!s.alive || s.escaped) return false;
      if (until()) { H.push(0, 0); return true; }
      if (s.link || s.openDoor >= 0 || s.mode === "down" || s.grabbedBy.length) { H.tick(); continue; }
      if (s.floor === nav.floorOfCell(cell)) { const [cx, , cz] = nav.centre(cell); if (Math.hypot(cx - s.x, cz - s.z) < 0.3) { H.push(0, 0); return true; } }
      if (!pts || pi * 4 >= pts.length || pts[pi * 4 + 2] !== s.floor) { if (!plan()) { H.push(0, 0); H.why = "no route"; return false; } }
      const tag = tagAt(pi), d = distTo(pi);
      if (tag >= 2000 && d < 0.45) {
        // a stair's foot: the action for it (walking at a stair is proven on its own, below)
        if (H.offered("link:" + (tag - 2000))) { H.push(0, 0); P.walkDo(w, "link:" + (tag - 2000)); H.tick(); pts = null; continue; }
      } else if (d < (tag >= 1000 ? 0.3 : 0.2) && (pi + 1) * 4 < pts.length) { pi++; continue; }
      // cut a corner: a later plain point in a clear straight line is aimed at instead
      while (tagAt(pi) < 0 && (pi + 1) * 4 < pts.length && pts[(pi + 1) * 4 + 2] === s.floor && clear(pts[(pi + 1) * 4], pts[(pi + 1) * 4 + 1])) pi++;
      const dd = distTo(pi) || 1;
      H.push((pts[pi * 4] - s.x) / dd, (pts[pi * 4 + 1] - s.z) / dd);
      H.tick();
      if (H.ticks - mark[3] >= 25) {
        if (mark[2] === s.floor && Math.hypot(s.x - mark[0], s.z - mark[1]) < 0.3 && !H.busy()) {
          pts = null;
          if (++stalls > 8) { H.push(0, 0); H.why = `stuck at ${s.x.toFixed(2)}, ${s.z.toFixed(2)} in ${nav.rooms[s.room]?.id}`; return false; }
        } else stalls = 0;
        mark = [s.x, s.z, s.floor, H.ticks];
      }
    }
    H.push(0, 0); H.why = "ran out of time";
    return false;
  };
  /** DO a line of the survivor's own menu by hand: walk until it is on the list of actions, pick it, see it through */
  H.task = (id, max = 6000) => {
    const m = S.jobMenu(w, s).menu.find((o) => o.id === id);
    if (!m) { H.why = `${id} is not on the menu`; return false; }
    if (!H.goTo(m.job.cell, () => H.offered(id))) { H.why = `could not get to ${id}: ${H.why}`; return false; }
    if (!H.offered(id)) { H.why = `${id} not offered where it is`; return false; }
    H.push(0, 0);
    if (!P.walkDo(w, id)) { H.why = `${id} refused`; return false; }
    for (let i = 0; i < max && H.busy(); i++) H.tick();
    if (H.busy()) { H.why = `${id} never finished (${s.busyAct || s.job?.kind})`; return false; }
    return true;
  };
  H.by = (event) => evs.filter((e) => e.event === event && e.by === s.id).length;
  return H;
}

// ================================================================================================================
// THE MAP'S OBJECTIVES BY HAND. One walk for every map a run can start on: `steps` returns the name of the first
// step that could not be done by hand (or ""), `done` what must be true at the end.
const OBJECTIVES = {
  bunker: {
    ending: "rescued",
    walk(H) {
      const { w, s } = H, o = w.obj;
      const step = (id) => H.task(id) || (console.error(`    (${H.why})`), false);
      if (!step("crank:crank") || !o.sealedAt) return "crank the blast door shut";
      if (!step("loot:" + w.local.keycard.id) || s.card < 1) return "find the armory keycard";
      const arm = S.jobMenu(w, s).menu.find((m) => m.label.startsWith("arm up"));
      if (!arm || !step(arm.id) || !s.gun || !w.armoryOpenAt) return "open the armory with the card and arm up";
      if (!step("loot:" + o.noteSpot) || !o.codeAt) return "find the radio room's code";
      if (!step("repair:radio-set") || !o.radioOpenAt || !s.know.records.has("radio:part")) return "open the radio room with the code and look the radio over";
      if (!step("loot:" + o.partSpot) || !o.partFoundAt) return "find the radio's part";
      if (!step("repair:radio-set") || !o.fixedAt) return "fit the part and repair the radio";
      if (!step("call:radio-set") || !o.calledAt) return "call for rescue";
      for (let i = 0; i < 300 && !o.ending; i++) H.tick();
      return "";
    },
    done(H) {
      const o = H.w.obj, who = H.s.who;
      return [
        [o.sealedBy === who && H.by("crank.start") >= 1, "the blast door cranked shut by hand"],
        [H.by("keycard.found") === 1 && H.by("door.keycard") >= 1, "the keycard found and the armory opened with it"],
        [o.codeBy === who && H.by("keypad.ok") >= 1, "the code read off the note and the radio room opened with it"],
        [o.partBy === who && o.partIn && o.fixedBy === who, "the part found, fitted, and the radio repaired"],
        [o.calledBy === who && H.by("radio.call") === 1, "the call made"],
        [H.w.stats.reach.n >= 10 && H.w.stats.reach.over === 0, `every hand on a thing from within reach, as for the AI (${H.w.stats.reach.n} touches, the furthest ${H.w.stats.reach.worst.toFixed(2)} m)`],
      ];
    },
  },
  glenridge: {
    ending: "survived",
    walk(H) {
      const { w, s, nav } = H, g = w.sc;
      const step = (id) => H.task(id) || (console.error(`    (${H.why})`), false);
      const hall = S.roomAt(w, nav.roomIdx.get("great-hall"), 0.5, 0.75);
      if (!H.goTo(hall, () => nav.rooms[s.room].id === "great-hall")) return "get inside the house";
      if (!step("task:front-bolt") || !g.boltedAt || !w.fac.bolted.has(GLEN.front)) return "bolt the front door";
      for (const win of GLEN.windows) {
        if (!step("task:planks") || !s.pack.spare.includes("planks")) return "take planks from the coal store";
        if (!step("task:board-" + win) || w.fac.doors.get(win).open) return "board the window " + win;
      }
      // (the storm takes the lights when it is due: brought forward to now, as a long walk would get there anyway)
      g.darkDue = w.t;
      for (let i = 0; i < 30 && !g.darkAt; i++) H.tick();
      if (!g.darkAt) return "the lights go out";
      if (!step("task:plant") || !g.lightAt) return "restart the switchboard";
      // THE OBJECTIVE: alive when the clock runs out (the show's length, set as the Start card's lever sets it)
      if (!w.setShowLength(Math.ceil((w.t - w.startedAt) / 60_000) + 1)) return "set the show's length";
      for (let i = 0; i < 1500 && !w.obj.ending; i++) H.tick();
      return "";
    },
    done(H) {
      const g = H.w.sc, who = H.s.who;
      return [
        [g.boltedBy === who && H.by("door.bolted") === 1, "the front door bolted by hand"],
        [Object.keys(g.boarded).length === 5 && Object.values(g.boarded).every((b) => b.by === who) && H.by("planks.taken") === 5, "five armfuls of planks, five windows boarded"],
        [g.lightBy === who && g.lightAt > g.darkAt, "the switchboard restarted after the lights went out"],
        [H.w.obj.rescued.length === 1 && H.w.obj.rescued[0] === who, "survived, by name, when the clock ran out"],
        [H.floors.has(1) && H.floors.has(2), "the cellar walked (the stairs taken by hand)"],
      ];
    },
  },
};

for (const map of MAPS) {
  console.log(`\n==== ${map} ====`);

  console.log("THE RUN");
  {
    const H = walker(map), { w, s } = H;
    ok(w.survivors.length === 1 && !!s && s.who === WALK_IN[0] && !!s.player, `a walk run has one survivor, and it is the driven body (${s?.id})`);
    ok(w.showMs >= 6 * 3_600_000, `its clock is long (${w.showMs / 3_600_000} h): nobody is timed out of a map they are looking round`);
    ok(canSpeak(s) === false, "the driven body has no voice of its own (the minds leave it alone)");
    const x0 = s.x, z0 = s.z;
    H.tick(300);
    ok(s.job === null && Math.hypot(s.x - x0, s.z - z0) < 0.05 && H.calls.choose === 0 && H.evs.every((e) => e.event !== "survivor.calls"), "left alone for 30 s it stands where it is: no job picked, nothing chosen, no calling out");
    const f = P.walkFrame(w);
    ok(f && f.type === "walk" && f.you === s.id && Array.isArray(f.actions) && f.actions.every((a) => typeof a.id === "string" && typeof a.label === "string" && a.kind === a.id.split(":")[0]), `the walk frame says who they are and what is in reach (${f?.actions.map((a) => a.id).join(", ")})`);
    const other = new SimWorld({ map, seed: 7, start: T0 });
    ok(P.playerOf(other) === null && P.walkFrame(other) === null && other.survivors.every((x) => !("player" in x)) && (P.walkInput(other, 1, 0), P.walkHit(other), P.walkStop(other), P.walkDo(other, "eat") === false), "a run that isn't a walk has no driven body, and the four inputs do nothing in it");
  }

  console.log("WALKING");
  {
    const H = walker(map, { clearDead: true }), { w, s, nav } = H;
    // eight ways from where it stands: it never goes against the push
    let against = 0, far = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, mx = Math.sin(a), mz = Math.cos(a), x0 = s.x, z0 = s.z;
      H.push(mx, mz); H.tick(30); H.push(0, 0); H.tick(8);
      const along = (s.x - x0) * mx + (s.z - z0) * mz;
      if (along < -0.05) against++;
      if (along > 2) far++;
    }
    ok(against === 0 && far >= 2, `pushed eight ways, it goes the way it is pushed (or along what is in the way), never against it (${far} ways open for more than 2 m)`);
    // a long wander on a seeded stick: every step on the walk grid, none in a shut door
    let seed = 12345, moved = 0;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 4000; i++) {
      if (i % 25 === 0) { const a = rnd() * Math.PI * 2, r = rnd(); H.push(Math.sin(a), Math.cos(a), r > 0.8, r < 0.1); }
      const x0 = s.x, z0 = s.z; H.tick(); moved += Math.hypot(s.x - x0, s.z - z0);
    }
    H.push(0, 0);
    ok(H.offGrid === 0 && H.inShut === 0, `a seeded wander of 4,000 steps (${moved.toFixed(0)} m): never off the walk grid, never standing in a shut door (${H.offGrid}, ${H.inShut})`);
    ok(moved > 150, `…and it does get about (${moved.toFixed(0)} m)`);
    ok(H.calls.choose === 0 && s.mode === "job", "…with nothing chosen for it on the way");

    // THE GAITS: a straight clear run found on the map, each gait's pace measured over its last second
    let best = null;
    for (let r = 0; r < nav.rooms.length; r++) {
      const c = S.roomAt(w, r, 0.5, 0.5);
      if (c < 0 || !nav.isWalk(c) || nav.door[c] >= 0) continue;
      const [x, , z] = nav.centre(c), f = nav.floorOfCell(c);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
        let len = 0;
        while (len < 40 && nav.segLine(f, x, z, x + ux * (len + 2), z + uz * (len + 2), (q) => nav.door[q] < 0)) len += 2;
        if (!best || len > best.len) best = { c, ux, uz, len };
      }
    }
    const speedOf = (mx, mz, run, crouch, secs) => {
      H.push(mx, mz, run, crouch); H.tick(secs * 10 - 10);
      const x0 = s.x, z0 = s.z; H.tick(10);
      const v = Math.hypot(s.x - x0, s.z - z0); H.push(0, 0); H.tick(15);
      return v;
    };
    const back = () => H.goTo(best.c);
    const got = {};
    if (best && best.len >= 14 && back()) {
      s.stamina = 1;
      got.crouch = speedOf(best.ux, best.uz, false, true, 4); back();
      got.walk = speedOf(best.ux * 0.4, best.uz * 0.4, false, false, 4); back();
      got.jog = speedOf(best.ux, best.uz, false, false, 3); back();
      for (let i = 0; i < 100 && s.stamina < 0.95; i++) H.tick();
      got.sprint = speedOf(best.ux, best.uz, true, false, 2.5);
    }
    ok(!!best && best.len >= 14 && got.sprint !== undefined, `a straight run to measure on (${best?.len} m)`);
    ok(Math.abs(got.crouch - SPEED.crouch) < 0.12 && got.walk > 1.0 && got.walk <= SPEED.walk + 0.05 && Math.abs(got.jog - SPEED.jog) < 0.35 && Math.abs(got.sprint - SPEED.sprint) < 0.5,
      `the simulation's own gaits: crouch ${got.crouch?.toFixed(2)}, a half push walks ${got.walk?.toFixed(2)}, a full push jogs ${got.jog?.toFixed(2)}, run sprints ${got.sprint?.toFixed(2)} m/s`);
    ok(H.evs.every((e) => e.by !== s.id || !/^survivor\.(calls|panic)$/.test(e.event)), "…and no reflex of its own on the way (no call, no panic)");
  }

  console.log("DOORS");
  {
    const H = walker(map, { clearDead: true }), { w, s, nav } = H;
    S.prepActor(w, s);
    const sideCell = (di, room) => {
      // a place to stand square in front of the door, a metre or so back, on `room`'s side (its facing runs a → b)
      const D = nav.doors[di], pl = doorPlacement(w.map.site, D.id), R = nav.rooms[room];
      if (!pl) return -1;
      const sg = nav.roomIdx.get(D.a) === room ? -1 : 1;
      for (const back of [1.1, 1.35, 0.9, 1.6]) {
        const q = nav.cellAt(R.floor, pl.centre[0] + pl.normal[0] * sg * back, pl.centre[2] + pl.normal[2] * sg * back);
        if (q >= 0 && nav.isWalk(q) && nav.door[q] < 0 && nav.room[q] === room) return q;
      }
      return -1;
    };
    // a door that will not open for them: walked into for six seconds
    let locked = null;
    for (let di = 0; di < nav.doors.length && !locked; di++) {
      const D = nav.doors[di];
      if (!["door", "keycard", "keypad"].includes(D.kind) || w.fac.canPass(s.actor, D.id).ok) continue;
      for (const id of [D.a, D.b]) {
        const room = nav.roomIdx.get(id), q = sideCell(di, room);
        if (q < 0) continue;
        const p = nav.route(s.cell, q, (d) => (w.fac.canPass(s.actor, nav.doors[d].id).ok ? 1 : 0));
        if (p && p.reached) { locked = { di, D, q, room }; break; }
      }
    }
    let lockedOk = false, said = "";
    if (locked && H.goTo(locked.q)) {
      const c = nav.doorCentre[locked.di], far = nav.roomIdx.get(locked.D.a === nav.rooms[locked.room].id ? locked.D.b : locked.D.a);
      let through = false;
      for (let i = 0; i < 60; i++) {
        const d = Math.hypot(c[0] - s.x, c[2] - s.z) || 1;
        H.push((c[0] - s.x) / d, (c[2] - s.z) / d); H.tick(); H.note();
        if (s.room === far || nav.door[s.cell] === locked.di) through = true;
      }
      H.push(0, 0);
      said = H.notes.find((x) => /locked|sealed|open/.test(x)) ?? "";
      lockedOk = !through && !w.fac.doors.get(locked.D.id).open && !!said;
    }
    ok(lockedOk, `a door it may not pass (${locked?.D.id}, ${locked?.D.kind}) stays shut however it is walked into, the body stays this side, and the screen is told why ("${said}")`);

    // a shut door it may open: walked into, it opens (a hand on it, half a second), and the body goes through
    let plain = null;
    for (let di = 0; di < nav.doors.length && !plain; di++) {
      const D = nav.doors[di], st = w.fac.doors.get(D.id);
      if (D.kind !== "door" || st.open || st.locked) continue;
      for (const id of [D.a, D.b]) {
        const room = nav.roomIdx.get(id), q = sideCell(di, room), other = nav.roomIdx.get(id === D.a ? D.b : D.a), q2 = sideCell(di, other);
        if (q < 0 || q2 < 0 || nav.rooms[room].floor !== nav.rooms[other].floor) continue;
        // (reached without going through the door itself)
        const p = nav.route(s.cell, q, (d) => (d !== di && w.fac.canPass(s.actor, nav.doors[d].id).ok ? 1 : 0));
        if (p && p.reached) { plain = { di, D, q, q2, room, other }; break; }
      }
    }
    let opened = false, heldMs = 0, wentThrough = false;
    if (plain) {
      // to this side of it by a way that isn't through it, so the first thing to open it is the walk into it
      const there = H.goTo(plain.q, undefined, 6000, (d) => (d !== plain.di && w.fac.canPass(s.actor, nav.doors[d].id).ok ? 1 : 0));
      H.push(0, 0);
      if (there && !w.fac.doors.get(plain.D.id).open) {
        const before = H.evs.length, [gx, , gz] = nav.centre(plain.q2);
        let t0 = 0;
        for (let i = 0; i < 150 && !wentThrough; i++) {
          const d = Math.hypot(gx - s.x, gz - s.z) || 1;
          H.push((gx - s.x) / d, (gz - s.z) / d); H.tick();
          if (s.openDoor >= 0 && !t0) t0 = w.t;
          if (t0 && !heldMs && w.fac.doors.get(plain.D.id).open) heldMs = w.t - t0;
          if (s.room === plain.other && nav.door[s.cell] < 0) wentThrough = true;
        }
        H.push(0, 0);
        opened = H.evs.slice(before).some((e) => e.event === "door.open" && e.by === s.id && e.door === plain.D.id);
      }
    }
    if (plain && !(opened && wentThrough)) console.error(`    (the door ${plain.D.id}: open ${w.fac.doors.get(plain.D.id).open}, body in ${nav.rooms[s.room]?.id} at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}; ${H.why})`);
    ok(!!plain && opened && wentThrough, `a shut door it may open (${plain?.D.id}) opens when walked into, and the body goes through`);
    ok(heldMs >= 400 && heldMs <= 700 && (w.stats.reach.byWhat["door.open"] ?? 9) <= 0.9, `…the survivor's own way: a hand on the leaf from ${w.stats.reach.byWhat["door.open"]} m, ${heldMs} ms`);
    // the door behind them: shut it, open it again — two of the actions in reach
    let shut = false, reopened = false;
    if (wentThrough) {
      H.tick(3);
      const idS = "shut:" + plain.D.id, idO = "open:" + plain.D.id;
      // (step clear of the doorway until the shut is offered)
      const [gx, , gz] = nav.centre(plain.q2);
      for (let i = 0; i < 40 && !H.offered(idS); i++) { const d = Math.hypot(gx - s.x, gz - s.z) || 1; H.push((gx - s.x) / d * 0.4, (gz - s.z) / d * 0.4); H.tick(); }
      H.push(0, 0); H.tick(4);
      if (H.offered(idS) && P.walkDo(w, idS)) { for (let i = 0; i < 30 && H.busy(); i++) H.tick(); shut = !w.fac.doors.get(plain.D.id).open && H.by("door.close") >= 1; }
      H.tick(3);
      if (shut && H.offered(idO) && !H.offered(idS) && P.walkDo(w, idO)) { for (let i = 0; i < 40 && (H.busy() || s.player.door >= 0); i++) H.tick(); reopened = w.fac.doors.get(plain.D.id).open; }
    }
    ok(shut && reopened, "the door in front of them can be shut, and opened again, from the list of actions");
    ok(H.offGrid === 0 && H.inShut === 0, "…and through all of it never off the walk grid nor in a shut door");
  }

  console.log("STAIRS");
  {
    const H = walker(map, { clearDead: true }), { w, s, nav } = H;
    const stairs = nav.portals.filter((p) => p.kind !== "door" && p.kind !== "window" && p.kind !== "vent" && (p.door < 0 || w.doorOpenIdx(p.door)));
    if (!stairs.length) ok(nav.floors.length === 1, "this map is all on one floor: no stairs to take");
    else {
      let took = 0, bounced = 0, want = 0, offered = 0;
      for (const p of stairs) for (const [near, far] of [[p.cb, p.ca], [p.ca, p.cb]]) {
        want++;
        // (just off this very stair: a step away from its end first — it is not walked onto again until then)
        if (s.player.lock === p.idx && s.floor === nav.floorOfCell(near)) {
          const [ex, , ez] = nav.centre(near);
          let away = -1;
          for (let k = 0; k < 16 && away < 0; k++) { const a = (k / 16) * Math.PI * 2, q = nav.cellAt(s.floor, ex + Math.sin(a) * 1.5, ez + Math.cos(a) * 1.5); if (q >= 0 && nav.isWalk(q) && nav.door[q] < 0 && nav.segLine(s.floor, ex, ez, ex + Math.sin(a) * 1.5, ez + Math.cos(a) * 1.5, (c) => w.canStand(s, c))) away = q; }
          if (away >= 0) H.goTo(away);
          H.tick(5);
        }
        // toward its foot until it is on the list of actions; then walk at it
        if (!H.goTo(near, () => s.floor === nav.floorOfCell(near) && !s.link && H.offered("link:" + p.idx))) { console.error(`    (could not reach the stair ${p.idx}: ${H.why})`); continue; }
        if (H.offered("link:" + p.idx)) offered++; else console.error(`    (stair ${p.idx} not offered at ${s.x.toFixed(2)}, ${s.z.toFixed(2)} floor ${s.floor}: ${P.walkActions(w).map((a) => a.id).join(", ")} · job ${s.job?.kind} link ${!!s.link})`);
        const [nx, , nz] = nav.centre(near), [fx, , fz] = nav.centre(far);
        const line = p.line ? (near === p.ca ? p.line : [...p.line].reverse()) : [];
        let dir = null;
        for (const q of [...line, [fx, 0, fz]]) { const dx = q[0] - nx, dz = q[2] - nz, l = Math.hypot(dx, dz); if (l > 0.3) { dir = [dx / l, dz / l]; break; } }
        if (!dir) dir = [0, 1];
        const f0 = s.floor, ff = nav.floorOfCell(far);
        let on = false;
        for (let i = 0; i < 500; i++) {
          // at its foot along the way it runs
          const d = Math.hypot(nx - s.x, nz - s.z);
          if (!s.link && !s.job && d > 0.35) H.push((nx - s.x) / d, (nz - s.z) / d); else H.push(dir[0], dir[1]);
          H.tick();
          if (s.link) on = true;
          if (on && !s.link) break;
        }
        if (on && s.floor === ff && ff !== f0) took++; else console.error(`    (job fails: ${JSON.stringify(w.stats.jobFailAt ?? {})})
    (stair ${p.idx} from floor ${f0}: on it ${on}, now floor ${s.floor} in ${nav.rooms[s.room]?.id} at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}, wanted floor ${ff}; foot ${nx.toFixed(2)}, ${nz.toFixed(2)} dir ${dir.map((v) => v.toFixed(2))})`);
        // the same push still held at the top (and the way the stair runs from there, which on a stair that doubles
        // back is the way it was climbed): it does not turn round and go back
        const [bx, bz] = (() => { const l2 = p.line ? (far === p.ca ? p.line : [...p.line].reverse()) : []; for (const q of l2) { const dx = q[0] - fx, dz = q[2] - fz, l = Math.hypot(dx, dz); if (l > 0.3) return [dx / l, dz / l]; } return dir; })();
        for (let i = 0; i < 40; i++) { H.push(i < 20 ? dir[0] : bx, i < 20 ? dir[1] : bz); H.tick(); if (s.link || s.floor !== ff) { bounced++; break; } }
        H.push(0, 0); H.tick(10);
      }
      ok(took === want, `every stair is climbed by walking at it, both ways (${took} of ${want}: ${stairs.map((p) => p.idx).join(", ")})`);
      ok(bounced === 0, "…and pushing on at the top does not send them back down");
      ok(offered === want, "…and each is on the list of actions from its foot");
      ok(H.floors.size >= 2 && H.offGrid === 0, `floors walked: ${[...H.floors].sort().join(", ")}; off the stairs, never off the walk grid`);
    }
  }

  console.log("HANDS");
  {
    const H = walker(map, { clearDead: true }), { w, s, nav } = H;
    S.prepActor(w, s);
    // the nearest container with something in it
    const gate = (d) => (w.fac.canPass(s.actor, nav.doors[d].id).ok ? 1 : 0);
    let spot = null, bl = Infinity;
    for (const sp of w.local.loot) {
      const items = w.group.loot.get(sp.id) ?? [];
      if (!items.some((it) => it === "food" || it === "water" || it === "bandage") || sp.cell < 0) continue;
      const p = nav.route(s.cell, sp.cell, gate);
      if (!p || !p.reached) continue;
      if (p.pts.length < bl) { bl = p.pts.length; spot = sp; }
    }
    const id = spot ? "loot:" + spot.id : "";
    const before = spot ? [...(w.group.loot.get(spot.id) ?? [])] : [];
    const far = spot ? !H.offered(id) : false;
    const there = !!spot && H.goTo(spot.cell, () => H.offered(id));
    const [cx, , cz] = spot ? nav.centre(spot.cell) : [0, 0, 0];
    ok(there && H.offered(id) && Math.hypot(cx - s.x, cz - s.z) <= 2.6, `a container (${spot?.id}) is on the list of actions once it is in reach${far ? ", and was not from across the map" : ""}`);
    // a push lets go of a search: nothing is taken
    const pack0 = JSON.stringify(s.pack);
    P.walkDo(w, id);
    for (let i = 0; i < 100 && s.busyAct !== "search"; i++) H.tick();
    const searching = s.busyAct === "search";
    H.tick(3); H.push(1, 0); H.tick(4); H.push(0, 0);
    ok(searching && s.busyAct === "" && s.job === null && JSON.stringify(s.pack) === pack0 && !w.group.searched.has(spot?.id ?? ""), "a push on the stick lets go of a search half done: nothing is taken, the container is as it was");
    // seen through, it loots it
    const done = !!spot && H.task(id);
    const after = spot ? w.group.loot.get(spot.id) ?? [] : [];
    ok(done && w.group.searched.has(spot.id) && after.length < before.length && JSON.stringify(s.pack) !== pack0 && H.by("box.open") >= 2 && H.by("item.found") === 1 && (w.stats.reach.byWhat.loot ?? 9) <= 1.0,
      `searching it by hand loots it (${before.length - after.length} thing${before.length - after.length === 1 ? "" : "s"} taken, a hand on it from ${w.stats.reach.byWhat.loot} m)`);
    ok(!H.offered(id), "…and, emptied or gone through, it is not offered again");
    // a tin is seen through: a push does not call it off
    const food0 = s.pack.food;
    const ate = H.offered("eat") && P.walkDo(w, "eat");
    H.tick(5); H.push(0, 1); H.tick(10);
    const mid = s.busyAct === "eat";
    for (let i = 0; i < 80 && s.busyAct; i++) H.tick();
    H.push(0, 0);
    ok(ate && mid && s.pack.food === food0 - 1 && H.by("eat.can") === 1, "eating is one of the actions; once begun it is seen through, push or no push");
    // stop: a job being walked to is dropped
    const again = w.local.loot.find((sp) => sp.id !== spot?.id && (w.group.loot.get(sp.id) ?? []).length && sp.cell >= 0 && nav.route(s.cell, sp.cell, gate)?.reached);
    let stopped = false, heldOn = false, newOff = false;
    if (again && H.goTo(again.cell, () => H.offered("loot:" + again.id))) {
      P.walkDo(w, "loot:" + again.id); H.tick(2);
      const had = !!s.job; P.walkStop(w); H.tick(3);
      stopped = had && s.job === null && !s.busyAct && !w.group.searched.has(again.id);
      // the key still down as the action is picked is not a push to call it off; the next push is
      H.push(1, 0); P.walkDo(w, "loot:" + again.id); H.tick(12);
      heldOn = !!s.job || s.busyAct === "search";
      H.push(0.9, 0.1); H.tick(2);
      const still = !!s.job || s.busyAct === "search";
      H.push(0, 1); H.tick(3); H.push(0, 0);
      newOff = still && s.job === null && !s.busyAct && !w.group.searched.has(again.id);
    }
    ok(stopped, "walk.stop lets go of whatever is in hand");
    ok(heldOn && newOff, "the push already held when an action is picked does not call it off (nor does a wobble of the stick); a new push does");
    // an id that is not on the list: refused, with a word for the screen
    const r = P.walkDo(w, "task:fly-away"), f = P.walkFrame(w);
    ok(r === false && f.note === "not from here" && P.walkFrame(w).note === undefined, "an action that is not on the list is refused, and the screen is told so once");
    // reading the list changes nothing
    const h0 = encodeGraph(w.saveState());
    for (let i = 0; i < 50; i++) P.walkActions(w);
    ok(encodeGraph(w.saveState()) === h0, "reading the list of actions fifty times rolls nothing and changes nothing in the world");
  }

  console.log("THE DEAD");
  {
    // a fighter, one of the dead: walked up to and put down by hand
    const H = walker(map, { who: FIGHTER }), { w, s, nav } = H;
    S.prepActor(w, s);
    w.killZombies();
    const made = w.spawnZombies(1);
    const z = w.zombies.find((x) => x.alive);
    let killed = false;
    if (made && z) {
      for (let i = 0; i < 6000 && z.alive && s.alive; i++) {
        const d = Math.hypot(z.x - s.x, z.z - s.z);
        const inReach = () => z.floor === s.floor && Math.hypot(z.x - s.x, z.z - s.z) < 1.3 && nav.sees(s.floor, s.x, s.z, z.x, z.z, w.doorOpenIdx);
        if (inReach()) { H.push(0, 0); P.walkHit(w); H.tick(); }
        else if (z.floor === s.floor && d < 4 && nav.segLine(s.floor, s.x, s.z, z.x, z.z, (k) => w.canStand(s, k))) { H.push((z.x - s.x) / d, (z.z - s.z) / d); H.tick(); }
        else { H.goTo(nav.nearestWalk(z.cell), inReach, 20); H.tick(); }
        if (i % 20 === 0) for (const o of w.zombies) if (o !== z && o.alive) w.kill(o.id);
      }
      killed = !z.alive;
      if (!killed) console.error(`    (the fight: ${s.alive ? "alive" : "dead"} in ${nav.rooms[s.room]?.id}, the dead one in ${nav.rooms[z.room]?.id} ${Math.hypot(z.x - s.x, z.z - s.z).toFixed(1)} m off, ${w.stats.swings} swings, ${H.why})`);
    }
    ok(made === 1 && killed && z.killedBy === s.id && (s.kills ?? 0) >= 1 && H.by("zombie.death") >= 1, `${FIGHTER} walks up to one of the dead and puts it down by hand (walk.hit)`);
    ok(w.stats.swings >= 1 && (H.by("melee.swing.light") + H.by("melee.swing.heavy")) === w.stats.swings && (H.by("melee.hit") + H.by("melee.hit.head") + H.by("melee.stab")) >= 1, `…with the simulation's own swing: ${w.stats.swings} swung, a blow landed`);
    H.tick(30); P.walkFrame(w);
    P.walkHit(w); H.tick(2);
    ok(P.walkFrame(w).note === "nothing in reach" && w.stats.swings === H.by("melee.swing.light") + H.by("melee.swing.heavy"), "a blow at nothing swings at nothing, and is told as much");
  }
  {
    // and the dead bite: stood beside one, hands down
    const H = walker(map, {}), { w, s, nav } = H;
    S.prepActor(w, s);
    w.killZombies();
    w.spawnZombies(2);
    const hp0 = s.hp;
    let hurt = false, held = false, heldStill = true;
    for (let i = 0; i < 9000 && s.alive && !hurt; i++) {
      const z = w.zombies.filter((x) => x.alive).sort((a, b) => (a.floor === s.floor ? 0 : 1e6) + Math.hypot(a.x - s.x, a.z - s.z) - ((b.floor === s.floor ? 0 : 1e6) + Math.hypot(b.x - s.x, b.z - s.z)))[0];
      if (!z) break;
      if (s.grabbedBy.length) { held = true; const x0 = s.x, z0 = s.z; H.push(1, 0); H.tick(); if (Math.hypot(s.x - x0, s.z - z0) > 0.3) heldStill = false; }
      else if (z.floor === s.floor && Math.hypot(z.x - s.x, z.z - s.z) < 1.6) { H.push(0, 0); H.tick(); }
      else { H.goTo(nav.nearestWalk(z.cell), () => z.floor === s.floor && Math.hypot(z.x - s.x, z.z - s.z) < 1.5, 20); H.tick(); }
      hurt = H.evs.some((e) => (e.event === "survivor.bitten" || e.event === "survivor.hit") && e.victim === s.id);
    }
    H.push(0, 0);
    ok(hurt && s.hp < hp0, `stood beside one with its hands down, the driven body is bitten like anybody (${Math.round(hp0)} → ${Math.round(s.hp)} hp${s.bitten ? ", bitten" : ""})`);
    ok(!held || heldStill, "…and held by one of the dead it goes nowhere, however the stick is pushed");
  }

  console.log("THE SAME WALK TWICE, AND A SAVE");
  {
    const script = (H, from, to) => {
      for (let i = from; i < to; i++) {
        if (i % 40 === 0) { const a = i * 0.7; H.push(Math.sin(a), Math.cos(a), i % 160 === 0, false); }
        if (i % 90 === 45) P.walkHit(H.w);
        if (i % 130 === 5) { const acts = P.walkActions(H.w); if (acts.length) P.walkDo(H.w, acts[0].id); }
        H.tick();
      }
    };
    const A = walker(map, { seed: 21, zombies: 6 }), B = walker(map, { seed: 21, zombies: 6 });
    const fa = [], fb = [];
    A.w.onFrame((f) => fa.push(JSON.stringify(f))); B.w.onFrame((f) => fb.push(JSON.stringify(f)));
    script(A, 0, 900); script(B, 0, 900);
    ok(fa.length > 500 && fa.length === fb.length && fa.every((x, i) => x === fb[i]), `the same inputs at the same steps replay the same walk, frame for frame (${fa.length})`);
    // a save mid-walk, loaded into a fresh world (made as the broadcast makes one on a restart: not told it is a walk)
    const C = { w: new SimWorld({ map, seed: 999, start: T0 }) };
    C.w.loadState(decodeGraph(encodeGraph(A.w.saveState())));
    const sc = P.playerOf(C.w);
    ok(!!sc && sc.id === A.s.id && C.w.survivors.length === 1 && C.w.showMs === A.w.showMs && JSON.stringify(sc.player) === JSON.stringify(A.s.player), "a save made mid-walk comes back a walk: the same body, still driven, the stick where it was");
    const fc = []; fa.length = 0;
    C.w.onFrame((f) => fc.push(JSON.stringify(f)));
    C.s = sc; C.nav = C.w.nav; C.ticks = A.ticks; C.push = (mx, mz, run = false, crouch = false) => P.walkInput(C.w, mx, mz, run, crouch); C.tick = () => { C.w.tick(100); C.ticks++; };
    script(A, 900, 1300); script(C, 900, 1300);
    ok(fa.length > 200 && fa.length === fc.length && fa.every((x, i) => x === fc[i]), "…and carries on exactly as the world it was saved from does");
  }

  console.log("THE OBJECTIVES, BY HAND");
  {
    const O = OBJECTIVES[map];
    ok(!!O, `an objective walk is written for ${map} (the standard: every map a run can start on is walked end to end)`);
    if (O) {
      const H = walker(map, { clearDead: true });
      let failed = "";
      try { failed = O.walk(H); } catch (e) { failed = "threw: " + (e.stack ?? e.message).split("\n").slice(0, 2).join(" | "); }
      ok(failed === "", failed ? `every step can be done by hand — FAILED AT: ${failed} (${H.why ?? ""})` : `every step of ${map}'s objectives is done by hand, by inputs alone (${Math.round((H.w.t - T0) / 60_000)} min of show clock)`);
      for (const [c, name] of O.done(H)) ok(c, name);
      ok(H.w.obj.ending === O.ending, `the run ends "${O.ending}" (${H.w.obj.ending || "still running"})`);
      ok(H.offGrid === 0 && H.inShut === 0 && H.calls.choose === 0, "…never off the walk grid, never in a shut door, nothing chosen for the body on the way");
    }
  }
}

// ================================================================================================================
// OVER A REAL SERVER
console.log("\n==== the lever and the socket ====");
// ---- THE CODE REVIEW (Nov 14 2026), in process -------------------------------------------------------------------
console.log("THE CODE REVIEW'S FIXES, in process");
{
  // C-10: a screen that has just joined is shown the walk frame without taking the driver's note
  const H = walker("bunker");
  P.walkDo(H.w, "no-such-action");
  const peek = P.walkFrame(H.w, true), real = P.walkFrame(H.w), after = P.walkFrame(H.w);
  ok(!!peek && peek.note === undefined && typeof real?.note === "string" && real.note.length > 0 && after?.note === undefined,
    `a joiner's look at the walk frame leaves the note for the one driving ("${real?.note}"), who is told it once`);
  // C-5: only a leaf on hinges is offered to be shut (the AI shuts nothing else)
  let hinge = 0, steel = 0, staged = 0;
  for (const map of MAPS) {
    const G = walker(map), w = G.w, s = G.s, nav = G.nav;
    for (let di = 0; di < nav.doors.length; di++) {
      const D = nav.doors[di];
      if (!["door", "keycard", "keypad"].includes(D.kind)) continue;
      const st = w.fac.doors.get(D.id);
      if (!st || st.broken) continue;
      // stand on the walkable cell nearest the door's middle that is not in the doorway
      const dc = nav.doorCentre[di];
      let best = -1, bd = 1e9;
      for (let c = 0; c < nav.walk.length; c++) {
        if (!nav.walk[c] || nav.door[c] >= 0 || nav.floorOfCell(c) !== nav.floorOfCell(nav.cellAt(nav.rooms[nav.roomIdx.get(D.a)].floor, dc[0], dc[2]))) continue;
        const [x, , z] = nav.centre(c), d = Math.hypot(x - dc[0], z - dc[2]);
        if (d < bd) { bd = d; best = c; }
      }
      if (best < 0 || bd > 1.0) continue;
      const [x, , z] = nav.centre(best);
      const was = { open: st.open, locked: st.locked, x: s.x, z: s.z, cell: s.cell, room: s.room, floor: s.floor, y: s.y };
      st.open = true; st.locked = false;
      s.x = x; s.z = z; s.cell = best; s.room = nav.room[best]; s.floor = nav.floorOfCell(best); s.y = nav.yAt(best);
      const offered = P.walkActions(w).some((a) => a.id === "shut:" + D.id);
      staged++;
      if (D.kind === "door") { if (offered) hinge++; } else if (offered) steel++;
      st.open = was.open; st.locked = was.locked;
      Object.assign(s, { x: was.x, z: was.z, cell: was.cell, room: was.room, floor: was.floor, y: was.y });
    }
  }
  ok(staged > 10 && hinge > 5 && steel === 0, `the driven body is offered to shut a door on hinges (${hinge}) and never a card or code door's steel (${steel}; ${staged} doors stood at, every map)`);
  // C-12: the dead are capped
  const { DEAD_MAX } = require(dist("sim/world.js"));
  const Z = walker("bunker", { zombies: 60 });
  let made = 0;
  for (let i = 0; i < 12; i++) made += Z.w.spawnZombies(10);
  ok(Z.w.deadUp() === DEAD_MAX && Z.w.spawnZombies(10) === 0, `the spawn lever stops at ${DEAD_MAX} of the dead standing (${Z.w.deadUp()} after 120 asked for; ${made} made)`);
  ok(Z.w.setShowLength(360) === true && Z.w.setShowLength(361) === false, "the length lever goes to six hours, a walk's own length, and no further");
  // the daily summary is a real show's (the re-grade: a walk left going at nine sent one and spent the day's)
  const { dailyWanted, houseDate } = require(dist("daily.js"));
  const nine = Date.UTC(2026, 10, 14, 15, 30);   // 10:30 in New York, past the hour it goes out
  ok(dailyWanted({ running: true, test: false }, null, nine) === true && dailyWanted({ running: true, test: true }, null, nine) === false
    && dailyWanted({ running: false, test: false }, null, nine) === false && dailyWanted({ running: true, test: false }, houseDate(nine), nine) === false,
    "the clock sends the daily summary for a real show past nine, once, and never for a test run or a walk");
  // the fallen are capped too (the re-grade: the clear and spawn levers in turn made 4,886 bodies)
  const { CORPSES_MAX, BODIES_MAX } = require(dist("sim/world.js"));
  const K = walker("bunker", { zombies: 60 });
  let most = 0;
  for (let round = 0; round < 30; round++) {
    for (let i = 0; i < 8; i++) K.w.spawnZombies(10);
    K.w.killZombies();
    K.tick(12);
    most = Math.max(most, K.w.zombies.filter((z) => !z.alive && !z.gone).length);
  }
  const snapDead = K.w.snapshot().bodies.filter((b) => b.kind === "zombie").length;
  // ...and with DEAD_MAX standing, the tunnel sends no more (a six-hour walk gained 68 an hour)
  const T = walker("bunker", { zombies: 60 });
  const upT = () => T.w.zombies.filter((z) => z.alive && !z.gone).length;
  for (let i = 0; i < 12 && upT() < DEAD_MAX; i++) T.w.spawnZombies(10);
  const hold = () => { for (const z of T.w.zombies) if (z.alive) { z.state = "idle"; z.nextThink = T.w.t + 600_000; z.heldQuiet = T.w.t + 600_000; z.target = -1; z.hp = 99999; } };
  const full = upT(), turned0 = T.w.stats.arrivals?.deferred?.full ?? 0;
  for (let i = 0; i < 20; i++) { T.w.nextArrivalAt = T.w.t; hold(); T.w.tick(100); }
  ok(full === DEAD_MAX && upT() === DEAD_MAX && (T.w.stats.arrivals?.deferred?.full ?? 0) > turned0, `with ${DEAD_MAX} of the dead standing, the tunnel's turn comes and nobody more walks in (${full} to ${upT()}, turned away ${(T.w.stats.arrivals?.deferred?.full ?? 0) - turned0} times)`);
  ok(most <= CORPSES_MAX && snapDead <= CORPSES_MAX + DEAD_MAX && K.w.bodies.length <= BODIES_MAX, `thirty rounds of the spawn and clear levers leave at most ${CORPSES_MAX} of the fallen lying (${most} at the most; ${snapDead} of the dead in a snapshot; ${K.w.bodies.length} bodies ever made, the lever stopping at ${BODIES_MAX})`);
}

const { WebSocket } = require(path.join(ROOT, "node_modules", "ws"));
const PORT = 8616, BASE = `http://127.0.0.1:${PORT}`;
const KNOCKS = 60;   // the show socket's door, knocks a minute an address (dialled down from 120 so the check is quick)
const DATA_DIR = path.join(ROOT, "data", "survivorz-walk-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const ADMIN_PW = "Harness!Admin9xy";
let log = "";
const boot = async () => {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
    SURVIVORZ_COUNTDOWN_MS: "0", SURVIVORZ_SAVE_SIM_MS: "1000", SURVIVORZ_WALK_OVER_MS: "1500", SURVIVORZ_RECHECK_MS: "1000", SURVIVORZ_KNOCKS_PER_MIN: String(KNOCKS),
  };
  const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (d) => { log += d; });
  srv.stderr.on("data", (d) => { log += d; });
  let up = false;
  for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
  return { srv, up };
};
const stop = async (srv) => { const gone = new Promise((r) => srv.once("exit", r)); srv.kill("SIGINT"); await Promise.race([gone, sleep(5000)]); };
const api = async (method, url, token, body) => {
  const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const lever = (token, op, extra = {}) => api("POST", "/api/admin/survivorz/show", token, { op, ...extra });
const status = async (token) => (await api("GET", "/api/admin/survivorz/show", token)).body;
const watch = (token) => new Promise((resolve) => {
  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-survivorz?token=${encodeURIComponent(token)}`);
  const w = { ws, frames, closed: null, refused: null };
  ws.on("message", (d) => { try { frames.push({ at: Date.now(), f: JSON.parse(String(d)) }); } catch {} });
  ws.on("close", (code) => { w.closed = code; });
  ws.on("unexpected-response", (_req, res) => { w.refused = res.statusCode; resolve(w); });
  ws.on("error", () => { if (w.refused === null) { w.refused = -1; resolve(w); } });
  ws.on("open", () => resolve(w));
});
const of = (w, type, since = 0) => w.frames.filter((x) => x.f.type === type && x.at >= since).map((x) => x.f);
/** where a body is, as the socket has told it so far */
const whereIs = (w, id) => {
  let p = null;
  for (const { f } of w.frames) {
    if (f.type === "snap") { const b = f.bodies.find((x) => x.id === id); if (b) p = b.pos; }
    else if (f.type === "tick") { const b = f.b.find((x) => x.id === id); if (b) p = b.p; }
  }
  return p;
};
const say = (w, m) => w.ws.send(JSON.stringify(m));

let { srv, up } = await boot();
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
ok(up, "the server boots");
const admin = (await api("POST", "/api/login", null, { username: "admin", password: ADMIN_PW })).body?.token;
const member = (await api("POST", "/api/register", null, { username: "walkfan", password: "Sturdy!Passw0rd#9", displayName: "Fan", secret: "vault marmalade lantern quartz 47", acceptTerms: true })).body?.token;
ok(!!admin && !!member, "an admin and a member are signed in");

console.log("THE LEVER");
const other = MAPS.find((m) => m !== "bunker") ?? "bunker";
{
  ok((await lever(member, "walk", { map: "bunker" })).status === 403 && (await status(admin)).running === false, "a member is refused the walk lever, and nothing starts");
  ok((await lever(admin, "walk", { map: "atlantis" })).status === 400 && (await lever(admin, "walk", { map: "bunker", who: "nobody" })).status === 400 && (await lever(admin, "walk", { map: "bunker", zombies: 999 })).status === 400 && (await status(admin)).running === false,
    "a map that isn't one, a survivor who isn't one, a silly number of the dead: each refused 400, nothing started");
}
let aw = await watch(admin);
await sleep(300);
let you = "";
{
  const t0 = Date.now();
  const r = await lever(admin, "walk", { map: other, who: WALK_IN[1] ?? WALK_IN[0], zombies: 0, seed: 7 });
  const st = r.body;
  you = "s:" + (WALK_IN[1] ?? WALK_IN[0]);
  ok(r.status === 200 && st.running && st.walk === true && st.walker === you && st.test === true && st.runNo === null && st.onAir === false && st.map === other && st.countdown === 0 && JSON.stringify(st.cast) === JSON.stringify([you.slice(2)]),
    `the admin's press starts a walk on ${other}: a test run (never numbered, never on air) that says it is a walk, and whose (${st?.walker})`);
  ok(st.dials?.showMin >= 360, `its clock is ${st.dials?.showMin} minutes`);
  await sleep(700);
  const snap = of(aw, "snap", t0)[0], wf = of(aw, "walk", t0)[0];
  const order = aw.frames.filter((x) => x.at >= t0 && (x.f.type === "snap" || x.f.type === "walk")).map((x) => x.f.type);
  ok(!!snap && snap.map === other && snap.bodies.filter((b) => b.kind === "survivor").length === 1 && snap.bodies.some((b) => b.id === you), "the admin's socket, already open, gets the snapshot: one survivor, theirs");
  ok(!!wf && order[0] === "snap" && order[1] === "walk" && wf.you === you && Array.isArray(wf.actions) && wf.actions.every((a) => a.id && a.label && a.kind), `…and the walk frame right behind it (${wf?.actions.map((a) => a.id).join(", ")})`);
  const oa = (await api("GET", "/api/survivorz/onair", admin)).body, om = (await api("GET", "/api/survivorz/onair", member)).body;
  ok(oa.adminView === true && oa.walk === true && oa.test === true && om.onAir === false && om.adminView === false && !om.walk && om.map === null, "the Survivorz page is told a walk is on — the admin's alone; a member is told nothing is");
  const mw = await watch(member);
  ok(mw.refused === 403, "a member's watch socket is refused: the walk is private");
  const audit = (await api("GET", "/api/admin/audit", admin)).body;
  const rows = JSON.stringify(audit ?? "");
  ok(rows.includes("survivorz.walk") && rows.includes(other), "the press is audited, with the map and the survivor");
}

console.log("THE STICK");
{
  // a second admin tab joins mid-walk: snapshot, then the walk frame
  const b = await watch(admin);
  await sleep(400);
  const types = b.frames.map((x) => x.f.type).filter((t) => t === "snap" || t === "walk");
  ok(types[0] === "snap" && types[1] === "walk", "a socket that joins mid-walk gets the snapshot and then the walk frame");
  b.ws.close();
  // the stick: the body moves the way it is pushed (one of four ways is open wherever it stands)
  let moved = null;
  for (const [mx, mz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const p0 = whereIs(aw, you);
    for (let i = 0; i < 25; i++) { say(aw, { type: "walk.in", mx, mz }); await sleep(50); }
    const p1 = whereIs(aw, you);
    say(aw, { type: "walk.in", mx: 0, mz: 0 });
    await sleep(500);
    const along = (p1[0] - p0[0]) * mx + (p1[2] - p0[2]) * mz;
    if (along > 1) { moved = { mx, mz, along }; break; }
  }
  ok(!!moved, `walk.in from the admin's socket moves the body the way it is pushed (${moved ? moved.along.toFixed(1) + " m" : "it never moved"})`);
  const p2 = whereIs(aw, you); await sleep(600); const p3 = whereIs(aw, you);
  ok(Math.hypot(p3[0] - p2[0], p3[2] - p2[2]) < 0.2, "a zero push stands it still");
  // hostile input: not numbers, a vector far too long, not JSON, a binary frame, an unknown kind
  const t0 = Date.now(), q0 = whereIs(aw, you);
  aw.ws.send("{not json"); aw.ws.send(Buffer.from([1, 2, 3]), { binary: true });
  say(aw, { type: "walk.in", mx: "NaN", mz: null }); say(aw, { type: "walk.in", mx: Infinity, mz: 1 }); say(aw, { type: "walk.fly", up: 1 }); say(aw, { type: "walk.do", id: 42 }); say(aw, { type: "walk.do", id: "x".repeat(200) });
  await sleep(500);
  const q1 = whereIs(aw, you);
  ok(aw.closed === null && Math.hypot(q1[0] - q0[0], q1[2] - q0[2]) < 0.2 && (await status(admin)).running, "garbage on the socket (not JSON, a binary frame, a NaN, an unknown command, an id that isn't one) moves nothing and drops nothing");
  say(aw, { type: "walk.in", mx: 1e9, mz: 0 }); await sleep(900); const q2 = whereIs(aw, you); say(aw, { type: "walk.in", mx: 0, mz: 0 });
  ok(Math.hypot(q2[0] - q1[0], q2[2] - q1[2]) < 6, `a push a billion long is a push of one: no faster than a jog (${Math.hypot(q2[0] - q1[0], q2[2] - q1[2]).toFixed(1)} m in 0.9 s)`);
  // an action that isn't on the list: a note, once
  const t1 = Date.now();
  say(aw, { type: "walk.do", id: "task:fly-away" });
  await sleep(700);
  const notes = of(aw, "walk", t1).filter((f) => f.note);
  ok(notes.length === 1 && notes[0].note === "not from here", "walk.do with an id that isn't on the list is answered with one walk frame carrying a note");
  // an action that is: eat (out of the body's own pocket) — the walk frame shows the hands busy, then free
  const t2 = Date.now();
  say(aw, { type: "walk.do", id: "eat" });
  await sleep(1200);
  const busy = of(aw, "walk", t2).filter((f) => f.busy);
  ok(busy.length >= 2 && busy[0].busy.label === "eat something" && busy[busy.length - 1].busy.frac > busy[0].busy.frac && busy.every((f) => f.busy.frac >= 0 && f.busy.frac <= 1), `walk.do with one that is starts it: the walk frame carries what the hands are on and how far along (${busy.map((f) => f.busy.frac).join(", ")})`);
  const span = Date.now() - t2, sent = of(aw, "walk", t2).length;
  ok(sent <= Math.ceil(span / 200) + 2, `the walk frame goes out when it changes, at most about five a second (${sent} in ${span} ms)`);
  // a flood: 3,000 pushes at once — the server stands, and the body has not been flung anywhere
  const f0 = whereIs(aw, you);
  for (let i = 0; i < 3000; i++) say(aw, { type: "walk.in", mx: i % 2 ? 1 : -1, mz: 0 });
  say(aw, { type: "walk.stop" });
  await sleep(1200);
  const f1 = whereIs(aw, you);
  ok(aw.closed === null && (await fetch(BASE + "/health")).ok && Math.hypot(f1[0] - f0[0], f1[2] - f0[2]) < 3, "a flood of 3,000 pushes is counted out, not obeyed: the server stands and the body has gone nowhere much");
  await sleep(1600);
  say(aw, { type: "walk.in", mx: 0, mz: 0 });
}

console.log("A WALK GIVES WAY TO A WALK; ANY OTHER RUN IS DEAF TO THE STICK");
{
  const run0 = (await status(admin)).run;
  const r = await lever(admin, "walk", { map: "bunker", zombies: 0, seed: 3 });
  ok(r.status === 200 && r.body.walk && r.body.map === "bunker" && r.body.run !== run0 && r.body.walker === "s:" + WALK_IN[0], "pressing walk again (another map) replaces the walk: a new run, the first of the cast when nobody is named");
  const hist = (await api("GET", "/api/admin/survivorz/history", admin)).body?.runs ?? [];
  ok(hist.length === 0, "a walk is not kept in the run history");
  ok((await lever(admin, "stop")).status === 200 && (await status(admin)).walk === false, "stop ends it");
  // an ordinary test run: the stick does nothing, and there is no walk frame
  const t0 = Date.now();
  const t = await lever(admin, "test", { map: "bunker", seed: 5, zombies: 0 });
  await sleep(500);
  const snap = of(aw, "snap", t0)[0];
  const id = snap?.bodies.find((b) => b.kind === "survivor")?.id;
  for (let i = 0; i < 20; i++) { say(aw, { type: "walk.in", mx: 1, mz: 0 }); say(aw, { type: "walk.do", id: "eat" }); say(aw, { type: "walk.hit" }); await sleep(40); }
  ok(t.status === 200 && t.body.walk === false && t.body.walker === null && !!id && of(aw, "walk", t0).length === 0, "in a test run that isn't a walk the walk commands are dropped unread: no walk frame, no driven body");
  ok((await lever(admin, "walk", { map: "bunker" })).status === 409 && (await status(admin)).walk === false, "…and the walk lever is refused while another run is on (409): stop it first");
  await lever(admin, "stop");
  // a real show: the same
  const s2 = await lever(admin, "start", { map: "bunker", seed: 5 });
  ok(s2.status === 200 && (await lever(admin, "walk", { map: "bunker" })).status === 409 && (await status(admin)).test === false, "a real show is never replaced by a walk");
  await lever(admin, "stop");
}

console.log("A RESTART COMES BACK THE SAME WALK");
{
  const r = await lever(admin, "walk", { map: other, who: FIGHTER, zombies: 0, seed: 11 });
  const run = r.body.run;
  for (let i = 0; i < 20; i++) { say(aw, { type: "walk.in", mx: 0, mz: -1 }); await sleep(50); }
  say(aw, { type: "walk.in", mx: 0, mz: 0 });
  await sleep(1500);
  await lever(admin, "save");
  const before = whereIs(aw, "s:" + FIGHTER);
  aw.ws.close();
  srv.kill("SIGKILL"); await sleep(800);
  ({ srv, up } = await boot());
  const st = await status(admin);
  ok(up && st.running && st.walk === true && st.walker === "s:" + FIGHTER && st.run === run && st.test === true && st.map === other, "killed and booted again, the server resumes the same run — still a walk, the same body");
  aw = await watch(admin);
  await sleep(500);
  const snap = of(aw, "snap")[0], wf = of(aw, "walk")[0], here = snap?.bodies.find((b) => b.id === "s:" + FIGHTER)?.pos;
  ok(!!snap && !!wf && wf.you === "s:" + FIGHTER && !!here && Math.hypot(here[0] - before[0], here[2] - before[2]) < 4, "…where it was left, and the admin's socket gets the snapshot and the walk frame again");
  const p0 = whereIs(aw, wf.you);
  let went = 0;
  for (const [mx, mz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (let i = 0; i < 20; i++) { say(aw, { type: "walk.in", mx, mz }); await sleep(50); }
    const p1 = whereIs(aw, wf.you); went = Math.max(went, Math.hypot(p1[0] - p0[0], p1[2] - p0[2]));
    if (went > 1) break;
  }
  say(aw, { type: "walk.in", mx: 0, mz: 0 });
  ok(went > 1, "…and it still answers the stick");
  // reset (the panel's restart) keeps it a walk
  const rr = await lever(admin, "reset");
  ok(rr.status === 200 && rr.body.walk === true && rr.body.walker === "s:" + FIGHTER && rr.body.run !== run, "the restart lever starts the walk over: still a walk, the same survivor");
  await lever(admin, "stop");
}

// ---- A WALK CHANGES NOTHING THE NEXT REAL SHOW READS (the review of Nov 13 2026: a walk cleared the ON AIR switch a
// stopped show had left on, rewrote the map the next show starts on, and its stop turned a stream off) ----
{
  console.log("A WALK GIVES BACK WHAT IT BORROWED");
  await lever(admin, "start", { map: "bunker", countdown: 0 });
  await lever(admin, "onair");
  await lever(admin, "stop");
  const before = await status(admin), setup0 = (await api("GET", "/api/admin/survivorz/setup", admin)).body;
  const w1 = await lever(admin, "walk", { map: other, who: FIGHTER, zombies: 0 });
  const during = await status(admin);
  await lever(admin, "stop");
  const after = await status(admin), setup1 = (await api("GET", "/api/admin/survivorz/setup", admin)).body;
  ok(before.onAir === true && w1.status === 200 && during.onAir === false && after.onAir === true, `the ON AIR switch a stopped show left on is off during a walk and back on after it (${before.onAir}, ${during.onAir}, ${after.onAir})`);
  ok(setup0.defaults.map === "bunker" && setup1.defaults.map === "bunker", `the next show still starts on the last show's map, not the walked one (${setup1.defaults.map})`);
  ok(!!setup1.choicesByMap?.[other]?.starts?.length && !!setup1.choicesByMap?.bunker?.starts?.length, "the setup offers each map its own start rooms");
  const arr = await lever(admin, "walk", { map: other, who: [FIGHTER] });
  ok(arr.status === 400 && arr.body.error === "bad_who", "a survivor named as a list is refused, not guessed at");
  await lever(admin, "onair"); await lever(admin, "offair");
  // a stick let go while the run is paused is let go
  const w2 = await lever(admin, "walk", { map: "bunker", who: FIGHTER, zombies: 0 });
  await sleep(600);
  const me = "s:" + FIGHTER, p0 = whereIs(aw, me);
  let dir = [0, 0];
  for (const [mx, mz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (let i = 0; i < 12; i++) { say(aw, { type: "walk.in", mx, mz }); await sleep(50); }
    const p1 = whereIs(aw, me);
    if (p0 && p1 && Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.8) { dir = [mx, mz]; break; }
  }
  say(aw, { type: "walk.in", mx: dir[0], mz: dir[1] });
  await lever(admin, "pause");
  say(aw, { type: "walk.in", mx: 0, mz: 0 });
  await sleep(200);
  await lever(admin, "resume");
  await sleep(300);
  const a1 = whereIs(aw, me);
  await sleep(1500);
  const a2 = whereIs(aw, me);
  ok(w2.status === 200 && (dir[0] !== 0 || dir[1] !== 0) && !!a1 && !!a2 && Math.hypot(a2[0] - a1[0], a2[2] - a1[2]) < 0.6, `a stick let go while paused is let go: the body doesn't walk on at resume (${a1 && a2 ? Math.hypot(a2[0] - a1[0], a2[2] - a1[2]).toFixed(2) : "?"} m)`);
  // a walk whose save can't be read at boot is over: never a numbered real show in its place
  aw.ws.close();
  srv.kill("SIGKILL"); await sleep(800);
  {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    db.prepare("UPDATE app_kv SET value = ? WHERE key = 'survivorz_save'").run("not a save");
    db.close();
  }
  ({ srv, up } = await boot());
  const st = await status(admin);
  ok(up && st.running === false && st.runNo === null && st.countdown === 0, `a walk whose save can't be read is stopped at boot, not turned into a numbered show (running ${st.running}, run no ${st.runNo})`);
  aw = await watch(admin);
}

{
  console.log("THE CODE REVIEW'S SERVER FIXES (Nov 14 2026)");
  const show = (body) => api("POST", "/api/admin/survivorz/show", admin, body);
  // C-8: a lever's body is read as what it is
  const odd = [
    await show({ op: ["walk"], map: "bunker" }), await show({ op: "walk", map: ["bunker"] }), await show({ op: "test", map: "bunker", zombies: true }),
    await show({ op: "test", map: "bunker", zombies: [7] }), await show({ op: "test", map: "bunker", seed: "five" }), await show({ op: { toString: 1 } }),
    await show({ op: "test", map: { toString: 1 } }),
    await api("POST", "/api/admin/survivorz/body", admin, { op: { toString: 1 }, id: "s:dale" }),
    await api("POST", "/api/admin/survivorz/act", admin, { op: { toString: 1 } }),
    await api("POST", "/api/admin/survivorz/spawn", admin, { n: true }),
  ];
  ok(odd.every((r) => r.status === 400) && (await status(admin)).running === false, `a lever handed a list, a true or an object where a word or a number goes is refused 400, never run and never a 500 (${odd.map((r) => r.status).join(" ")})`);
  const s5 = await show({ op: "test", map: "bunker", seed: "5" });
  ok(s5.status === 200 && s5.body?.seed === 5, `a seed sent as "5" is seed 5, not a random one (${s5.body?.seed})`);
  await show({ op: "stop" });
  // (the re-grade: four that still read a list's members with String())
  const lineup0 = (await api("GET", "/api/admin/survivorz/lineup", admin)).body?.lineup;
  const odd2 = [
    await api("POST", "/api/admin/survivorz/lineup", admin, { starters: [{ toString: 1 }], bench: [], maxGroup: 1 }),
    await api("POST", "/api/admin/survivorz/lineup", admin, { starters: [[FIGHTER]], bench: [], maxGroup: 1 }),
    await show({ op: "test", map: "bunker", cast: [{ toString: 1 }] }), await show({ op: "test", map: "bunker", cast: [[FIGHTER]] }),
    await api("POST", "/api/admin/survivorz/newcomer", admin, { who: { toString: 1 } }),
    await show({ op: "test", map: "bunker", seed: 1e20 }),
    await api("POST", "/api/admin/survivorz/body", admin, { op: "infect", id: "s:" + FIGHTER, hours: [3] }),
  ];
  const lineup1 = (await api("GET", "/api/admin/survivorz/lineup", admin)).body?.lineup;
  ok(odd2.every((r) => r.status === 400) && JSON.stringify(lineup0) === JSON.stringify(lineup1) && (await status(admin)).running === false, `a list with a list or an object in it, a seed past 32 bits and hours that are a list are each refused 400 (${odd2.map((r) => r.status).join(" ")})`);

  // C-11: an ordinary test run gives ON AIR back, as a walk does
  await show({ op: "start", map: "bunker", countdown: 0 }); await lever(admin, "onair"); await show({ op: "stop" });
  const t1 = await show({ op: "test", map: other });
  const mid = await status(admin);
  await show({ op: "stop" });
  const end = await status(admin), setup = (await api("GET", "/api/admin/survivorz/setup", admin)).body;
  ok(t1.status === 200 && mid.onAir === false && end.onAir === true, `a test run takes the show off the air and gives it back when it is stopped (${mid.onAir}, ${end.onAir})`);
  ok(setup.defaults.map === other, `...and the map it ran on stays the panel's pick (${setup.defaults.map})`);
  // (the re-grade: OFF AIR pressed during a test run is the admin's last word)
  await lever(admin, "onair");
  await show({ op: "test", map: "bunker" });
  await lever(admin, "offair");
  await show({ op: "stop" });
  const off = await status(admin);
  ok(off.onAir === false, `OFF AIR pressed during a test run stays off when the run is stopped (${off.onAir})`);
  await lever(admin, "onair");

  // C-1 and C-3: a member's seats, and what signing out does to them
  await show({ op: "start", map: "bunker", countdown: 0 });
  const fan = (await api("POST", "/api/login", null, { username: "walkfan", password: "Sturdy!Passw0rd#9" })).body?.token;
  const seats = [await watch(fan), await watch(fan), await watch(fan)];
  const fourth = await watch(fan);
  ok(seats.every((w) => w.refused === null) && fourth.refused === 429, `one account holds three seats and is refused a fourth (429: ${fourth.refused})`);
  await sleep(300);
  await api("POST", "/api/logout", fan);
  await sleep(700);
  ok(seats.every((w) => w.closed !== null), `signing out closes that session's show sockets (${seats.map((w) => w.closed).join(" ")})`);
  const again = await watch(fan);
  ok(again.refused !== null && again.refused !== 429, `...and the dead session opens no new one (${again.refused})`);
  // (the re-grade: the other ways a session ends. A ban is told on the bus; a session's row can simply go, as the
  // age prune takes it, with nobody told: every socket's session is looked at again on a clock)
  const fan2 = (await api("POST", "/api/login", null, { username: "walkfan", password: "Sturdy!Passw0rd#9" })).body?.token;
  const s2 = await watch(fan2);
  await sleep(300);
  {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    db.prepare("DELETE FROM sessions WHERE token = ?").run(fan2);
    db.close();
  }
  await sleep(2500);
  ok(s2.refused === null && s2.closed !== null, `a session whose row has gone, with nobody told, loses its show socket within the clock's turn (${s2.closed})`);
  const fan3 = (await api("POST", "/api/login", null, { username: "walkfan", password: "Sturdy!Passw0rd#9" })).body?.token;
  const s3 = await watch(fan3);
  await sleep(300);
  const fanId = (await api("GET", "/api/me", fan3)).body?.user?.id;
  const ban = await api("POST", `/api/admin/users/${fanId}/lock`, admin, { locked: true });
  await sleep(500);
  ok(ban.status === 200 && s3.refused === null && s3.closed !== null, `banning an account closes its show socket at once (${s3.closed})`);
  await api("POST", `/api/admin/users/${fanId}/lock`, admin, { locked: false });
  await lever(admin, "offair");
  await show({ op: "stop" });

  // C-9: a second admin socket's flood does not let go of the first one's push
  const w3 = await show({ op: "walk", map: "bunker", who: FIGHTER, zombies: 0 });
  await sleep(600);
  const me = "s:" + FIGHTER;
  let dir = null;
  for (const [mx, mz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const p0 = whereIs(aw, me);
    for (let i = 0; i < 12; i++) { say(aw, { type: "walk.in", mx, mz }); await sleep(50); }
    const p1 = whereIs(aw, me);
    if (p0 && p1 && Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.8) { dir = [mx, mz]; break; }
  }
  say(aw, { type: "walk.in", mx: dir?.[0] ?? 0, mz: dir?.[1] ?? 0 });
  await sleep(1200);
  // (back the way they came: that much floor is known to be clear)
  say(aw, { type: "walk.in", mx: -(dir?.[0] ?? 0), mz: -(dir?.[1] ?? 0) });
  const bw = await watch(admin);
  for (let i = 0; i < 400; i++) say(bw, { type: "walk.nothing", i });
  await sleep(300);
  const q0 = whereIs(aw, me);
  await sleep(1300);
  const q1 = whereIs(aw, me);
  say(aw, { type: "walk.in", mx: 0, mz: 0 });
  bw.ws.close();
  ok(w3.status === 200 && !!dir && !!q0 && !!q1 && Math.hypot(q1[0] - q0[0], q1[2] - q0[2]) > 0.8, `another admin socket's flood of junk does not stop the push the first one is holding (${q0 && q1 ? Math.hypot(q1[0] - q0[0], q1[2] - q0[2]).toFixed(2) : "?"} m walked through it)`);

  // C-2: a restart lets go of the stick
  say(aw, { type: "walk.in", mx: dir?.[0] ?? 0, mz: dir?.[1] ?? 0 });
  await sleep(1600);          // (a save a second: the push is in it)
  aw.ws.close();
  srv.kill("SIGKILL"); await sleep(800);
  ({ srv, up } = await boot());
  aw = await watch(admin);
  await sleep(500);
  const r0 = whereIs(aw, me);
  await sleep(1500);
  const r1 = whereIs(aw, me);
  ok(up && (await status(admin)).running === true && !!r0 && !!r1 && Math.hypot(r1[0] - r0[0], r1[2] - r0[2]) < 0.3, `a walk that comes back after a crash stands still: the push that was held is let go (${r0 && r1 ? Math.hypot(r1[0] - r0[0], r1[2] - r0[2]).toFixed(2) : "?"} m)`);

  // C-11: a walk whose body is dead is put away, and a show can be started
  const k = await api("POST", "/api/admin/survivorz/body", admin, { op: "kill", id: me });
  await sleep(4000);
  const gone = await status(admin);
  const next = await show({ op: "test", map: "bunker" });
  ok(k.status === 200 && gone.running === false && next.status === 200, `a walk whose body has died is put away by itself, and the next run starts (running ${gone.running}, start ${next.status})`);
  await show({ op: "stop" });
  // (the re-grade: ...paused or not)
  await show({ op: "walk", map: "bunker", who: FIGHTER, zombies: 0 });
  await sleep(400);
  await lever(admin, "pause");
  const k2 = await api("POST", "/api/admin/survivorz/body", admin, { op: "kill", id: me });
  await sleep(4000);
  const gone2 = await status(admin);
  ok(k2.status === 200 && gone2.running === false, `...and so is one that was paused over its dead body (running ${gone2.running})`);
  if (gone2.running) await show({ op: "stop" });

  // (the re-grade's small ones) THE SPAWN LEVER wants a body that says how many
  await show({ op: "test", map: "bunker" });
  await sleep(400);
  const raw = (body) => fetch(BASE + "/api/admin/survivorz/spawn", { method: "POST", headers: { authorization: "Bearer " + admin, "content-type": "application/json" }, body }).then((r) => r.status);
  const sp = [await raw("null"), await raw("[3]"), await raw("3"), await raw(undefined)];
  const good = await api("POST", "/api/admin/survivorz/spawn", admin, { n: 2 });
  ok(sp.every((x) => x === 400) && good.status === 200 && good.body?.made === 2, `the spawn lever refuses a body that is null, a list, a bare number or missing (${sp.join(" ")}) and still takes { n: 2 } (${good.status}, ${good.body?.made} made)`);
  await show({ op: "stop" });

  // THE DOOR IS BUDGETED BY ADDRESS: knocks with no session stop being looked up
  let first = 0, unauth = 0;
  for (let i = 1; i <= KNOCKS * 2 + 5 && !first; i++) { const k = await watch("no-such-session"); if (k.refused === 429) first = i; else if (k.refused === 401) unauth++; try { k.ws.terminate(); } catch {} }
  const shut = await watch(admin);
  ok(first > 0 && first <= KNOCKS * 2 + 1 && unauth === first - 1 && shut.refused === 429, `the show socket's door answers 401 to a knock with no session and 429 once an address has knocked ${KNOCKS} times in a minute (the ${first}th knock; the admin's own next: ${shut.refused})`);
}

aw.ws.close();
await stop(srv);
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\n${n - bad}/${n} passed`);
if (bad) { console.log(log.split("\n").slice(-20).join("\n")); process.exit(1); }
process.exit(0);
