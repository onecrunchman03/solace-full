// THE RAGDOLL (Aug 2026) — the hilarious once, then still forever.
//
// No physics engine: a 15-particle verlet stick figure (pelvis/chest/head,
// shoulders/elbows/hands, hips/knees/feet) with distance constraints, run in
// world METRES and collided against the exact same grid the player collides
// with (groundAt / walls / solids / raised floors). Each frame the skeleton's
// real bones are AIMED along the particle segments — a rigid tumbling torso
// with flailing limbs — so the suited body itself goes flying, not a proxy.
//
// Determinism-by-seed: the server's death event carries the throw (dir/power)
// and a seed; every client runs the same seeded sim (the Derby's
// broadcast-seed pattern), so witnesses all watch the same launch. The REST
// spot is server-decided (loot lives there): after the violence dies down the
// whole particle set glides to it, then freezes — the caller swaps in the
// static corpse. Impacts above a pain threshold call back out (blood, thuds).

import * as THREE from "three";
import { CELL } from "./world";

/** The only seven questions the sim asks of a world. Structural ON PURPOSE, the
 *  same widening `controller.ts` took for `ControllerWorld`: the backrooms'
 *  WorldIndex satisfies it as-is, and THE FLOOR's CasinoWorld can satisfy it
 *  without dragging chunk streaming into a room that has neither chunks nor
 *  water. Type-only — no runtime coupling either way. */
export interface RagdollWorld {
  /** Smooth floor height under a POSITION, cells in, metres out. */
  groundAt(x: number, y: number): number;
  /** A cell's own floor height in METRES. */
  floorAt(x: number, y: number): number;
  /** Ceiling height ABOVE that cell's floor, metres. */
  cellHeightAt(x: number, y: number): number;
  /** Water surface height, or null where dry. */
  waterAt(x: number, y: number): number | null;
  solidAt(x: number, y: number): boolean;
  wallNAt(x: number, y: number): boolean;
  wallWAt(x: number, y: number): boolean;
}

export interface RagdollImpact {
  /** World metres. */
  x: number;
  y: number;
  z: number;
  /** m/s at the moment of contact. */
  speed: number;
  kind: "wall" | "floor";
  /** Outward surface normal on the ground plane (walls; floors get 0,0). */
  nx: number;
  nz: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  r: number;
  flail: number; // impulse multiplier — extremities get more
}

interface Stick {
  a: number;
  b: number;
  len: number;
  k: number; // stiffness 0..1
}

/** mulberry32 — the repo's standard seeded PRNG (Math.random is banned from
 *  anything two clients must agree on). */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Particle indices.
const PELVIS = 0, CHEST = 1, HEAD = 2;
const SH_L = 3, SH_R = 4, EL_L = 5, EL_R = 6, HA_L = 7, HA_R = 8;
const HIP_L = 9, HIP_R = 10, KN_L = 11, KN_R = 12, FT_L = 13, FT_R = 14;

/** Which bone marks each particle at bind time. */
const PARTICLE_BONE: [number, string][] = [
  [PELVIS, "DEF-spine"],
  [CHEST, "DEF-spine003"],
  [HEAD, "DEF-spine006"],
  [SH_L, "DEF-upper_armL"],
  [SH_R, "DEF-upper_armR"],
  [EL_L, "DEF-forearmL"],
  [EL_R, "DEF-forearmR"],
  [HA_L, "DEF-handL"],
  [HA_R, "DEF-handR"],
  [HIP_L, "DEF-thighL"],
  [HIP_R, "DEF-thighR"],
  [KN_L, "DEF-shinL"],
  [KN_R, "DEF-shinR"],
  [FT_L, "DEF-footL"],
  [FT_R, "DEF-footR"],
];

/** Bones driven every frame: aim `bone` so that (its world position →
 *  `end` bone's world position) matches (particle a → particle b). Order
 *  matters — parents first, so children read applied transforms. */
const DRIVE: { bone: string; end: string; a: number; b: number }[] = [
  { bone: "DEF-spine", end: "DEF-spine003", a: PELVIS, b: CHEST },
  { bone: "DEF-spine004", end: "DEF-spine006", a: CHEST, b: HEAD },
  { bone: "DEF-upper_armL", end: "DEF-forearmL", a: SH_L, b: EL_L },
  { bone: "DEF-upper_armR", end: "DEF-forearmR", a: SH_R, b: EL_R },
  { bone: "DEF-forearmL", end: "DEF-handL", a: EL_L, b: HA_L },
  { bone: "DEF-forearmR", end: "DEF-handR", a: EL_R, b: HA_R },
  { bone: "DEF-thighL", end: "DEF-shinL", a: HIP_L, b: KN_L },
  { bone: "DEF-thighR", end: "DEF-shinR", a: HIP_R, b: KN_R },
  { bone: "DEF-shinL", end: "DEF-footL", a: KN_L, b: FT_L },
  { bone: "DEF-shinR", end: "DEF-footR", a: KN_R, b: FT_R },
];

