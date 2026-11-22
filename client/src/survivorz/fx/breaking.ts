// SURVIVORZ EFFECTS — things breaking (docs/survivorz/EFFECTS.md, step F6): a barricade
// being hit and its planks giving way, a door shaking in its frame and shedding dust as
// it's battered, a door bursting, glass shattering.
//
// Driven by the facility server's door events (src/survivorz/doors.ts `FxEvent`:
// door.hit, door.banged, door.broken, door.barricade, door.unbarricade), each with the
// door's centre, facing, size, material and which side the blow came from — and one
// seed, so every observer's door breaks into the same pieces.
//
// THE PIECES ARE ONE DRAW AN EVENT. A burst door is six or seven panels and a dozen long
// splinters, a pane of glass forty or fifty shards; a mesh each would blow the budget.
// So every piece of one event is a slab in ONE geometry (`Debris`) whose vertices are
// rewritten each frame from its own little rigid body (rigid.ts's physics, the gore's),
// and a piece at rest costs nothing. All the wood shares one material and one atlas
// (fx-wood.mjs: bare wood | painted wood), so planks, door panels and splinters agree.
import * as THREE from "three";
import type { EffectContext, FxSystem } from "./system";
import { SPRITE } from "./sprites";
import { holeCell } from "./holes";
import { inCone, mulberry32, pick, range, type Rng } from "./rng";
import { rigidBody, stepRigid, type RigidBody } from "./rigid";
import type { SurfaceProbe } from "./casings";
import { KeptLayer } from "./kept";

const UP = new THREE.Vector3(0, 1, 0);
const v3 = () => new THREE.Vector3();

// ---- the kit -------------------------------------------------------------------------

export interface BreakKit {
  /** every piece of wood: planks, door panels, splinters (vertex colours grade it) */
  wood: THREE.MeshStandardMaterial;
  /** every shard of glass */
  glass: THREE.MeshStandardMaterial;
  /** the atlas: u from these halves, along the grain */
  bare: [number, number];
  painted: [number, number];
  /** metres of wood one half covers along the grain */
  metres: number;
  bytes: number;
}

interface WoodManifest {
  width: number;
  height: number;
  color: { png: string; ktx2?: string };
  normal: { png: string; ktx2?: string };
  halves: { bare: number[]; painted: number[] };
  metres: number;
}

