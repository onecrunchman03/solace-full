<script lang="ts">
  // SOLACE SURVIVORZ — THE CONTROL ROOM's DIAGNOSTICS (Josh, Nov 12 2026: "more control settings and diagnostics
  // for orchestrating the show"). Everything the broadcast already measured and nothing showed: the run loop's
  // cost against its budget, who's on the watch socket and what's going out, the saves, the survivors' AI by the
  // numbers, and the show's own health checks. Read off the panel's one reading (panel.svelte.ts); "Copy report"
  // puts the lot on the clipboard as plain text, for pasting into a session.
  import { ago, panel } from "./panel.svelte";

  let { busy, lever }: { busy: boolean; lever: (op: string, extra?: Record<string, unknown>, done?: string) => Promise<boolean> } = $props();

  const run = $derived(panel.run);
  const d = $derived(run?.diag ?? null);
  const m = $derived(panel.minds);
  const now = $derived(panel.readAt || Date.now());

  const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const kb = (bytes: number): string => (bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`);
  const clock = (ms: number | null | undefined): string => {
    if (ms == null) return "—";
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${mm} min` : `${mm} min ${s % 60} s`;
  };
  // the tick against its budget: over half is worth a look, over the whole budget the show is falling behind
  const tickTone = $derived(!d ? "" : d.tickAvgMs > d.tickBudgetMs ? "bad" : d.tickAvgMs > d.tickBudgetMs / 2 ? "warn" : "good");
  const saveAge = $derived(run?.saved ? now - run.saved.at : null);

  interface Row { k: string; v: string; tone?: string }
  const loop = $derived.by((): Row[] => !run?.running || !d ? [] : [
    { k: "Tick cost", v: `${d.tickAvgMs} ms average · ${run.tickMs} ms last · ${d.tickMaxMs} ms worst`, tone: tickTone },
    { k: "Budget", v: `${d.tickBudgetMs} ms a tick (${Math.round(1000 / d.tickBudgetMs)} a second)` },
    { k: "Late ticks", v: `${d.lateTicks} of ${run.ticks}`, tone: d.lateTicks > 0 ? "warn" : "" },
    { k: "Show clock", v: goalsClock() },
    { k: "Speed", v: run.test ? `${run.speed}×` : "1× (a real show)" },
    { k: "This process", v: d.beganAt ? `running it for ${clock(now - d.beganAt)}${d.startedAt && d.beganAt - d.startedAt > 5000 ? " (resumed after a restart)" : ""}` : "—" },
    { k: "Run id", v: `${run.run ?? "—"} · seed ${run.seed ?? "—"}` },
  ]);
  function goalsClock(): string {
    if (!run || run.t == null) return "—";
    return new Date(run.t).toISOString().slice(11, 19);
  }
  const wire = $derived.by((): Row[] => !run || !d ? [] : [
    { k: "Watching", v: `${run.watchers} · ${run.members} member${run.members === 1 ? "" : "s"} of ${d.maxWatchers} · ${d.admins} admin · ${d.streams ? "the stream rig" : "no stream rig"}` },
    { k: "Going out", v: panel.rate ? `${panel.rate.fps} frames/s · ${panel.rate.kbps} kbit/s to all watchers` : "—" },
    { k: "Since this run began", v: `${run.framesOut.toLocaleString()} frames · ${kb(run.bytesOut)}` },
    { k: "On air", v: run.onAir ? "yes — members can watch" : run.test ? "no — a test run never is" : "no" },
  ]);
  const saves = $derived.by((): Row[] => !run?.running || !d ? [] : [
    { k: "Last save", v: run.saved ? `${ago(saveAge)} · ${kb(run.saved.bytes)} · took ${run.saved.ms} ms` : "none yet", tone: run.saved && run.saved.ms > 250 ? "warn" : "" },
    { k: "Saves", v: `every ${Math.round(d.saveEveryMs / 60_000) || 1} min of show clock, and on every start, pause and shutdown` },
    { k: "If the server restarts", v: "the same run carries on from the last save" },
  ]);
  const ai = $derived.by((): Row[] => !m ? [] : [
    { k: "Engine", v: !m.allowed ? "switched off — code decides" : !m.configured ? "none on this server" : m.modelUp ? "up" : "DOWN", tone: m.allowed && m.configured ? (m.modelUp ? "good" : "bad") : "" },
    { k: "The AI's share", v: m.share.pct == null ? "—" : `${m.share.pct}% of choices in the last show hour (${m.share.ai} AI · ${m.share.code} code)`, tone: m.share.pct != null && m.share.pct < 90 && m.allowed && m.modelUp ? "warn" : "" },
    { k: "Thinks", v: `${m.thinksAi} by the AI · ${m.thinksCode} by code (${pct(m.thinksAi, m.thinksAi + m.thinksCode)} AI)` },
    { k: "Choices", v: `${m.choicesAsked} asked · ${m.choicesTaken} taken · ${m.choicesFailed} failed`, tone: m.choicesAsked > 20 && m.choicesFailed / m.choicesAsked > 0.2 ? "warn" : "" },
    { k: "Lines", v: `${m.said} said · ${m.dropped} dropped by the checks`, tone: m.said + m.dropped > 20 && m.dropped > m.said ? "warn" : "" },
    { k: "Thoughts", v: `${m.thoughtsWritten} written · ${m.thoughtsDropped} dropped` },
    { k: "Goals", v: `${m.goalsSet} set of ${m.goalsAsked} asked · ${m.meetings} meeting${m.meetings === 1 ? "" : "s"}` },
    { k: "In the air now", v: `${m.writing} line${m.writing === 1 ? "" : "s"} being written · ${m.thinking} think${m.thinking === 1 ? "" : "s"}` },
  ]);
  const rig = $derived.by((): Row[] => {
    const v = panel.stream;
    if (!v?.configured) return [{ k: "Stream rig", v: "none on this server" }];
    const b = v.beat, g = panel.gpu?.report;
    return [
      { k: "YouTube", v: panel.live ? `live${b?.rtmp === "backup" ? " on the backup server" : ""} · ${b?.fps ?? "?"} fps` : v.want ? "wanted, not live yet" : "not streaming", tone: panel.live ? "good" : v.want ? "warn" : "" },
      { k: "Rig check-in", v: ago(v.age), tone: panel.stale && (v.want || v.expected) ? "bad" : "" },
      ...(b && !b.idle ? [{ k: "Rig session", v: `${b.session} · ${b.restarts} restart${b.restarts === 1 ? "" : "s"}${b.heapMB ? ` · page ${b.heapMB} MB` : ""}`, tone: b.restarts > 2 ? "warn" : "" }] : []),
      ...(b?.problem ? [{ k: "Rig reports", v: b.problem, tone: "bad" }] : []),
      { k: "Workstation GPU", v: g ? `${(g.usedMb / 1024).toFixed(1)} of ${(g.totalMb / 1024).toFixed(1)} GB · ${g.verdict.detail}` : "no watcher reporting", tone: g?.verdict.alarm ? "bad" : "" },
      { k: "Standby card", v: v.standby.on ? `UP — "${v.standby.text || "We'll be right back."}"` : "down", tone: v.standby.on ? "warn" : "" },
    ];
  });

  let copied = $state(false);
  async function copy(): Promise<void> {
    const sec = (title: string, rows: Row[]) => rows.length ? [`== ${title}`, ...rows.map((r) => `${r.k}: ${r.v}${r.tone === "bad" ? "  [RED]" : r.tone === "warn" ? "  [look]" : ""}`), ""] : [];
    const text = [
      `Survivorz diagnostics · ${new Date().toISOString()}`,
      `${panel.runLabel} · ${panel.runState}${run?.running ? ` · ${run.map ?? "?"} · ${run.cast.join(", ")}` : ""}`, "",
      ...sec("The run loop", loop), ...sec("The watch socket", wire), ...sec("Saves", saves), ...sec("The survivors' AI", ai), ...sec("Stream and workstation", rig),
      "== Health checks", ...(panel.health ?? []).map((c) => `${c.ok ? "ok " : "RED"} ${c.name}: ${c.detail}`),
    ].join("\n");
    try { await navigator.clipboard.writeText(text); copied = true; window.setTimeout(() => (copied = false), 2000); }
    catch { /* no clipboard here: nothing to do */ }
  }
