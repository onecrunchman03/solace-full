// SOLACE SURVIVORZ — THE SOUND RULES, as plain arithmetic (SURVIVORZ.md §8 noise, ASSETS.md §2f).
//
// Everything the sound engine (engine.ts) decides that isn't an AudioNode lives here and imports
// nothing but the Backrooms' voice mix, so a plain Node harness (scripts/survivorz/test-audio.mjs)
// can hold it without a browser: which take plays, how a footstep is shaped, how far a sound
// carries for the camera, what a wall does to it, each room's echo and which device a recording
// plays through.
//
// THE REUSE LAW: distance, walls and the room's ring use the Backrooms' voiceMix — the same rule
// every proximity voice in Solace already follows — with the gate set to the sound's own range.
import { voiceMix, type VoiceMix } from "../../backrooms/voicemix.ts";

// ---- which take --------------------------------------------------------------------------------

/** A take index for a sound with `n` takes that is never the one played last (when there's a
 *  choice). The same rule as lib/linepick.ts: exclude the last, draw from the rest. */
export function pickTake(n: number, last: number | undefined, rand: () => number): number {
  if (n <= 1) return 0;
  if (last === undefined || last < 0 || last >= n) return Math.floor(rand() * n);
  const k = Math.floor(rand() * (n - 1));
  return k >= last ? k + 1 : k;
}

// ---- footsteps ---------------------------------------------------------------------------------
// One pool of steps per surface, played three ways (Josh, Oct 21: "make them louder and faster for
// running and slower and quieter for sneaking"); the manifest carries the paces and the jitter.

export interface Pace { gainDb: number; pitch: number; lowpassHz: number | null }
export interface Jitter { pitch: number; gainDb: number }
export type PaceId = "walk" | "run" | "sneak";

export interface StepShape { gain: number; rate: number; lowpassHz: number | null }

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** How one footstep is played: the pace's level, pitch and filter, nudged by the jitter so no two
 *  steps land the same. */
export function stepShape(paces: Record<string, Pace>, jitter: Jitter, pace: PaceId, rand: () => number): StepShape {
  const p = paces[pace] ?? { gainDb: 0, pitch: 1, lowpassHz: null };
  const j = (span: number) => (rand() * 2 - 1) * span;
  return { gain: dbToGain(p.gainDb + j(jitter.gainDb)), rate: p.pitch * (1 + j(jitter.pitch)), lowpassHz: p.lowpassHz };
}

/** EVERY FOOTSTEP'S LEVEL (Nov 2026 — Josh: "footsteps are super loud"): the steps are mastered to -20 LUFS, 4 dB
 *  under the voices — but a step is all transient, so at that loudness its peak hit as hard as a word, a run added
 *  4 dB more, and six people walking buried the room. Real steps sit well under speech: -10 dB, for everyone's. */
export const STEP_LEVEL = 0.32;

/** Steps a second at each pace (the animation decides in the game; this is the bench's cadence). */
export const STEP_RATE: Record<PaceId, number> = { walk: 1.8, run: 2.8, sneak: 1.1 };

/** The surface under a room's floor, for its footsteps. */
export type Surface = "concrete" | "vinyl" | "grating" | "water" | "vent" | "wood" | "gravel" | "stone" | "carpet";
export const STEP_SOUND: Record<Surface, string> = {
  concrete: "step-concrete", vinyl: "step-vinyl", grating: "step-grating", water: "step-water", vent: "step-vent-crawl",
  wood: "step-wood", gravel: "step-gravel", stone: "step-stone", carpet: "step-carpet",
};

