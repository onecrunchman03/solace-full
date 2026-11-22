// The game socket client — /ws-game. Compact protocol, server-authoritative:
// we SEND claimed positions, the server corrects us if we lie (or lag through
// a wall); we RECEIVE the world in chunks and other players only when nearby.

import { getToken, wsUrl } from "./gameapi";

export interface DoorInfo {
  x: number;
  y: number;
  edge: "N" | "S" | "E" | "W";
  name: string;
  /** The door cell's floor, in steps (0.5m). */
  floor?: number;
}

export interface BoatFrame {
  id: number;
  x: number;
  y: number;
  h: number;
  captain: number | null;
  passenger: number | null;
}

export interface ChunkData {
  cx: number;
  cy: number;
  size: number;
  /** Re-sent after a props-only map publish: rebuild it in place. */
  refresh?: boolean;
  wallN: number[];
  wallW: number[];
  solid: number[];
  /** v2 verticality: floor height per cell, in steps of FLOOR_STEP metres. */
  floor?: number[];
  /** v2: 1 = sealed scenery — render it, never walk into it. */
  background?: number[];
  /** Furniture in this chunk (decoration only — never collides). */
  /** Furniture. `r` is its collision half-extent in cells — props are SOLID. */
  /** `r` is a square half-extent (server furniture); `rx`/`ry` are the
   *  per-axis form the client synthesizes for kit masonry (arch legs,
   *  bridge railings). */
  props?: ChunkProp[];
  district: number[];
  landmark: number[];
  /** Which world this chunk belongs to (0 = Level 0, 1 = THE POOLROOMS,
   *  2 = Pipe Dreams, 3 = the Electrical Station). */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** THE ELECTRICAL STATION: the power circuit per cell (1..6, 0 none). */
  section?: number[];
  /** Kit-dressing codes (kind*16+variant — worldgen-pools DECO). Purely
   *  visual; absent on Level 0 chunks. */
  deco?: number[];
  /** The room STYLE per cell (1 + index into styles; 0 = the usual). */
  look?: number[];
  /** The styles this chunk uses, by number (the map editor's Look / Lights / Sound). */
  styles?: Record<number, import("../../../src/backrooms/surfaces").LookSpec>;
  /** Uploaded textures those styles name. */
  surfaces?: import("../../../src/backrooms/surfaces").CustomSurface[];
  /** THE POOLROOMS: water SURFACE height per cell in steps (-128 = dry).
   *  Absent on Level 0 chunks. */
  water?: number[];
  /** THE HELD CEILING per cell (src/backrooms/ceiling.ts; -128 = follows
   *  the floor), when any cell in the chunk holds one. */
  lid?: number[];
  /** THE STAIRS (src/backrooms/stairs.ts): the UP side per cell (−1 none),
   *  each stair's dressing number, and the dressings this chunk uses. */
  stair?: number[];
  stairStyle?: number[];
  stairSpecs?: Record<number, import("../../../src/backrooms/stairs").StairSpec>;
}

/** One prop in a chunk (src/backrooms/props.ts PropPlacement). */
export interface ChunkProp {
  x: number;
  y: number;
  kind: string;
  rot: number;
  r?: number;
  rx?: number;
  ry?: number;
  z?: number;
  text?: string;
  /** Tilt after the yaw, radians (Euler "YXZ"). */
  pitch?: number;
  roll?: number;
  /** A shape: size in metres, surface id, colour. */
  sx?: number;
  sy?: number;
  sz?: number;
  tex?: string;
  col?: string;
}

export interface BrItem {
  id: number;
  kind: string;
  level: number;
  color: string | null;
}

/** THE ABANDONED OFFICE's state (server: service.ts OfficeState): where the
 *  keycard lies (null = carried or on a body) and the stairwell door. */
export interface OfficeState {
  keycard: { x: number; y: number } | null;
  stairdoor: { x: number; y: number; side: number; open: boolean } | null;
}

/** THE TERROR HOTEL's state (server: service.ts HotelState): the register,
 *  the suites' doors (their numbers), the rusty door, the lifts, the
 *  furnaces and the moths' nests. The Boiler Key is NOT here — it streams
 *  only to someone standing in its room. */
export interface HotelState {
  register: { x: number; y: number } | null;
  suites: { number: number; door: { x: number; y: number; side: number } }[];
  rustydoor: { x: number; y: number; side: number; open: boolean } | null;
  lifts: { x: number; y: number; side: number }[];
  furnaces: { x: number; y: number; side: number }[];
  nests: { x: number; y: number }[];
}

/** LIGHTS OUT's state (server: service.ts LightsState): the sea hatch. The
 *  Handwheel is NOT here — it streams like any key, from close. */
export interface LightsState {
  hatch: { x: number; y: number; side: number; open: boolean } | null;
}

/** THALASSOPHOBIA's state (server: service.ts OceanState): the subway stair at
 *  the bottom of the sunken plaza. The Diving Helmet is NOT here — it streams
 *  like any key. */
export interface OceanState {
  subway: { x: number; y: number; side: number; open: boolean } | null;
}

/** THE CAVE SYSTEM's state (server: service.ts CaveState): the Chimney, and
 *  whether the rope is fixed in it. The Climbing Rope is NOT here — it
 *  streams like any key. */
export interface CaveState {
  chimney: { x: number; y: number; side: number; open: boolean } | null;
}

/** THE SUBURBS' state (server: service.ts SuburbState): Number 9's front
 *  door — the way out. Where the House Key lies is streamed only near it. */
export interface SuburbState {
  frontDoor: { x: number; y: number; side: number; open: boolean } | null;
}

/** THE ELECTRICAL STATION's state (server: service.ts StationState). */
export interface StationState {
  breakers: { section: number; x: number; y: number; side: number; on: boolean }[];
  cutoffs: { section: number; x: number; y: number; side: number }[];
  shutter: { x: number; y: number; side: number; open: boolean } | null;
  power: { section: number; powered: boolean; cutMs: number; darkMs: number }[];
}

