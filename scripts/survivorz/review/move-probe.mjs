// SOLACE SURVIVORZ — THE REVIEW: how the bodies TURN and STOP, straight from the sim (docs/survivorz/RUBRIC.md C2, C3).
//
//   npm run build && node scripts/survivorz/review/move-probe.mjs [--runs 6] [--seed 1] [--minutes 20] [--list]
//
// Runs shows headless on game code alone and reads every survivor every step: how fast the heading turned and how
// fast the speed changed. A recording (score-run.mjs) says THAT a body snapped; this says WHY — each hard turn and
// hard stop is filed under what the body was doing (mode · job · pose, before → after), so a fix can go where
// the snaps come from.
//
// What counts (the rubric's lines) — a shove from one of the dead (that step and the next) is a blow, like a grab,
// and is not read as the body's own change of speed:
//   · a TURN is read on a body on its feet (not lying, not in a pair move, not on a ladder), walking or standing
//   · a speed CHANGE is read between two steps on its feet; a stop INTO a grab, a fall or a death is the event's
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { SimWorld } = require(path.join(ROOT, "dist/survivorz/sim/world.js"));

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg("runs", 6)), SEED0 = Number(arg("seed", 1)), MIN = Number(arg("minutes", 20));
const LIST = process.argv.includes("--list");
const STEP = 100, SEC = STEP / 1000;
export const TURN_PASS = 240, ACCEL_PASS = 8, ACCEL_FIGHT_PASS = 16;   // °/s; m/s² at the 99th percentile, calm and in a fight
const TURN_HARD = 300, ACCEL_HARD = 8.5;             // what gets filed under its cause

const LYING = new Set(["down", "dead", "sleep", "grabbed", "revive", "turning"]);
const LOCO = new Set(["walk", "jog", "sprint", "crouch-walk"]);
const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = (x) => Math.round(x * 10) / 10;
const mx = (xs) => { let m = 0; for (const x of xs) if (x > m) m = x; return m; };

const turnsWalk = [], turnsStand = [], accels = [], accelsCalm = [], accelsFight = [];
const turnWhy = new Map(), accelWhy = new Map();
const examples = [];
const file = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
const what = (s) => `${s.mode}/${s.job?.kind ?? "-"}/${s.pose}`;
let steps = 0;

for (let r = 0; r < RUNS; r++) {
  const w = new SimWorld({ seed: SEED0 + r, start: 1_800_000_000_000, stepMs: STEP });
  const start = w.t;
  const prev = new Map();
  while (!w.overAt && w.t - start < MIN * 60_000) {
    w.tick(STEP);
    for (const s of w.survivors) {
      const p = prev.get(s.who);
      const up = s.alive && !s.link && !LYING.has(s.pose) && s.mode !== "down";
      // (shoved by one of the dead this step: a blow, like a grab — the change of speed is the blow's, not the body's)
      const shoved = s.shovedAt === w.t;
      const cur = { x: s.x, z: s.z, h: s.h, up, what: what(s), pose: s.pose, floor: s.floor, v: 0, shoved, mode: s.mode };
      if (p && p.up && up && p.floor === s.floor) {
        steps++;
        const v = Math.hypot(s.x - p.x, s.z - p.z) / SEC;
        cur.v = v;
        if (v < 12) {   // (a teleport isn't a speed)
          let dh = Math.abs(s.h - p.h) % (2 * Math.PI); if (dh > Math.PI) dh = 2 * Math.PI - dh;
          const turn = (dh * 180 / Math.PI) / SEC;
          const moving = v > 0.25 || p.v > 0.25;
          if (moving) turnsWalk.push(turn); else if (turn > 0) turnsStand.push(turn);
          if (turn > TURN_HARD) {
            const k = `${moving ? "moving" : "standing"}  ${p.what} → ${cur.what}`;
            file(turnWhy, k);
            if (examples.length < 400) examples.push({ kind: "turn", v: Math.round(turn), k, seed: SEED0 + r, min: r1((w.t - start) / 60_000), who: s.who });
          }
          const a = Math.abs(v - p.v) / SEC;
          const own = !shoved && !p.shoved;
          // (CALM: at their own business. IN A FIGHT: fighting, backing off, fleeing, hiding — lunges, blows, bodies in the way)
          if ((p.v > 0.25 || v > 0.25) && own) { accels.push(a); (s.mode === "job" && p.mode === "job" ? accelsCalm : accelsFight).push(a); }
          if (a > ACCEL_HARD && own) {
            const k = `${v < p.v ? "stop " : "start"} ${r1(p.v)}→${r1(v)}`.replace(/\d+(\.\d)?→\d+(\.\d)?/, "") + ` ${p.what} → ${cur.what}`;
            file(accelWhy, k);
            if (examples.length < 400) examples.push({ kind: "accel", v: r1(a), k: `${r1(p.v)}→${r1(v)} m/s  ${p.what} → ${cur.what}`, seed: SEED0 + r, min: r1((w.t - start) / 60_000), who: s.who });
          }
        }
      }
      prev.set(s.who, cur);
    }
  }
}

