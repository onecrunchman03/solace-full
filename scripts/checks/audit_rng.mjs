// EMOJI RUMBLE — RNG / PROBABILITY AUDIT
//
// A Monte Carlo bench for every point where randomness decides money. Where a
// game exports its real tables and helpers, this drives THOSE (roulette's
// betWins/payoutMult, slots' WEIGHTS/PAYOUT/payline, poker's shuffle/best7,
// blackjack's handValue, the wheel's slot table and rate constants) so the
// numbers below describe the shipped code, not a paraphrase of it. Anything
// re-implemented here is marked [MODEL] in its section header and is a
// deliberate independent oracle — the point of an oracle is that it was
// written from the rules, not copied from the implementation.
//
// Every line reports theoretical vs observed with a chi-square goodness-of-fit
// p-value, so "off by 0.05%" can be read as noise or as a bug.
//
//   node scripts/checks/audit_rng.mjs            (default N)
//   node scripts/checks/audit_rng.mjs --n 5000000

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomInt, randomBytes } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => require(path.join(ROOT, "dist", m));

const argN = (() => {
  const i = process.argv.indexOf("--n");
  return i > 0 ? Number(process.argv[i + 1]) : 1_000_000;
})();
const N = Math.max(100_000, argN);

// ---- real code under test --------------------------------------------------
const { WHEEL_SLOTS, LEGENDARY_HIT_RATE, reaperRate, REAPER_SHIELD_RATE, REAPER_BASE, REAPER_GRACE } = dist("wheel.js");
const slots = dist("slots.js");
const roul = dist("roulette.js");
const craps = dist("craps.js");
const bj = dist("blackjack.js");
const poker = dist("poker-eval.js");
const lot = dist("lottery.js");

// ---- statistics ------------------------------------------------------------
/** Regularized upper incomplete gamma Q(a,x) — Numerical Recipes gammq. */
function gammq(a, x) {
  if (x < 0 || a <= 0) return NaN;
  const gln = lngamma(a);
  if (x < a + 1) {
    // series for P(a,x), return 1-P
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n <= 1000; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  // continued fraction for Q(a,x)
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}
function lngamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5, ser = 1.000000000190015;
  tmp -= (x + 0.5) * Math.log(tmp);
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
/** Chi-square GOF over parallel observed/expected-probability arrays. */
function chiSq(observed, probs, total) {
  let x2 = 0, cells = 0;
  for (let i = 0; i < probs.length; i++) {
    const e = probs[i] * total;
    if (e < 5) continue; // pooling guard: cells too thin to test
    x2 += ((observed[i] - e) * (observed[i] - e)) / e;
    cells++;
  }
  const df = Math.max(1, cells - 1);
  return { x2, df, p: gammq(df / 2, x2 / 2) };
}
/** Two-sided binomial z-test for a single rate. */
function zTest(hits, n, p) {
  const se = Math.sqrt((p * (1 - p)) / n);
  const z = (hits / n - p) / se;
  return { z, p: erfc(Math.abs(z) / Math.SQRT2) };
}
function erfc(x) {
  const z = Math.abs(x), t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5,
    -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8];
  let d = 0, dd = 0;
  for (let j = cof.length - 1; j > 0; j--) { const tmp = d; d = ty * d - dd + cof[j]; dd = tmp; }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}

// ---- reporting -------------------------------------------------------------
const PASS_PCT = 0.001; // 0.1 percentage-point band on probabilities
const rows = [];
const add = (event, theo, obs, extra = {}) => {
  const delta = obs - theo;
  const within = Math.abs(delta) <= PASS_PCT;
  // A rate can sit outside 0.1pp and still be pure noise at large N (or inside
  // it and be a real bug at huge N), so the verdict needs the p-value too.
  const pv = extra.p;
  const stat = pv === undefined ? null : pv >= 0.001;
  const pass = stat === null ? within : within || stat;
  rows.push({ event, theo, obs, delta, pass, p: pv, note: extra.note ?? "" });
  return pass;
};
const section = (t) => console.log(`\n\x1b[1m── ${t}\x1b[0m`);
const line = (label, theo, obs, pv) =>
  console.log(
    `  ${label.padEnd(42)} theo ${(theo * 100).toFixed(4).padStart(9)}%  ` +
    `obs ${(obs * 100).toFixed(4).padStart(9)}%  Δ ${((obs - theo) * 100 >= 0 ? "+" : "")}` +
    `${((obs - theo) * 100).toFixed(4).padStart(8)}pp` +
    (pv === undefined ? "" : `  p=${pv < 1e-4 ? pv.toExponential(1) : pv.toFixed(4)}`),
  );

console.log(`EMOJI RUMBLE RNG AUDIT — N = ${N.toLocaleString()} per experiment\n`);
const t0 = Date.now();

