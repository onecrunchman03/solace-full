// THE CASINO GUN, IN A HAND (Josh, Aug 2026: "Casino Gun - Kill everyone").
//
// The drinkanim doctrine, applied to a firearm: ONE module runs your own hands
// and every peer's, the pistol hangs off the same DEF-handR bone the bottles
// do, orientation is SOLVED IN WORLD SPACE EVERY FRAME (nothing accumulates,
// nothing is baked for one wrist pose), and everything about the model is
// MEASURED at load rather than assumed.
//
// The model is Josh's animated Beretta (assets/Models/gun/animated_pistol.glb,
// texture-shrunk to client/public/assets/casino/pistol.glb). It ships with its
// own first-person ARMS and one 8.8s "allanimations" timeline. The arms are
// CUT — this game's doctrine is a real body, not a floating-arms shooter
// viewmodel — and the timeline is sliced into the three part-gestures the gun
// itself performs (measured channel-by-channel, see SEGS): the slide/hammer/
// shell of a SHOT, the mag-out/mag-in of a RELOAD, and the slide RACK.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { armIK } from "../backrooms/world";
import type { DrinkRig } from "./drinkanim";

/** How long the pistol reads muzzle-to-grip in a hand, metres. The real gun is
 *  ~0.25m; slightly over reads right at PSX poly counts. */
const GUN_LEN = 0.28;

/** The fire/reload/rack slices of the model's single "allanimations" timeline,
 *  seconds. MEASURED (node scripts channel scan, Aug 2026): trigger+hammer+
 *  slide+shell all move 0.00-0.40 (the shot), the mag runs 0.63-1.63 (the
 *  swap), slide+stopper alone at 1.83-2.05 (the rack). */
// Sliced off the DECODED slide track this time, not the motion-span scan —
// which read "no keys changing" as "at rest" when the slide was HELD BACK
// (a locked slide is exactly as keyframe-quiet as a closed one). The slide is
// home only in the windows ~0.25–0.65, ~2.0–2.8, ~5.1–6.7 and 7.05+:
//   fire   0.00–0.55: back at 0.07, in battery by 0.23, trigger settles.
//   reload 0.60–2.10: slide locks back, mag out 0.63–1.63, mag seats, slide
//                     RELEASES at 1.97 — the old 1.7 cut clamped it open.
//   rack   6.65–7.15: the timeline's one quick pull-and-release.
const SEGS = {
  fire: [0, 0.55] as const,
  reload: [0.6, 2.1] as const,
  rack: [6.65, 7.15] as const,
};

/** Only the GUN'S OWN moving parts play — the timeline also animates the cut
 *  arms, all ten fingers, and the `pistol` root node (which follows the
 *  original hands and would fly the gun out of the fist if it played). */
const PART_RE = /^(slide|mag|hammer|trigger|stopper|shell(_\d+)?|bullet(_\d+(_\d+)?)?)$/;

/** Where the GRIP ANCHOR (the holder origin — see the trigger/hammer
 *  anchoring in ensurePistol) sits relative to the hand bone, metres, through
 *  the bone's rotation — same frame as drinkanim's GRIP (measured axes:
 *  +X outboard, +Y world-down, -Z forward). Small on purpose: the anchor IS
 *  the grip now, so this only nudges it from the wrist joint into the palm. */
const GRIP = new THREE.Vector3(-0.04, 0.075, -0.015);

/** First-person aim framing, relative to the LENS (the drinkanim numbers'
 *  method: shoulder is 6.5cm behind / 17cm right / 33cm below the camera, arm
 *  0.54m — so this sits at ~80% reach, lower-right, like every shooter). */
const AIM_FWD = 0.40;
const AIM_SIDE = 0.17;
const AIM_DROP = 0.16;
/** How firmly the first-person arm holds the aim pose. */
const AIM_REACH = 0.88;
/** Recoil: how far the muzzle kicks up (radians) and how fast it recovers. */
const KICK_RAD = 0.16;
const KICK_RECOVER = 9;

let template: THREE.Group | null = null;
let clips: { fire: THREE.AnimationClip; reload: THREE.AnimationClip; rack: THREE.AnimationClip } | null = null;
let loading: Promise<void> | null = null;

