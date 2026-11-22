// SOLACE SURVIVORZ — A HOUSE'S DOORS (Glenridge Hall). The baked zones carry every door's frame and no leaf
// (scripts/survivorz/glenridge/game-export.py): the leaf is hung here, to the build's own measure (geo.py door()):
//   panel   an oak room door: six fielded panels a face, a brass plate and knob
//   arch    an oak plank door with three iron straps and a ring, under a fixed pointed head above the transom
//   french  a glazed door: stiles and rails, glazing bars, a brass lever (a pair where the opening is wide)
//   steel   the vault's: plate steel, three bands and a wheel
//   cell    a heavy plank door with a barred opening
//   garage  a pair of boarded doors, ledged and braced
// One or two leaves an opening (a pair where it is wide). Each leaf is three or four meshes (one a material),
// its geometry shared by every door the same size. The swing and the hinge side are chosen from the floor either
// side (show/doors.ts): a door opens onto clear floor, against a wall where there is one.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type DoorStyle = "panel" | "arch" | "french" | "steel" | "cell" | "garage";

export const HOUSE_MATS = {
  oak: new THREE.MeshStandardMaterial({ color: 0x55381f, roughness: 0.62, metalness: 0 }),
  oakDark: new THREE.MeshStandardMaterial({ color: 0x2e1d10, roughness: 0.7, metalness: 0 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.55, metalness: 0.3 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.35, metalness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x4a4f54, roughness: 0.5, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xcfe0e2, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, forceSinglePass: true }),
};
type MatKey = keyof typeof HOUSE_MATS;
type Parts = Partial<Record<MatKey, THREE.BufferGeometry[]>>;

/** the frame the build puts round an opening (jambs and head), by style: the leaf stands inside it */
export const FRAME_W: Record<DoorStyle, number> = { panel: 0.06, arch: 0.06, french: 0.07, steel: 0.06, cell: 0.06, garage: 0.06 };
/** an opening this wide takes a pair of leaves */
export const PAIR_FROM = 1.3;
export const isPair = (style: DoorStyle, w: number): boolean => style === "garage" || (style !== "arch" && style !== "steel" && style !== "cell" && w >= PAIR_FROM);
const T = 0.05;      // a leaf's thickness

const cache = new Map<string, { geo: THREE.BufferGeometry; mat: MatKey }[]>();

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
/** both faces of a leaf */
const faces = (fn: (s: 1 | -1) => void) => { fn(1); fn(-1); };

/** One leaf, `lw` wide and `lh` high, its hinge on the local y axis at x = 0, running toward +x (dir 1) or -x (dir -1),
 *  centred on y = 0. */
