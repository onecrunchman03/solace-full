// THALASSOPHOBIA's set pieces in the game (Level 7) — BACKROOMS.md → "LEVEL 7
// — THALASSOPHOBIA". The server's OceanState is the whole truth about where
// they stand, and its deep frames about what the thing below is doing; this
// file only draws them and answers "am I near one?":
//
//  · THE SUBWAY STAIR at the bottom of the sunken plaza, 24m down: a stair
//    going down into a tiled entrance in the plaza's wall, railings, and THE
//    WAY ON marked in red like every level's door (red frame, a sign that
//    reads LOCKED or OPEN). Its name shows only once you are down at it.
//  · THE DIVING HELMET, as the key the game draws: brass, a round glass port.
//  · THE THING BELOW is never seen whole. What you see is the water noticing
//    you: at stage 1 a shadow the size of a street slides under you and on;
//    at 2 it circles you, nearer; at 3 the water under you goes dark, wider
//    and darker until it rises — and a strike is the sea erupting where you
//    were. Back to 0 (you got out), the dark sinks away.
//
// Nothing here adds a light: every shape is unlit material over the water
// (the hall-never-compiles rule — a light added at event time recompiles the
// level). Everything the scene needs from the game is passed in.
import * as THREE from "three";
import { CELL } from "./world";
import type { OceanState } from "./gamenet";
import { WallSeats, type WallFace } from "./wallseat";

export interface OceanDeps {
  scene: THREE.Scene;
  makeLabel: (text: string, tint: string) => THREE.Sprite;
  pinToGround: (o: THREE.Object3D, x: number, y: number, off: number) => unknown;
  reap: (o: THREE.Object3D | null | undefined) => void;
  groundAt: (x: number, y: number) => number;
  /** Where a wall's face is (wallseat.ts). */
  wallFace: WallFace;
}

/** Wall side → the cell step toward that wall, and the yaw that turns a model
 *  built facing +z (back on z=0) to stand against it. */
const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const DOOR_RED = 0xff4b4b;
/** How near (cells, on the map) counts as "at" the stair — the server's reach. */
export const SUBWAY_REACH = 2.4;
/** The stair's name shows this close (cells). */
const SUBWAY_LABEL_NEAR = 4;
/** The sea's surface (metres): ocean-vocab's WATER_LEVEL is 0. */
const SEA_Y = 0;
/** How far over a diver's eye (metres) the thing's shapes are drawn. */
const DIVER_OVER = 3.2;

// ---- shared, built once --------------------------------------------------------------
let shared: {
  dark: THREE.MeshBasicMaterial;
  shadowGeo: THREE.CircleGeometry;
  spray: THREE.MeshBasicMaterial;
  sprayGeo: THREE.CylinderGeometry;
  brass: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  black: THREE.MeshBasicMaterial;
  rail: THREE.MeshStandardMaterial;
  red: THREE.MeshBasicMaterial;
} | null = null;
const mats = (): NonNullable<typeof shared> =>
  (shared ??= {
    // the dark of it, under the water: unlit, so it reads the same at any hour
    dark: new THREE.MeshBasicMaterial({ color: 0x020506, transparent: true, opacity: 0, depthWrite: false }),
    shadowGeo: new THREE.CircleGeometry(1, 40),
    spray: new THREE.MeshBasicMaterial({ color: 0xdfe8ea, transparent: true, opacity: 0, depthWrite: false }),
    sprayGeo: new THREE.CylinderGeometry(1, 1.4, 1, 20, 1, true),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a3e, roughness: 0.35, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1d2a2c, roughness: 0.05, metalness: 0 }),
    tile: new THREE.MeshStandardMaterial({ color: 0xc9c6b8, roughness: 0.6, metalness: 0 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x3f6b4c, roughness: 0.5, metalness: 0 }),
    red: new THREE.MeshBasicMaterial({ color: DOOR_RED }),
  });

/** THE DIVING HELMET as the game draws it — brass, a round port, a collar.
 *  (Built here, not loaded: until a model is approved, it is drawn.) */
