<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { lottery, loadLottery, buyTickets } from "../lib/lottery.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { ApiError } from "../lib/api";
  import Coin from "./Coin.svelte";
  import Avatar from "./Avatar.svelte";
  import felt from "../assets/casino-felt.webp";

  let error = $state("");
  let buying = $state(false);
  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 1000);

  onMount(loadLottery);
  onDestroy(() => clearInterval(tick));

  const info = $derived(lottery.info);
  const untilDraw = $derived.by(() => {
    if (!info) return "";
    const ms = Math.max(0, info.drawAt - now);
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  });
  const canBuy = $derived(
    !!info && !buying && info.mine < info.maxPerDay && wallet.coins >= (info?.price ?? 0),
  );
  const myChance = $derived(
    info && info.tickets > 0 ? Math.round((info.mine / info.tickets) * 100) : 0,
  );

  async function buy(): Promise<void> {
    if (!info || buying) return;
    buying = true;
    error = "";
    try {
      await buyTickets(1);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      error =
        code === "insufficient" ? "Not enough silver." :
        code === "ticket_cap" ? "One ticket each — you already have tonight's." :
        "Couldn't buy a ticket.";
    } finally {
      buying = false;
    }
  }
</script>

<div class="lotto" style="--felt: url({felt})">
  <header class="head">
    <h1>🎟️ THE NIGHTLY DRAW</h1>
    <span class="sub">one winner at midnight UTC · 90% of the pot · fed by the casino's rakes</span>
  </header>

  {#if !info}
    <p class="muted">The kiosk is opening…</p>
  {:else}
    <div class="pot-card">
      <span class="pot-label">TONIGHT'S POT</span>
      <span class="pot"><Coin size={26} /> {info.pot.toLocaleString()}</span>
      <span class="pot-sub">{info.tickets.toLocaleString()} tickets · {info.players} player{info.players === 1 ? "" : "s"} · draws in <b>{untilDraw}</b></span>
      {#if info.boost > 0}
        <span class="pot-boost">✨ includes {info.boost.toLocaleString()} raked in from the casino floor</span>
      {/if}
    </div>

    {#if lottery.lastWon}
      <div class="won-banner">
        🎉 <b>{lottery.lastWon.winner?.displayName ?? "Somebody"}</b> just took
        {lottery.lastWon.paid.toLocaleString()} silver from last night's pot!
      </div>
    {/if}

    <div class="buy-card">
      <span class="lbl">
        {#if info.mine > 0}
          YOU'RE IN{#if myChance > 0}&nbsp;· {myChance}% of the pot{/if}
        {:else}
          ONE TICKET EACH
        {/if}
      </span>
      <div class="buy-row">
        {#if info.mine > 0}
          <span class="gotone">🎟 Your ticket is in tonight's draw.</span>
        {:else}
          <button class="buy" disabled={!canBuy} onclick={() => void buy()}>
            Buy a ticket — {info.price.toLocaleString()} <Coin size={13} />
          </button>
        {/if}
      </div>
      <span class="hint">
        One ticket per person, so everyone has the same chance. Tickets are
        final — the silver goes straight into the pot.
        {#if info.players < 2}
          <b>A draw needs two players; if only one buys, the night is void and the stake comes back.</b>
        {/if}
      </span>
      {#if error}<span class="err">{error}</span>{/if}
    </div>

    {#if info.last}
      <div class="last-card">
        <span class="lbl">LAST NIGHT</span>
        {#if info.last.winner}
          <span class="last-row">
            <Avatar name={info.last.winner.displayName} id={info.last.winner.id} avatar={info.last.winner.avatar} size={22} profile />
            <b>{info.last.winner.displayName}</b> took {info.last.paid.toLocaleString()} <Coin size={12} />
            from a {info.last.pot.toLocaleString()}-silver pot ({info.last.day})
          </span>
        {:else if info.last.pot > 0}
          <!-- A winner-less row with a pot is a VOID night: fewer than two
               players, so nobody drew and everyone got their stake back. -->
          <span class="last-row muted">
            {info.last.day} was void — only one player, so the stakes went back
            and the pot rolled into tonight.
          </span>
        {:else}
          <span class="last-row muted">No draw yet — be the first pot.</span>
        {/if}
      </div>
    {/if}

    <div class="bal"><Coin size={14} /> {wallet.coins.toLocaleString()} silver on hand</div>
  {/if}
</div>

<style>
  .lotto {
    min-height: 100%;
    padding: 54px 20px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.72)),
      var(--felt) center / cover;
    color: #f2ead8;
  }
  .head { text-align: center; }
  h1 {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 1.6rem;
    letter-spacing: 0.18em;
    color: #eab348;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
  }
  .sub { font-size: 0.78rem; color: #cdbf9f; }
  .muted { color: #cdbf9f; }

  .pot-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 22px 44px;
    border-radius: 18px;
    background: rgba(10, 30, 18, 0.78);
    border: 1px solid rgba(234, 179, 72, 0.45);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 30px rgba(234, 179, 72, 0.12);
  }
  .pot-label { font-size: 0.66rem; letter-spacing: 0.26em; color: #cdbf9f; font-weight: 800; }
  .pot {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 2.4rem;
    font-weight: 900;
    color: #ffd97a;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 18px rgba(234, 179, 72, 0.4);
  }
  .pot-sub { font-size: 0.8rem; color: #cdbf9f; }
  .pot-sub b { color: #eab348; }
  .pot-boost { font-size: 0.76rem; color: #ffd97a; }

  .won-banner {
    padding: 8px 18px;
    border-radius: 999px;
    background: rgba(234, 179, 72, 0.16);
    border: 1px solid rgba(234, 179, 72, 0.5);
    font-size: 0.86rem;
  }

  .buy-card,
  .last-card {
    width: min(460px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
    border-radius: 14px;
    background: rgba(10, 30, 18, 0.72);
    border: 1px solid rgba(234, 179, 72, 0.3);
  }
  .lbl { font-size: 0.68rem; letter-spacing: 0.18em; color: #cdbf9f; font-weight: 800; }
  .buy-row { display: flex; align-items: center; gap: 10px; }
  .buy {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 10px 14px;
    border-radius: 10px;
    border: none;
    background: #eab348;
    color: #241505;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .buy:hover:not(:disabled) { filter: brightness(1.07); }
  .buy:disabled { opacity: 0.45; cursor: default; }
  .gotone { font-size: 0.9rem; font-weight: 700; color: #ffd97a; }
  .hint { font-size: 0.72rem; color: rgba(240, 230, 210, 0.5); }
  .err { color: #ff8a80; font-size: 0.8rem; font-weight: 600; }
  .last-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    flex-wrap: wrap;
  }
  .bal {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 700;
    color: #fbe9b8;
  }
</style>
