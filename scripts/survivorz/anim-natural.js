// SURVIVORZ: THE ANIMATION LAW's second half, measured — "movements and actions must look natural
// and not uncanny/robotic" (Josh, Oct 21 2026: "the arms, hands, shoulders, head, etc all need to
// look natural ... you need to validate till you get it right").
//
// Natural is not a guess here: it is what real people did. Every motion-capture clip a body has
// (Mixamo, the UAL packs, the Halloween mocap — anything not built in code) is a sample of a real
// body moving, so the BASELINE is the range those clips cover, per joint, per body; a clip is
// unnatural where it leaves that range. Measured per frame, from the bones:
//   elbowHinge  the elbow bending sideways or backwards: it is a hinge, so in the upper arm's own
//               frame the forearm only ever swings one way (degrees off that way, once bent)
//   wristFlex / wristDev   the hand bent at the wrist, the two ways (degrees, signed)
//   wristRoll   the hand ROLLED at the wrist: a real forearm rolls along its length (mocap puts it
//               on the forearm bone); rolled at the wrist the skin twists like a candy wrapper
//   foreRoll    the forearm's roll against the upper arm (pronation/supination)
//   armRoll     the upper arm's roll in the shoulder
//   headYaw / headPitch / headTilt   the head against the chest
//   speed / jerk    how fast each joint turns (deg/s) and how suddenly that changes (deg/s²) —
//               "jerking" is a jerk spike; a loop is measured across its seam too
// Everything is relative to the bind pose, so the numbers mean the same on every body of a rig.
import * as THREE from "three";

const D = 180 / Math.PI;
const SIDES = ["l", "r"];
// EVERY JOINT OF THE BODY (Josh, Oct 22 2026: "all joints of the body need to pass a natural
// validation check"): the spine, neck and head, both collarbones, arms, hands and every finger
// joint, both legs, feet and toes. The face and the never-driven twist bones are not joints.
const FINGERS = ["thumb", "index", "middle", "ring", "pinky"].flatMap((f) => ["01", "02", "03"].map((k) => `${f}_${k}`));
export const JOINTS = ["spine_01", "spine_02", "spine_03", "neck", "head",
  ...SIDES.flatMap((s) => ["shoulder", "upperarm", "lowerarm", "hand", ...FINGERS, "upperleg", "lowerleg", "foot", "ball"].map((b) => `${b}_${s}`))];
// the HINGES: joints that only ever bend one way (the knee, the elbow, every finger's middle and
// end knuckle) — the child's way in the hinge's parent frame, like the elbow's check
export const HINGES = JOINTS.filter((b) => /^(lowerarm|lowerleg|(thumb|index|middle|ring|pinky)_0[23])_[lr]$/.test(b));
export const SMOOTH_BONES = JOINTS;
// split a rotation into the part about `axis` (twist) and the rest (swing): degrees of twist,
// signed, and the swing as a rotation vector
export function swingTwist(q, axis) {
  const p = new THREE.Vector3(q.x, q.y, q.z).projectOnVector(axis);
  const t = new THREE.Quaternion(p.x, p.y, p.z, q.w); if (t.lengthSq() < 1e-12) t.set(0, 0, 0, 1); t.normalize();
  const twist = 2 * Math.atan2(new THREE.Vector3(t.x, t.y, t.z).dot(axis), t.w) * D;
  const s = q.clone().multiply(t.clone().invert());
  return { twist: wrap(twist), swing: rotVec(s) };
}
const wrap = (a) => ((a + 540) % 360) - 180;
function rotVec(q) {
  if (q.w < 0) q = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
  const s = Math.sqrt(Math.max(0, 1 - q.w * q.w)), a = 2 * Math.acos(Math.min(1, q.w));
  return s < 1e-6 ? new THREE.Vector3() : new THREE.Vector3(q.x / s, q.y / s, q.z / s).multiplyScalar(a * D);
}
// a bone's turn away from its bind pose, in its OWN frame (rest^-1 * local): its twist about its
// own length is a roll, the rest a swing
const delta = (b, restQ) => restQ(b).clone().invert().multiply(b.quaternion);
const axisTo = (child) => child.position.clone().normalize();

