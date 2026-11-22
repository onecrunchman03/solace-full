// SOLACE SURVIVORZ — WALK THE MAP: THE ADMIN'S OWN BODY (Josh, Nov 13 2026: "the ability as admin in solace to
// spawn into the map and walk around … I should be able to do everything the survivors are supposed to do. do that
// with each available map we have made. this will be the standard also for all future maps").
//
// One survivor of a run may be DRIVEN BY HAND (`s.player`, a walk run: SimOptions.player). For that body the AI
// chooses nothing — no menu pick, no reflex, no line — and everything else is the simulation's ordinary code:
//   · what happens TO it (needs, grabs, bites, bleeding, infection, death) is survivorStep's, untouched;
//   · it MOVES with the walk every survivor uses (survivor.ts moveGait over world.walk): the same gaits and pace,
//     the same turning and weight, the same walk grid, and a shut door it may pass is opened by the same hand on the
//     same leaf (handOnDoor). It slides along a wall, and never stands on a cell a survivor may not;
//   · what it can DO is the survivor's own job menu (survivor.ts jobMenu: the map's scenario and the common work),
//     cut down to what is in reach, plus what is in its pockets and the door in front of it. Doing one starts the
//     SAME job the AI would start, and the ordinary job code carries it out (runJob);
//   · a blow is the simulation's own swing or shot (startSwing / resolveSwing / shoot).
// NOTHING HERE KNOWS A MAP: the bunker's crank and Glenridge's crests arrive as lines of the menu. A new map is
// walkable the day it has a walk grid and a menu (scripts/checks/test_survivorz_walk.mjs holds every map to it).
//
// The four inputs (walkInput / walkDo / walkHit / walkStop) are the only doors in: the broadcast calls them for the
// admin's socket (sim/wire.ts WalkCommand). The same inputs at the same steps replay the same walk. Reading the
// list of actions (walkActions, walkFrame) rolls nothing and changes nothing in the world.
import type { Job, SimWorld, Survivor, Zombie } from "./world";
import { meleeHeld } from "./world";
import type { Portal } from "./nav";
import { roomOfNode } from "./nav";
import type { WalkAction, WalkFrame } from "./wire";
import { GUNS, MELEE, SPEED } from "./tables";
import { OBJ } from "./goals";
import {
  CONTACT, ammoOf, doorPoint, footwork, getUp, handOnDoor, handsOff, jobMenu, moveGait, prepActor, reload, resolveSwing, runJob, shoot,
  someoneInDoor, startQuick, startSwing, stillLegal, theRoom,
} from "./survivor";

/** The dials ✱ */
export const WALK = {
  /** a walk run's clock: nobody is timed out of a map they are looking round (the show's is an hour) */
  SHOW_MS: 6 * 3_600_000,
  /** a push shorter than this is "stand"; longer than HALF is a jog, shorter a walk */
  DEAD: 0.1, HALF: 0.5,
  /** an action is offered when its place is this near, as the body would walk it (m) */
  REACH_M: 2.5,
  /** a door is in front of them within this (the shut job's own reach, survivor.ts arrive) */
  DOOR_M: 1.15,
  /** a stair is taken by walking onto its end (this near it, the push within 60° of the way it runs: LINK_AIM is
   *  that angle's cosine), or offered as an action from LINK_OFFER_M */
  LINK_STEP_M: 0.5, LINK_AIM: 0.5, LINK_OFFER_M: 2.0,
  /** a blow asked for stands this long (ms) if it can't be struck at once (mid-recovery, the gun not ready) */
  HIT_MS: 400,
  /** the push held when an action was chosen stops being "that push" when it moves this far (stick units) */
  HELD_SLACK: 0.2,
  /** a gun is fired at the dead this far off, in a cone this wide in front (rad), or any way round this near */
  SHOT_M: 22, SHOT_CONE: 1.05, SHOT_NEAR_M: 6,
} as const;