export async function loadBreakKit(fx: FxSystem): Promise<BreakKit> {
  const { load } = fx.opts;
  const man = await load.json<WoodManifest>("breaking/wood.json");
  const tex = async (f: { png: string; ktx2?: string }, space: "srgb" | "linear") => {
    const t = f.ktx2 && load.compressed ? await load.compressed(`breaking/${f.ktx2}`) : await load.texture(`breaking/${f.png}`, space);
    t.colorSpace = space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (!(f.ktx2 && load.compressed)) t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const map = await tex(man.color, "srgb"), normalMap = await tex(man.normal, "linear");
  const wood = new THREE.MeshStandardMaterial({ name: "fx-wood", map, normalMap, roughness: 0.82, metalness: 0, vertexColors: true });
  wood.normalScale.set(0.8, 0.8);
  const glass = new THREE.MeshStandardMaterial({
    name: "fx-glass", color: 0xcfe2e4, roughness: 0.04, metalness: 0.1, vertexColors: true,
    transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  // a compressed texture is one byte a texel (BC7), a PNG four; a third more for the mips
  const per = load.compressed && man.color.ktx2 ? 1 : 4;
  const bytes = Math.round((man.width * man.height + (man.width / 2) * (man.height / 2)) * per * 4 / 3);
  const kit: BreakKit = { wood, glass, bare: [man.halves.bare[0], man.halves.bare[2]], painted: [man.halves.painted[0], man.halves.painted[2]], metres: man.metres, bytes };
  // compile both programs now, on a scrap, so the first burst door is not a freeze
  const scrap = new THREE.Group();
  for (const m of [wood, glass]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    scrap.add(new THREE.Mesh(g, m));
  }
  const { renderer, camera, scene } = fx.opts;
  renderer.initTexture(map);
  renderer.initTexture(normalMap);
  scene.add(scrap);
  await renderer.compileAsync(scrap, camera, scene);
  scene.remove(scrap);
  scrap.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  return kit;
}

// ---- slabs: a flat polygon given thickness --------------------------------------------

export type V2 = [number, number];
type C3 = [number, number, number];

/** Vertices for some pieces, unindexed (flat faces). */
export interface Slab {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
}
const emptySlab = (): Slab => ({ pos: [], nor: [], uv: [], col: [] });

export interface SlabLook {
  /** the uv of a point on a FACE, from its place in the original whole (door or plank) */
  face: (x: number, y: number) => V2;
  /** the uv of a point on an EDGE (torn or sawn wood) */
  edge: (x: number, y: number, z: number) => V2;
  faceColor: C3;
  edgeColor: C3;
}

/** A polygon (piece-centred, in the piece's x/y) extruded to `t` thick along z. `ox, oy` is
 *  where the piece sat in the original whole, for its uvs. */
export function slab(poly: V2[], t: number, look: SlabLook, ox = 0, oy = 0, out: Slab = emptySlab()): Slab {
  let pts = poly.map(([x, y]) => new THREE.Vector2(x, y));
  if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const h = t / 2;
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, uv: V2, c: C3) => {
    out.pos.push(x, y, z);
    out.nor.push(nx, ny, nz);
    out.uv.push(uv[0], uv[1]);
    out.col.push(c[0], c[1], c[2]);
  };
  for (const [a, b, c] of tris) {
    for (const i of [a, b, c]) push(pts[i].x, pts[i].y, h, 0, 0, 1, look.face(pts[i].x + ox, pts[i].y + oy), look.faceColor);
    for (const i of [a, c, b]) push(pts[i].x, pts[i].y, -h, 0, 0, -1, look.face(pts[i].x + ox, pts[i].y + oy), look.faceColor);
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    const nx = dy / l, ny = -dx / l;
    const e = (x: number, y: number, z: number) => look.edge(x + ox, y + oy, z);
    push(p.x, p.y, h, nx, ny, 0, e(p.x, p.y, h), look.edgeColor);
    push(p.x, p.y, -h, nx, ny, 0, e(p.x, p.y, -h), look.edgeColor);
    push(q.x, q.y, -h, nx, ny, 0, e(q.x, q.y, -h), look.edgeColor);
    push(p.x, p.y, h, nx, ny, 0, e(p.x, p.y, h), look.edgeColor);
    push(q.x, q.y, -h, nx, ny, 0, e(q.x, q.y, -h), look.edgeColor);
    push(q.x, q.y, h, nx, ny, 0, e(q.x, q.y, h), look.edgeColor);
  }
  return out;
}

/** The look of wood: the grain runs along `grain` ("x" for a plank, "y" for a door). */
export function woodLook(kit: BreakKit, faces: "bare" | "painted", grain: "x" | "y", faceColor: C3, edgeColor: C3 = [1.45, 1.3, 1.15]): SlabLook {
  const half = faces === "painted" ? kit.painted : kit.bare;
  const fit = (lo: number, hi: number, along: number) => lo + (hi - lo) * (0.5 + 0.5 * Math.sin((along / kit.metres) * Math.PI * 0.5)) * 0.98;
  // along the grain: across the half, folded so a long piece never runs off its half;
  // across the grain: down the texture
  const face = (x: number, y: number): V2 => {
    const along = grain === "x" ? x : y, across = grain === "x" ? y : x;
    return [fit(half[0], half[1], along), 0.5 + across / kit.metres];
  };
  const edge = (x: number, y: number, z: number): V2 => {
    const along = grain === "x" ? x : y;
    return [fit(kit.bare[0], kit.bare[1], along * 1.7), 0.5 + z * 6];
  };
  return { face, edge, faceColor, edgeColor };
}

const glassLook: SlabLook = {
  face: () => [0, 0],
  edge: () => [0, 0],
  faceColor: [0.85, 0.93, 0.94],
  // the green of a pane seen edge-on
  edgeColor: [0.32, 0.62, 0.5],
};

// ---- fracture -------------------------------------------------------------------------

/** keep the part of a convex polygon where (p - m)·d <= 0 */
function clipHalf(poly: V2[], m: V2, d: V2): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = (a[0] - m[0]) * d[0] + (a[1] - m[1]) * d[1], db = (b[0] - m[0]) * d[0] + (b[1] - m[1]) * d[1];
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** The Voronoi cells of `seeds` inside a rectangle, measured with y divided by `stretch`
 *  (stretch > 1 makes long cells up the grain: wood splits along it). */
export function voronoi(rect: [number, number, number, number], seeds: V2[], stretch = 1): V2[][] {
  const [x0, y0, x1, y1] = rect;
  const s = seeds.map(([x, y]): V2 => [x, y / stretch]);
  const cells: V2[][] = [];
  for (let i = 0; i < s.length; i++) {
    let poly: V2[] = [[x0, y0 / stretch], [x1, y0 / stretch], [x1, y1 / stretch], [x0, y1 / stretch]];
    for (let j = 0; j < s.length && poly.length >= 3; j++) {
      if (i === j) continue;
      const m: V2 = [(s[i][0] + s[j][0]) / 2, (s[i][1] + s[j][1]) / 2];
      poly = clipHalf(poly, m, [s[j][0] - s[i][0], s[j][1] - s[i][1]]);
    }
    if (poly.length >= 3) cells.push(poly.map(([x, y]): V2 => [x, y * stretch]));
  }
  return cells;
}

/** Roughen every edge that isn't on the rectangle's own border: splintery across the
 *  grain, cleaner along it (wood), or barely at all (glass). */
export function jag(poly: V2[], rect: [number, number, number, number], rng: Rng, seg: number, amp: number, grain: "x" | "y" | null): V2[] {
  const [x0, y0, x1, y1] = rect;
  const onBorder = (p: V2) => Math.abs(p[0] - x0) < 1e-4 ? 1 : Math.abs(p[0] - x1) < 1e-4 ? 2 : Math.abs(p[1] - y0) < 1e-4 ? 3 : Math.abs(p[1] - y1) < 1e-4 ? 4 : 0;
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push(a);
    const ba = onBorder(a);
    if (ba && ba === onBorder(b)) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const k = Math.floor(len / seg);
    if (k < 2) continue;
    const cross = grain === "y" ? Math.abs(dx / len) : grain === "x" ? Math.abs(dy / len) : 1;
    const am = Math.min(seg * 0.45, amp * (0.25 + 0.75 * cross));
    for (let s = 1; s < k; s++) {
      const t = (s + range(rng, -0.3, 0.3)) / k;
      const o = range(rng, -am, am);
      out.push([a[0] + dx * t - (dy / len) * o, a[1] + dy * t + (dx / len) * o]);
    }
  }
  return out;
}

const area = (p: V2[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return Math.abs(a) / 2;
};
const centroid = (p: V2[]): V2 => {
  let x = 0, y = 0;
  for (const q of p) {
    x += q[0];
    y += q[1];
  }
  return [x / p.length, y / p.length];
};

// ---- Debris: many pieces, one draw ---------------------------------------------------

export interface PieceSpec {
  slab: Slab;
  /** where it is, and how it's turned, at the start */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  /** seconds it stays where it is before it falls (a shard stuck in the frame) */
  delay?: number;
  /** drives it by hand until it lets go (a plank swinging on its last nail); returns false
   *  when it lets go, and the piece falls on with the speed it had */
  hold?: (t: number, pos: THREE.Vector3, quat: THREE.Quaternion) => boolean;
  restitution?: number;
  /** seconds it lies before sinking away */
  keep?: number;
  seed: number;
}

interface Piece {
  b: RigidBody;
  start: number;
  count: number;
  lp: Float32Array;
  ln: Float32Array;
  phase: "wait" | "hold" | "free" | "gone";
  /** seconds spent being tipped off an edge (a flat piece can't stand on one) */
  tipped: number;
  /** seconds it's been nearly still on the floor; past a moment it's laid flat and rests */
  slow: number;
  /** seconds it's been on the floor at all (a splinter jitters there for ever otherwise) */
  floored: number;
  settling: boolean;
  delay: number;
  hold?: PieceSpec["hold"];
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  prevP: THREE.Vector3;
  prevQ: THREE.Quaternion;
}

const mtx = new THREE.Matrix4();
const tq = new THREE.Quaternion();
const tp = new THREE.Vector3();
const tz = new THREE.Vector3();
const tw = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const IDQ = new THREE.Quaternion();

/** A slab's support points: the corners of its outline on both faces (its every extreme —
 *  a long thin piece with only a few would let a corner sink into the floor), at most 48. */
function outline(lp: Float32Array): THREE.Vector3[] {
  const seen = new Map<string, THREE.Vector3>();
  for (let i = 0; i < lp.length; i += 3) {
    const k = `${lp[i].toFixed(4)},${lp[i + 1].toFixed(4)},${lp[i + 2].toFixed(4)}`;
    if (!seen.has(k)) seen.set(k, new THREE.Vector3(lp[i], lp[i + 1], lp[i + 2]));
  }
  const all = [...seen.values()];
  if (all.length <= 48) return all;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 48; i++) out.push(all[Math.floor((i * all.length) / 48)]);
  return out;
}

export class Debris {
  readonly mesh: THREE.Mesh;
  /** what made it (the show's event that broke the thing), so it can be made again */
  cause?: unknown;
  private pieces: Piece[] = [];
  private t = 0;
  private posAttr: THREE.BufferAttribute;
  private norAttr: THREE.BufferAttribute;

  constructor(material: THREE.Material, specs: PieceSpec[], floorY: number) {
    let total = 0;
    for (const s of specs) total += s.slab.pos.length / 3;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(total * 3), 3);
    this.norAttr = new THREE.BufferAttribute(new Float32Array(total * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.norAttr.setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
    let at = 0, k = 0;
    for (const s of specs) {
      const n = s.slab.pos.length / 3;
      uv.set(s.slab.uv, at * 2);
      col.set(s.slab.col, at * 3);
      const lp = Float32Array.from(s.slab.pos), ln = Float32Array.from(s.slab.nor);
      const obj = new THREE.Object3D();
      obj.position.copy(s.pos);
      obj.quaternion.copy(s.quat);
      // each piece lies a few millimetres higher than the last, so where two overlap on the
      // floor their faces never fight
      const b = rigidBody({ obj, points: outline(lp), vel: v3(), spin: v3(), floorY: floorY + (k++ % 7) * 0.003, restitution: s.restitution ?? 0.15, keep: s.keep ?? Infinity, seed: s.seed });
      b.own = true;
      this.pieces.push({
        b, start: at, count: n, lp, ln, phase: s.hold ? "hold" : "wait", tipped: 0, slow: 0, floored: 0, settling: false, delay: s.delay ?? 0, hold: s.hold,
        vel: s.vel.clone(), spin: s.spin.clone(), prevP: s.pos.clone(), prevQ: s.quat.clone(),
      });
      at += n;
    }
    g.setAttribute("position", this.posAttr);
    g.setAttribute("normal", this.norAttr);
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = "fx-debris";
    // the pieces fly anywhere about the room; a bound computed once would be wrong at once
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    for (const p of this.pieces) this.write(p);
  }

  /** Step every piece; false once every piece has gone. */
  update(dt: number, probe?: SurfaceProbe): boolean {
    this.t += dt;
    let alive = false, dirty = false;
    for (const p of this.pieces) {
      if (p.phase === "gone") continue;
      alive = true;
      const o = p.b.obj;
      if (p.phase === "hold") {
        const still = p.hold!(this.t, o.position, o.quaternion);
        if (!still) {
          // let go with the speed it was swinging at
          p.b.v.copy(o.position).sub(p.prevP).divideScalar(Math.max(1e-3, dt));
          tq.copy(p.prevQ).invert().premultiply(o.quaternion);
          const ang = 2 * Math.acos(Math.min(1, Math.abs(tq.w)));
          const s = Math.sqrt(Math.max(1e-9, 1 - tq.w * tq.w));
          p.b.w.set(tq.x / s, tq.y / s, tq.z / s).multiplyScalar((tq.w < 0 ? -ang : ang) / Math.max(1e-3, dt));
          p.phase = "free";
        }
        p.prevP.copy(o.position);
        p.prevQ.copy(o.quaternion);
        this.write(p);
        dirty = true;
        continue;
      }
      if (p.phase === "wait") {
        if (this.t < p.delay) continue;
        p.b.v.copy(p.vel);
        p.b.w.copy(p.spin);
        p.phase = "free";
      }
      const b = p.b;
      if (b.state === "rest") {
        b.rest += dt;
        if (b.rest > b.keep) b.state = "sink";
        continue;
      }
      if (b.state === "sink") {
        b.sink += dt;
        o.position.y -= dt * b.radius * 0.8;
        if (b.sink > 1.2) {
          p.phase = "gone";
          this.collapse(p);
        } else this.write(p);
        dirty = true;
        continue;
      }
      if (p.settling) {
        this.settle(p, dt);
        this.write(p);
        dirty = true;
        continue;
      }
      stepRigid(b, dt, probe);
      // nearly still and lying near flat on the floor: ease it the last bit flat and let it rest.
      // (Balanced on one contact at a time, a slab rocks for ever; and real boards and shards
      // do end up lying flat.)
      tz.set(0, 0, 1).applyQuaternion(o.quaternion);
      const low = this.lowestOf(p);
      const onFloor = low - b.ground < 0.03;
      if (onFloor && Math.abs(tz.y) > 0.55 && b.v.lengthSq() < 0.12 && b.w.lengthSq() < 6) p.slow += dt;
      else p.slow = 0;
      if (onFloor && b.v.lengthSq() < 1) p.floored += dt;
      if (p.slow > 0.35 || p.floored > 1.4) p.settling = true;
      // every piece is a slab (its thin axis local z): one that has come to a stop standing
      // on its edge is turned over, the way a board stood on end falls flat. For a few
      // seconds at most, so one leaning on a wall isn't pushed into it for ever
      if (p.tipped < 3 && o.position.y - b.ground < b.radius * 1.05 + 0.02) {
        tz.set(0, 0, 1).applyQuaternion(o.quaternion);
        if (Math.abs(tz.y) < 0.55 && b.v.lengthSq() < 0.6) {
          if (tz.y < 0) tz.negate();
          tw.copy(tz).cross(UP);
          if (tw.lengthSq() > 1e-6) {
            b.w.addScaledVector(tw.normalize(), dt * 10);
            b.still = 0;
            p.tipped += dt;
          }
        }
      }
      this.write(p);
      dirty = true;
    }
    if (dirty) {
      this.posAttr.needsUpdate = true;
      this.norAttr.needsUpdate = true;
    }
    return alive;
  }

  private write(p: Piece): void {
    const o = p.b.obj;
    mtx.compose(o.position, o.quaternion, o.scale);
    const P = this.posAttr.array as Float32Array, N = this.norAttr.array as Float32Array, e = mtx.elements;
    for (let i = 0; i < p.count; i++) {
      const x = p.lp[i * 3], y = p.lp[i * 3 + 1], z = p.lp[i * 3 + 2];
      const k = (p.start + i) * 3;
      P[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      tp.set(p.ln[i * 3], p.ln[i * 3 + 1], p.ln[i * 3 + 2]).applyQuaternion(o.quaternion);
      N[k] = tp.x;
      N[k + 1] = tp.y;
      N[k + 2] = tp.z;
    }
  }

  /** a step of laying a piece flat: turn it toward lying on a face, its lowest point on the floor */
  private settle(p: Piece, dt: number): void {
    const o = p.b.obj, b = p.b;
    tz.set(0, 0, 1).applyQuaternion(o.quaternion);
    const target = tz.y >= 0 ? UP : DOWN;
    tq.setFromUnitVectors(tz, target);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(tq.w)));
    const k = Math.min(1, dt * 12);
    o.quaternion.premultiply(tq.slerp(IDQ, 1 - k)).normalize();
    // slide to a stop
    o.position.x += b.v.x * dt;
    o.position.z += b.v.z * dt;
    b.v.multiplyScalar(Math.exp(-8 * dt));
    o.position.y += b.ground - this.lowestOf(p);
    if (ang * (1 - k) < 0.01) {
      b.state = "rest";
      b.v.set(0, 0, 0);
      b.w.set(0, 0, 0);
      p.settling = false;
    }
  }

  /** the lowest point of one piece as it stands now (world y) */
  private lowestOf(p: Piece): number {
    const o = p.b.obj;
    mtx.compose(o.position, o.quaternion, o.scale);
    const e = mtx.elements;
    let lo = Infinity;
    for (let i = 0; i < p.count; i++) lo = Math.min(lo, e[1] * p.lp[i * 3] + e[5] * p.lp[i * 3 + 1] + e[9] * p.lp[i * 3 + 2] + e[13]);
    return lo;
  }

  private collapse(p: Piece): void {
    (this.posAttr.array as Float32Array).fill(0, p.start * 3, (p.start + p.count) * 3);
  }

  /** every piece has come to rest (or gone): it can be kept */
  atRest(): boolean {
    return this.pieces.every((p) => p.phase === "gone" || (p.phase === "free" && p.b.state === "rest" && !p.settling));
  }

  /** where it lies: the middle of its pieces (world) */
  centre(): THREE.Vector3 {
    const c = new THREE.Vector3();
    let n = 0;
    for (const p of this.pieces) if (p.phase !== "gone") { c.add(p.b.obj.position); n++; }
    return n ? c.divideScalar(n) : c;
  }

  /** Put every piece where it came to rest (a restart: the wreckage made again from its
   *  cause, laid straight where it lay). `null` for a piece that had gone. */
  restAt(poses: ({ pos: THREE.Vector3; quat: THREE.Quaternion } | null)[]): void {
    this.pieces.forEach((p, i) => {
      const at = poses[i];
      if (!at) {
        p.phase = "gone";
        this.collapse(p);
        return;
      }
      p.b.obj.position.copy(at.pos);
      p.b.obj.quaternion.copy(at.quat);
      p.b.state = "rest";
      p.b.v.set(0, 0, 0);
      p.b.w.set(0, 0, 0);
      p.phase = "free";
      p.settling = false;
      this.write(p);
    });
    this.posAttr.needsUpdate = true;
    this.norAttr.needsUpdate = true;
  }

  /** pieces still in the room */
  get live(): number {
    return this.pieces.filter((p) => p.phase !== "gone").length;
  }

  /** every piece's pose and state, for the checks */
  poses(): { pos: THREE.Vector3; quat: THREE.Quaternion; phase: string; rest: boolean }[] {
    return this.pieces.map((p) => ({ pos: p.b.obj.position.clone(), quat: p.b.obj.quaternion.clone(), phase: p.phase, rest: p.b.state === "rest" }));
  }

  /** the lowest point of any piece still in the room (world y) */
  lowest(): number {
    const P = this.posAttr.array as Float32Array;
    let lo = Infinity;
    for (const p of this.pieces) {
      if (p.phase === "gone") continue;
      for (let i = p.start; i < p.start + p.count; i++) lo = Math.min(lo, P[i * 3 + 1]);
    }
    return lo;
  }

  /** poses, for the determinism check */
  snapshot(): string {
    return this.pieces.map((p) => `${p.b.obj.position.toArray().map((x) => x.toFixed(4))}`).join("|");
  }

  gpuBytes(): number {
    const g = this.mesh.geometry;
    let n = 0;
    for (const a of Object.values(g.attributes)) n += (a as THREE.BufferAttribute).array.byteLength;
    return n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

/** Every breaking event's pieces while they move: a few batches at most. WRECKAGE LASTS (Josh,
 *  Oct 23): a batch whose every piece has come to rest is merged into its room's kept layer
 *  (one draw a chunk) and its own mesh freed; a batch pushed out by a newer one is kept as it
 *  lies, never thrown away. */
export class DebrisPool {
  readonly group = new THREE.Group();
  readonly kept = new KeptLayer("wreck");
  private list: Debris[] = [];
  /** which room a point is in (the world says; "" when it doesn't) */
  roomAt: (p: THREE.Vector3) => string = () => "";
  /** told of each batch as it's made (the system stamps its cause) */
  onAdd?: (d: Debris) => void;
  /** told of each batch as it's kept (the ledger writes down where its pieces lay) */
  onKept?: (d: Debris) => void;

  constructor(readonly capacity = 8) {
    this.group.name = "fx-debris";
    this.group.add(this.kept.group);
  }

  add(d: Debris): void {
    if (this.list.length >= this.capacity) this.keep(this.list.shift()!);
    this.list.push(d);
    this.group.add(d.mesh);
    this.onAdd?.(d);
  }

  /** the batch made last (a replay takes it to lay it where it was) */
  get newest(): Debris | undefined {
    return this.list[this.list.length - 1];
  }

  /** Merge a batch, where its pieces are now, into its room's kept layer. */
  keep(d: Debris): void {
    const i = this.list.indexOf(d);
    if (i >= 0) this.list.splice(i, 1);
    const g = d.mesh.geometry;
    this.kept.add(this.roomAt(d.centre()), d.mesh.material as THREE.Material, g, 0, (g.getAttribute("position") as THREE.BufferAttribute).count);
    this.onKept?.(d);
    this.group.remove(d.mesh);
    d.dispose();
  }

  update(dt: number, probe?: SurfaceProbe): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      const alive = d.update(dt, probe);
      if (!alive) {
        this.group.remove(d.mesh);
        d.dispose();
        this.list.splice(i, 1);
      } else if (d.atRest()) this.keep(d);
    }
  }

  get batches(): readonly Debris[] {
    return this.list;
  }
  get draws(): number {
    return this.list.length + this.kept.draws;
  }
  get live(): number {
    return this.list.reduce((a, d) => a + d.live, 0);
  }
  gpuBytes(): number {
    return this.list.reduce((a, d) => a + d.gpuBytes(), 0) + this.kept.gpuBytes();
  }
  clear(): void {
    for (const d of this.list) {
      this.group.remove(d.mesh);
      d.dispose();
    }
    this.list = [];
    this.kept.clear();
  }
}

// ---- a door shaking in its frame -------------------------------------------------------

interface Rattle {
  base: { p: THREE.Vector3; q: THREE.Quaternion };
  stopped: boolean;
}
const rattling = new Map<THREE.Object3D, Rattle>();

/** Shake something nailed or hung in place (a door leaf, a plank): pushed `amp` metres
 *  along `push` (world) and back, its top rocking by `tilt` radians, dying away over
 *  `dur`. A new blow while it's still shaking starts again from where it hangs at rest. */
export function rattle(fx: FxSystem, obj: THREE.Object3D, push: THREE.Vector3, amp: number, tilt: number, dur: number, seed: number): void {
  const prev = rattling.get(obj);
  const base = prev ? prev.base : { p: obj.position.clone(), q: obj.quaternion.clone() };
  if (prev) prev.stopped = true;
  const r: Rattle = { base, stopped: false };
  rattling.set(obj, r);
  const d = push.clone().normalize();
  if (obj.parent) {
    obj.parent.updateMatrixWorld();
    d.transformDirection(new THREE.Matrix4().copy(obj.parent.matrixWorld).invert());
  }
  const axis = new THREE.Vector3(0, 1, 0).cross(d);
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  axis.normalize();
  const rng = mulberry32(seed);
  const f = range(rng, 8, 12), f2 = f * range(rng, 1.6, 2.3), ph2 = range(rng, 0, 6.28), w2 = range(rng, 0.15, 0.35);
  let t = 0;
  const q = new THREE.Quaternion();
  fx.emit((_ctx, dt) => {
    if (r.stopped) return false;
    t += dt;
    if (t >= dur) {
      obj.position.copy(base.p);
      obj.quaternion.copy(base.q);
      rattling.delete(obj);
      return false;
    }
    const env = Math.exp(-t * 7) * (1 - t / dur);
    // the first swing goes WITH the blow
    const s = Math.sin(2 * Math.PI * f * t) + w2 * Math.sin(2 * Math.PI * f2 * t + ph2);
    obj.position.copy(base.p).addScaledVector(d, amp * env * s);
    obj.quaternion.copy(base.q).premultiply(q.setFromAxisAngle(axis, tilt * env * Math.sin(2 * Math.PI * f * t + 0.5)));
    return true;
  }, seed ^ 0x5a5a);
}

/** Put everything still shaking back where it hangs (the show cleared, a scene reset). */
export function settleRattles(): void {
  for (const [obj, r] of rattling) {
    obj.position.copy(r.base.p);
    obj.quaternion.copy(r.base.q);
    r.stopped = true;
  }
  rattling.clear();
}

/** Something broke and is gone from where it stood: hide it, and the marks on it with it. */
function gone(fx: FxSystem, obj: THREE.Object3D): void {
  obj.visible = false;
  for (const d of fx.decalSets.values()) d.removeOn(obj);
  fx.onGone?.(obj, fx.now);
}

// ---- the door's frame of reference -----------------------------------------------------

export interface DoorFxP {
  /** the door's centre, world metres */
  at: THREE.Vector3;
  /** its facing: from room a into room b */
  normal: THREE.Vector3;
  /** width, height */
  size: [number, number];
  /** the side the blow came from along the normal (doors.ts `side`) */
  side: 1 | -1;
  material?: "wood" | "metal" | "glass";
  floorY?: number;
  /** the door's own leaf, to shake (and to hide when it bursts) */
  leaf?: THREE.Object3D;
  /** a glass door's pane, if separate from the leaf (cracks land on it) */
  pane?: THREE.Object3D;
  /** a door with glass only in its windows (the lab doors): each window. A blow on it lands
   *  on the nearest, and only that one shatters — its own size, where it is */
  panes?: THREE.Object3D[];
  /** the planks nailed across it (barricade()), outermost last */
  planks?: THREE.Object3D[];
  /** door.broken: what it had left before the last blow */
  lastHp?: number;
  /** where the blow landed; picked from the seed if not given */
  strike?: THREE.Vector3;
}

interface Frame {
  n: THREE.Vector3;
  u: THREE.Vector3;
  w: number;
  h: number;
  floorY: number;
  /** out the far side, where the debris goes */
  far: THREE.Vector3;
  /** back toward whoever struck it */
  near: THREE.Vector3;
  strike: THREE.Vector3;
  basis: THREE.Quaternion;
  /** a door with glass windows: the struck one, its glass as a rectangle in the frame's own
   *  (u, y) about `glassAt` (a point in the glass's plane, level with the door's centre) */
  window?: { pane: THREE.Object3D; rect: [number, number, number, number]; glassAt: THREE.Vector3; round: boolean };
}

function frameOf(p: DoorFxP, rng: Rng): Frame {
  const n = p.normal.clone().setY(0).normalize();
  const u = UP.clone().cross(n).normalize();
  const [w, h] = p.size;
  const floorY = p.floorY ?? p.at.y - h / 2;
  const far = n.clone().multiplyScalar(-p.side);
  const near = far.clone().negate();
  // a zombie's blows land at chest height, somewhere across the middle of the door
  const strike = p.strike?.clone() ?? p.at.clone().addScaledVector(u, range(rng, -0.28, 0.28) * w).setY(floorY + range(rng, 1.05, 1.5)).addScaledVector(near, 0.025);
  const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, UP, n));
  const f: Frame = { n, u, w, h, floorY, far, near, strike, basis };
  // a glass door whose glass is only in its windows: the blow lands on the window nearest it
  if (p.material === "glass" && p.panes?.length) {
    let best = Infinity;
    for (const pane of p.panes) {
      if (!pane.visible || !pane.parent) continue;
      pane.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(pane);
      if (box.isEmpty()) continue;
      const d = box.distanceToPoint(strike);
      if (d >= best) continue;
      best = d;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, depth = 0;
      const c = v3();
      for (let k = 0; k < 8; k++) {
        c.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(p.at);
        const x = c.dot(u), y = c.y;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        depth += c.dot(n) / 8;
      }
      const inset = 0.004;
      // (a round window is a square of glass with a round hole in its texture: the anchors mark
      // it, and its shards are cut to the circle)
      f.window = { pane, rect: [x0 + inset, y0 + inset, x1 - inset, y1 - inset], glassAt: p.at.clone().addScaledVector(n, depth), round: !!pane.userData.fxRound };
    }
    if (f.window && !p.strike) {
      const [a, b, c2, d] = f.window.rect;
      f.strike = f.window.glassAt.clone().addScaledVector(u, range(rng, a + 0.25 * (c2 - a), c2 - 0.25 * (c2 - a))).add(new THREE.Vector3(0, range(rng, b + 0.25 * (d - b), d - 0.25 * (d - b)), 0)).addScaledVector(near, 0.025);
    }
  }
  return f;
}

