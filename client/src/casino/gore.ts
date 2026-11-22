// THE MESS SLORP LEAVES. Josh: "your character explodes spraying blood
// everywhere."
//
// Self-contained on purpose. The backrooms has a full blood system, but its
// decals are keyed to a WorldIndex — that world's class, its wall faces, its
// chunk streaming — and the hall is a different world object entirely. What a
// casino needs is smaller anyway: one violent moment, in a room with a flat
// floor and no streaming, so this is a particle spray and a set of floor
// splats with a hard cap and no bookkeeping beyond a list.
//
// It obeys the SAME player setting as the backrooms' gore (`brSettings.gore`):
// somebody who turned blood off in the pause menu doesn't get sprayed with it
// because they walked into a casino.

import * as THREE from "three";
import { brSettings } from "../backrooms/settings.svelte";

const CELL = 2;
/** Every splat on the floor at once, oldest reused first. A trip is rare and
 *  the room is small; this is generous and still bounded. */
const MAX_SPLATS = 96;

interface Drop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

let points: THREE.Points | null = null;
let geom: THREE.BufferGeometry | null = null;
let drops: Drop[] = [];
const splats: THREE.Mesh[] = [];
let splatMat: THREE.MeshBasicMaterial | null = null;
let hostScene: THREE.Scene | null = null;

/** A soft round blot, drawn once and shared by every splat. Radial alpha with
 *  a couple of lobes, so a decal reads as spilled rather than stamped. */
function splatTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  const blob = (cx: number, cy: number, r: number, a: number): void => {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(120,4,6,${a})`);
    grad.addColorStop(0.72, `rgba(88,2,4,${a * 0.85})`);
    grad.addColorStop(1, "rgba(70,0,2,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(64, 64, 52, 0.95);
  blob(40, 78, 22, 0.8);
  blob(88, 50, 18, 0.7);
  blob(78, 92, 13, 0.6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ensure(scene: THREE.Scene): void {
  if (hostScene === scene && points) return;
  hostScene = scene;
  geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 512), 3));
  points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({ color: 0x8e0509, size: 0.075, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  points.frustumCulled = false;
  scene.add(points);
  splatMat = new THREE.MeshBasicMaterial({
    map: splatTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
}

/** Lay one splat flat on the floor at cell (x, y). */
function splat(scene: THREE.Scene, x: number, y: number, groundY: number, size: number, spin: number): void {
  if (!splatMat) return;
  const m = splats.length < MAX_SPLATS
    ? new THREE.Mesh(new THREE.PlaneGeometry(1, 1), splatMat)
    : (splats.shift() as THREE.Mesh);
  m.geometry.dispose?.();
  m.geometry = new THREE.PlaneGeometry(size, size);
  m.rotation.set(-Math.PI / 2, 0, spin);
  // 12mm off the carpet: enough to beat z-fighting, invisible from eye height.
  m.position.set(x * CELL, groundY + 0.012, y * CELL);
  if (!m.parent) scene.add(m);
  splats.push(m);
}

/** Deterministic per-explosion, so every screen paints the same mess. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A body coming apart at cell (x, y). Droplets fly, and where they land (or
 * immediately, for the pool) the carpet keeps it.
 *
 * `groundY` is the floor under the body — the hall has a stage, so this can't
 * be assumed to be zero.
 */
export function bloodExplosion(
  scene: THREE.Scene,
  x: number,
  y: number,
  groundY: number,
  seed: number,
): void {
  if (!brSettings.gore) return;
  ensure(scene);
  const r = rng(seed ^ 0x5107);
  // The spray: a hemisphere of droplets, faster upward than sideways so it
  // reads as a burst rather than a puff.
  for (let i = 0; i < 150; i++) {
    const a = r() * Math.PI * 2;
    const sp = 1.4 + r() * 5.2;
    const up = 1.2 + r() * 4.6;
    drops.push({
      pos: new THREE.Vector3(x * CELL + (r() - 0.5) * 0.3, groundY + 1.0 + r() * 0.5, y * CELL + (r() - 0.5) * 0.3),
      vel: new THREE.Vector3(Math.sin(a) * sp * 0.5, up, Math.cos(a) * sp * 0.5),
      life: 1.4 + r() * 1.2,
    });
  }
  // …and the ground truth: a pool where they stood, and a ring of throw-off
  // out to about three metres, which is what "everywhere" looks like at
  // human scale in a room this size.
  splat(scene, x, y, groundY, 1.5 + r() * 0.6, r() * Math.PI);
  for (let i = 0; i < 20; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.25 + r() * 1.9; // cells — out to ~4m, "everywhere" at this scale
    splat(scene, x + Math.sin(a) * d, y + Math.cos(a) * d, groundY, 0.35 + r() * 0.85, r() * Math.PI);
  }
}

/** Advance the droplets. Cheap no-op when nothing is in the air. */
export function tickGore(dt: number, groundY: number): void {
  if (!drops.length || !geom || !points) return;
  const arr = (geom.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
  let n = 0;
  for (const d of drops) {
    d.life -= dt;
    d.vel.y -= 9.8 * dt;
    d.pos.addScaledVector(d.vel, dt);
    if (d.pos.y <= groundY + 0.02) {
      d.pos.y = groundY + 0.02;
      d.life = Math.min(d.life, 0.12); // it has landed; let it wink out
      d.vel.set(0, 0, 0);
    }
    if (d.life <= 0 || n >= 512) continue;
    arr[n * 3] = d.pos.x;
    arr[n * 3 + 1] = d.pos.y;
    arr[n * 3 + 2] = d.pos.z;
    n++;
  }
  drops = drops.filter((d) => d.life > 0);
  geom.setDrawRange(0, n);
  (geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  points.visible = n > 0;
}

/** Leaving the hall takes the mess with it — the floor is rebuilt on entry,
 *  so a stale decal from last night would otherwise arrive with the room. */
export function clearGore(): void {
  for (const m of splats) {
    m.parent?.remove(m);
    m.geometry.dispose();
  }
  splats.length = 0;
  drops = [];
  if (points) {
    points.parent?.remove(points);
    (points.material as THREE.Material).dispose();
  }
  geom?.dispose();
  splatMat?.map?.dispose();
  splatMat?.dispose();
  points = null;
  geom = null;
  splatMat = null;
  hostScene = null;
}
