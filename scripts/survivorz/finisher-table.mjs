// SOLACE SURVIVORZ — WHICH FINISHERS A PAIR MAY PLAY (Oct 25 2026). The finisher pack was made on one slim
// mannequin; fitted to our bodies (anim-recipes.js zombieFit, both halves), most pairs come within the line but
// not all — a big zombie on a crawl, a lying survivor under a broad one. The law (no limb in any body) means a
// clip that still clips for THAT zombie and THAT survivor never plays for them. This reads the overlap sweeps
// and writes docs/survivorz/finisher-fit.json: per zombie, per survivor, the finishers that measured within the
// line and which survivor clip goes with each —
//   "fz"  the survivor plays the pack's own fz-<clip>       (the zombie plays zd-<clip>-<survivor>)
//   "zv"  the survivor plays its fitted zv-<clip>-<zombie>  (likewise)
// The line is 3 cm on the sixth-deepest vertex, 6 for a pair with Rollo in it (his suit: anim-pairs.mjs).
//   node scripts/survivorz/finisher-table.mjs <zombie-half sweep> [<survivor-half sweep>]
// A sweep line: "<zombie> <survivor> <clip> ... overlap <cm> cm @<t>" (scratchpad fitcheck.cjs / sfitcheck.cjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pairLine } from "../../docs/survivorz/anim-pairs.mjs";

// (--bites <dir>: the bite sweeps too — scratchpad zbs.cjs writes zbs-<zombie>.json, rows {z, s, k, d} — and the
// table gains `bites`: per zombie, per survivor, the bites (forearm, shoulder, leg) that measured within the line)
// (--duos <file>: the two-survivor moves too — scratchpad ps2.cjs's json, rows {a, b, name, d}: hug and kiss once per
// pair (a before b alphabetically, the roles by shoulder height), the rest as a's move on b — and the table gains
// `duos`: per a, per b, the moves that measured within the line)
const argv = process.argv.slice(2), bi = argv.indexOf("--bites"), bitesDir = bi >= 0 ? argv.splice(bi, 2)[1] : null;
const di = argv.indexOf("--duos"), duosFile = di >= 0 ? argv.splice(di, 2)[1] : null;
// (--self <dir>: the bodies' own clip checks — anim-clip.cjs's output saved as clip-<body>.log — and a clip that
// clips into its OWN body is never one the table plays, however clean the pair is: a fitted survivor half that
// bent an arm into its own chest falls back to the pack's clip, or the move is dropped for that pair)
const si = argv.indexOf("--self"), selfDir = si >= 0 ? argv.splice(si, 2)[1] : null;
const selfBad = {};
if (selfDir) for (const f of fs.readdirSync(selfDir).filter((f) => /^clip-[a-z]+\.log$/.test(f))) {
  const body = f.slice(5, -4), set = (selfBad[body] = new Set());
  // (a HIP FOLD is not a clip — Josh, Oct 27 2026: the top of the thigh meeting the belly when a heavy body bends
  // double is flesh compressing at the groin, not a limb through a body. Flagged at the thigh's root bone only,
  // it is left out; a thigh flagged anywhere else, or any arm, still counts)
  for (const line of fs.readFileSync(path.join(selfDir, f), "utf8").split(/\r?\n/)) { const m = line.match(/cm deep\s+(\S+)\s+\((\S+?),/); if (m && !/upperleg_twist|thigh_(twist|stretch)/.test(m[2])) set.add(m[1]); }
}
const bad = (body, clip) => !!selfBad[body]?.has(clip);
const [zSweep, sSweep] = argv;
if (!zSweep) throw new Error("usage: finisher-table.mjs <zombie-half sweep> [<survivor-half sweep>]");
const read = (f) => {
  const m = new Map();
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const x = line.match(/^(zombie-\S+) (\S+) (fz-\S+) .* overlap (\d+(?:\.\d+)?) cm/);
    if (x) m.set(`${x[1]} ${x[2]} ${x[3]}`, +x[4] / 100);
  }
  return m;
};
const fz = read(zSweep), zv = sSweep ? read(sSweep) : new Map();
const pairs = {}, worst = {};
let total = 0, ok = 0, viaFit = 0;
for (const [key, a] of fz) {
  const [z, s, clip] = key.split(" "), line = pairLine(z, s), b = zv.get(key);
  const okZv = b != null && !bad(s, `zv-${clip}-${z}`), okFz = !bad(s, clip);
  const pick = okZv && (!okFz || b < a) ? ["zv", b] : okFz ? ["fz", a] : ["none", Infinity];
  total++;
  if (pick[1] <= line + 1e-9) {
    ok++; if (pick[0] === "zv") viaFit++;
    ((pairs[z] ??= {})[s] ??= {})[clip] = pick[0];
  } else (worst[clip] ??= []).push(+(pick[1] * 100).toFixed(1));
}
// THE STRUGGLES PLAY AS CHAINS — a grab, the struggle held, then an ending (the bite, or the survivor breaking
// free) — so a link is only offered when the whole chain is clean for that pair: a clean grab whose every ending
// clips would start a struggle the pair can't finish
const CHAINS = [["fz-front-struggle-start", "fz-front-struggle-start-idle", ["fz-front-struggle-end", "fz-front-struggle-free"]],
  ["fz-back-struggle-start", "fz-back-struggle-idle", ["fz-back-struggle-end", "fz-back-struggle-free"]]];
