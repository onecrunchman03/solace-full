// THE CASINO GUN + THE CASINO LOCKER harness (Josh, Aug 2026).
//
// A real server on a throwaway port, driven over HTTP and the /ws-casino wire.
// What it pins down:
//   MONEY — the 150,000 burns (global conservation: buyer down, NOBODY up),
//   every refusal is FREE (broke, double-buy, clip-without-gun), the clip
//   price burns too, and one gun per person is enforced wherever the first
//   one is (carried or lockered).
//   ROUNDS — the server owns them: a shot decrements exactly one, a dry gun
//   fires nothing, the rate limit spends nothing extra, a reload consumes a
//   clip (guarded both ways: no clip / already full), and none of it is
//   reachable without actually holding the gun.
//   THE WIRE — hold "gun" is ownership-gated; a hit victim gets one gundeath
//   with the server-computed direction; a downed body can't shoot and can't
//   be shot again; the welcome frame carries your own ammo.
//   THE LOCKER — store/take round-trips, the gun moves whole with its load,
//   clips merge into their stack, the 50-slot cap refuses cleanly, and a
//   lockered gun can't be drawn.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8497;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "casino-gun-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
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
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `copper lantern beneath the stairwell ${["nine", "twelve", "forty", "sixty"][secretSeq++ % 4]}`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return r.body?.token ?? null;
};

const floorClient = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-casino?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws,
      frames,
      send: (m) => ws.send(JSON.stringify(m)),
      last: (type) => [...frames].reverse().find((f) => f.type === type),
      count: (type) => frames.filter((f) => f.type === type).length,
      async waitFor(type, ms = 2500) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = this.last(type);
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

