// STAR DUST — the canister under Sterling's counter (Josh, Aug 2026).
//
// "A compressed gas the player huffs." The other thing down there. Where SLORP
// is a ten-minute sentence, Star Dust is a dial you press yourself: each hit
// makes the world more neon and your voice — TO EVERYONE ELSE — more helium,
// and each hit resets the sobering clock (five minutes — see STARDUST_MS).
// Three consecutive hits is the line:
// the meter pins red, your vision starts to shake, and thirty seconds later you
// detonate over the carpet (the gun's death — ten seconds down, a walk back in,
// nothing the account or the Wake ever hears about).
//
// The brief, verbatim where it matters:
//  - "acts for 10 minutes … every hit resets the 10 minute counter"
//  - "up to three consecutive hits of the gas before exploding"
//  - "every hit the player voice becomes more and more high pitched and the
//     colors become more vibrant and neon"
//  - "on the third hit their vision starts to shake for 30 seconds more and
//     more violently before they explode"
//  - "a status bar at the bottom left like the sober status bar that says
//     'gassed' … max out and go red and start flashing"
//  - "if the gassed status bar is over half … a small green smoke stream coming
//     out of the player models butt" — heavier at max, a dissipating cloud at
//     the pop.
//
// WHY PURE FUNCTIONS, NO IMPORTS: the whole feature is a clock plus a hit
// counter, exactly like slorp.ts — every downstream effect (shader uniforms,
// the per-speaker voice ratio, the smoke rate, the doom shake) reads off these
// so the entire timeline can be asserted in scripts/checks/test_stardust.mjs
// without a GPU, a browser or a wall clock.

/** How long one window of the gas lasts. Every hit RESETS this — "consecutive"
 *  means inside the window, so the only way to enjoy three hits and live is to
 *  let the whole window drain between them. CUT 10 → 5 MINUTES (Josh, Aug
 *  2026): the bar sobers in five, so a careful can is three short evenings
 *  rather than an evening-long parole. */
export const STARDUST_MS = 300_000;

/** The line. The hit that reaches this count starts the doom clock. */
export const MAX_HITS = 3;

/** The third hit buys you this long of escalating shake, and then the pop. */
export const DOOM_MS = 30_000;

/** One canister holds exactly MAX_HITS huffs — a full canister emptied eagerly
 *  IS the death sentence, which is the joke as sold. */
export const CANISTER_HUFFS = 3;

/** How the pop throws the body. Slorp's numbers, deliberately: both are a body
 *  bursting where it stands, and slorp's were MEASURED in the hall (peak 3.99m
 *  under the 5m ceiling, no bone below the carpet). Don't retune one without
 *  the other. */
export const STARDUST_THROW_POWER = 6.8;
export const STARDUST_THROW_REACH = 2.6;

/** THE BAR'S INTERACTION (Josh, Aug 2026 — "do them all"): never mix drink
 *  with compressed gas. Past this drunk level (drink.ts's "hammered" label
 *  boundary, mirrored not imported — this module imports NOTHING) a huff
 *  counts DOUBLE, so a hammered body can reach the line on its second press
 *  of the valve. The toast is the only warning. */
export const HUFF_DOUBLE_AT = 75;

/** How many hits one huff of the valve is worth, given how drunk the huffer
 *  is. Sober-to-drunk: one. Hammered: two — "the drink thins it out". */
export function huffHits(drunkLevel: number): number {
  return drunkLevel > HUFF_DOUBLE_AT ? 2 : 1;
}

/** The smoke stage for a body on `hits` hits: 0 none · 1 the small stream ·
 *  2 the full leak. Sober bodies leak from two hits ("over half"); a DRUNK
 *  body leaks a whole stage early — smoke at one hit, the full leak at two —
 *  because drink loosens everything. Both inputs ride the wire (`sd` and
 *  `d`), so every observer draws the same trousers. */
export function gasSmoke(hits: number, boozy: boolean): 0 | 1 | 2 {
  const h = Math.max(0, Math.min(MAX_HITS, Math.round(hits)));
  const s = boozy ? h : h - 1;
  return (s < 0 ? 0 : s > 2 ? 2 : s) as 0 | 1 | 2;
}

export interface GasPhase {
  /** Effective hits, after the window check (0 = sober again). */
  hits: number;
  /** The HUD meter, 0..1 — (hits / 3) draining linearly across the window, so
   *  the bar always tells you how long until you're safe to press it again. */
  bar: number;
  /** 0..1 how neon the world is. A per-hit step, eased — the brief's "more
   *  vibrant and neon" is a function of how many hits you've taken, not of
   *  time, so it holds steady until the window expires. */
  glow: number;
  /** Peer smoke: 0 none · 1 the small stream ("over half") · 2 the full leak.
   *  Keyed off HITS rather than the bar so the wire stage (sd = hits) is all a
   *  peer needs to draw the right body. */
  smoke: 0 | 1 | 2;
  /** True once the window has fully drained: sober, counter back to zero. */
  expired: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number): number => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/** The whole programme for hits 1..2 (three is the doom clock's business —
 *  see gasDoom). `sinceHitMs` is time since the LAST hit, because every hit
 *  resets the counter. `boozy` moves the smoke a stage early (see gasSmoke);
 *  the two-arg call is every original caller, unchanged. */
export function gasPhase(hits: number, sinceHitMs: number, boozy = false): GasPhase {
  const h = Math.max(0, Math.min(MAX_HITS, Math.round(hits)));
  const expired = h <= 0 || sinceHitMs >= STARDUST_MS;
  if (expired) return { hits: 0, bar: 0, glow: 0, smoke: 0, expired: true };
  const t = clamp01(sinceHitMs / STARDUST_MS);
  return {
    hits: h,
    bar: (h / MAX_HITS) * (1 - t),
    glow: ease(h / MAX_HITS),
    smoke: gasSmoke(h, boozy),
    expired: false,
  };
}

/**
 * The last thirty seconds. `shake` climbs 0 → 1 "more and more violently" —
 * quadratic, so the first ten seconds are a tremble you might explain away and
 * the last five are unmistakable. `done` is the frame you pop.
 */
export function gasDoom(sinceDoomMs: number): { shake: number; done: boolean } {
  const t = clamp01(sinceDoomMs / DOOM_MS);
  return { shake: t * t, done: sinceDoomMs >= DOOM_MS };
}

/**
 * What the ROOM hears when this body speaks, as a pitch ratio applied on each
 * LISTENER's side (voicechat's per-peer shifter): the helium climbs a step per
 * hit. 1.66 at the top — comfortably inside the worklet's 2.0 rail, and high
 * enough that nobody mistakes it for a good microphone.
 */
export function gasPitch(hits: number): number {
  const h = Math.max(0, Math.min(MAX_HITS, Math.round(hits)));
  return 1 + 0.22 * h;
}
