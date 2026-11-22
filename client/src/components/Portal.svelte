<script lang="ts">
  // THE PORTAL — the section the Stone of the Abyss opens. For now it is
  // the threshold: the ring of light, the phrase engraved beneath it, and
  // the way back (the rail). What lies on the far side is the next round
  // (the abandoned research Solace, its language, its history).
  import { abyss, loadAbyss } from "../lib/abyss.svelte";
  import { portal } from "../lib/portal.svelte";
  import Hall from "./portal/Hall.svelte";
  import { onMount } from "svelte";

  onMount(() => {
    if (!abyss.loaded) void loadAbyss();
  });
</script>

{#if portal.through}
  <Hall />
{:else}
<div class="void">
  <div class="nebula"></div>
  <div class="stars"></div>

  <div class="threshold">
    <button class="ring" aria-label="Step through" onclick={() => (portal.through = true)}>
      <div class="spin"></div>
      <div class="eye"></div>
    </button>
    <p class="phrase">{abyss.phrase ?? "…"}</p>
    <p class="foot">Solace is behind you.</p>
  </div>
</div>
{/if}

<style>
  .void {
    position: relative;
    height: 100%;
    min-height: 100%;
    overflow: hidden;
    background: #04020b;
    color: #d9c9ff;
    display: grid;
    place-items: center;
  }
  .nebula {
    position: absolute;
    inset: -30%;
    background:
      radial-gradient(40% 35% at 40% 45%, rgba(110, 40, 210, 0.28), transparent 70%),
      radial-gradient(35% 30% at 62% 58%, rgba(60, 20, 140, 0.3), transparent 70%),
      radial-gradient(25% 25% at 50% 50%, rgba(200, 140, 255, 0.12), transparent 70%);
    animation: drift 60s linear infinite;
    will-change: transform;
  }
  .stars {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(1px 1px at 12% 22%, rgba(255, 255, 255, 0.7), transparent 60%),
      radial-gradient(1px 1px at 78% 18%, rgba(255, 255, 255, 0.5), transparent 60%),
      radial-gradient(1.5px 1.5px at 33% 71%, rgba(210, 190, 255, 0.7), transparent 60%),
      radial-gradient(1px 1px at 88% 64%, rgba(255, 255, 255, 0.45), transparent 60%),
      radial-gradient(1px 1px at 55% 88%, rgba(255, 255, 255, 0.5), transparent 60%),
      radial-gradient(1.5px 1.5px at 8% 82%, rgba(210, 190, 255, 0.6), transparent 60%),
      radial-gradient(1px 1px at 66% 34%, rgba(255, 255, 255, 0.55), transparent 60%),
      radial-gradient(1px 1px at 24% 48%, rgba(255, 255, 255, 0.4), transparent 60%),
      radial-gradient(1px 1px at 92% 40%, rgba(255, 255, 255, 0.5), transparent 60%),
      radial-gradient(1px 1px at 45% 12%, rgba(255, 255, 255, 0.35), transparent 60%);
    opacity: 0.8;
  }
  .threshold {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 22px;
    padding: 24px;
  }
  .ring {
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
    position: relative;
    width: min(46vmin, 320px);
    height: min(46vmin, 320px);
    border-radius: 50%;
    display: grid;
    place-items: center;
    box-shadow: 0 0 60px rgba(150, 80, 255, 0.45), 0 0 140px rgba(90, 30, 200, 0.35);
  }
  .spin {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, rgba(200, 150, 255, 0.05), rgba(220, 180, 255, 0.9) 12%, rgba(120, 50, 230, 0.2) 30%, rgba(200, 150, 255, 0.05) 50%, rgba(220, 180, 255, 0.8) 62%, rgba(120, 50, 230, 0.15) 80%, rgba(200, 150, 255, 0.05));
    -webkit-mask: radial-gradient(circle, transparent 62%, #000 64%, #000 100%);
    mask: radial-gradient(circle, transparent 62%, #000 64%, #000 100%);
    animation: turn 14s linear infinite;
    will-change: transform;
  }
  .eye {
    width: 62%;
    height: 62%;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, #ffffff 0%, #d9b8ff 10%, #7a35e6 32%, #1b0838 62%, #05020b 100%);
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(170, 100, 255, 0.6);
    animation: pulse 4.5s ease-in-out infinite;
  }
  .phrase {
    margin: 0;
    font-style: italic;
    font-size: 1.15rem;
    letter-spacing: 0.14em;
    color: #efe4ff;
    text-shadow: 0 0 16px rgba(170, 100, 255, 0.7);
    text-align: center;
  }
  .foot {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    color: #6d5d99;
  }
  @keyframes turn {
    to { transform: rotate(360deg); }
  }
  /* The threshold is a still picture for anyone who asked for one: two of
     these run forever on a full-viewport element. */
  @media (prefers-reduced-motion: reduce) {
    .nebula,
    .spin,
    .eye {
      animation: none !important;
      will-change: auto;
    }
  }
  @keyframes drift {
    to { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
</style>
