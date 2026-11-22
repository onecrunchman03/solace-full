// SOLACE SURVIVORZ — A SURVIVOR'S BRAIN, in game code — THE BUNKER (docs/survivorz/BUNKER.md). Each step:
//   · NEEDS tick (hunger and thirst that never get urgent, bleeding, stamina, morale);
//   · if they're down they bleed out (and fire a pistol if they hold one); if a zombie has them they struggle;
//   · REFLEXES (several times a second): weigh what they can see against themselves and the allies near →
//     fight, back off, hide, run — the genes set the lines (genes.ts fleeHealth, fightOdds, goBackChance) —
//     with the rare PANIC at maximum fear; overwhelmed, they break off and run for a quieter room (third round 24);
//   · otherwise THE JOB, scored on need × what they like (genes): crank the blast door shut, guard whoever is
//     at the wheel or the radio, find the keycard and arm up at the armory, find the radio room's code and the
//     radio's missing part, repair it, make the call, sweep the bunker room by room, revive a friend, go with a
//     friend, find the others, rest in an infirmary bed, talk. The menu goes through hooks.choose, so the model
//     picks from it and code carries it out.
// WHAT THEY KNOW (knowledge.ts): every room, door and container from the start (they've lived here weeks);
// what's in a container only by searching it; that the radio needs a part only by looking at it; the code only
// off the note (or from whoever read it). They never know how many of the dead are left (follow-up 25).
import { lieOf } from "./lie";
import { fleeHealth, fightOdds, sneakChance, goBackChance, wantCompany, nerveFx, hopeFx, gene } from "../genes";
import { doorPlacement, type DoorPlacement } from "../facility";
import { LOCKPICK_MIN } from "../doors";
import { Nav, roomOfNode, floorOfNode } from "./nav";
import type { MapDef } from "./mapdef";
import {
  type SimWorld, type Survivor, type Zombie, type Job, type MenuOption, type Drop, CHOICE_WAIT, CHOICE_MENU_MAX, d2, pos, meleeHeld, cap, slotsMax, slotsOf,
} from "./world";
import { infectionStep, INFECTION } from "./infection";
import { ATTACK_R } from "./zombie";
import { socialOptions, socialLegal, socialAct, SOCIAL_KINDS } from "./social";
import { playerStep, playerLetGo } from "./player";
import { SEEN, VISITED, NEED, RADIO_CODE, learn, learnNeed, seeDoor, knowsRoom, believePass, sawThreat, note, witness } from "./knowledge";
import { gainXp, announce, skill, skillCut, isMedic } from "./goals";
import {
  SPEED, MOVE_NOISE, NOISE_M, MELEE, COMBAT, GUNS, NEEDS, H, REVIVE_MS, SEARCH_SPOT_MS, type Item,
  STACK, NO_BACKPACK, SPARE_MELEE, toughFx, strengthFx, BATTERY_MS, PACK_SLOTS, CLOT_MS, SKILL_XP, SKILL_FX, tireFx, restFx, LOOT_RULES, type PackId,
} from "./tables";

const MELEE_RANK: Record<string, number> = { fists: 0, knife: 1, hammer: 2, pipe: 3, crowbar: 4, axe: 5 };
const WEAPON_CAP: Record<string, number> = { fists: 0.5, knife: 0.85, hammer: 0.95, pipe: 1, crowbar: 1.1, axe: 1.45 };
/** how bad a room has to sound before nobody goes to look (knowledge danger: ~0.15 a look at each of the dead) ✱ */
const DREAD = 2.5;
/** one of the dead this near is known about whatever is between (an arm round a door frame); further off it has to
 *  be seen. It was 2.5 m, and somebody a wall away from the dead backed off from them. */
const TOUCH_M = 1.2;
/** A room swept and found empty is "done" this long (a sweep's memory) ✱ */
const SWEEP_FRESH_MS = 12 * 60_000;
/** CALLING OUT (16: they find each other by sound): alone, every this often, they call — the living within
 *  CALL_M hear where they are, and so do the dead ✱ */
const CALL_GAP: [number, number] = [45_000, 90_000];
const CALL_M = 20;
/** healing (fifth round 7-8): resting anywhere a little, in an infirmary bed faster (hp an hour) ✱ */
const REST_HEAL = 6, BED_HEAL = 30;

// ---- the step ----------------------------------------------------------------------------------------
export function survivorStep(w: SimWorld, s: Survivor, dt: number): void {
  // out of it (in the car, on the way out): nothing more they do, and nothing more happens to them
  if (s.escaped) { s.gait = "still"; return; }
  needs(w, s, dt);
  if (!s.alive) return;
  infectionStep(w, s);
  if (!s.alive) return;
  // collapsed and turning: nothing more they do
  // (on the floor is on guard: stance() doesn't run from here)
  if (s.turnAt) { s.gait = "still"; s.pose = "down"; s.alert = true; s.alertUntil = w.t + ALERT_HOLD_MS; return; }
  act(w, s, dt);
  if (!s.alive) return;
  stance(w, s);
}

function act(w: SimWorld, s: Survivor, dt: number): void {
  // (kneeling over a friend only while the hands are on them. A grab took the hands off and left this set: the two
  // were then never kept apart again — they walked to the infirmary one inside the other — and the dead took the
  // kneeler for somebody with their guard down for the rest of the show. The code review, Nov 14 2026: A-10, E-6)
  if (s.reviving >= 0 && s.busyAct !== "revive") s.reviving = -1;
  if (s.mode === "down") { downStep(w, s); return; }
  if (s.grabbedBy.length) { grabbedStep(w, s); return; }
  if (s.mode === "grabbed") s.mode = "job";
  // (THE SCARE WINDOW IS TIME BACK AT THE JOB, not time since the fright began: somebody who ran up the main stair
  // for quiet was fourteen seconds going up and fourteen coming down, each fright read as the first, and they ran
  // at the same dead and away again for as long as the show lasted. Found Nov 14, when upstairs became a place
  // indoors to run to. Here and not in decide(): that is not asked on a stair, nor while a fright is calming.)
  if (s.job?.scares && (s.mode === "flee" || s.mode === "backoff" || s.mode === "hide" || s.mode === "panic" || s.link)) s.job.scareT = w.t;
  if (s.onBed && (s.job?.kind !== "rest" || s.threats.length)) getUp(w, s);
  trackRoom(w, s);
  learn(w, s);
  if (w.t >= s.nextScan) { scan(w, s); s.nextScan = w.t + 250; }
  if (!s.player) callOut(w, s);
  // (the admin's own body: a push on the stick lets go of what the hands were on, where that can be let go of)
  else playerLetGo(w, s);
  // an action in progress holds them (a door, a search, a bandage, the crank, the repair)
  if (s.busyUntil > w.t) {
    s.gait = "still";
    // the dead on them cut the crank and the repair short (22: a grab interrupts the cranker); progress is kept
    if ((s.busyAct === "crank" || s.busyAct === "repair" || s.busyAct === "call") && s.threats.some((zi) => d2(w.bodies[zi], s) < 2.2 * 2.2)) {
      handsOff(w, s); s.busyUntil = 0;
    } else { if (s.busyAct === "crank") crankHands(w, s, dt); return; }
  }
  if (!s.busyAct && s.openDoor < 0) s.touchAt = null;
  if (s.openDoor >= 0) { finishOpen(w, s); return; }
  if (s.busyAct) { finishAct(w, s); return; }
  // WALK THE MAP (sim/player.ts): a body the admin drives makes no choice of its own from here on
  if (s.player) { playerStep(w, s, dt); return; }
  // THE REVIVE UNDER FIRE: a friend down a few steps away and nothing on them right now — the ones who go back
  // for people kneel even with the fight still going on round them (defenceless while they do)
  if (reviveReflex(w, s, dt)) return;
  decide(w, s);
  switch (s.mode) {
    case "panic": panicStep(w, s, dt); break;
    case "fight": fightStep(w, s, dt); break;
    case "backoff": case "flee":
      // (backing off is not a place to stay: half a minute of it with work only they can do in their name, and the
      // work is let go, as it is from a hiding place)
      if (s.mode === "backoff" && s.job && !interruptible(s.job) && w.t - (s.modeAt ?? w.t) > BACKOFF_GIVES_UP_MS) failJob(w, s, "driven off");
      fleeStep(w, s, dt); break;
    case "hide": hideStep(w, s); break;
    default: jobStep(w, s, dt);
  }
}

// ---- needs ---------------------------------------------------------------------------------------------
function needs(w: SimWorld, s: Survivor, dt: number): void {
  if (!s.alive) return;
  const dh = dt / H;
  const active = s.gait === "sprint" || s.gait === "jog" || s.mode === "fight" || s.grabbedBy.length > 0;
  const tough = toughFx(s.st, "toughNeeds");
  s.hungerH += dh * (active ? 1.5 : 1) * tough;
  s.thirstH += dh * (active ? 1.5 : 1) * tough;
  // healing: in an infirmary bed faster; resting anywhere a little (fifth round 7-8)
  if (s.mode !== "down" && !s.bleeding && s.hp < s.hpMax) {
    if (s.onBed) s.hp = Math.min(s.hpMax, s.hp + BED_HEAL * dh);
    else if (s.job?.kind === "rest" && s.gait === "still") s.hp = Math.min(s.hpMax, s.hp + REST_HEAL * dh);
  }
  // an untreated wound clots: heavy → light → stopped (CLOT_MS)
  if (s.bleeding && w.t - (s.bleedSince ?? 0) >= CLOT_MS[s.bleeding]) { s.bleeding = (s.bleeding - 1) as 0 | 1; s.bleedSince = w.t; }
  if (s.bleeding && s.mode !== "down" && w.t >= s.bleedNext) {
    s.hp -= 1; s.hurt += 1;
    s.bleedNext = w.t + (s.bleeding === 2 ? 2000 : 10_000);
    if (s.hp <= 0) { w.goDown(s, "bled out"); return; }
  }
  // stamina
  // (Endurance: what tires them and what rests them, both 1 at endurance 5 — SKILL_FX)
  const tire = tireFx(s.st), rest = restFx(s.st);
  if (s.gait === "sprint") s.stamina -= 0.12 * tire * dt / 1000;
  else if (s.gait === "jog") s.stamina -= 0.012 * tire * dt / 1000;
  else if (s.swing.phase === 0 && !s.grabbedBy.length) s.stamina += 0.1 * rest * dt / 1000;
  if (s.grabbedBy.length) s.stamina -= 0.04 * tire * dt / 1000;
  s.stamina = Math.max(0, Math.min(1, s.stamina));
  // morale drifts: hungry, thirsty, alone; company and progress bring it back
  let m = 0;
  if (s.hungerH > NEEDS.hungryAt) m -= 1;
  if (s.thirstH > NEEDS.thirstyAt) m -= 1;
  if (w.t - s.lastAllyNear > 10 * 60_000) m -= 0.3 * s.gen.sociability;
  else if (s.morale < 60) m += 2;
  s.morale = Math.max(0, Math.min(100, s.morale + m * dh * 4));
}

/** THEY FIND EACH OTHER BY SOUND (16): alone, now and then, they call out. Whoever is near enough hears where
 *  they are — and so do the dead. */
function callOut(w: SimWorld, s: Survivor): void {
  if (s.threats.length || s.mode !== "job" || w.t < s.nextCall) return;
  const alone = !w.survivors.some((o) => o !== s && o.alive && o.mode !== "down" && d2(o, s) < 12 * 12);
  if (!alone) { s.nextCall = w.t + 20_000; return; }
  // the cautious call less, the sociable more
  s.nextCall = w.t + w.rng.range(CALL_GAP[0], CALL_GAP[1]) * (0.6 + s.gen.caution / 10) / (0.6 + s.gen.sociability / 10);
  if (w.rng.chance(0.25 + s.gen.caution * 0.05)) return;   // thinks better of it this time
  w.ev("survivor.calls", { by: s.id, at: pos(s) });
  w.noise(s.x, s.z, s.floor, CALL_M, s.i, "call");
  w.say(s.who, "calls", {});
  for (const o of w.survivors) {
    if (o === s || !o.alive || o.mode === "down" || o.floor !== s.floor || Math.hypot(o.x - s.x, o.z - s.z) > CALL_M) continue;
    o.know.ally.set(s.i, { room: s.room, t: w.t, state: "calling" });
    note(o.know, w.t, `heard somebody calling out in ${theRoom(w, s.room)}`);
    o.rethink = true;
  }
}

// ---- the stance: what's in their hands, and how ready they are --------------------------------------
/** STANCE FROM MOOD (Josh, Oct 28 2026): ON GUARD (`alert`) is raised at once by a reason — the dead in sight or
 *  heard, a fight or a flight, a friend in trouble, guarding somebody, a room that sounds bad — and held
 *  ALERT_HOLD_MS after the last reason. In the bunker there is nowhere safe, so the weapon is drawn whenever
 *  they're on guard or on the move, and put away only after STOW_MS of calm at rest. */
const ALERT_HOLD_MS = 20_000, STOW_MS = 6_000;
const GUARD_JOBS = new Set(["guard", "clear"]);
const CALM_JOBS = new Set(["rest", "talk", "shut", "repair", "call"]);

function stance(w: SimWorld, s: Survivor): void {
  const t = w.t, m = s.mode;
  if (m === "down" || m === "grabbed" || s.grabbedBy.length) { s.alert = true; s.alertUntil = t + ALERT_HOLD_MS; s.calmSince = t; return; }
  const combat = m === "fight" || m === "backoff" || m === "flee" || m === "hide" || m === "panic";
  const calmJob = !s.job || CALM_JOBS.has(s.job.kind);
  const settled = calmJob && !s.path && s.gait === "still";
  if (combat || s.threats.length || s.chasedBy >= 0 || s.helping >= 0 || (!settled && jobOnGuard(w, s))) s.alertUntil = Math.max(s.alertUntil, t + ALERT_HOLD_MS);
  s.alert = t < s.alertUntil;
  if (combat) { s.calmSince = t; return; }
  if (s.busyAct === "revive" || s.busyAct === "crank" || s.busyAct === "repair" || s.busyAct === "call") { s.calmSince = t; s.held = null; return; }
  const weapon = s.gun && s.melee === "fists" ? GUNS[s.gun].id : meleeHeld(s.melee) ?? (s.gun ? GUNS[s.gun].id : null);
  const want = s.alert || s.mode !== "job" || !settled;
  if (want) { s.held = weapon; s.calmSince = t; return; }
  if (t - s.calmSince < STOW_MS) return;
  s.held = null;
}

function jobOnGuard(w: SimWorld, s: Survivor): boolean {
  const j = s.job;
  if (j && GUARD_JOBS.has(j.kind)) return true;
  if (s.room >= 0 && s.know.danger[s.room] > 0.8) return true;
  if (j?.room !== undefined && s.know.danger[j.room] > 1.2) return true;
  return s.sneak && !!j && j.kind === "loot";
}

/** PROXIMITY (Josh, Oct 28 2026: "they need to be in proximity to things they are interacting with"): an
 *  interaction starts here — they turn to face what they touch, and the distance is on the record. */
export const REACH_M = 0.9;
/** CONTACT (Nov 2026 — Josh: "fighting each other and hurting without being next to each other"): how far
 *  from the body a blow with each weapon really lands. A survivor closes to this before a swing starts —
 *  MELEE's reach still decides who's in the fight and what a landed blow can catch, but nobody swings an axe
 *  at a zombie two metres off any more. Never under the 0.6 the dead keep from the living (separate()). */
export const CONTACT: Record<string, number> = { fists: 0.7, knife: 0.75, hammer: 0.85, pipe: 1.05, crowbar: 1.05, axe: 1.25 };
/** THE FOOTWORK: a swing starts from where they stand and they step INTO it, so the blow lands on the body
 *  (CONTACT), then back out to where they started while they recover — the reach a long weapon buys is
 *  distance kept between blows, not a blow landing from two metres off. At most FOOT_MS m/s, walls respected. */
const FOOT_MS = 3.2;
export function footwork(w: SimWorld, s: Survivor, o: { x: number; z: number }, want: number, dt: number): void {
  const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz);
  if (d < 1e-3 || Math.abs(d - want) < 0.03) return;
  // (eased onto the distance: at FOOT_MS to the last centimetre, a body arrived at 3.2 m/s and stood)
  const step = Math.sign(d - want) * Math.min(Math.abs(d - want), Math.min(FOOT_MS, Math.sqrt(2 * 5 * Math.abs(d - want)) + 0.3) * dt / 1000);
  w.stepTo(s, s.x + dx / d * step, s.z + dz / d * step);
}
/** go straight at `o` (a body in plain reach): an attacker rushes the last step, or a victim backing off outruns it */
function stepIn(w: SimWorld, s: Survivor, o: { x: number; z: number; floor: number }, dt: number): void {
  s.path = [o.x, o.z, o.floor, -1]; s.pi = 0; s.goal = -2;
  moveGait(w, s, "jog", dt);
  face(s, o);
}
export function touch(w: SimWorld, s: Survivor, x: number, z: number, what: string): void {
  const d = Math.hypot(x - s.x, z - s.z);
  if (d > 0.05) s.h = Math.atan2(x - s.x, z - s.z);
  const R = w.stats.reach;
  R.byWhat[what] = Math.max(R.byWhat[what] ?? 0, Math.round(d * 100) / 100);
  // a hand on one of the dead holding a friend, and lying down ON a bed, are not reaching for a thing
  if (what !== "pull" && what !== "bed") {
    R.n++;
    if (d > R.worst) { R.worst = d; R.worstWhat = what; }
    if (d > REACH_M) { R.over++; (R.overBy ??= {})[what] = (R.overBy[what] ?? 0) + 1; }
  }
  s.touchAt = [x, z]; s.touchWhat = what;
}

function trackRoom(w: SimWorld, s: Survivor): void {
  const r = s.room;
  if (r < 0 || w.group.explored[r]) return;
  w.group.explored[r] = 1;
  w.stats.roomsExplored++;
  progress(w, s);
}

// ---- down, held -----------------------------------------------------------------------------------------
function downStep(w: SimWorld, s: Survivor): void {
  s.gait = "still";
  let feeders = 0;
  for (const z of w.zombies) if (z.alive && z.state === "feed" && z.target === s.i) feeders++;
  if (feeders) s.downUntil -= Math.min(2, feeders) * w.stepMs * COMBAT.feedHaste;
  if (w.t >= s.downUntil) { w.dieSurvivor(s, feeders ? "eaten" : s.cause || "bled out"); return; }
  // a last stand: a downed survivor with a pistol still fires it, badly
  if (s.gun === "pistol" && s.mag > 0 && w.t >= s.gunReadyAt) {
    const z = nearestZombie(w, s, 7);
    if (z) shoot(w, s, z, 0.4);
  }
}

/** Pulling one of the dead off a friend: right beside them (§8: about a second). */
const PULL_M = 1.8, PULL_HAND_M = 1.15;
function grabbedStep(w: SimWorld, s: Survivor): void {
  s.mode = "grabbed"; s.pose = "grabbed"; s.gait = "still"; s.path = null; s.swing.phase = 0;
  if (s.busyAct === "crank" || s.busyAct === "repair" || s.busyAct === "call") handsOff(w, s);
  s.why = s.grabbedBy.length > 1 ? "held by two" : "grabbed";
  const t = w.t;
  // a knife to the head ends it at once, if it lands (§8)
  if (s.melee === "knife" && t >= s.nextStab && s.stamina > 0.1) {
    s.nextStab = t + 1100;
    s.stamina = Math.max(0, s.stamina - 0.06);
    if (w.rng.chance(0.12 + skill(s, "melee") * 0.03 - s.fear * 0.08)) {
      const z = w.bodies[s.grabbedBy[0]] as Zombie;
      w.ev("melee.stab", { by: s.id, victim: z.id, weapon: MELEE.knife.id, part: "head", at: pos(z) });
      w.hurtZombie(z, 999, s.i, true);
      if (!s.grabbedBy.length) { s.mode = "job"; return; }
    }
  }
  // an ally right there pulls it off (§8: about a second, faster with Escape and Strength)
  for (const o of w.survivors) {
    if (o === s || !o.alive || o.mode === "down" || o.grabbedBy.length || o.floor !== s.floor) continue;
    const zg = w.bodies[s.grabbedBy[0]] as Zombie;
    // hands ON the one holding them (Nov 2026 — Josh: "they have to be right next to something to interact with"):
    // beside the friend isn't enough when the zombie is on their far side — measured pulls from 2.2 m
    if (d2(o, s) > PULL_M * PULL_M || d2(o, zg) > PULL_HAND_M * PULL_HAND_M) continue;
    if (!o.pulling || o.pulling !== s.i) { o.pulling = s.i; o.pullAt = t + 1300 - skill(o, "escape") * 40 - (skill(o, "strength") - 5) * SKILL_FX.strengthPullMs; continue; }
    if (t < o.pullAt) continue;
    touch(w, o, zg.x, zg.z, "pull"); o.touchAt = null;
    zg.grabbing = -1; zg.stagger = t + 1500;
    s.grabbedBy.shift();
    o.pulling = -1; o.busyUntil = t + 500; o.pose = "fight";
    o.stamina = Math.max(0, o.stamina - 0.15);
    w.stats.grabsBroken++; tally(w, "pulledOff"); gainXp(w, o, "escape", SKILL_XP.breakFree);
    w.ev("survivor.effort", { by: o.id, at: pos(o), shove: zg.id });
    if (!s.grabbedBy.length) { s.mode = "job"; return; }
    break;
  }
  // struggling free: alone only against one, and not with nothing left in them
  if (s.grabbedBy.length === 1 && t >= s.breakAt) {
    if (s.stamina < 0.06 && w.rng.chance(0.5)) { s.breakAt = t + 700; }
    else {
      const z = w.bodies[s.grabbedBy[0]] as Zombie;
      z.grabbing = -1; z.stagger = t + 1000;
      s.grabbedBy = [];
      s.stamina = Math.max(0, s.stamina - 0.12);
      w.stats.grabsBroken++; tally(w, "struggledFree"); gainXp(w, s, "escape", SKILL_XP.breakFree);
      w.ev("survivor.effort", { by: s.id, at: pos(s) });
      s.mode = "job";
      return;
    }
  }
  if (t >= s.nextBite) {
    const z = w.bodies[s.grabbedBy[0]] as Zombie;
    s.nextBite = t + 2000;
    const part = w.rng.pick(["neck", "shoulder", "forearm"]);
    tally(w, "grabBites");
    w.hurtSurvivor(s, w.rng.range(25, 35), z.i, "bite", part);
    if (s.alive && (s.mode as string) !== "down") s.breakAt = t + w.rng.range(COMBAT.rebreakMin, COMBAT.rebreakMax) - skill(s, "escape") * 60;
  }
}