const WISPS = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"];
// dust is only seen because it catches the light: tinted well above the walls it drifts past
const DUST: C3 = [1.25, 1.2, 1.1];

/** Dust shaken out of the frame: specks trickling from the lintel down both faces, a little
 *  down the jambs, and a soft haze drifting off the top. `amount` 0..1+. */
function shedDust(ctx: EffectContext, f: Frame, at: THREE.Vector3, amount: number, color: C3 = DUST): void {
  const { fx, rng } = ctx;
  const top = at.y + f.h / 2;
  const specks = Math.round(range(rng, 18, 28) * amount);
  for (let i = 0; i < specks; i++) {
    const onJamb = rng() < 0.25;
    const pos = at.clone()
      .addScaledVector(f.u, onJamb ? (rng() < 0.5 ? -1 : 1) * f.w / 2 : range(rng, -0.5, 0.5) * f.w)
      .addScaledVector(f.n, (rng() < 0.5 ? -1 : 1) * range(rng, 0.03, 0.09));
    pos.y = onJamb ? range(rng, f.floorY + 0.6, top) : top - range(rng, 0, 0.03);
    fx.spawn("sprites", {
      pos, vel: new THREE.Vector3(range(rng, -0.05, 0.05), -range(rng, 0.05, 0.5), range(rng, -0.05, 0.05)),
      life: range(rng, 1.4, 2.8), delay: range(rng, 0, 0.25), size: [range(rng, 0.008, 0.02), range(rng, 0.006, 0.015)],
      rot: range(rng, 0, 6.28), spin: range(rng, -3, 3), frame: { kind: "fixed", frame: pick(rng, [SPRITE.chip, SPRITE.mote]) },
      color, glow: 0.3, gravity: 2.2, drag: 2.2, floorY: f.floorY, bounce: 0.05, fadeIn: 0, fadeOut: 0.3,
    });
  }
  const wisps = WISPS.filter((s) => fx.has(s));
  const hazes = Math.round(range(rng, 1, 3) * amount);
  for (let i = 0; i < hazes && wisps.length; i++) {
    const pos = at.clone().addScaledVector(f.u, range(rng, -0.45, 0.45) * f.w).addScaledVector(f.n, (rng() < 0.5 ? -1 : 1) * 0.07).setY(top - 0.05);
    fx.spawn(pick(rng, wisps), {
      pos, vel: new THREE.Vector3(0, -range(rng, 0.05, 0.18), 0).addScaledVector(f.n, range(rng, -0.08, 0.08)), life: range(rng, 2.2, 3.5),
      delay: range(rng, 0, 0.2), size: [0.3 * amount, range(rng, 0.6, 0.85) * amount], rot: range(rng, 0, 6.28), spin: range(rng, -0.3, 0.3),
      color: lift(color, 1.15), alpha: 0.35, glow: 0.45, drag: 1.5, gravity: 0.02, fadeIn: 0.1, fadeOut: 0.6, frame: { kind: "life", from: Math.floor(range(rng, 14, 22)) },
    });
  }
  // the blow drives the air out round the leaf: dust puffs out of the gap at its top and
  // its sides, on both faces
  const puffs = Math.round(range(rng, 5, 8) * Math.min(1.4, amount));
  for (let i = 0; i < puffs; i++) {
    const edge = rng();
    const out = v3(), pos = at.clone();
    if (edge < 0.55) {
      pos.addScaledVector(f.u, range(rng, -0.45, 0.45) * f.w).setY(top - 0.01);
      out.set(0, 1, 0);
    } else {
      const s = edge < 0.78 ? -1 : 1;
      pos.addScaledVector(f.u, s * f.w / 2).setY(range(rng, f.floorY + 0.3, top - 0.1));
      out.copy(f.u).multiplyScalar(s);
    }
    const face = rng() < 0.5 ? f.near : f.far;
    pos.addScaledVector(face, 0.03);
    const vel = out.multiplyScalar(range(rng, 0.12, 0.4)).addScaledVector(face, range(rng, 0.2, 0.5)).add(new THREE.Vector3(0, -0.06, 0));
    if (wisps.length) {
      fx.spawn(pick(rng, wisps), {
        pos, vel, life: range(rng, 1.4, 2.4), size: [range(rng, 0.12, 0.2), range(rng, 0.35, 0.55)], rot: range(rng, 0, 6.28), spin: range(rng, -0.5, 0.5),
        color: lift(color, 1.2), alpha: 0.4 * Math.min(1.2, amount), glow: 0.45, drag: 2.6, gravity: 0.05, fadeIn: 0.02, fadeOut: 0.65, frame: { kind: "life", from: Math.floor(range(rng, 12, 20)) },
      });
    }
  }
  // and a thin curtain of it falling off the lintel down each face
  for (const face of [f.near, f.far]) {
    if (!wisps.length || rng() > 0.4 + amount * 0.4) continue;
    fx.spawn(pick(rng, wisps), {
      pos: at.clone().addScaledVector(face, 0.06).setY(top - 0.25), vel: new THREE.Vector3(0, -range(rng, 0.12, 0.25), 0).addScaledVector(face, 0.05),
      life: range(rng, 2, 3), delay: range(rng, 0.05, 0.2), size: [f.w * 0.9, f.w * range(rng, 1.4, 1.9)], rot: range(rng, -0.15, 0.15), spin: range(rng, -0.1, 0.1),
      color: lift(color, 1.15), alpha: 0.22 * Math.min(1.2, amount), glow: 0.45, drag: 1.2, gravity: 0, fadeIn: 0.15, fadeOut: 0.6, frame: { kind: "life", from: Math.floor(range(rng, 14, 22)) },
    });
  }
}

