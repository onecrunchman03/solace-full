// DRINKING, AS SOMETHING OTHER PEOPLE CAN SEE.
//
// The bar has worked for a while, but only from the inside: the bottle hung off
// your CAMERA, so you saw yourself drink and nobody else saw anything at all.
// A hall full of people getting visibly drunk with empty hands is a strange
// sight, and the drink is a social prop or it is nothing.
//
// So a bottle now hangs off the right-hand BONE of the body — yours, every
// peer's, and the stand-in you're swapped for at a table — and a swig is a
// real gesture: the arm comes up, the bottle tips to the lips, the head tilts
// back, and it all lowers again.
//
// THAT INCLUDES YOUR OWN HANDS. The first cut left first person on a bottle
// parented to the CAMERA with hand-tuned offsets — a floating prop that no arm
// was attached to, animated by a completely separate curve from the one the
// room was watching. Both now run this file, on the same bone, off the same
// clock, so what you see yourself do and what everyone else sees you do cannot
// drift apart. The only thing first person adds is a CARRY POSE, because an arm
// hanging honestly at your side puts the bottle below the frame where you
// cannot see what you are holding.
//
// HOW THIS LAYERS. The animation is procedural and runs AFTER the mixer each
// frame, on top of whatever locomotion clip is playing. That is deliberate:
// people drink while walking, while propping up the bar, while drunk — and
// authoring a drink variant of all nine locomotion clips (times the drunk set)
// is not a thing anybody should do. armIK reaches the existing arm to a target
// instead, which is exactly what the backrooms rig already does to point a
// walkie or hold a camera to a face.
//
// NOTHING ACCUMULATES. Every frame the mixer rewrites these bones from the
// clip, and this pass slerps from that fresh pose toward the goal — so it is a
// pure function of "how far through the swig are we", not an integration. The
// bottle's own tip is written absolutely for the same reason.

import * as THREE from "three";
import { armIK } from "../backrooms/world";

/** The minimum a body needs to hold and drink something. Both the peer avatars
 *  and the first-person VIEWMODEL satisfy this, which is the point: your own
 *  arms and everybody else's run the identical code, so what you see yourself
 *  do and what the room sees you do can't drift apart. */
export interface DrinkRig {
  group: THREE.Object3D;
  hand: THREE.Object3D | null;
  upperArm: THREE.Object3D | null;
  foreArm: THREE.Object3D | null;
  head: THREE.Object3D | null;
}

/** How long a swig takes, end to end. Matches the first-person timing that was
 *  already tuned against the swig sound, so the gesture and the glug agree. */
export const DRINK_MS = 900;

/** The bottle, in the hand, in metres. A 330ml bottle is about this tall, and
 *  the props are authored at wildly different scales (one file is in metres,
 *  the other in centimetres) so everything is normalised by MEASUREMENT rather
 *  than trusted. */
const BOTTLE_H = 0.26;

/** Where the bottle sits relative to the hand bone, in metres, once it has been
 *  re-centred on its own middle.
 *
 *  THE HAND BONE'S AXES ARE MEASURED, NOT GUESSED, and they are not what you'd
 *  assume. Read off the live rig (dotting the bone's world basis against the
 *  body's own directions):
 *
 *      local +X  → OUTBOARD, away from the hip   (dot 0.97)
 *      local +Y  → DOWN                          (dot with world up: -0.97)
 *      local -Z  → forward, the way they face
 *
 *  The first version used (0.02, -0.03, 0) meaning "2cm out, 3cm down", which
 *  is 2cm out — nowhere near enough to clear the thigh — and 3cm UP, into the
 *  hip. The second overcorrected to 8.5cm outboard, which cleared the leg by
 *  shoving the bottle out of the fist entirely. Both were really the same bug
 *  wearing different clothes: the bottle was UPSIDE DOWN (see `up`), so its
 *  wide base sat up at hip height and no offset was ever going to look right.
 *  Standing it up first, these are the world offset it actually wants —
 *  4.5cm outboard, 3cm forward, 2cm down — through the bone's rotation. */
const GRIP = new THREE.Vector3(0.055, 0.037, -0.036);

