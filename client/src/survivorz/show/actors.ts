// SOLACE SURVIVORZ — THE SHOW: THE CHARACTER CONTROLLER. One body per BodyState on the wire.
//
// THE SERVER DECIDES, THE SCREEN ONLY DRAWS (wire.ts): a body's place, heading and POSE come
// from the frames; this file only turns them into a moving person —
//   · each body FILE is loaded once and cloned per actor (SkeletonUtils: geometry, materials
//     and every AnimationClip are shared; the survivors' look layer and a zombie's cut copies
//     are their own, made by the effects);
//   · positions are INTERPOLATED between the 10 Hz ticks (a short delay buffer), the heading
//     eased, so a body glides instead of stepping ten times a second;
//   · a clip is picked by stance.ts (pose × what's in the hands × CALM or READY × hurt × the body's
//     real speed — pure, and walked over every body headless by anim-show-check.mjs), crossfaded, and
//     LOCOMOTION IS SPEED-MATCHED — each loop's own ground speed is MEASURED off its planted foot when
//     the body loads, and the clip plays at real speed ÷ that, so feet don't skate;
//   · the one-shots (a swing, a shot, a flinch, a fall, a death, getting up) come from the events
//     and from the pose changing;
//   · a held prop or gun rides the right hand by the measured grip (props.json `grip`, the
//     guns' cal.json seat); what they own and aren't holding is STOWED on them (a holstered
//     pistol, a knife through the belt, a crowbar across the back or strapped to the pack), and a
//     worn backpack rides the chest frame by its measured fit (kit.ts, kit-fit.json); the effects
//     draw the torches, wounds and zombie looks.
//
// THE ANIMATION LAWS (SURVIVORZ.md §10) are why the tables are short and careful: every clip in them
// is one the bake's law check passes on all seven bodies (anim/<body>/clip.json; the few that fail on
// one body are never picked there), and a held thing is only shown on a clip whose hand was built to
// hold it — a crowbar never floats in a walk's open hand; it goes back on the belt or the back for the
// walk (GAPS: there is no walk-with-melee bake yet).
import * as THREE from "three";
import { tameBodyMaterial } from "./bodymat";
import { showGeo } from "./direct";
import { armIK } from "../../lib/ik";
import { hashId, feedPlaces } from "../../../../src/survivorz/sim/lie";
import LOOP_SPEED from "./loopspeed.json";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetUrl, loadGlb } from "../assets";
import { tameGlbTransparency } from "../../lib/three-hygiene";
import { SITES, type Cuttable, type BodyLook, type FxSystem, type GunId, type Site } from "../fx";
import type { BodyState, TickBody } from "../../../../src/survivorz/sim/wire";
import { assetJson } from "./fxload";
import { addPairs } from "./pairs";
import { releaseGeometry, releaseTexture } from "./release";
import { LoadCache, retryWait } from "./retry";
import { within } from "../assetcache";
import { corpsesOverBudget } from "../fx/budget";
import {
  armedOf, holdRadius, heldShown, lawful, survivorLoop, zombieLoop, zombieKey, oneShotName, oneShotStart, keepClip, GUNS, fidget, FIDGET_OVER, survivorArms, zombieArms, LOOP_PARTS, hash2,
  LYING, BAND, RATE_CLAMP, Z_MOVING, CRAWL, CLIP_PROPS, UPPER_ONLY, SLOW_IN, CALM_LOOPS, type OneShot, type ClipProp,
} from "./stance";
import { addKitFit, packMatrix, packMatrixFits, packOff, packPush, setKitFit, stowMatrix, stowSlot, trimIndex, type KitFit, type PackId } from "./kit";
import KIT_FIT from "./kit-fit.json";
import { footStep, newFoot, FOOT_SURVIVOR, FOOT_ZOMBIE, type FootState } from "./footfall";

export type { Armed, OneShot } from "./stance";
setKitFit(KIT_FIT as unknown as KitFit);

/** the sim's melee names → the prop on the wire (src/survivorz/sim/world.ts meleeHeld) */
const MELEE_PROP: Record<string, string> = { knife: "chef-knife", pipe: "lead-pipe", hammer: "claw-hammer", crowbar: "crowbar", axe: "fire-axe-a" };
/** the sim's guns → the gun file (tables.ts GUNS) */
const GUN_PROP: Record<string, string> = { pistol: "pistol", rifle: "hk416" };
/** the loops a body lies on the floor in (no standing one-shot is laid over them) */
const LYING_CLIPS = new Set<string>(["mx-laying-breathless", "mx-laying-sleeping", CRAWL]);

// ---- what's in the hands -------------------------------------------------------------------------

interface Grip { how: "handle" | "middle"; at: [number, number, number]; axis: [number, number, number] }
interface GunHold { support: number[]; butt: number[]; muzzle: number[]; gripLean?: number; supportGrip?: unknown }
interface GripCal { f: number; p: number; u: number; r?: number }
interface GunCal { z: number[]; y: number[]; pistol?: { z: number[]; y: number[] } | null; seats?: Record<string, number[]>; grip?: { l?: GripCal; r?: GripCal } }
/** WHERE A HELD THING SITS IN A HAND (anim-recipes.js handRigid hold; Nov 15 2026): in the hand's GRIP CHANNEL — in
 *  front of the palm's skin by the thing's own radius, under the middle finger at the knuckles' crease — measured per
 *  body and hand off the skin (cal.json `grip`). The bake closes the fingers round a handle THERE; drawn at one fixed
 *  point for every body (7 cm along the fingers, 2.2 cm off the bone), an axe, a torch or a can sat 1-4 cm off the
 *  fingers that held it. o the wrist, f the fingers, p the palm's way, u the thumb side; no measure = the old point */
function holdPoint(out: THREE.Vector3, o: THREE.Vector3, f: THREE.Vector3, p: THREE.Vector3, u: THREE.Vector3, g: GripCal | undefined, r: number): THREE.Vector3 {
  if (g && Number.isFinite(g.f) && Number.isFinite(g.p) && Number.isFinite(g.u) && g.f > 0.03 && g.f < 0.2 && Math.abs(g.p) < 0.06 && Math.abs(g.u) < 0.05)
    return out.copy(o).addScaledVector(f, g.f).addScaledVector(p, g.p + r).addScaledVector(u, g.u);
  return out.copy(o).addScaledVector(f, 0.07).addScaledVector(p, 0.022);
}

// ---- shared per body file ------------------------------------------------------------------------

interface BodySrc {
  /** the body file's id (eric, zombie-m01…): the measured loop speeds are by body */
  body: string;
  /** the body's scene (never drawn: cloned per actor) */
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  /** each locomotion clip's own ground speed, m/s (measured off the planted foot); NaN = in place */
  speed: Map<string, number>;
  scratch: THREE.Object3D;
  feet: [THREE.Object3D, THREE.Object3D] | null;
  /** the balls of the feet (survivors' ball_l/r, the dead's toes_01.l/r) — the speed estimator's second point */
  balls: [THREE.Object3D, THREE.Object3D] | null;
  hands: [THREE.Object3D, THREE.Object3D] | null;
  mixer: THREE.AnimationMixer;
}

/** the creator's bodies' loop speeds (the bake's "speeds" step, served as body/loopspeed.json) */
const BAKED_SPEED: Record<string, Record<string, number>> = {};
export function setLoopSpeeds(all: Record<string, Record<string, number>>): void { for (const [c, by] of Object.entries(all ?? {})) BAKED_SPEED[c] = { ...BAKED_SPEED[c], ...by }; }
/** THE SPEED A LOOP MOVES AT: the loops play in place, so the ground speed that keeps a foot still on the
 *  floor is how fast its PLANTED foot slides back under the body — the heel or the ball, each while on its own
 *  floor (a crawl's planted HAND). The median of those samples. (Oct 28 2026: the old
 *  read — the lower foot at any height — took a run's flight as stance and read UAL's sprint at 1.9 m/s,
 *  slower than its jog, so a sprinting body's feet ran on a treadmill under it; and it read the
 *  Halloween walks, which barely step, as walks.) anim-show-check.mjs runs this same estimator. */
function measureSpeed(src: BodySrc, name: string): number {
  const cached = src.speed.get(name);
  if (cached !== undefined) return cached;
  // MEASURED ON THE FLOOR FIRST (loopspeed.json, scripts/survivorz/calib-loops.mjs: the speed that leaves the
  // planted foot stillest, found per body); the estimate below for anything it hasn't measured
  // (the hand-made bodies' ship in the client; a creator body's come from its bake, through the server — setLoopSpeeds)
  const known = (LOOP_SPEED as Record<string, Record<string, number>>)[name]?.[src.body] ?? BAKED_SPEED[name]?.[src.body];
  if (known) { src.speed.set(name, known); return known; }
  const clip = src.clips.get(name);
  const crawl = /crawl/.test(name);
  // THE HEEL OR THE BALL, WHICHEVER IS DOWN (realism round 7, Nov 2026): the ankle alone was read as planted
  // within 4 cm of its lowest — but in the second half of a step the ankle lifts and rolls forward over the
  // planted toes, so it read a walk 6% slow, the injured run 30% slow and UAL's sprint on two bodies at 3.4 m/s
  // where its planted foot moves at 9 (the feet skated under every one of them, measured live). Each part of
  // the foot now counts only while it is on its own floor (within 1.5 cm of its lowest); a crawl, its hands.
  const pts = crawl ? (src.hands ? [src.hands] : []) : [src.feet, src.balls].filter((x): x is [THREE.Object3D, THREE.Object3D] => !!x);
  if (!clip || !pts.length) { src.speed.set(name, NaN); return NaN; }
  const a = src.mixer.clipAction(clip);
  a.reset().play();
  const N = 160, dt = clip.duration / N;
  const P: THREE.Vector3[][][] = pts.map(() => [[], []]);
  for (let i = 0; i <= N; i++) {
    a.time = i * dt;
    src.mixer.update(0);
    src.scratch.updateMatrixWorld(true);
    pts.forEach((pair, j) => { for (const k of [0, 1]) P[j][k].push(pair[k].getWorldPosition(new THREE.Vector3())); });
  }
  a.stop();
  // (the ball's own reading when it has enough planted samples — the toes are what's down for most of a run's
  // stance; the heel's otherwise, the old way: the lower foot within 4 cm of its lowest)
  const read = (Q: THREE.Vector3[][], tol: number, lower: boolean): number[] => {
    const lo = Q.map((s) => Math.min(...s.map((p) => p.y)));
    const vs: number[] = [];
    for (let i = 1; i <= N; i++) for (const k of [0, 1]) {
      if ((lower && Q[k][i].y > Q[1 - k][i].y) || Q[k][i].y > lo[k] + tol || Q[k][i - 1].y > lo[k] + tol) continue;
      vs.push((Math.hypot(Q[k][i].x - Q[k][i - 1].x, Q[k][i].z - Q[k][i - 1].z) / dt) * Math.sign(Q[k][i - 1].z - Q[k][i].z || 1));
    }
    return vs.sort((x, y) => x - y);
  };
  const ball = !crawl && P.length > 1 ? read(P[1], 0.015, false) : [];
  const vs = ball.length >= 10 ? ball : read(P[0], 0.04, true);
  const v = vs.length >= 6 ? vs[vs.length >> 1] : NaN;
  src.speed.set(name, v);
  return v;
}

/** WHEN A CLIP STRIKES (Nov 12 2026 — Josh: "desynced sounds… make sure that's done for all sounds that correspond
 *  to an action"): the moment the faster hand is at its fastest — a swing's contact, a jab's reach, a zombie's
 *  swipe — in seconds from the clip's start. Sampled once per body and clip, like the loops' speeds. The sim says
 *  when a blow lands; the clip is started (or held back) so this moment is that one. NaN = no hands, no clip. */
const STRIKES = new WeakMap<BodySrc, Map<string, number>>();
function clipStrike(src: BodySrc, name: string): number {
  let m = STRIKES.get(src);
  if (!m) STRIKES.set(src, (m = new Map()));
  const cached = m.get(name);
  if (cached !== undefined) return cached;
  const clip = src.clips.get(name);
  let out = NaN;
  if (clip && src.hands) {
    const a = src.mixer.clipAction(clip);
    a.reset().play();
    const N = Math.max(30, Math.round(clip.duration * 45)), dt = clip.duration / N;
    const prev = [new THREE.Vector3(), new THREE.Vector3()], cur = new THREE.Vector3();
    let best = 0;
    for (let i = 0; i <= N; i++) {
      a.time = Math.min(clip.duration - 1e-4, i * dt);
      src.mixer.update(0);
      src.scratch.updateMatrixWorld(true);
      for (const k of [0, 1]) {
        src.hands[k].getWorldPosition(cur);
        if (i) { const v = cur.distanceTo(prev[k]) / dt; if (v > best) { best = v; out = i * dt; } }
        prev[k].copy(cur);
      }
    }
    a.stop();
  }
  m.set(name, out);
  return out;
}

// ---- one actor ----------------------------------------------------------------------------------

interface Sample { t: number; p: THREE.Vector3; h: number }

/** a death's last frame is held this long before the body counts as settled (ms) */
const SETTLE_MS = 800;
/** how long a body that dies propped up takes to sink back onto the floor (s) */
const SLUMP_S = 1.1;
/** THE DEAD LIE FLAT (Josh, Nov 14 2026: "when survivors die they need to be laying flat not leaning up on from
 *  floor"). Measured on all 19 survivor bodies (scripts/survivorz/review/lie-flat.mjs): lying flat — the lying loop,
 *  every death clip's last frame — the head is at most 0.15 m over the hips; propped on the hands (the fall, held)
 *  0.24 m or more; standing 0.6. A dead survivor whose head is this far over its hips is not lying down. */
export const PROPPED_LEAN_M = 0.2;
/** settled corpses drawn per room at most (the newest; older ones are hidden) */
export const CORPSES_PER_ROOM = 6;
/** settled corpses drawn anywhere at most */
export const CORPSES_DRAWN = 24;
/** how long a body's look or compile may take before it is drawn without it (a step that never came back
 *  left the body undrawn for good — a name tag over nothing) */
const LOOK_MS = 30_000;
/** how often the corpse budget is re-read (ms) */
const CORPSE_EVERY_MS = 500;
/** a thing the body wears or carries away (a pack, a holstered gun): its object and the id it is */
interface Worn { id: string; obj: THREE.Object3D }

