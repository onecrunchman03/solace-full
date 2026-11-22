<script lang="ts">
  import type { Message } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { chat, selectedChannel, editMessage, deleteMessage, reactToMessage, startReply, debtLabel } from "../lib/chat.svelte";
  import { isBlocked } from "../lib/blocks.svelte";
  import { api } from "../lib/api";
  import { parseMessage, emojiScale, lookupEmoji } from "../lib/emoji.svelte";
  import { messageStamp } from "../lib/time";
  import { splitMentions, mentionsUser } from "../lib/mentions";
  import { askText } from "../lib/confirm.svelte";
  import { openProfile } from "../lib/nav.svelte";
  import { pages } from "../lib/pages.svelte";
  import { roleColorFor } from "../lib/roles.svelte";
  import { phone } from "../lib/phone.svelte";
  import { longpress } from "../lib/longpress";
  import Avatar from "./Avatar.svelte";
  import { botKind } from "../lib/bots";
  import EmojiPicker from "./EmojiPicker.svelte";
  import Attachments from "./Attachments.svelte";

  let { message, grouped }: { message: Message; grouped: boolean } = $props();

  let editing = $state(false);
  let editText = $state("");
  let confirmingDelete = $state(false);
  let picking = $state(false);

  const stamp = $derived(messageStamp(message.createdAt));
  const time = $derived(stamp.text);
  const me = $derived(session.user);
  const myId = $derived(me?.id ?? -1);
  const ch = $derived(selectedChannel());
  const isAuthor = $derived(me?.id === message.userId);
  const canEdit = $derived(isAuthor && !message.deletedAt);
  const canDelete = $derived(
    // The server's canDeleteMessage: author, admin, channel owner — or the
    // page's manager (Oct 2026 review: they could, the UI didn't offer it).
    !message.deletedAt && (isAuthor || !!me?.isAdmin || ch?.createdBy === me?.id ||
      pages.list.find((p) => p.id === ch?.pageId)?.role === "manager"),
  );

  const segments = $derived(message.deletedAt ? [] : parseMessage(message.body));
  const scale = $derived(emojiScale(segments));
  // @everyone is a real mention only from the house (Sterling) or an admin —
  // a regular member typing it stays plain text.
  const memberNames = $derived.by(() => {
    const names = new Set(chat.members.map((m) => m.username.toLowerCase()));
    // PAGE ROLES: the server stamps `everyone` when the author held the
    // permission; the house and admins keep their old standing.
    if (message.author?.isBot || message.author?.isAdmin || message.everyone) names.add("everyone");
    return names;
  });
  const mentionsMe = $derived(
    !message.deletedAt &&
      (mentionsUser(message.body, me?.username) ||
        ((message.author?.isBot || message.author?.isAdmin || !!message.everyone) && /@everyone\b/.test(message.body))),
  );
  // A role colour tints the name — unless a paid flair is equipped (flair wins).
  const roleColor = $derived(message.author?.cosmetics?.flair ? null : roleColorFor(ch?.pageId, message.userId));

  function reactorNames(userIds: number[]): string {
    return userIds
      .map((id) => (id === myId ? "You" : (chat.members.find((u) => u.id === id)?.displayName ?? "someone")))
      .join(", ");
  }

  function startEdit() {
    editText = message.body;
    editing = true;
  }
  async function saveEdit() {
    const t = editText.trim();
    if (t && t !== message.body) {
      try {
        await editMessage(message.id, t);
      } catch {
        /* keep editing open on failure */
        return;
      }
    }
    editing = false;
  }
  async function doDelete() {
    await deleteMessage(message.id);
    confirmingDelete = false;
  }
  function pickReaction(code: string) {
    picking = false;
    void reactToMessage(message.id, code);
  }

  // Touch screens: the action row collapses to a single ⋯ until tapped.
  // PHONE MODE goes further — no pill at all: press and hold the message and
  // the actions rise as a bottom sheet (lib/longpress.ts).
  let mobileOpen = $state(false);
  const sheet = $derived(phone.on && (mobileOpen || picking || confirmingDelete));
  function closeSheet(): void {
    mobileOpen = false;
    picking = false;
    confirmingDelete = false;
  }
  let copied = $state(false);
  async function copyText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(message.body);
      copied = true;
      setTimeout(() => { copied = false; closeSheet(); }, 700);
    } catch {
      closeSheet();
    }
  }

  // Blocked authors collapse to a stub; "Show" reveals just this message.
  let revealBlocked = $state(false);
  const authorBlocked = $derived(isBlocked(message.userId));

  let reported = $state(false);
  async function reportMessage() {
    // The house prompt, not the browser's (banned — and the desktop shell's
    // webview returns null from prompt() unconditionally, which silently
    // broke reporting there).
    const reason = await askText({
      title: "Report this message",
      label: "What's wrong?",
      placeholder: "tell the admin what happened",
      confirm: "report",
      maxLength: 500,
    });
    if (!reason) return;
    void api.report("message", message.id, reason).then(() => (reported = true)).catch(() => {});
  }
