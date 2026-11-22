<script lang="ts">
  // THE STONE OF THE ABYSS — the card that opens when you click it in your
  // inventory. The stone, the phrase it presses into your mind, and the
  // choice to say it. Saying it opens THE PORTAL (lib/abyss.svelte.ts).
  // Mounted once, app-level (App.svelte), on the modal floor.
  import { onDestroy } from "svelte";
  import { abyss, hideStone, speakPhrase } from "../lib/abyss.svelte";
  import { go } from "../lib/nav.svelte";
  import { sfxContext, sfxOut } from "../lib/sfx";

  const src = "/emoji/abyss/stone.png";

  let card = $state<HTMLDivElement | null>(null);

  // A modal takes the keyboard with it: without this, Escape went to whatever
  // was focused behind the scrim (the stone tile in the grid) and the card was
  // dismissible only by accident. Same shape as ConfirmDialog.
  $effect(() => {
    if (abyss.showing && card) card.focus();
  });

  // The low hum under the phrase. Two detuned saws and a triangle through a
  // sweeping lowpass — scheduled against the APP'S OWN context and out through
  // sfxOut(), so it obeys the App-sounds slider like every other sound here.
  // A private AudioContext would ignore that slider and leak one per press.
  let humStop: (() => void) | null = null;
  function hum(): void {
    try {
      const ctx = sfxContext();
      const out = sfxOut();
      if (!ctx || !out) return;
      humStop?.();
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      lp.Q.value = 6;
      lp.connect(g).connect(out);
      const t = ctx.currentTime;
      const oscs = ([[55, "sawtooth"], [55.7, "sawtooth"], [110.3, "triangle"]] as const).map(([f, type]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.connect(lp);
        o.start(t);
        o.stop(t + 3.2);
        return o;
      });
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.9);
      g.gain.setValueAtTime(0.16, t + 1.9);
      g.gain.linearRampToValueAtTime(0, t + 3.1);
      lp.frequency.setValueAtTime(220, t);
      lp.frequency.exponentialRampToValueAtTime(1400, t + 1.8);
      lp.frequency.exponentialRampToValueAtTime(90, t + 3.1);
      humStop = () => {
        for (const o of oscs) {
          try { o.stop(); } catch { /* already stopped */ }
        }
        try { g.disconnect(); } catch { /* gone */ }
        humStop = null;
      };
      setTimeout(() => humStop?.(), 3400);
    } catch {
      /* no audio — the light still does the talking */
    }
  }
  onDestroy(() => humStop?.());

  async function speak(): Promise<void> {
    if (abyss.busy) return;
    hum();
    await speakPhrase();
  }

  function onKey(e: KeyboardEvent): void {
    if (!abyss.showing) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      hideStone();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if abyss.showing}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" class:speaking={abyss.speaking} onclick={hideStone} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="card"
      role="dialog"
      aria-modal="true"
      aria-label="The Stone of the Abyss"
      bind:this={card}
      onclick={(e) => e.stopPropagation()}
      tabindex="-1"
    >
      <div class="stonewrap" class:speaking={abyss.speaking}>
        <span class="ripple"></span>
        <span class="ripple two"></span>
        <img class="stone" {src} alt="" draggable="false" />
      </div>

      <div class="kicker">STONE OF THE ABYSS</div>

      {#if !abyss.stone}
        <p class="body">It is not in your hand.</p>
        <div class="row"><button class="btn quiet" onclick={hideStone}>Close</button></div>
      {:else if abyss.speaking}
        <p class="phrase said">{abyss.phrase}</p>
        <p class="body dim">The glow answers.</p>
      {:else}
        <p class="body">
          The stone glows, warm in a way stone shouldn't be, and something in the light reaches for you.
          Not a voice. A shape pressed into the back of your mind, asking to be said aloud:
        </p>
        <p class="phrase">{abyss.phrase}</p>
        {#if abyss.error}<p class="err">{abyss.error}</p>{/if}
        <div class="row">
          {#if abyss.opened}
            <button class="btn go" onclick={() => { hideStone(); go("portal"); }}>Go through</button>
            <button class="btn quiet" onclick={speak} disabled={abyss.busy}>Say it again</button>
          {:else}
            <button class="btn go" onclick={speak} disabled={abyss.busy}>Say it</button>
          {/if}
          <button class="btn quiet" onclick={hideStone}>Put it away</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(3, 0, 10, 0.82);
    backdrop-filter: blur(6px);
    transition: background 1.6s ease;
  }
  .scrim.speaking {
    background: rgba(8, 0, 22, 0.97);
  }
  .card {
    width: min(100%, 520px);
    padding: 28px 26px 22px;
    border-radius: 18px;
    background: radial-gradient(120% 90% at 50% 0%, rgba(80, 30, 140, 0.35), rgba(10, 5, 22, 0.95) 55%);
    border: 1px solid rgba(150, 90, 255, 0.25);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 0 60px rgba(90, 30, 170, 0.12);
    color: #e7dcff;
    text-align: center;
    outline: none;
  }
  .stonewrap {
    position: relative;
    width: 200px;
    height: 200px;
    margin: 0 auto 10px;
    display: grid;
    place-items: center;
  }
  .stone {
    width: 200px;
    height: 200px;
    object-fit: contain;
    filter: drop-shadow(0 0 14px rgba(140, 70, 255, 0.55));
    animation: breathe 3.6s ease-in-out infinite;
    transition: transform 1.8s cubic-bezier(0.2, 0.8, 0.2, 1), filter 1.8s ease;
    user-select: none;
  }
  .stonewrap.speaking .stone {
    transform: scale(1.18);
    filter: drop-shadow(0 0 40px rgba(180, 110, 255, 0.95)) brightness(1.35);
    animation: none;
  }
  .ripple {
    position: absolute;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 2px solid rgba(190, 130, 255, 0.7);
    opacity: 0;
    pointer-events: none;
  }
  .stonewrap.speaking .ripple {
    animation: ripple 2.2s ease-out forwards;
  }
  .stonewrap.speaking .ripple.two {
    animation-delay: 0.7s;
  }
  .kicker {
    font-size: 0.72rem;
    letter-spacing: 0.24em;
    color: #b48cff;
    margin-bottom: 8px;
  }
  .body {
    margin: 0 0 12px;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #cfc2ee;
  }
  .body.dim {
    color: #8f7fb8;
  }
  .phrase {
    margin: 6px 0 18px;
    font-style: italic;
    font-size: 1.25rem;
    letter-spacing: 0.08em;
    color: #f0e6ff;
    text-shadow: 0 0 18px rgba(170, 100, 255, 0.7);
  }
  .phrase.said {
    animation: said 2.2s ease-in-out forwards;
  }
  .err {
    margin: -6px 0 14px;
    font-size: 0.85rem;
    color: #ffb4a8;
  }
  .row {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .btn {
    border: 1px solid rgba(160, 110, 255, 0.4);
    background: rgba(90, 40, 170, 0.35);
    color: #f1e9ff;
    padding: 10px 18px;
    border-radius: 999px;
    font: inherit;
    cursor: pointer;
  }
  .btn.go {
    background: linear-gradient(180deg, rgba(150, 80, 255, 0.8), rgba(90, 30, 190, 0.9));
    box-shadow: 0 0 22px rgba(140, 70, 255, 0.45);
  }
  .btn.quiet {
    background: transparent;
    color: #b9a9dd;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  @keyframes breathe {
    0%, 100% { filter: drop-shadow(0 0 12px rgba(140, 70, 255, 0.45)); }
    50% { filter: drop-shadow(0 0 26px rgba(170, 100, 255, 0.8)); }
  }
  @keyframes ripple {
    0% { transform: scale(0.6); opacity: 0.9; }
    100% { transform: scale(3.2); opacity: 0; }
  }
  @keyframes said {
    0% { opacity: 1; letter-spacing: 0.08em; }
    100% { opacity: 0.15; letter-spacing: 0.3em; filter: blur(2px); }
  }
  /* A still page for anyone who asked for one. The card still reads; only the
     motion stops (the house rule the older overlays already follow). */
  @media (prefers-reduced-motion: reduce) {
    .stone,
    .stonewrap.speaking .stone,
    .ripple,
    .phrase.said {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