export class Actor {
  readonly root: THREE.Group = new THREE.Group();
  body: THREE.Object3D | null = null;
  mixer: THREE.AnimationMixer | null = null;
  src: BodySrc | null = null;
  state: BodyState;
  private samples: Sample[] = [];
  /** what is drawn now */
  readonly pos = new THREE.Vector3();
  heading = 0;
  /** stepping round on the spot (TURN_STEP_RAD): the walk loop plays slowly under the turn */
  turning = false;
  /** FEET THAT STAY PUT (lockFeet): each leg's chain, its own floor, where its foot is pinned and how hard */
  private legs: { foot: THREE.Object3D; ball: THREE.Object3D; calf: THREE.Object3D; thigh: THREE.Object3D; floor: number; pin: THREE.Vector3 | null; at: THREE.Vector3; w: number; stepH: number; stepS: number; ff: FootState }[] | null = null;
  /** where the hips sit off the root, eased (the separation measures bodies there) */
  hipOff = new THREE.Vector3();
  /** MOVING OFF THE WAY IT FACES (twistSpine): the way the body really moves (m/s, smoothed), whether it is backing
   *  away (the loop played in reverse), the way the legs point, and how far the spine turns back to the facing */
  private mv = new THREE.Vector2();
  private rawPrev: THREE.Vector3 | null = null;
  back = false;
  legsH = NaN;
  /** why the legs follow the facing this frame, not the motion ("" = they follow the motion; the audit reads it) */
  legsWhy = "";
  twist = 0;
  private spine: THREE.Object3D[] | null = null;
  /** the guard's look (lookAround): the head's yaw off the chest now (rad), the bones it turns, the scan's clock */
  private gaze = 0;
  /** the last standing rifle/shotgun shot: when, how hard, which way it threw (recoilStep) */
  private recoilT = -1e9;
  private recoilK = 0;
  private recoilYaw = 0;
  private recoilN = 0;
  private recoilBones: THREE.Object3D[] | null = null;
  private lookBones: THREE.Object3D[] | null = null;
  private scanAt = 0;
  private scanTo = 0;
  private scanN = 0;
  /** how fast the wire's heading is turning (rad/s, smoothed): the sim turns a body gradually, so a turn on the
   *  spot can come as a steady swing that never leaves TURN_STEP_RAD to go */
  private hRate = 0;
  private wireH = NaN;
  /** the speed the loop is matched to: the real one, or a slow walk while turning on the spot. (Never more than the
   *  body really gets anywhere: a body jostled in a crowd, or a fighter shuffling in and out, goes back and forth
   *  each tick — the segments say 0.4 m/s, the body stays put, and the loop walked on the spot.) */
  private get gait(): number { const v = Math.min(this.speed, this.mv.length() * 1.15 + 0.05); return this.turning ? Math.max(v, TURN_STEP_V) : v; }
  speed = 0;
  private base: THREE.AnimationAction | null = null;
  baseName = "";
  private shot: { a: THREE.AnimationAction; end: number; hold: boolean; kind: OneShot | "clip"; fadeOut: number; release: number; then?: string; layer?: boolean; upper?: boolean } | null = null;
  /** A LOOP THE POSE DOESN'T PICK (Oct 31 2026): a pair's held struggle, typing at a terminal, a talk
   *  gesture, a ladder — it wins over the pose table until `until` (ms, performance clock); `sync` starts
   *  it at its own frame 0 (the two halves of a pair loop in step) */
  forced: { name: string; until: number; sync: boolean; pose?: string; seen: boolean; t0: number } | null = null;
  /** WHERE A PAIR PUTS THE BODY (show/pairs.ts): the root held here, facing `h`, instead of the wire's
   *  place — the finisher pack's two halves only meet when the bodies stand where the bake stood them */
  anchor: { p: THREE.Vector3; h: number } | null = null;
  /** a jump of the root (an anchor set or let go) eased out over `dur` ms, never cut */
  private slide: { off: THREE.Vector3; t0: number; dur: number } | null = null;
  private lastT = -Infinity;
  /** a death held back (a knife in the skull lands at 0.95 s; the event comes when the blow is struck) */
  deathAt = 0;
  private deathDue = false;
  /** the dead's last check: the death has played out and the body was looked at once (layFlat / finishUnseen) */
  private flatDone = false;
  /** THE TURN's collapse: unconscious, so the fall isn't held propped on the hands — it sinks into the lying loop */
  limp = false;
  /** where the link (wire TickBody.link) the body is crossing takes it: a ladder, a vent, a lift */
  link: string | null = null;
  private prevY = 0;
  dead = false;
  /** when a death's pose has finished playing (performance.now ms): past it the body is SETTLED —
   *  its mixer stops, it casts no shadow (a corpse is a still thing; weeks of them must cost
   *  nothing but their draw) */
  settleAt = Infinity;
  /** hidden by the room's corpse budget (Actors.update) */
  corpseHidden = false;
  /** the body file failed to load this many times in a row (the retry's backoff) */
  dressFails = 0;
  private shadowsOff = false;
  look: BodyLook | null = null;
  cut: Cuttable | null = null;
  held: THREE.Object3D | null = null;
  heldId: string | null = null;
  private heldGrip: Grip | null = null;
  /** the backpack on the back (kit.ts) and what's stowed on the body, by the prop it is */
  pack: Worn | null = null;
  readonly stowed = new Map<string, THREE.Object3D>();
  /** THE CLIP PROPS (stance.ts CLIP_PROPS): a bottle on the drink, a syringe on the injection, a can, a
   *  bar, a keycard — loaded on first need (Actors.clipProp), shown only on their clip */
  readonly extras = new Map<string, { obj: THREE.Object3D; centre: THREE.Vector3 }>();
  wantExtra: ((a: Actor, id: string) => void) | null = null;
  /** the kit's loads, one after another (two ticks in a row must not hang two packs on one back) */
  kitChain: Promise<void> = Promise.resolve();
  readonly bones: Record<string, THREE.Object3D | undefined> = {};
  seed: number;
  /** footsteps: the phase of the clip the last step was at */
  private stepPhase = 0;
  onStep: ((a: Actor, pace: "walk" | "run" | "sneak") => void) | null = null;
  /** A BODY REACHES THE FLOOR (a fall, a death): heard when the hips get there, not when the fall begins */
  onThud: ((a: Actor) => void) | null = null;
  private thudUntil = 0;
  private thudArmed = false;
  /** the gun's world matrix this frame (a shot's flash comes from it) */
  readonly gunMatrix = new THREE.Matrix4();
  hasGun = false;
  /** the torch's lens this frame, or null (fx/torches reads it) */
  lens: { pos: THREE.Vector3; dir: THREE.Vector3 } | null = null;
  ready = false;
  /** a bone by its rig name, cached (kit.ts asks for the same five every frame) */
  readonly boneAt = (n: string): THREE.Object3D | undefined => {
    if (!(n in this.bones) && this.body) this.bones[n] = findBoneLike(this.body, n);
    return this.bones[n];
  };

  constructor(s: BodyState) {
    this.state = { ...s };
    this.seed = hashId(s.id);
    this.root.name = `actor:${s.id}`;
    this.pos.set(...s.pos);
    this.heading = s.heading;
    this.samples.push({ t: -Infinity, p: this.pos.clone(), h: s.heading });
  }

  get kind(): "survivor" | "zombie" { return this.state.kind; }
  get id(): string { return this.state.id; }
  get who(): string | undefined { return this.state.who; }

  /** a snapshot's place: no glide from wherever it was (a reset, a late joiner) */
  teleport(p: [number, number, number], h: number): void {
    this.pos.set(...p);
    this.heading = h;
    this.samples = [{ t: -Infinity, p: this.pos.clone(), h }];
  }

  /** a new place from the wire, stamped with the show clock */
  push(t: number, p: [number, number, number], h: number): void {
    const last = this.samples[this.samples.length - 1];
    // a body that stood still sends nothing: its last sample may be long ago — hold it until
    // just before this one, or the gap would be crossed as one long slow slide
    if (last && t - last.t > 160) this.samples.push({ t: t - 100, p: last.p.clone(), h: last.h });
    this.samples.push({ t, p: new THREE.Vector3(...p), h });
    if (this.samples.length > 8) this.samples.splice(0, this.samples.length - 8);
  }

