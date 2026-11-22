// THE SUBURBS' set pieces in the game (Level 9) — BACKROOMS.md → "LEVEL 9 —
// THE SUBURBS". The server's SuburbState is the whole truth about where they
// stand; this file only draws them and answers "am I near one?":
//
//  · NUMBER 9's FRONT DOOR, the way out: the kit's wooden door, painted a
//    tired red, set in the brick under the lit porch light — locked until the
//    House Key turns in it, then standing open on a warm hall.
//  · THE HOUSE KEY (lying where the plan put it): a brass key on a plastic
//    tag, "9" on it.
//  · THE NEIGHBORHOOD WATCH, on the server's positions: tall, too thin, a
//    beige windbreaker, a smile and nothing else on its face. Drawn from
//    primitives (its limbs swing with its own stride) until a model is
//    approved.
//
// Everything the scene adds is passed in by the game (labels, ground pins,
// kit loader), so this file holds no copy of those rules.
import * as THREE from "three";
import { CELL } from "./world";
import type { SuburbState } from "./gamenet";

export interface SuburbDeps {
  scene: THREE.Scene;
  makeLabel: (text: string, tint: string) => THREE.Sprite;
  pinToGround: (o: THREE.Object3D, x: number, y: number, off: number) => unknown;
  reap: (o: THREE.Object3D | null | undefined) => void;
  /** A prop-kit model by file name, cloned (the game's loader). */
  withKit: (name: string, cb: (m: THREE.Object3D) => void) => void;
  /** Seat a kit model's back on the group's origin; its size. */
  backToWall: (m: THREE.Object3D) => THREE.Vector3;
  groundAt: (x: number, y: number) => number;
}

/** Wall side → the cell step toward that wall, and the yaw that turns a model
 *  built facing +z (back on z=0) to stand against it (the hotel's table). */
const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const DOOR_RED = "#ff4b4b";

/** How near (cells) counts as "at" the front door — mirrors the server. */
export const FRONT_DOOR_REACH = 2.2;
const DOOR_LABEL_NEAR = 6;
/** A Watch with no frame for this long is not near you any more. */
const WATCH_STALE_MS = 2500;
/** It stands this tall (metres): taller than anybody you know. */
const WATCH_H = 2.3;
/** A knock's lean-in, ms. */
const KNOCK_MS = 700;
/** After the first knock at a door it reaches in through the doorway — the
 *  server's WATCH_KNOCK (2.4 s), so the arms come up when the reach is live. */
const REACH_AFTER_MS = 2_400;
/** How far it leans in to the door (radians, forward from the feet). */
const DOOR_LEAN = 0.15;
/** The take: a fast two-arm lunge, ms. */
const STRIKE_MS = 520;

const COAT_MAT = new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.85, metalness: 0 });
const SLACKS_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 0.9, metalness: 0 });
const SKIN_MAT = new THREE.MeshStandardMaterial({ color: 0xd9cfc4, roughness: 0.6, metalness: 0, emissive: 0x0e0c0a });
const SHOE_MAT = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5, metalness: 0 });
const BRASS_MAT = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0 });
const TAG_MAT = new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.7, metalness: 0 });
const WARM_MAT = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });

/** The face: no eyes, no nose. A smile, too wide, drawn on. */
function faceTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#d9cfc4";
  g.fillRect(0, 0, 256, 256);
  // the faintest hollows where eyes should be
  g.fillStyle = "rgba(120,100,90,0.18)";
  for (const x of [90, 166]) {
    g.beginPath();
    g.ellipse(x, 104, 20, 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  // the smile: a thin dark arc from ear to ear, teeth just showing
  g.strokeStyle = "#2a1612";
  g.lineWidth = 7;
  g.lineCap = "round";
  g.beginPath();
  g.arc(128, 120, 78, 0.18 * Math.PI, 0.82 * Math.PI);
  g.stroke();
  g.strokeStyle = "rgba(240,236,220,0.9)";
  g.lineWidth = 3;
  for (let k = 0; k < 14; k++) {
    const a = (0.24 + k * 0.038) * Math.PI;
    const x = 128 + Math.cos(a) * 74;
    const y = 120 + Math.sin(a) * 74;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * -8, y + Math.sin(a) * -8);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let faceMat: THREE.MeshStandardMaterial | null = null;

/** THE HOUSE KEY as it lies: a brass house key on a ring with a plastic tag
 *  that says 9 — the key drawn on the floor. */
export function makeHouseKey(): THREE.Group {
  const g = new THREE.Group();
  g.name = "house-key";
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 18), BRASS_MAT);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0.01, 0);
  g.add(bow);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.07), BRASS_MAT);
  blade.position.set(0, 0.008, 0.06);
  g.add(blade);
  for (let k = 0; k < 3; k++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.01), BRASS_MAT);
    tooth.position.set(0.012, 0.008, 0.045 + k * 0.018);
    g.add(tooth);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.003, 6, 16), BRASS_MAT);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.006, -0.045);
  g.add(ring);
  // the tag, its 9 in black marker
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 96;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#d8d0b0";
  c.fillRect(0, 0, 64, 96);
  c.fillStyle = "#111";
  c.font = "bold 64px sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("9", 32, 54);
  const tagTex = new THREE.CanvasTexture(cv);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.06), [TAG_MAT, TAG_MAT, new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.7 }), TAG_MAT, TAG_MAT, TAG_MAT]);
  tag.position.set(0.006, 0.004, -0.095);
  tag.rotation.y = 0.35;
  g.add(tag);
  g.scale.setScalar(2.2); // a key's size is a speck at arm's length; this reads as one
  return g;
}

