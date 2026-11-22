// THE HOUSE'S DIALOGUE, MEASURED (Josh, Sep 2026: "check the AI dialague for
// any inconsistency and rate them for staleness").
//
// Run:  node scripts/checks/test_dialogue.mjs
//
// Staleness is not a taste question, it is a birthday problem. A pool of N
// lines drawn uniformly repeats itself after about sqrt(pi*N/2) draws, and the
// counter bubble redraws every 22 seconds — so a five-minute visit is ~14
// draws and a pool of 40 is already showing a repeat more often than not. This
// harness measures the pools a REAL player sees and fails when one is thin
// enough that the character starts sounding like a sign.
//
// TWO HALVES, because the two brains live on different sides of the wire:
//
//   · THE CLIENT POOLS (sterling-lines.ts, ada-lines.ts) are measured at
//     RUNTIME. esbuild bundles them with the rune stores stubbed — the pool
//     functions are pure over their ctx argument and never touch a store — so
//     every venue is measured against a matrix of real contexts (broke/rich,
//     indebted/clear, dry/funded budget, every VIP rank). That matters because
//     a source count over-states: grantState funded/low/dry are exclusive
//     branches and a player is only ever in one.
//   · THE SERVER POOLS (voss.ts, goblins.ts, sterling.ts) are module-private
//     consts, so they are counted from source by a depth-aware scan of their
//     array literals. That is a count of DECLARED variety, which for these is
//     the same thing — they are flat pools with no branching.
//
// IT ALSO CHECKS CONSISTENCY, the half that isn't arithmetic: the retired
// vocabulary must not come back (the seam is not a dial — see BACKROOMS.md's
// THE DESCENT), and one statistic must have one value everywhere it is quoted.

import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TMP = path.join(ROOT, "data", "dialogue-harness");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

// ---- the arithmetic --------------------------------------------------------

/** Expected draws before the first repeat, drawing uniformly with replacement
 *  from a pool of n (the birthday problem's expected-collision length). */
const untilRepeat = (size) => (size < 2 ? 1 : Math.sqrt((Math.PI * size) / 2));
/** P(at least one repeat) in `draws` uniform draws from a pool of `size`. */
function pRepeat(size, draws) {
  if (size < 2) return 1;
  let p = 1;
  for (let i = 0; i < draws; i++) p *= (size - i) / size;
  return 1 - Math.max(0, p);
}
/** The counter bubble rotates on this clock (Shop.svelte, Backrooms.svelte). */
const ROTATE_S = 22;
/** A visit long enough to notice a pattern in. */
const VISIT_S = 300;
const VISIT_DRAWS = Math.floor(VISIT_S / ROTATE_S);

// ---- counting an array literal out of source ------------------------------

/** Count the top-level elements of the array literal that starts at `from`.
 *  Depth-aware and string-aware, so nested arrays, template literals and a
 *  comma inside a line all count as one element — a naive split on "," reads
 *  "Yes, {name}." as two lines and flatters every pool it touches. */
function countArray(src, from) {
  let i = src.indexOf("[", from);
  if (i < 0) return 0;
  let depth = 0, count = 0, seen = false, q = null, esc = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; seen = true; continue; }
    if (ch === "[" || ch === "(" || ch === "{") { depth++; continue; }
    if (ch === "]" || ch === ")" || ch === "}") {
      depth--;
      if (depth === 0) return count + (seen ? 1 : 0);
      continue;
    }
    if (ch === "," && depth === 1) { count++; seen = false; continue; }
    if (depth === 1 && !/\s/.test(ch)) seen = true;
  }
  return 0;
}

