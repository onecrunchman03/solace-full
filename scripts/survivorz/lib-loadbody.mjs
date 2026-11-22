// SURVIVORZ: load a packed body in plain Node the way the game does (three's GLTFLoader, meshopt
// decoded, textures dropped — no GPU, no browser). Shared by the show's headless checks
// (anim-show-check.mjs, pack-fit.mjs). Lifted from rollo-pack-check.mjs.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TJS = path.join(ROOT, "client", "node_modules", "three");
export const THREE = await import(pathToFileURL(path.join(TJS, "build", "three.module.js")).href);
const { GLTFLoader } = await import(pathToFileURL(path.join(TJS, "examples", "jsm", "loaders", "GLTFLoader.js")).href);
export const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

/** a glb as three's GLTF (no textures). `keep(name)` drops the clips it returns false for (memory). */
export async function loadBody(file, keep = () => true) {
  const doc = await io.read(file);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const a of doc.getRoot().listAnimations()) if (!keep(a.getName())) a.dispose();
  for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|texture|ktx/i.test(e.extensionName)) e.dispose();
  const glb = await io.writeBinary(doc);
  return new Promise((res, rej) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "", res, rej));
}

/** a bone by its rig name (actors.ts findBoneLike) */
export function boneLike(root, name) {
  const clean = THREE.PropertyBinding.sanitizeNodeName(name);
  // (the exact name before one that only ends in it, a bone before anything else: actors.ts findBoneLike)
  let best, rank = 9;
  root.traverse((o) => {
    const exact = o.name === name || o.name === clean;
    if (!exact && !o.name.endsWith(`_${clean}`)) return;
    const r = (exact ? 0 : 2) + (o.isBone ? 0 : 1);
    if (r < rank) { rank = r; best = o; }
  });
  return best;
}
