<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import {
    holdem, loadHoldem, sitHoldem, leaveHoldem, actHoldem,
    raiseBounds, clampRaise, potRaiseTo, holdemErrorText, inLiveHand as liveFor,
  } from "../lib/holdem.svelte";
  import { ask } from "../lib/confirm.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { session } from "../lib/session.svelte";
  import type { HoldemTable, PlayingCard } from "../lib/api";
  import Avatar from "./Avatar.svelte";
  import Coin from "./Coin.svelte";
  import { deckFace } from "../lib/emporium.svelte";
  import felt from "../assets/casino-felt.webp";
  import { ensureHoldemAudio, cardDeal, chipBet, checkKnock, yourTurn, potWin } from "../lib/holdem-audio";
  import { playSfx, playSfxAt } from "../lib/sfx";

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
  const rankLabel = (r: number) => RANKS[r] ?? String(r);
  const isRed = (s: number) => s === 1 || s === 2;

  // Seat placement around the oval: SEVEN chairs, the server's SEATS
  // (src/holdem.ts went 6 -> 7 in Aug 2026 and this ring stayed at six, so
  // the seventh player sat at the table invisibly). Clockwise from the
  // bottom, in engine seat order.
  const SEAT_POS = [
    { left: "50%", top: "90%" }, { left: "14%", top: "80%" }, { left: "6%", top: "38%" },
    { left: "30%", top: "6%" }, { left: "70%", top: "6%" }, { left: "94%", top: "38%" },
    { left: "86%", top: "80%" },
  ];

  let viewId = $state<number | null>(null);
  let sitSeat = $state<number | null>(null);
  let buyIn = $state(0);
  let raiseTo = $state<number | null>(0);
  let busy = $state(false);
  let error = $state("");
  let errTimer: ReturnType<typeof setTimeout> | null = null;
  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 400);

  onMount(loadHoldem);
  onDestroy(() => {
    clearInterval(tick);
    if (errTimer) clearTimeout(errTimer);
  });

  const me = $derived(session.user?.id ?? -1);
  const myTable = $derived(
    holdem.lobby?.tables.find((t) => t.seats.some((s) => s?.user.id === me)) ?? null,
  );
  const table = $derived(
    myTable ?? holdem.lobby?.tables.find((t) => t.id === viewId) ?? null,
  );
  const mySeat = $derived(table?.seats.find((s) => s?.user.id === me) ?? null);
  const myIdx = $derived(table?.seats.findIndex((s) => s?.user.id === me) ?? -1);
  const acting = $derived(!!mySeat?.acting);
  const toCall = $derived(mySeat && table ? Math.min(table.currentBet - mySeat.bet, mySeat.stack) : 0);
  const bounds = $derived(table && mySeat ? raiseBounds(table, mySeat) : null);
  const allInTo = $derived(bounds?.allInTo ?? 0);
  const minTo = $derived(bounds?.minTo ?? 0);
  const canRaise = $derived(acting && !!bounds?.can);
  const raiseAmt = $derived(clampRaise(raiseTo, minTo, allInTo));
  const callAllIn = $derived(!!mySeat && toCall > 0 && toCall >= mySeat.stack);
  const inLiveHand = $derived(liveFor(table, mySeat));
  const secondsLeft = $derived(
    table?.deadline ? Math.max(0, Math.ceil((table.deadline - now) / 1000)) : null,
  );
  const myCards = $derived(
    holdem.mine && table && holdem.mine.tableId === table.id && holdem.mine.handId === table.handId
      ? holdem.mine.cards
      : null,
  );

  // The raise box resets to the minimum only when the DECISION is new (your
  // turn arrives, or the hand / street moves on). An effect that read and
  // wrote raiseTo snapped every keystroke back, and never resetting carried
  // last hand's shove forward as a one-click all-in. Clamped at submit.
  const turnKey = $derived(acting && table ? `${table.handId}:${table.phase}` : "");
  $effect(() => {
    if (!turnKey) return;
    untrack(() => (raiseTo = minTo));
  });

  // Table sounds: cards off the deck, chips into the pot (mine loud, theirs
  // quiet), mucks, one flip per reveal, the action ping, the pot sliding.
  let prevBoard = 0;
  let prevActing = false;
  let heardWinFor = 0;
  let prevHand = 0;
  let prevCommitted = 0;
  let prevFolded = 0;
  let prevRevealed = 0;
  let lastMyActionAt = 0;
  $effect(() => {
    if (!table) return;
    if (table.handId !== prevHand) {
      // The between-hands ritual: the dealer sweeps the old board off the
      // felt, riffles, then the new hole cards arrive. Skipped on first
      // mount (prevHand 0) — joining a table isn't a fresh deal.
      const freshDeal = prevHand !== 0;
      const hadBoard = prevBoard > 0;
      prevHand = table.handId;
      prevBoard = 0;
      prevCommitted = 0;
      prevFolded = 0;
      prevRevealed = 0;
      if (freshDeal) {
        if (hadBoard) playSfx("rake-sweep", 0.3);
        playSfxAt("shuffle", hadBoard ? 450 : 0, 0.4);
      }
      if (mySeat && table.phase === "preflop") cardDeal(2); // my hole cards arrive
    }
    if (table.board.length > prevBoard) {
      cardDeal(table.board.length - prevBoard);
      prevBoard = table.board.length;
    }
    // Someone put chips in. My own actions already clicked in act() — skip
    // the echo for ~a second after I act; everyone else clicks quietly.
    const committed = table.seats.reduce((n, s) => n + (s?.bet ?? 0), 0);
    if (committed > prevCommitted && table.phase !== "settle") {
      if (Date.now() - lastMyActionAt > 900) chipBet(true);
    }
    prevCommitted = committed;
    // Folds hit the muck.
    const folded = table.seats.filter((s) => s?.folded).length;
    if (folded > prevFolded && ["preflop", "flop", "turn", "river"].includes(table.phase)) {
      playSfx("card-muck", 0.45);
    }
    prevFolded = folded;
    // Showdown reveals: one flip per batch of turned-up hands, and the rail
    // gasps when a multi-way showdown turns face-up.
    const revealed = table.seats.filter((s) => s?.cards).length;
    if (revealed > prevRevealed) {
      playSfx("card-flip", 0.55);
      if (revealed >= 2 && prevRevealed < 2) playSfx("crowd-gasp", 0.35);
    }
    prevRevealed = revealed;

    if (acting && !prevActing) yourTurn();
    prevActing = acting;
    if (table.phase === "settle" && table.handId !== heardWinFor && table.winners.length > 0) {
      heardWinFor = table.handId;
      if (mySeat && mySeat.won > 0) potWin();
      else playSfx("chip-cascade", 0.3); // the pot slides to someone, softly
    }
  });

  function showError(e: unknown): void {
    error = holdemErrorText(e);
    if (errTimer) clearTimeout(errTimer);
    errTimer = setTimeout(() => (error = ""), 3200);
  }

  function openSit(t: HoldemTable, seat: number): void {
    viewId = t.id;
    sitSeat = seat;
    buyIn = Math.min(Math.max(t.minBuy * 2, t.minBuy), Math.min(t.maxBuy, wallet.coins));
  }

  async function confirmSit(): Promise<void> {
    if (!table || sitSeat === null) return;
    ensureHoldemAudio();
    try {
      await sitHoldem(table.id, sitSeat, Math.floor(buyIn));
      sitSeat = null;
      chipBet();
    } catch (e) {
      showError(e);
    }
  }

  async function doLeave(): Promise<void> {
    if (!table) return;
    if (inLiveHand && !(await ask({ title: "Leave mid-hand?", body: "Your committed chips stay in the pot — this is a fold and go.", confirm: "fold and leave", danger: true }))) return;
    try {
      await leaveHoldem(table.id);
    } catch (e) {
      showError(e);
    }
  }

  async function act(e: Event, action: string): Promise<void> {
    // Give up focus so Space can't press the same button again, and one
    // request at a time so a double-click can't act twice.
    (e.currentTarget as HTMLElement | null)?.blur?.();
    if (!table || busy) return;
    const amount = action === "raise" ? clampRaise(raiseTo, minTo, allInTo) : null;
    ensureHoldemAudio();
    busy = true;
    try {
      lastMyActionAt = Date.now(); // the broadcast echo shouldn't re-click
      await actHoldem(table.id, action, amount);
      if (action === "check") checkKnock();
      else if (action === "call") chipBet();
      else if (action === "raise") playSfx("chip-push", 0.55); // a stack slides in
    } catch (err) {
      showError(err);
    } finally {
      busy = false;
    }
  }

  function cardsFor(t: HoldemTable, idx: number): PlayingCard[] | null {
    const s = t.seats[idx];
    if (!s) return null;
    if (s.cards) return s.cards; // showdown reveal
    if (idx === myIdx && myCards) return myCards;
    return null;
  }

  const phaseLabel: Record<string, string> = {
    waiting: "Waiting for players", preflop: "Pre-flop", flop: "The flop",
    turn: "The turn", river: "The river", showdown: "Showdown", settle: "",
  };
