// SURVIVORZ EFFECTS — spent casings: the brass and the shotgun shells that come
// out of the guns, tumble, bounce, roll and lie where they land
// (docs/survivorz/EFFECTS.md §1 "Guns").
//
// Real geometry, not cards: a case lying on the floor is seen from every side for
// minutes, and a sprite can't do that. ONE InstancedMesh PER KIND (three draws at
// most), one shared material, and a fixed number of slots per kind — the oldest
// case on the floor gives its slot to the newest, so a long firefight leaves a
// carpet of brass without the count, the buffer or the draws ever growing.
//
// The physics is just enough to read right: gravity, a tumble, bounces off the
// floor and anything registered as a surface, and a settle that lays the case on
// its side (or, now and then, on its base) and lets it roll a little. Every random
// kick comes from the case's own seeded rng, so every observer's floor matches.
import * as THREE from "three";
import { mulberry32, range, type Rng } from "./rng";
import type { CasingKind } from "./guns";

interface Shape {
  /** half-length along the case's axis, and its radius (metres) */
  half: number;
  radius: number;
  /** how much a bounce keeps */
  restitution: number;
  /** may it land standing on its base */
  stands: boolean;
  geometry: THREE.BufferGeometry;
}

const BRASS = new THREE.Color(0xe0b862);
const HULL = new THREE.Color(0xa8231c);

