// SOLACE SURVIVORZ — THE SIMULATION (the "watchable sim" rough draft, SURVIVORZ.md §5, §8, §9).
//
// THE BUNKER (Nov 2026, docs/survivorz/BUNKER.md): six survivors and the dead in Civil Defence Shelter 14 — three
// objectives (crank the blast door shut, clear the bunker, fix the radio and call), four hours. Driven by GAME
// CODE with the model choosing from its menus (talk/minds.ts): they
// walk the real walk map, open doors, loot, fight, flee, go down, get revived, and die for good;
// the dead idle, wander, hear, see, chase, bang on doors and feed. Everything that happens comes out
// as a wire.ts frame a screen can draw.
//
// THE CONTRACT, for whoever runs it (the integrator wires the transport):
//   const w = new SimWorld({ seed, start })   // start = the show clock's first ms
//   w.onFrame((f) => send(f))                 // ServerFrame: snap / tick / spawn / gone / ev / say
//   w.snapshot()                              // everything, for a screen that just connected
//   w.tick(dtMs)                              // advance; steps in fixed STEP_MS, emits a tick frame each
//   w.pause() / w.resume()
//   levers: reset(seed?), setPower(zone, on), kill(id), down(id), revive(id), setDirector(on)
// DETERMINISTIC: every roll comes from one seeded Rng and the clock is the sim's own (start + steps),
// so the same seed, start and tick sizes replay the same show. Nothing here reads Date.now or
// Math.random (the seed, when not given, is picked once from crypto).
//
// Seams left for the layers that come later: `hooks.say` (the talk layer — a no-op now; nothing is
// ever said in the draft) and `hooks.choose` (the choice menus — the job menu goes through it, so the
// model can pick from what code built and code still carries it out).
import { LIE, deathLie, zombieDeathLie, layHeading } from "./lie";
import { FacilityWorld, randomSeed, type Actor, type Result } from "../doors";
import { mapDef, type MapDef } from "./mapdef";
import { scenarioFor, type Scenario } from "./scenario";
import { START, GENES, type Genome } from "../genes";
import type { ZoneId } from "../facility";
import { Nav, Path, alongStair } from "./nav";
import { Rng } from "./rng";
import { BODY_OF, WALK_IN } from "../cast";
import {
  TICK_HZ,
  type BodyState, type DirectorWire, type Supplies, type DoorWire, type Ev, type Held, type Pose, type ServerFrame,
  type Snapshot, type SurvivorId, type SurvivorVitals, type TickBody, type ZombieKind, type LinkKind,
} from "./wire";
import {
  STEP_MS, STATS, KINDS, INFECT, OUTSIDE_MIX, OUTSIDE_BODIES, SAME_FACE_M,
  START_KIT, START_BOX, HP, NEEDS, LOOT_RULES, FIXED_LOOT, COMBAT,
  BASE_SLOTS, PACK_SLOTS, STACK, BATTERY_MS, ARRIVAL, LYING_SHARE, RISE_M, SKILL_XP, SKILL_FX, SNEAK_NEAR_M, ITEM_PROP,
  type Item, type Stats, type Kind, type PackId, toughFx, strengthFx,
} from "./tables";
import { newDirector, directorStep, strength, DIRECTOR, type DirectorState, type DirSurvivor } from "./director";
import { survivorStep, initSpots, exportSimState, importSimState, roomAt, newSimLocal, type SimLocal } from "./survivor";
import { onInfected } from "./infection";
import { newPlayerCtl, WALK, type PlayerCtl } from "./player";
import { newSkills, newObjectives, objectivesTick, goalsWire, insideCount, crankRate, repairRate, gainXp, skill, OBJ, type Skills, type Objectives } from "./goals";
import { zombieStep, zombieSenseAll } from "./zombie";
import { newKnowledge, startKnowledge, believePass, knowsRoom, witness, note, factsFor, type Knowledge, type SurvivorFacts } from "./knowledge";

/** who walks in on day one, in spawn order (the cast files' "cast", src/survivorz/cast) */
export const SURVIVOR_IDS: SurvivorId[] = WALK_IN;

// ---- bodies ---------------------------------------------------------------------------------------
export interface Link { portal: number; t0: number; ms: number; x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; f1: number }

export interface Body {
  i: number;
  id: string;
  kind: "survivor" | "zombie";
  body: string;
  x: number; z: number; y: number; floor: number; h: number;
  cell: number; room: number;
  pose: Pose; held: Held; torch: boolean;
  hp: number; hpMax: number;
  why: string;
  alive: boolean;
  /** the route being walked: [x, z, floor, tag] × n (nav.ts) and the next waypoint */
  path: number[] | null; pi: number;
  /** where the route ends, as asked (to re-plan when the world changes) */
  goal: number;
  link: Link | null;
  /** an action in progress (opening a door, searching, a swing) holds the body still until */
  busyUntil: number;
  /** the gait this step (for noise and the pose) */
  gait: "still" | "crouch" | "walk" | "jog" | "sprint";
  // what the screens were last told
  s: { x: number; z: number; y: number; h: number; pose: Pose | ""; held: Held | undefined; torch: boolean; hp: number; room: number; why: string; vit: string; alert?: boolean; bag?: PackId | null; link?: LinkKind | null };
  /** lying on a bed (off the walk map, on the furniture) */
  onBed: boolean;
  /** a door being opened (survivors, experiments): done when busyUntil passes */
  openDoor: number;
  /** a card or code lock being PICKED (Lockpicking): when it gives (0 = not picking) */
  pickDone?: number;
  /** progress on the route: where it was when it last got anywhere, and when — a body boxed in
   *  (two people in one doorway) SQUEEZES past for a moment, ignoring other bodies (never walls) */
  progX: number; progZ: number; progAt: number; squeezeUntil: number;
  /** the shut door walk() last ran into (-1 none) */
  doorAhead: number;
  /** when a refused step last stopped this body at a shut door (walk: the hand has it) */
  doorAt?: number;
  /** THE PACE (REALISM.md → Movement): the speed it's actually going, m/s — eased up to the gait's speed and
   *  down for corners, sharp turns and the end of the route — and the sim time walk() last moved it (a body
   *  that stood still a tick starts from a standstill). Absent in an older save = standing. */
  v?: number; walkT?: number;
  /** A BODY HAS WEIGHT: the velocity it was last sent with (m/s), and the heading its job last asked for while
   *  it is still turning to it. Absent in an older save = standing, facing where it faces. */
  gvx?: number; gvz?: number; hGoal?: number;
  /** the step one of the dead last pushed this body out of its space (separate) */
  shovedAt?: number;
  /** the step it was shouldered out of another survivor it stood INSIDE (separate, weigh) */
  nudgedAt?: number;
  /** this squeeze is the second in a row: it goes straight through (progress) */
  squeezeHard?: boolean;
  /** an escort's place beside its leader this step: [x, z, when] (survivor.ts formationSlot — the others keep off it) */
  slotAt?: [number, number, number];
  /** the step its route last ended or was stopped (walk: "arrived", "door", "stuck") */
  walkEnd?: number;
}

export interface Pack { food: number; water: number; bandage: number; medkit: number; battery: number; ammoP: number; ammoR: number; spare: string[] }

/** NO STEP BACK ONTO A NEW PATH (realism round 13, Nov 2026): a route starts at the middle of the cell the body
 *  stands in, which is often behind it — a fighter closing on a zombie re-plans every half second, and each time
 *  stepped back to that point (0.2 m, the heading swung 70°) and set off again, three reversals a second on the
 *  show. Survivors and the dead alike (see plan). The first point goes when the body is already as near the second as the first is (same floor, a plain
 *  point: never a door, ladder or vent tag). */
/** THE MOST OF THE DEAD THAT STAND AT ONCE (the code review's C-12): the trickle and the spawn lever stop here.
 *  An hour's show stays under it (the most standing: 63 in the bunker, 27 in the mansion, over 120 and 160
 *  shows); a long walk and a held lever did not. ✱ */
export const DEAD_MAX = 80;
/** the most bodies one run's spawn lever will make up to, living and dead and retired ✱ */
export const BODIES_MAX = 1500;
/** the most of the fallen left lying (an hour's show ends with thirty to sixty) ✱ */
export const CORPSES_MAX = 200;
/** how long after somebody sets off up a stair the next one does (single file) */
const STAIR_GAP_MS = 900;
function trimBehind<P extends { pts: number[] } | null>(b: { x: number; z: number; floor: number }, p: P, clear?: (x: number, z: number) => boolean): P {
  if (!p || p.pts.length < 8) return p;
  const q = p.pts;
  if (q[3] >= 0 || q[2] !== b.floor || q[6] !== b.floor) return p;
  // ONLY WHEN THE WAY TO THE SECOND POINT IS CLEAR FROM WHERE THE BODY STANDS (Nov 12 2026): the route's line runs
  // from the MIDDLE of the cell; a body at the cell's edge, against a wall beside a doorway, had the first point
  // dropped and walked the line from its own spot — into the door's jamb, 14 cm away. It stood there failing
  // "stuck" every 4 s for minutes (rest:stuck 7.2 a show in a hundred, most of it this). `clear` is the walk's own
  // test along that line; without one (the dead) it is as it was.
  if (Math.hypot(q[4] - b.x, q[5] - b.z) <= Math.hypot(q[4] - q[0], q[5] - q[1]) + 0.05 && (!clear || clear(q[4], q[5]))) p.pts = q.slice(4);
  return p;
}
export type Mode = "job" | "fight" | "backoff" | "flee" | "hide" | "panic" | "grabbed" | "down" | "dead" | "sleep";

export interface Job {
  kind: "loot" | "revive" | "escort" | "guard" | "rest" | "talk" | "shut" | "clear" | "regroup"
    // THE BUNKER's objectives (goals.ts): the blast door's crank, the radio's repair and the call
    | "crank" | "repair" | "call"
    // WHAT THEY DO TO EACH OTHER (social.ts): only ever a mind's own pick
    | "give" | "steal" | "confess" | "attack"
    // running from somebody who turned on them (survivor.ts struck — fight-or-flight is code's)
    | "run"
    // A MAP'S OWN WORK (sim/scenario.ts): hands on a thing at a spot until it is done — bolt the door, board a
    // window, set a crest, read the journals (Glenridge Hall); `target` is the spot
    | "task";
  /** a spot id, a room index, a survivor index … */
  target?: string;
  room?: number;
  cell?: number;
  ally?: number;
  since: number;
  phase: number;
  until: number;
  stuck?: number;
  /** times the sight of the dead has driven them off this job, each within SCARE_WINDOW_MS of the last, and when the last was (survivor.ts decide) */
  scares?: number; scareT?: number;
  /** since when the last steps to it have been refused (a revive's place beside the body) */
  stuckAt?: number;
  /** explore: how many looks round the room so far */
  sweep?: number;
  /** the boredom they set out with (survivor.ts THE EXPEDITION): kept for a trip into the Deep after the finale */
  bored?: number;
  /** talk: who with */
  with?: number;
  /** explore: the door (or vent, or grate) they're going to try, when what's beyond it is unseen */
  door?: number;
}

export interface Survivor extends Body {
  who: SurvivorId;
  /** THE LOOK ROUND (REALISM.md → Movement — "a relaxed walk, pausing now and then to look around"): a calm
   *  walker stops until `lookUntil` and turns toward `lookH`; the next one is due at `lookNext`. Absent in an
   *  older save = none due yet. */
  lookUntil?: number; lookH?: number; lookNext?: number;
  /** the room they woke in (the run setup, Admin Panel → Show) */
  startRoom?: string;
  /** the dead they've put down this run */
  kills?: number;
  st: Stats;
  gen: Genome;
  actor: Actor & { kind: "survivor" };
  melee: string; wear: number;
  gun: "pistol" | "rifle" | null; mag: number;
  pack: Pack;
  stamina: number;
  hungerH: number; thirstH: number; tiredH: number; morale: number;
  bleeding: 0 | 1 | 2; bleedNext: number;
  /** when the bleeding started or last got worse (tables.ts CLOT_MS) */
  bleedSince: number;
  bitten: boolean; infected: boolean; infectedAt: number;
  downUntil: number; downs: number; deadAt: number; cause: string;
  /** how the body lies on the floor (sim/lie.ts LIE: the head's angle from the heading); unset = straight back */
  lie?: number;
  mode: Mode; job: Job | null; nextThink: number; nextScan: number;
  threats: number[]; threat: number; fear: number; chasedBy: number;
  /** `back`: how far from the target the swing started (the footwork steps back out to it while recovering) */
  swing: { phase: 0 | 1 | 2; until: number; target: number; back?: number };
  gunReadyAt: number; reloadUntil: number; stillSince: number;
  grabbedBy: number[]; grabbedAt: number; breakAt: number; nextBite: number; nextStab: number;
  panicUntil: number; panicKind: "freeze" | "bolt";
  /** where the dead that last drove them off their work were, and when (survivor.ts decide: the fighters go there) */
  scaredOff?: { room: number; t: number };
  /** the one of the dead they last went for (survivor.ts fightStep: kept after for a moment when it passes out of sight) */
  foe?: number;
  /** when that one was last in sight as their target */
  foeAt?: number;
  /** where they were walking to when the walk was last refused, and when (x, z, t): for whoever is in the way */
  want?: [number, number, number];
  /** the cell the one they are walking at stood in when the route to it was planned */
  foeCell?: number;
  /** when the route at the one they are fighting was last planned (a refused walk plans again, once a second) */
  planAt?: number;
  /** one of the dead no route goes to, and until when it is left alone: [body index, t] */
  noWayTo?: [number, number];
  bed: string | null;
  /** damage taken since the director last looked */
  hurt: number;
  /** rooms a route to failed, and when (re-tried after a while) */
  failed: Map<number, number>;
  /** a door they just came through, for closing it on a pursuer */
  lastDoor: number; lastDoorAt: number;
  reviving: number; reviveUntil: number;
  lastAllyNear: number;
  /** a quick action in progress (bandage, eat, search, …), finished when busyUntil passes */
  busyAct: string;
  allies: number;
  /** the friend they've decided to go back for (-1 none), and the incidents already rolled for */
  helping: number;
  helpRolled: Set<number>;
  sneak: boolean;
  failedSpots: Map<string, number>;
  lastResupply: number;
  nextShut: number;
  lastFight: number;
  /** when the combat mode last changed (decide: fight and backoff don't trade places faster than MODE_DWELL_MS) */
  modeAt: number;
  /** the last moment anything threatened them (a hider stays down a few seconds after — survivor.ts decide) */
  threatAt?: number;
  /** GIFTS DON'T BOUNCE (social.ts): when they last gave anything, and when each of the others last gave to them */
  gaveAt?: number;
  gotFrom?: Record<string, number>;
  lastTalk: number;
  lastPatrol: number;
  /** how much more of a run they have in them (0..1) */
  nerve: number;
  /** when they last came home (0 while out) */
  homeSince: number;
  /** pulling a zombie off a friend: who, and when it comes off */
  pulling: number; pullAt: number;
  /** WHAT THEY KNOW (knowledge.ts): they plan, choose and talk only with this */
  know: Knowledge;
  /** the keycard on them (its tier; 0 none) — a card is carried, not the group's by magic */
  card: number;
  /** this walk's own lane (nav.lanes) and noise variant, held while the goal is the same */
  laneGoal: number; laneSeed: number;
  /** something just happened that they must think again about now (a friend went down) */
  rethink: boolean;
  /** a job just failed: no new pick before this */
  retryAt: number;
  /** THE BACKPACK they wear (null: belt and pockets only) — §8's slots follow it */
  bag: PackId | null;
  /** ON GUARD (Josh, Oct 28 2026: calm survivors don't stand in a fighting stance): drawn and ready;
   *  held up until `alertUntil` once the reason has gone (hysteresis), and the weapon is put away only
   *  after `calmSince` has run a while */
  alert: boolean; alertUntil: number; calmSince: number;
  /** what's left on the flashlight's battery (ms) */
  charge: number;
  /** a run cut short by a full pack: home to empty it first */
  haul: boolean;
  /** when this survivor last did something that moved the group on (a room, a find, a log, a breaker) */
  lastProgress: number;
  /** PROXIMITY: the point they're touching right now (a container, a terminal, a door, a body) and what
   *  it is — set when an interaction starts, cleared when it ends (the harness holds them within reach) */
  touchAt: [number, number] | null; touchWhat: string;
  /** waiting it out behind the safe-room door since (0 not waiting) */
  waitSince: number;
  /** what they've learned (§7b; goals.ts): the levels and the XP toward the next */
  skills: Skills;
  /** the records still to read at the spot they're at, and the one in hand */
  readQ: string[]; readCur: string;
  /** the infection's stage (0 none · 1 incubating · 2 fever · 3 coughing · 4 confused · 5 turning), set by infection.ts */
  sick: number;
  /** the group knows they're infected (saw the bite, were told, heard the cough) */
  infKnown: boolean;
  /** collapsed and turning: they stand up as one of the dead at this time (0 not turning) */
  turnAt: number;
  nextCough: number;
  /** they turned: the survivor body is gone from the screens (a zombie stands where they lay) */
  turned: boolean;
  /** research they've worked through at home (cure.ts study) */
  studied: Set<string>;
  /** out through the vault: they left the show ALIVE (escape.ts; `alive` is false, it's no death) */
  escaped: boolean;
  /** a NEWCOMER still hiding where they were found (newcomer(): they join when one of the group walks in) */
  hidden: boolean;
  nextCall: number;
  /** when this bench session ends (the old show; unused) */
  sessionEnd: number;
  /** THE STRANGERS (follow-up 30): the others they've met and know by name */
  met: Set<SurvivorId>;
  /** WALK THE MAP (sim/player.ts): this body is driven by the admin's own hand — the AI chooses nothing for it.
   *  Absent on every other survivor (and in every run that isn't a walk). */
  player?: PlayerCtl;
}

