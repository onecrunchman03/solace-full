<script lang="ts">
  import RacerArt from "./RacerArt.svelte";
  import DerbyCourse from "./DerbyCourse.svelte";
  // THE RACE MATHS IS SHARED (lib/derby-race.ts): the casino's jumbotron runs
  // the identical seeded race, so both screens show the same horses in the
  // same places at the same moment.
  import { runRace, serverTime } from "../lib/derby-run";
  import { onMount, onDestroy } from "svelte";
  import { derby, loadDerby, placeDerbyBet, cancelDerbyBet } from "../lib/derby.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { session } from "../lib/session.svelte";
  import { ApiError } from "../lib/api";
  import Coin from "./Coin.svelte";
  import felt from "../assets/casino-felt.webp";
  import { ensureDerbyAudio } from "../lib/derby-audio";

  const CHIPS = [5, 10, 25, 50, 100, 250, 500];
  let chip = $state(10);
  let error = $state("");
  let errTimer: ReturnType<typeof setTimeout> | null = null;

  // The post-time countdown ticks only while there's a countdown to show (it
  // used to run all day), on the server's clock.
  let now = $state(serverTime());
  let tick: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    const counting = derby.state?.phase === "betting";
    if (counting && !tick) tick = setInterval(() => (now = serverTime()), 500);
    if (!counting && tick) {
      clearInterval(tick);
      tick = null;
    }
  });

  // ---- The seeded race ----
  // Every client got the same seed + winner: the race is deterministic.
  // Each cast member races in their own STYLE (their pacing-curve shape),
  // normalized so the assigned finish order always holds.
  let progress = $state<number[]>([]);
  // Lane width in px (bound from .track): runners advance via translateX and
  // trails reveal via clip-path — pure compositor/paint work. The old
  // per-frame `left`/`width` writes forced a layout pass every rAF tick,
  // whose whole-pixel rounding was the last source of end-of-race jitter.
  let stopRun: (() => void) | null = null;
  /** round:seed of the race this screen is running (the round alone resets on a server restart). */
  let racingKey = "";
  /** 3 / 2 / 1 while counting down, 0 = GO!, null = hidden. */
  let countdown = $state<number | null>(null);
  /** The boulder tipped over (the last-place pratfall) — it's done for the day. */
  let boulderDown = $state(false);




  $effect(() => {
    const st = derby.state;
    if (!st) return;
    const key = st.winner && st.seed ? `${st.round}:${st.seed}` : "";
    if ((st.phase === "racing" || st.phase === "settled") && key && key !== racingKey) {
      racingKey = key;
      // ONE race director, shared with the casino's jumbotron (lib/derby-run.ts):
      // the same countdown, the same hops, the same boulder gag, the same
      // sound anchors. Two screens cannot drift if there is one clock.
      stopRun?.();
      boulderDown = false;
      stopRun = runRace(st, {
        onFrame: (f) => {
          progress = f.progress;
          countdown = f.countdown;
          boulderDown = f.boulderDown;
        },
        stillLive: () => derby.state?.phase === "racing" || derby.state?.phase === "settled",
      });
    }
    if (st.phase === "idle" && progress.length) {
      progress = [];
      countdown = null;
      boulderDown = false;
    }
  });


  onMount(loadDerby);
  onDestroy(() => {
    if (tick) clearInterval(tick);
    stopRun?.();
    if (errTimer) clearTimeout(errTimer);
  });

  const st = $derived(derby.state);
  const secondsLeft = $derived(st?.endsAt ? Math.max(0, Math.ceil((st.endsAt - now) / 1000)) : 0);
  const totalPool = $derived(Object.values(st?.pools ?? {}).reduce((a, b) => a + b, 0));
  const myTotal = $derived(Object.values(derby.mine).reduce((a, b) => a + b, 0));
  const showResult = $derived(!!st && st.winner !== null && derby.revealed);
  const winnerRacer = $derived(st?.racers.find((r) => r.key === st?.winner) ?? null);
  const myWin = $derived(st?.winners.find((w) => w.userId === session.user?.id) ?? null);
  const iWon = $derived(!!myWin && myWin.payout > 0);
  const myPayout = $derived(myWin?.payout ?? 0);
  const PLACE_LABEL = ["", "1st", "2nd", "3rd"];
  const racing = $derived((st?.phase === "racing" || st?.phase === "settled") && !showResult);
  const betsOpen = $derived(st?.phase === "betting" || st?.phase === "idle");
  const myPick = $derived(st?.racers.find((r) => derby.mine[r.key]) ?? null);

  function oddsFor(key: string): string {
    // If this runner WINS: the 1st-place share of the raked pool, split by
    // stake. The share depends on how many places end up backed (70/20/10,
    // renormalized) — estimated from how many runners carry money, so a
    // one-runner pool reads 0.95x, which is what it really pays (v2 review:
    // it always showed the 70% case).
    const pool = st?.pools[key] ?? 0;
    if (!pool || !totalPool) return "—";
    const backed = Object.values(st?.pools ?? {}).filter((v) => v > 0).length;
    const share = backed >= 3 ? 0.7 : backed === 2 ? 0.7 / 0.9 : 1;
    return `~${((totalPool * 0.95 * share) / pool).toFixed(2)}× if 1st`;
  }
  // The last five finishes for a runner, newest first (the form guide).
  function formGuide(key: string): string {
    const places = (st?.results ?? []).slice(0, 5).map((r) => r.placings.indexOf(key) + 1).filter((p) => p > 0);
    return places.length ? places.join(" · ") : "no runs yet";
  }
  const nameOf = (key: string): string => st?.racers.find((r) => r.key === key)?.name ?? key;
  let busy = false;

  // The racer-card modal (ℹ️ on each entry): full description + stats.
  let cardFor = $state<string | null>(null);
  const cardRacer = $derived(st?.racers.find((r) => r.key === cardFor) ?? null);
  const STYLE: Record<string, string> = {
    rocket: "Violent burns and dead coasts. Full send, zero steering.",
    snail: "One speed. It is not a fast speed, but it never changes.",
    frog: "Crosses the whole track in exactly 13 mighty hops.",
    nascar: "Flat out the entire way. Turns left on principle.",
    blob: "Rolls. Wobbles. Occasionally squishes. Progress happens.",
    boulder: "Sits at the gate until the leaders smell the wire — then slides the whole track in one screaming scratch. Occasionally falls over instead.",
  };

  async function cancelBet(): Promise<void> {
    error = "";
    try {
      await cancelDerbyBet();
    } catch {
      error = "Couldn't cancel — the race may have started.";
      if (errTimer) clearTimeout(errTimer);
      errTimer = setTimeout(() => (error = ""), 3200);
    }
  }

  async function bet(racer: string): Promise<void> {
    // One request at a time: a double-click used to land the bet AND show
    // "you've already backed a runner" (v2 review).
    if (busy) return;
    busy = true;
    error = "";
    ensureDerbyAudio(); // unlock on the click, so the start beeps can play
    try {
      await placeDerbyBet(racer, chip);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      error =
        code === "insufficient" ? "Not enough silver." :
        code === "closed" ? "They're off — next race." :
        code === "already_bet" ? "One ticket per race — you've already backed a runner." :
        code === "over_cap" ? "Max 500 on one runner." :
        code === "rate_limited" ? "Easy — one moment." :
        "Couldn't place that bet.";
      if (errTimer) clearTimeout(errTimer);
      errTimer = setTimeout(() => (error = ""), 3200);
    } finally {
      busy = false;
    }
  }
