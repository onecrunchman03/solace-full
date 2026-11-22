// THE TERROR HOTEL's set pieces in the game (Level 5) — BACKROOMS.md → "LEVEL 5
// — TERROR HOTEL". The server's HotelState is the whole truth about where they
// stand; this file only draws them and answers "am I near one?":
//
//  · THE GUEST REGISTER, open on the table in the Beverly Room (E reads it —
//    the number only ever comes back to the reader, never on any other frame).
//  · THE LIFTS: brass doors on their walls (E opens the panel).
//  · THE RUSTY DOOR, the way on, wanting the Boiler Key.
//  · THE FURNACES below stairs, their mouths glowing.
//  · THE MOTHS' NESTS on the ceilings of the dark rooms, and the SWARMS
//    themselves — sleeping on their nests until a torch comes, then a cloud
//    of wings on the server's positions (instanced, one draw for the lot).
//
// Everything the scene adds is passed in by the game (its labels, ground pins,
// kit loader), so this file holds no copy of those rules.
import * as THREE from "three";
import { CELL } from "./world";
import { makeSign } from "./signs";
import { WallSeats, type WallFace } from "./wallseat";
import type { HotelState } from "./gamenet";

export interface HotelDeps {
  scene: THREE.Scene;
  makeLabel: (text: string, tint: string) => THREE.Sprite;
  pinToGround: (o: THREE.Object3D, x: number, y: number, off: number) => unknown;
  reap: (o: THREE.Object3D | null | undefined) => void;
  /** A prop-kit model by file name, cloned (the game's loader). */
  withKit: (name: string, cb: (m: THREE.Object3D) => void) => void;
  /** Seat a kit model's back on the group's origin; its size. */
  backToWall: (m: THREE.Object3D) => THREE.Vector3;
  groundAt: (x: number, y: number) => number;
  /** A cell's ceiling elevation (integer cell coords). */
  ceilAt: (x: number, y: number) => number;
  /** The nearest table (a kit prop) within reach of a spot, once its chunk
   *  has streamed in — the register's book lies on it. */
  tableNear: (x: number, y: number) => { x: number; y: number } | null;
  /** Where a wall's face is (wallseat.ts). */
  wallFace: WallFace;
}

/** Wall side → the cell step toward that wall, and the yaw that turns a model
 *  built facing +z (back on z=0) to stand against it. */
const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const DOOR_RED = "#ff4b4b";
const BRASS = "#e7c27a";

/** How near (cells) counts as "at" each thing — mirrors the server's reach. */
export const REGISTER_REACH = 2.4;
export const LIFT_REACH = 2.2;
export const RUSTY_REACH = 2.6;

/** A suite's number plate: the corridor doors' own white plate (the reuse
 *  law), at their height, half a metre past the doorway's jamb. */
const PLATE_FILE = "sign-plate-white";
const PLATE_Z = 2.35;
const PLATE_PAST_JAMB = 0.5;
/** The lift doors' brass (the grey kit metal read as a black hole on the
 *  dark walls). Metalness stays inside the kit's 0.3 clamp. */
const LIFT_BRASS = new THREE.Color(0xb08a4c);
const LIFT_FRAME = new THREE.MeshStandardMaterial({ color: 0x4a3418, roughness: 0.5, metalness: 0.3 });
const LIFT_SEAM = new THREE.MeshBasicMaterial({ color: 0x120c06 });

/** Moths drawn per swarm. */
const PER_SWARM = 26;
/** An awake swarm with no frame for this long is not near you any more. */
const SWARM_STALE_MS = 2500;

interface Swarm {
  id: number;
  nestX: number;
  nestY: number;
  /** Where the server last put it (cells) and what it is doing. */
  tx: number;
  ty: number;
  mode: string;
  awake: boolean;
  seenAt: number;
  /** The drawn centre (metres), eased toward the server's. */
  cx: number;
  cy: number;
  cz: number;
}

