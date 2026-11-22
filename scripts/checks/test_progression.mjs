// THE WAY DOWN — every level's way on, proven end to end (Josh, Sep 2026:
// "validate level progression between the current levels make sure there is
// a clear path forward for player to get to each level. level 0 is find key
// to door. level 1 is find key to door, level 2 is find 3 fuses for fuse
// box").
//
// In-process, against the real service and the frozen maps:
//   · THE MAPS — every key, door, fuse and fuse box stands on floor you can
//     walk to from that level's way in (a distance map from the entrance, the
//     same one the generators prove connectivity with); the Poolrooms' key
//     and hatch on DRY floor; the fuses spread across the far half of the
//     plant, none on a stair.
//   · THE CHAIN — one runner walks it: Level 0's key into THE DOOR (Level 1
//     opens for everyone), through it to The Landing; the Poolrooms' own key
//     into the drain hatch (Pipe Dreams opens — a MEMBER may now walk in from
//     the hub), down it to The Drain; three fuses into the fuse box by the
//     pressure door (Level 3's door opens), which holds members at the ship
//     gate until Josh has walked the Station and opened it; then through to
//     the Electrical Station, all six breakers thrown, and the lift shutter
//     powered — which holds members at the office's own ship gate until Josh
//     opens it; then down the lift into THE ABANDONED OFFICE, the security
//     keycard carried from The Security Office to THE STAIRWELL DOOR and
//     badged (Level 5 opens for everyone) — which holds members at the
//     hotel's own ship gate until Josh opens it; then down the service stair
//     into THE TERROR HOTEL: the guest register read at its table (and only
//     there), the one suite it names found among the numbered doors, the
//     Boiler Key showing only in that room, the lifts (floor 3 to the same
//     other lift every time, floor 13 the end of the run), the key carried
//     out (home), dropped by a death (on the body), looted, and turned in
//     THE RUSTY DOOR (Level 6 opens for everyone) — then down into LIGHTS
//     OUT: the Handwheel found in the dark and fitted to THE SEA HATCH —
//     which holds members at THALASSOPHOBIA's ship gate until it is opened,
//     then up into the drowned city: the Diving Helmet taken off its roof, a
//     minute of air where a breath is ten seconds, carried out (home),
//     dropped by a death in a street (on the body), dropped in the Drop (home
//     at once — nobody dives that deep), looted, and worn twenty-four metres
//     down to THE SUBWAY STAIR (Level 8 opens for everyone) — which answers
//     "not built" until there is a Level 8. The helmet is a tool, not a key:
//     opening the stair doesn't use it up.
//     Then THE CAVE SYSTEM: the Climbing Rope fixed at the Chimney (Level 9
//     opens for everyone), the Suburbs' own ship gate, and up out of a
//     manhole into THE SUBURBS: the House Key found in a house, carried out
//     (home), dropped by a death in a street (on the body), looted, and
//     turned in NUMBER 9'S FRONT DOOR (the way out opens for everyone) — and
//     out through it, the run ends at home.
//     The keycard and the Boiler Key are the key: carried out of the level
//     they go home, dropped by a death they lie on the body and are looted.
//   · THE RULES the key taught every one of them — a key never leaves its
//     level, a fuse dropped by a death lies on the body (not at home), one
//     carried out of the level goes home, and a door already open says so.
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));

const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { distanceMap } = require(dist("backrooms/worldgen.js"));
const { wetFloor } = require(dist("backrooms/pools-vocab.js"));
const { LEVEL1_FLAG, LEVEL2_FLAG, LEVEL3_FLAG, LEVEL4_FLAG, LEVEL5_FLAG, LEVEL6_FLAG, LEVEL7_FLAG, LEVEL8_FLAG, LEVEL9_FLAG, LEVEL10_FLAG, FUSE_COUNT, FUSE_SITES, BREAKER_COUNT } = require(dist("backrooms/lore.js"));
const CV = require(dist("backrooms/cave-vocab.js"));
const { caveWet, caveBurrow } = require(dist("backrooms/worldgen-cave.js"));
const OV = require(dist("backrooms/ocean-vocab.js"));
const { oceanWet } = require(dist("backrooms/worldgen-ocean.js"));
const { suburbIndoor } = require(dist("backrooms/worldgen-suburb.js"));
const UV = require(dist("backrooms/suburb-vocab.js"));

const DB = path.join(ROOT, "data", "progression-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);
const br = createBackrooms(store);
const dbg = br.debugState();
const secs = [br.sector, br.sectorP, br.sectorD, br.sectorS, br.sectorO, br.sectorH, br.sectorL, br.sectorT, br.sectorC, br.sectorU];
const reach = secs.map((s) => distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y }))));
const at = (lvl, p) => reach[lvl][Math.floor(p.y) * secs[lvl].size + Math.floor(p.x)];
/** A point you can walk to: its own cell, or (for a piece on a wall or in a
 *  machine's footprint) a cell beside it. */
const reachable = (lvl, p) => {
  if (at(lvl, p) >= 0) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(lvl, { x: p.x + dx, y: p.y + dy }) >= 0) return true;
  return false;
};

// ---- THE MAPS ------------------------------------------------------------------------
console.log("-- Level 0: find the key, open THE DOOR");
ok(reachable(0, dbg.key) && reachable(0, dbg.door), `the key (${Math.floor(dbg.key.x)},${Math.floor(dbg.key.y)}) and THE DOOR (${Math.floor(dbg.door.x)},${Math.floor(dbg.door.y)}) both stand on floor you can walk to from The Entrance`);
ok(at(0, dbg.door) >= 150, `THE DOOR is deep (${at(0, dbg.door)} steps from The Entrance)`);

console.log("-- Level 1: find the Poolrooms' key, open the drain hatch");
const dryAt = (p) => !wetFloor(br.sectorP.floor[Math.floor(p.y) * br.sectorP.size + Math.floor(p.x)]);
ok(!!dbg.hatch && !!dbg.keyP, "the Poolrooms have a key and a door of their own");
ok(reachable(1, dbg.hatch) && reachable(1, dbg.keyP), `…both on floor you can walk to from The Landing (hatch ${at(1, dbg.hatch)} steps, key ${at(1, dbg.keyP)})`);
ok(dryAt(dbg.hatch) && dryAt(dbg.keyP), "…both on DRY floor — nobody has to dive for the way on");
ok(at(1, dbg.hatch) >= 100, `the hatch is deep, not at The Landing (${at(1, dbg.hatch)} steps)`);
ok(Math.hypot(dbg.keyP.x - dbg.hatch.x, dbg.keyP.y - dbg.hatch.y) >= 40, "…and its key is far from it");

