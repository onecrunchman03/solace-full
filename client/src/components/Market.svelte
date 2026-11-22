<script lang="ts">
  import { nav, type MarketTab } from "../lib/nav.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { trade } from "../lib/trade.svelte";
  import Shop from "./Shop.svelte";
  import Trade from "./Trade.svelte";
  import Auction from "./Auction.svelte";
  import Forge from "./Forge.svelte";
  import Wallet from "./Wallet.svelte";
  import Coin from "./Coin.svelte";
  import felt from "../assets/casino-felt.webp";

  const TABS: { key: MarketTab; name: string; sub: string }[] = [
    { key: "shop", name: "The Trader", sub: "sell & buy" },
    { key: "trade", name: "Direct Trade", sub: "player swaps" },
    { key: "auction", name: "Auction House", sub: "silver bids" },
    { key: "forge", name: "The Forge", sub: "melt & upgrade" },
    { key: "wallet", name: "Wallet", sub: "send silver" },
  ];

  const incoming = $derived(trade.incoming.length);
</script>

<div class="market" style="--felt: url({felt})">
  <header class="head">
    <div class="marquee-line">✦ &nbsp;EVERYTHING HAS A PRICE&nbsp; ✦</div>
    <h1>Market</h1>
    <span class="wallet-chip"><Coin size={16} /> {wallet.coins.toLocaleString()} silver</span>
  </header>

  <nav class="counters">
    {#each TABS as t (t.key)}
      <button
        class="counter"
        class:active={nav.marketTab === t.key}
        onclick={() => (nav.marketTab = t.key)}
      >
        <span class="c-name">
          {t.name}
          {#if t.key === "trade" && incoming > 0}<span class="pip">{incoming}</span>{/if}
        </span>
        <span class="c-sub">{t.sub}</span>
      </button>
    {/each}
  </nav>

  <div class="stall">
    {#if nav.marketTab === "shop"}
      <Shop />
    {:else if nav.marketTab === "trade"}
      <Trade />
    {:else if nav.marketTab === "forge"}
      <Forge />
    {:else if nav.marketTab === "wallet"}
      <Wallet />
    {:else}
      <Auction />
    {/if}
  </div>
</div>

<style>
  .market {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background:
      radial-gradient(1100px 520px at 50% 0%, rgba(255, 208, 120, 0.13), transparent 62%),
      radial-gradient(circle at 50% 42%, transparent 40%, rgba(0, 0, 0, 0.68) 100%),
      linear-gradient(rgba(6, 14, 9, 0.52), rgba(4, 10, 7, 0.66)),
      var(--felt) center / cover no-repeat fixed,
      #0a1810;
  }
  .head {
    text-align: center;
    padding: clamp(20px, 4vh, 40px) 20px 6px;
    flex: none;
  }
  .marquee-line {
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.32em;
    color: rgba(255, 217, 143, 0.6);
    margin-bottom: 8px;
    text-shadow: 0 0 12px rgba(255, 200, 100, 0.35);
  }
  h1 {
    margin: 0 0 8px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(26px, 4.6vw, 38px);
    letter-spacing: 0.045em;
    background: linear-gradient(#fff0c4, #eab348 48%, #c8862c 78%, #9a641c);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.6));
  }
  .wallet-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 13px;
    background: rgba(12, 20, 15, 0.78);
    border: 1px solid rgba(230, 190, 120, 0.32);
    border-radius: 999px;
    color: #f3e2bf;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
  }

  .counters {
    flex: none;
    display: flex;
    justify-content: center;
    gap: 10px;
    padding: 12px 20px 0;
  }
  .counter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 148px;
    padding: 9px 20px 8px;
    background: rgba(12, 20, 15, 0.75);
    border: 1px solid rgba(230, 190, 120, 0.25);
    border-bottom: none;
    border-radius: 14px 14px 0 0;
    color: rgba(255, 240, 220, 0.6);
    font: inherit;
    cursor: pointer;
    backdrop-filter: blur(2px);
    transition: color 0.12s ease, background 0.12s ease;
  }
  .counter:hover {
    color: #f3dfa8;
  }
  .counter.active {
    background: rgba(18, 30, 22, 0.92);
    border-color: rgba(255, 217, 143, 0.55);
    color: #f3dfa8;
    box-shadow: 0 -6px 22px rgba(240, 190, 90, 0.12);
  }
  .c-name {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: Georgia, serif;
    font-weight: 700;
    font-size: 0.98rem;
    letter-spacing: 0.02em;
  }
  .c-sub {
    font-size: 0.66rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    opacity: 0.65;
  }
  .pip {
    min-width: 17px;
    height: 17px;
    padding: 0 5px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: linear-gradient(#ffe6a8, #eab348 55%, #cf9330);
    color: #2c1c05;
    font-size: 0.66rem;
    font-weight: 800;
  }

  .stall {
    flex: 1;
    min-height: 0;
    border-top: 1px solid rgba(255, 217, 143, 0.35);
    background: rgba(10, 18, 13, 0.55);
    overflow: hidden;
    /* Casino reskin for the hosted counters: the Shop/Trade/Auction views
       style themselves with the app's theme tokens, and custom properties
       inherit — so overriding the tokens HERE re-dresses all three in
       dark-green felt + gold without touching their components. The Market
       (like every casino floor view) is deliberately theme-independent. */
    --bg: transparent;
    --panel: rgba(12, 20, 15, 0.82);
    --panel-2: rgba(20, 32, 24, 0.9);
    --line: rgba(230, 190, 120, 0.22);
    --line-2: rgba(230, 190, 120, 0.32);
    --ink: #ece4d4;
    --ink-soft: rgba(255, 240, 220, 0.62);
    --ink-dim: rgba(255, 240, 220, 0.4);
    --accent: #eab348;
    --accent-soft: #cf9330;
    --accent-ink: #2c1c05;
    --accent-glow: rgba(240, 190, 90, 0.45);
    --ok: #9bc47f;
    --danger: #e0776a;
  }
  /* The hosted views own their scrolling; make sure they fill the stall. */
  .stall > :global(*) {
    height: 100%;
  }

  /* Phones: three fixed-width counters can't fit side by side — stack them
     as full-width rows above the stall instead of clipping off both edges. */
  /* THE MARKET IS ONE PAGE ON A PHONE — THE HEAD SCROLLS AWAY (Josh, Sep
     2026: "can we not lock the top selection portion on the market so users
     can see more with their screen. It takes up like 50% percent of the
     screen and if users need to go to a new section of the market they can
     just scroll up").

     He is right, and it is the better fix. The Market was a fixed header and
     counters above a `.stall` that scrolled on its own, so that 331px of
     marquee, title, purse and four counters was on screen PERMANENTLY —
     you read the whole shop through what was left. Shrinking the counters
     (2x2, below) helps; not pinning them at all is what actually gives the
     screen back, and the way to change counter is a flick upwards.

     So on a phone this element is the scroll pane and everything inside it
     is in one flow. The hosted counters each set `height: 100%;
     overflow-y: auto` on their own root — correct when they are a pane, and
     exactly wrong when they are a section of a page — so they are told to
     size to their content instead. `!important` because those rules live in
     each component's own scoped sheet and would otherwise win or lose by
     stylesheet order, which is not a thing to leave to chance. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    .market {
      display: block;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .stall {
      overflow: visible;
      min-height: 0;
    }
    .stall > :global(*) {
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }
  }

  /* TWO BY TWO, NOT FOUR DOWN (Josh, Sep 2026: the shop looks "a little too
     condensed"). Four full-width counters cost 204px on their own. Stacked
     they were also the bulk of the pinned header above; now that the header
     scrolls away this is about the counters being legible at a glance
     rather than about buying back permanent space. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    .counters {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    /* five counters: the odd one out spans the row */
    .counter:last-child:nth-child(odd) {
      grid-column: 1 / -1;
      padding: 8px 12px 0;
    }
    .counter {
      min-width: 0;
      width: 100%;
      flex-direction: row;
      justify-content: center;
      flex-wrap: wrap;
      gap: 3px 6px;
      padding: 7px 8px;
      border-bottom: 1px solid rgba(230, 190, 120, 0.25);
      border-radius: 12px;
    }
    /* The header above them gives up its padding too, not its words. */
    .marquee-line {
      margin-bottom: 5px;
      letter-spacing: 0.18em;
    }
  }
</style>