let broken = 0;
for (const m of Object.values(pairs)) for (const c of Object.values(m)) for (const [a, b, ends] of CHAINS) {
  const whole = c[a] && c[b] && ends.some((e) => c[e]);
  if (!whole) for (const k of [a, b, ...ends]) if (c[k]) { delete c[k]; broken++; ok--; }
}
if (broken) console.log(`${broken} clean links dropped: their struggle had a link that clips`);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "survivorz", "finisher-fit.json");
const bites = {}, bOff = {}; let bTotal = 0, bOk = 0;
if (bitesDir) for (const f of fs.readdirSync(bitesDir).filter((f) => /^zbs-zombie-.*\.json$/.test(f))) for (const r of JSON.parse(fs.readFileSync(path.join(bitesDir, f), "utf8"))) {
  bTotal++;
  const sc = r.k === "leg" && selfBad[r.s]?.has(`bd-bitten-leg-${r.z}`) ? `bd-bitten-leg-${r.z}` : `bd-bitten-${r.k}`;
  if (r.d <= pairLine(r.z, r.s) + 1e-9 && !bad(r.s, sc)) { bOk++; ((bites[r.z] ??= {})[r.s] ??= []).push(r.k); } else (bOff[r.k] ??= []).push(+(r.d * 100).toFixed(1));
}
const duos = {}, dOff = {}; let dTotal = 0, dOk = 0;
if (duosFile) for (const r of JSON.parse(fs.readFileSync(duosFile, "utf8"))) {
  dTotal++;
  const selfHit = [[r.a, r.b], [r.b, r.a]].some(([x, y]) => [...(selfBad[x] ?? [])].some((c) => c.startsWith(`bd-${r.name}`) && c.endsWith(`-${y}`)));
  if (r.d <= pairLine(r.a, r.b) + 1e-9 && !selfHit) { dOk++; ((duos[r.a] ??= {})[r.b] ??= []).push(r.name); } else (dOff[r.name] ??= []).push(+(r.d * 100).toFixed(1));
}
// (and `solo`: per body, its own clips that still clip into it — the game doesn't play those for that body)
const solo = Object.fromEntries(Object.entries(selfBad).filter(([, v]) => v.size).map(([b, v]) => [b, [...v].sort()]));
fs.writeFileSync(out, JSON.stringify({ note: "finishers (pairs) and bites (bites) each zombie may play on each survivor, the two-survivor moves (duos) — only what measured within the line — and each body's own clips that clip into it (solo: never played for that body) (scripts/survivorz/finisher-table.mjs)", pairs, ...(bitesDir ? { bites } : {}), ...(duosFile ? { duos } : {}), ...(selfDir ? { solo } : {}) }, null, 0) + "\n");
if (selfDir) console.log("solo, not played:", Object.entries(solo).map(([b, v]) => `${b} ${v.length}`).join(", "));
if (duosFile) { console.log(`duos: ${dOk} of ${dTotal} within the line`); for (const [k, v] of Object.entries(dOff)) console.log(`  ${k.padEnd(10)} off for ${v.length} pairs (median ${v.sort((p, q) => p - q)[v.length >> 1]} cm)`); }
if (bitesDir) { console.log(`bites: ${bOk} of ${bTotal} within the line`); for (const [k, v] of Object.entries(bOff)) console.log(`  ${k.padEnd(10)} off for ${v.length} pairs (median ${v.sort((p, q) => p - q)[v.length >> 1]} cm)`); }
console.log(`${ok} of ${total} pair-clips within the line (${viaFit} by the survivor's fitted half) -> ${path.relative(process.cwd(), out)}`);
const fewest = Object.entries(pairs).flatMap(([z, m]) => Object.entries(m).map(([s, c]) => [`${z} ${s}`, Object.keys(c).length])).sort((p, q) => p[1] - q[1]);
console.log("fewest finishers:", fewest.slice(0, 6).map(([k, n]) => `${k} ${n}`).join(", "));
for (const [clip, v] of Object.entries(worst).sort((p, q) => q[1].length - p[1].length)) console.log(`  ${clip.padEnd(30)} off for ${v.length} pairs (median ${v.sort((p, q) => p - q)[v.length >> 1]} cm)`);