// (An attempt at wrapping FINGERS around the grip lived here briefly: the
// pistol asset's own posed right hand, carved out by skin weight and baked
// static onto the gun. Josh's verdict — "you just put a hand over the hand" —
// a second hand over the suit's mitten reads worse than the mitten alone, so
// the mitten IS the gripping hand and the grip seats into it. A true finger
// wrap needs the HAZMAT model itself re-rigged with hand bones; if that model
// ever ships, pose the fingers here.)

/** Load + prepare the pistol once: cut the arms, keep the named gun parts,
 *  slice the timeline. Resolves even on failure — a hall with no gun model
 *  degrades to empty hands, never a crash. */
export function ensurePistol(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    new GLTFLoader().load(
      "/assets/casino/pistol.glb",
      (gltf) => {
        const src = gltf.scene;
        src.updateMatrixWorld(true);
        // THE GUN PARTS live under nodes named after themselves (slide, mag,
        // hammer…, each holding a `*_beretta_0` mesh). Everything else — the
        // skinned arms, the finger bones — is the original viewmodel's body
        // and is dropped. Meshes are re-parented FLAT under one group,
        // keeping their measured world transforms, so the original arm-rig
        // hierarchy (whose nodes the timeline also animates) can't drag them.
        const g = new THREE.Group();
        const parts: THREE.Object3D[] = [];
        src.traverse((o) => {
          if (PART_RE.test(o.name) || o.name === "base") parts.push(o);
        });
        // Each part's SOURCE PARENT transform — the timeline's tracks write
        // values in that frame, and the flatten below throws the frame away,
        // so the tracks must be remapped through it (see the slice).
        const srcParent = new Map<string, { m: THREE.Matrix4; q: THREE.Quaternion; s: THREE.Vector3 }>();
        for (const p of parts) {
          const holder = new THREE.Group();
          holder.name = p.name;
          p.getWorldPosition(holder.position);
          p.getWorldQuaternion(holder.quaternion);
          holder.scale.copy(p.getWorldScale(new THREE.Vector3()));
          if (p.parent) {
            srcParent.set(p.name, {
              m: p.parent.matrixWorld.clone(),
              q: p.parent.getWorldQuaternion(new THREE.Quaternion()),
              s: p.parent.getWorldScale(new THREE.Vector3()),
            });
          }
          for (const ch of [...p.children]) {
            if ((ch as THREE.Mesh).isMesh) holder.add(ch.clone());
          }
          if (holder.children.length) g.add(holder);
        }
        if (!g.children.length) return resolve(); // nothing recognisable
        // Normalise the SIZE off the bounding box, but ANCHOR ON THE GRIP,
        // not the box's centre. A pistol's centre is halfway down the slide —
        // anchored there, the fist wraps empty air at mid-barrel while the
        // grip handle floats behind it (Josh's screenshot). The grip sits
        // between the trigger (its front) and the hammer (its back), so the
        // anchor is measured off those two named parts and dropped a little
        // toward the palm — the holder's origin then IS the grip, and the
        // hand-frame GRIP offset below only has to find the fist.
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        const long = Math.max(size.x, size.y, size.z, 1e-4);
        const inner = new THREE.Group();
        for (const ch of [...g.children]) inner.add(ch);
        const trig = g.children.find((o) => o.name === "trigger");
        const ham = g.children.find((o) => o.name === "hammer");
        const anchor = trig && ham
          ? new THREE.Vector3().addVectors(trig.position, ham.position).multiplyScalar(0.5)
          : box.getCenter(new THREE.Vector3());
        // …down into the palm: the trigger/hammer midpoint is the grip's TOP
        // (the web of the thumb). ~20% of the gun's height lower is where the
        // fingers actually close.
        anchor.y -= size.y * 0.2;
        inner.position.sub(anchor);
        const wrap = new THREE.Group();
        wrap.add(inner);
        wrap.scale.setScalar(GUN_LEN / long);
        template = wrap;

        // Slice the timeline to the parts that survived. Track names address
        // nodes by name ("slide.position") — the re-parent above kept names,
        // so the bindings land on our holders. BUT the VALUES are authored in
        // each part's SOURCE-PARENT frame, which the flatten just threw away
        // — the source rig carries a scaled ancestor, so played raw the slide
        // teleported EIGHT METRES per shot (measured before this remap). Every
        // key is pushed through the recorded parent world transform, so what
        // the mixer writes into a holder equals what the source hierarchy
        // would have rendered.
        const all = gltf.animations?.[0];
        if (all) {
          const keep = all.tracks
            .filter((t) => PART_RE.test(t.name.split(".")[0]))
            .map((t) => t.clone());
          const kv = new THREE.Vector3();
          const kq = new THREE.Quaternion();
          for (const t of keep) {
            const [name, prop] = t.name.split(".");
            const pw = srcParent.get(name);
            if (!pw) continue;
            const v = t.values;
            if (prop === "position") {
              for (let i = 0; i < v.length; i += 3) {
                kv.set(v[i], v[i + 1], v[i + 2]).applyMatrix4(pw.m);
                v[i] = kv.x; v[i + 1] = kv.y; v[i + 2] = kv.z;
              }
            } else if (prop === "quaternion") {
              for (let i = 0; i < v.length; i += 4) {
                kq.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(pw.q);
                v[i] = kq.x; v[i + 1] = kq.y; v[i + 2] = kq.z; v[i + 3] = kq.w;
              }
            } else if (prop === "scale") {
              for (let i = 0; i < v.length; i += 3) {
                v[i] *= pw.s.x; v[i + 1] *= pw.s.y; v[i + 2] *= pw.s.z;
              }
            }
          }
          const base = new THREE.AnimationClip("gunparts", all.duration, keep);
          const fps = 30;
          clips = {
            fire: THREE.AnimationUtils.subclip(base, "fire", SEGS.fire[0] * fps, SEGS.fire[1] * fps, fps),
            reload: THREE.AnimationUtils.subclip(base, "reload", SEGS.reload[0] * fps, SEGS.reload[1] * fps, fps),
            rack: THREE.AnimationUtils.subclip(base, "rack", SEGS.rack[0] * fps, SEGS.rack[1] * fps, fps),
          };
        }
        resolve();
      },
      undefined,
      () => resolve(),
    );
  });
  return loading;
}