/** What a driven body carries of the one driving it. Plain data, saved with the world. */
export interface PlayerCtl {
  /** the push on the stick: x east, z south, length 0..1 */
  mx: number; mz: number; run: boolean; crouch: boolean;
  /** a blow asked for stands until this sim time (0: none) */
  hitUntil: number;
  /** told to let go of everything */
  stop: boolean;
  /** the action in hand, in the menu's words ("" none) */
  label: string;
  /** THE PUSH THAT WAS ALREADY HELD when the action in hand was chosen (or that walked them onto a stair) is not a
   *  push to call it off: `held` while that push ([hx, hz]) still stands. Let go, or pushed another way, the next
   *  push is a new one and lets go of the job. */
  held: boolean; hx: number; hz: number;
  /** a door they were told to open (-1 none) */
  door: number;
  /** the stair they just took: not walked onto again until they have stepped away from its end (-1 none; unlock) */
  lock: number;
  /** a word for the one driving, sent once (walkFrame takes it), and when the last was written */
  note: string; noteAt: number;
  /** the timed action under way: when it began and when it ends (the bar) */
  b0: number; b1: number;
}
export const newPlayerCtl = (): PlayerCtl => ({ mx: 0, mz: 0, run: false, crouch: false, hitUntil: 0, stop: false, label: "", held: false, hx: 0, hz: 0, door: -1, lock: -1, note: "", noteAt: -1e9, b0: 0, b1: 0 });

/** The body the admin drives in this world, if it has one. */
export function playerOf(w: SimWorld): Survivor | null {
  for (const s of w.survivors) if (s.player) return s;
  return null;
}

const pushed = (c: PlayerCtl): boolean => Math.hypot(c.mx, c.mz) >= WALK.DEAD;
/** the push standing right now is the one the job in hand began under */
const hold = (c: PlayerCtl): void => { c.held = pushed(c); c.hx = c.mx; c.hz = c.mz; };
/** a push that is a new one: it lets go of the job in hand */
const newPush = (c: PlayerCtl): boolean => pushed(c) && !c.held;
const say = (w: SimWorld, c: PlayerCtl, text: string): void => { if (text !== c.note || w.t - c.noteAt > 2000) { c.note = text; c.noteAt = w.t; } };
/** can this body act at all right now? */
const able = (s: Survivor): boolean => s.alive && !s.escaped && !s.turned && !s.turnAt && s.mode !== "down" && s.grabbedBy.length === 0;

// ---- the four inputs --------------------------------------------------------------------------------------------
/** The push on the stick (world x east, z south). Anything that isn't a number is "stand"; longer than 1 is cut to 1. */
export function walkInput(w: SimWorld, mx: number, mz: number, run = false, crouch = false): void {
  const s = playerOf(w);
  if (!s) return;
  const c = s.player!;
  if (!Number.isFinite(mx) || !Number.isFinite(mz)) { mx = 0; mz = 0; }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  c.mx = len < WALK.DEAD ? 0 : mx; c.mz = len < WALK.DEAD ? 0 : mz;
  c.run = run === true; c.crouch = crouch === true;
  if (c.held && (len < WALK.DEAD || Math.hypot(c.mx - c.hx, c.mz - c.hz) > WALK.HELD_SLACK)) c.held = false;
}

/** A blow: at the nearest of the dead in reach, or a shot at one further off (playerStep strikes it). */
export function walkHit(w: SimWorld): void {
  const s = playerOf(w);
  if (s) s.player!.hitUntil = w.t + WALK.HIT_MS;
}

/** Let go of whatever is in hand, and stand. */
export function walkStop(w: SimWorld): void {
  const s = playerOf(w);
  if (!s) return;
  const c = s.player!;
  c.mx = 0; c.mz = 0; c.hitUntil = 0; c.stop = true; c.door = -1;
}

/** Do one of the actions in reach, by its id. False (and a note for the one driving) when it isn't one of them
 *  any more, or the hands are on something that has to be seen through first. */
export function walkDo(w: SimWorld, id: string): boolean {
  const s = playerOf(w);
  if (!s || typeof id !== "string") return false;
  const c = s.player!;
  const opt = options(w, s).find((o) => o.id === id);
  if (!opt) { say(w, c, "not from here"); return false; }
  if ((s.busyUntil > w.t || s.busyAct || s.openDoor >= 0) && !letGo(w, s)) { say(w, c, "in a moment"); return false; }
  dropJob(w, s);
  c.stop = false; c.hitUntil = 0; c.door = -1;
  if (s.onBed) getUp(w, s);
  opt.go();
  c.label = opt.label;
  hold(c);
  return true;
}

