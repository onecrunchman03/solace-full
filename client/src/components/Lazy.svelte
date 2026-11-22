<script lang="ts">
  import type { Component } from "svelte";

  // A code-split mount point. `load` is a `() => import("./X.svelte")` thunk,
  // so Vite carves X — and everything only X reaches — into its own chunk,
  // fetched on first visit and then held by the browser forever (the /assets
  // cache policy is immutable). Only for PROP-LESS views; anything needing
  // props stays a static import.
  let { load }: { load: () => Promise<{ default: Component }> } = $props();
</script>

{#await load()}
  <!-- Fades in after a beat so a warm-cache load never flashes a spinner. -->
  <div class="lazy-wait">Loading…</div>
{:then Mod}
  {@const View = Mod.default}
  <View />
{:catch}
  <!-- main.ts's vite:preloadError handler reloads onto a fresh deploy first;
       this only shows if that already fired recently (i.e. a real outage). -->
  <div class="lazy-wait err">Couldn't load this view — check your connection and try again.</div>
{/await}

<style>
  .lazy-wait {
    height: 100%;
    min-height: 200px;
    display: grid;
    place-items: center;
    color: var(--ink-dim);
    font-size: 0.9rem;
    opacity: 0;
    animation: lazy-in 0.2s ease 0.35s forwards;
  }
  @keyframes lazy-in {
    to {
      opacity: 1;
    }
  }
  .lazy-wait.err {
    opacity: 1;
    animation: none;
    color: var(--danger);
  }
</style>