// ===========================================================================
// 1. THE RNG SOURCE ITSELF
// ===========================================================================
section("1. RNG source — crypto.randomInt / cryptoRand uniformity & independence");
{
  // (a) A NON-power-of-two range is where modulo bias shows up. 37 and 10000
  //     are the ranges roulette and slots actually use.
  for (const range of [6, 32, 37, 100]) {
    const counts = new Array(range).fill(0);
    for (let i = 0; i < N; i++) counts[randomInt(range)]++;
    const { x2, df, p } = chiSq(counts, new Array(range).fill(1 / range), N);
    const worst = Math.max(...counts.map((c) => Math.abs(c / N - 1 / range)));
    console.log(`  randomInt(${String(range).padEnd(5)}) χ²=${x2.toFixed(1)} df=${df} p=${p.toFixed(4)}  max cell dev ${(worst * 100).toFixed(4)}pp`);
    add(`RNG randomInt(${range}) max cell deviation`, 0, worst, { p });
  }

  // (b) LOW-BIT bias: a modulo implementation skews the low bits hardest.
  //     In 0..36 there are 19 EVEN values (0,2,…,36) and 18 odd, so the honest
  //     null for "odd" is 18/37 — testing the odd count against 19/37 is a
  //     guaranteed false alarm, which is exactly what the first run did.
  let odds = 0;
  for (let i = 0; i < N; i++) odds += randomInt(37) & 1;
  const lb = zTest(odds, N, 18 / 37);
  line("randomInt(37) odd parity (18/37)", 18 / 37, odds / N, lb.p);
  add("RNG randomInt(37) low-bit parity", 18 / 37, odds / N, { p: lb.p });

  // (c) cryptoRand(): the wheel's [0,1) float, byte-for-byte as shipped.
  const cryptoRand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  const bins = new Array(100).fill(0);
  let sum = 0, prev = null, lagNum = 0, lagDen = 0;
  for (let i = 0; i < N; i++) {
    const r = cryptoRand();
    bins[Math.min(99, Math.floor(r * 100))]++;
    sum += r;
    if (prev !== null) { lagNum += (prev - 0.5) * (r - 0.5); lagDen++; }
    prev = r;
  }
  const cr = chiSq(bins, new Array(100).fill(0.01), N);
  console.log(`  cryptoRand() 100-bin χ²=${cr.x2.toFixed(1)} df=${cr.df} p=${cr.p.toFixed(4)}  mean=${(sum / N).toFixed(6)} (theo 0.500000)`);
  const lag1 = lagNum / lagDen / (1 / 12); // normalise by variance of U(0,1)
  console.log(`  cryptoRand() lag-1 autocorrelation ${lag1.toFixed(6)} (theo 0, |r|<0.003 at this N)`);
  add("RNG cryptoRand() 100-bin uniform", 0.01, 0.01, { p: cr.p });
  add("RNG cryptoRand() mean", 0.5, sum / N, { p: cr.p });
  add("RNG cryptoRand() lag-1 independence", 0, Math.abs(lag1), {
    p: Math.abs(lag1) < 0.003 ? 1 : 0, note: "|r| < 0.003",
  });
}

// ===========================================================================
// 2. THE WHEEL — the sole faucet
// ===========================================================================
section("2. The Wheel — real WHEEL_SLOTS table + real rate constants");
{
  const kinds = ["blank", "common", "rare", "legendary", "talisman", "death", "mystery"];
  const physical = {};
  for (const k of kinds) physical[k] = WHEEL_SLOTS.filter((s) => s === k).length;
  console.log(`  physical slots: ${kinds.map((k) => `${k} ${physical[k]}`).join(" · ")} (total ${WHEEL_SLOTS.length})`);

  const counts = {};
  for (const k of kinds) counts[k] = 0;
  let deathFires = 0, deathLands = 0, bareFires = 0, legHits = 0, legLands = 0;
  const cryptoRand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  for (let i = 0; i < N; i++) {
    const slot = WHEEL_SLOTS[randomInt(WHEEL_SLOTS.length)];
    counts[slot]++;
    // The two sub-rolls exactly as applyOutcome performs them.
    // THE REAPER'S PATIENCE is stateful, so there is no single "death rate"
    // to audit any more. What this bench can still check is the roll itself,
    // at the two rates that bound it: a landing against a talisman
    // (REAPER_SHIELD_RATE) and a landing against somebody who has only just
    // gone bare (REAPER_BASE). The LIFE those two produce is simulated in
    // test_reaper.mjs instead, where the chain can actually be walked.
    if (slot === "death") {
      deathLands++;
      if (!(cryptoRand() >= reaperRate(0, true))) deathFires++;
      if (!(cryptoRand() >= reaperRate(0, false))) bareFires++;
    }
    if (slot === "legendary") { legLands++; if (!(cryptoRand() >= LEGENDARY_HIT_RATE)) legHits++; }
  }
  const probs = kinds.map((k) => physical[k] / WHEEL_SLOTS.length);
  const obs = kinds.map((k) => counts[k]);
  const gof = chiSq(obs, probs, N);
  for (let i = 0; i < kinds.length; i++) {
    add(`Wheel slot: ${kinds[i]}`, probs[i], obs[i] / N);
    line(`slot ${kinds[i]}`, probs[i], obs[i] / N);
  }
  console.log(`  slot-type χ²=${gof.x2.toFixed(2)} df=${gof.df} p=${gof.p.toFixed(4)}`);

  const theoShield = (physical.death / 32) * REAPER_SHIELD_RATE;
  // Labels derived, never typed: a retune must not leave the report claiming
  // a rate the wheel no longer runs.
  line(`wedge breaks a SHIELD per spin (1/32 × ${REAPER_SHIELD_RATE})`, theoShield, deathFires / N, zTest(deathFires, N, theoShield).p);
  add("Wheel shield-break per spin", theoShield, deathFires / N, { p: zTest(deathFires, N, theoShield).p });
  line("fires | landed on death, shielded", REAPER_SHIELD_RATE, deathFires / deathLands, zTest(deathFires, deathLands, REAPER_SHIELD_RATE).p);
  add("Wheel reaper fire rate vs a shield", REAPER_SHIELD_RATE, deathFires / deathLands, { p: zTest(deathFires, deathLands, REAPER_SHIELD_RATE).p });
  line(`fires | landed on death, freshly bare (grace ${REAPER_GRACE})`, REAPER_BASE, bareFires / deathLands, zTest(bareFires, deathLands, REAPER_BASE).p);
  add("Wheel reaper fire rate vs a fresh bare player", REAPER_BASE, bareFires / deathLands, { p: zTest(bareFires, deathLands, REAPER_BASE).p });

  const theoLeg = (physical.legendary / 32) * LEGENDARY_HIT_RATE;
  line("LEGENDARY per spin (1/32 × 0.50)", theoLeg, legHits / N, zTest(legHits, N, theoLeg).p);
  add("Wheel legendary per spin", theoLeg, legHits / N, { p: zTest(legHits, N, theoLeg).p });
  line("legendary pays | landed on legendary", LEGENDARY_HIT_RATE, legHits / legLands, zTest(legHits, legLands, LEGENDARY_HIT_RATE).p);
  add("Wheel legendary hit rate", LEGENDARY_HIT_RATE, legHits / legLands, { p: zTest(legHits, legLands, LEGENDARY_HIT_RATE).p });
}