function build(style: DoorStyle, lw: number, lh: number, dir: 1 | -1): { geo: THREE.BufferGeometry; mat: MatKey }[] {
  const P: Parts = {};
  const add = (m: MatKey, w: number, h: number, d: number, x: number, y: number, z = 0) => (P[m] ??= []).push(box(w, h, d, dir * x, y, z));
  const y0 = -lh / 2;
  const handleX = lw - 0.085, handleY = y0 + 1.02;
  if (style === "panel") {
    add("oak", lw, lh, T, lw / 2, 0);
    faces((s) => {
      // six fielded panels: a raised field and a smaller one on it (geo.py's proportions)
      for (const [ca, cb] of [[0.11, 0.46], [0.54, 0.89]]) for (const [ra, rb] of [[0.07, 0.33], [0.39, 0.7], [0.76, 0.94]]) {
        const w = lw * (cb - ca), h = lh * (rb - ra), x = lw * (ca + cb) / 2, y = y0 + lh * (ra + rb) / 2;
        add("oakDark", w, h, 0.004, x, y, s * (T / 2 + 0.002));
        add("oak", w - 0.07, h - 0.07, 0.012, x, y, s * (T / 2 + 0.006));
      }
      add("brass", 0.06, 0.18, 0.006, handleX, handleY, s * (T / 2 + 0.003));
      add("brass", 0.046, 0.05, 0.045, handleX, handleY, s * (T / 2 + 0.028));
    });
  } else if (style === "arch") {
    add("oak", lw, lh, T, lw / 2, 0);
    faces((s) => {
      const n = Math.max(4, Math.round(lw / 0.2));
      for (let i = 1; i < n; i++) add("oakDark", 0.008, lh, 0.003, (lw * i) / n, 0, s * (T / 2 + 0.0015));   // the planks' joints
      for (const y of [y0 + 0.35, y0 + lh * 0.55, y0 + lh - 0.3]) add("iron", lw * 0.62, 0.06, 0.009, lw * 0.31, y, s * (T / 2 + 0.0045));
      add("iron", 0.1, 0.08, 0.045, lw - 0.11, handleY, s * (T / 2 + 0.0225));
    });
  } else if (style === "french") {
    const st = 0.085, top = 0.085, bot = 0.24, d = 0.045;
    add("oakDark", st, lh, d, st / 2, 0); add("oakDark", st, lh, d, lw - st / 2, 0);
    add("oakDark", lw - 2 * st, top, d, lw / 2, lh / 2 - top / 2); add("oakDark", lw - 2 * st, bot, d, lw / 2, y0 + bot / 2);
    const gh = lh - top - bot, gy = y0 + bot + gh / 2;
    for (let i = 1; i < 4; i++) add("oakDark", lw - 2 * st, 0.022, 0.03, lw / 2, y0 + bot + (gh * i) / 4);
    if (lw > 0.62) add("oakDark", 0.022, gh, 0.03, lw / 2, gy);
    add("glass", lw - 2 * st, gh, 0.006, lw / 2, gy);
    faces((s) => { add("brass", 0.03, 0.14, 0.006, lw - st / 2, handleY, s * (d / 2 + 0.003)); add("brass", 0.11, 0.02, 0.02, lw - st / 2 - 0.04, handleY, s * (d / 2 + 0.03)); });
  } else if (style === "steel") {
    add("steel", lw, lh, 0.07, lw / 2, 0);
    faces((s) => {
      for (const y of [y0 + 0.3, 0, y0 + lh - 0.3]) add("iron", lw, 0.07, 0.012, lw / 2, y, s * 0.041);
      // the wheel: a ring of eight short bars and its spokes
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; (P.iron ??= []).push(new THREE.BoxGeometry(0.13, 0.03, 0.03).rotateZ(a + Math.PI / 2).translate(dir * (lw / 2 + Math.cos(a) * 0.16), 0.12 + Math.sin(a) * 0.16, s * 0.075)); }
      add("iron", 0.32, 0.024, 0.024, lw / 2, 0.12, s * 0.07); add("iron", 0.024, 0.32, 0.024, lw / 2, 0.12, s * 0.07);
      add("iron", 0.05, 0.05, 0.05, lw / 2, 0.12, s * 0.055);
    });
  } else if (style === "cell") {
    // planks round a barred opening at eye height
    const ox0 = 0.2, ox1 = lw - 0.2, oy0 = y0 + 1.35, oy1 = y0 + 1.72, th = 0.06;
    add("oak", lw, oy0 - y0, th, lw / 2, (y0 + oy0) / 2); add("oak", lw, lh / 2 - oy1, th, lw / 2, (oy1 + lh / 2) / 2);
    add("oak", ox0, oy1 - oy0, th, ox0 / 2, (oy0 + oy1) / 2); add("oak", lw - ox1, oy1 - oy0, th, (ox1 + lw) / 2, (oy0 + oy1) / 2);
    for (let i = 0; i < 4; i++) add("iron", 0.022, oy1 - oy0, 0.022, ox0 + ((ox1 - ox0) * (i + 0.5)) / 4, (oy0 + oy1) / 2);
    faces((s) => {
      for (const y of [y0 + 0.4, y0 + lh - 0.25]) add("iron", lw, 0.07, 0.01, lw / 2, y, s * (th / 2 + 0.005));
      add("iron", 0.22, 0.05, 0.04, lw - 0.16, handleY, s * (th / 2 + 0.02));
    });
  } else {
    // garage: boards, two ledges and a brace
    add("oak", lw, lh, T, lw / 2, 0);
    faces((s) => {
      const n = Math.max(4, Math.round(lw / 0.16));
      for (let i = 1; i < n; i++) add("oakDark", 0.008, lh, 0.003, (lw * i) / n, 0, s * (T / 2 + 0.0015));
      for (const y of [y0 + 0.28, y0 + lh - 0.28]) add("oakDark", lw - 0.04, 0.14, 0.02, lw / 2, y, s * (T / 2 + 0.01));
      const len = Math.hypot(lw - 0.1, lh - 0.7);
      (P.oakDark ??= []).push(new THREE.BoxGeometry(len, 0.12, 0.018).rotateZ(dir * Math.atan2(lh - 0.7, lw - 0.1)).translate(dir * lw / 2, 0, s * (T / 2 + 0.009)));
      add("iron", 0.03, 0.2, 0.04, lw - 0.1, handleY, s * (T / 2 + 0.02));
    });
  }
  const out: { geo: THREE.BufferGeometry; mat: MatKey }[] = [];
  for (const [m, list] of Object.entries(P) as [MatKey, THREE.BufferGeometry[]][]) {
    const geo = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (geo) out.push({ geo, mat: m });
  }
  return out;
}

