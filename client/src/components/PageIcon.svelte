<script lang="ts">
  // A page's icon: the uploaded image if it has one, otherwise a tile of its
  // initials tinted deterministically from its id — the Avatar rule, so a page
  // with no picture still reads as itself at a glance. A broken image file
  // (purged, missing after a restore) falls back to the initials tile instead
  // of the browser's broken-image glyph.
  import type { PageDTO } from "../lib/api";

  let { page, size = 40 }: { page: PageDTO; size?: number } = $props();

  let broken = $state(false);
  // A new icon upload gets a fresh chance even if the old file 404'd — but
  // only an actually-different FILE resets the flag: page frames clone the
  // page object, and resetting on identity alone re-404'd a missing icon on
  // every frame.
  let lastIcon: string | null = null;
  $effect(() => {
    if (page.icon !== lastIcon) {
      lastIcon = page.icon;
      broken = false;
    }
  });

  const initials = $derived(
    page.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?",
  );
  // Stable hue per page, so it never shuffles between sessions.
  const hue = $derived((page.id * 47) % 360);
</script>

{#if page.icon && !broken}
  <img
    class="icon"
    src={`/pageicons/${page.icon}`}
    alt=""
    loading="lazy"
    onerror={() => (broken = true)}
    style={`width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.26)}px`}
  />
{:else}
  <span
    class="icon fallback"
    style={`width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.26)}px;
            font-size:${Math.round(size * 0.36)}px;
            background:hsl(${hue} 32% 26%);color:hsl(${hue} 65% 82%)`}
  >{initials}</span>
{/if}

<style>
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    object-fit: cover;
    border: 1px solid var(--line);
    font-weight: 700;
    letter-spacing: 0.02em;
    user-select: none;
  }
</style>
