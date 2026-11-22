// SURVIVORZ: THE LAW FOR RECORDED CLIPS (Oct 23 2026). Until now only built moves went through the
// animation law; the recorded clips came straight from the retarget, and on Eric 16 of them clipped
// past 3 cm on whole frames (the lying clips' fingers into the chest, the rifle deaths' arms into the
// torso). This reads a body's clip check (anim/<body>/clip.json, from anim-clip.cjs), and every
// recorded clip that breaks the law is baked through the bake's own pipeline with nothing added —
// "lw:<clip>" in anim-recipes.js: the arms cleared of the body, the joints held to the cast's range, a
// twitch smoothed — under its own name. The raw retarget is kept in out-raw/<body>/ the first time,
// so a re-run starts from the recording, not from its own last pass.
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-clip.cjs <body>  (first: the law's measure over every clip)
//   node scripts/survivorz/anim-law-recorded.cjs <body> [--dry]
// then pack.mjs <body>. A RE-RETARGET OVERWRITES THE PASS: run this again after retarget-batch.cjs.
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const body = process.argv[2], dry = process.argv.includes("--dry");
if (!body) { console.error("usage: anim-law-recorded.cjs <body> [--dry]"); process.exit(1); }
const BUILT = /^(bd|gr|gs|gp|hd)-/;
// the finisher's halves are a PAIR placed by the pack (anim-pairs.mjs): judged and fixed as pairs, not here
const PAIRED = /^(fz|fza)-/;
const clip = JSON.parse(fs.readFileSync(path.join(STAGE, "anim", body, "clip.json"), "utf8"));
const out = path.join(STAGE, "out", body), raw = path.join(STAGE, "out-raw", body);
const bad = Object.entries(clip).filter(([n, v]) => !BUILT.test(n) && !PAIRED.test(n) && v.frames > 0).map(([n, v]) => [n, v]);
console.log(`${body}: ${bad.length} recorded clips break the law`);
fs.mkdirSync(raw, { recursive: true });
for (const [n, v] of bad) {
  console.log(`  ${n.padEnd(52)} ${(v.depth * 100).toFixed(1)} cm ${v.limb}:${v.bone} on ${v.frames}/${v.of}`);
  if (dry) continue;
  const src = path.join(out, `${n}.json`), keep = path.join(raw, `${n}.json`);
  // (a clip already through the law is restored from its recording first)
  if (fs.existsSync(keep)) fs.copyFileSync(keep, src); else fs.copyFileSync(src, keep);
}
// THE BAKES, SIDE BY SIDE (Nov 11 2026): one browser per clip, one after another, was most of this step's eight
// minutes (a body load each time). Now LAW_PROCS processes each bake a share of the clips in one page.
if (!dry && bad.length) {
  const n = Math.max(1, Math.min(Number(process.env.LAW_PROCS ?? 4), bad.length));
  const shares = Array.from({ length: n }, (_, i) => bad.filter((_, k) => k % n === i).map(([c]) => `lw:${c}`));
  const run = (list) => new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(__dirname, "anim-build.cjs"), body, list.join(",")], { cwd: ROOT, windowsHide: true, env: { ...process.env, LW_SOFT: "1" } });
    let all = "";
    p.stdout.on("data", (d) => { all += d; process.stdout.write(String(d).split("\n").filter(Boolean).map((l) => `    ${l}\n`).join("")); });
    p.stderr.on("data", (d) => { all += d; });
    p.on("error", (e) => resolve({ code: -1, all: all + e.message }));
    p.on("close", (code) => resolve({ code, all }));
  });
  (async () => {
    const rs = await Promise.all(shares.map(run));
    // (a share that died outright is said so; a clip that failed inside one already printed FAILED)
    // (and fails the step: it used to pass, the bake failing later at the final checks, where a resume can't fix it)
    if (rs.some((r) => r.code !== 0)) process.exitCode = 1;
    for (const [i, r] of rs.entries()) if (r.code !== 0) console.log(`    FAILED (share ${i + 1} of ${n}, ${shares[i].length} clips): ${r.all.trim().split("\n").pop()?.slice(0, 200)}`);
  })();
}