</script>

<section class="holdem" style="--felt: url({felt})">
  <header class="top">
    <h1>TEXAS HOLD'EM</h1>
    <span class="balance"><Coin size={16} /> {wallet.coins.toLocaleString()}</span>
  </header>

  {#if !table}
    <!-- Lobby -->
    <div class="lobby">
      {#each holdem.lobby?.tables ?? [] as t (t.id)}
        <button class="tcard" onclick={() => (viewId = t.id)}>
          <span class="tname">{t.name}</span>
          <span class="tblinds">Blinds {t.sb}/{t.bb}</span>
          <span class="tbuy">Buy-in {t.minBuy}–{t.maxBuy}</span>
          <span class="tseats">{t.seats.filter(Boolean).length}/{t.seats.length} seated</span>
        </button>
      {/each}
    </div>
    <p class="lhint">No-limit hold'em against each other — the house only takes a 5% rake (capped) from flopped pots, straight into the nightly lottery.</p>
  {:else}
    <div class="tablewrap">
      <div class="meta">
        <button class="lobbyback" onclick={() => { if (!mySeat) viewId = null; }} disabled={!!mySeat}>
          ← Tables
        </button>
        <span class="tinfo">{table.name} · {table.sb}/{table.bb}{table.phase !== "waiting" && phaseLabel[table.phase] ? " · " + phaseLabel[table.phase] : ""}</span>
        {#if mySeat}
          <button class="leave" onclick={doLeave}>{inLiveHand ? "Fold & leave" : "Stand up"}</button>
        {/if}
      </div>

      <div class="oval">
        <!-- Community area -->
        <div class="center">
          <div class="board">
            {#each Array(5) as _, i}
              {@const c = table.board[i]}
              <div class="card big" class:ghost={!c} class:red={c && isRed(c.s)}>
                {#if c}<b>{rankLabel(c.r)}</b><span>{SUITS[c.s]}</span>{/if}
              </div>
            {/each}
          </div>
          {#if table.pot > 0}
            <div class="pot">POT {table.pot.toLocaleString()}</div>
          {/if}
          {#if table.phase === "settle" && table.winners.length}
            <div class="winbanner">
              {#each table.winners as w, i}
                <span>{i > 0 ? " · " : ""}<b>{w.user.displayName}</b> +{w.amount}{w.hand ? ` (${w.hand})` : ""}</span>
              {/each}
            </div>
          {:else if table.phase === "waiting"}
            <div class="waitnote">{table.seats.filter(Boolean).length < 2 ? "Waiting for a second player…" : "Shuffling up…"}</div>
          {/if}
        </div>

        <!-- Seats -->
        {#each SEAT_POS as _, i}
          {@const s = table.seats[i]}
          <div class="seat" style="left: {SEAT_POS[i].left}; top: {SEAT_POS[i].top}">
            {#if s}
              <div
                class="chair"
                class:folded={s.folded && table.phase !== "waiting" && table.phase !== "settle"}
                class:acting={s.acting}
                class:champ={table.phase === "settle" && s.won > 0}
              >
                {#if s.acting && secondsLeft !== null}
                  <span class="clockchip">{secondsLeft}</span>
                {/if}
                <div class="who">
                  <Avatar name={s.user.displayName} id={s.user.id} avatar={s.user.avatar} size={30} profile />
                  <span class="pname">{s.user.displayName}</span>
                  {#if s.button}<span class="dbtn" title="Dealer button">D</span>{/if}
                </div>
                <span class="stack"><Coin size={11} /> {s.stack.toLocaleString()}{s.allIn ? " · ALL IN" : ""}</span>
                {#if cardsFor(table, i)}
                  <div class="hole">
                    {#each cardsFor(table, i) ?? [] as c}
                      <div class="card sm {deckFace(s.user.cosmetics?.cardback)}" class:red={isRed(c.s)}><b>{rankLabel(c.r)}</b><span>{SUITS[c.s]}</span></div>
                    {/each}
                  </div>
                  {#if s.handName}<span class="handname">{s.handName}</span>{/if}
                {:else if !s.folded && table.phase !== "waiting" && table.phase !== "settle"}
                  <div class="hole"><div class="card sm back {s.user.cosmetics?.cardback ?? ''}"></div><div class="card sm back {s.user.cosmetics?.cardback ?? ''}"></div></div>
                {/if}
                {#if s.bet > 0}<span class="betchip">{s.bet}</span>{/if}
                {#if table.phase === "settle" && s.won > 0}<span class="wonchip">+{s.won}</span>{/if}
              </div>
            {:else if !mySeat}
              <button class="sitbtn" onclick={() => openSit(table, i)}>SIT</button>
            {:else}
              <div class="empty"></div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Action bar -->
      {#if acting && mySeat}
        <div class="actions">
          <button class="abtn fold" disabled={busy} onclick={(e) => act(e, "fold")}>Fold</button>
          {#if toCall === 0}
            <button class="abtn check" disabled={busy} onclick={(e) => act(e, "check")}>Check</button>
          {:else}
            <button class="abtn call" disabled={busy} onclick={(e) => act(e, "call")}>
              Call {toCall.toLocaleString()}{callAllIn ? " (all-in)" : ""}
            </button>
          {/if}
          {#if canRaise}
            <div class="raisebox">
              <input type="number" min={minTo} max={allInTo} step="1" bind:value={raiseTo} />
              <button class="abtn raise" disabled={busy} onclick={(e) => act(e, "raise")}>
                {raiseAmt >= allInTo ? "All-in" : table.currentBet === 0 ? "Bet" : "Raise to"} {raiseAmt.toLocaleString()}
              </button>
              <div class="presets">
                <button onclick={() => (raiseTo = minTo)}>Min</button>
                <button onclick={() => table && mySeat && (raiseTo = potRaiseTo(table, mySeat))}>Pot</button>
                <button onclick={() => (raiseTo = allInTo)}>All-in</button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
      {#if error}<p class="err">{error}</p>{/if}
    </div>

    <!-- Buy-in dialog -->
    {#if sitSeat !== null && !mySeat}
      <div class="scrim" role="presentation" onclick={() => (sitSeat = null)}>
        <div
          class="dialog"
          role="dialog"
          tabindex="-1"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.key === "Escape" && (sitSeat = null)}
        >
          <h2>Buy in — {table.name}</h2>
          <p class="drange">Blinds {table.sb}/{table.bb} · buy-in {table.minBuy}–{table.maxBuy} silver</p>
          <input type="number" min={table.minBuy} max={Math.min(table.maxBuy, wallet.coins)} bind:value={buyIn} />
          <div class="dpresets">
            <button onclick={() => (buyIn = table.minBuy)}>Min</button>
            <button onclick={() => (buyIn = Math.min(table.maxBuy, table.bb * 100, wallet.coins))}>100 BB</button>
            <button onclick={() => (buyIn = Math.min(table.maxBuy, wallet.coins))}>Max</button>
          </div>
          <div class="drow">
            <button class="abtn" onclick={() => (sitSeat = null)}>Never mind</button>
            <button class="abtn raise" onclick={confirmSit} disabled={buyIn < table.minBuy || buyIn > Math.min(table.maxBuy, wallet.coins)}>
              Take seat {sitSeat + 1}
            </button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .holdem {
    min-height: 100%;
    padding: 14px 16px 28px;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.66)),
      var(--felt) center / cover no-repeat fixed;
    color: #f2ead6;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .top { display: flex; align-items: center; justify-content: space-between; padding-left: 156px; }
  @media (max-width: 1000px) {
    /* Mid widths: the hub's floating back pill would clip the title — drop
       the header a line below it instead. */
    .top { padding-left: 0; margin-top: 42px; }
  }
  .top h1 { margin: 0; font-family: Georgia, serif; font-size: 1.3rem; letter-spacing: 0.3em; color: #eab348; }
  .balance { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 999px; }

  .lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; max-width: 760px; margin: 10px auto 0; width: 100%; }
  .tcard {
    display: flex; flex-direction: column; gap: 4px; align-items: center;
    padding: 18px 12px; border-radius: 14px; cursor: pointer;
    border: 2px solid rgba(234, 179, 72, 0.5); background: rgba(6, 46, 26, 0.6); color: inherit;
  }
  .tcard:hover { border-color: #eab348; background: rgba(10, 60, 34, 0.7); transform: translateY(-2px); }
  .tcard { transition: transform 0.12s, border-color 0.12s; }
  .tname { font-family: Georgia, serif; font-size: 1.1rem; color: #eab348; letter-spacing: 0.08em; }
  /* Each stakes tier wears its metal: copper, gold, and the pale platinum
     of the high-roller room. */
  .tcard:nth-child(1) { border-color: rgba(196, 124, 62, 0.55); }
  .tcard:nth-child(1):hover { border-color: #d89a66; }
  .tcard:nth-child(1) .tname { color: #d89a66; }
  .tcard:nth-child(3) { border-color: rgba(216, 224, 236, 0.45); }
  .tcard:nth-child(3):hover { border-color: #e8edf6; }
  .tcard:nth-child(3) .tname { color: #e8edf6; }
  .tblinds, .tbuy, .tseats { font-size: 0.78rem; opacity: 0.9; }
  .lhint { text-align: center; font-size: 0.75rem; opacity: 0.75; max-width: 560px; margin: 6px auto 0; }

  .tablewrap { display: flex; flex-direction: column; gap: 10px; max-width: 900px; margin: 0 auto; width: 100%; }
  .meta { display: flex; align-items: center; gap: 12px; }
  .tinfo { flex: 1; font-size: 0.85rem; opacity: 0.9; }
  .lobbyback, .leave {
    background: rgba(0,0,0,0.4); color: inherit; border: 1px solid rgba(242,234,214,0.4);
    border-radius: 999px; padding: 4px 12px; font-size: 0.76rem; cursor: pointer;
  }
  .lobbyback:disabled { opacity: 0.4; cursor: default; }
  .leave:hover { border-color: #d66; color: #f3b8b8; }

  /* The table: padded leather rail, an inner racetrack line, a ghosted
     felt wordmark — the card-room look. */
  .oval {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 50% / 42%;
    border: 13px solid transparent;
    background:
      radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.07), transparent 58%),
      linear-gradient(rgba(7, 54, 30, 0.94), rgba(5, 38, 21, 0.96)) padding-box,
      linear-gradient(160deg, #5d3a1e, #33200f 45%, #4a2d17 80%, #291a0c) border-box;
    box-shadow:
      inset 0 0 44px rgba(0,0,0,0.55),
      inset 0 0 0 2px rgba(0,0,0,0.35),
      0 12px 34px rgba(0,0,0,0.5);
  }
  .oval::before {
    content: "";
    position: absolute;
    inset: 7%;
    border-radius: 50% / 42%;
    border: 1.6px solid rgba(239, 230, 205, 0.28);
    pointer-events: none;
  }
  .oval::after {
    content: "SOLACE · NO LIMIT";
    position: absolute;
    left: 50%;
    top: 68%;
    transform: translateX(-50%);
    font-family: Georgia, serif;
    font-size: clamp(0.7rem, 2.2vw, 1.15rem);
    letter-spacing: 0.5em;
    color: rgba(239, 230, 205, 0.14);
    white-space: nowrap;
    pointer-events: none;
  }
  .center {
    position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%);
    display: flex; flex-direction: column; align-items: center; gap: 7px; width: 80%;
  }
  .board { display: flex; gap: 6px; }
  /* Cards: corner index up top, big suit low — the real face layout. */
  .card {
    position: relative;
    background: linear-gradient(160deg, #fdfaf2, #efe9da);
    color: #17181c;
    border-radius: 6px;
    border: 1px solid #b8b0a0;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
    display: block;
    font-family: Georgia, serif;
    line-height: 1;
  }
  .card.red { color: #b3242c; }
  .card b {
    position: absolute;
    top: 4px;
    left: 5px;
    font-weight: 800;
  }
  .card span {
    position: absolute;
    right: 5px;
    bottom: 3px;
  }
  .card.big { width: 44px; height: 62px; }
  .card.big b { font-size: 0.95rem; }
  .card.big span { font-size: 1.35rem; }
  .card.sm { width: 27px; height: 38px; }
  .card.sm b { font-size: 0.62rem; top: 3px; left: 4px; }
  .card.sm span { font-size: 0.82rem; right: 3px; bottom: 2px; }
  /* Empty board slots: faint outlines on the felt, not face-down cards. */
  .card.ghost {
    background: transparent;
    border: 1.6px dashed rgba(239, 230, 205, 0.22);
    box-shadow: none;
  }
  .board .card.big:not(.ghost) { animation: dealin 0.32s ease-out backwards; }
  .board .card.big:nth-child(4):not(.ghost) { animation-delay: 0.06s; }
  .board .card.big:nth-child(5):not(.ghost) { animation-delay: 0.1s; }
  @keyframes dealin {
    from { transform: translateY(-16px) rotate(-6deg); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  .card.back {
    background:
      radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12) 0 18%, transparent 19%),
      repeating-linear-gradient(45deg, #7d1d22, #7d1d22 4px, #6a151a 4px, #6a151a 8px);
    border-color: #4a0f13;
  }
  .pot {
    font-weight: 800; font-size: 0.85rem; letter-spacing: 0.12em;
    background: rgba(0,0,0,0.45); border: 1px solid rgba(234,179,72,0.5);
    padding: 3px 14px; border-radius: 999px; color: #ffd97a;
  }
  .winbanner {
    text-align: center; font-size: 0.82rem; color: #ffd97a;
    text-shadow: 0 0 12px rgba(255, 217, 122, 0.45);
  }
  .waitnote { font-size: 0.78rem; opacity: 0.75; font-style: italic; }

  .seat { position: absolute; transform: translate(-50%, -50%); }
  .chair {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: rgba(0,0,0,0.5); border: 2px solid rgba(242,234,214,0.35);
    border-radius: 12px; padding: 7px 10px 6px; min-width: 108px;
    transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
  }
  .chair.acting { border-color: #eab348; box-shadow: 0 0 14px rgba(234,179,72,0.45); }
  .chair.folded { opacity: 0.45; }
  .chair.champ {
    border-color: #7fd0a0;
    box-shadow: 0 0 18px rgba(127, 208, 160, 0.5);
    animation: champpulse 1s ease-in-out 2;
  }
  @keyframes champpulse {
    50% { box-shadow: 0 0 30px rgba(127, 208, 160, 0.85); }
  }
  .who { display: flex; align-items: center; gap: 6px; max-width: 150px; }
  .dbtn {
    flex: none;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 35% 30%, #fff, #d8d4c8 75%);
    color: #17181c;
    font-size: 0.62rem;
    font-weight: 900;
    border: 1px solid #9a958a;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .pname { font-size: 0.74rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stack { display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; color: #ffd97a; }
  .hole { display: flex; gap: 3px; margin-top: 2px; }
  /* Hole cards slide in off the deck like the board does. */
  .hole .card { animation: dealin 0.25s ease-out backwards; }
  .hole .card:nth-child(2) { animation-delay: 0.07s; }
  .handname { font-size: 0.64rem; color: #7fd0a0; font-weight: 700; }
  /* Bet + win markers styled as real chips: a dashed ring reads as the
     edge stripes, the outer shadow ring as the chip rim. */
  .betchip {
    position: absolute; top: -12px; right: -8px;
    background: radial-gradient(circle at 50% 32%, #2a5f8c, #17324a 72%);
    color: #fff; border: 2px dashed #f6f2e8;
    box-shadow: 0 0 0 2px #17324a, 0 2px 5px rgba(0, 0, 0, 0.55);
    font-size: 0.68rem; font-weight: 800; border-radius: 999px; padding: 2px 8px;
  }
  .wonchip {
    position: absolute; top: -12px; left: -8px;
    background: radial-gradient(circle at 50% 32%, #2c9159, #1d6b40 72%);
    color: #fff; border: 2px dashed #f6f2e8;
    box-shadow: 0 0 0 2px #1d6b40, 0 2px 5px rgba(0, 0, 0, 0.55);
    font-size: 0.68rem; font-weight: 800; border-radius: 999px; padding: 2px 8px;
    animation: wonpop 0.4s ease-out backwards;
  }
  @keyframes wonpop {
    from { transform: scale(0.4); opacity: 0; }
    60% { transform: scale(1.15); }
    to { transform: none; opacity: 1; }
  }
  .clockchip {
    position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
    background: #eab348; color: #241a04; font-size: 0.66rem; font-weight: 800;
    border-radius: 999px; padding: 1px 8px; border: 2px solid #241a04;
  }
  .sitbtn {
    width: 58px; height: 58px; border-radius: 50%;
    border: 2px dashed rgba(242,234,214,0.5); background: rgba(0,0,0,0.35);
    color: #f2ead6; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.1em; cursor: pointer;
  }
  .sitbtn:hover { border-color: #eab348; color: #eab348; }
  .empty { width: 42px; height: 42px; border-radius: 50%; border: 2px dashed rgba(242,234,214,0.15); }

  .actions {
    display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
    background: rgba(0,0,0,0.45); border: 1px solid rgba(234,179,72,0.4);
    border-radius: 14px; padding: 10px 14px;
  }
  .abtn {
    font-weight: 800; font-size: 0.85rem; padding: 9px 18px; border-radius: 10px;
    border: 2px solid rgba(242,234,214,0.5); background: rgba(0,0,0,0.35); color: #f2ead6; cursor: pointer;
  }
  .abtn:hover:not(:disabled) { filter: brightness(1.2); }
  .abtn:disabled { opacity: 0.5; cursor: default; }
  .abtn.fold { border-color: #a34; }
  .abtn.check, .abtn.call { border-color: #7fd0a0; }
  .abtn.raise { border-color: #eab348; background: rgba(234,179,72,0.2); }
  .raisebox { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .raisebox input {
    width: 90px; padding: 8px; border-radius: 8px; border: 1px solid rgba(242,234,214,0.4);
    background: rgba(0,0,0,0.4); color: #f2ead6; font-weight: 700; text-align: center;
  }
  .presets { display: flex; gap: 4px; }
  .presets button {
    font-size: 0.68rem; padding: 4px 8px; border-radius: 6px; cursor: pointer;
    border: 1px solid rgba(242,234,214,0.3); background: rgba(0,0,0,0.3); color: #f2ead6;
  }
  .err { text-align: center; color: #ff9d9d; font-size: 0.8rem; margin: 0; }

  .scrim {
    position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 40;
    display: grid; place-items: center;
  }
  .dialog {
    background: #1a1c20; border: 1px solid rgba(234,179,72,0.5); border-radius: 14px;
    padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; min-width: 280px;
  }
  .dialog h2 { margin: 0; font-family: Georgia, serif; font-size: 1.05rem; color: #eab348; }
  .drange { margin: 0; font-size: 0.76rem; opacity: 0.8; }
  .dialog input {
    padding: 9px; border-radius: 8px; border: 1px solid rgba(242,234,214,0.35);
    background: rgba(0,0,0,0.4); color: #f2ead6; font-weight: 700; text-align: center; font-size: 1rem;
  }
  .dpresets { display: flex; gap: 6px; justify-content: center; }
  .dpresets button {
    font-size: 0.72rem; padding: 5px 10px; border-radius: 7px; cursor: pointer;
    border: 1px solid rgba(242,234,214,0.3); background: rgba(0,0,0,0.3); color: #f2ead6;
  }
  .drow { display: flex; justify-content: space-between; gap: 10px; }

  @media (max-width: 700px) {
    .oval { aspect-ratio: 4 / 5; border-radius: 30% / 24%; }
    .card.big { width: 34px; height: 48px; font-size: 0.8rem; }
    .chair { min-width: 84px; padding: 5px 7px 5px; }

    /* THE LOBBY, READ ON A PHONE (Josh, Sep 2026: Hold'em "could use some
       work"). "TEXAS HOLD'EM" at 0.3em of letter-spacing needs 300px, so it
       broke across two lines and shouldered the balance chip; the spacing is
       what makes it a sign, so the size gives way instead of the spacing.
       And the three tables were 120px stacks of centred text — a name, then
       blinds, then a buy-in, then a seat count, one under another. They read
       as rows now: the room on the left, its stakes on the right, which is
       how a cardroom board is actually written and fits three tables in the
       height one used to take. */
    .top {
      margin-top: 36px;
      gap: 10px;
    }
    .top h1 {
      font-size: 1.05rem;
      letter-spacing: 0.16em;
    }
    .tcard {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 2px 10px;
      padding: 12px 14px;
      text-align: left;
    }
    .tname {
      flex: 1 1 auto;
      font-size: 1.02rem;
    }
    /* Everything after the name is the small print, set on one line. */
    .tcard > :global(*:not(.tname)) {
      font-size: 0.8rem;
    }
  }
</style>
