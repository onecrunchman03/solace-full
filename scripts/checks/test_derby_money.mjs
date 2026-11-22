// THE DERBY'S MONEY — Derby v2 (Oct 2026).
//
// Run:  npm run build && node scripts/checks/test_derby_money.mjs
//
// Nothing drove the Derby's money path before v2 (the review found the harness
// CLAUDE.md cited had never existed). In-process over a real Store and the
// real engine on dialled-down clocks:
//   · every refusal happens before the wallet is touched
//   · the podium pays 70/20/10, renormalised over the places that were backed
//   · EXACT conservation: what the bettors put in = what came back + the rake
//     and dust that went to tonight's lottery pot — nothing minted, nothing lost
//   · v2's rule: nobody on the podium → refunded LESS THE RAKE, so a lone
//     bettor gets 95% whether their runner wins or loses (it used to pay 100%
//     for losing and 95% for winning)
//   · a cancel gives the whole stake back AND takes it off the gambled board,
//     and a lone cancel doesn't re-roll everybody's form
//   · career wins land after the race, not at the gun (the racer card gave
//     the winner away mid-race)
//   · the state carries the shared race clock, and results survive a restart
//   · a crash's open tickets are refunded in full at boot
process.env.DERBY_BET_MS = "60";
process.env.DERBY_RACE_MS = "120";
process.env.DERBY_SETTLE_MS = "60";

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (p) => pathToFileURL(path.join(ROOT, "dist", p)).href;
const { Store } = await import(dist("db/store.js"));
const { Bus } = await import(dist("bus.js"));
const { createDerby } = await import(dist("derby.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(path.join(tmpdir(), "derby-money-"));
const store = new Store(path.join(tmp, "d.db"));
const bus = new Bus();
const users = ["ann", "bob", "cat", "dan"].map((u) => store.createUser({ username: u, displayName: u.toUpperCase(), passwordHash: "x" }));
const [ann, bob, cat, dan] = users;
for (const u of users) store.addCoins(u.id, 10_000);
const coins = (u) => store.getCoins(u.id);
const pot = () => store.prep("SELECT COALESCE(SUM(amount), 0) AS s FROM lottery_boosts").get().s;
const gambled = (u) => store.prep("SELECT COALESCE(SUM(value), 0) AS v FROM user_stats WHERE userId = ? AND key = 'gambled'").get(u.id).v;
const wallets = () => users.reduce((s, u) => s + coins(u), 0);

let derby = createDerby(store, bus);
/** Run one race to the end: the window closes on its own, then the race and the settle. */
async function runToEnd() {
  for (let i = 0; i < 100 && derby.state().phase !== "idle"; i++) await sleep(20);
}
async function untilPhase(p) {
  for (let i = 0; i < 100 && derby.state().phase !== p; i++) await sleep(5);
}

console.log("REFUSALS BEFORE THE WALLET");
const before = coins(ann);
const key0 = derby.state().racers[0].key;
ok("error" in derby.placeBet(ann.id, "unicorn", 50), "an unknown runner is refused");
ok("error" in derby.placeBet(ann.id, key0, 2), "under the minimum is refused");
ok("error" in derby.placeBet(ann.id, key0, 501), "over the 500 cap is refused");
ok("error" in derby.placeBet(ann.id, key0, 10.5), "a fractional stake is refused");
const broke = store.createUser({ username: "broke", displayName: "Broke", passwordHash: "x" });
ok("error" in derby.placeBet(broke.id, key0, 50) && store.getCoins(broke.id) === 0, "no silver, no ticket");
ok(coins(ann) === before, "every refusal left the wallet alone");

console.log("THE PODIUM PAYS, AND NOTHING IS MINTED");
// Ann, Bob and Cat each back a different runner; Dan backs the same as Ann.
const ks = derby.state().racers.map((r) => r.key);
const total0 = wallets() + pot();
derby.placeBet(ann.id, ks[0], 400);
derby.placeBet(bob.id, ks[1], 300);
derby.placeBet(cat.id, ks[2], 200);
derby.placeBet(dan.id, ks[0], 100);
ok("error" in derby.placeBet(ann.id, ks[3], 50), "one ticket per race");
await untilPhase("racing");
const racing = derby.state();
ok(racing.startedAt !== null && racing.raceMs === 120 && Math.abs(racing.serverNow - Date.now()) < 1000, "the race carries the shared clock: the gun, its length, the server's time");
const careerAtGun = racing.careerWins[racing.placings[0]] ?? 0;
ok(racing.placings.length === 6 && new Set(racing.placings).size === 6, "a full finish order is drawn at the gun");
// pool 1,000; rake 50; distributable 950
const place = (k) => racing.placings.indexOf(k) + 1;
const SH = [0.7, 0.2, 0.1];
const backedPlaces = [...new Set([ks[0], ks[1], ks[2]].map(place).filter((p) => p <= 3))];
const W = backedPlaces.reduce((s, p) => s + SH[p - 1], 0);
const expect = (k, stake, tierStake) => {
  const p = place(k);
  if (p > 3) return 0;
  return Math.floor((Math.floor((950 * SH[p - 1]) / W) * stake) / tierStake);
};
const want = {
  [ann.id]: expect(ks[0], 400, 500), [dan.id]: expect(ks[0], 100, 500),
  [bob.id]: expect(ks[1], 300, 300), [cat.id]: expect(ks[2], 200, 200),
};
const paid = Object.fromEntries(racing.winners.map((w) => [w.userId, w.payout]));
if (backedPlaces.length) {
  ok(users.every((u) => (paid[u.id] ?? 0) === want[u.id]), `each ticket paid its place's share by stake (${users.map((u) => `${u.username} ${paid[u.id] ?? 0}`).join(", ")})`);
} else {
  ok(racing.refunded && racing.winners.length === 0, "(no backed runner placed — a refund race)");
}
ok(wallets() + pot() === total0, "exact conservation: wallets + tonight's pot unchanged to the coin");
ok(pot() >= 50, "the rake (and any dust) went to the lottery pot");
await untilPhase("settled");
ok((derby.state().careerWins[racing.placings[0]] ?? 0) === careerAtGun + 1 && careerAtGun === (racing.careerWins[racing.placings[0]] ?? 0), "career wins tick over AFTER the race, never at the gun");
await runToEnd();

console.log("NOBODY ON THE PODIUM: REFUNDED, LESS THE RAKE");
// Back the two runners the draw is LEAST likely to place, until a race puts
// neither on the podium (form-weighted, so it comes quickly).
let tries = 0, refundRace = null;
while (!refundRace && tries++ < 40) {
  const field = [...derby.state().racers].sort((a, b) => a.form - b.form);
  const t = wallets() + pot();
  const a0 = coins(ann), b0 = coins(bob);
  derby.placeBet(ann.id, field[0].key, 200);
  derby.placeBet(bob.id, field[1].key, 100);
  await untilPhase("racing");
  const s = derby.state();
  if (s.refunded) refundRace = { s, a0, b0, t };
  await runToEnd();
}
ok(!!refundRace, `a race with nobody on the podium came up (${tries} tries)`);
if (refundRace) {
  const { s, a0, b0, t } = refundRace;
  ok(s.winners.length === 0, "nobody is paid as a winner");
  ok(a0 - coins(ann) === 10 && b0 - coins(bob) === 5, "each ticket came back less 5% (Ann 200 → 190, Bob 100 → 95)");
  ok(wallets() + pot() === t, "and the rake went to the pot: conserved to the coin");
}

console.log("A LONE BETTOR: 95% WIN OR LOSE");
let solo = { win: null, lose: null }; tries = 0;
while ((!solo.win || !solo.lose) && tries++ < 80) {
  const k = derby.state().racers[tries % 6].key;
  const c0 = coins(cat);
  derby.placeBet(cat.id, k, 100);
  await untilPhase("racing");
  const s = derby.state();
  await runToEnd();
  const back = coins(cat) - c0 + 100;
  if (s.placings.indexOf(k) < 3) solo.win ??= back;
  else solo.lose ??= back;
}
ok(solo.win === 95 && solo.lose === 95, `a lone ticket gets 95 back on 100 whether it places or not (placed ${solo.win}, didn't ${solo.lose}) — losing never pays better`);

console.log("CANCELLING");
const g0 = gambled(dan);
const c0 = coins(dan);
const form0 = JSON.stringify(derby.state().racers.map((r) => r.form));
const round0 = derby.state().round;
derby.placeBet(dan.id, derby.state().racers[2].key, 250);
const r = derby.cancelBet(dan.id);
ok(!("error" in r) && r.refunded === 250 && coins(dan) === c0, "a cancel gives the whole stake back");
ok(gambled(dan) === g0, "and takes it back off the gambled board");
ok(JSON.stringify(derby.state().racers.map((x) => x.form)) === form0 && derby.state().round === round0 + 1, "a lone cancel ends the window without re-rolling everybody's form");

console.log("RESULTS SURVIVE A RESTART");
const results = derby.state().results;
derby = createDerby(store, bus);
ok(results.length >= 3 && JSON.stringify(derby.state().results) === JSON.stringify(results), `the finish orders come back after a restart (${results.length} races)`);
ok(derby.state().history[0]?.key === results[0].placings[0], "and the winners strip reads from them");

console.log("A CRASH MID-WINDOW REFUNDS IN FULL");
const a1 = coins(ann);
derby.placeBet(ann.id, derby.state().racers[0].key, 300);
derby = createDerby(store, bus); // boot with the ticket still in escrow
ok(coins(ann) === a1, "the boot refund returns the whole stake");

try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows keeps the open DB; the temp dir is the OS's */ }
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
