// SOLACE SURVIVORZ — GLENRIDGE HALL'S OBJECTIVE (docs/survivorz/GLENRIDGE.md, "The objective: survive").
//
// ONE OBJECTIVE (Josh, Nov 17 2026: "survive the time frame assigned for the show in the stream"): stay alive until
// the show's clock runs out (`w.showMs`, the admin's length dial). Anybody alive at the end: SURVIVED. Nobody: wiped.
// The crests, the secret under the hearth, the proof and the car (Nov 13 to 16) are gone.
//
// What keeps them alive is the house, and that is the work on offer:
//   · GET INSIDE. They start at the gate in the rain; the dead stand in the grounds. Reach the open front door,
//     shut it and bolt it.
//   · SEAL THE HOUSE. Five windows are broken; the dead outside climb in through one about every minute and a half
//     until it is boarded (planks from the coal store), and a boarded window is knocked open again a plank at a
//     time. Then put down what is already inside.
//   · THE LIGHTS. Once, mid-show, the storm takes the lights: the switchboard in the furnace room brings them back.
//   · and all the night through, more of the dead out of the woods.
//
// Every number here is a dial (✱). Nothing is hidden from the audience (the overlay's rows); the survivors learn
// it as they find it (their records).
import type { Scenario, AddJob, MenuHelp } from "../scenario";
import type { Job, SimWorld, Survivor, Zombie } from "../world";
import { DEAD_MAX, cap, pos } from "../world";
import type { Goals, GoalRow } from "../wire";
import { end, gainXp, skill } from "../goals";
import { note, witness, SEEN, VISITED, D_STUCK } from "../knowledge";
import { canEscort, claimed, guardCell, nameOf, progress, recent, roomAt, theRoom, touch } from "../survivor";

export const GLEN = {
  front: "front-door", stone: "hearth-stone",
  windows: ["dining-window", "library-window", "guest-window", "kitchen-window", "solarium-window"] as const,
  hidden: ["hearth-stair", "hidden-study"],
  /** hands-on time for each piece of work, ms at no skill ✱ */
  boltMs: 5_000, planksMs: 4_000, boardMs: 25_000, plantMs: 40_000,
  /** how far the hammering carries, metres, every second of it ✱ */
  hammerM: 18,
  /** the dead outside go for a window this often (ms, between): an open one, or with none open a boarded one, to
   *  knock at its planks ✱
   *  (Nov 14 2026: 150-210 s until the code review's fixes. With the dead no longer striking unseen from the sills,
   *  the cell's one on its chain and nobody walking at doors, 140 shows in 160 got away and a death came one show in
   *  three: the faults had been most of the difficulty. These two lines put it back where it was tuned on Nov 13,
   *  about half getting away, by pressure that builds through the hour (not by more of the dead at the start: that
   *  only made five-minute wipes). Swept over 120 shows a setting: test-show holds the band.
   *  LATER THE SAME DAY: 80-120 s here and 50-80 s / 18 for the woods were set while the upper floor and the cellars
   *  still read as "the grounds" (see grounds()): the dead indoors up there counted against `woodsMax` and held
   *  the woods back. With the house counted right those numbers let 64 in 160 away; these let 102 away with 2.4
   *  deaths a show, which is what the build before the fix did (103, 2.3). Josh's own 150-210 / 120-180 / 12:
   *  135 in 160.) */
  climbMin: 95_000, climbMax: 140_000,
  /** the lights go out between these minutes of the show ✱ */
  darkMinMin: 22, darkMaxMin: 30,
  /** nobody bolts the door on a friend still outside for this long ✱ */
  waitForOthersMs: 7 * 60_000,
  /** MORE OF THEM COME OUT OF THE WOODS all night: one this often (ms, between), while fewer than `woodsMax` stand
   *  in the grounds ✱ */
  woodsGapMin: 80_000, woodsGapMax: 120_000, woodsMax: 16,   // (120-180 s and 12 until Nov 14 2026: see climbMin)
  // (65-100 s until the one in the cell was kept on a chain that holds it there: with the cell's crest guarded,
  // as the map means it to be, 79 shows of 160 got away; at 80-120 s, 104.)
  /** BOARDS DON'T HOLD FOR EVER: one of the dead at a boarded window knocks a plank off this often ✱ (a boarding
   *  is three planks: doors.ts `board`, the same on every map) */
  bangMs: 45_000, bangReachM: 2.6,
  /** the chain on the one in the cell, metres from its ring in the back wall ✱ (IT WAS 2.4: the cell has a metre
   *  and a half of floor and its gate stands open a pace from the foot of the basement stair, so the chain reached
   *  out to whoever came down for planks. Dead by minute three in every show, and the cell's crest found with
   *  nothing guarding it. At 0.3 its reach, the chain and an arm, stops a hand short of the stair's foot:
   *  `test-steady` holds the sum.) */
  chainM: 0.3,
  /** the one in the cell is this many times a shambler ✱ */
  cellHp: 2.5,
  /** out of the woods: never nearer the living than this (m), and this share of them are runners ✱ */
  woodsClearM: 22, runnerShare: 0.15,
  /** a task they were driven off is somebody else's for this long; a search they gave up, this long ✱ */
  retryMs: 90_000, searchRetryMs: 4 * 60_000,
  /** the windows are thought of once the door is bolted, or this long in ✱ */
  planksAfterMs: 4 * 60_000,
  /** with the house shut, the sweep for the dead inside is the first thing to do for this long ✱ */
  sweepFirstMs: 5 * 60_000,
} as const;

