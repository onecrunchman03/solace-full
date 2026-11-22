<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chess, type Square } from "chess.js";
  import felt from "../assets/casino-felt.webp";
  import Avatar from "./Avatar.svelte";
  import Coin from "./Coin.svelte";
  import EmojiPicker from "./EmojiPicker.svelte";
  import { session } from "../lib/session.svelte";
  import { playSfx } from "../lib/sfx";
  import SideBetPanel from "./SideBetPanel.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import {
    chessduel,
    loadChess,
    postChallenge,
    cancelChallenge,
    acceptChallenge,
    sendMove,
    resignGame,
    myGame,
    myChallenge,
  } from "../lib/chessduel.svelte";
  import type { ChessGame, ChessStake } from "../lib/api";

  // How a stake reads in prose ("the crystals emoji" / "200 silver").
  function stakeName(s: ChessStake): string {
    return s.kind === "silver" ? `${s.amount.toLocaleString()} silver` : s.emoji.name;
  }

  const PIECES: Record<string, string> = {
    wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
    bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
  };
  const REASONS: Record<string, string> = {
    checkmate: "checkmate",
    timeout: "the clock",
    resign: "resignation",
    stalemate: "stalemate",
    insufficient: "bare kings",
    threefold: "repetition",
    "fifty-move": "the fifty-move rule",
  };

  let now = $state(Date.now());
  let timer: ReturnType<typeof setInterval>;
  onMount(() => {
    void loadChess();
    timer = setInterval(() => (now = Date.now()), 250);
  });
  onDestroy(() => clearInterval(timer));

  // ---- lobby state ----
  let pickingStake = $state(false); // emoji picker open for my challenge
  let minutes = $state(3);
  let stakeKind = $state<"emoji" | "silver">("emoji");
  let silverAmount = $state(50);
  let acceptFor = $state<string | null>(null); // challenge id awaiting my emoji pick

  function clampSilver(n: number): number {
    return Math.max(10, Math.min(100000, Math.floor(n) || 10));
  }
  function postSilverChallenge(): void {
    void postChallenge({ kind: "silver", amount: clampSilver(silverAmount) }, minutes);
  }
  function acceptSilver(c: { id: string; stake: ChessStake }): void {
    if (c.stake.kind !== "silver") return;
    void acceptChallenge(c.id, { kind: "silver", amount: c.stake.amount });
  }
  const canAffordSilver = $derived(wallet.coins >= clampSilver(silverAmount));

  const mine = $derived(myChallenge());
  const activeMine = $derived(myGame());

  // When my game starts (someone accepted my challenge), sit me at the board.
  $effect(() => {
    if (activeMine && chessduel.watching !== activeMine.id) chessduel.watching = activeMine.id;
  });

  const game = $derived(chessduel.games.find((g) => g.id === chessduel.watching) ?? null);
  const meId = $derived(session.user?.id ?? -1);

  /** Ply count from a FEN (fullmove + side to move) — drives the side-bet
   *  window display; the server enforces the real cutoff. */
  function pliesOf(fen: string): number {
    const parts = fen.split(" ");
    const fullmove = Number(parts[5] ?? 1);
    return (fullmove - 1) * 2 + (parts[1] === "b" ? 1 : 0);
  }
  const mySide = $derived(
    game == null ? null : game.white.id === meId ? "w" : game.black.id === meId ? "b" : null,
  );
  const flipped = $derived(mySide === "b");

  // ---- board ----
  type Cell = { square: string; glyph: string | null; color: "w" | "b" | null; dark: boolean };
  const cells = $derived.by((): Cell[] => {
    if (!game) return [];
    const grid = new Chess(game.fen).board(); // [rank8 … rank1]
    const out: Cell[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rr = flipped ? 7 - r : r;
        const ff = flipped ? 7 - f : f;
        const p = grid[rr][ff];
        const square = "abcdefgh"[ff] + String(8 - rr);
        out.push({
          square,
          glyph: p ? PIECES[p.color + p.type] : null,
          color: p ? p.color : null,
          dark: (rr + ff) % 2 === 1,
        });
      }
    }
    return out;
  });

  // Board sounds: a wooden click per move, a double-knock on captures
  // (piece count dropped between positions). Switching which game you're
  // LOOKING at must never click — sounds only fire for a new position of
  // the same game.
  let prevGameId = "";
  let prevFen = "";
  let prevPieces = 0;
  $effect(() => {
    if (!game) { prevGameId = ""; prevFen = ""; return; }
    if (game.id !== prevGameId) {
      prevGameId = game.id;
      prevFen = game.fen;
      prevPieces = (game.fen.split(" ")[0].match(/[a-zA-Z]/g) ?? []).length;
      return;
    }
    if (game.fen !== prevFen) {
      const pieces = (game.fen.split(" ")[0].match(/[a-zA-Z]/g) ?? []).length;
      if (pliesOf(game.fen) > 0) {
        playSfx(pieces < prevPieces ? "chess-capture" : "chess-move", 0.5);
      }
      prevFen = game.fen;
      prevPieces = pieces;
    }
  });

  let selected = $state<string | null>(null);
  const legalTargets = $derived.by((): Set<string> => {
    if (!game || !selected || game.status !== "active") return new Set();
    try {
      const c = new Chess(game.fen);
      return new Set(c.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string));
    } catch {
      return new Set();
    }
  });

  async function tap(cell: Cell): Promise<void> {
    if (!game || game.status !== "active" || mySide == null || game.turn !== mySide) return;
    if (selected && legalTargets.has(cell.square)) {
      const from = selected;
      selected = null;
      await sendMove(game.id, from, cell.square); // pawns auto-queen server-side
      return;
    }
    selected = cell.color === mySide && cell.square !== selected ? cell.square : null;
  }

  // ---- clocks ----
  function clockMs(g: ChessGame, side: "w" | "b"): number {
    const bank = side === "w" ? g.wMs : g.bMs;
    if (g.status !== "active" || g.turn !== side) return Math.max(0, bank);
    return Math.max(0, bank - (now - g.lastMoveAt));
  }
  function fmtClock(ms: number): string {
    const s = Math.ceil(ms / 1000);
    if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    return `0:${String(s).padStart(2, "0")}`;
  }

  function resultLine(g: ChessGame): string {
    const why = REASONS[g.endReason ?? ""] ?? g.endReason ?? "";
    if (g.winner === "draw") return `Draw by ${why} — both stakes returned.`;
    const winner = g.winner === "white" ? g.white : g.black;
    // Silver: the winner takes the whole pot (both stakes). Emoji: the loser's.
    const wStake = g.winner === "white" ? g.whiteStake : g.blackStake;
    const spoils =
      wStake.kind === "silver"
        ? `${(wStake.amount * 2).toLocaleString()} silver`
        : (g.winner === "white" ? g.blackStake : g.whiteStake).kind === "emoji"
          ? stakeName(g.winner === "white" ? g.blackStake : g.whiteStake)
          : "the pot";
    return `${winner.displayName} wins by ${why} — and takes ${spoils}.`;
  }

  function ago(t: number): string {
    const s = Math.max(0, Math.floor((now - t) / 1000));
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  }

  // Seat assignment for the two player bars (opponent on top, me/white below).
  const top = $derived(game == null ? null : flipped ? game.white : game.black);
  const topStake = $derived(game == null ? null : flipped ? game.whiteStake : game.blackStake);
  const topSide = $derived((flipped ? "w" : "b") as "w" | "b");
  const bottom = $derived(game == null ? null : flipped ? game.black : game.white);
  const bottomStake = $derived(game == null ? null : flipped ? game.blackStake : game.whiteStake);
  const bottomSide = $derived((flipped ? "b" : "w") as "w" | "b");

  const spectate = (id: string) => (chessduel.watching = id);
  const toLobby = () => {
    chessduel.watching = null;
    selected = null;
  };
