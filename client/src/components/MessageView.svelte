<script module lang="ts">
  /** Where each channel was last left, keyed by channel id.
   *
   *  MODULE scope on purpose: this component is torn down and rebuilt whenever
   *  you leave Chat for the casino, the Admin Panel or a Page and come back, so
   *  an instance-level Map forgot every position the moment you looked at
   *  anything else. */
  const memo = new Map<number, { top: number; bottom: boolean }>();
</script>

<script lang="ts">
  import { tick } from "svelte";
  import { chat, ui, selectedChannel, canIManage, manageChannel, openDrawer, loadOlder } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import MessageItem from "./MessageItem.svelte";
  import Composer from "./Composer.svelte";
  import SearchPanel from "./SearchPanel.svelte";
  import Avatar from "./Avatar.svelte";
  import { prefs } from "../lib/prefs.svelte";

  // READ RECEIPTS: who has seen the newest message (everyone whose cursor
  // reaches it, minus its author and me). Six faces, then a count.
  const seenBy = $derived.by(() => {
    if (!prefs.readReceipts) return [];
    const last = chat.messages[chat.messages.length - 1];
    if (!last) return [];
    const ids = Object.entries(chat.readers)
      .filter(([uid, cur]) => cur >= last.id && Number(uid) !== last.userId)
      .map(([uid]) => Number(uid));
    return ids
      .map((id) => chat.members.find((u) => u.id === id))
      .filter((u): u is NonNullable<typeof u> => !!u && !u.isBot);
  });

  const ch = $derived(selectedChannel());
  let scroller = $state<HTMLDivElement | null>(null);

  // Keep the view pinned to the newest message — but only when the reader is
  // already near the bottom (or the newest message is their own). Keying on
  // length alone yanked readers who had scrolled up.
  //
  // On a channel SWITCH we now do what Discord does (Josh): go back to where
  // you left that channel. Every channel remembers its own offset, plus
  // whether you were sitting at the bottom — if you were, you land on the
  // newest message instead of a stale pixel offset, which is what "at the
  // bottom" actually means once new messages have arrived.
  let lastChannel: number | null = null;
  let atBottom = $state(true);
  const BOTTOM_SLACK = 60; // px — "at the bottom" for restore purposes
  /** The channel whose offset we still owe the reader. Held until that
   *  channel's history actually exists to scroll through. */
  let restoreFor: number | null = null;
  /** Did the pane have content last pass? A drop to zero means a refetch. */
  let hadMessages = false;

  function readBottom(el: HTMLDivElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
  }
  /** The furthest down this element can actually go. Restoring a remembered
   *  offset without clamping lands short whenever the pane got shorter. */
  const maxTop = (el: HTMLDivElement): number => Math.max(0, el.scrollHeight - el.clientHeight);

  function onScroll(): void {
    const el = scroller;
    if (!el) return;
    atBottom = readBottom(el);
    if (chat.selectedId !== null) memo.set(chat.selectedId, { top: el.scrollTop, bottom: atBottom });
    if (el.scrollTop < OLDER_AT && restoreFor === null) void pageOlder();
  }

  // OLDER HISTORY: near the top, fetch the page before the first message and
  // put it above without moving what the reader is looking at — the content
  // grows upward by exactly what was added, so the offset grows with it.
  const OLDER_AT = 240; // px from the top
  let prepending = false;
  /** The first message row showing at the top of the pane. */
  function topRow(el: HTMLDivElement): HTMLElement | null {
    const edge = el.getBoundingClientRect().top;
    for (const r of el.querySelectorAll<HTMLElement>(".row")) if (r.getBoundingClientRect().bottom > edge + 1) return r;
    return null;
  }
  async function pageOlder(): Promise<void> {
    const el = scroller;
    if (!el || prepending || chat.olderDone || chat.loadingOlder || !chat.messages.length) return;
    const channel = chat.selectedId;
    // Anchor on the row the reader is looking at (keyed rows keep their DOM
    // node), so nothing above it — a day divider moving, the header line —
    // can nudge the view.
    const anchor = topRow(el);
    const offset = anchor ? anchor.getBoundingClientRect().top : 0;
    const height = el.scrollHeight;
    const top = el.scrollTop;
    prepending = true;
    try {
      const added = await loadOlder();
      if (!added || chat.selectedId !== channel || scroller !== el) return;
      await tick();
      const settle = (): void => {
        el.scrollTop = anchor?.isConnected
          ? el.scrollTop + (anchor.getBoundingClientRect().top - offset)
          : top + (el.scrollHeight - height);
      };
      settle();
      // …and once more after the next layout: rows above the anchor can
      // settle a frame late (the day divider re-homing, fonts in new rows).
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (scroller === el) settle();
      atBottom = readBottom(el);
      if (channel !== null) memo.set(channel, { top: el.scrollTop, bottom: atBottom });
    } finally {
      prepending = false;
    }
  }

  function jumpToNewest(): void {
    const el = scroller;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    atBottom = true;
    if (chat.selectedId !== null) memo.set(chat.selectedId, { top: el.scrollHeight, bottom: true });
  }

  $effect(() => {
    chat.messages.length;
    const channel = chat.selectedId;
    if (!scroller) return;
    const el = scroller;
    if (channel !== lastChannel) {
      lastChannel = channel;
      // Owed, not done. selectChannel() empties chat.messages BEFORE it awaits
      // the history fetch, so at this instant the pane is blank — restoring an
      // offset here scrolls a list with nothing in it to roughly zero, and when
      // the messages land the follow-the-newest branch below sees a full pane
      // scrolled to the top, decides the reader is nowhere near the bottom, and
      // leaves them there. That is the "every channel opens at the top" bug.
      // So remember the debt and pay it once there is something to scroll.
      restoreFor = channel;
    } else if (!chat.messages.length && hadMessages) {
      // The SAME channel just went empty: you clicked the one you were already
      // reading, and selectChannel is refetching it. Identical trap, different
      // trigger — and without this the follow-the-newest branch below reads the
      // blank pane as "near the bottom", slams you to the newest message and
      // overwrites the remembered offset with it.
      restoreFor = channel;
    }
    hadMessages = chat.messages.length > 0;
    // A page of older history landing above: pageOlder() keeps the place.
    if (prepending) return;
    if (restoreFor !== null && restoreFor === channel) {
      if (!chat.messages.length) return; // still empty — wait for the history
      const want = memo.get(channel);
      restoreFor = null;
      const apply = (): void => {
        if (!scroller || chat.selectedId !== channel) return;
        scroller.scrollTop = !want || want.bottom ? maxTop(scroller) : Math.min(want.top, maxTop(scroller));
        atBottom = readBottom(scroller);
      };
      // Once the list has laid out, and again shortly after: attachments and
      // avatars settle late, and each one that resolves pushes the content
      // taller under a reader who asked to be at the bottom.
      requestAnimationFrame(apply);
      setTimeout(apply, 140);
      return;
    }
    const last = chat.messages[chat.messages.length - 1];
    const mine = !!last && last.userId === session.user?.id;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 300;
    if (mine || nearBottom) {
      el.scrollTop = el.scrollHeight;
      atBottom = true;
      if (channel !== null) memo.set(channel, { top: el.scrollTop, bottom: true });
    }
  });

  // A ticking clock so stale typing indicators fade out.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const typers = $derived(
    chat.typing.filter((t) => now - t.at < 4000 && t.userId !== session.user?.id),
  );

  // Group a message under the previous one if it's the same author within 5 min.
  // A reply always starts a fresh block so its quoted context stays legible.
  function grouped(index: number): boolean {
    const prev = chat.messages[index - 1];
    const cur = chat.messages[index];
    return (
      !!prev &&
      !cur.replyTo &&
      prev.userId === cur.userId &&
      cur.createdAt - prev.createdAt < 5 * 60 * 1000
    );
  }

  // A dated divider whenever the calendar day changes between messages.
  function dayBreak(index: number): string | null {
    const cur = chat.messages[index];
    const prev = chat.messages[index - 1];
    const curDay = new Date(cur.createdAt).toDateString();
    if (prev && new Date(prev.createdAt).toDateString() === curDay) return null;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    if (curDay === today) return "Today";
    if (curDay === yesterday) return "Yesterday";
    return new Date(cur.createdAt).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
</script>

{#if !ch}
  <div class="empty">
    <button class="mnav lone" onclick={() => openDrawer("channels")} aria-label="Channels">☰ Channels</button>
    Select a channel to start chatting
  </div>
{:else}
  <div class="pane">
    <header>
      <button class="mnav" onclick={() => openDrawer("channels")} aria-label="Channels" title="Channels">☰</button>
      <!-- Name + topic in one block: inline on a desktop, stacked (topic as
           a truncated subline) on a phone, where the wrapping topic used to
           push the header to two ragged lines. -->
      <span class="title">
        <span class="chname"><span class="hash">{ch.locked ? "🔒" : "#"}</span><strong>{ch.name}</strong></span>
        {#if ch.topic}<span class="topic">{ch.topic}</span>{/if}
      </span>
      {#if canIManage(ch)}
        <button class="gear" title="Channel settings" onclick={() => manageChannel(ch.id)}>⚙</button>
      {/if}
      <button class="gear" title="Search messages" onclick={() => (ui.searchOpen = true)}>🔍</button>
      <button class="mnav right" onclick={() => openDrawer("members")} aria-label="Members" title="Members">👥</button>
    </header>

    {#if ui.searchOpen}
      <SearchPanel onClose={() => (ui.searchOpen = false)} />
    {/if}

    <div class="msgwrap">
      <div class="messages" bind:this={scroller} onscroll={onScroll}>
        {#if chat.messages.length}
          {#if chat.olderDone}
            <p class="history-top">The beginning of <strong>#{ch.name}</strong></p>
          {:else}
            <button class="history-top more" onclick={pageOlder} disabled={chat.loadingOlder}>
              {chat.loadingOlder ? "Loading older messages…" : "Load older messages"}
            </button>
          {/if}
        {/if}
        {#each chat.messages as m, i (m.id)}
          {@const day = dayBreak(i)}
          {#if day}
            <div class="day-sep"><span>{day}</span></div>
          {/if}
          <MessageItem message={m} grouped={day ? false : grouped(i)} />
        {/each}
        {#if chat.messages.length === 0}
          <p class="empty-msgs">No messages yet — say hello.</p>
        {/if}
        {#if seenBy.length}
          <div class="seen" title={"Seen by " + seenBy.map((u) => u.displayName).join(", ")}>
            <span class="seen-lbl">Seen by</span>
            {#each seenBy.slice(0, 6) as u (u.id)}
              <span class="seen-av"><Avatar name={u.displayName} id={u.id} avatar={u.avatar} size={16} /></span>
            {/each}
            {#if seenBy.length > 6}<span class="seen-more">+{seenBy.length - 6}</span>{/if}
          </div>
        {/if}
      </div>
      {#if !atBottom && chat.messages.length}
        <button class="jump" onclick={jumpToNewest} title="Jump to the newest message">
          ↓ <span>newest</span>
        </button>
      {/if}
    </div>

    <div class="typing">
      {#if typers.length}
        {typers.map((t) => t.username).join(", ")}
        {typers.length === 1 ? "is" : "are"} typing…
      {/if}
    </div>

    <Composer />
  </div>
{/if}

<style>
  .pane {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .empty {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--ink-dim);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  /* Phone-only drawer toggles (channels left, members right). */
  .mnav {
    display: none;
    background: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.95rem;
    line-height: 1;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
    align-self: center;
  }
  .mnav:active {
    background: var(--panel-2);
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
  }
  .chname {
    display: inline-flex;
    align-items: baseline;
    gap: 0.5rem;
    white-space: nowrap;
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    /* PHONE MODE: a proper app bar — 52px, plain icon buttons with thumb-
       sized targets, the channel name over its topic. */
    header {
      align-items: center;
      gap: 2px;
      min-height: 52px;
      padding: 0 6px 0 4px;
      background: var(--panel);
    }
    .mnav {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 10px;
      font-size: 1.3rem;
      color: var(--ink);
      -webkit-tap-highlight-color: transparent;
    }
    .mnav.right {
      margin-left: 0;
    }
    .mnav.lone {
      width: auto;
      padding: 0 14px;
      border: 1px solid var(--line);
      font-size: 1rem;
    }
    .title {
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
      padding: 0 4px;
    }
    .chname strong {
      font-size: 1.05rem;
    }
    .topic {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* The gear yields the right edge to the members button on phones.
       (header-scoped so it out-ranks the later .gear declaration) */
    header .gear {
      margin-left: 0;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      padding: 0;
      font-size: 1.1rem;
      -webkit-tap-highlight-color: transparent;
    }
    header .gear:hover {
      background: none;
    }
    header .gear:active,
    .mnav:active {
      background: var(--panel-2);
    }
    .empty {
      grid-auto-flow: row;
      align-content: center;
      gap: 12px;
    }
  }
  .hash {
    color: var(--ink-dim);
  }
  .topic {
    color: var(--ink-soft);
    font-size: 0.82rem;
  }
  .gear {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 0.95rem;
    cursor: pointer;
    padding: 0.15rem 0.3rem;
    border-radius: 6px;
    line-height: 1;
  }
  .gear:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  /* The scroller lives in a relative frame so the jump-to-newest pill can
     float over its bottom-right corner without riding the scroll. */
  .msgwrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .history-top {
    display: block;
    margin: 0.25rem auto 0.9rem;
    text-align: center;
    color: var(--ink-dim);
    font-size: 0.82rem;
  }
  .history-top.more {
    background: none;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.3rem 0.9rem;
    font: inherit;
    font-size: 0.82rem;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .history-top.more:hover:not(:disabled) {
    background: var(--panel-2);
    color: var(--ink);
  }
  .history-top.more:disabled {
    cursor: default;
    opacity: 0.7;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1rem;
  }
  .jump {
    position: absolute;
    right: 1rem;
    bottom: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.8rem;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }
  .jump:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .jump span {
    letter-spacing: 0.04em;
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    /* BELOW their base rules on purpose: both of these set a property the
       ordinary rule above also sets, at the same specificity, so up in the
       first phone block they lost on source order and never applied — the
       chat header and the message padding stayed at desktop sizes on a
       phone for a whole round. test_touch_floor.mjs fails on this now. */
    .topic {
      font-size: 0.74rem;
    }
    .messages {
      padding: 0.5rem 0.4rem;
    }
    /* Tighter on phones — the pill must not cover the last message's text. */
    .jump span {
      display: none;
    }
  }
  .empty-msgs {
    color: var(--ink-dim);
  }
  .day-sep {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0 0.5rem;
    color: var(--ink-dim);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .day-sep::before,
  .day-sep::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .day-sep span {
    flex: none;
  }
  /* READ RECEIPTS under the newest message: a quiet row of faces. */
  .seen {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    padding: 2px 1rem 6px;
    font-size: 0.68rem;
    color: var(--ink-dim);
  }
  .seen-lbl { margin-right: 3px; }
  .seen-av { display: inline-flex; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--bg); }
  .seen-more { margin-left: 2px; font-weight: 700; }
  .typing {
    height: 1.1rem;
    padding: 0 1rem;
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
</style>
