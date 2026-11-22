// THE BIG UPDATE (Josh, Sep 2026) — STERLING'S SHELF, THE FORGE, PAGE CHAT
// POLICY and READ RECEIPTS, over a real server (plus the retention sweeps
// in-process on the same DB).
//
//  · THE SHELVES (Josh, Sep 2026, migration 91 — the sell-back shelf was a
//    mythic faucet through the Forge): what Sterling BUYS burns; what he SELLS
//    is a fixed daily spread, a pure function of the UTC day and the same for
//    everyone (1 legendary · 3 rares · 6 commons at 5,000 · 300 · 50), each
//    listing once per person per day, silver BURNED, every refusal free.
//  · (the old shelf, for the record) everything sold to Sterling landed ONCE (a second
//    copy is discarded at the counter and still paid for), anyone buys it
//    back at double, the silver BURNS (exact conservation), and every refusal
//    (broke, gone, already owned) is proven free.
//  · THE FORGE: melt yields pinned to src/forge.ts, mythics/talisman refused,
//    an upgrade consuming the emoji + the essence and paying an UNOWNED emoji
//    of the next tier, refused free when short, when the tier is complete,
//    and at the top of the ladder.
//  · PAGE POLICY: staff-set dials, GIFs refused, attachments refused, bad
//    days refused, a member refused; the message-retention purge and the
//    per-page attachment clock.
//  · READ RECEIPTS: the cursor frame reaching the page, an opted-out reader
//    silent AND absent from the readers list, the DM twin both ways and
//    recipient-scoped.
//
// Run: node scripts/checks/test_market2.mjs        (needs `npm run build`)

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { MELT_YIELD, UPGRADE_COST, NEXT_TIER } = require(path.join(ROOT, "dist", "forge.js"));
const { SELL_PRICES } = require(path.join(ROOT, "dist", "shop.js"));
const { MYTHIC_TOLL, TOLLS } = require(path.join(ROOT, "dist", "forge.js"));
const { dailyShelf, SHELF_PRICES, SHELF_SIZES, SHELF_TIERS, utcDay, restockAtFor } = require(path.join(ROOT, "dist", "shelf.js"));

const PORT = 8501;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "market2-harness");
const DB = path.join(DATA, "solace.db");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: "Adm1n!Passw0rd#Q",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));
const stop = () => { try { server.kill("SIGINT"); } catch { /* gone */ } };

