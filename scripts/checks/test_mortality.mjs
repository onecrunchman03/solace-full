// THE WAKE AND THE INHERITANCE — the money path of coming back from the dead.
//
//   node scripts/checks/test_mortality.mjs
//
// Death now has three possible endings instead of one, and two of them move
// silver and emoji around, so this harness spends most of its asserts on the
// arithmetic rather than the drama:
//
//   RAISED   — somebody else burns 10,000 silver or a mythic to stand you up.
//   BOUGHT   — you burn your whole purse and a third of your collection.
//   SEALED   — nobody came: the life becomes a monument, your will executes on
//              what the next generation isn't carrying, and the same account
//              walks out one generation older.
//
// The invariants worth breaking a deploy over:
//   * A REVIVAL NEVER MINTS. Every price is burned; the person coming back
//     receives nothing from it. The Wheel stays the only faucet.
//   * A REFUSED REVIVAL IS FREE. Charge-then-check would let a broke player
//     drain themselves against a sealed grave.
//   * A GRAVE IS RAISED ONCE. Two payers racing must not both pay.
//   * KILLUSER NO LONGER MOVES THE ESTATE. It used to hand the will
//     beneficiary everything on the spot, which cannot coexist with a revival
//     window — you'd stand up stripped, with your estate already spent.
//   * GRAVES DUG BEFORE MIGRATION 68 STAY SEALED. Their estates were already
//     executed under the old rules; reopening them on deploy would hand the
//     same estate out twice.
//
// Driven in process against a real Store, because the claims are all about
// what is actually in the database afterwards.


import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const {
  GRAVE_FRESH_MS, RAISE_PRICE, HEIRLOOM_COUNT, HEIRLOOM_FLOOR, heirloomCount,
  heirlooms, inheritedCoins, selfBurnCount, graveIsFresh, selfRevivePrice,
  canSelfRevive, SELF_REVIVE_MIN_COINS,
} = require(path.join(ROOT, "dist", "mortality.js"));
const { userForToken, wakeUserForToken } = require(path.join(ROOT, "dist", "auth.js"));

const DB = path.join(ROOT, "data", "mortality-harness.db");
const wipe = () => { for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} } };
wipe();

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);

/** A second connection, used only to do to the clock what 48 real hours would.
 *  Deliberately NOT a test hook on the Store: production code should not carry
 *  a method whose only purpose is to make a grave look older than it is. */
const clock = new DatabaseSync(DB);
const expireGrave = (id) =>
  clock.prepare("UPDATE users SET graveSealsAt = ? WHERE id = ?").run(Date.now() - 1, id);
/** What a grave dug before migration 68 looks like: tombstoned, no deadline. */
const preMigrationGrave = (id) =>
  clock.prepare("UPDATE users SET graveSealsAt = NULL WHERE id = ?").run(id);

// ---- a catalogue to die holding ------------------------------------------
const TIERS = { common: 6, rare: 4, legendary: 3, mythic: 2 };
const catalogue = [];
for (const [tier, count] of Object.entries(TIERS)) {
  for (let i = 0; i < count; i++) catalogue.push({ code: `${tier}${i}`, tier });
}
catalogue.push({ code: "talisman", tier: "talisman" });
store.seedEmoji(catalogue.map((e) => ({ ...e, name: e.code, file: `${e.code}.png` })));

let seq = 0;
const person = (coins = 0, codes = []) => {
  const u = store.createUser({
    username: `mort${++seq}`, displayName: `Mort ${seq}`, passwordHash: "x",
  });
  if (coins) store.addCoins(u.id, coins);
  for (const c of codes) store.addEmoji(u.id, c);
  return store.getUserById(u.id);
};
const coinsOf = (id) => store.getCoins(id);
const invOf = (id) => store.getInventory(id).map((e) => e.code).sort();
/** Total silver in every wallet on the server — the conservation yardstick.
 *  Nothing here escrows, so wallets are the whole supply. */
const supply = () =>
  store.listAllUsers().reduce((s, u) => s + store.getCoins(u.id), 0);
/** Every emoji held by anybody, as a multiset count. */
const emojiOut = () =>
  store.listAllUsers().reduce((s, u) => s + store.inventoryCount(u.id), 0);