console.log("-- Level 2: find three fuses, fill the fuse box");
ok(dbg.fuses.length === FUSE_SITES && FUSE_SITES > FUSE_COUNT, `${FUSE_SITES} fuses lie in the plant for ${FUSE_COUNT} slots (${dbg.fuses.map((f) => `${Math.floor(f.x)},${Math.floor(f.y)}`).join(" · ")})`);
ok(dbg.fuses.every((f) => reachable(2, f)), "…every one on floor you can walk to from The Drain");
let spread = Infinity;
for (let a = 0; a < dbg.fuses.length; a++) for (let b = a + 1; b < dbg.fuses.length; b++) spread = Math.min(spread, Math.hypot(dbg.fuses[a].x - dbg.fuses[b].x, dbg.fuses[a].y - dbg.fuses[b].y));
ok(spread >= 20, `…spread out, not in one room (closest pair ${spread.toFixed(0)} cells apart)`);
ok(dbg.fuses.every((f) => br.sectorD.deco[Math.floor(f.y) * br.sectorD.size + Math.floor(f.x)] >> 4 !== 5), "…none on a stair");
const box = br.fuseBox();
ok(!!box && reachable(2, box) && !!box.door && reachable(2, box.door), `the fuse box and the pressure door beside it can be walked to (${box ? `${Math.floor(box.x)},${Math.floor(box.y)}` : "none"})`);
ok(box?.inserted === 0 && box?.total === FUSE_COUNT && !box?.open, "…and the box starts empty, the door shut");

console.log("-- Level 3: throw all six breakers, power the lift shutter");
const st = br.stationState();
ok(!!st && st.breakers.length === BREAKER_COUNT, `${BREAKER_COUNT} breakers in the station, one per section`);
ok(st.breakers.every((b) => reachable(3, b)), "…every one on floor you can walk to from the pressure door");
ok(st.cutoffs.length === BREAKER_COUNT && st.cutoffs.every((c) => reachable(3, c)), "…and every section's cutoff too");
ok(!!st.shutter && reachable(3, st.shutter) && !st.shutter.open, "the lift shutter can be walked to, and starts shut");

console.log("-- Level 4: carry the security keycard to the stairwell door");
const of = br.officeState();
ok(!!of && !!of.keycard && !!of.stairdoor && !of.stairdoor.open, "the office has its keycard and its stairwell door, the door shut");
ok(reachable(4, of.keycard) && reachable(4, of.stairdoor), `…both on floor you can walk to from the lift (keycard ${at(4, of.keycard)} steps, door ${at(4, of.stairdoor)})`);
ok(Math.hypot(of.keycard.x - of.stairdoor.x, of.keycard.y - of.stairdoor.y) >= 40, "…and the keycard is far from the door it opens");

console.log("-- Level 5: read the register, find the room, carry the Boiler Key to the rusty door");
const ht = br.hotelState();
const hinfo = br.sectorH.hotel;
const named = hinfo.suites[hinfo.target];
const hook = { x: named.x + 0.5, y: named.y + 0.5 };
ok(!!ht && !!ht.register && !!ht.rustydoor && !ht.rustydoor.open && ht.suites.length >= 10 && ht.lifts.length >= 2, `the hotel has its register, ${ht.suites.length} suites, ${ht.lifts.length} lift doors and its rusty door, shut`);
ok(reachable(5, ht.register) && reachable(5, ht.rustydoor) && hinfo.suites.every((q) => reachable(5, { x: q.x + 0.5, y: q.y + 0.5 })), "…the register, every suite's hook and the rusty door all on floor you can walk to from the service stair");
ok(at(5, ht.rustydoor) > at(5, ht.register), `…and the rusty door further in than the register (${at(5, ht.rustydoor)} steps against ${at(5, ht.register)})`);
ok(!JSON.stringify(ht).includes('"target"') && !("key" in ht), "the hotel's public state carries neither the register's choice nor the key");

console.log("-- Level 6: find the Handwheel in the dark, fit it to the sea hatch");
const lt = br.lightsState();
const wheelHome = br.keyPos(6);
ok(!!lt && !!lt.hatch && !lt.hatch.open && !!wheelHome, "Lights Out has its Handwheel and its sea hatch, the hatch shut");
ok(reachable(6, wheelHome) && reachable(6, lt.hatch), `…both on floor you can walk to from the stair (wheel ${at(6, wheelHome)} steps, hatch ${at(6, lt.hatch)})`);
ok(Math.hypot(wheelHome.x - lt.hatch.x, wheelHome.y - lt.hatch.y) >= 30, "…and the wheel is far from the hatch it opens");
ok(!("wheel" in lt) && !JSON.stringify(lt).includes("wheel"), "the level's public state never says where the wheel lies");

console.log("-- Level 7: find the Diving Helmet, dive to the subway stair");
const oc = br.oceanState();
const helmetHome = br.keyPos(7);
const T = br.sectorT;
const subI = oc?.subway ? Math.floor(oc.subway.y) * T.size + Math.floor(oc.subway.x) : -1;
ok(!!oc && !!oc.subway && !oc.subway.open && !!helmetHome, "Thalassophobia has its Diving Helmet and its subway stair, the stair shut");
ok(reachable(7, helmetHome) && reachable(7, oc.subway), `…both reachable from the hatch (helmet ${at(7, helmetHome)} steps, stair ${at(7, oc.subway)})`);
ok(T.floor[subI] === OV.PLAZA_FLOOR && oceanWet(T, Math.floor(oc.subway.x), Math.floor(oc.subway.y)), `the stair is at the bottom of the plaza, ${(OV.WATER_LEVEL - T.floor[subI]) / 2}m down`);
ok(!oceanWet(T, Math.floor(helmetHome.x), Math.floor(helmetHome.y)) && Math.hypot(helmetHome.x - oc.subway.x, helmetHome.y - oc.subway.y) >= 40, "the helmet lies on a dry roof, far from the stair");
ok(!JSON.stringify(oc).includes("helmet"), "the level's public state never says where the helmet lies");

