<script lang="ts">
  // Live server stats for the Admin Panel: polls /api/admin/stats every 5s
  // while mounted. Numbers over charts — a friend-group box needs a glance,
  // not Grafana. The CPU/RAM bars use the same accent language as the rest
  // of the app.
  import { onMount, onDestroy } from "svelte";
  import { api, type PerfSample } from "../lib/api";

  let now = $state<PerfSample | null>(null);
  let samples = $state<PerfSample[]>([]);
  let err = $state("");
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh(): Promise<void> {
    try {
      const r = await api.adminStats();
      now = r.now;
      samples = r.samples;
      err = "";
    } catch {
      err = "Couldn't reach the stats endpoint.";
    }
  }

  onMount(() => {
    void refresh();
    timer = setInterval(() => void refresh(), 5000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const memPct = $derived(now && now.memTotalMb > 0 ? Math.round((now.memUsedMb / now.memTotalMb) * 100) : 0);
  const diskTotal = $derived(now ? now.diskUsedGb + now.diskFreeGb : 0);
  const diskPct = $derived(now && diskTotal > 0 ? Math.round((now.diskUsedGb / diskTotal) * 100) : 0);
  const fmtKbps = (v: number | null) =>
    v === null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(1)} Mbit/s` : `${v} kbit/s`;
  /** Peak CPU over the retained history, for a sense of headroom. */
  const peakCpu = $derived(samples.reduce((m, s) => Math.max(m, s.cpu), 0));
</script>

<div class="stats">
  {#if err}<p class="err">{err}</p>{/if}
  {#if now}
    <div class="grid">
      <div class="stat">
        <span class="s-label">APP CPU</span>
        <span class="s-val">{now.cpu}%</span>
        <div class="bar"><div class="fill" class:hot={now.cpu > 80} style="width:{Math.min(100, now.cpu)}%"></div></div>
        <span class="s-sub">of one core · peak {Math.round(peakCpu)}% (7d) · load {now.load1}</span>
      </div>
      <div class="stat">
        <span class="s-label">MEMORY</span>
        <span class="s-val">{(now.rssMb / 1000).toFixed(2)} GB app</span>
        <div class="bar"><div class="fill" class:hot={memPct > 90} style="width:{memPct}%"></div></div>
        <span class="s-sub">system {memPct}% of {(now.memTotalMb / 1000).toFixed(1)} GB · heap {now.heapMb} MB</span>
      </div>
      <div class="stat">
        <span class="s-label">DISK</span>
        <span class="s-val">{now.diskFreeGb.toFixed(1)} GB free</span>
        <div class="bar"><div class="fill" class:hot={diskPct > 90} style="width:{diskPct}%"></div></div>
        <span class="s-sub">{now.diskUsedGb.toFixed(1)} / {diskTotal.toFixed(1)} GB used</span>
      </div>
      <div class="stat">
        <span class="s-label">BANDWIDTH</span>
        <span class="s-val">↓ {fmtKbps(now.netRxKbps)}</span>
        <span class="s-val dim">↑ {fmtKbps(now.netTxKbps)}</span>
        <span class="s-sub">system-wide (Linux interfaces, loopback excluded)</span>
      </div>
      <div class="stat">
        <span class="s-label">CONNECTIONS</span>
        <span class="s-val">{now.wsClients} live sockets</span>
        <span class="s-sub">{now.httpReqs} HTTP requests in the last 15s window</span>
      </div>
      {#if now.loopP99Ms !== undefined}
        <div class="stat">
          <span class="s-label">EVENT LOOP</span>
          <span class="s-val">{now.loopP99Ms} ms p99</span>
          <div class="bar"><div class="fill" class:hot={(now.loopMaxMs ?? 0) >= 200} style="width:{Math.min(100, ((now.loopMaxMs ?? 0) / 250) * 100)}%"></div></div>
          <span class="s-sub">worst {now.loopMaxMs} ms in the last 15s · past 200 ms, players feel a hitch</span>
        </div>
      {/if}
    </div>
  {:else}
    <p class="muted">Sampling…</p>
  {/if}
</div>

<style>
  .stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 10px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  .s-label {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    color: var(--ink-dim);
  }
  .s-val {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .s-val.dim {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .s-sub {
    font-size: 0.7rem;
    color: var(--ink-dim);
  }
  .bar {
    height: 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    transition: width 400ms ease;
  }
  .fill.hot {
    background: var(--danger);
  }
  .err {
    color: var(--danger);
    font-size: 0.82rem;
  }
  .muted {
    color: var(--ink-dim);
  }
</style>
