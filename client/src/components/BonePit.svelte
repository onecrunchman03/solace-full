<script lang="ts">
  import { onMount, untrack } from "svelte";
  import {
    pit, myGame, loadPit, createTable, joinTable, leaveTable, startTable, placeBid, callLiar,
  } from "../lib/bonepit.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { session } from "../lib/session.svelte";
  import Avatar from "./Avatar.svelte";
  import Coin from "./Coin.svelte";
  import SideBetPanel from "./SideBetPanel.svelte";
  import { ensurePitAudio, diceRattle, verdictRight, verdictWrong } from "../lib/pit-audio";
  import { playSfx } from "../lib/sfx";

  const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  onMount(() => void loadPit());

  const me = $derived(session.user?.id ?? -1);
  const game = $derived(myGame());
  const isMyTurn = $derived(game?.phase === "playing" && game.turnUserId === me);

  // ---- bid controls ----
  let bidCount = $state(1);
  let bidFace = $state(2);

  /** Lowest legal raise given the current bid. */
  function minRaise(g: NonNullable<ReturnType<typeof myGame>>): { count: number; face: number } {
    if (!g.bid) return { count: 1, face: 2 };
    if (g.bid.face < 6) return { count: g.bid.count, face: g.bid.face + 1 };
    return { count: g.bid.count + 1, face: 1 };
  }
  // Keyed on the BID, not on `game`: pit.state is a global broadcast, so a
  // join or bid at ANOTHER table replaced `game` wholesale and snapped the
  // steppers back to the minimum under the player's finger (Sep 2026 review).
  const bidKey = $derived(game?.phase === "playing" ? `${game.id}:${game.bid?.count ?? 0}:${game.bid?.face ?? 0}` : "");
  $effect(() => {
    void bidKey; // the only dependency
    const g = untrack(() => game);
    if (g?.phase === "playing") {
      const m = minRaise(g);
      bidCount = m.count;
      bidFace = m.face;
    }
  });
  const bidLegal = $derived.by(() => {
    if (!game?.bid) return bidCount >= 1;
    return bidCount > game.bid.count || (bidCount === game.bid.count && bidFace > game.bid.face);
  });

  // ---- turn clock ----
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });
  const secondsLeft = $derived(
    game?.turnDeadline ? Math.max(0, Math.ceil((game.turnDeadline - now) / 1000)) : null,
  );

  let stakeInput = $state(25);

  // ---- sounds ----
  // A fresh cup rattles in; a LIAR reveal rings right or buzzes wrong.
  let lastCupKey = "";
  $effect(() => {
    const key = `${pit.diceGameId}:${game?.round ?? 0}:${pit.dice.join("")}`;
    if (pit.dice.length && key !== lastCupKey) {
      const first = lastCupKey === "";
      lastCupKey = key;
      if (!first) diceRattle(); // don't rattle on plain view-mounts
    }
  });
  let lastRevealKey = "";
  $effect(() => {
    const r = game?.reveal;
    if (!r) return;
    const key = `${game.id}:${game.round}:${r.callerId}:${r.actual}`;
    if (key === lastRevealKey) return;
    lastRevealKey = key;
    // The theater of a challenge: the LIAR sting as cups lift, everyone's
    // dice tumbling onto the felt, the verdict ding, and the loser's die
    // cracking after that.
    playSfx("pit-liar", 0.5);
    setTimeout(() => playSfx("dice-tumble", 0.45), 400);
    const right = r.loserId === r.bidderId; // the bluff collapsed
    setTimeout(() => (right ? verdictRight() : verdictWrong()), 800);
    setTimeout(() => playSfx("pit-diecrack", 0.5), 1500);
  });

  function nameOf(g: NonNullable<ReturnType<typeof myGame>>, userId: number): string {
    return g.players.find((p) => p.user?.id === userId)?.user?.displayName ?? "someone";
  }

  /** A player's equipped dice skin (Emporium), for cups + reveals. */
  function diceSkin(g: NonNullable<ReturnType<typeof myGame>>, userId: number): string {
    return g.players.find((p) => p.user?.id === userId)?.user?.cosmetics?.dice ?? "";
  }
</script>

