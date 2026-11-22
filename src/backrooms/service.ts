// The Backrooms world service — the server-side authority for Sector A.
//
// Holds the frozen world in memory (regenerated at boot and VERIFIED against
// SECTOR_A_FINGERPRINT — a mismatch disables the backrooms rather than serve
// a reshuffled world), tracks live player sessions, validates movement, and
// serves geometry chunks. Positions are in CELL units (1 cell = 2m), floats.
//
// Design contracts in force here:
// - Doors, not instances: one shared world, hard cap 16 inside.
// - Chunk streaming is the map-secrecy rule (the pit.dice principle applied
//   to geometry): a client only ever receives chunks near its own position,
//   so unexplored map stays genuinely unknown even to a modded client.
// - The server is authoritative: speed caps and wall checks server-side;
//   violations snap the player back (a correction frame), never trust the
//   client's claimed position.

import {
  generateSector,
  sectorFingerprint,
  SECTOR_A,
  SECTOR_A_FINGERPRINT,
  WATER_NONE,
  type Sector,
} from "./worldgen";
import { planPoolsSector, SECTOR_P, SECTOR_P_FINGERPRINT, SWIM_DEPTH_STEPS } from "./worldgen-pools";
import { planLobbySector } from "./worldgen-lobby";
import type { TileDef } from "./tiles";
import { GATOR_MIN_CELLS, GATOR_MIN_DEPTH } from "./pools-vocab";
import { generatePipesSector, planPipesSector, SECTOR_D, SECTOR_D_FINGERPRINT } from "./worldgen-pipes";
import { planStationSector, SECTOR_S, SECTOR_S_FINGERPRINT } from "./worldgen-station";
import { SDECO, sdecoKind, SECTIONS } from "./station-vocab";
import { planOfficeSector, SECTOR_O, SECTOR_O_FINGERPRINT, officeLitCells } from "./worldgen-office";
import { ODECO, odecoKind, odecoVar, STAIRDOOR_NAME, OFFICE_SAFE_TYPES, BLINK_ZONES } from "./office-vocab";
import { planHotelSector, SECTOR_H, SECTOR_H_FINGERPRINT } from "./worldgen-hotel";
import { HDECO, hdecoKind, hdecoVar, HOTEL_SAFE_TYPES, ZONE_BOILER, RUSTYDOOR_NAME } from "./hotel-vocab";
import { planLightsSector, SECTOR_L, SECTOR_L_FINGERPRINT, lightsWet } from "./worldgen-lights";
import { LIGHTS_SAFE_TYPES, SEAHATCH_NAME } from "./lights-vocab";
import { planOceanSector, SECTOR_T, SECTOR_T_FINGERPRINT, oceanWet, oceanTypeAt } from "./worldgen-ocean";
import { OCEAN_SAFE_TYPES, SUBWAY_NAME, HELMET_NAME, HELMET_BREATH_MS, PLAZA_FLOOR, WATER_LEVEL, ZONE_DROP } from "./ocean-vocab";
import { planCaveSector, SECTOR_C, SECTOR_C_FINGERPRINT, caveWet, caveBurrow, caveCrawl } from "./worldgen-cave";
import { CAVE_SAFE_TYPES, CHIMNEY_NAME, ROPE_NAME } from "./cave-vocab";
import { planSuburbSector, SECTOR_U, SECTOR_U_FINGERPRINT, suburbIndoor, suburbSafe, suburbLitMap } from "./worldgen-suburb";
import { FRONT_DOOR_NAME, HOUSE_KEY_NAME, ZONE_OUT } from "./suburb-vocab";
import type { Store } from "../db/store";
import { beatFailed, heartbeat } from "../health";
import { RELICS, POOL_RELICS, PIPE_RELICS, STATION_RELICS, OFFICE_RELICS, HOTEL_RELICS, LIGHTS_RELICS, OCEAN_RELICS, CAVE_RELICS, SUBURB_RELICS_LIVE, relicBySlug, levelRelics, relicLevel } from "./relics";
import { pickRelicCell, whyNoCreature, whyUnplaceable } from "./placement";
import { SAFE_TYPES as PIPE_SAFE_TYPES } from "./pipes-vocab";
import { distanceMap, heightPassable, isPitCell, FLOOR_STEP, type Door } from "./worldgen";
import { LEVEL_DRIVES, driveById, driveSites, doorSite, keySite, fuseSites, LEVEL1_FLAG, LEVEL2_FLAG, LEVEL3_FLAG, FUSE_COUNT, FUSE_SITES, fuseFlag, LEVEL4_FLAG, BREAKER_COUNT, breakerFlag, STATION_OPEN_FLAG, LEVEL5_FLAG, OFFICE_OPEN_FLAG, LEVEL6_FLAG, HOTEL_OPEN_FLAG, LEVEL7_FLAG, LIGHTS_OPEN_FLAG, LEVEL8_FLAG, OCEAN_OPEN_FLAG, LEVEL9_FLAG, CAVE_OPEN_FLAG, LEVEL10_FLAG, SUBURBS_OPEN_FLAG } from "./lore";
import { wetFloor } from "./pools-vocab";
import { type MarkPlace, MAX_SPAWNED, CREATURE_USUAL } from "./marks";
import { type LookSpec, type CustomSurface, lookKey, findSurface } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { placeHint } from "./hints";
import { DIRECTOR, directorStep, newDirector, type DirectorAction, type DirectorPlayer } from "./director";
import { STAIR_NONE, stairKey, type StairSpec } from "./stairs";
import { gaitPush, gaitSpeed, gaitLastAt, GAIT_HEAR_MS, GAIT_SWIM_MS, GAIT_SPRINT_LINE, GAIT_WALK_LINE, GAIT_CROUCH_MAX, type GaitStep } from "./gait";

/** Which world a session is in: 0 Level 0 · 1 the Poolrooms · 2 Pipe Dreams ·
 *  3 the Electrical Station · 4 the Abandoned Office · 5 the Terror Hotel ·
 *  6 Lights Out · 7 Thalassophobia · 8 the Cave System · 9 the Suburbs. */
export type BrLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** THE CAVE SYSTEM's state as the wire and the maps see it: the Chimney and
 *  whether the rope is fixed in it. NOT here: where the Climbing Rope lies
 *  (streamed only to someone near it, like any key). */
/** THE SUBURBS' state as the wire and the maps see it: Number 9's front door
 *  and whether it is open. NOT here: where the House Key lies (streamed only
 *  to someone near it, like any key). */
export interface SuburbState {
  frontDoor: { x: number; y: number; side: number; open: boolean } | null;
}

export interface CaveState {
  chimney: { x: number; y: number; side: number; open: boolean } | null;
}

/** THALASSOPHOBIA's state as the wire and the maps see it: the subway stair at
 *  the bottom of the sunken plaza (a door is a door). NOT here: where the
 *  Diving Helmet lies (streamed only to someone near it, like any key). */
export interface OceanState {
  subway: { x: number; y: number; side: number; open: boolean } | null;
}

/** LIGHTS OUT's state as the wire and the maps see it: the stair and the sea
 *  hatch (unmarked on the wall, but a door is a door). NOT here: where the
 *  Handwheel lies (streamed only to someone near it, like any key). */
export interface LightsState {
  hatch: { x: number; y: number; side: number; open: boolean } | null;
}

/** THE TERROR HOTEL's state as the wire and the maps see it. Everything here
 *  is on the walls for anyone to see — the suites' number plates, the lifts,
 *  the furnaces, the rusty door. NOT here: which suite the register names
 *  (read at the register, `readRegister`) or where the Boiler Key hangs
 *  (shown only to whoever is standing in its room, `hotelKeyFor`). */
export interface HotelState {
  register: { x: number; y: number } | null;
  suites: { number: number; door: { x: number; y: number; side: number } }[];
  rustydoor: { x: number; y: number; side: number; open: boolean } | null;
  lifts: { x: number; y: number; side: number }[];
  furnaces: { x: number; y: number; side: number }[];
  /** Where the moths sleep (the dark rooms) — you can see the nests. */
  nests: { x: number; y: number }[];
}

/** THE ABANDONED OFFICE's state as the wire and the maps see it: where the
 *  security keycard lies (null = carried, or on a body), and the stairwell
 *  door with its badge reader. */
export interface OfficeState {
  keycard: { x: number; y: number } | null;
  stairdoor: { x: number; y: number; side: number; open: boolean } | null;
}

/** THE ELECTRICAL STATION's state as the wire and the maps see it. */
export interface StationState {
  /** One per section, in section order (1..6). */
  breakers: { section: number; x: number; y: number; side: number; on: boolean }[];
  cutoffs: { section: number; x: number; y: number; side: number }[];
  shutter: { x: number; y: number; side: number; open: boolean } | null;
  /** Per section (index = section - 1): has power now, and how long until a
   *  cut or a blackout ends (0 = none running). */
  power: { section: number; powered: boolean; cutMs: number; darkMs: number }[];
}
/** What the station tells the wire: a power change, a panel about to arc or
 *  arcing, a breaker thrown. */
export type StationEvent =
  | { type: "power"; power: StationState["power"] }
  | { type: "arc"; x: number; y: number; side: number; phase: "warn" | "fire" }
  | { type: "breaker"; section: number; by: string; on: number; total: number; opened: boolean };
import { propsInChunk, kitInChunk, kitChunkSignatures, forgetKitBuckets, type PropPlacement } from "./props";
import { randomInt } from "node:crypto";

/** Bodies per LEVEL (THE BACKROOMS LAWS, law 9 — Josh, Oct 2026: "stable and
 *  run well for up to 16 players per level"). It was 16 for the whole
 *  Backrooms. A frozen run (socket lost, still in its grace window) holds its
 *  place, because it can still come back. */
export const MAX_INSIDE = 16;
/** Everyone in a level's world right now, frozen runs included. */
const onLevel = (sessions: Map<number, BrSession>, level: BrLevel): number => {
  let n = 0;
  for (const q of sessions.values()) if (q.level === level) n++;
  return n;
};
// DISPLAY names (Josh's B3 renames) for A3's four doors — RETIRED with A3.
// ONE DOOR PER LEVEL since Sep 2026 ("Just put only one door per level for
// entering let's make it easy"): every level's door carries its own name
// (Level 0's is The Entrance), and nothing maps over it any more.
export const DOOR_NAMES_A3_RETIRED = ["Door Alpha", "Door Bravo", "Door Charlie", "Door Delta"];
const FOG_SIGHT = 5; // cells of reveal around a visited cell (walk-reachable)
const FOG_FLUSH_MS = Number(process.env.BACKROOMS_FOG_FLUSH_MS ?? 30_000);
export const CHUNK = 16; // cells per chunk side
const CHUNK_RADIUS = 4; // how far from the player chunks may be requested
const MAX_STEP_CELLS = 1.6; // per move message (anti-teleport)
const PLAYER_RADIUS = 0.22; // in cells (~0.44m) — used by clients for collision

export interface BrItem {
  id: number;
  kind: string;
  level: number;
  color: string | null;
}

export interface BrCorpseItem {
  kind: string;
  level: number;
  color: string | null;
}

/** A death, with the throw that made it (the ragdoll wire, Aug 2026).
 *  (x,y) is where they died, (rx,ry) the server-decided rest spot the body
 *  loots from; dir/power describe the killer's throw (power 0 = crumple);
 *  seed drives the identical client-side flail everywhere. */
export interface BrDeathEvent {
  userId: number;
  level: BrLevel;
  x: number;
  y: number;
  rx: number;
  ry: number;
  dir: number;
  power: number;
  seed: number;
  cause: string;
  suit: string;
  /** The victim's last wire heading — the ONE facing every client (victim
   *  included) seeds the ragdoll with, so the flail replays identically
   *  everywhere (one appearance, every observer). */
  h: number;
}

export interface BrSession {
  userId: number;
  name: string;
  x: number;
  y: number;
  heading: number;
  door: number;
  enteredAt: number;
  lastMoveAt: number;
  /** The last second of accepted move frames: how fast the body is going is
   *  read over these, never one frame (see gait.ts — Nov 2026 polish round). */
  gait?: GaitStep[];
  /** Cells THIS run newly put on the community map (the debrief number). */
  revealed: number;
  /** What they carried in (validated locker items; rows never leave the
   *  locker while alive — death is what transfers them, later). */
  inventory: BrItem[];
  /** Relic slugs picked up THIS run — cashed in at extraction. */
  relics: string[];
  /** Carrying THE KEY. Not an item: it never enters a locker, never banks,
   *  and can never be destroyed — it only moves between the world, a pair of
   *  hands, and a corpse. */
  hasKey: boolean;
  /** PIPE DREAMS' FUSES being carried (their numbers, 0..FUSE_COUNT-1). Like
   *  the key: no slot, never banked, home again if they leave or rot. */
  fuses?: number[];
  /** HEALTH, server-authoritative since v2 (it was client-only when the only
   *  way to die was the entity touching you, which the server judged). Falls
   *  have to be able to kill, so the number has to live here. */
  hp: number;
  /** THE HEAT (Level 5): 0..HEAT_MAX, climbing below stairs and falling in
   *  the Main Hall. Server-owned like hp; only the hotel reads it. */
  heat?: number;
  /** Camera rolling right now (client-reported, ownership-validated). */
  cam: boolean;
  /** Body pose for peers' avatars: 0 standing, 1 crouched, 2 airborne.
   *  Client-reported and purely COSMETIC — it drives which clip a peer's
   *  avatar plays, never collision or the entity's senses — so the server
   *  just clamps and relays it on the pos frames. */
  pose: number;
  /** Held equipment on the wire: "kind" or "kind!" while actively in use —
   *  validated against the inventory in net.ts, cosmetic for peers. */
  equip?: string;
  /** Look pitch (radians, clamped ±1.6) — cosmetic, peers aim the head. */
  pitch?: number;
  /** Emote id currently playing ("" = none) — validated against the fixed
   *  catalog in net.ts, cosmetic: peers play the dance on the avatar. */
  emote?: string;
  /** Closest LOS distance (cells) to the entity captured while rolling. */
  bestShot: number;
  /** When this player's socket died, or null while they're connected. The run
   *  does NOT end with the socket: the body stays in the world, frozen, for
   *  BACKROOMS_GRACE_MS. See markDisconnected. */
  lostAt: number | null;
  /** ADMIN FLYCAM — a noclip ghost for inspecting the world (see setFly). Only
   *  ever set for a verified admin, and it makes the session INERT: no fog is
   *  charted, no fall is judged, the entity can't see or hear them, and other
   *  players don't get their position. An observer who changed the world (or
   *  the community map) wouldn't be observing it. */
  fly: boolean;
  /** Which world this body is standing in: 0 = Level 0, 1 = THE POOLROOMS.
   *  Everything positional (fan-out, chunks, movement, pickups) is scoped by
   *  it — two players on different levels do not exist to each other. */
  level: BrLevel;
  /** DROWNING (Poolrooms v3): when the client reported this head slipping
   *  under the waterline (only ever accepted in swim-deep cells), or null
   *  while breathing. 10 seconds under = the deep keeps them. */
  subSince: number | null;
  /** THE BOATS (Poolrooms v3.1): the boat this body is riding, or null.
   *  The boat row knows whether they hold the oars or just the gunwale. */
  boatId: number | null;
  /** A FALL IN PROGRESS (Josh: "the damage hits before I land"). Drops are
   *  measured as cells are crossed but SETTLED on touchdown: `from` is the
   *  floor height the fall started at and `since` when it started. The
   *  client's pose says when the feet are back down; the timeout is what
   *  stops a liar from hanging in the air to dodge the landing. */
  fall: { from: number; since: number } | null;
}

/** A rowboat on the Poolrooms' waterways. In-memory (docks reset on boot,
 *  like blackjack tables); the CAPTAIN's move frames steer it — the boat is
 *  a movement MODE, so anti-teleport, walls and fog reveal all just work. */
export interface BrBoat {
  id: number;
  x: number;
  y: number;
  h: number;
  captain: number | null;
  passenger: number | null;
}

/** THE DEAD, WATCHING (THE BACKROOMS LAWS, law 12 — Josh, Oct 2026). A
 *  player who dies on a level with somebody still alive on it stays on the
 *  wire as a spectator of one of them: Q/E cycles, the mouse orbits the
 *  camera, and push-to-talk spends a 15-second budget (refilled every five
 *  minutes) to speak to the one they watch, as a ghost. The registry lives
 *  here so the voice route can see it; the wire (net.ts) runs it. */
export interface Spectator {
  userId: number;
  name: string;
  level: BrLevel;
  /** Who they watch (a live session's userId). */
  targetId: number;
  /** Talk time left this five minutes, ms — as of `talkingSince` when talking. */
  talkLeftMs: number;
  /** When the budget refills to full. */
  refillAt: number;
  /** When the current push-to-talk began (0 = not talking). */
  talkingSince: number;
  /** The spectator camera's yaw round its target (the ghost's direction). */
  camYaw: number;
  /** The ghost key is down (a grant may still be on its way from the SFU). */
  wantTalk?: boolean;
  /** A grant to publish is in flight (ghostvoice.ts). */
  granting?: boolean;
}

/** THE STALKER's wire events (see the stalker block in createBackrooms). */
export type StalkerEvent =
  /** `burn`: a flashlight beam is on it right now and it has not broken yet
   *  (the client plays the burning). */
  | { type: "pos"; x: number; y: number; mode: "shadow" | "hunt" | "flee"; burn?: boolean }
  | { type: "mimic"; of: number; x: number; y: number }
  | { type: "kill"; x: number; y: number; userId: number };

/** THE SHY GUY's wire (the Poolrooms' creature — see the shy block below).
 *  `targetId` is who it is fixed on, so that client can be told the scream
 *  is for them. */
export type ShyEvent =
  | { type: "pos"; x: number; y: number; mode: "lurk" | "trigger" | "chase" | "flee" | "leave"; targetId: number }
  | { type: "gone" }
  | { type: "kill"; x: number; y: number; userId: number };

/** THE GRABBER's wire (Level 2 — see the grabber block). `grab` is the hold
 *  (the victim's camera turns to face it); `screech` the light in its face. */
export type GrabberEvent =
  | { type: "pos"; x: number; y: number; h: number; mode: "stalk" | "grab" | "flee"; targetId: number }
  | { type: "screech"; x: number; y: number }
  | { type: "grab"; x: number; y: number; targetId: number }
  | { type: "gone" }
  | { type: "kill"; x: number; y: number; userId: number };

/** THE BLEEDER's wire (Level 3 — see the bleeder block). It exists only in a
 *  section with no power; `gone` is it withdrawing into the wiring.
 *  `burn`: a held beam is on it right now. `targetId` is who it is after. */
export type BleederEvent =
  | { type: "pos"; x: number; y: number; h: number; mode: "hunt" | "scream" | "chase" | "feed" | "retreat"; burn?: boolean; targetId: number }
  | { type: "scream"; x: number; y: number; targetId: number }
  | { type: "retreat"; x: number; y: number }
  | { type: "gone" }
  | { type: "kill"; x: number; y: number; userId: number };

/** THE TEMP's wire (Level 4). `pose` is which frozen pose it stands in (it is
 *  a mannequin: it never walks, it is only ever somewhere new); `moving` is
 *  whether it is moving right now (nobody is looking). A FREEZE is the moment
 *  it stops because somebody looked — the creak. A BLINK is a zone of
 *  troffers dipping, the same for everyone. */
export type TempEvent =
  | { type: "pos"; x: number; y: number; h: number; pose: number; moving: boolean }
  | { type: "freeze"; x: number; y: number; pose: number }
  | { type: "gone" }
  | { type: "kill"; x: number; y: number; userId: number }
  | { type: "blink"; zone: number; ms: number };

/** THE DEATHMOTHS' wire (Level 5): a swarm's position and mood while it is
 *  awake, the moment it wakes (the flutter), circles the chandelier, goes back
 *  to sleep on its nest, or kills. */
export type MothEvent =
  | { type: "pos"; id: number; x: number; y: number; mode: string }
  | { type: "wake"; id: number; x: number; y: number }
  | { type: "circle"; id: number; x: number; y: number }
  | { type: "sleep"; id: number; x: number; y: number }
  | { type: "kill"; id: number; x: number; y: number; userId: number };

/** THE LISTENER's wire (Level 6): where it is and what it's doing, the
 *  touch (only the touched player gets the cold hand; everyone near hears the
 *  whisper), a kill, and leaving the level when it empties. */
export type ListenerEvent =
  | { type: "pos"; id: number; x: number; y: number; mode: string }
  | { type: "touch"; id: number; x: number; y: number; userId: number }
  | { type: "kill"; id: number; x: number; y: number; userId: number }
  | { type: "gone"; id: number };

/** THE THING BELOW's wire (Level 7). It is never SEEN — it is a body of
 *  water that notices you. `stage` is what one swimmer's exposure has grown
 *  to (1 the shadow passes under, 2 it circles, 3 it is rising); it goes to
 *  that swimmer and to anyone near enough to watch the water. A strike is a
 *  kill and rides the hurt wire; `calm` is it sinking away from someone who
 *  got out of the water in time. */
/** THE BURROWER's wire (Level 8): where each one is and what it's doing (the
 *  client clicks in the rock from it — the clicking IS the warning), a kill,
 *  and its going when the level empties. */
export type BurrowerEvent =
  | { type: "pos"; id: number; x: number; y: number; mode: string }
  | { type: "kill"; id: number; x: number; y: number; userId: number }
  | { type: "bite"; id: number; x: number; y: number; userId: number }
  | { type: "gone"; id: number };

/** THE NEIGHBORHOOD WATCH's wire (Level 9): where it is and what it's doing
 *  (the client whistles from it — the whistle IS the warning), a knock at a
 *  door, a kill, and its going when the streets empty. */
export type WatchEvent =
  | { type: "pos"; id: number; x: number; y: number; h: number; mode: string }
  | { type: "knock"; id: number; x: number; y: number }
  | { type: "kill"; id: number; x: number; y: number; userId: number }
  | { type: "gone"; id: number };

export type DeepEvent =
  | { type: "stage"; userId: number; stage: number; x: number; y: number }
  | { type: "calm"; userId: number; x: number; y: number }
  | { type: "strike"; userId: number; x: number; y: number };

/** THE ALLIGATORS' wire (one per large body of water — see the gator block).
 *  `h` is the heading the SERVER steers by: the mouth is the weapon and its
 *  position is computed from this, so the client renders the same facing and
 *  the bite you see is the bite that landed. Deaths ride the normal hurt
 *  pipeline (cause "an alligator") — no kill event of their own. */
export type GatorEvent =
  | { type: "pos"; id: number; x: number; y: number; h: number; mode: "idle" | "chase" }
  | { type: "bite"; id: number; x: number; y: number };

export interface EntityEvent {
  type: "pos" | "kill";
  /** Which creature (there are TWO now — they patrol relics and swap). */
  id: number;
  x: number;
  y: number;
  mode?: "wander" | "chase";
  userId?: number;
  /** The level it walks (0 unless it came from a map editor spawner). */
  level?: BrLevel;
}

// ---- FALLING (v2) ----------------------------------------------------------
// A step is free. Anything past a safe drop hurts, quadratically-ish, and a
// shaft is deep enough that no amount of health survives it. Tuned so:
//   · 1 step (0.5m)          — nothing.
//   · 2–3 steps (1–1.5m)     — a scrape, 8–20.
//   · 5 steps (2.5m)         — 44, a bad landing.
//   · 7 steps (3.5m)         — 80, nearly fatal.
//   · 9+ steps (4.5m+)       — dead. PIT_LETHAL is set to exactly this.
const FALL_FREE = 1; // steps you can drop for free
const FALL_PER = 6.5; // damage per step past the free one, before the curve
export function fallDamage(steps: number): number {
  const over = steps - FALL_FREE;
  if (over <= 0) return 0;
  // 2→8 · 3→17 · 5→43 · 7→76 · 9→118 (dead) · a shaft (11+)→169+
  return Math.round(FALL_PER * over * (1 + over * 0.16));
}

export interface BackroomsService {
  /** LEVEL 0 — THE LOBBY — built from hand-drawn rooms since Sep 2026 and
   *  SWAPPABLE like Levels 1 and 2: read these through the service every time. */
  readonly enabled: boolean;
  readonly sector: Sector;
  /** THE POOLROOMS (Level 1) and PIPE DREAMS (Level 2) are built from
   *  hand-drawn rooms and SWAPPABLE: the map editor's publish replaces them in
   *  place, so read them through the service every time, never cache them. */
  readonly sectorP: Sector;
  readonly enabledP: boolean;
  readonly sectorD: Sector;
  readonly enabledD: boolean;
  /** THE ELECTRICAL STATION (Level 3) — swappable like the others. */
  readonly sectorS: Sector;
  readonly enabledS: boolean;
  /** THE ABANDONED OFFICE (Level 4) — swappable like the others. */
  readonly sectorO: Sector;
  readonly enabledO: boolean;
  /** THE TERROR HOTEL (Level 5) — swappable like the others. */
  readonly sectorH: Sector;
  readonly enabledH: boolean;
  /** LIGHTS OUT (Level 6) — swappable like the others. */
  readonly sectorL: Sector;
  readonly enabledL: boolean;
  /** THALASSOPHOBIA (Level 7) — swappable like the others. */
  readonly sectorT: Sector;
  readonly enabledT: boolean;
  /** THE CAVE SYSTEM (Level 8) — swappable like the others. */
  readonly sectorC: Sector;
  readonly enabledC: boolean;
  /** THE SUBURBS (Level 9) — swappable like the others. */
  readonly sectorU: Sector;
  readonly enabledU: boolean;
  /** The sector id each level plays under right now (Levels 1 and 2 change
   *  with every published version). */
  sectorIdOf(level: BrLevel): string;
  /** THE MAP EDITOR's publish: a level moves onto a new map, in place.
   *  Refused while anybody is connected down there; frozen runs are voided
   *  (the same rule the map reset keeps). */
  swapMap(level: BrLevel, sector: Sector, sectorId: string): { ok: true; voided: number } | { error: "players_inside" };
  /** A publish that changes only DRESSING — props and looks, neither of
   *  which is in the map's fingerprint: the level keeps its sector id, fog,
   *  paint, bodies, relics and doors, and only the kit list and the look
   *  layer are replaced. Allowed with people inside — the chunks that
   *  changed go back out to anybody near them (onKitSwap). Returns those
   *  chunks. */
  swapDressing(level: BrLevel, next: Pick<Sector, "kit" | "look" | "styles" | "marks" | "lid" | "stair" | "stairStyle" | "stairSpecs">): { cx: number; cy: number }[];
  /** PLAY THE DRAFT (the map editor's Test play): the level plays `next` for
   *  this admin alone, under a throwaway sector id, until endTest. Refused
   *  while anybody — connected or frozen — is on the level. Nothing a test
   *  run does is kept: no death, no body, no lost gear, no relic, drive or
   *  key banked. */
  beginTest(level: BrLevel, next: Sector, by: number): { ok: true; sectorId: string } | { error: string; inside?: number };
  /** Put the level back exactly as it was (its map, bodies, loose items and
   *  relics). Whoever is still inside the test is sent out. */
  endTest(level: BrLevel): { ok: true; sent: number[] } | { error: string };
  /** Is this level being test-played, and by whom. */
  testOf(level: BrLevel): { by: number; since: number; sectorId: string } | null;
  /** Told whoever a test's end sent out (net shows them the way out). */
  onTestEnd(cb: (level: BrLevel, userIds: number[]) => void): void;
  onKitSwap(cb: (level: BrLevel, chunks: { cx: number; cy: number }[]) => void): void;
  /** Is anybody connected on this level right now? */
  playersOn(level: BrLevel): number;
  sessions: Map<number, BrSession>;
  /** Law 12: the dead, watching the living (see Spectator). */
  spectators: Map<number, Spectator>;
  /** Who a spectator may watch on a level: alive, connected, on foot. */
  aliveOn(level: BrLevel): BrSession[];
  /** Step through THE DOOR (Level 0 → 1) or back through The Landing (1 → 0).
   *  Validated: you must be standing at the passage, and the door must have
   *  been opened (the key's one job, or the admin lever). */
  travel(userId: number): { level: BrLevel; x: number; y: number } | { error: string };
  /** Start THE ENTITY's brain; events stream to the callback (net relays). */
  startEntity(cb: (ev: EntityEvent) => void): void;
  /** THE STALKER's wire — pos/mimic/kill events (net relays). */
  onStalker(cb: (ev: StalkerEvent) => void): void;
  /** THE SHY GUY's wire — the Poolrooms' creature (net relays). */
  onShy(cb: (ev: ShyEvent) => void): void;
  /** THE BLEEDER (Level 3). */
  onBleeder(cb: (ev: BleederEvent) => void): void;
  /** THE GRABBER (Level 2). */
  onGrabber(cb: (ev: GrabberEvent) => void): void;
  /** Admin playtest: send it to you now, behind you. */
  summonGrabber(userId: number): boolean;
  /** Admin playtest: bring it out next to you, lit section or not. */
  summonBleeder(userId: number): boolean;
  /** THE TEMP (Level 4) — its pos / freeze / kill / gone, and the troffers' dips. */
  onTemp(cb: (ev: TempEvent) => void): void;
  /** Admin playtest: put it round the nearest corner from you, now. */
  summonTemp(userId: number): boolean;
  /** The client's crosshair landed on it. A REQUEST, not a fact: range, line
   *  and facing are all re-checked server-side before it takes offence. */
  shyLook(userId: number): void;
  /** ADMIN playtest: force it to appear near this player right now. */
  summonShy(userId: number): boolean;
  /** THE ALLIGATORS' wire — pos/bite events (net relays). */
  onGator(cb: (ev: GatorEvent) => void): void;
  /** A noise stimulus at a position (walkie TX etc.) the entity may hear. */
  entityHears(x: number, y: number, rangeCells: number, level?: BrLevel): void;
  /** THE BROWNOUTS (July 2026 lighting pass) — every so often the sector's
   *  power sags for a dozen-odd seconds. Server-called so every player
   *  watches the same lights die together; purely atmospheric — no rules
   *  change while the dark lasts (the client animates the flutter). */
  onBrownout(cb: (ms: number, black: boolean) => void): void;
  /** Remaining ms of an active brownout (0 = lights are fine) — rides the
   *  welcome frame so late joiners walk into the same darkness. */
  brownoutRemaining(): number;
  /** Whether the active (or last) event is a full BLACKOUT. */
  brownoutBlack(): boolean;
  /** Fire one now (admin playtest lever). Returns the length used. */
  triggerBrownout(ms?: number, black?: boolean): number;
  /** Active relic sites. Since THE BACKROOMS LAWS (law 4, Oct 2026) a site
   *  is ANONYMOUS: which relic it is gets rolled at pickup from what that
   *  player is still missing. The wire names none (net.ts `veil`) and tells
   *  each viewer instead whether one is still new to them — which keeps
   *  round 3's point (you can tell from across the room whether it is worth
   *  the walk). `relicId`/`name` here are a placeholder, server-side only. */
  activeRelics(): { id: number; x: number; y: number; relicId: string; name: string; lvl: BrLevel }[];
  /** LAW 4: how many of a level's relics this player has still to find
   *  (banked or carried this run count as found). 0 = they have them all,
   *  and only then does a relic come twice. */
  relicsLeft(userId: number, level: BrLevel): number;
  /** DR. VOSS'S RESEARCH (hints.ts): vague directions to a relic this player
   *  is still missing and to unread lore drives, on levels a member can walk
   *  into. Read only into a trusted surveyor's DM with Voss. */
  researchHints(userId: number): string[];
  /** THE RULES DIRECTOR (director.ts): its phase, each Level 0 player's
   *  tension and its recent decisions — for the admin and the harness. */
  directorState(): { on: boolean; phase: string; tension: { id: number; t: number }[]; log: { at: number; text: string }[] };
  /** One director tick at a given clock (the harness drives it). */
  directorTick(now: number): { kind: string }[];
  /** Fallen players' bodies — findable, lootable, and gone after 24 HOURS.
   *  Locations are NEVER on the lobby map: a body only appears on the wire once
   *  someone is within 50m of it, so recovery runs on memory (Josh, July 2026).
   *  `suit` is the color the body is still wearing (unless someone looted
   *  it — then the corpse renders in the default yellow). */
  activeCorpses(): { id: number; x: number; y: number; name: string; suit: string; lvl: BrLevel }[];
  /** Items dropped on the carpet (G) — one-hour rot, unlike bodies. */
  activeDrops(): {
    id: number; x: number; y: number; kind: string; level: number; color: string | null; charge: number | null; lvl: BrLevel;
  }[];
  /** Drop a carried item where you stand (the locker row travels with it).
   *  `charge` is the client's remaining battery/paint/tape seconds, carried
   *  on the drop so re-picking it up isn't a free recharge. */
  dropItem(userId: number, itemId: number, charge: number | null): { id: number; kind: string } | { error: string };
  /** Pick a dropped item back up (distance + capacity validated). */
  takeDrop(userId: number, dropId: number): { item: BrItem; charge: number | null } | { error: string };
  /** Lore drives still out there (found ones are gone forever). */
  activeDrives(level?: BrLevel): { id: string; x: number; y: number }[];
  /** Pick up a drive — unlocks it for the WHOLE platform, permanently. */
  takeDrive(userId: number, name: string, id: string):
    | { driveId: string; title: string; file: string; body: string; ada: string; fresh: boolean }
    | { error: string };
  /** THE DOOR and THE KEY. The door is a fixed landmark; the key is one
   *  object in the world that can never be lost. */
  doorPos(): { x: number; y: number };
  /** Where a level's key is, if it's lying somewhere findable (null = someone
   *  is carrying it, or it's on a body). Level 0 by default; Level 1 has one
   *  too, for the drain hatch down to Pipe Dreams. */
  keyPos(level?: BrLevel): { x: number; y: number } | null;
  keyCarrier(level?: BrLevel): number | null;
  /** THE DRAIN HATCH in the Poolrooms' floor: Level 1's door, down to Pipe
   *  Dreams. Opened with Level 1's key; sets LEVEL2_FLAG for everyone. */
  hatchPos(): { x: number; y: number } | null;
  /** PIPE DREAMS' FUSES: the ones lying where somebody could pick them up. */
  fuseSitesOpen(): { i: number; x: number; y: number }[];
  /** The fuse box beside the pressure door, and how many fuses are in. */
  fuseBox(): { x: number; y: number; door: { x: number; y: number } | null; inserted: number; total: number; open: boolean } | null;
  takeFuse(userId: number, i: number): { ok: true; carrying: number } | { error: string };
  /** Put every carried fuse in the box (standing at it). All three in opens
   *  the pressure door for everyone, once — LEVEL3_FLAG. */
  insertFuses(userId: number, name: string): { inserted: number; added: number; opened: boolean } | { error: string };
  level3(): { name: string | null; at: number } | null;
  /** THE ELECTRICAL STATION: its breakers, cutoffs, shutter and power. */
  stationState(): StationState | null;
  /** Throw a section's breaker (standing at it). Thrown once, thrown forever;
   *  all six power the lift shutter — LEVEL4_FLAG. A TEST run's throws are
   *  kept for that test only. */
  throwBreaker(userId: number, name: string, section: number): { on: number; total: number; opened: boolean; fresh: boolean } | { error: string };
  /** Pull a section's cutoff (standing at it): the section loses power for
   *  STATION_CUTOFF_MS — its lights go dark and its water goes safe. */
  pullCutoff(userId: number, section: number): { ms: number } | { error: string };
  onStation(cb: (ev: StationEvent) => void): void;
  /** Is Level 4's way open (all six breakers on)? */
  level4(): { name: string | null; at: number } | null;
  /** THE SHIP GATE's switch: may members walk into the station? */
  stationOpen(): boolean;
  /** The admin's lever for it (after Test play). */
  setStationOpen(open: boolean, by: string): void;
  /** THE ABANDONED OFFICE: the keycard and the stairwell door. */
  officeState(): OfficeState | null;
  /** Is Level 5's way open (the keycard badged at the stairwell door)? */
  level5(): { name: string | null; at: number } | null;
  /** THE SHIP GATE's switch for the office: may members walk in? */
  officeOpen(): boolean;
  setOfficeOpen(open: boolean, by: string): void;
  /** THE TERROR HOTEL: the register, the suites' doors, the lifts, the rusty door. */
  hotelState(): HotelState | null;
  /** Is Level 6's way open (the Boiler Key turned in the rusty door)? */
  level6(): { name: string | null; at: number } | null;
  /** THE SHIP GATE's switch for the hotel: may members walk in? */
  hotelOpen(): boolean;
  setHotelOpen(open: boolean, by: string): void;
  /** Read the guest register: the suite it names. Only standing at it. */
  readRegister(userId: number): { number: number } | { error: string };
  /** Where the Boiler Key hangs — only to someone standing in its room. */
  hotelKeyFor(userId: number): { x: number; y: number } | null;
  /** Ride a lift: floors 1-12 come out at another lift on this floor; 13 and
   *  up, the doors close and never open again. */
  rideLift(userId: number, floor: number): { x: number; y: number; floor: number } | { dead: true } | { error: string };
  /** A player's heat changed (only theirs is ever sent to them). */
  onHeat(cb: (ev: { userId: number; heat: number }) => void): void;
  /** THE DEATHMOTHS (Level 5). */
  onMoths(cb: (ev: MothEvent) => void): void;
  /** Admin playtest: wake the nearest swarm and send it at you. */
  summonMoths(userId: number): boolean;
  /** LIGHTS OUT: the sea hatch. */
  lightsState(): LightsState | null;
  /** THE LISTENER (Level 6): its wire. */
  onListener(cb: (ev: ListenerEvent) => void): void;
  /** A noise on Level 6 the Listener may hear (cells, before walls halve it). */
  listenerHears(x: number, y: number, range: number, from?: number): void;
  /** Admin playtest: send the Listener to you. */
  summonListener(userId: number): boolean;
  /** HARNESS ONLY (no route reaches it): stand the Listener at (x,y),
   *  listening, so a behaviour can be staged from a known place. */
  debugParkListener(x: number, y: number): boolean;
  /** HARNESS ONLY: the Listeners as they are, with whom they last touched. */
  debugListeners(): { id: number; x: number; y: number; mode: string; knowId: number }[];
  /** Is Level 7's way open (the Handwheel fitted to the sea hatch)? */
  level7(): { name: string | null; at: number } | null;
  /** THE SHIP GATE's switch for Lights Out: may members walk in? */
  lightsOpen(): boolean;
  setLightsOpen(open: boolean, by: string): void;
  /** THALASSOPHOBIA: the subway stair. */
  oceanState(): OceanState | null;
  /** Is Level 8's way open (the helmet worn down to the subway stair)? */
  level8(): { name: string | null; at: number } | null;
  /** THE SHIP GATE's switch for Thalassophobia: may members swim in? */
  oceanOpen(): boolean;
  setOceanOpen(open: boolean, by: string): void;
  /** THE THING BELOW (Level 7): its wire. */
  onDeep(cb: (ev: DeepEvent) => void): void;
  /** Admin playtest: let it rise on you (you must be in the water). */
  summonDeep(userId: number): boolean;
  /** HARNESS ONLY: every swimmer's exposure and what the thing is doing. */
  debugDeep(): {
    dials: { drop: number; plaza: number; splash: number; dry: number; street: number; stages: readonly number[]; riseMs: number; missed: number; splashSpeed: number };
    swimmers: { userId: number; exposure: number; stage: number; risingUntil: number }[];
  };
  /** THE CAVE SYSTEM: the Chimney. */
  caveState(): CaveState | null;
  /** Is Level 9's way open (the rope fixed at the Chimney's foot)? */
  level9(): { name: string | null; at: number } | null;
  /** THE SHIP GATE's switch for the Cave System: may members go down? */
  caveOpen(): boolean;
  setCaveOpen(open: boolean, by: string): void;
  /** THE BURROWER (Level 8): its wire. */
  onBurrower(cb: (ev: BurrowerEvent) => void): void;
  /** A noise on Level 8 the Burrowers may hear (cells, before rock halves it). */
  burrowerHears(x: number, y: number, range: number, from?: number): void;
  /** Admin playtest: send the nearest Burrower at you (you must be in its passages). */
  summonBurrower(userId: number): boolean;
  /** HARNESS ONLY (no route reaches it): stand a Burrower at (x,y), roaming. */
  debugParkBurrower(x: number, y: number): boolean;
  /** HARNESS ONLY: the Burrowers as they are, and the dials. */
  /** THE SUBURBS: Number 9's front door. */
  suburbState(): SuburbState | null;
  /** Is the way out open (the House Key turned in Number 9's door)? */
  level10(): { name: string | null; at: number } | null;
  /** THE SHIP GATE's switch for the Suburbs: may members climb up? */
  suburbsOpen(): boolean;
  setSuburbsOpen(open: boolean, by: string): void;
  /** THE NEIGHBORHOOD WATCH (Level 9): its wire. */
  onWatch(cb: (ev: WatchEvent) => void): void;
  /** Admin playtest: send the Watch at you (you must be outdoors, in the dark). */
  summonWatch(userId: number): boolean;
  /** HARNESS ONLY (no route reaches it): stand the Watch at (x,y), patrolling. */
  debugParkWatch(x: number, y: number): boolean;
  /** HARNESS ONLY: the Watch as it is, the dials, and the light. */
  debugWatch(): { dials: { patrol: number; hunt: number; sight: number; touch: number; reach: number; loseMs: number; edgeMs: number; doorMs: number; knockMs: number; spareMs: number }; watchers: { id: number; x: number; y: number; mode: string; targetId: number }[]; lit: Uint8Array };
  debugBurrowers(): { dials: { roam: number; crawl: number; passage: number; touch: number; loseMs: number; quietMs: number; hear: Record<string, number> }; burrowers: { id: number; x: number; y: number; mode: string; heardId: number; heardAt: number }[] };
  takeKey(userId: number): { ok: true } | { error: string };
  /** Try the door: needs the key in hand. Unlocks Level 1 for everyone, once. */
  openDoor(userId: number, name: string): { fresh: boolean } | { error: string };
  level1(): { name: string | null; at: number } | null;
  /** Give up: the run ends like a death — body, ledger entry, the works. */
  forfeit(userId: number): boolean;
  /** The socket died. The run does NOT end: the body stays where it stands,
   *  frozen and helpless, for BACKROOMS_GRACE_MS. Reconnect inside that window
   *  (enter() resumes) and nothing was lost; miss it and it is a forfeit —
   *  death, body, loot on the floor. That asymmetry is the whole design: a
   *  refresh or a crash costs nothing, while closing the app to escape a
   *  chase leaves you standing still in front of whatever was chasing you. */
  markDisconnected(userId: number): void;
  /** ADMIN FLYCAM on/off. Verifies the admin flag against the DB ITSELF rather
   *  than trusting the caller — this is the one switch that turns off every
   *  movement rule, so it does not take anyone's word for who you are.
   *  Returns the speed-agnostic state; the client owns flight speed. */
  setFly(userId: number, on: boolean): { fly: boolean } | { error: string };
  /** ADMIN: wipe the sector's world history (fog, paint, bodies, drops). */
  /** ADMIN: wipe the sector's world history. `deep` also erases community
   *  PROGRESS — relic collections, the lore archive and THE DOOR — so the
   *  discovery loop can be tested from nothing. Gear, RC and lockers are never
   *  touched either way. */
  resetWorld(deep?: boolean): { fog: number; marks: number; corpses: number; drops: number; deaths: number; relics: number; drives: number; flags: number } | { error: string };
  lootView(userId: number, corpseId: number): { name: string; items: BrCorpseItem[] } | { error: string };
  lootTake(userId: number, corpseId: number, idx: number): { item: BrCorpseItem & { id?: number }; remaining: BrCorpseItem[] } | { error: string };
  /** Playtest tools (admin-only routes): immortality, entity summoning,
   *  and the debug overlay for the section map. */
  setImmortal(userId: number, on: boolean): void;
  summonEntity(nearUserId: number): boolean;
  /** Arm a summon for the NEXT door entry — it spawns ~10m away and comes. */
  armSummon(userId: number): void;
  /** THE OPERATOR VIEW (admin, Oct 2026 — Josh: "as the admin i am able to
   *  fly in every map and see all monster, relics, objectives, and hard
   *  drives"): one level's whole hunt in one uniform shape — every monster,
   *  every relic lying out, every drive still out there, and every objective
   *  with its state. Positions only (a drive's text and a relic's identity
   *  are still earned by walking to them). Feeds both maps and the flying
   *  admin's in-game overlay. Admin-only callers. */
  operatorView(level: BrLevel): OperatorView;
  debugState(): {
    /** home: its relic post · resting: standing over a kill · heard: a noise
     *  it is going to (harness eyes only). */
    entities: { id: number; x: number; y: number; mode: string; home: { x: number; y: number } | null; resting: boolean; heard: boolean }[];
    /** Entities from the map editor's spawners, every level (marks.ts). */
    spawned: { id: number; level: BrLevel; x: number; y: number; mode: string }[];
    stalker: { x: number; y: number; mode: string; targetId: number } | null;
    shy: { x: number; y: number; mode: string; targetId: number; pathLen: number; noRouteSince: number; repaths: number; partials: number } | null;
    bleeder: { x: number; y: number; mode: string; targetId: number; burn: number } | null;
    grabber: { x: number; y: number; mode: string; targetId: number } | null;
    temp: { x: number; y: number; pose: number; moving: boolean; standing: boolean; targetId: number } | null;
    gators: { id: number; x: number; y: number; h: number; mode: string; targetId: number; region: number }[];
    relics: { x: number; y: number; name: string }[];
    relicsP: { x: number; y: number; name: string }[];
    relicsD: { x: number; y: number; name: string }[];
    drives: { id: string; x: number; y: number }[];
    door: { x: number; y: number; open: boolean };
    key: { x: number; y: number; held: boolean };
  };
  /** Try to collect a relic; validates distance + a free slot. */
  takeRelic(userId: number, id: number): { relicId: string; name: string; test?: boolean } | { error: string };
  /** `level` 1 = enter THE POOLROOMS directly (requires THE DOOR open):
   *  spawns at the pools door of that index. Level 0 is the lobby default. */
  enter(userId: number, name: string, door: number, loadout: number[], level?: BrLevel): BrSession | { error: string };
  leave(userId: number): BrSession | null;
  /** THE only in-game way out (Josh's rule): walk back into your entry
   *  door's marked wall. Validated server-side — you must actually be at
   *  the door. Returns the debrief facts and ends the session. */
  exit(userId: number): {
    x: number;
    y: number;
    revealed: number;
    ms: number;
    relics: { relicId: string; name: string; fresh: boolean }[];
    footage: string | null;
    /** a Test play run — nothing it carried was kept */
    test?: boolean;
    /** out through Number 9's front door: the end of the descent */
    home?: boolean;
  } | { error: string };
  /** Camera rolling state (ownership validated by the caller). */
  setCam(userId: number, on: boolean): void;
  /** Consume a carried single-use item (pills/battery/almond water):
   *  removes it from the run AND deletes the locker row. */
  consumeItem(userId: number, itemId: number): { kind: string; hp: number } | { error: string };
  /** Validate + apply a movement claim; returns the (possibly corrected)
   *  position, whether a correction is needed, and whether that move just
   *  killed them (a fall). */
  move(
    userId: number,
    x: number,
    y: number,
    heading: number,
  ): { x: number; y: number; corrected: boolean; dead?: boolean } | null;
  /** Health changes the client didn't cause (falls) stream through here. */
  onHurt(cb: (ev: { userId: number; hp: number; drop: number; dead: boolean; cause?: string; x?: number; y?: number; level?: BrLevel }) => void): void;
  /** THE RAGDOLL WIRE (Aug 2026): every death, with the throw that made it —
   *  origin, server-decided rest spot, direction/power by killer, and the
   *  seed all clients replay the same flail from. */
  onDeath(cb: (ev: BrDeathEvent) => void): void;
  /** DROWNING (Poolrooms v3): the client reports the head crossing the
   *  waterline. Only accepted while standing in a swim-deep cell; the 10s
   *  clock and the kill are the server's. */
  setSubmerged(userId: number, sub: boolean): void;
  /** THE BOATS (Poolrooms v3.1). */
  boats(): BrBoat[];
  boardBoat(userId: number, boatId: number): { ok: true; seat: "captain" | "passenger"; boat: BrBoat } | { error: string };
  leaveBoat(userId: number): { ok: true; boat: BrBoat } | { error: string };
  /** The boat this user CAPTAINS right now (net attaches boat frames). */
  boatFor(userId: number): BrBoat | null;
  /** Current health (the HUD reads it from the server now). */
  hpOf(userId: number): number;
  /** Heal — pills, and anything else that mends. Returns the new value. */
  heal(userId: number, amount: number): number;
  /** Chunk payload for the wire, or null if out of range / invalid. */
  chunkFor(userId: number, cx: number, cy: number): ChunkPayload | null;
  nearby(userId: number, radiusCells: number): BrSession[];
  /** Community fog: 1 byte per cell (1 = someone has been near it). */
  readonly fog: Uint8Array;
  /** The Poolrooms' own charted fog (persisted under its sector id). */
  readonly fogP: Uint8Array;
  readonly fogD: Uint8Array;
  exploredCountD(): number;
  readonly fogS: Uint8Array;
  exploredCountS(): number;
  readonly fogO: Uint8Array;
  exploredCountO(): number;
  readonly fogH: Uint8Array;
  exploredCountH(): number;
  readonly fogL: Uint8Array;
  exploredCountL(): number;
  readonly fogT: Uint8Array;
  exploredCountT(): number;
  readonly fogC: Uint8Array;
  exploredCountC(): number;
  readonly fogU: Uint8Array;
  exploredCountU(): number;
  /** Is Level 2 open to everyone (its door opened)? Admins may enter regardless. */
  level2(): { name: string | null; at: number } | null;
  exploredCount(): number;
  exploredCountP(): number;
  /** Persist the fog now (also runs on a timer + shutdown). */
  flushFog(): void;
}

export interface ChunkPayload {
  cx: number;
  cy: number;
  size: number;
  wallN: number[];
  wallW: number[];
  solid: number[];
  /** Floor height per cell in STEPS (v2 verticality). */
  floor: number[];
  /** 1 = sealed scenery: render it, never let anyone in. */
  background: number[];
  /** Furniture standing in this chunk (decoration only — never collides). */
  props: PropPlacement[];
  district: number[];
  landmark: number[];
  /** Which world this chunk belongs to — the client refuses frames for the
   *  wrong level (the graffiti-bleed hardening). */
  level: BrLevel;
  /** Water SURFACE height per cell in steps; WATER_NONE = dry. All-dry on
   *  Level 0 (omitted from the frame there to keep the wire slim). */
  water?: number[];
  /** Kit-dressing codes (kind*16+variant, see worldgen-pools DECO). Purely
   *  visual; absent on Level 0. */
  deco?: number[];
  /** The room STYLE per cell (1 + an index into `styles`; 0 = the room's
   *  usual), when the level has any. */
  look?: number[];
  /** The styles this chunk's cells use, by their number. */
  styles?: Record<number, LookSpec>;
  /** Any uploaded textures those styles name (the game learns them here). */
  surfaces?: CustomSurface[];
  /** THE HELD CEILING per cell (ceiling.ts; LID_NONE = follows the floor),
   *  when any cell in this chunk holds one. */
  lid?: number[];
  /** THE STAIRS (stairs.ts): the UP side per cell (STAIR_NONE elsewhere),
   *  each stair cell's dressing number, and those dressings — when the chunk
   *  holds a stair. */
  stair?: number[];
  stairStyle?: number[];
  stairSpecs?: Record<number, StairSpec>;
}

/** What the operator sees of one level (see BrService.operatorView). */
export interface OperatorView {
  level: BrLevel;
  monsters: { kind: "entity" | "stalker" | "shy" | "gator" | "bleeder" | "grabber" | "temp" | "moths" | "listener" | "deep" | "burrower" | "watch"; id: number; x: number; y: number; mode: string }[];
  relics: { x: number; y: number; name: string }[];
  drives: { id: string; x: number; y: number }[];
  /** Where an objective IS: a carried key or fuse is drawn where its carrier
   *  stands ("carried by NAME"), one on a body where the body lies ("on
   *  NAME's body"), otherwise its home ("lying", "used", "in"…). */
  objectives: { kind: "key" | "door" | "hatch" | "fuse" | "fusebox" | "landing" | "breaker" | "cutoff" | "shutter" | "keycard" | "stairdoor" | "lift" | "register" | "boilerkey" | "rustydoor" | "stair" | "handwheel" | "seahatch" | "helmet" | "subway" | "rope" | "chimney" | "housekey" | "frontdoor"; label: string; x: number; y: number; state: string }[];
  /** Every body lying on the level — recovery runs are part of the game, and
   *  the operator sees what each one carries. */
  bodies: { id: number; name: string; x: number; y: number; items: number; carriesObjective: boolean }[];
}

/** How long a run whose player left without an exit stays frozen, waiting for
 *  them, before it is lost to the dark. Exported so the hub can say so. */
export const BR_GRACE_MS = Number(process.env.BACKROOMS_GRACE_MS ?? 120_000);

function cellWalkable(s: Sector, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return false;
  const i = y * s.size + x;
  // SCENERY is geometry with no way in (worldgen v2): it renders, it is never
  // enterable, and the server refuses to put anyone in it.
  return !s.solid[i] && !s.background[i];
}

const floorAt = (s: Sector, x: number, y: number): number =>
  x < 0 || y < 0 || x >= s.size || y >= s.size ? 0 : s.floor[y * s.size + x];

/** The EFFECTIVE floor for the climb rule: in deep water a swimmer floats
 *  at the surface, so the water table is the height that counts. Dry
 *  sectors (no eff array) read raw floor, bit for bit. */
const effAt = (s: Sector, x: number, y: number): number =>
  x < 0 || y < 0 || x >= s.size || y >= s.size ? 0 : (s.eff ?? s.floor)[y * s.size + x];

/** Is the shared edge between two ADJACENT cells open? Walls AND the climb
 *  rule: you can step up at most one height step, but you may always walk OFF
 *  an edge (that's a fall, priced in fallDamage below). */
function edgeOpen(s: Sector, fromX: number, fromY: number, toX: number, toY: number): boolean {
  if (!cellWalkable(s, toX, toY)) return false;
  if (!heightPassable(effAt(s, fromX, fromY), effAt(s, toX, toY))) return false;
  const size = s.size;
  if (toY === fromY - 1) return !s.wallN[fromY * size + fromX];
  if (toY === fromY + 1) return !s.wallN[toY * size + toX];
  if (toX === fromX - 1) return !s.wallW[fromY * size + fromX];
  if (toX === fromX + 1) return !s.wallW[fromY * size + toX];
  return toX === fromX && toY === fromY;
}

/** Can you get from cell A to cell B in one step (incl. diagonals via an
 *  open L-path)? The per-message distance cap keeps A and B adjacent. */
function stepAllowed(s: Sector, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return true;
  if (Math.abs(dx) + Math.abs(dy) === 1) return edgeOpen(s, ax, ay, bx, by);
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    // Diagonal: at least one of the two L-shaped routes must be fully open.
    const viaX = edgeOpen(s, ax, ay, ax + dx, ay) && edgeOpen(s, ax + dx, ay, bx, by);
    const viaY = edgeOpen(s, ax, ay, ax, ay + dy) && edgeOpen(s, ax, ay + dy, bx, by);
    return viaX || viaY;
  }
  return false;
}

/** May a body go from (ax, ay) to (bx, by) in ONE move message? A step
 *  inside a cell, or into a neighbouring one, is stepAllowed exactly as it
 *  always was. A step that spans more cells — what a burst of delayed frames
 *  turns into (see MOVE_BURST in net.ts) — walks its own line a tenth of a
 *  cell at a time and must clear every cell change on the way under the same
 *  wall and climb rules, so open floor passes and a wall still stops it.
 *  Before this, any step crossing two cell lines on an axis was refused
 *  outright, however open the floor. */
export function moveAllowed(s: Sector, ax: number, ay: number, bx: number, by: number): boolean {
  const fx = Math.floor(ax);
  const fy = Math.floor(ay);
  const tx = Math.floor(bx);
  const ty = Math.floor(by);
  if (Math.abs(tx - fx) <= 1 && Math.abs(ty - fy) <= 1) return stepAllowed(s, fx, fy, tx, ty);
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.1));
  let pcx = fx;
  let pcy = fy;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.floor(ax + (bx - ax) * t);
    const cy = Math.floor(ay + (by - ay) * t);
    if (cx === pcx && cy === pcy) continue;
    if (!stepAllowed(s, pcx, pcy, cx, cy)) return false;
    pcx = cx;
    pcy = cy;
  }
  return true;
}

export function createBackrooms(store: Store): BackroomsService {

  // THE LEVELS BUILT FROM ROOMS — the Poolrooms (Level 1) and Pipe Dreams
  // (Level 2), held to the same standard as A3. A map PUBLISHED from the
  // Admin Panel's editor (migration 103) outranks the repo's frozen one; its
  // fingerprint was recorded when it was built, and is checked again here for
  // the same reason the repo map's is: a map players have fog, paint and
  // bodies on must never change under them.
  const bootRooms = (
    level: BrLevel,
    repo: { id: string; seed: number; size: number },
    repoFp: string,
    build: (seed: number, tiles?: TileDef[]) => Sector,
  ): { sec: Sector; id: string; fp: string; expect: string; seed: number; version: number | null } => {
    const pub = store.mapPublished(level);
    if (pub) {
      let sec: Sector | null = null;
      try {
        sec = build(pub.seed, JSON.parse(pub.tiles));
      } catch (e) {
        console.error(`[backrooms] published Level ${level} v${pub.version} no longer builds (${(e as Error).message}) — falling back to the repo map.`);
      }
      if (sec) {
        const fp = sectorFingerprint(sec);
        if (fp === pub.fingerprint) return { sec, id: pub.sectorId, fp, expect: fp, seed: pub.seed, version: pub.version };
        console.error(`[backrooms] published Level ${level} v${pub.version} builds differently than when it was published — the generator changed. Serving the repo map; republish from the editor to adopt the new build.`);
      }
    }
    const sec = build(repo.seed);
    return { sec, id: repo.id, fp: sectorFingerprint(sec), expect: repoFp, seed: repo.seed, version: null };
  };
  const bootLog = (b: ReturnType<typeof bootRooms>, size: number, tail: string): void =>
    console.log(`[backrooms] Sector ${b.id} verified (${size}×${size}, seed ${b.seed}${b.version ? `, published v${b.version}` : ""}) — ${tail}.`);

  // LEVEL 0 — THE LOBBY — rebuilt from hand-drawn rooms, a lattice packed
  // wall to wall (Sep 2026). A mismatch refuses to serve a world that isn't THE
  // world: every level stays shut until the code is fixed.
  const bootA = bootRooms(0, SECTOR_A, SECTOR_A_FINGERPRINT, (seed, tiles) => planLobbySector(seed, SECTOR_A.size, tiles).sector);
  let sector = bootA.sec;
  let sectorIdA = bootA.id;
  let enabled = bootA.fp === bootA.expect;
  if (!enabled) {
    console.error(
      `[backrooms] SECTOR A FINGERPRINT MISMATCH — generated ${bootA.fp}, expected ${bootA.expect}. ` +
        "Generation changed for a shipped world; the backrooms are DISABLED.",
    );
  } else bootLog(bootA, SECTOR_A.size, "the doors can open");

  // THE POOLROOMS — rebuilt from hand-drawn rooms, rivers as the spine (Sep 2026).
  const bootP = bootRooms(1, SECTOR_P, SECTOR_P_FINGERPRINT, (seed, tiles) => planPoolsSector(seed, SECTOR_P.size, tiles).sector);
  let sectorP = bootP.sec;
  let sectorIdP = bootP.id;
  let enabledP = bootP.fp === bootP.expect;
  if (!enabledP) {
    console.error(
      `[backrooms] SECTOR P FINGERPRINT MISMATCH — generated ${bootP.fp}, expected ${bootP.expect}. ` +
        "The Poolrooms are DISABLED (Level 0 is unaffected).",
    );
  } else bootLog(bootP, SECTOR_P.size, "the water is waiting");

  // PIPE DREAMS — the third world (Sep 2026).
  const bootD = bootRooms(2, SECTOR_D, SECTOR_D_FINGERPRINT, (seed, tiles) => (tiles ? planPipesSector(seed, SECTOR_D.size, tiles).sector : generatePipesSector(seed, SECTOR_D.size)));
  let sectorD = bootD.sec;
  let sectorIdD = bootD.id;
  // PIPES_UNFROZEN=1 (development only) opens Level 2 on whatever the room
  // library builds today — for walking an edited map before it is frozen.
  // Never set it on the server: the fingerprint is what keeps a map players
  // have fog, paint and bodies on from changing under them.
  const unfrozenD = process.env.PIPES_UNFROZEN === "1";
  if (unfrozenD && bootD.fp !== bootD.expect) console.warn(`[backrooms] PIPES_UNFROZEN: Level 2 opens on an UNFROZEN map (${bootD.fp}) — development only.`);
  let enabledD = bootD.fp === bootD.expect || unfrozenD;
  if (!enabledD) {
    console.error(
      `[backrooms] SECTOR D FINGERPRINT MISMATCH — generated ${bootD.fp}, expected ${bootD.expect}. ` +
        "Pipe Dreams is DISABLED (Levels 0 and 1 are unaffected).",
    );
  } else if (bootD.fp === bootD.expect) bootLog(bootD, SECTOR_D.size, "the pipes are hot");
  else console.log(`[backrooms] Sector D NOT verified — running unfrozen (${sectorIdD}, seed ${SECTOR_D.seed}).`);

  // THE ELECTRICAL STATION — the fourth world (Oct 2026). STATION_UNFROZEN=1
  // is Pipe Dreams' development switch for it: never on the server.
  const bootS = bootRooms(3, SECTOR_S, SECTOR_S_FINGERPRINT, (seed, tiles) => planStationSector(seed, SECTOR_S.size, tiles).sector);
  let sectorS = bootS.sec;
  let sectorIdS = bootS.id;
  const unfrozenS = process.env.STATION_UNFROZEN === "1";
  if (unfrozenS && bootS.fp !== bootS.expect) console.warn(`[backrooms] STATION_UNFROZEN: Level 3 opens on an UNFROZEN map (${bootS.fp}) — development only.`);
  let enabledS = bootS.fp === bootS.expect || unfrozenS;
  if (!enabledS) {
    console.error(
      `[backrooms] SECTOR S FINGERPRINT MISMATCH — generated ${bootS.fp}, expected ${bootS.expect}. ` +
        "The Electrical Station is DISABLED (the other levels are unaffected).",
    );
  } else if (bootS.fp === bootS.expect) bootLog(bootS, SECTOR_S.size, "the station hums");
  else console.log(`[backrooms] Sector S NOT verified — running unfrozen (${sectorIdS}, seed ${SECTOR_S.seed}).`);

  // THE ABANDONED OFFICE — the fifth world (Oct 2026). OFFICE_UNFROZEN=1 is
  // the same development switch: never on the server.
  const bootO = bootRooms(4, SECTOR_O, SECTOR_O_FINGERPRINT, (seed, tiles) => planOfficeSector(seed, SECTOR_O.size, tiles).sector);
  let sectorO = bootO.sec;
  let sectorIdO = bootO.id;
  const unfrozenO = process.env.OFFICE_UNFROZEN === "1";
  if (unfrozenO && bootO.fp !== bootO.expect) console.warn(`[backrooms] OFFICE_UNFROZEN: Level 4 opens on an UNFROZEN map (${bootO.fp}) — development only.`);
  let enabledO = bootO.fp === bootO.expect || unfrozenO;
  if (!enabledO) {
    console.error(
      `[backrooms] SECTOR O FINGERPRINT MISMATCH — generated ${bootO.fp}, expected ${bootO.expect}. ` +
        "The Abandoned Office is DISABLED (the other levels are unaffected).",
    );
  } else if (bootO.fp === bootO.expect) bootLog(bootO, SECTOR_O.size, "it is raining on the windows");
  else console.log(`[backrooms] Sector O NOT verified — running unfrozen (${sectorIdO}, seed ${SECTOR_O.seed}).`);

  // THE TERROR HOTEL — the sixth world (Oct 2026). HOTEL_UNFROZEN=1 is the
  // same development switch: never on the server.
  const bootH = bootRooms(5, SECTOR_H, SECTOR_H_FINGERPRINT, (seed, tiles) => planHotelSector(seed, SECTOR_H.size, tiles).sector);
  let sectorH = bootH.sec;
  let sectorIdH = bootH.id;
  const unfrozenH = process.env.HOTEL_UNFROZEN === "1";
  if (unfrozenH && bootH.fp !== bootH.expect) console.warn(`[backrooms] HOTEL_UNFROZEN: Level 5 opens on an UNFROZEN map (${bootH.fp}) — development only.`);
  let enabledH = bootH.fp === bootH.expect || unfrozenH;
  if (!enabledH) {
    console.error(
      `[backrooms] SECTOR H FINGERPRINT MISMATCH — generated ${bootH.fp}, expected ${bootH.expect}. ` +
        "The Terror Hotel is DISABLED (the other levels are unaffected).",
    );
  } else if (bootH.fp === bootH.expect) bootLog(bootH, SECTOR_H.size, "somewhere a band is playing");
  else console.log(`[backrooms] Sector H NOT verified — running unfrozen (${sectorIdH}, seed ${SECTOR_H.seed}).`);

  // LIGHTS OUT — the seventh world (Oct 2026). LIGHTS_UNFROZEN=1 is the same
  // development switch: never on the server.
  const bootL = bootRooms(6, SECTOR_L, SECTOR_L_FINGERPRINT, (seed, tiles) => planLightsSector(seed, SECTOR_L.size, tiles).sector);
  let sectorL = bootL.sec;
  let sectorIdL = bootL.id;
  const unfrozenL = process.env.LIGHTS_UNFROZEN === "1";
  if (unfrozenL && bootL.fp !== bootL.expect) console.warn(`[backrooms] LIGHTS_UNFROZEN: Level 6 opens on an UNFROZEN map (${bootL.fp}) — development only.`);
  let enabledL = bootL.fp === bootL.expect || unfrozenL;
  if (!enabledL) {
    console.error(
      `[backrooms] SECTOR L FINGERPRINT MISMATCH — generated ${bootL.fp}, expected ${bootL.expect}. ` +
        "Lights Out is DISABLED (the other levels are unaffected).",
    );
  } else if (bootL.fp === bootL.expect) bootLog(bootL, SECTOR_L.size, "it is very quiet");
  else console.log(`[backrooms] Sector L NOT verified — running unfrozen (${sectorIdL}, seed ${SECTOR_L.seed}).`);

  // THALASSOPHOBIA — the eighth world (Oct 2026). OCEAN_UNFROZEN=1 is the
  // same development switch: never on the server.
  const bootT = bootRooms(7, SECTOR_T, SECTOR_T_FINGERPRINT, (seed, tiles) => planOceanSector(seed, SECTOR_T.size, tiles).sector);
  let sectorT = bootT.sec;
  let sectorIdT = bootT.id;
  const unfrozenT = process.env.OCEAN_UNFROZEN === "1";
  if (unfrozenT && bootT.fp !== bootT.expect) console.warn(`[backrooms] OCEAN_UNFROZEN: Level 7 opens on an UNFROZEN map (${bootT.fp}) — development only.`);
  let enabledT = bootT.fp === bootT.expect || unfrozenT;
  if (!enabledT) {
    console.error(
      `[backrooms] SECTOR T FINGERPRINT MISMATCH — generated ${bootT.fp}, expected ${bootT.expect}. ` +
        "Thalassophobia is DISABLED (the other levels are unaffected).",
    );
  } else if (bootT.fp === bootT.expect) bootLog(bootT, SECTOR_T.size, "the water is very still");
  else console.log(`[backrooms] Sector T NOT verified — running unfrozen (${sectorIdT}, seed ${SECTOR_T.seed}).`);

  // THE CAVE SYSTEM — the ninth world (Oct 2026). CAVE_UNFROZEN=1 is the same
  // development switch: never on the server.
  const bootC = bootRooms(8, SECTOR_C, SECTOR_C_FINGERPRINT, (seed, tiles) => planCaveSector(seed, SECTOR_C.size, tiles).sector);
  let sectorC = bootC.sec;
  let sectorIdC = bootC.id;
  const unfrozenC = process.env.CAVE_UNFROZEN === "1";
  if (unfrozenC && bootC.fp !== bootC.expect) console.warn(`[backrooms] CAVE_UNFROZEN: Level 8 opens on an UNFROZEN map (${bootC.fp}) — development only.`);
  let enabledC = bootC.fp === bootC.expect || unfrozenC;
  if (!enabledC) {
    console.error(
      `[backrooms] SECTOR C FINGERPRINT MISMATCH — generated ${bootC.fp}, expected ${bootC.expect}. ` +
        "The Cave System is DISABLED (the other levels are unaffected).",
    );
  } else if (bootC.fp === bootC.expect) bootLog(bootC, SECTOR_C.size, "water drips somewhere below");
  else console.log(`[backrooms] Sector C NOT verified — running unfrozen (${sectorIdC}, seed ${SECTOR_C.seed}).`);

  // THE SUBURBS — the tenth world, and the last (Oct 2026). SUBURBS_UNFROZEN=1
  // is the same development switch: never on the server.
  const bootU = bootRooms(9, SECTOR_U, SECTOR_U_FINGERPRINT, (seed, tiles) => planSuburbSector(seed, SECTOR_U.size, tiles).sector);
  let sectorU = bootU.sec;
  let sectorIdU = bootU.id;
  const unfrozenU = process.env.SUBURBS_UNFROZEN === "1";
  if (unfrozenU && bootU.fp !== bootU.expect) console.warn(`[backrooms] SUBURBS_UNFROZEN: Level 9 opens on an UNFROZEN map (${bootU.fp}) — development only.`);
  let enabledU = bootU.fp === bootU.expect || unfrozenU;
  if (!enabledU) {
    console.error(
      `[backrooms] SECTOR U FINGERPRINT MISMATCH — generated ${bootU.fp}, expected ${bootU.expect}. ` +
        "The Suburbs are DISABLED (the other levels are unaffected).",
    );
  } else if (bootU.fp === bootU.expect) bootLog(bootU, SECTOR_U.size, "somewhere, somebody is whistling");
  else console.log(`[backrooms] Sector U NOT verified — running unfrozen (${sectorIdU}, seed ${SECTOR_U.seed}).`);

  const sessions = new Map<number, BrSession>();
  // RELICS IN HAND SURVIVE A RESTART (migration 112): whatever a run was
  // carrying when the server last stopped is banked now, before anybody is
  // inside — exactly as walking out would have banked it.
  {
    const banked = store.brCarriedBankAll();
    if (banked) console.log(`[backrooms] banked ${banked} relic(s) carried by runs the last restart ended`);
  }
  /** Mirror every live run's carried relics to the DB (a test run's are only
   *  a test). Called on pickup, on the fog timer and at shutdown. */
  const mirrorCarried = (): void => {
    const rows: { userId: number; slug: string; level: number }[] = [];
    for (const q of sessions.values()) {
      if (testingLevel(q.level)) continue;
      for (const slug of q.relics) rows.push({ userId: q.userId, slug, level: q.level });
    }
    store.brCarriedReplace(rows);
  };
  /** A run is over — out, dead, forfeit, voided: its relics are accounted for. */
  const endRun = (userId: number): void => {
    // A key or fuse the ended run held is free again whichever way the run
    // ended (Oct 2026 review): a test ending or a publish voiding a frozen
    // holder left Level 9's House Key "held" by nobody, unfindable until a
    // restart. The paths that put it on a body or send it home still do so.
    const s = sessions.get(userId);
    if (s) {
      if (keyHolder[s.level] === userId) keyHolder[s.level] = null;
      for (const f of s.fuses ?? []) if (fuseHolder[f] === userId) fuseHolder[f] = null;
    }
    sessions.delete(userId);
    store.brCarriedClear(userId);
  };
  // (set once the test-play map exists, below — a hoisted read of it)
  let testingLevel: (level: BrLevel) => boolean = () => false;
  /** Each level's world. Everything positional goes through these. */
  const secBy = (level: BrLevel): Sector => (level === 9 ? sectorU : level === 8 ? sectorC : level === 7 ? sectorT : level === 6 ? sectorL : level === 5 ? sectorH : level === 4 ? sectorO : level === 3 ? sectorS : level === 2 ? sectorD : level === 1 ? sectorP : sector);
  const secOf = (s: BrSession): Sector => secBy(s.level);
  const sectorIdOf = (level: BrLevel): string => (level === 9 ? sectorIdU : level === 8 ? sectorIdC : level === 7 ? sectorIdT : level === 6 ? sectorIdL : level === 5 ? sectorIdH : level === 4 ? sectorIdO : level === 3 ? sectorIdS : level === 2 ? sectorIdD : level === 1 ? sectorIdP : sectorIdA);
  /** Is this level's world serving (its map verified, or a dev unfrozen)? */
  const enabledOf = (level: BrLevel): boolean => (level === 0 ? enabled : level === 1 ? enabledP : level === 2 ? enabledD : level === 3 ? enabledS : level === 4 ? enabledO : level === 5 ? enabledH : level === 6 ? enabledL : level === 7 ? enabledT : level === 8 ? enabledC : enabledU);

  // ---- Community fog --------------------------------------------------
  // 1 byte per cell in memory; packed to 1 bit per cell in the DB. Loaded
  // once at boot, only ever GAINS cells, flushed on a timer + shutdown.
  // One field per LEVEL, persisted under its own sector id.
  const loadFog = (id: string, sec: Sector): Uint8Array => {
    const f = new Uint8Array(sec.size * sec.size);
    const packed = store.getBackroomsFog(id, Math.ceil(f.length / 8));
    if (packed) {
      for (let i = 0; i < f.length; i++) {
        if (packed[i >> 3] & (1 << (i & 7))) f[i] = 1;
      }
    }
    return f;
  };
  let fog = loadFog(sectorIdA, sector);
  let fogP = loadFog(sectorIdP, sectorP);
  let fogD = loadFog(sectorIdD, sectorD);
  let fogS = loadFog(sectorIdS, sectorS);
  let fogO = loadFog(sectorIdO, sectorO);
  let fogH = loadFog(sectorIdH, sectorH);
  let fogL = loadFog(sectorIdL, sectorL);
  let fogT = loadFog(sectorIdT, sectorT);
  let fogC = loadFog(sectorIdC, sectorC);
  let fogU = loadFog(sectorIdU, sectorU);
  const fogOf = (level: BrLevel): Uint8Array => (level === 9 ? fogU : level === 8 ? fogC : level === 7 ? fogT : level === 6 ? fogL : level === 5 ? fogH : level === 4 ? fogO : level === 3 ? fogS : level === 2 ? fogD : level === 1 ? fogP : fog);
  const fogDirty = [false, false, false, false, false, false, false, false, false, false];

  const flushFog = (): void => {
    mirrorCarried();
    for (const level of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
      if (!fogDirty[level]) continue;
      fogDirty[level] = false;
      const f = fogOf(level);
      const packed = Buffer.alloc(Math.ceil(f.length / 8));
      for (let i = 0; i < f.length; i++) {
        if (f[i]) packed[i >> 3] |= 1 << (i & 7);
      }
      store.saveBackroomsFog(sectorIdOf(level), packed);
    }
  };
  const fogTimer = setInterval(() => {
    heartbeat("backroomsFog", FOG_FLUSH_MS);
    flushFog();
  }, FOG_FLUSH_MS);
  fogTimer.unref?.();

  /** Reveal what a player standing in (cx,cy) has seen: a small BFS over the
   *  walkable graph, so walls actually block discovery — the map never shows
   *  a room nobody's been able to look into. */
  const revealAround = (level: BrLevel, cx: number, cy: number): number => {
    const sec = secBy(level);
    const f = fogOf(level);
    if (!cellWalkable(sec, cx, cy)) return 0;
    let fresh = 0;
    const seen = new Map<number, number>(); // cellIndex → steps
    const queue: [number, number, number][] = [[cx, cy, 0]];
    seen.set(cy * sec.size + cx, 0);
    while (queue.length) {
      const [x, y, d] = queue.shift()!;
      const i = y * sec.size + x;
      if (!f[i]) {
        f[i] = 1;
        fogDirty[level] = true;
        fresh++;
      }
      if (d >= FOG_SIGHT) continue;
      for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]] as [number, number][]) {
        const ni = ny * sec.size + nx;
        if (seen.has(ni)) continue;
        if (!edgeOpen(sec, x, y, nx, ny)) continue;
        seen.set(ni, d + 1);
        queue.push([nx, ny, d + 1]);
      }
    }
    return fresh;
  };

  // ---- THE ENTITY -----------------------------------------------------
  // One creature for the whole sector, mostly DORMANT (rare encounter).
  // Server-authoritative: it wanders, hears footsteps (speed-based: running
  // ~10m, walking ~5m, crouch silent) and walkie transmissions, chases on
  // clear line of sight (the player sprints 20% faster), gives up 10s
  // after losing sight, and kills on touch — deleting the carried loadout
  // (corpse recovery comes later) and recording the death.
  const ENT_WANDER_SPEED = 1.15; // cells/s
  const ENT_CHASE_SPEED = 2.375; // sprint 2.85 ÷ 1.2
  const ENT_SIGHT = 14;
  const ENT_TICK_MS = 100;
  const LOS_GRACE_MS = 10_000;
  const SLEEP_MIN = Number(process.env.BACKROOMS_ENTITY_SLEEP_MIN_MS ?? 5 * 60_000);
  const SLEEP_MAX = Number(process.env.BACKROOMS_ENTITY_SLEEP_MAX_MS ?? 15 * 60_000);

  // TWO ENTITIES (Josh, July 2026): each binds to a relic site, prowls the
  // ground around it — always circling back to the relic itself — and every
  // few minutes the two SWAP sites, trekking across the map to trade posts.
  // Treasure has teeth, doubled, and the trade routes are where you meet one
  // in the open. Dormancy is gone: they are always out there.
  //
  // AND A THIRD, THE KEEPER (Josh, Sep 30 2026: "lets have 3 entities, with
  // the third wondering around the key, not right on top on it but in the
  // area with a couple pass through here and there"). It walks the ground
  // KEEP_NEAR..KEEP_FAR cells from THE KEY's resting place and, every few
  // beats, walks a line THROUGH it — in by the key, out the far side. It never
  // swaps posts and never guards a relic; the key is its whole world.
  interface EntBrain {
    id: number;
    x: number;
    y: number;
    mode: "patrol" | "chase";
    targetId: number;
    lastLosAt: number;
    /** Where it last SAW its quarry. Out of sight it goes there and looks —
     *  never to where the quarry is now (law 2 audit: the old grace window
     *  pathed to the live position, pursuit by telepathy). */
    lastSeenX?: number;
    lastSeenY?: number;
    path: [number, number][];
    pathAt: number;
    /** Relic site id it is bound to (-1 = unassigned free prowler). */
    homeRelic: number;
    nextPickAt: number;
    /** Post-kill satiation — it stands over the body a while. */
    restUntil: number;
    stimulus: { x: number; y: number; at: number } | null;
    /** THE KEEPER — patrols THE KEY instead of a relic. */
    keeper?: boolean;
    /** The keeper's beat: picks since its last pass through the key, when the
     *  next pass is due, and the far side it walks on to after one. */
    picks?: number;
    passAt?: number;
    via?: [number, number] | null;
    /** Roaming (the door open): when to give up on the current destination. */
    roamUntil?: number;
  }
  const KEEP_NEAR = 6;
  const KEEP_FAR = 18;
  const ENT_PICK_MIN_MS = Number(process.env.BACKROOMS_ENT_PICK_MIN_MS ?? 5_000);
  const ENT_PICK_SPAN_MS = Number(process.env.BACKROOMS_ENT_PICK_SPAN_MS ?? 8_000);
  /** The keeper walks through the key every KEEP_PASS_MIN..+2 picks. */
  const KEEP_PASS_MIN = Number(process.env.BACKROOMS_KEEPER_PASS_MIN ?? 3);
  const ents: EntBrain[] = [0, 1, 2].map((id) => ({
    id,
    x: 0,
    y: 0,
    mode: "patrol" as const,
    targetId: 0,
    lastLosAt: 0,
    path: [],
    pathAt: 0,
    homeRelic: -1,
    nextPickAt: 0,
    restUntil: 0,
    stimulus: null,
    keeper: id === 2,
    picks: 0,
    passAt: KEEP_PASS_MIN,
    via: null,
  }));
  /** The two that guard relics and trade posts (the keeper does neither). */
  const relicEnts = (): EntBrain[] => ents.filter((e) => !e.keeper);
  let entsPlaced = false;
  const SWAP_MIN_MS = Number(process.env.BACKROOMS_ENT_SWAP_MIN_MS ?? 150_000);
  const SWAP_MAX_MS = Number(process.env.BACKROOMS_ENT_SWAP_MAX_MS ?? 300_000);
  let nextSwapAt = Date.now() + SWAP_MIN_MS;
  const immortals = new Set<number>(); // admin playtesting — they can't kill them
  const spectators = new Map<number, Spectator>();
  /** THE GRABBER's hold: a body in its arms, until when (its moves are refused). */
  const heldUntil = new Map<number, number>();
  const armedSummon = new Set<number>(); // spawn-and-come-to-me on next entry

  // ---- THE STALKER (Josh, July 2026) ---------------------------------------
  // Level 0's other creature (beside the three Entities). It SHADOWS players
  // from a distance, out of sight, occasionally replaying a snatch of
  // another player's voice to bait you into calling out. WHEN THE POWER GOES
  // OUT it hunts: a silent sprint and an instant kill. It HATES light — a
  // flashlight beam HELD on it for two seconds burns it and sends it fleeing,
  // but it always comes back for another try. The SCP-4666 sound belongs to the
  // hunt alone (client rule).
  const stalker = {
    placed: false,
    x: 0,
    y: 0,
    mode: "shadow" as "shadow" | "hunt" | "flee",
    targetId: 0,
    path: [] as [number, number][],
    pathAt: 0,
    nextMimicAt: 0,
    fleeUntil: 0,
    nextHuntTryAt: 0,
    /** How long a beam has been on it (ms). It breaks at STALK_BURN_MS. */
    litMs: 0,
    /** A beam is on it this tick and it hasn't broken yet (the client burns). */
    burning: false,
    /** Where it means to wait: a cell out of everyone's sight, behind the
     *  mark, at a distance. */
    lurk: null as [number, number] | null,
    lurkAt: 0,
    /** Where it is ducking to while caught in a sight line — kept until it
     *  gets there or somebody can see THAT, never re-rolled on a timer. */
    hide: null as [number, number] | null,
  };
  // SPEED (Josh, Aug 2026: "make the stalker faster, its too easy to catch
  // when lights are on. just make it like 2x faster than players sprint
  // speed"). A sprint is 2.85 cells/s, so 5.7 — it is never outrun, and in
  // the dark that is the whole point. The counterplay stays the flashlight.
  const SPRINT = 2.85;
  const STALK_SHADOW_SPEED = SPRINT * 2; // it repositions faster than you can close
  const STALK_HUNT_SPEED = SPRINT * 2;
  const STALK_FLEE_SPEED = SPRINT * 2.2;
  /** THE DISTANCE IT KEEPS (Josh, Sep 30 2026: "the stalker follows the
   *  players too closely … keeps walking in their line of sight then running
   *  away"). It used to hold a "ring" of 13 by picking a random cell anywhere
   *  WITHIN 13 of you — so half its waypoints were a few steps from you, it
   *  walked to them across open floor, you saw it, and it bolted. Now it
   *  waits in a band 16–26 cells off, at a spot nobody can see, preferring
   *  the ground BEHIND the one it follows, and it gets there by routes that
   *  stay out of sight. */
  const STALK_BAND_MIN = 16;
  const STALK_BAND_MAX = 26;
  /** How far down a lit, open line a player can make it out. */
  const STALK_SIGHT = 34;
  const STALK_APPROACH_DOT = 0.55; // heading within ~57° of straight at it = "coming for me"
  /** THE BURN (Josh, Sep 30 2026: "it takes shining the flashlight for at
   *  least 2 seconds to scare it away. have a burning sound play while it's
   *  being shined"). A beam has to STAY on it; it breaks at this. While it burns it
   *  staggers — a third of its speed — so two seconds of light is a real
   *  defence, not a countdown to being reached. Off the beam it cools three
   *  times as fast as it built, so a sweep across it only singes it. */
  const STALK_BURN_MS = Number(process.env.BACKROOMS_STALKER_BURN_MS ?? 2_000);
  const STALK_BURN_SLOW = 0.3;
  let stalkerCb: ((ev: StalkerEvent) => void) | null = null;

  /** WHICH WAY A BODY IS FACING, in cell space.
   *
   *  The client sends its raw camera yaw, and in the renderer YAW 0 FACES −Y
   *  (controller.ts: `dx = sin(yaw)·−fwd`, `dy = cos(yaw)·−fwd`). So the
   *  facing vector is (−sin h, −cos h) — NOT (sin h, cos h). Getting this
   *  backwards points every cone at the back of the player's head, which is
   *  exactly what the stalker's flashlight check used to do: it fled when the
   *  beam pointed AWAY from it and ignored a beam straight in its face.
   *  Everything that asks "are they looking at it" goes through here. */
  const facingOf = (heading: number): { fx: number; fy: number } => ({
    fx: -Math.sin(heading),
    fy: -Math.cos(heading),
  });

  /** THE CAMERA, ON EVERY CREATURE (Backrooms law 5, Oct 2026 — it used to pay
   *  only for the Entity, so filming the Stalker, the Shy Guy, the alligators,
   *  the Bleeder or the Grabber earned nothing). Anyone ROLLING (camera raised)
   *  who has a creature in FRONT of the lens — the old sampler never checked
   *  which way the camera pointed — with a clear line, within 13 cells, takes
   *  a shot; the closest one this run sets the tape's tier at extraction.
   *  `risky` is the honest-footage rule: a shot only counts where the
   *  creature could actually reach you (an alligator only from ITS water —
   *  from the dry tile it is a free 400 silver of zero risk). */
  const filmed = (level: BrLevel, sec: Sector, cx: number, cy: number, risky?: (s: BrSession) => boolean): void => {
    for (const q of sessions.values()) {
      if (q.level !== level || !q.cam || q.fly || q.lostAt) continue;
      const d = Math.hypot(q.x - cx, q.y - cy);
      if (d > 13 || d >= q.bestShot) continue;
      // always IN FRONT of the lens — a creature on top of you with your back
      // to it is not footage (the first cut exempted point-blank range, and a
      // chasing Entity earned a close tape from behind)
      if (d < 0.01) continue;
      const { fx, fy } = facingOf(q.heading);
      if (((cx - q.x) / d) * fx + ((cy - q.y) / d) * fy < 0.8) continue;
      if (risky && !risky(q)) continue;
      if (!lineWalkableIn(sec, q.x, q.y, cx, cy)) continue;
      q.bestShot = d;
    }
  };

  /** Is any nearby player's ACTIVE flashlight beam on the stalker? */
  const litByFlashlight = (prey: BrSession[]): boolean => {
    for (const s of prey) {
      if (s.fly || s.equip !== "flashlight!") continue;
      const dx = stalker.x - s.x;
      const dy = stalker.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 16 || d < 0.01) continue;
      const { fx, fy } = facingOf(s.heading);
      if ((dx / d) * fx + (dy / d) * fy < 0.92) continue; // ~23° cone
      if (!lineWalkable(s.x, s.y, stalker.x, stalker.y)) continue;
      return true;
    }
    return false;
  };

  /** Everyone who has a clear line to (x,y) within STALK_SIGHT. */
  const sightlinesTo = (prey: BrSession[], x: number, y: number): BrSession[] =>
    prey.filter((s) => Math.hypot(s.x - x, s.y - y) <= STALK_SIGHT && lineWalkable(s.x, s.y, x, y));

  /** THE SEEN GROUND: every cell some player can see, by 720 rays each out to
   *  STALK_SIGHT, stopped by exactly what stops a sight line (a wall, a step
   *  up of two). One pass per player per refresh is ~100k cell checks — far
   *  cheaper than asking lineWalkable at every cell a route search touches. */
  let seenGround: Set<number> = new Set();
  let seenGroundAt = 0;
  const refreshSeenGround = (prey: BrSession[], now: number): void => {
    if (now - seenGroundAt < 400) return;
    seenGroundAt = now;
    const out = new Set<number>();
    const size = sector.size;
    for (const s of prey) {
      const sx = Math.floor(s.x);
      const sy = Math.floor(s.y);
      out.add(sy * size + sx);
      for (let r = 0; r < 720; r++) {
        const a = (r / 720) * Math.PI * 2;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        let pcx = sx;
        let pcy = sy;
        for (let t = 0.25; t <= STALK_SIGHT; t += 0.25) {
          const cx = Math.floor(s.x + ux * t);
          const cy = Math.floor(s.y + uy * t);
          if (cx === pcx && cy === pcy) continue;
          if (!stepAllowed(sector, pcx, pcy, cx, cy)) break;
          out.add(cy * size + cx);
          pcx = cx;
          pcy = cy;
        }
      }
    }
    seenGround = out;
  };
  const seenCell = (x: number, y: number): boolean => seenGround.has(y * sector.size + x);
  /** A route that keeps to the dark: a seen cell costs eight unseen ones, so
   *  it goes the long way round a corner rather than across your view, and
   *  only crosses a sight line when there is no other way. */
  let stalkPrey: BrSession[] = [];
  const hiddenPath = (tx: number, ty: number): [number, number][] =>
    findPathIn(
      sector, stalker.x, stalker.y, tx, ty, noPit0, true,
      // and it never threads its way past you: ground within 4 cells of a
      // player costs as much as a long detour
      (x, y) => (seenCell(x, y) ? 8 : 1) + (stalkPrey.some((p) => Math.abs(p.x - x - 0.5) < 4 && Math.abs(p.y - y - 0.5) < 4) ? 30 : 0),
      true,
    );

  /** Where to wait: a cell in the band around the mark that nobody can see,
   *  scored toward BEHIND the mark and toward cells it can reach quickly. */
  const pickLurk = (mark: BrSession, lo: number, hi: number, hide: boolean): [number, number] | null => {
    const { fx, fy } = facingOf(mark.heading);
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 48; i++) {
      const a = rng() * Math.PI * 2;
      const r = lo + rng() * (hi - lo);
      const spot = spiralNear(mark.x + Math.cos(a) * r, mark.y + Math.sin(a) * r, 2);
      if (!spot) continue;
      const cx = spot[0] + 0.5;
      const cy = spot[1] + 0.5;
      const d = Math.hypot(cx - mark.x, cy - mark.y);
      if (d < lo - 1 || d > hi + 2) continue;
      if (hide && seenCell(spot[0], spot[1])) continue;
      const behind = -(((cx - mark.x) / d) * fx + ((cy - mark.y) / d) * fy); // 1 = dead behind
      const score = behind - Math.hypot(cx - stalker.x, cy - stalker.y) / 30;
      if (score > bestScore) {
        bestScore = score;
        best = spot;
      }
    }
    return best;
  };

  /** The nearest cell nobody can see — where to duck when it is caught in a
   *  sight line. A flood out from where it stands, so the answer is round
   *  the nearest corner, not merely "further away" — but NEVER past you:
   *  the flood doesn't pass within 3 cells of a player, and a hiding place
   *  nearer to anyone than it already is doesn't count (measured, seed 77:
   *  cornered in a dead end, it "hid" by squeezing past the runner a cell
   *  away). */
  const nearestHiding = (prey: BrSession[]): [number, number] | null => {
    const size = sector.size;
    const sx = Math.floor(stalker.x);
    const sy = Math.floor(stalker.y);
    const nearest = (x: number, y: number): number => Math.min(...prey.map((p) => Math.hypot(p.x - x, p.y - y)));
    const keep = Math.min(8, nearest(stalker.x, stalker.y));
    const seen = new Set<number>([sy * size + sx]);
    const q: [number, number, number][] = [[sx, sy, 0]];
    for (let h = 0; h < q.length && q.length < 4000; h++) {
      const [x, y, d] = q[h];
      if (d > 0 && !seenCell(x, y) && !isPitCell(sector, x, y) && nearest(x + 0.5, y + 0.5) >= keep) return [x, y];
      if (d >= 24) continue;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        const k = ny * size + nx;
        if (seen.has(k) || !edgeOpen(sector, x, y, nx, ny) || isPitCell(sector, nx, ny)) continue;
        if (nearest(nx + 0.5, ny + 0.5) < 3) continue;
        seen.add(k);
        q.push([nx, ny, d + 1]);
      }
    }
    return null;
  };

  const stalkerTick = (): void => {
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const prey = [...sessions.values()].filter((s) => s.level === 0 && !s.fly && !s.lostAt);
    if (!prey.length) return;
    stalkPrey = prey;
    // THE SEEN GROUND, FROM WHO CAN MATTER (Backrooms law 9, Oct 2026): 720
    // rays a player every 400ms was ~1.6M step checks at 16 players. Every
    // cell the Stalker consults lies within (its mark + the lurk band) or its
    // 24-cell hiding flood, so a player further than their own sight past
    // that region can change no answer — and is skipped. Unplaced, it looks
    // at everyone (that is one arrival, not a habit).
    let seenFrom = prey;
    if (stalker.placed) {
      let md = Infinity;
      for (const q of prey) md = Math.min(md, Math.hypot(q.x - stalker.x, q.y - stalker.y));
      const reach = STALK_SIGHT + md + STALK_BAND_MAX + 4;
      seenFrom = prey.filter((q) => Math.hypot(q.x - stalker.x, q.y - stalker.y) <= reach);
    }
    refreshSeenGround(seenFrom, now);
    if (!stalker.placed) {
      // It arrives where nobody is looking — never watched to appear.
      const anchor = prey[Math.floor(Math.random() * prey.length)];
      for (let tries = 0; tries < 80; tries++) {
        const a = Math.random() * Math.PI * 2;
        const d = 25 + Math.random() * 10;
        const x = Math.floor(anchor.x + Math.cos(a) * d);
        const y = Math.floor(anchor.y + Math.sin(a) * d);
        if (x < 2 || y < 2 || x >= sector.size - 2 || y >= sector.size - 2) continue;
        if (!cellWalkable(sector, x, y) || isPitCell(sector, x, y)) continue;
        if (seenCell(x, y) || sightlinesTo(prey, x + 0.5, y + 0.5).length) continue;
        stalker.x = x + 0.5;
        stalker.y = y + 0.5;
        stalker.placed = true;
        break;
      }
      if (!stalker.placed) return;
    }
    // Nearest prey is the mark — the nearest MORTAL one when there is one
    // (Oct 2026 review). An immortal (the admin's god mode) can't be taken, so
    // marking the nearest body regardless parked it on top of a god-mode admin
    // forever while a player two cells away went untouched. With nobody but
    // immortals about it still follows the nearest, so god mode can watch it.
    let mark: BrSession | null = null;
    const pool = prey.some((s) => !immortals.has(s.userId)) ? prey.filter((s) => !immortals.has(s.userId)) : prey;
    for (const s of pool) {
      if (!mark || Math.hypot(s.x - stalker.x, s.y - stalker.y) < Math.hypot(mark.x - stalker.x, mark.y - stalker.y)) mark = s;
    }
    if (!mark) return;
    stalker.targetId = mark.userId;
    const dist = Math.hypot(mark.x - stalker.x, mark.y - stalker.y);
    const blackout = brownoutEnd > now && brownoutIsBlack;
    const brain = stalker as unknown as EntBrain;

    // THE LIGHT. Always checked first — lit is lit, whatever it was doing.
    // It has to be HELD on it (STALK_BURN_MS); a sweep across it only singes.
    const lit = stalker.mode !== "flee" && litByFlashlight(prey);
    stalker.litMs = lit ? stalker.litMs + ENT_TICK_MS : Math.max(0, stalker.litMs - ENT_TICK_MS * 3);
    stalker.burning = lit;
    if (lit && stalker.litMs >= STALK_BURN_MS) {
      stalker.mode = "flee";
      stalker.burning = false;
      stalker.litMs = 0;
      stalker.lurk = null;
      stalker.fleeUntil = now + 8_000 + Math.random() * 4_000;
      // Straight away from the mark, out of the cone — somewhere unseen if
      // there is one that way.
      const away = Math.atan2(stalker.y - mark.y, stalker.x - mark.x);
      let spot: [number, number] | null = null;
      for (let tries = 0; tries < 12 && !spot; tries++) {
        const a = away + (Math.random() - 0.5) * 1.2;
        const c = walkableNear(stalker.x + Math.cos(a) * 22, stalker.y + Math.sin(a) * 22, 8);
        if (c && !seenCell(c[0], c[1])) spot = c;
      }
      spot ??= walkableNear(stalker.x + Math.cos(away) * 22, stalker.y + Math.sin(away) * 22, 8);
      if (spot) stalker.path = findPath0(stalker.x, stalker.y, spot[0] + 0.5, spot[1] + 0.5, true);
      stalker.pathAt = now;
      // It will try again shortly — sooner in the dark.
      stalker.nextHuntTryAt = now + (blackout ? 6_000 : 15_000);
    }
    const pace = stalker.burning ? STALK_BURN_SLOW : 1;

    if (stalker.mode === "flee") {
      moveAlong0(brain, STALK_FLEE_SPEED, dt);
      if (now >= stalker.fleeUntil || !stalker.path.length) {
        stalker.mode = "shadow";
        stalker.path = [];
      }
    } else if (blackout && now >= stalker.nextHuntTryAt) {
      // THE POWER IS OUT. It comes.
      stalker.mode = "hunt";
      stalker.lurk = null;
      if (straightAt0(stalker.x, stalker.y, mark.x, mark.y)) {
        stalker.path = [];
        const dx = mark.x - stalker.x;
        const dy = mark.y - stalker.y;
        const d = Math.hypot(dx, dy) || 1;
        const move = STALK_HUNT_SPEED * pace * dt;
        stalker.x += (dx / d) * Math.min(move, d);
        stalker.y += (dy / d) * Math.min(move, d);
      } else {
        // Far marks route in STAGES on a slow clock — recomputing a staged
        // path every 500ms re-rolled its random waypoint and the hunt
        // dithered at a tenth of its speed (measured). Direct pursuit keeps
        // the responsive 500ms cadence once it's close.
        const dm = Math.hypot(mark.x - stalker.x, mark.y - stalker.y);
        if (dm > 16) {
          if (!stalker.path.length || now - stalker.pathAt > 1_500) {
            pathToward(brain, mark.x, mark.y);
            stalker.pathAt = now;
          }
        } else if (now - stalker.pathAt > 500 || !stalker.path.length) {
          stalker.path = findPath0(stalker.x, stalker.y, mark.x, mark.y, true);
          stalker.pathAt = now;
        }
        moveAlong0(brain, (dm > 18 ? STALK_HUNT_SPEED * 1.35 : STALK_HUNT_SPEED) * pace, dt);
      }
      if (Math.hypot(mark.x - stalker.x, mark.y - stalker.y) < 0.5 && !immortals.has(mark.userId)) {
        const dead = mark;
        const kx = dead.x;
        const ky = dead.y; // killPlayer's throw slides the body — report the kill spot
        // Thrown away from it — a hard shove from the dark.
        killPlayer(dead, "the stalker", {
          dir: Math.atan2(dead.x - stalker.x, dead.y - stalker.y),
          power: 2.6,
        });
        stalkerCb?.({ type: "kill", x: kx, y: ky, userId: dead.userId });
        stalker.mode = "shadow";
        stalker.path = [];
        stalker.litMs = 0;
        stalker.burning = false;
        stalker.nextHuntTryAt = now + 20_000;
        // It melts back into the dark after a kill.
        const spot = walkableNear(stalker.x, stalker.y, 20);
        if (spot) {
          stalker.x = spot[0] + 0.5;
          stalker.y = spot[1] + 0.5;
        }
      }
    } else {
      // SHADOW. The lights are on (or it was just burned): it follows at a
      // distance and sometimes throws a VOICE.
      if (stalker.mode === "hunt") {
        stalker.mode = "shadow";
        stalker.path = [];
      }
      if (!blackout) {
        // NEVER BE SEEN WHILE THE LIGHTS HOLD (Josh, Aug 2026: "it should
        // never when the lights are on be seen by players… even if the player
        // catches a glimpse of the stalker it will be like a 'whoa what was
        // that' moment"). Any clear line within sight — whichever way they
        // are facing, because people turn round — and it ducks for the
        // nearest cell nobody can see. Fast if they are looking at it or
        // close; otherwise at its ordinary pace, which is still quicker than
        // anyone can follow.
        const watchers = sightlinesTo(prey, stalker.x, stalker.y);
        if (watchers.length) {
          stalker.lurk = null;
          // COMMIT to the hiding place (measured, seed 11: re-choosing it every
          // 600ms while the runner moved flipped it from one side to the
          // other, and it dithered in plain view for a second).
          const h = stalker.hide;
          const redo = h ? seenCell(h[0], h[1]) || !stalker.path.length : !stalker.path.length || now - stalker.pathAt > 1_000;
          if (redo) {
            const hide = nearestHiding(watchers);
            stalker.hide = hide;
            stalker.path = hide ? hiddenPath(hide[0] + 0.5, hide[1] + 0.5) : [];
            if (!stalker.path.length) {
              // Any ground away from them beats standing in their view.
              const seer = watchers[0];
              const away = Math.atan2(stalker.y - seer.y, stalker.x - seer.x);
              const bolt = walkableNear(stalker.x + Math.cos(away) * 14, stalker.y + Math.sin(away) * 14, 7);
              if (bolt) stalker.path = findPath0(stalker.x, stalker.y, bolt[0] + 0.5, bolt[1] + 0.5, true);
            }
            stalker.pathAt = now;
          }
          const spotted = watchers.some((s) => {
            const d = Math.hypot(stalker.x - s.x, stalker.y - s.y);
            if (d <= 10) return true;
            const { fx, fy } = facingOf(s.heading);
            return ((stalker.x - s.x) / d) * fx + ((stalker.y - s.y) / d) * fy > STALK_APPROACH_DOT;
          });
          moveAlong0(brain, (spotted ? STALK_FLEE_SPEED : STALK_SHADOW_SPEED) * pace, dt);
          filmed(0, sector, stalker.x, stalker.y);
          stalkerCb?.({ type: "pos", x: stalker.x, y: stalker.y, mode: stalker.mode, burn: stalker.burning });
          return;
        }
      }

      stalker.hide = null;
      // Unseen. Keep a waiting place in the band, out of sight, and go to it
      // by the dark way. A place goes stale when somebody can now see it, when
      // the mark has moved on so it is no longer in the band, or after a
      // while (so it isn't a statue behind the same door all day).
      const lo = blackout ? 7 : STALK_BAND_MIN;
      const hi = blackout ? 12 : STALK_BAND_MAX;
      const lk = stalker.lurk;
      const lkd = lk ? Math.hypot(lk[0] + 0.5 - mark.x, lk[1] + 0.5 - mark.y) : 0;
      const stale =
        !lk ||
        (!blackout && seenCell(lk[0], lk[1])) ||
        lkd < lo - 3 ||
        lkd > hi + 6 ||
        now - stalker.lurkAt > 14_000;
      if (dist > hi + 30) {
        // A long way behind — close the gap in stages; nobody is near enough
        // to see it doing so.
        if (!stalker.path.length || now - stalker.pathAt > 2_000) {
          pathToward(brain, mark.x, mark.y);
          stalker.pathAt = now;
        }
      } else if (stale && now - stalker.pathAt > 500) {
        const spot = pickLurk(mark, lo, hi, !blackout);
        if (spot) {
          stalker.lurk = spot;
          stalker.lurkAt = now;
          stalker.path = blackout ? findPath0(stalker.x, stalker.y, spot[0] + 0.5, spot[1] + 0.5, true) : hiddenPath(spot[0] + 0.5, spot[1] + 0.5);
        } else if (dist < lo) {
          // Nowhere hidden in the band: at least don't sit on top of them.
          const away = Math.atan2(stalker.y - mark.y, stalker.x - mark.x);
          const back = walkableNear(stalker.x + Math.cos(away) * 10, stalker.y + Math.sin(away) * 10, 5);
          if (back) stalker.path = hiddenPath(back[0] + 0.5, back[1] + 0.5);
        }
        stalker.pathAt = now;
      }
      // It never takes a step INTO someone's view on its own account: if the
      // next step of the route is seen ground and the ground it stands on is
      // not, it waits for the line to clear (or the place goes stale) — while
      // it has room to. Once somebody is closer than STALK_BAND_MIN - 4 it
      // stops waiting and goes, by the darkest route there is: a glimpse of
      // it leaving beats being walked into in a dead end.
      let hold = false;
      if (!blackout && stalker.path.length && dist >= STALK_BAND_MIN - 4) {
        const nxt = stalker.path[0];
        const here = seenCell(Math.floor(stalker.x), Math.floor(stalker.y));
        if (!here && seenCell(nxt[0], nxt[1])) hold = true;
      }
      if (!hold) moveAlong0(brain, STALK_SHADOW_SPEED * pace, dt);
      // THE VOICE. A snatch of somebody's own words, from the wrong dark.
      if (now >= stalker.nextMimicAt && dist <= 30) {
        stalker.nextMimicAt = now + 20_000 + Math.random() * 25_000;
        const others = prey.filter((s) => s.userId !== mark.userId);
        const of = (others.length ? others[Math.floor(Math.random() * others.length)] : mark).userId;
        stalkerCb?.({ type: "mimic", of, x: stalker.x, y: stalker.y });
      }
    }
    filmed(0, sector, stalker.x, stalker.y);
    stalkerCb?.({ type: "pos", x: stalker.x, y: stalker.y, mode: stalker.mode, burn: stalker.burning });
    // Ops trace (BACKROOMS_STALKER_DEBUG=1): one line per second.
    if (process.env.BACKROOMS_STALKER_DEBUG && now % 1000 < ENT_TICK_MS) {
      console.log(
        `[stalker] ${stalker.mode} at ${stalker.x.toFixed(1)},${stalker.y.toFixed(1)} ` +
          `path=${stalker.path.length} mark=${mark.x.toFixed(1)},${mark.y.toFixed(1)} d=${dist.toFixed(1)} black=${blackout} lit=${stalker.litMs}`,
      );
    }
  };

  /** Is the straight segment between two points walkable end to end? Samples
   *  it finely; every cell transition it crosses must be step-legal. This is
   *  both the sight ray and the path SMOOTHER (see moveAlong). */
  const lineWalkableIn = (sec: Sector, x0: number, y0: number, x1: number, y1: number): boolean => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / 0.15));
    let pcx = Math.floor(x0);
    let pcy = Math.floor(y0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.floor(x0 + (x1 - x0) * t);
      const cy = Math.floor(y0 + (y1 - y0) * t);
      if (cx !== pcx || cy !== pcy) {
        if (!stepAllowed(sec, pcx, pcy, cx, cy)) return false;
        pcx = cx;
        pcy = cy;
      }
    }
    return true;
  };
  const lineWalkable = (x0: number, y0: number, x1: number, y1: number): boolean =>
    lineWalkableIn(sector, x0, y0, x1, y1);
  /** A straight line with a BODY: the centre line and two more either side
   *  of it, 0.22 cells off. A creature taking a shortcut or lunging straight
   *  in uses this, so it goes round the end of a wall instead of shaving
   *  through it. (Sight stays a thin line — you can glimpse past an edge.) */
  const fatLineIn = (sec: Sector, x0: number, y0: number, x1: number, y1: number): boolean => {
    if (!lineWalkableIn(sec, x0, y0, x1, y1)) return false;
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.001) return true;
    const ox = (-(y1 - y0) / d) * 0.22;
    const oy = ((x1 - x0) / d) * 0.22;
    return (
      lineWalkableIn(sec, x0 + ox, y0 + oy, x1 + ox, y1 + oy) &&
      lineWalkableIn(sec, x0 - ox, y0 - oy, x1 - ox, y1 - oy)
    );
  };

  /** Does a straight segment pass over any cell a creature refuses to enter?
   *  `lineWalkableIn` answers "are there walls in the way", which is a
   *  DIFFERENT question — a river with no wall over it is perfectly
   *  walkable and still absolutely off-limits to THE SHY GUY. Every
   *  straight-line shortcut has to ask this one too. */
  const crossesShunned = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    shun: (x: number, y: number) => boolean,
  ): boolean => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / 0.25));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (shun(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return true;
    }
    return false;
  };
  /** Pickup line-of-sight in the PLAYER'S OWN world (no reaching through
   *  drywall, on either level). */
  const pickupLos = (s: BrSession, x: number, y: number): boolean =>
    lineWalkableIn(secOf(s), s.x, s.y, x, y);

  /** Straight line of sight, capped at what it can actually see. */
  const losClear = (x0: number, y0: number, x1: number, y1: number): boolean =>
    Math.hypot(x1 - x0, y1 - y0) <= ENT_SIGHT && lineWalkable(x0, y0, x1, y1);

  /** The node budget one search may spend. It bounds the tick; see PATHING
   *  below for why it is now enough where it used to run out. */
  const PATH_BUDGET = 12000;
  /** Did the last findPathIn run out of budget (a partial answer)? For the
   *  debug view: a chase that keeps getting partial routes is a chase lost to
   *  the search, not to the runner. */
  let lastPathPartial = false;

  /** PATHING — A*, cell centres, EIGHT-WAY (diagonals are legal wherever an
   *  L-route around the corner is open, so the route cuts corners instead of
   *  climbing a staircase of axis moves).
   *
   *  IT USED TO BE A PLAIN BFS, and that was measurably the biggest source of
   *  stuck creatures (Aug 2026). A breadth-first flood expands equally in
   *  every direction, so most of its budget goes on ground AWAY from the
   *  target: measured on the real Sector A, a mark only 8 cells off already
   *  cost 4,122 nodes at p90 and 86,252 at worst, and 8.3% of ordinary
   *  16-32 cell repaths hit the cap and returned NOTHING — whereupon the
   *  chase code, with no path, simply stood still. In a 25s pursuit sim,
   *  13 of 111 creatures never moved a single cell.
   *
   *  A* with a Chebyshev heuristic (admissible AND consistent here, since
   *  all eight moves cost 1) pulls the search at the target: 2.5-4.6x fewer
   *  nodes, ~2x faster, and — verified over 2,000 pairs on both sectors —
   *  it returns paths of EXACTLY the same length. This is a pure search
   *  upgrade, not a behaviour change.
   *
   *  `shun` (optional) marks ground a creature refuses to enter even though
   *  the world allows it — THE SHY GUY's pit rule is the only user.
   *
   *  `partial`: when the budget runs out, return the route to the closest
   *  node the search actually reached instead of giving up. A pursuer then
   *  walks the right way and re-plans from nearer, which is what takes the
   *  frozen-creature count in that same sim from 13 to 0. It is OPT-IN
   *  because a few callers use an empty result as a reachability TEST
   *  (shyPlaceNear); for them a half-path would be a lie. */
  const findPathIn = (
    sec: Sector,
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    shun?: (x: number, y: number) => boolean,
    partial = false,
    /** The cost of stepping INTO a cell (default 1). A creature slowed by
     *  water passes its travel TIME here, so its route goes round a pool when
     *  going round is quicker. Every cost must be >= 1 (the heuristic counts
     *  steps). */
    costOf?: (x: number, y: number) => number,
    /** Refuse a diagonal unless BOTH L-routes round the corner are open —
     *  i.e. no wall touches the corner it passes. The usual rule (either L)
     *  is right for a player's collision, which has a radius; a creature
     *  walks its cell-centre line, and on the usual rule that line runs
     *  straight through the END of a thin wall (measured on A6: an Entity
     *  crossing the drywall at 102.9,154). Level 0's creatures use this. */
    clearCorners = false,
  ): [number, number][] => {
    const from = [Math.floor(fx), Math.floor(fy)] as [number, number];
    const to = [Math.floor(tx), Math.floor(ty)] as [number, number];
    if (from[0] === to[0] && from[1] === to[1]) return [];
    const size = sec.size;
    const key = (x: number, y: number): number => y * size + x;
    const h = (x: number, y: number): number =>
      Math.max(Math.abs(x - to[0]), Math.abs(y - to[1]));
    const g = new Map<number, number>();
    const parent = new Map<number, number>();
    // Binary heap of cell keys ordered by f — the old array-as-queue used
    // shift(), which is O(n) and was re-copying a 12,000-entry queue.
    const hk: number[] = [];
    const hf: number[] = [];
    const push = (k: number, f: number): void => {
      hk.push(k);
      hf.push(f);
      let i = hk.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hf[p] <= hf[i]) break;
        [hk[p], hk[i]] = [hk[i], hk[p]];
        [hf[p], hf[i]] = [hf[i], hf[p]];
        i = p;
      }
    };
    const pop = (): number => {
      const top = hk[0];
      const lk = hk.pop()!;
      const lf = hf.pop()!;
      if (hk.length) {
        hk[0] = lk;
        hf[0] = lf;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < hk.length && hf[l] < hf[m]) m = l;
          if (r < hk.length && hf[r] < hf[m]) m = r;
          if (m === i) break;
          [hk[m], hk[i]] = [hk[i], hk[m]];
          [hf[m], hf[i]] = [hf[i], hf[m]];
          i = m;
        }
      }
      return top;
    };
    const startK = key(from[0], from[1]);
    const goalK = key(to[0], to[1]);
    g.set(startK, 0);
    parent.set(startK, -1);
    push(startK, h(from[0], from[1]));
    const build = (endK: number): [number, number][] => {
      const out: [number, number][] = [];
      let cur = endK;
      while (cur !== -1 && cur !== startK) {
        out.unshift([cur % size, Math.floor(cur / size)]);
        cur = parent.get(cur) ?? -1;
      }
      return out;
    };
    let bestK = startK;
    let bestH = h(from[0], from[1]);
    let guard = 0;
    lastPathPartial = false;
    while (hk.length && guard++ < PATH_BUDGET) {
      const ck = pop();
      if (ck === goalK) return build(goalK);
      const x = ck % size;
      const y = (ck - x) / size;
      const ch = h(x, y);
      if (ch < bestH) {
        bestH = ch;
        bestK = ck;
      }
      const cg = g.get(ck)!;
      for (const [nx, ny] of [
        [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y],
        [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1],
      ] as [number, number][]) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const nk = key(nx, ny);
        const ng = cg + (costOf ? costOf(nx, ny) : 1);
        // Costs >= 1 + a consistent heuristic ⇒ a node reached this cheaply
        // never needs reopening (a cheaper route re-pushes it).
        if (g.has(nk) && g.get(nk)! <= ng) continue;
        if (!stepAllowed(sec, x, y, nx, ny)) continue;
        if (clearCorners && nx !== x && ny !== y) {
          const bothL =
            edgeOpen(sec, x, y, nx, y) && edgeOpen(sec, nx, y, nx, ny) &&
            edgeOpen(sec, x, y, x, ny) && edgeOpen(sec, x, ny, nx, ny);
          if (!bothL) continue;
        }
        if (shun?.(nx, ny)) continue;
        // DIAGONALS CUT CORNERS. Walking from one legal cell to another
        // diagonally passes through one of the two cells between them, and
        // that cell can be the very thing the creature refuses to enter —
        // which is how THE SHY GUY kept clipping the corner of a pool while
        // "following a dry path". A diagonal is only legal if some L-route
        // round it is both open AND dry.
        if (shun && nx !== x && ny !== y) {
          const viaX = edgeOpen(sec, x, y, nx, y) && edgeOpen(sec, nx, y, nx, ny) && !shun(nx, y);
          const viaY = edgeOpen(sec, x, y, x, ny) && edgeOpen(sec, x, ny, nx, ny) && !shun(x, ny);
          if (!viaX && !viaY) continue;
        }
        g.set(nk, ng);
        parent.set(nk, ck);
        push(nk, ng + h(nx, ny));
      }
    }
    // Out of budget (or genuinely walled in). Head for the closest ground the
    // search did reach, if the caller wants to keep moving.
    lastPathPartial = true;
    return partial && bestK !== startK ? build(bestK) : [];
  };
  const findPath = (
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    partial = false,
  ): [number, number][] => findPathIn(sector, fx, fy, tx, ty, undefined, partial);

  /** Walk the path — STRING-PULLED. Before each step it drops every waypoint
   *  it can already reach in a straight line, so the creature moves on real
   *  diagonals through open floor instead of snapping cell-center to
   *  cell-center on the grid axes. Motion is free-angle; walls are still the
   *  only thing that bends its course. */
  /** `tax` (optional): the speed cap for a given CELL. Applied to the cell the
   *  step would land in as well as the one it starts from, because a per-tick
   *  cap read only at the origin lets a creature cross a full tick's worth of
   *  ground into slower footing at its old pace. Harmless at 3.5 cells/s
   *  (0.35 of a cell); at 5.7 it measurably broke THE SHY GUY's headline
   *  promise — the harness clocked him at 1.73-1.80 cells/s through shallow
   *  water where his cap is 1.45 and a walking player does 1.60. */
  const moveAlongIn = (
    sec: Sector,
    e: EntBrain,
    speed: number,
    dt: number,
    shun?: (x: number, y: number) => boolean,
    tax?: (x: number, y: number) => number,
    /** String-pull only along a fatLine (Level 0's creatures). */
    fat = false,
  ): void => {
    let skipped = 0;
    while (e.path.length >= 2 && skipped < 12) {
      const nxt = e.path[1];
      if (!(fat ? fatLineIn : lineWalkableIn)(sec, e.x, e.y, nxt[0] + 0.5, nxt[1] + 0.5)) break;
      // A string-pull must respect the SAME refusals the path did, or the
      // shortcut walks straight across the channel the route went round.
      if (shun && crossesShunned(e.x, e.y, nxt[0] + 0.5, nxt[1] + 0.5, shun)) break;
      e.path.shift();
      skipped++;
    }
    const step = e.path[0];
    if (!step) return;
    const tx = step[0] + 0.5;
    const ty = step[1] + 0.5;
    const d = Math.hypot(tx - e.x, ty - e.y);
    let move = speed * dt;
    if (tax && d > 0.0001) {
      // Where would that put us? Charge the slower of here and there.
      const px = d <= move ? tx : e.x + ((tx - e.x) / d) * move;
      const py = d <= move ? ty : e.y + ((ty - e.y) / d) * move;
      move = Math.min(move, tax(Math.floor(px), Math.floor(py)) * dt);
    }
    const nx = d <= move ? tx : e.x + ((tx - e.x) / d) * move;
    const ny = d <= move ? ty : e.y + ((ty - e.y) / d) * move;
    // THE HARD BACKSTOP. Paths and shortcuts are both corner-safe above, but
    // a refusal this absolute ("it will not go in the water") should not rest
    // on every route being provably right. If the next position lands in
    // forbidden ground, don't take the step — the repath a moment later will
    // find another way round, or it will give up and leave.
    if (shun?.(Math.floor(nx), Math.floor(ny))) {
      e.path = [];
      return;
    }
    e.x = nx;
    e.y = ny;
    if (d <= move) e.path.shift();
  };
  const moveAlong = (e: EntBrain, speed: number, dt: number): void => moveAlongIn(sector, e, speed, dt);

  const rng = (): number => Math.random();

  let entityCb: ((ev: EntityEvent) => void) | null = null;
  /** Health events the client didn't ask for (falls) — net relays them. */
  let hurtCb: ((ev: { userId: number; hp: number; drop: number; dead: boolean; cause?: string; x?: number; y?: number; level?: BrLevel }) => void) | null = null;
  let deathCb: ((ev: BrDeathEvent) => void) | null = null;

  /** A random walkable cell within r of (cx,cy), or null. */
  const walkableNearIn = (
    sec: Sector,
    cx: number,
    cy: number,
    r: number,
    shun?: (x: number, y: number) => boolean,
  ): [number, number] | null => {
    for (let tries = 0; tries < 40; tries++) {
      const a = rng() * Math.PI * 2;
      const d = 1 + rng() * r;
      const x = Math.floor(cx + Math.cos(a) * d);
      const y = Math.floor(cy + Math.sin(a) * d);
      if (x < 2 || y < 2 || x >= sec.size - 2 || y >= sec.size - 2) continue;
      if (!cellWalkable(sec, x, y) || isPitCell(sec, x, y)) continue;
      if (shun?.(x, y)) continue;
      return [x, y];
    }
    return null;
  };
  const walkableNear = (cx: number, cy: number, r: number): [number, number] | null =>
    walkableNearIn(sector, cx, cy, r);

  /** Path toward a possibly-distant target in STAGES: findPath's BFS is
   *  capped (its cost bounds the tick), so a cross-map trek routes to an
   *  intermediate waypoint ~28 cells along the way and re-stages on arrival. */
  /** Nearest walkable cell to a point, by DETERMINISTIC spiral — staged
   *  waypoints must not re-roll direction on every recompute, or the trek
   *  wanders instead of progressing (measured: a hunt at 2.55 cells/s made
   *  ~0.1 cells/s of real headway on random waypoints). */
  const spiralNearIn = (
    sec: Sector,
    cx: number,
    cy: number,
    r: number,
    shun?: (x: number, y: number) => boolean,
  ): [number, number] | null => {
    const bx = Math.round(cx);
    const by = Math.round(cy);
    for (let ring = 0; ring <= r; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const x = bx + dx;
          const y = by + dy;
          if (x < 2 || y < 2 || x >= sec.size - 2 || y >= sec.size - 2) continue;
          if (!cellWalkable(sec, x, y) || isPitCell(sec, x, y)) continue;
          if (shun?.(x, y)) continue;
          return [x, y];
        }
      }
    }
    return null;
  };
  const spiralNear = (cx: number, cy: number, r: number): [number, number] | null =>
    spiralNearIn(sector, cx, cy, r);

  // THE WAY HOME, AS A FIELD (Oct 2026). A trek planned with A* runs out of
  // its PATH_BUDGET (12,000 cells) long before it has searched a long way
  // round on a 33,000-cell level; the partial plan is then "the closest cell
  // reached", which from a pocket facing the goal is the cell it stands in —
  // an empty path, re-planned identically every 2.5s, forever. Measured: a
  // relic Entity frozen 83 cells from its post at 114,77 for good.
  // A breadth-first DISTANCE FIELD from the goal, over the whole level and
  // under the same rules the creature's own planner uses (the climb rule,
  // walls, no shaft, no corner-cutting), has no local minimum to sit in:
  // every reachable cell has a neighbour one step closer. Cached per goal
  // cell, so a fixed post costs one BFS.
  // keyed by the sector OBJECT: a map swap replaces it and starts afresh
  const fieldCaches = new WeakMap<Sector, Map<string, Int32Array>>();
  const travel0 = (ax: number, ay: number, bx: number, by: number): boolean => {
    if (!stepAllowed(sector, ax, ay, bx, by) || noPit0(bx, by)) return false;
    if (ax === bx || ay === by) return true;
    // the creature's clearCorners rule: both L-routes open, neither a shaft
    return (
      edgeOpen(sector, ax, ay, bx, ay) && edgeOpen(sector, bx, ay, bx, by) &&
      edgeOpen(sector, ax, ay, ax, by) && edgeOpen(sector, ax, by, bx, by) &&
      !noPit0(bx, ay) && !noPit0(ax, by)
    );
  };
  const NEIGH8: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const distanceField0 = (tx: number, ty: number): Int32Array => {
    const gx = Math.floor(tx);
    const gy = Math.floor(ty);
    let fieldCache = fieldCaches.get(sector);
    if (!fieldCache) fieldCaches.set(sector, (fieldCache = new Map()));
    const key = `${gx},${gy}`;
    const hit = fieldCache.get(key);
    if (hit) return hit;
    const size = sector.size;
    const dist = new Int32Array(size * size).fill(-1);
    if (gx >= 0 && gy >= 0 && gx < size && gy < size) {
      const q = new Int32Array(size * size);
      let head = 0;
      let tail = 0;
      dist[gy * size + gx] = 0;
      q[tail++] = gy * size + gx;
      while (head < tail) {
        const k = q[head++];
        const x = k % size;
        const y = (k - x) / size;
        for (const [dx, dy] of NEIGH8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const nk = ny * size + nx;
          // a creature at n must be able to step INTO (x,y): the climb rule
          // is one-way, so the edge is checked in the direction of travel
          if (dist[nk] !== -1 || !travel0(nx, ny, x, y)) continue;
          dist[nk] = dist[k] + 1;
          q[tail++] = nk;
        }
      }
    }
    if (fieldCache.size >= 16) fieldCache.delete(fieldCache.keys().next().value!);
    fieldCache.set(key, dist);
    return dist;
  };
  /** Up to `max` cells downhill on a field, from where the creature stands. */
  const downhill0 = (e: EntBrain, field: Int32Array, max = 24): [number, number][] => {
    const size = sector.size;
    let x = Math.floor(e.x);
    let y = Math.floor(e.y);
    const out: [number, number][] = [];
    for (let i = 0; i < max; i++) {
      const here = field[y * size + x];
      if (here <= 0) break; // unreachable (-1) or arrived (0)
      let best: [number, number] | null = null;
      let bestD = here;
      for (const [dx, dy] of NEIGH8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const d = field[ny * size + nx];
        if (d < 0 || d >= bestD || !travel0(x, y, nx, ny)) continue;
        best = [nx, ny];
        bestD = d;
      }
      if (!best) break;
      out.push(best);
      [x, y] = best;
    }
    return out;
  };

  const pathToward = (e: EntBrain, tx: number, ty: number): void => {
    const d = Math.hypot(tx - e.x, ty - e.y);
    const stageAt = (len: number): [number, number] | null => {
      const frac = Math.min(1, len / d);
      return spiralNear(e.x + (tx - e.x) * frac, e.y + (ty - e.y) * frac, 8);
    };
    // Try a mid stage, then the full target, then a short hop — an empty
    // path must never strand a trek (the frozen-hunt lesson).
    for (const len of d > 14 ? [14, d, 7] : [d]) {
      const spot = stageAt(len);
      if (!spot) continue;
      e.path = findPath0(e.x, e.y, spot[0] + 0.5, spot[1] + 0.5, true);
      if (e.path.length) break;
    }
    // Every staged plan came back empty: the creature is in a pocket the
    // budgeted search can't see out of. The field always can.
    if (!e.path.length) e.path = downhill0(e, distanceField0(tx, ty));
    e.pathAt = Date.now();
  };

  /** Keep each brain bound to a live relic site (sites come and go as they
   *  spawn and get picked up); claim unclaimed ones, drop dead ones. */
  const assignHomes = (): void => {
    const live = new Set(relicSites.map((r) => r.id));
    for (const e of relicEnts()) if (e.homeRelic !== -1 && !live.has(e.homeRelic)) e.homeRelic = -1;
    for (const e of relicEnts()) {
      if (e.homeRelic !== -1) continue;
      const claimed = new Set(relicEnts().map((o) => o.homeRelic));
      const free = relicSites.find((r) => !claimed.has(r.id));
      if (free) {
        e.homeRelic = free.id;
        e.nextPickAt = 0;
      }
    }
  };

  /** LEVEL 0's SHAFTS ARE ONE-WAY. A pit is a legal step (you may always walk
   *  off an edge) and there is no climbing out, so a creature that ever
   *  entered one would be gone for the life of the process. Level 0's own
   *  creatures refuse them outright — in the route, the string-pull and the
   *  straight-line chase — rather than trusting that no target ever stands
   *  on the far side of one. */
  const noPit0 = (x: number, y: number): boolean => isPitCell(sector, x, y);
  const findPath0 = (fx: number, fy: number, tx: number, ty: number, partial = false): [number, number][] =>
    findPathIn(sector, fx, fy, tx, ty, noPit0, partial, undefined, true);
  const moveAlong0 = (e: EntBrain, speed: number, dt: number): void => moveAlongIn(sector, e, speed, dt, noPit0, undefined, true);
  /** Can a Level 0 creature lunge straight at (x1,y1)? A body-wide line, no shaft on it. */
  const straightAt0 = (x0: number, y0: number, x1: number, y1: number): boolean =>
    fatLineIn(sector, x0, y0, x1, y1) && !crossesShunned(x0, y0, x1, y1, noPit0);

  /** Somewhere on the keeper's beat: a cell KEEP_NEAR..KEEP_FAR from the key
   *  that can be walked to from the key's own cell. */
  const keeperSpot = (): [number, number] | null => {
    const kx = theKeyHome.x;
    const ky = theKeyHome.y;
    for (let tries = 0; tries < 30; tries++) {
      const a = rng() * Math.PI * 2;
      const r = KEEP_NEAR + rng() * (KEEP_FAR - KEEP_NEAR);
      const spot = spiralNear(kx + Math.cos(a) * r, ky + Math.sin(a) * r, 3);
      if (!spot) continue;
      const d = Math.hypot(spot[0] + 0.5 - kx, spot[1] + 0.5 - ky);
      if (d < KEEP_NEAR - 1 || d > KEEP_FAR + 2) continue;
      // Straight-line distance lies across walls: the route must be short
      // too, or "near the key" is the far side of a wall a long walk round.
      const route = findPath0(kx, ky, spot[0] + 0.5, spot[1] + 0.5);
      if (route.length && route.length <= KEEP_FAR * 1.8) return spot;
    }
    return null;
  };

  /** THE KEEPER's beat: out on the ring around the key, and every 3-5 picks a
   *  pass THROUGH it — to within a step of the key, then on out the far side. */
  const keeperBeat = (e: EntBrain, now: number): void => {
    // THE DOOR IS OPEN (Josh, Sep 30 2026: "if player get the key and unlock
    // the next level then the 3rd entity should just wonder around the entire
    // map"). Nothing left to keep: it treks from one far corner of Level 0 to
    // another, a new destination each time it arrives.
    if (store.brGetFlag(LEVEL1_FLAG)) {
      const dest = e.via;
      // A destination it can't reach (a pocket no route leads into) or
      // hasn't reached in 90s is given up rather than retried for ever.
      if (dest && Math.hypot(dest[0] + 0.5 - e.x, dest[1] + 0.5 - e.y) > 2 && now < (e.roamUntil ?? 0)) {
        if (!e.path.length || now - e.pathAt > 2_500) {
          pathToward(e, dest[0] + 0.5, dest[1] + 0.5);
          if (!e.path.length) e.roamUntil = 0;
        }
        return;
      }
      if (now < e.nextPickAt) return;
      e.nextPickAt = now + ENT_PICK_MIN_MS + rng() * ENT_PICK_SPAN_MS;
      e.via = null;
      for (let tries = 0; tries < 60 && !e.via; tries++) {
        const x = 2 + Math.floor(rng() * (sector.size - 4));
        const y = 2 + Math.floor(rng() * (sector.size - 4));
        if (!cellWalkable(sector, x, y) || isPitCell(sector, x, y)) continue;
        if (Math.hypot(x - e.x, y - e.y) < 40) continue;
        e.via = [x, y];
      }
      if (e.via) {
        e.roamUntil = now + 90_000;
        pathToward(e, e.via[0] + 0.5, e.via[1] + 0.5);
      }
      return;
    }
    const kx = theKeyHome.x;
    const ky = theKeyHome.y;
    const dk = Math.hypot(kx - e.x, ky - e.y);
    if (dk > KEEP_FAR + 10) {
      // Drawn off its beat (a chase, a noise) — walk back to it.
      if (!e.path.length || now - e.pathAt > 2_500) {
        e.path = findPath0(e.x, e.y, kx, ky, true);
        e.pathAt = now;
        e.via = null;
      }
      return;
    }
    if (e.path.length) return;
    if (e.via) {
      // Through the key and out the other side.
      const [vx, vy] = e.via;
      e.via = null;
      e.path = findPath0(e.x, e.y, vx + 0.5, vy + 0.5, true);
      e.pathAt = now;
      return;
    }
    if (now < e.nextPickAt) return;
    e.nextPickAt = now + ENT_PICK_MIN_MS + rng() * ENT_PICK_SPAN_MS;
    e.picks = (e.picks ?? 0) + 1;
    if (e.picks >= (e.passAt ?? KEEP_PASS_MIN)) {
      e.picks = 0;
      e.passAt = KEEP_PASS_MIN + Math.floor(rng() * 3);
      const at = spiralNear(kx, ky, 2);
      const ax = Math.atan2(ky - e.y, kx - e.x);
      const far = spiralNear(kx + Math.cos(ax) * (KEEP_NEAR + 3), ky + Math.sin(ax) * (KEEP_NEAR + 3), 4);
      if (at) {
        e.path = findPath0(e.x, e.y, at[0] + 0.5, at[1] + 0.5, true);
        e.via = far;
        e.pathAt = now;
        return;
      }
    }
    const spot = keeperSpot();
    if (spot) e.path = findPath0(e.x, e.y, spot[0] + 0.5, spot[1] + 0.5, true);
    e.pathAt = now;
  };

  const entityTick = (): void => {
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    // A FROZEN BODY IS NOBODY'S PREY (Nov 2026 validation run): a dropped
    // connection never kills anybody, on any level. Levels 2-9 always skipped
    // a run whose socket was lost; Levels 0 and 1 went on hunting it.
    const prey = [...sessions.values()].filter((s) => s.level === 0 && !s.lostAt);
    if (!prey.length) return; // nobody down there — the world holds its breath
    // First placement: far from every door, at a walkable cell.
    if (!entsPlaced) {
      entsPlaced = true;
      for (const e of ents) {
        if (e.keeper) {
          // The keeper starts on its beat, somewhere around the key.
          const spot = keeperSpot();
          if (spot) {
            e.x = spot[0] + 0.5;
            e.y = spot[1] + 0.5;
            continue;
          }
        }
        for (let tries = 0; tries < 80; tries++) {
          const x = 2 + Math.floor(rng() * (sector.size - 4));
          const y = 2 + Math.floor(rng() * (sector.size - 4));
          // NOT INTO A SHAFT. Level 0 has 155 pit cells and — measured — not
          // one of them has a legal way back out (the climb rule lets you drop
          // in and never climb out), so an entity seeded in one is gone for
          // the life of the process. Every other placement in this file
          // already screened for pits; this one, the first, did not.
          if (!cellWalkable(sector, x, y) || isPitCell(sector, x, y)) continue;
          if (sector.doors.some((d) => Math.hypot(d.x - x, d.y - y) < 40)) continue;
          e.x = x + 0.5;
          e.y = y + 0.5;
          break;
        }
      }
    }
    assignHomes();
    // THE SWAP: both brains trade posts and walk each other's beat — the
    // cross-map trek is scheduled, not incidental. Never mid-chase.
    if (now >= nextSwapAt) {
      nextSwapAt = now + SWAP_MIN_MS + rng() * (SWAP_MAX_MS - SWAP_MIN_MS);
      const [ra, rb] = relicEnts();
      if (ra.mode === "patrol" && rb.mode === "patrol" && ra.homeRelic !== -1 && rb.homeRelic !== -1 && ra.homeRelic !== rb.homeRelic) {
        const a = ra.homeRelic;
        ra.homeRelic = rb.homeRelic;
        rb.homeRelic = a;
        for (const e of [ra, rb]) {
          e.path = [];
          e.nextPickAt = 0;
        }
      }
    }

    for (const e of ents) {
      if (now < e.restUntil) {
        entityCb?.({ type: "pos", id: e.id, x: e.x, y: e.y, mode: "wander" });
        continue;
      }
      // Sight: anyone on Level 0 with a clear line becomes the quarry.
      let seen: BrSession | null = null;
      for (const s of prey) {
        if (s.fly) continue;
        if (losClear(e.x, e.y, s.x, s.y)) {
          if (!seen || Math.hypot(s.x - e.x, s.y - e.y) < Math.hypot(seen.x - e.x, seen.y - e.y)) seen = s;
        }
      }
      if (seen) {
        e.lastLosAt = now;
        e.lastSeenX = seen.x;
        e.lastSeenY = seen.y;
        e.mode = "chase";
        e.targetId = seen.userId;
      }

      if (e.mode === "chase") {
        const target = sessions.get(e.targetId);
        // Out of sight it hunts the spot it last saw you, not you: reaching
        // it empty-handed ends the chase as surely as the clock does.
        const sees = e.lastLosAt === now;
        const gx = sees || e.lastSeenX === undefined ? (target?.x ?? e.x) : e.lastSeenX;
        const gy = sees || e.lastSeenY === undefined ? (target?.y ?? e.y) : e.lastSeenY;
        if (!target || target.level !== 0 || target.lostAt || now - e.lastLosAt > LOS_GRACE_MS || (!sees && Math.hypot(gx - e.x, gy - e.y) < 0.8)) {
          e.mode = "patrol";
          e.path = [];
          e.nextPickAt = 0;
        } else {
          // With a clear line it comes STRAIGHT at you, at the exact angle
          // between you — no grid, no cell centers (the diagonal-dodge fix).
          if (straightAt0(e.x, e.y, gx, gy)) {
            e.path = [];
            const dx = gx - e.x;
            const dy = gy - e.y;
            const d = Math.hypot(dx, dy);
            const move = ENT_CHASE_SPEED * dt;
            if (d > 0.001) {
              e.x += (dx / d) * Math.min(move, d);
              e.y += (dy / d) * Math.min(move, d);
            }
          } else {
            if (now - e.pathAt > 500 || !e.path.length) {
              e.path = findPath0(e.x, e.y, gx, gy, true);
              e.pathAt = now;
            }
            moveAlong0(e, ENT_CHASE_SPEED, dt);
          }
          // Touch = death (immortal playtesters just get shoved by nothing).
          if (
            Math.hypot(target.x - e.x, target.y - e.y) < 0.5 &&
            !immortals.has(target.userId) &&
            !target.fly
          ) {
            const dead = target;
            const kx = dead.x;
            const ky = dead.y; // killPlayer's throw slides the body — report the kill spot
            // The touch of death LAUNCHES you — the signature send-off.
            killPlayer(dead, "the entity", {
              dir: Math.atan2(dead.x - e.x, dead.y - e.y),
              power: 3.4,
            });
            e.mode = "patrol";
            e.path = [];
            // A kill sates it — it stands over the body a while.
            e.restUntil = now + 18_000 + rng() * 12_000;
            entityCb?.({ type: "kill", id: e.id, x: kx, y: ky, userId: dead.userId });
          }
        }
      } else {
        // PATROL. Fresh noise outranks the beat; otherwise orbit the home
        // relic — random ground nearby, ALWAYS circling back through the
        // site itself — or free-prowl if unassigned.
        // A noise it has reached is spent: it looks round, finds nothing, and
        // goes back to its beat (it used to stand on the spot re-planning a
        // zero-length route to it until the 12s memory ran out).
        if (e.stimulus && Math.hypot(e.stimulus.x - e.x, e.stimulus.y - e.y) < 1.5) {
          e.stimulus = null;
          e.path = [];
          e.nextPickAt = now + 1_500 + rng() * 2_000;
        }
        const stim = e.stimulus && now - e.stimulus.at < 12_000 ? e.stimulus : null;
        const home = relicSites.find((r) => r.id === e.homeRelic) ?? null;
        if (stim) {
          if (now - e.pathAt > 900 || !e.path.length) {
            e.path = findPath0(e.x, e.y, stim.x, stim.y, true);
            e.pathAt = now;
          }
        } else if (e.keeper) {
          keeperBeat(e, now);
        } else if (home && Math.hypot(home.x - e.x, home.y - e.y) > 16) {
          // The trek to a far post (or back to one it drifted from).
          // Downhill on the post's distance field — the field never strands a
          // trek (see distanceField0); the old staged plan is only the
          // fallback for a post the field can't reach.
          if (!e.path.length || now - e.pathAt > 2_500) {
            e.path = downhill0(e, distanceField0(home.x, home.y));
            e.pathAt = now;
            if (!e.path.length) pathToward(e, home.x, home.y);
          }
        } else if (!e.path.length && now >= e.nextPickAt) {
          e.nextPickAt = now + ENT_PICK_MIN_MS + rng() * ENT_PICK_SPAN_MS;
          if (home && rng() < 0.3) {
            // Circle back through the relic itself.
            e.path = findPath0(e.x, e.y, home.x, home.y);
          } else {
            const around = home ? walkableNear(home.x, home.y, 10) : walkableNear(e.x, e.y, 22);
            if (around) e.path = findPath0(e.x, e.y, around[0] + 0.5, around[1] + 0.5);
          }
          e.pathAt = now;
        }
        moveAlong0(e, ENT_WANDER_SPEED, dt);
      }
      filmed(0, sector, e.x, e.y);
      entityCb?.({ type: "pos", id: e.id, x: e.x, y: e.y, mode: e.mode === "chase" ? "chase" : "wander" });
    }
  };

  // ---- SPAWNED ENTITIES (the map editor's Game layer, marks.ts) -------------
  // Josh, Sep 2026: "creature spawners with their own settings". A spawner
  // is a point in a room design; every copy of the room the generator lays
  // down carries one (or its chance of one) into Sector.marks. Each spawned
  // Entity wanders its OWN ground — within `roam` cells of its spawner —
  // instead of guarding relics like the two that were always here, on
  // whichever level it was placed (Pipe Dreams has no creature but these).
  // It is the Entity in every other way: the same sight rule, the same
  // hearing, the same touch, the same death ("the entity"), at the spawner's
  // speed and sight. A body only thinks while somebody is within SPAWN_WAKE
  // cells, so two dozen of them cost nothing on an empty level.
  interface SpawnBrain extends EntBrain {
    level: BrLevel;
    homeX: number;
    homeY: number;
    roam: number;
    speedMul: number;
    sight: number;
  }
  const spawned: SpawnBrain[] = [];
  // PLAY THE DRAFT: levels being test-played, and what to put back after
  const testing = new Map<BrLevel, { by: number; since: number; sectorId: string; entered: boolean; stash: { sector: Sector; sectorId: string; enabled: boolean; corpses: typeof corpses; drops: typeof drops; relics: { id: number; relicId: string; x: number; y: number }[] } }>();
  let testEndCb: ((level: BrLevel, userIds: number[]) => void) | null = null;
  testingLevel = (level) => testing.has(level);
  /** A test ends when its player is gone (walked out, died, lost the wire
   *  for 20s) or after an hour whatever — a level must never stay closed.
   *  Before they first walk in they get TEST_ARRIVE_MS to pick a loadout. */
  const TEST_MAX_MS = 60 * 60_000;
  const TEST_ARRIVE_MS = 3 * 60_000;
  const testSweep = setInterval(() => {
    const now = Date.now();
    for (const [level, t] of testing) {
      const s = sessions.get(t.by);
      const gone = !s || s.level !== level || (s.lostAt !== null && now - s.lostAt > 20_000);
      if ((gone && (t.entered || now - t.since > TEST_ARRIVE_MS)) || now - t.since > TEST_MAX_MS) api.endTest(level);
    }
  }, 3_000);
  testSweep.unref?.();
  let spawnSeq = 100; // clear of the two relic Entities' ids
  const SPAWN_WAKE = 48;
  /** WHAT A SPAWNED ENTITY REFUSES, per level (Backrooms law 2, Oct 2026 —
   *  the map editor's Entities had none of the hardening Level 0's own
   *  creatures got): a lethal shaft anywhere (a pit is a one-way step, so a
   *  creature that entered one was gone for the life of the process); deep
   *  water in the Poolrooms (it walked about SUBMERGED, a body on the pool
   *  floor); and Pipe Dreams' lit safe rooms (break, control and drain rooms
   *  are the level's promise — the Grabber keeps it, so this does too). The
   *  same rule is used in the route, the string-pull, the straight lunge and
   *  the seat, because a refusal honoured in only one of them is a hole. */
  const spawnShun = (level: BrLevel): ((x: number, y: number) => boolean) => {
    const sec = secBy(level);
    if (level === 1) return (x, y) => isPitCell(sec, x, y) || swimDeepAt(x, y);
    if (level === 2) return (x, y) => isPitCell(sec, x, y) || pipeSafeAt(x, y);
    if (level === 4) return (x, y) => isPitCell(sec, x, y) || officeSafeAt(x, y);
    if (level === 5) return (x, y) => isPitCell(sec, x, y) || hotelSafeAt(x, y);
    if (level === 6) return (x, y) => isPitCell(sec, x, y) || lightsSafeAt(x, y);
    if (level === 7) return (x, y) => isPitCell(sec, x, y) || oceanSafeAt(x, y);
    if (level === 8) return (x, y) => isPitCell(sec, x, y) || caveSafeAt(x, y);
    if (level === 9) return (x, y) => isPitCell(sec, x, y) || suburbSafeAt(x, y) || suburbIndoor(sec, x, y);
    return (x, y) => isPitCell(sec, x, y);
  };
  /** Is this body out of a spawned Entity's reach on its level? (In a safe
   *  room on Pipe Dreams; swimming in the Poolrooms' deep water.) */
  const sheltered = (level: BrLevel, s: BrSession): boolean => {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (level === 2) return pipeSafeAt(x, y);
    if (level === 1) return swimDeepAt(x, y);
    if (level === 4) return officeSafeAt(x, y);
    if (level === 5) return hotelSafeAt(x, y);
    if (level === 6) return lightsSafeAt(x, y);
    if (level === 7) return oceanSafeAt(x, y);
    if (level === 8) return caveSafeAt(x, y);
    if (level === 9) return suburbSafeAt(x, y) || suburbIndoor(sectorU, x, y);
    return false;
  };
  /** (Re)seat a level's spawned Entities from its map's markers. */
  const seatSpawners = (level: BrLevel): void => {
    for (let i = spawned.length - 1; i >= 0; i--) if (spawned[i].level === level) spawned.splice(i, 1);
    const sec = secBy(level);
    let count = 0;
    for (const m of sec.marks ?? []) {
      if (m.k !== "entity") continue;
      for (let k = 0; k < (m.n ?? 1) && count < MAX_SPAWNED; k++, count++) {
        // seated by the same refusals it walks by — never in a shaft, the
        // deep end or a safe room, whatever the marker's exact cell is
        const at = spiralNearIn(sec, m.x - 0.5 + k, m.y - 0.5, 8, spawnShun(level));
        if (!at) continue;
        spawned.push({
          id: spawnSeq++,
          level,
          x: at[0] + 0.5,
          y: at[1] + 0.5,
          mode: "patrol",
          targetId: 0,
          lastLosAt: 0,
          path: [],
          pathAt: 0,
          homeRelic: -1,
          nextPickAt: 0,
          restUntil: 0,
          stimulus: null,
          homeX: m.x,
          homeY: m.y,
          roam: m.roam ?? CREATURE_USUAL.entity.roam,
          speedMul: (m.speed ?? 100) / 100,
          sight: m.sight ?? ENT_SIGHT,
        });
      }
    }
    const n = spawned.filter((e) => e.level === level).length;
    if (n) console.log(`[backrooms] Level ${level}: ${n} spawned entit${n === 1 ? "y" : "ies"} from the map's spawners`);
  };

  const spawnedTick = (): void => {
    if (!spawned.length) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const byLevel = new Map<BrLevel, BrSession[]>();
    for (const s of sessions.values()) {
      if (s.lostAt) continue;
      const list = byLevel.get(s.level) ?? [];
      list.push(s);
      byLevel.set(s.level, list);
    }
    for (const e of spawned) {
      const prey = byLevel.get(e.level);
      if (!prey?.length) continue;
      // asleep while nobody is near: no thinking, no frames
      if (!prey.some((s) => Math.hypot(s.x - e.x, s.y - e.y) <= SPAWN_WAKE)) continue;
      const sec = secBy(e.level);
      const shun = spawnShun(e.level);
      if (now < e.restUntil) {
        entityCb?.({ type: "pos", id: e.id, x: e.x, y: e.y, mode: "wander", level: e.level });
        continue;
      }
      let seen: BrSession | null = null;
      for (const s of prey) {
        if (s.fly || sheltered(e.level, s)) continue;
        const d = Math.hypot(s.x - e.x, s.y - e.y);
        if (d <= e.sight && lineWalkableIn(sec, e.x, e.y, s.x, s.y) && (!seen || d < Math.hypot(seen.x - e.x, seen.y - e.y))) seen = s;
      }
      if (seen) {
        e.lastLosAt = now;
        e.lastSeenX = seen.x;
        e.lastSeenY = seen.y;
        e.mode = "chase";
        e.targetId = seen.userId;
      }
      const chase = ENT_CHASE_SPEED * e.speedMul;
      const wander = ENT_WANDER_SPEED * e.speedMul;
      if (e.mode === "chase") {
        const target = sessions.get(e.targetId);
        // out of sight: the spot it last saw you, not you (as Level 0's)
        const sees = e.lastLosAt === now;
        const gx = sees || e.lastSeenX === undefined ? (target?.x ?? e.x) : e.lastSeenX;
        const gy = sees || e.lastSeenY === undefined ? (target?.y ?? e.y) : e.lastSeenY;
        if (!target || target.level !== e.level || now - e.lastLosAt > LOS_GRACE_MS || sheltered(e.level, target) || (!sees && Math.hypot(gx - e.x, gy - e.y) < 0.8)) {
          e.mode = "patrol";
          e.path = [];
          e.nextPickAt = 0;
        } else {
          // the lunge is body-wide and refuses what the route refuses
          if (fatLineIn(sec, e.x, e.y, gx, gy) && !crossesShunned(e.x, e.y, gx, gy, shun)) {
            e.path = [];
            const dx = gx - e.x;
            const dy = gy - e.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.001) {
              e.x += (dx / d) * Math.min(chase * dt, d);
              e.y += (dy / d) * Math.min(chase * dt, d);
            }
          } else {
            if (now - e.pathAt > 500 || !e.path.length) {
              e.path = findPathIn(sec, e.x, e.y, gx, gy, shun, true, undefined, true);
              e.pathAt = now;
            }
            moveAlongIn(sec, e, chase, dt, shun, undefined, true);
          }
          if (Math.hypot(target.x - e.x, target.y - e.y) < 0.5 && !immortals.has(target.userId) && !target.fly) {
            const dead = target;
            const kx = dead.x;
            const ky = dead.y;
            killPlayer(dead, "the entity", { dir: Math.atan2(dead.x - e.x, dead.y - e.y), power: 3.4 });
            e.mode = "patrol";
            e.path = [];
            e.restUntil = now + 18_000 + rng() * 12_000;
            entityCb?.({ type: "kill", id: e.id, x: kx, y: ky, userId: dead.userId, level: e.level });
          }
        }
      } else {
        // A noise it has reached is SPENT (Level 0's fix): it looks round,
        // finds nothing, and goes back to its ground instead of standing on
        // the spot re-planning a zero-length route until the memory runs out.
        if (e.stimulus && Math.hypot(e.stimulus.x - e.x, e.stimulus.y - e.y) < 1.5) {
          e.stimulus = null;
          e.path = [];
          e.nextPickAt = now + 1_500 + rng() * 2_000;
        }
        const stim = e.stimulus && now - e.stimulus.at < 12_000 ? e.stimulus : null;
        if (stim) {
          if (now - e.pathAt > 900 || !e.path.length) {
            e.path = findPathIn(sec, e.x, e.y, stim.x, stim.y, shun, true, undefined, true);
            e.pathAt = now;
          }
        } else if (Math.hypot(e.homeX - e.x, e.homeY - e.y) > e.roam + 4) {
          // strayed after a chase: back to its own ground
          if (!e.path.length || now - e.pathAt > 2_500) {
            e.path = findPathIn(sec, e.x, e.y, e.homeX, e.homeY, shun, true, undefined, true);
            e.pathAt = now;
          }
        } else if (!e.path.length && now >= e.nextPickAt) {
          e.nextPickAt = now + 5_000 + rng() * 8_000;
          const around = walkableNearIn(sec, e.homeX, e.homeY, e.roam, shun);
          if (around) e.path = findPathIn(sec, e.x, e.y, around[0] + 0.5, around[1] + 0.5, shun, false, undefined, true);
          e.pathAt = now;
        }
        moveAlongIn(sec, e, wander, dt, shun, undefined, true);
      }
      filmed(e.level, sec, e.x, e.y);
      entityCb?.({ type: "pos", id: e.id, x: e.x, y: e.y, mode: e.mode === "chase" ? "chase" : "wander", level: e.level });
    }
  };

  // ---- THE SHY GUY (Josh, Aug 2026) — the Poolrooms' creature -------------
  // SCP-096's rules, because Josh's model IS 096 and its canon already is the
  // design: harmless until you LOOK AT IT, and then it is not.
  //
  //  · It only exists while somebody down here is CARRYING A RELIC. Treasure
  //    is what calls it; an empty-handed swim never meets it.
  //  · It appears intermittently and ALWAYS out of sight — the spawn search
  //    rejects any cell with a clear line to any player, so it arrives from
  //    around a corner — then shadows the carrier at a distance, docile.
  //  · EYE CONTACT is the trigger, and it means the crosshair ON THE MODEL
  //    (Josh: "direct aim cursor on his model"). The client owns that
  //    precision and reports it; the server re-validates range, line and
  //    facing, and keeps a coarse backstop cone of its own so that simply
  //    never sending the report can't be the meta.
  //  · Triggered, it covers its face and SCREAMS for SHY_TRIGGER_MS — your
  //    head start — then runs faster than anyone can sprint.
  //  · WATER IS THE ESCAPE, and since Aug 2026 it is a SPEED rule, not a
  //    wall (Josh: "he can walk in water thats fine but he is slower than
  //    the player in water"). It goes anywhere you can — but every depth
  //    band costs it more than it costs you, so open water is where you take
  //    ground back. The numbers are pinned against the player's own wade and
  //    swim scales in shyWaterSpeed; if those change, change these.
  //  · Escaped, it flees screaming until nobody holds a line to it, and is
  //    gone. It comes back. It always comes back. "Escaped" is now a GAP —
  //    open SHY_LOSE_GAP cells for SHY_LOSE_MS and it gives up — which is
  //    what makes swimming away actually end the chase.
  //  · After it takes the carrier it stays BLOODED a moment: anyone still
  //    standing close gets taken too, relic or not.
  const SHY_LURK_SPEED = 1.45;
  /** TWICE A SPRINT (Josh, Aug 2026), the same bargain the stalker got: on
   *  DRY LAND it is not a race, it is a countdown, and the counterplay is the
   *  water rather than your legs. The wading caps below are floors on this,
   *  so doubling the land speed leaves the whole water doctrine untouched. */
  const SHY_CHASE_SPEED = SPRINT * 2; // 5.7 cells/s
  const SHY_FLEE_SPEED = SPRINT * 2.2;
  /** You got away: this much distance, held this long, and it gives up. */
  const SHY_LOSE_GAP = 16;
  const SHY_LOSE_MS = 3_000;
  const SHY_TRIGGER_MS = Number(process.env.BACKROOMS_SHY_TRIGGER_MS ?? 2_200);
  const SHY_LURK_MIN = Number(process.env.BACKROOMS_SHY_LURK_MIN_MS ?? 45_000);
  const SHY_LURK_MAX = Number(process.env.BACKROOMS_SHY_LURK_MAX_MS ?? 95_000);
  const SHY_GAP_MIN = Number(process.env.BACKROOMS_SHY_GAP_MIN_MS ?? 70_000);
  const SHY_GAP_MAX = Number(process.env.BACKROOMS_SHY_GAP_MAX_MS ?? 170_000);
  const SHY_CHASE_MAX_MS = 90_000; // a chase that can never land still ends
  const SHY_BLOODED_MS = 12_000;
  const SHY_BLOODED_RANGE = 11;
  const SHY_RING = 8.5; // the distance it shadows from
  /** THE CREEP (Josh, Aug 2026). While nobody is looking at it, it closes —
   *  slowly — and stops at this range. Watched, it stands perfectly still.
   *  You look away, you look back, and it is nearer than it was. */
  const SHY_CREEP_SPEED = 1.15;
  const SHY_CREEP_MIN = 4.5;
  /** How wide "looking at it" is for the creep: generous, because what makes
   *  it work is that it never moves while you might notice. */
  const SHY_WATCH_DOT = 0.55;
  const SHY_SEE_MAX = 34; // the furthest a look can reach it
  const SHY_KILL = 0.55;

  type ShyMode = "lurk" | "trigger" | "chase" | "flee" | "leave";
  const shy = {
    live: false,
    mode: "lurk" as ShyMode,
    x: 0,
    y: 0,
    targetId: 0,
    path: [] as [number, number][],
    pathAt: 0,
    lurkUntil: 0,
    chaseAt: 0,
    chaseUntil: 0,
    bloodedUntil: 0,
    /** Backstop stare clock — how long the crosshair has sat on it. */
    stareSince: 0,
    nextSpawnAt: 0,
    nextDriftAt: 0,
    /** Since when every route to the mark has been blocked (0 = it has one). */
    noRouteSince: 0,
    /** Since when the target has held a real gap open (0 = still close). */
    losingSince: 0,
    goneBy: 0,
    /** Admin playtest appearance: it ignores the relic rule for this one
     *  visit, so the mechanic can be exercised without farming treasure. */
    summoned: false,
  };
  let shyCb: ((ev: ShyEvent) => void) | null = null;
  let kitSwapCb: ((level: BrLevel, chunks: { cx: number; cy: number }[]) => void) | null = null;

  /** Depth in STEPS of the water standing on a pools cell (0 = dry). */
  const poolDepth = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= sectorP.size || y >= sectorP.size) return 0;
    const i = y * sectorP.size + x;
    const w = sectorP.water?.[i] ?? WATER_NONE;
    return w === WATER_NONE ? 0 : Math.max(0, w - sectorP.floor[i]);
  };
  /** Deep enough to swim in — the band where a player floats at the surface. */
  const swimDeepAt = (x: number, y: number): boolean => poolDepth(x, y) >= SWIM_DEPTH_STEPS;

  /** The ONE thing it still refuses: a lethal shaft. Water is a tax now, not
   *  a wall, but walking into a pit that would kill a player is not menace,
   *  it's a bug — and `findPathIn` (unlike walkableNear) has no pit rule of
   *  its own. Deep water is nowhere near PIT_LETHAL, so this never catches
   *  a pool. */
  const shyShuns = (x: number, y: number): boolean => isPitCell(sectorP, x, y);

  /** WATER SLOWS IT MORE THAN IT SLOWS YOU (Josh, Aug 2026). Pinned directly
   *  against the player's own scales in BackroomsGame.svelte, so the promise
   *  is arithmetic rather than vibes — a player who keeps moving is faster
   *  than it at EVERY depth, and in the deep even a casual swimmer is:
   *
   *    depth        player (walk / sprint)      THE SHY GUY
   *    dry          2.05 / 2.85                 5.70   ← it wins on land, twice over
   *    >0.15m ×.78  1.60 / 2.22                 1.45
   *    >0.6m  ×.55  1.13 / 1.57                 1.00
   *    swim   ×.50  1.03 / 1.43                 0.80
   *
   *  Note it is under the player's WALKING speed in every band, not just the
   *  sprint — "slower than the player in water" shouldn't come with an
   *  asterisk about whether you remembered to hold shift.
   */
  const shyWaterSpeed = (base: number, x: number, y: number): number => {
    const steps = poolDepth(x, y);
    if (steps <= 0) return base;
    if (steps >= SWIM_DEPTH_STEPS) return Math.min(base, 0.8);
    const metres = steps * FLOOR_STEP;
    if (metres > 0.6) return Math.min(base, 1.0);
    if (metres > 0.15) return Math.min(base, 1.45);
    return base;
  };

  /** THE SHY GUY ROUTES BY TIME, NOT DISTANCE (Sep 2026, the rebuilt
   *  Poolrooms): water taxes him to walking pace or slower, so on a map built
   *  round rivers the shortest line is often the slowest — cutting across a
   *  bank's shallows after a runner who stays on the towpath is how a sprinter
   *  escaped him on dry land. His chase is costed by how long each cell takes. */
  let shyRepaths = 0;
  let shyPartials = 0;
  const shyCost = (x: number, y: number): number => SHY_CHASE_SPEED / shyWaterSpeed(SHY_CHASE_SPEED, x, y);
  /** …AND WHILE HIS QUARRY IS ON DRY FLOOR HE KEEPS TO IT (Oct 2026). A swim
   *  that is quicker on paper commits him to a line the runner, still moving
   *  along the bank, has already left — measured as the "gains ground while
   *  you run" flake: staged at a pool edge, he swam a deep shortcut and lost
   *  the runner on every failing pass. Swimming costs double while the target
   *  is dry; a target in the water is chased through it as before. */
  const shyCostDry = (x: number, y: number): number => shyCost(x, y) * (poolDepth(x, y) >= SWIM_DEPTH_STEPS ? 2 : 1);
  /** Does the straight line between two points wade through any water? */
  const lineWet = (ax: number, ay: number, bx: number, by: number): boolean => {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d * 4));
    for (let k = 0; k <= n; k++) {
      if (poolDepth(Math.floor(ax + ((bx - ax) * k) / n), Math.floor(ay + ((by - ay) * k) / n)) > 0) return true;
    }
    return false;
  };

  const shyDespawn = (now: number): void => {
    shy.live = false;
    shy.path = [];
    shy.targetId = 0;
    shy.stareSince = 0;
    shy.bloodedUntil = 0;
    shy.summoned = false;
    shy.noRouteSince = 0;
    shy.losingSince = 0;
    shy.nextSpawnAt = now + SHY_GAP_MIN + rng() * (SHY_GAP_MAX - SHY_GAP_MIN);
    shyCb?.({ type: "gone" });
  };

  /** Put it down near the mark but AROUND A CORNER — no cell that any player
   *  can already see. Nobody ever watches it arrive. */
  const shyPlaceNear = (mark: BrSession, inside: BrSession[]): boolean => {
    for (let tries = 0; tries < 160; tries++) {
      const a = rng() * Math.PI * 2;
      const d = 8 + rng() * 10;
      const x = Math.floor(mark.x + Math.cos(a) * d);
      const y = Math.floor(mark.y + Math.sin(a) * d);
      if (x < 2 || y < 2 || x >= sectorP.size - 2 || y >= sectorP.size - 2) continue;
      // It ARRIVES on footing — it will wade and swim once it's hunting, but
      // materialising chest-deep in a pool looks like a spawn bug, not a
      // creature.
      if (!cellWalkable(sectorP, x, y) || isPitCell(sectorP, x, y) || swimDeepAt(x, y)) continue;
      if (inside.some((s) => lineWalkableIn(sectorP, s.x, s.y, x + 0.5, y + 0.5))) continue;
      // It has to be able to actually WALK to its mark from there.
      if (!findPathIn(sectorP, x + 0.5, y + 0.5, mark.x, mark.y, shyShuns, false, undefined, true).length) continue;
      shy.x = x + 0.5;
      shy.y = y + 0.5;
      return true;
    }
    return false;
  };

  /** Commit the trigger: face covered, the scream, then the run. */
  const shyBeginTrigger = (userId: number, now: number): void => {
    shy.mode = "trigger";
    shy.targetId = userId;
    shy.chaseAt = now + SHY_TRIGGER_MS;
    shy.chaseUntil = shy.chaseAt + SHY_CHASE_MAX_MS;
    shy.path = [];
    shy.stareSince = 0;
    shy.losingSince = 0;
    shy.noRouteSince = 0; // a lurk that couldn't route must not end the charge
  };

  /** Eye contact, wherever the claim came from. Everything about the sighting
   *  is re-checked here — a report is a request, not a fact. */
  const shySeenBy = (s: BrSession | undefined, now: number): boolean => {
    if (!shy.live || shy.mode !== "lurk" || !s) return false;
    if (s.level !== 1 || s.fly) return false;
    // It only takes offence at someone carrying treasure — unless it's still
    // blooded from a kill, or an admin summoned it for a playtest.
    if (!s.relics.length && !shy.summoned && now >= shy.bloodedUntil) return false;
    const dx = shy.x - s.x;
    const dy = shy.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d > SHY_SEE_MAX || d < 0.01) return false;
    if (!lineWalkableIn(sectorP, s.x, s.y, shy.x, shy.y)) return false;
    // Roughly the right way round — the client owns the pixel-accurate part.
    const { fx, fy } = facingOf(s.heading);
    if ((dx / d) * fx + (dy / d) * fy < 0.5) return false;
    shyBeginTrigger(s.userId, now);
    return true;
  };

  const shyTick = (): void => {
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const inside = [...sessions.values()].filter((s) => s.level === 1 && !s.fly && !s.lostAt);
    if (!inside.length) {
      if (shy.live) shyDespawn(now);
      return;
    }
    const carriers = inside.filter((s) => s.relics.length > 0);

    if (!shy.live) {
      // TREASURE IS WHAT CALLS IT.
      if (!carriers.length || now < shy.nextSpawnAt) return;
      const mark = carriers[Math.floor(rng() * carriers.length)];
      if (!shyPlaceNear(mark, inside)) {
        shy.nextSpawnAt = now + 8_000; // no corner to arrive around — try again shortly
        return;
      }
      shy.live = true;
      shy.mode = "lurk";
      shy.targetId = mark.userId;
      shy.path = [];
      shy.pathAt = 0;
      shy.stareSince = 0;
      shy.lurkUntil = now + SHY_LURK_MIN + rng() * (SHY_LURK_MAX - SHY_LURK_MIN);
    }

    /** Move it, paying the wading tax for the water it is in AND the water it
     *  is stepping into (see moveAlongIn's `tax`). */
    const shyMove = (speed: number): void => {
      moveAlongIn(
        sectorP,
        shy as unknown as EntBrain,
        shyWaterSpeed(speed, Math.floor(shy.x), Math.floor(shy.y)),
        dt,
        shyShuns,
        (x, y) => shyWaterSpeed(speed, x, y),
        true,
      );
    };
    /** Away from everyone; gone the moment nobody holds a line to it. */
    const shyRetreat = (speed: number): void => {
      let near: BrSession | null = null;
      for (const s of inside) {
        if (!near || Math.hypot(s.x - shy.x, s.y - shy.y) < Math.hypot(near.x - shy.x, near.y - shy.y)) near = s;
      }
      if (!shy.path.length || now - shy.pathAt > 1_500) {
        // Straight away first, then progressively less fussy. One fixed
        // bearing could land on a wall or an unroutable pocket, and a
        // creature that is supposed to be FLEEING SCREAMING standing rooted
        // in the open reads as a crash, not a monster.
        const away = near ? Math.atan2(shy.y - near.y, shy.x - near.x) : rng() * Math.PI * 2;
        for (const [turn, reach] of [[0, 20], [0.9, 16], [-0.9, 16], [0, 9]] as [number, number][]) {
          const spot = walkableNearIn(
            sectorP,
            shy.x + Math.cos(away + turn) * reach,
            shy.y + Math.sin(away + turn) * reach,
            9,
            shyShuns,
          );
          if (!spot) continue;
          shy.path = findPathIn(sectorP, shy.x, shy.y, spot[0] + 0.5, spot[1] + 0.5, shyShuns, true, undefined, true);
          if (shy.path.length) break;
        }
        shy.pathAt = now;
      }
      shyMove(speed);
      const watched = inside.some(
        (s) => Math.hypot(s.x - shy.x, s.y - shy.y) <= 30 && lineWalkableIn(sectorP, s.x, s.y, shy.x, shy.y),
      );
      if (!watched || now >= shy.goneBy) shyDespawn(now);
    };
    /** Break off — screaming (triggered) or quietly (it just got bored). */
    const shyBreakOff = (screaming: boolean): void => {
      shy.mode = screaming ? "flee" : "leave";
      shy.path = [];
      shy.pathAt = 0;
      shy.goneBy = now + 25_000;
    };

    if (shy.mode === "flee" || shy.mode === "leave") {
      shyRetreat(shy.mode === "flee" ? SHY_FLEE_SPEED : SHY_LURK_SPEED * 1.4);
    } else if (shy.mode === "lurk") {
      // Stay bound to a carrier. If they banked, died or left, take another —
      // and if nobody down here is carrying anything, lose interest.
      let mark = sessions.get(shy.targetId) ?? null;
      if (!mark || mark.level !== 1 || mark.fly || mark.lostAt || (!mark.relics.length && !shy.summoned)) {
        mark = carriers.length ? carriers.reduce((a, b) =>
          Math.hypot(a.x - shy.x, a.y - shy.y) <= Math.hypot(b.x - shy.x, b.y - shy.y) ? a : b) : null;
        shy.targetId = mark?.userId ?? 0;
      }
      if (!mark) {
        shyBreakOff(false);
      } else {
        const dist = Math.hypot(mark.x - shy.x, mark.y - shy.y);
        // THE BACKSTOP. The client's report is the responsive path; this is
        // what keeps "just don't send it" from being the meta. The cone is
        // the model's own angular width, so it only fires when the crosshair
        // is unambiguously ON it, held for a beat.
        let staring = false;
        if (dist > 0.01 && dist <= SHY_SEE_MAX) {
          const half = Math.max(0.05, Math.min(0.17, Math.atan2(0.8, dist)));
          const { fx, fy } = facingOf(mark.heading);
          const dot = ((shy.x - mark.x) / dist) * fx + ((shy.y - mark.y) / dist) * fy;
          staring = dot > Math.cos(half) && lineWalkableIn(sectorP, mark.x, mark.y, shy.x, shy.y);
        }
        if (!staring) shy.stareSince = 0;
        else if (!shy.stareSince) shy.stareSince = now;
        else if (now - shy.stareSince >= 400) shySeenBy(mark, now);

        // Is ANYONE looking its way with a clear line? Not just the mark —
        // being watched by a bystander should freeze it too.
        const watchedByMark = inside.some((s) => {
          const dx = shy.x - s.x;
          const dy = shy.y - s.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.01 || d > SHY_SEE_MAX) return false;
          const { fx, fy } = facingOf(s.heading);
          if ((dx / d) * fx + (dy / d) * fy < SHY_WATCH_DOT) return false;
          return lineWalkableIn(sectorP, s.x, s.y, shy.x, shy.y);
        });

        if (shy.mode === "lurk") {
          if (now >= shy.lurkUntil) {
            shyBreakOff(false); // it drifts off unseen, and comes back later
          } else if (watchedByMark) {
            // IT ONLY MOVES WHEN NOBODY IS LOOKING (Josh, Aug 2026: "make him
            // watch the players from a distance, moving in on them when no one
            // is looking at him, like very ominous"). Under a gaze it simply
            // stands and watches back — you glance away, glance back, and it
            // is nearer than it was. This REPLACES the old shadowing ring:
            // holding a fixed distance and creeping in are different
            // creatures, and the creep is the one he asked for.
            shy.path = [];
            shy.noRouteSince = 0;
          } else if (dist > SHY_CREEP_MIN) {
            // Unobserved: close, slowly, and stop short of touching.
            if (!shy.path.length || now - shy.pathAt > 1_000) {
              // A DETERMINISTIC approach point: the spot on the line between
              // them, one creep-radius short of the mark. The old version
              // re-rolled a RANDOM cell around the mark every second — the
              // very mistake spiralNearIn exists to prevent — so it drifted in
              // from a different side each time instead of walking AT you.
              // Measured over 9s from 15 cells: 8.16 → 8.59 cells closed, and
              // more to the point it now comes straight on, which is the
              // whole effect Josh asked for.
              const aim = Math.max(0, (dist - SHY_CREEP_MIN) / Math.max(dist, 0.001));
              const spot = spiralNearIn(
                sectorP,
                shy.x + (mark.x - shy.x) * aim,
                shy.y + (mark.y - shy.y) * aim,
                9,
                shyShuns,
              );
              if (spot) shy.path = findPathIn(sectorP, shy.x, shy.y, spot[0] + 0.5, spot[1] + 0.5, shyShuns, true, undefined, true);
              shy.pathAt = now;
              // NO WAY ROUND. In a level this flooded a mark is often across
              // water it would rather not cross; a creature stuck at range for
              // a minute is a statue, not a threat. A little patience, then it
              // slopes off and comes back somewhere it can actually reach.
              if (!shy.path.length) {
                if (!shy.noRouteSince) shy.noRouteSince = now;
              } else {
                shy.noRouteSince = 0;
              }
            }
            if (shy.noRouteSince && now - shy.noRouteSince > 8_000) shyBreakOff(false);
            else shyMove(SHY_CREEP_SPEED);
          } else {
            // Close enough. It waits, right there, in your peripheral vision.
            shy.path = [];
            // Standing at your shoulder is not "no way round" — clear the
            // clock, or a spell of bad routing earlier means it walks off the
            // moment you step away from it.
            shy.noRouteSince = 0;
          }
        }
      }
    }

    // The panic runs its course, then it comes.
    if (shy.mode === "trigger" && now >= shy.chaseAt) {
      shy.mode = "chase";
      shy.path = [];
      shy.pathAt = 0;
    }

    if (shy.mode === "chase") {
      const target = sessions.get(shy.targetId);
      const gap = target ? Math.hypot(target.x - shy.x, target.y - shy.y) : 0;
      // YOU GOT AWAY. Open real distance and hold it — which, since it is
      // slower than you in every depth of water, is what swimming buys you.
      //
      // HYSTERESIS, and it matters: on land it closes 5.7 cells a second, so
      // over the three-second window it eats 17 cells all by itself. Arming
      // and disarming on the same number meant a chase that started at 24
      // cells dropped under the threshold before the timer ever ran out, and
      // it never gave up at all. Arm at SHY_LOSE_GAP; only disarm once it has
      // genuinely closed back in.
      //
      // Which is the point of the whole rule: ON DRY LAND THE GAP CANNOT BE
      // HELD, because it is twice your sprint. The only place the arithmetic
      // works in your favour is water, where it is slower than your walk at
      // every depth. That is the escape, and now it is the ONLY escape.
      if (target && gap >= SHY_LOSE_GAP) {
        if (!shy.losingSince) shy.losingSince = now;
      } else if (!target || gap < SHY_LOSE_GAP * 0.55) {
        shy.losingSince = 0;
      }
      if (!target || target.level !== 1 || target.fly || target.lostAt) {
        shyBreakOff(true);
      } else if (shy.losingSince && now - shy.losingSince >= SHY_LOSE_MS) {
        shyBreakOff(true);
      } else if (now >= shy.chaseUntil) {
        shyBreakOff(true);
      } else {
        if (
          lineWalkableIn(sectorP, shy.x, shy.y, target.x, target.y) &&
          !crossesShunned(shy.x, shy.y, target.x, target.y, shyShuns) &&
          // the straight charge only when it stays dry — or when you are in
          // the water yourself and there is no dry way to you
          (poolDepth(Math.floor(target.x), Math.floor(target.y)) > 0 || !lineWet(shy.x, shy.y, target.x, target.y))
        ) {
          // Straight at you, at the true angle — no grid, no cell centres.
          shy.path = [];
          const dx = target.x - shy.x;
          const dy = target.y - shy.y;
          const d = Math.hypot(dx, dy);
          let move = shyWaterSpeed(SHY_CHASE_SPEED, Math.floor(shy.x), Math.floor(shy.y)) * dt;
          if (d > 0.001) {
            // Same rule as moveAlongIn's tax: the water it is charging INTO
            // costs it from the moment it crosses the line, not a tick later.
            const px = shy.x + (dx / d) * Math.min(move, d);
            const py = shy.y + (dy / d) * Math.min(move, d);
            move = Math.min(move, shyWaterSpeed(SHY_CHASE_SPEED, Math.floor(px), Math.floor(py)) * dt);
            shy.x += (dx / d) * Math.min(move, d);
            shy.y += (dy / d) * Math.min(move, d);
          }
          // A CLEAR LINE IS A ROUTE. Without this the give-up clock kept
          // running through a charge it was visibly winning: three seconds of
          // failed repaths behind a wall, then it comes round the corner and
          // sprints straight at you for two more — and the instant the line
          // breaks again the stale timer is already past four seconds and it
          // breaks off. It chased, then fled, having never stopped closing.
          shy.noRouteSince = 0;
        } else {
          if (now - shy.pathAt > 500 || !shy.path.length) {
            const targetDry = poolDepth(Math.floor(target.x), Math.floor(target.y)) <= 0;
            shy.path = findPathIn(sectorP, shy.x, shy.y, target.x, target.y, shyShuns, true, targetDry ? shyCostDry : shyCost, true);
            shy.pathAt = now;
            shyPartials += lastPathPartial ? 1 : 0;
            shyRepaths++;
            // A CHASE CAN FAIL TO ROUTE. findPath's node budget is finite, so
            // a target far enough through enough geometry comes back with no
            // path at all — and a charging creature that then just stands
            // still is the worst-looking bug of the lot. Give it the same
            // patience the lurk has, then let it break off properly.
            //
            // THIS IS THE BUG JOSH SAW (Aug 2026: "after I ran away a bit he
            // ran away"). Under the old flood-fill search, a target who had
            // opened any real distance failed to route ~8% of the time per
            // attempt; a run of those inside four seconds and the creature
            // stopped dead and then fled — losing the chase to a pathfinder,
            // not to the player. A* plus the partial fallback above means an
            // empty result now really does mean walled in.
            if (!shy.path.length) {
              if (!shy.noRouteSince) shy.noRouteSince = now;
            } else {
              shy.noRouteSince = 0;
            }
          }
          if (shy.noRouteSince && now - shy.noRouteSince > 4_000) shyBreakOff(true);
          else shyMove(SHY_CHASE_SPEED);
        }
        if (Math.hypot(target.x - shy.x, target.y - shy.y) < SHY_KILL && !immortals.has(target.userId)) {
          const dead = target;
          const kx = dead.x;
          const ky = dead.y; // killPlayer's throw slides the body — report the kill spot
          // Hit at full charge — the body keeps the charge's momentum.
          killPlayer(dead, "the shy guy", {
            dir: Math.atan2(dead.x - shy.x, dead.y - shy.y),
            power: 4.5,
          });
          shyCb?.({ type: "kill", x: kx, y: ky, userId: dead.userId });
          // BLOODED: whoever else is standing this close is next, relic or not.
          shy.bloodedUntil = now + SHY_BLOODED_MS;
          const bystanders = inside.filter(
            (s) => s.userId !== dead.userId && sessions.has(s.userId) &&
              Math.hypot(s.x - shy.x, s.y - shy.y) <= SHY_BLOODED_RANGE,
          );
          if (bystanders.length) {
            const next = bystanders.reduce((a, b) =>
              Math.hypot(a.x - shy.x, a.y - shy.y) <= Math.hypot(b.x - shy.x, b.y - shy.y) ? a : b);
            shy.targetId = next.userId;
            shy.chaseUntil = now + SHY_BLOODED_MS;
            shy.path = [];
          } else {
            shyBreakOff(true);
          }
        }
      }
    }

    if (shy.live) {
      filmed(1, sectorP, shy.x, shy.y);
      shyCb?.({ type: "pos", x: shy.x, y: shy.y, mode: shy.mode, targetId: shy.targetId });
    }
  };

  // ---- THE ALLIGATORS (Josh, Aug 2026) — one per large body of water ------
  // The inflatable crocodile, played dead straight: every LARGE body of
  // water in the Poolrooms keeps one, a lazy shape cruising its own pool,
  // utterly indifferent to anyone on the deck. It will not chase or even
  // take notice unless a player is IN ITS WATER and in its line of sight
  // (Josh's two conditions, both required) — and then it comes.
  //
  //  · IT NEVER LEAVES ITS BODY OF WATER. The flood-filled region is its
  //    cage (the shun rule), so dry tile is absolute safety — the whole
  //    doctrine is THE SHY GUY inverted: his water is where you escape TO,
  //    the gator's water is what you escape FROM.
  //  · Speeds are pinned against the player's own wading scales: it
  //    out-swims everyone in the deep, loses to a sprint in ankle water —
  //    so the escape gradient reads "get shallow, get OUT".
  //  · THE MOUTH IS THE WEAPON (Josh: "the attack only lands if the mouth
  //    of the alligator touches the player"). A bite lands from the head
  //    end only — mouth = centre + facing × GATOR_MOUTH — one bite every
  //    1.5 seconds, THREE bites to kill. Being shouldered by the flank is
  //    a fright, not a wound.
  //  · No spawn/despawn lifecycle: gators are permanent fixtures of their
  //    pools, placed at the deepest cell at boot. A gator whose pool has
  //    nobody within 45 cells doesn't tick (or transmit) at all.
  /** A "large body" is ≥800 wet cells (3,200 m²) with waist water somewhere
   *  — 15 of them on P3, including both vault seas and the river net. */
  const GATOR_BITE_MS = 1_500; // Josh: "1 bite every 1.5 seconds"
  const GATOR_BITE_HP = 34; // three bites: 34+34+34 = 102 — the third kills
  const GATOR_MOUTH = 0.9; // cells from centre to the teeth (a ~3.6m animal)
  const GATOR_BITE_R = 0.6; // "touches" — how close to the mouth, in cells
  const GATOR_SEE = 26; // how far a swimmer in its water catches its eye
  const GATOR_IDLE_SPEED = 0.5;
  const GATOR_WAKE = 45; // nobody within this = the pool sleeps (no ticks)
  /** TWICE THE PLAYER'S SWIM SPEED in the deep (Josh, Aug 2026) — a
   *  sprint-swimmer does 1.43 cells/s, so 2.85, the same "×2" bargain the
   *  stalker and the shy guy got. In WADING water it's the other way round
   *  (Josh: "if the player is not swimming... they should be able to outrun
   *  the alligator slightly"): against the player's sprint bands
   *  (ankle 2.22 · waist 1.57) the gator runs ~8% slower (2.05 · 1.45), so
   *  anywhere your feet still touch bottom a sprint pulls away — slowly —
   *  and deep water stays its killing ground. The deck is out of the game
   *  entirely (the region ends at the waterline). */
  const gatorSpeedAt = (x: number, y: number): number => {
    const steps = poolDepth(x, y);
    if (steps >= SWIM_DEPTH_STEPS) return 2.85;
    const m = steps * FLOOR_STEP;
    if (m > 0.6) return 1.45;
    return 2.05;
  };

  interface GatorBrain {
    id: number;
    /** The body of water it lives in (gatorRegion's id) — it never leaves. */
    region: number;
    /** A spawner's settings (marks.ts), else the usual. */
    see: number;
    bite: number;
    speedMul: number;
    x: number;
    y: number;
    h: number; // heading, client convention: atan2(dx, dy)
    mode: "idle" | "chase";
    targetId: number;
    path: [number, number][];
    pathAt: number;
    nextBiteAt: number;
    nextDriftAt: number;
    noRouteSince: number;
  }
  /** region id per cell, -1 = dry (or a small/shallow body nobody guards). */
  let gatorRegion = new Int32Array(sectorP.size * sectorP.size).fill(-1);
  const gators: GatorBrain[] = [];
  // Flood-fill the connected wet regions of Level 1's map; every one big and
  // deep enough gets a resident, standing at its deepest cell. Run at boot
  // and again whenever a new map is published. A map editor SPAWNER
  // (marks.ts "gator") puts its own in instead, with its own settings — in
  // any body of water, big or small — and a body that got one from a
  // spawner gets no resident besides. Every body of water has a region id
  // (gatorRegion), and a gator lives in its region's water and nowhere else.
  const residentGators = (): void => {
    gators.length = 0;
    gatorRegion = new Int32Array(sectorP.size * sectorP.size).fill(-1);
    const N = sectorP.size;
    const wet = (i: number): boolean =>
      (sectorP.water?.[i] ?? WATER_NONE) !== WATER_NONE && !sectorP.solid[i] && !sectorP.background?.[i];
    const seen = new Uint8Array(N * N);
    const bodies: { region: number; deepAt: number; big: boolean }[] = [];
    for (let sy = 0; sy < N; sy++) {
      for (let sx = 0; sx < N; sx++) {
        const si = sy * N + sx;
        if (!wet(si) || seen[si]) continue;
        const cells: number[] = [];
        const q = [si];
        seen[si] = 1;
        let maxD = 0;
        let deepAt = si;
        while (q.length) {
          const c = q.pop()!;
          cells.push(c);
          const d = poolDepth(c % N, (c / N) | 0);
          if (d > maxD) {
            maxD = d;
            deepAt = c;
          }
          const cx = c % N;
          const cy = (c / N) | 0;
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
            if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
            const ni = ny * N + nx;
            if (wet(ni) && !seen[ni]) {
              seen[ni] = 1;
              q.push(ni);
            }
          }
        }
        const region = bodies.length;
        for (const c of cells) gatorRegion[c] = region;
        bodies.push({ region, deepAt, big: cells.length >= GATOR_MIN_CELLS && maxD >= GATOR_MIN_DEPTH });
      }
    }
    const regionAt = (x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? -1 : gatorRegion[y * N + x]);
    const brain = (region: number, x: number, y: number, m?: MarkPlace): GatorBrain => ({
      id: gators.length,
      region,
      see: m?.sight ?? GATOR_SEE,
      bite: m?.bite ?? GATOR_BITE_HP,
      speedMul: (m?.speed ?? 100) / 100,
      x,
      y,
      h: 0,
      mode: "idle",
      targetId: 0,
      path: [],
      pathAt: 0,
      nextBiteAt: 0,
      nextDriftAt: 0,
      noRouteSince: 0,
    });
    const claimed = new Set<number>();
    let fromSpawners = 0;
    for (const m of sectorP.marks ?? []) {
      if (m.k !== "gator") continue;
      const region = regionAt(Math.floor(m.x), Math.floor(m.y));
      if (region < 0) continue;
      claimed.add(region);
      for (let k = 0; k < (m.n ?? 1) && fromSpawners < MAX_SPAWNED; k++, fromSpawners++) {
        // a second or third one a little way off in the same water
        const ox = Math.floor(m.x) + k * 2;
        gators.push(brain(region, regionAt(ox, Math.floor(m.y)) === region ? ox + 0.5 : m.x, m.y, m));
      }
    }
    for (const b of bodies) {
      if (!b.big || claimed.has(b.region)) continue;
      gators.push(brain(b.region, (b.deepAt % N) + 0.5, Math.floor(b.deepAt / N) + 0.5));
    }
    if (gators.length) console.log(`[backrooms] ${gators.length} alligators in the waters${fromSpawners ? ` (${fromSpawners} from the map's spawners)` : ""}`);
  };
  residentGators();
  let gatorCb: ((ev: GatorEvent) => void) | null = null;
  const gatorAt = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= sectorP.size || y >= sectorP.size ? -1 : gatorRegion[y * sectorP.size + x];

  const gatorTick = (): void => {
    if (!gators.length) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const inside = [...sessions.values()].filter((s) => s.level === 1 && !s.fly && !s.lostAt);
    if (!inside.length) return;

    for (const g of gators) {
      // Nobody near this pool — it neither thinks nor transmits.
      let nearestD = Infinity;
      for (const s of inside) {
        const d = Math.hypot(s.x - g.x, s.y - g.y);
        if (d < nearestD) nearestD = d;
      }
      if (nearestD > GATOR_WAKE) continue;

      const shun = (x: number, y: number): boolean => gatorAt(x, y) !== g.region;
      const spd = (x: number, y: number): number => gatorSpeedAt(x, y) * g.speedMul;
      /** IN THE WATER means in THIS gator's water — standing on the deck or
       *  sitting in a boat's hull is not in the water, by Josh's rule. */
      const inMyWater = (s: BrSession): boolean =>
        s.boatId === null && gatorAt(Math.floor(s.x), Math.floor(s.y)) === g.region;

      if (g.mode === "idle") {
        // The ONLY thing that provokes it: a body in its water, with a clear
        // line to it. Nearest such body wins.
        let mark: BrSession | null = null;
        let best = Infinity;
        for (const s of inside) {
          if (!inMyWater(s)) continue;
          const d = Math.hypot(s.x - g.x, s.y - g.y);
          if (d > g.see || d >= best) continue;
          if (!lineWalkableIn(sectorP, g.x, g.y, s.x, s.y)) continue;
          mark = s;
          best = d;
        }
        if (mark) {
          g.mode = "chase";
          g.targetId = mark.userId;
          g.path = [];
          g.pathAt = 0;
          g.noRouteSince = 0;
        }
      }

      const px = g.x;
      const py = g.y;
      let target: BrSession | null = null;

      if (g.mode === "chase") {
        target = sessions.get(g.targetId) ?? null;
        // OUT OF THE WATER IS OUT OF ITS REACH. The moment the target's feet
        // find dry tile (or a boat's hull, or another pool entirely) it loses
        // interest and goes back to its slow circuit — losing line of sight
        // mid-chase changes nothing, it is committed; leaving the water is
        // the one and only way off the menu.
        if (!target || target.level !== 1 || target.fly || target.lostAt || !inMyWater(target)) {
          g.mode = "idle";
          g.targetId = 0;
          g.path = [];
          g.nextDriftAt = now + 1_500;
          target = null;
        } else {
          const dx = target.x - g.x;
          const dy = target.y - g.y;
          const d = Math.hypot(dx, dy);
          if (
            lineWalkableIn(sectorP, g.x, g.y, target.x, target.y) &&
            !crossesShunned(g.x, g.y, target.x, target.y, shun)
          ) {
            // Straight at them, stopping where the MOUTH lands on the body
            // rather than gliding its centre through them (a bite measured
            // from a mouth 0.9 ahead can't land if it overlaps the target).
            g.path = [];
            g.noRouteSince = 0;
            const stop = GATOR_MOUTH * 0.85;
            let move = Math.min(spd(Math.floor(g.x), Math.floor(g.y)) * dt, Math.max(0, d - stop));
            if (move > 0.0001 && d > 0.0001) {
              const tx = g.x + (dx / d) * move;
              const ty = g.y + (dy / d) * move;
              // Charge the slower of here and there, like moveAlongIn's tax.
              move = Math.min(move, spd(Math.floor(tx), Math.floor(ty)) * dt);
              const nx = g.x + (dx / d) * move;
              const ny = g.y + (dy / d) * move;
              // The hard backstop: never a fin out of water, whatever the line says.
              if (!shun(Math.floor(nx), Math.floor(ny))) {
                g.x = nx;
                g.y = ny;
              }
            }
          } else {
            // Round the pool's own geometry (an island, a pier) — but never
            // out of the region; partial paths keep it closing under budget.
            if (!g.path.length || now - g.pathAt > 600) {
              g.path = findPathIn(sectorP, g.x, g.y, target.x, target.y, shun, true, undefined, true);
              g.pathAt = now;
              if (!g.path.length) {
                if (!g.noRouteSince) g.noRouteSince = now;
              } else {
                g.noRouteSince = 0;
              }
            }
            if (g.noRouteSince && now - g.noRouteSince > 6_000) {
              // Genuinely unreachable inside its own pool (shouldn't happen —
              // a region is connected by construction) — give up gracefully.
              g.mode = "idle";
              g.targetId = 0;
              g.path = [];
              target = null;
            } else {
              moveAlongIn(
                sectorP,
                g as unknown as EntBrain,
                spd(Math.floor(g.x), Math.floor(g.y)),
                dt,
                shun,
                spd,
                true,
              );
            }
          }
        }
      } else {
        // The slow circuit: meander to another spot in its own pool, pause,
        // repeat. Pure theatre — but it's what sells "that thing is alive".
        if (!g.path.length && now >= g.nextDriftAt) {
          for (let t = 0; t < 12 && !g.path.length; t++) {
            const a = rng() * Math.PI * 2;
            const r = 3 + rng() * 9;
            const x = Math.floor(g.x + Math.cos(a) * r);
            const y = Math.floor(g.y + Math.sin(a) * r);
            if (gatorAt(x, y) !== g.region) continue;
            g.path = findPathIn(sectorP, g.x, g.y, x + 0.5, y + 0.5, shun, false, undefined, true);
          }
          g.nextDriftAt = now + 2_500 + rng() * 6_000;
        }
        if (g.path.length) moveAlongIn(sectorP, g as unknown as EntBrain, GATOR_IDLE_SPEED * g.speedMul, dt, shun, spd, true);
      }

      // Heading: face the prey while hunting, else face the way it drifts.
      // The server owns this because the MOUTH position derives from it.
      const mdx = g.x - px;
      const mdy = g.y - py;
      let want = g.h;
      if (g.mode === "chase" && target) want = Math.atan2(target.x - g.x, target.y - g.y);
      else if (Math.hypot(mdx, mdy) > 0.003) want = Math.atan2(mdx, mdy);
      let dh = want - g.h;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      g.h += dh * (1 - Math.exp(-8 * dt));

      // THE BITE. On a 1.5s clock, and it lands ONLY if the mouth — the head
      // end, not the flank — is touching a body in the water. The prey first;
      // a rescuer swimming across the jaws is fair game too.
      if (g.mode === "chase" && now >= g.nextBiteAt) {
        const mx = g.x + Math.sin(g.h) * GATOR_MOUTH;
        const my = g.y + Math.cos(g.h) * GATOR_MOUTH;
        let bit: BrSession | null = null;
        if (target && Math.hypot(target.x - mx, target.y - my) <= GATOR_BITE_R) bit = target;
        else {
          for (const s of inside) {
            if (!sessions.has(s.userId) || !inMyWater(s)) continue;
            if (Math.hypot(s.x - mx, s.y - my) <= GATOR_BITE_R) {
              bit = s;
              break;
            }
          }
        }
        if (bit && !immortals.has(bit.userId)) {
          g.nextBiteAt = now + GATOR_BITE_MS;
          bit.hp -= g.bite;
          gatorCb?.({ type: "bite", id: g.id, x: mx, y: my });
          if (bit.hp <= 0) {
            const { x, y, level } = bit;
            // The death roll: a short violent yank along the mouth's own
            // heading — no launch, the body stays by the water.
            killPlayer(bit, "an alligator", { dir: g.h, power: 0.9 });
            hurtCb?.({ userId: bit.userId, hp: 0, drop: 0, dead: true, cause: "an alligator", x, y, level });
            if (bit.userId === g.targetId) {
              g.mode = "idle";
              g.targetId = 0;
              g.path = [];
              g.nextDriftAt = now + 4_000; // it lingers over the spot a moment
            }
          } else {
            hurtCb?.({ userId: bit.userId, hp: Math.ceil(bit.hp), drop: 0, dead: false, cause: "gator" });
          }
        }
      }

      // only from ITS water, on foot — where it can bite you
      filmed(1, sectorP, g.x, g.y, (q) => q.boatId === null && gatorAt(Math.floor(q.x), Math.floor(q.y)) === g.region);
      gatorCb?.({ type: "pos", id: g.id, x: g.x, y: g.y, h: g.h, mode: g.mode });
    }
  };

  // ---- Brownouts ---------------------------------------------------------
  // The sector's power sags now and then (the dynamic half of the July 2026
  // lighting pass). The SERVER owns the clock so everyone inside watches the
  // same lights die at the same moment — a private flicker is a graphics
  // glitch, a shared one is an event. Fires only while someone is inside
  // (the lights stay on for the moths), never overlaps itself, and changes
  // no rules: the dark is atmosphere, the entity neither sees better nor
  // worse for it.
  let brownoutCb: ((ms: number, black: boolean) => void) | null = null;
  let brownoutEnd = 0;
  let brownoutIsBlack = false;
  const BROWN_GAP_MIN = Number(process.env.BACKROOMS_BROWNOUT_GAP_MIN_MS ?? 8 * 60_000);
  const BROWN_GAP_MAX = Number(process.env.BACKROOMS_BROWNOUT_GAP_MAX_MS ?? 18 * 60_000);
  let nextBrownAt = Date.now() + BROWN_GAP_MIN + rng() * (BROWN_GAP_MAX - BROWN_GAP_MIN);
  const fireBrownout = (ms: number, black: boolean): number => {
    brownoutEnd = Date.now() + ms;
    brownoutIsBlack = black;
    brownoutCb?.(ms, black);
    return ms;
  };
  const brownTimer = setInterval(() => {
    const now = Date.now();
    if (now < nextBrownAt) return;
    nextBrownAt = now + BROWN_GAP_MIN + rng() * (BROWN_GAP_MAX - BROWN_GAP_MIN);
    if (sessions.size === 0) return;
    // 35% of power sags don't stop at a sag: the sector goes to BLACK for
    // the middle stretch — flashlights or feel your way (Josh, July 2026).
    const black = rng() < 0.35;
    fireBrownout(black ? 30_000 + Math.floor(rng() * 25_000) : 12_000 + Math.floor(rng() * 16_000), black);
  }, 5_000);
  brownTimer.unref?.();

  // ---- THE RULES DIRECTOR (Level 0; director.ts has the decisions) --------
  // Reads how the players on Level 0 are doing and paces the scares by
  // re-timing what the level already has. It never adds a lethal event.
  // BACKROOMS_DIRECTOR=0 turns it off.
  const directorOn = process.env.BACKROOMS_DIRECTOR !== "0";
  let director = newDirector(Date.now());
  const directorTick = (now: number): DirectorAction[] => {
    const live = [...sessions.values()].filter((s) => s.level === 0 && !s.fly && !s.lostAt);
    if (!live.length) {
      if (director.tension.size) director = newDirector(now); // an empty level starts fresh
      return [];
    }
    const players: DirectorPlayer[] = live.map((s) => ({
      id: s.userId,
      hp: s.hp,
      chased: (entsPlaced && ents.some((e) => e.mode === "chase" && e.targetId === s.userId)) || spawned.some((e) => e.level === 0 && e.mode === "chase" && e.targetId === s.userId),
      hunted: stalker.placed && stalker.mode === "hunt" && stalker.targetId === s.userId,
      alone: !live.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) <= 12),
    }));
    const actions = directorStep(director, {
      now,
      players,
      dark: brownoutEnd > now && brownoutIsBlack,
      brownout: brownoutEnd > now,
      nextBrownoutAt: nextBrownAt,
      stalkerShadowing: stalker.placed && stalker.mode === "shadow",
    });
    for (const a of actions) {
      if (a.kind === "flicker") {
        if (brownoutEnd <= now) fireBrownout(a.ms, false);
      } else if (a.kind === "mimic") {
        stalker.nextMimicAt = Math.min(stalker.nextMimicAt, now);
      } else if (a.kind === "hasten") {
        nextBrownAt = Math.min(nextBrownAt, a.to);
      } else if (a.kind === "quiet") {
        stalker.nextMimicAt = Math.max(stalker.nextMimicAt, a.until);
        stalker.nextHuntTryAt = Math.max(stalker.nextHuntTryAt, a.until);
        nextBrownAt = Math.max(nextBrownAt, a.until);
      } else if (a.kind === "lure") {
        // A sound well away from the calmest player, toward which a patrolling
        // Entity drifts to investigate — never onto them.
        const t = live.find((s) => s.userId === a.targetId);
        if (t && entsPlaced) {
          const ang = rng() * Math.PI * 2;
          const spot = walkableNear(Math.floor(t.x + Math.cos(ang) * 16), Math.floor(t.y + Math.sin(ang) * 16), 6);
          if (spot) {
            for (const e of ents) {
              if (e.mode !== "patrol" || Math.hypot(e.x - spot[0], e.y - spot[1]) > 40) continue;
              e.stimulus = { x: spot[0] + 0.5, y: spot[1] + 0.5, at: now };
            }
          }
        }
      }
    }
    if (actions.length) console.log(`[director] L0 ${director.phase}: ${actions.map((a) => a.kind).join(", ")} — ${director.log[0]?.text ?? ""}`);
    return actions;
  };
  const directorTimer = setInterval(() => {
    if (!directorOn) return;
    try { directorTick(Date.now()); } catch (e) { console.error("[director]", e); }
  }, DIRECTOR.TICK_MS);
  directorTimer.unref?.();

  // ---- Corpses ----------------------------------------------------------
  // Loaded at boot (they persist), mutated in place, deleted when emptied.
  const corpses: { id: number; name: string; x: number; y: number; items: BrCorpseItem[]; lvl: BrLevel }[] = [];
  for (const row of store.brAllCorpses()) {
    try {
      // Bodies from RETIRED sectors (P1, the first pools map) never load —
      // their coordinates mean nothing in the current worlds. The rows stay
      // until the 24h rot sweep clears them.
      if (row.sector !== sectorIdA && row.sector !== sectorIdP && row.sector !== sectorIdD && row.sector !== sectorIdS && row.sector !== sectorIdO && row.sector !== sectorIdH && row.sector !== sectorIdL && row.sector !== sectorIdT && row.sector !== sectorIdC && row.sector !== sectorIdU) continue;
      corpses.push({
        id: row.id,
        name: row.name,
        x: row.x,
        y: row.y,
        items: JSON.parse(row.items) as BrCorpseItem[],
        lvl: row.sector === sectorIdU ? 9 : row.sector === sectorIdC ? 8 : row.sector === sectorIdT ? 7 : row.sector === sectorIdL ? 6 : row.sector === sectorIdH ? 5 : row.sector === sectorIdO ? 4 : row.sector === sectorIdS ? 3 : row.sector === sectorIdD ? 2 : row.sector === sectorIdP ? 1 : 0,
      });
    } catch {
      /* corrupt row — leave it in the DB, skip serving it */
    }
  }

  const dropCorpse = (dead: BrSession): void => {
    // A BODY AT THE BOTTOM OF A SHAFT CAN NEVER BE REACHED — a pit is lethal
    // deep by definition, so whoever follows it down dies too. THE WAY ON
    // never rides such a body (Backrooms law 3, Oct 2026: a key or fuse on it
    // was locked away for the corpse's whole 24h): they go home at once,
    // findable again. Everything else lies down there and rots as ever.
    // …and so is one sunk in Thalassophobia's Drop: past the plaza's depth
    // no breath, not even the helmet's, gets down to it and back.
    const sunk = isPitCell(secBy(dead.level), Math.floor(dead.x), Math.floor(dead.y)) || (dead.level === 7 && oceanTooDeep(Math.floor(dead.x), Math.floor(dead.y)));
    const items: BrCorpseItem[] = [
      ...dead.inventory.map((i) => ({ kind: i.kind, level: i.level, color: i.color })),
      ...dead.relics.map((slug) => ({ kind: "relic", level: 0, color: slug })),
      // THE KEY rides the body. When the body rots (24h), the key is findable
      // at home again — the community waits a day, but never loses it.
      ...(dead.hasKey && !sunk ? [{ kind: "key", level: dead.level, color: null }] : []),
      ...(sunk ? [] : (dead.fuses ?? []).map((f) => ({ kind: "fuse", level: 0, color: String(f) }))),
    ];
    if (!items.length) return; // died empty-handed — nothing to find
    const id = store.brAddCorpse(dead.userId, dead.name, dead.x, dead.y, items, sectorIdOf(dead.level));
    corpses.push({ id, name: dead.name, x: dead.x, y: dead.y, items, lvl: dead.level });
  };

  /** One death path for every cause (the entity, a forfeit, later falls):
   *  end the session, take the loadout out of the locker, leave a body, log
   *  it. Everything downstream (map markers, recovery runs) reads those.
   *
   *  THE THROW (ragdoll, Aug 2026): the enemy that killed you decides how
   *  the body leaves — an `impulse` slides the corpse's REST spot along the
   *  throw direction under the same walkability rules as a player step
   *  (stepAllowed cell by cell), so the loot position always matches where
   *  every client's cosmetic ragdoll comes to rest, and a body can never be
   *  thrown through a wall. The death event carries origin + rest + a seed;
   *  clients replay the identical flail from it (the Derby's broadcast-seed
   *  pattern). No impulse = a crumple where they stood. */
  const killPlayer = (dead: BrSession, cause: string, impulse?: { dir: number; power: number }): void => {
    // A body dies once. Creature loops walk a prey list built before the
    // first kill, so a second creature reaching the same body in the same
    // tick used to lay a SECOND corpse carrying the key and every relic again
    // (Nov 2026 validation run).
    if (sessions.get(dead.userId) !== dead) return;
    endRun(dead.userId);
    // A TEST RUN keeps nothing and loses nothing: the kit stays in the
    // locker, no body lies down, no death is written (the run itself ends it)
    const test = testing.has(dead.level);
    if (!test) {
      // only what really left the locker lies on the body — an item sold
      // over HTTP mid-run has no row to carry (Oct 2026 review)
      const gone = new Set(store.brDeleteItems(dead.userId, dead.inventory.map((i) => i.id)));
      dead.inventory = dead.inventory.filter((i) => gone.has(i.id));
    }
    const ox = dead.x;
    const oy = dead.y;
    if (impulse && impulse.power > 0) {
      const sec = secOf(dead);
      const dx = Math.sin(impulse.dir);
      const dy = Math.cos(impulse.dir);
      let tx = dead.x;
      let ty = dead.y;
      const STEP = 0.2;
      for (let travelled = 0; travelled < impulse.power; ) {
        const step = Math.min(STEP, impulse.power - travelled); // never overshoot the throw
        const nx = tx + dx * step;
        const ny = ty + dy * step;
        if (nx < 0.3 || ny < 0.3 || nx >= sec.size - 0.3 || ny >= sec.size - 0.3) break;
        if (!stepAllowed(sec, Math.floor(tx), Math.floor(ty), Math.floor(nx), Math.floor(ny))) break;
        tx = nx;
        ty = ny;
        travelled += step;
      }
      dead.x = tx;
      dead.y = ty;
    }
    if (!test) dropCorpse(dead); // the key, if they had it, is now on the body
    if (dead.hasKey) keyHolder[dead.level] = null;
    for (const f of dead.fuses ?? []) fuseHolder[f] = null;
    dead.fuses = [];
    if (!test) store.brAddDeath(dead.userId, dead.name, dead.x, dead.y, cause, dead.level, sectorIdOf(dead.level));
    deathCb?.({
      userId: dead.userId,
      level: dead.level,
      x: ox,
      y: oy,
      rx: dead.x,
      ry: dead.y,
      dir: impulse?.dir ?? 0,
      power: impulse?.power ?? 0,
      seed: randomInt(0, 2 ** 31),
      cause,
      suit: dead.inventory.find((i) => i.kind === "suit")?.color ?? "yellow",
      h: dead.heading,
    });
  };

  // ---- Dropped items ----------------------------------------------------
  // G drops what you're holding onto the carpet. ONE HOUR — much shorter than a
  // body, because a dropped item is a choice and a body is a loss (Josh's
  // persistence rule — spray paint alone is forever).
  const drops: {
    id: number; x: number; y: number; kind: string; level: number; color: string | null; charge: number | null; lvl: BrLevel;
  }[] = [];
  for (const lvl of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
    for (const row of store.brAllDrops(sectorIdOf(lvl))) {
      drops.push({
        id: row.id,
        x: row.x,
        y: row.y,
        kind: row.kind,
        level: row.level,
        color: row.color,
        charge: row.charge,
        lvl,
      });
    }
  }

  // Two clocks, on purpose (Josh, July 2026). A BODY lasts a full DAY: recovery
  // is meant to be a real expedition you can plan, sleep on, and bring friends
  // to — and since the map never tells you where you died, an hour was not
  // enough time to find it from memory. Loose DROPS still rot in an hour.
  const DESPAWN_MS = Number(process.env.BACKROOMS_DESPAWN_MS ?? 60 * 60_000);
  const CORPSE_MS = Number(process.env.BACKROOMS_CORPSE_MS ?? 24 * 60 * 60_000);
  const rot = (): void => {
    const now = Date.now();
    for (const id of store.brExpireCorpses(now - CORPSE_MS)) {
      const i = corpses.findIndex((c) => c.id === id);
      if (i !== -1) corpses.splice(i, 1);
    }
    for (const id of store.brExpireDrops(now - DESPAWN_MS)) {
      const i = drops.findIndex((d) => d.id === id);
      if (i !== -1) drops.splice(i, 1);
    }
  };
  rot(); // anything that rotted while the server was down goes now
  const rotTimer = setInterval(() => {
    heartbeat("backroomsRot", 5 * 60_000);
    rot();
  }, 60_000);
  rotTimer.unref?.();

  // DROWNING (Poolrooms v3). The client reports the head crossing the
  // waterline (setSubmerged, gated to swim-deep cells); this clock is the
  // authority. Ten seconds of breath, then the water starts TAKING it
  // (Josh: "just make it slowly drain your health until you die") — 10 hp
  // a second, so a healthy diver has ~20 seconds under before the deep
  // wins, and surfacing at any point stops the bleed. The kill takes the
  // normal death path: corpse, ledger, and net tells the client + the room.
  const DROWN_MS = Number(process.env.BACKROOMS_DROWN_MS ?? 10_000);
  const HELMET_MS = Number(process.env.BACKROOMS_HELMET_MS ?? HELMET_BREATH_MS);
  const DROWN_HP_PER_SEC = 10;
  const DROWN_TICK_MS = 500;
  const drownTimer = setInterval(() => {
    const now = Date.now();
    for (const s of [...sessions.values()]) {
      // god mode is god mode in the water too (Oct 2026 review)
      if (s.subSince === null || s.fly || immortals.has(s.userId)) continue;
      // Re-verify the water every tick: if they made it somewhere shallow,
      // the report is stale and the lungs get the benefit of the doubt.
      const sec = secOf(s);
      const i = Math.floor(s.y) * sec.size + Math.floor(s.x);
      const wl = sec.water?.[i] ?? WATER_NONE;
      if (wl === WATER_NONE || wl - sec.floor[i] < SWIM_DEPTH_STEPS) {
        s.subSince = null;
        continue;
      }
      // THALASSOPHOBIA: the Diving Helmet is a minute of air, not ten seconds
      if (now - s.subSince < (s.level === 7 && s.hasKey ? HELMET_MS : DROWN_MS)) continue;
      s.hp -= (DROWN_HP_PER_SEC * DROWN_TICK_MS) / 1000;
      if (s.hp > 0) {
        hurtCb?.({ userId: s.userId, hp: Math.ceil(s.hp), drop: 0, dead: false, cause: "drowning" });
        continue;
      }
      const { x, y, level } = s;
      killPlayer(s, "the deep");
      hurtCb?.({ userId: s.userId, hp: 0, drop: 0, dead: true, cause: "drowned", x, y, level });
    }
  }, DROWN_TICK_MS);
  drownTimer.unref?.();

  // THE GRACE WINDOW. A dropped socket freezes the run instead of ending it;
  // this is what finally ends it. Two minutes is long enough to survive a
  // refresh, a crash, a deploy or a lift ride, and short enough that a body
  // left standing in the dark is a real bet rather than a safe park.
  const GRACE_MS = BR_GRACE_MS;
  const graceTimer = setInterval(() => {
    const now = Date.now();
    for (const s of [...sessions.values()]) {
      if (!s.lostAt || now - s.lostAt < GRACE_MS) continue;
      // Out of time. This is a forfeit, not an exit: they die where they
      // stand and everything they carried is on the body.
      killPlayer(s, "lost to the dark");
      hurtCb?.({ userId: s.userId, hp: 0, drop: 0, dead: true });
    }
  }, 5_000);
  graceTimer.unref?.();

  // ---- THE RESEARCH ARCHIVE: lore drives -------------------------------
  // Deterministic placements (lore.ts) minus everything already recovered.
  // A found drive is gone from the world forever — the archive keeps it.
  // EVERY LEVEL keeps its own strand (the Poolrooms since Aug 2026, Pipe
  // Dreams and the Station since the Backrooms laws, Oct 2026 — law 1: "the
  // lore hard drives must contain lore specific to the level they are found
  // in"), placed only on its own map, on lawful ground.
  type DriveSite = { id: string; x: number; y: number };
  const drives: DriveSite[] = [];
  const drivesP: DriveSite[] = [];
  const drivesD: DriveSite[] = [];
  const drivesS: DriveSite[] = [];
  const drivesO: DriveSite[] = [];
  const drivesH: DriveSite[] = [];
  const drivesL: DriveSite[] = [];
  const drivesT: DriveSite[] = [];
  const drivesC: DriveSite[] = [];
  const drivesU: DriveSite[] = [];
  const driveLists: DriveSite[][] = [drives, drivesP, drivesD, drivesS, drivesO, drivesH, drivesL, drivesT, drivesC, drivesU];
  /** (Re-)derive a level's drives on its current map — the recovered stay
   *  recovered, unless `all` (the deep reset puts every one back). */
  const placeDrives = (level: BrLevel, all = false): void => {
    const list = driveLists[level];
    list.length = 0;
    if (!enabledOf(level)) return;
    for (const d of driveSites(secBy(level), LEVEL_DRIVES[level])) if (all || !store.brDriveIsUnlocked(d.id)) list.push(d);
  };
  const placePoolDrives = (): void => placeDrives(1);
  for (const lvl of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as BrLevel[]) placeDrives(lvl);

  // ---- THE DOOR and THE KEY --------------------------------------------
  // One door, one key, the whole community's end goal for Level 0. The door is
  // the deepest cell from the four entrances; the key hides in the landmark
  // farthest from it.
  let entryDist = distanceMap(
    sector,
    sector.doors.map((d) => ({ x: d.x, y: d.y })),
  );
  let theDoor = doorSite(sector, entryDist);
  let theKeyHome = keySite(sector, theDoor);
  /** Re-seat THE DOOR and THE KEY on a new Level 0 map (the flag that says
   *  the door was opened is world history, not map state — it stays). */
  const placeDoorAndKey = (): void => {
    entryDist = distanceMap(sector, sector.doors.map((d) => ({ x: d.x, y: d.y })));
    theDoor = doorSite(sector, entryDist);
    theKeyHome = keySite(sector, theDoor);
    keyHolder[0] = null;
  };
  // THE KEY CANNOT BE LOST. It is either at home, in someone's hands, or on a
  // body — and a body that rots returns it home (see rot()). A restart drops
  // every session, so a carried key is at home again at boot: the one state
  // that never needs persisting.
  // Every level with a key has its own holder (Level 0: THE DOOR; Level 1:
  // the drain hatch). A key never leaves its level.
  const keyHolder: (number | null)[] = [null, null, null, null, null, null, null, null, null, null];
  const keyOnCorpse = (level: BrLevel = 0): boolean => corpses.some((c) => c.lvl === level && c.items.some((i) => i.kind === "key"));
  const keyIsFindable = (level: BrLevel = 0): boolean => keyHolder[level] === null && !keyOnCorpse(level);
  console.log(
    `[backrooms] the door is at ${Math.floor(theDoor.x)},${Math.floor(theDoor.y)} (depth ${
      entryDist[Math.floor(theDoor.y) * sector.size + Math.floor(theDoor.x)]
    }); the key ${theKeyHome.landmark ? `waits in ${theKeyHome.landmark}` : "waits far from it"}`,
  );

  // ---- Relic sites ------------------------------------------------------
  // Up to TWO active sites at a time (~2/hour cadence), spawned FAR from
  // every door, floating in an open cell. Identity stays hidden until
  // pickup. The entity likes to haunt them (50% of wakes relocate nearby).
  const RELIC_SPAWN_MS = Number(process.env.BACKROOMS_RELIC_SPAWN_MS ?? 30 * 60_000);
  const relicSites: { id: number; relicId: string; x: number; y: number }[] = [];
  let relicSeq = 1;

  // WHERE a relic lies goes through THE PLACEMENT LAW (placement.ts): a map
  // editor relic spot first, then any cell a player can actually walk to,
  // deep in the level. CRYPTO randomness, not Math.random — a relic is an
  // ECONOMIC outcome (a duplicate sells, an original auctions for silver), and
  // the standing rule (Phase 34) is that Math.random never decides anything
  // worth money.
  const spawnRelicOn = (
    sec: Sector,
    sites: { id: number; relicId: string; x: number; y: number }[],
    catalog: { slug: string }[],
    minFromDoor: number,
  ): void => {
    if (sites.length >= 2) return;
    const cell = pickRelicCell(sec, sites, minFromDoor, randomInt);
    if (!cell) return;
    const def = catalog[randomInt(catalog.length)];
    sites.push({ id: relicSeq++, relicId: def.slug, x: cell[0] + 0.5, y: cell[1] + 0.5 });
  };
  const spawnRelic = (): void => spawnRelicOn(sector, relicSites, RELICS, 60);
  // THE POOLROOMS' own sites: same cadence, their own catalog (Josh's Pool
  // Rooms art), far from the arrival rooms.
  const relicSitesP: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicP = (): void => {
    if (enabledP) spawnRelicOn(sectorP, relicSitesP, POOL_RELICS, 60);
  };
  // PIPE DREAMS' own sites (Josh, Sep 2026): its own catalog, far from the drain.
  const relicSitesD: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicD = (): void => {
    if (enabledD) spawnRelicOn(sectorD, relicSitesD, PIPE_RELICS, 50);
  };
  // THE ELECTRICAL STATION's own sites: its catalog, far from the pressure door
  const relicSitesS: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicS = (): void => {
    if (enabledS) spawnRelicOn(sectorS, relicSitesS, STATION_RELICS, 40);
  };
  // THE ABANDONED OFFICE's own sites: its catalog, far from the lift. No
  // relic lies out while the catalog is empty (Josh's pictures come first).
  const relicSitesO: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicO = (): void => {
    if (enabledO && OFFICE_RELICS.length) spawnRelicOn(sectorO, relicSitesO, OFFICE_RELICS, 40);
  };
  // THE TERROR HOTEL's own sites: empty until Josh's pictures, like the office.
  const relicSitesH: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicH = (): void => {
    if (enabledH && HOTEL_RELICS.length) spawnRelicOn(sectorH, relicSitesH, HOTEL_RELICS, 40);
  };
  // LIGHTS OUT's own sites: empty until Josh's pictures.
  const relicSitesL: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicL = (): void => {
    if (enabledL && LIGHTS_RELICS.length) spawnRelicOn(sectorL, relicSitesL, LIGHTS_RELICS, 40);
  };
  // THALASSOPHOBIA's own sites: empty until its relics are in.
  const relicSitesT: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicT = (): void => {
    if (enabledT && OCEAN_RELICS.length) spawnRelicOn(sectorT, relicSitesT, OCEAN_RELICS, 40);
  };
  // THE CAVE SYSTEM's own sites.
  const relicSitesC: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicC = (): void => {
    if (enabledC && CAVE_RELICS.length) spawnRelicOn(sectorC, relicSitesC, CAVE_RELICS, 40);
  };
  // THE SUBURBS' own sites (empty until the level's relics have their art).
  const relicSitesU: { id: number; relicId: string; x: number; y: number }[] = [];
  const spawnRelicU = (): void => {
    if (enabledU && SUBURB_RELICS_LIVE.length) spawnRelicOn(sectorU, relicSitesU, SUBURB_RELICS_LIVE, 40);
  };
  /** Each level's relic sites. */
  const relicSitesOf = (level: BrLevel): { id: number; relicId: string; x: number; y: number }[] =>
    level === 9 ? relicSitesU : level === 8 ? relicSitesC : level === 7 ? relicSitesT : level === 6 ? relicSitesL : level === 5 ? relicSitesH : level === 4 ? relicSitesO : level === 3 ? relicSitesS : level === 2 ? relicSitesD : level === 1 ? relicSitesP : relicSites;
  const relicTimer = setInterval(() => {
    heartbeat("backroomsRelics", RELIC_SPAWN_MS * 3);
    spawnRelic();
    spawnRelicP();
    spawnRelicD();
    spawnRelicS();
    spawnRelicO();
    spawnRelicH();
    spawnRelicL();
    spawnRelicT();
    spawnRelicC();
    spawnRelicU();
  }, RELIC_SPAWN_MS);
  relicTimer.unref?.();
  spawnRelic();
  spawnRelic();
  spawnRelicP();
  spawnRelicP();
  spawnRelicD();
  spawnRelicD();
  spawnRelicS();
  spawnRelicS();
  spawnRelicO();
  spawnRelicO();
  spawnRelicH();
  spawnRelicH();
  spawnRelicL();
  spawnRelicL();
  spawnRelicT();
  spawnRelicT();
  spawnRelicC();
  spawnRelicC();
  spawnRelicU();
  spawnRelicU();

  // ---- THE BOATS (Poolrooms v3.1) -----------------------------------------
  // Four rowboats docked at deterministic quays: swim-deep water cells with
  // a dry bank alongside, picked far apart (and away from the doors, so a
  // boat is something you FIND). In-memory like the blackjack tables — a
  // restart sends every boat home to its dock.
  const boats: BrBoat[] = [];
  const dockBoats = (): void => {
    boats.length = 0;
    if (!enabledP) return;
    const size = sectorP.size;
    const candidates: { x: number; y: number }[] = [];
    // THE LAP LANES COME FIRST (P6, Josh: "keep the boats … as canal boats in
    // the lap pools"): a boat belongs on long, narrow water — a body of DEEP
    // water at least two and a half times as long as it is wide — and never
    // on an alligator's water while a lane is free. Any quay only when there
    // is no lane at all. Bodies are measured over swim-deep water only: P6's
    // ankle water joins every pool into one, which made the whole bathhouse
    // a single "body" no lane rule could match (Nov 2026 validation run).
    const bodyOf = new Int32Array(size * size).fill(-1);
    const lanes = new Set<number>();
    {
      let nb = 0;
      const wetAt = (i: number): boolean => {
        const wl = sectorP.water?.[i] ?? WATER_NONE;
        return !sectorP.solid[i] && wl !== WATER_NONE && wl - sectorP.floor[i] >= SWIM_DEPTH_STEPS;
      };
      for (let i0 = 0; i0 < size * size; i0++) {
        if (!wetAt(i0) || bodyOf[i0] >= 0) continue;
        const q = [i0];
        bodyOf[i0] = nb;
        let x0 = size, x1 = 0, y0 = size, y1 = 0, cells = 0;
        for (let k = 0; k < q.length; k++) {
          const c = q[k];
          const cx = c % size, cy = (c / size) | 0;
          cells++;
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          for (const n of [c + 1, c - 1, c + size, c - size]) if (n >= 0 && n < size * size && bodyOf[n] < 0 && wetAt(n)) ((bodyOf[n] = nb), q.push(n));
        }
        const long = Math.max(x1 - x0, y1 - y0) + 1;
        const wide = Math.min(x1 - x0, y1 - y0) + 1;
        if (wide >= 4 && long >= wide * 2.5 && cells < GATOR_MIN_CELLS) lanes.add(nb);
        nb++;
      }
    }
    const onLane = (x: number, y: number): boolean => lanes.has(bodyOf[y * size + x]);
    for (let y = 2; y < size - 2; y++) {
      for (let x = 2; x < size - 2; x++) {
        const i = y * size + x;
        const wl = sectorP.water?.[i] ?? WATER_NONE;
        if (wl === WATER_NONE || wl - sectorP.floor[i] < SWIM_DEPTH_STEPS) continue;
        // A dry bank right alongside (eff 0 quay) = a dock.
        let quay = false;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
          const ni = ny * size + nx;
          if (!sectorP.solid[ni] && (sectorP.water?.[ni] ?? WATER_NONE) === WATER_NONE && sectorP.floor[ni] === 0) quay = true;
        }
        if (quay) candidates.push({ x, y });
      }
    }
    if (candidates.some((c) => onLane(c.x, c.y))) {
      const lane = candidates.filter((c) => onLane(c.x, c.y));
      candidates.length = 0;
      candidates.push(...lane);
    }
    const picked: { x: number; y: number }[] = [];
    const anchors = () => [...picked, ...sectorP.doors];
    for (let b = 0; b < 4 && candidates.length; b++) {
      let best = candidates[0];
      let bestScore = -1;
      for (const c of candidates) {
        const score = Math.min(...anchors().map((a) => (a.x - c.x) ** 2 + (a.y - c.y) ** 2));
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      picked.push(best);
    }
    picked.forEach((p, i) => boats.push({ id: i + 1, x: p.x + 0.5, y: p.y + 0.5, h: 0, captain: null, passenger: null }));
    if (boats.length) {
      console.log(`[backrooms] ${boats.length} boats docked: ${boats.map((b) => `#${b.id}@${Math.floor(b.x)},${Math.floor(b.y)}`).join(" · ")}`);
    }
  };
  dockBoats();
  const boatById = (id: number): BrBoat | undefined => boats.find((b) => b.id === id);
  /** Seats are freed LAZILY: a seat is valid only while its session exists,
   *  is on Level 1, and still points at this boat. Death, exit, travel and
   *  the grace reaper all get handled by one sweep. */
  const validateBoatSeats = (): void => {
    for (const b of boats) {
      const valid = (uid: number | null): boolean => {
        if (uid === null) return false;
        const s = sessions.get(uid);
        return !!s && s.level === 1 && s.boatId === b.id;
      };
      if (!valid(b.captain)) b.captain = null;
      if (!valid(b.passenger)) b.passenger = null;
      if (b.captain === null && b.passenger !== null) {
        // The oars never go unmanned while someone's aboard.
        b.captain = b.passenger;
        b.passenger = null;
      }
    }
  };
  const boatTimer = setInterval(validateBoatSeats, 5000);
  boatTimer.unref?.();

  // Spawn points: just inside each door's arrival room.
  const spawnFor = (door: number): { x: number; y: number } => {
    const d = sector.doors[door];
    const inward = {
      N: { x: d.x + 0.5, y: d.y + 2.5 },
      S: { x: d.x + 0.5, y: d.y - 1.5 },
      E: { x: d.x - 1.5, y: d.y + 0.5 },
      W: { x: d.x + 2.5, y: d.y + 0.5 },
    }[d.edge];
    return inward;
  };

  /** WHERE A NEWCOMER STANDS (law 5, Oct 2026). Every door set everybody down
   *  on one spot, so the second runner through stood INSIDE the first — and a
   *  body around the camera draws as screen-wide shards. When somebody is
   *  already there, take the nearest spot within a pace or so that nobody is
   *  standing on, at the same floor height, that an objective could lie on
   *  and a body can walk to from the door. Nothing nearby = the door's spot,
   *  as before (the client hides a body standing in your eye either way). */
  const ARRIVAL_ROOM = 0.7;
  const arrivalSpot = (level: BrLevel, x: number, y: number, self: number): { x: number; y: number } => {
    const sec = secBy(level);
    /** How close the nearest other body is to a spot (Infinity = nobody). */
    const nearest = (ax: number, ay: number): number => {
      let d = Infinity;
      for (const q of sessions.values()) {
        if (q.userId !== self && q.level === level && !q.fly) d = Math.min(d, Math.hypot(q.x - ax, q.y - ay));
      }
      return d;
    };
    if (nearest(x, y) >= ARRIVAL_ROOM) return { x, y };
    const ox = Math.floor(x);
    const oy = Math.floor(y);
    const f0 = sec.floor[oy * sec.size + ox];
    // rings out to about three paces; a crowded doorway (sixteen at a door
    // against a wall) takes the roomiest spot found rather than the door's
    let best = { x, y, room: nearest(x, y) };
    for (const rad of [0.8, 1.3, 1.8, 2.3, 2.8]) {
      const n = Math.round(rad * 8);
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2;
        const cx = x + Math.cos(ang) * rad;
        const cy = y + Math.sin(ang) * rad;
        const gx = Math.floor(cx);
        const gy = Math.floor(cy);
        if (gx < 0 || gy < 0 || gx >= sec.size || gy >= sec.size) continue;
        if (!(gx === ox && gy === oy) && whyUnplaceable(sec, gx, gy) !== null) continue;
        if (sec.floor[gy * sec.size + gx] !== f0) continue;
        if (!fatLineIn(sec, x, y, cx, cy)) continue;
        const room = nearest(cx, cy);
        if (room >= ARRIVAL_ROOM) return { x: cx, y: cy };
        if (room > best.room) best = { x: cx, y: cy, room };
      }
    }
    return { x: best.x, y: best.y };
  };

  // THE PASSAGE. Level 0's side is THE DOOR (the landmark the key opened);
  // the Poolrooms' side is The Landing (pools door 0). Stepping through moves
  // the session between worlds in place — same run, same inventory, same hp.
  const landing = (): Door => sectorP.doors[0];

  // ---- LEVEL 1's DOOR: THE DRAIN HATCH, and its KEY ---------------------
  // Josh, Sep 2026: "level 1 is find key to door". The Poolrooms' way on is
  // a drain hatch in the floor — Pipe Dreams arrives through a hatch in its
  // ceiling, The Drain — at the deepest DRY floor from The Landing; its key
  // lies on dry floor in the named hall farthest from it. Level 0's rules
  // exactly: one key, never lost, a body keeps it, a rot sends it home.
  const dryP = (x: number, y: number): boolean => !wetFloor(sectorP.floor[y * sectorP.size + x]);
  let hatch = { x: 0, y: 0 };
  let keyHomeP = { x: 0, y: 0, landmark: null as string | null };
  const placeHatchAndKey = (): void => {
    if (!enabledP) return;
    const d0 = distanceMap(sectorP, sectorP.doors.map((d) => ({ x: d.x, y: d.y })));
    // in a room, never a passage: a hatch in a tunnel is a hole in the road
    const tunnels = sectorP.districts.findIndex((d) => d.type === "tunnels");
    hatch = doorSite(sectorP, d0, (x, y) => dryP(x, y) && sectorP.district[y * sectorP.size + x] !== tunnels);
    keyHomeP = keySite(sectorP, hatch, dryP);
    keyHolder[1] = null;
    console.log(`[backrooms] the Poolrooms' drain hatch is at ${Math.floor(hatch.x)},${Math.floor(hatch.y)}; its key ${keyHomeP.landmark ? `waits in ${keyHomeP.landmark}` : "waits far from it"}`);
  };
  placeHatchAndKey();

  // ---- PIPE DREAMS' FUSES and the FUSE BOX --------------------------------
  // Josh: "level 2 is find 3 fuses for fuse box" — and "put like 10 fuses
  // spread out across the map, just to make it not that hard". TEN fuses lie
  // in the far half of the plant (FUSE_SITES); the fuse box beside the
  // pressure door in the Valve Gallery takes THREE (FUSE_COUNT), any three.
  // Each one put in stays in (a world flag per fuse); the third opens the
  // pressure door, once, for everyone, and the spares leave the world.
  const fuseHolder: (number | null)[] = Array(FUSE_SITES).fill(null);
  let fuseHomes: { x: number; y: number }[] = [];
  let fusePanel: { x: number; y: number } | null = null;
  let pressureDoor: { x: number; y: number } | null = null;
  const fuseIn = (i: number): boolean => !!store.brGetFlag(fuseFlag(i));
  const fuseOnCorpse = (i: number): boolean => corpses.some((c) => c.lvl === 2 && c.items.some((q) => q.kind === "fuse" && q.color === String(i)));
  /** How many fuses are in the box (any of the ten count toward its three). */
  const fusesInserted = (): number => {
    let n = 0;
    for (let i = 0; i < fuseHomes.length; i++) if (fuseIn(i)) n++;
    return n;
  };
  /** Lying where it can be picked up: not in the box, not in somebody's
   *  hands, not on a body — and the box not yet full (once it is, the spare
   *  fuses leave the world: there is nothing left for them to do). */
  const fuseFindable = (i: number): boolean =>
    !fuseIn(i) && fuseHolder[i] === null && !fuseOnCorpse(i) && !store.brGetFlag(LEVEL3_FLAG);
  const placeFuses = (): void => {
    if (!enabledD) return;
    const d0 = distanceMap(sectorD, sectorD.doors.map((d) => ({ x: d.x, y: d.y })));
    const deco = sectorD.deco;
    fusePanel = null;
    pressureDoor = null;
    if (deco)
      for (let i = 0; i < deco.length; i++) {
        const k = deco[i] >> 4;
        if (k === 6) fusePanel = { x: (i % sectorD.size) + 0.5, y: Math.floor(i / sectorD.size) + 0.5 };
        if (k === 12) pressureDoor = { x: (i % sectorD.size) + 0.5, y: Math.floor(i / sectorD.size) + 0.5 };
      }
    // never on a stair, never on the fuse box's own doorstep
    fuseHomes = fuseSites(sectorD, d0, FUSE_SITES, (x, y) => !(deco && deco[y * sectorD.size + x] >> 4 === 5) && (!fusePanel || Math.hypot(fusePanel.x - x, fusePanel.y - y) > 20));
    fuseHolder.fill(null);
    console.log(`[backrooms] Pipe Dreams' fuses: ${fuseHomes.map((f) => `${Math.floor(f.x)},${Math.floor(f.y)}`).join(" · ")}; the fuse box ${fusePanel ? `at ${Math.floor(fusePanel.x)},${Math.floor(fusePanel.y)}` : "MISSING"}`);
  };
  placeFuses();

  // ---- THE ELECTRICAL STATION (Level 3) -------------------------------------
  // BACKROOMS.md → "LEVEL 3 — ELECTRICAL STATION". The station is LIVE: its
  // lamps are lit, its arcing panels arc and its water is electrified while
  // its SECTION has power. Six breakers (one a section) only ever switch ON —
  // all six power the lift shutter to Level 4. A section's CUTOFF kills its
  // power for a while (the dark is the Bleeder's; the water goes safe), and
  // ROLLING BLACKOUTS take a section down now and then on their own. The
  // server owns every clock, so everyone in a section loses the lights at the
  // same instant and hears a panel crackle at the same moment.
  type StationSite = { x: number; y: number; side: number; section: number };
  let breakerSites: StationSite[] = [];
  let cutoffSites: StationSite[] = [];
  let shutterSite: { x: number; y: number; side: number } | null = null;
  let arcSites: { x: number; y: number; side: number; section: number; phase: number; warned: number; fired: number }[] = [];
  const cutUntil: number[] = Array(SECTIONS + 1).fill(0);
  const darkUntil: number[] = Array(SECTIONS + 1).fill(0);
  const nextDarkAt: number[] = Array(SECTIONS + 1).fill(0);
  /** A TEST run's thrown breakers: kept for that test only. */
  const testThrown = new Set<number>();
  const STATION_CUTOFF_MS = Number(process.env.STATION_CUTOFF_MS ?? 45_000);
  const DARK_GAP_MIN = Number(process.env.STATION_DARK_GAP_MIN_MS ?? 70_000);
  const DARK_GAP_MAX = Number(process.env.STATION_DARK_GAP_MAX_MS ?? 160_000);
  const DARK_MIN = 6_000;
  const DARK_MAX = 16_000;
  /** Live water: 25 hp every 0.4s while you stand in it powered — a dash
   *  through two cells is survivable at full health; standing in it isn't. */
  const SHOCK_HP = 25;
  const SHOCK_TICK_MS = 400;
  /** An arcing panel's cycle: it crackles ARC_WARN_MS before it arcs for
   *  ARC_FIRE_MS, and the arc takes ARC_HP from anyone within ARC_REACH cells
   *  of the cell in front of it. */
  const ARC_CYCLE_MS = Number(process.env.STATION_ARC_CYCLE_MS ?? 6_500);
  const ARC_WARN_MS = 1_100;
  const ARC_FIRE_MS = 500;
  const ARC_HP = 40;
  const ARC_REACH = 1.6;
  let stationCb: ((ev: StationEvent) => void) | null = null;
  const sectionAt = (x: number, y: number): number => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= sectorS.size || cy >= sectorS.size) return 0;
    return sectorS.section?.[cy * sectorS.size + cx] ?? 0;
  };
  const sectionPowered = (sec: number, now = Date.now()): boolean => sec > 0 && now >= cutUntil[sec] && now >= darkUntil[sec];
  const breakerOn = (sec: number): boolean => !!store.brGetFlag(breakerFlag(sec)) || (testing.has(3) && testThrown.has(sec));
  const powerState = (now = Date.now()): StationState["power"] => {
    const out: StationState["power"] = [];
    for (let k = 1; k <= SECTIONS; k++) out.push({ section: k, powered: sectionPowered(k, now), cutMs: Math.max(0, cutUntil[k] - now), darkMs: Math.max(0, darkUntil[k] - now) });
    return out;
  };
  let lastPowered = "";
  const emitPowerIfChanged = (force = false): void => {
    const p = powerState();
    // a cutoff's window ending under a blackout changes no powered bit, so the
    // key carries the cut too, or the lever stayed showing "pulled" (Nov 2026)
    const key = p.map((q) => (q.powered ? 1 : 0) + (q.cutMs > 0 ? 2 : 0)).join("");
    if (!force && key === lastPowered) return;
    lastPowered = key;
    stationCb?.({ type: "power", power: p });
  };
  const placeStation = (): void => {
    breakerSites = [];
    cutoffSites = [];
    shutterSite = null;
    arcSites = [];
    if (!enabledS) return;
    const size = sectorS.size;
    const deco = sectorS.deco;
    if (!deco) return;
    for (let i = 0; i < deco.length; i++) {
      const k = sdecoKind(deco[i]);
      if (!k) continue;
      const x = (i % size) + 0.5;
      const y = Math.floor(i / size) + 0.5;
      const side = deco[i] & 15;
      const section = sectorS.section?.[i] ?? 0;
      if (k === SDECO.breaker) breakerSites.push({ x, y, side, section });
      else if (k === SDECO.cutoff) cutoffSites.push({ x, y, side, section });
      else if (k === SDECO.shutter) shutterSite = { x, y, side };
      // every panel on its own beat: a phase from its cell, so two never fire
      // in step and a restart keeps the rhythm
      else if (k === SDECO.arc) arcSites.push({ x, y, side, section, phase: (i * 2654435761) % ARC_CYCLE_MS, warned: -1, fired: -1 });
    }
    breakerSites.sort((a, b) => a.section - b.section);
    cutoffSites.sort((a, b) => a.section - b.section);
    const now = Date.now();
    for (let k = 1; k <= SECTIONS; k++) nextDarkAt[k] = now + DARK_GAP_MIN + rng() * (DARK_GAP_MAX - DARK_GAP_MIN);
    console.log(`[backrooms] the station: ${breakerSites.length} breakers, ${cutoffSites.length} cutoffs, ${arcSites.length} arcing panels, the shutter ${shutterSite ? `at ${Math.floor(shutterSite.x)},${Math.floor(shutterSite.y)}` : "MISSING"}`);
  };
  placeStation();
  /** The station's clocks: blackouts, the end of any cut or blackout, the
   *  arcing panels, the live water. Runs only while somebody is down there. */
  const stationTimer = setInterval(() => {
    const now = Date.now();
    const inside = [...sessions.values()].filter((q) => q.level === 3 && !q.lostAt);
    if (!enabledS) return;
    if (!inside.length) {
      // An empty station must not save its blackouts up: a timer that ran
      // out while nobody was there fired every section dark at once the
      // moment somebody walked in (Nov 2026 validation run). Keep each one
      // at least a gap ahead while the level stands empty.
      for (let k = 1; k <= SECTIONS; k++) {
        if (nextDarkAt[k] < now + DARK_GAP_MIN) nextDarkAt[k] = now + DARK_GAP_MIN + rng() * (DARK_GAP_MAX - DARK_GAP_MIN);
      }
      return;
    }
    // rolling blackouts, a section at a time
    for (let k = 1; k <= SECTIONS; k++) {
      if (now < nextDarkAt[k]) continue;
      nextDarkAt[k] = now + DARK_GAP_MIN + rng() * (DARK_GAP_MAX - DARK_GAP_MIN);
      darkUntil[k] = Math.max(darkUntil[k], now + DARK_MIN + Math.floor(rng() * (DARK_MAX - DARK_MIN)));
    }
    emitPowerIfChanged();
    // the arcing panels near anyone (the rest needn't be computed at all)
    for (const a of arcSites) {
      if (!sectionPowered(a.section, now)) continue;
      if (!inside.some((q) => Math.hypot(q.x - a.x, q.y - a.y) < 30)) continue;
      const t = now + a.phase;
      const cycle = Math.floor(t / ARC_CYCLE_MS);
      const into = t % ARC_CYCLE_MS;
      if (into >= ARC_CYCLE_MS - ARC_WARN_MS - ARC_FIRE_MS && a.warned !== cycle) {
        a.warned = cycle;
        stationCb?.({ type: "arc", x: a.x, y: a.y, side: a.side, phase: "warn" });
      }
      if (into >= ARC_CYCLE_MS - ARC_FIRE_MS && a.fired !== cycle) {
        a.fired = cycle;
        stationCb?.({ type: "arc", x: a.x, y: a.y, side: a.side, phase: "fire" });
        // the arc reaches out from the wall into the cell in front of it
        const fx = a.x - [0, 1, 0, -1][a.side] * 0.6;
        const fy = a.y - [-1, 0, 1, 0][a.side] * 0.6;
        for (const q of inside) {
          if (q.fly || immortals.has(q.userId) || Math.hypot(q.x - fx, q.y - fy) > ARC_REACH) continue;
          q.hp -= ARC_HP;
          if (q.hp > 0) {
            hurtCb?.({ userId: q.userId, hp: Math.ceil(q.hp), drop: 0, dead: false, cause: "arc" });
            continue;
          }
          const { x, y, level } = q;
          killPlayer(q, "the live wire");
          hurtCb?.({ userId: q.userId, hp: 0, drop: 0, dead: true, cause: "arc", x, y, level });
        }
      }
    }
  }, 100);
  stationTimer.unref?.();
  const shockTimer = setInterval(() => {
    if (!enabledS) return;
    const now = Date.now();
    for (const q of [...sessions.values()]) {
      if (q.level !== 3 || q.fly || q.lostAt || immortals.has(q.userId)) continue;
      const i = Math.floor(q.y) * sectorS.size + Math.floor(q.x);
      if (sdecoKind(sectorS.deco?.[i] ?? 0) !== SDECO.puddle || !sectionPowered(sectorS.section?.[i] ?? 0, now)) continue;
      q.hp -= SHOCK_HP;
      if (q.hp > 0) {
        hurtCb?.({ userId: q.userId, hp: Math.ceil(q.hp), drop: 0, dead: false, cause: "shock" });
        continue;
      }
      const { x, y, level } = q;
      killPlayer(q, "the live water");
      hurtCb?.({ userId: q.userId, hp: 0, drop: 0, dead: true, cause: "shock", x, y, level });
    }
  }, SHOCK_TICK_MS);
  shockTimer.unref?.();

  // ---- THE ABANDONED OFFICE (Level 4): THE KEYCARD and THE STAIRWELL DOOR ---
  // Josh, Oct 12 2026: "Office, let's do the key card." One security keycard
  // lies in The Security Office; badged at the stairwell door's reader it opens
  // the way on, once, for everyone — LEVEL5_FLAG. It IS Level 4's key: every
  // rule the key keeps (keyHolder[4] and s.hasKey — carried out of the level it
  // goes home, dropped by a death it lies on the body and can be looted, on a
  // body down a shaft it goes home at once) it keeps by construction. Both
  // sites are read from the map's own deco, by NAMED codes.
  let keycardHome: { x: number; y: number; landmark: string | null } = { x: 0, y: 0, landmark: null };
  let stairDoor: { x: number; y: number; side: number } | null = null;
  const placeOffice = (): void => {
    stairDoor = null;
    keyHolder[4] = null;
    if (!enabledO) return;
    const size = sectorO.size;
    const deco = sectorO.deco;
    if (!deco) return;
    for (let i = 0; i < deco.length; i++) {
      const k = odecoKind(deco[i]);
      if (k === ODECO.keycard) {
        const lm = sectorO.landmark[i];
        keycardHome = { x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5, landmark: lm ? (sectorO.landmarks[lm - 1]?.name ?? null) : null };
      } else if (k === ODECO.stairdoor) stairDoor = { x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5, side: odecoVar(deco[i]) };
    }
    console.log(`[backrooms] the office: the keycard ${keycardHome.landmark ? `waits in ${keycardHome.landmark}` : `at ${Math.floor(keycardHome.x)},${Math.floor(keycardHome.y)}`}; ${STAIRDOOR_NAME} ${stairDoor ? `at ${Math.floor(stairDoor.x)},${Math.floor(stairDoor.y)}` : "MISSING"}`);
  };
  placeOffice();
  // ---- THE TEMP (Josh, Oct 12 2026: "I like your idea on the creature") ----
  // BACKROOMS.md → "LEVEL 4 — THE ABANDONED OFFICE → THE CREATURE". A
  // featureless office mannequin that is always somewhere in the office and
  // never seen moving:
  //
  //  · WATCHED, IT IS STONE. It cannot move while ANY living player on the
  //    level has it in view: inside a ±45° cone of their facing, a clear line
  //    of sight (the LOS every creature uses), within TEMP_RANGE, AND LIT —
  //    standing under a working troffer outside a dip, or in a held beam.
  //    A thing you can't see isn't watched.
  //  · UNWATCHED, IT IS FASTER THAN YOU: TEMP_SPEED (3.4) against a sprint's
  //    2.85, along a real path, never through a wall. You survive by LOOKING.
  //  · THE BLINK: the troffers dip TEMP_DIP_MS (0.4s) a ZONE at a time, every
  //    8-15s, on this server clock — the same dip for every player. In a dip
  //    it is not lit, so not watched, so it MOVES (~1.4 cells). A held beam
  //    keeps it lit through a dip: that is what the torch is for here.
  //  · TOUCH IS DEATH ("the temp"); then it stands over the body a while and
  //    is gone — and somewhere else when next seen. It never enters the Lift
  //    Lobby, never follows a flyer, and the dead are out of its reach.
  const TEMP_SPEED = Number(process.env.BACKROOMS_TEMP_SPEED ?? 3.4);
  /** cos 45°: the camera's field of view, with a margin. */
  const TEMP_CONE = Math.SQRT1_2;
  const TEMP_RANGE = 40;
  const TEMP_KILL = 0.6;
  const TEMP_STAND_MS = Number(process.env.BACKROOMS_TEMP_STAND_MS ?? 8_000);
  /** After its kill it is gone this long before it is somewhere else. */
  const TEMP_GONE_MS = Number(process.env.BACKROOMS_TEMP_GONE_MS ?? 15_000);
  const TEMP_DIP_MS = Number(process.env.BACKROOMS_TEMP_DIP_MS ?? 400);
  const TEMP_DIP_MIN = Number(process.env.BACKROOMS_TEMP_DIP_MIN_MS ?? 8_000);
  const TEMP_DIP_MAX = Number(process.env.BACKROOMS_TEMP_DIP_MAX_MS ?? 15_000);
  /** How many frozen poses the mannequin has (the client's TEMP_POSES). */
  const TEMP_POSES = 5;
  const temp = {
    live: false,
    x: 0,
    y: 0,
    h: 0,
    pose: 0,
    moving: false,
    targetId: 0,
    path: [] as [number, number][],
    pathAt: 0,
    /** Standing over a body until then; gone after. */
    standUntil: 0,
    /** Not anywhere before this. */
    restUntil: 0,
  };
  let tempCb: ((ev: TempEvent) => void) | null = null;
  /** Cells a WORKING troffer lights (worldgen-office.ts officeLitCells). */
  let officeLit = enabledO ? officeLitCells(sectorO) : new Uint8Array(0);
  const dipUntil = new Array<number>(BLINK_ZONES + 1).fill(0);
  const nextDipAt = new Array<number>(BLINK_ZONES + 1).fill(0);
  /** Is this cell lit by its troffers right now (not dipping)? */
  const officeLitNow = (x: number, y: number, now = Date.now()): boolean => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= sectorO.size || cy >= sectorO.size) return false;
    const i = cy * sectorO.size + cx;
    return !!officeLit[i] && now >= dipUntil[sectorO.section?.[i] ?? 0];
  };
  /** Its refusals: a lethal shaft and the safe room. */
  const tempShuns = (x: number, y: number): boolean => isPitCell(sectorO, x, y) || officeSafeAt(x, y);
  /** Does this player have it in view — in their cone, in line, in range, and
   *  lit (troffer outside a dip, or anyone's held beam)? */
  const tempWatchedBy = (q: BrSession, prey: BrSession[], now: number): boolean => {
    const dx = temp.x - q.x;
    const dy = temp.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d > TEMP_RANGE) return false;
    if (d > 0.01) {
      const { fx, fy } = facingOf(q.heading);
      if ((dx / d) * fx + (dy / d) * fy < TEMP_CONE) return false;
    }
    if (!lineWalkableIn(sectorO, q.x, q.y, temp.x, temp.y)) return false;
    return officeLitNow(temp.x, temp.y, now) || beamOn(sectorO, temp.x, temp.y, prey);
  };
  /** Somewhere new, out of everyone's sight: 18-40 cells from a player, on
   *  floor it can walk out of, never in the lobby, and able to reach them. */
  const tempPlace = (inside: BrSession[]): boolean => {
    // only somebody it could reach: a body in the lobby is nobody's mark
    const out = inside.filter((q) => !officeSafeAt(Math.floor(q.x), Math.floor(q.y)));
    if (!out.length) return false;
    const mark = out[Math.floor(rng() * out.length)];
    for (let tries = 0; tries < 300; tries++) {
      const a = rng() * Math.PI * 2;
      const d = 18 + rng() * 22;
      const x = Math.floor(mark.x + Math.cos(a) * d);
      const y = Math.floor(mark.y + Math.sin(a) * d);
      if (x < 2 || y < 2 || x >= sectorO.size - 2 || y >= sectorO.size - 2) continue;
      if (whyNoCreature(sectorO, x, y, "walker") || tempShuns(x, y)) continue;
      if (inside.some((q) => lineWalkableIn(sectorO, q.x, q.y, x + 0.5, y + 0.5))) continue;
      if (!findPathIn(sectorO, x + 0.5, y + 0.5, mark.x, mark.y, tempShuns, false, undefined, true).length) continue;
      temp.x = x + 0.5;
      temp.y = y + 0.5;
      temp.h = Math.atan2(mark.x - temp.x, mark.y - temp.y);
      temp.pose = Math.floor(rng() * TEMP_POSES);
      temp.live = true;
      temp.moving = false;
      temp.path = [];
      temp.targetId = mark.userId;
      temp.standUntil = 0;
      return true;
    }
    return false;
  };
  const tempGone = (now: number, rest: number): void => {
    if (temp.live) tempCb?.({ type: "gone" });
    temp.live = false;
    temp.moving = false;
    temp.path = [];
    temp.targetId = 0;
    temp.standUntil = 0;
    temp.restUntil = now + rest;
  };
  /** The troffers' dips, a zone at a time, on one clock for everybody. */
  const officeBlinkTick = (now: number): void => {
    for (let z = 1; z <= BLINK_ZONES; z++) {
      if (!nextDipAt[z]) nextDipAt[z] = now + TEMP_DIP_MIN + rng() * (TEMP_DIP_MAX - TEMP_DIP_MIN);
      if (now < nextDipAt[z]) continue;
      dipUntil[z] = now + TEMP_DIP_MS;
      nextDipAt[z] = now + TEMP_DIP_MIN + rng() * (TEMP_DIP_MAX - TEMP_DIP_MIN);
      tempCb?.({ type: "blink", zone: z, ms: TEMP_DIP_MS });
    }
  };
  const tempTick = (): void => {
    if (!enabledO) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const all = [...sessions.values()].filter((q) => q.level === 4 && !q.lostAt);
    const inside = all.filter((q) => !q.fly);
    if (!inside.length) {
      if (temp.live) tempGone(now, 0);
      nextDipAt.fill(0);
      return;
    }
    officeBlinkTick(now);
    if (!temp.live) {
      if (now < temp.restUntil) return;
      // nowhere to stand yet (everyone in the lobby, or no hidden corner):
      // try again in a second, not every tick
      if (!tempPlace(inside)) {
        temp.restUntil = now + 1_000;
        return;
      }
    }
    // over a body: it stands, then it is gone
    if (temp.standUntil) {
      if (now >= temp.standUntil) tempGone(now, TEMP_GONE_MS);
      else tempCb?.({ type: "pos", x: temp.x, y: temp.y, h: temp.h, pose: temp.pose, moving: false });
      return;
    }
    const watched = inside.some((q) => tempWatchedBy(q, inside, now));
    if (watched) {
      if (temp.moving) {
        // somebody looked: it stops — and it is never in the same pose twice
        temp.moving = false;
        temp.path = [];
        temp.pose = (temp.pose + 1 + Math.floor(rng() * (TEMP_POSES - 1))) % TEMP_POSES;
        tempCb?.({ type: "freeze", x: temp.x, y: temp.y, pose: temp.pose });
      }
    } else {
      // nobody is looking: it closes on the nearest body it can reach
      const reachable = inside.filter((q) => !officeSafeAt(Math.floor(q.x), Math.floor(q.y)));
      let mark = sessions.get(temp.targetId) ?? null;
      if (!mark || !reachable.includes(mark)) {
        mark = reachable.length ? reachable.reduce((a, b) => (Math.hypot(a.x - temp.x, a.y - temp.y) <= Math.hypot(b.x - temp.x, b.y - temp.y) ? a : b)) : null;
        temp.targetId = mark?.userId ?? 0;
        temp.path = [];
      }
      if (mark) {
        if (!temp.path.length || now - temp.pathAt > 600) {
          temp.path = findPathIn(sectorO, temp.x, temp.y, mark.x, mark.y, tempShuns, true, undefined, true);
          temp.pathAt = now;
        }
        const before = { x: temp.x, y: temp.y };
        moveAlongIn(sectorO, temp as unknown as EntBrain, TEMP_SPEED, dt, tempShuns, undefined, true);
        const mx = temp.x - before.x;
        const my = temp.y - before.y;
        temp.moving = Math.hypot(mx, my) > 0.001;
        if (temp.moving) temp.h = Math.atan2(mx, my);
        // TOUCH IS DEATH for anybody it reaches, not only the one it was
        // closing on — a bystander standing in its way used to be walked
        // straight through (Nov 2026 validation run).
        const victim = reachable
          .filter((q) => !immortals.has(q.userId) && Math.hypot(q.x - temp.x, q.y - temp.y) < TEMP_KILL)
          .sort((a, b) => Math.hypot(a.x - temp.x, a.y - temp.y) - Math.hypot(b.x - temp.x, b.y - temp.y))[0];
        if (victim) {
          const kx = victim.x;
          const ky = victim.y;
          killPlayer(victim, "the temp", { dir: Math.atan2(victim.x - temp.x, victim.y - temp.y), power: 1.2 });
          tempCb?.({ type: "kill", x: kx, y: ky, userId: victim.userId });
          temp.moving = false;
          temp.path = [];
          temp.targetId = 0;
          temp.standUntil = now + TEMP_STAND_MS;
        }
      } else temp.moving = false;
    }
    if (temp.live) {
      filmed(4, sectorO, temp.x, temp.y);
      tempCb?.({ type: "pos", x: temp.x, y: temp.y, h: temp.h, pose: temp.pose, moving: temp.moving });
    }
  };

  /** Is this cell in a room nothing hunts in (the Lift Lobby — the way in is
   *  safe, from the Temp and from any Entity the map editor seats)? */
  const officeSafeAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= sectorO.size || y >= sectorO.size) return false;
    const i = y * sectorO.size + x;
    if (sectorO.solid[i]) return false;
    const t = sectorO.districts[sectorO.district[i]]?.type as string | undefined;
    return !!t && (OFFICE_SAFE_TYPES as readonly string[]).includes(t);
  };

  // ---- THE TERROR HOTEL (Level 5): THE GUEST REGISTER, THE BOILER KEY, THE
  // LIFTS AND THE HEAT -----------------------------------------------------
  // Josh, Oct 13 2026: "go with your recommendations". BACKROOMS.md → "LEVEL 5
  // — TERROR HOTEL".
  //
  //  · THE REGISTER, open on the Mahjong table in the Beverly Room, names ONE
  //    suite — drawn per map (worldgen-hotel.ts, stamped on sector.hotel). It
  //    is told only to whoever stands at it (`readRegister`): it never rides
  //    the welcome, or a modded client would skip the hunt.
  //  · THE BOILER KEY hangs in that suite and is Level 5's key, with every rule
  //    the key keeps (keyHolder[5], s.hasKey). It streams only to someone IN
  //    its room (`hotelKeyFor`): wandering past suites finds nothing.
  //  · THE RUSTY DOOR, deep below stairs, takes it: LEVEL6_FLAG, once, for all.
  //  · THE LIFTS: floors 1-12 come out at another lift on this floor, the same
  //    one every time for a given car and floor; 13 and up, the doors close
  //    and do not open again — a death, "the lift".
  //  · THE HEAT: below stairs it climbs, faster the further from the Boiler
  //    Room's door; in the Main Hall it falls. At the top it costs health. An
  //    open furnace's mouth burns. Almond water cools.
  let registerSite: { x: number; y: number } | null = null;
  let boilerKeyHome: { x: number; y: number } | null = null;
  let keyRoom: { x: number; y: number; w: number; h: number } | null = null;
  let rustyDoor: { x: number; y: number; side: number } | null = null;
  let hotelLifts: { x: number; y: number; side: number }[] = [];
  let hotelFurnaces: { x: number; y: number; side: number }[] = [];
  /** Heat gained a second on each cell (0 = the Main Hall, where it falls). */
  let heatRate = new Float32Array(0);
  /** The cells an open furnace burns: the furnace and the cell at its mouth. */
  const furnaceMouth = new Set<number>();
  const HDX = [0, 1, 0, -1];
  const HDY = [-1, 0, 1, 0];
  const placeHotel = (): void => {
    registerSite = null;
    boilerKeyHome = null;
    keyRoom = null;
    rustyDoor = null;
    hotelLifts = [];
    hotelFurnaces = [];
    furnaceMouth.clear();
    keyHolder[5] = null;
    if (!enabledH) return;
    const size = sectorH.size;
    const deco = sectorH.deco;
    if (!deco) return;
    for (let i = 0; i < deco.length; i++) {
      const k = hdecoKind(deco[i]);
      if (!k) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      const at = { x: x + 0.5, y: y + 0.5, side: hdecoVar(deco[i]) & 3 };
      if (k === HDECO.register) registerSite = { x: at.x, y: at.y };
      else if (k === HDECO.rustydoor) rustyDoor = at;
      else if (k === HDECO.lift) hotelLifts.push(at);
      else if (k === HDECO.furnace) {
        hotelFurnaces.push(at);
        furnaceMouth.add(i);
        const mx = x - HDX[at.side];
        const my = y - HDY[at.side];
        if (mx >= 0 && my >= 0 && mx < size && my < size) furnaceMouth.add(my * size + mx);
      }
    }
    const h = sectorH.hotel;
    if (h && h.target >= 0 && h.suites[h.target]) {
      const q = h.suites[h.target];
      boilerKeyHome = { x: q.x + 0.5, y: q.y + 0.5 };
      keyRoom = { ...q.rect };
    }
    // THE HEAT's field: steps from the Main Hall into the Boiler Room
    heatRate = new Float32Array(size * size);
    const sec = sectorH.section;
    if (sec) {
      const seeds: { x: number; y: number }[] = [];
      for (let y = 1; y < size - 1; y++)
        for (let x = 1; x < size - 1; x++) {
          const i = y * size + x;
          if (sec[i] !== ZONE_BOILER || sectorH.solid[i]) continue;
          const nb = [i - size, i + size, i - 1, i + 1];
          if (nb.some((j) => !sectorH.solid[j] && sec[j] && sec[j] !== ZONE_BOILER)) seeds.push({ x, y });
        }
      const d = seeds.length ? distanceMap(sectorH, seeds) : new Int32Array(size * size).fill(-1);
      let dmax = 1;
      for (let i = 0; i < d.length; i++) if (sec[i] === ZONE_BOILER && d[i] > dmax) dmax = d[i];
      for (let i = 0; i < d.length; i++) if (sec[i] === ZONE_BOILER && !sectorH.solid[i]) heatRate[i] = HEAT_RISE_MIN + (HEAT_RISE_MAX - HEAT_RISE_MIN) * (Math.max(0, d[i]) / dmax);
    }
    console.log(
      `[backrooms] the hotel: the register ${registerSite ? "on its table" : "MISSING"}, ${h?.suites.length ?? 0} suites, it names No. ${boilerKeyHome && h ? h.suites[h.target].number : "—"}; ${hotelLifts.length} lift doors, ${hotelFurnaces.length} furnaces; ${RUSTYDOOR_NAME} ${rustyDoor ? "below stairs" : "MISSING"}`,
    );
  };
  // Heat dials (env-dialable for the harness).
  const HEAT_MAX = 100;
  const HEAT_RISE_MIN = Number(process.env.BACKROOMS_HEAT_RISE_MIN ?? 0.6);
  const HEAT_RISE_MAX = Number(process.env.BACKROOMS_HEAT_RISE_MAX ?? 1.8);
  const HEAT_COOL = Number(process.env.BACKROOMS_HEAT_COOL ?? 4);
  /** Health lost a second at the top of the gauge. */
  const HEAT_HP = 6;
  /** At a furnace's mouth: heat and health a second. */
  const FURNACE_HEAT = 25;
  const FURNACE_HP = 12;
  const ALMOND_COOL = 45;
  const HEAT_TICK_MS = Number(process.env.BACKROOMS_HEAT_TICK_MS ?? 1000);
  const LIFT_TOP_FLOOR = 20;
  const LIFT_DEATH_FLOOR = 13;
  const LIFT_REACH = 2.2;
  let heatCb: ((ev: { userId: number; heat: number }) => void) | null = null;
  const lastHeatSent = new Map<number, number>();
  /** Where a lift's floor comes out: the same lift every time for this car
   *  and button, never the car you're in. */
  const liftDest = (from: number, floor: number): number => {
    const n = hotelLifts.length;
    if (n < 2) return -1;
    let hsh = (from + 1) * 2654435761 + floor * 40503;
    hsh = (hsh ^ (hsh >>> 15)) >>> 0;
    const k = hsh % (n - 1);
    return k >= from ? k + 1 : k;
  };
  /** Is this cell in a room nothing hunts in (the Service Stair)? */
  const hotelSafeAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= sectorH.size || y >= sectorH.size) return false;
    const i = y * sectorH.size + x;
    if (sectorH.solid[i]) return false;
    const t = sectorH.districts[sectorH.district[i]]?.type as string | undefined;
    return !!t && (HOTEL_SAFE_TYPES as readonly string[]).includes(t);
  };
  placeHotel();
  const heatTimer = setInterval(() => {
    if (!enabledH) return;
    // guarded like every loop: a throw lands in the errors table and the
    // health screen goes red, instead of the gauge quietly stopping
    heartbeat("backroomsHeat", HEAT_TICK_MS * 40);
    try {
      heatTick();
    } catch (e) {
      beatFailed(store, "backroomsHeat", e);
    }
  }, HEAT_TICK_MS);
  heatTimer.unref?.();
  function heatTick(): void {
    const dt = HEAT_TICK_MS / 1000;
    const size = sectorH.size;
    for (const s of [...sessions.values()]) {
      if (s.level !== 5 || s.fly || s.lostAt) continue;
      const cx = Math.floor(s.x);
      const cy = Math.floor(s.y);
      const i = cx >= 0 && cy >= 0 && cx < size && cy < size ? cy * size + cx : -1;
      const rate = i >= 0 ? heatRate[i] : 0;
      const burning = i >= 0 && furnaceMouth.has(i);
      let h = s.heat ?? 0;
      h += rate > 0 ? rate * dt : -HEAT_COOL * dt;
      if (burning) h += FURNACE_HEAT * dt;
      h = Math.max(0, Math.min(HEAT_MAX, h));
      s.heat = h;
      const shown = Math.round(h);
      if (lastHeatSent.get(s.userId) !== shown) {
        lastHeatSent.set(s.userId, shown);
        heatCb?.({ userId: s.userId, heat: shown });
      }
      if ((h < HEAT_MAX && !burning) || immortals.has(s.userId)) continue;
      s.hp -= (burning ? FURNACE_HP : HEAT_HP) * dt;
      const cause = burning ? "a furnace" : "the heat";
      if (s.hp > 0) {
        hurtCb?.({ userId: s.userId, hp: Math.ceil(s.hp), drop: 0, dead: false, cause });
        continue;
      }
      const { x, y } = s;
      killPlayer(s, cause);
      hurtCb?.({ userId: s.userId, hp: 0, drop: 0, dead: true, cause, x, y, level: 5 });
    }
    for (const id of lastHeatSent.keys()) if (sessions.get(id)?.level !== 5) lastHeatSent.delete(id);
  }

  // ---- LIGHTS OUT (Level 6): THE HANDWHEEL, THE SEA HATCH, THE BATTERIES ----
  // Josh, Oct 14 2026: "1. A 2. A 3. that fine". BACKROOMS.md → "LEVEL 6 —
  // LIGHTS OUT".
  //
  //  · THE HANDWHEEL lies on ONE of the wheel spots the rooms drew — chosen by
  //    the plan (worldgen-lights.ts, stamped on sector.lights), far from the
  //    way in and from the hatch. It is Level 6's key, with every rule the key
  //    keeps (keyHolder[6], s.hasKey), and streams like any key: to whoever
  //    comes near it.
  //  · THE SEA HATCH, deep in the Wet End, takes it: LEVEL7_FLAG, once, for
  //    all. The hatch is unmarked; the client plays the sea behind it.
  //  · THE BATTERIES: up to BATTERY_LOOSE spares lie on the battery spots the
  //    rooms drew, one more every BATTERY_SPAWN_MS while fewer lie out. They
  //    are ordinary drops (the hour's rot, the take-drop rule).
  let wheelHome: { x: number; y: number } | null = null;
  let seaHatch: { x: number; y: number; side: number } | null = null;
  let batterySpots: { x: number; y: number }[] = [];
  const BATTERY_LOOSE = Number(process.env.BACKROOMS_BATTERY_LOOSE ?? 6);
  const BATTERY_SPAWN_MS = Number(process.env.BACKROOMS_BATTERY_SPAWN_MS ?? 240_000);
  const placeLights = (): void => {
    wheelHome = null;
    seaHatch = null;
    batterySpots = [];
    keyHolder[6] = null;
    if (!enabledL) return;
    const l = sectorL.lights;
    if (!l) return;
    if (l.wheel) wheelHome = { x: l.wheel.x + 0.5, y: l.wheel.y + 0.5 };
    if (l.hatch) seaHatch = { x: l.hatch.x + 0.5, y: l.hatch.y + 0.5, side: l.hatch.side };
    batterySpots = l.batterySpots.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  };
  /** Is this cell in a room nothing hunts in (the Stair)? */
  const lightsSafeAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= sectorL.size || y >= sectorL.size) return false;
    const i = y * sectorL.size + x;
    if (sectorL.solid[i]) return false;
    const t = sectorL.districts[sectorL.district[i]]?.type as string | undefined;
    return !!t && (LIGHTS_SAFE_TYPES as readonly string[]).includes(t);
  };
  placeLights();
  const spawnBattery = (): void => {
    // A Test play is stocked too: what the tester picks up never reaches a
    // real locker (takeDrop), so the batteries cost the economy nothing.
    if (!enabledL || !batterySpots.length) return;
    if (drops.filter((d) => d.lvl === 6 && d.kind === "battery").length >= BATTERY_LOOSE) return;
    const free = batterySpots.filter((p) => !drops.some((d) => d.lvl === 6 && Math.hypot(d.x - p.x, d.y - p.y) < 1));
    if (!free.length) return;
    const p = free[randomInt(0, free.length)];
    const id = store.brAddDrop(sectorIdL, { x: p.x, y: p.y, kind: "battery", level: 0, color: null, charge: null });
    drops.push({ id, x: p.x, y: p.y, kind: "battery", level: 0, color: null, charge: null, lvl: 6 });
  };
  const batteryTimer = setInterval(() => {
    heartbeat("backroomsBatteries", BATTERY_SPAWN_MS * 3);
    spawnBattery();
  }, BATTERY_SPAWN_MS);
  batteryTimer.unref?.();
  for (let k = 0; k < BATTERY_LOOSE; k++) spawnBattery();

  // ---- THE DEATHMOTHS (Josh, Oct 13 2026: "go with your recommendations") --
  // BACKROOMS.md → "LEVEL 5 — TERROR HOTEL → THE CREATURE". The level where
  // your LIGHT is the danger:
  //
  //  · A SWARM SLEEPS on each nest (the dark rooms: linen closets, coal
  //    stores, dead suites) until a LIT TORCH comes within MOTH_WAKE of it,
  //    in line of sight.
  //  · AWAKE, IT GOES FOR THE BRIGHTEST LIGHT IT CAN SEE — a lit torch, the
  //    nearest of them; somebody standing in the dark beside the torch-bearer
  //    is furniture. It flies at MOTH_SPEED: faster than a walk, slower than a
  //    sprint.
  //  · AROUND YOU, IT BITES: MOTH_BITE health a second (about ten seconds in
  //    a swarm kills — escapable, not instant). "the deathmoths".
  //  · IT LOSES YOU when your torch has been OFF for MOTH_FORGET, or it has
  //    had no line to you for as long (a corner, a shut door). Then it drifts
  //    home and sleeps — and wakes again for the next light.
  //  · THE BEVERLY ROOM: the chandelier is the brightest light in the hotel.
  //    A swarm that reaches that room circles it for MOTH_CIRCLE and forgets
  //    everybody in it.
  //  · Never into the Service Stair (the way in is safe), never after a
  //    flyer or the dead.
  const MOTH_WAKE = Number(process.env.BACKROOMS_MOTH_WAKE ?? 9);
  const MOTH_SENSE = 22;
  const MOTH_SPEED = Number(process.env.BACKROOMS_MOTH_SPEED ?? 2.4);
  const MOTH_HOME_SPEED = 1.4;
  const MOTH_REACH = 1.2;
  const MOTH_BITE = Number(process.env.BACKROOMS_MOTH_BITE ?? 10);
  const MOTH_FORGET = Number(process.env.BACKROOMS_MOTH_FORGET_MS ?? 3_000);
  const MOTH_CIRCLE = Number(process.env.BACKROOMS_MOTH_CIRCLE_MS ?? 25_000);
  type MothMode = "asleep" | "hunting" | "circling" | "returning";
  interface Swarm {
    id: number;
    nestX: number;
    nestY: number;
    x: number;
    y: number;
    mode: MothMode;
    targetId: number;
    /** When the target's torch went out / the line to them broke (0 = it hasn't). */
    darkSince: number;
    blindSince: number;
    circleUntil: number;
    path: [number, number][];
    pathAt: number;
  }
  let swarms: Swarm[] = [];
  let mothCb: ((ev: MothEvent) => void) | null = null;
  const placeMoths = (): void => {
    swarms = [];
    if (!enabledH || !sectorH.deco) return;
    const size = sectorH.size;
    for (let i = 0; i < sectorH.deco.length; i++) {
      if (hdecoKind(sectorH.deco[i]) !== HDECO.nest) continue;
      const x = (i % size) + 0.5;
      const y = Math.floor(i / size) + 0.5;
      swarms.push({ id: swarms.length, nestX: x, nestY: y, x, y, mode: "asleep", targetId: 0, darkSince: 0, blindSince: 0, circleUntil: 0, path: [], pathAt: 0 });
    }
  };
  placeMoths();
  /** The way in is out of bounds to them; so is a lethal shaft. */
  const mothShuns = (x: number, y: number): boolean => isPitCell(sectorH, x, y) || hotelSafeAt(x, y);
  const inBeverly = (x: number, y: number): boolean => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= sectorH.size || cy >= sectorH.size) return false;
    return sectorH.districts[sectorH.district[cy * sectorH.size + cx]]?.type === "beverly";
  };
  const torchLit = (q: BrSession): boolean => !q.fly && q.equip === "flashlight!";
  /** The brightest light this swarm can see: the nearest lit torch in line. */
  const brightestFor = (w: Swarm, prey: BrSession[], range: number): BrSession | null => {
    let best: BrSession | null = null;
    let bd = range;
    for (const q of prey) {
      if (!torchLit(q) || hotelSafeAt(Math.floor(q.x), Math.floor(q.y))) continue;
      const d = Math.hypot(q.x - w.x, q.y - w.y);
      if (d > bd || !lineWalkableIn(sectorH, w.x, w.y, q.x, q.y)) continue;
      best = q;
      bd = d;
    }
    return best;
  };
  const mothEmit = (w: Swarm): void => mothCb?.({ type: "pos", id: w.id, x: w.x, y: w.y, mode: w.mode });
  const flyTo = (w: Swarm, tx: number, ty: number, speed: number, now: number, dt: number): void => {
    if (!w.path.length || now - w.pathAt > 500) {
      w.path = findPathIn(sectorH, w.x, w.y, tx, ty, mothShuns, true, undefined, true);
      w.pathAt = now;
    }
    moveAlongIn(sectorH, w as unknown as EntBrain, speed, dt, mothShuns, undefined, true);
  };
  const mothHome = (w: Swarm): void => {
    w.mode = "returning";
    w.targetId = 0;
    w.darkSince = 0;
    w.blindSince = 0;
    w.path = [];
  };
  const mothTick = (): void => {
    if (!enabledH || !swarms.length) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const prey = [...sessions.values()].filter((q) => q.level === 5 && !q.lostAt && !q.fly);
    if (!prey.length) {
      // nobody in the hotel: every swarm back on its nest, asleep
      for (const w of swarms) {
        if (w.mode === "asleep") continue;
        Object.assign(w, { x: w.nestX, y: w.nestY, mode: "asleep", targetId: 0, darkSince: 0, blindSince: 0, path: [] });
        mothCb?.({ type: "sleep", id: w.id, x: w.x, y: w.y });
      }
      return;
    }
    for (const w of swarms) {
      if (w.mode === "asleep") {
        const lit = brightestFor(w, prey, MOTH_WAKE);
        if (!lit) continue;
        w.mode = "hunting";
        w.targetId = lit.userId;
        w.path = [];
        mothCb?.({ type: "wake", id: w.id, x: w.x, y: w.y });
      }
      if (w.mode === "circling") {
        // round the chandelier, forgetting everybody, until it tires of it
        const c = registerSite ?? { x: w.x, y: w.y };
        const a = now / 900 + w.id;
        flyTo(w, c.x + Math.cos(a) * 3, c.y + Math.sin(a) * 3, MOTH_HOME_SPEED, now, dt);
        if (now >= w.circleUntil) mothHome(w);
        mothEmit(w);
        continue;
      }
      if (w.mode === "returning") {
        const lit = brightestFor(w, prey, MOTH_WAKE);
        if (lit) {
          w.mode = "hunting";
          w.targetId = lit.userId;
          w.path = [];
        } else {
          flyTo(w, w.nestX, w.nestY, MOTH_HOME_SPEED, now, dt);
          if (Math.hypot(w.x - w.nestX, w.y - w.nestY) < 0.6) {
            Object.assign(w, { x: w.nestX, y: w.nestY, mode: "asleep", path: [] });
            mothCb?.({ type: "sleep", id: w.id, x: w.x, y: w.y });
            continue;
          }
          mothEmit(w);
          continue;
        }
      }
      // HUNTING
      if (inBeverly(w.x, w.y)) {
        // the chandelier outshines anybody's torch
        w.mode = "circling";
        w.targetId = 0;
        w.circleUntil = now + MOTH_CIRCLE;
        w.path = [];
        mothCb?.({ type: "circle", id: w.id, x: w.x, y: w.y });
        mothEmit(w);
        continue;
      }
      // a brighter (nearer) torch takes it from the one it was after
      const lit = brightestFor(w, prey, MOTH_SENSE);
      let mark = sessions.get(w.targetId) ?? null;
      if (!mark || mark.level !== 5 || mark.fly || mark.lostAt) mark = null;
      if (lit && (!mark || !torchLit(mark) || Math.hypot(lit.x - w.x, lit.y - w.y) + 2 < Math.hypot(mark.x - w.x, mark.y - w.y))) {
        mark = lit;
        w.targetId = lit.userId;
        w.darkSince = 0;
        w.blindSince = 0;
        w.path = [];
      }
      if (!mark) {
        mothHome(w);
        mothEmit(w);
        continue;
      }
      // it loses you: light off, or no line, for long enough
      if (torchLit(mark)) w.darkSince = 0;
      else if (!w.darkSince) w.darkSince = now;
      if (lineWalkableIn(sectorH, w.x, w.y, mark.x, mark.y)) w.blindSince = 0;
      else if (!w.blindSince) w.blindSince = now;
      if ((w.darkSince && now - w.darkSince >= MOTH_FORGET) || (w.blindSince && now - w.blindSince >= MOTH_FORGET) || hotelSafeAt(Math.floor(mark.x), Math.floor(mark.y))) {
        mothHome(w);
        mothEmit(w);
        continue;
      }
      const d = Math.hypot(mark.x - w.x, mark.y - w.y);
      if (d > 0.4) flyTo(w, mark.x, mark.y, MOTH_SPEED, now, dt);
      // a swarm bites only what it can reach — never through a wall (Oct
      // 2026 review: its 1.2-cell reach crossed a thin wall)
      if (Math.hypot(mark.x - w.x, mark.y - w.y) <= MOTH_REACH && !immortals.has(mark.userId) && lineWalkableIn(sectorH, w.x, w.y, mark.x, mark.y)) {
        mark.hp -= MOTH_BITE * dt;
        if (mark.hp > 0) hurtCb?.({ userId: mark.userId, hp: Math.ceil(mark.hp), drop: 0, dead: false, cause: "moths" });
        else {
          const { x, y } = mark;
          killPlayer(mark, "the deathmoths");
          hurtCb?.({ userId: mark.userId, hp: 0, drop: 0, dead: true, cause: "the deathmoths", x, y, level: 5 });
          mothCb?.({ type: "kill", id: w.id, x, y, userId: mark.userId });
          mothHome(w);
        }
      }
      filmed(5, sectorH, w.x, w.y);
      mothEmit(w);
    }
  };


  // ---- THE LISTENER (Josh, Oct 14 2026: "2. A") — Lights Out's creature ----
  // BACKROOMS.md → "LEVEL 6 — LIGHTS OUT → THE CREATURE". Every level so far
  // turned on the torch; this one ignores it. IT IS BLIND: light means nothing
  // to it. NOISE IS EVERYTHING.
  //
  //  · WHAT IT HEARS (cells; through a wall at half): a walk LISTEN.walk, a
  //    sprint LISTEN.run, a crouch nothing, any step in the Wet End's water
  //    LISTEN.splash, a dropped item LISTEN.drop, a VOICE or a walkie
  //    LISTEN.voice — talking is what finds you.
  //  · HOW IT MOVES: wanders at LISTENER_WANDER, goes to the last thing it
  //    heard at LISTENER_SEARCH, and lunges at LISTENER_LUNGE only when the
  //    noise was within LISTENER_LUNGE_RANGE — a sprint outruns it otherwise.
  //  · THE TOUCH, TWICE: the first does no damage — the cold hand — and then
  //    it STANDS STILL for LISTENER_PAUSE (the whisper; your chance), then
  //    LISTENS HARD for LISTENER_KNOW (hearing doubled; in the water you are
  //    heard just standing there). Silent on dry floor, or already gone, and
  //    it loses you and wanders off AWAY from you. A second touch inside
  //    LISTENER_SECOND kills: "the listener".
  //  · Never into the Stair, never after a flyer; one on the level, two once
  //    LISTENER_PAIR_AT bodies are down here; an empty level has none.
  const LISTEN = {
    walk: Number(process.env.BACKROOMS_LISTEN_WALK ?? 3),
    run: Number(process.env.BACKROOMS_LISTEN_RUN ?? 8),
    splash: Number(process.env.BACKROOMS_LISTEN_SPLASH ?? 6),
    drop: 6,
    voice: Number(process.env.BACKROOMS_LISTEN_VOICE ?? 10),
  };
  const LISTENER_WANDER = 0.9;
  const LISTENER_SEARCH = 1.2;
  const LISTENER_LUNGE = 3.0;
  const LISTENER_LUNGE_RANGE = 3;
  const LISTENER_LUNGE_MS = 1_500;
  const LISTENER_TOUCH = 0.7;
  const LISTENER_PAUSE = Number(process.env.BACKROOMS_LISTENER_PAUSE_MS ?? 1_500);
  const LISTENER_KNOW = Number(process.env.BACKROOMS_LISTENER_KNOW_MS ?? 5_000);
  const LISTENER_SECOND = Number(process.env.BACKROOMS_LISTENER_SECOND_MS ?? 20_000);
  const LISTENER_LINGER = 2_500;
  const LISTENER_PAIR_AT = 8;
  /** How far from every body a Listener arrives (never in anyone's beam). */
  const LISTENER_ARRIVE = 22;
  type ListenerMode = "wander" | "search" | "lunge" | "still" | "listen";
  interface Listener {
    id: number;
    x: number;
    y: number;
    mode: ListenerMode;
    path: [number, number][];
    pathAt: number;
    /** Where it is going (a heard noise, or a wander spot). */
    tx: number;
    ty: number;
    /** When the current lunge / still / listen ends. */
    until: number;
    /** Arrived where it was going: stands listening until this (0 = still going). */
    lingerUntil: number;
    /** THE TOUCHED: whom it is listening for, and where they stood. */
    knowId: number;
    knowX: number;
    knowY: number;
  }
  let listeners: Listener[] = [];
  let listenerSeq = 1;
  let listenerCb: ((ev: ListenerEvent) => void) | null = null;
  /** When each player was last touched (the second touch inside the window kills). */
  const touchedAt = new Map<number, number>();
  /** Players it has LET GO (silent through its listening): until this, its
   *  wandering never touches them — only a noise it goes after can. Without
   *  it the walk "away" from you could route straight back through you. */
  const spared = new Map<number, number>();
  /** The way in is out of bounds to it; so is a lethal shaft. */
  const listenerShuns = (x: number, y: number): boolean => isPitCell(sectorL, x, y) || lightsSafeAt(x, y);
  const listenerEmit = (l: Listener): void => listenerCb?.({ type: "pos", id: l.id, x: l.x, y: l.y, mode: l.mode });
  const listenerGoTo = (l: Listener, speed: number, now: number, dt: number): void => {
    if (!l.path.length || now - l.pathAt > 700) {
      l.path = findPathIn(sectorL, l.x, l.y, l.tx, l.ty, listenerShuns, true, undefined, true);
      l.pathAt = now;
    }
    moveAlongIn(sectorL, l as unknown as EntBrain, speed, dt, listenerShuns, undefined, true);
  };
  /** A random walkable spot within `r` of (x,y), at least `away` from (ax,ay). */
  const listenerSpot = (x: number, y: number, r: number, ax = -1e9, ay = -1e9, away = 0): { x: number; y: number } | null => {
    const size = sectorL.size;
    for (let k = 0; k < 40; k++) {
      const cx = Math.floor(x + (Math.random() * 2 - 1) * r);
      const cy = Math.floor(y + (Math.random() * 2 - 1) * r);
      if (cx < 1 || cy < 1 || cx >= size - 1 || cy >= size - 1) continue;
      if (!cellWalkable(sectorL, cx, cy) || listenerShuns(cx, cy)) continue;
      if (Math.hypot(cx + 0.5 - ax, cy + 0.5 - ay) < away) continue;
      return { x: cx + 0.5, y: cy + 0.5 };
    }
    return null;
  };
  const wanderOn = (l: Listener, ax = -1e9, ay = -1e9, away = 0): void => {
    const sp = listenerSpot(l.x, l.y, 18, ax, ay, away) ?? listenerSpot(l.x, l.y, 30);
    l.mode = "wander";
    l.path = [];
    l.lingerUntil = 0;
    l.knowId = 0;
    if (sp) {
      l.tx = sp.x;
      l.ty = sp.y;
    }
  };
  /** Arrive somewhere far from every body and out of every line. */
  const spawnListener = (prey: BrSession[]): Listener | null => {
    if (!enabledL) return null;
    const size = sectorL.size;
    for (let k = 0; k < 400; k++) {
      const cx = randomInt(1, size - 1);
      const cy = randomInt(1, size - 1);
      if (!cellWalkable(sectorL, cx, cy) || listenerShuns(cx, cy) || whyNoCreature(sectorL, cx, cy)) continue;
      const x = cx + 0.5;
      const y = cy + 0.5;
      if (prey.some((q) => Math.hypot(q.x - x, q.y - y) < LISTENER_ARRIVE || lineWalkableIn(sectorL, q.x, q.y, x, y))) continue;
      const l: Listener = { id: listenerSeq++, x, y, mode: "wander", path: [], pathAt: 0, tx: x, ty: y, until: 0, lingerUntil: 0, knowId: 0, knowX: 0, knowY: 0 };
      wanderOn(l);
      listeners.push(l);
      return l;
    }
    return null;
  };
  /** A noise at (x,y) heard `range` cells (half through a wall). */
  const listenerHear = (x: number, y: number, range: number, from = 0): void => {
    if (!enabledL || range <= 0) return;
    const now = Date.now();
    for (const l of listeners) {
      if (l.mode === "still") continue; // it is whispering: your chance
      const listening = l.mode === "listen" && from !== 0 && from === l.knowId;
      const reach = (lineWalkableIn(sectorL, l.x, l.y, x, y) ? range : range / 2) * (listening ? 2 : 1);
      const d = Math.hypot(l.x - x, l.y - y);
      if (d > reach) continue;
      if (listenerShuns(Math.floor(x), Math.floor(y))) continue; // a noise from the Stair it cannot go to
      l.tx = x;
      l.ty = y;
      l.path = [];
      l.lingerUntil = 0;
      if (d <= LISTENER_LUNGE_RANGE) {
        l.mode = "lunge";
        l.until = now + LISTENER_LUNGE_MS;
      } else if (l.mode !== "lunge") l.mode = "search";
    }
  };
  const listenerTick = (): void => {
    if (!enabledL) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const prey = [...sessions.values()].filter((q) => q.level === 6 && !q.lostAt && !q.fly);
    // a touch is remembered only while you stay down here: out the Stair and
    // back inside 20s, the next touch was the killing one (Nov 2026)
    for (const id of touchedAt.keys()) if (sessions.get(id)?.level !== 6) touchedAt.delete(id);
    for (const id of spared.keys()) if (sessions.get(id)?.level !== 6) spared.delete(id);
    if (!prey.length) {
      // nobody down here: it goes back into the dark
      for (const l of listeners) listenerCb?.({ type: "gone", id: l.id });
      listeners = [];
      return;
    }
    const want = prey.length >= LISTENER_PAIR_AT ? 2 : 1;
    while (listeners.length < want) if (!spawnListener(prey)) break;
    while (listeners.length > want) {
      const l = listeners.pop()!;
      listenerCb?.({ type: "gone", id: l.id });
    }
    for (const l of listeners) {
      if (l.mode === "still") {
        if (now >= l.until) {
          l.mode = "listen";
          l.until = now + LISTENER_KNOW;
        }
        listenerEmit(l);
        continue;
      }
      if (l.mode === "listen") {
        // in the water you are heard just standing there (the ripples)
        const v = sessions.get(l.knowId);
        if (v && v.level === 6 && !v.lostAt && !v.fly && lightsWet(sectorL, Math.floor(v.x), Math.floor(v.y))) listenerHear(v.x, v.y, LISTEN.splash, v.userId);
      }
      if (l.mode === "listen") {
        if (now >= l.until) {
          spared.set(l.knowId, now + LISTENER_SECOND);
          wanderOn(l, l.knowX, l.knowY, 10);
        }
        listenerEmit(l);
        continue;
      }
      if (l.mode === "lunge") {
        listenerGoTo(l, LISTENER_LUNGE, now, dt);
        if (now >= l.until || Math.hypot(l.x - l.tx, l.y - l.ty) < 0.4) {
          l.mode = "search";
          l.lingerUntil = now + LISTENER_LINGER;
        }
      } else if (l.mode === "search") {
        if (!l.lingerUntil) {
          listenerGoTo(l, LISTENER_SEARCH, now, dt);
          if (Math.hypot(l.x - l.tx, l.y - l.ty) < 0.6) l.lingerUntil = now + LISTENER_LINGER;
        } else if (now >= l.lingerUntil) wanderOn(l);
      } else {
        if (!l.lingerUntil) {
          listenerGoTo(l, LISTENER_WANDER, now, dt);
          if (Math.hypot(l.x - l.tx, l.y - l.ty) < 0.6 || (!l.path.length && now - l.pathAt > 200)) l.lingerUntil = now + 1_000 + Math.random() * 2_500;
        } else if (now >= l.lingerUntil) wanderOn(l);
      }
      // THE TOUCH
      for (const q of prey) {
        if (Math.hypot(q.x - l.x, q.y - l.y) > LISTENER_TOUCH || lightsSafeAt(Math.floor(q.x), Math.floor(q.y))) continue;
        // never through a partition (Nov 2026 validation run)
        if (!lineWalkableIn(sectorL, l.x, l.y, q.x, q.y)) continue;
        if (immortals.has(q.userId)) continue;
        if (l.mode === "wander" && (spared.get(q.userId) ?? 0) > now) continue;
        const prev = touchedAt.get(q.userId) ?? 0;
        if (prev && now - prev < LISTENER_SECOND) {
          const { x, y } = q;
          // (the touch is wall-checked above, like the moths' bite)
          touchedAt.delete(q.userId);
          killPlayer(q, "the listener");
          hurtCb?.({ userId: q.userId, hp: 0, drop: 0, dead: true, cause: "the listener", x, y, level: 6 });
          listenerCb?.({ type: "kill", id: l.id, x, y, userId: q.userId });
          wanderOn(l, x, y, 10);
        } else {
          touchedAt.set(q.userId, now);
          l.mode = "still";
          l.until = now + LISTENER_PAUSE;
          l.path = [];
          l.knowId = q.userId;
          l.knowX = q.x;
          l.knowY = q.y;
          listenerCb?.({ type: "touch", id: l.id, x: l.x, y: l.y, userId: q.userId });
        }
        break;
      }
      filmed(6, sectorL, l.x, l.y);
      listenerEmit(l);
    }
  };

  // ---- THALASSOPHOBIA (Level 7): THE DIVING HELMET, THE SUBWAY STAIR -------
  // Josh, Oct 14 2026: "1. A 2. A 3. Sure". BACKROOMS.md → "LEVEL 7 —
  // THALASSOPHOBIA".
  //
  //  · THE DIVING HELMET lies on ONE of the helmet spots the blocks drew —
  //    chosen by the plan (worldgen-ocean.ts, stamped on sector.ocean), on a
  //    dry roof far from the tower AND from the plaza. It is Level 7's key
  //    with every rule the key keeps (keyHolder[7], s.hasKey: carried out it
  //    goes home, dropped by a death it lies on the body), and worn it is A
  //    MINUTE OF AIR (HELMET_MS) where a breath is ten seconds.
  //  · UNLIKE EVERY OTHER KEY IT IS A TOOL, NOT A KEY: the dive needs it every
  //    time, so opening the subway does not use it up and it keeps lying
  //    there for the next diver.
  //  · THE SUBWAY STAIR is on the wall at the bottom of the sunken plaza, 24m
  //    down — on one breath you drown on the way. Worn to the stair, the
  //    helmet opens it: LEVEL8_FLAG, once, for everyone.
  //  · THE SERVER CAN'T SEE DEPTH (the wire is x, y and a head under the
  //    water), so a body at the stair must have been under for at least the
  //    time the dive takes at the fastest a body can swim down
  //    (subwayDiveMs): nobody surfaces at the plaza and touches the stair.
  let helmetHome: { x: number; y: number } | null = null;
  let subwayDoor: { x: number; y: number; side: number } | null = null;
  /** Metres a second a diver can go down at best (client: 1 m/s, a margin). */
  const DIVE_MAX_MPS = 1.6;
  const subwayDiveMs = (): number => {
    if (!subwayDoor) return 0;
    const i = Math.floor(subwayDoor.y) * sectorT.size + Math.floor(subwayDoor.x);
    return (((WATER_LEVEL - sectorT.floor[i]) * FLOOR_STEP) / DIVE_MAX_MPS) * 1000;
  };
  const placeOcean = (): void => {
    helmetHome = null;
    subwayDoor = null;
    keyHolder[7] = null;
    if (!enabledT) return;
    const o = sectorT.ocean;
    if (!o) return;
    if (o.helmet) helmetHome = { x: o.helmet.x + 0.5, y: o.helmet.y + 0.5 };
    if (o.subway) subwayDoor = { x: o.subway.x + 0.5, y: o.subway.y + 0.5, side: o.subway.side };
  };
  /** Is this cell in a room nothing hunts in (the tower)? */
  const oceanSafeAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= sectorT.size || y >= sectorT.size) return false;
    const i = y * sectorT.size + x;
    if (sectorT.solid[i]) return false;
    const t = sectorT.districts[sectorT.district[i]]?.type as string | undefined;
    return !!t && (OCEAN_SAFE_TYPES as readonly string[]).includes(t);
  };
  /** Water no breath gets down to the bottom of: the Drop's deep. */
  const oceanTooDeep = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= sectorT.size || y >= sectorT.size) return false;
    const i = y * sectorT.size + x;
    return oceanWet(sectorT, x, y) && sectorT.floor[i] < PLAZA_FLOOR;
  };
  /** Has this body been under long enough to be at the stair, 24m down? */
  const atSubwayDepth = (q: BrSession): boolean => q.subSince !== null && Date.now() - q.subSince >= subwayDiveMs();
  placeOcean();

  // ---- THE THING BELOW (Josh, Oct 14 2026: "2. A") — Thalassophobia's ----
  // BACKROOMS.md → "LEVEL 7 — THALASSOPHOBIA → THE CREATURE". Something
  // enormous lives in the deep. It is never seen whole: what you see is the
  // water noticing you.
  //
  //  · EXPOSURE, per swimmer, 0..1: it climbs while you are in its water and
  //    falls when you are not. The Drop (the open deep past the city's edge)
  //    is its home and fills you in DEEP.drop's ~25 s; the sunken plaza is
  //    deep enough to be noticed in DEEP.plaza's ~80 s — one helmet dive is
  //    48 s, so a quiet dive makes it and a second loiter doesn't; the
  //    streets never fill on their own. SPLASHING (swimming fast, anywhere in
  //    the water) adds DEEP.splash on top.
  //  · THE WARNINGS, which are the rules on screen: at DEEP_STAGES[0] the
  //    shadow passes under you, at [1] it circles (the water hums), at [2] it
  //    RISES — DEEP_RISE_MS of the water going dark under you. Out of the
  //    water when it arrives and it has nothing to take: it sinks away and
  //    your exposure falls back. Still in it: "the thing below".
  //  · ROOFS ARE SAFE, and so is the tower; so would a boat be. A flyer is
  //    never noticed. Only the swimmer it rose on dies.
  const DEEP = {
    drop: Number(process.env.BACKROOMS_DEEP_DROP ?? 0.04),
    plaza: Number(process.env.BACKROOMS_DEEP_PLAZA ?? 0.0125),
    splash: Number(process.env.BACKROOMS_DEEP_SPLASH ?? 0.03),
    /** Falling, a second: out of the water, and swimming quietly in a street. */
    dry: 0.12,
    street: 0.02,
  };
  /** Exposure at which it notices · circles · rises. */
  const DEEP_STAGES = [0.35, 0.7, 1] as const;
  const DEEP_RISE_MS = Number(process.env.BACKROOMS_DEEP_RISE_MS ?? 2_500);
  /** Where a swimmer's exposure falls back to when it rose on them and missed. */
  const DEEP_MISSED = 0.5;
  /** A swimmer faster than this is SPLASHING (cells a second). Measured off
   *  the client's own speeds: a swim is 1.03 and a sprinting swim 1.43
   *  (controller WALK/SPRINT × the swim scale 0.5); wading, a walk is 1.13
   *  and a sprint 1.57. So: a sprint splashes, nothing slower does. */
  const DEEP_SPLASH_SPEED = 1.25;
  const DEEP_TICK_MS = 250;
  interface DeepWatch {
    exposure: number;
    stage: number;
    risingUntil: number;
    lx: number;
    ly: number;
    lt: number;
    /** A refreshed client lost the warning it was showing: say it again. */
    resend?: boolean;
  }
  const deepWatch = new Map<number, DeepWatch>();
  let deepCb: ((ev: DeepEvent) => void) | null = null;
  const deepStageOf = (e: number): number => (e >= DEEP_STAGES[2] ? 3 : e >= DEEP_STAGES[1] ? 2 : e >= DEEP_STAGES[0] ? 1 : 0);
  /** What water this is to it: its home (the Drop), the plaza, a street, or none. */
  const deepWater = (x: number, y: number): "drop" | "plaza" | "street" | null => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (!oceanWet(sectorT, cx, cy)) return null;
    const t = oceanTypeAt(sectorT, cx, cy);
    if (t === "seadrop" || sectorT.section?.[cy * sectorT.size + cx] === ZONE_DROP) return "drop";
    if (t === "seaplaza") return "plaza";
    return "street";
  };
  const deepTick = (): void => {
    if (!enabledT) return;
    const now = Date.now();
    for (const id of [...deepWatch.keys()]) {
      const q = sessions.get(id);
      if (!q || q.level !== 7) deepWatch.delete(id);
    }
    for (const q of sessions.values()) {
      if (q.level !== 7 || q.lostAt) continue;
      let w = deepWatch.get(q.userId);
      if (!w) {
        w = { exposure: 0, stage: 0, risingUntil: 0, lx: q.x, ly: q.y, lt: now };
        deepWatch.set(q.userId, w);
      }
      const dt = Math.min(1, (now - w.lt) / 1000);
      // A splash is read over the last SECOND of move frames (Nov 2026
      // polish round): one 250 ms tick holds two or three of the client's
      // ~104-117 ms frames, so a quiet 1.03 swim read 1.25-1.4 on the ticks
      // that caught three and the plaza called it in ~41 s, not 80. With no
      // frame lately the body has stopped (or was moved by the server), and
      // the tick's own distance stands in.
      const gaitFresh = now - gaitLastAt(q.gait) <= 350;
      const speed = gaitFresh ? gaitSpeed(q.gait!, GAIT_SWIM_MS) : dt > 0 ? Math.hypot(q.x - w.lx, q.y - w.ly) / dt : 0;
      w.lx = q.x;
      w.ly = q.y;
      w.lt = now;
      if (w.resend) {
        w.resend = false;
        if (w.stage > 0) deepCb?.({ type: "stage", userId: q.userId, stage: w.stage, x: q.x, y: q.y });
      }
      const water = q.fly || q.boatId !== null ? null : deepWater(q.x, q.y);
      // RISING: it is already on its way up
      if (w.risingUntil) {
        if (now < w.risingUntil) continue;
        w.risingUntil = 0;
        // (an immortal playtester is risen on and spared, like every creature's)
        if (water && !immortals.has(q.userId)) {
          const { x, y } = q;
          deepWatch.delete(q.userId);
          killPlayer(q, "the thing below");
          hurtCb?.({ userId: q.userId, hp: 0, drop: 0, dead: true, cause: "the thing below", x, y, level: 7 });
          deepCb?.({ type: "strike", userId: q.userId, x, y });
          continue;
        }
        // out of the water in time: it sinks away with nothing
        // The client is told calm, so the watch IS calm (Nov 2026 validation
        // run: it kept stage 1, so going back in skipped the shadow and a
        // second "it sinks away" fired as the exposure fell). The exposure
        // stays at DEEP_MISSED, so a return still comes round fast.
        w.exposure = DEEP_MISSED;
        w.stage = 0;
        deepCb?.({ type: "calm", userId: q.userId, x: q.x, y: q.y });
        continue;
      }
      let rate = water === "drop" ? DEEP.drop : water === "plaza" ? DEEP.plaza : water === "street" ? -DEEP.street : -DEEP.dry;
      if (water && speed > DEEP_SPLASH_SPEED) rate = Math.max(0, rate) + DEEP.splash;
      w.exposure = Math.max(0, Math.min(1, w.exposure + rate * dt));
      const stage = deepStageOf(w.exposure);
      if (stage === w.stage) continue;
      // a stage is only ever climbed into, never fallen up into: after a miss
      // the exposure sits above the shadow's line while it drains away
      if (stage > w.stage && rate <= 0) continue;
      const rose = stage > w.stage;
      w.stage = stage;
      if (stage === 3) {
        w.risingUntil = now + DEEP_RISE_MS;
        filmed(7, sectorT, q.x, q.y);
      }
      if (rose || stage > 0) deepCb?.({ type: "stage", userId: q.userId, stage, x: q.x, y: q.y });
      else deepCb?.({ type: "calm", userId: q.userId, x: q.x, y: q.y });
    }
  };
  const deepTimer = setInterval(() => {
    heartbeat("backroomsDeep", DEEP_TICK_MS * 40);
    try {
      deepTick();
    } catch (e) {
      beatFailed(store, "backroomsDeep", e);
    }
  }, DEEP_TICK_MS);
  deepTimer.unref?.();

  // ---- THE CAVE SYSTEM (Level 8): THE CLIMBING ROPE, THE CHIMNEY ----------
  // Josh, Oct 15 2026: "1. A 2. A 3. A". BACKROOMS.md → "LEVEL 8 — THE CAVE
  // SYSTEM".
  //
  //  · THE CLIMBING ROPE lies on ONE of the rope spots the Caverns drew —
  //    chosen by the plan (worldgen-cave.ts, stamped on sector.cave), deep in
  //    the Caverns. It is Level 8's key with every rule the key keeps
  //    (keyHolder[8], s.hasKey: carried out it goes home, dropped by a death
  //    it lies on the body, looted off it). It is too bulky to sprint with
  //    (the client's controller; the harness sweeps for it).
  //  · THE CHIMNEY, at the far end of the Deep, takes it: fixed at the
  //    Chimney's foot it opens the climb, LEVEL9_FLAG, once, for everyone.
  //    The rope stays in the Chimney.
  let ropeHome: { x: number; y: number } | null = null;
  let chimneyFoot: { x: number; y: number; side: number } | null = null;
  const placeCave = (): void => {
    ropeHome = null;
    chimneyFoot = null;
    keyHolder[8] = null;
    if (!enabledC) return;
    const c = sectorC.cave;
    if (!c) return;
    if (c.rope) ropeHome = { x: c.rope.x + 0.5, y: c.rope.y + 0.5 };
    if (c.chimney) chimneyFoot = { x: c.chimney.x + 0.5, y: c.chimney.y + 0.5, side: c.chimney.side };
  };
  /** Is this cell in a room nothing hunts in (the Subway Stair)? */
  const caveSafeAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= sectorC.size || y >= sectorC.size) return false;
    const i = y * sectorC.size + x;
    if (sectorC.solid[i]) return false;
    const t = sectorC.districts[sectorC.district[i]]?.type as string | undefined;
    return !!t && (CAVE_SAFE_TYPES as readonly string[]).includes(t);
  };
  placeCave();

  // ---- THE BURROWER (Josh, Oct 15 2026: "3. A") — the Cave System's -------
  // BACKROOMS.md → "LEVEL 8 — THE CAVE SYSTEM → THE CREATURE". Long, pale,
  // eyeless. It lives in the rock round the Deep's narrow passages and
  // crawlspaces and comes out into nothing else:
  //
  //  · ITS GROUND IS THE PASSAGES AND THE CRAWLSPACES (BURROW_TYPES) and
  //    nothing else. It never sets foot in an open cavern, a hollow, the
  //    Station — so GETTING OUT INTO THE OPEN IS SAFETY, and a body in the
  //    open is never hunted or touched, however close.
  //  · IT HEARS, it does not see. In its ground: crawling through a
  //    crawlspace is heard (HEAR.crawl), a walk in a passage further, a
  //    sprint further still, a crouch-walk in a passage barely (HEAR.creep),
  //    a voice far; standing still and silent, nothing. Rock between halves
  //    a range.
  //  · HUNTING, it goes where it last heard you: faster than a crawl in a
  //    crawlspace (BURROW_CRAWL), faster than a walk in a passage
  //    (BURROW_PASSAGE) — slower than a sprint, and you can't sprint with the
  //    rope.
  //  · STILL AND SILENT LOSES IT: it takes only a body it has heard inside
  //    BURROW_QUIET. Reach somebody who has gone still and quiet and it
  //    lingers over them, then forgets them (BURROW_LOSE) and leaves — and
  //    spares them a while after.
  //  · IT CLICKS IN THE ROCK: the client clicks from every Burrower's
  //    position and mode (pos frames) — the clicking is the warning.
  //  · It burrows through rock between passages: with nobody in its own
  //    stretch of passages it surfaces in another, near somebody, far enough
  //    off not to be on them and out of every line.
  //  · Never after a flyer or the dead; an empty level puts them back in the
  //    rock.
  const HEAR = {
    crawl: Number(process.env.BACKROOMS_BURROW_HEAR_CRAWL ?? 5),
    creep: 2,
    walk: Number(process.env.BACKROOMS_BURROW_HEAR_WALK ?? 6),
    run: Number(process.env.BACKROOMS_BURROW_HEAR_RUN ?? 10),
    voice: Number(process.env.BACKROOMS_BURROW_HEAR_VOICE ?? 9),
    drop: 5,
  };
  const BURROW_ROAM = 0.8;
  const BURROW_CRAWL = Number(process.env.BACKROOMS_BURROW_CRAWL ?? 1.5);
  const BURROW_PASSAGE = Number(process.env.BACKROOMS_BURROW_PASSAGE ?? 2.45);
  const BURROW_TOUCH = 0.75;
  /** How close it comes to a body that has gone quiet (past its own bite
   *  reach, so lingering over somebody never bites them). */
  const BURROW_KEEP = 0.9;
  /** ITS BITE (Josh, Oct 16 2026: "the creature should damage you then kill
   *  you"): the first bite takes BURROW_BITE_HP and leaves you standing; the
   *  second, inside the same hunt, kills. Between them it pulls back a moment
   *  (BURROW_RECOIL) — the one chance to get out into the open. */
  const BURROW_BITE_HP = Number(process.env.BACKROOMS_BURROW_BITE_HP ?? 55);
  const BURROW_BITE_MS = 1_400;
  const BURROW_RECOIL = 900;
  /** Heard inside this long ago: it takes you. Longer: you've gone quiet. */
  const BURROW_QUIET = Number(process.env.BACKROOMS_BURROW_QUIET_MS ?? 2_000);
  /** Nothing heard for this long while hunting: it forgets you. */
  const BURROW_LOSE = Number(process.env.BACKROOMS_BURROW_LOSE_MS ?? 6_000);
  /** After it forgets you, it won't touch you this long. */
  const BURROW_SPARE = 20_000;
  /** Arrives at least this far from every body (and out of every line). */
  const BURROW_ARRIVE = 14;
  /** One per this many bodies on the level, at least one, at most three. */
  const BURROW_PER = 5;
  type BurrowMode = "roam" | "hunt" | "linger";
  interface Burrower {
    id: number;
    x: number;
    y: number;
    mode: BurrowMode;
    path: [number, number][];
    pathAt: number;
    tx: number;
    ty: number;
    /** Whom it last heard, when, and where. */
    heardId: number;
    heardAt: number;
    /** linger / roam pause ends */
    until: number;
    /** No bite before this (the gap between bites, and the recoil). */
    biteAt?: number;
  }
  let burrowers: Burrower[] = [];
  let burrowSeq = 1;
  let burrowerCb: ((ev: BurrowerEvent) => void) | null = null;
  /** Players a Burrower forgot: until this, it never touches them. */
  const burrowSpared = new Map<number, number>();
  /** When each body was last bitten: a bite inside BURROW_HUNT_MEMORY of the
   *  last is the second one, the one that kills. */
  const burrowBitten = new Map<number, number>();
  const BURROW_HUNT_MEMORY = 30_000;
  /** Its ground is the passages and crawlspaces; everything else it shuns. */
  const burrowShuns = (x: number, y: number): boolean => !caveBurrow(sectorC, x, y) || isPitCell(sectorC, x, y);
  const inBurrow = (x: number, y: number): boolean => caveBurrow(sectorC, Math.floor(x), Math.floor(y));
  const burrowEmit = (b: Burrower): void => burrowerCb?.({ type: "pos", id: b.id, x: b.x, y: b.y, mode: b.mode });
  const burrowGoTo = (b: Burrower, speed: number, now: number, dt: number): void => {
    if (!b.path.length || now - b.pathAt > 600) {
      b.path = findPathIn(sectorC, b.x, b.y, b.tx, b.ty, burrowShuns, true, undefined, true);
      b.pathAt = now;
    }
    moveAlongIn(sectorC, b as unknown as EntBrain, speed, dt, burrowShuns, undefined, true);
  };
  /** A random spot of its ground within `r` of (x,y). */
  const burrowSpot = (x: number, y: number, r: number): { x: number; y: number } | null => {
    const size = sectorC.size;
    for (let k = 0; k < 60; k++) {
      const cx = Math.floor(x + (Math.random() * 2 - 1) * r);
      const cy = Math.floor(y + (Math.random() * 2 - 1) * r);
      if (cx < 1 || cy < 1 || cx >= size - 1 || cy >= size - 1) continue;
      if (!cellWalkable(sectorC, cx, cy) || burrowShuns(cx, cy)) continue;
      return { x: cx + 0.5, y: cy + 0.5 };
    }
    return null;
  };
  const roamOn = (b: Burrower): void => {
    const sp = burrowSpot(b.x, b.y, 14) ?? burrowSpot(b.x, b.y, 30);
    b.mode = "roam";
    b.path = [];
    b.until = 0;
    b.heardId = 0;
    if (sp) {
      b.tx = sp.x;
      b.ty = sp.y;
    }
  };
  /** Surface somewhere in its ground: near somebody in the Deep if anybody
   *  is, but never on them and never in a line to them. */
  const burrowSurface = (b: Burrower | null, prey: BrSession[]): Burrower | null => {
    if (!enabledC) return null;
    const size = sectorC.size;
    const near = prey.filter((q) => inBurrow(q.x, q.y) || sectorC.section?.[Math.floor(q.y) * size + Math.floor(q.x)] === 3);
    for (let k = 0; k < 500; k++) {
      let cx: number;
      let cy: number;
      if (near.length && k < 350) {
        const q = near[randomInt(0, near.length)];
        cx = Math.floor(q.x + (Math.random() * 2 - 1) * 26);
        cy = Math.floor(q.y + (Math.random() * 2 - 1) * 26);
      } else {
        cx = randomInt(1, size - 1);
        cy = randomInt(1, size - 1);
      }
      if (cx < 1 || cy < 1 || cx >= size - 1 || cy >= size - 1) continue;
      if (!cellWalkable(sectorC, cx, cy) || burrowShuns(cx, cy) || whyNoCreature(sectorC, cx, cy)) continue;
      const x = cx + 0.5;
      const y = cy + 0.5;
      if (prey.some((q) => Math.hypot(q.x - x, q.y - y) < BURROW_ARRIVE || lineWalkableIn(sectorC, q.x, q.y, x, y))) continue;
      if (b) {
        b.x = x;
        b.y = y;
        roamOn(b);
        return b;
      }
      const nb: Burrower = { id: burrowSeq++, x, y, mode: "roam", path: [], pathAt: 0, tx: x, ty: y, heardId: 0, heardAt: 0, until: 0 };
      roamOn(nb);
      burrowers.push(nb);
      return nb;
    }
    return null;
  };
  /** A noise at (x,y), heard `range` cells (half through rock) — only from
   *  its own ground: a body in the open makes no noise it can follow. */
  const burrowHear = (x: number, y: number, range: number, from = 0): void => {
    if (!enabledC || range <= 0 || !inBurrow(x, y)) return;
    const now = Date.now();
    for (const b of burrowers) {
      const reach = lineWalkableIn(sectorC, b.x, b.y, x, y) ? range : range / 2;
      if (Math.hypot(b.x - x, b.y - y) > reach) continue;
      b.mode = "hunt";
      b.tx = x;
      b.ty = y;
      b.path = [];
      b.heardId = from;
      b.heardAt = now;
      b.until = 0;
    }
  };
  const burrowerTick = (): void => {
    if (!enabledC) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const prey = [...sessions.values()].filter((q) => q.level === 8 && !q.lostAt && !q.fly);
    if (!prey.length) {
      for (const b of burrowers) burrowerCb?.({ type: "gone", id: b.id });
      burrowers = [];
      return;
    }
    const want = Math.min(3, Math.max(1, Math.ceil(prey.length / BURROW_PER)));
    while (burrowers.length < want) if (!burrowSurface(null, prey)) break;
    while (burrowers.length > want) {
      const b = burrowers.pop()!;
      burrowerCb?.({ type: "gone", id: b.id });
    }
    for (const b of burrowers) {
      const recoiling = (b.biteAt ?? 0) - (BURROW_BITE_MS - BURROW_RECOIL) > now;
      if (b.mode === "hunt" && recoiling) {
        // it pulls back after a bite, and holds still a breath
      } else if (b.mode === "hunt") {
        if (now - b.heardAt > BURROW_LOSE) {
          // nothing for a long while: it has forgotten you
          if (b.heardId) burrowSpared.set(b.heardId, now + BURROW_SPARE);
          roamOn(b);
        } else {
          const speed = caveCrawl(sectorC, Math.floor(b.x), Math.floor(b.y)) ? BURROW_CRAWL : BURROW_PASSAGE;
          // Gone quiet, it stops a body's width short of the one it heard
          // (Nov 2026 polish round): the noise it walks to IS where they
          // stood, so it used to lie down inside a silent survivor. While the
          // noise is fresh it still closes in to bite.
          const quiet = now - b.heardAt > BURROW_QUIET;
          const v = quiet && b.heardId ? sessions.get(b.heardId) : undefined;
          const beside = !!v && v.level === 8 && !v.lostAt && Math.hypot(b.x - v.x, b.y - v.y) <= BURROW_KEEP + speed * dt;
          if (Math.hypot(b.x - b.tx, b.y - b.ty) > 0.4 && !beside) burrowGoTo(b, speed, now, dt);
          else if (quiet) {
            // it is where it heard you, and it hears nothing: it waits
            b.mode = "linger";
            b.until = now + 2_500;
          }
        }
      } else if (b.mode === "linger") {
        if (now >= b.until) {
          if (b.heardId) burrowSpared.set(b.heardId, now + BURROW_SPARE);
          roamOn(b);
        }
      } else {
        if (!b.until) {
          burrowGoTo(b, BURROW_ROAM, now, dt);
          if (Math.hypot(b.x - b.tx, b.y - b.ty) < 0.6 || (!b.path.length && now - b.pathAt > 200)) b.until = now + 1_500 + Math.random() * 3_000;
        } else if (now >= b.until) {
          // nobody anywhere near its stretch of passage: it burrows on
          const close = prey.some((q) => Math.hypot(q.x - b.x, q.y - b.y) < 40);
          if (!close && Math.random() < 0.3) burrowSurface(b, prey);
          else roamOn(b);
        }
      }
      // THE BITE: only in its ground, only somebody it has just heard. The
      // first bite hurts; the next one kills.
      for (const q of prey) {
        if ((b.biteAt ?? 0) > now) break;
        if (Math.hypot(q.x - b.x, q.y - b.y) > BURROW_TOUCH || !inBurrow(q.x, q.y)) continue;
        if (immortals.has(q.userId)) continue;
        if ((burrowSpared.get(q.userId) ?? 0) > now) continue;
        // it takes only a body IT HEARD: a silent one beside the noisy one is
        // not bitten (Nov 2026 validation run). A voice reaches it with no
        // speaker (from 0), so then anyone in reach counts, as before.
        const fresh = b.mode === "hunt" && now - b.heardAt <= BURROW_QUIET && (!b.heardId || b.heardId === q.userId);
        if (!fresh) continue;
        const { x, y } = q;
        b.biteAt = now + BURROW_BITE_MS;
        // the FIRST bite of a hunt only hurts, whatever the hp (a body arriving
        // hurt from the sea died on it — Nov 2026 validation run)
        const firstBite = now - (burrowBitten.get(q.userId) ?? 0) > BURROW_HUNT_MEMORY;
        q.hp = firstBite ? Math.max(1, q.hp - BURROW_BITE_HP) : q.hp - BURROW_BITE_HP;
        burrowBitten.set(q.userId, now);
        if (q.hp <= 0) {
          killPlayer(q, "the burrower");
          hurtCb?.({ userId: q.userId, hp: 0, drop: 0, dead: true, cause: "the burrower", x, y, level: 8 });
          burrowerCb?.({ type: "kill", id: b.id, x, y, userId: q.userId });
          roamOn(b);
          b.until = now + 4_000; // it feeds
        } else {
          hurtCb?.({ userId: q.userId, hp: Math.ceil(q.hp), drop: 0, dead: false, cause: "burrower" });
          burrowerCb?.({ type: "bite", id: b.id, x, y, userId: q.userId });
          // it pulls back the way it came, a step, before it comes again
          const d = Math.hypot(b.x - x, b.y - y) || 1;
          const bx = b.x + ((b.x - x) / d) * 0.5;
          const by = b.y + ((b.y - y) / d) * 0.5;
          if (inBurrow(bx, by) && cellWalkable(sectorC, Math.floor(bx), Math.floor(by))) {
            b.x = bx;
            b.y = by;
          }
          b.path = [];
        }
        break;
      }
      filmed(8, sectorC, b.x, b.y);
      burrowEmit(b);
    }
  };

  // ---- THE SUBURBS (Level 9): THE HOUSE KEY, THE FRONT DOOR -----------------
  // Josh, Oct 30 2026: "Go with your picks". BACKROOMS.md → "LEVEL 9 — THE
  // SUBURBS". The last level, and the way out:
  //  · THE HOUSE KEY lies on ONE of the key spots the houses drew — chosen by
  //    the plan (worldgen-suburb.ts, stamped on sector.suburb), well into the
  //    neighbourhood and away from Number 9. Level 9's key, every key rule.
  //  · THE FRONT DOOR of Number 9 takes it: turned in the lock it opens
  //    LEVEL10_FLAG, once, for everyone. Walking through it ENDS THE DESCENT:
  //    exit() at the open front door banks the run and says you got out.
  let houseKeyHome: { x: number; y: number } | null = null;
  let frontDoorSite: { x: number; y: number; side: number } | null = null;
  /** Per cell, 1 inside a lit pool (worldgen-suburb.ts suburbLitMap). */
  let litU: Uint8Array = new Uint8Array(0);
  const placeSuburbs = (): void => {
    keyHolder[9] = null; // every other placer resets its key (Oct 2026 review)
    houseKeyHome = null;
    frontDoorSite = null;
    litU = new Uint8Array(sectorU.size * sectorU.size);
    if (!enabledU) return;
    const u = sectorU.suburb;
    litU = suburbLitMap(sectorU);
    if (!u) return;
    if (u.key) houseKeyHome = { x: u.key.x + 0.5, y: u.key.y + 0.5 };
    if (u.frontDoor) frontDoorSite = { x: u.frontDoor.x + 0.5, y: u.frontDoor.y + 0.5, side: u.frontDoor.side };
  };
  /** The manhole's cul-de-sac: nothing hunts there. */
  const suburbSafeAt = (x: number, y: number): boolean => suburbSafe(sectorU, x, y);
  placeSuburbs();

  // ---- THE NEIGHBORHOOD WATCH (Josh, Oct 30 2026) — the Suburbs' creature -----
  // BACKROOMS.md → "LEVEL 9 — THE SUBURBS → THE CREATURE". Tall, too thin, a
  // beige windbreaker, a smile and nothing else on its face.
  //
  //  · ITS GROUND IS THE DARK OUTDOORS: the roads, the sidewalks, the yards,
  //    the park. It never sets foot indoors, in the manhole's cul-de-sac, or in
  //    a pool of light (litU) — so the light is safety and a house is a hiding
  //    place. A flickering streetlight throws no pool: no light at all.
  //  · It SEES: a body outdoors in its line within WATCH_SIGHT and it hunts,
  //    faster than a walk, slower than a sprint. Touch is death.
  //  · A body in a pool is seen but out of reach: it stops at the light's edge
  //    and stands there WATCH_EDGE, then walks off and leaves them be.
  //  · Go indoors while it hunts you and it walks to the doorway nearest you,
  //    KNOCKS, and reaches in: within WATCH_REACH of it (through the open
  //    doorway — never through a wall) you are taken. It waits WATCH_DOOR,
  //    knocking now and then; step back out into the dark and it has you.
  //  · Out of sight WATCH_LOSE: it goes where it last saw you, looks, gives up.
  //  · It whistles while it walks: the client whistles from its frames.
  const WATCH_PATROL = Number(process.env.BACKROOMS_WATCH_PATROL ?? 1.0);
  const WATCH_HUNT = Number(process.env.BACKROOMS_WATCH_HUNT ?? 2.45);
  const WATCH_SIGHT = Number(process.env.BACKROOMS_WATCH_SIGHT ?? 16);
  const WATCH_TOUCH = 0.8;
  const WATCH_REACH = 1.6;
  const WATCH_LOSE = Number(process.env.BACKROOMS_WATCH_LOSE_MS ?? 5_000);
  const WATCH_EDGE = Number(process.env.BACKROOMS_WATCH_EDGE_MS ?? 20_000);
  const WATCH_DOOR = Number(process.env.BACKROOMS_WATCH_DOOR_MS ?? 15_000);
  /** The three knocks before it reaches in. */
  const WATCH_KNOCK = Number(process.env.BACKROOMS_WATCH_KNOCK_MS ?? 2_400);
  /** Knocks again this often while it waits at a door. */
  const WATCH_KNOCK_EVERY = 5_000;
  /** After it gives up on you, it leaves you be this long. */
  const WATCH_SPARE = Number(process.env.BACKROOMS_WATCH_SPARE_MS ?? 15_000);
  /** Arrives at least this far from every body (and out of every line). */
  const WATCH_ARRIVE = 18;
  /** One per this many bodies on the level, at least one, at most two. */
  const WATCH_PER = 6;
  /** At the light's edge it closes to about this far from you, and no closer. */
  const LIGHT_EDGE_GAP = 1.2;
  type WatchMode = "patrol" | "hunt" | "edge" | "door" | "search";
  interface Watcher {
    id: number;
    x: number;
    y: number;
    h: number;
    mode: WatchMode;
    path: [number, number][];
    pathAt: number;
    tx: number;
    ty: number;
    targetId: number;
    lastSeenAt: number;
    lastSeenX: number;
    lastSeenY: number;
    /** patrol pause / edge / search / door wait ends */
    until: number;
    /** door: when it arrived (the knocks run from here), the last knock */
    arrivedAt: number;
    knockAt: number;
  }
  let watchers: Watcher[] = [];
  let watchSeq = 1;
  let watchCb: ((ev: WatchEvent) => void) | null = null;
  /** Players the Watch gave up on: until this, it leaves them be. */
  const watchSpared = new Map<number, number>();
  const outdoorU = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < sectorU.size && cy < sectorU.size && sectorU.section?.[cy * sectorU.size + cx] === ZONE_OUT;
  const litAt = (cx: number, cy: number): boolean => litU[cy * sectorU.size + cx] === 1;
  /** Its ground is the dark outdoors; everything else it shuns. */
  const watchShuns = (cx: number, cy: number): boolean => !outdoorU(cx, cy) || litAt(cx, cy) || suburbSafeAt(cx, cy);
  /** Can it take this body here (outdoors, in the dark, not the cul-de-sac)? */
  const takeable = (q: BrSession): boolean => {
    const cx = Math.floor(q.x);
    const cy = Math.floor(q.y);
    return outdoorU(cx, cy) && !litAt(cx, cy) && !suburbSafeAt(cx, cy);
  };
  const watchEmit = (w: Watcher): void => watchCb?.({ type: "pos", id: w.id, x: w.x, y: w.y, h: w.h, mode: w.mode });
  const watchGoTo = (w: Watcher, speed: number, now: number, dt: number): void => {
    if (now - w.pathAt > 400 || !w.path.length) {
      w.path = findPathIn(sectorU, w.x, w.y, w.tx, w.ty, watchShuns, true, undefined, true);
      w.pathAt = now;
    }
    const ox = w.x;
    const oy = w.y;
    moveAlongIn(sectorU, w as unknown as EntBrain, speed, dt, watchShuns, undefined, true);
    if (Math.hypot(w.x - ox, w.y - oy) > 0.01) w.h = Math.atan2(w.x - ox, w.y - oy);
  };
  /** A random dark outdoor spot within r cells (streets preferred). */
  const watchSpot = (x: number, y: number, r: number): { x: number; y: number } | null => {
    const size = sectorU.size;
    for (let k = 0; k < 60; k++) {
      const cx = Math.floor(x + (Math.random() * 2 - 1) * r);
      const cy = Math.floor(y + (Math.random() * 2 - 1) * r);
      if (cx < 1 || cy < 1 || cx >= size - 1 || cy >= size - 1) continue;
      if (!cellWalkable(sectorU, cx, cy) || watchShuns(cx, cy)) continue;
      const t = sectorU.districts[sectorU.district[cy * size + cx]]?.type;
      if (t !== "road" && t !== "sidewalk" && Math.random() < 0.6) continue;
      return { x: cx + 0.5, y: cy + 0.5 };
    }
    return null;
  };
  const patrolOn = (w: Watcher): void => {
    const sp = watchSpot(w.x, w.y, 24) ?? watchSpot(w.x, w.y, 50);
    w.mode = "patrol";
    w.targetId = 0;
    w.until = 0;
    w.path = [];
    if (sp) {
      w.tx = sp.x;
      w.ty = sp.y;
    }
  };
  /** Somewhere it can stand, far from every body and out of every line. */
  const watchArrive = (prey: BrSession[]): Watcher | null => {
    if (!enabledU) return null;
    const size = sectorU.size;
    for (let k = 0; k < 400; k++) {
      const cx = 1 + Math.floor(Math.random() * (size - 2));
      const cy = 1 + Math.floor(Math.random() * (size - 2));
      if (!cellWalkable(sectorU, cx, cy) || watchShuns(cx, cy) || whyNoCreature(sectorU, cx, cy)) continue;
      const x = cx + 0.5;
      const y = cy + 0.5;
      if (prey.some((q) => Math.hypot(q.x - x, q.y - y) < WATCH_ARRIVE || lineWalkableIn(sectorU, q.x, q.y, x, y))) continue;
      const nw: Watcher = { id: watchSeq++, x, y, h: 0, mode: "patrol", path: [], pathAt: 0, tx: x, ty: y, targetId: 0, lastSeenAt: 0, lastSeenX: x, lastSeenY: y, until: 0, arrivedAt: 0, knockAt: 0 };
      patrolOn(nw);
      watchers.push(nw);
      return nw;
    }
    return null;
  };
  /** The outdoor cell at a house's doorway nearest (x,y): dark, walkable,
   *  with an indoor cell beside it and no wall between (the open door). */
  /** The doorway INTO THE HOUSE THE BODY IS IN: flood the indoor floor from
   *  the body (through open edges only) and take the nearest dark outdoor
   *  cell that opens onto it. It used to take the nearest outdoor cell beside
   *  ANY indoor cell within 7, through walls — the house next door's step
   *  was often nearer, so it knocked on the wrong house (Nov 2026). */
  const doorwayNear = (x: number, y: number): { x: number; y: number } | null => {
    const size = sectorU.size;
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    if (!suburbIndoor(sectorU, sx, sy)) return null;
    const open = (ax: number, ay: number, bx: number, by: number): boolean => {
      if (bx === ax + 1) return !sectorU.wallW[ay * size + bx];
      if (bx === ax - 1) return !sectorU.wallW[ay * size + ax];
      if (by === ay + 1) return !sectorU.wallN[by * size + ax];
      return !sectorU.wallN[ay * size + ax];
    };
    const seen = new Set<number>([sy * size + sx]);
    const q: [number, number][] = [[sx, sy]];
    let best: { x: number; y: number; d: number } | null = null;
    for (let k = 0; k < q.length && k < 1500; k++) {
      const [cx, cy] = q[k];
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
        if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1 || !open(cx, cy, nx, ny)) continue;
        const ni = ny * size + nx;
        if (suburbIndoor(sectorU, nx, ny)) {
          if (!seen.has(ni) && cellWalkable(sectorU, nx, ny)) {
            seen.add(ni);
            q.push([nx, ny]);
          }
        } else if (cellWalkable(sectorU, nx, ny) && !watchShuns(nx, ny)) {
          const d = Math.hypot(nx + 0.5 - x, ny + 0.5 - y);
          if (!best || d < best.d) best = { x: nx + 0.5, y: ny + 0.5, d };
        }
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  };
  /** Can it see this body (outdoors, near enough, a clear line)? */
  const watchSees = (w: Watcher, q: BrSession): boolean => outdoorU(Math.floor(q.x), Math.floor(q.y)) && Math.hypot(q.x - w.x, q.y - w.y) <= WATCH_SIGHT && lineWalkableIn(sectorU, w.x, w.y, q.x, q.y);
  const watchTick = (): void => {
    if (!enabledU) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const prey = [...sessions.values()].filter((q) => q.level === 9 && !q.lostAt && !q.fly);
    if (!prey.length) {
      for (const w of watchers) watchCb?.({ type: "gone", id: w.id });
      watchers = [];
      return;
    }
    const want = Math.min(2, Math.max(1, Math.ceil(prey.length / WATCH_PER)));
    while (watchers.length < want) if (!watchArrive(prey)) break;
    while (watchers.length > want) {
      const w = watchers.pop()!;
      watchCb?.({ type: "gone", id: w.id });
    }
    const spared = (q: BrSession): boolean => (watchSpared.get(q.userId) ?? 0) > now;
    const giveUp = (w: Watcher): void => {
      if (w.targetId) watchSpared.set(w.targetId, now + WATCH_SPARE);
      patrolOn(w);
    };
    for (const w of watchers) {
      // who it can see: a body outdoors (not in the cul-de-sac), in its line
      let seen: BrSession | null = null;
      let seenD = Infinity;
      for (const q of prey) {
        if (spared(q) || suburbSafeAt(Math.floor(q.x), Math.floor(q.y)) || !watchSees(w, q)) continue;
        const d = Math.hypot(q.x - w.x, q.y - w.y);
        if (d >= seenD) continue;
        seen = q;
        seenD = d;
      }
      if ((w.mode === "patrol" || w.mode === "search") && seen) {
        w.mode = "hunt";
        w.targetId = seen.userId;
        w.lastSeenAt = now;
        w.lastSeenX = seen.x;
        w.lastSeenY = seen.y;
        w.path = [];
      }
      const target = w.targetId ? prey.find((q) => q.userId === w.targetId) ?? null : null;
      if (w.mode === "hunt" || w.mode === "edge") {
        if (!target || spared(target) || suburbSafeAt(Math.floor(target.x), Math.floor(target.y))) giveUp(w);
        else {
          const tcx = Math.floor(target.x);
          const tcy = Math.floor(target.y);
          const inSight = watchSees(w, target);
          if (inSight) {
            w.lastSeenAt = now;
            w.lastSeenX = target.x;
            w.lastSeenY = target.y;
          }
          if (!outdoorU(tcx, tcy)) {
            // indoors (it saw you go in): to the door, to knock
            const dw = now - w.lastSeenAt <= WATCH_LOSE ? doorwayNear(target.x, target.y) : null;
            if (dw) {
              w.mode = "door";
              w.tx = dw.x;
              w.ty = dw.y;
              w.path = [];
              w.arrivedAt = 0;
              w.knockAt = 0;
              w.until = now + 30_000; // it gives up the walk if the door can't be reached
            } else giveUp(w);
          } else if (!inSight) {
            if (now - w.lastSeenAt > WATCH_LOSE) giveUp(w);
            else {
              w.mode = "hunt";
              w.tx = w.lastSeenX;
              w.ty = w.lastSeenY;
              if (Math.hypot(w.x - w.tx, w.y - w.ty) > 0.5) watchGoTo(w, WATCH_HUNT, now, dt);
              else {
                // where it last saw you, and nothing: it looks about
                w.mode = "search";
                w.until = now + 4_000;
              }
            }
          } else if (litAt(tcx, tcy)) {
            // in the light: seen, not reached — it stands at the edge
            if (w.mode !== "edge") {
              w.mode = "edge";
              w.until = now + WATCH_EDGE;
            }
            w.tx = target.x;
            w.ty = target.y;
            if (Math.hypot(w.x - target.x, w.y - target.y) > LIGHT_EDGE_GAP) watchGoTo(w, WATCH_PATROL, now, dt);
            w.h = Math.atan2(target.x - w.x, target.y - w.y);
            if (now >= w.until) giveUp(w);
          } else {
            w.mode = "hunt";
            w.tx = target.x;
            w.ty = target.y;
            watchGoTo(w, WATCH_HUNT, now, dt);
          }
        }
      } else if (w.mode === "door") {
        const outBack = !!target && takeable(target) && watchSees(w, target);
        if (outBack) {
          // stepped back out into the dark: it has you again
          w.mode = "hunt";
          w.path = [];
        } else if (!target || now >= w.until) giveUp(w);
        else if (!w.arrivedAt) {
          if (Math.hypot(w.x - w.tx, w.y - w.ty) > 0.5) watchGoTo(w, WATCH_HUNT, now, dt);
          else {
            w.arrivedAt = now;
            w.knockAt = now;
            w.until = now + WATCH_KNOCK + WATCH_DOOR;
            watchCb?.({ type: "knock", id: w.id, x: w.x, y: w.y });
          }
        } else {
          w.h = Math.atan2(target.x - w.x, target.y - w.y);
          if (now - w.knockAt >= WATCH_KNOCK_EVERY) {
            w.knockAt = now;
            watchCb?.({ type: "knock", id: w.id, x: w.x, y: w.y });
          }
        }
      } else if (w.mode === "search") {
        if (now >= w.until) giveUp(w);
      } else {
        if (!w.until) {
          watchGoTo(w, WATCH_PATROL, now, dt);
          if (Math.hypot(w.x - w.tx, w.y - w.ty) < 0.6 || (!w.path.length && now - w.pathAt > 200)) w.until = now + 1_500 + Math.random() * 2_500;
        } else if (now >= w.until) patrolOn(w);
      }
      // THE TOUCH: outdoors in the dark, or — once it has knocked — reaching
      // in through the open doorway it stands at
      const reaching = w.mode === "door" && w.arrivedAt > 0 && now - w.arrivedAt >= WATCH_KNOCK;
      for (const q of prey) {
        if (immortals.has(q.userId) || spared(q)) continue;
        const d = Math.hypot(q.x - w.x, q.y - w.y);
        const outside = takeable(q) && d <= WATCH_TOUCH;
        const inside = reaching && suburbIndoor(sectorU, Math.floor(q.x), Math.floor(q.y)) && d <= WATCH_REACH && lineWalkableIn(sectorU, w.x, w.y, q.x, q.y);
        if (!outside && !inside) continue;
        const { x, y } = q;
        killPlayer(q, "the neighborhood watch");
        hurtCb?.({ userId: q.userId, hp: 0, drop: 0, dead: true, cause: "the neighborhood watch", x, y, level: 9 });
        watchCb?.({ type: "kill", id: w.id, x, y, userId: q.userId });
        patrolOn(w);
        w.until = now + 6_000; // it stands a moment
        break;
      }
      filmed(9, sectorU, w.x, w.y);
      watchEmit(w);
    }
  };
  // ---- THE BLEEDER (Josh, Oct 2026) — the Electrical Station's creature ----
  // BACKROOMS.md → "LEVEL 3 — ELECTRICAL STATION": "Pale white, tall, large
  // teeth, blood soaked, extremely fast, kill on contact. Hates the flashlight
  // and will run away after 1 second of being shined on." It lives in the
  // WIRING, and the dark is its element:
  //
  //  · It is only ever in a section with NO POWER — a cutoff someone pulled,
  //    or a rolling blackout. A few seconds after a section with people in it
  //    goes dark it comes out, out of sight, near one of them. It NEVER sets
  //    foot in a powered section: the light is a wall to it.
  //  · It hunts the dark, and the moment it has a clear line to someone it
  //    SCREAMS (it stands for the scream — that is your warning, and the
  //    beat that keeps the one-second burn winnable) and then charges faster
  //    than anyone can sprint. Touch is death.
  //  · A HELD flashlight beam staggers it, and after BLEEDER_BURN_MS of
  //    steady light it shrieks and flees back into the wiring for a while. A
  //    sweep does nothing: off the beam it cools three times as fast as it
  //    built (the stalker's rule).
  //  · The power coming back drives it out of that section the same way.
  //
  // THE ARITHMETIC THAT MAKES IT FAIR: it charges at 4.3 cells/s (a sprint is
  // 2.85), but under a beam it moves at a third of that — so a player who
  // gets the light on it holds it for one second while it gains about 1.4
  // cells. Spotted at the scream's range that is always enough; caught from
  // behind round a corner in the dark it is not, and that is the level.
  const BLEEDER_CHASE_SPEED = 4.3;
  /** Searching, it keeps just under a sprint: a runner can stay ahead of a
   *  HUNT, never of a charge. */
  const BLEEDER_HUNT_SPEED = 2.6;
  const BLEEDER_FLEE_SPEED = 5.2;
  const BLEEDER_BURN_SLOW = 0.33;
  const BLEEDER_BURN_MS = Number(process.env.BACKROOMS_BLEEDER_BURN_MS ?? 1_000);
  const BLEEDER_SCREAM_MS = Number(process.env.BACKROOMS_BLEEDER_SCREAM_MS ?? 800);
  /** How long after a section goes dark before it comes out. The dark itself
   *  is the warning; this is the breath you get to use it. */
  const BLEEDER_EMERGE_MIN = Number(process.env.BACKROOMS_BLEEDER_EMERGE_MIN_MS ?? 2_500);
  const BLEEDER_EMERGE_MAX = Number(process.env.BACKROOMS_BLEEDER_EMERGE_MAX_MS ?? 5_000);
  /** Driven off by the beam, it stays in the wiring this long. */
  const BLEEDER_REST_MS = Number(process.env.BACKROOMS_BLEEDER_REST_MS ?? 35_000);
  const BLEEDER_FEED_MS = 3_000;
  const BLEEDER_SIGHT = 22;
  const BLEEDER_KILL = 0.6;
  const BLEEDER_BEAM_RANGE = 16;

  type BleederMode = "hunt" | "scream" | "chase" | "feed" | "retreat";
  const bleeder = {
    live: false,
    mode: "hunt" as BleederMode,
    x: 0,
    y: 0,
    h: 0,
    targetId: 0,
    path: [] as [number, number][],
    pathAt: 0,
    /** Milliseconds of beam it has soaked up (decays off the beam). */
    burn: 0,
    burning: false,
    screamUntil: 0,
    feedUntil: 0,
    goneBy: 0,
    /** Not out of the wiring again before this. */
    restUntil: 0,
    /** When a dark section with people in it may give it up. */
    emergeAt: 0,
    /** An admin's playtest visit: the light rule is off for it. */
    summoned: false,
    /** When it last screamed. One scream per sighting: seen again soon
     *  after, it simply comes. */
    lastScreamAt: 0,
  };
  let bleederCb: ((ev: BleederEvent) => void) | null = null;

  /** Is this cell somewhere it may stand — dark, or its visit is summoned? */
  const bleederDarkAt = (x: number, y: number, now = Date.now()): boolean =>
    bleeder.summoned || !sectionPowered(sectionAt(x + 0.5, y + 0.5), now);
  /** Its refusals: a lethal shaft, and ANY lit cell. */
  const bleederShuns = (x: number, y: number): boolean => isPitCell(sectorS, x, y) || !bleederDarkAt(x, y);

  /** IS A FLASHLIGHT BEAM ON IT — the stalker's held-beam rule, for any
   *  creature on any level: an ACTIVE flashlight, within range, the body
   *  inside a ~23° cone of the player's facing, with a clear line. */
  const beamOn = (sec: Sector, cx: number, cy: number, prey: BrSession[]): boolean => {
    for (const q of prey) {
      if (q.fly || q.equip !== "flashlight!") continue;
      const dx = cx - q.x;
      const dy = cy - q.y;
      const d = Math.hypot(dx, dy);
      if (d > BLEEDER_BEAM_RANGE || d < 0.01) continue;
      const { fx, fy } = facingOf(q.heading);
      if ((dx / d) * fx + (dy / d) * fy < 0.92) continue;
      if (!lineWalkableIn(sec, q.x, q.y, cx, cy)) continue;
      return true;
    }
    return false;
  };

  const bleederGone = (now: number, rest: number): void => {
    bleeder.live = false;
    bleeder.path = [];
    bleeder.targetId = 0;
    bleeder.burn = 0;
    bleeder.burning = false;
    bleeder.summoned = false;
    bleeder.restUntil = now + rest;
    bleeder.emergeAt = 0;
    bleederCb?.({ type: "gone" });
  };

  /** Out of the wiring near the mark, AROUND A CORNER: a dark cell no player
   *  can see, from which it can walk to the mark without touching the light. */
  const bleederPlaceNear = (mark: BrSession, inside: BrSession[]): boolean => {
    for (let tries = 0; tries < 200; tries++) {
      const a = rng() * Math.PI * 2;
      const d = 7 + rng() * 11;
      const x = Math.floor(mark.x + Math.cos(a) * d);
      const y = Math.floor(mark.y + Math.sin(a) * d);
      if (x < 2 || y < 2 || x >= sectorS.size - 2 || y >= sectorS.size - 2) continue;
      if (whyNoCreature(sectorS, x, y, "walker") || bleederShuns(x, y)) continue;
      if (inside.some((q) => lineWalkableIn(sectorS, q.x, q.y, x + 0.5, y + 0.5))) continue;
      if (!findPathIn(sectorS, x + 0.5, y + 0.5, mark.x, mark.y, bleederShuns, false, undefined, true).length) continue;
      bleeder.x = x + 0.5;
      bleeder.y = y + 0.5;
      return true;
    }
    return false;
  };

  const bleederOut = (mark: BrSession, now: number): void => {
    bleeder.live = true;
    bleeder.mode = "hunt";
    bleeder.targetId = mark.userId;
    bleeder.path = [];
    bleeder.pathAt = 0;
    bleeder.burn = 0;
    bleeder.burning = false;
    bleeder.h = Math.atan2(mark.x - bleeder.x, mark.y - bleeder.y);
    void now;
  };

  /** Driven off (the beam, or the lights): it shrieks and runs for the dark. */
  const bleederRetreat = (now: number): void => {
    if (bleeder.mode === "retreat") return;
    bleeder.mode = "retreat";
    bleeder.path = [];
    bleeder.pathAt = 0;
    bleeder.goneBy = now + 6_000;
    bleederCb?.({ type: "retreat", x: bleeder.x, y: bleeder.y });
  };

  const bleederTick = (): void => {
    if (!enabledS) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const inside = [...sessions.values()].filter((q) => q.level === 3 && !q.fly && !q.lostAt);
    if (!inside.length) {
      if (bleeder.live) bleederGone(now, 0);
      bleeder.emergeAt = 0;
      return;
    }
    /** Who it can reach: a body in the dark (summoned: anyone). */
    const inDark = inside.filter((q) => bleederDarkAt(Math.floor(q.x), Math.floor(q.y), now));

    if (!bleeder.live) {
      if (now < bleeder.restUntil || !inDark.length) {
        if (!inDark.length) bleeder.emergeAt = 0;
        return;
      }
      // The dark came: give them a breath, then come out.
      if (!bleeder.emergeAt) {
        bleeder.emergeAt = now + BLEEDER_EMERGE_MIN + rng() * (BLEEDER_EMERGE_MAX - BLEEDER_EMERGE_MIN);
        return;
      }
      if (now < bleeder.emergeAt) return;
      const mark = inDark[Math.floor(rng() * inDark.length)];
      if (!bleederPlaceNear(mark, inside)) {
        bleeder.emergeAt = now + 1_500; // no dark corner to come round yet
        return;
      }
      bleederOut(mark, now);
    }

    const move = (speed: number, fleeing = false): void => {
      const before = { x: bleeder.x, y: bleeder.y };
      // FLEEING, the light is not a wall: it is what it runs from, and a route
      // planned through lit cells refused by the step backstop left it frozen
      // in the light, running in place, until it timed out (Oct 2026 audit).
      moveAlongIn(sectorS, bleeder as unknown as EntBrain, speed, dt, fleeing ? (x, y) => isPitCell(sectorS, x, y) : bleederShuns, undefined, true);
      const mx = bleeder.x - before.x;
      const my = bleeder.y - before.y;
      if (Math.hypot(mx, my) > 0.001) bleeder.h = Math.atan2(mx, my);
    };

    // THE BEAM: built while it is on it, cooling three times as fast off it.
    const lit = bleeder.mode !== "retreat" && beamOn(sectorS, bleeder.x, bleeder.y, inside);
    bleeder.burning = lit;
    bleeder.burn = lit ? bleeder.burn + ENT_TICK_MS : Math.max(0, bleeder.burn - ENT_TICK_MS * 3);
    if (bleeder.burn >= BLEEDER_BURN_MS) {
      bleeder.burn = 0;
      bleeder.burning = false;
      bleederRetreat(now);
    }
    // THE LIGHT: power back on under its feet drives it out the same way.
    if (bleeder.mode !== "retreat" && !bleederDarkAt(Math.floor(bleeder.x), Math.floor(bleeder.y), now)) bleederRetreat(now);

    if (bleeder.mode === "retreat") {
      if (!bleeder.path.length || now - bleeder.pathAt > 1_500) {
        let near: BrSession | null = null;
        for (const q of inside) if (!near || Math.hypot(q.x - bleeder.x, q.y - bleeder.y) < Math.hypot(near.x - bleeder.x, near.y - bleeder.y)) near = q;
        const away = near ? Math.atan2(bleeder.y - near.y, bleeder.x - near.x) : rng() * Math.PI * 2;
        for (const [turn, reach] of [[0, 18], [0.9, 14], [-0.9, 14], [0, 8]] as [number, number][]) {
          const spot = walkableNearIn(sectorS, bleeder.x + Math.cos(away + turn) * reach, bleeder.y + Math.sin(away + turn) * reach, 8);
          if (!spot) continue;
          bleeder.path = findPathIn(sectorS, bleeder.x, bleeder.y, spot[0] + 0.5, spot[1] + 0.5, (x, y) => isPitCell(sectorS, x, y), true, undefined, true);
          if (bleeder.path.length) break;
        }
        bleeder.pathAt = now;
      }
      move(BLEEDER_FLEE_SPEED, true);
      const watched = inside.some((q) => Math.hypot(q.x - bleeder.x, q.y - bleeder.y) <= 26 && lineWalkableIn(sectorS, q.x, q.y, bleeder.x, bleeder.y));
      if (!watched || now >= bleeder.goneBy) {
        bleederGone(now, BLEEDER_REST_MS);
        return;
      }
    } else if (bleeder.mode === "feed") {
      if (now >= bleeder.feedUntil) {
        bleeder.mode = "hunt";
        bleeder.path = [];
      }
    } else {
      // Its mark: the target if still in reach, else the nearest body in the dark.
      let mark = sessions.get(bleeder.targetId) ?? null;
      if (!mark || mark.level !== 3 || mark.fly || mark.lostAt || !bleederDarkAt(Math.floor(mark.x), Math.floor(mark.y), now)) {
        mark = inDark.length
          ? inDark.reduce((a, b) => (Math.hypot(a.x - bleeder.x, a.y - bleeder.y) <= Math.hypot(b.x - bleeder.x, b.y - bleeder.y) ? a : b))
          : null;
        if (mark?.userId !== bleeder.targetId && bleeder.mode !== "hunt") {
          bleeder.mode = "hunt";
          bleeder.path = [];
        }
        bleeder.targetId = mark?.userId ?? 0;
      }
      if (!mark) {
        // Everyone is in the light. It waits in the dark for them.
        bleeder.path = [];
        if (bleeder.mode !== "hunt") bleeder.mode = "hunt";
      } else {
        const gap = Math.hypot(mark.x - bleeder.x, mark.y - bleeder.y);
        // It "sees" you only across the dark: a line through lit cells is a
        // line it cannot charge down, and treating it as a sighting made it
        // scream, fail to charge, fall back to hunting and scream again —
        // over and over, never moving (Oct 2026 audit).
        const sees = gap <= BLEEDER_SIGHT && lineWalkableIn(sectorS, bleeder.x, bleeder.y, mark.x, mark.y) && !crossesShunned(bleeder.x, bleeder.y, mark.x, mark.y, bleederShuns);
        if (bleeder.mode === "hunt") {
          if (sees && now - bleeder.lastScreamAt < 8_000) {
            // it has already screamed at you — it just comes
            bleeder.mode = "chase";
            bleeder.path = [];
            bleeder.pathAt = 0;
          } else if (sees) {
            bleeder.lastScreamAt = now;
            // IT HAS SEEN YOU. It stands and screams — that is the warning.
            bleeder.mode = "scream";
            bleeder.screamUntil = now + BLEEDER_SCREAM_MS;
            bleeder.path = [];
            bleeder.h = Math.atan2(mark.x - bleeder.x, mark.y - bleeder.y);
            bleederCb?.({ type: "scream", x: bleeder.x, y: bleeder.y, targetId: mark.userId });
          } else {
            if (!bleeder.path.length || now - bleeder.pathAt > 900) {
              bleeder.path = findPathIn(sectorS, bleeder.x, bleeder.y, mark.x, mark.y, bleederShuns, true, undefined, true);
              bleeder.pathAt = now;
            }
            move(BLEEDER_HUNT_SPEED * (lit ? BLEEDER_BURN_SLOW : 1));
          }
        } else if (bleeder.mode === "scream") {
          bleeder.h = Math.atan2(mark.x - bleeder.x, mark.y - bleeder.y);
          if (now >= bleeder.screamUntil) {
            bleeder.mode = "chase";
            bleeder.path = [];
            bleeder.pathAt = 0;
          }
        } else if (bleeder.mode === "chase") {
          const speed = BLEEDER_CHASE_SPEED * (lit ? BLEEDER_BURN_SLOW : 1);
          if (sees && !crossesShunned(bleeder.x, bleeder.y, mark.x, mark.y, bleederShuns)) {
            // Straight at you, at the true angle.
            bleeder.path = [];
            const dx = mark.x - bleeder.x;
            const dy = mark.y - bleeder.y;
            const step = Math.min(speed * dt, gap);
            if (gap > 0.001) {
              bleeder.x += (dx / gap) * step;
              bleeder.y += (dy / gap) * step;
              bleeder.h = Math.atan2(dx, dy);
            }
          } else {
            if (!bleeder.path.length || now - bleeder.pathAt > 400) {
              bleeder.path = findPathIn(sectorS, bleeder.x, bleeder.y, mark.x, mark.y, bleederShuns, true, undefined, true);
              bleeder.pathAt = now;
            }
            // Lost the line for good: back to searching.
            if (!bleeder.path.length) bleeder.mode = "hunt";
            else move(speed);
          }
          // TOUCH IS DEATH for anybody in the dark it runs into, not only its
          // mark (Nov 2026 validation run).
          const victim = inDark
            .filter((q) => !immortals.has(q.userId) && Math.hypot(q.x - bleeder.x, q.y - bleeder.y) < BLEEDER_KILL)
            .sort((a, b) => Math.hypot(a.x - bleeder.x, a.y - bleeder.y) - Math.hypot(b.x - bleeder.x, b.y - bleeder.y))[0];
          if (victim) {
            const kx = victim.x;
            const ky = victim.y;
            killPlayer(victim, "the bleeder", { dir: Math.atan2(victim.x - bleeder.x, victim.y - bleeder.y), power: 4.2 });
            bleederCb?.({ type: "kill", x: kx, y: ky, userId: victim.userId });
            bleeder.mode = "feed";
            bleeder.feedUntil = now + BLEEDER_FEED_MS;
            bleeder.targetId = 0;
            bleeder.path = [];
          }
        }
      }
    }
    if (bleeder.live) {
      filmed(3, sectorS, bleeder.x, bleeder.y);
      bleederCb?.({
        type: "pos",
        x: bleeder.x,
        y: bleeder.y,
        h: bleeder.h,
        mode: bleeder.mode,
        ...(bleeder.burning ? { burn: true } : {}),
        targetId: bleeder.targetId,
      });
    }
  };

  // ---- THE GRABBER (Josh's design, Sep 2026; built Oct 2026) — Pipe Dreams --
  // BACKROOMS.md → "THE GRABBER": "a monster that will sneak up on you and
  // grab you turning you around and killing you … you hear footsteps and
  // monstrous breathing … but when the player turns around and shines it with
  // flashlight it screeches and runs away. the creature does not always harass
  // the player it will be random and the player will not hear the creature
  // until its close." The body is Level 0's stalker model (Josh: "reuse level
  // 0"); the brain is its own:
  //  · IT VISITS, IT DOES NOT PATROL. Each player on the level has a clock
  //    (GRAB_GAP, 3–8 minutes); when theirs runs out it comes for them — one
  //    visit at a time.
  //  · IT ARRIVES BEHIND YOU: out of your facing and out of every sight line,
  //    with a route to you that never crosses a lit SAFE room.
  //  · It walks at 2.4 cells a second (a sprint is 2.85): silent until it is
  //    close (the client plays nothing past 8 cells), then footsteps and that
  //    breathing — two or three seconds of warning.
  //  · LIGHT IN ITS FACE (a beam held a quarter of a second — the stalker's
  //    beam test, through beamOn) and it screeches and flees, and your clock
  //    starts again. Anyone's light: a teammate's beam saves you too.
  //  · IT NEVER ENTERS A LIT ROOM (break rooms, control rooms, the drain room).
  //    A target who reaches one is safe; it waits a while, then gives up.
  //  · THE GRAB: at arm's length, unlit, it takes hold — the victim is held
  //    still and turned to face it for GRAB_HOLD_MS — and kills ("grabbed"),
  //    unless a light finds it first.
  /** LIVE since Oct 2026 (Josh heard its five sounds: "the sounds are fine").
   *  BACKROOMS_GRABBER=0 puts it to sleep — the tick returns at once and the
   *  admin summon refuses — without a deploy of code. */
  const GRABBER_LIVE = process.env.BACKROOMS_GRABBER !== "0";
  const GRAB_SPEED = 2.4;
  const GRAB_FLEE_SPEED = 5.4;
  const GRAB_REACH = 1.2;
  const GRAB_FLINCH_MS = Number(process.env.BACKROOMS_GRABBER_FLINCH_MS ?? 250);
  const GRAB_HOLD_MS = Number(process.env.BACKROOMS_GRABBER_HOLD_MS ?? 1_500);
  const GRAB_GAP_MIN = Number(process.env.BACKROOMS_GRABBER_GAP_MIN_MS ?? 180_000);
  const GRAB_GAP_MAX = Number(process.env.BACKROOMS_GRABBER_GAP_MAX_MS ?? 480_000);
  /** A visit that can't land in this long ends (it slinks off). */
  const GRAB_VISIT_MS = Number(process.env.BACKROOMS_GRABBER_VISIT_MS ?? 90_000);
  /** Waiting outside a lit room this long, it gives up. */
  const GRAB_SAFE_GIVEUP_MS = Number(process.env.BACKROOMS_GRABBER_SAFE_GIVEUP_MS ?? 20_000);
  type GrabMode = "stalk" | "grab" | "flee";
  const grabber = {
    live: false,
    mode: "stalk" as GrabMode,
    x: 0,
    y: 0,
    h: 0,
    targetId: 0,
    path: [] as [number, number][],
    pathAt: 0,
    lit: 0,
    visitUntil: 0,
    safeSince: 0,
    grabUntil: 0,
    goneBy: 0,
  };
  /** Each player's next visit (absent = schedule one when first seen). */
  const grabNextAt = new Map<number, number>();
  let grabberCb: ((ev: GrabberEvent) => void) | null = null;
  const grabGap = (): number => GRAB_GAP_MIN + rng() * (GRAB_GAP_MAX - GRAB_GAP_MIN);
  /** A lit SAFE room (pipes-vocab SAFE_TYPES): it never sets foot in one. */
  const pipeSafeAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= sectorD.size || y >= sectorD.size) return false;
    const i = y * sectorD.size + x;
    if (sectorD.solid[i]) return false;
    const t = sectorD.districts[sectorD.district[i]]?.type as string | undefined;
    return !!t && PIPE_SAFE_TYPES.has(t as never);
  };
  const grabShuns = (x: number, y: number): boolean => isPitCell(sectorD, x, y) || pipeSafeAt(x, y);
  const grabGone = (now: number, targetNext: boolean): void => {
    if (targetNext && grabber.targetId) grabNextAt.set(grabber.targetId, now + grabGap());
    heldUntil.delete(grabber.targetId);
    grabber.live = false;
    grabber.path = [];
    grabber.targetId = 0;
    grabber.lit = 0;
    grabberCb?.({ type: "gone" });
  };
  /** Behind them: out of their facing, out of every sight line, on footing,
   *  with a route to them that keeps out of the lit rooms. */
  const grabPlaceBehind = (mark: BrSession, inside: BrSession[]): boolean => {
    const { fx, fy } = facingOf(mark.heading);
    for (let tries = 0; tries < 220; tries++) {
      // a fan behind them, widening as it fails
      const spread = tries < 110 ? 1.1 : Math.PI;
      const a = Math.atan2(-fy, -fx) + (rng() - 0.5) * 2 * spread;
      const d = 10 + rng() * 9;
      const x = Math.floor(mark.x + Math.cos(a) * d);
      const y = Math.floor(mark.y + Math.sin(a) * d);
      if (x < 2 || y < 2 || x >= sectorD.size - 2 || y >= sectorD.size - 2) continue;
      if (whyNoCreature(sectorD, x, y, "walker") || grabShuns(x, y)) continue;
      if (inside.some((q) => lineWalkableIn(sectorD, q.x, q.y, x + 0.5, y + 0.5))) continue;
      if (!findPathIn(sectorD, x + 0.5, y + 0.5, mark.x, mark.y, grabShuns, false, undefined, true).length) continue;
      grabber.x = x + 0.5;
      grabber.y = y + 0.5;
      grabber.h = Math.atan2(mark.x - grabber.x, mark.y - grabber.y);
      return true;
    }
    return false;
  };
  const grabBegin = (mark: BrSession, now: number): void => {
    grabber.live = true;
    grabber.mode = "stalk";
    grabber.targetId = mark.userId;
    grabber.path = [];
    grabber.pathAt = 0;
    grabber.lit = 0;
    grabber.safeSince = 0;
    grabber.visitUntil = now + GRAB_VISIT_MS;
  };
  const grabFlee = (now: number): void => {
    heldUntil.delete(grabber.targetId);
    grabber.mode = "flee";
    grabber.path = [];
    grabber.pathAt = 0;
    grabber.goneBy = now + 6_000;
    grabberCb?.({ type: "screech", x: grabber.x, y: grabber.y });
  };

  const grabberTick = (): void => {
    if (!enabledD || !GRABBER_LIVE) return;
    const now = Date.now();
    const dt = ENT_TICK_MS / 1000;
    const inside = [...sessions.values()].filter((q) => q.level === 2 && !q.fly && !q.lostAt);
    // every body down here has a clock; a body that left loses theirs
    for (const q of inside) if (!grabNextAt.has(q.userId)) grabNextAt.set(q.userId, now + grabGap());
    for (const id of [...grabNextAt.keys()]) if (!inside.some((q) => q.userId === id)) grabNextAt.delete(id);
    // A body already IN ITS ARMS is finished even if the socket drops (Oct
    // 2026 review): a refresh mid-grab froze the run, the Grabber let go,
    // and the reconnect resumed the run alive — the certain death skipped.
    const heldBody = grabber.live && grabber.mode === "grab" ? sessions.get(grabber.targetId) : undefined;
    const holding = !!heldBody && heldBody.level === 2 && !heldBody.fly;
    if (!inside.length && !holding) {
      if (grabber.live) grabGone(now, false);
      return;
    }
    if (!grabber.live) {
      // whose clock has run out? (one visit at a time)
      const due = inside.filter((q) => (grabNextAt.get(q.userId) ?? Infinity) <= now && !pipeSafeAt(Math.floor(q.x), Math.floor(q.y)));
      if (!due.length) return;
      const mark = due[Math.floor(rng() * due.length)];
      if (!grabPlaceBehind(mark, inside)) {
        grabNextAt.set(mark.userId, now + 5_000); // no way round behind them yet
        return;
      }
      grabBegin(mark, now);
    }

    // Fleeing it still never runs INTO a lit room (Nov 2026 validation run —
    // a beam from inside a break room sent it bolting into that same room).
    // Only when it already stands on one does it get pits-only, or it could
    // never path out.
    const fleeShun = (): ((x: number, y: number) => boolean) =>
      pipeSafeAt(Math.floor(grabber.x), Math.floor(grabber.y)) ? (x, y) => isPitCell(sectorD, x, y) : grabShuns;
    const move = (speed: number, fleeing = false): void => {
      const bx = grabber.x;
      const by = grabber.y;
      moveAlongIn(sectorD, grabber as unknown as EntBrain, speed, dt, fleeing ? fleeShun() : grabShuns, undefined, true);
      if (Math.hypot(grabber.x - bx, grabber.y - by) > 0.001) grabber.h = Math.atan2(grabber.x - bx, grabber.y - by);
    };

    // THE LIGHT, anyone's: a quarter-second of beam in its face and it goes
    // (in its arms, the victim is turned to face it — their own torch is too
    // late by then; only SOMEBODY ELSE's light breaks the hold)
    const lighters = grabber.mode === "grab" ? inside.filter((q) => q.userId !== grabber.targetId) : inside;
    const lit = grabber.mode !== "flee" && beamOn(sectorD, grabber.x, grabber.y, lighters);
    grabber.lit = lit ? grabber.lit + ENT_TICK_MS : 0;
    if (grabber.lit >= GRAB_FLINCH_MS) {
      grabber.lit = 0;
      grabFlee(now);
      grabNextAt.set(grabber.targetId, now + grabGap());
    }

    const target = sessions.get(grabber.targetId);
    if (grabber.mode === "flee") {
      if (!grabber.path.length || now - grabber.pathAt > 1_500) {
        const away = target ? Math.atan2(grabber.y - target.y, grabber.x - target.x) : rng() * Math.PI * 2;
        for (const [turn, reach] of [[0, 18], [0.9, 14], [-0.9, 14], [0, 8]] as [number, number][]) {
          const spot = walkableNearIn(sectorD, grabber.x + Math.cos(away + turn) * reach, grabber.y + Math.sin(away + turn) * reach, 8);
          if (!spot || pipeSafeAt(spot[0], spot[1])) continue;
          grabber.path = findPathIn(sectorD, grabber.x, grabber.y, spot[0] + 0.5, spot[1] + 0.5, fleeShun(), true, undefined, true);
          if (grabber.path.length) break;
        }
        grabber.pathAt = now;
      }
      move(GRAB_FLEE_SPEED, true);
      const watched = inside.some((q) => Math.hypot(q.x - grabber.x, q.y - grabber.y) <= 26 && lineWalkableIn(sectorD, q.x, q.y, grabber.x, grabber.y));
      if (!watched || now >= grabber.goneBy) {
        grabGone(now, false);
        return;
      }
    } else if (!target || target.level !== 2 || target.fly || (target.lostAt && grabber.mode !== "grab")) {
      grabGone(now, false);
      return;
    } else if (grabber.mode === "grab") {
      // the hold: it has them, facing it — then it is over
      grabber.h = Math.atan2(target.x - grabber.x, target.y - grabber.y);
      if (now >= grabber.grabUntil) {
        heldUntil.delete(target.userId);
        if (immortals.has(target.userId)) {
          grabGone(now, true);
          return;
        }
        const kx = target.x;
        const ky = target.y;
        killPlayer(target, "the grabber", { dir: Math.atan2(target.x - grabber.x, target.y - grabber.y), power: 1.6 });
        grabberCb?.({ type: "kill", x: kx, y: ky, userId: target.userId });
        grabGone(now, false);
        return;
      }
    } else {
      // STALKING
      const gap = Math.hypot(target.x - grabber.x, target.y - grabber.y);
      const tSafe = pipeSafeAt(Math.floor(target.x), Math.floor(target.y));
      if (tSafe) {
        // they made the light: it waits outside a while, then gives up
        if (!grabber.safeSince) grabber.safeSince = now;
        grabber.path = [];
        if (now - grabber.safeSince > GRAB_SAFE_GIVEUP_MS) {
          grabGone(now, true);
          return;
        }
      } else {
        grabber.safeSince = 0;
        if (now >= grabber.visitUntil) {
          grabGone(now, true);
          return;
        }
        if (!grabber.path.length || now - grabber.pathAt > 500) {
          grabber.path = findPathIn(sectorD, grabber.x, grabber.y, target.x, target.y, grabShuns, true, undefined, true);
          grabber.pathAt = now;
        }
        move(GRAB_SPEED);
        if (gap <= GRAB_REACH && lineWalkableIn(sectorD, grabber.x, grabber.y, target.x, target.y)) {
          // IT HAS YOU
          grabber.mode = "grab";
          grabber.grabUntil = now + GRAB_HOLD_MS;
          grabber.path = [];
          heldUntil.set(target.userId, grabber.grabUntil);
          grabberCb?.({ type: "grab", x: grabber.x, y: grabber.y, targetId: target.userId });
        }
      }
    }
    if (grabber.live) {
      filmed(2, sectorD, grabber.x, grabber.y);
      grabberCb?.({ type: "pos", x: grabber.x, y: grabber.y, h: grabber.h, mode: grabber.mode, targetId: grabber.targetId });
    }
  };

  // The map's spawners are seated here, not beside seatSpawners: their
  // refusals read the Poolrooms' water and Pipe Dreams' safe rooms, which
  // are defined above this line (a boot-time call earlier in the closure
  // would meet them uninitialised).
  for (const lvl of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as BrLevel[]) seatSpawners(lvl);

  /** LAW 4's test: the slugs of a level's ten this player has not found —
   *  neither banked (unlocked) nor carried this run. */
  const relicsMissing = (userId: number, level: BrLevel): string[] => {
    const have = new Set(store.brRelics(userId).map((r) => r.relicId));
    for (const r of sessions.get(userId)?.relics ?? []) have.add(r);
    return levelRelics(level).map((r) => r.slug).filter((slug) => !have.has(slug));
  };

  const api: BackroomsService = {
    get enabled() {
      return enabled;
    },
    get sector() {
      return sector;
    },
    get sectorP() {
      return sectorP;
    },
    get enabledP() {
      return enabledP;
    },
    get sectorD() {
      return sectorD;
    },
    get enabledD() {
      return enabledD;
    },
    get sectorS() {
      return sectorS;
    },
    get enabledS() {
      return enabledS;
    },
    get sectorO() {
      return sectorO;
    },
    get enabledO() {
      return enabledO;
    },
    get sectorH() {
      return sectorH;
    },
    get enabledH() {
      return enabledH;
    },
    get sectorL() {
      return sectorL;
    },
    get enabledL() {
      return enabledL;
    },
    get sectorT() {
      return sectorT;
    },
    get enabledT() {
      return enabledT;
    },
    get sectorC() {
      return sectorC;
    },
    get enabledC() {
      return enabledC;
    },
    get sectorU() {
      return sectorU;
    },
    get enabledU() {
      return enabledU;
    },
    sessions,
    spectators,
    aliveOn(level) {
      return [...sessions.values()].filter((q) => q.level === level && !q.lostAt && !q.fly);
    },
    sectorIdOf,
    playersOn(level) {
      return [...sessions.values()].filter((q) => q.level === level && !q.lostAt).length;
    },
    swapMap(level, next, nextId) {
      // the map reset's rule: a connected player blocks it, a frozen run is
      // voided (its loadout never left the locker)
      if ([...sessions.values()].some((q) => q.level === level && !q.lostAt)) return { error: "players_inside" };
      let voided = 0;
      for (const [id, q] of sessions) {
        if (q.level !== level) continue;
        // a voided run's loadout never left the locker — its relics come home too
        if (!testingLevel(level)) for (const slug of q.relics) if (!store.brUnlockRelic(id, slug)) store.brForceAddItem(id, "relic", slug);
        endRun(id);
        voided++;
      }
      flushFog();
      if (level === 0) {
        sector = next;
        sectorIdA = nextId;
        enabled = true;
        fog = loadFog(nextId, next);
        fogDirty[0] = false;
        // everything placed on the map is placed again on the new one: the
        // door and key, the drives still out there, fresh relic sites, and
        // the entities (seated when somebody next walks in)
        placeDoorAndKey();
        placeDrives(0);
        relicSites.length = 0;
        spawnRelic();
        spawnRelic();
        entsPlaced = false;
        stalker.placed = false;
        // and forget the old map's routes, as the map reset does: a route
        // walked on the new map goes through its walls (Nov 2026 validation run)
        for (const e of ents) {
          e.mode = "patrol";
          e.path = [];
          e.via = null;
          e.stimulus = null;
          e.restUntil = 0;
          e.homeRelic = -1;
        }
        stalker.mode = "shadow";
        stalker.path = [];
        stalker.lurk = null;
        stalker.hide = null;
      } else if (level === 2) {
        sectorD = next;
        sectorIdD = nextId;
        enabledD = true;
        fogD = loadFog(nextId, next);
        fogDirty[2] = false;
        placeFuses();
        placeDrives(2);
        relicSitesD.length = 0;
        spawnRelicD();
        spawnRelicD();
      } else if (level === 3) {
        sectorS = next;
        sectorIdS = nextId;
        enabledS = true;
        fogS = loadFog(nextId, next);
        fogDirty[3] = false;
        placeStation();
        placeDrives(3);
        relicSitesS.length = 0;
        spawnRelicS();
        spawnRelicS();
      } else if (level === 4) {
        sectorO = next;
        sectorIdO = nextId;
        enabledO = true;
        fogO = loadFog(nextId, next);
        fogDirty[4] = false;
        placeOffice();
        officeLit = officeLitCells(sectorO);
        tempGone(Date.now(), 0);
        placeDrives(4);
        relicSitesO.length = 0;
        spawnRelicO();
        spawnRelicO();
      } else if (level === 5) {
        sectorH = next;
        sectorIdH = nextId;
        enabledH = true;
        fogH = loadFog(nextId, next);
        fogDirty[5] = false;
        placeHotel();
        placeMoths();
        placeDrives(5);
        relicSitesH.length = 0;
        spawnRelicH();
        spawnRelicH();
      } else if (level === 6) {
        sectorL = next;
        sectorIdL = nextId;
        enabledL = true;
        fogL = loadFog(nextId, next);
        fogDirty[6] = false;
        placeLights();
        placeDrives(6);
        relicSitesL.length = 0;
        spawnRelicL();
        spawnRelicL();
        // (the spare batteries are laid AFTER the loose items are cleared,
        // below — laid here, the clear swept them straight back up)
      } else if (level === 7) {
        sectorT = next;
        sectorIdT = nextId;
        enabledT = true;
        fogT = loadFog(nextId, next);
        fogDirty[7] = false;
        placeOcean();
        placeDrives(7);
        relicSitesT.length = 0;
        spawnRelicT();
        spawnRelicT();
      } else if (level === 8) {
        sectorC = next;
        sectorIdC = nextId;
        enabledC = true;
        fogC = loadFog(nextId, next);
        fogDirty[8] = false;
        placeCave();
        placeDrives(8);
        relicSitesC.length = 0;
        spawnRelicC();
        spawnRelicC();
        for (const b of burrowers) burrowerCb?.({ type: "gone", id: b.id });
        burrowers = [];
      } else if (level === 9) {
        sectorU = next;
        sectorIdU = nextId;
        enabledU = true;
        fogU = loadFog(nextId, next);
        fogDirty[9] = false;
        placeSuburbs();
        placeDrives(9);
        relicSitesU.length = 0;
        spawnRelicU();
        spawnRelicU();
        for (const w of watchers) watchCb?.({ type: "gone", id: w.id });
        watchers = [];
      } else {
        sectorP = next;
        sectorIdP = nextId;
        enabledP = true;
        fogP = loadFog(nextId, next);
        fogDirty[1] = false;
        // everything that lives on the water is re-seated on the new map
        placeHatchAndKey();
        residentGators();
        dockBoats();
        placePoolDrives();
        relicSitesP.length = 0;
        spawnRelicP();
        spawnRelicP();
      }
      seatSpawners(level);
      // the old map's bodies and loose items mean nothing on the new one
      for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].lvl === level) corpses.splice(i, 1);
      for (let i = drops.length - 1; i >= 0; i--) if (drops[i].lvl === level) drops.splice(i, 1);
      // LIGHTS OUT's spare batteries: the clear above took them and the timer
      // only lays one every four minutes — a new map (or a Test play) starts
      // stocked (Nov 2026 validation run).
      if (level === 6) for (let k = 0; k < BATTERY_LOOSE; k++) spawnBattery();
      console.log(`[backrooms] Level ${level} now plays ${nextId} (${next.kit?.length ?? 0} props)${voided ? `; ${voided} frozen run${voided > 1 ? "s" : ""} voided` : ""}.`);
      return { ok: true, voided };
    },

    swapDressing(level, next) {
      const live = secBy(level);
      const before = kitChunkSignatures(live, CHUNK);
      // a cell's style compared by what it IS, not its number (two builds may
      // number the same styles differently)
      const styleKeyOf = (look: Uint16Array | undefined, styles: LookSpec[] | undefined, i: number): string => {
        const v = look?.[i] ?? 0;
        return v && styles?.[v - 1] ? lookKey(styles[v - 1]) : "";
      };
      const oldLook = live.look;
      const oldStyles = live.styles;
      const oldLid = live.lid;
      const oldStair = live.stair;
      const oldStairStyle = live.stairStyle;
      const oldStairSpecs = live.stairSpecs;
      live.kit = next.kit ?? [];
      live.look = next.look;
      live.styles = next.styles;
      live.marks = next.marks;
      live.lid = next.lid;
      live.stair = next.stair;
      live.stairStyle = next.stairStyle;
      live.stairSpecs = next.stairSpecs;
      forgetKitBuckets(live);
      // THE GAME LAYER is dressing too: spawners are seated again, the
      // alligators re-counted, and the drives still out there re-placed on
      // their spots (a relic already lying somewhere stays where it is; the
      // next one to spawn uses the new spots)
      seatSpawners(level);
      if (level === 1) residentGators();
      placeDrives(level);
      const after = kitChunkSignatures(live, CHUNK);
      const keys = new Set<string>();
      for (const k of new Set([...before.keys(), ...after.keys()])) if (before.get(k) !== after.get(k)) keys.add(k);
      // a repainted cell changes its chunk too
      if (oldLook || next.look) {
        const size = live.size;
        for (let i = 0; i < size * size; i++) {
          if (styleKeyOf(oldLook, oldStyles, i) !== styleKeyOf(next.look, next.styles, i)) keys.add(`${Math.floor((i % size) / CHUNK)},${Math.floor(Math.floor(i / size) / CHUNK)}`);
        }
      }
      // …and so does a stair redressed (compared by what it IS)
      if (oldStair || next.stair) {
        const size = live.size;
        const keyAt = (st: Int8Array | undefined, sty: Uint8Array | undefined, specs: StairSpec[] | undefined, i: number): string => {
          const side = st?.[i] ?? STAIR_NONE;
          if (side === STAIR_NONE) return "";
          const v = sty?.[i] ?? 0;
          return `${side}:${v && specs?.[v - 1] ? stairKey(specs[v - 1]) : ""}`;
        };
        for (let i = 0; i < size * size; i++) {
          if (keyAt(oldStair, oldStairStyle, oldStairSpecs, i) !== keyAt(next.stair, next.stairStyle, next.stairSpecs, i)) keys.add(`${Math.floor((i % size) / CHUNK)},${Math.floor(Math.floor(i / size) / CHUNK)}`);
        }
      }
      // …and so does a ceiling held or let go
      if (oldLid || next.lid) {
        const size = live.size;
        for (let i = 0; i < size * size; i++) {
          if ((oldLid?.[i] ?? LID_NONE) !== (next.lid?.[i] ?? LID_NONE)) keys.add(`${Math.floor((i % size) / CHUNK)},${Math.floor(Math.floor(i / size) / CHUNK)}`);
        }
      }
      const changed = [...keys].map((k) => {
        const [cx, cy] = k.split(",").map(Number);
        return { cx, cy };
      });
      console.log(`[backrooms] Level ${level} dressing updated in place (${live.kit.length} props, ${changed.length} chunk${changed.length === 1 ? "" : "s"} changed) — the map, its fog and everything on it stay.`);
      if (changed.length) kitSwapCb?.(level, changed);
      return changed;
    },

    onKitSwap(cb) {
      kitSwapCb = cb;
    },

    beginTest(level, next, by) {
      if (testing.has(level)) return { error: "already_testing" };
      const inside = [...sessions.values()].filter((q) => q.level === level).length;
      if (inside) return { error: "players_inside", inside };
      const liveId = sectorIdOf(level);
      const testId = `${liveId}-test`;
      // what the live map holds that a swap would sweep away, kept to put back
      const stash = {
        sector: secBy(level),
        sectorId: liveId,
        // a level shut for failing its boot check stays shut after the test
        enabled: enabledOf(level),
        corpses: corpses.filter((c) => c.lvl === level),
        drops: drops.filter((d) => d.lvl === level),
        relics: [...relicSitesOf(level)],
      };
      store.clearBackroomsFog(testId); // every test starts uncharted
      const r = this.swapMap(level, next, testId);
      if ("error" in r) return { error: r.error };
      testing.set(level, { by, since: Date.now(), sectorId: testId, entered: false, stash });
      console.log(`[backrooms] Level ${level} is being test-played by user ${by} (${testId}) — closed to everyone else until it ends.`);
      return { ok: true, sectorId: testId };
    },

    endTest(level) {
      const t = testing.get(level);
      if (!t) return { error: "not_testing" };
      const sent: number[] = [];
      for (const [id, q] of sessions) {
        if (q.level !== level) continue;
        endRun(id);
        sent.push(id);
      }
      testing.delete(level);
      const r = this.swapMap(level, t.stash.sector, t.stash.sectorId);
      if ("error" in r) console.error(`[backrooms] the test on Level ${level} could not swap back: ${r.error}`);
      if (level === 0) enabled = t.stash.enabled;
      else if (level === 1) enabledP = t.stash.enabled;
      else if (level === 2) enabledD = t.stash.enabled;
      else if (level === 3) enabledS = t.stash.enabled;
      else if (level === 4) enabledO = t.stash.enabled;
      else if (level === 5) enabledH = t.stash.enabled;
      else if (level === 6) enabledL = t.stash.enabled;
      else if (level === 7) enabledT = t.stash.enabled;
      else if (level === 8) enabledC = t.stash.enabled;
      else enabledU = t.stash.enabled;
      if (level === 3) testThrown.clear();
      // the live map's bodies, loose items and relics, exactly as they were —
      // less whatever rotted in the DB while it sat in the stash (Oct 2026
      // review: a rotted drop came back and minted its item when picked up)
      corpses.push(...t.stash.corpses.filter((c) => store.brCorpseExists(c.id)));
      drops.push(...t.stash.drops.filter((d) => store.brDropExists(d.id)));
      if (level === 0) relicSites.splice(0, relicSites.length, ...t.stash.relics);
      else if (level === 1) relicSitesP.splice(0, relicSitesP.length, ...t.stash.relics);
      else if (level === 2) relicSitesD.splice(0, relicSitesD.length, ...t.stash.relics);
      else if (level === 3) relicSitesS.splice(0, relicSitesS.length, ...t.stash.relics);
      else if (level === 4) relicSitesO.splice(0, relicSitesO.length, ...t.stash.relics);
      else if (level === 5) relicSitesH.splice(0, relicSitesH.length, ...t.stash.relics);
      else if (level === 6) relicSitesL.splice(0, relicSitesL.length, ...t.stash.relics);
      else if (level === 7) relicSitesT.splice(0, relicSitesT.length, ...t.stash.relics);
      else if (level === 8) relicSitesC.splice(0, relicSitesC.length, ...t.stash.relics);
      else relicSitesU.splice(0, relicSitesU.length, ...t.stash.relics);
      console.log(`[backrooms] Level ${level}'s test ended — it plays ${t.stash.sectorId} again.`);
      if (sent.length) testEndCb?.(level, sent);
      return { ok: true, sent };
    },

    testOf(level) {
      const t = testing.get(level);
      return t ? { by: t.by, since: t.since, sectorId: t.sectorId } : null;
    },

    onTestEnd(cb) {
      testEndCb = cb;
    },

    travel(userId) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      // the Grabber holding you: no door saves you (Nov 2026 validation run)
      if ((heldUntil.get(userId) ?? 0) > Date.now()) return { error: "held" };
      if (s.level === 9) return { error: "no_passage" };
      if (s.level === 8) {
        // THE CHIMNEY, the rope fixed in it: up it and out of a manhole into
        // THE SUBURBS. Members wait for the ship gate's switch (Josh walks it
        // in Test play first); the admin may always climb.
        if (!chimneyFoot || Math.hypot(s.x - chimneyFoot.x, s.y - chimneyFoot.y) > 2.4) return { error: "no_passage" };
        if (!store.brGetFlag(LEVEL9_FLAG)) return { error: "locked" };
        if (!enabledU) return { error: "suburbs_offline" };
        if (!store.brGetFlag(SUBURBS_OPEN_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "not_built" };
        if (testing.has(8) || testing.has(9)) return { error: "level_testing" };
        if (onLevel(sessions, 9) >= MAX_INSIDE) return { error: "full" };
        // a key never leaves its level: through a door, it goes home
        if (s.hasKey) keyHolder[8] = null;
        s.hasKey = false;
        s.level = 9;
        s.boatId = null;
        s.subSince = null;
        { const a = arrivalSpot(9, sectorU.doors[0].x + 0.5, sectorU.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(9, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      if (s.level === 7) {
        // THE SUBWAY STAIR, 24m down, opened in the helmet: down it into THE
        // CAVE SYSTEM. Members wait for the ship gate's switch (Josh walks it
        // in Test play first); the admin may always go through.
        if (!subwayDoor || Math.hypot(s.x - subwayDoor.x, s.y - subwayDoor.y) > 2.4 || !atSubwayDepth(s)) return { error: "no_passage" };
        if (!store.brGetFlag(LEVEL8_FLAG)) return { error: "locked" };
        // THE HELMET, EVERY TIME (Nov 2026 validation run): a bare body
        // drowns on the way down (24m at the client's 1 m/s is past the 20s a
        // breath and its bleed allow), so an honest client never gets here
        // without it. The depth check has a margin for lag that a bare body
        // fits inside, so the server asks for the helmet itself.
        if (!s.hasKey && !store.getUserById(userId)?.isAdmin) return { error: "no_helmet" };
        if (!enabledC) return { error: "cave_offline" };
        if (!store.brGetFlag(CAVE_OPEN_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "not_built" };
        if (testing.has(7) || testing.has(8)) return { error: "level_testing" };
        if (onLevel(sessions, 8) >= MAX_INSIDE) return { error: "full" };
        // a key never leaves its level: through a door, it goes home
        if (s.hasKey) keyHolder[7] = null;
        s.hasKey = false;
        s.level = 8;
        s.boatId = null;
        s.subSince = null;
        { const a = arrivalSpot(8, sectorC.doors[0].x + 0.5, sectorC.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(8, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      if (s.level === 6) {
        // THE SEA HATCH: opened with the Handwheel, and through it the sea —
        // THALASSOPHOBIA. Members wait for the ship gate's switch (Josh walks
        // it in Test play first); the admin may always go through.
        if (!seaHatch || Math.hypot(s.x - seaHatch.x, s.y - seaHatch.y) > 2.4) return { error: "no_passage" };
        if (!store.brGetFlag(LEVEL7_FLAG)) return { error: "locked" };
        if (!enabledT) return { error: "ocean_offline" };
        if (!store.brGetFlag(OCEAN_OPEN_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "not_built" };
        if (testing.has(6) || testing.has(7)) return { error: "level_testing" };
        if (onLevel(sessions, 7) >= MAX_INSIDE) return { error: "full" };
        // a key never leaves its level: through a door, it goes home
        if (s.hasKey) keyHolder[6] = null;
        s.hasKey = false;
        s.level = 7;
        s.boatId = null;
        s.subSince = null;
        { const a = arrivalSpot(7, sectorT.doors[0].x + 0.5, sectorT.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(7, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      if (s.level === 5) {
        // THE RUSTY DOOR: opened with the Boiler Key, down the stairs into
        // LIGHTS OUT. Members wait for the ship gate's switch (Josh walks it
        // in Test play first); the admin may always go through.
        if (!rustyDoor || Math.hypot(s.x - rustyDoor.x, s.y - rustyDoor.y) > 2.4) return { error: "no_passage" };
        if (!store.brGetFlag(LEVEL6_FLAG)) return { error: "locked" };
        if (!enabledL) return { error: "lights_offline" };
        if (!store.brGetFlag(LIGHTS_OPEN_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "not_built" };
        if (testing.has(5) || testing.has(6)) return { error: "level_testing" };
        if (onLevel(sessions, 6) >= MAX_INSIDE) return { error: "full" };
        // a key never leaves its level: through a door, it goes home
        if (s.hasKey) keyHolder[5] = null;
        s.hasKey = false;
        s.level = 6;
        s.boatId = null;
        s.heat = 0;
        { const a = arrivalSpot(6, sectorL.doors[0].x + 0.5, sectorL.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(6, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      if (s.level === 4) {
        // THE STAIRWELL DOOR: badged open with the keycard, down the service
        // stair to THE TERROR HOTEL. Members wait for the ship gate's switch
        // (Josh walks it in Test play first); the admin may always go through.
        if (!stairDoor || Math.hypot(s.x - stairDoor.x, s.y - stairDoor.y) > 2.4) return { error: "no_passage" };
        if (!store.brGetFlag(LEVEL5_FLAG)) return { error: "locked" };
        if (!enabledH) return { error: "hotel_offline" };
        if (!store.brGetFlag(HOTEL_OPEN_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "not_built" };
        if (testing.has(4) || testing.has(5)) return { error: "level_testing" };
        if (onLevel(sessions, 5) >= MAX_INSIDE) return { error: "full" };
        // a key never leaves its level: through a door, it goes home
        if (s.hasKey) keyHolder[4] = null;
        s.hasKey = false;
        s.level = 5;
        s.boatId = null;
        s.heat = 0;
        { const a = arrivalSpot(5, sectorH.doors[0].x + 0.5, sectorH.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(5, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      if (s.level === 3) {
        // THE LIFT SHUTTER: powered by all six breakers, down to THE
        // ABANDONED OFFICE. Members wait for the ship gate's switch (Josh
        // walks it in Test play first); the admin may always go through.
        if (!shutterSite || Math.hypot(s.x - shutterSite.x, s.y - shutterSite.y) > 2.4) return { error: "no_passage" };
        if (!store.brGetFlag(LEVEL4_FLAG)) return { error: "locked" };
        if (!enabledO) return { error: "office_offline" };
        if (!store.brGetFlag(OFFICE_OPEN_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "not_built" };
        if (testing.has(3) || testing.has(4)) return { error: "level_testing" };
        if (onLevel(sessions, 4) >= MAX_INSIDE) return { error: "full" };
        s.level = 4;
        s.boatId = null;
        { const a = arrivalSpot(4, sectorO.doors[0].x + 0.5, sectorO.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(4, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      if (s.level === 2) {
        // THE PRESSURE DOOR: open once the fuses are in — onto THE ELECTRICAL
        // STATION. Members wait for the ship gate's switch (Josh walks it in
        // Test play first); the admin may always go through.
        if (!pressureDoor || Math.hypot(s.x - pressureDoor.x, s.y - pressureDoor.y) > 2.6) return { error: "no_passage" };
        if (!store.brGetFlag(LEVEL3_FLAG)) return { error: "locked" };
        if (!enabledS) return { error: "station_offline" };
        if (!store.brGetFlag(STATION_OPEN_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "not_built" };
        if (testing.has(2) || testing.has(3)) return { error: "level_testing" };
        if (onLevel(sessions, 3) >= MAX_INSIDE) return { error: "full" };
        // fuses never leave Pipe Dreams: through the door, they go home
        for (const f of s.fuses ?? []) fuseHolder[f] = null;
        s.fuses = [];
        s.level = 3;
        s.boatId = null;
        { const a = arrivalSpot(3, sectorS.doors[0].x + 0.5, sectorS.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(3, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      if (!enabledP) return { error: "pools_offline" };
      // THE DRAIN HATCH: down to Pipe Dreams, once its key has opened it
      if (s.level === 1 && Math.hypot(s.x - hatch.x, s.y - hatch.y) <= 2.2) {
        if (!store.brGetFlag(LEVEL2_FLAG)) return { error: "locked" };
        if (!enabledD) return { error: "pipes_offline" };
        if (testing.has(1) || testing.has(2)) return { error: "level_testing" };
        if (onLevel(sessions, 2) >= MAX_INSIDE) return { error: "full" };
        if (s.hasKey) keyHolder[1] = null; // the key belongs to the Poolrooms
        s.hasKey = false;
        s.level = 2;
        s.boatId = null;
        { const a = arrivalSpot(2, sectorD.doors[0].x + 0.5, sectorD.doors[0].y + 0.5, userId); s.x = a.x; s.y = a.y; }
        s.revealed += revealAround(2, Math.floor(s.x), Math.floor(s.y));
        return { level: s.level, x: s.x, y: s.y };
      }
      // no passage into or out of a level under test
      if (testing.has(0) || testing.has(1)) return { error: "level_testing" };
      if (!store.brGetFlag(LEVEL1_FLAG)) return { error: "locked" };
      // Range FIRST: a refused step must not cost the key. (It used to send
      // the key home before checking, so a carrier who opened the Landing's
      // choice a step too far off lost the Poolrooms' key to a "too far".)
      if (s.level === 0 ? Math.hypot(s.x - theDoor.x, s.y - theDoor.y) > 2.2 : Math.hypot(s.x - (landing().x + 0.5), s.y - (landing().y + 0.5)) > 2.2) return { error: "too_far" };
      if (onLevel(sessions, s.level === 0 ? 1 : 0) >= MAX_INSIDE) return { error: "full" };
      // a key never leaves its level: through a door, it goes home
      if (s.hasKey) keyHolder[s.level] = null;
      s.hasKey = false;
      if (s.level === 0) {
        s.level = 1;
        s.boatId = null; // you can't carry a boat through a door
        { const a = arrivalSpot(1, landing().x + 0.5, landing().y + 0.5, userId); s.x = a.x; s.y = a.y; }
      } else {
        s.level = 0;
        s.boatId = null;
        // Arrive ON the door cell (already +0.5 floats, and walkable by
        // construction — it's the deepest FLOOR cell from the entries).
        { const a = arrivalSpot(0, theDoor.x, theDoor.y, userId); s.x = a.x; s.y = a.y; }
      }
      s.revealed += revealAround(s.level, Math.floor(s.x), Math.floor(s.y));
      return { level: s.level, x: s.x, y: s.y };
    },

    activeRelics() {
      const dress = (r: { id: number; relicId: string; x: number; y: number }, lvl: BrLevel) => ({
        id: r.id,
        x: r.x,
        y: r.y,
        relicId: r.relicId,
        name: relicBySlug(r.relicId)?.name ?? r.relicId,
        lvl,
      });
      return [...relicSites.map((r) => dress(r, 0 as const)), ...relicSitesP.map((r) => dress(r, 1 as const)), ...relicSitesD.map((r) => dress(r, 2 as const)), ...relicSitesS.map((r) => dress(r, 3 as const)), ...relicSitesO.map((r) => dress(r, 4 as const)), ...relicSitesH.map((r) => dress(r, 5 as const)), ...relicSitesL.map((r) => dress(r, 6 as const)), ...relicSitesT.map((r) => dress(r, 7 as const)), ...relicSitesC.map((r) => dress(r, 8 as const)), ...relicSitesU.map((r) => dress(r, 9 as const))];
    },

    activeCorpses() {
      return corpses.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        name: c.name,
        suit: c.items.find((i) => i.kind === "suit")?.color ?? "yellow",
        lvl: c.lvl,
      }));
    },

    activeDrops() {
      return drops.map((d) => ({
        id: d.id,
        x: d.x,
        y: d.y,
        kind: d.kind,
        level: d.level,
        color: d.color,
        charge: d.charge,
        lvl: d.lvl,
      }));
    },

    dropItem(userId, itemId, charge) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      const idx = s.inventory.findIndex((i) => i.id === itemId);
      if (idx === -1) return { error: "not_carried" };
      const item = s.inventory[idx];
      // A dropped suit would leave you unsuited mid-run; the yellow is not
      // OSHA compliant and the entry rule says so.
      if (item.kind === "suit") return { error: "cant_drop_suit" };
      // a test run keeps your kit whole
      if (testing.has(s.level)) return { error: "test_run" };
      // relics and tapes are findings, not kit: they never travel in a run
      if (item.kind === "relic" || item.kind === "tape") return { error: "cant_drop" };
      s.inventory.splice(idx, 1);
      // The locker row travels WITH the item: it leaves your locker now and
      // is re-minted for whoever picks it up. Nothing duplicates — and a row
      // that is already gone (sold over HTTP mid-run) drops nothing.
      if (!store.brDeleteItems(userId, [itemId]).length) return { error: "not_carried" };
      const safeCharge = Number.isFinite(charge) && (charge as number) >= 0 ? (charge as number) : null;
      // a thing hitting a concrete floor is a noise down here (not one let
      // fall by a flying operator, who is a camera — Nov 2026 polish round)
      if (s.level === 6 && !s.fly) listenerHear(s.x, s.y, LISTEN.drop, s.userId);
      if (s.level === 8 && !s.fly) burrowHear(s.x, s.y, HEAR.drop, s.userId);
      const id = store.brAddDrop(sectorIdOf(s.level), {
        x: s.x,
        y: s.y,
        kind: item.kind,
        level: item.level,
        color: item.color,
        charge: safeCharge,
      });
      drops.push({
        id,
        x: s.x,
        y: s.y,
        kind: item.kind,
        level: item.level,
        color: item.color,
        charge: safeCharge,
        lvl: s.level,
      });
      return { id, kind: item.kind };
    },

    takeDrop(userId, dropId) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      const i = drops.findIndex((d) => d.id === dropId);
      if (i === -1) return { error: "gone" };
      const d = drops[i];
      if (d.lvl !== s.level) return { error: "gone" };
      if (Math.hypot(s.x - d.x, s.y - d.y) > 2) return { error: "too_far" };
      if (!pickupLos(s, d.x, d.y)) return { error: "too_far" };
      const worn = d.kind === "backpack" || d.kind === "suit";
      const cap = s.inventory.some((it) => it.kind === "backpack") ? 9 : 5;
      const carried =
        s.inventory.filter((it) => it.kind !== "backpack" && it.kind !== "suit").length + s.relics.length;
      if (!worn && carried >= cap) return { error: "no_space" };
      // a relic on the floor obeys law 4 and is carried as a FINDING, like
      // one taken off a body (Oct 2026 review)
      if (d.kind === "relic" && d.color) {
        const lvl = relicLevel(d.color);
        if (lvl >= 0) {
          const missing = relicsMissing(userId, lvl as BrLevel);
          if (missing.length && !missing.includes(d.color)) return { error: "already_have" };
        }
      }
      drops.splice(i, 1);
      // a drop whose row already rotted is gone, whatever memory says
      if (!store.brDeleteDrop(d.id)) return { error: "gone" };
      if (d.kind === "relic" && d.color) {
        s.relics.push(d.color);
        mirrorCarried();
        return { item: { id: -d.id, kind: d.kind, level: d.level, color: d.color }, charge: d.charge };
      }
      // A TEST RUN keeps nothing: what a tester picks up (Lights Out's spare
      // batteries, mostly) is carried for the run under a stand-in id and
      // never becomes a locker row (Nov 2026 validation run).
      const newId = testing.has(s.level) ? -1_000_000 - d.id : store.brForceAddItem(userId, d.kind, d.color, d.level);
      const item: BrItem = { id: newId, kind: d.kind, level: d.level, color: d.color };
      s.inventory.push(item);
      return { item, charge: d.charge };
    },

    activeDrives(level = 0) {
      const list = driveLists[level] ?? [];
      return list.map((d) => ({ id: d.id, x: d.x, y: d.y }));
    },

    takeDrive(userId, name, id) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      const list = driveLists[s.level] ?? [];
      const i = list.findIndex((d) => d.id === id);
      if (i === -1) return { error: "gone" };
      const site = list[i];
      if (Math.hypot(s.x - site.x, s.y - site.y) > 2) return { error: "too_far" };
      // No reaching THROUGH drywall (Josh's catch: "players can grab hard
      // drives through the wall") — same line-of-sight the entity uses.
      // Level-aware (Sep 2026 review): losClear walks Sector A, so a drive
      // in the Poolrooms was checked against Level 0's walls.
      if (!pickupLos(s, site.x, site.y)) return { error: "too_far" };
      const def = driveById(id);
      if (!def) return { error: "gone" };
      // a test run reads the drive but doesn't claim it for anyone
      if (testing.has(s.level)) return { driveId: id, title: def.title, file: def.file, body: def.body, ada: def.ada ?? "", fresh: false };
      // The claim is the DB insert, so two people grabbing at once still
      // produces one finder — and the drive leaves the world either way.
      const claim = store.brUnlockDrive(id, userId, name);
      list.splice(i, 1);
      return { driveId: id, title: def.title, file: def.file, body: def.body, ada: def.ada ?? "", fresh: claim.fresh };
    },

    doorPos() {
      return { x: theDoor.x, y: theDoor.y };
    },

    keyPos(level = 0) {
      if (level === 1) return enabledP && keyIsFindable(1) && !store.brGetFlag(LEVEL2_FLAG) ? { x: keyHomeP.x, y: keyHomeP.y } : null;
      // the office's keycard: lying in The Security Office until the stairwell
      // door is open, then it has nothing left to open and stops showing
      if (level === 4) return enabledO && keyIsFindable(4) && !store.brGetFlag(LEVEL5_FLAG) ? { x: keycardHome.x, y: keycardHome.y } : null;
      // the hotel's Boiler Key: on its hook until the rusty door is open
      if (level === 5) return enabledH && boilerKeyHome && keyIsFindable(5) && !store.brGetFlag(LEVEL6_FLAG) ? { x: boilerKeyHome.x, y: boilerKeyHome.y } : null;
      // Lights Out's Handwheel: where it lies until the sea hatch is open
      if (level === 6) return enabledL && wheelHome && keyIsFindable(6) && !store.brGetFlag(LEVEL7_FLAG) ? { x: wheelHome.x, y: wheelHome.y } : null;
      // Thalassophobia's Diving Helmet: a tool, not a key — it keeps lying on
      // its roof after the subway is open, because every dive needs it
      if (level === 7) return enabledT && helmetHome && keyIsFindable(7) ? { x: helmetHome.x, y: helmetHome.y } : null;
      // the Cave System's Climbing Rope: where it lies until the Chimney has it
      if (level === 8) return enabledC && ropeHome && keyIsFindable(8) && !store.brGetFlag(LEVEL9_FLAG) ? { x: ropeHome.x, y: ropeHome.y } : null;
      // the Suburbs' House Key: in its house until Number 9's door is open
      if (level === 9) return enabledU && houseKeyHome && keyIsFindable(9) && !store.brGetFlag(LEVEL10_FLAG) ? { x: houseKeyHome.x, y: houseKeyHome.y } : null;
      if (level !== 0) return null;
      // once its door is open the key has nothing left to open: it stops showing
      return keyIsFindable(0) && !store.brGetFlag(LEVEL1_FLAG) ? { x: theKeyHome.x, y: theKeyHome.y } : null;
    },

    keyCarrier(level = 0) {
      return keyHolder[level] ?? null;
    },

    takeKey(userId) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      // keys on Levels 0 and 1; the KEYCARD on Level 4 (the same object, the
      // same rules); Levels 2 and 3 open with fuses and breakers
      if (s.level === 2 || s.level === 3) return { error: "gone" };
      const lvl = s.level;
      if (lvl === 4 && !enabledO) return { error: "gone" };
      if (lvl === 5 && (!enabledH || !boilerKeyHome)) return { error: "gone" };
      if (lvl === 6 && (!enabledL || !wheelHome)) return { error: "gone" };
      if (lvl === 7 && (!enabledT || !helmetHome)) return { error: "gone" };
      if (lvl === 8 && (!enabledC || !ropeHome)) return { error: "gone" };
      if (lvl === 9 && (!enabledU || !houseKeyHome)) return { error: "gone" };
      if (lvl !== 7 && store.brGetFlag(lvl === 0 ? LEVEL1_FLAG : lvl === 1 ? LEVEL2_FLAG : lvl === 4 ? LEVEL5_FLAG : lvl === 5 ? LEVEL6_FLAG : lvl === 6 ? LEVEL7_FLAG : lvl === 8 ? LEVEL9_FLAG : LEVEL10_FLAG)) return { error: "already_open" };
      if (!keyIsFindable(lvl)) return { error: "gone" };
      const home = lvl === 0 ? theKeyHome : lvl === 1 ? keyHomeP : lvl === 4 ? keycardHome : lvl === 5 ? boilerKeyHome! : lvl === 6 ? wheelHome! : lvl === 7 ? helmetHome! : lvl === 8 ? ropeHome! : houseKeyHome!;
      if (Math.hypot(s.x - home.x, s.y - home.y) > 2) return { error: "too_far" };
      // the walls of THIS level (losClear walks Level 0's map — it judged the
      // Poolrooms' key and Pipe Dreams' fuses against walls that aren't there)
      if (!pickupLos(s, home.x, home.y)) return { error: "too_far" };
      // No slot cost: losing the community's key to a full backpack would be
      // a miserable way to end a run.
      keyHolder[lvl] = userId;
      s.hasKey = true;
      return { ok: true };
    },

    openDoor(userId, name) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      if (s.level === 2 || s.level === 3) return { error: "too_far" };
      const lvl = s.level;
      // Level 4: THE STAIRWELL DOOR, badged with the keycard at its reader
      if (lvl === 4 && !stairDoor) return { error: "too_far" };
      // Level 5: THE RUSTY DOOR, opened with the Boiler Key
      if (lvl === 5 && !rustyDoor) return { error: "too_far" };
      // Level 6: THE SEA HATCH, opened with the Handwheel
      if (lvl === 6 && !seaHatch) return { error: "too_far" };
      // Level 7: THE SUBWAY STAIR, at the bottom of the plaza, in the helmet
      if (lvl === 7 && !subwayDoor) return { error: "too_far" };
      // Level 8: THE CHIMNEY, the rope fixed at its foot
      if (lvl === 8 && !chimneyFoot) return { error: "too_far" };
      // Level 9: THE FRONT DOOR of Number 9, the House Key turned in its lock
      if (lvl === 9 && !frontDoorSite) return { error: "too_far" };
      const door = lvl === 0 ? theDoor : lvl === 1 ? hatch : lvl === 4 ? stairDoor! : lvl === 5 ? rustyDoor! : lvl === 6 ? seaHatch! : lvl === 7 ? subwayDoor! : lvl === 8 ? chimneyFoot! : frontDoorSite!;
      const flag = lvl === 0 ? LEVEL1_FLAG : lvl === 1 ? LEVEL2_FLAG : lvl === 4 ? LEVEL5_FLAG : lvl === 5 ? LEVEL6_FLAG : lvl === 6 ? LEVEL7_FLAG : lvl === 7 ? LEVEL8_FLAG : lvl === 8 ? LEVEL9_FLAG : LEVEL10_FLAG;
      if (Math.hypot(s.x - door.x, s.y - door.y) > 2.2) return { error: "too_far" };
      // the stair is 24m down: a head above the water is not at it
      if (lvl === 7 && !atSubwayDepth(s)) return { error: "too_far" };
      // ALREADY OPEN comes before the key check: once it's open it stays open
      // forever, and standing at it without a key should read "already open",
      // never "locked — find the key" (which is what the order used to say to
      // the very person who opened it).
      if (store.brGetFlag(flag)) return { fresh: false };
      if (!s.hasKey) return { error: "no_key" };
      // a test run can carry the key to the door, but never open it for real
      if (testing.has(lvl)) return { error: "test_run" };
      const r = store.brSetFlag(flag, userId, name);
      if (r.fresh && lvl !== 7) {
        // The key has done its one job. It stays with them as a souvenir of
        // the run; the door is open for everyone, forever.
        s.hasKey = false;
        keyHolder[lvl] = null;
      }
      return { fresh: r.fresh };
    },

    hatchPos() {
      return enabledP ? { x: hatch.x, y: hatch.y } : null;
    },

    fuseSitesOpen() {
      if (!enabledD) return [];
      return fuseHomes.flatMap((f, i) => (fuseFindable(i) ? [{ i, x: f.x, y: f.y }] : []));
    },

    fuseBox() {
      if (!enabledD || !fusePanel) return null;
      const inserted = Math.min(FUSE_COUNT, fusesInserted());
      return { x: fusePanel.x, y: fusePanel.y, door: pressureDoor, inserted, total: FUSE_COUNT, open: !!store.brGetFlag(LEVEL3_FLAG) };
    },

    takeFuse(userId, i) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      if (s.level !== 2 || !Number.isInteger(i) || i < 0 || i >= fuseHomes.length) return { error: "gone" };
      if (!fuseFindable(i)) return { error: "gone" };
      const home = fuseHomes[i];
      if (Math.hypot(s.x - home.x, s.y - home.y) > 2) return { error: "too_far" };
      // the walls of THIS level (losClear walks Level 0's map — it judged the
      // Poolrooms' key and Pipe Dreams' fuses against walls that aren't there)
      if (!pickupLos(s, home.x, home.y)) return { error: "too_far" };
      // like the key: no slot, never banked
      fuseHolder[i] = userId;
      (s.fuses ??= []).push(i);
      return { ok: true, carrying: s.fuses.length };
    },

    insertFuses(userId, name) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      if (s.level !== 2 || !fusePanel) return { error: "too_far" };
      if (Math.hypot(s.x - fusePanel.x, s.y - fusePanel.y) > 2.6) return { error: "too_far" };
      if (store.brGetFlag(LEVEL3_FLAG)) {
        // a fuse looted off a body after the door opened has nowhere to go:
        // the box takes it so the "take it to the fuse box" chip stops
        // coming back (Nov 2026 validation run)
        if (!testing.has(2)) {
          for (const f of s.fuses ?? []) fuseHolder[f] = null;
          s.fuses = [];
        }
        return { inserted: FUSE_COUNT, added: 0, opened: false };
      }
      if (!(s.fuses ?? []).length) return { error: "no_fuse" };
      // a test run can carry fuses to the box, but never put them in for real
      if (testing.has(2)) return { error: "test_run" };
      // Only as many as the box has room for: three slots, ten fuses. A
      // runner carrying more than the box needs keeps nothing — the spares
      // go with the box filling (fuseFindable says so for good).
      let added = 0;
      for (const f of s.fuses ?? []) {
        if (fusesInserted() < FUSE_COUNT && store.brSetFlag(fuseFlag(f), userId, name).fresh) added++;
        fuseHolder[f] = null;
      }
      s.fuses = [];
      const inserted = Math.min(FUSE_COUNT, fusesInserted());
      let opened = false;
      if (inserted >= FUSE_COUNT) opened = store.brSetFlag(LEVEL3_FLAG, userId, name).fresh;
      return { inserted, added, opened };
    },

    level3() {
      return store.brGetFlag(LEVEL3_FLAG);
    },

    level1() {
      return store.brGetFlag(LEVEL1_FLAG);
    },

    forfeit(userId) {
      const s = sessions.get(userId);
      if (!s) return false;
      // Same consequences as any death — you don't get to bank the run by
      // quitting (the pause menu says so before it fires).
      killPlayer(s, "their own hand");
      return true;
    },

    markDisconnected(userId) {
      const s = sessions.get(userId);
      if (!s || s.lostAt) return;
      s.lostAt = Date.now();
    },

    setFly(userId, on) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      // The DB is the authority on who is an admin, not the socket, not a
      // flag on the wire. Everything else here trusts its caller; this doesn't.
      if (!store.getUserById(userId)?.isAdmin) return { error: "forbidden" };
      // LANDING is refused over a wall, sealed scenery or a shaft — normal
      // movement could never get the admin out of such a cell. The client
      // checks first and says why; this is the server keeping the same rule
      // (Oct 2026: it was client-only, so a stale client could strand you).
      if (s.fly && !on) {
        const sec = secBy(s.level);
        const cx = Math.floor(s.x), cy = Math.floor(s.y);
        if (!cellWalkable(sec, cx, cy) || isPitCell(sec, cx, cy)) return { error: "bad_landing" };
      }
      s.fly = !!on;
      // Landing puts you back on the floor of whatever cell you're over, so a
      // ghost can't step out of the sky into a shaft and take a fall for it.
      return { fly: s.fly };
    },

    resetWorld(deep = false) {
      // Only a CONNECTED player blocks a reset. Since a dropped socket now
      // freezes a run for two minutes instead of ending it, counting frozen
      // sessions here would lock the button for two minutes after the last
      // person closed the game — which is exactly when an operator wants it.
      // Anyone still frozen is forfeited first: they were going to die when
      // their window ran out anyway, and this only brings it forward.
      if ([...sessions.values()].some((s) => !s.lostAt)) return { error: "players_inside" };
      // a test play has the live map stashed: a reset now would wipe the
      // test's sector and the test's end would put the old one back
      if (testing.size) return { error: "level_testing" };
      // Frozen runs are VOIDED, not killed. Killing them would drop bodies the
      // wipe is about to erase anyway, which would quietly destroy a tester's
      // gear as a side effect of pressing a map button — and this is the one
      // action in the game that only an operator can take, so it cannot be
      // abused as an escape. The run simply never happened; the loadout stays
      // in the locker it came from — and its relics come home, as swapMap's
      // void does (Oct 2026 review: sessions.clear() lost them for good).
      for (const [id, q] of [...sessions]) {
        for (const slug of q.relics) if (!store.brUnlockRelic(id, slug)) store.brForceAddItem(id, "relic", slug);
        endRun(id);
      }
      const out = store.brResetWorld(sectorIdA, deep);
      // The Poolrooms wipe with the same button: its fog/marks/drops rows are
      // scoped under P1 (the global tables were already cleared above).
      store.brResetWorld(sectorIdP, false);
      // …and Pipe Dreams and the station (Pipe Dreams' used to be missed)
      store.brResetWorld(sectorIdD, false);
      store.brResetWorld(sectorIdS, false);
      store.brResetWorld(sectorIdO, false);
      store.brResetWorld(sectorIdH, false);
      store.brResetWorld(sectorIdL, false);
      store.brResetWorld(sectorIdT, false);
      store.brResetWorld(sectorIdC, false);
      store.brResetWorld(sectorIdU, false);
      fog.fill(0);
      fogP.fill(0);
      fogD.fill(0);
      fogS.fill(0);
      fogO.fill(0);
      fogH.fill(0);
      fogL.fill(0);
      fogT.fill(0);
      fogC.fill(0);
      fogU.fill(0);
      fogDirty.fill(false);
      corpses.length = 0;
      drops.length = 0;
      // THE RESEARCH ARCHIVE IS NOT MAP STATE. Recovered drives and the door
      // to Level 1 are the community's history — they survive an ordinary wipe
      // by design ("the archive only ever grows; there are no resets"). Only
      // the drives still OUT THERE are re-derived, and the key becomes
      // findable again because the bodies holding it just went.
      //
      // A DEEP reset is the exception, and exists purely so the discovery loop
      // can be TESTED: it puts every drive back in the world, relocks Level 1,
      // and empties everyone's relic collection. Nothing else in the game can
      // take an unlocked relic away.
      if (deep) for (const lvl of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as BrLevel[]) placeDrives(lvl, true);
      keyHolder.fill(null);
      fuseHolder.fill(null);
      // Fresh treasure for a fresh world.
      relicSites.length = 0;
      relicSitesP.length = 0;
      relicSitesD.length = 0;
      relicSitesS.length = 0;
      relicSitesO.length = 0;
      relicSitesH.length = 0;
      relicSitesL.length = 0;
      relicSitesT.length = 0;
      relicSitesC.length = 0;
      relicSitesU.length = 0;
      spawnRelic();
      spawnRelic();
      spawnRelicP();
      spawnRelicP();
      spawnRelicD();
      spawnRelicD();
      spawnRelicS();
      spawnRelicS();
      spawnRelicO();
      spawnRelicO();
      spawnRelicH();
      spawnRelicH();
      spawnRelicL();
      spawnRelicL();
      spawnRelicT();
      spawnRelicT();
      spawnRelicC();
      spawnRelicC();
      spawnRelicU();
      spawnRelicU();
      for (let k = 0; k < BATTERY_LOOSE; k++) spawnBattery();
      deepWatch.clear();
      for (const b of burrowers) burrowerCb?.({ type: "gone", id: b.id });
      burrowers = [];
      burrowSpared.clear();
      cutUntil.fill(0);
      darkUntil.fill(0);
      entsPlaced = false;
      stalker.placed = false;
      seatSpawners(0);
      seatSpawners(1);
      seatSpawners(2);
      seatSpawners(3);
      seatSpawners(4);
      seatSpawners(5);
      seatSpawners(6);
      seatSpawners(7);
      seatSpawners(8);
      seatSpawners(9);
      for (const w of watchers) watchCb?.({ type: "gone", id: w.id });
      watchers = [];
      stalker.mode = "shadow";
      stalker.path = [];
      for (const e of ents) {
        e.mode = "patrol";
        e.path = [];
        e.homeRelic = -1;
        e.restUntil = 0;
        e.stimulus = null;
      }
      return out;
    },

    lootView(userId, corpseId) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      const c = corpses.find((k) => k.id === corpseId);
      if (!c || c.lvl !== s.level) return { error: "gone" };
      if (Math.hypot(s.x - c.x, s.y - c.y) > 2) return { error: "too_far" };
      if (!pickupLos(s, c.x, c.y)) return { error: "too_far" };
      return { name: c.name, items: c.items };
    },

    lootTake(userId, corpseId, idx) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      const c = corpses.find((k) => k.id === corpseId);
      if (!c || c.lvl !== s.level) return { error: "gone" };
      if (Math.hypot(s.x - c.x, s.y - c.y) > 2) return { error: "too_far" };
      if (!pickupLos(s, c.x, c.y)) return { error: "too_far" };
      const item = c.items[idx];
      if (!item) return { error: "gone" };
      // Capacity: worn kinds don't take a slot; relics count as carried; THE
      // KEY never costs a slot.
      const cap = s.inventory.some((i) => i.kind === "backpack") ? 9 : 5;
      const carried =
        s.inventory.filter((i) => i.kind !== "backpack" && i.kind !== "suit").length + s.relics.length;
      const worn = item.kind === "suit" || item.kind === "backpack" || item.kind === "key" || item.kind === "fuse";
      if (!worn && carried >= cap) return { error: "no_space" };
      // LAW 4 holds on a body too: a relic you already have (banked or in
      // hand) stays where it lies until you have found all ten of its level.
      if (item.kind === "relic" && item.color) {
        const lvl = relicLevel(item.color);
        if (lvl >= 0) {
          const missing = relicsMissing(userId, lvl as BrLevel);
          if (missing.length && !missing.includes(item.color)) return { error: "already_have" };
        }
      }
      c.items.splice(idx, 1);
      let newId = 0;
      if (item.kind === "key") {
        // Looting a dead runner's key: the hunt continues in your hands.
        keyHolder[s.level] = userId;
        s.hasKey = true;
      } else if (item.kind === "fuse") {
        const f = Number(item.color);
        fuseHolder[f] = userId;
        (s.fuses ??= []).push(f);
      } else if (item.kind === "relic") {
        s.relics.push(item.color ?? "");
        mirrorCarried();
      } else {
        newId = store.brForceAddItem(userId, item.kind, item.color, item.level);
        s.inventory.push({ id: newId, kind: item.kind, level: item.level, color: item.color });
      }
      if (c.items.length === 0) {
        store.brDeleteCorpse(c.id);
        corpses.splice(corpses.indexOf(c), 1);
      } else {
        store.brSetCorpseItems(c.id, c.items);
      }
      // the gear's real locker id rides back (Oct 2026 review): the client
      // made one up, so looted gear couldn't be dropped or used and read empty
      return { item: newId ? { ...item, id: newId } : item, remaining: c.items.length ? c.items : [] };
    },

    setImmortal(userId, on) {
      if (on) immortals.add(userId);
      else immortals.delete(userId);
    },

    summonEntity(nearUserId) {
      const s = sessions.get(nearUserId);
      if (!s || s.level !== 0) return false;
      // ~10m (5 cells) away, at a walkable cell — and it COMES: chase
      // targeting with a fresh grace window, so it paths straight to you
      // and locks on properly once it has line of sight.
      for (let tries = 0; tries < 60; tries++) {
        const a = Math.random() * Math.PI * 2;
        const x = Math.floor(s.x + Math.cos(a) * 5);
        const y = Math.floor(s.y + Math.sin(a) * 5);
        if (!cellWalkable(sector, x, y)) continue;
        const e = ents[0];
        e.x = x + 0.5;
        e.y = y + 0.5;
        e.mode = "chase";
        e.targetId = nearUserId;
        e.lastLosAt = Date.now();
        e.lastSeenX = s.x;
        e.lastSeenY = s.y;
        e.restUntil = 0;
        e.path = [];
        e.pathAt = 0;
        entsPlaced = true;
        return true;
      }
      return false;
    },

    armSummon(userId) {
      armedSummon.add(userId);
    },

    setCam(userId, on) {
      const s = sessions.get(userId);
      if (!s) return;
      if (on && !s.inventory.some((i) => i.kind === "camera")) return;
      s.cam = on;
    },

    consumeItem(userId, itemId) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      const idx = s.inventory.findIndex((i) => i.id === itemId);
      if (idx === -1) return { error: "not_carried" };
      const kind = s.inventory[idx].kind;
      if (!["pills", "battery", "almondwater"].includes(kind)) return { error: "not_consumable" };
      s.inventory.splice(idx, 1);
      // a test run keeps your kit whole (Oct 2026 review — it was the one
      // path that still spent a real locker row); outside one, a row that is
      // already gone was never there to use
      if (!testing.has(s.level) && !store.brDeleteItems(userId, [itemId]).length) return { error: "not_carried" };
      // Health is server-authoritative since falls can kill, so PILLS mend
      // here rather than on the client's word.
      if (kind === "pills") s.hp = Math.min(100, s.hp + 50);
      // THE HEAT: almond water is the one thing that cools you below stairs
      if (kind === "almondwater" && s.level === 5) {
        s.heat = Math.max(0, (s.heat ?? 0) - ALMOND_COOL);
        heatCb?.({ userId: s.userId, heat: Math.round(s.heat) });
        lastHeatSent.set(s.userId, Math.round(s.heat));
      }
      return { kind, hp: s.hp };
    },

    operatorView(level) {
      // LAW 4: a site is no particular relic until it is picked up (it is
      // rolled then, from what the picker is missing), so it is shown as one
      const relicName = (_r: { relicId: string }) => "RELIC";
      const mode = (m: string) => (m === "chase" ? "chase" : m);
      const v: OperatorView = { level, monsters: [], relics: [], drives: [], objectives: [], bodies: [] };
      // LAW 7: the admin sees an objective where it actually IS — in somebody's
      // hands, or on a body — not at the home it would return to.
      type Where = { x: number; y: number; state: string };
      const whereIs = (home: { x: number; y: number }, holder: number | null, onBody: (i: BrCorpseItem) => boolean, idle: string): Where => {
        const h = holder !== null ? sessions.get(holder) : undefined;
        if (h) return { x: h.x, y: h.y, state: `carried by ${h.name}` };
        const body = corpses.find((c) => c.lvl === level && c.items.some(onBody));
        if (body) return { x: body.x, y: body.y, state: `on ${body.name}'s body` };
        return { x: home.x, y: home.y, state: idle };
      };
      for (const c of corpses) {
        if (c.lvl !== level) continue;
        v.bodies.push({ id: c.id, name: c.name, x: c.x, y: c.y, items: c.items.length, carriesObjective: c.items.some((i) => i.kind === "key" || i.kind === "fuse") });
      }
      for (const e of spawned) if (e.level === level) v.monsters.push({ kind: "entity", id: e.id, x: e.x, y: e.y, mode: mode(e.mode) });
      if (level === 0) {
        if (entsPlaced) for (const e of ents) v.monsters.push({ kind: "entity", id: e.id, x: e.x, y: e.y, mode: mode(e.mode) });
        if (stalker.placed) v.monsters.push({ kind: "stalker", id: 0, x: stalker.x, y: stalker.y, mode: stalker.mode });
        v.relics = relicSites.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drives.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        {
          const used = !!store.brGetFlag(LEVEL1_FLAG);
          const w = used ? { x: theKeyHome.x, y: theKeyHome.y, state: "used" } : whereIs(theKeyHome, keyHolder[0], (i) => i.kind === "key", "lying");
          v.objectives.push({ kind: "key", label: "THE KEY", ...w });
        }
        v.objectives.push({ kind: "door", label: "THE DOOR", x: theDoor.x, y: theDoor.y, state: store.brGetFlag(LEVEL1_FLAG) ? "open" : "locked" });
      } else if (level === 1) {
        if (shy.live) v.monsters.push({ kind: "shy", id: 0, x: shy.x, y: shy.y, mode: shy.mode as string });
        for (const g of gators) v.monsters.push({ kind: "gator", id: g.id, x: g.x, y: g.y, mode: g.mode as string });
        v.relics = relicSitesP.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesP.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (enabledP) {
          const landing = sectorP.doors[0];
          if (landing) v.objectives.push({ kind: "landing", label: "THE LANDING", x: landing.x + 0.5, y: landing.y + 0.5, state: "open" });
          const used = !!store.brGetFlag(LEVEL2_FLAG);
          const w = used ? { x: keyHomeP.x, y: keyHomeP.y, state: "used" } : whereIs(keyHomeP, keyHolder[1], (i) => i.kind === "key", "lying");
          v.objectives.push({ kind: "key", label: "THE POOLROOMS' KEY", ...w });
          v.objectives.push({ kind: "hatch", label: "THE DRAIN HATCH", x: hatch.x, y: hatch.y, state: store.brGetFlag(LEVEL2_FLAG) ? "open" : "locked" });
        }
      } else if (level === 3) {
        if (bleeder.live) v.monsters.push({ kind: "bleeder", id: 0, x: bleeder.x, y: bleeder.y, mode: bleeder.mode as string });
        v.relics = relicSitesS.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesS.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        const p = powerState();
        for (const b of breakerSites) v.objectives.push({ kind: "breaker", label: `BREAKER ${b.section}`, x: b.x, y: b.y, state: breakerOn(b.section) ? "on" : "off" });
        for (const c of cutoffSites) v.objectives.push({ kind: "cutoff", label: `CUTOFF ${c.section}`, x: c.x, y: c.y, state: p[c.section - 1]?.cutMs ? "cut" : p[c.section - 1]?.powered ? "live" : "dark" });
        if (shutterSite) v.objectives.push({ kind: "shutter", label: "THE LIFT SHUTTER", x: shutterSite.x, y: shutterSite.y, state: store.brGetFlag(LEVEL4_FLAG) ? "open" : `${breakerSites.filter((b) => breakerOn(b.section)).length}/${BREAKER_COUNT}` });
        const door = sectorS.doors[0];
        if (door) v.objectives.push({ kind: "landing", label: "THE PRESSURE DOOR", x: door.x + 0.5, y: door.y + 0.5, state: "open" });
      } else if (level === 4) {
        if (temp.live) v.monsters.push({ kind: "temp", id: 0, x: temp.x, y: temp.y, mode: temp.standUntil ? "standing over a body" : temp.moving ? "moving" : "still" });
        v.relics = relicSitesO.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesO.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (enabledO) {
          const lift = sectorO.doors[0];
          if (lift) v.objectives.push({ kind: "lift", label: "THE LIFT", x: lift.x + 0.5, y: lift.y + 0.5, state: "open" });
          const used = !!store.brGetFlag(LEVEL5_FLAG);
          const w = used ? { x: keycardHome.x, y: keycardHome.y, state: "used" } : whereIs(keycardHome, keyHolder[4], (i) => i.kind === "key", "lying");
          v.objectives.push({ kind: "keycard", label: "THE KEYCARD", ...w });
          if (stairDoor) v.objectives.push({ kind: "stairdoor", label: "THE STAIRWELL DOOR", x: stairDoor.x, y: stairDoor.y, state: used ? "open" : "locked" });
        }
      } else if (level === 5) {
        for (const w of swarms) v.monsters.push({ kind: "moths", id: w.id, x: w.x, y: w.y, mode: w.mode });
        v.relics = relicSitesH.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesH.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (enabledH) {
          const stair = sectorH.doors[0];
          if (stair) v.objectives.push({ kind: "stair", label: "THE SERVICE STAIR", x: stair.x + 0.5, y: stair.y + 0.5, state: "open" });
          const h = sectorH.hotel;
          const named = h && h.target >= 0 ? h.suites[h.target] : null;
          if (registerSite) v.objectives.push({ kind: "register", label: "THE GUEST REGISTER", x: registerSite.x, y: registerSite.y, state: named ? `names No. ${named.number}` : "blank" });
          const used = !!store.brGetFlag(LEVEL6_FLAG);
          if (boilerKeyHome) {
            const w = used ? { x: boilerKeyHome.x, y: boilerKeyHome.y, state: "used" } : whereIs(boilerKeyHome, keyHolder[5], (i) => i.kind === "key", "on its hook");
            v.objectives.push({ kind: "boilerkey", label: named ? `THE BOILER KEY (No. ${named.number})` : "THE BOILER KEY", ...w });
          }
          if (rustyDoor) v.objectives.push({ kind: "rustydoor", label: RUSTYDOOR_NAME.toUpperCase(), x: rustyDoor.x, y: rustyDoor.y, state: used ? "open" : "locked" });
          for (const l of hotelLifts) v.objectives.push({ kind: "lift", label: "A LIFT", x: l.x, y: l.y, state: "running" });
        }
      } else if (level === 6) {
        for (const l of listeners) v.monsters.push({ kind: "listener", id: l.id, x: l.x, y: l.y, mode: l.mode });
        v.relics = relicSitesL.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesL.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (enabledL) {
          const stair = sectorL.doors[0];
          if (stair) v.objectives.push({ kind: "stair", label: "THE STAIR", x: stair.x + 0.5, y: stair.y + 0.5, state: "open" });
          const used = !!store.brGetFlag(LEVEL7_FLAG);
          if (wheelHome) {
            const w = used ? { x: wheelHome.x, y: wheelHome.y, state: "used" } : whereIs(wheelHome, keyHolder[6], (i) => i.kind === "key", "lying");
            v.objectives.push({ kind: "handwheel", label: "THE HANDWHEEL", ...w });
          }
          if (seaHatch) v.objectives.push({ kind: "seahatch", label: SEAHATCH_NAME.toUpperCase(), x: seaHatch.x, y: seaHatch.y, state: used ? "open" : "locked" });
        }
      } else if (level === 7) {
        // THE THING BELOW: under whoever it has noticed, or asleep in the Drop
        const noticed = [...deepWatch.entries()].filter(([, w]) => w.stage > 0).sort((a, b) => b[1].exposure - a[1].exposure);
        const target = noticed.length ? sessions.get(noticed[0][0]) : undefined;
        if (target && noticed.length) {
          const w = noticed[0][1];
          v.monsters.push({ kind: "deep", id: 0, x: target.x, y: target.y, mode: w.risingUntil ? "rising" : w.stage >= 2 ? "circling" : "noticed" });
        } else v.monsters.push({ kind: "deep", id: 0, x: 3, y: sectorT.size / 2, mode: "asleep" });
        v.relics = relicSitesT.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesT.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (enabledT) {
          const hatchIn = sectorT.doors[0];
          if (hatchIn) v.objectives.push({ kind: "stair", label: "THE HATCH", x: hatchIn.x + 0.5, y: hatchIn.y + 0.5, state: "open" });
          if (helmetHome) v.objectives.push({ kind: "helmet", label: HELMET_NAME.toUpperCase(), ...whereIs(helmetHome, keyHolder[7], (i) => i.kind === "key", "lying") });
          if (subwayDoor) v.objectives.push({ kind: "subway", label: SUBWAY_NAME.toUpperCase(), x: subwayDoor.x, y: subwayDoor.y, state: store.brGetFlag(LEVEL8_FLAG) ? "open" : "locked" });
        }
      } else if (level === 8) {
        // THE BURROWERS, each where it is and what it's doing
        for (const b of burrowers) v.monsters.push({ kind: "burrower", id: b.id, x: b.x, y: b.y, mode: b.mode });
        v.relics = relicSitesC.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesC.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (enabledC) {
          const stairIn = sectorC.doors[0];
          if (stairIn) v.objectives.push({ kind: "stair", label: "THE SUBWAY STAIR", x: stairIn.x + 0.5, y: stairIn.y + 0.5, state: "open" });
          const used = !!store.brGetFlag(LEVEL9_FLAG);
          if (ropeHome) {
            const w = used ? { x: chimneyFoot?.x ?? ropeHome.x, y: chimneyFoot?.y ?? ropeHome.y, state: "used" } : whereIs(ropeHome, keyHolder[8], (i) => i.kind === "key", "lying");
            v.objectives.push({ kind: "rope", label: ROPE_NAME.toUpperCase(), ...w });
          }
          if (chimneyFoot) v.objectives.push({ kind: "chimney", label: CHIMNEY_NAME.toUpperCase(), x: chimneyFoot.x, y: chimneyFoot.y, state: used ? "open" : "locked" });
        }
      } else if (level === 9) {
        // THE NEIGHBORHOOD WATCH, where it is and what it's doing
        for (const w of watchers) v.monsters.push({ kind: "watch", id: w.id, x: w.x, y: w.y, mode: w.mode });
        v.relics = relicSitesU.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesU.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (enabledU) {
          const holeIn = sectorU.doors[0];
          if (holeIn) v.objectives.push({ kind: "stair", label: "THE MANHOLE", x: holeIn.x + 0.5, y: holeIn.y + 0.5, state: "open" });
          const used = !!store.brGetFlag(LEVEL10_FLAG);
          if (houseKeyHome) {
            const w = used ? { x: frontDoorSite?.x ?? houseKeyHome.x, y: frontDoorSite?.y ?? houseKeyHome.y, state: "used" } : whereIs(houseKeyHome, keyHolder[9], (i) => i.kind === "key", "lying");
            v.objectives.push({ kind: "housekey", label: HOUSE_KEY_NAME.toUpperCase(), ...w });
          }
          if (frontDoorSite) v.objectives.push({ kind: "frontdoor", label: FRONT_DOOR_NAME.toUpperCase(), x: frontDoorSite.x, y: frontDoorSite.y, state: used ? "open" : "locked" });
        }
      } else if (level === 2) {
        v.relics = relicSitesD.map((r) => ({ x: r.x, y: r.y, name: relicName(r) }));
        v.drives = drivesD.map((d) => ({ id: d.id, x: d.x, y: d.y }));
        if (grabber.live) v.monsters.push({ kind: "grabber", id: 0, x: grabber.x, y: grabber.y, mode: grabber.mode });
        const boxFull = !!store.brGetFlag(LEVEL3_FLAG);
        fuseHomes.forEach((f, i) => {
          // once the box is full the spares are gone — nothing to show
          if (boxFull && !fuseIn(i)) return;
          const w = fuseIn(i) ? { x: f.x, y: f.y, state: "in" } : whereIs(f, fuseHolder[i], (q) => q.kind === "fuse" && q.color === String(i), "lying");
          v.objectives.push({ kind: "fuse", label: `FUSE ${i + 1}`, ...w });
        });
        if (enabledD && fusePanel) {
          const inserted = Math.min(FUSE_COUNT, fusesInserted());
          const open = !!store.brGetFlag(LEVEL3_FLAG);
          v.objectives.push({ kind: "fusebox", label: `FUSE BOX ${inserted}/${FUSE_COUNT}`, x: fusePanel.x, y: fusePanel.y, state: open ? "open" : `${inserted}/${FUSE_COUNT}` });
          if (pressureDoor) v.objectives.push({ kind: "door", label: "THE PRESSURE DOOR", x: pressureDoor.x, y: pressureDoor.y, state: open ? "open" : "locked" });
        }
      }
      return v;
    },

    debugState() {
      return {
        entities: entsPlaced
          ? ents.map((e) => {
              const h = relicSites.find((q) => q.id === e.homeRelic);
              const now = Date.now();
              return { id: e.id, x: e.x, y: e.y, mode: e.mode === "chase" ? "chase" : "wander", home: h ? { x: h.x, y: h.y } : null, resting: now < e.restUntil, heard: !!e.stimulus && now - e.stimulus.at < 12_000 };
            })
          : [],
        spawned: spawned.map((e) => ({ id: e.id, level: e.level, x: e.x, y: e.y, mode: e.mode === "chase" ? "chase" : "wander" })),
        relics: relicSites.map((r) => ({
          x: r.x,
          y: r.y,
          name: relicBySlug(r.relicId)?.name ?? r.relicId,
        })),
        stalker: stalker.placed ? { x: stalker.x, y: stalker.y, mode: stalker.mode, targetId: stalker.targetId } : null,
        shy: shy.live ? { x: shy.x, y: shy.y, mode: shy.mode as string, targetId: shy.targetId, pathLen: shy.path.length, noRouteSince: shy.noRouteSince, repaths: shyRepaths, partials: shyPartials } : null,
        bleeder: bleeder.live ? { x: bleeder.x, y: bleeder.y, mode: bleeder.mode as string, targetId: bleeder.targetId, burn: bleeder.burn } : null,
        grabber: grabber.live ? { x: grabber.x, y: grabber.y, mode: grabber.mode as string, targetId: grabber.targetId } : null,
        temp: temp.live ? { x: temp.x, y: temp.y, pose: temp.pose, moving: temp.moving, standing: !!temp.standUntil, targetId: temp.targetId } : null,
        gators: gators.map((g) => ({ id: g.id, x: g.x, y: g.y, h: g.h, mode: g.mode as string, targetId: g.targetId, region: g.region })),
        relicsP: relicSitesP.map((r) => ({
          x: r.x,
          y: r.y,
          name: relicBySlug(r.relicId)?.name ?? r.relicId,
        })),
        relicsD: relicSitesD.map((r) => ({
          x: r.x,
          y: r.y,
          name: relicBySlug(r.relicId)?.name ?? r.relicId,
        })),
        // Playtest visibility for the things players are supposed to hunt for:
        // the drives still out there, THE DOOR, and where THE KEY is sitting
        // (or that somebody is carrying it).
        drives: drives.map((d) => ({ id: d.id, x: d.x, y: d.y })),
        door: { x: theDoor.x, y: theDoor.y, open: !!store.brGetFlag(LEVEL1_FLAG) },
        key: { x: theKeyHome.x, y: theKeyHome.y, held: !keyIsFindable(0) },
        hatch: { x: hatch.x, y: hatch.y, open: !!store.brGetFlag(LEVEL2_FLAG) },
        keyP: { x: keyHomeP.x, y: keyHomeP.y, held: !keyIsFindable(1) },
        fuses: fuseHomes.map((f, i) => ({ x: f.x, y: f.y, state: fuseIn(i) ? "in" : fuseFindable(i) ? "lying" : "carried" })),
        fuseBox: fusePanel,
      };
    },

    relicsLeft(userId, level) {
      return relicsMissing(userId, level).length;
    },

    directorState() {
      return {
        on: directorOn,
        phase: director.phase,
        tension: [...director.tension].map(([id, t]) => ({ id, t: Math.round(t) })),
        log: director.log.slice(0, 15),
      };
    },

    directorTick(now) {
      return directorTick(now);
    },

    researchHints(userId) {
      // Only levels a MEMBER can walk into today — the admin's flycam rights
      // don't make a locked level worth hinting at.
      const open: BrLevel[] = [];
      if (enabled) open.push(0);
      if (enabledP && store.brGetFlag(LEVEL1_FLAG)) open.push(1);
      if (enabledD && store.brGetFlag(LEVEL2_FLAG)) open.push(2);
      if (enabledS && store.brGetFlag(STATION_OPEN_FLAG)) open.push(3);
      if (enabledO && store.brGetFlag(OFFICE_OPEN_FLAG)) open.push(4);
      if (enabledH && store.brGetFlag(HOTEL_OPEN_FLAG)) open.push(5);
      if (enabledL && store.brGetFlag(LIGHTS_OPEN_FLAG)) open.push(6);
      if (enabledT && store.brGetFlag(OCEAN_OPEN_FLAG)) open.push(7);
      if (enabledC && store.brGetFlag(CAVE_OPEN_FLAG)) open.push(8);
      if (enabledU && store.brGetFlag(SUBURBS_OPEN_FLAG)) open.push(9);
      const out: string[] = [];
      for (const lvl of open) {
        const sites = relicSitesOf(lvl);
        if (sites.length && relicsMissing(userId, lvl).length) {
          const r = sites[0];
          out.push(`a relic you haven't logged lies in ${placeHint(secBy(lvl), lvl, r.x, r.y)}`);
        }
      }
      for (const lvl of open) {
        const d = driveLists[lvl]?.[0];
        if (d) out.push(`an unread data drive is somewhere in ${placeHint(secBy(lvl), lvl, d.x, d.y)}`);
      }
      return out.slice(0, 3);
    },

    takeRelic(userId, id) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      const sites = relicSitesOf(s.level);
      const idx = sites.findIndex((r) => r.id === id);
      if (idx === -1) return { error: "gone" };
      const site = sites[idx];
      if (Math.hypot(s.x - site.x, s.y - site.y) > 2) return { error: "too_far" };
      if (!pickupLos(s, site.x, site.y)) return { error: "too_far" };
      const cap = s.inventory.some((i) => i.kind === "backpack") ? 9 : 5;
      const carried = s.inventory.filter((i) => i.kind !== "backpack" && i.kind !== "suit").length + s.relics.length;
      if (carried >= cap) return { error: "no_space" };
      sites.splice(idx, 1);
      // LAW 4 (Josh, Oct 2026 — "cannot pick it up again until they gather all
      // 10 relics from that level"). A site is shared and anonymous; WHICH
      // relic it is gets decided now, for the one who picked it up: one of the
      // level's they have still to find, or — once they have all ten — any.
      const missing = relicsMissing(userId, s.level);
      const pool = missing.length ? missing : levelRelics(s.level).map((r) => r.slug);
      const slug = pool.length ? pool[randomInt(pool.length)] : site.relicId;
      s.relics.push(slug);
      mirrorCarried();
      const def = relicBySlug(slug);
      return { relicId: slug, name: def?.name ?? slug, test: testing.has(s.level) };
    },

    onHurt(cb) {
      hurtCb = cb;
    },
    onDeath(cb) {
      deathCb = cb;
    },

    boats() {
      validateBoatSeats();
      return boats.map((b) => ({ ...b }));
    },

    boardBoat(userId, boatId) {
      const s = sessions.get(userId);
      if (!s || s.level !== 1) return { error: "not_here" };
      if (s.boatId !== null) return { error: "already_aboard" };
      validateBoatSeats();
      const b = boatById(boatId);
      if (!b) return { error: "no_boat" };
      if (Math.hypot(b.x - s.x, b.y - s.y) > 3.2) return { error: "too_far" };
      // boarding moves the body onto the boat, so never through a wall
      // (Oct 2026 review)
      if (!pickupLos(s, b.x, b.y)) return { error: "too_far" };
      let seat: "captain" | "passenger";
      if (b.captain === null) {
        b.captain = userId;
        seat = "captain";
      } else if (b.passenger === null) {
        b.passenger = userId;
        seat = "passenger";
      } else {
        return { error: "boat_full" };
      }
      s.boatId = b.id;
      s.subSince = null; // aboard = breathing
      s.x = b.x;
      s.y = b.y;
      return { ok: true, seat, boat: { ...b } };
    },

    leaveBoat(userId) {
      const s = sessions.get(userId);
      if (!s || s.boatId === null) return { error: "not_aboard" };
      const b = boatById(s.boatId);
      s.boatId = null;
      if (!b) return { error: "no_boat" };
      if (b.captain === userId) {
        b.captain = b.passenger; // hand the oars over
        b.passenger = null;
      } else if (b.passenger === userId) {
        b.passenger = null;
      }
      return { ok: true, boat: { ...b } };
    },

    boatFor(userId) {
      const s = sessions.get(userId);
      if (!s || s.boatId === null) return null;
      const b = boatById(s.boatId);
      return b && b.captain === userId ? b : null;
    },

    setSubmerged(userId, sub) {
      const s = sessions.get(userId);
      if (!s || s.fly || s.boatId !== null) return; // a boat rider never drowns
      if (!sub) {
        s.subSince = null;
        return;
      }
      // Only accepted where drowning is physically possible: a swim-deep
      // cell of a wet world. Everywhere else the report is ignored.
      const sec = secOf(s);
      const i = Math.floor(s.y) * sec.size + Math.floor(s.x);
      const wl = sec.water?.[i] ?? WATER_NONE;
      if (wl === WATER_NONE || wl - sec.floor[i] < SWIM_DEPTH_STEPS) return;
      if (s.subSince === null) s.subSince = Date.now();
    },

    hpOf(userId) {
      return sessions.get(userId)?.hp ?? 0;
    },

    heal(userId, amount) {
      const s = sessions.get(userId);
      if (!s) return 0;
      s.hp = Math.max(0, Math.min(100, s.hp + amount));
      return s.hp;
    },

    startEntity(cb) {
      entityCb = cb;
      const t = setInterval(() => {
        // Work first, heartbeat only on success (the guardedTick rule): a
        // throw in one brain used to skip the other three for the tick and
        // reach the process-level handler with the health screen still
        // green (Sep 2026 review).
        try {
          entityTick();
          spawnedTick();
          stalkerTick();
          shyTick();
          gatorTick();
          bleederTick();
          grabberTick();
          tempTick();
          mothTick();
          listenerTick();
          burrowerTick();
          watchTick();
          heartbeat("backroomsEntity", ENT_TICK_MS * 40);
        } catch (e) {
          console.error("[backrooms] creature tick failed:", e);
          store.recordError("server", e instanceof Error ? e.message : String(e), e instanceof Error ? (e.stack ?? null) : null, "backrooms:creatures", null);
        }
      }, ENT_TICK_MS);
      t.unref?.();
    },

    onStalker(cb) {
      stalkerCb = cb;
    },

    onShy(cb) {
      shyCb = cb;
    },

    onBleeder(cb) {
      bleederCb = cb;
    },

    onGrabber(cb) {
      grabberCb = cb;
    },

    summonGrabber(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 2 || !enabledD || !GRABBER_LIVE) return false;
      if (grabber.live) grabGone(Date.now(), false);
      const inside = [...sessions.values()].filter((o) => o.level === 2 && !o.fly);
      if (!grabPlaceBehind(q, inside)) return false;
      grabBegin(q, Date.now());
      return true;
    },

    summonBleeder(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 3 || !enabledS) return false;
      const inside = [...sessions.values()].filter((o) => o.level === 3 && !o.fly);
      const was = bleeder.summoned;
      bleeder.summoned = true; // this visit ignores the light
      if (!bleederPlaceNear(q, inside)) {
        bleeder.summoned = was;
        return false;
      }
      bleeder.restUntil = 0;
      bleederOut(q, Date.now());
      return true;
    },

    onTemp(cb) {
      tempCb = cb;
    },

    summonTemp(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 4 || !enabledO) return false;
      const inside = [...sessions.values()].filter((o) => o.level === 4 && !o.fly && !o.lostAt);
      // round the corner from YOU: out of everyone's sight, near you
      for (let tries = 0; tries < 300; tries++) {
        const a = rng() * Math.PI * 2;
        const d = 6 + rng() * 8;
        const x = Math.floor(q.x + Math.cos(a) * d);
        const y = Math.floor(q.y + Math.sin(a) * d);
        if (x < 2 || y < 2 || x >= sectorO.size - 2 || y >= sectorO.size - 2) continue;
        if (whyNoCreature(sectorO, x, y, "walker") || tempShuns(x, y)) continue;
        if (inside.some((o) => lineWalkableIn(sectorO, o.x, o.y, x + 0.5, y + 0.5))) continue;
        if (!findPathIn(sectorO, x + 0.5, y + 0.5, q.x, q.y, tempShuns, false, undefined, true).length) continue;
        temp.x = x + 0.5;
        temp.y = y + 0.5;
        temp.h = Math.atan2(q.x - temp.x, q.y - temp.y);
        temp.live = true;
        temp.moving = false;
        temp.path = [];
        temp.targetId = q.userId;
        temp.standUntil = 0;
        temp.restUntil = 0;
        return true;
      }
      return false;
    },

    onGator(cb) {
      gatorCb = cb;
    },

    shyLook(userId) {
      shySeenBy(sessions.get(userId), Date.now());
    },

    summonShy(userId) {
      const s = sessions.get(userId);
      if (!s || s.level !== 1) return false;
      const inside = [...sessions.values()].filter((o) => o.level === 1 && !o.fly);
      if (!shyPlaceNear(s, inside)) return false;
      const now = Date.now();
      shy.live = true;
      shy.mode = "lurk";
      shy.targetId = s.userId;
      shy.path = [];
      shy.pathAt = 0;
      shy.stareSince = 0;
      shy.summoned = true; // this visit ignores the relic rule
      shy.lurkUntil = now + SHY_LURK_MIN + rng() * (SHY_LURK_MAX - SHY_LURK_MIN);
      return true;
    },

    entityHears(x, y, rangeCells, level = 0) {
      // Lights Out: voices and radios carry LISTEN.voice to the Listener
      if (level === 6) listenerHear(x, y, LISTEN.voice);
      // the Cave System: a voice in the passages carries to the Burrowers
      if (level === 8) burrowHear(x, y, HEAR.voice);
      for (const e of [...(level === 0 ? ents : []), ...spawned.filter((q) => q.level === level)]) {
        if (e.mode !== "patrol") continue;
        if (Math.hypot(e.x - x, e.y - y) > rangeCells) continue;
        e.stimulus = { x, y, at: Date.now() };
      }
    },

    onBrownout(cb) {
      brownoutCb = cb;
    },
    brownoutRemaining() {
      return Math.max(0, brownoutEnd - Date.now());
    },
    brownoutBlack() {
      return brownoutIsBlack;
    },
    triggerBrownout(ms, black = false) {
      return fireBrownout(Math.max(4_000, Math.min(90_000, Math.round(ms ?? (black ? 40_000 : 18_000)))), black);
    },

    enter(userId, name, door, loadout, level = 0) {
      if (!enabled) return { error: "backrooms_offline" };
      const test = testing.get(level);
      if (test && test.by !== userId) return { error: "level_testing" };
      // (a standing run on another level resumes instead — that isn't arriving)
      // THE POOLROOMS: shut until THE DOOR is opened — EXCEPT to the admin, like
      // Pipe Dreams below (Josh, Oct 2026: "as the admin i am able to fly in
      // every map"). The operator walks every level before anyone can reach it.
      if (level === 1 && !test) {
        if (!enabledP) return { error: "pools_locked" };
        if (!store.brGetFlag(LEVEL1_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "pools_locked" };
      }
      // PIPE DREAMS: shut until its door is opened — EXCEPT to the admin, who
      // playtests every level before anyone can reach it (Josh, Sep 2026).
      if (level === 2) {
        if (!enabledD) return { error: "pipes_offline" };
        if (!store.brGetFlag(LEVEL2_FLAG) && !store.getUserById(userId)?.isAdmin) return { error: "pipes_locked" };
      }
      // THE SHIP GATES (Levels 3-8). A level is open to members when its ship
      // gate's switch is on — and that alone (Josh, Oct 2026: "when I flip a
      // level's ship gate open, members should be able to walk in right away").
      // It used to also need the previous level's way down opened on a real
      // run, so a gate flipped for members to TEST a level still refused them.
      // The way-in flag still decides whether the level above's door is open
      // to walk through; a level entered from the hub opens nothing below it.
      // The admin walks every level before anyone can, gate or no gate.
      // THE ELECTRICAL STATION:
      if (level === 3 && !test) {
        if (!enabledS) return { error: "station_offline" };
        const open = store.brGetFlag(STATION_OPEN_FLAG);
        if (!open && !store.getUserById(userId)?.isAdmin) return { error: "station_locked" };
      }
      // THE ABANDONED OFFICE: shut until the station's six breakers are on AND
      // its own ship gate's switch is on — the admin excepted, as ever.
      if (level === 4 && !test) {
        if (!enabledO) return { error: "office_offline" };
        const open = store.brGetFlag(OFFICE_OPEN_FLAG);
        if (!open && !store.getUserById(userId)?.isAdmin) return { error: "office_locked" };
      }
      // THE TERROR HOTEL: shut until the keycard has opened the stairwell door
      // AND its own ship gate's switch is on — the admin excepted, as ever.
      if (level === 5 && !test) {
        if (!enabledH) return { error: "hotel_offline" };
        const open = store.brGetFlag(HOTEL_OPEN_FLAG);
        if (!open && !store.getUserById(userId)?.isAdmin) return { error: "hotel_locked" };
      }
      // LIGHTS OUT: shut until the Boiler Key has opened the rusty door AND
      // its own ship gate's switch is on — the admin excepted, as ever.
      if (level === 6 && !test) {
        if (!enabledL) return { error: "lights_offline" };
        const open = store.brGetFlag(LIGHTS_OPEN_FLAG);
        if (!open && !store.getUserById(userId)?.isAdmin) return { error: "lights_locked" };
      }
      // THALASSOPHOBIA: shut until the Handwheel has opened the sea hatch AND
      // its own ship gate's switch is on — the admin excepted, as ever.
      if (level === 7 && !test) {
        if (!enabledT) return { error: "ocean_offline" };
        const open = store.brGetFlag(OCEAN_OPEN_FLAG);
        if (!open && !store.getUserById(userId)?.isAdmin) return { error: "ocean_locked" };
      }
      // THE CAVE SYSTEM: shut until the helmet has opened the subway stair AND
      // its own ship gate's switch is on — the admin excepted, as ever.
      if (level === 8 && !test) {
        if (!enabledC) return { error: "cave_offline" };
        const open = store.brGetFlag(CAVE_OPEN_FLAG);
        if (!open && !store.getUserById(userId)?.isAdmin) return { error: "cave_locked" };
      }
      // THE SUBURBS: shut until their own ship gate's switch is on — the admin
      // excepted, as ever.
      if (level === 9 && !test) {
        if (!enabledU) return { error: "suburbs_offline" };
        const open = store.brGetFlag(SUBURBS_OPEN_FLAG);
        if (!open && !store.getUserById(userId)?.isAdmin) return { error: "suburbs_locked" };
      }
      // RECONNECT. A live session for this user means their socket died and
      // they came back inside the grace window — resume the run exactly where
      // it stands rather than starting a new one. This is what makes a refresh
      // (or a crash, or a deploy) survivable, and it is also why closing the
      // app is no longer an escape: the session was never ended, so it is
      // still there waiting, and so is whatever was hunting it.
      const live = sessions.get(userId);
      if (live) {
        live.lostAt = null;
        // a refreshed client starts its heat gauge at zero, and its warnings
        // from the deep at nothing: send both again (Nov 2026 validation run)
        lastHeatSent.delete(userId);
        const dw = deepWatch.get(userId);
        if (dw) dw.resend = true;
        // the client always comes back on its feet: an admin who reloaded
        // mid-flight must not stay flying on the server (invisible to the
        // creatures, the moths asleep for want of anyone to see)
        live.fly = false;
        return live;
      }
      const entrySec = secBy(level);
      if (door < 0 || door >= entrySec.doors.length) return { error: "bad_door" };
      if (onLevel(sessions, level) >= MAX_INSIDE) return { error: "full" };
      // Loadout: locker items you actually own, capped at 5 slots (9 if a
      // backpack is among them — Josh's spec). Server-side, always.
      const owned = store.brLockerItems(userId);
      const picked: BrItem[] = [];
      for (const id of [...new Set(loadout)].slice(0, 12)) {
        const item = owned.find((i) => i.id === id);
        // relics and tapes are findings for Voss's counter, not kit: carried
        // into a run they could be sold over HTTP and re-minted by a drop
        // (Oct 2026 review), so they never leave the locker
        if (item && item.kind !== "relic" && item.kind !== "tape") picked.push(item);
      }
      // No suit, no entry (Josh's rule — the yellow is not OSHA compliant).
      // Suit + backpack are WORN: they don't consume carry slots.
      if (!picked.some((i) => i.kind === "suit")) return { error: "no_suit" };
      const carried = picked.filter((i) => i.kind !== "backpack" && i.kind !== "suit");
      const cap = picked.some((i) => i.kind === "backpack") ? 9 : 5;
      if (carried.length > cap) return { error: "too_many_items" };
      const at = level !== 0
        ? { x: entrySec.doors[door].x + 0.5, y: entrySec.doors[door].y + 0.5 }
        : spawnFor(door);
      const { x, y } = arrivalSpot(level, at.x, at.y, userId);
      const s: BrSession = {
        userId,
        name,
        x,
        y,
        heading: 0,
        door,
        enteredAt: Date.now(),
        lastMoveAt: Date.now(),
        revealed: 0,
        inventory: picked,
        relics: [],
        hasKey: false,
        fuses: [],
        hp: 100,
        cam: false,
        pose: 0,
        bestShot: Infinity,
        fly: false,
        lostAt: null,
        level,
        subSince: null,
        boatId: null,
        fall: null,
      };
      sessions.set(userId, s);
      // the tester has ARRIVED only now: set before the refusals above, a
      // refused first try (no suit, the wrong door) ended the test within 3s
      // (Nov 2026 validation run)
      if (test) test.entered = true;
      s.revealed += revealAround(level, Math.floor(x), Math.floor(y));
      // Armed playtest summon: the entity spawns ~10m away and comes.
      if (armedSummon.has(userId)) {
        armedSummon.delete(userId);
        setTimeout(() => this.summonEntity(userId), 1500).unref?.();
      }
      return s;
    },

    leave(userId) {
      const s = sessions.get(userId) ?? null;
      endRun(userId);
      // Vanishing from the world (tab closed, socket died) puts THE KEY back
      // where it started — it cannot leave with you.
      if (s?.hasKey) keyHolder[s.level] = null;
      for (const f of s?.fuses ?? []) fuseHolder[f] = null;
      return s;
    },

    exit(userId) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      if ((heldUntil.get(userId) ?? 0) > Date.now()) return { error: "held" };
      if (s.level === 1) {
        // EVERY pools door is a way out, THE LANDING INCLUDED (Josh, Aug
        // 2026 — it used to be passage-only, so a direct-entry player had
        // to cross the map to leave). They're interior rooms rather than
        // wall panels, so the test is radial; the client only ever asks
        // after a deliberate E, but the radius stays generous enough that
        // the server's 10Hz view of the position can't refuse a fair one.
        const atPoolsDoor = sectorP.doors.some(
          (d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8,
        );
        if (!atPoolsDoor) return { error: "not_at_door" };
      }
      if (s.level === 2) {
        // PIPE DREAMS has ONE way in and out: the drain's ladder.
        const atDrain = sectorD.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        if (!atDrain) return { error: "not_at_door" };
      }
      if (s.level === 3) {
        // THE STATION has ONE way in and out: the pressure door you came by.
        const atDoor = sectorS.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        if (!atDoor) return { error: "not_at_door" };
      }
      if (s.level === 5) {
        // THE HOTEL has ONE way in and out: the service stair you came down.
        const atStair = sectorH.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        if (!atStair) return { error: "not_at_door" };
      }
      let home = false;
      if (s.level === 9) {
        // THE SUBURBS: the manhole you climbed out of — or, once the House
        // Key has opened it, NUMBER 9'S FRONT DOOR, which is the way out of
        // the Backrooms for good.
        const atHole = sectorU.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        const atFront = !!frontDoorSite && !!store.brGetFlag(LEVEL10_FLAG) && Math.hypot(s.x - frontDoorSite.x, s.y - frontDoorSite.y) <= 2.4;
        if (!atHole && !atFront) return { error: "not_at_door" };
        home = atFront && !atHole;
      }
      if (s.level === 8) {
        // THE CAVE SYSTEM has ONE way in and out: the subway stair you came down.
        const atStair = sectorC.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        if (!atStair) return { error: "not_at_door" };
      }
      if (s.level === 7) {
        // THALASSOPHOBIA has ONE way in and out: the hatch you came up through.
        const atHatch = sectorT.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        if (!atHatch) return { error: "not_at_door" };
      }
      if (s.level === 6) {
        // LIGHTS OUT has ONE way in and out: the stair you came down.
        const atStair = sectorL.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        if (!atStair) return { error: "not_at_door" };
      }
      if (s.level === 4) {
        // THE OFFICE has ONE way in and out: the lift you came down in.
        const atLift = sectorO.doors.some((d) => Math.hypot(s.x - (d.x + 0.5), s.y - (d.y + 0.5)) <= 2.8);
        if (!atLift) return { error: "not_at_door" };
      }
      // ANY door is a way out (Josh, July 2026 — was entry-door-only): you
      // must actually be TOUCHING a marked door wall — pressed against its
      // perimeter plane, laterally within the door cell. Player radius is
      // 0.22, so a wall-collided position sits at ~0.22 from the plane;
      // the bounds stay slightly looser than the client's trigger box (the
      // server's view of the position can lag a step behind at 10Hz).
      const atAnyDoor = s.level !== 0 || sector.doors.some((d) => {
        const lateral =
          d.edge === "N" || d.edge === "S" ? Math.abs(s.x - (d.x + 0.5)) : Math.abs(s.y - (d.y + 0.5));
        const perp =
          d.edge === "N" ? s.y - d.y
          : d.edge === "S" ? d.y + 1 - s.y
          : d.edge === "E" ? d.x + 1 - s.x
          : s.x - d.x;
        return lateral <= 1.0 && perp >= 0 && perp <= 0.6;
      });
      if (s.level === 0 && !atAnyDoor) return { error: "not_at_door" };
      endRun(userId);
      // Walking OUT with the key doesn't bank it — the key belongs to Level 0.
      // It's findable at home again the moment you're through the wall.
      if (s.hasKey) {
        s.hasKey = false;
        keyHolder[s.level] = null;
      }
      for (const f of s.fuses ?? []) fuseHolder[f] = null;
      s.fuses = [];
      // a test run banks nothing: its relics and footage were only a test
      if (testing.has(s.level)) return { x: s.x, y: s.y, revealed: s.revealed, ms: Date.now() - s.enteredAt, relics: [], footage: null, test: true, ...(home ? { home } : {}) };
      // Relics cash in at the threshold: first-of-a-kind unlocks the
      // collection entry; DUPLICATES land in the locker as sellable items
      // (Voss pays full relic price — or keep it for the market, later).
      const relicResults: { relicId: string; name: string; fresh: boolean }[] = [];
      for (const slug of s.relics) {
        const fresh = store.brUnlockRelic(userId, slug);
        if (!fresh) store.brForceAddItem(userId, "relic", slug);
        relicResults.push({ relicId: slug, name: relicBySlug(slug)?.name ?? slug, fresh });
      }
      // Footage: the best LOS shot this run becomes a TAPE in the locker
      // (color = tier; Voss prices it 400/250/50).
      let footage: string | null = null;
      if (s.bestShot !== Infinity) {
        footage = s.bestShot <= 1.5 ? "close" : s.bestShot <= 5 ? "mid" : "far";
        store.brForceAddItem(userId, "tape", footage);
      }
      store.affinityHook?.(userId, "voss", "alive");
      return { x: s.x, y: s.y, revealed: s.revealed, ms: Date.now() - s.enteredAt, relics: relicResults, footage, ...(home ? { home } : {}) };
    },

    move(userId, x, y, heading) {
      const s = sessions.get(userId);
      if (!s) return null;
      const now = Date.now();
      const sec = secOf(s);
      // ADMIN FLYCAM: a ghost. No wall rules, no speed cap, no fog charted, no
      // fall judged, and the entity never hears a footstep — see BrSession.fly.
      // The bounds check stays: nothing may leave the world array.
      if (s.fly) {
        s.lastMoveAt = now;
        s.heading = Number.isFinite(heading) ? heading : s.heading;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: s.x, y: s.y, corrected: true };
        s.x = Math.max(0, Math.min(sec.size - 0.001, x));
        s.y = Math.max(0, Math.min(sec.size - 0.001, y));
        return { x: s.x, y: s.y, corrected: false };
      }
      // in the Grabber's arms: you are not going anywhere
      if ((heldUntil.get(userId) ?? 0) > now) return { x: s.x, y: s.y, corrected: true };
      // Footstep hearing (before lastMoveAt updates): speed classifies the
      // gait — running carries ~10m (5 cells), walking ~5m, crouch-slow is
      // silent to it. The two relic Entities prowl Level 0; spawned ones any.
      // Only a step the server would accept is heard (Oct 2026 review): a
      // claimed point across the room steered the Listener and the Burrowers
      // to a decoy before the step check refused it.
      if (
        Number.isFinite(x) && Number.isFinite(y) &&
        Math.hypot(x - s.x, y - s.y) <= MAX_STEP_CELLS &&
        x >= 0 && y >= 0 && x < sec.size && y < sec.size &&
        moveAllowed(sec, s.x, s.y, x, y)
      ) {
        // THE GAIT is read over the last half second of frames, not this one
        // (Nov 2026 polish round): the client sends every ~104-117 ms and the
        // network bunches them, so one frame's distance over its own gap heard
        // a walk as a sprint and a crouch as a walk on ordinary connections.
        s.gait ??= [];
        gaitPush(s.gait, now, Math.hypot(x - s.x, y - s.y), now - s.lastMoveAt);
        const speed = gaitSpeed(s.gait, GAIT_HEAR_MS);
        const hear = speed > GAIT_SPRINT_LINE ? 5 : speed > GAIT_WALK_LINE ? 2.5 : 0;
        // Crouched is the pose, not a speed under the walk line: a crouch is
        // 1.03 and can't sprint, so only a "crouch" at a walk's pace is heard
        // walking (Nov 2026 polish round).
        const crouched = s.pose === 1 && speed <= GAIT_CROUCH_MAX;
        // LIGHTS OUT: the Listener's own ears — a sprint, a walk, nothing for
        // a crouch, and any step in the Wet End's water is a splash
        if (s.level === 6 && !s.fly) {
          const wet = speed > 0.3 && lightsWet(sectorL, Math.floor(x), Math.floor(y));
          const r = Math.max(speed > GAIT_SPRINT_LINE ? LISTEN.run : speed > GAIT_WALK_LINE && !crouched ? LISTEN.walk : 0, wet ? LISTEN.splash : 0);
          if (r > 0) listenerHear(x, y, r, s.userId);
        }
        // THE CAVE SYSTEM: the Burrowers' ears — in a crawlspace any movement
        // is heard; in a passage a creep barely, a walk, a sprint far
        if (s.level === 8 && !s.fly && speed > 0.3 && inBurrow(x, y)) {
          const crawling = caveCrawl(sectorC, Math.floor(x), Math.floor(y));
          const r = speed > GAIT_SPRINT_LINE ? HEAR.run : crawling ? HEAR.crawl : crouched ? HEAR.creep : HEAR.walk;
          burrowHear(x, y, r, s.userId);
        }
        if (hear > 0) {
          for (const e of [...(s.level === 0 ? ents : []), ...spawned.filter((q) => q.level === s.level)]) {
            if (e.mode === "patrol" && Math.hypot(e.x - s.x, e.y - s.y) <= hear) {
              e.stimulus = { x: s.x, y: s.y, at: now };
            }
          }
        }
      }
      s.lastMoveAt = now;
      s.heading = Number.isFinite(heading) ? heading : s.heading;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { x: s.x, y: s.y, corrected: true };
      }
      // Per-message distance cap (anti-teleport), then cell-transition check
      // (anti-wall-phase). Sub-cell moves inside one cell are always fine.
      const dist = Math.hypot(x - s.x, y - s.y);
      const fromCX = Math.floor(s.x);
      const fromCY = Math.floor(s.y);
      const toCX = Math.floor(x);
      const toCY = Math.floor(y);
      let ok =
        dist <= MAX_STEP_CELLS &&
        x >= 0 && y >= 0 && x < sec.size && y < sec.size &&
        moveAllowed(sec, s.x, s.y, x, y);
      // THE BOATS: a passenger doesn't move (the boat moves them); a captain
      // may only steer onto SWIM-DEEP water — a rowboat can't beach itself.
      const boat = s.boatId !== null ? boatById(s.boatId) : null;
      if (boat) {
        if (boat.captain !== s.userId) return { x: s.x, y: s.y, corrected: true };
        // A hull needs WATER, not depth (Josh: "I can't use the boat over
        // shallow areas") — a rowboat drafts a few inches, so anywhere wet
        // is navigable and only dry land turns it back.
        const ti = toCY * sec.size + toCX;
        const wl = sec.water?.[ti] ?? WATER_NONE;
        if (wl === WATER_NONE) ok = false;
      }
      if (!ok) {
        return { x: s.x, y: s.y, corrected: true };
      }
      s.x = x;
      s.y = y;
      if (boat) {
        boat.x = x;
        boat.y = y;
        boat.h = s.heading;
        if (boat.passenger !== null) {
          const p = sessions.get(boat.passenger);
          if (p) {
            p.x = x;
            p.y = y;
          }
        }
      }
      // Crossing into a new cell writes exploration history — permanently.
      if (toCX !== fromCX || toCY !== fromCY) {
        s.revealed += revealAround(s.level, toCX, toCY);
        // FALLING. Judged server-side from the height map (the client never
        // reports its own damage) — but SETTLED ON LANDING, not on the cell
        // crossing that started it (Josh: "the damage hits before I hit the
        // ground"). Leaving a ledge opens a fall; touching down closes it.
        const fromH = floorAt(sec, fromCX, fromCY);
        const toH = floorAt(sec, toCX, toCY);
        // Descending — remember the HIGHEST point this fall started from.
        if (toH < fromH) s.fall = { from: Math.max(s.fall?.from ?? fromH, fromH), since: s.fall?.since ?? now };
      }
      // SETTLE THE FALL — every frame, not just on cell crossings: a drop
      // straight down a shaft never changes cell, and the damage still has
      // to land when the body does.
      if (s.fall) {
        const airborne = s.pose === 2 && now - s.fall.since < 3000;
        if (!airborne) {
          const drop = s.fall.from - floorAt(sec, toCX, toCY);
          s.fall = null;
          // WATER BREAKS FALLS (Josh: "it's a game, don't be so punishing"):
          // ANY water under the landing absorbs it. Dry falls only hurt past
          // a real height (6 steps / 3m); shafts keep the full table — a pit
          // is a pit.
          const wlv = sec.water?.[toCY * sec.size + toCX] ?? WATER_NONE;
          const watered = wlv !== WATER_NONE;
          if (!watered && (drop >= 6 || (drop >= 2 && isPitCell(sec, toCX, toCY)))) {
            const dmg = isPitCell(sec, toCX, toCY) ? fallDamage(drop) : fallDamage(drop - 3);
            if (dmg > 0) {
              s.hp -= dmg;
              const meters = (drop * FLOOR_STEP).toFixed(1);
              if (s.hp <= 0) {
                const dead = s;
                killPlayer(dead, isPitCell(sec, toCX, toCY) ? "the drop" : `a ${meters}m fall`);
                hurtCb?.({ userId: dead.userId, hp: 0, drop, dead: true });
                return { x, y, corrected: false, dead: true };
              }
              hurtCb?.({ userId: s.userId, hp: s.hp, drop, dead: false });
            }
          }
        }
      }
      return { x, y, corrected: false };
    },

    chunkFor(userId, cx, cy) {
      // a spectator streams the world round the one they watch
      const spec = spectators.get(userId);
      const s = sessions.get(userId) ?? (spec ? sessions.get(spec.targetId) : undefined);
      if (!s || !enabled) return null;
      const sec = secOf(s);
      const chunks = Math.ceil(sec.size / CHUNK);
      if (cx < 0 || cy < 0 || cx >= chunks || cy >= chunks) return null;
      // Only chunks near the player — the map-secrecy rule.
      const pcx = Math.floor(s.x / CHUNK);
      const pcy = Math.floor(s.y / CHUNK);
      if (Math.abs(cx - pcx) > CHUNK_RADIUS || Math.abs(cy - pcy) > CHUNK_RADIUS) return null;
      const size = sec.size;
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      const w = Math.min(CHUNK, size - x0);
      const h = Math.min(CHUNK, size - y0);
      const wallN: number[] = [];
      const wallW: number[] = [];
      const solid: number[] = [];
      const floor: number[] = [];
      const background: number[] = [];
      const district: number[] = [];
      const landmark: number[] = [];
      const water: number[] = [];
      const deco: number[] = [];
      const look: number[] = [];
      const lid: number[] = [];
      let anyLid = false;
      const stair: number[] = [];
      const stairStyle: number[] = [];
      let anyStair = false;
      const section: number[] = [];
      // THE PARTIAL-CHUNK SHEAR (Josh's map-bug sweep, July 2026). 362 cells
      // is not a multiple of 16, so the last chunk row/column is 10 cells —
      // but this payload declares `size: CHUNK` and the client indexes every
      // array at stride 16. Packing edge chunks 10-wide sheared every row:
      // floors read as 0, walls landed on the wrong cells, and the client's
      // collision fought the server's ("an invisible wall is repelling you",
      // cell 360,75 — chunk 22,4). Out-of-map cells are PADDED as solid rock
      // with no walls, which the client already renders as nothing.
      for (let y = y0; y < y0 + CHUNK; y++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          const inMap = x < x0 + w && y < y0 + h;
          const i = y * size + x;
          wallN.push(inMap ? sec.wallN[i] : 0);
          wallW.push(inMap ? sec.wallW[i] : 0);
          solid.push(inMap ? sec.solid[i] : 1);
          floor.push(inMap ? sec.floor[i] : 0);
          background.push(inMap ? sec.background[i] : 0);
          district.push(inMap ? sec.district[i] : 0);
          landmark.push(inMap ? sec.landmark[i] : 0);
          water.push(inMap && sec.water ? sec.water[i] : WATER_NONE);
          deco.push(inMap && sec.deco ? sec.deco[i] : 0);
          look.push(inMap && sec.look ? sec.look[i] : 0);
          const lv = inMap && sec.lid ? sec.lid[i] : LID_NONE;
          if (lv !== LID_NONE) anyLid = true;
          lid.push(lv);
          const sv = inMap && sec.stair ? sec.stair[i] : STAIR_NONE;
          if (sv !== STAIR_NONE) anyStair = true;
          stair.push(sv);
          stairStyle.push(inMap && sec.stairStyle ? sec.stairStyle[i] : 0);
          section.push(inMap && sec.section ? sec.section[i] : 0);
        }
      }
      // the styles used here, and any uploaded texture among them
      let styles: Record<number, LookSpec> | undefined;
      const surfaces: CustomSurface[] = [];
      if (sec.look && sec.styles) {
        for (const v of look) {
          if (!v || styles?.[v]) continue;
          const st = sec.styles[v - 1];
          if (!st) continue;
          (styles ??= {})[v] = st;
          for (const kind of ["wall", "floor", "ceil"] as const) {
            const cs = findSurface(kind, st[kind]);
            if (cs && "url" in cs && !surfaces.some((q) => q.id === cs.id)) surfaces.push(cs);
          }
        }
      }
      const props = [...propsInChunk(sec, x0, y0, w, h), ...kitInChunk(sec, cx, cy, CHUNK)];
      // the stair dressings this chunk uses (and any uploaded surface they wear)
      let stairSpecs: Record<number, StairSpec> | undefined;
      if (anyStair && sec.stairSpecs) {
        for (const v of stairStyle) {
          if (!v || stairSpecs?.[v]) continue;
          const sp = sec.stairSpecs[v - 1];
          if (!sp) continue;
          (stairSpecs ??= {})[v] = sp;
          if (!sp.tex) continue;
          for (const kind of ["wall", "floor", "ceil"] as const) {
            const cs = findSurface(kind, sp.tex);
            if (cs && "url" in cs && !surfaces.some((q) => q.id === cs.id)) surfaces.push(cs);
          }
        }
      }
      // a SHAPE may wear an uploaded texture too: the chunk teaches it
      for (const p of props) {
        if (!p.tex) continue;
        for (const kind of ["wall", "floor", "ceil"] as const) {
          const cs = findSurface(kind, p.tex);
          if (cs && "url" in cs && !surfaces.some((q) => q.id === cs.id)) surfaces.push(cs);
        }
      }
      return {
        cx, cy, size: CHUNK,
        level: s.level,
        wallN, wallW, solid, floor, background, district, landmark,
        ...(sec.water ? { water } : {}),
        ...(sec.deco ? { deco } : {}),
        ...(styles ? { look, styles } : {}),
        ...(surfaces.length ? { surfaces } : {}),
        ...(anyLid ? { lid } : {}),
        ...(anyStair ? { stair, stairStyle, ...(stairSpecs ? { stairSpecs } : {}) } : {}),
        ...(sec.section ? { section } : {}),
        props,
      };
    },

    nearby(userId, radiusCells) {
      const me = sessions.get(userId);
      if (!me) return [];
      const out: BrSession[] = [];
      for (const s of sessions.values()) {
        if (s.userId === userId) continue;
        if (s.level !== me.level) continue; // another world entirely
        if (Math.hypot(s.x - me.x, s.y - me.y) <= radiusCells) out.push(s);
      }
      return out;
    },

    get fog() {
      return fog;
    },
    get fogP() {
      return fogP;
    },
    get fogD() {
      return fogD;
    },
    get fogS() {
      return fogS;
    },
    exploredCountS() {
      let n = 0;
      for (let i = 0; i < fogS.length; i++) if (fogS[i]) n++;
      return n;
    },
    get fogO() {
      return fogO;
    },
    exploredCountO() {
      let n = 0;
      for (let i = 0; i < fogO.length; i++) if (fogO[i]) n++;
      return n;
    },

    stationState() {
      if (!enabledS) return null;
      return {
        breakers: breakerSites.map((b) => ({ section: b.section, x: b.x, y: b.y, side: b.side, on: breakerOn(b.section) })),
        cutoffs: cutoffSites.map((c) => ({ section: c.section, x: c.x, y: c.y, side: c.side })),
        shutter: shutterSite ? { ...shutterSite, open: !!store.brGetFlag(LEVEL4_FLAG) } : null,
        power: powerState(),
      };
    },

    throwBreaker(userId, name, section) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      if (s.level !== 3) return { error: "too_far" };
      const b = breakerSites.find((q) => q.section === section);
      if (!b) return { error: "gone" };
      // on foot, and within reach AND sight — not through a wall, and a flying
      // operator must not throw a world's breaker by passing over it
      if (s.fly) return { error: "flying" };
      if (Math.hypot(s.x - b.x, s.y - b.y) > 1.9 || !pickupLos(s, b.x, b.y)) return { error: "too_far" };
      const test = testing.has(3);
      const fresh = !breakerOn(section);
      if (fresh) {
        if (test) testThrown.add(section);
        else store.brSetFlag(breakerFlag(section), userId, name);
      }
      const on = breakerSites.filter((q) => breakerOn(q.section)).length;
      // all six: the lift shutter has power — once, for everyone (never from a test)
      const opened = !test && on === BREAKER_COUNT && !store.brGetFlag(LEVEL4_FLAG);
      if (opened) store.brSetFlag(LEVEL4_FLAG, userId, name);
      if (fresh) stationCb?.({ type: "breaker", section, by: name, on, total: BREAKER_COUNT, opened });
      return { on, total: BREAKER_COUNT, opened, fresh };
    },

    pullCutoff(userId, section) {
      const s = sessions.get(userId);
      if (!s) return { error: "not_inside" };
      if (s.level !== 3) return { error: "too_far" };
      const c = cutoffSites.find((q) => q.section === section);
      if (!c) return { error: "gone" };
      if (s.fly) return { error: "flying" };
      if (Math.hypot(s.x - c.x, s.y - c.y) > 1.9 || !pickupLos(s, c.x, c.y)) return { error: "too_far" };
      // A held key re-pulls 30 times a second: the window restarts each time,
      // but the whole level is only told once a second (a forced power frame
      // to everyone down there per keypress was a flood — Oct 2026 audit).
      const now = Date.now();
      const fresh = cutUntil[section] <= now || now - (cutUntil[section] - STATION_CUTOFF_MS) >= 1_000;
      cutUntil[section] = now + STATION_CUTOFF_MS;
      if (fresh) emitPowerIfChanged(true);
      return { ms: STATION_CUTOFF_MS };
    },

    onStation(cb) {
      stationCb = cb;
    },

    level4() {
      const f = store.brGetFlag(LEVEL4_FLAG);
      return f ? { name: f.name ?? null, at: f.at } : null;
    },

    stationOpen() {
      return !!store.brGetFlag(STATION_OPEN_FLAG);
    },

    setStationOpen(open, by) {
      if (open) {
        if (!store.brGetFlag(STATION_OPEN_FLAG)) store.brSetFlag(STATION_OPEN_FLAG, null, by);
      } else store.brClearFlag(STATION_OPEN_FLAG);
    },

    get fogH() {
      return fogH;
    },
    exploredCountH() {
      let n = 0;
      for (let i = 0; i < fogH.length; i++) if (fogH[i]) n++;
      return n;
    },

    hotelState() {
      if (!enabledH) return null;
      const h = sectorH.hotel;
      return {
        register: registerSite ? { x: registerSite.x, y: registerSite.y } : null,
        suites: (h?.suites ?? []).map((q) => ({ number: q.number, door: { ...q.door } })),
        rustydoor: rustyDoor ? { ...rustyDoor, open: !!store.brGetFlag(LEVEL6_FLAG) } : null,
        lifts: hotelLifts.map((l) => ({ ...l })),
        furnaces: hotelFurnaces.map((f) => ({ ...f })),
        nests: swarms.map((w) => ({ x: w.nestX, y: w.nestY })),
      };
    },

    level6() {
      return store.brGetFlag(LEVEL6_FLAG);
    },

    hotelOpen() {
      return !!store.brGetFlag(HOTEL_OPEN_FLAG);
    },

    setHotelOpen(open, by) {
      if (open) {
        if (!store.brGetFlag(HOTEL_OPEN_FLAG)) store.brSetFlag(HOTEL_OPEN_FLAG, null, by);
      } else store.brClearFlag(HOTEL_OPEN_FLAG);
    },

    get fogL() {
      return fogL;
    },
    get fogT() {
      return fogT;
    },
    exploredCountT() {
      let n = 0;
      for (let i = 0; i < fogT.length; i++) if (fogT[i]) n++;
      return n;
    },

    get fogU() {
      return fogU;
    },
    exploredCountU() {
      let n = 0;
      for (let i = 0; i < fogU.length; i++) if (fogU[i]) n++;
      return n;
    },
    get fogC() {
      return fogC;
    },
    exploredCountC() {
      let n = 0;
      for (let i = 0; i < fogC.length; i++) if (fogC[i]) n++;
      return n;
    },

    suburbState() {
      if (!enabledU) return null;
      return { frontDoor: frontDoorSite ? { ...frontDoorSite, open: !!store.brGetFlag(LEVEL10_FLAG) } : null };
    },

    level10() {
      return store.brGetFlag(LEVEL10_FLAG);
    },

    suburbsOpen() {
      return !!store.brGetFlag(SUBURBS_OPEN_FLAG);
    },

    setSuburbsOpen(open, by) {
      if (open) {
        if (!store.brGetFlag(SUBURBS_OPEN_FLAG)) store.brSetFlag(SUBURBS_OPEN_FLAG, null, by);
      } else store.brClearFlag(SUBURBS_OPEN_FLAG);
    },

    onWatch(cb) {
      watchCb = cb;
    },

    summonWatch(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 9 || q.fly || !enabledU || !takeable(q)) return false;
      if (!watchers.length) watchArrive([]);
      const w = watchers[0];
      if (!w) return false;
      // round a corner, ten cells off, coming for you
      const sp = watchSpot(q.x, q.y, 10);
      if (sp) {
        w.x = sp.x;
        w.y = sp.y;
      }
      watchSpared.delete(q.userId);
      w.mode = "hunt";
      w.targetId = q.userId;
      w.lastSeenAt = Date.now();
      w.lastSeenX = q.x;
      w.lastSeenY = q.y;
      w.path = [];
      return true;
    },

    debugParkWatch(x, y) {
      if (!enabledU || watchShuns(Math.floor(x), Math.floor(y))) return false;
      if (!watchers.length) {
        const nw: Watcher = { id: watchSeq++, x, y, h: 0, mode: "patrol", path: [], pathAt: 0, tx: x, ty: y, targetId: 0, lastSeenAt: 0, lastSeenX: x, lastSeenY: y, until: Date.now() + 60_000, arrivedAt: 0, knockAt: 0 };
        watchers.push(nw);
      }
      const w = watchers[0];
      w.x = x;
      w.y = y;
      w.tx = x;
      w.ty = y;
      w.mode = "patrol";
      w.targetId = 0;
      w.path = [];
      w.until = Date.now() + 60_000; // it stands where it was put
      return true;
    },

    debugWatch() {
      return {
        dials: { patrol: WATCH_PATROL, hunt: WATCH_HUNT, sight: WATCH_SIGHT, touch: WATCH_TOUCH, reach: WATCH_REACH, loseMs: WATCH_LOSE, edgeMs: WATCH_EDGE, doorMs: WATCH_DOOR, knockMs: WATCH_KNOCK, spareMs: WATCH_SPARE },
        watchers: watchers.map((w) => ({ id: w.id, x: w.x, y: w.y, mode: w.mode, targetId: w.targetId })),
        lit: litU as Uint8Array,
      };
    },

    caveState() {
      if (!enabledC) return null;
      return { chimney: chimneyFoot ? { ...chimneyFoot, open: !!store.brGetFlag(LEVEL9_FLAG) } : null };
    },

    level9() {
      return store.brGetFlag(LEVEL9_FLAG);
    },

    caveOpen() {
      return !!store.brGetFlag(CAVE_OPEN_FLAG);
    },

    setCaveOpen(open, by) {
      if (open) {
        if (!store.brGetFlag(CAVE_OPEN_FLAG)) store.brSetFlag(CAVE_OPEN_FLAG, null, by);
      } else store.brClearFlag(CAVE_OPEN_FLAG);
    },

    onBurrower(cb) {
      burrowerCb = cb;
    },

    burrowerHears(x, y, range, from = 0) {
      burrowHear(x, y, range, from);
    },

    summonBurrower(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 8 || q.fly || !enabledC || !inBurrow(q.x, q.y)) return false;
      if (!burrowers.length) burrowSurface(null, [q]);
      const b = burrowers[0];
      if (!b) return false;
      // somewhere in the rock near you, then sent at where you are
      const sp = burrowSpot(q.x, q.y, 10);
      if (sp && Math.hypot(sp.x - q.x, sp.y - q.y) > 3) {
        b.x = sp.x;
        b.y = sp.y;
      }
      burrowSpared.delete(q.userId);
      // the nearest one only (burrowHear at any range sent every Burrower)
      b.mode = "hunt";
      b.tx = q.x;
      b.ty = q.y;
      b.path = [];
      b.heardId = q.userId;
      b.heardAt = Date.now();
      b.until = 0;
      return true;
    },

    debugParkBurrower(x, y) {
      if (!enabledC || burrowShuns(Math.floor(x), Math.floor(y))) return false;
      if (!burrowers.length) {
        const nb: Burrower = { id: burrowSeq++, x, y, mode: "roam", path: [], pathAt: 0, tx: x, ty: y, heardId: 0, heardAt: 0, until: 0 };
        burrowers.push(nb);
      }
      const b = burrowers[0];
      b.x = x;
      b.y = y;
      b.mode = "roam";
      b.tx = x;
      b.ty = y;
      b.path = [];
      b.heardId = 0;
      b.heardAt = 0;
      b.until = Date.now() + 60_000;
      return true;
    },

    debugBurrowers() {
      return {
        dials: { roam: BURROW_ROAM, crawl: BURROW_CRAWL, passage: BURROW_PASSAGE, touch: BURROW_TOUCH, loseMs: BURROW_LOSE, quietMs: BURROW_QUIET, hear: { ...HEAR } },
        burrowers: burrowers.map((b) => ({ id: b.id, x: b.x, y: b.y, mode: b.mode, heardId: b.heardId, heardAt: b.heardAt })),
      };
    },

    oceanState() {
      if (!enabledT) return null;
      return { subway: subwayDoor ? { ...subwayDoor, open: !!store.brGetFlag(LEVEL8_FLAG) } : null };
    },

    level8() {
      return store.brGetFlag(LEVEL8_FLAG);
    },

    oceanOpen() {
      return !!store.brGetFlag(OCEAN_OPEN_FLAG);
    },

    setOceanOpen(open, by) {
      if (open) {
        if (!store.brGetFlag(OCEAN_OPEN_FLAG)) store.brSetFlag(OCEAN_OPEN_FLAG, null, by);
      } else store.brClearFlag(OCEAN_OPEN_FLAG);
    },

    onDeep(cb) {
      deepCb = cb;
    },

    summonDeep(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 7 || q.fly || !enabledT || !deepWater(q.x, q.y)) return false;
      const w = deepWatch.get(q.userId) ?? { exposure: 0, stage: 0, risingUntil: 0, lx: q.x, ly: q.y, lt: Date.now() };
      w.exposure = DEEP_STAGES[1] + 0.05;
      w.stage = 2;
      deepWatch.set(q.userId, w);
      deepCb?.({ type: "stage", userId: q.userId, stage: 2, x: q.x, y: q.y });
      return true;
    },

    debugDeep() {
      return {
        dials: { ...DEEP, stages: DEEP_STAGES, riseMs: DEEP_RISE_MS, missed: DEEP_MISSED, splashSpeed: DEEP_SPLASH_SPEED },
        swimmers: [...deepWatch.entries()].map(([userId, w]) => ({ userId, exposure: w.exposure, stage: w.stage, risingUntil: w.risingUntil })),
      };
    },
    exploredCountL() {
      let n = 0;
      for (let i = 0; i < fogL.length; i++) if (fogL[i]) n++;
      return n;
    },

    lightsState() {
      if (!enabledL) return null;
      return { hatch: seaHatch ? { ...seaHatch, open: !!store.brGetFlag(LEVEL7_FLAG) } : null };
    },

    level7() {
      return store.brGetFlag(LEVEL7_FLAG);
    },

    lightsOpen() {
      return !!store.brGetFlag(LIGHTS_OPEN_FLAG);
    },

    setLightsOpen(open, by) {
      if (open) {
        if (!store.brGetFlag(LIGHTS_OPEN_FLAG)) store.brSetFlag(LIGHTS_OPEN_FLAG, null, by);
      } else store.brClearFlag(LIGHTS_OPEN_FLAG);
    },

    onListener(cb) {
      listenerCb = cb;
    },

    listenerHears(x, y, range, from = 0) {
      listenerHear(x, y, range, from);
    },

    debugParkListener(x, y) {
      const l = listeners[0];
      if (!l) return false;
      l.x = x;
      l.y = y;
      l.mode = "wander";
      l.path = [];
      l.tx = x;
      l.ty = y;
      l.knowId = 0;
      l.lingerUntil = Date.now() + 120_000;
      return true;
    },

    debugListeners() {
      return listeners.map((l) => ({ id: l.id, x: l.x, y: l.y, mode: l.mode, knowId: l.knowId }));
    },

    summonListener(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 6 || q.fly || !enabledL) return false;
      if (!listeners.length) spawnListener([q]);
      const l = listeners[0];
      if (!l) return false;
      // round a corner from you, then sent at where you stand
      const sp = listenerSpot(q.x, q.y, 10, q.x, q.y, 6);
      if (sp) {
        l.x = sp.x;
        l.y = sp.y;
      }
      l.mode = "search";
      l.tx = q.x;
      l.ty = q.y;
      l.path = [];
      l.lingerUntil = 0;
      return true;
    },

    readRegister(userId) {
      const s = sessions.get(userId);
      if (!s || s.level !== 5 || !enabledH) return { error: "not_inside" };
      if (!registerSite || Math.hypot(s.x - registerSite.x, s.y - registerSite.y) > 2.4) return { error: "too_far" };
      const h = sectorH.hotel;
      if (!h || h.target < 0) return { error: "blank" };
      return { number: h.suites[h.target].number };
    },

    hotelKeyFor(userId) {
      const s = sessions.get(userId);
      if (!s || s.level !== 5 || s.fly || !boilerKeyHome || !keyRoom) return null;
      if (!keyIsFindable(5) || store.brGetFlag(LEVEL6_FLAG)) return null;
      const inRoom = s.x >= keyRoom.x && s.x < keyRoom.x + keyRoom.w && s.y >= keyRoom.y && s.y < keyRoom.y + keyRoom.h;
      return inRoom ? { x: boilerKeyHome.x, y: boilerKeyHome.y } : null;
    },

    rideLift(userId, floor) {
      const s = sessions.get(userId);
      if (!s || s.level !== 5 || !enabledH) return { error: "not_inside" };
      if (s.fly) return { error: "flying" };
      if (!Number.isInteger(floor) || floor < 1 || floor > LIFT_TOP_FLOOR) return { error: "bad_floor" };
      let from = -1;
      let best = LIFT_REACH;
      hotelLifts.forEach((l, i) => {
        const d = Math.hypot(s.x - l.x, s.y - l.y);
        if (d <= best) {
          best = d;
          from = i;
        }
      });
      if (from < 0) return { error: "too_far" };
      if (floor >= LIFT_DEATH_FLOOR) {
        // the doors close and do not open again
        if (immortals.has(userId)) return { error: "immortal" };
        const { x, y } = s;
        killPlayer(s, "the lift");
        hurtCb?.({ userId, hp: 0, drop: 0, dead: true, cause: "the lift", x, y, level: 5 });
        return { dead: true };
      }
      const to = liftDest(from, floor);
      if (to < 0) return { error: "no_lift" };
      const l = hotelLifts[to];
      const a = arrivalSpot(5, l.x, l.y, userId);
      s.x = a.x;
      s.y = a.y;
      s.revealed += revealAround(5, Math.floor(s.x), Math.floor(s.y));
      return { x: s.x, y: s.y, floor };
    },

    onHeat(cb) {
      heatCb = cb;
    },

    onMoths(cb) {
      mothCb = cb;
    },

    summonMoths(userId) {
      const q = sessions.get(userId);
      if (!q || q.level !== 5 || !enabledH || !swarms.length) return false;
      const w = swarms.reduce((a, b) => (Math.hypot(a.nestX - q.x, a.nestY - q.y) <= Math.hypot(b.nestX - q.x, b.nestY - q.y) ? a : b));
      w.mode = "hunting";
      w.targetId = userId;
      w.darkSince = 0;
      w.blindSince = 0;
      w.path = [];
      mothCb?.({ type: "wake", id: w.id, x: w.x, y: w.y });
      return true;
    },

    officeState() {
      if (!enabledO) return null;
      const opened = !!store.brGetFlag(LEVEL5_FLAG);
      return {
        keycard: !opened && keyIsFindable(4) ? { x: keycardHome.x, y: keycardHome.y } : null,
        stairdoor: stairDoor ? { ...stairDoor, open: opened } : null,
      };
    },

    level5() {
      return store.brGetFlag(LEVEL5_FLAG);
    },

    officeOpen() {
      return !!store.brGetFlag(OFFICE_OPEN_FLAG);
    },

    setOfficeOpen(open, by) {
      if (open) {
        if (!store.brGetFlag(OFFICE_OPEN_FLAG)) store.brSetFlag(OFFICE_OPEN_FLAG, null, by);
      } else store.brClearFlag(OFFICE_OPEN_FLAG);
    },
    exploredCountD() {
      let n = 0;
      for (let i = 0; i < fogD.length; i++) if (fogD[i]) n++;
      return n;
    },
    level2() {
      return store.brGetFlag(LEVEL2_FLAG);
    },
    exploredCount() {
      let n = 0;
      for (let i = 0; i < fog.length; i++) if (fog[i]) n++;
      return n;
    },
    exploredCountP() {
      let n = 0;
      for (let i = 0; i < fogP.length; i++) if (fogP[i]) n++;
      return n;
    },
    flushFog,
  };
  return api;
}

export const BR_CONSTANTS = { CHUNK, CHUNK_RADIUS, MAX_STEP_CELLS, PLAYER_RADIUS };
