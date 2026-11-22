// SURVIVORZ EFFECTS — decals: blood splatter, scorch marks, bullet holes and
// footprints laid onto walls and floors (docs/survivorz/EFFECTS.md §2–3).
//
// ONE MESH PER SET, not one per decal: four hundred marks as four hundred meshes
// would be four hundred draw calls, against a budget of sixty for every effect
// put together. Each set is a fixed pool of SLOTS in one buffer; a new mark
// takes the oldest slot when the pool is full, so the count, the buffer and the
// draw never grow. A slot's unused triangles are left at zero area.
//
// A set's textures are an atlas (colour, and optionally normal and roughness
// laid out identically), so every mark in it shares one material. The colour's
// alpha carries the mark's shape; the vertex alpha carries its fade.
//
// NOTHING LASTING IS THROWN AWAY (Josh, Oct 23: blood, scorch and the rest persist all
// show). A mark that's meant to last, about to lose its slot to a newer one, MOVES into the
// set's KEPT layer for its room instead: the same material (so a mark still drying keeps
// drying), in growing chunks of one draw each, culled by their own bounds. The live slots
// are only for marks still young; a room's old marks cost one draw per chunk, a few MB over
// a month of the show.
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { textureBytes } from "./particles";
import { DECAL_CHUNKS_PER_ROOM, overBudget } from "./budget";

export interface DecalAtlas {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  /** cells across and down; cell 0 is top-left */
  cols: number;
  rows: number;
  /** the first row is at v = 0 (a compressed KTX2, which can't be flipped on upload) */
  topDown?: boolean;
  /** laid out like the colour: the order a mark fills in (R, 0 first), for marks that GROW */
  spreadMap?: THREE.Texture;
}

export interface DecalSetOptions {
  /** marks are wet when laid and dry over `DecalSpec.dry` seconds: glossy → matte, red → brown */
  wet?: boolean;
}

export interface DecalSpec {
  /** what it is projected onto (a wall, a floor, a prop) — never a skinned body */
  target: THREE.Mesh;
  /** where it lands, and the surface's normal there */
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  /** metres across, along the surface */
  size: number;
  /** height / width; 1 for most marks */
  aspect?: number;
  /** radians round the normal */
  spin?: number;
  cell: number;
  /** how deep the projector reaches into and out of the surface, metres */
  depth?: number;
  /** tint × colour */
  color?: [number, number, number];
  opacity?: number;
  /** seconds it lasts before fading (Infinity = until it's pushed out) */
  life?: number;
  /** seconds of fade at the end of its life */
  fade?: number;
  /** a wet set: seconds until it's dry (default 120) */
  dry?: number;
  /** a set with a spread map: seconds it takes to spread to its full size (0 = all at once) */
  grow?: number;
  /** only this part of the cell (0..1 of the cell, image y down): one print out of a trail */
  rect?: [number, number, number, number];
  /** mirror it left to right (a right foot from a left foot's print) */
  flip?: boolean;
}

/** which room a surface is in (the world says; "" when it doesn't) */
export type RoomOf = (obj: THREE.Object3D) => string;

/** triangles in one kept chunk at most (one draw); a chunk starts small and doubles as it
 *  fills, so a room's kept marks cost what's in them (allocated whole, a chunk was 0.8 MB the
 *  moment it held one mark) */
export const KEPT_CHUNK = 4096;
const KEPT_FIRST = 256;

interface Kept {
  room: string;
  mesh: THREE.Mesh;
  used: number;
  /** triangles it has room for now */
  cap: number;
  /** the bounds of what's in it (the buffer's unused tail is zeros: bounds from the whole of
   *  it would always reach the origin, and the chunk would never be culled) */
  box: THREE.Box3;
  /** each mark in it: where its triangles are, and what it lies on (to go when that breaks) */
  marks: { start: number; tris: number; target?: THREE.Object3D }[];
}

interface Slot {
  used: boolean;
  born: number;
  life: number;
  fade: number;
  opacity: number;
  tris: number;
  /** what it was laid on, so it can go when that breaks */
  target?: THREE.Object3D;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const Zp = new THREE.Vector3(0, 0, 1);

export class DecalSet {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  private geo = new THREE.BufferGeometry();
  private slots: Slot[];
  private next = 0;
  private pos: THREE.BufferAttribute;
  private nor: THREE.BufferAttribute;
  private uv: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  /** born, seconds to dry, grow start, seconds to grow — only on a wet or growing set */
  private life: THREE.BufferAttribute | null = null;
  private uNow = { value: 0 };
  /** marks laid that were bigger than a slot (their extra triangles were dropped) */
  truncated = 0;
  /** where a mark's room is (set by the system from the world's resolver) */
  roomOf: RoomOf = () => "";
  /** the kept layer: old lasting marks, by room, in chunks; the meshes go under `keptRoot` */
  private kept: Kept[] = [];
  readonly keptRoot = new THREE.Group();

