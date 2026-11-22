<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { craps, loadCraps, placeCrapsBet, takeDownCrapsBet, rollCraps } from "../lib/craps.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { session } from "../lib/session.svelte";
  import { ApiError, type CrapsEvent } from "../lib/api";
  import { ensureCrapsAudio, diceThrow, chipPlace, crapsWin, sevenOut, pointMade } from "../lib/craps-audio";
  import Coin from "./Coin.svelte";
  import felt from "../assets/casino-felt.webp";

  const CHIPS = [5, 10, 25, 50, 100, 250, 500];
  const PLACES = [4, 5, 6, 8, 9, 10];
  const HARDS = [4, 6, 8, 10];
  let chip = $state(10);
  let error = $state("");
  let errTimer: ReturnType<typeof setTimeout> | null = null;

  // Dice tumble: while a throw is in flight we show randomized faces.
  let tumble = $state<[number, number]>([3, 4]);
  let tumbleTimer: ReturnType<typeof setInterval> | null = null;
  let rattledAt = $state(0);
  let heardOutcomeFor = 0;

  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 500);

  onMount(loadCraps);
  onDestroy(() => {
    clearInterval(tick);
    if (tumbleTimer) clearInterval(tumbleTimer);
    if (errTimer) clearTimeout(errTimer);
  });

  const st = $derived(craps.state);
  const me = $derived(session.user?.id ?? -1);
  // While the dice tumble, show the PRE-roll table (the no-spoiler freeze).
  const showPhase = $derived(craps.frozen ? craps.frozen.phase : (st?.phase ?? "idle"));
  const showPoint = $derived(craps.frozen ? craps.frozen.point : (st?.point ?? null));
  const rolling = $derived(st?.phase === "rolling" && !craps.revealed);
  const iAmShooter = $derived(!!st?.shooter && st.shooter.id === me);
  const rollSeconds = $derived(st?.autoRollAt ? Math.max(0, Math.ceil((st.autoRollAt - now) / 1000)) : null);
  const myBets = $derived((st?.bets ?? []).filter((b) => b.user.id === me));
  const myPass = $derived(myBets.find((b) => b.kind === "pass"));
  const canRoll = $derived(
    iAmShooter && (st?.phase === "comeout" || st?.phase === "point") && st?.autoRollAt != null,
  );

  // Totals per felt spot (everyone's chips — it's a shared table).
  const spotTotals = $derived.by(() => {
    const m = new Map<string, number>();
    for (const b of st?.bets ?? []) {
      const key = `${b.kind}:${b.num ?? ""}`;
      m.set(key, (m.get(key) ?? 0) + b.amount);
    }
    return m;
  });
  const totalFor = (kind: string, num: number | null = null) => spotTotals.get(`${kind}:${num ?? ""}`) ?? 0;
  const mineFor = (kind: string, num: number | null = null) =>
    myBets.find((b) => b.kind === kind && (num === null ? true : b.num === num));

  // Vegas 3-4-5x odds cap for the current point.
  const oddsMax = $derived.by(() => {
    if (!myPass || showPoint === null) return 0;
    const mult = showPoint === 4 || showPoint === 10 ? 3 : showPoint === 5 || showPoint === 9 ? 4 : 5;
    let cap = myPass.amount * mult;
    if (showPoint === 5 || showPoint === 9) cap -= cap % 2;
    if (showPoint === 6 || showPoint === 8) cap -= cap % 5;
    return cap;
  });

  // Dice tumbling + sounds.
  $effect(() => {
    if (!st) return;
    if (rolling) {
      if (!tumbleTimer) {
        tumbleTimer = setInterval(() => {
          tumble = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        }, 90);
      }
      if (st.rollEndsAt && st.rollEndsAt !== rattledAt) {
        rattledAt = st.rollEndsAt;
        diceThrow(st.rollEndsAt - Date.now()); // sync the throw to the real window
      }
    } else if (tumbleTimer) {
      clearInterval(tumbleTimer);
      tumbleTimer = null;
    }
    // Result sting once per revealed roll.
    if (craps.revealed && st.outcome && st.rollEndsAt && st.rollEndsAt !== heardOutcomeFor) {
      heardOutcomeFor = st.rollEndsAt;
      const iWon = st.outcome.winners.some((w) => w.user.id === me);
      if (st.outcome.event === "seven-out") sevenOut();
      else if (st.outcome.event === "point-made") pointMade();
      else if (iWon) crapsWin();
    }
  });

  const shownDice = $derived(rolling ? tumble : (st?.dice ?? null));

  // Pip layout per die face (3×3 grid cells, 1-indexed).
  const PIPS: Record<number, number[]> = {
    1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
  };

  function eventLabel(ev: CrapsEvent, total: number, point: number | null): string {
    if (ev === "natural") return total === 7 ? "SEVEN! Winner on the pass line." : "YO-LEVEN! Winner!";
    if (ev === "craps") return `${total} — craps. Line away.`;
    if (ev === "point-set") return `The point is ${point}.`;
    if (ev === "point-made") return "POINT MADE! Pay the line!";
    if (ev === "seven-out") return "SEVEN OUT. New shooter coming in.";
    return `${total}.`;
  }

  function showError(e: unknown): void {
    const code = e instanceof ApiError ? e.code : "";
    error =
      code === "insufficient" ? "Not enough silver." :
      code === "closed" ? "Dice are out — wait for the roll." :
      code === "wrong_phase" ? "Not now — line bets go down on the comeout." :
      code === "already" ? "You already have that bet working." :
      code === "no_pass_bet" ? "Odds go behind a pass-line bet." :
      code === "over_odds" ? "That's past the 3-4-5x odds cap." :
      code === "too_many" ? "Max 12 bets working." :
      code === "contract" ? "The pass line is a contract — it rides until the point resolves." :
      code === "not_shooter" ? "You're not the shooter." :
      "Couldn't do that.";
    if (errTimer) clearTimeout(errTimer);
    errTimer = setTimeout(() => (error = ""), 3600);
  }

  /** Snap an amount to the spot's legal units (the dealer would make you). */
  function unitAmount(kind: string, num: number | null): number {
    let amt = chip;
    if (kind === "hard") return Math.min(amt, 100);
    if (kind === "place" && num !== null) {
      const unit = num === 6 || num === 8 ? 6 : 5;
      amt = Math.max(unit, Math.round(amt / unit) * unit);
      return Math.min(amt, 500);
    }
    if (kind === "odds") {
      amt = Math.min(amt, oddsMax);
      if (showPoint === 5 || showPoint === 9) amt -= amt % 2;
      if (showPoint === 6 || showPoint === 8) amt -= amt % 5;
      return Math.max(0, amt);
    }
    return amt;
  }

  async function bet(kind: string, num: number | null = null): Promise<void> {
    ensureCrapsAudio();
    const amount = unitAmount(kind, num);
    if (amount < 5) return showError(new ApiError(400, "bad_amount"));
    try {
      await placeCrapsBet(kind, num, amount);
      chipPlace();
    } catch (e) {
      showError(e);
    }
  }

  async function takeDown(kind: string, num: number | null = null): Promise<void> {
    try {
      await takeDownCrapsBet(kind, num);
    } catch (e) {
      showError(e);
    }
  }

  async function doRoll(): Promise<void> {
    ensureCrapsAudio();
    try {
      await rollCraps();
    } catch (e) {
      showError(e);
    }
  }

  const KIND_LABEL: Record<string, string> = {
    pass: "Pass line", dontpass: "Don't pass", odds: "Odds", field: "Field", place: "Place", hard: "Hard",
  };
