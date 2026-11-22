// SOLACE SURVIVORZ — the simulation's one source of chance. A seeded sfc32: every roll the show
// makes comes from here, so the same seed and the same clock replay the same show (the harness
// proves it by running twice). Crypto is used ONCE, by the caller, to pick a seed.

export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number) {
    // splitmix32 to spread a small seed over the four words
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
    for (let i = 0; i < 12; i++) this.u32();
  }
  /** A uint32. */
  u32(): number {
    const t = (this.a + this.b + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }
  /** [0, 1) */
  next(): number { return this.u32() / 4294967296; }
  /** [lo, hi) */
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  /** an integer in [lo, hi] */
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  /** The generator's whole state (save.ts: a restored show draws exactly the rolls it would have). */
  getState(): [number, number, number, number] { return [this.a, this.b, this.c, this.d]; }
  /** exactly as getState gave them (`a` is a signed word after an xor — kept, not normalised) */
  setState(s: readonly number[]): void { [this.a, this.b, this.c, this.d] = [s[0], s[1], s[2], s[3]]; }
}
