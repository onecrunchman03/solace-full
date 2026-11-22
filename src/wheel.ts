import { randomBytes, randomInt } from "node:crypto";
import type { Store } from "./db/store";
import type { User, Emoji } from "./types";
import { award } from "./achievements";

/** The linked item+emoji that shields you from a Death spin (consumed on use). */
export const TALISMAN_CODE = "talisman";

export type SlotType = "blank" | "common" | "rare" | "legendary" | "talisman" | "death" | "mystery";

/**
 * The 32 wheel slots in display order: 12 blank, 12 common, 4 rare,
 * 1 legendary, 1 talisman, 1 death (bottom), 1 mystery (top). The death
 * wedge lands 1/32 (3.125%); what it DOES on a landing is THE REAPER'S
 * PATIENCE (see reaperRate) — half the time against a talisman, and against
 * a bare player almost nothing until the grace runs out. A misfire is the
 * "reaper blinks" near-miss blank. The order here MUST match WheelView's
 * SLOTS and the generated wheel-disc.svg — all three come from the same
 * generator layout.
 */
export const WHEEL_SLOTS: SlotType[] = [
  "mystery", "common", "blank", "common", "rare", "blank", "common", "blank",
  "legendary", "common", "blank", "common", "rare", "blank", "common", "blank",
  "death", "common", "blank", "common", "rare", "blank", "common", "blank",
  "talisman", "common", "blank", "common", "rare", "blank", "common", "blank",
];

export type SpinResult =
  | { type: "blank"; ownsEverything?: boolean; bonusGranted?: boolean; reaperMissed?: boolean }
  | { type: "emoji"; tier: string; emoji: Emoji; downgraded?: boolean; nearMiss?: boolean; mystery?: boolean }
  | { type: "talisman"; alreadyHad?: boolean; bonusGranted?: boolean; mystery?: boolean }
  | { type: "mystery_spins"; spins: number }
  | { type: "death_survived"; immune?: boolean }
  | { type: "death" };

/**
 * The mystery slot's prize table (weights per 100). Non-coin prizes ONLY —
 * silver is minted exclusively at the Trader, so the mystery box pays in
 * spins and surprise emoji instead.
 */
export const MYSTERY_TABLE: { weight: number; prize: "spins2" | "spins5" | "rare" | "legendary" | "talisman" }[] = [
  { weight: 40, prize: "spins2" },
  { weight: 30, prize: "rare" },
  { weight: 15, prize: "spins5" },
  { weight: 10, prize: "legendary" },
  { weight: 5, prize: "talisman" },
];

/**
 * The legendary slot only pays a legendary half the time — the other half it
 * spits out a rare (`nearMiss`, so the client can rub it in). Decision locked
 * with the user: without this, the small legendary catalog (72) against a
 * 1/26 slot completed ~2.3× faster than the rare tier, inverting the rarity
 * ladder for active players. Effective legendary odds: 1/52 per spin.
 */
export const LEGENDARY_HIT_RATE = 0.5;