/** Every `const NAME = [` pool declared in a source file. */
function poolsIn(file) {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  const out = {};
  const re = /^const ([A-Z][A-Z0-9_]*)\s*=\s*\[/gm;
  let m;
  while ((m = re.exec(src))) out[m[1]] = countArray(src, m.index);
  return out;
}

// ---- the client's two brains, bundled with the stores stubbed --------------

async function loadClientBrains() {
  mkdirSync(TMP, { recursive: true });
  const entry = path.join(TMP, "entry.ts");
  writeFileSync(
    entry,
    // STERLING_VENUES rides along so the venue list below is the brain's own
    // rather than a copy that silently stops covering new venues.
    'export { sterlingLinePool, STERLING_VENUES } from "' + path.join(ROOT, "client/src/lib/sterling-lines").replace(/\\/g, "/") + '";\n' +
      'export { vossLinePool } from "' + path.join(ROOT, "client/src/lib/ada-lines").replace(/\\/g, "/") + '";\n' +
      'export { pickFresh } from "' + path.join(ROOT, "client/src/lib/linepick").replace(/\\/g, "/") + '";\n',
  );
  const out = path.join(TMP, "brains.mjs");
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        // The pool functions are PURE over their ctx argument — they never
        // read a store — so the runes modules only need to resolve, not work.
        name: "stub-stores",
        setup(b) {
          b.onResolve({ filter: /\.svelte(\.ts)?$|bigwins/ }, (a) => ({ path: a.path, namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: "export const session={};export const wallet={};export const emoji={};" +
              "export const wheel={};export const prefs={};export const THEMES=[];" +
              "export const emporium={};export const lender={};export const bigWins={};",
            loader: "js",
          }));
        },
      },
    ],
  });
  return import("file://" + out.replace(/\\/g, "/"));
}

/** Every context a player can actually be in, crossed — the pool is measured
 *  as the WORST of these, because the thinnest one is the one that sounds
 *  like a loop. */
function vossContexts() {
  const out = [];
  for (const grantState of ["funded", "low", "dry"])
    for (const relics of [0, 7, 20])
      for (const debt of [null, { payoff: 4000, stage: 0 }, { payoff: 4000, stage: 3 }])
        for (const hasSuit of [true, false])
          out.push({
            name: "Surveyor", coins: hasSuit ? 9000 : 100, relics, locker: 4, hasSuit,
            carryingRelic: false, carryingTape: false,
            grant: grantState === "dry" ? 0 : grantState === "low" ? 9000 : 200000,
            grantState, deaths: 1, debt, hour: 15, levelsOpen: 2,
          });
  return out;
}

function sterlingContexts() {
  const out = [];
  for (const vipRank of [0, 1, 2, 3, 4])
    for (const coins of [10, 600, 90000])
      for (const loan of [null, { payoff: 5000, stage: 0 }, { payoff: 5000, stage: 3 }])
        out.push({
          name: "Patron", coins, owned: 120, hasTalisman: vipRank > 1, itemsOwned: 4,
          ownedThemes: [], theme: "cozy", hour: 15, lastWin: null, vipRank, loan,
          spinsLeft: 3, visits: 2,
        });
  return out;
}

