<script lang="ts">
  import { onMount } from "svelte";
  import { api, type User } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { openProfile } from "../lib/nav.svelte";
  import Coin from "./Coin.svelte";
  import Avatar from "./Avatar.svelte";

  // THE LEADERBOARDS (reworked Sep 2026) — the one-stop shop for stats across
  // all games. Wallets stay private: every board ranks ACTIVITY (deeds done,
  // biggest single wins), never balances. The house's aggregate books keep
  // their tiles at the bottom — this is still the Ledger underneath.
  let stats = $state<Record<string, number> | null>(null);
  let boards = $state<Record<string, { user: User; value: number }[]> | null>(null);
  let mine = $state<Record<string, { value: number; rank: number }>>({});

  onMount(async () => {
    try {
      const r = await api.ledger();
      stats = r.stats;
      boards = r.boards ?? {};
      mine = r.mine ?? {};
    } catch {
      /* view shows the loading line */
    }
  });

  const n = (k: string) => (stats?.[k] ?? 0).toLocaleString();
  const mb = (k: string) => `${((stats?.[k] ?? 0) / 1_000_000).toFixed(1)} MB`;

  type Venue = "tables" | "market" | "worlds";
  const VENUES: { id: Venue; label: string }[] = [
    { id: "tables", label: "🎰 The Tables" },
    { id: "market", label: "🏪 Market" },
    { id: "worlds", label: "🚪 The Worlds" },
  ];
  let filter = $state<Venue | "all">("all");

  // The wall of fame: which boards to show, in order, with their flavor.
  const BOARDS: { key: string; icon: string; name: string; unit: "count" | "silver"; venue: Venue }[] = [
    // The tables
    { key: "gambled", icon: "🎲", name: "Highest Rollers", unit: "silver", venue: "tables" },
    { key: "spins", icon: "🎡", name: "Wheel Devotees", unit: "count", venue: "tables" },
    { key: "slotsPulls", icon: "🎰", name: "Lever Arms", unit: "count", venue: "tables" },
    { key: "slotsBest", icon: "💰", name: "Biggest Slots Hit", unit: "silver", venue: "tables" },
    { key: "rouletteBest", icon: "⚪", name: "Biggest Roulette Win", unit: "silver", venue: "tables" },
    { key: "crapsBest", icon: "🎯", name: "Biggest Craps Roll", unit: "silver", venue: "tables" },
    { key: "bjHands", icon: "🃏", name: "Blackjack Regulars", unit: "count", venue: "tables" },
    { key: "bjBest", icon: "🂡", name: "Biggest Blackjack Payout", unit: "silver", venue: "tables" },
    { key: "holdemBest", icon: "♠️", name: "Biggest Hold'em Pot", unit: "silver", venue: "tables" },
    { key: "derbyBest", icon: "🏇", name: "Biggest Derby Ticket", unit: "silver", venue: "tables" },
    { key: "lotteryWins", icon: "🎟️", name: "Nightly Draw Winners", unit: "count", venue: "tables" },
    { key: "chessWins", icon: "♞", name: "Chess Duelists", unit: "count", venue: "tables" },
    { key: "pitWins", icon: "🦴", name: "Bone Pit Champions", unit: "count", venue: "tables" },
    { key: "casinoKills", icon: "🔫", name: "Most Wanted", unit: "count", venue: "tables" },
    { key: "crowns", icon: "👑", name: "Pit Crowns", unit: "count", venue: "tables" },
    // The market
    { key: "emojiSold", icon: "🪙", name: "Sterling's Suppliers", unit: "count", venue: "market" },
    { key: "tradesDone", icon: "🤝", name: "Deal Makers", unit: "count", venue: "market" },
    { key: "auctionsWon", icon: "🔨", name: "Auction Hammers", unit: "count", venue: "market" },
    { key: "jukeboxPicks", icon: "🎵", name: "House DJs", unit: "count", venue: "market" },
    { key: "bailsPaid", icon: "🔓", name: "Bondsmen", unit: "count", venue: "market" },
    { key: "loansRepaid", icon: "🧾", name: "Paid the Goblins in Full", unit: "count", venue: "market" },
    // The worlds & the graveyard
    { key: "chestsOpened", icon: "🧰", name: "Chest Openers", unit: "count", venue: "worlds" },
    { key: "raises", icon: "🕯️", name: "Good Samaritans", unit: "count", venue: "worlds" },
  ];
  const MEDALS = ["🥇", "🥈", "🥉"];

  const shown = $derived(BOARDS.filter((b) => filter === "all" || b.venue === filter));
  // The caller's own standings, best rank first — only boards they're on.
  const standings = $derived(
    BOARDS.filter((b) => mine[b.key]).map((b) => ({ ...b, ...mine[b.key] })).sort((a, b) => a.rank - b.rank),
  );
