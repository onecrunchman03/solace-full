// SOLACE SURVIVORZ — loads that fail are tried again (the show streams for weeks, unattended).
//
// A load cache that kept a REJECTED promise forever made one bad moment permanent: a 502 while the
// server restarted for a deploy, and every zombie of that model was invisible until the page
// reloaded (the cast's bodies, the props in a hand). Here a failure is remembered only for a
// backoff (5 s, 10 s, 20 s… up to 2 min, per key): callers inside it share the failure (no
// hammering), the first caller after it loads again, and a success forgets the failures.
//
// PURE (no three.js, no DOM): scripts/checks/test_survivorz_client.mjs drives it on a fake clock.

export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 120_000;

/** the wait after the `fails`-th failure in a row */
export function retryWait(fails: number, base = RETRY_BASE_MS, max = RETRY_MAX_MS): number {
  return fails <= 0 ? 0 : Math.min(max, base * 2 ** Math.min(20, fails - 1));
}

interface Entry<T> { p: Promise<T>; fails: number; failedAt: number | null }

export class LoadCache<T> {
  private m = new Map<string, Entry<T>>();
  private now: () => number;

  constructor(now: () => number = () => performance.now()) { this.now = now; }

  /** the key's value: the one in hand (or in flight), the remembered failure inside its backoff,
   *  or a fresh `load()` */
  get(key: string, load: () => Promise<T>): Promise<T> {
    const e = this.m.get(key);
    if (e && (e.failedAt === null || this.now() - e.failedAt < retryWait(e.fails))) return e.p;
    const ent: Entry<T> = { p: load(), fails: e?.fails ?? 0, failedAt: null };
    this.m.set(key, ent);
    ent.p.then(() => { ent.fails = 0; }, () => { ent.fails++; ent.failedAt = this.now(); });
    return ent.p;
  }

  /** how long until the key may be tried again (0: now, or it isn't failing) */
  waitFor(key: string): number {
    const e = this.m.get(key);
    if (!e || e.failedAt === null) return 0;
    return Math.max(0, retryWait(e.fails) - (this.now() - e.failedAt));
  }

  values(): Promise<T>[] { return [...this.m.values()].map((e) => e.p); }
  clear(): void { this.m.clear(); }
}