</script>

<!-- The runners' portraits live in RacerArt.svelte now — shared with the
     casino floor's ticket kiosk. -->

<div class="derby" style="--felt: url({felt})">
  <header class="head">
    <h1>THE EMOJI DERBY</h1>
    <span class="sub">pari-mutuel · winners split the pool · 5% seeds the nightly lottery</span>
    <span class="balance"><Coin size={14} /> {wallet.coins.toLocaleString()}</span>
  </header>

  <div class="status" aria-live="polite">
    {#if !st || st.phase === "idle"}
      <span>Back a runner to call the next race.</span>
    {:else if st.phase === "betting"}
      <span class="hot">🏁 Post time in {secondsLeft}s — pool {totalPool.toLocaleString()} silver</span>
    {:else if racing && countdown !== null}
      <span class="hot">🚦 On your marks…</span>
    {:else if racing}
      <span class="hot">🏇 THEY'RE OFF!</span>
    {:else if showResult && winnerRacer}
      <span class="winline">
        🏆 <b>{winnerRacer.name}</b> takes it!
        {#if iWon && myPayout > myTotal}<b class="me">Your {PLACE_LABEL[myWin?.place ?? 1]}-place ticket pays {myPayout.toLocaleString()} <Coin size={13} /> (+{(myPayout - myTotal).toLocaleString()})</b>
        {:else if iWon}<b class="me">Your {PLACE_LABEL[myWin?.place ?? 1]}-place ticket pays {myPayout.toLocaleString()} <Coin size={13} /> back</b>
        {:else if myWin}<span class="lost">You placed {PLACE_LABEL[myWin.place]}, but the pool was too thin to pay out.</span>
        {:else if st.refunded && myTotal > 0}<span class="lost">Nobody backed the podium — tickets refunded, less the 5% rake.</span>
        {:else if myTotal > 0}<span class="lost">Off the podium — your ticket's confetti now.</span>{/if}
      </span>
    {/if}
  </div>

  {#if st && st.racers.length > 0}
    <!-- The racetrack scene. Its own component since Aug 2026: the casino's
         jumbotron mounts this very markup in 3D, so the hall and the hub
         are not two drawings of a race but one. -->
    <DerbyCourse {st} {progress} {racing} {showResult} {boulderDown} />

    <!-- The betting board: the full racing card -->
    <div class="board">
      {#each st.racers as r, i (r.key)}
        <!-- Not `disabled` — the ℹ️ inside must stay clickable at all times;
             an inactive card just ignores the bet click. -->
        <button
          class="racer"
          class:winner={showResult && r.key === st.winner}
          class:mypick={!!derby.mine[r.key]}
          class:inactive={!betsOpen || myTotal > 0}
          onclick={() => { if (betsOpen && myTotal === 0) void bet(r.key); }}
          title={betsOpen && myTotal === 0 ? `Put ${chip} on ${r.name}` : r.name}
        >
          <span class="r-no">{i + 1}</span>
          <span class="r-art"><RacerArt key={r.key} moving={false} /></span>
          <span class="r-body">
            <span class="r-top"><b class="r-name">{r.name}</b><span class="r-form">{"★".repeat(r.form)}{"☆".repeat(5 - r.form)}</span></span>
            <span class="r-pool">{(st.pools[r.key] ?? 0).toLocaleString()} <Coin size={10} /> · pays {oddsFor(r.key)}
              {#if derby.mine[r.key]}<b class="r-mine">· you: {derby.mine[r.key]}</b>{/if}
            </span>
          </span>
          <span
            class="r-info"
            role="button"
            tabindex="0"
            title="Racer card"
            onclick={(e) => { e.stopPropagation(); cardFor = r.key; }}
            onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); cardFor = r.key; } }}
          >ℹ️</span>
        </button>
      {/each}
    </div>

    <div class="chips-row">
      <span class="chips-label">STAKE</span>
      {#each CHIPS as c (c)}
        <button class="chip" class:sel={chip === c} onclick={() => (chip = c)}>{c}</button>
      {/each}
      {#if myTotal > 0 && myPick && betsOpen}
        <span class="staked">🎫 You're on <b>{myPick.name}</b> for {myTotal.toLocaleString()}</span>
        <button class="cancel-bet" onclick={() => void cancelBet()}>✕ Cancel ticket</button>
      {:else if myTotal > 0 && myPick}
        <span class="staked">🎫 You're on <b>{myPick.name}</b> for {myTotal.toLocaleString()}</span>
      {/if}
    </div>
  {:else}
    <div class="empty-track"><p>The paddock is being prepared…</p></div>
  {/if}

  {#if error}<div class="err">{error}</div>{/if}

  {#if st?.results?.length}
    <div class="history">
      <span class="h-label">RECENT RESULTS</span>
      {#each st.results.slice(0, 6) as r (r.round + ":" + r.at)}
        <span class="h-item">🥇 {nameOf(r.placings[0])}{#if r.placings[1]} · 🥈 {nameOf(r.placings[1])}{/if}{#if r.placings[2]} · 🥉 {nameOf(r.placings[2])}{/if}</span>
      {/each}
    </div>
  {/if}

  <!-- 3… 2… 1… GO! — dead center, classic race-track start -->
  {#if countdown !== null}
    <div class="countdown" aria-hidden="true">
      {#key countdown}
        <span class="cd-num" class:go={countdown === 0}>{countdown === 0 ? "GO!" : countdown}</span>
      {/key}
    </div>
  {/if}

  <!-- The racer card: full bio + stats -->
  {#if cardRacer && st}
    <div class="card-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) cardFor = null; }}>
      <div class="rcard" role="dialog">
        <button class="rcard-x" onclick={() => (cardFor = null)}>✕</button>
        <div class="rcard-art"><RacerArt key={cardRacer.key} moving={true} /></div>
        <div class="rcard-name">
          <span class="rcard-no">#{st.racers.findIndex((r) => r.key === cardRacer.key) + 1}</span>
          {cardRacer.name}
        </div>
        <p class="rcard-desc">{cardRacer.desc}</p>
        <div class="rcard-stats">
          <div class="stat">
            <span class="s-label">FORM TODAY</span>
            <span class="s-val form">{"★".repeat(cardRacer.form)}{"☆".repeat(5 - cardRacer.form)}</span>
          </div>
          <div class="stat">
            <span class="s-label">LAST 5 FINISHES</span>
            <span class="s-val">{formGuide(cardRacer.key)}</span>
          </div>
          <div class="stat">
            <span class="s-label">CAREER WINS</span>
            <span class="s-val">{st.careerWins[cardRacer.key] ?? 0}</span>
          </div>
          <div class="stat">
            <span class="s-label">POOL ON THEM</span>
            <span class="s-val">{(st.pools[cardRacer.key] ?? 0).toLocaleString()} <Coin size={12} /></span>
          </div>
          <div class="stat">
            <span class="s-label">PAYS</span>
            <span class="s-val">{oddsFor(cardRacer.key)}</span>
          </div>
        </div>
        <div class="rcard-style">
          <span class="s-label">RACING STYLE</span>
          <p>{STYLE[cardRacer.key] ?? "A mystery, even to the stewards."}</p>
        </div>
        {#if betsOpen && myTotal === 0}
          <button class="rcard-bet" onclick={() => { const k = cardRacer.key; cardFor = null; void bet(k); }}>
            Put {chip} <Coin size={12} /> on {cardRacer.name}
          </button>
        {:else if betsOpen && myPick}
          <div class="rcard-note">🎫 One ticket per race — you're on {myPick.name}.</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .derby {
    /* Josh, Sep 2026: "why can't I see the race on the emoji racing". The
       race was always rendering — `.course` had been squashed to 3.6px (its
       own two borders) with a fully drawn 312px track clipped inside, and
       the runner cards had taken the room. Two causes, both fixed
       elsewhere: the scroll pane is now Rumble's `.game > *:last-child`, and
       `.course` is `flex: none` so it can never be the thing that yields. */
    min-height: 100%;
    padding: 54px 20px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.7)),
      var(--felt) center / cover;
    color: #f2ead8;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }
  h1 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.7rem;
    letter-spacing: 0.22em;
    color: #eab348;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
  }
  .sub { font-size: 0.78rem; color: #cdbf9f; }
  .balance {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 13px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(234, 179, 72, 0.4);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .status { text-align: center; min-height: 24px; font-size: 1rem; }
  .status .hot { color: #eab348; font-weight: 700; }
  .winline b { color: #6fe8a5; }
  .winline .me { color: #ffd97a; margin-left: 10px; }
  .winline .lost { color: #cdbf9f; margin-left: 10px; font-size: 0.85rem; }

  /* ---- The racetrack scene ---- */
  /* The racetrack's own styles moved to DerbyCourse.svelte with its markup. */

  /* ---- The racing card ---- */
  .board {
    max-width: 880px;
    width: 100%;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 8px;
  }
  .racer {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(234, 179, 72, 0.35);
    background: rgba(10, 30, 18, 0.72);
    color: #f2ead8;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .racer:hover:not(.inactive) { border-color: #eab348; background: rgba(16, 42, 26, 0.82); }
  .racer.inactive { cursor: default; opacity: 0.75; }
  .racer.mypick {
    opacity: 1;
    border-color: #ffd97a;
    background: rgba(24, 48, 28, 0.85);
    box-shadow: inset 0 0 0 1px rgba(255, 217, 122, 0.35);
  }
  .racer.winner {
    border-color: #ffd97a;
    box-shadow: 0 0 16px rgba(234, 179, 72, 0.45);
  }
  .r-no {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    display: grid;
    place-items: center;
    background: rgba(234, 179, 72, 0.18);
    border: 1px solid rgba(234, 179, 72, 0.4);
    font-size: 0.68rem;
    font-weight: 900;
    color: #eab348;
  }
  .r-art { flex: none; width: 42px; display: grid; place-items: center; }
  .r-art :global(.art) { font-size: 1.6rem; }
  .r-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .r-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .r-name { font-weight: 800; font-size: 0.9rem; }
  .r-form { font-size: 0.68rem; color: #eab348; letter-spacing: 0.06em; flex: none; }
  .r-pool {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: #cdbf9f;
  }
  .r-mine { color: #ffd97a; }
  .r-info {
    flex: none;
    align-self: flex-start;
    padding: 2px 4px;
    border-radius: 6px;
    font-size: 0.85rem;
    opacity: 0.75;
    cursor: pointer;
  }
  .r-info:hover { opacity: 1; background: rgba(234, 179, 72, 0.15); }
  /* Touch: six of these sit one per runner row at 27×22 — small enough that
     a miss taps the runner underneath and stakes a bet you didn't mean to. */
  @media (hover: none), (max-width: 760px) {
    .r-info { min-width: 44px; min-height: 44px; display: grid; place-items: center; padding: 0; }
  }

  /* ---- The start countdown ---- */
  .countdown {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .cd-num {
    font-family: Georgia, serif;
    font-size: clamp(5rem, 18vw, 9rem);
    font-weight: 900;
    color: #ffd97a;
    -webkit-text-stroke: 3px rgba(60, 30, 0, 0.85);
    text-shadow:
      0 6px 30px rgba(0, 0, 0, 0.75),
      0 0 60px rgba(234, 179, 72, 0.45);
    animation: cd-pop 0.95s ease-out both;
  }
  .cd-num.go {
    color: #7dff9a;
    -webkit-text-stroke: 3px rgba(0, 60, 20, 0.85);
    text-shadow:
      0 6px 30px rgba(0, 0, 0, 0.75),
      0 0 70px rgba(80, 255, 140, 0.55);
  }
  @keyframes cd-pop {
    0% { transform: scale(1.7); opacity: 0; }
    18% { transform: scale(1); opacity: 1; }
    75% { transform: scale(0.96); opacity: 1; }
    100% { transform: scale(0.92); opacity: 0; }
  }

  /* ---- The racer card modal ---- */
  .card-scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
    padding: 16px;
  }
  .rcard {
    position: relative;
    width: min(360px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 26px 22px 20px;
    border-radius: 18px;
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(234, 179, 72, 0.14), transparent 60%),
      linear-gradient(180deg, #14251a, #0c1811);
    border: 2px solid rgba(234, 179, 72, 0.55);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
    color: #f2ead8;
  }
  .rcard-x {
    position: absolute;
    top: 8px;
    right: 10px;
    background: none;
    border: none;
    color: #cdbf9f;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .rcard-x:hover { color: #f2ead8; }
  .rcard-art :global(.art) { font-size: 3.4rem; }
  .rcard-art :global(.art.blob) { width: 54px; height: 54px; }
  .rcard-name {
    font-family: Georgia, serif;
    font-size: 1.3rem;
    font-weight: 800;
    color: #eab348;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rcard-no {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(234, 179, 72, 0.18);
    border: 1px solid rgba(234, 179, 72, 0.4);
  }
  .rcard-desc {
    margin: 0;
    text-align: center;
    font-style: italic;
    font-size: 0.9rem;
    color: rgba(240, 230, 210, 0.85);
  }
  .rcard-stats {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(234, 179, 72, 0.25);
  }
  .s-label { font-size: 0.6rem; letter-spacing: 0.16em; color: #cdbf9f; font-weight: 800; }
  .s-val { display: inline-flex; align-items: center; gap: 5px; font-size: 1rem; font-weight: 800; }
  .s-val.form { color: #eab348; }
  .rcard-style { width: 100%; }
  .rcard-style p {
    margin: 3px 0 0;
    font-size: 0.82rem;
    color: rgba(240, 230, 210, 0.75);
  }
  .rcard-bet {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 10px;
    border-radius: 10px;
    border: none;
    background: #eab348;
    color: #241505;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .rcard-bet:hover { filter: brightness(1.07); }
  .rcard-note {
    width: 100%;
    text-align: center;
    font-size: 0.82rem;
    color: #ffd97a;
    padding: 6px 0 0;
  }

  .chips-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .chips-label { font-size: 0.68rem; letter-spacing: 0.16em; color: #cdbf9f; }
  .chip {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 3px dashed rgba(255, 255, 255, 0.75);
    background: #1d5c8f;
    color: #fff;
    font-weight: 800;
    font-size: 0.82rem;
    cursor: pointer;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5);
  }
  .chip.sel { outline: 3px solid #eab348; outline-offset: 2px; }
  .staked { font-size: 0.78rem; color: #ffd97a; font-weight: 700; }
  .cancel-bet {
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 138, 128, 0.5);
    background: rgba(60, 16, 12, 0.6);
    color: #ff8a80;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
  }
  .cancel-bet:hover { border-color: #ff8a80; background: rgba(80, 20, 15, 0.75); }

  .empty-track { text-align: center; color: #cdbf9f; }
  .err { text-align: center; color: #ff8a80; font-size: 0.85rem; font-weight: 600; }
  .history {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .h-label { font-size: 0.64rem; letter-spacing: 0.18em; color: #cdbf9f; }
  .h-item {
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(234, 179, 72, 0.25);
    font-size: 0.72rem;
  }
  @media (max-width: 700px) {
    .derby { padding: 48px 10px 24px; }
    h1 { font-size: 1.3rem; }
    /* the crowd's phone sizes went to DerbyCourse with the stand */
  }
</style>
