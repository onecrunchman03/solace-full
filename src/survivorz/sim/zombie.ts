// SOLACE SURVIVORZ — THE DEAD (SURVIVORZ.md §9), in game code.
//
// States: idle (standing, swaying — how most start) · wander · investigate (walk to a sound or a
// sighting, then search the spot 20–40 s) · chase · attack · bang (a door between it and its prey) ·
// feed (on a body, distracted until someone comes close).
// SENSES: sight — a cone out to the kind's range, shorter in the dark, a lit torch seen much further,
// walls and shut doors in the way; hearing — the noise distances (§8), halved through a wall; the
// ALARM — one that notices moans and draws every zombie within ~15 m.
// LOSING YOU: out of sight it goes to where it last saw you and searches; it never homes in on where
// you actually went (the Backrooms rule) — breaking line of sight and keeping quiet is an escape.
// It never enters a safe room; at a safe room's door it bangs a while and gives up.
import { feedPlaces, LIE } from "./lie";
import { Nav, roomOfNode, floorOfNode } from "./nav";
import { type SimWorld, type Survivor, type Zombie, d2, pos } from "./world";
import {
  ALARM_M, SEARCH_MS, DARK_SIGHT, TORCH_SEEN, CROUCH_SEEN, NEAR_SENSE, SAFE_BANG_MS, RUNNER_BURST_MS, RUNNER_REST_MS,
  RUNNER_TROT, DOOR_HIT_SCALE, MOVE_NOISE, GRAB_BITE_MS, SCRATCH, FEED_BITE_MS, COMBAT,
} from "./tables";
import { SKILL_FX } from "./tables";
import { skill } from "./goals";

const ATTACK_CD: Record<string, number> = { shambler: 1700, runner: 1300, crawler: 1900, experiment: 1100 };
export const ATTACK_R = 1.0;
/** CONTACT (Nov 2026 — Josh: "zombies and survivors fighting each other and hurting without being next to
 *  each other"): where the hands really are. A grab pulls the zombie in to GRAB_D from its victim, at most
 *  HOLD_PULL_M a tick (closer than the 0.6 the dead keep from the living: separate() lets a grabber through),
 *  so the hold's hands are on the body. A swipe is NOT stepped in: it already lands inside ATTACK_R (an arm
 *  and a lunge), and stepping the dead in on every swipe was measured to more than double the deaths (8 seeds,
 *  21 to 11 survivors left): it took away the room the living fight in. */
const FEED_D = 0.75;
/** A KNEELING PLACE BESIDE THE BODY (Nov 2026: the dead feeding on one body stood ON it and inside each other). A
 *  body lying dead has its head ~0.7 m behind its root and its feet ~0.85 m ahead, along its heading (measured on
 *  the show's own bodies), so feeders kneel off the line of it: two at the torso, one either side, then two at the
 *  legs; any more wait a step further out. [side, along] in metres, side to the body's right. */
function feedSlot(w: SimWorld, z: Zombie, s: Survivor): { x: number; z: number; tx: number; tz: number } {
  let k = 0;
  for (const o of w.zombies) if (o !== z && o.alive && o.state === "feed" && o.target === s.i && o.i < z.i) k++;
  // THE MOUTH ON THE BODY, ALONG IT AS IT LIES (sim/lie.ts feedPlaces — the same places the show snaps feeders
  // to): the chest, the hips, the thighs, the shins, from either side; only places a body can stand in (one that
  // fell against a wall or a desk loses those inside it); the k-th of those, so each feeder has its own
  // (never in a doorway: a feeder knelt in the blast door's opening was shut inside it when the crank finished)
  // (one propped up on their hands — down, or dead where they went down — is eaten at the legs: lie.ts)
  const places = feedPlaces(s, s.lie === LIE.fall);
  const open = places.filter((p) => { const c = w.nav.cellAt(s.floor, p.x, p.z); return w.canStand(z, c) && w.nav.door[c] < 0; });
  const p = open.length ? open[k % open.length] : places[0];
  // (it faces across the body: the point it looks at is a metre ahead of where it kneels)
  return { x: p.x, z: p.z, tx: p.x + Math.sin(p.h), tz: p.z + Math.cos(p.h) };
}
export const GRAB_D = 0.55, HOLD_PULL_M = 0.25;
/** step `b` toward `o` until they're `want` apart, at most `max` metres this time (walls respected) */
function closeTo(w: SimWorld, b: Zombie, o: Survivor, want: number, max: number): void {
  const d = Math.sqrt(d2(o, b));
  if (d <= want + 0.02 || d < 1e-3) return;
  const k = Math.min(max, d - want) / d;
  w.stepTo(b, b.x + (o.x - b.x) * k, b.z + (o.z - b.z) * k);
}

