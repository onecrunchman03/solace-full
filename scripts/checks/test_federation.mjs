// FEDERATION F1 harness — the satellite registry + the rendezvous link
// (FEDERATION.md), driven against a REAL server with a REAL Ed25519 keypair,
// hostile paths included: the design doc requires the bad signature, the
// replay, the stale version, the revoked id and the double redemption to be
// proven refused, not assumed.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fsx, { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createPrivateKey, generateKeyPairSync, sign as edSign } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { DatabaseSync } = await import("node:sqlite");
const PORT = 8506;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "federation-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const INSTALLER = path.join(DATA_DIR, "installer", "Solace-Satellite-Setup.exe");
const LINUX_BUNDLE = path.join(DATA_DIR, "installer", "satellite-linux-x64.tar.gz");
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false", BACKROOMS_ENABLED: "false",
    SATELLITE_APP_PATH: INSTALLER,
    SATELLITE_LINUX_PATH: LINUX_BUNDLE,
    SATELLITE_INSTALL_SCRIPT: path.join(ROOT, "deploy", "satellite-install.sh"),
    // Voice config so the token route mints (JWTs sign locally — no SFU
    // needs to run; the PERMISSION path is what these creds unlock).
    LIVEKIT_URL: "ws://127.0.0.1:59999", LIVEKIT_API_KEY: "harnesskey", LIVEKIT_API_SECRET: "harness-secret-value-32chars-min",
    SAT_VOICE_CACHE_MS: "200", SAT_ERR_SWEEP_MS: "400",
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
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

// The exact string both sides sign — mirrored from src/federation/protocol.ts
// on purpose: if the shipped payload shape drifts, this harness goes red.
const helloPayload = (nonce, satelliteId, version, ts) => `solace-sat1:${nonce}:${satelliteId}:${version}:${ts}`;

/** Connect to /ws-satellite, answer the challenge with `answer(nonce)`, and
 *  report what happened: welcomed, or closed (with code/reason). */
