// BIG WINNERS — the left bar screen's data (Josh: "a live feed of peoples
// winnings, who is winning big"). A pure CLIENT collector: it diffs the
// app-level game stores (fed by broadcasts that are already public —
// blackjack seats, derby winners, roulette bets, pit games) and keeps a
// short, recent list. Nothing new rides any wire, and balances stay private —
// these are the same numbers anyone watching the shared tables can see.

import { bj } from "../lib/blackjack.svelte";
import { derby } from "../lib/derby.svelte";
import { roulette } from "../lib/roulette.svelte";
import { pit } from "../lib/bonepit.svelte";
import { chat } from "../lib/chat.svelte";

export interface BigWin {
  id: string;
  at: number;
  name: string;
  amount: number;
  game: string;
}

export const bigWins = $state<{ list: BigWin[] }>({ list: [] });

const seen = new Set<string>();
const push = (id: string, name: string, amount: number, game: string): void => {
  if (seen.has(id) || amount <= 0) return;
  seen.add(id);
  bigWins.list = [{ id, at: Date.now(), name, amount, game }, ...bigWins.list].slice(0, 10);
  if (seen.size > 400) seen.clear(); // unbounded-set guard; a re-add is harmless
};

const nameOf = (userId: number): string => {
  const u = chat.members.find((m) => m.id === userId);
  return u ? u.displayName || u.username : "someone";
};

/** Call ~1Hz (the casino frame loop's slow lane). Entries are keyed so a
 *  state seen twice never double-posts; old entries fall out after 90s. */
export function pollBigWins(): void {
  // blackjack: settled seats — the DTO carries the actual payout, so the
  // profit is payout minus what was staked
  for (const l of bj.lobbies) {
    if (l.phase !== "settle") continue;
    for (const s of l.seats) {
      if (!s) continue;
      const profit = (s.payout ?? 0) + (s.payout2 ?? 0) - s.bet - (s.bet2 ?? 0);
      if (profit > 0) {
        push(`bj:${l.index}:${l.round}:${s.user.id}`, s.user.displayName || s.user.username, profit, "blackjack");
      }
    }
  }
  // derby: the podium's payouts, once the race has visibly finished
  const d = derby.state;
  if (d && d.phase === "settled" && derby.revealed) {
    for (const w of d.winners) {
      push(`derby:${d.round}:${w.userId}`, nameOf(w.userId), w.payout, "the derby");
    }
  }
  // roulette: winning bets once the ball has visibly landed
  const r = roulette.state;
  if (r && r.phase === "settled" && roulette.revealed && r.pocket !== null) {
    for (const b of r.bets) {
      if (!b.user) continue;
      const profit = rouletteProfit(b.kind, b.target, b.amount, r.pocket);
      if (profit > 0) {
        push(`ro:${r.round}:${b.user.id}:${b.kind}:${b.target ?? ""}`, b.user.displayName || b.user.username, profit, "roulette");
      }
    }
  }
  // the pit: a finished game's last liar standing takes the pot
  for (const g of pit.games) {
    if (g.phase !== "done") continue;
    const alive = g.players.filter((p) => p.user && !p.eliminated && p.diceCount > 0);
    if (alive.length === 1 && alive[0].user) {
      push(`pit:${g.id}`, alive[0].user.displayName || alive[0].user.username, g.stake * g.players.length, "the bone pit");
    }
  }
  // fallout: only RECENT entries stay on the board (Josh's rule)
  const cut = Date.now() - 90_000;
  if (bigWins.list.some((w) => w.at < cut)) {
    bigWins.list = bigWins.list.filter((w) => w.at >= cut);
  }
}

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Winning profit for a roulette bet against a landed pocket (EU rules —
 *  mirrors src/roulette.ts's oracle; display-only here). */
function rouletteProfit(kind: string, target: number | null, amount: number, pocket: number): number {
  const win = (() => {
    if (kind === "straight") return target === pocket;
    if (pocket === 0) return false; // zero beats every outside bet
    switch (kind) {
      case "red": return RED.has(pocket);
      case "black": return !RED.has(pocket);
      case "odd": return pocket % 2 === 1;
      case "even": return pocket % 2 === 0;
      case "low": return pocket <= 18;
      case "high": return pocket >= 19;
      case "dozen1": return pocket <= 12;
      case "dozen2": return pocket >= 13 && pocket <= 24;
      case "dozen3": return pocket >= 25;
      case "col1": return pocket % 3 === 1;
      case "col2": return pocket % 3 === 2;
      case "col3": return pocket % 3 === 0;
      default: return false;
    }
  })();
  if (!win) return 0;
  const mult = kind === "straight" ? 35 : kind.startsWith("dozen") || kind.startsWith("col") ? 2 : 1;
  return amount * mult;
}