  /** where the body is at show time `t` (between two samples, or held at the last) */
  sample(t: number, out: THREE.Vector3): { h: number; v: number } {
    const s = this.samples;
    let i = s.length - 1;
    while (i > 0 && s[i - 1].t > t) i--;
    const b = s[i], a = s[i - 1];
    if (!a || t >= b.t) {
      out.copy(b.p);
      return { h: b.h, v: 0 };
    }
    // (before a body's first real sample it holds where it was: the snapshot's sample is at -∞,
    // and lerping from -∞ is ∞/∞ — a NaN that once took a whole skeleton, and the camera with it)
    if (!Number.isFinite(a.t)) {
      out.copy(a.p);
      return { h: a.h, v: 0 };
    }
    const span = Math.max(1, b.t - a.t);
    const k = Math.min(1, Math.max(0, (t - a.t) / span));
    out.lerpVectors(a.p, b.p, k);
    let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const dist = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z);
    return { h: a.h + dh * k, v: (dist / span) * 1000 };
  }

  /** the bone positions the hand frame needs (survivor rig names) */
  findBones(): void {
    if (!this.body) return;
    for (const n of ["hand_r", "middle_01_r", "index_01_r", "pinky_01_r", "spine_03", "head", "hand_l", "middle_01_l", "index_01_l", "pinky_01_l", "hip", "root.x", "foot_l", "foot_r", "spine_02", "neck",
      "hand.r", "head.x", "spine_02.x", "spine_03.x", "neck.x", "foot.l", "foot.r"]) this.bones[n] = findBoneLike(this.body, n);
  }

  /** a world point on the body: its chest (for blood, for where an event happens) */
  chest(out = new THREE.Vector3()): THREE.Vector3 {
    const b = this.bones["spine_03"] ?? this.bones["spine_03.x"] ?? this.bones["spine_02.x"];
    if (b) return b.getWorldPosition(out);
    return out.copy(this.pos).setY(this.pos.y + 1.2);
  }
  headPos(out = new THREE.Vector3()): THREE.Vector3 {
    const b = this.bones["head"] ?? this.bones["head.x"];
    if (b) return b.getWorldPosition(out);
    return out.copy(this.pos).setY(this.pos.y + 1.6);
  }
  forward(out = new THREE.Vector3()): THREE.Vector3 { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  // ---- clips ----

  private clip(name: string): THREE.AnimationClip | undefined { return this.src?.clips.get(name); }
  /** the body has the clip AND it passes the laws on this body */
  private readonly has = (name: string): boolean => !!this.clip(name) && lawful(this.state.body, name);
  private readonly rate = (name: string): number => (this.src ? measureSpeed(this.src, name) : NaN);

  private action(name: string): THREE.AnimationAction | null {
    const c = this.clip(name);
    return c && this.mixer ? this.mixer.clipAction(c) : null;
  }

  /** THE UPPER BODY ALONE (realism round 6, Nov 2026 — the audit's worst skating): a reload, a swing, a
   *  door shoved, a cough played full-body while the body walks plants its feet and slides them across the
   *  floor (measured to 4 m/s). Moving, an action plays on the spine and up only — the same clip with the
   *  hips and legs taken out, under its own name, cached per body file — and the locomotion loop keeps the
   *  legs. The bones are everything under spine_01 (spine_01.x on the dead). */
  private upperBones: Set<string> | null = null;
  private upperAction(name: string): THREE.AnimationAction | null {
    if (!this.mixer || !this.src || !this.body) return null;
    const holder = this.src as unknown as { upper?: Map<string, THREE.AnimationClip | null> };
    const cache = (holder.upper ??= new Map());
    let u = cache.get(name);
    if (u === undefined) {
      if (!this.upperBones) {
        const sp = this.boneAt("spine_01") ?? this.boneAt("spine_01.x") ?? this.boneAt("spine_01x");
        if (sp) { const set = new Set<string>(); sp.traverse((o) => set.add(o.name)); this.upperBones = set; }
      }
      const c = this.clip(name), bones = this.upperBones;
      const tracks = c && bones ? c.tracks.filter((t) => bones.has(t.name.slice(0, t.name.lastIndexOf(".")))) : [];
      u = c && tracks.length ? new THREE.AnimationClip(name, c.duration, tracks) : null;
      cache.set(name, u);
    }
    return u ? this.mixer.clipAction(u) : null;
  }
  /** a loop's action: the clip, or for a loop with its own way in and out (stance.ts LOOP_PARTS) only its held stretch */
  private loopAction(name: string): THREE.AnimationAction | null {
    const parts = LOOP_PARTS[name];
    if (!parts || !this.mixer || !this.src) return this.action(name);
    const holder = this.src as unknown as { held?: Map<string, THREE.AnimationClip | null> };
    const cache = (holder.held ??= new Map());
    let c = cache.get(name);
    if (c === undefined) {
      const src = this.clip(name);
      c = null;
      if (src) {
        const [a, b] = parts.hold;
        const k = src.clone();
        for (const t of k.tracks) { t.trim(a, b); t.shift(-a); }
        k.duration = b - a;
        c = k;
      }
      cache.set(name, c);
    }
    return c ? this.mixer.clipAction(c) : this.action(name);
  }

  /** an action under way goes to its upper-body version at the same frame (the body set off) */
  private toUpper(): void {
    const sh = this.shot;
    if (!sh || sh.upper || !sh.layer || sh.hold || this.anchor || this.dead) return;
    const u = this.upperAction(sh.a.getClip().name);
    if (!u || u === sh.a) return;
    u.reset(); u.setLoop(THREE.LoopOnce, 1); u.clampWhenFinished = false; u.timeScale = sh.a.timeScale;
    u.setEffectiveWeight(UPPER_W).fadeIn(0.15).play(); u.time = sh.a.time;
    sh.a.fadeOut(0.15);
    sh.a = u; sh.upper = true;
    // the legs back to the loop, where it is in its stride
    if (this.base) { this.base.enabled = true; this.base.setEffectiveWeight(1).fadeIn(0.15).play(); }
  }

  /** the loop this body wants now */
  chooseBase(): string {
    const s = this.state;
    const f = this.forced;
    if (f) {
      // (a forced loop tied to a pose — typing at a terminal — ends the moment the wire's pose moves on)
      // (the event comes a tick before the pose does: the loop waits up to 2 s for it to arrive)
      if (f.pose !== undefined && !f.seen && s.pose === f.pose) f.seen = true;
      const off = performance.now() >= f.until || (f.pose !== undefined && (f.seen ? s.pose !== f.pose : performance.now() - f.t0 > 2000));
      if (!off && this.has(f.name)) return f.name;
      if (off) this.forced = null;
    }
    if (this.kind === "zombie") return zombieLoop({ zkind: s.zkind, pose: s.pose, speed: this.gait, seed: this.seed, link: this.link }, this.has, this.rate);
    return survivorLoop({ body: s.body, seed: this.seed, pose: s.pose, held: s.held, alert: s.alert, why: s.why, hp: s.hp, hpMax: s.hpMax, speed: this.gait, now: performance.now(), sick: s.vitals?.sick, link: this.link }, this.has, this.rate);
  }

  /** the body has this clip and may play it here (the law's list) */
  canPlay(name: string): boolean { return this.has(name); }
  clipLength(name: string): number { return this.clip(name)?.duration ?? 0; }

  /** a loop over the pose table until `ms` from now (null: give the body back to the table) */
  setForced(name: string | null, ms = Infinity, sync = false, pose?: string): void {
    if (!name) { this.forced = null; return; }
    this.forced = { name, until: performance.now() + ms, sync, pose, seen: pose !== undefined && this.state.pose === pose, t0: performance.now() };
  }

  /** A NAMED CLIP ONCE over the loop (a pair's half, a tool, a rise): the one-shot machinery without the
   *  table. `from`/`to` play a stretch of it (seconds); `hold` keeps the last frame; `fadeIn`/`fadeOut`
   *  (seconds) are its blends; `release` lets go of the anchor as it hands back (ms of slide). */
  playClip(name: string, o: { from?: number; to?: number; hold?: boolean; fadeIn?: number; fadeOut?: number; release?: number; then?: string; upper?: boolean } = {}): boolean {
    if (!this.mixer || this.dead || !this.has(name)) return false;
    const layer = o.upper !== false && !o.hold && !this.anchor;
    const upNow = layer && (this.speed > BAND.move || UPPER_ONLY.has(name));
    const fadeIn = Math.max(o.fadeIn ?? 0.2, SLOW_IN[name] ?? 0);
    const a = (upNow ? this.upperAction(name) : null) ?? this.action(name);
    if (!a) return false;
    // a pair's let-go travels with the body: a clip that cuts in before the free clip ends takes over its release
    // (a hit flinch over the wrench-free used to drop it, and the body stayed pinned where the grab had stood it)
    const carried = this.shot?.release ?? 0;
    if (this.shot && this.shot.a !== a) this.shot.a.fadeOut(fadeIn);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = !!o.hold;
    a.timeScale = 1;
    const isUpper = upNow && a !== this.action(name);
    a.setEffectiveWeight(isUpper ? UPPER_W : 1);
    const old = this.base && this.base !== a ? this.base : null;
    if (this.base === a) { this.base = null; this.baseName = ""; }
    const dur = a.getClip().duration, from = Math.max(0, o.from ?? 0), to = Math.min(dur, o.to ?? dur);
    a.fadeIn(fadeIn); a.play(); a.time = from;
    // (upper body only: the loop goes on under it, the legs)
    if (old && !isUpper) old.fadeOut(fadeIn);
    const fadeOut = o.fadeOut ?? 0.2;
    this.shot = { a, end: (to - from - (to < dur ? 0 : 0.18)) * 1000 + performance.now(), hold: !!o.hold, kind: "clip", fadeOut, release: Math.max(o.release ?? 0, carried), then: o.then, layer, upper: isUpper };
    this.updateHeldVisibility(name);
    return true;
  }
  /** the named clip now over the loop (null when none) and how far into it, seconds */
  /** pinned with nothing playing that will ever let go (the pairs' safety net) */
  get strandedAnchor(): boolean { return !!this.anchor && !this.shot && !this.dead; }
  shotNow(): { name: string; time: number } | null { return this.shot ? { name: this.shot.a.getClip().name, time: this.shot.a.time } : null; }
  /** end whatever named clip is playing now, blending `fade` seconds back to the loop */
  endShot(fade = 0.25): void {
    if (!this.shot || this.dead) return;
    this.shot.hold = false; this.shot.end = 0; this.shot.fadeOut = fade;
  }

  /** hold the root at a place (a pair), or let it go back to the wire (null); the jump eased over `ms` */
  setAnchor(p: THREE.Vector3 | null, h = 0, ms = 400): void {
    const before = this.pos.clone();
    this.anchor = p ? { p: p.clone(), h } : null;
    const target = p ? p.clone() : this.sampledNow();
    const off = before.sub(target);
    off.y = 0;
    this.slide = ms > 0 && off.lengthSq() > 1e-6 ? { off, t0: performance.now(), dur: ms } : null;
  }
  private sampledNow(): THREE.Vector3 { const v = new THREE.Vector3(); this.sample(this.lastT, v); return v; }

  /** THE TURN: a turned survivor's first moments — lying where they fell, they get up off the floor and
   *  scream (stance.ts RISE). Asked for before the body is dressed, it waits for it (Actors.dress). */
  risePending: [string, string] | null = null;
  turnRise(first: string, scream: string): void {
    if (!this.mixer || !this.body || !this.ready) { this.risePending = [first, scream]; return; }
    this.risePending = null;
    // straight into the floor pose (the survivor's body lay there a moment ago): no blend up from standing
    this.playClip(first, { fadeIn: 0, fadeOut: 0.35, then: scream });
  }

  /** what the screen shows now, for the one-shot table: lying on the floor, or (a zombie) on its knees */
  private posedAs(): string {
    if (this.kind === "zombie") return this.baseName === "mx-zombie-biting-ground" ? "z-feed" : this.state.pose;
    const onFloor = LYING_CLIPS.has(this.baseName) || (this.shot?.hold && this.shot.kind === "fall");
    return onFloor ? "down" : this.state.pose;
  }

  /** a one-shot over the loop: it plays once and hands back (a death holds its last frame) */
  /** `strikeIn`: the clip's strike (clipStrike, or `strikeAt` s into it) lands this many seconds from now — the
   *  clip starts part-way in, or is held back. Returns how long until the strike, when it knows. */
  play(kind: OneShot, opts: { part?: string; weapon?: string; instant?: boolean; strikeIn?: number; strikeAt?: number } = {}): number | undefined {
    if (!this.mixer) return;
    // (the death comes twice — the event and the tick's pose — and the second must not restart it)
    if (this.dead) return;
    // (a death held back — the knife lands later than the blow is struck — waits for its moment)
    if (kind === "death" && performance.now() < this.deathAt) { this.deathDue = true; return; }
    const o = { zombie: this.kind === "zombie", zkind: this.state.zkind, pose: this.posedAs(), held: this.state.held, seed: this.seed, part: opts.part };
    // A STANDING SHOT IS A KICK, NOT A CLIP (realism round 14 — Josh: "everytime dale went to fire his rifle it kept
    // resetting positioning"): the only rifle shot the bake has, gr-mx-shoot-rifle, is Mixamo's run-and-gun — hips 12 cm
    // down, the feet swapping a stride. Played on a body standing in its aim, every shot restarted it: a drop into a
    // crouch, a step, and the snap back to the aim. Standing, the aim holds and the shot is a recoil (recoilStep);
    // moving, the run-and-gun is what it was made for and still plays over the legs.
    if (kind === "shoot" && this.kind === "survivor" && !this.anchor && this.speed < BAND.move) {
      const arm = armedOf(this.state.held).armed;
      if (arm === "rifle" || arm === "shotgun") {
        if (this.shot?.kind === "shoot") this.endShot(0.12);
        this.recoilT = performance.now();
        this.recoilK = arm === "shotgun" ? RECOIL_SHOTGUN : RECOIL_RIFLE;
        this.recoilYaw = ((hash2(this.seed, 6_101 + this.recoilN++) % 1000) / 1000 - 0.5) * 2;
        return;
      }
    }
    const name = oneShotName(kind, o, this.has);
    if (name === "freeze") { this.freeze(); return; }
    if (!name) return;
    const st = opts.strikeIn !== undefined && this.src ? (opts.strikeAt ?? clipStrike(this.src, name)) : NaN;
    let from = 0;
    if (Number.isFinite(st)) {
      const off = st - opts.strikeIn!;
      // (the clip strikes sooner than the blow lands: it waits in the stance it's in, then goes)
      if (off < -0.03) { const wait = opts.strikeIn!; setTimeout(() => { if (!this.dead) this.play(kind, { part: opts.part, weapon: opts.weapon }); }, -off * 1000); return wait; }
      from = off;
    }
    const layer = LAYER_KINDS.has(kind) && !this.anchor && !opts.instant;
    const upNow = layer && (this.speed > BAND.move || UPPER_ONLY.has(name));
    const a = (upNow ? this.upperAction(name) : null) ?? this.action(name);
    if (!a) return;
    // the one-shot IS the loop already playing (a zombie in its attack loop, attacking): let it run —
    // fading the "old loop" out would fade the very action out, leaving the bind pose
    if (a === this.base && kind !== "death" && kind !== "fall") {
      // (the loop is already this clip: how long until it next comes round to its strike)
      if (!Number.isFinite(st)) return;
      const d = a.getClip().duration, ts = Math.abs(a.timeScale) || 1;
      return ((((st - a.time) % d) + d) % d) / ts;
    }
    const hold = kind === "death" || kind === "fall";
    const carried = this.shot?.release ?? 0;   // (the let-go travels with the body: playClip)
    if (this.shot && this.shot.a !== a) this.shot.a.fadeOut(0.12);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = hold;
    // lying down is getting up played backwards (the bake's lying-down, UAL's lay-to-idle reversed)
    const back = kind === "liedown";
    a.timeScale = back ? -1 : 1;
    const isUpper = upNow && a !== this.action(name);
    a.setEffectiveWeight(isUpper ? UPPER_W : 1);
    // THE ONE-SHOT MAY BE THE LOOP'S OWN CLIP: a body that arrives already dead was given the death
    // clip as its loop by chooseBase (ZOMBIE_LOOPS["z-dead"]) a frame earlier. Stopping or fading
    // "the old loop" then stopped THIS action — no clip at all, the bind pose: every zombie killed
    // before a watcher joined stood T-posed (Josh, Oct 28 2026). The action is the one-shot now.
    const old = this.base && this.base !== a ? this.base : null;
    if (this.base === a) { this.base = null; this.baseName = ""; }
    const dur = a.getClip().duration, start = back ? dur : Math.max(oneShotStart(kind, o) * dur, Math.min(from, Math.max(0, dur - 0.25)));
    if (opts.instant) { a.play(); a.time = dur; if (old) old.stop(); }
    else { const fi = SLOW_IN[name] ?? 0.12; a.fadeIn(fi); a.play(); a.time = start; if (old && !isUpper) old.fadeOut(fi); }
    this.shot = { a, end: ((back ? dur : dur - start) - 0.18) * 1000 + performance.now(), hold, kind, fadeOut: 0.2, release: carried, layer, upper: isUpper };
    if (kind === "death") { this.dead = true; this.settleAt = this.shot.end + SETTLE_MS; }
    if (hold && !opts.instant) { this.thudUntil = performance.now() + 5000; this.thudArmed = false; }
    this.updateHeldVisibility(name);
    return Number.isFinite(st) ? opts.strikeIn : undefined;
  }

  /** a death where the body already lies (a crawler, a survivor bleeding out on the floor): no clip
   *  would stand it up to fall again — it stops where it is */
  private freeze(): void {
    this.dead = true;
    this.settleAt = performance.now() + SETTLE_MS;
    // THE DEAD GO LIMP (Nov 13 2026, watched): a survivor who is down sits propped on their hands (the fall, held),
    // and dying there froze them so — a corpse holding itself up off the floor. The propped pose is let go for the
    // lying one, still (no breath), over SLUMP_S: they sink back onto the floor (the sim lies them the same way:
    // world.ts dieSurvivor).
    if (this.kind === "survivor" && this.shot?.hold && this.shot.kind === "fall" && this.slump()) return;
    if (this.base) this.base.timeScale = 0;
    if (this.shot) { this.shot.hold = true; this.shot.a.timeScale = 0; this.shot.a.clampWhenFinished = true; }
  }

  /** whatever the body is held in is let go for the lying loop's first frame, still (no breath), over SLUMP_S */
  private slump(): boolean {
    const lying = this.loopAction(CALM_LOOPS.down.any);
    if (!lying) return false;
    if (this.shot && this.shot.a !== lying) this.shot.a.fadeOut(SLUMP_S);
    this.shot = null;
    if (this.base && this.base !== lying) this.base.fadeOut(SLUMP_S);
    if (this.arms) { this.arms.fadeOut(SLUMP_S); this.arms = null; this.armsName = ""; }
    lying.reset(); lying.setLoop(THREE.LoopRepeat, Infinity); lying.time = 0; lying.timeScale = 0;
    this.base = lying; this.baseName = CALM_LOOPS.down.any;
    lying.setEffectiveWeight(1).fadeIn(SLUMP_S).play();
    this.settleAt = performance.now() + SLUMP_S * 1000 + SETTLE_MS;
    return true;
  }

  /** is the body up off the floor: the head well over the hips (PROPPED_LEAN_M) */
  private proppedNow(): boolean {
    return this.headPos(new THREE.Vector3()).y - this.hips(new THREE.Vector3()).y > PROPPED_LEAN_M;
  }

  /** THE DEAD LIE FLAT, WHATEVER KILLED THEM (Nov 14 2026). The death clips all end flat and a death on the floor
   *  sinks back (freeze), but a dead body could still be left up off the floor: frozen where a reconnect's snapshot
   *  found it standing, held in a pair's pose, stopped part-way. So once a dead survivor's death has played out it
   *  is looked at once, and one that isn't lying down is laid down. */
  private layFlat(now: number): void {
    if (this.flatDone || !this.dead || this.kind !== "survivor" || now < this.settleAt) return;
    this.flatDone = true;
    if (this.proppedNow()) this.slump();
  }

  /** A DEATH NOBODY WATCHED IS OVER (Nov 14 2026). A body the camera can't see isn't animated, so one that died out
   *  of sight kept its whole death for the moment the camera came: it fell down, dead, as the shot opened (and one of
   *  the dead, settled before it was ever drawn, stood frozen in its last step). Out of sight, a death plays out at
   *  once: the clip to its last frame, the blends done, and a survivor laid flat. */
  finishUnseen(now: number): void {
    if (!this.mixer || !this.body) return;
    if (this.deathDue) { this.deathDue = false; this.deathAt = 0; this.play("death"); }
    if (!this.dead || this.flatDone) return;
    this.flatDone = true;
    this.thudUntil = 0;
    this.mixer.update(30);
    if (this.kind === "survivor") {
      this.root.updateMatrixWorld(true);
      if (this.proppedNow()) { this.slump(); this.mixer.update(SLUMP_S + 0.1); }
    }
    this.settleAt = Math.min(this.settleAt, now);
  }

  /** back from a death pose (a reset; a revived survivor): the held death frame let go, and up off the floor */
  rise(): void {
    this.dead = false;
    this.flatDone = false;
    this.settleAt = Infinity;
    this.castShadows(true);
    if (this.base) this.base.timeScale = 1;
    if (this.shot) { this.shot.hold = false; this.shot.end = 0; this.shot.a.timeScale = 1; }
  }

  /** the pose on the wire changed: what the change itself plays (a fall's held, a death, getting up) */
  poseChanged(from: string, to: string): void {
    const deadNow = to === "dead" || to === "z-dead", wasDead = from === "dead" || from === "z-dead";
    if (!wasDead && deadNow) { this.play("death"); return; }
    if (wasDead && !deadNow) this.rise();
    if (this.kind !== "survivor") return;
    // off the floor (revived, woken): get up — the loops would otherwise crossfade a lying body upright
    // in a quarter second; and down for sleep the same way, backwards
    if ((LYING.has(from) || wasDead) && !LYING.has(to)) this.play("getup");
    else if (!LYING.has(from) && to === "sleep") this.play("liedown");
  }

  /** THE ARMS' LOOP over the legs (stance.ts survivorArms / zombieArms): the upper body alone, faded in and
   *  out as the body sets off and stops; it stands down for any one-shot (which has the upper body then) */
  private armsName = "";
  private arms: THREE.AnimationAction | null = null;
  private armsStep(): void {
    const s = this.state;
    let want = "";
    if (!this.shot && !this.dead && !this.anchor && !this.forced) {
      want = this.kind === "zombie"
        ? zombieArms({ zkind: s.zkind, pose: s.pose, speed: this.speed, seed: this.seed }, this.has)
        : survivorArms({ body: s.body, seed: this.seed, pose: s.pose, held: s.held, alert: s.alert, why: s.why, hp: s.hp, hpMax: s.hpMax, speed: this.speed, now: performance.now(), sick: s.vitals?.sick, link: this.link }, this.has);
    }
    if (want === this.armsName) return;
    // (a one-shot that took the same upper clip owns it now: don't fade it out from under the shot)
    if (this.arms && this.arms !== this.shot?.a) this.arms.fadeOut(0.25);
    this.arms = null;
    this.armsName = want;
    if (want) {
      const a = this.upperAction(want);
      if (a) {
        a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.timeScale = 1;
        a.time = (this.seed % 991) / 991 * a.getClip().duration;
        a.setEffectiveWeight(UPPER_W).fadeIn(0.25).play();
        this.arms = a;
      } else this.armsName = "";
    }
    if (!this.shot) this.updateHeldVisibility(this.baseName);
  }

  /** the fidgets (stance.ts FIDGETS): when the next is due (0: not waiting), and how many so far */
  private fidgetAt = 0;
  private fidgets = 0;
  private fidgetOff = 0;
  private fidgeting = false;
  private fidgetStep(now: number): void {
    const s = this.state;
    // a fidget under way ends the moment they set off (it would slide them across the floor)
    if (this.fidgeting) {
      if (!this.shot) this.fidgeting = false;
      else if (s.pose !== "idle" || this.speed > BAND.move) { this.endShot(0.25); this.fidgeting = false; }
      return;
    }
    // (standing still reads a few tenths of a metre a second of wire jitter: idle is "under a walk", and a
    // blip of anything else under a second and a half doesn't start the wait again)
    const calm = this.kind === "survivor" && !this.dead && !this.shot && !this.forced && !this.anchor && !this.heldWanted
      && s.pose === "idle" && this.speed < BAND.move && !this.turning && FIDGET_OVER.has(this.baseName);
    if (!calm) {
      if (!this.fidgetOff) this.fidgetOff = now;
      if (now - this.fidgetOff > 1500) this.fidgetAt = 0;
      return;
    }
    this.fidgetOff = 0;
    if (!this.fidgetAt) { this.fidgetAt = now + fidget(this.seed, this.fidgets).gap; return; }
    if (now < this.fidgetAt) return;
    const f = fidget(this.seed, this.fidgets++);
    this.fidgetAt = 0;
    // (a knife or pipe put away in the idle stays put away: never a fidget that would make it appear)
    if (this.heldId && heldShown(armedOf(this.heldId).armed, f.clip)) return;
    this.fidgeting = this.playClip(f.clip, { fadeIn: 0.4, fadeOut: 0.45 });
  }

  /** a corpse whose death has played out: nothing about it moves any more */
  settled(now: number): boolean { return this.dead && now >= this.settleAt; }

  /** shadows on or off (a settled corpse stops casting: two rig shadow maps per body, for weeks) */
  castShadows(on: boolean): void {
    if (this.shadowsOff === !on || !this.body) return;
    this.shadowsOff = !on;
    this.body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) m.castShadow = on; });
  }

  /** every frame: place, clip, mixer */
  update(dt: number, t: number, now: number): void {
    if (!this.body || !this.mixer) return;
    this.lastT = t;
    if (this.deathDue && now >= this.deathAt) {
      this.deathDue = false;
      // (a body held in a pair whose hips are off its root — a zombie lunged into a hold — falls from
      // where its hips are: the root eased there over the death's own blend, so nothing jumps; and the
      // body stays where it fell, it isn't handed back to the wire's spot to slide there)
      if (this.anchor) { const hp = this.hips(new THREE.Vector3()); this.setAnchor(new THREE.Vector3(hp.x, this.anchor.p.y, hp.z), this.anchor.h, 140); }
      this.play("death");
    }
    const r = this.sample(t, this.pos);
    // the way it really moves, before a pair's anchor or a slide moves the root for it
    if (this.rawPrev && dt > 0) {
      const k = Math.min(1, dt / MOVE_DIR_S);
      this.mv.x += ((this.pos.x - this.rawPrev.x) / dt - this.mv.x) * k;
      this.mv.y += ((this.pos.z - this.rawPrev.z) / dt - this.mv.y) * k;
    }
    (this.rawPrev ??= new THREE.Vector3()).copy(this.pos);
    // a pair holds the root where its bake stood it (and faces it the bake's way)
    if (this.anchor) { this.pos.copy(this.anchor.p); r.h = this.anchor.h; r.v = 0; }
    // an anchor set or let go: the root's jump eased out, never cut
    if (this.slide) {
      const k = 1 - (now - this.slide.t0) / this.slide.dur;
      if (k <= 0) this.slide = null;
      else this.pos.addScaledVector(this.slide.off, k * k * (3 - 2 * k));
    }
    // the speed, smoothed (a quarter second): what the locomotion is matched to
    this.speed += (r.v - this.speed) * Math.min(1, dt / 0.25);
    if (!Number.isFinite(this.speed)) this.speed = 0;
    if (!Number.isFinite(this.heading)) this.heading = r.h;
    // the heading eased toward the wire's (a turn takes a moment; never a snap)
    let dh = (this.faceTo ?? r.h) - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    // (and never faster than a body turns: the ease alone started a reversal at 28 rad/s — a snap. A pair's
    // heading is the bake's and is taken as it comes)
    const standing = this.speed < BAND.move && !this.anchor && !this.dead && !this.link && (!this.shot || this.shot.upper || this.fidgeting)
      && TURN_POSES.has(this.state.pose) && (this.kind === "survivor" || this.state.zkind !== "crawler");
    const want = this.faceTo ?? r.h;
    if (Number.isFinite(this.wireH) && dt > 0) { let w = want - this.wireH; w = Math.atan2(Math.sin(w), Math.cos(w)); this.hRate += (Math.abs(w) / dt - this.hRate) * Math.min(1, dt / 0.2); }
    this.wireH = want;
    if (!standing) this.turning = false;
    else if (Math.abs(dh) > TURN_STEP_RAD[this.kind] || this.hRate > TURN_STEP_RATE) { this.turning = true; if (this.fidgeting) { this.endShot(0.2); this.fidgeting = false; } }
    else if (Math.abs(dh) < TURN_STEP_DONE && this.hRate < TURN_STEP_RATE * 0.5) this.turning = false;
    const turn = dh * Math.min(1, dt * 9), cap = this.anchor ? Infinity : (this.turning ? TURN_STAND[this.kind] : TURN_MAX) * dt;
    this.heading += Math.max(-cap, Math.min(cap, turn));
    this.root.position.copy(this.pos);
    // MOVING OFF THE WAY IT FACES (realism round 10): the sim backs a fighter away from what it faces, steps it
    // aside, shoves a zombie back from a crowd — and the forward loop moonwalked. The legs point the way the body
    // really goes (backing away: the loop plays in reverse), and the spine turns back to the facing (twistSpine)
    const mvs = this.mv.length();
    const legsOk = !this.anchor && !this.link && !this.dead && !this.turning && mvs > MOVE_DIR_V && this.gait > BAND.move
      && (!this.shot || this.shot.upper) && Number.isFinite(this.rate(this.baseName)) && this.rate(this.baseName) > 0.15
      && (this.kind === "survivor" || this.state.zkind !== "crawler");
    let legsWant = this.heading;
    this.legsWhy = legsOk ? "" : this.anchor ? "anchor" : this.link ? "link" : this.dead ? "dead" : this.turning ? "turning" : mvs <= MOVE_DIR_V ? "slow" : this.gait <= BAND.move ? "gait" : this.shot && !this.shot.upper ? "shot" : "rate";
    if (legsOk) {
      const md = Math.atan2(this.mv.x, this.mv.y);
      let th = md - this.heading; th = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
      // (only a body the SIM faces away from its motion backs away — a step back from a fight, the footwork. One
      // whose drawn facing just lags a turn the sim has already made, and sets off, is walking forward: it backed
      // a step and then whipped its legs round 180°. The chest catches up instead; the spine takes what it can)
      let wm = md - want; wm = Math.abs(Math.atan2(Math.sin(wm), Math.cos(wm)));
      this.back = this.back ? th > BACK_OUT && wm > BACK_WIRE_OUT : th > BACK_IN && wm > BACK_WIRE_IN;
      // (the legs go exactly the way the body goes — held off it to keep the chest on target, a side-step slipped
      // 26 cm a step; the spine turns what it can, and in a pure side-step the head is ~25° off the facing)
      // (an ordinary walk round a corner turns the facing with the motion, and the smoothed motion trails a quick
      // turn — Rick's legs ran 100° behind his chest round one: within OFF_LO of the facing the legs simply follow
      // the facing, past OFF_HI the motion, blended between)
      let dm = md - this.heading; dm = Math.atan2(Math.sin(dm), Math.cos(dm));
      const w = THREE.MathUtils.smoothstep(Math.abs(dm), OFF_LO, OFF_HI);
      legsWant = this.back ? md + Math.PI : this.heading + dm * w;
    } else this.back = false;
    if (!Number.isFinite(this.legsH) || this.anchor) this.legsH = legsWant;
    let dl = legsWant - this.legsH; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
    const lcap = LEGS_RATE * dt;
    this.legsH += Math.max(-lcap, Math.min(lcap, dl * Math.min(1, dt * 10)));
    let tw2 = this.heading - this.legsH; tw2 = Math.atan2(Math.sin(tw2), Math.cos(tw2));
    this.twist = Math.max(-TWIST_MAX, Math.min(TWIST_MAX, tw2));
    this.root.rotation.y = this.legsH;
    // a fall is held on the floor only while the body is down AND still (getting up, or crawling off,
    // hands back to the loop — a held fall used to slide across the floor under a crawl)
    // (really moving, not the last of the walk they went down from: a body that fell mid-stride still read over
    // BAND.still as the fall ended and was put in the lying loop — straight, not the fall's pose the sim knows it
    // lies in (sim/lie.ts), so a friend knelt on its legs)
    // (THE TURN's collapse is out cold: once the fall has landed it sinks into the lying loop, slowly — Nov 14 2026: it
    // sat propped on its hands for its minute, and the one that stood up out of it started flat on its back)
    if (this.limp && this.state.pose !== "down") this.limp = false;
    if (this.shot?.hold && !this.dead && (this.state.pose !== "down" || this.speed > BAND.move || this.limp) && now >= this.shot.end) {
      this.shot.hold = false;
      if (this.limp && this.state.pose === "down") this.shot.fadeOut = SLUMP_S;
    }
    // an action under way while the body sets off: the upper body alone from here
    if (this.shot && !this.shot.upper && this.shot.layer && this.speed > BAND.move + 0.1) this.toUpper();
    // an upper-body action running out: it fades, and the loop (already under it, the legs) takes the rest
    if (this.shot?.upper && !this.shot.hold && now >= this.shot.end) {
      const { fadeOut, release } = this.shot;
      this.shot.a.fadeOut(fadeOut);
      this.shot = null;
      if (release > 0 && this.anchor) this.setAnchor(null, 0, release);
      if (this.base) { this.base.enabled = true; this.base.setEffectiveWeight(1).play(); }
      this.updateHeldVisibility(this.baseName);
    }
    // the one-shot running out hands back to the loop
    if (this.shot && !this.shot.hold && now >= this.shot.end) {
      const { fadeOut, release, then } = this.shot;
      // a chain of clips (the rise: up off the floor, then the scream) hands to the next, not the loop
      if (then && !this.dead && this.has(then)) { this.shot = null; this.playClip(then, { fadeIn: fadeOut, fadeOut: 0.3, release }); }
      else {
      this.shot.a.fadeOut(fadeOut);
      this.shot = null;
      if (release > 0 && this.anchor) this.setAnchor(null, 0, release);
      // the loop the pose (or a forced loop) wants now, under the clip at no weight — so the clip hands
      // back to the right one (a pair's held struggle), not to the loop that was there before it
      let fresh = false;
      if (!this.dead) {
        const want = this.chooseBase();
        if (want && want !== this.baseName) { const b = this.loopAction(want); if (b) { this.base?.stop(); b.reset(); b.setLoop(THREE.LoopRepeat, Infinity); b.time = this.forced?.sync && this.forced.name === want ? 0 : (this.seed % 997) / 997 * b.getClip().duration; this.base = b; this.baseName = want; fresh = true; } }
      }
      // (setEffectiveWeight is a standing multiplier on every later fade: a loop parked at 0 under a
      // one-shot and then only faded in stayed at 0 — a body in its bind pose, caught on camera; and a
      // loop faded out to nothing is disabled until it's reset)
      if (!fresh) this.base?.reset();
      this.base?.setEffectiveWeight(1).fadeIn(fadeOut).play();
      this.updateHeldVisibility(this.baseName);
      }
    }
    if (!this.dead) {
      const want = this.chooseBase();
      if (want && want !== this.baseName && this.shot?.a.getClip().name !== want) this.setBase(want);
      this.fidgetStep(now);
      this.armsStep();
      // speed-matched locomotion: the clip at the ground's speed ÷ its own
      if (this.base) {
        const nat = this.rate(this.baseName);
        // up a ladder or down it: the climb at its own pace, played backwards going down
        if (this.link === "ladder" && this.baseName === "mx-climbing-ladder") {
          const vy = dt > 0 ? (this.pos.y - this.prevY) / dt : 0;
          this.base.timeScale = Math.abs(vy) < 0.05 ? 0 : vy > 0 ? 1 : -1;
          if (this.base.timeScale !== 0 && this.onStep && !this.shot) this.steps(1);
          this.prevY = this.pos.y;
          this.mixer.update(dt);
          return;
        }
        const g = this.gait;
        const moving = Number.isFinite(nat) && nat > 0.15 && g > BAND.still && (this.kind === "zombie" ? Z_MOVING.has(zombieKey({ zkind: this.state.zkind, pose: this.state.pose, speed: g, seed: this.seed })) : true);
        this.base.timeScale = (moving ? THREE.MathUtils.clamp(g / nat, RATE_CLAMP[0], RATE_CLAMP[1]) : 1) * (moving && this.back ? -1 : 1);
      }
    }
    this.prevY = this.pos.y;
    this.layFlat(now);
    this.mixer.update(dt);
  }

  private setBase(name: string): void {
    const a = this.loopAction(name);
    if (!a) return;
    // (a loop with its own way in and out: the way in plays first, the held stretch under it; the old loop's way out)
    const was = this.baseName;
    if (LOOP_PARTS[was] && was !== name && !this.shot && this.speed < BAND.move && !this.dead) {
      const o = LOOP_PARTS[was].out;
      queueMicrotask(() => { if (!this.shot && !this.dead) this.playClip(was, { from: o[0], to: o[1], fadeIn: 0.15, fadeOut: 0.3, upper: false }); });
    }
    if (LOOP_PARTS[name] && !this.shot && !this.dead) {
      const i = LOOP_PARTS[name].in;
      queueMicrotask(() => { if (!this.shot && !this.dead) this.playClip(name, { from: i[0], to: i[1], fadeIn: 0.15, fadeOut: 0.2, upper: false }); });
    }
    a.reset();
    a.timeScale = 1;
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    // (start each loop at its own phase so a crowd isn't in step — a pair's halves start together)
    a.time = this.forced?.sync && this.forced.name === name ? 0 : (this.seed % 997) / 997 * a.getClip().duration;
    if (this.shot && !this.shot.upper) {
      // a one-shot is on: the new loop waits underneath at no weight (given back when it ends)
      a.setEffectiveWeight(0);
      a.play();
    } else {
      a.setEffectiveWeight(1);
      if (this.base) {
        // A STRIDE STOPS WITH THE BODY (realism round 7): a walk or a run fading out to a standing loop kept
        // striding at full rate (the crossfade's warp even sped it) while the body had stopped — the feet skated
        // the last quarter second of every stop. The outgoing stride holds where it is, and fades.
        const out = this.base, outNat = this.rate(this.baseName), inNat = this.rate(name);
        const stopping = Number.isFinite(outNat) && outNat > 0.15 && !(Number.isFinite(inNat) && inNat > 0.15);
        if (stopping) { out.timeScale = 0; out.fadeOut(0.28); a.fadeIn(0.28).play(); }
        else a.crossFadeFrom(out, 0.28, true).play();
      }
      else a.play();
    }
    if (this.base && this.base !== a && this.shot && !this.shot.upper) this.base.stop();
    this.base = a;
    this.baseName = name;
    if (!this.shot) this.updateHeldVisibility(name);
  }

  /** a ladder's rungs: two a loop, on the climb's own phase (the feet on the floor are heard as they land: lockFeet) */
  private steps(_nat: number): void {
    if (!this.base) return;
    const d = this.base.getClip().duration;
    const ph = ((this.base.time % d) / d) * 2;
    const k = Math.floor(ph);
    if (k !== Math.floor(this.stepPhase)) {
      const p = this.state.pose;
      this.onStep?.(this, p === "crouch-walk" || p === "crouch" ? "sneak" : p === "jog" || p === "sprint" ? "run" : "walk");
    }
    this.stepPhase = ph;
  }

  // ---- the hands ----

  /** the prop or gun in the hand, attached (loaded by Actors) */
  setHeld(id: string | null, obj: THREE.Object3D | null, grip: Grip | null): void {
    if (this.held) this.held.parent?.remove(this.held);
    this.held = obj;
    this.heldId = id;
    this.heldGrip = grip;
    this.hasGun = !!id && GUNS.has(id);
    if (obj) {
      obj.matrixAutoUpdate = false;
      this.root.parent?.add(obj);
    }
    this.updateHeldVisibility(this.shot ? this.shot.a.getClip().name : this.baseName);
  }

  /** whether the held thing belongs on the clip playing (the frame loop ANDs in "is the body drawn") */
  heldWanted = false;
  /** the clip on screen now (a one-shot over the loop, or the loop) */
  get clipNow(): string { return this.shot ? this.shot.a.getClip().name : this.baseName; }
  private updateHeldVisibility(clip: string): void {
    // (the loop under an arms' loop: the hands are the arms' — a pipe held up while the legs walk)
    if (clip === this.baseName && this.armsName) clip = this.armsName;
    this.heldWanted = !!this.held && heldShown(armedOf(this.heldId).armed, clip);
    if (this.held) this.held.visible = this.heldWanted;
  }

  /** how far out the pack rides now: the playing clips' pushes (kit-fit.json), blended by their weights,
   *  so it eases out on its straps as a struggle or a lunge comes in and back as it goes */
  private packOut(pack: PackId): number {
    let w = 0, e = 0;
    for (const [a, n] of [[this.base, this.baseName], [this.shot?.a ?? null, this.shot?.a.getClip().name ?? ""]] as const) {
      if (!a) continue;
      const k = a.getEffectiveWeight();
      w += k; e += k * packPush(this.state.body, pack, n);
    }
    return w > 0 ? e / w : 0;
  }

  /** what they OWN that isn't in the hand now: on the body (Actors.stow loads the objects) */
  stowWanted(): string[] {
    const inv = this.state.vitals?.inv;
    if (this.kind !== "survivor" || !inv) return [];
    const own: string[] = [];
    if (inv.gun && GUN_PROP[inv.gun]) own.push(GUN_PROP[inv.gun]);
    if (inv.melee && MELEE_PROP[inv.melee]) own.push(MELEE_PROP[inv.melee]);
    return own;
  }

  /** the display-only nudge that keeps it out of another body (Actors.separate) */
  readonly sepOff = new THREE.Vector3();
  /** the display-only nudge that puts its hands (or a feeder's mouth) on the body it kneels over (Actors.contacts),
   *  and the way it faces there */
  readonly contactOff = new THREE.Vector3();
  faceTo: number | null = null;
  /** the right hand's frame (anim-recipes.js handRigid): o the wrist, f along the fingers,
   *  p the way the palm faces, u the thumb side */
  hand(o: THREE.Vector3, f: THREE.Vector3, p: THREE.Vector3, u: THREE.Vector3, side: "r" | "l" = "r"): boolean {
    const h = this.bones["hand_" + side], m = this.bones["middle_01_" + side], ix = this.bones["index_01_" + side], pk = this.bones["pinky_01_" + side];
    if (!h || !m || !ix || !pk) return false;
    o.setFromMatrixPosition(h.matrixWorld);
    f.setFromMatrixPosition(m.matrixWorld).sub(o).normalize();
    const across = new THREE.Vector3().setFromMatrixPosition(ix.matrixWorld).sub(tmpV.setFromMatrixPosition(pk.matrixWorld));
    // (anim-recipes.js handRigid: the left hand's palm and thumb side mirror the right's)
    if (side === "r") p.crossVectors(across, f); else p.crossVectors(f, across);
    p.normalize();
    p.addScaledVector(f, -p.dot(f)).normalize();
    if (side === "r") u.crossVectors(f, p); else u.crossVectors(p, f);
    return true;
  }

  /** the hips' world position now */
  hips(out = new THREE.Vector3()): THREE.Vector3 {
    const b = this.bones["hip"] ?? this.bones["root.x"];
    return b ? b.getWorldPosition(out) : out.copy(this.pos).setY(this.pos.y + 0.95);
  }

  /** FEET THAT STAY PUT (realism round 9). Every slide the audit still finds is a planted foot moving: a loop a few
   *  per cent off its ground speed, the root eased apart from a neighbour, a turn under a standing body, an attack
   *  bake that pivots on its feet. So, after everything has moved the body this frame: a foot whose ball is within
   *  FOOT_DOWN_M of its own floor (its lowest, relaxing) is PINNED where it landed, and the leg is bent (lib/ik.ts,
   *  two CCD sweeps) to keep the ball there, the foot's own angle kept. It lets go when the foot lifts past FOOT_UP_M, or when the
   *  body has drifted FOOT_STRETCH_M off it (FOOT_STRETCH_TURN_M turning on the spot — held longer, a planted foot
   *  splayed the legs as the hips came round), fading in over FOOT_IN_S and out over FOOT_OUT_S. Display only;
   *  never a body on the floor, kneeling, in a pair or on a ladder. */
  /** the spine (and the neck, a little) turned back toward the facing: the chest and head look where the sim
   *  says while the legs walk the way the body goes. Each bone turns about the world's up axis — the axis in its
   *  parent's frame is the same before and after the bones under it turn, so the order is free. */
  twistSpine(): void {
    if (!this.body || Math.abs(this.twist) < 1e-3) return;
    if (!this.spine) {
      const names = ["spine_01", "spine_02", "spine_03", "neck"].map((n) => this.boneAt(n) ?? this.boneAt(`${n}.x`) ?? this.boneAt(`${n}x`));
      this.spine = names.filter((b): b is THREE.Object3D => !!b);
    }
    const S = this.spine;
    if (!S.length) return;
    const share = S.length === 4 ? [0.2, 0.2, 0.25, 0.35] : S.map(() => 1 / S.length);
    S.forEach((b, i) => {
      const p = b.parent; if (!p) return;
      p.getWorldQuaternion(TW_Q);
      TW_AX.set(0, 1, 0).applyQuaternion(TW_Q.invert());
      b.quaternion.premultiply(TW_Q2.setFromAxisAngle(TW_AX, this.twist * share[i]));
    });
  }

  /** A GUARD LOOKS (realism round 13, Nov 2026): a survivor on guard — alert, standing, a weapon up — held the
   *  guard loop stock-still for 12-23 s at a time on a live run (the calm idle's fidgets are glances that can't
   *  hold a weapon, so a guard never got one). Now the head and neck follow the nearest of the dead in their room
   *  (or within LOOK_NEAR_M), as far as LOOK_MAX off the chest; with none in sight they scan — a look to one side
   *  every few seconds, held, and back (crouched in hiding too: a hider peeks). Upper spine, neck and head only, over whatever the loop does: the hands
   *  and the weapon don't move. Eased both ways, so starting and stopping a guard never snaps the head. */
  lookAround(dt: number, now: number, dead: Actor[]): void {
    if (!this.body || this.kind !== "survivor") return;
    const s = this.state;
    const guard = !this.dead && !!s.alert && (s.pose === "idle" || s.pose === "fight" || s.pose === "crouch") && this.speed < BAND.move
      && !this.anchor && !this.link && !this.turning && (!this.shot || this.shot.upper);
    let want = 0;
    // (a gun held up looks along its sights: the head may only stray a little off them)
    const arm = armedOf(s.held).armed, most = arm === "pistol" || arm === "rifle" || arm === "shotgun" ? LOOK_GUN : LOOK_MAX;
    if (guard) {
      let best = Infinity, at = 0;
      for (const z of dead) {
        if (z.dead || z.state.pose === "down" || z.state.pose === "dead") continue;
        const dx = z.pos.x - this.pos.x, dz = z.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > LOOK_FAR_M || (d > LOOK_NEAR_M && z.state.room !== s.room) || d >= best) continue;
        best = d;
        at = Math.atan2(dx, dz) - this.heading; at = Math.atan2(Math.sin(at), Math.cos(at));
      }
      // the scan: a seeded pause, then a look one way, held, then back. Watching one of the dead it is a glance
      // round (shorter, half as far, and none while it's close) — a guard stared at one zombie a whole minute
      const watching = best !== Infinity;
      if (now >= this.scanAt) {
        const h = hash2(this.seed, 4_243 + this.scanN++);
        const pause = watching ? GLANCE_PAUSE_MS : SCAN_PAUSE_MS;
        if (this.scanTo) { this.scanTo = 0; this.scanAt = now + pause[0] + (h % 1000) / 1000 * (pause[1] - pause[0]); }
        else { this.scanTo = (h & 1 ? 1 : -1) * (SCAN_RAD[0] + ((h >> 1) % 1000) / 1000 * (SCAN_RAD[1] - SCAN_RAD[0])); this.scanAt = now + SCAN_HOLD_MS[0] + ((h >> 11) % 1000) / 1000 * (SCAN_HOLD_MS[1] - SCAN_HOLD_MS[0]) * (watching ? 0.5 : 1); }
      }
      const off = watching ? (best > GLANCE_NEAR_M ? this.scanTo * 0.5 : 0) : this.scanTo;
      want = Math.max(-most, Math.min(most, (watching ? at : 0) + off));
    } else { this.scanTo = 0; this.scanAt = 0; }
    const d = want - this.gaze, cap = LOOK_RATE * dt;
    this.gaze += Math.max(-cap, Math.min(cap, d * Math.min(1, dt * 6)));
    if (Math.abs(this.gaze) < 1e-3) return;
    if (!this.lookBones) this.lookBones = ["spine_03", "neck", "head"].map((n) => this.boneAt(n) ?? this.boneAt(`${n}.x`) ?? this.boneAt(`${n}x`)).filter((b): b is THREE.Object3D => !!b);
    const B = this.lookBones;
    const share = B.length === 3 ? [0.2, 0.35, 0.45] : B.map(() => 1 / B.length);
    B.forEach((b, i) => {
      const p = b.parent; if (!p) return;
      p.getWorldQuaternion(TW_Q);
      TW_AX.set(0, 1, 0).applyQuaternion(TW_Q.invert());
      b.quaternion.premultiply(TW_Q2.setFromAxisAngle(TW_AX, this.gaze * share[i]));
    });
  }

  /** THE RECOIL of a standing rifle or shotgun shot: the chest kicked back and the muzzle up over RECOIL_RISE_S, a
   *  little to one side, and settling back into the aim over RECOIL_FALL_S — the shoulder takes it, the feet don't move.
   *  The arms and the gun ride the chest (afterPose seats the gun in the hand after this). */
  recoilStep(now: number): void {
    if (!this.body) return;
    const t = (now - this.recoilT) / 1000;
    if (t < 0 || t > RECOIL_RISE_S + RECOIL_FALL_S * 5) return;
    const e = t < RECOIL_RISE_S ? t / RECOIL_RISE_S : Math.exp(-(t - RECOIL_RISE_S) / RECOIL_FALL_S);
    if (e < 1e-3) return;
    if (!this.recoilBones) this.recoilBones = ["spine_02", "spine_03"].map((n) => this.boneAt(n) ?? this.boneAt(`${n}.x`) ?? this.boneAt(`${n}x`)).filter((b): b is THREE.Object3D => !!b);
    const B = this.recoilBones;
    if (!B.length) return;
    // the body's right (forward × up): a turn about it by +θ takes the chest back
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const pitch = this.recoilK * e, yaw = this.recoilK * 0.3 * this.recoilYaw * e;
    B.forEach((b, i) => {
      const p = b.parent; if (!p) return;
      const share = B.length === 2 ? [0.4, 0.6][i] : 1 / B.length;
      p.getWorldQuaternion(TW_Q); TW_Q.invert();
      TW_AX.set(-fz, 0, fx).applyQuaternion(TW_Q);
      b.quaternion.premultiply(TW_Q2.setFromAxisAngle(TW_AX, pitch * share));
      TW_AX.set(0, 1, 0).applyQuaternion(TW_Q);
      b.quaternion.premultiply(TW_Q2.setFromAxisAngle(TW_AX, yaw * share));
    });
  }

  /** why the feet let go, counted (a review hook: a lift is invisible, a stretch on the floor is a snap) */
  readonly lockWhy: Record<string, number> = {};
  private stillT = 0;
  lockFeet(dt: number): void {
    if (!this.body || !this.ready) return;
    if (!this.legs) {
      this.legs = [];
      for (const k of ["l", "r"]) {
        const f = this.boneAt(`foot_${k}`) ?? this.boneAt(`foot.${k}`), c = f?.parent, t = c?.parent;
        const ball = this.boneAt(`ball_${k}`) ?? this.boneAt(`toes_01.${k}`) ?? f;
        if (f && c && t && ball) this.legs.push({ foot: f, ball, calf: c, thigh: t, floor: Infinity, pin: null, at: new THREE.Vector3(), w: 0, stepH: 0, stepS: FOOT_OUT_S, ff: newFoot() });
      }
    }
    const s = this.state;
    if (this.thudUntil) {
      // (armed once the hips have been seen up: a body that was already on the floor makes no second thud)
      const h = this.hips(LOCK_A).y - this.root.position.y;
      if (performance.now() > this.thudUntil) this.thudUntil = 0;
      else if (h > THUD_HIP_M + 0.12) this.thudArmed = true;
      else if (this.thudArmed && h < THUD_HIP_M) { this.thudUntil = 0; this.onThud?.(this); }
    }
    const ok = !this.dead && !this.anchor && !this.link && !this.shot?.hold && !FOOT_FREE.has(s.pose) && this.speed < FOOT_LOCK_MAX_V && (this.kind === "survivor" || s.zkind !== "crawler");
    const ry = this.root.position.y;
    // SETTLING (realism round 12): a body come to a stop with its feet where the last stride planted them stood in a
    // wide, bent-kneed squat — a foot was held until it was FOOT_STRETCH_M off where the standing loop wants it,
    // and a standing loop never lifts a foot. Once still FOOT_SETTLE_S, a foot FOOT_SETTLE_M out steps back under
    const still = ok && this.speed < BAND.still && !this.turning;
    this.stillT = still ? this.stillT + dt : 0;
    const settling = this.stillT > FOOT_SETTLE_S;
    for (const L of this.legs) {
      // (THE BALL OF THE FOOT is what stays put: through a step the ankle rolls forward over it, so the ankle is
      // aimed at the pinned ball plus where the clip has the ankle from the ball this frame)
      const A = L.foot.getWorldPosition(LOCK_A), B = L.ball.getWorldPosition(LOCK_B), h = B.y - ry;
      L.floor = Math.min(h, L.floor + dt * FOOT_FLOOR_RISE);
      // A FOOTSTEP IS A FOOT COMING DOWN (show/footfall.ts): the foot AS DRAWN — after the lock below has pinned it
      // or stepped it — is watched, ball and ankle, and the frame it lands is the sound
      const footfall = (ball: number, ankle: number): void => {
        if (!footStep(L.ff, ball, ankle, dt, this.kind === "zombie" ? FOOT_ZOMBIE : FOOT_SURVIVOR)) return;
        if (!this.onStep || this.dead || this.anchor || this.link || this.shot?.hold || FOOT_FREE.has(s.pose) || this.speed <= BAND.still) return;
        const p = s.pose;
        this.onStep(this, p === "crouch-walk" || p === "crouch" ? "sneak" : p === "jog" || p === "sprint" ? "run" : "walk");
      };
      if (!ok) { if (L.pin) { this.lockWhy.off = (this.lockWhy.off ?? 0) + 1; L.stepH = 0; L.stepS = FOOT_OUT_S; } L.pin = null; }
      else if (L.pin) {
        const lift = h > L.floor + FOOT_UP_M, d = Math.hypot(B.x - L.pin.x, B.z - L.pin.z);
        // (one foot steps at a time: the other waits on the floor until this one is down)
        const other = this.legs.find((o) => o !== L), stepping = !!other && !other.pin && other.w > 0 && other.stepH > 0;
        if (lift || !stepping && d > (this.turning ? FOOT_STRETCH_TURN_M : settling ? FOOT_SETTLE_M : FOOT_STRETCH_M)) {
          const why = lift ? "lift" : this.turning ? "stretchTurn" : "stretch";
          this.lockWhy[why] = (this.lockWhy[why] ?? 0) + 1;
          // (a foot the body has drifted off while it is still on the floor is STEPPED to where the clip has it — up
          // in a little arc and down — never slid there: the slide was a skate of 20 cm in an eighth of a second)
          L.stepH = lift ? 0 : Math.min(FOOT_STEP_H, Math.max(FOOT_STEP_H * 0.4, d * 0.4));
          L.stepS = lift ? FOOT_OUT_S : FOOT_STEP_S;
          L.at.copy(L.pin); L.pin = null;
        }
      } else if (h < L.floor + FOOT_DOWN_M && L.w < 0.05) { L.pin = B.clone(); }
      if (L.pin) { L.w = Math.min(1, L.w + dt / FOOT_IN_S); L.at.copy(L.pin); }
      else L.w = Math.max(0, L.w - dt / L.stepS);
      if (L.w <= 0) { L.stepH = 0; footfall(h, A.y - ry); continue; }
      const up = !L.pin && L.stepH > 0 ? Math.sin(Math.PI * (1 - L.w)) * L.stepH : 0;
      LOCK_T.set(A.x + (L.at.x - B.x) * L.w, A.y + up, A.z + (L.at.z - B.z) * L.w);
      L.foot.getWorldQuaternion(LOCK_Q);
      armIK(L.thigh, L.calf, L.foot, LOCK_T, 1);
      // (the foot keeps the angle the clip gave it: only the leg bends)
      L.calf.updateWorldMatrix(true, false);
      L.calf.getWorldQuaternion(LOCK_PQ);
      L.foot.quaternion.copy(LOCK_PQ.invert().multiply(LOCK_Q));
      L.foot.updateWorldMatrix(false, true);
      footfall(L.ball.getWorldPosition(LOCK_B).y - ry, L.foot.getWorldPosition(LOCK_A).y - ry);
    }
  }

  /** the clip's prop in its hand (stance.ts CLIP_PROPS), or hidden; true when one is shown */
  private placeExtra(cp: ClipProp | undefined, show: boolean, grip?: GunCal["grip"]): boolean {
    let shown = false;
    for (const [id, e] of this.extras) {
      const on = !!cp && show && id === cp.prop && this.hand(tmpO2, tmpF3, tmpP2, tmpU3, cp.side);
      e.obj.visible = on;
      if (!on || !cp) continue;
      shown = true;
      const o = tmpO2, f = tmpF3, p = tmpP2, u = tmpU3;
      // the prop's grip axis onto the hand's axis, its `across` axis onto the hand's second one
      const D = cp.along === "u" ? tmpD.copy(u) : tmpD.copy(f);
      const S = cp.along === "u" ? tmpS.copy(f) : tmpS.copy(p);
      const T = tmpT.crossVectors(D, S);
      const a = tmpA2.set(...cp.axis).normalize(), b = tmpB2.set(...cp.across).normalize(), c = tmpC2.crossVectors(a, b);
      const rot = tmpM3.makeBasis(D, S, T).multiply(tmpM4.makeBasis(a, b, c).transpose());
      const sc = cp.scale ?? [1, 1, 1];
      const ix1 = cp.pinch ? this.bones["index_01_" + cp.side] : undefined, ix2 = cp.pinch ? this.bones["index_02_" + cp.side] : undefined;
      const fr = grip?.[cp.side]?.r, rad = fr != null && fr > 0.004 && fr < 0.03 ? fr : 0.011;   // (a finger's radius, measured off the skin)
      const at = cp.pinch && ix1 && ix2
        ? tmpH2.setFromMatrixPosition(ix1.matrixWorld).lerp(tmpV.setFromMatrixPosition(ix2.matrixWorld), cp.pinch[0]).addScaledVector(u, rad + 0.002).addScaledVector(f, cp.pinch[1]).addScaledVector(p, cp.pinch[2])
        : cp.pt ? tmpH2.copy(o).addScaledVector(f, cp.pt[0]).addScaledVector(p, cp.pt[1]).addScaledVector(u, cp.pt[2])
        : holdPoint(tmpH2, o, f, p, u, grip?.[cp.side], cp.r ?? 0.015);
      if (cp.shift) at.addScaledVector(D, cp.shift);
      // (the prop's own middle — its bounds' centre, scaled — sits on that point)
      const centre = tmpG2.copy(e.centre).multiply(tmpS2.set(sc[0], sc[1], sc[2])).applyMatrix4(rot);
      rot.scale(tmpS2.set(sc[0], sc[1], sc[2]));
      rot.setPosition(at.sub(centre));
      e.obj.matrix.copy(rot);
      e.obj.matrixWorldNeedsUpdate = true;
    }
    if (cp && show && !this.extras.has(cp.prop)) this.wantExtra?.(this, cp.prop);
    return shown;
  }

  /** after the mixer: lay the held thing in the hand, aim the torch, hang the pack and the stowed kit */
  afterPose(cal: GunCal | undefined, holds: Record<string, GunHold>, show: boolean): void {
    this.lens = null;
    const o = tmpO, f = tmpF, p = tmpP, u = tmpU;
    const handOk = this.kind === "survivor" && this.hand(o, f, p, u);
    // a clip with a thing in its hand (a bottle, a syringe…): that thing, and what they hold put away for it
    const extra = this.kind === "survivor" && this.placeExtra(CLIP_PROPS[this.clipNow], show, cal?.grip);
    if (extra && this.held) this.held.visible = false;
    if (this.held && handOk && !extra) {
      if (this.hasGun) {
        // THE GUN'S SEAT (anim-recipes.js gunPose): the body's measured barrel and up, kept in the
        // hand's own frame; the origin in the shooting fist
        const c = this.heldId === "pistol" ? cal?.pistol ?? cal : cal;
        const fist = tmpA.copy(o).addScaledVector(f, 0.07);
        // IN THE HAND'S GRIP CHANNEL, WHERE THE FINGERS CLOSED (Nov 14 2026): every gun clip is baked with the gun
        // seated in front of the palm (anim-hands.js gunSeat — measured per body and gun, cal.json `seats`) and the
        // fingers wrapped round it there. Drawn on the fist's middle, as it was, the grip ran 3-5 cm back through
        // the hand on every body. A body with no measured seat keeps the fist's middle
        const seat = cal?.seats?.[this.heldId!];
        if (seat && seat.length === 3 && seat.every((v) => Number.isFinite(v) && Math.abs(v) <= 0.12)) fist.addScaledVector(f, seat[0]).addScaledVector(p, seat[1]).addScaledVector(u, seat[2]);
        let Z: THREE.Vector3, Y: THREE.Vector3;
        if (c) {
          Z = inHand(f, p, u, c.z, tmpZ); Y = inHand(f, p, u, c.y, tmpY);
          Y.addScaledVector(Z, -Y.dot(Z)).normalize();
          const hold = holds[this.heldId!], ref = holds.hk416?.gripLean;
          if (this.heldId !== "pistol" && hold?.gripLean != null && ref != null && hold.gripLean !== ref) {
            const d = -(hold.gripLean - ref) * (Math.PI / 180);
            const X0 = tmpX.crossVectors(Y, Z).normalize();
            Z.applyAxisAngle(X0, d); Y.applyAxisAngle(X0, d);
          }
        } else {
          Y = tmpY.copy(u); Z = tmpZ.copy(f);
        }
        const X = tmpX.crossVectors(Y, Z).normalize();
        this.gunMatrix.makeBasis(X, Y, Z).setPosition(fist);
        this.held.matrix.copy(this.gunMatrix);
        this.held.matrixWorldNeedsUpdate = true;
      } else if (this.heldGrip) {
        // a hand-held prop by its grip: the fist's line along its grip axis (a flashlight's head
        // points against the thumb, the way the bake holds one), the grip point in the fist
        const g = this.heldGrip;
        const torch = armedOf(this.heldId).armed === "torch";
        const a = tmpA.set(...g.axis).normalize();
        const bLocal = Math.abs(a.y) < 0.9 ? tmpB.set(0, 1, 0) : tmpB.set(0, 0, 1);
        bLocal.addScaledVector(a, -bLocal.dot(a)).normalize();
        const cLocal = tmpC.crossVectors(a, bLocal);
        const U = tmpU2.copy(u).multiplyScalar(torch ? -1 : 1);
        const W = tmpW.crossVectors(U, f);
        const local = tmpM.makeBasis(a, bLocal, cLocal);
        const world = tmpM2.makeBasis(U, f, W);
        const rot = world.multiply(local.transpose());
        const H = holdPoint(tmpH, o, f, p, u, cal?.grip?.r, holdRadius(this.heldId));
        const at = tmpG.set(...g.at).applyMatrix4(rot);
        rot.setPosition(H.sub(at));
        this.held.matrix.copy(rot);
        this.held.matrixWorldNeedsUpdate = true;
        if (torch && this.held.visible) {
          const head = tmpL.copy(holdPoint(tmpH, o, f, p, u, cal?.grip?.r, holdRadius(this.heldId))).addScaledVector(U, 0.14);
          this.lens = { pos: head.clone(), dir: U.clone() };
        }
      }
    }
    if (this.kind === "survivor" && this.state.torch && !this.lens) {
      // a torch on with nothing to hold it in: clipped to the chest strap, pointing ahead and down
      const c = this.chest(tmpL);
      const fw = this.forward(tmpF2);
      this.lens = { pos: c.clone().addScaledVector(fw, 0.18), dir: fw.clone().setY(-0.18).normalize() };
    }
    // THE PACK: on the back by its measured fit, off for the clips a body lies or sits back on it
    const clip = this.clipNow;
    if (this.pack) {
      const on = show && !packOff(clip) && packMatrix(this.state.body, this.pack.id as PackId, this.boneAt, this.pack.obj.matrix, this.packOut(this.pack.id as PackId));
      this.pack.obj.visible = on;
      if (on) this.pack.obj.matrixWorldNeedsUpdate = true;
    }
    // THE STOWED KIT: whatever they own and aren't holding — off when the pack is (lying, sitting)
    const packed = this.pack && this.pack.obj.visible ? (this.pack.id as PackId) : null;
    for (const [id, obj] of this.stowed) {
      const inHand = this.heldId === id && this.heldWanted;
      const on = show && !inHand && !packOff(clip) && stowMatrix(this.state.body, stowSlot(id, packed), this.boneAt, obj.matrix);
      obj.visible = on;
      if (on) obj.matrixWorldNeedsUpdate = true;
    }
  }
}

