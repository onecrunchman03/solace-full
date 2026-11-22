<script lang="ts">
  // THE SIX RUNNERS' portraits — extracted from Derby.svelte's racerArt
  // snippet (Aug 2026) so the casino floor's ticket kiosk shows THE SAME cast
  // as the 2D game (Josh: "give the actual pictures of the racers from the
  // emoji 2d game"), instead of a row of stand-in emoji. Derby renders this
  // component in its lanes/entries/card; the b-scrape/b-down boulder track
  // animations stay in Derby (they key off the .runner wrapper there).
  let { key, moving = false }: { key: string; moving?: boolean } = $props();
</script>

{#if key === "rocket"}
  <span class="art rocket" class:burn={moving}><span class="flame"></span><span class="rider">🤠</span>🚀</span>
{:else if key === "snail"}
  <span class="art snail"><span class="rider snail-rider">🧐</span>🐌</span>
{:else if key === "frog"}
  <!-- Ribbit-9000: an actual robot — riveted gunmetal-green chassis, twin
       glowing lens eyes, mouth vents, hydraulic front strut, coil-spring
       haunch, antenna. (Inline SVG, no defs/ids — the house rule.) -->
  <span class="art frog"><span class="bolt">⚡</span>
    <svg viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="14" y1="11" x2="11" y2="3.5" stroke="#4c6350" stroke-width="1.1" />
      <circle cx="11" cy="3" r="1.4" fill="#ffb347" />
      <rect x="8" y="11" width="30" height="14" rx="7" fill="#6b8a63" stroke="#3f5741" stroke-width="1.2" />
      <rect x="14" y="19" width="20" height="6" rx="3" fill="#a9bf9b" />
      <line x1="22" y1="11.6" x2="22" y2="19" stroke="#4c6350" stroke-width="0.8" />
      <circle cx="16" cy="13.6" r="0.7" fill="#3a5040" />
      <circle cx="26" cy="13" r="0.7" fill="#3a5040" />
      <circle cx="33" cy="14.2" r="0.7" fill="#3a5040" />
      <circle cx="34.5" cy="10.5" r="3.8" fill="#7d9a78" stroke="#46604a" stroke-width="1" />
      <circle cx="35.3" cy="10.5" r="2" fill="#38e2e8" />
      <circle cx="28" cy="9" r="4.6" fill="#7d9a78" stroke="#46604a" stroke-width="1" />
      <circle cx="29" cy="9" r="2.6" fill="#38e2e8" />
      <circle cx="29.9" cy="8.1" r="0.8" fill="#eafffe" />
      <rect x="34" y="19.6" width="1.5" height="3.6" rx="0.6" fill="#35493a" />
      <rect x="36.6" y="20" width="1.5" height="3" rx="0.6" fill="#35493a" />
      <circle cx="12" cy="21" r="8" fill="#57755b" stroke="#33493c" stroke-width="1.5" />
      <circle cx="12" cy="21" r="3.8" fill="#33493c" />
      <circle cx="12" cy="21" r="1.6" fill="#9fc0a4" />
      <circle cx="12" cy="15.4" r="0.8" fill="#2c3e33" />
      <circle cx="17.4" cy="21" r="0.8" fill="#2c3e33" />
      <circle cx="12" cy="26.6" r="0.8" fill="#2c3e33" />
      <circle cx="6.6" cy="21" r="0.8" fill="#2c3e33" />
      <rect x="31.5" y="24.6" width="2.4" height="4.6" fill="#4c6350" />
      <rect x="32.1" y="25.1" width="1" height="2" fill="#9fc0a4" />
      <rect x="29" y="28.6" width="8" height="2" rx="1" fill="#33493c" />
      <rect x="8" y="28.6" width="9" height="2" rx="1" fill="#33493c" />
    </svg>
  </span>
{:else if key === "nascar"}
  <!-- A proper stock car (the 🏎️ emoji is an open-wheel F1 car): full body,
       sloped greenhouse, trunk spoiler, door roundel, sponsor decals. -->
  <span class="art nascar" class:zoom={moving}>
    <svg viewBox="0 0 64 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 5 L9 7.5 L9 9.5 L3 7.5 Z" fill="#20242c" />
      <path d="M2 22 L2 13 L4 8.5 L16 5 Q24 3.5 30 5 L40 10 L56 12 Q61 13 62 16 L62 19 L58 22 Z" fill="#e5342b" />
      <path d="M17 6.4 L28 5.4 L36 9.8 L13 10.4 Z" fill="#141d28" />
      <rect x="4" y="18.6" width="52" height="1.7" fill="#f7d94c" />
      <rect x="44" y="13.4" width="7" height="2.6" rx="0.6" fill="#2bb1e0" />
      <rect x="4.5" y="10.8" width="6" height="2.4" rx="0.6" fill="#f7d94c" />
      <path d="M58 14.5 L62 16 L62 18 L58 17.5 Z" fill="#ffe9a8" />
      <circle cx="28" cy="14.5" r="5.2" fill="#fff" />
      <text x="28" y="17" text-anchor="middle" font-size="7" font-weight="900" font-family="Arial, sans-serif" fill="#111">43</text>
      <circle cx="14" cy="22" r="5" fill="#191919" />
      <circle cx="14" cy="22" r="2" fill="#8f8f98" />
      <circle cx="48" cy="22" r="5" fill="#191919" />
      <circle cx="48" cy="22" r="2" fill="#8f8f98" />
    </svg>
  </span>
{:else if key === "blob"}
  <span class="art blob" class:rolling={moving}></span>
{:else if key === "boulder"}
  <span class="art boulder">🪨</span>
{:else}
  <span class="art">❔</span>
{/if}

<style>
  .art { position: relative; display: inline-block; font-size: 1.9rem; line-height: 1; filter: drop-shadow(2px 3px 3px rgba(0, 0, 0, 0.5)); }
  .rider { position: absolute; font-size: 0.9rem; z-index: 2; }
  /* 🚀 natively points north-east; +45° lays it flat, nose at the finish. */
  .art.rocket { transform: rotate(45deg); }
  .art.rocket .rider { top: -13px; left: 50%; margin-left: -7px; transform: rotate(-45deg); }
  .art.rocket .flame {
    /* Em-based so it stays welded to the nozzle at every render size
       (px offsets drifted off the tail on the big racer-card art). */
    position: absolute;
    left: -0.08em;
    bottom: -0.08em;
    width: 0.5em;
    height: 0.5em;
    border-radius: 50%;
    background: radial-gradient(circle, #fff3c9, #ffab3c 45%, rgba(255, 90, 40, 0.5) 70%, transparent);
    opacity: 0;
  }
  .art.rocket.burn .flame { animation: burn 0.18s linear infinite; }
  @keyframes burn {
    0%, 100% { opacity: 0.95; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.7); }
  }
  .art.snail { transform: scaleX(-1); }
  .art.snail .snail-rider { top: -12px; left: 4px; transform: scaleX(-1); }
  .art.frog .bolt { position: absolute; top: -0.35em; right: -0.2em; font-size: 0.38em; }
  .art.frog svg { width: 1.3em; height: auto; display: block; }
  /* The stock car is drawn facing the finish — no flip needed. */
  .art.nascar svg { width: 1.7em; height: auto; display: block; }
  .art.nascar.zoom { animation: vroom 0.22s linear infinite; }
  @keyframes vroom {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-1.5px); }
  }
  .art.blob {
    width: 30px;
    height: 30px;
    border-radius: 46% 54% 52% 48% / 55% 47% 53% 45%;
    background: radial-gradient(circle at 34% 30%, #d29aff, #8e4fd0 60%, #5c2a92);
    box-shadow: inset 0 -4px 8px rgba(40, 10, 70, 0.5), 2px 3px 3px rgba(0, 0, 0, 0.4);
  }
  .art.blob.rolling { animation: squidge 0.45s ease-in-out infinite; }
  @keyframes squidge {
    0%, 100% { transform: scale(1, 1) rotate(0deg); border-radius: 46% 54% 52% 48% / 55% 47% 53% 45%; }
    50% { transform: scale(1.15, 0.85) rotate(180deg); border-radius: 52% 48% 46% 54% / 47% 55% 45% 53%; }
  }
</style>