// ---- the reflexes ----------------------------------------------------------------------------------------
/** What they can see: zombies near enough and in the line of sight. */
function scan(w: SimWorld, s: Survivor): void {
  const vis = 22;
  const k = s.know, t = w.t;
  s.threats.length = 0;
  let threat = 0, chased = -1, chasedD = Infinity;
  let seenRooms: number[] | null = null;
  // (somebody ON A STAIR still looks from where they left: looking from where it sets them down was tried the same
  // night and cost thirty escapes in 160 mansion shows, 97 to 65; they turned to fight or run half-way down a
  // stair they could not leave. What stands at a stair's foot is still met unseen: left open.)
  const sf = s.floor, sx = s.x, sz = s.z;
  for (const z of w.zombies) {
    if (!z.alive || z.lying) continue;
    // ONE COMING OVER A SILL OR UP A STAIR IS SEEN AT THE PLACE IT WILL LAND (the re-grade's A-1): anything on a
    // link was skipped, so the dead climbing in at a window were nobody's threat until they stood on the floor,
    // and struck within three tenths of a second of it.
    const zx = z.link ? z.link.x1 : z.x, zz = z.link ? z.link.z1 : z.z;
    if ((z.link ? z.link.f1 : z.floor) !== sf) continue;
    const dd = (zx - sx) * (zx - sx) + (zz - sz) * (zz - sz);
    if (dd > 30 * 30) continue;
    const d = Math.sqrt(dd);
    const onMe = (z.state === "chase" || z.state === "attack") && z.target === s.i;
    const los = d < vis && w.nav.sees(sf, sx, sz, zx, zz, w.doorOpenIdx);
    // (WITHIN A HAND'S REACH, AND NOT THROUGH A SHUT DOOR: one of the dead beating on the far side of the bolted
    // front door, 1.2 m from Johanna with the fuel errand, was "at her elbow". She backed off from it without
    // moving for forty minutes, four people standing with her, and the hour ran out with five alive: seed 56.)
    const touch = d < TOUCH_M && !shutDoorBetween(w, sf, sx, sz, zx, zz);
    if (!(touch || (onMe && d < 25) || los)) {
      // the dead behind a wall or a shut door: heard, not seen — the room beyond is remembered as bad
      if (d < 10 && z.room >= 0 && z.state !== "idle") {
        k.danger[z.room] = Math.min(6, k.danger[z.room] + 0.08);
        sawThreat(k, t, z.zkind, z.room, true);
        if (d < 8) s.alertUntil = t + ALERT_HOLD_MS;
      }
      continue;
    }
    // SEEN, BUT IS IT ANYTHING TO DO SOMETHING ABOUT? (Nov 14 2026.) One of the dead that is after nobody, or that
    // can't get to whoever it is after (zombie.ts `walled`), with no way to walk straight at it — the far side of a
    // window, of a table — is known about and left alone. Before, anything in sight was a threat: Dale, a crest in
    // his hand, saw one standing on the terrace through the great hall's glass, went for it, lost sight of it, went
    // back to the chimneypiece, saw it: 75 changes of mind a minute and the wind run out of him (job↔fight was
    // 13,000 of the 16,000 flips in 40 mansion shows). It is a threat again the moment it comes for somebody.
    const coming = (z.state === "chase" || z.state === "attack") && !z.walled;
    // (one there is no route to, found the hard way a moment ago, is left alone until it comes: fightStep)
    const noWay = !!s.noWayTo && s.noWayTo[0] === z.i && t < s.noWayTo[1];
    let real = coming || touch || (!noWay && w.nav.segLine(sf, sx, sz, zx, zz, (c) => w.nav.door[c] < 0 || w.doorOpenIdx(w.nav.door[c])));
    // ONE ON A CHAIN IS LEFT ON IT by anybody it cannot reach, unless what they came to do is inside its reach (the
    // crest in Glenridge's cell). Seen straining at its chain it was a threat like any other, and whoever passed the
    // cell's gate went in and put it down.
    if (real && z.leash && !z.link) {
      const R = z.leash[2] + ATTACK_R + 0.05;
      // (somebody on a stair is in nobody's reach: the basement stair runs down past the cell's wall)
      let mine = !s.link && Math.hypot(sx - z.leash[0], sz - z.leash[1]) <= R;
      const jc = s.job?.cell ?? -1;
      if (!mine && jc >= 0) { const [jx, , jz] = w.nav.centre(jc); mine = Math.hypot(jx - z.leash[0], jz - z.leash[1]) <= R; }
      if (!mine) real = false;
    }
    if (real) {
      s.threats.push(z.i);
      // (HOW NEAR IS A SLOPE, NOT STEPS: 1.5 under four metres, 1 under ten, 0.6 under eighteen made going in lift
      // the threat by two thirds in one stride and backing off drop it again. Four of the dead standing ten
      // metres off: in, out, in, every 900 ms, a hundred metres walked in the minute and no blow struck.)
      const near = d <= 3 ? 1.5 : d <= 8 ? 1.5 - (d - 3) * 0.1 : d <= 14 ? 1 - (d - 8) * (0.4 / 6) : d <= 20 ? 0.6 - (d - 14) * 0.05 : 0.3;
      threat += z.k.threat * near * (onMe ? 1 : 0.6);
      if (onMe && d < chasedD) { chasedD = d; chased = z.i; }
    } else if (d < 8) s.alertUntil = Math.max(s.alertUntil, t + ALERT_HOLD_MS);
    if (z.room >= 0) {
      k.danger[z.room] = Math.min(6, k.danger[z.room] + 0.15);
      // seen in a room: that room isn't clear any more
      k.swept[z.room] = 0;
      if (los) (seenRooms ??= []).push(z.room);
    }
  }
  if (seenRooms) {
    seenRooms.sort((a, b) => a - b);
    for (let i = 0; i < seenRooms.length;) {
      let j = i; while (j < seenRooms.length && seenRooms[j] === seenRooms[i]) j++;
      sawThreat(k, t, "shambler", seenRooms[i], false, j - i);
      i = j;
    }
  }
  s.threat = threat; s.chasedBy = chased;
  if (s.threats.length && !s.player) slam(w, s);
  let allies = 0, lead = 5;
  for (const o of w.survivors) {
    if (o === s || !o.alive || o.floor !== s.floor) continue;
    const dd = d2(o, s);
    if (dd < 15 * 15) s.lastAllyNear = w.t;
    if (dd < 8 * 8 && o.mode !== "down") { allies++; lead = Math.max(lead, skill(o, "leadership")); }
  }
  s.allies = allies;
  const cp = capacity(s);
  // FEAR: Composure steadies their own nerve, a leader near steadies everyone's (Leadership), Optimism takes the
  // edge off being hurt — every one of them exactly 1 at 5 (genes.ts nerveFx/hopeFx, tables.ts SKILL_FX.leadNerve)
  const steady = nerveFx(s.gen) * (1 - SKILL_FX.leadNerve * (lead - 5));
  s.fear = Math.max(0, Math.min(1, (threat / (cp + 0.5)) * 0.55 * steady + (1 - s.hp / 100) * 0.3 * hopeFx(s.gen) + (s.stamina < 0.2 && threat > 0 ? 0.1 : 0)));
  // an ally in a zombie's hands, near (they hear it): do they go back for them?
  if (s.player) { /* whether they go back for somebody is the call of whoever is driving */ }
  else if (s.helping < 0) {
    for (const o of w.survivors) {
      if (o === s || !o.alive || o.floor !== s.floor) continue;
      if (!(o.grabbedBy.length || o.mode === "down") || d2(o, s) >= 14 * 14) continue;
      const key = (o.grabbedBy.length ? o.grabbedAt : o.downUntil) * 1024 + o.i;
      if (!s.helpRolled.has(key)) {
        if (s.helpRolled.size > 64) s.helpRolled.clear();
        s.helpRolled.add(key);
        if (w.rng.chance(goBackChance(s.gen, regardOf(w, s, o)))) { s.helping = o.i; break; }
      }
    }
  } else {
    const o = w.survivors.find((x) => x.i === s.helping);
    if (!o || !o.alive || (!o.grabbedBy.length && o.mode !== "down")) s.helping = -1;
  }
}
/** what one thinks of another (the talk layer's regard, when there is one; strangers start at 0, 18) */
const regardOf = (w: SimWorld, s: Survivor, o: Survivor) => w.hooks.regard?.(w, s.who, o.who) ?? 0;
/** a combat counter for the harness profile */
function tally(w: SimWorld, k: string, n = 1): void { w.stats.combat[k] = (w.stats.combat[k] ?? 0) + n; }

function outnumbered(w: SimWorld, s: Survivor, r = 6): boolean {
  let near = 0;
  for (const zi of s.threats) { const z = w.bodies[zi] as Zombie; if (z.alive && d2(z, s) < r * r) near++; }
  const line = s.allies === 0 ? (s.gen.caution <= 3 ? 3 : 2) : s.allies + 3;
  return near >= line;
}

function capacity(s: Survivor): number {
  const gun = s.gun && (s.mag > 0 || ammoOf(s) > 0) ? 1.2 : 0;
  const melee = skill(s, "melee");
  const own = fightOdds(s.gen, melee) * (WEAPON_CAP[s.melee] ?? 1) * (0.5 + 0.5 * s.stamina) * (0.4 + 0.6 * s.hp / 100) + gun;
  return own + Math.min(3, s.allies) * 0.8 * Math.min(1, (melee + (gun ? 4 : 0)) / 6);
}

/** NO DITHERING (realism round 13, Nov 2026): fight-or-back-off is a line between the threat and what they can take
 *  (capacity), and capacity falls with stamina while they fight and comes back while they back off — so on the line
 *  a survivor flipped every 0.3-0.7 s, running at the zombie and away from it by turns (seed 12: Rollo, eleven
 *  reversals in eight seconds, and the legs on the show whipped round with each). A fighter stays one until the
 *  threat is FIGHT_STAY × their capacity; a backer-off goes back in at FIGHT_RETURN ×; and either stands MODE_DWELL_MS. */
// (MODE_DWELL_MS was 800: a fighter walking in put the dead's threat up, backed off, saw it fall and went back in, a flip every second. Two seconds held, Nov 16 2026: in 160 mansion shows the minutes of 20+ changes of mind fell 278 to 124 and escapes went 104 to 114; in 120 bunker shows 396 to 205, rescues 55 to 52. A wider margin (1.2 / 0.75) did as well alone and worse with it.)
const FIGHT_STAY = 1.0, FIGHT_RETURN = 0.85, MODE_DWELL_MS = 2000, ENGAGE_M = 10;
/** DRIVEN OFF (Nov 14 2026): a job whose way leads past a place the dead can be seen from. Somebody too hurt to
 *  fight saw them, ran, lost sight of them a step later, went straight back to the job, and saw them again: at
 *  Glenridge's front door Rollo did that once every 0.75 s for forty minutes with the fuel errand in his name, so
 *  nobody else fetched the fuel and the show ended with everyone dead (11 of 17 wipes over 40 shows went this
 *  way). The third time running the sight of the dead drives them off the same job, the job is given up: it is
 *  not theirs again for a while (failJob), and somebody fitter can take it. */
const SCARE_MAX = 3, SCARE_WINDOW_MS = 20_000;
/** how many go along with one person for the company of it (an errand the map sends a party on is its own affair) */
const ESCORTS_MAX = 2;
/** how long after somebody was driven off their work the fighters still go to where it happened */
const SCARED_HELP_MS = 3 * 60_000;
const DWELL_MODES = new Set(["fight", "backoff", "flee", "hide"]);
/** one of the dead this near breaks a hide (m) */
const HIDE_FLUSH_M = 6;
const HIDE_CALM_MS = 8_000, FLEE_CALM_MS = 3_000, FIGHT_CALM_MS = 2_500, HIDE_GIVES_UP_MS = 20_000, BACKOFF_GIVES_UP_MS = 30_000;
/** a shut door (or a boarded window) on the straight line between two places a step apart: no hand reaches through it */
function shutDoorBetween(w: SimWorld, f: number, ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
  for (let i = 0; i <= n; i++) {
    const c = w.nav.cellAt(f, ax + (bx - ax) * i / n, az + (bz - az) * i / n), d = c >= 0 ? w.nav.door[c] : -1;
    if (d >= 0 && !w.doorOpenIdx(d)) return true;
  }
  return false;
}
function decide(w: SimWorld, s: Survivor): void {
  const t = w.t;
  if (s.mode === "panic" && t < s.panicUntil) return;
  const helpingGrab = s.helping >= 0 && (w.bodies[s.helping] as Survivor).grabbedBy.length > 0;
  if (!s.threats.length && !helpingGrab) {
    // (a hider stays down until it's been quiet a few seconds: with one of the dead drifting in and out of sight
    // Sarah went crank, hide, crank, hide four times in 26 s — the Nov 12 2026 review)
    if (s.mode === "hide" && t - (s.threatAt ?? -1e12) < HIDE_CALM_MS) return;
    // (and a runner keeps running a few seconds after the last sight of them: round the bend of Glenridge's long
    // gallery Rick, badly hurt, ran from three of the dead, lost sight of them a step later, turned back to his
    // work, saw one, went for it, saw the other two, ran — forty changes of mind a minute)
    if ((s.mode === "flee" || s.mode === "backoff") && t - (s.threatAt ?? -1e12) < FLEE_CALM_MS) return;
    // (and somebody going for one of the dead keeps after it a moment when it passes out of sight — fightStep)
    if (s.mode === "fight" && lostFoe(w, s)) return;
    if (s.mode !== "job") { s.mode = "job"; s.swing.phase = 0; }
    return;
  }
  s.threatAt = t;
  const cp = capacity(s);
  const hpShare = s.hp / s.hpMax;
  if (s.threat > cp * 2 && s.fear > 0.8 && s.allies === 0 && s.mode !== "panic") {
    const p = 0.004 * (s.gen.selfPreservation / 5) * ((11 - s.gen.caution) / 6);
    if (w.rng.chance(p)) {
      s.mode = "panic"; s.panicUntil = t + w.rng.range(2000, 4000);
      s.panicKind = w.rng.chance(0.5) ? "freeze" : "bolt";
      s.path = null;
      w.ev("survivor.panic", { by: s.id, at: pos(s) });
      w.say(s.who, "panic");
      return;
    }
  }
  const prev = s.mode;
  const weak = skill(s, "melee") <= 2;
  const close = nearestZombie(w, s, MELEE[s.melee].reach + 0.6);
  const cornered = !!close && (close.target === s.i || s.chasedBy >= 0);
  if (helpingGrab && hpShare > fleeHealth(s.gen) * 0.8 && (!weak || s.allies === 0)) s.mode = "fight";
  // (badly hurt, they run from any of the dead that could get at them; it was only from a threat over 0.4, and one
  // of the dead a way off was walked up to and fought on a tenth of their blood)
  else if (hpShare < fleeHealth(s.gen) && (s.threat > 0.4 || !close)) s.mode = "flee";
  else if (outnumbered(w, s)) s.mode = s.stamina > 0.15 && !cornered ? "flee" : "backoff";
  else if (weak && !cornered) s.mode = s.chasedBy < 0 && s.gen.caution >= 4 ? "hide" : s.threat > cp * 1.5 ? "flee" : "backoff";
  // (back INTO a fight from hiding or running takes the same margin as from backing off: on the line, with their
  // breath coming and going, they stood up to fight and hid again by turns)
  // (...and nobody WALKS INTO being outnumbered: the count that turns a fighter round is of the dead within six
  // metres, and a fight is begun from further off than that. Dale on the lawn, a knife in his hand and two of them
  // standing eight metres away: he could take them, walked in, was outnumbered at six metres, ran back to eight,
  // hid, got his breath, could take them again. Fourteen times a minute. To BEGIN a fight the count is of the ones
  // within ENGAGE_M.)
  else if (s.threat <= cp * (prev === "fight" ? FIGHT_STAY : prev === "backoff" || prev === "hide" || prev === "flee" ? FIGHT_RETURN : 1) && (prev === "fight" || !outnumbered(w, s, ENGAGE_M))) s.mode = "fight";
  else if (s.chasedBy < 0 && s.gen.caution >= 6) s.mode = "hide";
  else if (s.threat > cp * 2.2) s.mode = "flee";
  else s.mode = "backoff";
  // (fight, back off and flee don't trade places every half second: within MODE_DWELL_MS of the last change the one
  // they're in stands — a second zombie stepping over the outnumbered line and back flipped a charge into a run and
  // back three times in two seconds — unless it's urgent: a friend grabbed, or the blood low enough to run for it)
  // (NOT INTO HIDING WITH THE DEAD THAT NEAR: a hide is broken by one of them within HIDE_FLUSH_M, so somebody who
  // chose to hide a step inside that was flushed out and chose it again, twice a second. Sarah in the vestibule,
  // six of them feeding six metres off in the forecourt: 110 changes of mind in a minute, seed 11.)
  if (s.mode === "hide" && prev !== "hide" && nearestZombie(w, s, HIDE_FLUSH_M + 1.5)) s.mode = prev === "flee" || s.threat > cp * 1.5 ? "flee" : "backoff";
  const urgent = helpingGrab || (s.mode === "flee" && hpShare < fleeHealth(s.gen));
  // (hiding too: Dale, winded on the forecourt with two of the dead standing eight metres off, was "weak" one step
  // and not the next as his breath came back, and hid, stood to fight and hid again a hundred times in a minute)
  if (DWELL_MODES.has(s.mode) && DWELL_MODES.has(prev) && s.mode !== prev && !urgent && t - (s.modeAt ?? -1e9) < MODE_DWELL_MS) s.mode = prev;
  if (s.mode !== prev) s.modeAt = t;
  if (s.mode === "fight" && prev !== "fight") {
    if (w.t - s.lastFight > 20_000) { w.stats.fights++; w.say(s.who, "fight"); }
  }
  if (s.mode === "fight" || s.mode === "backoff") s.lastFight = w.t;
  if (s.mode !== prev) { s.path = null; if (s.mode !== "fight") s.swing.phase = 0; }
  if (prev !== "flee" && prev !== "backoff" && prev !== "hide" && s.job && (s.mode === "flee" || s.mode === "backoff" || s.mode === "hide")) {
    const j = s.job;
    j.scares = t - (j.scareT ?? -1e12) < SCARE_WINDOW_MS ? (j.scares ?? 0) + 1 : 1;
    j.scareT = t;
    if (j.scares >= SCARE_MAX) {
      // (where the dead that did it are: the ones who can fight go and see to it — jobMenu)
      let near: Zombie | null = null, nd = Infinity;
      for (const zi of s.threats) { const z = w.bodies[zi] as Zombie, dd = d2(z, s); if (dd < nd) { nd = dd; near = z; } }
      if (near && near.room >= 0 && j.kind !== "clear" && j.kind !== "regroup" && j.kind !== "escort") s.scaredOff = { room: near.room, t };
      failJob(w, s, "driven off");
    }
  }
}

function panicStep(w: SimWorld, s: Survivor, dt: number): void {
  s.why = "panic";
  if (w.t >= s.panicUntil || s.allies > 0) { s.mode = "job"; s.path = null; s.goal = -1; return; }
  if (s.panicKind === "freeze") { s.pose = "panic"; s.gait = "still"; return; }
  if (!s.path) {
    const a = w.rng.next() * Math.PI * 2;
    const c = w.nav.cellAt(s.floor, s.x + Math.cos(a) * 8, s.z + Math.sin(a) * 8);
    const k = c >= 0 && w.nav.isWalk(c) ? c : w.nav.nearestWalk(c >= 0 ? c : s.cell, s.room);
    const p = k >= 0 ? w.plan(s, k) : null;
    if (p) { s.path = p.pts; s.pi = 0; s.goal = -1; }
  }
  moveGait(w, s, "sprint", dt);
  if (!s.path) s.pose = "panic";
}

// ---- fighting ----------------------------------------------------------------------------------------------
function fightTarget(w: SimWorld, s: Survivor): Zombie | null {
  if (s.helping >= 0) {
    const o = w.bodies[s.helping] as Survivor;
    for (const zi of o.grabbedBy) { const z = w.bodies[zi] as Zombie; if (z.alive) return z; }
    for (const z of w.zombies) if (z.alive && z.state === "feed" && z.target === o.i && d2(z, s) < 20 * 20) return z;
  }
  // two people can get at one of the dead at once, not six: a third picks another, or holds back
  let best: Zombie | null = null, bd = Infinity;
  for (const zi of s.threats) {
    const z = w.bodies[zi] as Zombie;
    if (!z.alive) continue;
    let on = 0;
    for (const o of w.survivors) if (o !== s && o.alive && o.mode === "fight" && o.swing.target === z.i && d2(o, z) < 2.6 * 2.6) on++;
    if (on >= 2 && z.target !== s.i) continue;
    const dd = d2(z, s) / (z.target === s.i ? 2 : 1) * (1 + on);
    if (dd < bd) { bd = dd; best = z; }
  }
  return best;
}

/** The one they were going for, out of sight for less than FIGHT_CALM_MS: still theirs to go after. Dale, sweeping
 *  Glenridge's upper gallery, went for one of the dead standing round its bend, lost sight of it on the first step,
 *  went back to his sweep, saw it, went for it: 64 changes of mind in a minute. */
function lostFoe(w: SimWorld, s: Survivor): Zombie | null {
  if (s.foe === undefined || w.t - (s.foeAt ?? -1e12) >= FIGHT_CALM_MS) return null;
  const f = w.bodies[s.foe] as Zombie | undefined;
  return f && f.alive && !f.gone && !f.link && f.floor === s.floor ? f : null;
}

function fightStep(w: SimWorld, s: Survivor, dt: number): void {
  const inSight = fightTarget(w, s), z = inSight ?? lostFoe(w, s);
  if (!z) { s.mode = "job"; s.swing.phase = 0; s.foe = undefined; s.foeCell = undefined; return; }
  // (the one a friend is being eaten by is gone for whether it is in sight or not: only one they can see, or could
  // a moment ago, is "theirs")
  if (inSight && s.threats.includes(inSight.i)) { s.foe = inSight.i; s.foeAt = w.t; }
  s.why = s.helping >= 0 ? "saving " + (w.bodies[s.helping] as Survivor).who : "fight";
  const d = Math.sqrt(d2(z, s));
  const t = w.t;
  const M = MELEE[s.melee];
  if (s.reloadUntil > t) { s.pose = "reload"; s.gait = "still"; s.held = GUNS[s.gun!].id; return; }
  // ammo discipline: melee for a lone shambler close in; guns for a crowd, at range, an emergency
  const wantGun = s.gun && (s.mag > 0 || ammoOf(s) > 0) && d > 0.9 && d < 22 &&
    (s.threats.length >= 3 || s.hp < 45 || d > 3 || (s.helping >= 0 && d > M.reach) || s.melee === "fists");
  if (wantGun && s.swing.phase === 0) {
    s.held = GUNS[s.gun!].id;
    face(s, z);
    if (s.mag === 0) { reload(w, s); return; }
    s.gait = "still"; s.pose = "aim";
    if (t >= s.gunReadyAt && w.nav.sees(s.floor, s.x, s.z, z.x, z.z, w.doorOpenIdx)) shoot(w, s, z, 1);
    return;
  }
  s.held = meleeHeld(s.melee);
  if (s.swing.phase === 1 && t >= s.swing.until) {
    const tz = w.bodies[s.swing.target] as Zombie;
    resolveSwing(w, s, tz);
    s.swing.phase = 2; s.swing.until = t + M.recover * (s.stamina < 0.12 ? 1.6 : 1);
    return;
  }
  if (s.swing.phase === 2) { if (t >= s.swing.until) s.swing.phase = 0; else { s.gait = "still"; footwork(w, s, z, s.swing.back ?? M.reach, dt); return; } }
  if (s.swing.phase === 1) { s.gait = "still"; s.pose = "fight"; face(s, z); footwork(w, s, z, CONTACT[s.melee] ?? 0.8, dt); return; }
  if (d > M.reach) {
    // A FRIEND ALREADY FIGHTING, RIGHT IN THE WAY (Nov 14 2026): the one behind waits their turn, weapon up. They
    // used to walk at the back of whoever was in front until the walk's last resort put one body through the
    // other (Dale through Ben, then through Rick, three seconds of it in a doorway of the bunker's common room).
    if (z.target !== s.i && fighterInWay(w, s, z)) { s.path = null; s.gait = "still"; s.pose = "fight"; face(s, z); return; }
    // (a new route when the one they are going for has MOVED, not twice a second whatever: a route out of a
    // doorway starts at the doorway's own point, so a fighter a step past it was turned round to it by every new
    // plan and walked on the spot for over a minute at one of the dead standing still: the code review's A-8)
    if (!s.path || (z.cell !== s.foeCell && (w.t % 500) < dt)) {
      const p = w.plan(s, z.cell);
      s.path = p ? p.pts : null; s.pi = 0; s.goal = -1; s.foeCell = z.cell; s.planAt = w.t;
      // NO WAY TO IT (the re-grade's A-8b): seen down a straight line of floor, in a room no route goes into (the
      // tunnel beyond the blast door). They stood half a minute, weapon up, at one sixteen metres off. It is
      // left alone for a while, unless it comes.
      if (!p || !p.reached) { s.noWayTo = [z.i, w.t + 20_000]; s.path = null; s.mode = "job"; s.swing.phase = 0; s.foe = undefined; s.foeCell = undefined; return; }
    }
    // (...and when the walk is REFUSED, at most once a second: a fighter nudged a hand's breadth off his line beside
    // a blocked cell kept a route whose next step was refused for as long as the other stood still. Four of them
    // stood half a minute, weapons up, three metres from one of the dead: the A-8 fix's own fault.)
    if (moveGait(w, s, d < 4 ? "walk" : "jog", dt) === "stuck" && w.t - (s.planAt ?? 0) >= 1000) {
      const p = w.plan(s, z.cell);
      s.path = p ? p.pts : null; s.pi = 0; s.goal = -1; s.foeCell = z.cell; s.planAt = w.t;
    }
    if (!s.path) { const c = w.nav.cellAt(s.floor, z.x, z.z); if (c >= 0) { const p = w.plan(s, c); if (p) { s.path = p.pts; s.pi = 0; s.goal = -1; } } }
    return;
  }
  startSwing(w, s, z, d);
}

