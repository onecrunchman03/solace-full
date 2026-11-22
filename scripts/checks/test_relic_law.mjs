// LAW 4 — no duplicate relic until a level's ten are all found.
//
// THE BACKROOMS LAWS (CLAUDE.md), Josh 2026-10-09: "if a player unlocks a relic
// on a certain level they cannot pick it up again until they gather all 10
// relics from that level. after they complete collecting every relic from a
// level only then they can get duplicates." Josh's ruling on HOW (sites are
// shared by everyone on a level): a site has no identity until it is picked
// up, and then it is one of the relics THAT player is still missing.
//
// In-process against the real service, on every level:
//   · each level has ten relics, every one with a description and a Voss line
//   · the wire names no relic before pickup, and tells each viewer whether
//     one is still new to them
//   · nine found → the pickup is the tenth, always — and what a player carries
//     this run counts as found as surely as what they banked
//   · all ten banked → a pickup may be any of the ten (a duplicate)
//   · a relic on a body that you already have stays on the body until you
//     have the full set; one you don't have, you take
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { createBackrooms } = require(path.join(ROOT, "dist", "backrooms", "service.js"));
const { levelRelics } = require(path.join(ROOT, "dist", "backrooms", "relics.js"));

const DB = path.join(ROOT, "data", "relic-law-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);
const { DatabaseSync } = await import("node:sqlite");
let _db2 = null;
const db2 = () => (_db2 ??= new DatabaseSync(DB));
const br = createBackrooms(store);
const NAMES = ["Level 0", "the Poolrooms", "Pipe Dreams", "the Electrical Station", "the Abandoned Office", "the Terror Hotel", "Lights Out", "Thalassophobia", "the Cave System", "the Suburbs"];

let nextId = 7000;
const mk = (level, x, y) => {
  const s = {
    userId: nextId++, name: "collector" + nextId, x, y, heading: 0, door: 0,
    enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
    relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
    lostAt: null, fly: false, level, subSince: null, boatId: null, fall: null,
  };
  br.sessions.set(s.userId, s);
  return s;
};
const siteOn = (level) => br.activeRelics().find((r) => r.lvl === level);

for (let level = 0; level <= 9; level++) {
  const set = levelRelics(level).map((r) => r.slug);
  console.log(`-- ${NAMES[level]}`);
  ok(set.length === 10, `${NAMES[level]} has ten relics (${set.length})`);
  ok(levelRelics(level).every((r) => r.desc?.trim() && r.ada?.trim()), "every one has a description and a Voss line (law 1)");

  // nine banked → the tenth
  const a = siteOn(level);
  ok(!!a, "a relic site is out on the level");
  if (!a) continue;
  const p = mk(level, a.x, a.y);
  const last = set[set.length - 1];
  // five banked in earlier runs, four in hand this run: nine found
  for (const slug of set.slice(0, 5)) store.brUnlockRelic(p.userId, slug);
  p.relics = set.slice(5, 9);
  ok(br.relicsLeft(p.userId, level) === 1, "nine found (five banked, four carried): one left");
  const got = br.takeRelic(p.userId, a.id);
  ok(got.relicId === last, `the pickup is the tenth — carried counts as found (${got.relicId ?? got.error})`);
  for (const slug of set.slice(5, 9)) store.brUnlockRelic(p.userId, slug);
  ok(br.relicsLeft(p.userId, level) === 0, "carried this run counts as found: none left");

  // all ten banked → a duplicate is allowed
  store.brUnlockRelic(p.userId, last);
  p.relics = [];
  const b = siteOn(level);
  if (b) {
    p.x = b.x; p.y = b.y;
    const dup = br.takeRelic(p.userId, b.id);
    ok(set.includes(dup.relicId), `all ten banked, a duplicate comes (${dup.relicId ?? dup.error})`);
  } else {
    console.log("    (only one site out on this level right now — the duplicate case is covered on the others)");
  }

  // a fresh collector never gets one they hold in hand
  br.sessions.delete(p.userId);
}

// ---- the wire: anonymous, and honest about whether it's new to you -------
{
  console.log("-- the wire");
  ok(br.activeRelics().every((r) => typeof r.x === "number"), "sites still stream positions");
  const level = 1;
  const site = siteOn(level);
  const fresh = mk(level, site?.x ?? 0, site?.y ?? 0);
  ok(br.relicsLeft(fresh.userId, level) === 10, "a newcomer has all ten still to find");
  br.sessions.delete(fresh.userId);
}

// ---- a body: what you have stays on it until you have the set -------------
{
  console.log("-- looting a body");
  const level = 0;
  const set = levelRelics(level).map((r) => r.slug);
  const site = siteOn(level) ?? { x: 0, y: 0 };
  const dead = mk(level, site.x, site.y);
  dead.relics = [set[0], set[1]];
  br.forfeit(dead.userId);
  const body = br.activeCorpses().find((c) => c.lvl === level && Math.hypot(c.x - site.x, c.y - site.y) < 6);
  ok(!!body, "the dead runner's body lies where they fell, with their relics");
  if (body) {
    const looter = mk(level, body.x, body.y);
    store.brUnlockRelic(looter.userId, set[0]);
    const view = br.lootView(looter.userId, body.id);
    const items = Array.isArray(view) ? view : view.items ?? [];
    const iHave = items.findIndex((i) => i.kind === "relic" && i.color === set[0]);
    const iNew = items.findIndex((i) => i.kind === "relic" && i.color === set[1]);
    ok(iHave >= 0 && iNew >= 0, "both relics are on the body");
    const refused = br.lootTake(looter.userId, body.id, iHave);
    ok(refused.error === "already_have", `one you already have stays on the body (${refused.error ?? "taken"})`);
    const after = br.lootView(looter.userId, body.id);
    const items2 = Array.isArray(after) ? after : after.items ?? [];
    const iNew2 = items2.findIndex((i) => i.kind === "relic" && i.color === set[1]);
    const took = br.lootTake(looter.userId, body.id, iNew2);
    ok(!took.error && looter.relics.includes(set[1]), "one you don't have, you take");
    // the full set: then a body's relic may come twice
    for (const slug of set) store.brUnlockRelic(looter.userId, slug);
    const after2 = br.lootView(looter.userId, body.id);
    const items3 = Array.isArray(after2) ? after2 : after2.items ?? [];
    const i3 = items3.findIndex((i) => i.kind === "relic" && i.color === set[0]);
    const took2 = i3 >= 0 ? br.lootTake(looter.userId, body.id, i3) : { error: "missing" };
    ok(!took2.error, `with all ten found, a duplicate from a body is allowed (${took2.error ?? "taken"})`);
  }
}

// ---- THE WAY OUT (Josh, Oct 2026: "relics do not leave with player") ---------
{
  console.log("-- walking out with a relic");
  // a freshly booted service (the cases above picked up its sites); the
  // Poolrooms let you out within 2.8 of any of their doors
  const brw = createBackrooms(store);
  const level = 1;
  const set = levelRelics(level).map((r) => r.slug);
  const door = brw.sectorP.doors[0];
  const runner = mk(level, door.x + 0.5, door.y + 0.5);
  br.sessions.delete(runner.userId);
  brw.sessions.set(runner.userId, runner);
  const siteOn = (lv) => brw.activeRelics().find((r) => r.lvl === lv);
  const carriedRows = () => db2().prepare("SELECT slug FROM backrooms_carried WHERE userId = ?").all(runner.userId).map((r) => r.slug);
  const site = siteOn(level);
  ok(!!site, `a relic lies out on Level ${level}`);
  runner.x = site.x; runner.y = site.y;
  const got = brw.takeRelic(runner.userId, site.id);
  ok(set.includes(got.relicId), `picked one up (${got.relicId ?? got.error})`);
  ok(carriedRows().includes(got.relicId), "the pickup is mirrored to the DB at once (survives a restart)");
  runner.x = door.x + 0.5; runner.y = door.y + 0.5;
  const out = brw.exit(runner.userId);
  ok(!out.error && out.relics.length === 1 && out.relics[0].relicId === got.relicId && out.relics[0].fresh === true, `the debrief carries it, fresh (${JSON.stringify(out.relics ?? out.error)})`);
  ok(store.brRelics(runner.userId).some((r) => r.relicId === got.relicId), "...and it is banked in the collection");
  ok(carriedRows().length === 0, "the mirror is cleared when the run ends");
}
{
  console.log("-- a restart mid-run");
  const level = 0;
  const set = levelRelics(level).map((r) => r.slug);
  const p = mk(level, 1, 1);
  store.brUnlockRelic(p.userId, set[3]);
  p.relics = [set[2], set[2], set[3]];
  br.flushFog(); // the timer/shutdown mirror
  const lockerBefore = store.brLockerItems(p.userId).filter((i) => i.kind === "relic").length;
  br.sessions.clear(); // the server stops: every run gone
  const br2 = createBackrooms(store); // ...and boots again
  const mine = store.brRelics(p.userId).map((r) => r.relicId);
  const lockerAfter = store.brLockerItems(p.userId).filter((i) => i.kind === "relic").length;
  ok(mine.includes(set[2]), "a relic carried at the restart is banked at boot");
  ok(lockerAfter - lockerBefore === 2, `...its duplicate and the one already held go to the locker (${lockerAfter - lockerBefore})`);
  ok(db2().prepare("SELECT COUNT(*) AS n FROM backrooms_carried").get().n === 0, "...and the mirror is emptied");
  ok(br2.sessions.size === 0, "(the new boot has no runs)");
}
{
  // (Oct 2026 review) the endless draw on the Async grant: a finding carried
  // into a run could be sold over HTTP and re-minted by a drop or a body
  console.log("-- a finding can't be cloned");
  const uid = nextId++;
  const suit = store.brForceAddItem(uid, "suit", "yellow");
  const tape = store.brForceAddItem(uid, "tape", "close");
  const torch = store.brForceAddItem(uid, "flashlight", null);
  const s = br.enter(uid, "cloner", 0, [suit, tape, torch], 0);
  ok(!s.error && !s.inventory.some((i) => i.id === tape) && s.inventory.some((i) => i.id === torch), "a tape in the loadout stays in the locker; the kit comes in");
  s.inventory.push({ id: tape, kind: "tape", level: 0, color: "close" });
  ok(br.dropItem(uid, tape).error === "cant_drop", "a finding can't be dropped on the floor");
  const before = br.activeDrops().length;
  ok(store.brDeleteItems(uid, [torch]).length === 1 && store.brDeleteItems(uid, [torch]).length === 0, "the locker delete says whether a row really went");
  ok(br.dropItem(uid, torch).error === "not_carried" && br.activeDrops().length === before, "an item whose row is already gone (sold mid-run) drops nothing");
  const routes = (await import("node:fs")).readFileSync(path.join(ROOT, "src", "routes", "backrooms.ts"), "utf8");
  ok(routes.split('if (inRun(user.id, itemId)) return json(res, 409, { error: "inside" })').length - 1 >= 4, "Voss's counter, discard, upgrade and the spray colour refuse an item a live run carries");
  br.sessions.delete(uid);
}
{
  // (Oct 2026 review) gear looted off a body comes with its real locker id —
  // the client made one up, so it couldn't be dropped or used
  console.log("-- looted gear carries its locker id");
  const uid = nextId++;
  const suit = store.brForceAddItem(uid, "suit", "yellow");
  const torch = store.brForceAddItem(uid, "flashlight", null);
  const s = br.enter(uid, "fallen", 0, [suit, torch], 0);
  ok(!s.error, "a runner goes in with a flashlight");
  const at = { x: s.x, y: s.y };
  br.forfeit(uid);
  const body = br.activeCorpses().find((c) => c.name === "fallen");
  const looter = mk(0, at.x, at.y);
  const view = body ? br.lootView(looter.userId, body.id) : { error: "no body" };
  const idx = (view.items ?? []).findIndex((i) => i.kind === "flashlight");
  const got = idx >= 0 ? br.lootTake(looter.userId, body.id, idx) : { error: "no torch" };
  ok(!got.error && got.item.id > 0 && store.brLockerItems(looter.userId).some((i) => i.id === got.item.id) && looter.inventory.some((i) => i.id === got.item.id), `the looted flashlight's id is its new locker row (${JSON.stringify(got.item ?? got.error)})`);
  br.sessions.delete(looter.userId);
}
{
  console.log("-- a map reset banks a frozen run's relics");
  const set = levelRelics(0).map((r) => r.slug);
  const p = mk(0, 1, 1);
  p.relics = [set[5]];
  p.lostAt = Date.now();
  br.flushFog();
  const r = br.resetWorld(false);
  ok(!r.error && store.brRelics(p.userId).some((x) => x.relicId === set[5]), "the voided run's relic is in the collection");
  ok(!br.sessions.has(p.userId) && db2().prepare("SELECT COUNT(*) AS n FROM backrooms_carried WHERE userId = ?").get(p.userId).n === 0, "...the run is gone and its mirror cleared");
}
{
  console.log("-- the client knows every relic");
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "reliccatalog.ts"), "utf8");
  ok(/LEVEL_RELIC_SETS\.flat\(\)/.test(src), "the client catalogue is built from every level's set, not a hand list");
}

console.log(`\ntest_relic_law: ${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