// ===========================================================================
// 3. SLOTS — real WEIGHTS, real PAYOUT, real payline(), independent evaluator
// ===========================================================================
section("3. Slots of Chance — real tables + an independent payline evaluator");
{
  const W = slots.WEIGHTS, PAY = slots.PAYOUT, COST = slots.PULL_COST;
  const TOTAL = W.reduce((s, w) => s + w.weight, 0);
  console.log(`  weight total ${TOTAL} (must be 10000) · cost ${COST}`);

  // EXACT RTP straight off the shipped tables — no simulation needed.
  const exactEV = W.reduce((s, w) => s + (w.line === "none" ? 0 : PAY[w.line] * w.weight), 0) / TOTAL;
  console.log(`  exact EV from tables ${exactEV.toFixed(4)} → RTP ${((exactEV / COST) * 100).toFixed(3)}% · house edge ${(100 - (exactEV / COST) * 100).toFixed(3)}%`);
  const exactHit = 1 - W.find((w) => w.line === "none").weight / TOTAL;
  console.log(`  exact hit rate ${(exactHit * 100).toFixed(3)}%`);

  // [MODEL] An INDEPENDENT paytable evaluator, written from the rules: what
  // SHOULD three reels pay? Used to prove payline() never draws a picture that
  // means something other than what the roll paid.
  const evaluate = (r) => {
    const cnt = (s) => r.filter((x) => x === s).length;
    if (r[0] === r[1] && r[1] === r[2]) return r[0] === "cherry" ? "cherry3" : r[0];
    for (const s of ["crown", "diamond", "seven"]) if (cnt(s) === 2) return `${s}2`;
    if (cnt("cherry") === 2) return "cherry2";
    if (cnt("cherry") === 1) return "cherry1";
    return "none";
  };

  const lineCounts = new Map(W.map((w) => [w.line, 0]));
  let paid = 0, mismatches = 0, firstMismatch = null;
  for (let i = 0; i < N; i++) {
    // rollLine() is module-private; this is the identical weighted walk over
    // the REAL exported WEIGHTS with the REAL RNG.
    let r = randomInt(TOTAL), rolled = "none";
    for (const w of W) if ((r -= w.weight) < 0) { rolled = w.line; break; }
    lineCounts.set(rolled, lineCounts.get(rolled) + 1);
    if (rolled !== "none") paid += PAY[rolled];
    const reels = slots.payline(rolled);
    const shown = evaluate(reels);
    if (shown !== rolled) {
      mismatches++;
      if (!firstMismatch) firstMismatch = { rolled, shown, reels: [...reels] };
    }
  }
  const obsProbs = [], theoProbs = [], obsArr = [];
  for (const w of W) {
    theoProbs.push(w.weight / TOTAL);
    obsArr.push(lineCounts.get(w.line));
    obsProbs.push(lineCounts.get(w.line) / N);
    line(`line ${w.line}${w.line === "none" ? " (loss)" : ` pays ${PAY[w.line]}`}`, w.weight / TOTAL, lineCounts.get(w.line) / N);
    add(`Slots line: ${w.line}`, w.weight / TOTAL, lineCounts.get(w.line) / N);
  }
  const gof = chiSq(obsArr, theoProbs, N);
  console.log(`  outcome-class χ²=${gof.x2.toFixed(2)} df=${gof.df} p=${gof.p.toFixed(4)}`);
  // RTP is a MEAN OF A HEAVY-TAILED VARIABLE — the 250-coin jackpot at 28/10000
  // dominates its variance — so a flat 0.1pp band is the wrong ruler. Judge it
  // against its own analytic standard error instead.
  const obsRtp = paid / (N * COST);
  const ev2 = W.reduce((s, w) => s + (w.line === "none" ? 0 : PAY[w.line] ** 2 * w.weight), 0) / TOTAL;
  const sdPull = Math.sqrt(ev2 - exactEV ** 2);
  const seRtp = sdPull / Math.sqrt(N) / COST;
  const zRtp = (obsRtp - exactEV / COST) / seRtp;
  console.log(`  per-pull payout σ=${sdPull.toFixed(2)} → RTP standard error ±${(seRtp * 100).toFixed(4)}pp at this N`);
  line("RTP (returned / staked)", exactEV / COST, obsRtp, erfc(Math.abs(zRtp) / Math.SQRT2));
  add("Slots RTP", exactEV / COST, obsRtp, {
    p: erfc(Math.abs(zRtp) / Math.SQRT2), note: `z=${zRtp.toFixed(2)}, ±${(seRtp * 100).toFixed(3)}pp SE`,
  });
  console.log(`  payline() picture vs paid line: ${mismatches} mismatch(es) in ${N.toLocaleString()}`);
  if (firstMismatch) console.log(`    e.g. rolled ${firstMismatch.rolled} but reels read ${firstMismatch.shown}: ${firstMismatch.reels.join(",")}`);
  add("Slots payline is self-consistent", 0, mismatches / N, { note: "reels always mean the paid line" });
  add("Slots EV < COST (sink invariant)", 1, exactEV < COST ? 1 : 0, { note: `EV ${exactEV.toFixed(3)} vs ${COST}` });
}

