// SURVIVORZ EFFECTS — light beams: the soft cone under a fixture and out of a
// flashlight, with dust drifting in it (docs/survivorz/EFFECTS.md §3 "Light beams",
// step F4).
//
// EVERY BEAM IN THE ROOM IS ONE INSTANCE OF ONE CONE, in one draw: a fixed pool, like
// the decal slots and the lights. A beam is additive light, so it needs no sorting:
// brightest along its axis, fading to nothing at its silhouette (the cone's normal
// against the view), dying away along its length, and thinned by a slow drifting
// noise in world space so it reads as light through dusty air rather than a
// lampshade. It never lights anything — the fixture's own light (the room's, or the
// effect pool's) does that; the beam is what you see of it in the air.
import * as THREE from "three";

export interface BeamSpec {
  /** where the light comes from */
  pos: THREE.Vector3;
  /** which way it points */
  dir: THREE.Vector3;
  /** metres to where it fades out (the floor under a fixture) */
  length: number;
  /** half-angle of the cone, radians */
  angle: number;
  color?: THREE.ColorRepresentation;
  /** 0..1+ — what the beam shows; a fixture's flicker drives it */
  intensity?: number;
  /** the floor it meets: it fades out just above it rather than cutting into it in a hard
   *  line (a flashlight pointed down, a fixture's cone reaching the floor) */
  floorY?: number;
  /** ends where it meets the first surface (a flashlight), up to `length`: a cone pushed
   *  through a wall shows a hard line where the wall cuts it */
  fit?: boolean;
}

export interface BeamHandle {
  set(s: Partial<BeamSpec>): void;
  remove(): void;
  readonly spec: Readonly<BeamSpec>;
}

