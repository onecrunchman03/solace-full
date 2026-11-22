<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SlotsResult } from "../lib/api";
  import { slots, loadSlots, pullSlots, settleSlotsWallet } from "../lib/slots.svelte";
  import type { SlotsPull } from "../lib/api";
  import { wallet } from "../lib/wallet.svelte";
  import {
    ensureAudio, leverPull, playReels, reelStop, winJingle, loseThud,
    anticipation, coinTick, coinCascade,
  } from "../lib/slots-audio";
  import Coin from "./Coin.svelte";
  import { phone } from "../lib/phone.svelte";
  import felt from "../assets/casino-felt.webp";

  // Symbol id → display glyph. "bar" and "seven" get bespoke rendering (below).
  const GLYPH: Record<string, string> = {
    crown: "👑", diamond: "💎", bell: "🔔", cherry: "🍒", lemon: "🍋", clover: "🍀",
  };
  const SYMS = ["crown", "diamond", "seven", "bar", "bell", "cherry", "lemon", "clover"];
  // The spin-blur strip: a fixed varied sequence every reel scrolls through.
  const STRIP = [...SYMS, "cherry", "bar", "lemon", "seven", "clover", "bell"];
  /** Two of these on the line with one reel still turning = anticipation.
   *  Every symbol's triple pays now, so every locked pair is a tease. */
  const PAYING_TRIPLES = new Set(["crown", "diamond", "seven", "bar", "clover", "bell", "lemon", "cherry"]);
  const BULBS = Array(8).fill(0); // red marquee lights across the top
  // Fixed pseudo-random bokeh positions (stable across renders — no flicker).
  const MOTES = [
    { x: 7, y: 18, s: 5 }, { x: 16, y: 64, s: 3 }, { x: 23, y: 34, s: 7 },
    { x: 31, y: 78, s: 4 }, { x: 38, y: 12, s: 6 }, { x: 47, y: 52, s: 3 },
    { x: 55, y: 26, s: 8 }, { x: 62, y: 70, s: 4 }, { x: 70, y: 16, s: 5 },
    { x: 77, y: 44, s: 7 }, { x: 84, y: 62, s: 3 }, { x: 90, y: 28, s: 6 },
    { x: 12, y: 46, s: 4 }, { x: 95, y: 80, s: 5 },
  ];

  // The paytable, richest first — shown to the player (house edge is no secret).
  const PAYTABLE: { key: string; syms: string[]; pays: number; note?: string }[] = [
    { key: "crown", syms: ["crown", "crown", "crown"], pays: 250, note: "JACKPOT" },
    { key: "diamond", syms: ["diamond", "diamond", "diamond"], pays: 100 },
    { key: "seven", syms: ["seven", "seven", "seven"], pays: 75 },
    { key: "bar", syms: ["bar", "bar", "bar"], pays: 40 },
    { key: "clover", syms: ["clover", "clover", "clover"], pays: 30 },
    { key: "bell", syms: ["bell", "bell", "bell"], pays: 20 },
    { key: "lemon", syms: ["lemon", "lemon", "lemon"], pays: 15 },
    { key: "crown2", syms: ["crown", "crown"], pays: 15, note: "any two" },
    { key: "cherry3", syms: ["cherry", "cherry", "cherry"], pays: 10, note: "your stake back" },
    { key: "diamond2", syms: ["diamond", "diamond"], pays: 8, note: "any two" },
    { key: "seven2", syms: ["seven", "seven"], pays: 5, note: "any two" },
    { key: "cherry2", syms: ["cherry", "cherry"], pays: 4, note: "any two" },
    { key: "cherry1", syms: ["cherry"], pays: 1, note: "one cherry" },
  ];

  const WIN_LABEL: Record<string, string> = {
    crown: "💰 JACKPOT — TRIPLE CROWN 💰", diamond: "DIAMOND ROW", seven: "LUCKY SEVENS",
    bar: "TRIPLE BAR", clover: "CLOVER LUCK", bell: "TRIPLE BELL", lemon: "LEMONADE",
    crown2: "TWO CROWNS", cherry3: "CHERRIES", diamond2: "TWO DIAMONDS",
    seven2: "TWO SEVENS", cherry2: "TWO CHERRIES", cherry1: "A CHERRY",
  };

  let cells = $state<string[]>(["cherry", "seven", "bell"]);
  let stopped = $state<boolean[]>([true, true, true]);
  let spinning = $state(false);
  let pulling = $state(false); // the lever-arm animation
  let result = $state<SlotsResult | null>(null);
  let revealed = $state(false);
  let error = $state("");
  // Third-reel tease: two paying symbols locked, one reel still turning.
  let anticipating = $state(false);
  // The payout counter ticks up with coin clinks instead of appearing whole.
  let displayPayout = $state(0);

  let cycle: ReturnType<typeof setInterval> | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];

  // A pull whose payout hasn't landed in the wallet yet (reels still turning).
  let pendingSettle: SlotsPull | null = null;

  onMount(loadSlots);
  onDestroy(() => {
    clearTimers();
    // Walked away mid-spin: land the balance now so the wallet never drifts.
    if (pendingSettle) {
      settleSlotsWallet(pendingSettle);
      pendingSettle = null;
    }
  });

  function clearTimers() {
    if (cycle) {
      clearInterval(cycle);
      cycle = null;
    }
    timers.forEach(clearTimeout);
    timers = [];
  }

  // A free pull or a chips-covered pull needs no silver at all (E3b).
  const canPull = $derived(
    !spinning && (slots.freePulls > 0 || wallet.coins + slots.chips >= slots.cost),
  );

  /** Yank the lever: play the arm animation + ka-chunk, then spin. */
  function yank() {
    if (!canPull) return;
    ensureAudio(); // unlock audio on this user gesture
    leverPull();
    pulling = true;
    timers.push(setTimeout(() => (pulling = false), 950));
    void pull();
  }

  async function pull() {
    if (spinning || !(slots.freePulls > 0 || wallet.coins + slots.chips >= slots.cost)) return;
    error = "";
    result = null;
    revealed = false;
    anticipating = false;
    displayPayout = 0;
    spinning = true;
    stopped = [false, false, false];

    const r = await pullSlots();
    if (!r) {
      spinning = false;
      stopped = [true, true, true];
      error = "Couldn’t pull — try again.";
      return;
    }
    pendingSettle = r;

    // Two paying symbols on the line = the third reel holds for the tease.
    const tease = r.reels[0] === r.reels[1] && PAYING_TRIPLES.has(r.reels[0]);
    const stopAt = [750, 1150, tease ? 2950 : 1550];
    playReels(stopAt[2] + 120); // rattle for the whole spin

    // Stop the reels left-to-right, then reveal the outcome.
    r.reels.forEach((sym, i) => {
      timers.push(
        setTimeout(() => {
          stopped[i] = true;
          cells[i] = sym;
          cells = [...cells];
          reelStop(0.55 + i * 0.12); // each landing clunks a touch harder
          if (i === 1 && tease) {
            anticipating = true;
            anticipation(stopAt[2] - stopAt[1]);
          }
          if (i === 2) {
            anticipating = false;
            timers.push(
              setTimeout(() => {
                result = r.result;
                revealed = true;
                spinning = false;
                settleSlotsWallet(r); // payout lands WITH the reveal, not before
                pendingSettle = null;
                if (r.result.type === "win") {
                  winJingle(r.result.payout);
                  if (r.result.payout >= 75) coinCascade(r.result.payout >= 250 ? 40 : 20);
                  countUp(r.result.payout);
                } else {
                  loseThud();
                }
              }, 400),
            );
          }
        }, stopAt[i]),
      );
    });
  }

  /** Tick the payout number up with coin clinks (faster for big numbers). */
  function countUp(payout: number): void {
    const steps = Math.min(payout, 26);
    let step = 0;
    const iv = setInterval(() => {
      step++;
      displayPayout = Math.round((payout * step) / steps);
      if (step % 2 === 0 && payout >= 4) coinTick();
      if (step >= steps) {
        displayPayout = payout;
        clearInterval(iv);
      }
    }, payout >= 100 ? 65 : 45);
    timers.push(iv as unknown as ReturnType<typeof setTimeout>);
  }

  const won = $derived(revealed && result?.type === "win");
  const jackpot = $derived(won && result?.type === "win" && result.line === "crown");