export interface Zombie extends Body {
  zkind: ZombieKind;
  k: Kind;
  actor: Actor & { kind: "zombie" };
  state: "idle" | "wander" | "investigate" | "chase" | "attack" | "bang" | "feed" | "dead";
  target: number;      // survivor index
  lx: number; lz: number; lf: number;   // last known spot
  lastSeen: number;
  searchUntil: number;
  nextSense: number; nextThink: number;
  attackCd: number;
  grabbing: number;
  stagger: number;
  bangDoor: number;
  /** chasing somebody it can see and has no way to (glass, boards, a locked door) */
  walled?: boolean;
  /** on a chain: where it is fixed, and how far it reaches [x, z, metres] (Glenridge's cell) */
  leash?: [number, number, number]; bangSince: number; nextBang: number;
  burstUntil: number; restUntil: number;
  heldQuiet: number;
  carriesCard: number;
  noiseSeen: number;
  feedUntil: number;
  nextIdleSound: number;
  killedBy: string;
  alertedAt: number;
  /** the locked door it was placed behind (-1 none): see zombie.ts sense() */
  confined: number;
  /** a door it gave up banging on, and when */
  gaveUpDoor: number; gaveUpAt: number;
  /** came in with the trickle (when; 0 = was here from the start) */
  arrivedAt: number;
  /** one of the cast, turned (infection.ts): drawn in their own body */
  turnedFrom?: SurvivorId;
  /** when it died, and whether a sample has been taken from it (cure.ts: within a minute) */
  diedAt: number;
  sampled?: boolean;
  /** lying on the floor, waiting: it rises when a survivor comes near (fifth round 16) */
  lying?: boolean;
  /** CORPSE RETIREMENT: a body long dead and out of everyone's sight is taken off the screens (a `gone`
   *  frame). It keeps its slot in `bodies`/`zombies` — indices are relied on everywhere — but is never
   *  drawn, sent or counted again. */
  gone?: boolean;
}

export interface Noise { id: number; x: number; z: number; floor: number; r: number; t: number; by: number; kind: string }

export interface SimHooks {
  /** The talk layer's seam: a survivor would say something about `what` (no-op in the draft). */
  say?: (w: SimWorld, who: SurvivorId, what: string, ctx?: Record<string, unknown>) => void;
  /** The choice-menu seam: code built the menu (best first) from only what that survivor KNOWS
   *  (knowledge.ts) — every option is possible right now, with a short label a model can read.
   *  Return an id from it, or undefined to let code pick; code re-checks the pick before doing it.
   *  Return CHOICE_WAIT while the answer is being thought: they keep at what they were doing (or stand
   *  and think) and are asked again a beat later. */
  choose?: (w: SimWorld, who: SurvivorId, menu: MenuOption[]) => string | undefined;
  /** Is a mind deciding right now? Only then are the social options (social.ts) offered, and the honesty
   *  roll on a hidden bite left to the survivor's own mind. */
  aiDecides?: (w: SimWorld) => boolean;
  /** THE GROUP'S PLAN seam (§5 layer 3, the meeting): polled once a minute; return the plan a meeting
   *  agreed (or undefined to leave the current one standing). The job menus honour it — which edge of
   *  what they know to push (`zone`), and who goes out exploring, who scavenges, who stays home. */
  plan?: (w: SimWorld) => GroupPlan | undefined;
  /** what one survivor thinks of another (the minds' regard, -100..100; strangers start at 0) */
  regard?: (w: SimWorld, who: SurvivorId, of: SurvivorId) => number | undefined;
}

/** What a meeting decided. `zone` is a ZoneId (a wing they know of) to push into; `team` says who does what. */
export interface GroupPlan { zone?: string; team: Partial<Record<SurvivorId, "explore" | "scavenge" | "stay">> }

/** hooks.choose's "still deciding" (Nov 2026 — Josh: "the ai does the rest whether they die or not"). */
export const CHOICE_WAIT = "wait";
/** the most options a choice menu offers */
export const CHOICE_MENU_MAX = 12;

/** One line of a job menu: an id (opaque, never naming anything unseen), what it means in plain
 *  words, and code's own score for it (higher is what code would pick). */
export interface MenuOption {
  /** "kind:what" — the part before ":" is always the kind (a promise the talk layer reads) */
  id: string;
  /** the job's kind: explore · loot · read · breaker · patrol · escort · resupply · sleep · revive · guard · talk · rest */
  kind: string;
  label: string;
  score: number;
  /** what they're doing right now */
  current?: boolean;
  /** the room the job is in (a search carries on through one room without another ask — talk/minds.ts) */
  room?: number;
}

export interface SimOptions {
  /** THE MAP this world is made on (a maps.ts id; sim/mapdef.ts). Default, or an id nobody knows: the bunker. */
  map?: string;
  seed?: number;
  /** the show clock's first ms (a real show passes Date.now() once) */
  start?: number;
  director?: boolean;
  hooks?: SimHooks;
  /** the fixed step (default STEP_MS = one wire tick); a faster harness may pass a bigger one */
  stepMs?: number;
  /** WHO STARTS THIS RUN (Admin Panel → Survivorz → Show, Nov 3 2026), in spawn order: any of the cast or
   *  the bench, at most one per start room. Default: the cast files' "cast". */
  cast?: SurvivorId[];
  /** THE RUN's stable id (the broadcast persists it): the survivors' memory is kept under it, and every
   *  snapshot carries it so a screen knows when a different run has started. Default `seed:start`. */
  run?: string;
  /** THE DEAD AT THE START (the control room's test-run lever): this many instead of PLACEMENTS' 20, spread the
   *  same way (each placement scaled). Default: as the tables say. */
  zombies?: number;
  /** THE RUN SETUP's picks (the control room, Nov 3 2026): a start room per survivor (any not named, or named
   *  twice, wakes where the roll puts them), and the spot the radio's part and the code's note hide in. A pick
   *  that isn't one of the map's own is ignored. Every roll is still drawn, so the rest of the run is the
   *  seed's either way. */
  starts?: Record<string, string>;
  partSpot?: string;
  noteSpot?: string;
  /** WALK THE MAP (sim/player.ts): this run has ONE survivor — this one of the cast or the bench — and the admin
   *  drives it by hand. The map's own scenario runs as ever; the clock is long (WALK.SHOW_MS). */
  player?: SurvivorId;
}

/** a route this far off where the body faces (rad, ~115°) doubles back: it nearly stops and turns round first */
const TURN_BACK_RAD = 2.0;
/** A BODY HAS WEIGHT (the Nov 12 2026 review, RUBRIC.md C2 + C3). Twenty places in the job code set a heading
 *  outright and half as many started or stopped a body in one step: on the wire a survivor on their feet turned at
 *  up to 1,800°/s and went from a sprint to standing in a tenth of a second (escorts beside a walking leader did
 *  it every other step). The job code still says where a body should be and which way it should face; what is
 *  SENT is held to what a body can do: it turns at most TURN_MOVE (moving) or TURN_STAND (on the spot) rad/s
 *  toward the heading asked for, gains at most WEIGHT_ACC and loses at most WEIGHT_DEC m/s each second, and one
 *  that is told to stand, or to go back the way it came, carries on a step or two while it slows. Lying, held,
 *  kneeling over a friend, asleep, sitting, on a ladder: not governed (those are placed). A wall still stops a
 *  body dead. scripts/survivorz/review/move-probe.mjs reads it back. */
export const WEIGHT = { TURN_MOVE: 4.0, TURN_STAND: 5.0, ACC: 6.0, DEC: 8.0 };
/** two of the living this close are standing in each other; the speed they step apart at (weigh) */
const INSIDE_M = 0.45, NUDGE = 1.6;
/** the space two of the living keep while one squeezes past the other */
const SQUEEZE_M = 0.34;
const PLACED = new Set<Pose>(["down", "dead", "sleep", "sit", "grabbed", "revive"]);
/** two bodies on the floor are never closer than this, point for point (hips, chest, head, thighs); a faller steps
 *  at most LAY_SHIFT_M aside to keep it */
const LAY_APART_M = 0.4, LAY_SHIFT_M = 0.7;

/** A dead zombie's body is retired this long after it died, once no survivor is in its room. */
export const CORPSE_RETIRE_MS = 3 * 3_600_000;
/** Own fields of a SimWorld the save leaves out: the map (rebuilt), the wiring, and the facility and
 *  Rng, which are saved by hand (SimWorld.saveState). EVERY OTHER FIELD IS SAVED — a field added later
 *  is kept automatically, and one the codec can't keep throws (save.ts). */
// finaleMs is CONFIG (SimOptions.finaleDays), not state: a restart takes the box's current setting, so a
// save made before the finale existed (or under another setting) can't pin the doors shut forever
// (the map it was made on and what it worked out from it — `map`, `local` — are private fields behind getters:
// never among the world's own keys, so never in a save)
const NOT_SAVED = new Set(["nav", "stepMs", "hooks", "listeners", "fac", "rng", "doorOpenIdx"]);
/** what saveState hands save.ts (a plain graph) */
export type WorldState = Record<string, unknown>;

export interface SimStats {
  deaths: number; downs: number; revives: number; fights: number; swings: number; shots: number;
  zombiesKilled: number; bites: number; grabs: number; grabsBroken: number; doorsBroken: number; doorsOpened: number;
  roomsExplored: number; spotsLooted: number; keycards: number; breakers: number;
  /** a survivor's route through a room nobody in their knowledge had seen (must stay 0) */
  knowLeaks: number;
  /** records read (in person or glanced) */
  recordsRead: number;
  /** THE TRICKLE: groups that came in, the dead they brought, and the ones put off (and why) */
  arrivals: { groups: number; dead: number; deferred: Record<string, number>; heard: number };
  /** PROXIMITY (Josh, Oct 28 2026): every interaction's distance from what it touched, and its facing */
  reach: { n: number; worst: number; worstWhat: string; over: number; byWhat: Record<string, number>; overBy?: Record<string, number> };
  /** jobs that couldn't be done, by kind and why (the autonomy audit's stuck detections) */
  jobFails: Record<string, number>;
  /** the same, by where: "kind:why from>to [target]" (bunker-sim.mjs --where prints the worst) */
  jobFailAt: Record<string, number>;
  /** items used up / made, for the census */
  used: Census; made: Census;
  /** combat detail for the profile (shoves, staggers, knockdowns, weapons broken, grabs that bit, …) */
  combat: Record<string, number>;
  events: Record<string, number>; frames: Record<string, number>; frameBytes: number; maxTickBytes: number;
  director: Record<string, number>;
  /** dead zombies taken off the screens (CORPSE_RETIRE_MS) */
  corpsesRetired?: number;
}

/** Something lying where it fell: a dead man's keycard, a dead friend's gear (§8: "the dead keep their gear
 *  where they fall, and the others can loot them"). `rp`/`rr` are loose pistol / rifle rounds. */
export interface Drop { id: string; cell: number; floor: number; items: Item[]; card: number; rp: number; rr: number; who?: SurvivorId }

/** Every item there is, counted wherever it is — the conservation audit (Josh, Oct 28 2026: "do an
 *  equipment validation check"). `used` is what was eaten, drunk, spent or fired; `made` is what the
 *  sinks put in bottles. census(now) + used − made must equal census(start), item by item. */
export type Census = Record<string, number>;

interface Group {
  /** the best card anybody has picked up (the readout; passing a reader needs it ON somebody) */
  keycard: number;
  box: { food: number; water: number; bandage: number; medkit: number; ammoP: number; ammoR: number; battery: number; gear: string[] };
  explored: Uint8Array;
  looted: Set<string>;
  read: Set<string>;
  /** dynamic finds: the chief's card where he fell */
  drops: Drop[];
  loot: Map<string, Item[]>;
  /** the zones anybody has set foot in (for zone.found) */
  zonesFound: Set<ZoneId>;
  /** containers somebody has been through at least once (`looted` is only the emptied ones) */
  searched: Set<string>;
  /** when anybody last moved the group on (a room, a find, a log, a breaker, a card) */
  lastProgress: number;
}

