<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { api, type SelfUser, type DoorStatus } from "../lib/api";

  let { me, onLogout, onEnterDoor }: { me: SelfUser; onLogout: () => void; onEnterDoor: (door: number) => void } = $props();

  let status = $state<DoorStatus | null>(null);
  let poll = 0;
  onMount(() => {
    const refresh = () => api.status().then((s) => (status = s)).catch(() => {});
    void refresh();
    poll = window.setInterval(refresh, 8000);
  });
  onDestroy(() => clearInterval(poll));

  // The four entries into Sector A — DOORS into one shared world, not
  // instances (hard cap 16 inside at once). Names match the world
  // generator's placements. Live occupancy counts arrive with the lobby
  // polish pass.
  const DOORS = [
    { n: "I", name: "North Stair", blurb: "A stairwell that shouldn't have a down." },
    { n: "II", name: "Freight Lift", blurb: "The buttons are worn blank. It only goes one place." },
    { n: "III", name: "Flood Drain", blurb: "Dry for decades. The hum is louder here." },
    { n: "IV", name: "Maintenance Hatch", blurb: "Someone left it open. Someone." },
  ];
</script>

<div class="menu">
  <header>
    <div class="brand">
      <span class="s">SOLACE</span><span class="b">BACKROOMS</span>
    </div>
    <div class="who">
      <span class="name">{me.displayName}</span>
      <button class="out" onclick={onLogout}>sign out</button>
    </div>
  </header>

  <main>
    <p class="section">
      SECTOR A · LEVEL 0 · CHOOSE YOUR DOOR
      {#if status}<span class="inside-now">{status.inside} / {status.cap} inside · {((status.exploredCells / status.totalCells) * 100).toFixed(1)}% charted</span>{/if}
    </p>
    <div class="doors">
      {#each DOORS as d, i (d.n)}
        <button class="door" onclick={() => onEnterDoor(i)} disabled={status != null && status.inside >= status.cap}>
          <span class="numeral">{d.n}</span>
          <span class="dname">{d.name}</span>
          <span class="blurb">{d.blurb}</span>
          <span class="occ" class:live={(status?.doors[i]?.inside ?? 0) > 0}>
            {#if status}{status.doors[i]?.inside ? `${status.doors[i].inside} inside · ` : ""}enter ▸{:else}enter ▸{/if}
          </span>
        </button>
      {/each}
    </div>

    <div class="lower">
      <button class="station" disabled title="Coming with the economy phase.">
        <span class="st-name">THE LOCKER</span>
        <span class="st-sub">your gear survives between runs — until it doesn't</span>
      </button>
      <button class="station" disabled title="Coming with the economy phase.">
        <span class="st-name">THRESHOLD-4</span>
        <span class="st-sub">Dr. Ada Voss · ASYNC field exchange</span>
      </button>
      <button class="station" disabled title="Coming with the stats phase.">
        <span class="st-name">FIELD RECORD</span>
        <span class="st-sub">depth · relics · time in the yellow · deaths</span>
      </button>
    </div>
  </main>

  <footer>
    <span>SolaceBackrooms 0.2.0 — B2 slice: the world is walkable. Gear, Voss, and the rest arrive in B3.</span>
  </footer>
</div>

<style>
  .menu {
    height: 100%;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(ellipse 75% 50% at 50% 118%, rgba(201, 178, 106, 0.12), transparent 72%),
      var(--void);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 26px 0;
  }
  .brand {
    display: flex;
    gap: 8px;
    align-items: baseline;
    letter-spacing: 0.28em;
  }
  .brand .s {
    font-size: 0.72rem;
    font-weight: 300;
    color: var(--ink-dim);
  }
  .brand .b {
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--yellow);
    animation: buzz 8s steps(1) infinite;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .name {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .out {
    background: none;
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 4px 10px;
    color: var(--ink-dim);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .out:hover {
    color: var(--ink);
    border-color: var(--ink-dim);
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 22px;
    padding: 0 clamp(20px, 6vw, 70px);
    min-height: 0;
  }
  .section {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.34em;
    color: var(--ink-dim);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .inside-now {
    letter-spacing: 0.1em;
    color: var(--ink-soft);
  }
  .occ.live {
    color: #5cdc78;
  }
  .door:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .doors {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
  }
  .door {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 7px;
    padding: 20px 18px 16px;
    min-height: 168px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 4px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }
  .door:disabled {
    cursor: default;
    opacity: 0.75;
  }
  .door:not(:disabled):hover {
    border-color: var(--yellow);
    transform: translateY(-2px);
  }
  .numeral {
    font-size: 1.8rem;
    font-weight: 800;
    color: var(--yellow);
    line-height: 1;
  }
  .dname {
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .blurb {
    flex: 1;
    font-size: 0.76rem;
    color: var(--ink-dim);
    font-style: italic;
  }
  .occ {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    color: var(--ink-soft);
  }
  .lower {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
  }
  .station {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    padding: 13px 16px;
    background: var(--panel-2);
    border: 1px dashed var(--line);
    border-radius: 4px;
    color: inherit;
    text-align: left;
    opacity: 0.65;
    cursor: default;
  }
  .st-name {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: var(--ink-soft);
  }
  .st-sub {
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  footer {
    padding: 12px 26px 16px;
    font-size: 0.68rem;
    color: var(--ink-dim);
  }
</style>