const VERT = /* glsl */ `
attribute vec4 iTint;   // rgb × intensity, and a noise phase
attribute float iFloor; // the floor's height (-1e4: none)
varying float vFloor;
varying float vAxial;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vTint;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  // the unit cone: apex at the origin, opening down -Y to radius 1 at y = -1
  vAxial = -position.y;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  // normals under a non-uniform scale (a long thin cone) need the inverse-transpose, or every
  // point of the cone reads as edge-on and the silhouette never fades
  vNormalW = normalize(transpose(inverse(mat3(modelMatrix * instanceMatrix))) * normal);
  vTint = iTint;
  vFloor = iFloor;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime;
varying float vAxial;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vTint;
varying float vFloor;
#include <common>
#include <logdepthbuf_pars_fragment>
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 v = normalize(cameraPosition - vWorld);
  // the silhouette fades: light through air has no edge
  float facing = abs(dot(normalize(vNormalW), v));
  // (light through air is as bright as the length of air it crosses, which falls away
  // smoothly toward the silhouette: a steep curve here, or the cone shows its outline)
  float edge = pow(smoothstep(0.02, 0.9, facing), 2.2);
  // dies away down its length, and doesn't start as a hard ring at the fixture
  float along = pow(1.0 - clamp(vAxial, 0.0, 1.0), 2.0) * smoothstep(0.0, 0.06, vAxial);
  // dust in the air, drifting
  vec3 q = vWorld * 1.7 + vec3(0.0, uTime * 0.07, uTime * 0.05) + vTint.w;
  float dust = 0.62 + 0.38 * (0.6 * noise3(q) + 0.4 * noise3(q * 2.3));
  // close to the lens it thins out, or a beam you stand in fills the screen
  float near = smoothstep(0.3, 1.6, length(cameraPosition - vWorld));
  float floorFade = smoothstep(0.0, 0.45, vWorld.y - vFloor);
  float k = edge * along * dust * near * floorFade * 0.16;
  gl_FragColor = vec4(vTint.rgb * k, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const Yn = new THREE.Vector3(0, -1, 0);
const tq = new THREE.Quaternion();
const tm = new THREE.Matrix4();
const ts = new THREE.Vector3();

export class BeamPool {
  readonly mesh: THREE.InstancedMesh;
  private specs: (BeamSpec | null)[];
  private tint: THREE.InstancedBufferAttribute;
  private floor: THREE.InstancedBufferAttribute;
  private uTime = { value: 0 };

  constructor(readonly capacity = 32) {
    // open-ended, fine round its side so the silhouette fade is smooth
    // (ConeGeometry's apex is at +0.5: shifted down, the apex sits at the origin and the open
    // base at y = -1)
    const geo = new THREE.ConeGeometry(1, 1, 40, 1, true).translate(0, -0.5, 0);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iTint", this.tint);
    this.floor = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iFloor", this.floor);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: this.uTime },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      // ONE, ONE: three's AdditiveBlending multiplies by the source alpha, and light added to
      // the air has none
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, forceSinglePass: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.name = "fx-beams";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.specs = Array.from({ length: capacity }, () => null);
  }

  /** A beam, or null when all are in use. */
  add(s: BeamSpec): BeamHandle | null {
    const i = this.specs.indexOf(null);
    if (i < 0) return null;
    const spec: BeamSpec = { color: 0xfff1d6, intensity: 1, ...s, pos: s.pos.clone(), dir: s.dir.clone().normalize() };
    this.specs[i] = spec;
    const pool = this;
    return {
      get spec() { return spec; },
      set(p) {
        if (pool.specs[i] !== spec) return;
        if (p.pos) spec.pos.copy(p.pos);
        if (p.dir) spec.dir.copy(p.dir).normalize();
        if (p.length !== undefined) spec.length = p.length;
        if (p.angle !== undefined) spec.angle = p.angle;
        if (p.color !== undefined) spec.color = p.color;
        if (p.intensity !== undefined) spec.intensity = p.intensity;
        if (p.floorY !== undefined) spec.floorY = p.floorY;
        if (p.fit !== undefined) spec.fit = p.fit;
      },
      remove() {
        if (pool.specs[i] === spec) pool.specs[i] = null;
      },
    };
  }

  /** Write every live beam into the instance buffers. `probe` measures how far a fitted
   *  beam reaches before a surface. */
  update(now: number, probe?: (from: THREE.Vector3, dir: THREE.Vector3, far: number) => number | null): void {
    this.uTime.value = now;
    let n = 0;
    const T = this.tint.array as Float32Array;
    const c = new THREE.Color();
    for (const [i, s] of this.specs.entries()) {
      if (!s || (s.intensity ?? 1) <= 0.001) continue;
      // a fitted beam stops a hand's breadth past the surface it meets (its last part is
      // already faded to nothing, so the surface takes no hard edge)
      const hitAt = s.fit && probe ? probe(s.pos, s.dir, s.length) : null;
      const len = hitAt != null ? Math.min(s.length, hitAt + 0.15) : s.length;
      const r = Math.tan(s.angle) * len;
      tq.setFromUnitVectors(Yn, s.dir);
      tm.compose(s.pos, tq, ts.set(r, len, r));
      this.mesh.setMatrixAt(n, tm);
      c.set(s.color ?? 0xffffff);
      (this.floor.array as Float32Array)[n] = s.floorY ?? -1e4;
      T[n * 4] = c.r * (s.intensity ?? 1); T[n * 4 + 1] = c.g * (s.intensity ?? 1); T[n * 4 + 2] = c.b * (s.intensity ?? 1); T[n * 4 + 3] = i * 7.31;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.floor.needsUpdate = true;
  }

  get live(): number {
    return this.specs.filter(Boolean).length;
  }

  /** a point inside a beam's cone, for its dust (u, v, w in 0..1) */
  pointIn(h: BeamHandle, u: number, v: number, w: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = h.spec;
    const d = Math.pow(u, 0.7) * s.length * 0.85;
    const r = Math.tan(s.angle) * d * Math.sqrt(v);
    const a = w * Math.PI * 2;
    tq.setFromUnitVectors(Yn, s.dir);
    return out.set(Math.cos(a) * r, -d, Math.sin(a) * r).applyQuaternion(tq).add(s.pos);
  }

  clear(): void {
    this.specs.fill(null);
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
}
