<script lang="ts">
  // THE PAPERWORK (Josh, Sep 2026): every account must accept the current
  // Terms of Service, Community Guidelines and Privacy Policy. This stands
  // between an account that hasn't (a member from before the documents
  // existed, or a version bump) and the app, exactly like SetSecretGate —
  // un-dismissable, with a way out (sign out).
  //
  // A click-wrap holds up when the person could read what they agreed to
  // right there: the documents are fetched from their public pages (one
  // source — the same HTML anyone can read at /legal/) and shown in a
  // scrollable box, with the full pages one tap away. Two explicit ticks
  // (18+, and the agreement itself) and a button. The server records the
  // acceptance with a timestamp and address.
  import { api, ApiError } from "../lib/api";
  import { logout, refreshSelf } from "../lib/session.svelte";

  let { version }: { version: number } = $props();

  type Doc = "terms" | "guidelines" | "privacy";
  const DOCS: { id: Doc; label: string; url: string }[] = [
    { id: "terms", label: "Terms of Service", url: "/legal/terms.html" },
    { id: "guidelines", label: "Community Guidelines", url: "/legal/guidelines.html" },
    { id: "privacy", label: "Privacy Policy", url: "/legal/privacy.html" },
  ];
  let doc = $state<Doc>("terms");
  const bodies = $state<Partial<Record<Doc, string>>>({});
  let loadError = $state(false);

  // Same-origin, our own static HTML: the <main> of each page, rendered in
  // the app's type. Nothing user-authored ever reaches this {@html}.
  async function load(id: Doc): Promise<void> {
    if (bodies[id]) return;
    try {
      const html = await (await fetch(DOCS.find((d) => d.id === id)!.url, { cache: "no-cache" })).text();
      const main = new DOMParser().parseFromString(html, "text/html").querySelector("main");
      bodies[id] = main?.innerHTML ?? "";
    } catch {
      loadError = true;
    }
  }
  $effect(() => { void load(doc); });

  let adult = $state(false);
  let agree = $state(false);
  let busy = $state(false);
  let error = $state("");

  async function accept(): Promise<void> {
    if (!adult || !agree || busy) return;
    busy = true;
    error = "";
    try {
      const { user } = await api.acceptTerms(version);
      refreshSelf(user);
    } catch (err) {
      error = err instanceof ApiError && err.code === "stale_version"
        ? "The documents changed while this was open — reload and read the new version."
        : "Couldn't record that. Try again.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="scrim">
  <div class="card" role="dialog" aria-modal="true" aria-label="Terms of Service">
    <h2>Before you continue</h2>
    <p class="lead">
      Solace has a Terms of Service, Community Guidelines and a Privacy Policy now. Read them,
      then agree to keep using your account. The short version of each is at the top.
    </p>

    <div class="tabs" role="tablist">
      {#each DOCS as d (d.id)}
        <button class="tab" class:on={doc === d.id} role="tab" aria-selected={doc === d.id} onclick={() => (doc = d.id)}>{d.label}</button>
      {/each}
    </div>
    <div class="doc">
      {#if bodies[doc]}
        {@html bodies[doc]}
      {:else if loadError}
        <p class="dim">Couldn't load the document here — open it in a new tab below.</p>
      {:else}
        <p class="dim">Loading…</p>
      {/if}
    </div>
    <p class="open">
      Open in a new tab:
      {#each DOCS as d, i (d.id)}
        <a href={d.url} target="_blank" rel="noopener">{d.label}</a>{i < DOCS.length - 1 ? " · " : ""}
      {/each}
    </p>

    <label class="tick">
      <input type="checkbox" bind:checked={adult} />
      <span>I am 18 or older.</span>
    </label>
    <label class="tick">
      <input type="checkbox" bind:checked={agree} />
      <span>I have read and agree to the Terms of Service, Community Guidelines and Privacy Policy (version {version}).</span>
    </label>

    {#if error}<p class="error">{error}</p>{/if}

    <div class="actions">
      <button class="ghost" onclick={() => void logout()}>Sign out</button>
      <button class="go" disabled={!adult || !agree || busy} onclick={accept}>{busy ? "…" : "Agree & continue"}</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-modal, 10000) + 1); /* over the secret gate if both are due */
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(3px);
  }
  .card {
    width: 100%;
    max-width: 560px;
    max-height: calc(100dvh - 2rem);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1.5rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
    color: var(--ink);
  }
  .lead {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.45;
    color: var(--ink-soft);
  }
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tab {
    padding: 6px 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .tab.on {
    border-color: var(--accent);
    color: var(--ink);
  }
  .doc {
    flex: 1;
    min-height: 160px;
    max-height: 38vh;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--ink);
  }
  .doc :global(h1) { font-size: 1.1rem; margin: 0 0 4px; }
  .doc :global(h2) { font-size: 0.95rem; margin: 16px 0 6px; }
  .doc :global(h3) { font-size: 0.88rem; margin: 12px 0 4px; }
  .doc :global(p) { margin: 0 0 8px; }
  .doc :global(ul), .doc :global(ol) { margin: 0 0 8px; padding-left: 20px; }
  .doc :global(li) { margin-bottom: 4px; }
  .doc :global(.meta) { color: var(--ink-dim); font-size: 0.78rem; margin-bottom: 12px; }
  .doc :global(.plain), .doc :global(.note) {
    padding: 8px 10px;
    margin: 0 0 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink-soft);
  }
  .doc :global(a) { color: var(--accent); }
  .doc :global(b), .doc :global(strong) { color: var(--ink); }
  .dim {
    color: var(--ink-dim);
  }
  .open {
    margin: 0;
    font-size: 0.76rem;
    color: var(--ink-dim);
  }
  .open a {
    color: var(--accent);
  }
  .tick {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    font-size: 0.86rem;
    line-height: 1.4;
    color: var(--ink);
    cursor: pointer;
  }
  .tick input {
    margin-top: 3px;
    accent-color: var(--accent);
    flex: none;
  }
  /* ON A PHONE THESE TWO TICKS ARE THE FIRST THING ANYONE TOUCHES, and they
     are the click-wrap itself — the record that this person agreed. They
     shipped at 13x13 inside a 19px row, which is a third of the touch floor
     on the one screen where a mis-tap is most likely: a brand-new account,
     on a strange interface, reaching for the only control that opens it.
     The box scales up and the whole ROW becomes the target (the label
     already wraps the input, so the text has always been tappable — it was
     just too short to hit). Padding rather than min-height so the two-line
     second tick stays snug against the first. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .tick {
      align-items: center;
      gap: 0.7rem;
      padding: 7px 0;
      min-height: 44px;
    }
    .tick input {
      margin-top: 0;
      width: 22px;
      height: 22px;
    }
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }
  .go,
  .ghost {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    font: inherit;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .go {
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ghost {
    background: none;
    border: 1px solid var(--line);
    color: var(--ink-soft);
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .scrim {
      padding: 0;
      align-items: stretch;
    }
    .card {
      max-width: none;
      max-height: none;
      height: 100dvh;
      border: none;
      border-radius: 0;
      padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
    }
    .doc {
      max-height: none;
    }
  }
</style>
