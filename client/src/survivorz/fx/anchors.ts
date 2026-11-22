// SURVIVORZ EFFECTS — where on each real prop an effect attaches (docs/survivorz/EFFECTS.md,
// "The real props"). The effects take their anchors from the game (a tap's mouth, a rag's
// tip, a door's leaf and glass); these are those points MEASURED on the asset bot's packed
// models (assets/downloads/survivorz/props/, metres, +Y up, origin on the floor at the
// footprint's middle), in each prop's own frame. Measured on close orthographic shots on a
// 1 cm grid and confirmed with rays (scratchpad zoom-prop.mjs); a prop re-packed means
// measured again.
import * as THREE from "three";

export type V3 = [number, number, number];

/** a tap: its mouth (the aerator's underside, the middle of it) and the bowl floor under it */
export interface TapAnchor {
  spout: V3;
  basinY: number;
}

export interface PropAnchors {
  /** taps, for effects.tapRunning */
  taps?: TapAnchor[];
  /** where a lit rag burns, for effects.litRag (the middle of the rag hanging out of the neck) */
  rag?: V3;
  /** the glass meshes, by name: each a `pane` for a door or window breaking */
  panes?: string[];
  /** the panes are round windows (a square of glass, the circle in its texture's alpha) */
  roundPanes?: boolean;
  /** the nodes that swing (a door's leaves), by name */
  leaves?: string[];
}

export const PROP_ANCHORS: Record<string, PropAnchors> = {
  // a wall basin with a single-lever mixer: the aerator at the front of the spout, 14 cm over
  // the bowl's floor
  "sink-basin": { taps: [{ spout: [0, 0.5065, -0.085], basinY: 0.312 }] },
  // a two-bowl steel sink on legs, a gooseneck tap over each bowl (the aerators are open
  // rings: a ray straight up goes through them)
  "sink-steel": { taps: [{ spout: [-0.106, 0.849, -0.077], basinY: 0.497 }, { spout: [0.52, 0.849, -0.077], basinY: 0.497 }] },
  // the rag comes out of the neck (its top at y 0.28) and hangs down the bottle's side to
  // y 0.23; it burns along all of it, the middle of it here
  molotov: { rag: [-0.03, 0.27, 0] },
  "glass-panel": { panes: ["RightDoor_Glass_0", "DoorWindow_Glass_0"] },
  // the lab doors (re-packed Oct 23: the leaves shut, each leaf node's origin on its hinge, the
  // prop's on the frame's middle — swing = turn the leaf node about Y). Glass only in a round
  // window on each leaf: a blow lands on the nearest, and only it shatters
  "lab-door-single": { panes: ["Single_door_leaf_NakedSingularity_2"], roundPanes: true, leaves: ["Single_door_leaf_NakedSingularity"] },
  "lab-door-double": {
    panes: ["Double_door_left_NakedSingularity_2", "Double_door_right_NakedSingularity_2"],
    roundPanes: true,
    leaves: ["Double_door_left_NakedSingularity", "Double_door_right_NakedSingularity"],
  },
};

/** A prop's tap in the world, wherever the prop stands (its matrixWorld up to date). */
export function tapOf(prop: THREE.Object3D, tap: TapAnchor): { spout: THREE.Vector3; basinY: number } {
  return { spout: prop.localToWorld(new THREE.Vector3(...tap.spout)), basinY: prop.localToWorld(new THREE.Vector3(tap.spout[0], tap.basinY, tap.spout[2])).y };
}

/** A point on a prop in the world (a rag's tip, each frame as the bottle moves). */
export function anchorOf(prop: THREE.Object3D, at: V3): THREE.Vector3 {
  return prop.localToWorld(new THREE.Vector3(...at));
}

/** A prop's windows, for a door event's `panes`: its glass meshes, marked round when they are. */
export function panesOf(prop: THREE.Object3D, a: PropAnchors): THREE.Object3D[] {
  const out = partsOf(prop, a.panes);
  for (const o of out) o.userData.fxRound = !!a.roundPanes;
  return out;
}

/** A prop's named meshes (its panes, its leaves), in the order the anchors list them. */
export function partsOf(prop: THREE.Object3D, names: string[] = []): THREE.Object3D[] {
  return names.map((n) => prop.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
}
