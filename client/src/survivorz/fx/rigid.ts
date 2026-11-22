// SURVIVORZ EFFECTS — rigid pieces: a severed limb, a head, a chunk of meat, a
// bit of skull. Thrown, tumbling, bouncing on the floor and lying still where they
// stop (docs/survivorz/EFFECTS.md §1, the gore Josh approved 2026-10-22).
//
// Not a physics engine: a body is a set of SUPPORT POINTS (the extremes of its
// shape) against the floor's height and the registered surfaces, with an impulse
// at the lowest point so a thrown arm turns as it lands rather than skating. That
// is enough for a few dozen loose pieces, which is all the show ever has, and it
// is the casings' rule again: every random kick comes from the piece's own seeded
// rng, so every observer's floor matches.
import * as THREE from "three";
import { mulberry32, range, type Rng } from "./rng";
import type { SurfaceProbe } from "./casings";
import { KeptLayer } from "./kept";
import { LIMBS_PER_ROOM, overBudget } from "./budget";

export interface RigidSpawn {
  obj: THREE.Object3D;
  /** support points in the object's own frame (its hull's extremes) */
  points: THREE.Vector3[];
  vel: THREE.Vector3;
  /** rad/s, world */
  spin: THREE.Vector3;
  floorY?: number;
  /** how much a bounce keeps: meat 0.1, bone 0.3 */
  restitution?: number;
  /** seconds it lies before sinking away (Infinity = until pushed out) */
  keep?: number;
  seed: number;
  /** each landing, for a splat or a thud */
  onImpact?: (at: THREE.Vector3, speed: number) => void;
  /** it LASTS (Josh, Oct 23: severed limbs persist the show): once at rest it's kept with its
   *  room — "merge" into one mesh per material (a chunk of meat: a plain model), or "keep" as
   *  it is (a limb: it wears its own zombie's look) */
  last?: "merge" | "keep";
  /** what made it (written down when it's kept, so a restart can make it again) */
  cause?: unknown;
}

/** One loose piece. Exported so a batch that draws many pieces as ONE mesh (the
 *  breaking doors and glass, F6) can step its own pieces with the same physics. */
export interface RigidBody {
  obj: THREE.Object3D;
  points: THREE.Vector3[];
  v: THREE.Vector3;
  w: THREE.Vector3;
  radius: number;
  rng: Rng;
  ground: number;
  e: number;
  keep: number;
  still: number;
  rest: number;
  state: "fly" | "rest" | "sink";
  sink: number;
  /** seconds on the floor without a break (a rolling piece comes to rest in the end) */
  floored: number;
  /** it settles its own way (a door's wreckage is laid flat by its batch): none of the loose
   *  pieces' rolling rules */
  own?: boolean;
  onImpact?: (at: THREE.Vector3, speed: number) => void;
  /** the scale it was spawned at, for sinking away */
  s0: THREE.Vector3;
  last?: "merge" | "keep";
  cause?: unknown;
}

const UP = new THREE.Vector3(0, 1, 0);
const tq = new THREE.Quaternion();
const tv = new THREE.Vector3();
const tr = new THREE.Vector3();
const tw = new THREE.Vector3();

export class RigidPool {
  readonly group = new THREE.Group();
  /** what's come to rest and lasts: chunks merged by material and room, limbs as they are */
  readonly kept = new KeptLayer("gore");
  readonly keptGroup = new THREE.Group();
  private bodies: RigidBody[] = [];
  private held: { obj: THREE.Object3D; room: string }[] = [];
  /** which room a point is in (the world says; "" when it doesn't) */
  roomAt: (p: THREE.Vector3) => string = () => "";
  /** told of each body as it's kept (the ledger writes down where it lay) */
  onKept?: (b: RigidBody, room: string) => void;

  constructor(readonly capacity = 24) {
    this.group.name = "fx-rigid";
    this.keptGroup.name = "fx-rigid-kept";
    this.group.add(this.kept.group, this.keptGroup);
  }

  spawn(s: RigidSpawn): RigidBody {
    if (this.bodies.length >= this.capacity) {
      // the oldest gives way (it was lying still longest): kept where it is if it lasts
      const old = this.bodies.shift()!;
      if (old.last) this.keep(old);
      else this.group.remove(old.obj);
    }
    this.group.add(s.obj);
    const b = rigidBody(s);
    this.bodies.push(b);
    return b;
  }

