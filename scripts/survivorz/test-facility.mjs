// SOLACE SURVIVORZ — the facility's logic: the draft map and the door rules
// (src/survivorz/facility.ts, facility-map.ts, doors.ts).
//
// Run:  npm run build && node scripts/survivorz/test-facility.mjs
//
// In-process on a fake clock, against the compiled modules. One assert per
// rule in SURVIVORZ.md §3/§5/§8 the logic carries, plus THE CHAIN: a party
// that starts with nothing picks up what it reaches, throws what it can, and
// must be able to reach every ending — without
// anyone needing nimble 7 (no single stat decides). It lives in
// scripts/survivorz while Survivorz is uncommitted (run-all reads an
// undocumented harness as red).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { facilityProblems, VENT_NIMBLE, FLOOR_Y: FLOOR_Y_ } = require(path.join(ROOT, "dist/survivorz/facility.js"));
const { SITE_9 } = require(path.join(ROOT, "dist/survivorz/facility-map.js"));
const D = require(path.join(ROOT, "dist/survivorz/doors.js"));
const { FacilityWorld, weekAt, VAULT_WINDOW_MS, DOOR_HEALTH, PLANK_HEALTH, MAX_PLANKS, NOISE, WEEK_MS } = D;

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
let clock = 1_800_000_000_000;
const world = () => new FacilityWorld(SITE_9, () => clock);
const clone = (o) => JSON.parse(JSON.stringify(o));
const zoneOf = new Map(SITE_9.rooms.map((r) => [r.id, r.zone]));
const kindOf = new Map(SITE_9.rooms.map((r) => [r.id, r.kind]));
const zonesIn = (set) => new Set([...set].map((r) => zoneOf.get(r)));
const SURV = (keycard = 0, nimble = 5, crowbar = false) => ({ kind: "survivor", keycard, nimble, crowbar });
const OUT = { kind: "zombie", type: "outside" };
const EXP = { kind: "zombie", type: "experiment" };
const ALL_ZONES = SITE_9.zones.map((z) => z.id);

// ---- the shape -------------------------------------------------------------
console.log("-- the shape");
ok(facilityProblems(SITE_9).length === 0, "the map passes every design check: " + JSON.stringify(facilityProblems(SITE_9)));
{
  const { layoutProblems, floorsOf } = require(path.join(ROOT, "dist/survivorz/facility.js"));
  ok(layoutProblems(SITE_9).length === 0, "THE GEOMETRY: no rooms overlap on a floor and every door sits on a wall its rooms share: " + JSON.stringify(layoutProblems(SITE_9)));
  const f = clone(SITE_9);
  f.rooms.find((x) => x.id === "kitchen").rect.x = 30;
  ok(layoutProblems(f).some((p) => p.includes("overlap")), "the geometry checker refuses two rooms in the same space");
  const g = clone(SITE_9);
  g.rooms.find((x) => x.id === "showers").rect.y = 47;
  ok(layoutProblems(g).some((p) => p.includes("res-showers")), "…and a door with no wall between its rooms");
  ok(SITE_9.rooms.filter((x) => (x.spans ?? 1) > 1).length === 3, "three shafts join the floors (two stairs and the freight lift)");
  ok([0, 1, 2].every((fl) => SITE_9.rooms.some((x) => floorsOf(x).includes(fl))), "every floor has rooms on it");
  const area = SITE_9.rooms.reduce((s, x) => s + x.rect.w * x.rect.h, 0);
  ok(area > 9000 && area < 16000, `the facility is the size of a real site (${Math.round(area)} m² of floor)`);
}
{
  const f = clone(SITE_9);
  f.doors.push({ id: "bad-vent", kind: "vent", a: "safe-res", b: "showers" });
  ok(facilityProblems(f).some((p) => p.includes("vent bad-vent reaches a safe room")), "the checker refuses a vent into a safe room");
  const g = clone(SITE_9);
  g.rooms.find((r) => r.id === "safe-power").kind = "room";
  ok(facilityProblems(g).some((p) => p.includes("2 safe rooms")), "…and a map with two safe rooms");
  const h = clone(SITE_9);
  h.rooms.find((r) => r.id === "generator-hall").spots = h.rooms.find((r) => r.id === "generator-hall").spots.filter((s) => s.zone !== "deep");
  ok(facilityProblems(h).some((p) => p.includes("zone deep has no breaker")), "…and a zone with no breaker");
  const i = clone(SITE_9);
  i.doors.find((d) => d.id === "safe-med-door").kind = "door";
  ok(facilityProblems(i).some((p) => p.includes("into a safe room is a door")), "…and an ordinary door on a safe room");
}

