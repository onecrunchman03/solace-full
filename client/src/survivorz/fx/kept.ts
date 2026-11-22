// SURVIVORZ EFFECTS — kept geometry: what's come to rest and stays for the rest of the show
// (wreckage, for now), merged into one mesh per material per room, in chunks that start small
// and double as they fill (the decals' kept layer, decals.ts, is the same idea with a drying
// clock). One draw a chunk, culled by its own bounds like any room object.
import * as THREE from "three";
import { KEPT_CHUNKS_PER_ROOM, overBudget } from "./budget";

/** triangles a chunk holds at most (one draw) */
export const KEPT_TRIS = 16384;
const FIRST = 512;

interface Chunk {
  room: string;
  material: THREE.Material;
  mesh: THREE.Mesh;
  used: number;
  cap: number;
  box: THREE.Box3;
}

export class KeptLayer {
  readonly group = new THREE.Group();
  private chunks: Chunk[] = [];

  constructor(readonly name: string) {
    this.group.name = `fx-kept:${name}`;
  }

  /** Add `count` vertices (whole triangles) of a geometry, as they stand, to a room's layer. */
  add(room: string, material: THREE.Material, g: THREE.BufferGeometry, start: number, count: number): void {
    const tris = Math.floor(count / 3);
    if (tris <= 0) return;
    let c = this.chunks.find((x) => x.room === room && x.material === material && x.used + tris <= KEPT_TRIS);
    if (!c) c = this.chunk(room, material, g);
    if (c.used + tris > c.cap) this.grow(c, Math.min(KEPT_TRIS, Math.max(c.cap * 2, c.used + tris)));
    const to = c.used * 3, n = tris * 3;
    for (const [name, a] of Object.entries(g.attributes)) {
      const dst = c.mesh.geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!dst) continue;
      const w = (a as THREE.BufferAttribute).itemSize;
      (dst.array as Float32Array).set(((a as THREE.BufferAttribute).array as Float32Array).subarray(start * w, (start + n) * w), to * w);
      dst.addUpdateRange(to * w, n * w);
      dst.needsUpdate = true;
    }
    const P = (c.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const v = new THREE.Vector3();
    for (let q = to; q < to + n; q++) {
      v.set(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]);
      // (a collapsed triangle is zeros: it isn't part of the bounds)
      if (v.x !== 0 || v.y !== 0 || v.z !== 0) c.box.expandByPoint(v);
    }
    c.used += tris;
    const geo = c.mesh.geometry;
    geo.setDrawRange(0, c.used * 3);
    geo.boundingBox = c.box.clone();
    geo.boundingSphere = c.box.getBoundingSphere(new THREE.Sphere());
    c.mesh.visible = true;
  }

  private chunk(room: string, material: THREE.Material, like: THREE.BufferGeometry): Chunk {
    // the room's budget for this material (fx/budget.ts): its oldest chunk goes first
    for (const old of overBudget(this.chunks, (c) => c.room === room && c.material === material, KEPT_CHUNKS_PER_ROOM)) {
      this.group.remove(old.mesh);
      old.mesh.geometry.dispose();
      this.chunks.splice(this.chunks.indexOf(old), 1);
    }
    const g = alloc(like, FIRST);
    g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `fx-kept:${this.name}:${room}`;
    mesh.visible = false;
    this.group.add(mesh);
    const c: Chunk = { room, material, mesh, used: 0, cap: FIRST, box: new THREE.Box3() };
    this.chunks.push(c);
    return c;
  }

  private grow(c: Chunk, tris: number): void {
    const old = c.mesh.geometry;
    const g = alloc(old, tris, true);
    g.setDrawRange(0, c.used * 3);
    g.boundingBox = old.boundingBox;
    g.boundingSphere = old.boundingSphere;
    c.mesh.geometry = g;
    old.dispose();
    c.cap = tris;
  }

  /** chunks with something in them (draws, when on screen) */
  get draws(): number {
    return this.chunks.filter((c) => c.mesh.visible).length;
  }

  /** triangles kept in a room (or everywhere) */
  tris(room?: string): number {
    return this.chunks.filter((c) => room === undefined || c.room === room).reduce((n, c) => n + c.used, 0);
  }

  gpuBytes(): number {
    let n = 0;
    for (const c of this.chunks) for (const a of Object.values(c.mesh.geometry.attributes)) n += (a as THREE.BufferAttribute).array.byteLength;
    return n;
  }

  clear(): void {
    for (const c of this.chunks) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.chunks = [];
  }
}

/** a geometry shaped like `like` (its attributes) with room for `tris`; `copy` brings its data */
function alloc(like: THREE.BufferGeometry, tris: number, copy = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(like.attributes)) {
    const src = a as THREE.BufferAttribute;
    const arr = new Float32Array(tris * 3 * src.itemSize);
    if (copy) arr.set((src.array as Float32Array).subarray(0, Math.min(src.array.length, arr.length)));
    g.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize).setUsage(THREE.DynamicDrawUsage));
  }
  return g;
}
