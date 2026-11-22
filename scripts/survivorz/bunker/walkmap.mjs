// SOLACE SURVIVORZ — THE BUNKER: a picture of the walk map (step 2's proof that a body gets everywhere).
//   npm run build && node scripts/survivorz/greybox.mjs --map bunker && node scripts/survivorz/bunker/walkmap.mjs
//   → docs/survivorz/bunker-walkmap.png
// Green: where a body can stand (at least 0.3 m from every wall). Dark: walls and the strip along them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ROOMS } from "./plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WALK = JSON.parse(fs.readFileSync(path.join(ROOT, "src/survivorz/bunker-walk.json"), "utf8"));
const f = WALK.floors[0];
const S = 12, OX = 40, OY = 70, W = 1100, H = 1060;
const px = (m) => OX + m * S, py = (m) => OY + m * S, cs = S / WALK.res;
const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif">`,
  `<rect width="${W}" height="${H}" fill="#14171c"/>`,
  `<text x="${OX}" y="38" fill="#e8e3d6" font-size="26" font-weight="700">CIVIL DEFENCE SHELTER 14 — walk map</text>`,
  `<text x="${OX}" y="60" fill="#9aa3ad" font-size="14">green = a body can stand there · every green cell connects to the vestibule (test_bunker_map)</text>`];
f.rows.forEach((row, j) => {
  let i = 0;
  for (const m of row.matchAll(/(\d+)([.#])/g)) {
    const n = +m[1];
    if (m[2] === ".") out.push(`<rect x="${px(f.origin[0]) + i * cs}" y="${py(f.origin[1]) + j * cs}" width="${n * cs}" height="${cs}" fill="#3f9a5c"/>`);
    i += n;
  }
});
for (const r of ROOMS) {
  out.push(`<rect x="${px(r.x)}" y="${py(r.y)}" width="${r.w * S}" height="${r.h * S}" fill="none" stroke="#c9c2b0" stroke-width="1" opacity="0.5"/>`);
  if (r.name) out.push(`<text x="${px(r.x + r.w / 2)}" y="${py(r.y + r.h / 2) + 4}" fill="#f4f0e6" font-size="11" font-weight="600" text-anchor="middle" style="paint-order:stroke;stroke:#14171c;stroke-width:3px">${r.name.toUpperCase()}</text>`);
}
out.push("</svg>");
await sharp(Buffer.from(out.join("\n"))).png().toFile(path.join(ROOT, "docs/survivorz/bunker-walkmap.png"));
console.log("wrote docs/survivorz/bunker-walkmap.png");
