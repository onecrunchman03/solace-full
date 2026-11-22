// TWO-BONE IK, shared by every world that bends a limb (moved out of backrooms/world.ts, Nov 2026, so the
// Survivorz show's feet can use it without loading the Backrooms).
//
// ARM IK (July 2026 — "attach the model to the right hand and animate it"). A tiny CCD solver: pull the END bone
// (a hand, a foot) toward a world target by rotating the middle joint then the top one, two sweeps.
// Axis-agnostic on purpose — it only uses world positions and setFromUnitVectors, so a rig's undocumented bone
// axes can't betray it. Runs AFTER the mixer each frame, so nothing accumulates (the rest-reset rule holds).
import * as THREE from "three";

const IK_J = new THREE.Vector3();
const IK_H = new THREE.Vector3();
const IK_A = new THREE.Vector3();
const IK_B = new THREE.Vector3();
const IK_Q = new THREE.Quaternion();
const IK_PQ = new THREE.Quaternion();
const IK_DQ = new THREE.Quaternion();
const IK_GOAL = new THREE.Quaternion();
export function armIK(
  upper: THREE.Object3D,
  fore: THREE.Object3D,
  hand: THREE.Object3D,
  target: THREE.Vector3,
  blend: number,
): void {
  for (let iter = 0; iter < 2; iter++) {
    for (const joint of [fore, upper]) {
      if (!joint.parent) continue;
      joint.getWorldPosition(IK_J);
      hand.getWorldPosition(IK_H);
      IK_A.copy(IK_H).sub(IK_J);
      IK_B.copy(target).sub(IK_J);
      if (IK_A.lengthSq() < 1e-6 || IK_B.lengthSq() < 1e-6) continue;
      IK_Q.setFromUnitVectors(IK_A.normalize(), IK_B.normalize());
      joint.parent.getWorldQuaternion(IK_PQ);
      IK_DQ.copy(IK_PQ).invert().multiply(IK_Q).multiply(IK_PQ);
      IK_GOAL.copy(joint.quaternion).premultiply(IK_DQ);
      joint.quaternion.slerp(IK_GOAL, blend);
    }
  }
}