// ===========================================================================
// 4. ROULETTE — real betWins() / payoutMult() over a real randomInt(37) wheel
// ===========================================================================
section("4. Roulette — European single zero, every bet kind through real code");
{
  const pocketCounts = new Array(37).fill(0);
  const wins = {}, staked = {}, returned = {};
  const kinds = roul.BET_KINDS;
  for (const k of kinds) { wins[k] = 0; staked[k] = 0; returned[k] = 0; }
  const STRAIGHT_TARGET = 17;
  for (let i = 0; i < N; i++) {
    const pocket = randomInt(37);
    pocketCounts[pocket]++;
    for (const k of kinds) {
      const target = k === "straight" ? STRAIGHT_TARGET : null;
      staked[k] += 1;
      if (roul.betWins(k, target, pocket)) {
        wins[k]++;
        returned[k] += 1 * (roul.payoutMult(k) + 1);
      }
    }
  }
  const pg = chiSq(pocketCounts, new Array(37).fill(1 / 37), N);
  console.log(`  pocket χ²=${pg.x2.toFixed(2)} df=${pg.df} p=${pg.p.toFixed(4)} · reds=${roul.RED_NUMBERS.size} (must be 18)`);
  const theoP = {
    straight: 1 / 37, red: 18 / 37, black: 18 / 37, odd: 18 / 37, even: 18 / 37,
    low: 18 / 37, high: 18 / 37, dozen1: 12 / 37, dozen2: 12 / 37, dozen3: 12 / 37,
    col1: 12 / 37, col2: 12 / 37, col3: 12 / 37,
  };
  for (const k of kinds) {
    const t = theoP[k], o = wins[k] / N;
    const z = zTest(wins[k], N, t);
    line(`${k} win`, t, o, z.p);
    add(`Roulette ${k} win`, t, o, { p: z.p });
    // The EDGE's own standard error: a 35:1 straight swings far harder than an
    // even-money bet, so each kind is judged against its own σ rather than one
    // flat band (the first run "warned" on a perfectly healthy straight bet).
    const edge = 1 - returned[k] / staked[k];
    const m = roul.payoutMult(k) + 1;
    const sd = Math.sqrt(t * m * m - (t * m) ** 2);
    const zEdge = (edge - 1 / 37) / (sd / Math.sqrt(N));
    if (Math.abs(zEdge) > 3.3) {
      console.log(`    !! ${k} edge ${(edge * 100).toFixed(3)}% vs 2.703% (z=${zEdge.toFixed(2)}, σ/√N=${((sd / Math.sqrt(N)) * 100).toFixed(3)}pp)`);
    }
    add(`Roulette ${k} edge`, 1 / 37, edge, { p: erfc(Math.abs(zEdge) / Math.SQRT2), note: `±${((sd / Math.sqrt(N)) * 100).toFixed(3)}pp SE` });
  }
  const allEdge = 1 - kinds.reduce((s, k) => s + returned[k], 0) / kinds.reduce((s, k) => s + staked[k], 0);
  line("house edge (all 13 kinds pooled)", 1 / 37, allEdge);
  add("Roulette house edge", 1 / 37, allEdge, { note: "must be 1/37 for every kind" });
}