/** Run every zombie's senses whose turn it is (staggered; near prey ~3×/s, far away every 1.5 s). */
export function zombieSenseAll(w: SimWorld): void {
  const t = w.t;
  for (const z of w.zombies) {
    if (!z.alive || z.lying || t < z.nextSense) continue;
    const near = preyNear(w, z, 45);
    z.nextSense = t + (near ? 300 : 1500);
    if (!near) { z.noiseSeen = w.lastNoiseId; continue; }
    sense(w, z);
  }
}

/** how near somebody on their feet has to come to take one of the dead off a body it is feeding on, metres */
const FEED_BREAK_M = 3;

function preyNear(w: SimWorld, z: Zombie, r: number): boolean {
  for (const s of w.survivors) if (s.alive && s.floor === z.floor && d2(s, z) < r * r) return true;
  return false;
}

function sense(w: SimWorld, z: Zombie): void {
  const t = w.t;
  if (z.stagger > t) return;
  const dark = w.isDark(z);
  // locked in (the quarantine block, the deep's service door): while that door stands shut and whole
  // it hears nothing it would break out for; only a survivor it can SEE (the door opened) sets it off
  if (z.confined >= 0 && !w.doorOpenIdx(z.confined)) { /* still locked in */ } else z.confined = -1;
  const quiet = (z.heldQuiet > t && (z.state === "idle" || z.state === "wander")) || z.confined >= 0;
  // ---- sight ----
  let seen: Survivor | null = null, seenD = Infinity;
  let downSeen: Survivor | null = null, downD = Infinity;
  let heard: { x: number; z: number; d: number } | null = null;
  for (const s of w.survivors) {
    // a sleeper in a bed is out of sight — but not of one standing in that same room
    if (!s.alive || s.escaped || s.floor !== z.floor || s.link || (s.onBed && w.nav.room[z.cell] !== s.room)) continue;
    if (s.room >= 0 && w.nav.rooms[s.room].kind === "safe" && s.mode !== "down") {
      // a survivor inside a safe room can be seen through an open door, but it does it no good
    }
    const dd = d2(s, z);
    if (dd > 40 * 40) continue;
    const d = Math.sqrt(dd);
    // (Stealth: harder to spot until it's already after them — SKILL_FX; exactly 1 at Stealth 0)
    const hunting = z.state === "chase" || z.state === "attack";
    const sly = hunting ? 1 : Math.max(0.3, 1 - SKILL_FX.stealth * skill(s, "stealth"));
    let range = z.k.sight * (dark ? DARK_SIGHT : 1) * sly;
    if (s.gait === "crouch" || s.mode === "hide") range *= CROUCH_SEEN;
    if (s.torch) range = Math.max(range, Math.min(TORCH_SEEN, z.k.sight * 1.6));
    let canSee = false;
    if (d <= NEAR_SENSE) canSee = true;
    else if (d <= range) {
      const a = Math.atan2(s.x - z.x, s.z - z.z);
      let da = Math.abs(a - z.h) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da <= z.k.cone || z.state === "chase" || z.state === "attack") canSee = true;
    }
    const los = (canSee || d < 20) ? w.nav.sees(z.floor, z.x, z.z, s.x, s.z, w.doorOpenIdx) : false;
    if (canSee && los && (!quiet || d < 6)) {
      if (s.mode === "down") { if (d < downD) { downD = d; downSeen = s; } }
      else if (d < seenD) { seenD = d; seen = s; }
      continue;
    }
    // ---- hearing their movement ----
    const n = (s.gait === "still" || s.gait === "crouch" ? 0 : MOVE_NOISE[s.gait]) * z.k.hear * (los ? 1 : 0.5) * sly;
    if (n > 0 && d <= n && !quiet && (!heard || d < heard.d)) heard = { x: s.x, z: s.z, d };
  }
  // ---- noises ----
  if (!quiet) {
    for (let i = w.noises.length - 1; i >= 0; i--) {
      const n = w.noises[i];
      if (n.id <= z.noiseSeen) break;
      if (n.floor !== z.floor) continue;
      const d = Math.hypot(n.x - z.x, n.z - z.z);
      if (d > n.r * z.k.hear) continue;
      const los = d < n.r * z.k.hear * 0.5 || w.nav.sees(z.floor, z.x, z.z, n.x, n.z, w.doorOpenIdx);
      if (!los && d > n.r * z.k.hear * 0.5) continue;
      if (!heard || d < heard.d) heard = { x: n.x, z: n.z, d };
    }
  }
  z.noiseSeen = w.lastNoiseId;
  // SOMEBODY ON THE FLOOR AND SOMEBODY ON THEIR FEET (Nov 14 2026): the nearest one seen was taken, whoever it was.
  // One of the dead feeding on a body with a friend standing two metres off went for the friend (feedStep: anyone
  // within FEED_BREAK_M), saw the body nearer (here), went back to it, went for the friend: three changes of mind a
  // second, for as long as the friend stood there — and the friend's own nerve flipped with it (456 survivor-minutes
  // of it over 40 mansion shows). One rule in both places now: the body on the floor is what it wants unless
  // somebody on their feet is nearer than it, or inside FEED_BREAK_M.
  if (downSeen && (!seen || (downD < seenD && seenD >= FEED_BREAK_M))) { seen = downSeen; seenD = downD; }

  if (seen) {
    const wasHunting = z.state === "chase" || z.state === "attack";
    if (z.state === "feed" && z.target >= 0 && (seenD > FEED_BREAK_M || seen.i === z.target)) { /* distracted until someone comes close */ return; }
    if (z.state === "bang" && z.target === seen.i) { /* it knows; it's working the door */ }
    else { z.state = "chase"; z.path = null; }
    z.target = seen.i; z.lx = seen.x; z.lz = seen.z; z.lf = seen.floor; z.lastSeen = t;
    if (!wasHunting && t - z.alertedAt > 20_000) {
      z.alertedAt = t;
      z.why = "alert";
      w.ev(z.zkind === "experiment" ? "experiment.alert" : "zombie.alert", { by: z.id, victim: seen.id, at: pos(z) });
      w.noise(z.x, z.z, z.floor, 12, -1, "moan");
      // the alarm spreads
      for (const o of w.zombies) {
        if (o === z || !o.alive || o.floor !== z.floor) continue;
        if (o.state === "chase" || o.state === "attack" || o.state === "feed" || o.state === "bang" || o.confined >= 0) continue;
        if (d2(o, z) > ALARM_M * ALARM_M) continue;
        o.state = "investigate"; o.lx = seen.x; o.lz = seen.z; o.lf = seen.floor; o.searchUntil = 0; o.path = null; o.why = "alarm";
      }
    }
    return;
  }
  if (z.state === "chase" && t - z.lastSeen > 1500) {
    // lost them: to where they were last seen, then search there
    z.state = "investigate"; z.searchUntil = 0; z.path = null; z.why = "lost them";
  }
  if (heard && (z.state === "idle" || z.state === "wander" || z.state === "investigate")) {
    if (z.state !== "investigate" || Math.hypot(heard.x - z.lx, heard.z - z.lz) > 3) {
      z.state = "investigate"; z.lx = heard.x; z.lz = heard.z; z.lf = z.floor; z.searchUntil = 0; z.path = null; z.why = "heard";
    }
  }
}

