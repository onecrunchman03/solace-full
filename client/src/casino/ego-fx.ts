// EGO's props and its aftermath: the goopy shot glass in the hand, and the
// confetti a head becomes. stardust-fx's shape — self-contained, capped,
// cleared when the hall is left.

import * as THREE from "three";

const CELL = 2;

/** The shot glass — procedural, like the canister (no prop in the hall is a
 *  shot glass): a squat tapered tumbler of near-clear glass with a slug of
 *  iridescent goop sitting in it, gold flecks and all. drinkanim normalises
 *  whatever it's handed, so this is authored at its own comfortable size. */
export function makeShotGlass(): THREE.Object3D {
  const g = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({
    color: 0xdfe8ec,
    transparent: true,
    opacity: 0.34,
  });
  const goop = new THREE.MeshLambertMaterial({ color: 0x7a5ae0, emissive: 0x2a1a60 });
  const fleck = new THREE.MeshLambertMaterial({ color: 0xe8c33c, emissive: 0x6a561a });
  // tapered tumbler: narrower foot, wider lip, thick base
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.62, 12, 1, true), glass);
  wall.position.y = 0.36;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.1, 12), glass);
  base.position.y = 0.05;
  // the goop: a fat slug filling two-thirds, domed on top — it does not slosh
  const slug = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.34, 12), goop);
  slug.position.y = 0.28;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.295, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), goop);
  dome.position.y = 0.45;
  g.add(wall, base, slug, dome);
  // three gold flecks caught in the surface
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), fleck);
    const a = (i / 3) * Math.PI * 2 + 0.6;
    f.position.set(Math.cos(a) * 0.15, 0.47, Math.sin(a) * 0.15);
    f.rotation.y = a;
    g.add(f);
  }
  return g;
}

/**
 * The bone the head is ACTUALLY skinned to. The rig's nominal "head" (the
 * highest bone, world.ts's pick) turned out to be a weightless TIP — scaling
 * it moved nothing, which is exactly the bug Josh screenshotted: bone at
 * 2.2×, hat size unchanged. So the head bone is found by MEASUREMENT, the
 * house rule: take the skinned mesh's bind-pose vertices in the top slice of
 * the body, histogram their skin weights, and the winning bone is the one
 * the face lives on. Cached by the caller — this walks real geometry.
 */
export function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
  // MEASURED ON THE LIVE RIG (Aug 2026): the hazmat body's head/hood/mask
  // vertices are all skinned to DEF-spine004 (total weight ~731); the nominal
  // head, DEF-spine006, carries ~0-2. A first cut sliced vertices by local Y,
  // which picked a SHIN — the geometry's local axes aren't world-up — so this
  // ignores vertex positions entirely: total weight per bone, limbs excluded
  // by name, and the highest-standing weighted bone is the head.
  const LIMB = /arm|hand|shoulder|thigh|shin|foot|toe|breast|pelvis/i;
  const V = new THREE.Vector3();
  root.updateMatrixWorld(true);
  let best: THREE.Bone | null = null;
  let bestY = -Infinity;
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || !m.skeleton) return;
    const idx = m.geometry.getAttribute("skinIndex");
    const wgt = m.geometry.getAttribute("skinWeight");
    if (!idx || !wgt) return;
    const acc = new Map<number, number>();
    for (let i = 0; i < idx.count; i++) {
      for (let k = 0; k < 4; k++) {
        const b = k === 0 ? idx.getX(i) : k === 1 ? idx.getY(i) : k === 2 ? idx.getZ(i) : idx.getW(i);
        const w = k === 0 ? wgt.getX(i) : k === 1 ? wgt.getY(i) : k === 2 ? wgt.getZ(i) : wgt.getW(i);
        if (w > 0) acc.set(b, (acc.get(b) ?? 0) + w);
      }
    }
    // The floor is RELATIVE: the nominal head tip carries a stray weight of
    // ~2 against the real head bone's ~731, and an absolute floor of 1 let
    // it win on height. A bone has to carry a real share of the mesh before
    // its altitude counts.
    let top = 0;
    for (const w of acc.values()) if (w > top) top = w;
    for (const [b, w] of acc) {
      const bone = m.skeleton.bones[b];
      if (!bone || w < top * 0.05 || LIMB.test(bone.name)) continue;
      const y = bone.getWorldPosition(V).y;
      if (y > bestY) {
        bestY = y;
        best = bone;
      }
    }
  });
  return best;
}

// ---- the confetti -----------------------------------------------------------

interface Flake {
  m: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
}

const flakes: Flake[] = [];
const MAX_FLAKES = 220;
let mats: THREE.MeshBasicMaterial[] | null = null;
const COLORS = [0xe8c33c, 0xe05a8a, 0x5ad0e0, 0x8ae05a, 0xb08ae8, 0xf3ead6];

function ensureMats(): THREE.MeshBasicMaterial[] {
  if (!mats) mats = COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  return mats;
}

/** The head goes: a burst of paper confetti from where it used to be.
 *  Deterministic off the shared seed — every screen throws the same paper. */
export function egoConfetti(scene: THREE.Scene, x: number, y: number, headY: number, seed: number): void {
  const ms = ensureMats();
  let s = seed >>> 0;
  const r = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const geo = new THREE.PlaneGeometry(0.055, 0.075);
  for (let i = 0; i < 90; i++) {
    if (flakes.length >= MAX_FLAKES) {
      const old = flakes.shift()!;
      old.m.parent?.remove(old.m);
    }
    const m = new THREE.Mesh(geo, ms[Math.floor(r() * ms.length)]);
    m.position.set(x * CELL + (r() - 0.5) * 0.2, headY + (r() - 0.5) * 0.25, y * CELL + (r() - 0.5) * 0.2);
    m.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    scene.add(m);
    const a = r() * Math.PI * 2;
    const sp = 0.8 + r() * 2.6;
    flakes.push({
      m,
      vel: new THREE.Vector3(Math.sin(a) * sp, 1.2 + r() * 2.4, Math.cos(a) * sp),
      spin: new THREE.Vector3(r() * 9, r() * 9, r() * 9),
      life: 0,
      max: 1.6 + r() * 1.4,
    });
  }
}

/** Advance the paper: gravity, air drag, the flutter, the fade-by-removal. */
export function tickEgoFx(dt: number, groundY: number): void {
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i];
    f.life += dt;
    f.vel.y -= 4.2 * dt; // paper falls like paper, not like shot
    f.vel.multiplyScalar(1 - 1.1 * dt);
    f.m.position.addScaledVector(f.vel, dt);
    if (f.m.position.y < groundY + 0.015) {
      f.m.position.y = groundY + 0.015;
      f.vel.set(0, 0, 0);
    }
    f.m.rotation.x += f.spin.x * dt;
    f.m.rotation.y += f.spin.y * dt;
    f.m.rotation.z += f.spin.z * dt;
    if (f.life >= f.max) {
      f.m.parent?.remove(f.m);
      flakes.splice(i, 1);
    }
  }
}

/** Leaving the hall sweeps the paper. */
export function clearEgoFx(): void {
  for (const f of flakes) f.m.parent?.remove(f.m);
  flakes.length = 0;
  if (mats) {
    for (const m of mats) m.dispose();
    mats = null;
  }
}
