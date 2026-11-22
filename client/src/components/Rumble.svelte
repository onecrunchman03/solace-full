<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { nav, openMarket } from "../lib/nav.svelte";
  import { lender, loadLender, STAGE_NAMES } from "../lib/lender.svelte";
  import Lazy from "./Lazy.svelte";
  import Coin from "./Coin.svelte";
  import GameIcon from "./GameIcon.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { phone } from "../lib/phone.svelte";
  import felt from "../assets/casino-felt.webp";
  import { api } from "../lib/api";

  // Every game/place view is code-split: the hub opens with just this shell,
  // and clicking a card fetches that game's chunk (then it's cached until the
  // next deploy). All of these are prop-less — Lazy's contract.
  // The Market, Graveyard and Leaderboards moved to their own rail sections
  // and Game Nights was retired from the hub (Josh, Aug 2026) — this is the
  // GAMES floor now, plus the goblins' storefront below the doors.
  const VIEWS: Record<string, () => Promise<{ default: Component }>> = {
    wheel: () => import("./WheelView.svelte"),
    slots: () => import("./Slots.svelte"),
    blackjack: () => import("./Blackjack.svelte"),
    roulette: () => import("./Roulette.svelte"),
    craps: () => import("./Craps.svelte"),
    holdem: () => import("./Holdem.svelte"),
    derby: () => import("./Derby.svelte"),
    lottery: () => import("./Lottery.svelte"),
    chess: () => import("./ChessDuel.svelte"),
    bonepit: () => import("./BonePit.svelte"),
    lender: () => import("./Lender.svelte"),
  };

  type Card = {
    key: "wheel" | "slots" | "blackjack" | "roulette" | "craps" | "holdem" | "derby" | "chess" | "bonepit" | "lottery";
    name: string;
    blurb: string;
    tag: string;
  };

  const GAMES: Card[] = [
    { key: "wheel", name: "Wheel of Fortune", tag: "The faucet",
      blurb: "Spin for commons, rares, legendaries — or the dreaded death slot." },
    { key: "slots", name: "Slots of Chance", tag: "10 a pull",
      blurb: "Bet silver, line up the reels, win silver — no timer, no mercy." },
    { key: "blackjack", name: "Blackjack", tag: "Four tables",
      blurb: "Silver stakes against the house. Play solo or gang up on the dealer." },
    { key: "roulette", name: "Roulette", tag: "One shared wheel",
      blurb: "Everyone bets, one ball drops. Red or black — or 35:1 on your number." },
    { key: "craps", name: "Craps", tag: "The loudest table",
      blurb: "One shooter, everyone rides the roll. Pass line, true odds, hardways — real Vegas rules." },
    { key: "holdem", name: "Texas Hold'em", tag: "Three tables",
      blurb: "No-limit poker against each other. Blinds, bluffs, side pots — the house only rakes." },
    { key: "derby", name: "The Emoji Derby", tag: "Post time!",
      blurb: "Six runners, one pool. Back your emoji and scream it down the stretch." },
    { key: "chess", name: "Casino Chess Duel", tag: "Emoji stakes",
      blurb: "Blitz chess, winner takes the loser's emoji. The board doesn't lie." },
    { key: "bonepit", name: "The Bone Pit", tag: "Liar's dice",
      blurb: "Hidden cups, climbing bids — the one game where reading people is the whole skill." },
    { key: "lottery", name: "The Nightly Draw", tag: "Midnight UTC",
      blurb: "Tickets all day, one winner at midnight. The pot doesn't lie." },
  ];

  // THE FPS CASINO (CASINO.md): entered from the band at the bottom of this
  // page, mounted as a full-viewport overlay — its chunk (three.js and all)
  // only ever downloads when somebody walks in. "escape" is the ESCAPE ROOM
  // ante-room behind the door east of the jukebox (ESCAPE.md): a SIBLING
  // view, not a child — the hall fully unmounts (its onDestroy leave rules
  // run) and remounts on the way back, exactly like every {#key} game view.
  let casinoOpen = $state(false);
  let casinoView = $state<"hall" | "escape">("hall");
  // Where the hall places the body on (re)mount: the entrance doors normally,
  // the escape room's own door when you walk back out of the ante-room.
  let casinoSpawn = $state<"entrance" | "escape">("entrance");
  const enterCasino = (): void => {
    casinoSpawn = "entrance";
    casinoOpen = true;
  };

  // (Solace Survivorz has its own place on the rail since Nov 3 2026 — components/SurvivorzView.svelte)

  // THE GOBLINS' BAND IS LIVE (Sep 2026): the vault figure and, if you owe
  // them, your own standing — instead of the same static pitch forever.
  onMount(() => {
    void loadLender();
  });
  const fmt = (n: number): string => n.toLocaleString();