// ---- earned, not scheduled ------------------------------------------------------
console.log("-- zones are earned, not scheduled");
{
  const w = world();
  for (const z of ALL_ZONES) w.powered.add(z);
  w.doors.get("pipes-tunnels").pried = true;
  const all = zonesIn(w.reachable(SURV(3, 10, true), SITE_9.start));
  ok(all.size === 8, "on day one, a group holding every card with every zone powered can reach all eight zones: the calendar locks nothing");
  const bare = zonesIn(world().reachable(SURV(0, 5), SITE_9.start));
  ok(JSON.stringify([...bare].sort()) === JSON.stringify(["lobby", "residential"]), "with nothing in hand only the Vault Lobby and the Residential Wing are open");
  ok(SITE_9.zones.every((z) => z.expectWeek >= 1 && z.expectWeek <= 4) && !("opensWeek" in SITE_9.zones[0]), "each zone carries only an expected week, a pacing target");
}
ok(weekAt(0, 0) === 1 && weekAt(0, WEEK_MS) === 2 && weekAt(0, 3 * WEEK_MS + 1) === 4 && weekAt(0, 40 * WEEK_MS) === 4, "the week counts from the show's start and stops at 4");

// ---- THE CHAIN ---------------------------------------------------------------
console.log("-- the chain: nothing in hand, nimble 5, stage by stage");
{
  const w = world();
  let party = SURV(0, 5, false);
  const firstCard = {}, firstPower = {}, firstZone = {};
  const reachedEver = new Set();
  let reachedOverride = false, reachedBench = false, reachedTissue = false, reachedFinal = false;
  for (let stage = 0; stage < 20; stage++) {
    const reach = w.reachable(party, SITE_9.start);
    let changed = false;
    for (const id of reach) {
      reachedEver.add(id);
      const room = SITE_9.rooms.find((r) => r.id === id);
      if (firstZone[room.zone] === undefined && room.kind !== "exit") firstZone[room.zone] = stage;
      for (const sp of room.spots) {
        if (sp.kind === "keycard" && sp.tier > party.keycard) { party = { ...party, keycard: sp.tier }; firstCard[sp.tier] = stage; changed = true; }
        if (sp.kind === "breaker" && !w.hasPower(sp.zone)) { ok(w.throwBreaker(sp.id, id).ok, `stage ${stage}: threw the ${sp.zone} breaker`); firstPower[sp.zone] = stage; changed = true; }
        if (sp.kind === "route-map" && !w.routeMapped) { w.mapRoute(sp.id, id); changed = true; }
        if (sp.kind === "override") reachedOverride = true;
        if (sp.kind === "lab-bench") reachedBench = reachedBench || w.hasPower(room.zone);
        if (sp.kind === "tissue") reachedTissue = true;
        if (sp.kind === "final-file") reachedFinal = true;
      }
      if (id === "boiler" && !party.crowbar) { party = { ...party, crowbar: true }; changed = true; }  // the toolbox
    }
    for (const d of SITE_9.doors) if (d.kind === "safe" && reach.has(d.a) && w.canPass(party, d.id).ok) w.open(party, d.id, d.a);
    if (!changed) break;
  }
  ok(firstCard[1] < firstCard[2] && firstCard[2] < firstCard[3], "the cards come in order: tier 1, then 2, then 3 (each one is behind the last)");
  ok(firstPower.labs > firstCard[2] && firstPower.security > firstCard[2], "the power comes back only after the tier 2 card opens Power & Maintenance");
  const order = SITE_9.zones.map((z) => [z.expectWeek, firstZone[z.id]]);
  ok(order.every(([wk, st]) => st !== undefined) && order.every(([wk, st]) => order.every(([wk2, st2]) => !(wk2 > wk && st2 <= st))),
    "the gates keep the design's pacing order: a zone expected later is always reached at a later stage than one expected sooner");
  ok(reachedBench, "THE CURE: the lab bench in the Deep Lab is reachable WITH the deep's power on");
  ok(reachedTissue, "THE CURE: the specimen cells are reachable (Containment's power broke the lockdown)");
  ok(reachedFinal, "THE TRUTH: the final file in the Deep Lab is reachable");
  ok(reachedOverride && w.routeMapped, "THE ESCAPE: the override is reachable and the tunnel route got mapped");
  const everyRoom = SITE_9.rooms.filter((r) => r.kind !== "sealed" && r.kind !== "exit").map((r) => r.id);
  const missed = everyRoom.filter((id) => !reachedEver.has(id));
  ok(missed.length === 0, "every room but the sealed ones is reachable without nimble 7: " + missed.join(", "));
  ok([...SITE_9.doors.filter((d) => d.kind === "safe")].every((d) => w.doors.get(d.id).found), "all three safe rooms got found and opened");
  const o = w.useOverride("vault-override", "control-room");
  ok(o.ok && w.vaultOpen(), "the override opens the vault");
  ok(w.route(party, "reception", "outside") !== null, "…and the way out is open to everyone in the window");
  ok(w.route(OUT, "reception", "outside") !== null, "…zombies included (the door's open)");
  clock += VAULT_WINDOW_MS + 1;
  ok(!w.vaultOpen() && w.canPass(party, "vault").why === "vault_spent", "the window shuts after VAULT_WINDOW_MS and the vault reads spent");
  ok(w.useOverride("vault-override", "control-room").why === "vault_spent", "…and the override never works twice");
}