const lift = (c: C3, k: number): C3 => [c[0] * k, c[1] * k, c[2] * k];

/** Bits knocked off where the blow landed: `frame` sprites back toward the striker. */
function knock(ctx: EffectContext, f: Frame, frame: number, color: C3, count: number, size: [number, number], dir = f.near, glint = 0): void {
  const { fx, rng } = ctx;
  for (let i = 0; i < count; i++) {
    const sz = range(rng, size[0], size[1]);
    fx.spawn("sprites", {
      pos: f.strike, vel: inCone(rng, dir, 0.9, v3()).multiplyScalar(range(rng, 0.8, 2.8)), life: range(rng, 0.8, 1.6),
      size: [sz, sz], rot: range(rng, 0, 6.28), spin: range(rng, -14, 14), frame: { kind: "fixed", frame }, color, glow: glint,
      gravity: 9.8, drag: 0.8, floorY: f.floorY, bounce: 0.2, fadeIn: 0, fadeOut: 0.25,
    });
  }
}

// ---- a blow on a door ------------------------------------------------------------------

/** door.hit / door.banged: the leaf jolts in its frame and the frame sheds dust. Wood
 *  sheds paint and splinters where it's struck; steel only booms and drops rust and
 *  grit; glass rattles and cracks a little more each time. */