// ---- the step ---------------------------------------------------------------------------------------------
export function zombieStep(w: SimWorld, z: Zombie, dt: number): void {
  const t = w.t;
  // (a chain holds whatever else is happening to it: shoved, staggered, with somebody in its hands)
  if (z.leash && !z.link) {
    const d = Math.hypot(z.x - z.leash[0], z.z - z.leash[1]);
    if (d > z.leash[2] + 0.05) w.stepTo(z, z.leash[0] + (z.x - z.leash[0]) / d * z.leash[2], z.leash[1] + (z.z - z.leash[1]) / d * z.leash[2]);
  }
  // ("can't get to them" is about the chase it was planned for: it does not outlive it)
  if (z.walled && z.state !== "chase" && z.state !== "attack") z.walled = false;
  // lying on the floor until somebody comes near (world.risers)
  if (z.lying) { z.pose = "z-dead"; z.gait = "still"; return; }
  if (z.stagger > t) { z.pose = "z-stagger"; z.gait = "still"; return; }
  if (z.openDoor >= 0) {
    if (t < z.busyUntil) return;
    const d = z.openDoor; z.openDoor = -1;
    w.facEv(w.fac.open(z.actor, w.nav.doors[d].id, w.sideRoom(z, d)), z.id);
  }
  if (z.busyUntil > t) return;
  if (z.grabbing >= 0) { holdStep(w, z); return; }
  // ON A CHAIN (Glenridge's cell, the review's B-6: "chained" was a word nothing read, and it walked out of the
  // cell in the first two minutes of every show). At the chain's end, wanting to be past it, it stands and strains;
  // whoever comes inside the chain's reach it goes for as any of them would.
  if (z.leash && !z.link) {
    const ax = z.leash[0], az = z.leash[1], r = z.leash[2], d = Math.hypot(z.x - ax, z.z - az);
    const s = z.target >= 0 ? (w.bodies[z.target] as Survivor | undefined) : undefined;
    const hunting = (z.state === "chase" || z.state === "attack") && !!s && s.alive;
    if (d > r) {
      // past its reach (a wander, a shove): the chain brings it up short
      w.stepTo(z, z.x - (z.x - ax) / d * Math.min(0.12, d - r + 0.02), z.z - (z.z - az) / d * Math.min(0.12, d - r + 0.02));
      z.path = null; z.gait = "still"; z.pose = "z-idle";
      if (!hunting) { z.state = "idle"; z.nextThink = t + 4000; }
      return;
    }
    if (d >= r - 0.15 && z.path) {
      // at the chain's end with somewhere to go that is past it
      const P = z.path, n = P.length / 4, gx = hunting ? s!.x : P[(n - 1) * 4], gz = hunting ? s!.z : P[(n - 1) * 4 + 1];
      if (Math.hypot(gx - ax, gz - az) > r) {
        z.path = null; z.gait = "still"; z.pose = "z-idle"; z.h = Math.atan2(gx - z.x, gz - z.z);
        // (the same test as any of them: not at somebody on a stair, not through the bars' wall. The basement
        // stair's first step is inside the chain and an arm, and the one on it was held there)
        if (hunting && !s!.link && Math.sqrt(d2(s!, z)) <= ATTACK_R && reachable(w, s!, z)
          && w.nav.segLine(z.floor, z.x, z.z, s!.x, s!.z, (c) => w.nav.door[c] < 0 || w.doorOpenIdx(w.nav.door[c]))) attack(w, z, s!);
        else if (!hunting) { z.state = "idle"; z.nextThink = t + 4000; }
        return;
      }
    }
  }
  switch (z.state) {
    case "idle": idleStep(w, z); break;
    case "wander": wanderStep(w, z, dt); break;
    case "investigate": investigateStep(w, z, dt); break;
    case "chase": case "attack": chaseStep(w, z, dt); break;
    case "bang": bangStep(w, z); break;
    case "feed": feedStep(w, z, dt); break;
  }
}

