// SOLACE SURVIVORZ — THE BUNKER: a one-page picture of a batch of simulated runs (step 3's review).
//   node scripts/survivorz/bunker-sim.mjs --runs 100 --json docs/survivorz/plans/bunker-sim-100.json
//   node scripts/survivorz/bunker/simchart.mjs [docs/survivorz/plans/bunker-sim-100.json]
// → bunker-sim-100.png beside the json: how runs ended, when (5-minute bins over the hour), how far the
//   objectives got, and how people died.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const src = path.resolve(ROOT, process.argv[2] ?? "docs/survivorz/plans/bunker-sim-100.json");
const runs = JSON.parse(fs.readFileSync(src, "utf8"));
const n = runs.length;
const W = 1400, H = 900;
const C = { rescued: "#7fd18b", wiped: "#ff6b5e", timeout: "#ffd166" };
const out = [];
const T = (x, y, s, txt, fill = "#e8e3d6", w = 400, a = "start") => out.push(`<text x="${x}" y="${y}" font-size="${s}" fill="${fill}" font-weight="${w}" text-anchor="${a}">${String(txt).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif"><rect width="${W}" height="${H}" fill="#14171c"/>`);
T(40, 44, 26, `The Bunker — ${n} simulated one-hour shows`, "#e8e3d6", 700);
T(40, 70, 15, "Game code only: no AI choosing. Each run is a different seed (who wakes where, where the part and the code note are).", "#9aa3ad");

// endings bar
const count = (e) => runs.filter((r) => r.ending === e).length;
let x = 40;
const BW = W - 80;
for (const e of ["rescued", "wiped", "timeout"]) {
  const k = count(e), w = (k / n) * BW;
  if (!k) continue;
  out.push(`<rect x="${x}" y="95" width="${w}" height="46" fill="${C[e]}"/>`);
  const label = e === "rescued" ? "RESCUED" : e === "wiped" ? "NO SURVIVORS" : w > 230 ? "NO RESCUE CAME" : "NO RESCUE";
  if (w > 90) T(x + 12, 125, 18, `${label} ${k}%`, "#14171c", 700);
  x += w;
}

// when they ended: 5-minute bins
const bins = 12, bx = 40, by = 210, bw = 620, bh = 230;
T(bx, by - 18, 17, "When each run ended (minutes into the hour)", "#e8e3d6", 700);
const hist = { rescued: Array(bins).fill(0), wiped: Array(bins).fill(0), timeout: Array(bins).fill(0) };
for (const r of runs) { const m = Math.min(bins - 1, Math.floor(r.endedAt / 60_000 / 5)); hist[r.ending in hist ? r.ending : "timeout"][m]++; }
const maxBin = Math.max(...Array.from({ length: bins }, (_, i) => hist.rescued[i] + hist.wiped[i] + hist.timeout[i]), 1);
for (let i = 0; i < bins; i++) {
  let y = by + bh;
  const cw = bw / bins - 6;
  for (const e of ["wiped", "rescued", "timeout"]) {
    const h = (hist[e][i] / maxBin) * bh;
    if (h > 0) { out.push(`<rect x="${bx + i * (bw / bins)}" y="${y - h}" width="${cw}" height="${h}" fill="${C[e]}"/>`); y -= h; }
  }
  T(bx + i * (bw / bins) + cw / 2, by + bh + 18, 12, `${i * 5}`, "#9aa3ad", 400, "middle");
}
out.push(`<line x1="${bx}" y1="${by + bh}" x2="${bx + bw}" y2="${by + bh}" stroke="#4a4f57"/>`);

