// SOLACE SURVIVORZ — THE BUNKER: the labelled floor plan drawing (step 1 of the build, for Josh's review).
//   node scripts/survivorz/bunker/floorplan.mjs  → docs/survivorz/bunker-floorplan.svg + .png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ROOMS, DOORS, MARKS, HORDE } from "./plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const S = 12;                      // pixels per metre
const OX = 40, OY = 70;            // where (0, 0) sits on the page
const W = 1500, H = 1060;
const px = (m) => OX + m * S, py = (m) => OY + m * S;

const FILL = { outside: "#11151b", entrance: "#3b2a2a", living: "#2c3a33", utility: "#30343b", command: "#2c3446", locked: "#46302a", hall: "#262a30" };
const DOOR = { open: "#7fd18b", arch: "#7fd18b", keycard: "#ff5a4f", keypad: "#ffae3d", hatch: "#9fb7ff", glass: "#9fe3ff", blast: "#ff2d2d" };
const DOTS = { dense: 2.2, some: 3.2, few: 6 };   // metres between the red dots

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">`);
out.push(`<rect width="${W}" height="${H}" fill="#14171c"/>`);
out.push(`<text x="${OX}" y="38" fill="#e8e3d6" font-size="26" font-weight="700">CIVIL DEFENCE SHELTER 14 — floor plan (approved)</text>`);
out.push(`<text x="${OX}" y="60" fill="#9aa3ad" font-size="14">Solace Survivorz: The Bunker · one floor · 23 rooms and halls · 1 square = 2 m</text>`);

// a 2 m grid under the plan
for (let m = 0; m <= 84; m += 2) out.push(`<line x1="${px(m)}" y1="${py(0)}" x2="${px(m)}" y2="${py(78)}" stroke="#1b1f25" stroke-width="1"/>`);
for (let m = 0; m <= 78; m += 2) out.push(`<line x1="${px(0)}" y1="${py(m)}" x2="${px(84)}" y2="${py(m)}" stroke="#1b1f25" stroke-width="1"/>`);

// rooms
for (const r of ROOMS) {
  out.push(`<rect x="${px(r.x)}" y="${py(r.y)}" width="${r.w * S}" height="${r.h * S}" fill="${FILL[r.kind]}" stroke="${r.kind === "hall" ? "none" : "#c9c2b0"}" stroke-width="3"/>`);
}
// the hall outlines drawn once round the joined halls so the joins don't show walls
const hallKinds = ROOMS.filter((r) => r.kind === "hall");
for (const r of hallKinds) out.push(`<rect x="${px(r.x)}" y="${py(r.y)}" width="${r.w * S}" height="${r.h * S}" fill="${FILL.hall}"/>`);
// where the horde stands at the start
for (const h of HORDE) {
  const r = ROOMS.find((x) => x.id === h.id);
  const g = DOTS[h.share];
  for (let y = r.y + g / 2; y < r.y + r.h; y += g) for (let x = r.x + g / 2 + ((Math.round((y - r.y) / g) % 2) * g) / 2; x < r.x + r.w; x += g)
    out.push(`<circle cx="${px(x)}" cy="${py(y)}" r="2.6" fill="#ff4b3e" opacity="0.75"/>`);
}
// the tunnel fades into the night
out.push(`<defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14171c" stop-opacity="0"/><stop offset="1" stop-color="#05070a" stop-opacity="1"/></linearGradient></defs>`);
const tun = ROOMS.find((r) => r.id === "tunnel");
out.push(`<rect x="${px(tun.x)}" y="${py(tun.y + 6)}" width="${tun.w * S}" height="${(tun.h - 6) * S}" fill="url(#night)"/>`);
out.push(`<text x="${px(40)}" y="${py(76.2)}" fill="#7d8794" font-size="13" text-anchor="middle">NIGHT · the city</text>`);