/** a bone by its rig name, whatever the file did to it: three strips the dots from a name (the
 *  zombies' "foot.l" loads as "footl"), and three of the scanned bodies carry their scan's prefix
 *  ("rp_nathan_animated_003_walking_foot_l") */
export function findBoneLike(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  const clean = THREE.PropertyBinding.sanitizeNodeName(name);
  // A BONE BY ITS OWN NAME FIRST (Nov 14 2026, measured: soldier-blue's mesh group is "Soldier_head", met before the
  // bone "head" — its head read as lying at the origin): the exact name before a name that only ends in it, and a
  // bone before anything else.
  let best: THREE.Object3D | undefined, rank = 9;
  root.traverse((o) => {
    const exact = o.name === name || o.name === clean;
    if (!exact && !o.name.endsWith(`_${clean}`)) return;
    const r = (exact ? 0 : 2) + ((o as THREE.Bone).isBone ? 0 : 1);
    if (r < rank) { rank = r; best = o; }
  });
  return best;
}

const inHand = (f: THREE.Vector3, p: THREE.Vector3, u: THREE.Vector3, v: number[], out: THREE.Vector3) =>
  out.copy(f).multiplyScalar(v[0]).addScaledVector(p, v[1]).addScaledVector(u, v[2]).normalize();

