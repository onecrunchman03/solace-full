// THE CASINO ESCAPE ROOM — the vocabulary and the prices (design: ESCAPE.md).
//
// E1 ships THE THRESHOLD: the pass (stake one rare emoji, BURNED — a durable
// condition revoked only by dying inside), Sterling's ante-room counter, and
// the two storage surfaces. The complex itself, the key, the chests and the
// monster arrive in E2-E4; their constants land here as they ship so the
// harnesses always have one import to pin.
//
// MONEY DOCTRINE, restated where the numbers live: every price here BURNS
// (spendCoins with no credit — the gun/talisman/drink shape). The stake burns
// the emoji itself. Nothing in this file mints; the chest tables (E3) are the
// floor's ONE sanctioned mint and carry their own tripwire.

/** What the door demands: one owned emoji of exactly this tier, destroyed. */
export const PASS_STAKE_TIER = "rare";

/** Sterling's ante-room counter. Item ids double as er_inventory keys. */
export const ER_TOOLS: Record<string, { name: string; price: number; blurb: string }> = {
  flashlight: { name: "Flashlight", price: 100, blurb: "the halls go dark when it matters" },
  walkie: { name: "Walkie Talkie", price: 100, blurb: "reaches the whole complex" },
  almond: { name: "Almond Water", price: 100, blurb: "sobers you up instantly" },
};

/** Carried inventory: five DISTINCT items (stacks share a slot). The key will
 *  cost one of these slots — that's deliberate. */
export const ER_INV_SLOTS = 5;

/** The ante-room locker: what you carry dies with you, what you locker
 *  survives you. Distinct-item cap, generous but bounded. */
export const ER_LOCKER_SLOTS = 25;

/** Items allowed to cross INTO the escape room from outside: bottles from the
 *  bar (Josh: "players can bring alcohol"). The gun is refused by name at the
 *  door — it stays in the CASINO locker. Everything else is ER-native. */
export const ER_IMPORTABLE = new Set(["beer", "wine", "whisky", "champagne"]);