// ---- the vault's guards ------------------------------------------------------
console.log("-- the vault");
{
  const w = world();
  ok(w.useOverride("vault-override", "control-room").why === "no_power", "the override refuses without Security's power");
  w.powered.add("security");
  ok(w.useOverride("vault-override", "control-room").why === "no_route", "…and without the tunnel route mapped");
  ok(w.useOverride("vault-override", "reception").why === "not_here", "…and from anywhere but the control room");
  ok(w.canPass(SURV(3, 10), "vault").why === "vault_shut", "the vault is shut before the override");
}

// ---- vents --------------------------------------------------------------------
console.log("-- vents");
{
  const w = world();
  ok(w.canPass(SURV(0, VENT_NIMBLE), "vent-stores-labs").ok, `nimble ${VENT_NIMBLE} fits through a vent`);
  ok(w.canPass(SURV(0, VENT_NIMBLE - 1), "vent-stores-labs").why === "too_big", `nimble ${VENT_NIMBLE - 1} doesn't`);
  ok(!w.canPass(OUT, "vent-stores-labs").ok && !w.canPass(EXP, "vent-stores-labs").ok, "zombies never use a vent");
  ok(w.reachable(SURV(0, 9), SITE_9.start).has("labs-corridor") && !w.reachable(SURV(0, 5), SITE_9.start).has("labs-corridor"), "the vent is a real short cut into the labs for the nimble, before they hold a card");
}

