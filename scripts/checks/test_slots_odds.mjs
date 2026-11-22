
/**
 * Slots of Chance — game-logic and chance verification.
 *
 * Run:  npm run build && node scripts/checks/test_slots_odds.mjs
 *
 * Loads the COMPILED engine in-process (dist/slots.js) and drives the real
 * `pull()` money path against a stub store, so this checks the machine that
 * actually ships — not a re-implementation of it.
 *
 * What it proves:
 *  1. The weight table is exactly 10,000 and its EV/RTP are what the comments
 *     claim (the number the whole economy is tuned against).
 *  2. EVERY payline the machine can build classifies — under an INDEPENDENT
 *     paytable reader written from the rules, not from payline() — as exactly
 *     the line that was rolled. A machine that shows three crowns and pays a
 *     pair is the worst bug this game can have, and the disjointness of the
 *     patterns is what stops it.
 *  3. Empirically, over a large sample: the line frequencies match the weights,
 *     the return matches the EV, coins conserve to the last silver, and the
 *     balance never goes negative.
 *  4. The shape of the experience — hit frequency, net-win frequency, dry
 *     spells, jackpot rarity — is stated in numbers so a retune can be
 *     compared against a real casino floor rather than guessed at.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const slots = require(path.join(root, "dist/slots.js"));
const { WEIGHTS, PAYOUT, PULL_COST, payline, pull, STAKES, stakeOf } = slots;
const { HOUSE_TITHE } = require(path.join(root, "dist/lottery.js"));
const { GRANT_TITHE } = require(path.join(root, "dist/backrooms/grant.js"));

let passed = 0;
const fails = [];
const ok = (cond, what) => {
  if (cond) passed++;
  else fails.push(what);
};
const near = (got, want, tol, what) =>
  ok(Math.abs(got - want) <= tol, `${what}: got ${got}, wanted ${want} ±${tol}`);

// ---------------------------------------------------------------------------
// 1. The table
// ---------------------------------------------------------------------------
const total = WEIGHTS.reduce((s, w) => s + w.weight, 0);
ok(total === 10000, `weights sum to 10000 (got ${total})`);
ok(WEIGHTS.every((w) => Number.isInteger(w.weight) && w.weight > 0), "every weight is a positive integer");
ok(new Set(WEIGHTS.map((w) => w.line)).size === WEIGHTS.length, "no duplicate lines in the table");
for (const w of WEIGHTS) {
  if (w.line === "none") continue;
  ok(PAYOUT[w.line] > 0, `line ${w.line} has a payout`);
}
ok(
  Object.keys(PAYOUT).every((k) => WEIGHTS.some((w) => w.line === k)),
  "every paytable entry is reachable from the weight table",
);

const ev = WEIGHTS.reduce((s, w) => s + w.weight * (w.line === "none" ? 0 : PAYOUT[w.line]), 0) / total;
const rtp = ev / PULL_COST;
near(ev, 8.71, 0.005, "expected payout per pull");
ok(ev < PULL_COST, `EV (${ev}) is below the ${PULL_COST} cost — Slots stays a sink`);
near(rtp * 100, 87.1, 0.05, "RTP %");

const weightOf = (line) => WEIGHTS.find((w) => w.line === line).weight;
const hitRate = (total - weightOf("none")) / total;
near(hitRate * 100, 69.58, 0.01, "hit frequency %");
// A "hit" that pays less than the stake is still a net loss — the split that
// actually describes the player's experience.
let wOver = 0, wPush = 0, wUnder = 0;
for (const w of WEIGHTS) {
  if (w.line === "none") continue;
  const p = PAYOUT[w.line];
  if (p > PULL_COST) wOver += w.weight;
  else if (p === PULL_COST) wPush += w.weight;
  else wUnder += w.weight;
}
ok(wOver + wPush + wUnder + weightOf("none") === total, "the four outcome classes partition the table");

// ---------------------------------------------------------------------------
// 2. Disjointness — an INDEPENDENT reading of the paytable
// ---------------------------------------------------------------------------
/** Classify a payline the way the paytable says to, best line first. Written
 *  from the rules in src/slots.ts's PAYOUT comments, deliberately NOT by
 *  reusing payline()'s own logic — otherwise a bug there would agree with
 *  itself. */