/** What the admin's screen is told: who they are, what they can do from here, what the hands are on. Takes the
 *  note (it is sent once). Null in a world with no driven body. */
export function walkFrame(w: SimWorld, peek = false): WalkFrame | null {
  const s = playerOf(w);
  if (!s) return null;
  const c = s.player!;
  const f: WalkFrame = { type: "walk", you: s.id, actions: walkActions(w) };
  const b = busyOf(w, s);
  if (b) f.busy = b;
  // (`peek`: a screen that has just joined is told where things stand, and the note stays for the one driving)
  if (c.note && !peek) { f.note = c.note; c.note = ""; }
  return f;
}

/** The actions in reach, nearest first (the wire's shape). */
export function walkActions(w: SimWorld): WalkAction[] {
  const s = playerOf(w);
  return s ? options(w, s).map((o) => ({ id: o.id, label: o.label, kind: o.kind })) : [];
}

// ---- what can be done from here ---------------------------------------------------------------------------------
interface Option { id: string; label: string; kind: string; d: number; go: () => void }

/** the menu's kinds a pair of hands does at a place (the rest — sweep a room, go with somebody, run inside — are
 *  walked by hand) */
const HAND_KINDS = new Set(["loot", "crank", "repair", "call", "task", "rest", "revive"]);
/** …and the ones that keep the hands on a thing until it is done */
const HANDS_ON = new Set(["crank", "repair", "call", "task"]);

function options(w: SimWorld, s: Survivor): Option[] {
  if (!able(s) || s.link) return [];
  const c = s.player!, nav = w.nav, t = w.t;
  const out: Option[] = [];
  const begin = (job: Job) => () => { s.job = { ...job, since: w.t, phase: 0 }; s.path = null; s.sneak = false; };

  // THE SURVIVOR'S OWN MENU, in reach
  let breather: Option | null = null;
  for (const m of jobMenu(w, s).menu) {
    if (!HAND_KINDS.has(m.kind) || m.job.cell === undefined) continue;
    const d = reach(w, s, m.job.cell);
    if (d === Infinity) continue;
    const o: Option = { id: m.id, label: m.label, kind: m.kind, d, go: begin(m.job) };
    if (m.kind === "rest" && !m.job.target) breather = o; else out.push(o);
  }
  out.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));

  // THE DOOR IN FRONT OF THEM: shut it, or open it
  for (let di = 0; di < nav.doors.length; di++) {
    const D = nav.doors[di];
    if (D.kind === "doorway" || D.kind === "vault" || D.kind === "window" || D.kind === "vent" || D.kind === "grate") continue;
    const dc = nav.doorCentre[di];
    if (Math.abs(dc[0] - s.x) > 4 || Math.abs(dc[2] - s.z) > 4) continue;
    const q = doorPoint(w, di, s.x, s.z), dq = Math.hypot(q[0] - s.x, q[1] - s.z);
    if (dq > WALK.DOOR_M || nav.door[nav.cellAt(s.floor, q[0], q[1])] !== di) continue;
    const st = w.fac.doors.get(D.id)!;
    if (st.broken) continue;
    const mine = w.sideRoom(s, di), far = nav.roomIdx.get(mine === D.a ? D.b : D.a) ?? -1;
    if (st.open) {
      // (a leaf on hinges, as the AI shuts: this offered the armory's and the vault's steel too, which the dead
      // cannot push and no survivor ever shuts: the code review's C-5)
      if (D.kind !== "door" || someoneInDoor(w, di)) continue;
      out.push({ id: "shut:" + D.id, label: `shut the door to ${theRoom(w, far)}`, kind: "shut", d: dq, go: begin({ kind: "shut", target: D.id, cell: s.cell, since: t, phase: 0, until: t + 10_000 }) });
    } else {
      prepActor(w, s);
      const can = w.fac.canPass(s.actor, D.id);
      if (can.ok) out.push({ id: "open:" + D.id, label: `${can.picked ? "pick the lock on" : "open"} the door to ${theRoom(w, far)}`, kind: "open", d: dq, go: () => { c.door = di; } });
    }
  }

  // A STAIR, A LADDER: from a little way off, with a clear line to its foot
  for (const L of linksAt(w, s, WALK.LINK_OFFER_M)) {
    out.push({ id: "link:" + L.p.idx, label: linkLabel(w, L), kind: "link", d: L.d, go: () => takeLink(w, s, L) });
  }

  // OUT OF THEIR OWN POCKETS
  const P = s.pack;
  if (s.bleeding && P.bandage > 0) out.push({ id: "bandage", label: "bandage the wound", kind: "bandage", d: 0, go: () => { startQuick(w, s, "bandage"); } });
  if (s.hp < s.hpMax && P.medkit > 0) out.push({ id: "medkit", label: "use a med kit", kind: "medkit", d: 0, go: () => { startQuick(w, s, "medkit"); } });
  if (P.food > 0) out.push({ id: "eat", label: "eat something", kind: "eat", d: 0, go: () => { startQuick(w, s, "eat"); } });
  if (P.water > 0) out.push({ id: "drink", label: "drink some water", kind: "drink", d: 0, go: () => { startQuick(w, s, "drink"); } });
  if (s.gun && s.mag < GUNS[s.gun].mag && ammoOf(s) > 0 && s.reloadUntil <= t) out.push({ id: "reload", label: "reload", kind: "reload", d: 0, go: () => { reload(w, s); s.held = GUNS[s.gun!].id; } });
  if (breather) out.push(breather);
  return out;
}

