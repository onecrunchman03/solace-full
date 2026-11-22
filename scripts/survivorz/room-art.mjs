// SURVIVORZ: the printed things a room's walls carry, drawn (nothing here is a photograph):
//
//   node scripts/survivorz/room-art.mjs
//   → assets/downloads/survivorz/rooms/vault-lobby/decals/calendar-may.webp   a wall calendar (a decal)
//   → assets/downloads/survivorz/rooms/art/charter.png                         the framed Site 9 charter
//                                                                              (props-spec "frame-charter" art)
//
// The calendar is the lobby's date (LORE.md: the lockdown was Thursday 14 May 2026, mid-morning):
// May 2026, its days crossed off in marker through the 13th, Halcyon's own corporate calendar.
// The charter's words are a stand-in for the look test: LORE.md's record 1 ("the Site 9 welcome
// plaque and charter") is written only once Josh approves the outline, and replaces them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DECALS = path.join(ROOT, "assets", "downloads", "survivorz", "rooms", "vault-lobby", "decals");
const ART = path.join(ROOT, "assets", "downloads", "survivorz", "rooms", "art");
fs.mkdirSync(DECALS, { recursive: true }); fs.mkdirSync(ART, { recursive: true });

// seeded wobble, so a rebuild draws the same marks
let st = 77;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const j = (a) => (rnd() - 0.5) * 2 * a;