/** Phase boundaries within a swig: reach up, drink, come down. The sip is the
 *  longest stretch on purpose — an arm that snaps to the mouth and straight
 *  back reads as a twitch rather than a drink. */
const RAISE_END = 0.34;
const SIP_END = 0.66;

/** How far the bottle tips at the lips (radians). A bottle held upright at chin
 *  height would just stand there; the wrist is what actually makes it a drink.
 *  Past horizontal on purpose — under 90 degrees nothing would come out, and
 *  the eye reads "pouring" from exactly that. Worth 1.15 when this rotation
 *  accumulated on top of a stale base and quietly gained the rest. */
const TIP_MAX = 1.75;
/** How far the head tips back to meet it. Small — this is a sip, not a chug. */
const HEAD_MAX = 0.28;
/** How hard the IK pulls the arm to the mouth at full reach. Short of 1 so the
 *  underlying clip still shows through and the arm keeps some of its own life. */
const REACH = 0.85;
/** How firmly the first-person arm is held in the carry pose. Lower than the
 *  drink reach so the walk cycle still moves the arm a little and it doesn't
 *  read as welded to the camera. */
const CARRY_REACH = 0.82;

/** FIRST-PERSON FRAMING, all measured against the real rig rather than tuned by
 *  eye. Relative to the LENS, in metres.
 *
 *  The numbers that constrain these: the shoulder sits 6.5cm behind, 17cm right
 *  and 33cm below the camera, and the arm is 0.269 + 0.274 = 0.543m long. So
 *  anything past ~0.44m in front of the eye is a straight arm presenting the
 *  bottle like an offering, and the honest resting hand — which lands 36cm
 *  below the lens — is a long way outside a 72-degree frame. Every shooter
 *  cheats this and so does this: the carry is a deliberate pose, chosen to put
 *  the bottle in the lower right at about 84% of the arm's reach.
 *
 *  IT IS ALSO PURELY LOCAL. Peers never get a carry point — their client hangs
 *  your arm honestly at your side — so cheating the framing here changes what
 *  YOU see and nothing about what the room sees. */
const CARRY_FWD = 0.38;
const CARRY_SIDE = 0.175;
const CARRY_DROP = 0.20;

/** …and where the bottle goes on a swig. FROM THE LENS, NOT THE HEAD BONE:
 *  that bone is the base of the skull, 20cm below the camera, so a sip aimed
 *  off it lands BELOW the carry pose and the swig moves the bottle downward
 *  out of frame — which is exactly what the first measurement showed (screen y
 *  going from -1.57 to -1.8). Your mouth is a hand's breadth under your eyes,
 *  and in first person the eyes are the camera. */
const SIP_FWD = 0.34;
const SIP_SIDE = 0.07;
const SIP_DROP = 0.10;

/** How many CCD passes the arm gets. Two (armIK's own internal loop) left the
 *  hand at 58% of the arm's reach when asked for 80% — it converges, but not
 *  in one call, and the shortfall read as "the arm can't get there". */
const IK_PASSES = 3;

const V_HEAD = new THREE.Vector3();
const V_FWD = new THREE.Vector3();
const V_TARGET = new THREE.Vector3();
const V_CARRY = new THREE.Vector3();
const V_RIGHT = new THREE.Vector3();
const V_AIM = new THREE.Vector3();
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const Q_WORLD = new THREE.Quaternion();
const Q_HAND = new THREE.Quaternion();

/** Your own eye, and which way your body is turned. Passing this instead of a
 *  bare point is what tells the gesture it is being watched from the inside —
 *  everything first person needs to frame differently is derived from it. */
export interface FirstPerson {
  eye: THREE.Vector3;
  yaw: number;
}

/** A point `fwd` in front of the eye, `side` to its right and `drop` below it.
 *  YAW ONLY, deliberately: a held item stays where your BODY put it while you
 *  look around, rather than swinging with the sightline like a mounted gun.
 *  (yaw 0 looks down -Z, as the camera does.) */
function eyePoint(out: THREE.Vector3, fp: FirstPerson, fwd: number, side: number, drop: number): THREE.Vector3 {
  const sin = Math.sin(fp.yaw);
  const cos = Math.cos(fp.yaw);
  return out.set(
    fp.eye.x - sin * fwd + cos * side,
    fp.eye.y - drop,
    fp.eye.z - cos * fwd - sin * side,
  );
}

