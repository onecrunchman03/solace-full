<script module lang="ts">
  /** Where each DM thread was last left, keyed by conversation id. MODULE
   *  scope, like MessageView's: this view is destroyed whenever you go and
   *  look at anything else, and an instance-level Map forgot every position
   *  the moment you did. */
  const memo = new Map<number, { top: number; bottom: boolean }>();
</script>

<script lang="ts">
  import { onMount, onDestroy, untrack, tick } from "svelte";
  import { ApiError, api } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";
  import {
    dm,
    loadConversations,
    openConversation,
    closeConversation,
    openDmWith,
    sendDm,
    cancelReplyDm,
    loadOlderDm,
  } from "../lib/dm.svelte";
  import { chat } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import { prefs } from "../lib/prefs.svelte";
  import { openProfile } from "../lib/nav.svelte";
  import { createAttachmentStager, pastedFiles, drafts } from "../lib/attach.svelte";
  import Avatar from "./Avatar.svelte";
  import { botKind, isRegular } from "../lib/bots";
  import { affinity, loadAffinity } from "../lib/affinity.svelte";
  import DmMessageItem from "./DmMessageItem.svelte";
  import EmojiPicker from "./EmojiPicker.svelte";
  import AttachTray from "./AttachTray.svelte";

  const onlineSet = $derived(new Set(chat.online));
  const openConv = $derived(dm.conversations.find((c) => c.id === dm.openId) ?? null);
  const candidates = $derived(chat.members.filter((m) => !m.disabled && m.id !== session.user?.id));
  const replyName = $derived(
    dm.replyingTo
      ? dm.replyingTo.senderId === session.user?.id
        ? "yourself"
        : (openConv?.otherUser.displayName ?? "them")
      : "",
  );

  let showPicker = $state(false);

  onMount(loadConversations);

  function preview(c: (typeof dm.conversations)[number]): string {
    if (!c.lastMessage) return "No messages yet";
    if (c.lastMessage.deletedAt) return "message deleted";
    const mine = c.lastMessage.senderId === session.user?.id;
    return (mine ? "You: " : "") + c.lastMessage.body;
  }
  function stamp(ms: number): string {
    const d = new Date(ms);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "numeric", day: "numeric" });
  }

  async function startWith(userId: number) {
    showPicker = false;
    await openDmWith(userId);
  }

  // WHAT THEY REMEMBER (migration 106): with one of the house's three, the
  // header offers the notes that character keeps about YOU, and a forget.
  // The bot rows' usernames are the character ids the route takes.
  let memOpen = $state(false);
  let memNotes = $state<string | null>(null);
  let memErr = $state("");
  async function toggleMemory(npc: string) {
    memOpen = !memOpen;
    memErr = "";
    if (!memOpen) return;
    memNotes = null;
    try {
      const { memories } = await api.npcMemory();
      memNotes = memories.find((m) => m.npc === npc)?.notes ?? "";
    } catch {
      memErr = "Couldn't load that just now.";
    }
  }
  async function forgetMemory(npc: string, name: string) {
    const okay = await ask({
      title: `Make ${name} forget?`,
      body: `${name} will forget everything noted from your conversations so far. Your messages stay where they are.`,
      confirm: "Forget",
      danger: true,
    });
    if (!okay) return;
    try {
      await api.forgetNpcMemory(npc);
      memNotes = "";
    } catch {
      memErr = "Couldn't do that just now.";
    }
  }
  // A different conversation closes the panel.
  $effect(() => {
    void dm.openId;
    memOpen = false;
  });
  // THE AFFINITY METER: where you stand with the one you're talking to.
  $effect(() => {
    if (openConv?.otherUser.isBot) void loadAffinity();
  });
  const standing = $derived(openConv?.otherUser.isBot && affinity.on ? affinity.byNpc[openConv.otherUser.username] ?? null : null);

  // "Sterling is writing…" while one of the house's three composes a reply.
  // The server re-sends the frame every 3s while it works, so a quiet 4.5s
  // means it stopped (a scripted fallback, or a dropped socket).
  let typingClock = $state(Date.now());
  const typingTimer = setInterval(() => (typingClock = Date.now()), 1000);
  onDestroy(() => clearInterval(typingTimer));
  const writing = $derived.by(() => {
    const t = dm.openId != null ? dm.typing[dm.openId] : undefined;
    return t && typingClock - t.at < 4500 ? t.name : null;
  });

  // Group consecutive same-sender messages within 5 minutes.
  // READ RECEIPTS: "Seen" under my newest message once the other side's
  // cursor reaches it (and only if both of us send receipts).
  const seenLast = $derived.by(() => {
    if (!prefs.readReceipts || !dm.openId) return false;
    const last = dm.messages[dm.messages.length - 1];
    if (!last || last.senderId !== session.user?.id) return false;
    const theirs = dm.theirRead[dm.openId];
    return typeof theirs === "number" && theirs >= last.id;
  });

  function grouped(i: number): boolean {
    const prev = dm.messages[i - 1];
    const cur = dm.messages[i];
    return !!prev && prev.senderId === cur.senderId && cur.createdAt - prev.createdAt < 5 * 60 * 1000;
  }

  // ---- composer ----
  let text = $state("");
  let error = $state<string | null>(null);
  let sending = false; // one POST at a time (the channel composer's rule)
  let picking = $state(false);
  let ta = $state<HTMLTextAreaElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  const stager = createAttachmentStager();

  // Drafts stay with their conversation (the channel composer's rule).
  let roomKey: string | null = null;
  $effect(() => {
    const key = dm.openId != null ? `d:${dm.openId}` : null;
    untrack(() => {
      if (key === roomKey) return;
      if (roomKey) { if (text.trim()) drafts.set(roomKey, text); else drafts.delete(roomKey); }
      stager.discard();
      text = key ? (drafts.get(key) ?? "") : "";
      error = null;
      roomKey = key;
    });
  });
  onDestroy(() => {
    if (roomKey) { if (text.trim()) drafts.set(roomKey, text); else drafts.delete(roomKey); }
    stager.discard();
  });

  // Pasted/dropped images stage in the tray — nothing auto-posts.
  function onPaste(e: ClipboardEvent) {
    const files = pastedFiles(e);
    if (files.length) {
      e.preventDefault();
      stager.addFiles(files);
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    stager.addFiles(e.dataTransfer?.files);
  }

  async function trySend() {
    const body = text.trim();
    const ids = stager.ids();
    // Busy FIRST (the composer rule): an image-only send mid-upload used to
    // hit the empty-check and silently do nothing.
    if (stager.busy) {
      error = "Hold on — still uploading.";
      return;
    }
    if (!body && !ids.length) return;
    if (sending) return;
    sending = true;
    const sentFrom = roomKey;
    try {
      await sendDm(body, ids);
      if (sentFrom) drafts.delete(sentFrom);
      if (roomKey === sentFrom) {
        text = "";
        error = null;
        stager.clear();
      }
    } catch (e) {
      error =
        e instanceof ApiError && e.code === "unowned_emoji"
          ? "You can only post emoji you own."
          : e instanceof ApiError && e.code === "rate_limited"
            ? "Easy — give the room a second to catch up."
            : "Couldn’t send that message.";
    } finally {
      sending = false;
    }
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void trySend();
    }
  }
  function insertEmoji(code: string) {
    picking = false;
    const token = `:${code}:`;
    const el = ta;
    if (el) {
      const s = el.selectionStart ?? text.length;
      const en = el.selectionEnd ?? text.length;
      text = text.slice(0, s) + token + text.slice(en);
      queueMicrotask(() => {
        el.focus();
        const pos = s + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      text += token;
    }
  }

  // Keep the thread pinned to the newest message — but only when the reader
  // is near the bottom (or the newest message is their own). Opening a thread
  // RESTORES where you left it, exactly like a channel (MessageView), with a
  // jump-to-newest pill whenever you're reading history.
  //
  // `memo` is module-scoped (see the top of the file) so leaving DMs for
  // another view and coming back doesn't forget every thread's position.
  let scroller = $state<HTMLDivElement | null>(null);
  let lastConv: number | null = null;
  let atBottom = $state(true);
  /** The thread whose offset we still owe the reader, held until its messages
   *  exist to scroll through. */
  let restoreFor: number | null = null;
  /** Did the pane have content last pass? A drop to zero means a refetch. */
  let hadMessages = false;
  const readBottom = (el: HTMLDivElement): boolean =>
    el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const maxTop = (el: HTMLDivElement): number => Math.max(0, el.scrollHeight - el.clientHeight);

  function onScroll(): void {
    const el = scroller;
    if (!el) return;
    atBottom = readBottom(el);
    if (dm.openId != null) memo.set(dm.openId, { top: el.scrollTop, bottom: atBottom });
    if (el.scrollTop < OLDER_AT && restoreFor == null) void pageOlder();
  }

  // OLDER HISTORY — the same as a channel's (MessageView.svelte): the page
  // goes above and the offset grows by exactly what it added.
  const OLDER_AT = 240;
  let prepending = false;
  /** The first message row showing at the top of the pane. */
  function topRow(el: HTMLDivElement): HTMLElement | null {
    const edge = el.getBoundingClientRect().top;
    for (const r of el.querySelectorAll<HTMLElement>(".row")) if (r.getBoundingClientRect().bottom > edge + 1) return r;
    return null;
  }
  async function pageOlder(): Promise<void> {
    const el = scroller;
    if (!el || prepending || dm.olderDone || dm.loadingOlder || !dm.messages.length) return;
    const conv = dm.openId;
    // Anchor on the row the reader is looking at (keyed rows keep their DOM
    // node), so nothing above it — a day divider moving, the header line —
    // can nudge the view.
    const anchor = topRow(el);
    const offset = anchor ? anchor.getBoundingClientRect().top : 0;
    const height = el.scrollHeight;
    const top = el.scrollTop;
    prepending = true;
    try {
      const added = await loadOlderDm();
      if (!added || dm.openId !== conv || scroller !== el) return;
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
      if (conv != null) memo.set(conv, { top: el.scrollTop, bottom: atBottom });
    } finally {
      prepending = false;
    }
  }

  function jumpToNewest(): void {
    const el = scroller;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    atBottom = true;
    if (dm.openId != null) memo.set(dm.openId, { top: el.scrollHeight, bottom: true });
  }

  $effect(() => {
    dm.messages.length;
    const conv = dm.openId;
    if (!scroller) return;
    const el = scroller;
    if (conv !== lastConv) {
      lastConv = conv;
      // Owed, not done — openConversation() empties dm.messages before it
      // awaits the fetch, so restoring here scrolls an empty pane. See the
      // long note in MessageView.svelte: this is the same bug, and it is why
      // every thread used to open at the top.
      restoreFor = conv;
    } else if (!dm.messages.length && hadMessages) {
      // Reopening the thread you were already reading refetches it, so the
      // pane blanks and the follow-the-newest branch below would read that as
      // "near the bottom" and throw away your place. Owe the restore again.
      restoreFor = conv;
    }
    hadMessages = dm.messages.length > 0;
    if (prepending) return; // pageOlder() keeps the place
    if (restoreFor != null && restoreFor === conv) {
      if (!dm.messages.length) return; // nothing to scroll through yet
      const want = memo.get(conv);
      restoreFor = null;
      const apply = (): void => {
        if (!scroller || dm.openId !== conv) return;
        scroller.scrollTop = !want || want.bottom ? maxTop(scroller) : Math.min(want.top, maxTop(scroller));
        atBottom = readBottom(scroller);
      };
      requestAnimationFrame(apply);
      setTimeout(apply, 140); // attachments settle late and push the bottom down
      return;
    }
    const last = dm.messages[dm.messages.length - 1];
    const mine = !!last && last.senderId === session.user?.id;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 300;
    if (mine || nearBottom) {
      el.scrollTop = el.scrollHeight;
      atBottom = true;
      if (conv != null) memo.set(conv, { top: el.scrollTop, bottom: true });
    }
  });

  // Leaving the DMs view closes the open thread — an open-but-invisible
  // conversation must not keep eating unread state (see dm.svelte.ts).
  onDestroy(closeConversation);
</script>

<div class="dm" class:has-open={dm.openId != null}>
  <aside class="list">
    <div class="list-head">
      <strong>Direct Messages</strong>
      <button class="new" title="New message" onclick={() => (showPicker = !showPicker)}>+</button>
    </div>

    {#if showPicker}
      <div class="picker">
        <div class="picker-title">Start a conversation</div>
        {#each candidates as m (m.id)}
          <button class="pick" onclick={() => startWith(m.id)}>
            <Avatar name={m.displayName} id={m.id} avatar={m.avatar} bot={botKind(m)} size={24} />
            <span class="pname">{m.displayName}</span>
          </button>
        {/each}
        {#if candidates.length === 0}<div class="empty">No one else here yet.</div>{/if}
      </div>
    {/if}

    <div class="convos">
      {#each dm.conversations as c (c.id)}
        <button class="convo" class:active={c.id === dm.openId} onclick={() => openConversation(c.id)}>
          <span class="ava">
            <Avatar name={c.otherUser.displayName} id={c.otherUser.id} avatar={c.otherUser.avatar} bot={botKind(c.otherUser)} size={38} />
            {#if onlineSet.has(c.otherUser.id)}<span class="dot"></span>{/if}
          </span>
          <span class="mid">
            <span class="top">
              <span class="cname">{c.otherUser.displayName}</span>
              {#if c.lastMessage}<span class="when">{stamp(c.lastMessage.createdAt)}</span>{/if}
            </span>
            <span class="prev">{preview(c)}</span>
          </span>
          {#if c.unread > 0}<span class="unread">{c.unread > 99 ? "99+" : c.unread}</span>{/if}
        </button>
      {/each}
      {#if dm.conversations.length === 0}
        <div class="empty pad">No conversations yet. Hit <b>+</b> to message someone.</div>
      {/if}
    </div>
  </aside>

  <section class="thread">
    {#if !openConv}
      <div class="blank">Select a conversation, or start a new one with <b>+</b>.</div>
    {:else}
      <header>
        <button class="mback" onclick={closeConversation} aria-label="Back to conversations">←</button>
        <button class="peer" onclick={() => openProfile(openConv.otherUser.id)}>
          <Avatar name={openConv.otherUser.displayName} id={openConv.otherUser.id} avatar={openConv.otherUser.avatar} bot={botKind(openConv.otherUser)} size={30} />
          <span class="peer-name">{openConv.otherUser.displayName}</span>
          <span class="peer-status">{openConv.otherUser.isBot ? (isRegular(botKind(openConv.otherUser)) ? "on the casino floor" : "the house") : onlineSet.has(openConv.otherUser.id) ? "online" : "offline"}</span>
        </button>
        {#if standing}
          <button class="standing" class:on={memOpen} onclick={() => toggleMemory(openConv.otherUser.username)}
            title={`${standing.tierName} — ${standing.points}/100${standing.next !== null ? `, ${standing.next} to the next` : ""}`}>
            <span class="st-name">{standing.tierName}</span>
            <span class="st-pips" aria-hidden="true">
              {#each [0, 1, 2, 3] as i (i)}<span class="pip" class:lit={standing.tier >= i}></span>{/each}
            </span>
          </button>
        {/if}
        {#if openConv.otherUser.isBot && affinity.on}
          <button class="memory-btn" class:on={memOpen} onclick={() => toggleMemory(openConv.otherUser.username)}>
            <span class="mem-full">What {openConv.otherUser.displayName} remembers</span><span class="mem-short">Memory</span>
          </button>
        {/if}
      </header>
      {#if memOpen && openConv.otherUser.isBot && affinity.on}
        <div class="memory">
          {#if standing}
            <div class="st-detail">
              <div class="st-row">
                <b>{standing.tierName}</b>
                <span class="st-bar"><span class="st-fill" style={`width: ${standing.points}%`}></span></span>
                <span class="st-num">{standing.points}/100</span>
              </div>
              <p class="mem-muted">
                {standing.next !== null ? `${standing.next} more to the next tier. ` : "As close as they get. "}{standing.earns.length ? `Earned by ${standing.earns.join(", ")}.` : "Set by the admin's lever (the house has no meter of its own)."}
              </p>
            </div>
          {/if}
          {#if memErr}
            <p class="mem-muted">{memErr}</p>
          {:else if memNotes === null}
            <p class="mem-muted">Checking…</p>
          {:else if !memNotes}
            <p class="mem-muted">Nothing yet. Notes are kept from your private conversations here, a few minutes after one goes quiet — never from anyone else's.</p>
          {:else}
            <ul>
              {#each memNotes.split("\n").filter((l) => l.trim()) as line, i (i)}
                <li>{line.replace(/^-\s*/, "")}</li>
              {/each}
            </ul>
            <button class="mem-forget" onclick={() => forgetMemory(openConv.otherUser.username, openConv.otherUser.displayName)}>Forget all of this</button>
          {/if}
        </div>
      {/if}

      <div class="msgwrap">
        <div class="messages" bind:this={scroller} onscroll={onScroll}>
          {#if dm.loading}
            <p class="muted">Loading…</p>
          {:else}
            {#if dm.messages.length}
              {#if dm.olderDone}
                <p class="history-top">The start of your messages with <strong>{openConv.otherUser.displayName}</strong></p>
              {:else}
                <button class="history-top more" onclick={pageOlder} disabled={dm.loadingOlder}>
                  {dm.loadingOlder ? "Loading older messages…" : "Load older messages"}
                </button>
              {/if}
            {/if}
            {#each dm.messages as m, i (m.id)}
              <DmMessageItem message={m} otherUser={openConv.otherUser} grouped={grouped(i)} />
            {/each}
            {#if dm.messages.length === 0}
              <p class="muted">No messages yet — say hi to {openConv.otherUser.displayName}.</p>
            {/if}
            {#if seenLast && !writing}
              <div class="seen">Seen</div>
            {/if}
            {#if writing}
              <div class="writing">{writing} is writing…</div>
            {/if}
          {/if}
        </div>
        {#if !atBottom && dm.messages.length}
          <button class="jump" onclick={jumpToNewest} title="Jump to the newest message">
            ↓ <span>newest</span>
          </button>
        {/if}
      </div>

      <div class="composer" ondragover={(e) => e.preventDefault()} ondrop={onDrop} role="group">
        {#if dm.replyingTo}
          <div class="reply-bar">
            <span class="rb-text">Replying to <b>{replyName}</b></span>
            <button class="rb-x" onclick={cancelReplyDm} title="Cancel reply">✕</button>
          </div>
        {/if}
        {#if error}<div class="err">{error}</div>{/if}
        <AttachTray {stager} />
        <div class="input-row">
          <div class="emoji-anchor">
            <button class="emoji-btn" title="Your emoji" onclick={() => (picking = !picking)}>😀</button>
            {#if picking}
              <EmojiPicker placement="up" align="left" onpick={insertEmoji} onclose={() => (picking = false)} />
            {/if}
          </div>
          <button class="emoji-btn" title="Attach an image or text file" onclick={() => fileInput?.click()}>📎</button>
          <input
            bind:this={fileInput}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,.txt,.md,.log,.csv"
            style="display:none"
            onchange={(e) => {
              stager.addFiles(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />
          <textarea
            bind:this={ta}
            rows="1"
            placeholder={`Message ${openConv.otherUser.displayName}`}
            bind:value={text}
            onkeydown={onKeydown}
            onpaste={onPaste}
          ></textarea>
          <!-- Touch has no Enter-to-send: a pasted image with no text needs
               a button (Josh, Aug 2026). Shows whenever there's content. -->
          {#if text.trim() || stager.items.some((it) => !it.error)}
            <button class="emoji-btn send" title="Send" onclick={() => void trySend()}>➤</button>
          {/if}
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .dm {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: 100%;
    min-height: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-right: 1px solid var(--line);
    min-height: 0;
    /* A grid item's min-width defaults to its content: on phones (a 1fr
       column) a long nowrap preview widened the whole list past the screen
       and pushed the + button and the time off the right edge. */
    min-width: 0;
  }
  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 0.9rem;
    border-bottom: 1px solid var(--line);
  }
  .new {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
  }
  .new:hover {
    color: var(--accent);
  }
  .picker {
    border-bottom: 1px solid var(--line);
    padding: 0.5rem;
    max-height: 40%;
    overflow-y: auto;
  }
  .picker-title {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-dim);
    padding: 0.2rem 0.4rem 0.4rem;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.35rem 0.4rem;
    background: none;
    border: none;
    border-radius: 7px;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pick:hover {
    background: var(--panel-2);
  }
  .pname {
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .convos {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .convo {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.5rem;
    background: none;
    border: none;
    border-radius: 9px;
    text-align: left;
    cursor: pointer;
  }
  .convo:hover {
    background: var(--panel-2);
  }
  .convo.active {
    background: var(--panel-2);
  }
  .ava {
    position: relative;
    flex: none;
  }
  .dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--ok);
    border: 2px solid var(--panel);
  }
  .mid {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .cname {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    flex: none;
    font-size: 0.68rem;
    color: var(--ink-dim);
  }
  .prev {
    font-size: 0.8rem;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .unread {
    flex: none;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.68rem;
    font-weight: 700;
  }
  .empty {
    color: var(--ink-dim);
    font-size: 0.82rem;
  }
  .empty.pad {
    padding: 1rem;
    text-align: center;
    line-height: 1.5;
  }
  .thread {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .blank {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--ink-dim);
    padding: 1rem;
    text-align: center;
  }
  header {
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .standing {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.3rem 0.55rem;
    font-size: 0.74rem;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .standing:hover,
  .standing.on {
    border-color: var(--accent);
    color: var(--ink);
  }
  .st-pips {
    display: inline-flex;
    gap: 2px;
  }
  .pip {
    width: 6px;
    height: 10px;
    border-radius: 2px;
    background: var(--line);
  }
  .pip.lit {
    background: var(--accent);
  }
  .standing + .memory-btn {
    margin-left: 0.4rem;
  }
  .st-detail {
    margin-bottom: 0.6rem;
  }
  .st-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .st-bar {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .st-fill {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .st-num {
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
    font-size: 0.78rem;
  }
  .memory-btn {
    margin-left: auto;
    background: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .mem-short {
    display: none;
  }
  .memory-btn:hover,
  .memory-btn.on {
    border-color: var(--accent);
    color: var(--ink);
  }
  .memory {
    padding: 0.6rem 1rem 0.8rem;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
    font-size: 0.85rem;
  }
  .memory ul {
    margin: 0 0 0.6rem;
    padding-left: 1.1rem;
    color: var(--ink);
  }
  .memory li {
    margin: 0.15rem 0;
  }
  .mem-muted {
    margin: 0;
    color: var(--ink-dim);
  }
  .mem-forget {
    background: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .mem-forget:hover {
    border-color: var(--danger, #c0392b);
    color: var(--ink);
  }
  .peer {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.2rem;
    border-radius: 8px;
  }
  .peer:hover {
    background: var(--panel-2);
  }
  .peer-name {
    font-weight: 700;
    color: var(--ink);
  }
  .peer-status {
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  .msgwrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .seen {
    text-align: right;
    padding: 0 1rem 6px;
    font-size: 0.68rem;
    color: var(--ink-dim);
  }
  .writing {
    padding: 2px 0 6px;
    font-size: 0.78rem;
    font-style: italic;
    color: var(--ink-dim);
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1rem;
    min-height: 0;
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
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .jump span {
      display: none;
    }
  }
  .muted {
    color: var(--ink-dim);
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
  .composer {
    padding: 0.5rem 1rem 1rem;
  }
  .reply-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0.7rem;
    margin-bottom: 0.4rem;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .rb-text b {
    color: var(--ink);
  }
  .rb-x {
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
  }
  .rb-x:hover {
    color: var(--ink);
  }
  .err {
    padding: 0.3rem 0.7rem;
    margin-bottom: 0.4rem;
    color: var(--danger);
    font-size: 0.8rem;
  }
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }
  .emoji-anchor {
    position: relative;
    flex: none;
  }
  .emoji-btn {
    height: 40px;
    width: 40px;
    display: grid;
    place-items: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 1.2rem;
    cursor: pointer;
  }
  .emoji-btn:hover {
    border-color: var(--accent);
  }
  .emoji-btn.send {
    color: var(--accent);
    font-size: 1rem;
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  }
  textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    padding: 0.6rem 0.75rem;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink);
    font: inherit;
    font-family: var(--chat-font, inherit);
    line-height: 1.4;
  }
  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  /* A long display name must truncate in the one-row field, not wrap+clip. */
  textarea::placeholder {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Back-to-list button: phones only (the panes share the screen there). */
  .mback {
    display: none;
    background: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink-soft);
    font: inherit;
    font-size: 1rem;
    line-height: 1;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    /* The phone header has room for the name OR the long label, not both. */
    .mem-full {
      display: none;
    }
    .mem-short {
      display: inline;
    }
    /* …and no room for the standing chip AND the Memory button: the chip
       opens the same panel, so with a meter showing it is the one door. */
    .standing + .memory-btn {
      display: none;
    }
    /* One pane at a time: the list, or (with a conversation open) the
       thread with a back button. */
    .dm {
      grid-template-columns: 1fr;
    }
    .dm .thread {
      display: none;
    }
    .dm.has-open .thread {
      display: flex;
    }
    .dm.has-open .list {
      display: none;
    }
    .mback {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin-right: 0.3rem;
      border: none;
      font-size: 1.35rem;
      color: var(--accent);
      -webkit-tap-highlight-color: transparent;
    }
    .mback:active {
      background: var(--panel-2);
    }
    header {
      display: flex;
      align-items: center;
      min-height: 52px;
      padding: 0 10px 0 6px;
      background: var(--panel);
    }
    .peer-name {
      font-size: 1.05rem;
    }
    /* The list: an app bar's height, a thumb-sized + and taller rows. */
    .list-head {
      min-height: 52px;
      padding: 0 8px 0 16px;
    }
    .list-head strong {
      font-size: 1.15rem;
      font-weight: 800;
    }
    .new {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      font-size: 1.5rem;
      -webkit-tap-highlight-color: transparent;
    }
    .new:active {
      background: var(--panel-2);
    }
    .convos {
      padding: 0.5rem 0.6rem;
    }
    .convo {
      padding: 0.6rem 0.55rem;
      gap: 0.75rem;
    }
    .convo:hover:not(.active) {
      background: none;
    }
    .convo:active {
      background: var(--panel-2);
    }
    .cname {
      font-size: 1rem;
    }
    .prev {
      font-size: 0.86rem;
    }
    .pick {
      padding: 0.55rem 0.5rem;
    }
    .pname {
      font-size: 0.95rem;
    }
    /* The composer sits on the tab bar (or the keyboard): a panel, tight. */
    .composer {
      padding: 8px 10px 10px;
      background: var(--panel);
      border-top: 1px solid var(--line);
    }
    .input-row {
      gap: 6px;
    }
    /* 44, not 42: this sits inside the component's own phone query, which
       out-ranks the global touch floor in app.css — the small number wins
       silently. Any height set here must clear 44 on its own. */
    .emoji-btn {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      -webkit-tap-highlight-color: transparent;
    }
    .emoji-btn:hover {
      border-color: var(--line);
    }
    .emoji-btn.send {
      background: var(--accent);
      color: var(--accent-ink);
      border-color: var(--accent);
    }
    textarea {
      min-height: 44px;
      padding: 0.6rem 0.85rem;
      border-radius: 12px;
      background: var(--bg);
    }
    .messages {
      padding: 0.5rem 0.4rem;
    }
  }
</style>
