// SURVIVORZ: lays a body's contact sheets out as pages to LOOK at — 8 clips a
// page, four shots each (start, middle, end, and the middle from the side), the
// clip's name and measured error in each shot's own corner.
//
//   node scripts/survivorz/sheet-pages.mjs <body> [perPage]
//   → assets/downloads/survivorz/sheets/<body>-pNN.jpg
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHEETS = path.join(ROOT, "assets", "downloads", "survivorz", "sheets");
const body = process.argv[2];
const per = Number(process.argv[3] ?? 8);
const dir = path.join(SHEETS, body);
const report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")).filter((r) => !r.error);
const W = 260, H = 230;
for (const old of fs.readdirSync(SHEETS).filter((f) => f.startsWith(`${body}-p`))) fs.unlinkSync(path.join(SHEETS, old));
for (let p = 0; p * per < report.length; p++) {
  const rows = report.slice(p * per, p * per + per);
  const inputs = [], layout = [];
  rows.forEach((r, i) => ["10", "50", "90", "50s"].forEach((s, c) => {
    inputs.push("-i", path.join(dir, `${r.id}-${s}.png`));
    layout.push(`${c * W}_${i * H}`);
  }));
  const n = rows.length * 4;
  const scaled = Array.from({ length: n }, (_, i) => `[${i}]scale=${W}:${H}[s${i}]`).join(";");
  const out = path.join(SHEETS, `${body}-p${String(p + 1).padStart(2, "0")}.jpg`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex",
    `${scaled};${Array.from({ length: n }, (_, i) => `[s${i}]`).join("")}xstack=inputs=${n}:layout=${layout.join("|")}`, "-q:v", "4", out]);
  console.log(path.basename(out), rows.map((r) => r.id).join(", "));
}
