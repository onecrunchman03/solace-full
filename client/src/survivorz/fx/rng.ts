// SURVIVORZ EFFECTS — the seeded randomness every effect draws from.
//
// ONE APPEARANCE, EVERY OBSERVER: an effect is drawn from the server's event
// (what happened, where, and a seed), so the admin's Watch page and the YouTube
// stream make the identical spray. Effects never call Math.random.
import * as THREE from "three";

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng: Rng, a: number, b: number): number => a + (b - a) * rng();
export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];

/** A unit vector within `spread` radians of `dir` (uniform over the cap). */
export function inCone(rng: Rng, dir: THREE.Vector3, spread: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cosMax = Math.cos(spread);
  const z = cosMax + (1 - cosMax) * rng();
  const phi = rng() * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  out.set(s * Math.cos(phi), s * Math.sin(phi), z);
  // rotate +Z onto dir
  const q = new THREE.Quaternion().setFromUnitVectors(Z, dir.clone().normalize());
  return out.applyQuaternion(q);
}
const Z = new THREE.Vector3(0, 0, 1);