console.log("-- Level 8: find the Climbing Rope in the caverns, carry it through the Deep to the Chimney");
const cv = br.caveState();
const ropeHome = br.keyPos(8);
const C = br.sectorC;
ok(!!cv && !!cv.chimney && !cv.chimney.open && !!ropeHome, "the Cave System has its Climbing Rope and its Chimney, no rope in it");
ok(reachable(8, ropeHome) && reachable(8, cv.chimney), `…both on floor you can walk to from the subway stair (rope ${at(8, ropeHome)} steps, chimney ${at(8, cv.chimney)})`);
ok(C.section[Math.floor(ropeHome.y) * C.size + Math.floor(ropeHome.x)] === CV.ZONE_CAVERNS && !caveWet(C, Math.floor(ropeHome.x), Math.floor(ropeHome.y)), "the rope lies dry, in the Caverns");
ok(C.section[Math.floor(cv.chimney.y) * C.size + Math.floor(cv.chimney.x)] === CV.ZONE_DEEP && at(8, cv.chimney) > at(8, ropeHome), "the Chimney is in the Deep, further in than the rope");
ok(!JSON.stringify(cv).includes("rope"), "the level's public state never says where the rope lies");

console.log("-- Level 9: find the House Key in the houses, turn it in Number 9's front door");
const sb = br.suburbState();
const houseKeyHome = br.keyPos(9);
const U = br.sectorU;
ok(!!sb && !!sb.frontDoor && !sb.frontDoor.open && !!houseKeyHome, "the Suburbs have their House Key and Number 9's front door, the door shut");
ok(reachable(9, houseKeyHome) && reachable(9, sb.frontDoor), `…both on floor you can walk to from the manhole (key ${at(9, houseKeyHome)} steps, front door ${at(9, sb.frontDoor)})`);
ok(suburbIndoor(U, Math.floor(houseKeyHome.x), Math.floor(houseKeyHome.y)), "the key lies indoors, in one of the houses");
ok(U.section[Math.floor(sb.frontDoor.y) * U.size + Math.floor(sb.frontDoor.x)] === UV.ZONE_OUT && Math.hypot(houseKeyHome.x - sb.frontDoor.x, houseKeyHome.y - sb.frontDoor.y) >= 40, "the front door is outdoors on its porch, and the key far from it");
ok(!JSON.stringify(sb).includes('"key') && !("key" in sb), "the level's public state never says where the key lies");

// ---- THE CHAIN -----------------------------------------------------------------------
const mkUser = (u) => store.createUser({ username: u, displayName: u, passwordHash: "x" });
const runner = mkUser("runner");
const member = mkUser("member");
const suitFor = (u) => store.brForceAddItem(u.id, "suit", "yellow");
const place = (s, p) => { s.x = p.x; s.y = p.y; };

console.log("-- the chain, Level 0");
ok(br.enter(member.id, member.username, 0, [suitFor(member)], 1).error === "pools_locked", "a member can't walk into the Poolrooms from the hub yet");
const s0 = br.enter(runner.id, runner.username, 0, [suitFor(runner)], 0);
ok(!s0.error && s0.level === 0, "a runner walks into Level 0");
// the key on a body at the bottom of a SHAFT can never be recovered — it goes
// home at once instead of lying out of reach for the body's whole day
{
  const { isPitCell } = require(dist("backrooms/worldgen.js"));
  const sec = br.sector;
  let pit = null;
  for (let y = 0; y < sec.size && !pit; y++) for (let x = 0; x < sec.size && !pit; x++) if (isPitCell(sec, x, y)) pit = { x: x + 0.5, y: y + 0.5 };
  ok(!!pit, "(staging) Level 0 has a shaft");
  if (pit) {
    const mk = br.enter(member.id, member.username, 0, [suitFor(member)], 0);
    place(mk, dbg.key);
    ok(br.takeKey(member.id).ok === true && br.keyPos(0) === null, "a runner picks the key up");
    place(mk, pit);
    br.forfeit(member.id);
    ok(br.keyPos(0) !== null, "…and dying at the bottom of a shaft sends it HOME, not onto a body nobody can reach");
    const body = br.activeCorpses().filter((c) => c.lvl === 0).pop();
    ok(!body || !(body.items ?? []).some((i) => i.kind === "key"), "…the body down there carries no key");
  }
}
place(s0, dbg.door);
ok(br.openDoor(runner.id, runner.username).error === "no_key", "THE DOOR without the key: locked");
place(s0, dbg.key);
ok(br.takeKey(runner.id).ok === true && s0.hasKey, "the key picks up");
{
  // LAW 7: the operator sees the key where it IS — in the runner's hands
  const k = br.operatorView(0).objectives.find((o) => o.kind === "key");
  ok(!!k && k.state === `carried by ${runner.username}` && Math.hypot(k.x - s0.x, k.y - s0.y) < 0.01, `…and the operator view shows it in the runner's hands (${k?.state})`);
}
ok(br.keyPos(0) === null, "…and stops showing where it lay");
place(s0, dbg.door);
ok(br.openDoor(runner.id, runner.username).fresh === true && !!store.brGetFlag(LEVEL1_FLAG), "the key opens THE DOOR — Level 1 is open for everyone");
ok(br.keyPos(0) === null, "…and the key, its job done, never shows again");
const t0 = br.travel(runner.id);
ok(t0.level === 1 && Math.hypot(t0.x - (br.sectorP.doors[0].x + 0.5), t0.y - (br.sectorP.doors[0].y + 0.5)) < 1, "through it to The Landing");

console.log("-- the chain, Level 1");
const s1 = br.sessions.get(runner.id);
place(s1, dbg.hatch);
ok(br.openDoor(runner.id, runner.username).error === "no_key", "the hatch without the Poolrooms' key: locked");
ok(br.travel(runner.id).error === "locked", "…and there's no way down it yet");
ok(!!br.keyPos(1), "the Poolrooms' key is lying where it can be found");
place(s1, dbg.keyP);
ok(br.takeKey(runner.id).ok === true && s1.hasKey && br.keyCarrier(1) === runner.id, "the Poolrooms' key picks up");
place(s1, dbg.hatch);
ok(br.openDoor(runner.id, runner.username).fresh === true && !!store.brGetFlag(LEVEL2_FLAG), "it opens the drain hatch — Pipe Dreams is open for everyone");
ok(br.openDoor(runner.id, runner.username).fresh === false, "…a second try says it's already open");
const t1 = br.travel(runner.id);
ok(t1.level === 2 && Math.hypot(t1.x - (br.sectorD.doors[0].x + 0.5), t1.y - (br.sectorD.doors[0].y + 0.5)) < 1, "down the hatch to The Drain");
const m2 = br.enter(member.id, member.username, 0, [suitFor(member)], 2);
ok(!m2.error && m2.level === 2, "…and a member can now walk into Pipe Dreams from the hub");
br.leave(member.id);

