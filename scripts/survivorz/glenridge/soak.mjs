// SURVIVORZ, GLENRIDGE HALL: A SOAK on game code alone (no AI). Many whole shows, and what went WRONG in them, not
// how they went: bodies flipping between running away and going back (a livelock reads as a stutter on the show),
// shows that ran out the hour with people standing, objectives that stalled with hands free to do them.
//   node scripts/survivorz/glenridge/soak.mjs [seeds=40] [first=1]      (after `npm run build`; DIST=<dir> for another build)
import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url); const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DIST = process.env.DIST ? path.resolve(process.env.DIST) : path.join(ROOT, "dist");
const { SimWorld } = require(path.join(DIST, "survivorz", "sim", "world.js"));
const N = Number(process.argv[2] ?? 40), FIRST = Number(process.argv[3] ?? 1), MAP = process.env.MAP ?? "glenridge";
const t0 = 1_800_000_000_000, ends = {}, fails = {};
const pairs = {}, examples = {};
let flipMinutes = 0, worstFlip = 0, worstFlipAt = "", threw = 0, standing = [], stalls = [];
for (let seed = FIRST; seed < FIRST + N; seed++) {
  const w = new SimWorld({ map: MAP, seed, start: t0 });
  const mode = new Map(), flips = new Map(), pairsNow = new Map();     // who -> mode ; who -> flips this minute
  let minute = 0, err = null, lastProg = 0, lastProgKey = "";
  try {
    for (let t = 0; t < 60 * 60_000 && !w.obj.ending; t += 100) {
      w.tick(100);
      for (const s of w.survivors) {
        if (!s.alive || s.escaped) continue;
        if (mode.get(s.who) !== s.mode) { const k = `${mode.get(s.who)}>${s.mode}`; mode.set(s.who, s.mode); flips.set(s.who, (flips.get(s.who) ?? 0) + 1); const m = pairsNow.get(s.who) ?? pairsNow.set(s.who, {}).get(s.who); m[k] = (m[k] ?? 0) + 1; }
      }
      const m = Math.floor(t / 60_000);
      if (m !== minute) {
        for (const [who, n] of flips) { if (n >= 20) { flipMinutes++; for (const [k, c] of Object.entries(pairsNow.get(who) ?? {})) pairs[k] = (pairs[k] ?? 0) + c; const top = Object.entries(pairsNow.get(who) ?? {}).sort((x, y) => y[1] - x[1])[0][0]; (examples[top] ??= []).length < 3 && examples[top].push(`seed ${seed} ${who} minute ${minute} (${n})`); if (n > worstFlip) { worstFlip = n; worstFlipAt = `seed ${seed} ${who} minute ${minute}`; } } }
        flips.clear(); pairsNow.clear(); minute = m;
        // a stall: ten minutes with nothing on the objectives' rows changing, three or more up
        if (MAP === "glenridge") {
          const g = w.sc, key = [g.boltedAt, Object.keys(g.boarded).length, g.clearAt, g.darkAt, g.lightAt].join("|");
          // (only while a defence is still open: with the door bolted, the windows boarded and the lights on, staying alive
          // is all there is to do — the objective since Nov 17 2026)
          const open = !g.boltedAt || ["dining-window", "library-window", "guest-window", "kitchen-window", "solarium-window"].some((id) => w.fac.doors.get(id)?.open) || (g.darkAt && !g.lightAt);
          if (key !== lastProgKey || !open) { lastProgKey = key; lastProg = m; }
          const up = w.survivors.filter((s) => s.alive && !s.escaped && s.mode !== "down").length;
          if (m - lastProg === 10 && up >= 3) stalls.push(`seed ${seed} from minute ${lastProg}: ${up} up, ${key}`);
        }
      }
    }
  } catch (e) { err = e; threw++; console.log(`seed ${seed} THREW ${(e.stack ?? e.message).split("\n").slice(0, 3).join(" | ")}`); }
  const o = w.obj, alive = w.survivors.filter((s) => s.alive && !s.turned).length;
  const end = o.ending || "running";
  ends[end] = (ends[end] ?? 0) + 1;
  if (end === "timeout" && alive >= 3) standing.push(`seed ${seed}: ${alive} alive`);
  for (const [k, n] of Object.entries(w.stats.jobFailAt ?? {})) { const kk = k.replace(/ .*?(\[|$)/, " $1"); fails[kk] = (fails[kk] ?? 0) + n; }
}
console.log(`${MAP}, ${N} shows from seed ${FIRST}: ${JSON.stringify(ends)}${threw ? `  THREW ${threw}` : ""}`);
console.log(`a body changing its mind 20+ times in a minute: ${flipMinutes} survivor-minutes${worstFlip ? ` (worst ${worstFlip}, ${worstFlipAt})` : ""}`);
for (const [k, n] of Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`   ${String(n).padStart(6)}  ${k.padEnd(18)} ${(examples[k] ?? []).join("; ")}`);
console.log(`ran out the hour with three or more alive: ${standing.length}${standing.length ? "  " + standing.join("; ") : ""}`);
console.log(`ten minutes with nothing done and three or more up: ${stalls.length}`); for (const s of stalls.slice(0, 12)) console.log("   " + s);
console.log("jobs given up, most first:"); for (const [k, n] of Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(4)}  ${k}`);
