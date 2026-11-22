// GRAVEYARD v2 — THE MEMORIAL, THE RITUALS, THE SEXTON.
//
//   node scripts/checks/test_memorial.mjs
//
// What this file exists to prove, in order of how expensive a regression is:
//
//  1. THE RITUALS ARE SINKS. A candle (25) and flowers (100) BURN — one
//     wallet down, no wallet up — and every refusal (living target, bad
//     kind, duplicate-while-standing, broke) is proven to move not one coin.
//  2. THE CAUSE IS CARVED. A wheel death writes deathCause='wheel' at death,
//     the graveyard payload carries it, and the sealing carves it into the
//     monument.
//  3. THE GRAVE'S ROWS DIE WITH THE GRAVE. Respects, tributes and eulogies
//     clear whichever way the grave resolves — but a SEALING first carves
//     the eulogies into the monument (they were said at that wake).
//  4. THE SEALING IS LOUD from BOTH paths: the lazy Graveyard-read seal
//     broadcasts grave.sealed exactly as the sweep does (it used to seal in
//     silence), and Sterling reads a line over the grave in #general.
//  5. THE MEMORIAL keeps the one secret it must: a self-revival's burned
//     purse (`cost`) never rides the wire — it would leak what a living
//     player once held.
//
// Boots a real `node dist/index.js` on a throwaway port; deaths are
// inflicted through a second Store connection (the wake harness's trick).


import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { CANDLE_PRICE, FLOWERS_PRICE, RAISE_PRICE, MAX_EULOGY } = require(path.join(ROOT, "dist", "mortality.js"));

const PORT = 8482;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "memorial-harness");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: DATA,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    ADMIN_PASSWORD: "Harness#Admin82x",
    LIVEKIT_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));
const stop = () => { try { server.kill("SIGINT"); } catch {} };

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return true; } catch {}
    await sleep(250);
  }
  return false;
}

