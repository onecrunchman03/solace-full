// SURVIVORZ, GLENRIDGE HALL: the mansion's CC0 surfaces from Poly Haven (2k: colour, GL normal, roughness, displacement)
// and its sky. Into assets/downloads/survivorz/free/polyhaven/<id>/ beside the other maps' scans.
//   node scripts/survivorz/glenridge/fetch-textures.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ASSETS = process.env.SURVIVORZ_ASSETS ?? path.join(ROOT, "assets/downloads/survivorz");
const OUT = path.join(ASSETS, "free/polyhaven");
export const TEXTURES = [
  // outside walls and roof
  "red_brick_03", "medieval_red_brick", "red_bricks_04", "roof_slates_02", "roof_slates_03", "grey_roof_tiles_02",
  "white_stucco_02", "rough_plaster_03", "stacked_stone_wall", "large_sandstone_blocks", "sandstone_blocks_05",
  // timber
  "black_oak_veneer", "oak_veneer_01", "mocha_oak_veneer", "dark_wooden_planks", "beam_wall_01",
  // inside walls and floors
  "yellow_plaster", "painted_plaster_wall", "wood_floor_worn", "old_wood_floor", "herringbone_parquet",
  "slate_floor_02", "checkered_pavement_tiles", "terracotta_floor_tiles", "marble_01", "mixed_stone_tiles", "stone_tiles_02",
  // cloth and leather
  "velour_velvet", "fabric_pattern_05", "fabric_pattern_07", "leather_red_02",
  // the grounds
  "gravel_road", "gravel_floor", "slate_driveway", "forest_leaves_02", "forest_leaves_03", "leafy_grass", "sparse_grass",
  "forest_ground_04", "leaf_scattered_gravel", "dry_decay_leaves", "bark_brown_02", "pine_bark", "red_brick_pavers", "herringbone_brick",
];
const MAPS = { Diffuse: "diff", nor_gl: "nor_gl", Rough: "rough", Displacement: "disp", AO: "ao" };
const get = async (u) => { const r = await fetch(u, { headers: { "user-agent": "solace-map-build" } }); if (!r.ok) throw new Error(u + " " + r.status); return r; };
let n = 0, skipped = 0;
for (const id of TEXTURES) {
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  let files;
  try { files = await (await get("https://api.polyhaven.com/files/" + id)).json(); } catch (e) { console.log("MISSING", id, e.message); continue; }
  for (const [key, short] of Object.entries(MAPS)) {
    const f = files[key]?.["2k"]?.jpg;
    if (!f) continue;
    const dst = path.join(dir, `${id}_${short}_2k.jpg`);
    if (fs.existsSync(dst) && fs.statSync(dst).size === f.size) { skipped++; continue; }
    fs.writeFileSync(dst, Buffer.from(await (await get(f.url)).arrayBuffer()));
    n++;
  }
  console.log("ok", id);
}
console.log(`${n} files fetched, ${skipped} already there`);
