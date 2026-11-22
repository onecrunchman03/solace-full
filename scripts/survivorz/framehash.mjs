// Frame hash: seeds 1,2,3, three sim-hours each (or `node scripts/survivorz/framehash.mjs <hours>`); sha256 over every frame (snapshot's `map` key dropped) and the final save.
// Run before and after a refactor that must not change the bunker: the six lines must match.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { SimWorld } = require(path.join(ROOT, "dist", "survivorz", "sim", "world.js"));
const { encodeGraph } = require(path.join(ROOT, "dist", "survivorz", "sim", "save.js"));
const strip = (f) => { if (f && typeof f === "object" && "map" in f && (f.type === "snap" || f.type === "snapshot" || Array.isArray(f.bodies))) { const g = { ...f }; delete g.map; return g; } return f; };
const HOURS = Number(process.argv[2] ?? 3);
for (const seed of [1, 2, 3]) {
  const h = createHash("sha256"); let n = 0; const kinds = {};
  const w = new SimWorld({ seed, start: 1_800_000_000_000 });
  w.onFrame((f) => { h.update(JSON.stringify(strip(f))); n++; kinds[f.type] = (kinds[f.type] ?? 0) + 1; });
  h.update(JSON.stringify(strip(w.snapshot())));
  const total = HOURS * 3_600_000;
  for (let t = 0; t < total; t += 100) w.tick(100);
  h.update(JSON.stringify(strip(w.snapshot())));
  const save = createHash("sha256").update(encodeGraph(w.saveState())).digest("hex");
  console.log(`seed ${seed}: frames ${h.digest("hex")} (${n} ${JSON.stringify(kinds)}) save ${save}`);
}