const tmpV = new THREE.Vector3(), tmpO = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpU = new THREE.Vector3();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpX = new THREE.Vector3(), tmpY = new THREE.Vector3(), tmpZ = new THREE.Vector3();
const tmpU2 = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpH = new THREE.Vector3(), tmpG = new THREE.Vector3(), tmpL = new THREE.Vector3(), tmpF2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4();
const tmpO2 = new THREE.Vector3(), tmpF3 = new THREE.Vector3(), tmpP2 = new THREE.Vector3(), tmpU3 = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpT = new THREE.Vector3();
const tmpA2 = new THREE.Vector3(), tmpB2 = new THREE.Vector3(), tmpC2 = new THREE.Vector3(), tmpH2 = new THREE.Vector3(), tmpG2 = new THREE.Vector3(), tmpS2 = new THREE.Vector3();
const tmpM3 = new THREE.Matrix4(), tmpM4 = new THREE.Matrix4();

// (one hashId for the show and the sim: the sim predicts which death clip a body lies in — sim/lie.ts)
export { hashId } from "../../../../src/survivorz/sim/lie";

// ---- the cast ------------------------------------------------------------------------------------

/** the one-shots that may play on the upper body alone while the body moves (never a death, a fall, getting
 *  up or lying down, a stomp — the legs are the move — or a pair's half, which is anchored) */
