<script lang="ts">
  // Chess Duel over Josh's real set: the pieces on the table ARE the game
  // (chessboard.ts moves them from the live FEN; you click squares in the
  // world). This strip carries the duel lifecycle; BOTH CLOCKS float on the
  // LEFT side of the screen (Josh's call), and a challenge stakes either
  // SILVER or an EMOJI from your inventory — the full 2D contract.
  import { chessduel, myGame, myChallenge, postChallenge, cancelChallenge, acceptChallenge, resignGame } from "../../lib/chessduel.svelte";
  import { wallet } from "../../lib/wallet.svelte";
  import { session } from "../../lib/session.svelte";
  import { emoji, loadEmoji } from "../../lib/emoji.svelte";
  import "./strip.css";

  const g = $derived(myGame() ?? chessduel.games.find((x) => x.status === "active") ?? null);
  const ch = $derived(myChallenge());
  const me = $derived(session.user?.id);
  const myColor = $derived(g && me != null ? (g.white.id === me ? "w" : g.black.id === me ? "b" : null) : null);

  type Mode = "silver" | "emoji";
  let mode = $state<Mode>("silver");
  let amount = $state(25);
  let stakeCode = $state<string | null>(null);
  let minutes = $state(3);
  /** Accepting an emoji-stake challenge needs an emoji of ours too. */
  let accepting = $state<string | null>(null);

  $effect(() => {
    if (!emoji.loaded) void loadEmoji();
  });

  let now = $state(Date.now());
  $effect(() => {
    const iv = setInterval(() => (now = Date.now()), 300);
    return () => clearInterval(iv);
  });
  const clock = (base: number, color: "w" | "b"): string => {
    let ms = base;
    if (g && g.status === "active" && g.turn === color) ms -= now - g.lastMoveAt;
    ms = Math.max(0, ms);
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };

  const spec = (): { kind: "emoji"; code: string } | { kind: "silver"; amount: number } | null => {
    if (mode === "silver") return { kind: "silver", amount };
    return stakeCode ? { kind: "emoji", code: stakeCode } : null;
  };
  const canPost = $derived(
    mode === "silver" ? amount >= 10 && amount <= wallet.coins : !!stakeCode,
  );
</script>

{#if g}
  <!-- BOTH CLOCKS on the left of the screen (Josh) -->
  <div class="clockrail">
    <div class="clk" class:hot={g.turn === "w" && g.status === "active"}>
      <span class="who">♔ {g.white.displayName || g.white.username}</span>
      <span class="time">{clock(g.wMs, "w")}</span>
    </div>
    <div class="clk" class:hot={g.turn === "b" && g.status === "active"}>
      <span class="who">♚ {g.black.displayName || g.black.username}</span>
      <span class="time">{clock(g.bMs, "b")}</span>
    </div>
  </div>
{/if}

<div class="strip">
  {#if g}
    {#if g.status === "active"}
      {#if myColor}
        <span class="snote">{g.turn === myColor ? "your move — click a piece, then a square" : "their move…"}</span>
        <button class="sbtn danger" onclick={() => resignGame(g.id)}>resign</button>
      {:else}
        <span class="snote">live duel — spectating</span>
      {/if}
    {:else}
      <span class="schip">
        {g.winner === "draw" ? "drawn" : `${g.winner === "white" ? g.white.username : g.black.username} wins`} · {g.endReason}
      </span>
    {/if}
  {:else if ch}
    <span class="schip">your challenge is up · {ch.minutes} min · {ch.stake.kind === "silver" ? `${ch.stake.amount} silver` : ch.stake.emoji.name}</span>
    <button class="sbtn danger" onclick={() => cancelChallenge()}>take it down</button>
  {:else}
    <span class="schip">you <b>{wallet.coins}</b></span>
    {#each chessduel.challenges as c (c.id)}
      {#if c.stake.kind === "silver"}
        <button
          class="sbtn hot"
          disabled={c.stake.amount > wallet.coins || chessduel.busy}
          onclick={() => c.stake.kind === "silver" && acceptChallenge(c.id, { kind: "silver", amount: c.stake.amount })}
        >
          accept {c.challenger.username} · {c.stake.amount} silver · {c.minutes}m
        </button>
      {:else}
        <button class="sbtn" class:hot={accepting === c.id} onclick={() => (accepting = accepting === c.id ? null : c.id)}>
          accept {c.challenger.username} · stakes {c.stake.emoji.name} · {c.minutes}m
        </button>
      {/if}
    {/each}
    <button class="sbtn" class:hot={mode === "silver"} onclick={() => (mode = "silver")}>SILVER</button>
    <button class="sbtn" class:hot={mode === "emoji"} onclick={() => (mode = "emoji")}>EMOJI</button>
    {#if mode === "silver"}
      <input class="snum" type="number" min={10} max={100000} bind:value={amount} />
    {/if}
    {#each [1, 3, 5] as m (m)}
      <button class="sbtn" class:hot={minutes === m} onclick={() => (minutes = m)}>{m}m</button>
    {/each}
    <button
      class="sbtn hot"
      disabled={!canPost || chessduel.busy}
      onclick={() => {
        const sp = spec();
        if (sp) void postChallenge(sp, minutes);
      }}
    >
      CHALLENGE · {mode === "silver" ? `${amount} silver` : (emoji.owned.find((e) => e.code === stakeCode)?.name ?? "pick an emoji")}
    </button>
  {/if}
  {#if chessduel.error}<span class="serr">{chessduel.error}</span>{/if}
</div>
{#if !g && !ch && (mode === "emoji" || accepting)}
  <!-- your inventory: pick the emoji you're putting on the board -->
  <div class="stakes">
    {#each emoji.owned as e (e.code)}
      <button
        class="stake"
        class:on={stakeCode === e.code}
        title={`${e.name} · ${e.tier}`}
        onclick={() => {
          if (accepting) {
            const id = accepting;
            accepting = null;
            void acceptChallenge(id, { kind: "emoji", code: e.code });
          } else stakeCode = stakeCode === e.code ? null : e.code;
        }}
      >
        <img src={`/emoji/${e.file}`} alt={e.name} loading="lazy" />
      </button>
    {:else}
      <span class="snote">no emoji in your collection — spin the Wheel</span>
    {/each}
  </div>
{/if}

<style>
  .clockrail {
    position: fixed;
    left: 18px;
    top: 38%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    z-index: 5;
  }
  .clk {
    background: #14100cdd;
    border: 1px solid #4a3f2c;
    border-radius: 12px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 128px;
  }
  .clk.hot {
    border-color: #e8c33c;
    box-shadow: 0 0 12px #e8c33c33;
  }
  .clk .who {
    color: #cfc6b4;
    font: 700 13px system-ui, sans-serif;
  }
  .clk .time {
    color: #f3ead6;
    font: 800 24px ui-monospace, monospace;
  }
  .clk.hot .time {
    color: #e8c33c;
  }
  .stakes {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 4px 18px 10px;
    max-width: 780px;
    margin: 0 auto;
    pointer-events: auto;
  }
  .stake {
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
    border-radius: 10px;
    border: 2px solid #3a3428;
    background: #14100c;
    cursor: pointer;
    padding: 4px;
  }
  .stake img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .stake.on {
    border-color: #e8c33c;
  }
</style>
