// THE PORTAL — the games behind the survey (docs/portal/archive/games.md):
// ishaal, the ring game, and Senneth's bench. Server side: it holds every
// board and replays every bench run, so a reward is only ever paid for
// something that really happened. Nothing here pays silver or anything that
// crosses back into Solace (the faucet doctrine); a finished exercise or a
// beaten opponent reads one mark for everyone, the rarest still unread.
//
// The recorded game and every bot opening are positions, not archive text,
// so they may be generated (pinned.md's note on the ring game).

import type { Store } from "../db/store";
import type { Hall } from "./hall";
import { tokenize } from "./script";
import { transliterate } from "./translit";
import {
  clone, find, moves, other, play, replay, sideToMove, verdict, alive, onLong,
  type Legal, type Move, type Side, type Stone,
} from "./ishaal-rules";
import { BENCH, BENCH_IDS, simulate, type BenchId } from "./bench-sim";

/** The four hall players a reader can sit across from, weakest first. Two
 *  open the way they opened in the recorded game; two only play their way. */
export const OPPONENTS = ["Paelu", "Hethra Maal", "Tamruk Hesh", "Nemaai"] as const;
export type Opponent = (typeof OPPONENTS)[number];
/** Which side each sits on (the reader takes the other), and how many of
 *  their own recorded moves they open with. */
const SEAT: Record<Opponent, { side: Side; opening: number; depth: number; noise: number }> = {
  Paelu: { side: "even", opening: 0, depth: 1, noise: 0.55 },
  "Hethra Maal": { side: "odd", opening: 0, depth: 1, noise: 0.15 },
  "Tamruk Hesh": { side: "even", opening: 12, depth: 2, noise: 0.05 },
  Nemaai: { side: "odd", opening: 12, depth: 2, noise: 0 },
};
/** A board nobody finishes is no result. */
export const PLY_CAP = 300;
/** The recorded game stands here: Paelu to move, the room dark (octal 760). */
export const UNFINISHED_PLY = 0o760 - 1;

