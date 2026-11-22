// THE MAP EDITOR's server half (Josh, Sep 2026: "I would the editor to be
// available in the admin panel so I can design and redesigns maps").
//
// A level is a ROOM LIBRARY plus a SEED: the generator arranges the rooms,
// the seed decides how. This module is everything the editor asks of the
// server about a library — is it well formed, what map does it build, may it
// go live — with no knowledge of HTTP or of who is playing. The route
// (routes/mapeditor.ts) does the asking; the service (service.ts) swaps the
// live map; the store (migration 103) keeps drafts and published versions.
//
// All four levels are built from rooms: the Lobby (Level 0, a lattice packed
// wall to wall), the Poolrooms (Level 1, a bathhouse in three zones), Pipe
// Dreams (Level 2, a route down three decks), the Electrical Station
// (Level 3, six sections on their own circuits) and the Abandoned Office
// (Level 4, an office floor in eight blink zones).

import { type TileDef } from "./tiles";
import { lintTile as lintPipeTile } from "./pipes-tiles";
import { lintPoolTile } from "./pools-tiles";
import { lintLobbyTile } from "./lobby-tiles";
import { lintStationTile } from "./station-tiles";
import { planStationSector, validateStationSector, SECTOR_S, STATION_LIBRARY } from "./worldgen-station";
import { SECTIONS } from "./station-vocab";
import { lintOfficeTile } from "./office-tiles";
import { planOfficeSector, validateOfficeSector, SECTOR_O, OFFICE_LIBRARY } from "./worldgen-office";
import { BLINK_ZONES, ODECO, odecoKind } from "./office-vocab";
import { lintHotelTile } from "./hotel-tiles";
import { planHotelSector, validateHotelSector, SECTOR_H, HOTEL_LIBRARY } from "./worldgen-hotel";
import { SUITES_MIN } from "./hotel-vocab";
import { lintLightsTile } from "./lights-tiles";
import { planLightsSector, validateLightsSector, SECTOR_L, LIGHTS_LIBRARY } from "./worldgen-lights";
import { WHEEL_SPOTS_MIN, BATTERY_SPOTS_MIN } from "./lights-vocab";
import { lintOceanTile } from "./ocean-tiles";
import { planOceanSector, validateOceanSector, SECTOR_T, OCEAN_LIBRARY } from "./worldgen-ocean";
import { HELMET_SPOTS_MIN, PLAZA_FLOOR } from "./ocean-vocab";
import { lintCaveTile } from "./cave-tiles";
import { planCaveSector, validateCaveSector, SECTOR_C, CAVE_LIBRARY } from "./worldgen-cave";
import { ROPE_SPOTS_MIN } from "./cave-vocab";
import { lintSuburbTile } from "./suburb-tiles";
import { planSuburbSector, validateSuburbSector, SECTOR_U, SUBURB_LIBRARY } from "./worldgen-suburb";
import { KEY_SPOTS_MIN } from "./suburb-vocab";
import { planLobbySector, LOBBY_LIBRARY } from "./worldgen-lobby";
import { driveSites, doorSite } from "./lore";
import { markProblems } from "./placement";
import { planPipesSector, validatePipesSector, SECTOR_D, PIPE_LIBRARY, MAX_TO_SAFE } from "./worldgen-pipes";
import { planPoolsSector, validatePoolsSector, swimTraps, waterBodies, zoneAt, SECTOR_P, POOL_LIBRARY } from "./worldgen-pools";
import { type Sector, sectorFingerprint, validateSector, distanceMap, SECTOR_A } from "./worldgen";

export const EDITABLE_LEVELS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** What a level is called in the editor. */
export const LEVEL_NAMES: Readonly<Record<number, string>> = { 0: "The Lobby", 1: "The Poolrooms", 2: "Pipe Dreams", 3: "The Electrical Station", 4: "The Abandoned Office", 5: "The Terror Hotel", 6: "Lights Out", 7: "Thalassophobia", 8: "The Cave System", 9: "The Suburbs" };

/** The sector id a published version plays under: the repo's own sector
 *  plus the version (A6 → A7 = v1). Each gets its own fog, paint and bodies,
 *  and the rows of the map it replaced are simply never loaded again (the old
 *  sector's bodies rot on the ordinary 24h sweep). A PROPS-ONLY publish never
 *  asks for one — it keeps the id it replaces (routes/mapeditor.ts). */