interface GunState {
  holder: THREE.Object3D | null;
  /** The gun model's own FORWARD (muzzle direction) and UP in the holder's
   *  frame — measured at attach, the drinkanim `up` rule: directions, never a
   *  baked rotation, so the solve works in any wrist pose. */
  fwd: THREE.Vector3 | null;
  up: THREE.Vector3 | null;
  mixer: THREE.AnimationMixer | null;
  /** Muzzle flash quad + the muzzle anchor group, parented at the barrel end.
   *  The flash LIGHT is NOT per-gun any more — see sharedFlash below. */
  flash: THREE.Mesh | null;
  muzzle: THREE.Group | null;
  flashLeft: number;
  /** Recoil kick remaining, radians. */
  kick: number;
  /** Seconds of RAISED AIM remaining (peers): a shot snaps the arm up to a
   *  level aim and it eases back down — the room sees the gesture, not just
   *  the flash (Josh: "make sure other players can see the animation"). */
  raise: number;
}

const states = new WeakMap<DrinkRig, GunState>();
const stateOf = (a: DrinkRig): GunState => {
  let s = states.get(a);
  if (!s) {
    s = { holder: null, fwd: null, up: null, mixer: null, flash: null, muzzle: null, flashLeft: 0, kick: 0, raise: 0 };
    states.set(a, s);
  }
  return s;
};