export function makeHelmet(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  g.name = "diving-helmet";
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), m.brass);
  dome.position.y = 0.24;
  g.add(dome);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.09, 24), m.brass);
  collar.position.y = 0.06;
  g.add(collar);
  const port = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 10, 24), m.brass);
  port.position.set(0, 0.25, 0.19);
  g.add(port);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), m.glass);
  glass.position.set(0, 0.25, 0.198);
  g.add(glass);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 20), m.brass);
    side.position.set(sx * 0.19, 0.25, 0.02);
    side.rotation.y = Math.PI / 2;
    g.add(side);
  }
  return g;
}

interface Watch {
  uid: number;
  you: boolean;
  stage: number;
  /** Where it is (cells): the swimmer's spot from the frame (you: followed). */
  x: number;
  y: number;
  /** When the current stage began (ms, performance clock). */
  since: number;
  /** The shadow's direction of travel at stage 1 (radians). */
  dir: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** Fading out (calm): when it started. */
  fading: number;
}
interface Spray {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  at: number;
}

export class OceanScene {
  private d: OceanDeps;
  private subway: { x: number; y: number; side: number; open: boolean; group: THREE.Group; sign: THREE.Sprite | null; label: THREE.Sprite | null } | null = null;
  private watches = new Map<number, Watch>();
  private sprays: Spray[] = [];

  private seats: WallSeats;

  constructor(d: OceanDeps) {
    this.d = d;
    this.seats = new WallSeats(d.wallFace);
  }

  /** Dress Thalassophobia from the server's state (welcome and travel). */
  apply(st: OceanState | undefined): void {
    this.clear();
    if (!st) return;
    if (st.subway) this.setSubway(st.subway);
  }

  clear(): void {
    if (this.subway) {
      this.d.reap(this.subway.group);
      this.d.reap(this.subway.sign);
      this.d.reap(this.subway.label);
      this.subway = null;
    }
    for (const w of this.watches.values()) this.drop(w);
    this.watches.clear();
    for (const s of this.sprays) this.d.scene.remove(s.mesh);
    this.sprays = [];
  }