const LAYER_KINDS = new Set<OneShot>(["swing.light", "swing.heavy", "stab", "shoot", "reload", "hit", "hit.head", "can", "door", "cough", "inject", "open-box", "sink", "attack", "zhit"]);
/** an upper-body action's weight over the loop on the bones they share (the mixer averages by weight: 95%) */
const UPPER_W = 20;
/** a standing shot's kick (radians at its peak: ~4° a rifle, ~9° a shotgun), up in RECOIL_RISE_S, settling over RECOIL_FALL_S */
const RECOIL_RIFLE = 0.07, RECOIL_SHOTGUN = 0.16, RECOIL_RISE_S = 0.035, RECOIL_FALL_S = 0.09;
/** bodies drawn closer than this are eased apart (m, between roots; survivors — a zombie and anyone 5 cm less) */
const SEP_M = 0.52, HIP_EASE_S = 0.8;
/** a planted foot let go on the floor is stepped over FOOT_STEP_S, lifted at most FOOT_STEP_H (m) */
const FOOT_STEP_S = 0.2, FOOT_STEP_H = 0.07, FOOT_SETTLE_S = 0.35, FOOT_SETTLE_M = 0.06;
/** a falling body's hips this near the floor have landed */
const THUD_HIP_M = 0.4;
const FOOT_DOWN_M = 0.025, FOOT_UP_M = 0.045, FOOT_STRETCH_M = 0.2, FOOT_STRETCH_TURN_M = 0.08, FOOT_IN_S = 0.08, FOOT_OUT_S = 0.12, FOOT_FLOOR_RISE = 0.05, FOOT_LOCK_MAX_V = 3.0;
/** poses whose feet the lock leaves alone: on the floor, kneeling, held, crawling */
const FOOT_FREE = new Set<string>(["down", "dead", "sleep", "sit", "grabbed", "revive", "z-feed", "z-crawl", "z-dead"]);
const LOCK_A = new THREE.Vector3(), LOCK_B = new THREE.Vector3(), LOCK_T = new THREE.Vector3(), LOCK_Q = new THREE.Quaternion(), LOCK_PQ = new THREE.Quaternion();
/** how fast the nudge moves, m/s */
const SEP_EASE = 1.2, SEP_PASSES = 4;
const ZERO3 = new THREE.Vector3();
/** the fastest a drawn body turns, rad/s (a half-turn in about half a second) */
const TURN_MAX = 6.5;
/** TURNING ON THE SPOT (realism round 9): a standing body that turned spun on its heels — a zombie came round
 *  180° in half a second with its feet still, 38 times in 200 s of show. Now a turn of more than TURN_STEP_RAD
 *  steps, and the turn goes at a body's pace, TURN_STAND rad/s, until it's within TURN_STEP_DONE. The steps are the
 *  foot lock's (round 12): the standing loop plays on, each planted foot holds until the turn has carried it
 *  FOOT_STRETCH_TURN_M off and then steps round, one foot at a time. (Round 9 played the walk loop slowly under the
 *  turn — TURN_STEP_V 0.45 — and the walk's own stride dragged the planted feet; a knife-holder's fight stance
 *  became an unarmed walk for the length of the turn.) Only in the poses that stand on their feet and would walk
 *  (TURN_POSES) — never a worker at a bench, a sleeper, a pair or a body mid-action. */
/** MOVING OFF THE WAY IT FACES: the motion is smoothed over MOVE_DIR_S and read only past MOVE_DIR_V; backing away
 *  starts past BACK_IN off the facing and ends under BACK_OUT; the spine turns at most TWIST_MAX; the legs swing
 *  round at most LEGS_RATE */
const OFF_LO = 0.5, OFF_HI = 0.85, MOVE_DIR_S = 0.25, MOVE_DIR_V = 0.3, BACK_IN = 1.92, BACK_OUT = 1.4, TWIST_MAX = 1.13, LEGS_RATE = 7;
const TW_Q = new THREE.Quaternion(), TW_Q2 = new THREE.Quaternion(), TW_AX = new THREE.Vector3();
/** the guard's look (Actor.lookAround): how far the head turns off the chest, how fast, whom it watches */
const LOOK_MAX = 1.15, LOOK_GUN = 0.35, LOOK_RATE = 3.2, LOOK_NEAR_M = 6, LOOK_FAR_M = 14;
const SCAN_RAD: [number, number] = [0.45, 0.85], SCAN_HOLD_MS: [number, number] = [900, 2_200], SCAN_PAUSE_MS: [number, number] = [2_500, 6_000];
const GLANCE_PAUSE_MS: [number, number] = [5_000, 10_000], GLANCE_NEAR_M = 3.5;
const TURN_STEP_RAD = { survivor: 1.0, zombie: 0.5 } as const, TURN_STEP_DONE = 0.12, TURN_STEP_V = 0, TURN_STEP_RATE = 1.8;
/** (the sim turns a body round at up to 7 rad/s, and sets off once it faces the way; turning slower than it, the
 *  drawn body was still half way round when it set off — realism round 11) */
const TURN_STAND = { survivor: 5.0, zombie: 3.2 } as const;
/** a back-step needs the sim's own facing this far off the motion too (rad): in, and to keep backing */
const BACK_WIRE_IN = 1.4, BACK_WIRE_OUT = 1.0;
const TURN_POSES = new Set<string>(["idle", "walk", "jog", "sprint", "crouch", "crouch-walk", "z-idle", "z-wander", "z-chase", "z-attack"]);
/** the revive's two hands from the kneeler's root (along, side — measured off the clip; a feeder's mouth is sim/lie.ts) */
const CPR_HANDS: [number, number] = [0.38, 0.0];   // (ual1-fixing-kneeling's two hands, measured)
/** a kneeler looks for the body this far off; is moved at most this far; at this pace (m/s) */
const CONTACT_FIND_M = 1.8, CONTACT_MAX_M = 0.45, CONTACT_EASE = 1.0;
/** a body on the floor whose head is this far over it is sitting up (propped on its hands), not lying */
const PROPPED_HEAD_M = 0.5;