// ---- A HOUSE (Glenridge Hall): its floors, how its rooms ring and its weather, by room ---------------------
// The scene says which rooms are a house's, which are out of doors or below ground, and THE FLOOR THE BUILD LAID
// in each (show/scene.ts: setHouse; the site file's `surface`, from scripts/survivorz/glenridge/floors.py). The
// floor is never guessed from a room's name: the review of Nov 13 2026 found the guess wrong in 31 rooms of 77
// (the Great Hall is oak boards, and stone was heard). How a room RINGS is by its id: the first rule it matches.
interface HouseRoom { id: string; outdoor: boolean; surface?: string; below?: boolean }
let HOUSE: Map<string, HouseRoom> | null = null;
/** the house in play (null: the bunker) */
export function setHouse(rooms: HouseRoom[] | null): void { HOUSE = rooms ? new Map(rooms.map((r) => [r.id, r])) : null; }
const HOUSE_RING: [RegExp, RoomPreset][] = [
  [/^(great-hall|gallery|stair-hall)/, "hall"],                     // the tall oak rooms off the hall (not the low galleries above)
  [/vestibule|inglenook|hearth-stair|vault|arcade|solarium/, "tiled"],          // stone and glass: bright
  [/kitchen|pantry|scullery|larder|bath|ladies|gents|laundry|lavatory|wc/, "tiled"],
  [/cellar|furnace|coal|garage|boiler|store|basement-stair/, "concrete"],
  [/bedroom|boudoir|suite|dressing|closets|nursery|hidden-study|sitting/, "padded"],   // beds, rugs, books, upholstery
];
const SURFACES = new Set<string>(["concrete", "vinyl", "grating", "water", "vent", "wood", "gravel", "stone", "carpet"]);
function houseRule(roomId: string): [Surface, RoomPreset] | null {
  const r = HOUSE?.get(roomId);
  if (!r) return null;
  const floor = (r.surface && SURFACES.has(r.surface) ? r.surface : r.outdoor ? "gravel" : "wood") as Surface;
  if (r.outdoor) return [floor, "outside"];
  for (const [re, a] of HOUSE_RING) if (re.test(roomId)) return [floor, a];
  return [floor, "office"];
}
/** an open porch or arcade hears the rain as the grounds do (the picture's word for the same rooms is
 *  show/site.ts OPEN_AIR: test-page.mjs holds the two equal; this file imports nothing of the page's) */
const OPEN_AIR = /porch|arcade/;

// ---- how far a sound carries, for the CAMERA -------------------------------------------------------
// Not the zombies' hearing (that's the noise table in SURVIVORZ.md §8, server-side): this is how far
// the stream's listener can hear something, so a gunshot two rooms away still reads.

const RANGE_BY_GROUP: Record<string, number> = {
  footsteps: 22, guns: 90, melee: 26, zombies: 34, "facility beds": 0, facility: 40, doors: 34,
  survival: 18, mechanics: 30, vocals: 36, pa: 0, audiologs: 0, score: 0,
};
const RANGE_BY_ID: Record<string, number> = {
  "gun-distant": 0, "gun-dryfire": 14, "gun-casing": 10, "gun-pistol-mag-out": 12, "gun-pistol-mag-in": 12,
  "gun-pistol-slide": 14, "gun-rifle-mag": 12, "gun-rifle-bolt": 14, "gun-shotgun-pump": 18, "gun-shotgun-load": 12,
  "zombie-horde": 60, "zombie-alert": 50, "zombie-bang-door": 44, "vault-open": 70, "vault-close": 70,
  "alarm-klaxon": 0, "alarm-siren": 0, "pipebomb-blast": 110, "molotov-break": 40, "pipe-burst": 50,
  "metal-clatter": 36, "glass-break": 40, "lab-machine": 40, "alarm-clock": 34, "vocal-scream": 55,
  "breaker-throw": 30, "power-on": 0, "power-off": 0, "light-flicker": 20, "rumble-distant": 0, "elevator": 40,
};

/** Metres the camera can hear this sound from. 0 = not positional: it plays everywhere (a zone's bed,
 *  the PA through every speaker, the score, an audio log held to the ear). */
export function audibleRange(id: string, group: string): number {
  if (id in RANGE_BY_ID) return RANGE_BY_ID[id];
  if (group === "vocals" && /-scream$/.test(id)) return RANGE_BY_ID["vocal-scream"];
  return RANGE_BY_GROUP[group] ?? 30;
}

/** What a positional sound's chain should be set to: the Backrooms' voice mix, gated at the sound's
 *  own range instead of 48 m. `walls` is how many walls or shut doors stand between. */
