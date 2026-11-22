<script lang="ts">
  // STERLING'S CASINO COUNTER (Josh, Aug 2026: "walk up to Sterling and press E
  // to open a unique casino shop menu — buy more spins for the wheel, sell
  // emojis for silver, buy a talisman for 5000 silver"), reworked as a proper
  // counter (Josh again: "organized, clean, and aesthetic to the casino vibe")
  // — a menu board down the left, one department at a time on the right, item
  // cards in the hall's own walnut and brass.
  //
  // The floor holds NO money paths of its own: every button here posts to the
  // same /api/shop endpoints the 2D Trader uses, so the atomic store ops and
  // their guards are the only things that ever move value.
  import {
    wallet, buySpins, sellEmoji, buyTalismanSilver, buyMythic, buyDrink, buySlorp,
    buyStardust, buyEgo, buyGun, buyGunClip, sellValue,
  } from "../lib/wallet.svelte";
  import { DRINKS } from "./drink";
  import { api, ApiError } from "../lib/api";
  import { emoji } from "../lib/emoji.svelte";
  import { wheel, loadWheelStatus } from "../lib/wheel.svelte";
  import { playSfx } from "../lib/sfx";
  import { onMount, onDestroy } from "svelte";
  import { sterlingLine } from "../lib/sterling-lines";
  import { takeIdle, primeIdle } from "../lib/npcvoice";
  import { sterlingMurmur } from "../lib/shop-audio";
  import "./strips/strip.css";

  // Sterling greets and keeps talking — personalized bar dialogue from the
  // centralized brain (name, purse, recent wins, goblin debts), murmured in
  // the brass-blip voice, rotating like the 2D Shop's patter.
  // THE HOUSE'S BRAINS (lib/npcvoice.ts): the lines are written for this
  // customer by the model; the scripted brain only when no batch is to hand.
  let barLine = $state("…");
  let lineTimer: ReturnType<typeof setInterval> | undefined;
  const show = (line: string): void => {
    barLine = line;
    sterlingMurmur(barLine);
  };
  const speak = (): void => show(takeIdle("sterling", "bar") ?? sterlingLine("bar"));
  onMount(() => {
    void primeIdle("sterling", "bar").then((ai) => show(ai ?? sterlingLine("bar")));
    lineTimer = setInterval(speak, 22_000);
  });
  onDestroy(() => clearInterval(lineTimer));

  type Tab = "spins" | "sell" | "talisman" | "mythic" | "bar" | "gun";
  let tab = $state<Tab>("spins");
  /** Handed a bought bottle to the floor, which puts it in your hands, and
   *  whether there is a free pocket to put it in. `gunOwned`/`onArmed` let the
   *  counter refuse a second gun without a round trip and hand the floor its
   *  new ammo state the moment the sale lands. */
  let { onPour, handsFull = false, gunOwned = false, onArmed, onSlorp, tripping = false, hasCanister = false, onStardust, onEgoShot, people = [] }: {
    onPour?: (drinkId: string) => boolean;
    handsFull?: boolean;
    gunOwned?: boolean;
    onArmed?: (rounds: number, clips: number) => void;
    /** Tip the vial back — the floor owns the ten minutes that follow. */
    onSlorp?: () => void;
    /** Already on one: the counter refuses to sell a second. */
    tripping?: boolean;
    /** A STAR DUST can is already in a pocket — one at a time. */
    hasCanister?: boolean;
    /** Hand the canister to the floor (a pocket, three huffs). False = no
     *  free pocket — the refusal happens BEFORE the money moves. */
    onStardust?: () => boolean;
    /** Hand one EGO shot to the floor (a pocket). Same contract. */
    onEgoShot?: () => boolean;
    /** The other players on the floor — who a round can be bought for. */
    people?: { id: number; name: string }[];
  } = $props();
  /** Who this round is for: 0 = you, or somebody on the floor. */
  let forWho = $state(0);
  const forName = $derived(people.find((p) => p.id === forWho)?.name ?? "");
  // somebody who walked out can't be bought for
  $effect(() => {
    if (forWho && !people.some((p) => p.id === forWho)) forWho = 0;
  });

  /** A round for somebody else: the counter puts it straight in their
   *  pockets. Every refusal is the server's, and it
   *  refuses before it charges. */
  async function doTreat(item: string, label: string): Promise<void> {
    if (busy || !forWho) return;
    busy = true;
    const who = forName || "them";
    try {
      const r = await api.casinoTreat(item, forWho);
      wallet.coins = r.coins;
      playSfx("register", 0.5);
      say(`Sterling sends ${label} over to ${who}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "error";
      say(
        code === "insufficient" ? "not enough silver"
        : code === "hands_full" ? `${who}'s hands are full`
        : code === "not_here" ? `${who} has left the floor`
        : code === "rate_limited" ? "slow down — one round at a time"
        : "the counter refused it",
        true,
      );
    } finally {
      busy = false;
    }
  }
  /** The vial's second tap. Falls back to unarmed after a few seconds so a
   *  half-pressed decision doesn't sit there waiting to be leaned on. */
  let slorpArmed = $state(false);
  let busy = $state(false);
  let note = $state<{ text: string; bad?: boolean } | null>(null);
  let spinCount = $state(1);
  let picked = $state<string[]>([]);

  const MENU: { id: Tab; label: string; sub: string }[] = [
    { id: "spins", label: "Wheel Spins", sub: "the collector's accelerator" },
    { id: "sell", label: "Sell Emoji", sub: "the till pays silver" },
    { id: "talisman", label: "The Talisman", sub: "one refusal of the reaper" },
    { id: "mythic", label: "The Top Shelf", sub: "a mythic, unnamed" },
    { id: "bar", label: "The Bar", sub: "bottles, poured cold" },
    { id: "gun", label: "Under the Counter", sub: "a gun, and worse ideas" },
  ];

  const say = (text: string, bad = false): void => {
    note = { text, bad };
    setTimeout(() => (note = null), 4200);
  };

  // Only what the Trader will actually buy — the talisman, specials and mythics
  // have no price and move by trade alone.
  const sellable = $derived(emoji.owned.filter((e) => sellValue(e.tier) > 0));
  const takeHome = $derived(
    picked.reduce((s, code) => s + sellValue(emoji.owned.find((e) => e.code === code)?.tier ?? ""), 0),
  );
  const spinCost = $derived(spinCount * wallet.spinPrice);

  const toggle = (code: string): void => {
    picked = picked.includes(code) ? picked.filter((c) => c !== code) : [...picked, code];
  };

  async function doBuySpins(): Promise<void> {
    if (busy) return;
    busy = true;
    const r = await buySpins(spinCount);
    busy = false;
    if (!r.ok) return say(r.error === "insufficient" ? "not enough silver" : "the till refused it", true);
    await loadWheelStatus();
    playSfx("register", 0.5);
    say(`${spinCount} spin${spinCount === 1 ? "" : "s"} added — ${r.spins} in hand`);
  }

  async function doSell(): Promise<void> {
    if (busy || !picked.length) return;
    busy = true;
    const r = await sellEmoji(picked);
    busy = false;
    if (!r.ok) return say("Sterling wouldn't take those", true);
    picked = [];
    playSfx("register", 0.5);
    say(`sold for ${r.gained} silver`);
  }

  async function doDrink(id: string): Promise<void> {
    if (busy) return;
    if (forWho) return doTreat(id, `a ${DRINKS.find((d) => d.id === id)?.name ?? "drink"}`);
    // REFUSED BEFORE THE MONEY MOVES (Josh, Aug 2026: "don't allow a user to
    // buy any more alcohol if their inventory is full"). The first cut took
    // the silver and then shrugged that your hands were full, which burned
    // it for nothing — a small money bug, but a money bug.
    if (handsFull) return say("your hands are full — drink one first", true);
    busy = true;
    const r = await buyDrink(id);
    busy = false;
    if (!r.ok) return say(r.error === "insufficient" ? "not enough silver" : "the bar refused it", true);
    // …and if the pocket vanished under us between the check and the pour,
    // say so rather than pretending it arrived.
    const took = onPour?.(id) ?? false;
    playSfx("register", 0.5);
    say(took ? "Sterling slides it across the bar" : "your hands are full — drink one first", !took);
  }

  /** SLORP. The money burns here; the ten minutes are the floor's business, so
   *  all this does is hand the trip to the hall (`onSlorp`) once the sale
   *  lands. Refused before the money moves if you're already on one — the
   *  bar's rule, and for the same reason: a burn that buys nothing is a money
   *  bug however small. */
  async function doSlorp(): Promise<void> {
    if (busy) return;
    slorpArmed = false;
    if (forWho) return doTreat("slorp", "a vial of slorp");
    if (tripping) return say("you're already on one", true);
    busy = true;
    const r = await buySlorp();
    busy = false;
    if (!r.ok) return say(r.error === "insufficient" ? "not enough silver" : "he changed his mind", true);
    playSfx("register", 0.5);
    onSlorp?.();
    say("Sterling palms the vial across and looks away");
  }

  /** STAR DUST. The bar's money rule again: every refusal (already holding a
   *  can, no free pocket) happens before the burn, because a burn that buys
   *  nothing is a money bug however funny the product. */
  async function doStardust(): Promise<void> {
    if (busy) return;
    if (forWho) return doTreat("stardust", "a can of star dust");
    if (hasCanister) return say("one canister at a time — finish that one", true);
    if (handsFull) return say("your hands are full — drink one first", true);
    busy = true;
    const r = await buyStardust();
    busy = false;
    if (!r.ok) return say(r.error === "insufficient" ? "not enough silver" : "he changed his mind", true);
    // …and if the pocket vanished between the check and the handover, say so
    // rather than pretending it arrived (the bar's own rule).
    const took = onStardust?.() ?? false;
    playSfx("register", 0.5);
    say(took ? "Sterling slides the can across without a word" : "your hands are full — drink one first", !took);
  }

  /** EGO. One goopy shot; the bar's money rule (refuse before the burn). */
  async function doEgo(): Promise<void> {
    if (busy) return;
    if (forWho) return doTreat("ego", "a shot of EGO");
    if (handsFull) return say("your hands are full — drink one first", true);
    busy = true;
    const r = await buyEgo();
    busy = false;
    if (!r.ok) return say(r.error === "insufficient" ? "not enough silver" : "he changed his mind", true);
    const took = onEgoShot?.() ?? false;
    playSfx("register", 0.5);
    say(took ? "Sterling pours it slow. It doesn't want to leave the bottle." : "your hands are full — drink one first", !took);
  }

  async function doGun(): Promise<void> {
    if (busy) return;
    busy = true;
    const r = await buyGun();
    busy = false;
    if (!r.ok) {
      if (r.error === "cancelled") return;
      return say(
        r.error === "insufficient" ? "not enough silver"
        : r.error === "gun_owned" ? "you already own it — one per customer"
        : "the counter refused it",
        true,
      );
    }
    playSfx("gun-cock", 0.7);
    onArmed?.(9, 1);
    say("Sterling slides it across in a cloth. No refunds, no questions.");
  }

  async function doClip(): Promise<void> {
    if (busy) return;
    busy = true;
    const r = await buyGunClip();
    busy = false;
    if (!r.ok) {
      return say(
        r.error === "insufficient" ? "not enough silver"
        : r.error === "no_gun" ? "he won't sell ammunition to the unarmed"
        : "the counter refused it",
        true,
      );
    }
    playSfx("gun-reload", 0.6);
    onArmed?.(-1, r.clips ?? 0);
    say(`a spare magazine — ${r.clips ?? 1} in the coat now`);
  }

  async function doMythic(): Promise<void> {
    if (busy) return;
    busy = true;
    const r = await buyMythic();
    busy = false;
    if (!r.ok) {
      return say(
        r.error === "insufficient" ? "not enough silver"
        : r.error === "owns_all_mythics" ? "you own every mythic there is"
        : "the top shelf is closed",
        true,
      );
    }
    playSfx("pit-crown", 0.6);
    say(`Sterling hands over ${r.name ?? "a mythic"}`);
  }

  async function doTalisman(): Promise<void> {
    if (busy) return;
    busy = true;
    const r = await buyTalismanSilver();
    busy = false;
    if (!r.ok) {
      return say(
        r.error === "insufficient" ? "not enough silver"
        : r.error === "already_shielded" ? "you already carry one"
        : "the counter refused it",
        true,
      );
    }
    playSfx("wheel-talisman", 0.6);
    say("the talisman is yours — the reaper gets one refusal");
  }