/** A leaf to hang: a group whose origin is its hinge line at mid-height. */
export function houseLeaf(style: DoorStyle, lw: number, lh: number, dir: 1 | -1): THREE.Group {
  const key = `${style}|${lw.toFixed(3)}|${lh.toFixed(3)}|${dir}`;
  let parts = cache.get(key);
  if (!parts) cache.set(key, (parts = build(style, lw, lh, dir)));
  const g = new THREE.Group();
  for (const p of parts) {
    const m = new THREE.Mesh(p.geo, HOUSE_MATS[p.mat]);
    m.castShadow = p.mat !== "glass";
    if (p.mat === "glass") m.renderOrder = 3;
    g.add(m);
  }
  return g;
}

/** THE FIXED HEAD over an arched door's transom: the opening's own pointed shape (geo.py arch_pts), boarded.
 *  `w` across, `rise` high; its origin is the middle of its foot. */
export function archHead(w: number, rise: number): THREE.Mesh {
  const key = `head|${w.toFixed(3)}|${rise.toFixed(3)}`;
  let parts = cache.get(key);
  if (!parts) {
    const pts: THREE.Vector2[] = [new THREE.Vector2(-w / 2, 0)];
    const n = 8, k = Math.sin(Math.PI / 3);
    for (let i = 1; i < n; i++) { const a = ((Math.PI / 3) * i) / n; pts.push(new THREE.Vector2(w / 2 - w * Math.cos(a), (rise * Math.sin(a)) / k)); }
    pts.push(new THREE.Vector2(0, rise));
    for (let i = n - 1; i >= 1; i--) { const a = ((Math.PI / 3) * i) / n; pts.push(new THREE.Vector2(-(w / 2 - w * Math.cos(a)), (rise * Math.sin(a)) / k)); }
    pts.push(new THREE.Vector2(w / 2, 0));
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: T, bevelEnabled: false }).translate(0, 0, -T / 2);
    cache.set(key, (parts = [{ geo, mat: "oak" }]));
  }
  const m = new THREE.Mesh(parts[0].geo, HOUSE_MATS.oak);
  m.castShadow = true;
  return m;
}

/** every material here on a scrap, for the scene to compile ahead (show/doors.ts warmScrap) */
export function houseWarm(): THREE.Mesh[] {
  const b = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  return Object.values(HOUSE_MATS).map((m) => new THREE.Mesh(b, m));
}

export function disposeHouseDoors(): void {
  for (const parts of cache.values()) for (const p of parts) p.geo.dispose();
  cache.clear();
}
