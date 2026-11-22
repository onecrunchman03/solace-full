// PICKING A LINE WITHOUT SAYING IT TWICE (Sep 2026).
//
// Both house brains — sterling-lines.ts and ada-lines.ts — used to draw with a
// bare Math.random over the venue's pool, which means the single most visible
// staleness symptom was free to happen: the SAME LINE TWICE RUNNING. At the
// counter's 22-second rotation a 20-line pool does that about once every seven
// minutes per venue, and a back-to-back repeat reads as a bug rather than as a
// short pool. Avoiding just the previous pick costs nothing and removes it.
//
// It is deliberately only a memory of ONE. A longer history would start
// rationing the good lines (the pools are weighted on purpose — sterling-lines
// pushes its VIP tier lines RANK times so a Magnate hears them more often, and
// a no-repeat window of 5 would flatten that weighting into a round robin).
//
// The memory is keyed by venue and lives for the page's lifetime, which is the
// right scope: it is about what you just heard, not about what you heard last
// week.
const last = new Map<string, string>();

/** One line from `pool`, never the one this key returned last time. */
export function pickFresh(key: string, pool: readonly string[]): string {
  if (!pool.length) return "";
  const prev = last.get(key);
  // EXCLUDE the previous line and draw from what's left, rather than drawing
  // and retrying on a clash. A retry only makes a repeat rare (1/n² — six in
  // four thousand draws over a 27-line pool, measured), and "rare" is exactly
  // what makes a bug hard to believe when somebody reports it.
  //
  // Filtering by TEXT, not by index, is deliberate: the pools contain
  // duplicates on purpose (sterling-lines pushes its VIP tier lines RANK
  // times), so excluding one index would still let the same sentence come up
  // twice running. The weighting survives — the remaining copies keep their
  // share of every draw after this one.
  const fresh = prev === undefined ? pool : pool.filter((l) => l !== prev);
  const from = fresh.length ? fresh : pool; // a pool that is all one line
  const line = from[Math.floor(Math.random() * from.length)];
  last.set(key, line);
  return line;
}

/** Forget what was said — used by the harness, and safe to call anywhere. */
export function resetPickMemory(): void {
  last.clear();
}