// doors
for (const d of DOORS) {
  const c = DOOR[d.kind];
  if (d.kind === "blast") {
    out.push(`<circle cx="${px(d.x)}" cy="${py(d.y)}" r="${(d.len / 2) * S}" fill="#2a1414" stroke="${c}" stroke-width="5"/>`);
    out.push(`<text x="${px(d.x)}" y="${py(d.y) + 5}" fill="#ffd9d6" font-size="12" font-weight="700" text-anchor="middle">BLAST</text>`);
    continue;
  }
  const half = (d.len / 2) * S, w = d.kind === "glass" ? 4 : 7;
  if (d.v) out.push(`<line x1="${px(d.x)}" y1="${py(d.y) - half}" x2="${px(d.x)}" y2="${py(d.y) + half}" stroke="${c}" stroke-width="${w}"${d.kind === "glass" ? ' stroke-dasharray="4 3"' : ""}/>`);
  else out.push(`<line x1="${px(d.x) - half}" y1="${py(d.y)}" x2="${px(d.x) + half}" y2="${py(d.y)}" stroke="${c}" stroke-width="${w}"${d.kind === "glass" || d.kind === "hatch" ? ' stroke-dasharray="4 3"' : ""}/>`);
}

// labels
out.push(`<style>text.room{paint-order:stroke;stroke:#14171c;stroke-width:4px;stroke-linejoin:round}</style>`);
for (const r of ROOMS) {
  if (!r.name) continue;
  const cx = px(r.x + r.w / 2), cy = py(r.y + r.h / 2);
  const vertical = r.h > r.w * 1.8 && r.w < 7;
  const span = (vertical ? r.h : r.w) * S - 12;
  const cap = r.w * r.h < 40 ? 13 : r.w * r.h < 110 ? 14 : 16;
  const fit = (t) => Math.min(cap, Math.max(10, Math.floor(span / (t.length * 0.62))));
  const name = r.name.toUpperCase() + (r.start ? " ●" : "");
  let lines = [name], size = fit(name);
  if (size < 12 && name.includes(" ")) {        // two lines rather than tiny type
    const i = name.indexOf(" ", Math.floor(name.length / 2) - 3);
    lines = [name.slice(0, i), name.slice(i + 1)];
    size = Math.min(...lines.map(fit));
  }
  const rot = vertical ? ` transform="rotate(-90 ${cx} ${cy})"` : "";
  lines.forEach((t, k) => {
    const y = cy + size / 3 + (k - (lines.length - 1) / 2) * (size + 2);
    const body = esc(t).replace("●", '<tspan fill="#7fd18b">●</tspan>');
    out.push(`<text x="${cx}" y="${y}" class="room" fill="#e8e3d6" font-size="${size}" font-weight="600" text-anchor="middle"${rot}>${body}</text>`);
  });
}

// marks
const ICON = { wheel: ["#ff2d2d", "W"], keycard: ["#ff5a4f", "K"], part: ["#d8b4ff", "P"], note: ["#ffae3d", "N"], radio: ["#9fe3ff", "R"] };
for (const m of MARKS) {
  const [c, t] = ICON[m.kind];
  out.push(`<circle cx="${px(m.x)}" cy="${py(m.y)}" r="9" fill="#14171c" stroke="${c}" stroke-width="2.5"/>`);
  out.push(`<text x="${px(m.x)}" y="${py(m.y) + 4}" fill="${c}" font-size="11" font-weight="700" text-anchor="middle">${t}</text>`);
}