</script>

{#snippet stakeChip(s: ChessStake, size: "md" | "sm" = "md")}
  {#if s.kind === "silver"}
    <span class="stake silver" class:sm={size === "sm"} title={`${s.amount.toLocaleString()} silver`}>
      <Coin size={size === "sm" ? 15 : 20} />
      <span class="amt">{s.amount.toLocaleString()}</span>
    </span>
  {:else}
    <span class="stake" class:sm={size === "sm"} title={s.emoji.name}>
      <img src={`/emoji/${s.emoji.file}`} alt={s.emoji.name} />
    </span>
  {/if}
{/snippet}

<div class="root" style="--felt: url({felt})">
  <div class="inner">
    <header class="head">
      <div class="marquee-line">♞ &nbsp;WINNER TAKES THE STAKE&nbsp; ♞</div>
      <h1>Casino Chess Duel</h1>
      <p>Blitz chess for emoji or silver stakes — one piece of your collection, or a pile of coins. Play sharp.</p>
    </header>

    {#if chessduel.error}
      <div class="note err">
        {chessduel.error === "not_owned"
          ? "You no longer own that emoji."
          : chessduel.error === "in_game"
            ? "Finish your current duel first."
            : chessduel.error === "already_challenging"
              ? "You already have an open challenge."
              : chessduel.error === "gone"
                ? "That challenge was already taken."
                : "That didn't work — try again."}
      </div>
    {/if}

    {#if game}
      <!-- ---- the board ---- -->
      <div class="table">
        <div class="table-top">
          <button class="back-lobby" onclick={toLobby}>← All boards</button>
          {#if game.status === "active" && mySide != null}
            <button class="resign" onclick={() => resignGame(game.id)} disabled={chessduel.busy}>Resign</button>
          {/if}
        </div>

        <!-- The banner ALWAYS renders (waiting state included) — it used to
             appear only on your turn, so the whole board jumped up and down
             with every move. -->
        {#if game.status === "finished"}
          <div class="banner" class:draw={game.winner === "draw"}>{resultLine(game)}</div>
        {:else if mySide == null}
          <div class="banner spec">Spectating — {game.white.displayName} vs {game.black.displayName}</div>
        {:else if game.turn === mySide}
          <div class="banner yours" class:check={game.inCheck}>{game.inCheck ? "Check — your move." : "Your move."}</div>
        {:else}
          <div class="banner wait" class:check={game.inCheck}>
            {game.inCheck ? "Check!" : `${(mySide === "w" ? game.black : game.white).displayName} is thinking…`}
          </div>
        {/if}

        {#if top && topStake}
          <div class="playerbar">
            <Avatar name={top.displayName} id={top.id} avatar={top.avatar} size={30} profile />
            <span class="pname">{top.displayName}</span>
            {@render stakeChip(topStake)}
            <span class="clock" class:running={game.status === "active" && game.turn === topSide} class:low={clockMs(game, topSide) < 15_000}>
              {fmtClock(clockMs(game, topSide))}
            </span>
          </div>
        {/if}

        <div class="board" class:done={game.status === "finished"}>
          {#each cells as cell (cell.square)}
            <button
              class="sq"
              class:dark={cell.dark}
              class:sel={selected === cell.square}
              class:target={legalTargets.has(cell.square)}
              class:last={game.lastMove != null && (game.lastMove.from === cell.square || game.lastMove.to === cell.square)}
              onclick={() => tap(cell)}
            >
              {#if cell.glyph}<span class="piece" class:white={cell.color === "w"}>{cell.glyph}</span>{/if}
              {#if legalTargets.has(cell.square) && !cell.glyph}<span class="dot"></span>{/if}
            </button>
          {/each}
        </div>

        {#if bottom && bottomStake}
          <div class="playerbar">
            <Avatar name={bottom.displayName} id={bottom.id} avatar={bottom.avatar} size={30} profile />
            <span class="pname">{bottom.displayName}</span>
            {@render stakeChip(bottomStake)}
            <span class="clock" class:running={game.status === "active" && game.turn === bottomSide} class:low={clockMs(game, bottomSide) < 15_000}>
              {fmtClock(clockMs(game, bottomSide))}
            </span>
          </div>
        {/if}

        <p class="fineprint">
          {game.minutes} min each · pawns promote to queens · {topStake?.kind === "silver" ? "winner takes the whole pot" : "if the winner already owns the spoils, the house burns them"}
        </p>
      </div>
    {:else}
      <!-- ---- the lobby ---- -->
      <section class="panel">
        <div class="panel-label">POST A CHALLENGE</div>
        {#if mine}
          <div class="mychallenge">
            {@render stakeChip(mine.stake)}
            <span class="mc-text">Your open challenge — <b>{stakeName(mine.stake)}</b> at {mine.minutes} min. Waiting for a taker…</span>
            <button class="ghost" onclick={() => cancelChallenge()} disabled={chessduel.busy}>Withdraw</button>
          </div>
        {:else}
          <div class="compose">
            <div class="tc-row">
              <span class="tc-label">Clock</span>
              {#each [1, 3, 5] as m (m)}
                <button class="tc" class:on={minutes === m} onclick={() => (minutes = m)}>{m} min</button>
              {/each}
            </div>
            <div class="tc-row">
              <span class="tc-label">Stake</span>
              <button class="tc" class:on={stakeKind === "emoji"} onclick={() => (stakeKind = "emoji")}>Emoji</button>
              <button class="tc" class:on={stakeKind === "silver"} onclick={() => (stakeKind = "silver")}>Silver</button>
            </div>
            {#if stakeKind === "emoji"}
              <span class="pick-anchor">
                <button class="go" onclick={() => (pickingStake = !pickingStake)} disabled={chessduel.busy || activeMine != null}>
                  Stake an emoji…
                </button>
                {#if pickingStake}
                  <EmojiPicker
                    placement="down"
                    align="left"
                    onpick={(code) => {
                      pickingStake = false;
                      void postChallenge({ kind: "emoji", code }, minutes);
                    }}
                    onclose={() => (pickingStake = false)}
                  />
                {/if}
              </span>
              <span class="hint">Your emoji leaves your collection while the challenge stands.</span>
            {:else}
              <div class="silver-row">
                <span class="silver-input">
                  <Coin size={16} />
                  <input
                    type="number"
                    min="10"
                    max="100000"
                    step="10"
                    bind:value={silverAmount}
                    oninput={(e) => (silverAmount = clampSilver(+e.currentTarget.value))}
                  />
                </span>
                {#each [50, 100, 500] as p (p)}
                  <button class="preset" onclick={() => (silverAmount = p)}>{p}</button>
                {/each}
                <button class="go" disabled={chessduel.busy || activeMine != null || !canAffordSilver} onclick={postSilverChallenge}>
                  Stake {clampSilver(silverAmount).toLocaleString()}
                </button>
              </div>
              <span class="hint">
                Both players put up the same silver; winner takes the pot, a draw returns both.
                {#if !canAffordSilver}<b class="short"> You don't have that much.</b>{/if}
              </span>
            {/if}
          </div>
        {/if}
      </section>

      <section class="panel">
        <div class="panel-label">OPEN CHALLENGES</div>
        {#if chessduel.loading}
          <p class="muted">Setting up the boards…</p>
        {:else}
          {@const others = chessduel.challenges.filter((c) => c.challenger.id !== meId)}
          {#if others.length === 0}
            <p class="muted">No open challenges. Post one — somebody always fancies their chances.</p>
          {:else}
            {#each others as c (c.id)}
              {@const tooPoor = c.stake.kind === "silver" && wallet.coins < c.stake.amount}
              <div class="challenge">
                <Avatar name={c.challenger.displayName} id={c.challenger.id} avatar={c.challenger.avatar} size={30} profile />
                <span class="pname">{c.challenger.displayName}</span>
                {@render stakeChip(c.stake)}
                <span class="cmeta">{stakeName(c.stake)} · {c.minutes} min · {ago(c.createdAt)}</span>
                {#if c.stake.kind === "silver"}
                  <button
                    class="go"
                    disabled={chessduel.busy || activeMine != null || mine != null || tooPoor}
                    title={tooPoor ? "You don't have enough silver" : ""}
                    onclick={() => acceptSilver(c)}
                  >
                    Match {c.stake.amount.toLocaleString()}
                  </button>
                {:else}
                  <span class="pick-anchor">
                    <button
                      class="go"
                      disabled={chessduel.busy || activeMine != null || mine != null}
                      onclick={() => (acceptFor = acceptFor === c.id ? null : c.id)}
                    >
                      Accept…
                    </button>
                    {#if acceptFor === c.id}
                      <EmojiPicker
                        placement="down"
                        align="right"
                        onpick={(code) => {
                          acceptFor = null;
                          void acceptChallenge(c.id, { kind: "emoji", code });
                        }}
                        onclose={() => (acceptFor = null)}
                      />
                    {/if}
                  </span>
                {/if}
              </div>
            {/each}
          {/if}
        {/if}
      </section>

      <section class="panel">
        <div class="panel-label">ON THE BOARDS</div>
        {#if chessduel.games.length === 0}
          <p class="muted">No duels in progress. The pieces are getting restless.</p>
        {:else}
          {#each chessduel.games as g (g.id)}
            <div class="gamerow" class:over={g.status === "finished"}>
              <span class="pair">
                <b>{g.white.displayName}</b>
                {@render stakeChip(g.whiteStake, "sm")}
                vs
                <b>{g.black.displayName}</b>
                {@render stakeChip(g.blackStake, "sm")}
              </span>
              {#if g.status === "active"}
                <span class="gmeta">{g.minutes} min · {fmtClock(clockMs(g, "w"))} — {fmtClock(clockMs(g, "b"))}</span>
                <button class="ghost" onclick={() => spectate(g.id)}>Watch</button>
              {:else}
                <span class="gmeta">{resultLine(g)}</span>
                <button class="ghost" onclick={() => spectate(g.id)}>View</button>
              {/if}
              {#if g.status === "active" && g.white.id !== meId && g.black.id !== meId}
                <div class="sbp-slot">
                  <SideBetPanel
                    kind="chess"
                    gameId={g.id}
                    open={pliesOf(g.fen) < 4}
                    candidates={[
                      { id: g.white.id, name: g.white.displayName },
                      { id: g.black.id, name: g.black.displayName },
                    ]}
                  />
                </div>
              {/if}
            </div>
          {/each}
        {/if}
        <p class="fineprint">
          Winner takes the loser's stake. Draws hand both back. Duplicates go to the house furnace.
        </p>
      </section>
    {/if}
  </div>
</div>

<style>
  .root {
    height: 100%;
    overflow-y: auto;
    background:
      radial-gradient(ellipse 90% 60% at 50% 0%, rgba(24, 60, 38, 0.85), rgba(8, 22, 14, 0.95)),
      var(--felt) center / 480px repeat,
      #0a1810;
    padding: clamp(16px, 3.5vh, 36px) 20px 60px;
  }
  .inner {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    text-align: center;
    margin-bottom: 4px;
  }
  .marquee-line {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.34em;
    color: #d8b866;
  }
  .head h1 {
    margin: 4px 0 6px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(26px, 4.4vw, 40px);
    color: #f0d492;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
  }
  .head p {
    margin: 0;
    color: rgba(232, 224, 200, 0.65);
    font-size: 0.9rem;
  }

  .note.err {
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(150, 40, 30, 0.35);
    border: 1px solid rgba(220, 90, 70, 0.6);
    color: #f4d8ce;
    font-size: 0.86rem;
    text-align: center;
  }

  .panel {
    background: rgba(12, 26, 17, 0.82);
    border: 1px solid rgba(216, 184, 102, 0.32);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .panel-label {
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.28em;
    color: #d8b866;
    margin-bottom: 10px;
  }
  .muted {
    margin: 4px 0;
    color: rgba(232, 224, 200, 0.5);
    font-style: italic;
    font-size: 0.9rem;
  }

  .compose {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .tc-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .tc-label {
    font-size: 0.74rem;
    color: rgba(232, 224, 200, 0.6);
    margin-right: 2px;
  }
  .tc {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(216, 184, 102, 0.4);
    background: none;
    color: #e8e0c8;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }
  .tc.on {
    background: #d8b866;
    color: #241a04;
    border-color: #d8b866;
  }
  /* Touch: the clock and stake pickers measured 58×29, and they sit in a row
     of five — the classic phone miss, where the neighbouring option is closer
     to the thumb than the gap between them. */
  @media (hover: none), (max-width: 760px) {
    .tc { min-height: 44px; padding: 6px 16px; }
  }
  .hint {
    font-size: 0.74rem;
    color: rgba(232, 224, 200, 0.45);
  }
  .pick-anchor {
    position: relative;
    display: inline-flex;
  }

  .go {
    padding: 8px 18px;
    border-radius: 9px;
    border: none;
    background: #d8b866;
    color: #241a04;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .go:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .go:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ghost {
    padding: 7px 14px;
    border-radius: 9px;
    border: 1px solid rgba(216, 184, 102, 0.4);
    background: none;
    color: #e8e0c8;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .ghost:hover {
    border-color: #d8b866;
  }

  .mychallenge,
  .challenge,
  .gamerow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 4px;
    flex-wrap: wrap;
  }
  .sbp-slot {
    flex-basis: 100%;
  }
  .challenge + .challenge,
  .gamerow + .gamerow {
    border-top: 1px solid rgba(216, 184, 102, 0.14);
  }
  .pname {
    font-weight: 700;
    color: #f0e8d0;
    font-size: 0.92rem;
  }
  .mc-text {
    flex: 1;
    color: rgba(232, 224, 200, 0.8);
    font-size: 0.88rem;
  }
  .cmeta,
  .gmeta {
    flex: 1;
    color: rgba(232, 224, 200, 0.55);
    font-size: 0.8rem;
    min-width: 0;
  }
  .stake {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(216, 184, 102, 0.35);
    flex: none;
  }
  .stake img {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }
  .stake.sm {
    width: 26px;
    height: 26px;
    border-radius: 7px;
  }
  .stake.sm img {
    width: 19px;
    height: 19px;
  }
  /* Silver stake: a coin + amount pill instead of a square emoji tile. */
  .stake.silver {
    width: auto;
    min-width: 34px;
    height: 34px;
    padding: 0 10px 0 7px;
    gap: 4px;
    grid-auto-flow: column;
    background: rgba(216, 184, 102, 0.14);
  }
  .stake.silver .amt {
    color: #f0d492;
    font-weight: 800;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }
  .stake.silver.sm {
    width: auto;
    height: 26px;
    padding: 0 7px 0 5px;
  }
  .stake.silver.sm .amt {
    font-size: 0.72rem;
  }
  /* Silver-amount compose row */
  .silver-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .silver-input {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 9px;
    border: 1px solid rgba(216, 184, 102, 0.4);
    background: rgba(0, 0, 0, 0.3);
  }
  .silver-input input {
    width: 76px;
    background: none;
    border: none;
    color: #f0d492;
    font: inherit;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .silver-input input:focus {
    outline: none;
  }
  .preset {
    padding: 6px 11px;
    border-radius: 8px;
    border: 1px solid rgba(216, 184, 102, 0.4);
    background: none;
    color: #e8e0c8;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .preset:hover {
    border-color: #d8b866;
  }
  .short {
    color: #f4a894;
  }
  .pair {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(232, 224, 200, 0.75);
    font-size: 0.88rem;
    flex-wrap: wrap;
  }
  .pair b {
    color: #f0e8d0;
  }
  .gamerow.over .pair {
    opacity: 0.75;
  }

  /* ---- the table ---- */
  .table {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }
  .table-top {
    width: min(480px, 92vw);
    display: flex;
    justify-content: space-between;
  }
  .back-lobby {
    background: none;
    border: none;
    color: rgba(232, 224, 200, 0.7);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .back-lobby:hover {
    color: #f0d492;
  }
  .resign {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid rgba(220, 90, 70, 0.6);
    background: none;
    color: #e8a396;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }
  .resign:hover:not(:disabled) {
    background: rgba(150, 40, 30, 0.3);
  }

  .banner {
    width: min(480px, 92vw);
    text-align: center;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(216, 184, 102, 0.16);
    border: 1px solid rgba(216, 184, 102, 0.45);
    color: #f0d492;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .banner.draw {
    background: rgba(120, 120, 120, 0.18);
    border-color: rgba(200, 200, 200, 0.35);
    color: #ddd6c4;
  }
  .banner.spec {
    background: rgba(40, 70, 110, 0.25);
    border-color: rgba(120, 160, 210, 0.4);
    color: #cfe0f2;
    font-weight: 600;
  }
  .banner.yours.check {
    background: rgba(150, 40, 30, 0.3);
    border-color: rgba(220, 90, 70, 0.6);
    color: #f4c9be;
  }
  .banner.wait {
    background: rgba(60, 60, 60, 0.2);
    border-color: rgba(160, 160, 160, 0.3);
    color: rgba(240, 230, 210, 0.65);
    font-weight: 600;
  }
  .banner.wait.check {
    background: rgba(150, 40, 30, 0.2);
    border-color: rgba(220, 90, 70, 0.4);
    color: #e8b4aa;
  }

  .playerbar {
    width: min(480px, 92vw);
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .clock {
    margin-left: auto;
    padding: 4px 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(216, 184, 102, 0.3);
    color: #e8e0c8;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    font-size: 1.02rem;
  }
  .clock.running {
    border-color: #d8b866;
    color: #f0d492;
    box-shadow: 0 0 12px rgba(216, 184, 102, 0.25);
  }
  .clock.running.low {
    border-color: rgba(220, 90, 70, 0.8);
    color: #f4a894;
    box-shadow: 0 0 12px rgba(220, 80, 60, 0.35);
  }

  .board {
    width: min(480px, 92vw);
    aspect-ratio: 1;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(8, 1fr);
    border: 6px solid #4a2d12;
    outline: 2px solid rgba(216, 184, 102, 0.55);
    border-radius: 6px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .board.done {
    filter: saturate(0.8) brightness(0.92);
  }
  .sq {
    position: relative;
    display: grid;
    place-items: center;
    border: none;
    padding: 0;
    background: #e6d2ab;
    cursor: pointer;
    font: inherit;
  }
  .sq.dark {
    background: #7a5732;
  }
  .sq.last {
    background: #cdbf6e;
  }
  .sq.dark.last {
    background: #96854a;
  }
  .sq.sel {
    background: #d8b866;
  }
  .sq.target {
    cursor: pointer;
  }
  .piece {
    font-size: clamp(24px, 5.4vw, 40px);
    line-height: 1;
    color: #241a08;
    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.18);
    pointer-events: none;
  }
  .piece.white {
    color: #fdf6e6;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  }
  .dot {
    width: 26%;
    height: 26%;
    border-radius: 50%;
    background: rgba(36, 26, 4, 0.35);
    pointer-events: none;
  }
  .sq.dark .dot {
    background: rgba(255, 244, 214, 0.35);
  }

  .fineprint {
    margin: 2px 0 0;
    color: rgba(232, 224, 200, 0.45);
    font-size: 0.74rem;
    text-align: center;
  }
</style>