const dial = (answer, { holdOpen = false } = {}) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-satellite`);
    const out = { welcomed: false, closed: false, code: 0, reason: "", ws };
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "challenge") ws.send(JSON.stringify(answer(msg.nonce)));
      if (msg.type === "welcome") {
        out.welcomed = true;
        if (!holdOpen) { ws.close(); resolve(out); }
        else resolve(out);
      }
    });
    ws.on("close", (code, reason) => {
      out.closed = true; out.code = code; out.reason = String(reason);
      resolve(out);
    });
    ws.on("error", () => {});
  });

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + "/health")).ok) break; } catch {}
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin logged in");
  if (!admin) { console.log(bootLog.slice(-2000)); process.exit(1); }
  const member = (await api("POST", "/api/register", {
    body: { username: "sat_owner", password: "Str0ng!Passw0rd#S", displayName: "sat_owner", secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  })).body?.token;
  const ownerId = (await api("GET", "/api/me", { token: member })).body.user.id;

  // ---- 1. Minting is the admin's alone ------------------------------------
  console.log("\n-- provisioning keys --");
  ok((await api("POST", "/api/admin/satellites/keys", { token: member, body: { ownerUserId: ownerId } })).status === 403,
    "a member cannot mint a provisioning key");
  const mintRes = await api("POST", "/api/admin/satellites/keys", {
    token: admin, body: { ownerUserId: ownerId, note: "harness", ttlHours: 24 },
  });
  ok(mintRes.status === 200 && /^[A-Z2-9]{20}$/.test(mintRes.body.code ?? ""),
    `admin mints a 20-char key (${mintRes.status})`);
  const code = mintRes.body.code;
  const list1 = (await api("GET", "/api/admin/satellites", { token: admin })).body;
  ok(list1.keys.length === 1 && !list1.keys[0].usedAt, "the key lists unused");
  ok(!JSON.stringify(list1).includes(code), "…and the cleartext code is NOT in the registry (hashed at rest)");

  // ---- 2. Registration: the key opens the door exactly once ---------------
  console.log("\n-- registration --");
  const pair = generateKeyPairSync("ed25519");
  const pubkey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();

  ok((await api("POST", "/api/satellite/register", {
    body: { key: "AAAAAAAAAAAAAAAAAAAA", name: "Fake", pubkey, version: "0.1.0", acceptHosting: true },
  })).status === 403, "a made-up key is refused");
  ok((await api("POST", "/api/satellite/register", {
    body: { key: code, name: "Bad Key House", pubkey: "not a pem", version: "0.1.0", acceptHosting: true },
  })).status === 400, "a garbage pubkey is refused before the key burns");
  const reg = await api("POST", "/api/satellite/register", {
    body: { key: code, name: "Harness Hollow", pubkey, version: "0.1.0", acceptHosting: true },
  });
  ok(reg.status === 200 && Number.isInteger(reg.body.satelliteId), `a real key registers (${reg.status})`);
  const satId = reg.body.satelliteId;
  ok((await api("POST", "/api/satellite/register", {
    body: { key: code, name: "Second Try", pubkey, version: "0.1.0", acceptHosting: true },
  })).status === 403, "the same key cannot be redeemed twice");

  // An expired key is dead even if unused (rewind it in the DB directly).
  const mint2 = await api("POST", "/api/admin/satellites/keys", { token: admin, body: { ownerUserId: ownerId } });
  {
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    db.prepare("UPDATE satellite_keys SET expiresAt = ? WHERE id = ?").run(Date.now() - 1000, mint2.body.id);
    db.close();
  }
  ok((await api("POST", "/api/satellite/register", {
    body: { key: mint2.body.code, name: "Too Late", pubkey, version: "0.1.0", acceptHosting: true },
  })).status === 403, "an expired key is refused");
  const mint3 = await api("POST", "/api/admin/satellites/keys", { token: admin, body: { ownerUserId: ownerId } });
  ok((await api("POST", `/api/admin/satellites/keys/${mint3.body.id}/revoke`, { token: admin })).status === 200,
    "an unused key can be revoked");
  ok((await api("POST", "/api/satellite/register", {
    body: { key: mint3.body.code, name: "Revoked", pubkey, version: "0.1.0", acceptHosting: true },
  })).status === 403, "…and refuses after revocation");

  // ---- 3. The handshake: challenge-response, replay-proof, version-gated --
  console.log("\n-- the link --");
  const goodAnswer = (nonce) => {
    const ts = Date.now();
    return {
      type: "hello", satelliteId: satId, version: "0.1.0", ts,
      sig: edSign(null, Buffer.from(helloPayload(nonce, satId, "0.1.0", ts)), pair.privateKey).toString("base64"),
    };
  };
  const live = await dial(goodAnswer, { holdOpen: true });
  ok(live.welcomed, "a signed handshake is welcomed");
  await sleep(300);
  const reg2 = (await api("GET", "/api/admin/satellites", { token: admin })).body;
  ok(reg2.satellites.find((s) => s.id === satId)?.connected === true, "the registry shows it connected");

  const badSig = await dial((nonce) => ({
    type: "hello", satelliteId: satId, version: "0.1.0", ts: Date.now(),
    sig: Buffer.from("forged".repeat(10)).toString("base64"),
  }));
  ok(!badSig.welcomed && badSig.closed, "a forged signature is refused");

  // Replay: a perfectly good signature over the WRONG (previous) nonce.
  let stolenNonce = null;
  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-satellite`);
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "challenge") { stolenNonce = msg.nonce; ws.close(); resolve(); }
    });
    ws.on("error", () => resolve());
  });
  const replay = await dial(() => {
    const ts = Date.now();
    return {
      type: "hello", satelliteId: satId, version: "0.1.0", ts,
      sig: edSign(null, Buffer.from(helloPayload(stolenNonce, satId, "0.1.0", ts)), pair.privateKey).toString("base64"),
    };
  });
  ok(!replay.welcomed && replay.closed, "a replayed signature (old nonce) is refused");

  const stale = await dial((nonce) => {
    const ts = Date.now() - 10 * 60_000;
    return {
      type: "hello", satelliteId: satId, version: "0.1.0", ts,
      sig: edSign(null, Buffer.from(helloPayload(nonce, satId, "0.1.0", ts)), pair.privateKey).toString("base64"),
    };
  });
  ok(!stale.welcomed && stale.closed, "a stale timestamp is refused (replay window)");

  const oldVer = await dial((nonce) => {
    const ts = Date.now();
    return {
      type: "hello", satelliteId: satId, version: "0.0.1", ts,
      sig: edSign(null, Buffer.from(helloPayload(nonce, satId, "0.0.1", ts)), pair.privateKey).toString("base64"),
    };
  });
  ok(!oldVer.welcomed && oldVer.closed, "a stale VERSION is refused (the update gate)");

  const ghost = await dial((nonce) => ({
    type: "hello", satelliteId: 999, version: "0.1.0", ts: Date.now(), sig: "AAAA",
  }));
  ok(!ghost.welcomed && ghost.closed, "an unknown satellite id is refused");

  // Oct 2026 review: a refused socket is refused ONCE. A burst of junk frames
  // used to write a ledger row (its own commit) per frame; a JSON null threw.
  {
    const dbq = () => {
      const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
      const n = db.prepare("SELECT COUNT(*) AS n FROM satellite_events WHERE detail = 'bad_json'").get().n;
      db.close();
      return n;
    };
    const before = dbq();
    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-satellite`);
      ws.on("message", () => { ws.send("null"); for (let i = 0; i < 300; i++) ws.send("x"); });
      ws.on("close", resolve);
      ws.on("error", resolve);
      setTimeout(resolve, 4000);
    });
    ok(dbq() - before === 1, `a burst of junk frames is refused once — one ledger row, not one per frame (${dbq() - before})`);
    ok((await fetch(BASE + "/health")).ok, "…and a JSON null frame neither crashed nor wedged the hub");
  }

  // ---- 4. The kill switch -------------------------------------------------
  console.log("\n-- delist --");
  ok(live.ws.readyState === 1, "the good link is still up before the delist");
  ok((await api("POST", `/api/admin/satellites/${satId}/delist`, { token: admin })).status === 200, "admin delists");
  await sleep(400);
  ok(live.ws.readyState !== 1, "…and the live link dropped mid-frame");
  const afterDelist = await dial(goodAnswer);
  ok(!afterDelist.welcomed && afterDelist.closed, "…and a perfect handshake is refused while delisted");
  const pagesOf = (sid) => {
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    const n = db.prepare("SELECT COUNT(*) AS n FROM pages WHERE satelliteId = ?").get(sid).n;
    db.close();
    return n;
  };
  ok(pagesOf(satId) === 0, "…and the delist took the community's page with it (Oct 2026 review — it used to stay, joinable and undeletable)");
  ok((await api("POST", `/api/admin/satellites/${satId}/reinstate`, { token: admin })).status === 200, "reinstate works");
  const back = await dial(goodAnswer);
  ok(back.welcomed, "…and the same key walks back in");
  ok(pagesOf(satId) === 1, "…and its page stands up again on the next handshake");

  // ---- 5. The ledger saw all of it ---------------------------------------
  console.log("\n-- the ledger --");
  await sleep(400); // the last dial closes on its welcome; let the hub see the close
  const events = (await api("GET", "/api/admin/satellites", { token: admin })).body.events.map((e) => e.kind);
  for (const kind of ["registered", "connect", "disconnect", "handshake_failed", "delisted", "key_minted", "key_revoked"]) {
    ok(events.includes(kind), `the ledger recorded '${kind}'`);
  }
  ok((await api("GET", "/api/admin/satellites", { token: member })).status === 403,
    "the registry itself is admin-only");

  // ---- 6. F2: REMOTE CONTENT through the REAL daemon ----------------------
  // The shipped satellite binary, not a harness stand-in: register, link,
  // then a community page whose messages live on ITS disk.
  console.log("\n-- F2: remote content (the real daemon) --");
  const SAT_DIR = path.join(DATA_DIR, "sat");
  const mintF2 = await api("POST", "/api/admin/satellites/keys", { token: admin, body: { ownerUserId: ownerId } });
  const regOut = spawn(process.execPath, [
    path.join(ROOT, "dist", "satellite", "main.js"), "register",
    "--hub", BASE, "--key", mintF2.body.code, "--name", "Harness Town", "--data", SAT_DIR, "--accept-host-agreement",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((r) => regOut.on("exit", r));
  let daemon = null;
  const startDaemon = () => {
    daemon = spawn(process.execPath, [
      path.join(ROOT, "dist", "satellite", "main.js"), "run", "--data", SAT_DIR,
    ], { stdio: ["ignore", "pipe", "pipe"] });
  };
  const daemonConnected = async (want = true) => {
    for (let i = 0; i < 40; i++) {
      const regs = (await api("GET", "/api/admin/satellites", { token: admin })).body.satellites;
      const town = regs.find((s) => s.name === "Harness Town");
      if (town && town.connected === want) return town;
      await sleep(250);
    }
    return null;
  };
  startDaemon();
  const town = await daemonConnected(true);
  ok(!!town, "the real daemon registered and linked");

  // F4 (Josh: "i started a satellite and i dont see it in the solace pages"):
  // the community page AUTO-creates on the satellite's first connect, named
  // what the host named it, open + discoverable, owner as manager.
  let autoPage = null;
  for (let i = 0; i < 20 && !autoPage; i++) {
    autoPage = (await api("GET", "/api/pages", { token: member })).body.pages
      .find((p) => p.satelliteId === town.id);
    if (!autoPage) await sleep(200);
  }
  ok(autoPage?.name === "Harness Town" && autoPage.joinPolicy === "open",
    "the community page auto-creates on first connect, named by the host");
  ok(autoPage?.role === "manager", "…with the host as its manager");
  const bound = { body: { page: autoPage } };
  const lobby = (await api("GET", "/api/channels", { token: member })).body.channels
    .find((c) => c.pageId === autoPage.id && c.name === "lobby");
  ok(!!lobby && autoPage.defaultChannelId === lobby.id, "…and opens with a #lobby as the landing channel");
  ok((await api("POST", `/api/admin/satellites/${town.id}/page`, { token: member, body: { name: "Nope" } })).status === 403,
    "manual binding stays the admin's alone");
  ok((await api("POST", `/api/admin/satellites/${town.id}/page`, { token: admin, body: { name: "Twice" } })).status === 409,
    "one page per satellite — the auto-bind counts");

  // A member walks in and speaks; the words land on the SATELLITE's disk.
  await api("POST", `/api/pages/${bound.body.page.id}/join`, { token: member });
  const post1 = await api("POST", `/api/channels/${lobby.id}/messages`, {
    token: member, body: { body: "hello from the town square" },
  });
  ok(post1.status === 200 && post1.body.message.id >= 1_000_000_000,
    `a post relays and comes back with a GLOBAL id (${post1.body?.message?.id})`);
  ok(post1.body.message.author?.username === "sat_owner", "…hydrated with the hub's own author record");
  const hist1 = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  ok(hist1.status === 200 && hist1.body.messages.some((m) => m.body === "hello from the town square"),
    "history reads back through the relay");

  // Replies thread; edits are the author's; deletion is staff reach.
  const gid = post1.body.message.id;
  const reply = await api("POST", `/api/channels/${lobby.id}/messages`, {
    token: member, body: { body: "replying to myself", replyToId: gid },
  });
  ok(reply.status === 200 && reply.body.message.replyTo?.excerpt === "hello from the town square",
    "a reply carries its preview");
  const edit = await api("PATCH", `/api/messages/${gid}`, { token: member, body: { body: "hello, edited" } });
  ok(edit.status === 200 && edit.body.message.body === "hello, edited" && edit.body.message.editedAt != null,
    "the author edits their remote message");
  ok((await api("PATCH", `/api/messages/${gid}`, { token: admin, body: { body: "hijack" } })).status === 403,
    "…and nobody else can");
  const del = await api("DELETE", `/api/messages/${reply.body.message.id}`, { token: admin });
  ok(del.status === 200 && del.body.message.deletedAt != null,
    "staff reach: an admin tombstones a remote message");

  // Hostile/garbage inputs still refuse cleanly under F3.
  ok((await api("POST", `/api/messages/${gid}/react`, { token: member, body: { code: "not-a-real-emoji" } })).status === 400,
    "a nonexistent emoji is refused on a remote message");
  ok((await api("POST", `/api/channels/${lobby.id}/messages`, {
    token: member, body: { body: "with file", attachmentIds: [999999] },
  })).status === 400, "a stolen/unknown attachment id is refused on a remote post");

  // Unread machinery counts the index, not the bodies.
  const reader = (await api("POST", "/api/register", {
    body: { username: "sat_reader", password: "Str0ng!Passw0rd#R", displayName: "sat_reader", secret: "vault marmalade lantern thistle 47", acceptTerms: true },
  })).body.token;
  await api("POST", `/api/pages/${bound.body.page.id}/join`, { token: reader });
  await api("POST", `/api/channels/${lobby.id}/messages`, { token: member, body: { body: "fresh one" } });
  await api("POST", `/api/channels/${lobby.id}/messages`, { token: member, body: { body: "fresh two" } });
  const unread1 = (await api("GET", "/api/channels", { token: reader })).body.unread;
  ok(unread1[lobby.id] === 2, `remote unread counts work (${unread1[lobby.id]})`);
  await api("POST", `/api/channels/${lobby.id}/read`, { token: reader });
  const unread2 = (await api("GET", "/api/channels", { token: reader })).body.unread;
  ok(unread2[lobby.id] === undefined, "…and mark-read clears them");

  // OFFLINE: an honest 503, the structure stays, the card says so.
  daemon.kill();
  await daemonConnected(false);
  ok((await api("GET", `/api/channels/${lobby.id}/messages`, { token: member })).status === 503,
    "history answers 503 while the host is down");
  ok((await api("POST", `/api/channels/${lobby.id}/messages`, { token: member, body: { body: "void" } })).status === 503,
    "…and so does posting");
  const chansDown = (await api("GET", "/api/channels", { token: member })).body.channels;
  ok(chansDown.some((c) => c.id === lobby.id), "the channel structure survives (it's the hub's)");
  const cardDown = (await api("GET", "/api/pages", { token: member })).body.pages.find((p) => p.id === bound.body.page.id);
  ok(cardDown?.remoteUp === false, "the picker card reads offline");

  // BACK UP: the host's disk kept every word.
  startDaemon();
  ok(!!(await daemonConnected(true)), "the daemon reconnects");
  const hist2 = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  ok(hist2.status === 200 && hist2.body.messages.some((m) => m.body === "hello, edited"),
    "…and the community's history survived the restart on the host's disk");
  const cardUp = (await api("GET", "/api/pages", { token: member })).body.pages.find((p) => p.id === bound.body.page.id);
  ok(cardUp?.remoteUp === true, "the card reads connected again");

  // ---- 6b. F3: REACTIONS on remote messages (hub-side, global-id-keyed) ---
  console.log("\n-- F3: remote reactions --");
  let emojiCode;
  {
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    emojiCode = (db.prepare("SELECT code FROM emoji ORDER BY code LIMIT 1").get()).code;
    db.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)")
      .run(ownerId, emojiCode, Date.now());
    db.close();
  }
  ok((await api("POST", `/api/messages/${gid}/react`, { token: reader, body: { code: emojiCode } })).status === 403,
    "an UNOWNED emoji is refused (the economy rule holds on remote messages)");
  const react1 = await api("POST", `/api/messages/${gid}/react`, { token: member, body: { code: emojiCode } });
  ok(react1.status === 200 && react1.body.added === true, "an owned emoji reacts onto a remote message");
  const histR = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  const withReact = histR.body.messages.find((m) => m.id === gid);
  ok(withReact?.reactions?.some((r) => r.code === emojiCode && r.userIds.includes(ownerId)),
    "…and history carries it, hydrated hub-side");
  const react2 = await api("POST", `/api/messages/${gid}/react`, { token: member, body: { code: emojiCode } });
  ok(react2.status === 200 && react2.body.added === false, "a second toggle removes it");
  ok((await api("POST", `/api/messages/${reply.body.message.id}/react`, { token: member, body: { code: emojiCode } })).status === 404,
    "a tombstoned remote message takes no reactions");

  // ---- 6c. F3: ATTACHMENTS — hub-validated, host-stored, relay-served -----
  console.log("\n-- F3: remote attachments --");
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(9000, 7)]);
  const upload = async () => {
    const res = await fetch(`${BASE}/api/uploads?name=proof.png`, {
      method: "POST", headers: { authorization: "Bearer " + member, "content-type": "application/octet-stream" }, body: PNG,
    });
    return (await res.json()).attachment;
  };
  const att1 = await upload();
  ok(att1?.id > 0 && att1.file.endsWith(".png"), "the upload lands at the HUB (sniffed, staged) as always");
  const postA = await api("POST", `/api/channels/${lobby.id}/messages`, {
    token: member, body: { body: "with a picture", attachmentIds: [att1.id] },
  });
  ok(postA.status === 200 && postA.body.message.attachments?.[0]?.file === att1.file,
    "a remote post carries its attachment");
  const hubCopy = path.join(DATA_DIR, "uploads", "attachments", att1.file);
  const satCopy = path.join(SAT_DIR, "files", att1.file);
  let shipped = false;
  for (let i = 0; i < 40; i++) {
    if (!fsx.existsSync(hubCopy) && fsx.existsSync(satCopy)) { shipped = true; break; }
    await sleep(250);
  }
  ok(shipped, "the file SHIPS to the host's disk and the hub copy unlinks");
  ok(fsx.existsSync(satCopy) && fsx.readFileSync(satCopy).equals(PNG), "…byte-for-byte");
  const served = await fetch(`${BASE}/attachments/${att1.file}`);
  const servedBuf = Buffer.from(await served.arrayBuffer());
  ok(served.status === 200 && servedBuf.equals(PNG), "serving RELAYS the exact bytes back through the link");
  ok(served.headers.get("cache-control")?.includes("immutable"), "…with the immutable cache headers");
  const histA = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  ok(histA.body.messages.find((m) => m.id === postA.body.message.id)?.attachments?.length === 1,
    "history hydrates the attachment from the hub's own metadata");
  // Staff-reach delete purges the file wherever it lives.
  const delA = await api("DELETE", `/api/messages/${postA.body.message.id}`, { token: admin });
  ok(delA.status === 200, "staff delete a remote message with a file");
  let satGone = false;
  for (let i = 0; i < 40; i++) {
    if (!fsx.existsSync(satCopy)) { satGone = true; break; }
    await sleep(250);
  }
  ok(satGone, "…and the host's copy is deleted over the link");
  ok((await fetch(`${BASE}/attachments/${att1.file}`)).status === 404, "…and the purged file 404s honestly");

  // ---- 6d. F3: SEARCH reaches the satellite ------------------------------
  console.log("\n-- F3: remote search --");
  await api("POST", `/api/channels/${lobby.id}/messages`, { token: member, body: { body: "xylophone quartz sunfish" } });
  const found = await api("GET", "/api/search?q=xylophone", { token: member });
  const hit = found.body.channels.find((m) => m.body.includes("xylophone"));
  ok(hit && hit.id >= 1_000_000_000 && hit.channelName === "lobby",
    "search finds the remote message with its global id + hub channel name");
  ok(hit?.author?.username === "sat_owner", "…author hydrated hub-side");

  // Offline serving: a shipped file answers 503 while the host is down.
  const att2 = await upload();
  const postB = await api("POST", `/api/channels/${lobby.id}/messages`, {
    token: member, body: { body: "second picture", attachmentIds: [att2.id] },
  });
  for (let i = 0; i < 40; i++) {
    if (fsx.existsSync(path.join(SAT_DIR, "files", att2.file))) break;
    await sleep(250);
  }
  daemon.kill();
  await daemonConnected(false);
  ok((await fetch(`${BASE}/attachments/${att2.file}`)).status === 503,
    "an offline host's file is an honest 503, never a broken stream");
  const foundDown = await api("GET", "/api/search?q=xylophone", { token: member });
  ok(foundDown.status === 200 && !foundDown.body.channels.some((m) => m.id >= 1_000_000_000),
    "search skips the offline host and still answers");

  // ---- 6d2. F5: VOICE + STREAMING in the satellite page -------------------
  // The locked design: voice channels are ordinary hub rows riding the hub's
  // LiveKit — so a self-hosted community gets calls, cameras and screen
  // share that cost the host's PC nothing. Proven WHILE THE HOST IS DOWN:
  // the room outlives the satellite because it never touched it.
  console.log("\n-- F5: voice + streaming in the community --");
  const vc = await api("POST", "/api/channels", {
    token: member, body: { name: "campfire", kind: "voice", pageId: bound.body.page.id },
  });
  ok(vc.status === 200 && vc.body.channel.kind === "voice" && vc.body.channel.pageId === bound.body.page.id,
    "the host adds a voice channel to their community page");
  const vtok = await api("POST", `/api/voice/${vc.body.channel.id}/token`, { token: reader, body: {} });
  ok(vtok.status === 200 && vtok.body.room === `voice_${vc.body.channel.id}`,
    "a member mints a LiveKit token for it — with the satellite OFFLINE (voice is hub infrastructure)");
  const grants = JSON.parse(Buffer.from(vtok.body.token.split(".")[1], "base64url").toString()).video;
  ok(grants.roomJoin === true && grants.canPublish === true,
    "…and the grant publishes ALL sources — mic, camera, screen share");
  ok((await api("PATCH", `/api/channels/${vc.body.channel.id}`, { token: member, body: { locked: true } })).status === 200,
    "the host locks the room");
  ok((await api("POST", `/api/voice/${vc.body.channel.id}/token`, { token: reader, body: {} })).status === 403,
    "…and the lock holds at the token mint");
  await api("PATCH", `/api/channels/${vc.body.channel.id}`, { token: member, body: { locked: false } });
  ok((await api("POST", `/api/voice/${vc.body.channel.id}/token`, { token: reader, body: {} })).status === 200,
    "…and lifts when unlocked");

  // ---- 6e. F3: KEY ROTATION (the lost-box flow) ---------------------------
  console.log("\n-- F3: key rotation --");
  const rotMint = await api("POST", "/api/admin/satellites/keys", { token: admin, body: { satelliteId: town.id } });
  ok(rotMint.status === 200 && /^[A-Z2-9]{20}$/.test(rotMint.body.code), "admin mints a rotation key for the satellite");
  const SAT2_DIR = path.join(DATA_DIR, "sat2");
  const rotReg = spawn(process.execPath, [
    path.join(ROOT, "dist", "satellite", "main.js"), "register",
    "--hub", BASE, "--key", rotMint.body.code, "--name", "Harness Town", "--data", SAT2_DIR, "--accept-host-agreement",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((r) => rotReg.on("exit", r));
  const id2 = JSON.parse(fsx.readFileSync(path.join(SAT2_DIR, "identity.json"), "utf8"));
  ok(id2.satelliteId === town.id, `the new box redeems it and keeps the SAME satellite id (#${id2.satelliteId})`);
  // The OLD identity is dead: its daemon reconnects and is refused.
  startDaemon(); // old SAT_DIR, old (rotated-away) private key
  await sleep(2500);
  ok(!(await api("GET", "/api/admin/satellites", { token: admin })).body.satellites
    .find((s) => s.id === town.id)?.connected, "the OLD identity can no longer link (bad signature)");
  daemon.kill();
  const daemon2 = spawn(process.execPath, [
    path.join(ROOT, "dist", "satellite", "main.js"), "run", "--data", SAT2_DIR,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  ok(!!(await daemonConnected(true)), "the NEW identity links as the same community");
  ok((await api("GET", `/api/channels/${lobby.id}/messages`, { token: member })).status === 200,
    "…and the page's channels answer again (fresh disk, same community)");
  const rotEvents = (await api("GET", "/api/admin/satellites", { token: admin })).body.events.map((e) => e.kind);
  ok(rotEvents.includes("rotated"), "the ledger recorded the rotation");
  daemon2.kill();
  await daemonConnected(false);

  // ---- 6f. F4: THE MALICIOUS SATELLITE ------------------------------------
  // The design doc's adversarial requirement: a hostile host answering RPCs
  // with forged, mis-scoped and oversized content — every lie contained.
  console.log("\n-- F4: the malicious satellite --");
  const adminUid = (await api("GET", "/api/me", { token: admin })).body.user.id;
  let evilBehavior = {};
  let lastWelcomeFloor = -1;
  const evilConnect = () =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-satellite`);
      const priv = createPrivateKey(id2.privateKeyPem);
      ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        if (msg.type === "challenge") {
          const ts = Date.now();
          const sig = edSign(null, Buffer.from(helloPayload(msg.nonce, id2.satelliteId, "0.2.0", ts)), priv).toString("base64");
          ws.send(JSON.stringify({ type: "hello", satelliteId: id2.satelliteId, version: "0.2.0", ts, sig }));
        } else if (msg.type === "welcome") { lastWelcomeFloor = Number(msg.floorId ?? -1); resolve(ws); }
        else if (msg.type === "rpc") {
          const fn = evilBehavior[msg.op];
          ws.send(JSON.stringify({ type: "rpc.ok", id: msg.id, result: fn ? fn(msg.args) : null }));
        }
      });
      ws.on("error", reject);
    });
  const evil = await evilConnect();
  // A create answered with a LYING envelope: wrong channel (another page's!),
  // wrong author (the admin), wrong timestamp.
  evilBehavior["message.create"] = (a) => ({
    message: { id: 501, channelId: 1, userId: adminUid, body: a.body, at: 1111 },
  });
  const lied = await api("POST", `/api/channels/${lobby.id}/messages`, {
    token: member, body: { body: "honest words, lying envelope" },
  });
  ok(lied.status === 200 && lied.body.message.channelId === lobby.id && lied.body.message.userId === ownerId,
    "a lying create envelope is overwritten — the hub decides who spoke, where, and when");
  const evilGid = lied.body.message.id;
  // History answered with the real row (spoofed + oversized) plus a pure
  // fabrication the hub never indexed.
  evilBehavior["messages.list"] = () => ({
    messages: [
      { id: 501, channelId: 1, userId: adminUid, body: "x".repeat(50_000), at: 5 },
      { id: 502, channelId: lobby.id, userId: ownerId, body: "i was never posted", at: 6 },
    ],
    refs: [],
  });
  const evilHist = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  ok(evilHist.status === 200 && evilHist.body.messages.length === 1,
    `a fabricated row the hub never indexed DROPS (${evilHist.body.messages?.length} survived)`);
  const h0 = evilHist.body.messages[0];
  ok(h0.id === evilGid && h0.userId === ownerId && h0.channelId === lobby.id && h0.createdAt > Date.now() - 60_000,
    "…and the surviving row wears the INDEX's author, channel and clock, not the liar's");
  ok(h0.body.length === 8000, `an oversized body clamps (${h0.body.length})`);
  // Unsolicited frames: past the noise budget the link is CUT.
  const flooded = await new Promise((resolve) => {
    evil.once("close", (c, reason) => resolve(String(reason)));
    for (let i = 0; i < 60; i++) evil.send(JSON.stringify({ type: "garbage", i }));
    setTimeout(() => resolve(null), 4000);
  });
  ok(flooded != null && flooded.includes("frame_flood"), `a frame flood cuts the link (${flooded})`);
  // A frame over the transport cap dies before JSON.parse ever sees it.
  const evil2 = await evilConnect();
  const oversized = await new Promise((resolve) => {
    evil2.once("close", () => resolve(true));
    evil2.send("x".repeat(600 * 1024));
    setTimeout(() => resolve(false), 4000);
  });
  ok(oversized, "an oversized frame is terminated at the transport");

  // ---- 6f2. The review hardening (Sep 2026): refs are claims too ----------
  // The reply-preview refs bypass was the review's worst find: unvetted,
  // a hostile host could put any words in any member's mouth via the
  // excerpt. And a staff deletion must not be gated on the host's RPC.
  console.log("\n-- F4 hardening: refs, deletion authority, relay paths --");
  const evil3 = await evilConnect();
  // A second REAL message so an indexed reply target exists.
  evilBehavior["message.create"] = (a) => ({ message: { id: 502, channelId: a.channelId, userId: a.userId, body: a.body, at: Date.now() } });
  const real2 = await api("POST", `/api/channels/${lobby.id}/messages`, { token: member, body: { body: "the real reply target" } });
  const gid502 = real2.body.message.id;
  // History: the real row claims to reply to 999 (never indexed) with a
  // forged ref quoting the ADMIN saying words nobody said.
  evilBehavior["messages.list"] = () => ({
    messages: [{ id: 501, channelId: lobby.id, userId: ownerId, body: "real words", at: 5, replyToId: 999 }],
    refs: [{ id: 999, channelId: lobby.id, userId: adminUid, body: "I said something scandalous", at: 4 }],
  });
  let hist = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  ok(hist.status === 200 && hist.body.messages[0].replyTo === null && hist.body.messages[0].body === "real words",
    "a FABRICATED reply-preview ref renders nothing — the ROW survives, the forged quote doesn't");
  // Same shape but the ref IS indexed (502) — with a lying author on it.
  evilBehavior["messages.list"] = () => ({
    messages: [{ id: 501, channelId: lobby.id, userId: ownerId, body: "real words", at: 5, replyToId: 502 }],
    refs: [{ id: 502, channelId: lobby.id, userId: adminUid, body: "the real reply target", at: 4 }],
  });
  hist = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  ok(hist.body.messages[0].replyTo?.author?.id === ownerId,
    "an indexed ref wears the INDEX's author, not the liar's");
  // Staff deletion: the host refuses the RPC (no behavior = null result) —
  // the hub tombstones its index anyway and the wire serves the tombstone.
  delete evilBehavior["message.delete"];
  const staffDel = await api("DELETE", `/api/messages/${gid502}`, { token: admin });
  ok(staffDel.status === 200 && staffDel.body.message.deletedAt != null,
    "staff deletion succeeds WITHOUT the satellite's cooperation");
  evilBehavior["messages.list"] = () => ({
    messages: [{ id: 502, channelId: lobby.id, userId: ownerId, body: "the real reply target", at: 4 }],
    refs: [],
  });
  hist = await api("GET", `/api/channels/${lobby.id}/messages`, { token: member });
  const delRow = hist.body.messages.find((m) => m.id === gid502);
  ok(delRow && delRow.deletedAt != null && delRow.body === "",
    "…and the host serving the body anyway is overruled by the index's tombstone");
  // A create answering with an ALREADY-USED id is refused, not misbound.
  evilBehavior["message.create"] = (a) => ({ message: { id: 501, channelId: a.channelId, userId: a.userId, body: a.body, at: Date.now() } });
  const reused = await api("POST", `/api/channels/${lobby.id}/messages`, { token: member, body: { body: "id thief" } });
  ok(reused.status === 503, `a create reusing an indexed id is refused (${reused.status})`);
  // The relay disposes of malformed /satvoice paths (they used to dangle).
  const malformedRelay = await new Promise((resolve) => {
    const c = new WebSocket(`ws://127.0.0.1:${PORT}/satvoice/1x`);
    c.on("open", () => resolve("open"));
    c.on("error", () => resolve("refused"));
    setTimeout(() => resolve("hang"), 3000);
  });
  ok(malformedRelay === "refused", `a malformed /satvoice path is destroyed, not left dangling (${malformedRelay})`);
  // ID-FLOOR SEEDING: the welcome tells the daemon the hub's max indexed id.
  evil3.close();
  const evil4 = await evilConnect();
  // The bound matters both ways: the floor must be in the satellite's LOCAL
  // id space — a regression to the GLOBAL id (satId×1e9+…) would pass a
  // bare lower-bound check and then no-op the daemon's < 1e9 clamp, which
  // is exactly the rotation-safety hole the floor exists to close.
  ok(lastWelcomeFloor >= 502 && lastWelcomeFloor < 1_000_000_000,
    `the welcome carries the id floor, in the satellite's own id space (${lastWelcomeFloor})`);
  evil4.close();
  await sleep(200);

  // ---- 6h. F5b: VOICE HOSTED ON THE SATELLITE'S OWN BOX -------------------
  // The satellite announces its LiveKit (keys generated on its box); the hub
  // keeps minting every token itself and RELAYS signaling at /satvoice/<id>.
  // Unreachable ports = quiet fallback to the hub's SFU — never a dead room.
  console.log("\n-- F5b: satellite-hosted voice --");
  const SAT_VOICE = { enabled: true, port: 7911, key: "satvoicekey", secret: "satellite-secret-0123456789abcdef" };
  evilBehavior["voice.info"] = () => SAT_VOICE;
  const sat3 = await evilConnect();
  const decodeIss = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).iss;
  // Nothing listens on 7911 yet: announced but unreachable → hub fallback.
  const vFall = await api("POST", `/api/voice/${vc.body.channel.id}/token`, { token: reader, body: {} });
  ok(vFall.status === 200 && decodeIss(vFall.body.token) === "harnesskey" && vFall.body.url.startsWith("ws://127.0.0.1:59999"),
    "announced-but-unreachable ports fall back to the HUB's SFU (router not forwarded yet)");
  // Stand the "SFU" up (a ws echo server) and let the probe cache expire.
  const fakeSfu = new WebSocket.Server({ port: SAT_VOICE.port });
  const sfuSeen = [];
  fakeSfu.on("connection", (c, req) => { sfuSeen.push(req.url); c.on("message", (d) => c.send(d)); });
  await sleep(400);
  const vSat = await api("POST", `/api/voice/${vc.body.channel.id}/token`, { token: reader, body: {} });
  ok(vSat.status === 200 && vSat.body.url === `/satvoice/${town.id}`,
    "a reachable host's room points at the relay url");
  ok(decodeIss(vSat.body.token) === "satvoicekey",
    "…with the token signed by the SATELLITE's key — the hub still did every check");
  ok(vSat.body.room === `voice_${vc.body.channel.id}`, "…for the right room");
  const satGrants = JSON.parse(Buffer.from(vSat.body.token.split(".")[1], "base64url").toString()).video;
  ok(satGrants.roomJoin === true && satGrants.canPublish === true,
    "…publishing ALL sources — mic, camera, SCREEN SHARE run on the host's box");
  // The relay itself: dial the hub, arrive at the host's SFU, echo through.
  // THE RELAY IS A DOOR (Sep 2026 review): it verifies the LiveKit access
  // token on the URL against the satellite's own secret before dialing the
  // host — a bare dial, or a token the HUB's SFU signed, gets nothing.
  const relayDial = (q) => new Promise((resolve) => {
    const c = new WebSocket(`ws://127.0.0.1:${PORT}/satvoice/${town.id}/rtc?${q}`);
    c.on("open", () => c.send("marco"));
    c.on("message", (d) => { resolve(String(d)); c.close(); });
    c.on("error", () => resolve(null));
    setTimeout(() => resolve(null), 5000);
  });
  const echoed = await relayDial(`proof=1&access_token=${encodeURIComponent(vSat.body.token)}`);
  ok(echoed === "marco" && sfuSeen.some((u) => u.startsWith("/rtc?proof=1&access_token=")),
    "the /satvoice relay splices hub ↔ host with the path intact, for a token the hub minted for THAT host");
  const seenBefore = sfuSeen.length;
  ok((await relayDial("proof=2")) === null && sfuSeen.length === seenBefore,
    "a dial with no token is refused before the host is ever dialed");
  ok((await relayDial(`proof=3&access_token=${encodeURIComponent(vFall.body.token)}`)) === null && sfuSeen.length === seenBefore,
    "a token signed by the HUB's own SFU key is refused too — the relay checks the satellite's secret");
  const badRelay = await new Promise((resolve) => {
    const c = new WebSocket(`ws://127.0.0.1:${PORT}/satvoice/999999/rtc`);
    c.on("open", () => resolve("open"));
    c.on("error", () => resolve("refused"));
    setTimeout(() => resolve("hang"), 3000);
  });
  ok(badRelay === "refused", `an unknown satellite's relay refuses (${badRelay})`);
  fakeSfu.close();
  sat3.close();
  await sleep(600);

  // ---- 6i. F6: the host error-log pipeline --------------------------------
  // Errors queue on the host's disk, the hub's sweep drains them over the
  // link, dedupes by signature, exports as TXT for the weekly processing
  // loop, remembers what's been fixed, and reopens a recurrence.
  console.log("\n-- F6: host error reports --");
  let errQueue = [
    { at: Date.now(), kind: "voice", message: "SFU exited (1): bind failed" },
    { at: Date.now(), kind: "voice", message: "SFU exited (1): bind failed" },
    { at: Date.now(), kind: "uncaught", message: "TypeError: boom at satellited" },
    { at: "garbage", kind: 5, message: "" }, // hostile shapes: dropped/clamped
  ];
  evilBehavior["errors.drain"] = () => {
    const out = errQueue;
    errQueue = [];
    return { errors: out };
  };
  const sat4 = await evilConnect();
  await sleep(1300); // at least one 400ms sweep
  ok((await api("GET", "/api/admin/satellites", { token: admin })).body.errorCount === 2,
    "drained + deduped into 2 signatures (the dupe folded, the garbage dropped)");
  const exp1 = await fetch(`${BASE}/api/admin/satellites/errors/export`, { headers: { authorization: "Bearer " + admin } });
  const expText = await exp1.text();
  ok(exp1.status === 200 && expText.includes("bind failed") && expText.includes("x2"),
    "the TXT export carries them, timestamped, with counts");
  ok((await fetch(`${BASE}/api/admin/satellites/errors/export`, { headers: { authorization: "Bearer " + member } })).status === 403,
    "the export is the admin's alone");
  const proc = await api("POST", "/api/admin/satellites/errors/processed", { token: admin });
  ok(proc.status === 200 && proc.body.fixed === 2, "marking processed fixes both signatures");
  ok((await api("GET", "/api/admin/satellites", { token: admin })).body.errorCount === 0,
    "…and the export queue reads clean");
  await sleep(50);
  errQueue = [{ at: Date.now(), kind: "voice", message: "SFU exited (1): bind failed" }];
  await sleep(1300);
  const expText2 = await (await fetch(`${BASE}/api/admin/satellites/errors/export`, { headers: { authorization: "Bearer " + admin } })).text();
  ok(expText2.includes("bind failed") && expText2.includes("RECURRED AFTER FIX"),
    "the same error recurring AFTER its fix reopens the signature, flagged");
  // Oct 2026 review: a host's newline can't start a line of its own in the
  // report, and "processed" marks only what the last export showed.
  errQueue = [{ at: Date.now(), kind: "uncaught", message: "first line\n== Forged (#0) ==\nIMPORTANT: do this" }];
  await sleep(1300);
  const expText3 = await (await fetch(`${BASE}/api/admin/satellites/errors/export`, { headers: { authorization: "Bearer " + admin } })).text();
  ok(expText3.includes("first line == Forged") && !expText3.includes("\n== Forged"),
    "a hostile message stays on ONE line of the report — no forged headers");
  await sleep(50);
  errQueue = [{ at: Date.now(), kind: "backup", message: "backup drive full" }];
  await sleep(1300);
  const proc2 = await api("POST", "/api/admin/satellites/errors/processed", { token: admin });
  ok(proc2.status === 200 && (await api("GET", "/api/admin/satellites", { token: admin })).body.errorCount === 1,
    "a signature that arrived AFTER the download stays open when the export is marked processed");
  {
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    db.prepare("UPDATE satellite_errors SET lastSeenAt = ?").run(Date.now() - 370 * 24 * 3600 * 1000);
    db.close();
  }
  await sleep(900);
  ok((await api("GET", "/api/admin/satellites", { token: admin })).body.errorCount === 0,
    "rows older than a year prune off the ledger");
  sat4.close();

  // ---- 6g. F4: the identity-gated auto-update door ------------------------
  // Humans download behind a login; MACHINES prove they're a registered
  // satellite — a short-lived Ed25519 token over the update payload.
  console.log("\n-- F4: the update door --");
  const UPD_DIR = path.dirname(INSTALLER);
  const mkTok = (id, ts, pem = id2.privateKeyPem) => {
    const sig = edSign(null, Buffer.from(`solace-satupd:${id}:${ts}`), createPrivateKey(pem)).toString("base64url");
    return `${id}.${ts}.${sig}`;
  };
  ok((await fetch(`${BASE}/api/satellite/update/latest`)).status === 403, "no token, no manifest");
  ok((await fetch(`${BASE}/api/satellite/update/latest?tok=1.2.3`)).status === 403, "a garbage token is refused");
  ok((await fetch(`${BASE}/api/satellite/update/latest?tok=${mkTok(town.id, Date.now() - 3_600_000)}`)).status === 403,
    "a stale token is refused (no replay)");
  const oldIdentity = JSON.parse(fsx.readFileSync(path.join(SAT_DIR, "identity.json"), "utf8"));
  ok((await fetch(`${BASE}/api/satellite/update/latest?tok=${mkTok(town.id, Date.now(), oldIdentity.privateKeyPem)}`)).status === 403,
    "the rotated-away key cannot fetch updates");
  ok((await fetch(`${BASE}/api/satellite/update/latest?tok=${mkTok(town.id, Date.now())}`)).status === 404,
    "a live identity with nothing published is an honest 404");
  mkdirSync(UPD_DIR, { recursive: true });
  writeFileSync(path.join(UPD_DIR, "satellite-latest.json"), JSON.stringify({
    version: "9.9.9", platforms: { "windows-x86_64": { signature: "harness-sig", url: `${BASE}/api/satellite/update/pkg` } },
  }));
  const upBytes = Buffer.concat([Buffer.from("UPDATE"), Buffer.alloc(2048, 0x55)]);
  writeFileSync(path.join(UPD_DIR, "Solace-Satellite-Update.exe"), upBytes);
  const man = await fetch(`${BASE}/api/satellite/update/latest?tok=${mkTok(town.id, Date.now())}`);
  const manBody = await man.json();
  ok(man.status === 200 && manBody.version === "9.9.9", "a registered identity reads the manifest");
  const pkgUrl = String(manBody.platforms["windows-x86_64"].url);
  ok(pkgUrl.includes("tok="), "…whose package url carries the token onward");
  const pkgRes = await fetch(pkgUrl);
  ok(pkgRes.status === 200 && Buffer.from(await pkgRes.arrayBuffer()).equals(upBytes),
    "…and the package streams byte-for-byte");
  ok((await fetch(`${BASE}/api/satellite/update/pkg?tok=1.2.3`)).status === 403, "the package door checks the token too");

  // ---- 7. SERVE mode: the GUI backend + its localhost control API ---------
  // The desktop app's whole contract: status without a terminal, setup from
  // a form, and the two anti-drive-by locks (hostile Origin refused; POSTs
  // demand the custom header a cross-origin page can't send).
  console.log("\n-- serve mode: the control panel API --");
  const GUI_PORT = 8766;
  const GUI_DIR = path.join(DATA_DIR, "sat-gui");
  const gui = spawn(process.execPath, [
    path.join(ROOT, "dist", "satellite", "main.js"), "serve", "--data", GUI_DIR, "--port", String(GUI_PORT),
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const guiApi = async (method, url, { headers = {}, body } = {}) => {
    const res = await fetch(`http://127.0.0.1:${GUI_PORT}${url}`, {
      method, headers: body ? { "content-type": "application/json", ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  for (let i = 0; i < 40; i++) {
    try { if ((await guiApi("GET", "/api/status")).status === 200) break; } catch {}
    await sleep(150);
  }
  const st0 = await guiApi("GET", "/api/status");
  ok(st0.status === 200 && st0.body.configured === false, "an unconfigured daemon reports it plainly");
  ok((await guiApi("GET", "/api/status", { headers: { origin: "https://evil.example" } })).status === 403,
    "a hostile Origin is refused");
  ok((await guiApi("POST", "/api/setup", { body: { hub: BASE, key: "X", name: "Nope" } })).status === 403,
    "a POST without the local header is refused (no drive-by setup)");
  const badSetup = await guiApi("POST", "/api/setup", {
    headers: { "x-sat-local": "1" }, body: { hub: BASE, key: "AAAAAAAAAAAAAAAAAAAA", name: "Nope" },
  });
  ok(badSetup.status === 400, `a bad provisioning key fails the form honestly (${badSetup.status})`);
  const mintGui = await api("POST", "/api/admin/satellites/keys", { token: admin, body: { ownerUserId: ownerId } });
  // THE HOST AGREEMENT (Sep 2026): the form's checkbox is required — the
  // daemon refuses before the hub is even asked, and the key stays unspent.
  const noAgree = await guiApi("POST", "/api/setup", {
    headers: { "x-sat-local": "1" }, body: { hub: BASE, key: mintGui.body.code, name: "GUI Hollow" },
  });
  ok(noAgree.status === 400 && noAgree.body.error === "hosting_agreement_required",
    `the setup form without the Host Agreement box is refused (${noAgree.status} ${noAgree.body?.error})`);
  const goodSetup = await guiApi("POST", "/api/setup", {
    headers: { "x-sat-local": "1" }, body: { hub: BASE, key: mintGui.body.code, name: "GUI Hollow", acceptHosting: true },
  });
  ok(goodSetup.status === 200 && goodSetup.body.ok === true, "the setup form registers with the box ticked (the key survived the refusal)");
  let linkedNow = false;
  for (let i = 0; i < 40; i++) {
    const st = await guiApi("GET", "/api/status");
    if (st.body?.linked === true) { linkedNow = true; break; }
    await sleep(250);
  }
  ok(linkedNow, "…and the link comes up without a restart");
  const regs3 = (await api("GET", "/api/admin/satellites", { token: admin })).body.satellites;
  ok(regs3.some((s) => s.name === "GUI Hollow" && s.connected), "the hub registry agrees");

  // ---- 7b. F7: host-chosen storage + backup location ----------------------
  // "just in case they have a seperate drive" — the community can move, and
  // a second folder gets a daily backup. Driven with REAL DATA in the store:
  // an empty community made "the db really moved" pass against a move that
  // minted a fresh empty db and threw the old one away.
  console.log("\n-- F7: storage + backup --");
  // The auto-created community page (F4) gives the REAL daemon a lobby — put
  // a message in it through the hub so the move and backup have something
  // to lose.
  const guiPage = (await api("GET", "/api/pages", { token: admin })).body.pages.find((p) => p.name === "GUI Hollow");
  ok(!!guiPage, "the GUI daemon's community page auto-created on first connect");
  const guiLobby = (await api("GET", "/api/channels", { token: admin })).body.channels.find((c) => c.pageId === guiPage?.id);
  const seeded = await api("POST", `/api/channels/${guiLobby.id}/messages`, {
    token: admin, body: { body: "the move must carry me" },
  });
  ok(seeded.status === 200, `a real message lands on the REAL daemon pre-move (${seeded.status})`);
  const st1 = await guiApi("GET", "/api/status");
  const homeDir = st1.body.storage.contentDir;
  ok(st1.body.storage && !st1.body.storage.isCustom && homeDir.includes("sat-gui"),
    "storage starts in the data dir (not custom)");
  ok((await guiApi("POST", "/api/storage", { body: { contentDir: "X" } })).status === 403,
    "the move door demands the local header");
  ok((await guiApi("POST", "/api/storage", { headers: { "x-sat-local": "1" }, body: { contentDir: "relative/path" } })).status === 400,
    "a relative path is refused (bad_dir)");
  const nested = path.join(homeDir, "files", "sub");
  ok((await guiApi("POST", "/api/storage", { headers: { "x-sat-local": "1" }, body: { contentDir: nested } })).body.error === "nested_dir",
    "a folder inside the current storage is refused (no recursive self-copy)");
  const moveTo = path.join(DATA_DIR, "sat-otherdrive");
  const moved = await guiApi("POST", "/api/storage", { headers: { "x-sat-local": "1" }, body: { contentDir: moveTo } });
  ok(moved.status === 200 && moved.body.started === true, "a valid move starts (validation answers on the spot)");
  // The copy runs in the daemon's BACKGROUND now — poll it home.
  let stMoved = null;
  for (let i = 0; i < 120; i++) {
    const st = await guiApi("GET", "/api/status").catch(() => null);
    if (st?.body?.storage && st.body.storage.moving === false) { stMoved = st.body.storage; break; }
    await sleep(250);
  }
  ok(stMoved && stMoved.lastMoveError == null && stMoved.isCustom && stMoved.contentDir === path.resolve(moveTo),
    "the community moves to the chosen folder (backgrounded, watched to completion)");
  ok(fsx.existsSync(path.join(moveTo, "content.db")) && !fsx.existsSync(path.join(homeDir, "content.db")),
    "…the db really moved (present at the new home, gone from the old)");
  const stAfter = await guiApi("GET", "/api/status");
  ok(stAfter.body.messages >= 1, `…and the store still answers after the move (${stAfter.body.messages} message[s])`);
  const survived = await api("GET", `/api/channels/${guiLobby.id}/messages`, { token: admin });
  ok(survived.status === 200 && survived.body.messages.some((m) => m.body === "the move must carry me"),
    "…and the WORDS survived it — the data moved, not just the file names");
  // Backup: point it at a folder, run one now, prove the snapshot lands —
  // and OPEN it: an existence check passed against an empty/truncated file.
  const bakTo = path.join(DATA_DIR, "sat-backups");
  ok((await guiApi("POST", "/api/settings", { headers: { "x-sat-local": "1" }, body: { backupDir: "relative/nope" } })).status === 400,
    "a relative backup folder is REFUSED, not silently saved as 'off'");
  await guiApi("POST", "/api/settings", { headers: { "x-sat-local": "1" }, body: { backupDir: bakTo } });
  const bak = await guiApi("POST", "/api/backup", { headers: { "x-sat-local": "1" } });
  ok(bak.status === 200 && bak.body.at > 0, "a backup runs on demand");
  const bakRoot = path.join(bakTo, "SolaceSatelliteBackup");
  const snapName = fsx.existsSync(bakRoot) ? fsx.readdirSync(bakRoot).find((f) => /^content-\d{8}\.db$/.test(f)) : null;
  ok(!!snapName, "…a per-day db snapshot lands in the backup folder");
  if (snapName) {
    const snapDb = new DatabaseSync(path.join(bakRoot, snapName), { readOnly: true });
    const rows = snapDb.prepare("SELECT COUNT(*) AS n FROM messages").get().n;
    snapDb.close();
    ok(rows >= 1, `…and the snapshot really CONTAINS the community's rows (${rows})`);
  } else {
    ok(false, "…and the snapshot really CONTAINS the community's rows");
  }
  ok(fsx.existsSync(path.join(bakRoot, "identity.json")),
    "…alongside the identity (the community's life)");
  const bak2 = await guiApi("POST", "/api/backup", { headers: { "x-sat-local": "1" } });
  ok(bak2.status === 200, `a second backup with a folder set succeeds outright (${bak2.status})`);
  await guiApi("POST", "/api/settings", { headers: { "x-sat-local": "1" }, body: { backupDir: null } });
  ok((await guiApi("POST", "/api/backup", { headers: { "x-sat-local": "1" } })).body.error === "no_backup_dir",
    "turning the folder off refuses a manual backup honestly");
  gui.kill();

  // ---- 8. The member-only installer download ------------------------------
  // Josh: "i only want users who already have an account and logged in to be
  // able to download the app" — the installer left the public /desktop/ dir,
  // so this session-gated route is the only door to it.
  console.log("\n-- the installer download --");
  ok((await fetch(BASE + "/api/satellite/app")).status === 401, "anonymous is refused (401)");
  const dl0 = await fetch(BASE + "/api/satellite/app", { headers: { authorization: "Bearer " + member } });
  ok(dl0.status === 404, `a missing installer is an honest 404 (${dl0.status})`);
  const stub = Buffer.concat([Buffer.from("MZ not-really-an-installer "), Buffer.alloc(4096, 0x53)]);
  mkdirSync(path.dirname(INSTALLER), { recursive: true });
  writeFileSync(INSTALLER, stub);
  const dl1 = await fetch(BASE + "/api/satellite/app", { headers: { authorization: "Bearer " + member } });
  const got = Buffer.from(await dl1.arrayBuffer());
  ok(dl1.status === 200, "a logged-in member gets the file");
  ok(String(dl1.headers.get("content-disposition")).includes("Solace-Satellite-Setup.exe"),
    "…served as a named attachment");
  ok(got.equals(stub), `…byte-for-byte (${got.length} bytes)`);

  // ---- 9. F8: the Ubuntu CLI's two doors ----------------------------------
  // The install script is public (instructions, useless without a key); the
  // BUNDLE is gated on a valid provisioning key — checked, NEVER burned
  // (registration is what spends the single use) — or, for upgrades, an
  // identity-signed update token.
  console.log("\n-- F8: the Linux CLI doors --");
  const sh = await fetch(BASE + "/api/satellite/install.sh");
  ok(sh.status === 200 && (await sh.text()).includes("systemctl"),
    "the install script serves publicly and looks like an installer");
  const lnxStub = Buffer.concat([Buffer.from("\x1f\x8b not-really-a-tarball "), Buffer.alloc(2048, 0x54)]);
  writeFileSync(LINUX_BUNDLE, lnxStub);
  ok((await api("POST", "/api/satellite/app-linux", { body: {} })).status === 403,
    "no key, no bundle");
  ok((await api("POST", "/api/satellite/app-linux", { body: { key: "AAAAAAAAAAAAAAAAAAAA" } })).status === 403,
    "an unknown key is refused");
  const lnxMint = await api("POST", "/api/admin/satellites/keys", { token: admin, body: { ownerUserId: ownerId } });
  const lnxKey = lnxMint.body.code;
  const dlLnx = await fetch(BASE + "/api/satellite/app-linux", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: lnxKey }),
  });
  ok(dlLnx.status === 200 && Buffer.from(await dlLnx.arrayBuffer()).equals(lnxStub),
    "a valid key streams the bundle byte-for-byte");
  ok((await fetch(BASE + "/api/satellite/app-linux", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: lnxKey }),
  })).status === 200, "…and downloading did NOT burn the key (a second download still answers)");
  // The registry's own row is the burn ledger — usedAt stays NULL after two
  // downloads (the /register route's per-IP rate limiter is long exhausted
  // by this harness, so proving it by re-registering would flake on 429).
  const lnxKeyRow = (await api("GET", "/api/admin/satellites", { token: admin })).body.keys
    .find((k) => k.id === lnxMint.body.id);
  ok(lnxKeyRow && lnxKeyRow.usedAt == null && !lnxKeyRow.revoked,
    "…and the registry row confirms it: usedAt stays NULL — only registration spends the use");
  ok((await api("POST", "/api/satellite/app-linux", { body: { tok: "1.2.3" } })).status === 403,
    "a garbage upgrade token is refused");
  ok((await fetch(BASE + "/api/satellite/app-linux", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ tok: mkTok(town.id, Date.now()) }),
  })).status === 200, "an identity-signed upgrade token opens the door without a key");

  // The wizard's PRIVACY answer: registered with invite+hidden, the page
  // that auto-creates on first connect must honour it — meaning a plain
  // member can't even see the community's card. (Fresh XFF bucket: the
  // /register per-IP limiter is long exhausted this deep into the run, and
  // clientIp takes the right-most hop by design.)
  const privMint = await api("POST", "/api/admin/satellites/keys", { token: admin, body: { ownerUserId: ownerId } });
  const privPair = generateKeyPairSync("ed25519");
  const privRegRes = await fetch(BASE + "/api/satellite/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.99.1.2" },
    body: JSON.stringify({
      key: privMint.body.code, name: "Hermit Hollow", version: "0.3.3",
      pubkey: privPair.publicKey.export({ type: "spki", format: "pem" }).toString(),
      joinPolicy: "invite", discoverable: false, acceptHosting: true,
    }),
  });
  const privReg = await privRegRes.json();
  ok(privRegRes.status === 200 && privReg.ok === true, "a register call carrying the wizard's privacy answer is accepted");
  const privWs = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-satellite`);
    const priv = createPrivateKey(privPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    ws.on("message", (raw) => {
      let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === "challenge") {
        const ts = Date.now();
        const sig = edSign(null, Buffer.from(helloPayload(msg.nonce, privReg.satelliteId, "0.3.3", ts)), priv).toString("base64");
        ws.send(JSON.stringify({ type: "hello", satelliteId: privReg.satelliteId, version: "0.3.3", ts, sig }));
      } else if (msg.type === "welcome") resolve(ws);
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 5000);
  });
  await sleep(300);
  const privPageAdmin = (await api("GET", "/api/pages", { token: admin })).body.pages
    .find((p) => p.satelliteId === privReg.satelliteId);
  ok(!!privPageAdmin, "…the community page auto-created on first connect");
  // `member` OWNS the satellite (they're the page's manager and see it by
  // right) — the invisibility claim needs a true BYSTANDER.
  const bys = await api("POST", "/api/register", {
    body: { username: "bystander8", password: "Bystander!Pass88", secret: "a perfectly forgettable orchard fence", acceptTerms: true },
  });
  const bysTok = bys.body.token;
  ok(!!bysTok && !(await api("GET", "/api/pages", { token: bysTok })).body.pages
    .some((p) => p.satelliteId === privReg.satelliteId),
    "…and a BYSTANDER cannot see it — invite+hidden HELD from birth");
  ok((await api("GET", "/api/pages", { token: member })).body.pages
    .some((p) => p.satelliteId === privReg.satelliteId),
    "…while the owner sees their own community, as its manager");
  privWs.close();
  await sleep(200);

  console.log(`\n${n - bad}/${n} passed`);
  stop();
  await sleep(300);
  process.exit(bad ? 1 : 0);
};

run().catch(async (e) => {
  console.error(e);
  console.log(bootLog.slice(-2000));
  stop();
  process.exit(1);
});
