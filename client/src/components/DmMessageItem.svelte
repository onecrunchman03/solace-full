<script lang="ts">
  import type { DmMessage, User } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { editDm, deleteDm, startReplyDm } from "../lib/dm.svelte";
  import { parseMessage, emojiScale } from "../lib/emoji.svelte";
  import { messageStamp } from "../lib/time";
  import { splitMentions } from "../lib/mentions";
  import { openProfile } from "../lib/nav.svelte";
  import { phone } from "../lib/phone.svelte";
  import { longpress } from "../lib/longpress";
  import Avatar from "./Avatar.svelte";
  import { botKind } from "../lib/bots";
  import Attachments from "./Attachments.svelte";
  import { api } from "../lib/api";
  import { askText } from "../lib/confirm.svelte";

  let { message, otherUser, grouped }: { message: DmMessage; otherUser: User; grouped: boolean } =
    $props();

  const me = $derived(session.user);
  const isMine = $derived(message.senderId === me?.id);
  const author = $derived(isMine ? me : otherUser);
  const stamp = $derived(messageStamp(message.createdAt));
  const time = $derived(stamp.text);
  const segments = $derived(message.deletedAt ? [] : parseMessage(message.body));
  const scale = $derived(emojiScale(segments));
  const validNames = $derived(
    new Set([me?.username, otherUser.username].filter((n): n is string => !!n).map((n) => n.toLowerCase())),
  );

  let editing = $state(false);
  let editText = $state("");
  let confirmingDelete = $state(false);
  // Touch screens: the action row collapses to a single ⋯ until tapped.
  // PHONE MODE: press and hold → a bottom sheet (MessageItem's shape).
  let mobileOpen = $state(false);
  const sheet = $derived(phone.on && (mobileOpen || confirmingDelete));
  function closeSheet(): void {
    mobileOpen = false;
    confirmingDelete = false;
  }
  // Reporting a DM (the server's "dm" report kind had no button anywhere —
  // Oct 2026 review). Only the other person's messages, and only yours to send.
  let reported = $state(false);
  async function reportDm(): Promise<void> {
    const reason = await askText({
      title: "Report this message",
      label: "What's wrong?",
      placeholder: "tell the admin what happened",
      confirm: "report",
      maxLength: 500,
    });
    if (!reason) return;
    void api.report("dm", message.id, reason).then(() => (reported = true)).catch(() => {});
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

  function startEdit() {
    editText = message.body;
    editing = true;
  }
  async function saveEdit() {
    const t = editText.trim();
    if (t && t !== message.body) {
      try {
        await editDm(message.id, t);
      } catch {
        return;
      }
    }
    editing = false;
  }
  async function doDelete() {
    await deleteDm(message.id);
    confirmingDelete = false;
  }
</script>

<div class="row" class:grouped use:longpress={{ when: () => phone.on && !editing && !message.deletedAt && !sheet, hold: () => (mobileOpen = true) }}>
  <div class="gutter">
    {#if !grouped}
      <button class="avabtn" title="View profile" onclick={() => openProfile(author?.id ?? 0)}>
        <Avatar name={author?.displayName ?? "?"} id={author?.id ?? 0} avatar={author?.avatar ?? null} bot={botKind(author)} size={36} />
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
        <button class="author" class:you={isMine} onclick={() => openProfile(author?.id ?? 0)}>
          {author?.displayName ?? "Unknown"}
        </button>
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
      <div class="body {scale}" class:house={author?.isBot}>
        {#each segments as s}{#if s.type === "text"}{#each splitMentions(s.value, validNames) as p}{#if p.type === "mention"}<span
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
  </div>

  {#if !editing && !message.deletedAt}
    {#if sheet}
      <div class="act-scrim" onclick={closeSheet} role="presentation"></div>
    {/if}
    <div class="actions" class:pinned={confirmingDelete} class:open={mobileOpen} class:sheet>
      <button class="more" title="Message actions" onclick={() => (mobileOpen = !mobileOpen)}>⋯</button>
      {#if sheet}
        <div class="sheet-head">
          <b>{author?.displayName ?? "Unknown"}</b>
          <span>{message.body.length > 80 ? message.body.slice(0, 80) + "…" : message.body}</span>
        </div>
      {/if}
      {#if confirmingDelete}
        <button class="danger" onclick={doDelete}>{#if sheet}<span class="ico">🗑</span>{/if}<span class="lbl">Delete this message</span>{#if !sheet}Delete{/if}</button>
        <button class="ghost sm" onclick={() => (confirmingDelete = false)}><span class="lbl">Keep it</span>{#if !sheet}No{/if}</button>
      {:else}
        <button title="Reply" onclick={() => { startReplyDm(message); closeSheet(); }}><span class="ico">↩</span><span class="lbl">Reply</span></button>
        {#if isMine}<button title="Edit" onclick={() => { startEdit(); closeSheet(); }}><span class="ico">✎</span><span class="lbl">Edit</span></button>{/if}
        {#if sheet}
          <button onclick={copyText}><span class="ico">⧉</span><span class="lbl">{copied ? "Copied ✓" : "Copy text"}</span></button>
        {/if}
        {#if isMine}<button title="Delete" class:danger={sheet} onclick={() => (confirmingDelete = true)}><span class="ico">🗑</span><span class="lbl">Delete</span></button>{/if}
        {#if !isMine && !botKind(otherUser)}
          <button title={reported ? "Reported" : "Report"} onclick={() => { reportDm(); closeSheet(); }}><span class="ico">{reported ? "✓" : "⚑"}</span><span class="lbl">{reported ? "Reported" : "Report"}</span></button>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
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
    align-items: flex-start; /* avatar pins to the top, even beside tall images */
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
    background: none;
    border: none;
    font: inherit;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--ink);
    cursor: pointer;
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
  .body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.45;
    font-family: var(--chat-font, inherit);
  }
  /* Sterling's sealed notes — house stationery, same as in channels. */
  .body.house {
    margin-top: 3px;
    padding: 8px 12px;
    border-left: 3px solid color-mix(in srgb, var(--accent) 70%, transparent);
    border-radius: 4px 10px 10px 4px;
    background: color-mix(in srgb, var(--accent) 7%, var(--panel-2));
    max-width: 640px;
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
  .actions .more {
    display: none;
  }
  /* Touch screens have no hover — show a single ⋯ until tapped (an
     always-open toolbar covered the message content on phones). */
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
  .lbl,
  .sheet-head,
  .act-scrim {
    display: none;
  }

  /* ---- PHONE MODE: press and hold → a bottom sheet (see MessageItem). ---- */
  @media (max-width: 760px) and (hover: none), (max-height: 500px) and (pointer: coarse) {
    .row {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    .edit textarea {
      -webkit-user-select: text;
      user-select: text;
    }
    .content {
      padding-right: 0;
    }
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