export function worldMix(distM: number, walls: number, rangeM: number, roomMix: number): VoiceMix {
  return voiceMix(distM, walls, rangeM, roomMix);
}

// ---- the rooms' acoustics ------------------------------------------------------------------------

export type RoomPreset = "office" | "tiled" | "concrete" | "hall" | "metal" | "lab" | "tunnel" | "padded" | "outside";

/** A convolution reverb made from noise: how long it rings, how soon the first reflection, how
 *  bright the tail, and how much of it the room adds. engine.ts builds the impulse from these. */
export interface Acoustic { decayS: number; predelayMs: number; damping: number; mix: number }

export const ACOUSTIC: Record<RoomPreset, Acoustic> = {
  office:   { decayS: 0.45, predelayMs: 6,  damping: 0.65, mix: 0.10 },   // carpet, ceiling tiles, people
  padded:   { decayS: 0.25, predelayMs: 3,  damping: 0.8,  mix: 0.05 },   // bunks, the panic room
  lab:      { decayS: 0.8,  predelayMs: 10, damping: 0.45, mix: 0.16 },   // hard benches, glass
  tiled:    { decayS: 1.1,  predelayMs: 8,  damping: 0.25, mix: 0.24 },   // showers, the morgue, the kitchen
  concrete: { decayS: 1.4,  predelayMs: 14, damping: 0.4,  mix: 0.22 },   // corridors, stores, stairs
  metal:    { decayS: 1.6,  predelayMs: 9,  damping: 0.2,  mix: 0.26 },   // catwalks, the pipe gallery, the vault
  hall:     { decayS: 2.8,  predelayMs: 30, damping: 0.35, mix: 0.3 },    // the generator hall, the cryo hall
  tunnel:   { decayS: 3.4,  predelayMs: 45, damping: 0.5,  mix: 0.34 },   // the transit tunnels
  outside:  { decayS: 1.8,  predelayMs: 60, damping: 0.6,  mix: 0.12 },
};

/** Each room of facility-map.ts and how it rings. A room missing here takes its kind's default. */
export const ROOM_ACOUSTIC: Record<string, RoomPreset> = {
  outside: "tunnel", "vault-chamber": "metal", reception: "office", "security-desk": "office", "decon-entry": "tiled",
  "res-corridor": "concrete", canteen: "lab", kitchen: "tiled", stores: "concrete", "bunks-a": "padded", "bunks-b": "padded",
  showers: "tiled", "rec-room": "office", "panic-room": "padded", "safe-res": "padded",
  "labs-corridor": "lab", "glass-offices": "office", airlock: "metal", "decon-shower": "tiled", "suit-room": "lab",
  "clean-lab-a": "lab", "clean-lab-b": "lab",
  "med-corridor": "lab", ward: "lab", operating: "tiled", morgue: "tiled", "cold-storage": "metal", quarantine: "tiled",
  "quarantine-cell": "tiled", "safe-med": "padded",
  "sec-corridor": "concrete", "control-room": "office", armoury: "concrete", "camera-room": "office", holding: "concrete",
  "holding-cell": "concrete",
  "service-stairs": "concrete", "generator-hall": "hall", boiler: "metal", "maint-lockup": "metal", catwalks: "metal",
  "pipe-gallery": "metal", "safe-power": "padded",
  observation: "lab", "specimen-cells": "tiled", "cryo-hall": "hall", "cryo-pod": "metal",
  "deep-corridor": "concrete", "deep-lab": "lab", "tunnel-junction": "tunnel", "far-tunnels": "tunnel",
  // the to-scale map's added rooms (facility-map v2)
  "break-room": "office", conference: "office", "server-room": "lab", "lab-storage": "concrete",
  "med-hall": "lab", pharmacy: "lab", "exam-rooms": "lab", "med-office": "office", "staff-lounge": "office",
  "sec-lockers": "tiled", interview: "padded", "sec-office": "office",
  "containment-stairs": "concrete", "freight-lift": "metal", workshop: "concrete", "pump-room": "metal",
  "sample-storage": "metal", "deep-office": "office", "service-tunnel": "tunnel",
};

