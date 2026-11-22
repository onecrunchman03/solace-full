// SOLACE SURVIVORZ — the facility's floor plans as pictures, for review.
//
// Run:  npm run build && node scripts/survivorz/render-plan.mjs [outDir]
//
// One PNG per floor (and a sheet of all three) drawn straight from facility-map.ts: rooms in
// their zone's colour, every door on the wall it really sits on, coloured by what opens it,
// safe rooms, sealed rooms, shafts, and the objectives. Pure data in, pictures out (sharp
// rasterises the SVG), so what Josh reviews is exactly what the game will load.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sharp = require(path.join(ROOT, "node_modules/sharp"));
const { SITE_9 } = require(path.join(ROOT, "dist/survivorz/facility-map.js"));
const { floorsOf, doorPlacement, layoutProblems } = require(path.join(ROOT, "dist/survivorz/facility.js"));

const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "docs/survivorz/plans"));
fs.mkdirSync(OUT, { recursive: true });

const S = 9;                      // pixels a metre
const PAD = 3;                    // metres of margin
const HUE = { lobby: 210, residential: 35, labs: 185, medical: 350, security: 260, power: 25, containment: 120, deep: 290 };
const DOOR = {
  doorway: ["#9aa4ad", "open doorway"], door: ["#e8e3d6", "door"], keycard: ["#f2c14e", "keycard"], power: ["#4fc3f7", "needs power"],
  lockdown: ["#ff6b6b", "lockdown"], safe: ["#7ee08a", "safe room"], sealed: ["#b48cff", "sealed (newcomer)"], grate: ["#ff9f43", "grate (crowbar)"],
  vault: ["#ffffff", "the vault"], vent: ["#6f7a83", "vent (nimble 7)"],
};
const SPOT = { keycard: "KEY", breaker: "BRK", override: "OVR", "route-map": "MAP", "lab-bench": "BENCH", tissue: "TISSUE", "final-file": "FILE", terminal: "log", loot: "loot", bed: null, box: "BOX" };
const FLOOR_NAME = ["FLOOR 0 · the clean face (y 0 m)", "FLOOR 1 · the guts (y -8 m)", "FLOOR 2 · the deep (y -16 m)"];
/** cut a label to the pixels it has (a rough 0.56 em average glyph) */
const fit = (t, wpx, size) => { const n = Math.floor(wpx / (size * 0.56)); return t.length <= n ? t : t.slice(0, Math.max(1, n - 1)) + "…"; };
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const all = SITE_9.rooms;
const W = Math.max(...all.map((r) => r.rect.x + r.rect.w)) + PAD * 2;
const H = Math.max(...all.map((r) => r.rect.y + r.rect.h)) + PAD * 2;
const px = (m) => (m + PAD) * S;

