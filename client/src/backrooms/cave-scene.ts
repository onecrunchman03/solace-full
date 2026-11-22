// THE CAVE SYSTEM's set pieces in the game (Level 8) — BACKROOMS.md → "LEVEL
// 8 — THE CAVE SYSTEM". The server's CaveState is the whole truth about where
// they stand; this file only draws them and answers "am I near one?":
//
//  · THE CHIMNEY, the way on: a natural shaft going up out of the wall at the
//    far end of the Deep. Far up it, a round of pale cold light — a manhole, and
//    a streetlight over it. Once the rope is fixed, the rope hangs down it.
//  · THE CLIMBING ROPE (the key, lying where the plan put it): a coil of
//    orange climbing rope.
//  · THE BURROWERS, on the server's positions: a long, pale, eyeless cave
//    centipede (Josh, Oct 16 2026: the first cut "looks like a grub") —
//    armoured segments laid along the head's own trail, two rows of jointed
//    legs rippling in a wave, curved pincers and feelers, the front end
//    rearing up while it hunts and lunging when it bites. Drawn from
//    primitives, every repeated part instanced (a handful of draws a body),
//    until a model is approved (scripts/assets/level8.json).
//
// Everything the scene adds is passed in by the game (its labels, ground pins,
// reaper), so this file holds no copy of those rules.
import * as THREE from "three";
import { CELL } from "./world";
import type { CaveState } from "./gamenet";
import { WallSeats, type WallFace } from "./wallseat";
import { CAVE_CEILINGS } from "../../../src/backrooms/cave-vocab";

export interface CaveDeps {
  scene: THREE.Scene;
  makeLabel: (text: string, tint: string) => THREE.Sprite;
  pinToGround: (o: THREE.Object3D, x: number, y: number, off: number) => unknown;
  reap: (o: THREE.Object3D | null | undefined) => void;
  groundAt: (x: number, y: number) => number;
  /** The ceiling's height (metres) over a cell. */
  ceilAt: (x: number, y: number) => number;
  /** Where a wall's face is (wallseat.ts). */
  wallFace: WallFace;
}

const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const DOOR_RED = "#ff4b4b";

/** How near (cells) counts as "at" the Chimney — mirrors the server's reach. */
export const CHIMNEY_REACH = 2.4;
const CHIMNEY_LABEL_NEAR = 4;
/** A Burrower with no frame for this long is not near you any more. */
const BURROW_STALE_MS = 2500;
/** Its body: this many segments, this far apart along its trail (cells). */
const SEGMENTS = 18;
const SEG_GAP = 0.17;
/** A segment's size at the front (metres); it tapers toward the tail. */
const SEG_W = 0.5;
const SEG_H = 0.26;
const SEG_L = 0.56;
/** How far the front end rears while it hunts (metres, at the head). */
const REAR = 0.5;
/** How near (cells) a lingering Burrower's head is drawn to the body it
 *  heard — clear of your legs. Drawing only: the bite is the server's. */
const LINGER_GAP = 0.85;
/** Each segment's leg pair, a little different from its neighbours (fixed,
 *  so every client draws the same body): phase, length, knee height, rake. */