// ---- safe rooms -----------------------------------------------------------------
console.log("-- safe rooms");
{
  const w = world();
  for (const z of ALL_ZONES) w.powered.add(z);
  for (const d of SITE_9.doors) {
    const s = w.doors.get(d.id);
    s.open = true; s.broken = d.kind === "door"; s.pried = true; s.unsealed = true;
  }
  const safe = SITE_9.rooms.filter((r) => r.kind === "safe").map((r) => r.id);
  for (const z of [OUT, EXP]) {
    for (const from of ["specimen-cells", "reception", "far-tunnels", "generator-hall", "med-corridor"]) {
      const reach = w.reachable(z, from);
      ok(safe.every((id) => !reach.has(id)), `an ${z.type} zombie from ${from} reaches no safe room, every other door wide open`);
    }
    ok(safe.every((id) => w.route(z, "res-corridor", id) === null), `…and an ${z.type} zombie has no route into one`);
  }
  const before = JSON.stringify(w.doors.get("safe-res-door"));
  const hit = w.hit(OUT, "safe-res-door", "res-corridor", 9999);
  ok(hit.why === "nothing_to_hit" || hit.why === "steel" || hit.why === "safe_room", "a zombie can't damage a safe door…");
  const w2 = world();
  const h2 = w2.hit(OUT, "safe-res-door", "res-corridor", 9999);
  ok(!h2.ok && h2.noise === NOISE.banging && JSON.stringify(w2.doors.get("safe-res-door")).includes(`"health":${DOOR_HEALTH}`), "…banging on a shut one only makes noise; the door is untouched");
  ok(before === JSON.stringify(w.doors.get("safe-res-door")), "…and its state never changes");
  const w3 = world();
  ok(w3.canPass(SURV(0), "safe-res-door").ok, "the Dormitory safe room is home from day one, no card");
  ok(w3.canPass(SURV(1), "safe-med-door").why === "needs_card", "the Medical safe room needs a tier 2 card the first time");
  ok(w3.open(SURV(2), "safe-med-door", "med-hall").event === "safe.found", "…opening it with one FINDS it");
  ok(w3.canPass(SURV(0), "safe-med-door").ok, "…and after that it's home to everyone, card or not");
}

// ---- ordinary doors, barricades, zombies ----------------------------------------
console.log("-- doors and barricades");
{
  const w = world();
  const s = SURV(0);
  ok(w.close(s, "res-bunks-a", "res-corridor").ok, "a survivor shuts an ordinary door");
  ok(!w.canPass(OUT, "res-bunks-a").ok && w.canPass(EXP, "res-bunks-a").ok, "an outside zombie can't open a shut door; an experiment zombie can");
  ok(w.lock(s, "res-bunks-a", "res-corridor").ok && w.canPass(EXP, "res-bunks-a").why === "locked", "locked, the experiment zombie can't either");
  ok(w.canPass(s, "res-bunks-a").ok, "…but a survivor still can (the thumb-turn)");
  ok(w.lock(s, "decon-labs", "decon-entry").why === "no_lock", "only ordinary doors have a lock");
  w.doors.get("res-bunks-a").locked = false;
  for (let k = 0; k < MAX_PLANKS; k++) ok(w.barricade(s, "res-bunks-a", "res-corridor").noise === NOISE.hammering, `plank ${k + 1} goes up, loud (${NOISE.hammering} cells)`);
  ok(w.barricade(s, "res-bunks-a", "res-corridor").why === "full", `no more than ${MAX_PLANKS} planks`);
  ok(w.canPass(EXP, "res-bunks-a").why === "barricaded" && w.canPass(s, "res-bunks-a").why === "barricaded", "a barricade stops everyone until it comes down");
  ok(w.barricade(s, "res-canteen", "res-corridor").why === "not_barricadable", "a doorway can't be barricaded");
  ok(w.open(s, "res-showers", "res-corridor").ok && w.barricade(s, "res-showers", "res-corridor").why === "open", "an open door can't be barricaded");
  const total = DOOR_HEALTH + MAX_PLANKS * PLANK_HEALTH;
  ok(w.hit(OUT, "res-bunks-a", "res-corridor", total - 1).event === "door.hit", "a hit one short of the barricade plus the door leaves it standing");
  const br = w.hit(OUT, "res-bunks-a", "res-corridor", 1);
  ok(br.event === "door.broken" && br.noise === NOISE.forcedDoor, `the next blow breaks it (${NOISE.forcedDoor} cells)`);
  ok(w.canPass(OUT, "res-bunks-a").ok && w.close(s, "res-bunks-a", "res-corridor").why === "nothing_to_close", "a broken door lets anything through and can't be shut");
  const steel = w.hit(EXP, "decon-labs", "decon-entry", 99999);
  ok(!steel.ok && steel.why === "steel" && !w.doors.get("decon-labs").broken, "steel (a keycard door) never breaks, however hard");
  ok(!w.canPass(EXP, "decon-labs").ok && !w.canPass(EXP, "labs-airlock").ok, "zombies can't open keycard or powered doors");
  ok(w.hit(s, "res-rec", "res-corridor", 10).why === "not_a_zombie" && w.open(s, "res-rec", "bunks-a").why === "not_here", "doors are worked from where you stand, and only zombies hit them");
}

