// THE ELECTRICAL STATION, SERVED — Level 3 over the real /ws-game wire on a
// real server (BACKROOMS.md → "LEVEL 3 — ELECTRICAL STATION"). Part of the
// SHIP GATE: the level's rules, driven rather than trusted.
//
//   · THE WAY IN: S1 boots verified; a member is refused while the ship gate
//     is shut, the admin is let in; the welcome carries the station's six
//     breakers, six cutoffs, the shutter and the power; chunks carry the
//     section map. From Pipe Dreams, the pressure door (fuses in) takes the
//     admin through — a member only once the admin opens the station.
//   · THE BREAKERS: thrown only standing at one; once thrown, thrown (a
//     second throw changes nothing); the shutter refuses until all six are
//     on, then the whole server is told and the shutter takes the admin DOWN
//     to Level 4, the Abandoned Office (members wait at its own ship gate);
//     the flags are in the database.
//   · THE CUTOFFS: pulled only standing at one; the section loses power for
//     the window, then gets it back by itself.
//   · THE HAZARDS: live water hurts ("shock") while its section has power and
//     does NOTHING while the section is cut; an arcing panel crackles, then
//     arcs, and the arc hurts anyone in front of it ("arc").
//   · THE OPERATOR VIEW names every breaker, cutoff and the shutter; the
//     pressure door is the station's one way out.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-station.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "station-vocab.js"));
const PORT = 8523;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "station-live-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
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
    // dialled clocks: quick cuts, quick arcs, no blackouts in the way
    STATION_CUTOFF_MS: "3000",
    STATION_ARC_CYCLE_MS: "2500",
    STATION_DARK_GAP_MIN_MS: "600000",
    STATION_DARK_GAP_MAX_MS: "900000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
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
const client = (pathName, token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}${pathName}?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws,
      frames,
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

// the frozen station, read the same way the server builds it
const S = W.generateStationSector(W.SECTOR_S.seed, W.SECTOR_S.size);
const N = S.size;
const kindAt = (i) => V.sdecoKind(S.deco[i]);
const cellsOf = (k) => { const out = []; for (let i = 0; i < N * N; i++) if (kindAt(i) === k) out.push({ x: i % N, y: (i / N) | 0, i, section: S.section[i] }); return out; };
const puddles = cellsOf(V.SDECO.puddle);
const arcs = cellsOf(V.SDECO.arc);