/** the Halcyon ring mark: a ring, a sun on its horizon, the horizon bar */
const mark = (cx, cy, r, color) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${r * 0.17}"/>
  <ellipse cx="${cx}" cy="${cy - r * 0.18}" rx="${r * 0.36}" ry="${r * 0.36}" fill="${color}"/>
  <rect x="${cx - r * 1.3}" y="${cy + r * 0.12}" width="${r * 2.6}" height="${r * 0.16}" fill="${color}"/>`;

// ---- the calendar: 600 x 900 (a 40 x 60 cm wall calendar) ---------------------------------------------
{
  const W = 600, H = 900;
  const days = 31, first = 5;   // May 2026 starts on a Friday (0 = Sunday)
  const top = 470, gx = 40, gw = (W - 80) / 7, gh = 62;
  let cells = "";
  ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].forEach((d, i) => {
    cells += `<text x="${gx + gw * i + gw / 2}" y="${top - 14}" font-family="Arial" font-weight="bold" font-size="17" fill="#2e3a44" text-anchor="middle">${d}</text>`;
  });
  for (let d = 1; d <= days; d++) {
    const k = first + d - 1, c = k % 7, r = Math.floor(k / 7);
    const x = gx + gw * c, y = top + gh * r;
    cells += `<rect x="${x}" y="${y}" width="${gw}" height="${gh}" fill="none" stroke="#b8b3a6" stroke-width="1.2"/>`;
    cells += `<text x="${x + 7}" y="${y + 22}" font-family="Arial" font-size="19" fill="${c === 0 ? "#a33" : "#333"}">${d}</text>`;
    if (d <= 13) {   // the days that happened, crossed off in red marker
      const p = (a, b) => `${(x + a * gw + j(3)).toFixed(1)},${(y + b * gh + j(3)).toFixed(1)}`;
      cells += `<path d="M${p(0.15, 0.2)} L${p(0.85, 0.85)} M${p(0.85, 0.18)} L${p(0.18, 0.82)}" stroke="#b3121b" stroke-width="${4 + j(1)}" stroke-linecap="round" opacity="0.82" fill="none"/>`;
    }
  }
  // what was coming, in the receptionist's hand: payroll on the 15th, a visit on the 21st
  const at = (d) => { const k = first + d - 1; return [gx + gw * (k % 7), top + gh * Math.floor(k / 7)]; };
  const [x15, y15] = at(15), [x21, y21] = at(21), [x14, y14] = at(14);
  const notes = `
    <ellipse cx="${x15 + gw / 2}" cy="${y15 + gh / 2 + 4}" rx="${gw * 0.46}" ry="${gh * 0.42}" fill="none" stroke="#1d4fa8" stroke-width="3" opacity="0.85"/>
    <text x="${x15 + 6}" y="${y15 + gh - 9}" font-family="Segoe Print, Segoe Script, Comic Sans MS" font-size="12" fill="#1d4fa8">payday!</text>
    <text x="${x21 + 5}" y="${y21 + gh - 22}" font-family="Segoe Print, Segoe Script, Comic Sans MS" font-size="11" fill="#1d4fa8">board</text>
    <text x="${x21 + 5}" y="${y21 + gh - 8}" font-family="Segoe Print, Segoe Script, Comic Sans MS" font-size="11" fill="#1d4fa8">visit 10am</text>
    <text x="${x14 + 5}" y="${y14 + gh - 9}" font-family="Segoe Print, Segoe Script, Comic Sans MS" font-size="11" fill="#1d4fa8">fire drill?</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="age" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1ecdf"/><stop offset="1" stop-color="#e6dfcd"/></linearGradient>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2f45"/><stop offset="1" stop-color="#3b5b74"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#age)"/>
    <rect x="${W / 2 - 14}" y="6" width="28" height="10" rx="5" fill="#777"/>
    <rect x="30" y="30" width="${W - 60}" height="330" fill="url(#sky)"/>
    <rect x="30" y="300" width="${W - 60}" height="60" fill="#22303b"/>
    ${[...Array(9)].map((_, i) => `<rect x="${60 + i * 56}" y="${250 - (i % 3) * 18}" width="40" height="${50 + (i % 3) * 18}" fill="#2c4153"/>`).join("")}
    ${mark(W / 2, 140, 52, "#e9eef2")}
    <text x="${W / 2}" y="240" font-family="Arial" font-weight="bold" font-size="40" letter-spacing="6" fill="#e9eef2" text-anchor="middle">HALCYON</text>
    <text x="${W / 2}" y="268" font-family="Arial" font-size="15" letter-spacing="7" fill="#c9d5de" text-anchor="middle">BIOLOGICS</text>
    <text x="${W / 2}" y="342" font-family="Georgia" font-style="italic" font-size="17" fill="#c9d5de" text-anchor="middle">Countermeasures for a safer tomorrow</text>
    <text x="40" y="415" font-family="Arial" font-weight="bold" font-size="40" fill="#1f2a33">MAY</text>
    <text x="${W - 40}" y="415" font-family="Arial" font-size="30" fill="#55606a" text-anchor="end">2026</text>
    ${cells}${notes}
    <text x="${W / 2}" y="${H - 22}" font-family="Arial" font-size="12" letter-spacing="2" fill="#8a8578" text-anchor="middle">HALCYON BIOLOGICS · SITE 9 · ATLANTA</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, "calendar-may.webp"));
  console.log("calendar-may");
}

// ---- the signs a secure door carries beside its frame (references 53 and 46), and the visitor signs ----------
/** a plate: a coloured header band over white, the body in lines; w x h at 400 px a metre */
async function plate(name, w, h, head, headColor, body, { foot = "", icon = false } = {}) {
  const W = Math.round(w * 400), H = Math.round(h * 400);
  const hh = Math.round(H * 0.3);
  // sized to fit: Arial Bold capitals run about 0.68 em wide, body text about 0.5
  const iconW = icon ? hh * 0.62 : 0;
  const fs1 = Math.round(Math.min(hh * 0.42, (W - 50 - iconW) / (head.length * 0.68)));
  const fs2 = Math.round(Math.min((H - hh) / (body.length + 2.2) * 0.62, (W - 50) / (Math.max(...body.map((t) => t.length)) * 0.5)));
  const fs3 = Math.round(Math.min(fs2 * 0.55, (W - 40) / (foot.length * 0.62 || 1)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" rx="10" fill="#f4f2ec"/>
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="8" fill="none" stroke="#2b2b2b" stroke-width="4"/>
    <rect x="12" y="12" width="${W - 24}" height="${hh - 12}" rx="5" fill="${headColor}"/>
    ${icon ? mark(12 + iconW / 2 + 6, hh / 2 + 6, hh * 0.2, "#ffffff") : ""}
    <text x="${(W + iconW) / 2}" y="${hh / 2 + fs1 * 0.36 + 6}" font-family="Arial" font-weight="bold" font-size="${fs1}" fill="#ffffff" text-anchor="middle">${head}</text>
    ${body.map((t, i) => `<text x="${W / 2}" y="${hh + fs2 * 1.5 + i * fs2 * 1.3}" font-family="Arial" font-weight="${i === 0 ? "bold" : "normal"}" font-size="${fs2}" fill="#1e1e1e" text-anchor="middle">${t}</text>`).join("")}
    ${foot ? `<text x="${W / 2}" y="${H - 20}" font-family="Arial" font-size="${fs3}" letter-spacing="1" fill="#6b6b6b" text-anchor="middle">${foot}</text>` : ""}
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `${name}.webp`));
  console.log(name);
}
await plate("sign-authorized", 0.45, 0.6, "AUTHORIZED", "#b3121b", ["PERSONNEL ONLY", "Badge access beyond", "this point.", "Badges must be worn and", "visible at all times."], { foot: "HALCYON BIOLOGICS SECURITY", icon: true });
await plate("sign-decon", 0.45, 0.6, "DECON ENTRY", "#1f4e8c", ["PPE REQUIRED", "Two-person rule", "beyond this door.", "Report any breach", "to Security, ext. 400."], { foot: "SITE 9 · BSL-3 ACCESS", icon: true });
await plate("sign-visitors", 0.7, 0.45, "VISITORS", "#2c3a46", ["Please sign in at reception", "and wear your badge."], { icon: true });
{ // the floor sticker before the gates: wait here
  const W = 700, H = 260;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" rx="18" fill="#e8b800"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="10" fill="none" stroke="#1a1a1a" stroke-width="10"/>
    <text x="${W / 2}" y="118" font-family="Arial" font-weight="bold" font-size="78" fill="#1a1a1a" text-anchor="middle">PLEASE WAIT</text>
    <text x="${W / 2}" y="198" font-family="Arial" font-weight="bold" font-size="52" fill="#1a1a1a" text-anchor="middle">UNTIL CALLED</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, "floor-wait.webp"));
  console.log("floor-wait");
}

// ---- PAINT (transparent): the vault door's swing marked on the floor, and a stencil beside it ------------
{ // the swing: a quarter circle from the hinge (the texture's top-left corner) through where the leaf
  // sweeps, a solid edge, a hatched band, "KEEP CLEAR" along it; worn, so the floor shows through
  const S = 1024, r = S * 0.94;
  let wear = "";
  for (let i = 0; i < 260; i++) wear += `<circle cx="${(rnd() * S).toFixed(0)}" cy="${(rnd() * S).toFixed(0)}" r="${(2 + rnd() * 9).toFixed(1)}" fill="#000"/>`;
  let hatch = "";
  for (let a = 4; a < 88; a += 6) {
    const t = (a * Math.PI) / 180, t2 = ((a + 3) * Math.PI) / 180;
    hatch += `<path d="M${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)} L${((r - 70) * Math.cos(t2)).toFixed(1)},${((r - 70) * Math.sin(t2)).toFixed(1)}" stroke="#e1b400" stroke-width="22"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <defs><mask id="worn"><rect width="${S}" height="${S}" fill="#fff"/>${wear}</mask></defs>
    <g mask="url(#worn)" opacity="0.88">
      <path d="M${r},0 A${r},${r} 0 0 1 0,${r}" fill="none" stroke="#e1b400" stroke-width="16"/>
      <path d="M${r - 70},0 A${r - 70},${r - 70} 0 0 1 0,${r - 70}" fill="none" stroke="#e1b400" stroke-width="8"/>
      ${hatch}
      <text x="${r * 0.33}" y="${r * 0.42}" font-family="Arial" font-weight="bold" font-size="58" fill="#e1b400" transform="rotate(45 ${r * 0.33} ${r * 0.42})" text-anchor="middle">KEEP CLEAR</text>
    </g></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(DECALS, "paint-swing.webp"));
  console.log("paint-swing");
}
{ // a stencil on the concrete beside the door: hazard stripes and the words, sprayed, a little worn
  const W = 900, H = 420;
  let wear = "";
  for (let i = 0; i < 180; i++) wear += `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" r="${(1.5 + rnd() * 6).toFixed(1)}" fill="#000"/>`;
  let stripes = "";
  for (let x = -80; x < W; x += 70) stripes += `<path d="M${x},0 L${x + 35},0 L${x + 85},60 L${x + 50},60 Z" fill="#111"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><mask id="w"><rect width="${W}" height="${H}" fill="#fff"/>${wear}</mask><clipPath id="band"><rect x="0" y="0" width="${W}" height="60"/></clipPath></defs>
    <g mask="url(#w)" opacity="0.9">
      <rect x="0" y="0" width="${W}" height="60" fill="#e1b400"/><g clip-path="url(#band)">${stripes}</g>
      <text x="${W / 2}" y="190" font-family="Arial" font-weight="bold" font-size="104" letter-spacing="8" fill="#e8e3d4" text-anchor="middle">VAULT DOOR</text>
      <text x="${W / 2}" y="300" font-family="Arial" font-weight="bold" font-size="66" letter-spacing="6" fill="#e1b400" text-anchor="middle">KEEP CLEAR · SWINGS OUT</text>
      <text x="${W / 2}" y="385" font-family="Arial" font-weight="bold" font-size="40" letter-spacing="5" fill="#e8e3d4" text-anchor="middle">TWO-PERSON OPERATION ONLY</text>
    </g></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(DECALS, "paint-vault-stencil.webp"));
  console.log("paint-vault-stencil");
}

// ---- PRINTS: a trail of shoe prints, 4 m long, walking toward +x (the texture's right); grime carried
// in from the tunnel, fading as the soles clean. Each print is a sole's silhouette filled with its
// tread, broken up (a real print is partial: heel and ball press, the arch doesn't), mottled. A stain:
// dark, multiplied over the floor ------------------------------------------------------------------------
async function prints(name, seed, { stride = 0.78, gait = 0.17, boot = false } = {}) {
  st = seed;
  const M = 220;   // px a metre
  const W = Math.round(4 * M), H = Math.round(0.9 * M);
  const L = (boot ? 0.3 : 0.275) * M, Wd = (boot ? 0.112 : 0.098) * M;
  // a sole, toe toward +x, centred on 0: ball and toe forward, narrow waist, round heel
  const sole = `M${(-L / 2).toFixed(1)},0 C${(-L / 2).toFixed(1)},${(-Wd * 0.42).toFixed(1)} ${(-L * 0.25).toFixed(1)},${(-Wd * 0.4).toFixed(1)} ${(-L * 0.1).toFixed(1)},${(-Wd * 0.3).toFixed(1)}
    C${(L * 0.05).toFixed(1)},${(-Wd * 0.38).toFixed(1)} ${(L * 0.2).toFixed(1)},${(-Wd * 0.52).toFixed(1)} ${(L * 0.36).toFixed(1)},${(-Wd * 0.45).toFixed(1)}
    C${(L * 0.52).toFixed(1)},${(-Wd * 0.36).toFixed(1)} ${(L * 0.52).toFixed(1)},${(Wd * 0.3).toFixed(1)} ${(L * 0.36).toFixed(1)},${(Wd * 0.42).toFixed(1)}
    C${(L * 0.2).toFixed(1)},${(Wd * 0.5).toFixed(1)} ${(L * 0.04).toFixed(1)},${(Wd * 0.32).toFixed(1)} ${(-L * 0.1).toFixed(1)},${(Wd * 0.26).toFixed(1)}
    C${(-L * 0.25).toFixed(1)},${(Wd * 0.36).toFixed(1)} ${(-L / 2).toFixed(1)},${(Wd * 0.42).toFixed(1)} ${(-L / 2).toFixed(1)},0 Z`;
  let defs = `<path id="sole" d="${sole}"/><clipPath id="cl"><use href="#sole"/></clipPath>`;
  // the tread: crosswise bars (boots: chunky lugs), clipped to the sole
  let tread = "";
  for (let x = -L / 2; x < L / 2; x += boot ? 9 : 5) tread += `<rect x="${x.toFixed(1)}" y="${(-Wd).toFixed(1)}" width="${boot ? 5 : 2.4}" height="${(Wd * 2).toFixed(1)}" fill="#2e241b"/>`;
  defs += `<g id="tread">${tread}</g>`;
  let g = "";
  for (let i = 0, x = 0.25 * M; x < W - 0.2 * M; i++, x += (stride / 2) * M * (0.92 + rnd() * 0.16)) {
    const left = i % 2 === 0;
    const a = Math.max(0.1, 0.62 - i * 0.042) * (0.7 + rnd() * 0.3);   // the soles clean as they walk
    const y = H / 2 + (left ? -1 : 1) * (gait / 2) * M + j(4);
    const ang = (left ? -5 : 5) + j(6);
    // break the print up: the arch never presses, and grit drops out at random
    let holes = `<rect x="${(-L * 0.1).toFixed(1)}" y="${(-Wd).toFixed(1)}" width="${(L * 0.08).toFixed(1)}" height="${(Wd * 2).toFixed(1)}" fill="#000" opacity="0.8"/>`;
    for (let k = 0; k < 7; k++) holes += `<circle cx="${(j(L / 2)).toFixed(1)}" cy="${(j(Wd / 2)).toFixed(1)}" r="${(1 + rnd() * 3).toFixed(1)}" fill="#000"/>`;
    const id = `m${i}`;
    defs += `<mask id="${id}"><rect x="${(-L).toFixed(1)}" y="${(-Wd).toFixed(1)}" width="${(L * 2).toFixed(1)}" height="${(Wd * 2).toFixed(1)}" fill="#fff"/>${holes}</mask>`;
    g += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang.toFixed(1)})" opacity="${a.toFixed(2)}">
      <g mask="url(#${id})"><use href="#sole" fill="#4a3a2b" opacity="0.8"/><g clip-path="url(#cl)" opacity="0.45"><use href="#tread"/></g></g></g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}"><defs>${defs}<filter id="b"><feGaussianBlur stdDeviation="0.9"/></filter></defs><g filter="url(#b)">${g}</g></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(DECALS, `${name}.webp`));
  console.log(name);
}
await prints("prints-shoes", 501);
await prints("prints-boots", 733, { stride: 0.86, gait: 0.2, boot: true });

// ---- COBWEBS: an untidy sheet web in an upper corner (the texture's top-left is the room's corner):
// strands slung between the two walls at random, a denser tangle and caught dust near the corner.
// Paint: lit, see-through ---------------------------------------------------------------------------------
{
  st = 909;
  const S = 512;
  let lines = "";
  for (let k = 0; k < 55; k++) {   // strands from one wall to the other, sagging, most near the corner
    const r1 = S * Math.pow(rnd(), 1.4) * 0.55, r2 = S * Math.pow(rnd(), 1.4) * 0.55;
    const x1 = r1, y1 = 1 + rnd() * 6, x2 = 1 + rnd() * 6, y2 = r2;   // one end on the top edge, one on the left
    const sag = 0.18 + rnd() * 0.25;
    const mx = (x1 + x2) / 2 + (x1 + y2) * sag * 0.15, my = (y1 + y2) / 2 + (x1 + y2) * sag * 0.45;   // sagging down
    lines += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="#d6d3cc" stroke-width="${(0.6 + rnd() * 0.9).toFixed(2)}" opacity="${(0.18 + rnd() * 0.4).toFixed(2)}"/>`;
  }
  for (let k = 0; k < 14; k++) {   // a few loose threads hanging down
    const x = S * Math.pow(rnd(), 1.3) * 0.7, y = S * Math.pow(rnd(), 1.3) * 0.5, l = 30 + rnd() * 90;
    lines += `<path d="M${x.toFixed(1)},${y.toFixed(1)} q${j(10).toFixed(1)},${(l / 2).toFixed(1)} ${j(6).toFixed(1)},${l.toFixed(1)}" fill="none" stroke="#d6d3cc" stroke-width="0.8" opacity="0.3"/>`;
  }
  const dust = `<radialGradient id="d" cx="0" cy="0" r="0.45"><stop offset="0" stop-color="#b9b4a8" stop-opacity="0.55"/><stop offset="1" stop-color="#b9b4a8" stop-opacity="0"/></radialGradient>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs>${dust}</defs><rect width="${S}" height="${S}" fill="url(#d)"/>${lines}</svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, "paint-cobweb.webp"));
  console.log("paint-cobweb");
}

// ---- the charter: drawn into the middle 67% of a square texture (the frame's print UVs) ---------------------
{
  const S = 2048, PW = Math.round(S * 0.67), PX = Math.round((S - PW) / 2);
  const c = PX + PW / 2;
  const lines = [
    ["Georgia", 46, "#3b3326", "To study the threats we hope never to meet,"],
    ["Georgia", 46, "#3b3326", "so that no city ever has to."],
  ];
  const pledges = ["Containment before discovery.", "Safety for every employee, every day.", "Honesty with our partners and the public.", "Readiness, so that fear has no room to grow."];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <rect width="${S}" height="${S}" fill="#efe8d6"/>
    <rect x="${PX + 60}" y="60" width="${PW - 120}" height="${S - 120}" fill="none" stroke="#9b8a5e" stroke-width="10"/>
    <rect x="${PX + 84}" y="84" width="${PW - 168}" height="${S - 168}" fill="none" stroke="#9b8a5e" stroke-width="3"/>
    ${mark(c, 330, 110, "#2c3a46")}
    <text x="${c}" y="560" font-family="Arial" font-weight="bold" font-size="104" letter-spacing="14" fill="#2c3a46" text-anchor="middle">HALCYON</text>
    <text x="${c}" y="630" font-family="Arial" font-size="40" letter-spacing="18" fill="#4a5864" text-anchor="middle">BIOLOGICS</text>
    <text x="${c}" y="790" font-family="Georgia" font-size="64" fill="#3b3326" text-anchor="middle">Charter of Site 9</text>
    <text x="${c}" y="860" font-family="Georgia" font-style="italic" font-size="38" fill="#5a4e3a" text-anchor="middle">The Atlanta Countermeasures Facility</text>
    <rect x="${c - 220}" y="905" width="440" height="4" fill="#9b8a5e"/>
    ${lines.map(([f, z, col, t], i) => `<text x="${c}" y="${1010 + i * 66}" font-family="${f}" font-style="italic" font-size="${z}" fill="${col}" text-anchor="middle">${t}</text>`).join("")}
    <text x="${c}" y="1230" font-family="Arial" font-weight="bold" font-size="30" letter-spacing="8" fill="#5a4e3a" text-anchor="middle">WE PLEDGE</text>
    ${pledges.map((t, i) => `<text x="${c}" y="${1310 + i * 64}" font-family="Georgia" font-size="40" fill="#3b3326" text-anchor="middle">${t}</text>`).join("")}
    <path d="M${c - 250},1700 c60,-50 90,40 140,-10 s70,-40 110,10 s90,20 120,-20" stroke="#1d2f6b" stroke-width="5" fill="none"/>
    <rect x="${c - 280}" y="1730" width="560" height="3" fill="#7a6c4c"/>
    <text x="${c}" y="1780" font-family="Georgia" font-size="36" fill="#3b3326" text-anchor="middle">Dr. Evelyn Marsh, Site Director</text>
    <text x="${c}" y="1830" font-family="Georgia" font-style="italic" font-size="30" fill="#5a4e3a" text-anchor="middle">Dedicated the third of March, 2021</text>
    <circle cx="${PX + PW - 230}" cy="1760" r="78" fill="#a8892e" opacity="0.9"/>
    <circle cx="${PX + PW - 230}" cy="1760" r="62" fill="none" stroke="#e3cf86" stroke-width="5"/>
    ${mark(PX + PW - 230, 1760, 30, "#e3cf86")}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ART, "charter.png"));
  console.log("charter");
}

// ---- THE SITE MAP: the facility's level 1 printed under the black glass slab on the hall's north wall
// (references 16: Black Mesa's sector map; with the power gone only the photoluminescent YOU ARE HERE
// still reads, the print is grey ink under glass). Drawn from the map itself (set/greybox.json), so it
// never disagrees with the building. Paint: lit, see-through where there's no ink. 5.6 x 1.6 m.
{
  const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "set", "greybox.json"), "utf8"));
  const rooms = G.rooms.filter((r) => r.floor === 0);
  const W = 2800, H = 800;
  const x0 = Math.min(...rooms.map((r) => r.rect.x)), x1 = Math.max(...rooms.map((r) => r.rect.x + r.rect.w));
  const z0 = Math.min(...rooms.map((r) => r.rect.y)), z1 = Math.max(...rooms.map((r) => r.rect.y + r.rect.h));
  const MX = 760, MY = 70, MW = 1500, MH = 660;
  const k = Math.min(MW / (x1 - x0), MH / (z1 - z0));
  const ox = MX + (MW - (x1 - x0) * k) / 2, oy = MY + (MH - (z1 - z0) * k) / 2;
  const X = (x) => ox + (x - x0) * k, Y = (z) => oy + (z - z0) * k;
  const tone = { lobby: "#c9d0d4", residential: "#8fa3b0", labs: "#a7b6a0", medical: "#b0a0a4", security: "#a8a090", power: "#8a8f94" };
  const zones = [...new Set(rooms.map((r) => r.zone))];
  let ink = "";
  for (const r of rooms) {
    const c = tone[r.zone] ?? "#9aa3a8";
    ink += `<rect x="${X(r.rect.x).toFixed(1)}" y="${Y(r.rect.y).toFixed(1)}" width="${(r.rect.w * k).toFixed(1)}" height="${(r.rect.h * k).toFixed(1)}" fill="${c}" fill-opacity="0.10" stroke="${c}" stroke-opacity="0.8" stroke-width="2.5"/>`;
  }
  const here = rooms.find((r) => r.id === "reception");
  const hx = X(here.rect.x + here.rect.w / 2), hy = Y(here.rect.y + here.rect.h / 2);
  const glow = "#c8f07a";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="70" y="150" font-family="Arial" font-weight="bold" font-size="64" letter-spacing="10" fill="#c9d0d4" fill-opacity="0.85">SITE 9</text>
    <text x="70" y="215" font-family="Arial" font-size="34" letter-spacing="8" fill="#c9d0d4" fill-opacity="0.7">LEVEL 1 · STAFF CIRCULATION</text>
    <rect x="70" y="250" width="520" height="3" fill="#c9d0d4" fill-opacity="0.5"/>
    ${zones.map((z, i) => `<rect x="70" y="${300 + i * 62}" width="36" height="36" fill="${tone[z] ?? "#9aa3a8"}" fill-opacity="0.25" stroke="${tone[z] ?? "#9aa3a8"}" stroke-width="2.5"/><text x="130" y="${330 + i * 62}" font-family="Arial" font-size="32" letter-spacing="5" fill="#c9d0d4" fill-opacity="0.75">${z.toUpperCase()}</text>`).join("")}
    ${ink}
    <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="16" fill="${glow}"/>
    <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="30" fill="none" stroke="${glow}" stroke-width="4"/>
    <text x="${(hx + 44).toFixed(1)}" y="${(hy + 12).toFixed(1)}" font-family="Arial" font-weight="bold" font-size="34" letter-spacing="4" fill="${glow}">YOU ARE HERE</text>
    <text x="2730" y="740" font-family="Arial" font-size="24" letter-spacing="4" fill="#c9d0d4" fill-opacity="0.5" text-anchor="end">IN AN EMERGENCY FOLLOW THE GREEN LINE TO YOUR NEAREST SAFE ROOM</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(DECALS, "paint-sitemap.webp"));
  console.log("paint-sitemap");
}