export function designSectorId(level: number, version: number): string {
  // Published versions count on from the repo's own sector (A6 → A7 = v1), so
  // pulling a published design into git (scripts/pull-map.mjs) moves them along.
  if (level === 0) return `A${Number(SECTOR_A.id.slice(1)) + version}`;
  if (level === 1) return `P${Number(SECTOR_P.id.slice(1)) + version}`;
  if (level === 2) return `D${Number(SECTOR_D.id.slice(1)) + version}`;
  if (level === 3) return `S${Number(SECTOR_S.id.slice(1)) + version}`;
  if (level === 4) return `O${Number(SECTOR_O.id.slice(1)) + version}`;
  if (level === 5) return `H${Number(SECTOR_H.id.slice(1)) + version}`;
  if (level === 6) return `L${Number(SECTOR_L.id.slice(1)) + version}`;
  if (level === 7) return `T${Number(SECTOR_T.id.slice(1)) + version}`;
  if (level === 8) return `C${Number(SECTOR_C.id.slice(1)) + version}`;
  if (level === 9) return `U${Number(SECTOR_U.id.slice(1)) + version}`;
  throw new Error(`level ${level} is not built from rooms yet`);
}

/** The repo's own library and seed for a level — what the editor starts from
 *  when nothing has been drafted or published. */
export function repoDesign(level: number): { tiles: TileDef[]; seed: number; sectorId: string } {
  if (level === 0) return { tiles: LOBBY_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_A.seed, sectorId: SECTOR_A.id };
  if (level === 1) return { tiles: POOL_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_P.seed, sectorId: SECTOR_P.id };
  if (level === 2) return { tiles: PIPE_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_D.seed, sectorId: SECTOR_D.id };
  if (level === 3) return { tiles: STATION_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_S.seed, sectorId: SECTOR_S.id };
  if (level === 4) return { tiles: OFFICE_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_O.seed, sectorId: SECTOR_O.id };
  if (level === 5) return { tiles: HOTEL_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_H.seed, sectorId: SECTOR_H.id };
  if (level === 6) return { tiles: LIGHTS_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_L.seed, sectorId: SECTOR_L.id };
  if (level === 7) return { tiles: OCEAN_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_T.seed, sectorId: SECTOR_T.id };
  if (level === 8) return { tiles: CAVE_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_C.seed, sectorId: SECTOR_C.id };
  if (level === 9) return { tiles: SUBURB_LIBRARY.map((t) => JSON.parse(JSON.stringify(t))), seed: SECTOR_U.seed, sectorId: SECTOR_U.id };
  throw new Error(`level ${level} is not built from rooms yet`);
}

/** A body the editor sent, checked for SHAPE (not for design problems — a
 *  draft is allowed to be half-finished). A string is the reason it isn't a
 *  library at all. */
export function readLibrary(raw: unknown): TileDef[] | string {
  if (!Array.isArray(raw)) return "the library must be a list of rooms";
  if (raw.length > 400) return "a library holds at most 400 rooms";
  const ids = new Set<string>();
  for (const t of raw) {
    if (!t || typeof t !== "object") return "every room must be an object";
    const r = t as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) return "every room needs an id";
    if (ids.has(r.id)) return `two rooms are called "${r.id}"`;
    ids.add(r.id);
    if (!Array.isArray(r.map) || !r.map.length || r.map.some((row) => typeof row !== "string")) return `room "${r.id}" needs a map`;
    // the Confluence is 61 across: the rivers' pieces are big
    if (r.map.length > 72 || r.map.some((row: string) => row.length > 72)) return `room "${r.id}" is bigger than 72×72`;
    if (!Array.isArray(r.doors)) return `room "${r.id}" needs a doors list`;
    if (r.props !== undefined && (!Array.isArray(r.props) || r.props.length > 400)) return `room "${r.id}" has a broken props list`;
  }
  return raw as TileDef[];
}

export const readSeed = (raw: unknown, level: number): number => {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 && n < 2 ** 31 ? n : repoDesign(level).seed;
};

