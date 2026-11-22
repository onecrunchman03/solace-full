// SURVIVORZ, GLENRIDGE HALL: how many metres one repeat of each Poly Haven scan really covers (their own figure),
// so brick is brick-sized. Writes texture-sizes.json beside this file; build.py reads it.
//   node scripts/survivorz/glenridge/texture-sizes.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = process.env.SURVIVORZ_ASSETS ?? path.join(HERE, "../../../assets/downloads/survivorz");
const out = {};
for (const id of fs.readdirSync(path.join(ASSETS, "free/polyhaven"))) {
  if (!fs.existsSync(path.join(ASSETS, "free/polyhaven", id, `${id}_diff_2k.jpg`))) continue;
  try {
    const r = await fetch("https://api.polyhaven.com/info/" + id, { headers: { "user-agent": "solace-map-build" } });
    const j = await r.json();
    if (j.dimensions) out[id] = [j.dimensions[0] / 1000, j.dimensions[1] / 1000];
  } catch { /* leave it out: build.py keeps its own figure */ }
}
fs.writeFileSync(path.join(HERE, "texture-sizes.json"), JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, "sizes");
