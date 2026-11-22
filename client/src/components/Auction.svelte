<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Auction } from "../lib/api";
  import {
    auction, loadAuctions, createAuction, createRelicAuction, bidAuction, cancelAuction,
  } from "../lib/auction.svelte";
  import { emoji } from "../lib/emoji.svelte";
  import { groupByTier } from "../lib/tiers";
  import { wallet } from "../lib/wallet.svelte";
  import { session } from "../lib/session.svelte";
  import { relicName, relicImg } from "../backrooms/reliccatalog";
  import Coin from "./Coin.svelte";

  const TIER_COLOR: Record<string, string> = {
    common: "#7cae5f", rare: "#9d63d2", legendary: "#f39620", mythic: "#ff5db1", talisman: "#42c1c4",
    relic: "#e8a25c",
  };

  // A lot is EITHER an emoji or a backrooms RELIC — relics reach silver only
  // through this room (Voss pays Research Credits, never coins), so the whole
  // view reads its lot through these three helpers instead of a.emoji.
  const lotImg = (a: Auction): string =>
    a.relicSlug ? (relicImg(a.relicSlug) ?? "") : `/emoji/${a.emoji?.file ?? ""}`;
  const lotName = (a: Auction): string =>
    a.relicSlug ? relicName(a.relicSlug) : (a.emoji?.name ?? "lot");
  const lotTier = (a: Auction): string => (a.relicSlug ? "relic" : (a.emoji?.tier ?? ""));
  const DURATIONS = [
    { hours: 1, label: "1 hour" },
    { hours: 6, label: "6 hours" },
    { hours: 24, label: "24 hours" },
    { hours: 72, label: "3 days" },
    { hours: 168, label: "7 days" },
  ];

  const me = $derived(session.user?.id);

  // --- listing composer ---
  let lotKind = $state<"emoji" | "relic">("emoji");
  let pick = $state<string>(""); // selected owned emoji code
  let relicPick = $state<number | null>(null); // selected locker row id
  let startPrice = $state(50);
  let hours = $state(6);
  let listBusy = $state(false);
  let listErr = $state("");

  const pickEmoji = $derived(emoji.owned.find((e) => e.code === pick) ?? null);

  // My DUPLICATE relics, straight from the backrooms locker. Every relic locker
  // row IS a duplicate (the first of a kind unlocks the collection entry and
  // creates no row), so nothing here can cost me a trophy.
  let relicDupes = $state<{ id: number; slug: string }[]>([]);
  let relicsLoaded = $state(false);
  async function loadRelicDupes() {
    try {
      const mine = await api.backroomsMe();
      relicDupes = mine.items
        .filter((i) => i.kind === "relic" && i.color)
        .map((i) => ({ id: i.id, slug: i.color as string }));
    } catch {
      relicDupes = []; // backrooms offline — the emoji side still works
    }
    relicsLoaded = true;
  }
  $effect(() => {
    if (lotKind === "relic" && !relicsLoaded) void loadRelicDupes();
  });

  const canList = $derived(lotKind === "emoji" ? !!pick : relicPick != null);

  async function list() {
    if (!canList || listBusy) return;
    listErr = "";
    if (!Number.isInteger(startPrice) || startPrice < 1) {
      listErr = "Start price must be a whole number ≥ 1.";
      return;
    }
    listBusy = true;
    const r =
      lotKind === "relic"
        ? await createRelicAuction(relicPick!, startPrice, hours)
        : await createAuction(pick, startPrice, hours);
    listBusy = false;
    if (r.ok) {
      pick = "";
      relicPick = null;
      if (lotKind === "relic") await loadRelicDupes(); // the row left for escrow
    } else {
      listErr = errText(r.error);
    }
  }

  // --- bidding ---
  let bidInputs = $state<Record<number, string>>({});
  let bidBusy = $state<number | null>(null);
  let bidErr = $state<Record<number, string>>({});

  function effectiveBid(a: Auction): number {
    const raw = bidInputs[a.id];
    if (raw === undefined || raw === "") return a.minNextBid;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.floor(n) : a.minNextBid;
  }

  async function bid(a: Auction) {
    if (bidBusy != null) return;
    const amount = effectiveBid(a);
    bidErr[a.id] = "";
    if (amount < a.minNextBid) {
      bidErr[a.id] = `Bid at least ${a.minNextBid.toLocaleString()}.`;
      return;
    }
    if (amount > wallet.coins) {
      bidErr[a.id] = "Not enough silver.";
      return;
    }
    bidBusy = a.id;
    const r = await bidAuction(a.id, amount);
    bidBusy = null;
    if (r.ok) bidInputs[a.id] = "";
    else bidErr[a.id] = errText(r.error);
  }

  async function pull(a: Auction) {
    if (bidBusy != null) return;
    bidBusy = a.id;
    const r = await cancelAuction(a.id);
    bidBusy = null;
    if (!r.ok) bidErr[a.id] = errText(r.error);
  }

  function errText(code?: string): string {
    switch (code) {
      case "insufficient": return "Not enough silver.";
      case "too_low": return "Someone outbid you — raise your bid.";
      case "already_owned": return "You already own this emoji.";
      case "self_bid": return "You can’t bid on your own listing.";
      case "ended": case "not_open": return "This auction just closed.";
      case "has_bids": return "Can’t cancel — it already has bids.";
      case "not_owned": return "That’s no longer in your inventory.";
      case "not_a_relic": return "That locker slot isn’t a relic.";
      case "in_arrears": return "The goblins have frozen your assets — no bidding or listing while you owe them.";
      default: return "Something went wrong.";
    }
  }

  // --- countdown ticker ---
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  function timeLeft(endsAt: number): string {
    const s = Math.max(0, Math.floor((endsAt - now) / 1000));
    if (s <= 0) return "ending…";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`; // week-long listings read as days
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
    return `${sec}s`;
  }

  onMount(loadAuctions);
</script>

<div class="auction">
  <header class="head">
    <div>
      <h1>Auction House</h1>
      <p>List an emoji — or a relic hauled out of the Backrooms — and let the silver bids roll in. 5% of each sale seeds the nightly lottery pot.</p>
    </div>
    <span class="bal"><Coin size={16} /> {wallet.coins.toLocaleString()} silver</span>
  </header>

  <!-- Listing composer -->
  <section class="compose">
    <div class="compose-head">
      <span>List a lot</span>
      <span class="kinds">
        <button class="kind" class:on={lotKind === "emoji"} onclick={() => (lotKind = "emoji")}>EMOJI</button>
        <button class="kind" class:on={lotKind === "relic"} onclick={() => (lotKind = "relic")}>RELICS</button>
      </span>
    </div>

    {#if lotKind === "emoji"}
      {#if emoji.owned.length === 0}
        <p class="empty">You don’t own any emoji yet — win some on the Wheel first.</p>
      {:else}
        <div class="picker">
          {#each groupByTier(emoji.owned) as g (g.tier)}
            <div class="tier-row" style="--tier:{TIER_COLOR[g.tier] ?? 'var(--line)'}">
              <div class="tier-head">{g.tier}<span class="tn">{g.items.length}</span></div>
              <div class="p-grid">
                {#each g.items as e (e.code)}
                  <button
                    class="p-cell"
                    class:sel={pick === e.code}
                    style="--tc:{TIER_COLOR[e.tier] ?? 'var(--line)'}"
                    title={`${e.name} · ${e.tier}`}
                    onclick={() => (pick = pick === e.code ? "" : e.code)}
                  >
                    <img src={`/emoji/${e.file}`} alt={e.name} />
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if !relicsLoaded}
      <p class="empty">Opening your locker…</p>
    {:else if relicDupes.length === 0}
      <p class="empty">
        No spare relics. The first of any relic you carry out <b>unlocks</b> in your
        collection and stays yours — only a second copy can be sold, and this is the
        only place a relic ever becomes silver.
      </p>
    {:else}
      <div class="picker">
        {#each relicDupes as r (r.id)}
          <button
            class="p-cell relic"
            class:sel={relicPick === r.id}
            style="--tc:{TIER_COLOR.relic}"
            title={relicName(r.slug)}
            onclick={() => (relicPick = relicPick === r.id ? null : r.id)}
          >
            <img src={relicImg(r.slug) ?? ""} alt={relicName(r.slug)} />
          </button>
        {/each}
      </div>
    {/if}

    {#if (lotKind === "emoji" && emoji.owned.length) || (lotKind === "relic" && relicDupes.length)}
      <div class="compose-row">
        <div class="sel-info">
          {#if lotKind === "emoji" && pickEmoji}
            <img class="sel-img" src={`/emoji/${pickEmoji.file}`} alt={pickEmoji.name} />
            <span><b>{pickEmoji.name}</b> <span class="tier" style="color:{TIER_COLOR[pickEmoji.tier]}">{pickEmoji.tier}</span></span>
          {:else if lotKind === "relic" && relicPick != null}
            {@const slug = relicDupes.find((r) => r.id === relicPick)?.slug ?? ""}
            <img class="sel-img" src={relicImg(slug) ?? ""} alt={relicName(slug)} />
            <span><b>{relicName(slug)}</b> <span class="tier" style="color:{TIER_COLOR.relic}">relic</span></span>
          {:else}
            <span class="hint">Pick {lotKind === "relic" ? "a spare relic" : "one of your emoji"} above.</span>
          {/if}
        </div>
        <label class="fld">Start
          <span class="price-in"><input type="number" min="1" bind:value={startPrice} /><Coin size={13} /></span>
        </label>
        <label class="fld">For
          <select bind:value={hours}>
            {#each DURATIONS as d}<option value={d.hours}>{d.label}</option>{/each}
          </select>
        </label>
        <button class="list-btn" onclick={list} disabled={!canList || listBusy}>
          {listBusy ? "Listing…" : "List it"}
        </button>
      </div>
      {#if listErr}<div class="err">{listErr}</div>{/if}
      <p class="fine">
        Listing holds the lot in escrow until the auction ends. No bids → it comes back
        to you; you can cancel a bid-free listing anytime.
        {#if lotKind === "relic"}
          A relic nobody has recovered before <b>unlocks in the winner's collection</b>;
          otherwise it lands in their locker as a spare.
        {/if}
      </p>
    {/if}
  </section>

  <!-- Live auctions -->
  <section class="live">
    <div class="sec-head">Live auctions <span class="count">{auction.open.length}</span></div>
    {#if auction.open.length === 0}
      <p class="empty">No live auctions. Be the first to list something.</p>
    {:else}
      <div class="grid">
        {#each auction.open as a (a.id)}
          {@const mine = a.seller.id === me}
          {@const iOwn = !a.relicSlug && emoji.owned.some((e) => e.code === a.emoji?.code)}
          {@const iLead = a.highBidder?.id === me}
          <div class="lot" class:mine>
            <div class="lot-top">
              <img class="lot-img" src={lotImg(a)} alt={lotName(a)} />
              <div class="lot-meta">
                <div class="lot-name">
                  {lotName(a)}
                  <span class="tier" style="color:{TIER_COLOR[lotTier(a)] ?? 'var(--ink-soft)'}">{lotTier(a)}</span>
                </div>
                <div class="lot-by">{mine ? "Your listing" : `by ${a.seller.displayName}`}</div>
                <div class="lot-clock">⏳ {timeLeft(a.endsAt)}</div>
              </div>
            </div>

            <div class="lot-bid">
              {#if a.currentBid == null}
                <span class="cur">Start <b>{a.startPrice.toLocaleString()}</b><Coin size={13} /></span>
                <span class="who">no bids yet</span>
              {:else}
                <span class="cur">Bid <b>{a.currentBid.toLocaleString()}</b><Coin size={13} /></span>
                <span class="who" class:lead={iLead}>
                  {iLead ? "you’re winning" : `high: ${a.highBidder?.displayName ?? "—"}`}
                </span>
              {/if}
            </div>

            {#if mine}
              <button class="act cancel" onclick={() => pull(a)} disabled={bidBusy === a.id || a.bidCount > 0}>
                {a.bidCount > 0 ? "Has bids — locked" : "Cancel listing"}
              </button>
            {:else if iOwn}
              <div class="act owned">You already own this</div>
            {:else}
              <div class="bidrow">
                <div class="price-in bid-in">
                  <input
                    type="number"
                    min={a.minNextBid}
                    placeholder={String(a.minNextBid)}
                    bind:value={bidInputs[a.id]}
                  />
                  <Coin size={13} />
                </div>
                <button class="act bid" onclick={() => bid(a)} disabled={bidBusy === a.id}>
                  {bidBusy === a.id ? "…" : iLead ? "Raise" : "Bid"}
                </button>
              </div>
              <div class="min">min next {a.minNextBid.toLocaleString()}</div>
            {/if}
            {#if bidErr[a.id]}<div class="err small">{bidErr[a.id]}</div>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Recently closed -->
  {#if auction.recent.length}
    <section class="recent">
      <div class="sec-head">Recently closed</div>
      <ul class="rlist">
        {#each auction.recent as a (a.id)}
          <li>
            <img src={lotImg(a)} alt={lotName(a)} />
            <span class="r-name">{lotName(a)}</span>
            {#if a.status === "settled"}
              <span class="r-out sold">{a.highBidder?.displayName} won it for {a.currentBid?.toLocaleString()}<Coin size={12} /> from {a.seller.displayName}</span>
            {:else if a.status === "expired"}
              <span class="r-out">no bids — returned to {a.seller.displayName}</span>
            {:else}
              <span class="r-out">listing cancelled</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  /* GROUPED BY RARITY (Josh, Sep 2026: "cleanly organize the emojis by
     tier"). Same treatment as the Shop's sell grid and the Forge: a heading
     and a slight wash in the tier's own colour, rarest group first, so the
     scarce things you are actually deciding about are at the top of the box
     instead of buried under four hundred commons. */
  .tier-row {
    margin-bottom: 10px;
    padding: 8px 10px 10px;
    border-radius: 10px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--tier) 10%, transparent), transparent 85%);
    border: 1px solid color-mix(in srgb, var(--tier) 24%, var(--line));
  }
  .tier-row:last-child {
    margin-bottom: 0;
  }
  .tier-head {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 6px;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--tier) 72%, var(--ink));
  }
  .tier-head .tn {
    color: var(--ink-dim);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  /* The cells moved into a grid PER TIER, so the picker itself is now just
     the scrolling column that holds those groups. */
  .p-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 6px;
  }

  .auction {
    height: 100%;
    overflow-y: auto;
    padding: 24px clamp(16px, 4vw, 40px) 48px;
    background:
      radial-gradient(1000px 460px at 50% -10%, rgba(217, 138, 79, 0.1), transparent 70%),
      var(--bg);
  }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    max-width: 960px;
    margin: 6px auto 20px;
  }
  .head h1 {
    margin: 0 0 4px;
    font-size: clamp(24px, 4vw, 34px);
    font-weight: 800;
  }
  .head p {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .bal {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 13px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  section {
    max-width: 960px;
    margin: 0 auto 22px;
  }
  .compose {
    padding: 16px 18px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  .compose-head,
  .sec-head {
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 0.74rem;
    color: var(--ink-soft);
    margin-bottom: 12px;
  }
  /* EMOJI / RELICS — which kind of lot you're listing. */
  .compose-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .kinds {
    display: inline-flex;
    gap: 4px;
    margin-left: auto;
  }
  .kind {
    padding: 3px 11px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-dim);
    font: inherit;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    cursor: pointer;
  }
  .kind:hover {
    color: var(--ink);
  }
  .kind.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--ink);
  }
  /* Relic art is photographic, not a flat glyph — fill the cell. */
  .p-cell.relic img {
    object-fit: cover;
    border-radius: 4px;
  }
  .sec-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    color: var(--accent-ink);
    background: var(--accent);
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 0.72rem;
  }
  .picker {
    display: block;
    gap: 6px;
    max-height: 180px;
    overflow-y: auto;
    padding: 8px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    margin-bottom: 12px;
  }
  .p-cell {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    padding: 4px;
    background: var(--panel-2);
    border: 1.5px solid transparent;
    border-radius: 8px;
    cursor: pointer;
  }
  .p-cell:hover {
    border-color: var(--tc);
  }
  .p-cell.sel {
    border-color: var(--tc);
    box-shadow: 0 0 0 1px var(--tc);
    background: color-mix(in srgb, var(--tc) 16%, var(--panel-2));
  }
  .p-cell img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .compose-row {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 12px;
  }
  .sel-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 160px;
    font-size: 0.9rem;
  }
  .sel-img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
  .hint {
    color: var(--ink-dim);
  }
  .tier {
    text-transform: uppercase;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    margin-left: 4px;
  }
  .fld {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
  }
  .price-in {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 9px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .price-in input {
    width: 72px;
    padding: 7px 0;
    border: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
  .price-in input:focus {
    outline: none;
  }
  select {
    padding: 7px 9px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
  }
  .list-btn,
  .act {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .list-btn:disabled {
    background: var(--panel-2);
    color: var(--ink-dim);
    cursor: default;
  }
  .fine {
    margin: 12px 0 0;
    font-size: 0.75rem;
    color: var(--ink-dim);
    line-height: 1.5;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 14px;
  }
  .lot {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .lot.mine {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  }
  .lot-top {
    display: flex;
    gap: 12px;
  }
  .lot-img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    flex: none;
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45));
  }
  .lot-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lot-name {
    font-weight: 700;
    font-size: 0.95rem;
  }
  .lot-by {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .lot-clock {
    font-size: 0.78rem;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
  }
  .lot-bid {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: var(--bg);
    border-radius: 8px;
  }
  .cur {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.9rem;
  }
  .cur b {
    font-variant-numeric: tabular-nums;
  }
  .who {
    font-size: 0.74rem;
    color: var(--ink-dim);
  }
  .who.lead {
    color: var(--accent);
    font-weight: 700;
  }
  .bidrow {
    display: flex;
    gap: 8px;
  }
  .bid-in {
    flex: 1;
  }
  .bid-in input {
    width: 100%;
  }
  .act.bid {
    flex: none;
  }
  .act.cancel {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .act.cancel:disabled {
    color: var(--ink-dim);
    cursor: default;
  }
  .act.owned {
    text-align: center;
    background: var(--panel-2);
    color: var(--ink-dim);
    font-weight: 600;
    cursor: default;
  }
  .min {
    font-size: 0.72rem;
    color: var(--ink-dim);
    text-align: right;
  }
  .err {
    margin-top: 8px;
    color: #e2705f;
    font-size: 0.82rem;
  }
  .err.small {
    font-size: 0.76rem;
    margin-top: 2px;
  }
  .empty {
    color: var(--ink-dim);
    font-size: 0.9rem;
    margin: 4px 0;
  }
  .rlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rlist li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    font-size: 0.82rem;
    color: var(--ink-soft);
    border-bottom: 1px solid var(--line);
  }
  .rlist img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    flex: none;
  }
  .r-name {
    font-weight: 700;
    color: var(--ink);
  }
  .r-out {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--ink-dim);
  }
  .r-out.sold {
    color: var(--ink-soft);
  }
</style>
