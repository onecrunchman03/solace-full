<script lang="ts">
  // The rail's section icons. Third pass (Josh, Sep 2026: "a bit less
  // generic looking" — a bubble, an envelope, a chip and a door could be any
  // app's rail). Each glyph is now drawn from something that exists ONLY in
  // Solace, the way GameIcon draws each game from its real signature: the
  // brand's own ring mark, a letter sealed with that mark, the Wheel with
  // its death wedge and mystery slot, the yellow corridor under a hum-light,
  // the stone under the BLOOD moon, a laurel round the winner, Sterling
  // himself, a note nailed to the board, the manual open at the ring, and
  // the Foundry's anvil under the house key. GameIcon's rules still hold —
  // one prop, flat fills, no <defs> so instances never collide on ids — and
  // the TILE carries the hue (RAIL_TILES + App's .ico), so every glyph stays
  // cream with one shaded facet away from the top-left light. Big shapes
  // only: it has to read at 26px.
  let { section, size = 26 }: { section: string; size?: number } = $props();

  const CREAM = "#fbf7ee";
  const MID = "#ece4d2"; // a second, gentler facet (the corridor's near wall)
  const SHADE = "#d6ccb8"; // the facet away from the top-left light
  const DARK = "rgba(20, 12, 6, 0.58)"; // a hole in the cream (a doorway, a dot)
  const VOID = "rgba(10, 7, 3, 0.86)"; // the corridor's far end
  const SEAL = "#d7343f";
  const SEAL_DK = "#9c1f28";
  const GOLD = "#ffd35c";
  const GOLD_DK = "#c08a1c";
  const CYAN = "#7fe6ec"; // Sterling's goggle lenses
</script>

<script module lang="ts">
  // The tile hue per section. App.svelte pours this into --tile on the
  // icon's tile, which is the whole reason the glyphs can stay cream.
  export const RAIL_TILES: Record<string, string> = {
    pages: "#2f9a95",
    dms: "#c94f66",
    casino: "#c8323d",
    backrooms: "#d1af2e",
    // the bunker's sickly green — the show is its own room, not the casino's
    survivorz: "#4f7f2a",
    pandora: "#8a4fc9",
    portal: "#5a2bb3",
    graveyard: "#5d4f93",
    leaderboards: "#d4941f",
    market: "#cf6e2c",
    // Steel — the Foundry's own desk, deliberately cooler than the Market's
    // copper so the two never read as the same room at a glance.
    feedback: "#3f9d68",
    howto: "#4a82c9",
    admin: "#7d4fb6",
  };
</script>

<svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" class="railicon">
  {#if section === "pages"}
    <!-- the Solace mark itself: the open speech-bubble ring from
         favicon.svg (scaled 0.75), tail down-left, the lower-right of the
         ring in shade -->
    <path d="M39.8 13.5A16.5 16.5 0 1 0 41.8 24.6" stroke={CREAM} stroke-width="6.4" stroke-linecap="round" />
    <path d="M40.3 26.5A16.5 16.5 0 0 1 24 40.5" stroke={SHADE} stroke-width="6.4" stroke-linecap="butt" />
    <path d="M11.5 29.5L4 44l16.5-6z" fill={CREAM} />
  {:else if section === "dms"}
    <!-- a letter, flap folded down, sealed in red wax with the ring mark
         pressed into it -->
    <g transform="rotate(-6 24 25)">
      <rect x="5" y="11" width="38" height="28" rx="3.5" fill={CREAM} />
      <path d="M5 14.5a3.5 3.5 0 0 1 3.5-3.5h31a3.5 3.5 0 0 1 3.5 3.5V16L24 30 5 16z" fill={SHADE} />
      <path d="M5 16l19 14 19-14" stroke={DARK} stroke-width="2.2" stroke-linejoin="round" />
      <circle cx="24" cy="31" r="7.2" fill={SEAL} />
      <circle cx="24" cy="31" r="7.2" stroke={SEAL_DK} stroke-width="1.2" />
      <path d="M27.4 28.4a4 4 0 1 0 .5 3.6" stroke="#ffb3b7" stroke-width="1.6" stroke-linecap="round" />
      <path d="M21.6 33.3l-1.6 2" stroke="#ffb3b7" stroke-width="1.6" stroke-linecap="round" />
    </g>
  {:else if section === "casino"}
    <!-- THE WHEEL: eight wedges, the death wedge at the bottom, the mystery
         slot at the top, the pin over it — the thing the whole economy
         turns on -->
    <path d="M24 24L31.27 41.55A19 19 0 0 1 16.73 41.55z" fill={SEAL} />
    <path d="M24 24L16.73 41.55A19 19 0 0 1 6.45 31.27z" fill={CREAM} />
    <path d="M24 24L6.45 31.27A19 19 0 0 1 6.45 16.73z" fill={SHADE} />
    <path d="M24 24L6.45 16.73A19 19 0 0 1 16.73 6.45z" fill={CREAM} />
    <path d="M24 24L16.73 6.45A19 19 0 0 1 31.27 6.45z" fill={GOLD} />
    <path d="M24 24L31.27 6.45A19 19 0 0 1 41.55 16.73z" fill={SHADE} />
    <path d="M24 24L41.55 16.73A19 19 0 0 1 41.55 31.27z" fill={CREAM} />
    <path d="M24 24L41.55 31.27A19 19 0 0 1 31.27 41.55z" fill={SHADE} />
    <circle cx="24" cy="24" r="19" stroke={DARK} stroke-width="2" />
    <path d="M24 5v38M5 24h38M10.6 10.6l26.8 26.8M37.4 10.6L10.6 37.4" stroke={DARK} stroke-width="1" opacity="0.5" />
    <path d="M20.5 38.6l3.5 3.2 3.5-3.2" stroke={CREAM} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="24" cy="24" r="4.6" fill={DARK} />
    <circle cx="24" cy="24" r="2" fill={CREAM} />
    <path d="M18.5 1h11L24 10z" fill={DARK} stroke={CREAM} stroke-width="1.4" stroke-linejoin="round" />
  {:else if section === "backrooms"}
    <!-- THE CORRIDOR: yellow walls running to a dark vanishing point under
         one humming ceiling panel -->
    <path d="M3 3h42L30 18H18z" fill={CREAM} />
    <path d="M3 3l15 15v12L3 45z" fill={MID} />
    <path d="M45 3L30 18v12l15 15z" fill={SHADE} />
    <path d="M3 45l15-15h12l15 15z" fill={DARK} />
    <rect x="18" y="18" width="12" height="12" fill={VOID} />
    <path d="M17.5 7.5h13l-2.2 4.2h-8.6z" fill={GOLD} />
    <path d="M3 45l15-15M45 45L30 30" stroke={VOID} stroke-width="1.6" />
    <path d="M3 3l15 15M45 3L30 18" stroke={CREAM} stroke-width="1" opacity="0.6" />
  {:else if section === "survivorz"}
    <!-- the broadcast monitor: a hand of the dead coming up the screen, the red ON AIR light above -->
    <rect x="5" y="8" width="38" height="28" rx="4" fill={CREAM} />
    <rect x="9" y="12" width="30" height="20" rx="1.5" fill={VOID} />
    <path d="M21 32v-6.5l-2.4-5.2a1.3 1.3 0 0 1 2.3-1.1l1.6 3.1V14.6a1.4 1.4 0 0 1 2.8 0v6.6-8.4a1.4 1.4 0 0 1 2.8 0v8.6-6.6a1.4 1.4 0 0 1 2.8 0v7.4-4.6a1.3 1.3 0 0 1 2.6 0V26l-1.6 6z" fill={CREAM} />
    <circle cx="38.5" cy="5.5" r="3.4" fill={SEAL} />
    <rect x="21" y="36" width="6" height="5" fill={SHADE} />
    <rect x="13" y="41" width="22" height="3.5" rx="1.5" fill={CREAM} />
  {:else if section === "graveyard"}
    <!-- the leaning stone under the BLOOD moon, the iron fence behind -->
    <circle cx="35" cy="13" r="9" fill={SEAL} />
    <circle cx="35" cy="13" r="9" stroke={SEAL_DK} stroke-width="1" />
    <circle cx="31.5" cy="10" r="2.2" fill="#ff8a90" opacity="0.6" />
    <circle cx="38" cy="16.5" r="1.5" fill={SEAL_DK} opacity="0.7" />
    <path d="M34 30l1.6-3 1.6 3v12h-3.2zM40 30l1.6-3 1.6 3v12h-3.2z" fill={SHADE} />
    <rect x="31.5" y="34" width="13.5" height="2.2" fill={SHADE} />
    <g transform="rotate(-7 20 42)">
      <path d="M10 42V22a10 10 0 0 1 20 0v20z" fill={CREAM} />
      <path d="M20 12a10 10 0 0 1 10 10v20H20z" fill={SHADE} />
      <path d="M20 18v12M14.5 23h11" stroke={DARK} stroke-width="3" stroke-linecap="round" />
    </g>
    <rect x="3" y="41" width="42" height="4" rx="1.5" fill={CREAM} opacity="0.85" />
  {:else if section === "pandora"}
    <!-- the box on its dais, three keyholes across its face, the lid a crack open with light in the gap -->
    <path d="M6 20h36l-3-9H9z" fill={SHADE} />
    <path d="M9 11h30l-2-3H11z" fill={MID} />
    <rect x="7" y="21" width="34" height="2.4" fill={GOLD} opacity="0.9" />
    <rect x="6" y="20" width="36" height="1.4" fill="#fff6c8" />
    <rect x="6" y="23" width="36" height="18" rx="1.5" fill={CREAM} />
    <path d="M42 23v18h-8V23z" fill={SHADE} />
    <g fill={DARK}>
      <circle cx="15" cy="30" r="2.6" /><path d="M13.7 31h2.6l1 6h-4.6z" />
      <circle cx="24" cy="30" r="2.6" /><path d="M22.7 31h2.6l1 6h-4.6z" />
      <circle cx="33" cy="30" r="2.6" /><path d="M31.7 31h2.6l1 6h-4.6z" />
    </g>
    <rect x="3" y="41" width="42" height="4" rx="1.5" fill={SHADE} />
  {:else if section === "portal"}
    <!-- the ring of light with the eye in it, and the stone below -->
    <circle cx="24" cy="21" r="14" fill="none" stroke={CREAM} stroke-width="3.2" />
    <circle cx="24" cy="21" r="14" fill="none" stroke={SHADE} stroke-width="3.2" stroke-dasharray="22 66" stroke-dashoffset="-10" />
    <circle cx="24" cy="21" r="7.5" fill={VOID} />
    <circle cx="24" cy="21" r="3.2" fill={CREAM} />
    <path d="M14 42l3-5h14l3 5z" fill={SHADE} />
    <path d="M17 37l2-3h10l2 3z" fill={CREAM} />
  {:else if section === "leaderboards"}
    <!-- the laurel round the winner -->
    <path d="M22 42A15 15 0 0 1 10 18M26 42A15 15 0 0 0 38 18" stroke={GOLD_DK} stroke-width="1.8" stroke-linecap="round" />
    <ellipse cx="20.1" cy="40.5" rx="2.5" ry="4.8" transform="rotate(195 20.1 40.5)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="14.4" cy="37.5" rx="2.5" ry="4.8" transform="rotate(220 14.4 37.5)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="10.4" cy="32.3" rx="2.5" ry="4.8" transform="rotate(245 10.4 32.3)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="9" cy="26" rx="2.5" ry="4.8" transform="rotate(270 9 26)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="10.4" cy="19.7" rx="2.5" ry="4.8" transform="rotate(295 10.4 19.7)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="27.9" cy="40.5" rx="2.5" ry="4.8" transform="rotate(165 27.9 40.5)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="33.6" cy="37.5" rx="2.5" ry="4.8" transform="rotate(140 33.6 37.5)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="37.6" cy="32.3" rx="2.5" ry="4.8" transform="rotate(115 37.6 32.3)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="39" cy="26" rx="2.5" ry="4.8" transform="rotate(90 39 26)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <ellipse cx="37.6" cy="19.7" rx="2.5" ry="4.8" transform="rotate(65 37.6 19.7)" fill={GOLD} stroke={GOLD_DK} stroke-width="0.8" />
    <path d="M18.5 14.5L24.5 9v25" stroke={CREAM} stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M19 34h11" stroke={CREAM} stroke-width="5" stroke-linecap="round" />
  {:else if section === "market"}
    <!-- STERLING: top hat, goggles, the grill -->
    <rect x="14" y="3" width="20" height="12" rx="1.5" fill={CREAM} />
    <path d="M28 3h4.5A1.5 1.5 0 0 1 34 4.5V15h-6z" fill={SHADE} />
    <rect x="14" y="11" width="20" height="3" fill={DARK} />
    <rect x="9" y="14" width="30" height="3.6" rx="1.6" fill={CREAM} />
    <rect x="12" y="18" width="24" height="22" rx="7" fill={CREAM} />
    <path d="M24 18h5a7 7 0 0 1 7 7v8a7 7 0 0 1-7 7h-5z" fill={SHADE} />
    <circle cx="18.3" cy="27" r="4.6" fill={CYAN} stroke={DARK} stroke-width="2" />
    <circle cx="29.7" cy="27" r="4.6" fill={CYAN} stroke={DARK} stroke-width="2" />
    <path d="M22.9 27h2.2" stroke={DARK} stroke-width="2" />
    <circle cx="16.8" cy="25.5" r="1.2" fill="#ffffff" opacity="0.9" />
    <circle cx="28.2" cy="25.5" r="1.2" fill="#ffffff" opacity="0.9" />
    <rect x="17" y="34" width="14" height="3.6" rx="1.2" fill={DARK} />
    <path d="M20.5 34v3.6M24 34v3.6M27.5 34v3.6" stroke={CREAM} stroke-width="1" />
    <path d="M8 46a16 6 0 0 1 32 0z" fill={SHADE} />
    <path d="M8 46a16 6 0 0 1 16-6v6z" fill={CREAM} />
  {:else if section === "feedback"}
    <!-- a note nailed to the board -->
    <g transform="rotate(-5 24 26)">
      <rect x="9" y="10" width="30" height="33" rx="1.5" fill={CREAM} />
      <path d="M39 32v11H28z" fill={SHADE} />
      <path d="M39 32L28 43l2.5-8.5z" fill={MID} />
      <path d="M15 19.5h18M15 25.5h18M15 31.5h12" stroke={DARK} stroke-width="2.4" stroke-linecap="round" />
      <path d="M24 12v3" stroke={DARK} stroke-width="2.4" stroke-linecap="round" opacity="0.5" />
      <circle cx="24" cy="10.5" r="3.4" fill={GOLD} stroke={GOLD_DK} stroke-width="1.2" />
      <circle cx="23" cy="9.6" r="1" fill="#fff4c7" />
    </g>
  {:else if section === "howto"}
    <!-- the manual, open at the page with the ring on it -->
    <path d="M24 11c-5-3.4-11.5-3.6-19-1.6v28.6c7.5-2 14-1.8 19 1.6z" fill={CREAM} />
    <path d="M24 11c5-3.4 11.5-3.6 19-1.6v28.6c-7.5-2-14-1.8-19 1.6z" fill={SHADE} />
    <path d="M18.2 16.4A5.4 5.4 0 1 0 19 20.2" stroke={DARK} stroke-width="2.4" stroke-linecap="round" />
    <path d="M10.6 23.6L7.8 29.4l6.3-2.6z" fill={DARK} />
    <path d="M28 17.5c4-1 7.6-1.1 11 0M28 23c4-1 7.6-1.1 11 0M28 28.5c4-1 7.6-1.1 11 0" stroke={DARK} stroke-width="2.2" stroke-linecap="round" />
    <path d="M9.5 33c4-1 7.6-1.1 11 0" stroke={DARK} stroke-width="2.2" stroke-linecap="round" opacity="0.7" />
    <path d="M31 9.4v11.6l3.5-2.8 3.5 2.8V10c-2.3-.5-4.6-.7-7-.6z" fill={SEAL} />
    <path d="M5 38c7.5-2 14-1.8 19 1.6 5-3.4 11.5-3.6 19-1.6v4c-7.5-2-14-1.8-19 1.6-5-3.4-11.5-3.6-19-1.6z" fill={DARK} />
  {:else if section === "admin"}
    <!-- the Foundry's anvil, the house key across it -->
    <path d="M45 13H17Q8 13 3 17q5 4 14 5h5v8h-4l-4 10h24l-4-10h-4v-8h18z" fill={CREAM} />
    <path d="M36 13h9v9h-9zM28 30h4l4 10h-8z" fill={SHADE} />
    <path d="M17 13.5h28" stroke={DARK} stroke-width="1" opacity="0.4" />
    <path d="M14 36L38 12" stroke={GOLD_DK} stroke-width="5.4" stroke-linecap="round" />
    <path d="M14 36L38 12" stroke={GOLD} stroke-width="3.2" stroke-linecap="round" />
    <path d="M34.4 15.6l3.4 3.4M30.6 19.4l2.6 2.6" stroke={GOLD_DK} stroke-width="4.8" stroke-linecap="round" />
    <path d="M34.4 15.6l3.4 3.4M30.6 19.4l2.6 2.6" stroke={GOLD} stroke-width="2.6" stroke-linecap="round" />
    <circle cx="11" cy="39" r="5.6" fill={GOLD} stroke={GOLD_DK} stroke-width="1.6" />
    <circle cx="11" cy="39" r="2" fill={DARK} />
  {/if}
</svg>

<style>
  .railicon {
    display: block;
    filter: drop-shadow(0 1.5px 1px rgba(0, 0, 0, 0.35));
  }
</style>