const api = async (method, url, { token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
};
let regSeq = 0;
const register = async (username) => {
  regSeq++;
  const r = await api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `vault marmalade lantern quartz ${regSeq} 47`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.79.0.${10 + regSeq}` },
  });
  return { token: r.body?.token, id: r.body?.user?.id };
};
const socket = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = { ws, frames, of: (t) => frames.filter((f) => f.type === t) };
    ws.on("message", (m) => { try { frames.push(JSON.parse(String(m))); } catch { /* junk */ } });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });
const upload = async (token, bytes, name) => {
  const res = await fetch(`${BASE}/api/uploads?name=${name}`, {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/octet-stream" }, body: bytes,
  });
  return (await res.json()).attachment;
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(900, 7)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(900, 3)]);

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" } })).body?.token;
  ok(!!admin, "admin signed in");
  const A = await register("smith");
  const B = await register("buyer");
  const C = await register("quietone");
  ok(!!A.token && !!B.token && !!C.token, "three members registered");

  const st = new Store(DB); // a second connection on the live DB — the grant path the Wheel uses
  const codesOf = (tier, k, off = 0) => st.db.prepare("SELECT code FROM emoji WHERE tier = ? ORDER BY code LIMIT ? OFFSET ?").all(tier, k, off).map((r) => r.code);
  const coins = (id) => st.getCoins(id);
  const stat = (id, key) => st.db.prepare("SELECT value FROM user_stats WHERE userId = ? AND key = ?").get(id, key)?.value ?? 0;
  const mint = (id, amount) => api("POST", "/api/admin/coins", { token: admin, body: { userId: id, amount } });

  // ======================================================================
  // STERLING'S SHELVES
  // ======================================================================
  console.log("\n— Sterling's shelves —");
  const [c1, c2, c3] = codesOf("common", 3);
  const [r1] = codesOf("rare", 1);
  for (const c of [c1, c2]) st.addEmoji(A.id, c);
  st.addEmoji(A.id, r1);
  const sell1 = await api("POST", "/api/shop/sell", { token: A.token, body: { codes: [c1, c2, r1] } });
  ok(sell1.status === 200 && sell1.body.gained === SELL_PRICES.common * 2 + SELL_PRICES.rare, "the smith sells two commons + a rare at the counter");
  const dead = st.db.prepare("SELECT COUNT(*) AS n FROM sterling_stock").get().n;
  ok(!st.ownsEmoji(A.id, c1) && !st.ownsEmoji(A.id, r1) && dead === 0, "…and they BURN — gone from the seller, and nothing lands on any shelf (sterling_stock stays dead)");

  const day = utcDay(Date.now());
  const inTier = (t) => st.db.prepare("SELECT code FROM emoji WHERE tier = ?").all(t).map((r) => r.code);
  const expect = dailyShelf(day, inTier);
  const stock = (await api("GET", "/api/shop/stock", { token: B.token })).body;
  const codesOn = (body) => body.shelves.map((sh) => sh.items.map((e) => e.code));
  ok(stock.day === day && stock.shelves.length === 3 && stock.shelves.map((sh) => sh.tier).join() === SHELF_TIERS.join(),
    "today's spread rides the wire top shelf first: legendary · rare · common");
  ok(SHELF_SIZES.legendary === 1 && SHELF_SIZES.rare === 3 && SHELF_SIZES.common === 6
    && stock.shelves.every((sh) => sh.items.length === SHELF_SIZES[sh.tier] && sh.size === SHELF_SIZES[sh.tier]),
    "sizes pinned: 1 legendary · 3 rares · 6 commons");
  ok(JSON.stringify(codesOn(stock)) === JSON.stringify(SHELF_TIERS.map((t) => expect[t])), "the spread is the PURE FUNCTION of the day in src/shelf.ts");
  ok(SHELF_PRICES.common === 100 && SHELF_PRICES.rare === 1_000 && SHELF_PRICES.legendary === 25_000
    && stock.shelves.every((sh) => sh.price === SHELF_PRICES[sh.tier] && sh.items.every((e) => e.price === SHELF_PRICES[sh.tier] && e.tier === sh.tier && e.bought === false)),
    "prices pinned 100 · 1,000 · 25,000 and nothing bought yet");
  ok(stock.restockAt === restockAtFor(day) && stock.restockAt === (day + 1) * 86_400_000, "restocks at the next UTC midnight");
  const stockC = (await api("GET", "/api/shop/stock", { token: C.token })).body;
  ok(JSON.stringify(codesOn(stockC)) === JSON.stringify(codesOn(stock)), "the same shelf for everyone");

  const offShelf = codesOf("common", 40).find((c) => !expect.common.includes(c));
  const before = coins(A.id) + coins(B.id) + coins(C.id);
  const notOn = await api("POST", "/api/shop/buy", { token: B.token, body: { codes: [offShelf] } });
  ok(notOn.status === 400 && notOn.body.error === "not_in_stock" && !st.ownsEmoji(B.id, offShelf), "a code that isn't on today's shelf is refused");
  const broke = await api("POST", "/api/shop/buy", { token: B.token, body: { codes: [expect.common[0]] } });
  ok(broke.status === 402 && broke.body.error === "insufficient", "a broke buyer is refused 402");
  ok(coins(A.id) + coins(B.id) + coins(C.id) === before && !st.ownsEmoji(B.id, expect.common[0]), "…both free, nothing moved");
  // A purse that covers the pair with change (the Sep 2026 prices: 100 + 1,000).
  const purse = SHELF_PRICES.common + SHELF_PRICES.rare + 400;
  await mint(B.id, purse);
  const cost = SHELF_PRICES.common + SHELF_PRICES.rare;
  const buy = await api("POST", "/api/shop/buy", { token: B.token, body: { codes: [expect.common[0], expect.rare[0]] } });
  ok(buy.status === 200 && buy.body.spent === cost && buy.body.emoji.length === 2 && buy.body.coins === purse - cost, `the buyer takes a common + a rare for ${cost}`);
  ok(st.ownsEmoji(B.id, expect.common[0]) && st.ownsEmoji(B.id, expect.rare[0]), "…and owns them");
  ok(coins(A.id) + coins(B.id) + coins(C.id) === before + purse - cost, "THE SILVER BURNS: wallets fell by exactly the price and nobody was credited");
  const after = (await api("GET", "/api/shop/stock", { token: B.token })).body;
  ok(after.shelves.flatMap((sh) => sh.items).filter((e) => e.bought).map((e) => e.code).sort().join() === [expect.common[0], expect.rare[0]].sort().join(),
    "the two read as bought on HIS shelf view…");
  const afterC = (await api("GET", "/api/shop/stock", { token: C.token })).body;
  ok(afterC.shelves.flatMap((sh) => sh.items).every((e) => !e.bought), "…and untouched on everyone else's — a listing is per customer, not stock");
  const mid = coins(B.id);
  st.removeEmoji(B.id, expect.common[0]);
  const again = await api("POST", "/api/shop/buy", { token: B.token, body: { codes: [expect.common[0]] } });
  ok(again.status === 400 && again.body.error === "already_bought" && coins(B.id) === mid && !st.ownsEmoji(B.id, expect.common[0]),
    "ONCE PER DAY: the same listing again (even after losing the emoji) is refused free");
  st.addEmoji(B.id, expect.common[1]);
  const dup = await api("POST", "/api/shop/buy", { token: B.token, body: { codes: [expect.common[1]] } });
  ok(dup.status === 400 && dup.body.error === "already_owned" && coins(B.id) === mid, "an already-owned listing is refused free");
  const mixed = await api("POST", "/api/shop/buy", { token: B.token, body: { codes: [expect.common[2], offShelf] } });
  ok(mixed.status === 400 && mixed.body.error === "not_in_stock" && !st.ownsEmoji(B.id, expect.common[2]) && coins(B.id) === mid,
    "a batch is all-or-nothing: one bad code voids the whole buy, free");
  ok(stat(B.id, "shelf_bought") === 2, "shelf_bought counts the two that were bought");
  const ledger = st.db.prepare("SELECT COUNT(*) AS n FROM sterling_purchases WHERE userId = ? AND day = ?").get(B.id, day).n;
  ok(ledger === 2, "migration 91's ledger holds exactly the two purchases");

  // ======================================================================
  // THE FORGE
  // ======================================================================
  console.log("\n— The Forge —");
  const rates = (await api("GET", "/api/forge", { token: A.token })).body;
  ok(rates.essence === 0 && rates.meltYield.common === MELT_YIELD.common && rates.upgradeCost.legendary === UPGRADE_COST.legendary && rates.nextTier.legendary === "mythic" && rates.mythicToll === MYTHIC_TOLL,
    "the rate card rides the wire from src/forge.ts, toll included");
  ok(MYTHIC_TOLL === 100_000, "THE MYTHIC TOLL is pinned at 100,000 silver — a fifth of Sterling's counter");
  ok(MELT_YIELD.common === 1 && MELT_YIELD.rare === 5 && MELT_YIELD.legendary === 25 && MELT_YIELD.mythic === undefined,
    "melt yields pinned: common 1 · rare 5 · legendary 25 · mythics never");
  ok(UPGRADE_COST.common === 12 && UPGRADE_COST.rare === 60 && UPGRADE_COST.legendary === 500 && NEXT_TIER.legendary === "mythic" && NEXT_TIER.mythic === undefined,
    "upgrade costs pinned: 12 · 60 · 500, and mythic has no next rung");

  const commons = codesOf("common", 20, 10);
  const [r2] = codesOf("rare", 1, 5);
  const [l1] = codesOf("legendary", 1);
  const [m1] = codesOf("mythic", 1);
  for (const c of commons.slice(0, 3)) st.addEmoji(A.id, c);
  st.addEmoji(A.id, r2);
  st.addEmoji(A.id, l1);
  st.addEmoji(A.id, m1);
  const melt1 = await api("POST", "/api/forge/melt", { token: A.token, body: { codes: [commons[0], commons[1], r2] } });
  ok(melt1.status === 200 && melt1.body.gained === 2 * MELT_YIELD.common + MELT_YIELD.rare && melt1.body.essence === 7, "two commons + a rare melt into 7 essence");
  ok(!st.ownsEmoji(A.id, commons[0]) && !st.ownsEmoji(A.id, r2) && st.ownsEmoji(A.id, commons[2]), "…the melted are gone, the rest untouched");
  const myth = await api("POST", "/api/forge/melt", { token: A.token, body: { codes: [m1] } });
  ok(myth.status === 400 && myth.body.error === "unmeltable" && st.ownsEmoji(A.id, m1) && st.getEssence(A.id) === 7, "a mythic won't melt — refused, still owned, essence unchanged");
  const notMine = await api("POST", "/api/forge/melt", { token: A.token, body: { codes: [commons[2], commons[9]] } });
  ok(notMine.status === 400 && notMine.body.error === "not_owned" && st.ownsEmoji(A.id, commons[2]), "one unowned code voids the whole melt");
  const tal = await api("POST", "/api/forge/melt", { token: A.token, body: { codes: ["talisman"] } });
  ok(tal.status === 400, "the talisman is refused too");

  const short = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: commons[2] } });
  ok(short.status === 402 && short.body.error === "insufficient_essence" && st.ownsEmoji(A.id, commons[2]) && st.getEssence(A.id) === 7,
    "an upgrade with 7 of the 12 essence is refused 402, free");
  for (const c of commons.slice(3, 15)) st.addEmoji(A.id, c);
  const melt2 = await api("POST", "/api/forge/melt", { token: A.token, body: { codes: commons.slice(3, 15) } });
  ok(melt2.status === 200 && melt2.body.essence === 19, "twelve more commons → 19 essence");
  const raresBefore = st.db.prepare("SELECT COUNT(*) AS c FROM user_emoji ue JOIN emoji e ON e.code = ue.code WHERE ue.userId = ? AND e.tier = 'rare'").get(A.id).c;
  // EVERY STEP CARRIES A TOLL (Josh, Sep 2026): 100 for the common step,
  // 5,000 for the rare step, the mythic toll on top. Checked with the
  // essence BEFORE anything is spent, and BURNED.
  ok(TOLLS.common === 100 && TOLLS.rare === 5_000 && TOLLS.legendary === MYTHIC_TOLL, "the tolls are pinned: 100 · 5,000 · 100,000");
  st.db.prepare("UPDATE users SET coins = 99 WHERE id = ?").run(A.id);
  const brokeToll = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: commons[2] } });
  ok(brokeToll.status === 402 && brokeToll.body.error === "insufficient_silver" && st.getEssence(A.id) === 19 && st.ownsEmoji(A.id, commons[2]),
    "one silver short of the common step's toll: refused 402, essence and emoji untouched");
  st.db.prepare("UPDATE users SET coins = 1000 WHERE id = ?").run(A.id);
  const up1 = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: commons[2] } });
  ok(up1.status === 200 && up1.body.essence === 7 && up1.body.consumed.code === commons[2] && up1.body.emoji.tier === "rare" && up1.body.cost === 12 && up1.body.toll === 100 && coins(A.id) === 900,
    "THE STRIKE: a common + 12 essence + 100 silver → a rare, the toll burned");
  ok(!st.ownsEmoji(A.id, commons[2]) && st.ownsEmoji(A.id, up1.body.emoji.code), "…the common is consumed and the rare is owned");
  const raresAfter = st.db.prepare("SELECT COUNT(*) AS c FROM user_emoji ue JOIN emoji e ON e.code = ue.code WHERE ue.userId = ? AND e.tier = 'rare'").get(A.id).c;
  ok(raresAfter === raresBefore + 1, "…exactly one rare more (never a duplicate)");
  const top = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: m1 } });
  ok(top.status === 400 && top.body.error === "top_tier", "a mythic has no next rung");
  const nope = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: commons[19] } });
  ok(nope.status === 400 && nope.body.error === "not_owned", "an unowned emoji can't be laid on the anvil");

  // The tier-complete refusal, then the mythic step itself.
  for (const c of codesOf("mythic", 40)) st.addEmoji(A.id, c);
  st.db.prepare("UPDATE users SET essence = 500 WHERE id = ?").run(A.id);
  const full = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: l1 } });
  ok(full.status === 409 && full.body.error === "tier_complete" && st.ownsEmoji(A.id, l1) && st.getEssence(A.id) === 500,
    "owning every mythic: the legendary step is refused 409, nothing charged");
  st.db.prepare("DELETE FROM user_emoji WHERE userId = ? AND code IN (SELECT code FROM emoji WHERE tier = 'mythic')").run(A.id);
  // THE TOLL: essence enough, purse short — refused 402, nothing spent.
  st.db.prepare("UPDATE users SET coins = ? WHERE id = ?").run(MYTHIC_TOLL - 1, A.id);
  const poor = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: l1 } });
  ok(poor.status === 402 && poor.body.error === "insufficient_silver" && st.getEssence(A.id) === 500 && coins(A.id) === MYTHIC_TOLL - 1 && st.ownsEmoji(A.id, l1),
    "THE TOLL: 500 essence but one silver short → refused 402, essence untouched, legendary kept");
  await mint(A.id, 1);
  const pool = coins(A.id) + coins(B.id) + coins(C.id);
  const up2 = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: l1 } });
  ok(up2.status === 200 && up2.body.emoji.tier === "mythic" && up2.body.essence === 0 && !st.ownsEmoji(A.id, l1) && st.ownsEmoji(A.id, up2.body.emoji.code),
    "a legendary + 500 essence + the toll → a mythic, the legendary consumed");
  ok(up2.body.toll === MYTHIC_TOLL && up2.body.coins === 0 && coins(A.id) === 0 && coins(A.id) + coins(B.id) + coins(C.id) === pool - MYTHIC_TOLL,
    "…and the toll BURNED: exactly 100,000 left the world and nobody was credited");
  ok(stat(A.id, "emoji_melted") === 15 && stat(A.id, "emoji_forged") === 2 && stat(A.id, "mythics_forged") === 1, "the forge's stats count melts, strikes and the mythic");

  // ======================================================================
  // PAGE CHAT POLICY
  // ======================================================================
  console.log("\n— Page chat policy —");
  const memberPatch = await api("PATCH", "/api/pages/1", { token: B.token, body: { allowGifs: false } });
  ok(memberPatch.status === 403, "a member can't set a page's policy");
  const badDays = await api("PATCH", "/api/pages/1", { token: admin, body: { staticDays: 0 } });
  ok(badDays.status === 400 && badDays.body.error === "bad_days", "a zero-day clock is refused");
  const noGif = await api("PATCH", "/api/pages/1", { token: admin, body: { allowGifs: false, messageDays: 5, staticDays: 2 } });
  ok(noGif.status === 200 && noGif.body.page.allowGifs === false && noGif.body.page.messageDays === 5 && noGif.body.page.staticDays === 2 && noGif.body.page.allowImages === true,
    "the admin sets: no GIFs, messages 5 days, images 2 days");
  const list = (await api("GET", "/api/pages", { token: B.token })).body.pages.find((p) => p.id === 1);
  ok(list && list.allowGifs === false && list.messageDays === 5, "…and the picker card carries the policy");
  const png = await upload(B.token, PNG, "p.png");
  const gif = await upload(B.token, GIF, "g.gif");
  ok(png?.kind === "image" && gif?.kind === "gif", "a PNG and a GIF are staged at the hub as usual");
  const gifPost = await api("POST", "/api/channels/1/messages", { token: B.token, body: { body: "moving picture", attachmentIds: [gif.id] } });
  ok(gifPost.status === 403 && gifPost.body.error === "gifs_off", "a GIF post is refused 403 gifs_off");
  const pngPost = await api("POST", "/api/channels/1/messages", { token: B.token, body: { body: "still picture", attachmentIds: [png.id] } });
  ok(pngPost.status === 200 && pngPost.body.message.attachments?.length === 1, "…while a PNG still lands");
  await api("PATCH", "/api/pages/1", { token: admin, body: { allowImages: false } });
  const png2 = await upload(B.token, PNG, "p2.png");
  const noAtt = await api("POST", "/api/channels/1/messages", { token: B.token, body: { body: "picture", attachmentIds: [png2.id] } });
  ok(noAtt.status === 403 && noAtt.body.error === "attachments_off", "with attachments off, an image post is refused 403 attachments_off");
  const textOnly = await api("POST", "/api/channels/1/messages", { token: B.token, body: { body: "just words" } });
  ok(textOnly.status === 200, "…and words still land");
  const reset = await api("PATCH", "/api/pages/1", { token: admin, body: { allowImages: true, allowGifs: true, messageDays: null, staticDays: null } });
  ok(reset.status === 200 && reset.body.page.allowGifs === true && reset.body.page.messageDays === null, "null clears the dials back to the defaults");

  // Retention, in-process on the same DB: an old message in a page with a
  // 5-day clock is purged (files stamped, reactions gone); the attachment
  // sweep honours the page's own image clock.
  const now = Date.now();
  const old = st.createMessage({ channelId: 1, userId: B.id, body: "ancient words" });
  st.db.prepare("UPDATE messages SET createdAt = ? WHERE id = ?").run(now - 10 * 86_400_000, old.id);
  st.db.prepare("INSERT INTO message_reactions (messageId, userId, code, createdAt) VALUES (?, ?, ?, ?)").run(old.id, A.id, c3, now);
  const keep = st.createMessage({ channelId: 1, userId: B.id, body: "fresh words" });
  const noClock = st.purgeOldMessages(now);
  ok(noClock.removed === 0 && st.getMessage(old.id), "with no message clock, nothing is purged");
  st.updatePage(1, { messageDays: 5 });
  const purged = st.purgeOldMessages(now);
  ok(purged.removed === 1 && !st.getMessage(old.id) && st.getMessage(keep.id), "with a 5-day clock the 10-day-old message is gone and the fresh one stays");
  ok(st.db.prepare("SELECT COUNT(*) AS c FROM message_reactions WHERE messageId = ?").get(old.id).c === 0, "…its reactions went with it");
  st.updatePage(1, { messageDays: null });
  const attRow = st.db.prepare("SELECT id FROM attachments WHERE messageId = ? AND scope = 'channel'").get(pngPost.body.message.id);
  st.db.prepare("UPDATE attachments SET createdAt = ? WHERE id = ?").run(now - 3 * 86_400_000, attRow.id);
  const def = st.sweepExpiredAttachments(now, 30, 90).filter((f) => f.file === png.file);
  ok(def.length === 0, "a 3-day-old image is inside the server's 90-day default");
  st.updatePage(1, { staticDays: 2 });
  const exp = st.sweepExpiredAttachments(now, 30, 90).filter((f) => f.file === png.file);
  ok(exp.length === 1, "…and outside the page's own 2-day clock, so it expires");
  st.updatePage(1, { staticDays: null });

  // ======================================================================
  // READ RECEIPTS
  // ======================================================================
  console.log("\n— Read receipts —");
  const optOut = await api("PATCH", "/api/me/prefs", { token: C.token, body: { readReceipts: false } });
  ok(optOut.status === 200 && optOut.body.prefs?.readReceipts === false, "the quiet one turns receipts off");
  const wsA = await socket(A.token);
  const wsB = await socket(B.token);
  await sleep(200);
  const post = await api("POST", "/api/channels/1/messages", { token: A.token, body: { body: "read me" } });
  const mid2 = post.body.message.id;
  const readB = await api("POST", "/api/channels/1/read", { token: B.token });
  ok(readB.status === 200 && readB.body.lastReadId >= mid2, "the buyer reads the channel; the route returns the cursor");
  await sleep(300);
  const cur = wsA.of("read.cursor").find((f) => f.userId === B.id);
  ok(cur && cur.channelId === 1 && cur.lastReadId >= mid2, "the smith's socket hears read.cursor for the buyer");
  const nA = wsA.of("read.cursor").length;
  const readC = await api("POST", "/api/channels/1/read", { token: C.token });
  await sleep(300);
  ok(readC.status === 200 && wsA.of("read.cursor").length === nA, "the quiet one's read emits NO cursor frame");
  const readers = (await api("GET", "/api/channels/1/readers", { token: A.token })).body.readers;
  ok(readers.some((r) => r.userId === B.id && r.lastReadId >= mid2) && !readers.some((r) => r.userId === C.id), "the readers list carries the buyer and not the quiet one");
  // The WhatsApp rule both ways (Oct 2026 review): the quiet one sees nobody's.
  const quietReaders = (await api("GET", "/api/channels/1/readers", { token: C.token })).body.readers;
  ok(Array.isArray(quietReaders) && quietReaders.length === 0, "…and an account that sends no receipts sees none");
  // A re-read that moves nothing tells the page nothing.
  const nB = wsA.of("read.cursor").length;
  await api("POST", "/api/channels/1/read", { token: B.token });
  await sleep(300);
  ok(wsA.of("read.cursor").length === nB, "a re-read with no new message emits no cursor frame");

  // A reaction you no longer own can still come OFF (Oct 2026 review) — the
  // emoji is the price of adding one, never of taking yours back.
  {
    const code = inTier("rare").find((c) => !st.ownsEmoji(B.id, c));
    st.addEmoji(B.id, code);
    const on = await api("POST", `/api/messages/${mid2}/react`, { token: B.token, body: { code } });
    st.removeEmoji(B.id, code);
    const off = await api("POST", `/api/messages/${mid2}/react`, { token: B.token, body: { code } });
    const again = await api("POST", `/api/messages/${mid2}/react`, { token: B.token, body: { code } });
    ok(on.body?.added === true && off.status === 200 && off.body?.added === false, "a reaction comes off after the emoji is sold");
    ok(again.status === 403 && again.body?.error === "unowned_emoji", "…but putting it back on still needs the emoji");
  }

  const conv = (await api("POST", "/api/dm", { token: A.token, body: { userId: B.id } })).body.conversation;
  const dmMsg = (await api("POST", `/api/dm/${conv.id}/messages`, { token: A.token, body: { body: "seen?" } })).body.message;
  const openB = await api("GET", `/api/dm/${conv.id}/messages`, { token: B.token });
  ok(openB.status === 200 && typeof openB.body.theirLastReadId === "number" && openB.body.theirLastReadId >= dmMsg.id, "opening the thread tells the buyer the smith's cursor (a sender has read their own)");
  await sleep(300);
  const dr = wsA.of("dm.read").find((f) => f.conversationId === conv.id && f.userId === B.id);
  ok(dr && dr.lastReadId >= dmMsg.id, "…and the smith's socket hears dm.read from the buyer");
  const openA = await api("GET", `/api/dm/${conv.id}/messages`, { token: A.token });
  ok(openA.body.theirLastReadId >= dmMsg.id, "the smith sees Seen on a fresh open");
  const convC = (await api("POST", "/api/dm", { token: A.token, body: { userId: C.id } })).body.conversation;
  await api("POST", `/api/dm/${convC.id}/messages`, { token: A.token, body: { body: "quiet?" } });
  const nDr = wsA.of("dm.read").length;
  await api("GET", `/api/dm/${convC.id}/messages`, { token: C.token });
  await sleep(300);
  ok(wsA.of("dm.read").length === nDr, "the quiet one's DM read emits nothing");
  const openAC = await api("GET", `/api/dm/${convC.id}/messages`, { token: A.token });
  ok(openAC.body.theirLastReadId === null, "…and their cursor reads null to the smith");
  ok(wsB.of("dm.read").every((f) => f.conversationId === conv.id), "a bystander never hears another pair's dm.read");

  wsA.ws.close();
  wsB.ws.close();
  st.close?.();
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    console.log(`\n${n - bad}/${n} passed`);
    setTimeout(() => process.exit(bad ? 1 : 0), 300);
  });
