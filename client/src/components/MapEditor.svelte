<script lang="ts">
  // THE MAP EDITOR's frame: a full-screen workspace over the Admin Panel (a
  // paint program needs the whole window). The editor itself is plain DOM +
  // canvas in lib-free TypeScript (client/src/mapeditor/editor.ts) and is
  // loaded only when opened — it brings three.js and the prop catalogue.
  import { onMount } from "svelte";
  import { ask } from "../lib/confirm.svelte";
  import { brTest } from "../lib/brtest.svelte";
  import { go } from "../lib/nav.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let host: HTMLDivElement;
  let failed = $state("");
  // which level is open: the Poolrooms first (the editor's header switches)
  let level = $state(1);

  onMount(() => {
    let dispose: (() => void) | null = null;
    let gone = false;
    let mod: typeof import("../mapeditor/editor") | null = null;
    const mount = (): void => {
      dispose?.();
      dispose = mod!.mountMapEditor(host, {
        ask,
        onClose: onclose,
        onLevel: (n) => {
          level = n;
          mount();
        },
        // Test play started: over to the Backrooms, that level's loadout open
        onPlaytest: (n) => {
          brTest.level = n as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
          onclose();
          go("backrooms");
        },
      }, level);
    };
    import("../mapeditor/editor")
      .then((m) => {
        if (gone) return; // closed before it finished loading
        mod = m;
        mount();
      })
      .catch((e) => (failed = String(e?.message ?? e)));
    return () => {
      gone = true;
      dispose?.();
    };
  });
</script>

<div class="takeover">
  <!-- the editor owns this node's contents outright (it sets innerHTML), so
       nothing of Svelte's may live inside it -->
  <div class="mount" bind:this={host}></div>
  {#if failed}
    <div class="fail">
      <p>The map editor didn't load: {failed}</p>
      <button onclick={onclose}>Back to the Admin Panel</button>
    </div>
  {/if}
</div>

<style>
  .takeover {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: var(--bg);
  }
  .mount {
    position: absolute;
    inset: 0;
  }
  .fail {
    position: relative;
    padding: 40px;
    color: var(--ink);
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
</style>