</script>

<div class="strip sterling">
  <div class="sthead">
    <span class="stmark">⚙ STERLING'S COUNTER</span>
    <span class="stbal">🪙 <b>{wallet.coins.toLocaleString()}</b> silver</span>
    {#if note}<span class={note.bad ? "serr" : "stnote"}>{note.text}</span>{/if}
  </div>
  <!-- He talks to YOU, from the same brain as his 2D counter. -->
  <div class="stsay">“{barLine}”</div>

  <div class="stwrap">
    <nav class="stmenu">
      {#each MENU as m (m.id)}
        <button class="stitem" class:on={tab === m.id} onclick={() => (tab = m.id)}>
          <span class="stlabel">{m.label}</span>
          <span class="stsub">{m.sub}</span>
        </button>
      {/each}
    </nav>

    <div class="stpane">
      {#if tab === "spins"}
        <div class="stcard">
          <div class="stinfo">
            <span class="stname">Extra Wheel spins</span>
            <span class="stdesc">{wallet.spinPrice} silver each · you hold <b>{wheel.spins.total}</b></span>
          </div>
          <div class="stbuyrow">
            <input class="snum" type="number" min="1" max="50" bind:value={spinCount} />
            <button class="sbtn hot" disabled={busy || spinCount < 1 || spinCost > wallet.coins} onclick={doBuySpins}>
              BUY {spinCount} — {spinCost.toLocaleString()}
            </button>
          </div>
        </div>
      {:else if tab === "sell"}
        {#if !sellable.length}
          <span class="stnote">nothing he'll buy — commons, rares and legendaries only</span>
        {:else}
          <div class="stcard wide">
            <div class="stinfo">
              <span class="stname">Sell to the till</span>
              <span class="stdesc">{picked.length} picked · <b>{takeHome.toLocaleString()}</b> silver — the sale is permanent</span>
            </div>
            <span class="sellgrid">
              {#each sellable as e (e.code)}
                <button
                  class="sellone"
                  class:on={picked.includes(e.code)}
                  title="{e.name} · {sellValue(e.tier)} silver"
                  onclick={() => toggle(e.code)}
                >
                  <img src="/emoji/{e.file}" alt={e.name} />
                  <span class="sellval">{sellValue(e.tier)}</span>
                </button>
              {/each}
            </span>
            <button class="sbtn hot" disabled={busy || !picked.length} onclick={doSell}>
              SELL {picked.length} — {takeHome.toLocaleString()}
            </button>
          </div>
        {/if}
      {:else if tab === "talisman"}
        <div class="stcard">
          <div class="stinfo">
            <span class="stname">🪵 The Talisman</span>
            <span class="stdesc">
              {wallet.reaperRetired
                ? "the reaper is retired. The talisman is a keepsake now, and the house no longer sells it."
                : wallet.hasTalisman
                ? "you already carry the carved amulet — one shield at a time."
                : "the carved amulet. Land on the reaper wearing it and it burns instead of you."}
            </span>
            {#if !wallet.reaperRetired && !wallet.hasTalisman && wallet.shieldOffer}
              <span class="stoffer">
                {wallet.shieldOffer.kind === "courtesy"
                  ? `Sterling's courtesy — ${wallet.shieldOffer.pct}% off, for you`
                  : `Shield sale — ${wallet.shieldOffer.pct}% off the counter`}
              </span>
            {/if}
          </div>
          {#if !wallet.hasTalisman && !wallet.reaperRetired}
            <button class="sbtn hot" disabled={busy || wallet.coins < wallet.talismanPrice} onclick={doTalisman}>
              BUY — {#if wallet.shieldOffer}<s>{wallet.talismanBasePrice.toLocaleString()}</s>
              {/if}{wallet.talismanPrice.toLocaleString()}
            </button>
          {/if}
        </div>
      {:else if tab === "mythic"}
        <div class="stcard">
          <div class="stinfo">
            <span class="stname">✨ A mythic, unnamed</span>
            <span class="stdesc">the top shelf. One mythic you don't own yet — Sterling won't say which.</span>
          </div>
          <button class="sbtn hot" disabled={busy || wallet.coins < wallet.mythicPrice} onclick={doMythic}>
            BUY — {wallet.mythicPrice.toLocaleString()}
          </button>
        </div>
      {:else if tab === "bar"}
        <label class="stfor">
          <span>for</span>
          <select bind:value={forWho}>
            <option value={0}>me</option>
            {#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </label>
        <span class="stnote">
          {forWho
            ? `it goes straight into ${forName}'s pockets.`
            : handsFull
            ? "your hands are full — drink one or set it down (G) before buying another."
            : "a bottle goes in your hands — 1/2/3 to hold it, left-click to drink, G to set it down."}
        </span>
        <div class="strow">
          {#each DRINKS as d (d.id)}
            <div class="stcard drink">
              <div class="stinfo">
                <span class="stname">🍾 {d.name}</span>
                <span class="stdesc">{d.blurb}</span>
              </div>
              <button
                class="sbtn hot"
                disabled={busy || (!forWho && handsFull) || wallet.coins < (forWho ? d.price : (wallet.drinkPrices[d.id] ?? d.price))}
                onclick={() => doDrink(d.id)}
              >
                {(forWho ? d.price : (wallet.drinkPrices[d.id] ?? d.price)).toLocaleString()}
              </button>
            </div>
          {/each}
        </div>
      {:else if tab === "gun"}
        {#if gunOwned}
          <div class="stcard">
            <div class="stinfo">
              <span class="stname">▮▮ Spare magazines</span>
              <span class="stdesc">9 rounds each. You already own the gun — one per customer, forever.</span>
            </div>
            <button class="sbtn hot" disabled={busy || wallet.coins < wallet.clipPrice} onclick={doClip}>
              BUY — {wallet.clipPrice.toLocaleString()}
            </button>
          </div>
        {:else}
          <div class="stcard gun">
            <div class="stinfo">
              <span class="stname">🔫 {wallet.gunName}</span>
              <span class="stdesc">
                Sterling glances both ways, reaches under the counter. Ships loaded —
                9 rounds and a spare clip. Being shot puts a body on the carpet for
                ten seconds and costs it nothing but the walk back in.
              </span>
            </div>
            <button class="sbtn hot" disabled={busy || wallet.coins < wallet.gunPrice} onclick={doGun}>
              BUY — {wallet.gunPrice.toLocaleString()}
            </button>
          </div>
        {/if}

<label class="stfor">
          <span>for</span>
          <select bind:value={forWho}>
            <option value={0}>me</option>
            {#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </label>
        {#if forWho}<span class="stnote">it goes straight into {forName}'s pockets.</span>{/if}

        <!-- STAR DUST. Compressed and unlabelled. One tap — unlike the vial,
             the can doesn't kill you unless you empty it in a hurry, and the
             meter warns you the whole way. -->
        <div class="stcard stardust">
          <div class="stinfo">
            <span class="stname">🫙 Star Dust</span>
            <span class="stdesc">
              A cold steel canister, three huffs to a can. The room goes neon and
              your voice goes up an octave for everyone else — <b>five minutes</b> a
              hit. Space them out. Three in one sitting and the third one is the
              last sound anyone hears from you that isn't a sound. And a word
              from management: <b>do not mix it with drink</b>.
            </span>
          </div>
          {#if hasCanister && !forWho}
            <span class="stwarn">you've still got a can</span>
          {:else}
            <button
              class="sbtn hot"
              disabled={busy || (!forWho && handsFull) || wallet.coins < (forWho ? wallet.drugBase.stardust : wallet.stardustPrice)}
              onclick={doStardust}
            >
              BUY — {(forWho ? wallet.drugBase.stardust : wallet.stardustPrice).toLocaleString()}
            </button>
          {/if}
        </div>

        <!-- EGO. Confidence, by the shot. One tap — the first two are merely
             embarrassing; the third is a decision you make with the glass,
             not the purse. -->
        <div class="stcard ego">
          <div class="stinfo">
            <span class="stname">🥃 EGO</span>
            <span class="stdesc">
              A goopy pour of confidence serum, taken as a shot. Your head swells,
              your voice deepens, and the world bulges agreeably — it all drains
              back over a few minutes (slower, regulars report, if you keep
              drinking). A <b>third shot while still swollen</b> is
              how confident men become confetti.
            </span>
          </div>
          <button
            class="sbtn hot"
            disabled={busy || (!forWho && handsFull) || wallet.coins < (forWho ? wallet.drugBase.ego : wallet.egoPrice)}
            onclick={doEgo}
          >
            A SHOT — {(forWho ? wallet.drugBase.ego : wallet.egoPrice).toLocaleString()}
          </button>
        </div>

        <!-- SLORP. The other thing under there. Two taps, because 1,500 silver
             buys you ten minutes and then it kills you, and a misclick that
             does that is not a joke anybody enjoys twice. -->
        <div class="stcard slorp">
          <div class="stinfo">
            <span class="stname">🧪 Slorp</span>
            <span class="stdesc">
              An unlabelled vial of something green. Sterling doesn't meet your eye.
              <b>Ten minutes</b> — it starts pretty, it gets strange, and it does not end
              well. You'll be back on your feet at the entrance a few seconds later; it
              costs your account nothing and your dignity everything.
            </span>
          </div>
          {#if tripping && !forWho}
            <span class="stwarn">you're already on one</span>
          {:else if slorpArmed}
            <button class="sbtn danger" disabled={busy} onclick={doSlorp}>
              TAKE IT — {(forWho ? wallet.drugBase.slorp : wallet.slorpPrice).toLocaleString()}
            </button>
          {:else}
            <button
              class="sbtn hot"
              disabled={busy || wallet.coins < (forWho ? wallet.drugBase.slorp : wallet.slorpPrice)}
              onclick={() => { slorpArmed = true; setTimeout(() => (slorpArmed = false), 6000); }}
            >
              {(forWho ? wallet.drugBase.slorp : wallet.slorpPrice).toLocaleString()}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .sterling {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .sthead {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  /* The barman's line — his 2D patter, behind this counter too. */
  .stsay {
    font: italic 500 14px Georgia, "Times New Roman", serif;
    color: #cfa96a;
    padding: 2px 2px 6px;
  }
  .stmark {
    color: #e8c33c;
    font: 800 13px Georgia, "Times New Roman", serif;
    letter-spacing: 0.14em;
  }
  .stbal {
    background: #00000088;
    border: 1px solid #3a3428;
    color: #cfc6b4;
    border-radius: 999px;
    padding: 6px 13px;
    font: 700 12px system-ui, sans-serif;
  }
  .stbal b { color: #e8c33c; }
  .stnote { color: #9a8f7a; font: 600 12px system-ui, sans-serif; }
  .stfor {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #cfa96a;
    font: 700 12px system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .stfor select {
    background: #00000088;
    color: #f2e6cc;
    border: 1px solid #5a4a30;
    border-radius: 6px;
    padding: 6px 10px;
    font: 600 13px system-ui, sans-serif;
    text-transform: none;
    letter-spacing: 0;
  }
  .stwrap {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }
  /* the menu board — a walnut rail of departments, like the placards on the
     hall's own games */
  .stmenu {
    flex: 0 0 196px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: #00000055;
    border: 1px solid #3a3428;
    border-radius: 12px;
  }
  .stitem {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    text-align: left;
    padding: 7px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 9px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .stitem:hover { background: #1e1810; border-color: #4a3f2c; }
  .stitem.on {
    background: #2a220e;
    border-color: #8a6a2c;
  }
  .stlabel {
    color: #e6dcc2;
    font: 800 12px Georgia, "Times New Roman", serif;
    letter-spacing: 0.04em;
  }
  .stitem.on .stlabel { color: #e8c33c; }
  .stsub { color: #7d735f; font: 600 10px system-ui, sans-serif; }
  .stpane {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: center;
    min-height: 128px;
  }
  .stcard {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    background: #1b1610ee;
    border: 1px solid #4a3f2c;
    border-radius: 12px;
  }
  .stcard.wide { flex-direction: column; align-items: stretch; }
  .stcard.gun { border-color: #6a3030; }
  /* The vial: the one green thing in a walnut-and-brass room. */
  .stcard.slorp {
    border-color: #3f6a34;
    background: linear-gradient(180deg, rgba(24, 44, 20, 0.55), rgba(12, 10, 8, 0.5));
  }
  .stcard.slorp .stname { color: #a8e08a; }
  /* The canister: colder than the vial — steel and mint. */
  .stcard.stardust {
    border-color: #35606a;
    background: linear-gradient(180deg, rgba(18, 40, 44, 0.55), rgba(10, 12, 12, 0.5));
  }
  .stcard.stardust .stname { color: #8ae0d0; }
  /* EGO: violet goop and gold flecks. */
  .stcard.ego {
    border-color: #5a4a7a;
    background: linear-gradient(180deg, rgba(34, 24, 52, 0.55), rgba(12, 10, 12, 0.5));
  }
  .stcard.ego .stname { color: #c2a8f0; }
  .sbtn.danger {
    background: #6d1414;
    border-color: #a33;
    color: #ffe9e9;
  }
  .sbtn.danger:hover:not(:disabled) { background: #8c1a1a; }
  .stwarn {
    color: #d9a05a;
    font-size: 0.78rem;
    white-space: nowrap;
  }
  .strow {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .stcard.drink {
    flex: 1 1 200px;
    justify-content: space-between;
  }
  .stinfo {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .stname {
    color: #f3ead6;
    font: 800 13px Georgia, "Times New Roman", serif;
    letter-spacing: 0.03em;
  }
  .stdesc {
    color: #9a8f7a;
    font: 600 11px system-ui, sans-serif;
    line-height: 1.45;
  }
  .stdesc b { color: #e8c33c; }
  /* A live shield offer — the house noticing, or the floor's own sale. */
  .stoffer {
    align-self: flex-start;
    margin-top: 2px;
    padding: 2px 7px;
    border: 1px solid #4a8f5a;
    border-radius: 999px;
    background: #16301c;
    color: #8fd9a0;
    font: 700 10px system-ui, sans-serif;
    letter-spacing: 0.02em;
  }
  .sbtn s { opacity: 0.55; font-weight: 600; margin-right: 4px; }
  .stbuyrow { display: flex; gap: 8px; align-items: center; }
  .sellgrid {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    max-height: 132px;
    overflow-y: auto;
    padding: 4px;
    background: #00000077;
    border: 1px solid #3a3428;
    border-radius: 10px;
  }
  .sellone {
    position: relative;
    width: 46px;
    height: 46px;
    padding: 3px;
    background: #14100a;
    border: 1px solid #4a3f2c;
    border-radius: 9px;
    cursor: pointer;
  }
  .sellone.on {
    border-color: #e8c33c;
    background: #3a2d12;
  }
  .sellone img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .sellval {
    position: absolute;
    right: 1px;
    bottom: 0;
    color: #e8c33c;
    font: 800 10px system-ui, sans-serif;
    text-shadow: 0 1px 2px #000;
  }
  @media (max-width: 900px) {
    .stwrap { flex-direction: column; }
    .stmenu { flex: none; flex-direction: row; flex-wrap: wrap; }
    .stitem .stsub { display: none; }
  }
</style>
