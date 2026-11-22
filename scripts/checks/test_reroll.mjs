// THE REROLL — dying never costs you your seat at the table (Josh, Sep 2026).
//
//   node scripts/checks/test_reroll.mjs
//
// On an invite-only server (REQUIRE_INVITE=true, production's posture), an
// account shut out by the Wheel (the Wake) or by the goblins (the Cell) may
// register a FRESH account with its own shut-out session token in place of an
// invite code. This harness proves the door over a real server — and, just as
// important, proves it opens for NOBODY else: no token, a garbage token, and a
// LIVING session are all still turned away, the reroll burns no invite, and a
// sealed grave's stale token stops qualifying.
//
// Deaths are inflicted the test_wake_http way: a second Store connection on
// the same WAL DB calling the compiled killUser — the Wheel's own path. Jail
// is manufactured as a row in the exact shape sealCell polices (disabled,
// jailedAt set, diedAt NULL, jailSealsAt fresh), because walking the goblins'
// four-day ladder over HTTP is test_lender.mjs's job, not this one's.
//
// NB the /api/register limiter is 5/hour per IP — each call carries its own
// X-Forwarded-For (clientIp takes the right-most hop by design), so the
// harness never trips it.


import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));

const PORT = 8507;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "reroll-harness");

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
    REQUIRE_INVITE: "true", // production's posture — the whole point of the door
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

let ipN = 0;
const call = async (pathname, { method = "GET", token, body, ip } = {}) => {
  const r = await fetch(BASE + pathname, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip ?? `10.77.0.${++ipN}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};

// NB: the password screener rejects anything containing the username, so the
// credentials never mention it. Memoized — the same name always gets the same
// password, and each name gets a distinct one.
const credCache = new Map();
const CRED = (u) => {
  if (!credCache.has(u)) {
    const i = credCache.size + 1;
    credCache.set(u, {
      username: u,
      displayName: u,
      password: `Voltaic#Umbra${i}Ridge77`,
      secret: `lantern over the orchard gate number ${i}!`,
      acceptTerms: true,
    });
  }
  return credCache.get(u);
};

