// STAR DUST's props and its mess: the canister in the hand, the green stream
// off a gassed body, and the dissipating cloud where somebody used to be.
//
// Gore.ts's shape on purpose — self-contained, hard caps, no bookkeeping
// beyond a list, cleared when the hall is left. The smoke is NOT gated by the
// blood toggle: it's cartoon gas, and hiding it would hide the one warning a
// bystander gets that the person next to them is about to detonate.

import * as THREE from "three";

const CELL = 2;

/** The canister itself — procedural, because no prop in the hall looks like a
 *  compressed-gas can and drinkanim normalises whatever it's handed to bottle
 *  height anyway. A steel body, a green shoulder band, a valve. */
export function makeCanister(): THREE.Object3D {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0xb9c2c9 });
  const band = new THREE.MeshLambertMaterial({ color: 0x46e07a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x596066 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.78, 14), steel);
  body.position.y = 0.39;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.10, 14), band);
  shoulder.position.y = 0.70;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.10, 12), steel);
  neck.position.y = 0.86;
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 8), dark);
  valve.position.y = 0.97;
  const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.2), dark);
  nozzle.position.set(0, 1.0, 0.1);
  g.add(body, shoulder, neck, valve, nozzle);
  return g;
}

// ---- the particles ----------------------------------------------------------

interface Puff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
}

const MAX_PTS = 600;
let points: THREE.Points | null = null;
let geom: THREE.BufferGeometry | null = null;
let puffs: Puff[] = [];

interface Cloud {
  m: THREE.Sprite;
  life: number;
  max: number;
  grow: number;
}
const clouds: Cloud[] = [];
let cloudMat: THREE.SpriteMaterial | null = null;
let hostScene: THREE.Scene | null = null;

/** One soft green blot, shared by every cloud sprite. */
function cloudTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0, "rgba(110,235,130,0.85)");
  grad.addColorStop(0.55, "rgba(70,190,100,0.45)");
  grad.addColorStop(1, "rgba(40,140,70,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ensure(scene: THREE.Scene): void {
  if (hostScene === scene && points) return;
  hostScene = scene;
  geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * MAX_PTS), 3));
  points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      color: 0x5fe37a,
      size: 0.05,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);
  cloudMat = new THREE.SpriteMaterial({
    map: cloudTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.7,
  });
}

/**
 * The stream — "a small green smoke stream coming out of the player models
 * butt that dissipates quickly." Called per frame per gassed body; spawns at a
 * rate scaled by `strength` (1 = the over-half trickle, 2 = the maxed leak).
 * `pos` is the emission point in WORLD metres (the caller knows where the seat
 * of the trousers is); the puffs drift down-and-back and wink out inside a
 * second.
 */
let spawnDebt = 0;
export function gasStream(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  back: THREE.Vector3,
  strength: number,
  dt: number,
): void {
  ensure(scene);
  spawnDebt += dt * (strength >= 2 ? 34 : 12);
  while (spawnDebt >= 1) {
    spawnDebt -= 1;
    if (puffs.length >= MAX_PTS) puffs.shift();
    puffs.push({
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05)),
      vel: back
        .clone()
        .multiplyScalar(0.5 + Math.random() * 0.45 + (strength >= 2 ? 0.5 : 0))
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.12 + Math.random() * 0.3, (Math.random() - 0.5) * 0.25)),
      life: 0,
      max: 0.5 + Math.random() * 0.45,
    });
  }
}

/** The pop's cloud — "a small dissipating cloud" where the body burst. A ring
 *  of soft sprites that swell and thin out, plus a spurt of stream particles.
 *  Deterministic off the shared seed, like every death here. */
export function gasCloud(scene: THREE.Scene, x: number, y: number, groundY: number, seed: number): void {
  ensure(scene);
  let s = seed >>> 0;
  const r = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  if (!cloudMat) return;
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Sprite(cloudMat.clone());
    const a = r() * Math.PI * 2;
    const d = r() * 0.55;
    m.position.set(x * CELL + Math.sin(a) * d, groundY + 0.5 + r() * 0.8, y * CELL + Math.cos(a) * d);
    const sc = 0.5 + r() * 0.5;
    m.scale.setScalar(sc);
    scene.add(m);
    clouds.push({ m, life: 0, max: 1.2 + r() * 0.7, grow: 1.3 + r() * 1.2 });
  }
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const sp = 0.6 + r() * 2.2;
    if (puffs.length >= MAX_PTS) puffs.shift();
    puffs.push({
      pos: new THREE.Vector3(x * CELL, groundY + 0.9 + r() * 0.4, y * CELL),
      vel: new THREE.Vector3(Math.sin(a) * sp, 0.4 + r() * 1.6, Math.cos(a) * sp),
      life: 0,
      max: 0.7 + r() * 0.6,
    });
  }
}

/** Advance everything. Cheap no-op when the hall is clean. */
export function tickGasFx(dt: number): void {
  if (puffs.length && geom && points) {
    const arr = (geom.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    let n = 0;
    for (const p of puffs) {
      p.life += dt;
      p.vel.multiplyScalar(1 - 1.6 * dt); // gas, not shrapnel: it slows and hangs
      p.pos.addScaledVector(p.vel, dt);
      if (p.life >= p.max || n >= MAX_PTS) continue;
      arr[n * 3] = p.pos.x;
      arr[n * 3 + 1] = p.pos.y;
      arr[n * 3 + 2] = p.pos.z;
      n++;
    }
    puffs = puffs.filter((p) => p.life < p.max);
    geom.setDrawRange(0, n);
    (geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    points.visible = n > 0;
  }
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    c.life += dt;
    const t = c.life / c.max;
    c.m.scale.multiplyScalar(1 + c.grow * dt);
    c.m.position.y += 0.25 * dt;
    (c.m.material as THREE.SpriteMaterial).opacity = 0.7 * Math.max(0, 1 - t);
    if (c.life >= c.max) {
      c.m.parent?.remove(c.m);
      (c.m.material as THREE.SpriteMaterial).dispose();
      clouds.splice(i, 1);
    }
  }
}

/** Leaving the hall takes the gas with it (the gore rule). */
export function clearGasFx(): void {
  for (const c of clouds) {
    c.m.parent?.remove(c.m);
    (c.m.material as THREE.SpriteMaterial).dispose();
  }
  clouds.length = 0;
  puffs = [];
  if (points) {
    points.parent?.remove(points);
    (points.material as THREE.Material).dispose();
  }
  geom?.dispose();
  cloudMat?.map?.dispose();
  cloudMat?.dispose();
  points = null;
  geom = null;
  cloudMat = null;
  hostScene = null;
}