const restPose = (z: Zombie) => (z.zkind === "crawler" ? "z-crawl" : "z-idle") as Zombie["pose"];
const movePose = (z: Zombie, fast: boolean) => (z.zkind === "crawler" ? "z-crawl" : fast ? "z-chase" : "z-wander") as Zombie["pose"];

function idleStep(w: SimWorld, z: Zombie): void {
  z.pose = restPose(z); z.gait = "still";
  if (w.t < z.nextThink) return;
  z.nextThink = w.t + w.rng.range(6000, 30_000);
  // an ambient groan, only where someone could hear it
  if (w.t >= z.nextIdleSound && preyNear(w, z, 18) && w.rng.chance(0.25)) {
    z.nextIdleSound = w.t + 25_000;
    w.ev(z.zkind === "experiment" ? "experiment.idle" : "zombie.idle", { by: z.id, at: pos(z) });
  }
  if (z.heldQuiet > w.t) return;
  // the chief wanders his floor; most of the dead stand where they are
  if (w.rng.chance(z.carriesCard ? 0.8 : 0.35)) startWander(w, z);
}

function startWander(w: SimWorld, z: Zombie): void {
  // somewhere in this room, now and then the next room over (through what it can pass)
  let room = z.room, floor = z.floor;
  if (w.rng.chance(0.3)) {
    const node = w.nav.nodeOfCell(z.cell);
    const opts = node >= 0 ? w.nav.at[node].filter((p) => p.kind === "door" && (p.door < 0 || w.zombieGate(z)(p.door) === 1)) : [];
    if (opts.length) {
      const p = w.rng.pick(opts);
      const other = p.na === node ? p.nb : p.na;
      room = roomOfNode(other); floor = floorOfNode(other);
    }
  }
  if (room < 0 || w.nav.rooms[room].kind === "safe") return;
  const c = w.nav.cellInRoom(room, floor, w.rng.next(), w.rng.next());
  if (c < 0) return;
  const p = w.plan(z, c);
  if (!p || !p.reached) return;
  z.path = p.pts; z.pi = 0; z.state = "wander"; z.why = "";
}