</script>

{#snippet symbol(s: string)}
  {#if s === "bar"}
    <span class="bar">BAR</span>
  {:else if s === "seven"}
    <span class="seven">7</span>
  {:else}
    <span class="glyph">{GLYPH[s] ?? "❔"}</span>
  {/if}
{/snippet}

<div class="slots" style="--felt: url({felt})">
  <!-- gold bokeh sparkles floating over the felt -->
  <div class="bokeh" aria-hidden="true">
    {#each MOTES as m, i}
      <span class="mote" style="left:{m.x}%; top:{m.y}%; --size:{m.s}px; --delay:{i * -0.9}s"></span>
    {/each}
  </div>

  <!-- scattered casino chips, as set dressing -->
  <div class="chip red" aria-hidden="true"></div>
  <div class="chip black" aria-hidden="true"></div>
  <div class="chip red small" aria-hidden="true"></div>

  <div class="machine">
    <div class="body">
      <!-- The barrel machine: a horizontal gold drum with ribbed end caps,
           modelled on the reference render. -->
      <div class="barrel" class:win={won}>
        <div class="tube top">
          {#each BULBS as _, i}
            <span class="bulb" style="--i:{i}"></span>
          {/each}
        </div>

        <div class="drum" class:shake={jackpot}>
          <span class="cap left"><span class="hub"></span></span>
          <div class="window">
            <div class="reel-strip">
              {#each cells as sym, i (i)}
                <div class="reel" class:hit={won} class:anticipating={anticipating && i === 2}>
                  {#if !stopped[i]}
                    <!-- A real reel strip scrolling past the window, blurred. -->
                    <div class="strip" aria-hidden="true">
                      {#each [...STRIP, ...STRIP] as s, k (k)}
                        <div class="strip-cell">{@render symbol(s)}</div>
                      {/each}
                    </div>
                  {:else}
                    <!-- Lands with a drop-and-bounce (plays on mount). -->
                    <div class="landed">{@render symbol(sym)}</div>
                  {/if}
                </div>
              {/each}
            </div>
            <!-- Payline markers live on the glass edges; the line itself only
                 flashes across the reels when it actually pays. -->
            <span class="pl-mark left" aria-hidden="true"></span>
            <span class="pl-mark right" aria-hidden="true"></span>
            {#if won}<span class="line-flash" aria-hidden="true"></span>{/if}
            <span class="glass" aria-hidden="true"></span>
          </div>
          <span class="cap right"><span class="hub"></span></span>
        </div>

        <!-- LED readout: the machine's own credits/win panel. -->
        <div class="led">
          <span class="led-cell">CREDITS <b>{wallet.coins.toLocaleString()}</b></span>
          {#if slots.freePulls > 0}
            <span class="led-cell free">FREE <b>{slots.freePulls}</b></span>
          {:else if slots.chips > 0}
            <span class="led-cell free">CHIPS <b>{slots.chips.toLocaleString()}</b></span>
          {/if}
          <span class="led-msg" class:blink={won}>
            {#if won}WINNER PAID{:else if spinning}GOOD LUCK{:else}PULL TO PLAY{/if}
          </span>
          <span class="led-cell">WIN <b class:blink={won}>{won ? displayPayout : 0}</b></span>
        </div>

        <div class="tube bottom"></div>
      </div>

      <button
        class="pull-lever"
        class:pulling
        onclick={yank}
        disabled={!canPull}
        aria-label={wallet.coins < slots.cost ? `Need ${slots.cost} silver` : `Pull the lever — ${slots.cost} silver`}
        title={wallet.coins < slots.cost ? `Need ${slots.cost} silver` : `Pull the lever — ${slots.cost} silver`}
      >
        <!-- Mount bracket bolted to the cabinet, with the slot the arm rides in. -->
        <span class="mount"><span class="mount-slot"></span><span class="screw t"></span><span class="screw b"></span></span>
        <span class="hinge"></span>
        <span class="arm"><span class="rod"></span><span class="knob"></span></span>
      </button>
    </div>
  </div>

  <div class="controls">
    <div class="result" aria-live="polite">
      {#if error}
        <span class="lose">{error}</span>
      {:else if revealed && result}
        {#if result.type === "win"}
          <span class="win-line" class:jackpot>
            <b class="win-label">{WIN_LABEL[result.line] ?? "WINNER"}</b>
            <span class="payout">
              +{displayPayout}<Coin size={16} />
              {#if result.line === "cherry3"}<span class="sub">stake back</span>{/if}
            </span>
          </span>
        {:else}
          <span class="lose">No luck — pull again.</span>
        {/if}
      {:else if spinning}
        <span class="rolling">Rolling…</span>
      {:else if wallet.coins < slots.cost}
        <span class="lose">Need {slots.cost}<Coin size={13} /> to pull — sell emoji at the Trader.</span>
      {:else}
        <span class="idle">Pull the lever — {slots.cost} silver a spin.</span>
      {/if}
    </div>

    <div class="meter">
      <span class="bal"><Coin size={15} /> {wallet.coins.toLocaleString()} silver</span>
    </div>
  </div>

  <!-- THE PAYTABLE FOLDS AWAY ON A PHONE (Josh, Sep 2026: slots "needs a
       UI rework"). It is 492px of reference text under a 291px machine, so
       on a handset the game was a third of what you scrolled past. Open on
       anything bigger, where there is room for it beside the cabinet. -->
  <details class="paytable" open={!phone.on}>
    <summary class="pt-head">Paytable</summary>
    {#each PAYTABLE as row (row.key)}
      <div class="pt-row" class:hit={won && result?.type === "win" && result.line === row.key}>
        <span class="pt-syms">
          {#each row.syms as s}
            {#if s === "bar"}<span class="pt-bar">BAR</span>
            {:else if s === "seven"}<span class="pt-seven">7</span>
            {:else}<span>{GLYPH[s]}</span>{/if}
          {/each}
          {#each Array(3 - row.syms.length) as _}<span class="pt-any">·</span>{/each}
        </span>
        <span class="pt-pay">{row.pays}<Coin size={13} />{#if row.note}<span class="pt-note">{row.note}</span>{/if}</span>
      </div>
    {/each}
    <div class="pt-foot">No timer, no free pulls — the silver is the throttle.</div>
  </details>
</div>

<style>
  /* ---- Casino scene: the reference felt under a dark vignette ---- */
  .slots {
    position: relative;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding: 44px 24px 44px;
    background:
      radial-gradient(1100px 520px at 50% 0%, rgba(255, 208, 120, 0.16), transparent 62%),
      radial-gradient(circle at 50% 42%, transparent 40%, rgba(0, 0, 0, 0.66) 100%),
      linear-gradient(rgba(6, 14, 9, 0.42), rgba(4, 10, 7, 0.6)),
      var(--felt) center / cover no-repeat fixed,
      #0a1810;
  }

  /* Gold bokeh motes drifting up, like the reference's sparkle field. */
  .bokeh {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .mote {
    position: absolute;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, rgba(255, 236, 180, 0.9), rgba(255, 190, 90, 0.25) 70%, transparent);
    filter: blur(0.5px);
    opacity: 0.5;
    animation: drift 9s ease-in-out infinite;
    animation-delay: var(--delay);
  }
  @keyframes drift {
    0%, 100% { transform: translateY(0); opacity: 0.28; }
    50% { transform: translateY(-26px); opacity: 0.75; }
  }

  /* ---- Set dressing: striped casino chips ---- */
  .chip {
    position: absolute;
    width: 74px;
    height: 74px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.55), inset 0 2px 3px rgba(255, 255, 255, 0.35);
  }
  .chip::before {
    /* the edge stripes */
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: repeating-conic-gradient(#f2ede2 0 20deg, var(--chip-c, #c2242c) 20deg 60deg);
    -webkit-mask: radial-gradient(circle, transparent 58%, #000 59%);
    mask: radial-gradient(circle, transparent 58%, #000 59%);
  }
  .chip::after {
    /* the inlay centre */
    content: "";
    position: absolute;
    inset: 18%;
    border-radius: 50%;
    background:
      radial-gradient(circle at 38% 30%, rgba(255, 255, 255, 0.28), transparent 55%),
      var(--chip-c, #c2242c);
    box-shadow: inset 0 0 0 2px rgba(242, 237, 226, 0.7), inset 0 2px 4px rgba(0, 0, 0, 0.35);
  }
  .chip.red { --chip-c: #c2242c; left: 6%; bottom: 60px; transform: rotate(-14deg); }
  .chip.black { --chip-c: #23262b; right: 7%; bottom: 96px; transform: rotate(9deg); }
  .chip.red.small { width: 52px; height: 52px; left: 12%; bottom: 118px; transform: rotate(24deg); }

  .machine,
  .controls,
  .paytable {
    width: min(520px, 100%);
    position: relative;
    z-index: 1;
  }
  .machine {
    display: flex;
    flex-direction: column;
  }

  .body {
    display: flex;
    align-items: center;
    gap: 2px;
    width: 100%;
  }

  /* ---- The barrel: a horizontal gold drum (the reference machine) ---- */
  .barrel {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-radius: 26px;
    filter: drop-shadow(0 26px 40px rgba(0, 0, 0, 0.6));
    transition: filter 0.25s ease;
  }
  .barrel.win {
    filter: drop-shadow(0 26px 40px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 34px rgba(240, 190, 90, 0.55));
  }

  /* Ribbed gold tubes above + below the reels, like the reference frame. */
  .tube {
    position: relative;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 56px;
    background:
      linear-gradient(180deg, #6b4a12 0%, #caa04a 12%, #fdeeb0 30%, #eec25c 48%, #b98a2e 72%, #684812 100%);
    box-shadow: inset 0 0 0 1px rgba(90, 62, 16, 0.6);
  }
  .tube.top {
    border-radius: 26px 26px 8px 8px;
  }
  .tube.bottom {
    height: 38px;
    border-radius: 8px 8px 26px 26px;
    background:
      linear-gradient(0deg, #543a0e 0%, #b98a2e 22%, #f4d383 45%, #d3a93f 64%, #8a5f1c 100%);
  }
  .bulb {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 28%, #ffd0d0 0%, #ff4040 32%, #cf1414 68%, #760505 100%);
    box-shadow:
      0 0 6px rgba(255, 60, 60, 0.8),
      inset 0 -2px 2px rgba(90, 0, 0, 0.6),
      inset 0 2px 2px rgba(255, 255, 255, 0.55);
  }
  /* Idle: a slow chase shimmer walks across the marquee bulbs. */
  .bulb {
    animation: idle-chase 2.8s ease-in-out infinite;
    animation-delay: calc(var(--i) * 0.35s);
  }
  @keyframes idle-chase {
    0%, 24%, 100% { filter: brightness(1); }
    12% { filter: brightness(1.55); }
  }
  .barrel.win .bulb {
    animation: blink 0.5s steps(1, end) infinite;
    animation-delay: calc(var(--i) * 0.06s);
  }
  @keyframes blink {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(2); }
  }

  /* ---- Drum row: ribbed cylinder end caps flanking the reels ---- */
  .drum {
    display: flex;
    align-items: stretch;
    gap: 0;
    min-height: 168px;
  }
  .cap {
    position: relative;
    flex: none;
    width: 54px;
    display: grid;
    place-items: center;
    /* horizontal ridges = a ribbed cylinder cap seen side-on */
    background:
      repeating-linear-gradient(180deg, rgba(120, 80, 20, 0.35) 0 4px, transparent 4px 9px),
      linear-gradient(180deg, #7c5716 0%, #d7a842 16%, #fdeeb0 38%, #ecc35d 55%, #b98a2e 78%, #684812 100%);
    box-shadow:
      inset 0 0 0 1px rgba(90, 62, 16, 0.55),
      inset 6px 0 10px -6px rgba(60, 38, 8, 0.8),
      inset -6px 0 10px -6px rgba(60, 38, 8, 0.8);
  }
  .cap.left {
    border-radius: 22px 0 0 22px;
  }
  .cap.right {
    border-radius: 0 22px 22px 0;
  }
  .cap .hub {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 34%, #fff0bf 0%, #d7a53c 55%, #7c5516 100%);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.6);
  }
  .window {
    position: relative;
    flex: 1;
    min-width: 0;
    padding: 10px 8px;
    background: linear-gradient(175deg, #e6bd5c 0%, #c8912f 55%, #9a6a1e 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 250, 220, 0.55),
      inset 0 -3px 6px rgba(66, 40, 8, 0.5);
  }
  /* Payline markers: small gold arrows on the glass edges (no line across
     the symbols at rest — the old permanent red line read as a glitch). */
  .pl-mark {
    position: absolute;
    top: 50%;
    margin-top: -6px;
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    pointer-events: none;
    z-index: 2;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
  }
  .pl-mark.left {
    left: 1px;
    border-left: 8px solid #f3cf6e;
  }
  .pl-mark.right {
    right: 1px;
    border-right: 8px solid #f3cf6e;
  }
  /* The line itself only exists during a win: three quick pulses, then gone. */
  .line-flash {
    position: absolute;
    left: 12px;
    right: 12px;
    top: 50%;
    height: 3px;
    margin-top: -1.5px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent, #ffd97a 12%, #fff3c9 50%, #ffd97a 88%, transparent);
    box-shadow: 0 0 12px rgba(255, 200, 90, 0.9);
    pointer-events: none;
    z-index: 2;
    animation: line-pulse 1.6s ease-out forwards;
  }
  @keyframes line-pulse {
    0%, 24%, 48% { opacity: 1; }
    12%, 36% { opacity: 0.15; }
    80% { opacity: 0.7; }
    100% { opacity: 0; }
  }

  /* ---- LED credits/win readout ---- */
  .led {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 22px;
    background: linear-gradient(180deg, #17120a, #241b0e 60%, #17120a);
    border-top: 2px solid rgba(90, 62, 16, 0.9);
    border-bottom: 2px solid rgba(90, 62, 16, 0.9);
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    color: rgba(255, 200, 110, 0.5);
  }
  .led-cell.free { color: #7df0a8; } /* the escape room's balances glow green */
  .led b {
    color: #ffc966;
    font-weight: 700;
    text-shadow: 0 0 6px rgba(255, 170, 60, 0.6);
    font-variant-numeric: tabular-nums;
  }
  .led-msg {
    color: rgba(255, 200, 110, 0.75);
    font-weight: 700;
  }
  .led .blink {
    animation: led-blink 0.55s steps(1, end) infinite;
  }
  @keyframes led-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
  .reel-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px; /* the gold behind shows through as metallic reel dividers */
    height: 100%;
    background: linear-gradient(180deg, #efc264 0%, #c8912f 55%, #9a6a1e 100%);
    border: 3px solid #5f4111;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: inset 0 3px 11px rgba(0, 0, 0, 0.62);
  }
  .reel {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    /* a white cylinder: bright specular band above centre, curving to grey at the rims */
    background: linear-gradient(
      180deg,
      #6f6f6f 0%, #9e9e9e 4%, #d4d4d4 14%,
      #ffffff 32%, #ffffff 43%, #ededed 58%,
      #cbcbcb 74%, #999999 90%, #666666 100%
    );
    box-shadow:
      inset 0 14px 15px -8px rgba(0, 0, 0, 0.6),
      inset 0 -16px 17px -8px rgba(0, 0, 0, 0.64);
  }
  .reel .glyph {
    font-size: 2.9rem;
    line-height: 1;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
  }
  .reel .seven {
    font: italic 900 3.4rem/1 Georgia, "Times New Roman", serif;
    color: #e01b1b;
    text-shadow:
      -1.5px -1.5px 0 #6e0a0a, 1.5px -1.5px 0 #6e0a0a,
      -1.5px 1.5px 0 #6e0a0a, 1.5px 1.5px 0 #6e0a0a,
      0 3px 3px rgba(0, 0, 0, 0.35);
  }
  .reel .bar {
    font-weight: 900;
    font-size: 1.5rem;
    letter-spacing: 0.04em;
    color: #fff;
    background: #1a1a1a;
    padding: 4px 10px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 2px #d4a53a, 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  /* The scrolling strip: a stack of symbols racing past the window. Doubled
     content + -50% keyframe = a seamless loop; static blur sells the speed. */
  .strip {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    filter: blur(2px);
    animation: strip-scroll 0.32s linear infinite;
    will-change: transform;
  }
  /* Half-height cells: two symbols racing past at once — a much faster read. */
  .strip-cell {
    flex: none;
    height: 50%;
    display: grid;
    place-items: center;
  }
  @keyframes strip-scroll {
    from { transform: translateY(0); }
    to { transform: translateY(-50%); }
  }
  /* The landed symbol drops in from above and bounces to rest (on mount). */
  .landed {
    display: grid;
    place-items: center;
    animation: land 0.34s cubic-bezier(0.2, 0.9, 0.3, 1.25);
  }
  @keyframes land {
    0% { transform: translateY(-95%); }
    62% { transform: translateY(7%); }
    82% { transform: translateY(-4%); }
    100% { transform: translateY(0); }
  }
  /* Third-reel tease: two paying symbols locked, the last reel holds. */
  .reel.anticipating {
    box-shadow:
      inset 0 14px 15px -8px rgba(0, 0, 0, 0.6),
      inset 0 -16px 17px -8px rgba(0, 0, 0, 0.64),
      inset 0 0 26px rgba(255, 70, 50, 0.55);
    animation: anticipate-pulse 0.5s ease-in-out infinite;
  }
  @keyframes anticipate-pulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.18); }
  }
  .reel.hit {
    box-shadow:
      inset 0 14px 15px -8px rgba(0, 0, 0, 0.45),
      inset 0 -16px 17px -8px rgba(0, 0, 0, 0.48),
      inset 0 0 24px rgba(231, 178, 74, 0.65);
  }
  /* Jackpot: the whole drum rattles in its housing. */
  .drum.shake {
    animation: drum-shake 0.55s ease-in-out;
  }
  @keyframes drum-shake {
    0%, 100% { transform: translate(0, 0); }
    15% { transform: translate(-3px, 1px); }
    30% { transform: translate(3px, -1px); }
    45% { transform: translate(-2px, -1px); }
    60% { transform: translate(2px, 1px); }
    75% { transform: translate(-1px, 0); }
  }
  /* Curved glass over the reels: a diagonal specular sweep. */
  .glass {
    position: absolute;
    inset: 10px 8px;
    border-radius: 8px;
    pointer-events: none;
    background:
      linear-gradient(112deg, transparent 28%, rgba(255, 255, 255, 0.14) 38%, rgba(255, 255, 255, 0.03) 48%, transparent 55%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.12));
  }

  /* ---- The pull lever: bracket-mounted arm that arcs down and springs back ---- */
  .pull-lever {
    position: relative;
    flex: none;
    width: 78px;
    align-self: stretch;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .pull-lever:disabled {
    cursor: default;
    opacity: 0.45;
    filter: grayscale(0.5);
  }
  /* The bracket plate bolted to the cabinet side, with the guide slot. */
  .mount {
    position: absolute;
    left: 2px;
    top: 26%;
    width: 16px;
    height: 52%;
    border-radius: 8px;
    background: linear-gradient(90deg, #8a5f1c 0%, #e6c368 35%, #fdeeb0 50%, #d3a93f 68%, #7c5516 100%);
    box-shadow:
      2px 3px 6px rgba(0, 0, 0, 0.5),
      inset 0 1px 1px rgba(255, 255, 255, 0.55);
  }
  .mount-slot {
    position: absolute;
    left: 50%;
    top: 12%;
    bottom: 12%;
    width: 4px;
    margin-left: -2px;
    border-radius: 3px;
    background: linear-gradient(180deg, #241505, #47300c);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.9);
  }
  .screw {
    position: absolute;
    left: 50%;
    margin-left: -3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff2c8, #a97a22 70%);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .screw.t { top: 3px; }
  .screw.b { bottom: 3px; }
  .hinge {
    position: absolute;
    left: 34%;
    top: 54%;
    transform: translate(-50%, -50%);
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 32%, #ffeaad 0%, #d7a13a 55%, #8a5f1c 100%);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.45),
      inset 0 -2px 3px rgba(66, 40, 8, 0.5),
      inset 0 2px 2px rgba(255, 255, 255, 0.5);
    z-index: 2;
  }
  .hinge::after {
    /* the axle nut */
    content: "";
    position: absolute;
    inset: 32%;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 32%, #6b6b6b, #2c2c2c 75%);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.35);
  }
  .arm {
    position: absolute;
    left: 34%;
    top: 54%;
    width: 12px;
    height: 116px;
    margin-left: -6px;
    margin-top: -110px;
    transform-origin: 50% calc(100% - 6px);
    transform: rotate(9deg); /* resting: leaned slightly out of the slot */
    will-change: transform;
  }
  .rod {
    position: absolute;
    inset: 0;
    /* tapered chrome: thicker at the pivot, slimmer at the knob */
    clip-path: polygon(22% 0, 78% 0, 100% 100%, 0 100%);
    border-radius: 7px;
    background: linear-gradient(90deg, #6b6b6b 0%, #d6d6d6 40%, #ffffff 50%, #bcbcbc 62%, #676767 100%);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
  }
  .knob {
    position: absolute;
    top: -21px;
    left: 50%;
    transform: translateX(-50%);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, #ffd0d0 0%, #ff3f3f 30%, #d21616 64%, #7c0606 100%);
    box-shadow:
      0 5px 9px rgba(0, 0, 0, 0.55),
      inset 0 -5px 7px rgba(90, 0, 0, 0.55),
      inset 0 3px 5px rgba(255, 255, 255, 0.6);
  }
  .knob::after {
    /* the specular window that makes it read as polished bakelite */
    content: "";
    position: absolute;
    left: 22%;
    top: 14%;
    width: 34%;
    height: 26%;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.85), transparent 70%);
  }
  /* The throw: haul down through a real arc (the knob leads), hit the stop,
     then spring back with a diminishing wobble — like a real one-armed bandit. */
  .pull-lever.pulling .arm {
    animation: yank 0.95s cubic-bezier(0.3, 0.04, 0.4, 1);
  }
  @keyframes yank {
    0% { transform: rotate(9deg); }
    22% { transform: rotate(136deg); }
    34% { transform: rotate(141deg); } /* pressed against the bottom stop */
    52% { transform: rotate(-26deg); } /* springs back past rest */
    66% { transform: rotate(24deg); }
    78% { transform: rotate(1deg); }
    88% { transform: rotate(13deg); }
    100% { transform: rotate(9deg); }
  }
  /* The knob squashes slightly at the bottom of the throw. */
  .pull-lever.pulling .knob {
    animation: knob-squash 0.95s cubic-bezier(0.3, 0.04, 0.4, 1);
  }
  @keyframes knob-squash {
    0%, 45%, 100% { transform: translateX(-50%) scale(1); }
    28% { transform: translateX(-50%) scale(1.06, 0.9); }
  }
  .pull-lever:hover:not(:disabled) .knob {
    filter: brightness(1.08);
  }
  .pull-lever:hover:not(:disabled) .arm {
    transform: rotate(13deg); /* invites the pull */
    transition: transform 0.15s ease;
  }
  /* The whole cabinet dips as the lever slams its stop. */
  .body:has(.pull-lever.pulling) .barrel {
    animation: cab-nudge 0.95s ease;
  }
  @keyframes cab-nudge {
    0%, 18%, 46%, 100% { transform: translateY(0); }
    26% { transform: translateY(2.5px); }
    34% { transform: translateY(1.5px); }
  }

  /* ---- Controls under the machine ---- */
  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
  }
  .result {
    min-height: 40px;
    display: grid;
    place-items: center;
    text-align: center;
    width: 100%;
  }
  .win-line {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .win-label {
    color: #ffd76a;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-shadow: 0 1px 6px rgba(231, 178, 74, 0.5);
  }
  .win-line.jackpot .win-label {
    font-size: 1.05rem;
    animation: jackpot-glow 0.6s ease-in-out infinite alternate;
  }
  @keyframes jackpot-glow {
    from { text-shadow: 0 1px 6px rgba(231, 178, 74, 0.5); }
    to { text-shadow: 0 0 18px rgba(255, 210, 110, 0.95); }
  }
  .payout {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 800;
    color: #ffe9a8;
  }
  .payout .sub {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-dim);
    margin-left: 4px;
  }
  .lose,
  .idle,
  .rolling {
    color: rgba(255, 240, 220, 0.72);
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .idle {
    color: rgba(255, 240, 220, 0.5);
  }
  .meter {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.86rem;
  }
  .bal {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 700;
    color: #fbe9b8;
  }

  /* ---- Paytable ---- */
  .paytable {
    padding: 14px 18px;
    background: rgba(26, 19, 11, 0.72);
    border: 1px solid rgba(150, 106, 33, 0.5);
    border-radius: 14px;
    font-size: 0.86rem;
    backdrop-filter: blur(3px);
  }
  /* A PHONE (Josh, Sep 2026: slots "needs a UI rework"). Three things: the
     paytable folds (see the markup), the decorative chips stand down because
     they were peeking out from behind the panels rather than dressing a
     felt with room on it, and the cabinet takes the width it is given so it
     stops being cropped. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    .chip {
      display: none;
    }
    .machine {
      width: 100%;
      max-width: 420px;
    }
    .paytable {
      width: 100%;
    }
    /* A closed <details> still needs to look like something you can press. */
  }

  .pt-head {
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.72rem;
    color: #d8b25e;
    margin-bottom: 8px;
  }
  .pt-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
  }
  .pt-row + .pt-row {
    border-top: 1px solid rgba(150, 106, 33, 0.28);
  }
  .pt-row.hit {
    background: rgba(231, 178, 74, 0.14);
    box-shadow: inset 2px 0 0 #eab348;
    border-radius: 4px;
    padding-left: 6px;
    padding-right: 6px;
    margin: 0 -6px;
  }
  .pt-syms {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 1.15rem;
  }
  .pt-bar {
    font-size: 0.66rem;
    font-weight: 900;
    color: #fff;
    background: #1a1a1a;
    border-radius: 3px;
    padding: 1px 4px;
    box-shadow: inset 0 0 0 1.5px #d4a53a;
  }
  .pt-seven {
    font: italic 900 1.2rem/1 Georgia, serif;
    color: #e01b1b;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
  }
  .pt-any {
    color: rgba(255, 240, 220, 0.4);
    font-size: 1rem;
  }
  .pt-pay {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    color: #f3e2bf;
  }
  .pt-note {
    font-size: 0.72rem;
    font-weight: 500;
    color: rgba(255, 240, 220, 0.45);
    margin-left: 5px;
  }
  .pt-foot {
    margin-top: 10px;
    font-size: 0.74rem;
    color: rgba(255, 240, 220, 0.4);
  }

  /* The folded paytable's summary row.
     PLACED AT THE END OF THE SHEET ON PURPOSE. These properties are also set
     by the ordinary rules above, at the same specificity, so whichever comes
     LATER wins — and in their original home (up with the other phone rules)
     they lost and did nothing at all. Caught by test_touch_floor.mjs, which
     now fails on exactly this shape. Anything added here must stay below. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    .pt-head {
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .paytable[open] .pt-head {
      margin-bottom: 8px;
    }
  }
</style>
