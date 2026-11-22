<script lang="ts">
  // The one "are you sure?" in the app — mounted once by App.svelte, driven by
  // lib/confirm.svelte.ts. See that file for why browser confirm() is gone.
  import { confirmUi, askArmed, answerAsk } from "../lib/confirm.svelte";

  const a = $derived(confirmUi.asking);
  const armed = $derived(askArmed());

  // Escape always answers NO. A dialog you can't dismiss with the key everyone
  // reaches for is worse than the browser box it replaced.
  // CAPTURE phase, and nothing else hears the key (Oct 2026 review): a panel
  // underneath (Page Settings) listening for Escape on the window used to
  // close as well, because this dialog had already cleared itself by then.
  function onKey(e: KeyboardEvent): void {
    if (!confirmUi.asking) return;
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      answerAsk(false);
    } else if (e.key === "Enter" && armed) {
      // Enter on a focused BUTTON is that button's own click — the native
      // behaviour. Answering yes here made Enter on "never mind" CONFIRM.
      if (e.target instanceof HTMLButtonElement) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      answerAsk(true);
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if a}
  <!-- Clicking the scrim is a "no": the same reflex as clicking outside any
       other panel here, and never an accidental yes. -->
  <div
    class="scrim"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) answerAsk(false);
    }}
  >
    <div class="panel" role="alertdialog" aria-modal="true" aria-label={a.title}>
      <h2 class:danger={a.danger}>{a.title}</h2>
      {#if a.body}<p class="body">{a.body}</p>{/if}
      {#if a.typeToConfirm}
        <label class="type">
          <span>Type <b>{a.typeToConfirm}</b> to unlock this:</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={confirmUi.typed}
            autocomplete="off"
            spellcheck="false"
            autofocus
            placeholder={a.typeToConfirm}
          />
        </label>
      {:else if a.textInput}
        <label class="type free">
          {#if a.textInput.label}<span>{a.textInput.label}</span>{/if}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={confirmUi.typed}
            autocomplete="off"
            autofocus
            maxlength={a.textInput.maxLength}
            placeholder={a.textInput.placeholder}
          />
        </label>
      {/if}
      <div class="row">
        <button class="btn ghost" onclick={() => answerAsk(false)}>never mind</button>
        <button class="btn go" class:danger={a.danger} disabled={!armed} onclick={() => answerAsk(true)}>
          {a.confirm}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Above every other panel in the app: this is asked FROM those panels
     (settings, the admin console, a page's danger zone), so it has to outrank
     them or it opens behind the thing that asked — hence --z-modal-top, one
     band above the modal floor (which itself sits above the 9990 atmosphere). */
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.62);
    display: grid;
    place-items: center;
    z-index: var(--z-modal-top, 10050);
    padding: 16px;
  }
  .panel {
    width: min(440px, 100%);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px 20px 16px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 1.05rem;
    color: var(--ink);
  }
  h2.danger {
    color: var(--danger);
  }
  .body {
    margin: 0 0 14px;
    color: var(--ink-soft);
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-line;
  }
  .type {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .type b {
    color: var(--danger);
    letter-spacing: 0.1em;
  }
  .type input {
    padding: 8px 10px;
    background: var(--bg);
    border: 1px solid var(--line-2);
    border-radius: 8px;
    color: var(--ink);
    font-family: ui-monospace, monospace;
    letter-spacing: 0.08em;
  }
  .type input:focus {
    outline: none;
    border-color: var(--danger);
  }
  /* Free-text mode is a normal sentence, not a phrase-match ritual. */
  .type.free input {
    font-family: inherit;
    letter-spacing: normal;
  }
  .type.free input:focus {
    border-color: var(--accent);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .btn {
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--line-2);
    background: var(--panel-2);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .btn.go {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .btn.go.danger {
    background: var(--danger);
    border-color: var(--danger);
    color: #2a0f0a;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