// ---- 1. the arithmetic, before any database is involved -------------------
{
  const owned = [
    { code: "b", tier: "common" }, { code: "a", tier: "common" },
    { code: "z", tier: "mythic" }, { code: "m", tier: "legendary" },
    { code: "r", tier: "rare" }, { code: "t", tier: "talisman" },
  ];
  const h = heirlooms(owned);
  ok(h.length === HEIRLOOM_COUNT, `five heirlooms come out of a grave (${h.length})`);
  ok(h[0] === "z", "the rarest first: a mythic outranks everything");
  ok(h[1] === "t", "then the talisman (weight 15) above a legendary (10)");
  ok(h[2] === "m" && h[3] === "r", "then legendary, then rare");
  ok(h[4] === "a", "the last slot goes to the alphabetically-first common — ties break on CODE");
  ok(
    JSON.stringify(heirlooms(owned)) === JSON.stringify(heirlooms([...owned].reverse())),
    "the same collection always yields the same heirlooms, whatever order it arrives in",
  );
  ok(heirlooms([]).length === 0, "an empty collection inherits nothing rather than throwing");
  ok(heirlooms(owned, 0).length === 0, "a zero count is honoured");

  // THE HEIRLOOMS ARE A SHARE NOW (Sep 2026). Five out of a finished
  // catalogue was an erasure rather than a setback, and it was what made the
  // endgame unreachable: a simulated Tier-4 run took a median 171,000 spins
  // and 349 deaths, and half of all runs never finished at all.
  ok(heirloomCount(0) === HEIRLOOM_FLOOR, "a grave with nothing in it still quotes the floor");
  ok(heirloomCount(20) === HEIRLOOM_FLOOR, "…and so does a small collection — nothing got worse for a newcomer");
  ok(heirloomCount(50) === HEIRLOOM_FLOOR, "…the floor holds right up to where the share overtakes it");
  ok(heirloomCount(1_143) === 114, `a finished collection keeps ${heirloomCount(1_143)} — a tenth, not five`);
  ok(heirloomCount(1_143) > 72, "…which is more slots than there are legendaries in the whole catalogue");
  {
    // …and RAREST FIRST, so the slow end of the collection is what survives.
    // That is the load-bearing half: legendaries gate Tier 4 and are the
    // hardest thing on the wheel to win, so they must accumulate across
    // lives instead of resetting to nothing.
    const big = [];
    for (let i = 0; i < 400; i++) big.push({ code: `cc${String(i).padStart(3, "0")}`, tier: "common" });
    for (let i = 0; i < 90; i++) big.push({ code: `rr${String(i).padStart(3, "0")}`, tier: "rare" });
    for (let i = 0; i < 30; i++) big.push({ code: `ll${String(i).padStart(3, "0")}`, tier: "legendary" });
    const kept = heirlooms(big);
    ok(kept.length === heirloomCount(big.length) && kept.length === 52, `520 emoji keep ${kept.length}`);
    ok(kept.filter((c) => c.startsWith("ll")).length === 30, "…EVERY legendary survives the grave");
    ok(kept.filter((c) => c.startsWith("rr")).length === 22, "…the rest of the slots go to rares");
    ok(kept.filter((c) => c.startsWith("cc")).length === 0, "…and no common takes a slot from something rarer");
  }

  ok(inheritedCoins(1000) === 250, "a quarter of the purse survives");
  ok(inheritedCoins(3) === 0, "…floored, so rounding can never invent a coin");
  ok(inheritedCoins(0) === 0 && inheritedCoins(-5) === 0, "no negative inheritance");

  ok(selfBurnCount(9) === 3, "a self-revival burns a third of the collection");
  ok(selfBurnCount(10) === 3, "…floored");
  ok(selfBurnCount(1) === 0, "somebody holding one emoji doesn't have to burn it to stand up");
  ok(selfBurnCount(0) === 0, "and an empty collection burns nothing");

  const now = Date.now();
  ok(graveIsFresh(now + 1000, now), "a grave with time left is fresh");
  ok(!graveIsFresh(now - 1, now), "a grave past its deadline is not");
  ok(!graveIsFresh(null, now), "a NULL deadline reads as sealed — that is the pre-68 grave");
  ok(selfRevivePrice(500, 9).burn === 3 && selfRevivePrice(500, 9).coins === 500,
    "the wake quote is the whole purse plus a third of the shelf");
}