// ---- THE DECON LINE: the clean/dirty boundary painted across the decon entry (references 11: a painted line
// under a step-over bench). A worn safety-yellow band with its stencil; paint, so it's see-through where worn.
// 11.8 x 0.5 m; the texture's top is the side you read it from walking in.
{
  st = 1201;
  const W = 4096, H = 174;
  let wear = "";
  for (let k = 0; k < 260; k++) {   // scuffs where boots crossed it, densest in the walking lane
    const x = W * (0.25 + 0.7 * Math.pow(rnd(), 0.8)), y = rnd() * H, r = 2 + rnd() * 14;
    wear += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(r * (1 + rnd() * 3)).toFixed(1)}" ry="${r.toFixed(1)}" fill="#000" opacity="${(0.4 + rnd() * 0.6).toFixed(2)}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>${wear}</mask></defs>
    <g mask="url(#m)" opacity="0.92">
      <rect x="0" y="0" width="${W}" height="30" fill="#e3b505"/>
      <rect x="0" y="${H - 30}" width="${W}" height="30" fill="#e3b505"/>
      <text x="${W / 2}" y="${H / 2 + 26}" font-family="Arial" font-weight="bold" font-size="74" letter-spacing="14" fill="#e3b505" text-anchor="middle">STOP · PPE REQUIRED BEYOND THIS LINE</text>
    </g></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, "paint-deconline.webp"));
  console.log("paint-deconline");
}

