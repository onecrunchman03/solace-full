<script lang="ts">
  // THE WAKE — what a dead account sees instead of the app, for 48 hours.
  //
  // This is not a sign-in. The token behind it opens exactly two routes (see
  // src/mortality.ts and the "wake" auth level), so there is nothing else this
  // screen could offer even if it wanted to. What it does offer is the choice
  // Josh asked for: a death that isn't a door slamming.
  //
  // The tone is deliberately not a game-over. Somebody may be spending real
  // silver on you right now, and the countdown is the reason to say so.
  import { onMount, onDestroy } from "svelte";
  import { session, refreshWake, leaveWake, logout } from "../lib/session.svelte";
  import { api, ApiError } from "../lib/api";
  import StartOver from "./StartOver.svelte";

  let now = $state(Date.now());
  let busy = $state(false);
  let err = $state("");
  let confirming = $state(false);

  const wake = $derived(session.wake);
  const left = $derived(Math.max(0, (wake?.sealsAt ?? 0) - now));
  const sealed = $derived(!!wake && left <= 0);

  const clock = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h >= 1 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
  };

  // Tick the countdown, and every 20s ask the server whether anything changed
  // — somebody raising you is the one event this screen exists to notice.
  let tick: ReturnType<typeof setInterval> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    tick = setInterval(() => (now = Date.now()), 1000);
    poll = setInterval(async () => {
      if (busy) return;
      if ((await refreshWake()) === "alive") await leaveWake();
    }, 20_000);
  });
  onDestroy(() => {
    clearInterval(tick);
    clearInterval(poll);
  });

  async function buyBack(): Promise<void> {
    if (busy) return;
    busy = true;
    err = "";
    try {
      await api.wakeRevive();
      await leaveWake(); // the token is an ordinary session again
    } catch (e) {
      err = e instanceof ApiError && e.status === 409
        ? "the grave sealed while you were deciding"
        : "that didn't go through — try again";
      busy = false;
    }
  }
</script>

<div class="wake">
  <div class="card">
    <p class="kicker">THE WHEEL TOOK {wake?.user.displayName?.toUpperCase() ?? "YOU"}</p>

    {#if sealed}
      <h1>The grave has sealed.</h1>
      <p class="lede">
        Nobody came in time. That life is a monument in the Graveyard now. You walk out as
        the next generation — keeping your achievements, your titles, a quarter of your
        silver and the rarest tenth of your collection.
      </p>
      <button class="go" onclick={leaveWake}>begin again</button>
    {:else}
      <h1>You are not gone yet.</h1>
      <p class="lede">
        The ground is still open. For the next
        <b class="count">{clock(left)}</b>
        anyone on Solace can pull you out of it — they pay
        <b>{wake?.quote.raisePrice.toLocaleString()} silver</b>, or they sacrifice a mythic.
        It costs them; it costs you nothing. If you have friends here, this is when you find out.
      </p>

      <div class="or"><span>or buy yourself back</span></div>

      <div class="self">
        {#if wake && !wake.canPay}
          <!-- NOTHING TO PAY WITH. An empty purse and an empty collection quote
               zero, and zero is not a price — the server refuses it, so the
               screen says why instead of offering a button that 409s. -->
          <p class="price">
            You have nothing to buy yourself back with — no silver worth the
            name, and no collection to burn.
          </p>
          <p class="fine">
            Your way out: somebody raises you, or the grave seals and you walk
            out a generation older.
          </p>
        {:else}
        <p class="price">
          Every coin you have — <b>{wake?.quote.coins.toLocaleString() ?? 0} silver</b> —
          and <b>{wake?.quote.burn ?? 0}</b> of your {wake?.collection ?? 0} emoji, chosen at
          random and burned.
        </p>
        <p class="fine">
          Deliberately worse than being saved by somebody else.
        </p>
        {#if !confirming}
          <button class="self-btn" disabled={busy} onclick={() => (confirming = true)}>
            pay it
          </button>
        {:else}
          <div class="confirm">
            <span>Burn it all and stand up?</span>
            <button class="yes" disabled={busy} onclick={buyBack}>
              {busy ? "…" : "yes, burn it"}
            </button>
            <button class="no" disabled={busy} onclick={() => (confirming = false)}>wait</button>
          </div>
        {/if}
        {/if}
      </div>

      <p class="after">
        Do nothing and the grave seals when the clock runs out — you come back a generation
        older, with a quarter of your silver and the rarest tenth of your collection.
      </p>

      <StartOver
        note="Or walk away. A new name, an empty shelf, no invite code needed — this grave is your invitation. The old you stays in the ground exactly as it lies: friends can still raise it until it seals, and if nobody does, that life becomes a monument you no longer answer for."
      />
    {/if}

    {#if err}<p class="err">{err}</p>{/if}
    <button class="out" onclick={logout}>sign out</button>
  </div>
</div>

<style>
  .wake {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow-y: auto;
    background:
      radial-gradient(120% 80% at 50% 0%, #2a0d0d 0%, #120708 45%, #080506 100%);
    color: #e8ddd6;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) — the grave owns the screen */
  }
  .card {
    width: min(560px, 100%);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 26px 26px 20px;
    background: rgba(12, 7, 8, 0.82);
    border: 1px solid #43201f;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  }
  .kicker {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.22em;
    color: #a5462f;
  }
  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.01em;
  }
  .lede,
  .price,
  .after {
    margin: 0;
    line-height: 1.55;
    font-size: 0.92rem;
    color: #cbbdb5;
  }
  .after {
    font-size: 0.84rem;
    color: #8d7d78;
    border-top: 1px solid #2a1616;
    padding-top: 12px;
  }
  .count {
    color: #e8c33c;
    font-variant-numeric: tabular-nums;
  }
  b {
    color: #e8ddd6;
  }
  .or {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #6f5f5b;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .or::before,
  .or::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #2a1616;
  }
  .self {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: #170c0c;
    border: 1px solid #3a1d1c;
    border-radius: 10px;
  }
  .fine {
    margin: 0;
    font-size: 0.78rem;
    color: #8d7d78;
  }
  button {
    font: inherit;
    cursor: pointer;
    border-radius: 8px;
    padding: 9px 16px;
    border: 1px solid #5a3a33;
    background: #241413;
    color: #e8ddd6;
  }
  button:hover:not(:disabled) {
    border-color: #a5462f;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .self-btn,
  .go {
    align-self: flex-start;
  }
  .go {
    background: #2a1a10;
    border-color: #6a5330;
    color: #e8c33c;
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.86rem;
  }
  .yes {
    background: #4a1712;
    border-color: #a5462f;
    color: #ffd9cd;
  }
  .err {
    margin: 0;
    color: #e8a33c;
    font-size: 0.84rem;
  }
  .out {
    align-self: flex-end;
    background: none;
    border: none;
    color: #6f5f5b;
    font-size: 0.78rem;
    padding: 4px 0;
  }
  .out:hover {
    color: #cbbdb5;
  }
</style>