const classify = (r) => {
  const [a, b, c] = r;
  const count = (s) => r.filter((x) => x === s).length;
  if (a === b && b === c) return a === "cherry" ? "cherry3" : a; // every triple pays
  if (count("crown") === 2) return "crown2";
  if (count("diamond") === 2) return "diamond2";
  if (count("seven") === 2) return "seven2";
  if (count("cherry") === 2) return "cherry2";
  if (count("cherry") === 1) return "cherry1";
  return "none";
};
// The classifier must agree with the paytable it claims to read.
ok(classify(["crown", "crown", "crown"]) === "crown", "classifier: triple crown");
ok(classify(["cherry", "cherry", "cherry"]) === "cherry3", "classifier: triple cherry");
ok(classify(["bar", "bell", "lemon"]) === "none", "classifier: a losing line");

const FUZZ = 40000;
const lines = WEIGHTS.map((w) => w.line);
let mismatches = 0;
const seenPattern = new Map(); // line -> a sample, for the report
for (const line of lines) {
  for (let i = 0; i < FUZZ; i++) {
    const reels = payline(line);
    if (reels.length !== 3) { mismatches++; continue; }
    if (classify(reels) !== line) {
      mismatches++;
      if (mismatches < 4) fails.push(`payline("${line}") built ${reels.join("/")} which reads as "${classify(reels)}"`);
    }
    if (!seenPattern.has(line)) seenPattern.set(line, reels.join(" "));
  }
}
ok(mismatches === 0, `${FUZZ} builds x ${lines.length} lines all read back as themselves (${mismatches} bad)`);
// The pair lines must never accidentally show the OTHER pair-payers, or the
// player would see two crowns and be paid for two sevens.
for (const [pairLine, sym] of [["crown2", "crown"], ["diamond2", "diamond"], ["seven2", "seven"]]) {
  let bad = 0;
  for (let i = 0; i < 4000; i++) {
    const r = payline(pairLine);
    if (r.filter((x) => x === sym).length !== 2) bad++;
    for (const other of ["crown", "diamond", "seven"]) {
      if (other !== sym && r.filter((x) => x === other).length >= 2) bad++;
    }
  }
  ok(bad === 0, `${pairLine} always shows exactly its own pair and no rival pair (${bad} bad)`);
}
// A losing line must contain no cherry at all (any cherry pays).
let cherryOnLoss = 0;
for (let i = 0; i < 20000; i++) if (payline("none").includes("cherry")) cherryOnLoss++;
ok(cherryOnLoss === 0, `no losing line ever shows a cherry (${cherryOnLoss} did)`);

// ---------------------------------------------------------------------------
// 3. The real money path, over a large sample
// ---------------------------------------------------------------------------
const START = 50_000_000;
let coins = START;
let boosted = 0;
let granted = 0;
const store = {
  transaction: (fn) => fn(),
  spendCoins: (_id, n) => (coins >= n ? (coins -= n) : null),
  addCoins: (_id, n) => (coins += n),
  getCoins: () => coins,
  bumpStat: () => {},
  maxStat: () => {},
  streakStat: () => 0, // the goblins' dry-spell counter (Sep 2026) — not what this harness measures
  lotteryBoost: (_day, n) => (boosted += n),
  // WHERE THE HOUSE'S WINNINGS GO (Sep 2026): one place divides the take —
  // HOUSE_TITHE to the nightly pot, GRANT_TITHE to Async's field programme,
  // the rest burns. Both shares are redistributions, so neither changes the
  // machine's EV or this harness's arithmetic; the stub just has to account
  // for them, and it tracks them separately so a future retune that made the
  // slots pay the grant out of the PLAYER's stake would show up here.
  // No season purses in this harness (test_season_ledger covers those).
  isPurse() { return false; },
  houseEdgeTake(_day, net) {
    if (net <= 0) return;
    boosted += Math.floor(net * HOUSE_TITHE);
    granted += Math.floor(net * GRANT_TITHE);
  },
  // E3b: the pull's payment order asks about the escape room's balances.
  // This stub holds NONE — every pull below pays plain silver, which keeps
  // the odds math identical to the pre-E3b machine (a free/chips pull rolls
  // the same table; only the payer differs).
  erConsumeFreePull: () => false,
  getFreePulls: () => 0,
  getChips: () => 0,
  spendCoinsChipsFirst(_id, n) {
    return coins >= n ? { chips: 0, silver: n, coins: (coins -= n) } : null;
  },
};
const user = { id: 1 };