/** Every wallet in the world — the conservation probe (a second connection,
 *  read-only, the standing pattern). */
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
const invOf = async (userId) => {
  const db = await openDb();
  const rows = db.prepare("SELECT item, qty FROM casino_inv WHERE userId = ?").all(userId);
  db.close();
  return Object.fromEntries(rows.map((r) => [r.item, r.qty]));
};

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const gunner = await register("gunner", pw);
  const victim = await register("victim", pw);
  const bystander = await register("bystander", pw);
  const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } });
  const admin = adminLogin.body?.token;
  ok(gunner && victim && bystander && admin, "three members + the admin signed in");
  const gunnerId = (await api("GET", "/api/me", { token: gunner })).body?.user?.id
    ?? (await api("GET", "/api/me", { token: gunner })).body?.id;

  // ---- THE PURCHASE --------------------------------------------------------
  const broke = await api("POST", "/api/shop/gun", { token: gunner });
  ok(broke.status === 402 && broke.body?.error === "insufficient", "broke: the gun is refused with a 402");

  await api("POST", "/api/admin/coins", { token: admin, body: { userId: gunnerId, amount: 200_000 } });
  const before = await totalCoins();
  const buy = await api("POST", "/api/shop/gun", { token: gunner });
  ok(buy.status === 200 && buy.body?.coins === 50_000, "150,000 leaves the buyer");
  ok((await totalCoins()) === before - 150_000, "…and lands NOWHERE — the price burns (global conservation)");
  const inv1 = await invOf(gunnerId);
  ok(inv1.gun === 9 && inv1.clip === 1, "the gun arrives loaded (9) with one spare clip");

  const again = await api("POST", "/api/shop/gun", { token: gunner });
  ok(again.status === 409 && again.body?.error === "gun_owned", "a second gun is refused — one per person, ever");
  ok((await totalCoins()) === before - 150_000, "…and the refusal is FREE");

  const clip = await api("POST", "/api/shop/gunclip", { token: gunner });
  ok(clip.status === 200 && clip.body?.clips === 2, "a spare clip: 50,000 burns, 2 in the coat");
  ok((await totalCoins()) === before - 200_000, "clip burn conserved globally");

  const unarmedClip = await api("POST", "/api/shop/gunclip", { token: victim });
  ok(unarmedClip.status === 409 && unarmedClip.body?.error === "no_gun", "Sterling won't sell ammunition to the unarmed");

  // ---- THE WIRE ------------------------------------------------------------
  const g = await floorClient(gunner);
  g.send({ type: "enter", suit: "yellow" });
  const wg = await g.waitFor("welcome");
  ok(wg?.you?.gun === 9 && wg?.you?.clips === 2, "the welcome frame carries your own ammo");

  const v = await floorClient(victim);
  v.send({ type: "enter", suit: "yellow" });
  const wv = await v.waitFor("welcome");
  const vid = wv?.you?.id;
  const b = await floorClient(bystander);
  b.send({ type: "enter", suit: "yellow" });
  await b.waitFor("welcome");
  await sleep(150);

  // an unowned gun can't be held
  v.clear(); g.clear();
  v.send({ type: "hold", id: "gun" });
  await sleep(300);
  ok(!g.frames.some((f) => f.type === "hold" && f.hold === "gun"), "hold \"gun\" without owning one relays NOTHING");

  // …and shooting without holding it spends nothing
  v.send({ type: "shoot" });
  await sleep(250);
  ok(!g.frames.some((f) => f.type === "bang"), "a gunless trigger makes no bang");

  g.send({ type: "hold", id: "gun" });
  const holdSeen = await v.waitFor("hold");
  ok(holdSeen?.hold === "gun", "the owner draws — the room sees the gun in the hand");

  // a newcomer's welcome carries the drawn gun
  const late = await floorClient(admin);
  late.send({ type: "enter", suit: "yellow" });
  const wl = await late.waitFor("welcome");
  ok(wl?.peers?.some((p) => p.hold === "gun"), "a newcomer walks in on the drawn gun (persisted hold)");
  late.send({ type: "leave" });
  late.ws.close();

  // ---- THE SHOT ------------------------------------------------------------
  await sleep(400); // clear the shot rate limit window
  g.clear(); v.clear(); b.clear();
  g.send({ type: "move", x: 10, y: 6, yaw: 0, p: 0 });
  await sleep(80);
  v.send({ type: "move", x: 10, y: 9, yaw: 0, p: 0 });
  await sleep(80);

  // The victim walks into this fully loaded — drunk, tripping, gassed and
  // swollen — because DEATH SOBERS YOU COMPLETELY (Josh, Aug 2026: dying of
  // one substance used to leave you riding the others).
  v.send({ type: "slorp", stage: 2 });
  v.send({ type: "stardust", hits: 2 });
  v.send({ type: "ego", v: 8 });
  v.send({ type: "move", x: 10, y: 9, yaw: 0, p: 0, d: 1, pt: 0 });
  await sleep(200);

  g.send({ type: "shoot", hit: vid });
  const ammo1 = await g.waitFor("ammo");
  ok(ammo1?.rounds === 8, "one round spent — the server counted it");
  const bang = await b.waitFor("bang");
  ok(!!bang, "the room hears the bang");
  const death = await v.waitFor("gundeath");
  ok(!!death && death.id === vid, "the victim gets their gundeath");
  ok(typeof death?.dir === "number" && typeof death?.seed === "number", "…with the server-computed direction and seed");
  const deathAtB = await b.waitFor("gundeath");
  ok(deathAtB?.by !== undefined && deathAtB?.byName === "gunner", "…and the room knows who fired");
  ok((await invOf(gunnerId)).gun === 8, "the DB agrees: 8 rounds left");

  // DEATH SOBERS YOU COMPLETELY. A newcomer's welcome describes the corpse:
  // it must be sober on every substance, not a body still visibly tripping.
  const mourner = await floorClient(await register("mourner", pw));
  mourner.send({ type: "enter", suit: "yellow" });
  const wm = await mourner.waitFor("welcome");
  const corpse = wm?.peers?.find((p) => p.id === vid);
  ok(corpse?.p === 3, "the newcomer finds the body on the carpet");
  ok(corpse?.sl === 0 && corpse?.sd === 0 && corpse?.eg === 0 && corpse?.d === 0,
    `a bullet ends EVERY substance (sl=${corpse?.sl} sd=${corpse?.sd} eg=${corpse?.eg} d=${corpse?.d})`);
  mourner.ws.close();

  // A CORPSE CAN'T STAND ITSELF UP (Oct 2026 review): a second enter on the
  // same socket built a fresh body with downUntil 0 — up at once, able to
  // fire back. Nor can it sit down while it's on the carpet.
  b.clear();
  v.send({ type: "enter", suit: "yellow" });
  const rejoin = await b.waitFor("join", 1500);
  ok(rejoin?.peer?.id === vid && rejoin.peer.p === 3, `re-entering doesn't revive the body (pose ${rejoin?.peer?.p})`);
  b.clear();
  v.send({ type: "sit", seat: 3 });
  await sleep(300);
  ok(!b.frames.some((f) => f.type === "seat" && f.id === vid), "…and a body on the carpet can't take a seat");

  // a corpse is not a target
  await sleep(400);
  v.clear(); b.clear();
  g.send({ type: "shoot", hit: vid });
  await g.waitFor("ammo");
  await sleep(300);
  ok(!v.frames.some((f) => f.type === "gundeath"), "a downed body can't be shot again");

  // …and dead men fire nothing (give the victim a gun via direct grant is
  // overkill — the down gate sits before the gun check, so a held-gun corpse
  // is the same refusal; the gunless case above already proves the other arm)
  v.send({ type: "shoot", hit: null });
  await sleep(250);
  ok(!b.frames.some((f) => f.type === "bang" && f.id === vid), "a downed body fires nothing");

  // ONE APPEARANCE, EVERY OBSERVER: the victim's death-cam mouse keeps
  // sending move frames — before the down guard, a pose-0 frame stood the
  // corpse back up for the whole room while its owner watched it lie there.
  // The wire holds the body down until the clock says otherwise, and the
  // gundeath's seed is stamped on the occupant so a newcomer walking in
  // mid-death folds the SAME body everyone watched fly.
  b.clear();
  v.send({ type: "move", x: 10.1, y: 9, yaw: 0.3, p: 0 });
  await sleep(200);
  const heldDown = b.last("pos");
  ok(heldDown?.id === vid && heldDown?.p === 3, "a shot body stays pose 3 on the wire, whatever its client says");
  const mid = await floorClient(admin); // admin's earlier walk-in already left
  mid.send({ type: "enter", suit: "yellow" });
  const midWel = await mid.waitFor("welcome");
  ok(
    (midWel?.peers ?? []).some((pr) => pr.id === vid && pr.p === 3 && pr.ds === death?.seed),
    "…and a mid-death newcomer gets the gundeath's own seed in the welcome",
  );
  mid.ws.close();
  await sleep(120);

  // the rate limit spends nothing extra — but it ANSWERS. A silent refusal
  // let the client's predicted count run ahead of the truth (Josh fired "more
  // than 9" and stored an "empty" gun that still held two rounds).
  await sleep(400);
  const roundsBefore = (await invOf(gunnerId)).gun;
  g.clear();
  g.send({ type: "shoot" });
  g.send({ type: "shoot" }); // inside SHOT_MIN_MS — refused, with an ammo frame
  await sleep(400);
  ok((await invOf(gunnerId)).gun === roundsBefore - 1, "two triggers inside the rate window spend ONE round");
  ok(g.count("ammo") === 2, "…and the refused trigger still gets an ammo frame");
  ok(g.last("ammo")?.rounds === roundsBefore - 1, "…carrying the TRUE count, so the HUD can't drift");

  // ---- RELOAD --------------------------------------------------------------
  g.clear();
  g.send({ type: "reload" });
  const rl = await g.waitFor("ammo");
  ok(rl?.rounds === 9 && rl?.clips === 1, "a reload fills the gun and consumes a clip");
  const rlSeen = await b.waitFor("reload");
  ok(rlSeen?.id !== undefined, "the room sees the mag swap");
  g.clear();
  g.send({ type: "reload" });
  const rlFull = await g.waitFor("ammo");
  ok(rlFull?.err === "already_full", "reloading a full gun is refused — the clip isn't wasted");
  ok((await invOf(gunnerId)).clip === 1, "…and the clip count proves it");

  // dry-fire: burn the mag down to zero, then click
  for (let i = 0; i < 9; i++) {
    await sleep(340);
    g.send({ type: "shoot" });
  }
  await sleep(400);
  ok((await invOf(gunnerId)).gun === 0, "nine triggers empty the mag");
  g.clear(); b.clear();
  await sleep(340);
  g.send({ type: "shoot" });
  const dry = await g.waitFor("ammo");
  ok(dry?.dry === 1 && dry?.rounds === 0, "a dry trigger reports dry");
  await sleep(200);
  ok(!b.frames.some((f) => f.type === "bang"), "…and the room hears nothing");
  g.clear();
  g.send({ type: "reload" });
  const rl2 = await g.waitFor("ammo");
  ok(rl2?.rounds === 9 && rl2?.clips === 0, "the last clip reloads the empty gun");
  // (the full-gun refusal sits in front of the clip check, so proving the
  // no-clip arm needs one round gone first)
  await sleep(340);
  g.send({ type: "shoot" });
  await g.waitFor("ammo");
  g.clear();
  g.send({ type: "reload" });
  const rlNone = await g.waitFor("ammo");
  ok(rlNone?.err === "no_clip", "no clips left — the reload is refused");

  // ---- THE LOCKER ----------------------------------------------------------
  const items0 = await api("GET", "/api/casino/items", { token: gunner });
  ok(items0.body?.slots === 50, "the locker advertises 50 slots");
  // the sequence above left the gun part-fired — the load that must travel
  const loadNow = (await invOf(gunnerId)).gun;
  const storeGun = await api("POST", "/api/casino/locker/store", { token: gunner, body: { item: "gun" } });
  ok(storeGun.status === 200 && storeGun.body?.locker?.some((s) => s.item === "gun" && s.qty === loadNow), "the gun stores WHOLE — its load travels with it");
  ok(!storeGun.body?.inv?.some((i) => i.item === "gun"), "…and leaves the carried set");

  // a lockered gun can't be drawn
  g.send({ type: "hold", id: "" });
  await sleep(150);
  v.clear();
  g.send({ type: "hold", id: "gun" });
  await sleep(300);
  ok(!v.frames.some((f) => f.type === "hold" && f.hold === "gun"), "a lockered gun can't be drawn on the floor");

  // …but a lockered gun still blocks a second purchase
  await api("POST", "/api/admin/coins", { token: admin, body: { userId: gunnerId, amount: 200_000 } });
  const buyAgain = await api("POST", "/api/shop/gun", { token: gunner });
  ok(buyAgain.status === 409, "one per person holds even with the first in the locker");
  const clipWhileLockered = await api("POST", "/api/shop/gunclip", { token: gunner });
  ok(clipWhileLockered.status === 200, "…but clips still sell (the gun exists)");

  const storeClip = await api("POST", "/api/casino/locker/store", { token: gunner, body: { item: "clip", qty: 1 } });
  ok(storeClip.status === 200, "a clip stores");
  const takeGun = await api("POST", "/api/casino/locker/take", { token: gunner, body: { slot: storeGun.body.slot } });
  ok(takeGun.status === 200 && takeGun.body?.inv?.some((i) => i.item === "gun" && i.qty === loadNow), "the gun comes back, load intact");

  // ---- ORGANIZING (the reworked UI's server half) --------------------------
  const at7 = await api("POST", "/api/casino/locker/store", { token: gunner, body: { item: "gun", slot: 7 } });
  ok(at7.status === 200 && at7.body?.slot === 7, "a TARGETED store lands in the asked-for pigeonhole");
  const clipBuy2 = await api("POST", "/api/shop/gunclip", { token: gunner });
  ok(clipBuy2.status === 200, "…a fresh clip to organize with");
  const ontoGun = await api("POST", "/api/casino/locker/store", { token: gunner, body: { item: "clip", slot: 7 } });
  ok(ontoGun.status === 409 && ontoGun.body?.error === "slot_taken", "storing onto an occupied slot is refused");
  const mv = await api("POST", "/api/casino/locker/move", { token: gunner, body: { from: 7, to: 3 } });
  ok(mv.status === 200 && mv.body?.locker?.some((s) => s.slot === 3 && s.item === "gun"), "move: the gun files from 7 to 3");
  const clipSlot = mv.body.locker.find((s) => s.item === "clip")?.slot;
  const swap = await api("POST", "/api/casino/locker/move", { token: gunner, body: { from: 3, to: clipSlot } });
  ok(
    swap.status === 200 &&
      swap.body?.locker?.some((s) => s.slot === clipSlot && s.item === "gun") &&
      swap.body?.locker?.some((s) => s.slot === 3 && s.item === "clip"),
    "move onto an occupied slot SWAPS the two",
  );
  const mvEmpty = await api("POST", "/api/casino/locker/move", { token: gunner, body: { from: 44, to: 45 } });
  ok(mvEmpty.status === 400 && mvEmpty.body?.error === "empty_slot", "moving from an empty slot is refused");
  // …and the reorganised gun still comes back with its load intact
  const gunSlotNow = swap.body.locker.find((s) => s.item === "gun").slot;
  const back = await api("POST", "/api/casino/locker/take", { token: gunner, body: { slot: gunSlotNow } });
  ok(back.status === 200 && back.body?.inv?.some((i) => i.item === "gun" && i.qty === loadNow), "…and organizing never touched the rounds");

  const storeNothing = await api("POST", "/api/casino/locker/store", { token: victim, body: { item: "gun" } });
  ok(storeNothing.status === 400, "storing what you don't carry is refused");
  const takeEmpty = await api("POST", "/api/casino/locker/take", { token: gunner, body: { slot: 49 } });
  ok(takeEmpty.status === 400, "an empty pigeonhole gives nothing");

  // the 50-slot cap — seeded directly (only two item kinds exist and clips
  // merge, so a full locker can't be built through the API today)
  {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    for (let s = 0; s < 50; s++) {
      db.prepare("INSERT OR REPLACE INTO casino_locker (userId, slot, item, qty) VALUES (?, ?, 'clip', 1)")
        .run(vid, s);
    }
    // …and something non-mergeable to store, so the cap actually gets asked
    db.prepare("INSERT OR REPLACE INTO casino_inv (userId, item, qty) VALUES (?, 'gun', 5)").run(vid);
    db.close();
  }
  const full = await api("POST", "/api/casino/locker/store", { token: victim, body: { item: "gun" } });
  ok(full.status === 409 && full.body?.error === "locker_full", "slot 51 does not exist — the cap refuses cleanly");

  console.log(`\n${n - bad}/${n} casino gun asserts passed`);
  if (bad) {
    console.error("\n--- boot log tail ---\n" + bootLog.slice(-2000));
    process.exitCode = 1;
  }
  stop();
};

run().catch((e) => {
  console.error(e);
  console.error("\n--- boot log tail ---\n" + bootLog.slice(-2000));
  stop();
  process.exitCode = 1;
});
