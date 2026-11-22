// SURVIVORZ EFFECTS — the effect lights: a FIXED POOL built at load.
//
// THE NUMBER OF LIGHTS NEVER CHANGES MID-SHOW. three bakes the scene's light
// count into every material's shader, so adding a light at a gunshot rebuilds
// every program in the scene on the spot (it froze the casino for a third of a
// second, CLAUDE.md "THE HALL NEVER COMPILES MID-GAME"). So the pool's lights
// sit in the scene from the first frame at intensity 0, and an effect BORROWS
// one: a flash for a few frames, or a held light while a fire burns. Nothing is
// ever added or removed; only intensities and positions move.
import * as THREE from "three";

export type LightKind = "muzzle" | "fire" | "blast" | "spare";

/** The pool: 2 muzzle, 2 fire, 1 blast, 1 spare (EFFECTS.md §2). */
export const POOL: LightKind[] = ["muzzle", "muzzle", "fire", "fire", "blast", "spare"];

interface Entry {
  kind: LightKind;
  light: THREE.PointLight;
  /** what is using it */
  owner: number;
  /** a flash: when it started, how long, its peak; null while held */
  flash: { t0: number; dur: number; peak: number; attack: number } | null;
  held: boolean;
  since: number;
}

export interface HeldLight {
  set(pos: THREE.Vector3, intensity: number, color?: THREE.ColorRepresentation, distance?: number): void;
  release(): void;
}

let owners = 1;

export class LightPool {
  readonly group = new THREE.Group();
  private entries: Entry[];

  constructor() {
    this.group.name = "fx-lights";
    this.entries = POOL.map((kind) => {
      const light = new THREE.PointLight(0xffffff, 0, 6, 2);
      light.castShadow = false; // a shadow map per effect light would blow the budget
      light.name = `fx-light:${kind}`;
      this.group.add(light);
      return { kind, light, owner: 0, flash: null, held: false, since: 0 };
    });
  }

  /** An idle light of this kind, else the spare, else the oldest flash of this kind. A
   *  held light (a fire) is never stolen by a flash. */
  private take(kind: LightKind, now: number): Entry | null {
    const idle = (k: LightKind) => this.entries.find((e) => e.kind === k && !e.owner);
    const e = idle(kind) ?? idle("spare") ?? this.entries.filter((e) => e.kind === kind && e.flash && !e.held).sort((a, b) => a.since - b.since)[0];
    if (!e) return null;
    e.owner = owners++;
    e.since = now;
    return e;
  }

  /** A burst of light that rises in `attack` seconds and dies over `dur`. */
  flash(kind: LightKind, now: number, pos: THREE.Vector3, peak: number, dur: number, color: THREE.ColorRepresentation, distance = 8, attack = 0.01): boolean {
    const e = this.take(kind, now);
    if (!e) return false;
    e.light.position.copy(pos);
    e.light.color.set(color);
    e.light.distance = distance;
    e.flash = { t0: now, dur, peak, attack };
    e.held = false;
    return true;
  }

  /** A light that stays until released (a fire). null when the pool can't spare one. */
  hold(kind: LightKind, now: number): HeldLight | null {
    const e = this.take(kind, now);
    if (!e) return null;
    const me = e.owner;
    e.flash = null;
    e.held = true;
    return {
      set: (pos, intensity, color, distance) => {
        if (e.owner !== me) return;
        e.light.position.copy(pos);
        e.light.intensity = intensity;
        if (color !== undefined) e.light.color.set(color);
        if (distance !== undefined) e.light.distance = distance;
      },
      release: () => {
        if (e.owner !== me) return;
        e.owner = 0;
        e.held = false;
        e.light.intensity = 0;
      },
    };
  }

  update(now: number): void {
    for (const e of this.entries) {
      if (!e.flash) continue;
      const t = now - e.flash.t0;
      if (t >= e.flash.dur) {
        e.flash = null;
        e.owner = 0;
        e.light.intensity = 0;
        continue;
      }
      const up = e.flash.attack > 0 ? Math.min(1, t / e.flash.attack) : 1;
      const down = 1 - Math.max(0, t - e.flash.attack) / Math.max(1e-3, e.flash.dur - e.flash.attack);
      e.light.intensity = e.flash.peak * up * down * down;
    }
  }

  get busy(): number {
    return this.entries.filter((e) => e.owner).length;
  }

  clear(): void {
    for (const e of this.entries) {
      e.owner = 0;
      e.flash = null;
      e.held = false;
      e.light.intensity = 0;
    }
  }
}
