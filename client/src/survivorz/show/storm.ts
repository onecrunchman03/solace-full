// SOLACE SURVIVORZ — THE STORM (Glenridge Hall: "stormy night, thunder, lightning, rain").
//
// Rain that falls round the camera while it is out of doors, lightning that lifts the grounds' night light and the
// fill on the bodies for a few frames, and the sound of both. Nothing here adds a light or a material after load
// (CLAUDE.md, "THE HALL NEVER COMPILES MID-GAME"): the rain is one draw whose program is built with the scene, and a
// flash is two uniforms (show/zones.ts flash, show/rig.ts flash).
//
// THE SOUND: recordings where the show's library has them (rain-out / rain-in as the room tone, thunder and
// thunder-far per stroke: scene.ts wires `recorded`); filtered noise through the app's own output otherwise.
import * as THREE from "three";
import { sfxContext, sfxOut } from "../../lib/sfx";

const DROPS = 2600;
/** the box the rain falls in, round the camera: across, high, metres */
const BOX = { w: 36, h: 16 };
/** the roof picture's height step: a room's ceiling is kept in a byte, 5 cm a count (12.75 m at most) */
const ROOF_STEP_M = 0.05;
/** lightning comes this often, seconds */
const GAP = { min: 16, max: 42 };
/** how hard a stroke lifts the grounds' flat night light, and the fill on the bodies (x their standing level) */
const LIFT = { ground: 16, fill: 4.5 };

export class Storm {
  private rain: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;
  private nextStroke: number;
  /** a stroke under way: when it began (s) and its shape */
  private stroke: { at: number; pulses: [number, number, number][] } | null = null;
  private rainGain: GainNode | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;
  private rainTone: BiquadFilterNode | null = null;
  private audioOn = false;
  private out = 0;       // how much "outdoors" the ear is, eased 0..1
  private seed = 1;

