<script lang="ts">
  // WHAT THEY THINK OF EACH OTHER, for a cast of a hundred (Josh, Nov 3 2026): only the people this
  // character has feelings about are listed, both directions side by side; search to add anybody
  // else. Blank is a stranger. cur.regard is what THEY think; regardIn is what the others think of
  // them (saved into the others' files, as before).
  import type { CastCharacter } from "../lib/api";

  let { cur = $bindable(), regardIn = $bindable(), others }: {
    cur: CastCharacter;
    regardIn: Record<string, number | null>;
    others: CastCharacter[];
  } = $props();

  let q = $state("");
  // added this session but not set yet: shown so the sliders can be moved
  let pinned = $state<string[]>([]);
  // (per character: the last one's pins used to follow to the next)
  $effect(() => { void cur.id; pinned = []; });

  const set = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  const rows = $derived(
    others
      .filter((o) => set(cur.regard[o.id]) || set(regardIn[o.id]) || pinned.includes(o.id))
      .sort((a, b) => Math.abs(cur.regard[b.id] ?? 0) + Math.abs(regardIn[b.id] ?? 0) - (Math.abs(cur.regard[a.id] ?? 0) + Math.abs(regardIn[a.id] ?? 0))),
  );
  const matches = $derived.by(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return others
      .filter((o) => !rows.includes(o))
      .filter((o) => o.name.toLowerCase().includes(s) || o.short.toLowerCase().includes(s) || o.id.includes(s) || o.tag.toLowerCase().includes(s))
      .slice(0, 8);
  });

  const word = (v: number | null | undefined): string =>
    !set(v) ? "stranger" : v >= 60 ? "would die for them" : v >= 35 ? "likes a lot" : v >= 15 ? "likes" : v >= -10 ? "unsure" : v >= -35 ? "doesn't trust" : "can't stand";
  const tone = (v: number | null | undefined): string => (!set(v) ? "none" : v >= 15 ? "good" : v >= -10 ? "mid" : "bad");

  function add(id: string): void {
    if (!pinned.includes(id)) pinned = [...pinned, id];
    q = "";
  }
  function setMine(id: string, v: number | null): void {
    if (v === null) delete cur.regard[id]; else cur.regard[id] = v;
  }
  function setTheirs(id: string, v: number | null): void {
    regardIn[id] = v;
  }
  function forget(id: string): void {
    setMine(id, null);
    setTheirs(id, null);
    pinned = pinned.filter((x) => x !== id);
  }
  const me = $derived(cur.short || cur.name || "They");
</script>

<div class="rel">
  <div class="find">
    <input type="search" placeholder="Add someone: search by name, nickname or tag…" bind:value={q} aria-label="Find a character" />
    {#if matches.length}
      <ul class="hits">
        {#each matches as o (o.id)}
          <li><button onclick={() => add(o.id)}><b>{o.name}</b> <span>{o.tag}</span></button></li>
        {/each}
      </ul>
    {/if}
  </div>
  <p class="soft">{rows.length ? `${rows.length} of ${others.length} people` : `Strangers to all ${others.length}.`} Everyone not listed is a stranger.</p>

  {#each rows as o (o.id)}
    {@const mine = cur.regard[o.id]}
    {@const theirs = regardIn[o.id]}
    <div class="row">
      <div class="who"><b>{o.name}</b><span>{o.tag}</span></div>
      <label class="dir {tone(mine)}">
        <span class="lbl">{me} → {o.short}</span>
        <input type="range" min="-100" max="100" step="5" value={set(mine) ? mine : 0} class:blank={!set(mine)} oninput={(e) => setMine(o.id, Number(e.currentTarget.value))} />
        <span class="val">{set(mine) ? mine : "—"} <i>{word(mine)}</i></span>
        {#if set(mine)}<button class="x" title="Back to strangers" onclick={() => setMine(o.id, null)}>✕</button>{/if}
      </label>
      <label class="dir {tone(theirs)}">
        <span class="lbl">{o.short} → {me}</span>
        <input type="range" min="-100" max="100" step="5" value={set(theirs) ? theirs : 0} class:blank={!set(theirs)} oninput={(e) => setTheirs(o.id, Number(e.currentTarget.value))} />
        <span class="val">{set(theirs) ? theirs : "—"} <i>{word(theirs)}</i></span>
        {#if set(theirs)}<button class="x" title="Back to strangers" onclick={() => setTheirs(o.id, null)}>✕</button>{/if}
      </label>
      <button class="forget" title="Remove both" onclick={() => forget(o.id)}>Remove</button>
    </div>
  {/each}
</div>

<style>
  .rel { display: flex; flex-direction: column; gap: 8px; }
  .find { position: relative; }
  .find input { width: 100%; box-sizing: border-box; padding: 8px 10px; }
  .hits { position: absolute; z-index: 3; left: 0; right: 0; margin: 2px 0 0; padding: 4px; list-style: none; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); }
  .hits button { width: 100%; text-align: left; background: none; border: none; padding: 6px 8px; border-radius: 6px; color: var(--ink); cursor: pointer; font: inherit; }
  .hits button:hover { background: var(--panel-2); }
  .hits span { color: var(--ink-dim); font-size: 0.78rem; }
  .soft { margin: 0; color: var(--ink-dim); font-size: 0.76rem; }
  .row { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(200px, 1.4fr) minmax(200px, 1.4fr) auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .who b { color: var(--ink); font-size: 0.86rem; }
  .who span { color: var(--ink-dim); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dir { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 1px 6px; align-items: center; font-size: 0.72rem; color: var(--ink-dim); }
  .dir .lbl { grid-column: 1 / -1; }
  .dir input { width: 100%; accent-color: var(--accent); }
  .dir input.blank { opacity: 0.35; }
  .dir.good input { accent-color: #6fbf73; }
  .dir.bad input { accent-color: #d9604f; }
  .val { color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .val i { color: var(--ink-dim); font-style: normal; }
  .x { position: absolute; opacity: 0; pointer-events: none; }
  .dir { position: relative; }
  .dir:hover .x { opacity: 1; pointer-events: auto; right: 0; top: 0; border: none; background: none; color: var(--ink-dim); cursor: pointer; padding: 0 2px; }
  .forget { padding: 4px 9px; border-radius: 7px; border: 1px solid var(--line); background: none; color: var(--ink-dim); font: inherit; font-size: 0.72rem; cursor: pointer; }
  .forget:hover { color: var(--danger); border-color: var(--danger); }
  @media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
</style>