export interface GlenState {
  /** ms of work done on each task, by task id */
  work: Record<string, number>;
  boltedAt: number; boltedBy: string;
  boarded: Record<string, { at: number; by: string }>;
  darkDue: number; darkAt: number; lightAt: number; lightBy: string;
  clearAt: number; clearBy: string;
  nextClimbAt: number;
  nextWoodsAt: number;
  /** when each boarded window last lost a plank */
  bangAt: Record<string, number>;
}
const st = (w: SimWorld): GlenState => w.sc as GlenState;

const WINDOW_ROOM: Record<string, string> = {
  "dining-window": "the dining room", "library-window": "the library porch", "guest-window": "the guest suite",
  "kitchen-window": "the kitchen", "solarium-window": "the solarium",
};

/** under the sky */
const openAir = (w: SimWorld, room: number): boolean => room >= 0 && !!w.nav.rooms[room].outdoor;
/** IN THE GROUNDS: under the sky, or on a porch that stands open to them (the dining porch, the west porch: roofed,
 *  and nothing between them and the lawns but the air; their doors into the house are locked). One of the dead on a
 *  porch is not in the house. It used to count as inside it: "Clear the house" could then never be done (nobody
 *  can get onto the west porch from indoors), and the sweep of the house went on all night in its name. */
const GROUNDS = new WeakMap<object, Uint8Array>();
function grounds(w: SimWorld): Uint8Array {
  let g = GROUNDS.get(w.nav);
  if (!g) {
    const nav = w.nav;
    g = new Uint8Array(nav.rooms.length);
    for (let r = 0; r < nav.rooms.length; r++) if (nav.rooms[r].outdoor) g[r] = 1;
    for (let grew = true; grew;) {
      grew = false;
      for (const d of nav.doors) {
        if (d.kind !== "doorway") continue;
        const a = nav.roomIdx.get(d.a), b = nav.roomIdx.get(d.b);
        if (a === undefined || b === undefined || g[a] === g[b]) continue;
        g[a] = g[b] = 1; grew = true;
      }
    }
    // NOR IS THE GARAGE THE HOUSE (the review's B-3): what is not joined to the great hall except by way of the
    // grounds is out there with them. One of the dead in the garage held "Clear the house" open.
    // (...BY A DOOR OR A STAIR. The first cut of this followed doors only, and the floors of the house are joined by
    // its four stairs: the whole upper floor and the cellars were "the grounds". The dead upstairs did not count
    // for "Clear the house" and did count against the woods' number; somebody in a bedroom was "outside". Found
    // Nov 14, staging a check of something else.)
    const house = new Uint8Array(nav.rooms.length), hall = nav.roomIdx.get("great-hall");
    if (hall !== undefined) {
      const joins: [number | undefined, number | undefined][] = nav.doors.map((d) => [nav.roomIdx.get(d.a), nav.roomIdx.get(d.b)]);
      for (const p of nav.portals) if (p.kind === "stairs") joins.push([nav.room[p.ca], nav.room[p.cb]]);
      house[hall] = 1;
      for (let grew = true; grew;) {
        grew = false;
        for (const [a, b] of joins) {
          if (a === undefined || b === undefined || a < 0 || b < 0 || g[a] || g[b] || house[a] === house[b]) continue;
          house[a] = house[b] = 1; grew = true;
        }
      }
      for (let r = 0; r < nav.rooms.length; r++) if (!house[r]) g[r] = 1;
    }
    GROUNDS.set(nav, g);
  }
  return g;
}
/** not in the house: in the grounds, on an open porch, or in the garage down the drive */
const outdoors = (w: SimWorld, room: number): boolean => room >= 0 && grounds(w)[room] === 1;
/** A spot of the scenario's, stood at where the walk map says to stand (the build chose that place: clear floor, in
 *  reach of the thing) — not at the cell nearest the thing, which for the chimneypiece is the hearth stone itself. */
