// LIGHTS OUT's set pieces in the game (Level 6) — BACKROOMS.md → "LEVEL 6 —
// LIGHTS OUT". The server's LightsState is the whole truth about where they
// stand; this file only draws them and answers "am I near one?":
//
//  · THE SEA HATCH (assets/lights/seahatch.glb), a watertight steel door with
//    no wheel on its hub, the
//    way on. It is UNMARKED from afar — you find it by the sea behind it — so
//    its name only shows once you are standing at it.
//  · THE LISTENER, on the server's positions: the gaunt pale creature
//    (assets/lights/listener/), playing a clip per server mode — it walks,
//    crawls when it searches, crouches still to listen, runs at a lunge, and
//    reaches out for the touch. It is only ever seen in a torch beam.
//
// Everything the scene adds is passed in by the game (its labels, ground pins,
// kit loader), so this file holds no copy of those rules.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CELL } from "./world";
import type { LightsState } from "./gamenet";
import { WallSeats, type WallFace } from "./wallseat";

export interface LightsDeps {
  scene: THREE.Scene;
  makeLabel: (text: string, tint: string) => THREE.Sprite;
  pinToGround: (o: THREE.Object3D, x: number, y: number, off: number) => unknown;
  reap: (o: THREE.Object3D | null | undefined) => void;
  /** A prop-kit model by file name, cloned (the game's loader). */
  withKit: (name: string, cb: (m: THREE.Object3D) => void) => void;
  /** Seat a kit model's back on the group's origin; its size. */
  backToWall: (m: THREE.Object3D) => THREE.Vector3;
  groundAt: (x: number, y: number) => number;
  /** Compile a streamed model's shaders off-thread (the game's warm hook). */
  warm?: (o: THREE.Object3D) => void;
  /** Where a wall's face is (wallseat.ts). */
  wallFace: WallFace;
}

/** Wall side → the cell step toward that wall, and the yaw that turns a model
 *  built facing +z (back on z=0) to stand against it. */
const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const DOOR_RED = "#ff4b4b";

/** How near (cells) counts as "at" the hatch — mirrors the server's reach. */
export const HATCH_REACH = 2.4;
/** The hatch's name shows only this close: it is found by ear, not by sign. */
const HATCH_LABEL_NEAR = 3.2;
/** A Listener with no frame for this long is not near you any more. */
const LISTENER_STALE_MS = 2500;

interface Body {
  id: number;
  group: THREE.Group;
  tx: number;
  ty: number;
  mode: string;
  seenAt: number;
  /** The drawn position (cells), eased toward the server's. */
  x: number;
  y: number;
  yaw: number;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  clip: string;
  /** A one-off clip (the touch) holds the body until this time. */
  onceUntil: number;
  /** Its drawn ground speed (m/s), smoothed — what the stride is matched to. */
  v: number;
}

/** THE LISTENER's model: "Nightmare Creature 1#" by Mr.Prizz (Sketchfab, CC BY
 *  4.0 — credits beside the file). MEASURED in its own clips: feet on the
 *  origin, facing +z, 2.29m standing in `walk`, 1.28m crouched in `idle`, so
 *  it needs no rescale. Loaded once; every body is a SkeletonUtils clone. */
const LISTENER_URL = "/assets/lights/listener/listener.glb";
/** The server's mode → the clip it plays (and how fast).
 *
 *  THE FEET MATCH THE GROUND (Nov 2026 polish round — the audit's L6-03): the
 *  rates were never taken from the clips, so the wander slid ~2× and the
 *  search (the crawl, at 1.1) 4-7×. MEASURED in listener.glb at rate 1 (the
 *  planted foot's backward speed along the model's +z, scratchpad stride
 *  probe): walk 0.85 m/s, crawl ~0.55 (hands 0.64, feet 0.40-0.49), Run ~4.8.
 *  The server moves it at 1.8 (wander), 2.4 (search) and 6.0 m/s (lunge), so
 *  a moving clip's rate is set each frame from the drawn speed ÷ `stride`
 *  (`lo`..`hi` clamp). The crawl can't cover 2.4 m/s without scuttling like
 *  an insect at 4×, so the search walks too — fast, hunched, on its toes. */