// ---- THE SHARED MUZZLE LIGHT (Josh, Aug 2026: "the game freezes when they
// switch to the gun") ---------------------------------------------------------
// The old cut parented a PointLight to every pistol, so DRAWING a gun changed
// the scene's light count — and the light count is baked into every material's
// shader, so the first draw (and every headcount change of gun-holders after
// it) recompiled the entire hall mid-frame. ONE light now lives in the scene
// permanently (the hall hands it over at build, intensity 0 when idle) and the
// most recent shot borrows it for its ~60ms flash. Two people firing inside
// the same 60ms share it — the flash QUADS are still per-gun, and nobody can
// see two muzzle flashes at once anyway.
let sharedFlash: THREE.PointLight | null = null;
let flashClaim: GunState | null = null;
const V_MUZZLE = new THREE.Vector3();
/** The hall calls this once at build with a scene-resident light. */
export function setSharedMuzzleFlash(light: THREE.PointLight | null): void {
  sharedFlash = light;
  flashClaim = null;
}

/** The flash quad's material + geometry are module-shared: per-gun copies were
 *  disposed with the gun, which destroyed the compiled program and made the
 *  next draw recompile it. */
const flashGeo = new THREE.PlaneGeometry(0.16, 0.16);
const flashMat = new THREE.MeshBasicMaterial({
  color: 0xffd27a, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  forceSinglePass: true, // no two-pass transparency (Oct 2026 review)
});

/** An invisible clone of the pistol (plus a flash quad) the hall parks in the
 *  scene at build, so a prewarm `renderer.compile` reaches the gun's
 *  materials before anyone draws one. Null until the model loads. */
export function pistolWarmProp(): THREE.Object3D | null {
  if (!template) return null;
  const g = new THREE.Group();
  g.add(template.clone(true));
  g.add(new THREE.Mesh(flashGeo, flashMat));
  g.visible = false;
  return g;
}

const V_AIM = new THREE.Vector3();
const V_UP = new THREE.Vector3();
const V_RIGHT = new THREE.Vector3();
const V_FWD = new THREE.Vector3();
const V_TARGET = new THREE.Vector3();
const V_HAND = new THREE.Vector3();
const V_TMP0 = new THREE.Vector3();
/** A raised peer barrel tilted by the wire's look pitch (orientGun copies its
 *  argument immediately, but V_AIM itself is its working register). */
const V_PEER_AIM = new THREE.Vector3();
const Q_WORLD = new THREE.Quaternion();
const Q_HAND = new THREE.Quaternion();
const M_LOOK = new THREE.Matrix4();

/** Hang the pistol on this body's right hand (idempotent, self-healing — the
 *  drinkanim ensureHolder rule: skeletons arrive after spawn). */
export function givePistol(a: DrinkRig): void {
  const s = stateOf(a);
  if (!template || !a.hand) return;
  if (s.holder && s.holder.parent === a.hand) return;
  if (s.holder) s.holder.parent?.remove(s.holder);

  const gun = template.clone(true);
  const holder = new THREE.Group();
  holder.add(gun);
  a.hand.add(holder);
  holder.position.copy(GRIP);
  // undo body scale so the gun is the same size in every hand
  let sc = 1;
  a.hand.traverseAncestors((o) => { sc *= o.scale.x || 1; });
  holder.scale.setScalar(1 / (sc || 1));

  // Which way this model calls forward/up, in the holder's frame. MEASURED
  // IN-ENGINE against the NAMED PARTS, not a screenshot (Aug 2026): with −Z
  // on the aim the stopper (a pistol's front) sat 8cm BEHIND the hammer (its
  // back) along the camera forward — so the muzzle is +Z, and the flip that
  // "fixed" the first render had actually turned a correct gun around. A
  // hammer recess and a muzzle bore look identical at PSX resolution; part
  // positions don't lie. Sights are +Y.
  s.fwd = new THREE.Vector3(0, 0, 1);
  s.up = new THREE.Vector3(0, 1, 0);
  s.holder = holder;

  // The part animations play on THIS clone's own mixer.
  s.mixer = new THREE.AnimationMixer(gun);

  // Muzzle flash: a small additive quad at the barrel's end, shown for a few
  // frames per shot. The light is the SHARED one (see setSharedMuzzleFlash) —
  // parenting a light here changed the scene's light count per gun-holder and
  // recompiled the hall on every draw.
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.visible = false;
  const muzzle = new THREE.Group();
  muzzle.position.copy(s.fwd).multiplyScalar(GUN_LEN * 0.62);
  muzzle.add(flash);
  gun.add(muzzle);
  s.flash = flash;
  s.muzzle = muzzle;

  orientGun(a, s, null, 0);
}