const spotOf = (w: SimWorld, id: string) => {
  const ref = w.local.all.get(id), js = w.nav.spots[id];
  if (!ref || !js) return undefined;
  const c = w.nav.cellAt(js.floor, js.stand[0], js.stand[2]);
  return { ...ref, cell: c >= 0 && w.nav.isWalk(c) ? c : ref.cell };
};
const others = (w: SimWorld, s: Survivor) => w.survivors.filter((x) => x !== s && x.alive && !x.escaped && !x.turned);
const onTask = (w: SimWorld, s: Survivor, id: string) => others(w, s).find((x) => x.job?.kind === "task" && x.job.target === id);
const openWindows = (w: SimWorld) => GLEN.windows.filter((id) => w.fac.doors.get(id)?.open);
const holds = (s: Survivor, what: string) => s.pack.spare.includes(what);
const drop = (s: Survivor, what: string) => { const i = s.pack.spare.indexOf(what); if (i >= 0) s.pack.spare.splice(i, 1); };

/** the dead inside the house (anywhere not out of doors) and loose in it: the one on its chain in the cellar cell is
 *  going nowhere, and is not "Clear the house"'s business. Counted, the house could not be called clear until it
 *  was dead. */
function insideHouse(w: SimWorld): number {
  let n = 0;
  for (const z of w.zombies) if (z.alive && !z.gone && !z.leash && !outdoors(w, z.room)) n++;
  return n;
}

// ---- the tasks: what a "task" job's target means -----------------------------------------------------------------
interface Task { spot: string; ms: number; rate(s: Survivor): number; legal(w: SimWorld, s: Survivor): boolean; done(w: SimWorld, s: Survivor): void; noiseM?: number; pose?: Survivor["pose"]; what: string }
const strength = (s: Survivor) => skill(s, "strength");

function taskOf(w: SimWorld, id: string): Task | null {
  const g = st(w);
  if (id === "front-bolt") return {
    spot: "front-bolt", ms: GLEN.boltMs, rate: (s) => 1 + 0.05 * strength(s), what: "door.shut",
    legal: () => !w.fac.bolted.has(GLEN.front),
    done: (w, s) => {
      w.facEv(w.fac.bolt(GLEN.front), s.id);
      if (!g.boltedAt) { g.boltedAt = w.t; g.boltedBy = s.who; }
      w.ev("door.bolted", { by: s.id, door: GLEN.front, at: pos(s) });
      for (const x of w.survivors) if (x.alive && !x.escaped) { x.morale = Math.min(100, x.morale + 8); note(x.know, w.t, x === s ? "I shut the front door and bolted it" : "the front door is shut and bolted"); }
      w.say(s.who, "bolted");
      progress(w, s);
    },
  };
  if (id === "planks") return {
    spot: "planks", ms: GLEN.planksMs, rate: (s) => 1 + 0.05 * strength(s), what: "loot",
    legal: (w, s) => !holds(s, "planks") && openWindows(w).length > 0,
    done: (w, s) => { s.pack.spare.push("planks"); w.ev("planks.taken", { by: s.id, at: pos(s) }); note(s.know, w.t, "took an armful of planks from the coal store"); },
  };
  if (id.startsWith("board-")) {
    const win = id.slice(6);
    return {
      spot: id, ms: GLEN.boardMs, rate: (s) => (1 + 0.1 * skill(s, "mechanics")) * (1 + 0.04 * strength(s)), noiseM: GLEN.hammerM, what: "board",
      legal: (w, s) => !!w.fac.doors.get(win)?.open && holds(s, "planks"),
      done: (w, s) => {
        drop(s, "planks");
        w.facEv(w.fac.board(win), s.id);
        g.boarded[win] = { at: w.t, by: s.who };
        gainXp(w, s, "mechanics", 6);
        const left = openWindows(w).length;
        witness(w, s.x, s.z, s.floor, 25, (o) => (o === s ? `I boarded up the window in ${WINDOW_ROOM[win]}` : `${cap(s.who)} boarded up the window in ${WINDOW_ROOM[win]}`));
        if (!left) for (const x of w.survivors) if (x.alive && !x.escaped) x.morale = Math.min(100, x.morale + 6);
        w.say(s.who, "boarded", { left });
        progress(w, s);
      },
    };
  }
  if (id === "plant") return {
    spot: "plant", ms: GLEN.plantMs, rate: (s) => 1 + 0.12 * skill(s, "electronics") + 0.05 * skill(s, "mechanics"), what: "plant",
    legal: () => !!g.darkAt && !g.lightAt,
    done: (w, s) => {
      g.lightAt = w.t; g.lightBy = s.who;
      gainXp(w, s, "electronics", 8);
      w.ev("power.on", { by: s.id, at: pos(s) });
      for (const x of w.survivors) if (x.alive && !x.escaped) { x.morale = Math.min(100, x.morale + 10); note(x.know, w.t, x === s ? "I got the lights back on" : "the lights came back on"); }
      w.say(s.who, "lightsOn");
      progress(w, s);
    },
  };
  return null;
}

