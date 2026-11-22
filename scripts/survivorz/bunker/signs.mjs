// SURVIVORZ — THE BUNKER's painted signs (BUNKER.md: "painted room signs, readable on camera").
//   node scripts/survivorz/bunker/signs.mjs
//   → assets/downloads/survivorz/rooms/vault-lobby/decals/bunker-<id>.webp (the shared decal folder the client
//     reads as "roomdecal"; gitignored, so copy it to the server with the rooms)
// Stencilled paint, worn where hands and trolleys rub: the layout (bunker/layout.mjs) places each one as a
// `paint` decal, lit and see-through where the paint is gone. 400 px a metre, sized to the decal it fills.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DECALS = path.join(ROOT, "assets/downloads/survivorz/rooms/vault-lobby/decals");
let st = 9011;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const FONT = "Stencil, 'Arial Black', Arial";

/** id, the decal's metres (w x h), the words, the paint, an arrow ("<" or ">") */
const SIGNS = [
  ["shelter-14", 3.0, 0.5, "CIVIL DEFENCE SHELTER 14", "#d9a40c"],
  ["decon", 1.6, 0.36, "DECONTAMINATION", "#1b1d1f"],
  ["common", 2.6, 0.45, "COMMON ROOM", "#1b1d1f"],
  ["barracks", 2.0, 0.4, "BARRACKS", "#1b1d1f"],
  ["armory", 2.0, 0.4, "ARMORY", "#b3121b"],
  ["security", 2.4, 0.36, "SECURITY OFFICE", "#1b1d1f"],
  ["radio", 2.4, 0.36, "RADIO ROOM", "#1b1d1f"],
  ["generator", 3.0, 0.5, "GENERATOR", "#d9a40c"],
  ["workshop", 2.0, 0.36, "WORKSHOP", "#1b1d1f"],
  ["infirmary", 2.0, 0.36, "INFIRMARY", "#1b6b3a"],
  ["mess", 2.4, 0.4, "MESS HALL", "#1b1d1f"],
  ["stores", 2.2, 0.4, "STORES", "#1b1d1f"],
  ["arrow-armory", 1.4, 0.3, "ARMORY", "#b3121b", "<"],
  ["arrow-radio", 1.4, 0.3, "RADIO ROOM", "#1b1d1f", ">"],
  ["arrow-dorms", 1.4, 0.3, "DORMITORIES", "#1b1d1f", "<"],
  ["arrow-stores", 1.4, 0.3, "STORES", "#1b1d1f", ">"],
];

for (const [id, w, h, words, colour, arrow] of SIGNS) {
  const W = Math.round(w * 400), H = Math.round(h * 400);
  let wear = "";
  for (let k = 0; k < Math.round(W / 30); k++) wear += `<ellipse cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" rx="${(2 + rnd() * 10).toFixed(0)}" ry="${(1 + rnd() * 4).toFixed(0)}" fill="#000" opacity="${(0.2 + rnd() * 0.5).toFixed(2)}"/>`;
  const fs = Math.round(H * 0.72);
  const arrowW = arrow ? H : 0;
  const tx = arrow === "<" ? (W + arrowW) / 2 : arrow === ">" ? (W - arrowW) / 2 : W / 2;
  const head = arrow === "<"
    ? `<path d="M${H * 0.12} ${H / 2} L${H * 0.62} ${H * 0.12} L${H * 0.62} ${H * 0.34} L${H * 0.95} ${H * 0.34} L${H * 0.95} ${H * 0.66} L${H * 0.62} ${H * 0.66} L${H * 0.62} ${H * 0.88} Z" fill="${colour}"/>`
    : arrow === ">"
    ? `<path d="M${W - H * 0.12} ${H / 2} L${W - H * 0.62} ${H * 0.12} L${W - H * 0.62} ${H * 0.34} L${W - H * 0.95} ${H * 0.34} L${W - H * 0.95} ${H * 0.66} L${W - H * 0.62} ${H * 0.66} L${W - H * 0.62} ${H * 0.88} Z" fill="${colour}"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>${wear}</mask></defs>
    <g mask="url(#m)" opacity="0.92">
      <text x="${tx}" y="${H / 2 + fs * 0.36}" font-family="${FONT}" font-weight="bold" font-size="${fs}" fill="${colour}" text-anchor="middle"
        textLength="${Math.round((W - arrowW) * 0.9)}" lengthAdjust="spacingAndGlyphs">${words}</text>
      ${head}
    </g>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(DECALS, `bunker-${id}.webp`));
}
console.log(`bunker signs: ${SIGNS.length} painted to ${path.relative(ROOT, DECALS)}`);