const N = 300_000;
const seen = new Map();
let paidOut = 0;
let negative = 0;
let badReels = 0;
let dry = 0, longestDry = 0; // pulls since the last NET-positive result
let biggest = 0;
for (let i = 0; i < N; i++) {
  const out = pull(store, user);
  if (!out.ok) { fails.push("a funded pull was refused"); break; }
  const line = out.result.type === "win" ? out.result.line : "none";
  seen.set(line, (seen.get(line) ?? 0) + 1);
  if (classify(out.reels) !== line) badReels++;
  const pay = out.result.type === "win" ? out.result.payout : 0;
  paidOut += pay;
  if (pay > biggest) biggest = pay;
  if (coins < 0) negative++;
  if (pay > PULL_COST) { longestDry = Math.max(longestDry, dry); dry = 0; } else dry++;
}
longestDry = Math.max(longestDry, dry);

ok(badReels === 0, `every one of ${N} live pulls returned reels matching its own line (${badReels} bad)`);
ok(negative === 0, "the balance never went negative");
ok(coins === START - N * PULL_COST + paidOut, "coins conserve exactly: start - stakes + payouts");
ok(coins < START, `the house is up over ${N.toLocaleString()} pulls (player ${coins - START})`);
ok(boosted > 0, "the house tithe seeded the lottery pot");

// Empirical frequencies land on the weights (4-sigma-ish tolerances).
for (const w of WEIGHTS) {
  const p = w.weight / total;
  const expect = N * p;
  const sd = Math.sqrt(N * p * (1 - p));
  const got = seen.get(w.line) ?? 0;
  ok(Math.abs(got - expect) < 4.5 * sd + 1, `line "${w.line}" frequency ~ its weight (got ${got}, expected ${Math.round(expect)})`);
}
const empiricalRtp = paidOut / (N * PULL_COST);
near(empiricalRtp * 100, rtp * 100, 2.5, "empirical RTP % over the sample");

// ---------------------------------------------------------------------------
// 4. The shape of the experience — reported, and bounded where it matters
// ---------------------------------------------------------------------------
const pJack = weightOf("crown") / total;
const pctNetWin = (wOver / total) * 100;
// Sanity bounds a real machine also satisfies: it must be possible to lose,
// possible to win big, and the jackpot must be genuinely rare but reachable.
ok(pJack > 0 && pJack < 0.01, `the jackpot is rare but reachable (1 in ${Math.round(1 / pJack)})`);
ok(PAYOUT.crown / PULL_COST >= 20, `top prize is at least 20x the stake (${PAYOUT.crown / PULL_COST}x)`);
ok(PAYOUT.cherry3 === PULL_COST, "the smallest triple returns exactly the stake");
ok(longestDry < 400, `a dry spell stayed sane over ${N.toLocaleString()} pulls (longest ${longestDry} pulls with no net win)`);
ok(biggest === PAYOUT.crown, `the top prize was actually hit in the sample (${biggest})`);

console.log("");
console.log("SLOTS OF CHANCE — the machine, in numbers");
console.log("  cost per pull            ", PULL_COST, "silver");
console.log("  expected return          ", ev.toFixed(4), `silver  (RTP ${(rtp * 100).toFixed(2)}%, house edge ${(100 - rtp * 100).toFixed(2)}%)`);
console.log("  empirical RTP            ", (empiricalRtp * 100).toFixed(2) + "%", `over ${N.toLocaleString()} live pulls`);
console.log("  hit frequency            ", (hitRate * 100).toFixed(2) + "%   (any payout at all)");
console.log("    of which net WIN       ", pctNetWin.toFixed(2) + "%   (pays more than the stake)");
console.log("    of which push          ", ((wPush / total) * 100).toFixed(2) + "%   (pays exactly the stake)");
console.log("    of which under-stake   ", ((wUnder / total) * 100).toFixed(2) + "%   (a 'win' that is still a loss)");
console.log("  nothing at all           ", ((weightOf("none") / total) * 100).toFixed(2) + "%");
console.log("  jackpot (triple crown)   ", `1 in ${Math.round(1 / pJack)} pulls, pays ${PAYOUT.crown} (${PAYOUT.crown / PULL_COST}x)`);
console.log("  longest run with no net win:", longestDry, "pulls");
console.log("  sample paylines:");
for (const w of WEIGHTS) {
  const pay = w.line === "none" ? 0 : PAYOUT[w.line];
  console.log(
    "   ",
    w.line.padEnd(9),
    String(pay).padStart(4),
    ((w.weight / total) * 100).toFixed(2).padStart(6) + "%",
    " ",
    seenPattern.get(w.line) ?? "",
  );
}
console.log("");

