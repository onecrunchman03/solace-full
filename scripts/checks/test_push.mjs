// WEB PUSH — closed-device notifications, end to end (Aug 2026, migration 74).
//
// Run:  npm run build && node scripts/checks/test_push.mjs
//
// Drives a REAL server on a throwaway port AND runs a fake push service on a
// second port, so delivery is proven by an actual encrypted POST arriving —
// not by trusting the sender's return value.
//
// What it pins down:
//   · the VAPID public key is on the wire (and 401 to the world)
//   · subscribe validates its input (bad endpoint / missing keys = 400)
//   · a DM to an OFFLINE user lands one encrypted push at their endpoint
//   · a personal @mention in a channel lands one too
//   · an ONLINE user (live ws) gets NO push — the open app already pings
//   · a user whose status pref is "busy" gets NO push (DND)
//   · unsubscribing stops delivery
//   · an endpoint answering 410 is PRUNED from the table

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { createServer } from "node:https";
import { createECDH, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// A long-lived self-signed cert for the fake push service — web-push always
// speaks TLS, so the endpoint must too. The spawned server runs with
// NODE_TLS_REJECT_UNAUTHORIZED=0 (harness only; production is untouched).
const CERT = `-----BEGIN CERTIFICATE-----
MIIBkDCCATagAwIBAgIUBYlul3d6x7T2/nacWlHiNl/JRlYwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJMTI3LjAuMC4xMCAXDTI2MDgyMzA0MjgwM1oYDzIxMjYwNzMw
MDQyODAzWjAUMRIwEAYDVQQDDAkxMjcuMC4wLjEwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAAT6+psyMS0GudvmIONkyv9h6sAJue0T9Un2uVBQplUwlVTZ0HiA0EI/
gd3sSEI6EoyrHa5DsPQHYH5kaubTDN/2o2QwYjAdBgNVHQ4EFgQUzxZExu0T6Z5b
XLx5m9c9WFU7bx8wHwYDVR0jBBgwFoAUzxZExu0T6Z5bXLx5m9c9WFU7bx8wDwYD
VR0TAQH/BAUwAwEB/zAPBgNVHREECDAGhwR/AAABMAoGCCqGSM49BAMCA0gAMEUC
IBPjMpXh98kc+tzOIxcAz03gvp7sxCihuMKSVctDVe4yAiEAgDiT9VNLwhRKMNpU
0195faAtD1f5au5w65ULUOeCXro=
-----END CERTIFICATE-----`;
const KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgd4QVJ+UM8S5bY8Xw
9PIAv2M/7DSMyDF3u1XNgB9EH/yhRANCAAT6+psyMS0GudvmIONkyv9h6sAJue0T
9Un2uVBQplUwlVTZ0HiA0EI/gd3sSEI6EoyrHa5DsPQHYH5kaubTDN/2
-----END PRIVATE KEY-----`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8504;
const PUSH_PORT = 8505;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "push-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- The fake push service: records every POST, answers per-path ----------
const hits = []; // { path, ttl, bytes }
const pushSvc = createServer({ cert: CERT, key: KEY }, (req, res) => {
  let size = 0;
  req.on("data", (d) => (size += d.length));
  req.on("end", () => {
    hits.push({ path: req.url, ttl: req.headers.ttl ?? null, bytes: size });
    if (req.url.startsWith("/dead")) {
      res.writeHead(410).end();
    } else {
      res.writeHead(201).end();
    }
  });
});
await new Promise((r) => pushSvc.listen(PUSH_PORT, "127.0.0.1", r));

const wavAuth = () => randomBytes(16).toString("base64url");
const clientKeys = () => {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey("base64url"), auth: wavAuth() };
};

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    // The push-host allowlist (Sep 2026) admits only the browsers' push
    // services; the harness's own loopback service is let in by env.
    PUSH_EXTRA_HOSTS: "127.0.0.1",
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
    // The fake push service's cert is self-signed (harness only).
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} try { pushSvc.close(); } catch {} };
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

const waitHits = async (want, ms = 4000) => {
  const t0 = Date.now();
  while (hits.length < want && Date.now() - t0 < ms) await sleep(100);
  return hits.length;
};

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const a = await register("pushsender", pw);
  const b = await register("pushtarget", pw);
  ok(!!a.token && !!b.token, "two members registered");

  // The key + the door.
  ok((await api("GET", "/api/push/key")).status === 401, "anonymous key read refused (401)");
  const key = (await api("GET", "/api/push/key", { token: b.token })).body?.key;
  ok(typeof key === "string" && key.length > 60, "VAPID public key on the wire");

  // Subscribe guards.
  const badUrl = await api("POST", "/api/push/subscribe", {
    token: b.token, body: { endpoint: "ftp://nope", keys: clientKeys() },
  });
  ok(badUrl.status === 400, "non-http(s) endpoint refused (400)");
  const noKeys = await api("POST", "/api/push/subscribe", {
    token: b.token, body: { endpoint: `https://127.0.0.1:${PUSH_PORT}/b1` },
  });
  ok(noKeys.status === 400, "missing crypto keys refused (400)");

  // A real subscription for B (offline — B holds no socket).
  const bKeys = clientKeys();
  const sub = await api("POST", "/api/push/subscribe", {
    token: b.token, body: { endpoint: `https://127.0.0.1:${PUSH_PORT}/b1`, keys: bKeys },
  });
  ok(sub.status === 200, "loopback endpoint subscribed");

  // A DM lands one encrypted push at the endpoint.
  const conv = (await api("POST", "/api/dm", { token: a.token, body: { userId: b.id } })).body;
  const convId = conv?.conversation?.id ?? conv?.id;
  ok(Number.isInteger(convId), "DM conversation opened");
  await api("POST", `/api/dm/${convId}/messages`, { token: a.token, body: { body: "psst — you around?" } });
  await waitHits(1);
  ok(hits.length === 1, "a DM to an offline user pushed exactly once");
  ok(hits[0]?.bytes > 60, "the payload is a real encrypted body");
  hits.length = 0;

  // A personal @mention in #general lands one too.
  await api("POST", "/api/channels/1/messages", { token: a.token, body: { body: "@pushtarget the felt is hot tonight" } });
  await waitHits(1);
  ok(hits.length === 1, "a personal @mention pushed exactly once");
  hits.length = 0;

  // A message with no mention pushes nothing.
  await api("POST", "/api/channels/1/messages", { token: a.token, body: { body: "just talking to the room" } });
  await sleep(1200);
  ok(hits.length === 0, "an unmentioned channel message pushes nothing");

  // ONLINE = no push: B opens a live socket, the DM goes to it instead.
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${b.token}`);
  await new Promise((r) => { ws.onopen = r; ws.onerror = r; });
  await sleep(400); // let the server file the connection
  await api("POST", `/api/dm/${convId}/messages`, { token: a.token, body: { body: "you there?" } });
  await sleep(1500);
  ok(hits.length === 0, "an online user gets no push — the open app pings");
  ws.close();
  await sleep(600); // socket death clears the online set

  // DND: busy status suppresses push even offline.
  await api("PATCH", "/api/me/prefs", { token: b.token, body: { status: "busy" } });
  await api("POST", `/api/dm/${convId}/messages`, { token: a.token, body: { body: "still there?" } });
  await sleep(1500);
  ok(hits.length === 0, "busy (DND) suppresses push");
  await api("PATCH", "/api/me/prefs", { token: b.token, body: { status: null } });

  // …and clearing busy restores delivery.
  await api("POST", `/api/dm/${convId}/messages`, { token: a.token, body: { body: "back to normal" } });
  await waitHits(1);
  ok(hits.length === 1, "clearing DND restores delivery");
  hits.length = 0;

  // BLOCKS (Oct 2026 review): a blocked sender's @mention must not reach the
  // blocker's lock screen.
  await api("POST", `/api/blocks/${a.id}`, { token: b.token });
  await api("POST", "/api/channels/1/messages", { token: a.token, body: { body: "@pushtarget can you hear me now" } });
  await sleep(1500);
  ok(hits.length === 0, "a blocked sender's @mention pushes nothing");
  await api("DELETE", `/api/blocks/${a.id}`, { token: b.token });

  // A BOT'S DM NEVER PUSHES — Sterling's note waits under the door.
  const adm = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } });
  const note = await api("POST", "/api/admin/sterling/notice", { token: adm.body?.token, body: { userId: b.id, kind: "first_legendary" } });
  ok(note.status === 200, "Sterling's private note sent");
  await sleep(1500);
  ok(hits.length === 0, "a bot's DM pushes nothing");
  hits.length = 0;

  // Unsubscribe stops it.
  await api("POST", "/api/push/unsubscribe", { token: b.token, body: { endpoint: `https://127.0.0.1:${PUSH_PORT}/b1` } });
  await api("POST", `/api/dm/${convId}/messages`, { token: a.token, body: { body: "gone quiet" } });
  await sleep(1500);
  ok(hits.length === 0, "unsubscribed device receives nothing");

  // A dead endpoint (410) is pruned from the table on first use.
  await api("POST", "/api/push/subscribe", {
    token: b.token, body: { endpoint: `https://127.0.0.1:${PUSH_PORT}/dead1`, keys: clientKeys() },
  });
  await api("POST", `/api/dm/${convId}/messages`, { token: a.token, body: { body: "into the void" } });
  await waitHits(1);
  hits.length = 0;
  await sleep(800); // let the prune land
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const rows = db.prepare("SELECT COUNT(*) AS c FROM push_subscriptions").get();
  ok(rows.c === 0, "a 410 endpoint is pruned from the table");
  db.close();

  console.log(`\n${n - bad}/${n} web push asserts passed`);
  stop();
  await sleep(300);
  process.exit(bad === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error("harness crashed:", e, "\nserver log tail:\n" + bootLog.slice(-2000));
  stop();
  process.exit(1);
});