  constructor(readonly name: string, readonly atlas: DecalAtlas, readonly capacity: number, readonly trisPerSlot = 96, readonly opts: DecalSetOptions = {}) {
    const verts = capacity * trisPerSlot * 3;
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.uv = new THREE.BufferAttribute(new Float32Array(verts * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(verts * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", this.pos);
    this.geo.setAttribute("normal", this.nor);
    this.geo.setAttribute("uv", this.uv);
    this.geo.setAttribute("color", this.col);
    this.geo.setDrawRange(0, verts);
    this.slots = Array.from({ length: capacity }, () => ({ used: false, born: 0, life: Infinity, fade: 0, opacity: 1, tris: 0 }));
    this.material = new THREE.MeshStandardMaterial({
      map: atlas.map,
      normalMap: atlas.normalMap ?? null,
      roughnessMap: atlas.roughnessMap ?? null,
      roughness: 1,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      // pulled toward the camera so it never fights the surface it lies on
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      forceSinglePass: true,
    });
    // a compressed atlas reads with v running down the image, so the normal map's green does too
    if (atlas.topDown && atlas.normalMap) this.material.normalScale.set(1, -1);
    if (opts.wet || atlas.spreadMap) {
      this.life = new THREE.BufferAttribute(new Float32Array(verts * 4), 4).setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute("aLife", this.life);
      this.patch(!!opts.wet, atlas.spreadMap ?? null);
    }
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.name = `fx-decals:${name}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5; // after the world, before the particle layers
    this.mesh.visible = false;
    this.keptRoot.name = `fx-decals-kept:${name}`;
  }

  /** Wet marks dry and growing marks spread, both on the GPU off one clock and a vec4 a
   *  vertex — nothing is rewritten while they change. */
  private patch(wet: boolean, spread: THREE.Texture | null): void {
    const m = this.material;
    const uSpread = { value: spread };
    if (wet) m.defines = { ...m.defines, DECAL_WET: "" };
    if (spread) m.defines = { ...m.defines, DECAL_SPREAD: "" };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNow = this.uNow;
      sh.uniforms.uSpread = uSpread;
      sh.vertexShader = sh.vertexShader
        .replace("void main() {", "attribute vec4 aLife;\nvarying vec4 vLife;\nvoid main() {\n  vLife = aLife;");
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "uniform float uNow;\nuniform sampler2D uSpread;\nvarying vec4 vLife;\nvoid main() {")
        .replace("#include <map_fragment>", `#include <map_fragment>
  float wet = 1.0 - clamp((uNow - vLife.x) / max(vLife.y, 0.001), 0.0, 1.0);
#ifdef DECAL_SPREAD
  // it fills from where the spread map is darkest, the front a soft edge
  float g = vLife.w <= 0.0 ? 1.0 : clamp((uNow - vLife.z) / vLife.w, 0.0, 1.0);
  g = (1.0 - (1.0 - g) * (1.0 - g)) * 1.08;
  diffuseColor.a *= 1.0 - smoothstep(g - 0.05, g + 0.01, texture2D(uSpread, vMapUv).r);
#endif
#ifdef DECAL_WET
  // dried blood goes dark and brown (a little brown added: there's no green in red to keep)
  diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.42, 0.3, 0.26) + vec3(0.014, 0.006, 0.003), diffuseColor.rgb, wet);
#endif`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
#ifdef DECAL_WET
  // glossy while wet, the thin edges going matte first
  // a film of blood stays glossy until it's most of the way dry, then goes matte quickly (a
  // linear fade makes a half-dry mark a wide pale sheen under a torch)
  float shine = smoothstep(0.1, 0.26, wet) * smoothstep(0.2, 0.75, diffuseColor.a);
  roughnessFactor = mix(0.86, 0.1, shine);
#endif`)
        .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
#ifdef DECAL_WET
  // dried blood is a matte crust: almost no reflection, even at a low angle (the grazing sheen
  // a rough dielectric keeps would turn it pale)
  material.specularColor *= mix(0.12, 1.0, shine);
  material.specularF90 = mix(0.12, 1.0, shine);
#endif`);
    };
    m.customProgramCacheKey = () => `fx-decal-life-v3:${wet ? 1 : 0}${spread ? 1 : 0}`;
  }