/** A lathe from (radius, height) points, centred on its own middle, with colour per vertex. */
function lathe(points: [number, number][], colorAt: (y: number) => THREE.Color, segments: number): THREE.BufferGeometry {
  const len = points.reduce((m, p) => Math.max(m, p[1]), 0);
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  g.translate(0, -len / 2, 0);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = colorAt(pos.getY(i) + len / 2);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// real dimensions: 9×19 mm, 5.56×45 mm, 12-gauge 2¾"
function shapes(): Record<CasingKind, Shape> {
  const brass = () => BRASS;
  return {
    pistol: {
      half: 0.0095, radius: 0.0049, restitution: 0.4, stands: true,
      geometry: lathe([[0, 0], [0.0049, 0], [0.0049, 0.0012], [0.0042, 0.0014], [0.0042, 0.0024], [0.0049, 0.0026], [0.00485, 0.019], [0.0042, 0.019], [0.0041, 0.006], [0, 0.006]], brass, 12),
    },
    rifle: {
      half: 0.0225, radius: 0.0048, restitution: 0.38, stands: false,
      geometry: lathe([[0, 0], [0.0048, 0], [0.0048, 0.0012], [0.0040, 0.0014], [0.0040, 0.0026], [0.0048, 0.0029], [0.0045, 0.036], [0.0032, 0.0395], [0.0032, 0.045], [0.0028, 0.045], [0.0028, 0.040], [0, 0.040]], brass, 12),
    },
    shell: {
      half: 0.035, radius: 0.0108, restitution: 0.22, stands: true,
      geometry: lathe([[0, 0], [0.0112, 0], [0.0112, 0.0012], [0.0108, 0.0014], [0.0108, 0.012], [0.0104, 0.0125], [0.0104, 0.066], [0.0085, 0.0685], [0.0035, 0.0698], [0, 0.0698]], (y) => (y < 0.0122 ? BRASS : HULL), 14),
    },
  };
}

type State = "free" | "fly" | "settle" | "rest" | "sink";

interface Case {
  state: State;
  kind: CasingKind;
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  /** world angular velocity, rad/s */
  w: THREE.Vector3;
  rng: Rng;
  age: number;
  /** the settle: from, to, how far through, how long */
  q0: THREE.Quaternion;
  q1: THREE.Quaternion;
  y0: number;
  y1: number;
  st: number;
  /** rolling on the floor: speed (m/s) along `rollDir`, and how far it has turned */
  roll: number;
  rollDir: THREE.Vector3;
  rollAngle: number;
  axis: THREE.Vector3;
  restFor: number;
  scale: number;
  bounces: number;
  ground: number;
}

export interface CasingSpawn {
  kind: CasingKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** the case's axis as it leaves (base to mouth) */
  axis: THREE.Vector3;
  /** rad/s of tumble */
  tumble: number;
  /** the floor's height under it, if nothing registered is there to land on */
  floorY?: number;
  seed: number;
}

export type SurfaceProbe = (origin: THREE.Vector3, dir: THREE.Vector3, far: number) => { point: THREE.Vector3; normal: THREE.Vector3 } | null;

const Y = new THREE.Vector3(0, 1, 0);
const tq = new THREE.Quaternion();
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tm = new THREE.Matrix4();
const ts = new THREE.Vector3();
const tc = new THREE.Color();

export class CasingPool {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly meshes = new Map<CasingKind, THREE.InstancedMesh>();
  private shapes = shapes();
  private cases = new Map<CasingKind, Case[]>();
  private next = new Map<CasingKind, number>();
  /** seconds a case lies on the floor before it sinks away (the show keeps them a good while) */
  keep = 120;
  /** called on each bounce, for the tinkle (the sound is the audio work's, not ours) */
  onBounce?: (kind: CasingKind, pos: THREE.Vector3, speed: number) => void;

  constructor(readonly perKind = 128) {
    this.group.name = "fx-casings";
    // a little metal, not much: there is no environment map in the facility, and full
    // metal with nothing to reflect reads black
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.3 });
    for (const kind of Object.keys(this.shapes) as CasingKind[]) {
      const m = new THREE.InstancedMesh(this.shapes[kind].geometry, this.material, perKind);
      m.name = `fx-casings:${kind}`;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      m.castShadow = false;
      m.receiveShadow = false;
      // every slot starts parked out of sight at zero scale
      tm.makeScale(0, 0, 0);
      for (let i = 0; i < perKind; i++) {
        m.setMatrixAt(i, tm);
        m.setColorAt(i, tc.setRGB(1, 1, 1));
      }
      this.meshes.set(kind, m);
      this.group.add(m);
      this.next.set(kind, 0);
      this.cases.set(kind, Array.from({ length: perKind }, () => ({
        state: "free" as State, kind, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
        rng: mulberry32(1), age: 0, q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), y0: 0, y1: 0, st: 0,
        roll: 0, rollDir: new THREE.Vector3(), rollAngle: 0, axis: new THREE.Vector3(), restFor: 0, scale: 1, bounces: 0, ground: 0,
      })));
    }
  }

  spawn(s: CasingSpawn): void {
    const list = this.cases.get(s.kind)!;
    const i = this.next.get(s.kind)!;
    this.next.set(s.kind, (i + 1) % this.perKind);
    const c = list[i];
    c.state = "fly";
    c.rng = mulberry32(s.seed);
    c.p.copy(s.pos);
    c.v.copy(s.vel);
    c.q.setFromUnitVectors(Y, s.axis.clone().normalize());
    // tumble end over end: about an axis across the case, not along it
    c.w.copy(s.axis).cross(s.vel).normalize();
    if (c.w.lengthSq() < 1e-6) c.w.set(0, 1, 0);
    c.w.multiplyScalar(s.tumble).addScaledVector(s.axis.clone().normalize(), range(c.rng, -8, 8));
    c.age = 0;
    c.scale = 1;
    c.bounces = 0;
    c.roll = 0;
    c.rollAngle = 0;
    c.ground = s.floorY ?? -Infinity;
    // brass from different boxes isn't all one colour
    const shade = range(c.rng, 0.82, 1.06);
    this.meshes.get(s.kind)!.setColorAt(i, tc.setRGB(shade, shade * range(c.rng, 0.97, 1.02), shade * range(c.rng, 0.93, 1.03)));
    this.meshes.get(s.kind)!.instanceColor!.needsUpdate = true;
  }

  /** How far the case's lowest point is below its centre, at its current tilt. */
  private reach(c: Case): number {
    const sh = this.shapes[c.kind];
    const ay = Math.abs(tv.copy(Y).applyQuaternion(c.q).y);
    return ay * sh.half + Math.sqrt(Math.max(0, 1 - ay * ay)) * sh.radius;
  }

  update(dt: number, probe?: SurfaceProbe): void {
    for (const [kind, list] of this.cases) {
      const mesh = this.meshes.get(kind)!;
      const sh = this.shapes[kind];
      let live = 0, highest = -1;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.state === "free") continue;
        c.age += dt;
        if (c.state === "fly") this.fly(c, sh, dt, probe);
        else if (c.state === "settle") {
          c.st += dt;
          const k = Math.min(1, c.st / 0.12);
          const e = 1 - (1 - k) * (1 - k);
          c.q.slerpQuaternions(c.q0, c.q1, e);
          c.p.y = c.y0 + (c.y1 - c.y0) * e;
          this.rolling(c, sh, dt);
          if (k >= 1) {
            c.state = "rest";
            c.restFor = 0;
          }
        } else if (c.state === "rest") {
          this.rolling(c, sh, dt);
          c.restFor += dt;
          if (c.restFor > this.keep) c.state = "sink";
        } else if (c.state === "sink") {
          c.scale -= dt / 0.6;
          if (c.scale <= 0) {
            c.state = "free";
            tm.makeScale(0, 0, 0);
            mesh.setMatrixAt(i, tm);
            continue;
          }
        }
        tm.compose(c.p, c.q, ts.setScalar(c.scale));
        mesh.setMatrixAt(i, tm);
        live++;
        highest = i;
      }
      // draw up to the highest slot in use (slots below it that are free are at scale 0)
      mesh.count = highest + 1;
      mesh.visible = live > 0;
      if (live > 0 || mesh.count === 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private fly(c: Case, sh: Shape, dt: number, probe?: SurfaceProbe): void {
    c.v.y -= 9.8 * dt;
    c.v.multiplyScalar(Math.exp(-0.15 * dt));
    const step = tv2.copy(c.v).multiplyScalar(dt);
    // walls and props first: a case flicked into a wall bounces off it
    if (probe) {
      const len = step.length();
      if (len > 1e-5) {
        const h = probe(c.p, step, len + sh.radius);
        if (h) {
          if (h.normal.y > 0.7) c.ground = Math.max(c.ground, h.point.y);
          else {
            const vn = c.v.dot(h.normal);
            if (vn < 0) {
              c.v.addScaledVector(h.normal, -(1 + sh.restitution) * vn).multiplyScalar(0.7);
              c.w.multiplyScalar(0.6);
              this.onBounce?.(c.kind, c.p, -vn);
              step.copy(c.v).multiplyScalar(dt);
            }
          }
        }
      }
    }
    c.p.add(step);
    tq.setFromAxisAngle(tv.copy(c.w).normalize(), c.w.length() * dt);
    if (c.w.lengthSq() > 1e-8) c.q.premultiply(tq).normalize();
    const low = c.p.y - this.reach(c);
    if (low > c.ground || c.v.y > 0) return;
    // the floor: bounce, lose speed, take a fresh kick of tumble from the knock
    c.p.y += c.ground - low;
    const impact = -c.v.y;
    this.onBounce?.(c.kind, c.p, impact);
    c.bounces++;
    c.v.y = impact * sh.restitution;
    c.v.x *= 0.62;
    c.v.z *= 0.62;
    c.w.set(range(c.rng, -1, 1), range(c.rng, -0.3, 0.3), range(c.rng, -1, 1)).multiplyScalar(impact * range(c.rng, 6, 14));
    if (c.v.y > 0.35 && c.bounces < 5) return;
    // done bouncing: lay it down
    const axis = tv.copy(Y).applyQuaternion(c.q);
    c.q0.copy(c.q);
    c.y0 = c.p.y;
    if (sh.stands && Math.abs(axis.y) > 0.92 && c.rng() < 0.35) {
      // on its base (a pistol case or a shell standing up is a real thing to see)
      c.q1.setFromUnitVectors(Y, Y).multiply(tq.setFromAxisAngle(Y, Math.atan2(axis.x, axis.z)));
      c.y1 = c.ground + sh.half;
      c.roll = 0;
      c.axis.copy(Y);
    } else {
      const flat = new THREE.Vector3(axis.x, 0, axis.z);
      if (flat.lengthSq() < 1e-6) flat.set(Math.cos(c.rng() * 6.28), 0, Math.sin(c.rng() * 6.28));
      flat.normalize();
      c.axis.copy(flat);
      c.q1.setFromUnitVectors(Y, flat);
      c.y1 = c.ground + sh.radius;
      // it rolls across its axis with whatever speed it had that way
      c.rollDir.crossVectors(Y, flat).normalize();
      c.roll = c.v.dot(c.rollDir) + range(c.rng, -0.25, 0.25);
    }
    c.v.set(0, 0, 0);
    c.w.set(0, 0, 0);
    c.state = "settle";
    c.st = 0;
  }

  private rolling(c: Case, sh: Shape, dt: number): void {
    if (Math.abs(c.roll) < 0.005) return;
    c.p.addScaledVector(c.rollDir, c.roll * dt);
    // turning about its own axis as it rolls; the base orientation is the settled one
    c.rollAngle -= (c.roll * dt) / sh.radius;
    c.q.copy(c.q1).premultiply(tq.setFromAxisAngle(c.axis, c.rollAngle));
    c.roll *= Math.exp(-3.5 * dt);
  }

  get live(): number {
    let n = 0;
    for (const list of this.cases.values()) for (const c of list) if (c.state !== "free") n++;
    return n;
  }

  /** draws in use right now */
  get draws(): number {
    let n = 0;
    for (const m of this.meshes.values()) if (m.visible) n++;
    return n;
  }

  /** state of every live case, for the determinism check */
  snapshot(): string {
    const out: string[] = [];
    for (const list of this.cases.values()) for (const c of list) if (c.state !== "free") out.push(`${c.kind}:${c.p.toArray().map((x) => x.toFixed(4))}:${c.q.toArray().map((x) => x.toFixed(4))}`);
    return out.join("|");
  }

  clear(): void {
    for (const [kind, list] of this.cases) {
      const mesh = this.meshes.get(kind)!;
      tm.makeScale(0, 0, 0);
      list.forEach((c, i) => {
        c.state = "free";
        mesh.setMatrixAt(i, tm);
      });
      mesh.count = 0;
      mesh.visible = false;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  gpuBytes(): number {
    let b = 0;
    for (const m of this.meshes.values()) {
      const g = m.geometry;
      for (const a of Object.values(g.attributes)) b += (a as THREE.BufferAttribute).array.byteLength;
      b += m.instanceMatrix.array.byteLength + (m.instanceColor?.array.byteLength ?? 0);
    }
    return b;
  }
}