const LEG_JITTER = Array.from({ length: SEGMENTS }, (_, s) => {
  const r = (k: number): number => {
    const v = Math.sin((s + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return { ph: (r(1) - 0.5) * 0.9, len: 0.88 + r(2) * 0.24, knee: (r(3) - 0.5) * 0.2, rake: (r(4) - 0.5) * 0.08 };
});
/** A bite's lunge, ms. */
const STRIKE_MS = 450;

const ROPE_MAT = new THREE.MeshStandardMaterial({ color: 0xd2662a, roughness: 0.85, metalness: 0 });
// pale, wet, never seen daylight: a waxy underbody, horn-grey armour plates,
// long translucent-looking legs, dark glossy pincers
const PALE_MAT = new THREE.MeshStandardMaterial({ color: 0xd8cec0, roughness: 0.42, metalness: 0, emissive: 0x16110c });
const PLATE_MAT = new THREE.MeshStandardMaterial({ color: 0x9a8e7e, roughness: 0.32, metalness: 0 });
const LEG_MAT = new THREE.MeshStandardMaterial({ color: 0xc9bca8, roughness: 0.5, metalness: 0 });
const MAW_MAT = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.22, metalness: 0 });
const GUT_MAT = new THREE.MeshStandardMaterial({ color: 0x5a1f1c, roughness: 0.5, metalness: 0 });
const SHAFT_MAT = new THREE.MeshBasicMaterial({ color: 0x050403 });
const SKY_MAT = new THREE.MeshBasicMaterial({ color: 0xdfe8ff });
/** The light down the shaft: a faint cold wash on the shaft's mouth, brightest
 *  at the top and gone by head height (a vertex-colour gradient, additive). */
const WASH_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function washGeometry(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let v = 0; v < pos.count; v++) {
    const t = Math.max(0, (pos.getY(v) + h / 2) / h - 0.12) / 0.88;
    const k = 0.32 * t * t;
    col[v * 3] = 0.75 * k;
    col[v * 3 + 1] = 0.82 * k;
    col[v * 3 + 2] = 1.0 * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** THE CLIMBING ROPE as it lies: a coil of orange climbing rope (three loops
 *  stacked a little off true), about 40cm across — the key drawn on the floor. */
export function makeRope(): THREE.Group {
  const g = new THREE.Group();
  g.name = "climbing-rope";
  const tube = new THREE.TorusGeometry(0.18, 0.025, 8, 28);
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(tube, ROPE_MAT);
    m.rotation.x = Math.PI / 2 + (k - 1.5) * 0.06;
    m.rotation.z = k * 0.7;
    m.position.set((k % 2) * 0.02, 0.025 + k * 0.045, ((k + 1) % 2) * 0.015);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

interface Body {
  id: number;
  group: THREE.Group;
  /** Instanced parts: the body, its plates, the legs' two halves. */
  body: THREE.InstancedMesh;
  plates: THREE.InstancedMesh;
  thighs: THREE.InstancedMesh;
  shins: THREE.InstancedMesh;
  head: THREE.Group;
  jawL: THREE.Object3D;
  jawR: THREE.Object3D;
  feelL: THREE.Object3D;
  feelR: THREE.Object3D;
  tail: THREE.Group;
  /** The lunge of a bite: when it started (performance.now), 0 = none. */
  strikeAt: number;
  /** How far it is reared up, 0..1, eased. */
  rear: number;
  /** The head's trail (cells), newest first — the body lies along it. */
  trail: { x: number; y: number }[];
  tx: number;
  ty: number;
  x: number;
  y: number;
  mode: string;
  seenAt: number;
  phase: number;
}

export class CaveScene {
  private d: CaveDeps;
  private chimney: { x: number; y: number; side: number; open: boolean; group: THREE.Group; rope: THREE.Object3D | null; label: THREE.Sprite | null } | null = null;
  private bodies = new Map<number, Body>();
  private segGeo = new THREE.SphereGeometry(1, 12, 9);
  private legGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
  /** A thigh tapers from the hip (+Y is the knee end): the straight
   *  cylinders of one width read as a ladder's rungs (Nov 2026 polish round). */
  private thighGeo = new THREE.CylinderGeometry(0.32, 0.62, 1, 6, 1);

  private seats: WallSeats;

  constructor(d: CaveDeps) {
    this.d = d;
    this.seats = new WallSeats(d.wallFace);
  }

  /** Dress the Cave System from the server's state (welcome and travel). */
  apply(st: CaveState | undefined): void {
    this.clear();
    if (!st) return;
    if (st.chimney) this.setChimney(st.chimney);
  }

  clear(): void {
    if (this.chimney) {
      this.d.reap(this.chimney.group);
      this.d.reap(this.chimney.label);
      this.chimney = null;
    }
    for (const b of this.bodies.values()) this.d.reap(b.group);
    this.bodies.clear();
  }

  /** The Chimney from the server (welcome, or streamed near it). Returns true
   *  the moment the rope is seen to go in. */
  setChimney(h: { x: number; y: number; side: number; open: boolean }): boolean {
    if (this.chimney && this.chimney.x === h.x && this.chimney.y === h.y) {
      if (this.chimney.open === h.open) return false;
      this.chimney.open = h.open;
      this.hangRope();
      this.relabel(true);
      return h.open;
    }
    if (this.chimney) {
      this.d.reap(this.chimney.group);
      this.d.reap(this.chimney.label);
    }
    const group = new THREE.Group();
    group.name = "chimney";
    // Lights Out's table: the group's +z faces out of the wall into the room
    group.rotation.y = SIDE_ROT[h.side] ?? 0;
    // the shaft's foot sits on the wall: its mouth a dark slot from the floor
    // up, the light coming down it from a round of pale light far above.
    // ON THE WALL'S REAL FACE, 1 cm proud (Nov 2026 polish round — the
    // audit's L8-02): at a fixed 0.05 in from the edge the mouth and the wash
    // sat 6-8 cm inside a thin wall and the depth test hid them, so the
    // Chimney read as plain rock (wallseat.ts has why one inset can't do).
    this.d.pinToGround(group, h.x, h.y, 0);
    this.seats.seat(group, h.x, h.y, h.side);
    // the shaft's own height (the Chimney room's ceiling): read off the
    // vocabulary, not the world — the welcome arrives before the chunk does
    const top = CAVE_CEILINGS.chimney;
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, top), SHAFT_MAT);
    mouth.name = "mouth";
    mouth.position.set(0, top / 2, 0.02);
    group.add(mouth);
    // the round of light at the top: the manhole, a streetlight over it
    const sky = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), SKY_MAT);
    sky.name = "sky";
    // the shaft opens in the roof just in front of the wall face, so the
    // round of sky hangs on the room side where it can be seen
    sky.position.set(0, top - 0.25, 0.45);
    sky.rotation.x = Math.PI / 2;
    group.add(sky);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 6, 24), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6 }));
    rim.position.copy(sky.position);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    // the light falling down the shaft, faint: a wash on its mouth, not a
    // lamp (the fixture law — the light's source is the streetlight above)
    const wash = new THREE.Mesh(washGeometry(1.4, top), WASH_MAT);
    wash.position.set(0, top / 2, 0.04);
    group.add(wash);
    this.d.scene.add(group);
    this.chimney = { ...h, group, rope: null, label: null };
    this.hangRope();
    return false;
  }

  chimneyState(): { x: number; y: number; open: boolean } | null {
    return this.chimney ? { x: this.chimney.x, y: this.chimney.y, open: this.chimney.open } : null;
  }
  nearChimney(px: number, py: number): boolean {
    return !!this.chimney && Math.hypot(this.chimney.x - px, this.chimney.y - py) < CHIMNEY_REACH;
  }

  /** A Burrower's position from the server. */
  burrowerPos(id: number, x: number, y: number, mode: string): void {
    let b = this.bodies.get(id);
    const now = performance.now();
    if (!b) {
      b = this.buildBody(id, x, y, mode, now);
      this.bodies.set(id, b);
    } else if (now - b.seenAt > BURROW_STALE_MS) {
      b.x = x;
      b.y = y;
      b.trail = [{ x, y }];
    }
    b.tx = x;
    b.ty = y;
    b.mode = mode;
    b.seenAt = now;
  }
  /** It bit somebody: the front end lunges and the pincers snap. */
  burrowerStrike(id: number): void {
    const b = this.bodies.get(id);
    if (b) b.strikeAt = performance.now();
  }
  burrowerGone(id: number): void {
    const b = this.bodies.get(id);
    if (!b) return;
    this.d.reap(b.group);
    this.bodies.delete(id);
  }
  /** The nearest Burrower you have frames for (cells), or null. */
  nearestBurrower(px: number, py: number): { d: number; x: number; y: number; mode: string } | null {
    let best: { d: number; x: number; y: number; mode: string } | null = null;
    const now = performance.now();
    for (const b of this.bodies.values()) {
      if (now - b.seenAt > BURROW_STALE_MS) continue;
      const d = Math.hypot(b.x - px, b.y - py);
      if (!best || d < best.d) best = { d, x: b.x, y: b.y, mode: b.mode };
    }
    return best;
  }

  /** Per frame: each body eased onto the server's position, its segments laid
   *  along the trail, rippling; the Chimney's name only once you stand at it. */
  tick(now: number, dt: number, px: number, py: number): void {
    const k = 1 - Math.exp(-8 * dt);
    for (const b of this.bodies.values()) {
      const stale = now - b.seenAt > BURROW_STALE_MS;
      b.group.visible = !stale;
      if (stale) continue;
      // LINGERING OVER YOU, NOT IN YOU (Nov 2026 polish round — the audit's
      // L8-06): the server lingers where it heard you, which is where you
      // stand, so the body was drawn through your own legs. While it lingers
      // that close it is drawn LINGER_GAP off you instead, the whole body
      // sliding by the same step so it keeps facing you.
      let ex = b.tx;
      let ey = b.ty;
      let slide = false;
      if (b.mode === "linger" && Math.hypot(ex - px, ey - py) < LINGER_GAP) {
        let ux = b.x - px;
        let uy = b.y - py;
        if (Math.hypot(ux, uy) < 0.05) {
          // dead on top: back off the way its own body runs
          const t1 = b.trail[Math.min(2, b.trail.length - 1)];
          ux = t1.x - b.x;
          uy = t1.y - b.y;
        }
        const ul = Math.hypot(ux, uy) || 1;
        ex = px + (ux / ul) * LINGER_GAP;
        ey = py + (uy / ul) * LINGER_GAP;
        slide = true;
      }
      const mx = (ex - b.x) * k;
      const my = (ey - b.y) * k;
      b.x += mx;
      b.y += my;
      if (slide) {
        for (const p of b.trail) {
          p.x += mx;
          p.y += my;
        }
      }
      const head = b.trail[0];
      if (Math.hypot(b.x - head.x, b.y - head.y) >= SEG_GAP / 2) {
        b.trail.unshift({ x: b.x, y: b.y });
        if (b.trail.length > SEGMENTS * 3) b.trail.length = SEGMENTS * 3;
      } else {
        head.x = b.x;
        head.y = b.y;
      }
      const hunting = b.mode === "hunt";
      // the legs' wave runs with how fast it is really moving
      const moving = Math.min(1, Math.hypot(b.tx - b.x, b.ty - b.y) * 4 + (hunting ? 0.6 : 0.25));
      b.phase += dt * (hunting ? 11 : 4.5) * moving;
      b.rear += ((hunting ? 1 : 0) - b.rear) * (1 - Math.exp(-4 * dt));
      this.layBody(b, now);
    }
    if (this.chimney) this.relabel(Math.hypot(this.chimney.x - px, this.chimney.y - py) <= CHIMNEY_LABEL_NEAR);
    this.seats.tick();
  }

  /** For the review hook: what the scene thinks it is drawing. */
  debug(): { chimney: unknown; burrowers: { id: number; x: number; y: number; mode: string; visible: boolean }[] } {
    return {
      chimney: this.chimney
        ? {
            x: this.chimney.x,
            y: this.chimney.y,
            open: this.chimney.open,
            rope: !!this.chimney.rope,
            labelled: !!this.chimney.label,
            // where the shaft's mouth and its sky stand (cells), to check
            // which side of the wall each is on
            mouth: ((v) => [+(v.x / CELL).toFixed(2), +v.y.toFixed(2), +(v.z / CELL).toFixed(2)])(this.chimney.group.getObjectByName("mouth")!.getWorldPosition(new THREE.Vector3())),
            sky: ((v) => [+(v.x / CELL).toFixed(2), +v.y.toFixed(2), +(v.z / CELL).toFixed(2)])(this.chimney.group.getObjectByName("sky")!.getWorldPosition(new THREE.Vector3())),
          }
        : null,
      burrowers: [...this.bodies.values()].map((b) => ({ id: b.id, x: +b.x.toFixed(2), y: +b.y.toFixed(2), mode: b.mode, visible: b.group.visible })),
    };
  }

  // ---- the Burrower's body ----------------------------------------------------
  private buildBody(id: number, x: number, y: number, mode: string, now: number): Body {
    const group = new THREE.Group();
    group.name = "burrower";
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.castShadow = true;
      m.frustumCulled = false; // its parts move every frame; the group is small
      group.add(m);
      return m;
    };
    const body = inst(this.segGeo, PALE_MAT, SEGMENTS);
    const plates = inst(this.segGeo, PLATE_MAT, SEGMENTS);
    const thighs = inst(this.thighGeo, LEG_MAT, SEGMENTS * 2);
    const shins = inst(this.legGeo, LEG_MAT, SEGMENTS * 2);
    // THE HEAD: a flat wedge, no eyes anywhere; under it a wet dark mouth;
    // two curved pincers either side; two long feelers
    const head = new THREE.Group();
    const skull = new THREE.Mesh(this.segGeo, PLATE_MAT);
    skull.scale.set(SEG_W * 0.56, SEG_H * 0.42, SEG_L * 0.5);
    skull.position.set(0, SEG_H * 0.5, -0.06);
    skull.castShadow = true;
    // the mouth: a wet dark slit under the front of the head
    const gut = new THREE.Mesh(this.segGeo, GUT_MAT);
    gut.scale.set(SEG_W * 0.16, SEG_H * 0.1, 0.06);
    gut.position.set(0, SEG_H * 0.22, -0.3);
    head.add(skull, gut);
    const fangGeo = new THREE.ConeGeometry(0.045, 0.42, 6);
    const jaw = (sgn: number): THREE.Object3D => {
      // a sickle fang: a heavy base reaching forward, the tip curling in
      const pivot = new THREE.Object3D();
      pivot.position.set(sgn * 0.17, SEG_H * 0.3, -0.2);
      const splay = new THREE.Object3D();
      splay.rotation.y = -sgn * 0.45;
      pivot.add(splay);
      const base = new THREE.Mesh(fangGeo, MAW_MAT);
      base.rotation.set(-Math.PI / 2, 0, 0);
      base.rotation.z = 0;
      base.position.set(0, 0, -0.2);
      base.scale.set(1.2, 1, 1.2);
      const tip = new THREE.Mesh(fangGeo, MAW_MAT);
      tip.scale.set(0.6, 0.6, 0.6);
      tip.position.set(-sgn * 0.08, 0, -0.42);
      tip.rotation.set(-Math.PI / 2, 0, 0);
      tip.rotation.y = 0;
      const curl = new THREE.Object3D();
      curl.position.set(0, 0, -0.36);
      curl.rotation.y = sgn * 0.9;
      tip.position.set(0, 0, -0.1);
      curl.add(tip);
      base.castShadow = true;
      tip.castShadow = true;
      splay.add(base, curl);
      head.add(pivot);
      return pivot;
    };
    const jawL = jaw(-1);
    const jawR = jaw(1);
    const feeler = (sgn: number): THREE.Object3D => {
      const pivot = new THREE.Object3D();
      pivot.position.set(sgn * 0.08, SEG_H * 0.75, -0.24);
      const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 0.9, 4), LEG_MAT);
      whip.position.set(0, 0, -0.45);
      whip.rotation.x = Math.PI / 2;
      pivot.add(whip);
      head.add(pivot);
      return pivot;
    };
    const feelL = feeler(-1);
    const feelR = feeler(1);
    group.add(head);
    // THE TAIL: two long trailing spines
    const tail = new THREE.Group();
    for (const sgn of [-1, 1]) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.55, 5), LEG_MAT);
      spine.rotation.x = Math.PI / 2;
      spine.rotation.y = sgn * 0.25;
      spine.position.set(sgn * 0.06, 0.06, 0.3);
      tail.add(spine);
    }
    group.add(tail);
    this.d.scene.add(group);
    return {
      id, group, body, plates, thighs, shins, head, jawL, jawR, feelL, feelR, tail,
      strikeAt: 0, rear: mode === "hunt" ? 1 : 0,
      trail: [{ x, y }], tx: x, ty: y, x, y, mode, seenAt: now, phase: Math.random() * 6,
    };
  }

  /** Lay the body along its trail: segment positions, then each segment's
   *  frame (forward = toward the head), then the parts in that frame. */
  private layBody(b: Body, now: number): void {
    const N = SEGMENTS;
    // where each segment sits on the floor (cells): SEG_GAP apart along the
    // trail, and straight on past its end (a body that has only just
    // surfaced has a trail of one point)
    const pts: { x: number; y: number }[] = [];
    const tr = b.trail;
    let ti = 0;
    let along = 0; // distance from tr[0] to tr[ti]
    for (let s = 0; s < N; s++) {
      const want = s * SEG_GAP;
      while (ti < tr.length - 1) {
        const l = Math.hypot(tr[ti + 1].x - tr[ti].x, tr[ti + 1].y - tr[ti].y);
        if (along + l >= want) break;
        along += l;
        ti++;
      }
      if (ti < tr.length - 1) {
        const l = Math.hypot(tr[ti + 1].x - tr[ti].x, tr[ti + 1].y - tr[ti].y) || 1;
        const t = (want - along) / l;
        pts.push({ x: tr[ti].x + (tr[ti + 1].x - tr[ti].x) * t, y: tr[ti].y + (tr[ti + 1].y - tr[ti].y) * t });
      } else {
        const end = tr[tr.length - 1];
        const prev = tr.length > 1 ? tr[tr.length - 2] : { x: end.x, y: end.y - 1 };
        const l = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
        const over = want - along;
        pts.push({ x: end.x + ((end.x - prev.x) / l) * over, y: end.y + ((end.y - prev.y) / l) * over });
      }
    }
    const st = b.strikeAt ? (now - b.strikeAt) / STRIKE_MS : 1;
    if (st >= 1) b.strikeAt = 0;
    const lunge = st < 1 ? Math.sin(st * Math.PI) : 0;
    // world positions (metres), with the side-to-side ripple and the rear
    const W: THREE.Vector3[] = [];
    for (let s = 0; s < N; s++) {
      const p = pts[s];
      const q = pts[Math.min(s + 1, N - 1)];
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const l = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(b.phase * 0.5 - s * 0.45) * 0.04 * (s / N + 0.25);
      const wx = p.x + (-dy / l) * wob;
      const wy = p.y + (dx / l) * wob;
      const front = Math.max(0, 1 - s / 5);
      const lift = (b.rear * REAR + lunge * 0.25) * front * front;
      const fwd = lunge * 0.35 * front;
      W.push(new THREE.Vector3((wx + (dx / l) * fwd / CELL) * CELL, this.d.groundAt(wx, wy) + lift, (wy + (dy / l) * fwd / CELL) * CELL));
    }
    const m4 = new THREE.Matrix4();
    const frame = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const qa = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const legPart = (mesh: THREE.InstancedMesh, i: number, from: THREE.Vector3, to: THREE.Vector3, r: number): void => {
      dir.subVectors(to, from);
      const len = dir.length() || 1e-3;
      qa.setFromUnitVectors(Y, dir.multiplyScalar(1 / len));
      v.addVectors(from, to).multiplyScalar(0.5);
      sc.set(r, len, r);
      m4.compose(v, qa, sc);
      mesh.setMatrixAt(i, m4);
    };
    for (let s = 0; s < N; s++) {
      const P = W[s];
      const toward = s === 0 ? new THREE.Vector3().subVectors(W[0], W[1]).add(W[0]) : W[s - 1];
      // the frame: -z toward the head (Matrix4.lookAt's convention)
      frame.lookAt(P, toward, up);
      frame.setPosition(P);
      const taper = 1 - (s / N) * 0.55;
      const w = SEG_W * taper;
      const h = SEG_H * taper;
      const L = SEG_L * (s === 0 ? 0.8 : 1) * taper;
      // body
      m4.makeScale(w / 2, h / 2, L / 2);
      m4.setPosition(0, h * 0.55, 0);
      b.body.setMatrixAt(s, m4.premultiply(frame));
      // the armour plate over it, a shade wider, flatter and higher
      m4.makeScale(w * 0.56, h * 0.22, L * 0.5);
      m4.setPosition(0, h * 0.95, 0.02);
      b.plates.setMatrixAt(s, m4.premultiply(frame));
      // two legs: hip → knee (up and out) → foot (down on the floor), the
      // foot swinging in a wave that runs down the body, lifted on its way
      // forward; long and spidery at the front, shorter toward the tail
      // THE LEGS DON'T MARCH IN STEP (Nov 2026 polish round — the audit's
      // L8-07): every pair's knee stood at one height (h + 0.16, above the
      // back) on one straight thigh, so a rearing body showed two rows of
      // rungs. Now the knee sits lower (about the flank), each pair carries
      // its own small offsets of phase, length and rake, and the reared front
      // pairs fold in toward the body the way a rearing centipede's do.
      const jit = LEG_JITTER[s];
      const folded = b.rear * Math.max(0, 1 - s / 5);
      const reach = (0.42 + 0.18 * (1 - s / N)) * (s < 2 ? 0.8 : 1) * jit.len * (1 - 0.4 * folded);
      for (const side of [-1, 1]) {
        const ph = b.phase - s * 0.75 + jit.ph + (side > 0 ? Math.PI : 0);
        const swing = Math.sin(ph) * 0.13 + jit.rake * side;
        const raise = Math.max(0, Math.cos(ph)) * 0.08;
        const hip = A.set(side * w * 0.42, h * 0.5, 0).applyMatrix4(frame);
        const knee = B.set(side * (w * 0.5 + reach * 0.5), h * (0.75 + jit.knee) + folded * 0.08, swing * 0.5 - folded * 0.12).applyMatrix4(frame);
        const i = s * 2 + (side > 0 ? 1 : 0);
        legPart(b.thighs, i, hip, knee, 0.035 * taper + 0.012);
        const foot = new THREE.Vector3(side * (w * 0.5 + reach * (1 - 0.3 * folded)), folded * h * 0.6, swing - folded * 0.18).applyMatrix4(frame);
        foot.y = Math.min(foot.y, this.d.groundAt(foot.x / CELL, foot.z / CELL) + raise + (s < 5 ? (b.rear * REAR) * Math.max(0, 1 - s / 5) * 0.5 : 0));
        legPart(b.shins, i, knee, foot, 0.022 * taper + 0.01);
      }
      if (s === 0) {
        b.head.matrixAutoUpdate = false;
        m4.makeTranslation(0, 0, -L * 0.45);
        b.head.matrix.copy(frame).multiply(m4);
      }
      if (s === N - 1) {
        b.tail.matrixAutoUpdate = false;
        b.tail.matrix.copy(frame);
      }
    }
    b.body.instanceMatrix.needsUpdate = true;
    b.plates.instanceMatrix.needsUpdate = true;
    b.thighs.instanceMatrix.needsUpdate = true;
    b.shins.instanceMatrix.needsUpdate = true;
    // the pincers work while it hunts and snap shut on a bite; the feelers
    // sweep the floor ahead
    const open = st < 1 ? (st < 0.4 ? 0.6 : 0.6 * (1 - (st - 0.4) / 0.6)) : b.mode === "hunt" ? 0.25 + 0.2 * Math.sin(b.phase * 1.7) : 0.08;
    b.jawL.rotation.y = open;
    b.jawR.rotation.y = -open;
    const sweep = Math.sin(b.phase * 0.9) * 0.35;
    b.feelL.rotation.set(-0.15 + Math.sin(b.phase * 1.3) * 0.12, 0.45 + sweep, 0);
    b.feelR.rotation.set(-0.15 + Math.cos(b.phase * 1.1) * 0.12, -0.45 + sweep, 0);
  }

  // ---- internals ------------------------------------------------------------
  /** The rope hanging down the shaft once it's fixed, a coil at its foot. */
  private hangRope(): void {
    const c = this.chimney;
    if (!c) return;
    if (!c.open) {
      if (c.rope) {
        c.group.remove(c.rope);
        c.rope = null;
      }
      return;
    }
    if (c.rope) return;
    const g = new THREE.Group();
    const mouth = c.group.children[0] as THREE.Mesh;
    const top = (mouth.geometry as THREE.PlaneGeometry).parameters.height;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, top, 6), ROPE_MAT);
    line.position.set(0.15, top / 2, 0.12);
    g.add(line);
    const coil = makeRope();
    coil.position.set(0.25, 0, 0.35);
    g.add(coil);
    // the anchor: a piton and a carabiner at waist height
    const piton = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.4 }));
    piton.position.set(0.15, 1.0, 0.06);
    g.add(piton);
    c.group.add(g);
    c.rope = g;
  }

  /** The Chimney's name, shown only while you stand at it (`show`). */
  private relabel(show: boolean): void {
    const h = this.chimney;
    if (!h) return;
    if (!show) {
      if (h.label) {
        this.d.reap(h.label);
        h.label = null;
      }
      return;
    }
    const text = h.open ? "THE CHIMNEY · ROPE FIXED" : "THE CHIMNEY · NO ROPE";
    if (h.label && h.label.name === text) return;
    this.d.reap(h.label);
    h.label = this.d.makeLabel(text, DOOR_RED);
    h.label.name = text;
    this.d.pinToGround(h.label, h.x, h.y, 2.6);
    this.d.scene.add(h.label);
  }
}
