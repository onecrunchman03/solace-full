<script lang="ts">
  // SENNETH'S BENCH (src/portal/bench-sim.ts; games.md, "3. Senneth's bench").
  // Hold a fold: eight couplings round it creep toward their design load, and
  // a click (or keys 1–8) bleeds one. Hold for the exercise's time and the
  // bench prints its result. It never says what the result means.
  import { onDestroy } from "svelte";
  import Glyph from "../../portal/Glyph.svelte";
  import GlyphText from "../../portal/GlyphText.svelte";
  import { STATUS_STROKES } from "../../portal/status-strokes";
  import { api } from "../../lib/api";
  import { portal, openBench, loadPortal, portalRefuse } from "../../lib/portal.svelte";
  import { BenchState, BENCH, COUPLINGS, STEP_MS, DRIFT_STEP, OVER, type BenchId } from "../../../../src/portal/bench-sim";

  let { sounds }: { sounds: Record<number, string> } = $props();

  let id = $state<BenchId>("14");
  let run = $state<{ sim: BenchState; t0: number; bleeds: [number, number][]; pending: number[] } | null>(null);
  let loads = $state<number[]>(Array(COUPLINGS).fill(0.5));
  let step = $state(0);
  let phase = $state<"idle" | "holding" | "held" | "dropped">("idle");
  let submitted = $state(false);
  let raf = 0;

  const b = $derived(portal.bench);
  const spec = $derived(BENCH[id]);
  const ex = $derived(b?.exercises.find((e) => e.id === id));
  const frac = $derived(Math.min(1, step / spec.steps));
  const breaths = $derived(id === "long" ? 0 : Math.round(spec.steps / 150));

  /** The far-end term as the bench prints it. */
  const farEnd = $derived.by(() => {
    if (!b) return null;
    if (id === "unaimed") return "unknown";
    if (id === "long" && step >= DRIFT_STEP) return b.readings.drift;
    return b.readings.zero;
  });

  async function start() {
    if (!ex?.open) return;
    cancelAnimationFrame(raf);
    try {
      const r = await api.portalBenchStart(id);
      const sim = new BenchState(id, r.seed);
      run = { sim, t0: performance.now(), bleeds: [], pending: [] };
      loads = [...sim.loads]; step = 0; phase = "holding"; submitted = false;
      raf = requestAnimationFrame(frame);
    } catch { portalRefuse(); }
  }
  function frame() {
    if (!run) return;
    const target = Math.floor((performance.now() - run.t0) / STEP_MS);
    while (run.sim.step < target && run.sim.failed === null) {
      const k = run.sim.step;
      const now = run.pending.splice(0);
      for (const c of now) run.bleeds.push([k, c]);
      run.sim.tick(now);
      if (!submitted && run.sim.step >= spec.steps && run.sim.failed === null) { submitted = true; void finish(); }
    }
    loads = [...run.sim.loads]; step = run.sim.step;
    if (run.sim.failed !== null) { phase = submitted ? "held" : "dropped"; return; }
    // The long hold keeps holding for as long as anyone watches; the rest stop at their time.
    if (submitted && id !== "long") return;
    raf = requestAnimationFrame(frame);
  }
  async function finish() {
    if (!run) return;
    try {
      const r = await api.portalBenchFinish(run.bleeds.slice());
      phase = r.held ? "held" : "dropped";
      if (r.cracked !== null || r.mark !== null) await loadPortal();
      await openBench();
    } catch { phase = "dropped"; }
  }
  function bleed(c: number) { if (phase === "holding" || (phase === "held" && id === "long" && run?.sim.failed === null)) run?.pending.push(c); }
  function key(e: KeyboardEvent) {
    if (portal.pane !== "bench") return;
    const n = Number(e.key);
    if (n >= 1 && n <= COUPLINGS) { e.preventDefault(); bleed(n - 1); }
  }
  function pick(next: BenchId) { cancelAnimationFrame(raf); run = null; phase = "idle"; id = next; step = 0; loads = Array(COUPLINGS).fill(0.5); }
  onDestroy(() => cancelAnimationFrame(raf));

  // Eight gauges round the fold.
  const G = (i: number) => { const a = (i / COUPLINGS) * Math.PI * 2 - Math.PI / 2; return { x: 200 + Math.cos(a) * 138, y: 200 + Math.sin(a) * 138, a }; };
  // The release signature: a fold released from our end, or (at 16) from its far end.
  const wave = $derived.by(() => {
    const pts: string[] = [];
    const inv = id === "16" && phase === "held" ? -1 : 1;
    for (let x = 0; x <= 120; x += 3) pts.push(`${x},${20 - inv * Math.sin(x / 9) * 14 * Math.exp(-x / 70)}`);
    return pts.join(" ");
  });
</script>

<svelte:window onkeydown={key} />

