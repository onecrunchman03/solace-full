// SURVIVORZ, GLENRIDGE HALL: trims the museum photographs' plain backgrounds off the rugs and tapestries (free/art),
// so a rug is the rug to its edge. Rewrites credits.json's sizes.   node scripts/survivorz/glenridge/trim-art.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(process.env.SURVIVORZ_ASSETS ?? path.join(ROOT, "assets/downloads/survivorz"), "free/art");
const credits = JSON.parse(fs.readFileSync(path.join(dir, "credits.json"), "utf8"));
for (const [name, c] of Object.entries(credits)) {
  if (!/^(rug|tapestry)/.test(name) || c.trimmed) continue;
  const f = path.join(dir, name);
  try {
    const buf = await sharp(f).trim({ threshold: 28 }).toBuffer();
    const m = await sharp(buf).metadata();
    if (m.width < c.w * 0.5 || m.height < c.h * 0.5) { console.log("kept (trim too deep)", name); continue; }
    // a further 1.5% off each side: the fringe and the shadow at the edge
    const dx = Math.round(m.width * 0.015), dy = Math.round(m.height * 0.015);
    const out = await sharp(buf).extract({ left: dx, top: dy, width: m.width - 2 * dx, height: m.height - 2 * dy }).jpeg({ quality: 88 }).toBuffer();
    fs.writeFileSync(f, out); const m2 = await sharp(out).metadata();
    console.log(name, `${c.w}x${c.h} -> ${m2.width}x${m2.height}`); c.w = m2.width; c.h = m2.height; c.trimmed = true;
  } catch (e) { console.log("skip", name, e.message); }
}
fs.writeFileSync(path.join(dir, "credits.json"), JSON.stringify(credits, null, 1));
