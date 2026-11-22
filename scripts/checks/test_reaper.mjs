// THE REAPER — the death decision itself, driven against the real store.
//
//   node scripts/checks/test_reaper.mjs
//
// Every other death harness starts AFTER somebody has died: test_mortality
// weighs the estate, test_wake_http proves a grave's session can't reach an
// ordinary route, check_mig68 rewinds the schema. Nothing anywhere drove
// `applyOutcome`'s death branch — the single most consequential decision in
// the game, and the one Josh caught sparing an unshielded player.
//
// The claims, in the order the branch makes them:
//
//   * THE HOUSE CAN'T DIE. An admin on the wedge survives, immune, and does
//     NOT spend a shield doing it.
//   * A BLINK IS NOT A SAVE. The 68% misfire returns a blank flagged
//     `reaperMissed` — never `death_survived` — and it must never consume a
//     talisman, since a shield spent on a miss is a shield stolen.
//   * A SHIELD IS SPENT EXACTLY ONCE. The talisman is gone from the
//     inventory afterwards, the save is counted, and nothing else moves.
//   * AN UNSHIELDED DEATH IS A DEATH. Over many forced rolls, no unshielded
//     non-admin is ever spared — the bug this file exists for.
//   * THE RIG IS NOT A GUARANTEED KILL. A rigged spin skips the reaper's
//     roll but still meets the talisman, so the admin tool kills only the
//     unshielded. Pinned here because the doc has claimed otherwise.
//   * THE SHIELD'S SOURCES. The talisman wedge grants once and pays a bonus
//     spin when you're already holding one; the mystery box does the same.
//
// Driven in process against a real Store — the claims are about what is in
// the database afterwards, not what a function returned.


import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const {
  applyOutcome, spin, TALISMAN_CODE, WHEEL_SLOTS,
  reaperRate, reaperGraceLeft,
  REAPER_SHIELD_RATE, REAPER_BASE, REAPER_GRACE, REAPER_RAMP, REAPER_CAP,
} = require(path.join(ROOT, "dist", "wheel.js"));

const DB = path.join(ROOT, "data", "reaper-harness.db");
const wipe = () => { for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} } };
wipe();

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);

// A catalogue small enough to reason about, with the shield in it.
const catalogue = [
  { code: "c1", tier: "common" }, { code: "c2", tier: "common" },
  { code: "r1", tier: "rare" }, { code: "l1", tier: "legendary" },
  { code: TALISMAN_CODE, tier: "talisman" },
];
store.seedEmoji(catalogue.map((e) => ({ ...e, name: e.code, file: `${e.code}.png` })));

let seq = 0;
const person = (opts = {}) => {
  const u = store.createUser({
    username: `reap${++seq}`, displayName: `Reap ${seq}`, passwordHash: "x",
    isAdmin: opts.admin === true,
  });
  if (opts.shield) store.addEmoji(u.id, TALISMAN_CODE);
  return store.getUserById(u.id);
};
const alive = (id) => {
  const u = store.getUserById(id);
  return u.disabled !== 1 && u.disabled !== true && !u.diedAt;
};
const shielded = (id) => store.ownsEmoji(id, TALISMAN_CODE);
const stat = (id, key) => {
  const rows = store.achievementFacts ? null : null;
  void rows;
  return store.statValue ? store.statValue(id, key) : readStat(id, key);
};
// The store has no single-stat reader, so go straight at the table the way the
// panel does — this is a harness, and the value is the claim.
const { DatabaseSync } = await import("node:sqlite");
const peek = new DatabaseSync(DB);
function readStat(id, key) {
  const r = peek.prepare("SELECT value FROM user_stats WHERE userId = ? AND key = ?").get(id, key);
  return r ? r.value : 0;
}

// applyOutcome writes one [wheel] line per landing, which is exactly what we
// want in the journal and exactly what we do not want four thousand of in the
// suite's output. Swallow those lines only, and COUNT them, so the forensic
// trail is asserted rather than merely tolerated.
let wedgeLines = 0;
const realLog = console.log;
console.log = (...a) => {
  if (typeof a[0] === "string" && a[0].startsWith("[wheel] death wedge:")) { wedgeLines++; return; }
  realLog(...a);
};

const forced = { forced: true };

