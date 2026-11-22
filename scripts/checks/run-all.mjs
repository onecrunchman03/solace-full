// THE WHOLE SUITE, IN ONE COMMAND — and the thing that keeps CLAUDE.md honest.
//
//   node scripts/checks/run-all.mjs              run everything, verify the docs
//   node scripts/checks/run-all.mjs --fix-docs   ...and rewrite drifted counts
//   node scripts/checks/run-all.mjs --only gun   run the harnesses matching a substring
//   node scripts/checks/run-all.mjs --list       show what would run, run nothing
//
// WHY THIS EXISTS. Every harness prints its own assert count, and CLAUDE.md
// quotes those counts in prose so a future session knows the weight of each
// one. Harnesses grow inside a session; the prose gets written once. By Aug
// 2026 seven counts had drifted (shyguy 35→49, casino_floor 58→80, …) and TWO
// harnesses — test_casino_gun and test_casino_layout, 351 asserts between them
// — were missing from the list entirely, so a session reading the doc had no
// way to know to run them. This runner makes that drift a RED RUN instead of
// something you notice a month later.
//
// STRICTLY SEQUENTIAL, ON PURPOSE. The server-spawning harnesses hardcode
// ports and several of them COLLIDE (jukebox + talisman_shop both bind 8496;
// casino_gun + wheel_face both bind 8497). Running two at once would have them
// fighting over a socket and failing for a reason that has nothing to do with
// the code under test. If you ever parallelize this, give every harness its
// own port first.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DOC = path.join(ROOT, "CLAUDE.md");

/** Not a pass/fail harness — a Monte Carlo bench that prints p-values for a
 *  human to read. It has no assert count to verify, so it is not part of the
 *  suite; run it by hand when retuning odds. */
// load_backrooms is a MEASUREMENT (a minute of 64 bodies), run before raising a
// cap or shipping a level — not a pass/fail suite member.
// livekit_ghost needs a LiveKit binary and a Playwright Chromium on the box —
// run by hand before touching the ghost voice (law 12).
const NOT_A_HARNESS = new Set(["run-all.mjs", "audit_rng.mjs", "load_backrooms.mjs", "livekit_ghost.mjs"]);

/** A harness that spawns a real server needs longer than a pure-data one. */
const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS ?? 300_000);
/** Harnesses that walk a body across a whole level in real time. test_temp's
 *  fairness run is three walks of the office at a walking pace, about 2.5
 *  minutes each when the Temp is fair, so it can never fit the default. */
const LONG_HARNESS = { "test_temp.mjs": 720_000 };
const timeoutFor = (file) => Math.max(TIMEOUT_MS, LONG_HARNESS[file] ?? 0);

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? args[i + 1] : null;
})();

const files = readdirSync(HERE)
  .filter((f) => f.endsWith(".mjs") && !NOT_A_HARNESS.has(f))
  .filter((f) => !only || f.includes(only))
  .sort();

// ---- what CLAUDE.md claims ---------------------------------------------------
// The doc quotes counts in TWO shapes, both of which are load-bearing prose:
//   AFTER  "`test_gator.mjs` (28 — …"  ·  "`…/validate_map.mjs` (23 DESIGN checks"
//   BEFORE "13-assert harness `node scripts/checks/check_mig66.mjs`"
// A bare mention with no number ("test_casino_floor.mjs now pins all four
// together") correctly matches neither, so prose stays free.
//
// A RANGE ("49–50") means the harness's count legitimately varies run to run —
// test_shyguy has a conditional assert (it checks the arrival distance only if
// the creature actually appeared that pass), so pinning it to one number would
// have this runner flapping red on alternate runs. Anything inside the range
// is green; --fix-docs WIDENS a range rather than collapsing it, so the
// "this one varies" signal survives.
const CLAIM_FORMS = [
  { re: /([A-Za-z0-9_]+\.mjs)`?\s*\((\d+)(?:\s*[–—-]\s*(\d+))?/g, file: 1, lo: 2, hi: 3 },
  { re: /(\d+)(?:\s*[–—-]\s*(\d+))?-assert[^`\n]*`[^`\n]*?([A-Za-z0-9_]+\.mjs)/g, file: 3, lo: 1, hi: 2 },
];