// ---- 2. death digs the grave and NOTHING ELSE -----------------------------
{
  const heir = person(0, []);
  const dead = person(4_000, ["mythic0", "rare0", "common0"]);
  store.setLegacy(dead.id, { willBeneficiaryId: heir.id, epitaph: "went for one more spin" });

  const before = { supply: supply(), emoji: emojiOut() };
  store.killUser(dead.id);
  const d = store.getUserById(dead.id);

  ok(d.disabled && d.diedAt, "the wheel tombstones them exactly as it always did");
  ok(d.graveSealsAt > Date.now() + GRAVE_FRESH_MS - 5_000, "and the grave is fresh for 48 hours");
  ok(coinsOf(dead.id) === 4_000, "THE PURSE STAYS WITH THE DEAD — the will has not executed");
  ok(coinsOf(heir.id) === 0, "…and the heir has been given nothing yet");
  ok(invOf(dead.id).length === 3, "the collection stays with them too");
  ok(supply() === before.supply && emojiOut() === before.emoji,
    "dying moves no value at all: same silver, same emoji");
  ok(store.dueGraves().length === 0, "a fresh grave is not due for sealing");
  ok(store.graveFresh(dead.id), "…and reads as fresh");
}

// ---- 3. RAISED BY A FRIEND: the price burns, the dead gain nothing --------
{
  const dead = person(700, ["common1"]);
  store.killUser(dead.id);
  const payer = person(RAISE_PRICE + 55, []);
  const before = { supply: supply(), deadCoins: coinsOf(dead.id) };

  const r = store.raiseFromGrave(dead.id, payer.id, "silver");
  ok(r.ok === true, "a friend with the price can raise the dead");
  const alive = store.getUserById(dead.id);
  ok(!alive.disabled && alive.diedAt === null && alive.graveSealsAt === null, "they are alive again");
  ok(alive.generation === 1, "raised, not reborn — still the same life, same generation");
  ok(coinsOf(payer.id) === 55, `the payer is down exactly ${RAISE_PRICE}`);
  ok(coinsOf(dead.id) === before.deadCoins, "THE RAISED PERSON RECEIVES NOTHING — this is a sink, not a gift");
  ok(supply() === before.supply - RAISE_PRICE, "the price is BURNED: total silver falls by exactly the fee");
  ok(invOf(dead.id).join() === "common1", "their collection is untouched by the rescue");
}

// ---- 4. every refusal is free ---------------------------------------------
{
  const dead = person(0, []);
  store.killUser(dead.id);
  const broke = person(RAISE_PRICE - 1, []);
  const before = supply();

  const r = store.raiseFromGrave(dead.id, broke.id, "silver");
  ok(r.error === "insufficient", "somebody who can't afford it is refused");
  ok(coinsOf(broke.id) === RAISE_PRICE - 1, "…and is NOT charged a penny for the attempt");
  ok(supply() === before, "…and nothing is burned");
  ok(store.getUserById(dead.id).disabled, "…and the grave is still a grave");

  const rich = person(RAISE_PRICE * 3, []);
  const alive = person(50, []);
  // Re-baseline: funding those two just added silver to the world, so the
  // earlier mark is no longer the yardstick.
  const beforeRefusals = supply();
  ok(store.raiseFromGrave(dead.id, dead.id, "silver").error === "raise_yourself",
    "you cannot raise yourself here — that door costs very much more");
  ok(store.raiseFromGrave(alive.id, rich.id, "silver").error === "not_dead",
    "you cannot raise the living");
  ok(coinsOf(rich.id) === RAISE_PRICE * 3, "…and neither refusal touched the wallet");

  // A mythic that isn't a mythic, and one they don't own.
  ok(store.raiseFromGrave(dead.id, rich.id, "mythic", "common2").error === "not_mythic",
    "only a mythic buys a life");
  ok(store.raiseFromGrave(dead.id, rich.id, "mythic", "mythic1").error === "not_owned",
    "…and it has to be yours");
  ok(store.raiseFromGrave(dead.id, rich.id, "mythic").error === "no_mythic",
    "…and you have to name it");
  ok(coinsOf(rich.id) === RAISE_PRICE * 3 && supply() === beforeRefusals,
    "none of that cost anything — six refusals, not one coin burned");
}

