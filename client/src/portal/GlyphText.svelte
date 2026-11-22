<script lang="ts">
  // A run of Eshai as the hall draws it: glyphs grouped into words, the seam
  // (') as a diamond, the proclitic (-) as a low dash, the stop as two short
  // strokes. Words split exactly as the server's tokenize() splits them, so
  // the word index a click reports is the one the server means.
  import Glyph from "./Glyph.svelte";

  const GAP = -1, SEAM = -2, CLITIC = -3, STOP = -4, PAUSE = -5, PARA = -6;

  let { tokens, glosses = [], sounds = {}, size = 20, showSounds = false, notation = false, corrupt = null, onglyph = null, onword = null }: {
    tokens: number[]; glosses?: (string | null)[]; sounds?: Record<number, string>; size?: number; showSounds?: boolean; notation?: boolean;
    /** a word to unmake for a moment (Tharvend's glyph store failing; it rebuilds from parity) */
    corrupt?: number | null;
    onglyph?: ((id: number, e: MouseEvent) => void) | null; onword?: ((word: number, piece: number, e: MouseEvent) => void) | null;
  } = $props();
  // The corrupted glyphs: wrong shapes, then the right ones again.
  let scramble = $state<number | null>(null);
  $effect(() => {
    if (corrupt === null) return;
    scramble = corrupt;
    const t = setTimeout(() => (scramble = null), 1400);
    return () => clearTimeout(t);
  });
  const wrong = (id: number, j: number) => (id >= 100 ? id : (id * 7 + j * 13 + 5) % 34);

  type Bit = { k: "g"; id: number; piece: number } | { k: "seam" } | { k: "clitic" };
  type Item = { k: "word"; ix: number; bits: Bit[] } | { k: "gap" } | { k: "stop" } | { k: "pause" } | { k: "para" };

  const items = $derived.by(() => {
    const out: Item[] = [];
    let cur: Bit[] = [], piece = 0, wix = 0, hasGlyph = false;
    const end = () => { if (hasGlyph) out.push({ k: "word", ix: wix++, bits: cur }); cur = []; piece = 0; hasGlyph = false; };
    for (const t of tokens) {
      if (t >= 0) { cur.push({ k: "g", id: t, piece }); hasGlyph = true; }
      else if (t === SEAM || t === CLITIC) { if (hasGlyph) piece++; cur.push({ k: t === SEAM ? "seam" : "clitic" }); }
      else { end(); out.push({ k: t === GAP ? "gap" : t === STOP ? "stop" : t === PAUSE ? "pause" : "para" }); }
    }
    end();
    return out;
  });
</script>

<span class="gt" class:notation style="--gs:{size}px">
  {#each items as it, i (i)}
    {#if it.k === "word"}
      <span class="w" class:known={!!glosses[it.ix]} title={glosses[it.ix] ?? undefined}>
        {#each it.bits as b, j (j)}
          {#if b.k === "g"}
            <Glyph id={scramble === it.ix ? wrong(b.id, j) : b.id} lit={b.id in sounds} sound={showSounds && scramble !== it.ix ? (sounds[b.id] ?? null) : null} {size} glitch={scramble === it.ix}
              onclick={onglyph || onword ? (e) => { if (e.shiftKey || !onword) onglyph?.(b.id, e); else onword(it.ix, b.piece, e); } : null} />
          {:else if b.k === "seam"}<span class="seam"></span>
          {:else}<span class="clit"></span>{/if}
        {/each}
      </span>
    {:else if it.k === "gap"}<span class="gap"></span>
    {:else if it.k === "stop"}<span class="stop"><i></i><i></i></span>
    {:else if it.k === "pause"}<span class="pause"></span>
    {:else}<span class="para"></span>{/if}
  {/each}
</span>

<style>
  .gt { line-height: calc(var(--gs) * 1.9); word-break: normal; }
  .w { display: inline-flex; align-items: flex-start; white-space: nowrap; border-radius: 4px; }
  .w.known { box-shadow: inset 0 -2px 0 rgba(143, 211, 255, 0.35); }
  .seam { display: inline-block; width: calc(var(--gs) * 0.22); height: calc(var(--gs) * 0.22); margin: calc(var(--gs) * 0.45) 1px 0; transform: rotate(45deg); border: 1px solid var(--p-dim, #5b5470); }
  .clit { display: inline-block; width: calc(var(--gs) * 0.35); height: 0; margin: calc(var(--gs) * 1.05) 1px 0; border-top: 1px solid var(--p-dim, #5b5470); }
  .gap { display: inline-block; width: calc(var(--gs) * 0.55); }
  .pause { display: inline-block; width: 3px; height: 3px; margin: 0 calc(var(--gs) * 0.25); border-radius: 50%; background: var(--p-dim, #5b5470); vertical-align: middle; }
  .stop { display: inline-flex; gap: 2px; margin: 0 calc(var(--gs) * 0.35); vertical-align: middle; }
  .stop i { display: block; width: 1.5px; height: calc(var(--gs) * 0.6); background: var(--p-dim, #5b5470); }
  .para { display: block; height: calc(var(--gs) * 0.6); }
  /* the fold school's notation: a second cipher over the script, set a little tighter */
  .notation .w { letter-spacing: -1px; }
</style>
