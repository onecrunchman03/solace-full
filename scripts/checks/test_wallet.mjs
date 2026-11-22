// THE WALLET + GIVING ON THE CASINO FLOOR (Josh, Oct 2026: "players can send
// each other money … buy each other drink/drugs and drop them for others to
// pick up and use … buy a drink and hand it over to another player").
//
// A real server on a throwaway port, over HTTP and the /ws-casino wire.
//   THE WALLET — a send moves silver wallet to wallet to the coin (global
//   conservation: nothing made, nothing lost), the ledger row lands, both
//   parties hear it, and every refusal is FREE: yourself, a bot, nobody, a
//   bad amount, a long note, a block, broke, and owing the goblins.
//   THE ROUND — buying somebody a drink or a drug burns the counter's price
//   from the buyer and puts it in THEIR pockets (a gotitem frame); refused
//   free off the floor, for nobody, and when their hands are full.
//   THE CARPET — a drop comes out of the dropper's pockets (one never owned
//   can't be dropped), lies where they stood for the whole room, and goes to
//   whoever picks it up within reach; a hand-over needs reach and room, and
//   the item really moves; a swig spends it; the pockets agree with what the
//   client says it holds on entering.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8561;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "wallet-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ENV_FILE: "/nonexistent",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });

const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};
let secretSeq = 0;
const register = async (username) => {
  const secret = `copper lantern beneath the stairwell ${["nine", "twelve", "forty", "sixty", "eighty"][secretSeq++ % 5]}`;
  const r = await api("POST", "/api/register", { body: { username, password: "Sturdy!Passw0rd#9", displayName: username, secret, acceptTerms: true } });
  return r.body?.token ?? null;
};
const idOf = async (token) => {
  const r = (await api("GET", "/api/me", { token })).body;
  return r?.user?.id ?? r?.id;
};

const openDb = async () => {
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
};
const totalCoins = async () => {
  const db = await openDb();
  const r = db.prepare("SELECT COALESCE(SUM(coins),0) s FROM users").get();
  db.close();
  return r.s;
};
const coinsOf = async (id) => {
  const db = await openDb();
  const r = db.prepare("SELECT coins FROM users WHERE id = ?").get(id);
  db.close();
  return r?.coins;
};
const transfers = async () => {
  const db = await openDb();
  const r = db.prepare("SELECT * FROM wallet_transfers ORDER BY id").all();
  db.close();
  return r;
};

