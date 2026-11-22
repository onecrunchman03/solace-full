// Level 9 (The Suburbs) relic art — drawn, not downloaded.
//
//   node scripts/relic-art-suburbs/draw.mjs [slug …]   (all ten, or just those)
//   node scripts/relic-art-suburbs/draw.mjs --sheet    (the review contact sheet only)
//
// Each relic is a hand-written SVG beside this file (<slug>.svg). It is
// rasterised at 2x, trimmed to the object and fitted inside 512px, and written
// as client/public/assets/relics/<slug>.webp — the same output scripts/relic-art.mjs
// gives the photographed relics (transparent, trimmed, longest side 512).
// Every run also rebuilds contact-sheet.png here: the ten on the game's dark
// card colour beside four existing relics, for judging them as a family.
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../client/public/assets/relics");
const SLUGS = [
  "the-porch-light-bulb",
  "the-garden-gnome",
  "the-mornings-paper",
  "the-welcome-mat",
  "the-lawn-flamingo",
  "the-watch-sticker",
  "the-sprinkler-head",
  "the-mailbox-flag",
  "the-tv-remote",
  "claires-rattle",
];
const NEIGHBOURS = ["claires-bath-duck", "chaos-emerald", "claires-night-light", "the-eight-ball"];

const args = process.argv.slice(2);
const sheetOnly = args.includes("--sheet");
const pick = args.filter((a) => !a.startsWith("--"));
const todo = sheetOnly ? [] : pick.length ? SLUGS.filter((s) => pick.includes(s)) : SLUGS;

for (const slug of todo) {
  const svg = readFileSync(resolve(HERE, `${slug}.svg`));
  // 72dpi is 1 user unit = 1px; 144 is the 2x render.
  const raw = await sharp(svg, { density: 144 }).png().toBuffer();
  const out = await sharp(raw)
    .trim({ threshold: 1 })
    .resize(512, 512, { fit: "inside" })
    .webp({ quality: 88, alphaQuality: 95 })
    .toBuffer({ resolveWithObject: true });
  await sharp(out.data).toFile(resolve(OUT, `${slug}.webp`));
  console.log(`${slug}.webp  ${out.info.width}x${out.info.height}`);
}

// The contact sheet: five across, the ten relics then four neighbours, on the
// game's dark card colour; one small tile row under it shows them at 96px,
// roughly the size a hotbar or a debrief card draws them.
const all = [...SLUGS, ...NEIGHBOURS].filter((s) => existsSync(resolve(OUT, `${s}.webp`)));
const COLS = 5, CELL = 260, PAD = 10, SMALL = 96;
const rows = Math.ceil(all.length / COLS);
const tiles = [];
for (const [i, slug] of all.entries()) {
  const big = await sharp(resolve(OUT, `${slug}.webp`))
    .resize(CELL - PAD * 2, CELL - PAD * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  tiles.push({ input: big, left: (i % COLS) * CELL + PAD, top: Math.floor(i / COLS) * CELL + PAD });
  const small = await sharp(resolve(OUT, `${slug}.webp`))
    .resize(SMALL - 12, SMALL - 12, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  tiles.push({ input: small, left: i * SMALL + 6, top: rows * CELL + 16 });
}
const width = Math.max(COLS * CELL, all.length * SMALL);
await sharp({ create: { width, height: rows * CELL + SMALL + 32, channels: 4, background: "#1a1612" } })
  .composite(tiles).png().toFile(resolve(HERE, "contact-sheet.png"));
console.log(`contact-sheet.png`);