/** How far the body would walk to stand on `cell` (m): Infinity when it is out of reach, on another floor, or
 *  behind anything shut. */
function reach(w: SimWorld, s: Survivor, cell: number): number {
  const nav = w.nav;
  if (cell < 0 || s.cell < 0 || nav.floorOfCell(cell) !== s.floor) return Infinity;
  if (cell === s.cell) return 0;
  const [x, , z] = nav.centre(cell);
  const d = Math.hypot(x - s.x, z - s.z);
  if (d > WALK.REACH_M) return Infinity;
  if (nav.segLine(s.floor, s.x, s.z, x, z, (k) => w.canStand(s, k))) return d;
  // round a corner, a table: as the route runs, through nothing shut
  const p = nav.route(s.cell, cell, (di) => (w.doorOpenIdx(di) ? 1 : 0));
  if (!p || !p.reached) return Infinity;
  let len = 0, px = s.x, pz = s.z;
  for (let i = 0; i < p.pts.length; i += 4) {
    if (p.pts[i + 2] !== s.floor || p.pts[i + 3] >= 2000) return Infinity;
    len += Math.hypot(p.pts[i] - px, p.pts[i + 1] - pz); px = p.pts[i]; pz = p.pts[i + 1];
  }
  return len <= WALK.REACH_M ? len : Infinity;
}

// ---- stairs and ladders -------------------------------------------------------------------------------------------
interface LinkEnd { p: Portal; near: number; far: number; d: number }

/** May this body take this way at all? (the living never climb a broken window; a vent wants the agility for it; a
 *  stair under floor that opens is a way once the floor has opened) */
function linkOk(w: SimWorld, s: Survivor, p: Portal): boolean {
  if (p.kind === "door" || p.kind === "window") return false;
  if (p.kind === "vent") return (s.st.agility ?? 5) >= 7;
  return p.door < 0 || w.doorOpenIdx(p.door);
}

/** the stairs, ladders and lifts with an end on this floor within `r` metres of the body, a clear walk away (by
 *  where the end IS: a stair's foot is not always in the room the stair is counted to) */
function linksAt(w: SimWorld, s: Survivor, r: number): LinkEnd[] {
  const nav = w.nav, out: LinkEnd[] = [];
  if (s.cell < 0) return out;
  for (const p of nav.portals) {
    if (!linkOk(w, s, p)) continue;
    for (const [near, far] of [[p.ca, p.cb], [p.cb, p.ca]]) {
      if (nav.floorOfCell(near) !== s.floor) continue;
      const [x, , z] = nav.centre(near);
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > r) continue;
      if (near !== s.cell && !nav.segLine(s.floor, s.x, s.z, x, z, (k) => w.canStand(s, k))) continue;
      out.push({ p, near, far, d });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.p.idx - b.p.idx);
}

