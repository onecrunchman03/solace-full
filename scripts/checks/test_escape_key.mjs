// THE KEY CYCLE — the escape zone over its real wire (E2, Aug 2026).
//
// Run:  npm run build && node scripts/checks/test_escape_key.mjs
//
// A real server, real /ws-escape sockets, dialled-down timers (ER_EXIT_MS,
// ER_KEY_CRUMBLE_MS). What it pins down:
//   · the door's REAL guards live server-side: no pass → refused, a CARRIED
//     gun → refused (a lockered one walks in), anon upgrade → 401
//   · one key, spawned in a LABELED room; picking it up needs reach AND a
//     bag slot (a full bag is refused and the key stays put)
//   · the exit refuses everyone while locked; the key-holder at the exit
//     opens it for EVERYONE for exactly the window; the key is CONSUMED
//   · when the window shuts a fresh key spawns IN A DIFFERENT ROOM
//   · a holder who disconnects resets the key and everyone is told
//   · the crumble clock does the same to a pocketed key
//   · doors: toggled only from reach, broadcast to the room

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8499;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "escape-key-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

const EXIT_MS = 1500;
const CRUMBLE_MS = 2500;

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
    ER_EXIT_MS: String(EXIT_MS),
    ER_KEY_CRUMBLE_MS: String(CRUMBLE_MS),
    ER_DROP_GRACE_MS: "100", // the harness walks bodies out by closing sockets
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

const DB_PATH = path.join(DATA_DIR, "solace.db");
const db = () => new DatabaseSync(DB_PATH);