export class SimWorld {
  readonly nav: Nav;
  // (private, behind getters: a save is every own key of the world, and these two are not state)
  #map: MapDef;
  #local: SimLocal;
  /** THE MAP this world was made on (SimOptions.map, sim/mapdef.ts): its rooms, doors, zones, start rooms, where
   *  the dead stand and come from. Everything that used to read the bunker's own modules reads this. */
  get map(): MapDef { return this.#map; }
  /** THE MAP'S OWN OBJECTIVES (sim/scenario.ts), or null: the bunker's are written into goals.ts and survivor.ts */
  get scn(): Scenario | null { return this.#scn; }
  #scn: Scenario | null = null;
  /** who the admin drives in this world (SimOptions.player), null in every run that isn't a walk */
  #player: SurvivorId | null = null;
  /** the scenario's state for this run: plain data, saved with the world (null on a map without one) */
  sc: unknown = null;
  /** what this world worked out from its map, once (survivor.ts SimLocal: the spots, the beds, the doors' places) */
  get local(): SimLocal { return this.#local; }
  fac!: FacilityWorld;
  rng!: Rng;
  seed!: number;
  t!: number;
  startedAt!: number;
  readonly stepMs: number;
  /** THE RUN's stable id (SimOptions.run) */
  run!: string;
  bodies: Body[] = [];
  survivors: Survivor[] = [];
  zombies: Zombie[] = [];
  noises: Noise[] = [];
  group!: Group;
  dir!: DirectorState;
  stats!: SimStats;
  hooks: SimHooks;
  private noiseId = 0;
  private listeners: ((f: ServerFrame) => void)[] = [];
  private acc = 0;
  private stepN = 0;
  private paused = false;
  private directorOn: boolean;
  /** the plan a meeting agreed (hooks.plan or setPlan), and when */
  groupPlan: (GroupPlan & { at: number }) | null = null;
  lastDeathAt = 0;
  /** THE BUNKER'S OBJECTIVES (goals.ts) */
  obj: Objectives = newObjectives();
  /** (the old show's endings: none in the bunker; kept for the readers that still look) */
  endings: { truth?: number; cure?: number; escape?: number } = {};
  /** when the armory was first opened with the keycard */
  armoryOpenAt = 0;
  /** who put down the last of the dead (the clear's moment) */
  lastKillBy = "";
  private lastGoals = "";
  /** NOBODY LEFT, OR THE END REACHED: the show is over (`show.over`, once) */
  overAt = 0;
  /** THE TRICKLE: when the next of the dead comes in through the open blast door */
  nextArrivalAt = 0;
  /** who this run started with, in spawn order (SimOptions.cast; saved, so a resumed run keeps them) */
  cast: SurvivorId[] = [...SURVIVOR_IDS];
  /** THE CONTROL ROOM's dials (a test run's): how long the show runs, the trickle's pace (1 = as the tables
   *  say, 0 = none, 2 = twice as often), and the dead at the start (null = PLACEMENTS as written). Saved. */
  showMs: number = OBJ.showMs;
  trickle = 1;
  startZombies: number | null = null;
  /** the run setup's picks (SimOptions.starts / partSpot / noteSpot). Saved. */
  pickStarts: Record<string, string> = {};
  pickPart = "";
  pickNote = "";
  /** when a survivor last went through each door */
  doorUsed!: Float64Array;
  private lastDirWire = "";
  private lastSupplies = "";

  constructor(opts: SimOptions = {}) {
    this.#map = mapDef(opts.map);
    this.#scn = scenarioFor(this.#map.scenario);
    this.#local = newSimLocal(this.#map);
    this.nav = new Nav(this.#map.nav);
    this.doorUsed = new Float64Array(this.#map.site.doors.length);
    this.stepMs = opts.stepMs ?? STEP_MS;
    this.hooks = opts.hooks ?? {};
    this.directorOn = opts.director ?? true;
    if (opts.cast?.length) this.cast = [...opts.cast];
    if (opts.player) { this.#player = opts.player; this.cast = [opts.player]; this.showMs = WALK.SHOW_MS; }
    if (opts.zombies !== undefined && Number.isFinite(opts.zombies)) this.startZombies = Math.max(0, Math.min(60, Math.round(opts.zombies)));
    if (opts.starts) this.pickStarts = { ...opts.starts };
    if (opts.partSpot) this.pickPart = opts.partSpot;
    if (opts.noteSpot) this.pickNote = opts.noteSpot;
    this.reset(opts.seed ?? randomSeed(), opts.start ?? 1_800_000_000_000, opts.run);
  }

  // ---- levers ----------------------------------------------------------------------------------------
  reset(seed = this.seed, start = this.startedAt ?? 1_800_000_000_000, run?: string): void {
    this.seed = seed >>> 0;
    this.run = run ?? `${this.seed}:${start}`;
    this.rng = new Rng(this.seed);
    this.t = start;
    this.startedAt = start;
    this.acc = 0; this.stepN = 0;
    this.fac = new FacilityWorld(this.map.site, () => this.t, () => this.rng.u32());
    for (const id of this.map.lockedDoors) { const d = this.fac.doors.get(id); if (d) { d.open = false; d.locked = true; } }
    for (const id of this.map.openDoors ?? []) { const d = this.fac.doors.get(id); if (d) { d.open = true; d.locked = false; } }
    this.sc = this.#scn ? this.#scn.init(this) : null;
    this.bodies = []; this.survivors = []; this.zombies = []; this.noises = [];
    this.lastDeathAt = 0; this.nextArrivalAt = 0; this.armoryOpenAt = 0; this.lastKillBy = "";
    this.endings = {}; this.lastGoals = ""; this.overAt = 0;
    // THIS RUN's hiding places: the radio's part and the code's note (one of a few spots each, follow-ups 3-4)
    const parts = this.map.spotsOf("part"), notes = this.map.spotsOf("note");
    // (both rolls are drawn even when picked, so a pick moves the hiding place and nothing else)
    const rolledPart = parts.length ? this.rng.pick(parts).id : "", rolledNote = notes.length ? this.rng.pick(notes).id : "";
    this.obj = newObjectives(
      parts.some((p) => p.id === this.pickPart) ? this.pickPart : rolledPart,
      notes.some((n) => n.id === this.pickNote) ? this.pickNote : rolledNote,
    );
    this.doorUsed.fill(0);
    this.group = {
      keycard: 0, box: { ...START_BOX, ammoP: START_BOX.ammo, ammoR: 0, gear: [] },
      explored: new Uint8Array(this.nav.rooms.length), looted: new Set(), read: new Set(), drops: [], loot: new Map(),
      zonesFound: new Set<ZoneId>(), searched: new Set(), lastProgress: start,
    };
    this.stats = {
      deaths: 0, downs: 0, revives: 0, fights: 0, swings: 0, shots: 0, zombiesKilled: 0, bites: 0, grabs: 0, grabsBroken: 0,
      doorsBroken: 0, doorsOpened: 0, roomsExplored: 0, spotsLooted: 0, keycards: 0, breakers: 0, knowLeaks: 0, recordsRead: 0, combat: {},
      arrivals: { groups: 0, dead: 0, deferred: {}, heard: 0 }, reach: { n: 0, worst: 0, worstWhat: "", over: 0, byWhat: {} }, used: {}, made: {}, jobFails: {}, jobFailAt: {},
      events: {}, frames: {}, frameBytes: 0, maxTickBytes: 0, director: {},
    };
    this.dir = newDirector(this.t);
    this.dir.on = this.directorOn;
    initSpots(this);
    this.rollLoot();
    this.placeSurvivors();
    // (the admin's own body: on its feet at once, and flagged before anything reads the cast)
    if (this.#player) for (const s of this.survivors) if (s.who === this.#player) { s.player = newPlayerCtl(); s.busyUntil = 0; }
    this.placeZombies();
    this.#scn?.setup(this);
    this.emit(this.snapshot());
    // THE BREACH: the alarm (red beacons, the PA) runs until the door is sealed (third round 9-10)
    // (a map with no blast door has no breach and no alarm)
    const blast = this.nav.doorIdx.get("blast");
    if (blast !== undefined) this.ev("alarm.start", { at: this.nav.doorCentre[blast] });
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  get isPaused(): boolean { return this.paused; }
  setDirector(on: boolean): void { this.directorOn = on; this.dir.on = on; }
  /** Set (or with null clear) the group's plan directly — the meeting layer's other door. */
  setPlan(p: GroupPlan | null): void { this.groupPlan = p ? { zone: p.zone, team: { ...p.team }, at: this.t } : null; }

  // ---- SAVE AND RESUME (save.ts) ------------------------------------------------------------------------
  /** Everything the next step depends on, as a plain graph (save.ts encodes it). Every own field but
   *  NOT_SAVED's, the Rng's words, the facility's doors and power, and survivor.ts's per-world hold. */
  saveState(): WorldState {
    // the map it was made on: a save from another map (the old Halcyon show) must never be loaded into this one
    const o: WorldState = { v: 1, stepMs: this.stepMs, mapId: this.map.site.id };
    for (const k of Object.keys(this)) if (!NOT_SAVED.has(k)) o[k] = (this as unknown as Record<string, unknown>)[k];
    o.rng = this.rng.getState();
    o.fac = { doors: this.fac.doors, sealed: this.fac.sealed, bolted: this.fac.bolted };
    o.mod = exportSimState(this);
    return o;
  }
  /** Become the world `saveState` described. The map, the listeners and the hooks stay this world's. */
  loadState(o: WorldState): void {
    if (o.v !== 1) throw new Error(`save: unknown version ${String(o.v)}`);
    if (o.stepMs !== this.stepMs) throw new Error(`save: made with ${String(o.stepMs)} ms steps, this world steps ${this.stepMs}`);
    if (o.mapId !== this.map.site.id) throw new Error(`save: from another map (${String(o.mapId ?? "the old facility")}, this is ${this.map.site.id})`);
    const self = this as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      if (k === "v" || k === "stepMs" || k === "mapId" || k === "rng" || k === "fac" || k === "mod") continue;
      if (NOT_SAVED.has(k)) continue;
      self[k] = v;
    }
    this.rng.setState(o.rng as number[]);
    const f = o.fac as { doors: Map<string, import("../doors").DoorState>; sealed: boolean; bolted?: Set<string> };
    this.fac.doors.clear(); for (const [id, d] of f.doors) this.fac.doors.set(id, d);
    this.fac.sealed = f.sealed;
    this.fac.bolted.clear(); for (const id of f.bolted ?? []) this.fac.bolted.add(id);
    importSimState(this, o.mod as Parameters<typeof importSimState>[1]);
    this.#player = this.survivors.find((s) => s.player)?.who ?? null;
    // A RUN SAVED BEFORE THE SKILLS ROUND (Nov 5 2026) has the old genome and five skills: the genes it lacks read
    // as the character's (or 5), the skills it lacks as the creator set them, and `st` (a STATS reference) is the
    // new table already — so the run carries on with what it had learned.
    for (const s of this.survivors) {
      const g = s.gen as unknown as Record<string, number>;
      for (const k of GENES) if (typeof g[k] !== "number") g[k] = START[s.who]?.[k] ?? 5;
      if (s.st) for (const k of Object.keys(s.st) as (keyof typeof s.st)[]) if (typeof s.skills.lv[k] !== "number") s.skills.lv[k] = s.st[k];
    }
  }

  /** (the old show's power lever: the bunker is lit throughout) */
  setPower(_zone: ZoneId, _on: boolean): Result { return { ok: false, why: "no_power_zones" }; }

  private find(id: string): Body | undefined { return this.bodies.find((b) => b.id === id); }

  /** The test lever: kill a survivor or a zombie outright. */
  kill(id: string): boolean {
    const b = this.find(id);
    if (!b || !b.alive) return false;
    if (b.kind === "survivor") this.dieSurvivor(b as Survivor, "admin");
    else this.killZombie(b as Zombie, -1, "torso");
    return true;
  }
  /** Put a survivor down (bleeding out), as if a fight went badly. */
  down(id: string): boolean {
    const b = this.find(id);
    if (!b || b.kind !== "survivor" || !b.alive) return false;
    const s = b as Survivor;
    if (s.mode === "down") return false;
    s.hp = 0; this.goDown(s, "admin");
    return true;
  }
  /** The test lever: a survivor infected (seen, so the group knows), `hours` into the 24-hour clock —
   *  a turn can be watched on demand (infection.ts). */
  infect(id: string, hours = 0): boolean {
    const b = this.find(id);
    if (!b || b.kind !== "survivor" || !b.alive) return false;
    const s = b as Survivor;
    if (s.infected) { s.infectedAt = this.t - hours * 3_600_000; return true; }
    s.infected = true; s.bitten = true; s.infectedAt = this.t - hours * 3_600_000;
    onInfected(this, s, true);
    return true;
  }
  /** Bring a survivor back: a downed one on its feet, or a dead one alive at the safe room. */
  revive(id: string): boolean {
    const b = this.find(id);
    if (!b || b.kind !== "survivor") return false;
    const s = b as Survivor;
    if (s.mode === "down") { this.standUp(s, 40, -1); return true; }
    if (s.alive || s.turned || s.escaped) return false;
    s.alive = true; s.mode = "job"; s.hp = 60; s.bleeding = 0; s.downUntil = 0; s.job = null;
    s.bag = null;   // their gear (pack included) is still on the body where they fell
    s.pose = "idle";
    // (the infirmary; on a map without one, the map's start room)
    const c = roomAt(this, this.nav.roomIdx.get("infirmary") ?? this.nav.roomIdx.get(this.map.site.start) ?? 0, 0.5, 0.5);
    this.place(s, c);
    this.stats.deaths = Math.max(0, this.stats.deaths - 1);
    return true;
  }

  /** THE SPAWN LEVER (BUNKER.md 41): `n` of the dead, awake, in `roomId` (any room but the tunnel when omitted —
   *  never one a survivor is in, never within 8 m of one). Returns how many came. */
  spawnZombies(n: number, roomId?: string): number {
    const tunnel = this.outsideRoom();
    // (never past DEAD_MAX standing: the lever made 310 when it was pressed for long enough; and never past
    // BODIES_MAX made in one run, standing or fallen: a retired body keeps its place in the list and the save)
    n = Math.min(n, DEAD_MAX - this.deadUp(), BODIES_MAX - this.bodies.length);
    const rooms = roomId !== undefined
      ? [this.nav.roomIdx.get(roomId)].filter((r): r is number => r !== undefined)
      : this.nav.rooms.map((_, i) => i).filter((i) => i !== tunnel && !this.survivors.some((s) => s.alive && s.room === i));
    if (!rooms.length) return 0;
    let made = 0;
    for (let k = 0; k < Math.max(0, Math.min(10, n)); k++) {
      for (let tries = 0; tries < 30; tries++) {
        const room = this.rng.pick(rooms);
        const c = roomAt(this, room, this.rng.range(0.15, 0.85), this.rng.range(0.15, 0.85));
        if (c < 0 || !this.nav.isWalk(c) || this.nav.door[c] >= 0) continue;
        const [x, , z] = this.nav.centre(c);
        if (this.survivors.some((s) => s.alive && Math.hypot(s.x - x, s.z - z) < 8)) continue;
        if (this.bodies.some((b) => b.alive && b.cell === c)) continue;
        const zb = this.makeZombie("shambler", c);
        zb.arrivedAt = this.t; zb.why = "spawned";
        this.emit({ type: "spawn", body: this.bodyState(zb) });
        made++;
        break;
      }
    }
    return made;
  }

  /** THE HEAL LEVER: full health, the bleeding stopped, a downed survivor back on their feet. */
  heal(id: string): boolean {
    const b = this.find(id);
    if (!b || b.kind !== "survivor" || !b.alive) return false;
    const s = b as Survivor;
    if (s.mode === "down") this.standUp(s, s.hpMax, -1);
    s.hp = s.hpMax; s.bleeding = 0; s.downUntil = 0;
    return true;
  }
  /** THE GIVE LEVER: an item into their pack (or at their feet when it's full). */
  give(id: string, item: Item, n = 1): boolean {
    const b = this.find(id);
    if (!b || b.kind !== "survivor" || !b.alive || !(item in ITEM_PROP)) return false;
    const s = b as Survivor;
    this.giveItems(s, Array.from({ length: Math.max(1, Math.min(5, n)) }, () => item), `admin-${this.t}-${s.who}`);
    return true;
  }
  /** THE MOVE LEVER: a survivor stood in another room (their job dropped; never into the tunnel). */
  moveTo(id: string, roomId: string): boolean {
    const b = this.find(id);
    const room = this.nav.roomIdx.get(roomId);
    if (!b || b.kind !== "survivor" || !b.alive || room === undefined || room === this.outsideRoom()) return false;
    const s = b as Survivor;
    if (s.mode === "down") return false;
    for (let tries = 0; tries < 60; tries++) {
      const c = roomAt(this, room, this.rng.range(0.2, 0.8), this.rng.range(0.2, 0.8));
      if (c < 0 || !this.nav.isWalk(c) || this.nav.door[c] >= 0) continue;
      if (this.bodies.some((o) => o !== s && o.alive && o.cell === c)) continue;
      s.job = null; s.path = null; s.mode = "job";
      this.place(s, c);
      return true;
    }
    return false;
  }
  /** THE CLEAR LEVER: every one of the dead put down, or only those in `roomId`. Returns how many. */
  /** how many of the dead are up */
  deadUp(): number { let n = 0; for (const z of this.zombies) if (z.alive && !z.gone) n++; return n; }
  killZombies(roomId?: string): number {
    const room = roomId !== undefined ? this.nav.roomIdx.get(roomId) : undefined;
    if (roomId !== undefined && room === undefined) return 0;
    let n = 0;
    for (const z of this.zombies) if (z.alive && !z.gone && (room === undefined || z.room === room)) { this.killZombie(z, -1, "torso"); n++; }
    return n;
  }
  /** THE DIALS: the show's length (5 min to 3 h) and the trickle's pace (0 to 4x). */
  setShowLength(minutes: number): boolean {
    // (to six hours: a walk's own length, which the lever could shorten and never give back)
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 360) return false;
    this.showMs = Math.round(minutes) * 60_000;
    return true;
  }
  setTrickle(rate: number): boolean {
    if (!Number.isFinite(rate) || rate < 0 || rate > 4) return false;
    this.trickle = rate;
    this.nextArrivalAt = 0;   // the next arrival is drawn again at the new pace
    return true;
  }

  /** THE RUN SETUP (Admin Panel → Show): where everyone woke, where this run hides the part and the note, and the dead. */
  setup(): { seed: number; starts: { who: string; room: string }[]; partSpot: string; noteSpot: string; zombies: number; inside: number } {
    return {
      seed: this.seed,
      starts: this.survivors.map((s) => ({ who: s.who, room: s.startRoom ?? this.nav.rooms[s.room]?.id ?? "?" })),
      partSpot: this.obj.partSpot, noteSpot: this.obj.noteSpot,
      zombies: this.zombies.filter((z) => z.alive && !z.gone).length,
      inside: insideCount(this),
    };
  }

  // ---- frames --------------------------------------------------------------------------------------
  onFrame(cb: (f: ServerFrame) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((x) => x !== cb); };
  }
  private emit(f: ServerFrame) {
    this.stats.frames[f.type] = (this.stats.frames[f.type] ?? 0) + 1;
    for (const l of this.listeners) l(f);
  }
  /** An event frame (effects + sound vocabulary). The seed is always drawn, listener or not. */
  ev(event: string, fields: Partial<Ev> & Record<string, unknown> = {}): void {
    this.stats.events[event] = (this.stats.events[event] ?? 0) + 1;
    const e: Ev = { type: "ev", event, t: this.t, seed: this.rng.u32(), ...fields };
    if (this.listeners.length) this.emit(e);
  }
  /** An event that draws NO dice (its seed is the caller's): for a cue added after a run's numbers were
   *  argued — ev() takes its seed off the run's rng, so a new ev() in a hot loop re-rolls everything after it */
  evQuiet(event: string, seed: number, fields: Partial<Ev> & Record<string, unknown> = {}): void {
    this.stats.events[event] = (this.stats.events[event] ?? 0) + 1;
    if (this.listeners.length) this.emit({ type: "ev", event, t: this.t, seed: seed >>> 0, ...fields });
  }
  /** Turn a FacilityWorld result into an event frame, with the door's new state riding on it. */
  facEv(r: Result, by: string | undefined, at?: [number, number, number]): void {
    if (!r.ok && !r.fx) return;
    if (!r.fx) return;
    const fx = r.fx;
    this.stats.events[fx.event] = (this.stats.events[fx.event] ?? 0) + 1;
    if (fx.event === "door.broken") this.stats.doorsBroken++;
    if (fx.event === "door.open" || fx.event === "door.keycard" || fx.event === "keypad.ok") this.stats.doorsOpened++;
    if (!this.listeners.length) return;
    const e: Ev = { type: "ev", event: fx.event, t: fx.t, seed: fx.seed };
    if (fx.at || at) e.at = fx.at ?? at;
    if (by) e.by = by;
    for (const k of ["door", "normal", "size", "material", "side", "lastHp", "room", "zone", "on"] as const) if (fx[k] !== undefined) e[k] = fx[k];
    if (fx.door) e.state = this.doorWire(fx.door);
    this.emit(e);
  }
  say(who: SurvivorId, what: string, ctx?: Record<string, unknown>): void { this.hooks.say?.(this, who, what, ctx); }
  /** Items into a survivor's pack as far as there's room; the rest lie where they stand (a drop). */
  giveItems(s: Survivor, items: Item[], dropId: string): void {
    const left: Item[] = [];
    for (const it of items) { if (slotsUsed(s) < slotsMax(s)) s.pack.spare.push(it); else left.push(it); }
    if (left.length) { this.group.drops.push({ id: dropId, cell: s.cell, floor: s.floor, items: left, card: 0, rp: 0, rr: 0 }); s.know.drops.add(dropId); }
  }
  /** a body leaves the screens (a survivor who turned), and one arrives (the thing they became) */
  emitGone(id: string): void { this.emit({ type: "gone", id }); }
  emitSpawn(b: Body): void { this.emit({ type: "spawn", body: this.bodyState(b) }); }

  doorWire(id: string): DoorWire {
    const s = this.fac.doors.get(id)!;
    // (a boarded window's barricade IS its count of boards; the old doors' was health, a hundred a plank)
    const planks = this.fac.kindOf(id) === "window" ? s.barricade : Math.ceil(s.barricade / 100);
    return { id, open: s.open, locked: s.locked, broken: s.broken, planks, reinforced: false, health: s.health };
  }

  snapshot(): Snapshot {
    const power: Record<string, boolean> = {};
    for (const z of this.map.site.zones) power[z.id] = this.fac.hasPower(z.id);
    // the client's baked set is "bunker" (show/site.ts), and its lightmap only swaps to the lit one when told the
    // set has power. The bunker is lit throughout (BUNKER.md 10), so say so, or every room draws dark.
    power.bunker = true;
    // a map with a scenario: the house's lights are on unless the scenario says the house is dark
    if (this.scn) { const r = this.nav.roomIdx.get(this.map.site.start); if (r !== undefined) power[this.map.site.zones[0].id] = !this.scn.dark(this, r); }
    return {
      type: "snap", t: this.t, day: this.day(), run: this.run, map: this.map.id,
      bodies: this.bodies.filter((b) => !(b as Zombie).gone).map((b) => this.bodyState(b)),
      doors: this.map.site.doors.map((d) => this.doorWire(d.id)),
      power, director: this.dirWire(), supplies: this.supplies(), goals: (this.scn ? this.scn.goals(this) : goalsWire(this)),
    };
  }
  day(): number { return Math.floor((this.t - this.startedAt) / 86_400_000) + 1; }

  bodyState(b: Body): BodyState {
    const out: BodyState = {
      id: b.id, kind: b.kind, body: b.body, pos: [r2(b.x), r2(b.y), r2(b.z)], heading: r2(b.h), pose: b.pose,
      room: b.room >= 0 ? this.nav.rooms[b.room].id : null, hp: Math.round(b.hp), hpMax: b.hpMax, why: b.why,
    };
    const lk = this.linkKind(b);
    if (lk) out.link = lk;
    if (b.kind === "survivor") {
      const s = b as Survivor;
      out.who = s.who; out.held = s.held; out.torch = s.torch; out.alert = s.alert; out.pack = s.bag; out.vitals = this.vitals(s);
      // turned: their card stays on the strip, dead; the body itself isn't drawn (the thing they became is)
      if (s.turned) out.turned = s.who;
      if (s.escaped) out.escaped = true;
    } else { out.zkind = (b as Zombie).zkind; if ((b as Zombie).turnedFrom) out.turned = (b as Zombie).turnedFrom; }
    return out;
  }
  /** the link a body is crossing, as the screen draws it (stairs are walked: none) */
  linkKind(b: Body): LinkKind | null {
    const k = b.link ? this.nav.portals[b.link.portal]?.kind : null;
    return k === "ladder" || k === "vent" || k === "lift" || k === "window" ? k : null;
  }
  vitals(s: Survivor): SurvivorVitals {
    return {
      stamina: r2(s.stamina), hunger: r2(Math.min(1, s.hungerH / NEEDS.starvingAt)), thirst: r2(Math.min(1, s.thirstH / NEEDS.dehydratedAt)),
      tired: r2(Math.min(1, s.tiredH / NEEDS.collapseAt)), morale: Math.round(s.morale), infected: s.infKnown, bitten: s.bitten, ...(s.kills ? { kills: s.kills } : {}), ...(s.sick >= 2 ? { sick: s.sick } : {}),
      bleeding: s.bleeding, ...(s.mode === "down" ? { downUntil: s.downUntil } : {}), job: s.hidden ? "hiding" : s.turnAt ? "turning" : s.mode === "job" ? (s.job && (s.job.kind === "task" || s.job.kind === "run") && this.scn?.why ? this.scn.why(s.job) : s.job?.kind ?? "idle") : s.mode,
      inv: {
        melee: s.melee,
        ...(s.gun ? { gun: s.gun, rounds: s.mag + (s.gun === "rifle" ? s.pack.ammoR : s.pack.ammoP) } : {}),
        food: s.pack.food, water: s.pack.water, bandage: s.pack.bandage, medkit: s.pack.medkit,
        ...(s.card ? { card: s.card } : {}),
        ...(s.bag ? { pack: s.bag } : {}),
        slots: slotsUsed(s), slotsMax: slotsMax(s), battery: s.pack.battery,
      },
    };
  }
  supplies(): Supplies {
    const b = this.group.box, alive = this.survivors.filter((s) => s.alive).length;
    return {
      food: b.food, water: b.water, bandage: b.bandage, medkit: b.medkit, ammo: b.ammoP + b.ammoR,
      foodDays: alive ? Math.round((b.food / (alive * 2.5)) * 10) / 10 : 0,
    };
  }
  dirWire(): DirectorWire {
    const tension: Record<string, number> = {};
    for (const s of this.survivors) if (s.alive) tension[s.who] = Math.round(this.dir.tension[s.who] ?? 0);
    let best: Survivor | null = null, bt = -1;
    for (const s of this.survivors) if (s.alive && (this.dir.tension[s.who] ?? 0) > bt) { bt = this.dir.tension[s.who] ?? 0; best = s; }
    const focus = best ? { id: best.id, why: best.mode === "job" ? (best.job?.kind ?? "idle") : best.mode } : undefined;
    return { phase: this.dir.phase, tension, ...(focus ? { focus } : {}) };
  }

  private tickFrame(): void {
    if (!this.listeners.length) return;
    const b: TickBody[] = [];
    const vitEvery = this.stepN % TICK_HZ === 0;
    for (const x of this.bodies) {
      if ((x as Survivor).turned || (x as Survivor).escaped || (x as Zombie).gone) continue;
      const s = x.s;
      const posCh = Math.abs(x.x - s.x) > 0.01 || Math.abs(x.z - s.z) > 0.01 || Math.abs(x.y - s.y) > 0.01 || Math.abs(x.h - s.h) > 0.02;
      const tb: TickBody = { id: x.id, p: [r2(x.x), r2(x.y), r2(x.z)], h: r2(x.h) };
      let ch = posCh;
      if (x.pose !== s.pose) { tb.pose = x.pose; s.pose = x.pose; ch = true; }
      // the link they're crossing (a ladder climbed, a vent crawled, a lift ridden — stairs are walked)
      const lk = this.linkKind(x);
      if (lk !== (s.link ?? null)) { tb.link = lk; s.link = lk; ch = true; }
      if (x.kind === "survivor") {
        const v = x as Survivor;
        if (v.held !== s.held) { tb.held = v.held; s.held = v.held; ch = true; }
        if (v.torch !== s.torch) { tb.torch = v.torch; s.torch = v.torch; ch = true; }
        if (v.alert !== s.alert) { tb.alert = v.alert; s.alert = v.alert; ch = true; }
        if (v.bag !== s.bag) { tb.pack = v.bag; s.bag = v.bag; ch = true; }
        if (vitEvery) {
          const vit = this.vitals(v), key = JSON.stringify(vit);
          if (key !== s.vit) { tb.vitals = vit; s.vit = key; ch = true; }
        }
      }
      const hp = Math.round(x.hp);
      if (hp !== s.hp) { tb.hp = hp; s.hp = hp; ch = true; }
      if (x.room !== s.room) { tb.room = x.room >= 0 ? this.nav.rooms[x.room].id : null; s.room = x.room; ch = true; }
      if (x.why !== s.why) { tb.why = x.why; s.why = x.why; ch = true; }
      if (!ch) continue;
      s.x = x.x; s.z = x.z; s.y = x.y; s.h = x.h;
      b.push(tb);
    }
    let director: DirectorWire | undefined;
    if (vitEvery) {
      const dw = this.dirWire(), key = JSON.stringify(dw);
      if (key !== this.lastDirWire) { director = dw; this.lastDirWire = key; }
    }
    let supplies: Supplies | undefined;
    if (vitEvery) {
      const sp = this.supplies(), key = JSON.stringify(sp);
      if (key !== this.lastSupplies) { supplies = sp; this.lastSupplies = key; }
    }
    let goals: ReturnType<typeof goalsWire> | undefined;
    if (vitEvery) {
      const g = (this.scn ? this.scn.goals(this) : goalsWire(this)), key = JSON.stringify(g);
      if (key !== this.lastGoals) { goals = g; this.lastGoals = key; }
    }
    if (!b.length && !director && !supplies && !goals) return;
    const f = { type: "tick" as const, t: this.t, b, ...(director ? { director } : {}), ...(supplies ? { supplies } : {}), ...(goals ? { goals } : {}) };
    this.emit(f);
  }

  // ---- the clock -------------------------------------------------------------------------------------
  /** Advance the show by dtMs in fixed steps (one tick frame each). At most 600 steps run per call
   *  (a minute of show at 10 Hz) so a stalled caller can't freeze the process catching up; the rest
   *  carries over to the next call, so no time is ever lost. */
  tick(dtMs: number): void {
    if (this.paused) return;
    this.acc += Math.max(0, dtMs);
    let n = 0;
    while (this.acc >= this.stepMs && n < 600) { this.acc -= this.stepMs; this.step(); n++; }
  }

  private step(): void {
    const dt = this.stepMs;
    this.t += dt;
    this.stepN++;
    // noises live long enough for every zombie's sense pass to catch them once
    if (this.noises.length && this.noises[0].t < this.t - 1500) this.noises = this.noises.filter((n) => n.t >= this.t - 1500);
    // (where every survivor stood and faced before the step: A BODY HAS WEIGHT, below)
    const W = this.was;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i], k = i * 9;
      W[k] = s.x; W[k + 1] = s.z; W[k + 2] = s.h; W[k + 3] = s.cell; W[k + 4] = s.room; W[k + 5] = s.floor; W[k + 6] = this.onFeet(s) ? 1 : 0;
    }
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i];
      if (s.alive) survivorStep(this, s, dt);
      // (where their own step left them: what moves them after it is a push, not their walk)
      W[i * 9 + 7] = s.x; W[i * 9 + 8] = s.z;
    }
    zombieSenseAll(this);
    for (const z of this.zombies) if (z.alive) zombieStep(this, z, dt);
    this.progress();
    this.separate();
    // (a chain holds against a shove too: the push apart comes after the dead have had their step, and it put the
    // one in the cell up to half a metre past its chain for a moment whenever something crowded it)
    for (const z of this.zombies) if (z.leash && z.alive && !z.link) {
      const d = Math.hypot(z.x - z.leash[0], z.z - z.leash[1]);
      if (d > z.leash[2] + 0.05) this.stepTo(z, z.leash[0] + (z.x - z.leash[0]) / d * z.leash[2], z.leash[1] + (z.z - z.leash[1]) / d * z.leash[2]);
    }
    // (after everything that moves a survivor this step: their own job, a grab, the push out of somebody's space)
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i], k = i * 9;
      if (s.alive) this.weigh(s, W[k], W[k + 1], W[k + 2], W[k + 3], W[k + 4], W[k + 6] === 1 && s.floor === W[k + 5] && this.onFeet(s), Math.hypot(s.x - W[k + 7], s.z - W[k + 8]) > 0.01, dt);
    }
    if (this.stepN % Math.max(1, Math.round(1000 / dt)) === 0) this.secondly();
    this.tickFrame();
  }

  /** Once a second: the objectives (the crank, the repair, the ends), the trickle, the introductions, the director. */
  private secondly(): void {
    this.objectiveWork();
    this.#scn?.second(this);
    this.sneakPractice();
    if (this.#scn) this.#scn.tick(this); else objectivesTick(this);
    this.introductions();
    this.risers();
    // (no corpse retirement: BODIES STAY WHERE THEY FALL, 42 — and a one-hour show never piles up enough to need it)
    // (...but never more than CORPSES_MAX of them: a lever-driven test run did pile them up)
    this.capCorpses();
    // THE TRICKLE (38): one more every 45–60 s while the blast door stands open
    if (!this.fac.sealed && !this.obj.ending && this.trickle > 0) {
      if (!this.nextArrivalAt) this.nextArrivalAt = this.t + this.rng.range(ARRIVAL.gapMin, ARRIVAL.gapMax) / this.trickle;
      if (this.t >= this.nextArrivalAt) this.arrive();
    }
    if (this.hooks.plan && this.stepN % Math.round(60_000 / this.stepMs) === 0) { const p = this.hooks.plan(this); if (p) this.setPlan(p); }
    if (!this.directorOn || this.obj.ending) { this.dir.lastStep = this.t; return; }
    const inp: DirSurvivor[] = this.survivors.map((s) => ({
      id: s.who, awake: true, safe: false,
      hp: s.hp, down: s.mode === "down", dead: !s.alive, chased: s.chasedBy >= 0, grabbed: s.grabbedBy.length > 0,
      fighting: s.mode === "fight", dark: false, alone: this.t - s.lastAllyNear > 30_000,
      needy: s.hungerH > NEEDS.hungryAt || s.thirstH > NEEDS.thirstyAt, hurt: s.hurt,
    }));
    for (const s of this.survivors) s.hurt = 0;
    const acts = directorStep(this.dir, { now: this.t, survivors: inp, deaths: this.stats.deaths, lastDeathAt: this.lastDeathAt, startedAt: this.startedAt, trickle: false }, () => this.rng.next());
    for (const a of acts) {
      this.stats.director[a.kind] = (this.stats.director[a.kind] ?? 0) + 1;
      const s = "near" in a ? this.survivors.find((x) => x.who === a.near) : undefined;
      if (a.kind === "wake" && s) this.dirWake(s);
      else if (a.kind === "noise" && s) this.dirNoise(s, a.event);
      else if (a.kind === "quiet" && s) {
        for (const z of this.zombies) if (z.alive && z.floor === s.floor && (z.state === "idle" || z.state === "wander") && d2(z, s) < 25 * 25) z.heldQuiet = a.until;
      }
    }
  }

  /** THE CRANK AND THE RADIO, once a second: the hands on the wheel turn it (one ~60 s, two ~35 s, a grab takes
   *  a pair of hands off it — progress is kept, fifth round 20); its grind draws the dead (24). The radio's repair
   *  (Electronics makes it faster, 28), its static drawing the dead too (22). */
  /** STEALTH'S PRACTICE (Nov 4 2026), once a second: creeping (a crouch, on the move) with the dead near and none of
   *  them hunting you is how the skill gets better. */
  private sneakPractice(): void {
    for (const s of this.survivors) {
      if (!s.alive || s.gait !== "crouch" || s.mode === "down" || s.grabbedBy.length) continue;
      let near = false, hunted = false;
      for (const z of this.zombies) {
        if (!z.alive || z.gone || z.floor !== s.floor || d2(z, s) > SNEAK_NEAR_M * SNEAK_NEAR_M) continue;
        near = true;
        if ((z.state === "chase" || z.state === "attack") && z.target === s.i) { hunted = true; break; }
      }
      if (near && !hunted) gainXp(this, s, "stealth", SKILL_XP.sneak);
    }
  }

  private objectiveWork(): void {
    const o = this.obj;
    if (o.ending) return;
    const crank = this.nav.spots["crank"], radio = this.nav.spots["radio-set"];
    if (!o.sealedAt && crank) {
      const hands = this.survivors.filter((s) => s.alive && s.busyAct === "crank" && s.busyUntil > this.t && Math.hypot(s.x - crank.at[0], s.z - crank.at[2]) < 1.6);
      if (hands.length) {
        // (Mechanics turns it faster, and so does Strength: a heavy wheel — SKILL_FX; both 1 at their bases)
        const crankFx = Math.max(...hands.map((h) => (1 + SKILL_FX.mechanics * skill(h, "mechanics")) * strengthFx(h.st, "strengthCrank")));
        for (const h of hands) gainXp(this, h, "mechanics", SKILL_XP.crank);
        o.crank = Math.min(1, o.crank + crankRate(Math.min(2, hands.length)) * 1000 * crankFx);
        this.noise(crank.at[0], crank.at[2], crank.floor, OBJ.crankNoiseM, hands[0].i, "crank");
        // (the door can't shut on a body: the last turn waits while anything stands in its opening — one of the dead
        // knelt there was sealed inside it)
        const bd = this.nav.doorIdx.get("blast");
        if (o.crank >= 1 && bd !== undefined && this.bodies.some((b) => b.alive && b.cell >= 0 && this.nav.door[b.cell] === bd)) o.crank = 0.98;
        if (o.crank >= 1) {
          const by = hands[0];
          const r = this.fac.seal();
          this.facEv(r, by.id);
          o.sealedAt = this.t; o.sealedBy = by.who;
          this.noise(crank.at[0], crank.at[2], crank.floor, 30, by.i, "seal");
          this.ev("alarm.stop", {});
          for (const s of hands) { s.busyAct = ""; s.busyUntil = 0; s.job = null; }
          for (const s of this.survivors) if (s.alive) { s.morale = Math.min(100, s.morale + 15); note(s.know, this.t, by === s ? "I cranked the blast door shut — it's sealed" : `the blast door is sealed — ${cap(by.who)} got it shut`); }
          this.group.lastProgress = this.t;
          this.say(by.who, "sealed");
        }
      }
    }
    if (!o.fixedAt && radio) {
      const at = this.survivors.filter((s) => s.alive && s.busyAct === "repair" && s.busyUntil > this.t && Math.hypot(s.x - radio.at[0], s.z - radio.at[2]) < 1.6);
      if (at.length && o.partIn) {
        // two can't share one set: the best hands do the work
        const best = at.reduce((a, b) => (repairRate(b) > repairRate(a) ? b : a));
        o.repair += repairRate(best) * 1000;
        gainXp(this, best, "electronics", SKILL_XP.terminal / 30);
        if ((this.t / 1000) % 5 < 1) { this.noise(radio.at[0], radio.at[2], radio.floor, OBJ.staticNoiseM, best.i, "static"); this.ev("radio.static", { by: best.id, at: [radio.at[0], 0, radio.at[2]] }); }
        if (o.repair >= OBJ.repairMs) {
          o.fixedAt = this.t; o.fixedBy = best.who;
          best.busyAct = ""; best.busyUntil = 0; best.job = null;
          this.ev("radio.fixed", { by: best.id });
          witness(this, best.x, best.z, best.floor, 25, (x) => (x === best ? "I got the radio working" : `${cap(best.who)} got the radio working`));
          for (const s of this.survivors) if (s.alive && Math.hypot(s.x - best.x, s.z - best.z) < 25) s.know.records.add("radio:fixed");
          this.group.lastProgress = this.t;
          this.say(best.who, "radioFixed");
        }
      }
    }
    // what's known travels by talking (knowledge.ts share): the radio's needs and state ride on `records`
  }

  /** THE STRANGERS MEET (follow-up 30, fourth round 17): two who come face to face for the first time introduce
   *  themselves — from then on they know each other by name. */
  private introductions(): void {
    for (const a of this.survivors) {
      if (!a.alive || a.mode === "down") continue;
      for (const b of this.survivors) {
        if (b.i <= a.i || !b.alive || b.mode === "down" || a.met.has(b.who)) continue;
        if (d2(a, b) > 5 * 5 || !this.nav.sees(a.floor, a.x, a.z, b.x, b.z, this.doorOpenIdx)) continue;
        a.met.add(b.who); b.met.add(a.who);
        note(a.know, this.t, `met ${cap(b.who)}`); note(b.know, this.t, `met ${cap(a.who)}`);
        this.ev("survivor.meet", { by: a.id, victim: b.id, at: pos(a) });
        // the first to speak is the bolder one
        const first = a.gen.assertiveness + a.gen.sociability >= b.gen.assertiveness + b.gen.sociability ? a : b;
        this.say(first.who, "introduce", { to: (first === a ? b : a).who });
      }
    }
  }

  /** THE DEAD ON THE FLOOR (fifth round 16): a few lie still until somebody comes near, then get up. */
  private risers(): void {
    for (const z of this.zombies) {
      if (!z.alive || !z.lying) continue;
      if (!this.survivors.some((s) => s.alive && s.floor === z.floor && d2(s, z) < RISE_M * RISE_M)) continue;
      z.lying = false; z.pose = "z-idle"; z.stagger = this.t + 3000; z.state = "idle"; z.why = "rose";
      this.ev("zombie.rise", { by: z.id, at: pos(z) });
      this.noise(z.x, z.z, z.floor, 8, -1, "moan");
    }
  }

  /** CORPSE RETIREMENT (the four-week run: ~1,000+ dead otherwise, every one in every late joiner's
   *  snapshot and a mesh on every screen forever). A dead zombie goes once it has lain CORPSE_RETIRE_MS
   *  with no survivor in its room. Nothing needs an old corpse: the cure's sample must be taken within a
   *  minute of the death (cure.ts), and a card it carried is already a drop of its own (killZombie). A
   *  turned friend stays where they fell. */
  private retireCorpses(): void {
    for (const z of this.zombies) {
      if (z.alive || z.gone || z.turnedFrom || this.t - z.diedAt < CORPSE_RETIRE_MS) continue;
      if (this.survivors.some((s) => s.alive && !s.escaped && s.room === z.room)) continue;
      z.gone = true;
      this.stats.corpsesRetired = (this.stats.corpsesRetired ?? 0) + 1;
      this.emitGone(z.id);
    }
  }
  /** NEVER MORE THAN CORPSES_MAX LYING (the re-grade, Nov 14 2026). Bodies stay where they fall (42), and an hour's
   *  show ends with thirty to sixty of them; a test run whose clear and spawn levers are pressed in turn made
   *  4,886, an 800 kB snapshot and a save that held the server for a third of a second. Past the cap the oldest go
   *  first, whoever is in the room: never a turned friend. */
  private capCorpses(): void {
    let lying = 0;
    for (const z of this.zombies) if (!z.alive && !z.gone && !z.turnedFrom) lying++;
    if (lying <= CORPSES_MAX) return;
    const old = this.zombies.filter((z) => !z.alive && !z.gone && !z.turnedFrom).sort((a, b) => a.diedAt - b.diedAt || a.i - b.i);
    for (const z of old.slice(0, lying - CORPSES_MAX)) { z.gone = true; this.stats.corpsesRetired = (this.stats.corpsesRetired ?? 0) + 1; this.emitGone(z.id); }
  }

  /** The room that is OUTSIDE on this map (where the dead walk in from: the bunker's tunnel), -1 when it has none. */
  private outsideRoom(): number {
    return (this.map.arrivals ? this.nav.roomIdx.get(this.map.arrivals.room) : undefined) ?? -1;
  }

  /** One of the dead comes in through the open blast door: out of the dark at the tunnel's far end (40). */
  private arrive(): void {
    const st = this.stats.arrivals;
    this.nextArrivalAt = this.t + this.rng.range(ARRIVAL.gapMin, ARRIVAL.gapMax);
    // (a map with nowhere for them to come from has no trickle)
    const tunnel = this.outsideRoom();
    if (tunnel < 0) return;
    // (a six-hour walk gained 68 an hour with nobody to thin them: no more come while DEAD_MAX are standing)
    if (this.deadUp() >= DEAD_MAX) { st.deferred.full = (st.deferred.full ?? 0) + 1; return; }
    const R = this.nav.rooms[tunnel];
    let cell = -1;
    for (let tries = 0; tries < 12 && cell < 0; tries++) {
      const c = this.nav.cellAt(R.floor, R.rect.x + 1 + this.rng.next() * (R.rect.w - 2), R.rect.y + R.rect.h - ARRIVAL.fromEndM - this.rng.next());
      if (c >= 0 && this.nav.isWalk(c) && this.nav.room[c] === tunnel) cell = c;
    }
    if (cell < 0) { st.deferred.nowhere = (st.deferred.nowhere ?? 0) + 1; return; }
    const z = this.makeZombie("shambler", cell);
    z.arrivedAt = this.t;
    // drawn up the tunnel toward the bunker (the noise inside, the open door)
    const vest = this.nav.roomIdx.get(this.map.arrivals!.toward);
    const tc = vest !== undefined ? roomAt(this, vest, this.rng.next(), this.rng.next()) : -1;
    if (tc >= 0) { const [tx, , tz] = this.nav.centre(tc); z.state = "investigate"; z.lx = tx; z.lz = tz; z.lf = this.nav.floorOfCell(tc); z.searchUntil = 0; z.why = "came in"; }
    st.groups++; st.dead++;
    const [ax, ay, az] = this.nav.centre(cell);
    const heard: string[] = [];
    for (const s of this.survivors) {
      if (!s.alive || s.mode === "down" || Math.hypot(s.x - ax, s.z - az) > ARRIVAL.hearM) continue;
      heard.push(s.id);
      s.alertUntil = Math.max(s.alertUntil, this.t + 30_000);
    }
    st.heard += heard.length;
    this.ev("zombie.arrived", { at: [r2(ax), r2(ay), r2(az)], room: R.id, zone: R.zone, n: 1, kinds: ["shambler"], heard });
    this.emit({ type: "spawn", body: this.bodyState(z) });
  }

  private dirWake(s: Survivor): void {
    let best: Zombie | null = null, bd = Infinity;
    for (const z of this.zombies) {
      if (!z.alive || z.state !== "idle" || z.floor !== s.floor) continue;
      const d = Math.sqrt(d2(z, s));
      if (d < 15 || d > 40) continue;
      const score = Math.abs(d - 25);
      if (score < bd) { bd = score; best = z; }
    }
    if (!best) return;
    // toward their room, never onto them
    best.state = "investigate";
    const c = this.nav.cellInRoom(s.room, s.floor, this.rng.next(), this.rng.next());
    const [x, , zz] = this.nav.centre(c);
    best.lx = x; best.lz = zz; best.lf = s.floor;
    best.searchUntil = 0; best.path = null;
    best.why = "drifting";
  }
  private dirNoise(s: Survivor, event: string): void {
    // a spot 10–25 m from them, on their floor, walkable
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rng.next() * Math.PI * 2, r = this.rng.range(10, 25);
      const c = this.nav.cellAt(s.floor, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r);
      if (c < 0 || !this.nav.isWalk(c) || this.nav.room[c] < 0) continue;
      const [x, y, z] = this.nav.centre(c);
      this.ev(event, { at: [r2(x), r2(y), r2(z)], room: this.nav.rooms[this.nav.room[c]].id });
      this.noise(x, z, s.floor, 30, -1, event);
      return;
    }
  }

  // ---- shared helpers for the brains ----------------------------------------------------------------
  noise(x: number, z: number, floor: number, r: number, by: number, kind: string): void {
    if (r <= 0) return;
    this.noises.push({ id: ++this.noiseId, x, z, floor, r, t: this.t, by, kind });
  }
  get lastNoiseId(): number { return this.noiseId; }

  /** Is this survivor somewhere unpowered (or in a dip)? */
  isDark(b: Body): boolean {
    // the bunker is lit throughout (10); a map's scenario may say otherwise (Glenridge Hall: the night outside, the blackout)
    return this.#scn ? this.#scn.dark(this, b.room) : false;
  }
  doorOpenIdx = (d: number): boolean => {
    const D = this.nav.doors[d], s = this.fac.doors.get(D.id)!;
    // the vault's state is its one window (doors.ts vaultUntil), not the door record
    if (D.kind === "vault") return this.fac.vaultOpen();
    return s.open || s.broken || D.kind === "doorway";
  };

  /** Move a body onto a cell (teleport — placement, levers). */
  place(b: Body, cell: number): void {
    const [x, , z] = this.nav.centre(cell);
    b.x = x; b.y = this.nav.yAt(cell); b.z = z; b.floor = this.nav.floorOfCell(cell); b.cell = cell; b.room = this.nav.room[cell];
    b.path = null; b.link = null; b.onBed = false;
  }

  /** Is this cell inside a safe room or in a safe room's doorway? */
  inSafeRoom(k: number): boolean {
    if (k < 0) return false;
    const r = this.nav.room[k], d = this.nav.door[k];
    return (r >= 0 && this.nav.rooms[r].kind === "safe") || (d >= 0 && this.nav.doors[d].kind === "safe");
  }
  /** A living zombie standing inside this safe room (a survivor turned in there), or null. */
  zombieInRoom(room: number): Zombie | null {
    if (room < 0 || this.nav.rooms[room].kind !== "safe") return null;
    for (const z of this.zombies) if (z.alive && this.nav.room[z.cell] === room) return z;
    return null;
  }

  /** May this body stand on this cell right now? */
  canStand(b: Body, k: number): boolean {
    if (k < 0 || !this.nav.walk[k]) return false;
    const r = this.nav.room[k];
    // the dead never set foot in a safe room, its opening included — unless one is already INSIDE (a
    // survivor who turned in there): that one may move about the room and walk out through its door
    const inside = b.kind === "zombie" && this.inSafeRoom(b.cell);
    if (b.kind === "zombie" && r >= 0 && this.nav.rooms[r].kind === "safe" && !(inside && this.nav.room[b.cell] === r)) return false;
    const d = this.nav.door[k];
    if (d >= 0 && !this.doorOpenIdx(d)) return false;
    if (b.kind === "zombie" && d >= 0 && this.nav.doors[d].kind === "safe" && !inside) return false;
    return true;
  }

  /**
   * Plan a route for a body to a cell. The dead plan with the truth. A SURVIVOR PLANS ONLY WITH WHAT
   * THEY KNOW (knowledge.ts): rooms they can picture, doors they've seen and believe will let them
   * through — so a route never goes through, or to, a room they haven't seen. A survivor's walk
   * (`lanes`, the default) also takes a line of its own: the A* noise variant and the lane offset
   * are held per goal (nav.ts lanes; the casino walk map's idea), so a re-plan to the same place keeps
   * its line and two people going the same way don't walk nose to tail. A fight's close-in plan
   * passes lanes = false.
   */
  plan(b: Body, goal: number, breakCost?: number, lanes = true): Path | null {
    // (on a stair the body's cell is still the one it left: a route planned there began at the wrong end, and they
    // arrived upstairs holding a way that started at the foot — the review's A-5)
    const from = b.link ? this.nav.nearestWalk(this.nav.cellAt(b.link.f1, b.link.x1, b.link.z1)) : b.cell;
    if (from < 0 || goal < 0) return null;
    // (the dead too — Josh, Nov 8: "smoother". Their step back each re-plan also cost them ground, so trimming it
    // takes mean deaths at 15 min from about 2.2 to 3.4 over 200 seeds; he chose the smoother, harder show)
    // (the dead's routes are trimmed by the same test as the living's now: without it one stood against a jamb a
    // hand's breadth off its line, in plain sight of whoever it was after, for up to a minute)
    if (b.kind === "zombie") return trimBehind(b, this.nav.route(from, goal, this.zombieGate(b as Zombie), { breakCost }), (x, z) => this.clearLine(b, x, z, 0));
    const s = b as Survivor;
    const k = s.know;
    const goalRoom = this.nav.room[goal];
    if (goal !== s.laneGoal) { s.laneGoal = goal; s.laneSeed = this.rng.u32() || 1; }
    const p = this.nav.route(from, goal, this.survivorGate(s), {
      // …and never THROUGH a wing deeper than the group has dared (a vent and a propped door can make a
      // short cut through the labs; they'd go round) — only to it, when that's where they mean to go
      // THE TUNNEL is outside (night, the dark, where the dead come from): nobody goes out there on purpose — only
      // somebody already out there plans through it, to get back in
      nimbleVents: (s.st.agility ?? 5) >= 7, roomOk: (r) => knowsRoom(k, r) && (this.nav.rooms[r].kind !== "exit" || r === s.room) && ((this.local.stageOf[this.nav.rooms[r].zone] ?? 1) <= k.stage || r === goalRoom || r === s.room), variant: lanes ? 1 + (s.laneSeed % 3) : 0,
    });
    if (!p) return null;
    if (lanes && p.pts.length > 4) {
      let x = s.laneSeed;
      const roll = () => { x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      p.pts = this.nav.lanes(p.pts, roll);
    }
    // the knowledge law, audited: every waypoint stands in a room they can picture
    for (let i = 0; i < p.pts.length; i += 4) {
      const c = this.nav.cellAt(p.pts[i + 2], p.pts[i], p.pts[i + 1]);
      const r = c >= 0 ? this.nav.room[c] : -1;
      if (r >= 0 && !knowsRoom(k, r)) { this.stats.knowLeaks++; break; }
    }
    return trimBehind(s, p, (x, z) => this.clearLine(s, x, z, 0));
  }
  /** CAN THEY GET THERE, AS FAR AS THEY KNOW? (Nov 12 2026) The same question plan() asks — the doors they believe
   *  they can pass, the rooms they can picture — without choosing a lane or touching the route they're on. The
   *  menu asks it before offering a job somewhere they'd only fail to walk to (a room they know is locked). */
  canReach(s: Survivor, goal: number): boolean {
    if (s.cell < 0 || goal < 0) return false;
    const k = s.know, goalRoom = this.nav.room[goal];
    const p = this.nav.route(s.cell, goal, this.survivorGate(s), {
      nimbleVents: (s.st.agility ?? 5) >= 7, variant: 0,
      roomOk: (r) => knowsRoom(k, r) && (this.nav.rooms[r].kind !== "exit" || r === s.room) && ((this.local.stageOf[this.nav.rooms[r].zone] ?? 1) <= k.stage || r === goalRoom || r === s.room),
    });
    return !!p && p.reached;
  }
  /** The card a survivor can get through a reader with: their own, or a friend's beside them (the
   *  holder swipes them through). */
  cardFor(s: Survivor): number {
    let c = s.card;
    for (const o of this.survivors) if (o !== s && o.alive && o.card > c && o.mode !== "down" && o.floor === s.floor && d2(o, s) < 6 * 6) c = o.card;
    return c;
  }
  survivorGate(s: Survivor) {
    const card = this.cardFor(s);
    s.actor.keycard = card;
    s.actor.crowbar = s.melee === "crowbar" || s.pack.spare.includes("crowbar");
    return (d: number): 0 | 1 | 2 => believePass(this, s, d, card);
  }
  /** What one survivor knows and feels right now, for the talk layer (knowledge.ts SurvivorFacts). */
  facts(who: SurvivorId): SurvivorFacts | null { return factsFor(this, who); }
  zombieGate(z: Zombie) {
    return (d: number): 0 | 1 | 2 => {
      const D = this.nav.doors[d];
      if (this.fac.canPass(z.actor, D.id).ok) return 1;
      const st = this.fac.doors.get(D.id)!;
      // A DOOR THE DEAD CAN'T PASS IS A WALL TO THEM. (This used to answer "breakable" for a locked or bolted
      // door, but nothing in doors.ts ever breaks one: the dead routed to Glenridge's locked garden doors and beat
      // on them for the rest of the show, and five shows in forty stalled round them. The review, Nov 13 2026.
      // The bunker has no locked plain door, so nothing changes there.)
      void st;
      return 0;
    };
  }
  /** the room on this body's side of a door (for doors.ts `at`) */
  sideRoom(b: Body, d: number): string {
    const D = this.nav.doors[d];
    const ra = this.nav.roomIdx.get(D.a)!, rb = this.nav.roomIdx.get(D.b)!;
    if (b.room === ra) return D.a;
    if (b.room === rb) return D.b;
    const c = this.nav.doorCentre[d];
    const A = this.nav.rooms[ra].rect;
    const ax = A.x + A.w / 2, az = A.y + A.h / 2;
    return (b.x - c[0]) * (ax - c[0]) + (b.z - c[2]) * (az - c[2]) > 0 ? D.a : D.b;
  }

  /**
   * Walk the body's route this step. Returns "moving", "arrived", "door" (a shut door it can't open is
   * next — `b.path` keeps the door as its next waypoint) or "stuck".
   * The caller sets b.path/b.pi and passes the speed; door opening for survivors and zombies' banging
   * is the caller's business when this returns "door".
   */
  walk(b: Body, speed: number, dt: number): "moving" | "arrived" | "door" | "stuck" {
    if (b.link) return this.walkLink(b);
    const P = b.path;
    // THE HAND HAS THE DOOR (the review's A-3): stopped at a shut door by a refused step (a plain waypoint inside the
    // door's cells), the walk went at the door again every step while the hand stepped back to where it opens it
    // from: on the spot, for up to six minutes, with the crank job in their name. While the door that stopped the
    // last step is still shut, the walk waits for the hand.
    // (not a body driven by hand: its push IS the walk up to the door, and the hand goes on from there)
    if (P && b.kind === "survivor" && !(b as Survivor).player && b.doorAhead >= 0 && b.doorAt === this.t - dt && !this.doorOpenIdx(b.doorAhead)) { b.doorAt = this.t; b.walkEnd = this.t; return "door"; }
    b.doorAhead = -1;
    if (!P) { b.v = 0; return "arrived"; }
    // THE PACE (REALISM.md → Movement — "stopping and starting with no ease", "sharp, sudden turns"): the body
    // speeds up to the gait and slows for corners, a sharp turn from where it faces and the end of its route,
    // instead of going from standing to full speed in one tick and halting on the exact point
    const sec = dt / 1000;
    let v = Number.isFinite(b.v) && this.t - (b.walkT ?? -Infinity) <= dt * 2 ? (b.v as number) : 0;
    // (a survivor who was NOT walking the step before — it stood, or was on footwork — sets off from the speed the
    // body has, not the pace the route remembers. One who was walking keeps its pace: bumped by one of the dead, it
    // pushes on at the pace it had — taking the body's speed there slowed everyone through a crowd, and cost lives)
    // (measured over 600 simulated shows each way: wiped 53% keeping the pace, 59% not; the last commit's was 51%)
    if (b.kind === "survivor" && (this.t - (b.walkT ?? -Infinity) > dt || b.walkEnd === this.t - dt)) v = Math.hypot(b.gvx ?? 0, b.gvz ?? 0);
    b.walkT = this.t;
    const want = Math.min(speed, this.paceCap(b, P, speed));
    // (within what a body can do: WEIGHT — a sprint used to be reached in 0.6 s and shed at 10 m/s²)
    const acc = Math.min(WEIGHT.ACC, Math.max(2.2, speed * 1.6)), dec = Math.min(WEIGHT.DEC, Math.max(3, speed * 2.2));
    // TURNING BACK ON ITSELF (realism round 11): a route that doubles back from where the body faces does not
    // carry the speed it had going the other way — a runner reversed at a run for a third of a second, and the
    // show played a back-step and then whipped the legs round. It almost stops and turns round (paceCap) first.
    if (b.pi * 4 < P.length) {
      const ex = P[b.pi * 4] - b.x, ez = P[b.pi * 4 + 1] - b.z;
      if (ex * ex + ez * ez > 0.0025 && Math.abs(Math.atan2(Math.sin(Math.atan2(ex, ez) - b.h), Math.cos(Math.atan2(ex, ez) - b.h))) > TURN_BACK_RAD) v = Math.min(v, want);
    }
    v = want > v ? Math.min(want, v + acc * sec) : Math.max(want, v - dec * sec);
    v = Math.max(v, Math.min(want, 0.25));
    b.v = v;
    const h0 = b.h, x0 = b.x, z0 = b.z;
    // a corner is cut this close to its waypoint, when the line past it is clear (a sprint cuts wider)
    const cut = speed > 2.5 ? 0.9 : 0.55;
    let budget = v * sec;
    while (budget > 1e-6) {
      // (a route that has ended remembers no pace: the next one sets off from the speed the body has)
      if (b.pi * 4 >= P.length) { b.path = null; b.walkEnd = this.t; this.turnTo(b, h0, x0, z0, speed, sec); return "arrived"; }
      const wx = P[b.pi * 4], wz = P[b.pi * 4 + 1], wf = P[b.pi * 4 + 2], tag = P[b.pi * 4 + 3];
      const door = Nav.tagDoor(tag), portal = Nav.tagPortal(tag);
      // a door ahead: is it open for us?
      if (door >= 0 && !this.doorOpenIdx(door)) {
        const dd = Math.hypot(wx - b.x, wz - b.z);
        if (dd < 0.85) { b.doorAhead = door; b.walkEnd = this.t; this.turnTo(b, h0, x0, z0, speed, sec); return "door"; }
      }
      if (wf !== b.floor && !portal) { b.path = null; return "stuck"; }
      const dx = wx - b.x, dz = wz - b.z, dist = Math.hypot(dx, dz);
      // A CORNER, ROUNDED ("walking in straight lines to exact points"): near a plain waypoint, with the next
      // one on this floor and a clear line to it (with the body's width either side), head on to the next —
      // never past a door or a ladder/vent waypoint, which have to be reached
      if (dist < cut && door < 0 && portal < 0 && (b.pi + 1) * 4 < P.length) {
        const nx = P[(b.pi + 1) * 4], nz = P[(b.pi + 1) * 4 + 1], nf = P[(b.pi + 1) * 4 + 2], ntag = P[(b.pi + 1) * 4 + 3];
        if (nf === b.floor && Nav.tagPortal(ntag) < 0 && this.clearLine(b, nx, nz)) { b.pi++; continue; }
      }
      if (dist <= budget + 1e-6) {
        if (!this.stepTo(b, wx, wz)) return this.blocked(b);
        budget -= dist;
        b.pi++;
        if (portal >= 0) {
          // the near end of a shaft / ladder / vent: the next waypoint is the far end
          const p = this.nav.portals[portal];
          if (p.door >= 0 && !this.doorOpenIdx(p.door) && this.nav.doors[p.door].kind === "grate") return "door";
          if (b.pi * 4 >= P.length) { b.path = null; return "arrived"; }
          const fx = P[b.pi * 4], fz = P[b.pi * 4 + 1], ff = P[b.pi * 4 + 2];
          // (one on a chain takes no stair: the foot of the service stair is inside the cell's ring, and the stair
          // set it down a floor up, off its chain, where no straight pull could bring it back)
          if ((b as Zombie).leash) { b.pi--; b.path = null; return "stuck"; }
          // SINGLE FILE (the code review, Nov 14 2026): two who set off up a stair in the same step came off it
          // on one cell and stood one inside the other for two seconds. The second waits a moment at the foot
          // (not somebody running for their life, and not the dead, who crowd).
          if (b.kind === "survivor" && p.ms > STAIR_GAP_MS * 2) {
            const m = (b as Survivor).mode;
            if (m !== "flee" && m !== "panic" && m !== "backoff" && this.survivors.some((o) => o !== b && o.alive && o.link && o.link.portal === portal && o.link.f1 === ff && this.t - o.link.t0 < STAIR_GAP_MS)) { b.pi--; b.walkEnd = this.t; return "moving"; }
          }
          b.link = { portal, t0: this.t, ms: p.ms, x0: b.x, z0: b.z, y0: b.y, x1: fx, z1: fz, y1: this.nav.yAt(this.nav.cellAt(ff, fx, fz)), f1: ff };
          b.pi++;
          return "moving";
        }
        continue;
      }
      const nx = b.x + dx / dist * budget, nz = b.z + dz / dist * budget;
      if (!this.stepTo(b, nx, nz)) return this.blocked(b);
      budget = 0;
    }
    this.turnTo(b, h0, x0, z0, speed, sec);
    return "moving";
  }

  /** scratch for the step: each survivor's x, z, h, cell, room, floor and on-its-feet before it, and where its
   *  own step left it (rebuilt every step) */
  private was: number[] = [];
  /** on its feet and its own to move: not lying, held, kneeling over a friend, asleep, sitting or on a ladder */
  private onFeet(s: Survivor): boolean {
    return s.alive && !s.link && !s.onBed && s.mode !== "down" && !PLACED.has(s.pose) && s.grabbedBy.length === 0;
  }

  /** A BODY HAS WEIGHT (WEIGHT, above): after a survivor's step, what it did is held to what a body can do.
   *  (x0, z0, h0, c0, r0): where it stood and faced before the step; `up`: on its feet before and after;
   *  `pushed`: something moved it after its own step (out of somebody's space). */
  private weigh(s: Survivor, x0: number, z0: number, h0: number, c0: number, r0: number, up: boolean, pushed: boolean, dt: number): void {
    const sec = dt / 1000;
    if (!up) { s.gvx = 0; s.gvz = 0; s.hGoal = undefined; return; }
    // ---- the speed ----
    const ax = s.x - x0, az = s.z - z0, asked = Math.hypot(ax, az) / sec;
    const px = s.gvx ?? 0, pz = s.gvz ?? 0, had = Math.hypot(px, pz);
    let vx = ax / sec, vz = az / sec;
    if (asked > 12) { vx = 0; vz = 0; }             // (placed somewhere: not a speed)
    else {
      let go = asked, ux = asked > 1e-6 ? ax / (asked * sec) : 0, uz = asked > 1e-6 ? az / (asked * sec) : 0;
      const back = had > 0.6 && asked > 0.05 && ax * px + az * pz < 0;
      let carried = false;
      if (asked < 0.05 || back) {
        // told to stand, or to go back the way it came: it carries on while it slows (then turns round)
        go = had - WEIGHT.DEC * sec;
        // (slow enough to turn round: off the new way from near rest, never from the pace it had)
        if (go <= (back ? 0.25 : 0)) go = back ? Math.min(asked, WEIGHT.ACC * sec) : 0;
        else { ux = px / had; uz = pz / had; carried = true; }
      }
      // ON A ROUTE the walk keeps its own pace inside the same limits, and where it put the body is where the route
      // has it: moved along the chord of a corner instead, a body was left where the next leg crossed a wall, and
      // the job failed "stuck" (rest ×3, repair ×5 in a hundred shows)
      // (and a SHOVE from one of the dead is a blow, not a pace: it lands as it always did. The nudge two of the
      // living give each other out of their space is eased like any step)
      else if ((s.walkT === this.t && !pushed) || s.shovedAt === this.t) go = asked;
      // SHOULDERED APART (Nov 12 2026, the review's C6): two of the living who end up INSIDE each other — the same
      // place to go, a doorway — are not eased out of it at a body's gentlest start. Eased, they stood one in the
      // other for a second or two (5 cm apart, twice a show). A firm step aside, as people do: up to NUDGE m/s at once.
      else if (s.nudgedAt === this.t) go = Math.min(asked, Math.max(had + WEIGHT.ACC * sec, NUDGE));
      else go = Math.max(had - WEIGHT.DEC * sec, Math.min(had + WEIGHT.ACC * sec, asked));
      if (Math.abs(go - asked) > 0.02 || (asked < 0.05 && go > 0)) {
        const kx = s.x, kz = s.z, kc = s.cell, kr = s.room;
        s.x = x0; s.z = z0; s.cell = c0; s.room = r0;
        // (never carried through a wall, a shut door, or into anybody: then it is where the job put it)
        const tx = go > 0 ? x0 + ux * go * sec : x0, tz = go > 0 ? z0 + uz * go * sec : z0;
        // (a carry — further than the job asked — never ends in somebody; a shorter step than asked crowds nobody)
        // …and the push out of somebody’s space is never slowed: pushed, it is no nearer anybody than the push left it
        // (a carry — told to stand, turning back — never ends within anybody's space at all: it stops where the job did)
        if ((go > asked && !carried && this.crowds(s, tx, tz, kx, kz, x0, z0)) || ((carried || pushed) && this.crowds(s, tx, tz, kx, kz, Infinity, Infinity))) { s.x = kx; s.z = kz; s.cell = kc; s.room = kr; }
        // (a wall in the way: a carry stops against it, as far as it got; a shorter step than asked is the job’s own)
        else if (go > 0 && !this.stepTo(s, tx, tz) && go <= asked) { s.x = kx; s.z = kz; s.cell = kc; s.room = kr; }
        // (nor left in a doorway that was shut during the step — they shut it behind them from the far side)
        const dk = this.nav.door[s.cell];
        if (dk >= 0 && !this.doorOpenIdx(dk)) { s.x = kx; s.z = kz; s.cell = kc; s.room = kr; }
      }
      vx = (s.x - x0) / sec; vz = (s.z - z0) / sec;
    }
    s.gvx = vx; s.gvz = vz;
    // ---- the heading ----
    if (s.h !== h0) s.hGoal = s.h;
    if (s.hGoal === undefined) return;
    const max = (Math.hypot(vx, vz) > 0.25 ? WEIGHT.TURN_MOVE : WEIGHT.TURN_STAND) * sec;
    const dh = Math.atan2(Math.sin(s.hGoal - h0), Math.cos(s.hGoal - h0));
    if (Math.abs(dh) <= max) { s.h = s.hGoal; s.hGoal = undefined; }
    else s.h = h0 + Math.sign(dh) * max;
  }

  /** would standing at (tx, tz) leave this survivor in somebody's space: inside 0.8 m of them, nearer than the
   *  step itself left it (kx, kz) — and, for (x0, z0) given, nearer than it stood? */
  private crowds(s: Survivor, tx: number, tz: number, kx: number, kz: number, x0: number, z0: number): boolean {
    for (const o of this.survivors) {
      if (o === s || !o.alive || o.floor !== s.floor || o.link || o.onBed) continue;
      const d = Math.hypot(o.x - tx, o.z - tz);
      if (d < 0.8 && d < Math.hypot(o.x - kx, o.z - kz) - 1e-4 && d < Math.hypot(o.x - x0, o.z - z0) - 1e-4) return true;
    }
    return false;
  }

  /** The heading after a step: turned toward the way it moved, at most so far a tick — a turn takes a moment */
  private turnTo(b: Body, h0: number, x0: number, z0: number, speed: number, sec: number): void {
    const mx = b.x - x0, mz = b.z - z0;
    if (mx * mx + mz * mz < 1e-8) return;
    const want = Math.atan2(mx, mz);
    const dh = Math.atan2(Math.sin(want - h0), Math.cos(want - h0));
    const max = (b.kind === "survivor" ? WEIGHT.TURN_MOVE : speed > 2.5 ? 4.5 : 7) * sec;
    b.h = h0 + Math.max(-max, Math.min(max, dh));
  }

  /** How fast the route lets a body go now (m/s): slower into a sharp turn from where it faces, into a corner
   *  ahead (harder the sharper), and easing to a stop at the route's end — except a body chasing a moving
   *  point (goal -2: a follow slot, a lunge), which keeps its pace and stops on its own. */
  private paceCap(b: Body, P: number[], speed: number): number {
    let cap = speed;
    const i = b.pi;
    if (i * 4 >= P.length) return cap;
    const wx = P[i * 4], wz = P[i * 4 + 1], wf = P[i * 4 + 2];
    const dx = wx - b.x, dz = wz - b.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const e = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - b.h), Math.cos(Math.atan2(dx, dz) - b.h)));
      if (e > 0.8) cap = Math.min(cap, speed * Math.max(e > TURN_BACK_RAD ? 0.05 : 0.3, Math.cos(e - 0.8) * 0.85));
    }
    // A SHUT DOOR AHEAD is walked up to, not run into (the walk stops 0.85 m short of it to open it)
    {
      let rem = d - 0.85, px = wx, pz = wz;
      for (let j = i; j * 4 < P.length && rem < 6; j++) {
        if (j > i) { rem += Math.hypot(P[j * 4] - px, P[j * 4 + 1] - pz); px = P[j * 4]; pz = P[j * 4 + 1]; }
        const dr = Nav.tagDoor(P[j * 4 + 3]);
        if (dr >= 0 && !this.doorOpenIdx(dr)) { cap = Math.min(cap, Math.sqrt(2 * 2.2 * Math.max(0, rem)) + 0.4); break; }
      }
    }
    if (b.goal !== -2) {
      let rem = d, px = wx, pz = wz;
      for (let j = i + 1; j * 4 < P.length && rem < 8; j++) {
        if (P[j * 4 + 2] !== wf) { rem = Infinity; break; }
        rem += Math.hypot(P[j * 4] - px, P[j * 4 + 1] - pz); px = P[j * 4]; pz = P[j * 4 + 1];
      }
      cap = Math.min(cap, Math.sqrt(2 * 1.8 * rem) + 0.25);
    }
    if ((i + 1) * 4 < P.length && d < 1.6 && d > 0.05 && P[(i + 1) * 4 + 2] === wf) {
      const ox = P[(i + 1) * 4] - wx, oz = P[(i + 1) * 4 + 1] - wz, ol = Math.hypot(ox, oz);
      if (ol > 0.05) {
        const th = Math.acos(Math.max(-1, Math.min(1, (dx * ox + dz * oz) / (d * ol))));
        cap = Math.min(cap, speed * (1 - 0.45 * th / Math.PI), 1.8 + 3.2 * (1 - th / Math.PI));
      }
    }
    return cap;
  }

  /** A straight line from the body to (x, z) it could walk, with its width either side (no cell refused on
   *  the line or on two lines 0.22 m to each side of it) */
  private clearLine(b: Body, x: number, z: number, half = 0.22): boolean {
    const dx = x - b.x, dz = z - b.z, dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return true;
    const px = -dz / dist * half, pz = dx / dist * half;
    // (half 0: the body's own line only, sampled finely — what a step along it needs)
    const n = Math.max(1, Math.ceil(dist / (half ? 0.2 : 0.06)));
    for (const o of half ? [0, 1, -1] : [0]) {
      let cell = b.cell;
      for (let i = 0; i <= n; i++) {
        const k = this.nav.cellAt(b.floor, b.x + o * px + dx * i / n, b.z + o * pz + dz * i / n);
        if (k !== cell && !this.canStand(b, k)) return false;
        cell = k;
      }
    }
    return true;
  }

  /** a step refused: by a shut door ("door", doorAhead set) or by anything else ("stuck") */
  private blocked(b: Body): "door" | "stuck" {
    // (stopped by something: it sets off again from the speed the body has, not at a pace that kept counting up
    // while it stood against a wall — those were leaps from standing)
    b.walkEnd = this.t;
    if (this.lastBlock >= 0 && this.nav.door[this.lastBlock] >= 0 && !this.doorOpenIdx(this.nav.door[this.lastBlock])) { b.doorAhead = this.nav.door[this.lastBlock]; b.doorAt = this.t; return "door"; }
    return "stuck";
  }
  private lastBlock = -1;

  private walkLink(b: Body): "moving" | "arrived" {
    const L = b.link!;
    const u = Math.min(1, (this.t - L.t0) / L.ms);
    const line = this.nav.portals[L.portal]?.line;
    if (line) {
      // A STAIR WITH A SHAPE (Glenridge Hall): up the flight, round the landing, up the next
      const [x, y, z, h] = alongStair(line, [L.x0, L.y0, L.z0], [L.x1, L.y1, L.z1], u);
      b.x = x; b.y = y; b.z = z; if (h === h) b.h = h;
    } else {
      b.x = L.x0 + (L.x1 - L.x0) * u; b.z = L.z0 + (L.z1 - L.z0) * u; b.y = L.y0 + (L.y1 - L.y0) * u;
      if (Math.abs(L.x1 - L.x0) + Math.abs(L.z1 - L.z0) > 0.05) b.h = Math.atan2(L.x1 - L.x0, L.z1 - L.z0);
    }
    if (u >= 1) {
      b.link = null;
      b.floor = L.f1;
      const c = this.nav.cellAt(L.f1, b.x, b.z);
      b.cell = c; b.room = this.nav.room[c];
      b.y = L.y1;
      return b.path && b.pi * 4 < b.path.length ? "moving" : "arrived";
    }
    return "moving";
  }

  /** Move a body to (x, z) on its floor if every cell on the way allows it (sub-stepped). */
  stepTo(b: Body, x: number, z: number): boolean {
    // ON A CHAIN (the one in Glenridge's cell): no step takes it further from the ring than the chain is long,
    // whatever is doing the stepping. A lunge at somebody out of reach and a shove from somebody inside its reach
    // both put it out past the cell door, where the pull back to the ring was a straight line through the wall
    // and did nothing: it stood out there for the length of a stagger.
    const L = (b as Zombie).leash;
    if (L) {
      const d0 = Math.hypot(b.x - L[0], b.z - L[1]), d1 = Math.hypot(x - L[0], z - L[1]);
      if (d1 > L[2] && d1 > d0) {
        if (d0 >= L[2]) return false;
        // (as far along the step as the chain reaches)
        let lo = 0, hi = 1;
        for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (Math.hypot(b.x + (x - b.x) * m - L[0], b.z + (z - b.z) * m - L[1]) <= L[2]) lo = m; else hi = m; }
        x = b.x + (x - b.x) * lo; z = b.z + (z - b.z) * lo;
      }
    }
    const dx = x - b.x, dz = z - b.z, dist = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(dist / 0.2));
    let px = b.x, pz = b.z, cell = b.cell;
    for (let i = 1; i <= n; i++) {
      const qx = b.x + dx * i / n, qz = b.z + dz * i / n;
      const k = this.nav.cellAt(b.floor, qx, qz);
      if (k !== cell && !this.canStand(b, k)) { this.lastBlock = k; b.x = px; b.z = pz; this.setCell(b, cell); return false; }
      px = qx; pz = qz; cell = k;
    }
    b.x = px; b.z = pz;
    this.setCell(b, cell);
    return true;
  }
  private setCell(b: Body, k: number) {
    b.cell = k;
    const r = this.nav.room[k];
    if (r >= 0) b.room = r;
    // (a room with a floor height of its own: walking into it is stepping onto it)
    if (r >= 0 && this.nav.rooms[r].y !== undefined && !b.link && !b.onBed) b.y = this.nav.rooms[r].y!;
  }

  /** Who has stalled on a route: stuck 2.5 s with somewhere to go → squeeze past for 2 s. */
  private progress(): void {
    for (const b of this.bodies) {
      if (!b.alive) continue;
      // (NO ROUTE THIS STEP IS NOT "NOWHERE TO GO" for somebody whose walk was just refused: a refused walk drops its
      // route and plans again, so the clock here started again every second and the squeeze below never came. In
      // the west upper corridor, a metre wide, a leader stood behind her own escort until the errand was given up.)
      const wanted = (b as Survivor).want;
      const refusedNow = b.kind === "survivor" && !!wanted && this.t - wanted[2] < 800;
      if ((!b.path && !refusedNow) || b.link || b.busyUntil > this.t) { b.progAt = this.t; b.progX = b.x; b.progZ = b.z; continue; }
      if (Math.abs(b.x - b.progX) + Math.abs(b.z - b.progZ) > 0.35) { b.progAt = this.t; b.progX = b.x; b.progZ = b.z; continue; }
      // SQUEEZING PAST IS SIDEWAYS, NOT THROUGH (Nov 12 2026, the review's C6): the two seconds used to switch a
      // body's space off altogether, and it walked through whoever was in the way — two of the living 4 cm apart
      // for two seconds. The first squeeze now only narrows the space two of the living keep (shoulders turned:
      // SQUEEZE_M); only one who stalls again straight after goes through, as before. The dead as before.
      if (this.t - b.progAt > 2500 && this.t >= b.squeezeUntil) { b.squeezeHard = b.kind !== "survivor" || this.t - b.squeezeUntil < 4000; b.squeezeUntil = this.t + 2000; b.progAt = this.t; }
    }
  }

  /** Push overlapping bodies apart (the steer step: nobody stands inside anybody). The gap is per pair
   *  (SURVIVORZ.md §10, THE ANIMATION LAWS — no limb clips into any body): two survivors walking side by
   *  side swing their arms well past their 0.3 m body radius, and at 0.55 m apart they visibly brushed
   *  (measured on the draft's escort, Oct 27 2026), so the living keep 0.8 m — personal space — while the
   *  dead crowd at 0.55 and a zombie closes to 0.6 on the living (a grab is let closer, below). */
  private separate(): void {
    const B = this.bodies, R_MAX = 0.8;
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      const aSq = a.squeezeUntil > this.t;
      if (!a.alive || a.link || a.onBed || (aSq && a.squeezeHard)) continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j];
        const bSq = b.squeezeUntil > this.t;
        if (!b.alive || b.link || b.onBed || b.floor !== a.floor || (bSq && b.squeezeHard)) continue;
        // (a squeeze is between two of the living: past one of the dead it goes through, as it did)
        if ((aSq || bSq) && (a.kind !== "survivor" || b.kind !== "survivor")) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        if (dx > R_MAX || dx < -R_MAX || dz > R_MAX || dz < -R_MAX) continue;
        const R = aSq || bSq ? SQUEEZE_M : a.kind === "survivor" && b.kind === "survivor" ? 0.8 : a.kind !== b.kind ? 0.6 : 0.55;
        const d = Math.hypot(dx, dz);
        if (d >= R) continue;
        // a grabber and its victim are meant to be close; so is somebody kneeling over a friend
        if (a.kind !== b.kind && ((a as Zombie).grabbing === b.i || (b as Zombie).grabbing === a.i)) continue;
        if (a.kind === "survivor" && b.kind === "survivor" && ((a as Survivor).reviving === b.i || (b as Survivor).reviving === a.i)) continue;
        // (nor somebody on their way to kneel beside a friend: the place at the chest is 0.6 m from the root)
        if (a.kind === "survivor" && b.kind === "survivor" && (((a as Survivor).job?.kind === "revive" && (a as Survivor).job!.ally === b.i) || ((b as Survivor).job?.kind === "revive" && (b as Survivor).job!.ally === a.i))) continue;
        const push = (R - d) / 2 + 0.001;
        const ux = d > 1e-4 ? dx / d : (this.rng.next() - 0.5), uz = d > 1e-4 ? dz / d : (this.rng.next() - 0.5);
        // somebody at work on a thing (a container, a terminal, a door, a friend on the floor) isn't shoved
        // off it: the other one steps round them (PROXIMITY, Oct 28 2026)
        // (nor is a body on the floor: a downed survivor was shoved about by everyone crowding them, into walls)
        const at = (x: Body) => (x.kind === "survivor" && (x as Survivor).mode === "down") ? 0 : x.busyUntil > this.t ? (x.kind === "survivor" && (x as Survivor).touchAt ? 0 : 0.3) : 1;
        let pa = at(a), pb = at(b);
        if (!pa && !pb) { pa = 0.5; pb = 0.5; }
        else if (!pa) pb = 2; else if (!pb) pa = 2;
        this.stepTo(a, a.x - ux * push * pa, a.z - uz * push * pa);
        this.stepTo(b, b.x + ux * push * pb, b.z + uz * push * pb);
        if (a.kind !== b.kind) { a.shovedAt = this.t; b.shovedAt = this.t; }
        else if (a.kind === "survivor" && d < INSIDE_M) { a.nudgedAt = this.t; b.nudgedAt = this.t; }
      }
    }
  }

  // ---- setting up ---------------------------------------------------------------------------------------
  private rollLoot(): void {
    for (const r of this.map.site.rooms) for (const sp of r.spots) {
      if (sp.kind !== "loot") continue;
      const items: Item[] = [...((this.map.fixedLoot ?? FIXED_LOOT)[sp.id] ?? [])];
      const rule = (this.map.lootRules ?? LOOT_RULES).find(([re]) => re.test(sp.id))![1];
      for (const [item, lo, hi] of rule) { const n = this.rng.int(lo, hi); for (let i = 0; i < n; i++) items.push(item); }
      this.group.loot.set(sp.id, items);
    }
  }

  private baseBody(i: number, id: string, kind: "survivor" | "zombie", body: string, hp: number): Body {
    return {
      i, id, kind, body, x: 0, z: 0, y: 0, floor: 0, h: 0, cell: -1, room: -1, pose: kind === "survivor" ? "idle" : "z-idle", held: null, torch: false,
      hp, hpMax: hp, why: "", alive: true, path: null, pi: 0, goal: -1, link: null, busyUntil: 0, gait: "still", onBed: false, openDoor: -1,
      progX: 0, progZ: 0, progAt: 0, squeezeUntil: 0, doorAhead: -1, v: 0, walkT: -1,
      s: { x: NaN, z: NaN, y: NaN, h: NaN, pose: "", held: undefined, torch: false, hp: -1, room: -2, why: "", vit: "" },
    };
  }

  /** THE START (14-19): each in a random room, never two together (never the entrance, the armory or the radio
   *  room), woken by the alarm; strangers who know the bunker but not each other. */
  private placeSurvivors(): void {
    const rooms = this.map.startRooms.map((id) => this.nav.roomIdx.get(id)!).filter((r) => r !== undefined);
    for (let i = rooms.length - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); [rooms[i], rooms[j]] = [rooms[j], rooms[i]]; }
    // the picked rooms first (one survivor a room); everyone else takes the shuffled rooms left, in order
    const want = new Map<string, number>();
    const used = new Set<number>();
    for (const who of this.cast) {
      const r = this.pickStarts[who] ? this.nav.roomIdx.get(this.pickStarts[who]) : undefined;
      if (r !== undefined && rooms.includes(r) && !used.has(r)) { want.set(who, r); used.add(r); }
    }
    const free = rooms.filter((r) => !used.has(r));
    let fi = 0;
    this.cast.forEach((who, n) => {
      const s = this.newSurvivor(who, n);
      const room = want.get(who) ?? (free.length ? free[fi++ % free.length] : rooms[n % rooms.length]);
      const c = roomAt(this, room, 0.3 + this.rng.next() * 0.4, 0.3 + this.rng.next() * 0.4);
      this.place(s, c);
      s.startRoom = this.nav.rooms[room].id;
      s.h = this.rng.next() * Math.PI * 2;
      this.bodies.push(s); this.survivors.push(s);
      startKnowledge(this, s);
      // woken by the alarm: a moment to get their bearings before anything else
      s.busyUntil = this.t + 1500 + this.rng.int(0, 2500); s.pose = "idle";
      this.group.explored[room] = 1;
    });
    this.stats.roomsExplored = this.survivors.length;
  }

  /** A survivor's body and state, not yet placed (the six at the start; a newcomer from the bench). */
  private newSurvivor(who: SurvivorId, n: number): Survivor {
    const base = this.baseBody(this.bodies.length, `s:${who}`, "survivor", BODY_OF[who], HP);
    const kit = START_KIT[who];
    const s = base as Survivor;
    Object.assign(s, {
      who, st: STATS[who], gen: { ...START[who] }, actor: { kind: "survivor", nimble: STATS[who].agility, keycard: 0, crowbar: false },
      melee: kit.melee, wear: 0, gun: kit.gun ? "pistol" : null, mag: kit.mag ?? 0,
      pack: { food: kit.food, water: kit.water, bandage: kit.bandage, medkit: kit.medkit, battery: 1, ammoP: kit.ammo ?? 0, ammoR: 0, spare: [] },
      stamina: 1, hungerH: this.rng.range(1, 4), thirstH: this.rng.range(1, 3), tiredH: this.rng.range(2, 9), morale: this.rng.range(50, 68),
      bleeding: 0, bleedNext: 0, bleedSince: 0, bitten: false, infected: false, infectedAt: 0,
      downUntil: 0, downs: 0, deadAt: 0, cause: "", mode: "job", job: null, nextThink: this.t + n * 150, nextScan: this.t + n * 37,
      threats: [], threat: 0, fear: 0, chasedBy: -1, swing: { phase: 0, until: 0, target: -1 }, gunReadyAt: 0, reloadUntil: 0, stillSince: this.t,
      grabbedBy: [], grabbedAt: 0, breakAt: 0, nextBite: 0, nextStab: 0, panicUntil: 0, panicKind: "freeze", bed: null, hurt: 0,
      failed: new Map(), lastDoor: -1, lastDoorAt: 0, reviving: -1, reviveUntil: 0, lastAllyNear: this.t,
      busyAct: "", allies: 0, helping: -1, helpRolled: new Set(), sneak: false, failedSpots: new Map(), lastResupply: 0, nextShut: 0, lastFight: -1e9, modeAt: -1e9, lastTalk: -1e9, lastPatrol: -1e9, nerve: 1, homeSince: 0, pulling: -1, pullAt: 0,
      know: newKnowledge(this.nav.rooms.length, this.nav.doors.length, this.local.zoneIds.length), card: 0, laneGoal: -1, laneSeed: 1, rethink: false, retryAt: 0,
      bag: null, alert: false, alertUntil: 0, calmSince: this.t, charge: BATTERY_MS, haul: false, lastProgress: this.t, touchAt: null, touchWhat: "", waitSince: 0,
      skills: newSkills(who), readQ: [], readCur: "", sick: 0, infKnown: false, turnAt: 0, nextCough: 0, turned: false, studied: new Set(), sessionEnd: 0, escaped: false,
      hidden: false, nextCall: this.t + this.rng.range(15_000, 40_000), met: new Set(),
    } satisfies Partial<Survivor>);
    // calm: nothing in their hands yet (the stance picks it up)
    s.held = null;
    return s;
  }

  /** (the old show's bench: the bunker's cast is fixed — Claudia is cut, 44) */
  newcomer(_who?: SurvivorId): boolean { return false; }
  nextOnBench(): SurvivorId | undefined { return undefined; }

  makeZombie(kind: ZombieKind, cell: number, bodyName?: string): Zombie {
    const k = KINDS[kind];
    const id = `z:${this.zombies.length}`;
    const base = this.baseBody(this.bodies.length, id, "zombie", bodyName ?? this.pickFace(kind, cell), k.hp);
    const z = base as Zombie;
    Object.assign(z, {
      zkind: kind, k, actor: { kind: "zombie", type: kind === "experiment" ? "experiment" : "outside" },
      state: "idle", target: -1, lx: 0, lz: 0, lf: 0, lastSeen: 0, searchUntil: 0,
      nextSense: this.t + this.rng.int(0, 300), nextThink: this.t + this.rng.int(0, 3000), attackCd: 0, grabbing: -1, stagger: 0,
      bangDoor: -1, bangSince: 0, nextBang: 0, burstUntil: 0, restUntil: 0, heldQuiet: 0, carriesCard: 0, noiseSeen: this.lastNoiseId,
      feedUntil: 0, nextIdleSound: 0, killedBy: "", alertedAt: -1e9, confined: -1, gaveUpDoor: -1, gaveUpAt: 0, arrivedAt: 0, diedAt: 0, lying: false,
    } satisfies Partial<Zombie>);
    z.pose = kind === "crawler" ? "z-crawl" : "z-idle";
    this.place(z, cell);
    z.h = this.rng.next() * Math.PI * 2;
    this.bodies.push(z); this.zombies.push(z);
    return z;
  }

  /** the face whose nearest copy is furthest away (§9: never two copies of a face near each other);
   *  among faces with no copy within SAME_FACE_M, the least used */
  private pickFace(kind: ZombieKind, cell: number): string {
    const pool = OUTSIDE_BODIES;
    const [x, , z] = this.nav.centre(cell), f = this.nav.floorOfCell(cell);
    const nearest = new Map<string, number>(), count = new Map<string, number>();
    for (const o of this.zombies) {
      if (o.gone) continue;   // a retired corpse is on nobody's screen
      count.set(o.body, (count.get(o.body) ?? 0) + 1);
      const d = o.floor === f ? Math.hypot(o.x - x, o.z - z) : 1e6;
      nearest.set(o.body, Math.min(nearest.get(o.body) ?? 1e9, d));
    }
    const far = (b: string) => Math.min(SAME_FACE_M, nearest.get(b) ?? 1e9);
    let bestFar = -1;
    for (const b of pool) bestFar = Math.max(bestFar, far(b));
    const cands = pool.filter((b) => far(b) >= bestFar - 1e-6);
    let least = Infinity;
    for (const b of cands) least = Math.min(least, count.get(b) ?? 0);
    return this.rng.pick(cands.filter((b) => (count.get(b) ?? 0) === least));
  }

  /** THE DEAD AT THE START (37, third round 13): 20, mostly near the entrance and the common room, thinning into
   *  the wings; a few lying on the floor (fifth round 16); never within reach of a survivor's start. */
  private placeZombies(): void {
    const taken = new Set<number>();
    // EVERY ONE OF THE 20 IS PLACED (Nov 3 2026: a group whose rooms all had somebody waking in or near them used to
    // lose its dead — 17 of 20 on average): after its own rooms, anywhere inside but the tunnel and the locked rooms
    const PLACEMENTS = this.map.placements, outside = this.map.arrivals?.room, locked = new Set(this.map.lockedRooms);
    // (a map with none written has none at the start)
    if (!PLACEMENTS.length) return;
    const anywhere = this.nav.rooms.map((r) => r.id).filter((id) => id !== outside && !locked.has(id));
    const total = PLACEMENTS.reduce((a, pl) => a + pl.n, 0);
    const want = this.startZombies ?? total;
    const counts = PLACEMENTS.map((pl) => Math.floor((pl.n * want) / total));
    for (let k = 0, left = want - counts.reduce((a, b) => a + b, 0); left > 0; k = (k + 1) % counts.length, left--) counts[k]++;
    for (const [pi, pl] of PLACEMENTS.entries()) {
      for (let n = 0; n < counts[pi]; n++) {
        let cell = -1;
        for (let tries = 0; tries < 120; tries++) {
          const room = this.nav.roomIdx.get(this.rng.pick(tries < 40 ? pl.rooms : anywhere))!;
          const c = roomAt(this, room, this.rng.range(0.1, 0.9), this.rng.range(0.1, 0.9));
          if (c < 0 || taken.has(c) || !this.nav.isWalk(c) || this.nav.door[c] >= 0) continue;
          const [x, , z] = this.nav.centre(c);
          // never in a room somebody woke in, nor within 12 m of anyone (a start beside the dead is a death, not a show)
          if (this.survivors.some((s) => s.room === room || Math.hypot(s.x - x, s.z - z) < 12)) continue;
          let crowd = false;
          for (const t of taken) { const [tx, , tz] = this.nav.centre(t); if ((tx - x) ** 2 + (tz - z) ** 2 < 1.2) { crowd = true; break; } }
          if (crowd) continue;
          cell = c; break;
        }
        if (cell < 0) continue;
        taken.add(cell);
        const u = this.rng.next();
        let kind: ZombieKind = "shambler", acc = 0;
        for (const [k, p] of OUTSIDE_MIX) { acc += p; if (u < acc) { kind = k; break; } }
        const z = this.makeZombie(kind, cell);
        if (this.rng.chance(LYING_SHARE)) { z.lying = true; z.pose = "z-dead"; z.why = "lying"; }
        // FIRST CONTACT IS GRADUAL (Josh, Nov 3 2026: "spread zombies out"): the dead start dormant a minute or three —
        // they still turn on anybody who walks right up (zombie.ts: within 6 m), but they don't hear the whole bunker
        // waking and converge on the first survivor they see as a pack
        z.heldQuiet = this.t + this.rng.range(60_000, 180_000);
      }
    }
  }

  // ---- what happens to bodies ---------------------------------------------------------------------------------
  /** A survivor takes damage. `part` for the effects. */
  hurtSurvivor(s: Survivor, dmg: number, by: number, how: "scratch" | "bite" | "blunt", part: string): void {
    if (!s.alive || s.mode === "down") return;
    // (Toughness: a blow takes less out of them, 1 at toughness 5)
    dmg *= toughFx(s.st, "toughHurt");
    s.hp = Math.max(0, s.hp - dmg);
    s.hurt += dmg;
    const zid = by >= 0 ? this.bodies[by].id : undefined;
    if (how === "bite") {
      this.stats.bites++;
      s.bleeding = 2; s.bleedSince = this.t;
      const was = s.infected;
      // the table's number (tables.ts INFECT) — this read 0.85 straight off, so the table was never used
      if (this.rng.chance(INFECT.bite)) { s.infected = true; s.infectedAt = s.infectedAt || this.t; }
      s.bitten = true;
      if (s.infected && !was) onInfected(this, s, this.survivors.some((o) => o !== s && o.alive && o.mode !== "sleep" && o.floor === s.floor && d2(o, s) < 12 * 12));
      this.ev("survivor.bitten", { victim: s.id, by: zid, dmg: Math.round(dmg), part, at: pos(s) });
      s.morale = Math.max(0, s.morale - 8);
    } else {
      if (how === "scratch") { if (!s.bleeding) s.bleedSince = this.t; s.bleeding = Math.max(s.bleeding, 1) as 1 | 2; if (!s.infected && this.rng.chance(INFECT.scratch)) { s.infected = true; s.infectedAt = s.infectedAt || this.t; onInfected(this, s, false); } }
      this.ev("survivor.hit", { victim: s.id, by: zid, dmg: Math.round(dmg), part, at: pos(s) });
    }
    if (s.bleeding && !s.bleedNext) s.bleedNext = this.t + (s.bleeding === 2 ? 2000 : 10_000);
    if (s.hp <= 0) this.goDown(s, how === "bite" ? "bitten" : "wounds");
    else if (this.rng.chance(0.5)) this.ev("survivor.pain", { by: s.id, at: pos(s) });
  }

  /** A body stopped mid-link (a vent crawl, a ladder, a shaft) — down, dead — is put at the link's
   *  nearer end, on its stand cell. (Map polish, Oct 29 2026: a survivor bitten at the camera room's end
   *  of the ward vent went down where the crawl had got him, inside the wall, and lay there.) */
  endLinkHere(b: Body): void {
    const L = b.link;
    if (!L) return;
    b.link = null;
    const u = Math.min(1, Math.max(0, (this.t - L.t0) / L.ms));
    if (u >= 0.5) { b.x = L.x1; b.z = L.z1; b.y = L.y1; b.floor = L.f1; } else { b.x = L.x0; b.z = L.z0; b.y = L.y0; }
    const c = this.nav.cellAt(b.floor, b.x, b.z);
    if (c >= 0) this.setCell(b, c);
  }

  goDown(s: Survivor, cause: string): void {
    this.endLinkHere(s);
    // DOWN OFF A BED (Nov 2026): onto the floor beside it — they used to lie inside the bed's frame, where no
    // friend could kneel to them
    if (s.onBed && s.bed) {
      const bed = Object.values(this.nav.beds).flat().find((b) => b.id === s.bed);
      if (bed) { const c = this.nav.cellAt(s.floor, bed.stand[0], bed.stand[2]); if (c >= 0) this.place(s, c); }
      s.bed = null;
    }
    s.mode = "down"; s.pose = "down"; s.hp = 0; s.lie = LIE.fall;
    s.h = this.layHeading(s, s.lie);
    s.downUntil = this.t + (s.downs > 0 ? 30_000 : 60_000);
    s.downs++; s.cause = cause; s.path = null; s.link = null; s.job = null; s.onBed = false;
    // (the hands come off whatever they were on: put down half a second into a kneel and got up ten seconds later,
    // the kneel's clock had run and the friend stood up a tenth of a second after, a bandage spent)
    s.busyAct = ""; s.busyUntil = 0; s.reviving = -1; s.touchAt = null;
    s.swing.phase = 0; s.why = "down";
    this.stats.downs++;
    for (const zi of s.grabbedBy) { const z = this.bodies[zi] as Zombie; z.grabbing = -1; z.state = "feed"; z.target = s.i; }
    s.grabbedBy = [];
    this.ev("survivor.down", { victim: s.id, at: pos(s) });
    witness(this, s.x, s.z, s.floor, 30, (o) => (o === s ? null : `${cap(s.who)} went down`));
    // everyone who heard it knows, and drops what they're doing to think (the revive is on the menu at once)
    for (const o of this.survivors) if (o !== s && o.alive && o.floor === s.floor && d2(o, s) < 30 * 30) { o.know.ally.set(s.i, { room: s.room, t: this.t, state: "down" }); o.rethink = true; }
    this.say(s.who, "down", { cause });
    for (const o of this.survivors) if (o !== s && o.alive) o.morale = Math.max(0, o.morale - 4);
  }

  standUp(s: Survivor, hp: number, by: number): void {
    s.mode = "job"; s.hp = hp; s.pose = "idle"; s.downUntil = 0; s.bleeding = 0; s.bleedNext = 0; s.why = "revived";
    for (const z of this.zombies) if (z.alive && z.target === s.i && z.state === "feed") { z.state = "chase"; }
    if (by >= 0) { this.stats.revives++; this.ev("survivor.revived", { victim: s.id, by: this.bodies[by].id, at: pos(s) }); note(s.know, this.t, `${cap((this.bodies[by] as Survivor).who)} got me back up`); }
  }

  dieSurvivor(s: Survivor, cause: string): void {
    this.endLinkHere(s);
    // (on their feet, their own death clip's lie — sim/lie.ts. DYING ON THE FLOOR, THEY GO LIMP (Nov 13 2026, watched:
    // one who bled out stayed propped up on their hands, a corpse holding itself off the floor for the rest of
    // the show): the show lets the propped pose go for the lying one, straight back, so the body lies that way here)
    if (s.mode !== "down") { s.lie = deathLie(s.id); s.h = this.layHeading(s, s.lie); }
    else { s.lie = LIE.lying; s.h = this.layHeading(s, s.lie); }
    s.alive = false; s.mode = "dead"; s.pose = "dead"; s.hp = 0; s.deadAt = this.t; s.cause = s.cause || cause;
    s.path = null; s.link = null; s.job = null; s.why = "dead"; s.torch = false; s.held = null;
    for (const zi of s.grabbedBy) { const z = this.bodies[zi] as Zombie; z.grabbing = -1; }
    s.grabbedBy = [];
    this.stats.deaths++;
    this.lastDeathAt = this.t;
    // THE DEAD KEEP THEIR GEAR WHERE THEY FALL (§8): the card, the weapon, the gun and its rounds, the
    // pack and what's in it lie on the body for the others to take (the census counts it there now)
    this.dropGear(s);
    witness(this, s.x, s.z, s.floor, 30, (o) => (o === s ? null : `${cap(s.who)} died`));
    for (const o of this.survivors) if (o !== s && o.alive && o.floor === s.floor && d2(o, s) < 30 * 30) o.know.ally.set(s.i, { room: s.room, t: this.t, state: "dead" });
    this.ev("survivor.dead", { victim: s.id, at: pos(s), cause: s.cause });
    for (const o of this.survivors) if (o.alive) o.morale = Math.max(0, o.morale - (Math.sqrt(d2(o, s)) < 20 ? 25 : 15));
  }

  /** Everything on a survivor goes onto their body where they fell. The worn pack stays on the corpse
   *  (BodyState.pack) until somebody takes it, so the census reads it off the drop, not the corpse. */
  private dropGear(s: Survivor): void {
    const P = s.pack, items: Item[] = [];
    const n = (it: Item, k: number) => { for (let i = 0; i < k; i++) items.push(it); };
    n("food", P.food); n("water", P.water); n("bandage", P.bandage); n("medkit", P.medkit); n("battery", P.battery);
    if (s.melee !== "fists") items.push(s.melee as Item);
    if (s.gun) items.push(s.gun);
    for (const x of P.spare) items.push(x as Item);
    if (s.bag) items.push(s.bag);
    const rp = P.ammoP + (s.gun === "pistol" ? s.mag : 0), rr = P.ammoR + (s.gun === "rifle" ? s.mag : 0);
    if (items.length || rp || rr || s.card) this.group.drops.push({ id: `drop:${s.id}:${this.t}`, cell: s.cell, floor: s.floor, items, card: s.card, rp, rr, who: s.who });
    s.card = 0;
    s.pack = { food: 0, water: 0, bandage: 0, medkit: 0, battery: 0, ammoP: 0, ammoR: 0, spare: [] };
    s.melee = "fists"; s.gun = null; s.mag = 0;
  }

  /**
   * THE CENSUS: every item in the facility, wherever it is — in a container, in the box, on a body, in
   * someone's hands or pack. With the ledger (stats.used / stats.made) it proves nothing is ever
   * duplicated or lost except by use. A rifle lying in a container comes with its magazine (30 rounds);
   * A pistol
   * there comes with its 15. One on a body or in the box doesn't (its rounds are counted loose there).
   */
  census(): Census {
    const c: Census = {};
    const add = (k: string, n = 1) => { if (n) c[k] = (c[k] ?? 0) + n; };
    const item = (it: string, loaded: boolean) => {
      if (it === "ammo") add("roundsP", 15);
      else if (it === "ammoR") add("roundsR", 30);
      else { add(it); if (it === "rifle" && loaded) add("roundsR", 30); if (it === "pistol" && loaded) add("roundsP", 15); }
    };
    for (const items of this.group.loot.values()) for (const it of items) item(it, true);
    // the radio's one part, still where it hides (it isn't in the loot: finding it is its own job)
    if (this.obj.partSpot && !this.obj.partFoundAt) add("part");
    // (and once it's fitted, it's in the radio)
    if (this.obj.partIn) add("part");
    for (const d of this.group.drops) { for (const it of d.items) item(it, false); add("roundsP", d.rp); add("roundsR", d.rr); }
    const B = this.group.box;
    add("food", B.food); add("water", B.water); add("bandage", B.bandage); add("medkit", B.medkit); add("battery", B.battery);
    add("roundsP", B.ammoP); add("roundsR", B.ammoR);
    for (const g of B.gear) item(g, false);
    for (const s of this.survivors) {
      const P = s.pack;
      add("food", P.food); add("water", P.water); add("bandage", P.bandage); add("medkit", P.medkit); add("battery", P.battery);
      add("roundsP", P.ammoP); add("roundsR", P.ammoR);
      if (s.melee !== "fists") add(s.melee);
      if (s.gun) { add(s.gun); add(s.gun === "rifle" ? "roundsR" : "roundsP", s.mag); }
      for (const x of P.spare) add(x);
      if (s.bag && s.alive) add(s.bag);
    }
    return c;
  }
  /** an item used up (eaten, drunk, spent, fired, broken) — the ledger's other side */
  use(k: string, n = 1): void { this.stats.used[k] = (this.stats.used[k] ?? 0) + n; }
  /** an item made (a bottle filled at a safe-room sink, or the extra a Creative search turns up) */
  make(k: string, n = 1): void { this.stats.made[k] = (this.stats.made[k] ?? 0) + n; }

  /** the heading a body falls from so it lies on open floor (sim/lie.ts layHeading) — walkable, and clear of the
   *  bodies already on the floor; and first, if it would fall onto one of them, a step aside (at most LAY_SHIFT_M):
   *  two survivors went down on top of each other, and the downed no longer get pushed apart */
  layHeading(b: Body, lie: number): number {
    const lying = this.bodies.filter((o) => o !== b && o.floor === b.floor && (o.kind === "survivor" ? !(o as Survivor).alive || (o as Survivor).mode === "down" : !o.alive && !(o as Zombie).gone) && d2(o, b) < 3 * 3);
    // the points of each lying body: hips, chest, head (along the way it lies)
    const pts: [number, number][] = [];
    for (const o of lying) {
      const th = o.kind === "survivor" ? (o as Survivor).lie : zombieDeathLie(o.id, false);
      const g = o.h + (th ?? LIE.lying), ux = Math.sin(g), uz = Math.cos(g);
      pts.push([o.x, o.z], [o.x + ux * 0.3, o.z + uz * 0.3], [o.x + ux * 0.6, o.z + uz * 0.6], [o.x - ux * 0.4, o.z - uz * 0.4]);
    }
    const clear = (x: number, z: number) => pts.every(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 >= LAY_APART_M * LAY_APART_M);
    const open = (x: number, z: number) => this.nav.isWalk(this.nav.cellAt(b.floor, x, z)) && clear(x, z);
    if (pts.length && !clear(b.x, b.z)) {
      for (const r of [0.35, 0.55, LAY_SHIFT_M]) {
        let done = false;
        for (let k = 0; k < 8 && !done; k++) {
          const a = (k / 8) * Math.PI * 2, x = b.x + Math.sin(a) * r, z = b.z + Math.cos(a) * r;
          if (open(x, z)) { const ox = b.x, oz = b.z; if (this.stepTo(b, x, z)) done = true; else { b.x = ox; b.z = oz; this.setCell(b, this.nav.cellAt(b.floor, ox, oz)); } }
        }
        if (done) break;
      }
    }
    return layHeading(b.x, b.z, b.h, lie, open);
  }

  /** A zombie dies. `by` the survivor index (-1 none), `part` "head" | "torso". */
  killZombie(z: Zombie, by: number, part: string): void {
    this.endLinkHere(z);
    // (it falls onto open floor, not into the wall beside it — sim/lie.ts; a crawler dies where it lies)
    if (z.zkind !== "crawler") z.h = this.layHeading(z, zombieDeathLie(z.id, z.pose === "z-feed"));
    z.alive = false; z.state = "dead"; z.pose = "z-dead"; z.hp = 0; z.path = null; z.link = null; z.why = ""; z.diedAt = this.t;
    if (z.grabbing >= 0) { const s = this.bodies[z.grabbing] as Survivor; s.grabbedBy = s.grabbedBy.filter((x) => x !== z.i); z.grabbing = -1; }
    this.stats.zombiesKilled++;
    z.killedBy = by >= 0 ? this.bodies[by].id : "";
    if (by >= 0 && this.bodies[by].kind === "survivor") { const k = this.bodies[by] as Survivor; this.lastKillBy = k.who ?? ""; k.kills = (k.kills ?? 0) + 1; }
    this.ev("zombie.death", { by: z.killedBy || undefined, victim: z.id, part, at: pos(z) });
    if (z.carriesCard) {
      this.group.drops.push({ id: `drop:${z.id}`, cell: z.cell, floor: z.floor, items: [], card: z.carriesCard, rp: 0, rr: 0 });
      z.carriesCard = 0;
    }
  }

  /** Damage a zombie. Returns true if it died. */
  hurtZombie(z: Zombie, dmg: number, by: number, head: boolean, heavy = false): boolean {
    if (!z.alive) return false;
    // a head hit kills a shambler outright (§9) — with a real blow; a fist to the skull only hurts
    if (head && (z.zkind === "shambler" || z.zkind === "crawler") && dmg >= 20) { this.killZombie(z, by, "head"); return true; }
    z.hp -= head ? dmg * 2 : dmg;
    if (z.hp <= 0) { this.killZombie(z, by, head ? "head" : "torso"); return true; }
    // THE DEAD DON'T STOP FOR A BODY BLOW (Oct 28 2026): an ordinary hit only rocks it a moment; a head
    // hit staggers it; the axe staggers and knocks it down ~40% of the time (§8)
    const tally = (k: string) => { this.stats.combat[k] = (this.stats.combat[k] ?? 0) + 1; };
    if (heavy && this.rng.chance(0.4)) { z.stagger = this.t + 2200; tally("knockdowns"); }
    else z.stagger = this.t + (head ? COMBAT.headStaggerMs : heavy ? 900 : COMBAT.bodyStaggerMs);
    // a blow breaks a grab sometimes; a head hit or the axe always
    if (z.grabbing >= 0 && (head || heavy || this.rng.chance(COMBAT.hitBreaksGrab))) {
      const s = this.bodies[z.grabbing] as Survivor;
      s.grabbedBy = s.grabbedBy.filter((x) => x !== z.i);
      z.grabbing = -1;
      this.stats.grabsBroken++; tally("hitOff");
    }
    // being hit tells it where you are
    if (by >= 0 && z.state !== "feed") { z.state = "chase"; z.target = by; const b = this.bodies[by]; z.lx = b.x; z.lz = b.z; z.lf = b.floor; z.lastSeen = this.t; }
    return false;
  }
}

