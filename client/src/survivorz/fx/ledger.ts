// SURVIVORZ EFFECTS — the ledger: what the effects leave behind, written down so it outlasts
// the renderer (Josh, Oct 23: severed limbs, wreckage, blood, scorch and wounds persist for
// the whole show, a renderer restart included).
//
// It records RESULTS, not causes: a mark as it was laid (its set, the surface it's on, where,
// its size and turn and cell, when), rather than the shot that made it. Replaying the shot
// would mean re-running the particles that carried the blood there; a laid mark is a dozen
// numbers and re-lays exactly. Rows are small and positions room-local (from the room's
// anchor, SURVIVORZ.md §3 "The facility file"), so a rebuilt room keeps its marks.
//
// The world gives it four things: what to call a surface (`idOf`), how to find it again
// (`find`), where each room's anchor is (`origin`), and the show's clock (server ms ↔ the
// effects' seconds). Rows go to `onRow` as they're made; `restore` takes them back.
import * as THREE from "three";
import type { FxSystem } from "./system";
import type { DecalSpec } from "./decals";
import type { Debris } from "./breaking";
import type { ShowCause, ShowFx } from "./show";
import type { RigidBody } from "./rigid";
import type { LimbCause } from "./gore";
import type { ZLookState } from "./zlook";

/** a mark laid (keys kept short: there are thousands of these over a show) */
export interface MarkRow {
  k: "m";
  /** the decal set */
  s: string;
  /** the surface it's on, and its room */
  on: string;
  r: string;
  /** where, room-local metres, and the surface's normal there */
  p: [number, number, number];
  n: [number, number, number];
  /** size, aspect, spin, cell, depth */
  z: number;
  a?: number;
  sp?: number;
  c: number;
  d?: number;
  col?: [number, number, number];
  o?: number;
  dry?: number;
  g?: number;
  rc?: [number, number, number, number];
  f?: 1;
  /** when, the show's clock (ms) */
  t: number;
}

/** something broke: the marks laid on it before this went with it */
export interface GoneRow {
  k: "x";
  on: string;
  t: number;
}

/** wreckage at rest: the show's event that made it (and the door as it was just before), and
 *  where each piece lay, room-local [x y z qx qy qz qw] (null: a piece that had gone) */
export interface WreckRow {
  k: "w";
  c: ShowCause["show"];
  r: string;
  ps: (number[] | null)[];
  t: number;
}

/** a chunk of meat, bone or skull at rest: which, and where (room-local pos, quat, scale) */
export interface GibRow {
  k: "g";
  g: string;
  r: string;
  m: number[];
  t: number;
}

/** a severed limb at rest: whose (the world's id and model), its look, how it was cut, its
 *  shape as it was at the cut (positions about its centre, in millimetres, base64), its cap,
 *  and where it lay */
export interface LimbRow {
  k: "l";
  z: { id: string; model: string };
  look: ZLookState;
  kind: string;
  site: string;
  cuts: string[];
  parts: { i: number; p: string }[];
  cap?: { key: string; m: number[] };
  r: string;
  m: number[];
  t: number;
}

export type LedgerRow = MarkRow | GoneRow | WreckRow | GibRow | LimbRow;