const MODE_CLIP: Record<string, { clip: string; rate: number; stride?: number; lo?: number; hi?: number }> = {
  wander: { clip: "walk", rate: 2.1, stride: 0.85, lo: 0.45, hi: 2.6 },
  search: { clip: "walk", rate: 2.8, stride: 0.85, lo: 0.45, hi: 3.0 },
  lunge: { clip: "Run", rate: 1.25, stride: 4.8, lo: 0.6, hi: 1.4 },
  still: { clip: "crawl_idol", rate: 1 },
  listen: { clip: "idle", rate: 0.8 },
};
/** The sea hatch, built for the scene by scripts/assets/seahatch.mjs. */
const HATCH_URL = "/assets/lights/seahatch.glb";
const HATCH_HEIGHT = 1.9;
let hatchModel: Promise<GLTF | null> | null = null;
const loadHatch = (warm?: (o: THREE.Object3D) => void): Promise<GLTF | null> =>
  (hatchModel ??= new GLTFLoader()
    .loadAsync(HATCH_URL)
    .then((g) => {
      warm?.(g.scene);
      return g;
    })
    .catch(() => null));
/** THE SEA HATCH as the other side of it sees it — Level 7's way back up
 *  (Nov 2026 polish round — the audit's L7-07: the same hatch on both sides,
 *  law 5). The model swung open on its hinge, with the dark of the shaft
 *  inside the frame; its back on z = 0, facing +z. null if it won't load. */
export const openSeaHatch = (warm?: (o: THREE.Object3D) => void): Promise<THREE.Object3D | null> =>
  loadHatch(warm).then((g) => {
    if (!g) return null;
    const m = g.scene.clone(true);
    const leaf = m.getObjectByName("leaf");
    if (leaf) {
      const pivot = new THREE.Group();
      pivot.position.copy(leaf.position);
      leaf.position.set(0, 0, 0);
      pivot.add(leaf);
      pivot.rotation.y = -1.35;
      m.add(pivot);
    }
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.75), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    dark.position.set(0, 0.07 + 1.75 / 2, 0.012);
    m.add(dark);
    return m;
  });
let listenerModel: Promise<GLTF | null> | null = null;
const loadListener = (warm?: (o: THREE.Object3D) => void): Promise<GLTF | null> =>
  (listenerModel ??= new GLTFLoader()
    .loadAsync(LISTENER_URL)
    .then((g) => {
      g.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.frustumCulled = false;
          mesh.castShadow = true;
        }
      });
      warm?.(g.scene);
      return g;
    })
    .catch(() => null));

export class LightsScene {
  private d: LightsDeps;
  private hatch: { x: number; y: number; side: number; open: boolean; group: THREE.Group; label: THREE.Sprite | null } | null = null;
  private bodies = new Map<number, Body>();

  private seats: WallSeats;

  constructor(d: LightsDeps) {
    this.d = d;
    this.seats = new WallSeats(d.wallFace);
  }

  /** Dress Lights Out from the server's state (welcome and travel). */
  apply(st: LightsState | undefined): void {
    this.clear();
    if (!st) return;
    if (st.hatch) this.setHatch(st.hatch);
  }

  clear(): void {
    if (this.hatch) {
      this.d.reap(this.hatch.group);
      this.d.reap(this.hatch.label);
      this.hatch = null;
    }
    for (const b of this.bodies.values()) {
      b.mixer?.stopAllAction();
      this.d.reap(b.group);
    }
    this.bodies.clear();
  }

