// SLORP's vial as a thing you can HOLD (Oct 2026). Until somebody could hand
// you one, the vial never left Sterling's counter — you knocked it back where
// you stood. Now it can sit in a pocket, so it needs a body: a small corked
// glass tube of the green stuff. Procedural like the canister and the shot
// glass (nothing in the hall looks like it); drinkanim sizes it to the hand.

import * as THREE from "three";

let mats: { glass: THREE.Material; goop: THREE.Material; cork: THREE.Material } | null = null;

export function makeVial(): THREE.Object3D {
  mats ??= {
    glass: new THREE.MeshLambertMaterial({ color: 0xdfece4, transparent: true, opacity: 0.32, forceSinglePass: true }),
    goop: new THREE.MeshLambertMaterial({ color: 0x8ee05a, emissive: 0x2c5a14 }),
    cork: new THREE.MeshLambertMaterial({ color: 0x8a6a44 }),
  };
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 12, 1, true), mats.glass);
  tube.position.y = 0.5;
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.glass);
  bottom.position.y = 0.05;
  const goop = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.55, 12), mats.goop);
  goop.position.y = 0.33;
  const goopEnd = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.goop);
  goopEnd.position.y = 0.06;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.18, 10), mats.cork);
  cork.position.y = 1.0;
  g.add(tube, bottom, goop, goopEnd, cork);
  return g;
}