function linkLabel(w: SimWorld, L: LinkEnd): string {
  const nav = w.nav, up = nav.yAt(L.far) > nav.yAt(L.near);
  const to = theRoom(w, roomOfNode(L.far === L.p.ca ? L.p.na : L.p.nb));
  const how = L.p.kind === "ladder" ? `climb ${up ? "up" : "down"} the ladder` : L.p.kind === "vent" ? "crawl through the vent" : L.p.kind === "lift" ? `take the lift ${up ? "up" : "down"}` : `go ${up ? "up" : "down"} the stairs`;
  return `${how} to ${to}`;
}

/** the way a body sets off along this link from its near end, on the flat ([0, 0] when it goes straight up) */
function linkDir(w: SimWorld, L: LinkEnd): [number, number] {
  const nav = w.nav, [nx, , nz] = nav.centre(L.near), [fx, , fz] = nav.centre(L.far);
  const line = L.p.line;
  // (a stair's line is kept upper end first: read it from this end)
  const pts = line ? (L.near === L.p.ca ? line : [...line].reverse()) : [];
  for (const q of [...pts, [fx, 0, fz]]) {
    const dx = q[0] - nx, dz = q[2] - nz, l = Math.hypot(dx, dz);
    if (l > 0.3) return [dx / l, dz / l];
  }
  return [0, 0];
}

/** Onto the stair: the job any survivor has while crossing one (a walk to its far end), on the route world.walk
 *  already knows how to take — to the near end, then the link. */
function takeLink(w: SimWorld, s: Survivor, L: LinkEnd): void {
  const nav = w.nav, c = s.player!;
  const [nx, , nz] = nav.centre(L.near), [fx, , fz] = nav.centre(L.far);
  s.job = { kind: "run", cell: L.far, since: w.t, phase: 0, until: w.t + 3 * 60_000 };
  s.path = [nx, nz, s.floor, 2000 + L.p.idx, fx, fz, nav.floorOfCell(L.far), -1]; s.pi = 0; s.goal = L.far;
  c.lock = L.p.idx; c.label = linkLabel(w, L);
  hold(c);
}

// ---- letting go ---------------------------------------------------------------------------------------------------
/** The job in hand, dropped (never on a stair: that is seen through). */
function dropJob(w: SimWorld, s: Survivor): void {
  if (s.link) return;
  if (s.busyAct === "crank" || s.busyAct === "repair" || s.busyAct === "task") handsOff(w, s);
  const c = s.player!;
  // (the walk to a stair's foot, given up before the first step onto it: the stair is not "the one they just took".
  // Left locked, a push that changed direction at the foot — and the stick turns with the camera — dropped the job
  // and then kept them off that stair until they walked away from it. The re-grade, Nov 13 2026.)
  if (s.job?.kind === "run" && c.lock >= 0) c.lock = -1;
  s.job = null; s.path = null;
  c.label = ""; c.held = false;
}

/** Hands off whatever they are on, if it is a thing that can be let go of. True: the hands are free now. */
function letGo(w: SimWorld, s: Survivor): boolean {
  const a = s.busyAct;
  if (s.openDoor >= 0) {
    // a lock being picked is given up (it stays shut: finishOpen); a door half open is seen through
    if (s.pickDone && w.t < s.pickDone) s.busyUntil = 0;
    return false;
  }
  if (a === "crank" || a === "repair" || a === "task") { handsOff(w, s); s.busyUntil = 0; return true; }
  if (a === "call" || a === "search" || a === "look") { s.busyAct = ""; s.busyUntil = 0; s.touchAt = null; s.pose = "idle"; return true; }
  // a bandage, a tin, a bottle, a friend on the floor: seen through
  if (a) return false;
  s.busyUntil = 0;
  return true;
}

/** Before the step's busy check (survivor.ts act): keep the bar's clock, and let a push, a blow or a stop take
 *  the hands off what they were on. */
export function playerLetGo(w: SimWorld, s: Survivor): void {
  const c = s.player!, t = w.t;
  if (s.busyUntil > t && c.b1 !== s.busyUntil) { c.b0 = t - w.stepMs; c.b1 = s.busyUntil; }
  if (s.busyUntil <= t && !s.busyAct) return;
  if (c.stop || c.hitUntil >= t || newPush(c)) letGo(w, s);
}

