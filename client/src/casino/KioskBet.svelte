<script lang="ts">
  import RacerArt from "../components/RacerArt.svelte";
  // THE SOUL KIOSK's own screen (Josh: "the ticket machine should just offer
  // what racer you want to bet on") — not the Derby page. Pick a stake chip,
  // pick a runner, done; the JUMBOTRON over the bar is where you watch the
  // race. Cancel refunds while the window's open, same rules as everywhere.
  import { onMount } from "svelte";
  import { derby, loadDerby, placeDerbyBet, cancelDerbyBet } from "../lib/derby.svelte";
  import { wallet } from "../lib/wallet.svelte";

  const CHIPS = [5, 25, 50, 100, 250, 500];
  let stake = $state(25);
  let busy = $state(false);
  let msg = $state("");
  onMount(() => {
    void loadDerby();
  });
  const s = $derived(derby.state);
  const mine = $derived(Object.entries(derby.mine ?? {}).find(([, amt]) => amt > 0) ?? null);
  const betting = $derived(!s || s.phase === "idle" || s.phase === "betting");
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  async function bet(key: string): Promise<void> {
    if (busy || mine) return;
    busy = true;
    msg = "";
    try {
      await placeDerbyBet(key, stake);
      msg = "🎟 ticket printed — watch the jumbotron over the bar";
    } catch (e) {
      // Say what actually went wrong (v2 review: everything read as "closed").
      const code = (e as { code?: string })?.code ?? "";
      msg =
        code === "insufficient" || wallet.coins < stake ? "not enough silver" :
        code === "already_bet" ? "one ticket per race" :
        code === "over_cap" ? "max 500 on one runner" :
        code === "rate_limited" ? "easy — one moment" :
        code === "closed" ? "the window just closed" :
        "couldn't place that ticket";
    }
    busy = false;
  }
  async function tearUp(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await cancelDerbyBet();
      msg = "ticket torn up — refunded";
    } catch {
      msg = "too late — they're at the gate";
    }
    busy = false;
  }
</script>

<div class="kiosk">
  <h2>🎟 RACE TICKETS</h2>
  {#if s && s.phase === "betting" && s.endsAt}
    <p class="line hot">bets close in {Math.max(0, Math.ceil((s.endsAt - now) / 1000))}s</p>
  {:else if s && s.phase === "racing"}
    <p class="line">🏁 the race is RUNNING — watch the jumbotron</p>
  {:else}
    <p class="line">your ticket calls the next race · one ticket each</p>
  {/if}

  {#if betting}
    <div class="chips">
      {#each CHIPS as c (c)}
        <button class="chip" class:on={stake === c} onclick={() => (stake = c)} disabled={!!mine}>{c}</button>
      {/each}
      <span class="bal">🪙 {wallet.coins.toLocaleString()}</span>
    </div>
    <div class="racers">
      {#each s?.racers ?? [] as r (r.key)}
        <button class="racer" onclick={() => bet(r.key)} disabled={busy || !!mine}>
          <span class="emoji"><RacerArt key={r.key} moving={false} /></span>
          <span class="rname">{r.name}</span>
          <span class="form">{"★".repeat(r.form)}{"☆".repeat(5 - r.form)}</span>
          <span class="pool">{(s?.pools?.[r.key] ?? 0) > 0 ? `${s?.pools?.[r.key]} in` : "—"}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if mine}
    <div class="mine">
      <span class="mineline">your ticket: <RacerArt key={mine[0]} moving={false} /> <b>{s?.racers.find((r) => r.key === mine[0])?.name ?? mine[0]}</b> · {mine[1]} silver</span>
      {#if betting}<button class="tear" onclick={tearUp} disabled={busy}>tear up</button>{/if}
    </div>
  {/if}
  {#if msg}<p class="msg">{msg}</p>{/if}
</div>

<style>
  .kiosk {
    padding: 18px 22px 24px;
    color: #e6dfd0;
  }
  h2 {
    margin: 0 0 4px;
    color: #e8c33c;
    font-size: 1.15rem;
    letter-spacing: 0.12em;
  }
  .line {
    margin: 0 0 12px;
    color: #9aa3b2;
    font-size: 0.85rem;
  }
  .line.hot {
    color: #e8c33c;
  }
  .chips {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
  }
  .chip {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 2px dashed #5a4a33;
    background: #241c12;
    color: #e6dfd0;
    font-weight: 800;
    cursor: pointer;
  }
  .chip.on {
    border-color: #e8c33c;
    color: #e8c33c;
    box-shadow: 0 0 10px rgba(232, 195, 60, 0.35);
  }
  .bal {
    margin-left: auto;
    color: #e8c33c;
    font-weight: 700;
  }
  .racers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .racer {
    display: grid;
    grid-template-columns: 34px 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    text-align: left;
    gap: 0 8px;
    padding: 8px 12px;
    background: #191510;
    border: 1px solid #3a2f22;
    border-radius: 10px;
    color: #e6dfd0;
    cursor: pointer;
  }
  .racer:hover:not(:disabled) {
    border-color: #e8c33c;
  }
  .racer:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .emoji {
    grid-row: span 2;
    font-size: 1.5rem;
  }
  .rname {
    font-weight: 800;
  }
  .form {
    grid-column: 2;
    color: #e8c33c;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
  }
  .pool {
    grid-row: span 2;
    color: #9fd8a8;
    font-size: 0.8rem;
  }
  .mine {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid #e8c33c55;
    border-radius: 10px;
    background: #1c1712;
  }
  .tear {
    margin-left: auto;
    background: none;
    border: 1px solid #a5462f;
    color: #d97a5a;
    border-radius: 8px;
    padding: 5px 12px;
    cursor: pointer;
  }
  .msg {
    margin: 10px 0 0;
    color: #e8c33c;
    font-size: 0.85rem;
  }
</style>