/** Every room with problems, by id — the generator refuses to run on these. */
export function roomProblems(level: number, tiles: readonly TileDef[]): { id: string; errors: string[] }[] {
  const lint = level === 0 ? lintLobbyTile : level === 1 ? lintPoolTile : level === 3 ? lintStationTile : level === 4 ? lintOfficeTile : level === 5 ? lintHotelTile : level === 6 ? lintLightsTile : level === 7 ? lintOceanTile : level === 8 ? lintCaveTile : level === 9 ? lintSuburbTile : lintPipeTile;
  const out: { id: string; errors: string[] }[] = [];
  for (const t of tiles) {
    const e = lint(t).errors;
    if (e.length) out.push({ id: t.id, errors: e });
  }
  return out;
}

export interface BuiltMap {
  sector: Sector;
  fingerprint: string;
  /** The level's own rules, as sentences. Empty = it may go live. */
  problems: string[];
  /** For the editor's whole-level view (the room editor's map modal). */
  preview: Record<string, unknown>;
}

const b64 = (a: ArrayBufferView): string => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

const basePreview = (s: Sector): Record<string, unknown> => ({
  size: s.size,
  floor: b64(s.floor),
  solid: b64(s.solid),
  // scenery: drawn, never walked to on purpose (so not a "can't reach" problem)
  background: b64(s.background),
  wallN: b64(s.wallN),
  wallW: b64(s.wallW),
  deco: b64(s.deco ?? new Uint8Array(s.size * s.size)),
  district: b64(s.district),
  types: s.districts.map((d) => d.type),
  hatch: { x: s.doors[0].x, y: s.doors[0].y },
  doors: s.doors.map((d) => ({ x: d.x, y: d.y, name: d.name })),
  kit: (s.kit ?? []).map((k) => [k.p, k.v, Math.round(k.x * 100) / 100, Math.round(k.y * 100) / 100, k.r]),
  // THE DISTANCE OVERLAY: steps from the level's door to every cell (0xffff =
  // can't be walked to), for "how far is this from the way in"
  dist: (() => {
    const d = distanceMap(s, s.doors.map((q) => ({ x: q.x, y: q.y })));
    const out = new Uint16Array(d.length);
    for (let i = 0; i < d.length; i++) out[i] = d[i] < 0 ? 0xffff : Math.min(0xfffe, d[i]);
    return b64(out);
  })(),
  // the game markers, so the whole-level view can show them
  marks: (s.marks ?? []).map((m) => [m.k, Math.round(m.x * 100) / 100, Math.round(m.y * 100) / 100]),
});

/** Build the level a library makes. Throws only on a library the generator
 *  cannot use at all (no start room, …); everything else is a `problem` —
 *  including THE PLACEMENT LAW's (placement.ts): a relic or drive spot no
 *  player can use, or a spawner its creature can't start on, is a problem
 *  on every level, so it is caught at the publish screen. */
export function buildMap(level: number, tiles: readonly TileDef[], seed: number): BuiltMap {
  const built = buildLevelMap(level, tiles, seed);
  built.problems.push(...markProblems(built.sector));
  return built;
}