// ---- power, lockdown, the breach ---------------------------------------------------
console.log("-- power and the breach");
{
  const w = world();
  ok(w.canPass(SURV(3), "labs-airlock").why === "no_power", "a powered door is dead until its zone's breaker is thrown");
  ok(w.canPass(SURV(3), "specimen-cell-doors").why === "lockdown" && w.canPass(EXP, "specimen-cell-doors").why === "lockdown", "the specimen cells hold while Containment is dark, card or no card");
  ok(w.throwBreaker("breaker-containment", "generator-hall").event === "zone.powered", "the Containment breaker comes on in the generator hall");
  ok(w.canPass(EXP, "specimen-cell-doors").ok, "THE BREACH: with its power back the lockdown fails and the experiment zombies are loose");
  ok(w.throwBreaker("breaker-containment", "generator-hall").why === "already_on" && w.throwBreaker("breaker-labs", "reception").why === "not_here", "a breaker is thrown once, and only in the generator hall");
  ok(w.hasPower("lobby") && w.hasPower("residential") && w.hasPower("power"), "the lobby, residential and power zones run on emergency power from day one");
}

// ---- the grate and the sealed rooms --------------------------------------------------
console.log("-- the grate and the sealed rooms");
{
  const w = world();
  ok(w.canPass(SURV(3), "pipes-tunnels").why === "needs_crowbar", "the tunnel grate needs a crowbar");
  ok(!w.canPass(EXP, "pipes-tunnels").ok, "zombies can't get through it");
  const pry = w.open(SURV(0, 5, true), "pipes-tunnels", "pipe-gallery");
  ok(pry.event === "door.pried" && pry.noise === NOISE.forcedDoor, "a crowbar pries it, loudly");
  ok(w.canPass(OUT, "pipes-tunnels").ok, "…and once it's open, it's open to the dead too");
  const sealed = SITE_9.rooms.filter((r) => r.kind === "sealed").map((r) => r.id);
  ok(sealed.length === 6, "six sealed rooms for newcomers");
  ok(sealed.every((id) => !w.reachable(SURV(3, 10, true), SITE_9.start).has(id)), "none of them can be reached until it's unsealed");
  ok(w.unseal("panic-room").event === "room.unsealed" && w.reachable(SURV(0), SITE_9.start).has("panic-room"), "the admin unseals one and it can be walked into");
  ok(w.unseal("panic-room").why === "already_unsealed" && w.unseal("canteen").why === "not_sealed_room", "unsealing twice, or a room that isn't sealed, is refused");
}

