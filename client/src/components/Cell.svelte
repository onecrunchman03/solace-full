<script lang="ts">
  // THE CELL — what you see when the goblins have you (migration 72).
  //
  // This is the Terminated screen's sibling, and deliberately NOT the same
  // thing: you are not dead, you are HELD, and the difference is that somebody
  // can still do something about it. So the screen is built around the two
  // facts that matter — what you owe, and how long is left — and it does not
  // let you do anything at all. A prisoner's session opens exactly one route.
  //
  // It polls, because the way out is somebody ELSE paying: the moment bail
  // lands, /api/cell starts 401ing and refreshCell drops us into the app as a
  // free person, with no reload and no action from the person in here.
  import { onMount, onDestroy } from "svelte";
  import { session, refreshCell, logout } from "../lib/session.svelte";
  import { api } from "../lib/api";
  import StartOver from "./StartOver.svelte";
  import goblin from "../assets/lender-goblin.webp";

  let now = $state(Date.now());
  let tick: ReturnType<typeof setInterval> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    tick = setInterval(() => { now = Date.now(); }, 1000);
    // Somebody may pay at any moment; 15s is quick enough to feel like rescue
    // and slow enough to be free.
    poll = setInterval(() => { void refreshCell(); }, 15_000);
  });
  onDestroy(() => {
    if (tick) clearInterval(tick);
    if (poll) clearInterval(poll);
  });

  const cell = $derived(session.cell);
  let houseBusy = $state(false);
  let houseErr = $state("");
  async function houseSettles() {
    houseBusy = true;
    houseErr = "";
    try {
      await api.cellConsolidate();
      await refreshCell(); // free — bootstrap takes over
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      houseErr = code === "already_used" ? "The house settled for you once this life already."
        : code === "can_pay" ? "You've got the silver for this. Post bail."
        : code === "escrow_open" ? "Your silver is still on a table somewhere. The house won't pay around it."
        : "The house declined.";
    } finally {
      houseBusy = false;
    }
  }
  const left = $derived(Math.max(0, (cell?.sealsAt ?? 0) - now));
  const hh = $derived(Math.floor(left / 3_600_000));
  const mm = $derived(Math.floor((left % 3_600_000) / 60_000));
  const ss = $derived(Math.floor((left % 60_000) / 1000));
  const fmt = (n: number): string => n.toLocaleString();

  // THE PLEA (Sep 2026): one line on your cell card at the kiosk. The only
  // thing a prisoner can DO — and it is talking to the outside, which is the
  // point of the 48 hours.
  let pleaDraft = $state("");
  let pleaBusy = $state(false);
  let pleaSaved = $state(false);
  // Seed the draft from the card ONCE. (The first cut refilled it whenever
  // the field was empty — so the prisoner could never clear the line: delete
  // the last character and the effect wrote it back. Review finding.)
  let pleaSeeded = false;
  $effect(() => {
    if (cell && !pleaSeeded) {
      pleaSeeded = true;
      pleaDraft = cell.plea ?? "";
    }
  });
  const savePlea = async (): Promise<void> => {
    pleaBusy = true;
    try {
      await api.cellPlea(pleaDraft);
      pleaSaved = true;
      setTimeout(() => (pleaSaved = false), 2500);
      void refreshCell();
    } catch {
      /* a refused plea just stays unsaved */
    } finally {
      pleaBusy = false;
    }
  };
  const potPct = $derived(cell && cell.bail > 0 ? Math.min(100, Math.round((cell.pot / cell.bail) * 100)) : 0);
</script>

