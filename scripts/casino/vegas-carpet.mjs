// Generates an original, seamlessly tiling "classic casino carpet" colour map
// (red ground, gold lattice, jewel-tone medallions) and gives it real pile
// texture by overlaying the luminance of ambientCG Carpet013 (CC0).
//   node scripts/casino/vegas-carpet.mjs assets/downloads/ambientcg/Carpet013_2K/Carpet013_2K-JPG_Color.jpg out.jpg [red|midnight]
//   (then re-encode into client/public/assets/casino/vegas/tex/carpet-vegas-<variant>-color.jpg)
import { createRequire } from "node:module";
const sharp = createRequire(new URL("../../package.json", import.meta.url))("sharp");
const [pile, out, variant = "red"] = process.argv.slice(2);
const T = 1024; // design units; rendered at 2048
const PAL = {
  red: { ground: "#5e0a13", ground2: "#7d1220", gold: "#d4a437", gold2: "#8c6418", teal: "#0e6d6a", purple: "#4a1d6e", blue: "#1b3f8f", cream: "#f0dca0" },
  midnight: { ground: "#141433", ground2: "#22225a", gold: "#d4a437", gold2: "#8c6418", teal: "#0e6d6a", purple: "#7a1d4e", blue: "#9c1b2a", cream: "#f0dca0" },
}[variant];
const P = PAL;
// every motif is drawn centred on a lattice point; drawing it at all four
// wrapped copies makes the tile seamless.
const at = (cx, cy, svg) => {
  let s = "";
  for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
    const x = cx + dx, y = cy + dy;
    if (x < -300 || x > T + 300 || y < -300 || y > T + 300) continue;
    s += `<g transform="translate(${x},${y})">${svg}</g>`;
  }
  return s;
};
const petals = (n, r, rx, ry, fill, stroke, rot = 0) => Array.from({ length: n }, (_, i) =>
  `<ellipse cx="0" cy="${-r}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="4" transform="rotate(${rot + (360 / n) * i})"/>`).join("");
const scroll = (rot, col) => `<path d="M 0 -60 C 60 -120, 150 -110, 170 -40 C 185 10, 140 40, 110 15 C 90 -5, 110 -35, 130 -20" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" transform="rotate(${rot})"/>`;
const medallion = () =>
  `<circle r="190" fill="${P.ground2}" stroke="${P.gold}" stroke-width="12"/>` +
  [0, 90, 180, 270].map((r) => scroll(r + 45, P.gold)).join("") +
  petals(8, 110, 34, 70, P.teal, P.gold, 0) +
  petals(8, 80, 22, 46, P.purple, P.gold, 22.5) +
  `<circle r="62" fill="${P.blue}" stroke="${P.gold}" stroke-width="9"/>` +
  petals(6, 30, 12, 24, P.cream, P.gold2, 0) +
  `<circle r="14" fill="${P.gold}"/>`;
const rosette = () =>
  `<circle r="78" fill="${P.ground}" stroke="${P.gold2}" stroke-width="6"/>` +
  petals(6, 44, 20, 34, P.blue, P.gold, 30) +
  `<circle r="22" fill="${P.gold}" stroke="${P.gold2}" stroke-width="4"/>`;
const star = () => `<path d="M0,-34 L9,-9 L34,0 L9,9 L0,34 L-9,9 L-34,0 L-9,-9 Z" fill="${P.gold}" stroke="${P.gold2}" stroke-width="3"/>`;
let body = `<rect width="${T}" height="${T}" fill="${P.ground}"/>`;
// diagonal lattice (double line), wrapped
for (const o of [-T, 0, T]) {
  for (const down of [true, false]) {
    const line = (w, c) => `<line x1="${o}" y1="${down ? 0 : T}" x2="${o + T}" y2="${down ? T : 0}" stroke="${c}" stroke-width="${w}"/>`;
    body += line(18, P.gold2) + line(8, P.gold);
  }
}
body += at(T / 2, T / 2, medallion()) + at(0, 0, medallion());
body += [[T / 2, 0], [0, T / 2]].map(([x, y]) => at(x, y, rosette())).join("");
body += [[T / 4, T / 4], [3 * T / 4, T / 4], [T / 4, 3 * T / 4], [3 * T / 4, 3 * T / 4]].map(([x, y]) => at(x, y, star())).join("");
// tiny confetti dots in the ground, a casino carpet is never empty
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
for (let i = 0; i < 260; i++) {
  const x = rnd() * T, y = rnd() * T, c = [P.teal, P.purple, P.blue, P.gold][i % 4];
  body += at(x, y, `<circle r="${4 + rnd() * 5}" fill="${c}" opacity="0.85"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 ${T} ${T}">${body}</svg>`;
const base = await sharp(Buffer.from(svg)).resize(2048, 2048).blur(1.2).png().toBuffer();
// pile: luminance of the scanned carpet, re-centred on mid-grey, as an overlay
const g = sharp(pile).resize(2048, 2048).greyscale();
const st = await g.clone().stats();
const mean = st.channels[0].mean;
const pileBuf = await g.linear(1.6, 128 - mean * 1.6).toColourspace("srgb").png().toBuffer();
await sharp(base).composite([{ input: pileBuf, blend: "soft-light" }]).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
console.log("wrote", out, "pile mean", mean.toFixed(1));