// ---- the effects payloads (EFFECTS.md section 2: every observer draws the same thing) ----
console.log("-- effects payloads");
{
  const { doorPlacement, doorMaterial } = require(path.join(ROOT, "dist/survivorz/facility.js"));
  let next = 1000;
  const w = new FacilityWorld(SITE_9, () => clock, () => next++);
  const s = SURV(0);
  const c = w.close(s, "res-bunks-a", "res-corridor");
  ok(c.fx?.seed === 1000 && c.fx?.t === clock && c.fx?.event === "door.close", "an event carries the server's seed (once, from the injected source) and the server's clock");
  ok(Array.isArray(c.fx?.at) && c.fx.at.length === 3 && c.fx.door === "res-bunks-a", "…and where it happened, in world metres, with the door's id");
  const h1 = w.hit(OUT, "res-bunks-a", "res-corridor", 10);
  const h2 = w.hit(OUT, "res-bunks-a", "bunks-a", 10);
  ok(h1.fx.side === -1 && h2.fx.side === 1, "a hit from room a is side -1, from room b side +1 (the debris flies out the far side)");
  ok(h1.fx.seed !== h2.fx.seed, "every event gets its own seed");
  ok(h1.fx.material === "wood" && doorMaterial(SITE_9.doors.find((d) => d.id === "decon-labs")) === "metal" && doorMaterial(SITE_9.doors.find((d) => d.id === "labs-offices")) === "glass", "materials: an ordinary door is wood, steel is metal, the glass offices are glass");
  const st = w.doors.get("res-bunks-a");
  const left = st.barricade + st.health;
  w.hit(OUT, "res-bunks-a", "res-corridor", left - 5);
  const br = w.hit(OUT, "res-bunks-a", "res-corridor", 5);
  ok(br.fx?.event === "door.broken" && br.fx.lastHp === 5, "door.broken carries what the door had left before the last blow");
  const bang = w.hit(EXP, "decon-labs", "decon-entry", 50);
  ok(bang.fx?.event === "door.banged" && bang.fx.material === "metal" && bang.fx.side === -1, "a zombie banging on steel still sends a payload: the door, metal, the side");
  const pon = w.setPower("labs", true);
  const poff = w.setPower("labs", false);
  ok(pon.fx?.zone === "labs" && pon.fx.on === true && poff.fx?.on === false && typeof pon.fx.t === "number", "zone.powered carries the zone, on or off, and the server's time");
  ok(w.setPower("labs", false).why === "already_off" && w.setPower("nowhere", true).why === "no_zone", "power can't be switched to what it already is, or for a zone that doesn't exist");
  const thrown = w.throwBreaker("breaker-medical", "generator-hall");
  ok(thrown.fx?.zone === "medical" && thrown.fx.on === true, "a thrown breaker sends zone.powered too");
  ok(w.barricade(s, "res-showers", "res-corridor").fx?.door === "res-showers", "door.barricade names its door");
  const { FLOOR_Y, floorsOf } = require(path.join(ROOT, "dist/survivorz/facility.js"));
  let wrong = 0, onEdge = 0, vertical = 0, built = 0;
  for (const d of SITE_9.doors) {
    const pl = doorPlacement(SITE_9, d.id);
    const A = SITE_9.rooms.find((r) => r.id === d.a), B = SITE_9.rooms.find((r) => r.id === d.b);
    const ra = A.rect, rb = B.rect;
    const shared = floorsOf(A).filter((x) => floorsOf(B).includes(x));
    const unit = Math.abs(Math.hypot(...pl.normal) - 1) < 1e-9;
    if (!shared.length) {
      // a ladder through a grate: it faces down from the upper room, at the upper floor
      vertical++;
      const upperA = A.floor < B.floor;
      if (!unit || pl.normal[1] !== (upperA ? -1 : 1) || pl.centre[1] !== FLOOR_Y[Math.min(A.floor, B.floor)]) wrong++;
      continue;
    }
    if (d.kind === "vent") continue;
    built++;
    const ab = [rb.x + rb.w / 2 - (ra.x + ra.w / 2), rb.y + rb.h / 2 - (ra.y + ra.h / 2)];
    const facing = pl.normal[0] * ab[0] + pl.normal[2] * ab[1] > 0;
    const level = FLOOR_Y[Math.min(...shared)];
    if (!unit || !facing || !(pl.size[0] > 0 && pl.size[1] > 0) || !(pl.centre[1] > level && pl.centre[1] < level + 4)) wrong++;
    const onA = Math.abs(pl.centre[0] - ra.x) < 0.02 || Math.abs(pl.centre[0] - (ra.x + ra.w)) < 0.02 || Math.abs(pl.centre[2] - ra.y) < 0.02 || Math.abs(pl.centre[2] - (ra.y + ra.h)) < 0.02;
    if (onA) onEdge++;
  }
  ok(wrong === 0, "every door sits at its own floor's level with a size and a unit normal pointing from room a into room b (a grate faces down)");
  ok(vertical === 1, "exactly one door is a vertical link: the pipe gallery's grate into the tunnel junction");
  ok(onEdge === built, `every built door (${onEdge} of ${built}, vents aside) sits on the wall its two rooms share`);
}