  /** The sea hatch from the server (welcome, or streamed near it). Returns
   *  true the moment it is seen to swing open. */
  setHatch(h: { x: number; y: number; side: number; open: boolean }): boolean {
    if (this.hatch && this.hatch.x === h.x && this.hatch.y === h.y) {
      if (this.hatch.open === h.open) return false;
      this.hatch.open = h.open;
      const pivot = this.hatch.group.getObjectByName("hatch-pivot");
      if (pivot && h.open) pivot.rotation.y = -1.35;
      const wheel = this.hatch.group.getObjectByName("hatch-wheel");
      if (wheel) wheel.visible = h.open;
      this.relabel(true);
      return h.open;
    }
    if (this.hatch) {
      this.d.reap(this.hatch.group);
      this.d.reap(this.hatch.label);
    }
    const group = this.onWall(h.x, h.y, h.side);
    // the sea hatch (scripts/assets/seahatch.mjs): a "frame" and a "leaf"
    // whose origin is its hinge, front +z, back on the wall
    void loadHatch(this.d.warm).then((g) => {
      if (!g || this.hatch?.group !== group) return;
      const m = g.scene.clone(true);
      const leaf = m.getObjectByName("leaf");
      if (!leaf) return;
      const pivot = new THREE.Group();
      pivot.name = "hatch-pivot";
      pivot.position.copy(leaf.position);
      leaf.position.set(0, 0, 0);
      pivot.add(leaf);
      m.add(pivot);
      // the hub the Handwheel fits, on the leaf's face below the porthole
      const lb = new THREE.Box3().setFromObject(leaf);
      const steel = new THREE.MeshStandardMaterial({ color: 0x2c3133, roughness: 0.5, metalness: 0 });
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), steel);
      hub.rotation.x = Math.PI / 2;
      hub.position.set((lb.min.x + lb.max.x) / 2, HATCH_HEIGHT * 0.36, lb.max.z + 0.03);
      pivot.add(hub);
      this.d.withKit("valve-wheel", (w) => {
        w.name = "hatch-wheel";
        w.position.copy(hub.position).add(new THREE.Vector3(0, 0, 0.05));
        w.rotation.x = Math.PI / 2;
        w.visible = !!this.hatch?.open;
        pivot.add(w);
      });
      if (this.hatch?.open) pivot.rotation.y = -1.35;
      group.add(m);
    });
    this.hatch = { ...h, group, label: null };
    return false;
  }

  hatchState(): { x: number; y: number; open: boolean } | null {
    return this.hatch ? { x: this.hatch.x, y: this.hatch.y, open: this.hatch.open } : null;
  }
  nearHatch(px: number, py: number): boolean {
    return !!this.hatch && Math.hypot(this.hatch.x - px, this.hatch.y - py) < HATCH_REACH;
  }

  /** A Listener's position from the server. */
  listenerPos(id: number, x: number, y: number, mode: string): void {
    let b = this.bodies.get(id);
    const now = performance.now();
    if (!b) {
      const group = new THREE.Group();
      group.name = "listener";
      this.d.scene.add(group);
      const body: Body = { id, group, tx: x, ty: y, mode, seenAt: now, x, y, yaw: 0, mixer: null, actions: {}, clip: "", onceUntil: 0, v: 0 };
      b = body;
      this.bodies.set(id, body);
      void loadListener(this.d.warm).then((g) => {
        if (!g || this.bodies.get(id) !== body) return;
        const model = cloneSkeleton(g.scene);
        body.group.add(model);
        body.mixer = new THREE.AnimationMixer(model);
        for (const clip of g.animations) body.actions[clip.name.split("|").pop() ?? clip.name] = body.mixer.clipAction(clip);
        this.play(body, body.mode);
      });
    } else if (now - b.seenAt > LISTENER_STALE_MS) {
      // back in range: start it where it is
      b.x = x;
      b.y = y;
    }
    b.tx = x;
    b.ty = y;
    if (b.mode !== mode) {
      b.mode = mode;
      this.play(b, mode);
    }
    b.seenAt = now;
  }
  /** The touch: it reaches out once, then back to whatever its mode is. */
  touched(id: number): void {
    const b = this.bodies.get(id);
    const a = b?.actions.attack_2;
    if (!b || !a) return;
    this.fadeTo(b, "attack_2", 1, true);
    b.onceUntil = performance.now() + (a.getClip().duration * 1000) / 1;
  }
  /** THE KILLING TOUCH (Nov 2026 polish round — the audit's L6-05): the
   *  second touch used to show the Listener doing nothing while its victim
   *  dropped. It bites, once, where the victim stood. */
  struck(id: number, x: number, y: number): void {
    const b = this.bodies.get(id);
    if (!b) return;
    const name = b.actions.bite ? "bite" : "attack_2";
    const a = b.actions[name];
    if (!a) return;
    const dx = x - b.x;
    const dy = y - b.y;
    if (Math.hypot(dx, dy) > 0.05) b.yaw = Math.atan2(dx, dy);
    this.fadeTo(b, name, 1, true);
    b.onceUntil = performance.now() + a.getClip().duration * 1000;
  }
  listenerGone(id: number): void {
    const b = this.bodies.get(id);
    if (!b) return;
    b.mixer?.stopAllAction();
    this.d.reap(b.group);
    this.bodies.delete(id);
  }
  /** The nearest Listener you have frames for (cells), or null. */
  nearestListener(px: number, py: number): { d: number; x: number; y: number; mode: string } | null {
    let best: { d: number; x: number; y: number; mode: string } | null = null;
    const now = performance.now();
    for (const b of this.bodies.values()) {
      if (now - b.seenAt > LISTENER_STALE_MS) continue;
      const d = Math.hypot(b.x - px, b.y - py);
      if (!best || d < best.d) best = { d, x: b.x, y: b.y, mode: b.mode };
    }
    return best;
  }

  /** Per frame: the bodies eased onto the server's positions, facing where
   *  they go; the hatch's name only once you stand at it. */
  tick(now: number, dt: number, px: number, py: number): void {
    const k = 1 - Math.exp(-8 * dt);
    for (const b of this.bodies.values()) {
      const stale = now - b.seenAt > LISTENER_STALE_MS;
      b.group.visible = !stale;
      if (stale) continue;
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      // a one-off (the touch, the bite) keeps facing what it reached for
      if (Math.hypot(dx, dy) > 0.02 && !b.onceUntil) b.yaw = Math.atan2(dx, dy);
      b.x += dx * k;
      b.y += dy * k;
      this.d.pinToGround(b.group, b.x, b.y, 0);
      b.group.rotation.y = b.yaw;
      if (b.onceUntil && now >= b.onceUntil) {
        b.onceUntil = 0;
        this.play(b, b.mode);
      }
      // the stride follows the drawn speed (see MODE_CLIP)
      if (dt > 0) {
        const v = (Math.hypot(dx, dy) * k * CELL) / dt;
        b.v += (v - b.v) * (1 - Math.exp(-6 * dt));
        const want = MODE_CLIP[b.mode];
        const act = b.actions[b.clip];
        if (want?.stride && act && b.clip === want.clip && !b.onceUntil) {
          act.timeScale = Math.min(want.hi ?? 3, Math.max(want.lo ?? 0.3, b.v / want.stride));
        }
      }
      b.mixer?.update(dt);
    }
    if (this.hatch) this.relabel(Math.hypot(this.hatch.x - px, this.hatch.y - py) <= HATCH_LABEL_NEAR);
    this.seats.tick();
  }

  /** For the review hook: what the scene thinks it is drawing. */
  debug(): { hatch: unknown; listeners: { id: number; x: number; y: number; mode: string; visible: boolean; clip: string; rate: number; v: number }[] } {
    return {
      hatch: this.hatch ? { x: this.hatch.x, y: this.hatch.y, open: this.hatch.open, labelled: !!this.hatch.label } : null,
      listeners: [...this.bodies.values()].map((b) => ({ id: b.id, x: +b.x.toFixed(2), y: +b.y.toFixed(2), mode: b.mode, visible: b.group.visible, clip: b.clip, rate: +(b.actions[b.clip]?.timeScale ?? 0).toFixed(2), v: +b.v.toFixed(2) })),
    };
  }

  // ---- internals ------------------------------------------------------------
  /** The mode's clip, unless a one-off (the touch) is still playing. */
  private play(b: Body, mode: string): void {
    if (b.onceUntil > performance.now()) return;
    const want = MODE_CLIP[mode] ?? MODE_CLIP.wander;
    this.fadeTo(b, want.clip, want.rate, false);
  }
  private fadeTo(b: Body, name: string, rate: number, once: boolean): void {
    const next = b.actions[name];
    if (!next) return;
    if (b.clip === name && !once) {
      next.timeScale = rate;
      return;
    }
    const prev = b.actions[b.clip];
    if (prev && prev !== next) prev.fadeOut(0.2);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = rate;
    next.setEffectiveWeight(1);
    next.fadeIn(0.2);
    next.play();
    b.clip = name;
  }

  /** A group standing against the wall on `side` of the cell at (x, y). */
  private onWall(x: number, y: number, side: number): THREE.Group {
    const g = new THREE.Group();
    g.rotation.y = SIDE_ROT[side] ?? 0;
    // On the wall's real face, 1 cm proud: at a fixed 0.06 in from the edge
    // the hatch's back sat 9 cm inside a thin wall (Nov 2026 polish round —
    // wallseat.ts has why one inset can't be right).
    this.d.pinToGround(g, x, y, 0);
    this.seats.seat(g, x, y, side);
    this.d.scene.add(g);
    return g;
  }

  /** The hatch's name, shown only while you stand at it (`show`). */
  private relabel(show: boolean): void {
    const h = this.hatch;
    if (!h) return;
    if (!show) {
      if (h.label) {
        this.d.reap(h.label);
        h.label = null;
      }
      return;
    }
    const text = h.open ? "THE SEA HATCH · OPEN" : "THE SEA HATCH · NO WHEEL";
    if (h.label && h.label.name === text) return;
    this.d.reap(h.label);
    h.label = this.d.makeLabel(text, DOOR_RED);
    h.label.name = text;
    this.d.pinToGround(h.label, h.x, h.y, 2.6);
    this.d.scene.add(h.label);
  }
}