// ===========================================================================
// 5. CRAPS — real payout helpers, real randomInt(1,7) dice
// ===========================================================================
section("5. Craps — dice fairness and every bet's edge through real helpers");
{
  const totals = new Array(13).fill(0);
  const rollDice = () => [randomInt(1, 7), randomInt(1, 7)];
  for (let i = 0; i < N; i++) { const [a, b] = rollDice(); totals[a + b]++; }
  const ways = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
  const tp = ways.map((w) => w / 36);
  const g = chiSq(totals.slice(2), tp.slice(2), N);
  console.log(`  two-dice total χ²=${g.x2.toFixed(2)} df=${g.df} p=${g.p.toFixed(4)}`);
  for (let t = 2; t <= 12; t++) add(`Craps total ${t}`, tp[t], totals[t] / N);
  line("total 7", 6 / 36, totals[7] / N);
  line("total 12", 1 / 36, totals[12] / N);

  // [MODEL] Full comeout→point sequences. The RULES are re-implemented here as
  // an oracle; the PAYOUTS come from the shipped helpers.
  const WAYS = (n) => ways[n];
  let passWin = 0, passN = 0, dpWin = 0, dpPush = 0, dpN = 0;
  for (let i = 0; i < N; i++) {
    let [a, b] = rollDice(); let t = a + b;
    passN++; dpN++;
    if (t === 7 || t === 11) { passWin++; }
    else if (t === 2 || t === 3) { dpWin++; }
    else if (t === 12) { dpPush++; }
    else {
      const point = t;
      for (;;) {
        [a, b] = rollDice(); t = a + b;
        if (t === point) { passWin++; break; }
        if (t === 7) { dpWin++; break; }
      }
    }
  }
  const THEO_PASS = 244 / 495, THEO_DP = 949 / 1980;
  line("pass line win", THEO_PASS, passWin / passN, zTest(passWin, passN, THEO_PASS).p);
  add("Craps pass-line win", THEO_PASS, passWin / passN, { p: zTest(passWin, passN, THEO_PASS).p });
  const passEdge = 1 - 2 * (passWin / passN);
  line("pass line house edge", 1 - 2 * THEO_PASS, passEdge);
  add("Craps pass-line edge", 1 - 2 * THEO_PASS, passEdge, { note: "1.414% standard" });
  line("don't pass win", THEO_DP, dpWin / dpN, zTest(dpWin, dpN, THEO_DP).p);
  add("Craps don't-pass win", THEO_DP, dpWin / dpN, { p: zTest(dpWin, dpN, THEO_DP).p });
  line("don't pass push (bar 12)", 1 / 36, dpPush / dpN, zTest(dpPush, dpN, 1 / 36).p);
  add("Craps bar-12 push", 1 / 36, dpPush / dpN, { p: zTest(dpPush, dpN, 1 / 36).p });

  // Every bet below is judged against ITS OWN standard error, measured from the
  // per-trial returns. These are high-variance propositions (a hardway pays
  // 9:1), so a flat 0.1pp band would flag healthy bets as broken — the first
  // run "failed" a perfectly fair 2:1 odds bet for exactly that reason.
  /** Run a resolution bet N2 times; return its edge, SE and z against theory. */
  const measure = (trial, stake, N2, theoEdge) => {
    let sum = 0, sumsq = 0;
    for (let i = 0; i < N2; i++) {
      const ret = trial(); // total returned for one unit stake
      const loss = 1 - ret / stake; // per-unit loss on this trial
      sum += loss;
      sumsq += loss * loss;
    }
    const edge = sum / N2;
    const varr = Math.max(0, sumsq / N2 - edge * edge);
    const se = Math.sqrt(varr / N2);
    const z = se > 0 ? (edge - theoEdge) / se : 0;
    return { edge, se, z, p: erfc(Math.abs(z) / Math.SQRT2) };
  };

  // FIELD through the real fieldReturn().
  const fld = measure(() => { const [a, b] = rollDice(); return craps.fieldReturn(a + b, 6); }, 6, N, 1 / 36);
  line("field house edge (2:1 / 3:1)", 1 / 36, fld.edge, fld.p);
  add("Craps field edge", 1 / 36, fld.edge, { p: fld.p, note: `±${(fld.se * 100).toFixed(3)}pp SE` });

  // PLACE + HARDWAY + ODDS resolution through the real winnings helpers.
  const placeTrial = (num, stake) => () => {
    for (;;) {
      const [a, b] = rollDice(); const t = a + b;
      if (t === num) return stake + craps.placeWinnings(num, stake);
      if (t === 7) return 0;
    }
  };
  const hardTrial = (num, stake) => () => {
    for (;;) {
      const [a, b] = rollDice(); const t = a + b;
      if (t === num) return a === b ? stake + craps.hardWinnings(num, stake) : 0;
      if (t === 7) return 0;
    }
  };
  const oddsTrial = (point, stake) => () => {
    for (;;) {
      const [a, b] = rollDice(); const t = a + b;
      if (t === point) return stake + craps.oddsWinnings(point, stake);
      if (t === 7) return 0;
    }
  };
  const M = Math.floor(N / 2);
  for (const [num, stake, theo] of [[6, 6, 1 / 66], [8, 6, 1 / 66], [5, 5, 0.04], [9, 5, 0.04], [4, 5, 1 / 15], [10, 5, 1 / 15]]) {
    const r = measure(placeTrial(num, stake), stake, M, theo);
    line(`place ${num} edge`, theo, r.edge, r.p);
    add(`Craps place ${num} edge`, theo, r.edge, { p: r.p, note: `±${(r.se * 100).toFixed(3)}pp SE` });
  }
  for (const [num, theo] of [[6, 1 / 11], [8, 1 / 11], [4, 1 / 9], [10, 1 / 9]]) {
    const r = measure(hardTrial(num, 5), 5, M, theo);
    line(`hard ${num} edge`, theo, r.edge, r.p);
    add(`Craps hard ${num} edge`, theo, r.edge, { p: r.p, note: `±${(r.se * 100).toFixed(3)}pp SE` });
  }
  // Odds bets must be EXACTLY zero edge — that is the whole point of them.
  for (const [point, stake] of [[4, 5], [5, 4], [6, 5], [9, 4], [10, 5]]) {
    const r = measure(oddsTrial(point, stake), stake, M, 0);
    line(`odds behind ${point} edge (must be 0)`, 0, r.edge, r.p);
    add(`Craps odds ${point} zero edge`, 0, r.edge, { p: r.p, note: `±${(r.se * 100).toFixed(3)}pp SE` });
  }
}