</script>

{#if nav.rumble !== "hub" && VIEWS[nav.rumble]}
  {@const loadView = VIEWS[nav.rumble]}
  <div class="game">
    <button class="back" onclick={() => (nav.rumble = "hub")}>← Casino</button>
    <!-- Keyed so switching games fully destroys the old one (Blackjack's
         onDestroy leave, Derby's rAF cleanup, …) before the next mounts. -->
    {#key nav.rumble}
      <Lazy load={loadView} />
    {/key}
  </div>
{:else}
  <div class="hub" style="--felt: url({felt})">
    <div class="hub-inner">
      <header class="hub-head">
        <div class="marquee-line">✦ &nbsp;THE FLOOR IS OPEN&nbsp; ✦</div>
        <h1>Casino</h1>
        <p>Win, trade, and gamble your emoji collection.</p>
        <button class="wallet-chip" onclick={() => openMarket("shop")} title="Open the Trader">
          <Coin size={20} />
          <span>{wallet.coins.toLocaleString()}</span>
          <span class="unit">silver</span>
        </button>
      </header>

      <!-- The door comes FIRST (Josh, Aug 2026): walking the floor in person is
           the headline act, and at the bottom of two card rows plenty of people
           never scrolled far enough to find out it existed.
           NOT ON A PHONE (Sep 2026): the floor is WebGL with pointer lock and
           WASD. There is no touch design that makes it playable, and a door
           that opens onto something unplayable is worse than no door — so the
           band is absent rather than disabled, and the You sheet says where
           the 3D worlds live. -->
      {#if !phone.on}
      <button class="enterband" onclick={enterCasino}>
        <span class="eb-doors">🂡</span>
        <span class="eb-body">
          <span class="eb-name">ENTER THE CASINO</span>
          <span class="eb-blurb">Walk the floor in first person — the same tables, in the flesh.</span>
        </span>
        <span class="eb-cta">step inside ▸</span>
      </button>
      {/if}

      <!-- THE GOBLINS' STOREFRONT (Josh, Aug 2026): their own band under the
           doors, pitched exactly the way they would pitch it. -->
      <button class="goblinband" class:owing={!!lender.loan} class:late={(lender.loan?.stage ?? 0) >= 1} onclick={() => (nav.rumble = "lender")}>
        <span class="gb-face">🪙</span>
        <span class="gb-body">
          <span class="gb-name">{lender.regime === "foundry" ? "FOUNDRY LENDING" : "GOBLIN LENDERS"}</span>
          {#if lender.loan}
            <span class="gb-blurb">
              <b class="gb-owe">YOU OWE {fmt(lender.loan.payoff)}</b> · {fmt(lender.loan.interest)} due tonight ·
              <b class="gb-stage s{lender.loan.stage}">{STAGE_NAMES[lender.loan.stage].toUpperCase()}</b>
              {#if lender.regime === "foundry"} — interest is due at midnight UTC.{:else if lender.loan.stage >= 1} — the collectors have been. They will be back.{:else} — pay by midnight UTC and they stay polite.{/if}
            </span>
          {:else if lender.regime === "foundry"}
            <span class="gb-blurb">The goblins are gone. The Foundry lends at fair rates now — no cells, no letters, no small print.</span>
          {:else}
            <span class="gb-blurb">Friend! Your purse is light — we can HEAR it. <b class="gb-vault">{lender.loaded ? fmt(lender.vault) : "Five million"}</b> in the vault, four easy windows, silver in your hand TODAY. The terms? Tiny writing, nothing to worry about. Everyone pays eventually.</span>
          {/if}
          {#if lender.prisoners.length || lender.shelf.length}
            <span class="gb-sub">
              {#if lender.prisoners.length}🔒 {lender.prisoners.length} in the cells{/if}
              {#if lender.prisoners.length && lender.shelf.length} · {/if}
              {#if lender.shelf.length}🏷 {lender.shelf.length} repossessed on the shelf{/if}
            </span>
          {/if}
        </span>
        <span class="gb-cta">{lender.loan ? "settle up ▸" : "borrow now ▸"}</span>
      </button>

      <div class="floor-label">GAMES</div>
      <div class="cards">
        {#each GAMES as g (g.key)}
          <button class="card" onclick={() => (nav.rumble = g.key)}>
            <span class="c-ico"><GameIcon game={g.key} size={46} /></span>
            <span class="c-body">
              <span class="c-name">{g.name}</span>
              <span class="c-blurb">{g.blurb}</span>
            </span>
            <span class="c-badge live">{g.tag}</span>
          </button>
        {/each}
      </div>

    </div>
  </div>
{/if}

{#if casinoOpen && casinoView === "hall"}
  {#await import("../casino/CasinoGame.svelte")}
    <div class="casinoload"><span>opening the doors…</span></div>
  {:then M}
    <M.default
      spawnAt={casinoSpawn}
      onExit={() => (casinoOpen = false)}
      onEscape={() => (casinoView = "escape")}
    />
  {:catch}
    <div class="casinoload">
      <span>the casino bundle failed to load — refresh and try again.</span>
      <button onclick={() => (casinoOpen = false)}>back</button>
    </div>
  {/await}
{:else if casinoOpen && casinoView === "escape"}
  {#await import("../casino/escape/EscapeRoom.svelte")}
    <div class="casinoload"><span>unlocking the ante-room…</span></div>
  {:then M}
    <M.default onBack={() => { casinoSpawn = "escape"; casinoView = "hall"; }} />
  {:catch}
    <div class="casinoload">
      <span>the ante-room failed to load — refresh and try again.</span>
      <button onclick={() => { casinoView = "hall"; casinoOpen = false; }}>back</button>
    </div>
  {/await}
{/if}

<style>
  /* ---- ENTER THE CASINO — the door, first thing under the header ---- */
  .enterband {
    display: flex;
    align-items: center;
    gap: 18px;
    width: 100%;
    margin: 4px 0 2px;
    padding: 18px 22px;
    background:
      linear-gradient(90deg, rgba(232, 195, 60, 0.14), rgba(232, 195, 60, 0.04) 45%, rgba(232, 195, 60, 0.14)),
      rgba(10, 14, 10, 0.82);
    border: 1px solid rgba(230, 190, 120, 0.45);
    border-radius: 12px;
    color: #f3e2bf;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
  }
  .enterband:hover {
    border-color: rgba(255, 217, 143, 0.9);
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 0 24px rgba(232, 195, 60, 0.12);
  }
  .eb-doors {
    font-size: 2rem;
    filter: drop-shadow(0 0 10px rgba(232, 195, 60, 0.5));
  }
  .eb-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .eb-name {
    font-weight: 900;
    letter-spacing: 0.26em;
    font-size: 0.95rem;
    background: linear-gradient(#fff0c4, #eab348 60%, #c8862c);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .eb-blurb {
    color: rgba(255, 240, 220, 0.6);
    font-size: 0.85rem;
  }
  .eb-cta {
    padding: 8px 16px;
    background: rgba(232, 195, 60, 0.14);
    border: 1px solid rgba(232, 195, 60, 0.4);
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  @media (max-width: 700px) {
    .enterband { flex-wrap: wrap; }
    .eb-cta { margin-left: auto; }
  }

  /* ---- The goblins' storefront: greedier, greener, pushier ---- */
  .goblinband {
    display: flex;
    align-items: center;
    gap: 18px;
    width: 100%;
    margin: 10px 0 2px;
    padding: 14px 22px;
    background:
      linear-gradient(90deg, rgba(94, 176, 74, 0.12), rgba(94, 176, 74, 0.03) 45%, rgba(94, 176, 74, 0.12)),
      rgba(8, 14, 8, 0.85);
    border: 1px solid rgba(122, 190, 96, 0.4);
    border-radius: 12px;
    color: #d9ecc9;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
  }
  .goblinband:hover {
    border-color: rgba(160, 220, 120, 0.85);
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 0 24px rgba(110, 200, 90, 0.12);
  }
  .gb-face {
    font-size: 1.8rem;
    filter: drop-shadow(0 0 10px rgba(140, 210, 100, 0.5)) hue-rotate(55deg);
  }
  .gb-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .gb-name {
    font-weight: 900;
    letter-spacing: 0.24em;
    font-size: 0.85rem;
    background: linear-gradient(#e6ffd0, #8ecf5a 60%, #558a2f);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .gb-blurb {
    color: rgba(226, 244, 210, 0.62);
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .gb-vault { color: #d9f5c0; }
  .gb-owe { color: #ffcf6a; letter-spacing: 0.06em; }
  .gb-stage.s0 { color: #9bd07a; }
  .gb-stage.s1 { color: #ffcf6a; }
  .gb-stage.s2, .gb-stage.s3 { color: #ff9a3c; }
  .gb-stage.s4, .gb-stage.s5 { color: #ff5a4a; }
  .gb-sub {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: rgba(226, 244, 210, 0.5);
  }
  /* The band turns from pitch to bill once you owe them. */
  .goblinband.owing {
    background:
      linear-gradient(90deg, rgba(230, 200, 96, 0.12), rgba(230, 200, 96, 0.03) 45%, rgba(230, 200, 96, 0.12)),
      rgba(14, 12, 8, 0.88);
    border-color: rgba(230, 200, 96, 0.4);
  }
  .goblinband.late {
    background:
      linear-gradient(90deg, rgba(200, 80, 50, 0.16), rgba(200, 80, 50, 0.04) 45%, rgba(200, 80, 50, 0.16)),
      rgba(16, 8, 6, 0.9);
    border-color: rgba(220, 100, 70, 0.5);
  }
  .gb-cta {
    padding: 8px 16px;
    background: rgba(122, 190, 96, 0.12);
    border: 1px solid rgba(122, 190, 96, 0.4);
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    white-space: nowrap;
    color: #bfe6a2;
  }
  /* THE GOBLINS GET A STRIP ON A PHONE, NOT A BILLBOARD (Josh, Sep 2026:
     "the link for the lenders it a huge block"). Their pitch is four lines of
     patter, and wrapping it here turned the band into a 224px advert sitting
     between the top of the casino and the first game — you scrolled past a
     loan pitch to reach the Wheel. The voice is the point, so it is clamped
     rather than cut: two lines of patter, the name above it, the button
     inline, and the cells/shelf line dropped (it is on their own page, one
     tap away). About 96px instead of 224. The second clause is a phone on
     its side, where the height matters more still. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    /* The hub's own header cost 245px before the first thing you can DO —
       a 6vh top pad, the marquee, the title, a two-line tagline and the
       wallet chip. On a phone that is a third of the screen spent saying
       where you already know you are. Tightened so the games start higher;
       the chip stays, because your balance is the one fact you came for. */
    .goblinband {
      /* The name is 21 characters of letter-spaced caps; keeping the button
         on the same row left it about 150px and it broke into THREE lines.
         So the text gets the full width and the button takes its own row,
         which also keeps it a proper 44px target instead of a squeezed pill. */
      flex-wrap: wrap;
      align-items: center;
      gap: 11px;
      padding: 10px 12px;
      margin: 8px 0 2px;
    }
    .gb-face {
      font-size: 1.35rem;
      width: 36px;
      height: 36px;
      flex: none;
    }
    .gb-body {
      /* A 200px BASIS is what actually pushes the button onto row two: with
         `flex: 1 1 0` the body just shrinks and the three of us stay on one
         squeezed line. 36px face + 11 gap + 200 leaves no room for the CTA,
         so it wraps — and the name then has ~260px, which fits on one line. */
      flex: 1 1 200px;
      min-width: 0;
    }
    .gb-name {
      font-size: 0.7rem;
    }
    .gb-blurb {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 0.78rem;
      line-height: 1.35;
    }
    .gb-sub {
      display: none;
    }
    .gb-cta {
      flex: none;
      margin-left: auto;
      font-size: 0.74rem;
      padding: 9px 14px;
    }
  }
  .casinoload {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: #0e0a08;
    color: #b9a86e;
  }
  .casinoload button {
    padding: 8px 18px;
    background: transparent;
    border: 1px solid rgba(232, 195, 60, 0.4);
    border-radius: 6px;
    color: #d8cfae;
    cursor: pointer;
  }

  /* ---- A live game (currently the wheel) ---- */
  .game {
    position: relative;
    height: 100%;
    min-height: 0;
  }
  .back {
    position: absolute;
    top: 12px;
    left: 14px;
    z-index: 6;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: color-mix(in srgb, var(--panel) 82%, transparent);
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    backdrop-filter: blur(4px);
  }
  .back:hover {
    color: var(--ink);
    border-color: var(--accent);
  }
  /* Phones: the floating pill collides with each game's own header — put the
     back button in the flow as a slim bar instead of overlaying the view.
     IT IS ALSO THE MOST-TAPPED CONTROL IN THE CASINO (it is how you leave
     every game), and it measured 84×31 — under the 44px touch floor on a
     control people reach for in a hurry. Sized up on touch, with the hit area
     widened past the text. */
  @media (max-width: 700px) {
    .game {
      display: flex;
      flex-direction: column;
    }
    .back {
      position: static;
      align-self: flex-start;
      margin: 8px 0 4px 12px;
      min-height: 44px;
      padding: 8px 18px;
      font-size: 0.92rem;
    }
    /* EVERY GAME SCROLLS IF IT NEEDS TO (Josh, Sep 2026: "make sure all game
       if they need to can scroll", after finding he could not bet on
       roulette, could not scroll the Nightly Draw, and could not see the
       Derby's race at all).

       This one rule was the cause of all three. On a phone `.game` is a flex
       column — the back pill, then the game — and the game got `flex: 1;
       min-height: 0`, which pins it to EXACTLY the leftover height and lets
       it shrink below its content. What happened next depended on the game:
       one with `overflow: visible` (roulette, the lottery) spilled its lower
       half past the bottom where `.view`'s hidden overflow ate it — the
       roulette betting board was simply not reachable — while one with an
       `overflow: hidden` child (the Derby's racetrack) squashed that child
       to nothing instead, because a clipping box has an automatic minimum
       size of zero.

       Making it the SCROLL PANE fixes every game at once, including ones
       not written yet, and is where it belongs: the games each draw a
       table, and none of them should have to know how tall the phone is.
       The back pill stays in flow above it, so the way out never scrolls
       away. */
    .game > :global(*:last-child) {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }

  /* ---- The hub landing: the casino floor ---- */
  .hub {
    height: 100%;
    overflow-y: auto;
    background:
      radial-gradient(1100px 520px at 50% 0%, rgba(255, 208, 120, 0.14), transparent 62%),
      radial-gradient(circle at 50% 42%, transparent 40%, rgba(0, 0, 0, 0.68) 100%),
      linear-gradient(rgba(6, 14, 9, 0.5), rgba(4, 10, 7, 0.64)),
      var(--felt) center / cover no-repeat fixed,
      #0a1810;
  }
  .hub-inner {
    max-width: 980px;
    margin: 0 auto;
    padding: clamp(28px, 6vh, 64px) 24px 48px;
  }
  .hub-head {
    text-align: center;
    margin-bottom: 32px;
  }
  .marquee-line {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.34em;
    color: rgba(255, 217, 143, 0.65);
    margin-bottom: 10px;
    text-shadow: 0 0 12px rgba(255, 200, 100, 0.35);
  }
  .hub-head h1 {
    margin: 0 0 8px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(30px, 5.4vw, 50px);
    font-weight: 700;
    letter-spacing: 0.045em;
    background: linear-gradient(#fff0c4, #eab348 48%, #c8862c 78%, #9a641c);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.6));
  }
  .hub-head p {
    margin: 0;
    color: rgba(255, 240, 220, 0.66);
    font-size: 1rem;
  }
  .wallet-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 14px;
    padding: 7px 16px;
    background: rgba(12, 20, 15, 0.78);
    border: 1px solid rgba(230, 190, 120, 0.35);
    border-radius: 999px;
    color: #f3e2bf;
    font: inherit;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    backdrop-filter: blur(2px);
    transition:
      border-color 0.14s ease,
      transform 0.14s ease;
  }
  .wallet-chip:hover {
    border-color: rgba(255, 217, 143, 0.8);
    transform: translateY(-1px);
  }
  .wallet-chip .unit {
    color: rgba(255, 240, 220, 0.5);
    font-weight: 600;
    font-size: 0.82rem;
  }
  .floor-label {
    margin: 22px 2px 10px;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    color: rgba(255, 217, 143, 0.45);
  }
  /* GAMES used to sit directly under the header and needed its top margin
     pulled in. It now follows the ENTER THE CASINO band, so it wants the
     normal separation every other section label gets. */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
  .card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 16px 18px;
    text-align: left;
    background: rgba(12, 20, 15, 0.78);
    border: 1px solid rgba(230, 190, 120, 0.24);
    border-radius: 16px;
    color: #ece4d4;
    font: inherit;
    cursor: pointer;
    backdrop-filter: blur(2px);
    transition:
      transform 0.14s ease,
      border-color 0.14s ease,
      box-shadow 0.14s ease;
  }
  .card:not(.soon):hover {
    transform: translateY(-3px);
    border-color: rgba(255, 217, 143, 0.75);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 24px rgba(240, 190, 90, 0.14);
  }
  .c-ico {
    flex: none;
    width: 62px;
    height: 62px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background:
      radial-gradient(ellipse at 50% 20%, rgba(255, 255, 255, 0.09), transparent 60%),
      radial-gradient(ellipse at 50% 45%, #1d6b40, #11482a 75%, #0b331d);
    box-shadow:
      inset 0 0 0 1.5px rgba(230, 190, 120, 0.45),
      inset 0 3px 8px rgba(0, 0, 0, 0.4);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
  }
  .c-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  .c-name {
    font-family: Georgia, serif;
    font-size: 1.06rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #f3dfa8;
  }
  .c-blurb {
    font-size: 0.82rem;
    line-height: 1.4;
    color: rgba(255, 240, 220, 0.6);
  }
  .c-badge {
    position: absolute;
    top: -9px;
    right: 12px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.64rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: rgba(255, 240, 220, 0.5);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(230, 190, 120, 0.25);
  }
  .c-badge.live {
    color: #2c1c05;
    background: linear-gradient(#ffe6a8, #eab348 55%, #cf9330);
    border-color: transparent;
  }

  /* The casino hub's header, tightened for a phone.
     PLACED AT THE END OF THE SHEET ON PURPOSE. These properties are also set
     by the ordinary rules above, at the same specificity, so whichever comes
     LATER wins — and in their original home (up with the other phone rules)
     they lost and did nothing at all. Caught by test_touch_floor.mjs, which
     now fails on exactly this shape. Anything added here must stay below. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    .hub-inner {
      padding: 14px 16px 32px;
    }
    .marquee-line {
      margin-bottom: 6px;
      letter-spacing: 0.2em;
    }
  }
</style>