interface Limb {
  pivot: THREE.Group;
  lower: THREE.Group;
}
interface Watch {
  id: number;
  group: THREE.Group;
  head: THREE.Group;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  tx: number;
  ty: number;
  x: number;
  y: number;
  /** The server's heading (radians, the game's convention) and the eased one. */
  th: number;
  h: number;
  mode: string;
  seenAt: number;
  /** The stride's phase. */
  phase: number;
  /** How fast it is really moving (cells/s, eased) — what its steps play off. */
  speed: number;
  knockAt: number;
  /** The first knock of this visit to a door (0 = not at one). */
  doorSince: number;
  /** When it took somebody (0 = not taking). */
  strikeAt: number;
  /** Its lean, eased (radians). */
  lean: number;
}

export class SuburbScene {
  private d: SuburbDeps;
  private door: { x: number; y: number; side: number; open: boolean; group: THREE.Group; label: THREE.Sprite | null } | null = null;
  private watches = new Map<number, Watch>();

  constructor(d: SuburbDeps) {
    this.d = d;
  }

  /** Dress the Suburbs from the server's state (welcome and travel). */
  apply(st: SuburbState | undefined): void {
    this.clear();
    if (!st) return;
    if (st.frontDoor) this.setFrontDoor(st.frontDoor);
  }

  clear(): void {
    if (this.door) {
      this.d.reap(this.door.group);
      this.d.reap(this.door.label);
      this.door = null;
    }
    for (const w of this.watches.values()) this.d.reap(w.group);
    this.watches.clear();
  }

