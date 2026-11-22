<script lang="ts">
  import { onMount } from "svelte";
  import { api, ApiError, type FeedbackItem } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { feedback, loadFeedback, upsertFeedback } from "../lib/feedback.svelte";
  import Avatar from "./Avatar.svelte";

  let kind = $state<"bug" | "idea">("bug");
  let body = $state("");
  let sending = $state(false);
  let note = $state("");
  let err = $state("");
  const isAdmin = $derived(session.user?.isAdmin ?? false);
  const openCount = $derived(feedback.items.filter((f) => f.status === "open").length);

  onMount(() => void loadFeedback());

  async function submit() {
    const text = body.trim();
    if (!text || sending) return;
    sending = true;
    note = "";
    err = "";
    try {
      const r = await api.sendFeedback(kind, text);
      upsertFeedback(r.item); // the broadcast also delivers it; upsert dedupes
      body = "";
      note = kind === "bug" ? "Thanks — the bug is logged." : "Thanks — your idea is in.";
    } catch (e) {
      err =
        e instanceof ApiError && e.code === "rate_limited"
          ? "Easy there — you've filed a lot recently. Try again later."
          : e instanceof ApiError && e.code === "too_long"
            ? "That's a bit long — keep it under 1000 characters."
            : "Couldn't send that. Try again.";
    } finally {
      sending = false;
    }
  }

  async function toggle(item: FeedbackItem) {
    try {
      const r = await api.setFeedbackStatus(item.id, item.status !== "done");
      upsertFeedback(r.item);
    } catch {
      /* ignore */
    }
  }

  function when(t: number): string {
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
</script>

<div class="fb">
  <div class="inner">
    <header class="head">
      <h1>Feedback</h1>
      <p>Hit a bug, or have an idea to make Solace better? Tell the house — the board is public, so everyone sees what's filed.</p>
    </header>

    <section class="compose">
      <div class="kinds">
        <button class="ktab" class:on={kind === "bug"} onclick={() => (kind = "bug")}>🐞 Bug report</button>
        <button class="ktab" class:on={kind === "idea"} onclick={() => (kind = "idea")}>💡 Suggestion</button>
      </div>
      <textarea
        bind:value={body}
        maxlength="1000"
        rows="4"
        placeholder={kind === "bug"
          ? "What happened? What did you expect? Where in the app?"
          : "What would make Solace better?"}
      ></textarea>
      <div class="row-end">
        <span class="count">{body.length}/1000</span>
        <button class="go" disabled={sending || !body.trim()} onclick={submit}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      {#if note}<p class="note ok">{note}</p>{/if}
      {#if err}<p class="note err">{err}</p>{/if}
    </section>

    <section class="list">
      <div class="list-label">THE BOARD {#if openCount}<span class="pill">{openCount} open</span>{/if}</div>
      {#if feedback.items.length === 0}
        <p class="empty">{feedback.loading ? "Loading…" : "Nothing filed yet. Be the first."}</p>
      {/if}
      {#each feedback.items as f (f.id)}
        <div class="item" class:done={f.status === "done"}>
          <span class="badge {f.kind}">{f.kind === "bug" ? "🐞" : "💡"}</span>
          <div class="item-body">
            <div class="item-meta">
              {#if f.user}<Avatar name={f.user.displayName} id={f.user.id} avatar={f.user.avatar} size={18} profile />
                <span class="who">{f.user.displayName}</span>{:else}<span class="who">(deleted)</span>{/if}
              <span class="dot">·</span><span class="date">{when(f.createdAt)}</span>
              <span class="dot">·</span>
              <span class="state {f.status}">{f.status === "done" ? "Resolved" : "Open"}</span>
            </div>
            <div class="text">{f.body}</div>
          </div>
          {#if isAdmin}
            <button class="status" class:on={f.status === "done"} onclick={() => toggle(f)}>
              {f.status === "done" ? "Done ✓" : "Mark done"}
            </button>
          {/if}
        </div>
      {/each}
    </section>
  </div>
</div>

<style>
  .fb {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    padding: clamp(20px, 5vh, 48px) 22px 60px;
  }
  .inner {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .head h1 {
    margin: 0 0 4px;
    font-size: 1.7rem;
    color: var(--ink);
  }
  .head p {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .compose {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  .kinds {
    display: flex;
    gap: 6px;
  }
  .ktab {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ktab.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--panel-2));
  }
  textarea {
    width: 100%;
    resize: vertical;
    padding: 10px 12px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink);
    font: inherit;
    font-size: 0.92rem;
    line-height: 1.45;
  }
  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .row-end {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }
  .count {
    font-size: 0.72rem;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
  }
  .go {
    padding: 8px 22px;
    border-radius: 9px;
    border: none;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .go:hover:not(:disabled) {
    filter: brightness(1.07);
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .note {
    margin: 0;
    font-size: 0.84rem;
  }
  .note.ok {
    color: var(--ok);
  }
  .note.err {
    color: var(--danger);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .list-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    color: var(--ink-dim);
  }
  .empty {
    margin: 0;
    padding: 14px;
    font-size: 0.85rem;
    color: var(--ink-dim);
    text-align: center;
  }
  .pill {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    letter-spacing: 0;
    font-size: 0.62rem;
    color: var(--ink-soft);
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 13px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .item.done {
    opacity: 0.6;
  }
  .badge {
    flex: none;
    font-size: 1rem;
    line-height: 1.4;
  }
  .item-body {
    flex: 1;
    min-width: 0;
  }
  .item-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    color: var(--ink-dim);
    margin-bottom: 3px;
  }
  .who {
    color: var(--ink-soft);
    font-weight: 600;
  }
  .state.open {
    color: var(--accent);
  }
  .state.done {
    color: var(--ok);
  }
  .text {
    color: var(--ink);
    font-size: 0.9rem;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .status {
    flex: none;
    padding: 5px 11px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
  }
  .status.on {
    border-color: var(--ok);
    color: var(--ok);
  }

  /* Phones: give the text the full width; the admin button drops below. */
  @media (max-width: 560px) {
    .item {
      flex-wrap: wrap;
    }
    .item-body {
      flex-basis: calc(100% - 30px);
    }
    .status {
      margin-left: auto;
    }
  }
</style>
