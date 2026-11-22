<script lang="ts">
  // SOLACE SURVIVORZ — Admin Panel → Survivorz. Three places, in the order they're used:
  //   · SHOW — the control room: pick the map and the cast, run it (and stream it), every lever. No 3D here
  //     (Josh, Nov 3 2026): to watch, the Survivorz page in Solace, or its pop-out;
  //   · STREAM — the YouTube rig, the workstation's GPU, the standby card;
  //   · ASSETS — the benches: the packed models, the final sounds, the sound engine, the set's look.
  // Each tab mounts only while it's open, so nothing here holds a GPU context beside the show.
  import { onDestroy, onMount } from "svelte";
  import { panel } from "./panel.svelte";
  import ControlRoom from "./ControlRoom.svelte";
  import Models from "./Models.svelte";
  import SoundList from "./SoundList.svelte";
  import SoundBench from "./SoundBench.svelte";
  import LookTest from "../room/LookTest.svelte";

  type Tab = "show" | "assets";
  type AssetTab = "models" | "sounds" | "engine" | "look";
  const TABS: [Tab, string][] = [["show", "Show"], ["assets", "Assets"]];
  const ASSET_TABS: [AssetTab, string, string][] = [
    ["models", "Models", "Every body, gun and prop with its clips"],
    ["sounds", "Sounds", "The final sounds, as they ship"],
    ["engine", "Sound engine", "Place sounds, fire cues, run the score"],
    ["look", "Set look", "The bunker set, lit"],
  ];

  // the open tab is remembered on this browser only (a convenience; nothing breaks without it)
  const KEY = "solace_survivorz_admin_tab";
  function readTab(): { tab: Tab; asset: AssetTab } {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (v && TABS.some(([t]) => t === v.tab) && ASSET_TABS.some(([t]) => t === v.asset)) return v;
    } catch { /* storage off: defaults */ }
    return { tab: "show", asset: "models" };
  }
  const first = readTab();
  let tab = $state<Tab>(first.tab);
  let asset = $state<AssetTab>(first.asset);
  $effect(() => {
    const v = JSON.stringify({ tab, asset });
    try { localStorage.setItem(KEY, v); } catch { /* storage off */ }
  });

  // ---- the header's status: the panel's one reading (panel.svelte.ts) ----
  let stop: (() => void) | null = null;
  onMount(() => { stop = panel.watch(); });
  onDestroy(() => stop?.());
  const run = $derived(panel.run);
</script>

<div class="watch">
  <header>
    <div class="title">
      <h2>Survivorz</h2>
      <!-- (the Show tab has the control room's own strip: the pills are for the Assets tab) -->
      <div class="pills" class:gone={tab === "show"}>
        <span class="pill" class:live={run?.running && !run.paused && !run.held} class:test={run?.test} class:warn={run?.held}>{panel.runLabel}{run?.running ? ` · ${panel.runState}` : ""}</span>
        {#if run?.onAir}<span class="pill air">ON AIR in Solace</span>{/if}
        {#if panel.stream?.configured}
          <span class="pill" class:yt={panel.live} class:warn={panel.stream.want && !panel.live}>{panel.rigLabel}</span>
        {/if}
        {#if panel.red.length}<span class="pill bad" title={panel.red.map((c) => `${c.name}: ${c.detail}`).join("\n")}>{panel.red.length} check{panel.red.length === 1 ? "" : "s"} red</span>{/if}
        {#if panel.offline}<span class="pill bad">server not answering</span>{/if}
      </div>
    </div>
    <nav class="tabs" aria-label="Survivorz">
      {#each TABS as [id, label] (id)}
        <button class:active={tab === id} onclick={() => (tab = id)}>{label}</button>
      {/each}
    </nav>
  </header>

  {#if tab === "show"}
    <ControlRoom />
  {:else}
    <div class="assets">
      <nav class="subtabs" aria-label="Assets">
        {#each ASSET_TABS as [id, label, hint] (id)}
          <button class:active={asset === id} onclick={() => (asset = id)} title={hint}>{label}</button>
        {/each}
      </nav>
      {#if asset === "models"}<Models />
      {:else if asset === "sounds"}<SoundList />
      {:else if asset === "engine"}<div class="scroll"><SoundBench /></div>
      {:else}<LookTest />{/if}
    </div>
  {/if}
</div>

<style>
  .watch { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 560px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; }
  .title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 1.15rem; letter-spacing: 0.02em; }
  .pills { display: flex; gap: 6px; flex-wrap: wrap; }
  .pills.gone { display: none; }
  .pill { font-size: 0.75rem; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink-soft); background: var(--panel-2); white-space: nowrap; }
  .pill.live { color: var(--ok, #6fbf73); border-color: color-mix(in srgb, var(--ok, #6fbf73) 50%, transparent); }
  .pill.test { color: #e0c34a; border-color: rgba(224, 195, 74, 0.5); }
  .pill.air { color: #ff4d42; border-color: rgba(255, 77, 66, 0.5); font-weight: 700; letter-spacing: 0.04em; }
  .pill.yt { color: #ff4d42; border-color: rgba(255, 77, 66, 0.5); }
  .pill.warn { color: #e0a34a; border-color: rgba(224, 163, 74, 0.5); }
  .pill.bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 55%, transparent); font-weight: 700; }
  .tabs, .subtabs { display: flex; gap: 4px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 9px; padding: 3px; }
  .tabs button, .subtabs button { background: transparent; color: var(--ink-soft); border: 0; border-radius: 6px; padding: 6px 14px; cursor: pointer; font: inherit; font-size: 0.88rem; }
  .tabs button:hover, .subtabs button:hover { color: var(--ink); }
  .tabs button.active, .subtabs button.active { background: var(--panel); color: var(--accent); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); }
  .assets { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .subtabs { align-self: flex-start; }
  .subtabs button { font-size: 0.82rem; padding: 5px 12px; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
</style>
