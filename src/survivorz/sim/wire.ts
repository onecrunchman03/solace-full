// SOLACE SURVIVORZ — THE SHOW'S WIRE (the contract between the simulation and every screen).
//
// IMPORT-FREE ON PURPOSE: the client imports this file directly (`../../../src/survivorz/sim/wire`),
// the way the backrooms client imports its vocab files. Change a shape here and both halves see it.
//
// The rule it encodes (SURVIVORZ.md §5): GAME CODE DECIDES. The server simulates; a screen only
// draws what it is told. Nothing a WATCHER sends changes the world (a watcher sends nothing but
// "watch"; the admin's levers go over HTTP, audited). The one thing a socket may send that does is
// the admin's own hand on a WALK run (WalkCommand, below): a test run, private to the admin.
//
// Coordinates are world metres: x east, y up, z south (the facility file's convention —
// SITE_9's rect.y IS world z). Headings are radians: facing = (sin h, cos h), i.e. h = atan2(dx, dz) — 0 faces +z (south),
// PI/2 faces +x (east); three.js draws it as rotation.y = h (the casino floor's convention). Times are the show clock in ms (Date-like).

/** A CHARACTER's id — their file, src/survivorz/cast/<id>.json (the body each wears is in it, cast/index.ts BODY_OF). */
export type SurvivorId = string;

export type ZombieKind = "shambler" | "runner" | "crawler" | "experiment";

/** What a body is doing, as the screen needs to know to pick a move. The CLIENT maps these to
 *  clips (show/actors.ts); the server never names a clip. Keep this list short and physical. */
export type Pose =
  | "idle" | "walk" | "jog" | "sprint" | "crouch" | "crouch-walk"
  | "search"        // rummaging a container / reading files
  | "interact"      // a door, a keypad, a breaker
  | "fight"         // melee swing in progress (see `act`)
  | "aim" | "shoot" | "reload"
  | "hit"           // flinch (one-shot)
  | "down"          // crawling, bleeding out
  | "revive"        // kneeling over someone
  | "sleep" | "sit" | "eat" | "drink" | "bandage"
  | "talk"
  | "panic"
  | "grabbed"       // held by a zombie, struggling (the finisher pack's paired move) — added by the sim
  | "dead"
  // the dead's own
  | "z-idle" | "z-wander" | "z-chase" | "z-attack" | "z-bang" | "z-feed" | "z-crawl"
  | "z-stagger" | "z-dead";

/** A link a body crosses between two places (sim/nav.ts portals; stairs are walked, so never sent). */
export type LinkKind = "ladder" | "vent" | "lift" | "window";

/** One objective as the overlay draws it, for a map whose objectives are its scenario's (Glenridge Hall): the
 *  words are the server's, so a new map needs no page code. */
export interface GoalRow {
  id: string; label: string;
  /** when it was done (0 = not yet) and by whom */
  done: number; by?: string;
  /** "3/5", "68%": how far along, shown beside the label while it isn't done */
  note?: string;
}

/** What is in a survivor's hands (a prop id from props/props.json, or a gun id). */
export type Held = string | null;

/** One body's full state, as it appears in a snapshot. */
export interface BodyState {
  id: string;              // "s:rick" | "z:17"
  kind: "survivor" | "zombie";
  who?: SurvivorId;        // survivors
  zkind?: ZombieKind;      // zombies
  /** a survivor who got out through the vault (escape.ts): alive, gone from the facility, not drawn */
  escaped?: boolean;
  /** a zombie that was one of the cast (the survivor it was): drawn in their own body, turned (§5). On a
   *  SURVIVOR, it means they turned: their card stays (dead) and their body is not drawn. */
  turned?: SurvivorId;
  body: string;            // the glb's base name (the character's body, or "zombie-m05")
  pos: [number, number, number];
  heading: number;
  pose: Pose;
  room: string | null;     // facility-map room id the body stands in
  held?: Held;
  torch?: boolean;         // flashlight on
  /** On guard / ready to fight (Josh, Oct 28 2026: calm survivors don't stand in a fighting stance).
   *  false = calm (weapons stowed, relaxed clips); absent = the screen infers it from the pose. */
  alert?: boolean;
  /** A worn backpack, drawn on the back (show/actors.ts). */
  pack?: "backpack-small" | "backpack-large" | null;
  /** Crossing a link between floors now (the nav's portal kind): the body climbs a ladder, crawls a vent,
   *  rides a lift instead of walking through the air. Absent or null = on the floor (stairs walk). Additive, Oct 31 2026. */
  link?: LinkKind | null;
  hp: number;              // 0..max
  hpMax: number;
  /** Survivors only — what the overlay shows. */
  vitals?: SurvivorVitals;
  /** A word for what the body is at ("loot", "flee", "guard", "rest", a map's task: "bolt", "read", …). It rides
   *  the wire to every screen, because the page picks the work's animation by it (show/stance.ts); it is WRITTEN
   *  on the admin's overlay only, never on the broadcast. Nothing secret goes in it (a hidden bite never does). */
  why?: string;
}