const run = async () => {
  if (!(await waitUp())) { console.error("server never came up"); stop(); process.exit(1); }

  // --- the invite gate is really shut -------------------------------------
  const noCode = await call("/api/register", { method: "POST", body: CRED("walkin") });
  ok(noCode.status === 400 && noCode.body?.error === "invite_required", "no invite, no account (the gate is up)");

  const adm = await call("/api/login", { method: "POST", body: { username: "admin", password: "Harness#Admin72x" } });
  ok(adm.status === 200 && adm.body?.token, "admin signs in");
  const admTok = adm.body.token;

  const mint = await call("/api/admin/invites", { method: "POST", token: admTok, body: {} });
  ok(mint.status === 200 && mint.body?.invite?.code, "admin mints an invite");

  const alice = await call("/api/register", {
    method: "POST",
    body: { ...CRED("alice"), inviteCode: mint.body.invite.code },
  });
  ok(alice.status === 200 && alice.body?.token, "an invited account registers");
  const aliceTok = alice.body.token;

  // A second living account for the living-token refusal below.
  const mint2 = await call("/api/admin/invites", { method: "POST", token: admTok, body: {} });
  const bystander = await call("/api/register", {
    method: "POST",
    body: { ...CRED("bystander"), inviteCode: mint2.body.invite.code },
  });
  ok(bystander.status === 200, "a second living account registers");

  // --- the Wheel takes alice ----------------------------------------------
  const store = new Store(path.join(DATA, "solace.db"));
  const aliceId = alice.body.user.id;
  store.killUser(aliceId, "wheel");
  ok(store.getUserById(aliceId).disabled === true, "alice is tombstoned");

  const deadLogin = await call("/api/login", { method: "POST", body: { username: "alice", password: CRED("alice").password } });
  ok(deadLogin.status === 200 && deadLogin.body?.wake === true && deadLogin.body?.token, "login answers a fresh grave with a wake session");
  const wakeTok = deadLogin.body.token;

  // --- the door opens ONLY for a shut-out session -------------------------
  const garbage = await call("/api/register", { method: "POST", body: { ...CRED("ghost"), rerollToken: "not-a-token" } });
  ok(garbage.status === 400 && garbage.body?.error === "invite_required", "a garbage reroll token is just a missing invite");

  const living = await call("/api/register", { method: "POST", body: { ...CRED("shade"), rerollToken: bystander.body.token } });
  ok(living.status === 400 && living.body?.error === "invite_required", "a LIVING session's token opens nothing");

  const weak = await call("/api/register", {
    method: "POST",
    body: { username: "aa", displayName: "aa", password: "short", secret: "short", rerollToken: wakeTok },
  });
  ok(weak.status === 400 && weak.body?.error === "bad_username", "the reroll path still validates like any registration");

  const invitesBefore = (await call("/api/admin/invites", { token: admTok })).body.invites;

  const reborn = await call("/api/register", { method: "POST", body: { ...CRED("alice2"), rerollToken: wakeTok } });
  ok(reborn.status === 200 && reborn.body?.token && reborn.body?.user?.username === "alice2",
    "the wake token IS the invite — a dead player starts over without a code");

  const me = await call("/api/me", { token: reborn.body.token });
  ok(me.status === 200 && me.body?.user?.username === "alice2", "the new account is an ordinary living session");
  // ONE REROLL PER GRAVE (Sep 2026 review): the same token opened the door
  // as many times as the wake window allowed — an alt factory on an
  // invite-only server. Now the first walk-out stamps the grave.
  const twice = await call("/api/register", { method: "POST", body: { ...CRED("alice2b"), rerollToken: wakeTok } });
  ok(twice.status === 400 && twice.body?.error === "invite_required", "the same grave cannot start over TWICE — the token is spent");

  const invitesAfter = (await call("/api/admin/invites", { token: admTok })).body.invites;
  ok(JSON.stringify(invitesBefore.map((i) => i.uses)) === JSON.stringify(invitesAfter.map((i) => i.uses)),
    "the reroll burned no invite — the ledger's uses are untouched");

  // --- the old grave is exactly as it lay ---------------------------------
  const wakeStill = await call("/api/wake", { token: wakeTok });
  ok(wakeStill.status === 200 && wakeStill.body?.user?.username === "alice",
    "the abandoned grave still stands — friends can raise it until it seals");

  // --- the goblins' door works the same way -------------------------------
  const mint3 = await call("/api/admin/invites", { method: "POST", token: admTok, body: {} });
  const debtor = await call("/api/register", {
    method: "POST",
    body: { ...CRED("debtor"), inviteCode: mint3.body.invite.code },
  });
  ok(debtor.status === 200, "a soon-to-be debtor registers");
  const debtorId = debtor.body.user.id;
  // The exact row shape jailUserForToken polices: held, not dead, unsealed.
  const { DatabaseSync } = require("node:sqlite");
  const raw = new DatabaseSync(path.join(DATA, "solace.db"));
  raw.prepare("UPDATE users SET disabled = 1, jailedAt = ?, jailSealsAt = ?, diedAt = NULL WHERE id = ?")
    .run(Date.now(), Date.now() + 48 * 3_600_000, debtorId);
  raw.close();

  const jailLogin = await call("/api/login", { method: "POST", body: { username: "debtor", password: CRED("debtor").password } });
  ok(jailLogin.status === 200 && jailLogin.body?.jail === true && jailLogin.body?.token, "login answers a prisoner with a cell session");
  const jailTok = jailLogin.body.token;
  ok((await call("/api/cell", { token: jailTok })).status === 200, "the cell session reads the cell");

  const escaped = await call("/api/register", { method: "POST", body: { ...CRED("debtor2"), rerollToken: jailTok } });
  ok(escaped.status === 200 && escaped.body?.user?.username === "debtor2",
    "the cell token IS the invite — the debt stays with the body in the cell");

  // --- a prisoner isn't dead, and the reroll is per GRAVE (Oct 2026 review) --
  // Reviving a jailed member left the cell's clock armed, and it later sealed
  // onto the living account; and the reroll stamp was never cleared, so an
  // account that came back and fell again could never reroll.
  const revive = await call("/api/admin/users/revive", { method: "POST", token: admTok, body: { userId: debtorId } });
  ok(revive.status === 409 && revive.body?.error === "jailed", "the admin's revive refuses a goblin prisoner (bail frees them)");
  const sameCell = await call("/api/register", { method: "POST", body: { ...CRED("debtor3"), rerollToken: jailTok } });
  ok(sameCell.status === 400 && sameCell.body?.error === "invite_required", "one reroll per cell — the same cell can't open the door twice");
  await sleep(20);
  const raw3 = new DatabaseSync(path.join(DATA, "solace.db"));
  raw3.prepare("UPDATE users SET jailedAt = ? WHERE id = ?").run(Date.now(), debtorId); // a later, second cell
  raw3.close();
  const again = await call("/api/register", { method: "POST", body: { ...CRED("debtor4"), rerollToken: jailTok } });
  ok(again.status === 200, `…but a LATER cell is a new grave and gets its own (${again.status} ${again.body?.error ?? ""})`);

  // --- a sealed grave's stale token stops qualifying ----------------------
  const raw2 = new DatabaseSync(path.join(DATA, "solace.db"));
  raw2.prepare("UPDATE users SET graveSealsAt = ? WHERE id = ?").run(Date.now() - 1000, aliceId);
  raw2.close();
  const stale = await call("/api/register", { method: "POST", body: { ...CRED("alice3"), rerollToken: wakeTok } });
  ok(stale.status === 400 && stale.body?.error === "invite_required",
    "a sealed grave's token no longer opens the door");

  console.log(`\n${n - bad}/${n} asserts green`);
  stop();
  await sleep(300);
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error(e); stop(); process.exit(1); });
