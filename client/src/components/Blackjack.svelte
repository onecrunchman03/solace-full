<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { session } from "../lib/session.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import {
    bj, loadBlackjack, joinTable, leaveTable, placeBet, act, mySeat, myLobbyIndex,
  } from "../lib/blackjack.svelte";
  import type { BjCard, BjLobby } from "../lib/api";
  import { playSfx } from "../lib/sfx";
  import { cardDeal } from "../lib/holdem-audio";
  import Coin from "./Coin.svelte";
  import { deckFace } from "../lib/emporium.svelte";
  import Avatar from "./Avatar.svelte";
  import felt from "../assets/casino-felt.webp";

  let now = $state(Date.now());
  let tick: ReturnType<typeof setInterval>;
  onMount(() => {
    void loadBlackjack();
    // 1s tick matches the whole-second countdown display.
    tick = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => {
    clearInterval(tick);
    // Walking off to another game (or any other view) gives up your seat —
    // nobody holds a table from the slots floor. Server rules keep it money-
    // safe: an unplayed bet refunds, a live mid-round hand stands and settles.
    const at = myLobbyIndex();
    if (at != null) void leaveTable(at);
  });

  const seatedAt = $derived.by(() => {
    bj.lobbies; // dep
    return myLobbyIndex();
  });
  const table = $derived(
    bj.viewing != null ? bj.lobbies.find((l) => l.index === bj.viewing) : undefined,
  );
  const me = $derived(table ? mySeat(table) : null);
  const myTurn = $derived(
    !!table && !!me && table.phase === "acting" && table.seats[table.activeSeat]?.user.id === session.user?.id,
  );

  function secondsLeft(l: BjLobby): number {
    return l.endsAt ? Math.max(0, Math.ceil((l.endsAt - now) / 1000)) : 0;
  }

  const RESULT_LABEL: Record<string, string> = {
    blackjack: "BLACKJACK!", win: "WIN", push: "PUSH", lose: "LOSE", bust: "BUST",
  };

  // Table sounds: real card deals as cards hit the felt, and my own verdicts.
  let prevCards = 0;
  let prevTableIdx = -1;
  let heardResultRound = -1;
  let heardBust = "";
  let heardShuffleRound = -1;
  $effect(() => {
    if (!table) { prevCards = 0; prevTableIdx = -1; return; }
    const cardCount =
      table.seats.reduce((n, s) => n + (s ? s.cards.length + (s.cards2?.length ?? 0) : 0), 0) +
      table.dealer.filter(Boolean).length;
    // Switching to a different table mid-round must not read as a deal —
    // rebase the counter instead of playing a spurious card swish.
    if (table.index !== prevTableIdx) {
      prevTableIdx = table.index;
      prevCards = table.phase === "betting" ? 0 : cardCount;
      return;
    }
    if (cardCount > prevCards && prevCards > 0) cardDeal(Math.min(cardCount - prevCards, 3));
    prevCards = table.phase === "betting" ? 0 : cardCount;

    // The cut card came out — a real riffle as the shuffle notice appears.
    if (table.shuffled && table.phase !== "betting" && table.round !== heardShuffleRound) {
      heardShuffleRound = table.round;
      playSfx("shuffle", 0.55);
    }

    // My hand's verdicts, once each.
    const bustKey = `${table.round}:${me?.result === "bust" ? 1 : 0}${me?.result2 === "bust" ? 1 : 0}`;
    if (me && (me.result === "bust" || me.result2 === "bust") && heardBust !== bustKey) {
      heardBust = bustKey;
      playSfx("bj-bust", 0.7);
    }
    if (table.phase === "settle" && me && table.round !== heardResultRound) {
      heardResultRound = table.round;
      if (me.result === "blackjack" || me.result2 === "blackjack") playSfx("bj-blackjack", 0.85);
      else if (me.payout + (me.payout2 ?? 0) > me.bet + (me.bet2 ?? 0)) playSfx("chip-cascade", 0.8);
    }
  });

  function chipPresets(l: BjLobby): number[] {
    const opts = [l.minBet, l.minBet * 2, l.minBet * 5, l.minBet * 10].filter((v) => v <= l.maxBet);
    if (!opts.includes(l.maxBet)) opts.push(l.maxBet);
    return [...new Set(opts)];
  }

  function occupied(l: BjLobby): number {
    return l.seats.filter(Boolean).length;
  }

  const red = (c: BjCard) => c.s === "♥" || c.s === "♦";

  function phaseLabel(l: BjLobby): string {
    if (l.phase === "betting") return l.endsAt ? `Bets close in ${secondsLeft(l)}s` : "Waiting for bets";
    if (l.phase === "acting") return "Playing";
    if (l.phase === "dealer") return "Dealer draws";
    return "Payouts";
  }
</script>

<div class="bjroot" style="--felt: url({felt})">
  {#if bj.loading}
    <p class="state">Shuffling in…</p>
  {:else if !table}
    <!-- ---- Table picker ---- -->
    <div class="picker">
      <header class="pick-head">
        <h1>Blackjack</h1>
        <p>Beat the dealer to 21. Blackjack pays 6:5 · dealer hits soft 17 · double on any two.</p>
        <span class="wallet-chip"><Coin size={18} /> {wallet.coins.toLocaleString()} silver</span>
      </header>
      <div class="tables">
        {#each bj.lobbies as l (l.index)}
          <div class="table-card">
            <div class="tc-felt">
              <span class="tc-arc"></span>
              <span class="tc-name">{l.name}</span>
              <span class="tc-stakes"><Coin size={13} /> {l.minBet}–{l.maxBet}</span>
            </div>
            <div class="tc-meta">
              <span class="tc-seats" class:full={occupied(l) >= l.seats.length}>
                {occupied(l)}/{l.seats.length} seated
              </span>
              <span class="tc-phase">{l.phase === "betting" && !l.endsAt && occupied(l) === 0 ? "Open" : phaseLabel(l)}</span>
            </div>
            {#if seatedAt === l.index}
              <button class="tc-join rejoin" onclick={() => (bj.viewing = l.index)}>Return to seat</button>
            {:else}
              <button
                class="tc-join"
                disabled={occupied(l) >= l.seats.length || seatedAt != null}
                onclick={() => joinTable(l.index)}
              >
                {occupied(l) >= l.seats.length ? "Table full" : seatedAt != null ? "Seated elsewhere" : "Take a seat"}
              </button>
            {/if}
            <button class="tc-watch" onclick={() => (bj.viewing = l.index)}>Watch</button>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- ---- The table ---- -->
    <div class="room">
      <div class="room-top">
        <button class="ghost-btn" onclick={() => (bj.viewing = null)}>← Tables</button>
        <div class="room-name">{table.name} <span class="stakes"><Coin size={12} /> {table.minBet}–{table.maxBet}</span></div>
        <!-- The six-deck shoe runs down across rounds; the cut card reshuffles it. -->
        <div class="shoe" title="Six-deck shoe — the dealer reshuffles at the cut card">
          <span class="shoe-card"></span>
          <span class="shoe-meter"><span class="shoe-fill" style="width:{Math.round(((table.shoeLeft || 0) / (table.shoeSize || 312)) * 100)}%"></span><span class="shoe-cut"></span></span>
          <span class="shoe-n">{table.shoeLeft ?? "—"}</span>
        </div>
        <span class="wallet-chip small"><Coin size={15} /> {wallet.coins.toLocaleString()}</span>
      </div>
      {#if table.shuffled && table.phase !== "betting"}
        <div class="shuffle-note">🔀 The cut card came out — fresh six-deck shoe this round.</div>
      {/if}

      <div class="table-oval">
        <!-- Dealer -->
        <div class="dealer">
          <div class="dealer-tag">DEALER</div>
          <div class="cards">
            {#each table.dealer as c, i (i)}
              {#if c}
                <div class="card" class:red={red(c)} style="--n:{i}">
                  <span class="rank">{c.r}</span><span class="suit">{c.s}</span>
                  <span class="pip">{c.s}</span>
                </div>
              {:else}
                <div class="card back {session.user?.cosmetics?.cardback ?? ''}" style="--n:{i}"></div>
              {/if}
            {/each}
            {#if table.dealer.length === 0}
              <div class="card slot"></div><div class="card slot"></div>
            {/if}
          </div>
          {#if table.dealer.length}
            <span class="value-chip">{table.dealerValue}{table.dealer.some((c) => !c) ? "+" : ""}</span>
          {/if}
        </div>

        <div class="table-script">BLACKJACK PAYS 6 TO 5 — DEALER HITS SOFT 17 — SPLIT ANY PAIR</div>

        {#if table.endsAt}
          <div class="phase-note">{phaseLabel(table)}</div>
        {/if}

        <!-- Seats -->
        <div class="seats">
          {#each table.seats as s, i (i)}
            <div
              class="seat"
              class:active={table.phase === "acting" && table.activeSeat === i}
              class:empty={!s}
            >
              {#if s}
                <div
                  class="hand-box"
                  class:hand-live={s.split && table.phase === "acting" && table.activeSeat === i && s.activeHand === 0}
                >
                  <div class="cards small">
                    {#each s.cards as c, j (j)}
                      <div class="card {deckFace(s.user.cosmetics?.cardback)}" class:red={red(c)} style="--n:{j}">
                        <span class="rank">{c.r}</span><span class="suit">{c.s}</span>
                        <span class="pip">{c.s}</span>
                      </div>
                    {/each}
                  </div>
                  {#if s.cards.length}
                    <span class="value-chip" class:bust={s.result === "bust"}>{s.value}</span>
                  {/if}
                  {#if s.result && (table.phase === "settle" || s.result === "bust")}
                    <span class="result {s.result}">{RESULT_LABEL[s.result]}{#if s.payout > s.bet}&nbsp;+{s.payout - s.bet}{/if}</span>
                  {/if}
                </div>
                {#if s.split}
                  <div
                    class="hand-box hand2"
                    class:hand-live={table.phase === "acting" && table.activeSeat === i && s.activeHand === 1}
                  >
                    <div class="cards small">
                      {#each s.cards2 as c, j (j)}
                        <div class="card {deckFace(s.user.cosmetics?.cardback)}" class:red={red(c)} style="--n:{j}">
                          <span class="rank">{c.r}</span><span class="suit">{c.s}</span>
                          <span class="pip">{c.s}</span>
                        </div>
                      {/each}
                    </div>
                    {#if s.cards2.length}
                      <span class="value-chip" class:bust={s.result2 === "bust"}>{s.value2}</span>
                    {/if}
                    {#if s.result2 && (table.phase === "settle" || s.result2 === "bust")}
                      <span class="result {s.result2}">{RESULT_LABEL[s.result2]}{#if s.payout2 > s.bet2}&nbsp;+{s.payout2 - s.bet2}{/if}</span>
                    {/if}
                  </div>
                {/if}
                <div class="who">
                  <Avatar name={s.user.displayName} id={s.user.id} avatar={s.user.avatar} size={28} profile />
                  <span class="pname" class:left={s.left}>{s.user.displayName}</span>
                  {#if s.bet > 0}
                    <span class="bet-chip">
                      <Coin size={12} /> {s.bet}{s.doubled ? " ×2" : ""}{s.split ? ` + ${s.bet2}${s.doubled2 ? " ×2" : ""}` : ""}
                    </span>
                  {/if}
                </div>
              {:else}
                <span class="empty-label">empty seat</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Action bar -->
      <div class="bar">
        {#if bj.error}
          <span class="err">{bj.error}</span>
        {:else if !me}
          <button
            class="chip-btn join"
            disabled={occupied(table) >= table.seats.length || seatedAt != null}
            onclick={() => joinTable(table.index)}
          >
            {occupied(table) >= table.seats.length ? "Table full" : "Take a seat"}
          </button>
          <span class="hint">You're watching this table.</span>
        {:else if table.phase === "betting"}
          {#if me.bet > 0}
            <span class="hint">Bet placed — <b>{me.bet}</b> silver. {table.endsAt ? `Dealing in ${secondsLeft(table)}s…` : "Waiting for the table…"}</span>
          {:else}
            <span class="hint">Place your bet:</span>
            {#each chipPresets(table) as v (v)}
              <button class="chip-btn" disabled={wallet.coins < v} onclick={() => placeBet(table.index, v)}>
                <Coin size={14} /> {v}
              </button>
            {/each}
          {/if}
          <button class="ghost-btn leave" onclick={() => leaveTable(table.index)}>Leave table</button>
        {:else if myTurn}
          <span class="turn-clock">{secondsLeft(table)}s</span>
          {#if me.split}<span class="hint">Hand {me.activeHand + 1} of 2:</span>{/if}
          <button class="chip-btn act" onclick={() => act(table.index, "hit")}>Hit</button>
          <button class="chip-btn act" onclick={() => act(table.index, "stand")}>Stand</button>
          {#if (me.activeHand === 1 ? me.cards2.length : me.cards.length) === 2}
            <button
              class="chip-btn act"
              disabled={wallet.coins < (me.activeHand === 1 ? me.bet2 : me.bet)}
              onclick={() => act(table.index, "double")}
            >
              Double
            </button>
          {/if}
          {#if me.canSplit}
            <button class="chip-btn act" disabled={wallet.coins < me.bet} onclick={() => act(table.index, "split")}>
              Split
            </button>
          {/if}
        {:else if me.bet === 0}
          <span class="hint">Sitting out this round — bet when the table opens.</span>
          <button class="ghost-btn leave" onclick={() => leaveTable(table.index)}>Leave table</button>
        {:else}
          <span class="hint">
            {table.phase === "settle" ? "Round over — next one starts shortly." : "Waiting for the other hands…"}
          </span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .bjroot {
    position: relative;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    background:
      radial-gradient(1100px 520px at 50% 0%, rgba(255, 208, 120, 0.12), transparent 62%),
      radial-gradient(circle at 50% 42%, transparent 38%, rgba(0, 0, 0, 0.7) 100%),
      linear-gradient(rgba(6, 14, 9, 0.5), rgba(4, 10, 7, 0.66)),
      var(--felt) center / cover no-repeat fixed,
      #0a1810;
  }
  .state {
    text-align: center;
    padding-top: 18vh;
    color: rgba(255, 240, 220, 0.6);
  }

  /* ---- Picker ---- */
  .picker {
    max-width: 900px;
    margin: 0 auto;
    padding: clamp(40px, 8vh, 80px) 24px 48px;
  }
  .pick-head {
    text-align: center;
    margin-bottom: 30px;
  }
  .pick-head h1 {
    margin: 0 0 6px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(30px, 5vw, 44px);
    letter-spacing: 0.04em;
    color: #f3dfa8;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
  }
  .pick-head p {
    margin: 0 0 12px;
    color: rgba(255, 240, 220, 0.65);
    font-size: 0.92rem;
  }
  .wallet-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 15px;
    background: rgba(12, 20, 15, 0.75);
    border: 1px solid rgba(230, 190, 120, 0.3);
    border-radius: 999px;
    color: #f3e2bf;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .wallet-chip.small {
    padding: 4px 11px;
    font-size: 0.85rem;
  }
  .tables {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 16px;
  }
  .table-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: rgba(12, 20, 15, 0.78);
    border: 1px solid rgba(230, 190, 120, 0.22);
    border-radius: 16px;
    backdrop-filter: blur(2px);
  }
  .tc-felt {
    position: relative;
    height: 86px;
    border-radius: 12px 12px 60px 60px;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.1), transparent 60%),
      radial-gradient(ellipse at 50% 30%, #1d6b40, #124a2b 70%, #0b331d);
    box-shadow: inset 0 0 0 3px rgba(230, 190, 120, 0.5), inset 0 6px 18px rgba(0, 0, 0, 0.4);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .tc-arc {
    position: absolute;
    inset: 12px 18px auto;
    height: 70px;
    border: 1.5px solid rgba(255, 240, 200, 0.35);
    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    border-bottom: none;
  }
  .tc-name {
    font-family: Georgia, serif;
    font-size: 1.02rem;
    color: #f3dfa8;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    z-index: 1;
  }
  .tc-stakes {
    position: absolute;
    bottom: 8px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 700;
    color: rgba(255, 240, 220, 0.75);
  }
  .tc-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.76rem;
    color: rgba(255, 240, 220, 0.6);
  }
  .tc-seats.full {
    color: #e0917a;
  }
  .tc-join {
    padding: 8px 12px;
    border-radius: 9px;
    border: none;
    background: linear-gradient(#ffe6a8, #eab348 45%, #c8862c);
    color: #3a1f06;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .tc-join:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .tc-join:disabled {
    opacity: 0.45;
    cursor: default;
    filter: grayscale(0.4);
  }
  .tc-join.rejoin {
    background: linear-gradient(#c8ecc8, #58b368 45%, #2e7d44);
    color: #06280f;
  }
  .tc-watch {
    background: none;
    border: none;
    color: rgba(255, 240, 220, 0.55);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .tc-watch:hover {
    color: #f3dfa8;
  }
  /* Touch: "Watch" is a bare text button and measured 17px tall — half the
     touch floor, sitting directly under "Take a seat", so a thumb aiming for
     one could easily land on the other. */
  @media (hover: none), (max-width: 760px) {
    .tc-watch {
      min-height: 44px;
      width: 100%;
      border-radius: 10px;
    }
    .tc-watch:active {
      background: rgba(255, 240, 220, 0.09);
    }
  }

  /* ---- Room ---- */
  .room {
    max-width: 980px;
    margin: 0 auto;
    padding: 18px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100%;
  }
  .room-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .shoe {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .shoe-card {
    width: 14px;
    height: 19px;
    border-radius: 2.5px;
    background:
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.25) 0 2px, transparent 2px 5px),
      #7a1f26;
    border: 1px solid rgba(234, 179, 72, 0.6);
  }
  .shoe-meter {
    position: relative;
    width: 72px;
    height: 7px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(234, 179, 72, 0.35);
    overflow: hidden;
  }
  .shoe-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, #a97a22, #eab348);
    border-radius: 999px;
    transition: width 0.6s ease;
  }
  .shoe-cut {
    position: absolute;
    left: 50%;
    top: -1px;
    bottom: -1px;
    width: 2px;
    background: #c2242c;
  }
  .shoe-n {
    font-size: 0.7rem;
    font-weight: 700;
    color: #cdbf9f;
    font-variant-numeric: tabular-nums;
  }
  .shuffle-note {
    margin: 6px auto 0;
    width: fit-content;
    padding: 4px 14px;
    border-radius: 999px;
    background: rgba(234, 179, 72, 0.14);
    border: 1px solid rgba(234, 179, 72, 0.4);
    color: #eab348;
    font-size: 0.76rem;
    font-weight: 600;
  }
  .room-name {
    flex: 1;
    text-align: center;
    font-family: Georgia, serif;
    font-size: 1.15rem;
    color: #f3dfa8;
  }
  .room-name .stakes {
    font-size: 0.78rem;
    color: rgba(255, 240, 220, 0.6);
    margin-left: 8px;
  }
  .ghost-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: rgba(12, 20, 15, 0.7);
    border: 1px solid rgba(230, 190, 120, 0.25);
    border-radius: 999px;
    color: rgba(255, 240, 220, 0.75);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost-btn:hover {
    color: #f3dfa8;
    border-color: rgba(230, 190, 120, 0.55);
  }
  .ghost-btn.leave:hover {
    color: #e0917a;
    border-color: rgba(224, 145, 122, 0.5);
  }

  /* The oval — a raised felt table seen from above. */
  .table-oval {
    position: relative;
    flex: 1;
    min-height: 430px;
    border-radius: 46% 46% 24px 24px / 60% 60% 24px 24px;
    padding: 26px 26px 18px;
    background:
      radial-gradient(ellipse at 50% 8%, rgba(255, 255, 255, 0.09), transparent 55%),
      radial-gradient(ellipse at 50% 30%, #1e6f43, #135130 62%, #0c3a21);
    box-shadow:
      inset 0 0 0 6px rgba(96, 62, 26, 0.9),
      inset 0 0 0 9px rgba(230, 190, 120, 0.5),
      inset 0 14px 40px rgba(0, 0, 0, 0.45),
      0 22px 50px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .dealer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
  }
  .dealer-tag {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: rgba(255, 240, 200, 0.55);
  }
  .table-script {
    font-family: Georgia, serif;
    font-style: italic;
    font-size: clamp(0.7rem, 1.6vw, 0.95rem);
    letter-spacing: 0.14em;
    color: rgba(255, 240, 200, 0.4);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
  }
  .phase-note {
    font-size: 0.78rem;
    font-weight: 700;
    color: #ffd98f;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 999px;
    padding: 3px 12px;
  }

  /* ---- Cards ---- */
  .cards {
    display: flex;
    gap: 6px;
    min-height: 86px;
    align-items: center;
  }
  .card {
    position: relative;
    width: 60px;
    height: 86px;
    border-radius: 7px;
    background: linear-gradient(160deg, #ffffff 0%, #f2efe6 70%, #e4dfd2 100%);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
    color: #1d222b;
    animation: dealin 0.3s cubic-bezier(0.2, 1.1, 0.4, 1) backwards;
    animation-delay: calc(var(--n, 0) * 0.09s);
  }
  .cards.small .card {
    width: 46px;
    height: 66px;
    border-radius: 6px;
  }
  @keyframes dealin {
    from {
      opacity: 0;
      transform: translateY(-18px) rotate(-6deg);
    }
  }
  .card.red {
    color: #c22333;
  }
  .card .rank {
    position: absolute;
    top: 4px;
    left: 6px;
    font-weight: 800;
    font-size: 0.95rem;
    line-height: 1;
  }
  .cards.small .card .rank {
    font-size: 0.78rem;
  }
  .card .suit {
    position: absolute;
    top: 18px;
    left: 6px;
    font-size: 0.72rem;
    line-height: 1;
  }
  .card .pip {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 1.7rem;
  }
  .cards.small .card .pip {
    font-size: 1.25rem;
  }
  .card.back {
    background:
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.14) 0 4px, transparent 4px 8px),
      linear-gradient(160deg, #7d1f26, #4f1015);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45), inset 0 0 0 3px rgba(255, 240, 200, 0.25);
  }
  .card.slot {
    background: rgba(0, 0, 0, 0.18);
    box-shadow: inset 0 0 0 1.5px rgba(255, 240, 200, 0.2);
    animation: none;
  }
  .value-chip {
    display: inline-grid;
    place-items: center;
    min-width: 30px;
    height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    color: #ffe9b8;
    font-size: 0.8rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .value-chip.bust {
    background: rgba(160, 30, 20, 0.75);
    color: #ffd9d0;
  }

  /* ---- Seats ---- */
  .seats {
    margin-top: auto;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    align-items: end;
  }
  /* A split seat stacks two hand boxes; the live one gets a gold seam. */
  .hand-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    border-radius: 10px;
    padding: 2px 4px;
    border: 1px solid transparent;
  }
  .hand-box.hand2 { margin-top: 2px; padding-top: 4px; border-top: 1px dashed rgba(255, 233, 184, 0.25); }
  .hand-box.hand-live { border-color: rgba(255, 213, 122, 0.65); background: rgba(255, 208, 120, 0.07); }

  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px 8px;
    border-radius: 14px;
    border: 1.5px solid transparent;
    min-height: 132px;
    justify-content: flex-end;
  }
  .seat.active {
    border-color: rgba(255, 217, 143, 0.8);
    background: rgba(255, 217, 143, 0.07);
    box-shadow: 0 0 22px rgba(255, 200, 100, 0.15);
  }
  .seat.empty {
    border: 1.5px dashed rgba(255, 240, 200, 0.16);
  }
  .empty-label {
    font-size: 0.7rem;
    color: rgba(255, 240, 200, 0.28);
    letter-spacing: 0.06em;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
  }
  .pname {
    font-size: 0.78rem;
    font-weight: 700;
    color: #f0e6d2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 90px;
  }
  .pname.left {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .bet-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(230, 190, 120, 0.4);
    color: #ffe9b8;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .result {
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    padding: 2px 10px;
    border-radius: 999px;
  }
  .result.win,
  .result.blackjack {
    color: #0e2b12;
    background: linear-gradient(#ffe6a8, #eab348);
    box-shadow: 0 0 14px rgba(240, 190, 90, 0.5);
  }
  .result.push {
    color: #e8e2d4;
    background: rgba(255, 255, 255, 0.14);
  }
  .result.lose,
  .result.bust {
    color: #ffd9d0;
    background: rgba(160, 30, 20, 0.6);
  }

  /* ---- Action bar ---- */
  .bar {
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 8px 14px;
    background: rgba(12, 20, 15, 0.78);
    border: 1px solid rgba(230, 190, 120, 0.22);
    border-radius: 16px;
    backdrop-filter: blur(2px);
  }
  .hint {
    color: rgba(255, 240, 220, 0.65);
    font-size: 0.88rem;
  }
  .hint b {
    color: #ffe9b8;
  }
  .err {
    color: #e0917a;
    font-size: 0.88rem;
    font-weight: 600;
  }
  .chip-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(#ffe6a8, #eab348 45%, #c8862c);
    color: #3a1f06;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  }
  .chip-btn:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }
  .chip-btn:disabled {
    opacity: 0.45;
    cursor: default;
    filter: grayscale(0.4);
  }
  .chip-btn.act {
    min-width: 96px;
    justify-content: center;
  }
  .turn-clock {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    border: 2px solid #ffd98f;
    color: #ffd98f;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 700px) {
    .seats {
      grid-template-columns: repeat(2, 1fr);
    }
    .table-oval {
      min-height: 520px;
    }
    /* The felt script overflows the oval's edge on phone widths. */
    .table-script {
      font-size: 0.62rem;
      padding: 0 26px;
      text-align: center;
    }
  }
</style>