export class Actors {
  readonly list = new Map<string, Actor>();
  private srcs = new LoadCache<BodySrc>();
  /** which survivor bodies each zombie has extra halves for (a creator body's grabs and bites) */
  private pairClips: Record<string, string[]> = {};
  /** the creator bodies' pair table, laid into the bundled one (show/pairs.ts addPairs); bodies wait for it */
  private pairsReady: Promise<void> = assetJson<Parameters<typeof addPairs>[0] & { clips?: Record<string, string[]> }>("pairs", "pairs.json")
    .then((t) => { addPairs(t); this.pairClips = t?.clips ?? {}; })
    .catch(() => {});
  private propSrc = new LoadCache<THREE.Object3D>();
  private nextCorpses = 0;
  private grips: Record<string, { grip?: Grip }> = {};
  private cal: Record<string, GunCal> = {};
  private holds: Record<string, GunHold> = {};
  private disposed = false;
  onStep: ((a: Actor, pace: "walk" | "run" | "sneak") => void) | null = null;
  onThud: ((a: Actor) => void) | null = null;
  /** compile a thing's programs ahead (the scene's renderer, for its composer's target) */
  compile: ((o: THREE.Object3D) => Promise<unknown>) | null = null;
  /** told when a body has its model (the scene re-checks its torches and its cull) */
  onReady: (a: Actor) => void = () => {};
  /** told when a body's pose changes on the wire (the scene's sounds for the work: a bandage, a drink) */
  onPose: ((a: Actor, from: string, to: string) => void) | null = null;

  constructor(private scene: THREE.Scene, private fx: FxSystem) {}

  async init(): Promise<void> {
    const [grips, cal, holds] = await Promise.all([
      assetJson<Record<string, { grip?: Grip }>>("propinfo", "props.json").catch(() => ({})),
      assetJson<Record<string, GunCal>>("gun", "cal.json").catch(() => ({})),
      assetJson<Record<string, GunHold>>("gun", "guns.json").catch(() => ({})),
      this.pairsReady,
      assetJson<Record<string, Record<string, number>>>("body", "loopspeed.json").then(setLoopSpeeds).catch(() => {}),
      assetJson<Partial<KitFit>>("body", "kitfit.json").then(addKitFit).catch(() => {}),
    ]);
    this.grips = grips; this.cal = cal; this.holds = holds;
    // THE PACKS AND THE KIT, LOADED AND COMPILED AT THE START (a pack first drawn mid-show would build its
    // programs on the spot — the gun did, 400 ms): one of each, off-stage
    for (const id of ["backpack-small", "backpack-large", "pistol", "hk416", "crowbar", "lead-pipe", "claw-hammer", "chef-knife", "fire-axe-a"]) {
      void this.propObj(id).then((o) => (o ? this.compile?.(o) : null)).catch(() => {});
    }
  }

  get(id: string): Actor | undefined { return this.list.get(id); }

  private body(file: string, priority = 2): Promise<BodySrc> {
    // (a failed load is retried after a backoff, show/retry.ts — a 502 during a deploy used to leave
    // every body of that model invisible until the page reloaded)
    // (a big file: it takes its turn among the big downloads, a survivor's before the dead's — assetcache.ts)
    return this.srcs.get(file, () => loadGlb(assetUrl("body", `${file}.glb`), undefined, priority).then(async (gltf: GLTF) => {
        tameGlbTransparency(gltf.scene);
        const scratch = cloneSkinned(gltf.scene);
        const L = (n: string) => findBoneLike(scratch, n) ?? findBoneLike(scratch, n.replace("_", "."));
        const feet = [L("foot_l"), L("foot_r")], hands = [L("hand_l"), L("hand_r")];
        const balls = [L("ball_l") ?? L("toes_01.l"), L("ball_r") ?? L("toes_01.r")];
        // ONLY THE CLIPS THE TABLE CAN ASK FOR are kept: a survivor's file carries ~770 (the whole
        // bake, for the bench), the show uses ~100, and every clip's keyframes are tens of KB of JS
        // heap. Holding them all (and the loader's own cache of them, `gltf.parser`) put the page
        // past 3 GB with the cast in; the gltf object is let go for the same reason.
        const keep = gltf.animations.filter((c) => keepClip(c.name));
        // ...and each kept track's keyframes COPIED out: the loader hands back views into the file's
        // whole decoded animation buffer, so one kept clip pinned all ~770 clips' worth (352 MB
        // across the cast, measured) in memory
        for (const c of keep) for (const t of c.tracks) { t.times = t.times.slice(); t.values = t.values.slice(); }
        // A ZOMBIE'S HALVES AGAINST A CREATOR BODY (Nov 4 2026) come in small skeleton-only files beside it
        // (scripts/survivorz/pack-pairclips.mjs): their tracks name this zombie's own nodes, so they join its
        // clips as they are. One that won't load just leaves that pair unplayed (pairs.ts canPlay).
        if (file.startsWith("zombie-")) {
          await this.pairsReady;
          for (const s of this.pairClips[file] ?? []) {
            const g = await loadGlb(assetUrl("pairclip", `${s}~${file}.glb`), undefined, priority).catch(() => null);
            for (const c of g?.animations ?? []) {
              if (!keepClip(c.name)) continue;
              for (const t of c.tracks) { t.times = t.times.slice(); t.values = t.values.slice(); }
              keep.push(c);
            }
          }
        }
        return {
          body: file, scene: gltf.scene, clips: new Map(keep.map((c) => [c.name, c])), speed: new Map(), scratch,
          feet: feet[0] && feet[1] ? [feet[0], feet[1]] : null, hands: hands[0] && hands[1] ? [hands[0], hands[1]] : null,
          balls: balls[0] && balls[1] ? [balls[0], balls[1]] : null,
          mixer: new THREE.AnimationMixer(scratch),
        } satisfies BodySrc;
      }));
  }

  /** a body on the wire: make it (or bring it up to date) */
  spawn(s: BodyState): Actor {
    let a = this.list.get(s.id);
    // (the same id as a DIFFERENT body — a new run's `z:5` is somebody else — is a new actor: the old
    // one's model, clips and cuts must not walk the new run)
    if (a && (a.state.body !== s.body || a.state.kind !== s.kind || a.state.zkind !== s.zkind || !!a.state.turned !== !!s.turned)) { this.gone(s.id); a = undefined; }
    if (a) { this.state(a, s); return a; }
    a = new Actor(s);
    a.onStep = (x, pace) => this.onStep?.(x, pace);
    a.onThud = (x) => this.onThud?.(x);
    a.wantExtra = (x, id) => void this.clipProp(x, id);
    a.link = s.link ?? null;
    this.list.set(s.id, a);
    this.scene.add(a.root);
    void this.dress(a);
    return a;
  }