console.log("-- the chain, Level 2");
const s2 = br.sessions.get(runner.id);
// a fuse carried out of the level goes home; one on a body stays on the body
place(s2, dbg.fuses[0]);
ok(br.takeFuse(runner.id, 0).ok === true && !br.fuseSitesOpen().some((f) => f.i === 0), "a fuse picks up, and stops lying where it was");
const m3 = br.enter(member.id, member.username, 0, [suitFor(member)], 2);
place(m3, dbg.fuses[1]);
ok(br.takeFuse(member.id, 1).ok === true, "a second runner picks up another");
br.leave(member.id);
ok(br.fuseSitesOpen().some((f) => f.i === 1), "…and leaving the level sends it home");
const m4 = br.enter(member.id, member.username, 0, [suitFor(member)], 2);
place(m4, dbg.fuses[1]);
br.takeFuse(member.id, 1);
br.forfeit(member.id);
ok(!br.fuseSitesOpen().some((f) => f.i === 1), "a fuse on a body lies on the body, not back at home");
{
  const v = br.operatorView(2);
  const f = v.objectives.find((o) => o.label === "FUSE 2");
  const body = (v.bodies ?? []).find((b) => b.name === member.username);
  ok(!!body && body.carriesObjective, "the operator view lists the body, and that it carries the way on");
  ok(!!f && !!body && f.state === `on ${member.username}'s body` && Math.hypot(f.x - body.x, f.y - body.y) < 0.01, `…and shows the fuse ON it, where it lies (${f?.state})`);
}
// the box: too far, then the fuses in
place(s2, box);
s2.x += 12;
ok(br.insertFuses(runner.id, runner.username).error === "too_far", "the box has to be reached");
place(s2, box);
const i1 = br.insertFuses(runner.id, runner.username);
ok(i1.added === 1 && i1.inserted === 1 && !i1.opened && br.fuseBox().inserted === 1, "one fuse in: 1 of 3, the door still shut");
ok(br.insertFuses(runner.id, runner.username).error === "no_fuse", "an empty-handed runner has nothing to put in");
ok(br.travel(runner.id).error === "locked", "the pressure door won't move with the box a fuse short");
// the rest: two from where they lie — one of them past the first three, since
// ANY three of the ten fill the box — and one off the forfeited runner's body
const bodies = br.activeCorpses().filter((c) => c.lvl === 2);
for (const i of [2, FUSE_SITES - 1]) {
  place(s2, dbg.fuses[i]);
  ok(br.takeFuse(runner.id, i).ok === true, `fuse ${i + 1} picks up`);
}
ok(bodies.length >= 1, "the forfeited runner's body lies in the plant, fuse and all");
{
  const c = bodies[0];
  place(s2, c);
  const view = br.lootView(runner.id, c.id);
  const idx = (view.items ?? []).findIndex((q) => q.kind === "fuse");
  ok(idx >= 0, "…the body carries the fuse, costing its looter no slot");
  const r = br.lootTake(runner.id, c.id, idx);
  ok(!!r && !r.error && s2.fuses.length === 3, "…and the fuse comes off the body into the runner's hands");
}
place(s2, box);
const i2 = br.insertFuses(runner.id, runner.username);
ok(i2.inserted === FUSE_COUNT && i2.opened && !!store.brGetFlag(LEVEL3_FLAG), "all three in: THE PRESSURE DOOR opens for everyone");
ok(i2.added === FUSE_COUNT - 1 && br.fuseBox().inserted === FUSE_COUNT, "…carrying three into a box with room for two: two go in, never four (3 of 3, not 4 of 3)");
ok(br.fuseBox().open && br.fuseSitesOpen().length === 0, "…the box reads full and the spare fuses have left the world");
ok(!br.operatorView(2).objectives.some((o) => o.kind === "fuse" && o.state !== "in"), "…the operator's map shows only the three that went in");
place(s2, dbg.fuses[5]);
ok(br.takeFuse(runner.id, 5).error === "gone", "a spare can't be picked up once the box is full");
place(s2, box);
ok(br.travel(runner.id).error === "not_built", "through it: members wait at the SHIP GATE until the Station is opened to them");
br.setStationOpen(true, "harness");
const t2 = br.travel(runner.id);
ok(t2.level === 3 && Math.hypot(t2.x - (br.sectorS.doors[0].x + 0.5), t2.y - (br.sectorS.doors[0].y + 0.5)) < 1, "…opened, the pressure door takes the runner into the Electrical Station");
ok((br.sessions.get(runner.id).fuses ?? []).length === 0, "…and no fuse comes with them");

console.log("-- the chain, Level 3");
const s3 = br.sessions.get(runner.id);
place(s3, st.shutter);
ok(br.travel(runner.id).error === "locked", "the lift shutter with the breakers off: no power");
/** Step up to a piece on a wall the way a player does: the nearest floor
 *  within arm's reach that the server accepts. */
const stepUpTo = (p, act) => {
  const tries = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) tries.push({ x: Math.floor(p.x) + dx + 0.5, y: Math.floor(p.y) + dy + 0.5 });
  tries.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  let last = null;
  for (const t of tries) {
    if (at(3, t) < 0) continue;
    place(s3, t);
    last = act();
    if (!last.error) return last;
  }
  return last ?? { error: "nowhere_to_stand" };
};
let thrown = 0;
let lastThrow = null;
for (const b of st.breakers) {
  const res = stepUpTo(b, () => br.throwBreaker(runner.id, runner.username, b.section));
  if (!res.error && res.fresh) thrown++;
  lastThrow = res;
}
ok(thrown === BREAKER_COUNT, `every breaker thrown by a runner standing at it (${thrown}/${BREAKER_COUNT})`);
ok(!!lastThrow?.opened && !!store.brGetFlag(LEVEL4_FLAG) && br.stationState().shutter.open, "the sixth one powers the lift shutter — for everyone");
place(s3, st.shutter);
ok(br.travel(runner.id).error === "not_built", "through it: members wait at the office's SHIP GATE until it is opened to them");
br.setOfficeOpen(true, "harness");
const t3 = br.travel(runner.id);
ok(t3.level === 4 && Math.hypot(t3.x - (br.sectorO.doors[0].x + 0.5), t3.y - (br.sectorO.doors[0].y + 0.5)) < 1, "…opened, the lift takes the runner down into the Abandoned Office");

