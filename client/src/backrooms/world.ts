// The Level 0 renderer — blockout tier, tuned toward the Kane Pixels look
// with zero texture assets: mono-yellow surfaces under warm fluorescent
// haze, distance dissolving into GLOW (fog toward light, never black), an
// unbroken panel grid overhead. Real materials arrive in the aesthetics
// pass; the geometry, palette, and haze are the bones the look-test judges.
//
// Coordinates: 1 cell = 2m. Cell (x,y) → world (x*2, 0, y*2); +x east,
// +z south. Walls sit ON cell edges (thin drywall), ceiling at 3m.

import * as THREE from "three";
import { armIK } from "../lib/ik";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { floorQuad, riserQuad, cornerHeight, solidSpan } from "./geom";
import { archBelongs, backedOn, benchMount } from "./decorules";
import { tameGlbTransparency } from "../lib/three-hygiene";
import type { ChunkData } from "./gamenet";
import { suitCanvas } from "./suitcolor";
import { SPRAY_HEX } from "./paint";
import { buildPipeFixtures, buildPipeRuns, STATION_RUN_PROFILE, PIPE_RUN_PROFILE, pipeFixtureCell, PIPE_SAFE_TYPES, PIPE_CEILINGS, pipeHallRoof } from "./pipes-props";
import { POOL_CEILINGS } from "../../../src/backrooms/pools-vocab";
import { LOBBY_CEILINGS } from "../../../src/backrooms/lobby-vocab";
import { STATION_CEILINGS, SDECO, SECTIONS } from "../../../src/backrooms/station-vocab";
import { OFFICE_CEILINGS, ODECO } from "../../../src/backrooms/office-vocab";
import { HOTEL_CEILINGS, HDECO, HOT_TYPES, sconceSide, sconceState } from "../../../src/backrooms/hotel-vocab";
import { LIGHTS_CEILINGS, LDECO, WET_TYPES } from "../../../src/backrooms/lights-vocab";
import { OCEAN_CEILINGS, TDECO } from "../../../src/backrooms/ocean-vocab";
import { CAVE_CEILINGS, CDECO, CAVE_WET_TYPES, STAND_CLEAR } from "../../../src/backrooms/cave-vocab";
import { SUBURB_CEILINGS, SUBURB_INDOOR_TYPES, UDECO, udecoKind, udecoVar, udecoLit } from "../../../src/backrooms/suburb-vocab";
import { SURFACES, surfaceIndex, addCustomSurfaces, findSurface, type Surface, type SurfaceKind, type LookSpec } from "../../../src/backrooms/surfaces";
import { makeSign } from "./signs";
import { makeShape, type ShapeSurface } from "./shapes";
import { stairGeometry, stairRailMat, tintedStairMat } from "./stairs";
import { ceilingWithLid, lidMetres } from "../../../src/backrooms/ceiling";
import { surfaceKindOf } from "../../../src/backrooms/kit";
// The casino bar's drunk locomotion table. It lives over there because the bar
// does; this file only needs to know which clip a swaying body plays.
import { DRUNK_CLIPS, drunkState } from "../casino/drunkclips";
import { GUN_CLIPS, gunState } from "../casino/gunclips";

export const CELL = 2; // meters
/** Metres per floor-height STEP — must match worldgen FLOOR_STEP. */
export const FLOOR_STEP = 0.5;
/** Floors this far below datum are lethal SHAFTS, not rooms (mirrors
 *  worldgen's PIT_LETHAL). Nobody may stand there — the flycam checks it
 *  before letting an admin land. */
export const PIT_LETHAL_STEPS = 9;
export const WALL_H = 3; // the BASE height — districts vary from it
export const EYE = 1.65;

// Ceiling height varies by district (Josh: the flat 3m everywhere was
// monotonous): grand pillar halls soar, warrens press down on you. Heights
// derive from the district map, so every client agrees without extra wire.
// Raised across the board FOUR times (Josh, round 3: "make the default
// ceiling height higher") — warrens stay the low, pressing exception, and the
// spread between district types is preserved so crossing a line still reads.
// The v2 verticality districts were MISSING here until July 2026 and silently
// fell through to WALL_H (3.0) — the lowest ceiling in the game, lower even
// than the warrens that are supposed to be the oppressive exception. The
// atrium, the one space built to feel vast, had the tightest lid in Level 0.
const HEIGHT_BY_TYPE: Record<string, number> = {
  // LEVEL 0: its own table, in lobby-vocab.ts, because the map editor's 3D
  // preview reads it too (classic 5.0 · halls 5.8 · pillars 6.6 · offices 4.2 ·
  // warrens 3.4 · atrium 7.6, the grand void · terraces 5.4 · sublevel 3.6).
  ...LOBBY_CEILINGS,
  // THE DROWNED PALACE (Poolrooms v2) — cathedral air everywhere (Josh:
  // "much higher ceilings"). The courts are the tallest rooms in the game.
  natatorium: 13.0,
  shallows: 7.5,
  soak: 4.0,
  poolmaze: 3.2,
  channels: 4.8,
  sundeck: 9.0,
  sea: 11.0,
  pavilion: 12.5,
  // THE POOLROOMS (v3 Aug 2026, v4 from hand-drawn rooms Sep 2026): their
  // own table, in pools-vocab.ts, because the map editor's 3D preview reads
  // it too. Very high everywhere; a river under a low lid reads as a drain.
  ...POOL_CEILINGS,
  // PIPE DREAMS (Level 2): its own table, in pipes-props.ts, because the
  // room editor's 3D preview reads it too.
  ...PIPE_CEILINGS,
  // THE ELECTRICAL STATION (Level 3): station-vocab.ts, shared with the editor
  ...STATION_CEILINGS,
  // THE ABANDONED OFFICE (Level 4): office-vocab.ts, shared with the editor
  ...OFFICE_CEILINGS,
  // THE TERROR HOTEL (Level 5): hotel-vocab.ts, shared with the editor
  ...HOTEL_CEILINGS,
  // LIGHTS OUT (Level 6): lights-vocab.ts, shared with the editor (its type
  // names are its own, so nothing here moves another level's ceilings)
  ...LIGHTS_CEILINGS,
  // THALASSOPHOBIA (Level 7): ocean-vocab.ts — the tower's rooms are low, the
  // open air over the roofs is the fog's height (and has no ceiling at all)
  ...OCEAN_CEILINGS,
  // THE CAVE SYSTEM (Level 8): cave-vocab.ts — the caverns tall, a crawlspace
  // lower than a standing body (the controller makes you crouch in it)
  ...CAVE_CEILINGS,
  // THE SUBURBS (Level 9): suburb-vocab.ts — a house's rooms are ordinary;
  // the open air is the fog's height (and, like the sea, has no ceiling)
  ...SUBURB_CEILINGS,
};

/** THE POOLROOMS HAVE ONE FLAT LID PER ROOM (Josh's brief for the v3 rebuild:
 *  "no tiered ceilings, very high ceilings"). Everywhere else a ceiling is
 *  the cell's floor plus its room's height, which over a river bed or a pool
 *  steps the ceiling DOWN with every step of the bank — a stair-stepped roof
 *  mirroring the water below. A Poolrooms room's lid sits at its height above
 *  the DECK (floor 0), and only rises where a floor (a mezzanine, a diving
 *  platform) climbs within POOL_HEADROOM of it. */
const POOL_HEADROOM = 4;
/** A 1×1 transparent PNG: what an asset's stray texture request gets. */
const BLANK_PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
/** THE OPEN AIR (the sea's roofs, canals, plaza and Drop; the Suburbs'
 *  streets and yards) has ONE flat lid too, at its height above sea level.
 *  As floor + height, the Drop's sky sat at −15m and a canal's at +34m, and
 *  the fascia pass built a strip between every pair of open cells whose
 *  "ceilings" differed: box frames hanging over every street, a 49m brick
 *  curtain out of the sea along the Drop and 55m slabs round every island
 *  (Nov 2026 polish round). The open air is never roofed (the ceiling pass
 *  skips it), so only those strips ever showed — now none are built. */
const OPEN_AIR: ReadonlySet<string> = new Set(
  [...Object.entries(OCEAN_CEILINGS), ...Object.entries(SUBURB_CEILINGS)].filter(([, h]) => h >= 20).map(([t]) => t),
);
export const isOpenAir = (type: string): boolean => OPEN_AIR.has(type);
const ceilOver = (type: string, floorM: number): number => {
  const h = HEIGHT_BY_TYPE[type] ?? WALL_H;
  return type in POOL_CEILINGS || OPEN_AIR.has(type) ? Math.max(h, floorM + POOL_HEADROOM) : floorM + h;
};
/** A cell's ceiling elevation with its HELD ceiling, if any (ceiling.ts):
 *  the room's ceiling over the held height, never closer than LID_HEADROOM
 *  to a raised floor. The Poolrooms keep their one flat lid regardless. */
export function ceilingOf(type: string, floorM: number, lidM: number | null): number {
  const over = (f: number): number => (type === "enginehall" ? pipeHallRoof(f) : ceilOver(type, f));
  if (type in POOL_CEILINGS) return over(floorM);
  return ceilingWithLid(over, floorM, lidM);
}

// The dark — per the pack's reference renders, the deep distance falls away
// into warm murk; light lives in pools under the panels. Round 3 raised it a
// step with the rest of the palette: distance now dims to dusty olive instead
// of near-black brown (still no visible far wall — the dread survives).
export const FOG_COLOR = 0x4d452b;

const PANEL_COLOR = 0xf4ead0; // warm face, visible tube — bloom does the rest

// ---- Materials (Josh's texture pack) ---------------------------------------
// TheBackroomsAndPoolrooms pack, staged by scripts/prepare-assets.mjs. The
// pack IS the palette — no tinting. Three wallpaper variants give districts
// their own flavor (which paper a zone wears comes from the welcome frame's
// district types). Repeats are INTEGER per 32m chunk span so tiling aligns
// seamlessly across chunk boundaries.

function tex(url: string, repeatX: number, repeatY: number, srgb: boolean): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- Baked light pools -----------------------------------------------------
// The reference renders are lit in POOLS under each panel. Panels sit on a
// strict grid (one per 2×2 cells, at cell (0.5, 1.5) of each tile), so the
// entire lighting solution BAKES into aligned repeating canvas textures —
// zero runtime lights. Chunk origins are multiples of 16 cells, so an
// 8-repeats-per-chunk texture lines up globally, forever.

/** Floor: LOOP-PILE carpet — light arrives as pool quads under the REAL
 *  panels, never baked to the grid (a skipped fixture must leave darkness).
 *  Josh's berber reference sets the scale: 512 px per metre, packed with ~10mm
 *  loops drawn as shadow-ring + offset-highlight pairs, so the nap reads as
 *  thousands of tiny loops rather than blobs.
 *
 *  IT TILES OVER TWO METRES, NOT ONE (Josh: "the carpet looks like a grid of
 *  squares"). Two things were drawing that grid and both had to go:
 *    · The loops sat on a strict 5px lattice with only ±1.5px of jitter, so
 *      they lined up in rows and columns the eye reads as a weave.
 *    · The whole field repeated every ONE metre, and a metre is close enough
 *      to see the same clump of loops again and again across a floor.
 *  Now the loops are jittered across their full cell (no lattice survives) and
 *  the tile covers 2m, so the repeat is four times rarer and lands beyond the
 *  distance the pile is resolvable at. */
function floorCanvas(): THREE.CanvasTexture {
  const S = 1024; // TWO METRES of carpet at 512 px/m
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  // Yellower, less brown (Josh) — mustard base, loop tops leaning gold. Round
  // 3 lifted the whole carpet a step so the floor stops reading near-black
  // between light pools (it stays darker than the walls, as carpet should),
  // then a second pass on Josh's call ("yellow the carpet a little more"):
  // the blue channel drops away from the loop tops, which is what turns olive
  // into actual yellow, and the whole thing rises again.
  // RETUNED July 2026 on Josh's word — the previous values were locked by him
  // and are only changed because he asked twice over: "make the carpet a little
  // more yellow like the movie" and "a little more softer looking". Two dials,
  // and they are separate things:
  //   YELLOWER — the base warms and the blue channel of the loop tops drops
  //     further (0.30 → 0.22 of value), which is what turns olive into gold.
  //   SOFTER — the loop shadow ring loses most of its opacity (0.8 → 0.42) and
  //     the tops vary less (±38 → ±24). High contrast between ring and top is
  //     what made the pile read as gritty sandpaper; lowering it lets the nap
  //     read as fibre you could put a hand on.
  // "A little less mustard" (Josh, July 2026): the base steps a touch toward
  // olive-tan and the loop tops get some blue back (0.22 → 0.34 of value) —
  // still a yellow carpet, just less condiment.
  g.fillStyle = "#76693a";
  g.fillRect(0, 0, S, S);
  const STEP = 5; // loop pitch ≈ 10mm
  // Jitter across the WHOLE cell (±STEP/2). At ±1.5 the loops still remembered
  // their lattice; at full width there are no rows or columns left to see,
  // only the clumps and thin spots real pile has. Wrapping the coordinates
  // keeps loops that spill over an edge continuous with the next tile.
  const cells = S / STEP;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const x = (gx * STEP + Math.random() * STEP + S) % S;
      const y = (gy * STEP + Math.random() * STEP + S) % S;
      const r = 1.7 + Math.random() * 1.2;
      // Shadow ring, then a top-left highlight — the classic drawn loop.
      // Drawn at up to four wrapped positions so nothing clips at the seam.
      const v = 138 + Math.floor(Math.random() * 24) + (Math.random() < 0.05 ? 20 : 0);
      const top = `rgb(${v + 26},${v + 16},${Math.floor(v * 0.34)})`;
      // Offsets are DISTINCT: drawing the same loop twice would stack the
      // shadow ring's alpha and speckle the pile with dark dots.
      const offs: [number, number][] = [[0, 0]];
      if (x < r) offs.push([S, 0]);
      if (y < r) offs.push([0, S]);
      if (x < r && y < r) offs.push([S, S]);
      for (const [ox, oy] of offs) {
        g.fillStyle = "rgba(84,70,30,0.42)";
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = top;
        g.beginPath();
        g.arc(x + ox - 0.6, y + oy - 0.6, r * 0.66, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // NO wear-mottle layer: the soft blotches read as blurry stains on the
  // pile (Josh: remove) — the carpet is uniform loop noise, nothing else.
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  // The floor mesh writes WORLD-SCALE UVs (one unit per metre), and this tile
  // covers TWO metres — so half a UV unit per texture. It was set(32,32) back
  // when the floor was a single 0..1 plane per 32m chunk; left on top of world
  // UVs it squeezed a metre of carpet into 6cm, the pile fell below a pixel,
  // and the whole floor averaged out to flat GREY.
  t.repeat.set(0.5, 0.5);
  t.anisotropy = ANISO;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ceiling: a DROP ceiling — 3×3 tiles per cell (≈0.67m, the real-world
 *  600mm acoustic tile) under a visible dark T-bar grid. Fixtures are sized
 *  and aligned to occupy exactly two tiles (Josh's spec). Panel spill comes
 *  from the per-vertex light field, not the texture. */
export const CEIL_TILES = 3; // tiles per cell edge — panel size/alignment derive from it
/** The drop ceiling's tile canvas. Level 0's carries "a touch of yellow"
 *  (Josh); THE OFFICE's is the same tile washed a neutral off-white with a
 *  grey grid — law 8's reference set for Level 4 is a plain fibre ceiling,
 *  and the yellow tile read olive over the office's grey light (measured: our
 *  blue channel 32 against the set's 48). */
function ceilingCanvas(wash = "#efe6bd", grid = "#3f3a26", base = "#c4b689", grey = false): THREE.CanvasTexture {
  const S = 510; // divisible by 3 — crisp tile borders
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const img = new Image();
  img.onload = () => {
    const T = S / CEIL_TILES; // one CELL (2m) of ceiling = 3×3 tiles
    for (let y = 0; y < CEIL_TILES; y++) {
      for (let x = 0; x < CEIL_TILES; x++) g.drawImage(img, x * T, y * T, T, T);
    }
    // The tile PHOTO is itself yellow (it averages 217, 211, 136), so a wash
    // alone can't make a neutral ceiling: grey it first, per pixel (a canvas
    // filter isn't on every engine the shell runs).
    if (grey) {
      const id = g.getImageData(0, 0, S, S);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      g.putImageData(id, 0, 0);
    }
    g.globalCompositeOperation = "multiply";
    g.fillStyle = wash; // Level 0: a touch of yellow (Josh), off the gray-brown
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "source-over";
    // The T-BAR GRID — the dark metal frame between tiles is what makes a
    // drop ceiling read as a drop ceiling (Josh, vs the references).
    g.strokeStyle = grid;
    g.lineWidth = Math.max(2, S / 170);
    for (let k = 0; k <= CEIL_TILES; k++) {
      g.beginPath();
      g.moveTo(k * T, 0);
      g.lineTo(k * T, S);
      g.stroke();
      g.beginPath();
      g.moveTo(0, k * T);
      g.lineTo(S, k * T);
      g.stroke();
    }
    t.needsUpdate = true;
  };
  img.src = "/assets/br/ceiling_color.png";
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1); // ceiling renders as per-cell quads (heights vary)
  t.anisotropy = ANISO;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- THE LIGHT DOCTRINE (settled after Josh's artifact rounds) -------------
// NO additive light quads anywhere — not on walls (they overhung corners:
// "lighting hitting an invisible wall"), not on the ceiling (they floated
// mid-air at height steps: "the same wall catching light but on the
// ceiling"), not on the floor (they bled under walls and streaked at
// grazing angles). EVERY surface — floor, walls, ceiling — bakes the
// fixture light field PER VERTEX at build time. Panels themselves stay
// emissive (bloom supplies the halo). Nothing floats, nothing clips,
// nothing tracks the player.
// Fascia, end caps, and corner posts all wear the WALLPAPER — the gray flat
// materials read as missing textures (Josh). World-scale UVs (boxGeo) make
// a 0.3m face show a correct 0.3m slice of paper instead of the old
// full-texture smear, so nothing needs a placeholder tone.

// ---- Texture sharpness (Josh: "can the wall textures be more HD?") ---------
// The pack's wall sources are 1024², which the canvas already matches — there
// are no extra source pixels to recover. Detail comes from three other dials:
//  1. PIXEL DENSITY: how much wall one texture tile covers. At 4m × 3m per
//     1024px tile the paper resolved ~256 px/m; the pattern is a fine
//     wallpaper motif, so tightening the span raises density without looking
//     wrong — and a smaller motif is closer to real wallpaper anyway.
//  2. PATTERN ALPHA: the paper was composited at 0.62 over a flat fill, which
//     faded away half its detail along with its contrast. The multiply pass
//     keeps the matte look, so more of the real texture can survive.
//  3. ANISOTROPY: walls are mostly seen at grazing angles down corridors,
//     exactly where anisotropic filtering earns its keep. 8 → 16 (the renderer
//     clamps to whatever the GPU actually supports).
/** Meters of wall covered by ONE texture tile, horizontally and vertically.
 *  Lower = denser pixels = sharper paper (and a smaller motif). */
export const PAPER_U_M = 2.6;
export const PAPER_V_M = 2.0;
const ANISO = 16;

// ---- Wall SURFACE (Josh: "add some texture so it looks like a more real
// wall") --------------------------------------------------------------------
// The pack ships wall{n}_normal.png at 1024² but only ~5KB — it's essentially
// flat, which is why the walls read as printed paper instead of a surface with
// tooth. So the relief is SYNTHESIZED here: a height field of drywall grain
// (fine multi-octave value noise), faint vertical paper striations, and the
// occasional long shallow scratch — then differentiated into a normal map, and
// reused as roughness variation so the panel light doesn't slide across it
// uniformly. One field, generated ONCE and shared by all three papers.
//
// Cheap by construction: 512² (the grain is high-frequency, so a smaller map
// tiled denser reads better than a big one) and a single sobel pass at boot.

// PAPER, not plaster (Josh: "less plaster look, more like wallpaper"). The
// first pass was isotropic multi-octave tooth — that IS the stucco signature.
// What makes a surface read as paper on a wall is different, and mostly not
// grain at all:
//   1. ROLL SEAMS. The giveaway. Butt joints every roll width (0.53m is the
//      standard) — a hairline crease with a slightly raised lip where the next
//      length overlaps. Nothing else in a room has that rhythm.
//   2. EMBOSSED PATTERN. The pattern is pressed INTO the paper, so the relief
//      runs with the print (a fine vertical rib here) instead of across it.
//   3. FIBRE, not tooth — an order of magnitude finer and shallower than
//      plaster, near-smooth until light rakes it.
//   4. BLISTERS. Paper hung over imperfect drywall traps a few soft bubbles,
//      plus the gentle undulation of the wall beneath.
// The map is 1024² tiled 1:1 with the paper (not 4×) so the seam spacing is
// physically right: PAPER_U_M / 5 = 0.52m per roll.
const HEIGHT_S = 1024;
const ROLLS_PER_TILE = 5; // 2.6m / 5 = 0.52m ≈ a real roll width

function wallHeightField(): Float32Array {
  const S = HEIGHT_S;
  const h = new Float32Array(S * S);
  const hash = (x: number, y: number): number => {
    const n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    const m = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((m ^ (m >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (x: number, y: number, step: number): number => {
    const gx = Math.floor(x / step);
    const gy = Math.floor(y / step);
    const tx = x / step - gx;
    const ty = y / step - gy;
    const fx = tx * tx * (3 - 2 * tx);
    const fy = ty * ty * (3 - 2 * ty);
    const a = hash(gx, gy);
    const b = hash(gx + 1, gy);
    const c = hash(gx, gy + 1);
    const d = hash(gx + 1, gy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };

  // ~2cm rib pitch: the emboss of a fine striped paper at this pixel density.
  const RIB = S / 88;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Fibre: raw hash, tiny amplitude. Paper is smooth until light rakes it.
      let v = 0.5 + (hash(x, y) - 0.5) * 0.045;
      // The wall UNDER the paper — a slow, shallow undulation.
      v += (smooth(x, y, 190) - 0.5) * 0.07;
      // Embossed rib, phase-drifting so it never looks machine-printed. VERY
      // SPARSE by Josh's call — the corduroy-everywhere version read as
      // ripples, which he didn't like: a slow mask keeps ribbing to occasional
      // patches (most of the paper has none at all), and where it does appear
      // it's a fraction of its old depth. Pitch and depth still drift, so no
      // two patches match.
      const ribMask = Math.max(0, smooth(x + 900, y, 340) - 0.62) / 0.38;
      if (ribMask > 0) {
        const pitch = RIB * (0.82 + smooth(x, y, 260) * 0.42);
        const depth = (0.004 + smooth(x + 400, y, 150) * 0.009) * ribMask;
        v += Math.sin((x / pitch) * Math.PI * 2 + (smooth(x, y, 70) - 0.5) * 1.4) * depth;
      }
      h[y * S + x] = v;
    }
  }

  // ROLL SEAMS — vertical butt joints at exact roll spacing (so the map still
  // tiles): a hairline crease with a raised lip on the overlapping side.
  const period = S / ROLLS_PER_TILE;
  for (let r = 0; r < ROLLS_PER_TILE; r++) {
    const sx = Math.round(r * period);
    // No two joints are hung alike: each gets its own crease depth, lip height
    // and side. One in five is a good tight joint you can barely find.
    const q = hash(r * 977 + 13, 4211);
    const tight = q < 0.2;
    const crease = tight ? -0.018 : -0.032 - q * 0.035;
    const lip = tight ? 0.006 : 0.014 + hash(r * 31 + 7, 91) * 0.026;
    const side = hash(r * 53 + 3, 611) < 0.5 ? 1 : -1;
    for (let y = 0; y < S; y++) {
      // The seam wanders a hair — paper is hung by hand — and the wander is
      // per-seam, so they don't all snake in unison.
      const wob = Math.round((smooth(sx + r * 90, y, 100 + r * 40) - 0.5) * 4);
      const at = (dx: number, d: number): void => {
        const ix = (((sx + wob + dx) % S) + S) % S;
        h[y * S + ix] += d;
      };
      // Down the length of a joint the paper isn't uniformly pressed.
      const vary = 0.7 + smooth(sx, y, 130) * 0.6;
      at(-side, lip * 0.4 * vary);
      at(0, crease * vary);
      at(side, lip * vary);
      at(side * 2, lip * 0.25 * vary);
    }
  }

  // BLISTERS: soft trapped bubbles at a spread of sizes — a few big lazy ones,
  // plenty of small taut ones — plus the odd shallow scuff and a rare crease
  // from a length that went up folded. Paper damage, not stone damage.
  for (let b = 0; b < 26; b++) {
    const cx = Math.random() * S;
    const cy = Math.random() * S;
    // Size distribution, not one size: squaring the roll biases small.
    const rad = 6 + Math.random() ** 2 * 46;
    const amp = 0.02 + Math.random() * 0.055;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > rad) continue;
        const ix = ((Math.round(cx + dx) % S) + S) % S;
        const iy = ((Math.round(cy + dy) % S) + S) % S;
        h[iy * S + ix] += Math.cos((d / rad) * (Math.PI / 2)) ** 2 * amp;
      }
    }
  }
  for (let s = 0; s < 11; s++) {
    let x = Math.random() * S;
    let y = Math.random() * S;
    // Any angle, not just the two axes — a scuff follows whatever dragged it.
    const ang = Math.random() * Math.PI * 2;
    const len = 40 + Math.random() ** 1.6 * 340;
    const depth = 0.01 + Math.random() * 0.026;
    const wander = 0.3 + Math.random() * 0.7;
    for (let i = 0; i < len; i++) {
      x += Math.cos(ang) + (Math.random() - 0.5) * wander;
      y += Math.sin(ang) + (Math.random() - 0.5) * wander;
      const ix = ((Math.round(x) % S) + S) % S;
      const iy = ((Math.round(y) % S) + S) % S;
      // Fading ends read as a scuff; uniform depth reads as a drawn line.
      h[iy * S + ix] -= depth * Math.min(1, Math.min(i, len - i) / 24);
    }
  }
  // Two horizontal creases: a length that went up with a fold in it.
  for (let c = 0; c < 2; c++) {
    const cy = Math.random() * S;
    const from = Math.random() * S;
    const span = S * (0.3 + Math.random() * 0.5);
    const depth = 0.012 + Math.random() * 0.014;
    for (let i = 0; i < span; i++) {
      const ix = ((Math.round(from + i) % S) + S) % S;
      const iy = ((Math.round(cy + Math.sin(i * 0.02) * 2) % S) + S) % S;
      h[iy * S + ix] -= depth * Math.min(1, Math.min(i, span - i) / 60);
    }
  }
  return h;
}

let wallSurface: { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;

function wallSurfaceMaps(): { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  if (wallSurface) return wallSurface;
  const h = wallHeightField();
  const S = HEIGHT_S;
  const at = (x: number, y: number): number => h[(((y % S) + S) % S) * S + (((x % S) + S) % S)];

  const nCv = document.createElement("canvas");
  nCv.width = nCv.height = S;
  const nCtx = nCv.getContext("2d")!;
  const nImg = nCtx.createImageData(S, S);
  const rCv = document.createElement("canvas");
  rCv.width = rCv.height = S;
  const rCtx = rCv.getContext("2d")!;
  const rImg = rCtx.createImageData(S, S);

  const STRENGTH = 6.5; // paper relief is shallow — the slopes need the gain
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Central differences (wrapping, so the map tiles seamlessly).
      const dx = (at(x + 1, y) - at(x - 1, y)) * STRENGTH;
      const dy = (at(x, y + 1) - at(x, y - 1)) * STRENGTH;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      nImg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 2] = (1 / len) * 255;
      nImg.data[i + 3] = 255;
      // Rougher in the pits, slightly polished on the high points — the
      // uneven sheen real painted drywall has.
      const r = 0.66 + Math.min(0.12, Math.max(-0.05, (0.5 - at(x, y)) * 0.55));
      const rv = Math.round(r * 255);
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = rv;
      rImg.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const mk = (cv: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    // 1:1 with the paper tile — the roll seams have to land at a real roll
    // width (0.52m), which only works if this map shares the paper's UVs.
    t.repeat.set(1, 1);
    t.anisotropy = ANISO;
    return t;
  };
  wallSurface = { normal: mk(nCv), rough: mk(rCv) };
  return wallSurface;
}

/** Wallpaper at REFERENCE SCALE (see PAPER_U_M) with a baked vertical light
 *  gradient — lit at the ceiling, dark at the base. */
function wallCanvas(n: 1 | 2 | 3): THREE.CanvasTexture {
  const S = 1024;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  // Round 3 (Josh: "it's dark mustard yellow — take the palette up a little"):
  // every tone in this file moved a step LIGHTER and a step less brown. The
  // pattern presence is unchanged; only the value/hue moved.
  g.fillStyle = "#d5c88f";
  g.fillRect(0, 0, S, S);
  const img = new Image();
  img.onload = () => {
    // Soften the paper: the raw patterns are high-contrast; the references
    // read matte and faded. Draw over a warm base at partial alpha under a
    // FLAT tone — no baked vertical gradient (it striped the wall tops;
    // the scene lights do the shading now). Lightened off the old
    // dark-mustard cast (Josh) — pattern presence up, tone up.
    g.fillStyle = "#d8cd9d";
    g.fillRect(0, 0, S, S);
    g.globalAlpha = 0.8;
    // OVERSCAN the source ~1%: the pack images carry a light border row
    // (atlas padding) that texture filtering smeared into a white line at
    // the top and bottom of every wall (Josh's snips). Cropping the edge
    // texels off kills the band at both V seams.
    g.drawImage(img, -12, -12, S + 24, S + 24);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "multiply";
    // A gentler tint than the old #a89d74 — that multiply is what pushed the
    // paper into mustard.
    g.fillStyle = "#ebe0b2";
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "source-over";
    // NO baked shading gradient here: the lit-from-above falloff lives in
    // VERTEX COLORS (boxGeo) so it spans each wall exactly once at any
    // height — in the texture it would tile when V repeats on tall walls.
    t.needsUpdate = true;
  };
  img.src = `/assets/br/wall${n}_color.png`;
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  // repeat stays (1,1): wall geometry bakes WORLD-scale UVs (pattern spans
  // 4m in U, 3m in V on every face, whatever the wall's size).
  t.anisotropy = ANISO;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Carpet is LAMBERT — zero specular lobe. StandardMaterial (even at
// roughness 1) keeps a sheen, and the normal map shimmered under the panels
// as you moved (Josh: "less reflective… it needs to look like carpet").
// The nap lives in the texture's fiber grain, not in directional response.
const floorMat = new THREE.MeshLambertMaterial({ map: floorCanvas(), vertexColors: true });

// The photographed ambientCG carpet was tried here and REVERTED on Josh's call
// — the drawn one, with the 2m tile and full-cell jitter that killed its
// lattice, is the look he wants. Don't re-introduce a downloaded floor texture
// without asking; the grid he objected to was the lattice, not the fact that
// the pile was procedural.
const ceilMat = new THREE.MeshStandardMaterial({
  map: ceilingCanvas(),
  roughness: 1,
  vertexColors: true,
});
/** THE OFFICE's drop ceiling: the same tiles, off-white (see ceilingCanvas).
 *  Built on first use — Level 0 never pays for it. */
let officeCeilMat: THREE.MeshStandardMaterial | null = null;
function officeCeiling(): THREE.MeshStandardMaterial {
  return (officeCeilMat ??= new THREE.MeshStandardMaterial({
    map: ceilingCanvas("#f2f0ec", "#464542", "#b9b6af", true),
    roughness: 1,
    vertexColors: true,
  }));
}
/** THE TERROR HOTEL's ceiling: cream plaster in deep COFFERS, one to a cell, a
 *  gilt bead round each and the shadow pooled in the recess (the
 *  catalogue has no coffered ceiling to photograph). Built on first use. */
let hotelCofferMat: THREE.MeshStandardMaterial | null = null;
function hotelCoffer(): THREE.MeshStandardMaterial {
  if (hotelCofferMat) return hotelCofferMat;
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d9cdb4";
  g.fillRect(0, 0, S, S);
  // ONE coffer to a cell (2m): four read as a grid of tiles under a 6.5m
  // ballroom ceiling
  const half = S;
  for (let j = 0; j < 1; j++) {
    for (let i = 0; i < 1; i++) {
      const x = i * half;
      const y = j * half;
      const rim = 44;
      // the beam between coffers, lit from below
      g.fillStyle = "#e6dcc6";
      g.fillRect(x, y, half, half);
      // the recess, stepped twice, darker toward its back
      g.fillStyle = "#b9ab8e";
      g.fillRect(x + rim, y + rim, half - rim * 2, half - rim * 2);
      const grad = g.createRadialGradient(x + half / 2, y + half / 2, 8, x + half / 2, y + half / 2, half / 2);
      grad.addColorStop(0, "#cbbd9f");
      grad.addColorStop(1, "#8f8166");
      g.fillStyle = grad;
      g.fillRect(x + rim + 12, y + rim + 12, half - (rim + 12) * 2, half - (rim + 12) * 2);
      // the gilt bead round the recess
      g.strokeStyle = "#a8854a";
      g.lineWidth = 4;
      g.strokeRect(x + rim + 2, y + rim + 2, half - (rim + 2) * 2, half - (rim + 2) * 2);
      // a rosette in the middle, faint
      g.strokeStyle = "rgba(120,96,58,0.55)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x + half / 2, y + half / 2, 18, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // age: water stains and grime, deterministic
  let seed = 41;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 14; k++) {
    const r = 20 + rnd() * 70;
    const gx = rnd() * S;
    const gy = rnd() * S;
    const st = g.createRadialGradient(gx, gy, 2, gx, gy, r);
    st.addColorStop(0, "rgba(96,72,40,0.22)");
    st.addColorStop(1, "rgba(96,72,40,0)");
    g.fillStyle = st;
    g.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  hotelCofferMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, vertexColors: true });
  return hotelCofferMat;
}
/** THE TERROR HOTEL, room by room: the catalogue surfaces each type wears
 *  (surfaces.ts ids — a room design's Look overrides them). Above stairs it
 *  is papered and carpeted; below stairs (HOT_TYPES) brick, rust and plate. */
export const HOTEL_LOOK: Readonly<Record<string, { wall: string; floor: string; ceil: string | null }>> = {
  landing: { wall: "hotel-dark-wood", floor: "wood-plank-floor", ceil: null },
  corridor: { wall: "hotel-cream-wallpaper", floor: "hotel-red-carpet", ceil: null },
  lounge: { wall: "hotel-dark-wood", floor: "herringbone-floor", ceil: null },
  suite: { wall: "hotel-cream-wallpaper", floor: "hotel-red-carpet", ceil: null },
  lifthall: { wall: "hotel-dark-wood", floor: "checker-marble-floor", ceil: null },
  beverly: { wall: "hotel-dark-wood", floor: "hotel-red-carpet", ceil: null },
  linen: { wall: "hotel-white-wallpaper", floor: "wood-plank-floor", ceil: null },
  dining: { wall: "hotel-cream-wallpaper", floor: "herringbone-floor", ceil: null },
  library: { wall: "hotel-dark-wood", floor: "wood-plank-floor", ceil: null },
  boilergate: { wall: "red-brick", floor: "concrete-floor", ceil: "concrete-ceiling" },
  boiler: { wall: "red-brick", floor: "concrete-floor", ceil: "concrete-ceiling" },
  pipeway: { wall: "rusted-plates", floor: "diamond-plate", ceil: "concrete-ceiling" },
  coalstore: { wall: "red-brick", floor: "concrete-floor", ceil: "concrete-ceiling" },
  rustydoor: { wall: "rusted-plates", floor: "diamond-plate", ceil: "concrete-ceiling" },
};
const HOT_SET = new Set<string>(HOT_TYPES);
/** LIGHTS OUT, room by room: grey concrete everywhere (its references read
 *  (14, 14, 14) — no colour at all), cinder block in the partitions, rough
 *  plate in the pipe runs, and the Wet End's floor dark and wet under the
 *  water. */
export const LIGHTS_LOOK: Readonly<Record<string, { wall: string; floor: string; ceil: string }>> = {
  stairfoot: { wall: "poured-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  darkhall: { wall: "poured-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  darkroom: { wall: "cracked-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  storeroom: { wall: "cracked-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  piperun: { wall: "grey-rust-metal", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  cellblock: { wall: "cracked-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  rubble: { wall: "cracked-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  deadoffice: { wall: "cracked-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  wetway: { wall: "poured-concrete", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
  cistern: { wall: "cracked-concrete", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
  seahatch: { wall: "grey-rust-metal", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
};
const WET_SET = new Set<string>(WET_TYPES);
/** THE CAVE SYSTEM, room by room (REFERENCES.md → Level 8): the Station in
 *  dirty subway tile over a ballast bed, the caverns brown limestone over grey
 *  gravel, the river over a stony bed, the Deep's passages a damp mossy rock.
 *  Roofs are the rock of the walls. */
export const CAVE_LOOK: Readonly<Record<string, { wall: string; floor: string; ceil: string }>> = {
  // GREY CONCRETE UNDERFOOT (Nov 2026 polish round, L8-08): the subway's floors
  // were red-brown tile where the references (13, 15) show grey concrete with
  // the yellow edge.
  subwaystair: { wall: "dirty-white-tile", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
  platform: { wall: "dirty-white-tile", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
  trackbed: { wall: "cracked-concrete", floor: "cave-gravel", ceil: "concrete-ceiling" },
  concourse: { wall: "white-square-tile", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
  breach: { wall: "cave-rock", floor: "damaged-concrete-floor", ceil: "cave-rock-ceiling" },
  cavern: { wall: "cave-rock", floor: "cave-gravel", ceil: "cave-rock-ceiling" },
  gallery: { wall: "cave-rock", floor: "cave-gravel", ceil: "cave-rock-ceiling" },
  caveriver: { wall: "cave-rock", floor: "cave-riverbed", ceil: "cave-rock-ceiling" },
  chasm: { wall: "cave-rock", floor: "cave-gravel", ceil: "cave-rock-ceiling" },
  grotto: { wall: "cave-damp-rock", floor: "cave-gravel", ceil: "cave-rock-ceiling" },
  passage: { wall: "cave-damp-rock", floor: "cave-gravel", ceil: "cave-rock-ceiling" },
  crawl: { wall: "cave-damp-rock", floor: "cave-gravel", ceil: "cave-rock-ceiling" },
  chimney: { wall: "cave-damp-rock", floor: "cave-gravel", ceil: "cave-rock-ceiling" },
};
const CAVE_WET_SET = new Set<string>(CAVE_WET_TYPES);
/** Unclaimed rock backing onto a Station room (caveSurf): the tunnel's own
 *  cracked concrete, not the cream tile of the room the district id names. */
const CAVE_UNCLAIMED_STATION = { wall: "cracked-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" };
/** THALASSOPHOBIA, block by block: the tower an office with its carpet, the
 *  roofs bare poured concrete, the drowned streets wet asphalt between brick
 *  facades, the sunken square grey marble. Only the tower has a ceiling. */
export const OCEAN_LOOK: Readonly<Record<string, { wall: string; floor: string; ceil: string }>> = {
  seatower: { wall: "office-drywall", floor: "wood-plank-floor", ceil: "concrete-ceiling" },
  searoof: { wall: "poured-concrete", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
  seawade: { wall: "poured-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  seasunk: { wall: "poured-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
  seacanal: { wall: "red-brick", floor: "wet-asphalt", ceil: "concrete-ceiling" },
  seaplaza: { wall: "cracked-concrete", floor: "grey-marble-floor", ceil: "concrete-ceiling" },
  seadrop: { wall: "cracked-concrete", floor: "damaged-concrete-floor", ceil: "concrete-ceiling" },
};
function wallVariant(n: 1 | 2 | 3): THREE.MeshStandardMaterial {
  // The pack's own normal/rough maps are replaced by the synthesized surface
  // (see wallSurfaceMaps) — theirs are flat, and a flat normal is what made
  // these read as printed paper rather than a wall you could scuff.
  const surf = wallSurfaceMaps();
  return new THREE.MeshStandardMaterial({
    map: wallCanvas(n),
    normalMap: surf.normal,
    normalScale: new THREE.Vector2(0.62, 0.62),
    roughnessMap: surf.rough,
    roughness: 0.9, // multiplies the map — keep the sheen matte
    // The lit-from-above gradient rides the geometry (see boxGeo).
    vertexColors: true,
  });
}
const wallMats = [wallVariant(1), wallVariant(2), wallVariant(3)];
/** district type → wallpaper index (classic wears the classic paper). */
export const WALL_BY_TYPE: Record<string, number> = {
  classic: 0,
  halls: 0,
  pillars: 0,
  offices: 1,
  warrens: 2,
};
const panelMat = new THREE.MeshBasicMaterial({
  map: tex("/assets/br/panel_color.png", 1, 1, true),
  color: PANEL_COLOR,
});
/** THE OFFICE's troffers (Nov 2026 polish round): the same lit diffuser, its
 *  frame white-enamelled grey steel. They wore Level 0's panel texture, whose
 *  frame is olive yellow — the one yellow thing left in a grey office (the
 *  ceiling tile was greyed for it in Oct 2026, the fixture never was). */
let officePanelMat: THREE.MeshBasicMaterial | null = null;
function officePanel(): THREE.MeshBasicMaterial {
  if (officePanelMat) return officePanelMat;
  const c = document.createElement("canvas");
  c.width = 105;
  c.height = 215;
  const g = c.getContext("2d")!;
  g.fillStyle = "#a3a29e";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#ffffff";
  g.fillRect(3, 4, c.width - 6, c.height - 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  officePanelMat = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(PANEL_COLOR).multiplyScalar(panelScale) });
  return officePanelMat;
}
/** A flickering panel's own clone of a shared panel material (freed with its chunk). */
function isPanelClone(m: THREE.Material | null | undefined): boolean {
  const b = m as THREE.MeshBasicMaterial | null | undefined;
  if (!b || !b.isMeshBasicMaterial || b === panelMat || b === officePanelMat) return false;
  return b.map === panelMat.map || (!!officePanelMat && b.map === officePanelMat.map);
}
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2618, roughness: 0.9 });
// Baseboards are PAINTED WOOD (Josh): warm off-white semi-gloss, not papered.
// Its own material means its own merged mesh — see trimPieces in buildChunk.
const trimMat = new THREE.MeshStandardMaterial({
  // Off-white with a YELLOW cast (Josh: the cool white popped off the walls too
  // much). Aged enamel in a yellow room goes this way anyway — it reads as
  // painted wood a step lighter than the paper, not as a bright white stripe.
  color: 0xded3ad,
  roughness: 0.5, // a little sheen — trim enamel catches light, paper doesn't
  vertexColors: true, // shares the baked fixture field, so it dims with the wall
});

// ---- LEVEL 0's LOOKS, ROOM BY ROOM (Josh, Sep 2026: "more variations in its
// rooms type and look") ---------------------------------------------------------
// Until this, a Level 0 room's type changed only its ceiling height and one of
// three wallpapers — picked per 16-cell CHUNK by whichever room owned most of
// it, so a small room took its neighbour's paper. Now every CELL wears its own
// room's look: a wall, a floor, a ceiling and how much of the panel grid is
// lit. All drawn here from canvases or textures already shipped — no new
// downloads. A new room type = a row in LOBBY_LOOK (and the type itself in
// lobby-vocab.ts).
export interface LobbyLook {
  /** Indexes into SURFACES (src/backrooms/surfaces.ts) — walls: 0-2 the three
   *  papers · 3 manila · 4 tile · 5 wood panel · 6 concrete */
  wall: number;
  /** floors: 0 carpet · 1 stained carpet · 2 floor tile · 3 concrete · 4 green carpet */
  floor: number;
  /** ceilings: 0 drop ceiling · 1 bare concrete */
  ceil: number;
  /** share of the panel grid that is lit: 1 all · 0.5 every other · 0 none */
  lights: number;
  /** The room's base light, as a share of the ordinary. Every surface in
   *  Level 0 carries a baked floor of light whatever the fixtures do — which
   *  is right for the yellow rooms and why a room with its panels out still
   *  read as lit. Default 1. */
  ambient?: number;
  /** Share of the lit panels that flicker (a room's Lights setting). Default
   *  0.025 — the old hard-coded one in forty. */
  flicker?: number;
}
export const LOBBY_LOOK: Readonly<Record<string, LobbyLook>> = {
  classic: { wall: 0, floor: 0, ceil: 0, lights: 1 },
  pillars: { wall: 1, floor: 0, ceil: 0, lights: 1 },
  offices: { wall: 1, floor: 0, ceil: 0, lights: 1 },
  warrens: { wall: 2, floor: 0, ceil: 0, lights: 1 },
  halls: { wall: 1, floor: 0, ceil: 0, lights: 1 },
  atrium: { wall: 2, floor: 0, ceil: 0, lights: 1 },
  terraces: { wall: 0, floor: 0, ceil: 0, lights: 1 },
  sublevel: { wall: 1, floor: 0, ceil: 0, lights: 1 },
  // the new rooms
  manila: { wall: 3, floor: 1, ceil: 0, lights: 0.5, ambient: 0.7 },
  // BACKROOMS ONLY (Josh, Sep 30 2026: "level 0 should only have backrooms
  // texturing not pools or stuff from pipe dream"). The restrooms wore white
  // wall tile and cream floor tile, which read as the Poolrooms; storage wore
  // Pipe Dreams' own concrete photographs, walls, floor and ceiling. Both are
  // yellow rooms now — the stalls and the shelving say what the room is.
  // surfaces.ts LEVEL0_SURFACES is the list, and test_lobby holds this table to it.
  restrooms: { wall: 2, floor: 1, ceil: 0, lights: 1, ambient: 1.05 },
  panelled: { wall: 5, floor: 4, ceil: 0, lights: 1, ambient: 0.95 },
  storage: { wall: 0, floor: 1, ceil: 0, lights: 0.5, ambient: 0.8 },
  unlit: { wall: 0, floor: 0, ceil: 0, lights: 0, ambient: 0.14 },
};
const LOOK_DEFAULT: LobbyLook = LOBBY_LOOK.classic;
export const lobbyLookOf = (type: string): LobbyLook => LOBBY_LOOK[type] ?? LOOK_DEFAULT;
/** Is this cell's panel lit? Hashed on the cell so every client agrees and a
 *  half-lit room reads as the odd tube out rather than a pattern. */
export function lobbyLampOn(type: string, gx: number, gy: number, style?: LookSpec | null): boolean {
  const l = style?.lights !== undefined ? style.lights / 100 : lobbyLookOf(type).lights;
  if (l >= 1) return true;
  if (l <= 0) return false;
  return ((Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663)) >>> 0) % 100 < l * 100;
}
/** A lamp on another level under a room's Lights setting: the same hash, so
 *  "half the lights" is the same half on every client. */
export function styleLampOn(style: LookSpec | null | undefined, gx: number, gy: number): boolean {
  if (style?.lights === undefined) return true;
  return ((Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663)) >>> 0) % 100 < style.lights;
}
/** A room's brightness setting as a light multiplier (1 = the usual). */
export const styleBright = (style: LookSpec | null | undefined): number => (style?.bright ?? 100) / 100;

/** A canvas texture at world scale (the caller's UVs decide the metres). */
function canvasTex(S: number, paint: (g: CanvasRenderingContext2D, S: number) => void, repeat = 1): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  paint(cv.getContext("2d")!, S);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = ANISO;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Deterministic noise for the canvases (the look must not change per load). */
function lcgLook(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** WALL TILE: 20cm ceramic squares, off-white gone slightly yellow, grout.
 *  Wall UVs span PAPER_U_M × PAPER_V_M (4m × 3m) per texture. */
function tileWallCanvas(): THREE.CanvasTexture {
  return canvasTex(1024, (g, S) => {
    const rnd = lcgLook(71);
    g.fillStyle = "#8f8a78"; // grout
    g.fillRect(0, 0, S, S);
    const nx = 20; // 4m / 20cm
    const ny = 15; // 3m / 20cm
    const tw = S / nx;
    const th = S / ny;
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const v = 214 + Math.floor(rnd() * 14);
        g.fillStyle = `rgb(${v},${v - 3},${v - 18})`;
        g.fillRect(x * tw + 2, y * th + 2, tw - 4, th - 4);
        // the glaze catches the light on the top edge
        g.fillStyle = "rgba(255,255,245,0.35)";
        g.fillRect(x * tw + 2, y * th + 2, tw - 4, 3);
      }
    // NO horizontal stripe: every wall segment hangs its texture from a
    // hashed V offset (see pushBox), so a band would jump height from one
    // segment to the next. Scattered darker tiles read as institutional
    // instead, and don't care where the row starts.
    for (let k = 0; k < 5; k++) {
      g.fillStyle = "#9da69f";
      g.fillRect(Math.floor(rnd() * nx) * tw + 2, Math.floor(rnd() * ny) * th + 2, tw - 4, th - 4);
    }
  });
}
/** MANILA: the old paper, gone darker and browner — the rooms nobody cleans. */
function manilaWallMat(): THREE.MeshStandardMaterial {
  const m = wallVariant(3);
  m.color = new THREE.Color(0xb49a62);
  return m;
}
/** FLOOR TILE: 25cm quarry tile, cream and a paler cream. Floor UVs are one
 *  unit per metre and this texture covers TWO metres (repeat 0.5). */
function tileFloorCanvas(): THREE.CanvasTexture {
  return canvasTex(1024, (g, S) => {
    const rnd = lcgLook(29);
    g.fillStyle = "#6f6a5c";
    g.fillRect(0, 0, S, S);
    const n = 8;
    const t = S / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const light = (x + y) % 2 === 0;
        const v = (light ? 206 : 176) + Math.floor(rnd() * 10);
        g.fillStyle = `rgb(${v},${v - 6},${v - 26})`;
        g.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
      }
  }, 0.5);
}
/** A carpet in another colour: the loop pile, tinted by multiply. */
function tintedCarpet(tint: string): THREE.CanvasTexture {
  const base = floorCanvas();
  const src = base.image as HTMLCanvasElement;
  const g = src.getContext("2d")!;
  g.globalCompositeOperation = "multiply";
  g.fillStyle = tint;
  g.fillRect(0, 0, src.width, src.height);
  g.globalCompositeOperation = "source-over";
  base.needsUpdate = true;
  return base;
}

/** A look list whose slots are MADE ON FIRST USE. A photographed surface
 *  downloads its colour and normal maps the moment its material is built, and
 *  every one used to be built whenever Level 0 or the office loaded — every
 *  texture in the catalogue on every entry, used or not (3.5MB in Oct 2026,
 *  and growing with each intake). Now a slot is built when a room asks for
 *  it; uploaded textures still `push` onto the end. */
function lazyLook(n: number, make: (i: number) => THREE.Material): THREE.Material[] {
  const arr: THREE.Material[] = new Array(n);
  return new Proxy(arr, {
    get(target, key, recv) {
      if (typeof key === "string" && key.length < 6 && /^\d+$/.test(key)) {
        const i = Number(key);
        if (i < n && target[i] === undefined) target[i] = make(i);
      }
      return Reflect.get(target, key, recv);
    },
  });
}

let lookMatsBuilt = false;
let lookWalls: THREE.Material[] = [];
let lookFloors: THREE.Material[] = [];
let lookCeils: THREE.Material[] = [];
function buildLookMats(): void {
  if (lookMatsBuilt) return;
  lookMatsBuilt = true;
  const surf = wallSurfaceMaps();
  const wallOf = (map: THREE.Texture, roughness: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ map, normalMap: surf.normal, normalScale: new THREE.Vector2(0.35, 0.35), roughness, vertexColors: true });
  const concreteWall = new THREE.MeshStandardMaterial({
    map: tex("/assets/pipes/tex/concrete032-color.jpg", 1, 1, true),
    normalMap: tex("/assets/pipes/tex/concrete032-normal.jpg", 1, 1, false),
    roughness: 0.92,
    color: 0xf2ece0,
    vertexColors: true,
  });
  // THE SURFACE CATALOGUE (src/backrooms/surfaces.ts) decides what each
  // index is. A PHOTOGRAPHED surface (`file`) is built here from its entry —
  // a texture added to the catalogue needs nothing else. A DRAWN one is the
  // material at its index in the lists below.
  //
  // PHOTOGRAPHED PANELLING (Sep 2026, the map-editor round): the panelled
  // offices' raised wood panels are a Poly Haven scan (CC0 — no credit owed).
  // Its own size (2.1m) made panels a hand's height tall — a chest of drawers,
  // not a boardroom — so the catalogue hangs it at 4.2m. Tried and REJECTED
  // the same round: Poly Haven's "Interior Tiles" for the restroom floor
  // (diagonal, pink, and sideways on a step) — the drawn cream tile stays.
  // The CARPETS stay drawn too — Josh chose the drawn carpet over a
  // photographed one (see floorMat).
  const photo = (s: Surface, ru: number, rv: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      map: tex(`/assets/br/tex/${s.file}-color.jpg`, ru, rv, true),
      ...(s.normal ? { normalMap: tex(`/assets/br/tex/${s.file}-normal.jpg`, ru, rv, false) } : {}),
      roughness: s.roughness ?? 0.8,
      vertexColors: true,
    });
    // horizontal detail hangs LEVEL (pushBox's levelHung buckets)
    if (s.level) m.userData.levelHung = true;
    return m;
  };
  // the other levels' own surfaces are drawn surfaces of the catalogue too
  buildPoolMats();
  buildPipeMats();
  const drawnWalls: (THREE.Material | undefined)[] = [wallMats[0], wallMats[1], wallMats[2], manilaWallMat(), wallOf(tileWallCanvas(), 0.35), undefined, concreteWall, poolWallMat];
  lookWalls = lazyLook(SURFACES.wall.length, (i) => { const s = SURFACES.wall[i]; return s.file ? photo(s, PAPER_U_M / (s.sizeM ?? 2), PAPER_V_M / (s.sizeM ?? 2)) : (drawnWalls[i] ?? wallMats[0]); });
  const drawnFloors: THREE.Material[] = [
    floorMat,
    new THREE.MeshLambertMaterial({ map: tintedCarpet("#9c8a6a"), vertexColors: true }),
    new THREE.MeshStandardMaterial({ map: tileFloorCanvas(), roughness: 0.45, vertexColors: true }),
    new THREE.MeshStandardMaterial({
      map: tex("/assets/pipes/tex/concrete044d-color.jpg", 0.4, 0.4, true),
      normalMap: tex("/assets/pipes/tex/concrete044d-normal.jpg", 0.4, 0.4, false),
      roughness: 0.85,
      color: 0xe6e0d0,
      vertexColors: true,
    }),
    new THREE.MeshLambertMaterial({ map: tintedCarpet("#6f9a78"), vertexColors: true }),
    poolFloorMat,
    pipeGrateMat,
  ];
  // floor UVs run one unit per metre; a ceiling tile's one unit per cell
  lookFloors = lazyLook(SURFACES.floor.length, (i) => { const s = SURFACES.floor[i]; return s.file ? photo(s, 1 / (s.sizeM ?? 2), 1 / (s.sizeM ?? 2)) : (drawnFloors[i] ?? floorMat); });
  const drawnCeils: THREE.Material[] = [
    ceilMat,
    new THREE.MeshStandardMaterial({ map: tex("/assets/pipes/tex/concrete033-color.jpg", 1, 1, true), roughness: 1, color: 0xd6d0c2, vertexColors: true }),
    poolCeilMat,
  ];
  lookCeils = lazyLook(SURFACES.ceil.length, (i) => { const s = SURFACES.ceil[i]; return s.file ? photo(s, CELL / (s.sizeM ?? 2), CELL / (s.sizeM ?? 2)) : (drawnCeils[i] ?? ceilMat); });
}

/** A surface for a SHAPE (shapes.ts), by id — any kind, built-in or
 *  uploaded — with the metres one UV unit covers on it (walls tile by the
 *  paper's repeat, floors by the metre, ceilings by the cell). */
export function shapeSurface(id: string): ShapeSurface | null {
  const kind = surfaceKindOf(id);
  if (!kind) return null;
  buildLookMats();
  const i = lookIndexOf(kind, id);
  if (i < 0) return null;
  const list = kind === "wall" ? lookWalls : kind === "floor" ? lookFloors : lookCeils;
  const mat = list[i];
  if (!mat) return null;
  return kind === "wall" ? { mat, uM: PAPER_U_M, vM: PAPER_V_M } : kind === "floor" ? { mat, uM: 1, vM: 1 } : { mat, uM: CELL, vM: CELL };
}

/** UPLOADED TEXTURES (the editor's "Add a texture"): each becomes a look
 *  material the first time a room names it, appended to the lists, so the
 *  rest of the chunk builder deals in indexes as it always has. */
const customIndex = new Map<string, number>();
/** A surface's index in the look lists, by id (built-in or uploaded), or -1. */
export function lookIndexOf(kind: SurfaceKind, id: string | undefined): number {
  if (!id) return -1;
  const i = surfaceIndex(kind, id);
  if (i >= 0) return i;
  const key = `${kind}:${id}`;
  const hit = customIndex.get(key);
  if (hit !== undefined) return hit;
  const c = findSurface(kind, id);
  if (!c || !("url" in c)) return -1;
  buildLookMats();
  const size = c.sizeM ?? 2;
  const [ru, rv] = kind === "wall" ? [PAPER_U_M / size, PAPER_V_M / size] : kind === "floor" ? [1 / size, 1 / size] : [CELL / size, CELL / size];
  const m = new THREE.MeshStandardMaterial({ map: tex(c.url as string, ru, rv, true), roughness: c.roughness ?? 0.85, vertexColors: true });
  if (c.level) m.userData.levelHung = true;
  const list = kind === "wall" ? lookWalls : kind === "floor" ? lookFloors : lookCeils;
  list.push(m);
  customIndex.set(key, list.length - 1);
  return list.length - 1;
}
/** Learn the uploaded textures a chunk names (it carries their definitions). */
export function learnSurfaces(list: readonly import("../../../src/backrooms/surfaces").CustomSurface[] | undefined): void {
  if (list?.length) addCustomSurfaces(list);
}

/** A cell's look: its room type's, with the room design's style (the
 *  editor's Look and Lights — surfaces.ts) laid over whatever it sets. */
export function lookWithStyle(type: string, style: LookSpec | null | undefined): LobbyLook {
  const base = lobbyLookOf(type);
  if (!style) return base;
  const w = lookIndexOf("wall", style.wall);
  const fl = lookIndexOf("floor", style.floor);
  const ce = lookIndexOf("ceil", style.ceil);
  return {
    ...base,
    wall: w >= 0 ? w : base.wall,
    floor: fl >= 0 ? fl : base.floor,
    ceil: ce >= 0 ? ce : base.ceil,
    lights: style.lights !== undefined ? style.lights / 100 : base.lights,
    ambient: (base.ambient ?? 1) * styleBright(style),
    flicker: style.flicker !== undefined ? style.flicker / 100 : base.flicker,
  };
}

/** The Level 0 look materials, indexed as LobbyLook's wall/floor/ceil numbers
 *  — the map editor's preview dresses its rooms with the game's own. They
 *  want WORLD-scale UVs (walls PAPER_U_M × PAPER_V_M per repeat, floors and
 *  ceilings one unit per metre) and a vertex colour, like every chunk. */
export function lobbyLookMaterials(): { walls: readonly THREE.Material[]; floors: readonly THREE.Material[]; ceils: readonly THREE.Material[] } {
  buildLookMats();
  return { walls: lookWalls, floors: lookFloors, ceils: lookCeils };
}

// ---- THE POOLROOMS material set (Level 1) -----------------------------------
// Pristine white tile on every surface — the poolcore look is uniformity, so
// one synthesized tile canvas dresses walls, floors and ceilings at different
// tile scales, glossy where the carpet world is matte. Water is the pack's
// seamless water color + normal, scrolled slowly by tickWater; a single
// directional "sun" (added by applyLevelEnvironment) gives it speculars.



// ---- THE POOL TILE, REBUILT (Oct 2026) ------------------------------------
// Josh: "I just want the tile and the tiles properly aligned (every wall does
// not have uniform texturing) the tile has no depth to it and looks like matt
// sheets." Three faults, three answers:
//  1. ALIGNMENT. The walls' UVs started at each segment's own corner, and
//     pushBox then hung every segment from a hashed offset (right for paper —
//     it hides the roll's repeat — and wrong for tile, whose grout must run on
//     unbroken). alignTileUVs re-maps every tiled surface from its WORLD
//     position instead: walls, risers and the floor share one grid, so a
//     grout line runs up a wall, across a step and on over the floor.
//  2. SCALE. 12.5cm, the size every one of the twenty references shows —
//     and a whole number of tiles in a floor step (0.5m) and a cell (2m), so
//     the grid lands on every edge of the map.
//  3. DEPTH. A colour picture only, with nothing to reflect. Each tile is now
//     a glazed plateau over recessed grout (a normal map with a small bevel
//     and a different tilt per tile, so neighbours catch the light unevenly,
//     as real tile does), glossy where the grout is matt (a roughness map),
//     and the glaze reflects an environment — scaled by the baked light, so a
//     dim room's walls never shine brighter than the room (poolGloss).
const POOL_TILE_M = 0.125;
/** Metres of surface one tile canvas covers — UVs are world metres ÷ this. */
export const POOL_TILE_SPAN = 1;

interface TileSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}
function poolTileSet(spanM: number, tileM: number, repeat: number): TileSet {
  const PX = 1024 / spanM; // pixels per metre (1024 across the canvas)
  const W = Math.round(spanM * PX);
  const n = Math.round(spanM / tileM);
  const T = W / n; // pixels per tile
  const gap = Math.max(2, T * 0.07); // grout ~9mm at 12.5cm
  // a rounded glazed edge wide enough to survive the mipmaps at a few metres
  const bevel = Math.max(2, T * 0.11);
  const color = document.createElement("canvas");
  color.width = color.height = W;
  const cd = color.getContext("2d")!.createImageData(W, W);
  // grout, recessed: grey, darker still where the tile edge shadows it
  for (let i = 0; i < W * W; i++) {
    cd.data[i * 4] = 158;
    cd.data[i * 4 + 1] = 164;
    cd.data[i * 4 + 2] = 161;
    cd.data[i * 4 + 3] = 255;
  }
  const height = new Float32Array(W * W);
  const rough = new Uint8ClampedArray(W * W * 4);
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const h = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % 1000;
      // one warm-white porcelain everywhere (Josh: "every wall does not have
      // uniform texturing") — a whisper of kiln variation, no accent tiles: on
      // a canvas that repeats every metre an accent becomes a visible pattern
      const lum = 238 + (h % 5) - 2;
      const x0 = tx * T + gap / 2;
      const y0 = ty * T + gap / 2;
      const s = T - gap;
      // the height field: a plateau with a bevelled edge and its own tilt
      const tiltX = ((h % 7) - 3) * 0.004;
      const tiltY = (((h >> 3) % 7) - 3) * 0.004;
      for (let py = Math.floor(ty * T); py < Math.floor((ty + 1) * T); py++) {
        for (let px = Math.floor(tx * T); px < Math.floor((tx + 1) * T); px++) {
          const ex = Math.min(px - x0, x0 + s - px);
          const ey = Math.min(py - y0, y0 + s - py);
          const e = Math.min(ex, ey);
          const i = py * W + px;
          if (e <= 0) {
            height[i] = 0; // grout, recessed
            rough[i * 4 + 1] = 230;
            // the grout under a tile's lower edge sits in its shadow
            const below = py - (y0 + s) >= 0 && py - (y0 + s) < gap && px > x0 && px < x0 + s;
            if (below) for (let k = 0; k < 3; k++) cd.data[i * 4 + k] -= 18;
          } else {
            const plate = Math.min(1, e / bevel);
            // THE GLAZE, PAINTED: the bevel catches the light on its top and
            // left edges and turns away from it on the bottom and right, and
            // the face carries a faint sheen toward its upper corner — so a
            // tile reads as a raised, glazed square from any angle and under
            // any light, the way a photograph of one does (the baked light
            // here is mostly ambient, which a normal map alone can't show)
            let shade = 1;
            if (plate < 1) {
              const edge = 1 - plate;
              const fromTop = py - y0, fromBottom = y0 + s - py, fromLeft = px - x0, fromRight = x0 + s - px;
              const m = Math.min(fromTop, fromBottom, fromLeft, fromRight);
              shade += (m === fromTop || m === fromLeft ? 0.07 : -0.16) * edge;
            }
            shade += 0.025 * (1 - ((px - x0) + (py - y0)) / (2 * s));
            cd.data[i * 4] = Math.min(255, (lum - 3) * shade);
            cd.data[i * 4 + 1] = Math.min(255, lum * shade);
            cd.data[i * 4 + 2] = Math.min(255, (lum - 4) * shade);
            height[i] = (1 - (1 - plate) * (1 - plate)) + (px - (x0 + s / 2)) * tiltX + (py - (y0 + s / 2)) * tiltY;
            rough[i * 4 + 1] = Math.round(62 + (1 - plate) * 110 + (h % 5) * 3); // glaze ~0.24-0.3: a sheen, not a mirror
          }
          rough[i * 4 + 3] = 255;
        }
      }
    }
  }
  color.getContext("2d")!.putImageData(cd, 0, 0);
  // the normal map from the height field (a sobel, wrapping at the edges so
  // the canvas tiles seamlessly)
  const normal = document.createElement("canvas");
  normal.width = normal.height = W;
  const nd = normal.getContext("2d")!.createImageData(W, W);
  const k = 3.2; // depth: how steep the grout and bevels read
  const at = (x: number, y: number): number => height[((y + W) % W) * W + ((x + W) % W)];
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * W + x) * 4;
      nd.data[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      nd.data[o + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      nd.data[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      nd.data[o + 3] = 255;
    }
  }
  normal.getContext("2d")!.putImageData(nd, 0, 0);
  const rc = document.createElement("canvas");
  rc.width = rc.height = W;
  rc.getContext("2d")!.putImageData(new ImageData(rough, W, W), 0, 0);
  const wrap = (cv: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = ANISO;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: wrap(color, true), normalMap: wrap(normal, false), roughnessMap: wrap(rc, false) };
}

/** THE GLAZE REFLECTS, BUT ONLY AS BRIGHT AS THE ROOM. An environment map's
 *  reflection ignores the baked vertex light (it lands on the specular term,
 *  which vertex colours never touch), so a dark Deep would shine like the
 *  sunlit baths. This scales the reflected radiance by the vertex light —
 *  and takes NO diffuse light from the environment: the baked field IS the
 *  diffuse light here, and the environment's irradiance, multiplied by a
 *  bright room's vertex colour, lit every floor twice (pure white). */
function poolGloss(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_fragment_maps>",
      "#include <lights_fragment_maps>\n#ifdef USE_ENVMAP\n  iblIrradiance = vec3( 0.0 );\n#endif\n#if defined( USE_ENVMAP ) && defined( USE_COLOR )\n  radiance *= clamp( dot( vColor.rgb, vec3( 0.3333 ) ) * 0.9, 0.0, 1.0 );\n#endif",
    );
  };
  m.customProgramCacheKey = () => "poolGloss";
}

/** WHAT THE GLAZE REFLECTS: a pool hall, softly. Three's stock RoomEnvironment
 *  is a studio — hot white light boxes — and glazed tile at a low angle
 *  mirrors them, so every floor washed out to pure white (found on the first
 *  fly-through). This is a sphere graded the way the Poolrooms are lit: a
 *  bright skylit ceiling, pale tiled walls at the horizon, dark water below,
 *  with no hot spot anywhere — the tile catches a sheen, never a lamp. */
export function makePoolEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xf4faf8).multiplyScalar(0.95);
  const mid = new THREE.Color(0xd2e2df).multiplyScalar(0.7);
  const low = new THREE.Color(0x3f7f80).multiplyScalar(0.35);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10; // -1 … 1
    if (y >= 0) c.copy(mid).lerp(top, Math.pow(y, 0.7));
    else c.copy(mid).lerp(low, Math.pow(-y, 0.5));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const sphere = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  sc.add(sphere);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(sc, 0.02).texture;
  pm.dispose();
  geo.dispose();
  (sphere.material as THREE.Material).dispose();
  return env;
}

/** THE KIT'S TILE ON THE WALLS' GRID. The Sketchfab pieces (arches, holes,
 *  cubbies, the tunnel ring) are INSTANCED, so their UVs can't be re-mapped
 *  per copy the way alignTileUVs re-maps a merged wall: each copy wore its
 *  own little cut of tile that met nothing round it. This maps the tile from
 *  the WORLD position in the vertex shader instead (by the face's dominant
 *  axis, as alignTileUVs does), so every piece lands on the same 12.5cm grid
 *  as the wall it stands in. */
function worldTiled(m: THREE.MeshStandardMaterial, span: number): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, rr) => {
    prev?.call(m, sh, rr);
    sh.vertexShader = sh.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
  {
    vec4 wpT = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      wpT = instanceMatrix * wpT;
    #endif
    wpT = modelMatrix * wpT;
    vec3 wnT = inverseTransformDirection( transformedNormal, viewMatrix );
    vec3 aT = abs( wnT );
    vec2 tUv = ( aT.y >= aT.x && aT.y >= aT.z ) ? wpT.xz : ( aT.x >= aT.z ? wpT.zy : wpT.xy );
    tUv /= ${span.toFixed(4)};
    #ifdef USE_MAP
      vMapUv = ( mapTransform * vec3( tUv, 1.0 ) ).xy;
    #endif
    #ifdef USE_NORMALMAP
      vNormalMapUv = ( normalMapTransform * vec3( tUv, 1.0 ) ).xy;
    #endif
    #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv = ( roughnessMapTransform * vec3( tUv, 1.0 ) ).xy;
    #endif
  }`,
    );
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + "|worldTiled";
}
let poolKitTileMat: THREE.MeshStandardMaterial | null = null;
let poolEnv: THREE.Texture | null = null;

/** The environment the glaze reflects — set by the game once (it owns the
 *  renderer the PMREM needs); null leaves the tile glossy but reflecting
 *  nothing. */
export function setPoolEnvironment(env: THREE.Texture | null): void {
  buildPoolMats();
  poolEnv = env;
  for (const m of [poolWallMat, poolFloorMat, poolCeilMat, poolKitTileMat]) {
    if (!m) continue;
    m.envMap = env;
    m.needsUpdate = true;
  }
}

/** Re-map a tiled surface's UVs from its WORLD position (see the note above):
 *  each face by the axis it faces — a wall along x takes u from x, one along z
 *  from z, and v from the height; a flat face takes u, v from x, z. */
function alignTileUVs(geo: THREE.BufferGeometry, span: number): void {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  let uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
    geo.setAttribute("uv", uv);
  }
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const x = pos.getX(i) / span;
    const y = pos.getY(i) / span;
    const z = pos.getZ(i) / span;
    if (ay >= ax && ay >= az) uv.setXY(i, x, z);
    else if (ax >= az) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

// Wall tiles: 20cm squares over the wallpaper UV span (2.6m × 2.0m), so the
// existing world-scale box UVs land tiles at life size with zero new math.
// Floor: world-metre UVs, canvas spans 2m (repeat 0.5) like the carpet.
// Ceiling: per-cell quads (repeat 1), 2m of 25cm tile.
let poolMatsBuilt = false;
let poolWallMat: THREE.MeshStandardMaterial;
let poolFloorMat: THREE.MeshStandardMaterial;
let poolCeilMat: THREE.MeshStandardMaterial;
let poolWaterMat: THREE.MeshStandardMaterial;
let poolCausticMatA: THREE.MeshBasicMaterial;
let poolCausticMatB: THREE.MeshBasicMaterial;
/** THE SURFACE ripple (Josh: "the texture of the top of the water is on the
 *  bottom of the water"). The caustic web belonged to the floor only, so
 *  every ripple you saw was underfoot and the surface read as flat glass.
 *  These two layers ride the SURFACE itself, drifting against each other. */
let poolSurfMatA: THREE.MeshBasicMaterial;
let poolSurfMatB: THREE.MeshBasicMaterial;
const SKYLIGHT_COLOR = 0xfff6dd;
let poolSkylightMat: THREE.MeshBasicMaterial;
function buildPoolMats(): void {
  if (poolMatsBuilt) return;
  poolMatsBuilt = true;
  // one tile, everywhere (walls, risers, floor: world-aligned, see
  // alignTileUVs); the ceiling's per-cell quads take a 25cm tile on a 2m canvas
  const wt = poolTileSet(POOL_TILE_SPAN, POOL_TILE_M, 1);
  poolWallMat = new THREE.MeshStandardMaterial({
    map: wt.map,
    normalMap: wt.normalMap,
    roughnessMap: wt.roughnessMap,
    roughness: 1, // the map carries it: glaze ~0.15, grout ~0.9
    vertexColors: true,
    envMapIntensity: 1.0,
  });
  poolWallMat.userData.tileSpan = POOL_TILE_SPAN;
  poolGloss(poolWallMat);
  poolFloorMat = new THREE.MeshStandardMaterial({
    // the floor's UVs are world metres already (floorQuad), and the canvas is
    // one metre: the same grid as the walls
    map: wt.map,
    normalMap: wt.normalMap,
    roughnessMap: wt.roughnessMap,
    roughness: 1,
    vertexColors: true,
    envMapIntensity: 0.8,
  });
  poolGloss(poolFloorMat);
  const ct = poolTileSet(2, 0.25, 1);
  poolCeilMat = new THREE.MeshStandardMaterial({
    map: ct.map,
    normalMap: ct.normalMap,
    roughnessMap: ct.roughnessMap,
    roughness: 1,
    vertexColors: true,
    envMapIntensity: 0.5,
  });
  poolGloss(poolCeilMat);
  poolSkylightMat = new THREE.MeshBasicMaterial({ color: SKYLIGHT_COLOR });
  const wnrm = tex("/assets/pools/water_normal.jpg", 1, 1, false);
  poolWaterMat = new THREE.MeshStandardMaterial({
    normalMap: wnrm,
    normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0x8ccfc6, // the reference's teal wash — the tile reads through it
    transparent: true,
    opacity: 0.45,
    roughness: 0.08,
    metalness: 0,
    depthWrite: false,
  });
  const caust = causticCanvas();
  poolCausticMatA = new THREE.MeshBasicMaterial({
    map: caust,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const caustB = caust.clone();
  caustB.needsUpdate = true;
  caustB.repeat.set(0.71, 0.71); // a different scale breaks the moiré
  poolCausticMatB = new THREE.MeshBasicMaterial({
    map: caustB,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // The SURFACE pair — bigger, softer webs than the floor's, so the top of
  // the water carries the moving light and the bottom just glows under it.
  const surfA = caust.clone();
  surfA.needsUpdate = true;
  surfA.repeat.set(0.42, 0.42);
  poolSurfMatA = new THREE.MeshBasicMaterial({
    map: surfA,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const surfB = caust.clone();
  surfB.needsUpdate = true;
  surfB.repeat.set(0.29, 0.29);
  poolSurfMatB = new THREE.MeshBasicMaterial({
    map: surfB,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/** Fake caustics: a tiling web of soft light-lines (drawn wrapped so it
 *  repeats seamlessly). Two drifting additive copies over the submerged
 *  floor sell "sunlight through ripples" without a shader. */
function causticCanvas(): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  const rand = (() => {
    let a = 0x9e3779b9;
    return () => {
      a ^= a << 13; a ^= a >>> 17; a ^= a << 5;
      return ((a >>> 0) % 10000) / 10000;
    };
  })();
  // Cell centers; light concentrates along the borders between them (the
  // real physics, roughly) — draw soft arcs around each center, wrapped.
  const pts: [number, number][] = [];
  for (let i = 0; i < 42; i++) pts.push([rand() * S, rand() * S]);
  g.lineCap = "round";
  for (const [px, py] of pts) {
    for (let arc = 0; arc < 5; arc++) {
      const r = 18 + rand() * 46;
      const a0 = rand() * Math.PI * 2;
      const a1 = a0 + 0.8 + rand() * 1.6;
      const w = 1.5 + rand() * 3.5;
      const bright = 0.25 + rand() * 0.5;
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S], [S, S], [-S, -S], [S, -S], [-S, S]] as [number, number][]) {
        g.strokeStyle = `rgba(220, 255, 246, ${bright})`;
        g.lineWidth = w;
        g.beginPath();
        g.arc(px + ox, py + oy, r, a0, a1);
        g.stroke();
      }
    }
  }
  // Soft blur pass by re-drawing scaled (canvas has no cheap blur everywhere).
  const cv2 = document.createElement("canvas");
  cv2.width = cv2.height = S;
  const g2 = cv2.getContext("2d")!;
  g2.filter = "blur(2px)";
  g2.drawImage(cv, 0, 0);
  const t = new THREE.CanvasTexture(cv2);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  return t;
}

// ---- THE POOLROOMS KIT (Josh's FBX modules, Aug 2026) -----------------------
// The deco layer's dressing: arches, circle portals, portholes, cubbies,
// bridges, railings — real modular geometry from the TheBackroomsAndPoolrooms
// pack (client/public/assets/pools/kit). The FBX ships bare (no textures), so
// every piece gets BOX-PROJECTED UVs at world scale and wears the same
// 0.325m tile canvas as the walls — kit and procedural surfaces match
// exactly. Loaded once, lazily, the first time a pools chunk asks.

interface KitPiece {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}
let kitPromise: Promise<Map<string, KitPiece>> | null = null;

/** World-scale box projection: each face samples the tile grid along its
 *  dominant axis, so curved intrados and flat wall alike carry life-size
 *  tiles that line up with the rest of the room. */
function boxProjectUVs(g: THREE.BufferGeometry): void {
  g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (nx >= nz) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / PAPER_U_M;
    uv[i * 2 + 1] = v / PAPER_V_M;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** A REAL arch (Josh: "the kit arches are paper-thin curved walls — no
 *  floating models, no paper"): a rectangular cross-section swept along a
 *  semicircle with straight legs below the spring line, extruded to real
 *  depth. Unit size — outer radius 1, legs 0.5, so height 1.5 and span 2 —
 *  scaled per placement; UVs box-projected like every kit piece. */
function archGeometry(): THREE.BufferGeometry {
  const R = 1; // outer radius
  const T = 0.3; // radial thickness of the band
  const LEG = 0.5; // straight leg below the spring line
  const D = 0.58; // extruded depth (along the passage) — real masonry
  const shape = new THREE.Shape();
  shape.moveTo(-R, 0);
  shape.lineTo(-R, LEG);
  shape.absarc(0, LEG, R, Math.PI, 0, true);
  shape.lineTo(R, 0);
  shape.lineTo(R - T, 0);
  shape.lineTo(R - T, LEG);
  shape.absarc(0, LEG, R - T, 0, Math.PI, false);
  shape.lineTo(-(R - T), 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 18 });
  g.translate(0, 0, -D / 2); // centre the depth on the placement cell
  return g;
}

/** THE TUNNEL RING over a channel — a full circle you boat through.
 *
 *  The pack's `Wall_Circle_wide_tunnel` is a SHEET, like its "Archway" was:
 *  edge-on it vanishes to a line, which over a river reads as a sticker
 *  rather than masonry (Josh: "some wall cirlcle wide tunnels over the river
 *  are paper thin"). So it's generated instead — an extruded annulus with a
 *  real bore, unit-sized (outer radius 1) so placement can scale it freely. */
function tunnelRingGeometry(): THREE.BufferGeometry {
  const R = 1; // outer radius
  const T = 0.17; // radial thickness of the rim
  const D = 1.7; // depth along the passage — you pass THROUGH it
  const shape = new THREE.Shape();
  shape.absarc(0, 0, R, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, R - T, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 36 });
  // Base at y=0 and depth centred on the cell — the same origin convention
  // the FBX pieces are normalised to, so placement maths is shared.
  g.translate(0, R, -D / 2);
  return g;
}

// THE ROWBOAT is a GLB now (Josh's green inflatable, Aug 2026) — loaded and
// cloned in BackroomsGame like the gator; the old procedural punt is gone.

/** The chrome pool ladder (Dream_Pool_43's grab rails) — built from tubes,
 *  no asset needed: two rails curling over the deck lip, four rungs. */
function ladderGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const R = 0.03;
  for (const side of [-0.25, 0.25]) {
    const rail = new THREE.CylinderGeometry(R, R, 1.9, 8);
    rail.translate(side, -0.6, 0);
    parts.push(rail);
    const bend = new THREE.TorusGeometry(0.22, R, 8, 10, Math.PI / 2);
    bend.rotateY(Math.PI / 2);
    bend.translate(side, 0.35, -0.22);
    parts.push(bend);
    const grip = new THREE.CylinderGeometry(R, R, 0.45, 8);
    grip.rotateX(Math.PI / 2);
    grip.translate(side, 0.57, -0.45);
    parts.push(grip);
  }
  for (let r = 0; r < 4; r++) {
    const rung = new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.5, 8);
    rung.rotateZ(Math.PI / 2);
    rung.translate(0, -0.25 - r * 0.38, 0);
    parts.push(rung);
  }
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** THE WINDOW (P6, Josh's references: the Poolrooms' tall sunlit windows) —
 *  an arched opening 1.7m wide and 4m tall, standing on its sill at y=0 and
 *  facing +Z: a sky panel (painted daylight, unlit) and its white frame with
 *  a mullion and two transoms. Not a lamp — nothing here casts light; the
 *  room's brightness is its own Lights setting (the fixture law). */
function windowGeometry(): { sky: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  const W = 1.7;
  const H = 4.0;
  const r = W / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, H - r);
  shape.absarc(0, H - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  const sky = new THREE.ShapeGeometry(shape, 24);
  const pos = sky.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + r) / W;
    uv[i * 2 + 1] = pos.getY(i) / H;
  }
  sky.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, 0.03);
    parts.push(g);
  };
  box(0.07, H - r, 0.08, 0, (H - r) / 2); // mullion
  box(W, 0.07, 0.08, 0, 1.35); // transoms
  box(W, 0.07, 0.08, 0, 2.55);
  box(0.12, H - r, 0.14, -r, (H - r) / 2); // jambs
  box(0.12, H - r, 0.14, r, (H - r) / 2);
  box(W + 0.3, 0.14, 0.22, 0, 0); // sill
  const head = new THREE.TorusGeometry(r, 0.07, 6, 24, Math.PI);
  head.translate(0, H - r, 0.03);
  parts.push(head);
  const norm = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of norm) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
  const frame = mergeGeometries(norm)!;
  for (const g of parts) g.dispose();
  return { sky, frame };
}
/** Painted daylight: a pale sky with soft clouds, brighter at the horizon. */
function skyTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#8ec8f2");
  grad.addColorStop(0.65, "#cfe9fb");
  grad.addColorStop(1, "#f4fbff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 14; k++) {
    const x = rnd() * 128;
    const y = 30 + rnd() * 150;
    const rr = 10 + rnd() * 22;
    const cg = g.createRadialGradient(x, y, 0, x, y, rr);
    cg.addColorStop(0, "rgba(255,255,255,0.75)");
    cg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = cg;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function loadPoolKit(): Promise<Map<string, KitPiece>> {
  if (kitPromise) return kitPromise;
  buildPoolMats();
  // the walls' 12.5cm tile, mapped from world position (worldTiled) so every
  // instanced piece lands on the walls' grid
  const kt = poolTileSet(POOL_TILE_SPAN, POOL_TILE_M, 1);
  const tileMat = new THREE.MeshStandardMaterial({
    map: kt.map,
    normalMap: kt.normalMap,
    roughnessMap: kt.roughnessMap,
    roughness: 1,
    // DOUBLE-SIDED, always. Several pack pieces are open shells, and a
    // front-faced shell is simply INVISIBLE from behind — you walk round a
    // cubby panel or an arch and it isn't there (Josh: "on the back side it
    // is see through"). Backface culling saves nothing measurable on a few
    // hundred instanced pieces; a hole in the world costs everything.
    side: THREE.DoubleSide,
    envMap: poolEnv,
    envMapIntensity: 0.8,
    // each copy carries its room's light as an instance colour (buildChunk)
  });
  poolGloss(tileMat);
  worldTiled(tileMat, POOL_TILE_SPAN);
  poolKitTileMat = tileMat;
  // Chrome needs something to reflect: at metalness 0.92 with no environment
  // map the ladders rendered BLACK (Nov 2026 polish round). It mirrors the
  // same soft pool hall the tile glaze does.
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.18, metalness: poolEnv ? 0.92 : 0.3, envMap: poolEnv, envMapIntensity: 1 });
  // NOTE: the pack's "Archway" is a curved WALL sheet, not an arch — the
  // real arch is generated (archGeometry) and registered under that name.
  // "Wall_Circle_wide_tunnel" is likewise a sheet — generated below.
  const NAMES = ["Wall_Circle_wide", "Wall_CircleHole", "Wall_wCubby", "Bridge_center", "Railing_straight"];
  kitPromise = (async () => {
    const { FBXLoader: Loader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    // The pack's FBX files name textures that were never shipped
    // (PoolroomTile_*.png, and an empty filename on the railing) and the
    // loader asked for each one — four 404s and a bare /kit/ on every visit.
    // Their materials are thrown away (the tile material replaces them), so
    // every image request is answered with a blank pixel (Nov 2026 polish).
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/\.(png|jpe?g|tga|bmp|dds)(\?|$)/i.test(url) || /\/kit\/?$/.test(url) ? BLANK_PIXEL : url));
    const loader = new Loader(manager);
    const map = new Map<string, KitPiece>();
    await Promise.all(
      NAMES.map(async (nm) => {
        try {
          const obj = await loader.loadAsync(`/assets/pools/kit/${nm}.fbx`);
          obj.updateMatrixWorld(true);
          const geos: THREE.BufferGeometry[] = [];
          obj.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (mesh.isMesh) {
              const g = mesh.geometry.clone();
              g.applyMatrix4(mesh.matrixWorld);
              geos.push(g);
            }
          });
          if (!geos.length) return;
          const merged = mergeGeometries(geos)!;
          for (const g of geos) g.dispose();
          merged.scale(0.01, 0.01, 0.01); // the pack is authored in cm
          // Normalize origin: XZ centred, base at y=0 — placement math is
          // then identical for every piece.
          merged.computeBoundingBox();
          const bb = merged.boundingBox!;
          merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
          boxProjectUVs(merged);
          map.set(nm, { geo: merged, mat: tileMat });
        } catch {
          /* a missing piece renders as nothing — never breaks the chunk */
        }
      }),
    );
    const arch = archGeometry();
    boxProjectUVs(arch);
    map.set("Archway", { geo: arch, mat: tileMat });
    const ring = tunnelRingGeometry();
    boxProjectUVs(ring);
    map.set("Wall_Circle_wide_tunnel", { geo: ring, mat: tileMat });
    map.set("Ladder", { geo: ladderGeometry(), mat: chromeMat });
    const win = windowGeometry();
    map.set("WindowSky", { geo: win.sky, mat: new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }) });
    map.set("WindowFrame", { geo: win.frame, mat: new THREE.MeshStandardMaterial({ color: 0xf1f0ea, roughness: 0.45 }) });
    return map;
  })();
  return kitPromise;
}

/** Scroll the water — two layers drifting at different angles so the surface
 *  never reads as a sliding sticker. Cheap: two offset writes per frame. */
export function tickWater(timeMs: number): void {
  const t = timeMs / 1000;
  tickOcean(t);
  if (!poolMatsBuilt) return;
  if (poolWaterMat.normalMap) poolWaterMat.normalMap.offset.set((t * -0.006) % 1, (t * 0.01) % 1);
  // The caustic webs drift AGAINST each other; their interference is the
  // ripple-dance (a single moving layer reads as a sliding sticker).
  poolCausticMatA.map?.offset.set((t * 0.016) % 1, (t * 0.011) % 1);
  poolCausticMatB.map?.offset.set((t * -0.012) % 1, (t * -0.017) % 1);
  // The surface pair drifts slower and against itself — the interference
  // is what reads as moving water rather than a sliding texture.
  poolSurfMatA.map?.offset.set((t * 0.009) % 1, (t * 0.006) % 1);
  poolSurfMatB.map?.offset.set((t * -0.006) % 1, (t * 0.008) % 1);
  // A slow shimmer in strength, like clouds over the skylights.
  const breathe = 0.8 + 0.2 * Math.sin(t * 0.7);
  // The FLOOR keeps a soft glow (it's the light that got through), while
  // the SURFACE carries the moving ripple — the balance Josh asked for.
  poolCausticMatA.opacity = 0.3 * breathe;
  poolCausticMatB.opacity = 0.22 * (2 - breathe) * 0.5 + 0.1;
  poolSurfMatA.opacity = 0.5 * breathe;
  poolSurfMatB.opacity = 0.34 * (2 - breathe) * 0.5 + 0.16;
}

// ---- PIPE DREAMS material set (Level 2) ---------------------------------------
// Poured concrete everywhere (ambientCG CC0 sets, picked 2026-09-26 against the
// canon's "long dim concrete maintenance hallways"): streaked bunker cast on
// the walls, a stained slab underfoot, dark concrete overhead. The light is
// the baked fixture field alone — sparse caged bulbs, darkness between them.
let pipeMatsBuilt = false;
let pipeWallMat: THREE.MeshStandardMaterial;
let pipeFloorMat: THREE.MeshStandardMaterial;
let pipeCeilMat: THREE.MeshStandardMaterial;
let pipeBulbMat: THREE.MeshBasicMaterial;
let pipeGrateMat: THREE.MeshStandardMaterial;
let pipeBulbDeadMat: THREE.MeshBasicMaterial;
function buildPipeMats(): void {
  if (pipeMatsBuilt) return;
  pipeMatsBuilt = true;
  pipeWallMat = new THREE.MeshStandardMaterial({
    map: tex("/assets/pipes/tex/concrete032-color.jpg", 1, 1, true),
    normalMap: tex("/assets/pipes/tex/concrete032-normal.jpg", 1, 1, false),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.92,
    vertexColors: true,
  });
  pipeFloorMat = new THREE.MeshStandardMaterial({
    // The floor mesh writes world-metre UVs; one texture spans 2.5m.
    map: tex("/assets/pipes/tex/concrete044d-color.jpg", 0.4, 0.4, true),
    normalMap: tex("/assets/pipes/tex/concrete044d-normal.jpg", 0.4, 0.4, false),
    roughness: 0.85,
    vertexColors: true,
  });
  pipeCeilMat = new THREE.MeshStandardMaterial({
    map: tex("/assets/pipes/tex/concrete033-color.jpg", 1, 1, true),
    roughness: 1,
    vertexColors: true,
  });
  // Catwalks and bridges: rusted perforated plate (MetalWalkway014). The
  // floor mesh writes world-metre UVs; one plate spans 2m.
  pipeGrateMat = new THREE.MeshStandardMaterial({
    map: tex("/assets/pipes/tex/metalwalkway014-color.jpg", 0.5, 0.5, true),
    roughness: 0.6,
    metalness: 0.45,
    vertexColors: true,
  });
  pipeBulbMat = new THREE.MeshBasicMaterial({ color: 0xffb35a });
  pipeBulbDeadMat = new THREE.MeshBasicMaterial({ color: 0x2a2218 });
}

// ---- THE ELECTRICAL STATION material set (Level 3) ----------------------------
// ambientCG / Poly Haven CC0 (scripts/assets/level3.json): dirty white tile on
// the walls, chipped epoxy underfoot, riveted plate overhead. Lit by its own
// lamps alone — and a lamp is dark while its SECTION has no power.
let stationMatsBuilt = false;
let stationWallMat: THREE.MeshStandardMaterial;
let stationFloorMat: THREE.MeshStandardMaterial;
let stationCeilMat: THREE.MeshStandardMaterial;
let stationWaterLive: THREE.MeshStandardMaterial;
let stationWaterDead: THREE.MeshStandardMaterial;
// The Station water's shader pieces (buildStationMats → water()).
const STATION_WATER_COMMON = `#include <common>
uniform float uTime;
uniform float uFlash;
varying float vShore;
varying vec2 vWxz;
float swHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float swNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( swHash( i ), swHash( i + vec2( 1, 0 ) ), u.x ), mix( swHash( i + vec2( 0, 1 ) ), swHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float swFbm( vec2 p ) { return swNoise( p ) * 0.6 + swNoise( p * 2.07 + 7.3 ) * 0.3 + swNoise( p * 4.13 - 3.1 ) * 0.1; }`;
/** THE CURRENT. Thin filaments where a drifting noise field crosses its
 *  midline — but only inside PATCHES that wander over the water, so the
 *  crackle comes and goes from place to place rather than covering the
 *  surface like caustics (the first cut read as a lit pool, not a hazard).
 *  Under it a faint cold glow that breathes, so live water reads as live
 *  even where nothing is crackling. */
const STATION_WATER_CURRENT = `#include <emissivemap_fragment>
{
  float patchA = smoothstep( 0.58, 0.82, swNoise( vWxz * 0.32 + vec2( uTime * 0.55, uTime * 0.18 ) ) );
  float patchB = smoothstep( 0.62, 0.86, swNoise( vWxz * 0.27 - vec2( uTime * 0.21, uTime * 0.47 ) + 5.0 ) );
  float a = swFbm( vWxz * 1.1 + vec2( uTime * 0.9, -uTime * 0.6 ) );
  float b = swFbm( vWxz * 1.9 + vec2( -uTime * 0.7, uTime * 0.8 ) + 11.0 );
  float fa = 1.0 - smoothstep( 0.0, 0.016, abs( a - 0.5 ) );
  float fb = 1.0 - smoothstep( 0.0, 0.011, abs( b - 0.5 ) );
  float flick = step( 0.35, fract( sin( floor( uTime * 18.0 ) * 12.9898 ) * 43758.5453 ) );
  float crackle = ( fa * patchA * 1.6 + fb * patchB * 1.2 ) * ( 0.55 + 0.45 * flick );
  float hum = 0.022 + 0.012 * sin( uTime * 2.1 + vWxz.x * 0.4 + vWxz.y * 0.3 );
  totalEmissiveRadiance += vec3( 0.32, 0.66, 1.0 ) * ( crackle + hum + uFlash * 0.7 );
}`;
/** A ragged shore: the edge fades through noise, never along a cell line. */
const STATION_WATER_SHORE = `#include <opaque_fragment>
float shoreN = swNoise( vWxz * 1.7 ) * 0.55 + swNoise( vWxz * 4.3 ) * 0.25;
gl_FragColor.a *= smoothstep( 0.0, 0.35, vShore * 1.25 - 0.25 + shoreN - 0.4 );`;

function buildStationMats(): void {
  if (stationMatsBuilt) return;
  stationMatsBuilt = true;
  // BRICK (Oct 2026, the reference task: every one of the 20 is yellow-brown
  // or red brick under sodium light; the white tile read as a hospital). One
  // course grid from WORLD position (alignTileUVs, as the pool tile does), so
  // the mortar lines run level and unbroken from one wall segment to the next
  // and on round every corner.
  stationWallMat = new THREE.MeshStandardMaterial({
    map: tex("/assets/br/tex/red-brick-color.jpg", 1, 1, true),
    normalMap: tex("/assets/br/tex/red-brick-normal.jpg", 1, 1, false),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.85,
    vertexColors: true,
  });
  stationWallMat.userData.tileSpan = 1; // the texture covers one metre
  // DARK WET CONCRETE (Nov 2026 polish round): the garage floor read as
  // bright tan sand, where the references' floors are dark, wet and catch
  // the sodium lamps. The catalogue's stained concrete (3m) at a low
  // roughness, reflecting the station's own lamps (setStationEnvironment) —
  // scaled by the baked light (poolGloss), so a dead section's floor
  // doesn't shine. World-metre UVs, so the repeat is 1/3.
  stationFloorMat = new THREE.MeshStandardMaterial({
    map: tex("/assets/br/tex/stained-concrete-floor-color.jpg", 1 / 3, 1 / 3, true),
    normalMap: tex("/assets/br/tex/stained-concrete-floor-normal.jpg", 1 / 3, 1 / 3, false),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.38,
    envMapIntensity: 0.6,
    vertexColors: true,
  });
  poolGloss(stationFloorMat);
  // BARE CONCRETE OVERHEAD (Nov 2026 polish round): the rusted plates'
  // drip streaks, laid the same way on every 2m cell, ran unbroken across
  // each room and converged on the vanishing point like a radial smear —
  // and drips on a ceiling make no sense. The concrete the catalogue's
  // "concrete-ceiling" wears (no direction to it), as the catalogue tints it.
  stationCeilMat = new THREE.MeshStandardMaterial({
    map: tex("/assets/pipes/tex/concrete033-color.jpg", 1, 1, true),
    roughness: 1,
    color: 0xd6d0c2,
    vertexColors: true,
  });
  // THE STANDING WATER, REBUILT (Oct 2026 — Josh: "the water looks
  // terrible"; it was a flat sheet of solid blue paint in 2m squares). Water
  // first: near-black and glassy, rippled by the Poolrooms' scrolling normal
  // map, reflecting the station's own lamps (makeStationEnvironment) — and a
  // dark section's water barely reflects at all, its lamps being off. Its
  // edge where it meets dry floor is RAGGED (aShore + noise), so a puddle is a
  // puddle, not a rug. LIVE water carries the current as thin cold filaments
  // crawling over the surface, with the odd flash — a hazard you read by
  // watching it, rather than a blue floor you're told is dangerous.
  const wn = tex("/assets/pools/water_normal.jpg", 0.35, 0.35, false);
  const water = (live: boolean): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x06090b,
      roughness: 0.05,
      metalness: 0,
      normalMap: wn,
      normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: live ? 0.75 : 0.18,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = stationWaterTime;
      sh.uniforms.uFlash = stationWaterFlash;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aShore;\nvarying float vShore;\nvarying vec2 vWxz;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvShore = aShore;\nvWxz = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", STATION_WATER_COMMON)
        .replace("#include <emissivemap_fragment>", live ? STATION_WATER_CURRENT : "#include <emissivemap_fragment>")
        .replace("#include <opaque_fragment>", STATION_WATER_SHORE);
    };
    m.customProgramCacheKey = () => (live ? "stationWaterLive" : "stationWaterDead");
    return m;
  };
  stationWaterLive = water(true);
  stationWaterDead = water(false);
  if (stationEnv) setStationEnvironment(stationEnv);
}
const stationWaterTime = { value: 0 };
const stationWaterFlash = { value: 0 };
let stationEnv: THREE.Texture | null = null;
/** What the Station's water reflects: the dark, with the warm strips of its
 *  sodium lamps overhead — set by the game once. */
export function setStationEnvironment(env: THREE.Texture | null): void {
  stationEnv = env;
  if (!stationMatsBuilt) return;
  for (const m of [stationWaterLive, stationWaterDead, stationFloorMat]) {
    m.envMap = env;
    m.needsUpdate = true;
  }
}
export function makeStationEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const up = new THREE.Color(0.09, 0.085, 0.08);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    c.setRGB(0.03, 0.035, 0.04).lerp(up, Math.max(0, y));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const sphere = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  sc.add(sphere);
  // the lamps: a few warm strips overhead, and a cold one (a live panel)
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35a).multiplyScalar(2.2) });
  const coldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fb6ff).multiplyScalar(1.2) });
  const strip = new THREE.BoxGeometry(2.4, 0.15, 0.5);
  const spots: [number, number, THREE.Material][] = [[-4, -3, lampMat], [3, -5, lampMat], [5, 3, lampMat], [-2, 5, lampMat], [0, 0, lampMat], [-6, 1, coldMat]];
  for (const [x, z, m] of spots) {
    const b = new THREE.Mesh(strip, m);
    b.position.set(x, 6.5, z);
    b.rotation.y = (x + z) * 0.4;
    sc.add(b);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(sc, 0.03).texture;
  pm.dispose();
  geo.dispose();
  strip.dispose();
  (sphere.material as THREE.Material).dispose();
  lampMat.dispose();
  coldMat.dispose();
  return env;
}
/** Per section 1..SECTIONS: has power right now (the server's power frames).
 *  A dark section's lamps are drawn dead and its water dull; the game
 *  rebuilds the loaded chunks when this changes. */
const stationPowered: boolean[] = Array(SECTIONS + 1).fill(true);
/** Returns the sections whose power CHANGED (empty: nothing to redraw). */
export function setStationPower(powered: boolean[]): number[] {
  const changed: number[] = [];
  for (let k = 1; k <= SECTIONS; k++) {
    const v = powered[k] !== false;
    if (stationPowered[k] !== v) changed.push(k);
    stationPowered[k] = v;
  }
  return changed;
}
export const stationSectionPowered = (section: number): boolean => section <= 0 || stationPowered[section] !== false;
/** Per frame on Level 3: the live water hums — its glow wavers like a bad
 *  contact. One shared material, so every live puddle flickers together. */
export function tickStationWater(now: number): void {
  if (!stationWaterLive) return;
  stationWaterTime.value = (now / 1000) % 1000;
  if (stationWaterLive.normalMap) stationWaterLive.normalMap.offset.set(((now / 1000) * 0.011) % 1, ((now / 1000) * -0.007) % 1);
  // the odd flash, a bad contact: up at once, then down over a few frames
  stationWaterFlash.value = Math.random() < 0.012 ? 1 : stationWaterFlash.value * 0.82;
}

// ---- Level style ------------------------------------------------------------
// One switch, consulted by buildChunk and the environment: which world is the
// renderer dressing? Set from the welcome/travel frames before any chunk
// builds; travel tears every chunk down, so mixed-style chunks cannot occur.
export type LevelStyle = "carpet" | "pools" | "pipes" | "station" | "office" | "hotel" | "lights" | "ocean" | "cave" | "suburb";

// ---- THALASSOPHOBIA's SEA (Level 7) ------------------------------------------
// The Poolrooms' water machinery (one sheet per wet cell at the waterline)
// wearing a different sea: grey-green, nearly opaque, the deep reading
// through as dark. No caustics — there is no sun.
let oceanMatsBuilt = false;
let oceanWaterMat: THREE.MeshStandardMaterial;
function buildOceanMats(): void {
  if (oceanMatsBuilt) return;
  oceanMatsBuilt = true;
  const nrm = tex("/assets/pools/water_normal.jpg", 1, 1, false);
  oceanWaterMat = new THREE.MeshStandardMaterial({
    normalMap: nrm,
    normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0x3c4a4c,
    transparent: true,
    opacity: 0.86,
    roughness: 0.18,
    metalness: 0,
    depthWrite: false,
  });
}
/** Roll the sea: one slow drift (tickWater calls it). */
function tickOcean(t: number): void {
  if (!oceanMatsBuilt || !oceanWaterMat.normalMap) return;
  oceanWaterMat.normalMap.offset.set((t * -0.004) % 1, (t * 0.007) % 1);
}

// ---- THE SUBURBS' OWN SURFACES (Level 9) -------------------------------------
// Drawn, like the Pipe Dreams and Station sets: nothing in the catalogue is a
// lawn, a picket, a clapboard or a shingle. Every canvas is seeded, so every
// client paints the same street. The ground and the walls carry vertex colour
// (the baked light field); the roofs take only the night's light.
let suburbMatsBuilt = false;
export let suburbGrassMat: THREE.MeshStandardMaterial;
export let suburbPicketMat: THREE.MeshStandardMaterial;
export let suburbPrivacyMat: THREE.MeshStandardMaterial;
export let suburbSidingMats: THREE.MeshStandardMaterial[] = [];
export let suburbRoofMat: THREE.MeshStandardMaterial;
export let suburbPoleMat: THREE.MeshStandardMaterial;
/** A house window (subWall): painted frame, dark glass — no power, no light
 *  behind it. Both carry the baked light like the siding round them. */
let suburbWindowFrameMat: THREE.MeshStandardMaterial;
let suburbGlassMat: THREE.MeshStandardMaterial;
function suburbRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function suburbCanvasTex(cv: HTMLCanvasElement, ru: number, rv: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ru, rv);
  t.anisotropy = ANISO;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A lawn gone to seed: blades over a dark loam, a worn patch or two. */
function grassCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const g = cv.getContext("2d")!;
  const r = suburbRand(9001);
  g.fillStyle = "#2f3d22";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(${70 + r() * 30},${62 + r() * 20},${40 + r() * 15},0.35)`;
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, 30 + r() * 60, 20 + r() * 40, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const l = 4 + r() * 9;
    const tone = 0.6 + r() * 0.6;
    g.strokeStyle = `rgba(${Math.round(70 * tone)},${Math.round(104 * tone)},${Math.round(48 * tone)},0.8)`;
    g.lineWidth = 1 + r();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 4, y - l);
    g.stroke();
  }
  return cv;
}
/** Boards, side by side: a white picket (pointed tops are the model's job —
 *  this is the face) or a brown privacy fence. */
function fenceCanvas(base: [number, number, number], seed: number, gap: boolean): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  const r = suburbRand(seed);
  g.fillStyle = gap ? "#141414" : `rgb(${base[0] * 0.6},${base[1] * 0.6},${base[2] * 0.6})`;
  g.fillRect(0, 0, 256, 256);
  const boards = 8;
  const bw = 256 / boards;
  for (let b = 0; b < boards; b++) {
    const k = 0.84 + r() * 0.22;
    g.fillStyle = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
    const inset = gap ? bw * 0.22 : 1;
    g.fillRect(b * bw + inset, 0, bw - inset * 2, 256);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
      g.fillRect(b * bw + inset + r() * (bw - inset * 2), r() * 256, 1, 6 + r() * 30);
    }
  }
  // the two rails behind the boards show through a picket's gaps
  if (gap) {
    g.fillStyle = `rgb(${base[0] * 0.55},${base[1] * 0.55},${base[2] * 0.55})`;
    for (const y of [40, 200]) for (let b = 0; b < boards; b++) g.fillRect(b * bw, y, bw * 0.22, 14), g.fillRect(b * bw + bw * 0.78, y, bw * 0.22, 14);
  }
  return cv;
}
/** Clapboard siding: horizontal laps, each with its shadow line. */
function sidingCanvas(rgb: [number, number, number], seed: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  const r = suburbRand(seed);
  const laps = 12;
  const lh = 256 / laps;
  for (let l = 0; l < laps; l++) {
    const k = 0.9 + r() * 0.12;
    const grad = g.createLinearGradient(0, l * lh, 0, (l + 1) * lh);
    grad.addColorStop(0, `rgb(${Math.round(rgb[0] * k * 0.78)},${Math.round(rgb[1] * k * 0.78)},${Math.round(rgb[2] * k * 0.78)})`);
    grad.addColorStop(0.18, `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`);
    grad.addColorStop(1, `rgb(${Math.round(rgb[0] * k * 0.94)},${Math.round(rgb[1] * k * 0.94)},${Math.round(rgb[2] * k * 0.94)})`);
    g.fillStyle = grad;
    g.fillRect(0, l * lh, 256, lh);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, (l + 1) * lh - 2, 256, 2);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(40,40,30,${0.05 + r() * 0.1})`;
      g.fillRect(r() * 256, l * lh + r() * lh, 10 + r() * 50, 1);
    }
  }
  return cv;
}
/** Asphalt shingles, in courses, each tab a slightly different grey. */
function shingleCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  const r = suburbRand(4242);
  const rows = 8;
  const rh = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * 16;
    for (let x = -32; x < 256; x += 32) {
      const k = 40 + r() * 26;
      g.fillStyle = `rgb(${k},${k - 2},${k - 4})`;
      g.fillRect(x + off, row * rh, 31, rh - 2);
    }
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(0, (row + 1) * rh - 2, 256, 2);
  }
  return cv;
}
const SIDING_COLOURS: [number, number, number][] = [
  [214, 206, 182], // cream
  [176, 194, 204], // pale blue
  [168, 182, 156], // sage
  [196, 190, 186], // dove grey
  [204, 184, 160], // tan
];
function buildSuburbMats(): void {
  if (suburbMatsBuilt) return;
  suburbMatsBuilt = true;
  suburbGrassMat = new THREE.MeshStandardMaterial({ map: suburbCanvasTex(grassCanvas(), 0.5, 0.5), roughness: 0.95, vertexColors: true });
  suburbWindowFrameMat = new THREE.MeshStandardMaterial({ color: 0xc4bfb2, roughness: 0.6, vertexColors: true });
  suburbGlassMat = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.2, metalness: 0, vertexColors: true });
  // walls: UVs run PAPER_U_M × PAPER_V_M a unit (boxGeo), so a board is ~15cm
  suburbPicketMat = new THREE.MeshStandardMaterial({ map: suburbCanvasTex(fenceCanvas([226, 222, 210], 31, true), PAPER_U_M / 1.2, PAPER_V_M / 1.2), roughness: 0.8, vertexColors: true });
  suburbPrivacyMat = new THREE.MeshStandardMaterial({ map: suburbCanvasTex(fenceCanvas([118, 88, 62], 77, false), PAPER_U_M / 1.4, PAPER_V_M / 1.4), roughness: 0.9, vertexColors: true });
  suburbSidingMats = SIDING_COLOURS.map((c, i) => {
    const m = new THREE.MeshStandardMaterial({ map: suburbCanvasTex(sidingCanvas(c, 100 + i), PAPER_U_M / 2.4, PAPER_V_M / 2.4), roughness: 0.75, vertexColors: true });
    m.userData.levelHung = true;
    return m;
  });
  suburbRoofMat = new THREE.MeshStandardMaterial({ map: suburbCanvasTex(shingleCanvas(), 0.5, 0.5), roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
  suburbPoleMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0, vertexColors: true });
}
/** THE SUBURBS' ground and inner walls, by lot type: the road's wet asphalt,
 *  the pavement's stained concrete, a lawn, a house's carpet and paper, a
 *  garage's bare concrete. (A house's OUTER walls are its siding — the chunk
 *  builder decides that per edge.) */
export const SUBURB_LOOK: Readonly<Record<string, { wall: string; floor: string | null; ceil: string }>> = {
  manhole: { wall: "concrete-wall", floor: "wet-asphalt", ceil: "concrete-ceiling" },
  road: { wall: "concrete-wall", floor: "wet-asphalt", ceil: "concrete-ceiling" },
  sidewalk: { wall: "concrete-wall", floor: "stained-concrete-floor", ceil: "concrete-ceiling" },
  yard: { wall: "concrete-wall", floor: null, ceil: "concrete-ceiling" },
  park: { wall: "concrete-wall", floor: null, ceil: "concrete-ceiling" },
  // Number 9's whole lot is the porch type, front, sides and back, so its
  // floor is the lawn the other yards wear: hardwood decking to every fence
  // read as a room with no walls (Nov 2026 polish round). The deck in front
  // of the red door is dressing.
  porch: { wall: "concrete-wall", floor: null, ceil: "concrete-ceiling" },
  house: { wall: "paper-manila", floor: "carpet-stained", ceil: "concrete-ceiling" },
  garage: { wall: "concrete-wall", floor: "concrete-floor", ceil: "concrete-ceiling" },
};
const SUBURB_INDOOR_SET = new Set<string>(SUBURB_INDOOR_TYPES);
let moonLight: THREE.DirectionalLight | null = null;
let levelStyle: LevelStyle = "carpet";
export function setLevelStyle(s: LevelStyle): void {
  levelStyle = s;
  if (s === "pools") buildPoolMats();
  if (s === "pipes") buildPipeMats();
  if (s === "station") {
    buildStationMats();
    stationPowered.fill(true);
  }
  if (s === "office" || s === "hotel" || s === "lights") buildLookMats();
  // the Wet End's water is the Station's standing water (dead: unpowered)
  if (s === "lights") buildStationMats();
  // THE CAVE SYSTEM: the look picker's surfaces, and the Station's dead
  // standing water for the track bed and the river
  if (s === "cave") {
    buildLookMats();
    buildStationMats();
  }
  // THALASSOPHOBIA: the look picker's surfaces and its own grey sea
  if (s === "ocean") {
    buildLookMats();
    buildOceanMats();
  }
  // THE SUBURBS: the look picker's surfaces and its own lawns, fences and roofs
  if (s === "suburb") {
    buildLookMats();
    buildSuburbMats();
  }
}
export function getLevelStyle(): LevelStyle {
  return levelStyle;
}

/** Swap the scene's light/fog dressing between worlds. The Poolrooms are
 *  BRIGHT: white tile, pale cyan haze, warm skylight sun (one directional for
 *  water speculars + tile sheen — the baked field still does the local work).
 *  Restoring "carpet" reinstates the exact Level 0 values createScene set. */
let poolSun: THREE.DirectionalLight | null = null;
export function applyLevelEnvironment(scene: THREE.Scene, style: LevelStyle): void {
  const bg = scene.background as THREE.Color;
  const fog = scene.fog as THREE.Fog;
  if (moonLight && style !== "suburb") scene.remove(moonLight);
  if (style === "pools") {
    // Bright but not BLOWN: the reference look is warm skylight sun against
    // quiet dim corners — overexposure erases the tile grid at distance and
    // the whole room reads as white paper (first screenshot round).
    FOG_BASE.setHex(0xa9c4c2);
    hemiBase = 1.28;
    ambBase = 0.5;
    bg.setHex(0xa9c4c2);
    fog.color.setHex(0xa9c4c2);
    fog.near = 18;
    fog.far = 92;
    if (powerHemi) {
      powerHemi.color.setHex(0xf6fbf8);
      powerHemi.groundColor.setHex(0x8fb0ae);
      powerHemi.intensity = 1.28;
    }
    if (powerAmb) {
      powerAmb.color.setHex(0xe8f0ec);
      powerAmb.intensity = 0.5;
    }
    if (!poolSun) {
      poolSun = new THREE.DirectionalLight(0xffe9c4, 0.7);
      poolSun.position.set(18, 40, 9);
    }
    scene.add(poolSun);
  } else if (style === "station") {
    // THE STATION: SODIUM. Warm orange pools at the caged lamps over brick,
    // a brown murk between (Oct 2026 — the reference set is unanimous on it;
    // the first cut was cold fluorescent white-blue and read as a clinic).
    // LIT where it has power (brighter than Pipe Dreams, on purpose): the
    // level is the contrast between a live section and one that has gone
    // black, so a powered room must read as lit.
    FOG_BASE.setHex(0x0e0a07);
    hemiBase = 1.9;
    ambBase = 0.58;
    bg.setHex(0x0e0a07);
    fog.color.setHex(0x0e0a07);
    fog.near = 10;
    fog.far = 52;
    if (powerHemi) {
      powerHemi.color.setHex(0xffe4bc);
      powerHemi.groundColor.setHex(0x2e2218);
    }
    if (powerAmb) powerAmb.color.setHex(0xe2d4bc);
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  } else if (style === "hotel") {
    // THE TERROR HOTEL: warm and failing. Amber light pooled under the
    // chandeliers and sconces, a brown dark between them; below stairs the
    // furnaces are most of the light there is.
    FOG_BASE.setHex(0x150e09);
    hemiBase = 1.1;
    ambBase = 0.32;
    bg.setHex(0x150e09);
    fog.color.setHex(0x150e09);
    fog.near = 8;
    fog.far = 52;
    if (powerHemi) {
      powerHemi.color.setHex(0xffdcb0);
      powerHemi.groundColor.setHex(0x3a2418);
    }
    if (powerAmb) powerAmb.color.setHex(0xe8cfb0);
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  } else if (style === "ocean") {
    // THALASSOPHOBIA: an overcast day over open water. Grey everywhere, the
    // fog a wall at the edge of sight and a lid at forty metres up (the
    // buildings go into it); bright enough to see across a street, never a
    // sun to cast a shadow.
    FOG_BASE.setHex(0x7f8a8e);
    hemiBase = 1.1;
    ambBase = 0.42;
    bg.setHex(0x7f8a8e);
    fog.color.setHex(0x7f8a8e);
    fog.near = 14;
    fog.far = 95;
    if (powerHemi) {
      powerHemi.color.setHex(0xdfe5e8);
      powerHemi.groundColor.setHex(0x2c3638);
      powerHemi.intensity = 1.1;
    }
    if (powerAmb) {
      powerAmb.color.setHex(0xc8d0d2);
      powerAmb.intensity = 0.42;
    }
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  } else if (style === "suburb") {
    // THE SUBURBS: a clear night over an empty street. Navy, not black — you
    // can make out the next house and the shape of a man under the trees —
    // and a low moon that lights the roofs and nothing else; the streetlights
    // do the rest, in pools.
    FOG_BASE.setHex(0x0b1020);
    hemiBase = 0.62;
    ambBase = 0.16;
    bg.setHex(0x0b1020);
    fog.color.setHex(0x0b1020);
    fog.near = 8;
    fog.far = 64;
    if (powerHemi) {
      powerHemi.color.setHex(0xa8b6d6);
      powerHemi.groundColor.setHex(0x12161c);
      powerHemi.intensity = 0.62;
    }
    if (powerAmb) {
      powerAmb.color.setHex(0x99a4c0);
      powerAmb.intensity = 0.16;
    }
    if (poolSun) scene.remove(poolSun);
    if (!moonLight) {
      moonLight = new THREE.DirectionalLight(0x9fb2d8, 0.32);
      moonLight.position.set(-30, 45, -20);
    }
    scene.add(moonLight);
    setPowerLevel(1);
  } else if (style === "cave") {
    // THE CAVE SYSTEM: near-black and a little warm (its references' game
    // screenshots read (23, 22, 18) at luminance 22 — REFERENCES.md → Level
    // 8). The survey team's work lamps light pools in the caverns; between
    // them, and everywhere in the Deep, it is your torch or nothing.
    FOG_BASE.setHex(0x060504);
    hemiBase = 0.28;
    ambBase = 0.07;
    bg.setHex(0x060504);
    fog.color.setHex(0x060504);
    fog.near = 4;
    fog.far = 30;
    if (powerHemi) {
      powerHemi.color.setHex(0xd8ccb8);
      powerHemi.groundColor.setHex(0x141210);
    }
    if (powerAmb) powerAmb.color.setHex(0xc8bca8);
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  } else if (style === "lights") {
    // LIGHTS OUT: no light but the one you carry. A near-black neutral grey
    // (the references: (14, 14, 14), luminance 14 — the darkest set by far),
    // an ambient just above nothing, and fog that closes in at twenty metres:
    // the beam ends where the dark begins.
    FOG_BASE.setHex(0x020202);
    // Next to no ambient at all: the walls are darkened by their baked light
    // (LIGHTS_BASE_LIT), but kit props, the sea hatch and the Listener carry
    // none, so at 0.22 / 0.05 they took ~28× the walls' light and stood out
    // of the black as pale shapes — the hatch you find by ear, the creature
    // only ever seen in a beam (Nov 2026 polish round). The torch does the rest.
    hemiBase = 0.012;
    ambBase = 0.003;
    bg.setHex(0x020202);
    fog.color.setHex(0x020202);
    fog.near = 3;
    fog.far = 21;
    if (powerHemi) {
      powerHemi.color.setHex(0xc8ccd0);
      powerHemi.groundColor.setHex(0x101112);
    }
    if (powerAmb) powerAmb.color.setHex(0xb8bcc0);
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  } else if (style === "office") {
    // THE ABANDONED OFFICE: a neutral-warm grey, DIM (its 20 references read
    // (57, 52, 48) at luminance 53 — REFERENCES.md → Level 4). Most of the
    // troffers are dead, so the floor is lit in pools and the dark between
    // them is grey, not black: a carpeted floor you can still make out, which
    // is what lets you see the Temp standing in it.
    FOG_BASE.setHex(0x1b1917);
    hemiBase = 1.2;
    ambBase = 0.36;
    bg.setHex(0x1b1917);
    fog.color.setHex(0x1b1917);
    fog.near = 9;
    fog.far = 58;
    if (powerHemi) {
      powerHemi.color.setHex(0xe9e6de);
      powerHemi.groundColor.setHex(0x3a3631);
    }
    if (powerAmb) powerAmb.color.setHex(0xd8d3c8);
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  } else if (style === "pipes") {
    // DARK (Josh: "pipe dream should be dark"). Near-black warm murk close
    // in; the ambient is low enough that a dead stretch of tunnel is black
    // and the flashlight is the light — the baked bulbs do the rest.
    FOG_BASE.setHex(0x050403);
    hemiBase = 1.05;
    ambBase = 0.3;
    bg.setHex(0x050403);
    fog.color.setHex(0x050403);
    fog.near = 6;
    fog.far = 38;
    if (powerHemi) {
      powerHemi.color.setHex(0xffd9a8);
      powerHemi.groundColor.setHex(0x1a140e);
    }
    if (powerAmb) powerAmb.color.setHex(0xd8c8b0);
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  } else {
    FOG_BASE.setHex(FOG_COLOR);
    hemiBase = LOBBY_HEMI;
    ambBase = LOBBY_AMB;
    bg.setHex(FOG_COLOR);
    fog.color.setHex(FOG_COLOR);
    fog.near = 14;
    fog.far = 78;
    if (powerHemi) {
      powerHemi.color.setHex(0xf0ecd0);
      powerHemi.groundColor.setHex(0x54503f);
      powerHemi.intensity = 1.45;
    }
    if (powerAmb) {
      powerAmb.color.setHex(0xeae4c8);
      powerAmb.intensity = 0.54;
    }
    if (poolSun) scene.remove(poolSun);
    setPowerLevel(1);
  }
}

// A handful of panels flicker — deterministic per position (same panels
// stutter for everyone, forever; they become landmarks of their own).
export interface FlickerPanel {
  mat: THREE.MeshBasicMaterial;
  /** The panel's own light quads (floor pool + ceiling glow) — a dark panel
   *  takes its light with it. */
  pools: { mat: THREE.MeshBasicMaterial; base: number }[];
  phase: number;
  nextAt: number;
  dark: boolean;
  /** World position, so the entity's fixture-flicker tell can find it. */
  px: number;
  pz: number;
}
const flickerHash = (gx: number, gy: number): number =>
  (((gx * 73856093) ^ (gy * 19349663)) >>> 0) % 1000;

/** Out of 1000: how many BLOCKS of wall wear baseboard trim. Josh, round 3 —
 *  at 450 per segment it was on nearly every wall; trim should be something you
 *  notice. Selection is per BLOCK of BASEBOARD_BLOCK segments, so the runs that
 *  do exist are long ones rather than 2m stubs scattered everywhere. */
const BASEBOARD_RATE = 85;
const BASEBOARD_BLOCK = 5; // up to 10m of continuous trim per selected block

// ---- Brownouts (July 2026, the dynamic half of the lighting pass) ----------
// The server calls blackouts; this is the one dial the client turns. Power
// level 1 = business as usual, 0 = the sector sags to nothing: panels die to
// a filament glow, the ambient base drops, and the FOG GLOW dies with them —
// the horizon murk is light scattered by fixtures, so when the fixtures sag
// the distance must go black-brown too, or the world reads lit from nowhere.
// The flutter envelope (dying stutters, the re-strike) lives in the game's
// frame loop; this just applies a level. Never full black: 0 still leaves a
// dim ember floor so the game stays technically playable mid-event.
let powerHemi: THREE.HemisphereLight | null = null;
let powerAmb: THREE.AmbientLight | null = null;
let powerFog: THREE.Fog | null = null;
let powerBg: THREE.Color | null = null;
let panelScale = 1; // tickFlickers multiplies its restored color by this
/** The CURRENT level's full-power dressing. The power dial (brownouts, the
 *  entity's flicker) scales these — it used to scale Level 0's constants,
 *  so every call repainted the fog olive and lifted the ambient back to the
 *  office's, which is how Pipe Dreams ran in Level 0's haze for its first
 *  day (found 2026-09-27: its near-black fog read 4d452b in the browser).
 *  applyLevelEnvironment sets them; setPowerLevel only ever multiplies. */
const FOG_BASE = new THREE.Color(FOG_COLOR);
/** LEVEL 0's room light (Oct 2026, law 8's reference task): the set of 20
 *  measured luminance 126 against our 89 — the same hue, a quarter darker.
 *  The ROOM is lifted here; the panels' bloom, which an earlier round dimmed
 *  because the fixtures glared, is untouched. */
/** The Station's light over brick (lum in buildChunk): the base a POWERED
 *  section has everywhere, and its lamps' pools. */
/** Galvanized steel: the conduit the Station runs along its walls. */
const STATION_CONDUIT_MAT = new THREE.MeshStandardMaterial({ color: 0xb4b8bb, roughness: 0.45, metalness: 0.25 });
const STATION_BASE_LIT = 0.6;
/** THE OFFICE's light (lum in buildChunk): a dim grey floor everywhere, a
 *  pool of light under every working troffer. */
const OFFICE_BASE_LIT = 0.3;
/** LIGHTS OUT's light: barely any. Every fixture is dead (they light
 *  nothing); the walls are seen by the torch. */
const LIGHTS_BASE_LIT = 0.035;
/** THALASSOPHOBIA's light: an overcast day, even everywhere — the tower's
 *  bulkheads add a little under each. */
const OCEAN_BASE_LIT = 0.82;
/** The tower's ceiling, lifted against the near-black hemisphere ground (pushCeil). */
const OCEAN_CEIL_LIFT = 4.5;
/** THE CAVE SYSTEM's light: barely any between lamps; a pool under each of
 *  the survey team's work lamps and the Station's few live fixtures. */
const CAVE_BASE_LIT = 0.04;
/** THE STATION between its fixtures (Nov 2026): at the caves' 0.04 the
 *  platform read black between lamps and its edge was lost. A dead subway
 *  still holds some light; the caverns and the Deep keep the near-black. */
const CAVE_STATION_LIT = 0.13;
const CAVE_STATION_SET = new Set<string>(["subwaystair", "platform", "trackbed", "concourse"]);
/** THE SUBURBS' light: a moonlit street you can see across, the dark inside
 *  an empty house, a pool under every lit streetlight and porch light. */
const SUBURB_OUT_LIT = 0.17;
const SUBURB_IN_LIT = 0.05;
const SUBURB_LAMP_GAIN = 2.4;
const CAVE_LAMP_GAIN = 2.6;
/** THE HOTEL's light: a dim warm floor above stairs, near-black below
 *  (the furnaces' glow is drawn by the game), pools under every fixture. */
const HOTEL_BASE_LIT = 0.3;
const HOTEL_HOT_BASE = 0.2;
const HOTEL_LAMP_GAIN = 2.1;
const OFFICE_LAMP_GAIN = 2.0;
/** A DEAD troffer (the office): the fixture still hangs there — its diffuser
 *  is just grey plastic now, lit only by what reaches it. */
const DEAD_PANEL_MAT = new THREE.MeshStandardMaterial({ color: 0x55534e, roughness: 0.9 });
const STATION_LAMP_GAIN = 3.4;
/** Pipe Dreams' lamp pools (lum in buildChunk). */
const PIPE_LAMP_GAIN = 3.2;
const LOBBY_HEMI = 1.45 * 1.75;
const LOBBY_AMB = 0.54 * 1.75;
let hemiBase = LOBBY_HEMI;
let ambBase = LOBBY_AMB;
export function setPowerLevel(f: number): void {
  const k = Math.max(0, Math.min(1, f));
  // Floors tuned against the OutputPass sRGB transform: linear 0.29 still
  // DISPLAYS at ~57% brightness (the first cut looked like a cloudy day,
  // not a power failure) — so the dark end sits much lower in linear terms
  // than instinct suggests. At k=0 the ambient lands ~7% linear ≈ 26%
  // displayed: a room you can still move through, barely.
  // Floors dropped again for the BLACKOUT phase (July 2026): k=0 must be
  // genuinely flashlight-dark (~12% displayed), not the old navigable 26%.
  const lightK = 0.015 + 0.985 * k;
  if (powerHemi) powerHemi.intensity = hemiBase * lightK;
  if (powerAmb) powerAmb.intensity = ambBase * lightK;
  panelScale = 0.004 + 0.996 * k;
  panelMat.color.setHex(PANEL_COLOR).multiplyScalar(panelScale);
  officePanelMat?.color.setHex(PANEL_COLOR).multiplyScalar(panelScale);
  const fogK = 0.03 + 0.97 * k;
  if (powerFog) powerFog.color.copy(FOG_BASE).multiplyScalar(fogK);
  if (powerBg) powerBg.copy(FOG_BASE).multiplyScalar(fogK);
}

export function createScene(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  // Fog range pushed out (Josh, July 2026: "increase the fog distance a little
  // more so players can see more of the big rooms"). The near plane moves out
  // with the far one so close walls stay crisp instead of hazing at arm's
  // length — an atrium is 7.6m tall and tens of metres across, and at the old
  // 44m you could stand in one without ever seeing the far side. The dread
  // still comes from not knowing what's PAST the murk, not from a short throw.
  scene.fog = new THREE.Fog(FOG_COLOR, 14, 78);
  // Dim base — the light is BAKED: pool quads on the carpet, glow quads on
  // the ceiling, per-vertex light on the walls, all tied to real fixtures.
  // NOTHING is positional/dynamic (Josh: panels visibly lit up as you
  // approached the roving-PointLight version — never again). Lit areas read
  // comfortably; darkness belongs only to zones WITHOUT fixtures.
  const hemi = new THREE.HemisphereLight(0xf0ecd0, 0x54503f, 1.45);
  const amb = new THREE.AmbientLight(0xeae4c8, 0.54);
  scene.add(hemi);
  scene.add(amb);
  // Hand the power dial its handles (brownouts — see setPowerLevel above),
  // and reset to full power: scene re-creation must never inherit a dim
  // state from a run that ended mid-blackout.
  powerHemi = hemi;
  powerAmb = amb;
  powerFog = scene.fog as THREE.Fog | null;
  powerBg = scene.background as THREE.Color;
  setPowerLevel(1);
  // Near plane stays SMALL. Hiding the player's own head is done by cutting
  // the mask's faces out of the viewmodel mesh (see NECK_CUT in makeViewmodel),
  // not by clipping — a near plane big enough to eat a mask 6cm away also eats
  // the chest, and the bench showed exactly that: an empty frame.
  // FAR stops just past the thickest fog any level wears (the Poolrooms', 92):
  // beyond it every pixel is fog colour anyway, so drawing it is wasted work.
  const camera = new THREE.PerspectiveCamera(72, 1, 0.06, 96);
  // THE CAMERA MUST BE IN THE SCENE. The renderer draws by walking the scene
  // graph, so a camera that is not a child of the scene is never visited — and
  // neither is anything parented to it. Without this line the first-person body
  // (world.ts makeViewmodel, attached to the camera so it rides the view for
  // free) renders NOTHING, which is exactly what Josh saw: no arms, no feet, no
  // held item, no error. The camera itself draws nothing, so this is free.
  scene.add(camera);
  camera.rotation.order = "YXZ";
  return { scene, camera };
}

/** Everything the collision + rendering needs from received chunks. */
export class WorldIndex {
  chunkSize: number;
  chunks = new Map<string, ChunkData>();
  meshes = new Map<string, THREE.Group>();
  /** Panels that stutter — keyed by chunk so pruning drops theirs. */
  flickers = new Map<string, FlickerPanel[]>();
  /** Per-chunk panel InstancedMesh + world positions — the entity's
   *  fixture-flicker tell reads these (tickEntityFlicker). */
  panelFlick = new Map<string, { mesh: THREE.InstancedMesh; pos: [number, number][]; touched: boolean }>();
  /** Spray-mark groups per chunk — pruned with the chunk. */
  markGroups = new Map<string, THREE.Group>();
  /** district id → type (from the welcome frame) — picks wallpaper variants. */
  districtTypes = new Map<number, string>();
  /** sector size in cells (from the welcome frame) — perimeter closure. */
  mapSize = 256;

  constructor(chunkSize: number) {
    this.chunkSize = chunkSize;
  }

  key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  cellLookup(x: number, y: number): { chunk: ChunkData; i: number } | null {
    if (x < 0 || y < 0) return null;
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const chunk = this.chunks.get(this.key(cx, cy));
    if (!chunk) return null;
    const lx = x - cx * this.chunkSize;
    const ly = y - cy * this.chunkSize;
    return { chunk, i: ly * this.chunkSize + lx };
  }

  /** The room STYLE a cell wears (the map editor's Look / Lights / Sound),
   *  or null for the room's usual (and when unloaded). */
  styleAt(x: number, y: number): LookSpec | null {
    const c = this.cellLookup(x, y);
    if (!c?.chunk.look || !c.chunk.styles) return null;
    const v = c.chunk.look[c.i];
    return v ? (c.chunk.styles[v] ?? null) : null;
  }

  /** The district TYPE of a cell ("" when unloaded). */
  typeAt(x: number, y: number): string {
    const c = this.cellLookup(x, y);
    return c ? (this.districtTypes.get(c.chunk.district[c.i]) ?? "") : "";
  }

  /** Ceiling ELEVATION of a cell, metres (its floor plus its room's height). */
  ceilAt(x: number, y: number): number {
    return this.floorAt(x, y) + this.cellHeightAt(x, y);
  }

  /** Is this cell's roof lower than a standing body (the Cave System's
   *  crawlspaces)? The controller won't let you walk in standing. */
  lowAt(x: number, y: number): boolean {
    return this.cellHeightAt(x, y) < STAND_CLEAR;
  }

  /** Ceiling height of a cell (from its district's type; 3m if unknown). */
  cellHeightAt(x: number, y: number): number {
    const c = this.cellLookup(x, y);
    if (!c) return WALL_H;
    const t = this.districtTypes.get(c.chunk.district[c.i]) ?? "classic";
    const f = this.floorAt(x, y);
    return ceilingOf(t, f, lidMetres(c.chunk.lid?.[c.i], FLOOR_STEP)) - f;
  }

  // ---- VERTICALITY (v2) ----------------------------------------------------
  // Floor heights arrive per cell, in steps of FLOOR_STEP metres. Three
  // questions get asked constantly, so they live here:
  //   floorAt      — the cell's own height, in METRES.
  //   groundAt     — the smooth height under a POSITION (bilinear over the
  //                  corner heights), which is what the camera rides so a ramp
  //                  feels like a slope instead of a staircase.
  //   cornerFor    — a corner's height AS ONE CELL SEES IT, averaged over the
  //                  cells it can actually walk to. Cliffs therefore give each
  //                  side its own flat height instead of bending one into the
  //                  other.

  /** Floor height of a cell in STEPS (0 when unknown/unloaded). */
  floorStepsAt(x: number, y: number): number {
    const c = this.cellLookup(x, y);
    return c ? (c.chunk.floor?.[c.i] ?? 0) : 0;
  }

  /** Floor height of a cell in METRES. */
  floorAt(x: number, y: number): number {
    return this.floorStepsAt(x, y) * FLOOR_STEP;
  }

  /** Water SURFACE height (metres) over a cell, or null when dry — the
   *  Poolrooms only. Movement wades (slower) when the feet sit below this. */
  waterAt(x: number, y: number): number | null {
    const c = this.cellLookup(x, y);
    const w = c?.chunk.water?.[c.i];
    if (w === undefined || w <= -128) return null;
    return w * FLOOR_STEP;
  }

  /** EFFECTIVE floor in STEPS for the climb rule: a swimmer floats at the
   *  surface, so deep water counts as the water table, not the pool bottom.
   *  Exactly the server's `effAt` — the climb-rule triple stays in step. */
  effStepsAt(x: number, y: number): number {
    const c = this.cellLookup(x, y);
    if (!c) return 0;
    const f = c.chunk.floor?.[c.i] ?? 0;
    const w = c.chunk.water?.[c.i];
    if (w !== undefined && w > -128 && w > f) return w;
    return f;
  }

  /** Water depth (metres) over a cell — 0 when dry. */
  waterDepthAt(x: number, y: number): number {
    const c = this.cellLookup(x, y);
    if (!c) return 0;
    const w = c.chunk.water?.[c.i];
    if (w === undefined || w <= -128) return 0;
    return Math.max(0, (w - (c.chunk.floor?.[c.i] ?? 0)) * FLOOR_STEP);
  }

  /** Do we actually HAVE this cell? (Unloaded chunks read as zeros, which a
   *  caller must never mistake for "dry" or "floor level".) */
  hasCell(x: number, y: number): boolean {
    return this.cellLookup(x, y) !== null;
  }

  /** Deco code at a cell (kind*16+variant; 0 = none). */
  decoAt(x: number, y: number): number {
    const c = this.cellLookup(x, y);
    return c ? (c.chunk.deco?.[c.i] ?? 0) : 0;
  }

  /** THE ELECTRICAL STATION: the power circuit a cell is on (1..6; 0 none). */
  sectionAt(x: number, y: number): number {
    const c = this.cellLookup(x, y);
    return c ? (c.chunk.section?.[c.i] ?? 0) : 0;
  }

  /** Scenery: floor drawn but never entered. The old generated kind was
   *  REMOVED in July 2026 (it left holes you could see through); since Oct
   *  2026 it is floor a room DESIGN put where no door reaches (tiles.ts
   *  scenery — a sunken pit, a room behind glass), enclosed by the design's
   *  own walls and ledges. Collision treats it as stone, like the server. */
  backgroundAt(x: number, y: number): boolean {
    const c = this.cellLookup(x, y);
    return c ? (c.chunk.background?.[c.i] ?? 0) === 1 : false;
  }

  /** Height of a corner AS SEEN BY ONE CELL, in metres.
   *
   *  A shared corner can't hold one value when a cliff meets it, and pretending
   *  otherwise is what broke Level 0 twice over. The old version returned the
   *  HIGHEST cell's height at any cliff corner, which quietly dragged the floor
   *  of the low cell UP toward the cliff top: carpet curved into walls and up
   *  cliff faces (Josh's "rough angles"), the camera rode that phantom slope
   *  and pushed the player's head through the ceiling, and — worst — the ramp
   *  it drew was a LIE, because the climb rule still refused the +2 step, so
   *  players were blocked by ground that visibly sloped away in front of them.
   *
   *  So the corner is resolved PER CELL. The (up to) four cells meeting here
   *  are grouped into connected clusters, two cells being connected when their
   *  floors are within one step — the same climb rule the world is built on —
   *  and the answer is the average over the asking cell's own cluster.
   *  Cells that can walk to each other therefore share every corner exactly
   *  (seamless ramps, no cracks), while a cliff gives each side its own flat
   *  height and the riser closes the gap. */
  cornerFor(cellX: number, cellY: number, vx: number, vy: number): number {
    const cells: { x: number; y: number; h: number }[] = [];
    for (const [cx, cy] of [
      [vx - 1, vy - 1],
      [vx, vy - 1],
      [vx - 1, vy],
      [vx, vy],
    ] as [number, number][]) {
      const c = this.cellLookup(cx, cy);
      // Solid rock and sealed scenery have no floor worth averaging.
      if (!c || c.chunk.solid[c.i] || (c.chunk.background?.[c.i] ?? 0) === 1) continue;
      cells.push({ x: cx, y: cy, h: this.stairCornerSteps(c, cx, cy, vx, vy) });
    }
    const self = cells.findIndex((c) => c.x === cellX && c.y === cellY);
    if (self < 0) return this.floorStepsAt(cellX, cellY) * FLOOR_STEP;
    return cornerHeight(cells.map((c) => c.h), self) * FLOOR_STEP;
  }

  /** A cell's floor AT ONE OF ITS CORNERS, in steps. For an ordinary cell,
   *  its floor. For a STAIR (stairs.ts) the flight's two ends sit exactly on
   *  the floors they join: the corners on its UP edge are one step higher than
   *  the ones on its foot. That is what keeps the floor above and the floor
   *  below a stair FLAT (they used to share an averaged corner with it and tip
   *  towards it), and what makes the ground you walk on follow the steps. */
  stairCornerSteps(c: { chunk: ChunkData; i: number }, cx: number, cy: number, vx: number, vy: number): number {
    const f = c.chunk.floor?.[c.i] ?? 0;
    const side = c.chunk.stair?.[c.i] ?? -1;
    if (side < 0) return f;
    const onUp = side === 0 ? vy === cy : side === 1 ? vx === cx + 1 : side === 2 ? vy === cy + 1 : vx === cx;
    return onUp ? f + 1 : f;
  }

  /** The ground height under a continuous position, in metres. Bilinear over
   *  the four corners of the cell you're standing in, as THAT cell sees them —
   *  so the camera rides its own floor and never gets lifted by a neighbouring
   *  cliff it isn't allowed to climb. */
  groundAt(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const fx = x - cx;
    const fy = y - cy;
    const h00 = this.cornerFor(cx, cy, cx, cy);
    const h10 = this.cornerFor(cx, cy, cx + 1, cy);
    const h01 = this.cornerFor(cx, cy, cx, cy + 1);
    const h11 = this.cornerFor(cx, cy, cx + 1, cy + 1);
    return (
      h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy
    );
  }

  /** Unloaded space is treated as WALLED — you can't walk off the known map. */
  wallNAt(x: number, y: number): boolean {
    const c = this.cellLookup(x, y);
    return c ? c.chunk.wallN[c.i] === 1 : true;
  }
  wallWAt(x: number, y: number): boolean {
    const c = this.cellLookup(x, y);
    return c ? c.chunk.wallW[c.i] === 1 : true;
  }
  solidAt(x: number, y: number): boolean {
    const c = this.cellLookup(x, y);
    if (!c) return true;
    // Scenery is gone from the generator (always 0); the check stays as a
    // guard so it could never be walked into if it ever came back.
    return c.chunk.solid[c.i] === 1 || (c.chunk.background?.[c.i] ?? 0) === 1;
  }

  /** FURNITURE COLLIDERS within a cell of a position (July 2026: props are
   *  solid — you walk around the desk, not through it). Props live on their
   *  chunk, so this samples the up-to-four chunks a nearby prop could belong
   *  to; a chunk holds a handful at most, so the scan is trivial. */
  /** Solid things that aren't cells: furniture, and the Poolrooms' kit
   *  MASONRY — arch legs and bridge railings (Josh: "you can walk through
   *  the arches / through the guard rails"). Extents are per-axis so a
   *  railing can be a long thin barrier instead of a square post; server
   *  props carry one radius and read as squares. */
  propsNear(x: number, y: number): { x: number; y: number; rx: number; ry: number }[] {
    const out: { x: number; y: number; rx: number; ry: number }[] = [];
    const seen = new Set<string>();
    // ±4 cells: a kit prop's box reaches up to ~3.2 cells from its centre
    // (a shipping container), so it can stand in the NEXT chunk and still be
    // in the way
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as [number, number][]) {
      const cx = Math.floor((x + dx) / this.chunkSize);
      const cy = Math.floor((y + dy) / this.chunkSize);
      const k = this.key(cx, cy);
      if (seen.has(k)) continue;
      seen.add(k);
      const props = this.chunks.get(k)?.props;
      if (!props) continue;
      for (const p of props) {
        const rx = p.rx ?? p.r ?? 0;
        const ry = p.ry ?? p.r ?? 0;
        if (!rx || !ry) continue;
        if (Math.abs(p.x - x) < rx + 1.2 && Math.abs(p.y - y) < ry + 1.2) out.push({ x: p.x, y: p.y, rx, ry });
      }
    }
    return out;
  }
}

/** Build the chunk's meshes and add them to the scene. `rebuild` tears down
 *  an existing build first (used when a neighbor's arrival changes
 *  cross-chunk wall heights). */
export function buildChunk(world: WorldIndex, scene: THREE.Scene, data: ChunkData, rebuild = false): void {
  const k = world.key(data.cx, data.cy);
  if (world.meshes.has(k)) {
    if (!rebuild) return;
    const old = world.meshes.get(k)!;
    scene.remove(old);
    old.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
        // Kit pieces SHARE their decoded geometry across every chunk —
        // disposing one chunk's instances must never gut the others'.
        if (!o.name.startsWith("kit:")) o.geometry.dispose();
        // an instanced prop's buffers are this chunk's own (Nov 2026 polish round)
        if (o.userData.instProp) (o as THREE.InstancedMesh).dispose();
        // Flicker panels clone panelMat — free the clone (never the shared
        // material or its texture) or every rebuild leaks one.
        const m = o.material as THREE.MeshBasicMaterial;
        if (isPanelClone(m)) m.dispose();
      }
    });
    world.meshes.delete(k);
    world.flickers.delete(k);
    world.panelFlick.delete(k);
  }
  // KIT MASONRY IS SOLID (Josh: "you can walk through the arches / the
  // guard rails"). The deco layer is visual, so the colliders are
  // synthesized here — per-axis boxes at the arch LEGS and along both
  // railings of a bridge deck. Done once per chunk, before it's stored, so
  // propsNear picks them up like any other prop. Openings stay walkable:
  // the legs sit at the span's ends, leaving the archway itself clear.
  // The chunk has to be REGISTERED before the collider pass: archFits asks
  // the world index about cells in this very chunk, and an unregistered
  // chunk answers "solid" for all of them.
  world.chunks.set(k, data);
  if (levelStyle === "pools" && data.deco) {
    const extra: NonNullable<ChunkData["props"]> = [];
    const n0 = data.size;
    for (let y = 0; y < n0; y++) {
      for (let x = 0; x < n0; x++) {
        const code = data.deco[y * n0 + x];
        if (!code) continue;
        const kind = code >> 4;
        const variant = code & 15;
        const gx = data.cx * n0 + x + 0.5;
        const gy = data.cy * n0 + y + 0.5;
        if (kind === 2) {
          // Arch legs: ±1.2 cells along the span, a slim pier each.
          const spanX = variant !== 1;
          if (!archBelongs(world, data.cx * n0 + x, data.cy * n0 + y, spanX)) continue;
          for (const s of [-1.2, 1.2]) {
            extra.push({
              x: spanX ? gx + s : gx,
              y: spanX ? gy : gy + s,
              kind: "archleg",
              rot: 0,
              rx: spanX ? 0.17 : 0.22,
              ry: spanX ? 0.22 : 0.17,
            });
          }
        } else if (kind === 5) {
          // Bridge railings: a barrier down each side of the deck cell.
          const alongY = variant === 1;
          for (const s of [-0.46, 0.46]) {
            extra.push({
              x: alongY ? gx + s : gx,
              y: alongY ? gy : gy + s,
              kind: "railing",
              rot: 0,
              rx: alongY ? 0.06 : 0.5,
              ry: alongY ? 0.5 : 0.06,
            });
          }
        }
      }
    }
    if (extra.length) data.props = [...(data.props ?? []), ...extra];
  }

  const group = new THREE.Group();
  const n = data.size;
  const ox = data.cx * n * CELL;
  const oz = data.cy * n * CELL;

  // Which wallpaper does this chunk wear? Its dominant district decides.
  const districtCount = new Map<number, number>();
  for (const id of data.district) districtCount.set(id, (districtCount.get(id) ?? 0) + 1);
  let domId = 0;
  let domN = -1;
  for (const [id, count] of districtCount) {
    if (count > domN) {
      domN = count;
      domId = id;
    }
  }
  // Offices + warrens keep their signature papers; the generic districts
  // (classic/halls/pillars) each roll one of all three by district id, so
  // crossing a district line often means new wallpaper (Josh: mix the pack
  // up — one paper across most of the map was monotonous).
  const pools = levelStyle === "pools";
  const pipes = levelStyle === "pipes";
  const station = levelStyle === "station";
  /** THE ABANDONED OFFICE: Level 0's drop ceiling and troffers, but its lamps
   *  are its own deco (ODECO.lamp: v0 working, v1 dead, v2 flickering) and
   *  its walls and floor are its own photographs. */
  const office = levelStyle === "office";
  /** THE TERROR HOTEL: every room type its own surfaces (HOTEL_LOOK), its
   *  chandeliers and sconces its own deco (HDECO), drawn as kit fixtures. */
  const hotel = levelStyle === "hotel";
  /** LIGHTS OUT: every room type its own concrete (LIGHTS_LOOK), every
   *  fixture dead (LDECO), the Wet End under water. */
  const lights = levelStyle === "lights";
  /** THALASSOPHOBIA: every block type its own surfaces (OCEAN_LOOK), the sea
   *  over every wet cell, and no ceiling over the open air. */
  const ocean = levelStyle === "ocean";
  /** THE CAVE SYSTEM: every room type its own surfaces (CAVE_LOOK), its lamps
   *  its own deco (CDECO: v0 a lit work lamp, v1 dead, v2 flickering), the
   *  track bed and the river under water. */
  const cave = levelStyle === "cave";
  /** THE SUBURBS: lawns, streets and houses; no ceiling outdoors, fences and
   *  siding instead of walls to the sky, a roof on every house, streetlights. */
  const suburb = levelStyle === "suburb";
  if (suburb) buildSuburbMats();
  /** The two dark industrial levels share the baked-lamp light model. */
  const dark = pipes || station;
  const carpet = !pools && !dark && !office && !hotel && !lights && !ocean && !cave && !suburb;
  if (carpet || office || hotel || lights || ocean || cave || suburb) buildLookMats();
  learnSurfaces(data.surfaces);
  /** The room style of a cell of THIS chunk (null = the usual). */
  const styleIn = (x: number, y: number): LookSpec | null => {
    const v = data.look?.[y * n + x] ?? 0;
    return v && data.styles ? (data.styles[v] ?? null) : null;
  };
  /** Level 0: the look of a cell's own room (LOBBY_LOOK). */
  const lookAt = (x: number, y: number): LobbyLook =>
    lookWithStyle(world.districtTypes.get(data.district[y * n + x]) ?? "classic", styleIn(x, y));
  /** Vertex light from the baked field. Pipe Dreams swaps the curve: nearly
   *  black away from a bulb, a warm pool under one — the dark IS the level. */
  const lum = (base: number, gain: number, e: number, px?: number, pz?: number, py?: number): number => {
    // a room's Brightness setting scales everything in it (styleBright)
    const st = px !== undefined && pz !== undefined ? world.styleAt(Math.floor(px / CELL), Math.floor(pz / CELL)) : null;
    const b = styleBright(st);
    // the station's fluorescents throw further and harder than the tunnels' bulbs
    // THE STATION: a powered section is LIT throughout (a base light, not just
    // pools) and a dead one goes black — over dark brick, the old 0.05 floor
    // left even a live corridor black between its lamps.
    if (station) {
      const live = px === undefined || pz === undefined || stationSectionPowered(world.sectionAt(Math.floor(px / CELL), Math.floor(pz / CELL)));
      return ((live ? STATION_BASE_LIT : 0.03) + STATION_LAMP_GAIN * e) * b;
    }
    // Pipe Dreams: POOLS of light under each caged lamp, the tunnel black
    // between (Oct 2026, the reference verdict: a lit stretch in the set reads
    // luminance ~70-130, ours read 10-35). The gain is the pool; the falloff
    // in lightAt keeps the gaps dark.
    if (dark) return (0.05 + PIPE_LAMP_GAIN * e) * b;
    // THE OFFICE: a grey floor between pools of troffer light (the dead
    // panels leave most of it in a dim you can still see across)
    if (office) return (OFFICE_BASE_LIT + OFFICE_LAMP_GAIN * e) * b;
    if (lights) return LIGHTS_BASE_LIT * b;
    // THE SEA GETS DARKER GOING DOWN (Nov 2026 polish round): a surface 24m
    // under the water was lit exactly like a roof (the underwater look was
    // fog only), so the sunken square's pale marble read ~90/255 against the
    // references' black depths (~20). Vertex light fades with depth under the
    // surface (y = 0) toward black at the plaza's floor.
    if (ocean) return (OCEAN_BASE_LIT + 0.4 * e) * b * (py !== undefined && py < 0 ? Math.max(0.05, Math.max(0, 1 + py / 27) ** 2) : 1);
    if (cave) {
      const station = px !== undefined && pz !== undefined && CAVE_STATION_SET.has(world.typeAt(Math.floor(px / CELL), Math.floor(pz / CELL)));
      return ((station ? CAVE_STATION_LIT : CAVE_BASE_LIT) + CAVE_LAMP_GAIN * e) * b;
    }
    // THE SUBURBS: moonlight outdoors, the dark of an empty house inside
    if (suburb) {
      const inside = px !== undefined && pz !== undefined && SUBURB_INDOOR_SET.has(world.typeAt(Math.floor(px / CELL), Math.floor(pz / CELL)));
      return ((inside ? SUBURB_IN_LIT : SUBURB_OUT_LIT) + SUBURB_LAMP_GAIN * e) * b;
    }
    if (hotel) {
      const hot = px !== undefined && pz !== undefined && HOT_SET.has(world.typeAt(Math.floor(px / CELL), Math.floor(pz / CELL)));
      return ((hot ? HOTEL_HOT_BASE : HOTEL_BASE_LIT) + HOTEL_LAMP_GAIN * e) * b;
    }
    // Level 0: the base light belongs to the room the sample sits in
    // (LOBBY_LOOK.ambient) — the unlit rooms are dark, not merely panel-less.
    if (carpet && px !== undefined && pz !== undefined) {
      const a = (lobbyLookOf(world.typeAt(Math.floor(px / CELL), Math.floor(pz / CELL))).ambient ?? 1) * b;
      if (a !== 1) return base * a + gain * e;
    }
    return (base + gain * e) * b;
  };
  const domType = world.districtTypes.get(domId) ?? "classic";
  const paper =
    domType === "offices" || domType === "warrens" ? (WALL_BY_TYPE[domType] ?? 0) : domId % 3;
  const wallMat = suburb ? lookWalls[lookIndexOf("wall", "paper-manila")] : cave ? lookWalls[lookIndexOf("wall", "cave-rock")] : ocean ? lookWalls[lookIndexOf("wall", "red-brick")] : lights ? lookWalls[lookIndexOf("wall", "concrete-wall")] : hotel ? lookWalls[lookIndexOf("wall", "hotel-cream-wallpaper")] : office ? lookWalls[lookIndexOf("wall", "office-drywall")] : station ? stationWallMat : pipes ? pipeWallMat : pools ? poolWallMat : wallMats[paper];
  // THE LOOK PICKER, every level (surfaces.ts): a cell whose room design
  // overrides a surface wears the catalogue's; the rest wear the level's own
  // (on Level 0, its room type's). Only a chunk with an override pays for the
  // per-cell buckets on the Poolrooms and in Pipe Dreams.
  const hasLook = !carpet && !!data.styles;
  if (hasLook) buildLookMats();
  const levelFloorMat: THREE.Material = suburb ? suburbGrassMat : cave ? lookFloors[lookIndexOf("floor", "cave-gravel")] : ocean ? lookFloors[lookIndexOf("floor", "wet-asphalt")] : lights ? lookFloors[lookIndexOf("floor", "concrete-floor")] : hotel ? lookFloors[lookIndexOf("floor", "hotel-red-carpet")] : office ? lookFloors[lookIndexOf("floor", "office-carpet")] : station ? stationFloorMat : pipes ? pipeFloorMat : pools ? poolFloorMat : floorMat;
  const levelCeilMat: THREE.Material = cave ? lookCeils[lookIndexOf("ceil", "cave-rock-ceiling")] : ocean ? lookCeils[lookIndexOf("ceil", "concrete-ceiling")] : lights ? lookCeils[lookIndexOf("ceil", "concrete-ceiling")] : hotel ? hotelCoffer() : office ? officeCeiling() : station ? stationCeilMat : pipes ? pipeCeilMat : pools ? poolCeilMat : ceilMat;
  const perCell = carpet || hasLook || hotel || lights || ocean || cave || suburb;
  /** The hotel's own surfaces for a cell, by its room type (HOTEL_LOOK). */
  const hotelSurf = (x: number, y: number): { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material } => {
    const lk = HOTEL_LOOK[world.districtTypes.get(data.district[y * n + x]) ?? "corridor"] ?? HOTEL_LOOK.corridor;
    const ce = lk.ceil ? lookIndexOf("ceil", lk.ceil) : -1;
    return {
      wall: lookWalls[lookIndexOf("wall", lk.wall)] ?? wallMat,
      floor: lookFloors[lookIndexOf("floor", lk.floor)] ?? levelFloorMat,
      ceil: ce >= 0 ? lookCeils[ce] : hotelCoffer(),
    };
  };
  /** Thalassophobia's own surfaces for a cell, by its block type (OCEAN_LOOK). */
  const oceanSurf = (x: number, y: number): { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material } => {
    const lk = OCEAN_LOOK[world.districtTypes.get(data.district[y * n + x]) ?? "seacanal"] ?? OCEAN_LOOK.seacanal;
    return {
      wall: lookWalls[lookIndexOf("wall", lk.wall)] ?? wallMat,
      floor: lookFloors[lookIndexOf("floor", lk.floor)] ?? levelFloorMat,
      ceil: lookCeils[lookIndexOf("ceil", lk.ceil)] ?? levelCeilMat,
    };
  };
  /** The Cave System's own surfaces for a cell, by its room type (CAVE_LOOK). */
  const caveSurf = (x: number, y: number): { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material } => {
    // ROCK THAT BELONGS TO NO ROOM IS ROCK (Nov 2026 polish round). The rim
    // and the fill between rooms keep district 0 — the first room type, The
    // Subway Stair — and section 0 (no room ever wrote it), so every map-edge
    // wall and rock face in the Caverns and the Deep wore the Station's cream
    // tile. Unclaimed rock wears the plain rock, or the Station's cracked
    // concrete where it backs onto a Station room. (Client-side: changing the
    // district at the source would change the map's fingerprint.)
    const ci = y * n + x;
    if (data.solid[ci] && !(data.section?.[ci] ?? 0)) {
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      const nearStation = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !world.solidAt(gx + dx, gy + dy) && world.sectionAt(gx + dx, gy + dy) === 1);
      const rock = nearStation ? CAVE_UNCLAIMED_STATION : CAVE_LOOK.cavern;
      return {
        wall: lookWalls[lookIndexOf("wall", rock.wall)] ?? wallMat,
        floor: lookFloors[lookIndexOf("floor", rock.floor)] ?? levelFloorMat,
        ceil: lookCeils[lookIndexOf("ceil", rock.ceil)] ?? levelCeilMat,
      };
    }
    const lk = CAVE_LOOK[world.districtTypes.get(data.district[ci]) ?? "cavern"] ?? CAVE_LOOK.cavern;
    return {
      wall: lookWalls[lookIndexOf("wall", lk.wall)] ?? wallMat,
      floor: lookFloors[lookIndexOf("floor", lk.floor)] ?? levelFloorMat,
      ceil: lookCeils[lookIndexOf("ceil", lk.ceil)] ?? levelCeilMat,
    };
  };
  /** The Suburbs' own surfaces for a cell, by its lot type (SUBURB_LOOK). */
  const suburbSurf = (x: number, y: number): { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material } => {
    const lk = SUBURB_LOOK[world.districtTypes.get(data.district[y * n + x]) ?? "yard"] ?? SUBURB_LOOK.yard;
    return {
      wall: lookWalls[lookIndexOf("wall", lk.wall)] ?? wallMat,
      floor: lk.floor ? (lookFloors[lookIndexOf("floor", lk.floor)] ?? levelFloorMat) : suburbGrassMat,
      ceil: lookCeils[lookIndexOf("ceil", lk.ceil)] ?? levelCeilMat,
    };
  };
  /** Lights Out's own surfaces for a cell, by its room type (LIGHTS_LOOK). */
  const lightsSurf = (x: number, y: number): { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material } => {
    const lk = LIGHTS_LOOK[world.districtTypes.get(data.district[y * n + x]) ?? "darkhall"] ?? LIGHTS_LOOK.darkhall;
    return {
      wall: lookWalls[lookIndexOf("wall", lk.wall)] ?? wallMat,
      floor: lookFloors[lookIndexOf("floor", lk.floor)] ?? levelFloorMat,
      ceil: lookCeils[lookIndexOf("ceil", lk.ceil)] ?? levelCeilMat,
    };
  };
  const surfAt = (x: number, y: number): { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material } => {
    if (carpet) {
      const lk = lookAt(x, y);
      return { wall: lookWalls[lk.wall], floor: lookFloors[lk.floor], ceil: lookCeils[lk.ceil] };
    }
    const st = styleIn(x, y);
    const w = lookIndexOf("wall", st?.wall);
    const fl = lookIndexOf("floor", st?.floor);
    const ce = lookIndexOf("ceil", st?.ceil);
    const base = hotel ? hotelSurf(x, y) : lights ? lightsSurf(x, y) : ocean ? oceanSurf(x, y) : cave ? caveSurf(x, y) : suburb ? suburbSurf(x, y) : { wall: wallMat, floor: levelFloorMat, ceil: levelCeilMat };
    return { wall: w >= 0 ? lookWalls[w] : base.wall, floor: fl >= 0 ? lookFloors[fl] : base.floor, ceil: ce >= 0 ? lookCeils[ce] : base.ceil };
  };
  /** The wall a cell's OWN room wears, in this chunk or a loaded neighbour
   *  (null when unloaded or solid — nobody stands there to see it). */
  const wallMatOf = (gx: number, gy: number): THREE.Material | null => {
    if (world.solidAt(gx, gy)) return null;
    const lx = gx - data.cx * n;
    const ly = gy - data.cy * n;
    if (lx >= 0 && ly >= 0 && lx < n && ly < n) return surfAt(lx, ly).wall;
    const t = world.typeAt(gx, gy);
    if (!t) return null;
    const st = world.styleAt(gx, gy);
    if (carpet) return lookWalls[lookWithStyle(t, st).wall] ?? null;
    const w = lookIndexOf("wall", st?.wall);
    if (w >= 0) return lookWalls[w] ?? null;
    const table = hotel ? HOTEL_LOOK : lights ? LIGHTS_LOOK : ocean ? OCEAN_LOOK : cave ? CAVE_LOOK : suburb ? SUBURB_LOOK : null;
    if (!table) return wallMat;
    const lk = table[t];
    return lk ? (lookWalls[lookIndexOf("wall", lk.wall)] ?? null) : null;
  };

  /** Floor elevation of a cell in METRES (v2 verticality). */
  const floorOf = (cx: number, cy: number): number => {
    if (cx >= 0 && cy >= 0 && cx < n && cy < n) return (data.floor?.[cy * n + cx] ?? 0) * FLOOR_STEP;
    return world.floorAt(data.cx * n + cx, data.cy * n + cy);
  };
  /** CEILING ELEVATION of a cell in metres — its floor plus its district's room
   *  height. Since v2 every vertical thing (walls, ceiling quads, fixtures,
   *  posts, fascia) is built against this one number, so a sublevel's ceiling
   *  drops with its floor and a gallery's rises, with no separate bookkeeping.
   *  -1 still means "unloaded neighbour", exactly as in the flat version. */
  const heightOf = (cx: number, cy: number): number => {
    if (cx >= 0 && cy >= 0 && cx < n && cy < n) {
      const t = world.districtTypes.get(data.district[cy * n + cx]) ?? "classic";
      return ceilingOf(t, floorOf(cx, cy), lidMetres(data.lid?.[cy * n + cx], FLOOR_STEP));
    }
    // Out-of-chunk: consult the LOADED neighbor. Chunk-local fallbacks here
    // built boundary walls to the WRONG height when a district height-step
    // crossed a chunk edge — the gap showed the neighbor room's lit ceiling
    // as a white line along the wall top (Josh's bug). Unloaded neighbor →
    // NaN (same-height assumption); the rebuild queue in BackroomsGame
    // rebuilds built neighbors when a chunk arrives, correcting it.
    //
    // NaN, NOT -1 (Josh's map sweep, July 2026): a ceiling height is floor +
    // room height, and a deep pit's ceiling is genuinely NEGATIVE (-14 steps
    // + 5.8m = -1.2m). The old `> 0` sentinel checks read every deep pit's
    // real ceiling as "unloaded" — so the fascia sealing a pit's south/east
    // flanks was never built and you could see (and fly) into the void above
    // the shaft ("no geometry (a hole)" at cell 263,37).
    const c = world.cellLookup(data.cx * n + cx, data.cy * n + cy);
    if (!c) return NaN;
    const t2 = world.districtTypes.get(c.chunk.district[c.i]) ?? "classic";
    return ceilingOf(t2, (c.chunk.floor?.[c.i] ?? 0) * FLOOR_STEP, lidMetres(c.chunk.lid?.[c.i], FLOOR_STEP));
  };

  /** Lowest CARPET CORNER along a cell edge, over the open cells touching
   *  it — what a wall's base must reach on sloped ground (corner heights dip
   *  below floorOf on ramps; see cornerFor). Infinity when nothing open
   *  touches the edge (min() with the flat floors absorbs it). */
  const edgeBaseN = (x: number, y: number): number => {
    const gx = data.cx * n + x;
    const gy = data.cy * n + y;
    let b = Infinity;
    for (const [ccx, ccy] of [[gx, gy], [gx, gy - 1]] as [number, number][]) {
      if (world.solidAt(ccx, ccy)) continue;
      b = Math.min(b, world.cornerFor(ccx, ccy, gx, gy), world.cornerFor(ccx, ccy, gx + 1, gy));
    }
    return b;
  };
  const edgeBaseW = (x: number, y: number): number => {
    const gx = data.cx * n + x;
    const gy = data.cy * n + y;
    let b = Infinity;
    for (const [ccx, ccy] of [[gx, gy], [gx - 1, gy]] as [number, number][]) {
      if (world.solidAt(ccx, ccy)) continue;
      b = Math.min(b, world.cornerFor(ccx, ccy, gx, gy), world.cornerFor(ccx, ccy, gx, gy + 1));
    }
    return b;
  };

  // ---- THE SUBURBS: what stands on each edge ---------------------------------
  // A street has no ceiling, so a wall can't run to "the higher ceiling" as
  // everywhere else: between two lawns it is a picket fence, round the map a
  // privacy fence, round a house its siding up to the eaves (the roof sits on
  // them), and inside a house its paper to the ceiling.
  const SUB_FENCE_H = 1.15;
  const SUB_RIM_H = 2.4;
  /** A house's eave sits this far above its rooms' ceiling. */
  const SUB_EAVE = 0.12;
  /** Number 9: the house you never go into, as tall as any other. */
  const SUB_BLOCK_H = 2.82;
  const subBrick: THREE.Material = suburb ? (lookWalls[lookIndexOf("wall", "red-brick")] ?? wallMat) : wallMat;
  /** in = a room of a house (or Number 9's sealed block) · out = the open air
   *  · rim = the privacy fence round the map. An unloaded cell reads as the
   *  open air (its arrival rebuilds this chunk). */
  const subCls = (gx: number, gy: number): "in" | "out" | "rim" => {
    const S = world.mapSize;
    if (gx < 0 || gy < 0 || gx >= S || gy >= S) return "rim";
    const c = world.cellLookup(gx, gy);
    if (!c) return "out";
    if (c.chunk.solid[c.i] === 1) return gx >= 2 && gy >= 2 && gx < S - 2 && gy < S - 2 ? "in" : "rim";
    return SUBURB_INDOOR_SET.has(world.districtTypes.get(c.chunk.district[c.i]) ?? "") ? "in" : "out";
  };
  /** The eave over a cell of a house: its own ceiling plus a hand (Number 9's
   *  block: its floor plus a house's height). */
  const subEave = (gx: number, gy: number): number => {
    const c = world.cellLookup(gx, gy);
    if (!c) return NaN;
    const f = (c.chunk.floor?.[c.i] ?? 0) * FLOOR_STEP;
    if (c.chunk.solid[c.i] === 1) return f + SUB_BLOCK_H;
    return world.ceilAt(gx, gy) + SUB_EAVE;
  };
  /** A house's siding: one of five colours by the house it belongs to, so the
   *  street isn't one house over and over. Number 9 is brick. */
  const subSiding = (gx: number, gy: number): THREE.Material => {
    const c = world.cellLookup(gx, gy);
    if (!c || c.chunk.solid[c.i] === 1) return subBrick;
    return suburbSidingMats[flickerHash(c.chunk.district[c.i] * 7 + 3, 11) % suburbSidingMats.length] ?? subBrick;
  };
  /** A room's own wall (the paper inside a house, a garage's concrete). */
  const subInner = (gx: number, gy: number): THREE.Material => {
    const lk = SUBURB_LOOK[world.typeAt(gx, gy)] ?? SUBURB_LOOK.house;
    return lookWalls[lookIndexOf("wall", lk.wall)] ?? wallMat;
  };
  interface SubEdge {
    base: number;
    top: number;
    mat: THREE.Material;
    /** An outer wall of a house is two skins: siding outside, paper inside.
     *  1 = cell A is the house, 2 = cell B is. */
    inSide: 0 | 1 | 2;
    inner?: THREE.Material;
    /** The house cell it belongs to (its windows are picked by it). */
    hx?: number;
    hy?: number;
  }
  /** What stands on the edge between cell A and cell B (null = an ordinary
   *  wall inside a house, which the usual code draws). */
  const subEdge = (ax: number, ay: number, bx: number, by: number, base: number): SubEdge | null => {
    const a = subCls(ax, ay);
    const b = subCls(bx, by);
    if (a === "rim" || b === "rim") return { base, top: base + SUB_RIM_H, mat: suburbPrivacyMat, inSide: 0 };
    if (a === "in" && b === "in") return null;
    if (a === "out" && b === "out") return { base, top: base + SUB_FENCE_H, mat: suburbPicketMat, inSide: 0 };
    const hx = a === "in" ? ax : bx;
    const hy = a === "in" ? ay : by;
    const top = subEave(hx, hy);
    const solidBlock = world.cellLookup(hx, hy)?.chunk.solid[world.cellLookup(hx, hy)!.i] === 1;
    return {
      base,
      top: Number.isFinite(top) ? top : base + SUB_BLOCK_H,
      mat: subSiding(hx, hy),
      inSide: solidBlock ? 0 : a === "in" ? 1 : 2,
      inner: solidBlock ? undefined : subInner(hx, hy),
      hx,
      hy,
    };
  };
  // ---- Wall geometry: EXACT sizes, WORLD-scale UVs, vertex shading ----------
  // The old system instanced ONE unit box per family and Y-SCALED it, which
  // stretched the paper on tall rooms (Josh: "if the height of a room
  // changes make sure the wall textures are automatically scaled"), smeared
  // the full texture into 0.3m caps, and needed overlapping boxes whose
  // coplanar faces z-fought. Now every distinct size gets its own cached
  // geometry, built UNSCALED with:
  //  - UVs in WORLD METERS on every face (pattern spans 4m in U, 3m in V —
  //    a tall wall shows MORE paper, never stretched paper; a 0.3m cap
  //    shows a correct 0.3m slice, so caps/fascia/posts wear the wallpaper
  //    and nothing needs a gray placeholder material);
  //  - a VERTEX-COLOR lit-from-above gradient (bright top → contact-shadow
  //    base) spanning the box exactly once at any height;
  //  - segments cut to EXACT length (no overhang): corners + junctions are
  //    closed by 0.32m corner POSTS at wall-meeting vertices, so no two
  //    boxes ever share a coplanar overlap (the z-fight class is gone).
  // Walls stay ~30cm drywall (collision unaffected: the player's 0.44m
  // clearance exceeds the half-thickness); N walls 0.30 vs W walls 0.29 so
  // even buried cap planes never coincide with a crossing side plane.
  const geoCache = new Map<string, THREE.BoxGeometry>();
  const boxGeo = (w: number, h: number, d: number): THREE.BoxGeometry => {
    const key = `${w}|${h}|${d}`;
    const hit = geoCache.get(key);
    if (hit) return hit;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const posAttr = g.attributes.position as THREE.BufferAttribute;
    // Box face order: +x, -x, +y, -y, +z, -z (4 verts each).
    const faceU = [d, d, w, w, w, w];
    const faceV = [h, h, d, d, h, h];
    const colors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const f = Math.floor(i / 4);
      uv.setXY(i, uv.getX(i) * (faceU[f] / PAPER_U_M), uv.getY(i) * (faceV[f] / PAPER_V_M));
      const t = posAttr.getY(i) / h + 0.5; // 0 base → 1 top
      const c = t < 0.12 ? 0.62 + 1.5 * t : 0.8 + 0.2 * ((t - 0.12) / 0.88);
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geoCache.set(key, g);
    return g;
  };
  const WALL_T_N = 0.3;
  const WALL_T_W = 0.29;
  const POST_T = 0.32;
  const r2 = (v: number): number => Math.round(v * 100) / 100; // stable cache keys
  const ceilGeo = new THREE.PlaneGeometry(CELL, CELL);
  // A fixture = exactly TWO drop-ceiling tiles (0.67m × 1.33m — the classic
  // 600×1200 twin-tube troffer), placed ON the tile grid, never across it.
  const panelGeo = new THREE.PlaneGeometry(CELL / CEIL_TILES, (CELL / CEIL_TILES) * 2);

  // Walls MERGE into one mesh per chunk (not instanced): the light field
  // bakes PER VERTEX, so brightness flows continuously along a wall run.
  // The per-instance flat tints made each 2m segment its own brightness —
  // Josh: "they look like disconnected walls instead of one unified wall."
  // Shared corners sample identical light values, so continuity is exact.
  const wallBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  // Buckets whose paper must hang LEVEL — a texture with horizontal detail
  // (the wood panels' rails) would jump height between segments otherwise.
  const levelHung = new Set<THREE.BufferGeometry[]>();
  const wallBucket = (mat: THREE.Material): THREE.BufferGeometry[] => {
    let b = wallBuckets.get(mat);
    if (!b) {
      wallBuckets.set(mat, (b = []));
      if (mat.userData.levelHung) levelHung.add(b);
    }
    return b;
  };
  let wallPieces = wallBucket(wallMat);
  const trimPieces: THREE.BufferGeometry[] = []; // painted baseboards
  const pillarGeos: THREE.BufferGeometry[] = []; // pools: round column drums
  const pushBox = (geo: THREE.BoxGeometry, mx: THREE.Matrix4, into = wallPieces): void => {
    const g = geo.clone();
    g.applyMatrix4(mx);
    // PAPER IS HUNG FROM AN ARBITRARY START (Josh: "every wall has the same
    // middle seam"). World-scale UVs put u=0 at each wall's own corner, so
    // every 2.6m segment showed the identical roll seam, blister and scuff in
    // the identical place. Offsetting u/v per segment — hashed off its world
    // position, so all clients agree forever — makes each wall a different cut
    // of the same roll, and half of them get the roll flipped end-for-end.
    {
      const uvA = g.attributes.uv as THREE.BufferAttribute;
      const kx = Math.round(mx.elements[12] * 8);
      const kz = Math.round(mx.elements[14] * 8);
      const offU = flickerHash(kx, kz) / 1000;
      const offV = levelHung.has(into) ? 0 : (flickerHash(kz + 17, kx + 5) / 1000) * 0.35;
      const flip = flickerHash(kx * 3 + 1, kz * 7 + 2) < 500 ? -1 : 1;
      for (let i = 0; i < uvA.count; i++) {
        uvA.setXY(i, uvA.getX(i) * flip + offU, uvA.getY(i) + offV);
      }
    }
    const posA = g.attributes.position as THREE.BufferAttribute;
    const colA = g.attributes.color as THREE.BufferAttribute;
    const norA = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < posA.count; i++) {
      // Range deepened when the wash quads left — the vertex field is the
      // walls' entire light response now. The vertex NORMAL rides along so
      // each face gets its lit side and shadow side (box tops/bottoms have
      // vertical normals → nx=nz=0 → the omni fallback, as before). The
      // sample is nudged 15cm OFF the face along its normal, so each side of
      // a wall reads the light of its OWN room, never the wall's interior.
      const nxv = norA.getX(i);
      const nzv = norA.getZ(i);
      const sx = posA.getX(i) + nxv * 0.15;
      const sz = posA.getZ(i) + nzv * 0.15;
      const l = lum(0.89, 0.3, lightAt(sx, sz, nxv, nzv), sx, sz, posA.getY(i));
      colA.setXYZ(i, colA.getX(i) * l, colA.getY(i) * l, colA.getZ(i) * l);
    }
    into.push(g);
  };
  const panels: THREE.Matrix4[] = [];
  /** THE OFFICE's dead troffers: the same fixture, its diffuser grey and unlit. */
  const deadPanels: THREE.Matrix4[] = [];
  const deadPanelCols: THREE.Color[] = [];
  const skylightCuts: THREE.Matrix4[] = []; // pools deco: glowing ceiling openings
  const ceilQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  // Panel orientations: long axis north-south (default) or east-west (turned
  // to run ALONG a corridor when the N/S edges are walled).
  const panelQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const panelQEW = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    .multiply(panelQ);
  const one = new THREE.Vector3(1, 1, 1);

  // ---- Fixture prepass + the baked light field ------------------------------
  // Every fixture this chunk will place, resolved BEFORE geometry so wall/
  // ceiling instances can be tinted by their distance to real lights
  // (Josh: "make the wall interact with light more realistic" — surfaces
  // near fixtures lift, corridors between them fall into gloom; all baked,
  // nothing tracks the player). The main loop reuses this map for panel
  // placement — one source of truth.
  interface FixtureSpot {
    px: number;
    pz: number;
    isNS: boolean;
    /** THE OFFICE: a troffer that is dead (drawn, dark) or flickering. */
    dead?: boolean;
    flick?: boolean;
  }
  const fixtures = new Map<number, FixtureSpot>();
  const lightSpots: { px: number; pz: number }[] = [];
  // The prepass scans a 3-cell HALO beyond the chunk (world-level lookups),
  // so the light field is continuous across chunk seams — without it, a
  // wall crossing a seam stepped in brightness. Unloaded neighbors read as
  // walled (no fixtures) and heal via rebuild-on-arrival.
  // PIPE DREAMS: no ceiling grid — the light is the level's own lamps (deco
  // kind 2; v1 = dead, dark) and the SAFE rooms (break rooms, control rooms,
  // the drain chamber — a ROOM TYPE since D2), which are lit properly: a
  // fixture on every other cell. The occlusion cache packs the fixture index
  // into 8 bits, so a chunk never takes more than 250.
  const bulbs: { x: number; y: number; dead: boolean }[] = [];
  // THE STATION's lamps are its own deco (SDECO.lamp: v1 dead, v2 flicker)
  // and every one is dark while its SECTION has no power.
  if (dark) {
    for (let y = -3; y < n + 3; y++) {
      for (let x = -3; x < n + 3; x++) {
        const gx = data.cx * n + x;
        const gy = data.cy * n + y;
        if (gx < 0 || gy < 0 || gx >= world.mapSize || gy >= world.mapSize) continue;
        const code = world.decoAt(gx, gy);
        const kind = code >> 4;
        const lampCell = kind === (station ? SDECO.lamp : 2);
        const safeLit = pipes && gx % 2 === 0 && gy % 2 === 0 && !world.solidAt(gx, gy) && PIPE_SAFE_TYPES.has(world.typeAt(gx, gy));
        if (!lampCell && !safeLit) continue;
        if (lightSpots.length >= 250) continue;
        const dead =
          (lampCell && (code & 15) === 1) ||
          !styleLampOn(world.styleAt(gx, gy), gx, gy) ||
          (station && !stationSectionPowered(world.sectionAt(gx, gy)));
        const inside = x >= 0 && y >= 0 && x < n && y < n;
        if (inside && lampCell) bulbs.push({ x, y, dead });
        if (dead) continue;
        lightSpots.push({ px: ox + x * CELL + CELL / 2, pz: oz + y * CELL + CELL / 2 });
      }
    }
  }
  // THE CAVE SYSTEM's lamps are its own deco (CDECO.lamp): v0 the survey
  // team's work lamps and v2 the platforms' flickering lamps LIGHT (a pool
  // each); v1 the tunnels' battens hang dead.
  if (cave) {
    for (let y = -3; y < n + 3; y++) {
      for (let x = -3; x < n + 3; x++) {
        const gx = data.cx * n + x;
        const gy = data.cy * n + y;
        if (gx < 0 || gy < 0 || gx >= world.mapSize || gy >= world.mapSize) continue;
        const code = world.decoAt(gx, gy);
        if (code >> 4 !== CDECO.lamp || (code & 15) === 1) continue;
        if (lightSpots.length >= 250) continue;
        if (!styleLampOn(world.styleAt(gx, gy), gx, gy)) continue;
        lightSpots.push({ px: ox + x * CELL + CELL / 2, pz: oz + y * CELL + CELL / 2 });
      }
    }
  }
  // THE SUBURBS' lamps are its deco (UDECO.lamp): a STREETLIGHT on a pole
  // (v0 lit, v1 dead, v2 flickering) or a PORCH LIGHT on a house's front wall
  // (v3 lit — Number 9's, v4 dead). Only a lit one throws a pool (udecoLit:
  // the server's rule — a flickering light is no light), and the Watch won't
  // step into one.
  const subLamps: SuburbLamp[] = [];
  for (let y = -3; y < n + 3 && suburb; y++) {
    for (let x = -3; x < n + 3; x++) {
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      if (gx < 0 || gy < 0 || gx >= world.mapSize || gy >= world.mapSize) continue;
      const code = world.decoAt(gx, gy);
      if (udecoKind(code) !== UDECO.lamp || world.solidAt(gx, gy)) continue;
      const v = udecoVar(code);
      const porch = v >= 3;
      // the SERVER's rule decides what is lit here, because the light is the
      // Watch's wall: a room style's Lights % would darken a pool the server
      // still counts as safe (Nov 2026 validation run)
      const lit = udecoLit(code);
      // a porch light hangs on the wall to a house; a streetlight's arm
      // reaches over the road
      let dx = 0;
      let dz = 0;
      const sides: [number, number, boolean][] = [
        [0, -1, world.wallNAt(gx, gy)],
        [1, 0, world.wallWAt(gx + 1, gy)],
        [0, 1, world.wallNAt(gx, gy + 1)],
        [-1, 0, world.wallWAt(gx, gy)],
      ];
      for (const [sx, sz, wall] of sides) {
        const nb = world.cellLookup(gx + sx, gy + sz);
        if (!nb) continue;
        const nType = world.districtTypes.get(nb.chunk.district[nb.i]) ?? "";
        const hit = porch ? nb.chunk.solid[nb.i] === 1 || (wall && SUBURB_INDOOR_SET.has(nType)) : nType === "road";
        if (hit) {
          dx = sx;
          dz = sz;
          break;
        }
      }
      const cx = ox + x * CELL + CELL / 2;
      const cz = oz + y * CELL + CELL / 2;
      // where the light comes from: the porch light by its wall, the
      // streetlight's head out on its arm
      const lx = porch ? cx + dx * (CELL / 2 - 0.4) : cx + dx * 0.35;
      const lz = porch ? cz + dz * (CELL / 2 - 0.4) : cz + dz * 0.35;
      if (lit && lightSpots.length < 250) lightSpots.push({ px: lx, pz: lz });
      // a flickering lamp is drawn DEAD: it is no light to the Watch, and a
      // steady glowing bulb read as safety it isn't (Nov 2026 validation run)
      if (x >= 0 && y >= 0 && x < n && y < n) subLamps.push({ x, y, porch, lit, dx, dz });
    }
  }
  // THE OFFICE's troffers are its own deco: one fixture per lamp cell, in
  // the middle of the cell, turned to run along a corridor; a DEAD one is
  // still a fixture on the ceiling (drawn dark), it just lights nothing.
  for (let y = -3; y < n + 3 && office; y++) {
    for (let x = -3; x < n + 3; x++) {
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      if (gx < 0 || gy < 0 || gx >= world.mapSize || gy >= world.mapSize) continue;
      const code = world.decoAt(gx, gy);
      if (code >> 4 !== ODECO.lamp || world.solidAt(gx, gy)) continue;
      const v = code & 15;
      const dead = v === 1 || !styleLampOn(world.styleAt(gx, gy), gx, gy);
      const isNS = !(world.wallNAt(gx, gy) || world.wallNAt(gx, gy + 1)) || !!(world.wallWAt(gx, gy) || world.wallWAt(gx + 1, gy));
      const spot = { px: ox + x * CELL + CELL / 2, pz: oz + y * CELL + CELL / 2, isNS, dead, flick: v === 2 };
      if (!dead) lightSpots.push(spot);
      if (x >= 0 && y >= 0 && x < n && y < n) fixtures.set(y * n + x, spot);
    }
  }
  // THE HOTEL's fixtures are its deco too: a CHANDELIER (or, below stairs, a
  // caged bulb) per lamp cell and a SCONCE on the wall named by its variant.
  // They light the baked field; buildHotelFixtures draws the models.
  const hotelLamps: { x: number; y: number; dead: boolean; hot: boolean; grand: boolean }[] = [];
  const hotelSconces: { x: number; y: number; side: number; dead: boolean }[] = [];
  for (let y = -3; y < n + 3 && hotel; y++) {
    for (let x = -3; x < n + 3; x++) {
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      if (gx < 0 || gy < 0 || gx >= world.mapSize || gy >= world.mapSize) continue;
      const code = world.decoAt(gx, gy);
      const kind = code >> 4;
      if (kind !== HDECO.lamp && kind !== HDECO.sconce && kind !== HDECO.furnace) continue;
      if (lightSpots.length >= 250) continue;
      // a FURNACE lights the floor in front of its mouth (the glow itself is
      // drawn by the game, on the furnace model)
      if (kind === HDECO.furnace) {
        const side = code & 3;
        lightSpots.push({ px: ox + x * CELL + CELL / 2 - [0, 1, 0, -1][side] * 0.9, pz: oz + y * CELL + CELL / 2 - [-1, 0, 1, 0][side] * 0.9 });
        continue;
      }
      if (world.solidAt(gx, gy)) continue;
      const inside = x >= 0 && y >= 0 && x < n && y < n;
      const on = styleLampOn(world.styleAt(gx, gy), gx, gy);
      if (kind === HDECO.lamp) {
        const dead = (code & 15) === 1 || !on;
        const type = world.typeAt(gx, gy);
        if (inside) hotelLamps.push({ x, y, dead, hot: HOT_SET.has(type), grand: type === "beverly" });
        if (!dead) lightSpots.push({ px: ox + x * CELL + CELL / 2, pz: oz + y * CELL + CELL / 2 });
      } else {
        const side = sconceSide(code & 15);
        const dead = sconceState(code & 15) === 1 || !on;
        if (inside) hotelSconces.push({ x, y, side, dead });
        const into = CELL / 2 - 0.3;
        if (!dead) lightSpots.push({ px: ox + x * CELL + CELL / 2 + [0, 1, 0, -1][side] * into, pz: oz + y * CELL + CELL / 2 + [-1, 0, 1, 0][side] * into });
      }
    }
  }
  // LIGHTS OUT's fixtures are its deco: a caged bulkhead (v0) or a
  // fluorescent batten (v1) per lamp cell — every one DEAD. They hang there,
  // drawn dark; they light nothing (no lightSpots).
  const lightsLamps: { x: number; y: number; batten: boolean; isNS: boolean }[] = [];
  for (let y = 0; y < n && ocean; y++) {
    for (let x = 0; x < n; x++) {
      const code = data.deco?.[y * n + x] ?? 0;
      if (code >> 4 !== TDECO.lamp) continue;
      lightsLamps.push({ x, y, batten: false, isNS: false });
    }
  }
  // THE CAVE SYSTEM: a caged bulkhead for every lit lamp (the survey team's
  // work lamps, and the platforms'), a batten for every dead one.
  const caveLit: { x: number; y: number; batten: boolean; isNS: boolean }[] = [];
  const caveDead: { x: number; y: number; batten: boolean; isNS: boolean }[] = [];
  for (let y = 0; y < n && cave; y++) {
    for (let x = 0; x < n; x++) {
      const code = data.deco?.[y * n + x] ?? 0;
      if (code >> 4 !== CDECO.lamp) continue;
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      const isNS = !(world.wallNAt(gx, gy) || world.wallNAt(gx, gy + 1)) || !!(world.wallWAt(gx, gy) || world.wallWAt(gx + 1, gy));
      const v = code & 15;
      if (v === 1) caveDead.push({ x, y, batten: true, isNS });
      else caveLit.push({ x, y, batten: v === 2, isNS });
    }
  }
  for (let y = 0; y < n && lights; y++) {
    for (let x = 0; x < n; x++) {
      const code = data.deco?.[y * n + x] ?? 0;
      if (code >> 4 !== LDECO.lamp) continue;
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      const isNS = !(world.wallNAt(gx, gy) || world.wallNAt(gx, gy + 1)) || !!(world.wallWAt(gx, gy) || world.wallWAt(gx + 1, gy));
      lightsLamps.push({ x, y, batten: (code & 15) === 1, isNS });
    }
  }
  for (let y = -3; y < n + 3 && !dark && !office && !hotel && !lights && !ocean && !cave && !suburb; y++) {
    for (let x = -3; x < n + 3; x++) {
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      if (gx % 2 !== 0 || gy % 2 !== 1) continue;
      if (gx < 0 || gy < 0 || gx >= world.mapSize || gy >= world.mapSize) continue;
      if (world.solidAt(gx, gy)) continue;
      // A LAMP THAT'S OFF IS STILL A FIXTURE (Nov 2026 polish round): Level 0
      // used to skip it, so an unlit room's ceiling was bare tile — a
      // different ceiling, not a blacked-out one. It hangs there dead, as the
      // office's do, and lights nothing (it never joins lightSpots).
      const deadLamp = carpet && !lobbyLampOn(world.typeAt(gx, gy), gx, gy, world.styleAt(gx, gy));
      if (pools && !styleLampOn(world.styleAt(gx, gy), gx, gy)) continue;
      const clearNS = !world.wallNAt(gx, gy) && !world.wallNAt(gx, gy + 1);
      const clearEW = !world.wallWAt(gx, gy) && !world.wallWAt(gx + 1, gy);
      if (!clearNS && !clearEW) continue;
      const TILE = CELL / CEIL_TILES;
      const fx = ox + x * CELL;
      const fz = oz + y * CELL;
      const spot = {
        px: fx + (clearNS ? CELL / 2 : TILE * 2),
        pz: fz + (clearNS ? TILE * 2 : CELL / 2),
        isNS: clearNS,
        ...(deadLamp ? { dead: true } : {}),
      };
      if (!deadLamp) lightSpots.push(spot);
      if (x >= 0 && y >= 0 && x < n && y < n) fixtures.set(y * n + x, spot);
    }
  }
  // ---- Occlusion (July 2026: "make the lighting more realistic") -----------
  // Light STOPS AT WALLS now. The old field was pure distance falloff, so a
  // sealed dark room glowed through the drywall from the lit corridor next
  // door. Each fixture's contribution is gated by the same wall-walk the
  // acoustics use (wallsBetween): one wall lets 8% through (reads as bounce
  // light bleeding under the door — a hard 0 left razor-black seams), two
  // walls kill it. The walk is cached per (quarter-cell, fixture) pair —
  // vertices cluster, so a chunk does a few thousand walks instead of one
  // per vertex×fixture, and the bake stays build-time-cheap. Doorways now
  // throw real spills into dark rooms; corners actually shadow.
  // Quantized at 1/16 cell (12.5cm) — fine enough that a sample can't jump
  // to the far side of a wall. The first cut used quarter-cells and a floor
  // vertex near a wall could quantize ACROSS it, losing its fixture and
  // painting a whole dark triangle onto open carpet (Josh's photo). Callers
  // also nudge their samples OFF the cell-edge lines (floor/ceiling verts sit
  // exactly on them, where "which side of the wall" is a coin flip).
  const OCC = [1, 0.08, 0, 0, 0];
  const occCache = new Map<number, number>();
  const occlusionTo = (sx: number, sz: number, fi: number): number => {
    const qx = Math.round((sx / CELL) * 16);
    const qz = Math.round((sz / CELL) * 16);
    const key = ((qx + 64) * 32768 + (qz + 64)) * 256 + fi;
    let o = occCache.get(key);
    if (o === undefined) {
      const f = lightSpots[fi];
      // THE SUBURBS: every lamp is outdoors, five metres up a pole — its light
      // falls over a waist-high fence onto the lawn beyond. Only a sample
      // inside a house is shut away from it by the walls.
      o = suburb && subCls(Math.floor(qx / 16), Math.floor(qz / 16)) !== "in" ? 1 : OCC[wallsBetween(world, qx / 16, qz / 16, f.px / CELL, f.pz / CELL)];
      occCache.set(key, o);
    }
    return o;
  };
  // SPATIAL INDEX over the fixtures (Aug 2026 stutter fix): lightAt used to
  // scan EVERY fixture in the chunk + halo (~120) for EVERY vertex a build
  // bakes (~15k) — ~1.8M inner iterations per chunk, the single biggest cost
  // of a build. Fixtures cull at √46 ≈ 6.8m, so bucketing them on a 7m grid
  // and visiting the 3×3 block around each sample sees EXACTLY the same set
  // — identical light output, an order of magnitude fewer iterations.
  const BUCKET = 7;
  const bkey = (bx: number, bz: number): number => (bx + 128) * 1024 + (bz + 128);
  const lightBuckets = new Map<number, number[]>();
  for (let fi = 0; fi < lightSpots.length; fi++) {
    const key = bkey(Math.floor(lightSpots[fi].px / BUCKET), Math.floor(lightSpots[fi].pz / BUCKET));
    const arr = lightBuckets.get(key);
    if (arr) arr.push(fi);
    else lightBuckets.set(key, [fi]);
  }
  /** 0..1 light energy at a point from nearby fixtures (incl. the halo) —
   *  wall-occluded, and DIRECTIONAL when a surface normal is passed: a wall
   *  face turned toward a fixture lifts, its back face stays in shadow, so
   *  light visibly arrives FROM somewhere (wrapped-lambert, floor 0.26 at
   *  grazing so backsides read moody rather than void-black; within ~a cell
   *  of a fixture the panel is overhead and bathes both faces evenly). */
  const lightAt = (sx: number, sz: number, nx = 0, nz = 0): number => {
    let e = 0;
    const directional = nx !== 0 || nz !== 0;
    const bx = Math.floor(sx / BUCKET);
    const bz = Math.floor(sz / BUCKET);
    for (let bdx = -1; bdx <= 1; bdx++) {
      for (let bdz = -1; bdz <= 1; bdz++) {
        const bucket = lightBuckets.get(bkey(bx + bdx, bz + bdz));
        if (!bucket) continue;
        for (let bi = 0; bi < bucket.length; bi++) {
          const fi = bucket[bi];
          const f = lightSpots[fi];
          const dx = f.px - sx;
          const dz = f.pz - sz;
          const d2 = dx * dx + dz * dz;
          if (d2 > 46) continue;
          let g = 1.6 / (1 + d2 * 0.5);
          if (directional && d2 > 0.4) {
            const inv = 1 / Math.sqrt(d2);
            let w = (nx * dx * inv + nz * dz * inv + 0.35) / 1.35;
            if (w <= 0) continue;
            // Near-overhead blend: right under the panel the 2D direction is
            // meaningless — fade the directional term in over the first ~1.4m.
            const blend = Math.min(1, (d2 - 0.4) / 1.6);
            w = 1 + (w - 1) * blend;
            g *= w;
          }
          if (g < 0.004) continue;
          const occ = occlusionTo(sx, sz, fi);
          if (occ === 0) continue;
          e += g * occ;
        }
      }
    }
    return Math.min(1, e);
  };
  // Merged per-vertex surfaces (the doctrine): ceiling cell pieces + the
  // tessellated floor, both sampling the fixture field at every vertex.
  const ceilBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const chunkCeilMat: THREE.Material = levelCeilMat;
  let ceilPieces: THREE.BufferGeometry[] = [];
  ceilBuckets.set(chunkCeilMat, ceilPieces);
  const pushCeil = (mx: THREE.Matrix4): void => {
    const g = ceilGeo.clone();
    g.applyMatrix4(mx);
    const p = g.attributes.position as THREE.BufferAttribute;
    const arr = new Float32Array(p.count * 3);
    // Ceiling verts sit exactly on the cell-edge lines — nudge each sample
    // 8% toward the cell centre (the matrix translation) so occlusion always
    // reads from THIS cell's side of any wall on the line.
    const ccx = mx.elements[12];
    const ccz = mx.elements[14];
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i) + (ccx - p.getX(i)) * 0.08;
      const sz = p.getZ(i) + (ccz - p.getZ(i)) * 0.08;
      // The tower is the sea's only ceiling, and a downward face gets the
      // hemisphere's GROUND colour, which the ocean sets near-black for the
      // water — so its lid read black (12/255) under lit bulkheads, walls 65.
      // Its baked light is lifted to make up (Nov 2026 polish round).
      const l = lum(0.9, 0.32, lightAt(sx, sz), sx, sz) * (ocean ? OCEAN_CEIL_LIFT : 1);
      arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = l;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    ceilPieces.push(g);
  };
  // ---- FLOOR (v2: verticality) ---------------------------------------------
  // Was one flat tessellated plane per chunk. Now it's a quad PER CELL whose
  // four corners take per-cell corner heights (WorldIndex.cornerFor), which does
  // three jobs at once: a one-step change becomes a continuous RAMP you walk
  // up, a cliff or shaft keeps its corners unaveraged so the drop stays
  // vertical, and every seam between cells still meets exactly because
  // neighbours read the same corner. Vertical FACES are added wherever a cell
  // sits lower than its neighbour, so a pit is a hole with walls, not a hole
  // you can see the void through.
  //
  /** Is this solid cell part of a ROUND pillar block? Those render as
   *  cylinders rather than boxes, so both the water sheet AND the floor have
   *  to run underneath them to the drum. */
  const pillarCellAt = (gx: number, gy: number): boolean => {
    for (const [ax, ay] of [[gx, gy], [gx - 1, gy], [gx, gy - 1], [gx - 1, gy - 1]] as [number, number][]) {
      const kindA = world.decoAt(ax, ay) >> 4;
      if ((kindA === 1 || kindA === 7) && gx - ax <= 1 && gy - ay <= 1) return true;
    }
    return false;
  };
  {
    const floorBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const chunkFloorMat: THREE.Material = levelFloorMat;
    const floorPieces: THREE.BufferGeometry[] = [];
    floorBuckets.set(chunkFloorMat, floorPieces);
    const facePieces: THREE.BufferGeometry[] = [];
    const gratePieces: THREE.BufferGeometry[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const gx = data.cx * n + x;
        const gy = data.cy * n + y;
        // A PILLAR BLOCK STILL NEEDS ITS FLOOR (Josh: "pillar bases are
        // messed up and show through the map"). The drum is a cylinder of
        // radius 2.0 inscribed in a 4m×4m solid block — which leaves the
        // block's four CORNERS uncovered, and a solid cell draws no floor, so
        // those corners were literal holes through the world. Tile them.
        if (data.solid[i] && !(pools && pillarCellAt(gx, gy)) && !(pipes && pipeFixtureCell(world, gx, gy))) continue;
        const wx = ox + x * CELL;
        const wz = oz + y * CELL;
        // Corners AS THIS CELL SEES THEM (see cornerFor): ramps share corners
        // exactly, cliffs keep each side flat and let the riser close the gap.
        const h00 = world.cornerFor(gx, gy, gx, gy);
        const h10 = world.cornerFor(gx, gy, gx + 1, gy);
        const h01 = world.cornerFor(gx, gy, gx, gy + 1);
        const h11 = world.cornerFor(gx, gy, gx + 1, gy + 1);
        const g = new THREE.BufferGeometry();
        // Two triangles, and the baked light field sampled per corner. UVs are
        // WORLD METRES — the carpet texture is one metre, so a unit per metre
        // tiles it at life size no matter how the cell is sloped, and every
        // cell's carpet lines up with its neighbour's. (The texture therefore
        // carries no repeat of its own — see floorCanvas.)
        // Winding and UVs live in geom.ts, alone and unit-tested — a floor
        // wound the wrong way is culled and simply isn't there (see geom.ts).
        // A STAIR draws its steps instead of a sloped quad (stairs.ts)
        const stairSide = data.stair?.[i] ?? -1;
        if (stairSide >= 0) {
          const spec = (data.stairStyle?.[i] && data.stairSpecs?.[data.stairStyle[i]]) || {};
          const surf = spec.tex ? shapeSurface(spec.tex) : null;
          const baseMat = surf?.mat ?? (perCell ? surfAt(x, y).floor : chunkFloorMat);
          const mat = tintedStairMat(baseMat, spec.tex ?? `floor${baseMat.uuid}`, spec.col);
          // the flight continues on that side: a stair beside it climbing the same way
          const sameFlight = (sd: number): boolean => {
            const nc = world.cellLookup(gx + [0, 1, 0, -1][sd], gy + [-1, 0, 1, 0][sd]);
            return !!nc && (nc.chunk.stair?.[nc.i] ?? -1) === stairSide;
          };
          // rails only where the side is open: no wall, no solid cell, and no
          // flight beside it climbing the same way (a wide stair has none between)
          const openSide = (sd: number): boolean => {
            const nx = gx + [0, 1, 0, -1][sd];
            const ny = gy + [-1, 0, 1, 0][sd];
            const walled = sd === 0 ? world.wallNAt(gx, gy) : sd === 2 ? world.wallNAt(gx, gy + 1) : sd === 3 ? world.wallWAt(gx, gy) : world.wallWAt(gx + 1, gy);
            if (walled || world.solidAt(nx, ny)) return false;
            const nc = world.cellLookup(nx, ny);
            return !(nc && (nc.chunk.stair?.[nc.i] ?? -1) === stairSide);
          };
          const built = stairGeometry(
            {
              x0: wx, z0: wz, cell: CELL,
              y0: (data.floor?.[i] ?? 0) * FLOOR_STEP, rise: FLOOR_STEP,
              side: stairSide, spec,
              railLeft: openSide((stairSide + 3) % 4), railRight: openSide((stairSide + 1) % 4),
              edgeLeft: !sameFlight((stairSide + 3) % 4), edgeRight: !sameFlight((stairSide + 1) % 4),
              uM: surf?.uM ?? 1, vM: surf?.vM ?? 1,
            },
            (sx, sz) => lum(0.88, 0.38, lightAt(sx, sz), sx, sz, (data.floor?.[i] ?? 0) * FLOOR_STEP),
          );
          const tb = floorBuckets.get(mat) ?? [];
          floorBuckets.set(mat, tb);
          tb.push(built.treads);
          if (built.rails) {
            const rm = stairRailMat();
            const rb = floorBuckets.get(rm) ?? [];
            floorBuckets.set(rm, rb);
            rb.push(built.rails);
          }
        }
        const q = floorQuad(wx, wz, CELL, h00, h10, h01, h11);
        const verts = new Float32Array(q.verts);
        const uvs = new Float32Array(q.uvs);
        const cols = new Float32Array(18);
        for (let v = 0; v < 6; v++) {
          // Corner verts sit exactly on the cell-edge lines — nudge the
          // light sample 8% toward the cell centre so occlusion reads from
          // THIS cell's side of any wall on the line (a sample that lands
          // across a wall goes dark and paints a dark triangle onto open
          // carpet — Josh's photo).
          const sx = verts[v * 3] + (wx + CELL / 2 - verts[v * 3]) * 0.08;
          const sz = verts[v * 3 + 2] + (wz + CELL / 2 - verts[v * 3 + 2]) * 0.08;
          const l = lum(0.88, 0.38, lightAt(sx, sz), sx, sz, verts[v * 3 + 1]);
          cols[v * 3] = cols[v * 3 + 1] = cols[v * 3 + 2] = l;
        }
        g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
        g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
        g.computeVertexNormals();
        let fb = floorPieces;
        // a catwalk keeps its grate unless its room picked another floor
        const lookFloor = lookIndexOf("floor", styleIn(x, y)?.floor) >= 0;
        if (perCell) {
          const fm = surfAt(x, y).floor;
          fb = floorBuckets.get(fm) ?? [];
          floorBuckets.set(fm, fb);
        }
        // (a stair cell drew its steps above — its sloped quad is not wanted,
        // but the drop faces below still are)
        if (stairSide >= 0) g.dispose();
        else (pipes && !lookFloor && world.typeAt(gx, gy) === "catwalk" ? gratePieces : fb).push(g);

        // Vertical faces closing a step between two cells. Each boundary is
        // visited ONCE, from the cell on its west/north side — so this must
        // handle BOTH cases: the drop going away from us, and the drop coming
        // back at us. It used to `continue` when the neighbour was higher, on
        // the theory that the neighbour would draw it. It never did: the
        // neighbour also only looks east and south, so every WEST- and
        // NORTH-facing drop in the world had no face and you could see clean
        // through it. That is what Josh's probe reported as "NOTHING — no
        // geometry (a hole)", and it was half of all the drops in Level 0.
        //
        // ONLY AT CLIFFS. A single step is a RAMP — the two cells share their
        // corners and the carpet flows across — so the quad collapses and
        // nothing is drawn, which is what the corner test below decides.
        for (const [nx, ny] of [[gx + 1, gy], [gx, gy + 1]] as [number, number][]) {
          if (world.solidAt(nx, ny)) continue;
          const east = nx > gx;
          const fx = east ? wx + CELL : wx;
          const fz = east ? wz : wz + CELL;
          const ex = east ? fx : fx + CELL;
          const ez = east ? fz + CELL : fz;
          // The face is built from the two cells' OWN corner heights along the
          // shared edge, so it fills exactly the gap between them — never a
          // stub poking through the carpet above, never a slot of daylight
          // below.
          const [v0x, v0y] = east ? [gx + 1, gy] : [gx, gy + 1];
          const [v1x, v1y] = east ? [gx + 1, gy + 1] : [gx + 1, gy + 1];
          const mine0 = world.cornerFor(gx, gy, v0x, v0y);
          const mine1 = world.cornerFor(gx, gy, v1x, v1y);
          const theirs0 = world.cornerFor(nx, ny, v0x, v0y);
          const theirs1 = world.cornerFor(nx, ny, v1x, v1y);
          // Whoever is higher owns the top of the face; it looks at the lower.
          const iAmHigher = mine0 + mine1 >= theirs0 + theirs1;
          const top0 = iAmHigher ? mine0 : theirs0;
          const top1 = iAmHigher ? mine1 : theirs1;
          const bottom0 = iAmHigher ? theirs0 : mine0;
          const bottom1 = iAmHigher ? theirs1 : mine1;
          if (top0 - bottom0 < 0.01 && top1 - bottom1 < 0.01) continue; // flush
          const rq = riserQuad(
            fx, fz, ex, ez,
            top0, top1, Math.min(bottom0, top0), Math.min(bottom1, top1),
            east, iAmHigher, PAPER_U_M, PAPER_V_M,
          );
          const fv = new Float32Array(rq.verts);
          const fu = new Float32Array(rq.uvs);
          const fc = new Float32Array(18);
          const lowest = Math.min(bottom0, bottom1);
          // A riser's visible face looks at the LOWER cell — sample the
          // light from that side of the boundary line, not on it.
          const rnx = east ? (iAmHigher ? 0.15 : -0.15) : 0;
          const rnz = east ? 0 : iAmHigher ? 0.15 : -0.15;
          for (let v = 0; v < 6; v++) {
            // A riser is in shadow relative to the floor it drops from — the
            // cheapest possible ambient occlusion, and it makes drops READ.
            const l = lum(0.62, 0.3, lightAt(fv[v * 3] + rnx, fv[v * 3 + 2] + rnz), fv[v * 3] + rnx, fv[v * 3 + 2] + rnz) * (fv[v * 3 + 1] > lowest + 0.01 ? 1 : 0.72);
            fc[v * 3] = fc[v * 3 + 1] = fc[v * 3 + 2] = l;
          }
          const fg2 = new THREE.BufferGeometry();
          fg2.setAttribute("position", new THREE.BufferAttribute(fv, 3));
          fg2.setAttribute("uv", new THREE.BufferAttribute(fu, 2));
          fg2.setAttribute("color", new THREE.BufferAttribute(fc, 3));
          fg2.computeVertexNormals();
          facePieces.push(fg2);
        }
      }
    }
    for (const [bucketMat, pieces] of floorBuckets) {
      if (!pieces.length) continue;
      const merged = mergeGeometries(pieces);
      for (const p of pieces) p.dispose();
      const floor = new THREE.Mesh(merged, bucketMat);
      floor.name = "floor";
      // The ONLY light that casts shadows is the flashlight (see
      // BackroomsGame) — the baked field does everything else. Carpet
      // receives, so the beam lands as a real pool with hard wall edges.
      floor.receiveShadow = true;
      group.add(floor);
    }
    if (gratePieces.length) {
      const merged = mergeGeometries(gratePieces);
      for (const p of gratePieces) p.dispose();
      const grate = new THREE.Mesh(merged, pipeGrateMat);
      grate.name = "grate";
      grate.receiveShadow = true;
      group.add(grate);
    }
    if (facePieces.length) {
      const merged = mergeGeometries(facePieces);
      for (const p of facePieces) p.dispose();
      if (wallMat.userData.tileSpan) alignTileUVs(merged, wallMat.userData.tileSpan);
      const risers = new THREE.Mesh(merged, wallMat); // papered, like a wall
      risers.name = "riser";
      risers.castShadow = true;
      risers.receiveShadow = true;
      group.add(risers);
    }
  }

  // ---- WATER (the Poolrooms) ----------------------------------------------
  // One merged surface per chunk: a quad per wet cell at its surface height
  // (a hair below the deck lip so the tile edge stays crisp), UVs in world
  // metres so the texture flows continuously across the whole pool. The
  // material is SHARED — tickWater scrolls every pool at once.
  if ((pools || ocean) && data.water) {
    const wet: THREE.BufferGeometry[] = [];
    const caustics: THREE.BufferGeometry[] = [];
    // THE WATERLINE RULE (Josh's screenshot: "the water ends prematurely —
    // make it line up to the tile properly"). Floors near a shore are RAMPS
    // (cornerFor averaging), so the true waterline — where the ramp pierces
    // the surface — falls PARTWAY through cells. Per-wet-cell quads stopped
    // on the cell boundary a half-tile early. Now the sheet also extends
    // over any DRY cell whose rendered corners dip below a neighbouring
    // surface, and the DEPTH TEST against the already-drawn floor clips the
    // plane exactly along the floor/surface intersection: the edge hugs the
    // tile ramp, not the cell grid.
    const stepsAt = (gx: number, gy: number): number | null => {
      if (gx >= data.cx * n && gy >= data.cy * n && gx < data.cx * n + n && gy < data.cy * n + n) {
        const wv = data.water?.[(gy - data.cy * n) * n + (gx - data.cx * n)];
        return wv === undefined || wv <= -128 ? null : wv;
      }
      const m = world.waterAt(gx, gy);
      return m === null ? null : Math.round(m / FLOOR_STEP);
    };
    // (pillarCellAt is hoisted above the FLOOR block — the water sheet and
    // the floor both have to run under a round column.)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const gx = data.cx * n + x;
        const gy = data.cy * n + y;
        const isPillar = data.solid[i] === 1 && pillarCellAt(gx, gy);
        if (data.solid[i] && !isPillar) continue;
        let w = stepsAt(gx, gy);
        if (w === null) {
          // A dry cell borrows the HIGHEST adjacent surface — if its ramp
          // dips under that surface, the sheet extends and the depth test
          // draws the real waterline across it. EIGHT-way: a convex corner
          // of the shoreline touches its water only diagonally, and the
          // orthogonal-only scan left a square notch bitten out of the
          // surface there (Josh's second screenshot).
          for (const [nx2, ny2] of [
            [gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1],
            [gx + 1, gy + 1], [gx - 1, gy - 1], [gx + 1, gy - 1], [gx - 1, gy + 1],
          ] as [number, number][]) {
            const nw = stepsAt(nx2, ny2);
            if (nw !== null && (w === null || nw > w)) w = nw;
          }
          if (w === null) continue;
        }
        const lvl = w * FLOOR_STEP;
        // Rendered corner heights — the same numbers the floor quad uses.
        const h00 = world.cornerFor(gx, gy, gx, gy);
        const h10 = world.cornerFor(gx, gy, gx + 1, gy);
        const h01 = world.cornerFor(gx, gy, gx, gy + 1);
        const h11 = world.cornerFor(gx, gy, gx + 1, gy + 1);
        const minH = Math.min(h00, h10, h01, h11);
        // Pillar cells always carry the sheet (the drum hides the middle,
        // the rim is where the waterline must land); dry cells only when a
        // rendered corner actually dips under the surface.
        if (!isPillar && minH >= lvl - 0.03) continue;
        const wy = lvl - 0.05;
        const wx = ox + x * CELL;
        const wz = oz + y * CELL;
        const g = new THREE.PlaneGeometry(CELL, CELL);
        g.rotateX(-Math.PI / 2);
        g.translate(wx + CELL / 2, wy, wz + CELL / 2);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        const posA = g.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < uv.count; v++) {
          uv.setXY(v, posA.getX(v) / 7.5, posA.getZ(v) / 7.5); // 7.5m per texture repeat
        }
        // ONE water everywhere (Josh: "all the same color — the shallow
        // teal is more calming"). Depth reads through the transparency and
        // the darker distance to the floor, not through a material switch.
        wet.push(g);
        // The caustic sheet rides the SUBMERGED FLOOR — built from the same
        // corner heights as the floor quad (a flat sheet floated over the
        // shore ramps), lifted a hair off the tile. Fully-submerged cells
        // only: a glow crossing the waterline onto dry tile reads wrong.
        // (Never under a pillar drum — there is no floor to glow there.)
        if (!ocean && !isPillar && Math.max(h00, h10, h01, h11) < lvl) {
          const q = floorQuad(wx, wz, CELL, h00 + 0.03, h10 + 0.03, h01 + 0.03, h11 + 0.03);
          const cg = new THREE.BufferGeometry();
          cg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(q.verts), 3));
          const cuv = new Float32Array(12);
          for (let v = 0; v < 6; v++) {
            cuv[v * 2] = q.verts[v * 3] / 5.2;
            cuv[v * 2 + 1] = q.verts[v * 3 + 2] / 5.2;
          }
          cg.setAttribute("uv", new THREE.BufferAttribute(cuv, 2));
          cg.computeVertexNormals();
          caustics.push(cg);
        }
      }
    }
    if (wet.length) {
      const merged = mergeGeometries(wet);
      for (const p of wet) p.dispose();
      const water = new THREE.Mesh(merged, ocean ? oceanWaterMat : poolWaterMat);
      water.name = "water";
      water.renderOrder = 3; // after the caustics — it's the surface
      group.add(water);
      // The ripple light rides ON the surface, two layers drifting against
      // each other. Same quads, a hair higher so they never z-fight.
      for (const [mat, lift, nm] of ocean ? [] : [
        [poolSurfMatA, 0.012, "surfRippleA"],
        [poolSurfMatB, 0.02, "surfRippleB"],
      ] as [THREE.Material, number, string][]) {
        const rip = new THREE.Mesh(merged.clone(), mat);
        rip.position.y = lift;
        rip.name = nm;
        rip.renderOrder = 4;
        group.add(rip);
      }
    }
    if (caustics.length) {
      const cMerged = mergeGeometries(caustics);
      for (const p of caustics) p.dispose();
      const ca = new THREE.Mesh(cMerged, poolCausticMatA);
      ca.name = "caustics";
      ca.renderOrder = 2;
      group.add(ca);
      const cb = new THREE.Mesh(cMerged.clone(), poolCausticMatB);
      cb.name = "caustics2";
      cb.renderOrder = 2;
      group.add(cb);
    }
  }

  /** THE SUBURBS: draw what subEdge says stands on an edge. horiz = the edge
   *  runs east-west (a wallN, cell A to the south); (cx, cz) its middle. */
  const subWall = (horiz: boolean, cx: number, cz: number, e: SubEdge): void => {
    const h = e.top - e.base;
    if (!(h > 0.01)) return;
    const T = horiz ? WALL_T_N : WALL_T_W;
    const y = e.base + h / 2;
    if (e.inSide && e.inner) {
      // two skins: the house's half of the wall wears its paper, the street's
      // half its siding (A is the +z cell of a wallN, the +x cell of a wallW)
      const half = T / 2;
      const off = (e.inSide === 1 ? 1 : -1) * (half / 2);
      m.compose(new THREE.Vector3(horiz ? cx : cx + off, y, horiz ? cz + off : cz), q, one);
      pushBox(boxGeo(horiz ? CELL : r2(half), r2(h), horiz ? r2(half) : CELL), m, wallBucket(e.inner));
      m.compose(new THREE.Vector3(horiz ? cx : cx - off, y, horiz ? cz - off : cz), q, one);
      pushBox(boxGeo(horiz ? CELL : r2(half), r2(h), horiz ? r2(half) : CELL), m, wallBucket(e.mat));
      subWindow(horiz, cx, cz, e);
      return;
    }
    m.compose(new THREE.Vector3(cx, y, cz), q, one);
    pushBox(boxGeo(horiz ? CELL : T, r2(h), horiz ? T : CELL), m, wallBucket(e.mat));
  };
  /** A HOUSE HAS WINDOWS (Nov 2026 polish round): every house was blank
   *  siding with doorway openings only, against all twenty references and
   *  the level's own relic ("every house carries one in the front window").
   *  About two outer-wall edges in five of a HOUSE (not a garage) carry a
   *  window — dark glass in a painted frame, on both faces, sill at 0.95m.
   *  Purely drawn: the wall is still a wall to everything (the map, the
   *  collision, and the Neighbourhood Watch, which sees by the server's
   *  map and nothing here). */
  const subWindow = (horiz: boolean, cx: number, cz: number, e: SubEdge): void => {
    if (e.hx === undefined || e.hy === undefined || world.typeAt(e.hx, e.hy) !== "house") return;
    const h = e.top - e.base;
    if (h < 2.5) return;
    const gx = Math.floor(cx / CELL);
    const gy = Math.floor(cz / CELL);
    if (flickerHash(gx * 5 + (horiz ? 1 : 3), gy * 11 + 7) >= 400) return;
    const T = horiz ? WALL_T_N : WALL_T_W;
    const W = 1.0;
    const H = 1.15;
    const sill = e.base + 0.95;
    const yc = sill + H / 2;
    const F = 0.07; // frame width
    for (const sgn of [1, -1]) {
      const face = sgn * (T / 2);
      const at = (along: number, up: number, out: number): THREE.Vector3 =>
        horiz ? new THREE.Vector3(cx + along, up, cz + face + sgn * out) : new THREE.Vector3(cx + face + sgn * out, up, cz + along);
      const box = (aw: number, ah: number, ad: number): THREE.BoxGeometry => (horiz ? boxGeo(r2(aw), r2(ah), r2(ad)) : boxGeo(r2(ad), r2(ah), r2(aw)));
      m.compose(at(0, yc, 0.012), q, one);
      pushBox(box(W, H, 0.024), m, wallBucket(suburbGlassMat));
      for (const [ax, ay, aw, ah] of [
        [0, sill - F / 2, W + 2 * F, F],
        [0, sill + H + F / 2, W + 2 * F, F],
        [-(W / 2 + F / 2), yc, F, H],
        [W / 2 + F / 2, yc, F, H],
        [0, yc, 0.04, H],
      ] as [number, number, number, number][]) {
        m.compose(at(ax, ay, 0.03), q, one);
        pushBox(box(aw, ah, 0.06), m, wallBucket(suburbWindowFrameMat));
      }
    }
  };
  /** An OPEN edge in the Suburbs: a doorway in a house's outer wall gets its
   *  lintel (the room's ceiling up to the eave), two lawns nothing at all.
   *  False = an opening inside a house (the ordinary fascia rule). */
  const subLintel = (horiz: boolean, cx: number, cz: number, ax: number, ay: number, bx: number, by: number): boolean => {
    const a = subCls(ax, ay);
    const b = subCls(bx, by);
    if (a === "in" && b === "in") return false;
    if (a !== "in" && b !== "in") return true;
    const hx = a === "in" ? ax : bx;
    const hy = a === "in" ? ay : by;
    const lo = world.ceilAt(hx, hy) - 0.03;
    const hi = subEave(hx, hy);
    if (!(hi - lo > 0.01)) return true;
    const T = horiz ? WALL_T_N : WALL_T_W;
    m.compose(new THREE.Vector3(cx, lo + (hi - lo) / 2, cz), q, one);
    pushBox(boxGeo(horiz ? CELL : T, r2(hi - lo), horiz ? T : CELL), m, wallBucket(subSiding(hx, hy)));
    return true;
  };
  /** A corner post in the Suburbs: as tall as the tallest thing meeting there
   *  (a fence's, the rim's, a house's eave) and dressed to match. */
  const subPost = (gvx: number, gvy: number, base: number): { top: number; mat: THREE.Material } => {
    const cells: [number, number][] = [[gvx, gvy], [gvx - 1, gvy], [gvx, gvy - 1], [gvx - 1, gvy - 1]];
    let top = base + SUB_FENCE_H;
    let mat: THREE.Material = suburbPicketMat;
    let ins = 0;
    for (const [cx, cy] of cells) {
      const k = subCls(cx, cy);
      if (k === "rim" && top < base + SUB_RIM_H) {
        top = base + SUB_RIM_H;
        mat = suburbPrivacyMat;
      } else if (k === "in") {
        ins++;
        const e = subEave(cx, cy);
        if (Number.isFinite(e) && e >= top) {
          top = e;
          mat = subSiding(cx, cy);
        }
      }
    }
    // a post wholly inside a house is an inner corner: paper to the ceiling
    if (ins === 4) return { top: Math.max(...cells.map(([cx, cy]) => world.ceilAt(cx, cy))), mat: subInner(gvx, gvy) };
    return { top, mat };
  };
  /** THE SUBURBS' ROOFS: a hip roof over every house. Each corner of a
   *  house's cells rises by how far it is from the house's edge (counted in
   *  cells, so a rectangle gets a ridge and a square a point), and each cell
   *  is two triangles split along its steeper diagonal — the hips. Number 9's
   *  sealed block gets one too. */
  const SUB_PITCH = 0.95;
  const SUB_ROOF_MAX = 3;
  const buildSuburbRoofs = (): void => {
    const distCache = new Map<number, number>();
    const S = world.mapSize;
    const dist = (gx: number, gy: number): number => {
      if (subCls(gx, gy) !== "in") return 0;
      const key = gy * S + gx;
      const hit = distCache.get(key);
      if (hit !== undefined) return hit;
      let d = SUB_ROOF_MAX + 1;
      search: for (let r = 1; r <= SUB_ROOF_MAX; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox2 = -r; ox2 <= r; ox2++) {
            if (Math.max(Math.abs(ox2), Math.abs(oy)) !== r) continue;
            if (subCls(gx + ox2, gy + oy) !== "in") {
              d = r;
              break search;
            }
          }
        }
      }
      distCache.set(key, d);
      return d;
    };
    /** A roof corner: the highest eave among the house cells touching it,
     *  raised by its distance in from the edge. */
    const corner = (vx: number, vy: number): number => {
      const cs: [number, number][] = [[vx, vy], [vx - 1, vy], [vx, vy - 1], [vx - 1, vy - 1]];
      let lvl = Infinity;
      let eave = -Infinity;
      for (const [cx, cy] of cs) {
        lvl = Math.min(lvl, dist(cx, cy));
        if (subCls(cx, cy) === "in") eave = Math.max(eave, subEave(cx, cy));
      }
      return eave + SUB_PITCH * Math.min(lvl, SUB_ROOF_MAX) + 0.02;
    };
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const vert = (px: number, py: number, pz: number): void => {
      pos.push(px, py, pz);
      uv.push(px * 0.5, (pz + py) * 0.5);
      const l = 0.36 + 1.4 * lightAt(px, pz, 0, 0);
      col.push(l, l, l);
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const gx = data.cx * n + x;
        const gy = data.cy * n + y;
        if (subCls(gx, gy) !== "in") continue;
        const h00 = corner(gx, gy);
        const h10 = corner(gx + 1, gy);
        const h01 = corner(gx, gy + 1);
        const h11 = corner(gx + 1, gy + 1);
        if (![h00, h10, h01, h11].every(Number.isFinite)) continue;
        const x0 = ox + x * CELL;
        const z0 = oz + y * CELL;
        const x1 = x0 + CELL;
        const z1 = z0 + CELL;
        // counter-clockwise from above, so the faces point up
        if (Math.abs(h00 - h11) >= Math.abs(h10 - h01)) {
          vert(x0, h00, z0); vert(x0, h01, z1); vert(x1, h11, z1);
          vert(x0, h00, z0); vert(x1, h11, z1); vert(x1, h10, z0);
        } else {
          vert(x0, h00, z0); vert(x0, h01, z1); vert(x1, h10, z0);
          vert(x1, h10, z0); vert(x0, h01, z1); vert(x1, h11, z1);
        }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const roof = new THREE.Mesh(g, suburbRoofMat);
    roof.name = "suburb-roofs";
    group.add(roof);
  };
  /** A THIN WALL BETWEEN TWO LOOKS WEARS BOTH (Nov 2026 polish round). The
   *  wall on a cell's north or west edge was one box in that cell's paper,
   *  so a panelled boardroom's north and west walls were panelled on the
   *  warrens' side too, and its south and east walls yellow paper on its
   *  own side. Where the room across the edge wears a different wall, the
   *  wall is two half-thickness skins, each in its own room's material —
   *  the Suburbs' subWall shape. (This cell is the +z side of a north wall,
   *  the +x side of a west wall.) */
  let cellWall: THREE.Material | null = null;
  const thinWall = (horiz: boolean, cx: number, cy: number, cz: number, h: number, gxO: number, gyO: number): void => {
    const T = horiz ? WALL_T_N : WALL_T_W;
    const other = perCell && cellWall ? wallMatOf(gxO, gyO) : null;
    if (!other || other === cellWall) {
      m.compose(new THREE.Vector3(cx, cy, cz), q, one);
      pushBox(boxGeo(horiz ? CELL : T, r2(h), horiz ? T : CELL), m);
      return;
    }
    const half = T / 2;
    const off = half / 2;
    m.compose(new THREE.Vector3(horiz ? cx : cx + off, cy, horiz ? cz + off : cz), q, one);
    pushBox(boxGeo(horiz ? CELL : r2(half), r2(h), horiz ? r2(half) : CELL), m);
    m.compose(new THREE.Vector3(horiz ? cx : cx - off, cy, horiz ? cz - off : cz), q, one);
    pushBox(boxGeo(horiz ? CELL : r2(half), r2(h), horiz ? r2(half) : CELL), m, wallBucket(other));
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const wx = ox + x * CELL;
      const wz = oz + y * CELL;
      const hHere = heightOf(x, y);
      const sgx = data.cx * n + x;
      const sgy = data.cy * n + y;
      if (perCell) {
        const sf = surfAt(x, y);
        cellWall = data.solid[i] ? null : sf.wall;
        wallPieces = wallBucket(sf.wall);
        const cm = sf.ceil;
        let cb = ceilBuckets.get(cm);
        if (!cb) ceilBuckets.set(cm, (cb = []));
        ceilPieces = cb;
      }

      // Per-cell ceiling at the district height (merged, per-vertex light).
      // A SKYLIGHT deco cell swaps its tile for a glowing cut — the ceiling
      // openings pouring light into the flooded halls (hq720).
      m.compose(new THREE.Vector3(wx + CELL / 2, hHere, wz + CELL / 2), ceilQ, one);
      if (pools && data.deco && (data.deco[i] >> 4) === 6) skylightCuts.push(m.clone());
      else if (ocean && world.districtTypes.get(data.district[i]) !== "seatower") {
        /* the open air: no lid, the fog is the sky */
      } else if (suburb && subCls(sgx, sgy) !== "in") {
        /* the night sky */
      } else pushCeil(m);

      const subN = suburb && data.wallN[i] ? subEdge(sgx, sgy, sgx, sgy - 1, Math.min(floorOf(x, y), floorOf(x, y - 1), edgeBaseN(x, y))) : null;
      if (subN) {
        subWall(true, wx + CELL / 2, wz, subN);
      } else if (data.wallN[i]) {
        const hN = heightOf(x, y - 1);
        // v2: walls span from the LOWER of the two floors to the HIGHER of the
        // two ceilings, so a wall between a gallery and a sunken floor closes
        // the whole gap instead of floating. `Number.isFinite`, not `> 0`:
        // deep pits have real negative ceilings (see heightOf).
        const top = Math.max(hHere, Number.isFinite(hN) ? hN : hHere);
        // The base drops to the lowest CARPET CORNER along the edge, not the
        // lowest cell floor: on a ramp the carpet corners are averaged across
        // cells and dip below floorOf, and a flat-based wall left a lit
        // triangular slot under its end (Josh's photo — the dark wedge under
        // a wall where a slope meets it).
        const base = Math.min(floorOf(x, y), floorOf(x, y - 1), edgeBaseN(x, y));
        const h = top - base;
        thinWall(true, wx + CELL / 2, base + h / 2, wz, h, sgx, sgy - 1);
        // Sprinkled baseboard trim in RUNS — consecutive selected segments
        // merge into ONE board, so lengths vary from 2m stubs to long
        // continuous runs (Josh: the uniform per-segment pieces looked too
        // segmented). Selection hashes global coords (all clients agree);
        // boards run 3cm short of their ends (flush ends z-fought doorway
        // caps) and runs break at chunk seams — reads as a joint.
        // RATE: 45% put trim on nearly every wall (Josh, round 3: "I see them
        // everywhere"). BASEBOARD_RATE is now the one dial — a rare find.
        if (!pools && !pipes) {
          const gbx = data.cx * n + x;
          const gby = data.cy * n + y;
          const sel = (cx3: number): boolean =>
            flickerHash(Math.floor(cx3 / BASEBOARD_BLOCK) * 3 + 7, gby * 5 + 11) < BASEBOARD_RATE;
          const leftIsRun = x > 0 && data.wallN[y * n + (x - 1)] === 1 && sel(gbx - 1);
          if (sel(gbx) && !leftIsRun) {
            let span = 1;
            while (x + span < n && data.wallN[y * n + (x + span)] === 1 && sel(gbx + span)) span++;
            const len = span * CELL - 0.06;
            m.compose(new THREE.Vector3(wx + len / 2 + 0.03, 0.09, wz), q, one);
            pushBox(boxGeo(r2(len), 0.18, WALL_T_N + 0.08), m, trimPieces);
          }
        }
      } else {
        // Open edge between different ceiling heights: a fascia strip fills
        // the step. It runs 3cm PAST the lower ceiling and 2cm past the
        // taller one — sharing either ceiling's exact plane z-fought where
        // the ceiling quad crossed the fascia box (Josh's "texture
        // collision" at ceiling drops); the tiny lip reads as a real
        // soffit return.
        const hN = heightOf(x, y - 1);
        if (suburb && subLintel(true, wx + CELL / 2, wz, sgx, sgy, sgx, sgy - 1)) {
          /* a doorway in a house's outer wall: its lintel, not a fascia to the sky */
        } else if (Number.isFinite(hN) && Math.abs(hN - hHere) > 0.01) {
          const lo = Math.min(hHere, hN);
          const hi = Math.max(hHere, hN);
          const fh = r2(hi - lo + 0.05);
          m.compose(new THREE.Vector3(wx + CELL / 2, lo - 0.03 + fh / 2, wz), q, one);
          pushBox(boxGeo(CELL, fh, WALL_T_N), m);
        }
      }
      const subW = suburb && data.wallW[i] ? subEdge(sgx, sgy, sgx - 1, sgy, Math.min(floorOf(x, y), floorOf(x - 1, y), edgeBaseW(x, y))) : null;
      if (subW) {
        subWall(false, wx, wz + CELL / 2, subW);
      } else if (data.wallW[i]) {
        const hW = heightOf(x - 1, y);
        const top = Math.max(hHere, Number.isFinite(hW) ? hW : hHere);
        const base = Math.min(floorOf(x, y), floorOf(x - 1, y), edgeBaseW(x, y));
        const h = top - base;
        thinWall(false, wx, base + h / 2, wz + CELL / 2, h, sgx - 1, sgy);
        if (!pools && !pipes) {
          const gbx = data.cx * n + x;
          const gby = data.cy * n + y;
          const sel = (cy3: number): boolean =>
            flickerHash(gbx * 7 + 3, Math.floor(cy3 / BASEBOARD_BLOCK) * 11 + 5) < BASEBOARD_RATE;
          const upIsRun = y > 0 && data.wallW[(y - 1) * n + x] === 1 && sel(gby - 1);
          if (sel(gby) && !upIsRun) {
            let span = 1;
            while (y + span < n && data.wallW[(y + span) * n + x] === 1 && sel(gby + span)) span++;
            const len = span * CELL - 0.06;
            m.compose(new THREE.Vector3(wx, 0.09, wz + len / 2 + 0.03), q, one);
            pushBox(boxGeo(WALL_T_W + 0.08, 0.18, r2(len)), m, trimPieces);
          }
        }
      } else {
        const hW = heightOf(x - 1, y);
        if (suburb && subLintel(false, wx, wz + CELL / 2, sgx, sgy, sgx - 1, sgy)) {
          /* a doorway in a house's outer wall */
        } else if (Number.isFinite(hW) && Math.abs(hW - hHere) > 0.01) {
          const lo = Math.min(hHere, hW);
          const hi = Math.max(hHere, hW);
          const fh = r2(hi - lo + 0.05);
          m.compose(new THREE.Vector3(wx, lo - 0.03 + fh / 2, wz + CELL / 2), q, one);
          pushBox(boxGeo(WALL_T_W, fh, CELL), m);
        }
      }
      if (data.solid[i]) {
        // The block must seal against every open cell touching it, not just
        // reach its own ceiling — see solidSpan. A solid cell's floor is
        // whatever the terrain pass left there, which can be metres below the
        // surface people walk on next to it.
        const gx0 = data.cx * n + x;
        const gy0 = data.cy * n + y;
        // PIPE DREAMS FIXTURES: a machine, tank or rack footprint is solid for
        // collision but drawn as the machine (buildPipeFixtures), standing on
        // a floor — not as a concrete column to the ceiling.
        if (pipes && pipeFixtureCell(world, gx0, gy0)) continue;
        // ROUND PILLARS (Poolrooms v3): a 2×2 solid block whose NW anchor
        // carries the pillar/spiralcore deco renders as one giant tiled
        // CYLINDER (Dream_Pool_43) instead of four boxes. Members skip their
        // box; the anchor contributes the cylinder. Colliders stay square —
        // the visual column inscribes the block.
        if (pools) {
          let anchored = false;
          for (const [ax, ay] of [[gx0, gy0], [gx0 - 1, gy0], [gx0, gy0 - 1], [gx0 - 1, gy0 - 1]] as [number, number][]) {
            const code = world.decoAt(ax, ay);
            const kindA = code >> 4;
            if (kindA !== 1 && kindA !== 7) continue;
            if (gx0 - ax > 1 || gy0 - ay > 1) continue;
            anchored = true;
            if (ax === gx0 && ay === gy0) {
              // The anchor cell draws the column, spanning the 2×2 block.
              const ccx2 = wx + CELL; // block centre (anchor is the NW cell)
              const ccz2 = wz + CELL;
              const base = Math.min(floorOf(x, y), floorOf(x + 1, y), floorOf(x, y + 1), floorOf(x + 1, y + 1),
                world.waterAt(gx0, gy0) === null ? Infinity : (world.waterAt(gx0, gy0)! - 2)) - 0.4;
              const top = hHere;
              // The drum FILLS its 2×2 collider (2.0 = the block's half
              // width): a smaller radius left a rim of invisible wall you
              // bumped into before touching the stone.
              const r = kindA === 7 ? 1.6 : 2.0;
              const cyl = new THREE.CylinderGeometry(r, r, top - base, 22, 1, false);
              // World-scale UVs: tiles wrap the drum at life size.
              const uvC = cyl.attributes.uv as THREE.BufferAttribute;
              // a WHOLE number of tiles round the drum (no sliver at the seam),
              // its rows on the world height grid like the walls'
              const round = Math.round((Math.PI * 2 * r) / POOL_TILE_M) * POOL_TILE_M;
              for (let v = 0; v < uvC.count; v++) {
                uvC.setXY(v, (uvC.getX(v) * round) / POOL_TILE_SPAN, (base + uvC.getY(v) * (top - base)) / POOL_TILE_SPAN);
              }
              cyl.translate(ccx2, base + (top - base) / 2, ccz2);
              // poolWallMat wants vertex colors — bake the light field like
              // every wall does, sampled around the drum.
              // Sampled the WALLS' way — 15cm off the face along its normal,
              // lit side and shadow side — not the old omni sample, which lit
              // every column brighter than the walls round it.
              const pC = cyl.attributes.position as THREE.BufferAttribute;
              const nC = cyl.attributes.normal as THREE.BufferAttribute;
              const colC = new Float32Array(pC.count * 3);
              for (let v = 0; v < pC.count; v++) {
                const nxv = nC.getX(v);
                const nzv = nC.getZ(v);
                const sx = pC.getX(v) + nxv * 0.15;
                const sz = pC.getZ(v) + nzv * 0.15;
                const l = lum(0.89, 0.3, lightAt(sx, sz, nxv, nzv), sx, sz);
                colC[v * 3] = colC[v * 3 + 1] = colC[v * 3 + 2] = l;
              }
              cyl.setAttribute("color", new THREE.BufferAttribute(colC, 3));
              pillarGeos.push(cyl);
            }
            break;
          }
          if (anchored) continue;
        }
        const nbrs: { floor: number; ceil: number }[] = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          if (world.solidAt(gx0 + dx, gy0 + dy)) continue; // solid or unloaded
          // The neighbour's floor along OUR shared edge is its carpet
          // CORNERS there, which dip below its flat floorOf on ramps —
          // same wedge-under-the-wall class as the wall bases.
          const vs: [number, number][] =
            dx === 1 ? [[gx0 + 1, gy0], [gx0 + 1, gy0 + 1]]
            : dx === -1 ? [[gx0, gy0], [gx0, gy0 + 1]]
            : dy === 1 ? [[gx0, gy0 + 1], [gx0 + 1, gy0 + 1]]
            : [[gx0, gy0], [gx0 + 1, gy0]];
          const nf = Math.min(
            floorOf(x + dx, y + dy),
            world.cornerFor(gx0 + dx, gy0 + dy, vs[0][0], vs[0][1]),
            world.cornerFor(gx0 + dx, gy0 + dy, vs[1][0], vs[1][1]),
          );
          nbrs.push({ floor: nf, ceil: heightOf(x + dx, y + dy) });
        }
        // THE SUBURBS: the map's rim is a privacy fence and Number 9 is a
        // house you never go into — neither runs up to the open air's 40m.
        if (suburb) {
          const sb = Math.min(floorOf(x, y), ...nbrs.map((v) => v.floor));
          const block = subCls(gx0, gy0) === "in";
          const st = block ? subEave(gx0, gy0) : sb + SUB_RIM_H;
          if (st - sb > 0.01) {
            m.compose(new THREE.Vector3(wx + CELL / 2, sb + (st - sb) / 2, wz + CELL / 2), q, one);
            pushBox(boxGeo(CELL, r2(st - sb), CELL), m, wallBucket(block ? subBrick : suburbPrivacyMat));
          }
          continue;
        }
        // THE SEA's RIM: the map's edge cells are solid tower-typed cells, so
        // each stood 3m out of the water in the tower's wall look — a beige
        // band round the whole horizon (Nov 2026 polish round). "Water to the
        // fog in every direction": a rim block beside the sea stops under the
        // surface (collision is the server's; the block is only drawn).
        if (ocean && (gx0 === 0 || gy0 === 0 || gx0 === world.mapSize - 1 || gy0 === world.mapSize - 1)) {
          let sea = Infinity;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
            const wl = world.waterAt(gx0 + dx, gy0 + dy);
            if (wl !== null) sea = Math.min(sea, wl);
          }
          if (sea !== Infinity) {
            const sb = Math.min(floorOf(x, y), ...nbrs.map((v) => v.floor));
            const st = sea - 0.3;
            if (st - sb > 0.01) {
              m.compose(new THREE.Vector3(wx + CELL / 2, sb + (st - sb) / 2, wz + CELL / 2), q, one);
              pushBox(boxGeo(CELL, r2(st - sb), CELL), m);
            }
            continue;
          }
        }
        const span = solidSpan(floorOf(x, y), hHere, nbrs);
        const bh = span.top - span.base;
        m.compose(new THREE.Vector3(wx + CELL / 2, span.base + bh / 2, wz + CELL / 2), q, one);
        pushBox(boxGeo(CELL, r2(bh), CELL), m);
      }
      // Perimeter closure: the generator only walls the map's north/west
      // edges — synthesize the south/east boundary so the sector never
      // shows raw void (Josh's "missing textures on the boundary wall").
      // Bases dip to the carpet corners like every other wall (ramps).
      const gxCell = data.cx * n + x;
      const gyCell = data.cy * n + y;
      // (the sea has no closure: its rim is solid and sits under the water)
      if (gyCell === world.mapSize - 1 && !ocean) {
        const fb = Math.min(
          floorOf(x, y),
          world.cornerFor(gxCell, gyCell, gxCell, gyCell + 1),
          world.cornerFor(gxCell, gyCell, gxCell + 1, gyCell + 1),
        );
        const pt = suburb ? fb + SUB_RIM_H : hHere;
        m.compose(new THREE.Vector3(wx + CELL / 2, fb + (pt - fb) / 2, wz + CELL), q, one);
        pushBox(boxGeo(CELL, r2(pt - fb), WALL_T_N), m, suburb ? wallBucket(suburbPrivacyMat) : wallPieces);
      }
      if (gxCell === world.mapSize - 1 && !ocean) {
        const fb = Math.min(
          floorOf(x, y),
          world.cornerFor(gxCell, gyCell, gxCell + 1, gyCell),
          world.cornerFor(gxCell, gyCell, gxCell + 1, gyCell + 1),
        );
        const pt = suburb ? fb + SUB_RIM_H : hHere;
        m.compose(new THREE.Vector3(wx + CELL, fb + (pt - fb) / 2, wz + CELL / 2), q, one);
        pushBox(boxGeo(WALL_T_W, r2(pt - fb), CELL), m, suburb ? wallBucket(suburbPrivacyMat) : wallPieces);
      }
      // The endless panel grid: one fixture per 2×2 cells, sized exactly
      // two ceiling tiles and SNAPPED to the T-bar grid — width on the
      // middle tile column, length spanning two whole tiles toward a
      // verified-open edge (fixture edges land on grid lines, like a real
      // drop ceiling). A fixture NEVER sits against a wall (Josh's rule):
      // its long axis must have wall-free edges — default north-south, else
      // turned east-west to run along a corridor, else no light here.
      // Chunk-boundary cells can't see the neighbor's edge and
      // conservatively skip that orientation — deterministic for everyone.
      // ~2.5% of eligible panels flicker, deterministic by position.
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      // The Poolrooms thin the troffer grid to a QUARTER (the reference
      // halls glow from sparse skylights and the water, not an office
      // ceiling) — Level 0 keeps its endless panel field.
      const spot = fixtures.get(i);
      // a room with a Lights setting on the Poolrooms shows every lamp it kept
      const cellStyle = styleIn(x, y);
      if (spot && !dark && (!pools || cellStyle?.lights !== undefined || (((gx >> 1) & 1) === 0 && ((gy >> 1) & 1) === 0))) {
        const orient = spot.isNS ? panelQ : panelQEW;
        const px = spot.px;
        const pz = spot.pz;
        // one in forty flickers, unless the room says otherwise (the office
        // rolls its own: the map says which troffers flicker and which are dead)
        const flickShare = cellStyle?.flicker !== undefined ? cellStyle.flicker / 100 : pools ? 0 : 0.025;
        if ((office || carpet) && spot.dead) {
          m.compose(new THREE.Vector3(px, hHere - 0.02, pz), orient, one);
          deadPanels.push(m.clone());
          // grey plastic lit only by what reaches it, like the tile round it
          // (Nov 2026 polish round — at full scene light a dead panel was a
          // pale rectangle on a dark ceiling)
          // Level 0's diffusers are off-white, the office's grey: the shared
          // grey plastic is lifted for the Lobby so a dead one reads as a
          // panel, not a hole in the ceiling
          const dl = Math.min(1, lum(0.9, 0.32, lightAt(px, pz), px, pz) / (carpet ? 0.9 : 1)) * (carpet ? 1.9 : 1);
          deadPanelCols.push(new THREE.Color(dl, dl, dl));
        } else if (office ? !!spot.flick : flickerHash(gx, gy) < flickShare * 1000) {
          const fmat = (office ? officePanel() : panelMat).clone() as THREE.MeshBasicMaterial;
          const fmesh = new THREE.Mesh(panelGeo, fmat);
          fmesh.position.set(px, hHere - 0.02, pz);
          fmesh.quaternion.copy(orient);
          group.add(fmesh);
          const list = world.flickers.get(k) ?? [];
          list.push({
            mat: fmat,
            pools: [],
            phase: (flickerHash(gx * 7 + 1, gy * 3 + 1) / 1000) * 6,
            nextAt: 0,
            dark: false,
            px,
            pz,
          });
          world.flickers.set(k, list);
        } else {
          m.compose(new THREE.Vector3(px, hHere - 0.02, pz), orient, one);
          panels.push(m.clone());
        }
      }
    }
  }

  const addInstanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    mats: THREE.Matrix4[],
    colors?: THREE.Color[],
  ): THREE.InstancedMesh | null => {
    if (!mats.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((mx, idx) => mesh.setMatrixAt(idx, mx));
    if (colors) {
      colors.forEach((c, idx) => mesh.setColorAt(idx, c));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Instance matrices carry WORLD positions while the mesh sits at the
    // origin, so the sphere culling reads must be built from the INSTANCES
    // (the geometry's own is a 2m ball at the map's corner, which once culled
    // a whole chunk's walls). Built once — these matrices never move.
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  // Corner posts — at TRUE L-BENDS ONLY (exactly one wall per axis at the
  // vertex): that's the one junction with an exposed corner notch. At T and
  // X junctions the through-wall buries the branch's end cap, and a post
  // there stands 1cm proud of the flat face — Josh's "invisible wall
  // catching the light" was exactly that band, visible on the flat side,
  // hidden behind the crossing wall from the other. Cross-chunk lookups
  // keep seams honest; a vertex is OWNED by the chunk whose local (vx, vy)
  // cell contains it, so two chunks never double-post a seam vertex.
  for (let vy = 0; vy < n; vy++) {
    for (let vx = 0; vx < n; vx++) {
      const gvx = data.cx * n + vx;
      const gvy = data.cy * n + vy;
      const ewCount = (world.wallNAt(gvx, gvy) ? 1 : 0) + (world.wallNAt(gvx - 1, gvy) ? 1 : 0);
      const nsCount = (world.wallWAt(gvx, gvy) ? 1 : 0) + (world.wallWAt(gvx, gvy - 1) ? 1 : 0);
      if (ewCount !== 1 || nsCount !== 1) continue;
      // isFinite, not > 0: NaN is "unloaded" and a deep pit's ceiling is a
      // real negative number (see heightOf).
      const hs = [
        heightOf(vx, vy),
        heightOf(vx - 1, vy),
        heightOf(vx, vy - 1),
        heightOf(vx - 1, vy - 1),
      ].filter((v) => Number.isFinite(v));
      const top = hs.length ? Math.max(...hs) : WALL_H;
      // v2: a post runs from the LOWEST floor it touches to the highest
      // ceiling, so it never hangs in the air over a step — and on ramps it
      // chases the carpet CORNER at its own vertex, which dips below the
      // cell floors (same rule as the wall bases).
      let base = Math.min(
        floorOf(vx, vy),
        floorOf(vx - 1, vy),
        floorOf(vx, vy - 1),
        floorOf(vx - 1, vy - 1),
      );
      for (const [ccx, ccy] of [[gvx, gvy], [gvx - 1, gvy], [gvx, gvy - 1], [gvx - 1, gvy - 1]] as [number, number][]) {
        if (world.solidAt(ccx, ccy)) continue;
        base = Math.min(base, world.cornerFor(ccx, ccy, gvx, gvy));
      }
      const sp = suburb ? subPost(gvx, gvy, base) : null;
      const ph = (sp ? sp.top : top) - base;
      if (ph <= 0.01) continue;
      const pxv = ox + vx * CELL;
      const pzv = oz + vy * CELL;
      m.compose(new THREE.Vector3(pxv, base + ph / 2, pzv), q, one);
      // a post wears the wall of the cell it stands in
      if (sp) wallPieces = wallBucket(sp.mat);
      else if (perCell) wallPieces = wallBucket(surfAt(Math.min(vx, n - 1), Math.min(vy, n - 1)).wall);
      pushBox(boxGeo(POST_T, r2(ph), POST_T), m);
    }
  }

  for (const [bucketMat, pieces] of wallBuckets) {
    if (!pieces.length) continue;
    const merged = mergeGeometries(pieces);
    for (const p of pieces) p.dispose();
    if (bucketMat.userData.tileSpan) alignTileUVs(merged, bucketMat.userData.tileSpan);
    const wallsMesh = new THREE.Mesh(merged, bucketMat);
    wallsMesh.name = "wall";
    // (Frustum culling stays ON for every chunk mesh: the merged geometry is
    // in world space, so its own bounding sphere is the chunk's, and both the
    // camera and the torch's shadow pass skip a chunk that isn't in view.)
    // Walls block the flashlight — a torch beam must not glow through
    // drywall into the next room (the only way anyone but you could ever
    // "see" your light).
    wallsMesh.castShadow = true;
    wallsMesh.receiveShadow = true;
    group.add(wallsMesh);
  }
  if (trimPieces.length) {
    // The painted baseboards: one merged mesh per chunk, its own enamel
    // material, same baked light as the wall above it.
    const tMerged = mergeGeometries(trimPieces);
    for (const p of trimPieces) p.dispose();
    const trimMesh = new THREE.Mesh(tMerged, trimMat);
    trimMesh.name = "trim";
    trimMesh.castShadow = true;
    trimMesh.receiveShadow = true;
    group.add(trimMesh);
  }
  if (pillarGeos.length) {
    // The round columns — same glazed tile + baked light as the walls.
    const pMerged = mergeGeometries(pillarGeos);
    for (const p of pillarGeos) p.dispose();
    const pMesh = new THREE.Mesh(pMerged, poolWallMat);
    pMesh.name = "pillars";
    pMesh.castShadow = true;
    pMesh.receiveShadow = true;
    group.add(pMesh);
  }
  if (skylightCuts.length) addInstanced(ceilGeo, poolSkylightMat, skylightCuts);

  // ---- THE KIT (Poolrooms v3 deco) ------------------------------------------
  // Arches, circle portals, portholes, cubbies, bridges, ladders — collected
  // per cell here, attached ASYNC once the FBX kit is decoded (guarded: a
  // pruned chunk never gets late meshes).
  if (pools && data.deco) {
    const placements: { piece: string; mx: THREE.Matrix4 }[] = [];
    const put = (piece: string, px: number, py: number, pz: number, rotY: number, sx = 1, sy = 1, sz = 1): void => {
      const mx = new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
        new THREE.Vector3(sx, sy, sz),
      );
      placements.push({ piece, mx });
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const code = data.deco[i];
        if (!code || data.solid[i]) continue;
        const kind = code >> 4;
        const variant = code & 15;
        const gx = data.cx * n + x;
        const gy = data.cy * n + y;
        const cxw = ox + x * CELL + CELL / 2;
        const czw = oz + y * CELL + CELL / 2;
        const fl = floorOf(x, y);
        const wl = world.waterAt(gx, gy);
        const ceilH = heightOf(x, y);
        switch (kind) {
          case 2: {
            // A REAL masonry arch (unit geometry: span 2, height 1.5, legs
            // below the spring). Over water the legs plant BELOW the
            // surface; a doorway arch spans slightly wider than its 2-cell
            // gap so both ends sit buried in the flanking walls. Nothing
            // floats, nothing is paper.
            // Same rule the colliders use — an arch that belongs to nothing
            // isn't drawn either.
            if (!archBelongs(world, gx, gy, variant !== 1)) break;
            // AN ARCH BETWEEN TWO DRUMS ISN'T DRAWN (Nov 2026 polish round).
            // The Arcades put arches in the one-cell gaps between 4m round
            // pillars; an arch sized to its cell had its legs and half its
            // shell buried in the curving drums, which read as a half-shell
            // growing out of each column. Its drums sit a metre off its axis
            // and curve away across its depth, so no span lands on both — the
            // colonnade of drums is what reads. (The deco stays: it is hashed
            // into the map, and its leg colliders are inside the drums.)
            {
              const sX = variant !== 1;
              const drum = (s: number): boolean => {
                const fx = sX ? gx + s : gx;
                const fy = sX ? gy : gy + s;
                return world.solidAt(fx, fy) && pillarCellAt(fx, fy);
              };
              if (drum(-1) && drum(1)) break;
            }
            const overWater = wl !== null;
            const base = overWater ? wl - 1.0 : fl - 0.25;
            const room = Math.max(3.0, (Number.isFinite(ceilH) ? ceilH : 8) - base);
            const half = overWater ? 2.5 : 2.35; // half-span in metres
            const rise = Math.min(1.15, (room * 0.72) / (half * 1.5));
            const depth = overWater ? 2.0 : 1.15;
            put("Archway", cxw, base, czw, variant === 1 ? Math.PI / 2 : 0, half, half * rise, depth);
            break;
          }
          case 3: {
            // The full-circle portal — the TUNNEL ring (a complete circle
            // with a flat waterline base, Poolrooms-3's nested rings). Native
            // 3.73w × 2.81h; scaled so the ring spans the nave and its rim
            // dips to the channel.
            const base = fl - 0.12;
            const room = (Number.isFinite(ceilH) ? ceilH : 9) - base;
            // The ring is unit-radius with its base at y=0, so the vertical
            // scale IS the radius: half the headroom, capped so it never
            // swallows a whole hall. DEPTH IS NOT SCALED — it is a fixed
            // 1.7m bore, or a big ring would become a tunnel you row through
            // for four metres.
            const s = Math.max(1.6, Math.min(room / 2, 5.2));
            // variant 1 = the passage runs E/W → the ring's PLANE faces it.
            put("Wall_Circle_wide_tunnel", cxw, base, czw, variant === 1 ? Math.PI / 2 : 0, s, s, 1);
            break;
          }
          case 4: {
            // Porthole panel flush against the wall on side `variant`.
            if (!backedOn(world, gx, gy, variant)) break;
            const off = CELL / 2 - 0.28;
            const dx = variant === 1 ? off : variant === 3 ? -off : 0;
            const dz = variant === 0 ? -off : variant === 2 ? off : 0;
            put("Wall_CircleHole", cxw + dx, fl, czw + dz, variant % 2 === 0 ? 0 : Math.PI / 2, 0.9, 0.9, 0.9);
            break;
          }
          case 5: {
            // Bridge deck — the kit slab tops out AT the (raised) floor.
            put("Bridge_center", cxw, fl - 0.18, czw, variant === 1 ? Math.PI / 2 : 0);
            // Railings along both open edges of the span.
            const along = variant === 1 ? Math.PI / 2 : 0;
            const rx = variant === 1 ? CELL / 2 - 0.08 : 0;
            const rz = variant === 1 ? 0 : CELL / 2 - 0.08;
            put("Railing_straight", cxw - rx, fl, czw - rz, along, 2, 1, 1);
            put("Railing_straight", cxw + rx, fl, czw + rz, along, 2, 1, 1);
            break;
          }
          case 8: {
            // Tiled cubby bench against the wall — IF there is a wall. The
            // generator picks bench spots by hall geometry and never checked
            // for backing, so a bench could end up mounted on open air: a
            // notched panel standing in the middle of the floor that you walk
            // straight through (Josh's screenshot). Checked here rather than
            // in worldgen because the deco layer is purely visual — fixing it
            // client-side costs no fingerprint and no map reset.
            const mount = benchMount(world, gx, gy, variant);
            if (!mount) break;
            const off = CELL / 2 - 0.22;
            const dx = mount.side === 1 ? off : mount.side === 3 ? -off : 0;
            const dz = mount.side === 0 ? -off : mount.side === 2 ? off : 0;
            // Hung on the wall benchMount found, which may be a cell or two
            // over from where the generator marked it.
            // Global coords throughout: the wall it belongs on can be in the
            // next chunk over, where floorOf's chunk-local index would be
            // meaningless.
            const bx = (mount.x + 0.5) * CELL;
            const bz = (mount.y + 0.5) * CELL;
            put("Wall_wCubby", bx + dx, world.groundAt(mount.x + 0.5, mount.y + 0.5), bz + dz,
              mount.side % 2 === 0 ? 0 : Math.PI / 2, 0.8, 0.8, 0.8);
            break;
          }
          case 10: {
            // A tall window flush on the wall on side `variant`, facing in,
            // its sill 0.9m off the floor — if there is a wall to hang it on.
            if (!backedOn(world, gx, gy, variant)) break;
            const off = CELL / 2 - 0.06;
            const dx = variant === 1 ? off : variant === 3 ? -off : 0;
            const dz = variant === 0 ? -off : variant === 2 ? off : 0;
            const rotY = variant === 0 ? 0 : variant === 2 ? Math.PI : variant === 1 ? -Math.PI / 2 : Math.PI / 2;
            put("WindowSky", cxw + dx, fl + 0.9, czw + dz, rotY);
            put("WindowFrame", cxw + dx, fl + 0.9, czw + dz, rotY);
            break;
          }
          case 9: {
            // Chrome ladder over the lip on side `variant` (into the water).
            const off = CELL / 2 - 0.05;
            const dx = variant === 1 ? off : variant === 3 ? -off : 0;
            const dz = variant === 0 ? -off : variant === 2 ? off : 0;
            const rotY = variant === 0 ? Math.PI : variant === 1 ? -Math.PI / 2 : variant === 2 ? 0 : Math.PI / 2;
            put("Ladder", cxw + dx, fl + 0.55, czw + dz, rotY);
            break;
          }
          default:
            break;
        }
      }
    }
    if (placements.length) {
      void loadPoolKit().then((kit) => {
        if (world.meshes.get(k) !== group) return; // chunk pruned meanwhile
        const byPiece = new Map<string, THREE.Matrix4[]>();
        for (const p of placements) {
          const list = byPiece.get(p.piece) ?? [];
          list.push(p.mx);
          byPiece.set(p.piece, list);
        }
        for (const [nm, mats] of byPiece) {
          const piece = kit.get(nm);
          if (!piece) continue;
          const mesh = new THREE.InstancedMesh(piece.geo, piece.mat, mats.length);
          mats.forEach((mx, idx2) => mesh.setMatrixAt(idx2, mx));
          if (piece.mat === poolKitTileMat) {
            // each copy wears the light of the room it stands in, as the
            // merged walls do per vertex — unlit, an arch in the dim Deep
            // glowed like the sunlit baths
            const c = new THREE.Color();
            mats.forEach((mx, idx2) => {
              const px = mx.elements[12];
              const pz = mx.elements[14];
              let l = lum(0.89, 0.3, lightAt(px, pz), px, pz) * 0.88;
              if (nm === "Wall_CircleHole" || nm === "Wall_wCubby") {
                // A WALL PIECE TAKES ITS WALL'S LIGHT (Nov 2026 polish round):
                // read omni at its middle, a porthole or cubby came out paler
                // than the wall face round it — a sticker, not part of the
                // wall. It samples the face's way: off the face, facing the
                // room (its local z, whichever way the open floor is).
                let nx = mx.elements[8];
                let nz = mx.elements[10];
                const nl = Math.hypot(nx, nz) || 1;
                nx /= nl;
                nz /= nl;
                if (world.solidAt(Math.floor((px + nx * CELL) / CELL), Math.floor((pz + nz * CELL) / CELL))) {
                  nx = -nx;
                  nz = -nz;
                }
                const sx = px + nx * 0.15;
                const sz = pz + nz * 0.15;
                l = lum(0.89, 0.3, lightAt(sx, sz, nx, nz), sx, sz) * 0.88;
              }
              mesh.setColorAt(idx2, c.setRGB(l, l, l));
            });
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          }
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere(); // the instances' sphere, not the piece's
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.name = `kit:${nm}`;
          mesh.userData.shared = true; // pruning must not dispose the kit geo
          group.add(mesh);
        }
      });
    }
  }

  for (const [bucketMat, pieces] of ceilBuckets) {
    if (!pieces.length) continue;
    const cMerged = mergeGeometries(pieces);
    for (const p of pieces) p.dispose();
    const ceilMesh = new THREE.Mesh(cMerged, bucketMat);
    ceilMesh.name = "ceiling";
    group.add(ceilMesh);
  }
  for (const g of geoCache.values()) g.dispose(); // templates — clones own their data
  const panelMesh = addInstanced(panelGeo, pools ? poolSkylightMat : office ? officePanel() : panelMat, panels);
  if (deadPanels.length) addInstanced(panelGeo, DEAD_PANEL_MAT, deadPanels, deadPanelCols);
  if (dark && bulbs.length) {
    // EVERY LIGHT IS A FIXTURE (Josh, Sep 2026 — a law: "never do lights like
    // this … all lighting must come from a light source asset", over a snip of
    // the bare orange sphere that used to hang here). Each lamp is the prop
    // kit's caged bulkhead lamp, face down against the ceiling, instanced;
    // a dead one wears the same fixture with its glass gone dark. Until the
    // model has loaded the chunk simply has no lamps — its arrival rebuilds
    // every Pipe Dreams chunk (PIPE_LAMP_KIND in the game's prop hook).
    const lamp = loadProp(PIPE_LAMP_KIND);
    if (lamp) {
      const lit: THREE.Matrix4[] = [];
      const dark: THREE.Matrix4[] = [];
      const face = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -0.099, 0));
      for (const b of bulbs) {
        const top = heightOf(b.x, b.y);
        if (!Number.isFinite(top)) continue;
        const turn = ((b.x * 7 + b.y * 13) & 1) * (Math.PI / 2); // not every cage along the same axis
        const mb = new THREE.Matrix4()
          .makeTranslation(ox + b.x * CELL + CELL / 2, top - 0.075, oz + b.y * CELL + CELL / 2)
          .multiply(new THREE.Matrix4().makeRotationY(turn))
          .multiply(face);
        (b.dead ? dark : lit).push(mb);
      }
      instanceFixture(lamp, lit, false, group);
      instanceFixture(lamp, dark, true, group);
    }
  }
  if (station) buildStationHazards(world, data, group, ox, oz, n, floorOf);
  if (office) buildOfficeWindows(data, group, ox, oz, n, floorOf);
  if (hotel) buildHotelFixtures(group, ox, oz, hotelLamps, hotelSconces, floorOf, heightOf);
  if (ocean) buildLightsFixtures(group, ox, oz, lightsLamps, heightOf, false);
  if (suburb) {
    buildSuburbFixtures(group, ox, oz, subLamps, floorOf);
    buildSuburbRoofs();
  }
  if (cave) {
    buildLightsFixtures(group, ox, oz, caveLit, heightOf, false);
    buildLightsFixtures(group, ox, oz, caveDead, heightOf, true);
    buildLightsWater(world, data, group, ox, oz, n, floorOf, CAVE_WET_SET);
  }
  if (lights) {
    buildLightsFixtures(group, ox, oz, lightsLamps, heightOf);
    buildLightsWater(world, data, group, ox, oz, n, floorOf);
  }
  // Furniture and runs sit in exactly the light the walls do: the chunk's own
  // curve (lum), not a copy of it — a copy is what left Pipe Dreams' pipes at
  // the old brightness when its lamps were raised (Oct 2026).
  const shadeAt = (e: number, x: number, z: number): number => Math.min(3, lum(0, 0, e, x, z));
  if (station) {
    // CONDUIT along the walls and the serviceways' ceilings (law 8's reference
    // task: every corridor in the set carries conduit and cable) — the pipe
    // builder with the Station's profile, plain galvanized steel.
    for (const mesh of buildPipeRuns(world, data.cx, data.cy, n, (px, pz) => lightAt(px, pz), STATION_CONDUIT_MAT, STATION_RUN_PROFILE, shadeAt)) {
      mesh.name = "station:conduit";
      group.add(mesh);
    }
  }
  if (pipes) {
    // Every machine, tank, rack and piece of furniture the generator placed,
    // lit by this chunk's baked field; railings on every drop. Their
    // colliders join the chunk's props (replacing any from a previous build
    // of the same chunk).
    const fx = buildPipeFixtures(world, data.cx, data.cy, n, (px, pz) => lightAt(px, pz), shadeAt);
    for (const mesh of fx.meshes) group.add(mesh);
    // THE PIPE RUNS along the walls and ceilings (law 8's reference task),
    // in the kit pipe's own material once it has loaded (PIPE_RUN_KIND in
    // the game's prop hook rebuilds the chunks when it arrives).
    const kitPipe = loadProp(PIPE_RUN_KIND);
    let kitMat: THREE.Material | null = null;
    kitPipe?.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!kitMat && (o as THREE.Mesh).isMesh) kitMat = Array.isArray(m) ? m[0] : m;
    });
    for (const mesh of buildPipeRuns(world, data.cx, data.cy, n, (px, pz) => lightAt(px, pz), kitMat, PIPE_RUN_PROFILE, shadeAt)) group.add(mesh);
    data.props = [
      ...(data.props ?? []).filter((p) => p.kind !== "pipes"),
      ...fx.colliders.map((c) => ({ ...c, kind: "pipes", rot: 0 })),
    ];
  }
  if (panelMesh) {
    world.panelFlick.set(k, {
      mesh: panelMesh,
      pos: panels.map((mx) => [mx.elements[12], mx.elements[14]] as [number, number]),
      touched: false,
    });
  } else {
    world.panelFlick.delete(k);
  }

  // FURNITURE: clones of the shared models, standing on the floor height of
  // their own cell. SOLID — the collider is `pr.r`, handled in controller.ts;
  // placement guarantees no prop can ever seal the only route (props.ts).
  // Each one takes the light of the spot it stands on, as the walls round it
  // do (Nov 2026 polish round — see shadedMat). The sample is pulled a hand
  // toward its cell's middle so a picture on a wall reads this side of it;
  // Level 0 and the Poolrooms' wall curve sits at 0.89 in a lit room, so it
  // is read as "as lit" there and a bright room's furniture is unchanged.
  const lumFull = carpet || pools ? 0.89 : 1;
  // (Lights Out too: its cut ambient keeps a prop out of the black without a
  // torch, and this keeps one in the beam as dim as the wall behind it.)
  const propBatches = new Map<string, { model: THREE.Object3D; mats: THREE.Matrix4[]; light: number[] }>();
  const propLight = (px: number, py: number): number => {
    const ccx = (Math.floor(px) + 0.5) * CELL;
    const ccz = (Math.floor(py) + 0.5) * CELL;
    const sx = px * CELL + (ccx - px * CELL) * 0.25;
    const sz = py * CELL + (ccz - py * CELL) * 0.25;
    const fy = floorOf(Math.floor(px) - data.cx * n, Math.floor(py) - data.cy * n) + 0.5;
    return Math.min(1, lum(0.89, 0.3, lightAt(sx, sz), sx, sz, fy) / lumFull);
  };
  for (const pr of data.props ?? []) {
    // a SIGN is drawn, not loaded (signs.ts): its words ride the placement
    if (pr.kind.startsWith("kit:sign-")) {
      const sign = makeSign(pr.kind.slice(4), pr.text ?? "");
      sign.position.set(pr.x * CELL, floorOf(Math.floor(pr.x) - data.cx * n, Math.floor(pr.y) - data.cy * n) + (pr.z ?? 0), pr.y * CELL);
      sign.rotation.set(pr.pitch ?? 0, pr.rot, pr.roll ?? 0, "YXZ");
      // a sign's materials are its own (signs.ts makes them per sign), so its
      // shade is set on them directly
      const sf = (propShadeStep(propLight(pr.x, pr.y)) / PROP_SHADE_STEPS) ** 2;
      if (sf < 1) {
        sign.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const mt of new Set(Array.isArray(mesh.material) ? mesh.material : [mesh.material])) (mt as THREE.MeshStandardMaterial).color?.multiplyScalar(sf);
        });
      }
      sign.traverse((o) => mergeGroupsByMaterial(o as THREE.Mesh));
      group.add(sign);
      continue;
    }
    // a SHAPE is drawn too (shapes.ts): its size, surface and colour ride
    // the placement
    if (pr.kind.startsWith("kit:shape-")) {
      const sh = makeShape(pr.kind.slice(4), { sx: pr.sx ?? 1, sy: pr.sy ?? 1, sz: pr.sz ?? 1, tex: pr.tex, col: pr.col }, shapeSurface);
      sh.position.set(pr.x * CELL, floorOf(Math.floor(pr.x) - data.cx * n, Math.floor(pr.y) - data.cy * n) + (pr.z ?? 0), pr.y * CELL);
      sh.rotation.set(pr.pitch ?? 0, pr.rot, pr.roll ?? 0, "YXZ");
      // A shape's surfaces carry vertex colour like the walls', so it takes
      // the light per VERTEX, the walls' way (15cm off the face): a 16m
      // platform edge or a tree runs through dark and light (Nov 2026 polish
      // round — shapes were baked at 1, lit as if under a lamp).
      sh.updateMatrixWorld(true);
      sh.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const pa = mesh.geometry.attributes.position as THREE.BufferAttribute;
        const na = mesh.geometry.attributes.normal as THREE.BufferAttribute;
        const ca = mesh.geometry.attributes.color as THREE.BufferAttribute | undefined;
        if (!ca || !na) return;
        const wv = new THREE.Vector3();
        const wn = new THREE.Vector3();
        const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        for (let v = 0; v < pa.count; v++) {
          wv.fromBufferAttribute(pa, v).applyMatrix4(mesh.matrixWorld);
          wn.fromBufferAttribute(na, v).applyMatrix3(nm).normalize();
          const sx = wv.x + wn.x * 0.15;
          const sz = wv.z + wn.z * 0.15;
          const l = Math.min(1, lum(0.89, 0.3, lightAt(sx, sz, wn.x, wn.z), sx, sz, wv.y) / lumFull);
          ca.setXYZ(v, l, l, l);
        }
        ca.needsUpdate = true;
      });
      group.add(sh);
      continue;
    }
    const model = loadProp(pr.kind);
    if (!model) continue; // still loading — the rebuild hook brings it back
    const cx = Math.floor(pr.x);
    const cy = Math.floor(pr.y);
    const py = floorOf(cx - data.cx * n, cy - data.cy * n) + (pr.z ?? 0);
    if (instanceable(pr.kind, model)) {
      // a still kit prop joins its kind's batch for this chunk (drawn below)
      let b = propBatches.get(pr.kind);
      if (!b) propBatches.set(pr.kind, (b = { model, mats: [], light: [] }));
      PROP_E.set(pr.pitch ?? 0, pr.rot, pr.roll ?? 0, "YXZ");
      b.mats.push(new THREE.Matrix4().compose(PROP_P.set(pr.x * CELL, py, pr.y * CELL), PROP_Q.setFromEuler(PROP_E), model.scale));
      b.light.push((propShadeStep(propLight(pr.x, pr.y)) / PROP_SHADE_STEPS) ** 2);
      continue;
    }
    // a skinned copy needs its own bones (an "open" door that kept its skin);
    // everything else clones plainly, sharing geometry and materials
    const inst = model.userData.skinned ? cloneSkeleton(model) : model.clone(true);
    inst.position.set(pr.x * CELL, py, pr.y * CELL);
    inst.rotation.set(pr.pitch ?? 0, pr.rot, pr.roll ?? 0, "YXZ");
    inst.userData.shared = true;
    shadeProp(inst, propShadeStep(propLight(pr.x, pr.y)));
    group.add(inst);
    const clip = kitOpenClip.get(pr.kind);
    if (clip) {
      const mixer = new THREE.AnimationMixer(inst);
      const action = mixer.clipAction(clip);
      action.clampWhenFinished = true;
      action.setLoop(THREE.LoopOnce, 1);
      action.play();
      mixer.setTime(0);
      ((group.userData.swing ??= []) as SwingDoor[]).push({ mixer, x: pr.x, y: pr.y, t: 0, dur: clip.duration });
    }
  }
  // STILL KIT PROPS ARE INSTANCED (Nov 2026 polish round, law 9): every copy of
  // one model in a chunk is one InstancedMesh per part, not one mesh per copy —
  // the Hotel's corridor doors (six parts each) took a boiler-room view from 729
  // draw calls to 1,768 once they drew. Each copy keeps the light of its own
  // cell as its instance colour, which multiplies the surface exactly as the
  // darkened material copies did (emissive untouched). loadProp warms the
  // instanced programs the moment a model loads, so first sight never compiles.
  for (const [kind, b] of propBatches) {
    for (const part of instParts(b.model)) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, b.mats.length);
      for (let i = 0; i < b.mats.length; i++) {
        mesh.setMatrixAt(i, PROP_M.multiplyMatrices(b.mats[i], part.rel));
        mesh.setColorAt(i, PROP_C.setScalar(b.light[i]));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); // the instances' sphere, not the part's
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.receiveShadow;
      // "kit:" — a rebuild leaves the shared geometry alone; instProp — the
      // instance buffers are this chunk's and are freed with it
      mesh.name = `kit:prop:${kind}`;
      mesh.userData.instProp = true;
      group.add(mesh);
    }
  }

  world.meshes.set(k, group);
  scene.add(group);

  // A fresh chunk can change what an already-built NEIGHBOR should look like
  // (cross-chunk wall heights at district steps). That refresh is the GAME
  // SCREEN's job: onChunk queues all 8 neighbours into its one-per-frame
  // rebuildQueue. This function used to ALSO rebuild the 4 orthogonal ones
  // synchronously right here — so five chunks arriving on a boundary
  // crossing became ~25 full builds inside one frame (the walking stutter),
  // every one of which the queue then rebuilt AGAIN. Deferred-only now: the
  // border may lag a few frames behind the fresh chunk, which reads as a
  // brief lighting settle instead of a hitch.
}

/** Drop chunks far outside the streaming radius (memory + draw calls).
 *  RETURNS the pruned keys: the caller must forget them from its "already
 *  requested" set, or walking back into a pruned area streams NOTHING —
 *  empty void, and every spray mark that lived there stays gone for the
 *  rest of the session (Josh's "the paint doesn't stay" bug). */
export function pruneChunks(
  world: WorldIndex,
  scene: THREE.Scene,
  pcx: number,
  pcy: number,
  keep: number,
): string[] {
  const dropped: string[] = [];
  for (const [k, group] of world.meshes) {
    const [cx, cy] = k.split(",").map(Number);
    if (Math.abs(cx - pcx) > keep || Math.abs(cy - pcy) > keep) {
      scene.remove(group);
      group.traverse((o) => {
        // an instanced prop: its buffers go, its geometry is the cache's
        if (o.userData?.instProp) {
          (o as THREE.InstancedMesh).dispose();
          return;
        }
        // SHARED prop geometry belongs to the model cache — disposing it here
        // would blank out every other copy in the world.
        if (o.userData?.shared) return;
        if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
          o.geometry.dispose();
          const m = o.material as THREE.MeshBasicMaterial;
          if (isPanelClone(m)) m.dispose();
        }
      });
      world.meshes.delete(k);
      world.chunks.delete(k);
      world.flickers.delete(k);
      world.panelFlick.delete(k);
      const mg = world.markGroups.get(k);
      if (mg) {
        scene.remove(mg);
        world.markGroups.delete(k);
      }
      dropped.push(k);
    }
  }
  return dropped;
}

/** Animate the stuttering panels: mostly bright, occasional buzzy dropouts
 *  and half-brightness sputters on each panel's own random schedule. */
export function tickFlickers(world: WorldIndex, timeMs: number): void {
  for (const list of world.flickers.values()) {
    for (const f of list) {
      if (timeMs >= f.nextAt) {
        // Weighted schedule: long steady stretches, brief failures.
        const r = Math.random();
        if (f.dark) {
          f.dark = false;
          f.nextAt = timeMs + 400 + Math.random() * 4000;
        } else if (r < 0.55) {
          f.nextAt = timeMs + 300 + Math.random() * 2500; // stay lit
        } else {
          f.dark = true;
          f.nextAt = timeMs + 40 + Math.random() * (r < 0.85 ? 140 : 900);
        }
        for (const p of f.pools) p.mat.opacity = f.dark ? 0 : p.base;
      }
      // Applied every tick, not just on schedule flips: panelScale moves
      // continuously during a brownout ramp, and a panel mid-steady-stretch
      // must sag with the rest of the sector, not 3 seconds later.
      f.mat.color.setHex(f.dark ? 0x4a4534 : PANEL_COLOR).multiplyScalar(panelScale);
    }
  }
}

/** THE ENTITY'S TELL (replacing the darkness aura — Josh's call: "it should
 *  only make the lights around it flicker"). Ceiling fixtures within
 *  FLICK_R of the creature stutter and sag — per-panel irregular chatter,
 *  deeper the closer it is — and steady themselves the moment it leaves.
 *  Instanced panels flicker via per-instance color (which MULTIPLIES the
 *  shared material's color, so it composes with brownouts for free); the
 *  2.5% cloned flicker panels get the same treatment on their own mats —
 *  call this AFTER tickFlickers, which rewrites their colors each frame.
 *  Chunks the entity never visits pay nothing: no instanceColor buffer is
 *  even allocated until a panel first flickers. */
const FLICK_R = 9;
const FLICK_COL = new THREE.Color();
export function tickEntityFlicker(world: WorldIndex, ex: number, ez: number, on: boolean, timeMs: number): void {
  for (const p of world.panelFlick.values()) {
    let any = false;
    if (on) {
      for (let i = 0; i < p.pos.length; i++) {
        if (Math.hypot(p.pos[i][0] - ex, p.pos[i][1] - ez) < FLICK_R) {
          any = true;
          break;
        }
      }
    }
    if (!any && !p.touched) continue; // untouched and out of range — free
    for (let i = 0; i < p.pos.length; i++) {
      let v = 1;
      if (any) {
        const d = Math.hypot(p.pos[i][0] - ex, p.pos[i][1] - ez);
        if (d < FLICK_R) {
          const depth = 1 - d / FLICK_R; // 0 at the edge → 1 right on top of it
          const ph = (timeMs / 1000) * (9 + (i % 4) * 2.3) + i * 1.7;
          const wave = Math.sin(ph) * Math.sin(ph * 2.63 + i * 0.9);
          v = wave > 0.4 - depth * 0.75 ? 1 - depth * 0.3 : Math.max(0.06, 0.5 - depth * 0.45);
        }
      }
      p.mesh.setColorAt(i, FLICK_COL.setScalar(v));
    }
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    p.touched = any;
  }
  if (!on) return;
  for (const list of world.flickers.values()) {
    for (const f of list) {
      const d = Math.hypot(f.px - ex, f.pz - ez);
      if (d >= FLICK_R) continue;
      const depth = 1 - d / FLICK_R;
      const ph = (timeMs / 1000) * 11 + f.phase * 7;
      const v =
        Math.sin(ph) * Math.sin(ph * 3.1) > 0.35 - depth * 0.7
          ? 1 - depth * 0.25
          : Math.max(0.08, 0.45 - depth * 0.4);
      f.mat.color.multiplyScalar(v);
    }
  }
}

/** Count walls crossed by the straight line between two points (cell space) —
 *  the acoustics occlusion ray. Solids count double (a pillar is thicker than
 *  drywall); capped at 4 (past that it's inaudible anyway). Unloaded chunks
 *  read as walled, which only over-muffles things too far to matter. */
export function wallsBetween(world: WorldIndex, x0: number, y0: number, x1: number, y1: number): number {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 0.3));
  let walls = 0;
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = Math.floor(x0 + (x1 - x0) * t);
    const ny = Math.floor(y0 + (y1 - y0) * t);
    if (nx === cx && ny === cy) continue;
    let sx = cx;
    const sy = cy;
    if (nx !== sx) {
      if (world.wallWAt(Math.max(sx, nx), sy)) walls++;
      if (world.solidAt(nx, sy)) walls += 2;
      sx = nx;
    }
    if (ny !== sy) {
      if (world.wallNAt(sx, Math.max(sy, ny))) walls++;
      if (world.solidAt(sx, ny)) walls += 2;
    }
    cx = nx;
    cy = ny;
    if (walls >= 4) return 4;
  }
  return Math.min(4, walls);
}

// ---- FURNITURE (Josh's prop drop) ------------------------------------------
// The server decides WHERE (props.ts — deterministic, sparse, rooms only); this
// side just draws it. Props NEVER collide, which is what makes them safe to
// clip into a wall or the carpet and impossible to block a path with.
//
// Each GLB loads once, is normalised to a real-world height (the models arrive
// at wildly different scales), and is then CLONEd per placement — clones share
// geometry and materials, so a hundred chairs cost one upload. That sharing is
// why chunk pruning must not dispose them: prop objects are flagged
// `userData.shared` and pruneChunks skips their geometry.

/** Target height in metres per prop kind — what makes them read as furniture
 *  rather than doll's-house or monuments. */
const PROP_HEIGHT: Record<string, number> = {
  desk: 0.78,
  bookshelf: 1.95,
  dustyshelf: 2.05,
  table: 0.76,
  bed: 0.65,
  armchair: 0.92,
  serving: 0.9,
  lamp: 0.52,
};

const PROP_FILE: Record<string, string> = {
  desk: "/assets/props/anime_-_school_desk.glb",
  bookshelf: "/assets/props/book_shelf.glb",
  dustyshelf: "/assets/props/dusty_old_bookshelf_free.glb",
  table: "/assets/props/free_-_old_table.glb",
  bed: "/assets/props/hospital_bed.glb",
  armchair: "/assets/props/old_armchair.glb",
  serving: "/assets/props/serving_table_01.glb",
  lamp: "/assets/props/table_lamp_01.glb",
};

const propCache = new Map<string, THREE.Object3D | null>(); // null = failed/loading
const propLoading = new Set<string>();
/** Chunks waiting for a prop model to arrive, so they can be rebuilt once it
 *  does (a prop that shows up 200ms late is fine; one that never shows isn't).
 *  The hook receives WHICH kind landed, so the game screen can rebuild only
 *  the chunks that actually place one — the old no-argument version rebuilt
 *  the whole loaded world synchronously, once per model file (Aug 2026:
 *  eight multi-second freezes right after entering). */
let onPropLoaded: ((kind: string) => void) | null = null;
export function setPropLoadedHook(fn: ((kind: string) => void) | null): void {
  onPropLoaded = fn;
}

/** The game closing lets go of the level's module-level sun and moon, which
 *  otherwise kept the dead scene reachable (Oct 2026 review). */
export function releaseLevelLights(): void {
  poolSun?.parent?.remove(poolSun);
  moonLight?.parent?.remove(moonLight);
}

/** THE MODEL WARM (Aug 2026 stutter hunt). A model that streams in mid-play
 *  otherwise compiles its shader programs and uploads its textures on FIRST
 *  SIGHT — a synchronous render-thread stall at the worst possible moment
 *  (measured 150ms on a 3090 Ti in the casino's version of this; worse on
 *  laptops). The game screen registers a warmer that compileAsyncs the
 *  loaded model off-thread the moment it lands, so first sight is free. */
let modelWarm: ((root: THREE.Object3D) => void) | null = null;
export function setModelWarmHook(fn: ((root: THREE.Object3D) => void) | null): void {
  modelWarm = fn;
}

/** THE PROP KIT's models (kind "kit:<file>") are built to size, standing on
 *  y=0 and centred — scripts/props/build.mjs — and meshopt-compressed. */
const kitLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
/** Pipe Dreams' ceiling lamp: the kit's caged bulkhead lamp. */
export const PIPE_LAMP_KIND = "kit:bulkhead-lamp";
/** The kit pipe whose material Pipe Dreams' wall runs wear. */
export const PIPE_RUN_KIND = "kit:pipe-straight-long";
/** A fixture's materials as a lamp hanging in the dark wears them. The glowing
 *  parts (the lens) glow a little less than the file says — at full strength
 *  the bloom swallowed the whole lamp into one white blob — and everything
 *  else (cage, housing) carries a faint self-light, the trick THE DOOR uses,
 *  so the FIXTURE reads round its light rather than the light alone. A dead
 *  lamp: nothing glows, the housing still faintly there. */
const fixtureMats = new Map<string, THREE.Material>();
function fixtureMat(m: THREE.Material, dead: boolean): THREE.Material {
  // LIGHTS OUT's fixtures are TRULY dead: the faint self-light that lets a
  // dead fixture read on a lit level made all 193 of them the brightest
  // things in a level whose walls sit at ~1/255 (Nov 2026 polish round). The
  // torch still picks them out.
  const black = dead && levelStyle === "lights";
  const key = `${m.uuid}:${dead ? 1 : 0}:${black ? 1 : 0}`;
  let out = fixtureMats.get(key);
  if (!out) {
    const c = m.clone() as THREE.MeshStandardMaterial;
    if (c.emissive) {
      const glows = c.emissive.r + c.emissive.g + c.emissive.b > 0.05;
      if (glows && !dead) c.emissiveIntensity = 0.55;
      else {
        c.emissiveMap = null;
        c.emissive.copy(c.color ?? new THREE.Color(0x666666)).multiplyScalar(black ? 0 : dead ? 0.12 : 0.3);
        if (glows) c.color?.multiplyScalar(0.3); // a dead lens is dark glass
      }
    }
    out = c;
    fixtureMats.set(key, out);
  }
  return out;
}
/** Draw a kit model many times: one InstancedMesh per mesh inside it, each
 *  placed by the given matrices (the model's own inner transforms kept). */
function instanceFixture(model: THREE.Object3D, mats: THREE.Matrix4[], dead: boolean, into: THREE.Group): void {
  if (!mats.length) return;
  model.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const inst = new THREE.InstancedMesh(mesh.geometry, fixtureMat(mat, dead), mats.length);
    const m4 = new THREE.Matrix4();
    mats.forEach((mx, i) => inst.setMatrixAt(i, m4.multiplyMatrices(mx, local)));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere(); // the instances' sphere, not the piece's
    inst.userData.shared = true; // the geometry belongs to the prop cache
    into.add(inst);
  });
}
/** A kit prop's "open" clip, when its file has one (the doors that came
 *  through scripts/props/intake.mjs). */
const kitOpenClip = new Map<string, THREE.AnimationClip>();

// ---- DOORS THAT OPEN (Josh, Sep 2026: "if the asset needs to be animated like
// a door model, then add them to it") ------------------------------------------
// A placed prop whose file carries an "open" clip swings open as somebody walks
// up and closes behind them. Purely a picture — every client runs it off the
// bodies IT can see, so there is nothing on the wire and nothing to sync, and
// the door never blocks (the catalogue marks it walk-through). Each chunk group
// keeps its doors in userData.swing, so pruning a chunk forgets them.
interface SwingDoor {
  mixer: THREE.AnimationMixer;
  /** Where it stands, in cells. */
  x: number;
  y: number;
  /** Clip time now, and the clip's length. */
  t: number;
  dur: number;
}
/** How close (cells) somebody has to be before a door opens. */
export const DOOR_OPEN_CELLS = 1.7;
export function tickSwingDoors(world: WorldIndex, bodies: { x: number; y: number }[], dt: number): void {
  for (const group of world.meshes.values()) {
    const doors = group.userData.swing as SwingDoor[] | undefined;
    if (!doors) continue;
    for (const d of doors) {
      const near = bodies.some((b) => Math.abs(b.x - d.x) < DOOR_OPEN_CELLS && Math.abs(b.y - d.y) < DOOR_OPEN_CELLS && Math.hypot(b.x - d.x, b.y - d.y) < DOOR_OPEN_CELLS);
      const want = near ? d.dur : 0;
      if (d.t === want) continue;
      // opens at the clip's own pace, closes a little slower
      d.t = near ? Math.min(d.dur, d.t + dt) : Math.max(0, d.t - dt * 0.7);
      d.mixer.setTime(d.t);
    }
  }
}

/** THE ELECTRICAL STATION's hazards in a chunk: the ELECTRIFIED WATER (a glossy
 *  sheet a hair over the floor, glowing cold blue while its section is live)
 *  and the ARCING PANELS (the kit's open power box on the wall — the arc
 *  itself is the game's, on the server's clock). */
export const STATION_PANEL_KIND = "kit:power-box";
// ---- THE TERROR HOTEL's FIXTURES (Level 5) -----------------------------------
// The fixture law: every light is a kit model. Above stairs a chandelier hangs
// from every lamp cell (the crystal one in the Beverly Room), below stairs the
// caged bulkhead lamp Pipe Dreams uses; a sconce on its wall. A dead one is the
// same fixture gone dark. Until a model has loaded the chunk has none of it —
// its arrival rebuilds the hotel's chunks (HOTEL_FIXTURE_KINDS in the game).
export const HOTEL_CHANDELIER_KIND = "kit:deco-chandelier";
export const HOTEL_GRAND_KIND = "kit:crystal-chandelier";
export const HOTEL_SCONCE_KIND = "kit:deco-sconce";
export const HOTEL_FIXTURE_KINDS = [HOTEL_CHANDELIER_KIND, HOTEL_GRAND_KIND, HOTEL_SCONCE_KIND, PIPE_LAMP_KIND];
/** Hang a model's TOP at the ceiling, wherever its own origin sits. */
const topOf = new Map<THREE.Object3D, number>();
function modelTop(model: THREE.Object3D): number {
  let t = topOf.get(model);
  if (t === undefined) {
    t = new THREE.Box3().setFromObject(model).max.y;
    topOf.set(model, t);
  }
  return t;
}
function buildHotelFixtures(
  group: THREE.Group,
  ox: number,
  oz: number,
  lamps: { x: number; y: number; dead: boolean; hot: boolean; grand: boolean }[],
  sconces: { x: number; y: number; side: number; dead: boolean }[],
  floorOf: (x: number, y: number) => number,
  heightOf: (x: number, y: number) => number,
): void {
  const byKind = new Map<string, { lit: THREE.Matrix4[]; dead: THREE.Matrix4[] }>();
  const put = (kind: string, m4: THREE.Matrix4, dead: boolean): void => {
    let e = byKind.get(kind);
    if (!e) byKind.set(kind, (e = { lit: [], dead: [] }));
    (dead ? e.dead : e.lit).push(m4);
  };
  for (const l of lamps) {
    const top = heightOf(l.x, l.y);
    if (!Number.isFinite(top) || top < 0) continue;
    const cx = ox + l.x * CELL + CELL / 2;
    const cz = oz + l.y * CELL + CELL / 2;
    if (l.hot) {
      const face = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -0.099, 0));
      put(PIPE_LAMP_KIND, new THREE.Matrix4().makeTranslation(cx, top - 0.075, cz).multiply(face), l.dead);
      continue;
    }
    const kind = l.grand ? HOTEL_GRAND_KIND : HOTEL_CHANDELIER_KIND;
    const model = loadProp(kind);
    if (!model) continue;
    put(kind, new THREE.Matrix4().makeTranslation(cx, top - 0.02 - modelTop(model), cz), l.dead);
  }
  for (const sc of sconces) {
    const fl = floorOf(sc.x, sc.y);
    const dx = [0, 1, 0, -1][sc.side];
    const dz = [-1, 0, 1, 0][sc.side];
    const into = CELL / 2 - 0.08;
    put(
      HOTEL_SCONCE_KIND,
      new THREE.Matrix4()
        .makeTranslation(ox + sc.x * CELL + CELL / 2 + dx * into, fl + 1.3, oz + sc.y * CELL + CELL / 2 + dz * into)
        .multiply(new THREE.Matrix4().makeRotationY([0, -Math.PI / 2, Math.PI, Math.PI / 2][sc.side])),
      sc.dead,
    );
  }
  for (const [kind, e] of byKind) {
    const model = loadProp(kind);
    if (!model) continue;
    instanceFixture(model, e.lit, false, group);
    instanceFixture(model, e.dead, true, group);
  }
}

// ---- LIGHTS OUT's DEAD FIXTURES AND ITS WATER (Level 6) ----------------------
// The fixture law, honoured in the dark: every lamp a real model — the caged
// bulkhead Pipe Dreams uses, or the kit's fluorescent batten — and every one
// dead. Until a model has loaded the chunk has none of it; its arrival
// rebuilds the level's chunks (LIGHTS_FIXTURE_KINDS in the game).
export const LIGHTS_BATTEN_KIND = "kit:fluorescent-batten";
export const LIGHTS_FIXTURE_KINDS = [PIPE_LAMP_KIND, LIGHTS_BATTEN_KIND];
function buildLightsFixtures(
  group: THREE.Group,
  ox: number,
  oz: number,
  lamps: { x: number; y: number; batten: boolean; isNS: boolean }[],
  heightOf: (x: number, y: number) => number,
  dead = true,
): void {
  const cages: THREE.Matrix4[] = [];
  const tubes: THREE.Matrix4[] = [];
  const batten = loadProp(LIGHTS_BATTEN_KIND);
  const face = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -0.099, 0));
  for (const l of lamps) {
    const top = heightOf(l.x, l.y);
    if (!Number.isFinite(top) || top < 0) continue;
    const cx = ox + l.x * CELL + CELL / 2;
    const cz = oz + l.y * CELL + CELL / 2;
    if (l.batten && batten) {
      tubes.push(new THREE.Matrix4().makeTranslation(cx, top - 0.02 - modelTop(batten), cz).multiply(new THREE.Matrix4().makeRotationY(l.isNS ? Math.PI / 2 : 0)));
    } else {
      cages.push(new THREE.Matrix4().makeTranslation(cx, top - 0.075, cz).multiply(face));
    }
  }
  const cage = loadProp(PIPE_LAMP_KIND);
  if (cage) instanceFixture(cage, cages, dead, group);
  if (batten) instanceFixture(batten, tubes, dead, group);
}
// ---- THE SUBURBS' LIGHTS (Level 9) -------------------------------------------
// The fixture law outdoors: the lamp is the kit's caged bulkhead, as in Pipe
// Dreams — hung from a streetlight's arm, or screwed to a house's front wall
// beside its door. The pole and its arm are drawn (steel, not a light). The
// model's arrival rebuilds the level's chunks (SUBURB_FIXTURE_KINDS).
export const SUBURB_FIXTURE_KINDS = [PIPE_LAMP_KIND];
interface SuburbLamp {
  x: number;
  y: number;
  porch: boolean;
  /** Drawn lit (a lit lamp only — a flickering one is drawn dead, like the server counts it). */
  lit: boolean;
  /** The street side (a streetlight's arm) or the wall (a porch light). */
  dx: number;
  dz: number;
}
const SUBURB_POLE_H = 5.4;
function buildSuburbFixtures(
  group: THREE.Group,
  ox: number,
  oz: number,
  lamps: SuburbLamp[],
  floorOf: (x: number, y: number) => number,
): void {
  const lit: THREE.Matrix4[] = [];
  const dead: THREE.Matrix4[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const hang = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -0.099, 0));
  const shade = (g: THREE.BufferGeometry, v: number): THREE.BufferGeometry => {
    const c = new Float32Array((g.attributes.position as THREE.BufferAttribute).count * 3).fill(v);
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  };
  for (const l of lamps) {
    const fy = floorOf(l.x, l.y);
    if (!Number.isFinite(fy)) continue;
    const cx = ox + l.x * CELL + CELL / 2;
    const cz = oz + l.y * CELL + CELL / 2;
    if (l.porch) {
      // on the wall, lens facing out into the yard, just above a door's head
      const wx = cx + l.dx * (CELL / 2 - 0.16);
      const wz = cz + l.dz * (CELL / 2 - 0.16);
      const yaw = Math.atan2(-l.dx, -l.dz);
      (l.lit ? lit : dead).push(new THREE.Matrix4().makeTranslation(wx, fy + 2.25, wz).multiply(new THREE.Matrix4().makeRotationY(yaw)));
      continue;
    }
    // the pole stands back from the kerb; the arm carries the lamp over it
    const px = cx - l.dx * 0.55;
    const pz = cz - l.dz * 0.55;
    const pole = new THREE.CylinderGeometry(0.06, 0.085, SUBURB_POLE_H, 10);
    pole.translate(px, fy + SUBURB_POLE_H / 2, pz);
    steel.push(shade(pole, 0.55));
    const foot = new THREE.CylinderGeometry(0.15, 0.17, 0.45, 10);
    foot.translate(px, fy + 0.225, pz);
    steel.push(shade(foot, 0.5));
    const reach = l.dx || l.dz ? 0.95 : 0;
    const hx = px + l.dx * reach;
    const hz = pz + l.dz * reach;
    if (reach) {
      const arm = new THREE.BoxGeometry(l.dx ? reach + 0.08 : 0.07, 0.07, l.dz ? reach + 0.08 : 0.07);
      arm.translate((px + hx) / 2, fy + SUBURB_POLE_H - 0.05, (pz + hz) / 2);
      steel.push(shade(arm, 0.6));
    }
    (l.lit ? lit : dead).push(new THREE.Matrix4().makeTranslation(hx, fy + SUBURB_POLE_H - 0.16, hz).multiply(hang));
  }
  if (steel.length) {
    const merged = mergeGeometries(steel.map((g) => g.toNonIndexed()));
    for (const g of steel) g.dispose();
    if (merged) {
      const mesh = new THREE.Mesh(merged, suburbPoleMat);
      mesh.name = "suburb-poles";
      group.add(mesh);
    }
  }
  const cage = loadProp(PIPE_LAMP_KIND);
  if (cage) {
    instanceFixture(cage, lit, false, group);
    instanceFixture(cage, dead, true, group);
  }
}
/** THE WET END's water: ankle-deep, near-black, the Station's dead water
 *  (ragged where it meets a dry doorway) over every cell of a flooded room. */
const LIGHTS_WATER_DEPTH = 0.12;
function buildLightsWater(
  world: WorldIndex,
  data: ChunkData,
  group: THREE.Group,
  ox: number,
  oz: number,
  n: number,
  floorOf: (cx: number, cy: number) => number,
  wetSet: ReadonlySet<string> = WET_SET,
): void {
  if (!stationMatsBuilt) return;
  const geos: THREE.BufferGeometry[] = [];
  const wetAt = (ax: number, ay: number): boolean => world.solidAt(ax, ay) || wetSet.has(world.typeAt(ax, ay));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      if (world.solidAt(gx, gy) || !wetSet.has(world.typeAt(gx, gy))) continue;
      const floorY = floorOf(x, y);
      if (!Number.isFinite(floorY)) continue;
      const g = new THREE.PlaneGeometry(CELL, CELL, 4, 4);
      g.rotateX(-Math.PI / 2);
      g.translate(ox + x * CELL + CELL / 2, floorY + LIGHTS_WATER_DEPTH, oz + y * CELL + CELL / 2);
      const dW = !wetAt(gx - 1, gy), dE = !wetAt(gx + 1, gy), dN = !wetAt(gx, gy - 1), dS = !wetAt(gx, gy + 1);
      const gp = g.attributes.position as THREE.BufferAttribute;
      const shore = new Float32Array(gp.count);
      const x0 = ox + x * CELL;
      const z0 = oz + y * CELL;
      for (let v = 0; v < gp.count; v++) {
        const u = (gp.getX(v) - x0) / CELL;
        const w = (gp.getZ(v) - z0) / CELL;
        let d = 1;
        if (dW) d = Math.min(d, u);
        if (dE) d = Math.min(d, 1 - u);
        if (dN) d = Math.min(d, w);
        if (dS) d = Math.min(d, 1 - w);
        shore[v] = Math.min(1, d / 0.5);
      }
      g.setAttribute("aShore", new THREE.BufferAttribute(shore, 1));
      geos.push(g);
    }
  }
  if (!geos.length) return;
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, stationWaterDead);
  mesh.name = "lights-water";
  mesh.renderOrder = 2;
  group.add(mesh);
}

// ---- THE OFFICE's WINDOWS (Level 4) -----------------------------------------
// The references, every one of the twenty that shows a window: rain on the
// glass, fog behind it, a grey sky that never changes. Only the building's
// outer walls carry them (worldgen-office.ts). One shared pane material — an
// overcast canvas with rain streaks, scrolled down the glass by tickOfficeRain
// — so a thousand windows are one texture and one shader program.
let officeRainMat: THREE.MeshBasicMaterial | null = null;
const OFFICE_FRAME_MAT = new THREE.MeshStandardMaterial({ color: 0x2c2d2f, roughness: 0.55, metalness: 0.4 });
const OFFICE_SILL_MAT = new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.8 });
function officeRain(): THREE.MeshBasicMaterial {
  if (officeRainMat) return officeRainMat;
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 256;
  const c = cv.getContext("2d")!;
  const sky = c.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#8f979d");
  sky.addColorStop(0.55, "#7c848a");
  sky.addColorStop(1, "#6a7176");
  c.fillStyle = sky;
  c.fillRect(0, 0, 128, 256);
  // fog: soft blotches, lighter, so the distance never resolves
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const g = c.createRadialGradient(rnd() * 128, rnd() * 256, 0, rnd() * 128, rnd() * 256, 20 + rnd() * 40);
    g.addColorStop(0, "rgba(190,196,200,0.18)");
    g.addColorStop(1, "rgba(190,196,200,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 256);
  }
  // the rain: thin streaks running down the pane, a few beading
  for (let i = 0; i < 180; i++) {
    const x = rnd() * 128;
    const y = rnd() * 256;
    const len = 6 + rnd() * 26;
    c.strokeStyle = `rgba(220,226,230,${0.12 + rnd() * 0.22})`;
    c.lineWidth = rnd() < 0.15 ? 1.4 : 0.7;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rnd() - 0.5) * 2, y + len);
    c.stroke();
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  officeRainMat = new THREE.MeshBasicMaterial({ map: tx, color: 0xb4b8bc, fog: true });
  return officeRainMat;
}
/** Run the rain down every office window (the game's frame loop). */
export function tickOfficeRain(now: number): void {
  if (!officeRainMat?.map) return;
  officeRainMat.map.offset.y = ((now / 1000) * 0.09) % 1;
}
function buildOfficeWindows(
  data: ChunkData,
  group: THREE.Group,
  ox: number,
  oz: number,
  n: number,
  floorOf: (cx: number, cy: number) => number,
): void {
  const panes: THREE.Matrix4[] = [];
  const frames: THREE.Matrix4[] = [];
  const sills: THREE.Matrix4[] = [];
  const W = 1.5;
  const H = 1.25;
  const BASE = 0.95;
  const face = 0.152; // the 30cm wall's room-side face, from the cell edge
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const code = data.deco?.[y * n + x] ?? 0;
      if (code >> 4 !== ODECO.window) continue;
      const side = code & 15;
      const floorY = floorOf(x, y);
      if (!Number.isFinite(floorY)) continue;
      // the wall's centre line at this cell's edge, and the turn to face the room
      const cx = ox + x * CELL + CELL / 2;
      const cz = oz + y * CELL + CELL / 2;
      const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
      const ex = cx + dx * (CELL / 2 - face);
      const ez = cz + dz * (CELL / 2 - face);
      const rotY = [0, -Math.PI / 2, Math.PI, Math.PI / 2][side];
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
      const at = (along: number, up: number, out: number, sx: number, sy: number, sz: number): THREE.Matrix4 => {
        // local: x along the wall, y up, z out of the wall toward the room
        const v = new THREE.Vector3(along, up, out).applyQuaternion(q);
        return new THREE.Matrix4().compose(new THREE.Vector3(ex + v.x, floorY + v.y, ez + v.z), q, new THREE.Vector3(sx, sy, sz));
      };
      panes.push(at(0, BASE + H / 2, 0.004, W, H, 1));
      // the frame: head, foot and two jambs
      frames.push(at(0, BASE + H + 0.03, 0.03, W + 0.12, 0.06, 0.07));
      frames.push(at(0, BASE - 0.03, 0.03, W + 0.12, 0.06, 0.07));
      frames.push(at(-W / 2 - 0.03, BASE + H / 2, 0.03, 0.06, H, 0.07));
      frames.push(at(W / 2 + 0.03, BASE + H / 2, 0.03, 0.06, H, 0.07));
      // a mullion down the middle, and a sill
      frames.push(at(0, BASE + H / 2, 0.02, 0.04, H, 0.05));
      sills.push(at(0, BASE - 0.07, 0.09, W + 0.2, 0.04, 0.2));
    }
  }
  if (!panes.length) return;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]): void => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  };
  inst(new THREE.PlaneGeometry(1, 1), officeRain(), panes);
  inst(new THREE.BoxGeometry(1, 1, 1), OFFICE_FRAME_MAT, frames);
  inst(new THREE.BoxGeometry(1, 1, 1), OFFICE_SILL_MAT, sills);
}

function buildStationHazards(
  world: WorldIndex,
  data: ChunkData,
  group: THREE.Group,
  ox: number,
  oz: number,
  n: number,
  /** the cell's FLOOR in metres (buildChunk's floorOf — heightOf is the ceiling) */
  floorOf: (cx: number, cy: number) => number,
): void {
  const live: THREE.BufferGeometry[] = [];
  const dull: THREE.BufferGeometry[] = [];
  const panels: THREE.Matrix4[] = [];
  const panel = loadProp(STATION_PANEL_KIND);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const code = data.deco?.[y * n + x] ?? 0;
      const kind = code >> 4;
      if (!kind) continue;
      const floorY = floorOf(x, y);
      if (!Number.isFinite(floorY)) continue;
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      if (kind === SDECO.puddle) {
        const g = new THREE.PlaneGeometry(CELL, CELL, 4, 4);
        g.rotateX(-Math.PI / 2);
        g.translate(ox + x * CELL + CELL / 2, floorY + 0.02, oz + y * CELL + CELL / 2);
        // aShore: 1 inside the water, falling to 0 at an edge it shares with
        // DRY floor (water meets a wall at full depth) — the shader breaks it
        const wetAt = (ax: number, ay: number): boolean => world.solidAt(ax, ay) || world.decoAt(ax, ay) >> 4 === SDECO.puddle;
        const dW = !wetAt(gx - 1, gy), dE = !wetAt(gx + 1, gy), dN = !wetAt(gx, gy - 1), dS = !wetAt(gx, gy + 1);
        const dNW = !wetAt(gx - 1, gy - 1), dNE = !wetAt(gx + 1, gy - 1), dSW = !wetAt(gx - 1, gy + 1), dSE = !wetAt(gx + 1, gy + 1);
        const gp = g.attributes.position as THREE.BufferAttribute;
        const shore = new Float32Array(gp.count);
        const x0 = ox + x * CELL;
        const z0 = oz + y * CELL;
        for (let v = 0; v < gp.count; v++) {
          const u = (gp.getX(v) - x0) / CELL;
          const w = (gp.getZ(v) - z0) / CELL;
          let d = 1;
          if (dW) d = Math.min(d, u);
          if (dE) d = Math.min(d, 1 - u);
          if (dN) d = Math.min(d, w);
          if (dS) d = Math.min(d, 1 - w);
          if (dNW) d = Math.min(d, Math.hypot(u, w));
          if (dNE) d = Math.min(d, Math.hypot(1 - u, w));
          if (dSW) d = Math.min(d, Math.hypot(u, 1 - w));
          if (dSE) d = Math.min(d, Math.hypot(1 - u, 1 - w));
          shore[v] = Math.min(1, d / 0.5);
        }
        g.setAttribute("aShore", new THREE.BufferAttribute(shore, 1));
        (stationSectionPowered(world.sectionAt(gx, gy)) ? live : dull).push(g);
      } else if (kind === SDECO.arc && panel) {
        const side = code & 15;
        const dx = [0, 1, 0, -1][side];
        const dz = [-1, 0, 1, 0][side];
        const into = CELL / 2 - 0.24;
        panels.push(
          new THREE.Matrix4()
            .makeTranslation(ox + x * CELL + CELL / 2 + dx * into, floorY + 1.15, oz + y * CELL + CELL / 2 + dz * into)
            .multiply(new THREE.Matrix4().makeRotationY([0, -Math.PI / 2, Math.PI, Math.PI / 2][side])),
        );
      }
    }
  }
  for (const [geos, mat] of [[live, stationWaterLive], [dull, stationWaterDead]] as const) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = "station-water";
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  if (panel && panels.length) instanceFixture(panel, panels, false, group);
}

/** A SKINNED KIT MODEL STANDS STILL, SO ITS SKIN IS BAKED OUT (Nov 2026
 *  polish round). The Hotel's corridor doors (door-panel) and the treasure
 *  chest ship skinned; a plain clone keeps every copy bound to the cached
 *  prototype's bones, which are never in the scene, so all 311 numbered
 *  doors drew nowhere and only their brass plates showed. Nothing plays
 *  their clips (only an "open" clip swings a kit door), so each skinned
 *  mesh becomes an ordinary mesh in its rest pose: it clones like every
 *  other prop, and no skinning shader variant is ever needed. */
export function bakeKitSkins(model: THREE.Object3D): void {
  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  if (!skinned.length) return;
  model.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const nv = new THREE.Vector4();
  for (const sm of skinned) {
    sm.skeleton.update();
    const g = sm.geometry.clone();
    // The kit build quantizes (meshopt): position is a normalized int16 that
    // the skin's matrices scale back up, so the baked metres go into fresh
    // float attributes — written back into the int16 they clamp to ±1.
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
    const outP = new Float32Array(pos.count * 3);
    const outN = nor ? new Float32Array(pos.count * 3) : null;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      sm.applyBoneTransform(i, p);
      outP[i * 3] = p.x;
      outP[i * 3 + 1] = p.y;
      outP[i * 3 + 2] = p.z;
      if (nor && outN) {
        nv.set(nor.getX(i), nor.getY(i), nor.getZ(i), 0);
        sm.applyBoneTransform(i, nv);
        const l = Math.hypot(nv.x, nv.y, nv.z) || 1;
        outN[i * 3] = nv.x / l;
        outN[i * 3 + 1] = nv.y / l;
        outN[i * 3 + 2] = nv.z / l;
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(outP, 3));
    if (outN) g.setAttribute("normal", new THREE.BufferAttribute(outN, 3));
    g.deleteAttribute("skinIndex");
    g.deleteAttribute("skinWeight");
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, sm.material);
    mesh.name = sm.name;
    mesh.position.copy(sm.position);
    mesh.quaternion.copy(sm.quaternion);
    mesh.scale.copy(sm.scale);
    const parent = sm.parent;
    if (!parent) continue;
    parent.children[parent.children.indexOf(sm)] = mesh;
    mesh.parent = parent;
    sm.parent = null;
  }
  model.updateMatrixWorld(true);
  // A skinned mesh ignores its own node, so the kit build's base-centring
  // never reached the posed model: the doors stood ~1.7m up and a metre and
  // a half aside. Every kit model's origin is the middle of its base, front
  // to +z (kit.ts), so the baked model is set back on it.
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  const off = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  if (off.length() < 0.005) return;
  for (const c of model.children) c.position.sub(off);
  model.updateMatrixWorld(true);
}

/** PROPS TAKE THE ROOM'S LIGHT (Nov 2026 polish round). Walls and floors
 *  carry the baked light field in their vertex colours; kit props carried
 *  none and were lit by the scene's lights at full strength, so a wardrobe
 *  in a pitch-black house, a stalagmite in the Deep or a cubicle partition
 *  20m from any working troffer stood out of the dark as if spotlit. Each
 *  copy now wears its materials darkened to the light of the cell it
 *  stands in. The darkened copies are SHARED per (material, step), never
 *  edited in place (the models are cached across chunks and levels), and a
 *  copy keeps the original's shader hooks, so it reuses the same compiled
 *  program — no new compile mid-game. Emissive light (a lamp's lens) is
 *  untouched; an unlit (MeshBasic) material is its own light and is left. */
const PROP_SHADE_STEPS = 24;
const shadedMats = new Map<THREE.Material, THREE.Material[]>();
/** The step (0..PROP_SHADE_STEPS) for a 0..1 light factor — in square-root
 *  space, so the dark end, where the eye notices, gets the finer steps. */
export function propShadeStep(f: number): number {
  return Math.round(Math.sqrt(Math.max(0, Math.min(1, f))) * PROP_SHADE_STEPS);
}
function shadedMat(m: THREE.Material, step: number): THREE.Material {
  const src = m as THREE.MeshStandardMaterial;
  if (step >= PROP_SHADE_STEPS || !src.color || (m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return m;
  let arr = shadedMats.get(m);
  if (!arr) shadedMats.set(m, (arr = []));
  let c = arr[step];
  if (!c) {
    const cm = m.clone() as THREE.MeshStandardMaterial;
    cm.onBeforeCompile = m.onBeforeCompile;
    cm.customProgramCacheKey = m.customProgramCacheKey;
    cm.userData = { ...m.userData };
    const f = (step / PROP_SHADE_STEPS) ** 2;
    cm.color.multiplyScalar(f);
    arr[step] = c = cm;
  }
  return c;
}
/** Wear a copy's materials at a shade step (the copy's own slots only). */
function shadeProp(inst: THREE.Object3D, step: number): void {
  if (step >= PROP_SHADE_STEPS) return;
  inst.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mt) => shadedMat(mt, step)) : shadedMat(mesh.material, step);
  });
}

/** A kit model drawn as instances: still (no "open" clip) and unskinned
 *  (a skin that couldn't be baked keeps per-copy bones). */
/** ONE DRAW PER MATERIAL, NOT PER FACE (Nov 2026 polish round): a sign's slab
 *  is a box with a material per face (the words on one, its edge on five), and
 *  every face group is its own draw call — six for each of the Hotel's
 *  hundreds of door plates. The sign's own geometry is re-indexed so each
 *  material is one group: two draws. (Signs make their geometry per sign, so
 *  nothing shared is touched.) */
function mergeGroupsByMaterial(mesh: THREE.Mesh): void {
  if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
  const g = mesh.geometry;
  if (!g.index || g.groups.length < 2) return;
  const src = g.index.array;
  const byMat = new Map<number, number[]>();
  for (const gr of g.groups) {
    const mi = gr.materialIndex ?? 0;
    let list = byMat.get(mi);
    if (!list) byMat.set(mi, (list = []));
    for (let i = gr.start; i < gr.start + gr.count; i++) list.push(src[i]);
  }
  if (byMat.size === g.groups.length) return;
  const out: number[] = [];
  g.clearGroups();
  for (const [mi, list] of byMat) {
    g.addGroup(out.length, list.length, mi);
    for (const v of list) out.push(v);
  }
  g.setIndex(out);
}
function instanceable(kind: string, model: THREE.Object3D): boolean {
  return kind.startsWith("kit:") && !kitOpenClip.has(kind) && !model.userData.skinned;
}
const PROP_E = new THREE.Euler();
const PROP_P = new THREE.Vector3();
const PROP_Q = new THREE.Quaternion();
const PROP_M = new THREE.Matrix4();
const PROP_C = new THREE.Color();
interface InstPart {
  geo: THREE.BufferGeometry;
  mat: THREE.Material | THREE.Material[];
  /** The part relative to the model's root (the root's own transform is
   *  the placement's: position, turn, and the model's scale). */
  rel: THREE.Matrix4;
  castShadow: boolean;
  receiveShadow: boolean;
}
/** The parts a model is drawn as when instanced (cached on the model). */
function instParts(model: THREE.Object3D): InstPart[] {
  const hit = model.userData.instParts as InstPart[] | undefined;
  if (hit) return hit;
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const parts: InstPart[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    parts.push({ geo: mesh.geometry, mat: mesh.material, rel: new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld), castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow });
  });
  model.userData.instParts = parts;
  return parts;
}
/** THE INSTANCED VARIANT, WARMED (Nov 2026 polish round): an InstancedMesh
 *  with an instance colour is a different program from the plain mesh the
 *  model warm compiles, so a one-instance copy of every part is warmed too —
 *  the first chunk that draws the model must not compile it mid-frame. */
function warmInstanced(kind: string, model: THREE.Object3D): void {
  if (!modelWarm || !instanceable(kind, model)) return;
  const g = new THREE.Group();
  for (const part of instParts(model)) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, 1);
    im.setMatrixAt(0, part.rel);
    im.setColorAt(0, PROP_C.setScalar(1));
    im.castShadow = part.castShadow;
    im.receiveShadow = part.receiveShadow;
    im.frustumCulled = false;
    g.add(im);
  }
  modelWarm(g);
}

function loadProp(kind: string): THREE.Object3D | null {
  const hit = propCache.get(kind);
  if (hit !== undefined) return hit;
  if (propLoading.has(kind)) return null;
  if (kind.startsWith("kit:")) {
    propLoading.add(kind);
    kitLoader.load(
      `/assets/propkit/${kind.slice(4)}.gltf`,
      (g: GLTF) => {
        const model = g.scene;
        const open = g.animations.find((a) => a.name === "open");
        if (open) kitOpenClip.set(kind, open);
        else bakeKitSkins(model);
        // a skinned model that DOES swing keeps its skin, and every copy needs
        // its own skeleton (the furniture loop clones it with SkeletonUtils)
        model.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) model.userData.skinned = true;
        });
        tameGlbTransparency(model);
        model.traverse((o: THREE.Object3D) => {
          o.userData.shared = true;
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            // No environment map here: a metallic surface reflects nothing and
            // renders black, so a kit prop is never more than a little metal.
            for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
              const sm = mt as THREE.MeshStandardMaterial;
              if (sm.isMeshStandardMaterial && sm.metalness > 0.3) sm.metalness = 0.3;
            }
            // AN UNLIT KIT MATERIAL TAKES LIGHT (Nov 2026 polish round): four
            // models ship KHR_materials_unlit (the bedside table, the locker
            // bank, the pad transformer, the velvet sofa), which glowed at full
            // colour in a pitch-black house and never answered a torch. They
            // become ordinary matte surfaces, lit like everything round them.
            const unlit = (mt: THREE.Material): THREE.Material => {
              const b = mt as THREE.MeshBasicMaterial;
              if (!b.isMeshBasicMaterial) return mt;
              return new THREE.MeshStandardMaterial({
                name: b.name, map: b.map, color: b.color, transparent: b.transparent, opacity: b.opacity,
                alphaTest: b.alphaTest, side: b.side, vertexColors: b.vertexColors, roughness: 0.9, metalness: 0,
                forceSinglePass: true, // tameGlbTransparency has already run: never the two-pass path
              });
            };
            o.material = Array.isArray(o.material) ? o.material.map(unlit) : unlit(o.material);
          }
        });
        propCache.set(kind, model);
        propLoading.delete(kind);
        modelWarm?.(model);
        warmInstanced(kind, model);
        onPropLoaded?.(kind);
      },
      undefined,
      () => {
        propCache.set(kind, null);
        propLoading.delete(kind);
      },
    );
    return null;
  }
  const url = PROP_FILE[kind];
  if (!url) {
    propCache.set(kind, null);
    return null;
  }
  propLoading.add(kind);
  new GLTFLoader().load(
    url,
    (g: GLTF) => {
      const model = g.scene;
      tameGlbTransparency(model); // the bookshelf's spiderwebs: no two-pass churn
      // Normalise: sit its feet on y=0 and scale to a believable height.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const target = PROP_HEIGHT[kind] ?? 1;
      const scale = target / Math.max(0.001, size.y);
      model.scale.setScalar(scale);
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y = -box2.min.y;
      model.traverse((o: THREE.Object3D) => {
        o.userData.shared = true; // pruning must not dispose shared geometry
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      propCache.set(kind, model);
      propLoading.delete(kind);
      modelWarm?.(model);
      onPropLoaded?.(kind);
    },
    undefined,
    () => {
      propCache.set(kind, null); // missing file: the room is just emptier
      propLoading.delete(kind);
    },
  );
  return null;
}

/** Warm every prop model up front so furniture doesn't pop in room by room. */
export function preloadProps(): void {
  for (const kind of Object.keys(PROP_FILE)) loadProp(kind);
}

// ---- Other players: the Hazmat PS1 model -----------------------------------
// Loaded once, cloned per peer (SkeletonUtils handles skinned rigs). Texture
// filtered NEAREST for the PS1 crunch. If the FBX carries clips, peers play
// walk while moving and idle at rest; until the model resolves (or if it
// fails) a capsule stands in.

interface HazmatBase {
  object: THREE.Group;
  height: number;
  minY: number;
  clips: THREE.AnimationClip[];
}
let hazmatBase: HazmatBase | null = null;
let hazmatLoading: Promise<void> | null = null;

function loadHazmat(): Promise<void> {
  if (hazmatLoading) return hazmatLoading;
  hazmatLoading = new Promise((resolve) => {
    const texYellow = new THREE.TextureLoader().load("/assets/hazmat/hazmat_yellow.png");
    texYellow.colorSpace = THREE.SRGBColorSpace;
    texYellow.magFilter = THREE.NearestFilter; // the PS1 crunch
    new FBXLoader().load(
      "/assets/hazmat/hazmat.fbx",
      (fbx) => {
        const mat = new THREE.MeshStandardMaterial({ map: texYellow, roughness: 0.95 });
        fbx.traverse((o) => {
          if (o instanceof THREE.Mesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            (o as THREE.Mesh).material = mat;
            (o as THREE.Mesh).frustumCulled = false; // skinned bounds lie
          }
        });
        const box = new THREE.Box3().setFromObject(fbx);
        const height = Math.max(0.01, box.max.y - box.min.y);
        hazmatBase = { object: fbx, height, minY: box.min.y, clips: fbx.animations ?? [] };
        // THE CLIPS LIVE IN SEPARATE FILES (Josh's Mixamo set). hazmat.fbx is
        // rigged but carries no animation, which is why peers used to walk on a
        // procedural stride. Each file contributes its first clip, renamed after
        // the file so findClip below can match on "walk"/"run"/"idle".
        //
        // Verified on the animation bench before shipping: all six bind to this
        // rig with ZERO unbound tracks (22 bones, 19 tracks each), so no
        // retargeting is needed — Mixamo clips address bones by name and these
        // names match. Motion measured per clip: walking 19.3 over 1.03s,
        // running 26.3 over 0.63s, jump 49.4 over 2.17s.
        // 8-WAY LOCOMOTION (Josh, Aug 2026): forward/back/left/right for walk
        // and run, forward/left/right crouched (back is the forward clip
        // reversed — see the clone below). All bench-verified against this
        // rig: 19 tracks, 18 bones, zero unbound, in-place root profiles.
        // DRUNK LOCOMOTION (Josh's set, Aug 2026) — the casino bar's, but they
        // load with everything else because a peer's actions are built once
        // per avatar and a body that starts drinking can't wait for a fetch.
        // Bench-verified against this rig like the rest: 19 tracks, 18 bones,
        // only the armature node unbound. UNLIKE the rest they carry ROOT
        // MOTION (walk +265 units of Z over its 3s, run +486), which is
        // stripped below — the game already drives where the body is.
        // The list comes from casino/drunkclips.ts so adding one is a single
        // line there rather than an edit in three files that must agree.
        const ANIM = [
          "idle", "jump", "crouch-idle",
          "walking", "walking-back", "walking-left", "walking-right",
          "running", "running-back", "running-left", "running-right",
          "crouch-walking", "crouch-left", "crouch-right",
          "swimming", "treading", "sitting", "sitting-idle",
          ...Object.values(DRUNK_CLIPS).map((c) => c.file),
          // …and the ARMED set (the casino gun — same deal as the drunk set:
          // the list comes from casino/gunclips.ts, and they load with
          // everything else because a peer can draw mid-evening).
          ...Object.values(GUN_CLIPS).map((c) => c.file),
        ];
        let left = ANIM.length;
        const done = (): void => {
          if (--left === 0) resolve();
        };
        for (const name of ANIM) {
          new FBXLoader().load(
            `/assets/hazmat/anim/${name}.fbx`,
            (clipFbx) => {
              const c = clipFbx.animations?.[0];
              if (c) {
                c.name = name;
                // THE JUMP CLIP CARRIES ROOT MOTION — a running long jump whose
                // root track translates X 42 / Y 50 / Z 67 units (measured on
                // the bench). Played raw on an avatar whose position the game
                // already drives, the body would leap metres away from where
                // its player actually is. So the horizontal motion is stripped
                // AT LOAD: every `.position` track keeps its first key's X/Z
                // for the whole clip, keeping only the vertical arc (the hop —
                // 0.39m at game scale, drift 0, verified on the bench).
                // Same treatment for the drunk set, and for the same reason:
                // measured drift of 265 (walk) and 486 (run) units of Z would
                // march the body off the player it belongs to.
                // The gun set is stripped alongside them: Mixamo pistol
                // locomotion carries root travel exactly as the drunk set
                // does, and the game already drives where the body is.
                if (name === "jump" || name.startsWith("drunk-") || name.startsWith("gun-")) {
                  for (const t of c.tracks) {
                    if (!t.name.endsWith(".position")) continue;
                    const v = t.values;
                    for (let i = 3; i < v.length; i += 3) {
                      v[i] = v[0];
                      v[i + 2] = v[2];
                    }
                  }
                }
                hazmatBase!.clips.push(c);
                // CROUCHED BACKWARD has no source clip (Josh's set covers
                // fwd/left/right) — synthesize it: the forward clip cloned
                // and played in REVERSE (mk() flips timeScale by name). Feet
                // then match the direction of travel instead of moonwalking.
                if (name === "crouch-walking") {
                  const back = c.clone();
                  back.name = "crouch-back";
                  hazmatBase!.clips.push(back);
                }
              }
              done();
            },
            undefined,
            done, // a missing clip file just means that state falls back
          );
        }
      },
      undefined,
      () => resolve(), // capsule fallback on failure
    );
  });
  return hazmatLoading;
}

// ---- Locomotion states ------------------------------------------------------
// One vocabulary for BOTH bodies (the local viewmodel and every peer): a state
// name → the clip that plays it, with fallbacks so a missing file degrades to
// the old behaviour instead of a T-pose. Directional states exist because a
// strafing or backpedalling player used to play the forward walk — feet
// sliding sideways under a body marching ahead.
const MOVE_CLIP: Record<string, string[]> = {
  idle: ["idle"],
  walk: ["walking"],
  walkback: ["walking-back", "walking"],
  walkleft: ["walking-left", "walking"],
  walkright: ["walking-right", "walking"],
  run: ["running", "walking"],
  runback: ["running-back", "walking-back", "running"],
  runleft: ["running-left", "running"],
  runright: ["running-right", "running"],
  crouchidle: ["crouch-idle", "idle"],
  crouchwalk: ["crouch-walking", "walking"],
  crouchback: ["crouch-back", "crouch-walking"],
  crouchleft: ["crouch-left", "crouch-walking"],
  crouchright: ["crouch-right", "crouch-walking"],
  jump: ["jump", "idle"],
  // WAIST-DEEP OR MORE = the stroke (Josh, Aug 2026): the flag is set from
  // water depth in the peer loop, not from the swim pose — you start swimming
  // visually before your feet leave the floor. One clip for every direction
  // (measured in-place on the bench: root drift 0,0,0 over the 4.5s loop).
  swim: ["swimming", "walking"],
  // Afloat but going nowhere (or only up/down — vertical is not a direction,
  // Josh's rule): tread water. Also in-place on the bench, 3s loop.
  tread: ["treading", "idle"],
  // ABOARD A BOAT (Josh's Sitting Pose, Aug 2026): like crouch-idle it's a
  // single-frame Mixamo pose (0.03s, 19 tracks, bench-verified on this rig) —
  // a held sit, knees up, hands on knees. Crouch is the degraded fallback.
  sit: ["sitting", "crouch-idle"],
  // SEATED ON A CHAIR/STOOL (the casino floor, Josh's call 2026-08-06): the
  // ANIMATED Mixamo Sitting Idle — breathing, shifting — not the boat's
  // frozen pose. The boat pose is the fallback.
  sitidle: ["sitting-idle", "sitting", "crouch-idle"],
};
// DRUNK (the casino bar) — appended from casino/drunkclips.ts rather than
// written out here, so its table is the only place that knows which clip a
// drunk body plays. Each falls back THROUGH its sober twin's own chain, so a
// missing file costs sway, not a T-pose.
for (const [state, c] of Object.entries(DRUNK_CLIPS)) {
  MOVE_CLIP[state] = [c.file, ...(MOVE_CLIP[c.sober] ?? ["idle"])];
}
// ARMED (the casino gun) — same treatment, from casino/gunclips.ts.
for (const [state, c] of Object.entries(GUN_CLIPS)) {
  MOVE_CLIP[state] = [c.file, ...(MOVE_CLIP[c.sober] ?? ["idle"])];
}
export const MOVE_STATES = Object.keys(MOVE_CLIP);

/** Build every locomotion action for a mixer over the shared clip set. All
 *  actions run looped forever at weight 0 (the established pattern — blending
 *  by weight, never `paused`); the reversed crouch-back clone gets its
 *  negative timeScale here. */
function buildMoveActions(mixer: THREE.AnimationMixer): Record<string, THREE.AnimationAction | null> {
  const byName = new Map(hazmatBase!.clips.map((c) => [c.name, c]));
  const out: Record<string, THREE.AnimationAction | null> = {};
  for (const [state, candidates] of Object.entries(MOVE_CLIP)) {
    const clip = candidates.map((n) => byName.get(n)).find(Boolean) ?? null;
    if (!clip) {
      out[state] = null;
      continue;
    }
    const act = mixer.clipAction(clip);
    if (clip.name === "crouch-back") act.timeScale = -1;
    act.play();
    act.setEffectiveWeight(0);
    out[state] = act;
  }
  return out;
}

/** Bucket a world-space move direction into a locomotion suffix given the
 *  body's facing (same yaw convention as the player: 0 faces -Z). Forward
 *  wins ties, so diagonals read as forward movement. */
export function moveSuffix(dx: number, dz: number, heading: number): "" | "back" | "left" | "right" {
  const f = dx * -Math.sin(heading) + dz * -Math.cos(heading);
  const r = dx * Math.cos(heading) + dz * -Math.sin(heading);
  if (Math.abs(f) >= Math.abs(r)) return f >= 0 ? "" : "back";
  return r > 0 ? "right" : "left";
}

// ---- Emotes ------------------------------------------------------------------
// THE EMOTE WHEEL (Josh, Aug 2026). ELEVEN dances, lazy-loaded on first use
// (they're another 4MB the boot path shouldn't pay for). Root motion is
// KEPT: every dance was measured returning to its start point (drift 0 on the
// bench), so Gangnam's side-hops read true and nothing drifts — the body
// dances AROUND its anchor and the anchor never moves, because the player
// can't move while emoting.
//
// The four floor moves Josh added (freeze/house/soul/snake) were measured the
// same way before they were wired: all four end where they start, and none
// leaves the ground for longer than the move itself. The two ACROBATIC ones
// swing wider than the standing dances — the freeze and the soul combo carry
// the body up to ~2.2m from its anchor mid-move, against ~1.2m for Hip Hop —
// which is why they belong in a room, not in a 2m backrooms corridor. That is
// a judgement about where you dance, not a bug: the anchor is unmoved and the
// body is back on it by the last frame.
export const EMOTES: { id: string; label: string }[] = [
  { id: "hiphop", label: "Hip Hop" },
  { id: "gangnam", label: "Gangnam" },
  { id: "twerk", label: "Twerk" },
  { id: "backflip", label: "Backflip" },
  { id: "chicken", label: "Chicken" },
  { id: "silly", label: "Silly" },
  { id: "bboy", label: "Bboy" },
  { id: "house", label: "House" },
  { id: "snake", label: "Snake" },
  { id: "soul", label: "Soul" },
  { id: "freeze", label: "Freeze" },
];
export const EMOTE_IDS = new Set(EMOTES.map((e) => e.id));

const emoteClips = new Map<string, Promise<THREE.AnimationClip | null>>();
/** Fetch (once) an emote clip by id. Resolves null on a missing file. */
export function loadEmoteClip(id: string): Promise<THREE.AnimationClip | null> {
  let p = emoteClips.get(id);
  if (!p) {
    p = new Promise((resolve) => {
      if (!EMOTE_IDS.has(id)) return resolve(null);
      new FBXLoader().load(
        `/assets/hazmat/emote/${id}.fbx`,
        (fbx) => {
          const c = fbx.animations?.[0] ?? null;
          if (c) c.name = `emote-${id}`;
          resolve(c);
        },
        undefined,
        () => resolve(null),
      );
    });
    emoteClips.set(id, p);
  }
  return p;
}

/** The local player's THIRD-PERSON stand-in for the emote camera. The
 *  first-person viewmodel can't be filmed — its mask faces are CUT from the
 *  mesh at build (you'd watch a headless man dance) — so the emote swaps in
 *  a fresh full-headed clone, exactly what peers see, and hides the
 *  viewmodel until the dance ends. Built once per run, reused. */
export interface EmoteBody {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction | null;
}
export function makeEmoteBody(suitColor = "yellow"): EmoteBody | null {
  if (!hazmatBase) return null;
  const model = cloneSkeleton(hazmatBase.object) as THREE.Group;
  const mat = suitMaterial(suitColor);
  model.traverse((o) => {
    if (o instanceof THREE.Mesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
      (o as THREE.Mesh).material = mat;
      (o as THREE.Mesh).frustumCulled = false;
    }
  });
  const scale = 1.72 / hazmatBase.height;
  model.scale.setScalar(scale);
  model.rotation.y = Math.PI; // rig faces +Z; the group's forward is -Z
  model.position.y = -hazmatBase.minY * scale; // soles on the group origin
  const group = new THREE.Group();
  group.add(model);
  return { group, mixer: new THREE.AnimationMixer(model), action: null };
}

/** Play an emote clip ONCE on an emote body / avatar mixer. Returns the
 *  action (clamped on its last frame — the caller watches for the finish). */
export function playEmote(mixer: THREE.AnimationMixer, clip: THREE.AnimationClip): THREE.AnimationAction {
  const act = mixer.clipAction(clip);
  act.reset();
  act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = true;
  act.setEffectiveWeight(1);
  act.play();
  return act;
}

interface SwingBone {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  /** Swing amplitude in radians; sign sets phase (L vs R). */
  amp: number;
  /** Phase offset within the stride cycle. */
  phase: number;
}

export interface PeerAvatar {
  group: THREE.Group;
  target: THREE.Vector3;
  /** Pose 3 off the wire — the body hangs at the waterline, not the floor. */
  swimming?: boolean;
  /** Pose 4 — seated in a rowboat, just above the waterline. */
  aboard?: boolean;
  /** Seated on furniture (the casino floor) — the ANIMATED sitting idle,
   *  unlike the boat's static pose. Never set in the backrooms. */
  seated?: boolean;
  /** Off the casino floor's wire: this body has had a few. Swaps standing and
   *  straight-line locomotion for the drunk clips. Never set in the backrooms. */
  drunk?: boolean;
  /** A pistol in the right hand (the casino gun) — swaps straight-line
   *  locomotion for the armed clips. Drunk outranks it (see gunclips.ts).
   *  Never set in the backrooms. */
  armed?: boolean;
  /** The pass-out ragdoll seed off the casino wire (0 = none yet). The victim
   *  generates it as they fold and every observer — including a newcomer
   *  reading it from the welcome frame — replays the identical collapse.
   *  Never set in the backrooms (its deaths carry seeds on their own event). */
  downSeed?: number;
  /** Stable per-body number (their user id). Only used to stagger the drunk
   *  idle rotation, so two people propping up the same bar don't shift their
   *  weight on the same frame. */
  salt?: number;
  /** WAIST-DEEP OR MORE (set from water depth in the peer loop, Josh's rule)
   *  — the stroke plays, whatever the feet are doing. */
  swim?: boolean;
  /** The floating name sprite. It draws with depthTest OFF so it isn't eaten
   *  by the avatar's own head — which also meant it shone THROUGH walls,
   *  quietly reporting everyone's position. The game screen hides it when
   *  anything solid is in the way (see the occlusion cache in its loop). */
  tag: THREE.Sprite;
  heading: number;
  mixer: THREE.AnimationMixer | null;
  /** Every locomotion action, keyed by MOVE_STATES name (walk/runleft/…). */
  acts: Record<string, THREE.AnimationAction | null>;
  /** Emote id off the wire ("" = none). While set, the dance owns the body. */
  emote: string;
  emoteAction: THREE.AnimationAction | null;
  /** Reported body pose (0 stand · 1 crouch · 2 airborne) — from the wire. */
  pose: number;
  /** Last pose tickAvatar saw, so entering the air can restart the jump clip
   *  (every action runs looped forever at weight 0; without the reset a jump
   *  would join the clip at whatever phase it happened to be in). */
  lastPose: number;
  walking: boolean;
  /** Procedural stride — only used if the clip files are missing. */
  swings: SwingBone[];
  stride: number;
  /** Held equipment, replicated off the pos wire ("kind" or "kind!" while
   *  in use). The model hangs off the right hand like the viewmodel's. */
  hand: THREE.Object3D | null;
  heldObj: THREE.Object3D | null;
  equip: string;
  /** Right-arm chain — peers pose the arm to match the gear state (walkie
   *  up beside the head, camera to the face, flashlight extended…). */
  upperArm: THREE.Object3D | null;
  foreArm: THREE.Object3D | null;
  /** True speed from the wire (m/s between pos frames) — the old lag-based
   *  guess could NEVER pick the run clip: the lerp's steady-state lag at a
   *  full sprint (0.57m) sat under the 0.75m threshold, so sprinting peers
   *  walked (Josh's catch). */
  wireSpeed: number;
  /** The wading drag at the peer's own cell (1 dry, 0.78 shin-deep, 0.55
   *  waist-deep — the local player's own factors). A wading sprint arrives
   *  slower than the run threshold, so the threshold scales with it, or a
   *  peer sprinting through water reads as walking (law 5). */
  wade: number;
  lastPosAt: number;
  /** Look pitch off the wire, played onto the head/chest each frame so a
   *  peer's mask points where they're actually looking (Josh's photos: he
   *  stared dead-centre at a friend; the friend saw him facing elsewhere). */
  pitch: number;
  head: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  /** Baseline pose restored before the mixer each frame — the accumulation
   *  rule (weights underflow to zero on long-held states, and the head-aim
   *  premultiply below must never pile up). */
  rest: { bone: THREE.Object3D; q: THREE.Quaternion }[];
}

/** Swap a peer's visible held item to match their wire state. Returns true
 *  when the KIND changed (the caller may play a swap sound if it likes). */
export function setAvatarEquip(a: PeerAvatar, equip: string): void {
  if (equip === a.equip) return;
  const kind = equip.endsWith("!") ? equip.slice(0, -1) : equip;
  const prevKind = a.equip.endsWith("!") ? a.equip.slice(0, -1) : a.equip;
  a.equip = equip;
  if (kind === prevKind) return; // only the active flag changed
  a.heldObj?.parent?.remove(a.heldObj);
  a.heldObj = null;
  if (kind && a.hand) a.heldObj = attachToHand(a.hand, kind);
}

/** Per-color suit materials, built once from the pack texture through the
 *  shared recolor filter (suitcolor.ts) — so what the shop showed is exactly
 *  what walks around the corner. */
const suitMats = new Map<string, THREE.MeshStandardMaterial>();
function suitMaterial(color: string): THREE.MeshStandardMaterial {
  const key = color || "yellow";
  const hit = suitMats.get(key);
  if (hit) return hit;
  const { canvas, ready } = suitCanvas(key);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; // the PS1 crunch
  void ready.then(() => (tex.needsUpdate = true));
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  suitMats.set(key, mat);
  return mat;
}

export function makeAvatar(scene: THREE.Scene, name: string, suitColor = "yellow"): PeerAvatar {
  const group = new THREE.Group();
  // Name tag: a small canvas sprite floating overhead. Built before the avatar
  // record so the game screen can toggle it for wall occlusion.
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(20,16,8,0.55)";
  ctx.fillRect(0, 6, 256, 44);
  ctx.fillStyle = "#e8dcae";
  ctx.fillText(name.slice(0, 16), 128, 38);
  const tagTex = new THREE.CanvasTexture(canvas);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthTest: false }));
  tag.scale.set(1.5, 0.33, 1);
  tag.position.y = 2.15;
  group.add(tag);

  const avatar: PeerAvatar = {
    group,
    target: new THREE.Vector3(),
    tag,
    heading: 0,
    mixer: null,
    acts: {},
    emote: "",
    emoteAction: null,
    pose: 0,
    lastPose: 0,
    walking: false,
    swings: [],
    stride: Math.random() * Math.PI * 2, // nobody marches in sync
    hand: null,
    heldObj: null,
    equip: "",
    upperArm: null,
    foreArm: null,
    wireSpeed: 0,
    wade: 1,
    lastPosAt: 0,
    pitch: 0,
    head: null,
    chest: null,
    rest: [],
  };

  const placeholder = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.05, 4, 12), bodyMat);
  placeholder.position.y = 0.9;
  group.add(placeholder);

  void loadHazmat().then(() => {
    if (!hazmatBase || !group.parent) return; // failed, or peer already gone
    group.remove(placeholder);
    placeholder.geometry.dispose();
    const model = cloneSkeleton(hazmatBase.object) as THREE.Group;
    // Wear the color they bought (the clone shares the base material until
    // we swap it — SkeletonUtils copies material references, not materials).
    const mat = suitMaterial(suitColor);
    model.traverse((o) => {
      if (o instanceof THREE.Mesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
        (o as THREE.Mesh).material = mat;
        // Same rule as the viewmodel/emote/ragdoll bodies: a skinned bounding
        // sphere culls mid-animation limbs — a dance the dancer sees whole
        // must not pop at the edge of anyone else's screen.
        o.frustumCulled = false;
      }
    });
    const scale = 1.72 / hazmatBase.height; // suit up to human height
    model.scale.setScalar(scale);
    // The FBX is authored facing the OTHER way (players saw each other's
    // backs — Josh's live catch), and its pivot isn't at the feet: flip
    // 180° and drop the soles to the carpet.
    model.rotation.y = Math.PI;
    model.position.y = -hazmatBase.minY * scale;
    group.add(model);
    // The right hand (replicated equipment), the head + chest (look-pitch),
    // and the highest bone as the head like the viewmodel does.
    let headY = -Infinity;
    model.updateMatrixWorld(true);
    const HV = new THREE.Vector3();
    model.traverse((o) => {
      if (o.name === "DEF-handR") avatar.hand = o;
      if (o.name === "DEF-upper_armR") avatar.upperArm = o;
      if (o.name === "DEF-forearmR") avatar.foreArm = o;
      if (o.name === "DEF-spine003") avatar.chest = o;
      if (!(o as THREE.Bone).isBone) return;
      const y = o.getWorldPosition(HV).y;
      if (y > headY) {
        headY = y;
        avatar.head = o;
      }
    });
    if (avatar.equip && avatar.hand) {
      const kind = avatar.equip.endsWith("!") ? avatar.equip.slice(0, -1) : avatar.equip;
      if (kind) avatar.heldObj = attachToHand(avatar.hand, kind);
    }
    if (hazmatBase.clips.length) {
      avatar.mixer = new THREE.AnimationMixer(model);
      // Weight, not `paused`: paused actions still contribute their pose, so
      // the old pause-toggling left two clips fighting over the skeleton.
      avatar.acts = buildMoveActions(avatar.mixer);
      avatar.acts.idle?.setEffectiveWeight(1);
      // A peer already emoting when their model resolves (joined mid-dance).
      if (avatar.emote) setAvatarEmote(avatar, avatar.emote, true);
      // Baseline snapshot — the accumulation rule (see PeerAvatar.rest).
      avatar.mixer.update(0);
      model.traverse((o) => {
        if ((o as THREE.Bone).isBone) avatar.rest.push({ bone: o, q: o.quaternion.clone() });
      });
    } else {
      // No clips in the FBX (rigged only) — drive the stride procedurally.
      // Blender-style bone names: thigh/shin/upper_arm/forearm .L/.R.
      const SWING: [string, number, number][] = [
        ["thigh.L", 0.55, 0],
        ["thigh.R", 0.55, Math.PI],
        ["shin.L", 0.45, Math.PI * 0.55],
        ["shin.R", 0.45, Math.PI * 1.55],
        ["upper_arm.L", 0.3, Math.PI],
        ["upper_arm.R", 0.3, 0],
        ["forearm.L", 0.18, Math.PI * 1.3],
        ["forearm.R", 0.18, Math.PI * 0.3],
      ];
      model.traverse((o) => {
        const hit = SWING.find(([name]) => o.name === name || o.name === name.replace(".", ""));
        if (hit) {
          avatar.swings.push({ bone: o, rest: o.quaternion.clone(), amp: hit[1], phase: hit[2] });
        }
      });
    }
  });

  scene.add(group);
  return avatar;
}

/** A suited, posed, UNANIMATED body for the ragdoll (Aug 2026): the same
 *  skeleton clone a peer wears, struck into the idle pose and dropped at the
 *  death spot inside an IDENTITY group — bone world space IS scene space,
 *  which is the frame the ragdoll sim drives bones in. No tag, no live mixer
 *  to fight the sim. `onReady` fires once the skeleton exists (the hazmat
 *  loads async, though in practice it's resident long before anyone dies). */
export function makeRagdollBody(
  scene: THREE.Scene,
  suit: string,
  x: number, // cells
  y: number, // cells
  feetY: number, // world metres
  heading: number,
  onReady: (model: THREE.Object3D) => void,
): THREE.Group {
  const group = new THREE.Group();
  scene.add(group);
  void loadHazmat().then(() => {
    if (!hazmatBase || !group.parent) return;
    const model = cloneSkeleton(hazmatBase.object) as THREE.Group;
    const mat = suitMaterial(suit);
    model.traverse((o) => {
      if (o instanceof THREE.Mesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
        (o as THREE.Mesh).material = mat;
        // The bones fly metres from the mesh origin — the stock bounding
        // sphere would cull the body mid-launch.
        o.frustumCulled = false;
      }
    });
    const scale = 1.72 / hazmatBase.height;
    model.scale.setScalar(scale);
    model.rotation.y = Math.PI + heading; // the FBX facing flip + their last look
    model.position.set(x * CELL, feetY - hazmatBase.minY * scale, y * CELL);
    // Strike the idle pose once, then never animate again.
    if (hazmatBase.clips.length) {
      const idle = hazmatBase.clips.find((c) => c.name === "idle");
      if (idle) {
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(idle).play();
        mixer.update(0);
        mixer.stopAllAction();
      }
    }
    group.add(model);
    model.updateMatrixWorld(true);
    onReady(model);
  });
  return group;
}

// ---- THE PEER-TORCH POOL ----------------------------------------------------
// Peer flashlights used to be a SpotLight parented to each avatar, created on
// the first lit frame and visible-toggled after — and a visible-light-count
// change (worse: a SHADOW-count change) recompiles every material in the
// scene. In the escape complex that was a multi-hundred-ms freeze every time
// anybody clicked their torch (Josh, Aug 2026: "it keeps freezing"). The
// lights now live in a fixed pool the GAME installs at scene build — always
// visible, so the shader is compiled against them exactly once; an unlit slot
// idles at intensity 0, parked under the floor so its shadow pass draws
// nothing. A lit peer torch claims a slot each frame; more lit torches than
// slots means the farthest ones don't throw light, which beats any of them
// freezing the room.
interface TorchSlot { l: THREE.SpotLight; tgt: THREE.Object3D; owner: PeerAvatar | null }
let torchSlots: TorchSlot[] = [];
const TORCH_PARK_Y = -60;
/** Install the pool into a scene at build time. Returns an uninstaller (the
 *  lights die with the scene; this just stops tickAvatar reaching for them).
 *  A game that never installs one simply has lightless peer torches — the
 *  old strictly-local rule, never a crash. */
export function installAvatarTorchPool(scene: THREE.Scene, n = 4): () => void {
  const slots: TorchSlot[] = [];
  for (let i = 0; i < n; i++) {
    const l = new THREE.SpotLight(0xfff0c8, 0, 20, 0.5, 0.65, 1.0);
    l.castShadow = true;
    l.shadow.mapSize.set(512, 512);
    l.shadow.camera.near = 0.4;
    l.shadow.camera.far = 22;
    l.shadow.bias = -0.0015;
    l.position.set(0, TORCH_PARK_Y, 0);
    const tgt = new THREE.Object3D();
    tgt.position.set(0, TORCH_PARK_Y - 8, 0);
    l.target = tgt;
    scene.add(l);
    scene.add(tgt);
    slots.push({ l, tgt, owner: null });
  }
  torchSlots = slots;
  return () => {
    if (torchSlots === slots) torchSlots = [];
  };
}
const releaseTorch = (a: PeerAvatar): void => {
  for (const s of torchSlots) {
    if (s.owner !== a) continue;
    s.owner = null;
    s.l.intensity = 0;
    s.l.position.set(0, TORCH_PARK_Y, 0);
    s.tgt.position.set(0, TORCH_PARK_Y - 8, 0);
  }
};

export function disposeAvatar(scene: THREE.Scene, a: PeerAvatar): void {
  a.mixer?.stopAllAction();
  scene.remove(a.group);
  releaseTorch(a);
  a.group.traverse((o) => {
    if (o instanceof THREE.Sprite) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}

/** Per-frame peer animation: glide to the reported spot, and swap between
 *  walk/idle by whether the avatar is actually covering ground. Clips play
 *  if the model has them; otherwise the procedural stride swings the rig. */
const SWING_TMP = new THREE.Quaternion();
const SWING_AXIS = new THREE.Vector3(1, 0, 0);
const SWING_TMP_V = new THREE.Vector3();
const AIM_TMP_V = new THREE.Vector3();
const AIM_TMP_Q = new THREE.Quaternion();

// ---- ARM IK: the solver lives in lib/ik.ts now (the Survivorz show bends legs with it too)
export { armIK };
const ARM_TGT = new THREE.Vector3();
const GRIP_Q = new THREE.Quaternion();
const GRIP_Q2 = new THREE.Quaternion();
const GRIP_PQ = new THREE.Quaternion();
const GRIP_E = new THREE.Euler();
const GRIP_TILT = new THREE.Euler();
/** Where a restarted jump clip begins: AT TAKEOFF. Measured on the bench (the
 *  root-Y curve of the clip): 0–0.64s is the windup crouch, the root crosses
 *  its rest height rising at ~0.72s, apex 1.04s, landing ~1.28s. The first
 *  guess of 0.35 started deep in the windup, so an in-game jump (~0.77s of
 *  air) spent its first half showing the character CROUCHING — which is
 *  exactly what it looked like (Josh: the jump played a crouch). From 0.72
 *  the visible slice is rise → apex → land, matching the physics arc. */
const JUMP_CLIP_START = 0.72;

// ---- FIRST-PERSON ARMS (the viewmodel) -------------------------------------
// Measured on the animation bench: the hands sit 0.33-0.77m BELOW the head bone
// and 0.2-0.5m to either side, so a camera at head height looking level sees
// NOTHING of them — verified with fp=1, the frame came back empty. Every FPS
// solves this the same way and so does this: the body is parented to the CAMERA
// and shoved up and forward, so the hands ride into the lower third of the
// frame. It is anatomically a lie and it is the only thing that reads correctly.
//
// A REAL BODY, NOT A SHOOTER VIEWMODEL (Josh: "I want to be able to see my feet
// too"). Those two asks pull opposite ways and only one can win per model:
//
//   · A shooter viewmodel lifts and pushes the body so the hands fill the lower
//     frame at level gaze. It also lifts the FEET, so looking down shows boots
//     hovering above the carpet — the classic floating-legs tell.
//   · A real body sits where a body sits. Look down and you see your chest,
//     legs and feet ON the floor; glance down a little further and your hands
//     are there too, because that is where hands are.
//
// The body wins. Confirmed on the bench at the game's real 72-degree FOV: at a
// 45-degree downward glance the chest, an arm and the legs are all in frame —
// but with the head exactly ON the camera, the neck and shoulders crowd the top
// of the lens, because you are standing inside your own collar. So the body
// drops a little and moves a little forward: the camera ends up just above the
// shoulders looking down a real torso.
//
// THE BODY IS ANCHORED ON ITS HEAD, not its feet. This is what was actually
// wrong: peers are positioned with `-minY * scale`, which stands their FEET on
// the group origin — correct for someone standing on carpet. The viewmodel
// reused it, so the feet were pinned to the CAMERA and, measured on the bench,
// the head ended up 1.50m overhead. The body was towering above the lens the
// whole time, which is why no tweak of a few centimetres ever helped.
//
// The head bone's height is measured per model and subtracted, so the eyes land
// on the camera whatever the model or scale.
//
// TUNING, in camera space — the camera is the origin looking down -Z:
//   VM_LIFT  more NEGATIVE = body lower = more of yourself in frame
//   VM_PUSH  more NEGATIVE = body further in FRONT of the lens
// Positive VM_PUSH puts the body behind the camera, where nothing is visible.
const VM_LIFT = -0.06;
const VM_PUSH = -0.05;

export interface Viewmodel {
  group: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction | null>;
  /** EVERY bone's baseline pose, restored each frame BEFORE the mixer (the
   *  entity's accumulation rule, viewmodel edition). placeViewmodel
   *  PREMULTIPLIES look-pitch into the spine and head; while crouched-idle
   *  the other actions' weights underflow to zero and that single-frame
   *  pose clip doesn't cover every bone — the mixer stops writing them and
   *  the pitch multiplies accumulated ("holding crouch for a while makes
   *  the model start moving"). Reset everything, every frame. */
  rest: { bone: THREE.Object3D; q: THREE.Quaternion }[];
  /** The right hand bone, for hanging a held item off (see attachToHand). */
  hand: THREE.Object3D | null;
  /** Right-arm chain for the held-item IK (armIK): the arm visibly reaches
   *  to wherever the item is posed, instead of hanging at the side while
   *  gear floats. */
  upperArm: THREE.Object3D | null;
  foreArm: THREE.Object3D | null;
  /** Head and upper spine, so looking down PIVOTS the head and leans the
   *  body instead of rotating the whole man like a turret. */
  head: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  // The mask/hood is no longer hidden by bone tricks — its FACES are cut out
  // of the viewmodel's own geometry clone at build time (see the NECK_CUT pass
  // in makeViewmodel). The old scale-to-0.0001 collapse left every vertex that
  // was only PARTIALLY weighted to the collapsed bones stretched toward the
  // collapse point — giant hood-lining polygons that swung into view past ~55°
  // of down-look — and three rounds of moving the collapse point (world -Y,
  // bone-local -Y, anchored to mid-torso) each just relocated the artifact.
  // No collapsed bones → no stretch, by construction.
  /** Head height in scaled model space at REST — where the eyes are standing. */
  eye: number;
  /** The head bone's group-space position on the IDLE clip's first frame —
   *  the calibration for the head PIN (see placeViewmodel). Every clip moves
   *  the head somewhere else (crouch drops it 0.52m and pushes it forward,
   *  run leans it, jump throws it around); the delta from this rest is
   *  counter-applied to the whole body so the mask keeps exactly the same
   *  relationship to the lens in every pose. Bind pose is the wrong
   *  calibration — it stands 0.14m taller than the idle stance — so this is
   *  captured after one mixer update with the idle action at weight 1. */
  headRest: THREE.Vector3 | null;
  /** How far the CURRENT animation has moved the head from that rest height,
   *  in metres. Negative while crouching. The camera adds this, so the eye
   *  follows the body's actual head through every clip instead of guessing with
   *  a hardcoded crouch offset (Josh: "the pov needs to sync for every
   *  animation... when crouched it needs to match up"). */
  headDrop: number;
  /** How far the ANIMATION has moved this body's head from its idle rest
   *  this frame, in WORLD metres (yaw already applied). placeViewmodel
   *  counters this so the mask keeps its idle relationship to the lens — but
   *  the casino wants to know it: when you are drunk the LENS follows the
   *  stagger, so you see your own body lurch instead of a rock-steady view
   *  over a swaying model (Josh: "make sure too the player from their pov can
   *  see the animations as well of being drunk"). */
  sway: THREE.Vector3;
  state: string;
}

/** Make sure the hazmat model + its clips are in memory. Resolves once, shared
 *  with the peer avatars, so asking for the viewmodel costs no extra download. */
export function ensureHazmat(): Promise<void> {
  return loadHazmat();
}

/** Build the player's own arms. Call after loadHazmat() has resolved; returns
 *  null if the model never arrived, in which case the game simply has no arms
 *  rather than crashing. */
export function makeViewmodel(suitColor = "yellow"): Viewmodel | null {
  if (!hazmatBase) return null;
  const model = cloneSkeleton(hazmatBase.object) as THREE.Group;
  // THE VIEWMODEL GETS ITS OWN MATERIAL, front-faces only and depth-tested
  // normally — NOT the shared peer material. Josh: "at no point should the
  // camera see the inside of the player model." The suit material is fine on
  // someone standing across the room, but the local body has the camera INSIDE
  // its chest cavity, and from in there you are looking at the back of the
  // torso's polygons. THREE.FrontSide means those faces are simply not drawn, so
  // the chest becomes invisible from within and solid from without — which is
  // exactly the illusion wanted. The clone also keeps peers unaffected.
  const vmMat = suitMaterial(suitColor).clone();
  vmMat.side = THREE.FrontSide;
  model.traverse((o) => {
    if (o instanceof THREE.Mesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
      (o as THREE.Mesh).material = vmMat;
      // Skinned bounds lie, and a viewmodel is always on camera anyway.
      (o as THREE.Mesh).frustumCulled = false;
    }
  });
  const scale = 1.72 / hazmatBase.height;
  model.scale.setScalar(scale);
  // Face the way the camera looks (three cameras look down -Z; the rig faces
  // +Z in its own space, which the bench proved by rendering the inside of the
  // torso when this was missed).
  model.rotation.y = Math.PI;

  const group = new THREE.Group();
  group.add(model);
  const vm: Viewmodel = {
    group, mixer: null, actions: {}, rest: [], hand: null, upperArm: null, foreArm: null, head: null, spine: null, eye: 1.6, headDrop: 0, headRest: null, sway: new THREE.Vector3(), state: "",
  };

  // Find the head (highest bone), the right hand and the upper spine in one pass.
  let headY = -Infinity;
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (o.name === "DEF-handR") vm.hand = o;
    if (o.name === "DEF-upper_armR") vm.upperArm = o;
    if (o.name === "DEF-forearmR") vm.foreArm = o;
    if (o.name === "DEF-spine003") vm.spine = o; // upper chest — where a lean starts
    if (!(o as THREE.Bone).isBone) return;
    const y = o.getWorldPosition(new THREE.Vector3()).y;
    if (y > headY) {
      headY = y;
      vm.head = o;
    }
  });

  // CUT THE MASK OUT OF THE MESH — the structural fix for "I can see my own
  // head / the inside of myself". Rigify naming: spine004 is the NECK and
  // spine006 the HEAD; the helmet is weighted across both. Every face whose
  // three corners all carry meaningful neck+head weight is dropped from the
  // viewmodel's OWN geometry clone (peers share the base geometry and keep
  // their heads). The faces that remain are at most lightly neck-influenced,
  // so with the bones left alone they render at their true collar/shoulder
  // positions — no collapse, no stretch. The FBX geometry is non-indexed
  // (3 vertices per face), which the filter below relies on.
  const NECK_CUT = 0.2;
  model.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    const i4 = sm.skeleton.bones.findIndex((b) => b.name === "DEF-spine004");
    const i6 = sm.skeleton.bones.findIndex((b) => b.name === "DEF-spine006");
    if (i4 < 0 && i6 < 0) return;
    const src = sm.geometry;
    if (src.index) return; // never expected (FBX) — bail rather than mis-cut
    const si = src.attributes.skinIndex as THREE.BufferAttribute;
    const sw = src.attributes.skinWeight as THREE.BufferAttribute;
    const neckW = (v: number): number => {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        const bi = si.getComponent(v, k);
        if (bi === i4 || bi === i6) w += sw.getComponent(v, k);
      }
      return w;
    };
    const keep: number[] = [];
    const faces = src.attributes.position.count / 3;
    for (let f = 0; f < faces; f++) {
      const a = f * 3;
      if (!(neckW(a) > NECK_CUT && neckW(a + 1) > NECK_CUT && neckW(a + 2) > NECK_CUT)) keep.push(f);
    }
    if (keep.length === faces) return; // nothing to cut
    const cut = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) {
      const a = attr as THREE.BufferAttribute;
      const Arr = a.array.constructor as new (n: number) => typeof a.array;
      const out = new Arr(keep.length * 3 * a.itemSize);
      for (let i = 0; i < keep.length; i++) {
        for (let v = 0; v < 3; v++) {
          for (let c = 0; c < a.itemSize; c++) {
            out[(i * 3 + v) * a.itemSize + c] = a.array[(keep[i] * 3 + v) * a.itemSize + c];
          }
        }
      }
      cut.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, a.normalized));
    }
    sm.geometry = cut; // the clone's own; the shared source is untouched
  });
  // THE NECK PLUG. Cutting the mask leaves the collar as an open tube, and a
  // crouched max-down-look stares straight into it — dark interior polygons,
  // exactly the "inside of the model" this whole effort removes. A flat disc
  // riding the NECK BONE caps the tube; from above it reads as the sealed top
  // of the collar. DoubleSide so no angle sees through it, dark like the
  // suit's rubber seals. Sized/offset in bone-local units (the bone's world
  // scale is the model's ~0.011, so 10 units ≈ 11cm).
  {
    const neckBone = model.getObjectByName("DEF-spine004");
    if (neckBone) {
      // A SPHERE, not a disc: the DEF bones' local axes are undocumented and
      // the crouch pose tilts the neck hard, so any flat cap ends up edge-on
      // from some angle (both tried, both failed). A ball has no facing — it
      // fills the tube mouth from every direction and reads as the suit's
      // rubber neck seal. Bone-local units (~0.011 world scale: 8 ≈ 9cm).
      const plug = new THREE.Mesh(
        new THREE.SphereGeometry(8, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.95 }),
      );
      plug.position.y = -3; // nested just below the collar line
      plug.frustumCulled = false;
      neckBone.add(plug);
    }
  }
  // Drop the body so its EYES are at the camera. Without this the feet are at
  // the camera and the head is 1.5m up — see the note above VM_LIFT.
  vm.eye = Number.isFinite(headY) ? headY : 1.6 - hazmatBase.minY * scale;
  model.position.set(0, -vm.eye + VM_LIFT, 0);

  if (hazmatBase.clips.length) {
    vm.mixer = new THREE.AnimationMixer(model);
    // The full 8-way set, shared with the peers (MOVE_CLIP): walk/run in all
    // four directions, crouch fwd/left/right + the reversed-forward back.
    // NOTE crouch-idle.fbx is a 0.03s SINGLE-FRAME POSE (measured on the
    // bench: zero motion) — it holds a proper crouch but never sways;
    // replacing the file with a real Mixamo "Crouching Idle" export will
    // animate here with no code change.
    vm.actions = buildMoveActions(vm.mixer);
    vm.actions.idle?.setEffectiveWeight(1);
    vm.state = "idle";
    // Calibrate the head pin on the idle stance (see Viewmodel.headRest): one
    // zero-length mixer update writes idle's first frame, and the head's
    // group-space position there is the rest the pin holds every other pose
    // to. The group is untransformed at this point, so world == group space.
    if (vm.head) {
      vm.mixer.update(0);
      group.updateMatrixWorld(true);
      vm.headRest = vm.head.getWorldPosition(new THREE.Vector3());
    }
    // Baseline snapshot for the per-frame reset (see Viewmodel.rest).
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) vm.rest.push({ bone: o, q: o.quaternion.clone() });
    });
  }
  return vm;
}

// A PHYSICALISED BODY, not a camera-mounted prop (Josh: "it's like you are
// physicalizing the body and letting the player control it").
//
// The body used to be a CHILD of the camera, which meant it inherited PITCH:
// look down and the whole man tipped forward with the view like a turret, so he
// could never appear to look down at anything. Now the body lives in the scene
// and only follows the camera's POSITION and YAW. Pitch goes where it goes on a
// real person — the HEAD pivots, and the chest leans a fraction of the way after
// it. That is what makes it read as a body you are steering.
//
// The camera also sits just IN FRONT of the mask now (VM_BACK), so you are never
// inside the head looking out through the skull.
// THE HEAD IS CUT OUT OF THE MESH, not dodged. Getting the lens "just in front
// of the mask" cannot be done by moving the camera, and the bench proved both
// failures: sit the body 0.16m back and the mask fills the middle of the frame;
// sit it 0.24m back and the whole torso falls behind the lens and nothing
// renders at all. The head is directly above the chest, so any camera that
// excludes one excludes the other.
//
// So the mask's FACES are removed from the viewmodel's geometry clone at build
// (NECK_CUT in makeViewmodel). The first approach scaled the head bone to
// nothing instead — and every vertex only PARTIALLY weighted to the collapsed
// bones was left stretched toward the collapse point, which is what "I can see
// the inside of myself" was. With the faces gone the bones animate normally.
//
// With the head gone the body can sit essentially AT the eye, which is what
// makes looking down read like looking down at your own chest.
// Raised 0.02 → 0.07 (Josh, from a POV screenshot: the collar's cut rim sat
// dead-centre when looking down — "the camera needs to be pushed a little
// further"). Tuned live against two angles: at 0.02 the collar peak owned the
// middle of a moderate down-look; at 0.10 a crouched max-down-look was all
// lap. 0.07 clears the collar from the standing view and keeps the crouched
// self-look proportioned.
const VM_BACK = 0.07; // metres the body sits behind the lens
// LEAN, and it does more than look good. THREE.FrontSide was already the
// default, so forcing it changed nothing — what Josh sees looking down is not
// the inside of the mesh, it is the OUTSIDE of his own chest at 10cm, which
// fills the lens and reads as being inside it. His own suggestion is the right
// one: leaning tips the torso down and AWAY from the lens, so the chest clears
// the view instead of pressing against it. At 0.55 the body commits visibly to
// the look — which is also the "physicalised body" feel he asked for.
const VM_LEAN = 0.55; // share of the look-down angle the chest takes on
const HEAD_TMP_Q = new THREE.Quaternion();
const HEAD_TMP_V = new THREE.Vector3();
/** The model sits at (-eye + VM_LIFT), so a head at rest lands here. */
const VM_LIFT_REF = -0.06;
const HEAD_TMP_AXIS = new THREE.Vector3();

/** Put the body where the player is and aim its head where they are looking.
 *  Call every frame AFTER tickViewmodel, since it overrides what the clip did
 *  to the neck. `yaw`/`pitch` are the player's, in radians. */
export function placeViewmodel(
  vm: Viewmodel,
  camPos: THREE.Vector3,
  yaw: number,
  pitch: number,
): void {
  // MEASURE THE HEAD FIRST, before this function overrides the neck pose. The
  // clip has already run (tickViewmodel), so the head bone is wherever crouching,
  // walking or landing has actually put it. The difference from its standing
  // height is what the camera must follow — that is what keeps the eye synced to
  // the animation instead of to a guess.
  //
  // THE HEAD PIN (Josh: the camera must stay synchronized with the model's
  // head through every animation). The head's full group-space offset from
  // its idle rest (vm.headRest) is measured here and COUNTER-APPLIED to the
  // body's placement below, so the mask keeps exactly the idle relationship
  // to the lens in every pose. Before this, the body was anchored to the
  // camera: crouching lowered the camera by the clip's head drop AND the clip
  // lowered the head inside the body — double-counted, so a crouch left the
  // camera 0.72m above the mask while the body's feet sank 0.52m through the
  // floor (measured live). The pin cancels the body-internal movement; the
  // camera's own drop (headDrop → eyeY) remains the one source of eye motion.
  let swayX = 0;
  let swayY = 0;
  let swayZ = 0;
  if (vm.head) {
    vm.group.updateMatrixWorld(true);
    // Group-space head position — yaw-independent, since the body rotates
    // with the view. Uses last frame's group transform; yaw moves little in
    // one frame and the clip pose itself is yaw-invariant.
    const local = vm.group.worldToLocal(vm.head.getWorldPosition(HEAD_TMP_V));
    // The eye rides the head's height (relative to the BIND-pose reference —
    // keeping the standing eye height exactly where it has been tuned).
    vm.headDrop = local.y - VM_LIFT_REF;
    if (vm.headRest) {
      swayX = local.x - vm.headRest.x;
      swayY = local.y - vm.headRest.y;
      swayZ = local.z - vm.headRest.z;
    }
  }
  // Stand the body behind the lens, upright, facing where the player faces —
  // then counter the head's in-body movement (the pin): the sway is a
  // group-space vector, rotated by yaw into the world before subtracting.
  // Horizontal forward for this yaw (yaw 0 looks down -Z, as the camera does).
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const swayWX = swayX * cosY + swayZ * sinY;
  const swayWZ = -swayX * sinY + swayZ * cosY;
  vm.sway.set(swayWX, swayY, swayWZ);
  vm.group.position.set(
    camPos.x - fx * VM_BACK - swayWX,
    camPos.y - swayY,
    camPos.z - fz * VM_BACK - swayWZ,
  );
  vm.group.rotation.set(0, yaw, 0); // YAW ONLY — never pitch the whole body

  // The head takes the full look angle, the chest a fraction of it. Rotating
  // about the WORLD-right axis converted into each bone's parent space, rather
  // than a guessed local axis: this rig's bones are DEF-* with no documented
  // orientation, and a guess would tilt the head sideways.
  const worldRight = HEAD_TMP_AXIS.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const apply = (bone: THREE.Object3D | null, angle: number): void => {
    if (!bone || !bone.parent) return;
    const axis = HEAD_TMP_AXIS.copy(worldRight)
      .applyQuaternion(bone.parent.getWorldQuaternion(HEAD_TMP_Q).invert());
    HEAD_TMP_Q.setFromAxisAngle(axis.normalize(), angle);
    bone.quaternion.premultiply(HEAD_TMP_Q);
  };
  // Clamped so an extreme look never snaps the neck through the shoulders.
  const p = Math.max(-1.2, Math.min(0.9, pitch));
  apply(vm.spine, p * VM_LEAN);
  apply(vm.head, p * (1 - VM_LEAN));
  // …and step the whole body back as you look further down, so the camera
  // ends up in FRONT of the chest — you see the front of your own suit, not
  // the inside of your shoulders (Josh's screenshot: at full down-look 0.1
  // still left the lens behind the shoulder line; 0.28 puts the chest fully
  // ahead of it). Only on the way DOWN: looking up needs no clearance.
  const duck = Math.max(0, -p);
  vm.group.position.x -= fx * duck * 0.28;
  vm.group.position.z -= fz * duck * 0.28;
  // The mask itself is GONE from this mesh (cut at build — see makeViewmodel),
  // so there is nothing to collapse here: the neck and head bones animate
  // normally, which is also what keeps the eye-height measurement honest.
}

/** Blend the arms toward a state and advance them. Weights, never `paused` — a
 *  paused action still writes its pose and two of those fight each other. */
export function tickViewmodel(vm: Viewmodel, state: string, dt: number): void {
  const target = vm.actions[state] ?? vm.actions.idle ?? null;
  // Entering the air restarts the jump clip at its takeoff (same rule as
  // tickAvatar — a looped action would otherwise be joined mid-flip).
  if (state === "jump" && vm.state !== "jump" && vm.actions.jump) {
    vm.actions.jump.reset();
    vm.actions.jump.time = JUMP_CLIP_START;
  }
  const k = Math.min(1, dt * 10);
  for (const a of Object.values(vm.actions)) {
    if (!a) continue;
    const goal = a === target ? 1 : 0;
    a.setEffectiveWeight(a.getEffectiveWeight() + (goal - a.getEffectiveWeight()) * k);
  }
  vm.state = state;
  // The accumulation rule: reset every bone to baseline, THEN let the mixer
  // overwrite what the current blend actually drives — placeViewmodel's
  // pitch premultiplies then apply fresh on top each frame (see .rest).
  for (const r of vm.rest) r.bone.quaternion.copy(r.q);
  vm.mixer?.update(dt);
}

// ---- Held items ------------------------------------------------------------
// EVERY gear item that has a model now ships, because the big ones turned out
// not to be big for the reason it looked like. Measured, 91-97% of camera,
// flashlight and walkietalkie was TEXTURES — 4K PBR sets on props held at arm's
// length, where 512px is already finer than the screen can resolve. Re-encoding
// them (scripts/shrink-glb.mjs, ffmpeg, no Blender needed) took 75MB down to
// 5.4MB with no visible loss at this size:
//   flashlight    18.9MB -> 1.0MB   walkietalkie  16.9MB -> 0.6MB
//   camera        39.7MB -> 3.8MB   (its 52k verts are the remainder)
// bottle.glb was the exception — 4% textures, 116k verts, so the texture
// re-encoder won 2%. It IS a gear kind though (it's the Almond Water), so it
// got real mesh decimation instead: gltf-transform's meshopt simplify +
// webp textures took it 7.13MB → 0.75MB (116k → 15k verts, no visible loss
// at hand size; only EXT_texture_webp, which GLTFLoader reads natively).
const HELD_FILE: Record<string, string> = {
  spraycan: "/assets/held/spraycan.glb",
  pills: "/assets/held/pills.glb",
  battery: "/assets/held/simple_battery.glb",
  flashlight: "/assets/held/flashlight.glb",
  walkie: "/assets/held/walkietalkie.glb",
  camera: "/assets/held/camera.glb",
  almondwater: "/assets/held/bottle.glb",
};
/** Roughly how long the item should be, in metres — the source models are at
 *  wildly different scales (the bench measured a 92x spread: 4.65 units for the
 *  spraycan against 312.52 for the pills), so each is normalised, never
 *  trusted. */
/** Base rotation per item, [x, y, z] radians, applied before the pose. Only the
 *  items that project along their own axis need one: the torch's model is
 *  already Z-long so it points down the view unrotated, and the can is Y-long so
 *  it is tipped forward to spray where you look. Everything else is left as the
 *  artist built it, standing naturally in the hand. */
const HELD_TILT: Record<string, [number, number, number]> = {
  // BOTH WERE AIMED BACKWARDS (Josh, observed in game — better evidence than my
  // axis measurement, which told me which axis was long but not which END was
  // the business end). These models' "forward" is +Z, and a three.js camera
  // looks down -Z, so anything pointing along its own +Z points back at the
  // player. The torch is turned 180 degrees to face down the view; the can is
  // tipped the other way (+90 instead of -90) so the nozzle leads.
  flashlight: [0, Math.PI, 0],
  // The can stands UPRIGHT (Josh's screenshot: the +90° tip laid it on its
  // side with the nozzle staring back at the player). A real can sprays
  // horizontally from its top nozzle standing up — no tilt at all.
};
const HELD_SIZE: Record<string, number> = {
  spraycan: 0.19,
  pills: 0.11,
  battery: 0.09,
  flashlight: 0.24,
  walkie: 0.2,
  camera: 0.16,
  almondwater: 0.24, // a tall flask — Y-long, stands upright, no tilt
};
const heldCache = new Map<string, THREE.Object3D | null>();

/** Hang an item off a hand bone. Returns the object so the caller can drop it
 *  again when the slot changes; safe to call with an unknown kind (no-op). */
export function attachToHand(hand: THREE.Object3D, kind: string): THREE.Object3D | null {
  const url = HELD_FILE[kind];
  if (!url) return null;
  const holder = new THREE.Group();
  hand.add(holder);
  const cached = heldCache.get(kind);
  const place = (src: THREE.Object3D): void => {
    const inst = src.clone(true);
    // PBR metals go PITCH BLACK without an environment map (there is none in
    // the yellow — Josh: "the can is pitch black"). Clamp metalness so every
    // held item shades off the scene's ambient like everything else.
    inst.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.isMeshStandardMaterial && m.metalness > 0.5) {
        m.metalness = 0.35;
        m.roughness = Math.max(m.roughness, 0.45);
      }
    });
    const box = new THREE.Box3().setFromObject(inst);
    const size = box.getSize(new THREE.Vector3());
    const want = HELD_SIZE[kind] ?? 0.15;
    inst.scale.setScalar(want / (Math.max(size.x, size.y, size.z) || 1));
    // ORIENTATION IS PER ITEM, not inferred. I tried measuring each model's
    // longest axis and turning it to face -Z, and the bench showed that is wrong
    // for four of the six: it points a walkie, a pill bottle and a battery
    // lengthwise down the view (they should stand upright in the hand) and yaws
    // the camera body so its lens faces sideways. Only the things that EMIT
    // along their axis want aligning — the torch and the can.
    //
    // Measured native long axes: flashlight Z (already forward, needs nothing),
    // spraycan Y, walkie Y, camera X, pills Y, battery Y.
    const tilt = HELD_TILT[kind];
    if (tilt) inst.rotation.set(tilt[0], tilt[1], tilt[2]);
    // Re-centre on the pivot so the pose offsets position the MIDDLE of the
    // object, not whatever corner its origin happened to sit in.
    const c = new THREE.Box3().setFromObject(inst).getCenter(new THREE.Vector3());
    inst.position.sub(c);
    // The hand bone is scaled by the body, so undo that to keep the item at a
    // real-world size whatever the avatar scale is.
    let s = 1;
    hand.traverseAncestors((o) => { s *= o.scale.x || 1; });
    holder.scale.setScalar(1 / (s || 1));
    holder.add(inst);
  };
  if (cached) place(cached);
  else if (cached === undefined) {
    heldCache.set(kind, null); // in flight — don't fetch twice
    new GLTFLoader().load(
      url,
      (g) => { tameGlbTransparency(g.scene); modelWarm?.(g.scene); heldCache.set(kind, g.scene); place(g.scene); },
      undefined,
      () => { /* missing file: the hand stays empty */ },
    );
  }
  return holder;
}

/** Start (or stop) a peer's emote off the wire. Locomotion resumes on its own
 *  when the wire clears it or the clip runs out. `force` replays even when
 *  the id hasn't changed — the joined-mid-dance model-resolve path. */
export function setAvatarEmote(a: PeerAvatar, emote: string, force = false): void {
  if (emote === a.emote && !force) return;
  a.emote = emote;
  if (a.emoteAction) {
    // Ending: FADE it while the walk/idle weights ease back in (tickAvatar),
    // or the body snaps through its rest pose for a few frames. Switching to
    // another clip stops it outright — the new one owns the body at once.
    if (emote) a.emoteAction.stop();
    else a.emoteAction.fadeOut(0.3);
    a.emoteAction = null;
  }
  if (!emote || !a.mixer) return;
  void loadEmoteClip(emote).then((clip) => {
    // Still wanted, and the model may have swapped mixers while we fetched.
    if (!clip || a.emote !== emote || !a.mixer) return;
    a.emoteAction = playEmote(a.mixer, clip);
  });
}

export function tickAvatar(a: PeerAvatar, dt: number): void {
  const dist = a.group.position.distanceTo(a.target);
  const walking = dist > 0.08;
  a.walking = walking;
  // AN EMOTE OWNS THE BODY: every locomotion weight goes to zero and the
  // dance plays through. When the clip clamps on its final frame the avatar
  // stands back up locally, even if the clearing pos frame is late.
  const emoting = !!a.emote && !!a.emoteAction;
  if (emoting && a.emoteAction && a.emoteAction.paused) setAvatarEmote(a, "");
  if (a.mixer && (emoting || Object.keys(a.acts).length)) {
    // Movement states are chosen by how far behind its target the avatar is —
    // a proxy for speed, since the group lerps toward the last reported
    // position. CROUCH and AIRBORNE come from the wire instead (`pose` on the
    // pos frames): they're facts about the player's input that no position
    // delta can reveal. Blended by WEIGHT rather than toggling `paused`,
    // because a paused action still writes its pose and two of those fight
    // each other.
    // Run vs walk comes from TRUE WIRE SPEED (see PeerAvatar.wireSpeed):
    // sprint is ~5.7 m/s and walk ~3.2, so 4.5 splits them cleanly. The
    // DIRECTION comes from where the body is actually headed relative to
    // where it faces (moveSuffix) — a strafing peer used to march forward
    // while sliding sideways.
    const dir = walking ? moveSuffix(a.target.x - a.group.position.x, a.target.z - a.group.position.z, a.heading) : "";
    // THE WATER OWNS THE BODY FIRST (Josh, Aug 2026): waist-deep or more and
    // covering ground = the stroke, in every direction. A floating body going
    // nowhere (or only up/down — the wire carries no vertical, and vertical
    // is not a direction anyway) treads water; a wader standing still in
    // waist water just stands — their feet are on the floor.
    // ARMED wraps DRUNK wraps sober (gunclips.ts precedence: a drunk with a
    // gun staggers with a gun in his hand — gunState only maps sober names).
    const state = gunState(drunkState(
      // A RIDER SITS (Josh, Aug 2026) — the hull does the moving, so aboard
      // outranks everything, including the "covering ground" walk detection.
      // A CHAIR-SITTER likewise (casino stools) — the animated idle.
      a.seated ? "sitidle"
      : a.aboard ? "sit"
      : a.swim && walking ? "swim"
      : a.swimming ? "tread"
      : a.pose === 2 ? "jump"
      : a.pose === 1 ? (walking ? (dir ? `crouch${dir}` : "crouchwalk") : "crouchidle")
      : a.wireSpeed > 4.5 * a.wade && walking ? `run${dir}`
      : walking ? `walk${dir}`
      : "idle",
      !!a.drunk,
      a.salt,
      performance.now(),
    ), !!a.armed);
    // Entering the air restarts the jump clip at its takeoff — all actions
    // run looped forever at weight 0, so without this a jump would join the
    // clip mid-flip at whatever phase it happened to be in.
    if (a.pose === 2 && a.lastPose !== 2 && a.acts.jump) {
      a.acts.jump.reset();
      a.acts.jump.time = JUMP_CLIP_START;
    }
    a.lastPose = a.pose;
    const target = emoting ? null : (a.acts[state] ?? a.acts.idle ?? null);
    // Ease toward the chosen clip so a step into a run isn't a snap.
    const k = Math.min(1, dt * 9);
    for (const act of Object.values(a.acts)) {
      if (!act) continue;
      const goal = act === target ? 1 : 0;
      act.setEffectiveWeight(act.getEffectiveWeight() + (goal - act.getEffectiveWeight()) * k);
    }
  }
  // The accumulation rule: baseline first, mixer overwrites what it drives,
  // procedural layers apply fresh (same order as the entity and viewmodel).
  for (const r of a.rest) r.bone.quaternion.copy(r.q);
  a.mixer?.update(dt);
  // LOOK PITCH from the wire, split chest/head like the viewmodel — the
  // world-right axis comes from the peer's own heading, converted into each
  // bone's parent frame (rig axes are undocumented; a guessed local axis
  // tilts heads sideways).
  // NOT during an emote: the local dancer's stand-in plays the pure clip
  // (pitch frozen out of it), so the room must see the same upright dance —
  // one appearance, every observer.
  if (!a.emote && a.pitch !== 0 && (a.head || a.chest)) {
    const worldRight = SWING_TMP_V.set(Math.cos(a.heading), 0, -Math.sin(a.heading));
    const apply = (bone: THREE.Object3D | null, angle: number): void => {
      if (!bone || !bone.parent || Math.abs(angle) < 0.01) return;
      const axis = AIM_TMP_V.copy(worldRight)
        .applyQuaternion(bone.parent.getWorldQuaternion(AIM_TMP_Q).invert())
        .normalize();
      AIM_TMP_Q.setFromAxisAngle(axis, angle);
      bone.quaternion.premultiply(AIM_TMP_Q);
    };
    const p = Math.max(-1.2, Math.min(0.9, a.pitch));
    apply(a.chest, p * 0.45);
    apply(a.head, p * 0.45);
  }
  // GEAR ARM, reworked (Josh's screenshots: cameras pointing backwards,
  // arms saluting the ceiling). Two rules now:
  //  1. The ARM belongs to the CLIPS except during a raise: IK fires only
  //     for the active walkie/camera/spray and a lit flashlight, with
  //     REACHABLE shoulder-height targets and a soft blend — an
  //     unreachable target made CCD fully extend the arm skyward.
  //  2. The ITEM'S ORIENTATION is stabilized to the BODY, not the hand
  //     bone: the hand's local frame is rig-arbitrary, so inheriting it
  //     pointed every model a different wrong way. Each frame the holder's
  //     world rotation is forced to group-facing × the item's own tilt —
  //     the item rides the hand's POSITION but always faces sensibly.
  // CONVENTION, settled by Josh's live observation ("the arm stretches out
  // BEHIND the body"): the avatar's true facing is GROUP-LOCAL −Z. All
  // targets are built in group-local space and pushed through localToWorld,
  // so the facing can never flip on us again.
  if (a.equip && a.upperArm && a.foreArm && a.hand) {
    const active = a.equip.endsWith("!");
    const kind = active ? a.equip.slice(0, -1) : a.equip;
    const p = Math.max(-1.0, Math.min(0.8, a.pitch));
    const lift = Math.sin(-p) * 0.25;
    let ty = 0;
    let tf = 0;
    let tr = 0;
    if (kind === "flashlight" && active) {
      ty = 1.12 + lift; tf = 0.38; tr = 0.26;
    } else if (kind === "walkie" && active) {
      ty = 1.38; tf = 0.2; tr = 0.28;
    } else if (kind === "camera" && active) {
      ty = 1.35; tf = 0.32; tr = 0.14;
    } else if (kind === "spraycan" && active) {
      ty = 1.05 + lift; tf = 0.4; tr = 0.24;
    }
    if (ty > 0) {
      ARM_TGT.set(tr, ty, -tf);
      a.group.localToWorld(ARM_TGT);
      armIK(a.upperArm, a.foreArm, a.hand, ARM_TGT, 0.45);
    }
    if (a.heldObj && a.heldObj.parent) {
      // Item facing = the body's facing (heading + π in +Z terms); a lit
      // torch also tips with their look pitch.
      GRIP_Q.setFromEuler(GRIP_E.set(0, a.heading + (kind === "flashlight" ? Math.PI : 0), 0));
      const tilt = kind === "flashlight" && active ? GRIP_TILT.set(-p * 0.8, 0, 0) : GRIP_TILT.set(0, 0, 0);
      GRIP_Q.multiply(GRIP_Q2.setFromEuler(tilt));
      a.heldObj.parent.getWorldQuaternion(GRIP_PQ);
      a.heldObj.quaternion.copy(GRIP_PQ.invert().multiply(GRIP_Q));
    }
    // THEIR TORCH THROWS LIGHT NOW (Josh reversed the old strictly-local
    // rule: "players still cannot see each other's light"). The beam comes
    // from the scene's TORCH POOL (see installAvatarTorchPool) — a lit torch
    // claims a slot and steers it every frame; unlit releases it. Shadows
    // matter here or the beam would glow through drywall, and the pool is
    // what lets them exist without recompiling the scene per toggle.
    if (kind === "flashlight" && active) {
      const slot = torchSlots.find((s) => s.owner === a) ?? torchSlots.find((s) => !s.owner);
      if (slot) {
        slot.owner = a;
        slot.l.intensity = 9;
        slot.l.position.set(0.26, 1.25, -0.35);
        a.group.localToWorld(slot.l.position);
        slot.tgt.position.set(0.26, 1.25 + Math.sin(p) * 8, -8.35);
        a.group.localToWorld(slot.tgt.position);
      }
    } else {
      releaseTorch(a);
    }
  } else {
    releaseTorch(a);
  }

  if (a.swings.length) {
    if (walking) {
      a.stride += dt * 7.5; // ~2.4 steps/s at walking pace
      for (const s of a.swings) {
        SWING_TMP.setFromAxisAngle(SWING_AXIS, Math.sin(a.stride + s.phase) * s.amp);
        s.bone.quaternion.copy(s.rest).multiply(SWING_TMP);
      }
    } else {
      // Ease every bone back to rest — no freeze mid-stride.
      for (const s of a.swings) {
        s.bone.quaternion.slerp(s.rest, Math.min(1, dt * 8));
      }
    }
  }
}

// ---- Spray marks -----------------------------------------------------------
// Permanent paint on the walls (the map-permanence lock). Each dot is a
// small unlit quad 1.5cm off the wall face; dots live in per-chunk groups
// so pruning drops them with the geometry. Colors match the can upgrades.
const sprayMats = new Map<string, THREE.MeshBasicMaterial>();
const sprayGeo = new THREE.PlaneGeometry(0.2, 0.2);
/** Classic aerosol splat: soft dense core feathering out, ringed by
 *  overspray speckle — not a solid square (Josh's note). */
function sprayTexture(hex: number): THREE.CanvasTexture {
  const S = 64;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  const r = (hex >> 16) & 255;
  const gr = (hex >> 8) & 255;
  const b = hex & 255;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(${r},${gr},${b},0.9)`);
  grad.addColorStop(0.45, `rgba(${r},${gr},${b},0.55)`);
  grad.addColorStop(0.75, `rgba(${r},${gr},${b},0.12)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = S * 0.24 + Math.random() * S * 0.26;
    g.fillStyle = `rgba(${r},${gr},${b},${0.25 + Math.random() * 0.4})`;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 0.6 + Math.random() * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function sprayMat(color: string): THREE.MeshBasicMaterial {
  let m = sprayMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: sprayTexture(SPRAY_HEX[color] ?? SPRAY_HEX.black),
      transparent: true,
      depthWrite: false,
    });
    sprayMats.set(color, m);
  }
  return m;
}

/** Drop every sprite in a chunk's mark group (a stored batch is about to
 *  replace them — re-adding on top stacked duplicates until the paint
 *  turned to mush). */
export function clearChunkMarks(world: WorldIndex, scene: THREE.Scene, cx: number, cy: number): void {
  const k = world.key(cx, cy);
  const g = world.markGroups.get(k);
  if (!g) return;
  scene.remove(g);
  world.markGroups.delete(k);
}

export function addSprayMark(
  world: WorldIndex,
  scene: THREE.Scene,
  m: { cellX: number; cellY: number; face: string; u: number; v: number; color: string },
): void {
  const k = world.key(Math.floor(m.cellX / world.chunkSize), Math.floor(m.cellY / world.chunkSize));
  let g = world.markGroups.get(k);
  if (!g) {
    g = new THREE.Group();
    world.markGroups.set(k, g);
    scene.add(g);
  }
  const mesh = new THREE.Mesh(sprayGeo, sprayMat(m.color));
  mesh.rotation.z = Math.random() * Math.PI; // cosmetic jitter — per client
  mesh.scale.setScalar(0.7 + Math.random() * 0.7);
  // The paint band is 0.1–3.0m now (was 0.4–2.4 — Josh: "you should be able
  // to spray on any surface you can reach"). Matches the writer's mapping in
  // BackroomsGame; pre-change marks shift a little vertically, accepted.
  const y = 0.1 + m.v * 2.9;
  const OFF = 0.165;
  if (m.face === "N") {
    mesh.position.set(m.cellX * CELL + m.u * CELL, y, m.cellY * CELL + OFF);
  } else if (m.face === "S") {
    mesh.position.set(m.cellX * CELL + m.u * CELL, y, (m.cellY + 1) * CELL - OFF);
    mesh.rotation.y = Math.PI;
  } else if (m.face === "E") {
    mesh.position.set((m.cellX + 1) * CELL - OFF, y, m.cellY * CELL + m.u * CELL);
    mesh.rotation.y = -Math.PI / 2;
  } else {
    mesh.position.set(m.cellX * CELL + OFF, y, m.cellY * CELL + m.u * CELL);
    mesh.rotation.y = Math.PI / 2;
  }
  // Culled like any mesh, and held to the server's own read ceiling per chunk
  // (Oct 2026 review: a can held on a wall added thousands of always-drawn
  // meshes for everyone near it). The oldest dot goes first.
  g.add(mesh);
  while (g.children.length > SPRAY_MARKS_PER_CHUNK) g.remove(g.children[0]);
}
/** The server reads at most this many marks a chunk (net.ts); live marks are
 *  held to it too. */
const SPRAY_MARKS_PER_CHUNK = 4_000;

/** Walk the grid from (x,y) along (dx,dy) until a wall face blocks — the
 *  spray-aim ray. Returns the hit cell + face + u along the wall, or null
 *  past maxDist (cells). */
export function wallHit(
  world: WorldIndex,
  x: number,
  y: number,
  dx: number,
  dy: number,
  maxDist: number,
): { cellX: number; cellY: number; face: string; u: number; dist: number } | null {
  const STEP = 0.04;
  let px = x;
  let py = y;
  for (let d = STEP; d <= maxDist; d += STEP) {
    const nx = x + dx * d;
    const ny = y + dy * d;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    const ncx = Math.floor(nx);
    const ncy = Math.floor(ny);
    if (ncy !== cy) {
      const edgeY = Math.max(cy, ncy);
      if (world.wallNAt(cx, edgeY) || world.solidAt(cx, ncy)) {
        return { cellX: cx, cellY: ncy > cy ? cy : cy, face: ncy > cy ? "S" : "N", u: px - Math.floor(px), dist: d };
      }
    }
    if (ncx !== cx) {
      const edgeX = Math.max(cx, ncx);
      if (world.wallWAt(edgeX, cy) || world.solidAt(ncx, cy)) {
        return { cellX: ncx > cx ? cx : cx, cellY: cy, face: ncx > cx ? "E" : "W", u: py - Math.floor(py), dist: d };
      }
    }
    px = nx;
    py = ny;
  }
  return null;
}

// ---- The entrance marker ---------------------------------------------------
// THE ONLY WAY OUT (Josh's rule): the wall section you came in through,
// outlined in red spray paint. Walk into it and the server extracts you —
// Dr. Voss debriefs on the other side. Full-bright material on purpose: a
// signpost has to read even in a dark run.
/** THE POOLROOMS' EXITS (Josh: "some of the exits are just text floating in
 *  the air — make them a red marked door like the first map"). Level 0's
 *  doors are wall panels, so the mark can be sprayed straight onto drywall;
 *  down here the doors are open cells in the middle of tiled rooms, so the
 *  door itself has to be BUILT: tiled jambs and a lintel standing on the
 *  floor, with the same hand-sprayed red rectangle filling the opening.
 *  Faces south (+z) — the direction you're looking when you arrive. */
export function makePoolsExitDoor(
  scene: THREE.Scene,
  door: { x: number; y: number; name: string; floor?: number },
  isLanding: boolean,
  /** The caller's label factory (it owns the font/style). */
  label?: (text: string, tint: string) => THREE.Object3D,
): THREE.Group {
  buildPoolMats();
  const g = new THREE.Group();
  const W = 2.6; // opening width
  const H = 3.2; // opening height
  const JAMB = 0.55;
  const D = 0.7;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), poolWallMat);
    // poolWallMat wants vertex colours; a flat white keeps it unshaded.
    const geo = m.geometry;
    const cnt = geo.attributes.position.count;
    const col = new Float32Array(cnt * 3).fill(1.05);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  box(JAMB, H, D, -(W / 2 + JAMB / 2), H / 2, 0);
  box(JAMB, H, D, W / 2 + JAMB / 2, H / 2, 0);
  box(W + JAMB * 2, 0.6, D, 0, H + 0.3, 0); // lintel
  // The red mark, on both faces so it reads from either side — and the red
  // outline round the opening on both faces too.
  for (const s of [1, -1]) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.82, H * 0.72), sprayMarkMaterial());
    mark.position.set(0, H * 0.46, s * (D / 2 + 0.02));
    if (s < 0) mark.rotation.y = Math.PI;
    g.add(mark);
    const frame = redDoorOutline(W - 0.1, H - 0.05);
    frame.position.set(0, 0, s * (D / 2 + 0.05));
    g.add(frame);
  }
  const sign = label?.(
    isLanding ? `${door.name.toUpperCase()} — WAY IN & OUT · PASSAGE TO LEVEL 0` : `${door.name.toUpperCase()} — WAY IN & OUT`,
    DOOR_RED,
  );
  if (sign) {
    sign.position.set(0, H + 1.15, 0);
    g.add(sign);
  }
  // ON ITS OWN FLOOR. It stood at y=0 whatever the floor was, which buried
  // Pipe Dreams' drain six metres under the deck it opens onto. The welcome
  // carries each door's floor (in steps) because the chunks — which would
  // otherwise tell us — have not streamed yet when this is built.
  g.position.set((door.x + 0.5) * CELL, (door.floor ?? 0) * FLOOR_STEP, (door.y + 0.5) * CELL);
  scene.add(g);
  return g;
}

// ---- THE RED OUTLINE (Josh, Sep 2026: "Make sure each level has a clear
// outline entrance and exit door marker in red") ------------------------------
// Every level's own door — the way in and the way back out — and Level 0's
// onward door wear the same thing: a glowing red frame round the opening and a
// red sign over it. Unlit and fog-free, so it reads from across a dim room the
// way an exit sign does, but depth-tested, so it never shows through a wall.
// No lights are added (the frozen-light-count rule): the glow is the material.
export const DOOR_RED = "#ff4a3a";
const doorOutlineMat = new THREE.MeshBasicMaterial({ color: 0xff2a18, fog: false, toneMapped: false });
/** A red rectangle of bars round a w×h opening, bottom-centred on the origin,
 *  in the XY plane. */
export function redDoorOutline(w: number, h: number, bar = 0.13): THREE.Group {
  const g = new THREE.Group();
  const add = (bw: number, bh: number, x: number, y: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), doorOutlineMat);
    m.position.set(x, y, 0);
    g.add(m);
  };
  add(bar, h, -(w / 2 + bar / 2), h / 2);
  add(bar, h, w / 2 + bar / 2, h / 2);
  add(w + bar * 2, bar, 0, h + bar / 2);
  add(w + bar * 2, bar, 0, bar / 2); // the sill: a closed outline, not an arch
  g.name = "door-outline";
  return g;
}

/** A red circle on the floor round a door that is a hole in the floor — the
 *  Drain's hatch (Josh: "for the drain just mark a circle in red on the
 *  floor"). Stands on the door's own floor (the welcome carries it). */
export function addFloorRing(scene: THREE.Scene, door: { x: number; y: number; floor?: number }): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.3, 48), doorOutlineMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set((door.x + 0.5) * CELL, (door.floor ?? 0) * FLOOR_STEP + 0.03, (door.y + 0.5) * CELL);
  scene.add(ring);
  return ring;
}

/** The hand-sprayed red rectangle — shared by Level 0's wall marks and the
 *  Poolrooms' built doors. */
function sprayMarkMaterial(): THREE.MeshBasicMaterial {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let pass = 0; pass < 3; pass++) {
    g.strokeStyle = `rgba(198, 30, 20, ${0.5 + pass * 0.16})`;
    g.lineWidth = 10 - pass * 2.5;
    const j = (): number => (Math.random() - 0.5) * 11;
    g.beginPath();
    g.moveTo(30 + j(), 26 + j());
    g.lineTo(S - 30 + j(), 28 + j());
    g.lineTo(S - 26 + j(), S - 26 + j());
    g.lineTo(28 + j(), S - 28 + j());
    g.closePath();
    g.stroke();
  }
  g.fillStyle = "rgba(198, 30, 20, 0.22)";
  for (let i = 0; i < 240; i++) {
    const t = Math.random() * 4;
    const along = Math.random();
    let x: number;
    let y: number;
    if (t < 1) [x, y] = [30 + along * (S - 60), 27];
    else if (t < 2) [x, y] = [30 + along * (S - 60), S - 27];
    else if (t < 3) [x, y] = [28, 26 + along * (S - 52)];
    else [x, y] = [S - 28, 26 + along * (S - 52)];
    x += (Math.random() - 0.5) * 26;
    y += (Math.random() - 0.5) * 26;
    g.beginPath();
    g.arc(x, y, 0.8 + Math.random() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}

export function addDoorMarker(
  scene: THREE.Scene,
  door: { x: number; y: number; edge: string; name?: string },
  /** The caller's label factory — the sign over the door. */
  label?: (text: string, tint: string) => THREE.Object3D,
): THREE.Object3D {
  // The mark itself is shared with the Poolrooms' built doors. It hangs on the
  // wall inside a group that also carries the red outline and the sign, all
  // turned together to face into the room.
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.3), sprayMarkMaterial());
  mesh.position.set(0, 1.35, 0);
  group.add(mesh);
  const frame = redDoorOutline(1.9, 2.55);
  frame.position.set(0, 0.02, 0.03);
  group.add(frame);
  const sign = label?.(`${(door.name ?? "the door").toUpperCase()} — WAY IN & OUT`, DOOR_RED);
  if (sign) {
    sign.position.set(0, 3.05, 0.1);
    group.add(sign);
  }
  const cx = (door.x + 0.5) * CELL;
  const cz = (door.y + 0.5) * CELL;
  const OFF = 0.17; // 2cm proud of the 30cm wall
  if (door.edge === "N") {
    group.position.set(cx, 0, door.y * CELL + OFF);
  } else if (door.edge === "S") {
    group.position.set(cx, 0, (door.y + 1) * CELL - OFF);
    group.rotation.y = Math.PI;
  } else if (door.edge === "E") {
    group.position.set((door.x + 1) * CELL - OFF, 0, cz);
    group.rotation.y = -Math.PI / 2;
  } else {
    group.position.set(door.x * CELL + OFF, 0, cz);
    group.rotation.y = Math.PI / 2;
  }
  scene.add(group);
  // Returned so LEVEL TRAVEL can take the lobby marks down — they belong to
  // Level 0's walls, and the Poolrooms share the same coordinate space.
  return group;
}