  /** Number 9's front door from the server (welcome, or streamed near it).
   *  Returns true the moment it is seen to open. */
  setFrontDoor(fd: { x: number; y: number; side: number; open: boolean }): boolean {
    if (this.door && this.door.x === fd.x && this.door.y === fd.y) {
      if (this.door.open === fd.open) return false;
      this.door.open = fd.open;
      const pivot = this.door.group.getObjectByName("front-pivot");
      if (pivot && fd.open) pivot.rotation.y = -1.35;
      const hall = this.door.group.getObjectByName("front-hall");
      if (hall) hall.visible = fd.open;
      this.relabel(true);
      return fd.open;
    }
    if (this.door) {
      this.d.reap(this.door.group);
      this.d.reap(this.door.label);
    }
    const group = new THREE.Group();
    group.name = "front-door";
    group.rotation.y = SIDE_ROT[fd.side] ?? 0;
    const [dx, dy] = SIDE_D[fd.side] ?? [0, -1];
    // the door stands in the wall: half a cell (less the wall's skin) toward it
    const into = (CELL / 2 - 0.17) / CELL;
    this.d.pinToGround(group, fd.x + dx * into, fd.y + dy * into, 0);
    // the warm hall behind it, seen only once it's open: home
    const hall = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), WARM_MAT);
    hall.name = "front-hall";
    hall.position.set(0, 1.05, -0.12);
    hall.visible = fd.open;
    group.add(hall);
    this.d.withKit("wood-door-swing--1", (m) => {
      const size = this.d.backToWall(m);
      // a front door painted red years ago
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mm = (mesh.material as THREE.MeshStandardMaterial).clone();
        mm.color?.multiply(new THREE.Color(0xb0483a));
        mm.metalness = 0;
        mm.emissive = new THREE.Color(0x140806);
        mesh.material = mm;
      });
      const pivot = new THREE.Group();
      pivot.name = "front-pivot";
      pivot.position.x = -size.x / 2;
      m.position.x += size.x / 2;
      pivot.add(m);
      if (this.door?.open) pivot.rotation.y = -1.35;
      group.add(pivot);
    });
    this.d.scene.add(group);
    this.door = { ...fd, group, label: null };
    this.relabel(false);
    return false;
  }

  /** Somebody opened it (the level10 frame): swing it open where it stands. */
  openFrontDoor(): void {
    if (this.door && !this.door.open) this.setFrontDoor({ x: this.door.x, y: this.door.y, side: this.door.side, open: true });
  }
  frontDoor(): { x: number; y: number; open: boolean } | null {
    return this.door ? { x: this.door.x, y: this.door.y, open: this.door.open } : null;
  }
  nearFrontDoor(px: number, py: number): boolean {
    return !!this.door && Math.hypot(this.door.x - px, this.door.y - py) < FRONT_DOOR_REACH;
  }

  /** A Watch's position from the server. */
  watchPos(id: number, x: number, y: number, h: number, mode: string): void {
    let w = this.watches.get(id);
    const now = performance.now();
    if (!w) {
      w = this.buildWatch(id, x, y, h, mode);
      this.watches.set(id, w);
    } else if (now - w.seenAt > WATCH_STALE_MS) {
      w.x = x;
      w.y = y;
      w.h = h;
    }
    w.tx = x;
    w.ty = y;
    w.th = h;
    if (mode !== "door") w.doorSince = 0;
    w.mode = mode;
    w.seenAt = now;
  }
  /** It knocked: it leans in to the door and raps three times. */
  watchKnock(id: number): void {
    const w = this.watches.get(id);
    if (!w) return;
    w.knockAt = performance.now();
    if (!w.doorSince) w.doorSince = w.knockAt;
  }
  /** It took somebody: a fast lunge, both arms (Nov 2026 polish round — the
   *  take used to play only its sound, the body standing still). */
  watchStrike(id: number): void {
    const w = this.watches.get(id);
    if (w) w.strikeAt = performance.now();
  }
  watchGone(id: number): void {
    const w = this.watches.get(id);
    if (!w) return;
    this.d.reap(w.group);
    this.watches.delete(id);
  }
  /** The nearest Watch you have frames for (cells), or null. */
  nearestWatch(px: number, py: number): { d: number; x: number; y: number; mode: string; speed: number } | null {
    let best: { d: number; x: number; y: number; mode: string; speed: number } | null = null;
    const now = performance.now();
    for (const w of this.watches.values()) {
      if (now - w.seenAt > WATCH_STALE_MS) continue;
      const d = Math.hypot(w.x - px, w.y - py);
      if (!best || d < best.d) best = { d, x: w.x, y: w.y, mode: w.mode, speed: w.speed };
    }
    return best;
  }

  /** Per frame: each Watch eased onto the server's position, its stride
   *  swinging with how fast it really moves; the door's name once you're near. */
  tick(now: number, dt: number, px: number, py: number): void {
    const k = 1 - Math.exp(-8 * dt);
    for (const w of this.watches.values()) {
      const stale = now - w.seenAt > WATCH_STALE_MS;
      w.group.visible = !stale;
      if (stale) continue;
      const ox = w.x;
      const oy = w.y;
      w.x += (w.tx - w.x) * k;
      w.y += (w.ty - w.y) * k;
      const speed = dt > 0 ? Math.hypot(w.x - ox, w.y - oy) / dt : 0; // cells/s
      w.speed += (speed - w.speed) * (1 - Math.exp(-6 * dt));
      // shortest way round to the server's heading
      let dh = w.th - w.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      w.h += dh * (1 - Math.exp(-6 * dt));
      this.d.pinToGround(w.group, w.x, w.y, 0);
      w.group.rotation.y = w.h;
      // AT A DOOR, AND THE TAKE (Nov 2026 polish round — the audit's L9-07):
      // the knock's lean set rotation.x = 0, and after the knocks the arms
      // hung while the server's reach was live. Now it leans in at the door,
      // both arms come up and through the doorway once it is reaching, and a
      // take is a lunge.
      const st = w.strikeAt ? (now - w.strikeAt) / STRIKE_MS : 1;
      if (st >= 1) w.strikeAt = 0;
      const lunge = st < 1 ? Math.sin(Math.min(1, st * 1.6) * Math.PI * 0.5) * (st < 0.6 ? 1 : 1 - (st - 0.6) / 0.4) : 0;
      const atDoor = w.mode === "door" && w.doorSince > 0;
      const reachingIn = atDoor && now - w.doorSince >= REACH_AFTER_MS;
      const wantLean = (atDoor ? DOOR_LEAN : 0) + (reachingIn ? 0.08 : 0) + lunge * 0.3;
      w.lean += (wantLean - w.lean) * (1 - Math.exp(-(lunge > 0 ? 20 : 5) * dt));
      w.group.rotation.x = w.lean;
      if (lunge > 0) {
        w.group.position.x += Math.sin(w.h) * lunge * 0.45;
        w.group.position.z += Math.cos(w.h) * lunge * 0.45;
      }
      // a long, slow, unhurried stride — even when it hunts (it just covers
      // more ground with each one)
      w.phase += dt * Math.min(speed, 3) * 2.6;
      const swing = Math.min(1, speed / 1.0) * 0.55;
      const s = Math.sin(w.phase);
      w.legL.pivot.rotation.x = s * swing;
      w.legR.pivot.rotation.x = -s * swing;
      w.legL.lower.rotation.x = Math.max(0, -Math.cos(w.phase)) * swing * 1.1;
      w.legR.lower.rotation.x = Math.max(0, Math.cos(w.phase)) * swing * 1.1;
      // the arms hang, swinging a little; hunting, they come up and forward
      const hunting = w.mode === "hunt";
      const reach = hunting ? -0.9 : 0;
      w.armL.pivot.rotation.x = reach - s * swing * 0.6;
      w.armR.pivot.rotation.x = reach + s * swing * 0.6;
      w.armL.lower.rotation.x = hunting ? -0.3 : -0.1;
      w.armR.lower.rotation.x = hunting ? -0.3 : -0.1;
      // the head: a slow side-to-side as it walks the beat, dead still when
      // it hunts — and cocked while it waits at the light's edge
      w.head.rotation.y = hunting ? 0 : Math.sin(now / 1700 + w.id) * 0.45;
      w.head.rotation.z = w.mode === "edge" || w.mode === "door" ? 0.32 : 0;
      // reaching in through the doorway: both arms up and forward, the long
      // fingers working
      if (reachingIn) {
        const grope = Math.sin(now / 260 + w.id) * 0.12;
        w.armL.pivot.rotation.x = -1.45 + grope;
        w.armR.pivot.rotation.x = -1.45 - grope;
        w.armL.lower.rotation.x = -0.15 - Math.max(0, grope);
        w.armR.lower.rotation.x = -0.15 - Math.max(0, -grope);
      }
      // a knock: the right fist raps three times (the lean is above)
      const kt = now - w.knockAt;
      if (kt >= 0 && kt < KNOCK_MS * 3) {
        const rap = Math.abs(Math.sin((kt / KNOCK_MS) * Math.PI));
        w.armR.pivot.rotation.x = -1.4 - rap * 0.3;
        w.armR.lower.rotation.x = -0.6 + rap * 0.5;
      }
      // the take: both arms snap out straight
      if (lunge > 0) {
        w.armL.pivot.rotation.x = -1.55 * lunge + w.armL.pivot.rotation.x * (1 - lunge);
        w.armR.pivot.rotation.x = -1.55 * lunge + w.armR.pivot.rotation.x * (1 - lunge);
        w.armL.lower.rotation.x *= 1 - lunge;
        w.armR.lower.rotation.x *= 1 - lunge;
      }
    }
    if (this.door) this.relabel(Math.hypot(this.door.x - px, this.door.y - py) <= DOOR_LABEL_NEAR);
  }

  /** For the review hook: what the scene thinks it is drawing. */
  debug(): { door: unknown; watches: { id: number; x: number; y: number; mode: string; visible: boolean; lean: number; reach: number }[] } {
    return {
      door: this.door ? { x: this.door.x, y: this.door.y, side: this.door.side, open: this.door.open, labelled: !!this.door.label } : null,
      watches: [...this.watches.values()].map((w) => ({ id: w.id, x: +w.x.toFixed(2), y: +w.y.toFixed(2), mode: w.mode, visible: w.group.visible, lean: +w.lean.toFixed(2), reach: +w.armL.pivot.rotation.x.toFixed(2) })),
    };
  }

  private relabel(show: boolean): void {
    const dr = this.door;
    if (!dr) return;
    if (!show) {
      if (dr.label) {
        this.d.reap(dr.label);
        dr.label = null;
      }
      return;
    }
    const text = dr.open ? "NUMBER 9 · THE WAY OUT · OPEN" : "NUMBER 9 · THE FRONT DOOR · LOCKED";
    if (dr.label?.userData.text === text) return;
    this.d.reap(dr.label);
    dr.label = this.d.makeLabel(text, DOOR_RED);
    dr.label.userData.text = text;
    this.d.pinToGround(dr.label, dr.x, dr.y, 2.9);
    this.d.scene.add(dr.label);
  }

  /** The Watch: a long limbed figure in a windbreaker, its limbs on pivots
   *  so the stride can swing them. Built facing +z (the game's heading 0
   *  turns it like every other body: rotation.y = heading). */
  private buildWatch(id: number, x: number, y: number, h: number, mode: string): Watch {
    faceMat ??= new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.6, metalness: 0 });
    const g = new THREE.Group();
    g.name = "watch";
    const u = WATCH_H / 2.3; // everything below is laid out for a 2.3m body
    const hip = 1.18 * u;
    const limb = (len: number, r: number, mat: THREE.Material, lowerMat: THREE.Material, end: THREE.Mesh | null): Limb => {
      const pivot = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len / 2, 8), mat);
      upper.position.y = -len / 4;
      upper.castShadow = true;
      pivot.add(upper);
      const lower = new THREE.Group();
      lower.position.y = -len / 2;
      const lo = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.7, len / 2, 8), lowerMat);
      lo.position.y = -len / 4;
      lo.castShadow = true;
      lower.add(lo);
      if (end) {
        end.position.y = -len / 2;
        lower.add(end);
      }
      pivot.add(lower);
      return { pivot, lower };
    };
    // legs: long, in grey slacks, black shoes
    const shoe = (): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.11 * u, 0.07 * u, 0.26 * u), SHOE_MAT);
      m.position.z = 0.06 * u;
      return m;
    };
    const legL = limb(hip - 0.04, 0.065 * u, SLACKS_MAT, SLACKS_MAT, shoe());
    const legR = limb(hip - 0.04, 0.065 * u, SLACKS_MAT, SLACKS_MAT, shoe());
    legL.pivot.position.set(-0.1 * u, hip, 0);
    legR.pivot.position.set(0.1 * u, hip, 0);
    g.add(legL.pivot, legR.pivot);
    // the windbreaker: a narrow torso, zipped to the chin, a little too short
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * u, 0.15 * u, 0.72 * u, 10), COAT_MAT);
    torso.position.y = hip + 0.36 * u;
    torso.scale.z = 0.62;
    torso.castShadow = true;
    g.add(torso);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * u, 0.12 * u, 0.08 * u, 10), COAT_MAT);
    collar.position.y = hip + 0.76 * u;
    g.add(collar);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * u, 0.05 * u, 0.12 * u, 8), SKIN_MAT);
    neck.position.y = hip + 0.84 * u;
    g.add(neck);
    // the head: a long smooth egg, the smile on its front
    const head = new THREE.Group();
    head.position.y = hip + 0.9 * u;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12 * u, 16, 12), [SKIN_MAT]);
    skull.scale.set(1, 1.3, 1.05);
    skull.position.y = 0.14 * u;
    skull.castShadow = true;
    head.add(skull);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.121 * u, 16, 12, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.25, Math.PI * 0.5), faceMat); // its window centred on +z (phi = π/2)
    face.scale.set(1, 1.3, 1.05);
    face.position.y = 0.14 * u;
    head.add(face);
    g.add(head);
    // arms: too long, the hands hanging past the knee
    const hand = (): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06 * u, 0.16 * u, 0.035 * u), SKIN_MAT);
      m.position.y = -0.06 * u;
      return m;
    };
    const armLen = 0.98 * u;
    const armL = limb(armLen, 0.05 * u, COAT_MAT, COAT_MAT, hand());
    const armR = limb(armLen, 0.05 * u, COAT_MAT, COAT_MAT, hand());
    armL.pivot.position.set(-0.22 * u, hip + 0.68 * u, 0);
    armR.pivot.position.set(0.22 * u, hip + 0.68 * u, 0);
    g.add(armL.pivot, armR.pivot);
    this.d.pinToGround(g, x, y, 0);
    // yaw first, then the lean in its own frame (a plain XYZ order tipped it
    // about the world's x axis whichever way it faced)
    g.rotation.order = "YXZ";
    g.rotation.y = h;
    this.d.scene.add(g);
    return { id, group: g, head, armL, armR, legL, legR, tx: x, ty: y, x, y, th: h, h, mode, seenAt: performance.now(), phase: 0, speed: 0, knockAt: -1e9, doorSince: 0, strikeAt: 0, lean: 0 };
  }
}