/** a friend who is fighting, within a step of them, on the line to the one they are going for and nearer it */
export function fighterInWay(w: SimWorld, s: Survivor, z: Zombie): boolean {
  const zx = z.x - s.x, zz = z.z - s.z, zl = Math.hypot(zx, zz) || 1;
  for (const o of w.survivors) {
    if (o === s || !o.alive || o.floor !== s.floor || o.mode !== "fight") continue;
    const ox = o.x - s.x, oz = o.z - s.z, ol = Math.hypot(ox, oz);
    if (ol > 1.0 || ol >= zl) continue;
    const along = (ox * zx + oz * zz) / zl, side = Math.abs(ox * zz - oz * zx) / zl;
    if (along > 0.15 && side < 0.45) return true;
  }
  return false;
}

/** A swing begins: from where they stand, at this one of the dead, `d` metres off (the blow lands when the
 *  windup is up: resolveSwing). */
export function startSwing(w: SimWorld, s: Survivor, z: Zombie, d: number): void {
  const t = w.t, M = MELEE[s.melee];
  s.path = null; s.gait = "still"; face(s, z);
  s.swing.phase = 1; s.swing.target = z.i; s.swing.back = Math.min(d, M.reach);
  s.swing.until = t + M.windup * (s.stamina < 0.12 ? 1.5 : 1);
  s.stamina = Math.max(0, s.stamina - M.stamina * tireFx(s.st));
  s.pose = "fight";
  w.stats.swings++;
  // (ms: how long until the blow lands — the screen times the swing's clip and its sound to it)
  w.ev(M.heavy ? "melee.swing.heavy" : "melee.swing.light", { by: s.id, weapon: M.id, at: pos(s), ms: Math.round(s.swing.until - t) });
  w.noise(s.x, s.z, s.floor, NOISE_M.swing, s.i, "swing");
}

export function resolveSwing(w: SimWorld, s: Survivor, z: Zombie): void {
  const M = MELEE[s.melee];
  const victims: Zombie[] = [];
  // a blow lands where the weapon is (CONTACT), with a little room for a body that shifted mid-swing
  const land = Math.min(M.reach + 0.4, (CONTACT[s.melee] ?? 0.8) + 0.45);
  if (z && z.alive && z.floor === s.floor && d2(z, s) <= land ** 2) victims.push(z);
  if (M.sweep > 1) {
    for (const zi of s.threats) {
      const o = w.bodies[zi] as Zombie;
      if (victims.length >= M.sweep) break;
      if (o !== z && o.alive && o.floor === s.floor && d2(o, s) <= land ** 2) victims.push(o);
    }
  }
  if (!victims.length) tally(w, "whiffs");
  const winded = s.stamina < 0.25;
  for (const v of victims) {
    const caught = v.stagger > w.t || (v.state === "idle" && v.target < 0);
    const C = COMBAT;
    const melee = skill(s, "melee");
    const p = C.hitBase + C.hitPerCombat * melee - s.fear * C.hitFear - (winded ? C.hitWinded : 0) - (s.hp < 40 ? C.hitHurt : 0) + (caught ? C.hitCaught : 0);
    if (!w.rng.chance(Math.max(0.08, p))) { tally(w, "misses"); continue; }
    const head = w.rng.chance(Math.max(0.03, C.headBase + C.headPerCombat * melee - s.fear * C.headFear - (winded ? 0.04 : 0) + (caught ? C.headCaught : 0)));
    // (Strength: a harder blow, 1 at strength 5)
    const dmg = M.dmg * (winded ? 0.6 : 1) * strengthFx(s.st, "strengthHit") * w.rng.range(0.85, 1.15);
    gainXp(w, s, "melee", SKILL_XP.meleeHit);
    w.ev(s.melee === "knife" ? "melee.stab" : head ? "melee.hit.head" : "melee.hit", { by: s.id, victim: v.id, weapon: M.id, part: head ? "head" : "torso", at: pos(v) });
    w.noise(v.x, v.z, v.floor, NOISE_M.hit, s.i, "hit");
    tally(w, head ? "headHits" : "bodyHits");
    if (w.hurtZombie(v, dmg, s.i, head, M.heavy)) gainXp(w, s, "melee", SKILL_XP.meleeKill);
    // MELEE WEAPONS DON'T BREAK (fourth round 28)
  }
}

export const ammoOf = (s: Survivor) => s.gun === "rifle" ? s.pack.ammoR : s.pack.ammoP;

export function reload(w: SimWorld, s: Survivor): void {
  const G = GUNS[s.gun!];
  const pool = ammoOf(s);
  if (pool <= 0) { w.ev("gun.dry", { by: s.id, at: pos(s) }); s.gunReadyAt = w.t + 800; return; }
  s.reloadUntil = w.t + G.reloadMs;
  const take = Math.min(G.mag - s.mag, pool);
  s.mag += take;
  if (s.gun === "rifle") s.pack.ammoR -= take; else s.pack.ammoP -= take;
  w.ev(G.reloadEvent, { by: s.id, at: pos(s) });
}

/** Hitscan with spread (§8): ~8° unskilled to ~1° at 10, worse moving / scared, halved aimed. Headshots
 *  kill, body shots slow (fourth round 29). Gunfire draws the dead (15). */
export function shoot(w: SimWorld, s: Survivor, z: Zombie, mult: number): void {
  const G = GUNS[s.gun!];
  if (s.mag <= 0) return;
  s.mag--; w.stats.shots++; w.use(s.gun === "rifle" ? "roundsR" : "roundsP");
  s.gunReadyAt = w.t + G.gap;
  const aimed = w.t - s.stillSince > 500;
  const aim = skill(s, "firearms");
  let spread = Math.max(1.5, G.spread0 - 0.5 * aim);
  if (s.gun === "rifle" && aim < 6) spread *= 1.8;
  if (s.fear > 0.6) spread *= 1.5;
  if (aimed) spread *= 0.6;
  const d = Math.max(0.5, Math.sqrt(d2(z, s)));
  const pHit = Math.max(0.05, Math.min(0.9, 0.22 / (d * Math.tan(spread * Math.PI / 180)))) * mult;
  const hit = w.rng.chance(pHit);
  if (hit) gainXp(w, s, "firearms", SKILL_XP.shotHit);
  const head = hit && w.rng.chance(aimed ? 0.06 + 0.02 * aim : 0.03 + 0.01 * aim);
  // FRIENDLY FIRE HAPPENS, BUT RARELY (third round 23): a miss with somebody of their own near the line
  if (!hit) {
    for (const o of w.survivors) {
      if (o === s || !o.alive || o.mode === "down" || o.floor !== s.floor) continue;
      const ox = o.x - s.x, oz = o.z - s.z, zx = z.x - s.x, zz = z.z - s.z;
      const along = (ox * zx + oz * zz) / (d || 1);
      if (along < 0.5 || along > d + 1) continue;
      const off = Math.abs(ox * zz - oz * zx) / (d || 1);
      if (off < 0.5 && w.rng.chance(0.25)) {
        w.ev(G.event, { by: s.id, victim: o.id, part: "torso", at: pos(s), to: pos(o), friendly: true });
        w.noise(s.x, s.z, s.floor, G.noise, s.i, "shot");
        tally(w, "friendlyFire");
        if (!o.bleeding) o.bleedSince = w.t;
        o.bleeding = Math.max(o.bleeding, 1) as 1 | 2;
        w.hurtSurvivor(o, G.dmg * 0.7, s.i, "blunt", "torso");
        note(o.know, w.t, `${cap(s.who)} shot me by accident`);
        note(s.know, w.t, `I shot ${cap(o.who)} by accident`);
        w.say(s.who, "friendlyFire", { victim: o.who });
        return;
      }
    }
  }
  w.ev(G.event, { by: s.id, ...(hit ? { victim: z.id, part: head ? "head" : "torso" } : {}), at: pos(s), to: pos(z) });
  w.noise(s.x, s.z, s.floor, G.noise, s.i, "shot");
  tally(w, hit ? (head ? "shotHead" : "shotHit") : "shotMiss");
  if (hit) w.hurtZombie(z, G.dmg, s.i, head);
}

// ---- backing off, running, hiding ----------------------------------------------------------------------------
function fleeStep(w: SimWorld, s: Survivor, dt: number): void {
  s.why = s.mode;
  s.held = s.gun ? GUNS[s.gun].id : meleeHeld(s.melee);
  const close = nearestZombie(w, s, MELEE[s.melee].reach);
  if (close && s.mode === "backoff" && s.stamina > 0.1) { fightStep(w, s, dt); s.mode = "backoff"; return; }
  if (!s.path) {
    // THE QUIETER ROOM (third round 24): somewhere they know is calm, away from what's after them
    const room = quietRoom(w, s);
    if (room >= 0) { const c = roomAt(w, room, 0.5, 0.5); const p = c >= 0 ? w.plan(s, c, undefined, false) : null; if (p && p.reached) { s.path = p.pts; s.pi = 0; s.goal = -1; } }
    if (!s.path) {
      let cx = 0, cz = 0, n = 0;
      for (const zi of s.threats) { const z = w.bodies[zi]; cx += z.x; cz += z.z; n++; }
      if (n) {
        const base = Math.atan2(s.x - cx / n, s.z - cz / n);
        for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
          const a = base + turn;
          const c = w.nav.cellAt(s.floor, s.x + Math.sin(a) * 10, s.z + Math.cos(a) * 10);
          const k = c >= 0 && w.nav.isWalk(c) ? c : -1;
          if (k < 0) continue;
          const p = w.plan(s, k, undefined, false);
          if (p && p.reached) { s.path = p.pts; s.pi = 0; s.goal = -1; break; }
        }
      }
    }
  }
  const gait = s.mode === "flee" && s.stamina > 0.15 ? "sprint" : "jog";
  // (a way that can't be walked is let go of, and another found next step: the result used to be ignored, and
  // somebody stood "fleeing" three metres from one of the dead for four minutes — the review's A-4)
  if (moveGait(w, s, gait, dt) === "stuck") s.path = null;
  // shut a door on whoever is following (fifth round 11: they sometimes close doors behind them)
  if (s.lastDoor >= 0 && s.chasedBy >= 0 && w.t - s.lastDoorAt < 3000) {
    const D = w.nav.doors[s.lastDoor];
    const st = w.fac.doors.get(D.id)!;
    const dq = doorPoint(w, s.lastDoor, s.x, s.z), dd = Math.hypot(s.x - dq[0], s.z - dq[1]);
    if (D.kind === "door" && st.open && !st.broken && dd > 0.3 && dd < REACH_M && !someoneInDoor(w, s.lastDoor)) {
      const keepH = s.h;
      touch(w, s, dq[0], dq[1], "door.behind");
      s.h = keepH; s.touchAt = null;
      const r = w.fac.close(s.actor, D.id, w.sideRoom(s, s.lastDoor));
      w.facEv(r, s.id);
      seeDoor(w, s.know, s.lastDoor);
      s.lastDoor = -1;
    }
  }
}

/** The room they know to be calmest that takes them away from the threat (never the tunnel outside). */
function quietRoom(w: SimWorld, s: Survivor): number {
  let cx = 0, cz = 0, n = 0;
  for (const zi of s.threats) { const z = w.bodies[zi]; cx += z.x; cz += z.z; n++; }
  if (n) { cx /= n; cz /= n; }
  let best = -1, bs = -Infinity;
  for (let r = 0; r < w.nav.rooms.length; r++) {
    const R = w.nav.rooms[r];
    if (r === s.room || R.kind === "exit") continue;
    // (nobody indoors runs out into the grounds for quiet: they drew the front door's bolt doing it in one show in three)
    if ((R.outdoor || w.scn?.outside?.(w, r)) && s.room >= 0 && !(w.nav.rooms[s.room].outdoor || w.scn?.outside?.(w, s.room))) continue;
    const mx = R.rect.x + R.rect.w / 2, mz = R.rect.y + R.rect.h / 2;
    const dMe = Math.hypot(mx - s.x, mz - s.z);
    if (dMe > 35) continue;
    const away = n ? Math.hypot(mx - cx, mz - cz) - Math.hypot(s.x - cx, s.z - cz) : 0;
    if (n && away < 4) continue;
    const score = away - s.know.danger[r] * 8 - dMe * 0.3;
    if (score > bs) { bs = score; best = r; }
  }
  return best;
}

function hideStep(w: SimWorld, s: Survivor): void {
  s.why = "hide"; s.pose = "crouch"; s.gait = "crouch"; s.path = null;
  // (hiding has no time limit, and one long hide is one fright: Sarah hid three minutes with the radio's repair in
  // her name and nobody else was offered it — the review's A-6. Twenty seconds hidden, the job is let go.)
  if (s.job && !interruptible(s.job) && w.t - (s.modeAt ?? w.t) > HIDE_GIVES_UP_MS) failJob(w, s, "driven off");
  const z = nearestZombie(w, s, HIDE_FLUSH_M);
  if (z) { s.mode = z.target === s.i ? "flee" : "backoff"; s.modeAt = w.t; }
}

// ---- the job ---------------------------------------------------------------------------------------------------
function jobStep(w: SimWorld, s: Survivor, dt: number): void {
  const t = w.t;
  let picked = false;
  if (quickNeeds(w, s)) return;
  if ((!s.job && (t >= s.retryAt || s.rethink)) || (s.job && (t >= s.job.until || (s.rethink && s.job.kind !== "revive") || (t >= s.nextThink && interruptible(s.job))))) {
    s.rethink = false;
    s.nextThink = t + 30_000;
    pickJob(w, s);
    picked = !!s.job;
  }
  if (!s.job) { s.pose = "idle"; s.gait = "still"; s.why = "idle"; s.path = null; return; }
  runJob(w, s, dt);
  // A JOB PICKED AND GONE THE SAME STEP IS NOT PICKED AGAIN THE NEXT (the re-grade's A-1, Nov 14 2026): a step that
  // lets its job go on entry (the one to go with is resting, the one to guard has finished) left no job, no wait
  // and no memory, so the menu gave the same one back every step: up to 600 choices a minute, 2.3% of all the
  // mansion's survivor time, the body standing in whatever pose it last moved in (a sprint, its wind running
  // out). The menus ask what the steps ask now; this is the net under them.
  if (picked && !s.job && !s.busyAct && s.busyUntil <= t) { s.retryAt = Math.max(s.retryAt, t + 1500); s.pose = "idle"; s.gait = "still"; s.why = "idle"; s.path = null; }
}

/** The job in hand, carried out a step (whoever chose it: the menu's pick, or the admin's own hand, sim/player.ts). */
export function runJob(w: SimWorld, s: Survivor, dt: number): void {
  const j = s.job!;
  s.why = (j.kind === "task" || j.kind === "run") && w.scn?.why ? w.scn.why(j) : j.kind;
  switch (j.kind) {
    case "revive": return reviveStep(w, s, dt);
    case "escort": return escortStep(w, s, dt);
    case "rest": return goThenDo(w, s, dt, () => restHere(w, s), true);
    case "guard": return guardStep(w, s, dt);
    case "talk": return talkStep(w, s, dt);
    case "give": case "steal": return handStep(w, s, dt);
    case "attack": return attackStep(w, s, dt);
    case "run": return goThenDo(w, s, dt, () => { s.job = null; });
    case "confess": return socialAct(w, s);
    case "crank": return goThenDo(w, s, dt, () => startCrank(w, s));
    case "repair": return goThenDo(w, s, dt, () => startRepair(w, s));
    case "call": return goThenDo(w, s, dt, () => startCall(w, s));
    case "task": return goThenDo(w, s, dt, () => { if (w.scn) w.scn.start(w, s); else s.job = null; });
    default: return goThenDo(w, s, dt, () => arrive(w, s));
  }
}

const interruptible = (j: Job) => j.kind === "talk" || j.kind === "rest" || j.kind === "guard" || j.kind === "escort" || j.kind === "clear" || j.kind === "regroup";

/** Walk to the job's cell, then call `done` (every step there when `stay`). */
function goThenDo(w: SimWorld, s: Survivor, dt: number, done: () => void, stay = false): void {
  const j = s.job!;
  if (j.cell === undefined || j.cell < 0) { s.job = null; return; }
  if (j.phase === 0) {
    if (!s.path || s.goal !== j.cell) {
      const p = w.plan(s, j.cell);
      if (!p || !p.reached) {
        const r = w.nav.room[j.cell];
        if ((j.kind === "rest" || j.kind === "clear" || j.kind === "regroup") && !j.sweep && r >= 0) { j.sweep = 1; j.cell = roomAt(w, r, 0.5, 0.5); return; }
        failJob(w, s, p ? "no route all the way" : "no route"); return;
      }
      s.path = p.pts; s.pi = 0; s.goal = j.cell;
    }
    // at the door of a room that sounds bad, the cautious think better of it — never on the way to an objective
    if (j.room !== undefined && j.room !== s.room && (j.kind === "loot" || j.kind === "regroup")) {
      const R = w.nav.rooms[j.room];
      if (s.know.danger[j.room] > (11 - s.gen.caution) * 0.4 && Math.hypot(R.rect.x + R.rect.w / 2 - s.x, R.rect.y + R.rect.h / 2 - s.z) < Math.max(R.rect.w, R.rect.h)) { failJob(w, s, "sounds bad"); return; }
    }
    const urgent = j.kind === "crank" || j.kind === "call" || (j.kind === "guard" && !j.phase) || ((j.kind === "task" || j.kind === "run") && !!w.scn?.urgent(j));
    // the dead they know are about: crouched, slower, careful (REALISM.md → Movement) — unless it's urgent
    const sneak = (j.kind === "loot" ? s.sneak : false) || (!urgent && s.threats.length > 0);
    const res = moveGait(w, s, sneak ? "crouch" : urgent && Math.hypot(s.x - w.nav.centre(j.cell)[0], s.z - w.nav.centre(j.cell)[2]) > 6 ? "jog" : "walk", dt);
    // IN ARM'S REACH, NOT JUST IN THE CELL (Nov 12 2026): the walk counted as done the moment the body crossed into
    // the job's cell, up to 18 cm short of where it stands to use the thing. At the security office's desk that
    // was a hand on the papers from 0.99 m. Somebody come to search keeps walking to the standing spot while the
    // thing is out of reach (never if the walk is stopped: then from where they are, as before).
    const short = res === "moving" && j.kind === "loot" && !!j.target && s.cell === j.cell && outOfReach(w, s, j.target);
    if (res === "arrived" || (s.cell === j.cell && !short)) { j.phase = 1; s.path = null; if (!stay) done(); }
    else if (res === "stuck") {
      // (where they were trying to go is kept a moment: whoever is standing in the way is told by it, escortStep)
      // (the first point of the route that is a real step away: a fresh route begins at the middle of the cell
      // they stand in, which says nothing about which way they are going)
      if (s.path) for (let i = s.pi * 4; i < s.path.length; i += 4) if (Math.hypot(s.path[i] - s.x, s.path[i + 1] - s.z) > 0.6 || i + 4 >= s.path.length) { s.want = [s.path[i], s.path[i + 1], w.t]; break; }
      s.path = null; j.stuck = (j.stuck ?? 0) + 1; if (j.stuck > 20) failJob(w, s, "stuck");
    }
    return;
  }
  if (stay) done();
  // THE WORK WAS CUT SHORT (Nov 14 2026): they had arrived and had their hands on it, and a grab or a fright took
  // the hands off (every arrival either ends the job or starts work that holds them: here, with the job still
  // theirs and nothing in their hands, it was interrupted). Nothing brought them back to it: Dale, driven off the
  // library window with the planks under his arm, stood where the fright left him — jogging on the spot, the job
  // still in his name so nobody else took the window — until the job ran out six minutes later, twice over. Back
  // to it: the walk, and the hands on it again.
  else { j.phase = 0; s.path = null; }
}

/** is the thing still further than a hand reaches from where they stand? */
function outOfReach(w: SimWorld, s: Survivor, target: string): boolean {
  const at = thingAt(w, target);
  return !!at && Math.hypot(at[0] - s.x, at[1] - s.z) > REACH_M - 0.02;
}

function failJob(w: SimWorld, s: Survivor, why = "other"): void {
  const j = s.job;
  const key = `${j?.kind ?? "none"}:${why}`;
  w.stats.jobFails[key] = (w.stats.jobFails[key] ?? 0) + 1;
  if (j) {
    const rid = (r: number) => (r >= 0 ? w.nav.rooms[r].id : "?");
    const at = `${key} ${rid(s.room)}>${j.cell !== undefined && j.cell >= 0 ? rid(w.nav.room[j.cell]) : "?"}${j.target ? " [" + j.target + "]" : ""}${j.sweep ? " (swept)" : ""}`;
    w.stats.jobFailAt[at] = (w.stats.jobFailAt[at] ?? 0) + 1;
  }
  if (j?.room !== undefined) s.failed.set(j.room, w.t);
  if (j?.target) s.failedSpots.set(j.target, w.t);
  // (a job about a person has no spot to remember: it was theirs again within five seconds)
  else if (j && j.ally !== undefined && (j.kind === "revive" || j.kind === "escort")) s.failedSpots.set(j.kind + ":" + j.ally, w.t);
  s.job = null; s.path = null;
  s.retryAt = w.t + 2500;
}

