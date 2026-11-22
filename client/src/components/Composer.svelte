<script lang="ts">
  import { sendMessage, sendTyping, selectedChannel, chat, cancelReply, canIPost } from "../lib/chat.svelte";
  import { pages } from "../lib/pages.svelte";
  import { can } from "../lib/roles.svelte";
  import { ApiError } from "../lib/api";
  import { createAttachmentStager, pastedFiles, drafts } from "../lib/attach.svelte";
  import { onDestroy, untrack } from "svelte";
  import EmojiPicker from "./EmojiPicker.svelte";
  import AttachTray from "./AttachTray.svelte";
  import Avatar from "./Avatar.svelte";

  let text = $state("");
  let error = $state<string | null>(null);
  let sending = false; // one POST at a time — a held Enter key repeats keydown (Sep 2026 review)
  let picking = $state(false);
  let ta = $state<HTMLTextAreaElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let lastTyping = 0;
  const stager = createAttachmentStager();
  const ch = $derived(selectedChannel());
  // FEDERATION (F2): a channel on a satellite page. Attachments wait for F3,
  // and an offline host means the words have nowhere to land — say so
  // instead of letting the send fail mysteriously.
  const chPage = $derived(ch ? pages.list.find((p) => p.id === ch.pageId) : undefined);
  const isRemote = $derived(chPage?.satelliteId != null);
  const remoteDown = $derived(isRemote && chPage?.remoteUp === false);
  // PAGE CHAT POLICY: a page may refuse attachments outright, or just GIFs.
  // The server enforces it (403 attachments_off / gifs_off); this is the
  // affordance — no 📎 where nothing can be attached.
  const filesOk = $derived(chPage?.allowImages !== false && can(ch?.pageId, "attach"));
  const gifsOk = $derived(chPage?.allowGifs !== false && can(ch?.pageId, "gif"));
  const reply = $derived(chat.replyingTo);
  const mayPost = $derived(!!ch && canIPost(ch));

  // A room switch parks this room's draft and opens the next one's; staged
  // files are thrown away (they were meant for the room you left).
  let roomKey: string | null = null;
  $effect(() => {
    const key = ch ? `c:${ch.id}` : null;
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

  function onInput() {
    const now = Date.now();
    if (now - lastTyping > 2000) {
      sendTyping();
      lastTyping = now;
    }
    syncMention();
  }

  // ---- @mention autocomplete ----
  let mQuery = $state<string | null>(null); // null = popup closed
  let mIndex = $state(0);
  type Member = (typeof chat.members)[number];
  const mCandidates = $derived.by(() => {
    if (mQuery === null) return [] as Member[];
    const q = mQuery.toLowerCase();
    return chat.members
      .filter((u) => !u.disabled)
      .filter((u) => u.username.toLowerCase().startsWith(q) || u.displayName.toLowerCase().startsWith(q))
      .slice(0, 6);
  });

  /** Open/close the popup based on the "@partial" immediately before the caret. */
  function syncMention() {
    const el = ta;
    if (!el) {
      mQuery = null;
      return;
    }
    const upto = text.slice(0, el.selectionStart ?? text.length);
    const m = /(?:^|\s)@([a-zA-Z0-9._-]{0,32})$/.exec(upto);
    mQuery = m ? m[1] : null;
    mIndex = 0;
  }

  function pickMention(u: Member) {
    const el = ta;
    if (!el) return;
    const pos = el.selectionStart ?? text.length;
    const start = text.slice(0, pos).lastIndexOf("@");
    if (start === -1) return;
    text = text.slice(0, start) + "@" + u.username + " " + text.slice(pos);
    mQuery = null;
    queueMicrotask(() => {
      el.focus();
      const p = start + u.username.length + 2;
      el.setSelectionRange(p, p);
    });
  }

  // Pasted images stage in the tray — they do NOT auto-post. Plain-text
  // pastes fall through to the textarea untouched.
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
    const ids = stager.ids();
    // Busy FIRST: an image-only send during the upload window used to hit
    // the empty-check (ids covers completed uploads only) and silently do
    // nothing — the exact pasted-image-on-touch case the ➤ exists for.
    if (stager.busy) {
      error = "Hold on — still uploading.";
      return;
    }
    if (!text.trim() && !ids.length) return;
    if (sending) return;
    sending = true;
    const sentFrom = roomKey;
    try {
      await sendMessage(text, ids);
      if (sentFrom) drafts.delete(sentFrom);
      // Switched rooms mid-send: the new room's draft is not ours to clear.
      if (roomKey === sentFrom) {
        text = "";
        error = null;
        stager.clear();
      }
    } catch (e) {
      error =
        e instanceof ApiError && e.code === "unowned_emoji"
          ? "You can only post emoji you own."
          : e instanceof ApiError && e.code === "locked"
            ? "This channel is locked — only approved members can post."
            : e instanceof ApiError && e.code === "rate_limited"
              ? "Easy — give the room a second to catch up."
              : "Couldn’t send that message.";
    } finally {
      sending = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // The mention popup owns the keys while it's open.
    if (mQuery !== null && mCandidates.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mIndex = (mIndex + 1) % mCandidates.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        mIndex = (mIndex - 1 + mCandidates.length) % mCandidates.length;
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mCandidates[mIndex]);
        return;
      }
      if (e.key === "Escape") {
        mQuery = null;
        return;
      }
    }
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
</script>

<div class="composer" ondragover={(e) => e.preventDefault()} ondrop={onDrop} role="group">
  {#if reply}
    <div class="reply-bar">
      <span class="rb-text">Replying to <b>{reply.author?.displayName ?? "unknown"}</b></span>
      <button class="rb-x" onclick={cancelReply} title="Cancel reply">✕</button>
    </div>
  {/if}
  {#if error}
    <div class="err">{error}</div>
  {/if}
  {#if remoteDown}
    <div class="locked-note">🛰 This community is offline — its host isn't connected right now.</div>
  {:else if mayPost}
    <AttachTray {stager} />
    <div class="input-row">
      <div class="emoji-anchor">
        <button class="emoji-btn" title="Your emoji" onclick={() => (picking = !picking)}>😀</button>
        {#if picking}
          <EmojiPicker placement="up" align="left" onpick={insertEmoji} onclose={() => (picking = false)} />
        {/if}
      </div>
      {#if filesOk}
        <button class="emoji-btn" title={gifsOk ? "Attach an image or text file" : "Attach an image or text file (no GIFs on this page)"} onclick={() => fileInput?.click()}>📎</button>
      {/if}
      <input
        bind:this={fileInput}
        type="file"
        multiple
        accept={gifsOk ? "image/png,image/jpeg,image/gif,image/webp,.txt,.md,.log,.csv" : "image/png,image/jpeg,image/webp,.txt,.md,.log,.csv"}
        style="display:none"
        onchange={(e) => {
          stager.addFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <div class="ta-anchor">
        {#if mQuery !== null && mCandidates.length}
          <div class="mention-pop">
            {#each mCandidates as u, i (u.id)}
              <button
                class="m-row"
                class:hot={i === mIndex}
                onclick={() => pickMention(u)}
                onmouseenter={() => (mIndex = i)}
              >
                <Avatar name={u.displayName} id={u.id} avatar={u.avatar} size={20} />
                <span class="m-name">{u.displayName}</span>
                <span class="m-user">@{u.username}</span>
              </button>
            {/each}
          </div>
        {/if}
        <textarea
          bind:this={ta}
          rows="1"
          placeholder={`Message #${ch?.name ?? ""}`}
          bind:value={text}
          oninput={onInput}
          onkeydown={onKeydown}
          onpaste={onPaste}
          onclick={syncMention}
        ></textarea>
      </div>
      <!-- The send button exists for touch: a pasted image with no text has
           no Enter key to send it (Josh, Aug 2026). It appears whenever
           there's something to send, on every platform. -->
      {#if text.trim() || stager.items.some((it) => !it.error)}
        <button class="emoji-btn send" title="Send" onclick={() => void trySend()}>➤</button>
      {/if}
    </div>
  {:else}
    <div class="locked-note">🔒 This channel is locked — only approved members can post.</div>
  {/if}
</div>

<style>
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
  .locked-note {
    padding: 0.7rem 0.85rem;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink-soft);
    font-size: 0.85rem;
    text-align: center;
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
  .ta-anchor {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .mention-pop {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 45;
    min-width: 240px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    padding: 5px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
  }
  .m-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 0.86rem;
    text-align: left;
    cursor: pointer;
  }
  .m-row.hot {
    background: color-mix(in srgb, var(--accent) 18%, var(--panel-2));
  }
  .m-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m-user {
    color: var(--ink-dim);
    font-size: 0.76rem;
    margin-left: auto;
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
  /* A long channel name must truncate in the one-row field, not wrap+clip. */
  textarea::placeholder {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* PHONE MODE: the composer sits directly on the tab bar (or the keyboard),
     so it wears a panel and loses the desktop's loose bottom margin. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
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
    .emoji-btn:active {
      border-color: var(--accent);
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
    .reply-bar,
    .locked-note {
      font-size: 0.85rem;
    }
  }
</style>
