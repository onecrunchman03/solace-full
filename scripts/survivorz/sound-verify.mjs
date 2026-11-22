// SURVIVORZ: checks every clip a review page plays — it exists, it decodes, it is long enough
// to hear, and it is actually loud (a near-silent clip is how the levelling bug of Oct 20
// showed up: "some sounds are not playing"). Prints each page's count and every problem.
//   node scripts/survivorz/sound-verify.mjs [page-folder ...]   (default: every review page)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REVIEW = path.join(ROOT, "assets", "downloads", "survivorz", "sound", "review");
const pages = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(REVIEW).filter((d) => fs.existsSync(path.join(REVIEW, d, "index.html")));
let bad = 0;
for (const page of pages) {
  const dir = path.join(REVIEW, page);
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<audio[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  const problems = [];
  for (const s of srcs) {
    const p = path.join(dir, s);
    if (!fs.existsSync(p)) { problems.push(`${s}: missing`); continue; }
    const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "info", "-i", p, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const dur = r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const secs = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
    const mean = Number(r.stderr.match(/mean_volume:\s*(-?[\d.]+)/)?.[1] ?? -99);
    const peak = Number(r.stderr.match(/max_volume:\s*(-?[\d.]+)/)?.[1] ?? -99);
    if (r.status !== 0 || !secs) problems.push(`${s}: does not decode`);
    else if (secs < 0.12) problems.push(`${s}: only ${secs.toFixed(2)}s`);
    else if (peak < -24 || mean < -48) problems.push(`${s}: near-silent (peak ${peak} dB, mean ${mean} dB)`);
  }
  bad += problems.length;
  console.log(`${page.padEnd(30)} ${String(srcs.length).padStart(4)} clips · ${problems.length ? `${problems.length} problems` : "all good"}`);
  for (const p of problems) console.log(`    ${p}`);
}
process.exitCode = bad ? 1 : 0;
