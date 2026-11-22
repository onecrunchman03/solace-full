<script lang="ts">
  // THE SHOW IN ITS OWN WINDOW (Josh, Nov 3 2026: "a pop out window to the survivors show so it doesnt
  // take the screen"): `#survivorz-watch`, mounted by main.ts. The director's cut as members see it, the
  // whole window, nothing else; double-click for full screen. It signs in with the session the main
  // window stored (same origin, same storage). Leaving closes the window.
  import Show from "./Show.svelte";

  document.title = "Solace Survivorz";
  function fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }
</script>

<div class="pop" ondblclick={fullscreen} role="presentation">
  <Show watch onExit={() => window.close()} />
</div>

<style>
  :global(html), :global(body) { margin: 0; height: 100%; background: #000; overflow: hidden; }
  .pop { position: fixed; inset: 0; background: #000; }
</style>