/** §8's slots: what a survivor's things take up, and what they have (pockets + the pack). */
export function slotsUsed(s: Survivor): number { return slotsOf(s.pack); }
/** The slots a pack's contents take, with `add` more of each thing. The battery in the flashlight is in
 *  the flashlight; only the spares take room. */
export function slotsOf(P: Pack, add: Partial<Record<"food" | "water" | "bandage" | "medkit" | "battery" | "ammoP" | "ammoR" | "spare", number>> = {}): number {
  const n = (k: "food" | "water" | "bandage" | "medkit" | "ammoP" | "ammoR") => Math.ceil((P[k] + (add[k] ?? 0)) / STACK[k]);
  return n("food") + n("water") + n("bandage") + n("medkit") + n("ammoP") + n("ammoR")
    + Math.ceil(Math.max(0, P.battery + (add.battery ?? 0) - 1) / STACK.battery) + P.spare.length + (add.spare ?? 0);
}
export const slotsMax = (s: Survivor): number => BASE_SLOTS + (s.bag ? PACK_SLOTS[s.bag] : 0);

export function meleeHeld(m: string): Held {
  if (m === "fists") return null;
  return ({ knife: "chef-knife", pipe: "lead-pipe", hammer: "claw-hammer", crowbar: "crowbar", axe: "fire-axe-a" } as Record<string, string>)[m] ?? null;
}
export const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const d2 = (a: { x: number; z: number }, b: { x: number; z: number }) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const pos = (b: Body): [number, number, number] => [r2(b.x), r2(b.y), r2(b.z)];