function wanderStep(w: SimWorld, z: Zombie, dt: number): void {
  if (!z.path) { z.state = "idle"; z.nextThink = w.t + w.rng.range(5000, 25_000); return; }
  const r = go(w, z, z.k.amble, dt, false);
  if (r === "arrived" || r === "stuck" || r === "door") { z.path = null; z.state = "idle"; z.nextThink = w.t + w.rng.range(5000, 25_000); }
}

function investigateStep(w: SimWorld, z: Zombie, dt: number): void {
  const t = w.t;
  if (z.searchUntil && t >= z.searchUntil) { z.state = "idle"; z.searchUntil = 0; z.path = null; z.nextThink = t + w.rng.range(3000, 15_000); z.why = ""; return; }
  if (!z.path) {
    if (z.searchUntil) {
      // searching the spot: small loops round it
      if (t < z.nextThink) { z.pose = restPose(z); z.gait = "still"; return; }
      z.nextThink = t + w.rng.range(3000, 7000);
      const a = w.rng.next() * Math.PI * 2, r = w.rng.range(1.5, 6);
      const c = w.nav.cellAt(z.lf, z.lx + Math.cos(a) * r, z.lz + Math.sin(a) * r);
      if (c >= 0 && w.canStand(z, c)) { const p = w.plan(z, c); if (p && p.reached) { z.path = p.pts; z.pi = 0; } }
      return;
    }
    const goal = w.nav.cellAt(z.lf, z.lx, z.lz);
    const k = goal >= 0 && w.nav.isWalk(goal) ? goal : w.nav.nearestWalk(goal >= 0 ? goal : z.cell);
    const p = k >= 0 ? w.plan(z, k, 60) : null;
    if (!p) { z.searchUntil = t + w.rng.range(SEARCH_MS[0], SEARCH_MS[1]); return; }
    z.path = p.pts; z.pi = 0; z.bangDoor = p.reached ? -1 : p.blockedDoor;
  }
  const r = go(w, z, z.zkind === "runner" ? RUNNER_TROT : z.k.amble * 1.6, dt, false);
  if (r === "door") return startBang(w, z, nextDoor(w, z));
  if (r === "arrived" || r === "stuck") {
    z.path = null;
    if (z.bangDoor >= 0 && r === "arrived") { startBang(w, z, z.bangDoor); return; }
    if (!z.searchUntil) z.searchUntil = t + w.rng.range(SEARCH_MS[0], SEARCH_MS[1]);
  }
}