</script>

{#if authorBlocked && !revealBlocked}
  <div class="row blocked-stub" class:grouped>
    <span class="blocked-note">🚫 Message from a blocked user</span>
    <button class="blocked-show" onclick={() => (revealBlocked = true)}>Show</button>
  </div>
{:else}
<div class="row" class:grouped class:mentioned={mentionsMe} use:longpress={{ when: () => phone.on && !editing && !message.deletedAt && !sheet, hold: () => (mobileOpen = true) }}>
  <div class="gutter">
    {#if !grouped}
      <button class="avabtn" title="View profile" onclick={() => openProfile(message.userId)}>
        <Avatar
          name={message.author?.displayName ?? "?"}
          id={message.userId}
          avatar={message.author?.avatar ?? null}
          bot={botKind(message.author)}
          size={36}
          border={message.author?.cosmetics?.border}
        />
      </button>
    {:else}
      <span class="hovertime">{time}</span>
    {/if}
  </div>

  <div class="content">
    {#if message.replyTo}
      <div class="reply-ctx">
        <span class="reply-arrow">↳</span>
        <span class="reply-author">{message.replyTo.author?.displayName ?? "unknown"}</span>
        <span class="reply-excerpt">
          {#if message.replyTo.deleted}
            <span class="muted">original deleted</span>
          {:else}
            {#each parseMessage(message.replyTo.excerpt) as s}{#if s.type === "emoji"}<img
                  class="re"
                  src={`/emoji/${s.file}`}
                  alt={s.name}
                />{:else}{s.value}{/if}{/each}
          {/if}
        </span>
      </div>
    {/if}

    {#if !grouped}
      <div class="head">
        <button
          class="author {message.author?.cosmetics?.flair ?? ''}"
          class:you={isAuthor}
          style={roleColor ? `color:${roleColor}` : ""}
          onclick={() => openProfile(message.userId)}
        >
          {message.author?.displayName ?? "Unknown"}
        </button>
        {#if message.author?.isBot}<span class="botbadge">⚙ BOT</span>{/if}
        {#if debtLabel(message.userId)}<span class="debtbadge" title="owes the goblins">⚖ {debtLabel(message.userId)}</span>{/if}
        <span class="time" title={stamp.full}>{time}</span>
      </div>
    {/if}

    {#if editing}
      <div class="edit">
        <textarea
          bind:value={editText}
          rows="1"
          onkeydown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              saveEdit();
            }
            if (e.key === "Escape") editing = false;
          }}
        ></textarea>
        <div class="edit-actions">
          <button class="save" onclick={saveEdit}>Save</button>
          <button class="ghost" onclick={() => (editing = false)}>Cancel</button>
        </div>
      </div>
    {:else if message.deletedAt}
      <div class="body deleted">message deleted</div>
    {:else}
      <div class="body {scale}" class:house={message.author?.isBot}>
        {#each segments as s}{#if s.type === "text"}{#each splitMentions(s.value, memberNames) as p}{#if p.type === "mention"}<span
                class="mention-chip"
                class:me={p.value.toLowerCase() === me?.username?.toLowerCase()}
              >@{p.value}</span>{:else}{p.value}{/if}{/each}{:else if s.type === "emoji"}<img
              class="cem"
              src={`/emoji/${s.file}`}
              alt={s.name}
              title={s.name}
            />{/if}{/each}{#if message.editedAt}<span class="tag"> (edited)</span>{/if}
      </div>
    {/if}

    {#if !message.deletedAt && message.attachments?.length}
      <Attachments attachments={message.attachments} />
    {/if}

    {#if message.reactions.length && !message.deletedAt}
      <div class="reactions">
        {#each message.reactions as r (r.code)}
          {@const em = lookupEmoji(r.code)}
          <button
            class="chip"
            class:mine={r.userIds.includes(myId)}
            onclick={() => reactToMessage(message.id, r.code)}
          >
            {#if em}<img src={`/emoji/${em.file}`} alt={em.name} />{:else}<span class="q">?</span>{/if}
            <span class="cnt">{r.userIds.length}</span>
            <span class="who-tip">{reactorNames(r.userIds)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !editing && !message.deletedAt}
    {#if sheet}
      <div class="act-scrim" onclick={closeSheet} role="presentation"></div>
    {/if}
    <div class="actions" class:pinned={picking || confirmingDelete} class:open={mobileOpen} class:sheet>
      <!-- Touch screens (tablets): a single ⋯ that expands the toolbar (an
           always-open row covered the message content). Phones get the
           press-and-hold sheet instead and never show the pill. -->
      <button class="more" title="Message actions" onclick={() => (mobileOpen = !mobileOpen)}>⋯</button>
      {#if sheet}
        <div class="sheet-head">
          <b>{message.author?.displayName ?? "Unknown"}</b>
          <span>{message.body.length > 80 ? message.body.slice(0, 80) + "…" : message.body}</span>
        </div>
      {/if}
      {#if confirmingDelete}
        <button class="danger" onclick={doDelete}>{#if sheet}<span class="ico">🗑</span>{/if}<span class="lbl">Delete this message</span>{#if !sheet}Delete{/if}</button>
        <button class="ghost sm" onclick={() => (confirmingDelete = false)}><span class="lbl">Keep it</span>{#if !sheet}No{/if}</button>
      {:else}
        <button title="React" onclick={() => (picking = !picking)}><span class="ico">😀</span><span class="lbl">React</span></button>
        <button title="Reply" onclick={() => { startReply(message); closeSheet(); }}><span class="ico">↩</span><span class="lbl">Reply</span></button>
        {#if canEdit}<button title="Edit" onclick={() => { startEdit(); closeSheet(); }}><span class="ico">✎</span><span class="lbl">Edit</span></button>{/if}
        {#if sheet}
          <button onclick={copyText}><span class="ico">⧉</span><span class="lbl">{copied ? "Copied ✓" : "Copy text"}</span></button>
        {/if}
        {#if canDelete}<button title="Delete" class:danger={sheet} onclick={() => (confirmingDelete = true)}><span class="ico">🗑</span><span class="lbl">Delete</span></button>{/if}
        {#if message.userId !== session.user?.id}
          <button title={reported ? "Reported" : "Report"} onclick={() => { reportMessage(); closeSheet(); }}><span class="ico">{reported ? "✓" : "⚑"}</span><span class="lbl">{reported ? "Reported" : "Report"}</span></button>
        {/if}
      {/if}
      {#if picking}
        <EmojiPicker placement="up" align="right" onpick={(c) => { pickReaction(c); closeSheet(); }} onclose={() => (picking = false)} />
      {/if}
    </div>
  {/if}
</div>
{/if}

<style>
  .blocked-stub {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 16px 4px 62px;
    opacity: 0.65;
  }
  .blocked-note {
    font-size: 0.78rem;
    font-style: italic;
    color: var(--ink-dim);
  }
  .blocked-show {
    padding: 2px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .blocked-show:hover {
    border-color: var(--accent);
  }
  .row {
    position: relative;
    display: grid;
    grid-template-columns: 48px 1fr;
    padding: 0.12rem 0.5rem;
    border-radius: 6px;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .row:not(.grouped) {
    margin-top: 0.5rem;
  }
  .gutter {
    display: flex;
    justify-content: center;
    /* Pin the avatar to the TOP of the message (tall image attachments were
       stretching the gutter and centering it mid-block). */
    align-items: flex-start;
    padding-top: 0.2rem;
  }
  .avabtn {
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 50%;
    line-height: 0;
  }
  .avabtn:hover {
    filter: brightness(1.08);
  }
  .hovertime {
    font-size: 0.62rem;
    color: var(--ink-dim);
    opacity: 0;
    padding-top: 0.25rem;
  }
  .row:hover .hovertime {
    opacity: 1;
  }
  .content {
    min-width: 0;
  }
  /* Touch: reserve the top-right corner so the ⋯ pill never sits on text. */
  @media (hover: none) {
    .content {
      padding-right: 36px;
    }
  }
  .reply-ctx {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.76rem;
    color: var(--ink-soft);
    margin-bottom: 1px;
    max-width: 100%;
  }
  .reply-arrow {
    color: var(--ink-dim);
  }
  .reply-author {
    font-weight: 600;
    color: var(--ink);
  }
  .reply-excerpt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.85;
  }
  .reply-excerpt .re {
    width: 1.1em;
    height: 1.1em;
    object-fit: contain;
    vertical-align: middle;
  }
  .muted {
    font-style: italic;
    color: var(--ink-dim);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .author {
    padding: 0;
    border: none;
    font: inherit;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--ink);
    cursor: pointer;
  }
  /* The button reset's `background: none` is a SHORTHAND, and this scoped
     rule outranks the global flair classes — so on a gradient flair (a
     gradient clipped to transparent glyphs) it wiped the gradient and left
     transparent text: an invisible name, or under a theme that glows the
     author, a blurred smudge of one (Josh, Sep 2026: "some themes blur out
     the persons name if they have a special name"). The reset applies only
     where no flair is worn; a flaired name keeps its own background. */
  .author:not([class*="flair-"]) {
    background: none;
  }
  .author:hover {
    text-decoration: underline;
  }
  .author.you {
    color: var(--accent);
  }
  .time {
    color: var(--ink-dim);
    font-size: 0.7rem;
  }
  /* THE MARK (Sep 2026): the goblins' debtor tag rides the gutter too. */
  .debtbadge {
    font-size: 0.56rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 4px;
    color: #ffb08a;
    background: rgba(140, 50, 30, 0.35);
    border: 1px solid rgba(200, 90, 60, 0.5);
  }
  .botbadge {
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 1px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent) 30%, var(--panel-2));
    color: var(--ink);
    border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  }
  /* Sterling's notes read like house stationery: a tinted card with a
     copper spine, so his multi-line reports stand apart from the chatter. */
  .body.house {
    margin-top: 3px;
    padding: 8px 12px;
    border-left: 3px solid color-mix(in srgb, var(--accent) 70%, transparent);
    border-radius: 4px 10px 10px 4px;
    background: color-mix(in srgb, var(--accent) 7%, var(--panel-2));
    max-width: 640px;
  }
  .body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.45;
    font-family: var(--chat-font, inherit);
  }
  .cem {
    display: inline-block;
    vertical-align: middle;
    object-fit: contain;
  }
  .body.inline .cem {
    width: 1.4em;
    height: 1.4em;
  }
  .body.medium .cem {
    width: 30px;
    height: 30px;
  }
  .body.large .cem {
    width: 44px;
    height: 44px;
  }
  .body.jumbo .cem {
    width: 64px;
    height: 64px;
  }
  .body.jumbo,
  .body.large,
  .body.medium {
    line-height: 1.1;
  }
  .tag {
    color: var(--ink-dim);
    font-size: 0.7rem;
  }
  .deleted {
    color: var(--ink-dim);
    font-style: italic;
  }
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px 3px 6px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    line-height: 1;
  }
  .chip:hover {
    border-color: var(--ink-dim);
  }
  .chip.mine {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border-color: var(--accent);
  }
  /* Collectible art is detailed — 17px made every reaction a smudge (Josh,
     Aug 2026). 22px in the chip, and hovering magnifies the emoji itself. */
  .chip img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    transition: transform 0.12s ease;
  }
  .chip:hover img {
    transform: scale(1.9);
    position: relative;
    z-index: 6;
  }
  .chip .q {
    width: 22px;
    text-align: center;
    color: var(--ink-dim);
  }
  .chip .cnt {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .chip.mine .cnt {
    color: var(--ink);
  }
  .who-tip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    display: none;
    white-space: nowrap;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 8px;
    background: #0b0906;
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    font-size: 0.72rem;
    z-index: 5;
    pointer-events: none;
  }
  .chip:hover .who-tip {
    display: block;
  }
  .edit textarea {
    width: 100%;
    resize: none;
    padding: 0.45rem 0.6rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
  }
  .edit textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .edit-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.35rem;
    font-size: 0.78rem;
  }
  .edit-actions button {
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font: inherit;
  }
  .save {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .ghost {
    background: none;
    color: var(--ink-soft);
    border: 1px solid var(--line) !important;
  }
  .actions {
    position: absolute;
    top: -0.6rem;
    right: 0.5rem;
    display: none;
    gap: 0.15rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.15rem;
  }
  .row:hover .actions,
  .actions.pinned {
    display: flex;
  }
  /* The ⋯ expander only exists on touch screens. */
  .actions .more {
    display: none;
  }
  /* Touch screens have no hover — without this, phones can never react,
     reply, edit, or delete. Show ONLY a small ⋯ pill until tapped: the
     always-open toolbar used to cover the message content. */
  @media (hover: none) {
    .actions {
      display: flex;
      opacity: 0.92;
    }
    .actions .more {
      display: block;
    }
    .actions:not(.open):not(.pinned) button:not(.more) {
      display: none;
    }
  }
  .actions button {
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.2rem 0.35rem;
    border-radius: 5px;
  }
  .actions button:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .actions .danger {
    color: var(--danger);
  }
  .actions .sm {
    font-size: 0.78rem;
    padding: 0.2rem 0.4rem;
  }
  /* Labels exist for the phone sheet; the desktop pill is icons only. */
  .lbl,
  .sheet-head,
  .act-scrim {
    display: none;
  }

  /* ---- PHONE MODE: press and hold → a bottom sheet of actions. ---- */
  /* The TOUCH half: only a phone with a finger loses the pill — a desktop
     window narrowed to phone width still has hover and a mouse, and the
     hold is touch-only, so hiding the pill there would leave no way in. */
  @media (max-width: 760px) and (hover: none), (max-height: 500px) and (pointer: coarse) {
    .row {
      /* The hold gesture owns the row: no iOS copy callout, no text
         selection under the finger (Copy text lives in the sheet). */
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    /* …except the inline edit: WebKit refuses selection inside a form
       control under a user-select:none ancestor (no Select/Paste bubble). */
    .edit textarea {
      -webkit-user-select: text;
      user-select: text;
    }
    .content {
      padding-right: 0;
    }
    /* Never the floating pill on a phone. Specificity matches the hover:none
       rules above; source order wins. */
    .row .actions:not(.sheet) {
      display: none;
    }
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .row {
      padding: 0.15rem 0.6rem;
      grid-template-columns: 46px 1fr;
    }
    .row:hover {
      background: none;
    }
    .act-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 30;
      background: rgba(0, 0, 0, 0.45);
    }
    .actions.sheet {
      position: fixed;
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 31;
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 8px 10px calc(12px + env(safe-area-inset-bottom));
      border: none;
      border-top: 1px solid var(--line-2);
      border-radius: 18px 18px 0 0;
      background: var(--panel);
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5);
      opacity: 1;
      animation: sheet-up 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
    }
    @keyframes sheet-up {
      from { transform: translateY(40px); opacity: 0; }
      to { transform: none; opacity: 1; }
    }
    .actions.sheet::before {
      content: "";
      width: 40px;
      height: 4px;
      margin: 2px auto 8px;
      border-radius: 2px;
      background: var(--line-2);
    }
    .actions.sheet .more {
      display: none;
    }
    .sheet-head {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 8px 10px;
      margin-bottom: 4px;
      border-bottom: 1px solid var(--line);
      font-size: 0.82rem;
      color: var(--ink-soft);
    }
    .sheet-head b {
      color: var(--ink);
    }
    .sheet-head span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions.sheet button {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 13px 10px;
      border-radius: 10px;
      color: var(--ink);
      font-size: 1rem;
      font-weight: 600;
      text-align: left;
    }
    .actions.sheet button:hover {
      background: none;
    }
    .actions.sheet button:active {
      background: var(--panel-2);
    }
    .actions.sheet .ico {
      width: 26px;
      text-align: center;
      font-size: 1.15rem;
    }
    .actions.sheet .lbl {
      display: inline;
    }
    .actions.sheet .danger {
      color: var(--danger);
    }
    .actions.sheet .ghost {
      border: none !important;
      color: var(--ink-soft);
    }
    .actions.sheet .sm {
      font-size: 1rem;
      padding: 13px 10px;
    }
  }
</style>