const run = async () => {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  ok(new RegExp(`Sector ${W.SECTOR_S.id} verified \\(${N}×${N}, seed ${W.SECTOR_S.seed}\\)`).test(log), "S1 boots verified");
  ok(/the station: 6 breakers, 6 cutoffs, \d+ arcing panels, the shutter at/.test(log), "…with its six breakers, six cutoffs, arcing panels and the shutter found");

  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  const member = (await api("POST", "/api/register", {
    body: { username: "lineman", password: "Sturdy!Passw0rd#9", displayName: "lineman", secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  })).body?.token;
  ok(admin && member, "an admin and a member");
  const adminId = (await api("GET", "/api/me", { token: admin })).body.user.id;
  const memberId = (await api("GET", "/api/me", { token: member })).body.user.id;
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  for (const uid of [adminId, memberId]) db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(uid, Date.now());
  // a death costs the suit (the run's kit is lost), so a fresh one is issued whenever it's gone
  const suitOf = (uid) => {
    let r = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid);
    if (!r) {
      db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(uid, Date.now());
      r = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid);
    }
    return r.id;
  };
  const flag = (f) => !!db.prepare("SELECT 1 FROM backrooms_flags WHERE flag = ?").get(f);

  // ---- THE WAY IN
  console.log("-- the way in");
  {
    const mg = await client("/ws-game", member);
    mg.send({ type: "enter", door: 0, loadout: [suitOf(memberId)], level: 3 });
    const d = await mg.waitFor("denied");
    ok(d?.error === "station_locked", `a member is refused while the ship gate is shut (${d?.error})`);
    mg.ws.close();
  }
  // THE SHIP GATE ALONE OPENS IT (Josh, Oct 2026): flipped for members to
  // test the level, it lets them in even with Pipe Dreams' pressure door shut
  {
    ok(!flag("level3_unlocked"), "(the pressure door is still shut here)");
    await api("POST", "/api/admin/backrooms/open-station", { token: admin, body: { open: true } });
    const mg = await client("/ws-game", member);
    mg.send({ type: "enter", door: 0, loadout: [suitOf(memberId)], level: 3 });
    const f = await mg.waitFor((x) => x.type === "welcome" || x.type === "denied", 6000);
    ok(f?.type === "welcome" && f.level === 3, `the gate switched on lets a member in before the pressure door opens (${f?.type} ${f?.error ?? ""})`);
    mg.send({ type: "exit" });
    await mg.waitFor("debrief", 4000);
    mg.ws.close();
    await api("POST", "/api/admin/backrooms/open-station", { token: admin, body: { open: false } });
    await sleep(200);
  }
  const ag = await client("/ws-game", admin);
  ag.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: 3 });
  const w = await ag.waitFor("welcome", 6000);
  ok(w?.level === 3 && w.size === N && w.doors?.length === 1 && w.doors[0].name === V.STATION_DOOR_NAME, "the admin walks in: a level-3 welcome, one door, The Pressure Door");
  const st = w?.station;
  ok(st?.breakers?.length === 6 && st.cutoffs?.length === 6 && !!st.shutter && st.power?.length === 6, "the welcome carries six breakers, six cutoffs, the shutter and six sections' power");
  ok(st?.power?.every((p) => p.powered) && st.breakers.every((b) => !b.on), "…every section live, every breaker off");
  const cx = Math.floor(w.you.x / 16), cy = Math.floor(w.you.y / 16);
  ag.send({ type: "chunks", want: [{ cx, cy }] });
  const ch = await ag.waitFor((f) => f.type === "chunk" && f.cx === cx && f.cy === cy);
  ok(ch?.level === 3 && Array.isArray(ch.section) && ch.section.some((v) => v >= 1 && v <= 6) && Array.isArray(ch.deco), "chunks carry the section map and the station's deco");

  // fly to a cell, land on it
  const goTo = async (x, y) => {
    ag.send({ type: "fly", on: true });
    await ag.waitFor((f) => f.type === "fly" && f.on === true);
    ag.send({ type: "move", x, y, h: 0, p: 0 });
    await sleep(160);
    ag.clear();
    ag.send({ type: "fly", on: false });
    const f = await ag.waitFor("fly");
    return f?.ok !== false;
  };

  // ---- THE BREAKERS
  console.log("-- the breakers");
  const b1 = st.breakers[0];
  ag.send({ type: "throw-breaker", section: b1.section });
  const far = await ag.waitFor("breakerThrown");
  ok(far?.ok === false && far.error === "too_far", `a breaker can't be thrown from across the station (${far?.error})`);
  ok(await goTo(b1.x, b1.y), `landed at breaker ${b1.section}`);
  ag.send({ type: "throw-breaker", section: b1.section });
  const t1 = await ag.waitFor("breakerThrown");
  const ev1 = await ag.waitFor((f) => f.type === "breaker" && f.section === b1.section);
  ok(t1?.ok && t1.fresh && t1.on === 1 && t1.total === 6, "standing at it, it throws: 1 of 6 on");
  ok(!!ev1 && ev1.on === 1 && !ev1.opened, "…and the station is told");
  ok(flag(`level4_breaker_${b1.section}`), "…and it is a world flag (thrown forever)");
  ag.clear();
  ag.send({ type: "throw-breaker", section: b1.section });
  const t1b = await ag.waitFor("breakerThrown");
  ok(t1b?.ok && !t1b.fresh && t1b.on === 1, "a second throw changes nothing");

  // the shutter, locked
  ok(await goTo(st.shutter.x, st.shutter.y), "landed at the lift shutter");
  ag.clear();
  ag.send({ type: "travel" });
  const lockd = await ag.waitFor("travelDenied");
  ok(lockd?.error === "locked", `the shutter refuses with breakers still off (${lockd?.error})`);

  // ---- THE CUTOFFS + LIVE WATER
  console.log("-- the cutoffs and the live water");
  const wetSection = [...new Set(puddles.map((p) => p.section))][0];
  const pud = puddles.find((p) => p.section === wetSection);
  ok(!!pud, `there is live water in section ${wetSection}`);
  ok(await goTo(pud.x + 0.5, pud.y + 0.5), "landed in it, the section powered");
  const shock = await ag.waitFor((f) => (f.type === "hurt" || f.type === "dead") && f.cause === "shock", 2000);
  ok(!!shock, `live water hurts — "shock" (${shock?.type} at ${shock?.hp ?? 0} hp)`);
  // out of it at once (a ghost takes no shock) — or, if it got there first, back in
  ag.send({ type: "fly", on: true });
  await sleep(200);
  if (shock?.type === "dead" || ag.last("dead")) {
    await sleep(300);
    ag.clear();
    ag.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: 3 });
    await ag.waitFor("welcome", 6000);
  }
  const cut = st.cutoffs.find((c) => c.section === wetSection);
  ok(await goTo(cut.x, cut.y), `landed at section ${wetSection}'s cutoff`);
  ag.clear();
  ag.send({ type: "pull-cutoff", section: wetSection });
  const pulled = await ag.waitFor("cutoffPulled");
  const pw = await ag.waitFor((f) => f.type === "power" && f.power.some((p) => p.section === wetSection && !p.powered));
  ok(pulled?.ok && pulled.ms === 3000, "standing at the cutoff, it pulls (the dialled 3s window)");
  ok(!!pw, "…the station is told the section is down");
  ok(await goTo(pud.x + 0.5, pud.y + 0.5), "back into the same water, the section cut");
  ag.clear();
  await sleep(1300);
  ok(!ag.frames.some((f) => (f.type === "hurt" || f.type === "dead") && f.cause === "shock"), "cut water is safe: no shock in 1.3s");
  const back = await ag.waitFor((f) => f.type === "power" && f.power.find((p) => p.section === wetSection)?.powered, 4000);
  ok(!!back, "the power comes back by itself when the window ends");
  // step out of the water before it bites
  ag.send({ type: "fly", on: true });
  await ag.waitFor((f) => f.type === "fly" && f.on === true);

  // ---- AN ARCING PANEL
  console.log("-- an arcing panel");
  const arc = arcs[0];
  const side = V.sdecoVar(S.deco[arc.i]);
  ok(await goTo(arc.x + 0.5, arc.y + 0.5), `landed in front of the panel at ${arc.x},${arc.y}`);
  const warn = await ag.waitFor((f) => f.type === "arc" && f.phase === "warn", 4000);
  const fire = await ag.waitFor((f) => f.type === "arc" && f.phase === "fire", 4000);
  const zap = await ag.waitFor((f) => (f.type === "hurt" || f.type === "dead") && f.cause === "arc", 4000);
  ok(!!warn && !!fire, "it crackles, then arcs, on its clock");
  ok(!!zap, `the arc hurts whoever is in front of it (${zap?.type})`);
  void side;
  if (zap?.type === "dead" || ag.last("dead")) {
    await sleep(300);
    ag.clear();
    ag.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: 3 });
    await ag.waitFor("welcome", 6000);
  }

  // ---- ALL SIX: the shutter has power
  console.log("-- all six breakers");
  for (const b of st.breakers.slice(1)) {
    await goTo(b.x, b.y);
    ag.clear();
    ag.send({ type: "throw-breaker", section: b.section });
    await ag.waitFor("breakerThrown");
  }
  const l4 = await ag.waitFor("level4", 3000);
  ok(!!l4, "the sixth breaker: the server tells everyone the shutter has power");
  ok(flag("level4_unlocked") && [1, 2, 3, 4, 5, 6].every((k) => flag(`level4_breaker_${k}`)), "…six breaker flags and LEVEL4 in the database");

  // ---- THE OPERATOR VIEW + the way out
  console.log("-- the operator view and the way out");
  const map = await api("GET", "/api/backrooms/map?level=3", { token: admin });
  const kinds = map.body?.operator?.objectives?.map((o) => o.kind) ?? [];
  ok(map.status === 200 && map.body.level === 3 && kinds.filter((k) => k === "breaker").length === 6 && kinds.filter((k) => k === "cutoff").length === 6 && kinds.includes("shutter"), "the operator's map of Level 3 names six breakers, six cutoffs and the shutter");
  ok(map.body?.operator?.objectives?.filter((o) => o.kind === "breaker").every((o) => o.state === "on"), "…all six reading on");
  ag.clear();
  ag.send({ type: "exit" });
  const far2 = await ag.waitFor("exitDenied");
  ok(far2?.error === "not_at_door", "you can't leave from the far end");
  await goTo(w.doors[0].x + 0.5, w.doors[0].y + 0.5);
  ag.clear();
  ag.send({ type: "exit" });
  ok(!!(await ag.waitFor("debrief", 5000)), "at the pressure door, the exit takes you home");
  ag.ws.close();

  // ---- THROUGH THE SHUTTER: down to Level 4
  console.log("-- the lift shutter, down to the office");
  const ag2 = await client("/ws-game", admin);
  ag2.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: 3 });
  await ag2.waitFor("welcome", 6000);
  ag2.send({ type: "fly", on: true });
  await ag2.waitFor((fr) => fr.type === "fly" && fr.on === true);
  ag2.send({ type: "move", x: st.shutter.x, y: st.shutter.y, h: 0, p: 0 });
  await sleep(160);
  ag2.clear();
  ag2.send({ type: "fly", on: false });
  await ag2.waitFor("fly");
  ag2.clear();
  ag2.send({ type: "travel" });
  const down = await ag2.waitFor((fr) => fr.type === "travel" || fr.type === "travelDenied", 5000);
  ok(down?.type === "travel" && down.level === 4 && !!down.office?.stairdoor, `powered, the shutter takes the admin down into the Abandoned Office (${down?.type} ${down?.level ?? down?.error})`);
  // and out again by the lift it arrived at (a standing run would resume below)
  ag2.clear();
  ag2.send({ type: "exit" });
  ok(!!(await ag2.waitFor("debrief", 5000)), "…and the lift it arrived by is the office's way out");
  ag2.ws.close();

  // ---- FROM PIPE DREAMS: the pressure door, and the ship gate
  console.log("-- from Pipe Dreams");
  for (const f of ["level1_unlocked", "level2_unlocked", "level3_unlocked"]) db.prepare("INSERT OR IGNORE INTO backrooms_flags (flag, userId, name, at) VALUES (?, NULL, 'harness', ?)").run(f, Date.now());
  const P = require(path.join(ROOT, "dist", "backrooms", "worldgen-pipes.js"));
  const D = P.generatePipesSector(P.SECTOR_D.seed, P.SECTOR_D.size);
  let pd = 0;
  for (let i = 0; i < D.deco.length; i++) if (D.deco[i] >> 4 === 12) pd = i;
  const pdx = (pd % D.size) + 0.5, pdy = Math.floor(pd / D.size) + 0.5;
  const through = async (token, uid, label) => {
    const g = await client("/ws-game", token);
    g.send({ type: "enter", door: 0, loadout: [suitOf(uid)], level: 2 });
    await g.waitFor("welcome", 6000);
    // a member can't fly: walk them there by a server-side teleport of the session (the DB-free seam: an admin move isn't available to them)
    return g;
  };
  // the admin: through the pressure door into the station
  const a2 = await through(admin, adminId, "admin");
  a2.send({ type: "fly", on: true });
  await a2.waitFor((f) => f.type === "fly" && f.on === true);
  a2.send({ type: "move", x: pdx, y: pdy, h: 0, p: 0 });
  await sleep(200);
  a2.clear();
  a2.send({ type: "travel" });
  const tr = await a2.waitFor((f) => f.type === "travel" || f.type === "travelDenied", 4000);
  ok(tr?.type === "travel" && tr.level === 3 && tr.station?.breakers?.length === 6, "the admin goes through Pipe Dreams' pressure door into the station (the travel frame carries its state)");
  a2.ws.close();
  await sleep(200);
  // the member: shut until the switch, then through
  const st0 = await api("GET", "/api/backrooms/status", { token: member });
  ok(st0.body?.level3Open === false && st0.body?.stationReady === true, "the status desk: the door is open but the station waits for the ship gate");
  const refused = await api("POST", "/api/admin/backrooms/open-station", { token: member, body: { open: true } });
  ok(refused.status === 403, "a member can't open it");
  const opened = await api("POST", "/api/admin/backrooms/open-station", { token: admin, body: { open: true } });
  ok(opened.status === 200 && opened.body.open === true, "the admin opens the station to members");
  const st1 = await api("GET", "/api/backrooms/status", { token: member });
  ok(st1.body?.level3Open === true && st1.body?.stationDoors?.length === 1, "…and the status desk says so");
  {
    const mg = await client("/ws-game", member);
    mg.send({ type: "enter", door: 0, loadout: [suitOf(memberId)], level: 3 });
    const mw = await mg.waitFor((f) => f.type === "welcome" || f.type === "denied", 6000);
    ok(mw?.type === "welcome" && mw.level === 3, "now a member walks in");
    mg.ws.close();
  }

  console.log(`\n${n - bad}/${n} asserts passed`);
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    setTimeout(() => {
      try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
      process.exit(bad ? 1 : 0);
    }, 300);
  });