/** Smoothstep — the reach and the tip both ease, so nothing starts or stops
 *  at full speed. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Per-body drink state. Kept OUTSIDE DrinkRig (a WeakMap keyed on the
 *  avatar) so the shared backrooms rig doesn't grow a casino-only field it has
 *  no use for, and so a disposed avatar takes its state with it. */
interface DrinkState {
  /** The bottle's holder group, parented to the hand bone. */
  holder: THREE.Object3D | null;
  /** Which drink is in the hand ("" = empty). */
  hold: string;
  /** Milliseconds remaining in the current swig (0 = not drinking). */
  left: number;
  /** Which way is UP for this bottle model, in the holder's frame. Measured at
   *  attach, not hardcoded — the props are authored on different axes, and the
   *  hand bone's own local +Y points DOWN, so a bottle parented straight onto
   *  it hangs inverted with its neck in the glove (which is exactly what it
   *  looked like on the floor — Josh's screenshot).
   *
   *  This is a DIRECTION, deliberately, not a finished rotation. The first
   *  version baked the whole upright correction into a quaternion once at
   *  attach; that only stands the bottle up for the hand orientation it was
   *  measured in, so the moment the wrist moved — a walk cycle, or the
   *  first-person carry pose — the bottle tipped over with it (measured: up.y
   *  fell from 1.00 to -0.63). Keeping the axis and re-solving the rotation
   *  every frame (see `orient`) is what makes the grip work in any pose. */
  up: THREE.Vector3 | null;
  /** How to build the model. Kept because THE HAND MAY NOT EXIST YET: an
   *  avatar's skeleton arrives with its GLTF, well after makeAvatar returns,
   *  so a bottle handed to a body the moment it spawns has nothing to hang
   *  off. Rather than racing the loader, the attach is retried from the tick
   *  until the bone shows up — which also covers the hall's props not being
   *  resident yet, and a model swap re-parenting the skeleton underneath us. */
  make: ((id: string) => THREE.Object3D | null) | null;
}
const states = new WeakMap<DrinkRig, DrinkState>();
const stateOf = (a: DrinkRig): DrinkState => {
  let s = states.get(a);
  if (!s) {
    s = { holder: null, hold: "", left: 0, up: null, make: null };
    states.set(a, s);
  }
  return s;
};

/** Build and hang the bottle, if it isn't already hanging off the CURRENT hand
 *  bone. Safe to call every frame: it does nothing once the model is in place,
 *  and re-attaches if the skeleton was swapped out from under it. */
function ensureHolder(a: DrinkRig, s: DrinkState): void {
  if (!s.hold || !s.make || !a.hand) return;
  if (s.holder && s.holder.parent === a.hand) return; // already hung, still valid
  if (s.holder) {
    s.holder.parent?.remove(s.holder);
    s.holder = null;
  }
  const obj = s.make(s.hold);
  if (!obj) return; // props not resident yet — try again next frame

  const holder = new THREE.Group();
  a.hand.add(holder);
  // Normalise by measurement, then re-centre on the pivot so GRIP positions
  // the MIDDLE of the bottle rather than whatever corner its origin sat in.
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const tall = Math.max(1e-4, size.y);
  obj.scale.setScalar(BOTTLE_H / tall);
  const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  obj.position.sub(c);
  // A bottle held at the lens is well inside any sane bounding sphere test,
  // but the viewmodel's own meshes opt out for the same reason and a few dozen
  // triangles are not worth the risk of a frame where it blinks out.
  obj.traverse((o) => { (o as THREE.Mesh).frustumCulled = false; });
  holder.add(obj);
  holder.position.copy(GRIP);
  // The hand bone carries the whole body's scale; undo it so a bottle is the
  // same size in every hand whatever the avatar scale happens to be.
  let sc = 1;
  a.hand.traverseAncestors((o) => { sc *= o.scale.x || 1; });
  holder.scale.setScalar(1 / (sc || 1));

  // Which way this particular model calls "up", in the holder's frame. The
  // holder is untouched at this point, so obj's own rotation is the whole
  // story. Standing it up is `orient`'s job, every frame.
  s.up = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.quaternion).normalize();
  s.holder = holder;
  orient(a, s, 0);
}