export interface Welcome {
  /** Which world you're standing in: 0 = Level 0, 1 = THE POOLROOMS,
   *  2 = Pipe Dreams, 3 = the Electrical Station. */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  size: number;
  chunk: number;
  doors: DoorInfo[];
  districts: { id: number; type: string }[];
  you: { x: number; y: number; door: number };
  /** The validated loadout you carried in. */
  inventory: BrItem[];
  /** Relics already in hand (a resumed run). */
  relics?: string[];
  /** A resumed run's key (or the level's key item) and fuses in hand. */
  hasKey?: boolean;
  fuses?: number;
  /** Starting health — server-authoritative since v2 (falls can kill). */
  hp?: number;
  /** Remaining ms of a brownout in progress — you joined mid-blackout. */
  brownoutMs?: number;
  /** The event in progress is a full BLACKOUT (mid-run dark stretch). */
  brownoutBlack?: boolean;
  /** Level 3: the breakers, cutoffs, shutter and power as they stand. */
  station?: StationState;
  /** THE ABANDONED OFFICE (level 4): its keycard and stairwell door. */
  office?: OfficeState;
  /** THE TERROR HOTEL (level 5). */
  hotel?: HotelState;
  /** LIGHTS OUT (level 6). */
  lights?: LightsState;
  /** THALASSOPHOBIA (level 7). */
  ocean?: OceanState;
  /** THE CAVE SYSTEM (level 8). */
  cave?: CaveState;
  /** THE SUBURBS (level 9). */
  suburb?: SuburbState;
}

/** LAW 12: what a dead player watching the living is told (server: net.ts). */
export interface SpectateState {
  /** Who they watch. */
  target: number;
  /** The living on the level, to cycle between. */
  targets: { id: number; name: string }[];
  /** Ghost talk time left, ms (a talk in progress is spending it). */
  talkLeftMs: number;
  talking: boolean;
  /** When the budget refills to full. */
  refillInMs: number;
  /** The other dead watching the same player (heard as ordinary chat). */
  watchers: number[];
}

