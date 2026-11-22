<script lang="ts">
  // THE JUKEBOX's screen — what you get when you press E at the machine.
  // Now playing with a running needle, the queue, a search box over the whole
  // library, the skip vote, and this listener's own volume.
  import { onMount } from "svelte";
  import {
    juke, loadJukebox, queueSong, voteSkipSong, setJukeVolume, setJukeMuted,
  } from "./jukebox.svelte";
  import { musicBlocked } from "./music";
  import { wallet } from "../lib/wallet.svelte";

  let q = $state("");
  let now = $state(Date.now());
  onMount(() => {
    void loadJukebox();
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });

  const st = $derived(juke.state);
  const playing = $derived(st?.now ?? null);

  /** The playhead, advanced locally between frames — the socket only speaks
   *  when something changes, so the bar would otherwise sit still. */
  let anchor = $state({ at: 0, pos: 0, id: 0 });
  $effect(() => {
    const p = juke.state?.now;
    if (!p) return;
    if (p.id !== anchor.id || Math.abs(p.posMs - (anchor.pos + (Date.now() - anchor.at))) > 2000) {
      anchor = { at: Date.now(), pos: p.posMs, id: p.id };
    }
  });
  const posMs = $derived(playing ? Math.min(playing.durationMs, anchor.pos + (now - anchor.at)) : 0);

  const clock = (ms: number): string => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const matches = $derived(
    (() => {
      const needle = q.trim().toLowerCase();
      const all = juke.library;
      if (!needle) return all;
      return all.filter(
        (s) =>
          s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle),
      );
    })(),
  );
  const queuedIds = $derived(new Set((st?.queue ?? []).map((e) => e.id)));
  const canAfford = $derived(wallet.coins >= juke.price);
</script>

