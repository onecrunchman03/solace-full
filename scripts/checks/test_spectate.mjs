// LAW 12 — THE DEAD, WATCHING. Over the real /ws-game wire on a real server.
//
// THE BACKROOMS LAWS (CLAUDE.md), Josh 2026-10-09: "if any players die they
// should be able to spectate any currently alive players in the map, hear the
// player they are currently spectating … cycle between currently alive
// players using q and e … by pressing the push to talk key they will have a
// total of 15 seconds of talking time; the spectated player will hear the
// spectator's voice from the direction the spectator's camera is facing …
// every 5 minutes the voice time limit resets … if two or more spectators
// are spectating the same person they should be able to hear each other."
// This pins the wire's half — who watches whom, what the dead are shown, and
// the budget. The VOICE (the dead can't publish outside a granted talk) is
// enforced through LiveKit and proven against a real SFU in livekit_ghost.mjs.
//
// The talk budget and its refill are dialled down (1.5s and 5s here) through
// the env the wire reads; the rule is the same.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8527;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "spectate-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const TALK_MS = 1500;
const REFILL_MS = 5000;
let log = "";
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
    BACKROOMS_SPEC_TALK_MS: String(TALK_MS),
    BACKROOMS_SPEC_REFILL_MS: String(REFILL_MS),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
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
const client = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-game?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws, frames,
      send: (m) => ws.send(JSON.stringify(m)),
      last: (pred) => [...frames].reverse().find(typeof pred === "string" ? (f) => f.type === pred : pred),
      async waitFor(pred, ms = 4000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = this.last(pred);
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
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  const reg = async (u) => (await api("POST", "/api/register", {
    body: { username: u, password: "Sturdy!Passw0rd#9", displayName: u, secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  })).body?.token;
  const tA = await reg("ghostly");
  const tB = await reg("watched");
  const tC = await reg("bystander");
  ok(tA && tB && tC, "three runners");
  const id = async (t) => (await api("GET", "/api/me", { token: t })).body.user.id;
  const [A, B, C] = [await id(tA), await id(tB), await id(tC)];
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const suitOf = (uid) => {
    let r = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid);
    if (!r) {
      db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(uid, Date.now());
      r = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid);
    }
    return r.id;
  };
  const enter = async (t, uid, level = 0) => {
    const c = await client(t);
    c.send({ type: "enter", door: 0, loadout: [suitOf(uid)], level });
    const w = await c.waitFor("welcome", 6000);
    return { c, w };
  };

  // ---- alone, there is nobody to watch ---------------------------------------
  console.log("-- dying alone");
  {
    const { c } = await enter(tA, A);
    c.clear();
    c.send({ type: "forfeit" });
    await c.waitFor("dead", 3000);
    await sleep(600);
    ok(!c.last("spectate"), "dying with nobody else on the level: nothing to watch, the run just ends");
    c.ws.close();
    await sleep(300);
  }

  // ---- three in, one dies -----------------------------------------------------
  console.log("-- three in, one dies");
  const a = await enter(tA, A);
  const b = await enter(tB, B);
  const cc = await enter(tC, C);
  ok(a.w && b.w && cc.w, "three runners on Level 0");
  // THE PRESENCE PULSE (law 5): a body standing still is re-announced to
  // whoever is near it, so someone walking up later still sees it
  b.c.clear();
  await sleep(1700);
  ok(b.c.frames.some((f) => f.type === "pos" && f.id === C), "a runner standing still is still shown to those near — re-announced once a second");
  a.c.clear();
  a.c.send({ type: "forfeit" });
  const sp = await a.c.waitFor((f) => f.type === "spectate" && !f.none, 4000);
  ok(!!sp, "dying with others alive: the dead are told they are watching");
  ok(sp && (sp.target === B || sp.target === C), `…one of the living (${sp?.target})`);
  ok(sp && sp.targets?.length === 2 && sp.targets.every((t) => t.id === B || t.id === C), "…with the living to cycle between, names included");
  ok(sp && sp.talkLeftMs === TALK_MS && sp.refillInMs > 0, `…and a full talk budget (${sp?.talkLeftMs}ms)`);
  ok(!!a.c.last((f) => f.type === "pos" && f.id === sp?.target), "the spectator is shown the one they watch");

  // put the watch on B for the rest
  if (sp?.target !== B) {
    a.c.clear();
    a.c.send({ type: "spec-cycle", dir: 1 });
    await a.c.waitFor((f) => f.type === "spectate" && f.target === B, 3000);
  }
  ok(a.c.last("spectate")?.target === B, "E cycles to the other living runner");
  a.c.clear();
  a.c.send({ type: "spec-cycle", dir: -1 });
  const back = await a.c.waitFor((f) => f.type === "spectate" && f.target === C, 3000);
  ok(!!back, "Q cycles back");
  a.c.send({ type: "spec-cycle", dir: 1 });
  await a.c.waitFor((f) => f.type === "spectate" && f.target === B, 3000);

  // what B does, the spectator sees
  a.c.clear();
  const bx = b.w.you.x, by = b.w.you.y;
  b.c.send({ type: "move", x: bx + 0.3, y: by, h: 0.5, p: 0 });
  const mv = await a.c.waitFor((f) => f.type === "pos" && f.id === B, 3000);
  ok(!!mv, "the watched runner's moves reach the spectator");
  a.c.send({ type: "chunks", want: [{ cx: Math.floor(bx / 16), cy: Math.floor(by / 16) }] });
  const ch = await a.c.waitFor("chunk", 3000);
  ok(!!ch, "the world round the watched runner streams to the spectator");

  // ---- the ghost speaks ----------------------------------------------------------
  console.log("-- the ghost speaks");
  b.c.clear();
  cc.c.clear();
  a.c.send({ type: "spec-cam", yaw: 1.2 });
  a.c.send({ type: "ghost-ptt", on: true });
  const g = await b.c.waitFor((f) => f.type === "ghost" && f.id === A && f.on, 2000);
  ok(!!g, "push-to-talk: the watched runner is told a ghost is speaking");
  ok(g && Math.abs(g.yaw - 1.2) < 1e-6, "…from the direction the spectator's camera faces them");
  await sleep(300);
  ok(!cc.c.last("ghost"), "nobody else hears the ghost");
  b.c.clear();
  a.c.send({ type: "spec-cam", yaw: -0.4 });
  const g2 = await b.c.waitFor((f) => f.type === "ghost" && f.on && Math.abs(f.yaw + 0.4) < 1e-6, 2000);
  ok(!!g2, "turning the camera while speaking moves the voice");
  // the budget runs out on its own
  const off = await b.c.waitFor((f) => f.type === "ghost" && f.id === A && f.on === false, TALK_MS + 1500);
  ok(!!off, `held past ${TALK_MS / 1000}s, the ghost is cut off`);
  const empty = await a.c.waitFor((f) => f.type === "spectate" && f.talkLeftMs === 0 && !f.talking, 1500);
  ok(!!empty, "…and the spectator's budget reads empty");
  b.c.clear();
  a.c.send({ type: "ghost-ptt", on: true });
  await sleep(500);
  ok(!b.c.last((f) => f.type === "ghost" && f.on), "with the budget spent, push-to-talk does nothing");
  a.c.send({ type: "ghost-ptt", on: false });
  await sleep(200);
  a.c.clear(); // only frames from here on: the refill must be a NEW one
  const refill = await a.c.waitFor((f) => f.type === "spectate" && f.talkLeftMs === TALK_MS && !f.talking, REFILL_MS + 1500);
  ok(!!refill, `after the refill period the budget is full again (${REFILL_MS / 1000}s here, five minutes live)`);
  // the timer runs only while held: a short press spends only that much
  a.c.clear();
  a.c.send({ type: "ghost-ptt", on: true });
  await sleep(400);
  a.c.send({ type: "ghost-ptt", on: false });
  const part = await a.c.waitFor((f) => f.type === "spectate" && !f.talking && f.talkLeftMs < TALK_MS && f.talkLeftMs > TALK_MS - 900, 2000);
  ok(!!part, `the clock runs only while the key is held (${part?.talkLeftMs}ms left after a short press)`);

  // ---- two spectators of one runner hear each other --------------------------------
  console.log("-- two watching the same runner");
  cc.c.clear();
  cc.c.send({ type: "forfeit" });
  const sp2 = await cc.c.waitFor((f) => f.type === "spectate" && !f.none, 3000);
  ok(sp2?.target === B, "the second to die watches the last one standing");
  const wa = await a.c.waitFor((f) => f.type === "spectate" && f.watchers?.includes(C), 2000);
  ok(!!wa && sp2?.watchers?.includes(A), "the two spectators are told of each other (they hear each other freely)");

  // ---- the last one standing falls ---------------------------------------------------
  console.log("-- the last one falls");
  a.c.clear();
  cc.c.clear();
  b.c.send({ type: "forfeit" });
  const none = await a.c.waitFor((f) => f.type === "spectate" && f.none, 3000);
  ok(!!none && !!(await cc.c.waitFor((f) => f.type === "spectate" && f.none, 2000)), "nobody left alive: every watch ends");

  // ---- a new run ends a watch; a dropped socket too ---------------------------------
  console.log("-- leaving the watch");
  {
    const p1 = await enter(tA, A);
    const p2 = await enter(tB, B);
    ok(p1.w && p2.w, "two back in");
    p1.c.send({ type: "forfeit" });
    const s3 = await p1.c.waitFor((f) => f.type === "spectate" && !f.none, 3000);
    ok(s3?.target === B, "watching again");
    p1.c.ws.close();
    await sleep(600);
    p2.c.clear();
    // the closed watcher no longer counts: the living runner's state is clean
    p2.c.send({ type: "forfeit" });
    await sleep(500);
    ok(!p2.c.last((f) => f.type === "spectate" && !f.none), "a dropped watcher leaves nothing behind (the last death has nobody to watch)");
  }

  // ---- law 5: the room hears what you use ------------------------------------
  console.log("-- heard by the room");
  {
    const pills = db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'pills', 0, NULL, ?)").run(B, Date.now()).lastInsertRowid;
    const c1 = await client(tB);
    c1.send({ type: "enter", door: 0, loadout: [suitOf(B), Number(pills)], level: 0 });
    const w1 = await c1.waitFor("welcome", 6000);
    const { c: c2, w: w2 } = await enter(tC, C);
    ok(!!w1, "two runners side by side");
    // law 5: the second one through the same door is set down BESIDE the
    // first, never inside them (a body around the camera draws as shards)
    const apart = w1 && w2 ? Math.hypot(w1.you.x - w2.you.x, w1.you.y - w2.you.y) : 0;
    ok(apart >= 0.7 && apart <= 2, `…and the second through the same door arrives beside the first, not inside them (${apart.toFixed(2)} cells apart)`);
    c2.clear();
    c1.send({ type: "consume", itemId: Number(pills) });
    const own = await c1.waitFor((f) => f.type === "consumed", 3000);
    const heard = await c2.waitFor((f) => f.type === "peergear" && f.id === B, 3000);
    ok(own?.ok === true, "the pills go down");
    ok(heard?.kind === "pills" && !("hp" in heard) && !("itemId" in heard), "…and the runner beside them hears it — the kind only, never the health or the item");
    c1.send({ type: "forfeit" });
    c2.send({ type: "forfeit" });
    await sleep(400);
    c1.ws.close();
    c2.ws.close();
  }

  // ---- LAW 12 ON THE OFFICE ----------------------------------------------------
  // The watch is level-agnostic code, but law 12 says EVERY map, so the newest
  // level gets a run of its own: two members in the office (both of its ship
  // gates open), one dies, the dead watch the living, the last death ends it.
  console.log("-- the office (Level 4)");
  {
    for (const flag of ["level4_unlocked", "level4_open_to_members"])
      db.prepare("INSERT OR IGNORE INTO backrooms_flags (flag, userId, name, at) VALUES (?, NULL, 'harness', ?)").run(flag, Date.now());
    await sleep(300);
    const o1 = await enter(tA, A, 4);
    const o2 = await enter(tB, B, 4);
    ok(o1.w?.level === 4 && o2.w?.level === 4, "two runners in the Abandoned Office");
    o1.c.clear();
    o1.c.send({ type: "forfeit" });
    const osp = await o1.c.waitFor((f) => f.type === "spectate" && !f.none, 4000);
    ok(osp?.target === B, "…one dies and watches the other, on Level 4 as everywhere");
    ok(osp && osp.talkLeftMs === TALK_MS, "…with the same talk budget");
    o1.c.clear();
    o2.c.send({ type: "forfeit" });
    const oend = await o1.c.waitFor((f) => f.type === "spectate" && f.none, 4000);
    ok(!!oend, "the last death in the office ends the watch");
    o1.c.ws.close();
    o2.c.ws.close();
    await sleep(300);
  }

  console.log(`\ntest_spectate: ${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); console.error(log.slice(-2000)); process.exit(1); });