// the legend
const LX = 1080;
let ly = 100;
const line = (txt, color = "#c9c2b0", size = 14, weight = 400) => { out.push(`<text x="${LX}" y="${ly}" fill="${color}" font-size="${size}" font-weight="${weight}">${esc(txt)}</text>`); ly += size + 9; };
const swatch = (fill, txt, opts = {}) => {
  if (opts.line) out.push(`<line x1="${LX}" y1="${ly - 5}" x2="${LX + 24}" y2="${ly - 5}" stroke="${fill}" stroke-width="6"${opts.dash ? ' stroke-dasharray="4 3"' : ""}/>`);
  else if (opts.circle) { out.push(`<circle cx="${LX + 12}" cy="${ly - 5}" r="9" fill="#14171c" stroke="${fill}" stroke-width="2.5"/>`); out.push(`<text x="${LX + 12}" y="${ly - 1}" fill="${fill}" font-size="11" font-weight="700" text-anchor="middle">${opts.circle}</text>`); }
  else out.push(`<rect x="${LX}" y="${ly - 15}" width="24" height="16" fill="${fill}" opacity="${opts.op ?? 1}" stroke="#c9c2b0" stroke-width="1"/>`);
  out.push(`<text x="${LX + 34}" y="${ly}" fill="#c9c2b0" font-size="14">${esc(txt)}</text>`);
  ly += 26;
};
line("THE OBJECTIVES", "#e8e3d6", 16, 700);
line("1. Crank the blast door shut (W)");
line("2. Kill every zombie inside");
line("3. Fix the radio (part P + code N),");
line("    call for rescue (R)");
ly += 8;
line("DOORS", "#e8e3d6", 16, 700);
swatch(DOOR.open, "Steel door / open archway", { line: true });
swatch(DOOR.keycard, "Armory: keycard from security", { line: true });
swatch(DOOR.keypad, "Radio room: 4-digit keypad", { line: true });
swatch(DOOR.glass, "Security office glass window", { line: true, dash: true });
swatch(DOOR.hatch, "Kitchen serving hatch", { line: true, dash: true });
swatch(DOOR.blast, "Blast door (round, on a hinge)", { circle: "◯" });
ly += 8;
line("WHAT'S WHERE", "#e8e3d6", 16, 700);
swatch(ICON.wheel[0], "Crank wheel, beside the door", { circle: "W" });
swatch(ICON.keycard[0], "Armory keycard, security desk", { circle: "K" });
swatch(ICON.part[0], "Radio part: one of these, per run", { circle: "P" });
swatch(ICON.note[0], "Code note: one of these, per run", { circle: "N" });
swatch(ICON.radio[0], "The radio set", { circle: "R" });
out.push(`<text x="${LX}" y="${ly}" fill="#7fd18b" font-size="14">●  a survivor can start here</text>`); ly += 26;
ly += 8;
line("ZOMBIES AT THE START (20)", "#e8e3d6", 16, 700);
const dots = (n, txt) => { for (let i = 0; i < n; i++) out.push(`<circle cx="${LX + 4 + (i * 16) / Math.max(1, n - 1)}" cy="${ly - 7}" r="2.6" fill="#ff4b3e"/>`); out.push(`<text x="${LX + 34}" y="${ly}" fill="#c9c2b0" font-size="14">${esc(txt)}</text>`); ly += 26; };
dots(5, "Dense: entrance + common room");
dots(3, "Some: the halls");
dots(1, "A few: barracks, mess hall");
line("One more walks in every 45–60 s", "#9aa3ad", 13);
line("until the door is shut.", "#9aa3ad", 13);
ly += 8;
line("ROOMS", "#e8e3d6", 16, 700);
swatch(FILL.living, "Living");
swatch(FILL.utility, "Utility");
swatch(FILL.command, "Command");
swatch(FILL.locked, "Locked");
line("Laundry, maintenance, equipment room and", "#9aa3ad", 13);
line("quartermaster are my additions to reach", "#9aa3ad", 13);
line("20–25 rooms; any can go.", "#9aa3ad", 13);

out.push(`</svg>`);
const svg = out.join("\n");
const dir = path.join(ROOT, "docs", "survivorz");
fs.writeFileSync(path.join(dir, "bunker-floorplan.svg"), svg);
await sharp(Buffer.from(svg)).png().toFile(path.join(dir, "bunker-floorplan.png"));
console.log("wrote docs/survivorz/bunker-floorplan.svg + .png");
