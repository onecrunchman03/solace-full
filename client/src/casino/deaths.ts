// THE FLOOR — the stage death. Josh's explicit ask for the casino: a death slot
// on the stage Wheel does not just fade you out, it THROWS you off the stage,
// hard, before the Terminated cinematic takes the screen.
//
// The simulation is the backrooms' ragdoll, unchanged — a 15-particle verlet
// figure driving the real skeleton's bones, colliding against the same grid
// queries the player walks on. Only the throw is casino-specific: launched away
// from the stage centre hard enough to clear the platform, because
// falling off a stage in front of the room is the whole point of the moment.

import * as THREE from "three";
import { makeRagdollBody } from "../backrooms/world";
import { createRagdoll, type Ragdoll, type RagdollImpact, type RagdollWorld } from "../backrooms/ragdoll";
import { stageThrowAim, THROW_POWER } from "./layout";

// THROW_POWER lives in layout.ts (with the measurements behind it) so the
// harness can reach it without importing THREE.
/** How long a settled body lies on the floor before it is cleaned up. The
 *  VICTIM stops seeing it almost immediately — the Terminated cinematic takes
 *  their screen — so this length is entirely for the people still on the floor,
 *  and for them the body IS the event. Nine seconds had it blinking out while
 *  the room was still walking over to look. */
const LINGER_MS = 45000;

interface Active {
  group: THREE.Group;
  rag: Ragdoll | null;
  settledAt: number;
  /** Set for a COLLAPSE: the body stays until its owner is revived, and the
   *  linger clock never touches it (you can be out cold for a minute). */
  key?: string;
}

export interface DeathThrower {
  /** Throw a body off the stage. `x`/`y` are cells — where they were standing
   *  when the wheel killed them. Returns immediately; the body is built async
   *  because the hazmat model loads on demand. */
  throwOff(opts: { x: number; y: number; suit: string; seed: number }): void;
  /** Drop where you stand — the bar's pass-out. Same simulation, no launch:
   *  power 0 is a crumple, so the body folds onto the carpet instead of being
   *  fired off a stage (Josh, Aug 2026: "just ragdoll the character"). Keyed
   *  by owner so `revive` can take it away when they come round; a second
   *  collapse under the same key is ignored rather than stacking bodies. */
  collapse(opts: { key: string; x: number; y: number; suit: string; seed: number; dir: number }): void;
  /** SHOT (the casino gun): keyed like a collapse — the victim respawns in
   *  10s and the body must leave with them — but LAUNCHED like a stage death,
   *  along the bullet's line at the gun's own power (Josh: "ragdoll out very
   *  intensely"). `dir` and `seed` come off the wire so every client throws
   *  the identical body; the rest spot is aimed downrange and the sim's own
   *  wall collisions do the clamping. */
  shot(opts: { key: string; x: number; y: number; suit: string; seed: number; dir: number; power: number; reach: number }): void;
  /** Is this owner currently lying down? (Drives hiding their walking body.) */
  isDown(key: string): boolean;
  /** Where a collapsed body's pelvis is, world metres — what the out-cold
   *  camera watches. Null until the model has loaded and bound. */
  bodyAt(key: string): { x: number; y: number; z: number } | null;
  /** Take a collapsed body away — they woke up, or they left the floor. */
  revive(key: string): void;
  tick(dt: number): void;
  dispose(): void;
  /** Bodies in flight or lying on the floor — dev/verification hook, and the
   *  only way to tell "nothing was thrown" from "thrown but invisible". The
   *  sim's `pelvis` and the mesh's `box` are reported separately ON PURPOSE:
   *  a skinned mesh's object never moves (its bones deform it), so those two
   *  diverging is exactly the failure worth catching. */
  debug(): {
    count: number;
    bound: number;
    settled: number;
    pelvis: [number, number, number] | null;
    mesh: [number, number, number] | null;
    meshes: number;
    bones: number;
    box: { size: number[]; centre: number[] } | null;
    visible: boolean;
    inScene: boolean;
  };
}

