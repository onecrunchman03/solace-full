<script lang="ts">
  import {
    voice, leaveVoice, toggleMute, toggleDeafen, setUserVolume, enableVoiceAudio,
    toggleCamera, toggleScreenShare, canScreenShare, triggerSoundboard, setSoundboardVolume,
    previewBoardSound,
  } from "../lib/voice.svelte";
  import { board, loadBoard, addBoardSound, removeBoardSound } from "../lib/soundboard.svelte";

  // THE HOUSE SOUNDBOARD (migration 73): one shared library — every pad here
  // is playable by anyone in the room; the server fans a play out to the room.
  let boardOpen = $state(false);
  let search = $state("");
  let adding = $state(false);
  let addName = $state("");
  let addEmoji = $state("");
  let addFile = $state<File | null>(null);
  let addErr = $state("");
  let busy = $state(false);
  function openBoard(): void {
    boardOpen = !boardOpen;
    if (boardOpen && !board.loaded) void loadBoard();
  }
  const shownPads = $derived(
    search.trim()
      ? board.sounds.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
      : board.sounds,
  );
  const isStaff = $derived(!!session.user && (session.user.isAdmin || session.user.role === "moderator"));
  async function submitAdd(): Promise<void> {
    if (!addFile || !addName.trim() || busy) return;
    busy = true;
    addErr = "";
    const r = await addBoardSound(addFile, addName.trim(), addEmoji.trim());
    busy = false;
    if (!r.ok) {
      addErr =
        r.error === "board_full" ? `You've hit the cap (${board.max} sounds).` :
        r.error === "unsupported_type" ? "MP3, OGG, or WAV only." :
        r.error === "file_too_large" ? "Too big — 400 KB max." :
        "Couldn't add that.";
      return;
    }
    adding = false;
    addName = "";
    addEmoji = "";
    addFile = null;
  }
  // Press feedback + a client-side mirror of the server's 2s cooldown (so a
  // rapid second tap visibly waits instead of silently doing nothing).
  let hitId = $state<number | null>(null);
  let coolUntil = $state(0);
  let coolTick = $state(0);
  const coolLeft = $derived(Math.max(0, coolUntil - coolTick));
  function firePad(id: number): void {
    if (Date.now() < coolUntil) return;
    triggerSoundboard(id);
    hitId = id;
    coolUntil = Date.now() + 2000;
    setTimeout(() => (hitId = null), 350);
    const t = setInterval(() => {
      coolTick = Date.now();
      if (coolTick >= coolUntil) clearInterval(t);
    }, 120);
  }
  import { chat } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import Avatar from "./Avatar.svelte";

  const channelName = $derived(
    chat.channels.find((c) => c.id === voice.channelId)?.name ?? "voice",
  );
  const QUALITY_COLOR: Record<string, string> = {
    excellent: "var(--ok)",
    good: "#e8c24a",
    poor: "var(--danger)",
    lost: "var(--danger)",
  };
  const meId = $derived(session.user?.id ?? -1);
</script>

