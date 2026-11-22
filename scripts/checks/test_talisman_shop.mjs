// STERLING'S TALISMAN COUNTER — the silver→shield money path (Aug 2026).
//
// Run:  npm run build && node scripts/checks/test_talisman_shop.mjs
//
// Drives a REAL server on a throwaway port. This is a money path, so it gets
// the treatment money paths get here: every guard from both sides, exact coin
// conservation, and proof that the new sink cannot become a faucet.
//
// What it pins down:
//   · the price is on the wire, and so is whether you're already shielded
//   · you cannot buy it without the silver (402, and NOTHING moves)
//   · a purchase burns EXACTLY the price and grants EXACTLY one talisman
//   · a second purchase is refused (409) and costs nothing — no double-spend
//   · the shield is UNSELLABLE, so the price can never be recovered: this is a
//     sink in both directions
//   · the coins are burned, not paid to the house — no other wallet moves
//   · the mythic-sacrifice route still works and still refuses the shielded
//
// THE TWO OFFERS (Sep 2026, the round after THE REAPER'S PATIENCE repriced
// the shield 100,000 -> 30,000). Sterling can now cut the price two ways and
// this pins both, because a discount's whole failure mode is a price tag that
// promises what the till doesn't honour:
//   · the PURE rule — `shieldPrice` takes the KINDEST offer, never the
//     product, and clamps nonsense in both directions
//   · THE COURTESY — the admin lever refuses a shielded or still-in-grace
//     target, `force` skips the once-a-week gap and ONLY that, the letter
//     quotes the price it will charge, the offer is personal (nobody else's
//     price moves), the till charges it, and the purchase SPENDS it so one
//     red gauge can't buy cheap shields for 48 hours
//   · THE SHIELD SALE — the house-wide special cuts everyone's counter, and
//     a courtesy sitting under a live sale wins without compounding
//   · a discounted shield is no more sellable than a full-price one

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8496;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "talisman-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} };
process.on("exit", stop);