/** Moving with a gait; doors opened on the way. */
export function moveGait(w: SimWorld, s: Survivor, gait: "crouch" | "walk" | "jog" | "sprint", dt: number, cap = Infinity): "moving" | "arrived" | "door" | "stuck" {
  if (gait === "sprint" && s.stamina < 0.1) gait = "jog";
  const leg = s.hp < 30 ? 0.7 : 1;
  if (!s.path && !s.link) { s.gait = "still"; if (s.swing.phase === 0 && s.pose !== "sit") s.pose = "idle"; return "arrived"; }
  // THE PACE THEY'RE IN (REALISM.md → Movement — "everyone moving at the same speed"): one walk for everyone,
  // but how fast follows the moment — a calm stroll when nothing is on, slower winded after a run, careful
  // into a room they've never seen
  const calm = gait === "walk" && s.mode === "job" && !s.alert && !s.link;
  let pace = calm ? 0.82 : 1;
  if (s.stamina < 0.3 && gait !== "sprint") pace *= 0.86;
  if (s.morale < 30) pace *= 0.93;
  const unseen = unseenAhead(w, s);
  if (unseen) pace = Math.min(pace, 0.55);
  const speed = Math.min(cap, SPEED[gait] * leg * pace * (s.sick >= 4 ? INFECTION.confusedSpeed : 1));
  // THE LOOK ROUND: on a calm walk with a way still to go, now and then a stop to look about
  if (calm && !unseen) {
    if ((s.lookUntil ?? 0) > w.t) {
      const dh = Math.atan2(Math.sin((s.lookH ?? s.h) - s.h), Math.cos((s.lookH ?? s.h) - s.h)), max = 2.5 * dt / 1000;
      s.h += Math.max(-max, Math.min(max, dh));
      s.gait = "still"; s.v = 0; s.progAt = w.t;
      if (s.swing.phase === 0) s.pose = "idle";
      return "moving";
    }
    if (w.t >= (s.lookNext ?? -1)) {
      const first = s.lookNext === undefined;
      s.lookNext = w.t + w.rng.range(20_000, 45_000);
      if (!first && pathLeft(s) > 4) { s.lookUntil = w.t + w.rng.range(1200, 2600); s.lookH = s.h + w.rng.range(-1.1, 1.1); }
    }
  }
  const before = s.pi;
  const r = w.walk(s, speed, dt);
  if (s.path && s.pi > before) {
    const tag = s.path[(s.pi - 1) * 4 + 3];
    const d = Nav.tagDoor(tag);
    if (d >= 0) { s.lastDoor = d; s.lastDoorAt = w.t; w.doorUsed[d] = w.t; seeDoor(w, s.know, d); }
  }
  if (r === "door") {
    const d = nextDoor(w, s);
    if (d >= 0 && handOnDoor(w, s, d, dt)) return "moving";
    s.path = null; s.gait = "still";
    return "stuck";
  }
  s.gait = r === "moving" ? gait : "still";
  if (s.link) s.pose = "walk";
  else s.pose = r === "moving" ? (gait === "crouch" ? "crouch-walk" : gait) : "idle";
  if (s.gait === "still") s.stillSince = Math.min(s.stillSince, w.t); else s.stillSince = w.t;
  const n = MOVE_NOISE[gait];
  if (n && r === "moving" && w.t % 1000 < dt) w.noise(s.x, s.z, s.floor, n, s.i, "steps");
  return r;
}

/** A shut door in the way: if it is one they can get through, they step up to it and put a hand on it (true: the
 *  step is spent on that). False: it won't give for them, and they have learned what it needs. */
export function handOnDoor(w: SimWorld, s: Survivor, d: number, dt: number): boolean {
  prepActor(w, s);
  const can = w.fac.canPass(s.actor, w.nav.doors[d].id);
  if (!can.ok) { learnNeed(w, s.know, d, can.why); return false; }
  // A HAND ON THE DOOR (Nov 2026): a shut door stopped the walk wherever the body met it — up to a metre
  // off — and it was opened from there. They step up to where the opening clip's hand meets the leaf (it
  // reaches 0.33 m ahead and 0.43 m to the right: doorStand), at a walk, then reach.
  const st = doorStand(w, d, s);
  const dq = Math.hypot(st.x - s.x, st.z - s.z);
  if (dq > 0.08) {
    const step = Math.min(dq, 1.2 * dt / 1000);
    if (w.stepTo(s, s.x + (st.x - s.x) / dq * step, s.z + (st.z - s.z) / dq * step)) {
      s.h = Math.atan2(st.x - s.x, st.z - s.z); s.gait = "walk"; s.pose = "walk"; return true;
    }
  }
  s.h = st.h;
  touch(w, s, st.hx, st.hz, "door.open"); s.openDoor = d; s.busyUntil = w.t + 500; s.pose = "interact"; s.gait = "still";
  // NO CARD, NO CODE: they pick it (Lockpicking) — slow, and it only gives if they see it through
  if (can.picked) { s.pickDone = w.t + pickMs(s); s.busyUntil = s.pickDone; note(s.know, w.t, `started picking the lock on ${w.nav.doors[d].id}`); }
  return true;
}

/** How far a survivor's route still runs (m) */
function pathLeft(s: Survivor): number {
  const P = s.path;
  if (!P) return 0;
  let d = 0, px = s.x, pz = s.z;
  for (let j = s.pi; j * 4 < P.length; j++) { d += Math.hypot(P[j * 4] - px, P[j * 4 + 1] - pz); px = P[j * 4]; pz = P[j * 4 + 1]; }
  return d;
}

/** A door within a couple of metres ahead on the route that opens into a room this survivor has never seen
 *  (REALISM.md: careful through a doorway only into a room they don't know) */
function unseenAhead(w: SimWorld, s: Survivor): boolean {
  const P = s.path;
  if (!P) return false;
  let d = 0, px = s.x, pz = s.z;
  for (let j = s.pi; j * 4 < P.length && d < 2.2; j++) {
    d += Math.hypot(P[j * 4] - px, P[j * 4 + 1] - pz); px = P[j * 4]; pz = P[j * 4 + 1];
    const door = Nav.tagDoor(P[j * 4 + 3]);
    if (door < 0 || d >= 2.2) continue;
    const D = w.nav.doors[door];
    for (const id of [D.a, D.b]) { const r = w.nav.roomIdx.get(id); if (r !== undefined && r !== s.room && !(s.know.room[r] & SEEN)) return true; }
  }
  return false;
}

/** What a survivor can get through: the card (theirs or a friend's beside them) and the code they know. */
export function prepActor(w: SimWorld, s: Survivor): void {
  s.actor.keycard = w.cardFor(s);
  s.actor.code = s.know.codes.has(RADIO_CODE);
  if (s.actor.kind === "survivor") s.actor.lockpick = skill(s, "lockpicking");
}
/** Can they pick a card or code lock (Lockpicking at LOCKPICK_MIN or more)? */
export const canPick = (s: Survivor): boolean => skill(s, "lockpicking") >= LOCKPICK_MIN;
/** How long a lock takes them (SKILL_FX.lockMs at the least they need, a share off each level past it). */
const pickMs = (s: Survivor): number => SKILL_FX.lockMs * Math.max(0.3, 1 - SKILL_FX.lockCut * (skill(s, "lockpicking") - LOCKPICK_MIN));

function nextDoor(w: SimWorld, s: Survivor): number {
  if (s.doorAhead >= 0) return s.doorAhead;
  if (!s.path) return -1;
  const tag = s.path[s.pi * 4 + 3];
  const d = Nav.tagDoor(tag);
  if (d >= 0) return d;
  const p = Nav.tagPortal(tag);
  return p >= 0 ? w.nav.portals[p].door : -1;
}

function finishOpen(w: SimWorld, s: Survivor): void {
  const d = s.openDoor;
  s.openDoor = -1;
  const D = w.nav.doors[d];
  prepActor(w, s);
  // a lock half picked (a grab, a fright) stays shut: the picking starts over next time
  if (w.fac.canPass(s.actor, D.id).picked && !(s.pickDone && w.t >= s.pickDone)) { s.pickDone = 0; s.path = null; return; }
  const r = w.fac.open(s.actor, D.id, w.sideRoom(s, d));
  if (r.picked) { s.pickDone = 0; gainXp(w, s, "lockpicking", SKILL_XP.pick); note(s.know, w.t, `picked the lock on ${D.id}`); }
  w.facEv(r, s.id);
  w.noise(s.x, s.z, s.floor, NOISE_M.door, s.i, "door");
  seeDoor(w, s.know, d);
  if (!r.ok) { learnNeed(w, s.know, d, r.why); s.path = null; return; }
  // the radio room opened with the code: an objective's step, on the record
  // (the radio room's door and the armory's, by the rooms they open on: any keycard door was "the armory", and the
  // mansion's vault was called that 131 times in 160 shows)
  if (D.kind === "keypad" && (D.a === "radio" || D.b === "radio") && !w.obj.radioOpenAt) { w.obj.radioOpenAt = w.t; progress(w, s); w.say(s.who, "radioRoom"); }
  if (D.kind === "keycard" && (D.a === "armory" || D.b === "armory") && !w.armoryOpenAt) { w.armoryOpenAt = w.t; progress(w, s); w.say(s.who, "armory"); }
}

function quickNeeds(w: SimWorld, s: Survivor): boolean {
  if (s.threats.length) return false;
  if (s.bleeding && s.pack.bandage > 0) return startQuick(w, s, "bandage");
  if (s.hp < 40 && s.pack.medkit > 0) return startQuick(w, s, "medkit");
  if (s.hungerH > NEEDS.hungryAt && s.pack.food > 0) return startQuick(w, s, "eat");
  if (s.thirstH > NEEDS.thirstyAt && s.pack.water > 0) return startQuick(w, s, "drink");
  return false;
}

/** A quick thing out of their own pack, begun: a bandage, a med kit, a tin, a bottle (finishAct ends it). */
export function startQuick(w: SimWorld, s: Survivor, act: "bandage" | "medkit" | "eat" | "drink"): true {
  // (First aid takes a share off — SKILL_FX)
  const treat = 4000 * skillCut(s, "firstAid", SKILL_FX.firstAid);
  const ms = act === "eat" ? 5000 : act === "drink" ? 3000 : treat;
  s.busyAct = act; s.busyUntil = w.t + ms; s.pose = act === "eat" ? "eat" : act === "drink" ? "drink" : "bandage"; s.gait = "still"; s.path = null;
  if (s.onBed) getUp(w, s);
  return true;
}

function finishAct(w: SimWorld, s: Survivor): void {
  const a = s.busyAct;
  s.busyAct = "";
  s.pose = "idle";
  if (a === "bandage" && s.pack.bandage > 0) { s.pack.bandage--; w.use("bandage"); s.bleeding = 0; s.bleedNext = 0; s.hp = Math.min(s.hpMax, s.hp + 5); gainXp(w, s, "firstAid", SKILL_XP.treat); }
  else if (a === "medkit" && s.pack.medkit > 0) { s.pack.medkit--; w.use("medkit"); s.bleeding = 0; s.bleedNext = 0; s.hp = Math.min(s.hpMax, s.hp + medkitHp(s, 60)); gainXp(w, s, "firstAid", SKILL_XP.treat); }
  else if (a === "eat" && s.pack.food > 0) { s.pack.food--; w.use("food"); s.hungerH = Math.max(0, s.hungerH - NEEDS.mealH); s.morale = Math.min(100, s.morale + 2); w.ev("eat.can", { by: s.id, at: pos(s) }); w.noise(s.x, s.z, s.floor, NOISE_M.eat, s.i, "eat"); }
  else if (a === "drink" && s.pack.water > 0) { s.pack.water--; w.use("water"); s.thirstH = Math.max(0, s.thirstH - NEEDS.bottleH); }
  else if (a === "search") finishSearch(w, s);
  else if (a === "revive") finishRevive(w, s);
  else if (a === "crank") keepCranking(w, s);
  else if (a === "repair") keepRepairing(w, s);
  else if (a === "call") finishCall(w, s);
  else if (a === "look") finishLook(w, s);
  else if (a === "task") { if (w.scn) w.scn.keep(w, s); else s.job = null; }
}

// ---- the objectives' hands ------------------------------------------------------------------------------------
/** hands off the crank / the radio (a grab, the dead too close, a better thing to do) — progress is kept */
export function handsOff(w: SimWorld, s: Survivor): void {
  if (s.busyAct === "crank") w.ev("crank.stop", { by: s.id, at: pos(s) });
  s.busyAct = ""; s.touchAt = null;
}

function startCrank(w: SimWorld, s: Survivor): void {
  if (w.obj.sealedAt) { s.job = null; return; }
  const sp = w.nav.spots["crank"];
  if (sp) touch(w, s, sp.at[0], sp.at[2], "crank");
  if (!w.survivors.some((o) => o !== s && o.alive && o.busyAct === "crank")) w.ev("crank.start", { by: s.id, at: pos(s) });
  note(s.know, w.t, "started cranking the blast door shut");
  w.say(s.who, "crank");
  s.busyAct = "crank"; s.busyUntil = w.t + 1000; s.pose = "interact"; s.gait = "still";
}
/** TWO PAIRS OF HANDS ON THE WHEEL (Nov 2026 — Josh: "they have to be right next to something to interact with"):
 *  the crank takes two, and both used to aim at one spot, so the second shoved the first a metre back while they
 *  both went on "cranking". Alone they stand at the wheel; two stand side by side either side of it (order by
 *  who's who, so it's the same every run), each with a hand on its own side of the rim. They step there at a
 *  walk, not a snap. */
const CRANK_SIDE_M = 0.42, CRANK_RIM_M = 0.24, CRANK_STEP_MS = 1.0;
function crankHands(w: SimWorld, s: Survivor, dt: number): void {
  const sp = w.nav.spots["crank"];
  if (!sp) return;
  // (…and the one at the wheel makes room as the second walks up, not once they've arrived on the same spot)
  const pair = w.survivors.filter((o) => o.alive && (o.busyAct === "crank" || (o !== s && o.job?.kind === "crank" && o.mode === "job" && Math.hypot(o.x - sp.stand[0], o.z - sp.stand[2]) < 2.5))).sort((a, b) => a.i - b.i);
  const off = pair.length < 2 ? 0 : (pair.indexOf(s) === 0 ? -1 : 1);
  // the wall runs across the line from where you stand to the wheel
  const fx = sp.at[0] - sp.stand[0], fz = sp.at[2] - sp.stand[2], L = Math.hypot(fx, fz) || 1;
  const tx = fz / L, tz = -fx / L;
  const gx = sp.stand[0] + tx * off * CRANK_SIDE_M, gz = sp.stand[2] + tz * off * CRANK_SIDE_M;
  const dx = gx - s.x, dz = gz - s.z, d = Math.hypot(dx, dz), step = CRANK_STEP_MS * dt / 1000;
  if (d > 0.02) w.stepTo(s, s.x + dx * Math.min(1, step / d), s.z + dz * Math.min(1, step / d));
  const hx = sp.at[0] + tx * off * CRANK_RIM_M, hz = sp.at[2] + tz * off * CRANK_RIM_M;
  s.touchAt = [hx, hz]; s.h = Math.atan2(hx - s.x, hz - s.z);
}
function keepCranking(w: SimWorld, s: Survivor): void {
  // world.secondly() turns the wheel for everyone with their hands on it; here they keep at it
  if (w.obj.sealedAt || w.obj.ending || s.job?.kind !== "crank") { s.job = null; return; }
  s.busyAct = "crank"; s.busyUntil = w.t + 1000; s.pose = "interact";
}

function startRepair(w: SimWorld, s: Survivor): void {
  const o = w.obj;
  const sp = w.nav.spots["radio-set"];
  if (sp) touch(w, s, sp.at[0], sp.at[2], "radio");
  // the first look at the set: it needs a part (follow-up 7)
  if (!s.know.records.has("radio:part")) { s.busyAct = "look"; s.busyUntil = w.t + 6000; s.pose = "search"; return; }
  if (!o.partIn) {
    const i = s.pack.spare.indexOf("part");
    if (i < 0) { s.job = null; return; }
    s.pack.spare.splice(i, 1);
    o.partIn = true;
    note(s.know, w.t, "fitted the part into the radio");
    announce(w, s, `${cap(s.who)} fitted the part into the radio`);
    w.say(s.who, "partIn");
  }
  if (o.fixedAt) { s.job = null; return; }
  s.busyAct = "repair"; s.busyUntil = w.t + 1000; s.pose = "interact"; s.gait = "still";
}
function keepRepairing(w: SimWorld, s: Survivor): void {
  if (w.obj.fixedAt || w.obj.ending || s.job?.kind !== "repair") { s.job = null; return; }
  s.busyAct = "repair"; s.busyUntil = w.t + 1000; s.pose = "interact";
}
/** looking the radio over: it needs a part, and everyone they tell knows it */
function finishLook(w: SimWorld, s: Survivor): void {
  s.know.records.add("radio:part");
  note(s.know, w.t, "the radio's missing a part — a valve or a fuse. The workshop or the stores might have one");
  w.say(s.who, "radioPart");
  progress(w, s);
  if (s.pack.spare.includes("part") && !w.obj.fixedAt) { startRepair(w, s); return; }
  s.job = null;
}

function startCall(w: SimWorld, s: Survivor): void {
  if (!w.obj.fixedAt || w.obj.calledAt) { s.job = null; return; }
  const sp = w.nav.spots["radio-set"];
  if (sp) touch(w, s, sp.at[0], sp.at[2], "radio");
  s.busyAct = "call"; s.busyUntil = w.t + 15_000; s.pose = "talk"; s.gait = "still";
  // the survivor's call is written live by the AI, in their own voice (fourth round 40)
  w.say(s.who, "radioCall", { sealed: !!w.obj.sealedAt });
}
function finishCall(w: SimWorld, s: Survivor): void {
  const o = w.obj;
  s.job = null;
  if (o.calledAt) return;
  o.calledAt = w.t; o.calledBy = s.who;
  w.ev("radio.call", { by: s.id, at: pos(s) });
  note(s.know, w.t, "I called for help on the radio — they said they're coming");
  announce(w, s, `${cap(s.who)} got through on the radio — help is coming`);
  for (const x of w.survivors) if (x.alive) { x.morale = Math.min(100, x.morale + 12); if (Math.hypot(x.x - s.x, x.z - s.z) < 25) x.know.records.add("radio:fixed"); }
  progress(w, s);
}

/** A rest: in an infirmary bed (on the bed, healing faster), else where they stand. */
function restHere(w: SimWorld, s: Survivor): void {
  const j = s.job!;
  s.gait = "still";
  if (j.target && !s.onBed) {
    const bed = Object.values(w.nav.beds).flat().find((b) => b.id === j.target);
    // only from beside it (a route that fell back to the middle of the room is a rest there instead)
    const db = bed ? Math.hypot(bed.stand[0] - s.x, bed.stand[2] - s.z) : Infinity;
    // (beside it first: they lay down on a bed from 1.5 m off — the last steps to its side, then down)
    if (bed && db >= 0.3 && db < 1.2 && w.stepTo(s, s.x + (bed.stand[0] - s.x) / db * Math.min(db, 0.11), s.z + (bed.stand[2] - s.z) / db * Math.min(db, 0.11))) {
      s.h = Math.atan2(bed.stand[0] - s.x, bed.stand[2] - s.z); s.gait = "walk"; s.pose = "walk"; return;
    }
    if (bed && db < 1.2 && !w.survivors.some((o) => o !== s && o.alive && o.bed === bed.id)) {
      touch(w, s, bed.at[0], bed.at[2], "bed"); s.touchAt = null;
      s.x = bed.at[0]; s.y = bed.at[1]; s.z = bed.at[2]; s.onBed = true; s.bed = bed.id;
    }
  }
  s.pose = s.onBed ? "sleep" : "idle";
  if (w.t >= j.until - 1000 || s.hp >= s.hpMax) {
    s.job = null; if (s.onBed) getUp(w, s);
    // (a breather with nothing to get over ended the step it began and was picked again the next: 565 changes of
    // job in a minute, each one a choice put to the mind — the review's A-7. A few seconds standing first.)
    s.retryAt = Math.max(s.retryAt, w.t + 6000);
  }
}
export function getUp(w: SimWorld, s: Survivor): void {
  if (s.onBed && s.bed) {
    const bed = Object.values(w.nav.beds).flat().find((b) => b.id === s.bed);
    if (bed) { const c = w.nav.cellAt(s.floor, bed.stand[0], bed.stand[2]); if (c >= 0) w.place(s, c); }
  }
  s.onBed = false; s.bed = null; s.pose = "idle";
}

/** GUARD: by whoever is at the wheel or the radio, facing the way the dead would come. */
function guardStep(w: SimWorld, s: Survivor, dt: number): void {
  const j = s.job!;
  const o = j.ally !== undefined ? w.bodies[j.ally] as Survivor : null;
  // (a map's own work too: the mansion offers a guard for somebody at a window's boards, and this let it go the
  // step it was taken, every step)
  if (!o || !o.alive || o.mode === "down" || !(HANDS_ON.has(o.busyAct) || (o.job && HANDS_ON.has(o.job.kind)))) { s.job = null; return; }
  goThenDo(w, s, dt, () => {
    s.gait = "still"; s.pose = "idle";
    // face out, away from the one they guard
    s.h = Math.atan2(s.x - o.x, s.z - o.z);
  }, true);
}

/** work a guard stands by: hands on a thing at a spot (the bunker's three, and any map's `task`) */
const HANDS_ON = new Set(["crank", "repair", "call", "task"]);
/** somebody to go with: on their feet and not themselves following or resting (between two jobs is fine: the one
 *  with them stands by a few seconds). What `escortStep` asks on its first line: a menu that offers an escort
 *  asks it too. */
export const canEscort = (o: Survivor): boolean => o.alive && o.mode !== "down" && o.job?.kind !== "escort" && o.job?.kind !== "rest";

// ---- choosing the job -------------------------------------------------------------------------------------------
type Add = (score: number, label: string, job: Omit<Job, "since" | "phase" | "until"> & { until?: number }, id?: string) => void;

/** one line of the menu, with the job it would start */
export type JobOption = MenuOption & { job: Job };

/** THE MENU: everything this survivor could set about right now, as far as they know (the map's own work, the
 *  bunker's objectives, supplies, the sweep, the others, rest) — and whether they are alone.
 *  A body the admin drives (sim/player.ts) reads the same menu: for it nothing is rolled and nothing is thinned
 *  out, so reading it changes nothing and may be done as often as a screen asks. */
