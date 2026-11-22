<script module lang="ts">
  // Unique gradient ids per instance so multiple coins on a page don't collide.
  let seq = 0;
</script>

<script lang="ts">
  let { size = 20, title = "" }: { size?: number; title?: string } = $props();
  const id = `coin${seq++}`;
</script>

<svg
  class="coin"
  width={size}
  height={size}
  viewBox="0 0 100 100"
  role="img"
  aria-label={title || "silver coin"}
>
  <defs>
    <radialGradient id={`${id}-f`} cx="38%" cy="33%" r="75%">
      <stop offset="0%" stop-color="#f7fafc" />
      <stop offset="40%" stop-color="#d4dce3" />
      <stop offset="72%" stop-color="#a6b0ba" />
      <stop offset="100%" stop-color="#7d8893" />
    </radialGradient>
    <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f1f5f8" />
      <stop offset="100%" stop-color="#939da7" />
    </linearGradient>
    <radialGradient id={`${id}-e`} cx="44%" cy="32%" r="72%">
      <stop offset="0%" stop-color="#949ea9" />
      <stop offset="100%" stop-color="#586470" />
    </radialGradient>
  </defs>

  <!-- edge shadow -->
  <circle cx="50" cy="50" r="49" fill="#5b636d" />
  <!-- milled (reeded) edge -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#727c87" stroke-width="4.2" stroke-dasharray="1.6 1.9" />
  <!-- struck face -->
  <circle cx="50" cy="50" r="45.5" fill={`url(#${id}-f)`} stroke={`url(#${id}-r)`} stroke-width="2.2" />
  <!-- ancient beaded border -->
  <circle
    cx="50"
    cy="50"
    r="40"
    fill="none"
    stroke="#69737e"
    stroke-width="1.7"
    stroke-dasharray="0.1 3.4"
    stroke-linecap="round"
    opacity="0.55"
  />
  <!-- foundry anvil emblem -->
  <g fill={`url(#${id}-e)`} stroke="#4f5862" stroke-width="0.5" stroke-linejoin="round">
    <polygon points="40,43 40,48.5 27,45.7" />
    <rect x="40" y="41.5" width="28" height="7" rx="1.8" />
    <rect x="50" y="48.5" width="8" height="4.4" />
    <polygon points="43,52.9 65,52.9 68,58.5 40,58.5" />
  </g>
  <!-- glare -->
  <ellipse cx="39" cy="33" rx="17" ry="9" fill="#ffffff" opacity="0.3" transform="rotate(-26 39 33)" />
</svg>

<style>
  .coin {
    display: inline-block;
    vertical-align: middle;
    flex: none;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  }
</style>