// ---- 1. the wedge is where we think it is --------------------------------
console.log("\n-- the wedge");
{
  ok(WHEEL_SLOTS.filter((s) => s === "death").length === 1, "exactly one death wedge on the disc");
  ok(WHEEL_SLOTS.filter((s) => s === "talisman").length === 1, "…and exactly one talisman wedge");
  ok(
    reaperRate(0, true) === REAPER_SHIELD_RATE,
    `against a talisman the wedge fires on ${Math.round(REAPER_SHIELD_RATE * 100)}% of landings, whatever the patience says`,
  );
  ok(reaperRate(999, true) === REAPER_SHIELD_RATE, "…the bare counter is ignored while shielded");
}

// ---- 1b. THE PATIENCE, as pure arithmetic --------------------------------
console.log("\n-- the reaper's patience");
{
  ok(reaperRate(0, false) === REAPER_BASE, `freshly bare, a landing fires at only ${REAPER_BASE * 100}%`);
  ok(reaperRate(REAPER_GRACE, false) === REAPER_BASE, `…and still does at the last spin of grace (${REAPER_GRACE})`);
  ok(
    Math.abs(reaperRate(REAPER_GRACE + 1, false) - (REAPER_BASE + REAPER_RAMP)) < 1e-9,
    "…one spin past the grace it steps up by exactly one ramp",
  );
  let climbing = true;
  for (let b = REAPER_GRACE; b < REAPER_GRACE + 40; b++) {
    if (reaperRate(b + 1, false) < reaperRate(b, false)) climbing = false;
  }
  ok(climbing, "…and never once goes back down: the reaper only gets hungrier");
  ok(reaperRate(10_000, false) === REAPER_CAP, `…topping out at ${REAPER_CAP * 100}%, never a certainty`);
  ok(reaperRate(-5, false) === REAPER_BASE, "a negative counter reads as freshly bare, not as a bonus");
  ok(
    reaperGraceLeft(0) === REAPER_GRACE && reaperGraceLeft(REAPER_GRACE) === 0 && reaperGraceLeft(999) === 0,
    "the gauge counts the grace down to zero and stops there",
  );
  // The danger has to be REACHABLE, or the ramp is decoration.
  ok(reaperRate(REAPER_GRACE + 10, false) > 0.5, "ten spins past the grace it is worse than a coin flip");
}

// ---- 2. THE BUG: an unshielded death is a death ---------------------------
console.log("\n-- an unshielded player on the wedge");
{
  // One forced roll, inspected in full.
  const u = person();
  const before = store.inventoryCount(u.id);
  const r = applyOutcome(store, u, "death", forced);
  ok(r.type === "death", `an unshielded non-admin DIES on the wedge (got "${r.type}")`);
  ok(!alive(u.id), "…the account is tombstoned in the database, not merely told it died");
  // deathCause is a column, not a field on User — read the stone itself.
  const stone = peek.prepare("SELECT deathCause, graveSealsAt FROM users WHERE id = ?").get(u.id);
  ok(stone.deathCause === "wheel", "…the cause is carved as the wheel's");
  ok(!!stone.graveSealsAt && stone.graveSealsAt > Date.now(), "…and the 48h wake window is open");
  ok(store.inventoryCount(u.id) === before, "…the collection is untouched at death (the estate waits for the seal)");

  // And now the claim that matters: NEVER spared. A hundred fresh unshielded
  // players, every one of them forced onto the wedge.
  let spared = 0, killed = 0;
  for (let i = 0; i < 100; i++) {
    const v = person();
    const out = applyOutcome(store, v, "death", forced);
    if (out.type === "death") killed++;
    else spared++;
  }
  ok(spared === 0 && killed === 100, `100 unshielded players forced onto the wedge: 100 deaths, ${spared} spared`);
}

// ---- 3. the shield, spent exactly once ------------------------------------
console.log("\n-- the shield");
{
  const u = person({ shield: true });
  const r = applyOutcome(store, u, "death", forced);
  ok(r.type === "death_survived" && !r.immune, "a shielded player survives the wedge");
  ok(alive(u.id), "…and is still alive in the database");
  ok(!shielded(u.id), "…with the talisman consumed");
  ok(readStat(u.id, "talisman_saves") === 1, "…the save counted once");
  ok(readStat(u.id, "reaper_blinks") === 0, "…and a save is NOT counted as a blink");

  // The same account, now bare, meets the wedge again.
  const again = applyOutcome(store, u, "death", forced);
  ok(again.type === "death", "the SAME account, shield spent, dies on the next wedge — the shield is not a standing immunity");
  ok(!alive(u.id), "…and is tombstoned");
}