export interface GameNetHandlers {
  /** LAW 12: you are watching (null = nobody left alive — the watch ends). */
  onSpectate?: (s: SpectateState | null) => void;
  /** LAW 12: a ghost watching YOU is speaking (or has stopped); `yaw` is the
   *  direction of their camera round you — where the voice comes from. */
  onGhost?: (g: { id: number; name: string; on: boolean; yaw: number }) => void;
  /** THE ELECTRICAL STATION: a section's power changed (every section's
   *  state, so a late frame can't leave one wrong). */
  onPower?: (power: StationState["power"]) => void;
  /** A panel is about to arc ("warn") or arcing ("fire"). */
  onArc?: (ev: { x: number; y: number; side: number; phase: "warn" | "fire" }) => void;
  /** Somebody threw a breaker. */
  onBreaker?: (ev: { section: number; by: string; on: number; total: number; opened: boolean }) => void;
  /** Your own throw, answered. */
  onBreakerThrown?: (r: { ok: boolean; on?: number; total?: number; fresh?: boolean; opened?: boolean; error?: string }) => void;
  /** Your own cutoff, answered. */
  onCutoffPulled?: (r: { ok: boolean; ms?: number; error?: string }) => void;
  /** All six breakers on: the lift shutter has power. */
  onLevel4?: (who: string) => void;
  /** THE STAIRWELL DOOR (the office), streamed from within sight like a door. */
  onStairDoor?: (d: { x: number; y: number; side: number; open: boolean }) => void;
  /** The keycard badged: the stairwell door is open, for everyone. */
  onLevel5?: (who: string) => void;
  /** THE TERROR HOTEL: your heat gauge (0-100), yours alone. */
  onHeat?: (v: number) => void;
  /** An awake swarm of DEATHMOTHS near you, and what it is doing. */
  onMoths?: (id: number, x: number, y: number, mode: string) => void;
  /** A swarm woke, began circling the chandelier, or settled on its nest. */
  onMothsEv?: (id: number, ev: "wake" | "circle" | "sleep", x: number, y: number) => void;
  /** The guest register, read (only standing at it). */
  onRegister?: (r: { ok: boolean; number?: number; error?: string }) => void;
  /** A lift ride answered: where you came out. */
  onLifted?: (r: { ok: boolean; x?: number; y?: number; floor?: number; error?: string }) => void;
  /** THE RUSTY DOOR, streamed from within sight like a door. */
  onRustyDoor?: (d: { x: number; y: number; side: number; open: boolean }) => void;
  /** The Boiler Key turned: the rusty door is open, for everyone. */
  onLevel6?: (who: string) => void;
  /** THE SEA HATCH (Lights Out), streamed from far out — you find it by ear. */
  onSeaHatch?: (d: { x: number; y: number; side: number; open: boolean }) => void;
  /** The Handwheel fitted: the sea hatch is open, for everyone. */
  onLevel7?: (who: string) => void;
  /** THE LISTENER near you, and what it is doing. */
  onListener?: (id: number, x: number, y: number, mode: string) => void;
  /** It touched somebody (you: the cold hand; anyone near: the whisper), or
   *  went back into the dark. */
  onListenerEv?: (id: number, ev: "touch" | "kill" | "gone", x: number, y: number, you: boolean) => void;
  /** THE SUBWAY STAIR (Thalassophobia), streamed from far out. */
  onSubway?: (d: { x: number; y: number; side: number; open: boolean }) => void;
  /** The helmet worn down to the stair: the subway is open, for everyone. */
  onLevel8?: (who: string) => void;
  /** THE CHIMNEY (the Cave System), streamed from far out. */
  onChimney?: (d: { x: number; y: number; side: number; open: boolean }) => void;
  /** The rope fixed at the Chimney: the climb is open, for everyone. */
  onLevel9?: (who: string) => void;
  /** THE BURROWER (the Cave System): where one is and what it's doing. */
  onBurrower?: (id: number, x: number, y: number, mode: string) => void;
  /** …it went back into the rock, or it took somebody. */
  onBurrowerEv?: (id: number, ev: "gone" | "kill" | "bite", x: number, y: number) => void;
  /** NUMBER 9's FRONT DOOR (the Suburbs), streamed from far out. */
  onFrontDoor?: (d: { x: number; y: number; side: number; open: boolean }) => void;
  /** The House Key turned in Number 9's front door: the way out is open. */
  onLevel10?: (who: string) => void;
  /** THE NEIGHBORHOOD WATCH (the Suburbs): where one is (h = its heading,
   *  radians) and what it's doing. */
  onWatch?: (id: number, x: number, y: number, h: number, mode: string) => void;
  /** …it knocked on a house, took somebody, or left the streets. */
  onWatchEv?: (id: number, ev: "knock" | "kill" | "gone", x: number, y: number) => void;
  /** THE THING BELOW: a swimmer's exposure reached a stage (1 the shadow, 2
   *  it circles, 3 it rises, 0 it sank away) — you, or somebody near; or it
   *  struck. */
  onDeep?: (ev: "stage" | "strike", stage: number, uid: number, x: number, y: number, you: boolean) => void;
  onWelcome: (w: Welcome) => void;
  /** You stepped through the passage — a mini-welcome for the other world.
   *  Tear the world down and rebuild from these parameters. */
  onTravel?: (t: TravelFrame) => void;
  onTravelDenied?: (error: string) => void;
  onDenied: (error: string) => void;
  onChunk: (c: ChunkData) => void;
  /** `suit` is the color they're actually wearing (server-sourced); `pose` is
   *  their body pose (0 stand · 1 crouch · 2 airborne) for the avatar's clip;
   *  `emote` is the dance they're mid-way through ("" = none). */
  onPos: (id: number, name: string, x: number, y: number, h: number, suit: string, pose: number, equip: string, pitch: number, emote: string) => void;
  onBye: (id: number) => void;
  onCorrect: (x: number, y: number) => void;
  onClosed: () => void;
  /** Extraction accepted — the run is over; show the Voss debrief. */
  onDebrief?: (revealed: number, ms: number, relics: DebriefRelic[], footage: string | null, test: boolean, home: boolean) => void;
  /** The server refused a walk-out (not close enough to the door). */
  onExitDenied?: (error: string) => void;
  /** Nearby relic sites — NAMED (Josh: you should be able to tell what it is
   *  before you walk to it). */
  onRelics?: (list: { id: number; x: number; y: number; relicId: string; name: string }[]) => void;
  /** Items lying on the carpet nearby (G-dropped; they rot after an hour). */
  onDrops?: (list: DropSite[]) => void;
  /** LORE DRIVES nearby. Finding one unlocks it for everyone on Solace. */
  onDrives?: (list: { id: string; x: number; y: number }[]) => void;
  /** You picked a drive up — its text arrives so you can read it there. */
  onDriveTaken?: (
    ok: boolean,
    drive: { driveId: string; title: string; file: string; body: string; ada: string; fresh: boolean } | null,
    error?: string,
  ) => void;
  /** Someone else found one (you are inside with them). */
  onDriveFound?: (title: string, finder: string) => void;
  /** THE KEY is lying within sight. */
  onKey?: (x: number, y: number) => void;
  onKeyTaken?: (ok: boolean, error?: string) => void;
  /** Someone picked the key up — the whole room should know. */
  onKeyInPlay?: (who: string) => void;
  /** THE DOOR — the only real door in Level 0 (and, with back=true, The
   *  Landing's way home in the Poolrooms). */
  onTheDoor?: (x: number, y: number, open: boolean, back: boolean) => void;
  onDoorTried?: (ok: boolean, fresh: boolean, error?: string) => void;
  /** LEVEL 1 IS OPEN. Fires once in the life of the world. */
  onLevel1?: (who: string) => void;
  /** THE DRAIN HATCH — the Poolrooms' door down to Pipe Dreams, in the floor. */
  onHatch?: (x: number, y: number, open: boolean) => void;
  /** PIPE DREAMS IS OPEN (the hatch) / THE PRESSURE DOOR IS OPEN (the fuses). */
  onLevel2?: (who: string) => void;
  onLevel3?: (who: string) => void;
  /** Pipe Dreams' fuses lying within sight. */
  onFuses?: (list: { i: number; x: number; y: number }[]) => void;
  onFuseTaken?: (ok: boolean, carrying: number, error?: string) => void;
  onFuseInPlay?: (who: string) => void;
  /** The fuse box beside the pressure door: how many are in, and whether the
   *  door has opened. `carrying` is how many YOU hold. */
  onFuseBox?: (b: { x: number; y: number; door: { x: number; y: number } | null; inserted: number; total: number; open: boolean; carrying: number }) => void;
  onFusesIn?: (ok: boolean, inserted: number, added: number, opened: boolean, error?: string) => void;
  onFuseAdded?: (who: string, inserted: number) => void;
  /** Your drop landed (or was refused) — `itemId` is the slot it came from. */
  onDropped?: (ok: boolean, itemId: number, kind?: string, error?: string) => void;
  /** You picked a dropped item up — `charge` is the wear it carries. */
  onTookDrop?: (ok: boolean, item: BrItem | null, charge: number | null, error?: string) => void;
  onRelicTaken?: (ok: boolean, relicId?: string, name?: string, error?: string, test?: boolean) => void;
  /** Same-channel walkie transmission started/stopped (radio audio path). */
  onWalkie?: (id: number, on: boolean) => void;
  /** A spray mark (live from someone nearby). */
  onMark?: (m: SprayMark) => void;
  /** A chunk's STORED marks — authoritative: replaces that chunk's paint. */
  onMarksBatch?: (cx: number, cy: number, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, marks: SprayMark[]) => void;
  /** THE OPERATOR VIEW, once a second, only while an admin is flying. */
  onOp?: (v: OperatorView) => void;
  /** THE ENTITIES (two since the relic-patrol rework), within dread range.
   *  No frames = that one isn't near you. */
  onEntity?: (x: number, y: number, mode: "wander" | "chase", id: number) => void;
  /** THE STALKER, within dread range. Shadow = following at a distance;
   *  hunt = the power is out and it's coming; flee = a flashlight burned it. */
  onStalker?: (x: number, y: number, mode: "shadow" | "hunt" | "flee", burn: boolean) => void;
  /** THE SHY GUY (Level 1). `gone` = it has left the world; drop the model.
   *  lurk = shadowing you, harmless; trigger = you looked, it is screaming
   *  with its face covered; chase = it is coming; flee/leave = it is going. */
  onShy?: (
    x: number,
    y: number,
    mode: "lurk" | "trigger" | "chase" | "flee" | "leave",
    targetId: number,
  ) => void;
  onShyGone?: () => void;
  /** THE BLEEDER (Level 3): it exists only in a section with no power.
   *  hunt = searching the dark; scream = it has seen someone and stands
   *  screaming (the warning); chase = it is coming; feed = over a body;
   *  retreat = the beam or the lights drove it off. `burn` = a held beam is
   *  on it right now. `h` is the server's heading. */
  onBleeder?: (x: number, y: number, h: number, mode: "hunt" | "scream" | "chase" | "feed" | "retreat", targetId: number, burn: boolean) => void;
  /** Back into the wiring: drop the model. */
  onBleederGone?: () => void;
  /** THE TEMP (Level 4): where it stands, its pose, whether it is moving. */
  onTemp?: (x: number, y: number, h: number, pose: number, moving: boolean) => void;
  onTempGone?: () => void;
  /** It stopped because somebody looked — the creak, and a new pose. */
  onTempFreeze?: (x: number, y: number, pose: number) => void;
  /** A zone of the office's troffers dipping, the same for everyone. */
  onBlink?: (zone: number, ms: number) => void;
  /** Its two cries, heard further than its frames reach. */
  onBleederCry?: (cry: "scream" | "retreat", x: number, y: number, targetId: number) => void;
  /** THE GRABBER (Pipe Dreams): where it is, what it is doing, who it is after. */
  onGrabber?: (x: number, y: number, h: number, mode: "stalk" | "grab" | "flee", targetId: number) => void;
  onGrabberGone?: () => void;
  /** The server's answer to a flycam toggle (refused: a landing it won't
   *  take, or not the admin). */
  onFly?: (ok: boolean, on: boolean, error: string) => void;
  /** A screech (a light found it) or the grab (named for its victim). */
  onGrabberCry?: (cry: "screech" | "grab", x: number, y: number, targetId: number) => void;
  /** THE ALLIGATORS (Level 1): one per large body of water. `h` is the
   *  server's heading — the mouth (the weapon) points along it. No frames =
   *  none near you. */
  onGator?: (id: number, x: number, y: number, h: number, mode: "idle" | "chase") => void;
  /** One landed a bite at (x,y) — the munch, audible to anyone close. */
  onGatorBite?: (id: number, x: number, y: number) => void;
  /** A DEATH, with the throw that made it (the ragdoll wire, Aug 2026):
   *  died at (x,y), body rests at (rx,ry) — the server slid it along
   *  dir/power under walk rules — and `seed` drives the identical flail on
   *  every client. Arrives before the dead/bye frames. Power 0 = crumple. */
  onDeath?: (ev: {
    id: number;
    x: number;
    y: number;
    rx: number;
    ry: number;
    dir: number;
    power: number;
    seed: number;
    cause: string;
    suit: string;
    /** The victim's heading at death — the one facing every client seeds the
     *  ragdoll with (self included), so the flail is identical everywhere. */
    h: number;
  }) => void;
  /** THE BOATS: the fleet snapshot (on arrival in the Poolrooms). */
  onBoats?: (list: BoatFrame[]) => void;
  /** A boat moved / its riders changed. */
  onBoat?: (b: BoatFrame) => void;
  /** Your seat changed: aboard (id + seat) or ashore (id null; error says why
   *  a board attempt was refused). */
  onBoatSeat?: (id: number | null, seat?: "captain" | "passenger", error?: string) => void;
  /** It threw a VOICE: replay a snatch of player `of`'s recent audio from
   *  (x,y). Client-local playback from the proximity-voice capture ring. */
  onStalkerMimic?: (of: number, x: number, y: number) => void;
  /** The sector's power sags for `ms` — everyone gets this at once.
   *  `black` = the middle stretch goes to full BLACKOUT (flashlight time). */
  onBrownout?: (ms: number, black: boolean) => void;
  /** It caught you. */
  onDead?: (cause?: string) => void;
  /** A FALL hurt you (v2): the server has already applied it. */
  onHurt?: (hp: number, drop: number, cause?: string) => void;
  /** A consumable was used (or refused) — apply its effect + clear the slot. */
  onConsumed?: (ok: boolean, itemId: number, kind?: string, hp?: number) => void;
  /** Somebody near you used a consumable (the sound is the whole message). */
  onPeerGear?: (id: number, kind: string, x: number, y: number) => void;
  /** Nearby fallen bodies (findable, lootable) — in the suit they died in. */
  onCorpses?: (list: { id: number; x: number; y: number; name: string; suit: string }[]) => void;
  /** A corpse's inventory (loot-open response). */
  onCorpseView?: (ok: boolean, id: number, name: string, items: CorpseItem[], error?: string) => void;
  /** A loot-take result: the item you got + what's left on the body. */
  onLooted?: (ok: boolean, item: CorpseItem | null, remaining: CorpseItem[], error?: string) => void;
}