console.log("-- the chain, Level 4");
const s4 = br.sessions.get(runner.id);
place(s4, of.stairdoor);
ok(br.openDoor(runner.id, runner.username).error === "no_key", "the stairwell door without the keycard: the reader stays red");
ok(br.travel(runner.id).error === "locked", "…and it does not open");
place(s4, of.keycard);
ok(br.takeKey(runner.id).ok === true && br.keyCarrier(4) === runner.id && br.keyPos(4) === null, "the keycard picks up in The Security Office");
ok(br.operatorView(4).objectives.some((o) => o.kind === "keycard" && o.state === `carried by ${runner.username}`), "…and the operator sees it in the runner's hands");
// THE KEY'S RULES: carried out of the level, it goes home
place(s4, { x: br.sectorO.doors[0].x + 0.5, y: br.sectorO.doors[0].y + 0.5 });
const out = br.exit(runner.id);
ok(!out.error && br.keyCarrier(4) === null && !!br.keyPos(4), "carried out through the lift, the keycard goes home");
// …dropped by a death, it lies on the body
const carrier = mkUser("carrier");
suitFor(carrier);
const cs = br.enter(carrier.id, carrier.username, 0, store.brLockerItems(carrier.id).map((i) => i.id), 4);
ok(!cs.error, "another runner walks into the office");
place(cs, of.keycard);
ok(br.takeKey(carrier.id).ok === true, "…and takes the keycard");
br.forfeit(carrier.id);
const cbody = br.activeCorpses().find((c) => c.lvl === 4);
ok(!!cbody && br.keyPos(4) === null && br.keyCarrier(4) === null, "dropped by a death, the keycard lies on the body — not at home");
suitFor(runner);
const rs = br.enter(runner.id, runner.username, 0, store.brLockerItems(runner.id).map((i) => i.id), 4);
ok(!rs.error, "the first runner comes back down");
place(rs, cbody);
const cview = br.lootView(runner.id, cbody.id);
const cidx = (cview.items ?? []).findIndex((q) => q.kind === "key");
const took = cidx >= 0 ? br.lootTake(runner.id, cbody.id, cidx) : null;
ok(!!took && !took.error && rs.hasKey && br.keyCarrier(4) === runner.id, "…looted off the body, it is in the runner's hands");
place(rs, of.stairdoor);
const badge = br.openDoor(runner.id, runner.username);
ok(badge.fresh === true && !!store.brGetFlag(LEVEL5_FLAG) && br.officeState().stairdoor.open, "badged at the reader, THE STAIRWELL DOOR opens — for everyone");
ok(br.keyPos(4) === null && br.officeState().keycard === null, "…and the keycard, its one job done, stops showing");
ok(br.openDoor(runner.id, runner.username).fresh === false, "badged again, it says it is already open");
ok(br.travel(runner.id).error === "not_built", "through it: members wait at the hotel's SHIP GATE until it is opened to them");
br.setHotelOpen(true, "harness");
const t5 = br.travel(runner.id);
ok(t5.level === 5 && Math.hypot(t5.x - (br.sectorH.doors[0].x + 0.5), t5.y - (br.sectorH.doors[0].y + 0.5)) < 1, "…opened, the service stair takes the runner down into the Terror Hotel");

console.log("-- the chain, Level 5");
const s5 = br.sessions.get(runner.id);
ok(br.readRegister(runner.id).error === "too_far", "the register can't be read from the service stair");
place(s5, ht.register);
const reg = br.readRegister(runner.id);
ok(reg.number === named.number, `at the table, the register names No. ${reg.number}`);
ok(ht.suites.filter((q) => q.number === reg.number).length === 1, "…and exactly one suite on the floor wears that number");
place(s5, ht.rustydoor);
ok(br.openDoor(runner.id, runner.username).error === "no_key", "the rusty door without the Boiler Key: it doesn't turn");
ok(br.travel(runner.id).error === "locked", "…and it does not open");
// the key shows only in its room
place(s5, { x: named.door.x + 0.5, y: named.door.y + 0.5 + (named.door.side === 2 ? 1.5 : named.door.side === 0 ? -1.5 : 0) });
const inside = s5.x >= named.rect.x && s5.x < named.rect.x + named.rect.w && s5.y >= named.rect.y && s5.y < named.rect.y + named.rect.h;
ok(inside || br.hotelKeyFor(runner.id) === null, "outside its room the key doesn't show");
place(s5, hook);
ok(!!br.hotelKeyFor(runner.id), "standing in the named room, the key on its hook shows");
const other = hinfo.suites.find((q, i) => i !== hinfo.target);
place(s5, { x: other.x + 0.5, y: other.y + 0.5 });
ok(br.hotelKeyFor(runner.id) === null && br.takeKey(runner.id).error, "in any other suite the hook is empty");
place(s5, hook);
ok(br.takeKey(runner.id).ok === true && br.keyCarrier(5) === runner.id && br.keyPos(5) === null, "the Boiler Key comes off its hook");
ok(br.operatorView(5).objectives.some((o) => o.kind === "boilerkey" && o.state === `carried by ${runner.username}`), "…and the operator sees it in the runner's hands");
// THE LIFTS
const L = ht.lifts;
place(s5, L[0]);
const r1 = br.rideLift(runner.id, 3);
ok(!r1.error && Math.hypot(r1.x - L[0].x, r1.y - L[0].y) > 4 && L.some((l) => Math.hypot(r1.x - l.x, r1.y - l.y) < 1.5), "floor 3 comes out at another lift on this floor");
place(s5, L[0]);
const r2 = br.rideLift(runner.id, 3);
ok(!r2.error && Math.hypot(r2.x - r1.x, r2.y - r1.y) < 0.01, "…the same one, every time, from the same car");
place(s5, { x: L[0].x + 6, y: L[0].y + 6 });
ok(br.rideLift(runner.id, 3).error === "too_far" && br.rideLift(runner.id, 0).error, "away from a lift, or a floor that isn't on the panel, nothing happens");
const diver = mkUser("diver");
suitFor(diver);
const ds = br.enter(diver.id, diver.username, 0, store.brLockerItems(diver.id).map((i) => i.id), 5);
place(ds, L[1]);
const d13 = br.rideLift(diver.id, 13);
ok(d13.dead === true && !br.sessions.has(diver.id), "floor 13: the doors close, and that is the end of the run");
// THE KEY'S RULES: carried out of the level, it goes home
place(s5, { x: br.sectorH.doors[0].x + 0.5, y: br.sectorH.doors[0].y + 0.5 });
const out5 = br.exit(runner.id);
ok(!out5.error && br.keyCarrier(5) === null && !!br.keyPos(5), "carried out up the service stair, the Boiler Key goes home");
// …dropped by a death, it lies on the body
const porter = mkUser("porter");
suitFor(porter);
const ps = br.enter(porter.id, porter.username, 0, store.brLockerItems(porter.id).map((i) => i.id), 5);
place(ps, hook);
ok(br.takeKey(porter.id).ok === true, "another runner takes the key off its hook");
br.forfeit(porter.id);
const pbody = br.activeCorpses().find((c) => c.lvl === 5 && c.name === porter.username);
ok(!!pbody && br.keyPos(5) === null && br.keyCarrier(5) === null, "dropped by a death, the Boiler Key lies on the body — not on its hook");
suitFor(runner);
const rs5 = br.enter(runner.id, runner.username, 0, store.brLockerItems(runner.id).map((i) => i.id), 5);
place(rs5, pbody);
const pview = br.lootView(runner.id, pbody.id);
const pidx = (pview.items ?? []).findIndex((q) => q.kind === "key");
const ptook = pidx >= 0 ? br.lootTake(runner.id, pbody.id, pidx) : null;
ok(!!ptook && !ptook.error && rs5.hasKey && br.keyCarrier(5) === runner.id, "…looted off the body, it is in the runner's hands");
place(rs5, ht.rustydoor);
const turn = br.openDoor(runner.id, runner.username);
ok(turn.fresh === true && !!store.brGetFlag(LEVEL6_FLAG) && br.hotelState().rustydoor.open, "turned in the lock, THE RUSTY DOOR opens — for everyone");
ok(br.keyPos(5) === null, "…and the Boiler Key, its one job done, stops showing");
ok(br.openDoor(runner.id, runner.username).fresh === false, "tried again, it says it is already open");
ok(br.travel(runner.id).error === "not_built", "through it: members wait at Lights Out's SHIP GATE until it is opened to them");
br.setLightsOpen(true, "harness");
const t6 = br.travel(runner.id);
ok(t6.level === 6 && Math.hypot(t6.x - (br.sectorL.doors[0].x + 0.5), t6.y - (br.sectorL.doors[0].y + 0.5)) < 1, "…opened, the stairs take the runner down into Lights Out");