let mothTex: THREE.CanvasTexture | null = null;
/** A DEATHMOTH, from above: dusty grey-brown wings, dark veins, two eye spots
 *  and the pale skull on its back that gives the thing its name. */
function deathmothTexture(): THREE.CanvasTexture {
  if (mothTex) return mothTex;
  const W = 128;
  const H = 72;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const wing = (dir: 1 | -1): void => {
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(dir, 1);
    // forewing
    g.beginPath();
    g.moveTo(2, -6);
    g.bezierCurveTo(20, -34, 52, -36, 62, -22);
    g.bezierCurveTo(56, -8, 30, 0, 2, 2);
    g.closePath();
    const f = g.createLinearGradient(0, -30, 60, 0);
    f.addColorStop(0, "#4a3b2c");
    f.addColorStop(0.6, "#6b5a46");
    f.addColorStop(1, "#3a2e22");
    g.fillStyle = f;
    g.fill();
    // hindwing
    g.beginPath();
    g.moveTo(2, 2);
    g.bezierCurveTo(28, 2, 46, 14, 40, 28);
    g.bezierCurveTo(26, 34, 8, 22, 2, 8);
    g.closePath();
    g.fillStyle = "#3d3125";
    g.fill();
    // veins
    g.strokeStyle = "rgba(20,14,8,0.6)";
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(4, -2);
      g.lineTo(26 + k * 9, -28 + k * 6);
      g.stroke();
    }
    // the eye spot
    g.fillStyle = "#c9b48a";
    g.beginPath();
    g.arc(42, -18, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a120a";
    g.beginPath();
    g.arc(42, -18, 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  wing(1);
  wing(-1);
  // the body, and the skull on it
  g.fillStyle = "#2a2018";
  g.beginPath();
  g.ellipse(W / 2, H / 2 + 4, 5, 18, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#d8cbb0";
  g.beginPath();
  g.arc(W / 2, H / 2 - 4, 3.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#2a2018";
  g.fillRect(W / 2 - 2.4, H / 2 - 5, 1.6, 1.6);
  g.fillRect(W / 2 + 0.8, H / 2 - 5, 1.6, 1.6);
  mothTex = new THREE.CanvasTexture(c);
  mothTex.colorSpace = THREE.SRGBColorSpace;
  return mothTex;
}

const brassCache = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
/** One brass copy per kit material, shared by every lift — nothing new to
 *  compile past the first. */
function brassOf(src: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = brassCache.get(src);
  if (!m) {
    m = src.clone();
    m.color?.copy(LIFT_BRASS);
    m.roughness = 0.42;
    m.metalness = Math.min(0.3, Math.max(m.metalness ?? 0, 0.25));
    brassCache.set(src, m);
  }
  return m;
}

export class HotelScene {
  private d: HotelDeps;
  private objs: THREE.Object3D[] = [];
  private register: { x: number; y: number } | null = null;
  /** The book, waiting for its table's chunk to arrive. */
  private book: THREE.Group | null = null;
  private lifts: { x: number; y: number; side: number }[] = [];
  /** Suites whose number plate waits for its wall's chunk to arrive. */
  private plates: { number: number; x: number; y: number; side: number }[] = [];
  /** Where each plate went (cells) — for the review hook. */
  private platesHung: { number: number; x: number; y: number }[] = [];
  private furnaces: { x: number; y: number; side: number; glow: THREE.Mesh | null; phase: number }[] = [];
  private rusty: { x: number; y: number; side: number; open: boolean; group: THREE.Group; label: THREE.Sprite } | null = null;
  private swarms = new Map<number, Swarm>();
  /** The nests, re-hung under the ceiling every frame (the ceiling is only
   *  known once its chunk has streamed in). */
  private nests: { x: number; y: number; o: THREE.Object3D }[] = [];
  private moths: THREE.InstancedMesh | null = null;
  private orbit: { r: number; w: number; ph: number; dy: number; flap: number }[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  private seats: WallSeats;

  constructor(d: HotelDeps) {
    this.d = d;
    this.seats = new WallSeats(d.wallFace);
  }

  /** Dress the hotel from the server's state (welcome and travel). */
  apply(st: HotelState | undefined): void {
    this.clear();
    if (!st) return;
    const { scene, makeLabel, pinToGround } = this.d;
    if (st.register) {
      this.register = { ...st.register };
      // the book goes on its table once the table's chunk is here (tick)
      this.book = this.makeRegister();
    }
    for (const l of st.lifts) {
      this.lifts.push({ ...l });
      const g = this.onWall(l.x, l.y, l.side);
      this.d.withKit("hotel-lift-doors", (m) => {
        const size = this.d.backToWall(m);
        // brass, as the brief has them, and since the kit's "doors" are one
        // plain box: a dark bronze frame round it and the seam down the
        // middle where the two leaves meet (Nov 2026 polish round)
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.material = brassOf(mesh.material as THREE.MeshStandardMaterial);
        });
        g.add(m);
        const z = size.z + 0.004;
        const t = 0.09;
        for (const [w, h, x, y] of [
          [size.x + t, t, 0, size.y],
          [t, size.y, -size.x / 2, size.y / 2],
          [t, size.y, size.x / 2, size.y / 2],
        ] as [number, number, number, number][]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), LIFT_FRAME);
          bar.position.set(x, y, z - 0.02);
          g.add(bar);
        }
        const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.018, size.y - 0.02), LIFT_SEAM);
        seam.position.set(0, size.y / 2, z);
        g.add(seam);
      });
      const label = makeLabel("LIFT", BRASS);
      pinToGround(label, l.x, l.y, 2.55);
      scene.add(label);
      this.objs.push(label);
    }
    for (const f of st.furnaces) {
      const rec = { ...f, glow: null as THREE.Mesh | null, phase: Math.random() * 10 };
      this.furnaces.push(rec);
      const g = this.onWall(f.x, f.y, f.side);
      this.d.withKit("cast-iron-furnace", (m) => {
        const size = this.d.backToWall(m);
        g.add(m);
        // the mouth: a coal-orange glow on the furnace's face
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(0.7, size.x * 0.5), Math.min(0.45, size.y * 0.3)),
          new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
        );
        glow.position.set(0, Math.max(0.3, size.y * 0.32), size.z + 0.01);
        g.add(glow);
        rec.glow = glow;
      });
    }
    // THE SUITES' NUMBER PLATES (Nov 2026 polish round): the server always
    // sent them and nothing drew them, so the register's "No. 215" pointed at
    // no door at all. Each is hung on the corridor side once its wall is known.
    for (const q of st.suites ?? []) this.plates.push({ number: q.number, x: q.door.x, y: q.door.y, side: q.door.side });
    if (st.rustydoor) this.setRustyDoor(st.rustydoor);
    // the nests, and a swarm asleep on each
    const tex = deathmothTexture();
    for (let i = 0; i < st.nests.length; i++) {
      const n = st.nests[i];
      const top = this.ceil(n.x, n.y);
      const nest = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2b2117, roughness: 1 });
      for (let k = 0; k < 4; k++) {
        const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + k * 0.03, 0), mat);
        lump.position.set(Math.cos(k * 2.1) * 0.18, -0.05 - k * 0.04, Math.sin(k * 2.1) * 0.18);
        lump.scale.set(1.3, 0.55, 1.1);
        nest.add(lump);
      }
      nest.position.set(n.x * CELL, top - 0.04, n.y * CELL);
      scene.add(nest);
      this.nests.push({ x: n.x, y: n.y, o: nest });
      this.objs.push(nest);
      this.swarms.set(i, { id: i, nestX: n.x, nestY: n.y, tx: n.x, ty: n.y, mode: "asleep", awake: false, seenAt: 0, cx: n.x * CELL, cy: top - 0.25, cz: n.y * CELL });
    }
    const count = st.nests.length * PER_SWARM;
    if (count) {
      const geo = new THREE.PlaneGeometry(0.3, 0.17);
      geo.rotateX(-Math.PI / 2); // lying flat: wings out to the sides
      const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
      this.moths = new THREE.InstancedMesh(geo, mat, count);
      this.moths.frustumCulled = false; // the instances roam the whole floor
      this.moths.name = "deathmoths";
      scene.add(this.moths);
      this.orbit = Array.from({ length: count }, (_, i) => ({
        r: 0.35 + ((i * 37) % 100) / 100 * 0.9,
        w: (1.6 + ((i * 53) % 100) / 100 * 2.2) * (i % 2 ? 1 : -1),
        ph: ((i * 71) % 100) / 100 * Math.PI * 2,
        dy: (((i * 29) % 100) / 100 - 0.5) * 0.8,
        flap: 18 + ((i * 13) % 100) / 100 * 10,
      }));
    }
  }

  clear(): void {
    for (const o of this.objs) this.d.reap(o);
    this.objs = [];
    if (this.rusty) {
      this.d.reap(this.rusty.group);
      this.d.reap(this.rusty.label);
      this.rusty = null;
    }
    if (this.moths) {
      this.d.scene.remove(this.moths);
      this.moths.geometry.dispose();
      (this.moths.material as THREE.Material).dispose();
      this.moths = null;
    }
    this.register = null;
    if (this.book) this.d.reap(this.book);
    this.book = null;
    this.lifts = [];
    this.plates = [];
    this.platesHung = [];
    this.seats.clear();
    this.furnaces = [];
    this.nests = [];
    this.swarms.clear();
  }

  /** The rusty door from the server (welcome, or streamed near it). Returns
   *  true the moment it is seen to swing open. */
  setRustyDoor(rd: { x: number; y: number; side: number; open: boolean }): boolean {
    if (this.rusty && this.rusty.x === rd.x && this.rusty.y === rd.y) {
      if (this.rusty.open === rd.open) return false;
      this.rusty.open = rd.open;
      this.relabelRusty();
      const pivot = this.rusty.group.getObjectByName("rusty-pivot");
      if (pivot && rd.open) pivot.rotation.y = -1.25;
      return rd.open;
    }
    if (this.rusty) {
      this.d.reap(this.rusty.group);
      this.d.reap(this.rusty.label);
    }
    const group = this.onWall(rd.x, rd.y, rd.side);
    this.d.withKit("steel-door-swing--3", (m) => {
      const size = this.d.backToWall(m);
      // a rust-brown iron door: the station's steel door, gone to rot
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mm = (mesh.material as THREE.MeshStandardMaterial).clone();
        mm.color?.multiply(new THREE.Color(0x9a5a34));
        mm.roughness = 0.9;
        mm.metalness = 0.3;
        mesh.material = mm;
      });
      // hinged on its left edge, so it swings like a door when it opens
      const pivot = new THREE.Group();
      pivot.name = "rusty-pivot";
      pivot.position.x = -size.x / 2;
      m.position.x += size.x / 2;
      pivot.add(m);
      if (this.rusty?.open) pivot.rotation.y = -1.25;
      group.add(pivot);
    });
    const label = this.d.makeLabel("", DOOR_RED);
    this.rusty = { ...rd, group, label };
    this.relabelRusty();
    return false;
  }

  /** Read the state of the rusty door (for the E key). */
  rustyDoor(): { x: number; y: number; open: boolean } | null {
    return this.rusty ? { x: this.rusty.x, y: this.rusty.y, open: this.rusty.open } : null;
  }

  nearRegister(px: number, py: number): boolean {
    return !!this.register && Math.hypot(this.register.x - px, this.register.y - py) < REGISTER_REACH;
  }
  nearLift(px: number, py: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = LIFT_REACH;
    for (const l of this.lifts) {
      const d = Math.hypot(l.x - px, l.y - py);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }
  nearRusty(px: number, py: number): boolean {
    return !!this.rusty && Math.hypot(this.rusty.x - px, this.rusty.y - py) < RUSTY_REACH;
  }
  /** The nearest furnace's mouth (cells), or null with none in the level. */
  nearestFurnace(px: number, py: number): { d: number; x: number; y: number } | null {
    let best: { d: number; x: number; y: number } | null = null;
    for (const f of this.furnaces) {
      const [dx, dy] = SIDE_D[f.side] ?? [0, -1];
      const mx = f.x - dx * 0.6;
      const my = f.y - dy * 0.6;
      const d = Math.hypot(mx - px, my - py);
      if (!best || d < best.d) best = { d, x: mx, y: my };
    }
    return best;
  }
  /** The nearest AWAKE swarm you can currently see frames for. */
  nearestAwake(px: number, py: number): { d: number; x: number; y: number } | null {
    let best: { d: number; x: number; y: number } | null = null;
    const now = performance.now();
    for (const w of this.swarms.values()) {
      if (!w.awake || now - w.seenAt > SWARM_STALE_MS) continue;
      const x = w.cx / CELL;
      const y = w.cz / CELL;
      const d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { d, x, y };
    }
    return best;
  }

  /** A swarm's position from the server (only while it is awake). */
  mothPos(id: number, x: number, y: number, mode: string): void {
    const w = this.swarms.get(id);
    if (!w) return;
    const now = performance.now();
    if (!w.awake || now - w.seenAt > SWARM_STALE_MS) {
      // first sight (or back in range): start the cloud where it is
      w.cx = x * CELL;
      w.cz = y * CELL;
      w.cy = this.d.groundAt(x, y) + 1.6;
    }
    w.awake = true;
    w.tx = x;
    w.ty = y;
    w.mode = mode;
    w.seenAt = now;
  }
  /** A swarm woke, began circling, or settled. Returns the event's place. */
  mothEv(id: number, ev: "wake" | "circle" | "sleep", x: number, y: number): void {
    const w = this.swarms.get(id);
    if (!w) return;
    if (ev === "sleep") {
      w.awake = false;
      w.mode = "asleep";
      w.tx = w.nestX;
      w.ty = w.nestY;
      return;
    }
    this.mothPos(id, x, y, ev === "circle" ? "circling" : "hunting");
  }

  /** Per frame: the swarms' wings and the furnaces' glow. */
  tick(now: number, dt: number): void {
    const t = now / 1000;
    for (const f of this.furnaces) {
      if (!f.glow) continue;
      const fl = 0.72 + 0.18 * Math.sin(t * 7.3 + f.phase) + 0.1 * Math.sin(t * 19.1 + f.phase * 3);
      (f.glow.material as THREE.MeshBasicMaterial).opacity = fl;
    }
    for (const n of this.nests) n.o.position.y = this.ceil(n.x, n.y) - 0.04;
    if (this.plates.length) this.hangPlates();
    this.seats.tick();
    if (this.book && !this.book.parent && this.register) {
      const t = this.d.tableNear(this.register.x, this.register.y);
      if (t) {
        // on the half of the table nearest the reader, beside the game
        this.d.pinToGround(this.book, t.x, t.y + 0.14, 0.76);
        this.book.rotation.y = 0.12;
        this.d.scene.add(this.book);
        this.objs.push(this.book);
        // its name hangs over the table, not over the reader
        const label = this.d.makeLabel("THE GUEST REGISTER", BRASS);
        this.d.pinToGround(label, t.x, t.y, 1.75);
        this.d.scene.add(label);
        this.objs.push(label);
      }
    }
    const mesh = this.moths;
    if (!mesh) return;
    const k = 1 - Math.exp(-6 * dt);
    let i = 0;
    for (const w of this.swarms.values()) {
      const stale = w.awake && now - w.seenAt > SWARM_STALE_MS;
      if (stale) {
        // awake, and not near you: not on its nest either — draw nothing
        for (let j = 0; j < PER_SWARM; j++, i++) {
          this.m4.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, this.m4);
        }
        continue;
      }
      const asleep = !w.awake;
      const top = this.ceil(w.nestX, w.nestY);
      const wantY = asleep ? top - 0.12 : this.d.groundAt(w.tx, w.ty) + 1.55;
      w.cx += (w.tx * CELL - w.cx) * k;
      w.cz += (w.ty * CELL - w.cz) * k;
      w.cy += (wantY - w.cy) * k;
      for (let j = 0; j < PER_SWARM; j++, i++) {
        const o = this.orbit[i];
        if (asleep) {
          // clinging to the nest, wings twitching now and then
          const a = o.ph;
          const r = 0.12 + o.r * 0.22;
          this.v.set(w.cx + Math.cos(a) * r, w.cy + o.dy * 0.08, w.cz + Math.sin(a) * r);
          const open = 0.8 + 0.2 * Math.max(0, Math.sin(t * 1.3 + o.ph * 5));
          this.e.set(Math.PI, a, 0); // upside down on the ceiling
          this.q.setFromEuler(this.e);
          this.s.set(open, 1, 1);
        } else {
          const a = o.ph + t * o.w * (w.mode === "circling" ? 0.6 : 1);
          const r = o.r * (w.mode === "hunting" ? 1 : 1.4);
          this.v.set(w.cx + Math.cos(a) * r, w.cy + o.dy + Math.sin(t * 3 + o.ph) * 0.15, w.cz + Math.sin(a) * r);
          // fly along the orbit's tangent, banked into the turn
          // The card's head is -Z; this yaw points it along the orbit's
          // tangent, the way it is moving (it was 90° off, so every moth
          // crabbed sideways round the cloud — Nov 2026 polish round).
          this.e.set(0.25 * Math.sin(t * 4 + o.ph), o.w > 0 ? Math.PI - a : -a, o.w > 0 ? 0.35 : -0.35);
          this.q.setFromEuler(this.e);
          this.s.set(0.2 + 0.8 * Math.abs(Math.sin(t * o.flap + o.ph)), 1, 1);
        }
        this.m4.compose(this.v, this.q, this.s);
        mesh.setMatrixAt(i, this.m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** For the review hook: what the scene thinks it is drawing. */
  debug(): { swarms: { id: number; awake: boolean; mode: string; x: number; y: number; z: number }[]; nests: number; moths: number; book: unknown; plates: { number: number; x: number; y: number }[]; platesWaiting: number } {
    return {
      plates: this.platesHung,
      platesWaiting: this.plates.length,
      swarms: [...this.swarms.values()].map((w) => ({ id: w.id, awake: w.awake, mode: w.mode, x: +(w.cx / CELL).toFixed(2), y: +(w.cz / CELL).toFixed(2), z: +w.cy.toFixed(2) })),
      nests: this.nests.length,
      moths: this.moths?.count ?? 0,
      book: this.book ? { placed: !!this.book.parent, x: +(this.book.position.x / CELL).toFixed(2), y: +(this.book.position.z / CELL).toFixed(2), z: +this.book.position.y.toFixed(2), table: this.register ? this.d.tableNear(this.register.x, this.register.y) : null } : null,
    };
  }

  // ---- internals ------------------------------------------------------------
  private ceil(x: number, y: number): number {
    const c = this.d.ceilAt(Math.floor(x), Math.floor(y));
    return Number.isFinite(c) && c > 0 ? c : this.d.groundAt(x, y) + 3.2;
  }

  /** A group standing against the wall on `side` of the cell at (x, y). */
  private onWall(x: number, y: number, side: number): THREE.Group {
    const g = new THREE.Group();
    g.rotation.y = SIDE_ROT[side] ?? 0;
    // On the wall's real face, 1 cm proud: at a fixed 0.06 in from the edge
    // every model's back sat 9 cm inside a thin wall, and the lift doors read
    // as black holes behind their own edges (Nov 2026 polish round —
    // wallseat.ts has why one inset can't be right).
    this.d.pinToGround(g, x, y, 0);
    this.seats.seat(g, x, y, side);
    this.d.scene.add(g);
    this.objs.push(g);
    return g;
  }

  /** Hang each waiting suite plate where somebody in the corridor reads it:
   *  on the door's own wall beside the jamb where the corridor is wider than
   *  the door, else on the corridor's side wall just short of the doorway
   *  (where a corridor ends in the door there is no wall face beside it — a
   *  plate "beside the jamb" there hung in a sealed pocket behind the
   *  corridor wall). Waits until the cells' chunks have streamed in. */
  private hangPlates(): void {
    const left: { number: number; x: number; y: number; side: number }[] = [];
    for (const q of this.plates) {
      const [dx, dy] = SIDE_D[q.side] ?? [0, -1];
      const cx = q.x + dx;
      const cy = q.y + dy;
      let spot: { x: number; y: number; rot: number } | null = null;
      let unknown = false;
      const back = (q.side + 2) % 4;
      // 1. the door's wall, facing the corridor, beside the jamb: the
      //    corridor goes on sideways past the door and there is wall there
      for (const k of [1, -1]) {
        if (spot) break;
        const px = -dy * k;
        const py = dx * k;
        const ps = SIDE_D.findIndex(([sx, sy]) => sx === px && sy === py);
        const sideways = this.d.wallFace(cx, cy, ps);
        const face = this.d.wallFace(cx + px, cy + py, back);
        if (sideways === null || face === null) {
          unknown = true;
          continue;
        }
        if (sideways < 0 && face >= 0) {
          const p = WallSeats.at(cx + px + 0.5, cy + py + 0.5, back, face, 0.005);
          // half a metre past the jamb (the jamb is the edge between C and C+p)
          const toward = (CELL / 2 - PLATE_PAST_JAMB) / CELL;
          spot = { x: p.x - px * toward, y: p.y - py * toward, rot: SIDE_ROT[back] ?? 0 };
        }
      }
      // 2. the corridor's side wall in the cell before the door, facing in
      for (const k of [1, -1]) {
        if (spot) break;
        const px = -dy * k;
        const py = dx * k;
        const ps = SIDE_D.findIndex(([sx, sy]) => sx === px && sy === py);
        const face = this.d.wallFace(cx, cy, ps);
        if (face === null) {
          unknown = true;
          continue;
        }
        if (face >= 0) {
          // a little toward the door, so it is read as the door's number
          const p = WallSeats.at(cx + 0.5 - dx * 0.2, cy + 0.5 - dy * 0.2, ps, face, 0.005);
          spot = { x: p.x, y: p.y, rot: SIDE_ROT[ps] ?? 0 };
        }
      }
      if (!spot) {
        if (unknown) left.push(q);
        continue;
      }
      const g = new THREE.Group();
      g.rotation.y = spot.rot;
      g.add(makeSign(PLATE_FILE, String(q.number)));
      this.d.pinToGround(g, spot.x, spot.y, PLATE_Z);
      this.d.scene.add(g);
      this.objs.push(g);
      this.platesHung.push({ number: q.number, x: +spot.x.toFixed(2), y: +spot.y.toFixed(2) });
    }
    this.plates = left;
  }

  private relabelRusty(): void {
    const r = this.rusty;
    if (!r) return;
    this.d.reap(r.label);
    r.label = this.d.makeLabel(r.open ? "THE RUSTY DOOR · OPEN" : "THE RUSTY DOOR · LOCKED", DOOR_RED);
    this.d.pinToGround(r.label, r.x, r.y, 2.7);
    this.d.scene.add(r.label);
  }

  /** The guest register: an old ledger lying open, its pages yellowed. */
  private makeRegister(): THREE.Group {
    const g = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: 0x5a1a14, roughness: 0.7 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xe6d9b8, roughness: 0.95 });
    for (const sgn of [-1, 1]) {
      const half = new THREE.Group();
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.32), leather);
      cover.position.set(sgn * 0.12, 0, 0);
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.03, 0.3), paper);
      pages.position.set(sgn * 0.115, 0.02, 0);
      half.add(cover, pages);
      half.rotation.z = sgn * -0.08; // the spine sags, the pages lift
      g.add(half);
    }
    return g;
  }
}
