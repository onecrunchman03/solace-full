// SURVIVORZ EFFECTS — what each gun's shot looks like (docs/survivorz/EFFECTS.md
// §1, "Guns"). Points are in the GUN'S OWN FRAME: +z out of the muzzle, +y up,
// and the shooter's RIGHT is -x (looking down +z with +y up).
//
// THE MUZZLE POINTS ARE COPIES of props/guns/guns.json (owned by the animation
// work); scripts/survivorz/fx-check.mjs fails if they ever stop matching, so a
// moved muzzle can't leave the flash hanging in the air.
//
// THE EJECTION PORTS WERE MEASURED, not guessed: an orthographic render of each
// GLB from its right side and from above at 2 px per mm with a 1 cm grid
// (assets/downloads/survivorz/fx/bench/gunmeasure.html), 2026-10-22.
//   hk416   the dust-cover recess ahead of the forward assist, z 0.09–0.18, y 0.09–0.13
//   pistol  the breech, just ahead of the rear of the slide, on top
//   shotgun the receiver's port, front half of the receiver, z 0.13–0.20
import * as THREE from "three";

export type GunId = "pistol" | "hk416" | "shotgun";
export type CasingKind = "pistol" | "rifle" | "shell";

export interface GunFx {
  muzzle: [number, number, number];
  /** where the spent case leaves, and which way (gun frame); speed in m/s */
  eject: { at: [number, number, number]; dir: [number, number, number]; speed: [number, number] };
  casing: CasingKind;
  /** false for the pump gun: its shell comes out when it's pumped, not when it fires */
  ejectOnShot: boolean;
  flash: {
    /** the side-on jet: length and width in metres */
    jet: [number, number];
    /** the end-on bloom across */
    petal: number;
    /** the extra tongues a flash hider or a wide bore throws, at an angle */
    tongues: number;
    /** a few frames of a fireball sheet in the throat (the shotgun) */
    fireball: number;
    /** seconds on screen */
    life: number;
    /** muzzle light: peak, metres it reaches */
    light: [number, number];
    /** unburnt powder thrown forward */
    sparks: number;
  };
  smoke: { size: number; puffs: number; linger: boolean };
}

export const GUN_FX: Record<GunId, GunFx> = {
  pistol: {
    muzzle: [0, 0.072, 0.178],
    eject: { at: [-0.012, 0.074, 0.055], dir: [-1, 1.1, -0.25], speed: [1.6, 2.4] },
    casing: "pistol",
    ejectOnShot: true,
    flash: { jet: [0.13, 0.07], petal: 0.1, tongues: 0, fireball: 0, life: 0.06, light: [5, 4.5], sparks: 4 },
    smoke: { size: 0.1, puffs: 1, linger: true },
  },
  hk416: {
    muzzle: [0, 0.1131, 0.6181],
    eject: { at: [-0.022, 0.107, 0.135], dir: [-1, 0.55, -0.3], speed: [2.2, 3.2] },
    casing: "rifle",
    ejectOnShot: true,
    // a flash hider: a shorter jet with the prongs throwing it sideways
    flash: { jet: [0.2, 0.07], petal: 0.17, tongues: 3, fireball: 0, life: 0.055, light: [6.5, 6], sparks: 6 },
    smoke: { size: 0.09, puffs: 1, linger: false },
  },
  shotgun: {
    // (re-measured 2026-10-22 evening: the animation session swapped in a new pump gun, the
    // wood-stocked one, with a longer barrel; its port is over the front of the trigger guard)
    muzzle: [0, 0.09, 0.729],
    eject: { at: [-0.022, 0.08, 0.195], dir: [-1, 0.6, 0.15], speed: [1.3, 2] },
    casing: "shell",
    ejectOnShot: false,
    flash: { jet: [0.42, 0.17], petal: 0.26, tongues: 2, fireball: 0.24, life: 0.08, light: [11, 8], sparks: 14 },
    smoke: { size: 0.2, puffs: 3, linger: true },
  },
};

/** A point in the gun's frame, in the world. */
export function gunPoint(m: THREE.Matrix4, p: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(p[0], p[1], p[2]).applyMatrix4(m);
}

/** A direction in the gun's frame, in the world (unit length). */
export function gunDir(m: THREE.Matrix4, d: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(d[0], d[1], d[2]).transformDirection(m);
}


