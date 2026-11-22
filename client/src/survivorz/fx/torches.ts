// SURVIVORZ EFFECTS — flashlights: the lens you see from across a dark room, and a battery
// that dies (MECHANICS-BRIEF.md: "a lit flashlight read from far off in the dark"; SURVIVORZ.md:
// batteries run down).
//
// THE WORLD OWNS THE TORCH, THE EFFECTS DRIVE IT (the fixtures' rule): its light comes from the
// world's own fixed pool and is handed over here to be dimmed and warmed, never added. What
// this adds is what you SEE of a torch: its beam in the air (the shared beam pool) and the
// glow of its lens — a bright point that flares when the torch points at the camera, kept
// a few pixels across however far away it is, so a torch in the dark reads from the far end
// of a corridor. Every lens is one instance of one quad: one draw for all of them.
//
// The battery is a pure function of its charge (the server's), time and seed: everyone sees
// the same sputter, a late joiner included.
import * as THREE from "three";
import type { BeamHandle, BeamPool } from "./beams";

const hash = (a: number, b: number) => {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** How a torch burns on what's left in its battery: `level` 0..1 of its full light, and how
 *  far its colour has gone from white to a dying amber (`warm` 0..1). Full down to 30% it's
 *  steady; then it dims and warms, dipping now and then; under 12% it sputters, dropping out
 *  more and more often; flat, it's dark. */
export function battery(charge: number, t: number, seed: number): { level: number; warm: number } {
  const c = Math.max(0, Math.min(1, charge));
  const warm = c >= 0.3 ? 0 : (0.3 - c) / 0.3;
  if (c <= 0) return { level: 0, warm: 1 };
  if (c >= 0.3) return { level: 1, warm: 0 };
  if (c >= 0.12) {
    const base = 0.55 + 0.45 * ((c - 0.12) / 0.18);
    // a dip now and then: the contact going, a fifth of a second
    const win = Math.floor(t / 1.7), into = t - win * 1.7;
    const dip = hash(win, seed ^ 0x5a) < 0.18 && into < 0.18;
    return { level: dip ? base * 0.45 : base, warm };
  }
  const base = 0.15 + 0.35 * (c / 0.12);
  const slot = Math.floor(t / 0.07);
  // the emptier, the more of the time it's out
  const out = hash(slot, seed) < 0.25 + 0.5 * (1 - c / 0.12);
  return { level: out ? 0.03 : base * (0.85 + 0.15 * hash(slot, seed ^ 0x33)), warm };
}

export interface TorchSpec {
  id: string;
  /** where the lens is and which way the torch points, each frame (null: put away) */
  lens: () => { pos: THREE.Vector3; dir: THREE.Vector3 } | null;
  /** the torch's own light, from the world's fixed pool: driven here, never added */
  light?: THREE.Light;
  on?: boolean;
  /** 0..1, what's left in the battery (the server's) */
  charge?: number;
  /** metres the beam reaches, and its half-angle */
  length?: number;
  angle?: number;
  seed?: number;
}

const WHITE = new THREE.Color(0xfff4e2), AMBER = new THREE.Color(0xffa45a);
const MAX = 16;

const VERT = /* glsl */ `
attribute vec4 iGlow;   // rgb × strength, and its size in metres
varying vec2 vUv;
varying vec3 vGlow;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv * 2.0 - 1.0;
  vGlow = iGlow.rgb;
  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // never smaller than a few pixels: a torch reads from the far end of a corridor
  float dist = length(cameraPosition - c.xyz);
  float size = max(iGlow.a, dist * 0.014);
  vec4 view = viewMatrix * c;
  view.xy += position.xy * size;
  // drawn a little toward the camera, so the lens's own housing never hides its glow
  view.z += 0.05;
  gl_Position = projectionMatrix * view;
  #include <logdepthbuf_vertex>
}
`;
const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vGlow;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r2 = dot(vUv, vUv);
  // a hot core, a soft halo, and a faint horizontal flare
  float glow = exp(-r2 * 28.0) * 1.6 + exp(-r2 * 5.0) * 0.35 + exp(-vUv.y * vUv.y * 160.0) * exp(-abs(vUv.x) * 3.0) * 0.12;
  gl_FragColor = vec4(vGlow * glow, 1.0);
}
`;

interface Torch extends TorchSpec {
  beam: BeamHandle | null;
  base: number;
  baseColor?: THREE.Color;
  slot: number;
  level: number;
}

export class Torches {
  readonly mesh: THREE.InstancedMesh;
  private list = new Map<string, Torch>();
  private glow: THREE.InstancedBufferAttribute;
  private free: number[] = [];

  constructor(private beams: BeamPool) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.glow.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iGlow", this.glow);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, forceSinglePass: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.name = "fx-torch-lenses";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.mesh.count = 0;
    this.mesh.visible = false;
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
  }

  /** Take a torch over: its beam in the air, its lens, its battery. Its light's CURRENT
   *  intensity is what "full" means. False when every lens slot is taken. */
  add(s: TorchSpec): boolean {
    this.remove(s.id);
    const slot = this.free.pop();
    if (slot === undefined) return false;
    const beam = this.beams.add({ pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), length: s.length ?? 9, angle: s.angle ?? 0.26, color: WHITE, intensity: 0, fit: true });
    this.list.set(s.id, { ...s, beam, base: s.light?.intensity ?? 0, baseColor: s.light?.color.clone(), slot, level: 0, seed: s.seed ?? hashStr(s.id) });
    return true;
  }

  /** The server's word on a torch: switched on or off, and its charge. */
  set(id: string, p: { on?: boolean; charge?: number }): void {
    const t = this.list.get(id);
    if (!t) return;
    if (p.on !== undefined) t.on = p.on;
    if (p.charge !== undefined) t.charge = p.charge;
  }

  remove(id: string): void {
    const t = this.list.get(id);
    if (!t) return;
    t.beam?.remove();
    if (t.light) {
      t.light.intensity = t.base;
      if (t.baseColor) t.light.color.copy(t.baseColor);
    }
    this.free.push(t.slot);
    this.list.delete(id);
  }

  /** How bright a torch is now, 0..1 (for the checks and the readouts). */
  level(id: string): number {
    return this.list.get(id)?.level ?? 0;
  }

  update(now: number, camera: THREE.Camera): void {
    const m = new THREE.Matrix4(), cam = camera.getWorldPosition(new THREE.Vector3()), to = new THREE.Vector3();
    const color = new THREE.Color();
    let used = 0;
    for (const t of this.list.values()) {
      const at = t.on === false ? null : t.lens();
      const b = at ? battery(t.charge ?? 1, now, t.seed ?? 0) : { level: 0, warm: 0 };
      t.level = b.level;
      color.copy(WHITE).lerp(AMBER, b.warm);
      if (t.light) {
        t.light.intensity = t.base * b.level;
        t.light.color.copy(t.baseColor ?? WHITE).lerp(AMBER, b.warm);
      }
      if (!at || b.level <= 0.01) {
        t.beam?.set({ intensity: 0 });
        continue;
      }
      const dir = at.dir.clone().normalize();
      t.beam?.set({ pos: at.pos, dir, intensity: 0.9 * b.level, color: color.clone() });
      // the lens: brighter and bigger the more squarely it points at the camera (the glare
      // of a torch in your face), a small bright point from the side
      to.copy(cam).sub(at.pos).normalize();
      const face = Math.max(0, dir.dot(to));
      // (only squarely at it does it wash out: a torch in your face, not a torch in the room)
      // (Nov 2026 — Josh: "why is this zombies head so shiny": a torch pointed down the lens in a close shot bloomed
      // into a 1.5 m white disc that swallowed whoever stood behind it. A torch in your face glares; it doesn't blank
      // the frame: 0.3 m at most, a little over a third of the old brightness)
      const strength = b.level * (0.3 + 1.0 * face ** 8);
      const size = 0.05 + 0.25 * face ** 12;
      m.makeTranslation(at.pos.x, at.pos.y, at.pos.z);
      this.mesh.setMatrixAt(used, m);
      this.glow.setXYZW(used, color.r * strength, color.g * strength, color.b * strength, size);
      used++;
    }
    this.mesh.count = used;
    this.mesh.visible = used > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.needsUpdate = true;
  }

  clear(): void {
    for (const id of [...this.list.keys()]) this.remove(id);
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