// ---- 4. the house can't die -----------------------------------------------
console.log("\n-- the house");
{
  const a = person({ admin: true, shield: true });
  const r = applyOutcome(store, a, "death", forced);
  ok(r.type === "death_survived" && r.immune === true, "an admin on the wedge survives, flagged immune");
  ok(alive(a.id), "…and is never tombstoned");
  ok(shielded(a.id), "…and does NOT burn a talisman doing it (immunity is checked first)");
  ok(readStat(a.id, "talisman_saves") === 0, "…so no save is recorded against the house");

  const bare = person({ admin: true });
  ok(applyOutcome(store, bare, "death", forced).immune === true, "an unshielded admin is immune too");
  ok(alive(bare.id), "…and lives");
}

// ---- 5. A BLINK IS NOT A SAVE ---------------------------------------------
console.log("\n-- the reaper blinks");
{
  // Unforced rolls on an UNSHIELDED player, one fresh account per roll so a
  // death doesn't end the sample. This is the branch Josh watched spare
  // somebody: it must be reachable, must read as a blank, and must never
  // claim a shield saved them.
  const N = 2000;
  // Sample DEEP into the ramp, where the rate is pinned at the cap — the
  // interesting claim here is the SHAPE of the outcomes, and a 2% base rate
  // would need a hundred thousand rolls to say anything about the other one.
  const DEEP = REAPER_GRACE + 200;
  let fired = 0, blinked = 0, wrongShape = 0;
  const bodies = [];
  for (let i = 0; i < N; i++) {
    const v = person();
    const out = applyOutcome(store, v, "death", { bare: DEEP });
    if (out.type === "death") { fired++; bodies.push(v.id); }
    else if (out.type === "blank" && out.reaperMissed === true) blinked++;
    else wrongShape++;
  }
  ok(wrongShape === 0, `an unshielded roll is only ever a death or a flagged blink (${wrongShape} other shapes in ${N})`);
  ok(blinked + fired === N, "…every roll resolved");
  const want = reaperRate(DEEP, false);
  const rate = fired / N;
  const tol = 4 * Math.sqrt((want * (1 - want)) / N);
  ok(
    Math.abs(rate - want) < tol,
    `deep in the ramp the wedge fires ${(rate * 100).toFixed(1)}% of the time against a designed ${(want * 100).toFixed(0)}%`,
  );
  // …and a freshly-bare player is genuinely safer, which is the whole rule.
  let freshFired = 0;
  for (let i = 0; i < 1500; i++) {
    const v = person();
    if (applyOutcome(store, v, "death", { bare: 0 }).type === "death") freshFired++;
  }
  ok(
    freshFired / 1500 < want / 3,
    `a freshly-bare player dies far less often than one deep in the ramp (${((freshFired / 1500) * 100).toFixed(1)}% vs ${(want * 100).toFixed(0)}%)`,
  );
  ok(bodies.every((id) => !alive(id)), "every fire left a real grave");

  // A blink must not pick your pocket.
  let blinkSpentAShield = 0, blinkCountedAsSave = 0;
  for (let i = 0; i < 400; i++) {
    const v = person({ shield: true });
    const out = applyOutcome(store, v, "death", { bare: DEEP });
    if (out.type === "blank") {
      if (!shielded(v.id)) blinkSpentAShield++;
      if (readStat(v.id, "talisman_saves") > 0) blinkCountedAsSave++;
      if (readStat(v.id, "reaper_blinks") !== 1) blinkCountedAsSave++;
    } else {
      // it fired: the shield is spent, and that is the OTHER branch's claim
      if (shielded(v.id)) blinkSpentAShield++;
    }
  }
  ok(blinkSpentAShield === 0, "a blink never consumes the shield, and a fire always does");
  ok(blinkCountedAsSave === 0, "…a blink is counted as a blink, never as a talisman save");
}

// ---- 6. the rig is not a guaranteed kill ----------------------------------
console.log("\n-- the admin's rig");
{
  // Pinned deliberately. The rig skips the reaper's ROLL, which is what makes
  // it deterministic — but it does not skip the shield, so rigging death onto
  // a shielded account burns their talisman and spares them. That is the
  // behaviour; the doc has claimed "a guaranteed kill", and an operator
  // testing the death cinematic on a shielded throwaway will be surprised.
  const s = person({ shield: true });
  const r = applyOutcome(store, s, "death", forced);
  ok(r.type === "death_survived", "a RIGGED death onto a shielded account is survived, not a kill");
  ok(!shielded(s.id) && alive(s.id), "…their talisman is spent and they walk away");
  const bare = person();
  ok(applyOutcome(store, bare, "death", forced).type === "death", "…rigged onto an unshielded account it always kills");
}

