// THE WAKE, OVER HTTP — the route wiring the in-process harness can't reach.
//
//   node scripts/checks/test_wake_http.mjs
//
// test_mortality.mjs proves the money and the two token resolvers. What only a
// real server can prove is the plumbing between them: that the router's "wake"
// auth level resolves the right one, that a wake session is refused by every
// ordinary route, that /api/login hands a fresh grave a token instead of a
// 401, and that the raise route returns the right refusals.
//
// Boots a real `node dist/index.js` on a throwaway port against a throwaway
// data dir, drives it over HTTP, and SIGINTs it. Deaths are inflicted by
// opening the same DB with a second connection and calling the compiled
// Store's killUser — the Wheel's own path, without needing to win a 1-in-100
// roll or hold the admin password.


import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { RAISE_PRICE } = require(path.join(ROOT, "dist", "mortality.js"));

const PORT = 8479;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "wake-http-harness");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: DATA,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    ADMIN_PASSWORD: "Harness#Admin72x",
    LIVEKIT_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = () => { try { server.kill("SIGINT"); } catch {} };

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

const call = async (pathname, { method = "GET", token, body } = {}) => {
  const r = await fetch(BASE + pathname, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};

const PW = "Harness#Pass72x";
const SECRET = "brass lantern quiet harbour";
const reg = async (username) =>
  call("/api/register", {
    method: "POST",
    body: { username, displayName: username, password: PW, secret: SECRET, acceptTerms: true },
  });

try {
  if (!(await waitUp())) throw new Error("server never came up");

  // --- two accounts: one to die, one to pay ------------------------------
  const victimReg = await reg("gravebound");
  const payerReg = await reg("goodfriend");
  ok(victimReg.status === 200 && payerReg.status === 200, "two accounts register");
  const victimId = victimReg.body.user.id;
  const payerToken = payerReg.body.token;
  const victimOldToken = victimReg.body.token;

  // A live session reaches ordinary routes and NOT the wake.
  ok((await call("/api/channels", { token: victimOldToken })).status === 200,
    "a living session reads channels");
  ok((await call("/api/wake", { token: victimOldToken })).status === 401,
    "…and is refused by the wake, which is not its business");

  // --- kill them, the way the Wheel does ---------------------------------
  const store = new Store(path.join(DATA, "solace.db"));
  store.addCoins(victimId, 640);
  store.killUser(victimId);
  ok(store.getUserById(victimId).disabled === true, "the victim is tombstoned");

  // --- the dead account's OLD session is dead to every ordinary route ----
  ok((await call("/api/channels", { token: victimOldToken })).status === 401,
    "A DEAD SESSION READS NOTHING — every ordinary route refuses it");
  ok((await call("/api/me", { token: victimOldToken })).status === 401,
    "…including /api/me, which is what makes the client look for a wake");
  ok((await call("/api/wake", { token: victimOldToken })).status === 200,
    "…but the wake opens, so a refresh mid-wake isn't a sign-out");

  // --- logging in while dead lands on the wake, not a 401 ----------------
  const relog = await call("/api/login", {
    method: "POST",
    body: { username: "gravebound", password: PW },
  });
  ok(relog.status === 200 && relog.body.wake === true,
    "signing in during your own wake succeeds and is flagged as a wake");
  const wakeToken = relog.body.token;
  ok((await call("/api/channels", { token: wakeToken })).status === 401,
    "the wake token still reaches no ordinary route");

  const wake = await call("/api/wake", { token: wakeToken });
  ok(wake.status === 200, "the wake screen has something to show");
  ok(wake.body.sealsAt > Date.now(), "…a deadline in the future");
  ok(wake.body.quote.coins === 640, "…the whole purse as the self-revival price");
  ok(wake.body.quote.raisePrice === RAISE_PRICE, "…and what a friend would pay instead");

  // --- a wrong password is still a wrong password -----------------------
  const badPw = await call("/api/login", {
    method: "POST",
    body: { username: "gravebound", password: "not-the-password" },
  });
  ok(badPw.status === 401, "the wake is not a way past the password");

  // --- raising: the refusals, then the rescue ---------------------------
  const broke = await call(`/api/graveyard/${victimId}/raise`, {
    method: "POST", token: payerToken, body: { kind: "silver" },
  });
  ok(broke.status === 402, "a payer without the price gets 402, not a charge");

  store.addCoins(payerReg.body.user.id, RAISE_PRICE + 25);
  const selfRaise = await call(`/api/graveyard/${victimId}/raise`, {
    method: "POST", token: wakeToken, body: { kind: "silver" },
  });
  ok(selfRaise.status === 401, "a wake token cannot use the LIVING raise route");

  const rescue = await call(`/api/graveyard/${victimId}/raise`, {
    method: "POST", token: payerToken, body: { kind: "silver" },
  });
  ok(rescue.status === 200, "a funded friend raises them");
  ok(rescue.body.coins === 25, `the payer is down exactly ${RAISE_PRICE}`);
  ok(store.getCoins(victimId) === 640, "the raised player received nothing — the fee burned");
  ok(store.getUserById(victimId).disabled === false, "and they are alive");

  // --- the wake closes behind them --------------------------------------
  ok((await call("/api/wake", { token: wakeToken })).status === 401,
    "the wake token stops working the moment they're up");
  ok((await call("/api/channels", { token: wakeToken })).status === 200,
    "…and that same token is an ordinary session again");

  // --- and a second rescue is refused, not double-charged ---------------
  const again = await call(`/api/graveyard/${victimId}/raise`, {
    method: "POST", token: payerToken, body: { kind: "silver" },
  });
  ok(again.status === 409, "raising the living is a 409");
  ok(store.getCoins(payerReg.body.user.id) === 25, "…and costs nothing");

  // --- the graveyard read carries the new shape -------------------------
  const yard = await call("/api/graveyard", { token: payerToken });
  ok(yard.status === 200 && Array.isArray(yard.body.lives), "the graveyard serves monuments");
  ok(yard.body.raisePrice === RAISE_PRICE, "…and tells the client the price");
} catch (e) {
  bad++;
  console.error("  ✗ harness error:", e.message);
} finally {
  stop();
  // Windows keeps the SQLite handles a beat after SIGINT, and a failed tidy-up
  // must never turn a green run red. Retry, then leave it for the next run's
  // opening rmSync.
  for (let i = 0; i < 6; i++) {
    await sleep(300);
    try {
      rmSync(DATA, { recursive: true, force: true });
      break;
    } catch { /* still held — try again */ }
  }
}

console.log(`\n${n - bad}/${n} wake-over-HTTP asserts passed`);
process.exit(bad ? 1 : 0);