export function jobMenu(w: SimWorld, s: Survivor): { menu: JobOption[]; alone: boolean } {
  const t = w.t, k = s.know, nav = w.nav, o = w.obj;
  const hand = !!s.player;
  const { loot: LOOT, notes: NOTES, parts: PARTS, keycard: KEYCARD, crankCell: CRANK_CELL, radioCell: RADIO_CELL } = w.local;
  const menu: JobOption[] = [];
  const add: Add = (score, label, job, id) => {
    if (!Number.isFinite(score)) return;
    const key = id ?? job.kind + (job.target ? ":" + job.target : job.ally !== undefined ? ":" + (w.bodies[job.ally] as Survivor).who : job.room !== undefined ? ":" + nav.rooms[job.room].id : "");
    if (menu.some((m) => m.id === key)) return;
    menu.push({ id: key, kind: job.kind, label, score, job: { since: t, phase: 0, until: t + 20 * 60_000, ...job } });
  };
  const dist = (cell: number) => { const [x, , z] = nav.centre(cell); return Math.hypot(x - s.x, z - s.z); };
  const danger = (r: number) => k.danger[r] * s.gen.caution * 3;
  const fighter = skill(s, "melee") >= 4 || !!s.gun;
  const armed = s.melee !== "fists" || (!!s.gun && s.mag + ammoOf(s) > 0);

  // a friend down that they know of, near enough, and a way to bring them back
  for (const x of w.survivors) {
    if (x === s || !x.alive || x.mode !== "down" || x.turnAt || x.floor !== s.floor) continue;
    const seen = k.ally.get(x.i);
    if (!seen || seen.state !== "down" || t - seen.t > 120_000) continue;
    if (s.pack.bandage + s.pack.medkit === 0) continue;
    if (d2(x, s) > 45 * 45) continue;
    // (ONE PAIR OF HANDS: somebody nearer already going to them, or kneeling, has it. Two went for the same side
    // of one friend and kept each other off it; and a revive just given up as "stuck" is not theirs again at once)
    if (w.survivors.some((p) => p !== s && p.alive && p.mode !== "down" && p.job?.kind === "revive" && p.job.ally === x.i && (p.busyAct === "revive" || d2(p, x) <= d2(s, x)))) continue;
    if (recent(w, s, "revive:" + x.i, 8_000)) continue;
    // (nor with the dead on them: that is a fight first — onTheBody)
    if (onTheBody(w, x)) continue;
    if (s.helping === x.i || hand || w.rng.chance(goBackChance(s.gen, regardOf(w, s, x)) + (isMedic(s) ? 0.3 : 0))) add(300, `get ${nameOf(s, x)} back on their feet`, { kind: "revive", ally: x.i, cell: x.cell, until: t + 90_000 });
  }

  // ---- THE MAP'S OWN OBJECTIVES (sim/scenario.ts; the bunker's are the blocks below) ----
  if (w.scn && !o.ending) w.scn.menu(w, s, add, { dist, danger, fighter, armed });

  // ---- OBJECTIVE 1: THE BLAST DOOR ----
  // (none of the three once the show has ended: the world's progress on them stops there — objectiveWork — so a
  // survivor mid-repair at the hour stood at the set for the rest of the day, the group guarding them, Nov 8 2026)
  if (!o.sealedAt && !o.ending) {
    const crank = CRANK_CELL;
    const vest = nav.roomIdx.get("vestibule") ?? -1;
    const cranking = w.survivors.filter((x) => x !== s && x.alive && (x.busyAct === "crank" || x.job?.kind === "crank"));
    if (crank >= 0 && vest >= 0 && cranking.length < 2) {
      // everyone knows the door is open (follow-up 6); a second pair of hands nearly halves the time. Going for it
      // ALONE through the dead is a different thing from going as a group: the score follows the company they
      // have (allies near, or somebody already at the wheel), and the ones who can't fight wait for company
      const company = Math.min(3, s.allies) + (cranking.length ? 2 : 0);
      const brave = s.gen.assertiveness * 0.8 - s.gen.selfPreservation * 0.6 + company * 14 + (cranking.length ? 18 : 0) - (gene(s.gen, "courage") <= 2 && company < 2 ? 30 : 0);
      add(60 + brave - dist(crank) * 0.35 - danger(vest) * 0.6, cranking.length ? `help ${nameOf(s, cranking[0])} crank the blast door shut` : "crank the blast door shut", { kind: "crank", target: "crank", cell: crank, room: vest, until: t + 6 * 60_000 });
    }
    // one turns the wheel while the others guard (20)
    for (const x of cranking) {
      if (!fighter && !armed) continue;
      // guarding is standing by the wheel: somebody still on their way there is escorted instead (below)
      if (x.busyAct !== "crank") continue;
      const c = guardCell(w, x, s);
      if (c >= 0 && w.canReach(s, c)) add(78 + s.gen.loyalty * 2 + (fighter ? 10 : 0) - dist(c) * 0.3, `guard ${nameOf(s, x)} while they crank the door`, { kind: "guard", ally: x.i, cell: c, until: t + 4 * 60_000 });
    }
  }

  // ---- OBJECTIVE 3: THE RADIO ----
  if (!o.calledAt && !o.ending) {
    const radioRoom = nav.roomIdx.get("radio") ?? -1;
    // (the code is the quick way in; Lockpicking a slow one)
    const hasCode = k.codes.has(RADIO_CODE) || canPick(s);
    const knowsPart = k.records.has("radio:part");
    const holdsPart = s.pack.spare.includes("part");
    // the call, once they know it works
    // ONE PAIR OF HANDS ON THE SET (Nov 2026): one makes the call, one looks it over, one repairs it — three
    // "calling" at once all reached for the same mic and shoved each other a metre off it. The rest guard.
    const atSet = (kind: string) => w.survivors.find((x) => x !== s && x.alive && (x.busyAct === kind || x.job?.kind === kind));
    if (o.fixedAt && k.records.has("radio:fixed") && RADIO_CELL >= 0) {
      const caller = atSet("call");
      if (!caller) add(130 - dist(RADIO_CELL) * 0.3, "call for help on the radio", { kind: "call", target: "radio-set", cell: RADIO_CELL, room: radioRoom, until: t + 6 * 60_000 });
      else if (fighter || armed) { const c = guardCell(w, caller, s); if (c >= 0 && w.canReach(s, c)) add(70 + s.gen.loyalty * 2 - dist(c) * 0.3, `guard ${nameOf(s, caller)} while they call for help`, { kind: "guard", ally: caller.i, cell: c, until: t + 4 * 60_000 }); }
    }
    else if (hasCode && RADIO_CELL >= 0 && !o.fixedAt) {
      const working = w.survivors.some((x) => x !== s && x.alive && (x.busyAct === "repair" || x.busyAct === "look" || x.job?.kind === "repair"));
      if (!knowsPart && !working) add(62 + s.gen.curiosity * 2 - dist(RADIO_CELL) * 0.3, "look the radio over", { kind: "repair", target: "radio-set", cell: RADIO_CELL, room: radioRoom });
      else if ((o.partIn || holdsPart) && !working) add(88 + skillOf(s) * 3 - dist(RADIO_CELL) * 0.3, o.partIn ? "keep working on the radio" : "fit the part and repair the radio", { kind: "repair", target: "radio-set", cell: RADIO_CELL, room: radioRoom, until: t + 8 * 60_000 });
      if (working) for (const x of w.survivors) if (x !== s && x.alive && (x.busyAct === "repair" || x.job?.kind === "repair") && (fighter || armed)) {
        const c = guardCell(w, x, s);
        if (c >= 0 && w.canReach(s, c)) add(55 + s.gen.loyalty * 2 - dist(c) * 0.3, `guard ${nameOf(s, x)} at the radio`, { kind: "guard", ally: x.i, cell: c, until: t + 4 * 60_000 });
      }
    }
    // the code: written on a note somewhere (they'd look where paperwork is kept)
    if (!hasCode) for (const sp of NOTES) {
      if (k.empty.has(sp.id) || claimed(w, s, sp.id) || recent(w, s, sp.id, 4 * 60_000)) continue;
      add(48 + s.gen.curiosity * 2 - dist(sp.cell) * 0.4 - danger(sp.room), `look for the radio room's code in ${theRoom(w, sp.room)}`, { kind: "loot", target: sp.id, cell: sp.cell, room: sp.room });
    }
    // the part, once somebody knows it's needed — and nobody alive has it yet (that they know of)
    if (knowsPart && !o.partIn && !holdsPart && !w.obj.partFoundAt) for (const sp of PARTS) {
      if (k.empty.has(sp.id) || claimed(w, s, sp.id) || recent(w, s, sp.id, 4 * 60_000)) continue;
      add(66 - dist(sp.cell) * 0.4 - danger(sp.room), `look for a part for the radio in ${theRoom(w, sp.room)}`, { kind: "loot", target: sp.id, cell: sp.cell, room: sp.room });
    }
    // the part on them and the radio still to fix: take it to whoever's working, or fix it themselves (above)
  }

  // ---- THE ARMORY ----
  const armory = nav.roomIdx.get("armory") ?? -1;
  // (the card is the quick way into the armory; Lockpicking a slow one)
  const cardNear = w.cardFor(s) > 0 || canPick(s);
  if (!s.gun) {
    if (!cardNear && !w.armoryOpenAt && KEYCARD && !k.empty.has(KEYCARD.id) && !claimed(w, s, KEYCARD.id) && !recent(w, s, KEYCARD.id, 4 * 60_000))
      add(58 + (skill(s, "firearms") >= 5 ? 12 : 0) - dist(KEYCARD.cell) * 0.4 - danger(KEYCARD.room), "find the armory keycard in the security office", { kind: "loot", target: KEYCARD.id, cell: KEYCARD.cell, room: KEYCARD.room });
    // (…and only when they can walk in as far as they know: the armory once opened shuts again behind whoever
    // had the card, and the rest went on picking its lockers and failing at the door — Sarah, six times)
    const inArmory = armory >= 0 && (cardNear || !!w.armoryOpenAt) && (s.room === armory || w.canReach(s, roomAt(w, armory, 0.5, 0.5)));
    if (inArmory) for (const sp of LOOT) {
      if (sp.room !== armory || k.empty.has(sp.id) || claimed(w, s, sp.id) || recent(w, s, sp.id, 3 * 60_000)) continue;
      add(80 + (skill(s, "firearms") >= 5 ? 10 : 0) - dist(sp.cell) * 0.4, `arm up in the armory (${spotWords(sp.id)})`, { kind: "loot", target: sp.id, cell: sp.cell, room: armory });
    }
  } else if (ammoOf(s) + s.mag < GUNS[s.gun].mag * 2 && (cardNear || w.armoryOpenAt)) for (const sp of LOOT) {
    if (sp.room !== armory || k.empty.has(sp.id) || recent(w, s, sp.id, 3 * 60_000) || !/ammo|crate|rack/.test(sp.id)) continue;
    add(45 - dist(sp.cell) * 0.4, `get more rounds in the armory`, { kind: "loot", target: sp.id, cell: sp.cell, room: armory });
  }

  // ---- SUPPLIES: a weapon, bandages, food, a backpack ----
  const needWeapon = s.melee === "fists" ? 30 : 0;
  const needMed = (s.pack.bandage === 0 ? 14 : 0) + (s.hp < 60 && !s.pack.medkit ? 12 : 0);
  // (the pull GROWS with the need, Nov 4 2026: a flat 6 let a thirsty survivor go on escorting a friend for ten hours
  // with nothing to drink — every hour past thirsty/hungry adds 3, up to 30)
  const want = (h: number, at: number) => Math.min(30, Math.max(0, h - at) * 3);
  const needFood = (s.pack.food === 0 ? 6 + want(s.hungerH, NEEDS.hungryAt) : 0) + (s.pack.water === 0 ? 6 + want(s.thirstH, NEEDS.thirstyAt) : 0);
  const full = slotsOf(s.pack) >= slotsMax(s);
  // (where to look first is the MAP's to say: mapdef.ts lootHints)
  const HINT = w.map.lootHints ?? BUNKER_LOOT_HINTS;
  for (const sp of LOOT) {
    if (sp.room === armory || full || k.empty.has(sp.id) || claimed(w, s, sp.id) || recent(w, s, sp.id, 4 * 60_000)) continue;
    const hope = HINT.weapon.test(sp.id) ? needWeapon : HINT.med.test(sp.id) ? needMed * 1.5 : HINT.food.test(sp.id) ? needFood + needWeapon * 0.4 : (needMed + needFood) * 0.4;
    if (hope <= 0 && !hand && w.rng.chance(0.7)) continue;
    add(22 + hope - dist(sp.cell) * 0.6 - danger(sp.room), `search the ${spotWords(sp.id)} in ${theRoom(w, sp.room)}`, { kind: "loot", target: sp.id, cell: sp.cell, room: sp.room });
  }
  for (const dr of w.group.drops) {
    if (!k.drops.has(dr.id) || k.empty.has(dr.id) || claimed(w, s, dr.id) || recent(w, s, dr.id, 10 * 60_000)) continue;
    const room = nav.room[dr.cell];
    if (room < 0) continue;
    const special = dr.card > 0 || dr.items.includes("part");
    add((special ? 120 : 55) - dist(dr.cell) * 0.4 - danger(room) * 0.5, dr.items.includes("part") ? `take the radio part off the body in ${theRoom(w, room)}` : dr.card ? `take ${w.map.keyName ?? "the keycard"} off the body in ${theRoom(w, room)}` : `go through ${dr.who ? cap(dr.who) + "'s" : "the"} things in ${theRoom(w, room)}`, { kind: "loot", target: dr.id, cell: nav.nearestWalk(dr.cell), room });
  }

  // ---- OBJECTIVE 2: CLEAR THE BUNKER — sweep room by room (31: how is the AI's call) ----
  if (armed || fighter) {
    // (shut in with the dead, the sweep is the thing to do. Once the place is clear it is not: the bonus stood for
    // the rest of the hour, and in one bunker show in six on game code the sweep of empty rooms outranked the radio's
    // part for fifty minutes with six alive)
    const sealedBonus = (w.scn ? w.scn.secured(w) : !!o.sealedAt && !o.clearAt) ? 35 : 0;
    let n = 0;
    for (const r of sweepOrder(w, s)) {
      if (n >= 3) break;
      const R = nav.rooms[r];
      // (nor a room whose dead are on a chain: it is going nowhere, and what it guards is somebody's errand)
      if (w.zombies.some((z) => z.leash && z.alive && z.room === r)) continue;
      // (nor a porch open to the grounds: sweepers drew the front door's bolt to "sweep" one, five times in three
      // minutes, the review's B-2)
      if (R.kind === "exit" || R.outdoor || w.scn?.outside?.(w, r) || t - k.swept[r] < SWEEP_FRESH_MS) continue;
      if ((k.danger[r] > DREAD + 2 && !s.gun) || recentRoom(w, s, r, 4 * 60_000)) continue;
      // (each to a place of their own in it: two sent to the middle of one room walked there one inside the other)
      const c = roomAt(w, r, 0.5 + ((s.i % 3) - 1) * 0.2, 0.5 + (Math.floor(s.i / 3) % 2 ? 0.15 : -0.15));
      if (c < 0) continue;
      // (a room behind a door they know they can't open isn't theirs to sweep: the radio room without its code and
      // the armory without the card were offered, set out for and failed "no route", 2.5 times a show)
      if (r !== s.room && !w.canReach(s, c)) continue;
      n++;
      add(30 + sealedBonus + s.gen.assertiveness * 2 + (gene(s.gen, "courage") - 5) * 3 + (k.danger[r] > 0.5 ? 8 : 0) - dist(c) * 0.25, `sweep ${theRoom(w, r)} for the dead`, { kind: "clear", room: r, cell: c, until: t + 8 * 60_000 });
    }
  }

  // ---- WHERE SOMEBODY WAS DRIVEN OFF THEIR WORK, the ones who can fight go and see to it (Nov 14 2026) ----
  // Johanna, planks under her arm, was driven off the solarium's window by what had climbed in at it, twice, six
  // minutes apart; the other five swept bedrooms, and the window stood open for the rest of the night.
  if (armed || fighter) {
    for (const x of w.survivors) {
      const so = x.scaredOff;
      if (x === s || !x.alive || !so || t - so.t > SCARED_HELP_MS || nav.rooms[so.room].outdoor || w.scn?.outside?.(w, so.room) || nav.rooms[so.room].kind === "exit") continue;
      // (been and looked since: it is dealt with)
      if (k.swept[so.room] >= so.t || recentRoom(w, s, so.room, 2 * 60_000)) continue;
      const c = roomAt(w, so.room, 0.5 + ((s.i % 3) - 1) * 0.2, 0.5 + (Math.floor(s.i / 3) % 2 ? 0.15 : -0.15));
      if (c < 0 || (so.room !== s.room && !w.canReach(s, c))) continue;
      add(84 + (gene(s.gen, "courage") - 5) * 3 + s.gen.loyalty - dist(c) * 0.25, `clear the dead out of ${theRoom(w, so.room)}: they drove ${nameOf(s, x)} off`, { kind: "clear", room: so.room, cell: c, until: t + 3 * 60_000 }, "clear:help");
    }
  }

  // ---- THE OTHERS: find them, go with them ----
  // (somebody who is coming WITH them is company on whatever floor they are this second: at the head of a stair
  // the leader was "alone", went back down for the escort still climbing it, and the two of them went up and down
  // for two and a half minutes: the code review's A-9)
  const alone = !w.survivors.some((x) => x !== s && x.alive && x.mode !== "down" && ((x.floor === s.floor && d2(x, s) < 12 * 12) || (x.job?.kind === "escort" && x.job.ally === s.i)));
  if (alone) {
    // where they last saw or heard somebody — or the common room, where people would gather
    let bestRoom = -1, bt = -Infinity;
    for (const [i, a] of k.ally) { const x = w.bodies[i] as Survivor; if (x.alive && a.state !== "dead" && a.t > bt && t - a.t < 10 * 60_000) { bt = a.t; bestRoom = a.room; } }
    // nobody seen or heard yet: they stay where they are and call out (callOut) rather than walk into the dark
    const room = bestRoom;
    const c = room >= 0 && room !== s.room && !recentRoom(w, s, room, 3 * 60_000) ? roomAt(w, room, 0.5, 0.5) : -1;
    if (c >= 0) add(55 + s.gen.sociability * 4 + (gene(s.gen, "courage") <= 3 ? 15 : 0) - s.gen.selfPreservation * 0.5 - dist(c) * 0.2, `find whoever was in ${theRoom(w, room)}`, { kind: "regroup", room, cell: c, until: t + 6 * 60_000 }, "regroup");
  }
  if (wantCompany(s.gen) >= 2) {
    for (const x of w.survivors) {
      if (x === s || !x.alive || x.mode === "down" || !x.job) continue;
      if (!["clear", "loot", "crank", "repair", "regroup"].includes(x.job.kind)) continue;
      if (!(x.room === s.room || d2(x, s) < 15 * 15)) continue;
      // (...and one they can walk to: fifteen metres through a wall, Dale in the radio room, "go with Dale" was
      // offered and let go 82 times in a minute)
      if (x.room !== s.room && !w.canReach(s, x.cell)) continue;
      if (recent(w, s, "escort:" + x.i, 20_000)) continue;
      // (two go with somebody, not four: a third finds something of their own to do. With the bunker clear, four
      // trailed one sweeper round it for the rest of the day, in each other's way at every corner — and in a
      // corridor of the mansion the four of them boxed in the one they were following)
      if (w.survivors.filter((p) => p !== s && p !== x && p.alive && p.job?.kind === "escort" && p.job.ally === x.i).length >= ESCORTS_MAX) continue;
      const timid = gene(s.gen, "courage") <= 3 ? 25 : 0;
      add(32 + timid + s.gen.sociability * 5 + (x.gen.assertiveness - 5) * 2 - Math.sqrt(d2(x, s)) * 0.3, `go with ${nameOf(s, x)}`, { kind: "escort", ally: x.i, cell: x.cell, until: t + 6 * 60_000 });
    }
  }
  // company: a talk, now and then, with somebody resting or guarding nearby
  for (const x of w.survivors) {
    if (x === s || !x.alive || x.room !== s.room || x.mode !== "job") continue;
    if (x.job && !["rest", "guard"].includes(x.job.kind)) continue;
    add(18 + s.gen.sociability * 4 + (x.gen.sociability - 5) * 2 - (w.t - s.lastTalk < 15 * 60_000 ? 60 : 0), `talk with ${nameOf(s, x)}`, { kind: "talk", ally: x.i, cell: x.cell, until: t + (hand ? 2 : w.rng.range(1, 3)) * 60_000 });
  }
  // REST: hurt, an infirmary bed (fifth round 8); otherwise a breather where they are
  if (s.hp < s.hpMax * 0.7) {
    const bed = freeBed(w, s);
    // (a bed they were just driven off is not gone straight back to: one person lay down in it eight times in
    // five minutes with the dead in the room)
    if (bed && !recent(w, s, bed.id, 90_000)) add(40 + (1 - s.hp / s.hpMax) * 90 - dist(bed.cell) * 0.3, "rest in an infirmary bed", { kind: "rest", target: bed.id, cell: bed.cell, room: nav.room[bed.cell], until: t + (hand ? 7 : w.rng.range(4, 10)) * 60_000 });
  }
  add(8 + (s.morale < 35 ? 20 : 0) + (1 - s.hp / s.hpMax) * 30, "take a breather here", { kind: "rest", cell: s.cell, until: t + (hand ? 2 : w.rng.range(1, 3)) * 60_000 });

  socialOptions(w, s, add);
  return { menu, alone };
}

function pickJob(w: SimWorld, s: Survivor): void {
  const t = w.t, k = s.know;
  const { menu, alone } = jobMenu(w, s);
  if (!menu.length) { s.job = null; return; }
  // ALONE OUT THERE: going further alone weighs on the cautious and the weak — except the objectives
  const loneCost = alone ? s.gen.caution * 1.5 + (10 - gene(s.gen, "courage")) * 1.2 + (s.gen.selfPreservation - 5) : 0;
  for (const m of menu) if (m.job.kind === "clear" || m.job.kind === "loot") m.score -= loneCost;
  // THE GROUP'S PLAN (a meeting): who does what — it weighs on the menu, it can't make anything possible
  const gp = w.groupPlan;
  if (gp) {
    const role = gp.team[s.who];
    for (const m of menu) {
      const kd = m.job.kind;
      if (role === "stay") { if (kd === "clear" || kd === "loot") m.score -= 40; else if (kd === "guard" || kd === "rest") m.score += 15; }
      else if (role === "explore") { if (kd === "clear") m.score += 25; }
      else if (role === "scavenge") { if (kd === "loot") m.score += 25; }
      if (gp.zone && (kd === "crank" && gp.zone === "door" || (kd === "repair" || kd === "call") && gp.zone === "radio" || kd === "clear" && gp.zone === "clear")) m.score += 30;
    }
  }
  // stick with what they're doing unless something is clearly better (no dithering on camera)
  if (s.job) for (const m of menu) if (m.job.kind === s.job.kind && m.job.target === s.job.target && m.job.room === s.job.room && m.job.ally === s.job.ally) m.score += 30;
  for (const m of menu) m.score += w.rng.next() * 6;
  menu.sort((a, b) => b.score - a.score);
  const same = (j: Job) => !!s.job && s.job.kind === j.kind && s.job.target === j.target && s.job.room === j.room && s.job.ally === j.ally;
  const offer = [...menu.filter((m) => !SOCIAL_KINDS.has(m.job.kind)).slice(0, CHOICE_MENU_MAX), ...menu.filter((m) => SOCIAL_KINDS.has(m.job.kind))];
  const pick = w.hooks.choose?.(w, s.who, offer.map((m) => ({ id: m.id, kind: m.job.kind, label: m.label, score: Math.round(m.score), current: same(m.job) || undefined, room: m.job.room })));
  if (pick === CHOICE_WAIT) {
    if (s.job && t < s.job.until && stillLegal(w, s, s.job)) { s.nextThink = t + 1500; return; }
    s.job = null; s.retryAt = t + 1500; s.path = null;
    return;
  }
  const picked = pick ? menu.find((m) => m.id === pick) : undefined;
  const chosen = picked && stillLegal(w, s, picked.job) ? picked : menu[0];
  if (s.job && same(chosen.job) && s.job.door === chosen.job.door) { s.job.until = Math.max(s.job.until, chosen.job.until); return; }
  if (s.busyAct === "crank" || s.busyAct === "repair" || s.busyAct === "task") handsOff(w, s);
  s.job = chosen.job;
  s.path = null;
  s.sneak = k.danger[chosen.job.room ?? -1] > 1 && w.rng.chance(sneakChance(s.gen) * 0.5);
}

