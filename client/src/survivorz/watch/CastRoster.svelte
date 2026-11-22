<script lang="ts">
  // SOLACE SURVIVORZ — THE CAST (Josh, Nov 5 2026: "the survivorz panel is the show management page and the
  // character creator is the workshop"). Every character the creator knows, with what they're good at and what's
  // left before they can be in the show; one click puts a ready one in (Cast walks in · Bench waits · Off leaves
  // the show). A character still being made is greyed with what's left and a way to the creator. The lineup below
  // decides who starts a run from the cast and the bench.
  import { onMount } from "svelte";
  import { api, ApiError, type RosterEntry } from "../../lib/api";
  import { openPopout } from "../../lib/popout";

  let { onchange }: { onchange?: () => void } = $props();

  let roster = $state<RosterEntry[] | null>(null);
  let err = $state("");
  let busy = $state<string | null>(null);
  let showOff = $state(false);

  const inShow = $derived(roster?.filter((c) => c.status !== "draft") ?? []);
  const ready = $derived(roster?.filter((c) => c.status === "draft" && c.ready) ?? []);
  const making = $derived(roster?.filter((c) => c.status === "draft" && !c.ready) ?? []);

  async function load(): Promise<void> {
    try { roster = (await api.adminSurvivorzRoster()).roster; err = ""; }
    catch (e) { err = e instanceof ApiError ? e.code : String(e); }
  }
  onMount(() => { void load(); });

  async function set(c: RosterEntry, status: RosterEntry["status"]): Promise<void> {
    if (busy || c.status === status) return;
    busy = c.id;
    try {
      const r = await api.adminCastStatus(c.id, status);
      err = status !== "draft" && !r.live && r.held ? `${c.name}: ${r.held}` : "";
      await load();
      onchange?.();
    } catch (e) {
      err = e instanceof ApiError ? `${c.name}: ${(e.data?.errors ?? []).map((p: { error: string }) => p.error).join("; ") || e.code}` : String(e);
    } finally { busy = null; }
  }
  async function openCreator(): Promise<void> {
    try { await openPopout("#creator", { name: "solace-creator", width: 1500, height: 950 }); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  const left = (c: RosterEntry): string => c.steps.filter((s) => !s.done && s.key !== "status" && s.key !== "live").map((s) => s.note ? `${s.label.toLowerCase()} (${s.note})` : s.label.toLowerCase()).join(" · ");
</script>

{#snippet person(c: RosterEntry, can: boolean)}
  <div class="who" class:dim={!can} class:live={c.live}>
    <div class="id">
      <b>{c.name}</b>
      <small>{c.tag}</small>
      {#if c.top.length}<span class="skills">{#each c.top as s (s.key)}<i>{s.label} {s.level}</i>{/each}</span>{/if}
      {#if !can}<span class="left">Still to do: {left(c) || "nothing"}</span>
      {:else if c.status !== "draft" && !c.live && c.held}<span class="left warn">Held back: {c.held}</span>{/if}
    </div>
    <div class="seg" role="group" aria-label="{c.name} in the show">
      <button class:on={c.status === "cast"} disabled={!can || busy !== null} onclick={() => set(c, "cast")} title="Walks in with the group">Cast</button>
      <button class:on={c.status === "bench"} disabled={!can || busy !== null} onclick={() => set(c, "bench")} title="Ready, held back for when you want them">Bench</button>
      <button class:on={c.status === "draft"} class="off" disabled={busy !== null} onclick={() => set(c, "draft")} title="Not in the show">Off</button>
    </div>
  </div>
{/snippet}

<div class="roster">
  <div class="top">
    <span class="hint">{inShow.length} in the show · {ready.length} ready · {making.length} being made</span>
    <span class="grow"></span>
    <button class="mini" onclick={openCreator}>Open the character creator ⧉</button>
  </div>
  {#if err}<p class="err">{err}</p>{/if}
  {#if !roster}<p class="hint">Loading…</p>
  {:else}
    {#if inShow.length}
      <div class="lbl">In the show</div>
      <div class="tiles">{#each inShow as c (c.id)}{@render person(c, true)}{/each}</div>
    {/if}
    {#if ready.length}
      <div class="lbl">Ready to go in</div>
      <div class="tiles">{#each ready as c (c.id)}{@render person(c, true)}{/each}</div>
    {/if}
    {#if making.length}
      <button class="more" onclick={() => (showOff = !showOff)}>{showOff ? "▾" : "▸"} Being made in the creator ({making.length})</button>
      {#if showOff}<div class="tiles">{#each making as c (c.id)}{@render person(c, false)}{/each}</div>{/if}
    {/if}
  {/if}
</div>

<style>
  .roster { display: flex; flex-direction: column; gap: 6px; }
  .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .grow { flex: 1; }
  .hint { margin: 0; color: var(--ink-soft); font-size: 0.84rem; }
  .lbl { font-size: 0.72rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 8px; }
  .err { margin: 0; color: var(--danger); font-size: 0.84rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 6px; }
  .who { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); border-left: 3px solid var(--line); }
  .who.live { border-left-color: var(--ok, #6fbf73); }
  .who.dim { opacity: 0.55; }
  .id { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .id b { font-size: 0.92rem; }
  .id small { color: var(--ink-soft); font-size: 0.76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .skills { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
  .skills i { font-style: normal; font-size: 0.68rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, var(--panel-2)); color: var(--ink); }
  .left { font-size: 0.74rem; color: var(--ink-soft); }
  .left.warn { color: #e0a34a; }
  .seg { display: flex; gap: 0; flex-shrink: 0; }
  .seg button { background: var(--panel-2); color: var(--ink-soft); border: 1px solid var(--line); padding: 6px 12px; font: inherit; font-size: 0.8rem; cursor: pointer; border-radius: 0; margin-left: -1px; }
  .seg button:first-child { border-radius: 8px 0 0 8px; margin-left: 0; }
  .seg button:last-child { border-radius: 0 8px 8px 0; }
  .seg button:hover:not(:disabled) { color: var(--ink); }
  .seg button.on { background: color-mix(in srgb, var(--ok, #6fbf73) 22%, var(--panel)); border-color: color-mix(in srgb, var(--ok, #6fbf73) 55%, transparent); color: var(--ink); font-weight: 700; position: relative; }
  .seg button.off.on { background: var(--panel); border-color: var(--line); color: var(--ink-soft); }
  .seg button:disabled { opacity: 0.45; cursor: default; }
  .more { align-self: flex-start; margin-top: 8px; background: none; border: none; color: var(--ink-soft); font: inherit; font-size: 0.82rem; cursor: pointer; padding: 2px 0; }
  .mini { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 5px 11px; font: inherit; font-size: 0.8rem; cursor: pointer; }
  .mini:hover { border-color: var(--accent); }
  @media (max-width: 760px) { .who { flex-direction: column; align-items: stretch; } .seg button { flex: 1; } }
</style>
