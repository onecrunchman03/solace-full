<script lang="ts">
  import { onMount } from "svelte";
  import { api, ApiError } from "../lib/api";
  import { sidebets, poolKey, markMySideBet } from "../lib/sidebet.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import Coin from "./Coin.svelte";

  // Pari-mutuel spectator betting: pick a player, stake silver. Winners split
  // the pool pro-rata after the house's 5% cut. The panel hides itself for
  // players in the game (the server enforces it regardless).
  const {
    kind,
    gameId,
    candidates,
    open = true,
  }: {
    kind: "chess" | "pit";
    gameId: string;
    candidates: { id: number; name: string }[];
    open?: boolean;
  } = $props();

  let mine = $state<{ onUserId: number; amount: number }[]>([]);
  let min = $state(5);
  let amount = $state(25);
  let target = $state<number | null>(null);
  let err = $state("");
  let placing = $state(false);

  onMount(async () => {
    try {
      const r = await api.sideBets(kind, gameId);
      sidebets.pools = { ...sidebets.pools, [poolKey(kind, gameId)]: r.pools };
      mine = r.mine;
      min = r.min;
      if (r.mine.length) markMySideBet(kind, gameId); // refresh mid-game: still involved
    } catch {
      /* panel still works for placing */
    }
  });

  const pools = $derived(sidebets.pools[poolKey(kind, gameId)] ?? {});
  const total = $derived(Object.values(pools).reduce((n, v) => n + v, 0));
  const result = $derived(sidebets.settled[poolKey(kind, gameId)]);

  /** Implied payout multiple if this candidate wins (after the 5% rake). */
  function multiple(id: number): string {
    const side = pools[id] ?? 0;
    if (!side || !total) return "—";
    return `×${((total * 0.95) / side).toFixed(2)}`;
  }

  async function place() {
    if (target === null || placing) return;
    placing = true;
    err = "";
    try {
      const r = await api.sideBet(kind, gameId, target, Math.floor(amount));
      wallet.coins = r.coins;
      markMySideBet(kind, gameId); // the settle broadcast should refetch MY wallet
      sidebets.pools = { ...sidebets.pools, [poolKey(kind, gameId)]: r.pools };
      mine = (await api.sideBets(kind, gameId)).mine;
    } catch (e) {
      err =
        e instanceof ApiError && e.code === "insufficient" ? "Not enough silver."
        : e instanceof ApiError && e.code === "bets_closed" ? "Betting is closed for this game."
        : e instanceof ApiError && e.code === "players_cant_bet" ? "Players can't bet on their own game."
        : e instanceof ApiError && e.code === "bad_amount" ? `Between ${min} and 10,000.`
        : "Couldn't place that.";
    } finally {
      placing = false;
    }
  }

  function nameOf(id: number): string {
    return candidates.find((c) => c.id === id)?.name ?? "?";
  }
</script>

<div class="sbp">
  <div class="sbp-head">
    <span class="sbp-label">📈 SIDE BETS</span>
    {#if total}<span class="sbp-pool"><Coin size={11} /> {total.toLocaleString()} pooled</span>{/if}
  </div>

  {#if result}
    <p class="sbp-note">
      {result.refunded
        ? "Bets refunded — no result to pay."
        : `Pool of ${result.pool.toLocaleString()} paid out (${result.rake.toLocaleString()} to the lottery pot).`}
    </p>
  {:else if !open}
    <p class="sbp-note">Betting closed — cups are rolling.</p>
    {#if mine.length}
      <p class="sbp-note">Your tickets: {mine.map((m) => `${m.amount} on ${nameOf(m.onUserId)}`).join(" · ")}</p>
    {/if}
  {:else}
    <div class="sbp-row">
      {#each candidates as c (c.id)}
        <button class="sbp-cand" class:on={target === c.id} onclick={() => (target = target === c.id ? null : c.id)}>
          <span class="c-name">{c.name}</span>
          <span class="c-odds">{pools[c.id] ? `${pools[c.id].toLocaleString()} · ${multiple(c.id)}` : "no bets"}</span>
        </button>
      {/each}
    </div>
    <div class="sbp-place">
      <input type="number" min={min} max="10000" bind:value={amount} />
      <button class="sbp-go" disabled={target === null || placing || wallet.coins < amount} onclick={place}>
        {placing ? "Placing…" : target === null ? "Pick a player" : `Bet on ${nameOf(target)}`}
      </button>
    </div>
    {#if mine.length}
      <p class="sbp-note">Your tickets: {mine.map((m) => `${m.amount} on ${nameOf(m.onUserId)}`).join(" · ")}</p>
    {/if}
    {#if err}<p class="sbp-err">{err}</p>{/if}
    <p class="sbp-fine">Winners split the pool pro-rata; 5% seeds the nightly lottery. Draw or fold refunds everyone.</p>
  {/if}
</div>

<style>
  .sbp {
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px dashed rgba(230, 190, 120, 0.35);
  }
  .sbp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .sbp-label {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    color: rgba(240, 217, 168, 0.75);
  }
  .sbp-pool {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.74rem;
    color: #f0d9a8;
    font-weight: 700;
  }
  .sbp-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .sbp-cand {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 6px 12px;
    border-radius: 9px;
    border: 1px solid rgba(230, 190, 120, 0.25);
    background: rgba(0, 0, 0, 0.3);
    font: inherit;
    cursor: pointer;
  }
  .sbp-cand.on {
    border-color: #d8a04c;
    background: rgba(216, 160, 76, 0.18);
  }
  .c-name {
    color: #f0e6d2;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .c-odds {
    color: rgba(240, 230, 210, 0.55);
    font-size: 0.68rem;
  }
  .sbp-place {
    display: flex;
    gap: 6px;
  }
  .sbp-place input {
    width: 90px;
    padding: 7px 9px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(230, 190, 120, 0.3);
    border-radius: 8px;
    color: #f0e6d2;
    font: inherit;
    font-size: 0.85rem;
  }
  .sbp-go {
    flex: 1;
    padding: 7px 14px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(180deg, #f0c96c, #d8a04c);
    color: #241708;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
  }
  .sbp-go:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .sbp-note {
    margin: 6px 0 0;
    font-size: 0.74rem;
    color: rgba(240, 230, 210, 0.6);
  }
  .sbp-err {
    margin: 6px 0 0;
    font-size: 0.76rem;
    color: #ff9a8a;
  }
  .sbp-fine {
    margin: 6px 0 0;
    font-size: 0.66rem;
    color: rgba(240, 230, 210, 0.4);
  }
</style>
