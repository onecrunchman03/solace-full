// Nightly Lottery client state. The pot is public all day; the draw at UTC
// midnight arrives as a `lottery.won` broadcast (everyone sees the winner).

import { api, type LotteryInfo } from "./api";
import { wallet } from "./wallet.svelte";
import { session } from "./session.svelte";
import { nav } from "./nav.svelte";
import { playSfx } from "./sfx";

export const lottery = $state<{
  info: LotteryInfo | null;
  loaded: boolean;
  /** The most recent draw seen live this session (banner fodder). */
  lastWon: { day: string; pot: number; paid: number; winner: { id: number; displayName: string } | null } | null;
}>({ info: null, loaded: false, lastWon: null });

export async function loadLottery(): Promise<void> {
  try {
    const info = await api.lottery();
    lottery.info = info;
    wallet.coins = info.coins;
    lottery.loaded = true;
  } catch {
    /* best-effort */
  }
}

export async function buyTickets(count: number): Promise<void> {
  const r = await api.lotteryBuy(count);
  if (lottery.info) {
    lottery.info = { ...lottery.info, mine: r.mine, pot: r.pot, tickets: r.tickets };
  }
  wallet.coins = r.coins;
}

export function handleLotteryWon(p: {
  day: string;
  pot: number;
  paid: number;
  winner: { id: number; displayName: string } | null;
}): void {
  lottery.lastWon = p;
  // Refetch only when it matters: I won, I held tickets (wallet/day state
  // changed for me), or I'm looking at the lottery view. Every connected
  // client refetching at the same midnight tick was a stampede — and the
  // uninvolved get jitter so even the viewers don't land together.
  const involved = p.winner?.id === session.user?.id || (lottery.info?.mine ?? 0) > 0;
  const watching = nav.view === "rumble" && nav.rumble === "lottery";
  // The fanfare: full volume for the winner wherever they are, softer for
  // anyone watching the draw land on the Lottery view.
  if (p.winner?.id === session.user?.id) playSfx("lottery-win", 0.8);
  else if (watching && p.winner) playSfx("lottery-win", 0.4);
  if (involved) void loadLottery();
  else if (watching) setTimeout(() => void loadLottery(), 500 + Math.random() * 2000);
}

export function resetLottery(): void {
  lottery.info = null;
  lottery.loaded = false;
  lottery.lastWon = null;
}