  /** the slot index used, or -1 if the projection hit nothing */
  add(d: DecalSpec, now: number): number {
    const aspect = d.aspect ?? 1;
    const size = new THREE.Vector3(d.size, d.size * aspect, d.depth ?? 0.3);
    // the projector looks INTO the surface along -normal, spun round it
    tmpQ.setFromUnitVectors(Zp, d.normal.clone().normalize());
    tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(Zp, d.spin ?? 0));
    const orient = new THREE.Euler().setFromQuaternion(tmpQ);
    d.target.updateMatrixWorld();
    const g = new DecalGeometry(d.target, d.pos, orient, size);
    const gp = g.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!gp || gp.count === 0) {
      g.dispose();
      return -1;
    }
    const gn = g.getAttribute("normal") as THREE.BufferAttribute;
    const gu = g.getAttribute("uv") as THREE.BufferAttribute;
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const slot = this.slots[i];
    const maxV = this.trisPerSlot * 3;
    // a lasting mark in the way moves to its room's kept layer rather than being lost
    if (slot.used && slot.life === Infinity) this.keep(i);
    let n = gp.count - (gp.count % 3);
    // a mark bigger than its slot keeps the triangles nearest its middle and loses its faded
    // rim: dropped in the order they came, it lost a straight-edged wedge out of the middle
    // (a pipe bomb's scorch on a finely divided floor)
    let order: number[] | null = null;
    if (n > maxV) {
      const tris = n / 3;
      const dist = new Float32Array(tris);
      for (let t = 0; t < tris; t++) {
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 3; k++) {
          x += gp.getX(t * 3 + k);
          y += gp.getY(t * 3 + k);
          z += gp.getZ(t * 3 + k);
        }
        dist[t] = (x / 3 - d.pos.x) ** 2 + (y / 3 - d.pos.y) ** 2 + (z / 3 - d.pos.z) ** 2;
      }
      order = Array.from({ length: tris }, (_, t) => t).sort((a2, b2) => dist[a2] - dist[b2]).slice(0, this.trisPerSlot);
      n = maxV;
      this.truncated++;
    }
    const base = i * maxV;
    const { cols, rows } = this.atlas;
    const row = Math.floor(d.cell / cols);
    const cu = (d.cell % cols) / cols, cv = this.atlas.topDown ? row / rows : 1 - (row + 1) / rows;
    // the part of the cell, as u across and v up it (rect is in image coords, y down)
    const [r0, r1, r2, r3] = d.rect ?? [0, 0, 1, 1];
    const L = this.life?.array as Float32Array | undefined;
    const born = now, dry = d.dry ?? 120, grow = d.grow ?? 0;
    const [r, gg, b] = d.color ?? [1, 1, 1];
    const P = this.pos.array as Float32Array, N = this.nor.array as Float32Array;
    const U = this.uv.array as Float32Array, C = this.col.array as Float32Array;
    for (let v = 0; v < maxV; v++) {
      const o = base + v;
      if (v < n) {
        const sv = order ? order[Math.floor(v / 3)] * 3 + (v % 3) : v;
        P[o * 3] = gp.getX(sv); P[o * 3 + 1] = gp.getY(sv); P[o * 3 + 2] = gp.getZ(sv);
        N[o * 3] = gn.getX(sv); N[o * 3 + 1] = gn.getY(sv); N[o * 3 + 2] = gn.getZ(sv);
        const gx = d.flip ? 1 - gu.getX(sv) : gu.getX(sv);
        const ux = r0 + gx * (r2 - r0), uy = 1 - r3 + gu.getY(sv) * (r3 - r1); // up the cell
        U[o * 2] = cu + ux / cols;
        U[o * 2 + 1] = this.atlas.topDown ? cv + (1 - uy) / rows : cv + uy / rows;
        if (L) { L[o * 4] = born; L[o * 4 + 1] = dry; L[o * 4 + 2] = born; L[o * 4 + 3] = grow; }
        C[o * 4] = r; C[o * 4 + 1] = gg; C[o * 4 + 2] = b; C[o * 4 + 3] = d.opacity ?? 1;
      } else {
        // collapsed: zero area, draws nothing
        P[o * 3] = P[o * 3 + 1] = P[o * 3 + 2] = 0;
        C[o * 4 + 3] = 0;
      }
    }
    g.dispose();
    Object.assign(slot, { used: true, born: now, life: d.life ?? Infinity, fade: d.fade ?? 2, opacity: d.opacity ?? 1, tris: n / 3, target: d.target });
    this.flush(base, maxV);
    this.mesh.visible = true;
    return i;
  }

  private flush(start: number, count: number): void {
    for (const [a, w] of [[this.pos, 3], [this.nor, 3], [this.uv, 2], [this.col, 4], [this.life, 4]] as const) {
      if (!a) continue;
      a.addUpdateRange(start * w, count * w);
      a.needsUpdate = true;
    }
  }

  /** Move slot `i`'s mark, exactly as it is (its drying clock included), into its room's kept
   *  layer. */
  private keep(i: number): void {
    const s = this.slots[i];
    const room = s.target ? this.roomOf(s.target) : "";
    const tris = s.tris;
    if (tris <= 0) return;
    let k = this.kept.find((c) => c.room === room && c.used + tris <= KEPT_CHUNK);
    if (!k) k = this.newChunk(room);
    if (k.used + tris > k.cap) this.grow(k, Math.min(KEPT_CHUNK, Math.max(k.cap * 2, k.used + tris)));
    const maxV = this.trisPerSlot * 3, from = i * maxV, to = k.used * 3, n = tris * 3;
    const g = k.mesh.geometry;
    for (const [name, w] of [["position", 3], ["normal", 3], ["uv", 2], ["color", 4], ["aLife", 4]] as const) {
      const src = this.geo.getAttribute(name) as THREE.BufferAttribute | undefined;
      const dst = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!src || !dst) continue;
      (dst.array as Float32Array).set((src.array as Float32Array).subarray(from * w, (from + n) * w), to * w);
      dst.addUpdateRange(to * w, n * w);
      dst.needsUpdate = true;
    }
    k.marks.push({ start: k.used, tris, target: s.target });
    k.used += tris;
    g.setDrawRange(0, k.used * 3);
    // its bounds grow with what's in it (it's culled like any room object)
    const kp = (g.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const v = new THREE.Vector3();
    for (let q = to; q < to + n; q++) k.box.expandByPoint(v.set(kp[q * 3], kp[q * 3 + 1], kp[q * 3 + 2]));
    g.boundingSphere = k.box.getBoundingSphere(g.boundingSphere ?? new THREE.Sphere());
    g.boundingBox = k.box.clone();
    k.mesh.visible = true;
    s.used = false;
  }

  /** a chunk's buffers, sized for `tris` triangles, with what it held copied across */
  private alloc(tris: number, from?: THREE.BufferGeometry): THREE.BufferGeometry {
    const verts = tris * 3;
    const g = new THREE.BufferGeometry();
    for (const [name, w] of [["position", 3], ["normal", 3], ["uv", 2], ["color", 4], ["aLife", 4]] as const) {
      if (name === "aLife" && !this.life) continue;
      const a = new Float32Array(verts * w);
      const old = from?.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (old) a.set(old.array as Float32Array);
      g.setAttribute(name, new THREE.BufferAttribute(a, w).setUsage(THREE.DynamicDrawUsage));
    }
    return g;
  }

  private grow(k: Kept, tris: number): void {
    const old = k.mesh.geometry;
    const g = this.alloc(tris, old);
    g.setDrawRange(0, k.used * 3);
    g.boundingSphere = old.boundingSphere;
    g.boundingBox = old.boundingBox;
    k.mesh.geometry = g;
    old.dispose();
    k.cap = tris;
  }

  private newChunk(room: string): Kept {
    // THE ROOM'S BUDGET (fx/budget.ts): a weeks-long show filled a fought-over room without end —
    // the room's oldest chunk goes before a new one is made
    for (const old of overBudget(this.kept, (c) => c.room === room, DECAL_CHUNKS_PER_ROOM)) {
      this.keptRoot.remove(old.mesh);
      old.mesh.geometry.dispose();
      this.kept.splice(this.kept.indexOf(old), 1);
    }
    const g = this.alloc(KEPT_FIRST);
    g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.name = `fx-decals-kept:${this.name}:${room}`;
    mesh.renderOrder = this.mesh.renderOrder;
    mesh.visible = false;
    this.keptRoot.add(mesh);
    const k: Kept = { room, mesh, used: 0, cap: KEPT_FIRST, box: new THREE.Box3(), marks: [] };
    this.kept.push(k);
    return k;
  }

  /** marks kept, by room (for the checks and the readouts) */
  keptCount(room?: string): number {
    return this.kept.filter((k) => room === undefined || k.room === room).reduce((n, k) => n + k.marks.filter((m) => m.tris > 0).length, 0);
  }

  /** bytes the kept layer takes on the GPU (the marks kept, not their textures) */
  keptBytes(): number {
    return this.kept.reduce((n, k) => n + k.cap * 3 * (3 + 3 + 2 + 4 + (this.life ? 4 : 0)) * 4, 0);
  }

  /** chunks drawn for the kept layer */
  get keptDraws(): number {
    return this.kept.filter((k) => k.mesh.visible).length;
  }

  /** fades marks reaching the end of their life, frees the dead */
  update(now: number): void {
    this.uNow.value = now;
    const maxV = this.trisPerSlot * 3;
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.used) continue;
      const age = now - s.born;
      if (age < s.life - s.fade) {
        any = true;
        continue;
      }
      const k = age >= s.life ? 0 : (s.life - age) / s.fade;
      const C = this.col.array as Float32Array;
      const base = i * maxV;
      for (let v = 0; v < s.tris * 3; v++) C[(base + v) * 4 + 3] = s.opacity * k;
      this.col.addUpdateRange(base * 4, s.tris * 3 * 4);
      this.col.needsUpdate = true;
      if (k <= 0) {
        s.used = false;
        const P = this.pos.array as Float32Array;
        P.fill(0, base * 3, (base + maxV) * 3);
        this.pos.addUpdateRange(base * 3, maxV * 3);
        this.pos.needsUpdate = true;
      } else any = true;
    }
    this.mesh.visible = any;
  }

  /** Take away every mark on `obj` or anything under it, at once: the thing it was on broke
   *  (a pane's cracks, the bullet holes in a door that burst). Returns how many went. */
  removeOn(obj: THREE.Object3D): number {
    const maxV = this.trisPerSlot * 3;
    const P = this.pos.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.used || !s.target) continue;
      let o: THREE.Object3D | null = s.target;
      while (o && o !== obj) o = o.parent;
      if (!o) continue;
      s.used = false;
      s.target = undefined;
      P.fill(0, i * maxV * 3, (i + 1) * maxV * 3);
      this.pos.addUpdateRange(i * maxV * 3, maxV * 3);
      this.pos.needsUpdate = true;
      n++;
    }
    // and the kept ones on it: collapsed where they lie (the chunk keeps its order)
    for (const k of this.kept) {
      const kp = k.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (const m of k.marks) {
        if (!m.target || m.tris <= 0) continue;
        let o: THREE.Object3D | null = m.target;
        while (o && o !== obj) o = o.parent;
        if (!o) continue;
        (kp.array as Float32Array).fill(0, m.start * 9, (m.start + m.tris) * 9);
        kp.addUpdateRange(m.start * 9, m.tris * 9);
        kp.needsUpdate = true;
        m.tris = 0;
        m.target = undefined;
        n++;
      }
    }
    return n;
  }

  get live(): number {
    return this.slots.reduce((n, s) => n + (s.used ? 1 : 0), 0);
  }

  clear(): void {
    for (const s of this.slots) s.used = false;
    for (const k of this.kept) {
      this.keptRoot.remove(k.mesh);
      k.mesh.geometry.dispose();
    }
    this.kept = [];
    (this.pos.array as Float32Array).fill(0);
    // the whole buffer, as an explicit range: a bare needsUpdate means "everything" only while no
    // range is pending, and the next mark's add() would turn it into "just that slot"
    this.pos.clearUpdateRanges();
    this.pos.addUpdateRange(0, this.pos.array.length);
    this.pos.needsUpdate = true;
    this.mesh.visible = false;
  }

  gpuBytes(): number {
    const tex = textureBytes;
    const verts = this.capacity * this.trisPerSlot * 3;
    const keptVerts = this.kept.reduce((n, k) => n + k.cap * 3, 0);
    return Math.round(tex(this.atlas.map) + tex(this.atlas.normalMap) + tex(this.atlas.roughnessMap) + tex(this.atlas.spreadMap) + (verts + keptVerts) * (3 + 3 + 2 + 4 + (this.life ? 4 : 0)) * 4);
  }
}

void tmpM;