<div class="pitwrap">
  <div class="inner">
    <header class="head">
      <div class="kicker">🎲 READ THEM. DECEIVE THEM. 🎲</div>
      <h1>The Bone Pit</h1>
      <p class="sub">
        Liar's dice — everyone rolls a hidden cup, bids climb, and somebody always lies.
        Winner takes the pot.
      </p>
      <div class="balance"><Coin size={15} /> <b>{wallet.coins.toLocaleString()}</b> silver</div>
    </header>

    {#if pit.error}<div class="note err">{pit.error}</div>{/if}

    {#if game === null}
      <!-- ---- lobby ---- -->
      <section class="card">
        <div class="card-label">OPEN A TABLE</div>
        <div class="row">
          <label class="stake">
            Stake <Coin size={12} />
            <input type="number" min={pit.minStake} max={pit.maxStake} bind:value={stakeInput} />
          </label>
          <button
            class="go"
            disabled={stakeInput < pit.minStake || stakeInput > pit.maxStake || wallet.coins < stakeInput}
            onclick={() => createTable(Math.floor(stakeInput))}
          >
            Open table
          </button>
        </div>
        <p class="fine">Everyone pays the same stake. 2–6 players. Ones are wild.</p>
      </section>

      <section class="card">
        <div class="card-label">TABLES</div>
        {#if pit.loading}
          <p class="muted">Shaking the cups…</p>
        {:else if pit.games.length === 0}
          <p class="muted">No tables open. Shake the first cup.</p>
        {:else}
          {#each pit.games as g (g.id)}
            <div class="table-row">
              <span class="t-stake"><Coin size={12} /> {g.stake}</span>
              <span class="t-info">
                {#if g.phase === "gathering"}
                  {g.players.length}/6 seated — waiting
                {:else if g.phase === "playing"}
                  round {g.round} · {g.totalDice} dice on the table
                {:else if g.winnerId !== null}
                  won by {g.players.find((p) => p.user?.id === g.winnerId)?.user?.displayName ?? "?"} (+{g.pot})
                {:else}
                  folded
                {/if}
              </span>
              <span class="t-who">
                {#each g.players as p (p.user?.id)}
                  {#if p.user}<Avatar name={p.user.displayName} id={p.user.id} avatar={p.user.avatar} size={20} profile />{/if}
                {/each}
              </span>
              {#if g.phase === "gathering"}
                <button class="go sm" disabled={wallet.coins < g.stake} onclick={() => joinTable(g.id)}>
                  Join
                </button>
              {/if}
              {#if g.phase === "gathering" && g.players.length >= 2 && !g.players.some((p) => p.user?.id === me)}
                <div class="sbp-slot">
                  <SideBetPanel
                    kind="pit"
                    gameId={g.id}
                    candidates={g.players.filter((p) => p.user).map((p) => ({ id: p.user!.id, name: p.user!.displayName }))}
                  />
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    {:else}
      <!-- ---- my table ---- -->
      <section class="card table">
        <div class="t-head">
          <span class="card-label">
            {game.phase === "gathering" ? "GATHERING" : game.phase === "playing" ? `ROUND ${game.round}` : "SETTLED"}
          </span>
          <span class="pot"><Coin size={13} /> pot {(game.stake * game.players.length).toLocaleString()}</span>
        </div>

        <div class="players">
          {#each game.players as p (p.user?.id)}
            <div
              class="seat"
              class:turn={game.phase === "playing" && game.turnUserId === p.user?.id}
              class:dead={p.eliminated}
            >
              {#if p.user}
                <Avatar name={p.user.displayName} id={p.user.id} avatar={p.user.avatar} size={34} border={p.user.cosmetics?.border} profile />
                <span class="s-name">{p.user.displayName}</span>
              {:else}
                <span class="s-name">(gone)</span>
              {/if}
              <span class="s-dice">{p.eliminated ? "💀" : "🎲".repeat(Math.max(0, p.diceCount))}</span>
              {#if game.bid && game.bid.byUserId === p.user?.id}
                <span class="s-bid">{game.bid.count} × {DIE[game.bid.face]}</span>
              {/if}
            </div>
          {/each}
        </div>

        {#if game.phase === "gathering"}
          <p class="muted center-t">
            {game.players.length}/6 seated.
          </p>
          <div class="controls">
            {#if game.hostId === me}
              <button class="go" disabled={game.players.length < 2} onclick={() => startTable(game.id)}>
                Roll the bones ({game.players.length})
              </button>
            {:else}
              <span class="muted">Waiting for the host to start…</span>
            {/if}
            <button class="ghost" onclick={() => leaveTable(game.id)}>Leave (refund)</button>
          </div>
        {:else if game.phase === "playing"}
          {#if game.reveal}
            <div class="reveal">
              <div class="r-line">
                <b>{nameOf(game, game.reveal.callerId)}</b> called LIAR on
                <b>{nameOf(game, game.reveal.bidderId)}</b>'s
                {game.reveal.bid.count} × {DIE[game.reveal.bid.face]} — the table held <b>{game.reveal.actual}</b>.
                <b class="loser">{nameOf(game, game.reveal.loserId)} loses a die.</b>
              </div>
              <div class="r-cups">
                {#each game.reveal.cups as c (c.userId)}
                  <span class="r-cup"><b>{nameOf(game, c.userId)}</b>
                    <span class={diceSkin(game, c.userId)}>{#each c.dice as d, i (i)}{DIE[d]}{/each}</span></span>
                {/each}
              </div>
            </div>
          {/if}

          <div class="bidline">
            {#if game.bid}
              Current bid: <b>{game.bid.count} × {DIE[game.bid.face]}</b> by {nameOf(game, game.bid.byUserId)}
            {:else}
              No bid yet — the round opens fresh.
            {/if}
            {#if secondsLeft !== null}
              <span class="clock" class:hot={secondsLeft <= 10}>{secondsLeft}s</span>
            {/if}
          </div>

          <div class="mycup">
            <span class="cup-label">YOUR CUP</span>
            {#if pit.dice.length && pit.diceGameId === game.id}
              <span class="cup-dice {diceSkin(game, me)}">{#each pit.dice as d, i (i)}<span class="die">{DIE[d]}</span>{/each}</span>
            {:else}
              <span class="muted">💀 out of the game — spectating</span>
            {/if}
          </div>

          {#if isMyTurn}
            <div class="controls">
              <div class="bid-build">
                <button class="stepper" onclick={() => (bidCount = Math.max(1, bidCount - 1))}>−</button>
                <span class="bid-preview">{bidCount} ×</span>
                <button class="stepper" onclick={() => (bidCount = Math.min(game.totalDice, bidCount + 1))}>＋</button>
                {#each [1, 2, 3, 4, 5, 6] as f (f)}
                  <button class="facepick" class:on={bidFace === f} onclick={() => (bidFace = f)}>{DIE[f]}</button>
                {/each}
              </div>
              <button class="go" disabled={!bidLegal} onclick={() => { ensurePitAudio(); void placeBid(game.id, bidCount, bidFace); }}>Bid</button>
              <button class="go danger" disabled={!game.bid} onclick={() => { ensurePitAudio(); void callLiar(game.id); }}>LIAR!</button>
            </div>
          {:else}
            <p class="muted center-t">Waiting on {nameOf(game, game.turnUserId ?? -1)}…</p>
          {/if}
          <div class="controls">
            <button class="ghost sm" onclick={() => leaveTable(game.id)}>Forfeit &amp; leave</button>
          </div>
        {:else}
          <div class="done">
            {#if game.winnerId === me}
              <div class="won">🏆 You take the pot — <Coin size={14} /> <b>{game.pot.toLocaleString()}</b></div>
            {:else if game.winnerId !== null}
              <div class="lost">
                {game.players.find((p) => p.user?.id === game.winnerId)?.user?.displayName} takes the pot.
              </div>
            {:else}
              <div class="lost">The table folded — stakes returned.</div>
            {/if}
          </div>
        {/if}
      </section>
    {/if}
    <p class="fine center-t">
      Bids count every die on the table showing the face — and <b>ones are wild</b>. Raise the count,
      or keep it and raise the face. Stall past the clock and the house takes one of your dice.
    </p>
  </div>
</div>

<style>
  .pitwrap {
    height: 100%;
    overflow-y: auto;
    background:
      radial-gradient(900px 420px at 50% 0%, rgba(180, 40, 40, 0.14), transparent 60%),
      radial-gradient(1200px 800px at 50% 110%, rgba(16, 26, 20, 1), rgba(10, 16, 12, 1));
    padding: 46px 20px 60px;
  }
  .inner {
    max-width: 660px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    text-align: center;
  }
  .kicker {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    color: #d8a04c;
  }
  h1 {
    margin: 4px 0 6px;
    font-family: Georgia, serif;
    font-size: 2rem;
    color: #f0d9a8;
  }
  .sub {
    margin: 0 auto 10px;
    max-width: 440px;
    color: rgba(240, 230, 210, 0.65);
    font-size: 0.88rem;
  }
  .balance {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(230, 190, 120, 0.3);
    color: #f0e6d2;
    font-size: 0.9rem;
  }
  .note.err {
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(190, 60, 50, 0.15);
    border: 1px solid rgba(190, 60, 50, 0.5);
    color: #e8a49b;
    font-size: 0.85rem;
  }
  .card {
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(12, 20, 15, 0.8);
    border: 1px solid rgba(230, 190, 120, 0.22);
  }
  .card-label {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: rgba(240, 217, 168, 0.7);
    margin-bottom: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .stake {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(240, 230, 210, 0.8);
    font-size: 0.86rem;
  }
  .stake input {
    width: 100px;
    padding: 7px 9px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(230, 190, 120, 0.3);
    border-radius: 8px;
    color: #f0e6d2;
    font: inherit;
  }
  .fine {
    margin: 8px 0 0;
    color: rgba(240, 230, 210, 0.45);
    font-size: 0.76rem;
  }
  .muted {
    color: rgba(240, 230, 210, 0.5);
    font-size: 0.85rem;
  }
  .center-t {
    text-align: center;
  }
  .table-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 6px;
    border-bottom: 1px solid rgba(230, 190, 120, 0.12);
    flex-wrap: wrap;
  }
  .table-row:last-child {
    border-bottom: none;
  }
  .sbp-slot {
    flex-basis: 100%;
  }
  .t-stake {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #f0d9a8;
    font-weight: 700;
    font-size: 0.86rem;
    min-width: 64px;
  }
  .t-info {
    flex: 1;
    color: rgba(240, 230, 210, 0.7);
    font-size: 0.82rem;
    min-width: 140px;
  }
  .t-who {
    display: inline-flex;
    gap: 3px;
  }
  .t-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pot {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #f0d9a8;
    font-weight: 700;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0;
  }
  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 9px 12px;
    min-width: 96px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(230, 190, 120, 0.18);
  }
  .seat.turn {
    border-color: #d8a04c;
    box-shadow: 0 0 12px rgba(216, 160, 76, 0.25);
  }
  .seat.dead {
    opacity: 0.45;
  }
  .s-name {
    color: #f0e6d2;
    font-size: 0.78rem;
    font-weight: 600;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s-dice {
    font-size: 0.95rem;
    letter-spacing: 1.5px;
  }
  .s-bid {
    font-size: 0.78rem;
    color: #d8a04c;
    font-weight: 700;
  }
  .bidline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 10px;
    margin: 6px 0;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    color: rgba(240, 230, 210, 0.92);
    font-size: 1.05rem;
    flex-wrap: wrap;
  }
  .clock {
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(230, 190, 120, 0.15);
    color: #f0d9a8;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .clock.hot {
    background: rgba(190, 60, 50, 0.3);
    color: #ff9a8a;
  }
  .reveal {
    padding: 12px 14px;
    margin-bottom: 8px;
    border-radius: 10px;
    background: rgba(216, 160, 76, 0.1);
    border: 1px solid rgba(216, 160, 76, 0.45);
    font-size: 0.95rem;
    color: rgba(240, 230, 210, 0.92);
  }
  .r-line .loser {
    color: #ff9a8a;
  }
  .r-cups {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 8px;
    font-size: 1.7rem; /* the reveal is the payoff — make every cup readable */
    line-height: 1.15;
  }
  .r-cup {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(216, 160, 76, 0.25);
    color: #f0e6d2;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.6);
  }
  .r-cup b {
    font-size: 0.78rem;
    color: rgba(240, 217, 168, 0.9);
    margin-right: 2px;
  }
  .mycup {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 10px;
    margin: 6px 0;
    border-radius: 12px;
    background: rgba(216, 160, 76, 0.07);
    border: 1px dashed rgba(216, 160, 76, 0.4);
  }
  .cup-label {
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    color: rgba(240, 217, 168, 0.7);
  }
  .cup-dice .die {
    font-size: 2.9rem;
    color: #fdf6e3;
    margin-right: 6px;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.75), 0 0 18px rgba(216, 160, 76, 0.25);
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .bid-build {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .stepper {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(230, 190, 120, 0.3);
    background: rgba(0, 0, 0, 0.35);
    color: #f0e6d2;
    font: inherit;
    font-size: 1rem;
    cursor: pointer;
  }
  .bid-preview {
    min-width: 44px;
    text-align: center;
    color: #f0d9a8;
    font-weight: 800;
    font-size: 1.05rem;
  }
  .facepick {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid rgba(230, 190, 120, 0.25);
    background: rgba(0, 0, 0, 0.3);
    color: #f0e6d2;
    font-size: 1.35rem;
    line-height: 1;
    cursor: pointer;
  }
  .facepick.on {
    border-color: #d8a04c;
    background: rgba(216, 160, 76, 0.2);
  }
  .go {
    padding: 9px 22px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(180deg, #f0c96c, #d8a04c);
    color: #241708;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .go.sm {
    padding: 6px 16px;
    font-size: 0.82rem;
  }
  .go.danger {
    background: linear-gradient(180deg, #e0763a, #b83a2a);
    color: #fff2ea;
  }
  .go:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .go:hover:not(:disabled) {
    filter: brightness(1.07);
  }
  .ghost {
    padding: 8px 16px;
    border-radius: 10px;
    border: 1px solid rgba(230, 190, 120, 0.3);
    background: none;
    color: rgba(240, 230, 210, 0.7);
    font: inherit;
    font-size: 0.84rem;
    cursor: pointer;
  }
  .ghost.sm {
    padding: 5px 12px;
    font-size: 0.76rem;
  }
  .ghost:hover {
    color: #f0e6d2;
    border-color: #d8a04c;
  }
  .done {
    text-align: center;
    padding: 12px;
  }
  .won {
    font-size: 1.15rem;
    color: #f0d9a8;
    font-weight: 800;
  }
  .lost {
    color: rgba(240, 230, 210, 0.75);
    font-size: 0.95rem;
  }
</style>
