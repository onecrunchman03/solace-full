// SURVIVORZ: geometry-only copies of the packed props a room places, for the room's light bake.
//
//   node scripts/survivorz/room-bakeprops.mjs [layout.json]   (default: the Vault Lobby's)
//   → assets/downloads/survivorz/rooms/bake-props/<id>.glb
//
// The bake (room-build.py) needs each prop's SHAPE where the room places it, so its shadow and the
// darkening under it are in the lightmap. Blender can't read the packed files (KTX2 textures,
// meshopt geometry, quantized positions), so these copies drop the textures and decode the rest.
// Made from the PACKED prop, never its source: the bake and the game then see the same geometry,
// the same origin and the same size.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dequantize, prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROPS = path.join(ROOT, "assets", "downloads", "survivorz", "props");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "rooms", "bake-props");
const layout = JSON.parse(fs.readFileSync(process.argv[2] ?? path.join(ROOT, "client", "src", "survivorz", "room", "vault-lobby.json"), "utf8"));
fs.mkdirSync(OUT, { recursive: true });

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const ids = [...new Set([...layout.props.map((p) => p.id), "vault-door", ...layout.fixtures.filter((f) => f.kind === "caged").map(() => "caged-light"), ...layout.fixtures.filter((f) => f.kind === "emergency").map(() => "emergency-light"), ...layout.fixtures.filter((f) => f.kind === "exit").map(() => "exit-sign")])];
for (const id of ids) {
  const src = path.join(PROPS, `${id}.glb`);
  if (!fs.existsSync(src)) { console.error(`missing packed prop ${id}`); process.exitCode = 1; continue; }
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const m of root.listMaterials()) {
    m.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    // and no glow: with its map gone, an emissive factor lights the WHOLE mesh, and the bake recorded
    // a turnstile's LED skirt (and every glowing screen) as light on the floor. The fixtures' light is
    // room-build.py's own bake lights; the power is out for everything else
    m.setEmissiveFactor([0, 0, 0]);
    m.getExtension("KHR_materials_emissive_strength")?.dispose();
  }
  for (const t of root.listTextures()) t.dispose();
  for (const e of root.listExtensionsUsed()) {
    if (["KHR_texture_basisu", "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_transform"].includes(e.extensionName)) e.dispose();
  }
  await doc.transform(dequantize(), prune());
  await io.write(path.join(OUT, `${id}.glb`), doc);
  console.log("bake copy", id);
}