  /** Keep a body for good, where it lies: merged with its room's (a plain model) or held as
   *  it is (a limb). Out of the moving pool either way. */
  keep(b: RigidBody): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    b.obj.updateMatrixWorld(true);
    const room = this.roomAt(b.obj.getWorldPosition(new THREE.Vector3()));
    if (b.last === "merge") {
      this.merge(b.obj, room);
      this.group.remove(b.obj);
    } else {
      this.hold(b.obj, room);
    }
    this.onKept?.(b, room);
  }

  /** A plain model merged, where it stands, into its room's kept layer (in world space, one
   *  mesh a material: every copy of a chunk of meat shares its material, so every chunk of
   *  meat in a room is one draw). */
  merge(obj: THREE.Object3D, room: string): void {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (g.index) {
        const flat = g.toNonIndexed();
        g.dispose();
        g = flat;
      }
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      this.kept.add(room, mat, g, 0, (g.getAttribute("position") as THREE.BufferAttribute).count);
      g.dispose();
    });
  }

  /** A piece held as it is, for good (a limb; and a restart's limb laid straight down). */
  hold(obj: THREE.Object3D, room: string): void {
    // the room's budget (fx/budget.ts): each held limb is its own draw, so the oldest goes
    for (const old of overBudget(this.held, (h) => h.room === room, LIMBS_PER_ROOM)) {
      this.keptGroup.remove(old.obj);
      freePiece(old.obj);
      this.held.splice(this.held.indexOf(old), 1);
    }
    obj.parent?.remove(obj);
    this.keptGroup.add(obj);
    obj.updateMatrixWorld(true);
    // culled with the room it lies in, like any room object
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingSphere();
      m.frustumCulled = true;
    });
    this.held.push({ obj, room });
  }

  /** pieces held as they are (limbs), in a room or everywhere */
  heldCount(room?: string): number {
    return this.held.filter((h) => room === undefined || h.room === room).length;
  }

  update(dt: number, probe?: SurfaceProbe): void {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.state === "rest") {
        b.rest += dt;
        // a piece that lasts is kept once it's lain still a moment
        if (b.last) {
          if (b.rest > 0.5) this.keep(b);
          continue;
        }
        if (b.rest > b.keep) b.state = "sink";
        continue;
      }
      if (b.state === "sink") {
        // down through the floor and gone, rather than popping out of existence
        b.sink += dt;
        b.obj.position.y -= dt * b.radius * 0.8;
        if (b.sink > 1.2) {
          this.group.remove(b.obj);
          this.bodies.splice(i, 1);
        }
        continue;
      }
      stepRigid(b, dt, probe);
    }
  }

  get live(): number {
    return this.bodies.length;
  }

  /** pose of every body, for the determinism check */
  snapshot(): string {
    return this.bodies.map((b) => `${b.obj.position.toArray().map((x) => x.toFixed(4))}:${b.obj.quaternion.toArray().map((x) => x.toFixed(4))}`).join("|");
  }

  /** draws in use: every mesh under every body, held piece and kept chunk (on screen, some
   *  of these are culled away with their rooms) */
  get draws(): number {
    let n = this.kept.draws;
    for (const b of this.bodies) b.obj.traverse((x) => { if ((x as THREE.Mesh).isMesh && x.visible) n++; });
    for (const h of this.held) h.obj.traverse((x) => { if ((x as THREE.Mesh).isMesh && x.visible) n++; });
    return n;
  }

  clear(): void {
    for (const b of this.bodies) this.group.remove(b.obj);
    this.bodies = [];
    for (const h of this.held) { this.keptGroup.remove(h.obj); freePiece(h.obj); }
    this.held = [];
    this.kept.clear();
  }
}

/** A held piece's own GPU objects (a lifted limb's geometry and its cut material copies, gore.ts
 *  `lift`): never shared, so they go with it. A cap's geometry is the kit's and stays. */
function freePiece(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.geometry?.userData.fxPart !== undefined) m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat?.userData?.cut) mat.dispose();
  });
}

/** A body from a spawn description. */
export function rigidBody(s: RigidSpawn): RigidBody {
  const radius = Math.max(0.02, ...s.points.map((p) => p.length()));
  return {
    obj: s.obj, points: s.points, v: s.vel.clone(), w: s.spin.clone(), radius, rng: mulberry32(s.seed),
    ground: s.floorY ?? -Infinity, e: s.restitution ?? 0.2, keep: s.keep ?? 180, still: 0, rest: 0, state: "fly", sink: 0, floored: 0,
    onImpact: s.onImpact, s0: s.obj.scale.clone(), last: s.last, cause: s.cause,
  };
}