// ---- the step -----------------------------------------------------------------------------------------------------
/** One step of the driven body, once nothing holds it (survivor.ts act calls this where the AI would decide). */
export function playerStep(w: SimWorld, s: Survivor, dt: number): void {
  const c = s.player!, t = w.t;
  s.mode = "job";
  // a swing under way is seen through
  if (s.swing.phase !== 0) { swingOn(w, s, dt); if ((s.swing.phase as number) !== 0) return; }
  // on a stair, a ladder: nothing to choose until they are off it
  if (s.link) { if (s.job) runJob(w, s, dt); else moveGait(w, s, "walk", dt); return; }
  if (c.lock >= 0) unlock(w, s);
  const push = pushed(c), hit = c.hitUntil >= t;
  if (c.stop || hit || newPush(c)) { if (s.job) dropJob(w, s); c.door = -1; }
  c.stop = false;
  if (hit && attack(w, s)) return;
  // a door they were told to open
  if (c.door >= 0) {
    const d = c.door;
    if (w.doorOpenIdx(d)) c.door = -1;
    else if (!handOnDoor(w, s, d, dt)) { c.door = -1; say(w, c, lockWords(w, s, d)); }
    else { if (s.openDoor >= 0) c.door = -1; return; }
  }
  if (s.job) {
    // (hands that came off the wheel, the set, the boards — the dead got too close, a grab — don't go back on by
    // themselves: the AI thinks again there, and so does whoever is driving)
    const cut = s.job.phase === 1 && !s.busyAct && HANDS_ON.has(s.job.kind);
    if (cut) say(w, c, "interrupted");
    if (cut || t >= s.job.until || !stillLegal(w, s, s.job)) dropJob(w, s);
    else { runJob(w, s, dt); if (!s.job) c.label = ""; return; }
  }
  c.label = "";
  if (push) drive(w, s, dt);
  else stand(w, s);
}

function stand(w: SimWorld, s: Survivor): void {
  s.path = null; s.gait = "still"; s.why = "idle";
  if (s.swing.phase === 0 && s.pose !== "sit" && s.reloadUntil <= w.t) s.pose = "idle";
  if (s.reloadUntil > w.t) s.pose = "reload";
  s.stillSince = Math.min(s.stillSince, w.t);
}

/** The stair they came off is not walked onto again until they have stepped away from its end. (A stair that
 *  doubles back ends facing the way it began, and the way on from a stair's foot is often the way the stair runs:
 *  without this the push that climbed it, or the first step away from it, would take them straight back. The
 *  action for it — "go back down the stairs" — is on the list all the while.) */
function unlock(w: SimWorld, s: Survivor): void {
  const c = s.player!, p = w.nav.portals[c.lock];
  if (!p) { c.lock = -1; return; }
  for (const k of [p.ca, p.cb]) {
    if (w.nav.floorOfCell(k) !== s.floor) continue;
    const [x, , z] = w.nav.centre(k);
    if (Math.hypot(x - s.x, z - s.z) < WALK.LINK_STEP_M + 0.25) return;
  }
  c.lock = -1;
}

/** THE WALK: the way they push, at the gait asked for — sliding along what is in the way, a hand on a shut door,
 *  onto a stair when they walk at one. */