function buildLevelMap(level: number, tiles: readonly TileDef[], seed: number): BuiltMap {
  if (level === 0) return buildLobby(tiles, seed);
  if (level === 1) return buildPools(tiles, seed);
  if (level === 3) return buildStation(tiles, seed);
  if (level === 4) return buildOffice(tiles, seed);
  if (level === 5) return buildHotel(tiles, seed);
  if (level === 6) return buildLights(tiles, seed);
  if (level === 7) return buildOcean(tiles, seed);
  if (level === 8) return buildCave(tiles, seed);
  if (level === 9) return buildSuburbs(tiles, seed);
  if (level !== 2) throw new Error(`level ${level} is not built from rooms yet`);
  const t0 = Date.now();
  const plan = planPipesSector(seed, SECTOR_D.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validatePipesSector(s);
  // THE MAP RULES every live level keeps (test_pipes pins the repo map to the
  // same ones): anything here would strand, kill or confuse a player
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from the drain`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (r.unrailedLedges) problems.push(`${r.unrailedLedges} drop${r.unrailedLedges > 1 ? "s" : ""} outside an engine hall have no railing`);
  if (r.lethalDrops) problems.push(`${r.lethalDrops} drop${r.lethalDrops > 1 ? "s" : ""} would kill whoever falls`);
  if (!Number.isFinite(r.exitDistance) || r.exitDistance <= 0) problems.push("the pressure door can't be reached from the drain");
  if (r.maxToSafe > MAX_TO_SAFE) problems.push(`somewhere is ${r.maxToSafe} steps from the nearest lit room (the most allowed is ${MAX_TO_SAFE})`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 2,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.main, name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        exit: r.exitDistance,
        loops: plan.loops,
        cross: plan.crossStreets,
        safeRooms: r.safeRooms,
        maxToSafe: r.maxToSafe,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        route: plan.mainPath.map((id) => plan.insts[id].tileId).join(" › "),
      },
    },
  };
}

/** THE STATION's rules (test_station pins the repo map to the same ones):
 *  everything reachable from the pressure door, nothing sealed, six sections
 *  each with ONE breaker and ONE cutoff, every cutoff reachable dry and every
 *  breaker without crossing another section's water, the lift shutter in place,
 *  and every lever on floor the placement law allows. */
function buildStation(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planStationSector(seed, SECTOR_S.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateStationSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from the pressure door`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (plan.breakerless.length) problems.push(`section${plan.breakerless.length > 1 ? "s" : ""} ${plan.breakerless.join(", ")} found no breaker room`);
  if (r.badSections) problems.push(`${r.badSections} of the ${SECTIONS} sections don't have exactly one breaker and one cutoff`);
  if (r.wetCutoffs) problems.push(`${r.wetCutoffs} cutoff${r.wetCutoffs > 1 ? "s" : ""} can only be reached through live water`);
  if (r.wetBreakers) problems.push(`${r.wetBreakers} breaker${r.wetBreakers > 1 ? "s" : ""} can only be reached through another section's water`);
  if (r.unlawful) problems.push(`${r.unlawful} breaker${r.unlawful > 1 ? "s, cutoffs or the shutter stand" : ", cutoff or the shutter stands"} where nobody can use ${r.unlawful > 1 ? "them" : "it"}`);
  if (!r.shutter) problems.push("the lift shutter found no wall in the goal room");
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one)`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 3,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        breakers: r.breakers,
        cutoffs: r.cutoffs,
        puddles: r.puddleCells,
        arcs: r.arcPanels,
        lamps: r.lamps,
        drained: plan.drained,
      },
    },
  };
}

/** THE OFFICE's rules (test_office pins the repo map to the same ones):
 *  everything reachable from the lift, nothing sealed, one door, the keycard
 *  and the stairwell door on the map on floor the placement law allows, every
 *  room in one blink zone, and every room with a troffer. */
function buildOffice(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planOfficeSector(seed, SECTOR_O.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateOfficeSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from the lift`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (!r.keycard) problems.push("the keycard found no place in the key room");
  if (!r.stairdoor) problems.push("the stairwell door found no wall in the goal room");
  if (r.unlawful) problems.push("the keycard or the stairwell door stands where nobody can use it");
  if (r.zones !== BLINK_ZONES) problems.push(`only ${r.zones} of the ${BLINK_ZONES} blink zones have any floor`);
  let dark = 0;
  for (const i of plan.insts) {
    let lamp = false;
    for (let y = i.y; y < i.y + i.h && !lamp; y++) for (let x = i.x; x < i.x + i.w; x++) if (odecoKind(s.deco![y * s.size + x]) === ODECO.lamp) { lamp = true; break; }
    if (!lamp) dark++;
  }
  if (dark) problems.push(`${dark} room${dark > 1 ? "s have" : " has"} no troffer — pitch dark (every light is a fixture)`);
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one)`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 4,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        lamps: r.lamps,
        dead: r.deadLamps,
        lit: Math.round(r.litShare * 100),
        windows: r.windows,
      },
    },
  };
}

/** THE HOTEL's rules (test_hotel pins the repo map to the same ones):
 *  everything reachable from the service stair, nothing sealed, one door,
 *  the register, the suites and the rusty door on floor the placement law
 *  allows, and the Main Hall and the Boiler Room meeting at one doorway. */
function buildHotel(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planHotelSector(seed, SECTOR_H.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateHotelSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from the service stair`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (!r.register) problems.push("the guest register found no place in the Beverly Room");
  if (!r.rustydoor) problems.push("the rusty door found no wall in the goal room");
  if (plan.suites.length < SUITES_MIN) problems.push(`only ${plan.suites.length} suites fitted (the register needs at least ${SUITES_MIN} to choose from)`);
  if (r.unlawful) problems.push("the register, a key hook, a lift or the rusty door stands where nobody can use it");
  if (r.crossings !== 2) problems.push(`the Main Hall and the Boiler Room meet at ${r.crossings / 2} doorways (they must meet at exactly one)`);
  if (r.lifts < 2) problems.push("fewer than two lift doors — the lifts have nowhere to go");
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one)`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 5,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block" && i.role !== "suite", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        suites: plan.suites.length,
        lifts: r.lifts,
        furnaces: r.furnaces,
        nests: r.nests,
        lamps: r.lamps,
        dead: r.deadLamps,
      },
    },
  };
}

/** LIGHTS OUT's rules (test_lights pins the repo map to the same ones):
 *  everything reachable from the stair, nothing sealed, one door, the sea
 *  hatch in the water, the Handwheel placed, and every wheel and battery spot
 *  on dry floor the placement law allows. */
/** THALASSOPHOBIA's rules (test_ocean pins the repo map to the same ones):
 *  everything reachable from the hatch, nothing sealed, one door, the subway
 *  stair at the bottom of the sunken plaza, the Diving Helmet placed, and every
 *  helmet spot on dry roof the placement law allows. */
/** THE CAVE SYSTEM's rules (test_cave pins the repo map to the same ones):
 *  everything reachable from the subway stair, nothing sealed, one door, the
 *  Chimney in the Deep, the Climbing Rope placed, every rope spot in the
 *  Caverns on dry floor the placement law allows, and every chasm deep enough
 *  to kill. */
function buildCave(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planCaveSector(seed, SECTOR_C.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateCaveSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from the subway stair`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (!r.chimney) problems.push("the Chimney found no wall in the goal room");
  if (!plan.rope) problems.push("the Climbing Rope found no spot to lie on");
  if (plan.ropeSpots.length < ROPE_SPOTS_MIN) problems.push(`only ${plan.ropeSpots.length} rope spots (draw at least ${ROPE_SPOTS_MIN} R across the Caverns)`);
  if (r.unlawful) problems.push("the Chimney or a rope spot stands where nobody can use it");
  if (r.badRope) problems.push(`${r.badRope} rope spot${r.badRope > 1 ? "s stand" : " stands"} in the water or outside the Caverns`);
  if (r.shallowPits) problems.push(`${r.shallowPits} drop${r.shallowPits > 1 ? "s are" : " is"} deep enough to trap but not to kill`);
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one, or a line couldn't be laid)`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 8,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        ropeSpots: r.ropeSpots,
        wet: r.wetCells,
        burrow: r.burrowCells,
        crawl: r.crawlCells,
        chasms: r.pitCount,
        lamps: r.lamps,
      },
    },
  };
}