function chaseStep(w: SimWorld, z: Zombie, dt: number): void {
  const t = w.t;
  const s = w.bodies[z.target] as Survivor | undefined;
  // a body to feed on — not where somebody turned (they got up) or escaped (they left): nothing lies there
  if (!s || !s.alive || s.escaped) { z.state = s && !s.turned && !s.escaped ? "feed" : "idle"; z.feedUntil = t + w.rng.range(20_000, 50_000); z.path = null; return; }
  if (s.mode === "down") { z.state = "feed"; z.path = null; return; }
  const d = s.floor === z.floor ? Math.sqrt(d2(s, z)) : Infinity;
  // (not from half-way through a window or up a stair: it attacked before it moved, so it never came off the sill,
  // and the survivors — who don't count one that is climbing — were hit by something they never saw. The review's A-1)
  // (...nor AT somebody on a stair, who is where a clock says and not where they stand: held there, they were put
  // metres on, in one step, when let go. Nor through a wall or a shut door: a metre on the plan was all that was
  // asked, and the one struck had not counted it as near. The re-grade's A-2.)
  if (!z.link && !s.link && d <= ATTACK_R && reachable(w, s, z)
    && w.nav.segLine(z.floor, z.x, z.z, s.x, s.z, (c) => w.nav.door[c] < 0 || w.doorOpenIdx(w.nav.door[c]))) { attack(w, z, s); return; }
  z.state = "chase";
  // THE HUNT BREATHES (Oct 31 2026): a ragged pant now and then while it runs someone down, only near the
  // one it's after (the cue's "zombie.chase") — evQuiet: it draws no dice, so the run's numbers don't move
  // (once every 6.5 s a zombie, off the clock — no state, so the idle groan's timer and its dice are untouched)
  if (z.zkind !== "experiment" && d < 14 && (t + z.i * 937) % 6500 < w.stepMs) {
    w.evQuiet("zombie.chase", Math.imul(z.i + 1, 0x9e3779b1) ^ t, { by: z.id, victim: s.id, at: pos(z) });
  }
  // runner: bursts, and the lunge from 3–4 m
  let speed = z.k.speed;
  if (z.zkind === "runner") {
    // bursts of RUNNER_BURST_MS, a trot for RUNNER_REST_MS between them
    if (t >= z.burstUntil + RUNNER_REST_MS) z.burstUntil = t + RUNNER_BURST_MS;
    if (t >= z.burstUntil) speed = RUNNER_TROT;
    if (!z.link && d > 2.5 && d < 3.8 && t < z.burstUntil && t >= z.attackCd && reachable(w, s, z) && w.nav.sees(z.floor, z.x, z.z, s.x, s.z, w.doorOpenIdx)
      // (and floor to cross: it grabbed through glass and walls from three metres off — the review's A-2)
      && w.nav.segLine(z.floor, z.x, z.z, s.x, s.z, (c) => w.nav.door[c] < 0 || w.doorOpenIdx(w.nav.door[c]))) {
      z.attackCd = t + 4000;
      lunge(w, z, s);
      return;
    }
  }
  // chase the last place it SAW them; seeing them updates it (sense())
  if (!z.path || (t % 600) < dt) {
    const goal = w.nav.cellAt(z.lf, z.lx, z.lz);
    const k = goal >= 0 && w.nav.isWalk(goal) ? goal : w.nav.nearestWalk(goal >= 0 ? goal : z.cell);
    const p = k >= 0 ? w.plan(z, k, 40) : null;
    if (!p) { z.state = "investigate"; z.searchUntil = 0; return; }
    z.path = p.pts; z.pi = 0; z.bangDoor = p.reached ? -1 : p.blockedDoor;
    // (it can see them and can't get to them — glass, a boarded window, a locked door: survivor.ts scan)
    z.walled = !p.reached;
  }
  const r = go(w, z, speed, dt, true);
  if (r === "door") return startBang(w, z, nextDoor(w, z));
  if (r === "arrived" || r === "stuck") {
    z.path = null;
    if (z.bangDoor >= 0 && r === "arrived") startBang(w, z, z.bangDoor);
  }
}

/** Walk the path at a speed; an experiment opens the unlocked doors it meets. */
function go(w: SimWorld, z: Zombie, speed: number, dt: number, fast: boolean): "moving" | "arrived" | "door" | "stuck" {
  const r = w.walk(z, speed, dt);
  if (r === "door") {
    const d = nextDoor(w, z);
    if (d >= 0 && w.fac.canPass(z.actor, w.nav.doors[d].id).ok) {
      z.openDoor = d; z.busyUntil = w.t + 900; z.pose = "z-bang"; z.gait = "still";
      return "moving";
    }
  }
  z.gait = r === "moving" ? (fast ? "jog" : "walk") : "still";
  z.pose = r === "moving" ? movePose(z, fast) : restPose(z);
  return r;
}

function nextDoor(w: SimWorld, z: Zombie): number {
  if (z.doorAhead >= 0) return z.doorAhead;
  if (!z.path) return -1;
  const tag = z.path[z.pi * 4 + 3];
  const d = Nav.tagDoor(tag);
  if (d >= 0) return d;
  const p = Nav.tagPortal(tag);
  return p >= 0 ? w.nav.portals[p].door : -1;
}

// ---- doors ----------------------------------------------------------------------------------------------------
function startBang(w: SimWorld, z: Zombie, d: number): void {
  if (d < 0) { z.state = "idle"; z.path = null; return; }
  if (w.doorOpenIdx(d)) { z.path = null; return; }
  // steel and safe doors: only for prey it SAW go through, and not again soon after giving up on it
  const breakable = w.nav.doors[d].kind === "door";
  const sawThem = z.target >= 0 && w.t - z.lastSeen < 15_000;
  if (!breakable && (!sawThem || (z.gaveUpDoor === d && w.t - z.gaveUpAt < 10 * 60_000))) {
    z.state = "investigate"; z.path = null; z.bangDoor = -1;
    if (!z.searchUntil) z.searchUntil = w.t + w.rng.range(SEARCH_MS[0], SEARCH_MS[1]);
    z.lx = z.x; z.lz = z.z; z.lf = z.floor;
    return;
  }
  z.state = "bang"; z.bangDoor = d; z.bangSince = w.t; z.nextBang = w.t + 300; z.path = null; z.why = "bang";
  const c = w.nav.doorCentre[d];
  z.h = Math.atan2(c[0] - z.x, c[2] - z.z);
}