// ---- 5. a mythic is BURNED, not handed over -------------------------------
{
  const dead = person(0, []);
  store.killUser(dead.id);
  const payer = person(0, ["mythic1", "common3"]);
  const before = emojiOut();

  const r = store.raiseFromGrave(dead.id, payer.id, "mythic", "mythic1");
  ok(r.ok === true, "a sacrificed mythic raises the dead");
  ok(!store.ownsEmoji(payer.id, "mythic1"), "the payer no longer has it");
  ok(!store.ownsEmoji(dead.id, "mythic1"), "AND NEITHER DOES THE PERSON THEY SAVED — it burned");
  ok(emojiOut() === before - 1, "exactly one emoji left the world");
  ok(!store.getUserById(dead.id).disabled, "and they're up");
}

// ---- 6. a grave is raised ONCE ---------------------------------------------
{
  const dead = person(0, []);
  store.killUser(dead.id);
  const a = person(RAISE_PRICE, []);
  const b = person(RAISE_PRICE, []);
  const before = supply();

  const first = store.raiseFromGrave(dead.id, a.id, "silver");
  const second = store.raiseFromGrave(dead.id, b.id, "silver");
  ok(first.ok === true, "the first payer wins");
  ok(second.error === "not_dead" || second.error === "grave_sealed", "the second is refused");
  ok(coinsOf(a.id) === 0, "the winner paid");
  ok(coinsOf(b.id) === RAISE_PRICE, "THE LOSER DID NOT — no double charge for one resurrection");
  ok(supply() === before - RAISE_PRICE, "exactly one fee was burned");
}

// ---- 7. BUYING YOURSELF BACK -----------------------------------------------
{
  const codes = ["common0", "common1", "common2", "rare0", "rare1", "legendary0", "mythic0", "talisman", "rare2"];
  const dead = person(2_500, codes);
  clock.prepare("UPDATE users SET chips = 400, freePulls = 9 WHERE id = ?").run(dead.id);
  store.killUser(dead.id);
  const before = { supply: supply(), emoji: emojiOut() };

  const r = store.selfRevive(dead.id);
  const bal7 = clock.prepare("SELECT chips, freePulls FROM users WHERE id = ?").get(dead.id);
  ok(bal7.chips === 0 && bal7.freePulls === 0, "the escape room's chips and free pulls go with the purse (Oct 2026)");
  ok(r.ok === true, "you can buy yourself out of a fresh grave");
  ok(coinsOf(dead.id) === 0, "it costs the WHOLE purse");
  ok(supply() === before.supply - 2_500, "…burned, not paid to anybody");
  ok(r.burned.length === selfBurnCount(codes.length), `a third of the collection burns (${r.burned.length} of ${codes.length})`);
  ok(invOf(dead.id).length === codes.length - r.burned.length, "…and is really gone from the inventory");
  ok(emojiOut() === before.emoji - r.burned.length, "…and gone from the world, not moved");
  ok(new Set(r.burned).size === r.burned.length, "no emoji is burned twice");
  ok(!store.getUserById(dead.id).disabled, "and they're standing");
  ok(store.getUserById(dead.id).generation === 1, "self-revival is not a rebirth: same generation");
}

