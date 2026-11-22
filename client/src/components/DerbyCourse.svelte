<script lang="ts">
  // THE RACETRACK ITSELF — grandstand, lanes, runners, infield markers.
  //
  // Lifted out of Derby.svelte (Aug 2026) so THE CASINO'S JUMBOTRON CAN MOUNT
  // THE REAL THING. Josh: "i would like you to put the same screen someone
  // would see in the 2d casino." The jumbo used to redraw an approximation of
  // this onto a canvas texture, and an approximation is exactly what he kept
  // rejecting — so the hall now renders THIS component, in 3D, on the screen
  // above the bar (see casino/jumbo.ts). Same markup, same CSS, same clock.
  //
  // It is pure presentation: state in, pixels out, no store reads and no
  // fetches, which is what makes it safe to mount twice.
  import RacerArt from "./RacerArt.svelte";
  import type { DerbyState } from "../lib/api";

  let {
    st,
    progress,
    racing,
    showResult,
    boulderDown = false,
    lite = false,
  }: {
    st: DerbyState | null;
    /** 0..1 per racer, in `st.racers` order. */
    progress: number[];
    racing: boolean;
    showResult: boolean;
    boulderDown?: boolean;
    /** The casino's big screen: the crowd and bunting hold still (Oct 2026 —
     *  43 animated emoji repainted every frame inside a 3D-transformed layer
     *  was most of what a race cost the floor). The runners still run. */
    lite?: boolean;
  } = $props();

  /** Measured lane width — the runner's travel is (laneW - 106) so it stops
   *  ON the finish line rather than past it. Owned here now that the track is. */
  let laneW = $state(0);

  // ---- The grandstand crowd ----
  // Deterministic variety (index math, not Math.random) so rerenders never
  // reshuffle anyone's seat. A few fans are on their feet cheering even
  // between races; during one, the whole stand comes alive.
  const HEADS = ["🧑", "👩", "🧔", "👨‍🦱", "👵", "🧒", "👱‍♀️", "👨‍🦰", "🧑‍🦳", "👴", "👦", "👧"];
  const CHEERING = ["🙋", "🙆", "🙋‍♂️", "🙆‍♀️"];
  function mkTier(n: number, salt: number) {
    return Array.from({ length: n }, (_, i) => {
      const stand = (i * 31 + salt * 17) % 5 === 0;
      return {
        head: stand ? CHEERING[(i + salt) % CHEERING.length] : HEADS[(i * 7 + salt * 3) % HEADS.length],
        stand,
        d: (i * 37 + salt * 11) % 10,
      };
    });
  }
  const TIER_BACK = mkTier(16, 1);
  const TIER_FRONT = mkTier(13, 2);
</script>