// ---- THE LABS' DOOR PLATES (2026-10-27, REFERENCES.md round seven: L27's numbered levels read on door plates,
// L6's pressure gauge at every threshold). 600 x 300 px plates (30 x 15 cm): the Halcyon mark, the room's
// number and name, and a band in the room's containment colour (white offices, green labs, amber the entry
// sequence, red the suits and the clean labs). Decals "plate-<id>"; and the pressure placard beside each
// containment door.
{
  const PLATES = {
    "labs-corridor": ["L-100", "RESEARCH LABS", "#7d8a93", ""],
    "break-room": ["L-104", "STAFF BREAK ROOM", "#7d8a93", ""],
    "glass-offices": ["L-110", "RESEARCH OFFICES", "#7d8a93", "STAFF ONLY"],
    conference: ["L-118", "CONFERENCE", "#7d8a93", ""],
    "server-room": ["L-120", "SERVER ROOM", "#2f6fb0", "AUTHORISED IT STAFF ONLY"],
    airlock: ["L-130", "AIRLOCK", "#d99a12", "ZONE 1 → 2 · INTERLOCKED"],
    "decon-shower": ["L-131", "CHEMICAL SHOWER", "#d99a12", "ZONE 2 · 5 MIN CYCLE"],
    "suit-room": ["L-132", "SUIT ROOM", "#c43a2b", "ZONE 3 · POSITIVE-PRESSURE SUITS"],
    "clean-lab-a": ["L-140", "CLEAN LAB A", "#c43a2b", "BSL-3 · SUITED ENTRY ONLY"],
    "clean-lab-b": ["L-141", "CLEAN LAB B", "#c43a2b", "BSL-3 · SUITED ENTRY ONLY"],
    "lab-storage": ["L-142", "LAB STORAGE", "#3f8f4f", "−80 °C · LN2 · FLAMMABLES"],
  };
  for (const [id, [num, name, band, sub]] of Object.entries(PLATES)) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="10" fill="#eef1f2"/>
      <rect x="0" y="${H - 42}" width="${W}" height="42" fill="${band}"/>
      <rect x="0" y="${H - 44}" width="${W}" height="2" fill="#000" opacity="0.15"/>
      ${mark(70, 92, 34, "#26313a")}
      <text x="130" y="76" font-family="Arial" font-weight="bold" font-size="30" fill="#5b6770" letter-spacing="3">${num}</text>
      <text x="130" y="134" font-family="Arial" font-weight="bold" font-size="${name.length > 15 ? 40 : 48}" fill="#1d262d">${name}</text>
      <text x="30" y="210" font-family="Arial" font-size="22" fill="#4a565f" letter-spacing="2">HALCYON BIOLOGICS · SITE 9</text>
      <text x="${W / 2}" y="${H - 13}" font-family="Arial" font-weight="bold" font-size="22" fill="#fff" letter-spacing="3" text-anchor="middle">${sub}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `plate-${id}.webp`));
  }
  // the pressure placard: a small dial reading below zero, the room's pressure against the corridor
  for (const [id, pa] of [["pressure-25", -25], ["pressure-50", -50], ["pressure-75", -75]]) {
    const W = 300, H = 400, cx = 150, cy = 170, r = 105;
    const ang = (v) => Math.PI * (1.25 - 1.5 * ((v + 100) / 100));   // -100..0 Pa across 270 degrees
    let ticks = "";
    for (let v = -100; v <= 0; v += 10) {
      const a = ang(v), r0 = v % 50 === 0 ? r - 22 : r - 12;
      ticks += `<line x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy - Math.sin(a) * r0).toFixed(1)}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy - Math.sin(a) * r).toFixed(1)}" stroke="#1d262d" stroke-width="${v % 50 === 0 ? 5 : 3}"/>`;
    }
    const a = ang(pa);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="14" fill="#2b343b"/>
      <circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="#eef1f2"/>${ticks}
      <line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * (r - 18)).toFixed(1)}" y2="${(cy - Math.sin(a) * (r - 18)).toFixed(1)}" stroke="#c43a2b" stroke-width="7" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="11" fill="#1d262d"/>
      <text x="${cx}" y="${cy + 62}" font-family="Arial" font-weight="bold" font-size="22" fill="#1d262d" text-anchor="middle">Pa</text>
      <text x="${cx}" y="${H - 64}" font-family="Arial" font-weight="bold" font-size="26" fill="#e3b505" text-anchor="middle">${pa} Pa</text>
      <text x="${cx}" y="${H - 30}" font-family="Arial" font-size="18" fill="#cfd6da" text-anchor="middle" letter-spacing="2">NEGATIVE PRESSURE</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `${id}.webp`));
  }
  console.log("lab plates");
}