export function takePistol(a: DrinkRig): void {
  const s = states.get(a);
  if (!s) return;
  s.holder?.parent?.remove(s.holder);
  s.holder = null;
  s.mixer = null;
  s.flash = null;
  s.muzzle = null;
  if (flashClaim === s) {
    if (sharedFlash) sharedFlash.intensity = 0;
    flashClaim = null;
  }
}

export const hasPistol = (a: DrinkRig): boolean => !!states.get(a)?.holder;

const playSeg = (s: GunState, which: "fire" | "reload" | "rack"): void => {
  if (!s.mixer || !clips) return;
  s.mixer.stopAllAction();
  const act = s.mixer.clipAction(clips[which]);
  act.setLoop(THREE.LoopOnce, 1);
  // Hold the final frame — every slice ends at rest (verified per part), and
  // un-clamped the mixer left the slide wherever the last write landed.
  act.clampWhenFinished = true;
  act.reset().play();
};

/** Fire: the slide cycles, a shell ejects, the flash burns for ~60ms and the
 *  muzzle kicks. Purely visual — the round was already spent server-side.
 *  On a peer body the shot also RAISES the arm to a level aim for a beat, so
 *  the room reads the gesture and not just the flash. */
export function pistolFire(a: DrinkRig): void {
  const s = states.get(a);
  if (!s?.holder) return;
  playSeg(s, "fire");
  s.flashLeft = 0.06;
  s.kick = KICK_RAD;
  s.raise = 0.9;
}

/** Reload: the mag drops and a fresh one seats (the model's own gesture). */
export function pistolReload(a: DrinkRig): void {
  const s = states.get(a);
  if (!s?.holder) return;
  playSeg(s, "reload");
}

/** The rack — cocking the slide. Played when the gun is first drawn. */
export function pistolRack(a: DrinkRig): void {
  const s = states.get(a);
  if (!s?.holder) return;
  playSeg(s, "rack");
}

/**
 * Point the gun. `aimDir` is the world direction the barrel should follow
 * (null = level along the body's facing — the peer default; the wire carries
 * no pitch). Solved absolutely every frame, the drinkanim orient rule.
 */
function orientGun(a: DrinkRig, s: GunState, aimDir: THREE.Vector3 | null, kick: number): void {
  if (!s.holder || !s.fwd || !s.up || !a.hand) return;
  if (aimDir) V_AIM.copy(aimDir).normalize();
  else V_AIM.set(0, 0, -1).applyQuaternion(a.group.quaternion).setY(0).normalize();
  // recoil rotates the aim up about the body's right axis
  if (kick > 0) {
    V_RIGHT.crossVectors(V_AIM, V_UP.set(0, 1, 0)).normalize();
    V_AIM.applyAxisAngle(V_RIGHT, kick);
  }
  // Matrix4.lookAt(eye, target, up) builds a frame whose +Z runs target→eye;
  // with eye = V_AIM and target = origin that puts +Z — the measured muzzle
  // axis — ON the aim, sights upright. The matrix form rather than
  // setFromUnitVectors because the latter allows roll and a rolled pistol
  // reads instantly as broken.
  M_LOOK.lookAt(V_AIM, V_TMP0.set(0, 0, 0), V_UP.set(0, 1, 0));
  Q_WORLD.setFromRotationMatrix(M_LOOK);
  const handQ = a.hand.getWorldQuaternion(Q_HAND);
  s.holder.quaternion.copy(handQ).invert().multiply(Q_WORLD);
}

/**
 * Per-frame: advance part animations, the flash and the recoil, and keep the
 * gun oriented. `fp` (first person) supplies the eye + the true aim direction
 * and asks the arm to hold the shooter's pose; peers pass nothing extra and
 * keep the arm their locomotion clip gave them (the pistol clips carry it).
 */
