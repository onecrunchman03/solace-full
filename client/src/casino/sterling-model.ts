// STERLING IN 3D — the one body every 3D Sterling wears (Josh, Oct 2026: "all
// instances of sterlings whether that be 2d or 3d should look the same").
//
// Drawn from the Trader's portrait (Shop.svelte, "Sterling v3"), which is the
// canonical picture of him: a black felt top hat with a brass band and buckle,
// an antenna with a glowing bobble, a rounded copper head with side rivets,
// brass goggles on a strap with cyan lenses, a brass wire mustache over the
// amber grill he talks through, a waistcoat panel with three brass buttons and
// a pocket-watch chain, a porthole in his belly with a turning teal gear, and
// jointed arms with brass shoulders and elbows ending in three-finger hands.
//
// The casino bar (world.ts) and the escape room's counter (EscapeRoom.svelte)
// both build him here, so the two can't drift apart again — before this file
// the escape room's Sterling was a copper capsule with a hat on.
//
// Units are metres. The origin is between his feet, he faces +z, and he stands
// 2.1m to the hat's crown. Everything that has to read sits above 1.05m,
// because he always works behind a counter about that high.
//
// HE MOVES (Josh, Oct 2026: "add some animations to the 3d sterling make more
// life like"). All of it is procedural and runs from `tick`, so both rooms get
// the same Sterling doing the same things:
//   · he breathes — the upper body rises and settles, and sways a touch
//   · he LOOKS at whoever is near him, and glances about when nobody is
//   · his lenses blink now and then (sometimes twice)
//   · his antenna lags behind his head and wobbles back, on a spring
//   · talking, he nods, tilts his head and talks with one hand, and the
//     belly gear runs faster
//   · somebody walking up gets a tip of the hat
//   · left alone, he polishes a glass
// The arms are solved with two-bone IK from a wrist target, so a new gesture
// is just a new place to put his hand.
//
// Static parts are merged into one mesh per material per moving part (about
// twenty draws for the whole man).

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface SterlingTickOpts {
  /** Where the nearest person's head is, in WORLD space — he looks at it.
   *  Null when nobody's about. */
  look?: THREE.Vector3 | null;
  /** True while his voice is playing. */
  talking?: boolean;
  /** How fast he's gliding sideways along his bar, m/s (+x is his left). */
  vx?: number;
  /** Tip the hat on his own when somebody walks up (default). Off when the
   *  caller decides who he greets (the casino bar: the server does). */
  autoTip?: boolean;
}

export interface SterlingFigure {
  group: THREE.Group;
  /** The belly gear (tick turns it). */
  gear: THREE.Object3D;
  /** The grill's glow — the caller flickers its colour while he talks. */
  mouth: THREE.MeshBasicMaterial;
  /** Advance every animation by `dt` seconds. */
  tick(dt: number, opts?: SterlingTickOpts): void;
  /** Tip the hat now (unless he's mid-tip). */
  tipHat(): void;
  /** The moving parts, read-only, for scripts/checks/test_bar_sterling.mjs. */
  debug: SterlingDebug;
}

export interface SterlingDebug {
  upper: THREE.Object3D; head: THREE.Object3D; hat: THREE.Object3D; antenna: THREE.Object3D;
  glass: THREE.Object3D; lens: THREE.MeshBasicMaterial;
  arms: { side: number; shoulder: THREE.Vector3; elbow: THREE.Object3D; hand: THREE.Object3D }[];
  UPPER_LEN: number; FORE_LEN: number; BRIM: number; LENS: number; WAIST: number;
  torsoR(y: number): number;
}

/** The grill's resting glow. */
export const STERLING_MOUTH = 0xffb347;

const LENS = 0x5fe0ee;
const LENS_SHUT = 0x0d2629;