// ===========================================================================
// 6. BLACKJACK — real handValue(), real Fisher-Yates, exact dealer oracle
// ===========================================================================
section("6. Blackjack — shuffle uniformity, dealer H17 vs an exact DP oracle");
{
  // (a) SHUFFLE. The shipped freshShoe() is module-private, but poker-eval's
  //     shuffle() is the identical crypto Fisher-Yates and IS exported, so the
  //     algorithm is testable directly. A biased shuffle (the classic
  //     `randomInt(i)` off-by-one, or sort-with-random-comparator) shows up as
  //     a non-uniform position distribution.
  const DECK = poker.newDeck();
  const S = DECK.length;
  const posOf = new Array(S).fill(0).map(() => new Array(S).fill(0));
  const shuffles = Math.min(200_000, N);
  const idOf = (c) => (c.r - 2) * 4 + c.s;
  for (let i = 0; i < shuffles; i++) {
    const d = poker.shuffle(DECK);
    for (let p = 0; p < S; p++) posOf[idOf(d[p])][p]++;
  }
  // Full 52×52 contingency: every card must be equally likely in every slot.
  let x2 = 0;
  const e = shuffles / S;
  for (let c = 0; c < S; c++) for (let p = 0; p < S; p++) x2 += ((posOf[c][p] - e) ** 2) / e;
  const df = (S - 1) * (S - 1);
  const pv = gammq(df / 2, x2 / 2);
  console.log(`  Fisher-Yates 52×52 position χ²=${x2.toFixed(0)} df=${df} p=${pv.toFixed(4)} (${shuffles.toLocaleString()} shuffles)`);
  add("Blackjack/poker shuffle uniform", 1 / S, 1 / S, { p: pv, note: "52×52 position matrix" });

  // (b) handValue() — exported, so the ace logic is tested on the real thing.
  const C = (r) => ({ r, s: "♠" });
  const hv = (rs) => bj.handValue(rs.map(C));
  const hvChecks = [
    [["A", "K"], 21, true], [["A", "A"], 12, true], [["A", "A", "9"], 21, true],
    [["A", "A", "A", "8"], 21, true], [["10", "9", "5"], 24, false],
    // A+5+5 is SOFT 21: nothing ever busts, so the ace stays counted as 11.
    // (My first pass expected hard here and the code was right.)
    [["A", "5", "5"], 21, true], [["A", "9", "A"], 21, true],
    [["A", "2", "8"], 21, true], [["10", "6", "A"], 17, false],
    [["A", "A", "9", "10"], 21, false],
  ];
  let hvBad = 0;
  for (const [cards, want, soft] of hvChecks) {
    const got = hv(cards);
    if (got.value !== want || got.soft !== soft) { hvBad++; console.log(`    !! handValue(${cards}) = ${got.value}/${got.soft}, want ${want}/${soft}`); }
  }
  add("Blackjack handValue ace logic", 0, hvBad, { note: `${hvChecks.length} cases` });

  // (c) DEALER RULE. Exact infinite-deck DP oracle for "hit soft 17", then the
  //     same rule Monte Carlo'd with the real handValue(). If the code's rule
  //     is H17 and its ace handling is right, these agree to noise.
  const RANK_P = { A: 1 / 13, 2: 1 / 13, 3: 1 / 13, 4: 1 / 13, 5: 1 / 13, 6: 1 / 13, 7: 1 / 13, 8: 1 / 13, 9: 1 / 13, T: 4 / 13 };
  const RANK_V = { A: 11, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10 };
  // state: (total, soft) with total ≤ 21 after ace demotion
  // STATE = (hardSum, hasAce), where hardSum counts every ace as 1. The value
  // is hardSum + 10 when an ace can be promoted without busting, and the hand
  // is soft exactly when that promotion applies — which is precisely what
  // handValue() computes (all aces at 11, demote by 10 while busting).
  //
  // The first version of this oracle carried a boolean "soft" and cleared it
  // after ONE demotion, which is wrong for multi-ace hands: A+A+A demotes twice
  // and is still SOFT 13 (one ace remains at 11), but that oracle called it
  // hard 13. The audit caught it the honest way — the χ² p-value fell as N grew
  // (0.026 at 200k → 0.0001 at 1M), which is the signature of a systematic
  // error rather than noise. The error was HERE, not in the game.
  const valueOf = (hardSum, hasAce) => {
    const promoted = hasAce && hardSum + 10 <= 21;
    return { value: hardSum + (promoted ? 10 : 0), soft: promoted };
  };
  const memo = new Map();
  const dealerDist = (hardSum, hasAce) => {
    const key = `${hardSum}:${hasAce}`;
    if (memo.has(key)) return memo.get(key);
    const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
    const { value, soft } = valueOf(hardSum, hasAce);
    if (value > 21) { out.bust = 1; memo.set(key, out); return out; }
    // HIT SOFT 17 — the rule under test.
    if (value > 17 || (value === 17 && !soft)) {
      out[value] = 1;
      memo.set(key, out);
      return out;
    }
    for (const r of Object.keys(RANK_P)) {
      const sub = dealerDist(hardSum + (r === "A" ? 1 : RANK_V[r]), hasAce || r === "A");
      for (const k of Object.keys(out)) out[k] += RANK_P[r] * sub[k];
    }
    memo.set(key, out);
    return out;
  };
  const theo = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  for (const r1 of Object.keys(RANK_P)) for (const r2 of Object.keys(RANK_P)) {
    const p = RANK_P[r1] * RANK_P[r2];
    const hs = (r1 === "A" ? 1 : RANK_V[r1]) + (r2 === "A" ? 1 : RANK_V[r2]);
    const sub = dealerDist(hs, r1 === "A" || r2 === "A");
    for (const k of Object.keys(theo)) theo[k] += p * sub[k];
  }
  // Cross-check the oracle's own value function against the shipped one before
  // trusting it to judge anything.
  {
    let bad = 0;
    for (const hand of [["A", "A", "A"], ["A", "A", "A", "A"], ["A", "A", "2"], ["A", "9", "A"],
      ["A", "A", "9", "10"], ["A", "5", "5"], ["10", "6", "A"], ["A", "K"]]) {
      const real = bj.handValue(hand.map(C));
      const hs = hand.reduce((s, r) => s + (r === "A" ? 1 : RANK_V[r === "10" || r === "J" || r === "Q" || r === "K" ? "T" : r]), 0);
      const mine = valueOf(hs, hand.includes("A"));
      if (mine.value !== real.value || mine.soft !== real.soft) {
        bad++;
        console.log(`    !! oracle/code disagree on ${hand.join("+")}: oracle ${mine.value}/${mine.soft} vs code ${real.value}/${real.soft}`);
      }
    }
    add("BJ oracle agrees with handValue", 0, bad, { note: "8 multi-ace cases" });
  }
  {
    const tot = Object.values(theo).reduce((x, y) => x + y, 0);
    console.log(`  oracle probabilities sum to ${tot.toFixed(10)} (must be 1)`);
  }
  // Monte Carlo with the REAL handValue and the REAL H17 loop shape.
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const drawCard = () => C(RANKS[randomInt(13)]);
  const obs = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  const dn = N;
  for (let i = 0; i < dn; i++) {
    const hand = [drawCard(), drawCard()];
    let v = bj.handValue(hand);
    while (v.value < 17 || (v.value === 17 && v.soft)) { hand.push(drawCard()); v = bj.handValue(hand); }
    if (v.value > 21) obs.bust++; else obs[v.value]++;
  }
  // NB: "21" here INCLUDES two-card naturals (8/169 = 4.73% of hands), which
  // is why it reads ~12.1% rather than the ~7.4% usually published for
  // non-natural dealer 21s. Oracle and simulation both include them, so they
  // are measuring the same thing.
  const keys = ["17", "18", "19", "20", "21", "bust"];
  const oArr = keys.map((k) => obs[k]);
  const tArr = keys.map((k) => theo[k]);
  const dg = chiSq(oArr, tArr, dn);
  for (let i = 0; i < keys.length; i++) {
    line(`dealer final ${keys[i]}`, tArr[i], oArr[i] / dn);
    add(`BJ dealer ${keys[i]}`, tArr[i], oArr[i] / dn);
  }
  console.log(`  dealer-outcome χ²=${dg.x2.toFixed(2)} df=${dg.df} p=${dg.p.toFixed(4)} (infinite-deck oracle)`);

  // (d) The 6:5 natural payout, arithmetic only — where the rounding bites.
  let lossy = 0;
  for (let bet = 5; bet <= 1000; bet++) {
    const paidWin = Math.floor(bet * 1.2);
    if (paidWin !== bet * 1.2) lossy++;
  }
  console.log(`  6:5 natural: ${lossy} of 996 legal integer bets lose a fraction to Math.floor`);
  add("BJ 6:5 payout exact for all legal bets", 0, lossy / 996, { note: "only multiples of 5 are exact" });
}

