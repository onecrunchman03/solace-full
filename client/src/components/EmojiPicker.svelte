<script lang="ts">
  import { emoji } from "../lib/emoji.svelte";
  import { phone } from "../lib/phone.svelte";

  let {
    onpick,
    onclose,
    placement = "up",
    align = "left",
  }: {
    onpick: (code: string) => void;
    onclose: () => void;
    placement?: "up" | "down";
    align?: "left" | "right";
  } = $props();

  // Recently used — the common case is re-sending the same few emoji, so they
  // sit at the top of the picker. Persisted per-browser.
  const RECENT_KEY = "solace_emoji_recent";
  const RECENT_MAX = 12;
  function readRecent(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      return Array.isArray(v) ? v.filter((c) => typeof c === "string") : [];
    } catch {
      return [];
    }
  }
  let recent = $state(readRecent());
  function pick(code: string): void {
    recent = [code, ...recent.filter((c) => c !== code)].slice(0, RECENT_MAX);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* storage full/blocked — recents just won't persist */
    }
    onpick(code);
  }

  let q = $state("");
  let tierFilter = $state<string | null>(null);

  const TIER_ORDER = ["common", "rare", "legendary", "mythic", "special"];
  const TIER_COLOR: Record<string, string> = {
    common: "#7cae5f",
    rare: "#9d63d2",
    legendary: "#f39620",
    mythic: "#ff5db1",
    special: "#42c1c4",
  };

  const owned = $derived(emoji.owned);
  /** Only offer tier chips for tiers you actually own something in. */
  const tiers = $derived(TIER_ORDER.filter((t) => owned.some((e) => e.tier === t)));
  const filtered = $derived.by(() => {
    const s = q.trim().toLowerCase();
    let list = owned;
    if (tierFilter) list = list.filter((e) => e.tier === tierFilter);
    if (s) list = list.filter((e) => e.name.toLowerCase().includes(s) || e.code.includes(s));
    return list;
  });
  const recentOwned = $derived(
    recent.map((c) => owned.find((e) => e.code === c)).filter((e) => e !== undefined),
  );
  const showRecent = $derived(!q.trim() && !tierFilter && recentOwned.length > 0);

  function onkey(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      onclose();
    } else if (ev.key === "Enter" && filtered.length > 0) {
      // Type a few letters, hit Enter — no mouse needed.
      ev.preventDefault();
      pick(filtered[0].code);
    }
  }

  /** Autofocus the search box the moment the picker opens — on a desktop. A
   *  phone would answer the focus with its keyboard, over the grid you came
   *  to tap; there the search box waits until it's asked. */
  function focusNow(el: HTMLInputElement): void {
    if (!phone.on) el.focus();
  }

  /** Position the panel FIXED next to its anchor, flipped + clamped so it can
   *  never clip against the chat's scroll container or the viewport edges
   *  (an absolute panel inside an overflow container gets cut off for
   *  messages near the top/bottom). */
  function place(el: HTMLDivElement): void {
    const anchor = el.parentElement;
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    el.style.position = "fixed";
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = align === "right" ? a.right - w : a.left;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    let y = placement === "up" ? a.top - h - 6 : a.bottom + 6;
    if (y < 8) y = a.bottom + 6; // no room above — open downward
    if (y + h > window.innerHeight - 8) y = a.top - h - 6; // no room below — up
    y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.bottom = "auto";
    el.style.right = "auto";
  }
</script>

<div class="scrim" onclick={onclose} role="presentation"></div>
<div class="panel {placement} {align}" use:place onkeydown={onkey} role="dialog" aria-label="Pick an emoji" tabindex="-1">
  <input class="search" placeholder="Search — Enter picks the first match" bind:value={q} use:focusNow />

  {#if tiers.length > 1}
    <div class="chips">
      <button class="chip" class:on={tierFilter === null} onclick={() => (tierFilter = null)}>All</button>
      {#each tiers as t (t)}
        <button
          class="chip"
          class:on={tierFilter === t}
          style="--tc:{TIER_COLOR[t]}"
          onclick={() => (tierFilter = tierFilter === t ? null : t)}
        >
          <span class="dot"></span>{t}
        </button>
      {/each}
    </div>
  {/if}

  {#if owned.length === 0}
    <p class="none">You don't own any emoji yet — win some on the Wheel of Fortune!</p>
  {:else if filtered.length === 0}
    <p class="none">No matches.</p>
  {:else}
    <div class="scroller">
      {#if showRecent}
        <div class="sect">Recent</div>
        <div class="grid">
          {#each recentOwned as e (e.code)}
            <button class="cell" title={`${e.name} (${e.tier})`} onclick={() => pick(e.code)}>
              <img src={`/emoji/${e.file}`} alt={e.name} loading="lazy" />
            </button>
          {/each}
        </div>
        <div class="sect">All yours</div>
      {/if}
      <div class="grid">
        {#each filtered as e (e.code)}
          <button class="cell" class:first={q.trim() !== "" && e === filtered[0]} title={`${e.name} (${e.tier})`} onclick={() => pick(e.code)}>
            <img src={`/emoji/${e.file}`} alt={e.name} loading="lazy" />
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .panel {
    position: absolute;
    z-index: 41;
    width: 324px;
    max-width: 84vw;
    padding: 8px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  }
  /* PHONE MODE: the picker spans the screen (the fixed placement clamps it
     8px from either edge) — a 324px box on a 390px phone wasted a column of
     emoji cells. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .panel {
      width: calc(100vw - 16px);
      max-width: none;
    }
  }
  .panel.up {
    bottom: calc(100% + 6px);
  }
  .panel.down {
    top: calc(100% + 6px);
  }
  .panel.left {
    left: 0;
  }
  .panel.right {
    right: 0;
  }
  .search {
    width: 100%;
    padding: 7px 9px;
    margin-bottom: 7px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
  }
  .search:focus {
    outline: none;
    border-color: var(--accent);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 7px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: capitalize;
    cursor: pointer;
  }
  .chip .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--tc);
  }
  .chip:hover {
    color: var(--ink);
    border-color: var(--line-2);
  }
  .chip.on {
    border-color: var(--tc, var(--accent));
    color: var(--ink);
    background: var(--panel-2);
  }
  .scroller {
    max-height: 252px;
    overflow-y: auto;
  }
  .sect {
    margin: 2px 2px 4px;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .sect + .grid {
    margin-bottom: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
  }
  .cell {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    padding: 3px;
    background: none;
    border: 1px solid transparent;
    border-radius: 7px;
    cursor: pointer;
  }
  .cell:hover {
    background: var(--panel-2);
    border-color: var(--line);
  }
  /* The Enter-key target while searching, so you can see what Enter will pick. */
  .cell.first {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .cell img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .none {
    margin: 8px 6px;
    color: var(--ink-dim);
    font-size: 0.82rem;
    line-height: 1.4;
  }
</style>