/**
 * THE REAPER'S PATIENCE (Josh, Sep 2026) — the death wedge's trigger chance,
 * which is no longer one number.
 *
 * WHAT WAS WRONG. The old rule was a flat 32% per landing, which made death a
 * memoryless 1%-a-spin hazard, and a memoryless hazard cannot be both
 * dramatic and survivable. Measured on the shipped wheel: a shield arrived on
 * 3.28% of spins against a 1.00% death, so players sat SHIELDED 77% of the
 * time (prod read eleven of fourteen) and never felt at risk — while over a
 * long run the same flat hazard gave a life of 428 spins. Tense in neither
 * direction and ruinous over months. Every dial made it worse in the other
 * direction: rarer deaths meant MORE time shielded, a scarcer talisman meant
 * SHORTER lives. And against an endgame that needs the whole catalogue held
 * at once (~3,840 spins of legendaries), a simulated Tier-4 run under the old
 * rules took a median 171,000 spins and 349 deaths, with half of all runs
 * never finishing at all. Pandora's Box was unreachable by arithmetic.
 *
 * WHAT IT IS NOW. The reaper always swings; what changes is what it hits.
 *
 *   HOLDING A TALISMAN — it fires on REAPER_SHIELD_RATE of landings and the
 *   amulet takes the hit. A shield is a thing you SPEND on a cadence (about
 *   twelve of them per death), not a state you drift into and forget, which
 *   is what makes the dangerous window open often enough to be a mechanic.
 *
 *   BARE — it is almost bored at first (REAPER_BASE) and stays that way for
 *   REAPER_GRACE spins, then gets hungry fast (REAPER_RAMP per spin, capped
 *   at REAPER_CAP). A typical bare window ends in ~30 spins when the next
 *   shield turns up, comfortably inside the grace; it is the window that
 *   DOESN'T that kills you, and by then the player has watched the gauge
 *   fill and had every chance to act — hunt the wedge, or buy the shield at
 *   Sterling's counter, which this finally gives a reason to exist.
 *
 * The counter is `users.bareSpins` (migration 98), reset the moment a shield
 * is in hand or the wedge has just swung. Simulated over 40,000 lives:
 * 1,120 spins per life (2.6× the old 428), 68% of spins shielded, and 80% of
 * deaths arriving past the grace with the rate at ~67% — i.e. seen coming.
 * The same Tier-4 run now finishes in every single trial.
 *
 * Rigged death spins bypass the roll entirely — the admin tool stays
 * deterministic — but NOT the talisman, which still takes the hit.
 */
export const REAPER_SHIELD_RATE = 0.5;
export const REAPER_BASE = 0.02;
export const REAPER_GRACE = 55;
export const REAPER_RAMP = 0.08;
export const REAPER_CAP = 0.95;

/** How likely the wedge is to fire on THIS landing. `bare` is how many spins
 *  the player has taken since they last held a talisman; it is ignored while
 *  they are shielded, because the amulet is what the reaper is swinging at. */
/** Has Pandora's box retired the reaper? (A world flag, once-ever.) */
export function reaperRetired(store: Store): boolean {
  return store.pandoraFlag("retire-reaper") != null;
}

export function reaperRate(bare: number, shielded: boolean): number {
  if (shielded) return REAPER_SHIELD_RATE;
  const past = Math.max(0, Math.floor(bare) - REAPER_GRACE);
  return Math.min(REAPER_CAP, REAPER_BASE + REAPER_RAMP * past);
}

/** Spins of grace left before the rate starts climbing — what the gauge shows. */
export const reaperGraceLeft = (bare: number): number =>
  Math.max(0, REAPER_GRACE - Math.max(0, Math.floor(bare)));

// When a tier is exhausted for a player, cascade to lower tiers so they still
// win *something they don't own* rather than nothing.
const LOWER: Record<string, string[]> = {
  legendary: ["rare", "common"],
  rare: ["common"],
  common: [],
};

/** Crypto-backed float in [0,1) — permadeath and rarity rolls must not ride
 *  V8's predictable Math.random (48 bits of resolution is ample).
 *  Built from raw bytes: crypto.randomInt's range caps at 2**48 - 1, so
 *  randomInt(2 ** 48) THROWS ERR_OUT_OF_RANGE — that one-off shipped once
 *  and 500'd every legendary/mystery/death roll until caught in prod. */
