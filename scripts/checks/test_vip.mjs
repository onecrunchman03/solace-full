// THE VIP ROOM (Josh, Sep 2026) over a real server on a throwaway port.
//
//  · THE RANK IS A HIGH-WATER MARK stamped by the achievement poke: the last
//    common landing raises users.vipTier to 1, the earner's socket gets the
//    vip.rank frame, Sterling slides the welcome under the door — and losing
//    a common afterwards lowers `live` but never the rank.
//  · Tiers stack: every rare with a hole in the commons is still rank 0.
//  · THE ADMIN IS TIER 4 AT THE DOOR with no stamp (Josh: "give the admin
//    account access to all of these from the start so i can test").
//  · THE COUNTER: a shelf above your rank refuses 403 free; a buy BURNS the
//    price (exact conservation, nobody credited); a repeat is 409 free; the
//    Emporium's own counter refuses the Room's rows and never lists them,
//    even to the admin; the rotation pool is untouched by the new rows.
//  · THE WARDROBE: owning the suit item issues the backrooms_locker row the
//    floor's suit gate trusts (the copper suit walks onto the floor for its
//    owner and is refused to everyone else), and a lost row is re-issued.
//  · THE TITLE equips through the ordinary slot and rides the PublicUser.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { vipRankOf, VIP_MAX, VIP_RANK_NAMES, suitColorOfItem, vipTierOfItem, relicNeed } = require(path.join(ROOT, "dist", "vip.js"));
const { CATALOG, dailyStock, inStockToday } = require(path.join(ROOT, "dist", "emporium.js"));