</script>

{#snippet rows(list: Row[])}
  <dl>{#each list as r (r.k)}<dt>{r.k}</dt><dd class={r.tone ?? ""}>{r.v}</dd>{/each}</dl>
{/snippet}

<div class="dg">
  <div class="top">
    <span class="hint">Read {ago(panel.readAt ? Date.now() - panel.readAt : null)}{panel.offline ? " — the server isn't answering" : ""}</span>
    <span class="grow"></span>
    <button disabled={busy || !run?.running} onclick={() => lever("save", {}, "Saved.")} title="Write the running world to disk now">Save now</button>
    <button onclick={() => panel.refresh(true)}>Refresh</button>
    <button onclick={copy}>{copied ? "Copied" : "Copy report"}</button>
  </div>

  <div class="grid">
    <section class="card">
      <h3>Health checks</h3>
      {#if !panel.health}<p class="hint">Loading…</p>
      {:else if !panel.health.length}<p class="hint">No show checks on this server.</p>
      {:else}
        <ul class="checks">
          {#each panel.health as c (c.name)}<li class:red={!c.ok}><span class="dot"></span><b>{c.name}</b><small>{c.detail}</small></li>{/each}
        </ul>
      {/if}
    </section>

    <section class="card">
      <h3>The run loop</h3>
      {#if loop.length}
        {#if d}<div class="meter {tickTone}" title="the tick's average cost against its budget"><i style:width={`${Math.min(100, Math.round((d.tickAvgMs / d.tickBudgetMs) * 100))}%`}></i></div>{/if}
        {@render rows(loop)}
      {:else}<p class="hint">No run.</p>{/if}
    </section>

    <section class="card">
      <h3>The watch socket</h3>
      {#if wire.length}{@render rows(wire)}{:else}<p class="hint">Loading…</p>{/if}
    </section>

    <section class="card">
      <h3>Saves</h3>
      {#if saves.length}{@render rows(saves)}{:else}<p class="hint">No run.</p>{/if}
    </section>

    <section class="card">
      <h3>The survivors' AI</h3>
      {#if ai.length}{@render rows(ai)}{:else}<p class="hint">{run?.running ? "Loading…" : "The numbers start with a run."}</p>{/if}
    </section>

    <section class="card">
      <h3>Stream and workstation</h3>
      {@render rows(rig)}
    </section>
  </div>
</div>

<style>
  .dg { display: flex; flex-direction: column; gap: 12px; }
  .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .grow { flex: 1; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; align-items: start; }
  .card { border: 1px solid var(--line); background: var(--panel-2); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  h3 { margin: 0; font-size: 0.95rem; letter-spacing: 0.04em; }
  .hint { margin: 0; color: var(--ink-soft); font-size: 0.84rem; }
  dl { display: grid; grid-template-columns: minmax(110px, auto) 1fr; gap: 5px 14px; margin: 0; font-size: 0.86rem; }
  dt { color: var(--ink-soft); }
  dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  dd.good { color: var(--ok, #6fbf73); } dd.warn { color: #e0a34a; } dd.bad { color: var(--danger); font-weight: 700; }
  .meter { height: 6px; background: var(--panel); border-radius: 3px; overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--ok, #6fbf73); }
  .meter.warn i { background: #e0a34a; } .meter.bad i { background: var(--danger); }
  .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .checks li { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: baseline; font-size: 0.86rem; }
  .checks .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok, #6fbf73); align-self: center; }
  .checks li.red .dot { background: var(--danger); }
  .checks li.red b { color: var(--danger); }
  .checks small { grid-column: 2; color: var(--ink-soft); font-size: 0.8rem; overflow-wrap: anywhere; }
  button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 7px 13px; font: inherit; font-size: 0.86rem; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: 0.45; cursor: default; }
</style>