</script>

<section class="craps" style="--felt: url({felt})">
  <header class="top">
    <h1>CRAPS</h1>
    <div class="mid">
      {#if st?.shooter}
        <span class="shooter">🎲 Shooter: <b>{st.shooter.displayName}</b>{iAmShooter ? " (you)" : ""}</span>
      {/if}
      {#if showPhase === "point" && showPoint !== null}
        <span class="puck on">ON · {showPoint}</span>
      {:else if showPhase !== "idle"}
        <span class="puck off">OFF — comeout</span>
      {/if}
    </div>
    <span class="balance"><Coin size={16} /> {wallet.coins.toLocaleString()}</span>
  </header>

  <div class="table">
    <!-- Dice + roll controls -->
    <div class="dicebox {st?.shooter?.cosmetics?.dice ?? ''}">
      {#if shownDice}
        {#each shownDice as face}
          <div class="die" class:tumbling={rolling}>
            {#each Array(9) as _, cell}
              <span class="pip" class:show={PIPS[face].includes(cell + 1)}></span>
            {/each}
          </div>
        {/each}
      {:else}
        {#each [3, 4] as face}
          <div class="die idle">
            {#each Array(9) as _, cell}
              <span class="pip" class:show={PIPS[face].includes(cell + 1)}></span>
            {/each}
          </div>
        {/each}
      {/if}
      <div class="rollside">
        {#if canRoll && !rolling}
          <button class="rollbtn" onclick={doRoll}>ROLL</button>
        {/if}
        {#if rollSeconds !== null && !rolling}
          <span class="clock">auto-roll {rollSeconds}s</span>
        {/if}
        {#if st?.phase === "idle"}
          <span class="clock">Place a pass-line bet to start a hand</span>
        {/if}
      </div>
    </div>

    {#if craps.revealed && st?.outcome}
      <div class="banner" class:bad={st.outcome.event === "seven-out"}>
        {eventLabel(st.outcome.event, st.outcome.total, st.outcome.point)}
        {#if st.outcome.winners.length > 0}
          <span class="winners">
            {#each st.outcome.winners as w, i}{i > 0 ? " · " : ""}{w.user.displayName} +{w.total}{/each}
          </span>
        {/if}
      </div>
    {/if}

    <!-- The felt -->
    <div class="felt">
      <!-- Place boxes -->
      <div class="places">
        {#each PLACES as n}
          <div class="spot placebox" class:ispoint={showPoint === n}>
            {#if showPoint === n}<span class="puckmark">ON</span>{/if}
            <button class="face" onclick={() => bet("place", n)} disabled={rolling}>
              <b>{n === 6 ? "SIX" : n === 9 ? "NINE" : n}</b>
              <small>{n === 6 || n === 8 ? "7:6" : n === 5 || n === 9 ? "7:5" : "9:5"}</small>
              {#if totalFor("place", n) > 0}<span class="chips">{totalFor("place", n)}</span>{/if}
            </button>
            {#if mineFor("place", n) && !rolling}
              <button class="down" onclick={() => takeDown("place", n)} title="Take down (refund)">✕ {mineFor("place", n)?.amount}</button>
            {/if}
          </div>
        {/each}
      </div>
      {#if showPhase === "comeout"}
        <p class="offnote">Place + hardway bets are OFF on the comeout roll.</p>
      {/if}

      <!-- Hardways -->
      <div class="hardways">
        <span class="rowlabel">HARDWAYS</span>
        {#each HARDS as n}
          <div class="spot">
            <button class="face" onclick={() => bet("hard", n)} disabled={rolling}>
              <b>{n / 2}+{n / 2}</b>
              <small>{n === 6 || n === 8 ? "9:1" : "7:1"}</small>
              {#if totalFor("hard", n) > 0}<span class="chips">{totalFor("hard", n)}</span>{/if}
            </button>
            {#if mineFor("hard", n) && !rolling}
              <button class="down" onclick={() => takeDown("hard", n)} title="Take down (refund)">✕ {mineFor("hard", n)?.amount}</button>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Field -->
      <div class="spot fieldrow">
        <button class="face field" onclick={() => bet("field")} disabled={rolling}>
          <b>FIELD</b>
          <span class="nums"><i class="dia">2</i> 3 4 9 10 11 <i class="dia">12</i></span>
          <small>2 pays double · 12 pays triple · one roll</small>
          {#if totalFor("field") > 0}<span class="chips">{totalFor("field")}</span>{/if}
        </button>
        {#if mineFor("field") && !rolling}
          <button class="down" onclick={() => takeDown("field")}>✕ {mineFor("field")?.amount}</button>
        {/if}
      </div>

      <!-- The lines -->
      <div class="lines">
        <div class="spot linebox">
          <button class="face pass" onclick={() => bet("pass")} disabled={rolling || showPhase === "point"}>
            <b>PASS LINE</b>
            <small>{showPhase === "point" ? "contract riding" : "comeout: 7·11 win, 2·3·12 lose"}</small>
            {#if totalFor("pass") > 0}<span class="chips">{totalFor("pass")}</span>{/if}
          </button>
          {#if mineFor("pass") && showPhase === "comeout" && !rolling}
            <button class="down" onclick={() => takeDown("pass")}>✕ {mineFor("pass")?.amount}</button>
          {/if}
        </div>
        <div class="spot linebox">
          <button class="face dont" onclick={() => bet("dontpass")} disabled={rolling || showPhase === "point"}>
            <b>DON'T PASS</b>
            <small>bar <span class="bardice">⚅⚅</span></small>
            {#if totalFor("dontpass") > 0}<span class="chips">{totalFor("dontpass")}</span>{/if}
          </button>
          {#if mineFor("dontpass") && !rolling}
            <button class="down" onclick={() => takeDown("dontpass")}>✕ {mineFor("dontpass")?.amount}</button>
          {/if}
        </div>
        {#if showPhase === "point" && myPass && oddsMax > 0}
          <div class="spot linebox">
            <button class="face odds" onclick={() => bet("odds")} disabled={rolling || !!mineFor("odds")}>
              <b>ODDS</b>
              <small>true odds · max {oddsMax}</small>
              {#if totalFor("odds") > 0}<span class="chips">{totalFor("odds")}</span>{/if}
            </button>
            {#if mineFor("odds") && !rolling}
              <button class="down" onclick={() => takeDown("odds")}>✕ {mineFor("odds")?.amount}</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Chip picker -->
    <div class="chiprow">
      {#each CHIPS as c}
        <button class="chip" class:active={chip === c} onclick={() => (chip = c)}>{c}</button>
      {/each}
      {#if error}<span class="err">{error}</span>{/if}
    </div>

    <!-- My working bets -->
    {#if myBets.length > 0}
      <div class="mine">
        <span class="rowlabel">YOUR BETS</span>
        {#each myBets as b}
          <span class="mybet">{KIND_LABEL[b.kind]}{b.num !== null && b.kind !== "odds" ? ` ${b.num}` : ""} · {b.amount}</span>
        {/each}
      </div>
    {/if}

    <!-- Roll history -->
    {#if (st?.history.length ?? 0) > 0}
      <div class="history">
        {#each st?.history ?? [] as h}
          <span class="h" class:sevenout={h.event === "seven-out"} class:made={h.event === "point-made"}>
            {h.d1 + h.d2}
          </span>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .craps {
    min-height: 100%;
    padding: 14px 16px 28px;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.62)),
      var(--felt) center / cover no-repeat fixed;
    color: #f2ead6;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    /* clear the hub's floating back pill */
    padding-left: 156px;
  }
  @media (max-width: 1000px) {
    /* Mid widths: drop below the pill instead of dodging sideways. */
    .top { padding-left: 0; margin-top: 42px; }
  }
  .top h1 {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 1.35rem;
    letter-spacing: 0.35em;
    color: #eab348;
  }
  .mid { display: flex; align-items: center; gap: 10px; flex: 1; flex-wrap: wrap; }
  .shooter { font-size: 0.85rem; opacity: 0.9; }
  .puck {
    font-weight: 800;
    font-size: 0.8rem;
    padding: 4px 12px;
    border-radius: 999px;
    border: 2px solid #111;
  }
  .puck.on { background: #16181c; color: #fff; }
  .puck.off { background: #f2ead6; color: #16181c; }
  .balance {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    background: rgba(0, 0, 0, 0.4);
    padding: 4px 10px;
    border-radius: 999px;
  }

  .table { display: flex; flex-direction: column; gap: 10px; max-width: 860px; margin: 0 auto; width: 100%; }

  .dicebox {
    display: flex;
    align-items: center;
    gap: 14px;
    justify-content: center;
    min-height: 74px;
  }
  /* Casino dice: translucent red, white pips, a glossy corner light. */
  .die {
    width: 54px;
    height: 54px;
    border-radius: 11px;
    background:
      radial-gradient(circle at 26% 22%, rgba(255, 255, 255, 0.5), transparent 34%),
      linear-gradient(150deg, var(--dice-a, #e03540), var(--dice-b, #a3141d) 70%, var(--dice-c, #7d0e15));
    border: 1px solid var(--dice-c, #6a0a10);
    box-shadow:
      inset 0 -3px 6px rgba(0, 0, 0, 0.35),
      0 5px 12px rgba(0, 0, 0, 0.5);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    padding: 8px;
  }
  .die.tumbling { animation: throwarc 0.42s infinite ease-in-out; }
  .die.tumbling:last-of-type { animation-delay: 0.13s; }
  @keyframes throwarc {
    0% { transform: translateY(0) rotate(-16deg); }
    25% { transform: translateY(-13px) rotate(38deg); }
    50% { transform: translateY(2px) rotate(102deg); }
    75% { transform: translateY(-7px) rotate(174deg); }
    100% { transform: translateY(0) rotate(244deg); }
  }
  .pip { border-radius: 50%; background: transparent; margin: 16%; }
  .pip.show {
    background: radial-gradient(circle at 35% 30%, #fff, #ddd 75%);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .rollside { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .rollbtn {
    font-family: Georgia, serif;
    font-size: 1.05rem;
    letter-spacing: 0.2em;
    font-weight: 800;
    padding: 10px 26px;
    border-radius: 10px;
    border: 2px solid #7d1d22;
    background: linear-gradient(#d8383f, #a3161d);
    color: #fff;
    cursor: pointer;
  }
  .rollbtn:hover { filter: brightness(1.1); }
  .clock { font-size: 0.75rem; opacity: 0.85; }

  .banner {
    text-align: center;
    background: rgba(10, 40, 20, 0.75);
    border: 1px solid rgba(234, 179, 72, 0.5);
    border-radius: 10px;
    padding: 7px 12px;
    font-size: 0.95rem;
  }
  .banner.bad { background: rgba(70, 12, 12, 0.8); }
  .banner .winners { display: block; font-size: 0.8rem; color: #ffd97a; margin-top: 2px; }

  /* The table: a wood rail wrapping a deep-green felt with cream lines —
     the classic double-border craps layout. */
  .felt {
    position: relative;
    border: 10px solid transparent;
    border-image: linear-gradient(160deg, #6b4423, #4a2d17 40%, #5d3a1e 70%, #3d2412) 1;
    border-radius: 18px;
    box-shadow:
      inset 0 0 34px rgba(0, 0, 0, 0.55),
      0 8px 26px rgba(0, 0, 0, 0.5);
    padding: 14px;
    background:
      radial-gradient(ellipse at 50% 20%, rgba(255, 255, 255, 0.05), transparent 55%),
      linear-gradient(rgba(7, 54, 30, 0.92), rgba(5, 40, 22, 0.94));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rowlabel { font-size: 0.7rem; letter-spacing: 0.22em; opacity: 0.8; align-self: center; }
  .offnote { margin: -4px 0 0; text-align: center; font-size: 0.72rem; opacity: 0.75; font-style: italic; }

  .places { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
  .hardways { display: grid; grid-template-columns: auto repeat(4, 1fr); gap: 8px; align-items: stretch; }
  .lines { display: grid; grid-template-columns: 2fr 1fr auto; gap: 8px; }

  .spot { position: relative; display: flex; flex-direction: column; }
  /* Bet boxes: the classic cream DOUBLE line on felt. */
  .face {
    width: 100%;
    border: 2px solid #efe6cd;
    outline: 1px solid rgba(239, 230, 205, 0.45);
    outline-offset: 2px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.14);
    color: #efe6cd;
    padding: 8px 6px 7px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    transition: background 0.12s, box-shadow 0.12s;
  }
  .face:hover:not(:disabled) {
    background: rgba(234, 179, 72, 0.16);
    box-shadow: 0 0 12px rgba(234, 179, 72, 0.25);
  }
  .face:disabled { opacity: 0.55; cursor: default; }
  .face b {
    font-family: Georgia, serif;
    font-size: 1.06rem;
    letter-spacing: 0.1em;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }
  .placebox .face b { font-size: 1.2rem; }
  .face small { font-size: 0.64rem; opacity: 0.85; letter-spacing: 0.04em; }
  .placebox.ispoint .face {
    border-color: #ffd97a;
    box-shadow: 0 0 14px rgba(234, 179, 72, 0.4);
    background: rgba(234, 179, 72, 0.1);
  }
  /* The ON puck — black with white lettering, riding the point box. */
  .puckmark {
    position: absolute;
    top: -13px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 32% 28%, #3a3d44, #101216 70%);
    color: #fff;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    border: 2.5px solid #f2ead6;
    box-shadow: 0 3px 7px rgba(0, 0, 0, 0.6);
  }
  .face.pass { border-color: #f5d98e; color: #f5d98e; }
  .face.dont { border-color: #c9ccd6; color: #c9ccd6; }
  .face.dont .bardice { font-size: 0.9rem; letter-spacing: -2px; }
  .face.odds { border-color: #7fd0a0; color: #a9e5c4; }
  .face.field .nums { font-size: 0.92rem; letter-spacing: 0.28em; font-family: Georgia, serif; }
  .face.field .nums .dia {
    color: #ffd97a;
    font-style: normal;
    font-weight: 800;
    display: inline-block;
    padding: 1px 6px;
    margin: 0 2px;
    border: 1.6px solid #ffd97a;
    border-radius: 3px;
  }
  /* Chips on a spot: a little stacked-checks look. */
  .chips {
    position: absolute;
    top: -9px;
    right: -7px;
    background: radial-gradient(circle at 40% 32%, #f5cd6e, #eab348 55%, #b8842a);
    color: #241a04;
    font-weight: 800;
    font-size: 0.72rem;
    border-radius: 999px;
    padding: 2px 9px;
    border: 2px dashed rgba(36, 26, 4, 0.7);
    box-shadow:
      0 2px 0 #8a621d,
      0 4px 0 #6e4e17,
      0 6px 8px rgba(0, 0, 0, 0.55);
  }
  .down {
    margin-top: 4px;
    align-self: center;
    background: rgba(0, 0, 0, 0.45);
    color: #f3b8b8;
    border: 1px solid rgba(243, 184, 184, 0.4);
    border-radius: 999px;
    font-size: 0.68rem;
    padding: 2px 9px;
    cursor: pointer;
  }
  .down:hover { background: rgba(120, 20, 20, 0.5); }

  .chiprow { display: flex; align-items: center; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .chip {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    font-weight: 800;
    border: 4px dashed rgba(255, 255, 255, 0.75);
    background: #17324a;
    color: #fff;
    cursor: pointer;
  }
  .chip:nth-child(2) { background: #5a1a1e; }
  .chip:nth-child(3) { background: #1d5a2c; }
  .chip:nth-child(4) { background: #333; }
  .chip:nth-child(5) { background: #5a3d12; }
  .chip:nth-child(6) { background: #3d1a5a; }
  .chip:nth-child(7) { background: #7d5a12; }
  .chip.active { outline: 3px solid #eab348; outline-offset: 2px; }
  .err { color: #ff9d9d; font-size: 0.8rem; }

  .mine { display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap; }
  .mybet {
    font-size: 0.74rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(242, 234, 214, 0.35);
    padding: 2px 9px;
    border-radius: 999px;
  }

  .history { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
  .h {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(242, 234, 214, 0.14);
    font-size: 0.78rem;
    font-weight: 700;
  }
  .h.sevenout { background: #7d1d22; }
  .h.made { background: #1d6b40; }

  @media (max-width: 700px) {
    .places { grid-template-columns: repeat(3, 1fr); }
    .hardways { grid-template-columns: repeat(4, 1fr); }
    .hardways .rowlabel { grid-column: 1 / -1; }
    .lines { grid-template-columns: 1fr 1fr; }
  }
</style>
