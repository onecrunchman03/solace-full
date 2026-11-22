// Achievements harness — engine invariants on a throwaway DB.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
import { rmSync } from "node:fs";
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { Bus } = require(dist("bus.js"));
const ach = require(dist("achievements.js"));
const { CATALOG } = require(dist("emporium.js"));
const { dailyStock, inStockToday } = require(dist("emporium.js"));

const DB = path.join(ROOT, "data", "ach-harness.db");
try { rmSync(DB); rmSync(DB + "-wal"); rmSync(DB + "-shm"); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);
const bus = new Bus();
ach.initAchievements(store, bus);
const events = [];
bus.on("achievement.earned", (e) => events.push(e));

const user = store.createUser({ username: "tester", displayName: "Tester", passwordHash: "x" });

// Catalog sanity: unique ids, reward items exist and are award-only.
const ids = new Set(ach.ACHIEVEMENTS.map((a) => a.id));
ok(ids.size === ach.ACHIEVEMENTS.length, "catalog ids unique");
for (const a of ach.ACHIEVEMENTS.filter((a) => a.rewardItem)) {
  const item = CATALOG.find((i) => i.id === a.rewardItem);
  ok(!!item && item.award === true, `reward ${a.rewardItem} exists + award-only`);
}
// Award-only items never stocked/buyable.
const stock = dailyStock();
for (const i of CATALOG.filter((i) => i.award)) {
  ok(!inStockToday(i, stock) && !stock.ids.has(i.id), `${i.id} never in stock`);
}

// Stat badge: below goal → nothing; at goal → granted once.
store.bumpStat(user.id, "spins", 24);
ach.checkStats(user.id);
ok(store.earnedAchievements(user.id).length === 0, "below goal grants nothing");
store.bumpStat(user.id, "spins", 1);
ach.checkStats(user.id);
ok(store.earnedAchievements(user.id).some((r) => r.achId === "spins-25"), "goal reached grants the badge");
const before = store.earnedAchievements(user.id).length;
ach.checkStats(user.id);
ok(store.earnedAchievements(user.id).length === before, "re-check never double-grants");
ok(events.filter((e) => e.achId === "spins-25").length === 1, "bus fired exactly once");

// Event badge: idempotent award.
ach.award(user.id, "br-first");
ach.award(user.id, "br-first");
ok(store.earnedAchievements(user.id).filter((r) => r.achId === "br-first").length === 1, "event award idempotent");
ok(events.filter((e) => e.achId === "br-first").length === 1, "event bus fired once");

// Unknown id is a no-op.
ach.award(user.id, "not-a-badge");
ok(!store.earnedAchievements(user.id).some((r) => r.achId === "not-a-badge"), "unknown id refused");

// Reward grant: crown ×3 → Dynasty + the exclusive title in user_items.
store.grantAchievement(user.id, "crown-1"); // pre-earn so only dynasty fires
const w = (k) => store.db ? null : null;
// three crown wins via the real table
for (let i = 0; i < 3; i++) {
  // simulate weekly wins
  storeRaw(`INSERT INTO bonepit_weeks (weekId, winnerId, emojiCode, at) VALUES ('W${i}', ${user.id}, NULL, ${Date.now()})`);
}
ach.checkStats(user.id);
ok(store.earnedAchievements(user.id).some((r) => r.achId === "crown-3"), "dynasty at 3 crowns");
ok(storeRawGet(`SELECT COUNT(*) AS n FROM user_items WHERE userId = ${user.id} AND itemId = 'title-dynast'`).n === 1, "exclusive title granted");

// Secrets: hidden until earned in the resolved list.
const resolvedBefore = ach.resolveAchievements(user.id);
ok(!resolvedBefore.some((a) => a.id === "drowned"), "unearned secret hidden");
ach.award(user.id, "drowned");
ok(ach.resolveAchievements(user.id).some((a) => a.id === "drowned"), "earned secret visible");