const top = (m, n = 14) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
const hardTurn = turnsWalk.filter((x) => x > TURN_HARD).length + turnsStand.filter((x) => x > TURN_HARD).length;
const hardAcc = accels.filter((x) => x > ACCEL_HARD).length;
console.log(`${RUNS} shows × up to ${MIN} min, ${steps} body-steps on their feet`);
console.log(`TURNS  moving: p50 ${Math.round(pct(turnsWalk, 0.5))}  p99 ${Math.round(pct(turnsWalk, 0.99))}  max ${Math.round(mx(turnsWalk))} °/s   standing (when turning): p50 ${Math.round(pct(turnsStand, 0.5))}  p99 ${Math.round(pct(turnsStand, 0.99))}  max ${Math.round(mx(turnsStand))} °/s   over ${TURN_HARD}: ${hardTurn}`);
console.log(`SPEED  change: p50 ${r1(pct(accels, 0.5))}  p99 ${r1(pct(accels, 0.99))}  max ${r1(mx(accels))} m/s²   over ${ACCEL_HARD}: ${hardAcc}`);
console.log(`       calm (their own business): p99 ${r1(pct(accelsCalm, 0.99))}  p99.9 ${r1(pct(accelsCalm, 0.999))}  (${accelsCalm.length} steps)   in a fight (fighting, backing off, fleeing, hiding): p99 ${r1(pct(accelsFight, 0.99))}  (${accelsFight.length} steps)`);
console.log(`\nhard turns (over ${TURN_HARD}°/s), by what the body was doing:`);
for (const [k, n] of top(turnWhy)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log(`\nhard speed changes (over ${ACCEL_HARD} m/s²):`);
for (const [k, n] of top(accelWhy)) console.log(`  ${String(n).padStart(5)}  ${k}`);
if (LIST) { console.log(""); for (const e of examples.slice(0, 60)) console.log(`  ${e.kind} ${String(e.v).padStart(6)}  seed ${e.seed} ${e.min} min ${e.who}: ${e.k}`); }
const c2 = pct(turnsWalk, 0.99) <= TURN_PASS && pct(turnsStand, 0.99) <= 300 && hardTurn < 10, c3 = pct(accelsCalm, 0.99) <= ACCEL_PASS + 0.05 && pct(accelsFight, 0.99) <= ACCEL_FIGHT_PASS;
console.log(`
C2 turns (p99 ≤ ${TURN_PASS}°/s moving, ≤ 300 on the spot, under 10 over ${TURN_HARD}): ${c2 ? "pass" : "FAIL"}   C3 speed (p99 ≤ ${ACCEL_PASS} m/s² calm, ≤ ${ACCEL_FIGHT_PASS} in a fight): ${c3 ? "pass" : "FAIL"}`);
process.exitCode = c2 && c3 ? 0 : 1;
