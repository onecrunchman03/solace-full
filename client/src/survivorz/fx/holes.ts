// SURVIVORZ EFFECTS — bullet holes, one per surface (docs/survivorz/EFFECTS.md §6).
// The show's are BAKED (scripts/survivorz/fx-holes.mjs: a height field per hole, so each has
// real depth in the room's light — colour, normal and roughness, four kinds across, two
// variants down) and loaded by `loadHoleKit`. `bulletHoleAtlas` is F1's code-drawn 2×2,
// kept for a page that can't fetch the baked one; a kind's cell is its column in both.
import * as THREE from "three";
import type { DecalAtlas } from "./decals";
import type { FxSystem } from "./system";
import { mulberry32 } from "./rng";

/** Which cell each surface's hole is. */
export const HOLE = { concrete: 0, metal: 1, wood: 2, glass: 3 } as const;

const CELL = 256;

export function bulletHoleAtlas(): DecalAtlas {
  const c = document.createElement("canvas");
  c.width = c.height = CELL * 2;
  const g = c.getContext("2d")!;
  const rng = mulberry32(4416);
  const at = (i: number) => [(i % 2) * CELL + CELL / 2, Math.floor(i / 2) * CELL + CELL / 2] as const;
  const blob = (x: number, y: number, r: number, jag: number, n: number) => {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 - jag + rng() * jag * 2);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  };
  {
    // concrete: a spalled crater, pale broken rim, dark core, a dust halo
    const [x, y] = at(HOLE.concrete);
    const halo = g.createRadialGradient(x, y, 20, x, y, 120);
    halo.addColorStop(0, "rgba(70,66,60,0.55)");
    halo.addColorStop(1, "rgba(70,66,60,0)");
    g.fillStyle = halo;
    g.fillRect(x - 128, y - 128, 256, 256);
    blob(x, y, 62, 0.35, 22);
    g.fillStyle = "rgba(168,162,152,0.95)"; // freshly broken concrete is lighter than the face
    g.fill();
    blob(x, y, 36, 0.3, 16);
    g.fillStyle = "rgba(92,88,82,1)";
    g.fill();
    blob(x, y, 15, 0.25, 12);
    g.fillStyle = "rgba(14,13,12,1)";
    g.fill();
  }
  {
    // metal: a punched hole with a bright bare-metal rim and the paint flaked round it
    const [x, y] = at(HOLE.metal);
    blob(x, y, 44, 0.3, 18);
    g.fillStyle = "rgba(60,58,56,0.7)";
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = "rgba(200,198,192,1)";
    g.beginPath();
    g.arc(x, y, 20, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(8,8,8,1)";
    g.beginPath();
    g.arc(x, y, 16, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 8; i++) {
      // little scorch streaks thrown out from the strike
      const a = rng() * Math.PI * 2, l = 40 + rng() * 40;
      g.strokeStyle = "rgba(30,26,22,0.45)";
      g.lineWidth = 2 + rng() * 3;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }
  {
    // wood: a torn hole with splintered fibres running along the grain (vertical here)
    const [x, y] = at(HOLE.wood);
    g.fillStyle = "rgba(196,150,96,0.95)"; // bare inner wood
    blob(x, y, 40, 0.35, 16);
    g.fill();
    for (let i = 0; i < 14; i++) {
      const dx = (rng() - 0.5) * 60, up = rng() < 0.5 ? -1 : 1;
      g.strokeStyle = `rgba(${170 + rng() * 40},${125 + rng() * 30},${80 + rng() * 20},0.9)`;
      g.lineWidth = 2 + rng() * 4;
      g.beginPath();
      g.moveTo(x + dx * 0.5, y);
      g.lineTo(x + dx, y + up * (50 + rng() * 60));
      g.stroke();
    }
    blob(x, y, 17, 0.3, 12);
    g.fillStyle = "rgba(16,10,6,1)";
    g.fill();
  }
  {
    // glass: a star of cracks from a small clean hole, the rings between them
    const [x, y] = at(HOLE.glass);
    g.strokeStyle = "rgba(235,242,248,0.85)";
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + (rng() - 0.5) * 0.3;
      g.lineWidth = 1.5 + rng() * 1.5;
      g.beginPath();
      let px = x, py = y;
      g.moveTo(px, py);
      const len = 70 + rng() * 50;
      for (let s = 1; s <= 5; s++) {
        const r = (s / 5) * len, wob = (rng() - 0.5) * 0.25;
        px = x + Math.cos(a + wob) * r;
        py = y + Math.sin(a + wob) * r;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    for (const r of [26, 48, 78]) {
      g.lineWidth = 1.2;
      g.strokeStyle = "rgba(235,242,248,0.5)";
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2, rr = r * (0.85 + rng() * 0.3);
        if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.stroke();
    }
    g.fillStyle = "rgba(240,246,250,0.9)";
    g.beginPath();
    g.arc(x, y, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(20,24,28,1)";
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.anisotropy = 8;
  return { map, cols: 2, rows: 2 };
}

export interface HoleKit {
  /** how many of each kind (rows of the atlas) */
  variants: number;
  bytes: number;
}

interface HoleManifest {
  width: number;
  height: number;
  cols: number;
  rows: number;
  variants: number;
  color: { png: string; ktx2?: string };
  normal: { png: string; ktx2?: string };
  rough: { png: string; ktx2?: string };
}

/** The baked holes into a "holes" decal set (400 marks). */
export async function loadHoleKit(fx: FxSystem): Promise<HoleKit> {
  const { load } = fx.opts;
  const man = await load.json<HoleManifest>("holes/holes.json");
  const packed = !!(man.color.ktx2 && load.compressed);
  const tex = async (f: { png: string; ktx2?: string }, space: "srgb" | "linear") => {
    const t = packed && f.ktx2 ? await load.compressed!(`holes/${f.ktx2}`) : await load.texture(`holes/${f.png}`, space);
    t.colorSpace = space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (!packed) t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const atlas: DecalAtlas = {
    map: await tex(man.color, "srgb"), normalMap: await tex(man.normal, "linear"), roughnessMap: await tex(man.rough, "linear"),
    cols: man.cols, rows: man.rows, topDown: packed,
  };
  fx.addDecalSet("holes", atlas, 400, 48);
  const per = packed ? 1 : 4;
  return { variants: man.variants, bytes: Math.round((man.width * man.height + 2 * (man.width / 2) * (man.height / 2)) * per * 4 / 3) };
}

/** The atlas cell for a kind's hole, one of its variants by the event's rng. */
export function holeCell(fx: FxSystem, kind: keyof typeof HOLE, rng: () => number): number {
  const variants = fx.holes?.variants ?? 1;
  return HOLE[kind] + 4 * Math.min(variants - 1, Math.floor(rng() * variants));
}