// one arm's measures (degrees). bone(n) -> THREE.Bone; restQ(bone) -> its bind-pose local quaternion
export function armMeasures(bone, restQ, s) {
  const up = bone("upperarm_" + s), lo = bone("lowerarm_" + s), ha = bone("hand_" + s);
  const m = {};
  // the elbow: the forearm's way in the upper arm's frame — a hinge only ever bends it one way
  const upAxis = axisTo(lo), loAxis = axisTo(ha);
  const fore = loAxis.clone().applyQuaternion(lo.quaternion);
  m.elbowBend = Math.acos(Math.max(-1, Math.min(1, fore.dot(upAxis)))) * D;
  const side = fore.clone().addScaledVector(upAxis, -fore.dot(upAxis));
  const ref1 = new THREE.Vector3(0, 1, 0).addScaledVector(upAxis, -upAxis.y).normalize(), ref2 = new THREE.Vector3().crossVectors(upAxis, ref1);
  m.elbowDir = side.lengthSq() > 1e-8 ? Math.atan2(side.dot(ref2), side.dot(ref1)) * D : null;
  // the wrist, in the hand's own frame: roll about the hand's length, bend across the knuckles
  // (flex) and in the palm's plane (deviation)
  const hAxis = axisTo(bone("middle_01_" + s)), across = bone("index_01_" + s).position.clone().sub(bone("pinky_01_" + s).position);
  across.addScaledVector(hAxis, -across.dot(hAxis)).normalize();
  const palmN = new THREE.Vector3().crossVectors(hAxis, across);
  const w = swingTwist(delta(ha, restQ), hAxis);
  m.wristRoll = w.twist; m.wristFlex = w.swing.dot(across); m.wristDev = w.swing.dot(palmN);
  m.foreRoll = swingTwist(delta(lo, restQ), loAxis).twist;
  m.armRoll = swingTwist(delta(up, restQ), upAxis).twist;
  // the shoulder girdle: how high the upper arm is lifted (0 hanging, 90 out level, 180 overhead,
  // against the chest) and how far the collarbone has risen with it (scapulohumeral rhythm)
  const chestQ = bone("spine_03").getWorldQuaternion(new THREE.Quaternion());
  const chestDown = new THREE.Vector3(0, -1, 0).applyQuaternion(chestQ);
  const armDir = lo.getWorldPosition(new THREE.Vector3()).sub(up.getWorldPosition(new THREE.Vector3())).normalize();
  m.armLift = Math.acos(Math.max(-1, Math.min(1, armDir.dot(chestDown)))) * D;
  const sh = bone("shoulder_" + s), chestUp = chestDown.clone().negate();
  const clav = up.getWorldPosition(new THREE.Vector3()).sub(sh.getWorldPosition(new THREE.Vector3()));
  m.clavRise = Math.asin(Math.max(-1, Math.min(1, clav.normalize().dot(chestUp)))) * D;
  return m;
}
// THE FOREARM CARRIES THE ROLL: move `deg` of roll off the wrist onto the forearm, the hand's
// world turn unchanged (the forearm turns about its own length, the hand back the other way)
export function rollIntoForearm(bone, s, deg) {
  const lo = bone("lowerarm_" + s), ha = bone("hand_" + s);
  const T = new THREE.Quaternion().setFromAxisAngle(axisTo(ha), deg / D);
  lo.quaternion.multiply(T); ha.quaternion.premultiply(T.clone().invert());
  lo.updateMatrixWorld(true);
}
// every joint's turn from its bind pose (its own frame, as a rotation vector, degrees) and every
// hinge's bend and bending way. bone(n) may answer null (a rig without that joint)
export function jointMeasures(bone, rest) {
  const m = {};
  for (const n of JOINTS) {
    const b = bone(n); if (!b || !rest[b.name]) continue;
    const v = rotVec(rest[b.name].clone().invert().multiply(b.quaternion));
    m[`j:${n}:x`] = v.x; m[`j:${n}:y`] = v.y; m[`j:${n}:z`] = v.z;
  }
  for (const n of HINGES) {
    const b = bone(n); if (!b) continue;
    const child = b.children.find((c) => c.isBone && c.position.lengthSq() > 1e-10); if (!child) continue;
    const pAxis = b.position.clone().normalize();   // the parent bone's length, in the parent's frame
    const cAxis = child.position.clone().normalize().applyQuaternion(b.quaternion);   // this one's, in the parent's frame
    const bend = Math.acos(Math.max(-1, Math.min(1, cAxis.dot(pAxis)))) * D;
    const side = cAxis.clone().addScaledVector(pAxis, -cAxis.dot(pAxis));
    const r1 = new THREE.Vector3(0, 1, 0).addScaledVector(pAxis, -pAxis.y); if (r1.lengthSq() < 1e-6) r1.set(1, 0, 0).addScaledVector(pAxis, -pAxis.x); r1.normalize();
    const r2 = new THREE.Vector3().crossVectors(pAxis, r1);
    m[`hingeBend:${n}`] = bend;
    m[`hingeDir:${n}`] = side.lengthSq() > 1e-8 ? Math.atan2(side.dot(r2), side.dot(r1)) * D : null;
  }
  return m;
}
// one pose's measures (both arms and the head). rest: { [boneName]: local quaternion, __headRel }
export function poseMeasures(bone, rest) {
  const m = {}, restQ = (b) => rest[b.name];
  for (const s of SIDES) for (const [k, v] of Object.entries(armMeasures(bone, restQ, s))) m[k + "_" + s] = v;
  // the head against the chest: in the chest's frame
  const chest = bone("spine_03"), head = bone("head");
  const rel = chest.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(head.getWorldQuaternion(new THREE.Quaternion()));
  // read in the body's own up / forward / side at rest (a rig's spine bones point their own x
  // up the spine, so the bone's axes say nothing about which way is a nod or a turn)
  const v = rotVec(rel.multiply(rest.__headRel.clone().invert())).applyQuaternion(rest.__chestW);
  m.headYaw = v.y; m.headPitch = v.x; m.headTilt = v.z;
  Object.assign(m, jointMeasures(bone, rest));
  return m;
}
// the head-against-chest at bind, which poseMeasures measures from (rest.__headRel)
export const chestRest = (bone) => bone("spine_03").getWorldQuaternion(new THREE.Quaternion());
export function headRest(bone) {
  const chest = bone("spine_03"), head = bone("head");
  return chest.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(head.getWorldQuaternion(new THREE.Quaternion()));
}
// speed and jerk, per bone, from successive local rotations sampled at fps (a loop wraps)
export function motionMeasures(frames, fps, loop) {
  // frames: [{ boneName: THREE.Quaternion (local) }]
  const n = frames.length, out = { speed: {}, jerk: {} };
  for (const b of SMOOTH_BONES) {
    if (!frames[0][b]) continue;
    const vel = [];
    const last = loop ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = frames[i][b], c = frames[(i + 1) % n][b];
      vel.push(rotVec(c.clone().multiply(a.clone().invert())).multiplyScalar(fps));
    }
    let sp = 0, spAt = 0, jk = 0, jkAt = 0;
    vel.forEach((v, i) => { const l = v.length(); if (l > sp) { sp = l; spAt = i; } });
    const lastJ = loop ? vel.length : vel.length - 1;
    for (let i = 0; i < lastJ; i++) { const j = vel[(i + 1) % vel.length].clone().sub(vel[i]).length() * fps; if (j > jk) { jk = j; jkAt = i + 1; } }
    out.speed[b] = [sp, spAt / fps]; out.jerk[b] = [jk, jkAt / fps];
  }
  return out;
}
