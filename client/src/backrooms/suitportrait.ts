// THE SUIT PORTRAIT (Josh, Sep 2026: "replace the shop photos of the suit
// with an actual picture of what the suit looks like … dr adas store and
// inventories in the backrooms and casino").
//
// Every place that shows a suit used to show the pack's store photo (a real
// photograph of a yellow suit on white) pushed through the colorway's CSS
// filter. This renders THE ACTUAL MODEL — hazmat.fbx wearing the same canvas
// texture the game wears (suitCanvas: recolour + trim + sheen), standing in
// the idle clip's pose — to a small transparent portrait, once per colorway,
// and hands back a data URL. What the shelf shows is now literally what
// walks around the corner: the uniformity law with no second copy of anything.
//
// Cost: three.js and the FBX loader load LAZILY on the first portrait (they
// live in their own chunk; a hub page that never shows a suit never pays),
// plus hazmat.fbx (92K) and the idle clip. One tiny WebGL renderer is kept
// for the session; each colorway renders once and is cached. No WebGL (a
// preview thumbnail, a blocked context) resolves to null and callers keep
// the filtered photo, so nothing ever shows a blank.
import { suitCanvas } from "./suitcolor";

const cache = new Map<string, Promise<string | null>>();

export const PORTRAIT_W = 240;
export const PORTRAIT_H = 400;

interface Rig {
  THREE: typeof import("three");
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  base: import("three").Group;
  idle: import("three").AnimationClip | null;
  height: number;
  minY: number;
}

let rigPromise: Promise<Rig | null> | null = null;

function loadRig(): Promise<Rig | null> {
  if (rigPromise) return rigPromise;
  const p = (async () => {
    try {
      const THREE = await import("three");
      const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
      const canvas = document.createElement("canvas");
      canvas.width = PORTRAIT_W;
      canvas.height = PORTRAIT_H;
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      } catch {
        return null;
      }
      renderer.setPixelRatio(1);
      renderer.setSize(PORTRAIT_W, PORTRAIT_H, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const loader = new FBXLoader();
      const load = (url: string) => new Promise<import("three").Group>((res, rej) => loader.load(url, res, undefined, rej));
      const [fbx, idleFbx] = await Promise.all([
        load("/assets/hazmat/hazmat.fbx"),
        load("/assets/hazmat/anim/idle.fbx").catch(() => null),
      ]);
      const box = new THREE.Box3().setFromObject(fbx);
      const height = Math.max(0.01, box.max.y - box.min.y);

      const scene = new THREE.Scene();
      // A studio: soft sky/ground fill, a warm key from the front-left, a
      // cool rim from behind-right so the metal trim catches something.
      scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4a3a, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(-1.6, 2.6, 2.4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xcfe4ff, 0.9);
      rim.position.set(1.8, 1.8, -2.2);
      scene.add(rim);

      // Framed on the sheet: the body fills the height with a little air.
      const camera = new THREE.PerspectiveCamera(24, PORTRAIT_W / PORTRAIT_H, 0.1, 20);
      camera.position.set(0.08, 1.0, 4.35);
      camera.lookAt(0, 0.9, 0);

      return { THREE, renderer, scene, camera, base: fbx, idle: idleFbx?.animations?.[0] ?? null, height, minY: box.min.y };
    } catch {
      return null;
    }
  })();
  rigPromise = p;
  // A transient failure (a chunk 404 mid-deploy, a fetch that dropped) must
  // not pin the session on the photo: forget it and let the next ask retry.
  void p.then((rig) => { if (!rig) rigPromise = null; });
  return p;
}

/** The portrait of the real model in this colorway, as a data URL — or
 *  null where WebGL can't run (callers fall back to the filtered photo). */
export function suitPortraitUrl(color: string): Promise<string | null> {
  const key = color || "yellow";
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const { canvas, ready } = suitCanvas(key);
    await ready;
    return renderSuitPortrait(canvas);
  })().catch(() => null);
  cache.set(key, p);
  void p.then((url) => { if (!url) cache.delete(key); }); // retry next time, not never
  return p;
}

// The review hook (the casino's `__cas.*` shape): the UV-mapping sheet that
// places the trim calls this from the console with a colour-grid canvas.
// Without a caller the bundler would drop the export.
if (typeof window !== "undefined") (window as { __suitPortrait?: unknown }).__suitPortrait = renderSuitPortrait;

/** Render the model wearing ANY 256² atlas canvas. `unlit` swaps the
 *  studio for a flat material — the UV-mapping sheet that placed the trim
 *  was made with it (paint a colour grid, render, read where each cell
 *  lands on the body). Null where WebGL can't run. */
export async function renderSuitPortrait(canvas: HTMLCanvasElement, unlit = false): Promise<string | null> {
  try {
    const rig = await loadRig();
    if (!rig) return null;
    const { THREE, renderer, scene, camera, base, idle, height, minY } = rig;
    const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
    const model = clone(base) as import("three").Group;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; // the PS1 crunch, as in the game
    const mat = unlit ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    model.traverse((o) => {
      const m = o as import("three").Mesh;
      if (m.isMesh || (o as import("three").SkinnedMesh).isSkinnedMesh) {
        m.material = mat;
        m.frustumCulled = false;
      }
    });
    const scale = 1.72 / height;
    model.scale.setScalar(scale);
    model.position.y = -minY * scale;
    // MEASURED, not assumed: rendered straight on, the rig showed its LEFT
    // side to a camera on +Z (the FBX root carries its own turn), so a
    // quarter turn brings the face round, and a little less than that
    // gives the three-quarter hero angle.
    model.rotation.y = Math.PI / 2 - 0.4;
    // Stand it in the idle clip rather than the bind pose — sampled near
    // the start, where the weight is even (0.6s in was mid-shift and read
    // as a stride).
    let mixer: import("three").AnimationMixer | null = null;
    if (idle) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(idle).play();
      mixer.update(0.08);
    }
    scene.add(model);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/png");
    scene.remove(model);
    mixer?.stopAllAction();
    tex.dispose();
    mat.dispose();
    return url;
  } catch {
    return null;
  }
}