/** what one calls another: a name once they've met (follow-up 30), else what they look like */
export function nameOf(s: Survivor, o: Survivor): string { return s.met.has(o.who) ? cap(o.who) : "the stranger"; }
const skillOf = (s: Survivor) => s.skills.lv.electronics;

/** the rooms to sweep, nearest first */
function sweepOrder(w: SimWorld, s: Survivor): number[] {
  const out: [number, number][] = [];
  for (let r = 0; r < w.nav.rooms.length; r++) {
    const R = w.nav.rooms[r];
    out.push([r, Math.hypot(R.rect.x + R.rect.w / 2 - s.x, R.rect.y + R.rect.h / 2 - s.z)]);
  }
  return out.sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

/** Is the job they picked (or the model picked for them) still one they could do? */
export function stillLegal(w: SimWorld, s: Survivor, j: Job): boolean {
  const k = s.know;
  switch (j.kind) {
    case "loot": return !!j.target && !k.empty.has(j.target);
    case "crank": return !w.obj.sealedAt && !w.obj.ending;
    case "repair": return !w.obj.fixedAt && !w.obj.ending && (k.codes.has(RADIO_CODE) || canPick(s));
    case "call": return !!w.obj.fixedAt && !w.obj.calledAt && !w.obj.ending;
    case "clear": return j.room !== undefined;
    case "task": return !w.obj.ending && !!w.scn?.legal(w, s, j);
    case "revive": { const o = w.bodies[j.ally!] as Survivor; return o.alive && o.mode === "down"; }
    case "escort": case "talk": case "guard": { const o = w.bodies[j.ally!] as Survivor; return o.alive && o.mode !== "down"; }
    case "give": case "steal": case "confess": return socialLegal(w, s, j);
    default: return j.cell !== undefined && j.cell >= 0;
  }
}

/** a spot they failed at lately */
// (the admin's own body keeps no such grudge: what it tries again is the call of whoever is driving)
export const recent = (w: SimWorld, s: Survivor, id: string, ms: number) => !s.player && s.failedSpots.has(id) && w.t - s.failedSpots.get(id)! < ms;
const recentRoom = (w: SimWorld, s: Survivor, r: number, ms: number) => s.failed.has(r) && w.t - s.failed.get(r)! < ms;

const spotWords = (id: string) => id.replace(/^(private-[ab]|[a-z]+)-/, "").replace(/-\d+$/, "").replace(/-/g, " ");
export const theRoom = (w: SimWorld, r: number) => { const n = r >= 0 ? w.nav.rooms[r].name : "somewhere"; return n.startsWith("The ") ? n : "the " + n; };

/** Somebody else already on their way to this spot (they can see them, or were told lately). */
export function claimed(w: SimWorld, s: Survivor, spot: string): boolean {
  for (const o of w.survivors) {
    if (o === s || !o.alive || !o.job || o.job.target !== spot) continue;
    if (o.room === s.room || d2(o, s) < 15 * 15 || w.t - (s.know.toldAt.get(o.i) ?? -1e12) < 10 * 60_000) return true;
  }
  return false;
}

/** the bunker's own places to look (a map with others names them: mapdef.ts lootHints) */
const BUNKER_LOOT_HINTS = { weapon: /tool|workbench|shelving-steel/, med: /infirmary/, food: /stores|kitchen|mess/ };

/** Where a guard stands: a few steps from the one they guard, toward where the dead would come from. */
export function guardCell(w: SimWorld, o: Survivor, s: Survivor): number {
  const n = w.survivors.filter((x) => x !== s && x.alive && x.job?.kind === "guard" && x.job.ally === o.i).length;
  const toward = o.job?.kind === "crank" || o.busyAct === "crank" ? [40, 60] : [o.x, o.z + 4];
  const base = Math.atan2(toward[0] - o.x, toward[1] - o.z) + (n % 2 ? 0.8 : -0.8) * Math.ceil(n / 2);
  // IN THE ROOM OF THE ONE THEY GUARD (Nov 12 2026): two metres from the wheel toward the tunnel is THROUGH the
  // blast door — the place handed out was outside, where nobody plans to go, and the guard's job failed "no
  // route" (4.5 times a show in a hundred). The same side of them where there's floor in their room, else a
  // little round from it, else the far side.
  for (const turn of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) for (const r of [2.2, 1.6, 2.8]) {
    const c = w.nav.cellAt(o.floor, o.x + Math.sin(base + turn) * r, o.z + Math.cos(base + turn) * r);
    if (c >= 0 && w.nav.walk[c] && w.nav.door[c] < 0 && w.nav.room[c] === o.room) return c;
  }
  return w.nav.nearestWalk(o.cell);
}

// ---- arriving -------------------------------------------------------------------------------------------------------
function arrive(w: SimWorld, s: Survivor): void {
  const j = s.job!;
  if (j.kind === "clear" || j.kind === "regroup") {
    // sweep the room: a few looks round it before calling it clear (it's clear if they saw nothing)
    const R = w.nav.rooms[j.room!];
    j.sweep = (j.sweep ?? 0) + 1;
    if (j.sweep > 2 + Math.floor(R.rect.w * R.rect.h / 120)) {
      if (j.kind === "clear") {
        const seen = s.threats.some((zi) => (w.bodies[zi] as Zombie).room === j.room);
        if (!seen) { s.know.swept[j.room!] = w.t; note(s.know, w.t, `${theRoom(w, j.room!)} looks clear`); }
      }
      s.job = null; return;
    }
    const c = roomAt(w, j.room!, w.rng.range(0.15, 0.85), w.rng.range(0.15, 0.85));
    if (c < 0) { s.job = null; return; }
    j.cell = c; j.phase = 0; s.path = null;
    s.busyUntil = w.t + w.rng.range(1200, 3000); s.pose = "idle";
    return;
  }
  if (j.kind === "shut") {
    const di = w.nav.doorIdx.get(j.target!)!;
    const st = w.fac.doors.get(j.target!)!;
    s.job = null;
    const q = doorPoint(w, di, s.x, s.z);
    if (st.open && !someoneInDoor(w, di) && Math.hypot(q[0] - s.x, q[1] - s.z) <= 1.15) { touch(w, s, q[0], q[1], "door.shut"); w.facEv(w.fac.close(s.actor, j.target!, w.sideRoom(s, di)), s.id); }
    return;
  }
  const at = j.target ? thingAt(w, j.target) : null;
  if (at && j.kind === "loot") touch(w, s, at[0], at[1], j.target!.startsWith("drop:") ? "body" : "loot");
  // (Science reads through a note's papers faster — SKILL_FX)
  const reading = w.local.notes.some((n) => n.id === j.target) ? skillCut(s, "science", SKILL_FX.scienceRead) : 1;
  if (j.kind === "loot") { s.busyAct = "search"; s.busyUntil = w.t + w.rng.range(SEARCH_SPOT_MS[0], SEARCH_SPOT_MS[1]) * skillCut(s, "scavenging", SKILL_FX.scavSearch) * reading; s.pose = "search"; w.ev("box.open", { by: s.id, at: pos(s), spot: j.target }); w.noise(s.x, s.z, s.floor, NOISE_M.box, s.i, "search"); return; }
  s.job = null;
}

/** The nearest point of a door's opening to (x, z) — where a hand goes to open or shut it. */
/** THE DOOR-OPENING CLIP'S HAND (measured, mx-door-opening): its furthest reach is 0.33 m ahead of the body and
 *  0.43 m to its right, at handle height. A body opens a door from DOOR_STAND_M off the door line, set along it
 *  so that hand lands on the leaf (never within DOOR_EDGE_M of its edge) — or, where that place is blocked,
 *  straight in front of the nearest point. */
const DOOR_HAND: [number, number] = [0.33, -0.43];
const DOOR_STAND_M = 0.36, DOOR_EDGE_M = 0.22;
function doorStand(w: SimWorld, d: number, s: Survivor): { x: number; z: number; h: number; hx: number; hz: number } {
  let pl = w.local.doorPlace[d];
  if (pl === undefined) pl = w.local.doorPlace[d] = doorPlacement(w.map.site, w.nav.doors[d].id);
  const c = w.nav.doorCentre[d];
  if (!pl) return { x: s.x, z: s.z, h: Math.atan2(c[0] - s.x, c[2] - s.z), hx: c[0], hz: c[2] };
  const nx = pl.normal[0], nz = pl.normal[2], tx = -nz, tz = nx;
  const sg = Math.sign((s.x - c[0]) * nx + (s.z - c[2]) * nz) || 1;
  const fx = -sg * nx, fz = -sg * nz, h = Math.atan2(fx, fz), svx = Math.cos(h), svz = -Math.sin(h);
  const half = Math.max(0, pl.size[0] / 2 - DOOR_EDGE_M);
  const u0 = (s.x - c[0]) * tx + (s.z - c[2]) * tz;
  // the hand's offset along the door from the body, and the leaf point it can reach from here
  const handAlong = DOOR_HAND[1] * (svx * tx + svz * tz);
  const handU = Math.max(-half, Math.min(half, u0 + handAlong));
  const at = (bodyU: number, back = 0) => ({ x: c[0] + tx * bodyU + sg * nx * (DOOR_STAND_M + back), z: c[2] + tz * bodyU + sg * nz * (DOOR_STAND_M + back) });
  // the hand on the leaf from DOOR_STAND_M; blocked, straight in front of the nearest point; then a little further
  // back each time (the reach of the clip's arm is what's lost, never the door)
  const ok = (b: { x: number; z: number }) => w.canStand(s, w.nav.cellAt(s.floor, b.x, b.z));
  const straight = Math.max(-half, Math.min(half, u0));
  for (const off of [0, 0.08, 0.16, 0.24]) {
    const b1 = at(handU - handAlong, off);
    if (ok(b1)) return { x: b1.x, z: b1.z, h, hx: c[0] + tx * handU, hz: c[2] + tz * handU };
    const b2 = at(straight, off);
    if (ok(b2)) return { x: b2.x, z: b2.z, h, hx: c[0] + tx * straight, hz: c[2] + tz * straight };
  }
  return { x: s.x, z: s.z, h, hx: c[0] + tx * straight, hz: c[2] + tz * straight };
}
export function doorPoint(w: SimWorld, d: number, x: number, z: number): [number, number] {
  let pl = w.local.doorPlace[d];
  if (pl === undefined) pl = w.local.doorPlace[d] = doorPlacement(w.map.site, w.nav.doors[d].id);
  const c = w.nav.doorCentre[d];
  if (!pl) return [c[0], c[2]];
  const tx = -pl.normal[2], tz = pl.normal[0];
  const half = Math.max(0, pl.size[0] / 2 - 0.15);
  const u = Math.max(-half, Math.min(half, (x - c[0]) * tx + (z - c[2]) * tz));
  return [c[0] + tx * u, c[2] + tz * u];
}

function thingAt(w: SimWorld, id: string): [number, number] | null {
  if (id.startsWith("drop:")) { const d = w.group.drops.find((x) => x.id === id); if (!d) return null; const [x, , z] = w.nav.centre(d.cell); return [x, z]; }
  const sp = w.nav.spots[id];
  return sp ? [sp.at[0], sp.at[2]] : null;
}

function finishSearch(w: SimWorld, s: Survivor): void {
  const j = s.job;
  s.job = null;
  if (!j?.target) return;
  const drop = w.group.drops.find((d) => d.id === j.target);
  if (drop) { lootBody(w, s, drop); return; }
  // the map's own finds (a crest, a key, the ledger): its scenario says what a search of that spot turns up
  if (w.scn?.search(w, s, j.target)) return;
  if (w.group.looted.has(j.target)) { s.know.empty.add(j.target); return; }
  const first = !w.group.searched.has(j.target);
  if (first) { w.group.searched.add(j.target); w.stats.spotsLooted++; progress(w, s); }
  const o = w.obj;
  const { notes: NOTES, parts: PARTS, keycard: KEYCARD } = w.local;
  // THE KEYCARD on the security office desk (35)
  if (j.target === KEYCARD?.id) {
    w.group.looted.add(j.target); s.know.empty.add(j.target);
    takeCard(w, s, 1); return;
  }
  // THE NOTE with the radio room's code (picked each run, follow-up 4)
  if (NOTES.some((n) => n.id === j.target)) {
    w.group.looted.add(j.target); s.know.empty.add(j.target);
    if (j.target === o.noteSpot) learnCode(w, s, "note");
    else note(s.know, w.t, `no code in ${theRoom(w, w.nav.spots[j.target] ? w.nav.roomIdx.get(w.nav.spots[j.target].room)! : -1)}`);
    return;
  }
  // THE PART for the radio (picked each run, follow-up 3)
  if (PARTS.some((p) => p.id === j.target)) {
    w.group.looted.add(j.target); s.know.empty.add(j.target);
    if (j.target === o.partSpot && !o.partFoundAt) {
      const left: Item[] = [];
      makeRoom(s, left, true);   // the one part there is always comes away; what it displaces stays here
      if (left.length) w.group.loot.set(j.target, [...(w.group.loot.get(j.target) ?? []), ...left]);
      s.pack.spare.push("part");
      o.partFoundAt = w.t; o.partBy = s.who;
      w.ev("part.found", { by: s.id, at: pos(s) });
      note(s.know, w.t, "found a part that should fit the radio");
      announce(w, s, `${cap(s.who)} found a part for the radio`);
      w.say(s.who, "partFound");
      s.know.records.add("radio:part");
      progress(w, s);
    } else note(s.know, w.t, "nothing here that would fit the radio");
    return;
  }
  gainXp(w, s, "scavenging", SKILL_XP.search);
  if (first) scavengeFind(w, s, j.target);
  const items = [...(w.group.loot.get(j.target) ?? [])].sort((a, b) => TAKE_FIRST.indexOf(a) - TAKE_FIRST.indexOf(b));
  const left: Item[] = [], got: Item[] = [];
  let noRoom = false;
  for (const it of items) { const r = take(w, s, it, true, left); if (r === "took") got.push(it); else if (r === "room") noRoom = true; }
  w.group.loot.set(j.target, left);
  if (got.length) { w.ev("item.found", { by: s.id, items: [...got], at: pos(s) }); s.morale = Math.min(100, s.morale + 1); note(s.know, w.t, `found ${got.length} thing${got.length > 1 ? "s" : ""} in the ${spotWords(j.target)}`); if (got.includes("pistol") || got.includes("rifle")) w.say(s.who, "gun", { gun: s.gun }); }
  if (!left.length) { w.group.looted.add(j.target); s.know.empty.add(j.target); if (!got.length) note(s.know, w.t, `the ${spotWords(j.target)} was empty`); }
  else if (noRoom) { w.ev("item.left", { by: s.id, items: [...left], at: pos(s) }); s.failedSpots.set(j.target, w.t + 20 * 60_000); }
  else s.know.empty.add(j.target);
}

/** SCAVENGING: a first search sometimes turns up one thing more — the kind of thing that container holds
 *  (LOOT_RULES; the armory's fixed finds never grow). At 0 no roll is made at all. */
function scavengeFind(w: SimWorld, s: Survivor, spot: string): void {
  const lv = skill(s, "scavenging");
  if (lv <= 0 || spot.startsWith("drop:")) return;
  const rule = (w.map.lootRules ?? LOOT_RULES).find(([re]) => re.test(spot))?.[1] ?? [];
  const kinds = rule.filter(([, , hi]) => hi > 0).map(([it]) => it);
  if (!kinds.length || !w.rng.chance(SKILL_FX.scavFind * lv)) return;
  const it = w.rng.pick(kinds);
  w.group.loot.set(spot, [...(w.group.loot.get(spot) ?? []), it]);
  w.make(it);   // (the census counts it as made, like a bottle filled at a sink)
  note(s.know, w.t, `turned up something extra in the ${spotWords(spot)}`);
}

/** The code, learned (off the note, or from whoever read it): the radio room opens for them now. */
function learnCode(w: SimWorld, s: Survivor, how: "note" | "told"): void {
  const k = s.know;
  if (k.codes.has(RADIO_CODE)) return;
  k.codes.add(RADIO_CODE);
  const o = w.obj;
  if (!o.codeAt) { o.codeAt = w.t; o.codeBy = s.who; w.ev("note.read", { by: s.id, at: pos(s) }); progress(w, s); }
  note(k, w.t, how === "note" ? "found the radio room's code written on a note" : "learned the radio room's code");
  if (how === "note") { announce(w, s, `${cap(s.who)} found the radio room's code`); w.say(s.who, "code"); }
  s.failed.clear();
}

/** Going through a body's things (§8): the card, the part, then what fits. */
function lootBody(w: SimWorld, s: Survivor, drop: Drop): void {
  if (drop.card) { takeCard(w, s, drop.card); drop.card = 0; }
  let noRoom = false;
  for (const k of ["ammoP", "ammoR"] as const) {
    const have = k === "ammoP" ? drop.rp : drop.rr;
    if (!have) continue;
    const n = fitN(s, k, have);
    if (n < have) noRoom = true;
    if (n <= 0) continue;
    s.pack[k] += n;
    if (k === "ammoP") drop.rp -= n; else drop.rr -= n;
  }
  const items = [...drop.items].sort((a, b) => TAKE_FIRST.indexOf(a) - TAKE_FIRST.indexOf(b));
  const left: Item[] = [], got: Item[] = [];
  for (const it of items) { const r = take(w, s, it, false, left); if (r === "took") got.push(it); else if (r === "room") noRoom = true; }
  drop.items = left;
  if (got.includes("part")) { s.know.records.add("radio:part"); note(s.know, w.t, "took the radio part off the body"); }
  if (drop.who) { const dead = w.survivors.find((o) => o.who === drop.who); if (dead && !dead.alive && dead.bag && !drop.items.includes(dead.bag)) dead.bag = null; }
  if (got.length) w.ev("item.found", { by: s.id, items: [...got], at: pos(s), from: drop.who ? `s:${drop.who}` : undefined });
  if (!drop.items.length && !drop.rp && !drop.rr && !drop.card) { w.group.looted.add(drop.id); s.know.empty.add(drop.id); }
  else if (noRoom) { w.ev("item.left", { by: s.id, items: [...drop.items], at: pos(s) }); s.failedSpots.set(drop.id, w.t + 20 * 60_000); }
  else s.know.empty.add(drop.id);
  if (drop.who) note(s.know, w.t, `went through ${cap(drop.who)}'s things`);
}

function takeCard(w: SimWorld, s: Survivor, tier: number): void {
  if (tier > w.group.keycard) { w.group.keycard = tier; progress(w, s); }
  if (tier > s.card) s.card = tier;
  s.know.cards.set(s.who, { tier: s.card, t: w.t });
  w.stats.keycards++;
  w.ev("keycard.found", { by: s.id, tier, at: pos(s) });
  const cardWords = w.map.keyName ?? "the armory keycard";
  witness(w, s.x, s.z, s.floor, 15, (o) => (o === s ? `I found ${cardWords}` : `${cap(s.who)} found ${cardWords}`));
  for (const o of w.survivors) if (o !== s && o.alive && o.floor === s.floor && d2(o, s) < 15 * 15) o.know.cards.set(s.who, { tier: s.card, t: w.t });
  w.say(s.who, "keycard", { tier, ...(w.map.keyName ? { keyName: w.map.keyName } : {}) });
  s.failed.clear(); s.failedSpots.clear();
}

/** What a search takes first when there isn't room for everything. */
const TAKE_FIRST: Item[] = ["part", "backpack-large", "backpack-small", "rifle", "pistol", "axe", "crowbar", "pipe", "hammer", "knife", "medkit", "ammo", "ammoR", "bandage", "food", "water", "battery"];
type Stock = "food" | "water" | "bandage" | "medkit" | "battery" | "ammoP" | "ammoR";

function fits(s: Survivor, add: Partial<Record<Stock | "spare", number>>): boolean { return slotsOf(s.pack, add) <= slotsMax(s); }
function fitN(s: Survivor, k: Stock, n: number): number {
  let lo = 0, hi = Math.max(0, n);
  while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (fits(s, { [k]: m })) lo = m; else hi = m - 1; }
  return lo;
}
/** Free one slot by leaving things behind in the container: ammo for a gun they don't carry first, then water,
 *  food, spare batteries, bandages (and, with `spares`, a spare weapon). Ammo only goes back in whole boxes, so
 *  the census never splits a round. */
function makeRoom(s: Survivor, left: Item[], spares = false): boolean {
  const P = s.pack;
  for (let guard = 0; guard < 8 && !fits(s, { spare: 1 }); guard++) {
    if (s.gun !== "pistol" && P.ammoP >= 15 && P.ammoP % 15 === 0) { const n = P.ammoP % STACK.ammoP || STACK.ammoP; P.ammoP -= n; for (let i = 0; i < n / 15; i++) left.push("ammo"); continue; }
    if (s.gun !== "rifle" && P.ammoR >= 30 && P.ammoR % 30 === 0) { const n = P.ammoR % STACK.ammoR || STACK.ammoR; P.ammoR -= n; for (let i = 0; i < n / 30; i++) left.push("ammoR"); continue; }
    const k = (["water", "food", "battery", "bandage"] as const).find((x) => x === "battery" ? P.battery > 1 : P[x] > 0);
    if (!k) {
      // last of all, for the one part there is: a spare weapon
      const sp = spares ? s.pack.spare.findIndex((x) => x !== "part") : -1;
      if (sp < 0) return false;
      left.push(P.spare.splice(sp, 1)[0] as Item); continue;
    }
    const n = k === "battery" ? Math.min(STACK.battery, P.battery - 1) : (P[k] % STACK[k] || STACK[k]);
    P[k] -= n; for (let i = 0; i < n; i++) left.push(k);
  }
  return fits(s, { spare: 1 });
}
const spareMelee = (s: Survivor) => s.pack.spare.filter((x) => x in MELEE).length;

/** Take one found thing if there's room for it (§8). ONE GUN EACH (fourth round 31): a second gun is left for
 *  somebody else. `loaded`: a rifle lying in the armory has its magazine in it. */
