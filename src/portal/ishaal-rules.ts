// THE PORTAL — ishaal, the ring game, as pure rules (pinned.md → shenai —
// ISHAAL). IMPORT-FREE: the server plays and checks it, the client draws it
// and shows a reader's legal moves. scripts/portal/ishaal.mjs is the same
// rules, kept beside the generator that wrote the Nemaai–Tamruk game.
//
// The board: rings 1..8 (1 = the edge, 8 = the long ring) × spokes 0..7.
// A move is one stone, one step: along its ring (spokes wrap) or along its
// spoke (in or out), to an empty point. A stone is taken when the MOVE puts
// an enemy between the moved stone and another friendly stone, along a ring
// or a spoke; moving between two enemies is safe. You win at the start of
// your move with four stones on the long ring, or when your opponent is down
// to two stones. A side with no move left has conceded.

export const RINGS = 8, SPOKES = 8, LONG = 8;
export type Side = "even" | "odd";
export interface Stone { side: Side; n: number; ring: number; spoke: number; taken: boolean }
/** A move as the wire carries it: which stone (by side's numbering) to where. */
export interface Move { n: number; ring: number; spoke: number }

/** Odd moves first (the hall's custom; the Nemaai–Tamruk game opens with Nemaai). */
export const sideToMove = (ply: number): Side => (ply % 2 === 0 ? "odd" : "even");
export const other = (s: Side): Side => (s === "even" ? "odd" : "even");

/** Opening: "even" on rings 1–2 at even spokes, "odd" at odd spokes.
 *  Stones are numbered 1–4 on the edge, 5–8 on ring 2, spoke order. */
export function opening(): Stone[] {
  const stones: Stone[] = [];
  for (const side of ["even", "odd"] as Side[]) {
    let n = 1;
    for (const ring of [1, 2]) for (let s = side === "even" ? 0 : 1; s < SPOKES; s += 2) stones.push({ side, n: n++, ring, spoke: s, taken: false });
  }
  return stones;
}

export const at = (stones: Stone[], ring: number, spoke: number) => stones.find((x) => !x.taken && x.ring === ring && x.spoke === spoke);
const wrap = (s: number) => ((s % SPOKES) + SPOKES) % SPOKES;
const DIRS: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // [dRing, dSpoke]

export interface Legal { stone: Stone; ring: number; spoke: number; takes: Stone[] }
/** Every legal move for a side. */
export function moves(stones: Stone[], side: Side): Legal[] {
  const out: Legal[] = [];
  for (const st of stones) {
    if (st.taken || st.side !== side) continue;
    for (const [dr, ds] of DIRS) {
      const ring = st.ring + dr, spoke = wrap(st.spoke + ds);
      if (ring < 1 || ring > RINGS || at(stones, ring, spoke)) continue;
      out.push({ stone: st, ring, spoke, takes: takenBy(stones, st, ring, spoke) });
    }
  }
  return out;
}

/** The enemy stones a move to (ring, spoke) would take. */
export function takenBy(stones: Stone[], st: Stone, ring: number, spoke: number): Stone[] {
  const takes: Stone[] = [];
  for (const [dr, ds] of DIRS) {
    const r1 = ring + dr, s1 = wrap(spoke + ds), r2 = ring + 2 * dr, s2 = wrap(spoke + 2 * ds);
    if (r1 < 1 || r1 > RINGS || r2 < 1 || r2 > RINGS) continue;
    const mid = at(stones, r1, s1), far = at(stones, r2, s2);
    if (mid && mid.side !== st.side && far && far !== st && far.side === st.side) takes.push(mid);
  }
  return takes;
}

export function play(stones: Stone[], mv: Legal): void {
  mv.stone.ring = mv.ring;
  mv.stone.spoke = mv.spoke;
  for (const t of mv.takes) t.taken = true;
}

export const alive = (stones: Stone[], side: Side) => stones.filter((x) => !x.taken && x.side === side);
export const onLong = (stones: Stone[], side: Side) => alive(stones, side).filter((x) => x.ring === LONG).length;

/** Has `side` won at the start of its move? */
export function won(stones: Stone[], side: Side): boolean {
  return onLong(stones, side) >= 4 || alive(stones, other(side)).length <= 2;
}

export const clone = (stones: Stone[]) => stones.map((x) => ({ ...x }));

/** The legal move a wire move names, or null. */
export function find(stones: Stone[], side: Side, m: unknown): Legal | null {
  if (!m || typeof m !== "object") return null;
  const { n, ring, spoke } = m as Move;
  if (![n, ring, spoke].every(Number.isInteger)) return null;
  return moves(stones, side).find((x) => x.stone.n === n && x.ring === ring && x.spoke === spoke) ?? null;
}

/** Replay a move list from the opening. Null if any move is illegal. */
export function replay(list: Move[]): Stone[] | null {
  const stones = opening();
  for (let ply = 0; ply < list.length; ply++) {
    const mv = find(stones, sideToMove(ply), list[ply]);
    if (!mv) return null;
    play(stones, mv);
  }
  return stones;
}

/** How a game stands before the side to move moves: still going, or who won. */
export function verdict(stones: Stone[], ply: number): Side | null {
  const s = sideToMove(ply);
  if (won(stones, s)) return s;
  if (!moves(stones, s).length) return other(s);
  return null;
}