export interface CorpseItem {
  kind: string;
  level: number;
  color: string | null;
  /** the locker id a looted piece of gear was given (a body never has one) */
  id?: number;
}

export interface DropSite {
  id: number;
  x: number;
  y: number;
  kind: string;
  level: number;
  color: string | null;
  charge: number | null;
}

export interface TravelFrame {
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  size: number;
  chunk: number;
  doors: DoorInfo[];
  districts: { id: number; type: string }[];
  you: { x: number; y: number };
  brownoutMs?: number;
  brownoutBlack?: boolean;
  station?: StationState;
  /** THE ABANDONED OFFICE (level 4): its keycard and stairwell door. */
  office?: OfficeState;
  /** THE TERROR HOTEL (level 5). */
  hotel?: HotelState;
  /** LIGHTS OUT (level 6). */
  lights?: LightsState;
  /** THALASSOPHOBIA (level 7). */
  ocean?: OceanState;
  /** THE CAVE SYSTEM (level 8). */
  cave?: CaveState;
  /** THE SUBURBS (level 9). */
  suburb?: SuburbState;
}

export interface DebriefRelic {
  relicId: string;
  name: string;
  fresh: boolean;
}

export interface SprayMark {
  level?: 0 | 1 | 2;
  cellX: number;
  cellY: number;
  face: string;
  u: number;
  v: number;
  color: string;
}

