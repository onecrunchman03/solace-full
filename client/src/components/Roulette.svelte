<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { roulette, loadRoulette, placeRouletteBet, clearRouletteBets } from "../lib/roulette.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { session } from "../lib/session.svelte";
  import { ApiError } from "../lib/api";
  import { playSfx } from "../lib/sfx";
  import { ensureRouletteAudio, ballRun, ballLand, rouletteWin, DROP_LEAD_MS } from "../lib/roulette-audio";
  import Coin from "./Coin.svelte";
  import felt from "../assets/casino-felt.webp";

  // European wheel pocket order (clockwise from zero) — the authentic layout.
  const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
  ];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const SEG = 360 / 37;

  const colorOf = (n: number) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");

  // The felt: three rows (top row = the 3rd column numbers, casino-standard).
  const ROW3 = Array.from({ length: 12 }, (_, i) => 3 + i * 3);
  const ROW2 = Array.from({ length: 12 }, (_, i) => 2 + i * 3);
  const ROW1 = Array.from({ length: 12 }, (_, i) => 1 + i * 3);

  const CHIPS = [5, 10, 25, 50, 100, 250, 500];
  /** Table limit — mirrors the server (roulette.ts MAX_OUTSIDE/MAX_STRAIGHT,
   *  both 5,000 since Aug 2026). */
  const MAX_BET = 5000;
  let chip = $state(10);
  /** Custom stake up to 5,000 (Josh, Aug 2026) — valid = it beats the chips. */
  let custom = $state<number | null>(null);
  const stake = $derived(
    custom !== null && Number.isInteger(custom) && custom >= 5 && custom <= MAX_BET ? custom : chip,
  );
  let error = $state("");
  let errTimer: ReturnType<typeof setTimeout> | null = null;
  let betting = false; // one bet in flight — a double-click escrowed twice (Sep 2026 review)
  let dropTimer: ReturnType<typeof setTimeout> | undefined;
  let winTimer: ReturnType<typeof setTimeout> | undefined;

  // Wheel rotation: accumulate so every spin turns the same direction.
  let rot = $state(0);
  let spinMs = $state(0);
  // The ball orbits AGAINST the wheel and always comes to rest at 12 o'clock —
  // exactly where the winning pocket arrives. Accumulated negative turns.
  let ballRot = $state(0);
  let ballDropped = $state(false);
  let spunRound = -1;
  let heardRound = -1;

  // Live countdown for the betting window.
  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 500);

  onMount(loadRoulette);
  onDestroy(() => {
    clearInterval(tick);
    if (errTimer) clearTimeout(errTimer);
    clearTimeout(dropTimer);
    clearTimeout(winTimer);
  });

  const st = $derived(roulette.state);
  const secondsLeft = $derived(st?.endsAt ? Math.max(0, Math.ceil((st.endsAt - now) / 1000)) : 0);
  const iWon = $derived(!!st?.winners.some((w) => w.user.id === session.user?.id));
  const showResult = $derived(!!st && st.pocket !== null && roulette.revealed);

  // Kick the wheel when a spin starts; land sounds at reveal.
  $effect(() => {
    if (!st) return;
    if (st.phase === "spinning" && st.pocket !== null && st.round !== spunRound) {
      spunRound = st.round;
      const dur = Math.max(1000, (st.endsAt ?? Date.now()) - Date.now());
      spinMs = dur;
      const idx = WHEEL_ORDER.indexOf(st.pocket);
      // Rotate onward to put the winning segment's center under the top marker.
      const current = ((rot % 360) + 360) % 360;
      const targetMod = ((-idx * SEG) % 360 + 360) % 360;
      const delta = (targetMod - current + 360) % 360;
      rot = rot + 4 * 360 + delta;
      // The ball counter-rotates ~6 laps and parks back at 12 o'clock, where
      // the winning pocket is arriving; it drops into the pocket at the end.
      ballDropped = false;
      const ballMod = ((ballRot % 360) + 360) % 360;
      ballRot = ballRot - 6 * 360 - ballMod;
      ballRun(dur);
      // The DROP is scheduled from spin start so the measured PLUNK inside
      // the file lands right as the ball visibly drops into the pocket —
      // clatter over the final approach, plunk at rest, rattle dying over
      // the settle animation. (Playing it at the reveal ran it late.)
      clearTimeout(dropTimer);
      dropTimer = setTimeout(() => ballLand(), Math.max(0, dur - DROP_LEAD_MS));
    }
    if (showResult && st.round !== heardRound) {
      heardRound = st.round;
      ballDropped = true; // the ball settles inward into the pocket
      // Chips slide over only after the ball has audibly rattled to rest.
      if (iWon) {
        clearTimeout(winTimer);
        winTimer = setTimeout(rouletteWin, 600);
      }
      // Zero with money on the felt — the table gasps as the house takes
      // every outside bet; then the croupier's rake sweeps the losers.
      const anyBets = (st.bets?.length ?? 0) > 0;
      if (anyBets && st.pocket === 0) setTimeout(() => playSfx("crowd-gasp", 0.5), 350);
      if (anyBets && st.bets.length > st.winners.length) {
        setTimeout(() => playSfx("rake-sweep", 0.45), 1100);
      }
    }
  });

  function showError(e: unknown): void {
    const code = e instanceof ApiError ? e.code : "";
    error =
      code === "insufficient" ? "Not enough silver." :
      code === "closed" ? "The ball is rolling — wait for the next round." :
      code === "too_many" ? "Max 10 bets per round." :
      code === "bad_amount" ? "Bad amount — bets are 5–5,000 whole silver." :
      "Couldn’t place that bet.";
    if (errTimer) clearTimeout(errTimer);
    errTimer = setTimeout(() => (error = ""), 3200);
  }

  async function doClear(): Promise<void> {
    try {
      await clearRouletteBets();
    } catch (e) {
      showError(e);
    }
  }

  async function bet(kind: string, target: number | null = null): Promise<void> {
    ensureRouletteAudio(); // unlock audio on a user gesture
    if (custom !== null && stake !== custom) {
      error = `Custom stakes are 5–${MAX_BET} whole silver.`;
      if (errTimer) clearTimeout(errTimer);
      errTimer = setTimeout(() => (error = ""), 3200);
      return;
    }
    if (betting) return;
    betting = true;
    try {
      await placeRouletteBet(kind, target, stake);
    } catch (e) {
      showError(e);
    } finally {
      betting = false;
    }
  }

  // Chips on the felt: total staked per spot (all players — the shared table).
  const spotTotals = $derived.by(() => {
    const m = new Map<string, number>();
    for (const b of st?.bets ?? []) {
      const key = `${b.kind}:${b.target ?? ""}`;
      m.set(key, (m.get(key) ?? 0) + b.amount);
    }
    return m;
  });
  const spot = (kind: string, target: number | null = null) => spotTotals.get(`${kind}:${target ?? ""}`) ?? 0;

  const myTotal = $derived(
    (st?.bets ?? []).filter((b) => b.user.id === session.user?.id).reduce((n, b) => n + b.amount, 0),
  );

  const OUTSIDE: { kind: string; label: string }[] = [
    { kind: "low", label: "1–18" },
    { kind: "even", label: "EVEN" },
    { kind: "red", label: "RED" },
    { kind: "black", label: "BLACK" },
    { kind: "odd", label: "ODD" },
    { kind: "high", label: "19–36" },
  ];
