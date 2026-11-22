import * as THREE from "three";

/** Transparent + DoubleSide materials take three.js's TWO-PASS transparency
 *  path (back faces, then front), and that path sets material.needsUpdate
 *  twice per frame, forever — a full initMaterial (parameters object +
 *  program cache-key string + fresh uniform setters) on every pass of every
 *  frame. Measured on the casino floor (Aug 2026 stutter hunt): six such
 *  GLB materials — the jukebox's glass + the bar pack's tables — cost
 *  ~7MB/s of garbage and real per-frame CPU, forcing a ~23MB GC every
 *  1.2 seconds. Sketchfab exports ship this combination constantly.
 *  forceSinglePass draws the same DoubleSide geometry in one pass; on props
 *  like these the back-to-front sorting difference is invisible.
 *  Call on every loaded GLB root before it enters a scene. */
export function tameGlbTransparency(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) {
      if (mm.transparent && mm.side === THREE.DoubleSide) mm.forceSinglePass = true;
    }
  });
}