export interface LedgerOptions {
  /** a surface's name in the ledger (null: it can't be written down, so its marks aren't kept) */
  idOf?: (obj: THREE.Object3D) => string | null;
  /** the surface with that name */
  find?: (id: string) => THREE.Mesh | null;
  /** a fresh copy of a model (a zombie), not in the scene: a restart cuts its limbs from it */
  model?: (model: string) => THREE.Object3D | Promise<THREE.Object3D>;
  /** a room's anchor in the world (the room's local origin) */
  origin?: (room: string) => THREE.Vector3;
  /** the show's clock in ms from the effects' seconds, and back */
  toServer?: (fxNow: number) => number;
  fromServer?: (ms: number) => number;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export class FxLedger {
  /** called with every row as it's made: the world sends it to the show's store */
  onRow?: (row: LedgerRow) => void;

  /** laying rows back down: nothing it makes is written down again */
  private restoring = false;

  constructor(readonly fx: FxSystem, readonly o: LedgerOptions = {}) {
    fx.onMark = (set, d, now) => this.mark(set, d, now);
    fx.breaks.onKept = (d) => this.wreck(d);
    fx.rigid.onKept = (b, room) => this.piece(b, room);
    fx.onGone = (obj, now) => {
      if (this.restoring) return;
      const id = this.idOf(obj);
      if (id) this.emit({ k: "x", on: id, t: this.server(now) });
      // (a surface's parts go with it: a door's panel with the door)
      obj.traverse((c) => {
        if (c === obj) return;
        const cid = this.idOf(c);
        if (cid) this.emit({ k: "x", on: cid, t: this.server(now) });
      });
    };
  }

  /** Stop recording (the fx goes on without it). */
  detach(): void {
    this.fx.onMark = undefined;
    this.fx.onGone = undefined;
    this.fx.breaks.onKept = undefined;
    this.fx.rigid.onKept = undefined;
  }

  /** Lay the rows down again: in order, a surface's marks not if it broke after them. The
   *  newest stay live (still drying); the rest go to their rooms' kept layers as they would
   *  have. Returns how many were laid and how many couldn't find their surface. */
  async restore(rows: LedgerRow[], show?: ShowFx): Promise<{ laid: number; missing: number; gone: number; wrecks: number; gibs: number; limbs: number }> {
    this.restoring = true;
    try {
      const marks = this.restoreMarks(rows);
      // the wreckage: made again by the show (its doors registered by the world), in order
      let wrecks = 0;
      if (show) {
        for (const w of rows.filter((r): r is WreckRow => r.k === "w").sort((a, b) => a.t - b.t)) {
          const o = this.origin(w.r);
          const poses = w.ps.map((p) => (p ? { pos: new THREE.Vector3(p[0], p[1], p[2]).add(o), quat: new THREE.Quaternion(p[3], p[4], p[5], p[6]) } : null));
          if (show.restoreWreck(w.c, poses)) wrecks++;
        }
      }
      // the chunks of meat and bone, merged with their rooms' again
      let gibs = 0;
      const kit = rows.some((r) => r.k === "g" || r.k === "l") ? await this.fx.loadGore() : null;
      for (const g of rows.filter((r): r is GibRow => r.k === "g")) {
        const src = kit?.gibs.get(g.g);
        if (!src) continue;
        const obj = src.clone();
        this.place(obj, g.m, this.origin(g.r));
        this.fx.rigid.merge(obj, g.r);
        gibs++;
      }
      // the limbs: each cut again from a fresh copy of its zombie, one copy a zombie
      let limbs = 0;
      const copies = new Map<string, Awaited<ReturnType<FxSystem["cuttable"]>>>();
      for (const l of rows.filter((r): r is LimbRow => r.k === "l").sort((a, b) => a.t - b.t)) {
        if (!this.o.model) break;
        let cut = copies.get(l.z.id);
        if (!cut) {
          cut = await this.fx.cuttable(await this.o.model(l.z.model));
          cut.ref = { ...l.z };
          copies.set(l.z.id, cut);
        }
        cut.look.state = l.look;
        cut.kind = l.kind as typeof cut.kind;
        const parts = new Map(l.parts.map((p) => [p.i, unpack(p.p)] as const));
        const piece = cut.rebuild(l.site as Parameters<typeof cut.rebuild>[0], l.cuts, parts, l.cap);
        if (!piece) continue;
        this.place(piece, l.m, this.origin(l.r));
        this.fx.rigid.hold(piece, l.r);
        limbs++;
      }
      return { ...marks, wrecks, gibs, limbs };
    } finally {
      this.restoring = false;
    }
  }

  private restoreMarks(rows: LedgerRow[]): { laid: number; missing: number; gone: number } {
    const goneAt = new Map<string, number>();
    for (const r of rows) if (r.k === "x") goneAt.set(r.on, Math.max(goneAt.get(r.on) ?? -Infinity, r.t));
    const marks = rows.filter((r): r is MarkRow => r.k === "m").sort((a, b) => a.t - b.t);
    let laid = 0, missing = 0, gone = 0;
    for (const m of marks) {
      const g = goneAt.get(m.on);
      if (g !== undefined && g >= m.t) { gone++; continue; }
      const set = this.fx.decalSets.get(m.s);
      const target = this.find(m.on);
      if (!set || !target) { missing++; continue; }
      const o = this.origin(m.r);
      const spec: DecalSpec = {
        target, pos: new THREE.Vector3(...m.p).add(o), normal: new THREE.Vector3(...m.n), size: m.z, aspect: m.a, spin: m.sp, cell: m.c,
        depth: m.d, color: m.col, opacity: m.o, dry: m.dry, grow: m.g, rect: m.rc, flip: m.f === 1,
      };
      // straight into the set at the time it was laid (not through fx.decal: that would write
      // it down again)
      if (set.add(spec, this.local(m.t)) >= 0) laid++;
    }
    return { laid, missing, gone };
  }

  /** a piece at rest, kept: a chunk (which, where) or a limb (whose, how cut, its shape) */
  private piece(b: RigidBody, room: string): void {
    if (this.restoring) return;
    const o = this.origin(room);
    const m = this.pose(b.obj, o);
    const gib = (b.cause as { gib?: string } | undefined)?.gib;
    if (gib) {
      this.emit({ k: "g", g: gib, r: room, m, t: this.server(this.fx.now) });
      return;
    }
    const limb = (b.cause as LimbCause | undefined)?.limb;
    // (a limb can only be made again from a zombie the world has named)
    if (!limb || !limb.cut.ref) return;
    const parts: { i: number; p: string }[] = [];
    let cap: LimbRow["cap"];
    for (const c of b.obj.children) {
      // (the cap first: in the gore kit it's a group, not a mesh)
      if (c.userData.fxCap) {
        cap = { key: c.userData.fxCap as string, m: new THREE.Matrix4().compose(c.position, c.quaternion, c.scale).toArray().map(r4) };
        continue;
      }
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) continue;
      const i = mesh.geometry.userData.fxPart as number | undefined;
      if (i === undefined) continue;
      parts.push({ i, p: pack((mesh.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array) });
    }
    this.emit({
      k: "l", z: { ...limb.cut.ref }, look: limb.cut.look.state, kind: limb.cut.kind, site: limb.site, cuts: limb.cuts,
      parts, cap, r: room, m, t: this.server(this.fx.now),
    });
  }

  /** an object's world pose, room-local: position, quaternion, scale */
  private pose(obj: THREE.Object3D, o: THREE.Vector3): number[] {
    obj.updateMatrixWorld(true);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    obj.matrixWorld.decompose(p, q, sc);
    return [p.x - o.x, p.y - o.y, p.z - o.z, q.x, q.y, q.z, q.w, sc.x, sc.y, sc.z].map(r4);
  }

  private place(obj: THREE.Object3D, m: number[], o: THREE.Vector3): void {
    obj.position.set(m[0] + o.x, m[1] + o.y, m[2] + o.z);
    obj.quaternion.set(m[3], m[4], m[5], m[6]);
    obj.scale.set(m[7], m[8], m[9]);
    obj.updateMatrixWorld(true);
  }

  private wreck(d: Debris): void {
    if (this.restoring) return;
    const c = (d.cause as ShowCause | undefined)?.show;
    // (only the show's own events can be made again; a bench's direct call can't)
    if (!c) return;
    const room = this.fx.roomAt(d.centre());
    const o = this.origin(room);
    const ps = d.poses().map((p) => (p.phase === "gone" ? null : [r4(p.pos.x - o.x), r4(p.pos.y - o.y), r4(p.pos.z - o.z), r4(p.quat.x), r4(p.quat.y), r4(p.quat.z), r4(p.quat.w)]));
    this.emit({ k: "w", c, r: room, ps, t: this.server(this.fx.now) });
  }

  private mark(set: string, d: DecalSpec, now: number): void {
    // only what lasts: a mark with a life of its own fades anyway
    if (d.life !== undefined && d.life !== Infinity) return;
    const on = this.idOf(d.target);
    if (!on) return;
    const room = this.fx.roomOf(d.target);
    const o = this.origin(room);
    const row: MarkRow = {
      k: "m", s: set, on, r: room,
      p: [r4(d.pos.x - o.x), r4(d.pos.y - o.y), r4(d.pos.z - o.z)], n: [r4(d.normal.x), r4(d.normal.y), r4(d.normal.z)],
      z: r4(d.size), c: d.cell, t: this.server(now),
    };
    if (d.aspect !== undefined && d.aspect !== 1) row.a = r4(d.aspect);
    if (d.spin) row.sp = r4(d.spin);
    if (d.depth !== undefined) row.d = r4(d.depth);
    if (d.color) row.col = [r4(d.color[0]), r4(d.color[1]), r4(d.color[2])];
    if (d.opacity !== undefined && d.opacity !== 1) row.o = r4(d.opacity);
    if (d.dry !== undefined) row.dry = d.dry;
    if (d.grow) row.g = d.grow;
    if (d.rect) row.rc = [r4(d.rect[0]), r4(d.rect[1]), r4(d.rect[2]), r4(d.rect[3])];
    if (d.flip) row.f = 1;
    this.emit(row);
  }

  private emit(row: LedgerRow): void {
    this.onRow?.(row);
  }

  private idOf(obj: THREE.Object3D): string | null {
    if (this.o.idOf) return this.o.idOf(obj);
    return (obj.userData.fxId as string | undefined) ?? null;
  }

  private find(id: string): THREE.Mesh | null {
    if (this.o.find) return this.o.find(id);
    for (const s of this.fx.surfaces) if (s.userData.fxId === id) return s;
    let hit: THREE.Mesh | null = null;
    this.fx.opts.scene.traverse((c) => { if (!hit && c.userData.fxId === id && (c as THREE.Mesh).isMesh) hit = c as THREE.Mesh; });
    return hit;
  }

  private origin(room: string): THREE.Vector3 {
    return this.o.origin?.(room) ?? new THREE.Vector3();
  }

  private server(fxNow: number): number {
    return this.o.toServer ? this.o.toServer(fxNow) : Math.round(fxNow * 1000);
  }

  private local(ms: number): number {
    return this.o.fromServer ? this.o.fromServer(ms) : ms / 1000;
  }
}

/** positions as millimetres in 16 bits, base64 (a limb's shape in a few KB) */
function pack(a: Float32Array): string {
  const q = new Int16Array(a.length);
  for (let i = 0; i < a.length; i++) q[i] = Math.max(-32768, Math.min(32767, Math.round(a[i] * 1000)));
  const bytes = new Uint8Array(q.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function unpack(s: string): Float32Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const q = new Int16Array(bytes.buffer);
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 1000;
  return out;
}
