// THE SUIT COLOURS WITHOUT A CANVAS FILTER (Oct 16 2026: "what happened to the
// characters skins they are all yellow").
//
// A suit colour with no painted texture is a CSS filter over the yellow one,
// drawn through the canvas's `filter`. Safari before 18 — and the Mac app's
// webview — ignores that property, so those suits came out yellow there; the
// regulars' purple, army, pink and cobalt (Oct 14) are all filter colours.
// client/src/backrooms/suitcolor.ts now applies the filter itself, per pixel,
// where the browser can't. This pins:
//  1. the per-pixel filter against CHROMIUM's own canvas filter output for the
//     regulars' four colours and the sterling (sepia) suit — captured from the
//     real browser — to within 3/255;
//  2. the parser reading degrees, plain numbers and percentages;
//  3. a source sweep: no canvas `filter` in suitcolor.ts outside drawFiltered,
//     so a new recolour can't quietly skip the fallback.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const src = esbuild.buildSync({
  stdin: { contents: `export { filterPixels, parseCssFilter, suitFilter } from "./src/backrooms/suitcolor.ts";`, resolveDir: path.join(ROOT, "client"), loader: "ts" },
  bundle: true, format: "cjs", write: false, platform: "node", logLevel: "silent",
}).outputFiles[0].text;
const mod = { exports: {} };
new Function("module", "exports", "require", src)(mod, mod.exports, require);
const { filterPixels, parseCssFilter, suitFilter } = mod.exports;

// Chromium 1246's canvas filter on these four inputs (scratchpad filter_fixture.mjs).
const INPUTS = [[230, 190, 40], [120, 100, 30], [30, 30, 30], [210, 210, 210]];
const CHROMIUM = {
  pink: [[255, 150, 207], [193, 81, 110], [32, 32, 32], [226, 226, 226]],
  army: [[81, 97, 48], [37, 44, 22], [3, 3, 3], [102, 102, 102]],
  cobalt: [[30, 57, 94], [0, 12, 59], [0, 0, 0], [70, 70, 70]],
  purple: [[155, 83, 156], [68, 36, 121], [1, 1, 1], [125, 125, 125]],
  sterling: [[181, 197, 217], [59, 69, 85], [0, 0, 0], [227, 229, 235]],
};

console.log("THE FILTER, MATCHED TO THE BROWSER");
for (const [colour, want] of Object.entries(CHROMIUM)) {
  const px = new Uint8ClampedArray(INPUTS.flatMap(([r, g, b]) => [r, g, b, 255]));
  filterPixels(px, parseCssFilter(suitFilter(colour)));
  let worst = 0;
  INPUTS.forEach((_, i) => { for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(px[i * 4 + k] - want[i][k])); });
  ok(worst <= 3 && px[3] === 255, `${colour}: within ${worst}/255 of Chromium's own canvas filter, alpha untouched`);
}

console.log("THE PARSER");
{
  const ops = parseCssFilter("hue-rotate(-75deg) saturate(110%) brightness(0.5)");
  ok(ops.length === 3 && ops[0].fn === "hue-rotate" && ops[0].v === -75 && Math.abs(ops[1].v - 1.1) < 1e-9 && ops[2].v === 0.5,
    "degrees, percentages and plain numbers read in order");
  const id = new Uint8ClampedArray([200, 120, 40, 255]);
  filterPixels(id, parseCssFilter("hue-rotate(0deg) saturate(1) brightness(1) contrast(1)"));
  ok(id[0] === 200 && id[1] === 120 && id[2] === 40, "an identity filter leaves a pixel exactly as it was");
}

console.log("EVERY RECOLOUR GOES THROUGH THE FALLBACK");
{
  const file = readFileSync(path.join(ROOT, "client", "src", "backrooms", "suitcolor.ts"), "utf8");
  const body = file.slice(file.indexOf("function drawFiltered"), file.indexOf("export function suitCanvas"));
  const outside = file.replace(body, "").match(/\.filter\s*=/g) ?? [];
  const probe = (file.match(/function canvasFilters[\s\S]*?\n}\n/)?.[0].match(/\.filter\s*=/g) ?? []).length;
  ok(outside.length === probe, `no canvas filter set in suitcolor.ts outside drawFiltered and the support probe (${outside.length} vs ${probe})`);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