const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin signed in");
  const a = await register("tallytester", pw);
  const b = await register("bystander", pw);
  ok(!!a.token && !!b.token, "two members registered");

  const mint = (id, amount) => api("POST", "/api/admin/coins", { token: admin, body: { userId: id, amount } });
  const shop = async (token) => (await api("GET", "/api/shop", { token })).body;
  const buy = (token) => api("POST", "/api/shop/talisman-silver", { token });
  const inv = async (token) => (await api("GET", "/api/inventory", { token })).body;

  // ---- the price board ----------------------------------------------------
  const s0 = await shop(a.token);
  const PRICE = s0.talismanPrice;
  // Pinned rather than read-and-shrug: this number is the entire scarcity
  // control on the death shield. It has been set twice, for two different
  // products — 5,000 -> 100,000 when the talisman was near-permanent
  // insurance under the flat fire rate, then 100,000 -> 30,000 (Sep 2026)
  // once THE REAPER'S PATIENCE turned it into a consumable that burns every
  // ~64 spins. See TALISMAN_PRICE's comment for the arithmetic.
  ok(PRICE === 30_000, `the counter quotes ${PRICE} silver`);
  ok(s0.talismanBasePrice === 30_000, "…and names the undiscounted price too");
  ok(s0.shieldOffer === null, "…with no offer standing for a fresh member");
  ok(s0.hasTalisman === false, "a new member is unshielded on the wire");
  ok(s0.coins === 0, "…and starts with nothing");

  // ---- the pure rule: two offers, the kindest, never the product ----------
  const { shieldPrice, TALISMAN_PRICE, SHIELD_OFFER_CUT, SHIELD_SALE_PCT } =
    await import("file://" + path.join(ROOT, "dist", "shop.js").replace(/\\/g, "/"));
  ok(TALISMAN_PRICE === PRICE, "the wire quotes the module's own constant");
  ok(shieldPrice(30_000, 0, 0) === 30_000, "no offer leaves the price alone");
  ok(shieldPrice(30_000, 0.4, 0) === 18_000, "Sterling's courtesy takes 40% off");
  ok(shieldPrice(30_000, 0, 30) === 21_000, "a shield sale takes 30% off");
  // The one that matters: stacking a 40% courtesy under a 30% sale would put
  // a life-saving item at 58% off on a coincidence.
  ok(shieldPrice(30_000, 0.4, 30) === 18_000, "both at once takes the BETTER, not the product");
  ok(shieldPrice(30_000, 0.1, 30) === 21_000, "…whichever way round it is");
  ok(shieldPrice(30_000, 5, 0) === 3_000, "a nonsense cut is clamped to 90% off, never free");
  ok(shieldPrice(30_000, -1, 0) === 30_000, "…and a negative one never RAISES the price");
  ok(SHIELD_OFFER_CUT === 0.4 && SHIELD_SALE_PCT === 30, "the two dials are where the docs say");

  // ---- you cannot buy what you cannot afford ------------------------------
  await mint(a.id, PRICE - 1);
  const poor = await buy(a.token);
  ok(poor.status === 402, "one silver short is refused with 402");
  ok(poor.body?.error === "insufficient", "…and says why");
  const afterPoor = await shop(a.token);
  ok(afterPoor.coins === PRICE - 1, "a refused purchase moves NO coins");
  ok(afterPoor.hasTalisman === false, "…and grants no shield");
  const invPoor = await inv(a.token);
  ok(!(invPoor.emoji ?? []).some((e) => e.tier === "talisman"), "…nothing landed in the inventory either");

  // ---- the purchase -------------------------------------------------------
  await mint(a.id, 1); // exactly enough, to the coin
  const bystanderBefore = (await shop(b.token)).coins;
  const rich = await shop(a.token);
  ok(rich.coins === PRICE, "funded to exactly the price");
  // A TAG THAT WENT UP IS ASKED ABOUT (Oct 2026): a page still showing a
  // lapsed sale price is refused, free, and told the new figure.
  const lapsed = await api("POST", "/api/shop/talisman-silver", { token: a.token, body: { expect: PRICE - 9_000 } });
  ok(lapsed.status === 409 && lapsed.body?.error === "price_changed" && lapsed.body?.price === PRICE,
    "a page showing a lapsed discount is refused 409 price_changed with the real price");
  ok((await shop(a.token)).coins === PRICE && !(await shop(a.token)).hasTalisman, "…and nothing was charged");
  const bought = await api("POST", "/api/shop/talisman-silver", { token: a.token, body: { expect: PRICE } });
  ok(bought.status === 200, "the purchase goes through");
  ok(bought.body?.coins === 0, "the response carries the new balance");
  const after = await shop(a.token);
  ok(after.coins === 0, `exactly ${PRICE} left the wallet`);
  ok(after.hasTalisman === true, "the wire now reports you shielded");
  const invAfter = await inv(a.token);
  const shields = (invAfter.emoji ?? []).filter((e) => e.tier === "talisman");
  ok(shields.length === 1, "EXACTLY one talisman was granted");

  // ---- burned, not paid ---------------------------------------------------
  ok((await shop(b.token)).coins === bystanderBefore, "no other wallet gained the silver — it burned");

  // ---- no double-spend ----------------------------------------------------
  await mint(a.id, PRICE);
  const again = await buy(a.token);
  ok(again.status === 409, "a second purchase is refused with 409");
  ok(again.body?.error === "already_shielded", "…because you already carry one");
  const afterAgain = await shop(a.token);
  ok(afterAgain.coins === PRICE, "…and the refusal cost nothing");
  ok(((await inv(a.token)).emoji ?? []).filter((e) => e.tier === "talisman").length === 1,
    "…and did not stack a second shield");

  // ---- the sink cannot be reversed ----------------------------------------
  const sellBack = await api("POST", "/api/shop/sell", { token: a.token, body: { codes: [shields[0].code] } });
  ok(sellBack.status === 400, "the Trader refuses to buy the talisman back");
  ok((await shop(a.token)).coins === PRICE, "…so the silver stays spent");
  ok(((await inv(a.token)).emoji ?? []).filter((e) => e.tier === "talisman").length === 1,
    "…and the shield is still yours");

  // ---- the OTHER route is untouched ---------------------------------------
  const mythicSac = await api("POST", "/api/shop/talisman", { token: a.token, body: { code: "nope" } });
  ok(mythicSac.status === 400, "the mythic sacrifice still validates its code");
  const c = await register("shieldless", pw);
  const noMythic = await api("POST", "/api/shop/talisman", { token: c.token, body: { code: shields[0].code } });
  ok(noMythic.status === 400 && noMythic.body?.error === "not_mythic",
    "…and still refuses a non-mythic sacrifice");

  // ---- THE TOP SHELF: a mythic for a season's silver -----------------------
  const buyMythic = (token) => api("POST", "/api/shop/mythic", { token });
  const MYTHIC = (await shop(a.token)).talismanPrice ? (await shop(a.token)).mythicPrice : 0;
  ok(MYTHIC === 500_000, `the top shelf quotes ${MYTHIC} silver`);
  const brokeM = await buyMythic(a.token);
  ok(brokeM.status === 402, "a mythic you can't afford is refused with 402");
  const beforeM = await shop(a.token);
  const mythsBefore = ((await inv(a.token)).emoji ?? []).filter((e) => e.tier === "mythic").length;
  ok(mythsBefore === 0, "…and none arrived");
  await mint(a.id, MYTHIC - beforeM.coins);
  const gotM = await buyMythic(a.token);
  ok(gotM.status === 200, "with the silver, the top shelf opens");
  ok(gotM.body?.emoji?.tier === "mythic", `…and hands over a mythic (${gotM.body?.emoji?.name})`);
  ok((await shop(a.token)).coins === 0, `exactly ${MYTHIC} left the wallet`);
  const myths = ((await inv(a.token)).emoji ?? []).filter((e) => e.tier === "mythic");
  ok(myths.length === 1, "EXACTLY one mythic was granted");
  ok(myths[0].code === gotM.body.emoji.code, "…the one the response named");
  ok((await shop(b.token)).coins === bystanderBefore, "no other wallet gained the price — it burned");
  const sellMythic = await api("POST", "/api/shop/sell", { token: a.token, body: { codes: [myths[0].code] } });
  ok(sellMythic.status === 400, "the Trader won't buy a mythic back — the sink can't be reversed");
  // never a duplicate: buy the rest of the tier and watch it refuse cleanly
  // enough for the WHOLE tier (20 mythics) — the refusal we want is
  // "you own them all", not "you ran out of silver"
  const FLOAT = 25_000_000; // 20 mythics at 500,000, with room to spare
  for (let i = 0; i < 25; i++) await mint(a.id, 1_000_000);
  const codes = new Set(myths.map((m) => m.code));
  let dupes = 0, refusal = null;
  for (let i = 0; i < 25; i++) {
    const r = await buyMythic(a.token);
    if (r.status !== 200) { refusal = r; break; }
    if (codes.has(r.body.emoji.code)) dupes++;
    codes.add(r.body.emoji.code);
  }
  ok(dupes === 0, `never the same mythic twice (${codes.size} distinct)`);
  ok(refusal?.status === 409 && refusal.body?.error === "owns_all_mythics",
    "…and the shelf refuses once you own them all, rather than charging for nothing");
  const spentAll = (await shop(a.token)).coins;
  ok(spentAll === FLOAT - (codes.size - 1) * MYTHIC, "…charging exactly once per mythic handed over");

  // ---- STERLING'S COURTESY: the house notices a red gauge -----------------
  // The goblins already write to somebody whose gauge is red, to sell them
  // debt. This is the house's answer: money off the shield, by DM, to the
  // person actually in danger. The lever is admin-only and cannot invent
  // danger — it refuses a shielded or still-in-grace target.
  const { DatabaseSync } = await import("node:sqlite");
  const peek = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const setBare = (id, nSpins) =>
    peek.prepare("UPDATE users SET bareSpins = ? WHERE id = ?").run(nSpins, id);
  const courtesy = (id, force = false) =>
    api("POST", "/api/admin/sterling/shield", { token: admin, body: { userId: id, force } });

  const d = await register("redgauge", pw);
  const e = await register("safeandsound", pw);

  // Refused while the gauge is green — a courtesy is for real danger.
  ok((await courtesy(e.id)).body?.error === "not_in_danger",
    "a member still inside the grace is refused the courtesy");
  ok((await shop(e.token)).shieldOffer === null, "…and gets no discount");

  setBare(d.id, 70); // past REAPER_GRACE (55): the gauge is red
  const sent = await courtesy(d.id);
  ok(sent.status === 200, "a member past the grace gets the courtesy");
  ok(sent.body?.offer?.price === 18_000, "…at 40% off, 18,000 silver");
  ok(/18,000/.test(sent.body?.letter ?? ""), "…and the letter quotes the price it will charge");
  ok(/70/.test(sent.body?.letter ?? ""), "…and names how many bare spins they're on");

  // It arrives as a real DM from Sterling, through the ordinary pipeline.
  const dms = (await api("GET", "/api/dm", { token: d.token })).body;
  ok((dms?.conversations ?? dms ?? []).length >= 1, "the courtesy lands as a DM");

  const dShop = await shop(d.token);
  ok(dShop.talismanPrice === 18_000, "the counter now quotes THEM 18,000");
  ok(dShop.talismanBasePrice === 30_000, "…against 30,000 on the board");
  ok(dShop.shieldOffer?.kind === "courtesy", "…named as Sterling's courtesy");
  ok(dShop.shieldOffer?.pct === 40, "…at the right percentage");
  ok(dShop.shieldOffer?.until > Date.now(), "…with a live 48h window");
  ok((await shop(e.token)).talismanPrice === 30_000,
    "a personal courtesy does NOT cut anyone else's price");

  // A second courtesy inside the week is refused; force skips only the gap.
  ok((await courtesy(d.id)).body?.error === "offer_open", "a standing offer isn't reissued");
  ok((await courtesy(999_999)).status === 404, "the lever 404s on a stranger");

  // THE TILL HONOURS THE TAG — and the courtesy is spent by the purchase.
  await mint(d.id, 17_999);
  const shortD = await buy(d.token);
  ok(shortD.status === 402, "one silver short of the DISCOUNTED price is still refused");
  await mint(d.id, 1);
  const bystanderBefore2 = (await shop(b.token)).coins;
  const boughtD = await buy(d.token);
  ok(boughtD.status === 200, "…and the discounted purchase goes through");
  ok(boughtD.body?.paid === 18_000, "…charging exactly the offered price");
  const afterD = await shop(d.token);
  ok(afterD.coins === 0, "exactly 18,000 left the wallet — not the full 30,000");
  ok(afterD.hasTalisman === true, "…and the shield landed");
  ok((await shop(b.token)).coins === bystanderBefore2, "…burned, not paid to anyone");
  ok(afterD.shieldOffer === null, "the courtesy is SPENT by the purchase it paid for");

  // Spent means spent: strip the shield and the price is back to full.
  peek.prepare("DELETE FROM user_emoji WHERE userId = ? AND code = 'talisman'").run(d.id);
  const afterSpend = await shop(d.token);
  ok(afterSpend.hasTalisman === false, "…(shield removed for the next assert)");
  ok(afterSpend.talismanPrice === 30_000,
    "a spent courtesy cannot buy a second cheap shield inside its 48 hours");

  // An EXPIRED offer reads as no offer at all. (Accounts are REUSED from here
  // on: /api/register is rate-limited to 5/hour/IP, and a harness that mints
  // a fresh member per assert starts failing on the sixth — the documented
  // trap test_lender hit in its round two.)
  setBare(e.id, 90);
  await courtesy(e.id);
  ok((await shop(e.token)).talismanPrice === 18_000, "a fresh courtesy quotes 18,000");
  peek.prepare("UPDATE app_kv SET value = ? WHERE key = ?")
    .run(JSON.stringify({ off: 0.4, until: Date.now() - 1000 }), `sterling_shield:${e.id}`);
  const stale = await shop(e.token);
  ok(stale.talismanPrice === 30_000, "an expired courtesy quotes the full price again");
  ok(stale.shieldOffer === null, "…and shows no offer");

  // ---- THE SHIELD SALE: the house-wide half -------------------------------
  // Self-targeting by construction: the counter refuses anyone already
  // shielded, so only the bare part of the floor can spend it. Fired LATE
  // because it runs six hours and changes every price on the board.
  const fired = await api("POST", "/api/admin/special", { token: admin, body: { kind: "shieldsale" } });
  ok(fired.status === 200, "the admin can fire a shield sale");
  const cShop = await shop(c.token);
  ok(cShop.talismanPrice === 21_000, "the sale cuts the counter to 21,000 for everyone");
  ok(cShop.shieldOffer?.kind === "sale", "…named as a sale, not a courtesy");
  ok(cShop.shieldOffer?.pct === 30, "…at 30% off");
  ok((await shop(e.token)).talismanPrice === 21_000,
    "…including for somebody whose own courtesy has expired");
  await mint(c.id, 21_000);
  const boughtC = await buy(c.token);
  ok(boughtC.status === 200 && boughtC.body?.paid === 21_000,
    "…and the till charges the sale price");
  ok((await shop(c.token)).coins === 0, "exactly 21,000 left the wallet");

  // BOTH AT ONCE: the better one wins, and they do not compound. `d` spent
  // its courtesy above and is inside the once-a-week gap, so this also proves
  // `force` skips the gap and ONLY the gap.
  ok((await courtesy(d.id)).body?.error === "too_soon", "a second courtesy inside the week is refused");
  ok((await courtesy(d.id, true)).status === 200, "…and force skips exactly that rule");
  const dBoth = await shop(d.token);
  ok(dBoth.talismanPrice === 18_000,
    "a courtesy under a live sale quotes 18,000 — the better offer, not 12,600");
  ok(dBoth.shieldOffer?.kind === "courtesy", "…and says which one won");
  await mint(d.id, 18_000);
  ok((await buy(d.token)).body?.paid === 18_000, "…and charges that, to the coin");

  // force cannot INVENT danger — a shielded target is still refused.
  ok((await courtesy(d.id, true)).body?.error === "shielded",
    "force cannot hand a courtesy to somebody already carrying a shield");

  // The shield is STILL unsellable at any discount — a cheaper sink is a
  // sink, not a faucet.
  const dShield = ((await inv(d.token)).emoji ?? []).find((x) => x.tier === "talisman");
  ok((await api("POST", "/api/shop/sell", { token: d.token, body: { codes: [dShield.code] } })).status === 400,
    "a discounted shield is no more sellable than a full-price one");
  peek.close();

  // ---- anonymous can't touch it -------------------------------------------
  ok((await buy(null)).status === 401, "the counter is closed to anonymous callers");
  ok((await buyMythic(null)).status === 401, "…and so is the top shelf");
  ok((await api("POST", "/api/admin/sterling/shield", { body: { userId: d.id } })).status === 401,
    "…and the courtesy lever is admin-only");
  ok((await api("POST", "/api/admin/sterling/shield", { token: b.token, body: { userId: d.id } })).status === 403,
    "…refusing an ordinary member too");

  console.log("");
  if (bad) {
    console.log(bootLog.split("\n").slice(-12).join("\n"));
    console.log(`${n - bad} passed, ${bad} FAILED`);
    process.exit(1);
  }
  console.log(`${n}/${n} Sterling counter asserts passed`);
};

run()
  .catch((e) => {
    console.error(e);
    console.log(bootLog.split("\n").slice(-15).join("\n"));
    process.exit(1);
  })
  .finally(() => {
    stop();
    setTimeout(() => process.exit(bad ? 1 : 0), 300);
  });