// objectives reached
const ox = 740, oy = 210;
T(ox, oy - 18, 17, "How far the objectives got (share of runs, median time)", "#e8e3d6", 700);
const med = (k) => { const a = runs.map((r) => r[k]).filter((v) => v > 0).sort((p, q) => p - q); return a.length ? Math.round(a[Math.floor(a.length / 2)] / 60_000) : null; };
const steps = [["armory", "Armory opened (keycard)"], ["sealed", "Blast door cranked shut"], ["code", "Radio room code found"], ["radioOpen", "Radio room opened"], ["part", "Radio part found"], ["fixed", "Radio repaired"], ["called", "Call for rescue made"], ["clear", "Bunker cleared (door sealed)"]];
steps.forEach(([k, label], i) => {
  const reached = runs.filter((r) => r[k] > 0).length, y = oy + i * 30;
  T(ox, y + 15, 14, label, "#d6d1c4");
  out.push(`<rect x="${ox + 230}" y="${y}" width="300" height="20" fill="#22262d"/><rect x="${ox + 230}" y="${y}" width="${(reached / n) * 300}" height="20" fill="#5fa8d3"/>`);
  T(ox + 540, y + 15, 14, `${Math.round((reached / n) * 100)}% · ${med(k) ?? "—"} min`, "#e8e3d6");
});

// deaths
const dy = 530;
T(40, dy, 17, "Deaths", "#e8e3d6", 700);
const deaths = runs.reduce((a, r) => a + r.deaths.length, 0);
const causes = {};
for (const r of runs) for (const d of r.deaths) causes[d.cause] = (causes[d.cause] ?? 0) + 1;
T(40, dy + 28, 15, `${(deaths / n).toFixed(1)} of the 6 die in an average run · survivors left at the end: ${(runs.reduce((a, r) => a + r.alive.length, 0) / n).toFixed(1)}`, "#d6d1c4");
Object.entries(causes).sort((a, b) => b[1] - a[1]).forEach(([k, v], i) => {
  const y = dy + 50 + i * 28;
  T(40, y + 15, 14, k === "bitten" ? "bitten, then bled out" : k === "wounds" ? "clawed down" : k, "#d6d1c4");
  out.push(`<rect x="220" y="${y}" width="${(v / deaths) * 400}" height="20" fill="#c0614f"/>`);
  T(230 + (v / deaths) * 400, y + 15, 14, `${Math.round((v / deaths) * 100)}%`, "#e8e3d6");
});
const fd = runs.filter((r) => r.deaths.length).map((r) => Math.min(...r.deaths.map((d) => d.t)) / 60_000).sort((a, b) => a - b);
T(40, dy + 200, 14, `First death: median ${fd.length ? fd[Math.floor(fd.length / 2)].toFixed(0) : "—"} min in · ${runs.filter((r) => !r.deaths.length).length}% of runs had no deaths at all`, "#9aa3ad");

// legend + notes
const lx = 740, ly = 530;
T(lx, ly, 17, "Reading it", "#e8e3d6", 700);
const notes = [
  "• A run is over when rescue comes (door sealed + bunker clear + the call made),",
  "  when everyone is dead, or at one hour with no rescue.",
  `• Kills a run: ${(runs.reduce((a, r) => a + r.kills, 0) / n).toFixed(0)} (20 at the start + ${(runs.reduce((a, r) => a + r.arrived, 0) / n).toFixed(0)} that came in while the door was open).`,
  `• Downs ${(runs.reduce((a, r) => a + r.downs, 0) / n).toFixed(1)}, revives ${(runs.reduce((a, r) => a + r.revives, 0) / n).toFixed(1)}, bites ${(runs.reduce((a, r) => a + r.bites, 0) / n).toFixed(1)} a run.`,
  "• With the AI choosing, pacing and choices will differ: this is the floor code gives it.",
];
notes.forEach((t, i) => T(lx, ly + 30 + i * 24, 14, t, "#d6d1c4"));
out.push(`</svg>`);
const file = src.replace(/\.json$/, ".png");
await sharp(Buffer.from(out.join("\n"))).png().toFile(file);
console.log(`→ ${path.relative(ROOT, file)}`);