export interface SurvivorVitals {
  stamina: number;   // 0..1
  hunger: number;    // 0..1, 1 = starving
  thirst: number;    // 0..1
  tired: number;     // 0..1, 1 = collapse
  morale: number;    // 0..100
  infected: boolean; // known infection (a hidden bite stays false here)
  /** the infection's symptoms as anyone can see them: 2 fever · 3 coughing · 4 confused · 5 turning (absent
   *  before they show — the audience may see the shiver before the group does) */
  sick?: number;
  /** bitten — the AUDIENCE sees it at once, even when the group doesn't (BUNKER.md 38: the BITTEN mark) */
  bitten?: boolean;
  /** the dead they've put down this run (the cast card, the recap) */
  kills?: number;
  bleeding: 0 | 1 | 2;
  downUntil?: number;// bleeding out until (show clock)
  job: string;       // "explore" | "loot" | "rest" | "guard" | …
  /** what's in their pockets — the broadcast's cast strip shows it (Josh, Oct 28 2026). Their own
   *  pack, never the group's box (that's Supplies). */
  inv?: SurvivorInv;
}

export interface SurvivorInv {
  melee: string;              // "fists" | "pipe" | "knife" | "crowbar" | "hammer" | "axe"
  gun?: "pistol" | "rifle";
  rounds?: number;            // in the gun + spare for it
  food: number;
  water: number;
  bandage: number;
  medkit: number;
  card?: number;              // keycard tier carried
  /** the backpack they wear (BodyState.pack), and how full they are: slots used / slots they have
   *  (§8 — the belt and pockets, plus the pack's 6 or 8). Additive, Oct 28 2026. */
  pack?: "backpack-small" | "backpack-large";
  slots?: number;
  slotsMax?: number;
  /** flashlight batteries carried (one runs the light ~2 h) */
  battery?: number;
}

export interface DoorWire {
  id: string;
  open: boolean;
  locked: boolean;
  broken: boolean;
  planks: number;
  reinforced: boolean;
  health: number;
}

/** Everything a screen needs to start drawing. Sent once on connect and after a reset. */
export interface Snapshot {
  type: "snap";
  t: number;              // show clock now
  day: number;            // 1-based show day
  /** THE RUN's stable id: it survives a restart (the world is saved and resumed); a DIFFERENT run (a
   *  reset, a stop and a fresh start) means everything a screen holds is stale — clear it all */
  run?: string;
  /** THE MAP the run is on (a maps.ts id: "bunker", "glenridge"). Absent on an older server: the bunker. */
  map?: string;
  bodies: BodyState[];
  doors: DoorWire[];
  power: Record<string, boolean>;   // zone → powered
  director: DirectorWire;
  /** the group's linked storage (SURVIVORZ.md §3 "the boxes are LINKED") — what the overlay shows */
  supplies?: Supplies;
  /** THE BUNKER's objectives (goals.ts): the door, the count inside, the radio, the end */
  goals?: Goals;
}

/** THE BUNKER'S OBJECTIVES (docs/survivorz/BUNKER.md, sim/goals.ts) — what the overlay's checklist shows.
 *  The count inside is the AUDIENCE's (the survivors never know it, 25). Times are the show clock. */