const appSocket = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}`);
    const frames = [];
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve({ ws, frames }));
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
      async waitFor(type, ms = 2500, pred = () => true) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = [...frames].reverse().find((x) => x.type === type && pred(x));
          if (f) return f;
          await sleep(25);
        }
        return null;
      },
      clear: () => frames.splice(0),
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

const run = async () => {
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(BASE + "/health")).ok) break; } catch {}
    await sleep(250);
  }
  const alice = await register("alice");
  const bob = await register("bobby");
  const carol = await register("carol");
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(alice && bob && carol && admin, "three members + the admin signed in");
  const aliceId = await idOf(alice);
  const bobId = await idOf(bob);
  const carolId = await idOf(carol);
  for (const id of [aliceId, bobId, carolId]) await api("POST", "/api/admin/coins", { token: admin, body: { userId: id, amount: 20_000 } });

  console.log("THE WALLET");
  const bobApp = await appSocket(bob);
  const aliceApp = await appSocket(alice);
  await sleep(200);
  const world = await totalCoins();
  const sent = await api("POST", "/api/wallet/send", { token: alice, body: { toUserId: bobId, amount: 1_234, note: "  for the  cab  " } });
  ok(sent.status === 200 && sent.body?.coins === 18_766, "a send: 1,234 leaves the sender");
  ok((await coinsOf(bobId)) === 21_234, "…and lands in the recipient's wallet");
  ok((await totalCoins()) === world, "…with the world's silver unchanged to the coin");
  const rows = await transfers();
  ok(rows.length === 1 && rows[0].fromId === aliceId && rows[0].toId === bobId && rows[0].amount === 1_234 && rows[0].note === "for the cab", "the ledger row lands, note tidied");
  await sleep(300);
  ok(bobApp.frames.some((f) => f.type === "wallet.transfer" && f.toId === bobId && f.amount === 1_234), "the recipient hears it live");
  ok(aliceApp.frames.some((f) => f.type === "wallet.transfer" && f.fromId === aliceId), "…and so does the sender's other tab");
  const hist = await api("GET", "/api/wallet", { token: bob });
  ok(hist.body?.transfers?.[0]?.dir === "received" && hist.body.transfers[0].other?.id === aliceId && hist.body.transfers[0].amount === 1_234, "the history reads it from where you stand");
  ok(hist.body?.transfers?.[0]?.other && !("coins" in hist.body.transfers[0].other), "…and never carries the other person's balance");

  const refusals = [
    [{ toUserId: aliceId, amount: 5 }, 400, "self_send", "to yourself"],
    [{ toUserId: 999_999, amount: 5 }, 404, "user_not_found", "to nobody"],
    [{ toUserId: bobId, amount: 0 }, 400, "bad_amount", "zero"],
    [{ toUserId: bobId, amount: 2.5 }, 400, "bad_amount", "a fraction"],
    [{ toUserId: bobId, amount: 2_000_000 }, 400, "bad_amount", "over the cap"],
    [{ toUserId: bobId, amount: 5, note: "x".repeat(141) }, 400, "note_too_long", "a note over 140"],
    [{ toUserId: bobId, amount: 900_000 }, 402, "insufficient", "more than you have"],
  ];
  for (const [body, status, error, label] of refusals) {
    const before = await totalCoins();
    const aBefore = await coinsOf(aliceId);
    const r = await api("POST", "/api/wallet/send", { token: alice, body });
    ok(r.status === status && r.body?.error === error && (await coinsOf(aliceId)) === aBefore && (await totalCoins()) === before, `refused free: ${label} (${status} ${error})`);
  }
  const db0 = await openDb();
  const bot = db0.prepare("SELECT id FROM users WHERE isBot = 1 LIMIT 1").get();
  db0.close();
  const toBot = await api("POST", "/api/wallet/send", { token: alice, body: { toUserId: bot.id, amount: 5 } });
  ok(toBot.status === 400 && toBot.body?.error === "user_unavailable", "refused free: to a house bot");
  await api("POST", `/api/blocks/${carolId}`, { token: alice });
  const blk = await api("POST", "/api/wallet/send", { token: alice, body: { toUserId: carolId, amount: 5 } });
  ok(blk.status === 403 && blk.body?.error === "blocked", "refused free: somebody you've blocked");
  await api("DELETE", `/api/blocks/${carolId}`, { token: alice });

  // owing the goblins shuts the wallet
  const loan = await api("POST", "/api/lender/borrow", { token: carol, body: { amount: 1_000 } });
  ok(loan.status === 200, "carol borrows 1,000 from the goblins");
  const cBefore = await coinsOf(carolId);
  const owe = await api("POST", "/api/wallet/send", { token: carol, body: { toUserId: aliceId, amount: 100 } });
  ok(owe.status === 403 && owe.body?.error === "owes_goblins" && (await coinsOf(carolId)) === cBefore, "refused free while owing the goblins (the laundering door shut)");
  ok((await api("GET", "/api/wallet", { token: carol })).body?.owesGoblins === true, "…and the wallet screen knows why");

  console.log("THE ROUND");
  const a = await floorClient(alice);
  a.send({ type: "enter", suit: "yellow", bag: [] });
  await a.waitFor("welcome");
  const offFloor = await api("POST", "/api/casino/treat", { token: bob, body: { item: "beer", to: aliceId } });
  ok(offFloor.status === 403 && offFloor.body?.error === "not_on_floor", "you can't buy a round from off the floor");
  const b = await floorClient(bob);
  b.send({ type: "enter", suit: "yellow", bag: [] });
  await b.waitFor("welcome");
  const nobody = await api("POST", "/api/casino/treat", { token: alice, body: { item: "beer", to: carolId } });
  ok(nobody.status === 409 && nobody.body?.error === "not_here", "refused for somebody not on the floor");
  const badItem = await api("POST", "/api/casino/treat", { token: alice, body: { item: "gun", to: bobId } });
  ok(badItem.status === 400, "refused for anything Sterling doesn't pour");

  const w1 = await totalCoins();
  const a1 = await coinsOf(aliceId);
  b.clear();
  const treat = await api("POST", "/api/casino/treat", { token: alice, body: { item: "whisky", to: bobId } });
  ok(treat.status === 200 && treat.body?.price > 0, "alice buys bobby a whisky");
  const price = treat.body?.price ?? 0;
  ok((await coinsOf(aliceId)) === a1 - price && (await totalCoins()) === w1 - price, "…the counter's price burns from the buyer, nobody credited");
  const got = await b.waitFor("gotitem");
  ok(got?.item === "whisky" && got?.how === "bought" && got?.from === "alice", "…and it lands in his pockets (gotitem, from alice)");
  for (const it of ["ego", "slorp"]) await api("POST", "/api/casino/treat", { token: alice, body: { item: it, to: bobId } });
  const full0 = await coinsOf(aliceId);
  const full = await api("POST", "/api/casino/treat", { token: alice, body: { item: "beer", to: bobId } });
  ok(full.status === 409 && full.body?.error === "hands_full" && (await coinsOf(aliceId)) === full0, "a fourth is refused free: his hands are full");

  console.log("THE CARPET");
  // bobby holds the whisky and swigs it: it's spent, and his pockets have room again
  b.send({ type: "hold", id: "whisky" });
  await sleep(100);
  b.send({ type: "drink" });
  await sleep(150);
  const room = await api("POST", "/api/casino/treat", { token: alice, body: { item: "beer", to: bobId } });
  ok(room.status === 200, "a swig spends the bottle — his pockets take one again");
  // a drop he never had is refused
  b.clear();
  b.send({ type: "put", item: "champagne" });
  const putno = await b.waitFor("putno");
  ok(putno?.error === "not_yours", "a drop of something you never had is refused");
  // a real drop: the room sees it, it's out of his pockets
  a.clear();
  b.send({ type: "put", item: "beer" });
  const dropped = await a.waitFor("drop");
  ok(dropped?.drop?.item === "beer", "a dropped beer lies on the carpet for the whole room");
  b.clear();
  b.send({ type: "put", item: "beer" });
  ok((await b.waitFor("putno"))?.error === "not_yours", "…and it really left his pockets (a second drop is refused)");
  // a newcomer sees it
  const c = await floorClient(carol);
  c.send({ type: "enter", suit: "yellow", bag: [] });
  const wc = await c.waitFor("welcome");
  ok(wc?.drops?.some((d) => d.id === dropped?.drop?.id), "a newcomer's welcome carries what's on the carpet");
  // too far: carol at the entrance, the beer where bobby stood (also the entrance) — move her away first
  c.send({ type: "move", x: 3, y: 3, yaw: 0, p: 0 });
  await sleep(150);
  c.clear();
  c.send({ type: "pick", id: dropped.drop.id });
  ok((await c.waitFor("pickno"))?.error === "too_far", "a pick-up out of reach is refused");
  // alice is standing on it (everyone enters at the door)
  a.clear();
  c.clear();
  a.send({ type: "pick", id: dropped.drop.id });
  const picked = await a.waitFor("gotitem");
  ok(picked?.item === "beer" && picked?.how === "picked", "alice, beside it, picks it up");
  ok(!!(await c.waitFor("undrop")), "…and it's gone from the carpet for everyone");
  c.send({ type: "pick", id: dropped.drop.id });
  ok((await c.waitFor("pickno"))?.error === "gone", "…nobody else can pick it up twice");

  // HAND-OVER: alice hands the beer to bobby (both at the door)
  a.send({ type: "hold", id: "beer" });
  await sleep(100);
  b.clear();
  a.clear();
  a.send({ type: "hand", to: bobId });
  const handed = await a.waitFor("handed");
  const gotHand = await b.waitFor("gotitem");
  ok(handed?.item === "beer" && gotHand?.item === "beer" && gotHand?.how === "handed" && gotHand?.from === "alice", "alice hands bobby the beer — he has it, she's told");
  a.clear();
  a.send({ type: "hand", to: bobId });
  const again = await a.waitFor("handno");
  ok(again?.error === "nothing_in_hand" || again?.error === "not_yours", "…and she can't hand it over again");
  // bobby's pockets are full (ego, slorp, beer) — carol hands him nothing
  await api("POST", "/api/casino/treat", { token: alice, body: { item: "wine", to: carolId } });
  await c.waitFor("gotitem");
  c.ws.close();
  await sleep(200);
  const c2 = await floorClient(carol);
  c2.send({ type: "enter", suit: "yellow", bag: ["wine"] });
  await c2.waitFor("welcome");
  c2.send({ type: "hold", id: "wine" });
  await sleep(100);
  c2.send({ type: "hand", to: bobId });
  ok((await c2.waitFor("handno"))?.error === "hands_full", "a hand-over to full hands is refused (and her wine survived the reconnect)");
  // the pockets keep only what the client says it holds
  c2.ws.close();
  await sleep(200);
  const c3 = await floorClient(carol);
  c3.send({ type: "enter", suit: "yellow", bag: [] });
  await c3.waitFor("welcome");
  c3.send({ type: "put", item: "wine" });
  ok((await c3.waitFor("putno"))?.error === "not_yours", "entering with empty pockets empties the server's copy too");

  for (const s of [a, b, c3]) s.ws.close();
  bobApp.ws.close();
  aliceApp.ws.close();
};

run()
  .catch((e) => { bad++; console.error(e); })
  .finally(() => {
    if (bad) console.error(bootLog.split("\n").slice(-30).join("\n"));
    console.log(`\n${n - bad}/${n} passed`);
    try { srv.kill("SIGINT"); } catch {}
    process.exit(bad ? 1 : 0);
  });