{#if voice.channelId !== null}
  <div class="dock">
    <div class="top">
      <span class="live-dot"></span>
      <span class="chname" title={channelName}>🔊 {channelName}</span>
      <button class="icon leave" title="Disconnect" onclick={leaveVoice}>⏏</button>
    </div>

    {#if voice.audioBlocked}
      <button class="audio-unblock" onclick={enableVoiceAudio}>
        🔈 Reconnected — click to hear the room
      </button>
    {/if}

    {#if voice.mutedTalking}
      <div class="muted-toast">You're muted — nobody can hear you.</div>
    {/if}

    {#if voice.peers.length}
      <div class="peers">
        {#each voice.peers as p (p.userId)}
          <div class="peer-row" class:speaking={p.speaking}>
            <span class="peer-ava">
              <Avatar name={p.name} id={p.userId} avatar={p.avatar} size={22} profile />
              {#if p.muted}<span class="mutebadge">🔇</span>{/if}
            </span>
            <span class="peer-name" title={p.name}>{p.name}</span>
            {#if p.quality}
              <span
                class="qdot"
                style="background: {QUALITY_COLOR[p.quality]}"
                title="Connection: {p.quality}"
              ></span>
            {/if}
            {#if p.userId !== meId}
              <input
                class="vol"
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={voice.volumes[p.userId] ?? 1}
                title="Volume for {p.name}"
                oninput={(e) => setUserVolume(p.userId, Number(e.currentTarget.value))}
              />
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="btns">
      <button class="icon" class:off={voice.muted} title={voice.muted ? "Unmute" : "Mute"} onclick={toggleMute}>
        {voice.muted ? "🎙️̶" : "🎙️"}
      </button>
      <button class="icon" class:off={voice.deafened} title={voice.deafened ? "Undeafen" : "Deafen"} onclick={toggleDeafen}>
        {voice.deafened ? "🔇" : "🎧"}
      </button>
      <button class="icon" class:live={voice.camOn} title={voice.camOn ? "Stop camera" : "Start camera"} onclick={toggleCamera}>
        📷
      </button>
      {#if canScreenShare}
        <button class="icon" class:live={voice.screenOn} title={voice.screenOn ? "Stop sharing" : "Share your screen"} onclick={toggleScreenShare}>
          🖥️
        </button>
      {/if}
      <button class="icon" class:live={boardOpen} title="Soundboard" onclick={openBoard}>
        🎛️
      </button>
    </div>
    {#if boardOpen}
      <div class="board">
        <div class="board-head">
          <span class="board-title" title="One shared library — pads play out loud for everyone in the room">SOUNDBOARD</span>
          {#if coolLeft > 0}<span class="cool">wait</span>{/if}
          <button
            class="boardmute"
            title={voice.soundboardVolume === 0 ? "Unmute incoming soundboard audio" : "Mute incoming soundboard audio (for you only)"}
            onclick={() => setSoundboardVolume(voice.soundboardVolume === 0 ? 1 : 0)}
          >{voice.soundboardVolume === 0 ? "🔇" : "🔊"}</button>
        </div>
        {#if board.sounds.length > 12}
          <input class="board-search" type="search" placeholder="Search sounds…" bind:value={search} />
        {/if}
        <div class="pads">
          {#each shownPads as pad (pad.id)}
            <button
              class="pad"
              class:hit={hitId === pad.id}
              disabled={coolLeft > 0}
              title="{pad.name} — added by {pad.owner}. Plays for the whole room."
              onclick={() => firePad(pad.id)}
            >
              <span class="pad-glyph">{pad.emoji ?? "▶"}</span>
              <span class="pad-name">{pad.name}</span>
              <span
                class="pad-mini preview"
                role="button"
                tabindex="-1"
                title="Preview (only you hear it)"
                onclick={(e) => { e.stopPropagation(); previewBoardSound(pad.file); }}
                onkeydown={(e) => e.stopPropagation()}
              >🎧</span>
              {#if pad.ownerId === session.user?.id || isStaff}
                <span
                  class="pad-mini del"
                  role="button"
                  tabindex="-1"
                  title="Remove from the library"
                  onclick={(e) => { e.stopPropagation(); void removeBoardSound(pad.id); }}
                  onkeydown={(e) => e.stopPropagation()}
                >✕</span>
              {/if}
            </button>
          {/each}
          {#if board.loaded && !board.sounds.length}
            <p class="board-empty">The library is empty — add the first sound.</p>
          {/if}
        </div>
        {#if adding}
          <div class="board-add">
            <input class="add-file" type="file" accept=".mp3,.ogg,.wav,audio/*"
              onchange={(e) => (addFile = e.currentTarget.files?.[0] ?? null)} />
            <div class="add-row">
              <input class="add-emoji" type="text" placeholder="😀" maxlength="8" bind:value={addEmoji} />
              <input class="add-name" type="text" placeholder="Name" maxlength="24" bind:value={addName} />
            </div>
            <div class="add-row">
              <button class="add-btn" disabled={!addFile || !addName.trim() || busy} onclick={submitAdd}>Add</button>
              <button class="add-btn ghost" onclick={() => { adding = false; addErr = ""; }}>Cancel</button>
            </div>
            {#if addErr}<p class="add-err">{addErr}</p>{/if}
          </div>
        {:else if board.mine < board.max}
          <button class="board-addlink" onclick={() => (adding = true)}>
            + Add a sound ({board.mine}/{board.max}) — MP3/OGG/WAV, 400 KB
          </button>
        {/if}
      </div>
    {/if}
    <!-- Devices, noise suppression, and push-to-talk live in
         Settings → Voice now; the dock stays lean for the call itself. -->
  </div>
{/if}

<style>
  .dock {
    min-width: 0; /* never let a child force the dock wider than its column */
    margin-top: 6px;
    padding: 8px 9px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  /* Soundboard — launchpad-style square pads, not a list of filenames. */
  .board {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 7px 8px 8px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--accent) 6%, var(--panel));
  }
  /* The dock lives in a ~175px rail, so every part of this header has to be
     told not to wrap or grow: the title ellipsises, the button is flex:none.
     Without both, the hint text wrapped to three lines and shoved the mute
     button off the right edge (Josh's screenshot). */
  .board-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--ink-dim);
  }
  .board-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
  }
  .board-head .cool {
    flex: none;
    font-weight: 700;
    letter-spacing: 0;
    font-size: 0.6rem;
    color: var(--accent);
    white-space: nowrap;
  }
  .boardmute {
    flex: none;
    background: none;
    border: none;
    padding: 0;
    font-size: 0.8rem;
    cursor: pointer;
    line-height: 1;
    opacity: 0.8;
  }
  .boardmute:hover {
    opacity: 1;
  }
  .pads {
    display: grid;
    /* auto-fit + a real minimum, NOT a fixed 3 columns: in the narrow rail,
       three tracks left ~52px per pad and every name clipped mid-word. This
       fits as many 70px pads as the dock can actually hold (two in the rail,
       more in the mobile bottom sheet) and lets them stretch. */
    grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
    gap: 6px;
    min-width: 0;
  }
  .pad {
    position: relative;
    min-width: 0; /* grid items default to min-width:auto — the other half of the overflow */
    aspect-ratio: 1 / 1;
    max-height: 84px; /* keep pads tappable, not enormous, in the wide sheet */
    border-radius: 9px;
    border: 1px solid var(--line);
    background:
      linear-gradient(160deg, color-mix(in srgb, var(--accent) 14%, var(--panel-2)), var(--panel));
    color: var(--ink);
    font: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px 3px 3px;
    cursor: pointer;
    box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
    transition: transform 0.08s, border-color 0.12s, box-shadow 0.12s;
  }
  .pad:hover:not(:disabled) {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .pad:active:not(:disabled),
  .pad.hit {
    transform: translateY(1px) scale(0.97);
    border-color: var(--accent);
    box-shadow:
      inset 0 1px 3px rgba(0, 0, 0, 0.35),
      0 0 10px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .pad:disabled {
    opacity: 0.55;
    cursor: default;
  }
  /* Corner mini-actions: preview (headphones) and remove. Spans styled as
     buttons because a real <button> can't nest inside the pad button. */
  .pad-mini {
    position: absolute;
    top: 2px;
    font-size: 0.58rem;
    line-height: 1;
    padding: 2px;
    border-radius: 5px;
    opacity: 0;
    transition: opacity 0.12s;
    cursor: pointer;
  }
  .pad:hover .pad-mini,
  .pad:focus-visible .pad-mini {
    opacity: 0.75;
  }
  .pad-mini:hover {
    opacity: 1 !important;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .pad-mini.preview {
    left: 2px;
  }
  .pad-mini.del {
    right: 2px;
    color: var(--danger);
  }
  .board-search {
    width: 100%;
    padding: 4px 8px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.68rem;
  }
  .board-empty {
    grid-column: 1 / -1;
    margin: 2px 0;
    font-size: 0.66rem;
    color: var(--ink-dim);
    text-align: center;
  }
  .board-addlink {
    background: none;
    border: 1px dashed var(--line);
    border-radius: 7px;
    padding: 4px 6px;
    font: inherit;
    font-size: 0.62rem;
    color: var(--ink-dim);
    cursor: pointer;
  }
  .board-addlink:hover {
    color: var(--ink);
    border-color: var(--accent);
  }
  .board-add {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .board-add .add-file {
    font-size: 0.62rem;
    color: var(--ink-dim);
    max-width: 100%;
  }
  .add-row {
    display: flex;
    gap: 4px;
    min-width: 0;
  }
  .add-emoji {
    width: 34px;
    flex: none;
    text-align: center;
  }
  .add-name {
    flex: 1;
    min-width: 0;
  }
  .add-emoji,
  .add-name {
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.68rem;
  }
  .add-btn {
    flex: 1;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--panel));
    color: var(--ink);
    font: inherit;
    font-size: 0.66rem;
    font-weight: 700;
    cursor: pointer;
  }
  .add-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .add-btn.ghost {
    border-color: var(--line);
    background: none;
    color: var(--ink-dim);
  }
  .add-err {
    margin: 0;
    font-size: 0.62rem;
    color: var(--danger);
  }
  .pad-glyph {
    font-size: 0.9rem;
    line-height: 1;
    color: var(--accent);
  }
  .pad-name {
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  /* Phones: the rail is a 58px icon strip — a dock in there is unusable.
     Float it as a bottom sheet over the content instead. */
  @media (max-width: 820px) {
    .dock {
      position: fixed;
      left: 66px;
      right: 10px;
      bottom: calc(10px + env(safe-area-inset-bottom));
      z-index: 80;
      margin-top: 0;
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
    }
  }
  /* Phone mode: no rail on the left, and a tab bar underneath to clear. */
  /* (Oct 2026 review) the float itself is repeated here: a landscape phone
     is wider than 820px, so only this clause matches it, and the dock sat
     in-flow inside the shell grid. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .dock {
      position: fixed;
      right: 10px;
      z-index: 80;
      margin-top: 0;
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
      left: 10px;
      bottom: calc(74px + env(safe-area-inset-bottom));
    }
  }
  .top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .live-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 6px var(--ok);
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse {
    50% { opacity: 0.4; }
  }
  .chname {
    flex: 1;
    min-width: 0;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted-toast {
    padding: 5px 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--danger) 20%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--danger) 60%, var(--line));
    color: var(--danger);
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
    animation: nudge 0.3s ease;
  }
  .audio-unblock {
    padding: 5px 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 18%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--line));
    color: var(--accent);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
    cursor: pointer;
    animation: nudge 0.3s ease;
  }
  .audio-unblock:hover {
    background: color-mix(in srgb, var(--accent) 28%, var(--panel));
  }
  @keyframes nudge {
    0% { transform: translateX(0); }
    30% { transform: translateX(-3px); }
    60% { transform: translateX(3px); }
    100% { transform: translateX(0); }
  }
  .peers {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .peer-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border-radius: 8px;
    min-width: 0;
  }
  .peer-row.speaking {
    background: color-mix(in srgb, var(--ok) 10%, transparent);
  }
  .peer-ava {
    position: relative;
    display: inline-flex;
    flex: none;
    border-radius: 50%;
  }
  .peer-row.speaking .peer-ava {
    box-shadow: 0 0 0 2px var(--ok);
    border-radius: 50%;
  }
  .peer-name {
    flex: 1;
    min-width: 0;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qdot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .vol {
    flex: none;
    width: 52px;
    height: 4px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .mutebadge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    font-size: 0.55rem;
  }
  .btns {
    display: flex;
    gap: 5px;
    min-width: 0;
  }
  /* Five glyph buttons share a ~175px row. A flex item's default
     min-width is its content, and an emoji glyph plus the button's own
     6px side padding is wider than a fifth of the row on Windows, so the
     row overflowed and the soundboard button was clipped at the rail's
     edge (Josh, Sep 2026). Let them shrink evenly instead. */
  .icon {
    flex: 1 1 0;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    height: 28px;
    display: grid;
    place-items: center;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 0.85rem;
    cursor: pointer;
    line-height: 1;
  }
  .icon:hover {
    color: var(--ink);
    border-color: var(--accent);
  }
  .icon.off {
    background: color-mix(in srgb, var(--danger) 18%, var(--panel));
    border-color: color-mix(in srgb, var(--danger) 55%, var(--line));
    color: var(--danger);
  }
  .icon.live {
    background: color-mix(in srgb, var(--ok) 20%, var(--panel));
    border-color: color-mix(in srgb, var(--ok) 60%, var(--line));
  }
  .icon.leave {
    flex: none;
    width: 26px;
    height: 22px;
    font-size: 0.7rem;
  }
  .icon.leave:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  /* (Device pickers, noise suppression, and PTT moved to Settings → Voice.) */
</style>
