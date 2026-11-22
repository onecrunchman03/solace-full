<script lang="ts">
  import { onDestroy } from "svelte";
  import { api } from "../lib/api";
  import { selectChannel } from "../lib/chat.svelte";
  import { openConversation } from "../lib/dm.svelte";
  import { go } from "../lib/nav.svelte";
  import Avatar from "./Avatar.svelte";

  // Full-text search over channel history + my DMs. Overlay opened from the
  // chat header's 🔍; Escape or scrim closes.
  const { onClose }: { onClose: () => void } = $props();

  let q = $state("");
  let results = $state<Awaited<ReturnType<typeof api.search>> | null>(null);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  }
  onDestroy(() => clearTimeout(timer)); // closing the panel cancels the debounce

  async function run() {
    const query = q.trim();
    if (query.length < 2) {
      results = null;
      return;
    }
    searching = true;
    try {
      results = await api.search(query);
    } catch {
      /* keep last results */
    } finally {
      searching = false;
    }
  }

  function openChannelHit(channelId: number) {
    onClose();
    go("chat");
    void selectChannel(channelId);
  }
  function openDmHit(conversationId: number) {
    onClose();
    go("dms");
    void openConversation(conversationId);
  }

  function when(t: number): string {
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function focusNow(el: HTMLInputElement) {
    el.focus();
  }
</script>

<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="panel" role="dialog" aria-label="Search messages" tabindex="-1" onkeydown={(e) => e.key === "Escape" && onClose()}>
  <input
    class="q"
    placeholder="Search messages…"
    bind:value={q}
    oninput={onInput}
    use:focusNow
  />

  {#if searching && !results}
    <p class="muted">Searching…</p>
  {:else if results}
    {#if results.channels.length === 0 && results.dms.length === 0}
      <p class="muted">Nothing found for “{q.trim()}”.</p>
    {/if}

    {#if results.channels.length}
      <div class="sect">CHANNELS</div>
      {#each results.channels as r (r.id)}
        <button class="hit" onclick={() => openChannelHit(r.channelId)}>
          <div class="hit-meta">
            {#if r.author}<Avatar name={r.author.displayName} id={r.author.id} avatar={r.author.avatar} size={16} />{/if}
            <b>{r.author?.displayName ?? "?"}</b>
            <span class="in">in #{r.channelName}</span>
            <span class="date">{when(r.createdAt)}</span>
          </div>
          <div class="hit-body">{r.body}</div>
        </button>
      {/each}
    {/if}

    {#if results.dms.length}
      <div class="sect">DIRECT MESSAGES</div>
      {#each results.dms as r (r.id)}
        <button class="hit" onclick={() => openDmHit(r.conversationId)}>
          <div class="hit-meta">
            {#if r.author}<Avatar name={r.author.displayName} id={r.author.id} avatar={r.author.avatar} size={16} />{/if}
            <b>{r.author?.displayName ?? "?"}</b>
            <span class="in">with {r.otherUser?.displayName ?? "?"}</span>
            <span class="date">{when(r.createdAt)}</span>
          </div>
          <div class="hit-body">{r.body}</div>
        </button>
      {/each}
    {/if}
  {:else}
    <p class="muted">Type at least two characters. Results cover every channel plus your own DMs.</p>
  {/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) */
    background: rgba(0, 0, 0, 0.45);
  }
  .panel {
    position: fixed;
    top: min(9vh, 70px);
    left: 50%;
    transform: translateX(-50%);
    z-index: calc(var(--z-modal, 10000) + 1);
    width: min(620px, calc(100vw - 24px));
    max-height: 74vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
  }
  .q {
    width: 100%;
    padding: 10px 13px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink);
    font: inherit;
    font-size: 0.95rem;
  }
  .q:focus {
    outline: none;
    border-color: var(--accent);
  }
  .muted {
    margin: 8px 4px;
    color: var(--ink-dim);
    font-size: 0.85rem;
  }
  .sect {
    margin-top: 8px;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    color: var(--ink-dim);
  }
  .hit {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .hit:hover {
    background: var(--panel-2);
    border-color: var(--line);
  }
  .hit-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    color: var(--ink-soft);
  }
  .hit-meta b {
    color: var(--ink);
  }
  .in {
    color: var(--ink-dim);
  }
  .date {
    margin-left: auto;
    color: var(--ink-dim);
  }
  .hit-body {
    color: var(--ink-soft);
    font-size: 0.86rem;
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
</style>