// ---- 7b. A PRICE OF NOTHING IS NOT A PRICE ---------------------------------
// Josh, Aug 2026, on a fresh test account: "he has zero money i rigged his next
// spin for death which killed him. however when i went to log back in it
// allowed to pay the fee with no money and i got it." The quote is "your whole
// purse plus a third of your collection", which for a new account is zero and
// zero — so permadeath was free for exactly the accounts that cost nothing to
// make. The door needs something real on the counter.
{
  const pauper = person(0, []);
  store.killUser(pauper.id);
  const before = { supply: supply(), emoji: emojiOut() };
  ok(canSelfRevive(0, 0) === false, "a broke account with no collection cannot buy itself back");
  const r = store.selfRevive(pauper.id);
  ok(r.error === "nothing_to_pay", "…the wake refuses it rather than resurrecting for free");
  ok(!!store.getUserById(pauper.id).disabled, "…and they are still in the ground");
  ok(supply() === before.supply && emojiOut() === before.emoji, "…a refusal moves nothing");
  // The grave is still fresh, so the two real doors are both still open: a
  // friend can raise them, and the sealing will stand them up regardless.
  const savior = person(RAISE_PRICE, []);
  ok(store.raiseFromGrave(pauper.id, savior.id, "silver").ok === true,
    "…somebody else can still pay for them, which is the point of the whole window");

  // The floor is silver OR something to burn — one emoji is enough to be a
  // real price, and a purse under the floor with nothing to burn is not.
  ok(canSelfRevive(SELF_REVIVE_MIN_COINS, 0) === true, "the silver floor alone opens it");
  ok(canSelfRevive(SELF_REVIVE_MIN_COINS - 1, 0) === false, "…one coin short does not");
  ok(canSelfRevive(0, 3) === true, "a collection worth burning opens it with no silver at all");
  ok(canSelfRevive(0, 2) === false, "…but not a collection too small to burn any of");
}

// ---- 8. SEALED: the monument, the inheritance, the will --------------------
{
  const heir = person(100, ["common0"]); // already owns one of the dead's commons
  const codes = ["common0", "common1", "rare0", "rare1", "legendary0", "legendary1", "mythic0", "talisman"];
  const dead = person(1_001, codes);
  clock.prepare("UPDATE users SET chips = 401, freePulls = 9 WHERE id = ?").run(dead.id);
  clock.prepare("UPDATE users SET chips = 10, freePulls = 1 WHERE id = ?").run(heir.id);
  store.setLegacy(dead.id, { willBeneficiaryId: heir.id, epitaph: "one more spin" });
  store.killUser(dead.id);

  const before = { supply: supply(), emoji: emojiOut() };
  const expectKept = heirlooms(codes.map((c) => catalogue.find((x) => x.code === c) ?? { code: c, tier: "talisman" }));

  // Force the deadline into the past, the way 48 real hours would.
  expireGrave(dead.id);
  ok(store.dueGraves().includes(dead.id), "once the window passes, the grave is due");

  const sealed = store.sealGrave(dead.id);
  ok(sealed.sealed === true, "it seals");

  const reborn = store.getUserById(dead.id);
  ok(!reborn.disabled && reborn.diedAt === null && reborn.graveSealsAt === null, "the account is alive again");
  ok(reborn.generation === 2, "…as the SECOND generation");
  ok(reborn.epitaph === null, "the epitaph is gone from the living account");

  const monument = store.lives().find((l) => l.userId === dead.id && l.generation === 1);
  ok(!!monument, "a monument exists for the life that ended");
  ok(monument.epitaph === "one more spin", "…carrying the epitaph it was written for");
  ok(monument.coins === 1_001 && monument.emojiCount === codes.length,
    "…and a record of everything that life held");

  ok(coinsOf(dead.id) === 250, "a quarter of the purse (floored) walks out of the grave");
  ok(coinsOf(heir.id) === 100 + (1_001 - 250), "the will takes the exact remainder — not another fraction");
  ok(supply() === before.supply, "SILVER IS CONSERVED across a sealing with a will: nothing burned, nothing minted");
  const bd = clock.prepare("SELECT chips, freePulls FROM users WHERE id = ?").get(dead.id);
  const bh = clock.prepare("SELECT chips, freePulls FROM users WHERE id = ?").get(heir.id);
  ok(bd.chips === 100 && bd.freePulls === 2, `chips and free pulls keep the purse's quarter (${bd.chips}, ${bd.freePulls})`);
  ok(bh.chips === 10 + 301 && bh.freePulls === 1 + 7, "…and the will takes the exact remainder of each");

  ok(invOf(dead.id).join() === [...expectKept].sort().join(), "the five rarest come out of the grave");
  ok(invOf(dead.id).length === HEIRLOOM_COUNT, "…exactly five");
  ok(store.ownsEmoji(heir.id, "common1"), "the heir gets what the heirlooms didn't keep");
  ok(emojiOut() === before.emoji - 1, "…and the ONE the heir already owned was buried, never duplicated");
  ok(store.inventoryCount(heir.id) === 1 + (codes.length - HEIRLOOM_COUNT) - 1,
    "the heir's gain is exactly the non-heirlooms they lacked");
}

