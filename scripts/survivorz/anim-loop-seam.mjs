// SURVIVORZ: closes a looping clip's SEAM — a take whose last frame doesn't meet its first twitches
// every time it loops (the natural check's speed/jerk at the seam found mx-terrified: ten seconds of
// acting that ends somewhere else). Over the last `blend` seconds every bone eases into its own
// first frame, so the loop joins itself; the hips' travel is left alone.
//   node scripts/survivorz/anim-loop-seam.mjs <body> <clip> [blend=0.5]   then repack
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const [body, clip, blendArg = "0.5"] = process.argv.slice(2);
if (!clip) throw new Error("usage: anim-loop-seam.mjs <body> <clip> [blend]");
const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${body}.json`), "utf8"));
const f = path.join(STAGE, "out", job.out, `${clip}.json`);
const j = JSON.parse(fs.readFileSync(f, "utf8"));
if (j.seamClosed) { console.log(`${clip}: seam already closed`); process.exit(0); }
const blend = +blendArg, T = j.duration;
const ease = (x) => x * x * (3 - 2 * x);
for (const tr of j.tracks) {
  if (!tr.name.endsWith(".quaternion")) continue;
  const v = tr.values, q0 = v.slice(0, 4);
  tr.times.forEach((t, i) => {
    const w = ease(Math.min(1, Math.max(0, (t - (T - blend)) / blend))); if (!w) return;
    const q = v.slice(i * 4, i * 4 + 4); const d = q.reduce((a, x, k) => a + x * q0[k], 0), s = d < 0 ? -1 : 1;
    // nlerp toward the first frame (short way), renormalised
    const r = q.map((x, k) => x * (1 - w) + s * q0[k] * w), l = Math.hypot(...r);
    for (let k = 0; k < 4; k++) v[i * 4 + k] = r[k] / l;
  });
}
j.seamClosed = blend;
fs.writeFileSync(f, JSON.stringify(j));
console.log(`${body}: ${clip} seam closed over ${blend}s`);
