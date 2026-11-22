// THE HUNT — the monster over the real wire (E4, Aug 2026).
//
// Run:  npm run build && node scripts/checks/test_escape_hunt.mjs
//
// A real server, dialled clocks (gap 2s, telegraph 1.5s, hunt 6s). What it
// pins down:
//   · the machine turns: calm → telegraph (2-3 valid block letters + a real
//     den, told to the room) → hunt (the monster stands in ITS den) →
//     retreat → calm, with the entry door REFUSING newcomers the whole red
//     phase and welcoming them again in the calm
//   · the block-letter law: during the red phase a locked block's door
//     cannot be OPENED (refused, free), while closing any door is always
//     allowed — the letters decide where safety can still be reached, never
//     whether being behind a shut door counts
//   · THE KILL: a body standing in the halls dies on contact — the dead
//     frame arrives, the pass is REVOKED in the DB, the bag is wiped, and
//     the room hears who was taken; a body behind a SHUT door in an open
//     block survives the same hunt untouched
//   · the monster's position streams to the room while it hunts
//   · the key in a victim's bag resets, announced

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8502;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "escape-hunt-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

// LEN is long enough that the monster can reach a roomer through an open
// door in the same act it takes the hall-stander (worst path ~10s at 5.7).
const GAP_MS = 2000, TG_MS = 1500, LEN_MS = 12000;

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    ER_HUNT_GAP_MS: String(GAP_MS), ER_TELEGRAPH_MS: String(TG_MS), ER_HUNT_LEN_MS: String(LEN_MS),
    // a dropped socket's body stands this long in the calm (the harness
    // closes sockets to walk bodies out, so it keeps the grace short)
    ER_DROP_GRACE_MS: "100",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
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
let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};
const DB_PATH = path.join(DATA_DIR, "solace.db");
const db = () => new DatabaseSync(DB_PATH);
const wire = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-escape?token=${token}`);
    const inbox = [];
    ws.on("message", (d) => inbox.push(JSON.parse(String(d))));
    ws.on("open", () =>
      resolve({
        ws, inbox, send: (m) => ws.send(JSON.stringify(m)),
        waitFor: (pred, ms = 6000) =>
          new Promise((res) => {
            const t1 = Date.now() + ms;
            const scan = () => {
              const i = inbox.findIndex(pred);
              if (i >= 0) return res(inbox.splice(i, 1)[0]);
              if (Date.now() > t1) return res(null);
              setTimeout(scan, 20);
            };
            scan();
          }),
      }),
    );
    ws.on("error", reject);
  });

// The server's own tables, parsed from source (the mirror the layout harness pins).
const SRC = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(ROOT, "src", "casino", "escape-zone.ts"), "utf8"));
const ROOMS = [...SRC.matchAll(/\{ id: "([A-Z]\d+)", x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+), door: \{ x: (\d+), y: (\d+) \} \}/g)]
  .map((m) => ({ id: m[1], x0: +m[2], y0: +m[3], x1: +m[4], y1: +m[5], dx: +m[6], dy: +m[7] }));
const DEN_IDS = ["den-west", "den-mid", "den-east"];

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  const pw = "Sturdy!Passw0rd#9";
  const a = await register("prey", pw);        // will stand in the hall and die
  const b = await register("shelterer", pw);   // will shut a door and live
  const c = await register("latecomer", pw);   // will try the door mid-alarm
  const e = await register("opendoorer", pw);  // will hide badly — door OPEN
  {
    const d = db();
    const rares = d.prepare("SELECT code FROM emoji WHERE tier = 'rare' LIMIT 4").all().map((r) => r.code);
    const g = d.prepare("INSERT INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)");
    g.run(a.id, rares[0], Date.now());
    g.run(b.id, rares[1], Date.now());
    g.run(c.id, rares[2], Date.now());
    g.run(e.id, rares[3], Date.now());
    d.close();
    for (const [u, code] of [[a, rares[0]], [b, rares[1]], [c, rares[2]], [e, rares[3]]])
      await api("POST", "/api/escape/stake", { token: u.token, body: { code } });
  }

  const A = await wire(a.token);
  A.send({ type: "enter" });
  const welA = await A.waitFor((m) => m.type === "welcome");
  ok(welA?.hunt?.phase === "calm", "the day starts calm");
  ok(welA.hunt.until > Date.now(), "…with the next hunt on the clock");

  const B = await wire(b.token);
  B.send({ type: "enter" });
  await B.waitFor((m) => m.type === "welcome");
  const E = await wire(e.token);
  E.send({ type: "enter" });
  await E.waitFor((m) => m.type === "welcome");

  // ---- the telegraph ------------------------------------------------------
  const tg = await A.waitFor((m) => m.type === "hunt" && m.phase === "telegraph", GAP_MS + 4000);
  ok(!!tg, "the lights die on schedule");
  ok(Array.isArray(tg.blocks) && tg.blocks.length >= 2 && tg.blocks.length <= 3, `2-3 open blocks (${tg.blocks})`);
  ok(tg.blocks.every((l) => "ABCDZ".includes(l)), "…all real letters");
  ok(DEN_IDS.includes(tg.den), `…and a real den (${tg.den})`);

  // The latecomer is refused at the door for the whole red phase.
  const C = await wire(c.token);
  C.send({ type: "enter" });
  const barred = await C.waitFor((m) => m.type === "denied");
  ok(barred?.error === "lockdown", "the alarms bar the door to newcomers");

  // The shelterer makes for an OPEN-block room and shuts the door; the prey
  // stands in the north corridor and waits to be taught the rules.
  const openRoom = ROOMS.find((r) => tg.blocks.includes(r.id[0]));
  const lockedRoom = ROOMS.find((r) => !tg.blocks.includes(r.id[0]));
  B.send({ type: "move", x: openRoom.dx + 0.5, y: openRoom.dy + 0.5, yaw: 0, p: 0 });
  await sleep(60);
  B.send({ type: "door", room: openRoom.id, open: true });
  await B.waitFor((m) => m.type === "door" && m.room === openRoom.id && m.open === true);
  const bx = (openRoom.x0 + openRoom.x1 + 1) / 2, by = (openRoom.y0 + openRoom.y1 + 1) / 2;
  B.send({ type: "move", x: bx, y: by, yaw: 0, p: 0 });
  await sleep(60);
  B.send({ type: "door", room: openRoom.id, open: false });
  await B.waitFor((m) => m.type === "door" && m.room === openRoom.id && m.open === false);

  // The block-letter law, both ways.
  B.send({ type: "move", x: lockedRoom.dx + 0.5, y: lockedRoom.dy + 0.5, yaw: 0, p: 0 });
  await sleep(60);
  B.send({ type: "door", room: lockedRoom.id, open: true });
  const refusal = await B.waitFor((m) => m.type === "denied");
  ok(refusal?.error === "block_locked", "a locked block's door will not OPEN during the red phase");
  B.send({ type: "move", x: bx, y: by, yaw: 0, p: 0 }); // back to shelter
  await sleep(60);

  // THE BAD HIDER: an open-block room, door standing OPEN. An open door is a
  // line of sight — the monster walks in through it (the first cut made ANY
  // room invisible, and an open door looked like broken pathfinding). Pick
  // the open-block room nearest the prey's stand so the reach fits the act.
  const eRoom = ROOMS
    .filter((r) => tg.blocks.includes(r.id[0]) && r.id !== openRoom.id)
    .sort((p, q) =>
      Math.hypot((p.x0 + p.x1) / 2 - 27.5, (p.y0 + p.y1) / 2 - 10.5) -
      Math.hypot((q.x0 + q.x1) / 2 - 27.5, (q.y0 + q.y1) / 2 - 10.5))[0];
  E.send({ type: "move", x: eRoom.dx + 0.5, y: eRoom.dy + 0.5, yaw: 0, p: 0 });
  await sleep(60);
  E.send({ type: "door", room: eRoom.id, open: true });
  await E.waitFor((m) => m.type === "door" && m.room === eRoom.id && m.open === true);
  E.send({ type: "move", x: (eRoom.x0 + eRoom.x1 + 1) / 2, y: (eRoom.y0 + eRoom.y1 + 1) / 2, yaw: 0, p: 0 });
  await sleep(60);

  // Give the prey the key first, so its death also proves the reset.
  {
    const kr = welA.key?.room ?? (await A.waitFor((m) => m.type === "key", 100))?.room;
    void kr;
  }
  // Prey stands mid-north-corridor — exposed.
  // Mid-open-floor (v2: the band between the B rows' feet and the D/A tops).
  A.send({ type: "move", x: 27.5, y: 10.5, yaw: 0, p: 0 });
  await sleep(60);

  // ---- the hunt -----------------------------------------------------------
  const hunt = await A.waitFor((m) => m.type === "hunt" && m.phase === "hunt", TG_MS + 4000);
  ok(!!hunt, "the shutter rolls and the hunt begins");
  ok(hunt.mon && DEN_IDS.includes(hunt.den), "…with the monster standing in its den");
  const monSeen = await B.waitFor((m) => m.type === "mon", 3000);
  ok(!!monSeen, "the monster's position streams to the room");

  const dead = await A.waitFor((m) => m.type === "dead", LEN_MS + 8000);
  ok(!!dead, "the exposed body is caught — contact is death");
  const heard = await B.waitFor((m) => m.type === "killed" && m.name === "prey", 2000);
  ok(!!heard, "…and the room hears who was taken");
  // An open door was no hiding place — the monster walked in and took them.
  const deadE = await E.waitFor((m) => m.type === "dead", LEN_MS + 8000);
  ok(!!deadE, "AN OPEN DOOR IS AN INVITATION — the monster enters the room and takes the bad hider");
  // THE KILL WAS LEGAL: it took them from INSIDE the room or its own
  // doorway — never through a wall on raw distance (Josh: "when the hunt
  // starts and I'm in a room with the door open I just die" — the sweep
  // used to kill through the corridor wall as the monster sprinted past).
  // The kill tick broadcasts its mon frame right after the sweep, so the
  // first mon frame after the killed frame is the killing position.
  {
    const scan = async (pred) => {
      const t1 = Date.now() + 3000;
      for (;;) {
        const i = B.inbox.findIndex(pred);
        if (i >= 0) return i;
        if (Date.now() > t1) return -1;
        await sleep(20);
      }
    };
    const ki = await scan((m) => m.type === "killed" && m.name === "opendoorer");
    ok(ki >= 0, "…the room hears the bad hider taken");
    const mi = await scan((m, j) => j > ki && m.type === "mon");
    const mk = mi >= 0 ? B.inbox[mi] : null;
    const cx = mk ? Math.floor(mk.x) : -1, cy = mk ? Math.floor(mk.y) : -1;
    const inRoom = mk && cx >= eRoom.x0 && cx <= eRoom.x1 && cy >= eRoom.y0 && cy <= eRoom.y1;
    const atDoor = mk && cx === eRoom.dx && cy === eRoom.dy;
    ok(inRoom || atDoor,
      `…and the killer stood in the room or its doorway, never beyond a wall (${mk?.x},${mk?.y} vs ${eRoom.id})`);
  }
  E.ws.close();
  {
    const d = db();
    const pass = d.prepare("SELECT 1 FROM er_passes WHERE userId = ? AND endedAt IS NULL").get(a.id);
    const bag = d.prepare("SELECT COUNT(*) c FROM er_inventory WHERE userId = ?").get(a.id).c;
    d.close();
    ok(!pass, "…the pass died with them");
    ok(bag === 0, "…and the bag was destroyed");
  }

  // ---- the survivor + the calm -------------------------------------------
  const calm = await B.waitFor((m) => m.type === "hunt" && m.phase === "calm", LEN_MS + 35_000);
  ok(!!calm, "the monster goes home and the lights restore");
  ok(!B.inbox.some((m) => m.type === "dead"), "the body behind the shut door survived, never touched");
  {
    const d = db();
    ok(!!d.prepare("SELECT 1 FROM er_passes WHERE userId = ? AND endedAt IS NULL").get(b.id),
      "…pass intact");
    d.close();
  }

  // The latecomer walks in now.
  C.send({ type: "enter" });
  const welC = await C.waitFor((m) => m.type === "welcome");
  ok(!!welC && welC.hunt.phase === "calm", "…and the calm reopens the door");

  // ---- the admin's P-menu (E5): server-enforced ---------------------------
  {
    C.send({ type: "debug", op: "hunt-start" });
    const noAdmin = await C.waitFor((m) => m.type === "denied");
    ok(noAdmin?.error === "not_admin", "the house controls refuse a member");
    const adminTok = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
    // The admin needs a pass to be inside like anyone else.
    {
      const d = db();
      const adminId = d.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
      const rare = d.prepare("SELECT code FROM emoji WHERE tier='rare' AND code NOT IN (SELECT code FROM user_emoji) LIMIT 1").get().code;
      d.prepare("INSERT INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(adminId, rare, Date.now());
      d.close();
      await api("POST", "/api/escape/stake", { token: adminTok, body: { code: rare } });
    }
    const ADM = await wire(adminTok);
    // The P-menu works from the ANTE — before any enter, with no body in
    // the zone. The thing being diagnosed may be the door itself (the
    // production lockout had the operator outside his own complex).
    ADM.send({ type: "debug", op: "state" });
    const outside = await ADM.waitFor((m) => m.type === "debug" && m.op === "state");
    ok(!!outside && typeof outside.bodies === "number", "the admin menu answers from OUTSIDE the zone");
    ADM.send({ type: "enter" });
    await ADM.waitFor((m) => m.type === "welcome");

    // ---- THE LOCKDOWN'S HOUSEKEEPING (Josh): every door slams shut at the
    // telegraph, and a body inside a room OUTSIDE tonight's open letters is
    // TURNED OUT — teleported in front of its own door. Three bodies parked
    // in three different blocks: with only 2-3 letters ever open, at least
    // one is evicted on almost every roll; re-roll until one is (the letters
    // are random — the LOOP is what makes the assert deterministic).
    {
      // ADM opens C1's door in the calm from its hall cell, so the slam has
      // a witness.
      ADM.send({ type: "move", x: 5.5, y: 4.5, yaw: 0, p: 0 });
      await sleep(120);
      ADM.send({ type: "door", room: "C1", open: true });
      const opened = await ADM.waitFor((m) => m.type === "door" && m.room === "C1" && m.open === true);
      ok(!!opened, "a calm complex opens any door");
      // Park the three: B in C1 (block C), C in B2 (block B), ADM in A5 (block A).
      B.send({ type: "move", x: 3.5, y: 4.5, yaw: 0, p: 0 });
      C.send({ type: "move", x: 22.5, y: 3.5, yaw: 0, p: 0 });
      ADM.send({ type: "move", x: 23.5, y: 12.5, yaw: 0, p: 0 });
      await sleep(150);
      let evicted = null;
      let slammed = false;
      for (let round = 0; round < 6 && !evicted; round++) {
        B.inbox.length = 0; C.inbox.length = 0; ADM.inbox.length = 0;
        ADM.send({ type: "debug", op: "hunt-start" });
        await ADM.waitFor((m) => m.type === "hunt" && m.phase === "telegraph");
        await sleep(250);
        if (round === 0) slammed = ADM.inbox.some((m) => m.type === "door" && m.room === "C1" && m.open === false);
        evicted =
          B.inbox.find((m) => m.type === "teleport") ??
          C.inbox.find((m) => m.type === "teleport") ??
          ADM.inbox.find((m) => m.type === "teleport") ??
          null;
        ADM.send({ type: "debug", op: "hunt-end" });
        await ADM.waitFor((m) => m.type === "hunt" && m.phase === "calm");
        await sleep(150);
      }
      ok(slammed, "the lockdown slams every open door shut");
      ok(!!evicted && Number.isFinite(evicted.x), "a body in a room outside the act is turned out in front of it");
      // put the walkers back in the open before the admin drills below
      B.send({ type: "move", x: 27.5, y: 10.5, yaw: 0, p: 0 });
      C.send({ type: "move", x: 30.5, y: 10.5, yaw: 0, p: 0 });
      ADM.send({ type: "move", x: 33.5, y: 10.5, yaw: 0, p: 0 });
      await sleep(150);
    }

    ADM.send({ type: "debug", op: "hunt-start" });
    const started = await ADM.waitFor((m) => m.type === "hunt" && m.phase === "telegraph");
    ok(!!started, "the admin starts a hunt on demand");
    ADM.send({ type: "debug", op: "mon-freeze" });
    const froze = await ADM.waitFor((m) => m.type === "debug" && m.op === "mon-freeze");
    ok(froze?.frozen === true, "…freezes the monster for a close look");
    ADM.send({ type: "debug", op: "hunt-end" });
    const ended = await ADM.waitFor((m) => m.type === "hunt" && m.phase === "calm");
    ok(!!ended, "…and ends it, lights restored");
    ADM.send({ type: "debug", op: "mon-freeze" }); // leave it unfrozen
    ADM.ws.close();
  }

  A.ws.close(); B.ws.close(); C.ws.close();
  await sleep(300);

  // ---- an empty zone must never stay locked down --------------------------
  // THE PRODUCTION BUG: a hunt running when the last body leaves used to
  // park the machine mid-red-phase — and since the entry gate refuses
  // newcomers during the alarms, the complex locked FOREVER. Everyone above
  // is out of the zone now, so this block owns the whole occupancy.
  {
    const D = await wire(b.token);
    D.send({ type: "enter" });
    await D.waitFor((m) => m.type === "welcome");
    const tg2 = await D.waitFor((m) => m.type === "hunt" && (m.phase === "telegraph" || m.phase === "hunt"), GAP_MS + 6000);
    ok(!!tg2, "a fresh red phase begins");
    D.ws.close(); // the last body's socket drops mid-alarm
    await sleep(400);
    // (Oct 2026 review) a dropped socket is not a way out: mid-alarm it is a
    // death, the pass gone — it used to walk the body out, pass and bag kept
    {
      const d = db();
      const live = d.prepare("SELECT COUNT(*) AS n FROM er_passes WHERE userId = ? AND endedAt IS NULL").get(b.id).n;
      d.close();
      ok(live === 0, "a socket dropped mid-alarm is a death: the pass is gone");
    }
    const E = await wire(c.token);
    E.send({ type: "enter" });
    const back = await E.waitFor((m) => m.type === "welcome");
    ok(!!back, "…and the NEXT visitor is welcomed — an act with no audience ends");
    ok(back?.hunt?.phase === "calm", "…into a calm complex, clock re-armed");
    E.ws.close();
  }
  await sleep(150);
};

run()
  .catch((e) => { console.error(e); console.error(bootLog.slice(-600)); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} escape hunt asserts passed`);
    process.exit(bad ? 1 : 0);
  });