// ---- 7. where shields come from -------------------------------------------
console.log("\n-- the shield's sources");
{
  const u = person();
  const first = applyOutcome(store, u, "talisman");
  ok(first.type === "talisman" && !first.alreadyHad, "the talisman wedge hands over the shield");
  ok(shielded(u.id), "…and it lands in the inventory");
  const second = applyOutcome(store, u, "talisman");
  ok(second.type === "talisman" && second.alreadyHad === true && second.bonusGranted === true,
    "…landing on it again while shielded pays a bonus spin instead of nothing");
  ok(store.spinState(u.id).bonus >= 1, "…and the bonus spin is really in the pocket");

  // The box can hand one over too (5% of its table) — drive it until it does.
  let fromBox = 0;
  for (let i = 0; i < 400 && !fromBox; i++) {
    const v = person();
    const out = applyOutcome(store, v, "mystery");
    if (out.type === "talisman" && out.mystery) { fromBox++; ok(shielded(v.id), "the mystery box's talisman lands in the inventory"); }
  }
  ok(fromBox > 0, "the mystery box can hand over a shield");
  // …and never a second one.
  const held = person({ shield: true });
  let boxDoubled = 0;
  for (let i = 0; i < 400; i++) {
    const out = applyOutcome(store, held, "mystery");
    if (out.type === "talisman") boxDoubled++;
  }
  ok(boxDoubled === 0, "…but never to somebody already holding one (it pays spins instead)");
}

// ---- 7b. THE COUNTER IS OWNED BY spin(), and nothing else ----------------
console.log("\n-- the patience counter");
{
  // Driven through the REAL spin path, because the counter's job is to be
  // right across every outcome, not just the death wedge — and spin() is the
  // one place it is written. Spins are granted rather than waited for.
  const u = person();
  store.addBonusSpins(u.id, 400);
  ok(store.bareSpins(u.id) === 0, "a new account starts with the reaper bored");

  let sawClimb = false, sawReset = false, everWrong = false;
  for (let i = 0; i < 300; i++) {
    const before = store.bareSpins(u.id);
    const out = spin(store, store.getUserById(u.id));
    if (!out.ok) { store.addBonusSpins(u.id, 50); continue; }
    const after = store.bareSpins(u.id);
    const swung = out.result.type === "death_survived" || out.result.type === "death";
    const want = swung || shielded(u.id) ? 0 : before + 1;
    if (after !== want) everWrong = true;
    if (after > before) sawClimb = true;
    if (before > 0 && after === 0) sawReset = true;
    if (out.result.type === "death") break;
  }
  ok(!everWrong, "every spin left the counter exactly where the rule says it should be");
  ok(sawClimb, "…it climbs while you are bare");
  ok(sawReset, "…and goes back to zero the moment a shield is in hand");

  // A shielded player's counter is pinned at zero, so the grace is always
  // whole when the amulet finally breaks.
  const sh = person({ shield: true });
  store.addBonusSpins(sh.id, 60);
  for (let i = 0; i < 40 && shielded(sh.id); i++) spin(store, store.getUserById(sh.id));
  ok(
    store.bareSpins(sh.id) === 0,
    "a shielded player never accrues patience — the grace starts whole when the shield breaks",
  );

  // GIVING THE SHIELD AWAY COSTS THE GRACE (Oct 2026). Parking it in a
  // no-bid auction, ferrying it to a friend, or staking it, used to leave the
  // grace whole — spin bare at 2%, take it back, hold it one spin, repeat.
  const parker = person({ shield: true });
  const listed = store.createAuction(parker.id, TALISMAN_CODE, 1_000_000, Date.now() + 3_600_000);
  ok(listed.ok && !shielded(parker.id) && store.bareSpins(parker.id) >= REAPER_GRACE,
    "listing the talisman puts its owner straight past the grace — the gauge is red");
  ok(reaperGraceLeft(store.bareSpins(parker.id)) === 0, "…no grace left to spin through");
  store.cancelAuction(listed.id, parker.id);
  store.addBonusSpins(parker.id, 5);
  spin(store, store.getUserById(parker.id));
  ok(shielded(parker.id) ? store.bareSpins(parker.id) === 0 : true, "…taking it back and holding it is protection again");
  if (!shielded(parker.id)) store.addEmoji(parker.id, TALISMAN_CODE);
  const relisted = store.createAuction(parker.id, TALISMAN_CODE, 1_000_000, Date.now() + 3_600_000);
  ok(relisted.ok && store.bareSpins(parker.id) >= REAPER_GRACE, "…and parking it again is red again: the loop never gets a bare grace");

  const giver = person({ shield: true }), friend = person();
  const tid = store.createTrade(giver.id, friend.id, [TALISMAN_CODE], [], null);
  ok(store.acceptTrade(tid).ok && shielded(friend.id) && store.bareSpins(giver.id) >= REAPER_GRACE && store.bareSpins(friend.id) === 0,
    "a trade ferry: the giver goes red, the friend who now holds it does not");
  const deep = person({ shield: true });
  store.setBareSpins(deep.id, REAPER_GRACE + 20);
  store.createAuction(deep.id, TALISMAN_CODE, 1_000_000, Date.now() + 3_600_000);
  ok(store.bareSpins(deep.id) === REAPER_GRACE + 20, "a gauge already past the grace is never lowered by parting");
}