export interface Goals {
  /** objective 1: the crank's progress 0..1; when it was sealed and by whom */
  door: { crank: number; sealed?: number; by?: string };
  /** objective 2: the dead inside the bunker right now */
  inside: number;
  /** when the bunker was first clear with the door sealed, and who put down the last of them */
  clear?: number;
  clearBy?: string;
  /** objective 3: the part found, the code known, the room opened, the repair 0..1, fixed, the call made — each
   *  with when (show clock) and by whom, for the banners and the recap (`by` is the caller) */
  radio: {
    part?: boolean; partAt?: number; partBy?: string; code?: boolean; codeAt?: number; codeBy?: string; open?: boolean;
    repair: number; fixed?: number; fixedBy?: string; called?: number; by?: string;
  };
  /** the show clock's first ms (the clock on screen counts down from here + an hour) */
  startedAt: number;
  /** the four-hour clock's end (show clock) */
  endsAt: number;
  /** how it ended: rescued · wiped (everyone dead) · timeout (no rescue by 4:00) */
  ending?: "rescued" | "wiped" | "timeout" | "escaped" | "survived";
  rescued?: string[];
  /** A MAP WHOSE OBJECTIVES ARE ITS SCENARIO'S (Glenridge Hall): the rows the overlay draws, in order, in the
   *  server's own words (door / radio above are then empty), and what the count on screen is called */
  rows?: GoalRow[];
  insideLabel?: string;
  /** the set's moving parts, for the page to draw (Glenridge: `crests` set in the chimneypiece, `away` once the car has gone) */
  props?: Record<string, number>;
  over?: boolean;
  /** when it ended (show clock) */
  endedAt?: number;
}

/** What's in the safe rooms' shared storage box — never what's in anybody's pockets (that's theirs to
 *  share or hide, and the honesty layer will lean on exactly that). `foodDays` is the box's meals over
 *  the living at ~2.5 meals a person a day (§5), one decimal. */
export interface Supplies {
  food: number;
  water: number;
  bandage: number;
  medkit: number;
  ammo: number;      // pistol + rifle rounds
  foodDays: number;
}

export interface DirectorWire {
  phase: "build" | "peak" | "relax";
  tension: Record<string, number>;  // survivor id → 0..100
  /** The camera's hint: the most interesting body right now and why (show/camera.ts may ignore it). */
  focus?: { id: string; why: string };
}

/** The positions frame, ~10 Hz. Only bodies that changed since the last frame; `pose` and `held`
 *  only when they changed. A body absent here hasn't moved. */
export interface Tick {
  type: "tick";
  t: number;
  b: TickBody[];
  director?: DirectorWire;
  /** sent only when it changed (checked once a second) */
  supplies?: Supplies;
  /** sent only when it changed (checked once a second) */
  goals?: Goals;
}

export interface TickBody {
  id: string;
  p: [number, number, number];
  h: number;
  pose?: Pose;
  held?: Held;
  torch?: boolean;
  /** only when it changed (BodyState.alert) */
  alert?: boolean;
  /** only when it changed (BodyState.pack); null = took it off */
  pack?: "backpack-small" | "backpack-large" | null;
  /** only when it changed (BodyState.link); null = off the link */
  link?: LinkKind | null;
  hp?: number;
  room?: string | null;
  vitals?: SurvivorVitals;
  why?: string;
}

/** A body appears (a zombie released, a survivor joins) or leaves (removed — a death leaves the
 *  body where it fell with pose "dead"; `gone` is only for bodies that stop existing). */
export interface Spawn { type: "spawn"; body: BodyState }
export interface Gone { type: "gone"; id: string }

/** A thing that happened. `event` is the effects/sound vocabulary (fx/show.ts + audio/cues.ts):
 *  door.*, zone.powered, zone.dip, vault.open/shut, room.unsealed, pipe.burst, thing.fell,
 *  fire.*, and the combat/body ones below. Every event carries seed + t so every screen
 *  plays the identical effect. */
export interface Ev {
  type: "ev";
  event: string;           // the same key doors.ts FxEvent and fx/show.ts ShowEvent use
  t: number;
  seed: number;
  /** world metres, where it happened */
  at?: [number, number, number];
  /** who did it / who it happened to */
  by?: string;
  victim?: string;   // NOT `to` — ShowEvent.to is fire.spread's vec3
  /** the event's own fields (door, zone, normal, planks, reinforced, dmg, part, weapon, …) */
  [k: string]: unknown;
}