/** THE SUBURBS' rules (test_suburbs pins the repo map to the same ones):
 *  everything reachable from the manhole, nothing sealed, one door, every
 *  street module filled, Number 9's front door, the House Key placed, and
 *  every key spot indoors where the placement law allows. */
function buildSuburbs(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planSuburbSector(seed, SECTOR_U.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateSuburbSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the neighbourhood can't be walked to from the manhole`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (!r.frontDoor) problems.push("Number 9's front door found no wall");
  if (!plan.key) problems.push("the House Key found no spot to lie on");
  if (plan.keySpots.length < KEY_SPOTS_MIN) problems.push(`only ${plan.keySpots.length} key spots (draw at least ${KEY_SPOTS_MIN} K in the houses)`);
  if (r.unlawful) problems.push("the front door or a key spot stands where nobody can use it");
  if (r.badKey) problems.push(`${r.badKey} key spot${r.badKey > 1 ? "s stand" : " stands"} outdoors`);
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one, or a street piece is missing)`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 9,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        keySpots: r.keySpots,
        lamps: r.lamps,
        litLamps: r.litLamps,
      },
    },
  };
}

function buildOcean(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planOceanSector(seed, SECTOR_T.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateOceanSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the city can't be reached from the hatch`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (!r.subway) problems.push("the subway stair found no wall at the bottom of the plaza");
  else if (r.subwayFloor !== PLAZA_FLOOR) problems.push("the subway stair isn't at the bottom of the plaza");
  if (!plan.helmet) problems.push("the Diving Helmet found no roof to lie on");
  if (plan.helmetSpots.length < HELMET_SPOTS_MIN) problems.push(`only ${plan.helmetSpots.length} helmet spots (draw at least ${HELMET_SPOTS_MIN} K across the roofs)`);
  if (r.unlawful) problems.push("a helmet spot stands where nobody can use it");
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one)`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 7,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        helmetSpots: r.helmetSpots,
        wet: r.wetCells,
        drop: r.dropCells,
        dry: r.dryCells,
      },
    },
  };
}

function buildLights(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planLightsSector(seed, SECTOR_L.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateLightsSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from the stair`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (!r.hatch) problems.push("the sea hatch found no wall in the goal room");
  if (!plan.wheel) problems.push("the Handwheel found no spot to lie on");
  if (plan.wheelSpots.length < WHEEL_SPOTS_MIN) problems.push(`only ${plan.wheelSpots.length} Handwheel spots (draw at least ${WHEEL_SPOTS_MIN} K across the dry rooms)`);
  if (plan.batterySpots.length < BATTERY_SPOTS_MIN) problems.push(`only ${plan.batterySpots.length} battery spots (draw at least ${BATTERY_SPOTS_MIN} B across the dry rooms)`);
  if (r.unlawful) problems.push("the sea hatch, a wheel spot or a battery spot stands where nobody can use it");
  if (r.wetSpots) problems.push(`${r.wetSpots} wheel or battery spot${r.wetSpots > 1 ? "s stand" : " stands"} in the water`);
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one)`);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 6,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        wheelSpots: r.wheelSpots,
        batterySpots: r.batterySpots,
        wet: r.wetCells,
        lamps: r.lamps,
      },
    },
  };
}

/** LEVEL 0's rules: everything reachable from The Entrance, nothing stranded,
 *  every shaft deep enough to be a shaft, one door, the lore drives placeable. */
function buildLobby(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planLobbySector(seed, SECTOR_A.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validateSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from The Entrance`);
  if (r.strandedCells) problems.push(`${r.strandedCells} cells can be fallen into but never walked back out of`);
  if (r.shallowPits) problems.push(`${r.shallowPits} holes are too shallow to be a shaft (a shaft is 9 steps deep or more)`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (s.doors.length !== 1) problems.push(`the level has ${s.doors.length} entrances (one door per level)`);
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one)`);
  const drives = driveSites(s).length;
  if (drives < 20) problems.push(`only ${drives} of the 20 lore drives found a place`);
  const d0 = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const door = doorSite(s, d0);
  const types: Record<string, number> = {};
  for (const i of plan.insts) types[i.type] = (types[i.type] ?? 0) + 1;
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 0,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.role !== "block", name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        opened: plan.opened,
        tree: plan.tree,
        door: d0[Math.floor(door.y) * s.size + Math.floor(door.x)],
        types: Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "),
        drives,
      },
    },
  };
}

/** THE POOLROOMS' rules: everything reachable, nothing sealed, four doors,
 *  no swimmer trapped in water with no way out, water where it belongs. */
function buildPools(tiles: readonly TileDef[], seed: number): BuiltMap {
  const t0 = Date.now();
  const plan = planPoolsSector(seed, SECTOR_P.size, tiles);
  const ms = Date.now() - t0;
  const s = plan.sector;
  const r = validatePoolsSector(s);
  const problems: string[] = [];
  if (r.reachablePct < 100) problems.push(`${(100 - r.reachablePct).toFixed(1)}% of the floor can't be walked to from the doors`);
  if (r.isolatedDoors) problems.push(`${r.isolatedDoors} door${r.isolatedDoors > 1 ? "s are" : " is"} sealed off from the rest of the level`);
  if (plan.lostCells) problems.push(`${plan.lostCells} open cells couldn't be reached and were sealed`);
  if (r.spillEdges || r.waterOverSolid) problems.push("water stands somewhere it can't (a spill past a dry floor below the waterline)");
  const traps = swimTraps(s);
  if (traps) problems.push(`${traps} deep pool${traps > 1 ? "s have" : " has"} no way to climb out`);
  if (plan.unmet.length) problems.push(`the level couldn't fit ${plan.unmet.join(", ")} (the library asks for at least one)`);
  const bodies = waterBodies(s);
  return {
    sector: s,
    fingerprint: sectorFingerprint(s),
    problems,
    preview: {
      ...basePreview(s),
      level: 1,
      insts: plan.insts.map((i) => ({ id: i.id, tileId: i.tileId, x: i.x, y: i.y, w: i.w, h: i.h, main: i.spine, name: i.name })),
      stats: {
        ms,
        pieces: plan.insts.length,
        props: s.kit?.length ?? 0,
        loops: plan.loops,
        links: plan.links,
        reach: Math.round(r.reachablePct * 10) / 10,
        lost: plan.lostCells,
        wet: Math.round(r.wetPct),
        swim: Math.round(r.swimPct),
        gators: bodies.filter((b) => b.gator).length,
        // the three zones, by the rooms standing in each (worldgen-pools zoneAt)
        route: (() => {
          const z = { baths: 0, arcades: 0, deep: 0 };
          for (const i of plan.insts) z[zoneAt(i.x + i.w / 2, i.y + i.h / 2, plan.landing, s.size)]++;
          return `${z.baths} rooms in the sunlit baths · ${z.arcades} in the arcades · ${z.deep} in the deep`;
        })(),
      },
    },
  };
}

