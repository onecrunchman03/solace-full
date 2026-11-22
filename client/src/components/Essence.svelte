<script lang="ts">
  // EMOJI ESSENCE — the Forge's material. A drop of violet fire in a glass
  // bead: flat fills, no defs (the GameIcon rule), so it can sit inline in
  // a sentence at 12px or on a chip at 18px.
  let { size = 16 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="essence" style="vertical-align:-0.15em">
  <path d="M12 2c3.2 4.4 7 7.6 7 12a7 7 0 0 1-14 0c0-4.4 3.8-7.6 7-12z" fill="#7d3fd6" />
  <path d="M12 2c3.2 4.4 7 7.6 7 12a7 7 0 0 1-7 7z" fill="#5a2aa3" />
  <path d="M12 8.5c1.8 2.4 3.8 4.2 3.8 6.5a3.8 3.8 0 0 1-7.6 0c0-2.3 2-4.1 3.8-6.5z" fill="#c98bff" />
  <circle cx="9.6" cy="12.6" r="1.4" fill="#f4e6ff" opacity="0.9" />
</svg>

<style>
  .essence { display: inline-block; filter: drop-shadow(0 0 3px rgba(179, 107, 255, 0.55)); }
</style>