const GRAV = -11;
const SUBSTEP = 1 / 90;
const ITERATIONS = 4;
const AIR_DAMP = 0.996;
const WATER_DAMP = 0.9;
const FLOOR_FRICTION = 0.72;
const BOUNCE = 0.35;
const IMPACT_MIN = 2.6; // m/s — softer contacts stay silent and bloodless
const MAX_SIM_MS = 4_600; // the comedy window; after this it settles no matter what
const SETTLE_SPEED = 0.22; // m/s — "has stopped moving"

export interface Ragdoll {
  /** Advance; returns false once fully settled at the rest spot (caller
   *  swaps in the static corpse and disposes). */
  tick(dt: number): boolean;
  /** Where the body's pelvis is right now, world metres — the death cam
   *  tracks it. */
  pelvis(): { x: number; y: number; z: number };
  dispose(): void;
}

export function createRagdoll(opts: {
  world: RagdollWorld;
  /** The suited skeleton, ALREADY posed and placed at the death spot inside
   *  an identity group (bone world space == scene space). */
  model: THREE.Object3D;
  dir: number; // throw heading, cell convention: vector = (sin dir, cos dir)
  power: number; // cells/s — 0 crumples in place
  seed: number;
  restX: number; // cells — the server's authoritative corpse spot
  restY: number;
  onImpact?: (i: RagdollImpact) => void;
}): Ragdoll | null {
  const { world, model } = opts;
  const rng = mulberry32(opts.seed);

  // ---- Bind: find bones, read particle positions off the current pose ----
  const bones = new Map<string, THREE.Object3D>();
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o);
  });
  const P: Particle[] = [];
  const V = new THREE.Vector3();
  for (const [idx, name] of PARTICLE_BONE) {
    const b = bones.get(name);
    if (!b) return null; // rig mismatch — no ragdoll, caller falls back
    b.getWorldPosition(V);
    P[idx] = {
      x: V.x, y: V.y, z: V.z,
      px: V.x, py: V.y, pz: V.z,
      r: idx === HEAD ? 0.13 : idx <= CHEST ? 0.15 : idx >= FT_L ? 0.07 : 0.08,
      flail: idx === HEAD || idx >= HA_L ? 1.18 : 1,
    };
  }
  const drives = DRIVE.map((d) => ({
    bone: bones.get(d.bone)!,
    end: bones.get(d.end)!,
    a: d.a,
    b: d.b,
  }));
  if (drives.some((d) => !d.bone || !d.end)) return null;
  const pelvisBone = bones.get("DEF-spine")!;

  const dist = (a: number, b: number): number =>
    Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y, P[a].z - P[b].z);
  const S: Stick[] = [];
  const stick = (a: number, b: number, k = 1): void => {
    S.push({ a, b, len: dist(a, b), k });
  };
  // The frame.
  stick(PELVIS, CHEST); stick(CHEST, HEAD, 0.9);
  stick(CHEST, SH_L); stick(CHEST, SH_R); stick(SH_L, SH_R);
  stick(PELVIS, HIP_L); stick(PELVIS, HIP_R); stick(HIP_L, HIP_R);
  // Limbs.
  stick(SH_L, EL_L); stick(EL_L, HA_L); stick(SH_R, EL_R); stick(EL_R, HA_R);
  stick(HIP_L, KN_L); stick(KN_L, FT_L); stick(HIP_R, KN_R); stick(KN_R, FT_R);
  // Braces — keep the torso a body instead of a wet sock.
  stick(PELVIS, SH_L, 0.55); stick(PELVIS, SH_R, 0.55);
  stick(CHEST, HIP_L, 0.55); stick(CHEST, HIP_R, 0.55);
  stick(PELVIS, HEAD, 0.25);

  // ---- The throw ---------------------------------------------------------
  // Impulse as an initial velocity written into the verlet history. Upward
  // kick scales with power; every particle gets seeded jitter so the body
  // TUMBLES rather than gliding like a statue.
  {
    const sp = opts.power * CELL; // m/s
    const vx = Math.sin(opts.dir) * sp;
    const vz = Math.cos(opts.dir) * sp;
    const vy = sp * 0.42 + (opts.power > 0 ? 1.4 : 0.4);
    for (const p of P) {
      const j = 0.85 + rng() * 0.3;
      p.px = p.x - (vx * j + (rng() - 0.5) * 1.3 * p.flail) * SUBSTEP;
      p.py = p.y - (vy * j * p.flail) * SUBSTEP;
      p.pz = p.z - (vz * j + (rng() - 0.5) * 1.3 * p.flail) * SUBSTEP;
    }
  }

  // ---- Collision helpers (world queries take CELLS) ----------------------
  const restWX = opts.restX * CELL;
  const restWZ = opts.restY * CELL;
  const groundAtW = (wx: number, wz: number): number => world.groundAt(wx / CELL, wz / CELL);
  const crossBlocked = (fcx: number, fcy: number, tcx: number, tcy: number, h: number): boolean => {
    if (world.solidAt(tcx, tcy)) return true;
    if (tcx !== fcx && world.wallWAt(Math.max(fcx, tcx), fcy)) return true;
    if (tcy !== fcy && world.wallNAt(fcx, Math.max(fcy, tcy))) return true;
    // The side of a raised floor is a wall to anything below its top.
    if (world.floorAt(tcx, tcy) > h) return true;
    return false;
  };

  let elapsed = 0;
  let acc = 0;
  let calmFor = 0;
  let settling = false;
  let done = false;
  const QP = new THREE.Quaternion();
  const QD = new THREE.Quaternion();
  const QW = new THREE.Quaternion();
  const CUR = new THREE.Vector3();
  const WANT = new THREE.Vector3();
  const AXIS = new THREE.Vector3();
  const TMP = new THREE.Vector3();
  const TMP2 = new THREE.Vector3();

  const step = (): void => {
    // Integrate.
    for (const p of P) {
      const cellX = Math.floor(p.x / CELL);
      const cellY = Math.floor(p.z / CELL);
      const wl = world.waterAt(cellX, cellY);
      const inWater = wl !== null && p.y < wl;
      const damp = inWater ? WATER_DAMP : AIR_DAMP;
      const g = inWater ? GRAV * 0.1 : GRAV;
      const vx = (p.x - p.px) * damp;
      const vy = (p.y - p.py) * damp + g * SUBSTEP * SUBSTEP;
      const vz = (p.z - p.pz) * damp;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx; p.y += vy; p.z += vz;
    }
    // Constraints.
    for (let it = 0; it < ITERATIONS; it++) {
      for (const s of S) {
        const a = P[s.a], b = P[s.b];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const push = ((d - s.len) / d) * 0.5 * s.k;
        a.x += dx * push; a.y += dy * push; a.z += dz * push;
        b.x -= dx * push; b.y -= dy * push; b.z -= dz * push;
      }
    }
    // The glide home: once settling, the whole set drifts toward the
    // server's rest spot without deforming (loot lives THERE).
    if (settling) {
      const dx = restWX - P[PELVIS].x;
      const dz = restWZ - P[PELVIS].z;
      const k = Math.min(1, 2.6 * SUBSTEP);
      for (const p of P) { p.x += dx * k; p.z += dz * k; }
    }
    // Collide.
    for (const p of P) {
      // Walls / solids / floor-sides: per axis, at the particle's height.
      const ocx = Math.floor(p.px / CELL);
      const ocy = Math.floor(p.pz / CELL);
      let ncx = Math.floor(p.x / CELL);
      if (ncx !== ocx && crossBlocked(ocx, ocy, ncx, ocy, p.y)) {
        const speed = Math.abs(p.x - p.px) / SUBSTEP;
        const edge = (ncx > ocx ? ncx : ocx) * CELL;
        p.x = ncx > ocx ? edge - p.r * 0.5 : edge + p.r * 0.5;
        p.px = p.x + (p.x - p.px) * BOUNCE; // reflect
        if (speed > IMPACT_MIN) {
          opts.onImpact?.({ x: edge, y: p.y, z: p.z, speed, kind: "wall", nx: ncx > ocx ? -1 : 1, nz: 0 });
        }
        ncx = ocx;
      }
      const ncy = Math.floor(p.z / CELL);
      if (ncy !== ocy && crossBlocked(ncx, ocy, ncx, ncy, p.y)) {
        const speed = Math.abs(p.z - p.pz) / SUBSTEP;
        const edge = (ncy > ocy ? ncy : ocy) * CELL;
        p.z = ncy > ocy ? edge - p.r * 0.5 : edge + p.r * 0.5;
        p.pz = p.z + (p.z - p.pz) * BOUNCE;
        if (speed > IMPACT_MIN) {
          opts.onImpact?.({ x: p.x, y: p.y, z: edge, speed, kind: "wall", nx: 0, nz: ncy > ocy ? -1 : 1 });
        }
      }
      // Floor.
      const g = groundAtW(p.x, p.z) + p.r;
      if (p.y < g) {
        const vFall = (p.py - p.y) / SUBSTEP;
        p.y = g;
        p.py = p.y - (p.py - p.y) * BOUNCE;
        // Ground friction bleeds the slide.
        p.px = p.x - (p.x - p.px) * FLOOR_FRICTION;
        p.pz = p.z - (p.z - p.pz) * FLOOR_FRICTION;
        if (vFall > IMPACT_MIN + 0.6) {
          opts.onImpact?.({ x: p.x, y: g, z: p.z, speed: vFall, kind: "floor", nx: 0, nz: 0 });
        }
      }
      // Ceiling — a launched body can meet it.
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.z / CELL);
      const ceil = world.floorAt(cx, cy) + world.cellHeightAt(cx, cy) - p.r;
      if (world.cellHeightAt(cx, cy) > 0 && p.y > ceil) {
        p.y = ceil;
        p.py = p.y + (p.y - p.py) * BOUNCE;
      }
    }
  };

  const driveBones = (): void => {
    // Pelvis rides its particle; everything hangs off it.
    pelvisBone.parent!.updateWorldMatrix(true, false);
    TMP.set(P[PELVIS].x, P[PELVIS].y, P[PELVIS].z);
    pelvisBone.position.copy(pelvisBone.parent!.worldToLocal(TMP.clone()));
    for (const d of drives) {
      d.bone.updateWorldMatrix(true, false);
      d.bone.getWorldPosition(TMP);
      d.end.getWorldPosition(TMP2);
      CUR.subVectors(TMP2, TMP);
      if (CUR.lengthSq() < 1e-8) continue;
      CUR.normalize();
      WANT.set(P[d.b].x - P[d.a].x, P[d.b].y - P[d.a].y, P[d.b].z - P[d.a].z);
      if (WANT.lengthSq() < 1e-8) continue;
      WANT.normalize();
      QD.setFromUnitVectors(CUR, WANT);
      d.bone.parent!.getWorldQuaternion(QP);
      // World-space delta re-expressed in the parent's frame.
      QW.copy(QP).invert().multiply(QD).multiply(QP);
      d.bone.quaternion.premultiply(QW);
    }
    // Torso ROLL: the spine aim leaves rotation about the spine axis free —
    // match the shoulder line so the body genuinely tumbles sideways.
    {
      const spine = pelvisBone;
      spine.updateWorldMatrix(true, false);
      const shl = bones.get("DEF-upper_armL")!;
      const shr = bones.get("DEF-upper_armR")!;
      shl.getWorldPosition(TMP);
      shr.getWorldPosition(TMP2);
      CUR.subVectors(TMP2, TMP);
      WANT.set(P[SH_R].x - P[SH_L].x, P[SH_R].y - P[SH_L].y, P[SH_R].z - P[SH_L].z);
      AXIS.set(P[CHEST].x - P[PELVIS].x, P[CHEST].y - P[PELVIS].y, P[CHEST].z - P[PELVIS].z).normalize();
      // Project both onto the plane perpendicular to the spine.
      CUR.addScaledVector(AXIS, -CUR.dot(AXIS));
      WANT.addScaledVector(AXIS, -WANT.dot(AXIS));
      if (CUR.lengthSq() > 1e-6 && WANT.lengthSq() > 1e-6) {
        CUR.normalize();
        WANT.normalize();
        const cross = TMP.copy(CUR).cross(WANT);
        const angle = Math.atan2(cross.dot(AXIS), CUR.dot(WANT));
        QD.setFromAxisAngle(AXIS, angle);
        spine.parent!.getWorldQuaternion(QP);
        QW.copy(QP).invert().multiply(QD).multiply(QP);
        spine.quaternion.premultiply(QW);
      }
    }
    model.updateMatrixWorld(true);
  };

  return {
    tick(dt: number): boolean {
      if (done) return false;
      elapsed += dt * 1000;
      acc += Math.min(dt, 0.05);
      while (acc >= SUBSTEP) {
        acc -= SUBSTEP;
        step();
      }
      // Fastest particle decides "calm".
      let top = 0;
      for (const p of P) {
        const v = Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz) / SUBSTEP;
        if (v > top) top = v;
      }
      if (!settling && (elapsed > MAX_SIM_MS || (elapsed > 1_700 && top < SETTLE_SPEED * 2))) {
        settling = true;
      }
      if (settling) {
        calmFor = top < SETTLE_SPEED ? calmFor + dt : 0;
        const home = Math.hypot(restWX - P[PELVIS].x, restWZ - P[PELVIS].z);
        // A full second of stillness before the static corpse takes over —
        // the twitching tail of the flail is half the joke.
        if ((calmFor > 1.0 && home < 0.12) || elapsed > MAX_SIM_MS + 2_500) done = true;
      }
      driveBones();
      return !done;
    },
    pelvis(): { x: number; y: number; z: number } {
      return { x: P[PELVIS].x, y: P[PELVIS].y, z: P[PELVIS].z };
    },
    dispose(): void {
      done = true;
    },
  };
}