function bangStep(w: SimWorld, z: Zombie): void {
  const t = w.t, d = z.bangDoor;
  z.pose = "z-bang"; z.gait = "still";
  if (d < 0 || w.doorOpenIdx(d)) { z.state = z.target >= 0 ? "chase" : "investigate"; z.bangDoor = -1; z.path = null; return; }
  const D = w.nav.doors[d];
  const breakable = D.kind === "door";
  // they bang while they still believe someone's behind it; a safe room's door, only a while
  // chasing someone it saw go through: a minute and a half after it last saw them; a sound it heard
  // through the door: about as long as it would have searched the spot
  const since = t - Math.max(z.lastSeen, z.bangSince);
  const patience = z.target >= 0 && t - z.lastSeen < 60_000 ? 90_000 : 30_000;
  if ((!breakable && t - z.bangSince > SAFE_BANG_MS) || (breakable && since > patience)) {
    z.gaveUpDoor = d; z.gaveUpAt = t;
    z.state = "idle"; z.bangDoor = -1; z.target = -1; z.nextThink = t + w.rng.range(5000, 20_000); z.why = "gave up"; return;
  }
  if (t < z.nextBang) return;
  z.nextBang = t + 1000;
  const r = w.fac.hit(z.actor, D.id, w.sideRoom(z, d), z.k.bang * DOOR_HIT_SCALE);
  w.facEv(r, z.id);
  if (r.noise) { const c = w.nav.doorCentre[d]; w.noise(c[0], c[2], z.floor, r.noise * 2, -1, "bang"); }
}

// ---- violence -----------------------------------------------------------------------------------------------
/** A survivor standing in a safe room — its doorway included — is out of reach (doors.ts: the dead
 *  never enter one), however close the zombie at the door is. */
function reachable(w: SimWorld, s: Survivor, z: Zombie): boolean {
  // …except from INSIDE that room: a survivor who turned in there is in with them
  return !(s.room >= 0 && w.nav.rooms[s.room].kind === "safe") || w.nav.room[z.cell] === s.room;
}
function attack(w: SimWorld, z: Zombie, s: Survivor): void {
  const t = w.t;
  z.state = "attack"; z.path = null; z.gait = "still";
  z.h = Math.atan2(s.x - z.x, s.z - z.z);
  if (t < z.attackCd) { z.pose = "z-attack"; return; }
  z.attackCd = t + ATTACK_CD[z.zkind] * COMBAT.attackCdScale;
  z.pose = "z-attack";
  w.ev("zombie.attack", { by: z.id, victim: s.id, at: pos(z) });
  // THE DEAD ARE DANGEROUS (Oct 28 2026): a tired or scared survivor ducks less and shoves less, and
  // one caught mid-swing (recovering, open) can't shove at all
  const open = s.swing.phase === 2 || s.busyUntil > t || s.reviving >= 0;
  const C = COMBAT;
  if (s.grabbedBy.length >= 2 || w.rng.chance(C.swipeShare)) {
    // a swipe: a scratch or a blunt blow; it doesn't hold
    if (w.rng.chance(Math.max(0.05, C.duckBase + skill(s, "agility") * C.duckPerNimble + (s.stamina > 0.3 ? 0.05 : 0) - s.fear * 0.1 - (open ? 0.1 : 0)))) return;   // ducked it
    const scratch = w.rng.chance(0.6);
    w.hurtSurvivor(s, scratch ? w.rng.range(SCRATCH[0], SCRATCH[1]) : w.rng.range(8, 14), z.i, scratch ? "scratch" : "blunt", w.rng.pick(["arm", "torso", "shoulder"]));
    return;
  }
  grabAttempt(w, z, s, open ? 0.05 : C.shoveBase + skill(s, "escape") * C.shovePerNimble + SKILL_FX.strengthShove * (skill(s, "strength") - 5) + (s.stamina > 0.3 ? C.shoveBreath : 0) - s.fear * C.shoveFear - (s.tiredH > 18 ? 0.05 : 0));
}

function lunge(w: SimWorld, z: Zombie, s: Survivor): void {
  w.ev("zombie.attack", { by: z.id, victim: s.id, at: pos(z), lunge: true });
  // the lunge closes the gap whatever happens
  const a = Math.atan2(s.x - z.x, s.z - z.z);
  w.stepTo(z, s.x - Math.sin(a) * 0.8, s.z - Math.cos(a) * 0.8);
  z.h = a;
  grabAttempt(w, z, s, skill(s, "agility") * 0.05 - s.fear * 0.1);
}

