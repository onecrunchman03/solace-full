<script lang="ts">
  // One mark of the Eshai script, by opaque id (or a status sign / the count
  // mark). A cracked glyph is lit and may carry its sound beneath; a locked
  // one is drawn dim. The shapes are the signed-off sheet (glyph-strokes.ts).
  // Ids from NOTATION_BASE up are marks of the fold school's notation.
  import { STROKES, type Part } from "./glyph-strokes";
  import { NOTATION_BASE, NOTATION_STROKES } from "./notation-strokes";

  let { id = -1, parts = null, lit = false, sound = null, size = 22, onclick = null, glitch = false }: {
    id?: number; parts?: Part[] | null; lit?: boolean; sound?: string | null; size?: number;
    onclick?: ((e: MouseEvent) => void) | null; glitch?: boolean;
  } = $props();
  const nota = $derived(id >= NOTATION_BASE);
  const shape = $derived(parts ?? (nota ? NOTATION_STROKES[id - NOTATION_BASE] : STROKES[id]) ?? []);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class="g" class:lit class:nota class:glitch class:click={!!onclick} style="--s:{size}px" onclick={onclick ?? undefined} role={onclick ? "button" : undefined} tabindex={onclick ? 0 : undefined}
  onkeydown={onclick ? (e) => { if (e.key === "Enter") onclick?.(e as unknown as MouseEvent); } : undefined}>
  <svg viewBox="0 0 100 112" aria-hidden="true">
    {#each shape as p, i (i)}
      {#if p[0] === "p"}
        <path d={p[1]} />
      {:else if p[0] === "c"}
        <circle cx={p[1]} cy={p[2]} r={p[3]} />
      {:else}
        <circle class="dot" cx={p[1]} cy={p[2]} r="5.5" />
      {/if}
    {/each}
  </svg>
  {#if sound}<span class="snd">{sound}</span>{/if}
</span>

<style>
  .g {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    width: var(--s);
    color: var(--p-dim, #5b5470);
    vertical-align: middle;
  }
  .g.lit { color: var(--p-lit, #bfe9ff); }
  .g.nota { color: var(--p-nota, #8a7a5c); }
  .g.click { cursor: pointer; border-radius: 4px; }
  .g.click:hover { background: rgba(160, 120, 255, 0.12); }
  svg { width: var(--s); height: calc(var(--s) * 1.12); overflow: visible; }
  path, circle { fill: none; stroke: currentColor; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }
  circle.dot { fill: currentColor; stroke: none; }
  .snd { font: 600 calc(var(--s) * 0.42) / 1 ui-monospace, monospace; color: var(--p-snd, #8fd3ff); opacity: 0.8; margin-top: 1px; }
  .glitch { animation: unmake 0.9s steps(3) 1; }
  @keyframes unmake { 0% { transform: translateX(0); opacity: 1; } 33% { transform: translateX(-2px) skewX(12deg); opacity: 0.4; } 66% { transform: translateX(2px); opacity: 0.8; } 100% { transform: none; opacity: 1; } }
</style>
