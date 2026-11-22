// SURVIVORZ, GLENRIDGE HALL: THE MANSION'S OWN HARNESSES, UNDER `npm run checks`.
//
// The six live in scripts/survivorz/glenridge beside the map they check (its walk map, its doors, its scenario, its
// car, its show page, and the steadiness of whole shows), and each is run by hand while the map is worked on. The
// code review of Nov 14 2026 found that the suite never ran any of them (E-12): the asserts that pin the mansion
// went red only for somebody who remembered to run them. This runs each one as it stands, in turn, and adds them up.
//
//   node scripts/checks/test_survivorz_glenridge.mjs        (after `npm run build`; about four minutes)
//
// THEY ARE WHOLE SHOWS ON GAME CODE: no model, no browser, no graphics card, no port. Nothing here is on a live
// clock, so a red one is a real red one.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "scripts", "survivorz", "glenridge");
const PARTS = [
  ["test-nav.mjs", "the walk map: one connected house, every door passable"],
  ["test-world.mjs", "the world: rooms, spots and doors as the scenario needs them"],
  ["test-page.mjs", "the show page's arithmetic: the rain's roof, where the camera is"],
  ["test-show.mjs", "whole shows: every show ends survived or wiped, on the clock"],
  ["test-steady.mjs", "nobody dithers, nothing stalls, each fix staged on its own"],
];

/** a harness's own count: "N passed, M failed" · "N/M" · "GREEN N" */
function score(out, code) {
  let m = [...out.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/gi)].pop();
  if (m) return { pass: +m[1], fail: +m[2] };
  m = [...out.matchAll(/\b(\d+)\/(\d+)\b/g)].pop();
  if (m) return { pass: +m[1], fail: +m[2] - +m[1] };
  m = [...out.matchAll(/\b(GREEN|RED)\s+(\d+)/g)].pop();
  if (m) return { pass: +m[2], fail: code === 0 ? 0 : 1 };
  return { pass: 0, fail: 1 };
}

let pass = 0, fail = 0;
for (const [file, what] of PARTS) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, file)], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const s = score(out, r.status);
  // (a harness that died without a count is one failure, and its last words are shown)
  if (r.status !== 0 && s.fail === 0) s.fail = 1;
  pass += s.pass; fail += s.fail;
  console.log(`  ${s.fail ? "x" : "+"} ${file}: ${what} (${s.pass} asserts${s.fail ? `, ${s.fail} FAILED` : ""}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (s.fail) for (const line of out.split("\n").filter((l) => /^\s*(x|✗|FAIL)\b/.test(l) || /Error|RED/.test(l)).slice(0, 12)) console.log("      " + line.trim().slice(0, 300));
}
console.log(`\nglenridge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
