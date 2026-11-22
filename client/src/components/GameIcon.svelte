<script lang="ts">
  // Hand-drawn flat SVG icons for the Emoji Casino's game cards — one
  // component, one prop. Flat fills only (no <defs> gradients), so many
  // instances can coexist without SVG id collisions. Depth comes from
  // layered highlight/shadow fills instead: one light source, top-left.
  //
  // Reworked Aug 2026 (Josh: "more relevant to the game and of better
  // quality") — every icon is built from its game's actual signature:
  // the death wedge, the 7-7-7 payline, the dealer's 21, the zero pocket,
  // the pass line, the liar's CUP, the winner's circle…
  let { game, size = 44 }: { game: string; size?: number } = $props();

  const GOLD = "#eab348";
  const GOLD_LT = "#ffe6a8";
  const GOLD_DK = "#a97a22";
  const LINE = "#2c1f08";
  const RED = "#c2242c";
  const RED_DK = "#8c161d";
  const CREAM = "#f4efe3";
  const CREAM_DK = "#d8cfba";
  const GREEN = "#1d6b40";
  const GREEN_DK = "#11482a";
  const INK = "#23262b";
</script>

<svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
  {#if game === "wheel"}
    <!-- Wheel of Fortune: the real face — blanks, commons, a rare, the
         legendary, and the DEATH wedge under a jeweled pointer. -->
    <circle cx="24" cy="26" r="19" fill={GOLD_DK} stroke={LINE} stroke-width="2.2" />
    <circle cx="24" cy="26" r="16" fill={CREAM} stroke={LINE} stroke-width="1.4" />
    <!-- eight wedges: cream blanks, gold commons, a teal rare, a violet legendary -->
    {#each [{ a: 45, c: GOLD }, { a: 90, c: CREAM_DK }, { a: 135, c: "#2e8b8b" }, { a: 180, c: GOLD }, { a: 225, c: CREAM_DK }, { a: 270, c: "#7a4bb0" }, { a: 315, c: GOLD }] as w (w.a)}
      <g transform="rotate({w.a} 24 26)">
        <path d="M24 26 L24 10 A16 16 0 0 1 35.3 14.7 Z" fill={w.c} stroke={LINE} stroke-width="1.1" />
      </g>
    {/each}
    <!-- THE DEATH WEDGE, at the pointer -->
    <path d="M24 26 L24 10 A16 16 0 0 1 35.3 14.7 Z" fill={INK} stroke={LINE} stroke-width="1.1" />
    <circle cx="28.6" cy="15.4" r="2.1" fill={CREAM} />
    <rect x="27.2" y="17.1" width="2.9" height="1.7" rx="0.6" fill={CREAM} />
    <circle cx="27.9" cy="15.1" r="0.55" fill={INK} />
    <circle cx="29.4" cy="15.1" r="0.55" fill={INK} />
    <!-- rim studs -->
    {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
      <g transform="rotate({a} 24 26)"><circle cx="24" cy="8.5" r="1.1" fill={GOLD_LT} stroke={LINE} stroke-width="0.7" /></g>
    {/each}
    <!-- hub + pointer -->
    <circle cx="24" cy="26" r="5" fill={GOLD} stroke={LINE} stroke-width="1.8" />
    <circle cx="22.4" cy="24.4" r="1.5" fill={GOLD_LT} />
    <circle cx="24" cy="26" r="1.7" fill={RED} stroke={LINE} stroke-width="0.8" />
    <path d="M24 1.5 L28.6 9 L19.4 9 Z" fill={RED} stroke={LINE} stroke-width="1.6" stroke-linejoin="round" />
    <path d="M22 4.2 L24 3 L26 4.2" stroke={GOLD_LT} stroke-width="1" stroke-linecap="round" fill="none" />
  {:else if game === "slots"}
    <!-- Slots of Chance: the gold cabinet, lit marquee, 7-7-7 on the
         payline, the chrome lever, coins in the tray. -->
    <rect x="5" y="13" width="31" height="24" rx="5" fill={GOLD_DK} stroke={LINE} stroke-width="2.2" />
    <rect x="5" y="13" width="31" height="21" rx="5" fill={GOLD} stroke={LINE} stroke-width="1.4" />
    <!-- marquee + bulbs, lit -->
    <path d="M7 13 Q20.5 6.5 34 13" stroke={LINE} stroke-width="2" fill="none" />
    {#each [11, 17, 23, 29] as bx, i (bx)}
      <circle cx={bx} cy={10.4 - (i === 1 || i === 2 ? 1.1 : 0)} r="2.2" fill={GOLD_LT} opacity="0.5" />
      <circle cx={bx} cy={10.4 - (i === 1 || i === 2 ? 1.1 : 0)} r="1.4" fill={RED} stroke={LINE} stroke-width="0.9" />
    {/each}
    <!-- the three reels, middle one still dropping -->
    {#each [8.5, 17, 25.5] as rx, i (rx)}
      <rect x={rx} y="17.5" width="7" height="13" rx="1.6" fill={CREAM} stroke={LINE} stroke-width="1.4" />
      <rect x={rx} y="17.5" width="7" height="3.2" rx="1.6" fill={CREAM_DK} />
      <text x={rx + 3.5} y={i === 1 ? 30 : 27.8} font-size="9.5" font-weight="900" font-style="italic" fill={RED} text-anchor="middle" font-family="Georgia, serif">7</text>
    {/each}
    <path d="M7.5 24.5 L33.5 24.5" stroke={RED} stroke-width="1" opacity="0.55" />
    <!-- lever: chrome arm, red ball with a glint -->
    <path d="M40.5 29 L40.5 13.5" stroke="#8d9099" stroke-width="3.2" stroke-linecap="round" />
    <path d="M39.6 27 L39.6 15" stroke="#ccd1da" stroke-width="1.1" stroke-linecap="round" />
    <circle cx="40.5" cy="10.5" r="4.6" fill={RED} stroke={LINE} stroke-width="1.6" />
    <circle cx="39" cy="9" r="1.5" fill="#ff8d7a" />
    <rect x="37.5" y="28" width="6" height="8" rx="2" fill={GOLD_DK} stroke={LINE} stroke-width="1.4" />
    <!-- payout tray, coins spilling -->
    <path d="M9 37 h23 l-2 5 h-19 Z" fill={GOLD_DK} stroke={LINE} stroke-width="1.6" stroke-linejoin="round" />
    <ellipse cx="14" cy="42.5" rx="4.4" ry="1.9" fill={GOLD} stroke={LINE} stroke-width="1.1" />
    <ellipse cx="22.5" cy="44" rx="4.4" ry="1.9" fill={GOLD_LT} stroke={LINE} stroke-width="1.1" />
    <ellipse cx="29" cy="42" rx="3.6" ry="1.7" fill={GOLD} stroke={LINE} stroke-width="1.1" />
  {:else if game === "blackjack"}
    <!-- Blackjack: the ace-and-face 21 over the dealer's chip. -->
    <circle cx="37.5" cy="35" r="8.8" fill={RED_DK} stroke={LINE} stroke-width="1.6" />
    <circle cx="36.8" cy="34.3" r="8" fill={RED} stroke={LINE} stroke-width="1.4" />
    <circle cx="36.8" cy="34.3" r="8" fill="none" stroke={CREAM} stroke-width="2" stroke-dasharray="3.3 3.1" />
    <circle cx="36.8" cy="34.3" r="4.4" fill={GREEN} stroke={CREAM} stroke-width="1.1" />
    <text x="36.8" y="36.8" font-size="6.2" font-weight="900" fill={CREAM} text-anchor="middle" font-family="Georgia, serif">21</text>
    <!-- A♠ behind -->
    <g transform="rotate(-13 15 24)">
      <rect x="7.5" y="9" width="16.5" height="24" rx="3" fill={CREAM_DK} stroke={LINE} stroke-width="2" />
      <rect x="8.4" y="9.8" width="14.7" height="21.4" rx="2.4" fill={CREAM} />
      <text x="11.8" y="18" font-size="8.5" font-weight="800" fill={INK} font-family="Georgia, serif">A</text>
      <path d="M16 29.5 c-3.6-3.2 -1.4-7 1.3-5.3 c2.7-1.7 4.9 2.1 1.3 5.3 l-1.3 1.2 Z" fill={INK} />
      <path d="M16 30.4 l-1 3 h2 Z" fill={INK} />
    </g>
    <!-- A♥ in front -->
    <g transform="rotate(12 28 22)">
      <rect x="20.5" y="7.5" width="16.5" height="24" rx="3" fill={CREAM_DK} stroke={LINE} stroke-width="2" />
      <rect x="21.4" y="8.3" width="14.7" height="21.4" rx="2.4" fill={CREAM} />
      <text x="24.8" y="16.5" font-size="8.5" font-weight="800" fill={RED} font-family="Georgia, serif">A</text>
      <path d="M29 23 c-3.6 3.2 -1.3 7 1.4 5.2 c2.7 1.8 5 -2 1.4 -5.2 c-1 -0.9 -1.4 -1.1 -1.4 -1.1 s-0.4 0.2 -1.4 1.1 Z" fill={RED} transform="rotate(180 30.4 25.6)" />
    </g>
  {:else if game === "holdem"}
    <!-- Hold'em: hole cards peeking over the pot — a real chip stack. -->
    <ellipse cx="24" cy="42" rx="16" ry="3.4" fill={GREEN_DK} stroke={LINE} stroke-width="1.4" />
    <g transform="rotate(-9 18 20)">
      <rect x="9" y="7" width="15.5" height="22" rx="3" fill={CREAM_DK} stroke={LINE} stroke-width="2" />
      <rect x="9.9" y="7.8" width="13.7" height="19.4" rx="2.4" fill={CREAM} />
      <text x="13" y="16" font-size="8" font-weight="900" fill={INK} font-family="Georgia, serif">A</text>
      <path d="M17 25.5 l-3.2-3.6 a2.3 2.3 0 1 1 3.2-2.4 a2.3 2.3 0 1 1 3.2 2.4 Z" fill={INK} transform="rotate(180 17 22.7)" />
    </g>
    <g transform="rotate(11 30 20)">
      <rect x="23" y="6" width="15.5" height="22" rx="3" fill={CREAM_DK} stroke={LINE} stroke-width="2" />
      <rect x="23.9" y="6.8" width="13.7" height="19.4" rx="2.4" fill={CREAM} />
      <text x="27" y="15" font-size="8" font-weight="900" fill={RED} font-family="Georgia, serif">K</text>
      <path d="M31 22.5 c-3.1-2.7-1.1-5.8 1-4.4 c2.1-1.4 4.1 1.7 1 4.4 l-1 0.9 Z" fill={RED} />
    </g>
    <!-- the pot: three stacks, different heights -->
    {#each [{ x: 12, n: 3, c: RED }, { x: 24, n: 4, c: GOLD }, { x: 36, n: 2, c: GREEN }] as s (s.x)}
      {#each Array(s.n) as _, i (i)}
        <ellipse cx={s.x} cy={40 - i * 2.6} rx="5.6" ry="2.1" fill={s.c} stroke={LINE} stroke-width="1.2" />
        <ellipse cx={s.x} cy={40 - i * 2.6 - 0.5} rx="5.6" ry="1.7" fill="none" stroke={CREAM} stroke-width="0.9" stroke-dasharray="2.4 2.2" />
      {/each}
    {/each}
  {:else if game === "craps"}
    <!-- Craps: the felt corner, dice mid-tumble over the PASS LINE arc. -->
    <rect x="2" y="2" width="44" height="44" rx="9" fill={GREEN_DK} />
    <rect x="4" y="4" width="40" height="40" rx="7" fill={GREEN} stroke={GOLD_DK} stroke-width="1.4" />
    <path d="M7 37 Q24 29 41 37" stroke={CREAM} stroke-width="2.2" fill="none" stroke-linecap="round" />
    <path d="M7 41 Q24 33.4 41 41" stroke={GOLD} stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.8" />
    <text x="24" y="43.5" font-size="5" font-weight="800" letter-spacing="1.4" fill={CREAM} text-anchor="middle" font-family="Georgia, serif">PASS</text>
    <!-- the dice: a natural — 4 and 3 -->
    <g transform="rotate(-14 15.5 17)">
      <rect x="7" y="8.5" width="17" height="17" rx="3.8" fill={CREAM_DK} stroke={LINE} stroke-width="2" />
      <rect x="7.8" y="9.2" width="15.4" height="14.6" rx="3.2" fill={CREAM} />
      <circle cx="12" cy="13.5" r="1.8" fill={INK} />
      <circle cx="19" cy="13.5" r="1.8" fill={INK} />
      <circle cx="12" cy="20.5" r="1.8" fill={INK} />
      <circle cx="19" cy="20.5" r="1.8" fill={INK} />
    </g>
    <g transform="rotate(17 33 19)">
      <rect x="25" y="10.5" width="16" height="16" rx="3.6" fill={RED_DK} stroke={LINE} stroke-width="2" />
      <rect x="25.7" y="11.1" width="14.6" height="13.8" rx="3" fill={RED} />
      <circle cx="29.6" cy="15" r="1.7" fill={CREAM} />
      <circle cx="33" cy="18.4" r="1.7" fill={CREAM} />
      <circle cx="36.4" cy="21.8" r="1.7" fill={CREAM} />
    </g>
    <!-- the throw's motion -->
    <path d="M9 6.5 L11.5 9 M15 4.5 L16.2 7.8 M21 4 L21.5 7" stroke={GOLD} stroke-width="1.5" stroke-linecap="round" />
  {:else if game === "derby"}
    <!-- The Emoji Derby: the WINNER'S CIRCLE — checkered finish flag,
         the golden horseshoe, and the track streaking underneath. -->
    <ellipse cx="24" cy="40" rx="19" ry="5.4" fill={GREEN} stroke={LINE} stroke-width="1.6" />
    <ellipse cx="24" cy="39.4" rx="13" ry="3" fill={GOLD_DK} />
    <path d="M6 39.2 h9 M19 40.4 h10 M33 39.2 h8" stroke={GOLD_LT} stroke-width="1.1" stroke-linecap="round" opacity="0.7" />
    <!-- the flagpole + checkered flag, mid-wave -->
    <path d="M9 44 L9 5" stroke={LINE} stroke-width="2.6" stroke-linecap="round" />
    <circle cx="9" cy="4.4" r="1.7" fill={GOLD} stroke={LINE} stroke-width="1.1" />
    <path d="M10.5 6 Q22 3.5 33 6.5 Q31 11 33 15.5 Q22 19 10.5 16 Z" fill={CREAM} stroke={LINE} stroke-width="1.8" stroke-linejoin="round" />
    {#each [[12, 6.6], [19, 6.2], [26, 6.6], [15.5, 10.4], [22.5, 10.6], [29.5, 11], [12, 13.6], [19, 14], [26, 14.4]] as [fx, fy] (fx + "-" + fy)}
      <rect x={fx} y={fy} width="3.5" height="3.6" fill={INK} />
    {/each}
    <!-- the horseshoe of the winner's circle -->
    <path d="M27 25.5 a8.5 8.5 0 1 1 17 0 c0 5 -2.6 8.6 -4.6 10.6 l-2.6 -2.6 c1.8 -1.8 3.6 -4.4 3.6 -8 a4.9 4.9 0 1 0 -9.8 0 c0 3.6 1.8 6.2 3.6 8 l-2.6 2.6 c-2 -2 -4.6 -5.6 -4.6 -10.6 Z" fill={GOLD} stroke={LINE} stroke-width="1.7" stroke-linejoin="round" />
    {#each [[29.4, 24], [31.4, 30.6], [42.2, 24], [40.2, 30.6], [35.5, 19.6]] as [nx, ny] (nx + "-" + ny)}
      <circle cx={nx} cy={ny} r="0.95" fill={GOLD_DK} stroke={LINE} stroke-width="0.5" />
    {/each}
    <!-- dust of somebody finishing fast -->
    <path d="M14 30 q3 -1.6 6 0 M12 34 q4 -2 8 0" stroke={CREAM} stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.5" />
  {:else if game === "lottery"}
    <!-- The Nightly Draw: the golden ticket under the midnight sky. -->
    <circle cx="39" cy="8" r="4.6" fill={CREAM} />
    <circle cx="37.3" cy="6.8" r="4" fill="#0d1322" />
    <path d="M28.5 4.5 l0.9 2.1 l2.1 0.9 l-2.1 0.9 l-0.9 2.1 l-0.9 -2.1 l-2.1 -0.9 l2.1 -0.9 Z" fill={GOLD_LT} />
    <circle cx="44" cy="13.5" r="1" fill={GOLD_LT} />
    <circle cx="33" cy="12.5" r="0.8" fill={CREAM} opacity="0.8" />
    <!-- the ticket, scalloped stub, punched -->
    <g transform="rotate(-8 24 29)">
      <path d="M6 20 h36 a3 3 0 0 1 3 3 v3 a3.5 3.5 0 0 0 0 7 v3 a3 3 0 0 1 -3 3 H6 a3 3 0 0 1 -3 -3 v-3 a3.5 3.5 0 0 0 0 -7 v-3 a3 3 0 0 1 3 -3 Z" fill={GOLD_DK} stroke={LINE} stroke-width="2" stroke-linejoin="round" />
      <path d="M6.8 21 h34.4 a2.2 2.2 0 0 1 2.2 2.2 v2.4 a3.5 3.5 0 0 0 0 6.8 v2.4 a2.2 2.2 0 0 1 -2.2 2.2 H6.8 a2.2 2.2 0 0 1 -2.2 -2.2 v-2.4 a3.5 3.5 0 0 0 0 -6.8 v-2.4 a2.2 2.2 0 0 1 2.2 -2.2 Z" fill={GOLD} />
      <path d="M31.5 20.5 L31.5 39.5" stroke={LINE} stroke-width="1.3" stroke-dasharray="2.3 2.1" />
      <rect x="8.5" y="24.5" width="19" height="11" rx="1.6" fill={CREAM} stroke={LINE} stroke-width="1.2" />
      <text x="18" y="33" font-size="8" font-weight="900" letter-spacing="1" fill={RED} text-anchor="middle" font-family="Georgia, serif">777</text>
      <circle cx="37.2" cy="30" r="3.1" fill={CREAM} stroke={LINE} stroke-width="1.2" />
      <circle cx="37.2" cy="30" r="1.2" fill={GOLD_DK} />
    </g>
  {:else if game === "chess"}
    <!-- Chess Duel: the knight takes the board — a captured pawn beside. -->
    <!-- checkered plinth -->
    <rect x="6" y="35" width="36" height="7" rx="2" fill={GOLD_DK} stroke={LINE} stroke-width="1.8" />
    {#each [8, 16.5, 25, 33.5] as cx, i (cx)}
      <rect x={cx} y="36.4" width="4.2" height="4.2" fill={i % 2 ? CREAM : INK} opacity="0.85" />
      <rect x={cx + 4.2} y="36.4" width="4.2" height="4.2" fill={i % 2 ? INK : CREAM} opacity="0.85" />
    {/each}
    <!-- the knight, cream with a carved mane -->
    <path
      d="M17 35 C15.8 28.5 17.6 22.5 22.5 18.5 C21.4 16.3 22 14 23.6 12.3 C24.8 13.4 27.4 14 29.6 15.6 C34 18.4 35.8 23.2 35.2 27.6 C34.9 30.2 33.1 31.3 31.2 30.9 C29.7 30.6 29.1 29.1 27.6 29.6 C27.2 31.3 27.8 32.6 28.9 34.2 L29.4 35 Z"
      fill={CREAM}
      stroke={LINE}
      stroke-width="2.1"
      stroke-linejoin="round"
    />
    <path d="M22.8 19.5 C20 22.8 18.8 27 19.4 31" stroke={CREAM_DK} stroke-width="1.5" fill="none" stroke-linecap="round" />
    <circle cx="26.6" cy="17.8" r="1.35" fill={INK} />
    <path d="M23.6 12.9 l1.8 2.6" stroke={LINE} stroke-width="1.2" stroke-linecap="round" />
    <!-- the captured red pawn, on its side -->
    <g transform="rotate(74 10.5 31)">
      <circle cx="10.5" cy="25.5" r="2.6" fill={RED} stroke={LINE} stroke-width="1.4" />
      <path d="M8.6 27.5 h3.8 l0.9 5 h-5.6 Z" fill={RED} stroke={LINE} stroke-width="1.4" stroke-linejoin="round" />
    </g>
  {:else if game === "roulette"}
    <!-- Roulette: the EU wheel — red/black pockets, the single green zero,
         chrome turret, the ball just dropped. -->
    <circle cx="24" cy="24" r="20" fill={GOLD_DK} stroke={LINE} stroke-width="2" />
    <circle cx="24" cy="24" r="17.6" fill={GOLD} stroke={LINE} stroke-width="1" />
    <circle cx="24" cy="24" r="15" fill={GREEN_DK} stroke={LINE} stroke-width="1.4" />
    <!-- pockets: 11 alternating + ONE green zero at the top -->
    {#each [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as a, i (a)}
      <g transform="rotate({a} 24 24)">
        <path d="M24 24 L20.2 9.7 A15 15 0 0 1 27.8 9.7 Z" fill={i === 0 ? GREEN : i % 2 ? RED : INK} stroke={LINE} stroke-width="0.8" />
      </g>
    {/each}
    <circle cx="24" cy="24" r="7.6" fill={GOLD} stroke={LINE} stroke-width="1.6" />
    <!-- the turret: chrome cross-handles -->
    <path d="M24 18.5 L24 29.5 M18.5 24 L29.5 24" stroke={GOLD_DK} stroke-width="2.2" stroke-linecap="round" />
    <circle cx="24" cy="24" r="2.9" fill={CREAM} stroke={LINE} stroke-width="1.2" />
    <circle cx="23.2" cy="23.2" r="1" fill="#ffffff" />
    <!-- the ball, landed on a red -->
    <circle cx="31.8" cy="12.6" r="2.5" fill={CREAM} stroke={LINE} stroke-width="1.1" />
    <circle cx="31" cy="11.8" r="0.8" fill="#ffffff" />
  {:else if game === "bonepit"}
    <!-- The Bone Pit: the liar's CUP tipped over the pit, dice spilling,
         a bone at the rim. Hidden cups ARE the game. -->
    <ellipse cx="24" cy="39" rx="20" ry="6.6" fill="#1c1512" stroke={LINE} stroke-width="1.8" />
    <ellipse cx="24" cy="38" rx="15" ry="4.2" fill="#0d0908" />
    <!-- the leather cup, tipped, banded -->
    <g transform="rotate(-38 15 16)">
      <path d="M8 8 h14 l-2.2 16 h-9.6 Z" fill="#6b4423" stroke={LINE} stroke-width="2" stroke-linejoin="round" />
      <path d="M8.9 9 h12.2 l-0.5 3.4 h-11.2 Z" fill="#8a5a30" />
      <path d="M9.6 18 h10.8" stroke="#4a2d15" stroke-width="1.6" />
      <ellipse cx="15" cy="8" rx="7" ry="2.2" fill="#4a2d15" stroke={LINE} stroke-width="1.6" />
    </g>
    <!-- dice tumbling out: a 5 and a wild ONE -->
    <g transform="rotate(14 27 22)">
      <rect x="20" y="15" width="14.5" height="14.5" rx="3.2" fill={CREAM_DK} stroke={LINE} stroke-width="2" />
      <rect x="20.7" y="15.6" width="13.1" height="12.4" rx="2.6" fill={CREAM} />
      <circle cx="24" cy="19" r="1.5" fill={INK} />
      <circle cx="30.5" cy="19" r="1.5" fill={INK} />
      <circle cx="27.2" cy="22.2" r="1.5" fill={RED} />
      <circle cx="24" cy="25.4" r="1.5" fill={INK} />
      <circle cx="30.5" cy="25.4" r="1.5" fill={INK} />
    </g>
    <g transform="rotate(-11 38 30)">
      <rect x="33" y="24.5" width="10.5" height="10.5" rx="2.6" fill={GOLD} stroke={LINE} stroke-width="1.8" />
      <circle cx="38.2" cy="29.7" r="1.7" fill={RED} />
    </g>
    <!-- the bone -->
    <g transform="rotate(-14 11 41)">
      <rect x="6" y="40" width="10" height="2.3" rx="1.1" fill={CREAM} stroke={LINE} stroke-width="1" />
      <circle cx="6" cy="40.3" r="1.5" fill={CREAM} stroke={LINE} stroke-width="1" />
      <circle cx="6" cy="42.4" r="1.5" fill={CREAM} stroke={LINE} stroke-width="1" />
      <circle cx="16" cy="40.3" r="1.5" fill={CREAM} stroke={LINE} stroke-width="1" />
      <circle cx="16" cy="42.4" r="1.5" fill={CREAM} stroke={LINE} stroke-width="1" />
    </g>
  {:else}
    <!-- fallback: a chip -->
    <circle cx="24" cy="24" r="17" fill={RED} stroke={CREAM} stroke-width="3" stroke-dasharray="8 7" />
    <circle cx="24" cy="24" r="10" fill={GREEN} stroke={CREAM} stroke-width="2" />
  {/if}
</svg>