// ---- MEDICAL'S DOOR PLATES AND THE BREACH NOTICE (2026-10-27, REFERENCES.md round eight). The plates are the labs'
// (teal band: the clinic; red: quarantine and the morgue). The notice is the one thing printed in a hurry: an A4
// sheet taped over the clean signage on the quarantine door, its corners curling.
{
  const PLATES = {
    "med-hall": ["M-200", "MEDICAL", "#1f8a8a", "HALCYON HEALTH SERVICES"],
    pharmacy: ["M-204", "PHARMACY", "#1f8a8a", "CONTROLLED DRUGS · STAFF ONLY"],
    "exam-rooms": ["M-206", "EXAMINATION", "#1f8a8a", "BAYS 1–3"],
    "med-office": ["M-210", "CHIEF MEDICAL OFFICER", "#1f8a8a", ""],
    "staff-lounge": ["M-212", "STAFF LOUNGE", "#1f8a8a", ""],
    "safe-med": ["M-214", "SHELTER", "#3f8f4f", "MEDICAL STAFF SAFE ROOM"],
    quarantine: ["M-220", "ISOLATION", "#c43a2b", "NEGATIVE PRESSURE · PPE BEYOND"],
    ward: ["M-224", "WARD", "#1f8a8a", "BEDS 1–6"],
    operating: ["M-228", "THEATRE", "#2f6fb0", "STERILE · SCRUB BEFORE ENTRY"],
    morgue: ["M-232", "MORTUARY", "#5b6770", "AUTHORISED STAFF ONLY"],
    "cold-storage": ["M-233", "COLD STORE", "#c43a2b", "SEALED · DO NOT OPEN"],
  };
  for (const [id, [num, name, band, sub]] of Object.entries(PLATES)) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="10" fill="#eef1f2"/>
      <rect x="0" y="${H - 42}" width="${W}" height="42" fill="${band}"/>
      ${mark(70, 92, 34, "#26313a")}
      <text x="130" y="76" font-family="Arial" font-weight="bold" font-size="30" fill="#5b6770" letter-spacing="3">${num}</text>
      <text x="130" y="134" font-family="Arial" font-weight="bold" font-size="${name.length > 15 ? 36 : 48}" fill="#1d262d">${name}</text>
      <text x="30" y="210" font-family="Arial" font-size="22" fill="#4a565f" letter-spacing="2">HALCYON BIOLOGICS · SITE 9</text>
      <text x="${W / 2}" y="${H - 13}" font-family="Arial" font-weight="bold" font-size="22" fill="#fff" letter-spacing="3" text-anchor="middle">${sub}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `plate-${id}.webp`));
  }
  {
    st = 2203;
    const W = 420, H = 594;   // A4, 21 x 29.7 cm
    const tape = (x, y, r) => `<rect x="${x - 45}" y="${y - 14}" width="90" height="28" fill="#d8cfa8" opacity="0.85" transform="rotate(${r} ${x} ${y})"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="#f4f2ec"/>
      <rect x="30" y="40" width="${W - 60}" height="110" fill="#c0261c"/>
      <text x="${W / 2}" y="112" font-family="Arial" font-weight="bold" font-size="64" fill="#fff" text-anchor="middle">DO NOT</text>
      <text x="${W / 2}" y="222" font-family="Arial" font-weight="bold" font-size="66" fill="#c0261c" text-anchor="middle">ENTER</text>
      <text x="${W / 2}" y="290" font-family="Arial" font-weight="bold" font-size="30" fill="#1d262d" text-anchor="middle">CONTAINMENT BREACH</text>
      <text x="${W / 2}" y="330" font-family="Arial" font-size="20" fill="#1d262d" text-anchor="middle">ISOLATION SEALED BY ORDER OF THE CMO</text>
      <text x="${W / 2}" y="360" font-family="Arial" font-size="20" fill="#1d262d" text-anchor="middle">14 MAY · 09:52</text>
      ${tape(70, 20, -12)}${tape(W - 70, 22, 10)}${tape(80, H - 20, 8)}
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, "sign-breach.webp"));
  }
  console.log("medical plates");
}

// ---- SECURITY'S DOOR PLATES, THE CLEARING-BARREL SIGN AND THE CHIEF'S MAP (2026-10-27, REFERENCES.md round nine).
// The plates are the house's (navy band: security; red: the armoury and the cells). The chief's map is level 1
// printed on paper from the map itself (set/greybox.json) with pins pushed into it where it went wrong.
{
  const PLATES = {
    "sec-corridor": ["S-300", "SECURITY", "#26405f", "HALCYON SITE SECURITY"],
    "sec-lockers": ["S-302", "GUARD LOCKERS", "#26405f", "STAFF ONLY"],
    interview: ["S-304", "INTERVIEW", "#26405f", "RECORDING IN PROGRESS"],
    "sec-office": ["S-306", "CHIEF OF SECURITY", "#26405f", ""],
    "control-room": ["S-310", "CONTROL ROOM", "#26405f", "AUTHORISED PERSONNEL ONLY"],
    armoury: ["S-312", "ARMOURY", "#c43a2b", "CARD + PIN · TWO-PERSON RULE"],
    "camera-room": ["S-314", "CCTV", "#26405f", "EQUIPMENT ROOM"],
    holding: ["S-316", "HOLDING", "#5b6770", "DETAINEES ESCORTED AT ALL TIMES"],
  };
  for (const [id, [num, name, band, sub]] of Object.entries(PLATES)) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="10" fill="#eef1f2"/>
      <rect x="0" y="${H - 42}" width="${W}" height="42" fill="${band}"/>
      ${mark(70, 92, 34, "#26313a")}
      <text x="130" y="76" font-family="Arial" font-weight="bold" font-size="30" fill="#5b6770" letter-spacing="3">${num}</text>
      <text x="130" y="134" font-family="Arial" font-weight="bold" font-size="${name.length > 15 ? 36 : 48}" fill="#1d262d">${name}</text>
      <text x="30" y="210" font-family="Arial" font-size="22" fill="#4a565f" letter-spacing="2">HALCYON BIOLOGICS · SITE 9</text>
      <text x="${W / 2}" y="${H - 13}" font-family="Arial" font-weight="bold" font-size="22" fill="#fff" letter-spacing="3" text-anchor="middle">${sub}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `plate-${id}.webp`));
  }
  {
    const W = 400, H = 560;   // the clearing barrel's sign, an enamel plate (S14)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="12" fill="#f2c20f"/>
      <rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="8" fill="none" stroke="#111" stroke-width="10"/>
      <text x="${W / 2}" y="130" font-family="Arial" font-weight="bold" font-size="66" fill="#111" text-anchor="middle">CLEAR</text>
      <text x="${W / 2}" y="210" font-family="Arial" font-weight="bold" font-size="66" fill="#111" text-anchor="middle">ALL</text>
      <text x="${W / 2}" y="290" font-family="Arial" font-weight="bold" font-size="56" fill="#111" text-anchor="middle">WEAPONS</text>
      <path d="M${W / 2} 340 L${W / 2 + 60} 430 L${W / 2 + 22} 430 L${W / 2 + 22} 500 L${W / 2 - 22} 500 L${W / 2 - 22} 430 L${W / 2 - 60} 430 Z" fill="#111"/>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, "sign-clear-weapons.webp"));
  }
  {
    st = 3307;
    const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "set", "greybox.json"), "utf8"));
    const rooms = G.rooms.filter((r) => r.floor === 0);
    const W = 1600, H = 1000;
    const x0 = Math.min(...rooms.map((r) => r.rect.x)), x1 = Math.max(...rooms.map((r) => r.rect.x + r.rect.w));
    const z0 = Math.min(...rooms.map((r) => r.rect.y)), z1 = Math.max(...rooms.map((r) => r.rect.y + r.rect.h));
    const MX = 60, MY = 150, MW = W - 120, MH = H - 230;
    const k = Math.min(MW / (x1 - x0), MH / (z1 - z0));
    const ox = MX + (MW - (x1 - x0) * k) / 2, oy = MY + (MH - (z1 - z0) * k) / 2;
    const X = (x) => ox + (x - x0) * k, Y = (z) => oy + (z - z0) * k;
    let ink = "";
    for (const r of rooms) ink += `<rect x="${X(r.rect.x).toFixed(1)}" y="${Y(r.rect.y).toFixed(1)}" width="${(r.rect.w * k).toFixed(1)}" height="${(r.rect.h * k).toFixed(1)}" fill="none" stroke="#38424a" stroke-width="1.6"/>`;
    // the pins: where it was reported, in the order the radio carried it (red), and the rooms sealed (black)
    const at = (id) => { const r = rooms.find((q) => q.id === id); return r ? [X(r.rect.x + r.rect.w * (0.3 + rnd() * 0.4)), Y(r.rect.y + r.rect.h * (0.3 + rnd() * 0.4))] : null; };
    const pin = (p, c) => p ? `<circle cx="${(p[0] + 4).toFixed(1)}" cy="${(p[1] + 5).toFixed(1)}" r="11" fill="#000" fill-opacity="0.25"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="11" fill="${c}"/><circle cx="${(p[0] - 3).toFixed(1)}" cy="${(p[1] - 3).toFixed(1)}" r="3.5" fill="#fff" fill-opacity="0.6"/>` : "";
    const red = ["quarantine", "quarantine", "ward", "med-hall", "med-hall", "pharmacy", "res-corridor", "labs-corridor", "canteen", "sec-corridor"].map((id) => pin(at(id), "#c81e1e")).join("");
    const black = ["quarantine-cell", "operating"].map((id) => pin(at(id), "#141414")).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#ece8dc"/>
      <text x="60" y="80" font-family="Arial" font-weight="bold" font-size="44" letter-spacing="6" fill="#26313a">SITE 9 · LEVEL 1</text>
      <text x="60" y="122" font-family="Arial" font-size="24" letter-spacing="4" fill="#4a565f">SECURITY COPY · NOT FOR DISTRIBUTION</text>
      ${ink}${red}${black}
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(path.join(DECALS, "map-pinned.webp"));
  }
  console.log("security plates");
}

// ---- POWER AND MAINTENANCE'S SIGNS AND FLOOR PAINT (2026-10-27, REFERENCES.md round ten). The plant floor's plates
// are the same house plates in safety yellow; each breaker cabinet carries its zone's name; each genset its number;
// the switchboard the standard high-voltage warning; the floor its yellow walkway lines and hazard stripes.
{
  const PLATES = {
    "service-stairs": ["P-100", "SERVICE STAIRS", "#c99a06", "PLANT LEVEL B1"],
    "generator-hall": ["P-110", "GENERATOR HALL", "#c99a06", "HEARING PROTECTION REQUIRED"],
    catwalks: ["P-112", "PLANT ACCESS", "#c99a06", "AUTHORISED PERSONNEL ONLY"],
    "safe-power": ["P-114", "SHELTER", "#3f8f4f", "MAINTENANCE CREW SAFE ROOM"],
    boiler: ["P-120", "BOILER ROOM", "#c99a06", "HOT SURFACES"],
    "maint-lockup": ["P-122", "LOCKUP", "#5b6770", "KEY HOLDERS ONLY"],
    workshop: ["P-124", "WORKSHOP", "#c99a06", "EYE PROTECTION REQUIRED"],
    "pipe-gallery": ["P-130", "PIPE GALLERY", "#c99a06", "CONFINED SPACE"],
    "pump-room": ["P-132", "PUMP ROOM", "#c99a06", ""],
  };
  for (const [id, [num, name, band, sub]] of Object.entries(PLATES)) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="10" fill="#eef1f2"/>
      <rect x="0" y="${H - 42}" width="${W}" height="42" fill="${band}"/>
      ${mark(70, 92, 34, "#26313a")}
      <text x="130" y="76" font-family="Arial" font-weight="bold" font-size="30" fill="#5b6770" letter-spacing="3">${num}</text>
      <text x="130" y="134" font-family="Arial" font-weight="bold" font-size="${name.length > 15 ? 36 : 48}" fill="#1d262d">${name}</text>
      <text x="30" y="210" font-family="Arial" font-size="22" fill="#4a565f" letter-spacing="2">HALCYON BIOLOGICS · SITE 9</text>
      <text x="${W / 2}" y="${H - 13}" font-family="Arial" font-weight="bold" font-size="22" fill="#fff" letter-spacing="3" text-anchor="middle">${sub}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `plate-${id}.webp`));
  }
  // each breaker's label (the white frame on its cabinet, 0.44 x 0.1)
  for (const z of ["labs", "medical", "security", "containment", "deep"]) {
    const W = 880, H = 200;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#f2f1ec"/>
      <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#1d262d" stroke-width="6"/>
      <text x="${W / 2}" y="78" font-family="Arial" font-size="40" letter-spacing="8" fill="#4a565f" text-anchor="middle">ZONE SUPPLY</text>
      <text x="${W / 2}" y="160" font-family="Arial" font-weight="bold" font-size="76" letter-spacing="10" fill="#1d262d" text-anchor="middle">${z.toUpperCase()}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `breaker-${z}.webp`));
  }
  // the gensets' numbers, stencilled on their enclosures
  for (const n of [1, 2, 3]) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="${W / 2}" y="210" font-family="Arial" font-weight="bold" font-size="190" letter-spacing="20" fill="#e9e4d4" text-anchor="middle">GEN ${n}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, `paint-gen-${n}.webp`));
  }
  {
    const W = 400, H = 560;   // the standard high-voltage warning
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#f4f2ec"/>
      <rect x="0" y="0" width="${W}" height="130" fill="#c0261c"/>
      <text x="${W / 2}" y="95" font-family="Arial" font-weight="bold" font-size="76" fill="#fff" text-anchor="middle">DANGER</text>
      <path d="M${W / 2} 165 L${W / 2 + 105} 345 L${W / 2 - 105} 345 Z" fill="#f2c20f" stroke="#111" stroke-width="10" stroke-linejoin="round"/>
      <path d="M${W / 2 + 12} 205 L${W / 2 - 22} 275 L${W / 2 + 4} 275 L${W / 2 - 14} 330 L${W / 2 + 30} 255 L${W / 2 + 4} 255 Z" fill="#111"/>
      <text x="${W / 2}" y="420" font-family="Arial" font-weight="bold" font-size="52" fill="#111" text-anchor="middle">HIGH</text>
      <text x="${W / 2}" y="480" font-family="Arial" font-weight="bold" font-size="52" fill="#111" text-anchor="middle">VOLTAGE</text>
      <text x="${W / 2}" y="530" font-family="Arial" font-size="22" fill="#333" text-anchor="middle">AUTHORISED PERSONNEL ONLY</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, "sign-high-voltage.webp"));
  }
  {
    st = 6107;   // a walkway line: worn yellow floor paint, a 1 x 0.1 m strip (repeats along its length)
    const W = 1000, H = 100;
    let wear = "";
    for (let k = 0; k < 90; k++) wear += `<rect x="${(rnd() * W).toFixed(0)}" y="${(rnd() * H).toFixed(0)}" width="${(4 + rnd() * 40).toFixed(0)}" height="${(3 + rnd() * 18).toFixed(0)}" fill="#000" opacity="${(0.3 + rnd() * 0.7).toFixed(2)}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>${wear}</mask></defs>
      <rect width="${W}" height="${H}" fill="#d9a40c" mask="url(#m)"/>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, "paint-walkway.webp"));
  }
  {
    st = 6109;   // hazard stripes: a 1 x 0.25 m band of yellow and black diagonals (repeats along its length)
    const W = 1000, H = 250;
    let stripes = "";
    for (let x = -300; x < W + 300; x += 100) stripes += `<path d="M${x} ${H} L${x + 50} ${H} L${x + 50 + H} 0 L${x + H} 0 Z" fill="#141414"/>`;
    let wear = "";
    for (let k = 0; k < 120; k++) wear += `<rect x="${(rnd() * W).toFixed(0)}" y="${(rnd() * H).toFixed(0)}" width="${(4 + rnd() * 50).toFixed(0)}" height="${(3 + rnd() * 30).toFixed(0)}" fill="#000" opacity="${(0.3 + rnd() * 0.7).toFixed(2)}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>${wear}</mask></defs>
      <g mask="url(#m)"><rect width="${W}" height="${H}" fill="#d9a40c"/>${stripes}</g>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, "paint-hazard.webp"));
  }
  console.log("power signs");
}

// ---- SPECIMEN CONTAINMENT'S PLATES (2026-10-27, REFERENCES.md round eleven). Containment red on the house plate; the
// cells and the dewars carry plain numbers; the lockdown notice is the printed one the system puts up.
{
  const PLATES = {
    "containment-stairs": ["C-400", "CONTAINMENT", "#c43a2b", "LEVEL B1 · CARD 3"],
    observation: ["C-410", "OBSERVATION", "#c43a2b", "AUTHORISED STAFF ONLY"],
    "specimen-cells": ["C-412", "SPECIMEN CELLS", "#c43a2b", "TWO-PERSON RULE"],
    "sample-storage": ["C-414", "SAMPLE STORAGE", "#c43a2b", "−80 °C · LN2"],
    "cryo-hall": ["C-420", "CRYO HALL", "#2f6fb0", "LN2 · OXYGEN DEPLETION HAZARD"],
    "cryo-pod": ["C-427", "CRYO POD 7", "#c43a2b", "SEALED"],
  };
  for (const [id, [num, name, band, sub]] of Object.entries(PLATES)) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="10" fill="#eef1f2"/>
      <rect x="0" y="${H - 42}" width="${W}" height="42" fill="${band}"/>
      ${mark(70, 92, 34, "#26313a")}
      <text x="130" y="76" font-family="Arial" font-weight="bold" font-size="30" fill="#5b6770" letter-spacing="3">${num}</text>
      <text x="130" y="134" font-family="Arial" font-weight="bold" font-size="${name.length > 15 ? 36 : 48}" fill="#1d262d">${name}</text>
      <text x="30" y="210" font-family="Arial" font-size="22" fill="#4a565f" letter-spacing="2">HALCYON BIOLOGICS · SITE 9</text>
      <text x="${W / 2}" y="${H - 13}" font-family="Arial" font-weight="bold" font-size="22" fill="#fff" letter-spacing="3" text-anchor="middle">${sub}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `plate-${id}.webp`));
  }
  // the numbers: each cell's frame and each dewar's (0.4 x 0.2)
  for (let n = 1; n <= 16; n++) {
    const W = 400, H = 200;
    for (const [pre, label] of [["cell", "CELL"], ["dewar", "DEWAR"]]) {
      if (pre === "cell" && n > 4) continue;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
        <rect width="${W}" height="${H}" fill="#f2f1ec"/>
        <rect x="0" y="0" width="${W}" height="44" fill="${pre === "cell" ? "#c43a2b" : "#2f6fb0"}"/>
        <text x="${W / 2}" y="34" font-family="Arial" font-weight="bold" font-size="30" letter-spacing="8" fill="#fff" text-anchor="middle">${label}</text>
        <text x="${W / 2}" y="170" font-family="Arial" font-weight="bold" font-size="120" fill="#1d262d" text-anchor="middle">${String(n).padStart(2, "0")}</text>
      </svg>`;
      await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `${pre}-${n}.webp`));
    }
  }
  {
    const W = 600, H = 420;   // the lockdown notice the system prints at every cell door
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#f4f2ec"/>
      <rect x="0" y="0" width="${W}" height="120" fill="#c0261c"/>
      <text x="${W / 2}" y="88" font-family="Arial" font-weight="bold" font-size="78" fill="#fff" text-anchor="middle">LOCKDOWN</text>
      <text x="${W / 2}" y="200" font-family="Arial" font-weight="bold" font-size="38" fill="#1d262d" text-anchor="middle">CONTAINMENT DOORS SEALED</text>
      <text x="${W / 2}" y="260" font-family="Arial" font-size="28" fill="#1d262d" text-anchor="middle">RELEASE REQUIRES ZONE POWER</text>
      <text x="${W / 2}" y="305" font-family="Arial" font-size="28" fill="#1d262d" text-anchor="middle">AND CONTROL AUTHORISATION</text>
      <rect x="40" y="350" width="${W - 80}" height="30" fill="#f2c20f"/>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, "sign-lockdown.webp"));
  }
  console.log("containment plates");
}