/** A line said aloud (the talk layer — empty in the rough draft; the brains come later). */
export interface Say {
  type: "say"; t: number; by: string; text: string; to?: string;
  /** the line in their own voice (src/survivorz/voices.ts): a clip to fetch, and its length in ms —
   *  absent when there's no voice (the subtitle alone) */
  audio?: string; ms?: number;
}

/** What a survivor is THINKING (Josh, Oct 28 2026) — one short line for their cast card, sent when it
 *  changes. Written by the model when the brain is on, by code from what drives their choice when it
 *  isn't (talk/thoughts.ts). Honest, never a hidden bite. Additive: a screen may ignore it. */
export interface Think { type: "think"; t: number; by: string; text: string }

/** THE RECAP (src/survivorz/recap.ts, Nov 1 2026): every few minutes, a short summary of where things
 *  stand, for the stream's pop-up. Public facts only. Additive: a screen may ignore it. */
export interface Recap { type: "recap"; t: number; title: string; text: string; ms: number }
/** WHAT THEY DECIDED (Josh, Nov 2026 — phase 4, "the AI does the rest"): a choice the model made for a
 *  survivor — what they're going to do (`did`, the menu's own words) and their reason in their words
 *  (`reason`, read twice for THE LINE; empty when it failed). `kind` "social" for giving, stealing, owning
 *  up and turning on somebody. Never a hidden bite. Additive: a screen may ignore it. */
export interface Decide { type: "decide"; t: number; by: string; did: string; reason: string; kind?: "social" }
/** A survivor's own GOAL, set by the model in their own words (talk/minds.ts maybeGoal) and read
 *  twice before it reaches the screen. Additive: a screen may ignore it. */
export interface Goal { type: "goal"; t: number; by: string; text: string }
export type ServerFrame = Snapshot | Tick | Spawn | Gone | Ev | Say | Think | Recap | Decide | Goal;

/** THE WATCH SOCKET's own frames (broadcast.ts), beside the world's:
 *  · `ka` every KEEPALIVE_MS to every watch socket, running, paused or off air (`t` = the server's
 *    wall clock, ms) — nothing for KEEPALIVE_MS × 2 means the socket is dead: reconnect;
 *  · `offair` when the show isn't running (on connect, and to everyone when it stops). */
export interface KeepAlive { type: "ka"; t: number }
export interface OffAir { type: "offair" }
/** THE HOLD (BUNKER.md 34/37): the AI engine dropped mid-show, the clock stopped; the screen shows "Technical
 *  difficulties" over the frozen frame until `on: false`. */
export interface Hold { type: "hold"; on: boolean }
/** THE COUNTDOWN (BUNKER.md 37): a real show's five minutes before the cold open — `ms` left (0 = it's over). */
export interface Countdown { type: "countdown"; ms: number }
export type WatchFrame = ServerFrame | KeepAlive | OffAir | Hold | Countdown;
/** what a screen is handed (the keepalive is the socket's own) */
export type ScreenFrame = ServerFrame | OffAir | Hold | Countdown;

/** WALK THE MAP (sim/player.ts; GLENRIDGE.md, "Walk the map"): a private run in which the admin drives ONE survivor
 *  by hand. The body's own state rides the ordinary frames (snap / tick / ev); these are the hands. They travel
 *  the same socket and are in neither union above: a screen that does not know them drops them.
 *
 *  UP, on /ws-survivorz, read only from an admin's own socket and only while a walk run is on (anything else a
 *  watcher sends is dropped, as ever):
 *  · `walk.in`  the push on the stick, in world coordinates (x east, z south), length 0..1 — longer is cut to 1, and
 *               under 0.1 is "stand". It stands until the next one. `crouch` creeps (0.8 m/s, silent), `run`
 *               sprints (5 m/s while there is breath for it, then a jog); otherwise a push longer than half is a jog
 *               (3.2 m/s) and a shorter one a walk (1.4 m/s) — the simulation's own gaits, pace and noise;
 *  · `walk.do`  do one of the `actions` the last `walk` frame listed, by its id;
 *  · `walk.hit` swing at (or, out of arm's reach with a loaded gun, shoot) the nearest of the dead, in front first;
 *  · `walk.stop` let go of whatever is in hand and stand.
 *  A NEW push, a blow or a stop lets go of a job that can be let go of (walking to a thing, the crank, a repair, a
 *  search); a bandage, a tin, a door half open are seen through first. The push that was already held when the
 *  action was picked is not a new one: the key may still be down. While a job is in hand the stick does not move
 *  the body. Walking into a shut door opens it; walking at a stair's foot climbs it. */
