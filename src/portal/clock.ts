// THE PORTAL — the Eshai clock. One tick is one beat of the hydrogen line
// (1,420,405,751.768 Hz, ~0.704 ns); they count in base 8. A timestamp is a
// count from their epoch, drawn in octal, ~28 digits. The archive's digest
// stamps fix the epoch: digest 13741 (turn t0) sits at 0o20413772465 turns.
// The hall has kept counting ever since, so a post made today is stamped
// about fifty-four million years after the last plea — which is what a
// reader works out by subtracting.

export const HYDROGEN_HZ = 1_420_405_751.768;
export const TURN_TICKS = 8n ** 17n;
/** The turn count of digest 13741 (t0), from its printed stamp. */
export const T0_TURNS = 0o20413772465n;
/** The last plea, t80.19. */
export const LAST_PLEA_T = 80.19;
/** Years between the last plea and the hall's "now" anchor. PORTAL.md dial. */
export const GAP_YEARS = 54_000_000;
/** Wall-clock moment the anchor names (the first portal opened, Sep 2026). */
export const ANCHOR_MS = Date.UTC(2026, 8, 17);

const YEAR_S = 365.25 * 86400;
const fracTicks = (turns: number) => BigInt(Math.round(turns * Number(TURN_TICKS)));

/** Ticks since the epoch at archive time t (turns from t0, fractional). */
export function archiveTicks(t: number): bigint {
  const whole = Math.floor(t);
  return (T0_TURNS + BigInt(whole)) * TURN_TICKS + fracTicks(t - whole);
}

const GAP_TICKS = BigInt(Math.round(GAP_YEARS * YEAR_S * HYDROGEN_HZ / 1e6)) * 1_000_000n;
const ANCHOR_TICKS = archiveTicks(LAST_PLEA_T) + GAP_TICKS;

/** Ticks since the epoch at a wall-clock moment, today. */
export function nowTicks(ms: number = Date.now()): bigint {
  const dms = BigInt(Math.round(ms - ANCHOR_MS));
  return ANCHOR_TICKS + (dms * BigInt(Math.round(HYDROGEN_HZ))) / 1000n;
}

/** A stamp as the hall draws it: octal, grouped in threes from the right. */
export function stamp(ticks: bigint): string {
  const o = ticks.toString(8);
  const head = o.length % 3 || 3;
  const groups = [o.slice(0, head)];
  for (let i = head; i < o.length; i += 3) groups.push(o.slice(i, i + 3));
  return groups.join(" ");
}