export function createDeathThrower(
  scene: THREE.Scene,
  world: RagdollWorld & { groundAt(x: number, y: number): number },
  /** Hard contacts (floor slams, wall hits) — the game screen turns these into
   *  distance-faded thuds, exactly as the backrooms wires its ragdolls. */
  onImpact?: (i: RagdollImpact) => void,
): DeathThrower {
  const active: Active[] = [];

  const drop = (a: Active): void => {
    a.rag?.dispose();
    scene.remove(a.group);
    a.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    const i = active.indexOf(a);
    if (i >= 0) active.splice(i, 1);
  };

  return {
    throwOff({ x, y, suit, seed }) {
      const { dir, restX, restY } = stageThrowAim(x, y);
      const entry: Active = { group: null as unknown as THREE.Group, rag: null, settledAt: 0 };
      entry.group = makeRagdollBody(
        scene, suit, x, y, world.groundAt(x, y), dir,
        (model) => {
          entry.rag = createRagdoll({
            world, model, dir, power: THROW_POWER, seed, restX, restY, onImpact,
          });
          // A rig mismatch returns null rather than throwing; the body then just
          // lies where it fell instead of taking the room down with it.
          if (!entry.rag) entry.settledAt = performance.now();
        },
      );
      active.push(entry);
    },

    collapse({ key, x, y, suit, seed, dir }) {
      if (active.some((a) => a.key === key)) return;
      const entry: Active = { group: null as unknown as THREE.Group, rag: null, settledAt: 0, key };
      entry.group = makeRagdollBody(
        scene, suit, x, y, world.groundAt(x, y), dir,
        (model) => {
          entry.rag = createRagdoll({
            // power 0: no launch. The body still has the seeded per-particle
            // jitter, so a drunk folds a different way every time.
            world, model, dir, power: 0, seed, restX: x, restY: y, onImpact,
          });
          if (!entry.rag) entry.settledAt = performance.now();
        },
      );
      active.push(entry);
    },

    shot({ key, x, y, suit, seed, dir, power, reach }) {
      if (active.some((a) => a.key === key)) return;
      const entry: Active = { group: null as unknown as THREE.Group, rag: null, settledAt: 0, key };
      entry.group = makeRagdollBody(
        scene, suit, x, y, world.groundAt(x, y), dir,
        (model) => {
          entry.rag = createRagdoll({
            world, model, dir, power, seed,
            restX: x + Math.sin(dir) * reach,
            restY: y + Math.cos(dir) * reach,
            onImpact,
          });
          if (!entry.rag) entry.settledAt = performance.now();
        },
      );
      active.push(entry);
    },

    isDown: (key) => active.some((a) => a.key === key),

    bodyAt: (key) => active.find((a) => a.key === key)?.rag?.pelvis() ?? null,

    revive(key) {
      for (const a of [...active]) if (a.key === key) drop(a);
    },

    tick(dt) {
      const now = performance.now();
      // index walk, not a per-frame clone — drop() splices, so re-check the slot
      for (let i = 0; i < active.length; i++) {
        const a = active[i];
        if (a.rag && !a.settledAt) {
          if (!a.rag.tick(dt)) a.settledAt = now;
        } else if (a.settledAt && !a.key && now - a.settledAt > LINGER_MS) {
          drop(a);
          if (active[i] !== a) i--;
        }
      }
    },

    dispose() {
      for (const a of [...active]) drop(a);
    },

    debug() {
      const a0 = active.find((a) => a.rag);
      const p = a0?.rag?.pelvis();
      // Where the actual MESH is, as opposed to where the simulation thinks the
      // body is — the two diverging is exactly the bug worth catching.
      let mesh: [number, number, number] | null = null;
      let meshes = 0;
      let visible = true;
      if (a0?.group) {
        const v = new THREE.Vector3();
        a0.group.traverse((o) => {
          const sm = o as THREE.SkinnedMesh;
          if (sm.isSkinnedMesh || (o as THREE.Mesh).isMesh) {
            meshes++;
            if (!mesh) {
              o.getWorldPosition(v);
              mesh = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
              visible = o.visible && (o.parent?.visible ?? true);
            }
          }
        });
      }
      // The rendered EXTENT. A skinned mesh's object never moves — its bones
      // deform it — so a collapsed or unbound skeleton shows up here as a
      // degenerate box while every other flag still reads healthy.
      let box: { size: number[]; centre: number[] } | null = null;
      let bones = 0;
      if (a0?.group) {
        a0.group.updateMatrixWorld(true);
        a0.group.traverse((o) => {
          const sm = o as THREE.SkinnedMesh;
          if (sm.isSkinnedMesh && sm.skeleton) bones = sm.skeleton.bones.length;
        });
        const b = new THREE.Box3().setFromObject(a0.group);
        if (!b.isEmpty()) {
          const s = b.getSize(new THREE.Vector3());
          const c = b.getCenter(new THREE.Vector3());
          box = {
            size: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)],
            centre: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
          };
        }
      }
      return {
        count: active.length,
        bound: active.filter((a) => a.rag).length,
        settled: active.filter((a) => a.settledAt).length,
        pelvis: p ? [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] : null,
        mesh,
        meshes,
        bones,
        box,
        visible,
        inScene: !!a0?.group.parent,
      };
    },
  };
}