<div class="juke">
  <header>
    <h2>♫ THE JUKEBOX</h2>
    <span class="bal">🪙 {wallet.coins.toLocaleString()}</span>
  </header>

  {#if musicBlocked()}
    <p class="warn">your browser is holding the sound — click anywhere to let it play</p>
  {/if}

  <!-- NOW PLAYING -->
  <div class="deck">
    {#if playing}
      <div class="spin" aria-hidden="true"><span class="disc"></span></div>
      <div class="what">
        <div class="title">{playing.title}</div>
        <div class="artist">{playing.artist || "unknown"}</div>
        <div class="bar"><i style="width:{(posMs / playing.durationMs) * 100}%"></i></div>
        <div class="times">
          <span>{clock(posMs)}</span>
          <span class="who">{playing.by ? `picked by ${playing.by}` : ""}</span>
          <span>{clock(playing.durationMs)}</span>
        </div>
      </div>
      <button
        class="skip"
        onclick={voteSkipSong}
        disabled={juke.busy || wallet.coins < juke.skipPrice}
        title="{juke.skipPrice} silver a vote · {st?.need ?? 1} of the {st?.listeners ?? 0} people on the floor have to agree"
      >
        ⏭ skip
        <small>{st?.votes ?? 0}/{st?.need ?? 1} · {juke.skipPrice}🪙</small>
      </button>
    {:else}
      <p class="idle">
        the machine is quiet — nothing plays until somebody puts it on
      </p>
    {/if}
  </div>

  <!-- THIS LISTENER'S OWN SOUND -->
  <div class="mine">
    <button class="mute" class:off={juke.muted} onclick={() => setJukeMuted(!juke.muted)}>
      {juke.muted ? "🔇 music off" : "🔊 music on"}
    </button>
    <input
      class="vol"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={juke.volume}
      disabled={juke.muted}
      aria-label="jukebox volume"
      oninput={(e) => setJukeVolume(Number(e.currentTarget.value))}
    />
    <span class="pct">{Math.round(juke.volume * 100)}%</span>
    <span class="note">yours only — nobody else's</span>
  </div>

  <!-- UP NEXT -->
  {#if (st?.queue ?? []).length}
    <div class="upnext">
      <h3>up next</h3>
      <ol>
        {#each st?.queue ?? [] as e, i (String(e.id) + i)}
          <li><b>{e.title}</b> <span>{e.artist}</span> <em>{e.by}</em></li>
        {/each}
      </ol>
    </div>
  {/if}

  <!-- THE LIBRARY -->
  <div class="find">
    <input class="q" placeholder="search the records…" bind:value={q} />
    <span class="price">{juke.price} silver a pick</span>
  </div>
  <div class="list">
    {#if juke.loading}
      <p class="idle">reading the labels…</p>
    {:else if !matches.length}
      <p class="idle">{juke.library.length ? "nothing by that name" : "the library is empty"}</p>
    {:else}
      {#each matches as s (s.id)}
        <button
          class="rec"
          disabled={juke.busy || queuedIds.has(s.id) || playing?.id === s.id || !canAfford}
          onclick={() => queueSong(s.id)}
        >
          <span class="rt">{s.title}</span>
          <span class="ra">{s.artist || "unknown"}</span>
          <span class="rd">{clock(s.durationMs)}</span>
          <span class="rq">
            {#if playing?.id === s.id}on{:else if queuedIds.has(s.id)}queued{:else if !canAfford}—{:else}play{/if}
          </span>
        </button>
      {/each}
    {/if}
  </div>

  {#if juke.msg}<p class="msg">{juke.msg}</p>{/if}
</div>

<style>
  .juke {
    padding: 16px 20px 20px;
    color: #e6dfd0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 100%;
    /* The dock's own gradient is enough behind a short strip of chips, but this
       panel is a long list of titles standing over a LIT machine — without its
       own backing the room reads straight through the rows. */
    background: rgba(10, 8, 5, 0.9);
    border-top: 1px solid #3a2f22;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.5);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  h2 {
    margin: 0;
    color: #e8c33c;
    font-size: 1.1rem;
    letter-spacing: 0.14em;
  }
  .bal {
    margin-left: auto;
    color: #e8c33c;
    font-weight: 700;
  }
  .warn {
    margin: 0;
    color: #e8a33c;
    font-size: 0.8rem;
  }
  .idle {
    margin: 0;
    color: #9aa3b2;
    font-size: 0.85rem;
  }

  /* now playing */
  .deck {
    display: grid;
    grid-template-columns: 46px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    background: #191510;
    border: 1px solid #3a2f22;
    border-radius: 10px;
  }
  .spin {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
  }
  .disc {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background:
      radial-gradient(circle, #e8c33c 0 5px, #1b1712 5px 7px, #2a231b 7px 100%);
    box-shadow: inset 0 0 0 1px #4a3d2c;
    animation: rev 2.4s linear infinite;
  }
  @keyframes rev {
    to {
      transform: rotate(360deg);
    }
  }
  .title {
    font-weight: 800;
  }
  .artist {
    color: #9aa3b2;
    font-size: 0.8rem;
  }
  .bar {
    margin-top: 6px;
    height: 4px;
    border-radius: 2px;
    background: #2a231b;
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: #e8c33c;
  }
  .times {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.7rem;
    color: #9aa3b2;
    margin-top: 3px;
  }
  .who {
    color: #c8a24a;
  }
  .skip {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 8px 12px;
    background: none;
    border: 1px solid #5a4a33;
    border-radius: 8px;
    color: #e6dfd0;
    cursor: pointer;
    font-size: 0.82rem;
  }
  .skip:hover:not(:disabled) {
    border-color: #e8c33c;
    color: #e8c33c;
  }
  .skip small {
    color: #9aa3b2;
    font-size: 0.66rem;
  }

  /* per-listener sound */
  .mine {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .mute {
    background: #241c12;
    border: 1px solid #5a4a33;
    color: #e6dfd0;
    border-radius: 8px;
    padding: 5px 12px;
    cursor: pointer;
    font-size: 0.82rem;
  }
  .mute.off {
    border-color: #a5462f;
    color: #d97a5a;
  }
  .vol {
    flex: 1;
    min-width: 120px;
    accent-color: #e8c33c;
  }
  .pct {
    font-size: 0.78rem;
    color: #9aa3b2;
    width: 3ch;
  }
  .note {
    font-size: 0.72rem;
    color: #6f7684;
  }

  /* queue */
  .upnext h3 {
    margin: 0 0 4px;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    color: #9aa3b2;
    text-transform: uppercase;
  }
  .upnext ol {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 2px;
  }
  .upnext li {
    font-size: 0.8rem;
  }
  .upnext span {
    color: #9aa3b2;
  }
  .upnext em {
    color: #c8a24a;
    font-style: normal;
    font-size: 0.72rem;
  }

  /* the library */
  .find {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .q {
    flex: 1;
    background: #120f0b;
    border: 1px solid #3a2f22;
    border-radius: 8px;
    color: #e6dfd0;
    padding: 7px 11px;
    font: inherit;
  }
  .q:focus {
    outline: none;
    border-color: #e8c33c;
  }
  .price {
    font-size: 0.76rem;
    color: #e8c33c;
    white-space: nowrap;
  }
  .list {
    overflow-y: auto;
    display: grid;
    gap: 4px;
    min-height: 0;
  }
  .rec {
    display: grid;
    grid-template-columns: 1fr auto 46px 52px;
    gap: 10px;
    align-items: center;
    text-align: left;
    padding: 7px 12px;
    background: #191510;
    border: 1px solid #2f271d;
    border-radius: 8px;
    color: #e6dfd0;
    cursor: pointer;
    font: inherit;
    font-size: 0.84rem;
  }
  .rec:hover:not(:disabled) {
    border-color: #e8c33c;
  }
  .rec:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ra {
    color: #9aa3b2;
    font-size: 0.78rem;
  }
  .rd {
    color: #6f7684;
    font-size: 0.75rem;
    text-align: right;
  }
  .rq {
    color: #e8c33c;
    font-size: 0.74rem;
    text-align: right;
  }
  .msg {
    margin: 0;
    color: #e8c33c;
    font-size: 0.82rem;
  }
  @media (max-width: 700px) {
    .rec {
      grid-template-columns: 1fr 46px 52px;
    }
    .ra {
      display: none;
    }
  }
</style>
