<script lang="ts">
  // Admin Panel → Characters: the Survivorz character creator (client/src/creator/Creator.svelte),
  // which can also pop out into a window of its own (main.ts #creator).
  import Creator from "../creator/Creator.svelte";
</script>

<div class="cast-page"><Creator /></div>

<style>
  .cast-page { height: calc(100vh - 80px); min-height: 560px; }
</style>
