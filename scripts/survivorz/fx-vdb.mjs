// SURVIVORZ EFFECTS — renders the JangaFX (EmberGen) VDB simulations to frames in
// Blender, for fx-flipbook.mjs to pack into sheets (docs/survivorz/EFFECTS.md §3, F3).
//
//   node scripts/survivorz/fx-vdb.mjs [id...]
//   -> D:/solace-ai/fx-src/renders/<id>/frame_###.png + render.json
//   then: node scripts/survivorz/fx-flipbook.mjs <id>
//
// The simulations are extracted (7-Zip) into D:/solace-ai/fx-src/<sim>/ the first time
// — only the frames a sheet uses, since the dust ones are 5–13 GB unpacked. Blender
// runs headless on the GPU (scripts/survivorz/fx-vdb.py does the scene); each job's
// look (soot, flame strength, blackbody range, the dust's colour and light) was tuned
// against contact sheets of the real frames, not guessed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const SRC = process.env.FX_SRC || "D:/solace-ai/Special Effects";
const WORK = process.env.FX_WORK || "D:/solace-ai/fx-src";
const BLENDER = process.env.BLENDER || "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const SEVENZIP = process.env.SEVENZIP || "C:/Program Files/7-Zip/7z.exe";

// archive, the folder inside it, the file name before the frame number, and the frames
export const SIMS = {
  gasoline: { archive: "Gasoline_Explosion_01.rar", dir: "Gasoline_Explosion_01", prefix: "embergen_gasoline_explosion_a_" },
  dustimpact: { archive: "GrenadeDustImpactVDB.zip", dir: "DustImpact/DustImpactVDB", prefix: "dust_impact_", pad: 4 },
  shockwave: { archive: "DustShockwaveVDB.zip", dir: "DustShockwave/DustShockwaveVDB", prefix: "dustshockwave_", pad: 4 },
};

// id -> the simulation, the frames (first, last: 64 spread evenly), and the look
export const JOBS = {
  // the molotov catching: a ball of burning fuel that rolls up into black smoke
  "gas-burst": { sim: "gasoline", from: 1, to: 100, width: 384, look: { kind: "fire", flame: 3, flamePower: 2, kelvin: [1400, 3000], view: "Standard", density: 1, color: [0.05, 0.045, 0.04], key: 1.5, fill: 0.12, samples: 64 } },
  // the pipe bomb's cloud: dust thrown up and out of the floor
  "dust-impact": { sim: "dustimpact", from: 1, to: 160, width: 320, look: { kind: "dust", density: 0.6, color: [0.62, 0.6, 0.57], view: "Standard", key: 3, fill: 0.35, anisotropy: 0.2, samples: 64 } },
  // the ring of dust rolling out along the floor
  "dust-ring": { sim: "shockwave", from: 1, to: 150, width: 256, look: { kind: "dust", density: 0.6, color: [0.62, 0.6, 0.57], view: "Standard", key: 3, fill: 0.35, anisotropy: 0.2, elev: 12, samples: 64 } },
};

const pick = (from, to, n = 64) => Array.from({ length: n }, (_, i) => Math.round(from + (i * (to - from)) / (n - 1)));
const fileOf = (sim, f) => `${sim.prefix}${sim.pad ? String(f).padStart(sim.pad, "0") : f}.vdb`;

function extract(simId, frames) {
  const sim = SIMS[simId];
  const dir = path.join(WORK, simId);
  const want = frames.map((f) => fileOf(sim, f)).filter((n) => !fs.existsSync(path.join(dir, sim.dir, n)));
  if (!want.length) return;
  fs.mkdirSync(dir, { recursive: true });
  const list = path.join(dir, "want.txt");
  fs.writeFileSync(list, want.map((n) => `${sim.dir}/${n}`.replace(/\//g, path.sep === "\\" ? "\\" : "/")).join("\n"));
  execFileSync(SEVENZIP, ["x", "-y", path.join(SRC, sim.archive), `-o${dir}`, `@${list}`], { stdio: ["ignore", "ignore", "inherit"] });
}

const resume = process.argv.includes("--resume");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const [id, j] of Object.entries(JOBS)) {
  if (only.length && !only.includes(id)) continue;
  const frames = [...new Set(pick(j.from, j.to))];
  const t = Date.now();
  extract(j.sim, frames);
  const sim = SIMS[j.sim];
  const files = frames.map((f) => path.join(WORK, j.sim, sim.dir, fileOf(sim, f)).replace(/\\/g, "/"));
  const out = path.join(WORK, "renders", id).replace(/\\/g, "/");
  // --resume keeps the frames already rendered (a long render that fell over part way)
  if (!resume) fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const job = { resume, files, fit: files.filter((_, i) => i % 4 === 0 || i === files.length - 1), out, rot: [0, 0, 0], width: j.width, ...j.look };
  fs.writeFileSync(path.join(out, "job.json"), JSON.stringify(job, null, 1));
  execFileSync(BLENDER, ["-b", "--factory-startup", "-P", path.join(ROOT, "scripts", "survivorz", "fx-vdb.py"), "--", path.join(out, "job.json")], { stdio: ["ignore", "ignore", "inherit"] });
  const info = JSON.parse(fs.readFileSync(path.join(out, "render.json"), "utf8"));
  console.log(`${id}: ${files.length} frames ${info.width}x${info.height}, origin ${info.origin.map((x) => x.toFixed(3))} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}