function drive(w: SimWorld, s: Survivor, dt: number): void {
  const c = s.player!;
  const len = Math.hypot(c.mx, c.mz), ux = c.mx / len, uz = c.mz / len;
  const gait = c.crouch ? "crouch" : c.run ? "sprint" : len > WALK.HALF ? "jog" : "walk";
  s.why = "walk";
  // a stair's foot, and they are pushing up (or down) it
  for (const L of linksAt(w, s, WALK.LINK_STEP_M)) {
    if (L.p.idx === c.lock) continue;
    const [lx, lz] = linkDir(w, L);
    if ((lx || lz) && ux * lx + uz * lz < WALK.LINK_AIM) continue;
    takeLink(w, s, L);
    runJob(w, s, dt);
    return;
  }
  // which way is open: the way they push; else along the wall (the larger part of the push first); else a quarter
  // turn round a slanting one; else the last of the way up to it. A shut door is not slid along: it is walked
  // into, and a hand goes on it. (As far ahead as the next step can reach, from the pace the body has.)
  const sec = dt / 1000;
  const probe = Math.min(SPEED[gait], (s.v ?? 0) + 6 * sec) * sec + 0.08;
  let vx = ux, vz = uz, cap = Infinity;
  const ahead = clearAhead(w, s, ux, uz, probe);
  if (ahead.cell !== -1 && !(ahead.cell >= 0 && w.nav.door[ahead.cell] >= 0 && w.nav.walk[ahead.cell])) {
    const ax = Math.abs(ux), az = Math.abs(uz), r = Math.SQRT1_2;
    const tries: [number, number, number][] = [];
    const alongX: [number, number, number] = [Math.sign(ux), 0, ax], alongZ: [number, number, number] = [0, Math.sign(uz), az];
    for (const tr of ax >= az ? [alongX, alongZ] : [alongZ, alongX]) if (tr[2] > 0.2) tries.push(tr);
    tries.push([(ux - uz) * r, (ux + uz) * r, r], [(ux + uz) * r, (uz - ux) * r, r]);
    let share = 0;
    for (const [tx, tz, k] of tries) if (clearAhead(w, s, tx, tz, probe).cell === -1) { vx = tx; vz = tz; share = k; break; }
    if (share) cap = Math.max(0.5, SPEED[gait] * share);
    else if (ahead.free > 0.06) cap = Math.max(0.3, (ahead.free - 0.03) / sec);
    else { stand(w, s); s.h = Math.atan2(ux, uz); return; }
  }
  // (a point a few metres on, the way a follower chases a moving place: the walk keeps its pace and never "arrives")
  s.path = [s.x + vx * 3, s.z + vz * 3, s.floor, -1]; s.pi = 0; s.goal = -2;
  const res = moveGait(w, s, gait, dt, cap);
  s.path = null;
  if (res === "stuck" && s.doorAhead >= 0) say(w, c, lockWords(w, s, s.doorAhead));
}

/** A short straight line from the body: the first cell on it the body may not stand on (-1: none, the way is
 *  clear; -2: off the map), and how far it is clear (m). */
function clearAhead(w: SimWorld, s: Survivor, ux: number, uz: number, dist: number): { cell: number; free: number } {
  const nav = w.nav, n = Math.max(1, Math.ceil(dist / 0.04));
  let cell = s.cell;
  for (let i = 1; i <= n; i++) {
    const k = nav.cellAt(s.floor, s.x + ux * dist * i / n, s.z + uz * dist * i / n);
    if (k === cell) continue;
    if (k < 0 || !w.canStand(s, k)) return { cell: k < 0 ? -2 : k, free: dist * (i - 1) / n };
    cell = k;
  }
  return { cell: -1, free: dist };
}

/** why a door won't give, in a word for the one driving */
function lockWords(w: SimWorld, s: Survivor, d: number): string {
  prepActor(w, s);
  const why = w.fac.canPass(s.actor, w.nav.doors[d].id).why;
  return why === "needs_card" ? `locked: it needs ${w.map.keyName ?? "a keycard"}` : why === "needs_code" ? "locked: it needs a code"
    : why === "sealed_shut" ? "sealed shut" : why === "locked" ? "locked" : "it won't open";
}

// ---- the blow -----------------------------------------------------------------------------------------------------
/** the nearest of the dead within `r` metres the body could strike or shoot (on its feet, in sight), the ones in
 *  front of it first */
function target(w: SimWorld, s: Survivor, r: number, cone: number): Zombie | null {
  let best: Zombie | null = null, bs = Infinity;
  for (const z of w.zombies) {
    if (!z.alive || z.gone || z.lying || z.link || z.floor !== s.floor) continue;
    const dx = z.x - s.x, dz = z.z - s.z, d = Math.hypot(dx, dz);
    if (d > r) continue;
    if (d > 1 && !w.nav.sees(s.floor, s.x, s.z, z.x, z.z, w.doorOpenIdx)) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - s.h), Math.cos(Math.atan2(dx, dz) - s.h)));
    const score = d + (off > cone ? r : 0);
    if (score < bs) { bs = score; best = z; }
  }
  return best;
}

/** A blow asked for: the swing any survivor makes at one of the dead in reach of what they hold; out of reach with
 *  rounds for a gun, the shot. True: the step is spent on it. */