export interface GameNet {
  /** `level` 1 = enter THE POOLROOMS directly (requires THE DOOR open). */
  enter(door: number, loadout: number[], level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): void;
  /** LAW 12, the dead watching: Q/E, the orbit camera's yaw, the ghost's
   *  push-to-talk, and leaving the watch. */
  specCycle(dir: number): void;
  specCam(yaw: number): void;
  ghostPtt(on: boolean): void;
  specLeave(): void;
  /** THE ELECTRICAL STATION's levers. */
  throwBreaker(section: number): void;
  pullCutoff(section: number): void;
  /** `p` is the body pose (0 stand · 1 crouch · 2 airborne) — see onPos;
   *  `em` is the emote currently playing ("" = none, the usual). */
  move(x: number, y: number, h: number, p?: number, e?: string, pt?: number, em?: string): void;
  requestChunks(want: { cx: number; cy: number }[]): void;
  /** Ask to extract through the entry door (server verifies you're there). */
  exit(): void;
  walkieCh(ch: number): void;
  walkieTx(on: boolean): void;
  spray(m: { cellX: number; cellY: number; face: string; u: number; v: number }): void;
  takeRelic(id: number): void;
  /** Drop the held item where you stand (charge = its remaining seconds). */
  drop(itemId: number, charge: number | null): void;
  takeDrop(id: number): void;
  /** Pick up a lore drive (unlocks it for the whole platform). */
  takeDrive(id: string): void;
  /** Pick up THE KEY. */
  takeKey(): void;
  /** Try THE DOOR with the key in hand. */
  openDoor(): void;
  /** Pick up one of Pipe Dreams' fuses. */
  takeFuse(i: number): void;
  /** Put every fuse you carry in the fuse box. */
  insertFuses(): void;
  /** THE TERROR HOTEL: read the guest register (standing at it). */
  readRegister(): void;
  /** Press a floor in the lift you stand in (1-20). */
  lift(floor: number): void;
  /** Step through the passage (THE DOOR / The Landing) to the other level. */
  travel(): void;
  /** Give up the run: dies like any other death (body, ledger, no debrief). */
  forfeit(): void;
  cam(on: boolean): void;
  /** ADMIN FLYCAM on/off. The server re-verifies the admin flag — this is a
   *  request, and a non-admin's is simply refused. */
  setFly(on: boolean): void;
  consume(itemId: number): void;
  /** "I'm making noise" (speaking on the open mic) — the entity listens. */
  noise(): void;
  /** DROWNING report: the head crossed the waterline (or surfaced). The
   *  server gates it to swim-deep cells and owns the 10-second clock. */
  swim(sub: boolean): void;
  /** EYE CONTACT: the crosshair is on THE SHY GUY's model. A claim — the
   *  server re-checks range, line and facing before it takes offence. */
  shyLook(): void;
  /** THE BOATS: board the rowboat with this id / step off the one you ride. */
  boatBoard(id: number): void;
  boatLeave(): void;
  lootOpen(id: number): void;
  lootTake(id: number, idx: number): void;
  leave(): void;
  close(): void;
}

