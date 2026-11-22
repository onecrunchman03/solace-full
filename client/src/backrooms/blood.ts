// BLOOD (Aug 2026) — the dressing on the ragdoll. Three layers:
//
//  1. The BURST at the killing blow: a cone of droplet particles plus a fan
//     of short grid-marched rays (the spray can's wallHit) that stamp splat
//     decals on whatever wall or floor they find within a few cells.
//  2. IMPACT SMEARS: the ragdoll reports hard contacts; each one above the
//     pain threshold stamps a smear where the body actually hit.
//  3. The POOL under a corpse: spawned deterministically from the body id
//     whenever a body streams in, so a latecomer six hours on still finds
//     the body lying in its own blood — without the server persisting a
//     single decal row.
//
// Witness-only by design: bursts and smears live as long as the session
// keeps them (FIFO-capped), pools live exactly as long as their body does.
// All of it sits behind the pause menu's gore toggle; the ragdoll does not.

import * as THREE from "three";
import { CELL, wallHit, type WorldIndex } from "./world";
import { brSettings } from "./settings.svelte";

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Textures (procedural, like all the art down here) ----------------------
let splatTex: THREE.CanvasTexture | null = null;
let poolTex: THREE.CanvasTexture | null = null;

/** An irregular white blob + satellite droplets; the material tints it. */
function makeSplatTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#fff";
  const r = mulberry32(0xb100d);
  // Core blob, built from overlapping circles so the edge is ragged.
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 18;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 10 + r() * 16, 0, Math.PI * 2);
    g.fill();
  }
  // Satellite droplets, thrown outward.
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 26 + r() * 34;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.2 + r() * 3.6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft-edged pool — denser core, feathered rim. */
function makePoolTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = mulberry32(0xdead);
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 12;
    const rad = 26 + r() * 16;
    const cx = 64 + Math.cos(a) * d;
    const cy = 64 + Math.sin(a) * d;
    const grad = g.createRadialGradient(cx, cy, rad * 0.35, cx, cy, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const splatGeo = new THREE.PlaneGeometry(1, 1);
let splatMat: THREE.MeshBasicMaterial | null = null; // fresh red
let smearMat: THREE.MeshBasicMaterial | null = null; // darker, dried
let poolMat: THREE.MeshBasicMaterial | null = null;

function ensureMats(): void {
  if (splatMat) return;
  splatTex = makeSplatTex();
  poolTex = makePoolTex();
  const base = {
    map: splatTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  } as const;
  // Venous, not arcade: dark wet reds — the first pass read like paintball.
  splatMat = new THREE.MeshBasicMaterial({ ...base, color: 0x611010, opacity: 0.82 });
  smearMat = new THREE.MeshBasicMaterial({ ...base, color: 0x480b0b, opacity: 0.78 });
  poolMat = new THREE.MeshBasicMaterial({ ...base, map: poolTex, color: 0x3c0707, opacity: 0.85 });
}

// ---- Decal budget ------------------------------------------------------------
// Shared geometry + three shared materials means eviction is just removal.
const MAX_DECALS = 140;
const decals: THREE.Mesh[] = [];

function pushDecal(scene: THREE.Scene, mesh: THREE.Mesh): void {
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  scene.add(mesh);
  decals.push(mesh);
  if (decals.length > MAX_DECALS) {
    const old = decals.shift()!;
    old.parent?.remove(old);
  }
}

const WALL_OFF = 0.15; // in front of the drywall, behind the spray band's 0.165

function wallDecal(
  scene: THREE.Scene,
  face: string,
  cellX: number,
  cellY: number,
  u: number,
  y: number,
  size: number,
  spin: number,
  dried: boolean,
): void {
  ensureMats();
  const mesh = new THREE.Mesh(splatGeo, dried ? smearMat! : splatMat!);
  mesh.scale.setScalar(size);
  mesh.rotation.z = spin;
  if (face === "N") {
    mesh.position.set(cellX * CELL + u * CELL, y, cellY * CELL + WALL_OFF);
  } else if (face === "S") {
    mesh.position.set(cellX * CELL + u * CELL, y, (cellY + 1) * CELL - WALL_OFF);
    mesh.rotation.y = Math.PI;
  } else if (face === "E") {
    mesh.position.set((cellX + 1) * CELL - WALL_OFF, y, cellY * CELL + u * CELL);
    mesh.rotation.y = -Math.PI / 2;
  } else {
    mesh.position.set(cellX * CELL + WALL_OFF, y, cellY * CELL + u * CELL);
    mesh.rotation.y = Math.PI / 2;
  }
  pushDecal(scene, mesh);
}

function floorDecal(
  scene: THREE.Scene,
  wx: number,
  groundY: number,
  wz: number,
  size: number,
  spin: number,
  dried: boolean,
): void {
  ensureMats();
  const mesh = new THREE.Mesh(splatGeo, dried ? smearMat! : splatMat!);
  mesh.scale.setScalar(size);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = spin;
  mesh.position.set(wx, groundY + 0.012, wz);
  pushDecal(scene, mesh);
}

// ---- Droplet bursts ----------------------------------------------------------
interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
}
const bursts: Burst[] = [];