// ---------------------------------------------------------------------------
// 5. THE STAKES (Oct 2026) — the Boulevard's sections play at 10/20/50/100.
// A stake is a whole multiple of the base pull and every payout scales by it,
// so the machine is the SAME machine in bigger coins: identical edge, every
// payout a whole number, and a free pull (worth one base pull) never plays a
// bigger machine.
// ---------------------------------------------------------------------------
ok(STAKES[0] === PULL_COST, "the lowest stake is the base pull");
ok(STAKES.every((k) => k % PULL_COST === 0), "every stake is a whole multiple of the base pull");
ok(stakeOf(25) === null && stakeOf("abc") === null && stakeOf(0) === null && stakeOf(null) === null && stakeOf(-10) === null,
  "stakeOf refuses anything that isn't a listed stake (25, junk, 0, null, negative)");
ok(STAKES.every((k) => stakeOf(k) === k), "stakeOf accepts every listed stake");
for (const k of STAKES) {
  const mult = k / PULL_COST;
  const evK = WEIGHTS.reduce((a, w) => a + (w.line === "none" ? 0 : PAYOUT[w.line] * mult) * w.weight, 0) / total;
  near((evK / k) * 100, rtp * 100, 1e-9, `RTP at stake ${k} equals the base machine's`);
  // the live path at this stake
  const before = coins, boostBefore = boosted;
  let paid = 0, wrong = 0, freeAsked = 0;
  const M = 20_000;
  const st = { ...store, erConsumeFreePull: () => { freeAsked++; return false; } };
  for (let i = 0; i < M; i++) {
    const out = pull(st, user, k);
    if (!out.ok) { fails.push(`a funded pull at stake ${k} was refused`); break; }
    if (out.stake !== k) wrong++;
    if (out.result.type === "win") {
      if (out.result.payout !== PAYOUT[out.result.line] * mult || !Number.isInteger(out.result.payout)) wrong++;
      paid += out.result.payout;
    }
  }
  ok(wrong === 0, `stake ${k}: every payout is the base payout x${mult}, whole, and the outcome names its stake`);
  ok(coins === before - M * k + paid, `stake ${k}: coins conserve exactly (start - ${M} x ${k} + payouts)`);
  ok(boosted > boostBefore, `stake ${k}: the house tithe still reaches the pot`);
  ok(k === PULL_COST ? freeAsked === M : freeAsked === 0,
    k === PULL_COST ? "stake 10: a free pull is offered first, as before" : `stake ${k}: a free pull is never spent on it`);
}
// a free pull really is consumed at the base stake, and never above it
{
  let free = 3, spent = 0;
  const st = { ...store, erConsumeFreePull: () => (free > 0 ? (free--, true) : false),
    spendCoinsChipsFirst: (_id, n) => { spent += n; return { chips: 0, silver: n, coins }; } };
  const a = pull(st, user, 100);
  ok(a.ok && a.paidWith === "coins" && free === 3 && spent === 100, "a 100 pull with free pulls banked pays silver and keeps the free pulls");
  const b = pull(st, user, 10);
  ok(b.ok && b.paidWith === "free" && free === 2 && spent === 100, "a 10 pull spends a free pull and no silver");
}
// broke at the bigger stake: refused, nothing taken
{
  const st = { ...store, spendCoinsChipsFirst: (_id, n) => (n <= 40 ? { chips: 0, silver: n, coins: 0 } : null) };
  const out = pull(st, user, 50);
  ok(!out.ok, "a player with 40 silver is refused at a 50 machine");
}

if (fails.length) {
  console.log("FAILURES:");
  for (const f of fails) console.log("  x", f);
  console.log(`\n${passed} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`${passed}/${passed} slots odds asserts passed`);