export const doorHit = (ctx: EffectContext, p: DoorFxP): void => {
  const { fx, rng } = ctx;
  const f = frameOf(p, rng);
  const mat = p.material ?? "wood";
  const seed = Math.floor(rng() * 2 ** 31);
  if (p.planks?.length) return barricadeHit(ctx, p, f);
  if (mat === "metal") {
    if (p.leaf) rattle(fx, p.leaf, f.far, range(rng, 0.0012, 0.0022), 0.0008, 0.35, seed);
    shedDust(ctx, f, p.at, range(rng, 0.9, 1.3), [1.1, 1.08, 1.04]);
    knock(ctx, f, SPRITE.chip, [0.42, 0.3, 0.2], Math.round(range(rng, 2, 5)), [0.004, 0.009]);
    return;
  }
  if (mat === "glass") {
    if (p.leaf) rattle(fx, p.leaf, f.far, range(rng, 0.003, 0.006), 0.002, 0.4, seed);
    glassCrack(ctx, f, p);
    return;
  }
  if (p.leaf) rattle(fx, p.leaf, f.far, range(rng, 0.006, 0.012), range(rng, 0.003, 0.006), 0.55, seed);
  shedDust(ctx, f, p.at, range(rng, 0.7, 1.1));
  knock(ctx, f, SPRITE.chip, [0.66, 0.63, 0.57], Math.round(range(rng, 3, 7)), [0.005, 0.012]);
  knock(ctx, f, SPRITE.splinter, [0.62, 0.48, 0.32], Math.round(range(rng, 1, 4)), [0.015, 0.035]);
};

/** a crack star on the pane where it was struck, a few slivers falling */
function glassCrack(ctx: EffectContext, f: Frame, p: DoorFxP): void {
  const { fx, rng } = ctx;
  if (fx.decalSets.has("holes")) {
    const hit = fx.hit(f.strike.clone().addScaledVector(f.near, 0.15), f.far, 0.4);
    if (hit) fx.decal("holes", { target: hit.mesh, pos: hit.point, normal: hit.normal, size: range(rng, 0.18, 0.34), spin: range(rng, 0, 6.28), cell: holeCell(fx, "glass", rng), depth: 0.1 });
  }
  knock(ctx, f, SPRITE.shard, [0.8, 0.9, 0.92], Math.round(range(rng, 2, 6)), [0.008, 0.02], f.near, 0.3);
  void p;
}

/** A blow on a barricaded door: the planks take it. They jolt, the struck one most;
 *  splinters and dust come off it on the survivors' side; the frame sheds. */
function barricadeHit(ctx: EffectContext, p: DoorFxP, f: Frame): void {
  const { fx, rng } = ctx;
  const planks = p.planks!;
  // the plank nearest the blow takes it
  let struck = planks[0], best = Infinity;
  for (const pl of planks) {
    const d = Math.abs(pl.getWorldPosition(v3()).y - f.strike.y);
    if (d < best) {
      best = d;
      struck = pl;
    }
  }
  for (const pl of planks) rattle(fx, pl, f.far, pl === struck ? range(rng, 0.008, 0.014) : range(rng, 0.002, 0.004), pl === struck ? 0.01 : 0.003, 0.45, Math.floor(rng() * 2 ** 31));
  if (p.leaf) rattle(fx, p.leaf, f.far, range(rng, 0.003, 0.006), 0.002, 0.45, Math.floor(rng() * 2 ** 31));
  shedDust(ctx, f, p.at, range(rng, 0.8, 1.2));
  // splinters off the struck plank's face, out into the room it guards
  const at = struck.getWorldPosition(v3());
  const info = plankInfo(struck);
  const along = v3().setFromMatrixColumn(struck.matrixWorld, 0).normalize();
  for (let i = 0; i < Math.round(range(rng, 4, 9)); i++) {
    const pos = at.clone().addScaledVector(along, range(rng, -0.4, 0.4) * (info?.len ?? 1)).addScaledVector(f.far, 0.02);
    const sz = range(rng, 0.015, 0.045);
    fx.spawn("sprites", {
      pos, vel: inCone(rng, f.far, 0.8, v3()).multiplyScalar(range(rng, 0.6, 2.2)), life: range(rng, 0.8, 1.6), size: [sz, sz],
      rot: range(rng, 0, 6.28), spin: range(rng, -12, 12), frame: { kind: "fixed", frame: SPRITE.splinter }, color: [0.6, 0.47, 0.33],
      gravity: 9.8, drag: 0.8, floorY: f.floorY, bounce: 0.2, fadeIn: 0, fadeOut: 0.25,
    });
  }
  // and the dust jarred out at its nails
  nailPuffs(ctx, struck, f, 0.6);
}

// ---- planks --------------------------------------------------------------------------

interface PlankInfo {
  len: number;
  wide: number;
  thick: number;
  /** its nails, in its own frame */
  nails: V2[];
}
const plankInfo = (o: THREE.Object3D): PlankInfo | null => (o.userData.plank as PlankInfo) ?? null;

const PLANK_FACE: C3 = [0.95, 0.9, 0.84];
const PLANK_EDGE: C3 = [1.1, 1.0, 0.9];
const NAIL: C3 = [0.12, 0.11, 0.1];

/** One plank's slab in its own frame: x along it, y across, z out of the door. `cut` gives
 *  it a torn end instead of a sawn one ([at x, which way the piece runs]). */
function plankSlab(kit: BreakKit, len: number, wide: number, thick: number, rng: Rng, from: number, to: number, torn: { start?: boolean; end?: boolean } = {}): Slab {
  const look = woodLook(kit, "bare", "x", PLANK_FACE, PLANK_EDGE);
  const teeth = (x: number, dir: number): V2[] => {
    // fibres pull out in long splinters: a ragged line across the plank, long teeth along it
    const k = Math.round(range(rng, 4, 7));
    const out: V2[] = [];
    for (let i = 0; i <= k; i++) {
      const y = wide / 2 - (i / k) * wide;
      out.push([x + dir * range(rng, -0.01, 0.07) * (i % 2 ? 1 : 0.4), y]);
    }
    return out;
  };
  const poly: V2[] = [];
  const x0 = from - (from + to) / 2, x1 = to - (from + to) / 2, ox = (from + to) / 2;
  // bottom edge left to right, the end, top edge right to left, the start
  poly.push([x0, -wide / 2], [x1, -wide / 2]);
  if (torn.end) poly.push(...teeth(x1, 1).reverse());
  poly.push([x1, wide / 2], [x0, wide / 2]);
  if (torn.start) poly.push(...teeth(x0, -1));
  return slab(dedupe(poly), thick, look, ox, 0);
}

function dedupe(p: V2[]): V2[] {
  return p.filter((q, i) => {
    const r = p[(i + 1) % p.length];
    return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-4;
  });
}

/** Nail heads: little dark squares on the plank's face. */
function nailHeads(nails: V2[], thick: number, out: Slab): void {
  const s = 0.009;
  const look: SlabLook = { face: () => [0.25, 0.5], edge: () => [0.25, 0.5], faceColor: NAIL, edgeColor: NAIL };
  for (const [x, y] of nails) {
    const piece = slab([[-s, -s], [s, -s], [s, s], [-s, s]], 0.004, look);
    for (let i = 0; i < piece.pos.length; i += 3) {
      piece.pos[i] += x;
      piece.pos[i + 1] += y;
      piece.pos[i + 2] += thick / 2 + 0.0015;
    }
    out.pos.push(...piece.pos);
    out.nor.push(...piece.nor);
    out.uv.push(...piece.uv);
    out.col.push(...piece.col);
  }
}

/** iron straps over each end of a reinforced plank, just inside the jambs (its true ends run
 *  behind the frame, where straps would never be seen): a flat band wrapping its face, bolted
 *  through twice. Drawn into the plank's own mesh like its nails
 *  (vertex-coloured), so it comes and goes with the plank and costs no draw of its own. */
const IRON: C3 = [0.2, 0.18, 0.16];
function straps(inner: number, wide: number, thick: number, rng: Rng, out: Slab): V2[] {
  const look: SlabLook = { face: () => [0.25, 0.5], edge: () => [0.25, 0.5], faceColor: IRON, edgeColor: IRON };
  const bolts: V2[] = [];
  for (const end of [-1, 1]) {
    const cx = end * (inner - range(rng, 0.045, 0.07)), half = range(rng, 0.024, 0.03);
    const piece = slab([[cx - half, -wide / 2 - 0.006], [cx + half, -wide / 2 - 0.006], [cx + half, wide / 2 + 0.006], [cx - half, wide / 2 + 0.006]], 0.003, look);
    for (let i = 0; i < piece.pos.length; i += 3) piece.pos[i + 2] += thick / 2 + 0.0012;
    out.pos.push(...piece.pos);
    out.nor.push(...piece.nor);
    out.uv.push(...piece.uv);
    out.col.push(...piece.col);
    bolts.push([cx, wide * 0.27], [cx, -wide * 0.27]);
  }
  return bolts;
}