function attack(w: SimWorld, s: Survivor): boolean {
  const c = s.player!, t = w.t;
  if (s.reloadUntil > t) return false;
  const M = MELEE[s.melee];
  const gun = !!s.gun && (s.mag > 0 || ammoOf(s) > 0);
  const near = target(w, s, M.reach, Math.PI / 2);
  const dn = near ? Math.hypot(near.x - s.x, near.z - s.z) : Infinity;
  // (bare hands with a gun on them: the gun, as any survivor would — unless it is on top of them)
  if (near && !(gun && s.melee === "fists" && dn > 0.9)) {
    c.hitUntil = 0;
    s.held = meleeHeld(s.melee);
    startSwing(w, s, near, dn);
    return true;
  }
  if (gun) {
    const z = near ?? target(w, s, WALK.SHOT_M, WALK.SHOT_CONE);
    const ok = z && (z === near || Math.abs(Math.atan2(Math.sin(Math.atan2(z.x - s.x, z.z - s.z) - s.h), Math.cos(Math.atan2(z.x - s.x, z.z - s.z) - s.h))) <= WALK.SHOT_CONE || Math.hypot(z.x - s.x, z.z - s.z) <= WALK.SHOT_NEAR_M);
    if (z && ok) {
      s.held = GUNS[s.gun!].id; s.h = Math.atan2(z.x - s.x, z.z - s.z);
      s.path = null; s.gait = "still"; s.pose = "aim"; s.stillSince = Math.min(s.stillSince, t);
      if (s.mag === 0) { reload(w, s); c.hitUntil = 0; return true; }
      // (the press stands until the gun is ready and the line is clear, or it lapses)
      if (t >= s.gunReadyAt && w.nav.sees(s.floor, s.x, s.z, z.x, z.z, w.doorOpenIdx)) { shoot(w, s, z, 1); c.hitUntil = 0; }
      return true;
    }
  }
  c.hitUntil = 0;
  say(w, c, "nothing in reach");
  return false;
}

/** A swing under way (survivor.ts fightStep's own three beats): the windup, stepping into it; the blow; the recovery,
 *  stepping back out. */
function swingOn(w: SimWorld, s: Survivor, dt: number): void {
  const t = w.t, M = MELEE[s.melee];
  const z = w.bodies[s.swing.target] as Zombie | undefined;
  s.held = meleeHeld(s.melee); s.path = null; s.gait = "still"; s.why = "fight";
  if (s.swing.phase === 1) {
    if (t >= s.swing.until) {
      resolveSwing(w, s, z as Zombie);
      s.swing.phase = 2; s.swing.until = t + M.recover * (s.stamina < 0.12 ? 1.6 : 1);
      return;
    }
    s.pose = "fight";
    if (z?.alive) { s.h = Math.atan2(z.x - s.x, z.z - s.z); footwork(w, s, z, CONTACT[s.melee] ?? 0.8, dt); }
    return;
  }
  if (t >= s.swing.until) { s.swing.phase = 0; return; }
  if (z?.alive) footwork(w, s, z, s.swing.back ?? M.reach, dt);
}

// ---- the bar ------------------------------------------------------------------------------------------------------
const ACT_WORDS: Record<string, string> = { search: "searching", bandage: "bandaging", medkit: "patching up", eat: "eating", drink: "drinking", crank: "cranking", repair: "repairing", call: "calling", look: "looking it over", revive: "helping them up", task: "working" };
const r2 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;

function busyOf(w: SimWorld, s: Survivor): { label: string; frac: number } | null {
  const c = s.player!, t = w.t;
  const timed = (): number => (c.b1 > t && c.b1 > c.b0 ? (t - c.b0) / (c.b1 - c.b0) : 0);
  if (s.link) return { label: c.label || "on the stairs", frac: r2((t - s.link.t0) / s.link.ms) };
  if (s.openDoor >= 0) return { label: s.pickDone ? "picking the lock" : "opening the door", frac: r2(timed()) };
  const a = s.busyUntil > t ? s.busyAct : "";
  if (a) {
    const frac = a === "crank" ? w.obj.crank : a === "repair" ? w.obj.repair / OBJ.repairMs : a === "task" ? w.scn?.progress?.(w, s) ?? 0 : timed();
    return { label: c.label || ACT_WORDS[a] || a, frac: r2(frac) };
  }
  if (s.job) return { label: c.label || s.job.kind, frac: 0 };
  if (s.gun && s.reloadUntil > t) return { label: "reloading", frac: r2(1 - (s.reloadUntil - t) / GUNS[s.gun].reloadMs) };
  return null;
}