function cryptoRand(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

function pickUnowned(store: Store, userId: number, tier: string): Emoji | null {
  const pool = store.unownedInTier(userId, tier);
  return pool.length ? pool[randomInt(pool.length)] : null;
}

/**
 * Apply a slot's outcome for a user. Assumes a spin has already been consumed
 * and that this runs inside a transaction. Exported so tests can drive specific
 * outcomes deterministically.
 */
export function applyOutcome(
  store: Store,
  user: User,
  slot: SlotType,
  /** `bare` is how many spins this player has taken since they last held a
   *  talisman — the reaper's patience. `spin()` reads it, passes it, and
   *  settles it afterwards, so the counter has exactly one owner. */
  opts?: { forced?: boolean; bare?: number },
): SpinResult {
  if (slot === "blank") return { type: "blank" };

  if (slot === "common" || slot === "rare" || slot === "legendary") {
    // The legendary slot's 50% roll happens BEFORE the award, so landing on
    // it is only half a legendary. A near-miss pays from the rare pool.
    let tier: "common" | "rare" | "legendary" = slot;
    let nearMiss = false;
    // A rigged legendary skips the 50% roll — the admin tool exists to TEST
    // the big-win moment, and a coin flip would make the test flaky (the same
    // determinism rule the rigged death has always had).
    if (slot === "legendary" && !opts?.forced && cryptoRand() >= LEGENDARY_HIT_RATE) {
      tier = "rare";
      nearMiss = true;
    }
    let emoji = pickUnowned(store, user.id, tier);
    let downgraded = false;
    if (!emoji) {
      for (const lower of LOWER[tier]) {
        emoji = pickUnowned(store, user.id, lower);
        if (emoji) {
          downgraded = true;
          break;
        }
      }
    }
    if (emoji) {
      store.addEmoji(user.id, emoji.code);
      return { type: "emoji", tier: emoji.tier, emoji, downgraded, nearMiss };
    }
    // The player owns everything winnable — give a bonus spin instead of nothing.
    store.addBonusSpins(user.id, 1);
    return { type: "blank", ownsEverything: true, bonusGranted: true };
  }

  if (slot === "talisman") {
    if (store.ownsEmoji(user.id, TALISMAN_CODE)) {
      store.addBonusSpins(user.id, 1); // already shielded — don't waste it
      return { type: "talisman", alreadyHad: true, bonusGranted: true };
    }
    store.addEmoji(user.id, TALISMAN_CODE);
    return { type: "talisman" };
  }

  if (slot === "mystery") {
    // Roll the box. Emoji prizes respect the never-duplicate rule (cascade
    // down; an exhausted pool falls back to bonus spins so the box is never
    // empty). Talisman → spins if already shielded.
    let r = cryptoRand() * 100;
    let prize: (typeof MYSTERY_TABLE)[number]["prize"] = "spins2";
    for (const row of MYSTERY_TABLE) {
      if ((r -= row.weight) < 0) {
        prize = row.prize;
        break;
      }
    }
    if (prize === "rare" || prize === "legendary") {
      let emoji = pickUnowned(store, user.id, prize);
      let downgraded = false;
      if (!emoji) {
        for (const lower of LOWER[prize]) {
          emoji = pickUnowned(store, user.id, lower);
          if (emoji) {
            downgraded = true;
            break;
          }
        }
      }
      if (emoji) {
        store.addEmoji(user.id, emoji.code);
        return { type: "emoji", tier: emoji.tier, emoji, downgraded, mystery: true };
      }
      prize = "spins2"; // owns everything winnable — fall through to spins
    }
    if (prize === "talisman" && !store.ownsEmoji(user.id, TALISMAN_CODE)) {
      store.addEmoji(user.id, TALISMAN_CODE);
      return { type: "talisman", mystery: true };
    }
    const spins = prize === "spins5" ? 5 : 2;
    store.addBonusSpins(user.id, spins);
    return { type: "mystery_spins", spins };
  }

  // death
  //
  // EVERY LANDING ON THIS WEDGE IS LOGGED. Josh, Sep 2026: "I had a user roll
  // death without a talisman and basically solace spared him because it
  // thought he had a talisman" — and nothing in the database could answer it.
  // `talisman_saves` and `reaper_blinks` are undated counters, the live feed
  // is an in-memory ring, and a consumed shield leaves no row behind, so the
  // one question worth asking after a disputed death ("was that account
  // shielded when it landed?") had no evidence either way. One line per
  // landing, the shape the account-lockout log already uses, greppable in the
  // journal and visible in the admin console's log ring.
  const wedgeLog = (what: string): void =>
    console.log(
      `[wheel] death wedge: "${user.username}" (#${user.id}) — ${what}` +
        `${opts?.forced ? " [rigged]" : ""}`,
    );
  if (user.isAdmin) {
    // "The house can't die": admins are immune to the death slot (rigged or
    // random), so the operator account can never be locked out by the wheel.
    // Checked before the talisman so an admin never wastes a shield on it.
    wedgeLog("IMMUNE (the house can't die) — no shield spent");
    return { type: "death_survived", immune: true };
  }
  // THE REAPER, RETIRED (PANDORA.md, "Retire the Reaper"): once somebody
  // takes that world choice from the box, the reaper blinks every time — a
  // rigged spin included. The wedge stays on the wheel as a memorial; no
  // shield is spent and nobody is tombstoned by the wheel again.
  if (reaperRetired(store)) {
    store.bumpStat(user.id, "reaper_blinks");
    wedgeLog("the reaper is RETIRED — it blinked");
    return { type: "blank", reaperMissed: true };
  }
  // THE SWING. The rate depends on what the reaper is swinging at: half of
  // all landings against a talisman, and against a BARE player whatever its
  // patience has become (see reaperRate). The shield is read BEFORE the roll
  // — the whole point is that an amulet changes the odds, not just the
  // consequence — and a blink still never consumes one. Rigged spins skip the
  // roll but not the shield: the admin tool is deterministic, not omnipotent.
  const shielded = store.ownsEmoji(user.id, TALISMAN_CODE);
  const bare = Math.max(0, opts?.bare ?? 0);
  const rate = reaperRate(bare, shielded);
  if (!opts?.forced && cryptoRand() >= rate) {
    store.bumpStat(user.id, "reaper_blinks"); // the Necrology counts close calls
    wedgeLog(
      `the reaper BLINKED at ${(rate * 100).toFixed(0)}% — ` +
        (shielded ? "shield held, unspent" : `bare ${bare} spins`),
    );
    return { type: "blank", reaperMissed: true };
  }
  if (shielded) {
    store.removeEmoji(user.id, TALISMAN_CODE); // shield consumed, both item and emoji
    store.bumpStat(user.id, "talisman_saves"); // Necrology telemetry
    award(user.id, "cheated-death"); // the badge only a talisman can earn
    wedgeLog("FIRED — talisman consumed, survived");
    return { type: "death_survived" };
  }
  wedgeLog(`FIRED at ${(rate * 100).toFixed(0)}% — bare ${bare} spins, account tombstoned`);
  store.killUser(user.id, "wheel");
  return { type: "death" };
}

/** One wedge's advertised prize: the emoji art that wedge is showing. */
export interface WheelFaceSlot {
  code: string;
  name: string;
  file: string;
}

/**
 * THE FACE — what the 32 wedges are showing, decided BY THE SERVER.
 *
 * This is not decoration. The wheel promises a prize on the wedge it stops at,
 * so the wedge the spin lands on carries THE EMOJI THAT SPIN ACTUALLY AWARDED
 * — by construction, in `buildFace` below. The client's earlier per-viewer
 * face was the bug Josh caught: it rolled its own random unowned emoji per
 * wedge, so the disc rested on a rabbit and the reveal handed over something
 * else of the same tier, and no two players saw the same wheel.
 *
 * The other wedges are honest too: each shows a random emoji of its own tier
 * that the spinner does NOT own — a prize they could really have won.
 */
export type WheelFace = (WheelFaceSlot | null)[];

/** Fresh candidates for every tier wedge, and the LANDED wedge pinned to what
 *  was actually awarded. `result` is optional: `GET /api/wheel` builds a face
 *  with no spin behind it so the wheel advertises real prizes at rest. */
export function buildFace(
  store: Store,
  user: User,
  slotIndex?: number,
  result?: SpinResult,
): WheelFace {
  const pools: Record<string, Emoji[]> = {};
  const draw = (tier: string): Emoji | null => {
    let pool = pools[tier];
    if (!pool) {
      // Own the whole tier and the wheel still has to show something from it:
      // fall back to the full tier (the real award cascades a tier down there).
      const unowned = store.unownedInTier(user.id, tier);
      pool = pools[tier] = (unowned.length ? unowned : store.emojiInTier(tier)).slice();
    }
    if (!pool.length) return null;
    // sample WITHOUT replacement so twelve common wedges aren't the same face
    const k = randomInt(pool.length);
    return pool.splice(k, 1)[0];
  };
  const talisman = store.getEmoji(TALISMAN_CODE);
  const face: WheelFace = WHEEL_SLOTS.map((kind) => {
    if (kind === "talisman") {
      return talisman ? { code: talisman.code, name: talisman.name, file: talisman.file } : null;
    }
    if (kind !== "common" && kind !== "rare" && kind !== "legendary") return null;
    const e = draw(kind);
    return e ? { code: e.code, name: e.name, file: e.file } : null;
  });
  // THE PROMISE: the wedge under the pointer shows the prize that was paid.
  if (slotIndex !== undefined && result?.type === "emoji" && result.emoji) {
    face[slotIndex] = { code: result.emoji.code, name: result.emoji.name, file: result.emoji.file };
  }
  // …and a talisman out of the mystery box is a prize paid on that wedge too.
  // Only emoji were pinned, so the box paid a talisman with a "?" under the
  // pointer (Oct 2026 review — test_wheel_face caught it once in 220 spins).
  if (slotIndex !== undefined && result?.type === "talisman" && result.mystery && talisman) {
    face[slotIndex] = { code: talisman.code, name: talisman.name, file: talisman.file };
  }
  return face;
}

export interface SpinOutcome {
  ok: boolean;
  error?: string;
  result?: SpinResult;
  spinsLeft?: number;
  /** Which of the 32 physical slots the wheel landed on (drives the visual). */
  slotIndex?: number;
  /** What every wedge was showing for THIS spin — the landed one carries the
   *  award. Broadcast, so every watcher sees the same wheel. */
  face?: WheelFace;
}

/** Perform one full spin: check spins, consume one, roll, and resolve — atomically. */
export function spin(store: Store, user: User): SpinOutcome {
  store.refreshSpins(user.id);
  if (store.spinState(user.id).total <= 0) return { ok: false, error: "no_spins" };
  return store.transaction(() => {
    store.consumeSpin(user.id);
    store.bumpStat(user.id, "spins"); // Ledger leaderboard telemetry
    // An admin may have rigged this user's next spin to a specific slot (one-shot).
    const rigged = store.takeRiggedSpin(user.id);
    const riggedIdx = rigged ? WHEEL_SLOTS.indexOf(rigged as SlotType) : -1;
    const slotIndex = riggedIdx >= 0 ? riggedIdx : randomInt(WHEEL_SLOTS.length);
    const bare = store.bareSpins(user.id);
    const result = applyOutcome(store, user, WHEEL_SLOTS[slotIndex], { forced: riggedIdx >= 0, bare });
    // THE PATIENCE, SETTLED IN ONE PLACE. The counter resets the moment a
    // shield is in hand or the wedge has just swung (whether the amulet ate
    // it or the account did) — a fresh grace either way; otherwise this spin
    // is one more the reaper has waited through. Doing it here rather than at
    // ten return points inside applyOutcome is what keeps it impossible for a
    // new outcome to forget to touch it.
    const swung = result.type === "death_survived" || result.type === "death";
    store.setBareSpins(
      user.id,
      swung || store.ownsEmoji(user.id, TALISMAN_CODE) ? 0 : bare + 1,
    );
    // The goblins' file: a run of blanks is a losing streak they write about.
    store.streakStat(user.id, "wheel_blanks", result.type === "blank");
    // The face is built AFTER the award so the landed wedge can carry it, and
    // from the inventory as it stood BEFORE this spin is irrelevant — the
    // awarded emoji is pinned explicitly either way.
    const face = buildFace(store, user, slotIndex, result);
    return { ok: true, result, spinsLeft: store.spinState(user.id).total, slotIndex, face };
  });
}