/** What a draft changes against the live library, room by room — the
 *  editor's publish screen shows it before anything goes live. A room is
 *  RESHAPED when anything but its props and look differs (its floor, walls, rooms,
 *  furniture, heights or doors); DOORS MOVED is the part of that players
 *  notice first. Props are counted as placements: a moved prop is one taken
 *  away and one put down. */
export interface LibraryChanges {
  added: string[];
  removed: string[];
  reshaped: string[];
  doorsMoved: string[];
  propsChanged: string[];
  propsAdded: number;
  propsRemoved: number;
  /** Rooms whose look (walls / floor / ceiling) changed — dressing, like props. */
  looksChanged: string[];
  /** Rooms whose game markers (creatures, relic and drive spots) changed. */
  marksChanged: string[];
}

export function libraryChanges(before: readonly TileDef[], after: readonly TileDef[]): LibraryChanges {
  const out: LibraryChanges = { added: [], removed: [], reshaped: [], doorsMoved: [], propsChanged: [], propsAdded: 0, propsRemoved: 0, looksChanged: [], marksChanged: [] };
  const was = new Map(before.map((t) => [t.id, t]));
  const now = new Map(after.map((t) => [t.id, t]));
  const place = (p: import("./kit").KitPlace): string =>
    `${p.p}|${p.v ?? 1}|${p.x}|${p.y}|${p.r ?? 0}|${p.z ?? 0}|${p.c ?? 100}|${p.text ?? ""}|${p.rx ?? 0}|${p.rz ?? 0}|${p.sx ?? ""}|${p.sy ?? ""}|${p.sz ?? ""}|${p.tex ?? ""}|${p.col ?? ""}|${p.solid ?? ""}`;
  const countProps = (t: TileDef | undefined): Map<string, number> => {
    const m = new Map<string, number>();
    for (const p of t?.props ?? []) m.set(place(p), (m.get(place(p)) ?? 0) + 1);
    return m;
  };
  // a held ceiling (the Heights tool's floor-only mode) is dressing, like a look
  const shape = (t: TileDef): string => JSON.stringify({ ...t, props: undefined, look: undefined, marks: undefined, ceiling: undefined, stairs: undefined });
  const marksOf = (t: TileDef): string => JSON.stringify(t.marks ?? []);
  const lookOf = (t: TileDef): string => JSON.stringify([t.look ?? {}, t.ceiling ?? null, t.stairs ?? null]);
  for (const t of after) {
    const old = was.get(t.id);
    if (!old) out.added.push(t.id);
    else {
      if (shape(old) !== shape(t)) out.reshaped.push(t.id);
      if (lookOf(old) !== lookOf(t)) out.looksChanged.push(t.id);
      if (marksOf(old) !== marksOf(t)) out.marksChanged.push(t.id);
      if (JSON.stringify(old.doors) !== JSON.stringify(t.doors)) out.doorsMoved.push(t.id);
    }
  }
  for (const t of before) if (!now.has(t.id)) out.removed.push(t.id);
  // a new room that carries markers counts too
  for (const t of after) if (!was.has(t.id) && t.marks?.length) out.marksChanged.push(t.id);
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = countProps(was.get(id));
    const b = countProps(now.get(id));
    let add = 0;
    let rem = 0;
    for (const [k, n] of b) add += Math.max(0, n - (a.get(k) ?? 0));
    for (const [k, n] of a) rem += Math.max(0, n - (b.get(k) ?? 0));
    if (add || rem) out.propsChanged.push(id);
    out.propsAdded += add;
    out.propsRemoved += rem;
  }
  return out;
}
