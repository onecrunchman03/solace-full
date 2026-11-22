<script lang="ts">
  // SOLACE SURVIVORZ — THE LINEUP (the control room's stage 3; docs/survivorz/CONTROL-ROOM.md). Who starts, the
  // bench in order, and the largest starting group; the bench fills any empty seats, in order (Josh, Nov 3 2026:
  // "Fills empty seats"). Nothing here changes by itself between runs. Saved presets keep a lineup under a name.
  // Kept on the server (routes/survivorz-show.ts → app_kv); every change saves.
  import { sessionHeaders } from "../assets";

  interface Char { id: string; name: string; tag: string; status: "cast" | "bench" }
  interface Lineup { starters: string[]; bench: string[]; maxGroup: number }
  interface Preset extends Lineup { name: string }

  let { characters, seats, onCast }: { characters: Char[]; seats: number; onCast: (cast: string[]) => void } = $props();

  let lineup = $state<Lineup | null>(null);
  let presets = $state<Preset[]>([]);
  let maxSeats = $state(6);
  let err = $state("");
  let presetName = $state("");
  let pickPreset = $state("");

  const name = (id: string): string => characters.find((c) => c.id === id)?.name ?? id;
  const tag = (id: string): string => characters.find((c) => c.id === id)?.tag ?? "";
  const seatCap = $derived(Math.max(1, Math.min(maxSeats, seats, characters.length)));
  const group = $derived(lineup ? Math.min(lineup.maxGroup, seatCap) : 0);
  /** who the next run starts with: the starters, then the bench in order, up to the group */
  const next = $derived(lineup ? [...lineup.starters, ...lineup.bench].slice(0, group) : []);
  const fromBench = $derived(lineup ? next.filter((id) => !lineup!.starters.includes(id)) : []);
  const outside = $derived(lineup ? characters.filter((c) => !lineup!.starters.includes(c.id) && !lineup!.bench.includes(c.id)) : []);

  $effect(() => { onCast([...next]); });

  const post = (path: string, body: unknown) =>
    fetch(path, { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify(body) });
  function take(j: { lineup: Lineup; maxSeats: number; presets: Preset[] }): void {
    lineup = j.lineup; maxSeats = j.maxSeats; presets = j.presets;
  }
  async function load(): Promise<void> {
    const mine = ++saving;   // (a save still in the air mustn't land on top of this reading)
    try {
      const r = await fetch("/api/admin/survivorz/lineup", { headers: sessionHeaders() });
      if (mine !== saving) return;
      if (r.ok) take(await r.json());
      else err = `couldn't load the lineup (${r.status})`;
    } catch (e) { err = String((e as Error)?.message ?? e); }
  }
  // WHO'S IN THE SHOW CHANGED (the cast above: Cast · Bench · Off): the server's lineup has already let go of
  // anybody turned Off, so read it again — kept as it was, the next run was offered somebody who'd left, and
  // Start was refused "that cast doesn't fit the map"
  let castKey = "";
  $effect(() => {
    const key = characters.map((c) => c.id).join(",");
    if (key === castKey) return;
    castKey = key;
    void load();
  });

  // every change saves (the latest one wins)
  let saving = 0;   // (load() bumps it too: a reading and a save never land on top of each other)
  async function save(l: Lineup): Promise<void> {
    lineup = l;
    const mine = ++saving;
    try {
      const r = await post("/api/admin/survivorz/lineup", l);
      const j = await r.json().catch(() => null);
      if (mine !== saving) return;
      if (!r.ok) { err = j?.error === "bad_lineup" ? "that lineup doesn't fit" : `not saved (${r.status})`; return; }
      err = ""; take(j);
    } catch (e) { err = String((e as Error)?.message ?? e); }
  }
  const copy = (l: Lineup): Lineup => ({ starters: [...l.starters], bench: [...l.bench], maxGroup: l.maxGroup });
  function move(list: "starters" | "bench", i: number, by: number): void {
    if (!lineup) return;
    const l = copy(lineup), a = l[list], j = i + by;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    void save(l);
  }
  function toBench(id: string): void {
    if (!lineup) return;
    const l = copy(lineup);
    l.starters = l.starters.filter((x) => x !== id);
    l.bench = [id, ...l.bench.filter((x) => x !== id)];
    void save(l);
  }
  function toStarters(id: string): void {
    if (!lineup || lineup.starters.length >= seatCap) return;
    const l = copy(lineup);
    // a full group grows by one to take them (greyed out instead, the button read as broken with a group of 1)
    if (l.starters.length >= group) l.maxGroup = l.starters.length + 1;
    l.bench = l.bench.filter((x) => x !== id);
    l.starters = [...l.starters.filter((x) => x !== id), id];
    void save(l);
  }
  function addBench(id: string): void {
    if (!lineup) return;
    const l = copy(lineup);
    l.bench = [...l.bench.filter((x) => x !== id), id];
    void save(l);
  }
  function drop(id: string): void {
    if (!lineup) return;
    const l = copy(lineup);
    l.starters = l.starters.filter((x) => x !== id);
    l.bench = l.bench.filter((x) => x !== id);
    void save(l);
  }
  function setGroup(n: number): void {
    if (!lineup) return;
    const l = copy(lineup);
    l.maxGroup = Math.max(1, Math.min(seatCap, n));
    // starters past the new group step down to the front of the bench, in order
    if (l.starters.length > l.maxGroup) { l.bench = [...l.starters.slice(l.maxGroup), ...l.bench]; l.starters = l.starters.slice(0, l.maxGroup); }
    void save(l);
  }

  async function preset(op: "save" | "use" | "delete", nm: string): Promise<void> {
    if (!nm.trim()) { err = "give the preset a name"; return; }
    try {
      const r = await post("/api/admin/survivorz/lineup/preset", { op, name: nm.trim(), ...(op === "save" ? { lineup } : {}) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { err = j?.error === "too_many" ? "twenty presets at most" : j?.error === "bad_name" ? "a name up to 40 letters" : `refused (${r.status})`; return; }
      err = ""; take(j);
      if (op === "save") { presetName = ""; pickPreset = nm.trim(); }
      if (op === "delete") pickPreset = "";
    } catch (e) { err = String((e as Error)?.message ?? e); }
  }
</script>

{#if !lineup}
  <p class="hint">{err || "Loading the lineup…"}</p>
{:else}
  <div class="lu">
    <div class="col">
      <div class="lbl">Starting <span class:bad={next.length === 0}>{lineup.starters.length}</span></div>
      {#each lineup.starters as id, i (id)}
        <div class="row">
          <span class="n">{i + 1}</span>
          <span class="who"><b>{name(id)}</b><small>{tag(id)}</small></span>
          <button class="mini" disabled={i === 0} onclick={() => move("starters", i, -1)} aria-label="Up">▲</button>
          <button class="mini" disabled={i === lineup.starters.length - 1} onclick={() => move("starters", i, 1)} aria-label="Down">▼</button>
          <button class="mini" onclick={() => toBench(id)}>To bench</button>
        </div>
      {:else}<p class="hint">Nobody. The bench fills every seat.</p>{/each}
    </div>
    <div class="col">
      <div class="lbl">Bench, in order</div>
      {#each lineup.bench as id, i (id)}
        <div class="row" class:in={fromBench.includes(id)}>
          <span class="n">{i + 1}</span>
          <span class="who"><b>{name(id)}</b><small>{fromBench.includes(id) ? "fills a seat" : tag(id)}</small></span>
          <button class="mini" disabled={i === 0} onclick={() => move("bench", i, -1)} aria-label="Up">▲</button>
          <button class="mini" disabled={i === lineup.bench.length - 1} onclick={() => move("bench", i, 1)} aria-label="Down">▼</button>
          <button class="mini" disabled={lineup.starters.length >= seatCap} onclick={() => toStarters(id)} title="Move to the starters">Start</button>
          <button class="mini" onclick={() => drop(id)} aria-label="Take off the bench">✕</button>
        </div>
      {:else}<p class="hint">Empty.</p>{/each}
      {#if outside.length}
        <div class="lbl">Not in the lineup</div>
        <div class="chips">
          {#each outside as c (c.id)}<button class="chip" onclick={() => addBench(c.id)} title="Add to the bench">+ {c.name}</button>{/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="row wrap">
    <span class="lbl">Largest group</span>
    <div class="seg">
      {#each Array.from({ length: seatCap }, (_, k) => k + 1) as n (n)}
        <button class:on={group === n} onclick={() => setGroup(n)}>{n}</button>
      {/each}
    </div>
  </div>
  <p class="hint">
    {#if next.length}Next run: {next.map(name).join(", ")}{fromBench.length ? ` (${fromBench.map(name).join(", ")} from the bench)` : ""}.{:else}Nobody to start. Add someone to the lineup.{/if}
  </p>

  <div class="row wrap">
    <span class="lbl">Presets</span>
    {#if presets.length}
      <select bind:value={pickPreset}>
        <option value="">— pick one —</option>
        {#each presets as p (p.name)}<option value={p.name}>{p.name}</option>{/each}
      </select>
      <button disabled={!pickPreset} onclick={() => preset("use", pickPreset)}>Use</button>
      <button class="danger" disabled={!pickPreset} onclick={() => preset("delete", pickPreset)}>Delete</button>
    {/if}
    <input maxlength="40" placeholder="Save this lineup as…" bind:value={presetName} onkeydown={(e) => { if (e.key === "Enter") void preset("save", presetName); }} />
    <button disabled={!presetName.trim()} onclick={() => preset("save", presetName)}>Save</button>
  </div>
  {#if err}<p class="err">{err}</p>{/if}
{/if}

<style>
  .lu { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .col { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .lbl { font-size: 0.78rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em; display: flex; gap: 6px; align-items: center; }
  .lbl .bad { color: var(--danger); }
  .row { display: flex; gap: 6px; align-items: center; }
  .row.wrap { flex-wrap: wrap; }
  .col .row { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; }
  .col .row.in { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
  .n { width: 1.4em; color: var(--ink-soft); font-variant-numeric: tabular-nums; font-size: 0.8rem; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .who small { color: var(--ink-soft); font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hint { margin: 0; color: var(--ink-soft); font-size: 0.84rem; line-height: 1.4; }
  .err { margin: 0; color: var(--danger); font-size: 0.84rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .seg { display: flex; flex-wrap: wrap; gap: 4px; }
  button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 11px; font: inherit; font-size: 0.84rem; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: 0.4; cursor: default; }
  button.on { border-color: var(--accent); color: var(--accent); }
  button.mini { padding: 3px 8px; font-size: 0.76rem; }
  button.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, transparent); }
  .chip { padding: 4px 10px; font-size: 0.8rem; }
  select, input { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; font: inherit; font-size: 0.84rem; }
  input { flex: 1; min-width: 140px; }
  @media (max-width: 900px) { .lu { grid-template-columns: 1fr; } }
</style>
