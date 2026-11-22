// THE FLOOR's world: a single handcrafted hall (no worldgen, no streaming,
// no fog-of-war — the opposite of the backrooms in every way except the
// movement rules). Implements the controller's ControllerWorld surface, so
// the backrooms controller drives it unchanged, climb rule and all: the
// stage is 2 steps (1m) with a 1-step stair strip, which is exactly why the
// stairs are the only way up.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ControllerWorld } from "../backrooms/controller";
import { SPAWN, W, H, CEIL, STAGE, STAIR, DOOR, PLACEMENTS, LIGHTS, LAMPS, SPEAKERS, JUKEBOX, ESCAPE_DOOR, WALL_SIGNS, ROPES, BJ_TABLES, HOLDEM, SHELL, STERLING, BAR, slotSectionAt, type SlotSection } from "./layout";
import { REEL_STRIP, STRIP_CELL, THEME_LOOK, themeStrip, type ThemeLook } from "./slot-themes";
import { CABINET_SPECS, type CabinetSpec } from "./slot-cabinets";
import { buildVegas } from "./world-vegas";
import { SPIN_DUR, WHEEL_SLOTS_3D, spinEase, sweepFrom, clackSchedule } from "./spin";
import { playSfx, playSfxAt, playSfxLoop, sfxBuffer, sfxContext } from "../lib/sfx";
import { tameGlbTransparency } from "../lib/three-hygiene";
import { ballRun as ballRunSfx, ballLand, DROP_LEAD_MS } from "../lib/roulette-audio";
import { EU_ORDER, EU_RED, POCKETS, pocketAngle } from "./wheel37";
import { wheel } from "../lib/wheel.svelte";
import { bigWins } from "./bigwins.svelte";
import { sterlingMurmur } from "../lib/shop-audio";
import { buildSterlingFigure } from "./sterling-model";

export const CELL = 2; // metres per cell — matches the backrooms, so speeds feel identical
export const EYE = 1.62;
/** Where a body walks in — the standing hall's (layout.ts, a live binding). */
export { SPAWN };

const BASE = "/assets/casino";

// ---- collision --------------------------------------------------------------

export class CasinoWorld implements ControllerWorld {
  mapSize = Math.max(W, H);
  private steps = new Uint8Array(W * H);
  private props: { x: number; y: number; rx: number; ry: number }[] = [];

  constructor() {
    for (let y = STAGE.y0; y < STAGE.y1; y++)
      for (let x = STAGE.x0; x < STAGE.x1; x++) this.steps[y * W + x] = 2;
    for (let x = STAIR.x0; x < STAIR.x1; x++) this.steps[STAIR.y * W + x] = 1;
    for (const p of PLACEMENTS) {
      if (p.collider) this.props.push({ x: p.at[0], y: p.at[1], rx: p.collider[0], ry: p.collider[1] });
      // multi-box furniture (the blackjack arcs): a staircase of small boxes
      for (const [dx, dy, rx, ry] of p.colliders ?? []) {
        this.props.push({ x: p.at[0] + dx, y: p.at[1] + dy, rx, ry });
      }
    }
  }

  private inb(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < W && y < H;
  }
  stepsAt(x: number, y: number): number {
    return this.inb(x, y) ? this.steps[y * W + x] : 0;
  }
  effStepsAt(x: number, y: number): number {
    return this.stepsAt(x, y);
  }
  solidAt(x: number, y: number): boolean {
    return !this.inb(x, y);
  }
  // The hall is one open room: the only wall edges are the perimeter (and
  // solidAt already refuses outside cells, which the controller checks on the
  // same edge test — walls here are belt and braces for the boundary rows).
  wallNAt(x: number, y: number): boolean {
    return y === 0;
  }
  wallWAt(x: number, y: number): boolean {
    return x === 0;
  }
  // ---- the three the RAGDOLL asks for (backrooms/ragdoll.ts RagdollWorld) ----
  // The hall is one flat room with a stage, so these are far simpler here than
  // in a streamed chunk world — but they must speak the SAME units, or a thrown
  // body sinks through the floor or bounces off an imaginary ceiling.

  /** A cell's floor height in METRES. One step is 0.5m — the same conversion
   *  `groundAt` applies below, and the reason the 2-step stage is 1m. */
  floorAt(x: number, y: number): number {
    return this.stepsAt(Math.floor(x), Math.floor(y)) * 0.5;
  }
  /** Ceiling height ABOVE that cell's floor. The hall's ceiling is flat at
   *  CEIL, so a cell standing 1m up on the stage has 1m less headroom. */
  cellHeightAt(x: number, y: number): number {
    return Math.max(0, CEIL - this.floorAt(x, y));
  }
  /** No water on a casino floor. */
  waterAt(): number | null {
    return null;
  }

  propsNear(x: number, y: number): { x: number; y: number; rx: number; ry: number }[] {
    // Unlike the backrooms' per-chunk scan, colliders here can be BIG (the
    // 20m bar counter is one box) — nearness must respect the extent, not
    // just the centre, or the middle of the counter would be walk-through.
    const out: { x: number; y: number; rx: number; ry: number }[] = [];
    for (const p of this.props) {
      if (Math.abs(p.x - x) < p.rx + 1.2 && Math.abs(p.y - y) < p.ry + 1.2) out.push(p);
    }
    return out;
  }

  /** Smooth ground height (metres) under a position — bilinear over cell
   *  centres, but a neighbour more than one step away contributes the
   *  STANDING cell's height instead: the floor beside the stage stays flat
   *  rather than ramping up a wall the climb rule won't let you cross. */
  groundAt(x: number, y: number): number {
    const base = this.stepsAt(Math.floor(x), Math.floor(y));
    const gx = x - 0.5;
    const gy = y - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const s = (cx: number, cy: number): number => {
      const v = this.stepsAt(cx, cy);
      return Math.abs(v - base) <= 1 ? v : base;
    };
    const top = s(x0, y0) * (1 - fx) + s(x0 + 1, y0) * fx;
    const bot = s(x0, y0 + 1) * (1 - fx) + s(x0 + 1, y0 + 1) * fx;
    return (top * (1 - fy) + bot * fy) * 0.5;
  }
}

// ---- painted PSX textures (canvas — nothing to download) ---------------------

function canvasTex(px: number, draw: (c: CanvasRenderingContext2D) => void): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  const c = cv.getContext("2d")!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const dither = (c: CanvasRenderingContext2D, px: number, strength: number): void => {
  const img = c.getImageData(0, 0, px, px);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (((i / 4) % px) + Math.floor(i / 4 / px)) % 2 ? strength : -strength;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
};

/** Wine-red casino carpet. The C1 version was a thin gold lattice on flat
 *  maroon, which read as a TILE GRID from standing height — the references are
 *  all dense ornate florals with no visible repeat. This is a 128px scrolled
 *  half-drop of leaf scrolls, so the eye finds pattern instead of seams. */
/** WALNUT, not pine — the shared wood.png is a blond board; every wooden
 *  surface in the hall multiplies it down to dark walnut. Exported with the
 *  texture builders so the escape room wears the SAME casino (the uniformity
 *  law): reuse these, never copy the recipe. */
export const WALNUT = 0x9c6636;

