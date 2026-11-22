<script lang="ts">
  let { onEnter }: { onEnter: () => void } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") onEnter();
  }
</script>

<svelte:window onkeydown={onKey} />

<button class="title" onclick={onEnter} aria-label="Enter">
  <div class="glow"></div>
  <div class="mark">
    <span class="solace">SOLACE</span>
    <span class="rooms">BACKROOMS</span>
  </div>
  <p class="tag">you no-clipped out of reality.</p>
  <p class="press">press enter</p>
  <p class="foot">an ASYNC field program · level 0 · sector A</p>
</button>

<style>
  .title {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    background: var(--void);
    border: none;
    color: inherit;
    cursor: pointer;
    overflow: hidden;
  }
  /* The light from a room you can't see. */
  .glow {
    position: absolute;
    inset: -20%;
    background:
      radial-gradient(ellipse 60% 45% at 50% 110%, rgba(201, 178, 106, 0.16), transparent 70%),
      radial-gradient(ellipse 40% 30% at 18% -8%, rgba(201, 178, 106, 0.07), transparent 70%);
    animation: breathe 7s ease-in-out infinite;
    pointer-events: none;
  }
  .mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 0.95;
    letter-spacing: 0.42em;
    text-indent: 0.42em;
  }
  .solace {
    font-size: 1.1rem;
    font-weight: 300;
    color: var(--ink-soft);
  }
  .rooms {
    font-size: 3.4rem;
    font-weight: 800;
    color: var(--yellow);
    text-shadow: 0 0 34px rgba(201, 178, 106, 0.35);
    animation: buzz 6s steps(1) infinite;
  }
  .tag {
    margin: 4px 0 0;
    font-size: 0.85rem;
    color: var(--ink-dim);
    font-style: italic;
  }
  .press {
    margin: 26px 0 0;
    font-size: 0.8rem;
    letter-spacing: 0.3em;
    text-indent: 0.3em;
    text-transform: uppercase;
    color: var(--ink-soft);
    animation: breathe 2.6s ease-in-out infinite;
  }
  .foot {
    position: absolute;
    bottom: 18px;
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.18em;
    color: var(--ink-dim);
  }
</style>