const PORT = 8509;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "vip-harness");
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
    // THE HERALD's dials, dialled down: an hour → 8s, ten minutes → 1.5s.
    VIP_HERALD_COOLDOWN_MS: "8000", VIP_HERALD_LEAVE_MS: "1500",
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
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `velvet rope brass post ${regSeq} 47`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.81.0.${10 + regSeq}` },
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
const floorClient = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-casino?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws, frames,
      send: (m) => ws.send(JSON.stringify(m)),
      last: (type) => [...frames].reverse().find((f) => f.type === type),
      async waitFor(type, ms = 2500) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { const f = this.last(type); if (f) return f; await sleep(25); }
        return null;
      },
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch { /* junk */ } });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" } })).body?.token;
  ok(!!admin, "admin signed in");
  const A = await register("keeper");
  const B = await register("dabbler");
  ok(!!A.token && !!B.token, "two members registered");

  const st = new Store(DB);
  const coins = (id) => st.getCoins(id);
  const stat = (id, key) => st.db.prepare("SELECT value FROM user_stats WHERE userId = ? AND key = ?").get(id, key)?.value ?? 0;
  const allWallets = () => st.db.prepare("SELECT COALESCE(SUM(coins), 0) AS s FROM users").get().s;
  const mint = (id, amount) => api("POST", "/api/admin/coins", { token: admin, body: { userId: id, amount } });
  const codesIn = (tier) => st.db.prepare("SELECT code FROM emoji WHERE tier = ? ORDER BY code").all(tier).map((r) => r.code);
  const totals = Object.fromEntries(["common", "rare", "legendary", "mythic"].map((t) => [t, codesIn(t).length]));

  // ======================================================================
  // THE RULES (pure)
  // ======================================================================
  console.log("\n— the rules —");
  const P = (c, r, l, m, relics = 20) => [
    { tier: "common", owned: c, total: 565 }, { tier: "rare", owned: r, total: 506 },
    { tier: "legendary", owned: l, total: 72 }, { tier: "mythic", owned: m, total: 20 },
    { tier: "relic", owned: relics, total: 20 },
  ];
  ok(vipRankOf(P(0, 0, 0, 0)) === 0 && vipRankOf(P(564, 506, 72, 20)) === 0, "a hole in the commons is rank 0, whatever sits above it");
  ok(vipRankOf(P(565, 0, 0, 0)) === 1 && vipRankOf(P(565, 505, 72, 20)) === 1, "every common is Tier 1; a hole in the rares stops it there");
  ok(vipRankOf(P(565, 506, 0, 0)) === 2 && vipRankOf(P(565, 506, 72, 0)) === 3 && vipRankOf(P(565, 506, 72, 20)) === 4 && VIP_MAX === 4,
    "the tiers stack to 4 — commons, rares, legendaries, mythics");
  // THE RELICS JOIN THE LADDER (Josh, Sep 2026): 2 · 8 · 14 · all.
  ok(relicNeed(1, 20) === 2 && relicNeed(2, 20) === 8 && relicNeed(3, 20) === 14 && relicNeed(4, 20) === 20 && relicNeed(4, 30) === 30 && relicNeed(0, 20) === 0,
    "the relic rungs are pinned: 2 · 8 · 14 · every relic the maps hold");
  ok(vipRankOf(P(565, 0, 0, 0, 1)) === 0 && vipRankOf(P(565, 0, 0, 0, 2)) === 1, "every common with one relic is still outside; two relics lift the rope");
  ok(vipRankOf(P(565, 506, 72, 20, 7)) === 1 && vipRankOf(P(565, 506, 72, 20, 8)) === 2 && vipRankOf(P(565, 506, 72, 20, 13)) === 2
    && vipRankOf(P(565, 506, 72, 20, 14)) === 3 && vipRankOf(P(565, 506, 72, 20, 19)) === 3 && vipRankOf(P(565, 506, 72, 20, 20)) === 4,
    "a complete collection climbs only as far as its relics: 8 for silver, 14 for gold, all 20 for the mythic shelf");
  ok(vipRankOf(P(565, 506, 72, 20).slice(0, 4)) === 0, "no relic row at all reads as no relics — outside");
  ok(VIP_RANK_NAMES[1] === "Collector" && VIP_RANK_NAMES[4] === "The Complete", "the rank names are pinned");
  ok(suitColorOfItem("suit-vip1-copper") === "copper" && suitColorOfItem("title-vip1-collector") === null && vipTierOfItem("cardback-vip1-copper") === 1,
    "a suit item names its colorway; the tier digit reads out of any VIP id");
  const vipRows = CATALOG.filter((i) => i.vip);
  const kindsOf = (t) => vipRows.filter((i) => i.vip === t).map((i) => i.kind).sort().join();
  ok(kindsOf(1) === "cardback,suit,title" && kindsOf(2) === "cardback,suit,title", "Tiers 1 and 2 each ship a suit, a title and a deck");
  ok(kindsOf(3) === "border,cardback,dice,flair,suit,title", "Tier 3 ships a suit, a title, a border, dice, a flair and a deck");
  ok(kindsOf(4) === "border,cardback,dice,flair,suit,title", "Tier 4 ships the same six, prismatic");
  ok(vipRows.every((i) => i.vip === vipTierOfItem(i.id)), "every VIP id carries its own tier digit");
  const stock = dailyStock();
  ok(vipRows.every((i) => !stock.ids.has(i.id) && !inStockToday(i, stock)), "no VIP row ever joins the rotating shelf");

  // ======================================================================
  // THE DOOR
  // ======================================================================
  console.log("\n— the door —");
  const adm = (await api("GET", "/api/vip", { token: admin })).body;
  ok(adm.rank === 4 && adm.items.every((i) => !i.locked) && st.db.prepare("SELECT vipTier FROM users WHERE isAdmin = 1").get().vipTier === 0,
    "THE ADMIN IS TIER 4 AT THE DOOR — every shelf open, no stamp on the row");
  const fresh = (await api("GET", "/api/vip", { token: A.token })).body;
  ok(fresh.rank === 0 && fresh.live === 0 && fresh.items.every((i) => i.locked && !i.owned), "a fresh member is outside the rope: rank 0, every shelf locked");
  ok(fresh.progress.length === 5 && fresh.progress.slice(0, 4).every((p) => p.owned === 0 && p.total === totals[p.tier]) && fresh.progress[0].tier === "common",
    `the four bars carry the catalog's totals (${totals.common} · ${totals.rare} · ${totals.legendary} · ${totals.mythic})`);
  ok(fresh.progress[4].tier === "relic" && fresh.progress[4].owned === 0 && fresh.progress[4].total === 30
    && JSON.stringify(fresh.relicNeed) === "[0,2,8,14,30]", "…and the fifth row is the relics: none of 30 (three levels), needing 2 · 8 · 14 · 30 by rung");
  // A LATER LEVEL COUNTS ONCE MEMBERS MAY ENTER IT (Nov 2026 validation run)
  st.brSetFlag("level3_open_to_members", null, "harness");
  const gated = (await api("GET", "/api/vip", { token: A.token })).body;
  st.brClearFlag("level3_open_to_members");
  const ungated = (await api("GET", "/api/vip", { token: A.token })).body;
  ok(gated.progress[4].total === 40 && gated.relicNeed[4] === 40 && ungated.progress[4].total === 30,
    `the Station's gate open to members, its ten relics join the bar (${gated.progress[4].total}); shut again, ${ungated.progress[4].total}`);
  await mint(A.id, 5000);
  await mint(B.id, 5000);
  const before = allWallets();
  const locked = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "suit-vip1-copper" } });
  ok(locked.status === 403 && locked.body.error === "vip_locked" && locked.body.tier === 1 && coins(A.id) === 5000 && !st.ownsItem(A.id, "suit-vip1-copper"),
    "a shelf above your rank refuses 403, free");
  const viaEmporium = await api("POST", "/api/emporium/buy", { token: admin, body: { itemId: "title-vip1-collector" } });
  ok(viaEmporium.status === 403 && viaEmporium.body.error === "vip_room", "the Emporium's own counter refuses the Room's rows, even to the admin");
  // Oct 2026 review: award-only items went through the admin's stock bypass
  // for 1 silver (The Pandoran among them), and a drink named after an
  // Object.prototype key reached spendCoins as a function.
  const award = await api("POST", "/api/emporium/buy", { token: admin, body: { itemId: "title-thearchive" } });
  ok(award.status === 403 && award.body.error === "award_only", `an award-only item is never sold, not even to the admin (${award.status} ${award.body.error})`);
  const proto = await api("POST", "/api/shop/drink", { token: admin, body: { drink: "constructor" } });
  ok(proto.status === 400, `a drink called "constructor" is no drink (${proto.status})`);
  const empA = (await api("GET", "/api/emporium", { token: A.token })).body.items.map((i) => i.id);
  const empAdm = (await api("GET", "/api/emporium", { token: admin })).body.items.map((i) => i.id);
  ok(!empA.some((id) => /-vip\d-/.test(id)) && !empAdm.some((id) => /-vip\d-/.test(id)) && empAdm.length > empA.length,
    "the Room's rows are absent from the Emporium listing for members AND the admin's full catalog");

  // the rares alone open nothing
  for (const c of codesIn("rare")) st.db.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(B.id, c, Date.now());
  const rareOnly = (await api("GET", "/api/vip", { token: B.token })).body;
  ok(rareOnly.rank === 0 && rareOnly.live === 0 && rareOnly.progress[1].owned === totals.rare, "every rare with a hole in the commons is still rank 0 — the tiers stack");

  // ======================================================================
  // THE ROPE LIFTS
  // ======================================================================
  console.log("\n— the rope lifts —");
  const wsA = await socket(A.token);
  await sleep(300);
  const commons = codesIn("common");
  for (const c of commons.slice(0, -1)) st.db.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(A.id, c, Date.now());
  const almost = (await api("GET", "/api/vip", { token: A.token })).body;
  ok(almost.rank === 0 && almost.progress[0].owned === totals.common - 1, "one common short: still outside");
  // …and the relics: one is not enough, two is the rung.
  ok(st.brUnlockRelic(A.id, "alien-tech") && !st.brUnlockRelic(A.id, "alien-tech"), "a relic unlocks once (the second is ignored)");
  st.addEmoji(A.id, commons[commons.length - 1]);
  ok((await api("GET", `/api/users/${A.id}/profile`, { token: B.token })).status === 200 && (await sleep(300), true)
    && st.db.prepare("SELECT vipTier FROM users WHERE id = ?").get(A.id).vipTier === 0
    && (await api("GET", "/api/vip", { token: A.token })).body.progress[4].owned === 1,
    "every common with ONE relic: still outside, the relic bar reads 1");
  st.db.prepare("DELETE FROM user_emoji WHERE userId = ? AND code = ?").run(A.id, commons[commons.length - 1]);
  ok(st.brUnlockRelic(A.id, "blue-crystal"), "…the second relic lands");
  // The stamp rides the achievement engine: the poke on addEmoji in-process,
  // and checkStats on login + every profile view (the RETROACTIVE path). A
  // second connection can't poke the server's engine, so the last common
  // lands here and a profile view runs the check — the same function.
  ok(st.addEmoji(A.id, commons[commons.length - 1]), "…the last common lands");
  ok((await api("GET", `/api/users/${A.id}/profile`, { token: B.token })).status === 200, "somebody opens the profile — the check runs");
  await sleep(400);
  ok(st.db.prepare("SELECT vipTier FROM users WHERE id = ?").get(A.id).vipTier === 1, "THE STAMP: users.vipTier is 1");
  const rankFrame = wsA.of("vip.rank");
  ok(rankFrame.length === 1 && rankFrame[0].rank === 1, "the earner's socket got exactly one vip.rank frame");
  const dm = wsA.of("dm.message").find((f) => /Collector|rope/i.test(f.message?.body ?? ""));
  ok(!!dm, "Sterling slid the welcome under the door");
  const opened = (await api("GET", "/api/vip", { token: A.token })).body;
  ok(opened.rank === 1 && opened.live === 1 && opened.items.every((i) => i.tier === 1 ? !i.locked : i.locked), "GET /api/vip: rank 1, the copper shelf open, the silver shelf still glass");
  const silver = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "suit-vip2-sterling" } });
  ok(silver.status === 403 && silver.body.error === "vip_locked" && silver.body.tier === 2, "a Collector is refused the silver shelf");
  const me = (await api("GET", "/api/me", { token: A.token })).body;
  ok(me.user?.vipTier === 1 || me.vipTier === 1, "the self view carries the rank");

  // ======================================================================
  // THE COUNTER
  // ======================================================================
  console.log("\n— the counter —");
  const suitPrice = CATALOG.find((i) => i.id === "suit-vip1-copper").price;
  const pool0 = allWallets();
  const buy = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "suit-vip1-copper" } });
  ok(buy.status === 200 && buy.body.coins === 5000 - suitPrice && st.ownsItem(A.id, "suit-vip1-copper"), `the copper suit sells for ${suitPrice}`);
  ok(allWallets() === pool0 - suitPrice, "THE SILVER BURNS: the world's wallets fell by exactly the price, nobody credited");
  const again = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "suit-vip1-copper" } });
  ok(again.status === 409 && again.body.error === "already_owned" && coins(A.id) === 5000 - suitPrice, "a repeat buy is 409, free");
  const locker = st.db.prepare("SELECT COUNT(*) AS n FROM backrooms_locker WHERE userId = ? AND kind = 'suit' AND color = 'copper'").get(A.id).n;
  ok(locker === 1, "THE WARDROBE: the buy issued the locker's copper suit row");
  st.db.prepare("UPDATE users SET coins = 0 WHERE id = ?").run(A.id);
  const broke = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "title-vip1-collector" } });
  ok(broke.status === 402 && broke.body.error === "insufficient" && !st.ownsItem(A.id, "title-vip1-collector"), "a broke member is refused 402, free");
  await mint(A.id, 2000);
  const title = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "title-vip1-collector" } });
  ok(title.status === 200 && st.ownsItem(A.id, "title-vip1-collector"), "the Collector title sells");
  const eq = await api("POST", "/api/emporium/equip", { token: A.token, body: { slot: "title", itemId: "title-vip1-collector" } });
  ok(eq.status === 200 && eq.body.cosmetics?.title === "title-vip1-collector", "…and equips through the ordinary title slot");
  const roster = (await api("GET", "/api/users", { token: B.token })).body;
  const rowA = (Array.isArray(roster) ? roster : roster.users ?? []).find((u) => u.id === A.id);
  ok(rowA?.cosmetics?.title === "title-vip1-collector" && rowA?.vipTier === 1, "the roster shows the title and the rank on the PublicUser");
  ok(st.db.prepare("SELECT value FROM user_stats WHERE userId = ? AND key = 'vip_bought'").get(A.id)?.value === 2, "vip_bought counts the two purchases");
  const notVip = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "title-heir" } });
  ok(notVip.status === 404, "an ordinary Emporium row is not sold at this counter");

  // ======================================================================
  // THE HIGH-WATER MARK
  // ======================================================================
  console.log("\n— the high-water mark —");
  st.removeEmoji(A.id, commons[0]);
  const afterSale = (await api("GET", "/api/vip", { token: A.token })).body;
  ok(afterSale.rank === 1 && afterSale.live === 0 && afterSale.progress[0].owned === totals.common - 1,
    "losing a common lowers `live` to 0 but the RANK stays 1 — the Room is never taken back");
  const stillOpen = await api("POST", "/api/vip/buy", { token: A.token, body: { itemId: "cardback-vip1-copper" } });
  ok(stillOpen.status === 200, "…and the copper shelf still sells");

  // ======================================================================
  // THE SUIT ON THE FLOOR
  // ======================================================================
  console.log("\n— the suit on the floor —");
  st.db.prepare("DELETE FROM backrooms_locker WHERE userId = ? AND color = 'copper'").run(A.id);
  const meBr = (await api("GET", "/api/backrooms/me", { token: A.token })).body;
  ok(meBr.items.some((i) => i.kind === "suit" && i.color === "copper"), "a lost copper suit is re-issued to the locker on the next visit");
  const lockerRow = meBr.items.find((i) => i.kind === "suit" && i.color === "copper");
  const coinsBefore = meBr.coins;
  const sellSuit = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: lockerRow.id } });
  const meAfter = (await api("GET", "/api/backrooms/me", { token: A.token })).body;
  ok(sellSuit.status === 400 && sellSuit.body.error === "unsellable" &&
     typeof coinsBefore === "number" && meAfter.coins === coinsBefore &&
     meAfter.items.some((i) => i.id === lockerRow.id),
    "THE SILVER FAUCET IS SHUT: a Room suit can't be sold to Voss (it would be re-issued free) — refused, no silver, the row stays");
  const fa = await floorClient(A.token);
  fa.send({ type: "enter", suit: "copper" });
  const wa = await fa.waitFor("welcome");
  ok(!!wa && !fa.last("denied"), "the owner walks onto the floor in copper");
  const fb = await floorClient(B.token);
  fb.send({ type: "enter", suit: "copper" });
  const wb = await fb.waitFor("welcome");
  ok(wb?.you?.suit === "yellow" && !fb.last("denied"), "…and a non-owner walks in yellow, not in the colorway");
  fa.ws.close(); fb.ws.close();

  // ======================================================================
  // THE HERALD — a Magnate's formal entrance, The Complete's grand praise
  // ======================================================================
  console.log("\n— the herald —");
  const M = await register("magnate");
  const Z = await register("complete");
  st.db.prepare("UPDATE users SET vipTier = 3 WHERE id = ?").run(M.id);
  st.db.prepare("UPDATE users SET vipTier = 4 WHERE id = ?").run(Z.id);
  const bot = st.db.prepare("SELECT id FROM users WHERE isBot = 1").get().id;
  const wsB = await socket(B.token); // the bystander who reads #general
  await sleep(300);
  const sterlingSaid = () => wsB.of("message").filter((f) => f.message?.userId === bot).map((f) => String(f.message.body));
  const said0 = sterlingSaid().length;
  const wsM = await socket(M.token);
  await sleep(700);
  const inLines = sterlingSaid().slice(said0);
  ok(inLines.length === 1 && /Magnate/.test(inLines[0]) && /magnate/.test(inLines[0]), "a Magnate's first socket: Sterling posts the formal entrance in #general, naming them");
  const wsM2 = await socket(M.token);
  await sleep(500);
  ok(sterlingSaid().length === said0 + 1, "a second tab inside the cooldown adds nothing");
  wsM2.ws.close();
  await sleep(300);
  ok(sterlingSaid().length === said0 + 1, "…and closing one of two tabs says nothing either (they're still here)");
  wsM.ws.close();
  await sleep(600);
  ok(sterlingSaid().length === said0 + 1, "gone for less than the leave window: silence");
  await sleep(1400);
  const outLines = sterlingSaid().slice(said0 + 1);
  ok(outLines.length === 1 && /left|departs|gone/.test(outLines[0]) && /magnate/.test(outLines[0]), "…past it, the departure line");
  const wsM3 = await socket(M.token);
  await sleep(500);
  ok(sterlingSaid().length === said0 + 2, "back inside the hour: no second entrance (the cooldown is persisted in app_kv)");
  wsM3.ws.close();
  ok(st.kvGet(`vip_herald:${M.id}`) !== null, "…the stamp lives in app_kv, so a restart can't re-announce everyone");
  const beforeZ = sterlingSaid().length;
  const fanfaresBefore = wsB.of("vip.fanfare").length;
  const wsZ = await socket(Z.token);
  await sleep(700);
  const zLines = sterlingSaid().slice(beforeZ);
  ok(zLines.length === 1 && /The Complete/i.test(zLines[0]) && /complete/.test(zLines[0]), "The Complete's arrival: grand praise, in #general");
  ok(wsB.of("vip.fanfare").length === fanfaresBefore + 1 && wsB.of("vip.fanfare").at(-1).rank === 4, "…and the bells — a vip.fanfare frame reaches the bystander");
  wsZ.ws.close();
  const beforeAdm = sterlingSaid().length;
  const wsAdm = await socket(admin);
  await sleep(700);
  const admLines = sterlingSaid().slice(beforeAdm);
  ok(admLines.length === 0, "THE HOUSE DOESN'T ANNOUNCE ITSELF: the admin reads Tier 4 at the door but the herald stays quiet for the operator (Josh: it would take away from the players' experience)");
  wsAdm.ws.close();
  const beforeA = sterlingSaid().length;
  const wsA2 = await socket(A.token);
  await sleep(600);
  ok(sterlingSaid().length === beforeA, "a Collector comes and goes unannounced");
  wsA2.ws.close();
  await sleep(2000); // let the Complete's departure line land before the server stops
  wsB.ws.close();

  // ======================================================================
  // THE PERKS — with the rank, not from the shelf
  // ======================================================================
  console.log("\n— the perks —");
  const { DRINK_PRICES, SLORP_PRICE, STARDUST_PRICE, EGO_PRICE } = require(path.join(ROOT, "dist", "shop.js"));
  const { interestFor } = require(path.join(ROOT, "dist", "lender.js"));
  const vault = () => st.db.prepare("SELECT silver FROM goblin_vault WHERE id = 1").get().silver;
  const shopM = (await api("GET", "/api/shop", { token: M.token })).body;
  ok(shopM.drinkPrices.beer === DRINK_PRICES.beer && shopM.slorpPrice === SLORP_PRICE && shopM.vipPerks === false, "a Magnate pays the bar's ordinary prices");
  const shopZ = (await api("GET", "/api/shop", { token: Z.token })).body;
  ok(Object.values(shopZ.drinkPrices).every((p) => p === 0) && shopZ.slorpPrice === Math.floor(SLORP_PRICE / 2) && shopZ.stardustPrice === Math.floor(STARDUST_PRICE / 2) && shopZ.egoPrice === Math.floor(EGO_PRICE / 2) && shopZ.vipPerks === true,
    "The Complete's price tags: every drink 0, the vial, canister and shot at half");
  await mint(Z.id, 4000);
  const z0 = coins(Z.id);
  const drink = await api("POST", "/api/shop/drink", { token: Z.token, body: { drink: "champagne" } });
  ok(drink.status === 200 && coins(Z.id) === z0, "…a champagne is poured and nothing leaves the purse");
  const slorp = await api("POST", "/api/shop/slorp", { token: Z.token });
  ok(slorp.status === 200 && coins(Z.id) === z0 - Math.floor(SLORP_PRICE / 2), "…and the vial charges exactly half");
  const drinkM = await api("POST", "/api/shop/drink", { token: M.token, body: { drink: "beer" } });
  ok(drinkM.status === 402 || (drinkM.status === 200 && drinkM.body.coins === coins(M.id)), "a Magnate is charged (or refused broke) like anyone");

  // THE HOUSE PAYS. Z borrows, the house settles, the goblins are paid in full.
  await mint(Z.id, 20000);
  const borrow = await api("POST", "/api/lender/borrow", { token: Z.token, body: { amount: 1000 } });
  ok(borrow.status === 200 && !!st.loanOf(Z.id), "The Complete takes a 1,000 loan");
  const lockedM = await api("POST", "/api/vip/consolidate", { token: M.token });
  ok(lockedM.status === 403 && lockedM.body.error === "vip_locked", "a Magnate asking the house to settle is refused 403");
  const fresh2 = await api("POST", "/api/vip/consolidate", { token: Z.token });
  ok(fresh2.status === 409 && fresh2.body.error === "not_in_trouble" && !!st.loanOf(Z.id), "a loan taken a minute ago is NOT the house's to settle (no windfall)");
  st.db.prepare("UPDATE loans SET missed = 1 WHERE userId = ?").run(Z.id); // a missed day: MARKED
  const lz = st.loanOf(Z.id);
  const payoff = lz.principal; // lastDay is today (the borrow stamped it) — no interest is due
  // THE MEMBER PAYS FIRST (Oct 2026): a wallet that covers the debt is told
  // to pay it, and silver parked on a table is refused until it comes home.
  const canPay = await api("POST", "/api/vip/consolidate", { token: Z.token });
  ok(canPay.status === 409 && canPay.body.error === "can_pay" && !!st.loanOf(Z.id), "a member whose wallet covers the debt is told to clear it themselves — nothing charged, the perk unspent");
  const PART = 300;
  st.db.prepare("UPDATE users SET coins = ? WHERE id = ?").run(PART, Z.id);
  st.db.prepare("INSERT INTO roulette_bets (userId, kind, target, amount, at) VALUES (?, 'red', NULL, 5000, ?)").run(Z.id, Date.now());
  const parked = await api("POST", "/api/vip/consolidate", { token: Z.token });
  ok(parked.status === 409 && parked.body.error === "escrow_open" && !!st.loanOf(Z.id) && coins(Z.id) === PART, "silver parked on a table is NOT 'can't pay': refused until it comes home, the wallet untouched");
  st.db.prepare("DELETE FROM roulette_bets WHERE userId = ?").run(Z.id);
  const vault0 = vault(), world0 = allWallets() + vault0;
  const cons = await api("POST", "/api/vip/consolidate", { token: Z.token });
  ok(cons.status === 200 && cons.body.fromWallet === PART && cons.body.paid === payoff - PART && cons.body.released === false, `THE HOUSE PAYS the rest: the member's ${PART} first, the house the other ${payoff - PART} — and no interest for a day already stamped`);
  ok(stat(Z.id, "loans_repaid") === 0, "…and it is not credited as a loan the member repaid");
  ok(!st.loanOf(Z.id) && coins(Z.id) === 0, "…the loan row is gone and the member's wallet went in first");
  ok(vault() === vault0 + payoff, "…the goblins were PAID, in full, into the vault");
  ok(allWallets() + vault() === world0 + (payoff - PART) && st.economyTotals().houseMints === payoff - PART, "…a house MINT of exactly the shortfall, carried by the audit as houseMints");
  const again2 = await api("POST", "/api/vip/consolidate", { token: Z.token });
  ok(again2.status === 409 && again2.body.error === "already_used", "once a life: a second ask is refused");
  const noLoanW = await register("walker");
  st.db.prepare("UPDATE users SET vipTier = 4 WHERE id = ?").run(noLoanW.id);
  const nothing = await api("POST", "/api/vip/consolidate", { token: noLoanW.token });
  ok(nothing.status === 404 && nothing.body.error === "no_loan", "nothing owed: 404, nothing recorded");
  // FROM THE CELL: W borrows, the goblins take them (staged by hand), the
  // house settles from inside and the door opens.
  await mint(noLoanW.id, 20000);
  ok((await api("POST", "/api/lender/borrow", { token: noLoanW.token, body: { amount: 1000 } })).status === 200, "the walker borrows 1,000");
  const now = Date.now();
  st.db.prepare("UPDATE users SET jailedAt = ?, jailSealsAt = ?, disabled = 1 WHERE id = ?").run(now, now + 48 * 3_600_000, noLoanW.id);
  st.db.prepare("UPDATE loans SET missed = 5, lastDay = '2000-01-01' WHERE userId = ?").run(noLoanW.id); // a day owed
  st.db.prepare("UPDATE users SET coins = 0 WHERE id = ?").run(noLoanW.id); // the collectors took the purse
  ok((await api("GET", "/api/cell", { token: noLoanW.token })).status === 200 && (await api("GET", "/api/me", { token: noLoanW.token })).status !== 200, "…and sits in the cell: the jail door answers, the ordinary door refuses");
  const vaultW = vault();
  const cellCons = await api("POST", "/api/cell/consolidate", { token: noLoanW.token });
  ok(cellCons.status === 200 && cellCons.body.released === true, "THE HOUSE PAYS FROM INSIDE: settled and released");
  const wRow = st.db.prepare("SELECT jailedAt, disabled FROM users WHERE id = ?").get(noLoanW.id);
  ok(!wRow.jailedAt && !wRow.disabled && !st.loanOf(noLoanW.id) && vault() === vaultW + cellCons.body.paid, "…they walk, owing nothing, and the goblins hold the silver");
  ok(cellCons.body.paid > 1000, "…a day owed (lastDay in the past) was paid WITH its interest");
  ok(st.db.prepare("PRAGMA table_info(economy_snapshots)").all().some((c) => c.name === "houseMints"), "migration 95: the daily snapshot carries the houseMints column for the drift check");
  ok((await api("GET", "/api/me", { token: noLoanW.token })).status === 200, "…and the ordinary door opens again");
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM vip_consolidations").get().n === 2, "migration 93's ledger holds exactly the two settlements");

  wsA.ws.close();
  st.close?.();
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    console.log(`\n${n - bad}/${n} passed`);
    setTimeout(() => process.exit(bad ? 1 : 0), 300);
  });
