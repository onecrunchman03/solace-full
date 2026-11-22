<script lang="ts">
  // SOLACE SURVIVORZ — the final sounds (Admin Panel → Survivorz → Assets → Sounds): every take in the
  // sound manifest, by group, played as it ships.
  import { onDestroy, onMount } from "svelte";
  import { dropSoundCache, fetchIndex, playTake, type SurvivorzIndex } from "../assets";

  let index = $state<SurvivorzIndex | null>(null);
  let error = $state<string | null>(null);
  let filter = $state("");
  let soundError = $state<string | null>(null);
  let playing = $state("");
  let lastSource: AudioBufferSourceNode | null = null;
  let disposed = false;

  onMount(() => {
    fetchIndex()
      .then((i) => { if (!disposed) index = i; })
      .catch((e) => { if (!disposed) error = e?.code === "not_available" ? "not_available" : "failed"; });
  });

  const groups = $derived.by(() => {
    const out = new Map<string, [string, { files: { file: string }[] }][]>();
    const q = filter.trim().toLowerCase();
    for (const [id, def] of Object.entries(index?.sounds?.sounds ?? {})) {
      if (q && !id.toLowerCase().includes(q) && !def.group.toLowerCase().includes(q)) continue;
      if (!out.has(def.group)) out.set(def.group, []);
      out.get(def.group)!.push([id, def]);
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });
  const total = $derived(Object.keys(index?.sounds?.sounds ?? {}).length);

  async function hear(id: string, file: string): Promise<void> {
    soundError = null;
    stop();
    try {
      lastSource = await playTake(id, file);
      playing = `${id}/${file}`;
      lastSource.onended = () => { if (playing === `${id}/${file}`) playing = ""; };
    } catch {
      soundError = `Couldn't play ${id} / ${file}.`;
    }
  }
  function stop(): void {
    try { lastSource?.stop(); } catch { /* already ended */ }
    lastSource = null;
    playing = "";
  }

  onDestroy(() => { disposed = true; stop(); dropSoundCache(); });
</script>

<div class="sounds">
  {#if error === "not_available"}
    <p class="note">The Survivorz assets aren't on this server. They live on the workstation for now.</p>
  {:else if error}
    <p class="note err">Couldn't read the sound list.</p>
  {:else if !index}
    <p class="note">Loading…</p>
  {:else if !index.sounds}
    <p class="note">No sound manifest yet.</p>
  {:else}
    <div class="bar">
      <input placeholder="Find a sound or group" bind:value={filter} />
      <button onclick={stop} disabled={!playing}>■ Stop</button>
      <span class="note">{total} sounds</span>
      {#if soundError}<span class="note err">{soundError}</span>{/if}
    </div>
    <div class="grid">
      {#each groups as [group, list] (group)}
        <section class="card">
          <h3>{group} <span>{list.length}</span></h3>
          {#each list as [id, def] (id)}
            <div class="sound">
              <span class="sid">{id}</span>
              <span class="takes">
                {#each def.files as t, i (t.file)}
                  <button class:on={playing === `${id}/${t.file}`} onclick={() => hear(id, t.file)} title={t.file}>▶ {def.files.length > 1 ? i + 1 : ""}</button>
                {/each}
              </span>
            </div>
          {/each}
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sounds { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .bar { display: flex; gap: 10px; align-items: center; position: sticky; top: 0; background: var(--panel); padding-bottom: 6px; z-index: 1; }
  .bar input { flex: 0 1 280px; background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 9px; font: inherit; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; align-items: start; }
  .card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
  h3 { margin: 0 0 6px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); display: flex; justify-content: space-between; }
  h3 span { font-weight: 400; }
  .sound { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 0; border-top: 1px solid var(--line); }
  .sound:first-of-type { border-top: 0; }
  .sid { flex: 1 1 auto; min-width: 0; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* a sound with many takes wraps its buttons rather than widening the card */
  .takes { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
  button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; cursor: pointer; font: inherit; font-size: 0.78rem; }
  button.on { border-color: var(--accent); color: var(--accent); }
  button:disabled { opacity: 0.5; cursor: default; }
  .note { color: var(--ink-soft); margin: 0; font-size: 0.85rem; }
  .note.err { color: var(--danger); }
</style>