export interface WalkIn { type: "walk.in"; mx: number; mz: number; run?: boolean; crouch?: boolean }
export interface WalkDo { type: "walk.do"; id: string }
export interface WalkHit { type: "walk.hit" }
export interface WalkStop { type: "walk.stop" }
export type WalkCommand = WalkIn | WalkDo | WalkHit | WalkStop;
/** One thing the body can do from where it stands: the survivor's own menu, in reach. `id` is the menu's own
 *  ("loot:<spot>", "task:<what>", "crank:crank", "repair:radio-set", "call:radio-set", "rest:<bed>", "rest",
 *  "revive:<who>") or one of the hands' ("eat", "drink", "bandage", "medkit", "reload", "shut:<door>",
 *  "open:<door>", "link:<n>" a stair or ladder); `label` is plain words; `kind` is the part of the id before ":". */
export interface WalkAction { id: string; label: string; kind: string }
/** DOWN, to the admin's own sockets: after every snapshot, and whenever it changes (at most ~5 a second).
 *  `you` is the body's id ("s:<who>"). `busy`: what the hands are on, and how far along (0..1; 0 while still
 *  walking to it). `note`: a word for whoever is driving, sent once ("locked: it needs the butler's key"). */
export interface WalkFrame { type: "walk"; you: string; actions: WalkAction[]; busy?: { label: string; frac: number }; note?: string }
export const KEEPALIVE_MS = 5000;

/** The combat/body event names the sim emits (beyond the door/power ones doors.ts already makes).
 *  The client's sound cue table and ShowFx are keyed on these strings — keep them in step. */
// THESE ARE THE SOUND CUE TABLE'S OWN NAMES (client/src/survivorz/audio/cues.ts) — the sim speaks
// the cue vocabulary directly, so a screen hands an Ev to SoundEngine.cue() and ShowFx.event()
// with no translation table in between. Footsteps are never sent: the client makes them from
// pose + speed + the floor's surface.
export const BODY_EVENTS = [
  "melee.swing.light", "melee.swing.heavy",  // {by, weapon}
  "melee.hit", "melee.hit.head", "melee.stab", "melee.stomp", // {by, victim, weapon, part}
  "gun.pistol", "gun.rifle", "gun.shotgun",  // {by, victim?, part?, normal?} — a shot fired
  "gun.dry", "gun.reload.pistol", "gun.reload.rifle", "gun.reload.shell", // {by}
  "zombie.idle", "zombie.alert", "zombie.chase", "zombie.attack", "zombie.feed", // {by, victim?}
  "zombie.death",                            // {by(killer)?, victim(zombie), part}
  "experiment.idle", "experiment.alert",     // {by}
  "survivor.grabbed", "survivor.bitten", "survivor.hit", // {victim, by, dmg, part}
  "survivor.effort", "survivor.pain", "survivor.panic", "survivor.cough", // {by}
  "survivor.down", "survivor.dying", "survivor.dead", // {victim}
  "box.open", "eat.can", "sink.fill",        // {by}
  // THE RECORDS (goals.ts): {by, record, title, log?} — the client names the record on screen and plays the log
  "terminal.boot", "terminal.type", "paper", "recorder.play",
] as const;