function spawnDroplets(
  scene: THREE.Scene,
  wx: number,
  wy: number,
  wz: number,
  dir: number,
  rng: () => number,
): void {
  const N = 46;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = wx;
    pos[i * 3 + 1] = wy;
    pos[i * 3 + 2] = wz;
    const a = dir + (rng() - 0.5) * 1.6;
    const sp = 1.5 + rng() * 3.5;
    vel[i * 3] = Math.sin(a) * sp;
    vel[i * 3 + 1] = 0.6 + rng() * 2.6;
    vel[i * 3 + 2] = Math.cos(a) * sp;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x560d0d,
    size: 0.055,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  bursts.push({ points, vel, life: 0.6 });
  if (bursts.length > 4) {
    const old = bursts.shift()!;
    old.points.parent?.remove(old.points);
    old.points.geometry.dispose();
    (old.points.material as THREE.Material).dispose();
  }
}

/** Take every splat and burst off the scene (Oct 2026 review): they were
 *  kept at their world coordinates through a level change, floating in the
 *  next level's geometry, and pinned the dead scene after the game closed. */
export function clearBlood(): void {
  for (const d of decals) d.parent?.remove(d);
  decals.length = 0;
  for (const b of bursts) {
    b.points.parent?.remove(b.points);
    b.points.geometry.dispose();
    (b.points.material as THREE.Material).dispose();
  }
  bursts.length = 0;
}

/** Advance the droplet bursts — call once per frame from the game loop. */
export function tickBlood(dt: number): void {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) {
      b.points.parent?.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
      bursts.splice(i, 1);
      continue;
    }
    const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let p = 0; p < arr.length; p += 3) {
      b.vel[p + 1] -= 10 * dt;
      arr[p] += b.vel[p] * dt;
      arr[p + 1] += b.vel[p + 1] * dt;
      arr[p + 2] += b.vel[p + 2] * dt;
    }
    pos.needsUpdate = true;
    (b.points.material as THREE.PointsMaterial).opacity = Math.min(1, b.life * 2.4);
  }
}

// ---- The public surface ------------------------------------------------------

/** The killing blow: droplets + a seeded fan of splat rays from the wound.
 *  (x,y) in cells, `h` the wound height in metres, `dir` the throw heading. */
export function bloodBurst(
  world: WorldIndex,
  scene: THREE.Scene,
  x: number,
  y: number,
  h: number,
  dir: number,
  seed: number,
): void {
  if (!brSettings.gore) return;
  const rng = mulberry32((seed ^ 0xb100d) >>> 0);
  spawnDroplets(scene, x * CELL, h, y * CELL, dir, rng);
  for (let i = 0; i < 9; i++) {
    const a = dir + (rng() - 0.5) * 2.0;
    const hit = wallHit(world, x, y, Math.sin(a), Math.cos(a), 3.4);
    if (hit) {
      const g = world.groundAt(x, y);
      const yy = Math.max(g + 0.15, h + (rng() - 0.5) * 0.9);
      wallDecal(scene, hit.face, hit.cellX, hit.cellY, hit.u, yy, 0.45 + rng() * 0.55, rng() * Math.PI, false);
    } else {
      const d = 0.4 + rng() * 1.9;
      const fx = x + Math.sin(a) * d;
      const fy = y + Math.cos(a) * d;
      floorDecal(scene, fx * CELL, world.groundAt(fx, fy), fy * CELL, 0.4 + rng() * 0.7, rng() * Math.PI, false);
    }
  }
}

/** A hard ragdoll contact — smear where the body actually hit. World metres. */
export function bloodImpact(
  world: WorldIndex,
  scene: THREE.Scene,
  i: { x: number; y: number; z: number; speed: number; kind: "wall" | "floor"; nx: number; nz: number },
): void {
  if (!brSettings.gore) return;
  const size = Math.min(1.4, 0.35 + i.speed * 0.12);
  const spin = ((i.x + i.z) * 7) % Math.PI; // stable, but varied
  if (i.kind === "floor") {
    floorDecal(scene, i.x, world.groundAt(i.x / CELL, i.z / CELL), i.z, size, spin, false);
    return;
  }
  // Which wall face took the hit: the impact sits ON the cell edge, and the
  // normal points back into the cell the body stayed in.
  if (i.nx !== 0) {
    const cellX = Math.floor(i.x / CELL + i.nx * 0.01);
    const cellY = Math.floor(i.z / CELL);
    wallDecal(scene, i.nx < 0 ? "E" : "W", cellX, cellY, (i.z / CELL) % 1, i.y, size, spin, false);
  } else {
    const cellX = Math.floor(i.x / CELL);
    const cellY = Math.floor(i.z / CELL + i.nz * 0.01);
    wallDecal(scene, i.nz < 0 ? "S" : "N", cellX, cellY, (i.x / CELL) % 1, i.y, size, spin, false);
  }
}

/** The dried pool under a streamed-in body — deterministic from the body id,
 *  so every client (and every revisit) draws the same stain. Returns the
 *  mesh; the caller owns its lifetime (remove when the body despawns). */
export function bloodPool(
  scene: THREE.Scene,
  wx: number,
  groundY: number,
  wz: number,
  id: number,
): THREE.Mesh | null {
  if (!brSettings.gore) return null;
  ensureMats();
  const rng = mulberry32((id * 2654435761) >>> 0);
  const mesh = new THREE.Mesh(splatGeo, poolMat!);
  mesh.scale.setScalar(1.1 + rng() * 0.8);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rng() * Math.PI * 2;
  mesh.position.set(wx + (rng() - 0.5) * 0.3, groundY + 0.01, wz + (rng() - 0.5) * 0.3);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
