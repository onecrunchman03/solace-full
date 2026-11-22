// THE STAFF SECURITY HALL, the plan Josh judges before it's built (2026-10-26): Reception redrawn
// from a visitors' lobby into a staff entry. World metres, x east, z south, drawn north up.
// Writes docs/survivorz/plans/hall-plan.png.
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const S = 40, X0 = 42, Z0 = 2, W = (88 - X0) * S, H = (42 - Z0) * S;
const px = (x) => (x - X0) * S, pz = (z) => (z - Z0) * S;
const rect = (x0, z0, x1, z1, fill, stroke = "none", sw = 0, extra = "") =>
  `<rect x="${px(x0)}" y="${pz(z0)}" width="${(x1 - x0) * S}" height="${(z1 - z0) * S}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const line = (x0, z0, x1, z1, c, w, extra = "") => `<line x1="${px(x0)}" y1="${pz(z0)}" x2="${px(x1)}" y2="${pz(z1)}" stroke="${c}" stroke-width="${w}" ${extra}/>`;
// text(x, z, title, sub): a title, and a smaller line under it (either may be empty)
const text = (x, z, a, b, size = 22, c = "#1d2226", anchor = "middle", weight = 600) => {
  const [t, s] = a ? [a, b] : [b, ""];
  return `<text x="${px(x)}" y="${pz(z)}" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="${c}" text-anchor="${anchor}">${t}</text>` + (s ? `<text x="${px(x)}" y="${pz(z) + size * 1.05}" font-family="Arial" font-size="${size * 0.72}" fill="#5b636b" text-anchor="${anchor}">${s}</text>` : "");
};

const parts = [];
// rooms (the greybox): floor tones by depth
parts.push(rect(40, 0, 80, 8, "#c9c4bb"), rect(50, 8, 70, 18, "#cfcac2"), rect(44, 18, 76, 32, "#eef0f1"), rect(76, 20, 86, 30, "#e3e6e8"), rect(54, 32, 66, 40, "#e6ecec"));
for (const [x0, z0, x1, z1] of [[50, 8, 70, 18], [44, 18, 76, 32], [76, 20, 86, 30], [54, 32, 66, 40]]) parts.push(rect(x0, z0, x1, z1, "none", "#2b3035", 6));
// the runway: a dark stone strip from the chamber door to the airlock
parts.push(rect(58.8, 18.1, 61.2, 31.9, "#3a4046"));
// the ceiling's linear light slots, dashed (dead)
for (let x = 46.4; x < 76; x += 2.4) if (Math.abs(x - 60) > 1.4 && x < 68.4) parts.push(line(x, 18.6, x, 31.4, "#9fb3c2", 3, `stroke-dasharray="14 10"`));
// the airlock portal: a dark feature wall either side of the decon door, logo over it
parts.push(rect(56, 31.55, 64, 31.9, "#16191c"), text(53.0, 30.9, "", "dark portal + HALCYON logo", 15, "#16191c"));
// the screening line (before the gates)
parts.push(rect(59.55, 21.6, 60.45, 22.4, "#7d8a94", "#2b3035", 2), text(57.0, 21.9, "detector", "", 16));
parts.push(rect(61.3, 21.45, 64.9, 22.55, "#55606a", "#2b3035", 2), text(63.1, 21.15, "", "x-ray bag scanner", 17, "#1d2226"));
parts.push(rect(65.0, 21.5, 66.6, 22.5, "#a9b2ba", "#2b3035", 2), text(65.8, 23.0, "", "tray table", 15, "#1d2226"));
// the gate line: glass (blue) with four speed-gate lanes
parts.push(line(44.1, 24.4, 57.2, 24.4, "#3b8fd0", 8), line(62.8, 24.4, 68.6, 24.4, "#3b8fd0", 8));
for (let i = 0; i < 5; i++) parts.push(rect(57.2 + i * 1.4 - 0.12, 23.7, 57.2 + i * 1.4 + 0.12, 25.1, "#9aa6af", "#2b3035", 2));
for (let i = 0; i < 4; i++) parts.push(line(57.2 + i * 1.4 + 0.18, 24.4, 57.2 + i * 1.4 + 1.22, 24.4, "#7fc6ff", 4, `stroke-dasharray="6 5"`));
parts.push(text(52, 24.0, "", "glass security line, 2.2 m", 17, "#1f5f8f"), text(65.6, 26.0, "SPEED GATES", "badge + palm, 4 lanes", 18));
// the guard booth: armoured glass west + north, console along the glass, its own door
parts.push(rect(68.6, 19.6, 75.9, 27.6, "#dfe7ec"), line(68.6, 19.6, 68.6, 27.6, "#3b8fd0", 12), line(68.6, 19.6, 75.9, 19.6, "#3b8fd0", 12), line(68.6, 27.6, 75.9, 27.6, "#2b3035", 10));
parts.push(rect(70.6, 27.45, 71.6, 27.75, "#dfe7ec"), text(71.1, 28.35, "", "booth door (ajar)", 15, "#1d2226"));
parts.push(`<path d="M ${px(69.1)} ${pz(26.6)} L ${px(69.1)} ${pz(20.1)} L ${px(74.5)} ${pz(20.1)}" fill="none" stroke="#5b636b" stroke-width="22" stroke-linejoin="round"/>`);
parts.push(text(72.6, 23.6, "GUARD BOOTH", "armoured glass; console", 19));
// lockers: an L along the west and south walls, benches
parts.push(rect(44.1, 25.0, 44.75, 31.9, "#6c7a86"), rect(44.1, 31.25, 56.0, 31.9, "#6c7a86"));
parts.push(rect(46.4, 26.2, 47.0, 30.2, "#c8b79a"), rect(48.2, 29.6, 54.5, 30.2, "#c8b79a"));
parts.push(text(51, 27.4, "STAFF LOCKERS", "tall lockers + benches", 20));
// device lockers by the airlock
parts.push(rect(64.2, 31.35, 68.2, 31.9, "#4c5864"), text(66.2, 30.6, "", "phone / device lockers", 15, "#1d2226"));
parts.push(rect(62.0, 31.35, 62.6, 31.9, "#22303a"), text(62.3, 30.2, "", "touch panel", 14, "#1d2226"));
// arrival side
parts.push(text(51, 20.4, "ARRIVAL", "status wall on the north wall", 19));
parts.push(rect(46, 18.1, 56, 18.45, "#22303a"), rect(64, 18.1, 68.5, 18.45, "#22303a"));
// the doors, with names
parts.push(rect(59.2, 17.85, 60.8, 18.25, "#eef0f1"), text(60, 17.2, "", "from the vault chamber", 16, "#1d2226"));
parts.push(rect(59.55, 31.7, 60.45, 32.25, "#ffffff", "#2b3035", 2), text(60, 33.4, "AIRLOCK", "stainless sliding door", 18));
parts.push(rect(75.75, 24.2, 76.25, 25.8, "#e3e6e8"));
parts.push(text(81, 25, "SECURITY ROOM", "behind the booth", 18), text(60, 13, "VAULT CHAMBER", "raw concrete", 18), text(60, 37, "DECONTAMINATION", "", 18), text(60, 4, "TRANSIT TUNNEL", "", 18));
// the flow
parts.push(`<path d="M ${px(60)} ${pz(18.6)} L ${px(60)} ${pz(31.2)}" stroke="#d8452e" stroke-width="5" fill="none" stroke-dasharray="2 12" stroke-linecap="round"/>`);
// emergency units and egress strips (on battery)
for (const [x, z] of [[44.1, 21.5], [44.1, 28], [75.9, 29], [51, 18.1], [69, 18.1], [49, 31.9], [70.5, 31.9]]) parts.push(`<circle cx="${px(x)}" cy="${pz(z)}" r="9" fill="#ffb03a" stroke="#2b3035" stroke-width="2"/>`);
parts.push(line(44.3, 18.3, 44.3, 31.7, "#58d39a", 4), line(44.3, 18.3, 75.7, 18.3, "#58d39a", 4), line(56.2, 31.7, 75.7, 31.7, "#58d39a", 4));
// legend + scale
const lg = [["#ffb03a", "emergency light (battery)"], ["#58d39a", "low-level egress strip (battery)"], ["#9fb3c2", "ceiling light slot (dead)"], ["#3b8fd0", "glass"], ["#3a4046", "dark stone runway"], ["#d8452e", "the way in"]];
lg.forEach(([c, t], i) => parts.push(rect(43, 34.2 + i * 0.85, 43.6, 34.8 + i * 0.85, c), text(43.9, 34.75 + i * 0.85, "", t, 17, "#1d2226", "start", 400)));
parts.push(line(78, 39.5, 83, 39.5, "#1d2226", 4), text(80.5, 39.1, "", "5 m", 16));
parts.push(text(43, 3.2, "THE STAFF SECURITY HALL (was Reception), plan, north up", "", 26, "#1d2226", "start", 700));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f7f7f5"/>${parts.join("")}</svg>`;
const out = path.join(ROOT, "docs/survivorz/plans/hall-plan.png");
await sharp(Buffer.from(svg)).png().toFile(out);
console.log("wrote", out);
