<script lang="ts">
  import type { Channel } from "../lib/api";
  import {
    chat,
    selectChannel,
    createChannel,
    canIManage,
    canICreate,
    reorderSiblings,
    manageChannel,
  } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import { voice, joinVoice, watchStream } from "../lib/voice.svelte";
  import { openProfile } from "../lib/nav.svelte";
  import Avatar from "./Avatar.svelte";
  import PageIcon from "./PageIcon.svelte";
  import { pages, currentPage } from "../lib/pages.svelte";
  import { ui } from "../lib/chat.svelte";

  /** Click a 🖥️ badge → watch that stream (joining the room first if I'm
   *  not in it — you can only receive a room's tracks from inside it). */
  async function watchFromSidebar(channelId: number, userId: number): Promise<void> {
    if (voice.channelId !== channelId) await joinVoice(channelId);
    watchStream(userId);
  }

  let adding = $state(false);
  let newName = $state("");
  let creating = false; // a held Enter repeats keydown — one create at a time
  let createError = $state<string | null>(null);
  let newKind = $state<"text" | "voice">("text");
  const onlineCount = $derived(chat.online.length);
  const isAdmin = $derived(!!session.user?.isAdmin);

  const byPos = (a: Channel, b: Channel) => a.position - b.position || a.id - b.id;
  // EVERY list here is scoped to the page you are in — a page owns its
  // channels, and channels from other pages must never bleed into its rail.
  const mine = $derived(chat.channels.filter((c) => c.pageId === pages.currentId));
  const page = $derived(currentPage());
  const tops = $derived(mine.filter((c) => c.parentId == null && c.kind !== "voice").sort(byPos));
  const childrenOf = (id: number) => mine.filter((c) => c.parentId === id && c.kind !== "voice").sort(byPos);
  const voiceChannels = $derived(mine.filter((c) => c.kind === "voice").sort(byPos));

  function occupants(channelId: number) {
    return (voice.presence[channelId] ?? [])
      .map((id) => chat.members.find((m) => m.id === id))
      .filter((m) => !!m);
  }

  async function create() {
    if (!newName.trim()) {
      adding = false;
      return;
    }
    if (creating) return;
    creating = true;
    try {
      await createChannel(newName, undefined, newKind, pages.currentId);
      newName = "";
      newKind = "text";
      adding = false;
      createError = null;
    } catch (e) {
      createError = e instanceof Error && e.message ? e.message : "Couldn't create that channel.";
    } finally {
      creating = false;
    }
  }

  // ---- admin reordering within a sibling group ----
  function siblingsOf(c: Channel): Channel[] {
    return mine.filter((x) => x.parentId === c.parentId).sort(byPos);
  }
  function indexIn(c: Channel): { i: number; len: number } {
    const sibs = siblingsOf(c);
    return { i: sibs.findIndex((x) => x.id === c.id), len: sibs.length };
  }
  function move(c: Channel, dir: "up" | "down") {
    const sibs = siblingsOf(c);
    const i = sibs.findIndex((x) => x.id === c.id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    const ids = sibs.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorderSiblings(ids);
  }
</script>

<aside>
  <!-- WHICH PAGE AM I IN. The icon opens the page's settings (Josh: "you can
       change by clicking on the icon of the page"); the name goes back to
       the page list. -->
  {#if page}
    <div class="pagebar">
      <button class="picon" onclick={() => (ui.pageSettingsId = page.id)} title="Page settings">
        <PageIcon {page} size={34} />
      </button>
      <button class="pname" onclick={() => (pages.browsing = true)} title="All pages">
        <span class="nm">{page.name}</span>
        <span class="swap">Pages ▾</span>
      </button>
    </div>
  {/if}
  <div class="top">
    <strong>Channels</strong>
    <span class="online" class:live={chat.connected} title={chat.connected ? "Connected" : "Reconnecting…"}>
      {onlineCount} online
    </span>
    {#if canICreate(pages.currentId)}
      <button class="add" onclick={() => (adding = !adding)} title="New channel">+</button>
    {/if}
  </div>

  {#if adding}
    <div class="new-row">
      <button
        class="kind-toggle"
        title={newKind === "text" ? "Text channel — click for voice" : "Voice channel — click for text"}
        onclick={() => (newKind = newKind === "text" ? "voice" : "text")}
      >{newKind === "text" ? "#" : "🔊"}</button>
      <input
        class="new"
        placeholder={newKind === "text" ? "channel-name" : "voice-channel-name"}
        bind:value={newName}
        onkeydown={(e) => e.key === "Enter" && create()}
      />
    </div>
    {#if createError}<p class="create-err">{createError}</p>{/if}
  {/if}

  <nav>
    {#each tops as c (c.id)}
      {@const meta = indexIn(c)}
      <div class="chan-row">
        <button
          class="chan"
          class:active={c.id === chat.selectedId}
          class:unread={!!chat.unread[c.id]}
          onclick={() => selectChannel(c.id)}
        >
          <span class="glyph">{c.locked ? "🔒" : "#"}</span><span class="cname">{c.name}</span>
          {#if chat.unread[c.id]}
            <span class="pip">{chat.unread[c.id] > 99 ? "99+" : chat.unread[c.id]}</span>
          {/if}
        </button>
        <span class="controls">
          {#if isAdmin}
            <button class="ctl" title="Move up" disabled={meta.i <= 0} onclick={() => move(c, "up")}>▲</button>
            <button class="ctl" title="Move down" disabled={meta.i >= meta.len - 1} onclick={() => move(c, "down")}>▼</button>
          {/if}
          {#if canIManage(c)}
            <button class="ctl" title="Channel settings" onclick={() => manageChannel(c.id)}>⚙</button>
          {/if}
        </span>
      </div>

      {#each childrenOf(c.id) as sc (sc.id)}
        {@const sm = indexIn(sc)}
        <div class="chan-row child">
          <button
            class="chan"
            class:active={sc.id === chat.selectedId}
            class:unread={!!chat.unread[sc.id]}
            onclick={() => selectChannel(sc.id)}
          >
            <span class="glyph">{sc.locked ? "🔒" : "↳"}</span><span class="cname">{sc.name}</span>
            {#if chat.unread[sc.id]}
              <span class="pip">{chat.unread[sc.id] > 99 ? "99+" : chat.unread[sc.id]}</span>
            {/if}
          </button>
          <span class="controls">
            {#if isAdmin}
              <button class="ctl" title="Move up" disabled={sm.i <= 0} onclick={() => move(sc, "up")}>▲</button>
              <button class="ctl" title="Move down" disabled={sm.i >= sm.len - 1} onclick={() => move(sc, "down")}>▼</button>
            {/if}
            {#if canIManage(sc)}
              <button class="ctl" title="Channel settings" onclick={() => manageChannel(sc.id)}>⚙</button>
            {/if}
          </span>
        </div>
      {/each}
    {/each}

    {#if voice.enabled && voiceChannels.length > 0}
      <div class="voice-label">Voice</div>
      {#each voiceChannels as vc (vc.id)}
        {@const inHere = voice.channelId === vc.id}
        <div class="chan-row">
          <button
            class="chan voice"
            class:active={inHere}
            disabled={voice.connecting}
            title={inHere ? "You're in this channel" : `Join ${vc.name}`}
            onclick={() => joinVoice(vc.id)}
          >
            <span class="glyph">{vc.locked ? "🔒" : "🔊"}</span><span class="cname">{vc.name}</span>
          </button>
          <span class="controls">
            {#if canIManage(vc)}
              <button class="ctl" title="Channel settings" onclick={() => manageChannel(vc.id)}>⚙</button>
            {/if}
          </span>
        </div>
        {#if occupants(vc.id).length > 0}
          <div class="occupants">
            {#each occupants(vc.id) as m (m!.id)}
              <span class="occ" class:me={m!.id === session.user?.id}>
                <button class="occ-who" title="View profile" onclick={() => openProfile(m!.id)}>
                  <Avatar name={m!.displayName} id={m!.id} avatar={m!.avatar} size={18} border={m!.cosmetics?.border} />
                  <span class="occ-name">{m!.displayName}</span>
                </button>
                {#if voice.media[m!.id]?.screen && m!.id !== session.user?.id}
                  <!-- Discord-style: the stream icon itself is the way in. -->
                  <button
                    class="occ-media occ-watch"
                    title="Watch {m!.displayName}'s stream ({voice.viewers[m!.id]?.length ?? 0} watching)"
                    onclick={() => void watchFromSidebar(vc.id, m!.id)}
                  >🖥️{#if (voice.viewers[m!.id]?.length ?? 0) > 0}<span class="occ-eye">{voice.viewers[m!.id]?.length}</span>{/if}</button>
                {:else if voice.media[m!.id]?.screen}
                  <span class="occ-media" title="Sharing their screen">🖥️</span>
                {/if}
                {#if voice.media[m!.id]?.cam}<span class="occ-media" title="Camera on">🎥</span>{/if}
              </span>
            {/each}
          </div>
        {/if}
      {/each}
      {#if voice.error}<div class="voice-err">{voice.error}</div>{/if}
    {/if}
  </nav>

</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-right: 1px solid var(--line);
    min-height: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.85rem 0.9rem 0.6rem;
    border-bottom: 1px solid var(--line);
    margin-bottom: 0.35rem;
  }
  .top strong {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--ink-soft);
  }
  .pagebar {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.6rem 0.7rem 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .picon {
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    line-height: 0;
    border-radius: 10px;
  }
  .picon:hover { outline: 2px solid var(--accent); outline-offset: 1px; }
  .pname {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.05rem;
    padding: 0.15rem 0.3rem;
    border: none;
    background: none;
    color: var(--ink);
    cursor: pointer;
    border-radius: 7px;
    text-align: left;
  }
  .pname:hover { background: var(--hover, rgba(255, 255, 255, 0.05)); }
  .pname .nm {
    font-weight: 650;
    font-size: 0.95rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pname .swap { font-size: 0.7rem; color: var(--ink-soft); letter-spacing: 0.04em; }
  .online {
    flex: 1;
    font-size: 0.7rem;
    color: var(--ink-dim);
    /* Wide-lettered themes squeezed this into a two-line "4 / online" wrap. */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .online.live {
    color: var(--accent);
  }
  .add {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    border-radius: 6px;
    padding: 0 0.3rem;
  }
  .add:hover {
    color: var(--ink);
    background: var(--panel-2);
  }
  .new-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0.7rem 0.4rem;
  }
  .kind-toggle {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 7px;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .kind-toggle:hover {
    border-color: var(--accent);
  }
  .new {
    flex: 1;
    min-width: 0;
    padding: 0.4rem 0.55rem;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 7px;
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
  }
  .new:focus {
    outline: none;
    border-color: var(--accent);
  }
  nav {
    flex: 1;
    overflow-y: auto;
    padding: 0 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .chan-row {
    position: relative;
    display: flex;
    align-items: center;
  }
  .chan-row.child {
    padding-left: 0.85rem;
  }
  .chan {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.5rem;
    background: none;
    border: none;
    border-radius: 7px;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.92rem;
    text-align: left;
    cursor: pointer;
  }
  .chan:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .chan.active {
    background: var(--panel-2);
    color: var(--ink);
    font-weight: 600;
  }
  .chan.active::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 22%;
    bottom: 22%;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }
  .glyph {
    color: var(--ink-dim);
    font-size: 0.85rem;
    width: 1rem;
    text-align: center;
    flex: none;
  }
  .cname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chan.unread {
    color: var(--ink);
    font-weight: 700;
  }
  .pip {
    margin-left: auto;
    flex: none;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.66rem;
    font-weight: 700;
    line-height: 1;
  }
  .controls {
    position: absolute;
    right: 0.3rem;
    display: flex;
    gap: 1px;
    padding-left: 0.4rem;
    background: linear-gradient(90deg, transparent, var(--panel-2) 30%);
    opacity: 0;
    transition: opacity 0.1s ease;
  }
  .chan-row:hover .controls {
    opacity: 1;
  }
  /* Touch has no hover: invisible-but-tappable controls were a fat-finger
     trap on the channel drawer (the message-pill rule, applied here). */
  @media (hover: none) {
    .controls {
      opacity: 1;
    }
  }
  .ctl {
    background: none;
    border: none;
    color: var(--ink-dim);
    cursor: pointer;
    font-size: 0.72rem;
    line-height: 1;
    padding: 0.2rem 0.25rem;
    border-radius: 4px;
  }
  .ctl:hover:not(:disabled) {
    color: var(--ink);
    background: var(--panel);
  }
  .ctl:disabled {
    opacity: 0.25;
    cursor: default;
  }

  /* ---- Voice section ---- */
  .voice-label {
    margin: 0.9rem 0.4rem 0.25rem;
    padding-top: 0.7rem;
    border-top: 1px solid var(--line);
    font-size: 0.66rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--ink-dim);
  }
  .chan.voice:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .occupants {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px 0 4px 1.9rem;
  }
  .occ {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .occ-name {
    font-size: 0.76rem;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .occ.me .occ-name {
    color: var(--ink);
    font-weight: 600;
  }
  .occ-media {
    flex: none;
    font-size: 0.7rem;
    line-height: 1;
  }
  /* The avatar+name is a profile link; keep it looking like the old row. */
  .occ-who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .occ-who:hover .occ-name {
    color: var(--ink);
    text-decoration: underline;
  }
  /* A live stream badge is a button: click = watch. */
  button.occ-watch {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    border-radius: 999px;
    padding: 1px 6px;
    cursor: pointer;
  }
  button.occ-watch:hover {
    border-color: var(--accent);
  }
  .occ-eye {
    font-size: 0.64rem;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .voice-err {
    margin: 0.3rem 0.6rem;
    font-size: 0.74rem;
    color: var(--danger);
  }

  /* PHONE MODE: the drawer is the whole channel list — thumb-sized rows. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .pagebar {
      padding: 0.7rem 0.8rem 0.6rem;
    }
    .pname .nm {
      font-size: 1.02rem;
    }
    .top {
      padding: 0.8rem 0.9rem 0.6rem;
    }
    .add {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      font-size: 1.3rem;
    }
    .chan {
      padding: 0.6rem 0.6rem;
      font-size: 1rem;
      border-radius: 9px;
    }
    .chan-row.child {
      padding-left: 1rem;
    }
    .ctl {
      padding: 0.45rem 0.35rem;
      font-size: 0.8rem;
    }
    .occ-name {
      font-size: 0.84rem;
    }
    /* A tap must not leave a hover ghost behind the finger. */
    .chan:hover:not(.active) {
      background: none;
      color: var(--ink-soft);
    }
    .chan:active {
      background: var(--panel-2);
    }
  }
  .create-err {
    margin: 2px 12px 6px;
    font-size: 0.75rem;
    color: var(--danger, #e06060);
  }
</style>