const geomOf = (s: Slab) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(s.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(s.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(s.col, 3));
  return g;
};

export interface BarricadeP {
  at: THREE.Vector3;
  normal: THREE.Vector3;
  size: [number, number];
  /** which side of the door the planks are nailed on, along the normal */
  side: 1 | -1;
  floorY?: number;
  /** half the door leaf's thickness, so the planks sit on its face */
  leafHalf?: number;
  /** a REINFORCED barricade (Josh, Oct 23: its planks hold double): iron straps over each
   *  plank's ends, bolted through, and more nails */
  reinforced?: boolean;
}

/** The planks across a barricaded door, as meshes (one each — a plank must be able to go on
 *  its own), laid out from the DOOR's seed so every observer nails them in the same places:
 *  the i-th plank always goes at the i-th height with the i-th tilt. */
export function barricade(kit: BreakKit, p: BarricadeP, count: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "barricade";
  const rng = mulberry32(seed);
  const n = p.normal.clone().setY(0).normalize(), u = UP.clone().cross(n).normalize();
  const [w, h] = p.size;
  const floorY = p.floorY ?? p.at.y - h / 2;
  const heights = [0.71, 0.29, 0.5];
  for (let i = 0; i < Math.min(count, 3); i++) {
    const r = mulberry32(seed + i * 7919);
    const len = w + range(r, 0.26, 0.4), wide = range(r, 0.13, 0.17), thick = 0.024;
    const tilt = (i % 2 ? -1 : 1) * range(r, 0.06, 0.2);
    const nails: V2[] = [[-len / 2 + 0.07, 0.03], [-len / 2 + 0.075, -0.03], [len / 2 - 0.07, 0.025], [len / 2 - 0.08, -0.03]];
    const s = plankSlab(kit, len, wide, thick, r, -len / 2, len / 2);
    nailHeads(nails, thick, s);
    if (p.reinforced) {
      // (drawn from a separate rng, so an ordinary barricade from the same seed lays out exactly
      // as it always did). The bolts sit on the straps; two more nails go in nearer the middle
      const sr = mulberry32(seed + i * 7919 + 0x5eed);
      const bolts = straps(w / 2, wide, thick, sr, s);
      nailHeads(bolts, thick + 0.006, s);
      const more: V2[] = [[-len / 2 + 0.16, 0.02], [len / 2 - 0.16, -0.02]];
      nailHeads(more, thick, s);
      nails.push(...bolts, ...more);
    }
    const mesh = new THREE.Mesh(geomOf(s), kit.wood);
    mesh.name = `plank-${i}`;
    const off = (p.leafHalf ?? 0.022) + thick / 2 + 0.002 + i * 0.004;
    mesh.position.copy(p.at).addScaledVector(n, p.side * off).addScaledVector(u, range(r, -0.03, 0.03)).setY(floorY + h * heights[i]);
    // x along the plank (across the door, tilted), z out of the door toward the planks' side
    const z = n.clone().multiplyScalar(p.side);
    const x = u.clone().multiplyScalar(p.side).applyAxisAngle(z, tilt);
    const y = z.clone().cross(x);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    mesh.userData.plank = { len, wide, thick, nails } satisfies PlankInfo;
    if (p.reinforced) mesh.userData.reinforced = true;
    g.add(mesh);
  }
  void rng;
  return g;
}

/** a puff of dust at each nail of a plank (nailed on, prised off, or jarred by a blow) */
function nailPuffs(ctx: EffectContext, plank: THREE.Object3D, f: Frame, amount: number): void {
  const { fx, rng } = ctx;
  const info = plankInfo(plank);
  if (!info) return;
  plank.updateMatrixWorld();
  const out = v3().setFromMatrixColumn(plank.matrixWorld, 2).normalize();
  for (const [x, y] of info.nails) {
    if (rng() > 0.4 + amount * 0.5) continue;
    const pos = new THREE.Vector3(x, y, info.thick / 2).applyMatrix4(plank.matrixWorld);
    for (let i = 0; i < 3; i++) {
      fx.spawn("sprites", {
        pos, vel: inCone(rng, out, 1.1, v3()).multiplyScalar(range(rng, 0.1, 0.5)), life: range(rng, 0.8, 1.6), size: [range(rng, 0.03, 0.06), range(rng, 0.08, 0.14)],
        rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.puff }, color: DUST, alpha: 0.35 * amount, drag: 3, gravity: 0.15, fadeIn: 0, fadeOut: 0.7,
      });
    }
    fx.spawn("sprites", {
      pos, vel: inCone(rng, out, 0.9, v3()).multiplyScalar(range(rng, 0.5, 1.5)), life: 1, size: [0.006, 0.006], frame: { kind: "fixed", frame: SPRITE.chip },
      color: [0.6, 0.5, 0.38], gravity: 9.8, drag: 0.6, floorY: f.floorY, bounce: 0.2, fadeIn: 0, fadeOut: 0.3,
    });
  }
}

export interface PlankBreakP {
  plank: THREE.Object3D;
  /** the way the blow pushed it: out of the door, into the room it guarded */
  push: THREE.Vector3;
  floorY: number;
  /** how it goes; picked from the seed if not given */
  mode?: "snap" | "tear" | "rip";
}

/** A plank giving way: it SNAPS in two (each half swinging down on its nails, then
 *  dropping), its nails TEAR out at one end (it swings down from the other and hangs
 *  there a moment before it goes), or it's RIPPED off whole. */
export const plankBreak = (ctx: EffectContext, p: PlankBreakP): void => {
  const { fx, rng } = ctx;
  const kit = fx.breaking;
  const info = plankInfo(p.plank);
  if (!kit || !info) return;
  p.plank.updateMatrixWorld();
  const pos0 = p.plank.getWorldPosition(v3()), q0 = p.plank.getWorldQuaternion(new THREE.Quaternion());
  gone(fx, p.plank);
  const mode = p.mode ?? (rng() < 0.4 ? "snap" : rng() < 0.67 ? "tear" : "rip");
  const { len, wide, thick } = info;
  const axisZ = v3().set(0, 0, 1).applyQuaternion(q0);
  const push = p.push.clone().normalize();
  const specs: PieceSpec[] = [];
  const f: Frame = { n: axisZ, u: v3().set(1, 0, 0).applyQuaternion(q0), w: len, h: 0, floorY: p.floorY, far: push, near: push.clone().negate(), strike: pos0, basis: q0 };

  /** a piece hinged on the nail at local x = `nailX` (the free part on the other side), swinging
   *  down and hanging for `hang` seconds before it lets go */
  const swing = (pieceX: number, nailX: number, farX: number, hang: number): PieceSpec["hold"] => {
    const pivot = new THREE.Vector3(nailX, 0, 0).applyQuaternion(q0).add(pos0);
    const start = new THREE.Vector3(pieceX, 0, 0).applyQuaternion(q0).add(pos0);
    // which way round the nail brings the free end down
    const free = new THREE.Vector3(pieceX - nailX, 0, 0).applyQuaternion(q0);
    const down = new THREE.Vector3(0, -1, 0);
    let target = Math.atan2(free.clone().cross(down).dot(axisZ), free.dot(down)) * 0.92;
    // a long plank low on the door can't hang straight down: it swings till its end meets the
    // floor and rests there, leaning
    const tip = new THREE.Vector3(farX - nailX, 0, 0).applyQuaternion(q0);
    const qq = new THREE.Quaternion();
    for (let i = 1; i <= 60; i++) {
      const a = (target * i) / 60;
      const y = pivot.y + tip.clone().applyQuaternion(qq.setFromAxisAngle(axisZ, a)).y;
      if (y < p.floorY + wide / 2 + 0.02) {
        target = (target * (i - 1)) / 60;
        break;
      }
    }
    const k = range(rng, 5, 8), wob = range(rng, 0.12, 0.25);
    const qa = new THREE.Quaternion();
    return (t, pos, quat) => {
      // a damped swing toward hanging straight down, overshooting once or twice
      // (a swing that stops on the floor bounces, it doesn't overshoot through it)
      let a = target * (1 - Math.exp(-t * k) * Math.cos(t * k * 1.3)) + wob * Math.exp(-t * 2.5) * Math.sin(t * 9) * Math.sign(target);
      if (Math.abs(a) > Math.abs(target)) a = target - (a - target) * 0.3;
      qa.setFromAxisAngle(axisZ, a);
      pos.copy(start).sub(pivot).applyQuaternion(qa).add(pivot);
      quat.copy(q0).premultiply(qa);
      return t < hang;
    };
  };

  if (mode === "snap") {
    const c = range(rng, -0.18, 0.18) * len;
    const left = plankSlab(kit, len, wide, thick, rng, -len / 2, c, { end: true });
    const right = plankSlab(kit, len, wide, thick, rng, c, len / 2, { start: true });
    const lx = (-len / 2 + c) / 2, rx = (c + len / 2) / 2;
    const first = rng() < 0.5;
    for (const [sl, x, nail] of [[left, lx, -len / 2 + 0.07], [right, rx, len / 2 - 0.07]] as const) {
      const quick = (x < 0) === first;
      specs.push({
        slab: sl, pos: new THREE.Vector3(x, 0, 0).applyQuaternion(q0).add(pos0), quat: q0.clone(), vel: v3(), spin: v3(),
        hold: swing(x, nail, c, quick ? range(rng, 0.25, 0.6) : range(rng, 1.2, 3.5)), seed: Math.floor(rng() * 2 ** 31), restitution: 0.25,
      });
    }
    // the break throws splinters and a few long slivers out of the room-side face
    const at = new THREE.Vector3(c, 0, 0).applyQuaternion(q0).add(pos0);
    splinterBurst(ctx, at, push, p.floorY, 0.6, specs, q0);
  } else if (mode === "tear") {
    const end = rng() < 0.5 ? 1 : -1;
    const sl = plankSlab(kit, len, wide, thick, rng, -len / 2, len / 2);
    specs.push({ slab: sl, pos: pos0.clone(), quat: q0.clone(), vel: v3(), spin: v3(), hold: swing(0, -end * (len / 2 - 0.07), end * len / 2, range(rng, 0.8, 4)), seed: Math.floor(rng() * 2 ** 31), restitution: 0.25 });
  } else {
    const sl = plankSlab(kit, len, wide, thick, rng, -len / 2, len / 2);
    specs.push({
      slab: sl, pos: pos0.clone(), quat: q0.clone(), vel: inCone(rng, push, 0.4, v3()).multiplyScalar(range(rng, 1.2, 2.6)).add(new THREE.Vector3(0, range(rng, 0.3, 1.2), 0)),
      spin: new THREE.Vector3(range(rng, -3, 3), range(rng, -5, 5), range(rng, -3, 3)), seed: Math.floor(rng() * 2 ** 31), restitution: 0.25,
    });
  }
  fx.breaks.add(new Debris(kit.wood, specs, p.floorY));
  nailPuffs(ctx, p.plank, f, 1);
};