console.log("-- the chain, Level 6");
const s6 = br.sessions.get(runner.id);
place(s6, lt.hatch);
ok(br.openDoor(runner.id, runner.username).error === "no_key", "the sea hatch without the Handwheel: it doesn't turn");
ok(br.travel(runner.id).error === "locked", "…and it does not open");
place(s6, wheelHome);
ok(br.takeKey(runner.id).ok === true && br.keyCarrier(6) === runner.id && br.keyPos(6) === null, "the Handwheel is picked up off the floor");
ok(br.operatorView(6).objectives.some((o) => o.kind === "handwheel" && o.state === `carried by ${runner.username}`), "…and the operator sees it in the runner's hands");
// THE KEY'S RULES: carried out of the level, it goes home
place(s6, { x: br.sectorL.doors[0].x + 0.5, y: br.sectorL.doors[0].y + 0.5 });
const out6 = br.exit(runner.id);
ok(!out6.error && br.keyCarrier(6) === null && !!br.keyPos(6), "carried out up the stair, the Handwheel goes home");
// …dropped by a death, it lies on the body
const diver6 = mkUser("diver6");
suitFor(diver6);
const d6 = br.enter(diver6.id, diver6.username, 0, store.brLockerItems(diver6.id).map((i) => i.id), 6);
ok(!d6.error, "another runner walks in by the stair");
place(d6, wheelHome);
ok(br.takeKey(diver6.id).ok === true, "…and takes the Handwheel");
br.forfeit(diver6.id);
const wbody = br.activeCorpses().find((c) => c.lvl === 6 && c.name === diver6.username);
ok(!!wbody && br.keyPos(6) === null && br.keyCarrier(6) === null, "dropped by a death, the Handwheel lies on the body — not where it was found");
suitFor(runner);
const rs6 = br.enter(runner.id, runner.username, 0, store.brLockerItems(runner.id).map((i) => i.id), 6);
ok(!rs6.error, "the first runner comes back down");
place(rs6, wbody);
const wview = br.lootView(runner.id, wbody.id);
const widx = (wview.items ?? []).findIndex((q) => q.kind === "key");
const wtook = widx >= 0 ? br.lootTake(runner.id, wbody.id, widx) : null;
ok(!!wtook && !wtook.error && rs6.hasKey && br.keyCarrier(6) === runner.id, "…looted off the body, it is in the runner's hands");
place(rs6, lt.hatch);
const fit = br.openDoor(runner.id, runner.username);
ok(fit.fresh === true && !!store.brGetFlag(LEVEL7_FLAG) && br.lightsState().hatch.open, "fitted to the hub and turned, THE SEA HATCH opens — for everyone");
ok(br.keyPos(6) === null, "…and the Handwheel, its one job done, stops showing");
ok(br.openDoor(runner.id, runner.username).fresh === false, "tried again, it says it is already open");
ok(br.travel(runner.id).error === "not_built", "through it: members wait at Thalassophobia's SHIP GATE until it is opened to them");
br.setOceanOpen(true, "harness");
const t7 = br.travel(runner.id);
ok(t7.level === 7 && Math.hypot(t7.x - (T.doors[0].x + 0.5), t7.y - (T.doors[0].y + 0.5)) < 1, "…opened, the hatch takes the runner up into the drowned city");
ok(br.keyCarrier(6) === null, "…and the Handwheel stays behind");