/**
 * Point the bottle. `tip` is how far its up-axis leans toward the drinker's
 * face, in radians — 0 stands it upright in the fist, and a swig takes it past
 * horizontal so it actually pours.
 *
 * SOLVED IN WORLD SPACE, EVERY FRAME. The bottle's world orientation is a
 * function of the tip alone, so it stands up in any pose the arm happens to be
 * in — walking, drunk, seated, or held out in front of the lens — and comes
 * back to vertical exactly, with nothing to accumulate. The hand's rotation is
 * divided back out at the end for the one reason it matters: the holder hangs
 * off the hand bone, so that is the frame its local quaternion has to be in.
 */
function orient(a: DrinkRig, s: DrinkState, tip: number): void {
  const holder = s.holder;
  if (!holder || !s.up || !a.hand) return;
  // The body's own right — the axis a wrist tips a bottle about. Taken from
  // the BODY, not the hand: the hand's axes are rotated every which way (its
  // local +Y is world-down), so tipping about one of those lays the bottle
  // over sideways instead of tilting it at the face.
  // …and the SIGN of that tip is toward the drinker, which is the whole
  // difference between drinking from a bottle and emptying one onto the
  // carpet. The up-axis runs base→neck, so a swig has to swing the NECK back
  // toward the mouth and the base up and away. Tipping the other way put the
  // neck out in front of the face: survivable-looking at the old 66 degrees on
  // a body across the room, unmistakable at 100 in your own hands.
  V_RIGHT.set(1, 0, 0).applyQuaternion(a.group.quaternion).setY(0).normalize();
  V_AIM.set(0, 1, 0).applyAxisAngle(V_RIGHT, tip);
  Q_WORLD.setFromUnitVectors(s.up, V_AIM);
  holder.quaternion.copy(a.hand.getWorldQuaternion(Q_HAND)).invert().multiply(Q_WORLD);
}

/** What's in this body's hand right now. */
export const heldDrink = (a: DrinkRig): string => states.get(a)?.hold ?? "";
/** The bottle's holder group — review measurement only, so a sweep can ask how
 *  upright it is and how far from the wrist rather than squinting at a still. */
export const heldModel = (a: DrinkRig): THREE.Object3D | null => states.get(a)?.holder ?? null;
export const isDrinking = (a: DrinkRig): boolean => (states.get(a)?.left ?? 0) > 0;

/**
 * Put a bottle in the right hand, or clear it.
 *
 * `make` is called only when a model is actually needed — the casino's props
 * are already resident in the hall (takeBottle clones them), so this never
 * touches the network.
 */
export function setHeldDrink(
  a: DrinkRig,
  hold: string,
  make: (id: string) => THREE.Object3D | null,
): void {
  const s = stateOf(a);
  s.make = make;
  if (s.hold === hold) {
    ensureHolder(a, s); // same drink, but the hand may only just have arrived
    return;
  }
  s.hold = hold;
  if (s.holder) {
    s.holder.parent?.remove(s.holder);
    s.holder = null;
  }
  if (!hold) return;
  ensureHolder(a, s);
}

/** Begin a swig. Ignored with an empty hand, or while one is already running —
 *  so a mashed button (or a duplicated wire frame) can't stack two gestures
 *  on one arm. Returns whether it actually started. */
export function startDrink(a: DrinkRig): boolean {
  const s = stateOf(a);
  if (!s.hold || s.left > 0) return false;
  s.left = DRINK_MS;
  return true;
}

/** Park the swig at a fixed phase (0..1) and hold it there. Review-only: a
 *  gesture this short is impossible to screenshot by racing it, and the whole
 *  point of the pose is whether it reads at the moment the bottle is at the
 *  lips. Applies immediately, with no time passing. */
export function scrubDrink(a: DrinkRig, t: number, fp?: FirstPerson | null): void {
  const s = stateOf(a);
  if (!s.hold) return;
  s.left = DRINK_MS * (1 - Math.max(0, Math.min(1, t)));
  tickDrink(a, 0, fp);
}

