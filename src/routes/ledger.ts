import { json, type Router } from "../http";

/** The Leaderboards' board catalog: wire key → user_stats key. One list so
 *  the boards and the caller's own standings can never drift apart. Ranks
 *  ACTIVITY (spins taken, biggest single wins, deeds done) — never balances. */
const STAT_BOARDS: [wire: string, key: string][] = [
  // The tables
  ["gambled", "gambled"],
  ["spins", "spins"],
  ["slotsPulls", "slots_pulls"],
  ["slotsBest", "slots_best"],
  ["rouletteBest", "roulette_best"],
  ["crapsBest", "craps_best"],
  ["bjHands", "bj_hands"],
  ["bjBest", "bj_best"],
  ["holdemBest", "holdem_best"],
  ["derbyBest", "derby_best"],
  ["lotteryWins", "lottery_wins"],
  ["chessWins", "chess_wins"],
  ["pitWins", "pit_wins"],
  ["casinoKills", "casino_kills"],
  // The market
  ["emojiSold", "emoji_sold"],
  ["tradesDone", "trades_done"],
  ["auctionsWon", "auctions_won"],
  ["jukeboxPicks", "jukebox_picks"],
  // The goblins (Sep 2026): who springs people, who pays them off.
  ["bailsPaid", "bails_paid"],
  ["loansRepaid", "loans_repaid"],
  // The worlds & the graveyard
  ["chestsOpened", "chests_opened"],
  ["raises", "raises"],
];

/** The House Ledger: public AGGREGATE economy stats + activity leaderboards.
 *  Per-user wallets stay private — the boards rank ACTIVITY (spins taken,
 *  biggest single wins, silver gambled), never balances. */
export function registerLedgerRoutes(router: Router): void {
  router.get("/api/ledger", "user", ({ res, user, store }) => {
    const boards: Record<string, unknown> = {};
    const mine: Record<string, { value: number; rank: number }> = {};
    for (const [wire, key] of STAT_BOARDS) {
      boards[wire] = store.topStats(key);
      const r = store.statRank(user.id, key);
      if (r) mine[wire] = r;
    }
    boards.crowns = store.topWinCounts("bonepit_weeks");
    json(res, 200, { stats: store.ledgerStats(), boards, mine });
  });
}