</script>

<div class="ledger">
  <div class="inner">
    <header class="head">
      <div class="kicker">🏆 THE HOUSE ALWAYS COUNTS 🏆</div>
      <h1>Leaderboards</h1>
      <p class="sub">Every table, counter, and door — who did what, and how much of it.</p>
    </header>

    {#if !stats}
      <p class="muted center">The clerk is fetching the books…</p>
    {:else}
      {#if standings.length > 0}
        <div class="mineboard">
          <div class="m-head">YOUR STANDING{session.user ? ` — ${session.user.displayName.toUpperCase()}` : ""}</div>
          <div class="m-chips">
            {#each standings as s (s.key)}
              <div class="m-chip" class:podium={s.rank <= 3}>
                <span class="m-rank">{MEDALS[s.rank - 1] ?? `#${s.rank}`}</span>
                <span class="m-name">{s.icon} {s.name}</span>
                <span class="m-val">
                  {s.value.toLocaleString()}{#if s.unit === "silver"}&nbsp;<Coin size={10} />{/if}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="tabs">
        <button class="tab" class:on={filter === "all"} onclick={() => (filter = "all")}>All venues</button>
        {#each VENUES as v (v.id)}
          <button class="tab" class:on={filter === v.id} onclick={() => (filter = v.id)}>{v.label}</button>
        {/each}
      </div>

      <div class="boards">
        {#each shown as b (b.key)}
          {@const rows = boards?.[b.key] ?? []}
          {#if rows.length > 0}
            <div class="board">
              <div class="b-head"><span class="b-ico">{b.icon}</span> {b.name}</div>
              {#each rows as r, i (r.user.id)}
                <button class="b-row" class:first={i === 0} onclick={() => openProfile(r.user.id)}>
                  <span class="b-medal">{MEDALS[i] ?? `${i + 1}.`}</span>
                  <Avatar name={r.user.displayName} id={r.user.id} avatar={r.user.avatar} size={i === 0 ? 24 : 20} border={r.user.cosmetics?.border} />
                  <span class="b-name">{r.user.displayName}</span>
                  <span class="b-val">
                    {r.value.toLocaleString()}{#if b.unit === "silver"}&nbsp;<Coin size={11} />{/if}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
      {#if shown.every((b) => (boards?.[b.key] ?? []).length === 0)}
        <p class="muted center">This wall is bare — records begin now. Go make one.</p>
      {/if}

      <div class="sect-label">📖 THE HOUSE'S BOOKS</div>
      <div class="tiles">
        <div class="tile big">
          <span class="t-num"><Coin size={18} /> {n("supply")}</span>
          <span class="t-name">total supply</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("circulating")}</span>
          <span class="t-name">in wallets</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("escrowed")}</span>
          <span class="t-name">locked in play</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("auctionVolume")}</span>
          <span class="t-name">auction volume, all time</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("emojiOwned")}</span>
          <span class="t-name">emoji held</span>
        </div>
        <div class="tile">
          <span class="t-num">🪬 {n("talismansHeld")}</span>
          <span class="t-name">talismans in play</span>
        </div>
        <div class="tile">
          <span class="t-num">👑 {n("mythicsInTheWild")}</span>
          <span class="t-name">mythics in the wild</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("crownsClaimed")}</span>
          <span class="t-name">Pit crowns claimed</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("members")}</span>
          <span class="t-name">living members</span>
        </div>
        <div class="tile grim">
          <span class="t-num">💀 {n("deaths")}</span>
          <span class="t-name">taken by the Wheel</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("tradesSettled")}</span>
          <span class="t-name">trades settled</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("auctionsSettled")}</span>
          <span class="t-name">auctions hammered</span>
        </div>
        <div class="tile">
          <span class="t-num">{n("messagesSent")}</span>
          <span class="t-name">messages on record</span>
        </div>
        <div class="tile">
          <span class="t-num">{mb("attachmentBytes")}</span>
          <span class="t-name">pictures in the vault</span>
        </div>
      </div>

      <p class="fine">Wallets are private — the boards count deeds, never balances.</p>
    {/if}
  </div>
</div>

<style>
  .ledger {
    height: 100%;
    overflow-y: auto;
    background:
      radial-gradient(900px 420px at 50% 0%, rgba(216, 160, 76, 0.1), transparent 60%),
      radial-gradient(1200px 800px at 50% 110%, rgba(16, 26, 20, 1), rgba(10, 16, 12, 1));
    padding: 46px 20px 60px;
  }
  .inner {
    max-width: 980px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .head { text-align: center; margin-bottom: 6px; }
  .kicker {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    color: #d8a04c;
  }
  h1 {
    margin: 4px 0 6px;
    font-family: Georgia, serif;
    font-size: 2rem;
    color: #f0d9a8;
  }
  .sub { margin: 0; color: rgba(240, 230, 210, 0.65); font-size: 0.88rem; }
  .muted { color: rgba(240, 230, 210, 0.5); }
  .center { text-align: center; }

  /* ---- your standing ---- */
  .mineboard {
    padding: 12px 14px;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(216, 160, 76, 0.1), rgba(12, 20, 15, 0.85));
    border: 1px solid rgba(216, 160, 76, 0.45);
  }
  .m-head {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: #e6c988;
    margin-bottom: 8px;
  }
  .m-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .m-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(12, 20, 15, 0.8);
    border: 1px solid rgba(230, 190, 120, 0.22);
    font-size: 0.76rem;
    color: rgba(240, 230, 210, 0.85);
  }
  .m-chip.podium {
    border-color: rgba(232, 195, 60, 0.55);
    background: rgba(232, 195, 60, 0.08);
  }
  .m-rank { font-weight: 800; color: #f0d9a8; font-variant-numeric: tabular-nums; }
  .m-name { color: rgba(240, 230, 210, 0.7); }
  .m-val {
    display: inline-flex;
    align-items: center;
    font-weight: 800;
    color: #f0d9a8;
    font-variant-numeric: tabular-nums;
  }

  /* ---- venue tabs ---- */
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    margin-top: 2px;
  }
  .tab {
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid rgba(230, 190, 120, 0.25);
    background: rgba(12, 20, 15, 0.8);
    color: rgba(240, 230, 210, 0.7);
    cursor: pointer;
  }
  .tab:hover { border-color: rgba(216, 160, 76, 0.6); color: #f0d9a8; }
  .tab.on {
    background: rgba(216, 160, 76, 0.16);
    border-color: rgba(216, 160, 76, 0.7);
    color: #f0d9a8;
  }

  .sect-label {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: rgba(240, 217, 168, 0.7);
    margin-top: 8px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 13px 14px;
    border-radius: 12px;
    background: rgba(12, 20, 15, 0.8);
    border: 1px solid rgba(230, 190, 120, 0.22);
  }
  .tile.big {
    grid-column: 1 / -1;
    align-items: center;
    border-color: rgba(216, 160, 76, 0.5);
  }
  .tile.grim { border-color: rgba(190, 60, 50, 0.4); }
  .t-num {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #f0d9a8;
    font-size: 1.15rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .tile.big .t-num { font-size: 1.7rem; }
  .t-name {
    color: rgba(240, 230, 210, 0.55);
    font-size: 0.72rem;
  }
  .fine {
    text-align: center;
    color: rgba(240, 230, 210, 0.4);
    font-size: 0.74rem;
  }

  /* ---- The wall of fame ---- */
  .boards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
  }
  .board {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 12px 8px;
    border-radius: 12px;
    background: rgba(12, 20, 15, 0.8);
    border: 1px solid rgba(230, 190, 120, 0.22);
  }
  .b-head {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #e6c988;
    margin-bottom: 6px;
  }
  .b-ico { font-size: 0.95rem; }
  .b-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border: none;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .b-row:hover { background: rgba(230, 190, 120, 0.1); }
  .b-row.first {
    background: linear-gradient(90deg, rgba(232, 195, 60, 0.12), rgba(230, 190, 120, 0.04));
    box-shadow: inset 0 0 0 1px rgba(230, 190, 120, 0.3);
    padding-top: 6px;
    padding-bottom: 6px;
  }
  .b-medal {
    flex: none;
    width: 24px;
    text-align: center;
    font-size: 0.85rem;
  }
  .b-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.82rem;
    color: rgba(240, 230, 210, 0.85);
  }
  .b-row.first .b-name { color: #f0d9a8; font-weight: 700; }
  .b-val {
    flex: none;
    display: inline-flex;
    align-items: center;
    font-size: 0.82rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #f0d9a8;
  }
</style>