/** Forget everything about this body's drink — used when the bottle is emptied
 *  out from under an in-flight gesture. */
export function clearDrink(a: DrinkRig): void {
  const s = stateOf(a);
  s.left = 0;
  if (s.holder) {
    s.holder.parent?.remove(s.holder);
    s.holder = null;
  }
  s.hold = "";
}

/**
 * Advance and apply the gesture. Call once per frame per body, AFTER the
 * mixer has written the clip pose (tickAvatar), or the animation will be
 * overwritten by locomotion the moment it starts.
 */
export function tickDrink(a: DrinkRig, dtMs: number, fp?: FirstPerson | null): void {
  const s = states.get(a);
  if (!s) return;
  ensureHolder(a, s); // the skeleton may have only just finished loading
  // Standing upright in the fist whenever nothing else is happening. Solved
  // absolutely, so an interrupted swig can never leave a bottle tipped over
  // forever.
  orient(a, s, 0);
  if (s.left <= 0 && !fp) return;
  s.left = Math.max(0, s.left - dtMs);

  const t = s.left > 0 ? 1 - s.left / DRINK_MS : 1; // 0 → 1 across the swig
  // How far the arm is up: in over the raise, held through the sip, out again.
  const up = s.left <= 0
    ? 0
    : t < RAISE_END
      ? ease(t / RAISE_END)
      : t < SIP_END
        ? 1
        : ease(1 - (t - SIP_END) / (1 - SIP_END));

  const head = a.head;
  if (!head && !fp) return; // a peer's mouth comes off the head bone; yours doesn't

  let reach: number;
  if (fp) {
    // FIRST PERSON. Both ends of the gesture are framed against the LENS, and
    // the swig is a lerp between them: the bottle sits in the lower right, and
    // comes up and in to the mouth. Your own arm hangs at your side like
    // everyone else's, which is honest and completely useless from the inside
    // — looking ahead, the hand is 36cm below a 72-degree frame and you cannot
    // see what you are holding at all.
    // …and it comes IN as well as up. Kept out at the shoulder the bottle is
    // seen broadside and reads as a green wall; brought dead centre, the
    // forearm crosses the middle of the view. This splits them — the drink
    // arrives at the right corner of the mouth, where you actually drink.
    eyePoint(V_TARGET, fp, SIP_FWD, SIP_SIDE, SIP_DROP);
    eyePoint(V_CARRY, fp, CARRY_FWD, CARRY_SIDE, CARRY_DROP);
    V_TARGET.lerpVectors(V_CARRY, V_TARGET, up);
    reach = Math.max(CARRY_REACH, REACH * up);
  } else {
    // A PEER. The mouth comes off the actual head bone rather than a guess
    // about how tall this model is, and forward comes from the BODY, not the
    // head, so someone mid-turn doesn't drink past their own shoulder.
    //
    // FORWARD IS -Z. Both rigs flip their model 180 degrees inside the group
    // (the FBX is authored facing the other way), so the group's -Z is the way
    // the body actually faces — the same convention placeViewmodel uses. This
    // read +Z, and so aimed the sip 13cm BEHIND the head.
    head!.getWorldPosition(V_HEAD);
    V_FWD.set(0, 0, -1).applyQuaternion(a.group.quaternion).setY(0).normalize();
    V_TARGET.copy(V_HEAD)
      .addScaledVector(V_FWD, 0.13 * up)      // out in front of the chin
      .addScaledVector(UP_AXIS, -0.10 * up);  // and a little below the eyes
    reach = REACH * up;
  }

  if (a.upperArm && a.foreArm && a.hand) {
    for (let i = 0; i < IK_PASSES; i++) armIK(a.upperArm, a.foreArm, a.hand, V_TARGET, reach);
  }
  // THE WRIST TURN that makes it a drink rather than a salute. Re-solved AFTER
  // the IK, not before: the arm above just moved the hand, and the whole point
  // of solving in world space is that the bottle no longer cares where it ended
  // up.
  orient(a, s, TIP_MAX * up);
  // …and the head tips back to meet it. Invisible in first person (that mesh
  // is cut and the camera doesn't follow the bone), harmless there.
  head?.rotateX(-HEAD_MAX * up);
}