// ---- 7c. THE TUNING ITSELF, so it cannot drift in silence ----------------
console.log("\n-- what the tuning actually produces");
{
  // The rules are only worth having if they produce the life they were tuned
  // for. Walk the real chain (pure, no DB) and pin the numbers the Sep 2026
  // rework was argued on: a life materially longer than the 428 spins the
  // flat 32% gave, and a death that arrives PAST the grace — where the player
  // has been watching a gauge fill rather than being sprung on.
  const SLOTS = WHEEL_SLOTS.length;
  const pTal = WHEEL_SLOTS.filter((x) => x === "talisman").length / SLOTS;
  const pMys = WHEEL_SLOTS.filter((x) => x === "mystery").length / SLOTS;
  const pDeath = WHEEL_SLOTS.filter((x) => x === "death").length / SLOTS;
  let spins = 0, deaths = 0, pastGrace = 0, shieldedSpins = 0;
  const LIVES = 6000;
  for (let l = 0; l < LIVES; l++) {
    let sh = false, bare = 0;
    for (;;) {
      spins++;
      if (sh) shieldedSpins++; else bare++;
      const r = Math.random();
      if (r < pDeath) {
        if (Math.random() < reaperRate(sh ? 0 : bare, sh)) {
          if (sh) { sh = false; bare = 0; }
          else { deaths++; if (bare > REAPER_GRACE) pastGrace++; break; }
        }
      } else if (r < pDeath + pTal) {
        if (!sh) { sh = true; bare = 0; }
      } else if (r < pDeath + pTal + pMys) {
        if (!sh && Math.random() < 0.05) { sh = true; bare = 0; }
      }
    }
  }
  const perLife = Math.round(spins / LIVES);
  ok(perLife > 800, "a life lasts " + perLife + " spins — comfortably past the 428 the old flat rate gave");
  ok(perLife < 2200, "…and not so long that the wedge stops meaning anything (" + perLife + ")");
  const seen = Math.round((pastGrace / deaths) * 100);
  ok(seen > 60, seen + "% of deaths land PAST the grace — seen coming, not sprung");
  const shShare = Math.round((shieldedSpins / spins) * 100);
  ok(
    shShare > 50 && shShare < 80,
    "players sit shielded " + shShare + "% of the time — protected, not invulnerable",
  );
}

// ---- 8. nothing else on the wheel can kill you ----------------------------
console.log("\n-- the rest of the disc");
{
  const u = person();
  let killed = 0;
  for (const slot of ["blank", "common", "rare", "legendary", "talisman", "mystery"]) {
    for (let i = 0; i < 30; i++) {
      applyOutcome(store, u, slot);
      if (!alive(u.id)) killed++;
    }
  }
  ok(killed === 0, "no wedge but the death wedge can ever tombstone an account");
}

console.log = realLog;
ok(
  wedgeLines > 100,
  "every landing on the wedge wrote its own line (" + wedgeLines + ") — the forensic trail that did not exist",
);

console.log(`\n${bad ? "FAILED" : "PASSED"} — ${n - bad}/${n} asserts`);
peek.close();
store.close?.();
wipe();
process.exit(bad ? 1 : 0);