export function tickGun(
  a: DrinkRig,
  dt: number,
  fp?: { eye: THREE.Vector3; yaw: number; pitch: number } | null,
): void {
  const s = states.get(a);
  if (!s?.holder) return;
  s.mixer?.update(dt);
  if (s.flashLeft > 0) {
    s.flashLeft -= dt;
    const on = s.flashLeft > 0;
    if (s.flash) {
      s.flash.visible = on;
      // random spin so successive shots don't show the identical star
      if (on) s.flash.rotation.z = Math.random() * Math.PI * 2;
    }
    // the shared light follows THIS muzzle while this gun owns the flash
    if (sharedFlash && on && s.muzzle) {
      flashClaim = s;
      s.muzzle.getWorldPosition(V_MUZZLE);
      sharedFlash.position.copy(V_MUZZLE);
      sharedFlash.intensity = 2.6;
    } else if (sharedFlash && !on && flashClaim === s) {
      sharedFlash.intensity = 0;
      flashClaim = null;
    }
  }
  s.kick = Math.max(0, s.kick - KICK_RECOVER * s.kick * dt - 0.4 * dt);

  s.raise = Math.max(0, s.raise - dt);

  let aim: THREE.Vector3 | null = null;
  if (fp) {
    // the true look direction, pitch included — the barrel follows the eye
    const cp = Math.cos(fp.pitch);
    aim = V_TARGET.set(-Math.sin(fp.yaw) * cp, Math.sin(fp.pitch), -Math.cos(fp.yaw) * cp);
    // …and the arm holds the gun up in frame, lower right of the lens
    const sin = Math.sin(fp.yaw);
    const cos = Math.cos(fp.yaw);
    const hx = fp.eye.x - sin * AIM_FWD + cos * AIM_SIDE;
    const hy = fp.eye.y - AIM_DROP + Math.sin(fp.pitch) * 0.22;
    const hz = fp.eye.z - cos * AIM_FWD - sin * AIM_SIDE;
    if (a.upperArm && a.foreArm && a.hand) {
      const tgt = V_HAND.set(hx, hy, hz); // pooled — this ran per frame with the gun drawn
      for (let i = 0; i < 3; i++) armIK(a.upperArm, a.foreArm, a.hand, tgt, AIM_REACH);
    }
  } else if (!(a as { emote?: string }).emote) {
    // A PEER (or the table stand-in) HOLDS THE PISTOL LIKE A PISTOL (Josh:
    // "make sure other players can see... how the player is holding it").
    // The locomotion clips carry the walk/run arm; standing still the sober
    // idle just hangs the arm, which read as empty-handed with a gun floating
    // beside the thigh. So the arm is posed at LOW READY — hand in front of
    // the hip, muzzle level — and a shot RAISES it to a level aim for a beat
    // before it eases back down. Skipped mid-emote: the dance owns the body.
    const lift = Math.min(1, s.raise / 0.35); // snap up, ease down with raise
    V_FWD.set(0, 0, -1).applyQuaternion(a.group.quaternion).setY(0).normalize();
    V_RIGHT.set(1, 0, 0).applyQuaternion(a.group.quaternion).setY(0).normalize();
    const gy = a.group.position.y;
    // The wire's look pitch tilts a RAISED barrel (scaled by the lift, so
    // low ready stays level at the hip): the shooter's own screen shows the
    // muzzle following their eye, and the room must see the same gun pointed
    // the same way — one appearance, every observer.
    const pe = ((a as { pitch?: number }).pitch ?? 0) * lift;
    V_TARGET.copy(a.group.position)
      .addScaledVector(V_FWD, 0.24 + 0.16 * lift)
      .addScaledVector(V_RIGHT, 0.16 - 0.04 * lift);
    V_TARGET.y = gy + 0.98 + 0.36 * lift + Math.sin(pe) * 0.22; // hip ready → shoulder aim, hand riding the tilt
    if (a.upperArm && a.foreArm && a.hand) {
      for (let i = 0; i < 3; i++) armIK(a.upperArm, a.foreArm, a.hand, V_TARGET, 0.62 + 0.28 * lift);
    }
    if (pe !== 0) {
      const cp = Math.cos(pe);
      aim = V_PEER_AIM.set(V_FWD.x * cp, Math.sin(pe), V_FWD.z * cp);
    }
  }
  orientGun(a, s, aim, s.kick);
}