const call = async (pathname, { method = "GET", token, body } = {}) => {
  const r = await fetch(BASE + pathname, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};

const PW = "Harness#Pass82x";
const SECRET = "brass lantern quiet harbour";
const reg = (username) =>
  call("/api/register", { method: "POST", body: { username, displayName: username, password: PW, secret: SECRET, acceptTerms: true } });

try {
  if (!(await waitUp())) throw new Error("server never came up");

  const store = new Store(path.join(DATA, "solace.db"));
  const { DatabaseSync } = await import("node:sqlite");
  const q1 = (sql, ...a) => {
    const d = new DatabaseSync(path.join(DATA, "solace.db"), { readOnly: true });
    const r = d.prepare(sql).get(...a);
    d.close();
    return r;
  };
  const wallets = () => q1("SELECT COALESCE(SUM(coins),0) AS t FROM users").t;

  // ---- the cast --------------------------------------------------------------
  const victimReg = await reg("dearly-departed");
  const m1Reg = await reg("mourner-one");
  const m2Reg = await reg("mourner-two");
  ok(victimReg.status === 200 && m1Reg.status === 200 && m2Reg.status === 200, "three accounts register");
  const victimId = victimReg.body.user.id;
  const m1 = m1Reg.body.token, m1Id = m1Reg.body.user.id;
  const m2 = m2Reg.body.token, m2Id = m2Reg.body.user.id;
  const admin = (await call("/api/login", { method: "POST", body: { username: "admin", password: "Harness#Admin82x" } })).body.token;
  ok(!!admin, "the house signs in");

  // ---- the payload carries the graveyard's terms -----------------------------
  {
    const g = await call("/api/graveyard", { token: m1 });
    ok(g.body.candlePrice === CANDLE_PRICE && g.body.flowersPrice === FLOWERS_PRICE,
      `the payload quotes the ritual prices (${CANDLE_PRICE} / ${FLOWERS_PRICE})`);
    ok(typeof g.body.now === "number" && Math.abs(g.body.now - Date.now()) < 60_000,
      "…and the server's clock, which is what tribute decay reads");
    ok(g.body.maxEulogy === MAX_EULOGY && typeof g.body.necrology === "object", "…and the eulogy cap + the necrology");
  }

  // ---- refusals on the living are free ---------------------------------------
  store.addCoins(m1Id, 1_000);
  const before = wallets();
  ok((await call(`/api/graveyard/${m2Id}/tribute`, { method: "POST", token: m1, body: { kind: "candle" } })).status === 404,
    "a candle on a LIVING account is refused — only real graves take them");
  ok((await call(`/api/graveyard/${m2Id}/eulogy`, { method: "POST", token: m1, body: { text: "too soon" } })).status === 404,
    "…and so is a eulogy");
  ok(wallets() === before, "…both refusals free, to the coin");

  // ---- death, the way the Wheel does it --------------------------------------
  store.killUser(victimId);
  ok(q1("SELECT deathCause AS c FROM users WHERE id = ?", victimId).c === "wheel",
    "THE CAUSE IS CARVED AT DEATH: deathCause = 'wheel'");
  {
    const g = await call("/api/graveyard", { token: m1 });
    const grave = g.body.graves.find((x) => x.user.id === victimId);
    ok(grave?.deathCause === "wheel", "…and the graveyard payload names it");
    ok(Array.isArray(grave?.tributes) && grave.tributes.length === 0, "…with clean ground to start");
  }

  // ---- THE RITUALS burn ------------------------------------------------------
  {
    const w0 = wallets();
    const c = await call(`/api/graveyard/${victimId}/tribute`, { method: "POST", token: m1, body: { kind: "candle" } });
    ok(c.status === 200 && c.body.coins === 1_000 - CANDLE_PRICE, `a candle costs ${CANDLE_PRICE}`);
    ok(wallets() === w0 - CANDLE_PRICE, "…BURNED — one wallet down, no wallet up");
    const f = await call(`/api/graveyard/${victimId}/tribute`, { method: "POST", token: m1, body: { kind: "flowers" } });
    ok(f.status === 200 && f.body.coins === 1_000 - CANDLE_PRICE - FLOWERS_PRICE, `flowers cost ${FLOWERS_PRICE}`);
    ok(wallets() === w0 - CANDLE_PRICE - FLOWERS_PRICE, "…burned too, and a candle and flowers stand together");

    const w1 = wallets();
    const dup = await call(`/api/graveyard/${victimId}/tribute`, { method: "POST", token: m1, body: { kind: "candle" } });
    ok(dup.status === 409 && dup.body.error === "already_standing", "a second candle while yours burns is refused");
    const badKind = await call(`/api/graveyard/${victimId}/tribute`, { method: "POST", token: m1, body: { kind: "wreath" } });
    ok(badKind.status === 400, "an invented tribute kind is refused");
    const broke = await call(`/api/graveyard/${victimId}/tribute`, { method: "POST", token: m2, body: { kind: "candle" } });
    ok(broke.status === 402 && broke.body.error === "insufficient", "a broke mourner is refused");
    ok(wallets() === w1, "…and all three refusals were FREE");
  }

  // Another mourner's candle is their own business — and it broadcasts.
  {
    store.addCoins(m2Id, 500);
    const frames = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(m1)}`);
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    await new Promise((r) => ws.once("open", r));
    await sleep(300);
    const c2 = await call(`/api/graveyard/${victimId}/tribute`, { method: "POST", token: m2, body: { kind: "candle" } });
    ok(c2.status === 200, "a second mourner lights their own candle beside the first");
    await sleep(500);
    const frame = frames.find((f) => f.type === "grave.tribute");
    ok(frame?.deadUserId === victimId && frame?.byUserId === m2Id && frame?.kind === "candle",
      "…and the room sees it land (grave.tribute broadcast)");
    const g = await call("/api/graveyard", { token: m1 });
    const grave = g.body.graves.find((x) => x.user.id === victimId);
    ok(grave.tributes.filter((t) => t.kind === "candle").length === 2, "two candles stand on the payload");
    ws.close();
  }

  // ---- EULOGIES --------------------------------------------------------------
  {
    const w = wallets();
    ok((await call(`/api/graveyard/${victimId}/eulogy`, { method: "POST", token: m1, body: { text: "He owed me ten silver. Keep it." } })).status === 200,
      "a eulogy is spoken");
    ok((await call(`/api/graveyard/${victimId}/eulogy`, { method: "POST", token: m1, body: { text: "He owed me ten silver. It is forgiven." } })).status === 200,
      "…and rewritten");
    const mem = await call(`/api/graveyard/${victimId}/memorial`, { token: m2 });
    const mine = mem.body.eulogies.filter((e) => e.byUserId === m1Id);
    ok(mine.length === 1 && mine[0].text.includes("forgiven"), "a rewrite REPLACES — one voice, one eulogy");
    ok(wallets() === w, "words cost nothing");

    ok((await call(`/api/graveyard/${victimId}/eulogy`, { method: "POST", token: m2, body: { text: "" } })).status === 400,
      "an empty eulogy is refused");
    ok((await call(`/api/graveyard/${victimId}/eulogy`, { method: "POST", token: m2, body: { text: "x".repeat(MAX_EULOGY + 1) } })).status === 400,
      `…and one past ${MAX_EULOGY} chars — it has to fit on a mourning card`);

    ok((await call(`/api/graveyard/${victimId}/eulogy`, { method: "POST", token: m2, body: { text: "A quiet neighbour. A loud death." } })).status === 200,
      "the second mourner speaks");
    ok((await call(`/api/graveyard/${victimId}/eulogy/${m1Id}`, { method: "DELETE", token: m2 })).status === 403,
      "a MEMBER cannot sweep somebody else's words off a grave");
    ok((await call(`/api/graveyard/${victimId}/eulogy`, { method: "DELETE", token: m2 })).status === 200,
      "…but may take back their own");
    ok((await call(`/api/graveyard/${victimId}/eulogy/${m1Id}`, { method: "DELETE", token: admin })).status === 200,
      "staff may sweep any (moderation)");
    // Restore one for the sealing below.
    await call(`/api/graveyard/${victimId}/eulogy`, { method: "POST", token: m1, body: { text: "The Wheel was patient. He was not." } });
  }

  // ---- THE SEALING: loud from the lazy path, carving as it closes ------------
  {
    const frames = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(m1)}`);
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    await new Promise((r) => ws.once("open", r));

    // Rewind the deadline; the next Graveyard READ must do the sealing.
    {
      const d = new DatabaseSync(path.join(DATA, "solace.db"));
      d.prepare("UPDATE users SET graveSealsAt = ? WHERE id = ?").run(Date.now() - 1_000, victimId);
      d.close();
    }
    const g = await call("/api/graveyard", { token: m1 });
    ok(!g.body.graves.some((x) => x.user.id === victimId), "the lazy read seals the overdue grave");
    const mon = g.body.lives.find((l) => l.userId === victimId);
    ok(mon?.generation === 1 && mon?.deathCause === "wheel", "the monument carries generation AND cause");
    ok(mon?.eulogies?.length === 1 && mon.eulogies[0].text.includes("patient"),
      "THE EULOGIES ARE CARVED INTO THE MONUMENT — they were said at that wake");
    ok(q1("SELECT COUNT(*) AS c FROM grave_tributes WHERE deadUserId = ?", victimId).c === 0
      && q1("SELECT COUNT(*) AS c FROM grave_eulogies WHERE deadUserId = ?", victimId).c === 0
      && q1("SELECT COUNT(*) AS c FROM grave_respects WHERE deadUserId = ?", victimId).c === 0,
      "…and every grave-scoped row cleared with the ground");
    const u = q1("SELECT disabled, generation, deathCause FROM users WHERE id = ?", victimId);
    ok(u.disabled === 0 && u.generation === 2 && u.deathCause === null,
      "generation 2 stands up with a clean cause");

    await sleep(600);
    ok(frames.some((f) => f.type === "grave.sealed" && f.userId === victimId),
      "THE LAZY SEAL IS LOUD: grave.sealed broadcast exactly as the sweep's");
    ws.close();

    // Sterling reads a line over the grave in #general.
    let spoke = false;
    const channels = await call("/api/channels", { token: m1 });
    const general = (channels.body.channels ?? []).find((c) => c.name === "general");
    for (let i = 0; i < 20 && !spoke; i++) {
      await sleep(300);
      const msgs = await call(`/api/channels/${general.id}/messages`, { token: m1 });
      spoke = (msgs.body.messages ?? []).some(
        (m) => m.author?.isBot && (m.body ?? "").includes("dearly-departed"),
      );
    }
    ok(spoke, "…and STERLING THE SEXTON says a word over it in #general");
  }

  // ---- A RAISE clears the ground too (and burns its price) -------------------
  {
    store.killUser(victimId);
    store.addCoins(m1Id, RAISE_PRICE);
    await call(`/api/graveyard/${victimId}/tribute`, { method: "POST", token: m2, body: { kind: "flowers" } });
    await call(`/api/graveyard/${victimId}/eulogy`, { method: "POST", token: m2, body: { text: "Twice now. Impressive." } });
    const w0 = wallets();
    const r = await call(`/api/graveyard/${victimId}/raise`, { method: "POST", token: m1, body: { kind: "silver" } });
    ok(r.status === 200, "a friend raises the second corpse");
    ok(wallets() === w0 - RAISE_PRICE, "…the price BURNED, the dead credited nothing");
    ok(q1("SELECT COUNT(*) AS c FROM grave_tributes WHERE deadUserId = ?", victimId).c === 0
      && q1("SELECT COUNT(*) AS c FROM grave_eulogies WHERE deadUserId = ?", victimId).c === 0,
      "…and the raise cleared the ground exactly as a sealing does");
    ok(q1("SELECT deathCause AS c FROM users WHERE id = ?", victimId).c === null,
      "…the walking do not carry a cause of death");
  }

  // ---- THE MEMORIAL keeps the self-revival's one secret ----------------------
  {
    store.killUser(victimId);
    store.addCoins(victimId, 5_000); // enough that the wake will sell them back
    const login = await call("/api/login", { method: "POST", body: { username: "dearly-departed", password: PW } });
    ok(login.body.wake === true && !!login.body.token, "the third death logs into a wake");
    const rev = await call("/api/wake/revive", { method: "POST", token: login.body.token });
    ok(rev.status === 200 && rev.body.burnedCoins === 5_000, "they buy themselves back — the whole purse burns");

    const mem = await call(`/api/graveyard/${victimId}/memorial`, { token: m2 });
    const self = mem.body.revivals.find((x) => x.kind === "self");
    const paid = mem.body.revivals.find((x) => x.kind === "silver");
    ok(!!self && self.cost === null,
      "A SELF-REVIVAL'S BURNED PURSE NEVER RIDES THE WIRE — it would leak a living wallet");
    ok(!!paid && paid.cost === RAISE_PRICE && paid.byUserId === m1Id,
      "…while a friend's raise shows its fixed public price and its payer");
    ok(mem.body.lives.length === 1, "the family plot holds the one sealed life");
  }

  // ---- THE NECROLOGY adds up -------------------------------------------------
  {
    const g = await call("/api/graveyard", { token: m1 });
    const nec = g.body.necrology;
    ok(nec.deaths === 1 && nec.byWheel === 1, "the necrology counts the one sealed life, cause and all");
    ok(nec.raises === 1 && nec.selfRevivals === 1, "…one raise, one self-purchase");
    ok(nec.silverBurnedRaising === RAISE_PRICE, `…${RAISE_PRICE.toLocaleString()} burned raising the dead`);
    ok(nec.generationsWalking === 2, "…and generation II walks");
    ok(nec.daysSinceLastDeath === 0, "…the accident sign reads zero days, freshly painted");
  }

  console.log(`\n${n - bad}/${n} memorial asserts passed`);
  stop();
  process.exit(bad ? 1 : 0);
} catch (e) {
  console.error("HARNESS ERROR:", e);
  stop();
  process.exit(1);
}