export function carpetTex(): THREE.Texture {
  return canvasTex(128, (c) => {
    c.fillStyle = "#3d1119";
    c.fillRect(0, 0, 128, 128);
    // half-drop: the same motif at (0,0) and offset by half a tile both ways,
    // which is what kills the grid read
    const motif = (ox: number, oy: number): void => {
      c.save();
      c.translate(ox, oy);
      // four-petal rosette
      c.fillStyle = "#5c1b26";
      for (let i = 0; i < 4; i++) {
        c.save();
        c.rotate((i * Math.PI) / 2);
        c.beginPath();
        c.ellipse(0, -13, 7, 13, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      // scroll arms between the petals
      c.strokeStyle = "#6e2430";
      c.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        c.save();
        c.rotate(Math.PI / 4 + (i * Math.PI) / 2);
        c.beginPath();
        c.arc(0, -20, 9, 0.15 * Math.PI, 0.85 * Math.PI);
        c.stroke();
        c.restore();
      }
      c.fillStyle = "#8a6a2c"; // the one gold accent, tiny — brass, not glitter
      c.beginPath();
      c.arc(0, 0, 3.5, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    motif(32, 32);
    motif(96, 96);
    motif(96, -32); motif(-32, 96); // wrap the half-drop across the seam
    motif(160, 32); motif(32, 160);
    dither(c, 128, 6);
  });
}

/** Deep-red damask for the upper walls. The C1 version drew concentric rings,
 *  which at wall scale read as painted BULLSEYES rather than fabric — damask is
 *  an ogee lattice with a filled motif inside it, so that is what this draws. */
export function damaskTex(): THREE.Texture {
  return canvasTex(128, (c) => {
    c.fillStyle = "#2e1016";
    c.fillRect(0, 0, 128, 128);
    // the ogee lattice: two mirrored arcs per side, tiling seamlessly
    c.strokeStyle = "#43171f";
    c.lineWidth = 3;
    for (const ox of [0, 128]) {
      c.beginPath();
      c.moveTo(ox - 64, 0);
      c.quadraticCurveTo(ox, 32, ox, 64);
      c.quadraticCurveTo(ox, 96, ox - 64, 128);
      c.moveTo(ox + 64, 0);
      c.quadraticCurveTo(ox, 32, ox, 64);
      c.quadraticCurveTo(ox, 96, ox + 64, 128);
      c.stroke();
    }
    // the motif inside each ogee — a stylised palmette
    const palmette = (ox: number, oy: number): void => {
      c.save();
      c.translate(ox, oy);
      c.fillStyle = "#3e151d";
      c.beginPath();
      c.ellipse(0, 0, 13, 20, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#4d1b24";
      for (let i = -2; i <= 2; i++) {
        c.save();
        c.rotate(i * 0.33);
        c.beginPath();
        c.ellipse(0, -6, 2.6, 12, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.restore();
    };
    palmette(64, 64);
    palmette(0, 0); palmette(128, 0); palmette(0, 128); palmette(128, 128);
    dither(c, 128, 4);
  });
}

/** Dark coffered ceiling panel with a brass trim line. */
export function ceilingTex(): THREE.Texture {
  return canvasTex(64, (c) => {
    c.fillStyle = "#221912";
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = "#181109";
    c.lineWidth = 4;
    c.strokeRect(2, 2, 60, 60);
    c.strokeStyle = "#4a3a20";
    c.lineWidth = 1;
    c.strokeRect(6, 6, 52, 52);
    c.fillStyle = "#2a2016";
    c.fillRect(24, 24, 16, 16);
    dither(c, 64, 5);
  });
}

/** Pleated red velvet — the stage skirt and the rope runs read as one set. */
function velvetTex(): THREE.Texture {
  return canvasTex(64, (c) => {
    for (let x = 0; x < 64; x += 8) {
      const g = c.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, "#4e1018");
      g.addColorStop(0.45, "#7a1c28");
      g.addColorStop(1, "#380b12");
      c.fillStyle = g;
      c.fillRect(x, 0, 8, 64);
    }
    dither(c, 64, 4);
  });
}

/** Deep-green table-zone rug (the card pit) — quiet against the wine field. */
function pitRugTex(): THREE.Texture {
  return canvasTex(64, (c) => {
    // Near-black forest, not felt green. At the old #12301e the blackjack spots
    // saturated it into glowing lime ELLIPSES on the floor — the pools read as
    // coloured light rather than as a rug. Dark enough to take a 70-intensity
    // spot and still look like carpet.
    c.fillStyle = "#0d1d14";
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = "#14291c";
    c.lineWidth = 2;
    c.strokeRect(8, 8, 48, 48);
    c.fillStyle = "#6b5324";
    c.fillRect(30, 30, 4, 4);
    dither(c, 64, 5);
  });
}

/** A framed picture for the walls — sepia "old Vegas" plates. The reference
 *  interiors are papered with them; bare damask between the wainscot and the
 *  ceiling was the largest empty surface left in the hall. `seed` picks the
 *  composition so a wall of them doesn't repeat. */
function pictureTex(seed: number): THREE.Texture {
  const rnd = (n: number): number => {
    const s = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return canvasTex(64, (c) => {
    c.fillStyle = "#b49a72"; // aged paper
    c.fillRect(0, 0, 64, 64);
    const horizon = 34 + Math.floor(rnd(1) * 10);
    c.fillStyle = "#6d5c44"; // sky band
    c.fillRect(0, 0, 64, horizon);
    c.fillStyle = "#4a3d2c"; // ground
    c.fillRect(0, horizon, 64, 64 - horizon);
    const kind = Math.floor(rnd(2) * 3);
    c.fillStyle = "#2b2318";
    if (kind === 0) {
      // a skyline of towers
      for (let x = 2; x < 62; x += 7) {
        const h = 6 + Math.floor(rnd(x) * 20);
        c.fillRect(x, horizon - h, 5, h);
      }
    } else if (kind === 1) {
      // a lone marquee sign on a pole
      c.fillRect(28, horizon - 26, 4, 26);
      c.fillRect(18, horizon - 34, 26, 12);
      c.fillStyle = "#d8b45c";
      c.fillRect(21, horizon - 31, 20, 6);
    } else {
      // a portrait oval — the house's old faces
      c.beginPath();
      c.ellipse(32, 30, 13, 17, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#8a7458";
      c.beginPath();
      c.ellipse(32, 24, 7, 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    dither(c, 64, 5);
  });
}

/** The back-bar: a lit wall of bottles. The bar pack's shelf units rendered as
 *  small blond crates behind the counter and read as nothing — the reference
 *  bar (reference/9ec821…jpg) is an ARCH OF BACKLIT GLASS, which is the whole
 *  focal point of a bar. Drawn self-lit, so it glows without a fixture. */
function backBarTex(): THREE.Texture {
  return canvasTex(128, (c) => {
    c.fillStyle = "#241209";
    c.fillRect(0, 0, 128, 128);
    const shelves = [96, 62, 28];
    for (const y of shelves) {
      // warm backlight spilling up from under each shelf
      const g = c.createLinearGradient(0, y - 26, 0, y);
      g.addColorStop(0, "#2a1508");
      g.addColorStop(1, "#a9702c");
      c.fillStyle = g;
      c.fillRect(0, y - 26, 128, 26);
      // bottles: alternating tints, varied heights
      const tint = ["#3f6b3a", "#7a3524", "#2d4d63", "#6a5a1e", "#5a2438"];
      for (let i = 0; i < 21; i++) {
        const bx = 2 + i * 6;
        const bh = 13 + ((i * 7 + y) % 9);
        c.fillStyle = tint[(i + y) % tint.length];
        c.fillRect(bx, y - bh, 4, bh);
        c.fillStyle = "#caa25c"; // neck highlight
        c.fillRect(bx + 1, y - bh - 3, 2, 3);
      }
      // the shelf board itself
      c.fillStyle = "#3a2312";
      c.fillRect(0, y, 128, 4);
    }
    dither(c, 128, 4);
  });
}

/** THE WHEEL FACE — our real 32 slots, in the real order.
 *
 *  The prop ships with the pack's generic ~12-wedge prize art, which made the
 *  stage wheel a different wheel from the one the economy actually spins. Slot
 *  order is src/wheel.ts WHEEL_SLOTS (mystery at index 0, death at 16) and the
 *  colours are lifted from the 2D wheel's own gradients (wheel-disc.svg) so the
 *  two read as the same object. Slot 0 is drawn CENTRED AT 12 O'CLOCK, which is
 *  the calibration `spinWheel` assumes. */
const WHEEL_FACE: Record<string, [string, string, string]> = {
  // [wedge, rim shade, label]
  common: ["#7cae5f", "#54823f", "#1c2a15"],
  rare: ["#9d63d2", "#673aa2", "#1d1029"],
  legendary: ["#f39620", "#c56417", "#331903"],
  talisman: ["#42c1c4", "#2c8b8f", "#08282a"],
  death: ["#d15748", "#953026", "#fae2df"],
  mystery: ["#eab348", "#a8741f", "#2e1f04"],
  blank: ["#342c23", "#211b15", "#7d6f5d"],
};
/** Emoji drawn straight on the wedge, exactly as the 2D wheel does: 💀 on the
 *  death wedge, 🎁 on mystery. Tier wedges get real catalog art (async). */
const WHEEL_GLYPH: Record<string, string> = {
  death: "💀", mystery: "🎁", common: "", rare: "", legendary: "", talisman: "", blank: "",
};
function wheelFaceTex(): {
  tex: THREE.Texture;
  pin: (i: number, url: string) => void;
  setFace: (files: (string | null)[]) => void;
} {
  // Double resolution of the first cut — the wedges now carry real emoji art
  // like the 2D disc, and 512px smeared it.
  const PX = 1024;
  const R = 492;
  const cv = document.createElement("canvas");
  cv.width = cv.height = PX;
  const c = cv.getContext("2d")!;
  const cx = PX / 2;
  const cy = PX / 2;
  const n = WHEEL_SLOTS_3D.length;
  const step = (Math.PI * 2) / n;

  const drawWedgeBase = (i: number): void => {
    const kind = WHEEL_SLOTS_3D[i];
    const [fill, rim] = WHEEL_FACE[kind];
    // -PI/2 is straight up on a canvas; slot 0 is CENTRED there, so each
    // wedge is drawn a half-step either side of its own centre line.
    const mid = -Math.PI / 2 + i * step;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, R, mid - step / 2, mid + step / 2);
    c.closePath();
    // The 2D disc's wedges are THREE-stop gradients (tier colour · shade ·
    // tier colour along the radius) — mirrored here so both wheels read as
    // the same object.
    const grad = c.createRadialGradient(cx, cy, 60, cx, cy, R);
    grad.addColorStop(0, fill);
    grad.addColorStop(0.55, rim);
    grad.addColorStop(1, fill);
    c.fillStyle = grad;
    c.fill();
    c.strokeStyle = "#1a130a";
    c.lineWidth = 3;
    c.stroke();
    const glyph = WHEEL_GLYPH[kind];
    if (glyph) drawOnWedge(i, (x, y) => {
      c.font = `56px ${EMOJI_FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(glyph, x, y);
    });
  };
  const drawBase = (): void => {
    c.clearRect(0, 0, PX, PX);
    for (let i = 0; i < n; i++) drawWedgeBase(i);
    // brass rim with MARQUEE BULBS — the 2D disc's ring of lights
    c.strokeStyle = "#c9a24a";
    c.lineWidth = 22;
    c.beginPath();
    c.arc(cx, cy, R - 9, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.fillStyle = i % 2 ? "#fff3cf" : "#ffd98a";
      c.beginPath();
      c.arc(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9), 7, 0, Math.PI * 2);
      c.fill();
    }
    // brass hub with the 2D disc's four-petal rosette
    c.fillStyle = "#8a6a2c";
    c.beginPath();
    c.arc(cx, cy, 84, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c9a24a";
    c.beginPath();
    c.arc(cx, cy, 72, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8a6a2c";
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      c.beginPath();
      c.ellipse(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 22, 13, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#ffe08a";
    c.beginPath();
    c.arc(cx, cy, 15, 0, Math.PI * 2);
    c.fill();
  };
  /** Run `draw` at the wedge's prize spot, rotated upright along its radius —
   *  the 2D disc's prize-ring geometry (0.72R). */
  const drawOnWedge = (i: number, draw: (x: number, y: number) => void): void => {
    const mid = -Math.PI / 2 + i * step;
    c.save();
    c.translate(cx + Math.cos(mid) * R * 0.72, cy + Math.sin(mid) * R * 0.72);
    c.rotate(mid + Math.PI / 2);
    draw(0, 0);
    c.restore();
  };
  drawBase();

  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; // a face, not a tile

  // THE FACE COMES FROM THE SERVER (src/wheel.ts `buildFace`). It used to be
  // rolled here, per client, per wedge — which is the bug Josh caught: the
  // disc rested on a rabbit and the reveal handed over a different emoji of
  // the same tier, because the two random picks had nothing to do with each
  // other, and no two players saw the same wheel. Now the wedge the spin lands
  // on IS the prize that was paid, and the same 32 files are broadcast to
  // everyone watching. This function only paints what it's given.
  const drawnFor: (string | null)[] = new Array(n).fill(null);
  const loadInto = (i: number, url: string): Promise<void> =>
    new Promise((done) => {
      const img = new Image();
      img.onload = (): void => {
        drawOnWedge(i, () => c.drawImage(img, -32, -32, 64, 64));
        done();
      };
      img.onerror = (): void => done();
      img.src = url;
    });
  const setFace = (files: (string | null)[]): void => {
    void (async () => {
      const jobs: Promise<void>[] = [];
      let cleared = false;
      for (let i = 0; i < n && i < files.length; i++) {
        const f = files[i];
        // A wedge that carried a prize last spin and carries none now (the
        // mystery wedge after a box win) goes back to its own art — skipping
        // the null left the old prize on it for good (Oct 2026 review).
        if (!f && drawnFor[i]) {
          drawnFor[i] = null;
          drawWedgeBase(i);
          cleared = true;
          continue;
        }
        if (!f || drawnFor[i] === f) continue;
        drawnFor[i] = f;
        drawWedgeBase(i); // clear whatever the last spin left here
        jobs.push(loadInto(i, `/emoji/${f}`));
      }
      if (!jobs.length) {
        if (cleared) tex.needsUpdate = true;
        return;
      }
      await Promise.all(jobs);
      tex.needsUpdate = true;
    })();
  };
  // Pin the ACTUAL award onto its wedge (Josh: "the rewards on the wheel
  // don't reflect what you will win… other players can see what another
  // player spun and won") — same rule as the 2D disc's wheel.awarded.
  const pin = (i: number, url: string): void => {
    const img = new Image();
    img.onload = (): void => {
      drawWedgeBase(i);
      drawOnWedge(i, () => c.drawImage(img, -32, -32, 64, 64));
      tex.needsUpdate = true;
    };
    img.src = url;
  };
  return { tex, pin, setFace };
}

/** A wall plaque texture: gold headline over felt black, landscape. */
function wallSignTex(text: string, sub: string): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 224;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#141008";
  c.fillRect(0, 0, 512, 224);
  c.strokeStyle = "#8a6a2c";
  c.lineWidth = 7;
  c.strokeRect(12, 12, 488, 200);
  c.strokeStyle = "#5a4318";
  c.lineWidth = 2;
  c.strokeRect(24, 24, 464, 176);
  c.fillStyle = "#e8c33c";
  c.textAlign = "center";
  c.font = "900 62px Georgia, serif";
  c.fillText(text, 256, 112, 440);
  c.fillStyle = "#b9a86e";
  c.font = "700 27px system-ui, sans-serif";
  c.fillText(sub, 256, 168, 440);
  dither(c, 512, 3);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** The closed entrance doors — dark panels, brass furniture. */
function doorTex(): THREE.Texture {
  return canvasTex(128, (c) => {
    c.fillStyle = "#241209";
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = "#180b05";
    c.lineWidth = 5;
    c.strokeRect(2, 2, 60, 124);
    c.strokeRect(66, 2, 60, 124);
    c.strokeStyle = "#3c2210";
    c.lineWidth = 2;
    for (const ox of [2, 66]) {
      c.strokeRect(ox + 8, 12, 44, 44);
      c.strokeRect(ox + 8, 66, 44, 50);
    }
    c.fillStyle = "#a8842c";
    c.fillRect(56, 60, 5, 12);
    c.fillRect(67, 60, 5, 12);
    dither(c, 128, 4);
  });
}

// (The jumbotron's canvas painter lived here and is GONE: the board is the
//  hub's real racetrack component now, mounted in 3D — casino/jumbo.svelte.ts.
//  A canvas replica of a Svelte view is exactly what kept being rejected.)

/** The reel strips are per THEME now — the Boulevard's slot sections each
 *  wear their own (slot-themes.ts). Same strip order and symbol ids as the 2D
 *  game, so a pull lands identically on every cabinet. */
const REEL_CELLS = REEL_STRIP.length;
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';

// ---- assets ------------------------------------------------------------------

export interface CasinoAssets {
  /** normalized node name → baked meshes, per source file */
  index: Map<string, Map<string, THREE.Mesh[]>>;
  wood: THREE.Texture;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const loader = new GLTFLoader();
const loadGlb = (url: string): Promise<THREE.Group> =>
  new Promise((res, rej) => loader.load(url, (g) => { tameGlbTransparency(g.scene); res(g.scene); }, undefined, rej));

async function texFile(url: string, forGltf = true): Promise<THREE.Texture> {
  // Awaited, not fire-and-forget: the hall CLONES these textures per wall
  // strip, and a clone taken before the image arrives stays empty forever.
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (forGltf) t.flipY = false; // glTF UV convention — the atlases map glTF geometry
  return t;
}

/** Index a loaded GLB: bake every mesh's world transform into its clone-source
 *  so takeProp() can place copies without caring how the file was authored. */
function indexGlb(root: THREE.Group): Map<string, THREE.Mesh[]> {
  root.updateMatrixWorld(true);
  const map = new Map<string, THREE.Mesh[]>();
  const put = (k: string, m: THREE.Mesh): void => {
    if (!k) return;
    const arr = map.get(k) ?? [];
    arr.push(m);
    map.set(k, arr);
  };
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const m = o as THREE.Mesh;
    put(norm(m.name), m);
    // A multi-material FBX mesh becomes a named GROUP of "<name>_1/_2" child
    // meshes in glTF — the blackjack table, the fortune wheel… — so a mesh is
    // ALSO findable by its parent group's name.
    const p = m.parent;
    if (p && p !== root && p.name && norm(p.name) !== norm(m.name)) put(norm(p.name), m);
  });
  return map;
}

export async function loadCasinoAssets(): Promise<CasinoAssets> {
  const files = [
    "props", "modular_bar", "bar_stool", "furniture_high", "chair", "round_table",
    "square_table", "chess", "barrel", "bottle", "glasses", "cash_register", "kiosk", "poker7",
    "jukebox", "speaker", "locker", "atm",
    // the slot sections' own machines (casino/slot-cabinets.ts)
    ...Object.values(CABINET_SPECS).map((c) => c.file),
  ];
  const urls: Record<string, string> = {
    props: `${BASE}/props.glb`,
    kiosk: `${BASE}/kiosk.glb`,
    // THE CASINO LOCKER (Josh's model, Aug 2026) — 50 numbered pigeonholes'
    // worth of cabinet by the doors.
    locker: `${BASE}/locker.glb`,
    // GOBLIN LENDERS' terminal (Josh's model, shrunk 4.0MB → 0.6MB by
    // scripts/shrink-glb.mjs). Scaled at placement — see LENDER_SCALE.
    atm: `${BASE}/atm.glb`,
    // THE JUKEBOX and its ceiling speakers (Josh's models, re-encoded by
    // scripts/shrink-glb.mjs — 8.6MB → 1.3MB; the dome's colour map stays PNG
    // because it is the one BLEND material in the file).
    jukebox: `${BASE}/jukebox.glb`,
    speaker: `${BASE}/speaker.glb`,
    // Josh's chess set — its own file, not a bar-pack piece
    // (scripts/convert-chess.mjs).
    chess: `${BASE}/chess.glb`,
    // Josh's 7-seat hold'em oval (scripts/convert-poker.mjs).
    poker7: `${BASE}/poker7.glb`,
    ...Object.fromEntries(Object.values(CABINET_SPECS).map((c) => [c.file, `${BASE}/vegas/${c.file}.glb`])),
  };
  const roots = await Promise.all(
    files.map((f) => loadGlb(urls[f] ?? `${BASE}/bar/${f}.glb`)),
  );

  // The props pack ships without images — its materials are named after the
  // two shared atlases, which ship once as WebP.
  const [atlas1, atlas2, wood] = await Promise.all([
    texFile(`${BASE}/atlas-1.webp`),
    texFile(`${BASE}/atlas-2.webp`),
    texFile(`${BASE}/tex/wood.png`, false), // dressed onto plain three planes
  ]);
  const byMat: Record<string, THREE.Material> = {
    atlas1texture: new THREE.MeshLambertMaterial({ map: atlas1 }),
    atlas2texture: new THREE.MeshLambertMaterial({ map: atlas2 }),
    transparent: new THREE.MeshLambertMaterial({
      color: 0xbfd8e0, transparent: true, opacity: 0.35, depthWrite: false,
    }),
  };
  const lambertify = (mat: THREE.Material): THREE.Material => {
    const named = byMat[norm(mat.name)];
    if (named) return named;
    const std = mat as THREE.MeshStandardMaterial;
    const map = std.map ?? null;
    if (map) map.magFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({
      map,
      color: map ? 0xffffff : (std.color ?? new THREE.Color(0xdddddd)),
      transparent: std.transparent ?? false,
      opacity: std.opacity ?? 1,
      // CARRY THE SIDEDNESS (Aug 2026). The locker is a single-shell model
      // whose GLB says doubleSided; rebuilding its material without `side`
      // culled the panels' far faces and the cabinet rendered inside-out
      // (Josh's screenshot — partitions and legs, no skin).
      side: std.side ?? THREE.FrontSide,
      // …but NEVER three's two-pass transparency (the Aug 2026 stutter
      // hunt): transparent + DoubleSide without this flag re-inits the
      // material TWICE PER FRAME, FOREVER — the jukebox glass + bar tables
      // alone cost 7MB/s of garbage and a GC every 1.2s. See
      // lib/three-hygiene, which tames the raw GLBs; this rebuild must not
      // reintroduce what the loader just removed.
      forceSinglePass: true,
    });
  };
  for (const root of roots) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material)
        ? m.material.map(lambertify)
        : lambertify(m.material as THREE.Material);
    });
  }

  const index = new Map<string, Map<string, THREE.Mesh[]>>();
  files.forEach((f, i) => index.set(f, indexGlb(roots[i])));
  return { index, wood };
}

/** Clone a pick out of a source file as a group whose origin is its own
 *  BOTTOM-CENTRE — placement then only needs a floor position. `pick: "all"`
 *  takes the entire file (used for compound pieces like the shelf unit). */
function takeProp(assets: CasinoAssets, src: string, pick: string): THREE.Group | null {
  const file = assets.index.get(src);
  if (!file) return null;
  // DEDUPED: indexGlb files a mesh under its own name AND its parent group's,
  // so a file with named groups around its meshes (Josh's chess set: node
  // "DarkBishop1" wrapping mesh "DarkBishop1_Dark Pieces_0") would otherwise
  // hand "all" the same mesh twice and draw every piece on top of itself.
  const meshes = pick === "all" ? [...new Set([...file.values()].flat())] : (file.get(pick) ?? []);
  if (!meshes.length) return null;
  const inner = new THREE.Group();
  for (const m of meshes) {
    const c = m.clone();
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    c.scale.set(1, 1, 1);
    c.applyMatrix4(m.matrixWorld);
    inner.add(c);
  }
  const bb = new THREE.Box3().setFromObject(inner);
  const ctr = bb.getCenter(new THREE.Vector3());
  inner.position.set(-ctr.x, -bb.min.y, -ctr.z);
  const g = new THREE.Group();
  g.add(inner);
  return g;
}

// ---- STERLING ------------------------------------------------------------------

/** The house bot, in the flesh, tending the north-wall bar. His body is the
 *  one every 3D Sterling wears (sterling-model.ts — drawn from the Trader
 *  portrait in Shop.svelte, so the 2D and 3D Sterlings look the same).
 *
 *  Sizing note: he stands BEHIND a 1.16m counter, so everything that has to
 *  read — gear, chest, face, hat — sits above 1.05m. Sightline from a patron's
 *  eye over the counter edge clears about 0.88m at his depth, which is what the
 *  belly gear is pinned just above.
 *
 *  Returns the spinner so the frame loop can turn it. */
function buildSterling(
  scene: THREE.Scene,
  /** Where the local player's ears are, in cells — the murmur trigger. */
  listener: () => [number, number],
  /** Personalized bar-talk from Sterling's one brain (lib/sterling-lines.ts),
   *  injected by the game component once its stores are live. Null = the
   *  static house pool below. */
  lineFor: () => string | null,
): { tick: (dt: number) => void; move: (g: SterlingGlide) => void; x: () => number } {
  // HE WORKS THE WHOLE BAR (Oct 2026): the server picks who he serves
  // (src/npc/barwork.ts) and sends each glide; this draws it. Home is the till.
  const STERLING_Z = STERLING.y * CELL;
  let glide: SterlingGlide = { x0: STERLING.x, x1: STERLING.x, t0: 0, dur: 0, face: null, greet: false };
  /** A greeting still owed: tip the hat once he's arrived. */
  let greetDue = false;
  /** Where a seated customer's head is (world), for him to look at. */
  const faceAt = new THREE.Vector3();
  /** Where the glide has him (cells) at local time t, and how fast (cells/s). */
  const glideAt = (t: number): { x: number; v: number } => {
    if (glide.dur <= 0) return { x: glide.x1, v: 0 };
    const u = (t - glide.t0) / glide.dur;
    if (u >= 1) return { x: glide.x1, v: 0 };
    if (u <= 0) return { x: glide.x0, v: 0 };
    const dx = glide.x1 - glide.x0;
    return { x: glide.x0 + dx * u * u * (3 - 2 * u), v: (dx * 6 * u * (1 - u)) / (glide.dur / 1000) };
  };
  let curX = STERLING.x;

  // His body is the shared one (sterling-model.ts), drawn from the Trader
  // portrait, so this barman and the escape room's are the same Sterling.
  // He breathes, looks at you, blinks, tips his hat and polishes glasses on
  // his own (sterling-model.ts) — tick hands him where you are and whether
  // he's talking.
  const fig = buildSterlingFigure();
  const { group: g, mouth } = fig;

  // behind the counter, facing the patrons (south, +z). He stands on a
  // DUCKBOARD — the real bar fitting, and it lifts him the 0.18m that
  // separates "tending the bar" from "peeking over it": at floor level the
  // 1.16m counter cropped him at the shoulders. It runs the length of the bar
  // now he does, with the brass rail he glides along let into it.
  const RISER = 0.18;
  const duckLen = (BAR.x1 - BAR.x0) * CELL - 0.3;
  const duckboard = new THREE.Mesh(
    new THREE.BoxGeometry(duckLen, RISER, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x4a2f1a }),
  );
  duckboard.position.set(((BAR.x0 + BAR.x1) / 2) * CELL, RISER / 2, STERLING_Z);
  scene.add(duckboard);
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(duckLen - 0.2, 0.02, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xc9a24a, emissive: 0x2e2008 }),
  );
  rail.position.set(((BAR.x0 + BAR.x1) / 2) * CELL, RISER + 0.01, STERLING_Z);
  scene.add(rail);
  g.position.set(curX * CELL, RISER, STERLING_Z);
  scene.add(g);

  // his own warm key — he stands in the gap between the two bottle walls, which
  // is the one stretch of counter their spill doesn't reach. It hangs high and
  // out over the counter: at 0.4m in front of him it sat a quarter-metre from
  // his face and washed him out to a white glare (Josh, Oct 2026).
  // It follows him down the bar (moving a light costs nothing; adding one would
  // recompile the hall — the frozen light count).
  const key = new THREE.PointLight(0xffc07a, 7, 5, 2);
  key.position.set(curX * CELL, 2.8, STERLING_Z + 1.4);
  scene.add(key);

  // THE BARMAN SPEAKS. Walk up to his stretch of the counter and Sterling
  // murmurs — the refined brass-blip voice (sterling-voice.ts via shop-audio's
  // sterlingMurmur, which also hands back the phrase length so the grill can
  // flicker exactly while he talks — the Shop's mouth contract). Cooldown so
  // he's a barman, not a parrot; the pool is bar-talk, not the Shop's pitch.
  const LINES = [
    "evening. the house pours honest.",
    "the wheel's been kind tonight. relatively.",
    "tickets for the derby are at the kiosk, friend.",
    "i saw a man beat the gold table once. once.",
    "silver in, stories out. that's the trade.",
    "mind the stage. the reaper works this room.",
  ];
  let murmurCd = 8; // first approach greets fairly fast
  let mouthMs = 0;
  const MOUTH_BASE = 0xffb347;
  const tick = (dt: number): void => {
    murmurCd -= dt;
    const { x, v } = glideAt(performance.now());
    curX = x;
    g.position.x = x * CELL;
    key.position.x = x * CELL;
    const [lx, ly] = listener();
    const near = Math.hypot(lx - x, ly - STERLING.y) < 2.7;
    // EVERYBODY SEES THE SAME STERLING: he looks at whoever the server says
    // he's serving (their stool), not at whichever player's screen this is.
    // Nobody at the bar: the figure glances about and polishes a glass.
    const look = glide.face !== null ? faceAt.set(glide.face * CELL, 1.45, 2.35 * CELL) : null;
    fig.tick(dt, { look, talking: mouthMs > 0, vx: v * CELL, autoTip: false });
    if (greetDue && Math.abs(v) < 0.02 && performance.now() >= glide.t0 + glide.dur) {
      greetDue = false;
      fig.tipHat();
    }
    // he murmurs to you when he's standing with you, not mid-glide
    if (near && murmurCd <= 0 && Math.abs(v) < 0.05) {
      murmurCd = 26 + Math.random() * 22;
      // Personalized when the brain is wired (your name, your wins, your
      // debts); the house pool when it isn't yet.
      const line = lineFor() ?? LINES[Math.floor(Math.random() * LINES.length)];
      mouthMs = sterlingMurmur(line);
    }
    if (mouthMs > 0) {
      mouthMs -= dt * 1000;
      // the grill flickers while he talks, then settles back to its glow
      mouth.color.setHex(Math.sin(mouthMs / 42) > 0 ? 0xffd98a : 0xc97e2a);
      if (mouthMs <= 0) mouth.color.setHex(MOUTH_BASE);
    }
  };
  const move = (next: SterlingGlide): void => {
    // a new glide starts from wherever he is NOW, so a re-plan mid-glide
    // never jumps him; a big gap (a stale tab, a fresh welcome) takes the
    // server's word for where he was
    const here = glideAt(performance.now()).x;
    glide = { ...next, x0: Math.abs(here - next.x0) < 0.6 ? here : next.x0 };
    if (next.greet) greetDue = true;
  };
  return { tick, move, x: () => curX };
}

/** A glide along the bar, in cells, timed in LOCAL performance.now() ms. */
export interface SterlingGlide {
  x0: number; x1: number; t0: number; dur: number;
  /** The stool (cells) of whoever he's serving, or null. */
  face: number | null;
  /** They've just sat down: tip the hat when he gets there. */
  greet: boolean;
}

// ---- the hall -----------------------------------------------------------------

/** How loud a slots win is celebrated in-world. The rungs are the SYMBOL
 *  ladder, not the paytable — a triple of crowns is always the top of the
 *  machine however the payouts are retuned. */
export type SlotWinTier = "small" | "good" | "big" | "jackpot";

/** What a built hall hands back: the per-frame tick for everything that moves,
 *  and the handles C4 drives. */
export interface Hall {
  /** Advance everything that moves. `px`/`py` are the local player's cell —
   *  the listener the attract-mode reel sounds fade against. */
  tick(dt: number, px?: number, py?: number): void;
  /** Nearest slot cabinet to a cell position — the in-world pull's target. */
  nearestCabinet(x: number, y: number): { index: number; d: number; x: number; y: number } | null;
  /** The stage's standing RESULT SCREEN: show what the last spin paid. */
  showWheelResult(info: { name?: string; outcome?: string; tier?: string; emojiFile?: string; emojiName?: string }): void;
  /** A legendary landed: Josh's party track, strobing colour lights, and a
   *  few seconds of confetti from the ceiling. Idempotent while running. */
  legendaryParty(): void;
  /** Celebrate a win on cabinet `index`: the screen flashes its payline and
   *  announces the prize, and — from `good` up — a pooled light and a pour of
   *  coins scaled to the tier. `payout` is only known for YOUR OWN pull (the
   *  floor wire carries symbols, never money), so a peer's win shows the same
   *  show with an unnumbered label. */
  slotWin(index: number, tier: SlotWinTier, payout?: number): void;
  /** Swing cabinet `index`'s arm through a full pull and let it spring back —
   *  the machine's own lever mesh on a pivot, ~0.64s. Call it at the moment
   *  the pull is made, not when the result lands: the yank comes first and the
   *  reels answer it. */
  pullLever(index: number): void;
  /** Land cabinet `index`'s reels on three symbol ids (the 2D strip's ids)
   *  with the full spin-up and staggered stops. Resolves when the last reel
   *  lands; a cabinet already animating resolves immediately (the caller
   *  guards double-pulls — this just refuses to fight the attract loop). */
  pullReels(index: number, symbols: string[]): Promise<void>;
  /** Spin the stage Wheel and land it on `slotIndex` of the real 32-slot wheel
   *  (src/wheel.ts WHEEL_SLOTS order). Resolves when the wheel stops. A call
   *  made while a spin is already running is IGNORED and resolves immediately —
   *  the caller owns not double-spinning. */
  spinWheel(slotIndex: number): Promise<void>;
  /** True once the disc has been found and pivoted — false means the prop
   *  changed shape and the spin is a no-op (logged, never thrown). */
  readonly wheelReady: boolean;
  /** The placed chess set — the in-world duel board (chessboard.ts). */
  readonly chessSet: THREE.Group | null;
  /** Pin the ACTUAL award onto the wedge the wheel rests on (2D parity). */
  pinAwarded(slotIndex: number, url: string): void;
  /** Clone a bar bottle out of the props pack, bottom-centred, for a player
   *  to carry. `pick` is a normalised prop name (beer01 / wine01 / whisky /
   *  champagne) — the same bottles that stand on Sterling's back bar. */
  takeBottle(pick: string): THREE.Group | null;
  /** Paint the wedges with THE SERVER'S face (src/wheel.ts buildFace): 32
   *  emoji files, the landed one carrying what the spin actually awarded.
   *  Everyone watching gets the same array, so everyone sees the same wheel. */
  setWheelFace(files: (string | null)[]): void;
  /** Drive the stage's spin clock: when the 2-hour bucket refills, and how
   *  many spins you're holding. */
  showSpinReset(nextResetMs: number, spins: number): void;
  /** Wire Sterling's one brain into the barman's proximity murmurs. */
  setSterlingLines(fn: () => string | null): void;
  /** Sterling glides along the bar (the server's glide, in local time). */
  sterlingMove(g: SterlingGlide): void;
  /** Where along the bar he is right now (cells). */
  sterlingX(): number;
  /** Spin the roulette wheel: the disc turns, the ball circles against it
   *  and settles IN the winning pocket as `durMs` runs out. */
  spinRoulette(pocket: number, durMs: number): void;
  /** The roulette wheel's centre in the world (the show's game camera). */
  rouletteAt(): THREE.Vector3 | null;
  /** Where the jumbotron's screen is, so the game screen can hang the REAL
   *  racetrack component on it (casino/jumbo.svelte.ts). */
  readonly jumboAt: THREE.Vector3;
}

export function buildHall(
  scene: THREE.Scene, world: CasinoWorld, assets: CasinoAssets,
): Hall {
  // Everything in the hall that moves registers here; buildHall returns one
  // combined tick so the render loop only knows about a single call.
  const tickers: ((dt: number) => void)[] = [];
  // Where the local player's ears are (cells) — tick() updates it every frame;
  // the attract loop fades its reel sounds by distance from here.
  let listenX = SPAWN.x;
  let listenY = SPAWN.y;
  const Wm = W * CELL;
  const Hm = H * CELL;

  scene.background = new THREE.Color(0x0e0a08);
  // 72m across: a thicker haze would grey out the far side of the hall
  scene.fog = new THREE.FogExp2(0x120d09, 0.012);
  // POOLED LIGHT (the polish pass): the base is dimmer than C1 shipped and
  // the zones carry their own pools — a casino floor is islands of light,
  // not an evenly lit office.
  // …but "islands of light" still has to leave a READABLE room between the
  // islands: at the C1 levels the slot and blackjack thirds were pure black
  // from the entrance, which reads as an unfinished room, not a dim one. Every
  // reference photo keeps carpet and wall legible in the gaps.
  // a big room with its lamps far apart: enough base light to keep the gaps
  // between them readable
  scene.add(new THREE.AmbientLight(0x6a5a4c, 0.95));
  scene.add(new THREE.HemisphereLight(0x86765f, 0x241a14, 0.6));
  for (const l of LIGHTS) {
    const p = new THREE.PointLight(0xffc98a, l.i, l.d, 2);
    p.position.set(l.x * CELL, l.h, l.y * CELL);
    scene.add(p);
  }
  // Every spot HANGS FROM A VISIBLE CAN in the ceiling (Josh: pools of light
  // were coming from nowhere) — a recessed dark ring with a glowing lens,
  // and the cone genuinely starts there.
  const canGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.1, 10);
  const canMat = new THREE.MeshLambertMaterial({ color: 0x1a130c });
  const lensGeo = new THREE.CircleGeometry(0.1, 10);
  const spot = (
    x: number, y: number, i: number, angle: number, color = 0xffe2b0, h = CEIL,
  ): void => {
    // from a higher ceiling (the Boulevard's dome) the cone has further to go
    const s = new THREE.SpotLight(color, i, Math.max(13, h + 7), angle, 0.55, 1.6);
    s.position.set(x * CELL, h - 0.12, y * CELL);
    s.target.position.set(x * CELL, 0, y * CELL);
    scene.add(s);
    scene.add(s.target);
    const can = new THREE.Mesh(canGeo, canMat);
    can.position.set(x * CELL, h - 0.05, y * CELL);
    scene.add(can);
    const lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color }));
    lens.rotation.x = -Math.PI / 2;
    lens.position.set(x * CELL, h - 0.105, y * CELL);
    scene.add(lens);
  };
  // THE JUKEBOX lights its own patch of carpet. No can for this one on
  // purpose: the machine's lit arch IS the fixture (the light-comes-from-
  // somewhere rule), so a warm point light sits just in front of its glass at
  // arch height rather than a spot hanging off the ceiling above it.
  {
    const j = new THREE.PointLight(0xffb46a, 13, 6.5, 2);
    j.position.set(JUKEBOX.x * CELL, 1.35, (JUKEBOX.y + 0.22) * CELL);
    scene.add(j);
  }
  // one tight pool per table, a bright show-white on the wheel
  for (const t of BJ_TABLES) spot(t.x, t.y, 70, 0.4);
  spot(HOLDEM.x, HOLDEM.y, 120, 0.46); // the seven-seat oval
  // the bone pit, chess, the roulette and the WHEEL (the hall's SHELL). The
  // wheel's can is pulled back off the disc and dimmed (Josh: "at the top of
  // the wheel the lighting is too bright") — it lights the apron and only
  // grazes the face, where the pointer reads.
  for (const sp of SHELL.spots) spot(sp.x, sp.y, sp.i, sp.angle, sp.color, sp.h);
  // neon spill by the lit signs. Neon never sits perfectly still: two detuned
  // sine terms give a slow breathe that never repeats on a countable beat, and
  // the older tube stutters now and then.
  const neonGlows = SHELL.neon.map((n, k) => {
    const l = new THREE.PointLight(n.color, n.i, n.d, 2);
    l.position.set(n.x * CELL, n.h, n.y * CELL);
    scene.add(l);
    return { l, n, phase: k * 2 };
  });
  let neonT = 0;
  tickers.push((dt) => {
    neonT += dt;
    for (const { l, n, phase } of neonGlows) {
      if (n.stutter) {
        const breathe = 1 + Math.sin(neonT * 1.7) * 0.05 + Math.sin(neonT * 0.61) * 0.03;
        const stutter = Math.sin(neonT * 37) > 0.995 ? 0.55 : 1;
        l.intensity = n.i * breathe * stutter;
      } else {
        l.intensity = n.i * (1 + Math.sin(neonT * 1.1 + phase) * 0.04);
      }
    }
  });

  // floor + ceiling: world-vegas.ts (the Vegas carpet, the marble walks, and a
  // ceiling open to the dome)
  buildVegas(scene, { tickers, ceilingTex });

  // ---- CEILING ROSES + the centre chandelier ---------------------------------
  // The C1 ceiling was a flat coffered slab with pendants stuck to it. Every
  // reference has a moulded centrepiece (Boyd's stained dome, the red room's
  // tiered chandelier), and a fitting always comes through something.
  const plasterMat = new THREE.MeshLambertMaterial({ color: 0x4a3524 });
  const roseBrass = new THREE.MeshBasicMaterial({ color: 0x8a6a2c });
  const roseOuter = new THREE.CylinderGeometry(0.62, 0.7, 0.07, 16);
  const roseInner = new THREE.CylinderGeometry(0.34, 0.4, 0.1, 16);
  const roseRing = new THREE.TorusGeometry(0.5, 0.022, 5, 20);
  for (const [lx, ly] of LAMPS) {
    const x = lx * CELL;
    const z = ly * CELL;
    const a = new THREE.Mesh(roseOuter, plasterMat);
    a.position.set(x, CEIL - 0.035, z);
    scene.add(a);
    const b = new THREE.Mesh(roseInner, plasterMat);
    b.position.set(x, CEIL - 0.1, z);
    scene.add(b);
    const r = new THREE.Mesh(roseRing, roseBrass);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, CEIL - 0.08, z);
    scene.add(r);
  }
  // ---- THE JUKEBOX'S CEILING SPEAKERS ----------------------------------------
  // Flush discs over the places people stand, so the music reaches the whole
  // hall instead of being audible only at the machine. Josh's model measures
  // 0.36m across and 0.083 thick and needs no scaling; its detailed face (1.6×
  // the geometry of the other side, and on the model's own −y) is the GRILLE,
  // so it mounts exactly as authored and looks down into the room.
  {
    const spk = takeProp(assets, "speaker", "all");
    if (spk) {
      // The model ships cream, which against this dark coffered ceiling read as
      // a sticker rather than a fitting (caught in the review sweep). Tinted to
      // the room's brass so it belongs to the same ceiling as the pendant
      // hardware. Cloned: the material is shared across every copy.
      const brass = new THREE.Color(0x7a6242);
      spk.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const dye = (mat: THREE.Material): THREE.Material => {
          const c = (mat as THREE.MeshLambertMaterial).clone() as THREE.MeshLambertMaterial;
          c.color = brass;
          return c;
        };
        m.material = Array.isArray(m.material) ? m.material.map(dye) : dye(m.material as THREE.Material);
      });
      for (const [sx, sy] of SPEAKERS) {
        const s = spk.clone(true);
        s.position.set(sx * CELL, CEIL - 0.084, sy * CELL);
        // A hair of yaw variety so nine identical discs don't read as a decal
        // repeated nine times.
        s.rotation.y = ((sx * 37 + sy * 61) % 360) * (Math.PI / 180);
        scene.add(s);
      }
    } else {
      console.warn("[casino] no ceiling speaker model");
    }
  }

  // The stage gets a real tiered chandelier on top of its rose — three rings of
  // candle bulbs on a brass stem, the room's one piece of ceiling jewellery.
  if (SHELL.chandelier) {
    const cx = SHELL.chandelier.x * CELL;
    const cz = SHELL.chandelier.y * CELL; // in front of the wheel, off its face
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
      new THREE.MeshLambertMaterial({ color: 0x6a5124 }),
    );
    stem.position.set(cx, CEIL - 0.55, cz);
    scene.add(stem);
    const armMat = new THREE.MeshBasicMaterial({ color: 0x9c7a30 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffdb9e });
    const flameGeo = new THREE.SphereGeometry(0.07, 6, 5);
    const tiers: [number, number, number][] = [[0.86, 10, 1.02], [0.58, 8, 1.34], [0.32, 6, 1.6]];
    for (const [radius, count, drop] of tiers) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 5, 24), armMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, CEIL - drop, cz);
      scene.add(ring);
      const flames = new THREE.InstancedMesh(flameGeo, flameMat, count);
      const fm = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        fm.setPosition(cx + Math.cos(t) * radius, CEIL - drop + 0.1, cz + Math.sin(t) * radius);
        flames.setMatrixAt(i, fm);
      }
      scene.add(flames);
    }
    const glow = new THREE.PointLight(0xffd9a0, 26, 11, 2);
    glow.position.set(cx, CEIL - 1.3, cz);
    scene.add(glow);
  }

  // walls: wood wainscot 0–1.2m, damask 1.2m–ceiling. The south wall leaves
  // the doorway segment out and fills it with the closed entrance doors.
  const WAIN = 1.2;
  const damask = damaskTex();
  const woodMat = new THREE.MeshLambertMaterial({ map: assets.wood, color: WALNUT });
  const damaskMat = new THREE.MeshLambertMaterial({ map: damask });
  const wallStrip = (
    len: number, y0: number, y1: number, mat: THREE.MeshLambertMaterial,
  ): THREE.Mesh => {
    const m = mat.clone();
    m.map = mat.map!.clone();
    m.map.repeat.set(len / 2, (y1 - y0) / 2);
    m.map.needsUpdate = true;
    return new THREE.Mesh(new THREE.PlaneGeometry(len, y1 - y0), m);
  };
  const addWall = (
    x: number, z: number, len: number, ry: number, y0: number, y1: number,
    mat: THREE.MeshLambertMaterial,
  ): void => {
    const m = wallStrip(len, y0, y1, mat);
    m.position.set(x, (y0 + y1) / 2, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  const dx0 = DOOR.x0 * CELL;
  const dx1 = DOOR.x1 * CELL;
  // north (faces +z), east (faces -x), west (faces +x)
  for (const [y0, y1, mat] of [[0, WAIN, woodMat], [WAIN, CEIL, damaskMat]] as const) {
    addWall(Wm / 2, 0, Wm, 0, y0, y1, mat);
    addWall(0, Hm / 2, Hm, Math.PI / 2, y0, y1, mat);
    addWall(Wm, Hm / 2, Hm, -Math.PI / 2, y0, y1, mat);
    // south, split around the doorway
    addWall(dx0 / 2, Hm, dx0, Math.PI, y0, y1, mat);
    addWall(dx1 + (Wm - dx1) / 2, Hm, Wm - dx1, Math.PI, y0, y1, mat);
  }
  // above the doors
  addWall((dx0 + dx1) / 2, Hm, dx1 - dx0, Math.PI, 2.4, CEIL, damaskMat);
  const doors = new THREE.Mesh(
    new THREE.PlaneGeometry(dx1 - dx0, 2.4),
    new THREE.MeshLambertMaterial({ map: doorTex() }),
  );
  doors.position.set((dx0 + dx1) / 2, 1.2, Hm - 0.03);
  doors.rotation.y = Math.PI;
  scene.add(doors);

  // the stage: platform + stair strip, dressed in the bar pack's wood
  const stageWood = new THREE.MeshLambertMaterial({ map: assets.wood.clone(), color: WALNUT });
  stageWood.map!.repeat.set(4, 3);
  stageWood.map!.needsUpdate = true;
  const sx0 = STAGE.x0 * CELL;
  const sx1 = STAGE.x1 * CELL;
  const sy0 = STAGE.y0 * CELL;
  const sy1 = STAGE.y1 * CELL;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0, 1, sy1 - sy0), stageWood);
  platform.position.set((sx0 + sx1) / 2, 0.5, (sy0 + sy1) / 2);
  scene.add(platform);
  const stair = new THREE.Mesh(
    new THREE.BoxGeometry((STAIR.x1 - STAIR.x0) * CELL, 0.5, CELL),
    stageWood,
  );
  stair.position.set(((STAIR.x0 + STAIR.x1) / 2) * CELL, 0.25, STAIR.y * CELL + 1);
  scene.add(stair);

  // ---- THE STAGE CARPET (Josh: "green like the background of the wheel of
  // fortune game, and say wheel of fortune in gold letters in the center").
  // The 2D view's felt is a radial #12402f → #0b271d → #05130d with a faint
  // 45° cross-hatch; this is that, on the floor, with the marquee's wordmark
  // laid into it. Canvas-top faces NORTH (the felts.ts rot mapping), which is
  // what makes the lettering read right-way-up to anyone coming at the stage
  // from the floor.
  {
    const CW = 1024, CH = 768; // 8m x 6m stage — same 4:3
    const cv = document.createElement("canvas");
    cv.width = CW;
    cv.height = CH;
    const g = cv.getContext("2d")!;
    const bg = g.createRadialGradient(CW / 2, CH * 0.3, 40, CW / 2, CH * 0.3, CW * 0.72);
    bg.addColorStop(0, "#12402f");
    bg.addColorStop(0.55, "#0b271d");
    bg.addColorStop(1, "#05130d");
    g.fillStyle = bg;
    g.fillRect(0, 0, CW, CH);
    g.strokeStyle = "rgba(255,255,255,0.028)";
    g.lineWidth = 1;
    for (let d = -CH; d < CW; d += 20) {
      g.beginPath(); g.moveTo(d, 0); g.lineTo(d + CH, CH); g.stroke();
      g.beginPath(); g.moveTo(d + CH, 0); g.lineTo(d, CH); g.stroke();
    }
    // a gold border, inset — the stage reads as its own room
    g.strokeStyle = "#b9932f";
    g.lineWidth = 6;
    g.strokeRect(26, 26, CW - 52, CH - 52);
    g.strokeStyle = "#7a5f1e";
    g.lineWidth = 2;
    g.strokeRect(40, 40, CW - 80, CH - 80);
    // THE WORDMARK, on the apron in front of the wheel. Not dead centre: the
    // disc stands over the northern third and the spin spot is at 63% down, so
    // the middle of the stage is under the wheel or under YOU. Pushed to the
    // southern apron, which is also the strip of stage that a player on the
    // floor can actually see over the platform's lip.
    const ty = CH * 0.76;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const gold = g.createLinearGradient(0, ty - 90, 0, ty + 90);
    gold.addColorStop(0, "#f8e6ba");
    gold.addColorStop(0.45, "#c9a24a");
    gold.addColorStop(0.75, "#8a6a2c");
    gold.addColorStop(1, "#e2c274");
    g.fillStyle = gold;
    g.strokeStyle = "#2a1f08";
    g.lineWidth = 3;
    g.font = "900 92px Georgia, 'Times New Roman', serif";
    g.fillText("WHEEL OF", CW / 2, ty - 56);
    g.strokeText("WHEEL OF", CW / 2, ty - 56);
    g.font = "900 118px Georgia, 'Times New Roman', serif";
    g.fillText("FORTUNE", CW / 2, ty + 58);
    g.strokeText("FORTUNE", CW / 2, ty + 58);
    g.fillStyle = "#e8c33c";
    g.font = "44px Georgia, serif";
    g.fillText("★", CW / 2 - 330, ty);
    g.fillText("★", CW / 2 + 330, ty);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(sx1 - sx0, sy1 - sy0),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set((sx0 + sx1) / 2, 1.006, (sy0 + sy1) / 2); // stage top is 1m
    scene.add(m);
  }

  // ---- STAGE DRESSING (the polish pass) -------------------------------------
  // a pleated velvet skirt around the platform sides…
  const velvet = velvetTex();
  const skirtMat = new THREE.MeshLambertMaterial({ map: velvet });
  skirtMat.map!.repeat.set(8, 1);
  const skirt = (len: number, x: number, z: number, ry: number): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), skirtMat);
    m.position.set(x, 0.5, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  skirt(sx1 - sx0, (sx0 + sx1) / 2, sy1 + 0.012, 0); // south face
  skirt(sy1 - sy0, sx0 - 0.012, (sy0 + sy1) / 2, Math.PI / 2); // west
  skirt(sy1 - sy0, sx1 + 0.012, (sy0 + sy1) / 2, -Math.PI / 2); // east
  skirt(sx1 - sx0, (sx0 + sx1) / 2, sy0 - 0.012, Math.PI); // north
  // …the STAIR block gets the same treatment. Bare, it was a 4m pale slab dead
  // centre of the arrival shot — the single loudest untreated surface in the
  // hall. Half-height skirt (the step is 0.5m, not 1m).
  const stx0 = STAIR.x0 * CELL;
  const stx1 = STAIR.x1 * CELL;
  const stz0 = STAIR.y * CELL;
  const stz1 = stz0 + CELL;
  const stairSkirtMat = skirtMat.clone();
  stairSkirtMat.map = velvet.clone();
  stairSkirtMat.map.repeat.set(4, 0.5);
  stairSkirtMat.map.needsUpdate = true;
  const stairSkirt = (len: number, x: number, z: number, ry: number): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), stairSkirtMat);
    m.position.set(x, 0.25, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  stairSkirt(stx1 - stx0, (stx0 + stx1) / 2, stz1 + 0.012, 0); // south face
  stairSkirt(CELL, stx0 - 0.012, (stz0 + stz1) / 2, Math.PI / 2); // west
  stairSkirt(CELL, stx1 + 0.012, (stz0 + stz1) / 2, -Math.PI / 2); // east
  // brass nosing along both tread edges — catches the marquee light and gives
  // the steps a readable line instead of a wood-on-wood join
  const brassMat = new THREE.MeshBasicMaterial({ color: 0xc9a24a });
  const nosing = (len: number, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.06), brassMat);
    m.position.set(x, y, z);
    scene.add(m);
  };
  nosing(stx1 - stx0, (stx0 + stx1) / 2, 0.5, stz1 + 0.02);
  nosing(sx1 - sx0, (sx0 + sx1) / 2, 1.0, sy1 + 0.02);
  // …marquee bulbs along the stage's front lip…
  const bulbGeo = new THREE.SphereGeometry(0.045, 6, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  const BULBS = 20;
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, BULBS);
  const bm = new THREE.Matrix4();
  for (let i = 0; i < BULBS; i++) {
    bm.setPosition(sx0 + 0.2 + ((sx1 - sx0 - 0.4) * i) / (BULBS - 1), 1.02, sy1 + 0.03);
    bulbs.setMatrixAt(i, bm);
    bulbs.setColorAt(i, new THREE.Color(0xffd98a));
  }
  scene.add(bulbs);
  // …which CHASE. A marquee lip with dead bulbs is scenery; a running highlight
  // is what makes the stage read as live. Two lit heads travelling in opposite
  // directions, so the eye never resolves it into a simple loop.
  const litBulb = new THREE.Color(0xfff0c4);
  const dimBulb = new THREE.Color(0x6b4a1e);
  const tmpBulb = new THREE.Color();
  let chaseT = 0;
  tickers.push((dt) => {
    chaseT += dt * 6.5; // bulbs per second
    for (let i = 0; i < BULBS; i++) {
      const a = ((i - chaseT) % BULBS + BULBS) % BULBS;
      const b = ((i + chaseT) % BULBS + BULBS) % BULBS;
      // distance to the nearest travelling head, wrapped
      const near = Math.min(a, BULBS - a, b, BULBS - b);
      const k = Math.max(0, 1 - near / 2.5);
      bulbs.setColorAt(i, tmpBulb.copy(dimBulb).lerp(litBulb, k));
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  });
  // …and VELVET ROPES sagging between the stanchion tops (measured: post top
  // ~1.37m × the prop's own scale — the catenary is faked with a quadratic).
  const ropeMat = new THREE.MeshLambertMaterial({ color: 0x6e1620 });
  for (const [x0, y0, x1, y1] of ROPES) {
    const a = new THREE.Vector3(x0 * CELL, 1.28, y0 * CELL);
    const b = new THREE.Vector3(x1 * CELL, 1.28, y1 * CELL);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= Math.min(0.34, a.distanceTo(b) * 0.12); // the sag
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.028, 5), ropeMat));
  }

  // ---- WALL RHYTHM: columns + a brass trim line ------------------------------
  const colMat = new THREE.MeshLambertMaterial({ map: assets.wood.clone(), color: WALNUT });
  colMat.map!.repeat.set(0.5, 3);
  colMat.map!.needsUpdate = true;
  const colGeo = new THREE.BoxGeometry(0.5, CEIL, 0.5);
  const column = (x: number, z: number): void => {
    const m = new THREE.Mesh(colGeo, colMat);
    m.position.set(x, CEIL / 2, z);
    scene.add(m);
  };
  for (const [x, y] of SHELL.columns) column(x * CELL, y * CELL);
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x8a6a2c });
  const trim = (len: number, x: number, z: number, ry: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.03), trimMat);
    m.position.set(x, 1.22, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  trim(Wm, Wm / 2, 0.05, 0);
  trim(Hm, 0.05, Hm / 2, Math.PI / 2);
  trim(Hm, Wm - 0.05, Hm / 2, Math.PI / 2);
  trim(dx0, dx0 / 2, Hm - 0.05, 0);
  trim(Wm - dx1, dx1 + (Wm - dx1) / 2, Hm - 0.05, 0);

  // ---- ZONE RUG: the slots runner. (The old CARD-PIT rug — a 3.4x14.4m
  // green slab at x~23 — dressed a blackjack row that moved to the wing two
  // layouts ago; it outlived its tables twice and read as a swamp across the
  // seam. Caught by Josh's Aug 2026 artifact sweep, removed.)
  // The slots runner used the card-pit's GREEN rug tinted tan, which under the
  // dim aisle read as a black void down the middle of the bank. It gets the
  // hall's own carpet instead, warmed a shade so it still reads as a runner.
  for (const rr of SHELL.runners) {
    const runner = carpetTex();
    runner.repeat.set(rr.w / 1.714, rr.h / 1.8); // the classic 2.4×14.4m runner's 1.4×8
    runner.needsUpdate = true;
    const rug2 = new THREE.Mesh(
      new THREE.PlaneGeometry(rr.w, rr.h),
      new THREE.MeshLambertMaterial({ map: runner, color: 0xd8a878 }),
    );
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(rr.x * CELL, 0.008, rr.y * CELL);
    scene.add(rug2);
  }

  // ---- WALL PLAQUES (the floor-stand placards are GONE — Josh, Aug 2026:
  // "remove the game signs… for the blackjack table just put the sign on the
  // wall behind the table"). A framed panel flush on the wall plane. -----------
  const plaqueMat = new THREE.MeshLambertMaterial({ color: 0x4a3416 });
  for (const s of WALL_SIGNS) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.6, 0.05), plaqueMat);
    g.add(frame);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.52),
      new THREE.MeshBasicMaterial({ map: wallSignTex(s.text, s.sub) }),
    );
    board.position.z = 0.028;
    g.add(board);
    g.position.set(s.at[0] * CELL, s.h, s.at[1] * CELL);
    // plane +z is the reading face — turn it along the room-facing vector
    g.rotation.y = Math.atan2(s.face[0], s.face[1]);
    scene.add(g);
  }

  // ---- THE ESCAPE ROOM DOOR (north wall, east of the jukebox — ESCAPE.md).
  // A recessed dark doorway that reads as a way OUT of the hall, with a lit
  // sign above it. It never swings: E at the threshold teleports, exactly
  // like the entrance doors. -------------------------------------------------
  {
    const EX = ESCAPE_DOOR.x * CELL;
    const doorW = 1.5, doorH = 2.5;
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a2a16 });
    const g = new THREE.Group();
    // The void you walk into — pure black, set into the wall plane.
    const void_ = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW, doorH),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    void_.position.set(0, doorH / 2, 0.02);
    g.add(void_);
    // Frame: two jambs + a lintel, proud of the wall.
    const jamb = new THREE.BoxGeometry(0.14, doorH + 0.14, 0.16);
    for (const s of [-1, 1]) {
      const j = new THREE.Mesh(jamb, frameMat);
      j.position.set((s * (doorW + 0.14)) / 2, (doorH + 0.14) / 2, 0.06);
      g.add(j);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.42, 0.16, 0.16), frameMat);
    lintel.position.set(0, doorH + 0.07, 0.06);
    g.add(lintel);
    // The sign above, lit like a marquee — the one Josh asked for.
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.46),
      new THREE.MeshBasicMaterial({ map: wallSignTex("ESCAPE ROOM", "STAKE A RARE · SURVIVE") }),
    );
    signBoard.position.set(0, doorH + 0.55, 0.05);
    g.add(signBoard);
    const signGlow = new THREE.PointLight(0xffc76a, 0.65, 4.2);
    signGlow.position.set(0, doorH + 0.5, 0.6);
    g.add(signGlow);
    // The group's +z is the room side: turn it along the door's own face (0 on
    // the classic north wall).
    g.position.set(EX, 0, ESCAPE_DOOR.y * CELL);
    g.rotation.y = Math.atan2(ESCAPE_DOOR.face[0], ESCAPE_DOOR.face[1]);
    scene.add(g);
  }

  // ---- THE BAR — one continuous counter (Josh: "the bar top should be one
  // continuous bar", replacing the visibly sectional modular pieces) --------
  {
    // the counter stands 0.1 inside its collider line at each end
    const BX0 = (BAR.x0 + 0.1) * CELL;
    const BX1 = (BAR.x1 - 0.1) * CELL;
    const BZ = BAR.y * CELL;
    const LEN = BX1 - BX0;
    const CX = (BX0 + BX1) / 2;
    // paneled body — ONE box, the bar-pack wall paneling tiled along it
    const frontTex = assets.wood.clone();
    frontTex.repeat.set(LEN / 1.6, 0.62);
    frontTex.needsUpdate = true;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(LEN, 1.1, 0.64),
      new THREE.MeshLambertMaterial({ map: frontTex, color: WALNUT }),
    );
    body.position.set(CX, 0.55, BZ);
    scene.add(body);
    // the seamless top slab: dark polished walnut, overhanging the front
    const topTex = canvasTex(64, (c) => {
      c.fillStyle = "#2a1608";
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = "#38200e";
      c.lineWidth = 1;
      for (let y = 3; y < 64; y += 7) {
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(20, y + 2, 44, y - 2, 64, y + 1);
        c.stroke();
      }
      dither(c, 64, 3);
    });
    topTex.repeat.set(LEN / 2, 1);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(LEN + 0.3, 0.07, 0.92),
      new THREE.MeshLambertMaterial({ map: topTex }),
    );
    top.position.set(CX, 1.135, BZ + 0.06);
    scene.add(top);
    // brass nosing along the front edge of the top…
    const brass = new THREE.MeshBasicMaterial({ color: 0x8a6a2c });
    const nose = new THREE.Mesh(new THREE.BoxGeometry(LEN + 0.3, 0.03, 0.03), brass);
    nose.position.set(CX, 1.17, BZ + 0.53);
    scene.add(nose);
    // …and a brass FOOT RAIL floating off the panel, with stirrup brackets
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, LEN - 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0xa8842c }),
    );
    rail.rotation.z = Math.PI / 2;
    rail.position.set(CX, 0.22, BZ + 0.42);
    scene.add(rail);
    for (let i = 0; i <= 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), brass);
      b.position.set(BX0 + 0.5 + ((LEN - 1) * i) / 5, 0.21, BZ + 0.37);
      scene.add(b);
    }
  }

  // The jumbotron above the bar. The PICTURE is not painted here any more:
  // casino/jumbo.svelte.ts mounts the hub's real racetrack component onto this
  // plane through a CSS3D layer (Josh: "put the same screen someone would see
  // in the 2d casino"). What stays in WebGL is the screen it is shown on — a
  // dark panel with the room's light on it, which is also what you see if the
  // board ever hides itself behind furniture.
  // A wall fixture: `off` metres out from the wall plane along its face.
  const onWall = (fx: { x: number; y: number; face: [number, number] }, off: number, m: THREE.Object3D, h: number): void => {
    m.position.set(fx.x * CELL + fx.face[0] * off, h, fx.y * CELL + fx.face[1] * off);
    m.rotation.y = Math.atan2(fx.face[0], fx.face[1]);
  };
  const J = SHELL.jumbo;
  const jumbo = new THREE.Mesh(
    new THREE.PlaneGeometry(J.w, J.h),
    new THREE.MeshBasicMaterial({ color: 0x0c0f14 }),
  );
  onWall(J, 0.13, jumbo, J.z); // clear of the frame box's front face
  scene.add(jumbo);
  const JUMBO_AT = new THREE.Vector3(J.x * CELL + J.face[0] * 0.16, J.z, J.y * CELL + J.face[1] * 0.16);
  const jumboFrame = new THREE.Mesh(new THREE.BoxGeometry(J.w + 0.4, J.h + 0.4, 0.1), woodMat);
  onWall(J, 0.02, jumboFrame, J.z);
  scene.add(jumboFrame);

  // ---- the FLANKING SCREENS (Josh): wheel feed right, big winners left -------
  // Two smaller boards above the back-bar shelves. Painted ~1Hz off app-level
  // stores; nothing new on any wire.
  const sideScreen = (at: { x: number; y: number; face: [number, number] }): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } => {
    // Drawn in a 512×320 frame onto a canvas twice that (scanBg sets the
    // scale), so the words stay sharp on a 2.9m screen.
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 640;
    const g = cv.getContext("2d")!;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.8), new THREE.MeshBasicMaterial({ map: tex }));
    onWall(at, 0.13, mesh, 3.62);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.14, 2.02, 0.09), woodMat);
    onWall(at, 0.03, frame, 3.62);
    scene.add(mesh, frame);
    return { cv, g, tex };
  };
  const scanBg = (g: CanvasRenderingContext2D, title: string): void => {
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.fillStyle = "#0c0f14";
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = "#1a202b";
    g.lineWidth = 1;
    for (let y = 0; y < 320; y += 6) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    }
    g.textAlign = "center";
    g.fillStyle = "#e8c33c";
    g.font = "900 34px system-ui, sans-serif";
    g.fillText(title, 256, 44);
    g.fillRect(56, 58, 400, 2);
    g.textAlign = "left";
  };
  // THE BOARDS, READABLE (Oct 2026 polish — Josh: "fix the tvs"): six rows of
  // 21px text on a 2.9m screen read as specks from the lounge. Four rows now,
  // the line big and the detail beside it, a long name cut to fit.
  const fitText = (g: CanvasRenderingContext2D, text: string, max: number): string => {
    if (g.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  };
  const ROWS = 4;
  const rowY = (i: number): number => 102 + i * 58;
  const emptyLine = (g: CanvasRenderingContext2D, text: string): void => {
    g.fillStyle = "#8a93a3";
    g.font = "700 26px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(text, 256, 180);
    g.textAlign = "left";
  };
  const feedScr = sideScreen(SHELL.feedScreen); // the Wheel's live feed
  const winsScr = sideScreen(SHELL.winsScreen); // the floor's big winners
  const FEED_TIER: Record<string, string> = {
    common: "#7cae5f", rare: "#9d63d2", legendary: "#f39620", mythic: "#ff5db1",
  };
  let sideAcc = 1;
  let partyFeedId = ""; // dedupe: one party per legendary feed item
  tickers.push((dt) => {
    sideAcc += dt;
    if (sideAcc < 1) return;
    sideAcc = 0;
    // RIGHT: the Wheel's live feed — the 2D LIVE panel, on the wall
    {
      const g = feedScr.g;
      scanBg(g, "🎡 THE WHEEL — LIVE");
      const rows = wheel.feed.slice(0, ROWS);
      if (!rows.length) emptyLine(g, "quiet for now");
      rows.forEach((it, i) => {
        const y = rowY(i);
        const who = it.user.displayName || it.user.username;
        g.font = "800 30px system-ui, sans-serif";
        let line: string;
        let tag = "";
        if (it.kind === "win") {
          g.fillStyle = FEED_TIER[it.tier ?? ""] ?? "#e6dfd0";
          line = `${who} · ${it.emoji?.name ?? "an emoji"}`;
          tag = (it.tier ?? "").toUpperCase();
        } else if (it.kind === "talisman") {
          g.fillStyle = "#42c1c4";
          line = `${who} · the talisman`;
        } else if (it.kind === "death") {
          g.fillStyle = "#e0604f";
          line = `💀 ${who}`;
          tag = "TAKEN";
        } else {
          g.fillStyle = "#e8c33c";
          line = `${who} cheated death`;
        }
        g.fillText(fitText(g, line, tag ? 372 : 464), 24, y);
        if (tag) {
          g.fillStyle = "#8a93a3";
          g.font = "800 18px system-ui, sans-serif";
          g.textAlign = "right";
          g.fillText(tag, 488, y);
          g.textAlign = "left";
        }
      });
      feedScr.tex.needsUpdate = true;
      // a legendary in the feed = the party, whoever won it and wherever from
      const leg = wheel.feed.find((it) => it.kind === "win" && it.tier === "legendary");
      if (leg && leg.id !== partyFeedId) {
        const fresh = Date.now() - leg.at < 30_000;
        partyFeedId = leg.id;
        if (fresh) legendaryParty();
      }
    }
    // LEFT: big winners across the floor (bigwins.ts collects from the public
    // game states; entries fall out after 90s so the list stays RECENT)
    {
      const g = winsScr.g;
      scanBg(g, "🏆 BIG WINNERS");
      if (!bigWins.list.length) emptyLine(g, "the floor is warming up…");
      bigWins.list.slice(0, ROWS).forEach((w, i) => {
        const age = (Date.now() - w.at) / 90_000;
        const y = rowY(i);
        g.globalAlpha = Math.max(0.3, 1 - age);
        const amt = `+${w.amount.toLocaleString()}`;
        g.font = "900 30px system-ui, sans-serif";
        g.fillStyle = "#7dffa6";
        g.textAlign = "right";
        g.fillText(amt, 488, y);
        const amtW = g.measureText(amt).width;
        g.textAlign = "left";
        g.fillStyle = "#ffe08a";
        g.font = "800 30px system-ui, sans-serif";
        g.fillText(fitText(g, w.name, 464 - amtW - 16), 24, y);
        g.fillStyle = "#8a93a3";
        g.font = "700 17px system-ui, sans-serif";
        g.fillText(w.game.toUpperCase(), 24, y + 22);
        g.globalAlpha = 1;
      });
      winsScr.tex.needsUpdate = true;
    }
  });

  // ---- THE BACK BAR: two lit bottle walls flanking the jumbotron ------------
  // They sit either side of the screen rather than behind it — the jumbotron's
  // lower edge is at 1.75m and a shelf unit wants that height.
  for (const [bx0, bx1] of SHELL.backBar) {
    const w = (bx1 - bx0) * CELL;
    const cx = ((bx0 + bx1) / 2) * CELL;
    const glassTex = backBarTex();
    glassTex.repeat.set(w / 3.2, 1);
    glassTex.needsUpdate = true;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 1.55),
      new THREE.MeshBasicMaterial({ map: glassTex }), // self-lit: it IS the light
    );
    glass.position.set(cx, 1.98, 0.14);
    scene.add(glass);
    // a walnut case around it so the glow reads as joinery, not a floating decal
    const caseMat = new THREE.MeshLambertMaterial({ map: assets.wood.clone(), color: WALNUT });
    caseMat.map!.repeat.set(w / 2, 0.4);
    caseMat.map!.needsUpdate = true;
    for (const [cw, ch, cy] of [[w + 0.3, 0.14, 2.83], [w + 0.3, 0.14, 1.13]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.3), caseMat);
      m.position.set(cx, cy, 0.16);
      scene.add(m);
    }
    // the shelves' spill onto the counter below
    const spill = new THREE.PointLight(0xffb469, 12, 6, 2);
    spill.position.set(cx, 1.9, 0.7);
    scene.add(spill);
  }

  // ---- FRAMED PICTURES on the damask band ------------------------------------
  const frameMat = new THREE.MeshLambertMaterial({ map: assets.wood.clone(), color: 0x7a4f2a });
  let picSeed = 0;
  const picture = (x: number, z: number, ry: number, w: number, h: number): void => {
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({ map: pictureTex(++picSeed) }),
    );
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), frameMat);
    for (const m of [art, frame]) {
      m.rotation.y = ry;
      scene.add(m);
    }
    // the art sits proud of the frame face along the wall normal
    art.position.set(x + Math.sin(ry) * 0.04, 2.15, z + Math.cos(ry) * 0.04);
    frame.position.set(x, 2.15, z);
  };
  for (const p of SHELL.pictures) picture(p.x * CELL, p.y * CELL, Math.atan2(p.face[0], p.face[1]), 1.0, 0.78);

  // props from the layout
  const glowing: { mat: THREE.MeshLambertMaterial; phase: number }[] = [];
  let glowPhase = 0;
  let wheelPivot: THREE.Group | null = null;
  let chessSet: THREE.Group | null = null;
  let rouWheel: RouletteWheel | null = null;
  // LIVE REELS (C4). The cabinet's reel band is painted atlas art, so each
  // machine gets three small overlay planes riding its face, sharing one strip
  // texture — a reel is offset.y on a clone. Rest offsets land on cell
  // boundaries so the idle face always shows whole symbols.
  // ONE SCREEN PER CABINET (Josh: "the slot machines should just be one
  // visible screen"). No layered planes, no texture-offset math: each machine
  // carries a single opaque plane whose CANVAS is redrawn while its reels
  // move — the bezel, the three windows and the symbols are all pixels on the
  // same surface, so nothing can pop out, parallax, or show the cabinet's
  // painted band behind. Rest positions are integers, so the result is always
  // three whole symbols — the "lands on blank" bug was the old offset math.
  // THE CABINET'S SCREEN IS THE "CRYSTAL" — A RAKED PANE OF GLASS, and every
  // earlier cut of this overlay stood a bolt-upright plane somewhere behind it.
  // Measured off props.glb (local units, after takeProp's bottom-centre
  // recentring): the Casino Machine node carries a child "Crystal" whose big
  // BLEND face — the glass you actually look at — has normal (-0.996, 0.090, 0),
  // a 5.16deg lean back, centred (-0.271, 1.464, -0.061), spanning y
  // 1.143..1.785 and z -0.633..0.512. Behind it the cabinet's own painted band
  // sits at a DIFFERENT 6.14deg rake, 7cm further in. So the earlier overlay was
  // both mistilted and sunk two surfaces deep — the wedge in Josh's photo, with
  // the model's screen still showing in front of it. The panel now lies 5mm
  // PROUD of the glass, at the glass's own rake, over-covering it in both axes,
  // so the glass and the painted band behind it are gone and only this shows.
  const REEL_TILT = 0.0901; // rad — the glass's lean-back off vertical
  const REEL_NX = -Math.cos(REEL_TILT); // its face normal, local
  const REEL_NY = Math.sin(REEL_TILT);
  const REEL_CX = -0.271; // the glass face's centroid
  const REEL_CY = 1.464;
  const REEL_CZ = -0.061;
  const REEL_LIFT = 0.006; // out along the normal, clear of the glass
  const REEL_W = 1.175; // glass is 1.145 wide; this is flush with the cabinet
  const REEL_HGT = 0.652; // glass is 0.6446 along the raked surface
  // Canvas matches the surface aspect (1.175 / 0.652) so nothing is squashed.
  const SCR_W = 384;
  const SCR_H = 213;
  const WIN_W = 112;
  const WIN_H = 112; // square: WIN_H IS the strip's cell height, so symbols stay round
  const WIN_Y = 82;
  /** WHERE THE REELS SIT ON A SCREEN. The classic's numbers are the ones
   *  above; every other cabinet's screen has its own shape (slot-cabinets.ts),
   *  so its canvas takes that aspect and centres three square windows in it.
   *  A screen much wider than tall (Lucky Spin's reel strip) is a STRIP: the
   *  windows alone, with the stake either side of them. */
  interface ScreenLayout { W: number; H: number; win: number; winY: number; x0: number; gap: number; mq: number; strip: boolean }
  const CLASSIC_LAYOUT: ScreenLayout = { W: SCR_W, H: SCR_H, win: WIN_W, winY: WIN_Y, x0: 14, gap: 10, mq: WIN_Y - 8, strip: false };
  const layoutFor = (w: number, h: number): ScreenLayout => {
    const aspect = w / h;
    const win = WIN_W;
    const gap = 10;
    if (aspect > 3) {
      const H = 128;
      const W = Math.round(H * aspect);
      return { W, H, win, winY: 8, x0: Math.round((W - (3 * win + 2 * gap)) / 2), gap, mq: 0, strip: true };
    }
    const H = SCR_H;
    const W = Math.round(H * aspect);
    return { W, H, win, winY: WIN_Y, x0: Math.round((W - (3 * win + 2 * gap)) / 2), gap, mq: WIN_Y - 8, strip: false };
  };
  // ---- THE LEVER ----------------------------------------------------------
  // The pack ships it as a real mesh ("Lever", a child of the Casino Machine
  // node): a post at x -0.087, z 0.614 rising from y 1.173, angling forward to
  // the ball at (-0.29, 1.74). It pivots at the post's base and swings in the
  // x-y plane — i.e. about local z, where a POSITIVE angle takes the top
  // forward (-x) and down, which is the pull.
  // ---- WHAT A WIN LOOKS LIKE ----------------------------------------------
  // Four rungs, so the size of the prize is legible from across the floor
  // without reading a number: the screen flashes on every win, a pooled light
  // appears from `good` up, coins pour from `big` up, and the jackpot hops
  // hue and lights the neighbouring machines too. `mq` tints the marquee
  // behind the flashing label; `col`/`peak` are the light; `range` keeps the
  // pool ON this cabinet (the hall is deliberately dark between zones).
  const WIN_LOOK: Record<SlotWinTier, {
    ink: string; mq: string; col: number; peak: number; range: number;
    coins: number; dur: number;
  }> = {
    small: { ink: "#ffd9a0", mq: "#4a2a18", col: 0xffc98a, peak: 0, range: 3, coins: 0, dur: 1.5 },
    good: { ink: "#ffcf7a", mq: "#5a3216", col: 0xffb347, peak: 7, range: 3.4, coins: 0, dur: 2.4 },
    big: { ink: "#ffe9a8", mq: "#6b3f12", col: 0xffd76a, peak: 15, range: 4.6, coins: 30, dur: 3.4 },
    jackpot: { ink: "#fff6d8", mq: "#7a4a10", col: 0xfff0c4, peak: 24, range: 5.5, coins: 80, dur: 5 },
  };
  const LEV_PIVOT: [number, number, number] = [-0.087, 1.173, 0.614];
  const LEV_MAX = 1.15; // rad (66deg) — a full arm's pull
  const LEV_DOWN = 0.17; // s, the yank
  const LEV_HOLD = 0.09; // s, bottomed out
  const LEV_UP = 0.38; // s, the sprung return
  const LEV_TOTAL = LEV_DOWN + LEV_HOLD + LEV_UP;
  const leverAngle = (t: number): number => {
    if (t < LEV_DOWN) {
      const u = t / LEV_DOWN;
      return LEV_MAX * (1 - (1 - u) * (1 - u)); // quick off the top, easing in
    }
    if (t < LEV_DOWN + LEV_HOLD) return LEV_MAX;
    const u = Math.min(1, (t - LEV_DOWN - LEV_HOLD) / LEV_UP);
    // spring home, with a little overshoot past upright that decays out
    return LEV_MAX * Math.pow(1 - u, 3) - 0.09 * Math.sin(Math.PI * u) * (1 - u);
  };
  interface CabinetReels {
    cv: HTMLCanvasElement;
    c: CanvasRenderingContext2D;
    tex: THREE.CanvasTexture;
    /** Reel positions in CELL units (float while moving, integer at rest). */
    pos: number[];
    x: number; // cells — for distance-faded attract sound
    y: number;
    anim: { t: number; dur: number[]; from: number[]; to: number[]; done?: () => void } | null;
    /** The lever's pivot group, and its swing clock (-1 = at rest). */
    lever: THREE.Object3D | null;
    levT: number;
    /** The cabinet itself — the frame the win light and coins are spawned in. */
    grp: THREE.Group;
    /** A win being celebrated on this machine right now. */
    win: { t: number; dur: number; tier: SlotWinTier; label: string } | null;
    /** its section (name, stake, theme), the theme's reel strip and dress */
    sec: SlotSection;
    strip: HTMLCanvasElement;
    look: ThemeLook;
    /** the screen's shape, and the axis its lever swings about */
    L: ScreenLayout;
    leverAxis: "x" | "z";
  }
  const cabinets: CabinetReels[] = [];
  const drawScreen = (cab: CabinetReels): void => {
    const c = cab.c;
    const L = cab.L;
    const winX = (i: number): number => L.x0 + i * (L.win + L.gap);
    // A win takes the marquee over and flashes the payline — the cabinet
    // announces its own result, which is what tells a passer-by at the far
    // end of the bank that something just happened here.
    const w = cab.win;
    const blink = w ? Math.floor(w.t * 6) % 2 === 0 : false;
    const look = w ? WIN_LOOK[w.tier] : null;
    c.imageSmoothingEnabled = false; // PSX-crisp, like everything else in here
    const th = cab.look;
    // bezel
    c.fillStyle = th.bezel;
    c.fillRect(0, 0, L.W, L.H);
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (L.mq > 0) {
      // The raked band is taller than three reel windows need, so the spare
      // room above them is the cabinet's marquee rather than dead black.
      const mq = c.createLinearGradient(0, 0, 0, L.mq);
      mq.addColorStop(0, w && blink ? look!.mq : th.mqTop);
      mq.addColorStop(1, th.mqBottom);
      c.fillStyle = mq;
      c.fillRect(0, 0, L.W, L.mq);
      if (w) {
        c.fillStyle = blink ? look!.ink : "#7a5c28";
        c.font = `bold 30px ${th.font}`;
        c.fillText(w.label, L.W / 2, L.mq / 2);
      } else {
        // the section's name, and what a pull costs here
        c.fillStyle = th.ink;
        c.font = `bold 27px ${th.font}`;
        c.fillText(cab.sec.name, L.W / 2, 28);
        c.fillStyle = th.rule;
        c.font = "bold 14px system-ui, sans-serif";
        c.fillText(`${cab.sec.stake} SILVER A PULL`, L.W / 2, 58);
      }
      c.fillStyle = w && blink ? look!.ink : th.rule;
      c.fillRect(0, L.winY - 10, L.W, 2);
    } else if (L.strip) {
      // A STRIP: the stake to the left of the windows, the payout (or "A
      // PULL") to the right
      const left = L.x0 / 2;
      const right = L.W - L.x0 / 2;
      const mid = L.H / 2;
      c.fillStyle = w ? (blink ? look!.ink : "#7a5c28") : th.ink;
      c.font = `bold 44px ${th.font}`;
      c.fillText(w ? "WIN" : String(cab.sec.stake), left, mid - 10);
      c.fillText(w ? w.label.replace(/^WIN /, "") : "", right, mid - 10);
      c.fillStyle = th.rule;
      c.font = "bold 15px system-ui, sans-serif";
      c.fillText(w ? "" : "SILVER", left, mid + 26);
      if (!w) {
        c.font = `bold 22px ${th.font}`;
        c.fillStyle = th.ink;
        c.fillText("A PULL", right, mid);
      }
    }
    c.fillStyle = "#2b2118";
    c.fillRect(0, L.H - 6, L.W, 6); // a sill line so it reads as a fitting
    for (let i = 0; i < 3; i++) {
      const x = winX(i);
      c.save();
      c.beginPath();
      c.rect(x, L.winY, L.win, L.win);
      c.clip();
      // the window shows the strip scrolled to pos[i]: draw the two cells that
      // straddle it, wrapped
      const f = ((cab.pos[i] % REEL_CELLS) + REEL_CELLS) % REEL_CELLS;
      const k0 = Math.floor(f);
      const frac = f - k0;
      const yOff = L.winY - frac * L.win;
      for (const step of [0, 1]) {
        const k = (k0 + step) % REEL_CELLS;
        c.drawImage(cab.strip, 0, k * STRIP_CELL, STRIP_CELL, STRIP_CELL, x, yOff + step * L.win, L.win, L.win);
      }
      c.restore();
    }
    if (w && blink) {
      // the payline, lit: a frame around all three windows
      c.strokeStyle = look!.ink;
      c.lineWidth = 5;
      c.strokeRect(winX(0) - 5, L.winY - 5, winX(2) + L.win + 5 - (winX(0) - 5), L.win + 10);
    }
    cab.tex.needsUpdate = true;
  };
  const buildReels = (g: THREE.Group, at: [number, number]): void => {
    const sec = slotSectionAt(at[0], at[1]);
    const spec = sec.cabinet === "classic" ? null : CABINET_SPECS[sec.cabinet];
    const L = spec ? layoutFor(spec.screen.w, spec.screen.h) : CLASSIC_LAYOUT;
    const cv = document.createElement("canvas");
    cv.width = L.W;
    cv.height = L.H;
    const c = cv.getContext("2d")!;
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const cab: CabinetReels = {
      cv, c, tex,
      pos: [0, 0, 0].map(() => Math.floor(Math.random() * REEL_CELLS)),
      x: at[0], y: at[1], anim: null, lever: null, levT: -1, grp: g, win: null,
      sec, strip: themeStrip(sec.theme), look: THEME_LOOK[sec.theme],
      L, leverAxis: spec ? "x" : "z",
    };
    if (spec) {
      // A MEASURED CABINET: the lever was split onto its pivot when the model
      // was first built (takeCabinet), and the screen goes on in the model's
      // own frame, where slot-cabinets.ts measured it.
      const native = g.getObjectByName("CabinetNative");
      cab.lever = native?.getObjectByName("LeverPivot") ?? null;
      const sc = new THREE.Mesh(
        new THREE.PlaneGeometry(spec.screen.w, spec.screen.h),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      sc.name = "CabinetScreen";
      sc.position.set(spec.screen.x, spec.screen.y, spec.screen.z);
      sc.rotation.x = -spec.screen.tilt; // top leans away from the player
      (native ?? g).add(sc);
      drawScreen(cab);
      cabinets.push(cab);
      return;
    }
    // DEDUPE FIRST. The pack nests Button 1/2, Crystal and Lever UNDER the
    // Casino Machine node, and indexGlb files a mesh by its PARENT's name as
    // well as its own — so takeProp both deep-clones the cabinet (bringing the
    // children with it) and clones each child again. Every cabinet has been
    // drawing its lever and buttons twice, exactly coincident. Drop the extras
    // before anything gets a pivot, or half the lever would stay put.
    const seen = new Set<string>();
    const dupes: THREE.Object3D[] = [];
    g.traverse((o) => {
      if (!/^(Lever|Button_\d+)$/.test(o.name)) return;
      if (seen.has(o.name)) dupes.push(o);
      else seen.add(o.name);
    });
    for (const d of dupes) d.parent?.remove(d);
    // Re-parent the lever onto a pivot at the base of its post. attach() keeps
    // it exactly where it looks now, so no offset maths against takeProp's
    // recentring is needed.
    const lever = g.getObjectByName("Lever");
    if (lever) {
      const pivot = new THREE.Group();
      pivot.position.set(LEV_PIVOT[0], LEV_PIVOT[1], LEV_PIVOT[2]);
      g.add(pivot);
      pivot.attach(lever);
      cab.lever = pivot;
    }
    // ONE DRAW FOR THE CABINET'S BODY (the casino redesign's perf pass). The
    // body, its two buttons and the glass's frame all wear the same atlas, so
    // they merge into one mesh — and the transparent glass pane goes: the reel
    // screen below lies proud of it and covers it completely, so it only ever
    // cost a sorted draw. 7 draws a cabinet → 3 (body, lever, screen); the
    // Boulevard's 48 cabinets drop from 336 to 144.
    {
      g.updateMatrixWorld(true);
      const toLocal = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const parts: THREE.Mesh[] = [];
      let glass: THREE.Mesh | null = null;
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (/^(Casino_Machine|Button_\d+|Cube003)$/.test(m.name)) parts.push(m);
        else if (m.name === "Cube003_1") glass = m;
      });
      const body = parts.find((p) => p.name === "Casino_Machine");
      const geos = parts.map((p) => {
        const geo = p.geometry.clone();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, p.matrixWorld));
        return geo;
      });
      const merged = body && parts.length > 1 ? mergeGeometries(geos) : null;
      if (merged && body) {
        const one = new THREE.Mesh(merged, body.material);
        one.name = "CabinetBody";
        for (const p of parts) p.parent?.remove(p);
        (glass as THREE.Mesh | null)?.parent?.remove(glass!);
        g.add(one);
      } else {
        for (const geo of geos) geo.dispose();
      }
    }
    // Sized to (and lying ON) the cabinet's raked screen band — see the
    // measurements above.
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(REEL_W, REEL_HGT),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    m.position.set(REEL_CX + REEL_NX * REEL_LIFT, REEL_CY + REEL_NY * REEL_LIFT, REEL_CZ);
    // Order matters: YXZ applies the tilt about the plane's OWN width axis
    // BEFORE the yaw that turns it to face −x. The default XYZ order would
    // tilt about the parent's x instead and skew the panel off the band.
    m.rotation.set(-REEL_TILT, -Math.PI / 2, 0, "YXZ");
    g.add(m);
    drawScreen(cab);
    cabinets.push(cab);
  };
  // THE SECTIONS' MACHINES. Each kind (and tint) is built ONCE — its lever
  // split off onto a pivot, its finish tinted — and every machine of that kind
  // is a clone, sharing the geometry. The model sits in a "CabinetNative"
  // group in its own measured frame (front +z, bottom-centre, native metres),
  // turned to face −x like the classic and scaled into the hall.
  const cabTemplates = new Map<string, THREE.Group | null>();
  /** every placed measured cabinet, by template — batched after the loop */
  const cabPlaced = new Map<string, THREE.Group[]>();
  const takeCabinet = (kind: Exclude<SlotSection["cabinet"], "classic">, tint: string | undefined, glow: number): THREE.Group | null => {
    const key = `${kind}:${tint ?? ""}`;
    if (!cabTemplates.has(key)) cabTemplates.set(key, buildCabinet(CABINET_SPECS[kind], tint, glow));
    const g = cabTemplates.get(key)?.clone() ?? null;
    if (g) cabPlaced.set(key, [...(cabPlaced.get(key) ?? []), g]);
    return g;
  };
  const buildCabinet = (spec: CabinetSpec, tint: string | undefined, glow: number): THREE.Group | null => {
    const native = takeProp(assets, spec.file, "all");
    if (!native) return null;
    native.name = "CabinetNative";
    if (tint) {
      const t = new THREE.Color(tint);
      native.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const dye = (mat: THREE.Material): THREE.Material => {
          const c = (mat as THREE.MeshLambertMaterial).clone() as THREE.MeshLambertMaterial;
          c.color = c.color.clone().multiply(t);
          return c;
        };
        m.material = Array.isArray(m.material) ? m.material.map(dye) : dye(m.material as THREE.Material);
      });
    }
    // THE GLOW, ONCE PER KIND: every machine of a kind shares its materials,
    // which is what lets the hall batch them (below) — so a kind breathes as
    // one, where the classic's machines each keep their own phase.
    if (glow > 0) {
      glowPhase += 1.7;
      const k = new THREE.Color().setScalar(glow);
      native.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const lit = (mat: THREE.Material): THREE.Material => {
          const src = mat as THREE.MeshLambertMaterial;
          const c = src.clone() as THREE.MeshLambertMaterial;
          c.emissive = k.clone().multiply(src.color ?? new THREE.Color(1, 1, 1));
          c.emissiveMap = src.map ?? null;
          glowing.push({ mat: c, phase: glowPhase });
          return c;
        };
        m.material = Array.isArray(m.material) ? m.material.map(lit) : lit(m.material as THREE.Material);
      });
    }
    splitLever(native, spec);
    native.rotation.y = -Math.PI / 2; // native front +z → the hall's −x
    native.scale.setScalar(spec.scale);
    native.position.z = -spec.bodyX * spec.scale; // centre the BODY, not the box
    const g = new THREE.Group();
    g.add(native);
    return g;
  };
  /** Move the lever's pieces onto a pivot, in the native frame. */
  const splitLever = (native: THREE.Group, spec: CabinetSpec): void => {
    const [px, py, pz] = spec.lever.pivot;
    const [x0, x1, y0, y1, z0, z1] = spec.lever.box;
    const inBox = (v: THREE.Vector3): boolean => v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1 && v.z >= z0 && v.z <= z1;
    const pivot = new THREE.Group();
    pivot.name = "LeverPivot";
    pivot.position.set(px, py, pz);
    native.updateMatrixWorld(true);
    const toNative = new THREE.Matrix4().copy(native.matrixWorld).invert();
    const meshes: THREE.Mesh[] = [];
    native.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const v = new THREE.Vector3();
    for (const m of meshes) {
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const pos = src.attributes.position;
      const tris = pos.count / 3;
      const M = new THREE.Matrix4().multiplyMatrices(toNative, m.matrixWorld);
      const vert = (i: number): THREE.Vector3 =>
        v.set(pos.getComponent(i, 0), pos.getComponent(i, 1), pos.getComponent(i, 2)).applyMatrix4(M);
      const take = new Uint8Array(tris);
      if (spec.lever.mode === "tris") {
        const c = new THREE.Vector3();
        for (let t = 0; t < tris; t++) {
          c.set(0, 0, 0);
          for (let k = 0; k < 3; k++) c.add(vert(t * 3 + k));
          if (inBox(c.divideScalar(3))) take[t] = 1;
        }
      } else {
        // loose parts: weld vertices by position, flood triangles into parts
        const id = new Map<string, number>();
        const vid = new Int32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
          const k = `${pos.getComponent(i, 0).toFixed(4)},${pos.getComponent(i, 1).toFixed(4)},${pos.getComponent(i, 2).toFixed(4)}`;
          if (!id.has(k)) id.set(k, id.size);
          vid[i] = id.get(k)!;
        }
        const par = new Int32Array(id.size).map((_, i) => i);
        const find = (a: number): number => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
        for (let t = 0; t < tris; t++) {
          const a = find(vid[t * 3]);
          par[find(vid[t * 3 + 1])] = a;
          par[find(vid[t * 3 + 2])] = a;
        }
        const boxes = new Map<number, THREE.Box3>();
        for (let t = 0; t < tris; t++) {
          const r = find(vid[t * 3]);
          const b = boxes.get(r) ?? new THREE.Box3();
          for (let k = 0; k < 3; k++) b.expandByPoint(vert(t * 3 + k));
          boxes.set(r, b);
        }
        const moving = new Set<number>();
        for (const [r, b] of boxes) if (inBox(b.getCenter(new THREE.Vector3()))) moving.add(r);
        for (let t = 0; t < tris; t++) if (moving.has(find(vid[t * 3]))) take[t] = 1;
      }
      if (!take.some((x) => x === 1)) continue;
      const sub = (want: number): THREE.BufferGeometry => {
        const out = new THREE.BufferGeometry();
        const list: number[] = [];
        for (let t = 0; t < tris; t++) if (take[t] === want) list.push(t);
        for (const [name, attr] of Object.entries(src.attributes)) {
          const n = attr.itemSize;
          const arr = new Float32Array(list.length * 3 * n);
          list.forEach((t, i) => {
            for (let k = 0; k < 3; k++) for (let c = 0; c < n; c++) arr[(i * 3 + k) * n + c] = attr.getComponent(t * 3 + k, c);
          });
          out.setAttribute(name, new THREE.BufferAttribute(arr, n));
        }
        return out;
      };
      const moved = sub(1);
      m.geometry = sub(0);
      // the moving pieces, baked into the native frame and hung off the pivot
      moved.applyMatrix4(M);
      moved.translate(-px, -py, -pz);
      pivot.add(new THREE.Mesh(moved, m.material));
    }
    native.add(pivot);
  };

  for (const p of PLACEMENTS) {
    if (p.pick === "__collider__") continue; // collision-only rows
    const sec = p.pick === "casinomachine" ? slotSectionAt(p.at[0], p.at[1]) : null;
    const measured = sec && sec.cabinet !== "classic" ? sec.cabinet : null;
    const g = measured ? takeCabinet(measured, sec!.tint, p.glow ?? 0) : takeProp(assets, p.src, p.pick);
    if (!g) {
      console.warn("[casino] missing prop:", p.src, p.pick);
      continue;
    }
    if (p.scale && !measured) g.scale.setScalar(p.scale); // a measured cabinet carries its own
    if (p.basic) {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshLambertMaterial;
        m.material = new THREE.MeshBasicMaterial({ map: src.map ?? null, color: src.color });
      });
    }
    if (p.tint) {
      // Clone before touching: the pack's materials are SHARED across every prop
      // in the file, so an in-place tint would repaint the whole hall.
      const t = new THREE.Color(p.tint);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const dye = (mat: THREE.Material): THREE.Material => {
          const c = (mat as THREE.MeshLambertMaterial).clone() as THREE.MeshLambertMaterial;
          c.color = t;
          return c;
        };
        m.material = Array.isArray(m.material) ? m.material.map(dye) : dye(m.material as THREE.Material);
      });
    }
    if (p.glow && !measured) { // a measured cabinet's glow came with its template
      glowPhase += 1.7; // irrational-ish stride: neighbouring cabinets never sync
      // Re-use the prop's own atlas as an emissive map so it lights up in its
      // own colours (marquee reds, reel whites) instead of going flat-bright.
      // The shared atlas materials are reused across every prop in the pack, so
      // this MUST clone — mutating in place would set the whole hall alight.
      const k = new THREE.Color().setScalar(p.glow);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const lit = (mat: THREE.Material): THREE.Material => {
          const src = mat as THREE.MeshLambertMaterial;
          const c = src.clone() as THREE.MeshLambertMaterial;
          // in the material's own colour: a tinted finish (High Limit's gold)
          // glows gold, and an untinted one (white) glows exactly as before
          c.emissive = k.clone().multiply(src.color ?? new THREE.Color(1, 1, 1));
          c.emissiveMap = src.map ?? null;
          glowing.push({ mat: c, phase: glowPhase });
          return c;
        };
        m.material = Array.isArray(m.material) ? m.material.map(lit) : lit(m.material as THREE.Material);
      });
    }
    const floorY = world.groundAt(p.at[0], p.at[1]);
    g.position.set(p.at[0] * CELL, floorY + (p.h ?? 0), p.at[1] * CELL);
    g.rotation.y = ((p.yawDeg ?? 0) * Math.PI) / 180;
    scene.add(g);
    if (p.pick === "fortuneroulette") wheelPivot = pivotWheelDisc(g);
    if (p.pick === "roulettetable") {
      rouWheel = buildRouletteWheel(scene, g, () =>
        Math.hypot(listenX - p.at[0], listenY - p.at[1]));
      if (rouWheel) tickers.push(rouWheel.tick);
      else console.warn("[casino] the roulette table has no wheel to spin");
    }
    if (p.src === "chess") chessSet = g;
    if (p.pick === "casinomachine") buildReels(g, p.at);
  }

  // ---- THE MEASURED CABINETS, BATCHED ---------------------------------------------
  // A Vegas Star is nine separately textured meshes and a Jackpot six; drawn
  // one by one, the 46 measured machines cost ~240 draw calls whenever the
  // slots district was in view. Their bodies never move, and every machine of
  // a kind shares its materials, so each (kind, material) becomes ONE mesh for
  // the whole hall. The lever (it swings) and the screen (its own canvas) stay
  // on each machine.
  for (const placed of cabPlaced.values()) {
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const g of placed) {
      g.updateMatrixWorld(true);
      const statics: THREE.Mesh[] = [];
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name === "CabinetScreen") return;
        for (let a: THREE.Object3D | null = m.parent; a && a !== g; a = a.parent) if (a.name === "LeverPivot") return;
        statics.push(m);
      });
      for (const m of statics) {
        const mat = m.material as THREE.Material;
        const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
        buckets.set(mat, [...(buckets.get(mat) ?? []), geo]);
        m.parent?.remove(m);
      }
    }
    for (const [mat, geos] of buckets) {
      const merged = mergeGeometries(geos);
      for (const geo of geos) geo.dispose();
      if (merged) scene.add(new THREE.Mesh(merged, mat));
      else console.warn("[casino] a cabinet batch would not merge", mat.name);
    }
  }

  // ---- ATTRACT MODE: every so often one machine runs its reels ----------------
  // Idle Vegas cabinets demo themselves; that motion is what makes a bank read
  // as machines rather than furniture. One at a time, staggered stops, and the
  // reel sounds only reach ears that are actually near it. The `listen` point
  // comes in through tick().
  let attractIn = 4 + Math.random() * 6;
  tickers.push((dt) => {
    attractIn -= dt;
    if (attractIn <= 0 && cabinets.length) {
      attractIn = 7 + Math.random() * 7;
      const cab = cabinets[Math.floor(Math.random() * cabinets.length)];
      if (!cab.anim) {
        // 3-6 whole cells of travel per column, longer per column → staggered
        // stops, always landing on a whole symbol.
        const from = [...cab.pos];
        cab.anim = {
          t: 0,
          dur: [1.15, 1.5, 1.9],
          from,
          to: from.map((f, i) => Math.round(f) + 3 + i + Math.floor(Math.random() * 5)),
        };
        const d = Math.hypot(cab.x - listenX, cab.y - listenY);
        if (d < 9) {
          const gain = 0.34 * (1 - d / 9);
          playSfxLoop("slots-reelspin", 1900, gain);
          for (const [i, dur] of cab.anim.dur.entries())
            playSfxAt("slots-reelstop", dur * 1000, gain * (0.8 + i * 0.1));
        }
      }
    }
    for (const cab of cabinets) {
      if (!cab.anim) continue;
      cab.anim.t += dt;
      let done = true;
      for (let i = 0; i < 3; i++) {
        const u = Math.min(1, cab.anim.t / cab.anim.dur[i]);
        if (u < 1) done = false;
        const e = 1 - Math.pow(1 - u, 3); // ease-out — the reel brakes into its stop
        cab.pos[i] = cab.anim.from[i] + (cab.anim.to[i] - cab.anim.from[i]) * e;
      }
      drawScreen(cab);
      if (done) {
        const cb = cab.anim.done;
        cab.anim = null;
        cb?.();
      }
    }
    // the levers, swinging on their own clocks
    for (const cab of cabinets) {
      if (cab.levT < 0 || !cab.lever) continue;
      cab.levT += dt;
      if (cab.levT >= LEV_TOTAL) {
        cab.levT = -1;
        cab.lever.rotation[cab.leverAxis] = 0;
      } else {
        cab.lever.rotation[cab.leverAxis] = leverAngle(cab.levT);
      }
    }
  });

  // ---- THE WIN SHOW ----------------------------------------------------------
  // A pooled light on the cabinet and a pour of coins out of its front, scaled
  // to the tier. Deliberately LOCAL: the hall reads as islands of lit felt, so
  // a win lights its own machine (and, for a jackpot, its neighbours) rather
  // than washing the room.
  const coinTex = ((): THREE.CanvasTexture => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(16, 13, 2, 16, 16, 15);
    g.addColorStop(0, "#fff4c8");
    g.addColorStop(0.55, "#e8b23c");
    g.addColorStop(1, "#8a6115");
    c.fillStyle = g;
    c.beginPath();
    c.arc(16, 16, 15, 0, Math.PI * 2);
    c.fill();
    return new THREE.CanvasTexture(cv);
  })();
  interface WinFx {
    t: number;
    dur: number;
    light: THREE.PointLight | null;
    peak: number;
    /** the jackpot alternates gold/white on the flash instead of sitting still */
    hop: boolean;
    pts: THREE.Points | null;
    vel: Float32Array | null;
    n: number;
  }
  const winFx: WinFx[] = [];
  // LIGHTS ARE POOLED, NEVER ADDED AT WIN TIME (Josh, Aug 2026: "sometimes
  // the game freezes for people when they get the jackpot"). Adding a light
  // to a three.js scene changes the light count, and the light count is baked
  // into every material's shader — so the old `new PointLight` here forced a
  // RECOMPILE OF THE WHOLE HALL the frame the win landed, a multi-hundred-ms
  // stall on the very machines that most deserve the celebration. Two win
  // lights live in the scene from build (intensity 0 costs a few ALU ops per
  // fragment and nothing else); a win claims a free one, or steals the oldest
  // if both are lit — a third simultaneous big win going lightless beats any
  // win freezing the room.
  const winLightPool: { l: THREE.PointLight; fx: WinFx | null }[] = [];
  for (let i = 0; i < 2; i++) {
    const l = new THREE.PointLight(0xffd76a, 0, 4.6, 1.5);
    scene.add(l);
    winLightPool.push({ l, fx: null });
  }
  const claimWinLight = (fx: WinFx): THREE.PointLight => {
    const slot = winLightPool.find((s) => !s.fx) ?? winLightPool[0];
    if (slot.fx) slot.fx.light = null; // stolen — the older win finishes dark
    slot.fx = fx;
    return slot.l;
  };
  const releaseWinLight = (fx: WinFx): void => {
    const slot = winLightPool.find((s) => s.fx === fx);
    if (!slot) return;
    slot.fx = null;
    slot.l.intensity = 0;
  };
  // The coin material is SHARED and never disposed — a disposed material's
  // program is destroyed with it, so the per-win material recompiled the
  // points shader on every big win. (Two overlapping pours share one opacity
  // fade; acceptable, both are ending anyway.)
  const coinMat = new THREE.PointsMaterial({
    size: 0.06, map: coinTex, transparent: true, depthWrite: false,
  });
  const GOLD = new THREE.Color(0xffd76a);
  const WHITE = new THREE.Color(0xfff6e0);
  const slotWin = (index: number, tier: SlotWinTier, payout?: number): void => {
    const cab = cabinets[index];
    if (!cab) return;
    const look = WIN_LOOK[tier];
    cab.win = {
      t: 0, dur: look.dur, tier,
      label: payout != null ? `WIN ${payout}` : "WINNER",
    };
    drawScreen(cab);
    // A TRIPLE CROWN TAKES THE WHOLE ROOM (Josh) — the same hall-wide strobes,
    // confetti pour and party track a legendary win on the Wheel throws. It is
    // idempotent while running, so a second jackpot mid-party just rides it.
    if (tier === "jackpot") legendaryParty();
    cab.grp.updateMatrixWorld(true);
    const fx: WinFx = { t: 0, dur: look.dur, light: null, peak: look.peak, hop: tier === "jackpot", pts: null, vel: null, n: 0 };
    if (look.peak > 0) {
      const l = claimWinLight(fx);
      l.color.setHex(look.col);
      l.distance = look.range;
      // out in front of the glass, at screen height — the machine lighting the
      // player, the way a real cabinet does
      l.position.copy(cab.grp.localToWorld(new THREE.Vector3(-0.55, 1.45, 0)));
      fx.light = l;
    }
    if (look.coins > 0) {
      const n = look.coins;
      const pos = new Float32Array(n * 3);
      const vel = new Float32Array(n * 3);
      // The tray lip, and the cabinet's own forward/side axes. Coins go OUT
      // and down onto the carpet — an early cut threw them straight up and
      // they hung in front of the reels, hiding the very symbols that won.
      const from = cab.grp.localToWorld(new THREE.Vector3(-0.48, 0.95, 0));
      const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(cab.grp.quaternion).normalize();
      const side = new THREE.Vector3(0, 0, 1).applyQuaternion(cab.grp.quaternion).normalize();
      for (let i = 0; i < n; i++) {
        pos[i * 3] = from.x;
        pos[i * 3 + 1] = from.y;
        pos[i * 3 + 2] = from.z;
        const out = 1.2 + Math.random() * 1.1;
        const across = (Math.random() - 0.5) * 1.3;
        const up = 0.8 + Math.random() * 1.1;
        vel[i * 3] = fwd.x * out + side.x * across;
        vel[i * 3 + 1] = up;
        vel[i * 3 + 2] = fwd.z * out + side.z * across;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      coinMat.opacity = 1;
      const pts = new THREE.Points(geo, coinMat);
      scene.add(pts);
      fx.pts = pts;
      fx.vel = vel;
      fx.n = n;
    }
    winFx.push(fx);
  };
  tickers.push((dt) => {
    for (const cab of cabinets) {
      if (!cab.win) continue;
      cab.win.t += dt;
      if (cab.win.t >= cab.win.dur) cab.win = null;
      drawScreen(cab); // the blink is drawn from win.t, so redraw every frame
    }
    for (let i = winFx.length - 1; i >= 0; i--) {
      const fx = winFx[i];
      fx.t += dt;
      const u = fx.t / fx.dur;
      if (fx.light) {
        // a hard flash on each beat, the whole train fading out
        const env = Math.max(0, 1 - u);
        const ph = (fx.t * 5.5) % 1;
        fx.light.intensity = fx.peak * env * Math.max(0.12, 1 - ph * 1.9);
        if (fx.hop) fx.light.color.copy(Math.floor(fx.t * 5.5) % 2 ? WHITE : GOLD);
      }
      if (fx.pts && fx.vel) {
        const p = fx.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let k = 0; k < fx.n; k++) {
          const j = k * 3;
          fx.vel[j + 1] -= 9.2 * dt;
          let y = p.getY(k) + fx.vel[j + 1] * dt;
          if (y <= 0.03) {
            // one lazy bounce off the carpet, then they lie still
            y = 0.03;
            fx.vel[j + 1] = Math.abs(fx.vel[j + 1]) < 0.7 ? 0 : -fx.vel[j + 1] * 0.34;
            fx.vel[j] *= 0.55;
            fx.vel[j + 2] *= 0.55;
          }
          p.setX(k, p.getX(k) + fx.vel[j] * dt);
          p.setY(k, y);
          p.setZ(k, p.getZ(k) + fx.vel[j + 2] * dt);
        }
        p.needsUpdate = true;
        const m = fx.pts.material as THREE.PointsMaterial;
        m.opacity = u > 0.72 ? Math.max(0, 1 - (u - 0.72) / 0.28) : 1;
      }
      if (fx.t >= fx.dur) {
        releaseWinLight(fx); // pooled — back to intensity 0, never removed
        if (fx.pts) {
          scene.remove(fx.pts);
          fx.pts.geometry.dispose();
          // the material is the shared coinMat — disposing it would destroy
          // its compiled program and the next win would stall recompiling it
        }
        winFx.splice(i, 1);
      }
    }
  });

  // Slot marquees BREATHE. Cabinets in a bank all glowing at a dead-flat level
  // read as printed panels; a shallow, desynchronised pulse reads as backlight.
  // Kept small (±7%) — this is peripheral light, not a light show.
  let glowT = 0;
  tickers.push((dt) => {
    glowT += dt;
    for (const gl of glowing) {
      gl.mat.emissiveIntensity = 1 + Math.sin(glowT * 2.1 + gl.phase) * 0.07;
    }
  });

  // ---- the stage Wheel -------------------------------------------------------
  if (!wheelPivot) console.warn("[casino] wheel disc not found — spin disabled");
  let spinning = false;
  const spinWheel = (slotIndex: number): Promise<void> => {
    if (!wheelPivot || spinning) return Promise.resolve();
    spinning = true;
    const pivot = wheelPivot;
    const from = pivot.rotation.x;
    // ABSOLUTE landing (sweepFrom): at least five full turns from wherever
    // the disc rests NOW, ending exactly on `slotIndex` under the pointer.
    // The old fixed sweep accumulated across spins — only the first spin of
    // a session landed on its prize.
    const sweep = sweepFrom(from, slotIndex);
    const target = from - sweep;
    const dur = SPIN_DUR;
    // The flapper, scheduled off that same curve rather than a guessed tempo.
    for (const c of clackSchedule(sweep)) playSfxAt("wheel-clack", c.t * 1000, c.gain);
    playSfxAt("wheel-thud", dur * 1000, 0.5); // it settles into its slot
    let t = 0;
    return new Promise<void>((resolve) => {
      const step = (dt: number): void => {
        t = Math.min(1, t + dt / dur);
        const e = spinEase(t);
        pivot.rotation.x = from + (target - from) * e;
        if (t >= 1) {
          spinning = false;
          tickers.splice(tickers.indexOf(step), 1);
          resolve();
        }
      };
      tickers.push(step);
    });
  };

  // (A separate "Casino Roulette" disc was tried in the table's bowl here and
  // REVERTED: the table mesh already ships its bowl dressed, and the loose
  // disc rendered as a duplicate wheel lying on the carpet. If the bowl ever
  // spins it must come from re-pivoting the table's OWN geometry, the
  // pivotWheelDisc way.)

  // ---- THE STAGE RESULT SCREEN (Josh: "a standing screen next to the wheel
  // that shows the emoji won"). A framed display on the platform's east side;
  // showWheelResult repaints it for every mirrored spin — commons included,
  // which the public feed never carries.
  const resCv = document.createElement("canvas");
  resCv.width = 512;
  resCv.height = 384;
  const resC = resCv.getContext("2d")!;
  const resTex = new THREE.CanvasTexture(resCv);
  resTex.colorSpace = THREE.SRGBColorSpace;
  const TIER_COLOR: Record<string, string> = {
    common: "#7cae5f", rare: "#9d63d2", legendary: "#f39620", mythic: "#ff5db1", talisman: "#42c1c4",
  };
  const drawResult = (info: { name?: string; outcome?: string; tier?: string; emojiName?: string }, img?: HTMLImageElement): void => {
    const g = resC;
    g.fillStyle = "#0c0f14";
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = "#2a3040";
    g.lineWidth = 2;
    for (let y = 0; y < 384; y += 8) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    }
    g.textAlign = "center";
    g.fillStyle = "#e8c33c";
    g.font = "900 30px system-ui, sans-serif";
    g.fillText("THE WHEEL", 256, 46);
    if (!info.outcome) {
      g.fillStyle = "#7a8494";
      g.font = "700 24px system-ui, sans-serif";
      g.fillText("step up and spin", 256, 210);
    } else {
      g.fillStyle = "#e6dfd0";
      g.font = "800 26px system-ui, sans-serif";
      g.fillText(info.name ?? "someone", 256, 92);
      if (img) g.drawImage(img, 256 - 80, 116, 160, 160);
      const line =
        info.outcome === "emoji" ? `won ${info.emojiName ?? "an emoji"}`
        : info.outcome === "blank" ? "— nothing —"
        : info.outcome === "talisman" ? "took THE TALISMAN"
        : info.outcome === "mystery_spins" ? "opened the mystery box"
        : info.outcome === "death_survived" ? "CHEATED DEATH"
        : info.outcome === "death" ? "PAID THE REAPER"
        : info.outcome;
      g.fillStyle = info.outcome === "death" ? "#d15748" : "#e6dfd0";
      g.font = "700 26px system-ui, sans-serif";
      g.fillText(line, 256, 316);
      if (info.tier) {
        g.fillStyle = TIER_COLOR[info.tier] ?? "#7a8494";
        g.font = "900 22px system-ui, sans-serif";
        g.fillText(info.tier.toUpperCase(), 256, 352);
      }
    }
    resTex.needsUpdate = true;
  };
  drawResult({});
  {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.34, 0.08), woodMat);
    frame.position.set((STAGE.x0 + 3.55) * CELL, 2.05, (STAGE.y0 + 0.45) * CELL);
    const screenM = new THREE.Mesh(
      new THREE.PlaneGeometry(1.56, 1.2),
      new THREE.MeshBasicMaterial({ map: resTex }),
    );
    screenM.position.set((STAGE.x0 + 3.55) * CELL, 2.05, (STAGE.y0 + 0.45) * CELL + 0.05);
    // The stand STOPS at the frame's underside (bottom edge y 1.38) — the
    // first cut ran it 1.0→2.38, straight through the panel's face (Josh:
    // "the screen stand is poking through the screen").
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.42, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a6a2c }),
    );
    pole.position.set((STAGE.x0 + 3.55) * CELL, 1.0 + 0.21, (STAGE.y0 + 0.45) * CELL); // stage floor is 1m
    scene.add(frame, screenM, pole);
  }
  // ---- THE SPIN CLOCK (Josh: "a standing screen like the one on the right, to
  // the LEFT of the wheel, with an active timer for when the wheel resets").
  // Same frame, same pole, mirrored across the stage; it counts down to the
  // next 2-hour UTC bucket and shows what you're holding. Redrawn once a
  // second off the hall's own ticker — the deadline comes in from the client's
  // wheel store via showSpinReset.
  const clkCv = document.createElement("canvas");
  clkCv.width = 512;
  clkCv.height = 384;
  const clkC = clkCv.getContext("2d")!;
  const clkTex = new THREE.CanvasTexture(clkCv);
  clkTex.colorSpace = THREE.SRGBColorSpace;
  let clkResetAt = 0;
  let clkSpins = 0;
  let clkAcc = 99;
  const drawClock = (): void => {
    const g = clkC;
    g.fillStyle = "#0c0f14";
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = "#2a3040";
    g.lineWidth = 2;
    for (let y = 0; y < 384; y += 8) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    }
    g.textAlign = "center";
    g.fillStyle = "#e8c33c";
    g.font = "900 30px system-ui, sans-serif";
    g.fillText("NEXT SPINS IN", 256, 46);
    const left = Math.max(0, clkResetAt - Date.now());
    const hh = Math.floor(left / 3_600_000);
    const mm = Math.floor((left % 3_600_000) / 60_000);
    const ss = Math.floor((left % 60_000) / 1000);
    const pad = (v: number): string => String(v).padStart(2, "0");
    g.fillStyle = clkResetAt ? "#f3ead6" : "#3f4652";
    g.font = "900 92px ui-monospace, 'Courier New', monospace";
    g.fillText(clkResetAt ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : "--:--:--", 256, 172);
    g.fillStyle = "#7a8494";
    g.font = "700 21px system-ui, sans-serif";
    g.fillText("the wheel refills every 2 hours", 256, 226);
    // what you're holding right now
    g.fillStyle = clkSpins > 0 ? "#7cae5f" : "#d15748";
    g.font = "900 46px system-ui, sans-serif";
    g.fillText(String(clkSpins), 256, 302);
    g.fillStyle = "#e6dfd0";
    g.font = "700 24px system-ui, sans-serif";
    g.fillText(clkSpins === 1 ? "spin in hand" : "spins in hand", 256, 340);
    clkTex.needsUpdate = true;
  };
  drawClock();
  {
    // mirrored across the stage's centre from the result screen
    const CLK_X = (STAGE.x0 + 0.45) * CELL;
    const CLK_Z = (STAGE.y0 + 0.45) * CELL;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.34, 0.08), woodMat);
    frame.position.set(CLK_X, 2.05, CLK_Z);
    const screenM = new THREE.Mesh(
      new THREE.PlaneGeometry(1.56, 1.2),
      new THREE.MeshBasicMaterial({ map: clkTex }),
    );
    screenM.position.set(CLK_X, 2.05, CLK_Z + 0.05);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.42, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a6a2c }),
    );
    pole.position.set(CLK_X, 1.0 + 0.21, CLK_Z);
    scene.add(frame, screenM, pole);
  }
  tickers.push((dt) => {
    clkAcc += dt;
    if (clkAcc < 1) return; // a clock only needs a second's resolution
    clkAcc = 0;
    drawClock();
  });

  const showWheelResult: Hall["showWheelResult"] = (info) => {
    if (info.emojiFile) {
      const img = new Image();
      img.onload = (): void => drawResult(info, img);
      img.onerror = (): void => drawResult(info);
      img.src = `/emoji/${info.emojiFile}`;
    } else drawResult(info);
  };

  // ---- THE LEGENDARY PARTY ---------------------------------------------------
  // Josh's track (115bpm measured), strobing party colours from six points,
  // confetti pouring off the ceiling. The music plays its opening ~14s with a
  // fade; the confetti rains for ~5s and falls out; the strobe rides the beat.
  let partyOn = false;
  // THE PARTY RIG IS BUILT ONCE, AT BUILD TIME — the same no-recompile rule
  // as the win-light pool above. Six strobes stand in the scene from frame
  // one at intensity 0 (the light count never moves, so a jackpot never
  // recompiles the hall), and the confetti keeps its geometry + material
  // between parties (visible=false) instead of being rebuilt and disposed.
  const PARTY_N = 700;
  const partyStrobes: THREE.PointLight[] = [];
  {
    for (const [sx, sy] of SHELL.strobes) {
      const l = new THREE.PointLight(0xff44aa, 0, 16, 1.6);
      l.position.set(sx * CELL, 4.2, sy * CELL);
      scene.add(l);
      partyStrobes.push(l);
    }
  }
  const partyConfetti = ((): { pts: THREE.Points; geo: THREE.BufferGeometry; vel: Float32Array } => {
    const posArr = new Float32Array(PARTY_N * 3);
    const colArr = new Float32Array(PARTY_N * 3);
    const vel = new Float32Array(PARTY_N * 2); // fall speed + sway phase
    const PARTY_COLS = [0xff5db1, 0x42c1c4, 0xf39620, 0x7cae5f, 0xe8c33c, 0x9d63d2];
    const col = new THREE.Color();
    for (let i = 0; i < PARTY_N; i++) {
      col.setHex(PARTY_COLS[i % PARTY_COLS.length]);
      colArr[i * 3] = col.r; colArr[i * 3 + 1] = col.g; colArr[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    // 0.05 — at 0.075 a flake drifting past the lens rendered as a 40cm slab
    const mat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    scene.add(pts);
    return { pts, geo, vel };
  })();
  const legendaryParty = (): void => {
    if (partyOn) return;
    partyOn = true;
    const DUR = 14;
    // the track, faded in and out via its own gain node
    const ctx = sfxContext();
    const buf = sfxBuffer("wheel-legendary-party");
    if (ctx && buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.6, t0 + 0.4);
      g.gain.setValueAtTime(0.6, t0 + DUR - 2.5);
      g.gain.linearRampToValueAtTime(0, t0 + DUR);
      src.connect(g);
      g.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + DUR + 0.1);
    }
    // strobes + confetti — the prebuilt party rig, woken up
    const strobes = partyStrobes;
    const N = PARTY_N;
    const { geo, vel } = partyConfetti;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      posAttr.setXYZ(
        i,
        Math.random() * W * CELL,
        4.9 + Math.random() * 3.2, // staggered spawn above the ceiling line
        Math.random() * H * CELL,
      );
      vel[i * 2] = 1.1 + Math.random() * 0.9;
      vel[i * 2 + 1] = Math.random() * Math.PI * 2;
    }
    posAttr.needsUpdate = true;
    partyConfetti.pts.visible = true;
    const col = new THREE.Color();
    let t = 0;
    const BEAT = 0.52; // 115bpm, measured off the track
    const step = (dt: number): void => {
      t += dt;
      const beat = Math.floor(t / BEAT);
      for (const [i, l] of strobes.entries()) {
        col.setHSL(((beat * 0.37 + i / strobes.length) % 1), 0.95, 0.55);
        l.color.copy(col);
        // a hard pop on the beat that decays into the next one
        const ph = (t % BEAT) / BEAT;
        l.intensity = t < DUR ? 34 * Math.max(0, 1 - ph * 2.2) : 0;
      }
      const p = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let y = p.getY(i);
        if (y > 0.02) {
          y -= vel[i * 2] * dt;
          p.setY(i, Math.max(0.02, y));
          p.setX(i, p.getX(i) + Math.sin(t * 2.2 + vel[i * 2 + 1]) * dt * 0.35);
        }
      }
      p.needsUpdate = true;
      if (t >= DUR) {
        tickers.splice(tickers.indexOf(step), 1);
        // back to sleep, never torn down — intensity 0 keeps the light count
        // (and so every compiled shader) exactly as it was
        for (const l of strobes) l.intensity = 0;
        partyConfetti.pts.visible = false;
        partyOn = false;
      }
    };
    tickers.push(step);
  };

  let sterlingLineFor: (() => string | null) | null = null;
  const sterlingBody = buildSterling(scene, () => [listenX, listenY], () => sterlingLineFor?.() ?? null);
  const tickSterling = sterlingBody.tick;
  tickers.push(tickSterling);

  // ---- THE ROULETTE WHEEL (Josh, Aug 2026: "would it be possible to get the
  // models wheel spinning and put a ball in there to roll and stop"). The
  // first cut floated a PROCEDURAL disc over the felt; it sat 46cm off the
  // model's own bowl and read as exactly what it was — a 2D wheel pasted onto
  // the table. The pack's table ships a real one (node "Casino Roulette 2"),
  // so the wheel that turns now is THAT one: see buildRouletteWheel.
  const spinRoulette = (pocket: number, durMs: number): void => {
    rouWheel?.spin(pocket, durMs);
  };

  return {
    tick: (dt: number, px?: number, py?: number): void => {
      if (px !== undefined && py !== undefined) {
        listenX = px;
        listenY = py;
      }
      // Index walk instead of a per-frame array clone (Aug 2026 perf review —
      // steady GC drip). A finishing spin splices ITSELF out mid-call, which
      // shifts the next ticker into this slot — re-run the slot when the
      // occupant changed under us.
      for (let i = 0; i < tickers.length; i++) {
        const f = tickers[i];
        f(dt);
        if (tickers[i] !== f) i--;
      }
    },
    get chessSet() {
      return chessSet;
    },
    pinAwarded: (i: number, url: string): void => wheelFacePin?.(i, url),
    takeBottle: (pick: string): THREE.Group | null => {
      // The bar's glassware is split across two files: whisky and champagne
      // ship in the props pack, the beer and wine bottles in bottle.glb. Try
      // both rather than making every caller remember which is where.
      const g = takeProp(assets, "props", pick) ?? takeProp(assets, "bottle", pick);
      if (!g) return null;
      // held items are lit by the room, not by themselves
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshLambertMaterial;
        m.material = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.color });
      });
      return g;
    },
    setWheelFace: (files: (string | null)[]): void => wheelFaceSet?.(files),
    setSterlingLines: (fn: () => string | null): void => {
      sterlingLineFor = fn;
    },
    sterlingMove: (g: SterlingGlide): void => sterlingBody.move(g),
    sterlingX: (): number => sterlingBody.x(),
    showSpinReset: (nextResetMs: number, spins: number): void => {
      clkResetAt = nextResetMs;
      clkSpins = spins;
      drawClock();
    },
    spinRoulette,
    rouletteAt: () => rouWheel?.at() ?? null,
    jumboAt: JUMBO_AT,
    nearestCabinet: (x: number, y: number) => {
      let best = -1;
      let bd = Infinity;
      cabinets.forEach((c, i) => {
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best < 0 ? null : { index: best, d: bd, x: cabinets[best].x, y: cabinets[best].y };
    },
    slotWin,
    pullLever: (index: number): void => {
      const cab = cabinets[index];
      // re-pulling mid-swing restarts it; a machine can't be double-yanked
      if (cab?.lever) cab.levT = 0;
    },
    pullReels: (index: number, symbols: string[]) =>
      new Promise<void>((resolve) => {
        const cab = cabinets[index];
        // A REAL pull overrides a decorative attract spin mid-flight (same
        // cabinet, same instant — rare, but the reels must land the truth).
        // Only another real pull (it has a `done` waiter) blocks.
        if (!cab || cab.anim?.done) return resolve();
        const from = [...cab.pos];
        cab.anim = {
          t: 0,
          dur: [1.4, 1.85, 2.3],
          from,
          // Land EXACTLY on symbol k after 2-3 full revolutions — pos is a
          // plain cell index now, so the target is just "the next k ahead".
          to: symbols.map((id, i) => {
            const k = Math.max(0, REEL_STRIP.indexOf(id as typeof REEL_STRIP[number]));
            const cur = Math.round(from[i]);
            const ahead = ((k - cur) % REEL_CELLS + REEL_CELLS) % REEL_CELLS;
            return cur + ahead + REEL_CELLS * (2 + i);
          }),
          done: resolve,
        };
      }),
    spinWheel,
    showWheelResult,
    legendaryParty,
    get wheelReady(): boolean {
      return wheelPivot !== null;
    },
  };
}

// ---- THE ROULETTE WHEEL ------------------------------------------------------
// The pack's roulette table ships a real wheel as a child of the table mesh
// ("Casino Roulette 2"). Everything below turns that model rather than drawing
// a new one over it.
//
// MEASURED, not guessed (the standing rule for every model here). Ray-cast
// profile of the wheel head, world metres, radius from its own centre:
//   r 0.00-0.04  y 0.954   the turret
//   r 0.06-0.19  y 0.780 -> 0.760   the head, dishing inward
//   r 0.19-0.31  y 0.760 -> 0.806   the pocket apron, rising to the rim
//   r 0.32-0.38  y 0.833   the static bowl rim (octagonal outside)
// So: the head is everything inside 0.85R, the ball rides the apron's outer
// edge and settles at its low shoulder, and the numbers print on the apron —
// all of it derived from the model at build time, so a scale change in
// layout.ts carries through untouched.

interface RouletteWheel {
  /** Throw the ball for a settled result. `durMs` is the client's reveal
   *  clock — the ball must be IN the pocket when it runs out (the no-spoiler
   *  rule: the wire carried the pocket the moment the server rolled it). */
  spin(pocket: number, durMs: number): void;
  tick(dt: number): void;
  /** Where the wheel's centre is in the world, now (the show's game camera). */
  at(): THREE.Vector3;
}

/** The numbered apron: 37 pockets in wheel order, drawn as a strip that wraps
 *  the ring (canvas x = angle, canvas y = radius). Painted rather than modelled
 *  — the pack's own pockets are decorative colour with no numbers, and a
 *  landing nobody can read is just an animation. */
function pocketRingTexture(): THREE.CanvasTexture {
  const W = POCKETS * 72;
  const H = 160;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  for (let k = 0; k < POCKETS; k++) {
    const num = EU_ORDER[k];
    const x0 = (k / POCKETS) * W;
    const w = W / POCKETS;
    c.fillStyle = num === 0 ? "#1f7a43" : EU_RED.has(num) ? "#9c2b2b" : "#191c22";
    c.fillRect(x0, 0, w + 1, H);
    // brass frets between pockets
    c.fillStyle = "#c9a24a";
    c.fillRect(x0 - 1.5, 0, 3, H);
    c.save();
    c.translate(x0 + w / 2, H * 0.52);
    c.fillStyle = "#f3ead6";
    c.font = "700 52px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(String(num), 0, 0);
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Split the model's wheel into a static bowl and a spinning head, face the
 *  head's apron with the 37 pockets, and give it a ball. Returns null if the
 *  pack ever ships the table without its wheel — the table then just sits
 *  there, which is a better failure than a crash on the casino floor. */
function buildRouletteWheel(
  scene: THREE.Scene,
  table: THREE.Group,
  /** Distance from the listener to the table, in cells — the ball is only
   *  audible to people actually standing at it. */
  near: () => number,
): RouletteWheel | null {
  table.updateMatrixWorld(true);
  let src: THREE.Mesh | null = null;
  table.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && norm(m.name).startsWith("casinoroulette")) src = m;
  });
  const wheelMesh = src as THREE.Mesh | null;
  if (!wheelMesh?.geometry?.index) return null;

  const box = new THREE.Box3().setFromObject(wheelMesh);
  const centre = box.getCenter(new THREE.Vector3());
  // the centre in the mesh's own frame, so it can be asked for in the world
  // at any time (the table's matrix may not be current yet while it builds)
  wheelMesh.geometry.computeBoundingBox();
  const localCentre = wheelMesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
  const R = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;

  // ---- split: everything inside 0.85R turns, the rim stays put -------------
  const geo = wheelMesh.geometry;
  const index = geo.index!;
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const SPLIT = R * 0.85;
  const headIdx: number[] = [];
  const bowlIdx: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c2 = index.getX(t + 2);
    let cx = 0, cz = 0;
    for (const i of [a, b, c2]) {
      v.fromBufferAttribute(pos, i).applyMatrix4(wheelMesh.matrixWorld);
      cx += v.x / 3;
      cz += v.z / 3;
    }
    (Math.hypot(cx - centre.x, cz - centre.z) < SPLIT ? headIdx : bowlIdx).push(a, b, c2);
  }
  if (!headIdx.length || !bowlIdx.length) return null;

  const headGeo = geo.clone();
  headGeo.setIndex(headIdx);
  const bowlGeo = geo.clone();
  bowlGeo.setIndex(bowlIdx);
  wheelMesh.geometry = bowlGeo; // the rim stays exactly where it was
  const head = new THREE.Mesh(headGeo, wheelMesh.material);
  head.applyMatrix4(wheelMesh.matrixWorld);
  scene.add(head);

  const pivot = new THREE.Group();
  pivot.position.copy(centre);
  scene.add(pivot);
  pivot.attach(head); // keeps the head exactly where it renders now

  // ---- measure the head's own profile, then dress it ------------------------
  const rc = new THREE.Raycaster();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const surfaceAt = (r: number, fallback: number): number => {
    rc.set(new THREE.Vector3(centre.x + r, centre.y + 1, centre.z), DOWN);
    const hit = rc.intersectObject(head, false);
    return hit.length ? hit[0].point.y : fallback;
  };
  // Inward far enough to swallow the pack's own painted pocket band: leave it
  // showing and the wheel reads as TWO rings, one of them meaningless.
  const R_IN = R * 0.40;   // the apron's inner edge
  const R_OUT = R * 0.84;  // …and its outer, right up to the rim wall
  const R_REST = R * 0.56; // where a ball actually comes to rest: the low shoulder
  const R_TRACK = R * 0.80; // the ball track, hugging the rim
  const yIn = surfaceAt(R_IN, centre.y - 0.07);
  const yOut = surfaceAt(R_OUT, centre.y - 0.02);
  const yRest = surfaceAt(R_REST, yIn);
  const yTrack = surfaceAt(R_TRACK, yOut);

  // the numbered apron — a cone band lying 3mm proud of the measured surface
  const SEG = POCKETS * 8;
  const vtx: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= SEG; s++) {
    const f = s / SEG;
    const a = -Math.PI / 2 + f * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    // The apron climbs steeply toward the rim, so a flat 3mm lift left the
    // model's own paint poking through the band's outer half between rings of
    // vertices. The lift grows with the radius, which is where the slope is.
    vtx.push(ca * R_IN, yIn + 0.003 - centre.y, sa * R_IN);
    vtx.push(ca * R_OUT, yOut + 0.011 - centre.y, sa * R_OUT);
    uvs.push(f, 0, f, 1);
  }
  for (let s = 0; s < SEG; s++) {
    const i = s * 2;
    idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(vtx, 3));
  ringGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  ringGeo.setIndex(idx);
  ringGeo.computeVertexNormals();
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshLambertMaterial({
      map: pocketRingTexture(),
      // the hall between its light pools is dark and a wheel you can't read is
      // the bug this ring exists to fix
      emissive: 0x151210,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  pivot.add(ring);

  // ---- the ball --------------------------------------------------------------
  // ~25mm on a 0.76m wheel. A real ball is 21 and vanished at table distance
  // in a hall this dim, so it is a shade over-scaled ON PURPOSE — the ball is
  // the thing everyone at the rail is trying to watch.
  const BALL_R = R * 0.033;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0xfffaf0, emissive: 0x5a544a }),
  );
  scene.add(ball);

  // THE THROW IS PLANNED, NOT STEERED (Oct 2026 — Josh: the ball "lands on
  // the one it's supposed to, then rapidly spins"). The old run let the ball
  // roll free and then DRAGGED it onto its pocket in the last third — measured,
  // the drag ran the ball backwards round the wheel at up to 3.5 rad/s, seven
  // times the wheel's own speed, while it was already down among the pockets.
  // Now the whole throw is worked out when it starts: the wheel's slowing is a
  // closed curve, so where it will be when the ball drops is known, and the
  // croupier's release point is chosen so the ball's own slowing run arrives
  // at its pocket exactly then, at exactly the wheel's speed. Nothing is
  // corrected afterwards, and the wheel comes to rest under the ball.
  const SPIN_W = 2.9;   // rad/s the croupier gives the head
  const HEAD_P = 1.6;   // how the head's spin dies: w = SPIN_W·(1-u)^HEAD_P
  const BALL_W0 = 11.5; // rad/s at release, against the wheel
  const BALL_Q = 1.5;   // how the ball's run dies
  let headA = 0;
  /** Which pocket the ball is sitting in between spins (it rides the head). */
  let restPocket = 0;
  let anim: {
    t: number; dur: number; pocket: number;
    head0: number; ball0: number; hwDrop: number;
  } | null = null;
  let dropTimer: ReturnType<typeof setTimeout> | null = null;

  const smooth = (x: number): number => {
    const u = Math.max(0, Math.min(1, x));
    return u * u * (3 - 2 * u);
  };
  /** How far the head has turned u of the way through a throw of `dur`. */
  const headTurn = (u: number, dur: number): number =>
    (SPIN_W * dur * (1 - Math.pow(1 - u, HEAD_P + 1))) / (HEAD_P + 1);
  /** The ball's own run, s of the way to the drop over `td` seconds: it starts
   *  at BALL_W0 and ends at -hw — the head's world speed — so the drop hands
   *  it to the wheel with no jolt. */
  const ballRun = (s: number, td: number, hw: number): number =>
    td * (-hw * s + ((BALL_W0 + hw) * (1 - Math.pow(1 - s, BALL_Q + 1))) / (BALL_Q + 1));
  const placeBall = (angle: number, r: number, y: number): void => {
    ball.position.set(centre.x + Math.cos(angle) * r, y + BALL_R, centre.z + Math.sin(angle) * r);
  };
  placeBall(pocketAngle(restPocket), R_REST, yRest);

  return {
    at: () => wheelMesh.localToWorld(localCentre.clone()),
    spin(pocket, durMs) {
      const dur = Math.max(2.2, durMs / 1000);
      const td = dur * DROP_AT;
      const hwDrop = SPIN_W * Math.pow(1 - DROP_AT, HEAD_P);
      // the pocket's world angle at the drop (the head turns world angle the
      // other way: world = local - headA), less the ball's own run, is where
      // the croupier has to let it go
      const headAtDrop = headA + headTurn(DROP_AT, dur);
      const ball0 = pocketAngle(pocket) - headAtDrop - ballRun(1, td, hwDrop);
      anim = { t: 0, dur, pocket, head0: headA, ball0, hwDrop };
      // Sound rides the ANIMATION's own clock, not the packet's (the sync
      // doctrine): the run fades as the ball leaves the track, and the drop
      // file's plunk sits DROP_LEAD_MS in, so it fires that far before the
      // ball is visibly in the pocket.
      if (near() < 11) {
        const restMs = dur * 1000 * DROP_AT;
        ballRunSfx(restMs);
        if (dropTimer) clearTimeout(dropTimer);
        dropTimer = setTimeout(() => ballLand(), Math.max(0, restMs - DROP_LEAD_MS));
      }
    },
    tick(dt) {
      if (anim) {
        anim.t += dt;
        const u = Math.min(1, anim.t / anim.dur);
        headA = anim.head0 + headTurn(u, anim.dur);
        const fall = smooth((u - 0.5) / (DROP_AT - 0.5));
        const r = R_TRACK + (R_REST - R_TRACK) * fall;
        let y = yTrack + (yRest - yTrack) * fall;
        // it does not roll gently in: it clatters down the frets
        if (fall > 0 && fall < 1) y += Math.abs(Math.sin(fall * Math.PI * 3.4)) * 0.026 * (1 - fall);
        const a = u < DROP_AT
          ? anim.ball0 + ballRun(u / DROP_AT, anim.dur * DROP_AT, anim.hwDrop)
          : pocketAngle(anim.pocket) - headA; // home: it rides its pocket
        placeBall(a, r, y);
        if (u >= 1) {
          restPocket = anim.pocket;
          anim = null;
        }
      } else {
        // at rest: the wheel has stopped with the ball in its pocket
        placeBall(pocketAngle(restPocket) - headA, R_REST, yRest);
      }
      pivot.rotation.y = headA;
    },
  };
}

/** Where in the reveal clock the ball is home. The last stretch is the wheel
 *  carrying it round in its pocket — a real one doesn't stop the instant it
 *  drops, and the croupier still has to call it. */
const DROP_AT = 0.86;

/** Re-parent the Fortune Roulette's disc onto a pivot at its own centre, so it
 *  can be spun without swinging around the prop's origin. The pack ships the
 *  wheel ASSEMBLED with the disc as a child mesh named "Roulette"; takeProp
 *  flattens the hierarchy but three's clone() preserves names, so it is still
 *  findable. Face normal is ±x (CASINO.md), hence rotation about X. */
let wheelFacePin: ((i: number, url: string) => void) | null = null;
let wheelFaceSet: ((files: (string | null)[]) => void) | null = null;
/** Drop the last hall's wheel-face closures (they hold its canvas + emoji
 *  Images between visits — memory only, but free to release). */
export function resetWheelFace(): void {
  wheelFacePin = null;
  wheelFaceSet = null;
}
function pivotWheelDisc(g: THREE.Group): THREE.Group | null {
  const discs: THREE.Mesh[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && norm(m.name).startsWith("roulette")) discs.push(m);
  });
  if (!discs.length) return null;
  const parent = discs[0].parent;
  if (!parent) return null;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const d of discs) {
    d.updateMatrix();
    d.geometry.computeBoundingBox();
    const bb = d.geometry.boundingBox!;
    for (const x of [bb.min.x, bb.max.x])
      for (const y of [bb.min.y, bb.max.y])
        for (const z of [bb.min.z, bb.max.z]) box.expandByPoint(v.set(x, y, z).applyMatrix4(d.matrix));
  }
  const centre = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.position.copy(centre);
  parent.add(pivot);
  for (const d of discs) {
    d.position.sub(centre);
    pivot.add(d);
  }

  const wheelFace = wheelFaceTex();
  wheelFacePin = wheelFace.pin;
  wheelFaceSet = wheelFace.setFace;
  // Face the disc with OUR 32 slots. Measured, not assumed: the face normal is
  // local X, so the radius comes from the other two extents and the half-depth
  // from X. Both sides get a face — the stage is open, so the back of the wheel
  // is visible from the bar, and a real disc reads mirrored from behind anyway.
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.y, size.z) / 2;
  const halfDepth = size.x / 2;
  const faceGeo = new THREE.CircleGeometry(radius * 0.995, 64);
  // Barely any self-illumination: the wheel already sits under a 62-intensity
  // show spot, and at the emissive level the rest of the hall uses the tier
  // colours washed out to pastel — gold read as cream, commons as pale lime.
  const faceMat = new THREE.MeshLambertMaterial({
    map: wheelFace.tex, emissive: 0x120d08,
  });
  for (const s of [1, -1]) {
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.rotation.y = (s * Math.PI) / 2; // CircleGeometry faces +Z; stand it on X
    face.position.x = s * (halfDepth + 0.012); // proud of the pack art
    pivot.add(face);
  }
  // A brass hub cap. The pack's disc has a green ball at its centre that sits
  // proud of the face plane, so it pokes through our art no matter how far out
  // the faces go — capping it is both the fix and what a prize wheel actually
  // has. Sized off the measured radius, not a guess.
  const hubR = radius * 0.185;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR, hubR, (halfDepth + hubR) * 2.2, 16),
    new THREE.MeshLambertMaterial({ color: 0xc9a24a }),
  );
  hub.rotation.z = Math.PI / 2; // stand the cylinder along X, the face normal
  pivot.add(hub);
  return pivot;
}
