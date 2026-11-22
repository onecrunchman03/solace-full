<script lang="ts">
  // The Bone Pit at its physical table. The felt below paints the ring, but
  // the camera sits three metres up and that's too far to read dice from
  // (Josh, Oct 2026: "really tiny it's hard to see the dice or choices"), so
  // this panel carries everything you need to play at a size you can read:
  // who's in and whose turn, the bid to beat, your cup as real dice, and a
  // bid builder. One game shows — yours, else the liveliest.
  import { onDestroy } from "svelte";
  import { pit, myGame, createTable, joinTable, leaveTable, startTable, placeBid, callLiar } from "../../lib/bonepit.svelte";
  import { wallet } from "../../lib/wallet.svelte";
  import { session } from "../../lib/session.svelte";
  import "./strip.css";

  const g = $derived(myGame() ?? pit.games.find((x) => x.phase === "playing") ?? pit.games.find((x) => x.phase === "gathering") ?? null);
  const me = $derived(session.user?.id ?? 0);
  const mine = $derived(!!g && g.players.some((p) => p.user?.id === me));
  const myTurn = $derived(!!g && g.phase === "playing" && g.turnUserId === me);
  const myDice = $derived(g && pit.diceGameId === g.id ? pit.dice : []);
  const host = $derived(!!g && g.hostId === me);
  const nameOf = (id: number | null | undefined): string =>
    (id === me ? "you" : g?.players.find((p) => p.user?.id === id)?.user?.displayName) ?? "someone";
  const skinOf = (id: number | null | undefined): string =>
    g?.players.find((p) => p.user?.id === id)?.user?.cosmetics?.dice ?? "";

  // ---- the turn clock ------------------------------------------------------
  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 250);
  onDestroy(() => clearInterval(tick));
  const TURN_MS = 35_000;
  const left = $derived(g?.turnDeadline ? Math.max(0, g.turnDeadline - now) : 0);

  // ---- the bid builder -----------------------------------------------------
  let stake = $state(25);
  let count = $state(1);
  let face = $state(2);
  // A new bid on the table resets the builder to the smallest legal raise —
  // and only then, so your own picks are never snapped back under you.
  let seenBid = "";
  $effect(() => {
    const b = g?.bid;
    const key = b ? `${g!.id}:${b.count}:${b.face}` : `${g?.id ?? ""}:none`;
    if (key === seenBid) return;
    seenBid = key;
    if (!b) {
      count = 1;
      face = 2;
    } else if (b.face < 6) {
      count = b.count;
      face = b.face + 1;
    } else {
      count = b.count + 1;
      face = 2;
    }
  });
  const total = $derived(g?.totalDice ?? 0);
  const legal = $derived(!!g && count >= 1 && count <= total && (!g.bid || count > g.bid.count || (count === g.bid.count && face > g.bid.face)));
  const FACES = [2, 3, 4, 5, 6];
  const STAKES = [25, 100, 500, 1000];

  // pips on a 3x3 grid, by face
  const PIPS: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
</script>

