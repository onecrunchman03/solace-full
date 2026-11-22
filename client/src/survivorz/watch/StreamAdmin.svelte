<script lang="ts">
  // Admin Panel → Survivorz → Show, at the foot of the control room (it was its own Stream tab until Nov 3
  // 2026 — Josh: "put all the stuff in the stream tab inside the show tab"): the YouTube rig (its last heartbeat and the GO-LIVE switch it
  // follows), the workstation's GPU, and the STANDBY CARD (src/survivorz/stream.ts — every press
  // audited). The card goes over the stream page without stopping the stream; the page picks it up
  // within a few seconds.
  import { onDestroy, onMount } from "svelte";
  import { sessionHeaders } from "../assets";
  import { ago, panel } from "./panel.svelte";
  import { ask } from "../../lib/confirm.svelte";

  let { embedded = false }: { embedded?: boolean } = $props();

  const view = $derived(panel.stream);
  const gpu = $derived(panel.gpu);
  let err = $state("");
  let busy = $state(false);
  let text = $state("");
  const load = () => panel.refresh(true);
  async function post(path: string, body: unknown): Promise<void> {
    if (busy) return;
    busy = true; err = "";
    try {
      const r = await fetch(path, { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) err = (await r.json().catch(() => null))?.error ?? `refused (${r.status})`;
    } catch (e) { err = String((e as Error)?.message ?? e); }
    busy = false;
    void load();
  }
  const standby = (on: boolean) => post("/api/admin/survivorz/stream/standby", { on, text: text.trim() });
  const notExpected = () => post("/api/admin/survivorz/stream/expected", { on: false });
  async function setWant(on: boolean): Promise<void> {
    if (!on && !(await ask({ title: "Stop streaming to YouTube?", body: "The YouTube broadcast ends. A run in Solace keeps going.", danger: true }))) return;
    await post("/api/admin/survivorz/stream/want", { on });
  }

  let stop: (() => void) | null = null;
  onMount(() => { stop = panel.watch(); void load(); });
  onDestroy(() => stop?.());

  const hours = (since: number | null) => (since ? `${((Date.now() - since) / 3_600_000).toFixed(1)} h` : "—");
  const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

  // one word for the whole rig, for the big status line
  const stale = $derived(panel.stale);
  const live = $derived(panel.live);
  const headline = $derived(
    !view ? "" :
    live ? "Live on YouTube" :
    view.want ? (stale ? "Wanted — but the rig isn't checking in" : "Going live…") :
    stale ? "The rig is offline" :
    view.beat?.idle ? "Standing by" : "Not streaming",
  );
  const tone = $derived(live ? "live" : view?.want && stale ? "bad" : view?.want ? "warn" : stale ? "off" : "ok");
</script>

<div class="sa" class:embedded>
  {#if !view}
    <p class="note">{err || (panel.offline ? "The server isn't answering." : "Loading…")}</p>
  {:else if !view.configured}
    <section class="card">
      <h3>No stream rig on this server</h3>
      <p>Set <code>SURVIVORZ_STREAM_TOKEN</code> (24+ characters) in the server's .env, and the same value in the workstation's.</p>
    </section>
  {:else}
    <section class="card hero {tone}">
      <div class="headline"><span class="dot"></span>{headline}</div>
      {#if live && view.beat}
        <p>On air {hours(view.beat.rtmpSince)}{view.beat.rtmp === "backup" ? " — on YouTube's backup server (the main one dropped)" : ""} · {view.beat.fps ?? "?"} fps · recording {view.beat.recording}</p>
      {:else if view.want && !stale}
        <p>The rig is opening the show and connecting. This takes about a minute.</p>
      {:else if stale}
        <p>Start the <b>Solace Survivorz Stream</b> task on the workstation (<code>stream-task.ps1 -Start</code>). It stands by until you go live.</p>
      {:else}
        <p>The rig is running and waiting. "Start show + stream" above puts it live with a run.</p>
      {/if}
      <div class="row">
        {#if view.want}
          <button disabled={busy} class="danger" onclick={() => setWant(false)}>Stop streaming</button>
        {:else}
          <button disabled={busy} class="go" onclick={() => setWant(true)}>Go live now</button>
        {/if}
      </div>
    </section>

    <div class="grid">
      <section class="card">
        <h3>The rig</h3>
        {#if view.beat}
          {@const b = view.beat}
          <dl>
            <dt>Last check-in</dt><dd class:bad={stale}>{ago(view.age)}</dd>
            {#if !b.idle}
              <dt>Picture</dt><dd>{ago(b.lastFrameAt ? Date.now() - b.lastFrameAt : null)} · {b.fps ?? "?"} fps</dd>
              <dt>YouTube</dt><dd>{b.rtmp}</dd>
              <dt>Recording</dt><dd>{b.recording}</dd>
              <dt>Session</dt><dd>{b.session} · {b.restarts} restart(s)</dd>
              {#if b.heapMB}<dt>Page memory</dt><dd>{b.heapMB} MB</dd>{/if}
            {:else}
              <dt>State</dt><dd>standing by (no browser, no encode)</dd>
            {/if}
          </dl>
          {#if b.problem}<p class="bad">The rig reports: {b.problem}</p>{/if}
        {:else}
          <p>{view.expected || view.want ? "A stream is expected, but the rig hasn't checked in since the server started." : "The rig hasn't checked in since the server started."}</p>
        {/if}
        {#if view.expected && !view.want}
          <button disabled={busy} onclick={notExpected} title="Quiets the health check after the rig was stopped without saying so">No stream is expected</button>
        {/if}
      </section>

      <section class="card">
        <h3>Workstation GPU</h3>
        {#if gpu?.report}
          {@const g = gpu.report}
          <div class="meter" class:bad={g.verdict.alarm}><i style:width={`${Math.round((g.usedMb / Math.max(1, g.totalMb)) * 100)}%`}></i></div>
          <p>{gb(g.usedMb)} of {gb(g.totalMb)} · reported {ago(gpu.age)}</p>
          <p class:bad={g.verdict.alarm || (gpu.age ?? 0) > 10 * 60_000}>{g.verdict.detail}</p>
          <ul>{#each g.procs.slice(0, 5) as p (p.name)}<li><span>{p.name}</span><b>{gb(p.mb)}</b></li>{/each}</ul>
        {:else}
          <p>{gpu?.watching ? "The watcher was reporting but hasn't since the server started." : "No GPU watcher reporting (deploy/workstation/gpu-watch.ps1 -Install on the workstation)."}</p>
        {/if}
      </section>
    </div>

    <section class="card">
      <h3>Standby card {#if view.standby.on}<span class="up">UP NOW</span>{/if}</h3>
      <p>Puts a "we'll be right back" card over the stream without stopping it.</p>
      <div class="row">
        <input placeholder="We'll be right back." maxlength="140" bind:value={text} />
        {#if view.standby.on}
          <button disabled={busy} class="on" onclick={() => standby(false)}>Take the card down</button>
        {:else}
          <button disabled={busy} onclick={() => standby(true)}>Put the card up</button>
        {/if}
      </div>
    </section>
  {/if}
  {#if err && view}<p class="bad">{err}</p>{/if}
</div>

<style>
  .sa { display: flex; flex-direction: column; gap: 12px; padding: 2px 0 20px; color: var(--ink); max-width: 860px; overflow-y: auto; min-height: 0; }
  .sa.embedded { max-width: none; overflow: visible; padding: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
  .card { display: flex; flex-direction: column; gap: 8px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
  h3 { margin: 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-soft); display: flex; align-items: center; gap: 8px; }
  p { margin: 0; color: var(--ink-soft); font-size: 0.9rem; }
  .hero { gap: 10px; }
  .headline { display: flex; align-items: center; gap: 10px; font-size: 1.15rem; font-weight: 700; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ink-soft); }
  .hero.live { border-color: rgba(255, 77, 66, 0.45); }
  .hero.live .dot { background: #ff4d42; box-shadow: 0 0 0 4px rgba(255, 77, 66, 0.2); animation: pulse 1.6s ease-in-out infinite; }
  .hero.ok .dot { background: var(--ok, #6fbf73); }
  .hero.warn .dot { background: #e0a34a; }
  .hero.bad { border-color: color-mix(in srgb, var(--danger) 50%, transparent); }
  .hero.bad .dot { background: var(--danger); }
  @keyframes pulse { 50% { opacity: 0.45; } }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; font-size: 0.88rem; }
  dt { color: var(--ink-soft); }
  dd { margin: 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 0.85rem; }
  li { display: flex; justify-content: space-between; gap: 10px; color: var(--ink-soft); }
  li b { color: var(--ink); font-weight: 500; font-variant-numeric: tabular-nums; }
  .meter { height: 6px; background: var(--panel); border-radius: 3px; overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--accent); }
  .meter.bad i { background: var(--danger); }
  .bad { color: var(--danger); }
  .up { color: #ff4d42; font-weight: 800; letter-spacing: 0.08em; font-size: 0.7rem; }
  .row { display: flex; gap: 8px; align-items: center; }
  input { flex: 1; min-width: 0; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 7px 9px; font: inherit; }
  button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 7px 14px; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  button.on { border-color: var(--accent); color: var(--accent); }
  button.go { border-color: #3b8e4a; color: #b6f0bf; }
  button.danger { border-color: #8e3b33; color: #f0b3aa; }
  .note { color: var(--ink-soft); }
  code { font-size: 0.85em; }
</style>