function floorSvg(fl) {
  const rooms = all.filter((r) => floorsOf(r).includes(fl));
  const ids = new Set(rooms.map((r) => r.id));
  const parts = [];
  // a 10 m grid
  for (let x = 0; x <= W; x += 10) parts.push(`<line x1="${px(x)}" y1="${px(0)}" x2="${px(x)}" y2="${px(H - PAD * 2)}" stroke="#1b2128" stroke-width="1"/>`);
  for (let y = 0; y <= H; y += 10) parts.push(`<line x1="${px(0)}" y1="${px(y)}" x2="${px(W - PAD * 2)}" y2="${px(y)}" stroke="#1b2128" stroke-width="1"/>`);
  for (const r of rooms) {
    const { x, y, w, h } = r.rect, hue = HUE[r.zone] ?? 0;
    const safe = r.kind === "safe", sealed = r.kind === "sealed", shaft = (r.spans ?? 1) > 1;
    parts.push(`<rect x="${px(x)}" y="${px(y)}" width="${w * S}" height="${h * S}" fill="hsl(${hue} 38% ${r.kind === "corridor" ? 17 : 23}%)" stroke="hsl(${hue} 55% ${safe ? 70 : 50}%)" stroke-width="${safe ? 4 : 2}"${sealed ? ' stroke-dasharray="7 5"' : ""}/>`);
    if (shaft) for (let k = 0; k < 6; k++) parts.push(`<line x1="${px(x)}" y1="${px(y + (h * k) / 6)}" x2="${px(x + w)}" y2="${px(y + (h * k) / 6)}" stroke="hsl(${hue} 40% 40%)" stroke-width="1"/>`);
    const big = w >= 10 && h >= 6;
    const fs1 = big ? 12 : 9;
    parts.push(`<text x="${px(x) + 4}" y="${px(y) + fs1 + 3}" font-size="${fs1}" fill="#e8edf1" font-weight="600">${esc(fit(r.name, w * S - 8, fs1))}</text>`);
    parts.push(`<text x="${px(x) + 4}" y="${px(y) + fs1 * 2 + 5}" font-size="9" fill="#97a3ad">${w}×${h}${w < 9 ? "" : " m"}${shaft ? (r.floor === fl ? " · ↓ down" : " · ↑ up") : ""}</text>`);
    const tags = [];
    if (safe) tags.push("SAFE · 6 beds");
    if (sealed) tags.push("SEALED");
    if (r.id === SITE_9.start) tags.push("START");
    for (const sp of r.spots) {
      const t = SPOT[sp.kind];
      if (!t || t === "log" || t === "loot") continue;
      tags.push(sp.kind === "keycard" ? `CARD ${sp.tier}` : sp.kind === "breaker" ? `BRK ${sp.zone}` : t);
    }
    const logs = r.spots.filter((s) => s.kind === "terminal").length, loot = r.spots.filter((s) => s.kind === "loot").length;
    if (logs || loot) tags.push([loot ? `${loot} loot` : "", logs ? `${logs} log` : ""].filter(Boolean).join(" · "));
    tags.forEach((t, i) => parts.push(`<text x="${px(x) + 4}" y="${px(y + h) - 5 - i * 11}" font-size="9" fill="${/SAFE|START|CARD|OVR|BENCH|TISSUE|FILE|MAP/.test(t) ? "#ffd27a" : "#b9c3cb"}" font-weight="${/SAFE|CARD/.test(t) ? 700 : 400}">${esc(fit(t, w * S - 8, 9))}</text>`));
  }
  for (const d of SITE_9.doors) {
    const a = ids.has(d.a), b = ids.has(d.b);
    if (!a && !b) continue;
    const ra = all.find((r) => r.id === d.a), rb = all.find((r) => r.id === d.b);
    const vertical = !floorsOf(ra).some((x) => floorsOf(rb).includes(x));
    if (!vertical && !(a && b)) continue;
    const [col] = DOOR[d.kind];
    if (d.kind === "vent") {
      const ca = [ra.rect.x + ra.rect.w / 2, ra.rect.y + ra.rect.h / 2], cb = [rb.rect.x + rb.rect.w / 2, rb.rect.y + rb.rect.h / 2];
      if (a && b) parts.push(`<line x1="${px(ca[0])}" y1="${px(ca[1])}" x2="${px(cb[0])}" y2="${px(cb[1])}" stroke="${col}" stroke-width="2" stroke-dasharray="4 4"/>`);
      else {
        const here = a ? ca : cb;
        parts.push(`<text x="${px(here[0])}" y="${px(here[1])}" font-size="9" fill="${col}">vent ${a ? "↓" : "↑"}</text>`);
      }
      continue;
    }
    const pl = doorPlacement(SITE_9, d.id);
    const [cx, , cz] = pl.centre, [nx, , nz] = pl.normal, w = pl.size[0];
    if (vertical) {
      parts.push(`<rect x="${px(cx - 1.2)}" y="${px(cz - 1.2)}" width="${2.4 * S}" height="${2.4 * S}" fill="none" stroke="${col}" stroke-width="3"/><text x="${px(cx + 1.6)}" y="${px(cz) + 4}" font-size="9" fill="${col}">grate ${a && ra.floor === fl || b && rb.floor === fl && rb.floor < ra.floor ? "↓" : "↑"}</text>`);
      continue;
    }
    // a gap across the wall, in the door's colour
    const along = Math.abs(nx) > 0.5 ? [0, 1] : [1, 0];
    const x1 = cx - along[0] * w / 2, x2 = cx + along[0] * w / 2, z1 = cz - along[1] * w / 2, z2 = cz + along[1] * w / 2;
    parts.push(`<line x1="${px(x1)}" y1="${px(z1)}" x2="${px(x2)}" y2="${px(z2)}" stroke="${col}" stroke-width="${d.kind === "vault" ? 9 : 6}" stroke-linecap="butt"/>`);
    if (d.kind === "keycard") parts.push(`<text x="${px(cx) + 5}" y="${px(cz) - 4}" font-size="9" fill="${col}" font-weight="700">${d.tier}</text>`);
  }
  // legend
  const leg = Object.entries(DOOR).map(([, [c, n]], i) => `<g transform="translate(${px(0) + i * 118},${(H + 4) * S - 8})"><line x1="0" y1="-4" x2="16" y2="-4" stroke="${c}" stroke-width="6"/><text x="20" y="0" font-size="10" fill="#c9d2d9">${esc(n)}</text></g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${(H + 5) * S}" font-family="Segoe UI, Arial, sans-serif">
<rect width="100%" height="100%" fill="#0d1014"/>
<text x="${px(0)}" y="18" font-size="16" fill="#ffffff" font-weight="700">HALCYON SITE 9 — ${esc(FLOOR_NAME[fl])}</text>
<text x="${W * S - 10}" y="18" font-size="11" fill="#7d8992" text-anchor="end">grid 10 m · ${rooms.length} rooms</text>
<g transform="translate(0,14)">${parts.join("\n")}</g>
${leg}
</svg>`;
}

const problems = layoutProblems(SITE_9);
if (problems.length) console.warn("layout problems:\n  " + problems.join("\n  "));
const pngs = [];
for (const fl of [0, 1, 2]) {
  const svg = floorSvg(fl);
  const file = path.join(OUT, `floor-${fl}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  pngs.push(file);
  console.log("wrote", path.relative(ROOT, file));
}