/** splinter sprites and a few real slivers thrown from a break at `at` along `dir` */
function splinterBurst(ctx: EffectContext, at: THREE.Vector3, dir: THREE.Vector3, floorY: number, amount: number, specs: PieceSpec[], q: THREE.Quaternion): void {
  const { fx, rng } = ctx;
  for (let i = 0; i < Math.round(range(rng, 10, 18) * amount); i++) {
    const sz = range(rng, 0.02, 0.06);
    fx.spawn("sprites", {
      pos: at, vel: inCone(rng, dir, 1.0, v3()).multiplyScalar(range(rng, 1, 4) * amount), life: range(rng, 0.9, 1.8), size: [sz, sz],
      rot: range(rng, 0, 6.28), spin: range(rng, -14, 14), frame: { kind: "fixed", frame: SPRITE.splinter }, color: [0.68, 0.53, 0.37],
      gravity: 9.8, drag: 0.7, floorY, bounce: 0.2, fadeIn: 0, fadeOut: 0.2,
    });
  }
  const kit = fx.breaking!;
  const look = woodLook(kit, "bare", "x", [1.35, 1.22, 1.08], [1.45, 1.3, 1.15]);
  for (let i = 0; i < Math.round(range(rng, 2, 5) * amount * 1.6); i++) {
    const l = range(rng, 0.08, 0.3), wd = range(rng, 0.008, 0.02);
    // a sliver: long, tapering to a point at one end
    const sl = slab([[-l / 2, -wd / 2], [l / 2, -wd * 0.1], [l / 2, wd * 0.1], [-l / 2, wd / 2]], range(rng, 0.004, 0.01), look, range(rng, -0.5, 0.5), 0);
    const qq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), range(rng, -0.5, 0.5)));
    specs.push({
      slab: sl, pos: at.clone().add(new THREE.Vector3(range(rng, -0.04, 0.04), range(rng, -0.04, 0.04), range(rng, -0.04, 0.04))), quat: qq,
      vel: inCone(rng, dir, 0.9, v3()).multiplyScalar(range(rng, 1.2, 4) * amount).add(new THREE.Vector3(0, range(rng, 0, 1), 0)),
      spin: new THREE.Vector3(range(rng, -14, 14), range(rng, -14, 14), range(rng, -14, 14)), seed: Math.floor(rng() * 2 ** 31), restitution: 0.3, keep: 180,
    });
  }
}

/** door.barricade: a plank nailed on — a jolt and dust at each nail. */
export const plankNailed = (ctx: EffectContext, p: { plank: THREE.Object3D; floorY: number }): void => {
  const { fx, rng } = ctx;
  const out = v3().setFromMatrixColumn(p.plank.matrixWorld, 2).normalize();
  rattle(fx, p.plank, out.clone().negate(), 0.004, 0.004, 0.3, Math.floor(rng() * 2 ** 31));
  nailPuffs(ctx, p.plank, { n: out, u: out, w: 0, h: 0, floorY: p.floorY, far: out, near: out, strike: p.plank.position, basis: p.plank.quaternion }, 1);
};

// ---- a door bursting ------------------------------------------------------------------

/** door.broken on a wooden door: it bursts out of its frame into long panels split along
 *  the grain and a spray of splinters, out the far side; the pieces on the hinge side
 *  sag a moment before they go. How violently goes with how much was left of it when
 *  the last blow landed (a door nearly gone gives in; a full door blown in flies). */
export const doorBurst = (ctx: EffectContext, p: DoorFxP): void => {
  const { fx, rng } = ctx;
  const kit = fx.breaking;
  const f = frameOf(p, rng);
  if (p.material === "glass") return glassShatter(ctx, p);
  if (!kit) return;
  if (p.leaf) gone(fx, p.leaf);
  for (const pl of p.planks ?? []) gone(fx, pl);
  const v = Math.max(0.45, Math.min(1.5, (p.lastHp ?? 60) / 90));
  const thick = 0.044;
  const rect: [number, number, number, number] = [-f.w / 2, -f.h / 2, f.w / 2, f.h / 2];
  // the blow's place on the leaf, and seeds scattered round it, thicker near it
  const sx = f.strike.clone().sub(p.at).dot(f.u), sy = f.strike.y - p.at.y;
  const seeds: V2[] = [];
  const count = Math.round(range(rng, 9, 13));
  for (let i = 0; i < count; i++) {
    const near = rng() < 0.55;
    seeds.push(near ? [sx + range(rng, -0.16, 0.16), sy + range(rng, -0.35, 0.35)] : [range(rng, -0.48, 0.48) * f.w, range(rng, -0.48, 0.48) * f.h]);
  }
  const hinge = rng() < 0.5 ? -1 : 1;
  const look = woodLook(kit, "painted", "y", [0.9, 0.88, 0.85]);
  const specs: PieceSpec[] = [];
  for (const cell of voronoi(rect, seeds, 3.2)) {
    const poly = jag(cell, rect, rng, 0.035, 0.035, "y");
    if (area(poly) < 0.002) continue;
    const [cx, cy] = centroid(poly);
    const local = poly.map(([x, y]): V2 => [x - cx, y - cy]);
    const sl = slab(local, thick, look, cx, cy);
    const pos = p.at.clone().addScaledVector(f.u, cx).add(new THREE.Vector3(0, cy, 0));
    const dist = Math.hypot(cx - sx, (cy - sy) * 0.6);
    const hit = Math.exp(-dist / 0.45);
    // the hinge side's pieces sag and drop late; the rest go with the blow
    const onHinge = cx * hinge > f.w * 0.18 && rng() < 0.7;
    specs.push({
      slab: sl, pos, quat: f.basis.clone(),
      vel: f.far.clone().multiplyScalar(range(rng, 0.6, 1.4) * v * (0.8 + 3 * hit)).addScaledVector(f.u, (cx - sx) * range(rng, 0.6, 1.8) * v).add(new THREE.Vector3(0, range(rng, -0.2, 0.9) * v, 0)),
      spin: new THREE.Vector3(range(rng, -3, 3), range(rng, -2, 2), range(rng, -3, 3)).multiplyScalar(v * (0.5 + hit)),
      delay: onHinge ? range(rng, 0.25, 2.2) : 0, seed: Math.floor(rng() * 2 ** 31), restitution: 0.2, keep: 300,
    });
  }
  splinterBurst(ctx, f.strike.clone().addScaledVector(f.far, 0.05), f.far, f.floorY, v * 1.2, specs, f.basis);
  fx.breaks.add(new Debris(kit.wood, specs, f.floorY));
  // the dust it was holding, all at once
  shedDust(ctx, f, p.at, 1.8 * v);
  if (fx.has("dust-impact")) {
    const w = 1.4 * v, asp = fx.layer("dust-impact").sheet.aspect;
    fx.spawn("dust-impact", {
      pos: p.at.clone().addScaledVector(f.far, 0.4).setY(f.floorY + w * asp * 0.42), life: 3.2, size: [w, w], color: [0.6, 0.57, 0.52], alpha: 0.5,
      fadeIn: 0, fadeOut: 0.5, frame: { kind: "life", from: 6 }, soft: [f.floorY, 0.3],
    });
  }
  knock(ctx, f, SPRITE.chip, [0.66, 0.63, 0.57], Math.round(range(rng, 10, 18) * v), [0.006, 0.016], f.far);
  fx.shake(f.strike, 0.012 * v, 6, 0.3, Math.floor(rng() * 2 ** 31));
};

// ---- glass ----------------------------------------------------------------------------

/** A shard cut to the ellipse inside `rect` (a round window): the polygon clipped against the
 *  ellipse's edge, approximated by 48 sides (Sutherland-Hodgman, one half-plane a side). */