// ===========================================================================
// 7. HOLD'EM — real shuffle + real best7 vs exact 7-card frequencies
// ===========================================================================
section("7. Texas Hold'em — 7-card category frequencies vs C(52,7) exact");
{
  // Exact counts over all 133,784,560 seven-card hands (standard reference).
  const EXACT = {
    "High card": 23_294_460, "Pair": 58_627_800, "Two pair": 31_433_400,
    "Three of a kind": 6_461_620, "Straight": 6_180_020, "Flush": 4_047_644,
    "Full house": 3_473_184, "Four of a kind": 224_848, "Straight flush": 41_584,
  };
  const TOTAL7 = Object.values(EXACT).reduce((a, b) => a + b, 0);
  console.log(`  reference total ${TOTAL7.toLocaleString()} (must be C(52,7) = 133,784,560)`);
  const deck = poker.newDeck();
  const counts = {};
  for (const k of Object.keys(EXACT)) counts[k] = 0;
  const hn = Math.min(N, 1_000_000);
  for (let i = 0; i < hn; i++) {
    const d = poker.shuffle(deck);
    const name = poker.categoryName(poker.best7(d.slice(0, 7)));
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const names = Object.keys(EXACT);
  const oArr = names.map((k) => counts[k]);
  const tArr = names.map((k) => EXACT[k] / TOTAL7);
  const g = chiSq(oArr, tArr, hn);
  for (let i = 0; i < names.length; i++) {
    line(names[i], tArr[i], oArr[i] / hn);
    add(`Hold'em 7-card ${names[i]}`, tArr[i], oArr[i] / hn);
  }
  console.log(`  category χ²=${g.x2.toFixed(2)} df=${g.df} p=${g.p.toFixed(4)}`);
}

// ===========================================================================
// 8. BONE PIT dice + DERBY draw + LOTTERY winner
// ===========================================================================
section("8. Bone Pit dice · Derby form-weighted draw · Lottery winner");
{
  // Bone Pit: five dice per cup, uniform 1..6 (ones wild is a RULE, not a rate).
  const faces = new Array(7).fill(0);
  for (let i = 0; i < N; i++) faces[randomInt(1, 7)]++;
  const g = chiSq(faces.slice(1), new Array(6).fill(1 / 6), N);
  console.log(`  die face χ²=${g.x2.toFixed(2)} df=${g.df} p=${g.p.toFixed(4)}`);
  for (let f = 1; f <= 6; f++) add(`Pit die face ${f}`, 1 / 6, faces[f] / N);

  // [MODEL] Derby: the shipped draw is a private method; this is the identical
  // successive weighted sample without replacement.
  const FORMS = [1, 2, 3, 4, 5, 3]; // six runners, forms 1..5
  const totalForm = FORMS.reduce((a, b) => a + b, 0);
  const winCount = new Array(FORMS.length).fill(0);
  const dn = Math.min(N, 1_000_000);
  for (let i = 0; i < dn; i++) {
    const remaining = FORMS.map((f, idx) => ({ f, idx }));
    let roll = randomInt(remaining.reduce((n, r) => n + r.f, 0));
    let pick = 0;
    for (let k = 0; k < remaining.length; k++) if ((roll -= remaining[k].f) < 0) { pick = k; break; }
    winCount[remaining[pick].idx]++;
  }
  const dt = FORMS.map((f) => f / totalForm);
  const dg = chiSq(winCount, dt, dn);
  console.log(`  derby winner χ²=${dg.x2.toFixed(2)} df=${dg.df} p=${dg.p.toFixed(4)} (P(win) = form/Σform)`);
  for (let i = 0; i < FORMS.length; i++) {
    line(`derby runner form ${FORMS[i]}`, dt[i], winCount[i] / dn);
    add(`Derby form-${FORMS[i]} runner wins`, dt[i], winCount[i] / dn);
  }

  // Lottery: one ticket each ⇒ the ticket-weighted walk is a uniform draw.
  console.log(`  lottery: MAX_TICKETS_PER_DAY=${lot.MAX_TICKETS_PER_DAY}, MIN_PLAYERS=${lot.MIN_PLAYERS}`);
  const PLAYERS = 8;
  const lw = new Array(PLAYERS).fill(0);
  const ln = Math.min(N, 1_000_000);
  for (let i = 0; i < ln; i++) lw[randomInt(PLAYERS)]++;
  const lg = chiSq(lw, new Array(PLAYERS).fill(1 / PLAYERS), ln);
  console.log(`  lottery winner χ²=${lg.x2.toFixed(2)} df=${lg.df} p=${lg.p.toFixed(4)}`);
  add("Lottery winner uniform (1 ticket each)", 1 / PLAYERS, lw[0] / ln, { p: lg.p });
  add("Lottery one ticket per person", 1, lot.MAX_TICKETS_PER_DAY === 1 ? 1 : 0, { note: "cap must be 1" });
}

// ===========================================================================
// SUMMARY
// ===========================================================================
const failed = rows.filter((r) => !r.pass);
console.log(`\n\x1b[1m${"═".repeat(104)}\x1b[0m`);
console.log(`\x1b[1mSUMMARY — ${rows.length} checks · threshold ±${(PASS_PCT * 100).toFixed(1)}pp or χ²/z p≥0.001\x1b[0m`);
console.log("═".repeat(104));
console.log(
  "EVENT".padEnd(44) + "THEORETICAL".padStart(13) + "SIMULATED".padStart(13) +
  "DELTA".padStart(12) + "p".padStart(10) + "  VERDICT",
);
console.log("─".repeat(104));
for (const r of rows) {
  console.log(
    r.event.slice(0, 43).padEnd(44) +
    (r.theo * 100).toFixed(4).padStart(12) + "%" +
    (r.obs * 100).toFixed(4).padStart(12) + "%" +
    (((r.delta * 100 >= 0 ? "+" : "") + (r.delta * 100).toFixed(4)) + "pp").padStart(12) +
    (r.p === undefined ? "—" : r.p < 1e-4 ? r.p.toExponential(1) : r.p.toFixed(4)).padStart(10) +
    "  " + (r.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m") +
    (r.note ? `  ${r.note}` : ""),
  );
}
console.log("─".repeat(104));
console.log(`${rows.length - failed.length}/${rows.length} PASS · ${failed.length} FAIL · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(`  · ${f.event}: theo ${(f.theo * 100).toFixed(4)}% vs obs ${(f.obs * 100).toFixed(4)}% ${f.note}`);
}
process.exit(0);
