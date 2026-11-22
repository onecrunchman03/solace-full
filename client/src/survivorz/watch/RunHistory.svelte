<script lang="ts">
  // SOLACE SURVIVORZ — THE RUN HISTORY (the control room's stage 3): every run that ended, was stopped or was
  // restarted, newest first — who was in it, who lived, how far they got (routes/survivorz-show.ts).
  import { onDestroy, onMount } from "svelte";
  import { sessionHeaders } from "../assets";

  interface Entry {
    run: string; runNo: number | null; test: boolean; map: string | null; seed: number; startedAt: number; endedAt: number;
    why: "ended" | "stopped" | "restarted"; ranMs: number; ending: "rescued" | "escaped" | "survived" | "wiped" | "timeout" | null;
    survivors: { who: string; fate: "alive" | "dead" | "turned" | "rescued"; cause?: string }[]; done: string[];
  }
  let { charName, mapName, refresh = 0 }: { charName: (id: string) => string; mapName: (id: string | null) => string; refresh?: number } = $props();

  let runs = $state<Entry[] | null>(null);
  let all = $state(false);
  let showTests = $state(true);
  async function load(): Promise<void> {
    try {
      const r = await fetch("/api/admin/survivorz/history", { headers: sessionHeaders() });
      if (r.ok) { const seen = new Set<string>(); runs = ((await r.json()).runs as Entry[]).filter((x) => !seen.has(x.run) && !!seen.add(x.run)); }   // (one row a run: the list is keyed by it)
    } catch { /* the next refresh tries again */ }
  }
  let timer = 0;
  onMount(() => { void load(); timer = window.setInterval(load, 30_000); });
  onDestroy(() => window.clearInterval(timer));
  // a stop or a restart from the control room reloads it at once
  $effect(() => { void refresh; void load(); });

  const ENDING: Record<string, string> = { rescued: "Rescued", escaped: "Escaped", survived: "Survived", wiped: "Everyone died", timeout: "Out of time" };
  const WHY: Record<string, string> = { stopped: "Stopped", restarted: "Restarted" };
  const DONE: Record<string, string> = { sealed: "door sealed", clear: "bunker clear", part: "part found", code: "code found", fixed: "radio fixed", called: "call made",
    // (Glenridge Hall's)
    bolt: "door bolted", windows: "windows boarded", crests: "crests set", secret: "secret uncovered", lights: "lights back on", car: "left by car" };
  const FATE: Record<string, string> = { alive: "", dead: "✝", turned: "turned", rescued: "rescued" };
  function when(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  const mins = (ms: number): string => `${Math.round(ms / 60_000)} min`;
  const shown = $derived((runs ?? []).filter((r) => showTests || !r.test));
</script>

<div class="rh">
  <div class="top">
    <label><input type="checkbox" bind:checked={showTests} /> test runs</label>
  </div>
  {#if !runs}<p class="hint">Loading…</p>
  {:else if !shown.length}<p class="hint">No runs yet. A run lands here when it ends, is stopped or is restarted.</p>
  {:else}
    <ol>
      {#each all ? shown : shown.slice(0, 12) as r (r.run)}
        {@const lived = r.survivors.filter((s) => s.fate === "alive" || s.fate === "rescued").length}
        <li class:test={r.test}>
          <div class="head">
            <b>{r.test ? "Test run" : `Run #${r.runNo}`}</b>
            <span class="end" class:good={r.ending === "rescued" || r.ending === "escaped" || r.ending === "survived"} class:bad={r.ending === "wiped"}>{r.ending ? ENDING[r.ending] : WHY[r.why] ?? r.why}</span>
            <span class="soft">{mapName(r.map)} · {when(r.startedAt)} · {mins(r.ranMs)} · {lived} of {r.survivors.length} alive</span>
          </div>
          <div class="who">
            {#each r.survivors as s (s.who)}
              <span class="p {s.fate}" title={s.cause ?? ""}>{charName(s.who)}{FATE[s.fate] ? ` ${FATE[s.fate]}` : ""}</span>
            {/each}
          </div>
          <div class="soft small">{r.done.length ? r.done.map((d) => DONE[d] ?? d).join(" · ") : "no objectives done"} · seed {r.seed}</div>
        </li>
      {/each}
    </ol>
    {#if shown.length > 12}<button onclick={() => (all = !all)}>{all ? "Show fewer" : `Show all ${shown.length}`}</button>{/if}
  {/if}
</div>

<style>
  .rh { display: flex; flex-direction: column; gap: 8px; }
  .top { display: flex; justify-content: flex-end; font-size: 0.8rem; color: var(--ink-soft); }
  .top label { display: flex; gap: 5px; align-items: center; }
  .hint { margin: 0; color: var(--ink-soft); font-size: 0.84rem; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  li { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  li.test { border-style: dashed; }
  .head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .end { font-weight: 700; font-size: 0.84rem; }
  .end.good { color: var(--ok, #6fbf73); } .end.bad { color: var(--danger); }
  .soft { color: var(--ink-soft); font-size: 0.8rem; }
  .small { font-size: 0.76rem; }
  .who { display: flex; flex-wrap: wrap; gap: 4px; }
  .p { font-size: 0.76rem; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); }
  .p.dead, .p.turned { color: var(--ink-soft); text-decoration: line-through; }
  .p.rescued { color: var(--ok, #6fbf73); border-color: color-mix(in srgb, var(--ok, #6fbf73) 50%, transparent); }
  button { align-self: flex-start; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 11px; font: inherit; font-size: 0.84rem; cursor: pointer; }
</style>