function grabAttempt(w: SimWorld, z: Zombie, s: Survivor, dodge: number): void {
  const t = w.t;
  if (s.mode === "down" || !s.alive) return;
  if (dodge > 0 && w.rng.chance(Math.max(0.03, Math.min(0.75, dodge))) && s.stamina >= 0.15) {
    // shoved off: back ~1.5 m and stunned
    s.stamina = Math.max(0, s.stamina - 0.15);
    const a = Math.atan2(z.x - s.x, z.z - s.z);
    w.stepTo(z, z.x + Math.sin(a) * 1.2, z.z + Math.cos(a) * 1.2);
    z.stagger = t + 1500;
    w.ev("survivor.effort", { by: s.id, at: pos(s), shove: z.id });
    return;
  }
  z.grabbing = s.i;
  s.grabbedBy.push(z.i);
  if (s.grabbedBy.length === 1) {
    s.grabbedAt = t;
    // §8: free in ~2-4 s, faster with Escape and breath, slower scared — and at ~3 s it bites
    s.breakAt = t + w.rng.range(COMBAT.breakMin, COMBAT.breakMax) - skill(s, "escape") * COMBAT.breakPerNimble - s.stamina * COMBAT.breakBreath + s.fear * COMBAT.breakFear;
    s.nextBite = t + GRAB_BITE_MS;
  }
  s.swing.phase = 0; s.path = null; s.busyUntil = 0; s.busyAct = ""; s.openDoor = -1;
  w.stats.grabs++;
  w.ev("survivor.grabbed", { victim: s.id, by: z.id, at: pos(s) });
  w.say(s.who, "grabbed");
}

function holdStep(w: SimWorld, z: Zombie): void {
  const s = w.bodies[z.grabbing] as Survivor;
  if (!s.alive || s.mode === "down" || !s.grabbedBy.includes(z.i)) { z.grabbing = -1; z.state = s.alive ? "feed" : "feed"; z.target = s.i; return; }
  z.pose = "z-attack"; z.gait = "still";
  // the hands are ON them: pulled in to arm's length, wherever the struggle drags the two of them
  closeTo(w, z, s, GRAB_D, HOLD_PULL_M);
  z.h = Math.atan2(s.x - z.x, s.z - z.z);
}

function feedStep(w: SimWorld, z: Zombie, dt: number): void {
  const t = w.t;
  const s = w.bodies[z.target] as Survivor | undefined;
  if (!s || (s.alive && s.mode !== "down")) { z.state = s?.alive ? "chase" : "idle"; return; }
  if (!s.alive && t >= z.feedUntil) { z.state = "idle"; z.target = -1; z.nextThink = t + w.rng.range(5000, 20_000); z.why = ""; return; }
  // (distracted until someone comes close: that is sense()'s call, by what it can SEE. This used to go for anybody
  // within three metres whether it could see them or not, and sense() sent it back to the body: somebody crouched
  // out of its sight beside a feeding one had it turning to them and away three times a second)
  const d = Math.sqrt(d2(s, z));
  const slot = feedSlot(w, z, s);
  const ds = Math.hypot(slot.x - z.x, slot.z - z.z);
  if (d > 2.2) {
    if (!z.path || (t % 1000) < dt) {
      const p = w.plan(z, w.nav.nearestWalk(s.cell));
      if (!p || !p.reached) { z.state = "idle"; return; }
      z.path = p.pts; z.pi = 0;
    }
    go(w, z, z.k.amble * 1.5, dt, false);
    return;
  }
  if (ds > 0.12) {
    // the last steps to its place beside the body (a wall in the way: it kneels where it got to)
    const step = Math.min(ds, z.k.amble * 1.5 * dt / 1000);
    if (w.stepTo(z, z.x + (slot.x - z.x) / ds * step, z.z + (slot.z - z.z) / ds * step)) {
      z.path = null; z.pose = movePose(z, false); z.gait = "walk"; z.h = Math.atan2(slot.x - z.x, slot.z - z.z);
      return;
    }
  }
  z.path = null; z.pose = "z-feed"; z.gait = "still";
  z.h = Math.atan2(slot.tx - z.x, slot.tz - z.z);
  if (t >= z.nextBang) {
    z.nextBang = t + FEED_BITE_MS;
    w.ev("zombie.feed", { by: z.id, victim: s.id, at: pos(s) });
  }
  if (!z.feedUntil || z.feedUntil < t) z.feedUntil = t + w.rng.range(20_000, 50_000);
}