/** One step of a flying body: gravity, the walls, the floor at its lowest support point,
 *  an impulse that turns it as it lands, and coming to rest. */
export function stepRigid(b: RigidBody, dt: number, probe?: SurfaceProbe): void {
  const o = b.obj;
  b.v.y -= 9.8 * dt;
  b.v.multiplyScalar(Math.exp(-0.1 * dt));
  if (probe) {
    const len = b.v.length() * dt;
    if (len > 1e-5) {
      const h = probe(o.position, tv.copy(b.v), len + b.radius * 0.5);
      if (h) {
        if (h.normal.y > 0.7) b.ground = Math.max(b.ground, h.point.y);
        else {
          const vn = b.v.dot(h.normal);
          if (vn < 0) {
            b.v.addScaledVector(h.normal, -(1 + b.e) * vn).multiplyScalar(0.6);
            b.onImpact?.(h.point, -vn);
          }
        }
      }
    }
  }
  o.position.addScaledVector(b.v, dt);
  const ww = b.w.length();
  if (ww > 1e-6) o.quaternion.premultiply(tq.setFromAxisAngle(tv.copy(b.w).divideScalar(ww), ww * dt)).normalize();
  // the lowest support point, and whether it's into the floor
  let low = Infinity;
  const at = new THREE.Vector3();
  for (const p of b.points) {
    tv.copy(p).multiply(o.scale).applyQuaternion(o.quaternion);
    const y = o.position.y + tv.y;
    if (y < low) {
      low = y;
      at.copy(tv);
    }
  }
  let touching = false;
  if (low < b.ground) {
    touching = true;
    o.position.y += b.ground - low;
    // velocity of the contact point
    const vc = tr.copy(b.w).cross(at).add(b.v);
    if (vc.y < 0) {
      const speed = -vc.y;
      // an impulse up through the contact: with I = 0.4 m r², per unit mass
      const I = 0.4 * b.radius * b.radius;
      const rxn = tw.copy(at).cross(UP);
      const j = (-(1 + b.e) * vc.y) / (1 + rxn.lengthSq() / I);
      b.v.y += j;
      b.w.addScaledVector(rxn, j / I);
      // friction across the floor at the contact
      const vt = tr.copy(b.w).cross(at).add(b.v);
      vt.y = 0;
      const fr = Math.min(1, 0.6 * j / Math.max(1e-4, vt.length()));
      b.v.addScaledVector(vt, -fr * 0.5);
      b.w.addScaledVector(tw.copy(at).cross(vt), (-fr * 0.5) / I);
      if (speed > 0.6) b.onImpact?.(o.position.clone().add(at), speed);
    }
  }
  // a little damping, more on the floor, so a piece lies down and stays down
  const damp = touching ? 4 : 0.2;
  b.w.multiplyScalar(Math.exp(-damp * dt));
  if (touching) {
    b.v.x *= Math.exp(-2.5 * dt);
    b.v.z *= Math.exp(-2.5 * dt);
  }
  // rolling resistance: nothing real rolls for ever, and a piece that never rests is never kept
  if (!b.own && touching && b.v.lengthSq() < 0.05) b.w.multiplyScalar(Math.exp(-6 * dt));
  if (touching && b.v.lengthSq() < 0.01 && b.w.lengthSq() < 0.3) b.still += dt;
  else b.still = 0;
  b.floored = touching && !b.own ? b.floored + dt : 0;
  if (b.still > 0.25 || b.floored > 4) {
    b.state = "rest";
    b.v.set(0, 0, 0);
    b.w.set(0, 0, 0);
  }
}

/** Up to n support points for a geometry: its extremes along a spread of directions. */
export function supportPoints(geo: THREE.BufferGeometry, n = 14, seed = 7): THREE.Vector3[] {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const rng = mulberry32(seed);
  const dirs: THREE.Vector3[] = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];
  while (dirs.length < n) dirs.push(new THREE.Vector3(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)).normalize());
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (const d of dirs) {
    let best = -Infinity, bi = 0;
    for (let i = 0; i < pos.count; i++) {
      const k = v.fromBufferAttribute(pos, i).dot(d);
      if (k > best) {
        best = k;
        bi = i;
      }
    }
    const p = new THREE.Vector3().fromBufferAttribute(pos, bi);
    if (!out.some((q) => q.distanceToSquared(p) < 1e-6)) out.push(p);
  }
  return out;
}