// ---- 9. sealed with NOBODY to inherit: the remainder burns -----------------
{
  const dead = person(800, ["common0", "common1", "rare0"]);
  store.killUser(dead.id);
  expireGrave(dead.id);
  const before = { supply: supply(), emoji: emojiOut() };

  store.sealGrave(dead.id);
  ok(coinsOf(dead.id) === 200, "the next generation still keeps its quarter");
  ok(supply() === before.supply - 600, "…and the estate with no heir is BURNED, exactly once");
  ok(invOf(dead.id).length === 3, "a small collection is entirely heirloom — nothing to bury");
  ok(emojiOut() === before.emoji, "…so no emoji were destroyed");
}

// ---- 10. sealing is idempotent --------------------------------------------
{
  const dead = person(1_000, ["common0"]);
  store.killUser(dead.id);
  expireGrave(dead.id);
  store.sealGrave(dead.id);
  const after = { supply: supply(), gen: store.getUserById(dead.id).generation, lives: store.lives().length };

  const again = store.sealGrave(dead.id);
  ok(again.sealed === false, "sealing an already-sealed grave does nothing");
  ok(supply() === after.supply, "…moves no silver");
  ok(store.getUserById(dead.id).generation === after.gen, "…and does not advance the generation twice");
  ok(store.lives().length === after.lives, "…nor carve a second monument");
}

// ---- 11. graves dug before migration 68 stay shut -------------------------
// The deploy-safety property. Their estates already executed under the old
// rules; giving them a window would hand the same estate out twice.
{
  const old = person(500, ["common0"]);
  store.killUser(old.id);
  preMigrationGrave(old.id); // what a pre-68 row looks like
  ok(store.getUserById(old.id).graveSealsAt === null, "an old grave has no deadline");
  ok(!store.graveFresh(old.id), "…so it is not fresh");
  ok(!store.dueGraves().includes(old.id), "…is never picked up by the sweep");
  ok(store.sealGrave(old.id).sealed === false, "…and cannot be sealed into a rebirth");
  ok(store.raiseFromGrave(old.id, person(RAISE_PRICE * 2).id, "silver").error === "grave_sealed",
    "…and cannot be raised");
  ok(store.selfRevive(old.id).error === "grave_sealed", "…or bought back");
  ok(store.getUserById(old.id).disabled, "it stays a grave, exactly as it was before the deploy");
}

// ---- 12. the two token worlds never overlap -------------------------------
// The router's "wake" level is three lines that call these two resolvers, so
// this is the real boundary: a dead session must resolve to nothing on every
// ordinary route, and a living one to nothing on the wake routes.
{
  const living = person(10, []);
  const lt = "live-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  store.createSession(living.id, lt);

  const dying = person(10, []);
  const dt = "dead-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  store.createSession(dying.id, dt);
  store.killUser(dying.id);

  ok(!!userForToken(store, lt), "a living token resolves on ordinary routes");
  ok(wakeUserForToken(store, lt) === undefined, "…and resolves to NOTHING on the wake routes");
  ok(userForToken(store, dt) === undefined, "A DEAD TOKEN REACHES NO ORDINARY ROUTE");
  ok(!!wakeUserForToken(store, dt), "…but does open its own wake");
  ok(wakeUserForToken(store, "not-a-token") === undefined, "garbage opens nothing");

  // Once the grave seals, the wake closes behind them.
  expireGrave(dying.id);
  store.sealGrave(dying.id);
  ok(wakeUserForToken(store, dt) === undefined, "a sealed grave's wake token stops working");
  ok(!!userForToken(store, dt), "…and the reborn account's session is an ordinary one again");
}

console.log(`\n${n - bad}/${n} mortality asserts passed`);
if (bad) process.exit(1);
