<script lang="ts">
  // SOLACE SURVIVORZ — the Vault Lobby look test (Admin Panel → Survivorz → Look test).
  // docs/survivorz/ASSETS.md step C: Josh judges it. The scene is ./lobby.ts.
  import { onDestroy, onMount } from "svelte";
  import { Lobby, LOOK_ZONES as ZONES, type LobbyStatus, type LookZoneId as ZoneId } from "./lobby";

  let host: HTMLDivElement;
  let lobby: Lobby | null = null;
  let status = $state<LobbyStatus>({ phase: "starting", frac: 0 });
  let exposure = $state(1.0);
  let mains = $state(false);
  let bloom = $state(true);
  let door = $state(0);
  let soundOn = $state(false);
  let stats = $state({ draws: 0, tris: 0, lights: 0 });
  let resize: ResizeObserver | null = null;
  let tick = 0;
  // the bunker, and Glenridge Hall's four zones (the next map: in here before the show can play it)
  let zone = $state<ZoneId>("bunker");
  function pick(z: ZoneId): void { zone = z; open(z); }

  function open(z: ZoneId): void {
    lobby?.dispose();
    status = { phase: "starting", frac: 0 };
    const l = new Lobby(host, z);
    lobby = l;
    (window as unknown as { __lobby?: Lobby }).__lobby = l;   // the review hook (like the casino's __cas)
    l.onStatus = (s) => (status = { ...s });
    l.fit();
    l.mains = false; mains = false;
    l.load().catch((e) => (status = { phase: "failed", frac: 0, error: String(e?.message ?? e) }));
  }

  onMount(() => {
    open(zone);
    resize = new ResizeObserver(() => lobby?.fit());
    resize.observe(host);
    tick = window.setInterval(() => { if (lobby) stats = lobby.stats(); }, 1000);
  });
  onDestroy(() => {
    window.clearInterval(tick);
    resize?.disconnect();
    lobby?.dispose();
    lobby = null;
  });

  $effect(() => { if (lobby) lobby.exposure = exposure; });
  $effect(() => { if (lobby) lobby.bloomOn = bloom; });
  $effect(() => { if (lobby) lobby.doorOpen = door; });
  $effect(() => { if (lobby) lobby.mains = mains; });

  async function sound(): Promise<void> {
    if (!lobby || soundOn) return;
    await lobby.startSound();
    soundOn = true;
  }
</script>

<div class="look">
  <div class="stage" bind:this={host}></div>
  {#if status.phase !== "ready"}
    <div class="loading">
      {#if status.error}<p class="err">{status.error}</p>{:else}<p>Loading {status.phase}…</p><div class="bar"><span style:width={`${Math.round(status.frac * 100)}%`}></span></div>{/if}
    </div>
  {/if}
  <div class="panel">
    <select value={zone} onchange={(e) => pick((e.currentTarget as HTMLSelectElement).value as ZoneId)}>
      {#each Object.entries(ZONES) as [k, z] (k)}<option value={k}>{z.label}</option>{/each}
    </select>
    <div class="shots">
      {#each Object.entries(ZONES[zone].layout.shots) as [k, s] (k)}<button onclick={() => lobby?.shot(k)}>{s.label}</button>{/each}
    </div>
    <label>Exposure <input type="range" min="0.3" max="2.5" step="0.05" bind:value={exposure} /> <b>{exposure.toFixed(2)}</b></label>
    <label>Vault door <input type="range" min="0" max="1" step="0.01" bind:value={door} /></label>
    <label class="row"><input type="checkbox" bind:checked={bloom} /> Glow</label>
    <label class="row"><input type="checkbox" bind:checked={mains} /> Power on (mains)</label>
    <button onclick={sound} disabled={soundOn}>{soundOn ? "Sound on" : "Turn sound on"}</button>
    <p class="small">{stats.draws} draws · {(stats.tris / 1000).toFixed(0)}k triangles · {stats.lights} lights · WASD to move, Q / E down / up, Shift faster, drag to look, scroll for speed</p>
  </div>
</div>

<style>
  .look { position: relative; flex: 1; min-height: 0; display: flex; }
  .stage { flex: 1; min-height: 520px; background: #000; border-radius: 8px; overflow: hidden; }
  .stage :global(canvas) { display: block; width: 100%; height: 100%; }
  .loading { position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; color: #cfd6dc; pointer-events: none; }
  .loading p { margin: 0; text-align: center; }
  .bar { width: 260px; height: 4px; background: #222; border-radius: 2px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); }
  .err { color: var(--danger); }
  .panel {
    position: absolute; top: 10px; left: 10px; width: 250px; display: flex; flex-direction: column; gap: 8px;
    background: rgba(10, 12, 14, 0.82); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px; color: #dfe5ea; font-size: 0.82rem;
  }
  .shots { display: flex; flex-wrap: wrap; gap: 5px; }
  button { background: #1c2024; color: #dfe5ea; border: 1px solid #333a40; border-radius: 6px; padding: 4px 8px; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  label { display: flex; align-items: center; gap: 6px; }
  label input[type="range"] { flex: 1; }
  .row { flex-direction: row; }
  .small { margin: 0; color: #8d979f; font-size: 0.75rem; }
</style>