{#snippet die(v: number, size: number, skin = "", dim = false)}
  <span class="die {skin}" class:skinned={!!skin} class:dim style="--s:{size}px">
    {#each Array(9) as _, i (i)}<span class="pip" class:on={PIPS[v]?.includes(i)}></span>{/each}
  </span>
{/snippet}

<div class="strip pit">
  {#if !g}
    <div class="row head">
      <span class="title">THE BONE PIT</span>
      <span class="bal">you have <b>{wallet.coins.toLocaleString()}</b></span>
    </div>
    <p class="help">Liar's dice. Everyone stakes the same, everyone rolls five dice in secret, and you bid on how many of a face are on the whole table. <b>1s are wild.</b> Call LIAR on a bid you don't believe — whoever's wrong loses a die. Last one with dice takes the pot.</p>
    <div class="row">
      {#each STAKES as s (s)}
        <button class="chipbtn" class:on={stake === s} onclick={() => (stake = s)}>{s.toLocaleString()}</button>
      {/each}
      <input class="snum" type="number" min={pit.minStake} max={pit.maxStake} bind:value={stake} />
      <button class="big gold" onclick={() => createTable(stake)} disabled={stake < pit.minStake || stake > wallet.coins}>
        Open a table · {stake.toLocaleString()}
      </button>
    </div>
  {:else}
    <div class="row head">
      <span class="title">THE BONE PIT</span>
      <span class="meta">stake <b>{g.stake.toLocaleString()}</b> · pot <b>{g.pot.toLocaleString()}</b>{#if g.phase === "playing"} · <b>{total}</b> dice on the table{/if}</span>
      <span class="bal">you have <b>{wallet.coins.toLocaleString()}</b></span>
    </div>

    <!-- who's in -->
    <div class="row players">
      {#each g.players as p, pi (p.user?.id ?? -pi - 1)}
        {@const id = p.user?.id}
        <div class="seat" class:turn={g.phase === "playing" && g.turnUserId === id} class:out={p.eliminated} class:me={id === me}>
          <span class="pname">{id === me ? "You" : p.user?.displayName ?? "?"}</span>
          <span class="cups">
            {#if p.eliminated}out{:else}{#each Array(p.diceCount) as _, i (i)}<span class="mini"></span>{/each}{/if}
          </span>
          {#if g.phase === "playing" && g.turnUserId === id && left > 0}
            <span class="clock"><span class="fill" style="width:{Math.min(100, (left / TURN_MS) * 100)}%"></span></span>
          {/if}
        </div>
      {/each}
    </div>

    {#if g.phase === "gathering"}
      <div class="row">
        {#if !mine}
          <button class="big gold" onclick={() => joinTable(g.id)} disabled={g.stake > wallet.coins}>Join · {g.stake.toLocaleString()}</button>
        {:else if host}
          <button class="big gold" onclick={() => startTable(g.id)} disabled={g.players.length < 2}>
            {g.players.length < 2 ? "Waiting for a second player" : "Start the game"}
          </button>
          <button class="big red" onclick={() => leaveTable(g.id)}>Leave</button>
        {:else}
          <span class="note">Waiting for the host to start…</span>
          <button class="big red" onclick={() => leaveTable(g.id)}>Leave</button>
        {/if}
      </div>
    {:else if g.phase === "playing"}
      <!-- the last call, until somebody bids again -->
      {#if g.reveal && !g.bid}
        <div class="reveal">
          <span>
            {nameOf(g.reveal.callerId) === "you" ? "You" : nameOf(g.reveal.callerId)} called {nameOf(g.reveal.bidderId) === "you" ? "your" : `${nameOf(g.reveal.bidderId)}'s`}
            <b>{g.reveal.bid.count} ×</b> {@render die(g.reveal.bid.face, 26)} — there were <b>{g.reveal.actual}</b>.
            <b class="loser">{nameOf(g.reveal.loserId) === "you" ? "You lose" : `${nameOf(g.reveal.loserId)} loses`} a die.</b>
          </span>
          <div class="cupsrow">
            {#each g.reveal.cups as c (c.userId)}
              <span class="cupline">
                <span class="cname">{nameOf(c.userId)}</span>
                {#each c.dice as d, i (i)}{@render die(d, 30, skinOf(c.userId), d !== g.reveal.bid.face && d !== 1)}{/each}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <div class="row table">
        <div class="bidbox">
          <span class="lbl">{g.bid ? `bid by ${nameOf(g.bid.byUserId)}` : "no bid yet"}</span>
          {#if g.bid}
            <span class="bidnow"><b>{g.bid.count}</b><span class="x">×</span>{@render die(g.bid.face, 46)}</span>
          {:else}
            <span class="bidnow empty">—</span>
          {/if}
        </div>
        {#if myDice.length}
          <div class="cup">
            <span class="lbl">your cup</span>
            <span class="dice">{#each myDice as d, i (i)}{@render die(d, 50, session.user?.cosmetics?.dice ?? "")}{/each}</span>
          </div>
        {/if}
      </div>

      {#if myTurn}
        <div class="row builder">
          <div class="stepper">
            <button class="step" onclick={() => (count = Math.max(1, count - 1))} disabled={count <= 1}>−</button>
            <span class="cnt">{count}</span>
            <button class="step" onclick={() => (count = Math.min(total, count + 1))} disabled={count >= total}>+</button>
          </div>
          <span class="x">×</span>
          <div class="faces">
            {#each FACES as f (f)}
              <button class="facebtn" class:on={face === f} class:weak={!!g.bid && count === g.bid.count && f <= g.bid.face} onclick={() => (face = f)} aria-label="face {f}">{@render die(f, 44)}</button>
            {/each}
          </div>
        </div>
        <span class="note">1s are wild — they count as any face</span>
        <div class="row">
          <button class="big gold" onclick={() => placeBid(g.id, count, face)} disabled={!legal}>
            Bid {count} × {face}s
          </button>
          {#if g.bid}
            <button class="big red" onclick={() => callLiar(g.id)}>LIAR!</button>
          {/if}
        </div>
        {#if !legal && g.bid}<span class="note">beat {g.bid.count} × {g.bid.face}s: more dice, or the same number of a higher face</span>{/if}
      {:else}
        <div class="row">
          <span class="note">{mine ? `${nameOf(g.turnUserId)} to move…` : "a game is running — watch the felt"}</span>
          {#if mine}<button class="small red" onclick={() => leaveTable(g.id)}>forfeit</button>{/if}
        </div>
      {/if}
    {:else}
      <div class="row">
        <span class="winner">{g.winnerId ? `${nameOf(g.winnerId) === "you" ? "You take" : `${nameOf(g.winnerId)} takes`} the pot — ${g.pot.toLocaleString()}` : "game over"}</span>
      </div>
    {/if}
  {/if}
  {#if pit.error}<span class="serr">{pit.error}</span>{/if}
</div>

<style>
  .pit {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    max-width: 860px;
    margin: 0 auto;
    padding: 16px 20px 14px;
    background: linear-gradient(#1d150ef2, #120d08f5);
    border: 1px solid #5a4a30;
    border-radius: 18px;
    box-shadow: 0 10px 40px #000a;
    color: #efe4cc;
    font: 600 15px system-ui, sans-serif;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .head {
    justify-content: space-between;
  }
  .title {
    font: 800 18px Georgia, "Times New Roman", serif;
    letter-spacing: 0.14em;
    color: #e8c33c;
  }
  .meta, .bal {
    color: #b9ad94;
    font-size: 15px;
  }
  .meta b, .bal b {
    color: #f3dfa8;
  }
  .help {
    margin: 0;
    color: #cfc4ac;
    font: 500 15px/1.45 system-ui, sans-serif;
    text-align: center;
  }
  .help b { color: #f3dfa8; }
  .note {
    color: #b9ad94;
    font-size: 15px;
    text-align: center;
  }

  /* who's in */
  .players {
    gap: 10px;
  }
  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 110px;
    padding: 9px 14px 10px;
    border-radius: 12px;
    background: #00000066;
    border: 1px solid #3a3020;
    position: relative;
  }
  .seat.me { border-color: #6a5a38; }
  .seat.turn {
    border-color: #e8c33c;
    box-shadow: 0 0 0 1px #e8c33c66, 0 0 18px #e8c33c40;
  }
  .seat.out { opacity: 0.4; }
  .pname {
    font-size: 15px;
    font-weight: 700;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cups {
    display: flex;
    gap: 4px;
    min-height: 14px;
    color: #9a8f7a;
    font-size: 13px;
  }
  .mini {
    width: 13px;
    height: 13px;
    border-radius: 3px;
    background: #efe6cf;
    box-shadow: inset 0 -2px 0 #0003;
  }
  .clock {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 3px;
    height: 3px;
    border-radius: 2px;
    background: #ffffff1a;
    overflow: hidden;
  }
  .clock .fill {
    display: block;
    height: 100%;
    background: #e8c33c;
    transition: width 0.25s linear;
  }

  /* the bid and your cup */
  .table {
    gap: 28px;
    align-items: stretch;
  }
  .bidbox, .cup {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 18px 14px;
    border-radius: 14px;
    background: #00000055;
    border: 1px solid #3a3020;
  }
  .lbl {
    color: #9a8f7a;
    font: 700 12px system-ui, sans-serif;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .bidnow {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 50px;
  }
  .bidnow b {
    font: 900 42px system-ui, sans-serif;
    color: #fff3d6;
  }
  .bidnow.empty {
    font: 800 30px system-ui, sans-serif;
    color: #6a604c;
  }
  .x {
    font: 800 26px system-ui, sans-serif;
    color: #b9ad94;
  }
  .dice {
    display: flex;
    gap: 10px;
  }

  /* a die, drawn: a face with pips on a 3x3 grid */
  .die {
    --s: 40px;
    width: var(--s);
    height: var(--s);
    border-radius: calc(var(--s) * 0.2);
    display: inline-grid;
    grid-template: repeat(3, 1fr) / repeat(3, 1fr);
    padding: calc(var(--s) * 0.13);
    box-sizing: border-box;
    background: linear-gradient(150deg, #fbf6ea, #e2d8c2);
    box-shadow: inset 0 calc(var(--s) * -0.06) 0 #0002, 0 3px 8px #0008;
    vertical-align: middle;
    flex: none;
  }
  .die.skinned {
    background: linear-gradient(150deg, var(--dice-a), var(--dice-b) 70%, var(--dice-c, var(--dice-b)));
  }
  .die.dim {
    opacity: 0.35;
  }
  .pip {
    border-radius: 50%;
    margin: 12%;
  }
  .pip.on {
    background: #1d1610;
  }
  .die.skinned .pip.on {
    background: #fffaf0;
    box-shadow: 0 0 0 1px #0007;
  }

  /* the builder */
  .builder {
    gap: 16px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #00000066;
    border: 1px solid #4a3f2c;
    border-radius: 14px;
    padding: 5px;
  }
  .step {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    border: 1px solid #4a3f2c;
    background: #2a2116;
    color: #f3ead6;
    font: 800 24px system-ui, sans-serif;
    cursor: pointer;
  }
  .step:disabled { opacity: 0.35; cursor: default; }
  .cnt {
    min-width: 52px;
    text-align: center;
    font: 900 32px system-ui, sans-serif;
    color: #fff3d6;
  }
  .faces {
    display: flex;
    gap: 8px;
  }
  .facebtn {
    padding: 4px;
    border-radius: 12px;
    border: 2px solid transparent;
    background: none;
    cursor: pointer;
  }
  .facebtn:hover { border-color: #6a5a38; }
  .facebtn.weak {
    opacity: 0.4;
  }
  .facebtn.on {
    border-color: #e8c33c;
    background: #e8c33c22;
  }

  /* buttons */
  .big {
    min-height: 50px;
    padding: 12px 26px;
    border-radius: 999px;
    font: 800 17px system-ui, sans-serif;
    letter-spacing: 0.02em;
    cursor: pointer;
    border: 1px solid;
  }
  .big:disabled { opacity: 0.42; cursor: default; }
  .gold {
    background: linear-gradient(#e7c27a, #b8862f);
    border-color: #f3d98a;
    color: #22180a;
  }
  .red {
    background: #7c2a2e;
    border-color: #c4565c;
    color: #ffe9e6;
  }
  .small {
    padding: 8px 16px;
    border-radius: 999px;
    font: 700 14px system-ui, sans-serif;
    cursor: pointer;
    border: 1px solid;
  }
  .chipbtn {
    min-width: 64px;
    min-height: 44px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid #4a3f2c;
    background: #201a12;
    color: #f3dfa8;
    font: 800 15px system-ui, sans-serif;
    cursor: pointer;
  }
  .chipbtn.on {
    border-color: #e8c33c;
    background: #4a3a1c;
  }
  .pit :global(.snum) {
    width: 110px;
    min-height: 44px;
    font-size: 16px;
  }

  /* the last call */
  .reveal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #2a1a10cc;
    border: 1px solid #6a4a2c;
    font-size: 16px;
    text-align: center;
  }
  .reveal b { color: #fff3d6; }
  .reveal .loser { color: #ffb3a8; }
  .cupsrow {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 18px;
  }
  .cupline {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .cname {
    color: #b9ad94;
    font-size: 15px;
    margin-right: 4px;
  }
  .winner {
    font: 800 20px system-ui, sans-serif;
    color: #f3dfa8;
  }
  .serr {
    text-align: center;
  }
</style>