export function buildSterlingFigure(): SterlingFigure {
  const copper = new THREE.MeshLambertMaterial({ color: 0xbd7434 });
  const copperDark = new THREE.MeshLambertMaterial({ color: 0x84491c });
  const brass = new THREE.MeshLambertMaterial({ color: 0xd8ae5a, emissive: 0x2e2008 });
  const felt = new THREE.MeshLambertMaterial({ color: 0x2b1d10 });
  const ink = new THREE.MeshLambertMaterial({ color: 0x1a1208 }); // goggle glass, grill surround
  const lens = new THREE.MeshBasicMaterial({ color: LENS });
  const shine = new THREE.MeshBasicMaterial({ color: 0xf4fdff });
  const bobble = new THREE.MeshBasicMaterial({ color: 0xffd98f });
  const dial = new THREE.MeshLambertMaterial({ color: 0xe9f2ec, emissive: 0x1c2420 });
  const teal = new THREE.MeshLambertMaterial({ color: 0x6f9a8c });
  const mouth = new THREE.MeshBasicMaterial({ color: STERLING_MOUTH });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xc9dde4, emissive: 0x1d2a30 });
  const rag = new THREE.MeshLambertMaterial({ color: 0xe8e0cc });

  // A BATCH collects static pieces for one moving part, then merges them into
  // one mesh per material under that part's group.
  type Batch = Map<THREE.Material, THREE.BufferGeometry[]>;
  const tmp = new THREE.Object3D();
  const add = (b: Batch, mat: THREE.Material, g: THREE.BufferGeometry): void => {
    if (!b.has(mat)) b.set(mat, []);
    b.get(mat)!.push(g);
  };
  /** Bake a piece into batch `b` at a position/rotation/scale. */
  const put = (
    b: Batch, geo: THREE.BufferGeometry, mat: THREE.Material,
    x: number, y: number, z: number,
    rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1,
  ): void => {
    tmp.position.set(x, y, z);
    tmp.rotation.set(rx, ry, rz);
    tmp.scale.set(sx, sy, sz);
    tmp.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(tmp.matrix);
    add(b, mat, g);
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);
  /** A rod from a to b, baked into batch `bt`. */
  const rod = (bt: Batch, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material): void => {
    const g = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 10).toNonIndexed();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    add(bt, mat, g);
  };
  const flush = (b: Batch, into: THREE.Object3D): void => {
    for (const [mat, geos] of b) {
      const merged = mergeGeometries(geos);
      for (const g of geos) g.dispose();
      if (merged) into.add(new THREE.Mesh(merged, mat));
    }
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const group = new THREE.Group();

  // ---- the skirt stands still; everything above the waist breathes ----------
  const base: Batch = new Map();
  put(base, new THREE.CylinderGeometry(0.24, 0.3, 0.76, 14), copperDark, 0, 0.38, 0);
  flush(base, group);

  const WAIST = 0.75;
  const upper = new THREE.Group(); // origin at the waist
  upper.position.y = WAIST;
  group.add(upper);
  const body: Batch = new Map();
  // (everything in `upper` is placed in its own frame: y measured from the waist)
  const T_TOP = 1.43 - WAIST, R_TOP = 0.27, R_BOT = 0.24;
  put(body, new THREE.CylinderGeometry(R_TOP, R_BOT, T_TOP, 16), copper, 0, T_TOP / 2, 0); // torso
  put(body, new THREE.SphereGeometry(R_TOP, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), copper, 0, T_TOP, 0, 0, 0, 0, 1, 0.32, 1); // domed shoulders
  const torsoR = (y: number): number => R_BOT + (y / T_TOP) * (R_TOP - R_BOT);
  // the waistcoat panel down his front
  put(body, new THREE.CylinderGeometry(R_TOP + 0.007, R_BOT + 0.007, 0.62, 12, 1, true, -0.72, 1.44), copperDark, 0, T_TOP - 0.33, 0);
  // three brass buttons on the left edge of the panel (as you face him)
  for (const wy of [1.36, 1.29, 1.22]) {
    const y = wy - WAIST, x = -0.15, r = torsoR(y) + 0.008;
    put(body, new THREE.SphereGeometry(0.017, 8, 6), brass, x, y, Math.sqrt(r * r - x * x));
  }
  // the pocket-watch chain, beaded across to its fob
  const chain = new THREE.QuadraticBezierCurve3(v(0.05, 1.39 - WAIST, 0), v(0.16, 1.35 - WAIST, 0), v(0.175, 1.26 - WAIST, 0));
  for (let i = 0; i <= 7; i++) {
    const p = chain.getPoint(i / 7), r = torsoR(p.y) + 0.009;
    put(body, new THREE.SphereGeometry(0.008, 6, 4), brass, p.x, p.y, Math.sqrt(r * r - p.x * p.x));
  }
  {
    const x = 0.18, y = 1.24 - WAIST, r = torsoR(y) + 0.006;
    put(body, new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12), brass, x, y, Math.sqrt(r * r - x * x), Math.PI / 2, Math.atan2(x, r), 0);
  }
  // the porthole in his belly
  const GEAR_Y = 1.18 - WAIST, PORT_R = 0.125, PORT_Z = torsoR(GEAR_Y) - 0.02;
  put(body, new THREE.CylinderGeometry(PORT_R, PORT_R, 0.07, 20), brass, 0, GEAR_Y, PORT_Z, Math.PI / 2);
  put(body, new THREE.CircleGeometry(PORT_R - 0.02, 20), dial, 0, GEAR_Y, PORT_Z + 0.036);
  // brass shoulder balls + the neck
  const SHOULDER_Y = 1.39 - WAIST;
  for (const s of [-1, 1]) put(body, new THREE.SphereGeometry(0.06, 12, 8), brass, s * 0.29, SHOULDER_Y, 0);
  put(body, new THREE.CylinderGeometry(0.055, 0.06, 0.08, 10), copperDark, 0, 1.47 - WAIST, 0);
  flush(body, upper);

  const gear = new THREE.Group();
  gear.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 18), teal));
  gear.add(new THREE.Mesh(new THREE.CircleGeometry(0.016, 10), teal));
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.008), teal);
    tooth.position.set(Math.sin(a) * 0.072, Math.cos(a) * 0.072, 0);
    tooth.rotation.z = -a;
    gear.add(tooth);
  }
  gear.position.set(0, GEAR_Y, PORT_Z + 0.04);
  upper.add(gear);

  // ---- the arms: an upper arm, a brass elbow, a forearm and a hand, each its
  //      own piece so two-bone IK can place them every frame -----------------
  const UPPER_LEN = 0.26, FORE_LEN = 0.225;
  interface Arm {
    side: number;
    shoulder: THREE.Vector3;
    upperArm: THREE.Object3D; elbow: THREE.Object3D; fore: THREE.Object3D; hand: THREE.Object3D;
    wrist: THREE.Vector3; // the hand's current spot (smoothed)
  }
  const segment = (len: number, r0: number, r1: number, mat: THREE.Material): THREE.Group => {
    // built hanging from its pivot along -y, so pointing it is one quaternion
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 10), mat);
    m.position.y = -len / 2;
    g.add(m);
    upper.add(g);
    return g;
  };
  const arms: Arm[] = [-1, 1].map((side) => {
    const upperArm = segment(UPPER_LEN, 0.05, 0.045, copper);
    const fore = segment(FORE_LEN, 0.042, 0.036, copperDark);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), brass);
    upper.add(elbow);
    const hand = new THREE.Group();
    const hb: Batch = new Map();
    put(hb, new THREE.SphereGeometry(0.045, 10, 8), copper, 0, -0.02, 0, 0, 0, 0, 1, 0.8, 1); // palm
    for (const f of [-1, 0, 1]) {
      const root = v(f * 0.026, -0.04, 0.02);
      rod(hb, root, root.clone().add(v(f * 0.008, -0.05, 0.03)), 0.013, 0.011, copper); // three fingers
    }
    flush(hb, hand);
    upper.add(hand);
    const wrist = v(side * 0.3, 1.0 - WAIST, 0.2);
    return { side, shoulder: v(side * 0.29, SHOULDER_Y, 0), upperArm, elbow, fore, hand, wrist };
  });
  // the glass he polishes, and the cloth he polishes it with (hidden between)
  const glass = new THREE.Group();
  glass.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.13, 14), glassMat));
  glass.visible = false;
  upper.add(glass);
  const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), rag);
  cloth.scale.set(1, 0.6, 1);
  cloth.visible = false;
  upper.add(cloth);

  // ---- the head (neck pivot), the hat on it, the antenna on the hat ---------
  const NECK = 1.49 - WAIST;
  const head = new THREE.Group();
  head.position.y = NECK;
  upper.add(head);
  const hd: Batch = new Map();
  // (head frame: y measured from the neck pivot at 1.49m)
  const Y = (worldY: number): number => worldY - 1.49;
  const H_W = 0.44, H_H = 0.35, H_D = 0.36, FRONT = H_D / 2;
  put(hd, new RoundedBoxGeometry(H_W, H_H, H_D, 3, 0.09), copper, 0, Y(1.64), 0);
  for (const s of [-1, 1]) put(hd, new THREE.SphereGeometry(0.024, 8, 6), brass, s * (H_W / 2 + 0.004), Y(1.66), 0); // side rivets
  // goggles: a strap round the head, two brass cups, dark glass, cyan lenses
  const EYE_Y = Y(1.69), EYE_X = 0.095;
  put(hd, new RoundedBoxGeometry(H_W + 0.014, 0.036, H_D + 0.014, 2, 0.08), ink, 0, EYE_Y, 0);
  for (const s of [-1, 1]) {
    const x = s * EYE_X;
    put(hd, new THREE.CylinderGeometry(0.084, 0.088, 0.05, 20), brass, x, EYE_Y, FRONT + 0.012, Math.PI / 2);
    put(hd, new THREE.CircleGeometry(0.064, 20), ink, x, EYE_Y, FRONT + 0.038);
    put(hd, new THREE.CircleGeometry(0.042, 18), lens, x, EYE_Y, FRONT + 0.039);
    put(hd, new THREE.CircleGeometry(0.012, 8), shine, x - 0.014, EYE_Y + 0.016, FRONT + 0.040);
  }
  put(hd, new THREE.BoxGeometry(0.04, 0.034, 0.03), brass, 0, EYE_Y, FRONT + 0.012); // bridge
  rod(hd, v(0.165, Y(1.735), FRONT + 0.02), v(0.195, Y(1.765), FRONT + 0.02), 0.009, 0.009, brass); // the little lever
  // the brass wire mustache, curling up at both ends
  const stache = new THREE.CatmullRomCurve3([
    v(-0.125, Y(1.578), FRONT + 0.012), v(-0.075, Y(1.552), FRONT + 0.016), v(0, Y(1.572), FRONT + 0.02),
    v(0.075, Y(1.552), FRONT + 0.016), v(0.125, Y(1.578), FRONT + 0.012),
  ]);
  put(hd, new THREE.TubeGeometry(stache, 24, 0.011, 6, false), brass, 0, 0, 0);
  for (const s of [-1, 1]) put(hd, new THREE.SphereGeometry(0.014, 8, 6), brass, s * 0.127, Y(1.58), FRONT + 0.012);
  // the grill: a dark surround, the glow behind it, three vertical slats
  const G_Y = Y(1.515);
  put(hd, new THREE.BoxGeometry(0.165, 0.066, 0.02), ink, 0, G_Y, FRONT + 0.004);
  for (const x of [-0.04, 0, 0.04]) put(hd, new THREE.BoxGeometry(0.011, 0.054, 0.01), ink, x, G_Y, FRONT + 0.022);
  flush(hd, head);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.038, 0.008), mouth);
  glow.position.set(0, G_Y, FRONT + 0.016);
  head.add(glow);

  // the hat sits on the head and lifts off it for a tip (pivot at the brim)
  const BRIM = Y(1.83);
  const hat = new THREE.Group();
  hat.position.y = BRIM;
  head.add(hat);
  const ht: Batch = new Map();
  put(ht, new THREE.CylinderGeometry(0.31, 0.31, 0.03, 24), felt, 0, 0, 0); // brim
  put(ht, new THREE.CylinderGeometry(0.212, 0.198, 0.32, 24), felt, 0, 0.17, 0); // crown, wider at the top
  put(ht, new THREE.CylinderGeometry(0.203, 0.201, 0.06, 24), brass, 0, 0.055, 0); // band
  for (const [w, h, x, y] of [[0.07, 0.008, 0, 0.076], [0.07, 0.008, 0, 0.034], [0.008, 0.05, -0.031, 0.055], [0.008, 0.05, 0.031, 0.055]]) {
    put(ht, new THREE.BoxGeometry(w, h, 0.008), ink, x, y, 0.205); // the buckle
  }
  flush(ht, hat);
  // the antenna, leaning out from behind the crown — its own pivot so it can
  // wobble on a spring
  const antenna = new THREE.Group();
  antenna.position.set(0.17, 0.03, -0.12);
  hat.add(antenna);
  const an: Batch = new Map();
  const tip = v(0.13, 0.26, 0);
  rod(an, v(0, 0, 0), tip, 0.011, 0.009, copperDark);
  put(an, new THREE.SphereGeometry(0.03, 10, 8), bobble, tip.x, tip.y, tip.z);
  flush(an, antenna);

  // ---- the animation -----------------------------------------------------------
  const rand = (a: number, b: number): number => a + Math.random() * (b - a);
  /** A critically damped spring towards a target — natural, never overshoots. */
  const spring = (s: { x: number; v: number }, target: number, k: number, dt: number): void => {
    s.v += (k * k * (target - s.x) - 2 * k * s.v) * dt;
    s.x += s.v * dt;
  };
  let t = Math.random() * 10;
  const yaw = { x: 0, v: 0 }, pitch = { x: 0, v: 0 }, roll = { x: 0, v: 0 };
  // antenna: an UNDERDAMPED spring, so it wobbles
  const ant = { x: 0, v: 0, z: 0, vz: 0 };
  let lastYaw = 0, lastPitch = 0, lastVx = 0;
  const lean = { x: 0 };
  let glanceT = rand(1.5, 4), glanceYaw = 0, glancePitch = 0;
  let blinkT = rand(2, 5), blinkLeft = 0, blinkAgain = false, secondBlink = false;
  let tipT = 0; // seconds into a hat tip (0 = none)
  let tipCd = 0;
  let wasNear = false;
  let polishT = 0, polishCd = rand(6, 12); // seconds left of a polish
  const lookLocal = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const qa = new THREE.Quaternion();

  /** Place an arm's three pieces so the hand lands on `w` (upper-body frame). */
  const solve = (arm: Arm, w: THREE.Vector3): void => {
    const S = arm.shoulder;
    const toT = tmpV.copy(w).sub(S);
    let d = toT.length();
    const a = UPPER_LEN, b = FORE_LEN;
    d = Math.min(Math.max(d, Math.abs(a - b) + 0.01), a + b - 0.002);
    const dir = toT.normalize();
    // the elbow bends out and back, like a man's
    pole.set(arm.side * 1.5, -0.35, -0.4);
    pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const E = S.clone().add(dir.clone().multiplyScalar(a * cosA)).add(pole.multiplyScalar(a * sinA));
    const W = S.clone().add(dir.multiplyScalar(d));
    arm.upperArm.position.copy(S);
    arm.upperArm.quaternion.setFromUnitVectors(DOWN, E.clone().sub(S).normalize());
    arm.elbow.position.copy(E);
    arm.fore.position.copy(E);
    qa.setFromUnitVectors(DOWN, W.clone().sub(E).normalize());
    arm.fore.quaternion.copy(qa);
    arm.hand.position.copy(W);
    arm.hand.quaternion.copy(qa);
  };

  const tick = (dt: number, opts: SterlingTickOpts = {}): void => {
    dt = Math.min(dt, 0.1);
    t += dt;
    const talking = !!opts.talking;
    const vx = opts.vx ?? 0;
    const moving = Math.abs(vx) > 0.25;
    const accel = (vx - lastVx) / Math.max(dt, 1e-3);
    lastVx = vx;

    // breathing: rise and settle, a little sway
    upper.position.y = WAIST + Math.sin(t * 1.5) * 0.005;
    // gliding: he leans into it, a touch more the faster he goes
    lean.x += (Math.max(-0.09, Math.min(0.09, -vx * 0.055)) - lean.x) * (1 - Math.exp(-dt * 6));
    upper.rotation.z = Math.sin(t * 0.55) * 0.012 + lean.x;
    upper.rotation.x = Math.sin(t * 0.8 + 1) * 0.008;
    gear.rotation.z -= dt * (talking ? 1.7 : moving ? 2.4 : 0.55);

    // WHERE HE LOOKS
    let near = false, engaged = false;
    let tYaw = glanceYaw, tPitch = glancePitch;
    if (opts.look) {
      lookLocal.copy(opts.look);
      group.worldToLocal(lookLocal);
      const dx = lookLocal.x, dz = lookLocal.z, dy = lookLocal.y - 1.66;
      const flat = Math.hypot(dx, dz);
      if (flat < 7 && dz > -0.5) {
        engaged = true;
        near = flat < 3.4;
        tYaw = Math.max(-0.95, Math.min(0.95, Math.atan2(dx, dz)));
        tPitch = Math.max(-0.45, Math.min(0.3, -Math.atan2(dy, Math.max(flat, 0.3))));
      }
    }
    if (moving) {
      // on the move he looks where he's going, then at them as he arrives
      engaged = engaged && Math.abs(vx) < 0.6;
      if (!engaged) { tYaw = Math.sign(vx) * 0.75; tPitch = 0.05; }
    }
    if (!engaged && !moving) {
      // nobody to look at: glance about, and down at the glass while polishing
      glanceT -= dt;
      if (glanceT <= 0) {
        glanceT = rand(2.2, 6);
        glanceYaw = rand(-0.6, 0.6);
        glancePitch = rand(-0.25, 0.08);
      }
      if (polishT > 0) { tYaw = -0.05; tPitch = 0.35; }
    }
    // greet a newcomer with a tip of the hat
    tipCd -= dt;
    if ((opts.autoTip ?? true) && near && !wasNear && tipCd <= 0 && !talking) { tipT = 0.0001; tipCd = 25; polishT = 0; }
    wasNear = near;

    // talking: nods and a listening tilt
    const nod = talking ? Math.sin(t * 7.5) * 0.045 + Math.sin(t * 3.1) * 0.02 : 0;
    const tRoll = talking ? Math.sin(t * 0.9) * 0.09 : Math.sin(t * 0.4) * 0.03;
    spring(yaw, tYaw, 5, dt);
    spring(pitch, tPitch, 5, dt);
    spring(roll, tRoll, 3, dt);
    head.rotation.set(pitch.x + nod, yaw.x, roll.x, "YXZ");

    // the antenna lags the head, then wobbles home
    const dYaw = (yaw.x - lastYaw) / Math.max(dt, 1e-3), dPitch = (pitch.x - lastPitch) / Math.max(dt, 1e-3);
    lastYaw = yaw.x; lastPitch = pitch.x;
    // side to side: his head turning, and his starts and stops along the bar
    ant.v += (-90 * ant.x - 3.2 * ant.v + dYaw * 6 + accel * 0.35) * dt;
    ant.x += ant.v * dt;
    ant.vz += (-90 * ant.z - 3.2 * ant.vz - dPitch * 6 + (talking ? Math.sin(t * 15) * 4 : 0)) * dt;
    ant.z += ant.vz * dt;
    antenna.rotation.set(ant.z, 0, ant.x);

    // blinking: the lenses shutter dark for a tenth of a second
    if (blinkLeft > 0) {
      blinkLeft -= dt;
      if (blinkLeft <= 0) {
        lens.color.setHex(LENS);
        if (blinkAgain) { blinkAgain = false; secondBlink = true; blinkT = 0.14; }
      }
    } else {
      blinkT -= dt;
      if (blinkT <= 0) {
        blinkLeft = 0.1;
        lens.color.setHex(LENS_SHUT);
        blinkAgain = !secondBlink && Math.random() < 0.2;
        secondBlink = false;
        blinkT = rand(2.5, 6.5);
      }
    }

    // somebody to serve, or on the move: the glass goes down first
    if ((engaged || moving || talking) && polishT > 0) { polishT = 0; polishCd = rand(8, 16); }
    // THE HANDS — pick a spot for each wrist, then ease towards it
    const [L, R] = arms;
    const restL = goal.set(-0.31, 1.0 - WAIST, 0.18);
    const wantL = restL.clone(), wantR = v(0.31, 1.0 - WAIST, 0.18);
    wantL.y += Math.sin(t * 1.5) * 0.004;
    wantR.y += Math.sin(t * 1.5 + 0.4) * 0.004;
    if (moving) {
      // hands trail the glide a little
      const trail = Math.max(-0.06, Math.min(0.06, -vx * 0.035));
      wantL.x += trail; wantR.x += trail;
      wantL.z -= 0.03; wantR.z -= 0.03;
    }
    let showGlass = false;
    if (tipT > 0) {
      // the tip: right hand up to the brim, the hat lifts and tilts, back down
      tipT += dt;
      const up = tipT < 0.35 ? tipT / 0.35 : tipT < 0.95 ? 1 : Math.max(0, 1 - (tipT - 0.95) / 0.4);
      const e = up * up * (3 - 2 * up);
      wantR.lerp(tmpV.set(0.22, 1.76 - WAIST, 0.12), e);
      hat.position.y = BRIM + e * 0.06;
      hat.rotation.x = e * 0.22;
      hat.rotation.z = -e * 0.12;
      if (tipT > 1.4) { tipT = 0; hat.position.y = BRIM; hat.rotation.set(0, 0, 0); }
    } else if (talking) {
      // he talks with his right hand
      wantR.set(0.27 + Math.sin(t * 2.3) * 0.04, 1.14 - WAIST + Math.sin(t * 3.4) * 0.05, 0.27 + Math.sin(t * 1.7) * 0.03);
    } else {
      polishCd -= dt;
      if (polishT <= 0 && polishCd <= 0 && !engaged && !moving) { polishT = rand(5, 9); }
      if (polishT > 0) {
        polishT -= dt;
        if (polishT <= 0) polishCd = rand(8, 16);
        // left hand holds the glass up, right hand circles inside its rim
        showGlass = true;
        // (held out in front: at 0.27 the right hand's circle dipped into his
        // barrel — test_bar_sterling caught it)
        wantL.set(-0.06, 1.3 - WAIST, 0.34);
        const a = t * 5;
        wantR.set(0.03 + Math.cos(a) * 0.03, 1.37 - WAIST, 0.35 + Math.sin(a) * 0.02);
      }
    }
    const ease = 1 - Math.exp(-dt * (tipT > 0 ? 14 : 8));
    L.wrist.lerp(wantL, ease);
    R.wrist.lerp(wantR, ease);
    solve(L, L.wrist);
    solve(R, R.wrist);
    glass.visible = showGlass && L.wrist.distanceTo(wantL) < 0.05;
    cloth.visible = glass.visible;
    if (glass.visible) {
      glass.position.set(L.wrist.x + 0.035, L.wrist.y + 0.02, L.wrist.z + 0.03);
      cloth.position.set(R.wrist.x, R.wrist.y - 0.02, R.wrist.z + 0.02);
    }
  };
  const tipHat = (): void => {
    if (tipT > 0) return;
    tipT = 0.0001; tipCd = 25; polishT = 0;
  };
  tick(0);
  const debug: SterlingDebug = {
    upper, head, hat, antenna, glass, lens,
    arms: arms.map((a) => ({ side: a.side, shoulder: a.shoulder, elbow: a.elbow, hand: a.hand })),
    UPPER_LEN, FORE_LEN, BRIM, LENS, WAIST, torsoR,
  };
  return { group, gear, mouth, tick, tipHat, debug };
}
