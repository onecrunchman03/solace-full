// THE FLOOR — the stage Wheel's spin curve, and the clack schedule DERIVED from
// it. Deliberately a module of its own, importing nothing: the sound doctrine
// (CLAUDE.md, Phase 33) says a sound that narrates an animation must be
// scheduled from that animation's own curve, so the curve has to live in exactly
// one place or the two silently drift apart. world.ts turns the disc with it;
// the audio schedules flapper clacks with it; the harness tests it in Node.

/**
 * The wheel's slot order — a MIRROR of src/wheel.ts WHEEL_SLOTS.
 *
 * CLAUDE.md already warns the order lives in three places that must match
 * (src/wheel.ts, WheelView's SLOTS, the generated wheel-disc.svg); the stage
 * wheel's painted face makes a fourth. It lives here, in the one casino module
 * with no imports, precisely so `test_casino_layout.mjs` can diff it against the
 * server's list on every run instead of trusting anyone to remember.
 */
export const WHEEL_SLOTS_3D = [
  "mystery", "common", "blank", "common", "rare", "blank", "common", "blank",
  "legendary", "common", "blank", "common", "rare", "blank", "common", "blank",
  "death", "common", "blank", "common", "rare", "blank", "common", "blank",
  "talisman", "common", "blank", "common", "rare", "blank", "common", "blank",
] as const;

/** Slots on the real wheel — src/wheel.ts WHEEL_SLOTS.length. */
export const SLOTS = WHEEL_SLOTS_3D.length;
/** Seconds a spin takes, end to end. */
export const SPIN_DUR = 5.2;
/** Full revolutions before the wheel starts hunting for its slot. */
export const SPIN_TURNS = 5;

/** Eased progress 0..1. The long tail is the point: a real wheel spends its
 *  last second crawling, and that crawl is what makes the landing read. */
export const spinEase = (u: number): number => 1 - Math.pow(1 - u, 3.4);

/** Inverse of `spinEase` — given progress, when does it happen? Used to place
 *  each clack at the instant the flapper actually crosses a wedge. */
export const spinEaseInv = (e: number): number => 1 - Math.pow(1 - e, 1 / 3.4);

/** Nominal radians swept to land slot `slotIndex` from rest-at-zero. NOTE:
 *  the REAL sweep depends on where the disc already rests — use
 *  `sweepFrom(currentRotation, slotIndex)`. Feeding this fixed value to every
 *  spin was the "lands on the wrong wedge" bug: sweeps accumulated, so only
 *  the session's first spin landed true and each later one drifted by the sum
 *  of every earlier slot index (Josh's miku-shock example rested five wedges
 *  off its prize). */
export const spinSweep = (slotIndex: number): number =>
  Math.PI * 2 * SPIN_TURNS + (slotIndex / SLOTS) * Math.PI * 2;

/** The ABSOLUTE landing rule: the disc turns negative-x, and wedge k sits
 *  under the pointer when rotation ≡ -k·(2π/SLOTS) (mod 2π). From the current
 *  rotation, sweep down at least SPIN_TURNS full turns, then continue to the
 *  first angle congruent to the target wedge. Returns the POSITIVE radians to
 *  subtract. */
export function sweepFrom(current: number, slotIndex: number): number {
  const twoPi = Math.PI * 2;
  const wedge = (slotIndex / SLOTS) * twoPi;
  const base = current - twoPi * SPIN_TURNS;
  let target = -wedge;
  // walk target down below base in whole turns (current may be far negative
  // after a long session)
  target -= twoPi * Math.ceil((target - base) / twoPi);
  return current - target;
}

export interface Clack {
  /** seconds from the start of the spin */
  t: number;
  /** 0..1 playback gain — a fast wheel hits hard, a dying one ticks */
  gain: number;
}

/**
 * When the flapper crosses each wedge boundary, and how hard.
 *
 * `minGap` drops clacks that would land closer together than the ear can
 * separate — during the opening turns a real wheel's flapper blurs into a buzz
 * rather than a countable series, and scheduling ~190 audio nodes for one spin
 * is wasteful besides.
 */
export function clackSchedule(sweep: number, minGap = 0.035): Clack[] {
  const perWedge = (Math.PI * 2) / SLOTS;
  const count = Math.floor(sweep / perWedge);
  const out: Clack[] = [];
  let last = -Infinity;
  for (let k = 1; k <= count; k++) {
    const e = (k * perWedge) / sweep;
    const t = SPIN_DUR * spinEaseInv(e);
    if (t - last < minGap) continue;
    last = t;
    // Loud and hard while it's flying, a bare tick as it dies.
    out.push({ t, gain: 0.14 + 0.34 * (1 - e) });
  }
  return out;
}
