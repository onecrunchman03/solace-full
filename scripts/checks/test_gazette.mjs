// THE FOUNDRY GAZETTE — the house's morning paper.
//
// Run:  npm run build && node scripts/checks/test_gazette.mjs
//
// In-process over a real Store and the real bus, with a stand-in Sterling (who
// records what he posts) and a clock the harness turns. No model: `voiced()`
// returns each brief as written, which is exactly the fallback the paper runs
// on when the engines are down. Holds the paper to:
//   · the day's public news logged as it happens — and only news: small wins,
//     the house, bots and deleted accounts never make the paper
//   · printed ONCE, at the paper's hour of house time, and not again that day
//   · a quiet day stays quiet (no thin paper), but the admin's lever prints
//   · the layout is fixed: masthead, sections in order, one bullet per line
//     with a breath between (the notice-board rule: never hard-wrapped)
//   · printed news is spent, and the log survives a restart

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (p) => pathToFileURL(path.join(ROOT, "dist", p)).href;
const { Store } = await import(dist("db/store.js"));
const { Bus } = await import(dist("bus.js"));
const G = await import(dist("gazette.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

const tmp = mkdtempSync(path.join(tmpdir(), "gazette-"));
const store = new Store(path.join(tmp, "g.db"));
const bus = new Bus();
const mara = store.createUser({ username: "mara", displayName: "Mara", passwordHash: "x" });
const theo = store.createUser({ username: "theo", displayName: "Theo", passwordHash: "x" });
const boss = store.createUser({ username: "boss", displayName: "Boss", passwordHash: "x" });
store.prep("UPDATE users SET isAdmin = 1 WHERE id = ?").run(boss.id);
const channel = store.createChannel({ name: "general", topic: "", createdBy: mara.id });
const posts = [];
const sterling = { general: () => channel, say: (_id, body) => posts.push(body) };

// 08:00 New York on a fixed day, in UTC (EDT is UTC-4 in October)
const at = (h, m = 0) => Date.UTC(2026, 9, 13, h + 4, m);
let now = at(7, 0);
const clock = () => now;
let g = G.startGazette(store, bus, sterling, { now: clock, autoTick: false });

console.log("THE DAY'S NEWS");
bus.emit("wheel.spin", { userId: mara.id, slotIndex: 1, died: false, tier: "legendary", emojiName: "Golden Goose" });
bus.emit("wheel.spin", { userId: theo.id, slotIndex: 2, died: false, tier: "common", emojiName: "Pebble" });
bus.emit("wheel.spin", { userId: theo.id, slotIndex: 16, died: true });
bus.emit("wheel.spin", { userId: boss.id, slotIndex: 1, died: false, tier: "mythic", emojiName: "Crown of Ages" });
bus.emit("slots.pull", { userId: mara.id, reels: ["crown", "crown", "crown"] });
bus.emit("slots.pull", { userId: mara.id, reels: ["crown", "crown", "bell"] });
bus.emit("lottery.won", { day: "2026-10-12", pot: 900, paid: 810, winner: { id: theo.id, displayName: "Theo" } });
const derby = (round, payout) => ({ state: { phase: "settled", round, racers: [{ key: "boulder", name: "Old Reliable" }], placings: ["boulder"], winners: [{ userId: mara.id, payout, place: 1 }], history: [] } });
bus.emit("derby.state", derby(5, 1500));
bus.emit("derby.state", derby(5, 1500)); // the same round re-broadcast
bus.emit("derby.state", derby(6, 40)); // too small to be news
bus.emit("roulette.state", { state: { phase: "settled", round: 3, pocket: 17, winners: [{ user: { id: theo.id }, total: 3600 }, { user: { id: mara.id }, total: 20 }] } });
// a 3,600 straight that hid 5,000 of losing chips is a LOSS, not news (Oct 2026 review)
bus.emit("roulette.state", { state: { phase: "settled", round: 4, pocket: 9, bets: [{ user: { id: mara.id }, amount: 100 }, { user: { id: mara.id }, amount: 4900 }], winners: [{ user: { id: mara.id }, total: 3600 }] } });
bus.emit("auction.close", { auction: { status: "settled", currentBid: 2500, highBidder: { id: mara.id }, emoji: { name: "Moon Rabbit" }, relicSlug: null } });
bus.emit("auction.close", { auction: { status: "settled", currentBid: 50, highBidder: { id: theo.id }, emoji: { name: "Twig" }, relicSlug: null } });
bus.emit("grave.sealed", { userId: theo.id, generation: 2, name: "Theo" });
const log = g.log();
const has = (s) => log.some((i) => i.brief.includes(s));
ok(has("Mara won Golden Goose, a legendary"), "a legendary win on the Wheel is news");
ok(!has("Pebble"), "a common isn't");
ok(has("Theo met the death wedge"), "a death on the Wheel goes in memoriam");
ok(!has("Boss") && !has("Crown of Ages"), "the house doesn't make the paper");
ok(log.filter((i) => i.brief.includes("crown jackpot")).length === 1, "a crown jackpot is news, two crowns aren't");
ok(has("Theo won the Nightly Draw: 810 silver"), "the Nightly Draw's winner");
ok(log.filter((i) => i.brief.includes("Derby")).length === 1 && has("1,500 silver when Old Reliable won the Derby"), "a big Derby payout once (not the re-broadcast, not the small one)");
ok(has("Theo took 3,600 silver off the roulette wheel on 17") && !has("20 silver"), "a big roulette win, not a small one");
ok(!has("Mara took"), "a spin that paid back less than it staked is never printed as a win");
ok(has("Mara bought Moon Rabbit at auction for 2,500 silver") && !has("Twig"), "a big auction, not a small one");
ok(has("Nobody came for Theo"), "a sealed grave goes in memoriam");

console.log("THE LOG SURVIVES A RESTART");
g.stop();
g = G.startGazette(store, bus, sterling, { now: clock, autoTick: false });
ok(g.log().length === log.length, `a restart keeps the day's news (${g.log().length} items)`);

console.log("PRINTED ONCE, AT THE PAPER'S HOUR");
ok((await g.tick(at(7, 30))) === null && posts.length === 0, "nothing before the paper's hour");
now = at(G.GAZETTE_HOUR, 2);
const paper = await g.tick(now);
ok(!!paper && posts.length === 1, "at the paper's hour, Sterling posts the paper");
ok((await g.tick(at(G.GAZETTE_HOUR, 30))) === null && posts.length === 1, "and not again that morning");
const lines = (paper ?? "").split("\n");
ok(lines[0].startsWith("📰 THE FOUNDRY GAZETTE — Tuesday, October 13"), "the masthead carries the house's date");
const order = ["THE WHEEL", "AT THE TABLES", "ON THE BLOCK", "IN MEMORIAM"].map((t) => lines.indexOf(t));
ok(order.every((i) => i > 0) && order.every((v, i) => !i || v > order[i - 1]), "sections in order: the Wheel, the tables, the block, in memoriam");
const bullets = lines.filter((l) => l.startsWith("· "));
const tables = lines.slice(order[1], order[2]).filter((l) => l.startsWith("· "));
ok(tables[0]?.includes("3,600"), "the biggest win at the tables leads its section");
ok(bullets.length >= 7 && lines.every((l, i) => !l.startsWith("· ") || lines[i + 1] === undefined || lines[i + 1] === "" ), "one line per item, a blank line after each (never hard-wrapped)");
ok(!paper.includes("Boss"), "and the house is nowhere in it");

console.log("PRINTED NEWS IS SPENT; A QUIET DAY STAYS QUIET");
ok(g.log().length === 0, "the next paper starts empty");
now = at(G.GAZETTE_HOUR + 24, 1); // next morning, nothing happened
bus.emit("slots.pull", { userId: mara.id, reels: ["crown", "crown", "crown"] });
ok((await g.tick(now)) === null && posts.length === 1, `a morning with under ${G.GAZETTE_MIN_ITEMS} items prints nothing`);
ok((await g.tick(now + 600_000)) === null && posts.length === 1, "and doesn't keep trying all hour");
const forced = await g.printNow(true, now + 700_000);
ok(!!forced && posts.length === 2 && forced.includes("crown jackpot"), "the admin's lever prints it anyway");

g.stop();
store.close?.();
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
