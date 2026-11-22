<script lang="ts">
  import type { AttachmentStager } from "../lib/attach.svelte";

  // The composer's staging strip: what WILL be sent, before it's sent.
  // Nothing here has been posted yet — ✕ removes it (and its server orphan).
  const { stager }: { stager: AttachmentStager } = $props();
</script>

{#if stager.items.length}
  <div class="tray">
    {#each stager.items as it (it.key)}
      <div class="pend" class:err={it.error !== null}>
        {#if it.previewUrl}
          <img class="thumb" src={it.previewUrl} alt={it.name} />
        {:else}
          <span class="doc">📄</span>
        {/if}
        <span class="pname" title={it.name}>{it.error ?? it.name}</span>
        {#if it.id === null && it.error === null}
          <span class="spin" title="Uploading…"></span>
        {/if}
        <button class="x" title="Remove" onclick={() => stager.remove(it.key)}>✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .tray {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    margin-bottom: 0.4rem;
    background: var(--panel-2);
    border: 1px dashed var(--line);
    border-radius: 10px;
  }
  .pend {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 7px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 9px;
    max-width: 230px;
  }
  .pend.err {
    border-color: var(--danger);
  }
  .pend.err .pname {
    color: var(--danger);
  }
  .thumb {
    width: 42px;
    height: 42px;
    object-fit: cover;
    border-radius: 6px;
    flex: none;
  }
  .doc {
    font-size: 1.3rem;
    flex: none;
  }
  .pname {
    font-size: 0.74rem;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .spin {
    flex: none;
    width: 12px;
    height: 12px;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: whirl 0.8s linear infinite;
  }
  @keyframes whirl {
    to { transform: rotate(360deg); }
  }
  .x {
    flex: none;
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 2px;
  }
  .x:hover {
    color: var(--danger);
  }
</style>