  /** The subway stair from the server. Returns true the moment it opens. */
  setSubway(h: { x: number; y: number; side: number; open: boolean }): boolean {
    if (this.subway && this.subway.x === h.x && this.subway.y === h.y) {
      if (this.subway.open === h.open) return false;
      this.subway.open = h.open;
      this.resign();
      return h.open;
    }
    if (this.subway) {
      this.d.reap(this.subway.group);
      this.d.reap(this.subway.sign);
      this.d.reap(this.subway.label);
    }
    const group = this.onWall(h.x, h.y, h.side);
    const m = mats();
    // the entrance: a tiled frame round a black mouth, a green railing either
    // side, and the red outline every level's way on wears
    const W = 1.7;
    const H = 2.3;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, H + 0.35, 0.12), m.tile);
    frame.position.set(0, (H + 0.35) / 2, 0.06);
    group.add(frame);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m.black);
    mouth.position.set(0, H / 2, 0.125);
    group.add(mouth);
    // the first steps down, just inside the mouth (the rest is in the dark)
    for (let k = 0; k < 3; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, 0.3), m.tile);
      step.position.set(0, 0.08 - k * 0.16, -0.05 - k * 0.3);
      group.add(step);
    }
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 10), m.rail);
      post.position.set(sx * (W / 2 + 0.05), 0.5, 1.2);
      group.add(post);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 10), m.rail);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(sx * (W / 2 + 0.05), 0.98, 0.7);
      group.add(bar);
    }
    const t = 0.05;
    for (const [w, hh, x, y] of [
      [W + 0.6, t, 0, H + 0.4],
      [t, H + 0.4, -(W / 2 + 0.3), (H + 0.4) / 2],
      [t, H + 0.4, W / 2 + 0.3, (H + 0.4) / 2],
    ] as [number, number, number, number][]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), m.red);
      bar.position.set(x, y, 0.13);
      group.add(bar);
    }
    this.subway = { ...h, group, sign: null, label: null };
    this.resign();
    return false;
  }

  subwayState(): { x: number; y: number; open: boolean } | null {
    return this.subway ? { x: this.subway.x, y: this.subway.y, open: this.subway.open } : null;
  }
  nearSubway(px: number, py: number): boolean {
    return !!this.subway && Math.hypot(this.subway.x - px, this.subway.y - py) < SUBWAY_REACH;
  }

  /** A deep frame: somebody's exposure reached `stage` (0 = it sank away). */
  deep(uid: number, stage: number, x: number, y: number, you: boolean): void {
    const now = performance.now();
    let w = this.watches.get(uid);
    if (stage <= 0) {
      if (w && !w.fading) w.fading = now;
      return;
    }
    if (!w) {
      const mat = mats().dark.clone();
      const mesh = new THREE.Mesh(mats().shadowGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 5;
      this.d.scene.add(mesh);
      w = { uid, you, stage: 0, x, y, since: now, dir: Math.random() * Math.PI * 2, mesh, mat, fading: 0 };
      this.watches.set(uid, w);
    }
    w.fading = 0;
    w.x = x;
    w.y = y;
    if (w.stage !== stage) {
      w.stage = stage;
      w.since = now;
    }
  }
  /** It struck: the sea erupts where they were, and its dark is gone. */
  strike(uid: number, x: number, y: number): void {
    const w = this.watches.get(uid);
    if (w) {
      this.drop(w);
      this.watches.delete(uid);
    }
    const mat = mats().spray.clone();
    const mesh = new THREE.Mesh(mats().sprayGeo, mat);
    mesh.position.set(x * CELL, SEA_Y, y * CELL);
    this.d.scene.add(mesh);
    this.sprays.push({ mesh, mat, at: performance.now() });
  }
  /** Is the thing below doing anything near you (for the hum)? */
  nearest(px: number, py: number): { d: number; stage: number; you: boolean } | null {
    let best: { d: number; stage: number; you: boolean } | null = null;
    for (const w of this.watches.values()) {
      if (w.fading || w.stage < 2) continue;
      const d = w.you ? 0 : Math.hypot(w.x - px, w.y - py);
      if (!best || d < best.d) best = { d, stage: w.stage, you: w.you };
    }
    return best;
  }

  /** Per frame: the shapes in the water, and the stair's name once you're at it.
   *  `you` is where the player is (cells) — your own watch follows you.
   *  `diveY` is your eye's height (metres) while you are well under the
   *  surface, null otherwise.
   *
   *  A DIVER SEES IT TOO (Nov 2026 polish round — the audit's L7-06): the
   *  shapes were drawn only ON the surface, and a helmet diver 24 m down sees
   *  about 10 m, so the three warnings that ARE the rules were notes and
   *  sounds alone for exactly the player the plaza is built around. Under the
   *  water your own watch is drawn a few metres OVER you instead, face down:
   *  the light from the surface going dark as the thing passes between you
   *  and it. Same mesh, same material — nothing new to compile. */
  tick(now: number, px: number, py: number, youId: number, diveY: number | null = null): void {
    for (const [uid, w] of this.watches) {
      if (w.you || uid === youId) {
        w.x = px;
        w.y = py;
      }
      const t = (now - w.since) / 1000;
      const cx = w.x * CELL;
      const cz = w.y * CELL;
      let ox = 0;
      let oz = 0;
      let r = 6;
      let op = 0;
      if (w.stage === 1) {
        // THE SHADOW: a long shape sliding under you and on, every ~6 s
        const s = ((t % 6) / 6) * 2 - 1;
        ox = Math.cos(w.dir) * s * 26;
        oz = Math.sin(w.dir) * s * 26;
        r = 7;
        op = 0.55 * (1 - Math.abs(s) * 0.6);
        w.mesh.scale.set(r * 2.4, r, 1);
        w.mesh.rotation.z = -w.dir;
      } else if (w.stage === 2) {
        // CIRCLING: nearer, round you
        const a = w.dir + t * 0.7;
        ox = Math.cos(a) * 9;
        oz = Math.sin(a) * 9;
        r = 7;
        op = 0.62;
        w.mesh.scale.set(r * 2, r, 1);
        w.mesh.rotation.z = -(a + Math.PI / 2);
      } else {
        // RISING: the water under you going dark, wider and darker
        const k = Math.min(1, t / 2.5);
        r = 4 + 9 * k;
        op = 0.55 + 0.4 * k;
        w.mesh.scale.set(r, r, 1);
      }
      if (w.fading) {
        const f = Math.min(1, (now - w.fading) / 1600);
        op *= 1 - f;
        if (f >= 1) {
          this.drop(w);
          this.watches.delete(uid);
          continue;
        }
      }
      w.mat.opacity = op;
      const mine = w.you || uid === youId;
      if (mine && diveY !== null) {
        // under: over your head, facing down, a little nearer so the murk
        // doesn't swallow it (the shadow's slide and the circle scaled in)
        const over = Math.min(SEA_Y - 0.4, diveY + DIVER_OVER);
        w.mesh.position.set(cx + ox * 0.45, over, cz + oz * 0.45);
        w.mesh.rotation.x = Math.PI / 2;
        // facing down mirrors the shape's long axis: turn it back the way it goes
        if (w.stage === 1 || w.stage === 2) w.mesh.rotation.z = -w.mesh.rotation.z;
        w.mat.opacity = Math.min(1, op * 1.25);
      } else {
        // drawn ON the surface, after the water: the sea is nearly opaque, so
        // a shape under it is seen as the water going dark over it
        w.mesh.position.set(cx + ox, SEA_Y + 0.03, cz + oz);
        w.mesh.rotation.x = -Math.PI / 2;
      }
    }
    for (let i = this.sprays.length - 1; i >= 0; i--) {
      const s = this.sprays[i];
      const t = (now - s.at) / 1000;
      const k = Math.min(1, t / 1.6);
      s.mesh.scale.set(3 + 6 * k, 1 + 14 * Math.sin(k * Math.PI), 3 + 6 * k);
      s.mesh.position.y = SEA_Y + s.mesh.scale.y / 2;
      s.mat.opacity = 0.75 * (1 - k);
      if (k >= 1) {
        this.d.scene.remove(s.mesh);
        s.mat.dispose();
        this.sprays.splice(i, 1);
      }
    }
    if (this.subway) this.relabel(Math.hypot(this.subway.x - px, this.subway.y - py) <= SUBWAY_LABEL_NEAR);
    this.seats.tick();
  }

  /** For the review hook: what the scene thinks it is drawing. */
  debug(): { subway: unknown; deep: { uid: number; stage: number; you: boolean; opacity: number }[] } {
    return {
      subway: this.subway ? { x: this.subway.x, y: this.subway.y, open: this.subway.open, labelled: !!this.subway.label } : null,
      deep: [...this.watches.values()].map((w) => ({ uid: w.uid, stage: w.stage, you: w.you, opacity: +w.mat.opacity.toFixed(2) })),
    };
  }

  // ---- internals ------------------------------------------------------------
  private drop(w: Watch): void {
    this.d.scene.remove(w.mesh);
    w.mat.dispose();
  }
  /** The red sign over the stair: LOCKED or OPEN. */
  private resign(): void {
    if (!this.subway) return;
    this.d.reap(this.subway.sign);
    const sign = this.d.makeLabel(this.subway.open ? "OPEN" : "LOCKED", "#ff4b4b");
    const [dx, dy] = SIDE_D[this.subway.side] ?? [0, -1];
    this.d.pinToGround(sign, this.subway.x + dx * 0.35, this.subway.y + dy * 0.35, 2.95);
    this.d.scene.add(sign);
    this.subway.sign = sign;
  }
  private relabel(show: boolean): void {
    if (!this.subway) return;
    if (show && !this.subway.label) {
      const l = this.d.makeLabel("THE SUBWAY STAIR", "#ff9a8a");
      this.d.pinToGround(l, this.subway.x, this.subway.y, 3.4);
      this.d.scene.add(l);
      this.subway.label = l;
    } else if (!show && this.subway.label) {
      this.d.reap(this.subway.label);
      this.subway.label = null;
    }
  }
  /** A group standing against the wall on `side` of the cell at (x, y). */
  private onWall(x: number, y: number, side: number): THREE.Group {
    const g = new THREE.Group();
    g.rotation.y = SIDE_ROT[side] ?? 0;
    // On the wall's real face, 1 cm proud: at a fixed 0.06 in from the edge
    // the entrance's frame sat 9 cm inside a thin wall (Nov 2026 polish round
    // — wallseat.ts has why one inset can't be right).
    this.d.pinToGround(g, x, y, 0);
    this.seats.seat(g, x, y, side);
    this.d.scene.add(g);
    return g;
  }
}