export const GLENRIDGE_SCENARIO: Scenario = {
  id: "glenridge",

  outside: (w, room) => outdoors(w, room),

  init(w): GlenState {
    return {
      work: {}, boltedAt: 0, boltedBy: "", boarded: {},
      darkDue: w.t + w.rng.range(GLEN.darkMinMin, GLEN.darkMaxMin) * 60_000, darkAt: 0, lightAt: 0, lightBy: "",
      clearAt: 0, clearBy: "",
      nextClimbAt: w.t + w.rng.range(GLEN.climbMin, GLEN.climbMax),
      nextWoodsAt: w.t + w.rng.range(GLEN.woodsGapMin, GLEN.woodsGapMax), bangAt: {},
    };
  },

  setup(w) {
    const nav = w.nav;
    // what they don't know: the rooms under the hearth; that the outside doors are locked they can see for themselves
    const hidden = GLEN.hidden.map((id) => nav.roomIdx.get(id)).filter((r): r is number => r !== undefined);
    const stone = nav.doorIdx.get(GLEN.stone);
    for (const s of w.survivors) {
      for (const r of hidden) s.know.room[r] &= ~(SEEN | VISITED);
      if (stone !== undefined) s.know.door[stone] = 0;
      for (const id of w.map.lockedDoors) { const d = nav.doorIdx.get(id); if (d !== undefined) s.know.door[d] |= D_STUCK; }
    }
    // the one in the cell: stronger than the rest, and it has been there a long time
    const cell = nav.roomIdx.get("cellar-cell");
    if (cell !== undefined) {
      // (THE RING IS IN THE BACK WALL: the place in the cell furthest from any floor outside it)
      const f = nav.rooms[cell].floor, inside: number[] = [], outside: [number, number][] = [];
      for (let c = 0; c < nav.walk.length; c++) {
        if (!nav.walk[c] || nav.door[c] >= 0 || nav.floorOfCell(c) !== f) continue;
        if (nav.room[c] === cell) inside.push(c); else { const [x, , z] = nav.centre(c); outside.push([x, z]); }
      }
      let c = -1, far = -1;
      for (const i of inside) {
        const [x, , z] = nav.centre(i);
        let d = Infinity;
        for (const o of outside) { const dd = Math.hypot(o[0] - x, o[1] - z); if (dd < d) d = dd; }
        if (d > far) { far = d; c = i; }
      }
      if (c < 0) c = roomAt(w, cell, 0.35, 0.5);
      if (c >= 0) { const z = w.makeZombie("experiment", c); z.hp = Math.round(z.hp * GLEN.cellHp); z.hpMax = z.hp; z.why = "chained"; z.leash = [z.x, z.z, GLEN.chainM]; }
    }
  },

  menu(w, s, add: AddJob, h: MenuHelp) {
    const g = st(w), nav = w.nav, t = w.t, k = s.know;
    const out = outdoors(w, s.room);
    const at = (id: string) => spotOf(w, id);
    const task = (score: number, label: string, id: string, extra: Partial<Job> = {}) => {
      const def = taskOf(w, id); const sp = def && at(def.spot);
      // (a task they were just driven off, or could not get to, is somebody else's for a while)
      if (!def || !sp || sp.cell < 0 || !def.legal(w, s) || recent(w, s, id, GLEN.retryMs)) return;
      add(score - h.dist(sp.cell) * 0.3, label, { kind: "task", target: id, cell: sp.cell, room: sp.room, until: t + 6 * 60_000, ...extra });
    };
    const search = (score: number, label: string, id: string, brave = false) => {
      const sp = at(id);
      if (!sp || sp.cell < 0 || k.empty.has(id) || claimed(w, s, id) || recent(w, s, id, GLEN.searchRetryMs)) return;
      if (sp.room !== s.room && !w.canReach(s, sp.cell)) return;
      add(score - h.dist(sp.cell) * 0.3 - h.danger(sp.room) * 0.5, label, { kind: "loot", target: id, cell: sp.cell, room: sp.room, ...(brave ? { brave: true } : {}) });
    };
    const guard = (x: Survivor, score: number, label: string) => {
      if (!(h.fighter || h.armed) || x.busyAct !== "task") return;
      const c = guardCell(w, x, s);
      if (c >= 0 && w.canReach(s, c)) add(score + s.gen.loyalty * 2 - h.dist(c) * 0.3, label, { kind: "guard", ally: x.i, cell: c, until: t + 4 * 60_000 });
    };

    // 1. GET INSIDE: out in the rain with the dead about, the lit doorway is the only place to go
    if (out) {
      const hall = nav.roomIdx.get("great-hall");
      const c = hall !== undefined ? roomAt(w, hall, 0.5, 0.75) : -1;
      if (c >= 0) add(150 - h.dist(c) * 0.05, "get inside the house, out of the rain", { kind: "run", cell: c, room: hall, until: t + 5 * 60_000 }, "run:inside");
    }
    // …and shut the door behind the last of them (nobody bolts it on a friend still out there, for a while)
    if (!out && !w.fac.bolted.has(GLEN.front) && !onTask(w, s, "front-bolt")) {
      const stragglers = others(w, s).some((x) => x.mode !== "down" && outdoors(w, x.room));
      if (!stragglers || t - w.startedAt > GLEN.waitForOthersMs) task(128 + s.gen.assertiveness, "shut the front door and bolt it", "front-bolt", { until: t + 3 * 60_000 });
    }

    // 2. THE WINDOWS: planks from the coal store, then a hammer at each sill
    const open = openWindows(w);
    if (open.length && (g.boltedAt || t - w.startedAt > GLEN.planksAfterMs)) {
      if (holds(s, "planks")) {
        for (const id of open) {
          const worker = onTask(w, s, "board-" + id);
          if (!worker) task(98 + skill(s, "mechanics") * 2 + strength(s) - h.danger(at("board-" + id)?.room ?? -1) * 0.5, `board up the broken window in ${WINDOW_ROOM[id]}`, "board-" + id);
        }
      } else {
        // (planks on their way to a window: somebody with an armful who has gone off to do something else — driven
        // off the solarium, and keeping close to the others ever since — is not boarding anything, and the
        // window was nobody's for the rest of the night)
        const carried = w.survivors.filter((x) => x.alive && !x.escaped && x.mode !== "down" && x.job?.kind === "task" && (x.job.target === "planks" || (!!x.job.target?.startsWith("board-") && holds(x, "planks")))).length;
        if (open.length > carried) task(74 + strength(s), "fetch planks from the coal store to board the windows", "planks");
      }
      for (const x of others(w, s)) if (x.job?.kind === "task" && x.job.target?.startsWith("board-")) guard(x, 72, `guard ${nameOf(s, x)} while they board the window`);
    }

    // THE LIGHTS
    if (g.darkAt && !g.lightAt) {
      const worker = onTask(w, s, "plant");
      if (!worker) task(104 + skill(s, "electronics") * 3 - h.danger(at("plant")?.room ?? -1) * 0.5, "get the lights back on at the switchboard in the furnace room", "plant");
      else guard(worker, 68, `guard ${nameOf(s, worker)} at the switchboard`);
    }
  },

  legal(w, s, j) {
    const def = j.target ? taskOf(w, j.target) : null;
    return !!def && def.legal(w, s);
  },

  // the page's word for each of the house's jobs (client show/overlay.ts HOUSE_JOB, show/stance.ts)
  why(j) {
    const t = j.target ?? "";
    // (running for the hall at the start is the map's own job; running FROM somebody is `flee` on any map, and a
    // walker taking a stair is only on the move)
    if (j.kind === "run") return j.ally !== undefined ? "flee" : j.room !== undefined ? "inside" : "move";
    return t === "front-bolt" ? "bolt" : t === "planks" ? "planks" : t.startsWith("board-") ? "board" : t === "plant" ? "plant" : "task";
  },

  start(w, s) {
    const j = s.job!, def = j.target ? taskOf(w, j.target) : null;
    if (!def || !def.legal(w, s)) { s.job = null; return; }
    const sp = w.nav.spots[def.spot];
    if (sp) touch(w, s, sp.at[0], sp.at[2], def.what);
    s.busyAct = "task"; s.busyUntil = w.t + 1000; s.pose = def.pose ?? "interact"; s.gait = "still";
  },

  keep(w, s) {
    const j = s.job, def = j?.kind === "task" && j.target ? taskOf(w, j.target) : null;
    if (!def || w.obj.ending || !def.legal(w, s)) { s.job = null; return; }
    s.busyAct = "task"; s.busyUntil = w.t + 1000; s.pose = def.pose ?? "interact";
  },

  search() {
    // (the house has no spots of its own to search any more: the crests, the ledger, the keys and the fuel went with
    // the old objectives; what is searched is the ordinary loot)
    return false;
  },

  second(w) {
    const g = st(w), t = w.t;
    if (w.obj.ending) return;
    // the work under each pair of hands (one at a thing: the best hands do it)
    const at = new Map<string, Survivor[]>();
    for (const s of w.survivors) {
      if (!s.alive || s.escaped || s.busyAct !== "task" || s.busyUntil <= t || s.job?.kind !== "task" || !s.job.target) continue;
      (at.get(s.job.target) ?? at.set(s.job.target, []).get(s.job.target)!).push(s);
    }
    for (const [id, hands] of at) {
      const def = taskOf(w, id), sp = def && w.nav.spots[def.spot];
      if (!def || !sp) continue;
      const near = hands.filter((x) => Math.hypot(x.x - sp.stand[0], x.z - sp.stand[2]) < 1.6 && def.legal(w, x));
      if (!near.length) continue;
      const best = near.reduce((a, b) => (def.rate(b) > def.rate(a) ? b : a));
      g.work[id] = (g.work[id] ?? 0) + def.rate(best) * 1000;
      if (def.noiseM) { w.noise(sp.at[0], sp.at[2], sp.floor, def.noiseM, best.i, "hammer"); w.ev("hammer", { by: best.id, at: [sp.at[0], sp.at[1], sp.at[2]] }); }
      // (the front door can't shut on a body standing in it)
      if (id === "front-bolt" && g.work[id] >= def.ms) {
        const di = w.nav.doorIdx.get(GLEN.front);
        if (di !== undefined && w.bodies.some((b) => b.alive && b.cell >= 0 && w.nav.door[b.cell] === di)) {
          g.work[id] = def.ms * 0.98;
          // A FRIEND DOWN IN THE DOORWAY is got up, not waited on (the code review's B-10: the one at the bolt
          // stood with a hand on it for fifty seconds, and the door shut the moment the friend died)
          const lying = w.survivors.find((x) => x.alive && !x.escaped && x.mode === "down" && x.cell >= 0 && w.nav.door[x.cell] === di);
          if (lying && !w.survivors.some((x) => x.alive && x.job?.kind === "revive" && x.job.ally === lying.i)) {
            // (somebody with something to do it with: given to the one at the bolt with no bandage, the revive
            // was dropped the same step and given again, eighteen changes of job in seventeen seconds)
            const can = (x: Survivor) => x.alive && !x.escaped && !x.turned && x.mode !== "down" && x.pack.bandage + x.pack.medkit > 0;
            const helper = can(best) ? best : w.survivors.filter(can).sort((a, b) => Math.hypot(a.x - lying.x, a.z - lying.z) - Math.hypot(b.x - lying.x, b.z - lying.z))[0];
            if (helper) {
              helper.busyAct = ""; helper.busyUntil = 0; helper.touchAt = null; helper.path = null;
              helper.job = { kind: "revive", ally: lying.i, cell: lying.cell, since: t, phase: 0, until: t + 90_000 };
            }
          }
        }
      }
      if (g.work[id] >= def.ms) {
        g.work[id] = 0;
        for (const x of near) { x.busyAct = ""; x.busyUntil = 0; x.touchAt = null; if (x.job?.kind === "task" && x.job.target === id) x.job = null; }
        def.done(w, best);
        w.group.lastProgress = t;
      }
    }
    // THE LIGHTS GO OUT, once
    if (!g.darkAt && t >= g.darkDue) {
      g.darkAt = t;
      w.ev("power.cut", {});
      for (const x of w.survivors) if (x.alive && !x.escaped) { x.alertUntil = Math.max(x.alertUntil, t + 30_000); x.morale = Math.max(0, x.morale - 6); note(x.know, t, "the lights went out — the storm. The house's switchboard is in the furnace room, in the cellar"); }
      const who = w.survivors.find((x) => x.alive && !x.escaped && x.mode !== "down");
      if (who) w.say(who.who, "blackout");
    }
    // MORE OF THEM OUT OF THE WOODS: at the edge of the grounds, away from anybody, drawn toward the lit house
    if (t >= g.nextWoodsAt) {
      g.nextWoodsAt = t + w.rng.range(GLEN.woodsGapMin, GLEN.woodsGapMax);
      const outside = w.zombies.filter((z) => z.alive && !z.gone && outdoors(w, z.room)).length;
      if (outside < GLEN.woodsMax) {
        const yards = ["west-lawn", "east-lawn", "terrace", "drive", "gate", "garage-road"].map((id) => w.nav.roomIdx.get(id)).filter((r): r is number => r !== undefined);
        for (let tries = 0; tries < 30; tries++) {
          const yard = w.rng.pick(yards), edge = w.rng.chance(0.5);
          const c = roomAt(w, yard, edge ? w.rng.pick([0.04, 0.96]) : w.rng.next(), edge ? w.rng.next() : w.rng.pick([0.04, 0.96]));
          if (c < 0 || !w.nav.isWalk(c) || w.nav.door[c] >= 0 || !openAir(w, w.nav.room[c])) continue;
          const [x, , z] = w.nav.centre(c);
          if (w.survivors.some((x2) => x2.alive && !x2.escaped && Math.hypot(x2.x - x, x2.z - z) < GLEN.woodsClearM)) continue;
          if (w.deadUp() >= DEAD_MAX) break;
          const zb = w.makeZombie(w.rng.chance(GLEN.runnerShare) ? "runner" : "shambler", c);
          zb.arrivedAt = t;
          const fc = w.nav.roomIdx.get("forecourt"), tc = fc !== undefined ? roomAt(w, fc, w.rng.range(0.3, 0.7), w.rng.range(0.2, 0.6)) : -1;
          if (tc >= 0) { const [tx, , tz] = w.nav.centre(tc); zb.state = "investigate"; zb.lx = tx; zb.lz = tz; zb.lf = w.nav.floorOfCell(tc); zb.searchUntil = 0; zb.why = "out of the woods"; }
          w.ev("zombie.arrived", { at: [x, w.nav.floorY(w.nav.floorOfCell(c)), z], room: w.nav.rooms[yard].id, zone: "glenridge", n: 1, kinds: [zb.zkind], heard: [] });
          w.emitSpawn(zb);
          break;
        }
      }
    }
    // THE BOARDS: one of the dead at a boarded window knocks a plank off every so often; the third and it is open again
    for (const win of GLEN.windows) {
      const d = w.fac.doors.get(win);
      if (!d || d.open || !g.boarded[win]) continue;
      const di = w.nav.doorIdx.get(win), c = di !== undefined ? w.nav.doorCentre[di] : null;
      if (!c) continue;
      // (AT the window: out of doors, in reach, and on the floor of the ground outside it. The reach was measured on
      // the plan alone, and every window has a room over it: one of the dead standing in a bedroom knocked the
      // planks off the window below. By floor, not by height: the lawns lie half a metre under the house's floor
      // and a window's middle is a metre and a half over it.)
      const D = w.nav.doors[di!], br = w.nav.roomIdx.get(D.b), wf = br !== undefined ? w.nav.rooms[br].floor : -1;
      const at = w.zombies.find((z) => z.alive && !z.gone && outdoors(w, z.room) && (wf < 0 || z.floor === wf) && Math.hypot(z.x - c[0], z.z - c[2]) < GLEN.bangReachM);
      if (!at) { g.bangAt[win] = Math.max(g.bangAt[win] ?? 0, t - GLEN.bangMs / 2); continue; }
      if (t - (g.bangAt[win] ?? g.boarded[win].at) < GLEN.bangMs) continue;
      g.bangAt[win] = t; d.barricade = Math.max(0, d.barricade - 1);
      w.noise(c[0], c[2], at.floor, 16, at.i, "bang");
      w.ev("window.banged", { door: win, at: [c[0], c[1], c[2]], planks: d.barricade });
      if (d.barricade <= 0) {
        d.open = true; d.locked = false; delete g.boarded[win]; delete g.bangAt[win];
        w.ev("window.broken", { door: win, at: [c[0], c[1], c[2]] });
        for (const x of w.survivors) if (x.alive && !x.escaped && !outdoors(w, x.room) && Math.hypot(x.x - c[0], x.z - c[2]) < 30) { x.alertUntil = Math.max(x.alertUntil, t + 30_000); note(x.know, t, `the boards on the window in ${WINDOW_ROOM[win]} have given way`); }
      }
    }
    // THE DEAD OUTSIDE COME TO A WINDOW while one stands open and there is anybody left inside to come for
    if (t >= g.nextClimbAt) {
      g.nextClimbAt = t + w.rng.range(GLEN.climbMin, GLEN.climbMax);
      const open = openWindows(w);
      const inside = w.survivors.some((x) => x.alive && !x.escaped && !outdoors(w, x.room));
      if (inside) {
        const win = w.rng.pick((open.length ? open : GLEN.windows) as string[]);
        const di = w.nav.doorIdx.get(win), D = di !== undefined ? w.nav.doors[di] : undefined;
        const room = D ? w.nav.roomIdx.get(D.a) : undefined, c = w.nav.doorCentre[di ?? 0];
        let best: Zombie | null = null, bd = Infinity;
        for (const z of w.zombies) {
          if (!z.alive || z.gone || !outdoors(w, z.room) || (z.state !== "idle" && z.state !== "wander")) continue;
          const d = Math.hypot(z.x - c[0], z.z - c[2]);
          if (d < bd) { bd = d; best = z; }
        }
        // (an open one: to a place inside it; a boarded one: to the ground under its sill)
        const isOpen = !!w.fac.doors.get(win)?.open, pi = w.nav.portals.find((p) => p.kind === "window" && p.door === di);
        const tc = isOpen ? (room !== undefined ? roomAt(w, room, w.rng.range(0.3, 0.7), w.rng.range(0.3, 0.7)) : -1) : pi ? pi.cb : -1;
        if (best && tc >= 0) { const [tx, , tz] = w.nav.centre(tc); best.state = "investigate"; best.lx = tx; best.lz = tz; best.lf = w.nav.floorOfCell(tc); best.searchUntil = 0; best.heldQuiet = 0; best.why = "the window"; }
      }
    }
  },

  tick(w) {
    const g = st(w), o = w.obj;
    if (o.ending) return;
    const here = w.survivors.filter((s) => s.alive && !s.escaped && !s.turned);
    if (!here.length && w.survivors.length) return end(w, "wiped");
    // (the dead back in a house that was clear: it is not clear, the review's B-11)
    if (g.clearAt && insideHouse(w) > 0 && (openWindows(w).length > 0 || !w.fac.bolted.has(GLEN.front))) g.clearAt = 0;
    if (!g.clearAt && g.boltedAt && !openWindows(w).length && insideHouse(w) === 0) {
      g.clearAt = w.t; g.clearBy = w.lastKillBy || "";
      w.ev("house.clear", { last: w.lastKillBy || undefined });
    }
    // THE CLOCK RUNS OUT: whoever is still alive survived the night
    if (w.t - w.startedAt >= w.showMs) {
      for (const x of here) note(x.know, w.t, "the night is over and I am still alive");
      return end(w, "survived", here.map((x) => x.who));
    }
  },

  goals(w): Goals {
    const g = st(w), o = w.obj;
    const nBoard = GLEN.windows.length - openWindows(w).length;
    const lastBoard = Object.values(g.boarded).sort((a, b) => b.at - a.at)[0];
    const alive = w.survivors.filter((s) => s.alive && !s.escaped && !s.turned).length;
    const rows: GoalRow[] = [
      { id: "survive", label: "Survive until the clock runs out", done: o.ending === "survived" ? o.endedAt : 0, note: `${alive} alive` },
      { id: "bolt", label: "Get inside and bolt the front door", done: g.boltedAt, by: g.boltedBy || undefined },
      { id: "windows", label: "Board the five broken windows", done: nBoard >= GLEN.windows.length && lastBoard ? lastBoard.at : 0, by: lastBoard?.by, note: `${nBoard}/${GLEN.windows.length}` },
      { id: "clear", label: "Clear the house", done: g.clearAt, by: g.clearBy || undefined, note: `${insideHouse(w)} inside` },
      ...(g.darkAt ? [{ id: "lights", label: "Get the lights back on", done: g.lightAt, by: g.lightBy || undefined }] : []),
    ];
    return {
      door: { crank: 0 }, inside: insideHouse(w), radio: { repair: 0 },
      rows, insideLabel: "THE DEAD IN THE HOUSE", props: {},
      ...(g.clearAt ? { clear: g.clearAt, ...(g.clearBy ? { clearBy: g.clearBy } : {}) } : {}),
      startedAt: w.startedAt, endsAt: w.startedAt + w.showMs,
      ...(o.ending ? { ending: o.ending, over: true, endedAt: o.endedAt, ...(o.rescued.length ? { rescued: o.rescued.slice() } : {}) } : {}),
    };
  },

  facts(w, s) {
    const g = st(w), out: string[] = [];
    const left = Math.max(0, Math.ceil((w.startedAt + w.showMs - w.t) / 60_000));
    out.push(`Nobody is coming. The only way through is to stay alive until the night is over: about ${left} minute${left === 1 ? "" : "s"} more.`);
    if (!w.fac.bolted.has(GLEN.front)) out.push(w.fac.doors.get(GLEN.front)?.open ? "The front door stands open: the dead can walk in until it is shut and bolted." : "The front door is shut but not bolted: the dead can push it open.");
    else out.push("The front door is shut and bolted.");
    const open = openWindows(w);
    if (open.length) out.push(`Broken windows the dead can climb in by: ${open.map((id) => WINDOW_ROOM[id]).join(", ")}. There are planks in the coal store, in the cellar.`);
    else out.push("Every broken window is boarded, for now: the dead outside knock the planks loose.");
    if (g.darkAt && !g.lightAt) out.push("The lights are out. The switchboard is in the furnace room, in the cellar.");
    return out;
  },

  dark(w, room) {
    const g = st(w);
    return openAir(w, room) || (!!g.darkAt && !g.lightAt);
  },

  secured(w) {
    const g = st(w);
    // (shut, and the dead still in it: the sweep is the thing to do. Once it is clear, it is not.)
    // (...AND FOR A WHILE, NOT ALL NIGHT. With every floor of the house counted as the house there are sixty-six
    // rooms to look into and the dead upstairs stand where they are: six people swept bedrooms for ten minutes
    // and more, one show in twenty. After `sweepFirstMs` from the last board going up, the sweep is ordinary work
    // again.)
    if (!g.boltedAt || g.clearAt || !w.fac.bolted.has(GLEN.front) || openWindows(w).length) return false;
    let shutAt = g.boltedAt;
    for (const id in g.boarded) shutAt = Math.max(shutAt, g.boarded[id].at);
    return w.t - shutAt < GLEN.sweepFirstMs;
  },

  urgent(j) {
    // (getting in out of the rain is a run, and so is the bolt)
    return j.kind === "run" || j.target === "front-bolt";
  },

  progress(w, s) {
    const id = s.job?.kind === "task" ? s.job.target : undefined, def = id ? taskOf(w, id) : null;
    return def && id ? Math.min(1, (st(w).work[id] ?? 0) / def.ms) : 0;
  },
};