// ---- THE DEEP'S PLATES, STENCILS AND THE TUNNEL PLAN (2026-10-27, REFERENCES.md round twelve). The lab level keeps the
// house plates (the director's door the only one with no number); the tunnels get painted stencils and an old utility
// plan of the level drawn from the map itself (set/greybox.json), on yellowed paper, with no writing but its title.
{
  const PLATES = {
    "deep-corridor": ["D-500", "LEVEL B2", "#5b6770", "AUTHORISED ACCESS ONLY"],
    "deep-lab": ["D-510", "RESEARCH SUITE", "#c43a2b", "DIRECTOR'S AUTHORITY"],
    "deep-office": ["", "DIRECTOR", "#26313a", ""],
  };
  for (const [id, [num, name, band, sub]] of Object.entries(PLATES)) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="10" fill="#eef1f2"/>
      <rect x="0" y="${H - 42}" width="${W}" height="42" fill="${band}"/>
      ${mark(70, 92, 34, "#26313a")}
      <text x="130" y="76" font-family="Arial" font-weight="bold" font-size="30" fill="#5b6770" letter-spacing="3">${num}</text>
      <text x="130" y="134" font-family="Arial" font-weight="bold" font-size="${name.length > 15 ? 36 : 48}" fill="#1d262d">${name}</text>
      <text x="30" y="210" font-family="Arial" font-size="22" fill="#4a565f" letter-spacing="2">HALCYON BIOLOGICS · SITE 9</text>
      <text x="${W / 2}" y="${H - 13}" font-family="Arial" font-weight="bold" font-size="22" fill="#fff" letter-spacing="3" text-anchor="middle">${sub}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `plate-${id}.webp`));
  }
  // stencils, sprayed on the concrete (paint: see-through where there's no paint)
  const stencil = async (name, lines, W = 1200, H = 400, size = 120) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      ${lines.map((t, i) => `<text x="${W / 2}" y="${(H / (lines.length + 1)) * (i + 1) + size / 3}" font-family="Arial" font-weight="bold" font-size="${size}" letter-spacing="14" fill="#e6dfcd" fill-opacity="0.85" text-anchor="middle">${t}</text>`).join("")}
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, `paint-${name}.webp`));
  };
  await stencil("lift-capacity", ["FREIGHT · 4500 KG", "B1 ⇅ B2"], 1200, 400, 110);
  await stencil("tunnel-t1", ["T-1 →"], 800, 300, 170);
  await stencil("tunnel-t2", ["← T-2"], 800, 300, 170);
  await stencil("tunnel-s1", ["S-1 ↑"], 800, 300, 170);
  {
    st = 9107;
    const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "set", "greybox.json"), "utf8"));
    const rooms = G.rooms.filter((r) => r.floor === 2);
    const W = 1400, H = 900;
    const x0 = Math.min(...rooms.map((r) => r.rect.x)) - 4, x1 = Math.max(...rooms.map((r) => r.rect.x + r.rect.w)) + 4;
    const z0 = Math.min(...rooms.map((r) => r.rect.y)) - 4, z1 = Math.max(...rooms.map((r) => r.rect.y + r.rect.h)) + 4;
    const MX = 60, MY = 140, MW = W - 120, MH = H - 200;
    const k = Math.min(MW / (x1 - x0), MH / (z1 - z0));
    const ox = MX + (MW - (x1 - x0) * k) / 2, oy = MY + (MH - (z1 - z0) * k) / 2;
    const X = (x) => ox + (x - x0) * k, Y = (z) => oy + (z - z0) * k;
    let ink = "";
    for (const r of rooms) ink += `<rect x="${X(r.rect.x).toFixed(1)}" y="${Y(r.rect.y).toFixed(1)}" width="${(r.rect.w * k).toFixed(1)}" height="${(r.rect.h * k).toFixed(1)}" fill="none" stroke="#2c3e63" stroke-width="2.4"/>`;
    let stains = "";
    for (let i = 0; i < 9; i++) stains += `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" r="${(30 + rnd() * 110).toFixed(0)}" fill="#7a5a2a" opacity="${(0.06 + rnd() * 0.1).toFixed(2)}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#d9ccaa"/>
      ${stains}
      <text x="60" y="80" font-family="Courier New, monospace" font-weight="bold" font-size="40" letter-spacing="4" fill="#2c3e63">CITY OF ATLANTA · UTILITY TUNNELS · SHEET 14</text>
      ${ink}
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(path.join(DECALS, "plan-tunnels.webp"));
  }
  console.log("deep signs");
}

// ---- RESIDENTIAL'S DOOR PLATES AND NOTICES (2026-10-27). The wing got its plates last: the same house plate in the
// wing's warm grey; the shelter in shelter green. The notices are the ordinary paper of a place people lived in:
// quiet hours on the bunk-room doors, the laundry and the kitchen's rules. No names, nothing the lore needs.
{
  const PLATES = {
    canteen: ["R-200", "CANTEEN", "#7a6a58", "SERVICE 06:30 · 12:00 · 18:30"],
    kitchen: ["R-202", "KITCHEN", "#7a6a58", "CATERING STAFF ONLY"],
    stores: ["R-204", "STORES", "#7a6a58", "SIGN OUT ALL STOCK"],
    "safe-res": ["R-206", "SHELTER", "#3f8f4f", "RESIDENTIAL SAFE ROOM"],
    "bunks-a": ["R-210", "QUARTERS A", "#7a6a58", "BERTHS 1–12"],
    "bunks-b": ["R-212", "QUARTERS B", "#7a6a58", "BERTHS 13–24"],
    showers: ["R-214", "SHOWERS", "#7a6a58", ""],
    "rec-room": ["R-216", "RECREATION", "#7a6a58", ""],
  };
  for (const [id, [num, name, band, sub]] of Object.entries(PLATES)) {
    const W = 600, H = 300;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" rx="10" fill="#eef1f2"/>
      <rect x="0" y="${H - 42}" width="${W}" height="42" fill="${band}"/>
      ${mark(70, 92, 34, "#26313a")}
      <text x="130" y="76" font-family="Arial" font-weight="bold" font-size="30" fill="#5b6770" letter-spacing="3">${num}</text>
      <text x="130" y="134" font-family="Arial" font-weight="bold" font-size="${name.length > 15 ? 36 : 48}" fill="#1d262d">${name}</text>
      <text x="30" y="210" font-family="Arial" font-size="22" fill="#4a565f" letter-spacing="2">HALCYON BIOLOGICS · SITE 9</text>
      <text x="${W / 2}" y="${H - 13}" font-family="Arial" font-weight="bold" font-size="22" fill="#fff" letter-spacing="3" text-anchor="middle">${sub}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(path.join(DECALS, `plate-${id}.webp`));
  }
  // A4 notices (21 x 29.7 cm), taped up
  const notice = async (name, head, lines, seed) => {
    st = seed;
    const W = 420, H = 594;
    const tape = (x, y, r) => `<rect x="${x - 40}" y="${y - 12}" width="80" height="24" fill="#d8cfa8" opacity="0.85" transform="rotate(${r} ${x} ${y})"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="#f4f2ec"/>
      ${mark(W / 2, 90, 34, "#26313a")}
      <text x="${W / 2}" y="190" font-family="Arial" font-weight="bold" font-size="40" fill="#1d262d" text-anchor="middle">${head}</text>
      <rect x="40" y="215" width="${W - 80}" height="4" fill="#7a6a58"/>
      ${lines.map((t, i) => `<text x="${W / 2}" y="${280 + i * 46}" font-family="Arial" font-size="26" fill="#2b343b" text-anchor="middle">${t}</text>`).join("")}
      <text x="${W / 2}" y="${H - 40}" font-family="Arial" font-size="18" fill="#6a747c" text-anchor="middle">HALCYON BIOLOGICS · RESIDENTIAL SERVICES</text>
      ${tape(70, 20, -10 + j(4))}${tape(W - 70, 22, 9 + j(4))}
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, `notice-${name}.webp`));
  };
  await notice("quiet", "QUIET HOURS", ["22:00 – 06:00", "Shift workers are sleeping.", "Headphones in the rec room."], 7201);
  await notice("laundry", "LAUNDRY", ["Collection Mon · Wed · Fri", "Bag and label everything.", "Unlabelled items are kept", "for one week only."], 7202);
  await notice("kitchen", "KITCHEN RULES", ["Hairnets and gloves", "past this point.", "Report every spill.", "Clean as you go."], 7203);
  console.log("residential plates");
}