<div class="course" class:still={!racing && !showResult} class:lite>
  <!-- Grandstand: bunting over bleacher benches, fans in two tiers -->
  <div class="stands" class:hyped={racing} aria-hidden="true">
    <div class="bunting">
      {#each Array(14) as _, i}<span class="flag" style="--i:{i}"></span>{/each}
    </div>
    <div class="tier back">
      {#each TIER_BACK as c, i (i)}<span class="spec" class:standing={c.stand} style="--d:{c.d}">{c.head}</span>{/each}
    </div>
    <div class="tier front">
      {#each TIER_FRONT as c, i (i)}<span class="spec" class:standing={c.stand} style="--d:{c.d}">{c.head}</span>{/each}
    </div>
  </div>

  <div class="track" bind:clientWidth={laneW}>
    {#each st?.racers ?? [] as r, i (r.key)}
      <div class="lane">
        <span class="gate" aria-hidden="true"></span>
        <span class="lane-no">{i + 1}</span>
        <!-- Trails use the runner's own offset math so they end AT the
             runner instead of overshooting the finish line. -->
        {#if r.key === "snail"}
          <span class="slime" style="clip-path: inset(0 {100 - (progress[i] ?? 0) * 100}% 0 0)"></span>
        {/if}
        {#if r.key === "nascar" && racing}
          <span class="skid" style="clip-path: inset(0 {100 - (progress[i] ?? 0) * 100}% 0 0)"></span>
        {/if}
        {#if r.key === "boulder" && racing}
          <span class="scratch" style="clip-path: inset(0 {100 - (progress[i] ?? 0) * 100}% 0 0)"></span>
        {/if}
        <div
          class="runner"
          class:hopping={r.key === "frog" && racing}
          class:b-scrape={r.key === "boulder" && racing && (progress[i] ?? 0) > 0 && !boulderDown}
          class:b-down={r.key === "boulder" && boulderDown}
          style="transform: translateX({(progress[i] ?? 0) * Math.max(0, laneW - 106)}px)"
        >
          <RacerArt key={r.key} moving={racing} />
          <!-- Dust only when actually moving (parked at the gate during the
               countdown = no dust; art still revs, which is the fun part). -->
          {#if racing && (progress[i] ?? 0) > 0 && !(r.key === "boulder" && boulderDown)}
            <span class="dust" aria-hidden="true"></span>
          {/if}
        </div>
        <span class="finish-line"></span>
        {#if showResult && st && st.placings.indexOf(r.key) >= 0 && st.placings.indexOf(r.key) < 3}
          <span class="lane-win" class:place2={st.placings.indexOf(r.key) === 1} class:place3={st.placings.indexOf(r.key) === 2}>
            {["🥇 WINNER", "🥈 2ND", "🥉 3RD"][st.placings.indexOf(r.key)]}
          </span>
        {/if}
      </div>
    {/each}
  </div>
  <div class="infield" aria-hidden="true">
    <span class="marker">¼</span><span class="marker">½</span><span class="marker">¾</span>
  </div>
</div>

<style>
  .course {
    /* NEVER SHRINK. This is `overflow: hidden` (the runners ride off the left
       edge and must be clipped), which gives it an automatic minimum size of
       zero — so as a flex item in a column that is short of room it is the
       first thing squashed, and it goes all the way to its borders with the
       whole track still drawn inside. On a phone that read as "the race
       doesn't show". The height comes from the lanes; it is not negotiable. */
    flex: none;
    max-width: 880px;
    width: 100%;
    margin: 0 auto;
    border-radius: 16px;
    overflow: hidden;
    border: 2px solid rgba(120, 84, 30, 0.8);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  }
  .stands {
    position: relative;
    /* Dusk sky under the bunting; each tier below is its own bench. */
    background: linear-gradient(180deg, #2c3a55, #3a3450);
    padding: 15px 0 0;
  }
  .bunting {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 12px;
    display: flex;
    justify-content: space-around;
  }
  .flag {
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 10px solid #c2242c;
    animation: flap 1.6s ease-in-out infinite;
    animation-delay: calc(var(--i) * -0.2s);
    transform-origin: top center;
  }
  .flag:nth-child(3n) { border-top-color: #eab348; }
  .flag:nth-child(3n + 1) { border-top-color: #f2ead8; }
  .course.still .flag,
  .course.still .spec { animation-play-state: paused; }
  @keyframes flap {
    0%, 100% { transform: skewX(0deg); }
    50% { transform: skewX(8deg); }
  }
  .tier {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-around;
    white-space: nowrap;
    overflow: hidden;
    /* Each row of fans sits on a slatted wooden bench with a riser below. */
    padding: 3px 10px 2px;
    background:
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.18) 0 2px, transparent 2px 26px),
      linear-gradient(180deg, #6b5138, #4a3826);
    border-top: 1px solid rgba(255, 255, 255, 0.09);
    border-bottom: 4px solid #2b2015;
  }
  .tier.back {
    font-size: 0.82rem;
    background:
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.18) 0 2px, transparent 2px 22px),
      linear-gradient(180deg, #57422c, #3c2e1f);
  }
  .tier.back .spec { opacity: 0.85; }
  .tier.front { font-size: 1.05rem; }
  .spec {
    display: inline-block;
    line-height: 1.1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
    transform-origin: 50% 100%;
  }
  /* Fans on their feet wave even between races… */
  .spec.standing { animation: cheer 0.95s ease-in-out infinite; animation-delay: calc(var(--d) * -0.09s); }
  @keyframes cheer {
    0%, 100% { transform: translateY(-3px) scale(1.14); }
    50% { transform: translateY(-6px) scale(1.14); }
  }
  /* …and during one, the whole stand comes alive. */
  .hyped .spec { animation: bob 0.55s ease-in-out infinite; animation-delay: calc(var(--d) * -0.055s); }
  @keyframes bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .hyped .spec.standing { animation: cheer 0.5s ease-in-out infinite; animation-delay: calc(var(--d) * -0.05s); }

  .track {
    background:
      repeating-linear-gradient(90deg, transparent 0 90px, rgba(0, 0, 0, 0.06) 90px 92px),
      repeating-linear-gradient(0deg, rgba(122, 84, 36, 0.5) 0 52px, rgba(100, 68, 26, 0.5) 52px 104px),
      linear-gradient(180deg, #8a6432, #6b4c22);
  }
  .lane {
    position: relative;
    height: 52px;
    border-bottom: 1px dashed rgba(240, 220, 170, 0.3);
  }
  .lane:last-child { border-bottom: none; }
  .gate {
    position: absolute;
    left: 22px;
    top: 4px;
    bottom: 4px;
    width: 4px;
    border-radius: 2px;
    background: linear-gradient(180deg, #d8d8de, #8a8a92);
    box-shadow: 1px 0 2px rgba(0, 0, 0, 0.5);
  }
  .lane-no {
    position: absolute;
    left: 5px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.62rem;
    font-weight: 900;
    color: rgba(240, 220, 170, 0.55);
  }
  .runner {
    position: absolute;
    top: 3px;
    left: 30px;
    z-index: 2;
    will-change: transform;
  }
  /* The hop lives on the ART, not the runner — the runner's inline translateX
     carries race position, and a transform ANIMATION on the same element
     would override it (the frog hopped in place at the gate). */
  .runner.hopping :global(.art) { animation: hop 0.34s cubic-bezier(0.3, 0, 0.4, 1) infinite; }
  @keyframes hop {
    0%, 100% { transform: translateY(0); }
    45% { transform: translateY(-14px); }
  }
  .dust {
    position: absolute;
    left: -12px;
    bottom: 4px;
    width: 14px;
    height: 8px;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(222, 198, 150, 0.55), transparent 70%);
    animation: puff 0.5s ease-out infinite;
  }
  @keyframes puff {
    from { opacity: 0.8; transform: scale(0.6) translateX(0); }
    to { opacity: 0; transform: scale(1.5) translateX(-10px); }
  }
  /* Trails are full-length boxes revealed by an inline clip-path (paint, not
     layout): the mark pattern stays fixed on the track and gets uncovered as
     the runner passes — dashes never stretch. */
  .slime {
    position: absolute;
    left: 30px;
    top: 60%;
    width: calc(100% - 106px);
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(90deg, rgba(120, 220, 120, 0.05), rgba(140, 235, 130, 0.4));
    box-shadow: 0 0 8px rgba(130, 230, 120, 0.35);
    z-index: 1;
  }
  .skid {
    position: absolute;
    left: 30px;
    top: 68%;
    width: calc(100% - 106px);
    height: 3px;
    background: repeating-linear-gradient(90deg, rgba(30, 22, 12, 0.5) 0 10px, transparent 10px 22px);
    z-index: 1;
  }
  /* The boulder's gouge: a torn-up groove with kicked-out dirt above it. */
  .scratch {
    position: absolute;
    left: 30px;
    top: 58%;
    width: calc(100% - 106px);
    height: 7px;
    border-radius: 3px;
    background:
      repeating-linear-gradient(90deg, rgba(58, 40, 20, 0.75) 0 14px, rgba(30, 20, 10, 0.55) 14px 20px),
      linear-gradient(180deg, rgba(90, 65, 35, 0.4), rgba(25, 16, 8, 0.6));
    box-shadow: 0 -2px 3px rgba(222, 198, 150, 0.25);
    z-index: 1;
  }
  .finish-line {
    position: absolute;
    right: 58px;
    top: 0;
    bottom: 0;
    width: 7px;
    background: repeating-conic-gradient(#f2ead8 0% 25%, #23262b 0% 50%) 0 0 / 7px 7px;
    opacity: 0.9;
  }
  .lane-win {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #ffd97a;
    text-shadow: 0 0 8px rgba(234, 179, 72, 0.8);
  }
  .lane-win.place2 { color: #d7dde6; text-shadow: 0 0 8px rgba(200, 210, 225, 0.7); }
  .lane-win.place3 { color: #e0a970; text-shadow: 0 0 8px rgba(205, 140, 80, 0.7); }
  .infield {
    display: flex;
    justify-content: space-around;
    padding: 3px 60px;
    background: linear-gradient(180deg, #2e4a2a, #223a20);
    border-top: 2px solid rgba(240, 220, 170, 0.4);
  }
  .marker { font-size: 0.62rem; font-weight: 800; color: rgba(240, 230, 200, 0.5); }

  /* ---- Racer art ---- */
  /* .art + the per-runner looks live in RacerArt.svelte (shared with the
     casino kiosk); only the track-contextual animations remain here. */
  /* The boulder never rolls — it sits, then SLIDES, scraping the track. */
  .runner.b-scrape :global(.art.boulder) { animation: scrape 0.08s linear infinite; }
  @keyframes scrape {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-1px) rotate(-2deg); }
  }
  /* The pratfall: a proud scoot, a wobble, and over it goes. */
  .runner.b-down :global(.art.boulder) {
    animation: keel 0.8s cubic-bezier(0.5, 0, 0.8, 1) forwards;
    transform-origin: 80% 90%;
  }
  @keyframes keel {
    0% { transform: rotate(0deg); }
    35% { transform: rotate(-8deg); }
    75% { transform: rotate(98deg) translateY(2px); }
    85% { transform: rotate(88deg) translateY(1px); }
    100% { transform: rotate(94deg) translateY(2px); }
  }
  @media (max-width: 700px) {
    .tier.back { font-size: 0.66rem; }
    .tier.front { font-size: 0.82rem; }
  }
  /* the big screen (see the lite prop): fans and flags hold still */
  .course.lite .stands .spec,
  .course.lite .stands .flag { animation: none; }
</style>