// ---- the walk map (scripts/survivorz/greybox.mjs → src/survivorz/site9-walk.json) ----------------------
console.log("-- the walk map");
{
  const fs = require("node:fs");
  const W = JSON.parse(fs.readFileSync(path.join(ROOT, "src/survivorz/site9-walk.json"), "utf8"));
  const { floorsOf } = require(path.join(ROOT, "dist/survivorz/facility.js"));
  ok(W.map === SITE_9.id, "the walk map was baked from this map (rebake: node scripts/survivorz/greybox.mjs)");
  const grids = W.floors.map((f) => {
    const g = new Uint8Array(f.w * f.h);
    f.rows.forEach((row, j) => { let i = 0; for (const m of row.matchAll(/(\d+)([.#])/g)) { const k = Number(m[1]); if (m[2] === ".") g.fill(1, j * f.w + i, j * f.w + i + k); i += k; } });
    return { ...f, g };
  });
  const cellOf = (fl, x, z) => { const f = grids[fl]; const i = Math.floor((x - f.origin[0]) * W.res), j = Math.floor((z - f.origin[1]) * W.res); return i >= 0 && j >= 0 && i < f.w && j < f.h ? j * f.w + i : -1; };
  // flood from the vault chamber with every door open: one region per floor, joined by the shafts and the grate
  const seen = grids.map((f) => new Uint8Array(f.w * f.h));
  const queue = [];
  const start = SITE_9.rooms.find((r) => r.id === SITE_9.start).rect;
  const nearestOpen = (fl, x, z) => {
    for (let rad = 0; rad < 12; rad++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const c = cellOf(fl, x + dx / W.res, z + dz / W.res);
      if (c >= 0 && grids[fl].g[c]) return c;
    }
    return -1;
  };
  const push = (fl, c) => { if (c >= 0 && grids[fl].g[c] && !seen[fl][c]) { seen[fl][c] = 1; queue.push([fl, c]); } };
  push(0, nearestOpen(0, start.x + start.w / 2, start.y + start.h / 2));
  const flood = () => { while (queue.length) { const [fl, c] = queue.pop(); const f = grids[fl]; const i = c % f.w, j = (c - i) / f.w;
    if (i > 0) push(fl, c - 1); if (i < f.w - 1) push(fl, c + 1); if (j > 0) push(fl, c - f.w); if (j < f.h - 1) push(fl, c + f.w); } };
  flood();
  // the links: whichever end is reached, the other end is too (stairs, the lift, the ladder)
  for (let pass = 0; pass < 4; pass++) for (const L of W.links) {
    const u = nearestOpen(L.upper.floor, L.upper.at[0], L.upper.at[2]), d = nearestOpen(L.lower.floor, L.lower.at[0], L.lower.at[2]);
    if (u >= 0 && d >= 0 && (seen[L.upper.floor][u] || seen[L.lower.floor][d])) { push(L.upper.floor, u); push(L.lower.floor, d); flood(); }
  }
  const unreached = SITE_9.rooms.filter((r) => !floorsOf(r).some((fl) => {
    const f = grids[fl];
    for (let z = r.rect.y + 0.5; z < r.rect.y + r.rect.h; z += 0.5) for (let x = r.rect.x + 0.5; x < r.rect.x + r.rect.w; x += 0.5) { const c = cellOf(fl, x, z); if (c >= 0 && seen[fl][c]) return true; }
    return false;
  })).map((r) => r.id);
  ok(unreached.length === 0, "with every door open, every room can be walked to from the vault chamber, floors joined by the stairs, the lift and the ladder: " + unreached.join(", "));
  ok(W.links.length === 4, "four links between floors: two stairwells, the freight lift and the grate's ladder");
  const doorsClear = SITE_9.doors.filter((d) => d.kind !== "vent" && d.kind !== "grate").filter((d) => {
    const { doorPlacement } = require(path.join(ROOT, "dist/survivorz/facility.js"));
    const pl = doorPlacement(SITE_9, d.id);
    const A = SITE_9.rooms.find((r) => r.id === d.a), B = SITE_9.rooms.find((r) => r.id === d.b);
    const fl = floorsOf(A).filter((x) => floorsOf(B).includes(x)).find((x) => Math.abs(FLOOR_Y_[x] - (pl.centre[1] - pl.size[1] / 2)) < 0.01);
    if (fl === undefined) return true;
    const c = cellOf(fl, pl.centre[0], pl.centre[2]);
    return !(c >= 0 && grids[fl].g[c]);
  }).map((d) => d.id);
  ok(doorsClear.length === 0, "a body fits through every doorway on the walk map: " + doorsClear.join(", "));
}

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