// Progress numbers on locked stat badges.
const locked = ach.resolveAchievements(user.id).find((a) => a.id === "spins-100");
ok(locked && locked.earnedAt === null && locked.cur === 25 && locked.goal === 100, "locked badge carries progress 25/100");

// ---- The federation wave (Sep 2026): market/casino/worlds badges ----------
store.bumpStat(user.id, "emoji_sold", 10);
store.bumpStat(user.id, "trades_done", 1);
store.bumpStat(user.id, "auctions_won", 10);
store.bumpStat(user.id, "chess_wins", 5);
store.bumpStat(user.id, "lottery_wins", 1);
store.bumpStat(user.id, "raises", 1);
store.bumpStat(user.id, "loans_repaid", 1);
ach.checkStats(user.id);
const wave = new Set(store.earnedAchievements(user.id).map((r) => r.achId));
ok(wave.has("sold-10"), "sold-10 at 10 emoji sold");
ok(wave.has("trade-1"), "trade-1 at one settled trade");
ok(wave.has("auction-won-1") && wave.has("auctions-won-10"), "both auction badges at 10 wins");
ok(wave.has("chess-5"), "chess-5 at 5 duels won");
ok(wave.has("lottery-1"), "lottery-1 on a draw win");
ok(wave.has("raise-1"), "raise-1 for the samaritan");
ok(wave.has("debt-free"), "debt-free on a cleared loan");
ok(!wave.has("sold-250") && !wave.has("trades-10"), "higher rungs stay locked");

// The casino-floor murder is a SECRET: hidden before, visible after.
ok(!ach.resolveAchievements(user.id).some((a) => a.id === "casino-kill"), "casino-kill hidden while unearned");
store.bumpStat(user.id, "casino_kills", 1);
ach.checkStats(user.id);
ok(ach.resolveAchievements(user.id).some((a) => a.id === "casino-kill"), "casino-kill earned + visible");

// Fact-backed: the wardrobe counts user_items rows (dynasty's title is one,
// so nine bought cosmetics reach ten).
for (const i of CATALOG.filter((i) => !i.award).slice(0, 9)) store.grantItemFree(user.id, i.id);
ach.checkStats(user.id);
ok(store.earnedAchievements(user.id).some((r) => r.achId === "wardrobe-10"), "wardrobe-10 at 10 owned cosmetics");

// Fact-backed: a second generation (the Inheritance's mark on the same row).
storeRaw(`UPDATE users SET generation = 2 WHERE id = ${user.id}`);
ach.checkStats(user.id);
ok(store.earnedAchievements(user.id).some((r) => r.achId === "gen-2"), "gen-2 on a second generation");

// Fact-backed: the creature deaths, keyed to the EXACT cause strings the
// services write ('an alligator' / 'the shy guy') — a renamed cause would
// silently orphan these badges, which is what this pin is for.
storeRaw(`INSERT INTO backrooms_deaths (userId, name, x, y, cause, at) VALUES (${user.id}, 'Tester', 1, 1, 'an alligator', ${Date.now()})`);
storeRaw(`INSERT INTO backrooms_deaths (userId, name, x, y, cause, at) VALUES (${user.id}, 'Tester', 1, 1, 'the shy guy', ${Date.now()})`);
ach.checkStats(user.id);
const deaths = new Set(store.earnedAchievements(user.id).map((r) => r.achId));
ok(deaths.has("gator-death"), "gator-death from the death table");
ok(deaths.has("shyguy-death"), "shyguy-death from the death table");

function storeRaw(sql) {
  // reach the underlying handle through a scratch DatabaseSync connection
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(DB);
  d.exec(sql);
  d.close();
}
function storeRawGet(sql) {
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(DB);
  const r = d.prepare(sql).get();
  d.close();
  return r;
}

console.log(`\n${n - bad}/${n} asserts green`);
process.exit(bad ? 1 : 0);