export function connectGame(handlers: GameNetHandlers): GameNet {
  const token = getToken() ?? "";
  const ws = new WebSocket(`${wsUrl("/ws-game")}?token=${encodeURIComponent(token)}`);
  let closedByUs = false;

  ws.onmessage = (ev) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    switch (m.type) {
      case "welcome":
        handlers.onWelcome(m as unknown as Welcome);
        break;
      case "denied":
        handlers.onDenied(String(m.error ?? "denied"));
        break;
      case "chunk":
        handlers.onChunk(m as unknown as ChunkData);
        break;
      case "pos":
        handlers.onPos(
          Number(m.id),
          String(m.name ?? ""),
          Number(m.x),
          Number(m.y),
          Number(m.h ?? 0),
          String(m.suit ?? "yellow"),
          Number(m.p ?? 0),
          String(m.e ?? ""),
          Number(m.pt ?? 0),
          String(m.em ?? ""),
        );
        break;
      case "bye":
        handlers.onBye(Number(m.id));
        break;
      case "correct":
        handlers.onCorrect(Number(m.x), Number(m.y));
        break;
      case "debrief":
        handlers.onDebrief?.(
          Number(m.revealed ?? 0),
          Number(m.ms ?? 0),
          ((m.relics as DebriefRelic[]) ?? []),
          (m.footage as string | null) ?? null,
          !!m.test,
          !!m.home,
        );
        break;
      case "exitDenied":
        handlers.onExitDenied?.(String(m.error ?? "not_at_door"));
        break;
      case "relics":
        handlers.onRelics?.((m.list as { id: number; x: number; y: number; relicId: string; name: string }[]) ?? []);
        break;
      case "drops":
        handlers.onDrops?.((m.list as DropSite[]) ?? []);
        break;
      case "drives":
        handlers.onDrives?.((m.list as { id: string; x: number; y: number }[]) ?? []);
        break;
      case "driveTaken":
        handlers.onDriveTaken?.(
          !!m.ok,
          m.ok
            ? {
                driveId: String(m.driveId ?? ""),
                title: String(m.title ?? ""),
                file: String(m.file ?? ""),
                body: String(m.body ?? ""),
                ada: String(m.ada ?? ""),
                fresh: !!m.fresh,
              }
            : null,
          m.error as string | undefined,
        );
        break;
      case "driveFound":
        handlers.onDriveFound?.(String(m.title ?? ""), String(m.finder ?? "someone"));
        break;
      case "key":
        handlers.onKey?.(Number(m.x), Number(m.y));
        break;
      case "keyTaken":
        handlers.onKeyTaken?.(!!m.ok, m.error as string | undefined);
        break;
      case "keyInPlay":
        handlers.onKeyInPlay?.(String(m.who ?? "someone"));
        break;
      case "thedoor":
        handlers.onTheDoor?.(Number(m.x), Number(m.y), !!m.open, !!m.back);
        break;
      case "travel":
        handlers.onTravel?.(m as unknown as TravelFrame);
        break;
      case "travelDenied":
        handlers.onTravelDenied?.(String(m.error ?? "denied"));
        break;
      case "doorTried":
        handlers.onDoorTried?.(!!m.ok, !!m.fresh, m.error as string | undefined);
        break;
      case "level1":
        handlers.onLevel1?.(String(m.who ?? "someone"));
        break;
      case "hatch":
        handlers.onHatch?.(Number(m.x), Number(m.y), !!m.open);
        break;
      case "level2":
        handlers.onLevel2?.(String(m.who ?? "someone"));
        break;
      case "power":
        handlers.onPower?.((m.power as StationState["power"]) ?? []);
        break;
      case "arc":
        handlers.onArc?.({ x: Number(m.x), y: Number(m.y), side: Number(m.side ?? 0), phase: m.phase === "fire" ? "fire" : "warn" });
        break;
      case "breaker":
        handlers.onBreaker?.({ section: Number(m.section), by: String(m.by ?? "someone"), on: Number(m.on ?? 0), total: Number(m.total ?? 6), opened: !!m.opened });
        break;
      case "breakerThrown":
        handlers.onBreakerThrown?.({ ok: !!m.ok, on: Number(m.on ?? 0), total: Number(m.total ?? 6), fresh: !!m.fresh, opened: !!m.opened, error: m.error as string | undefined });
        break;
      case "cutoffPulled":
        handlers.onCutoffPulled?.({ ok: !!m.ok, ms: Number(m.ms ?? 0), error: m.error as string | undefined });
        break;
      case "level4":
        handlers.onLevel4?.(String(m.who ?? "someone"));
        break;
      case "level5":
        handlers.onLevel5?.(String(m.who ?? "someone"));
        break;
      case "level6":
        handlers.onLevel6?.(String(m.who ?? "someone"));
        break;
      case "level7":
        handlers.onLevel7?.(String(m.who ?? "someone"));
        break;
      case "seahatch":
        handlers.onSeaHatch?.({ x: Number(m.x), y: Number(m.y), side: Number(m.side ?? 0), open: !!m.open });
        break;
      case "listener":
        handlers.onListener?.(Number(m.id), Number(m.x), Number(m.y), String(m.m ?? "wander"));
        break;
      case "listenerEv":
        handlers.onListenerEv?.(Number(m.id), String(m.ev) as "touch" | "kill" | "gone", Number(m.x ?? 0), Number(m.y ?? 0), !!m.you);
        break;
      case "level8":
        handlers.onLevel8?.(String(m.who ?? "someone"));
        break;
      case "level9":
        handlers.onLevel9?.(String(m.who ?? "someone"));
        break;
      case "chimney":
        handlers.onChimney?.({ x: Number(m.x), y: Number(m.y), side: Number(m.side ?? 0), open: !!m.open });
        break;
      case "frontdoor":
        handlers.onFrontDoor?.({ x: Number(m.x), y: Number(m.y), side: Number(m.side ?? 0), open: !!m.open });
        break;
      case "level10":
        handlers.onLevel10?.(String(m.who ?? "someone"));
        break;
      case "watch":
        handlers.onWatch?.(Number(m.id), Number(m.x), Number(m.y), Number(m.h ?? 0), String(m.m ?? "patrol"));
        break;
      case "watchEv":
        handlers.onWatchEv?.(Number(m.id), String(m.ev) === "kill" ? "kill" : String(m.ev) === "knock" ? "knock" : "gone", Number(m.x ?? 0), Number(m.y ?? 0));
        break;
      case "burrower":
        handlers.onBurrower?.(Number(m.id), Number(m.x), Number(m.y), String(m.m ?? "roam"));
        break;
      case "burrowerEv":
        handlers.onBurrowerEv?.(Number(m.id), String(m.ev) === "kill" ? "kill" : String(m.ev) === "bite" ? "bite" : "gone", Number(m.x ?? 0), Number(m.y ?? 0));
        break;
      case "subway":
        handlers.onSubway?.({ x: Number(m.x), y: Number(m.y), side: Number(m.side ?? 0), open: !!m.open });
        break;
      case "deepEv":
        handlers.onDeep?.(m.ev === "strike" ? "strike" : "stage", Number(m.stage ?? 0), Number(m.uid ?? 0), Number(m.x ?? 0), Number(m.y ?? 0), !!m.you);
        break;
      case "heat":
        handlers.onHeat?.(Number(m.v ?? 0));
        break;
      case "moths":
        handlers.onMoths?.(Number(m.id), Number(m.x), Number(m.y), String(m.m ?? "hunting"));
        break;
      case "mothsEv":
        handlers.onMothsEv?.(Number(m.id), String(m.ev) as "wake" | "circle" | "sleep", Number(m.x), Number(m.y));
        break;
      case "register":
        handlers.onRegister?.({ ok: !!m.ok, number: m.number === undefined ? undefined : Number(m.number), error: m.error as string | undefined });
        break;
      case "lifted":
        handlers.onLifted?.({ ok: !!m.ok, x: m.x === undefined ? undefined : Number(m.x), y: m.y === undefined ? undefined : Number(m.y), floor: m.floor === undefined ? undefined : Number(m.floor), error: m.error as string | undefined });
        break;
      case "rustydoor":
        handlers.onRustyDoor?.({ x: Number(m.x), y: Number(m.y), side: Number(m.side ?? 0), open: !!m.open });
        break;
      case "stairdoor":
        handlers.onStairDoor?.({ x: Number(m.x), y: Number(m.y), side: Number(m.side ?? 0), open: !!m.open });
        break;
      case "level3":
        handlers.onLevel3?.(String(m.who ?? "someone"));
        break;
      case "fuses":
        handlers.onFuses?.((m.list as { i: number; x: number; y: number }[]) ?? []);
        break;
      case "fuseTaken":
        handlers.onFuseTaken?.(!!m.ok, Number(m.carrying ?? 0), m.error as string | undefined);
        break;
      case "fuseInPlay":
        handlers.onFuseInPlay?.(String(m.who ?? "someone"));
        break;
      case "fusebox":
        handlers.onFuseBox?.({ x: Number(m.x), y: Number(m.y), door: (m.door as { x: number; y: number } | null) ?? null, inserted: Number(m.inserted ?? 0), total: Number(m.total ?? 3), open: !!m.open, carrying: Number(m.carrying ?? 0) });
        break;
      case "fusesIn":
        handlers.onFusesIn?.(!!m.ok, Number(m.inserted ?? 0), Number(m.added ?? 0), !!m.opened, m.error as string | undefined);
        break;
      case "fuseAdded":
        handlers.onFuseAdded?.(String(m.who ?? "someone"), Number(m.inserted ?? 0));
        break;
      case "dropped":
        handlers.onDropped?.(
          !!m.ok,
          Number(m.itemId ?? -1),
          m.kind as string | undefined,
          m.error as string | undefined,
        );
        break;
      case "tookDrop":
        handlers.onTookDrop?.(
          !!m.ok,
          (m.item as BrItem) ?? null,
          m.charge === null || m.charge === undefined ? null : Number(m.charge),
          m.error as string | undefined,
        );
        break;
      case "relicTaken":
        handlers.onRelicTaken?.(!!m.ok, m.relicId as string | undefined, m.name as string | undefined, m.error as string | undefined, !!m.test);
        break;
      case "walkie":
        handlers.onWalkie?.(Number(m.id), !!m.on);
        break;
      case "mark":
        handlers.onMark?.(m as unknown as SprayMark);
        break;
      case "op":
        handlers.onOp?.(m.view as OperatorView);
        break;
      case "marks":
        handlers.onMarksBatch?.(
          Number(m.cx),
          Number(m.cy),
          // Sep 2026 review: Pipe Dreams' marks were read as Level 0's
          Number(m.level) === 3 ? 3 : Number(m.level) === 2 ? 2 : Number(m.level) === 1 ? 1 : 0,
          (m.marks as SprayMark[]) ?? [],
        );
        break;
      case "entity":
        handlers.onEntity?.(Number(m.x), Number(m.y), m.mode === "chase" ? "chase" : "wander", Number(m.id ?? 0));
        break;
      case "boats":
        handlers.onBoats?.((m.list as BoatFrame[]) ?? []);
        break;
      case "boat":
        handlers.onBoat?.({
          id: Number(m.id),
          x: Number(m.x),
          y: Number(m.y),
          h: Number(m.h ?? 0),
          captain: m.captain === null || m.captain === undefined ? null : Number(m.captain),
          passenger: m.passenger === null || m.passenger === undefined ? null : Number(m.passenger),
        });
        break;
      case "boatSeat":
        handlers.onBoatSeat?.(
          m.id === null || m.id === undefined ? null : Number(m.id),
          m.seat as "captain" | "passenger" | undefined,
          m.error as string | undefined,
        );
        break;
      case "stalker":
        handlers.onStalker?.(
          Number(m.x),
          Number(m.y),
          m.mode === "hunt" ? "hunt" : m.mode === "flee" ? "flee" : "shadow",
          !!m.burn,
        );
        break;
      case "stalkerMimic":
        handlers.onStalkerMimic?.(Number(m.of), Number(m.x), Number(m.y));
        break;
      case "spectate":
        if (m.none) handlers.onSpectate?.(null);
        else
          handlers.onSpectate?.({
            target: Number(m.target),
            targets: Array.isArray(m.targets) ? (m.targets as { id: number; name: string }[]).map((t) => ({ id: Number(t.id), name: String(t.name ?? "") })) : [],
            talkLeftMs: Number(m.talkLeftMs ?? 0),
            talking: !!m.talking,
            refillInMs: Number(m.refillInMs ?? 0),
            watchers: Array.isArray(m.watchers) ? (m.watchers as unknown[]).map(Number) : [],
          });
        break;
      case "ghost":
        handlers.onGhost?.({ id: Number(m.id), name: String(m.name ?? "someone"), on: !!m.on, yaw: Number(m.yaw ?? 0) });
        break;
      case "temp":
        if (m.gone) handlers.onTempGone?.();
        else handlers.onTemp?.(Number(m.x), Number(m.y), Number(m.h ?? 0), Number(m.pose ?? 0), !!m.moving);
        break;
      case "tempFreeze":
        handlers.onTempFreeze?.(Number(m.x), Number(m.y), Number(m.pose ?? 0));
        break;
      case "blink":
        handlers.onBlink?.(Number(m.zone ?? 0), Number(m.ms ?? 400));
        break;
      case "bleeder":
        if (m.gone) handlers.onBleederGone?.();
        else {
          const mode = String(m.mode);
          handlers.onBleeder?.(
            Number(m.x),
            Number(m.y),
            Number(m.h ?? 0),
            (["hunt", "scream", "chase", "feed", "retreat"].includes(mode) ? mode : "hunt") as "hunt" | "scream" | "chase" | "feed" | "retreat",
            Number(m.targetId ?? 0),
            !!m.burn,
          );
        }
        break;
      case "fly":
        handlers.onFly?.(m.ok !== false, !!m.on, String(m.error ?? ""));
        break;
      case "grabber":
        if (m.gone) handlers.onGrabberGone?.();
        else {
          const mode = String(m.mode);
          handlers.onGrabber?.(
            Number(m.x),
            Number(m.y),
            Number(m.h ?? 0),
            (["stalk", "grab", "flee"].includes(mode) ? mode : "stalk") as "stalk" | "grab" | "flee",
            Number(m.targetId ?? 0),
          );
        }
        break;
      case "grabberCry":
        handlers.onGrabberCry?.(m.cry === "grab" ? "grab" : "screech", Number(m.x), Number(m.y), Number(m.targetId ?? 0));
        break;
      case "bleederCry":
        handlers.onBleederCry?.(m.cry === "retreat" ? "retreat" : "scream", Number(m.x), Number(m.y), Number(m.targetId ?? 0));
        break;
      case "shy":
        if (m.gone) handlers.onShyGone?.();
        else {
          handlers.onShy?.(
            Number(m.x),
            Number(m.y),
            (["lurk", "trigger", "chase", "flee", "leave"].includes(String(m.mode))
              ? String(m.mode)
              : "lurk") as "lurk" | "trigger" | "chase" | "flee" | "leave",
            Number(m.targetId ?? 0),
          );
        }
        break;
      case "gator":
        handlers.onGator?.(
          Number(m.id ?? 0),
          Number(m.x),
          Number(m.y),
          Number(m.h ?? 0),
          m.mode === "chase" ? "chase" : "idle",
        );
        break;
      case "death":
        handlers.onDeath?.({
          id: Number(m.id ?? 0),
          x: Number(m.x),
          y: Number(m.y),
          rx: Number(m.rx ?? m.x),
          ry: Number(m.ry ?? m.y),
          dir: Number(m.dir ?? 0),
          power: Number(m.power ?? 0),
          seed: Number(m.seed ?? 1),
          cause: String(m.cause ?? ""),
          suit: String(m.suit ?? "yellow"),
          h: Number(m.h ?? m.dir ?? 0),
        });
        break;
      case "gatorBite":
        handlers.onGatorBite?.(Number(m.id ?? 0), Number(m.x), Number(m.y));
        break;
      case "brownout":
        handlers.onBrownout?.(Number(m.ms ?? 0), !!m.black);
        break;
      case "dead":
        handlers.onDead?.((m as { cause?: string }).cause);
        break;
      case "peergear":
        handlers.onPeerGear?.(Number(m.id), String(m.kind ?? ""), Number(m.x), Number(m.y));
        break;
      case "consumed":
        handlers.onConsumed?.(
          !!m.ok,
          Number(m.itemId),
          m.kind as string | undefined,
          m.hp === undefined ? undefined : Number(m.hp),
        );
        break;
      case "hurt":
        handlers.onHurt?.(Number(m.hp ?? 0), Number(m.drop ?? 0), m.cause as string | undefined);
        break;
      case "corpses":
        handlers.onCorpses?.((m.list as { id: number; x: number; y: number; name: string; suit: string }[]) ?? []);
        break;
      case "corpse":
        handlers.onCorpseView?.(
          !!m.ok,
          Number(m.id ?? -1),
          String(m.name ?? ""),
          (m.items as CorpseItem[]) ?? [],
          m.error as string | undefined,
        );
        break;
      case "looted":
        handlers.onLooted?.(
          !!m.ok,
          (m.item as CorpseItem) ?? null,
          (m.remaining as CorpseItem[]) ?? [],
          m.error as string | undefined,
        );
        break;
    }
  };
  ws.onclose = () => {
    if (!closedByUs) handlers.onClosed();
  };
  ws.onerror = () => {
    /* onclose follows */
  };

  const send = (msg: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  return {
    enter: (door, loadout, level = 0) => {
      const msg = { type: "enter", door, loadout, level };
      if (ws.readyState === WebSocket.OPEN) send(msg);
      else ws.addEventListener("open", () => send(msg), { once: true });
    },
    move: (x, y, h, p = 0, e = "", pt = 0, em = "") => send({ type: "move", x, y, h, p, e, pt, em }),
    requestChunks: (want) => {
      if (want.length) send({ type: "chunks", want });
    },
    exit: () => send({ type: "exit" }),
    walkieCh: (ch) => send({ type: "walkie-ch", ch }),
    walkieTx: (on) => send({ type: "walkie-tx", on }),
    spray: (m) => send({ type: "spray", ...m }),
    takeRelic: (id: number) => send({ type: "take-relic", id }),
    drop: (itemId: number, charge: number | null) => send({ type: "drop", itemId, charge }),
    takeDrop: (id: number) => send({ type: "take-drop", id }),
    takeDrive: (id: string) => send({ type: "take-drive", id }),
    takeKey: () => send({ type: "take-key" }),
    openDoor: () => send({ type: "open-door" }),
    takeFuse: (i: number) => send({ type: "take-fuse", i }),
    insertFuses: () => send({ type: "insert-fuses" }),
    readRegister: () => send({ type: "read-register" }),
    lift: (floor: number) => send({ type: "lift", floor }),
    travel: () => send({ type: "travel" }),
    throwBreaker: (section: number) => send({ type: "throw-breaker", section }),
    specCycle: (dir: number) => send({ type: "spec-cycle", dir }),
    specCam: (yaw: number) => send({ type: "spec-cam", yaw }),
    ghostPtt: (on: boolean) => send({ type: "ghost-ptt", on }),
    specLeave: () => send({ type: "spec-leave" }),
    pullCutoff: (section: number) => send({ type: "pull-cutoff", section }),
    forfeit: () => send({ type: "forfeit" }),
    cam: (on: boolean) => send({ type: "cam", on }),
    setFly: (on: boolean) => send({ type: "fly", on }),
    consume: (itemId: number) => send({ type: "consume", itemId }),
    noise: () => send({ type: "noise" }),
    swim: (sub) => send({ type: "swim", sub }),
    shyLook: () => send({ type: "shy-look" }),
    boatBoard: (id) => send({ type: "boatBoard", id }),
    boatLeave: () => send({ type: "boatLeave" }),
    lootOpen: (id: number) => send({ type: "loot-open", id }),
    lootTake: (id: number, idx: number) => send({ type: "loot-take", id, idx }),
    leave: () => send({ type: "leave" }),
    close: () => {
      closedByUs = true;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/** What a flying admin sees of the whole level (server: BrService.operatorView). */
export interface OperatorView {
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  monsters: { kind: "entity" | "stalker" | "shy" | "gator" | "bleeder" | "grabber" | "temp" | "moths" | "listener" | "deep" | "burrower" | "watch"; id: number; x: number; y: number; mode: string }[];
  relics: { x: number; y: number; name: string }[];
  drives: { id: string; x: number; y: number }[];
  objectives: { kind: string; label: string; x: number; y: number; state: string }[];
  /** Every body on the level (older servers omit it). */
  bodies?: { id: number; name: string; x: number; y: number; items: number; carriesObjective: boolean }[];
}