export function roomAcoustic(roomId: string | null | undefined): RoomPreset {
  const h = roomId ? houseRule(roomId) : null;
  if (h) return h[1];
  return (roomId && ROOM_ACOUSTIC[roomId]) || "concrete";
}

/** The floor under each room, for its footsteps. */
export const ROOM_SURFACE: Record<string, Surface> = {
  "vault-chamber": "concrete", outside: "concrete", "decon-entry": "vinyl", reception: "vinyl", "security-desk": "vinyl",
  catwalks: "grating", "pipe-gallery": "grating", boiler: "grating", "generator-hall": "concrete", "far-tunnels": "concrete",
  "tunnel-junction": "water", "pump-room": "grating", "freight-lift": "grating", "service-tunnel": "concrete",
};
export function roomSurface(roomId: string | null | undefined): Surface {
  if (!roomId) return HOUSE ? "gravel" : "concrete";
  const h = houseRule(roomId);
  if (h) return h[0];
  if (roomId in ROOM_SURFACE) return ROOM_SURFACE[roomId];
  const a = ROOM_ACOUSTIC[roomId];
  return a === "lab" || a === "office" || a === "padded" || a === "tiled" ? "vinyl" : "concrete";
}

// ---- each zone's room tone (the "facility beds" loops) ----------------------------------------------

/** How loud the bed is where the listener stands (1 = as recorded). A house's rain: full out in it, well down
 *  under a roof, and only a murmur below ground. */
export function bedLevel(roomId?: string | null): number {
  if (!HOUSE) return 1;
  const r = roomId ? HOUSE.get(roomId) : undefined;
  if (!r || r.outdoor || OPEN_AIR.test(r.id)) return 1.2;
  return r.below ? 0.22 : 0.62;
}

/** The bed under the listener's room: its zone's, with the rooms that have their own. */
export function bedOf(zone: string | null, roomId?: string | null): string | null {
  // a house on a storm night: the rain, as it is heard out in it or from inside
  if (HOUSE) { const r = roomId ? HOUSE.get(roomId) : undefined; return !r || r.outdoor || OPEN_AIR.test(r.id) ? "rain-out" : "rain-in"; }
  if (roomId === "generator-hall") return "bed-generator-hall";
  if (roomId === "far-tunnels" || roomId === "tunnel-junction" || roomId === "service-tunnel" || roomId === "outside") return "bed-tunnels";
  switch (zone) {
    case "lobby": return "bed-fluorescent";
    case "residential": return "bed-residential";
    case "labs": return "bed-labs";
    case "medical": return "bed-medical";
    case "security": return "bed-security";
    case "power": return "bed-power";
    case "containment": return "bed-containment";
    case "deep": return "bed-deeplab";
    default: return null;
  }
}

// ---- the devices a recording plays through ----------------------------------------------------------

export type Device = "tape" | "phone" | "pa" | null;

/** A recording's device: the audio logs are handheld tape (Ashby's call is a phone line), the PA is
 *  the ceiling speakers. Everything else is the world itself. */
export function deviceOf(id: string, group: string): Device {
  if (id === "log-a04") return "phone";
  if (group === "audiologs") return "tape";
  if (group === "pa" || id === "pa-chime") return "pa";
  return null;
}

/** Each device's colour: the band it passes, how hard it's driven, and its hiss. */
export const DEVICE_SHAPE: Record<Exclude<Device, null>, { lowHz: number; highHz: number; drive: number; hiss: number }> = {
  tape:  { lowHz: 180, highHz: 6500, drive: 0.25, hiss: 0.012 },
  phone: { lowHz: 320, highHz: 3400, drive: 0.45, hiss: 0.006 },
  pa:    { lowHz: 420, highHz: 4200, drive: 0.35, hiss: 0.004 },
};

// ---- ducking ----------------------------------------------------------------------------------------
// The score and the beds sit UNDER anyone speaking on camera (ASSETS.md §2h: "it stays under the
// voices"), and under an audio log or a PA line while it plays.

export const DUCK = {
  musicDb: -9, bedsDb: -5,          // how far down while someone speaks
  attackS: 0.15, releaseS: 1.2,     // down fast, back up slowly
};