function toEllipse(poly: V2[], rect: [number, number, number, number]): V2[] {
  const cx = (rect[0] + rect[2]) / 2, cy = (rect[1] + rect[3]) / 2, rx = (rect[2] - rect[0]) / 2, ry = (rect[3] - rect[1]) / 2;
  let out = poly;
  const N = 48;
  for (let k = 0; k < N && out.length; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
    const A: V2 = [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry], B: V2 = [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry];
    // inside = left of A->B (the ellipse runs counter-clockwise)
    const side = (q: V2) => (B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0]);
    const next: V2[] = [];
    for (let i = 0; i < out.length; i++) {
      const P = out[i], Q = out[(i + 1) % out.length];
      const sp = side(P), sq = side(Q);
      if (sp >= 0) next.push(P);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        next.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
      }
    }
    out = next;
  }
  return out;
}

/** door.broken on a glass door: the pane goes. It shatters from where it was struck —
 *  small shards there, long ones toward the frame — most of it falling, the middle thrown
 *  through; teeth stay stuck in the frame and some drop a moment later. */
export const glassShatter = (ctx: EffectContext, p: DoorFxP): void => {
  const { fx, rng } = ctx;
  const kit = fx.breaking;
  const f = frameOf(p, rng);
  if (!kit) return;
  // (a window: only it goes, its own size, in its own plane; the door it's in stays)
  const win = f.window;
  const at = win ? win.glassAt : p.at;
  if (win) gone(fx, win.pane);
  else if (p.pane) gone(fx, p.pane);
  else if (p.leaf) gone(fx, p.leaf);
  const inset = 0.06;
  const rect: [number, number, number, number] = win ? win.rect : [-f.w / 2 + inset, -f.h / 2 + inset, f.w / 2 - inset, f.h / 2 - inset];
  const edgeIn = Math.min(0.05, (rect[2] - rect[0]) / 4, (rect[3] - rect[1]) / 4);
  const sx = Math.max(rect[0] + edgeIn, Math.min(rect[2] - edgeIn, f.strike.clone().sub(at).dot(f.u)));
  const sy = Math.max(rect[1] + edgeIn, Math.min(rect[3] - edgeIn, f.strike.y - at.y));
  // rings of seeds round the blow: radial cracks with rings between them
  const seeds: V2[] = [];
  const reach = Math.hypot(f.w, f.h);
  for (let r = 0.04, k = 0; r < reach; r *= range(rng, 1.65, 2.05), k++) {
    const m = Math.min(11, 5 + k * 2);
    const a0 = range(rng, 0, 6.28);
    for (let i = 0; i < m; i++) {
      const a = a0 + (i / m) * Math.PI * 2 + range(rng, -0.25, 0.25);
      const rr = r * range(rng, 0.85, 1.15);
      const x = sx + Math.cos(a) * rr, y = sy + Math.sin(a) * rr;
      if (x > rect[0] && x < rect[2] && y > rect[1] && y < rect[3]) seeds.push([x, y]);
    }
  }
  const specs: PieceSpec[] = [];
  for (const cell of voronoi(rect, seeds)) {
    let poly = jag(cell, rect, rng, 0.05, 0.005, null);
    if (win?.round) {
      poly = toEllipse(poly, rect);
      if (poly.length < 3) continue;
    }
    if (area(poly) < 0.0004) continue;
    const [cx, cy] = centroid(poly);
    const sl = slab(poly.map(([x, y]): V2 => [x - cx, y - cy]), 0.006, glassLook);
    const pos = at.clone().addScaledVector(f.u, cx).add(new THREE.Vector3(0, cy, 0));
    const d = Math.hypot(cx - sx, cy - sy);
    const blown = Math.exp(-d / 0.35);
    // a shard against the frame stays in it as a tooth: some drop late, some stay
    const ex = (rect[2] - rect[0]) / 2, ey = (rect[3] - rect[1]) / 2, ecx = rect[0] + ex, ecy = rect[1] + ey;
    const edge = win?.round
      ? poly.some(([x, y]) => ((x - ecx) / ex) ** 2 + ((y - ecy) / ey) ** 2 > 0.985)
      : poly.some(([x, y]) => x - rect[0] < 1e-3 || rect[2] - x < 1e-3 || y - rect[1] < 1e-3 || rect[3] - y < 1e-3);
    const tooth = edge && blown < 0.3 && rng() < 0.55;
    const radial = new THREE.Vector3().addScaledVector(f.u, cx - sx).add(new THREE.Vector3(0, cy - sy, 0)).normalize();
    specs.push({
      slab: sl, pos, quat: f.basis.clone(),
      vel: f.far.clone().multiplyScalar(range(rng, 0.2, 0.8) + 4 * blown).addScaledVector(radial, range(rng, 0.2, 0.9) * (0.4 + blown)).add(new THREE.Vector3(0, range(rng, -0.4, 0.3), 0)),
      spin: new THREE.Vector3(range(rng, -6, 6), range(rng, -6, 6), range(rng, -6, 6)).multiplyScalar(0.3 + blown),
      delay: tooth ? (rng() < 0.5 ? range(rng, 0.6, 6) : 600) : range(rng, 0, 0.04), seed: Math.floor(rng() * 2 ** 31), restitution: 0.18, keep: 420,
    });
  }
  fx.breaks.add(new Debris(kit.glass, specs, f.floorY));
  // the glitter: fine shards and grit thrown out, and the flash of the break
  for (let i = 0; i < Math.round(range(rng, 35, 55)); i++) {
    const sz = range(rng, 0.006, 0.022);
    const pos = f.strike.clone().add(new THREE.Vector3(range(rng, -0.12, 0.12), range(rng, -0.12, 0.12), range(rng, -0.12, 0.12)));
    fx.spawn("sprites", {
      pos, vel: inCone(rng, rng() < 0.75 ? f.far : f.near, 1.1, v3()).multiplyScalar(range(rng, 0.8, 4.5)), life: range(rng, 1, 2.2), size: [sz, sz],
      rot: range(rng, 0, 6.28), spin: range(rng, -18, 18), frame: { kind: "fixed", frame: SPRITE.shard }, color: [0.8, 0.9, 0.92], glow: 0.35,
      gravity: 9.8, drag: 0.5, floorY: f.floorY, bounce: 0.25, fadeIn: 0, fadeOut: 0.15,
    });
  }
  fx.spawn("sprites", { pos: f.strike, life: 0.09, size: [0.3, 0.3], rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.star }, glow: 1, color: [1.5, 1.6, 1.7], fadeIn: 0, fadeOut: 0.8 });
  for (let i = 0; i < 3; i++) {
    fx.spawn("sprites", {
      pos: f.strike, vel: inCone(rng, f.far, 0.9, v3()).multiplyScalar(range(rng, 0.4, 1.2)), life: range(rng, 0.8, 1.4), size: [0.15, 0.4],
      rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.puff }, color: [0.85, 0.88, 0.9], alpha: 0.25, drag: 3, fadeIn: 0, fadeOut: 0.7,
    });
  }
};

// ---- from the server's event ----------------------------------------------------------

/** One door event as the facility server sends it (doors.ts FxEvent). */
export interface DoorEvent {
  event: string;
  seed: number;
  at?: [number, number, number];
  normal?: [number, number, number];
  size?: [number, number];
  material?: "wood" | "metal" | "glass";
  side?: 1 | -1;
  lastHp?: number;
}

/** The door as the world has it: its leaf, its pane, the planks nailed on now (outermost
 *  last) and how many the server says are LEFT after this event. */
export interface DoorParts {
  leaf?: THREE.Object3D;
  pane?: THREE.Object3D;
  /** glass only in its windows (the lab doors: fx/anchors.ts `panes`) */
  panes?: THREE.Object3D[];
  planks?: THREE.Object3D[];
  planksLeft?: number;
  floorY?: number;
}

/** Play a door event. A blow that takes the barricade below a whole plank breaks the
 *  outermost plank; every other blow shakes what's there. */
export function playDoorEvent(fx: FxSystem, ev: DoorEvent, parts: DoorParts = {}): void {
  if (!ev.at || !ev.normal || !ev.size) return;
  const p: DoorFxP = {
    at: new THREE.Vector3(...ev.at), normal: new THREE.Vector3(...ev.normal), size: ev.size, side: ev.side ?? 1,
    material: ev.material, lastHp: ev.lastHp, floorY: parts.floorY, leaf: parts.leaf, pane: parts.pane, panes: parts.panes, planks: parts.planks,
  };
  const planks = parts.planks ?? [];
  switch (ev.event) {
    case "door.hit": {
      const left = parts.planksLeft ?? planks.length;
      if (left < planks.length) {
        const rng = mulberry32(ev.seed);
        const f = frameOf(p, rng);
        for (let i = planks.length - 1; i >= left; i--) fx.play(plankBreak, { plank: planks[i], push: f.far, floorY: f.floorY }, ev.seed + i);
        fx.play(doorHit, { ...p, planks: planks.slice(0, left) }, ev.seed ^ 0x77);
      } else fx.play(doorHit, p, ev.seed);
      break;
    }
    case "door.banged":
      fx.play(doorHit, { ...p, material: ev.material === "glass" ? "glass" : "metal" }, ev.seed);
      break;
    case "door.broken":
      fx.play(doorBurst, p, ev.seed);
      break;
    case "door.barricade": {
      const pl = planks[planks.length - 1];
      if (pl) fx.play(plankNailed, { plank: pl, floorY: p.floorY ?? p.at.y - p.size[1] / 2 }, ev.seed);
      break;
    }
    case "door.unbarricade": {
      // the plank is prised off and carried away: the world takes it; the nails let go in dust
      const pl = planks[planks.length - 1];
      if (pl) fx.play(plankNailed, { plank: pl, floorY: p.floorY ?? p.at.y - p.size[1] / 2 }, ev.seed);
      break;
    }
  }
}

export { geomOf as slabGeometry };
