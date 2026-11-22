<script lang="ts">
  // Hold'em on the wing's oval — the physical table hosts the Copper (1/2)
  // game (the resolved pick). The community board, pots and everyone's stacks
  // live ON the felt (felts.ts); this strip holds the secrets and the choices:
  // YOUR hole cards, sit/leave, and the action row.
  //
  // Two rows, on purpose: the table's facts and the way out along the top,
  // your hand and your decision underneath. One row of eleven pills wrapped
  // into a different mess on every street.
  import { untrack } from "svelte";
  import {
    holdem, sitHoldem, leaveHoldem, actHoldem,
    raiseBounds, clampRaise, potRaiseTo, holdemErrorText, inLiveHand, LIVE_PHASES,
  } from "../../lib/holdem.svelte";
  import { wallet } from "../../lib/wallet.svelte";
  import { session } from "../../lib/session.svelte";
  import { ask } from "../../lib/confirm.svelte";
  import { ensureHoldemAudio, chipBet, checkKnock, yourTurn, potWin } from "../../lib/holdem-audio";
  import { playSfx } from "../../lib/sfx";
  import "./strip.css";
  import { deckFace } from "../../lib/emporium.svelte";
  import type { HoldemTable } from "../../lib/api";

  /** The engine seat (0-6) of the chair your body is sitting in on the floor,
   *  if any — SIT takes THAT chair when it's free, not the first empty one. */
  let { preferSeat = null }: { preferSeat?: number | null } = $props();

  const SUIT = ["♠", "♥", "♦", "♣"];
  const RANK = ["", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const fmt = (n: number): string => n.toLocaleString();

  const t = $derived(holdem.lobby?.tables[0] ?? null);
  const me = $derived(session.user?.id ?? -1);
  const seatIdx = $derived(t ? t.seats.findIndex((s) => s && s.user.id === me) : -1);
  const seat = $derived(seatIdx >= 0 ? t!.seats[seatIdx] : null);
  /** Seated at one of the OTHER Hold'em tables (the hub's Gold or High Roller). */
  const elsewhere = $derived(
    holdem.lobby?.tables.find((x) => x.id !== t?.id && x.seats.some((s) => s?.user.id === me)) ?? null,
  );
  const live = $derived(!!t && (LIVE_PHASES as readonly string[]).includes(t.phase));
  const myCards = $derived(
    holdem.mine && t && t.phase !== "waiting" && holdem.mine.tableId === t.id && holdem.mine.handId === t.handId
      ? holdem.mine.cards
      : null,
  );
  const inHand = $derived(inLiveHand(t, seat));
  const acting = $derived(!!seat?.acting);
  const toCall = $derived(t && seat ? Math.max(0, Math.min(t.currentBet - seat.bet, seat.stack)) : 0);
  const callAllIn = $derived(!!seat && toCall > 0 && toCall >= seat.stack);
  const bounds = $derived(t && seat ? raiseBounds(t, seat) : null);
  const canRaise = $derived(acting && !!bounds?.can);
  const actor = $derived(t?.seats.find((s) => s?.acting) ?? null);

  // ---- the raise box ---------------------------------------------------------
  // Reset to the minimum ONLY when the decision is new (your turn arrives, or
  // the hand / street moves on). Reading and writing raiseTo in one effect
  // snapped every keystroke back to the minimum, and never resetting carried
  // last hand's shove into this one — a one-click accidental all-in.
  let raiseTo = $state<number | null>(0);
  const turnKey = $derived(acting && t ? `${t.handId}:${t.phase}` : "");
  $effect(() => {
    if (!turnKey) return;
    untrack(() => {
      if (bounds) raiseTo = bounds.minTo;
    });
  });
  const raiseAmt = $derived(bounds ? clampRaise(raiseTo, bounds.minTo, bounds.allInTo) : 0);
  const raiseLabel = $derived(
    !bounds || !t ? ""
      : raiseAmt >= bounds.allInTo ? `ALL-IN ${fmt(raiseAmt)}`
      : t.currentBet === 0 ? `BET ${fmt(raiseAmt)}`
      : `RAISE TO ${fmt(raiseAmt)}`,
  );

  // ---- the buy-in ------------------------------------------------------------
  // Default 2× the minimum, never more than the wallet or the table's cap. Set
  // ONCE: clearing the box to type a number must not refill it under you.
  let buyIn = $state<number | null>(null);
  let buyInit = false;
  const maxAfford = (tb: HoldemTable): number => Math.min(tb.maxBuy, wallet.coins);
  $effect(() => {
    if (!t || buyInit) return;
    buyInit = true;
    untrack(() => {
      buyIn = Math.max(t.minBuy, Math.min(t.minBuy * 2, maxAfford(t)));
    });
  });
  const buyOk = $derived(
    !!t && buyIn !== null && Number.isInteger(buyIn) && buyIn >= t.minBuy && buyIn <= t.maxBuy && buyIn <= wallet.coins,
  );
  const firstFree = $derived(t ? t.seats.findIndex((s) => !s) : -1);
  /** The chair you're sitting in, when the engine seat behind it is free. */
  const sitSeat = $derived(
    t && preferSeat !== null && preferSeat >= 0 && preferSeat < t.seats.length && !t.seats[preferSeat]
      ? preferSeat
      : firstFree,
  );

  // ---- clocks ----------------------------------------------------------------
  let now = $state(Date.now());
  $effect(() => {
    const iv = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(iv);
  });
  const secs = $derived(t?.deadline ? Math.max(0, Math.ceil((t.deadline - now) / 1000)) : null);
  const clockLabel = $derived(
    !t || secs === null ? null
      : live && acting ? "your turn"
      : live && actor ? (actor.user.displayName || actor.user.username)
      : t.phase === "waiting" || t.phase === "settle" ? "next hand"
      : null,
  );

  // ---- the verdict -----------------------------------------------------------
  const verdict = $derived.by((): { word: string; cls: string } | null => {
    if (!t || t.phase !== "settle" || !t.winners.length) return null;
    const split = t.winners.length > 1;
    if (seat && seat.won > 0) {
      const hand = seat.handName ? ` · ${seat.handName}` : "";
      return split
        ? { word: `SPLIT POT +${fmt(seat.won)}${hand}`, cls: "push" }
        : { word: `YOU WIN +${fmt(seat.won)}${hand}`, cls: "win" };
    }
    if (split) return { word: "SPLIT POT", cls: "push" };
    const w = t.winners[0];
    const name = (w.user.displayName || w.user.username).toUpperCase();
    return { word: `${name} TAKES IT${w.hand ? ` · ${w.hand}` : ""}`, cls: myCards ? "lose" : "push" };
  });

  // ---- sounds ----------------------------------------------------------------
  let wasActing = false;
  let heardWin = 0;
  $effect(() => {
    const a = acting;
    if (a && !wasActing) yourTurn();
    wasActing = a;
  });
  $effect(() => {
    if (!t || t.phase !== "settle" || !seat || seat.won <= 0 || heardWin === t.handId) return;
    heardWin = t.handId;
    potWin();
  });

  // ---- doing things ----------------------------------------------------------
  let err = $state<string | null>(null);
  let errTimer: ReturnType<typeof setTimeout> | null = null;
  let busy = $state(false);

  /** One request at a time (a double-click must never act twice), and the
   *  clicked button gives up focus so Space can't press it again. */
  async function run(e: Event | null, f: () => Promise<void>): Promise<boolean> {
    (e?.currentTarget as HTMLElement | null)?.blur?.();
    if (busy) return false;
    busy = true;
    err = null;
    try {
      ensureHoldemAudio();
      await f();
      return true;
    } catch (x) {
      err = holdemErrorText(x);
      if (errTimer) clearTimeout(errTimer);
      errTimer = setTimeout(() => (err = null), 3200);
      return false;
    } finally {
      busy = false;
    }
  }

  function act(e: Event, kind: "fold" | "check" | "call" | "raise"): void {
    if (!t) return;
    const id = t.id;
    const amount = kind === "raise" && bounds ? clampRaise(raiseTo, bounds.minTo, bounds.allInTo) : null;
    void run(e, () => actHoldem(id, kind, amount)).then((ok) => {
      if (!ok) return;
      if (kind === "check") checkKnock();
      else if (kind === "call") chipBet();
      else if (kind === "raise") playSfx("chip-push", 0.55);
      else playSfx("card-muck", 0.45);
    });
  }

  function sit(e: Event): void {
    if (!t || !buyOk || sitSeat < 0 || buyIn === null) return;
    const id = t.id, at = sitSeat, amt = buyIn;
    void run(e, () => sitHoldem(id, at, amt)).then((ok) => ok && chipBet());
  }

  async function standUp(e: Event, tb: HoldemTable): Promise<void> {
    (e.currentTarget as HTMLElement | null)?.blur?.();
    const s = tb.seats.find((x) => x?.user.id === me) ?? null;
    if (inLiveHand(tb, s)) {
      const ok = await ask({
        title: "Leave the table?",
        body: "You're in a hand. Standing up folds it — the chips you've put in the pot stay there.",
        confirm: "fold and stand up",
        danger: true,
      });
      if (!ok) return;
    }
    await run(null, () => leaveHoldem(tb.id));
  }
</script>

<div class="strip hstrip">
  {#if !t}
    <span class="snote">finding the table…</span>
  {:else}
    <div class="hrow">
      <span class="schip">{t.name} · blinds <b>{t.sb}/{t.bb}</b></span>
      <span class="schip">you <b>{fmt(wallet.coins)}</b></span>
      {#if seat}<span class="schip">stack <b>{fmt(seat.stack)}</b>{seat.allIn ? " · all in" : ""}</span>{/if}
      {#if t.pot > 0}<span class="schip">pot <b>{fmt(t.pot)}</b></span>{/if}
      {#if acting && toCall > 0}<span class="schip">to call <b>{fmt(toCall)}</b></span>{/if}
      {#if clockLabel && secs !== null}
        <span class="schip clock" class:mine={acting} class:pulse={secs <= 5}>{clockLabel} · <b>{secs}s</b></span>
      {/if}
      {#if seat}
        <button class="sbtn danger leave" onclick={(e) => standUp(e, t)} disabled={busy}>
          stand up{inHand ? " (folds)" : ""}
        </button>
      {/if}
    </div>

    <div class="hrow">
      {#if !seat}
        {#if elsewhere}
          <span class="snote">you're seated at the {elsewhere.name} table</span>
          <button class="sbtn danger" onclick={(e) => standUp(e, elsewhere)} disabled={busy}>stand up there</button>
        {:else if sitSeat < 0}
          <span class="snote">the table is full</span>
        {:else if wallet.coins < t.minBuy}
          <span class="snote">you need {fmt(t.minBuy)} silver to buy in here</span>
        {:else}
          <span class="hgroup">
            <span class="hlab">buy in</span>
            <input class="snum" type="number" min={t.minBuy} max={maxAfford(t)} step="1" bind:value={buyIn} />
            <button class="sbtn mini" onclick={() => (buyIn = t.minBuy)}>Min</button>
            <button class="sbtn mini" onclick={() => (buyIn = Math.max(t.minBuy, Math.min(t.minBuy * 2, maxAfford(t))))}>2×</button>
            <button class="sbtn mini" onclick={() => (buyIn = Math.max(t.minBuy, maxAfford(t)))}>Max</button>
          </span>
          <button class="sbtn hot" disabled={!buyOk || busy} onclick={sit}>
            SIT · {buyOk ? fmt(buyIn ?? 0) : `${fmt(t.minBuy)}–${fmt(maxAfford(t))}`}
          </button>
        {/if}
      {:else}
        {#if myCards}
          <span class="myhand" class:hot={acting}>
            <span class="hlabel">your hand</span>
            <span class="scards">
              {#each myCards as pc (pc.r * 4 + pc.s)}
                <span class="scard {deckFace(session.user?.cosmetics?.cardback)}" class:red={pc.s === 1 || pc.s === 2}>{RANK[pc.r]}<small>{SUIT[pc.s]}</small></span>
              {/each}
            </span>
          </span>
        {/if}
        {#if acting}
          <button class="sbtn danger" disabled={busy} onclick={(e) => act(e, "fold")}>FOLD</button>
          {#if toCall <= 0}
            <button class="sbtn hot" disabled={busy} onclick={(e) => act(e, "check")}>CHECK</button>
          {:else}
            <button class="sbtn hot" disabled={busy} onclick={(e) => act(e, "call")}>
              CALL {fmt(toCall)}{callAllIn ? " (ALL-IN)" : ""}
            </button>
          {/if}
          {#if canRaise && bounds}
            <span class="hgroup raise">
              <input class="snum" type="number" min={bounds.minTo} max={bounds.allInTo} step="1" bind:value={raiseTo} />
              <button class="sbtn" disabled={busy} onclick={(e) => act(e, "raise")}>{raiseLabel}</button>
              <button class="sbtn mini" onclick={() => (raiseTo = bounds.minTo)}>Min</button>
              <button class="sbtn mini" onclick={() => t && seat && (raiseTo = potRaiseTo(t, seat))}>Pot</button>
              <button class="sbtn mini" onclick={() => (raiseTo = bounds.allInTo)}>All-in</button>
            </span>
          {/if}
        {:else if verdict}
          <!-- the verdict speaks below -->
        {:else if t.phase === "waiting"}
          <span class="snote">{t.seats.filter(Boolean).length < 2 ? "waiting for another player…" : "shuffling up…"}</span>
        {:else if seat.folded && live}
          <span class="snote">{myCards ? "folded — next hand soon" : "you're dealt in next hand"}</span>
        {:else if seat.allIn && live}
          <span class="snote">all in — running it out</span>
        {:else if live}
          <span class="snote">waiting for your turn…</span>
        {/if}
      {/if}
      {#if verdict}<span class="verdict {verdict.cls}">{verdict.word}</span>{/if}
      {#if err}<span class="serr">{err}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .hstrip {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 8px;
  }
  .hrow {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    width: 100%;
  }
  /* the way out sits apart, at the far right of the facts */
  .hrow .leave {
    margin-left: auto;
  }
  .hgroup {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .hgroup.raise {
    background: #00000066;
    border: 1px solid #3a3428;
    border-radius: 999px;
    padding: 4px 6px 4px 4px;
  }
  .hgroup.raise .snum {
    width: 92px;
    border-radius: 999px;
  }
  .hlab {
    color: #9a8f7a;
    font: 700 12px system-ui, sans-serif;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .strip .sbtn.mini {
    padding: 6px 11px;
    font-size: 12px;
  }
  .clock.mine {
    border-color: #e8c33c;
  }
  .clock.pulse {
    animation: hpulse 0.9s ease-in-out infinite;
    border-color: #c94f4f;
  }
  @keyframes hpulse {
    50% {
      box-shadow: 0 0 0 2px #c94f4f66, 0 0 14px #c94f4f55;
    }
  }
  .scard small {
    font-size: 13px;
  }
</style>
