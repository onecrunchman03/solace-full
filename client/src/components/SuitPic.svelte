<script lang="ts">
  // A suit, as it actually looks: the rendered model in this colorway once
  // the portrait exists, the recoloured store photo until then. Used by the
  // VIP Room, Threshold-4, the lockers, the loadout and the casino door —
  // one picture everywhere a suit is shown.
  import { suitPics, requestSuitPic } from "../lib/suitpic.svelte";
  import { suitFilter } from "../backrooms/suitcolor";

  let { color = "yellow", alt = "", size = 56, cls = "" }: { color?: string | null; alt?: string; size?: number; cls?: string } = $props();
  const key = $derived(color || "yellow");
  $effect(() => requestSuitPic(key));
  const src = $derived(suitPics[key]);
</script>

{#if src}
  <img class="suitpic {cls}" src={src} {alt} style="width:{size}px;height:{size}px" />
{:else}
  <img class="suitpic {cls}" src="/assets/gear/suit.png" {alt} style="width:{size}px;height:{size}px;filter:{suitFilter(key)}" />
{/if}

<style>
  .suitpic {
    object-fit: contain;
    border-radius: 6px;
    background: rgba(90, 88, 84, 0.14);
    flex-shrink: 0;
  }
</style>