  /** UNDER A ROOF: a picture of the house from above, one texel a half metre, and in it HOW HIGH the room there
   *  goes (its ceiling, in steps of 5 cm; 0 where no room stands). It was white-or-black under one flat lid at
   *  7.4 m: no rain fell for four and a half metres over the single-storey rooms (the garage, the vestibule, the
   *  breakfast room), and it fell inside the top of the Great Hall, whose ceiling is at 9.6 (the code review's
   *  D-8). A drop
   *  over it and below the roofs is not drawn — the rain is one box round the camera, and from the lawn it used to
   *  fall inside the rooms seen through their windows (the review, Nov 13 2026). */
  static roofMask(rooms: { outdoor?: boolean; fy: number; y1: number; x0: number; x1: number; z0: number; z1: number; poly?: number[][] }[], covers: { x0: number; x1: number; z0: number; z1: number; top: number }[] = []): { tex: THREE.DataTexture; box: THREE.Vector4 } {
    const under = rooms.filter((r) => !r.outdoor && r.fy > -1);
    if (!under.length) { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return { tex: t, box: new THREE.Vector4(0, 0, 1, 1) }; }
    const x0 = Math.min(...under.map((r) => r.x0)) - 1, x1 = Math.max(...under.map((r) => r.x1)) + 1, z0 = Math.min(...under.map((r) => r.z0)) - 1, z1 = Math.max(...under.map((r) => r.z1)) + 1;
    const C = 0.5, W = Math.ceil((x1 - x0) / C), H = Math.ceil((z1 - z0) / C), px = new Uint8Array(W * H * 4);
    const inPoly = (p: number[][], x: number, z: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    for (const r of under) {
      const i0 = Math.max(0, Math.floor((r.x0 - x0) / C)), i1 = Math.min(W - 1, Math.floor((r.x1 - x0) / C)), j0 = Math.max(0, Math.floor((r.z0 - z0) / C)), j1 = Math.min(H - 1, Math.floor((r.z1 - z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C;
        // (the highest room over this spot: an upper room stands on a ground-floor one)
        if (!r.poly || inPoly(r.poly, x, z)) px[(j * W + i) * 4] = Math.max(px[(j * W + i) * 4], Math.min(255, Math.max(1, Math.ceil(r.y1 / ROOF_STEP_M))));
      }
    }
    // (a roof that is no room's: the porte-cochere)
    for (const c of covers) {
      const i0 = Math.max(0, Math.floor((c.x0 - x0) / C)), i1 = Math.min(W - 1, Math.floor((c.x1 - x0) / C)), j0 = Math.max(0, Math.floor((c.z0 - z0) / C)), j1 = Math.min(H - 1, Math.floor((c.z1 - z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) px[(j * W + i) * 4] = Math.max(px[(j * W + i) * 4], Math.min(255, Math.max(1, Math.ceil(c.top / ROOF_STEP_M))));
    }
    for (let k = 3; k < px.length; k += 4) px[k] = 255;
    const tex = new THREE.DataTexture(px, W, H);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
    return { tex, box: new THREE.Vector4(x0, z0, W * C, H * C) };
  }
  private roofTex: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, roof?: { tex: THREE.DataTexture; box: THREE.Vector4 }) {
    const mask = roof ?? Storm.roofMask([]);
    this.roofTex = mask.tex;
    // each drop: a short streak; where it is comes from its own offset and the clock, wrapped in the box (in the
    // vertex shader: nothing is written from the frame loop but two uniforms)
    const pos = new Float32Array(DROPS * 6), end = new Float32Array(DROPS * 2);
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < DROPS; i++) {
      const x = rnd() * BOX.w, y = rnd() * BOX.h, z = rnd() * BOX.w;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2] = 0; end[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("end", new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uLevel: { value: 0 }, uFlash: { value: 0 }, uRoof: { value: mask.tex }, uRoofBox: { value: mask.box } },
      vertexShader: `
        attribute float end; uniform float uTime; uniform vec3 uCam; uniform sampler2D uRoof; uniform vec4 uRoofBox; varying float vA;
        void main() {
          vec3 p = position;
          float speed = 11.0 + fract(p.x * 7.13 + p.z * 3.7) * 5.0;
          p.y = mod(p.y - uTime * speed, ${BOX.h.toFixed(1)});
          // a slant, and a streak a third of a metre long
          p.x += (p.y) * 0.12;
          vec3 c = vec3(uCam.x - ${(BOX.w / 2).toFixed(1)}, uCam.y - 4.0, uCam.z - ${(BOX.w / 2).toFixed(1)});
          vec3 w = vec3(mod(p.x - c.x, ${BOX.w.toFixed(1)}) + c.x, p.y + c.y, mod(p.z - c.z, ${BOX.w.toFixed(1)}) + c.z);
          w.y += end * 0.34; w.x += end * 0.04;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vA = (1.0 - smoothstep(10.0, 18.0, -mv.z)) * (0.35 + end * 0.65);
          // (under a roof: not drawn)
          vec2 ru = (w.xz - uRoofBox.xy) / uRoofBox.zw;
          if (ru.x > 0.0 && ru.x < 1.0 && ru.y > 0.0 && ru.y < 1.0 && w.y < texture2D(uRoof, ru).r * ${(255 * ROOF_STEP_M).toFixed(2)}) vA = 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uLevel; uniform float uFlash; varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.55, 0.62, 0.78) * (0.5 + uFlash * 2.2), vA * uLevel * (0.2 + uFlash * 0.5)); }`,
    });
    this.rain = new THREE.LineSegments(geo, this.mat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.rain.name = "rain";
    scene.add(this.rain);
    this.nextStroke = 6 + Math.random() * 10;
  }

  /** THE REAL RECORDINGS (the show's sound engine has rain and thunder: scene.ts): the scene plays them, and the
   *  noise below stays silent. `thunder(delayS, level)` is called for each stroke. */
  recorded: ((delayS: number, level: number) => void) | null = null;
  /** the show's sound is on (the scene says so when its sound engine starts): until then the storm is silent — a
   *  page whose other sound happens to be running must not hear rain the viewer never turned on */
  audible = false;
  private lastCam = new THREE.Vector3(NaN, 0, 0);

  /** Every frame. `outdoors`: the camera is out in the grounds. `now` in seconds. Returns the flash, 0..1. */
  update(dt: number, now: number, cam: THREE.Vector3, outdoors: boolean, flash: (ground: number, fill: number) => void): number {
    // (a CUT — the camera somewhere else this frame — is in or out at once: easing it rained in a room for a
    // second after every cut indoors. Walking through a door still eases.)
    const cut = !(this.lastCam.distanceToSquared(cam) < 9);
    this.lastCam.copy(cam);
    if (cut) this.out = outdoors ? 1 : 0;
    else this.out += ((outdoors ? 1 : 0) - this.out) * Math.min(1, dt * 3);
    const u = this.mat.uniforms;
    u.uTime.value = now; (u.uCam.value as THREE.Vector3).copy(cam); u.uLevel.value = this.out;
    this.rain.visible = this.out > 0.02;
    // lightning: two or three pulses inside half a second
    if (!this.stroke && now >= this.nextStroke) {
      const n = 2 + ((this.seed = (this.seed * 1103515245 + 12345) >>> 0) % 2);
      const pulses: [number, number, number][] = [];
      let t = 0;
      for (let i = 0; i < n; i++) { const len = 0.05 + Math.random() * 0.09; pulses.push([t, t + len, 0.45 + Math.random() * 0.55]); t += len + 0.04 + Math.random() * 0.16; }
      this.stroke = { at: now, pulses };
      this.nextStroke = now + GAP.min + Math.random() * (GAP.max - GAP.min);
      const delay = 0.5 + Math.random() * 2.2, level = pulses.reduce((a, p) => Math.max(a, p[2]), 0);
      if (this.recorded) this.recorded(delay, level); else this.thunder(delay, level);
    }
    let k = 0;
    if (this.stroke) {
      const t = now - this.stroke.at;
      for (const [a, b, lvl] of this.stroke.pulses) if (t >= a && t < b + 0.12) k = Math.max(k, t < b ? lvl : lvl * (1 - (t - b) / 0.12));
      if (t > this.stroke.pulses[this.stroke.pulses.length - 1][1] + 0.15) this.stroke = null;
    }
    u.uFlash.value = k;
    flash(1 + k * (LIFT.ground - 1), 1 + k * (LIFT.fill - 1));
    this.audio(now);
    return k;
  }

  // ---- the sound ----

  private noise(ctx: AudioContext, secs: number): AudioBuffer {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** the rain's bed: started the first time the app's sound is running, then steered on change */
  private lastOut = -1;
  private audio(_now: number): void {
    if (!this.audible) return;
    const ctx = sfxContext();
    if (!ctx || ctx.state !== "running") return;
    // (the recorded rain is the sound engine's room tone: this noise is only for a page with no recordings)
    if (this.recorded) {
      if (this.audioOn && this.rainGain && this.lastOut !== -2) { this.rainGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5); this.lastOut = -2; }
      return;
    }
    if (!this.audioOn) {
      const out = sfxOut() ?? ctx.destination;
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx, 4); src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
      this.rainTone = ctx.createBiquadFilter(); this.rainTone.type = "lowpass"; this.rainTone.frequency.value = 900;
      this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
      src.connect(hp).connect(this.rainTone).connect(this.rainGain).connect(out);
      src.start();
      this.rainSrc = src;
      this.audioOn = true;
    }
    // (on change only: CLAUDE.md, audio automation is never per frame) indoors it is the rain on the roof and glass
    const q = Math.round(this.out * 10) / 10;
    if (q === this.lastOut || !this.rainGain || !this.rainTone) return;
    this.lastOut = q;
    const t = ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(0.035 + q * 0.11, t, 0.4);
    this.rainTone.frequency.setTargetAtTime(900 + q * 6500, t, 0.4);
  }

  private thunder(delay: number, level: number): void {
    if (!this.audible) return;
    const ctx = sfxContext();
    if (!ctx || ctx.state !== "running") return;
    const out = sfxOut() ?? ctx.destination, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, 5);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = ctx.createGain();
    const peak = (0.22 + level * 0.3) * (0.55 + this.out * 0.45);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.06);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + 4.6);
    src.connect(lp).connect(g).connect(out);
    src.start(t); src.stop(t + 5);
  }

  dispose(): void {
    this.rain.removeFromParent();
    this.rain.geometry.dispose(); this.mat.dispose(); this.roofTex?.dispose();
    if (this.rainSrc) { try { this.rainSrc.stop(); } catch { /* never started */ } }
    if (this.rainGain) { try { this.rainGain.disconnect(); } catch { /* already gone */ } }
    this.rainSrc = null;
    this.rainGain = null; this.rainTone = null; this.audioOn = false;
  }
}