  private async dress(a: Actor): Promise<void> {
    const src = await this.body(a.state.body, a.kind === "survivor" ? 1 : 2).catch((e) => { console.warn(`[survivorz] body ${a.state.body} failed`, e); return null; });
    if (this.disposed || this.list.get(a.id) !== a) return;
    if (!src) {
      // tried again after the backoff (still the same actor, still body-less)
      a.dressFails++;
      setTimeout(() => { if (!this.disposed && this.list.get(a.id) === a && !a.body) void this.dress(a); }, Math.max(this.srcs.waitFor(a.state.body), retryWait(a.dressFails)) + 50);
      return;
    }
    a.dressFails = 0;
    const body = cloneSkinned(src.scene);
    body.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      // the person inside a suit is never drawn (SURVIVORZ.md "THE PERSON INSIDE": Rollo)
      if (/body_proxy/.test(m.name)) { m.visible = false; return; }
      m.castShadow = true;
      m.receiveShadow = false;
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) tameBodyMaterial(x);
    });
    a.body = body;
    a.src = src;
    // (dressed DETACHED: in the scene, the frame loop would draw it with its file's own material
    // before its look and its compile were done — and build that program on the spot)
    a.mixer = new THREE.AnimationMixer(body);
    a.findBones();
    // the first pose, then the bounds a frustum test can use (a skinned body's are its rest pose's;
    // widened so a reach or a fall stays inside)
    const first = a.chooseBase();
    a.update(0, -Infinity, performance.now());
    if (first) a.update(0.016, -Infinity, performance.now());
    a.root.updateMatrixWorld(true);
    body.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.computeBoundingSphere();
      if (m.boundingSphere) m.boundingSphere.radius *= 1.6;
      m.frustumCulled = true;
    });
    try {
      if (a.kind === "survivor" || a.state.turned) {
        // (a TURNED survivor is one of the dead in their own body and clothes, §5: their own look,
        // greyed by the turn — the zombie pack's cut look is built for the pack's meshes, not a scan)
        a.look = await within(this.fx.body(body, a.state.body), LOOK_MS, `look ${a.id}`);
        a.look.set(a.state.turned ? { grime: 0.55, sweat: 0, infection: 1, turned: 1 } : { grime: 0.25, sweat: 0.15 });
        await within(Promise.resolve(this.compile?.(body)), LOOK_MS, `compile ${a.id}`);
      } else {
        a.cut = await within(this.fx.cuttable(body), LOOK_MS, `cut ${a.id}`);
        a.cut.kind = "zombie";
        a.cut.ref = { id: a.id, model: a.state.body };
        const { scale } = a.cut.look.variety(a.seed, a.state.zkind === "experiment" ? "experiment" : "outside");
        body.scale.setScalar(scale);
        // the cut materials' SKINNED programs (the effects compile only a cut piece's static ones):
        // a zombie first walking into view built them on the spot, seconds of freeze (measured)
        await within(Promise.resolve(this.compile?.(body)), LOOK_MS, `compile ${a.id}`);
      }
    } catch (e) {
      console.warn(`[survivorz] look for ${a.id} failed`, e);
    }
    if (this.disposed || this.list.get(a.id) !== a) return;
    a.root.add(body);
    a.ready = true;
    // THE TURN: one of the dead that was one of the cast, getting up where they fell (asked for by the
    // event before this body was dressed) — posed on the floor before its first frame is drawn
    if (a.risePending) { a.turnRise(...a.risePending); a.mixer.update(0); }
    if (a.state.held) void this.hold(a, a.state.held);
    void this.wear(a);
    if (a.state.pose === "dead" || a.state.pose === "z-dead") a.play("death", { instant: true });
    this.onReady(a);
  }

  /** the wire's full state for a body (a snapshot, a spawn) */
  state(a: Actor, s: BodyState): void {
    // (a snapshot is a reset: no pair, forced loop or held-back death carries over)
    a.setAnchor(null, 0, 0); a.setForced(null); a.deathAt = 0; a.limp = false;
    a.link = s.link ?? null;
    const heldChanged = (s.held ?? null) !== (a.state.held ?? null);
    const wasDead = a.state.pose === "dead" || a.state.pose === "z-dead";
    a.state = { ...a.state, ...s };
    a.teleport(s.pos, s.heading);
    if (heldChanged && a.ready) void this.hold(a, s.held ?? null);
    if (a.ready) void this.wear(a);
    if (!wasDead && (s.pose === "dead" || s.pose === "z-dead")) a.play("death", { instant: true });
    else if (wasDead && s.pose !== "dead" && s.pose !== "z-dead") a.rise();
  }

  /** a tick's entry: the place at show time t, and whatever changed */
  tick(b: TickBody, t: number): void {
    const a = this.list.get(b.id);
    if (!a) return;
    a.push(t, b.p, b.h);
    const s = a.state;
    if (b.hp !== undefined) s.hp = b.hp;
    if (b.room !== undefined) s.room = b.room;
    if (b.why !== undefined) s.why = b.why;
    if (b.torch !== undefined) s.torch = b.torch;
    if (b.alert !== undefined) s.alert = b.alert;
    let kit = false;
    if (b.vitals) {
      const was = s.vitals?.inv, now = b.vitals.inv;
      kit = was?.gun !== now?.gun || was?.melee !== now?.melee || was?.pack !== now?.pack;
      // THE DRESSING SHOWS (Oct 31 2026): bleeding stopped by a bandage or a medkit (the sim clears it when
      // the work is done) — the newest wound gets the bandage (fx/body.ts), off-white over it
      if ((s.vitals?.bleeding ?? 0) > 0 && b.vitals.bleeding === 0 && a.look) a.look.bandage(undefined, 0.08);
      s.vitals = b.vitals;
    }
    if (b.pack !== undefined && (b.pack ?? null) !== (s.pack ?? null)) { s.pack = b.pack; kit = true; }
    if (b.held !== undefined && (b.held ?? null) !== (s.held ?? null)) {
      s.held = b.held;
      if (a.ready) void this.hold(a, b.held);
    }
    if (kit && a.ready) void this.wear(a);
    if (b.pose !== undefined && b.pose !== s.pose) {
      const from = s.pose;
      s.pose = b.pose;
      a.poseChanged(from, b.pose);
      this.onPose?.(a, from, b.pose);
    }
    if (b.link !== undefined) a.link = b.link ?? null;
    s.pos = b.p; s.heading = b.h;
  }

  /** a prop or gun's source, loaded once (its pixels and arrays leave JS once uploaded) */
  private propObj(id: string): Promise<THREE.Object3D | null> {
    const p = this.propSrc.get(id, () => loadGlb(GUNS.has(id) ? assetUrl("gun", `${id}.glb`) : assetUrl("prop", `${id}.glb`), undefined, 1).then((g) => {
        tameGlbTransparency(g.scene);
        g.scene.updateMatrixWorld(true);
        // the big pack's hip belt, cut off (kit.ts PACK_TRIM) — read in the pack's own space, before the
        // arrays leave JS
        if (id === "backpack-small" || id === "backpack-large") {
          g.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const geo = m.geometry, P = geo.attributes.position, v = new THREE.Vector3();
            const keep = trimIndex(id, (i) => v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld).toArray() as [number, number, number], geo.index ? geo.index.array : null, geo.index ? geo.index.count : P.count);
            if (keep) geo.setIndex(keep);
          });
        }
        // its middle, in its own space (a clip prop is seated by it), measured before the arrays go
        g.scene.userData.centre = new THREE.Box3().setFromObject(g.scene).getCenter(new THREE.Vector3());
        // (a held thing is never raycast or edited: its pixels and arrays leave JS once uploaded)
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
          releaseGeometry(m.geometry);
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) for (const v of Object.values(mat)) if (v instanceof THREE.Texture) releaseTexture(v);
        });
        return g.scene;
      }));
    return p.catch(() => null);
  }

  /** run `fn` once a failed prop's backoff is over (show/retry.ts) */
  private later(id: string, key: string, fn: () => void): void {
    // (one retry in flight per key: a wear that fails three props must not schedule three wears,
    // each scheduling three more)
    if (this.retrying.has(key)) return;
    this.retrying.add(key);
    setTimeout(() => { this.retrying.delete(key); if (!this.disposed) fn(); }, this.propSrc.waitFor(id) + 50);
  }
  private retrying = new Set<string>();

  /** a fresh copy of a prop for one body, its programs built before it's seen */
  private async propCopy(id: string): Promise<THREE.Object3D | null> {
    const src = await this.propObj(id);
    if (!src || this.disposed) return null;
    const obj = cloneSkinned(src);
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
    obj.matrixAutoUpdate = false;
    // (a gun first drawn compiled on the spot: 400 ms, measured)
    await this.compile?.(obj).catch(() => {});
    return obj;
  }

  /** a clip's prop for one body (stance.ts CLIP_PROPS), loaded once and kept (hidden off its clip) */
  private loadingExtra = new Set<string>();
  private async clipProp(a: Actor, id: string): Promise<void> {
    const key = `${a.id}|${id}`;
    if (this.loadingExtra.has(key) || a.extras.has(id)) return;
    this.loadingExtra.add(key);
    const src = await this.propObj(id);
    const obj = src ? await this.propCopy(id) : null;
    this.loadingExtra.delete(key);
    if (!obj || !src || this.disposed || this.list.get(a.id) !== a || a.extras.has(id)) return;
    obj.visible = false;
    this.scene.add(obj);
    a.extras.set(id, { obj, centre: (src.userData.centre as THREE.Vector3 | undefined)?.clone() ?? new THREE.Vector3() });
  }

  /** put a thing in a survivor's hand (a gun by its seat, a prop by its grip) */
  private async hold(a: Actor, id: string | null): Promise<void> {
    if (!id) { a.setHeld(null, null, null); return; }
    const obj = await this.propCopy(id);
    if (this.disposed || (a.state.held ?? null) !== id || this.list.get(a.id) !== a) return;
    // (its file failed: tried again once the backoff allows, while it's still what they hold)
    if (!obj) { this.later(id, `hold:${a.id}`, () => { if ((a.state.held ?? null) === id && a.heldId !== id) void this.hold(a, id); }); return; }
    a.setHeld(id, obj, GUNS.has(id) ? null : this.grips[id]?.grip ?? { how: "middle", at: [0, 0, 0], axis: [0, 1, 0] });
  }

  /** the pack on the back and the kit stowed on the body, brought up to what the wire says they own */
  private wear(a: Actor): Promise<void> {
    if (a.kind !== "survivor") return Promise.resolve();
    return (a.kitChain = a.kitChain.then(() => this.wearNow(a)).catch(() => {}));
  }
  private async wearNow(a: Actor): Promise<void> {
    // (the pack the wire says they wear — `pack: null` is "took it off", absent is "ask the pockets" — and
    // only on a body with a measured fit: Rollo wears none, his suit's air pack is on his back)
    const packNow = (): PackId | null => {
      const p = (a.state.pack !== undefined ? a.state.pack : a.state.vitals?.inv?.pack ?? null) as PackId | null;
      return p && packMatrixFits(a.state.body, p) ? p : null;
    };
    const packId = packNow();
    if ((a.pack?.id ?? null) !== packId) {
      if (a.pack) { a.pack.obj.parent?.remove(a.pack.obj); a.pack = null; }
      if (packId) {
        const obj = await this.propCopy(packId);
        if (!obj) this.later(packId, `wear:${a.id}`, () => { if (this.list.get(a.id) === a) void this.wear(a); });
        if (obj && this.list.get(a.id) === a && packNow() === packId && !a.pack) {
          obj.visible = false;
          this.scene.add(obj);
          a.pack = { id: packId, obj };
        }
      }
    }
    const want = new Set(a.stowWanted());
    for (const [id, obj] of a.stowed) if (!want.has(id)) { obj.parent?.remove(obj); a.stowed.delete(id); }
    for (const id of want) {
      if (a.stowed.has(id)) continue;
      const obj = await this.propCopy(id);
      if (!obj) { this.later(id, `wear:${a.id}`, () => { if (this.list.get(a.id) === a) void this.wear(a); }); continue; }
      if (this.list.get(a.id) !== a || a.stowed.has(id) || !a.stowWanted().includes(id)) continue;
      obj.visible = false;
      this.scene.add(obj);
      a.stowed.set(id, obj);
    }
  }

  gone(id: string): void {
    const a = this.list.get(id);
    if (!a) return;
    this.list.delete(id);
    a.setHeld(null, null, null);
    for (const e of a.extras.values()) e.obj.parent?.remove(e.obj);
    a.extras.clear();
    if (a.pack) a.pack.obj.parent?.remove(a.pack.obj);
    for (const o of a.stowed.values()) o.parent?.remove(o);
    a.stowed.clear();
    this.scene.remove(a.root);
    if (a.look) this.fx.dropBody(a.look);
    a.mixer?.stopAllAction();
    if (a.body) a.mixer?.uncacheRoot(a.body);
    freeBody(a);
  }

  /** THE CORPSE BUDGET (the dead's, not the survivors' — there are only ever a handful of those): the
   *  newest settled corpses are drawn — CORPSES_PER_ROOM a room and
   *  CORPSES_DRAWN in all — and the older ones hidden (a room fought in for days filled with bodies,
   *  each a skinned draw). Re-read twice a second, not every frame. */
  private corpses(now: number): void {
    if (now < this.nextCorpses) return;
    this.nextCorpses = now + CORPSE_EVERY_MS;
    const dead: Actor[] = [];
    for (const a of this.list.values()) { a.corpseHidden = false; if (a.ready && a.kind === "zombie" && a.settled(now)) dead.push(a); }
    for (const a of corpsesOverBudget(dead.map((x) => ({ a: x, room: x.state.room ?? "", at: x.settleAt })), CORPSES_PER_ROOM, CORPSES_DRAWN)) a.a.corpseHidden = true;
  }

  /** every frame */
  update(dt: number, t: number, cam: THREE.Vector3, near: (a: Actor) => boolean): void {
    const now = performance.now();
    this.corpses(now);
    const posed: Actor[] = [];
    for (const a of this.list.values()) {
      if (!a.body || !a.ready) continue;
      // a body far from the camera (or in a zone that isn't loaded) isn't drawn or animated — nor a
      // corpse past the room's budget
      const show = !a.corpseHidden && near(a);
      a.root.visible = show;
      if (a.held) a.held.visible = a.heldWanted && show;
      if (!show) {
        a.finishUnseen(now);
        a.sample(t, a.pos); a.root.position.copy(a.pos);
        for (const e of a.extras.values()) e.obj.visible = false;
        if (a.pack) a.pack.obj.visible = false;
        for (const o of a.stowed.values()) o.visible = false;
        continue;
      }
      // SETTLED: the death has played out — the mixer stops and the shadows go (a corpse costs its
      // draw and nothing else); it still sits where the wire says
      if (a.kind === "zombie" && a.settled(now)) {
        a.castShadows(false);
        a.sample(t, a.pos); a.root.position.copy(a.pos);
        continue;
      }
      a.update(dt, t, now);
      posed.push(a);
    }
    this.contacts(posed, dt);
    this.separate(posed, dt);
    const deadOnes = posed.filter((x) => x.kind === "zombie");
    for (const a of posed) {
      a.root.updateMatrixWorld(true);
      a.twistSpine();
      a.lookAround(dt, now, deadOnes);
      a.recoilStep(now);
      a.root.updateMatrixWorld(true);
      a.lockFeet(dt);
      a.afterPose(this.cal[a.state.body], this.holds, true);
    }
    void cam;
  }

  /** HANDS ON THE BODY (realism round 6, Nov 2026): the sim says who kneels over whom — a friend giving CPR,
   *  the dead feeding — but it can't know how the body on the floor lies: a fall's last frame held (curled on
   *  its side, the chest half a metre to one side of the root) or the lying loop (straight, the head 0.68 m
   *  behind it). So the kneeler is placed here, off the real bones: side-on to the torso, the CPR's hands on the
   *  chest, a feeder's mouth on the chest, the hips or the legs (one place each, alternating sides). Display
   *  only, never more than CONTACT_MAX_M from where the sim has them, only onto walkable floor, eased. */
  /** the contact pass's tally (a review hook: what it placed, and why it didn't) */
  readonly contactWhy: Record<string, number> = {};
  private contacts(list: Actor[], dt: number): void {
    const geo = showGeo();
    const want = new Map<Actor, { x: number; z: number; h: number }>();
    const floored = list.filter((a) => a.kind === "survivor" && (a.state.pose === "down" || a.dead) || a.kind === "zombie" && a.dead && !a.corpseHidden);
    const near = (a: Actor, pred: (b: Actor) => boolean): Actor | null => {
      let best: Actor | null = null, bd = CONTACT_FIND_M * CONTACT_FIND_M;
      for (const b of floored) { if (b === a || !pred(b)) continue; const d = (b.pos.x - a.pos.x) ** 2 + (b.pos.z - a.pos.z) ** 2; if (d < bd) { bd = d; best = b; } }
      return best;
    };
    const axis = (b: Actor) => {
      const hp = b.hips(new THREE.Vector3()), hd = b.headPos(new THREE.Vector3());
      let ux = hd.x - hp.x, uz = hd.z - hp.z; const L = Math.hypot(ux, uz);
      if (L < 0.12) { ux = -Math.sin(b.heading); uz = -Math.cos(b.heading); } else { ux /= L; uz /= L; }
      return { hp, ux, uz, chest: b.chest(new THREE.Vector3()) };
    };
    // where a kneeler's root goes so its contact point (local along, side) lands on P, side-on to the body
    const kneel = (a: Actor, P: THREE.Vector3, ux: number, uz: number, local: [number, number], sideHint: number) => {
      const nx = uz, nz = -ux;   // the body's normal
      const sgn = sideHint !== 0 ? Math.sign(sideHint) : Math.sign((a.pos.x - P.x) * nx + (a.pos.z - P.z) * nz) || 1;
      const fx = -sgn * nx, fz = -sgn * nz;   // facing the body
      const h = Math.atan2(fx, fz);
      // side unit (the measure's convention): (cos h, -sin h)
      const sx = Math.cos(h), sz = -Math.sin(h);
      return { x: P.x - fx * local[0] - sx * local[1], z: P.z - fz * local[0] - sz * local[1], h };
    };
    const feeders = new Map<Actor, Actor[]>();
    for (const a of list) {
      if (a.dead || a.anchor) continue;
      if (a.kind === "survivor" && a.state.pose === "revive") {
        const b = near(a, (x) => x.kind === "survivor" && x.state.pose === "down" && !x.dead);
        if (!b) continue;
        const ax = axis(b);
        want.set(a, kneel(a, ax.chest, ax.ux, ax.uz, CPR_HANDS, 0));
      } else if (a.kind === "zombie" && a.state.pose === "z-feed") {
        // (the dead eat the living and the newly dead — a survivor's body, never a fallen zombie's)
        const b = near(a, (x) => x.kind === "survivor");
        if (b) (feeders.get(b) ?? feeders.set(b, []).get(b)!).push(a);
      }
    }
    for (const [b, zs] of feeders) {
      // THE SIM'S OWN PLACES (sim/lie.ts feedPlaces), off the body as it really lies (its hips and head) — each
      // feeder to the nearest one still free, so the show and the sim agree on who is where
      const ax = axis(b);
      // (a body propped up on its hands — its head well off the floor — is eaten at the legs: sim/lie.ts)
      const places = feedPlaces({ x: ax.hp.x, z: ax.hp.z, h: Math.atan2(ax.ux, ax.uz), lie: 0 }, b.headPos(new THREE.Vector3()).y - b.pos.y > PROPPED_HEAD_M);
      const taken = new Set<number>();
      zs.sort((p, q) => (p.id < q.id ? -1 : 1));
      for (const z of zs) {
        let bi = -1, bd = Infinity;
        places.forEach((p, i) => { if (taken.has(i)) return; const d = (p.x - z.pos.x) ** 2 + (p.z - z.pos.z) ** 2; if (d < bd) { bd = d; bi = i; } });
        if (bi < 0) continue;
        taken.add(bi);
        const p = places[bi];
        want.set(z, { x: p.x, z: p.z, h: p.h });
      }
    }
    const step = CONTACT_EASE * dt;
    for (const a of list) {
      let w = want.get(a);
      if (w) {
        // never further than CONTACT_MAX_M from the sim's place, never into a wall or furniture
        const off = Math.hypot(w.x - a.pos.x, w.z - a.pos.z);
        const why = off > CONTACT_MAX_M ? "far" : !geo.walkable(w.x, a.pos.y, w.z) ? "wall" : "ok";
        this.contactWhy[`${a.kind}:${why}`] = (this.contactWhy[`${a.kind}:${why}`] ?? 0) + 1;
        if (why !== "ok") w = undefined;
      }
      const tx = w ? w.x - a.pos.x : 0, tz = w ? w.z - a.pos.z : 0;
      const o = a.contactOff, dx = tx - o.x, dz = tz - o.z, L = Math.hypot(dx, dz);
      if (L > step) { o.x += dx / L * step; o.z += dz / L * step; } else { o.x = tx; o.z = tz; }
      a.faceTo = w ? w.h : null;
      if (o.x || o.z) { a.root.position.x += o.x; a.root.position.z += o.z; }
    }
  }

  /** TWO BODIES NEVER DRAWN IN ONE PLACE (realism round 6, Nov 2026): the sim keeps them apart, but a pair
   *  moves its bodies to where the bake stood them (pairs.ts) and the others are drawn where the sim has them
   *  — a second zombie stood inside a survivor already held by the first. Standing bodies drawn closer than
   *  SEP_M are eased apart, display only (a pair's bodies never move; the dead and the floored don't count),
   *  and the nudge eases back to nothing once they're clear. */
  private separate(list: Actor[], dt: number): void {
    // (a feeder holds its place at the body — contacts() set it — but it is in the way: others are eased off it,
    // like a pair's bodies)
    const live = list.filter((a) => !a.dead && a.state.pose !== "down" && a.state.pose !== "sleep" && !a.link);
    const fixed = (a: Actor) => !!a.anchor || a.state.pose === "z-feed";
    const want = new Map<Actor, THREE.Vector3>();
    // (measured at the HIPS, not the root: a zombie's walk leans and sways, and two crowding a doorway stood with
    // their roots apart and their hips 0.39 m from each other — realism round 9)
    // (the hips' offset from the root eased over HIP_EASE_S, so a stride's sway doesn't wobble the push — only a
    // lean that holds does)
    const k = Math.min(1, dt / HIP_EASE_S);
    const hip = live.map((a) => {
      if (a.ready) { const h = a.hips(new THREE.Vector3()); a.hipOff.x += (h.x - a.root.position.x - a.hipOff.x) * k; a.hipOff.z += (h.z - a.root.position.z - a.hipOff.z) * k; }
      return new THREE.Vector3(a.root.position.x + a.hipOff.x, a.root.position.y, a.root.position.z + a.hipOff.z);
    });
    // (relaxed over a few passes, not one: three bunched at a door pushed the middle one from both sides, the
    // pushes cancelled, and the outer two moved out only half the way — Johanna stood inside Sarah for six seconds)
    const at = hip.map((h) => h.clone());
    for (let pass = 0; pass < SEP_PASSES; pass++) {
      let any = false;
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const u = live[i], v = live[j];
        if (fixed(u) && fixed(v)) continue;
        const dx = at[j].x - at[i].x, dz = at[j].z - at[i].z;
        const d = Math.hypot(dx, dz), lim = u.kind === "survivor" && v.kind === "survivor" ? SEP_M : SEP_M - 0.05;
        if (d >= lim || Math.abs(v.root.position.y - u.root.position.y) > 1) continue;
        any = true;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0, push = lim - d;
        // the one in a pair holds still; otherwise each gives half
        const ku = fixed(u) ? 0 : fixed(v) ? 1 : 0.5, kv = fixed(v) ? 0 : fixed(u) ? 1 : 0.5;
        at[i].x -= nx * push * ku; at[i].z -= nz * push * ku;
        at[j].x += nx * push * kv; at[j].z += nz * push * kv;
      }
      if (!any) break;
    }
    live.forEach((a, i) => { const dx = at[i].x - hip[i].x, dz = at[i].z - hip[i].z; if (dx || dz) want.set(a, new THREE.Vector3(dx, 0, dz)); });
    const step = SEP_EASE * dt;
    for (const a of list) {
      const w = want.get(a) ?? ZERO3;
      const o = a.sepOff, dxo = w.x - o.x, dzo = w.z - o.z, L = Math.hypot(dxo, dzo);
      if (L > step) { o.x += dxo / L * step; o.z += dzo / L * step; } else { o.x = w.x; o.z = w.z; }
      if (o.x || o.z) { a.root.position.x += o.x; a.root.position.z += o.z; }
    }
  }

  /** the vitals' look on a survivor's skin: sweat when spent, the infection showing */
  vitalsLook(a: Actor): void {
    const v = a.state.vitals;
    if (!a.look || !v) return;
    a.look.set({ sweat: Math.min(1, 0.15 + (1 - v.stamina) * 0.7), infection: v.infected ? 0.55 : v.bitten ? 0.2 : 0 });
  }

  /** a zombie's cut for an event's `part` (a head, an arm) */
  sever(a: Actor, part: string | undefined, dir: THREE.Vector3, floorY: number, seed: number): void {
    if (!a.cut || !part) return;
    if (part === "head") { a.cut.burstHead({ dir, floorY }, seed); return; }
    const site = (SITES as string[]).includes(part) ? (part as Site) : null;
    if (site) a.cut.sever({ site, dir, force: 0.7, floorY }, seed);
  }

  gunHold(id: string): GunHold | undefined { return this.holds[id]; }
  gunId(a: Actor): GunId | null { return a.hasGun ? (a.heldId as GunId) : null; }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.list.keys()]) this.gone(id);
    void Promise.all(this.srcs.values().map((p) => p.then((s) => {
      s.mixer.stopAllAction();
      s.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
      });
    }).catch(() => {})));
    void Promise.all(this.propSrc.values().map((p) => p.then((s) => s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
    })).catch(() => {})));
  }
}


/** A departing body's own GPU objects: its skeletons' bone textures (cloneSkinned makes a skeleton per
 *  clone), the material copies its look or its cut made (anything that isn't the body file's own),
 *  and a survivor's look texture. The geometry is the shared body file's and stays. */
function freeBody(a: Actor): void {
  const body = a.body;
  if (!body) return;
  const shared = new Set<THREE.Material>();
  a.src?.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const x of Array.isArray(m.material) ? m.material : [m.material]) shared.add(x); });
  body.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    if (m.isSkinnedMesh) m.skeleton?.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) if (x && !shared.has(x)) x.dispose();
  });
  a.look?.texture.dispose();
  a.body = null;
}
