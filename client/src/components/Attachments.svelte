<script lang="ts">
  import type { Attachment } from "../lib/api";

  // Renders a message's attachments: image grid (click → lightbox), text-doc
  // cards, and "expired" tiles for files the retention sweep has purged.
  const { attachments }: { attachments: Attachment[] } = $props();

  let viewing = $state<Attachment | null>(null);

  function kb(bytes: number): string {
    return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
  }

  /** Constrain the inline size while preserving aspect (no layout shift). */
  function sized(a: Attachment): string {
    const maxW = 360;
    const maxH = 300;
    if (!a.width || !a.height) return `max-width:${maxW}px;max-height:${maxH}px`;
    const scale = Math.min(1, maxW / a.width, maxH / a.height);
    return `width:${Math.round(a.width * scale)}px;height:${Math.round(a.height * scale)}px`;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") viewing = null;
  }
</script>

<svelte:window onkeydown={viewing ? onKeydown : undefined} />

{#if attachments.length}
  <div class="atts">
    {#each attachments as a (a.id)}
      {#if a.purged}
        <div class="expired" title="This file expired and was cleaned up">
          🍂 <span>{a.kind === "text" ? "file" : "image"} expired</span>
        </div>
      {:else if a.kind === "text"}
        <a class="doc" href={`/attachments/${a.file}`} download={a.name} title="Download {a.name}">
          <span class="doc-ico">📄</span>
          <span class="doc-meta">
            <span class="doc-name">{a.name}</span>
            <span class="doc-size">{kb(a.bytes)}</span>
          </span>
        </a>
      {:else}
        <button class="imgbtn" style={sized(a)} onclick={() => (viewing = a)} title={a.name}>
          <img
            src={`/attachments/${a.file}`}
            alt={a.name}
            width={a.width ?? undefined}
            height={a.height ?? undefined}
            loading="lazy"
          />
        </button>
      {/if}
    {/each}
  </div>
{/if}

{#if viewing}
  <div class="lightbox" onclick={() => (viewing = null)} role="presentation">
    <img src={`/attachments/${viewing.file}`} alt={viewing.name} />
    <div class="lb-bar">
      <span class="lb-name">{viewing.name}</span>
      <a
        class="lb-dl"
        href={`/attachments/${viewing.file}`}
        download={viewing.name}
        onclick={(e) => e.stopPropagation()}
      >Download</a>
    </div>
  </div>
{/if}

<style>
  .atts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .imgbtn {
    display: block;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    background: var(--panel-2);
    cursor: zoom-in;
  }
  .imgbtn img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .doc {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 13px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    text-decoration: none;
    max-width: 280px;
  }
  .doc:hover {
    border-color: var(--accent);
  }
  .doc-ico {
    font-size: 1.4rem;
  }
  .doc-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .doc-name {
    color: var(--ink);
    font-size: 0.85rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .doc-size {
    color: var(--ink-dim);
    font-size: 0.72rem;
  }
  .expired {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 13px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    color: var(--ink-dim);
    font-size: 0.8rem;
    font-style: italic;
  }
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: rgba(0, 0, 0, 0.82);
    cursor: zoom-out;
    padding: 24px;
  }
  .lightbox img {
    max-width: min(92vw, 1600px);
    max-height: 84vh;
    border-radius: 8px;
    box-shadow: 0 12px 60px rgba(0, 0, 0, 0.6);
  }
  .lb-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    color: #ddd;
    font-size: 0.85rem;
  }
  .lb-name {
    max-width: 60vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lb-dl {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 4px 12px;
    border-radius: 8px;
    text-decoration: none;
  }
  .lb-dl:hover {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