{#if b}
  <div class="bench">
    <header>
      {#each b.exercises as e (e.id)}
        <button class:on={e.id === id} class:done={e.done} disabled={!e.open} onclick={() => pick(e.id as BenchId)} aria-label="◍">
          {#if e.id === "unaimed"}<Glyph parts={STATUS_STROKES[8]} size={16} lit={e.open} />
          {:else}<GlyphText tokens={e.depth} {sounds} size={12} />{#if e.id === "long"}<span class="longbar"></span>{/if}{/if}
          {#if e.done}<i class="tick"></i>{/if}
        </button>
      {/each}
    </header>

    <div class="room">
      <svg class="fold" viewBox="0 0 400 400" role="presentation">
        <circle class="core" class:open={phase === "holding" || (phase === "held" && id === "long")} class:unaimed={id === "unaimed"} cx="200" cy="200" r={40 + (phase === "holding" ? Math.sin(step / 6) * 3 : 0)} />
        <circle class="progress" cx="200" cy="200" r="62" pathLength="1" style="stroke-dasharray:{frac} 1" />
        {#each loads as l, i (i)}
          {@const p = G(i)}
          <g class="gauge" class:hot={l > 0.85} class:slack={l < 0.18} transform="translate({p.x} {p.y})" onclick={() => bleed(i)} role="presentation">
            <rect x="-11" y="-36" width="22" height="72" rx="5" />
            <rect class="fill" x="-8" y={33 - Math.max(0, Math.min(1, l / OVER)) * 66} width="16" height={Math.max(0, Math.min(1, l / OVER)) * 66} rx="3" />
            <line class="design" x1="-13" x2="13" y1="-33" y2="-33" />
            <line class="design low" x1="-13" x2="13" y1="26.4" y2="26.4" />
          </g>
        {/each}
      </svg>

      <div class="readout">
        <div class="row"><Glyph parts={STATUS_STROKES[0]} size={16} />
          {#if farEnd === "unknown"}<Glyph parts={STATUS_STROKES[8]} lit size={18} />
          {:else if farEnd}<GlyphText tokens={farEnd} {sounds} size={13} />{/if}
        </div>
        {#if breaths}<div class="breaths">{#each Array(breaths) as _, i (i)}<b class:on={frac >= (i + 1) / breaths}></b>{/each}</div>{/if}
        <svg class="sig" viewBox="0 0 120 40"><polyline points={wave} class:held={phase === "held"} /></svg>
        <div class="act">
          {#if phase === "idle" || phase === "dropped"}
            <button class="go" disabled={!ex?.open} onclick={start} aria-label="◉">◉</button>
            {#if phase === "dropped"}<Glyph parts={STATUS_STROKES[6]} lit size={22} />{/if}
          {:else if phase === "held"}<Glyph parts={STATUS_STROKES[5]} lit size={22} /><button class="go" onclick={start} aria-label="◉">◉</button>{/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .bench { display: flex; flex-direction: column; flex: 1; min-height: 0; container-type: inline-size; }
  header { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 16px; border-bottom: 1px solid var(--p-line); }
  header button { position: relative; display: inline-flex; align-items: center; gap: 4px; min-width: 52px; height: 36px; padding: 0 8px; border: 1px solid var(--p-line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
  header button.on { background: rgba(140, 110, 220, 0.16); border-color: #3b2a6b; }
  header button:disabled { opacity: 0.3; cursor: default; }
  header button.done { border-color: #2e5b6b; }
  .longbar { width: 14px; height: 2px; background: currentColor; opacity: 0.6; }
  .tick { position: absolute; right: 3px; top: 3px; width: 5px; height: 5px; border-radius: 50%; background: #8fd3ff; }
  .room { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 200px; align-items: center; }
  .fold { width: min(100%, 520px); height: auto; max-height: 100%; aspect-ratio: 1; justify-self: center; }
  .core { fill: #05040a; stroke: #3b2a6b; stroke-width: 2; transition: r 0.1s; }
  .core.open { fill: #120c26; stroke: #8fd3ff; filter: drop-shadow(0 0 14px rgba(143, 211, 255, 0.35)); }
  .core.unaimed.open { stroke: #b49cff; filter: drop-shadow(0 0 22px rgba(180, 156, 255, 0.45)); }
  .progress { fill: none; stroke: #6b55b8; stroke-width: 2; transform: rotate(-90deg); transform-origin: 200px 200px; }
  .gauge { cursor: pointer; }
  .gauge rect { fill: #0a0814; stroke: #2a2445; stroke-width: 1.2; }
  .gauge .fill { fill: #6b9bd8; stroke: none; }
  .gauge.hot .fill { fill: #ff9b8f; }
  .gauge.slack .fill { fill: #5a4a96; }
  .gauge:hover rect:first-child { stroke: #8fd3ff; }
  .design { stroke: #ff9b8f; stroke-width: 1; opacity: 0.5; }
  .design.low { stroke: #5a4a96; }
  .readout { display: grid; gap: 12px; padding: 16px; border-left: 1px solid var(--p-line); height: 100%; align-content: center; }
  .row { display: flex; align-items: center; gap: 8px; }
  .breaths { display: flex; gap: 6px; }
  .breaths b { width: 14px; height: 6px; border-radius: 3px; background: #1d1a2c; }
  .breaths b.on { background: #8fd3ff; }
  .sig { width: 100%; height: 40px; }
  .sig polyline { fill: none; stroke: #4a4560; stroke-width: 1.4; }
  .sig polyline.held { stroke: #8fd3ff; }
  .act { display: flex; align-items: center; gap: 10px; }
  .go { width: 48px; height: 40px; border: 1px solid #3b2a6b; border-radius: 8px; background: #1a1430; color: var(--p-lit); font-size: 18px; cursor: pointer; }
  .go:disabled { opacity: 0.3; }
  /* A narrow pane: the readout under the fold. */
  @container (max-width: 600px) {
    .room { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) max-content; }
    .fold { max-height: 100%; }
    .readout { border-left: 0; border-top: 1px solid var(--p-line); height: auto; grid-template-columns: repeat(2, auto); justify-content: space-between; }
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    header button { min-height: 44px; }
    .go { min-height: 44px; }
  }
</style>