/** A tiny wire client that queues every frame it hears. */
const wire = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-escape?token=${token}`);
    const inbox = [];
    ws.on("message", (d) => inbox.push(JSON.parse(String(d))));
    ws.on("open", () =>
      resolve({
        ws,
        inbox,
        send: (m) => ws.send(JSON.stringify(m)),
        /** Wait for a frame matching pred (scans backlog first). */
        waitFor: (pred, ms = 4000) =>
          new Promise((res) => {
            const scan = () => {
              const i = inbox.findIndex(pred);
              if (i >= 0) return res(inbox.splice(i, 1)[0]);
              if (Date.now() > t1) return res(null);
              setTimeout(scan, 25);
            };
            const t1 = Date.now() + ms;
            scan();
          }),
      }),
    );
    ws.on("error", reject);
  });

// The server's room table, for driving reach checks.
const ROOMS_SRC = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(ROOT, "src", "casino", "escape-zone.ts"), "utf8"),
);
const ROOMS = [...ROOMS_SRC.matchAll(
  /\{ id: "([A-Z0-9]+)", x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+), door: \{ x: (\d+), y: (\d+) \} \}/g,
)].map((m) => ({ id: m[1], cx: (+m[2] + +m[4] + 1) / 2, cy: (+m[3] + +m[5] + 1) / 2, dx: +m[6], dy: +m[7] }));
const EXIT = { x: 27, y: 22.5 }; // the stub's mouth (er-layout v2)

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  const a = await register("runner", pw);
  const b = await register("witness", pw);
  const c = await register("outsider", pw);
  ok(!!admin && !!a.token && !!b.token && !!c.token, "cast assembled");

  // Fixtures: passes for runner + witness (burned rares), coins for tools.
  {
    const d = db();
    const rares = d.prepare("SELECT code FROM emoji WHERE tier = 'rare' LIMIT 3").all().map((r) => r.code);
    const g = d.prepare("INSERT INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)");
    g.run(a.id, rares[0], Date.now());
    g.run(b.id, rares[1], Date.now());
    d.close();
    ok((await api("POST", "/api/escape/stake", { token: a.token, body: { code: rares[0] } })).status === 200, "runner staked");
    ok((await api("POST", "/api/escape/stake", { token: b.token, body: { code: rares[1] } })).status === 200, "witness staked");
  }

  // ---- the door's real guards --------------------------------------------
  {
    const anon = new WebSocket(`ws://127.0.0.1:${PORT}/ws-escape`);
    const refused = await new Promise((res) => {
      anon.on("error", () => res(true));
      anon.on("open", () => res(false));
    });
    ok(refused, "an anonymous upgrade is refused outright");
  }
  {
    const w = await wire(c.token);
    w.send({ type: "enter" });
    const d = await w.waitFor((m) => m.type === "denied");
    ok(d?.error === "no_pass", "no pass, no entry — server-checked");
    w.ws.close();
  }
  {
    // A CARRIED gun is refused; the same gun in the casino locker walks in.
    const d = db();
    d.prepare("INSERT INTO casino_inv (userId, item, qty) VALUES (?, 'gun', 9)").run(a.id);
    d.close();
    const w = await wire(a.token);
    w.send({ type: "enter" });
    const deny = await w.waitFor((m) => m.type === "denied");
    ok(deny?.error === "gun_carried", "a carried gun is refused at the threshold");
    const d2 = db();
    d2.prepare("DELETE FROM casino_inv WHERE userId = ? AND item = 'gun'").run(a.id);
    d2.prepare("INSERT INTO casino_locker (userId, slot, item, qty) VALUES (?, 0, 'gun', 9)").run(a.id);
    d2.close();
    w.send({ type: "enter" });
    const wel = await w.waitFor((m) => m.type === "welcome");
    ok(!!wel, "…and a LOCKERED gun walks in fine");
    ok(wel.key?.state === "loose" && typeof wel.key.room === "string", "the welcome carries a loose key in a room");
    ok(ROOMS.some((r) => r.id === wel.key.room), "…a LABELED room");
    ok(wel.exitUntil === 0, "…and a locked exit");
    w.ws.close();
    await sleep(150);
  }

  // ---- pickup: reach + the slot law --------------------------------------
  const A = await wire(a.token);
  A.send({ type: "enter" });
  const welA = await A.waitFor((m) => m.type === "welcome");
  const keyRoom1 = welA.key.room;
  const room1 = ROOMS.find((r) => r.id === keyRoom1);
  {
    A.send({ type: "key-take" });
    const far = await A.waitFor((m) => m.type === "denied");
    ok(far?.error === "too_far", "the key is not taken from across the map");
    // Fill the bag to 5 kinds, walk to the key, get refused for space.
    const d = db();
    for (let i = 0; i < 5; i++) d.prepare("INSERT INTO er_inventory (userId, item, qty) VALUES (?, ?, 1)").run(a.id, "junk" + i);
    d.close();
    A.send({ type: "move", x: room1.cx, y: room1.cy, yaw: 0, p: 0 });
    await sleep(80);
    A.send({ type: "key-take" });
    const fullDeny = await A.waitFor((m) => m.type === "denied");
    ok(fullDeny?.error === "bag_full", "a full bag cannot take the key — the slot cost is real");
    const d2 = db();
    d2.prepare("DELETE FROM er_inventory WHERE userId = ? AND item LIKE 'junk%'").run(a.id);
    d2.close();
  }

  // Witness inside, watching.
  const B = await wire(b.token);
  B.send({ type: "enter" });
  await B.waitFor((m) => m.type === "welcome");

  // ---- HOSTILE MOVE FRAMES (Sep 2026 review) -------------------------------
  // The door used to take `Number(x) || 0`: NaN became 0 but Infinity went
  // straight onto every peer's wire as a JSON null, and an off-plate
  // coordinate stood a body where no kill sweep or reach check could find
  // it. A non-finite coordinate is dropped whole now; a finite one is kept
  // inside the complex.
  {
    // A JSON number can't carry Infinity — the STRING "1e999" does, and the
    // server's Number() turns it into one, exactly as a hostile client would.
    A.ws.send(JSON.stringify({ type: "move", x: "1e999", y: room1.cy, yaw: 0, p: 0 }));
    A.ws.send(JSON.stringify({ type: "move", x: "abc", y: room1.cy, yaw: 0, p: 0 }));
    await sleep(200);
    const bad = B.inbox.filter((m) => m.type === "pos" && m.id === a.id && !(Number.isFinite(m.x) && Number.isFinite(m.y)));
    ok(bad.length === 0, "a non-finite coordinate never reaches a peer (the frame is dropped whole)");
    B.inbox.splice(0, B.inbox.length);
    await sleep(60);
    A.send({ type: "move", x: 9999, y: -9999, yaw: 0, p: 0 });
    const clamped = await B.waitFor((m) => m.type === "pos" && m.id === a.id);
    ok(!!clamped && clamped.x < 60 && clamped.y >= 0, "an off-plate coordinate is clamped back inside the complex");
    await sleep(60);
    A.send({ type: "move", x: room1.cx, y: room1.cy, yaw: 0, p: 0 });
    await sleep(80);
  }

  {
    A.send({ type: "key-take" });
    const taken = await B.waitFor((m) => m.type === "key" && m.state === "taken");
    ok(taken?.by === a.id, "the pickup is announced to the room");
    const d = db();
    ok(!!d.prepare("SELECT 1 FROM er_inventory WHERE userId = ? AND item = 'key'").get(a.id), "…and the key sits in the bag");
    d.close();
  }

  // ---- the exit -----------------------------------------------------------
  {
    B.send({ type: "move", x: EXIT.x, y: EXIT.y, yaw: 0, p: 0 });
    await sleep(80);
    B.send({ type: "leave" });
    const locked = await B.waitFor((m) => m.type === "denied");
    ok(locked?.error === "exit_locked", "the exit refuses the keyless while locked");
    B.send({ type: "key-use" });
    const notHolder = await B.waitFor((m) => m.type === "denied");
    ok(notHolder?.error === "not_holder", "only the holder can turn the key");
    A.send({ type: "key-use" });
    const farUse = await A.waitFor((m) => m.type === "denied");
    ok(farUse?.error === "too_far", "…and only AT the exit");
    A.send({ type: "move", x: EXIT.x, y: EXIT.y - 0.5, yaw: 0, p: 0 });
    await sleep(80);
    A.send({ type: "key-use" });
    const open = await B.waitFor((m) => m.type === "exit" && m.until > 0);
    ok(!!open, "the key turns: the exit is open and the room is told");
    const d = db();
    ok(!d.prepare("SELECT 1 FROM er_inventory WHERE userId = ? AND item = 'key'").get(a.id), "…and the key is CONSUMED");
    d.close();
    // ANYONE can leave through the window — the witness goes first.
    B.send({ type: "leave" });
    const left = await B.waitFor((m) => m.type === "left");
    ok(!!left, "the witness (keyless) walks out through the open exit");
    const bye = await A.waitFor((m) => m.type === "bye" && m.id === b.id);
    ok(!!bye, "…and the room sees them go");
    // The window shuts; a fresh key spawns SOMEWHERE ELSE.
    const fresh = await A.waitFor((m) => m.type === "key" && m.state === "spawned", EXIT_MS + 2500);
    ok(!!fresh, "the window shuts and a fresh key spawns");
    ok(fresh.room !== keyRoom1, "…in a DIFFERENT room");
    const shut = await A.waitFor((m) => m.type === "exit" && m.until === 0);
    ok(!!shut, "…and the exit is locked again");
    A.send({ type: "leave" });
    const relock = await A.waitFor((m) => m.type === "denied");
    ok(relock?.error === "exit_locked", "…for real");
  }

  // ---- holder disconnect resets ------------------------------------------
  {
    const wel2 = (await api("GET", "/api/escape", { token: b.token })); // touch, no-op
    void wel2;
    const B2 = await wire(b.token);
    B2.send({ type: "enter" });
    const w2 = await B2.waitFor((m) => m.type === "welcome");
    const kr = w2.key.room;
    const r2 = ROOMS.find((q) => q.id === kr);
    B2.send({ type: "move", x: r2.cx, y: r2.cy, yaw: 0, p: 0 });
    await sleep(80);
    B2.send({ type: "key-take" });
    await A.waitFor((m) => m.type === "key" && m.state === "taken");
    B2.ws.close(); // takes the key with them — or would, if the server let it
    const moved = await A.waitFor((m) => m.type === "key" && m.state === "moved");
    ok(!!moved, "a holder who disconnects resets the key, announced");
    ok(typeof moved.room === "string" && moved.room !== kr, "…into a different room");
    const d = db();
    ok(!d.prepare("SELECT 1 FROM er_inventory WHERE userId = ? AND item = 'key'").get(b.id), "…and out of their bag");
    d.close();
  }

  // ---- the crumble --------------------------------------------------------
  {
    const cur = await A.waitFor((m) => m.type === "key", 100) ?? null;
    void cur;
    // Whereever the key is now, runner grabs it and SITS on it.
    const d = db();
    d.close();
    // Ask the server where the key is via a re-enter snapshot (cheap + honest).
    A.send({ type: "enter" }); // re-enter refreshes the snapshot for the same body
    const snap = await A.waitFor((m) => m.type === "welcome");
    const kr = snap.key.room;
    const r3 = ROOMS.find((q) => q.id === kr);
    A.send({ type: "move", x: r3.cx, y: r3.cy, yaw: 0, p: 0 });
    await sleep(80);
    A.send({ type: "key-take" });
    await A.waitFor((m) => m.type === "key" && m.state === "taken", 2000);
    const crumbled = await A.waitFor((m) => m.type === "key" && m.state === "moved", CRUMBLE_MS + 16_000);
    ok(!!crumbled, "a pocketed key CRUMBLES on the anti-hostage clock");
    const d2 = db();
    ok(!d2.prepare("SELECT 1 FROM er_inventory WHERE userId = ? AND item = 'key'").get(a.id), "…and leaves the bag");
    d2.close();
  }

  // ---- doors --------------------------------------------------------------
  {
    const r = ROOMS.find((q) => q.id === "B6");
    A.send({ type: "door", room: "B6", open: true });
    const far = await A.waitFor((m) => m.type === "denied");
    ok(far?.error === "too_far", "a door is not opened from across the map");
    A.send({ type: "move", x: r.dx + 0.5, y: r.dy + 0.5, yaw: 0, p: 0 });
    await sleep(80);
    const B3 = await wire(b.token);
    B3.send({ type: "enter" });
    await B3.waitFor((m) => m.type === "welcome");
    A.send({ type: "door", room: "B6", open: true });
    const opened = await B3.waitFor((m) => m.type === "door" && m.room === "B6");
    ok(opened?.open === true, "a door toggle reaches the room");
    const snap2w = await wire(c.token); // outsider still can't see in
    snap2w.send({ type: "enter" });
    const still = await snap2w.waitFor((m) => m.type === "denied");
    ok(still?.error === "no_pass", "the outsider is still outside");
    snap2w.ws.close();
    B3.ws.close();
  }

  // ---- the equip wire (E2b: the uniformity pass) --------------------------
  {
    A.send({ type: "equip", eq: "flashlight!" });
    const bare = await A.waitFor((m) => m.type === "denied");
    ok(bare?.error === "not_carried", "you cannot raise a flashlight you don't carry");
    const d = db();
    d.prepare("INSERT INTO er_inventory (userId, item, qty) VALUES (?, 'flashlight', 1)").run(a.id);
    d.close();
    const W = await wire(b.token);
    W.send({ type: "enter" });
    await W.waitFor((m) => m.type === "welcome");
    A.send({ type: "equip", eq: "flashlight!" });
    const lit = await W.waitFor((m) => m.type === "equip" && m.id === a.id);
    ok(lit?.eq === "flashlight!", "a carried torch lights on every peer's wire");
    A.send({ type: "equip", eq: "" });
    const dark = await W.waitFor((m) => m.type === "equip" && m.id === a.id);
    ok(dark?.eq === "", "…and lowers the same way");
    // A newcomer's welcome carries the standing equipment.
    A.send({ type: "equip", eq: "flashlight!" });
    await W.waitFor((m) => m.type === "equip" && m.id === a.id);
    const W2 = await wire(b.token); // second tab replaces, gets a fresh welcome
    W2.send({ type: "enter" });
    const w2 = await W2.waitFor((m) => m.type === "welcome");
    ok(w2?.peers?.find((p) => p.id === a.id)?.eq === "flashlight!",
      "a newcomer walks in on the torches already burning");
    W2.ws.close();
  }

  // ---- E2c: the voice token, the suit, the swig ---------------------------
  {
    // Voice: zone-gated FIRST (this box has no LiveKit creds, so an insider
    // gets 503 voice_disabled — the floor's exact contract).
    const out = await api("POST", "/api/escape/voice-token", { token: c.token });
    ok(out.status === 403 && out.body?.error === "not_inside", "voice tokens are for the people inside");
    const inTok = await api("POST", "/api/escape/voice-token", { token: a.token });
    ok(inTok.status === 503 && inTok.body?.error === "voice_disabled",
      "…an insider on a credless box hears voice_disabled, not a lie");
    // The walkie keys on the same equip wire as the torch.
    const d = db();
    d.prepare("INSERT INTO er_inventory (userId, item, qty) VALUES (?, 'walkie', 1)").run(a.id);
    d.close();
    const W3 = await wire(b.token);
    W3.send({ type: "enter" });
    await W3.waitFor((m) => m.type === "welcome");
    A.send({ type: "equip", eq: "walkie!" });
    const keyed = await W3.waitFor((m) => m.type === "equip" && m.id === a.id);
    ok(keyed?.eq === "walkie!", "a carried walkie keys on the wire");
    // The swig: carried almond drinks once, an empty bag is refused.
    A.send({ type: "consume", item: "almond" });
    const dry = await A.waitFor((m) => m.type === "denied");
    ok(dry?.error === "not_carried", "you cannot drink almond water you don't carry");
    const d2 = db();
    d2.prepare("INSERT INTO er_inventory (userId, item, qty) VALUES (?, 'almond', 1)").run(a.id);
    d2.close();
    A.send({ type: "consume", item: "almond" });
    const drank = await A.waitFor((m) => m.type === "consumed");
    ok(drank?.item === "almond", "a carried bottle drinks");
    const seen = await W3.waitFor((m) => m.type === "drink" && m.id === a.id);
    ok(!!seen, "…and the room sees the swig");
    const d3 = db();
    ok(!d3.prepare("SELECT 1 FROM er_inventory WHERE userId = ? AND item = 'almond'").get(a.id),
      "…and the bottle is spent");
    d3.close();
    A.send({ type: "consume", item: "almond" });
    const dry2 = await A.waitFor((m) => m.type === "denied");
    ok(dry2?.error === "not_carried", "…exactly once — no double-swig from one bottle");
    W3.ws.close();
  }
  {
    // The suit walks in only if the locker owns it (quiet yellow fallback).
    const W4 = await wire(b.token);
    W4.send({ type: "enter", suit: "midnight" });
    const w4 = await W4.waitFor((m) => m.type === "welcome");
    ok(!!w4, "an unowned suit still enters");
    const seenBy = await A.waitFor((m) => m.type === "join" && m.peer?.id === b.id, 2000);
    ok(seenBy ? seenBy.peer.suit === "yellow" : true, "…wearing yellow, not the claimed colorway");
    const d = db();
    d.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'midnight', ?)")
      .run(b.id, Date.now());
    d.close();
    const W5 = await wire(b.token);
    W5.send({ type: "enter", suit: "midnight" });
    await W5.waitFor((m) => m.type === "welcome");
    // Read b's standing suit from a FRESH welcome snapshot — join-frame
    // ordering across a same-user replace is not worth racing.
    const A2 = await wire(a.token);
    A2.send({ type: "enter" });
    const wA2 = await A2.waitFor((m) => m.type === "welcome");
    ok(wA2?.peers?.find((p) => p.id === b.id)?.suit === "midnight",
      "…and an OWNED colorway wears in (a chest skin, worn everywhere)");
    A2.ws.close();
    W5.ws.close();
    W4.ws.close();
  }

  // ---- THE SHARED ANTE + WHERE ARRIVALS STAND (Oct 2026) -------------------
  // Josh: "the escape room in the casino is not a shared instance — I cannot
  // see other players in the ready room or in the actual escape room." The
  // ante was a private scene; every complex arrival was seated at exactly
  // ER_ENTRY (inside each other) and the client ignored where the server put
  // it anyway.
  {
    const fs = await import("node:fs");
    const lay = fs.readFileSync(path.join(ROOT, "client", "src", "casino", "escape", "er-layout.ts"), "utf8");
    const sp = lay.match(/SPAWN_ROOM: Rect = \{ x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+) \}/);
    const sv = ROOMS_SRC.match(/ER_ANTE_ROOM = \{ x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+) \}/);
    ok(!!sp && !!sv && sp.slice(1).join() === sv.slice(1).join(), "the server's ante is the client's SPAWN_ROOM, literal for literal");
    const AW = sp ? +sp[3] - +sp[1] + 1 : 10, AH = sp ? +sp[4] - +sp[2] + 1 : 6;
    const inAnte = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= AW && p.y >= 0 && p.y <= AH;
    const anteFrames = () => A.inbox.filter((m) => String(m.type).startsWith("ante-")).length;
    const anteBefore = anteFrames();

    const P = await wire(b.token); // witness: holds a pass
    const Q = await wire(c.token); // outsider: no pass, ante only
    P.send({ type: "ante-enter" });
    const wp = await P.waitFor((m) => m.type === "ante-welcome");
    ok(inAnte(wp?.you), "ante-enter seats the body IN the ante, and the welcome says where");
    Q.send({ type: "ante-enter" });
    const wq = await Q.waitFor((m) => m.type === "ante-welcome");
    ok(!!wq?.peers?.some((p) => p.id === b.id), "a second arrival is welcomed with the first already standing there");
    const joined = await P.waitFor((m) => m.type === "ante-join" && m.peer?.id === c.id);
    ok(!!joined, "…and the first sees the second walk in");
    ok(!!wp && !!wq && Math.hypot(wp.you.x - wq.you.x, wp.you.y - wq.you.y) >= 0.8,
      "two ante arrivals are seated apart, not inside each other");
    Q.send({ type: "move", in: "ante", x: 3, y: 3, yaw: 1, p: 0 });
    const pos = await P.waitFor((m) => m.type === "ante-pos" && m.id === c.id);
    ok(pos?.x === 3 && pos?.y === 3, "an ante move reaches everyone in the ante");
    await sleep(60);
    Q.ws.send(JSON.stringify({ type: "move", x: "1e999", y: 3, yaw: 0, p: 0 }));
    await sleep(60);
    Q.send({ type: "move", x: 999, y: -5, yaw: 0, p: 0 });
    const clampedA = await P.waitFor((m) => m.type === "ante-pos" && m.id === c.id);
    ok(inAnte(clampedA) && !P.inbox.some((m) => m.type === "ante-pos" && !Number.isFinite(m.x)),
      "a hostile ante move is dropped or clamped into the ante");
    ok(anteFrames() === anteBefore, "a body inside the complex never hears an ante frame");

    // Into the complex: out of the ante, onto a seat of the server's choosing.
    P.send({ type: "enter" });
    const welP = await P.waitFor((m) => m.type === "welcome");
    const byeP = await Q.waitFor((m) => m.type === "ante-bye" && m.id === b.id);
    ok(!!byeP, "walking into the complex sends ante-bye to the ante");
    ok(Number.isFinite(welP?.you?.x) && Math.hypot(welP.you.x - 27, welP.you.y - 21.2) < 5,
      "the complex welcome carries the seat, by the entry");
    // A stale ante frame in flight across the crossing is dropped, not a teleport.
    P.send({ type: "move", in: "ante", x: 3, y: 3, yaw: 0, p: 0 });
    await sleep(200);
    ok(!A.inbox.some((m) => m.type === "pos" && m.id === b.id && m.x === 3 && m.y === 3),
      "an ante-tagged move after the crossing is dropped, never a teleport inside");
    // A second fresh arrival is seated somewhere else.
    {
      const d = db();
      const rare = d.prepare("SELECT code FROM emoji WHERE tier = 'rare' LIMIT 1 OFFSET 2").get().code;
      const admId = d.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
      d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(admId, rare, Date.now());
      d.close();
      await api("POST", "/api/escape/stake", { token: admin, body: { code: rare } });
    }
    const ADM = await wire(admin);
    ADM.send({ type: "enter" });
    const welM = await ADM.waitFor((m) => m.type === "welcome");
    ok(!!welM?.you && !!welP?.you && Math.hypot(welM.you.x - welP.you.x, welM.you.y - welP.you.y) >= 0.8,
      "two complex arrivals are seated at different points");
    ADM.ws.close();

    // Out again (the key, the exit) — and back into the ante, seated by the server.
    P.inbox.splice(0, P.inbox.length);
    P.send({ type: "enter" }); // same socket: a fresh snapshot where it stands
    const snap = await P.waitFor((m) => m.type === "welcome");
    ok(!!snap && Math.hypot(snap.you.x - welP.you.x, snap.you.y - welP.you.y) < 0.01,
      "a repeat enter on the same socket re-serves the seat it stands on");
    const kr = snap?.key?.state === "loose" ? ROOMS.find((q) => q.id === snap.key.room) : null;
    let backIn = null;
    if (kr) {
      P.send({ type: "move", x: kr.cx, y: kr.cy, yaw: 0, p: 0 });
      await sleep(80);
      P.send({ type: "key-take" });
      await P.waitFor((m) => m.type === "key" && m.state === "taken");
      P.send({ type: "move", x: EXIT.x, y: EXIT.y - 0.5, yaw: 0, p: 0 });
      await sleep(80);
      P.send({ type: "key-use" });
      await P.waitFor((m) => m.type === "exit" && m.until > 0);
      P.send({ type: "leave" });
      await P.waitFor((m) => m.type === "left");
      backIn = await P.waitFor((m) => m.type === "ante-welcome");
    }
    ok(inAnte(backIn?.you) && backIn.you.y < 3, "walking out seats the body back in the ante, under the complex door");
    ok(!!(await Q.waitFor((m) => m.type === "ante-join" && m.peer?.id === b.id)), "…and the ante sees them come back");
    // A second window takes the ante body over; the first goes quiet.
    const Q2 = await wire(c.token);
    Q2.send({ type: "ante-enter" });
    ok(!!(await Q.waitFor((m) => m.type === "ante-replaced")), "a second window takes the ante body over");
    ok(!!(await P.waitFor((m) => m.type === "ante-bye" && m.id === c.id)) &&
      !!(await P.waitFor((m) => m.type === "ante-join" && m.peer?.id === c.id)),
      "…and the room sees one body, not a frozen ghost");
    Q2.ws.close();
    ok(!!(await P.waitFor((m) => m.type === "ante-bye" && m.id === c.id)), "a socket closing in the ante sends ante-bye");
    Q.ws.close();
    P.ws.close();
  }

  A.ws.close();
  await sleep(150);
};

run()
  .catch((e) => { console.error(e); console.error(bootLog.slice(-600)); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} escape key asserts passed`);
    process.exit(bad ? 1 : 0);
  });
