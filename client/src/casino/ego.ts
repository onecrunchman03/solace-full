// EGO — Sterling's confidence serum (Josh, Aug 2026). A goopy liquid taken in
// a shot glass. It works. Unfortunately it works on your HEAD, which swells
// per shot while the body stays normal — the room watches a caricature bob
// between the tables, and from the inside the world bulges (a fisheye that
// tracks the swelling, Josh's call: "something that gradually returns to
// normal as you sober").
//
// THE MODEL, one number: `swell` — a continuous meter, +1.0 per shot, draining
// at one dose per EGO_DOSE_MS. Head scale, the lens, the voice and the wire
// all read off it, so sobering is smooth by construction: the head deflates
// and the lens flattens together, frame by frame, instead of stepping down.
// That's deliberately DIFFERENT from Star Dust's hold-then-clear window —
// star dust is a countdown you're waiting out; ego is a balloon with a slow
// leak.
//
// THREE SHOTS IS THE LINE. Swell reaching 3.0 starts the CREAK: EGO_CREAK_MS
// of submarine-hull groaning while the head strains at its seams, and then it
// POPS — confetti, not gore — and the body folds (the gun's cosmetic death,
// like every joke under this counter). Two shots and patience is a big-headed
// evening; a third while still swollen is a decision.
//
// PURE FUNCTIONS, NO IMPORTS — the slorp/stardust rule, so test_ego.mjs can
// assert the whole curve without a GPU or a clock.

/** One dose drains away over this long. Three quick shots pop you; one shot
 *  is a four-minute bit. */
export const EGO_DOSE_MS = 240_000;

/** The line. Swell at or past this starts the creak. */
export const EGO_MAX = 3;

/** How long the head creaks at critical mass before it goes. Long enough for
 *  the room to gather, short enough that nobody saves you. */
export const EGO_CREAK_MS = 8_000;

/** The pop's ragdoll throw. A head-pop is not an explosion under the body —
 *  it folds where it stands, so the throw is soft (the pass-out's family,
 *  not the vial's). */
export const EGO_THROW_POWER = 2.4;
export const EGO_THROW_REACH = 1.2;

/** Wire quantisation: swell rides the relay as quarter-doses 0..12, so a
 *  shrinking head only needs a frame every minute and a newcomer still sees
 *  roughly the right hat size. */
export const EGO_WIRE_MAX = 12;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** THE BAR'S INTERACTION (Josh, Aug 2026): liquor preserves confidence.
 *  While the drinker is visibly drunk the swell drains at HALF speed — the
 *  big-headed man at the bar stays big-headed as long as he keeps drinking.
 *  (More burn for Sterling; the drunk threshold itself lives in drink.ts —
 *  this module imports nothing.) */
export const EGO_BOOZE_DRAIN = 0.5;

/** Advance the meter: swell drains continuously, one dose per EGO_DOSE_MS,
 *  never below zero — at half rate while `boozy` (see EGO_BOOZE_DRAIN; the
 *  two-arg call is every original caller, unchanged). While the creak runs
 *  the caller stops draining — a critical head does not quietly let the air
 *  out. */
export function egoDecay(swell: number, dtMs: number, boozy = false): number {
  return Math.max(0, swell - (dtMs / EGO_DOSE_MS) * (boozy ? EGO_BOOZE_DRAIN : 1));
}

/** …and a shot: +1 dose, capped just past the line so the maths stays tame. */
export function egoShot(swell: number): number {
  return clamp(swell + 1, 0, EGO_MAX + 0.5);
}

/** Head scale for a given swell — +40% per dose, so three shots is a 2.2×
 *  head. Continuous: the deflate is smooth on every observer's screen. */
export function egoHeadScale(swell: number): number {
  return 1 + 0.4 * clamp(swell, 0, EGO_MAX);
}

/** The FISHEYE, 0..1 — how hard the lens bulges from the inside. Tracks the
 *  swell exactly (Josh: it "gradually returns to normal as you sober"), eased
 *  so the first shot is a suggestion and the third is an aquarium. */
export function egoFish(swell: number): number {
  const x = clamp(swell / EGO_MAX, 0, 1);
  return x * x * (3 - 2 * x);
}

/** What the room hears: a shade DEEPER and grander per dose (the opposite
 *  end of the shifter from star dust's helium — a man addressing a stadium).
 *  Composes with gasPitch by multiplication; both ride the same per-peer
 *  worklet. */
export function egoPitch(swell: number): number {
  return 1 - 0.055 * clamp(swell, 0, EGO_MAX);
}

/** Swell → the wire's quarter-dose integer, and back. */
export function egoQuant(swell: number): number {
  return clamp(Math.round(swell * 4), 0, EGO_WIRE_MAX);
}
export function egoFromWire(q: number): number {
  return clamp(q, 0, EGO_WIRE_MAX) / 4;
}

/**
 * The creak: 0..1 strain while the head decides, `done` on the frame it goes.
 * Quadratic like the star dust doom — the first groans are deniable, the last
 * second obviously is not.
 */
export function egoCreak(sinceMs: number): { strain: number; done: boolean } {
  const t = clamp(sinceMs / EGO_CREAK_MS, 0, 1);
  return { strain: t * t, done: sinceMs >= EGO_CREAK_MS };
}
