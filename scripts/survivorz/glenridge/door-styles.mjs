// SURVIVORZ, GLENRIDGE HALL: what each door of the house IS, for the show page to hang the right leaf in it.
//   node scripts/survivorz/glenridge/door-styles.mjs [--print]
// Run after walkmap.py (it rewrites src/survivorz/glenridge-site.json). Each door of the sim's site is matched to the
// opening the build cut for it (docs/survivorz/glenridge-map.json `ways`, by place) and given a `style`:
//   panel   an oak room door, six fielded panels, brass handle (geo.py door())
//   arch    an oak plank door with iron straps under a pointed head (the front door, the garden and arcade doors)
//   french  a glazed door: the game build leaves only its frame in the shell (geo.py), and the page hangs the leaves
//   steel   the vault's door        cell  the cell's        garage  the garage's pair of boarded doors
// and, for an arch, how high its head rises above the spring (`rise`, geo.py: min(width x 0.36, height - 0.4)).
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SITE = path.join(ROOT, "src", "survivorz", "glenridge-site.json");
const site = JSON.parse(fs.readFileSync(SITE, "utf8")), map = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "survivorz", "glenridge-map.json"), "utf8"));
const count = {};
for (const d of site.doors) {
  delete d.style; delete d.rise;
  if (d.kind !== "door" && d.kind !== "keycard") continue;
  const c = d.place.centre;
  let best = null, bd = 9;
  for (const w of map.ways) {
    if (!Array.isArray(w.at)) continue;
    const dd = Math.hypot(w.at[0] - c[0], w.at[2] - c[2]) + Math.abs(w.at[1] + (w.height ?? 2.1) / 2 - c[1]);
    if (dd < bd) { bd = dd; best = w; }
  }
  const k = best && bd < 0.7 ? best.kind : "";
  d.style = /vault/.test(d.id) ? "steel" : d.a === "cellar-cell" || d.b === "cellar-cell" ? "cell" : /garage/.test(d.id) ? "garage" : k === "archdoor" ? "arch" : k === "french" ? "french" : "panel";
  if (d.style === "arch") d.rise = +Math.min(d.place.size[0] * 0.36, d.place.size[1] - 0.4).toFixed(3);
  count[d.style] = (count[d.style] ?? 0) + 1;
  if (process.argv.includes("--print")) console.log(d.id.padEnd(28), d.style.padEnd(7), d.place.size.join("x"), `${d.a} > ${d.b}`, k ? "" : `(no opening within 0.7 m: ${bd.toFixed(2)})`);
}
fs.writeFileSync(SITE, JSON.stringify(site));
console.log("door styles:", JSON.stringify(count));