/** Events the SIMULATION adds beyond the sound cues (src/survivorz/sim, 2026-10-27). A screen may
 *  ignore any of them; nothing about them needs a sound. Additive — the names above are unchanged.
 *   survivor.revived {victim, by}     an ally knelt and brought them back
 *   room.explored    {by, room}       the group set foot in a room for the first time
 *   item.found       {by, items[]}    what a search turned up (tables.ts Item names)
 *   keycard.found    {by, tier}       the group's card tier went up
 *   weapon.broke     {by, weapon}     a melee weapon wore out
 *   plan.zone        {zone, short}    the group decided to push into a new zone (short: food ran low) —
 *                                     RETIRED with the frontier timer (Oct 28 2026); the meeting layer may send it again
 *   zone.found       {by, zone, room} somebody set foot in a wing nobody had been in before — the group
 *                                     FOUND the way (a card, a vent); nothing hands them zones any more
 *   pipe.burst / thing.fell / zone.dip {at, room|zone}  the director's nudges (already in the fx vocabulary)
 *  Every door.* / safe.found / zone.powered event the sim sends carries the door's new DoorWire as
 *  `state` (so a screen keeps its doors current without a snapshot), plus `by` — who did it. Shots
 *  carry `to` (the target's position) beside `at` (the shooter's). Zombie attacks carry `lunge: true`
 *  for a runner's lunge; survivor.effort carries `shove` (the zombie shoved off) when it was a shove. */
//   zombie.arrived   {at, room, zone, n, kinds[], heard[]}  a small group of the dead came in through a vent, a
//                                     duct or a tunnel (the trickle, Oct 28 2026); `heard` = the survivors who
//                                     heard it happen (they're never in sight of it). Their bodies follow as spawn frames.
//   pack.worn        {by, pack, was?} a survivor put a backpack on (`was`: the one they took off for it)
//   item.left        {by, items[]}    what they found and had no room for — it stays where it was
// THE BUNKER (Nov 2026, goals.ts / world.ts):
//   crank.start / crank.stop {by}           somebody's hands on the blast door's wheel (and off it)
//   door.sealed {door, by}                   the blast door cranked shut — sealed for good (the alarm stops)
//   alarm.start / alarm.stop                 the breach alarm (red beacons, the PA) — it stops at the seal
//   bunker.clear {last?}                     the door sealed and not one of the dead left inside
//   note.read {by}                           the radio room's code learned off the note
//   part.found {by}                          the radio's missing part found
//   radio.static {by} / radio.fixed {by}     the repair under way (static draws the dead) / done
//   radio.call {by}                          the call for rescue made
//   zombie.rise {by}                         one of the dead lying on the floor gets up
//   door.keycard / keypad.ok / door.pushed   the armory opened with the card / the radio room's code keyed / the dead pushed a door open
//   show.over {ending, rescued[], dead[]}    the end: rescued · wiped · timeout
export const BUNKER_EVENTS = ["crank.start", "crank.stop", "door.sealed", "alarm.start", "alarm.stop", "bunker.clear", "note.read", "part.found",
  "radio.static", "radio.fixed", "radio.call", "zombie.rise", "door.keycard", "keypad.ok", "door.pushed", "show.over"] as const;
export const SIM_EVENTS = ["survivor.revived", "survivor.meet", "room.explored", "item.found", "keycard.found", "weapon.broke", "plan.zone", "zone.found", "zombie.arrived", "pack.worn", "item.left",
  // the goals (goals.ts): a skill learned {by, skill, level}; an ending reached
  "skill.up", "truth.found",
  // THE INFECTION (infection.ts): the group learns of it {victim, how}; a symptom shows {victim, stage}; an
  // antiviral or a dose goes in ("inject" is the cue's own name)
  "infection.known", "infection.stage", "inject", "survivor.turned",
  // a code keyed in (the morgue's drawer)
  "keypad.ok",
  // THE BREACH (world.facEv, Oct 31 2026): Containment powered = the specimen cells' lockdown gone {zone, by?}
  "containment.breach",
  // THE CURE (cure.ts): {by} / {by, doses} / {by, how} / {victim}
  "sample.taken", "sample.spoiled", "lazarus.start", "lazarus.done", "cure.proven", "survivor.cured",
  // ESCAPE (escape.ts): the group's decision {goers, presser}; one out {by, who} — the vault's own events
  // (route.mapped, vault.armed/count30/count10/countdown/open/shut) are the cues' names
  "escape.planned", "survivor.escaped", "show.over",
  // THE BENCH (world.newcomer): a newcomer put in a sealed room {victim, room}; they call out {by}; found {victim, by}
  "survivor.newcomer", "survivor.calls", "survivor.found", "route.mapped", "vault.armed", "vault.count30", "vault.count10", "vault.countdown", "vault.open", "vault.shut"] as const;

export const TICK_HZ = 10;