function take(w: SimWorld, s: Survivor, it: Item, loaded: boolean, left: Item[]): Took {
  const P = s.pack;
  switch (it) {
    case "food": case "water": case "bandage": case "medkit": case "battery":
      if (!fits(s, { [it]: 1 })) { left.push(it); return "room"; }
      P[it]++;
      if (it === "battery" && P.battery === 1 && s.charge <= 0) s.charge = BATTERY_MS;
      return "took";
    case "ammo":
      if (s.gun === "rifle") { left.push(it); return "unwanted"; }
      if (!fits(s, { ammoP: 15 })) { left.push(it); return "room"; }
      P.ammoP += 15; return "took";
    case "ammoR":
      if (s.gun !== "rifle") { left.push(it); return "unwanted"; }
      if (!fits(s, { ammoR: 30 })) { left.push(it); return "room"; }
      P.ammoR += 30; return "took";
    case "part":
      // the radio needs it: room is made for it by leaving the least wanted things behind (it used to go in
      // whether it fitted or not — Rick at 7 of 6 slots)
      if (P.spare.includes("part")) { left.push(it); return "unwanted"; }
      if (!makeRoom(s, left)) { left.push(it); return "room"; }
      P.spare.push("part"); return "took";
    case "backpack-small": case "backpack-large": return wearPack(w, s, it, left);
    case "pistol": case "rifle": {
      // a good shot takes the rifle, anybody else a pistol; one gun each
      if (s.gun) { left.push(it); return "unwanted"; }
      if (it === "rifle" && skill(s, "firearms") < 5 && left.includes("pistol")) { left.push(it); return "unwanted"; }
      // a gun lying in a container has its magazine in it (the census counts it there); one off a body or out of
      // the box doesn't — its rounds were counted loose
      s.gun = it; s.mag = !loaded ? 0 : it === "rifle" ? 30 : 15;
      return "took";
    }
    default: {
      if (MELEE_RANK[it] > MELEE_RANK[s.melee]) {
        const old = s.melee;
        s.melee = it; s.wear = 0;
        if (old !== "fists") { if (spareMelee(s) < SPARE_MELEE && fits(s, { spare: 1 })) P.spare.push(old); else left.push(old as Item); }
        return "took";
      }
      left.push(it); return "unwanted";
    }
  }
}
type Took = "took" | "room" | "unwanted";

/** A BACKPACK (fourth round 30): worn on the back, it adds its slots. Rollo's suit carries its air pack where a
 *  backpack would go. */
function wearPack(w: SimWorld, s: Survivor, it: PackId, left: Item[]): Took {
  if (NO_BACKPACK.has(s.who) || (s.bag && PACK_SLOTS[s.bag] >= PACK_SLOTS[it])) { left.push(it); return "unwanted"; }
  const was = s.bag;
  s.bag = it;
  if (was) left.push(was);
  w.ev("pack.worn", { by: s.id, pack: it, ...(was ? { was } : {}), at: pos(s) });
  note(s.know, w.t, was ? "swapped my pack for a bigger one" : "found a backpack and put it on");
  return "took";
}

// ---- revive, escort, talk, the social moves ------------------------------------------------------------------------
function freeBed(w: SimWorld, s: Survivor): { id: string; cell: number } | null {
  let best: { id: string; cell: number } | null = null, bd = Infinity;
  for (const beds of Object.values(w.nav.beds)) for (const b of beds) {
    if (w.survivors.some((o) => o !== s && o.alive && (o.bed === b.id || (o.job?.kind === "rest" && o.job.target === b.id)))) continue;
    const c = w.local.bedCell.get(b.id) ?? -1;
    if (c < 0) continue;
    const dd = Math.hypot(b.stand[0] - s.x, b.stand[2] - s.z);
    if (dd < bd) { bd = dd; best = { id: b.id, cell: c }; }
  }
  return best;
}

function reviveReflex(w: SimWorld, s: Survivor, dt: number): boolean {
  if (!s.threats.length || s.pack.bandage + s.pack.medkit === 0 || s.grabbedBy.length) return false;
  const kneel = REVIVE_MS * skillCut(s, "firstAid", SKILL_FX.firstAid);
  let o: Survivor | null = null;
  if (s.job?.kind === "revive") o = w.bodies[s.job.ally!] as Survivor;
  else if (s.helping >= 0) o = w.bodies[s.helping] as Survivor;
  if (!o || !o.alive || o.mode !== "down" || o.turnAt || o.floor !== s.floor || d2(o, s) > 15 * 15) return false;
  // (somebody's hands are on them already: the reflex gave the revive back each step it was let go, and two stood
  // over the kneeler for ten seconds)
  if (w.survivors.some((x) => x !== s && x.alive && x.busyAct === "revive" && x.reviving === o!.i)) return false;
  if (o.downUntil - w.t < kneel + 1500) return false;
  for (const z of w.zombies) {
    if (!z.alive || z.floor !== s.floor) continue;
    if (d2(z, o) < 3 * 3 || d2(z, s) < 2 * 2) return false;
  }
  if (s.job?.kind !== "revive") { s.job = { kind: "revive", ally: o.i, cell: o.cell, since: w.t, phase: 0, until: w.t + 90_000 }; s.path = null; tally(w, "revivesUnderFire"); }
  s.mode = "job"; s.swing.phase = 0; s.why = "revive";
  reviveStep(w, s, dt);
  return true;
}

/** one of the dead on its feet within arm's reach of a friend on the floor (feeding on them, or standing over them) */
function onTheBody(w: SimWorld, o: Survivor): boolean {
  for (const z of w.zombies) if (z.alive && !z.lying && !z.leash && z.floor === o.floor && d2(z, o) < 1.3 * 1.3) return true;
  return false;
}

function reviveStep(w: SimWorld, s: Survivor, dt: number): void {
  const j = s.job!;
  const o = w.bodies[j.ally!] as Survivor;
  if (!o.alive || o.mode !== "down" || o.turnAt || (s.pack.bandage + s.pack.medkit === 0)) { s.job = null; return; }
  // THE DEAD ON THE BODY (Nov 16 2026): two of them feeding on Ben in the bunker's vestibule, and three times in
  // half a minute somebody walked up between them to kneel, was kept off the place by their bodies and gave it up
  // "stuck". Nobody kneels among the dead: the revive waits for them to be off the friend.
  if (onTheBody(w, o)) { s.job = null; s.path = null; s.retryAt = w.t + 2000; s.gait = "still"; if (s.swing.phase === 0) s.pose = "idle"; return; }
  // AT THE CHEST, SIDE-ON (sim/lie.ts): where the CPR's hands land on the body as it really lies — the clip puts
  // them 0.47 m ahead of the kneeler and 0.17 m to its left; any side a body can kneel on, the nearer one
  const k = kneelAt(w, s, o);
  const d = Math.hypot(k.x - s.x, k.z - s.z);
  if (d > 0.12) {
    if (d > 1.5) {
      const kc = w.nav.cellAt(o.floor, k.x, k.z);
      if (!s.path || w.t % 1000 < dt) { const p = w.plan(s, kc >= 0 ? kc : o.cell); if (!p) { s.job = null; return; } s.path = p.pts; s.pi = 0; s.goal = -1; }
      moveGait(w, s, d > 3 ? "jog" : "walk", dt);
      return;
    }
    // the last steps straight to the place, at a walk (blocked within arm's reach of it: kneel there)
    s.path = null;
    const step = Math.min(d, 1.1 * dt / 1000);
    const moved = w.stepTo(s, s.x + (k.x - s.x) / d * step, s.z + (k.z - s.z) / d * step);
    if (moved) j.stuckAt = undefined;
    else if (d > 0.45) {
      // KEPT OFF THE PLACE (the re-grade's A-4): refused and more than a hand from it, they "walked" on the spot
      // a metre short, with no other way tried and no giving up, until the friend bled out (ten died of it in
      // 160 mansion shows). Somebody else's hands on the friend: it is theirs. Two seconds of it: kneel where they
      // stand if that is in reach, and if it is not, let it go so that it can be come at again.
      if (w.survivors.some((x) => x !== s && x.alive && x.busyAct === "revive" && x.reviving === o.i)) { s.job = null; s.retryAt = w.t + 4000; s.gait = "still"; s.pose = "idle"; return; }
      j.stuckAt ??= w.t;
      if (w.t - j.stuckAt > 2000) {
        if (d > 0.8) { failJob(w, s, "stuck"); s.gait = "still"; s.pose = "idle"; return; }
        // (in reach: down here, turned to the chest)
      } else { s.h = Math.atan2(k.x - s.x, k.z - s.z); s.gait = "walk"; s.pose = "walk"; return; }
    }
    if (moved) { s.h = Math.atan2(k.x - s.x, k.z - s.z); s.gait = "walk"; s.pose = "walk"; return; }
  }
  s.path = null; s.gait = "still";
  s.h = k.h;
  touch(w, s, k.cx, k.cz, "revive");
  s.busyAct = "revive"; s.reviving = o.i;
  s.busyUntil = w.t + REVIVE_MS * skillCut(s, "firstAid", SKILL_FX.firstAid);
  s.pose = "revive";
}

/** where a reviver kneels over a body on the floor: side-on to its chest, the CPR's hands on it (the measured
 *  clip: 0.47 m ahead, 0.17 m to the left), on whichever side a body can be and is nearer; none: beside it */
// (the show's revive clip, ual1-fixing-kneeling: the two hands 0.38 m ahead, centred — measured)
const CPR_HANDS: [number, number] = [0.38, 0.0];
function kneelAt(w: SimWorld, s: Survivor, o: Survivor): { x: number; z: number; h: number; cx: number; cz: number } {
  const L = lieOf(o);
  const nx = L.uz, nz = -L.ux;
  let best: { x: number; z: number; h: number; cx: number; cz: number } | null = null, bd = Infinity;
  for (const sg of [1, -1]) {
    const fx = -sg * nx, fz = -sg * nz, h = Math.atan2(fx, fz), sx = Math.cos(h), sz = -Math.sin(h);
    const x = L.cx - fx * CPR_HANDS[0] - sx * CPR_HANDS[1], z = L.cz - fz * CPR_HANDS[0] - sz * CPR_HANDS[1];
    { const kc = w.nav.cellAt(o.floor, x, z); if (!w.canStand(s, kc) || w.nav.door[kc] >= 0) continue; }
    const dd = (x - s.x) ** 2 + (z - s.z) ** 2;
    if (dd < bd) { bd = dd; best = { x, z, h, cx: L.cx, cz: L.cz }; }
  }
  if (best) return best;
  // neither side clear (against a wall, a desk): any way round the chest the hands still land on it, nearest first
  for (let k = 0; k < 12; k++) {
    const h = (k / 12) * Math.PI * 2, fx = Math.sin(h), fz = Math.cos(h), sx = Math.cos(h), sz = -Math.sin(h);
    const x = L.cx - fx * CPR_HANDS[0] - sx * CPR_HANDS[1], z = L.cz - fz * CPR_HANDS[0] - sz * CPR_HANDS[1];
    const kc = w.nav.cellAt(o.floor, x, z);
    if (!w.canStand(s, kc) || w.nav.door[kc] >= 0) continue;
    const dd = (x - s.x) ** 2 + (z - s.z) ** 2;
    if (dd < bd) { bd = dd; best = { x, z, h, cx: L.cx, cz: L.cz }; }
  }
  if (best) return best;
  const dx = s.x - o.x, dz = s.z - o.z, D = Math.hypot(dx, dz) || 1;
  return { x: o.x + dx / D * 0.82, z: o.z + dz / D * 0.82, h: Math.atan2(-dx, -dz), cx: o.x, cz: o.z };
}

/** What a med kit heals in this survivor's hands: Science adds a share (exactly the base at Science 0). */
function medkitHp(s: Survivor, base: number): number { return Math.round(base * (1 + SKILL_FX.scienceHeal * skill(s, "science"))); }

function finishRevive(w: SimWorld, s: Survivor): void {
  const o = w.bodies[s.reviving] as Survivor;
  s.reviving = -1; s.job = null;
  if (!o || !o.alive || o.mode !== "down" || d2(o, s) > 2.5 * 2.5) return;
  let hp = 0;
  if (s.pack.bandage > 0) { s.pack.bandage--; w.use("bandage"); hp = 15; }
  else if (s.pack.medkit > 0) { s.pack.medkit--; w.use("medkit"); hp = medkitHp(s, 50); }
  if (!hp) return;
  gainXp(w, s, "firstAid", SKILL_XP.treat);
  w.standUp(o, hp, s.i);
  s.morale = Math.min(100, s.morale + 6); o.morale = Math.min(100, o.morale + 4);
  w.say(s.who, "revived", { who: o.who });
}

/** TURNING ON SOMEBODY (social.ts's "attack" / "finish", only ever a mind's own pick). */
function attackStep(w: SimWorld, s: Survivor, dt: number): void {
  const j = s.job!;
  const o = w.bodies[j.ally!] as Survivor;
  const t = w.t;
  const finish = j.target === "finish";
  if (!o?.alive || o.floor !== s.floor || t >= j.until || (!finish && (o.mode === "down" || s.hp < s.hpMax * 0.3)) || (finish && o.mode !== "down")) {
    s.job = null; s.held = meleeHeld(s.melee); return;
  }
  const M = MELEE[s.melee];
  const d = Math.sqrt(d2(o, s));
  if (s.reloadUntil > t) { s.pose = "reload"; s.gait = "still"; return; }
  const gun = !finish && s.gun && (s.mag > 0 || ammoOf(s) > 0) && d > M.reach && d < 15 && w.nav.sees(s.floor, s.x, s.z, o.x, o.z, w.doorOpenIdx);
  if (gun) {
    s.held = GUNS[s.gun!].id; face(s, o); s.path = null; s.gait = "still"; s.pose = "aim";
    if (s.mag === 0) { reload(w, s); return; }
    if (t >= s.gunReadyAt) shootSurvivor(w, s, o);
    return;
  }
  if (d > M.reach) {
    if (!s.path || (t % 500) < dt) { const p = w.plan(s, o.cell); s.path = p ? p.pts : null; s.pi = 0; s.goal = -1; }
    if (!s.path && d < 2.4) { s.path = [o.x, o.z, o.floor, -1]; s.pi = 0; s.goal = -2; }
    if (!s.path) { s.job = null; return; }
    moveGait(w, s, "jog", dt);
    return;
  }
  // the living keep 0.8 m apart (separate()): a blow between two of them lands from there
  if (d > Math.max(0.85, CONTACT[s.melee] ?? 0.8) + 0.05) { stepIn(w, s, o, dt); return; }
  s.path = null; s.gait = "still"; face(s, o); s.pose = "fight"; s.held = meleeHeld(s.melee);
  if (t < (j.phase || 0)) return;
  j.phase = t + M.windup + M.recover;
  const swingMs = M.windup;
  s.stamina = Math.max(0, s.stamina - M.stamina * tireFx(s.st));
  w.ev(M.heavy ? "melee.swing.heavy" : "melee.swing.light", { by: s.id, weapon: M.id, at: pos(s), ms: swingMs });
  w.noise(s.x, s.z, s.floor, NOISE_M.swing, s.i, "swing");
  if (finish) {
    w.ev("melee.hit", { by: s.id, victim: o.id, weapon: M.id, part: "head", at: pos(o) });
    note(s.know, t, `I finished ${cap(o.who)}`);
    witness(w, o.x, o.z, o.floor, 18, (b) => (b === s ? null : `${cap(s.who)} finished ${cap(o.who)} off`));
    w.ev("survivor.attack", { by: s.id, victim: o.id, kill: true, at: pos(o) });
    w.say(s.who, "killed", { victim: o.who, seenBy: watchers(w, s, o) });
    o.cause = `killed by ${cap(s.who)}`;
    w.dieSurvivor(o, o.cause);
    s.job = null;
    return;
  }
  const C = COMBAT;
  const winded = s.stamina < 0.25;
  const caught = o.job?.kind !== "attack";
  const p = C.hitBase + C.hitPerCombat * skill(s, "melee") - s.fear * C.hitFear - (winded ? C.hitWinded : 0) + (caught ? C.hitCaught : 0) - (C.duckBase + C.duckPerNimble * skill(o, "agility")) * 0.5;
  const first = !j.sweep; j.sweep = 1;
  if (first) { w.ev("survivor.attack", { by: s.id, victim: o.id, at: pos(o) }); w.say(s.who, "attack", { victim: o.who, seenBy: watchers(w, s, o) }); }
  if (!w.rng.chance(Math.max(0.1, p))) { struck(w, o, s); return; }
  const dmg = M.dmg * (winded ? 0.6 : 1) * w.rng.range(0.85, 1.15);
  w.ev(s.melee === "knife" ? "melee.stab" : "melee.hit", { by: s.id, victim: o.id, weapon: M.id, part: "torso", at: pos(o) });
  w.noise(o.x, o.z, o.floor, NOISE_M.hit, s.i, "hit");
  if (s.melee === "knife") { if (!o.bleeding) o.bleedSince = t; o.bleeding = 2; }
  w.hurtSurvivor(o, dmg, s.i, "blunt", "torso");
  struck(w, o, s);
  if (o.mode === "down") { note(s.know, t, `I put ${cap(o.who)} down`); w.say(s.who, "downed", { victim: o.who }); s.job = null; }
}

function watchers(w: SimWorld, s: Survivor, o: Survivor): string[] {
  return w.survivors.filter((b) => b !== s && b !== o && b.alive && b.mode !== "down" && b.floor === o.floor && Math.hypot(b.x - o.x, b.z - o.z) < 18 && w.nav.sees(b.floor, b.x, b.z, o.x, o.z, w.doorOpenIdx)).map((b) => b.who);
}

function shootSurvivor(w: SimWorld, s: Survivor, o: Survivor): void {
  const G = GUNS[s.gun!];
  if (s.mag <= 0) return;
  s.mag--; w.stats.shots++; w.use(s.gun === "rifle" ? "roundsR" : "roundsP");
  s.gunReadyAt = w.t + G.gap;
  let spread = Math.max(1.5, G.spread0 - 0.5 * skill(s, "firearms"));
  if (s.fear > 0.6) spread *= 1.5;
  if (w.t - s.stillSince > 500) spread *= 0.6;
  if (o.gait !== "still") spread *= 1.3;
  const d = Math.max(0.5, Math.sqrt(d2(o, s)));
  const hit = w.rng.chance(Math.max(0.05, Math.min(0.9, 0.22 / (d * Math.tan(spread * Math.PI / 180)))));
  const first = !s.job!.sweep; s.job!.sweep = 1;
  if (first) { w.ev("survivor.attack", { by: s.id, victim: o.id, at: pos(o) }); w.say(s.who, "attack", { victim: o.who, seenBy: watchers(w, s, o) }); }
  w.ev(G.event, { by: s.id, ...(hit ? { victim: o.id, part: "torso" } : {}), at: pos(s), to: pos(o) });
  w.noise(s.x, s.z, s.floor, G.noise, s.i, "shot");
  if (hit) {
    if (!o.bleeding) o.bleedSince = w.t;
    o.bleeding = 2;
    w.hurtSurvivor(o, G.dmg, s.i, "blunt", "torso");
    if (o.mode === "down") { note(s.know, w.t, `I shot ${cap(o.who)} down`); w.say(s.who, "downed", { victim: o.who }); s.job = null; return; }
  }
  struck(w, o, s);
}

/** Set upon by one of their own: FIGHT OR FLIGHT IS CODE'S — a fighter with the health for it turns on them,
 *  anybody else runs for another room. */
function struck(w: SimWorld, o: Survivor, by: Survivor): void {
  if (!o.alive || o.mode === "down" || o.mode === "dead") return;
  if (o.mode !== "job") return;
  if (o.job && (o.job.kind === "attack" || o.job.kind === "run") && o.job.ally === by.i) return;
  if (o.job?.kind === "run") return;
  const t = w.t;
  const fights = skill(o, "melee") >= 4 && o.hp / o.hpMax > fleeHealth(o.gen) && (o.melee !== "fists" || o.gun || skill(o, "melee") >= 6);
  note(o.know, t, `${cap(by.who)} attacked me`);
  if (o.busyAct) handsOff(w, o);
  if (fights) { o.job = { kind: "attack", ally: by.i, cell: by.cell, since: t, phase: t + 300, until: t + 90_000, sweep: 1 }; o.path = null; return; }
  let best = -1, bd = -Infinity;
  for (let r = 0; r < w.nav.rooms.length; r++) {
    const R = w.nav.rooms[r];
    if (r === o.room || R.kind === "exit" || !knowsRoom(o.know, r)) continue;
    const c = roomAt(w, r, 0.5, 0.5);
    if (c < 0) continue;
    const [x, , z] = w.nav.centre(c);
    const gain = Math.hypot(x - by.x, z - by.z) - Math.hypot(x - o.x, z - o.z) * 0.5;
    if (gain > bd) { bd = gain; best = c; }
  }
  if (best >= 0) { o.job = { kind: "run", ally: by.i, cell: best, since: t, phase: 0, until: t + 90_000 }; o.path = null; }
}

/** Give or steal (social.ts): up to arm's length, then the thing changes hands. */
function handStep(w: SimWorld, s: Survivor, dt: number): void {
  const j = s.job!;
  const o = w.bodies[j.ally!] as Survivor;
  if (!o?.alive || o.room !== s.room || w.t >= j.until) { s.job = null; return; }
  const d = Math.sqrt(d2(o, s));
  if (d > 1.7) {
    if (!s.path || w.t % 1000 < dt) {
      const p = w.plan(s, o.cell);
      if (!p || !p.reached) { if (d < 3) { s.path = null; face(s, o); socialAct(w, s); } else s.job = null; return; }
      s.path = p.pts; s.pi = 0; s.goal = -1;
    }
    moveGait(w, s, "walk", dt);
    return;
  }
  s.path = null; s.gait = "still"; face(s, o); s.pose = "idle";
  socialAct(w, s);
}

function talkStep(w: SimWorld, s: Survivor, dt: number): void {
  const j = s.job!;
  const o = w.bodies[j.ally!] as Survivor;
  if (!o.alive || o.mode !== "job" || o.room !== s.room) { s.job = null; return; }
  if (!o.job || o.job.kind !== "talk" || o.job.ally !== s.i) {
    if (o.job && !["rest", "guard"].includes(o.job.kind)) { s.job = null; return; }
    o.job = { kind: "talk", ally: s.i, cell: o.cell, since: w.t, phase: 0, until: j.until };
    o.path = null;
    s.lastTalk = o.lastTalk = w.t;
    w.say(s.who, "chat", { with: o.who });
  }
  const d = Math.sqrt(d2(o, s));
  if (d > 1.6) {
    if (!s.path || w.t % 1000 < dt) { const p = w.plan(s, o.cell); if (!p || !p.reached) { s.job = null; return; } s.path = p.pts; s.pi = 0; s.goal = -1; }
    moveGait(w, s, "walk", dt);
    return;
  }
  s.path = null; s.gait = "still"; face(s, o); s.pose = "talk";
  if (w.t >= j.until) s.job = null;
}