</script>

<div class="table" style="--felt: url({felt})">
  <header class="head">
    <h1>ROULETTE</h1>
    <span class="sub">European wheel · outside pays even · numbers pay 35:1</span>
    <span class="balance"><Coin size={14} /> {wallet.coins.toLocaleString()}</span>
  </header>

  <div class="stage">
    <div class="wheel-zone">
      <div class="wheel-rim">
        <div class="marker">▼</div>
        <div
          class="wheel"
          style="transform: rotate({rot}deg); transition: transform {spinMs}ms cubic-bezier(0.14, 0.72, 0.16, 1);"
        >
          {#each WHEEL_ORDER as n, i (i)}
            <div class="seg-label" style="transform: rotate({i * SEG}deg) translateY(-124px)">
              <span class="seg-num {colorOf(n)}">{n}</span>
            </div>
          {/each}
          <div class="wheel-face"></div>
        </div>
        <!-- The ball: orbits against the wheel on its own track, then drops
             into the winning pocket (which arrives at 12 o'clock). -->
        {#if st && (st.phase === "spinning" || showResult)}
          <div
            class="ball-track"
            style="transform: rotate({ballRot}deg); transition: transform {spinMs}ms cubic-bezier(0.32, 0.6, 0.24, 1);"
          >
            <span class="ball" class:dropped={ballDropped}></span>
          </div>
        {/if}
        <div class="hub-read">
          {#if showResult && st}
            <span class="pocket {colorOf(st.pocket!)}">{st.pocket}</span>
          {:else if st?.phase === "spinning"}
            <span class="rolling">···</span>
          {:else}
            <span class="idle-mark">S</span>
          {/if}
        </div>
      </div>

      <div class="status">
        {#if !st || st.phase === "idle"}
          <span>Place a bet to start the round.</span>
        {:else if st.phase === "betting"}
          <span class="hot">Bets close in {secondsLeft}s</span>
        {:else if st.phase === "spinning" && !showResult}
          <span class="hot">No more bets — the ball is rolling…</span>
        {:else if showResult && st}
          {#if st.winners.length}
            <span class="winline">
              {#each st.winners.slice(0, 4) as w (w.user.id)}
                <b class:me={w.user.id === session.user?.id}>{w.user.displayName} +{w.total.toLocaleString()}</b>
              {/each}
              {#if st.winners.length > 4}…{/if}
            </span>
          {:else}
            <span>The house takes it all.</span>
          {/if}
        {/if}
      </div>

      {#if st?.history.length}
        <div class="history">
          {#each st.history as h, i (i)}
            <span class="hist {colorOf(h)}">{h}</span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="board-zone">
      <div class="chips-row">
        <span class="chips-label">CHIP</span>
        {#each CHIPS as c (c)}
          <button class="chip c{c}" class:sel={custom === null && chip === c} onclick={() => { chip = c; custom = null; }}>{c}</button>
        {/each}
        <input
          class="chip-custom"
          class:sel={custom !== null}
          type="number"
          min="5"
          max={MAX_BET}
          step="1"
          placeholder="custom"
          bind:value={custom}
        />
        {#if myTotal > 0}
          <span class="staked">Your stake: {myTotal.toLocaleString()}</span>
          {#if st?.phase === "betting" || st?.phase === "idle"}
            <button class="clear-bets" title="Take back all your bets (full refund)" onclick={() => void doClear()}>
              ✕ Clear
            </button>
          {/if}
        {/if}
      </div>

      <div class="felt-grid">
        <button class="cell zero" onclick={() => bet("straight", 0)}>
          0
          {#if spot("straight", 0)}<span class="fchip">{spot("straight", 0)}</span>{/if}
        </button>
        <div class="numbers">
          {#each [ROW3, ROW2, ROW1] as row, r (r)}
            {#each row as n (n)}
              <button class="cell num {colorOf(n)}" onclick={() => bet("straight", n)}>
                {n}
                {#if spot("straight", n)}<span class="fchip">{spot("straight", n)}</span>{/if}
              </button>
            {/each}
          {/each}
        </div>
        <div class="cols">
          {#each ["col3", "col2", "col1"] as ck (ck)}
            <button class="cell side" onclick={() => bet(ck)}>
              2:1
              {#if spot(ck)}<span class="fchip">{spot(ck)}</span>{/if}
            </button>
          {/each}
        </div>
      </div>

      <div class="dozens">
        {#each [["dozen1", "1st 12"], ["dozen2", "2nd 12"], ["dozen3", "3rd 12"]] as [k, label] (k)}
          <button class="cell wide" onclick={() => bet(k)}>
            {label}
            {#if spot(k)}<span class="fchip">{spot(k)}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="outside">
        {#each OUTSIDE as o (o.kind)}
          <button class="cell wide out-{o.kind}" onclick={() => bet(o.kind)}>
            {o.label}
            {#if spot(o.kind)}<span class="fchip">{spot(o.kind)}</span>{/if}
          </button>
        {/each}
      </div>

      {#if error}<div class="err">{error}</div>{/if}

      {#if st?.bets.length}
        <div class="felt-bets">
          {#each st.bets as b, i (i)}
            <span class="fb" class:mine={b.user.id === session.user?.id}>
              {b.user.displayName} · {b.kind === "straight" ? `#${b.target}` : b.kind} · {b.amount}
            </span>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .table {
    min-height: 100%;
    /* Top padding clears the hub's floating "← Emoji Rumble" pill. */
    padding: 54px 20px 32px;
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.68)),
      var(--felt) center / cover;
    color: #f2ead8;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: 20px;
  }
  h1 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 2.1rem;
    letter-spacing: 0.32em;
    color: #eab348;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
  }
  .sub {
    font-size: 0.82rem;
    color: #cdbf9f;
  }
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
  .stage {
    display: flex;
    gap: 26px;
    align-items: flex-start;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* ---- The wheel ---- */
  .wheel-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .wheel-rim {
    position: relative;
    width: 320px;
    height: 320px;
    border-radius: 50%;
    background: radial-gradient(circle, #3a2410 62%, #6b4a1e 63%, #2a1a0a 74%);
    box-shadow:
      inset 0 0 0 4px rgba(234, 179, 72, 0.5),
      0 18px 44px rgba(0, 0, 0, 0.65);
  }
  .marker {
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    color: #eab348;
    font-size: 0.9rem;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  }
  .wheel {
    position: absolute;
    inset: 16px;
    border-radius: 50%;
    will-change: transform;
  }
  .wheel-face {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    /* EU wheel: after the green zero, pockets alternate RED then black
       (32 red, 15 black, 19 red, …) — odd segment indexes are red. */
    background: conic-gradient(
      from calc(-1 * (360deg / 37) / 2),
      #1d7a44 0deg calc(360deg / 37),
      #a11d24 calc(360deg / 37) calc(2 * 360deg / 37),
      #14100c calc(2 * 360deg / 37) calc(3 * 360deg / 37),
      #a11d24 calc(3 * 360deg / 37) calc(4 * 360deg / 37),
      #14100c calc(4 * 360deg / 37) calc(5 * 360deg / 37),
      #a11d24 calc(5 * 360deg / 37) calc(6 * 360deg / 37),
      #14100c calc(6 * 360deg / 37) calc(7 * 360deg / 37),
      #a11d24 calc(7 * 360deg / 37) calc(8 * 360deg / 37),
      #14100c calc(8 * 360deg / 37) calc(9 * 360deg / 37),
      #a11d24 calc(9 * 360deg / 37) calc(10 * 360deg / 37),
      #14100c calc(10 * 360deg / 37) calc(11 * 360deg / 37),
      #a11d24 calc(11 * 360deg / 37) calc(12 * 360deg / 37),
      #14100c calc(12 * 360deg / 37) calc(13 * 360deg / 37),
      #a11d24 calc(13 * 360deg / 37) calc(14 * 360deg / 37),
      #14100c calc(14 * 360deg / 37) calc(15 * 360deg / 37),
      #a11d24 calc(15 * 360deg / 37) calc(16 * 360deg / 37),
      #14100c calc(16 * 360deg / 37) calc(17 * 360deg / 37),
      #a11d24 calc(17 * 360deg / 37) calc(18 * 360deg / 37),
      #14100c calc(18 * 360deg / 37) calc(19 * 360deg / 37),
      #a11d24 calc(19 * 360deg / 37) calc(20 * 360deg / 37),
      #14100c calc(20 * 360deg / 37) calc(21 * 360deg / 37),
      #a11d24 calc(21 * 360deg / 37) calc(22 * 360deg / 37),
      #14100c calc(22 * 360deg / 37) calc(23 * 360deg / 37),
      #a11d24 calc(23 * 360deg / 37) calc(24 * 360deg / 37),
      #14100c calc(24 * 360deg / 37) calc(25 * 360deg / 37),
      #a11d24 calc(25 * 360deg / 37) calc(26 * 360deg / 37),
      #14100c calc(26 * 360deg / 37) calc(27 * 360deg / 37),
      #a11d24 calc(27 * 360deg / 37) calc(28 * 360deg / 37),
      #14100c calc(28 * 360deg / 37) calc(29 * 360deg / 37),
      #a11d24 calc(29 * 360deg / 37) calc(30 * 360deg / 37),
      #14100c calc(30 * 360deg / 37) calc(31 * 360deg / 37),
      #a11d24 calc(31 * 360deg / 37) calc(32 * 360deg / 37),
      #14100c calc(32 * 360deg / 37) calc(33 * 360deg / 37),
      #a11d24 calc(33 * 360deg / 37) calc(34 * 360deg / 37),
      #14100c calc(34 * 360deg / 37) calc(35 * 360deg / 37),
      #a11d24 calc(35 * 360deg / 37) calc(36 * 360deg / 37),
      #14100c calc(36 * 360deg / 37) 360deg
    );
    box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.65);
  }
  .seg-label {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 2;
    margin: -8px 0 0 -8px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
  }
  .seg-num {
    font-size: 0.64rem;
    font-weight: 800;
    color: #f2ead8;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  }
  .ball-track {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 3;
    will-change: transform;
  }
  .ball {
    position: absolute;
    top: 3px;
    left: 50%;
    margin-left: -7px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle at 36% 30%, #ffffff 0%, #e8e8ec 45%, #9a9aa4 100%);
    box-shadow:
      0 2px 5px rgba(0, 0, 0, 0.6),
      inset 0 -2px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.4s cubic-bezier(0.34, 1.4, 0.5, 1);
  }
  /* At rest the ball settles inward off the rim, into the pocket ring. */
  .ball.dropped {
    transform: translateY(26px) scale(0.92);
  }
  .hub-read {
    position: absolute;
    inset: 50%;
    z-index: 3;
    width: 116px;
    height: 116px;
    margin: -58px 0 0 -58px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 36% 30%, #4a3015, #241505 70%);
    border: 3px solid rgba(234, 179, 72, 0.55);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
  }
  .pocket {
    font-family: Georgia, serif;
    font-size: 2.6rem;
    font-weight: 900;
  }
  .pocket.red { color: #ff7a72; }
  .pocket.black { color: #e8e2d4; }
  .pocket.green { color: #6fe8a5; }
  .rolling {
    font-size: 1.6rem;
    color: #eab348;
    letter-spacing: 0.2em;
  }
  .idle-mark {
    font-family: Georgia, serif;
    font-size: 1.8rem;
    font-weight: 900;
    color: rgba(234, 179, 72, 0.7);
  }
  .status {
    min-height: 24px;
    font-size: 1rem;
    text-align: center;
  }
  .status .hot { color: #eab348; font-weight: 700; }
  .winline { display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .winline b { color: #6fe8a5; }
  .winline b.me { color: #ffd97a; }
  .history { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; max-width: 330px; }
  .hist {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.8rem;
    font-weight: 800;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .hist.red { background: #a11d24; }
  .hist.black { background: #14100c; }
  .hist.green { background: #1d7a44; }

  /* ---- The felt board ---- */
  .board-zone {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-width: 320px;
    max-width: 880px;
  }
  .chips-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .chips-label { font-size: 0.68rem; letter-spacing: 0.16em; color: #cdbf9f; }
  .chip {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 3px dashed rgba(255, 255, 255, 0.75);
    background: #a11d24;
    color: #fff;
    font-weight: 800;
    font-size: 0.92rem;
    cursor: pointer;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5);
  }
  .chip.c10 { background: #1d5c8f; }
  .chip.c25 { background: #1d7a44; }
  .chip.c50 { background: #6b3fa0; }
  .chip.c100 { background: #14100c; }
  .chip.c250 { background: #b0691e; }
  .chip.c500 {
    background: #7c1023;
    border-color: #eab348;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5), 0 0 10px rgba(234, 179, 72, 0.35);
  }
  .chip.sel { outline: 3px solid #eab348; outline-offset: 2px; }
  .chip-custom {
    width: 82px;
    height: 40px;
    border-radius: 10px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    background: rgba(10, 8, 6, 0.6);
    color: #ffd97a;
    font: inherit;
    font-weight: 800;
    font-size: 0.88rem;
    text-align: center;
  }
  .chip-custom.sel { outline: 3px solid #eab348; outline-offset: 2px; }
  .chip-custom:focus { outline: 2px solid #eab348; }
  .staked { margin-left: auto; font-size: 0.78rem; color: #ffd97a; font-weight: 700; }
  .clear-bets {
    flex: none;
    padding: 5px 12px;
    border: 1px solid rgba(255, 138, 128, 0.5);
    border-radius: 999px;
    background: none;
    color: #ff8a80;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
  }
  .clear-bets:hover {
    background: rgba(255, 138, 128, 0.12);
  }

  .felt-grid { display: flex; gap: 4px; }
  .numbers {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
    flex: 1;
  }
  .cols { display: flex; flex-direction: column; gap: 4px; }
  .cell {
    position: relative;
    min-height: 54px;
    border-radius: 7px;
    border: 1px solid rgba(234, 179, 72, 0.35);
    color: #f2ead8;
    font-weight: 800;
    font-size: 1rem;
    cursor: pointer;
    background: rgba(10, 30, 18, 0.72);
    padding: 4px;
  }
  .cell:hover { border-color: #eab348; }
  .cell.num.red { background: rgba(161, 29, 36, 0.85); }
  .cell.num.black { background: rgba(16, 12, 9, 0.85); }
  .cell.zero {
    width: 58px;
    background: rgba(29, 122, 68, 0.85);
    align-self: stretch;
  }
  .cell.side { flex: 1; width: 62px; }
  .dozens, .outside { display: flex; gap: 5px; }
  .cell.wide { flex: 1; min-height: 48px; }
  .out-red { background: rgba(161, 29, 36, 0.8); }
  .out-black { background: rgba(16, 12, 9, 0.85); }
  .fchip {
    position: absolute;
    right: -6px;
    top: -9px;
    z-index: 1;
    min-width: 26px;
    height: 26px;
    padding: 0 5px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #eab348;
    color: #241505;
    font-size: 0.72rem;
    font-weight: 900;
    border: 2px solid #241505;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  }
  .err {
    color: #ff8a80;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .felt-bets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .fb {
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(234, 179, 72, 0.25);
    font-size: 0.72rem;
  }
  .fb.mine { border-color: #eab348; color: #ffd97a; }

  .stage {
    max-width: 1340px;
    margin: 0 auto;
  }
  /* The second clause is A PHONE ON ITS SIDE. Landscape is 844px WIDE, so it
     sails past the 700px test and took the desktop 12-column board — which
     the flex stage then squeezed into 374px beside the wheel, giving 20px
     betting cells. On the one table where a mis-tap is a bet on the wrong
     number, that is the worst layout in the app. It takes the phone board
     instead: six columns, 44px cells, and the page scrolls. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    .stage { gap: 16px; }
    .table { padding: 48px 10px 24px; }
    h1 { font-size: 1.5rem; }
    .wheel-rim { width: 250px; height: 250px; }
    .numbers { grid-template-columns: repeat(6, 1fr); }
    /* 44, not 42: this is a betting grid, so a mis-tap is a bet on the wrong
       number. The columns stay narrow (37px at 390px) because widening them
       would push the outside bets off screen — the height is what's free. */
    .cell { min-height: 44px; font-size: 0.84rem; }
  }
</style>