function claimsIn(text) {
  const byFile = new Map();
  for (const form of CLAIM_FORMS) {
    for (const m of text.matchAll(form.re)) {
      const lo = Number(m[form.lo]);
      const hi = m[form.hi] === undefined ? lo : Number(m[form.hi]);
      const list = byFile.get(m[form.file]) ?? [];
      list.push({ lo, hi });
      byFile.set(m[form.file], list);
    }
  }
  return byFile;
}

if (has("--list")) {
  for (const f of files) console.log(f);
  console.log(`\n${files.length} harnesses`);
  process.exit(0);
}

// --claims prints what the doc is understood to promise, without running
// anything. The parser is the fiddly half of this script; this is how you
// check it after touching CLAUDE.md's prose.
if (has("--claims") && !existsSync(DOC)) {
  console.log("No CLAUDE.md here, so there are no documented counts to show.");
  process.exit(0);
}
if (has("--claims")) {
  const found = claimsIn(readFileSync(DOC, "utf8"));
  const live = new Set(files);
  for (const [file, list] of [...found].sort()) {
    const shape = list.map((c) => (c.lo === c.hi ? c.lo : `${c.lo}-${c.hi}`)).join(", ");
    console.log(`  ${live.has(file) ? "·" : "×"} ${file.padEnd(30)} ${shape}`);
  }
  console.log(`\n· = live harness   × = historical (scratchpad, no longer on disk)`);
  const missing = files.filter((f) => !found.has(f));
  if (missing.length) console.log(`\nundocumented: ${missing.join(", ")}`);
  process.exit(0);
}

// ---- reading a harness's own scoreboard --------------------------------------
// Two output families are in use across the suite, e.g.
//   "296/296 casino layout asserts passed"   →  pass/total
//   "pointer lock: 60 passed, 0 failed"      →  pass/fail
// Take the LAST match: harnesses print per-assert lines above their summary,
// and some print an interim tally mid-run.
function scoreOf(out) {
  let score = null;
  for (const m of out.matchAll(/(\d+)\s*\/\s*(\d+)(?!\d)/g)) {
    score = { pass: Number(m[1]), total: Number(m[2]) };
  }
  for (const m of out.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/gi)) {
    const pass = Number(m[1]), failed = Number(m[2]);
    score = { pass, total: pass + failed };
  }
  return score;
}

function run(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(HERE, file)], {
      cwd: ROOT,
      env: {
        ...process.env,
        // THE HOUSE'S BRAINS (src/npc): no harness server dials the real
        // model. An empty value is "set" to env.ts, so a .env line can't
        // switch it back on; test_npc_brain points its own server at a fake.
        NPC_BRAIN_URL: "",
        // THE RULES DIRECTOR (src/backrooms/director.ts) nudges Level 0's
        // creatures and lights; the creature harnesses pin each creature's
        // OWN rules and must not have a director re-timing them underneath.
        // test_director turns it off for itself and drives the ticks by hand.
        BACKROOMS_DIRECTOR: "0",
      },
    });
    let out = "";
    const soak = (b) => { out += b.toString(); };
    child.stdout.on("data", soak);
    child.stderr.on("data", soak);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      out += `\n[run-all] TIMED OUT after ${timeoutFor(file)}ms`;
    }, timeoutFor(file));

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ file, code, out, score: scoreOf(out), ms: Date.now() - started });
    });
  });
}

// (CLAIM_FORMS + claimsIn live up top, above the flag handling — the --claims
// flag needs them before this point.)

// ---- go ----------------------------------------------------------------------
console.log(`Running ${files.length} harnesses sequentially (shared ports)…\n`);