const run = async () => {
  console.log(`\n  (a ${VISIT_S / 60}-minute visit is ${VISIT_DRAWS} draws at one line per ${ROTATE_S}s)\n`);

  // ---- THE CLIENT COUNTERS, measured at runtime ---------------------------
  let brains;
  try {
    brains = await loadClientBrains();
    ok(true, "both client line brains bundle and load");
  } catch (e) {
    ok(false, "both client line brains bundle and load — " + e.message);
    return;
  }

  /** The smallest pool any real context produces for this venue. */
  const worst = (fn, venue, ctxs) => {
    let min = Infinity, max = 0, at = null;
    for (const c of ctxs) {
      const pool = fn(venue, c);
      const set = new Set(pool);
      if (set.size < min) { min = set.size; at = c; }
      if (set.size > max) max = set.size;
      // Duplicates are WEIGHTING, not waste: sterling-lines pushes its tier
      // lines RANK times on purpose, so a Magnate hears them more often. The
      // honest staleness number is therefore the UNIQUE count, which is what
      // is measured — a repeated line is one line however often it is pushed.
    }
    return { min, max, at };
  };

  const report = (label, size, max) => {
    const r = untilRepeat(size);
    const p = pRepeat(size, VISIT_DRAWS);
    const span = max && max !== size ? `–${max}` : "";
    console.log(
      `      ${label.padEnd(26)} ${(String(size) + span).padStart(6)} lines · repeats after ~${r.toFixed(0)} draws · ` +
        `${(p * 100).toFixed(0)}% chance of a repeat in ${VISIT_DRAWS} draws`,
    );
    return { size, r, p };
  };

  console.log("  DR. VOSS — client counter pools (worst real context):");
  const vctx = vossContexts();
  const vossVenues = ["threshold", "station", "debrief", "warehouse"];
  const vossSizes = {};
  for (const v of vossVenues) {
    const w = worst(brains.vossLinePool, v, vctx);
    vossSizes[v] = w.min;
    report("voss/" + v, w.min, w.max);
  }

  console.log("\n  STERLING — client counter pools (worst real context):");
  const sctx = sterlingContexts();
  // THE VENUE LIST IS THE BRAIN'S, NOT A COPY OF IT. This was a hardcoded
  // array until Sep 2026, when the Exchange venue was added, the suite went
  // green, and NOTHING had measured it — a new venue could ship at six lines
  // and this file would applaud. Same lesson as test_three_voices' help
  // lists: read the fixture from the thing under test.
  const sterlingVenues = brains.STERLING_VENUES;
  ok(Array.isArray(sterlingVenues) && sterlingVenues.length >= 4,
     `the venue list comes from sterling-lines itself (${sterlingVenues?.length} venues)`);
  const sterlingSizes = {};
  for (const v of sterlingVenues) {
    let w;
    try { w = worst(brains.sterlingLinePool, v, sctx); } catch { continue; }
    if (!Number.isFinite(w.min)) continue;
    sterlingSizes[v] = w.min;
    report("sterling/" + v, w.min, w.max);
  }

  // THE FLOOR. Below this a venue starts repeating inside one visit more often
  // than not — pRepeat(30, 13) is already 94%, so the floor is not "never
  // repeats", it is "does not read as a loop": a fresh line most draws.
  const FLOOR = 20;
  for (const [v, size] of Object.entries(vossSizes))
    ok(size >= FLOOR, `voss/${v} has at least ${FLOOR} lines in every real context (${size})`);
  for (const [v, size] of Object.entries(sterlingSizes))
    ok(size >= FLOOR, `sterling/${v} has at least ${FLOOR} lines in every real context (${size})`);

  // ---- THE ONE REPEAT A PLAYER ACTUALLY NOTICES ---------------------------
  // The same line twice running reads as a bug rather than as a short pool,
  // and it is the only staleness symptom that can be removed outright.
  {
    const pool = brains.sterlingLinePool("shop", sterlingContexts()[0]);
    let backToBack = 0, prev = null;
    for (let i = 0; i < 4000; i++) {
      const line = brains.pickFresh("harness", pool);
      if (line === prev) backToBack++;
      prev = line;
    }
    ok(backToBack === 0, `no line is ever drawn twice running (${backToBack} in 4,000 draws over a ${pool.length}-line pool)`);
    // …and the memory is per-key, so two venues on screen at once don't
    // silence each other's lines.
    brains.pickFresh("k1", ["only"]);
    ok(brains.pickFresh("k2", ["only"]) === "only", "a one-line pool still answers rather than going blank");
  }

  // ---- THE SERVER POOLS ---------------------------------------------------
  console.log("\n  SERVER pools (declared variety):");
  const server = {
    "voss.ts": poolsIn("src/voss.ts"),
    "goblins.ts": poolsIn("src/goblins.ts"),
    "sterling.ts": poolsIn("src/sterling.ts"),
  };
  // Pools a player meets over and over. A one-in-N rare event's pool is judged
  // on its own terms further down; these are the ones typed at on purpose.
  const ASKED_FOR = {
    "voss.ts": ["GREETINGS", "ON_STERLING", "ON_GOBLINS"],
    "goblins.ts": ["GREETINGS", "ON_STERLING", "ON_VOSS"],
  };
  for (const [file, names] of Object.entries(ASKED_FOR)) {
    for (const name of names) {
      const size = server[file][name] ?? 0;
      report(`${file}:${name}`, size);
      ok(size >= 5, `${file}:${name} has at least 5 lines (${size})`);
    }
  }
  // The rare three-way in #general. Its pools are small on purpose — it fires
  // once every few days — but two firings in a row must not read the same, so
  // each side needs enough that a straight repeat is unlikely.
  console.log("\n  THE THREE-WAY (rare, but must not read the same twice):");
  for (const [file, name] of [["voss.ts", "NOTICES"], ["voss.ts", "STERLING_ANSWERS"], ["voss.ts", "GOBLIN_BARGES"]]) {
    const size = server[file][name] ?? 0;
    console.log(`      ${(file + ":" + name).padEnd(26)} ${String(size).padStart(3)} variants`);
    ok(size >= 4, `${file}:${name} has at least 4 variants (${size})`);
  }

  // ---- CONSISTENCY, the half that is not arithmetic -----------------------
  console.log("");
  const readAll = (files) => files.map((f) => readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const dialogue = readAll([
    "src/voss.ts", "src/goblins.ts", "src/sterling.ts",
    "client/src/lib/ada-lines.ts", "client/src/lib/sterling-lines.ts",
    "client/src/components/Backrooms.svelte",
  ]);
  // Only the PROSE — a comment may (and does) explain what was retired.
  const prose = dialogue
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

  // THE SEAM IS NOT A DIAL (Josh, Sep 2026: "it was always one door from the
  // begining"). The retired framing must not creep back into a line.
  const dialWords = /\b(tuned? well enough|tuning bands?|untuned|held stable|it CHOOSES|calibration data)\b/i;
  const dialHit = prose.split("\n").find((l) => dialWords.test(l));
  ok(!dialHit, "no line offers to TUNE the seam to a destination" + (dialHit ? ` — "${dialHit.trim().slice(0, 80)}"` : ""));

  // ONE STATISTIC, ONE VALUE. Her retrieval rate used to be 74 in two places
  // and a fresh 70-78 roll in the third.
  const pcts = [...prose.matchAll(/[Rr]etrieval rate[^.\n]*?(\d\d)\s*%/g)].map((m) => m[1]);
  const words = /seventy-four percent/.test(prose);
  ok(pcts.length === 0 || new Set(pcts).size === 1, `the retrieval rate has one value everywhere it is quoted (${[...new Set(pcts)].join(", ") || "templated"})`);
  ok(!words || pcts.every((p) => p === "74"), "…and the spelled-out copy agrees with the figure");

  // THE THREE VOICES POINT AT EACH OTHER'S HELP. A player who finds one should
  // be able to find the other two without leaving the channel.
  const vs = readFileSync(path.join(ROOT, "src/voss.ts"), "utf8");
  const gb = readFileSync(path.join(ROOT, "src/goblins.ts"), "utf8");
  const stg = readFileSync(path.join(ROOT, "src/sterling.ts"), "utf8");
  ok(/\/sterling/.test(vs) && /\/goblins/.test(vs), "Voss's help names the other two commands");
  ok(/\/sterling/.test(gb) && /\/ada/.test(gb), "the goblins' help names the other two commands");
  ok(/\/goblins/.test(stg) && /\/ada/.test(stg), "Sterling's help names the other two commands");

  try { rmSync(TMP, { recursive: true, force: true }); } catch {}

  console.log(`\n${n - bad}/${n} dialogue asserts passed`);
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