function escortStep(w: SimWorld, s: Survivor, dt: number): void {
  const j = s.job!;
  const o = w.bodies[j.ally!] as Survivor;
  if (!canEscort(o)) { failJob(w, s, "left"); return; }
  // (BETWEEN TWO JOBS, the one they are with is waited on, a few seconds: let go that step, the going-with was
  // picked again the next, and somebody carrying the proof lost their company each time they stopped to think)
  if (!o.job) {
    j.stuckAt ??= w.t;
    if (w.t - j.stuckAt > 5000) { failJob(w, s, "left"); return; }
    s.path = null; s.gait = "still"; if (s.swing.phase === 0) s.pose = "idle";
    return;
  }
  j.stuckAt = undefined;
  const d = Math.sqrt(d2(o, s));
  // MAKE WAY (Nov 14 2026): the one they are with has somewhere to go, is not getting there, and they are standing
  // on the line of it. In the 1.5 m corridor over Glenridge's kitchen wing four people stood round Rollo, who had
  // the car's fuel; he could not get out from among them, gave the errand up "stuck" twice, and the show was lost.
  // Out of the line: to the side if there is floor there, else on ahead the way the other is going.
  // (BLOCKED OUTRIGHT, the one they are with has no route that step: a walk that is refused drops its route and
  // plans again. The rule read the route and so never fired when it was needed most. In the east corridor two
  // escorts stood in front of their leader, each waiting for the other to move, until the errand was given up:
  // found staging this rule, Nov 14 2026. Where they were last trying to go stands in for the route.)
  // (...and a walk refused in the last moment IS "not getting there", whatever speed the body shows: refused,
  // planned again and refused, it steps back and forth on the spot at a walk)
  // (...and so is a walk that is getting nowhere: walked INTO somebody, the body is pushed back off them every step
  // and its speed never falls, and no step is refused. Rollo, sweeping, stood against Johanna who was with him for
  // two seconds at a "walk", then squeezed through her at 24 cm: 18 of 22 steps of two bodies inside each other in
  // sixteen bunker shows were a sweeper and their own escort. The re-grade's E-6. Seven tenths of a second without
  // a third of a metre made, with a route in hand, is blocked.)
  const refused = (!!o.want && w.t - o.want[2] < 800) || (!!o.path && o.busyUntil <= w.t && w.t - o.progAt > 700);
  const to = o.want && w.t - o.want[2] < 800 ? o.want : o.path && o.pi * 4 < o.path.length ? [o.path[o.pi * 4], o.path[o.pi * 4 + 1]] : null;
  if (o.floor === s.floor && !o.link && to && d < 2.2 && (refused || (o.v ?? 0) < 0.3)) {
    const px = to[0] - o.x, pz = to[1] - o.z, pl = Math.hypot(px, pz);
    if (pl > 0.05) {
      const ux = px / pl, uz = pz / pl, rx = s.x - o.x, rz = s.z - o.z;
      const along = rx * ux + rz * uz, side = rx * uz - rz * ux;
      // IN THE WAY is anywhere in the lane a body needs (the living keep 0.8 m): to a leader whose walk has been
      // refused, somebody 0.7 m to one side in a 1.6 m corridor is as much in the way as somebody dead ahead (Dale
      // stood there beside Sarah in the west corridor and was not "on the line"). Such a one steps further out on
      // their OWN side, clear of the lane, or goes on ahead: across the line would only put them on it.
      if (along > (refused ? -0.1 : 0.1) && Math.abs(side) < (refused ? 0.85 : 0.55)) {
        const free = (x: number, z: number) => w.nav.segLine(s.floor, s.x, s.z, x, z, (c) => w.canStand(s, c));
        const sg = side >= 0 ? 1 : -1, out = Math.max(0.3, 0.95 - Math.abs(side));
        const spots: [number, number][] = refused
          ? [[s.x + sg * uz * out, s.z - sg * ux * out]]
          : [[s.x + sg * uz * 0.8, s.z - sg * ux * 0.8], [s.x - sg * uz * 0.8, s.z + sg * ux * 0.8], [s.x + ux * 1.3, s.z + uz * 1.3]];
        for (const [tx, tz] of spots) {
          if (!free(tx, tz)) continue;
          s.path = [tx, tz, s.floor, -1]; s.pi = 0; s.goal = -1;
          moveGait(w, s, "walk", dt);
          s.path = null;
          return;
        }
        // NOWHERE BESIDE AND NO STRAIGHT STEP AHEAD (a passage a body wide, with a bend in it): on along the way
        // the other is going, by their own route to it. Two escorts stood in the mouth of the east corridor's side
        // passage in front of their leader, none of the three with a place to step to, until the errand was given
        // up; before the rule above they squeezed past in a quarter of a minute.
        const oc = o.job?.cell;
        if (oc !== undefined && oc >= 0 && oc !== s.cell) {
          if (!s.path || s.goal !== -3) { const p = w.plan(s, oc); s.path = p ? p.pts : null; s.pi = 0; s.goal = -3; }
          if (s.path) { moveGait(w, s, "walk", dt); return; }
        }
      }
    }
  }
  // NOT NOSE TO TAIL (Josh, Oct 28 2026): close by, a loose FORMATION beside and a little behind
  if (o.floor === s.floor && !o.link && d < 9) {
    const slot = formationSlot(w, s, o);
    if (slot) {
      const ds = Math.hypot(slot[0] - s.x, slot[1] - s.z);
      const moving = o.gait !== "still";
      // IN STEP WITH THEM (the Nov 12 2026 review): beside a walking leader the slot moves, and an escort that
      // reached it stood, fell 0.35 m behind, started, reached it, stood — a stop and a start every other
      // step, 1,300 of them in six shows. While the leader walks, the escort walks: at the leader's pace
      // plus whatever it is behind, toward a point ahead of its place.
      const ov = Math.hypot(o.gvx ?? 0, o.gvz ?? 0);
      // SOMEBODY IN THE WAY is slowed for, not run up to: the room there is ahead on this line (m) sets the pace
      // (the escort used to arrive at a jog and stand the moment it was 0.95 m behind somebody's back)
      const roomAhead = (ux: number, uz: number): number => {
        let gap = Infinity;
        for (const p of w.survivors) {
          if (p === s || !p.alive || p.floor !== s.floor || p.onBed) continue;
          const px = p.x - s.x, pz = p.z - s.z, along = px * ux + pz * uz;
          if (along > 0.3 && along < 4 && Math.abs(px * uz - pz * ux) < 0.75) gap = Math.min(gap, Math.hypot(px, pz));
        }
        return gap;
      };
      const paceFor = (gap: number): number => Math.sqrt(2 * 3 * Math.max(0, gap - 1.0)) + 0.15;
      if (moving) {
        const fx = Math.sin(o.h), fz = Math.cos(o.h);
        const tx = slot[0] + fx * 1.2, tz = slot[1] + fz * 1.2, tl = Math.hypot(tx - s.x, tz - s.z) || 1;
        const gap = roomAhead((tx - s.x) / tl, (tz - s.z) / tl);
        // the leader's pace, plus whatever the escort is behind its place (less, when the place is behind IT)
        const along = (slot[0] - s.x) * fx + (slot[1] - s.z) * fz;
        // AHEAD OF ITS PLACE — the leader has turned and is coming its way: out of the leader's path, onto its own
        // line, and it lets them by there (standing where it was, it was walked into)
        if (along < -0.3) {
          const lat = (slot[0] - s.x) * fz - (slot[1] - s.z) * fx;
          if (Math.abs(lat) > 0.25) {
            const sx = Math.sign(lat) * fz, sz = -Math.sign(lat) * fx, g2 = roomAhead(sx, sz);
            if (g2 >= 0.95) {
              s.path = [s.x + sx * Math.abs(lat), s.z + sz * Math.abs(lat), s.floor, -1]; s.pi = 0; s.goal = -1;
              moveGait(w, s, o.gait === "crouch" ? "crouch" : "walk", dt, paceFor(g2));
              s.path = null;
              return;
            }
          }
          s.path = null; s.gait = "still"; s.pose = "idle"; return;
        }
        const pace = Math.min(paceFor(gap), ov + ds * 1.6);
        if (gap < 0.95 || pace < 0.15) { s.path = null; s.gait = "still"; s.pose = "idle"; if (pace < 0.15 && gap >= 0.95) s.h = o.h; return; }
        s.path = [tx, tz, s.floor, -1]; s.pi = 0; s.goal = -2;
        moveGait(w, s, o.gait === "crouch" && ds < 2.6 ? "crouch" : ds > 1.4 ? "jog" : "walk", dt, pace);
        s.path = null;
        return;
      }
      if (ds < 0.2) { s.path = null; s.gait = "still"; s.pose = "idle"; if (moving) s.h = o.h; else face(s, o); return; }
      const ux = (slot[0] - s.x) / ds, uz = (slot[1] - s.z) / ds;
      const gap = roomAhead(ux, uz);
      if (gap < 0.95) { s.path = null; s.gait = "still"; s.pose = "idle"; return; }
      // (a leader standing still: the place is walked up to and eased onto, like any route's end)
      s.path = [slot[0], slot[1], s.floor, -1]; s.pi = 0; s.goal = -1;
      moveGait(w, s, o.gait === "crouch" && ds < 2.6 ? "crouch" : ds > 2.6 ? "jog" : "walk", dt, paceFor(gap));
      s.path = null;
      return;
    }
  }
  // NO PLACE BESIDE THEM (a nook, a console against a wall): the route is to the leader's own spot, and it is
  // walked up to, not onto — it used to end on top of them, and the two were shoved apart every step (with a
  // wall behind, the escort stood inside its leader for two minutes)
  if (o.floor === s.floor && !o.link && d < 1.15) { s.path = null; s.gait = "still"; s.pose = "idle"; face(s, o); return; }
  if (!s.path || s.goal === -2 || w.t % 1500 < dt) {
    // (the one they are with is on a stair: the route is to where the stair lets them off. Their cell is the foot
    // until they are off it, so two escorts both walked to the foot's own point and stood on it, one inside the
    // other, until the stair was climbed: the code review, Nov 14 2026)
    const oc = o.link ? w.nav.cellAt(o.link.f1, o.link.x1, o.link.z1) : o.cell;
    const p = oc >= 0 ? w.plan(s, oc) : null;
    if (!p || !p.reached) { if (!o.link) s.job = null; return; }
    s.path = p.pts; s.pi = 0; s.goal = oc;
  }
  moveGait(w, s, d > 10 ? "jog" : "walk", dt, o.floor === s.floor && !o.link ? Math.sqrt(2 * 3 * Math.max(0, d - 1.1)) + 0.2 : Infinity);
}

function formationSlot(w: SimWorld, s: Survivor, o: Survivor): [number, number] | null {
  let idx = 0;
  for (const x of w.survivors) if (x !== s && x.alive && x.job?.kind === "escort" && x.job.ally === o.i && x.i < s.i) idx++;
  const fx = Math.sin(o.h), fz = Math.cos(o.h), rx = fz, rz = -fx;
  const side = idx % 2 === 0 ? 1 : -1;
  const back = idx >= 2 ? 2.4 : 1.0;
  const tries: [number, number][] = [[back, 1.2 * side], [back, 0.8 * side], [back, -1.2 * side], [back, -0.8 * side], [back + 0.9, 0.6 * side], [back + 0.9, -0.6 * side], [2.6, 0]];
  for (const [b, l] of tries) {
    const x = o.x - fx * b + rx * l, z = o.z - fz * b + rz * l;
    const c = w.nav.cellAt(o.floor, x, z);
    if (c < 0 || !w.nav.walk[c] || w.nav.room[c] < 0 || w.nav.rooms[w.nav.room[c]].kind === "exit") continue;
    if (w.survivors.some((p) => p !== s && p !== o && p.alive && p.floor === o.floor && Math.hypot(p.x - x, p.z - z) < 0.95)) continue;
    // (nor a place another of their escorts is making for: with one side of the leader walled off, two took the
    // same one and walked to it together)
    if (w.survivors.some((p) => p !== s && p.alive && p.job?.kind === "escort" && p.job.ally === o.i && p.slotAt && w.t - p.slotAt[2] <= 300 && Math.hypot(p.slotAt[0] - x, p.slotAt[1] - z) < 0.9)) continue;
    const dd = w.nav.door[c];
    if (dd >= 0 && !w.doorOpenIdx(dd)) continue;
    if (o.cell < 0 || !w.nav.walkLine(o.cell, c, (k) => w.nav.door[k] < 0 || w.doorOpenIdx(w.nav.door[k]))) continue;
    if (s.cell >= 0 && Math.hypot(x - s.x, z - s.z) < 6 && !w.nav.walkLine(s.cell, c, (k) => w.nav.door[k] < 0 || w.doorOpenIdx(w.nav.door[k]))) continue;
    s.slotAt = [x, z, w.t];
    return [x, z];
  }
  return null;
}

// ---- small things -----------------------------------------------------------------------------------------------------
function face(s: Survivor, o: { x: number; z: number }) { s.h = Math.atan2(o.x - s.x, o.z - s.z); }

function nearestZombie(w: SimWorld, s: Survivor, r: number): Zombie | null {
  let best: Zombie | null = null, bd = r * r;
  for (const z of w.zombies) { if (!z.alive || z.floor !== s.floor || z.lying) continue; const dd = d2(z, s); if (dd < bd) { bd = dd; best = z; } }
  return best;
}

export function someoneInDoor(w: SimWorld, d: number): boolean {
  for (const b of w.bodies) if (b.alive && b.cell >= 0 && w.nav.door[b.cell] === d) return true;
  return false;
}

// (a hand's reach, like everything else they touch: at 0.95 a door was slammed from 5 cm past it, 23 times in a
// hundred shows)
const SLAM_M = REACH_M;
/** SLAM IT: by an open door with the dead on the far side and nothing on this side, they shut it (a shut door
 *  slows the dead, follow-up 13). */
function slam(w: SimWorld, s: Survivor): void {
  if (s.busyUntil > w.t || s.openDoor >= 0) return;
  for (let di = 0; di < w.nav.doors.length; di++) {
    const D = w.nav.doors[di];
    if (D.kind !== "door") continue;
    const c = w.nav.doorCentre[di];
    const q = doorPoint(w, di, s.x, s.z);
    if ((s.x - q[0]) ** 2 + (s.z - q[1]) ** 2 > SLAM_M * SLAM_M) continue;
    const st = w.fac.doors.get(D.id)!;
    if (!st.open || st.broken || someoneInDoor(w, di)) continue;
    const mine = w.sideRoom(s, di);
    const far = mine === D.a ? D.b : D.a;
    let beyond = 0, here = 0;
    for (const zi of s.threats) {
      const z = w.bodies[zi];
      if (!z.alive) continue;
      const rid = w.nav.rooms[z.room]?.id;
      if (rid === far && (z.x - c[0]) ** 2 + (z.z - c[2]) ** 2 < 14 * 14) beyond++;
      else if ((z.x - s.x) ** 2 + (z.z - s.z) ** 2 < 4 * 4) here++;
    }
    if (!beyond || here) continue;
    const r = w.fac.close(s.actor, D.id, mine);
    w.facEv(r, s.id);
    if (r.ok) { touch(w, s, q[0], q[1], "door.slam"); s.busyUntil = w.t + 400; s.pose = "interact"; s.path = null; w.say(s.who, "slam", { door: D.id }); }
    return;
  }
}

// ---- spots the jobs read, resolved once for each world ----------------------------------------------------------------
export interface SpotRef { id: string; room: number; cell: number; kind: string }

/** WHAT ONE WORLD HOLDS OF ITS MAP, WORKED OUT ONCE (world.local; never saved — it is rebuilt from the map): the
 *  zones, the spots the jobs read and where a body stands to use each, the beds' standing cells, each door's
 *  placement and each room's joined-up floor. It was this module's own (one map, one copy); two worlds on two
 *  maps each need theirs. */
export interface SimLocal {
  /** the map's zone ids, in order (knowledge's power arrays are indexed by it) */
  zoneIds: string[];
  /** each zone's stage: the week the design expects a group in (facility.ts expectWeek) */
  stageOf: Record<string, number>;
  loot: SpotRef[]; notes: SpotRef[]; parts: SpotRef[];
  /** every spot of the map by id, whatever its kind (a scenario's own spots are read from here) */
  all: Map<string, SpotRef>;
  keycard: SpotRef | null;
  crankCell: number; radioCell: number;
  /** each room's ways out — [door index, the room beyond] */
  adj: [number, number][][];
  bedCell: Map<string, number>;
  doorPlace: (DoorPlacement | null | undefined)[];
  flood: Map<number, Set<number>>;
}
export function newSimLocal(map: MapDef): SimLocal {
  return {
    zoneIds: map.site.zones.map((z) => z.id), stageOf: Object.fromEntries(map.site.zones.map((z) => [z.id, z.expectWeek])),
    loot: [], notes: [], parts: [], all: new Map(), keycard: null, crankCell: -1, radioCell: -1, adj: [], bedCell: new Map(), doorPlace: [], flood: new Map(),
  };
}

/** Resolve the map's spots against the walk map (at every reset). Every spot is used from THE STANDING CELL
 *  NEAREST ITS FURNITURE (`at`) that a body can walk to from the room — PROXIMITY. */
export function initSpots(w: SimWorld): void {
  const L = w.local;
  L.loot = []; L.notes = []; L.parts = []; L.all = new Map(); L.keycard = null; L.crankCell = -1; L.radioCell = -1;
  L.adj = w.nav.rooms.map(() => []);
  L.bedCell.clear();
  for (const p of w.nav.portals) {
    if (p.door < 0) continue;
    const a = roomOfNode(p.na), b = roomOfNode(p.nb);
    if (a === b) continue;
    L.adj[a].push([p.door, b]); L.adj[b].push([p.door, a]);
  }
  for (const r of w.map.site.rooms) for (const sp of r.spots) {
    const js = w.nav.spots[sp.id];
    if (!js) continue;
    const room = w.nav.roomIdx.get(r.id)!;
    const cell = standCell(w, room, js.floor, js.at, js.stand);
    const ref: SpotRef = { id: sp.id, room, cell, kind: sp.kind };
    L.all.set(sp.id, ref);
    if (sp.kind === "loot") L.loot.push(ref);
    else if (sp.kind === "note") L.notes.push(ref);
    else if (sp.kind === "part") L.parts.push(ref);
    else if (sp.kind === "keycard") L.keycard = ref;
    else if (sp.kind === "crank") L.crankCell = cell;
    else if (sp.kind === "radio") L.radioCell = cell;
  }
  for (const [roomId, beds] of Object.entries(w.nav.beds)) {
    const r = w.nav.roomIdx.get(roomId);
    if (r === undefined) continue;
    for (const b of beds) L.bedCell.set(b.id, standCell(w, r, w.nav.rooms[r].floor, [b.stand[0], 0, b.stand[2]], b.stand));
  }
}
/** The searchable spots (the containers, the keycard's desk, the note and part places) — the harness reads it. */
export const searchSpots = (w: SimWorld): { id: string; room: number; cell: number; kind: string }[] => [...w.local.loot, ...w.local.notes, ...w.local.parts, ...(w.local.keycard ? [w.local.keycard] : [])];
/** The crank's and the radio's standing cells (the harness reads them). */
export const objectiveCells = (w: SimWorld) => ({ crank: w.local.crankCell, radio: w.local.radioCell });

/** Each spot's (and bed's) standing cell and how far it is from the furniture (the harness reads it). */
export function spotReach(w: SimWorld): { id: string; d: number }[] {
  const out: { id: string; d: number }[] = [];
  const at = (cell: number, p: number[]) => { const [x, , z] = w.nav.centre(cell); return Math.hypot(x - p[0], z - p[2]); };
  for (const sp of searchSpots(w)) { const js = w.nav.spots[sp.id]; if (js && sp.cell >= 0) out.push({ id: sp.id, d: at(sp.cell, js.at) }); }
  for (const id of ["crank", "radio-set"]) { const js = w.nav.spots[id]; const c = id === "crank" ? w.local.crankCell : w.local.radioCell; if (js && c >= 0) out.push({ id, d: at(c, js.at) }); }
  for (const beds of Object.values(w.nav.beds)) for (const b of beds) { const c = w.local.bedCell.get(b.id) ?? -1; if (c >= 0) out.push({ id: b.id, d: at(c, b.at) }); }
  return out;
}

function standCell(w: SimWorld, room: number, fl: number, at: number[], stand: number[]): number {
  const nav = w.nav;
  const fallback = nav.nearestWalk(nav.cellAt(fl, stand[0], stand[2]), room);
  const joined = roomFlood(w, room, fl);
  let best = -1, bd = Infinity;
  for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
    const k = nav.cellAt(fl, at[0] + i * 0.25, at[2] + j * 0.25);
    if (k < 0 || !nav.walk[k] || nav.room[k] !== room || nav.door[k] >= 0 || !joined.has(k)) continue;
    const [x, , z] = nav.centre(k);
    const d = Math.hypot(x - at[0], z - at[2]);
    if (d < bd) { bd = d; best = k; }
  }
  if (best < 0) return fallback;
  if (fallback >= 0) { const [x, , z] = nav.centre(fallback); if (Math.hypot(x - at[0], z - at[2]) <= bd) return fallback; }
  return best;
}
function roomFlood(w: SimWorld, room: number, fl: number): Set<number> {
  const key = room * 8 + fl;
  const hit = w.local.flood.get(key);
  if (hit) return hit;
  const nav = w.nav, R = nav.rooms[room];
  let best = new Set<number>();
  const seen = new Set<number>();
  for (let z = R.rect.y + 0.125; z < R.rect.y + R.rect.h; z += 0.25) for (let x = R.rect.x + 0.125; x < R.rect.x + R.rect.w; x += 0.25) {
    const k = nav.cellAt(fl, x, z);
    if (k < 0 || seen.has(k) || !nav.walk[k] || nav.room[k] !== room) continue;
    const part = new Set<number>([k]); seen.add(k);
    const q = [k];
    for (let qi = 0; qi < q.length; qi++) {
      const [cx, , cz] = nav.centre(q[qi]);
      for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
        const n = nav.cellAt(fl, cx + dx, cz + dz);
        if (n < 0 || seen.has(n) || !nav.walk[n] || nav.room[n] !== room) continue;
        seen.add(n); part.add(n); q.push(n);
      }
    }
    if (part.size > best.size) best = part;
  }
  w.local.flood.set(key, best);
  return best;
}

/** A cell in a room a body can actually walk to (out of a pocket boxed in by furniture). */
export function roomCell(w: SimWorld, room: number, fl: number, u: number, v: number): number {
  const c = w.nav.cellInRoom(room, fl, u, v);
  if (c < 0) return c;
  const open = roomFlood(w, room, fl);
  if (!open.size || open.has(c)) return c;
  const [x, , z] = w.nav.centre(c);
  let best = -1, bd = Infinity;
  for (const k of open) { const [kx, , kz] = w.nav.centre(k); const d = (kx - x) ** 2 + (kz - z) ** 2; if (d < bd && w.nav.door[k] < 0) { bd = d; best = k; } }
  return best >= 0 ? best : c;
}
/** The same, on the room's own floor (a map with more than one: the bunker's rooms are all on floor 0). */
export function roomAt(w: SimWorld, room: number, u: number, v: number): number {
  return roomCell(w, room, w.nav.rooms[room].floor, u, v);
}

/** Something that moved the group on (a room, a find, an objective's step): the progress clock. */
export function progress(w: SimWorld, s: Survivor): void { s.lastProgress = w.t; w.group.lastProgress = w.t; }

/** SAVE AND RESUME (save.ts): nothing of this module's needs keeping (world.local is rebuilt from the map). */
export function exportSimState(_w: SimWorld): Record<string, never> { return {}; }
export function importSimState(_w: SimWorld, _d: unknown): void { /* nothing kept */ }

/** The code passed on: two who've met and talk (knowledge.ts share carries `codes`); this is the moment it
 *  lands, for the record. */
export function codeShared(w: SimWorld, s: Survivor): void { learnCode(w, s, "told"); }
void floorOfNode; void VISITED; void SEEN; void NEED; void STACK; void SKILL_XP; void gainXp;