const results = [];
for (const f of files) {
  process.stdout.write(`  ${f.padEnd(30)}`);
  const r = await run(f);
  results.push(r);
  const secs = (r.ms / 1000).toFixed(1).padStart(6);
  if (r.code !== 0 || !r.score || r.score.pass !== r.score.total) {
    console.log(`FAIL ${secs}s`);
  } else {
    console.log(`ok   ${secs}s  ${String(r.score.pass).padStart(4)} asserts`);
  }
}

const failed = results.filter((r) => r.code !== 0 || !r.score || r.score.pass !== r.score.total);
const passed = results.filter((r) => !failed.includes(r));
const totalAsserts = passed.reduce((n, r) => n + r.score.pass, 0);

console.log(
  `\n${passed.length}/${results.length} harnesses green, ${totalAsserts} asserts, ` +
    `${(results.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0)}s total`,
);

for (const r of failed) {
  console.log(`\n──── ${r.file} (exit ${r.code}) ────`);
  console.log(r.out.trimEnd().split("\n").slice(-25).join("\n"));
}

// ---- verify (or repair) the documented counts --------------------------------
// A copy without CLAUDE.md (the public release) has nothing to verify against.
if (!existsSync(DOC)) process.exit(failed.length ? 1 : 0);
let doc = readFileSync(DOC, "utf8");
const claims = claimsIn(doc);
const drift = [];
const undocumented = [];

for (const r of passed) {
  const mine = claims.get(r.file);
  if (!mine) {
    undocumented.push(r);
    continue;
  }
  for (const c of mine) {
    const n = r.score.pass;
    if (n < c.lo || n > c.hi) {
      const said = c.lo === c.hi ? `${c.lo}` : `${c.lo}-${c.hi}`;
      drift.push({ file: r.file, said, real: n });
    }
  }
}

if (drift.length && has("--fix-docs")) {
  // One pass over the whole doc, so every occurrence of a file's count is
  // corrected — including the ones outside the validation list, which is
  // exactly where the stale numbers hide.
  const want = new Map(passed.map((r) => [r.file, r.score.pass]));
  for (const form of CLAIM_FORMS) {
    doc = doc.replace(form.re, (whole, ...g) => {
      const real = want.get(g[form.file - 1]);
      if (real === undefined) return whole;
      const lo = Number(g[form.lo - 1]);
      const hi = g[form.hi - 1] === undefined ? lo : Number(g[form.hi - 1]);
      if (real >= lo && real <= hi) return whole;
      const wanted = lo === hi ? String(real) : `${Math.min(lo, real)}–${Math.max(hi, real)}`;
      // Rewrite ONLY the leading number-or-range of the claim. Anchoring to
      // "(" (after-form) or the start of the match (before-form) keeps this
      // off any other digits in the sentence — a path like check_mig66.mjs
      // has numerals of its own.
      const NUM = /(\d+)(?:\s*[–—-]\s*\d+)?/;
      return form.lo === 1
        ? whole.replace(NUM, wanted)
        : whole.replace(new RegExp("\\(" + NUM.source), "(" + wanted);
    });
  }
  writeFileSync(DOC, doc);
  console.log(`\nCLAUDE.md: rewrote ${drift.length} drifted count(s).`);
} else if (drift.length) {
  console.log("\nCLAUDE.md counts have DRIFTED (run with --fix-docs to correct):");
  for (const d of drift) console.log(`  ${d.file.padEnd(30)} doc says ${d.said}, actual ${d.real}`);
}

if (undocumented.length) {
  console.log("\nNot mentioned in CLAUDE.md at all — add them to the validation list:");
  for (const r of undocumented) console.log(`  ${r.file.padEnd(30)} ${r.score.pass} asserts`);
}

const docBad = (drift.length && !has("--fix-docs")) || undocumented.length;
process.exit(failed.length || docBad ? 1 : 0);