// ---- the hall's player ---------------------------------------------------------
function score(stones: Stone[], side: Side): number {
  const opp = other(side);
  const mine = alive(stones, side), theirs = alive(stones, opp);
  if (onLong(stones, side) >= 4 || theirs.length <= 2) return 1e6;
  if (onLong(stones, opp) >= 4 || mine.length <= 2) return -1e6;
  let v = (mine.length - theirs.length) * 40 + (onLong(stones, side) - onLong(stones, opp)) * 25;
  for (const s of mine) v += s.ring * 1.5;
  for (const s of theirs) v -= s.ring * 1.5;
  // A stone the other side could take next move is worth less.
  const threat = moves(stones, opp).reduce((n, m) => n + m.takes.length, 0);
  const chance = moves(stones, side).reduce((n, m) => n + m.takes.length, 0);
  return v - threat * 18 + chance * 6;
}
function search(stones: Stone[], side: Side, depth: number, alpha: number, beta: number): number {
  const ms = moves(stones, side);
  if (depth === 0 || !ms.length) return score(stones, side);
  let best = -Infinity;
  for (const m of ms) {
    const b = clone(stones), mv = find(b, side, { n: m.stone.n, ring: m.ring, spoke: m.spoke })!;
    play(b, mv);
    const v = -search(b, other(side), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
/** The hall player's move: a recorded opening move while it still fits, then search. */
export function botMove(stones: Stone[], side: Side, opp: Opponent, ply: number, recorded: Move[], rand: () => number = Math.random): Legal | null {
  const seat = SEAT[opp];
  const ms = moves(stones, side);
  if (!ms.length) return null;
  const own = Math.floor(ply / 2);
  if (own < seat.opening) {
    // The opponent's own recorded moves, in order, while they are still legal here.
    const theirs = recorded.filter((_, i) => sideToMove(i) === side);
    const want = theirs[own];
    const mv = want ? find(stones, side, want) : null;
    if (mv) return mv;
  }
  const scored = ms.map((m) => {
    const b = clone(stones), mv = find(b, side, { n: m.stone.n, ring: m.ring, spoke: m.spoke })!;
    play(b, mv);
    const v = seat.depth > 1 ? -search(b, other(side), seat.depth - 1, -Infinity, Infinity) : score(b, side);
    return { m, v: v + (rand() - 0.5) * seat.noise * 120 };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}

// ---- the games ------------------------------------------------------------------
interface BotGame { opp: Opponent; moves: Move[]; you: Side; done: Side | "none" | null }
interface BenchRun { id: BenchId; seed: number; startedAt: number }

export class PortalGames {
  private bots = new Map<number, BotGame>();
  private benches = new Map<number, BenchRun>();
  readonly recorded: Move[];
  readonly recordedNames: { even: string; odd: string };

  constructor(private store: Store, private hall: Hall, ishaal: number[][]) {
    // The bundle: [ply, stone, fromRing, fromSpoke, toRing, toSpoke].
    this.recorded = ishaal.map(([, n, , , ring, spoke]) => ({ n, ring, spoke }));
    this.recordedNames = { even: "Tamruk Hesh", odd: "Nemaai" };
    if (!replay(this.recorded)) throw new Error("portal: the recorded ishaal game does not replay");
  }

  /** What a reader sees on opening the ring game. */
  view(viewer: number) {
    const done = this.store.portalDone(viewer);
    const members = new Map(this.store.portalMembers().map((m) => [m.userId, m.username]));
    const nameOf = (id: number | null) => (id == null ? null : tokenize(transliterate(members.get(id) ?? "a")).tokens);
    const paelu = done.get("paelu");
    return {
      recorded: {
        moves: this.recorded, names: { even: tokenize("Tamruk Hesh").tokens, odd: tokenize("Nemaai").tokens, paelu: tokenize("Paelu").tokens },
        ply: this.recorded.length, mine: paelu?.data ? (JSON.parse(paelu.data) as Move) : null,
      },
      opponents: OPPONENTS.map((o) => ({ id: o, name: tokenize(o).tokens, side: SEAT[o].side, beaten: done.has(`ishaal:${o}`) })),
      bot: this.botView(viewer),
      live: this.store.portalIshaalGames().map((g) => ({
        id: g.id, status: g.status, winner: g.winner, even: nameOf(g.evenId), odd: nameOf(g.oddId),
        you: g.evenId === viewer ? "even" : g.oddId === viewer ? "odd" : null,
        moves: JSON.parse(g.moves) as Move[],
      })),
    };
  }

  // ---- the unfinished game ----
  /** Make Paelu's move: once, filed by Tharvend, answered by nobody. */
  paelu(viewer: number, m: unknown): { ok: true } | { ok: false; error: string } {
    if (this.store.portalDone(viewer).has("paelu")) return { ok: false, error: "already_moved" };
    const stones = replay(this.recorded)!;
    const mv = find(stones, sideToMove(this.recorded.length), m);
    if (!mv) return { ok: false, error: "illegal" };
    this.store.portalFinish(viewer, "paelu", JSON.stringify({ n: mv.stone.n, ring: mv.ring, spoke: mv.spoke }));
    return { ok: true };
  }

  // ---- against the hall's players ----
  private botView(viewer: number) {
    const g = this.bots.get(viewer);
    if (!g) return null;
    return { opp: g.opp, you: g.you, moves: g.moves, done: g.done };
  }
  /** Sit down across from one of the hall's players. Odd always moves first. */
  botStart(viewer: number, opp: unknown): { ok: true } | { ok: false; error: string } {
    if (!OPPONENTS.includes(opp as Opponent)) return { ok: false, error: "bad_opponent" };
    const o = opp as Opponent;
    const g: BotGame = { opp: o, moves: [], you: other(SEAT[o].side), done: null };
    this.bots.set(viewer, g);
    if (sideToMove(0) !== g.you) this.botReply(g);
    return { ok: true };
  }
  private botReply(g: BotGame): void {
    const stones = replay(g.moves)!;
    let v = verdict(stones, g.moves.length);
    if (v) { g.done = v; return; }
    const mv = botMove(stones, sideToMove(g.moves.length), g.opp, g.moves.length, this.recorded);
    if (!mv) { g.done = g.you; return; }
    g.moves.push({ n: mv.stone.n, ring: mv.ring, spoke: mv.spoke });
    play(stones, mv);
    v = verdict(stones, g.moves.length);
    if (v) g.done = v;
    else if (g.moves.length >= PLY_CAP) g.done = "none";
  }
  /** A reader's move; the hall's player answers at once. A win is a module. */
  botMove(viewer: number, m: unknown): { ok: true; done: Side | "none" | null; cracked: number | null } | { ok: false; error: string } {
    const g = this.bots.get(viewer);
    if (!g || g.done) return { ok: false, error: "no_game" };
    const stones = replay(g.moves)!;
    if (sideToMove(g.moves.length) !== g.you) return { ok: false, error: "not_your_move" };
    const mv = find(stones, g.you, m);
    if (!mv) return { ok: false, error: "illegal" };
    g.moves.push({ n: mv.stone.n, ring: mv.ring, spoke: mv.spoke });
    play(stones, mv);
    const v = verdict(stones, g.moves.length);
    if (v) g.done = v;
    else if (g.moves.length >= PLY_CAP) g.done = "none";
    else this.botReply(g);
    let cracked: number | null = null;
    if (g.done === g.you && this.store.portalFinish(viewer, `ishaal:${g.opp}`)) cracked = this.hall.moduleCrack(viewer, `ishaal:${g.opp}`);
    return { ok: true, done: g.done, cracked };
  }
  botLeave(viewer: number): void { this.bots.delete(viewer); }
  botOpponent(viewer: number): Opponent | null { return this.bots.get(viewer)?.opp ?? null; }

  // ---- against each other ----
  openGame(viewer: number): { ok: true; id: number } | { ok: false; error: string } {
    const mine = this.store.portalIshaalGames().filter((g) => g.status !== "done" && (g.evenId === viewer || g.oddId === viewer));
    if (mine.length >= 3) return { ok: false, error: "too_many" };
    return { ok: true, id: this.store.portalIshaalOpen(viewer) };
  }
  joinGame(viewer: number, id: unknown): { ok: true } | { ok: false; error: string } {
    if (!Number.isInteger(id)) return { ok: false, error: "no_game" };
    return this.store.portalIshaalJoin(id as number, viewer) ? { ok: true } : { ok: false, error: "taken" };
  }
  liveMove(viewer: number, id: unknown, m: unknown): { ok: true; winner: Side | "none" | null } | { ok: false; error: string } {
    const g = Number.isInteger(id) ? this.store.portalIshaalGame(id as number) : null;
    if (!g || g.status !== "live") return { ok: false, error: "no_game" };
    const list = JSON.parse(g.moves) as Move[];
    const side = sideToMove(list.length);
    if ((side === "even" ? g.evenId : g.oddId) !== viewer) return { ok: false, error: "not_your_move" };
    const stones = replay(list);
    if (!stones) return { ok: false, error: "no_game" };
    const mv = find(stones, side, m);
    if (!mv) return { ok: false, error: "illegal" };
    play(stones, mv);
    list.push({ n: mv.stone.n, ring: mv.ring, spoke: mv.spoke });
    const v: Side | "none" | null = verdict(stones, list.length) ?? (list.length >= PLY_CAP ? "none" : null);
    if (!this.store.portalIshaalMove(g.id, list.length - 1, JSON.stringify(list), v ? "done" : "live", v)) return { ok: false, error: "stale" };
    return { ok: true, winner: v };
  }
  /** Concede (or withdraw an open challenge). */
  resign(viewer: number, id: unknown): { ok: true } | { ok: false; error: string } {
    const g = Number.isInteger(id) ? this.store.portalIshaalGame(id as number) : null;
    if (!g || g.status === "done" || (g.evenId !== viewer && g.oddId !== viewer)) return { ok: false, error: "no_game" };
    const winner = g.status === "open" ? null : g.evenId === viewer ? "odd" : "even";
    return this.store.portalIshaalEnd(g.id, "done", winner) ? { ok: true } : { ok: false, error: "no_game" };
  }

  // ---- Senneth's bench ----
  /** The bench for one reader: each exercise, open or not, finished or not,
   *  and the readings the bench prints (as glyph tokens — the bench never
   *  says what they mean). */
  bench(viewer: number) {
    const done = this.store.portalDone(viewer);
    const num = (s: string) => tokenize(s).tokens;
    return {
      exercises: BENCH_IDS.map((id, i) => ({
        id, depth: num(BENCH[id].depth), open: i === 0 || done.has(`bench:${BENCH_IDS[i - 1]}`), done: done.has(`bench:${id}`),
      })),
      readings: { zero: num("0.0000"), drift: num("0.0001"), design: num("1.0000") },
    };
  }
  benchStart(viewer: number, id: unknown): { ok: true; seed: number } | { ok: false; error: string } {
    const b = this.bench(viewer).exercises.find((e) => e.id === id);
    if (!b) return { ok: false, error: "bad_exercise" };
    if (!b.open) return { ok: false, error: "locked" };
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.benches.set(viewer, { id: id as BenchId, seed, startedAt: Date.now() });
    return { ok: true, seed };
  }
  /** Finish a run: the server replays every bleed the reader made against the
   *  same seed and only pays for a fold that really held, for really that long. */
  benchFinish(viewer: number, clicks: unknown): { ok: true; held: boolean; cracked: number | null; mark: number | null } | { ok: false; error: string } {
    const run = this.benches.get(viewer);
    if (!run) return { ok: false, error: "no_run" };
    this.benches.delete(viewer);
    if (!Array.isArray(clicks) || clicks.length > 20_000 || !clicks.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger))) return { ok: false, error: "bad_run" };
    const spec = BENCH[run.id];
    const r = simulate(run.id, run.seed, clicks as [number, number][], spec.steps);
    // Real time, too: a run can't be finished faster than the fold holds (a little slack for the network).
    const held = r.held && Date.now() - run.startedAt >= spec.steps * 100 * 0.9;
    if (!held) return { ok: true, held: false, cracked: null, mark: null };
    if (!this.store.portalFinish(viewer, `bench:${run.id}`)) return { ok: true, held: true, cracked: null, mark: null };
    if (run.id === "unaimed") return { ok: true, held: true, cracked: null, mark: this.hall.notationModuleCrack(viewer, "bench:unaimed") };
    return { ok: true, held: true, cracked: this.hall.moduleCrack(viewer, `bench:${run.id}`), mark: null };
  }
}