<div class="cellscreen">
  <div class="bars" aria-hidden="true"></div>
  <div class="panel">
    <img class="mug" src={goblin} alt="" />
    <h1>GOBLIN LENDERS</h1>
    <p class="held">
      {cell?.user.displayName ?? "You"} is being held against an outstanding debt.
    </p>

    <div class="numbers">
      <div>
        <span class="nl">outstanding</span>
        <span class="nv">{fmt(cell?.debt ?? 0)}</span>
      </div>
      <div>
        <span class="nl">bail</span>
        <span class="nv">{fmt(cell?.bail ?? 0)}</span>
      </div>
    </div>

    {#if (cell?.user?.vipTier ?? 0) >= 4 || cell?.user?.isAdmin}
      <!-- THE HOUSE PAYS (Tier 4, once a life): the debt to the vault on the
           Foundry's books, and the door opens. -->
      <button class="house" disabled={houseBusy} onclick={() => void houseSettles()}>
        {houseErr || "HAVE THE HOUSE SETTLE IT — once a life"}
      </button>
    {/if}

    <div class="clock" class:urgent={left < 6 * 3_600_000}>
      <span class="cl">the cell seals in</span>
      <span class="cv">{hh}h {String(mm).padStart(2, "0")}m {String(ss).padStart(2, "0")}s</span>
    </div>

    <!-- THE BAIL POT: friends chip in toward the price; when it fills, the
         door opens. Shown even at zero so a prisoner knows it exists. -->
    <div class="pot">
      <div class="pot-row">
        <span class="nl">the bail pot</span>
        <span class="pot-num">{fmt(cell?.pot ?? 0)} <span class="of">of {fmt(cell?.bail ?? 0)}</span></span>
      </div>
      <div class="pot-bar"><div class="pot-fill" style="width: {potPct}%"></div></div>
      {#if cell?.contributors.length}
        <div class="pot-who">
          {#each cell.contributors as c (c.userId)}
            <span class="chip">{c.user?.displayName ?? "someone"} · {fmt(c.amount)}</span>
          {/each}
        </div>
      {:else}
        <div class="pot-who dim">Nobody has chipped in yet.</div>
      {/if}
    </div>

    <!-- THE PLEA: what the outside reads on your card. -->
    <div class="plea">
      <label class="nl" for="plea">scratch a line on your card</label>
      <div class="plea-row">
        <input id="plea" class="plea-in" maxlength="140" placeholder="bring 15k — I'll pay you back, I swear"
          bind:value={pleaDraft} onkeydown={(e) => { if (e.key === "Enter") void savePlea(); }} />
        <button class="plea-btn" disabled={pleaBusy} onclick={() => void savePlea()}>{pleaSaved ? "carved" : "carve"}</button>
      </div>
    </div>

    <p class="terms">
      Anyone still at liberty may settle your bail at the kiosk, alone or by
      chipping into the pot. They will pay more than you owe — that is the
      arrangement, and we are told it encourages promptness in others.
    </p>
    <p class="warn">
      If nobody comes, this life is closed and your estate is applied to the
      balance. What survives passes to the next generation.
    </p>
    <p class="fine">Bail buys your body back. It does not buy your debt back.</p>

    <div class="reroll">
      <StartOver
        note="Or leave this name to the goblins. A fresh account, no invite code needed — the cell is your invitation. The debt stays with the body in here: when the cell seals, the estate settles it, none of it yours to carry."
      />
    </div>

    <button class="out" onclick={() => void logout()}>sign out</button>
  </div>
</div>

<style>
  /* Stone, iron and one bad lamp. Nothing on this screen is clickable except
     the way out of it. */
  .cellscreen {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) — the cell owns the screen */
    display: grid;
    place-items: center;
    background:
      radial-gradient(120% 90% at 50% 0%, #241d16 0%, #0a0807 62%),
      #070605;
    color: #d8cdb4;
    overflow: auto;
    padding: 24px;
  }
  /* The bars sit in FRONT of the panel, because that is the point. */
  .bars {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      90deg,
      transparent 0 76px,
      rgba(0, 0, 0, 0.72) 76px 90px,
      rgba(120, 110, 96, 0.16) 90px 92px,
      transparent 92px 168px
    );
    z-index: 2;
  }
  .panel {
    position: relative;
    z-index: 1;
    max-width: 520px;
    text-align: center;
    padding: 26px 22px;
    border-radius: 12px;
    background: rgba(14, 11, 9, 0.86);
    border: 1px solid #5a4a2c;
    box-shadow: 0 20px 60px #000a;
  }
  .mug {
    width: 92px;
    height: 92px;
    object-fit: cover;
    object-position: 50% 20%;
    border-radius: 50%;
    border: 2px solid #8a7434;
    filter: grayscale(0.35) contrast(1.1);
  }
  h1 {
    margin: 12px 0 2px;
    font: 800 17px ui-serif, Georgia, serif;
    letter-spacing: 0.16em;
    color: #e6c860;
  }
  .held { margin: 6px 0 18px; font-size: 0.92rem; color: #b3a888; }
  .numbers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 14px;
  }
  .nl { display: block; font-size: 0.64rem; letter-spacing: 0.16em; text-transform: uppercase; color: #7f7660; }
  .nv { font: 800 21px ui-monospace, monospace; color: #e6c860; }
  .house {
    margin: 4px 0 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #7fe6ec;
    background: rgba(127, 230, 236, 0.08);
    color: #7fe6ec;
    font: inherit;
    font-weight: 800;
    letter-spacing: 0.08em;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .house:disabled { opacity: 0.5; cursor: default; }
  .clock {
    padding: 10px;
    border-radius: 9px;
    background: #120f0c;
    border: 1px solid #4a3f2a;
    margin-bottom: 16px;
  }
  .clock.urgent { border-color: #a33; }
  .clock.urgent .cv { color: #e2705f; }
  .cl { display: block; font-size: 0.64rem; letter-spacing: 0.16em; text-transform: uppercase; color: #7f7660; }
  .cv { font: 800 24px ui-monospace, monospace; color: #d8cdb4; }
  /* ---- the pot + the plea ---- */
  .pot {
    text-align: left;
    padding: 10px 12px;
    border-radius: 9px;
    background: #120f0c;
    border: 1px solid #4a3f2a;
    margin-bottom: 12px;
  }
  .pot-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .pot-num { font: 800 15px ui-monospace, monospace; color: #b6e660; }
  .pot-num .of { font-size: 11px; font-weight: 600; color: #7f7660; }
  .pot-bar { height: 7px; border-radius: 4px; background: #060504; border: 1px solid #3a3020; margin: 6px 0; overflow: hidden; }
  .pot-fill { height: 100%; background: linear-gradient(90deg, #5f8a34, #b6e660); transition: width 0.4s ease; }
  .pot-who { display: flex; flex-wrap: wrap; gap: 5px; font-size: 0.72rem; color: #a89e84; }
  .pot-who.dim { color: #7f7660; font-style: italic; }
  .chip { padding: 1px 7px; border-radius: 999px; background: #1a1610; border: 1px solid #4a3f2a; font-variant-numeric: tabular-nums; }
  .plea { text-align: left; margin-bottom: 12px; }
  .plea-row { display: flex; gap: 6px; margin-top: 4px; }
  .plea-in {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #0d0b09;
    border: 1px solid #4a3f2a;
    color: #e6d8b8;
    font: 500 0.86rem ui-serif, Georgia, serif;
  }
  .plea-btn {
    padding: 8px 14px;
    border-radius: 8px;
    background: #2a2417;
    border: 1px solid #8a7434;
    color: #e6c860;
    font: 700 0.8rem system-ui, sans-serif;
    cursor: pointer;
  }
  .plea-btn:disabled { opacity: 0.5; }
  .terms { font-size: 0.86rem; line-height: 1.5; color: #a89e84; }
  .warn { font-size: 0.86rem; line-height: 1.5; color: #c98a6a; }
  .fine { font: italic 500 0.78rem ui-serif, Georgia, serif; color: #7f7660; }
  .out {
    margin-top: 14px;
    padding: 8px 18px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid #4a3f2a;
    color: #8a8069;
    font: 600 0.82rem system-ui, sans-serif;
    cursor: pointer;
  }
  .out:hover { color: #d8cdb4; border-color: #6a5c40; }
  /* The reroll form reads left-aligned inside the centered panel. */
  .reroll { text-align: left; margin-top: 12px; }
</style>
