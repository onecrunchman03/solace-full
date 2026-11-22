// THE PORTAL — ishaal, the ring game, as pure rules (pinned.md → shenai — ISHAAL).
// Kept import-free so the game's server and client can share it later.
//
// The board: rings 1..8 (1 = the edge, 8 = the long ring) × spokes 0..7.
// A move is one stone, one step: along its ring (spokes wrap) or along its
// spoke (in or out), to an empty point. A stone is taken when the MOVE puts
// an enemy between the moved stone and another friendly stone, along a ring
// or a spoke; moving between two enemies is safe. You win at the start of
// your move with four stones on the long ring, or when your opponent is down
// to two stones.

export const RINGS = 8, SPOKES = 8, LONG = 8;

/** Opening: side "even" on rings 1–2 at even spokes, "odd" at odd spokes.
 *  Stones are numbered 1–4 on the edge, 5–8 on ring 2, spoke order. */
export function opening() {
  const stones = [];
  for (const side of ["even", "odd"]) {
    let n = 1;
    for (const ring of [1, 2]) for (let s = side === "even" ? 0 : 1; s < SPOKES; s += 2) stones.push({ side, n: n++, ring, spoke: s, taken: false });
  }
  return stones;
}

export const at = (stones, ring, spoke) => stones.find((x) => !x.taken && x.ring === ring && x.spoke === spoke);
const wrap = (s) => ((s % SPOKES) + SPOKES) % SPOKES;
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // [dRing, dSpoke]

/** Every legal move for a side: { stone, ring, spoke, takes: [stones] }. */
export function moves(stones, side) {
  const out = [];
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
export function takenBy(stones, st, ring, spoke) {
  const takes = [];
  for (const [dr, ds] of DIRS) {
    const r1 = ring + dr, s1 = wrap(spoke + ds), r2 = ring + 2 * dr, s2 = wrap(spoke + 2 * ds);
    if (r1 < 1 || r1 > RINGS || r2 < 1 || r2 > RINGS) continue;
    const mid = at(stones, r1, s1), far = at(stones, r2, s2);
    if (mid && mid.side !== st.side && far && far !== st && far.side === st.side) takes.push(mid);
  }
  return takes;
}

export function play(stones, mv) {
  mv.stone.ring = mv.ring;
  mv.stone.spoke = mv.spoke;
  for (const t of mv.takes) t.taken = true;
}

export const alive = (stones, side) => stones.filter((x) => !x.taken && x.side === side);
export const onLong = (stones, side) => alive(stones, side).filter((x) => x.ring === LONG).length;

/** Has `side` won at the start of its move? */
export function won(stones, side) {
  const other = side === "even" ? "odd" : "even";
  return onLong(stones, side) >= 4 || alive(stones, other).length <= 2;
}

export const clone = (stones) => stones.map((x) => ({ ...x }));
