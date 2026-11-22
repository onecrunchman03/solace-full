<script lang="ts">
  // Roulette from the physical table: everyone's chips and the results are ON
  // the felt (felts.ts); the strip is the chip picker and the bet buttons.
  // Straight numbers open a compact 0-36 pad.
  import { roulette, placeRouletteBet, clearRouletteBets } from "../../lib/roulette.svelte";
  import { wallet } from "../../lib/wallet.svelte";
  import { session } from "../../lib/session.svelte";
  import "./strip.css";

  const CHIPS = [5, 10, 25, 50, 100];
  /** Table limit — mirrors the server's MAX_OUTSIDE/MAX_STRAIGHT (roulette.ts,
   *  raised to 5,000 Aug 2026 with the custom-stake box). */
  const MAX_BET = 5000;
  let chip = $state(10);
  /** The custom stake (Josh: "bet a custom number up to 5000 as well as the
   *  chips"). Non-null and valid = it overrides the chip buttons. */
  let custom = $state<number | null>(null);
  const stake = $derived(
    custom !== null && Number.isInteger(custom) && custom >= 5 && custom <= MAX_BET ? custom : chip,
  );
  let pad = $state(false);
  let err = $state<string | null>(null);

  const st = $derived(roulette.state);
  const bettable = $derived(st?.phase === "betting" || st?.phase === "idle" || st?.phase === "settled");
  const mine = $derived(
    st?.bets.filter((b) => b.user.id === session.user?.id).reduce((a, b) => a + b.amount, 0) ?? 0,
  );

  let now = $state(Date.now());
  $effect(() => {
    const iv = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(iv);
  });
  const secs = $derived(st?.endsAt && st.phase === "betting" ? Math.max(0, Math.ceil((st.endsAt - now) / 1000)) : null);

  async function bet(kind: string, target: number | null = null): Promise<void> {
    err = null;
    if (custom !== null && stake !== custom) {
      err = `custom stakes are 5–${MAX_BET} whole silver`;
      setTimeout(() => (err = null), 2500);
      return;
    }
    try {
      await placeRouletteBet(kind, target, stake);
    } catch {
      err = "That bet didn't land.";
      setTimeout(() => (err = null), 2500);
    }
  }

  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
</script>

<div class="strip">
  <span class="schip">you <b>{wallet.coins}</b>{#if mine > 0}&nbsp;· down <b>{mine}</b>{/if}</span>
  {#if secs !== null}<span class="schip">bets close <b>{secs}s</b></span>{/if}
  {#if st?.phase === "spinning"}<span class="schip">no more bets — the ball is rolling</span>{/if}
  {#if st?.pocket !== null && st?.pocket !== undefined && roulette.revealed}
    <span class="pocket" class:red={RED.has(st.pocket)} class:green={st.pocket === 0}>{st.pocket}</span>
  {/if}
  {#if st && (roulette.revealed ? st.history : st.history.slice(1)).length}
    <span class="hist">
      {#each (roulette.revealed ? st.history : st.history.slice(1)).slice(0, 6) as h, i (i)}
        <span class="hnum" class:red={RED.has(h)} class:green={h === 0}>{h}</span>
      {/each}
    </span>
  {/if}
  {#each CHIPS as c (c)}
    <button class="sbtn" class:hot={custom === null && chip === c} onclick={() => { chip = c; custom = null; }}>{c}</button>
  {/each}
  <!-- the custom stake — up to 5,000, riding every bet button like a chip -->
  <input
    class="betnum"
    class:hot={custom !== null}
    type="number"
    min="5"
    max={MAX_BET}
    step="1"
    placeholder="custom"
    bind:value={custom}
  />
  <button class="sbtn" class:hot={pad} onclick={() => (pad = !pad)} disabled={!bettable}>NUMBER…</button>
  <button class="sbtn" onclick={() => bet("red")} disabled={!bettable}>RED</button>
  <button class="sbtn" onclick={() => bet("black")} disabled={!bettable}>BLACK</button>
  <button class="sbtn" onclick={() => bet("odd")} disabled={!bettable}>ODD</button>
  <button class="sbtn" onclick={() => bet("even")} disabled={!bettable}>EVEN</button>
  <button class="sbtn" onclick={() => bet("low")} disabled={!bettable}>1–18</button>
  <button class="sbtn" onclick={() => bet("high")} disabled={!bettable}>19–36</button>
  <button class="sbtn" onclick={() => bet("dozen1")} disabled={!bettable}>1st 12</button>
  <button class="sbtn" onclick={() => bet("dozen2")} disabled={!bettable}>2nd 12</button>
  <button class="sbtn" onclick={() => bet("dozen3")} disabled={!bettable}>3rd 12</button>
  {#if mine > 0 && bettable}
    <button class="sbtn danger" onclick={() => clearRouletteBets()}>clear my bets</button>
  {/if}
  {#if err}<span class="serr">{err}</span>{/if}
</div>
{#if pad}
  <div class="numpad">
    <button class="np zero" onclick={() => bet("straight", 0)}>0</button>
    {#each Array.from({ length: 36 }, (_, i) => i + 1) as n (n)}
      <button class="np" class:red={RED.has(n)} onclick={() => bet("straight", n)}>{n}</button>
    {/each}
  </div>
{/if}

<style>
  .pocket {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #20242c;
    border: 2px solid #e8c33c;
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: 800 17px system-ui, sans-serif;
  }
  .pocket.red {
    background: #a32c2c;
  }
  .pocket.green {
    background: #2e7d46;
  }
  .hist {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .hnum {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #20242c;
    color: #d8d2c4;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: 700 12px system-ui, sans-serif;
  }
  .hnum.red {
    background: #6a2727;
  }
  .hnum.green {
    background: #23573a;
  }
  .numpad {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
    padding: 0 16px 8px;
    max-width: 760px;
    margin: 0 auto;
    pointer-events: auto;
  }
  .np {
    background: #20242cdd;
    border: 1px solid #3a4050;
    color: #d8d2c4;
    border-radius: 8px;
    padding: 7px 0;
    font: 700 13px system-ui, sans-serif;
    cursor: pointer;
  }
  .np.red {
    background: #6a2727dd;
    border-color: #8a4040;
  }
  .np.zero {
    background: #23573add;
    border-color: #3a7a54;
  }
  .np:hover {
    border-color: #e8c33c;
  }
  .betnum {
    width: 84px;
    background: #20242cdd;
    border: 1px solid #3a4050;
    color: #d8d2c4;
    border-radius: 8px;
    padding: 6px 8px;
    font: 700 13px system-ui, sans-serif;
  }
  .betnum.hot {
    border-color: #e8c33c;
    color: #e8c33c;
  }
  .betnum:focus {
    outline: none;
    border-color: #e8c33c;
  }
</style>