console.log("-- the chain, Level 7");
const s7 = br.sessions.get(runner.id);
const sub = oc.subway;
place(s7, sub);
ok(br.openDoor(runner.id, runner.username).error === "too_far", "at the stair with a head above the water: it is 24m down, nobody is at it");
ok(br.travel(runner.id).error === "no_passage", "…and there is no way on from the surface");
br.setSubmerged(runner.id, true);
ok(s7.subSince !== null && br.openDoor(runner.id, runner.username).error === "too_far", "under for a moment: nobody dives 24m in a moment");
s7.subSince = Date.now() - 30_000;
ok(br.openDoor(runner.id, runner.username).error === "no_key", "under long enough to be there, but without the helmet: it stays shut");
ok(br.travel(runner.id).error === "locked", "…and it does not open");
br.setSubmerged(runner.id, false);
// THE HELMET'S BREATH: ten seconds bare, a minute in the helmet
place(s7, helmetHome);
ok(br.takeKey(runner.id).ok === true && br.keyCarrier(7) === runner.id && br.keyPos(7) === null, "the Diving Helmet is picked up off its roof");
ok(br.operatorView(7).objectives.some((o) => o.kind === "helmet" && o.state === `carried by ${runner.username}`), "…and the operator sees it in the runner's hands");
const bare = mkUser("bare7");
suitFor(bare);
const b7 = br.enter(bare.id, bare.username, 0, store.brLockerItems(bare.id).map((i) => i.id), 7);
ok(!b7.error, "a second runner swims in by the hatch");
place(b7, sub);
place(s7, sub);
br.setSubmerged(bare.id, true);
br.setSubmerged(runner.id, true);
b7.subSince = s7.subSince = Date.now() - 15_000;
await new Promise((r) => setTimeout(r, 1_200));
ok(b7.hp < 100 && s7.hp === 100, `fifteen seconds under: bare, the water is taking breath (${Math.round(b7.hp)} hp); in the helmet, nothing (${s7.hp} hp)`);
br.setSubmerged(bare.id, false);
br.setSubmerged(runner.id, false);
br.forfeit(bare.id);
// THE KEY'S RULES: carried out of the level, it goes home
place(s7, { x: T.doors[0].x + 0.5, y: T.doors[0].y + 0.5 });
const out7 = br.exit(runner.id);
ok(!out7.error && br.keyCarrier(7) === null && !!br.keyPos(7), "carried out through the hatch, the helmet goes home");
// …dropped by a death in a street, it lies on the body
const cellWhere = (want) => {
  for (let i = 0; i < T.size * T.size; i++) {
    const x = i % T.size, y = (i / T.size) | 0;
    if (want(i, x, y) && reach[7][i] > 0) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
};
const street = cellWhere((i, x, y) => oceanWet(T, x, y) && T.floor[i] === OV.STREET_FLOOR && T.section[i] === OV.ZONE_CITY);
const drop = cellWhere((i, x, y) => oceanWet(T, x, y) && T.floor[i] < OV.PLAZA_FLOOR);
const diver7 = mkUser("diver7");
suitFor(diver7);
const d7 = br.enter(diver7.id, diver7.username, 0, store.brLockerItems(diver7.id).map((i) => i.id), 7);
place(d7, helmetHome);
ok(!d7.error && br.takeKey(diver7.id).ok === true, "another runner swims in and takes the helmet");
place(d7, street);
br.forfeit(diver7.id);
const hbody = br.activeCorpses().find((c) => c.lvl === 7 && c.name === diver7.username);
ok(!!hbody && br.keyPos(7) === null && br.keyCarrier(7) === null, "dropped by a death in a street, the helmet lies on the body — not on its roof");
suitFor(runner);
const rs7 = br.enter(runner.id, runner.username, 0, store.brLockerItems(runner.id).map((i) => i.id), 7);
place(rs7, hbody);
const hview = br.lootView(runner.id, hbody.id);
const hidx = (hview.items ?? []).findIndex((q) => q.kind === "key");
const htook = hidx >= 0 ? br.lootTake(runner.id, hbody.id, hidx) : null;
ok(!!htook && !htook.error && rs7.hasKey && br.keyCarrier(7) === runner.id, "…looted off the body, it is in the runner's hands");
// …dropped in the Drop, it goes home at once: nobody dives that deep
place(rs7, { x: T.doors[0].x + 0.5, y: T.doors[0].y + 0.5 });
br.exit(runner.id);
const diverD = mkUser("diverD");
suitFor(diverD);
const dd = br.enter(diverD.id, diverD.username, 0, store.brLockerItems(diverD.id).map((i) => i.id), 7);
place(dd, helmetHome);
ok(!dd.error && br.takeKey(diverD.id).ok === true, "…carried home again, and taken again, out to the Drop");
place(dd, drop);
br.forfeit(diverD.id);
const dbody = br.activeCorpses().find((c) => c.lvl === 7 && c.name === diverD.username);
ok(br.keyCarrier(7) === null && !!br.keyPos(7) && !(dbody?.items ?? []).some((q) => q.kind === "key"), "dropped by a death in the Drop, the helmet goes home at once — nobody dives that deep");
// …and worn down to the stair, it opens it
suitFor(runner);
const rt7 = br.enter(runner.id, runner.username, 0, store.brLockerItems(runner.id).map((i) => i.id), 7);
place(rt7, helmetHome);
br.takeKey(runner.id);
place(rt7, sub);
br.setSubmerged(runner.id, true);
rt7.subSince = Date.now() - 30_000;
const dive = br.openDoor(runner.id, runner.username);
ok(dive.fresh === true && !!store.brGetFlag(LEVEL8_FLAG) && br.oceanState().subway.open, "worn twenty-four metres down to it, THE SUBWAY STAIR opens — for everyone");
ok(rt7.hasKey && br.keyCarrier(7) === runner.id, "…and the helmet is a tool, not a key: still on, for the swim back up");
ok(br.openDoor(runner.id, runner.username).fresh === false, "tried again, it says it is already open");
ok(br.travel(runner.id).error === "not_built", "down it: members wait at the Cave System's SHIP GATE until it is opened to them");
// THE HELMET, EVERY TIME: a bare body at the stair is turned back even with it open
rt7.hasKey = false;
br.setCaveOpen(true, "harness");
ok(br.travel(runner.id).error === "no_helmet", "open, but without the helmet: the stair turns them back (a bare body drowns on the way)");
br.setCaveOpen(false, "harness");
rt7.hasKey = true;
br.setCaveOpen(true, "harness");
const t8 = br.travel(runner.id);
const C0 = C.doors[0];
ok(t8.level === 8 && Math.hypot(t8.x - (C0.x + 0.5), t8.y - (C0.y + 0.5)) < 1.5, "…opened, the subway stair takes the runner down onto the flooded platform");
ok(br.keyCarrier(7) === null && !!br.keyPos(7), "…and the helmet stays behind on its roof for the next diver");

console.log("-- the chain, Level 8");
const s8 = br.sessions.get(runner.id);
place(s8, cv.chimney);
ok(br.openDoor(runner.id, runner.username).error === "no_key", "at the Chimney with bare hands: you can't climb it, it wants a rope");
ok(br.travel(runner.id).error === "locked", "…and there's no way up it");
place(s8, ropeHome);
ok(br.takeKey(runner.id).ok === true && br.keyCarrier(8) === runner.id && br.keyPos(8) === null, "the Climbing Rope is picked up off the cavern floor");
ok(br.operatorView(8).objectives.some((o) => o.kind === "rope" && o.state === `carried by ${runner.username}`), "…and the operator sees it in the runner's hands");
// THE KEY'S RULES: carried out of the level, it goes home
place(s8, { x: C0.x + 0.5, y: C0.y + 0.5 });
const out8 = br.exit(runner.id);
ok(!out8.error && br.keyCarrier(8) === null && !!br.keyPos(8), "carried out up the subway stair, the rope goes home");
// …dropped by a death in the Burrower's passages, it lies on the body
const cellIn = (want) => {
  for (let i = 0; i < C.size * C.size; i++) {
    const x = i % C.size, y = (i / C.size) | 0;
    if (want(i, x, y) && reach[8][i] > 0) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
};
const passage = cellIn((i, x, y) => caveBurrow(C, x, y));
const caver = mkUser("caver8");
suitFor(caver);
const c8 = br.enter(caver.id, caver.username, 0, store.brLockerItems(caver.id).map((i) => i.id), 8);
place(c8, ropeHome);
ok(!c8.error && br.takeKey(caver.id).ok === true, "another runner comes down and takes the rope");
place(c8, passage);
br.forfeit(caver.id);
const rbody = br.activeCorpses().find((c) => c.lvl === 8 && c.name === caver.username);
ok(!!rbody && br.keyPos(8) === null && br.keyCarrier(8) === null, "dropped by a death in the passages, the rope lies on the body — not where it was found");
suitFor(runner);
const rs8 = br.enter(runner.id, runner.username, 0, store.brLockerItems(runner.id).map((i) => i.id), 8);
ok(!rs8.error, "the first runner comes back down");
place(rs8, rbody);
const rview = br.lootView(runner.id, rbody.id);
const ridx = (rview.items ?? []).findIndex((q) => q.kind === "key");
const rtook = ridx >= 0 ? br.lootTake(runner.id, rbody.id, ridx) : null;
ok(!!rtook && !rtook.error && rs8.hasKey && br.keyCarrier(8) === runner.id, "…looted off the body, it is in the runner's hands");
// …and fixed at the Chimney's foot, the climb opens
place(rs8, cv.chimney);
const fix = br.openDoor(runner.id, runner.username);
ok(fix.fresh === true && !!store.brGetFlag(LEVEL9_FLAG) && br.caveState().chimney.open, "fixed at the Chimney's foot, THE CLIMB opens — for everyone");
ok(br.keyPos(8) === null && br.keyCarrier(8) === null && !rs8.hasKey, "…and the rope stays in the Chimney: it stops showing, nobody carries it");
ok(br.operatorView(8).objectives.some((o) => o.kind === "chimney" && o.state === "open"), "…and the operator sees the Chimney open");
ok(br.openDoor(runner.id, runner.username).fresh === false, "tried again, it says it is already open");
ok(br.travel(runner.id).error === "not_built", "up it: members wait at the Suburbs' SHIP GATE until it is opened to them");
ok(br.enter(member.id, member.username, 0, [suitFor(member)], 9).error === "suburbs_locked", "…and a member can't walk into the Suburbs from the hub either");
br.setSuburbsOpen(true, "harness");
const t9 = br.travel(runner.id);
const U0 = U.doors[0];
ok(t9.level === 9 && Math.hypot(t9.x - (U0.x + 0.5), t9.y - (U0.y + 0.5)) < 1.5, "…opened, the Chimney comes out of a manhole into the Suburbs");
ok(!br.sessions.get(runner.id).hasKey && br.keyCarrier(8) === null, "…and the rope stays in the Chimney behind them");

console.log("-- the chain, Level 9");
const s9 = br.sessions.get(runner.id);
ok(br.travel(runner.id).error === "no_passage", "there's no way further down: the manhole only goes back");
place(s9, sb.frontDoor);
ok(br.openDoor(runner.id, runner.username).error === "no_key", "at Number 9's front door with no key: locked");
ok(br.exit(runner.id).error === "not_at_door", "…and a locked front door is no way out");
place(s9, houseKeyHome);
ok(br.takeKey(runner.id).ok === true && br.keyCarrier(9) === runner.id && br.keyPos(9) === null, "the House Key is picked up in the house it lies in");
ok(br.operatorView(9).objectives.some((o) => o.kind === "housekey" && o.state === `carried by ${runner.username}`), "…and the operator sees it in the runner's hands");
// THE KEY'S RULES: carried out of the level, it goes home
place(s9, { x: U0.x + 0.5, y: U0.y + 0.5 });
const out9 = br.exit(runner.id);
ok(!out9.error && !out9.home && br.keyCarrier(9) === null && !!br.keyPos(9), "carried back down the manhole, the key goes home (and the manhole is only the way back)");
// …dropped by a death in the dark street, it lies on the body
let street9 = null;
for (let i = 0; i < U.size * U.size && !street9; i++) {
  const x = i % U.size, y = (i / U.size) | 0;
  if (reach[9][i] > 20 && U.section[i] === UV.ZONE_OUT && U.districts[U.district[i]]?.type === "road") street9 = { x: x + 0.5, y: y + 0.5 };
}
const walker9 = mkUser("walker9");
suitFor(walker9);
const w9 = br.enter(walker9.id, walker9.username, 0, store.brLockerItems(walker9.id).map((i) => i.id), 9);
place(w9, houseKeyHome);
ok(!w9.error && br.takeKey(walker9.id).ok === true, "another runner walks up from the hub and takes the key");
place(w9, street9);
br.forfeit(walker9.id);
const kbody = br.activeCorpses().find((c) => c.lvl === 9 && c.name === walker9.username);
ok(!!kbody && br.keyPos(9) === null && br.keyCarrier(9) === null, "dropped by a death in the street, the key lies on the body — not in its house");
suitFor(runner);
const rs9 = br.enter(runner.id, runner.username, 0, store.brLockerItems(runner.id).map((i) => i.id), 9);
ok(!rs9.error, "the first runner comes back up");
place(rs9, kbody);
const kview = br.lootView(runner.id, kbody.id);
const kidx = (kview.items ?? []).findIndex((q) => q.kind === "key");
const ktook = kidx >= 0 ? br.lootTake(runner.id, kbody.id, kidx) : null;
ok(!!ktook && !ktook.error && rs9.hasKey && br.keyCarrier(9) === runner.id, "…looted off the body, it is in the runner's hands");
// …and turned in Number 9's front door, the way out opens
place(rs9, sb.frontDoor);
const home9 = br.openDoor(runner.id, runner.username);
ok(home9.fresh === true && !!store.brGetFlag(LEVEL10_FLAG) && br.suburbState().frontDoor.open && !!br.level10(), "turned in Number 9's front door, THE WAY OUT opens — for everyone");
ok(br.keyPos(9) === null && br.keyCarrier(9) === null && !rs9.hasKey, "…and the key has done its job: it stops showing, nobody carries it");
ok(br.operatorView(9).objectives.some((o) => o.kind === "frontdoor" && o.state === "open"), "…and the operator sees the front door open");
ok(br.openDoor(runner.id, runner.username).fresh === false, "tried again, it says it is already open");
ok(br.takeKey(runner.id).error === "already_open" || br.takeKey(runner.id).error === "too_far", "…and there is no key left to take");
const gotOut = br.exit(runner.id);
ok(!gotOut.error && gotOut.home === true && !br.sessions.get(runner.id), "through the open front door: OUT — the run ends at home, the descent over");

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
