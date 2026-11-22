<script lang="ts">
  // GOBLIN LENDERS — the kiosk under the casino hub (Josh, Aug 2026;
  // rebuilt Sep 2026: "it seems kind of small").
  //
  // It is the SAME MACHINE as the ATM on the casino floor (LenderStrip.svelte)
  // — verdigris brass, amber phosphor behind glass, engraved plates — laid out
  // as a page rather than a strip, because this is where the goblins' whole
  // business lives now: the windows, your debt, the collectors' clock, YOUR
  // FILE, the marked (settle for a friend), the cells (pleas + bail pots) and
  // the repo shelf. The floor's strip stays the quick counter.
  //
  // The tone is the design: velvet and "of course, sir" on the way IN, teeth
  // the moment you are late. Every number here comes off the wire —
  // src/lender.ts owns the rules; the client proposes nothing, which is also
  // why a refusal just prints whatever the goblins said.
  import { onMount, onDestroy } from "svelte";
  import {
    lender, loadLender, loadLenderHistory, borrow, repay, repayFor, bail, chipIn, buyFromShelf,
    STAGE_NAMES, STAGE_BLURB, STAGE_WHAT, LENDER_ERRORS, EVENT_NAMES, goblinLine,
  } from "../lib/lender.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { vip, loadVip, consolidate, myVipRank } from "../lib/vip.svelte";
  import { session } from "../lib/session.svelte";
  import { takeIdle, primeIdle, dropIdle } from "../lib/npcvoice";
  import { ask } from "../lib/confirm.svelte";
  import Coin from "./Coin.svelte";
  import Avatar from "./Avatar.svelte";
  import goblin from "../assets/lender-goblin.webp";

  /** On the casino floor the same hall mounts inside the station dock (the
   *  ATM's pop-out) — sized to the dock rather than the page. */
  let { floor = false }: { floor?: boolean } = $props();
  // THE HOUSE PAYS (Tier 4): the Room's state knows whether this life has
  // used it; loaded here so the button can decide without a visit to the shop.
  onMount(() => { if (myVipRank() >= 4 && !vip.loaded) void loadVip(); });
  async function doHouse() {
    const r = await consolidate();
    if (r.ok) await loadLender();
  }

  /** HOUSE NOTICES — the plaques on the teller's wall. Static: they are
   *  engraved, and the goblins have never changed their minds about any of
   *  them. Rotates through five per quarter hour so a regular sees them all. */
  // THE WALL IS THE JOKE (Sep 2026). A predatory lender's lobby is not a
  // villain's lair — it is cheerful posters hung beside the notices the law
  // makes them hang, and the staff are lovely until they are not. So the
  // plaques MIX, and they never change with your standing: a real bank does
  // not take down "YOUR BUSINESS IS APPRECIATED" on the day it repossesses
  // your collection. Five of these show at a time, rotating per quarter hour.
  const NOTICES = [
    "YOUR BUSINESS IS APPRECIATED · GOBLIN LENDERS · EST. FOUR SYSTEMS AGO",
    "EVERY APPLICANT CONSIDERED · NO CREDIT CHECK · NO FORMS · NO JUDGEMENT",
    "SILVER IN HAND BEFORE YOU FINISH READING. WE TIMED IT. WE ARE VERY PROUD.",
    "ASK US ANYTHING. WE ANSWER HONESTLY. IT COSTS US NOTHING AND IT SURPRISES EVERYONE.",
    "INTEREST IS DUE AT MIDNIGHT UTC. THE CLOCK IS NOT OURS. THE CONSEQUENCES ARE.",
    "NO REFUNDS. NO PITY. NO EXCEPTIONS. NO, NOT EVEN THEN.",
    "BAIL IS ONE AND A HALF TIMES THE DEBT. THE HALF IS FOR OUR TROUBLE.",
    "REPOSSESSED GOODS ARE SOLD AS SEEN, AT THE POSTED PRICE, TO WHOEVER ASKS FIRST.",
    "CONCESSION No. 3 · PAID FOR IN RAW BULLION · THE FOUNDRY OBJECTED. THE FOUNDRY WAS OUTBID.",
    "CREDIT IS EXTENDED AGAINST WHAT YOU HOLD. PLEASE ASK IF YOU WOULD LIKE THE WORKING.",
    "THE CELLS ARE WARM, DRY AND FORTY-EIGHT HOURS LONG.",
    "A DEBT IS NOT FORGIVEN. IT IS INHERITED. ASK YOUR NEXT LIFE.",
  ];
  // FOUNDRY LENDING (PANDORA.md, "Destroy the Goblins"): once the box has
  // destroyed them the same machine is the house's, and it says so plainly.
  const FOUNDRY_NOTICES = [
    "FOUNDRY LENDING · STRUCK AT THE OLD FOUNDRY MINT",
    "THE GOBLINS ARE GONE. THEIR DEBTS WENT WITH THEM.",
    "INTEREST IS DUE AT MIDNIGHT UTC. THE RATES ARE ON THE CARD.",
    "NO CELLS. NO LETTERS. NO SMALL PRINT.",
    "A MISSED DAY MARKS YOU, THEN GARNISHES, THEN REPOSSESSES. IT STOPS THERE.",
    "CREDIT IS EXTENDED AGAINST WHAT YOU HOLD.",
  ];
  const FOUNDRY_TAPE = "FOUNDRY LENDING · FAIR RATES · NO CELLS · NO LETTERS · INTEREST DUE AT MIDNIGHT · THE GOBLINS ARE GONE · ";
  const foundry = $derived(lender.regime === "foundry");
  const TAPE = "EVERY APPLICANT CONSIDERED · NO CREDIT CHECK · NO FORMS · SILVER TODAY · TERMS ON THE CARD · INTEREST DUE AT MIDNIGHT · NO REFUNDS · NO PITY · THE SHELF HAS BARGAINS · THANK YOU FOR YOUR BUSINESS · ";
  const VAULT_SEED = 5_000_000;

  let confirmTier = $state<number | null>(null);
  let flash = $state<string | null>(null);
  let payAmount = $state<number | null>(null);
  let fileOpen = $state(false);
  // Once you owe, your file is open on the counter — the ledger is the
  // point of the hall's height. Closing it by hand is respected.
  let fileAuto = false;
  $effect(() => {
    if (lender.loan && !fileAuto) {
      fileAuto = true;
      fileOpen = true;
      void loadLenderHistory();
    }
  });
  /** Per-prisoner chip-in drafts and per-debtor gift drafts, keyed by userId. */
  let chips = $state<Record<number, number | null>>({});
  let gifts = $state<Record<number, number | null>>({});
  type Tab = "windows" | "cells" | "shelf";
  let tab = $state<Tab>("windows");

  onMount(() => {
    void loadLender();
  });

  const stage = $derived(lender.loan?.stage ?? 0);
  const fmt = (n: number): string => n.toLocaleString();
  const pct = (r: number): string => `${Math.round(r * 100)}%`;
  /** WHAT TOMORROW COSTS — a missed day capitalises the interest plus a 25%
   *  late fee (display mirror of missPenalty; the server charges). */
  const missCost = (principal: number, rate: number): number => {
    const interest = Math.floor(principal * rate);
    return principal + interest + Math.floor(interest * 0.25);
  };

  // THE COLLECTORS' CLOCK — the visit is keyed to the UTC day, so this is
  // simply the time to the next UTC midnight. Pure dread, purely client-side.
  let now = $state(Date.now());
  const clockTimer = setInterval(() => (now = Date.now()), 1000);
  onDestroy(() => clearInterval(clockTimer));
  const untilVisit = $derived.by(() => {
    const d = new Date(now);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const left = Math.max(0, next - now);
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    const s = Math.floor((left % 60_000) / 1000);
    return { text: `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, soon: h < 1 };
  });
  const hrsLeft = (ms: number): string => {
    const left = Math.max(0, ms - now);
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    return h >= 1 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  };
  const notices = $derived.by(() => {
    const list = foundry ? FOUNDRY_NOTICES : NOTICES;
    const start = Math.floor(now / 900_000) % list.length;
    return Array.from({ length: 5 }, (_, i) => list[(start + i) % list.length]);
  });
  const vaultPct = $derived(Math.max(2, Math.min(100, Math.round((lender.vault / VAULT_SEED) * 100))));
  // THE HOUSE'S BRAINS (lib/npcvoice.ts): the patter is written for this
  // customer by the model, a fresh line every 22 seconds. The scripted line
  // below is the floor. A change in standing (a missed day, a cell, a loan
  // paid) throws the old batch away — THE TURN has to be heard at once.
  let aiLine = $state<string | null>(null);
  const nextLine = () => {
    const l = takeIdle("goblins", "kiosk");
    if (l) aiLine = l;
  };
  onMount(() => {
    void primeIdle("goblins", "kiosk", 5_000).then((l) => (aiLine = l));
    const t = setInterval(nextLine, 22_000);
    return () => clearInterval(t);
  });
  let standing = lender.loan?.stage ?? -1;
  $effect(() => {
    const now2 = lender.loan?.stage ?? -1;
    if (now2 === standing) return;
    standing = now2;
    dropIdle("goblins", "kiosk");
    aiLine = null;
    void primeIdle("goblins", "kiosk", 5_000).then((l) => (aiLine = l));
  });
  const line = $derived(
    foundry ? "The Foundry lends at fair rates now. Borrow what you need, pay it back, and nobody gets locked up." :
    aiLine ??
    goblinLine({
      name: session.user?.displayName ?? "friend",
      purse: lender.purse,
      worth: lender.worth,
      loan: lender.loan,
      hour: new Date(now).getHours(),
      vault: lender.vault,
      prisoners: lender.prisoners.length,
      canBorrow: lender.tiers.length ? lender.tiers.some((t) => t.allowed) : undefined,
    }),
  );

  const toggleFile = (): void => {
    fileOpen = !fileOpen;
    if (fileOpen) void loadLenderHistory();
  };
  const fileDate = (at: number): string =>
    new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const say = (r: { ok: boolean; error?: string }, okText: string): void => {
    flash = r.ok ? okText : LENDER_ERRORS[r.error ?? ""] ?? "REFUSED.";
  };

  const doBorrow = async (amount: number): Promise<void> => {
    if (confirmTier !== amount) {
      confirmTier = amount;
      flash = "Press again and it is yours.";
      return;
    }
    confirmTier = null;
    say(await borrow(amount), `${fmt(amount)} DISPENSED. Spend it well.`);
  };
  const doPay = async (amount: number, service = false): Promise<void> => {
    say(await repay(amount, service), service ? "TONIGHT'S PAID. You're current." : "RECEIVED. Reluctantly.");
    payAmount = null;
  };
  const doGift = async (userId: number, name: string, amount: number): Promise<void> => {
    if (!(await ask({ title: `Pay ${fmt(amount)} against ${name}'s debt?`, body: "It leaves your wallet and goes to the goblins. You get nothing but their gratitude, which is worth nothing." }))) return;
    const r = await repayFor(userId, amount);
    say(r, r.cleared ? `${name} owes nothing now. They will hear about it.` : `RECEIVED on ${name}'s behalf. They will hear about it.`);
    gifts[userId] = null;
  };
  const doBail = async (userId: number, name: string, price: number): Promise<void> => {
    if (!(await ask({ title: `Bail ${name} for ${fmt(price)}?`, body: "It frees the body, not the debt. Anything friends had chipped into the pot goes back to them.", danger: true }))) return;
    say(await bail(userId), `${name} walks. The debt walks with them.`);
  };
  const doChip = async (userId: number, name: string, amount: number): Promise<void> => {
    const r = await chipIn(userId, amount);
    say(r, r.released ? `The pot filled. ${name} walks.` : `${fmt(r.took ?? amount)} into ${name}'s pot.`);
    chips[userId] = null;
  };
  const doBuy = async (id: number, name: string, price: number, yours: boolean): Promise<void> => {
    if (!(await ask({ title: `Buy ${name} for ${fmt(price)}?`, body: yours ? "It was yours. They know that. The price is the price." : "Into your collection; the silver into their vault." }))) return;
    const r = await buyFromShelf(id);
    say(r, r.wasYours ? "Bought back. They enjoyed that." : "SOLD. Enjoy it more than the last owner did.");
  };
  const tierName: Record<string, string> = { common: "COMMON", rare: "RARE", legendary: "LEGENDARY", mythic: "MYTHIC" };
  const potPct = (p: { pot: number; bail: number }): number => (p.bail > 0 ? Math.min(100, Math.round((p.pot / p.bail) * 100)) : 0);
</script>

<div class="bank" class:floor class:foundry class:arrears={stage >= 1} class:dire={stage >= 3}>
  <!-- THE TELLER'S WINDOW: the goblin himself over his gold, the plate, the
       vault, the collectors' clock and the notices engraved on his wall. -->
  <aside class="teller">
    <div class="portrait">
      {#if foundry}
        <div class="crest"><Coin size={150} /></div>
      {:else}
        <img src={goblin} alt="the lender" />
      {/if}
      <div class="plate">
        {#if foundry}
          <span class="brand">Foundry Lending</span>
          <span class="estd">struck at the old foundry mint</span>
          <span class="lease">the goblins are gone · the window is the house's again</span>
        {:else}
          <span class="brand">Goblin Lenders</span>
          <span class="estd">est. elsewhere · collecting here</span>
          <span class="lease">concession no. 3 · granted by THE FOUNDRY · terms honoured in full</span>
        {/if}
      </div>
    </div>
    <p class="patter">“{line}”</p>
    <div class="vaultbox">
      <div class="vrow">
        <span class="tl">THE VAULT</span>
        <span class="tv"><Coin size={16} /> {fmt(lender.vault)}</span>
      </div>
      <div class="vmeter" title="Their own bullion. Every coin lent leaves it; every coin repaid returns."><div class="vfill" style="width: {vaultPct}%"></div></div>
      <span class="books">lent {fmt(lender.books.lent)} · taken {fmt(lender.books.taken)}</span>
      <span class="books">{#if !foundry}{lender.prisoners.length} in the cells · {/if}{lender.marked.length} marked · {lender.shelf.length} on the shelf</span>
    </div>
    <div class="clock" class:soon={untilVisit.soon}>
      <span class="tl">{foundry ? "INTEREST IS DUE IN" : "THE COLLECTORS VISIT IN"}</span>
      <b>{untilVisit.text}</b>
    </div>
    <div class="notices">
      <span class="tl">HOUSE NOTICES</span>
      <ul>
        {#each notices as n (n)}<li>{n}</li>{/each}
      </ul>
    </div>
  </aside>

  <!-- THE SCREEN. -->
  <section class="glass">
    <div class="scan" aria-hidden="true"></div>

    <nav class="tabs">
      <button class="tab" class:on={tab === "windows"} onclick={() => (tab = "windows")}>
        {lender.loan ? "YOUR ACCOUNT" : "THE WINDOWS"}
      </button>
      <button class="tab" class:on={tab === "cells"} onclick={() => (tab = "cells")}>
        {foundry ? "THE MARKED" : "THE CELLS"}{#if lender.prisoners.length}<span class="pip red">{lender.prisoners.length}</span>{/if}
        {#if lender.marked.length}<span class="pip">{lender.marked.length} marked</span>{/if}
      </button>
      <button class="tab" class:on={tab === "shelf"} onclick={() => (tab = "shelf")}>
        THE SHELF{#if lender.shelf.length}<span class="pip">{lender.shelf.length}</span>{/if}
      </button>
    </nav>

    {#if flash}<div class="ticker"><span class="say">{flash}</span></div>{/if}

    {#if tab === "windows"}
      {#if lender.loan}
        {@const loan = lender.loan}
        <!-- THE ARREARS PANEL. All the red in the feature lives here. -->
        <div class="readout">
          <span class="rk">BALANCE OUTSTANDING</span><span class="rv big">{fmt(loan.payoff)}</span>
          <span class="rk">DUE TONIGHT</span><span class="rv">{fmt(loan.interest)}</span>
          <span class="rk">RATE</span><span class="rv">{pct(loan.rate)}/DAY</span>
          <span class="rk">STANDING</span><span class="rv stage s{stage}">{STAGE_NAMES[stage].toUpperCase()}</span>
        </div>
        <div class="visit" class:soon={untilVisit.soon}>
          {foundry ? "INTEREST IS DUE IN" : "THE COLLECTORS VISIT IN"} <b>{untilVisit.text}</b>
          <span class="tomorrow">· unpaid, tomorrow you owe <b>{fmt(missCost(loan.principal, loan.rate))}</b></span>
        </div>
        <p class="blurb">{STAGE_BLURB[stage]}</p>
        <!-- THE LADDER, drawn as a gauge. Seeing the next rung is the pressure. -->
        <ol class="ladder">
          {#each STAGE_NAMES.slice(1, foundry ? 4 : undefined) as name, i}
            <li class:on={stage >= i + 1} class:next={stage === i} title={STAGE_WHAT[i + 1]}>
              <span class="rung">{i + 1}</span>{name}
            </li>
          {/each}
        </ol>
        <div class="acts">
          <button class="key" disabled={lender.busy || wallet.coins < loan.interest} onclick={() => doPay(loan.interest, true)}>
            <span class="kt">SERVICE</span><span class="kn">{fmt(loan.interest)}</span>
          </button>
          <button class="key settle" disabled={lender.busy || wallet.coins < (loan.settle ?? loan.payoff)} onclick={() => doPay(loan.settle ?? loan.payoff)}>
            <span class="kt">SETTLE</span><span class="kn">{fmt(loan.settle ?? loan.payoff)}</span>
          </button>
          {#if myVipRank() >= 4 && vip.perks && !vip.perks.consolidation.used && stage >= 1}
            <!-- THE HOUSE PAYS (Tier 4, once a life) — Sterling's concession
                 terms outrank the goblins', and he enjoys saying so. -->
            <button class="key house" disabled={lender.busy || vip.busy} onclick={() => void doHouse()}>
              <span class="kt">THE HOUSE SETTLES IT</span><span class="kn sm">once a life</span>
            </button>
          {/if}
          <div class="paybox">
            <span class="kt">PAY WHAT YOU CAN</span>
            <div class="payrow">
              <input class="paynum" type="number" min="1" max={loan.settle ?? loan.payoff} placeholder="0" bind:value={payAmount} />
              <button class="key slim"
                disabled={lender.busy || !payAmount || payAmount < 1 || wallet.coins < Math.min(payAmount, loan.settle ?? loan.payoff)}
                onclick={() => { if (payAmount) void doPay(Math.min(Math.floor(payAmount), loan.settle ?? loan.payoff)); }}>
                <span class="kn">PAY</span>
              </button>
            </div>
          </div>
        </div>
      {:else}
        <div class="about">
          <span class="ab-line">Goblin moneylenders from a distant world, tolerated on this floor — not welcomed.</span>
          <span class="ab-line">They lend real silver from their own vault. Interest is due daily; miss a day and the collectors visit — marked, garnished, repossessed, frozen, then <b>jailed</b>.</span>
          <span class="ab-line dim">Credit scales with what they could seize from you: <b>{fmt(lender.purse + lender.worth)}</b> by their reckoning{#if lender.tiers.length && !lender.tiers.some((t) => t.allowed)}, which isn't enough for their smallest window yet{:else}, so up to <b>{fmt((lender.purse + lender.worth) * 3)}</b>{/if}.</span>
        </div>
        <div class="offer">SUMS AVAILABLE TO A PERSON OF YOUR MEANS</div>
        {#if lender.offer}
          <!-- THE LETTER's offer, standing: the goblins wrote, and the windows
               below already wear the introductory rate. -->
          <div class="letter">
            <span class="lt">✉ INTRODUCTORY RATE ON FILE</span>
            <span class="lb">{Math.round(lender.offer.off * 100)} points off every window until {new Date(lender.offer.until).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}. Miss a day and it reverts, plus the usual point.</span>
          </div>
        {/if}
        <div class="keys">
          {#each lender.tiers as t (t.amount)}
            <button class="key window" class:armed={confirmTier === t.amount} class:teaser={t.rate < t.base}
              disabled={lender.busy || !t.allowed || !t.affordable} onclick={() => doBorrow(t.amount)}>
              <span class="kn big"><Coin size={16} /> {fmt(t.amount)}</span>
              <span class="kt">{#if t.rate < t.base}<s>{pct(t.base)}</s> {/if}{pct(t.rate)} / DAY · {fmt(Math.floor(t.amount * t.rate))} TO STAY AFLOAT</span>
              <span class="kt dim">MISS A DAY: {fmt(missCost(t.amount, t.rate))}</span>
              {#if !t.allowed}<span class="kx">BEYOND YOUR WORTH</span>
              {:else if !t.affordable}<span class="kx">VAULT SHORT</span>
              {:else if confirmTier === t.amount}<span class="ky">PRESS AGAIN TO SIGN</span>{/if}
            </button>
          {/each}
        </div>
        <p class="smallprint">
          Miss a day and the interest joins the principal, a late fee lands, and the rate goes up a point.
          Miss five and you are our guest. Somebody may pay for your release; they will pay more than you owe.
        </p>
      {/if}

      <!-- YOUR FILE — the goblins keep meticulous records, and show you yours gladly. -->
      <button class="filetab" onclick={toggleFile}>{fileOpen ? "▾" : "▸"} YOUR FILE</button>
      {#if fileOpen}
        <div class="file">
          {#each lender.history as ev, i (i)}
            <div class="fentry">
              <span class="fdate">{fileDate(ev.at)}</span>
              <span class="fkind">{EVENT_NAMES[ev.kind] ?? ev.kind.toUpperCase()}</span>
              <span class="famt">{ev.amount > 0 ? fmt(ev.amount) : ""}</span>
            </div>
          {:else}
            <div class="fentry"><span class="fkind">NO RECORD. THAT CAN CHANGE.</span></div>
          {/each}
        </div>
      {/if}

    {:else if tab === "cells"}
      <!-- THE MARKED: settle for a friend, before the cell. -->
      <div class="section">
        <div class="offer">THE MARKED · settle for a friend</div>
        {#if lender.marked.length === 0}
          <p class="empty">Nobody is behind. The goblins are sulking.</p>
        {:else}
          <p class="sub">Their debt, your wallet. No fee. They will hear who did it.</p>
          {#each lender.marked as m (m.userId)}
            {@const name = m.user?.displayName ?? "someone"}
            <div class="row">
              <Avatar name={name} id={m.userId} avatar={m.user?.avatar ?? null} size={32} profile />
              <div class="who">
                <span class="wname">{name} <span class="stagechip s{m.stage}">{STAGE_NAMES[m.stage].toUpperCase()}</span></span>
                <span class="wsub">owes {fmt(m.payoff)} · {fmt(m.interest)} due tonight</span>
              </div>
              <div class="rowacts">
                {#if m.userId !== session.user?.id}
                  <button class="key slim" disabled={lender.busy || wallet.coins < m.interest}
                    onclick={() => doGift(m.userId, name, m.interest)}>
                    <span class="kt">TONIGHT'S</span><span class="kn sm">{fmt(m.interest)}</span>
                  </button>
                  <button class="key slim settle" disabled={lender.busy || wallet.coins < (m.settle ?? m.payoff)}
                    onclick={() => doGift(m.userId, name, m.settle ?? m.payoff)}>
                    <span class="kt">CLEAR IT</span><span class="kn sm">{fmt(m.settle ?? m.payoff)}</span>
                  </button>
                  <span class="payrow">
                    <input class="paynum sm" type="number" min="1" placeholder="any" bind:value={gifts[m.userId]} />
                    <button class="key slim" disabled={lender.busy || !gifts[m.userId] || (gifts[m.userId] ?? 0) < 1}
                      onclick={() => doGift(m.userId, name, Math.floor(gifts[m.userId] ?? 0))}><span class="kn sm">PAY</span></button>
                  </span>
                {:else}
                  <span class="you">that's you</span>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- THE CELLS: held against their debts. Anyone may settle for them.
           Foundry Lending has no cells. -->
      {#if !foundry}
      <div class="section">
        <div class="offer red">THE CELLS · held against their debts</div>
        {#if lender.prisoners.length === 0}
          <p class="empty">Empty. For now.</p>
        {:else}
          {#each lender.prisoners as p (p.userId)}
            {@const name = p.user?.displayName ?? "someone"}
            <div class="cell">
              <div class="row">
                <Avatar name={name} id={p.userId} avatar={p.user?.avatar ?? null} size={36} profile />
                <div class="who">
                  <span class="wname">{name}</span>
                  <span class="wsub">owes {fmt(p.debt)} · bail {fmt(p.bail)} · seals in <b class:urgent={p.jailSealsAt - now < 6 * 3_600_000}>{hrsLeft(p.jailSealsAt)}</b></span>
                  {#if p.plea}<span class="plea">“{p.plea}”</span>{/if}
                </div>
                <button class="key slim settle" disabled={lender.busy || wallet.coins < p.bail || p.userId === session.user?.id}
                  onclick={() => doBail(p.userId, name, p.bail)}>
                  <span class="kt">BAIL</span><span class="kn sm">{fmt(p.bail)}</span>
                </button>
              </div>
              <div class="pot">
                <div class="pot-row">
                  <span class="kt">THE BAIL POT</span>
                  <span class="pot-num">{fmt(p.pot)} <span class="of">of {fmt(p.bail)}</span></span>
                </div>
                <div class="pot-bar"><div class="pot-fill" style="width: {potPct(p)}%"></div></div>
                <div class="pot-foot">
                  <span class="pot-who">
                    {#each p.contributors as c (c.userId)}
                      <span class="chipname">{c.user?.displayName ?? "someone"} · {fmt(c.amount)}</span>
                    {:else}
                      <span class="dim">nobody has chipped in yet</span>
                    {/each}
                  </span>
                  {#if p.userId !== session.user?.id}
                    <span class="payrow">
                      <input class="paynum sm" type="number" min="1" placeholder="chip in" bind:value={chips[p.userId]} />
                      <button class="key slim" disabled={lender.busy || !chips[p.userId] || (chips[p.userId] ?? 0) < 1 || wallet.coins < (chips[p.userId] ?? 0)}
                        onclick={() => doChip(p.userId, name, Math.floor(chips[p.userId] ?? 0))}><span class="kn sm">CHIP IN</span></button>
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
      {/if}

    {:else}
      <!-- THE REPO SHELF: what they took, for sale. Silver into the vault. -->
      <div class="section">
        <div class="offer">THE SHELF · repossessed goods, priced to move</div>
        {#if lender.shelf.length === 0}
          <p class="empty">Bare. Somebody will be late eventually.</p>
        {:else}
          <p class="sub">Five times what Sterling pays. The silver goes into the vault. The previous owner is welcome to buy it back.</p>
          <div class="goods">
            {#each lender.shelf as s (s.id)}
              {@const yours = s.fromUserId === session.user?.id}
              <button class="good" class:yours disabled={lender.busy || wallet.coins < s.price}
                onclick={() => doBuy(s.id, s.name, s.price, yours)} title={s.name}>
                <img src={`/emoji/${s.file}`} alt={s.name} loading="lazy" />
                <span class="gname">{s.name}</span>
                <span class="gtier t-{s.tier}">{tierName[s.tier] ?? s.tier}</span>
                <span class="gfrom">{yours ? "taken from YOU" : `taken from ${s.from?.displayName ?? "someone"}`}</span>
                <span class="gprice"><Coin size={12} /> {fmt(s.price)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="ticker foot">
      <span class="say">{lender.loan ? "Terms are not negotiable. Neither are we." : "No credit check. We know exactly what you have."}</span>
    </div>
  </section>

  <!-- THE TAPE: the goblins' terms, going round forever along the foot. -->
  <div class="tape" aria-hidden="true"><span>{foundry ? FOUNDRY_TAPE + FOUNDRY_TAPE : TAPE + TAPE}</span></div>
</div>

<style>
  /* THE BANK HALL (Josh, Sep 2026: "take up the page … real space-greedy-
     goblin character"). Verdigris brass and amber phosphor as before — the
     floor ATM's materials — but laid out as the whole room: the goblin
     himself over his gold on the left, the working screen filling the rest,
     his terms going round on a tape along the foot, and behind it all the
     sky he came from. Interstellar goblins: the backdrop is deep space with
     a sickly green nebula, seen through a bank that was shipped here. */
  .bank {
    --brass: #6e6a3a;
    --brass-dk: #2b2a18;
    --amber: #ffcf6a;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(300px, 36%) 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0 14px;
    padding: 12px 14px 0;
    color: #e8e2d2;
    overflow: hidden;
    background:
      radial-gradient(1px 1px at 12px 18px, #ffffffaa 50%, transparent 51%) 0 0 / 190px 160px,
      radial-gradient(1px 1px at 90px 110px, #ffffff88 50%, transparent 51%) 0 0 / 230px 210px,
      radial-gradient(1.5px 1.5px at 160px 40px, #dfffe0aa 50%, transparent 51%) 0 0 / 310px 260px,
      radial-gradient(1px 1px at 60px 140px, #ffffff66 50%, transparent 51%) 0 0 / 140px 120px,
      radial-gradient(70% 55% at 18% 8%, rgba(64, 150, 96, 0.28), transparent 60%),
      radial-gradient(60% 50% at 88% 92%, rgba(150, 110, 30, 0.22), transparent 60%),
      linear-gradient(180deg, #060a08 0%, #04070a 55%, #070604 100%);
  }
  /* FOUNDRY LENDING: the same machine in the house's polished brass. */
  .bank.foundry {
    --brass: #b8893a;
    --brass-dk: #4a3514;
    background:
      radial-gradient(70% 55% at 18% 8%, rgba(217, 160, 70, 0.22), transparent 60%),
      radial-gradient(60% 50% at 88% 92%, rgba(150, 110, 30, 0.22), transparent 60%),
      linear-gradient(180deg, #0d0904 0%, #0a0805 55%, #0c0905 100%);
  }
  .crest { display: grid; place-items: center; padding: 40px 0 24px; }
  .bank.floor {
    height: min(84vh, 940px);
    border: 2px solid var(--brass);
    border-radius: 12px;
    box-shadow: 0 0 0 1px var(--brass-dk), 0 14px 40px #000c;
  }

  /* ---- the teller's window ---- */
  .teller {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
    padding: 44px 0 12px;
  }
  .bank.floor .teller { padding-top: 12px; }
  .portrait {
    position: relative;
    flex: none;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid var(--brass);
    box-shadow: 0 0 0 1px var(--brass-dk), inset 0 0 0 1px #8a844a44;
    background: #0b0903;
  }
  .portrait img {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    object-position: 50% 32%;
    filter: contrast(1.12) saturate(0.9) sepia(0.12);
  }
  /* The gold glints. One slow sheen across the coins, compositor-cheap. */
  .portrait::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 40%, rgba(255, 230, 150, 0.16) 50%, transparent 60%);
    transform: translateX(-100%);
    animation: glint 9s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes glint { 0%, 70% { transform: translateX(-100%); } 85% { transform: translateX(100%); } 100% { transform: translateX(100%); } }
  .plate {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    padding: 26px 14px 10px;
    background: linear-gradient(180deg, transparent, rgba(6, 6, 3, 0.86) 45%, rgba(6, 6, 3, 0.96));
  }
  .brand { font: 700 clamp(20px, 2.2vw, 28px) ui-serif, Georgia, serif; letter-spacing: 0.04em; color: #f0e6bd; text-shadow: 0 1px 0 #201f12, 0 0 18px #00000088; }
  .estd { font: italic 500 13px ui-serif, Georgia, serif; letter-spacing: 0.1em; color: #b3ac7a; }
  .lease { font: 500 10.5px system-ui, sans-serif; letter-spacing: 0.12em; color: #8f8a5a; margin-top: 3px; }
  .teller .patter { margin: 0; padding: 0 4px; font: italic 500 16.5px/1.45 ui-serif, Georgia, serif; color: #e8dbb9; }

  .vaultbox, .clock, .notices {
    flex: none;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--brass);
    background: linear-gradient(180deg, #3a3520 0%, #1c1a0f 100%);
    box-shadow: inset 0 1px 0 #8a844a44, 0 1px 0 #000;
  }
  .tl { display: block; font: 700 11px system-ui, sans-serif; letter-spacing: 0.22em; color: #a9a273; }
  .vrow { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .tv { display: inline-flex; align-items: center; gap: 6px; font: 800 22px ui-monospace, monospace; color: #f0e6bd; }
  .vmeter { height: 8px; margin: 7px 0 6px; border-radius: 4px; background: #060504; border: 1px solid #3a3020; overflow: hidden; }
  .vfill { height: 100%; background: linear-gradient(90deg, #8a6a1c, #ffd86a); box-shadow: 0 0 10px #ffd86a66; transition: width 0.5s ease; }
  .books { display: block; font: 500 11.5px ui-monospace, monospace; color: #a9a273; }
  .clock b { display: block; margin-top: 2px; font: 800 26px ui-monospace, monospace; letter-spacing: 0.06em; color: var(--amber); }
  .clock.soon { border-color: #a3503a; }
  .clock.soon b { color: #ff6a4a; animation: throb 1s ease-in-out infinite; }
  @keyframes throb { 50% { opacity: 0.55; } }
  /* The notices take whatever height the column has left and scroll
     inside themselves — the portrait, the vault and the clock never move. */
  .notices { flex: 1 1 auto; min-height: 96px; display: flex; flex-direction: column; }
  .notices ul { margin: 6px 0 0; padding: 0 2px 0 0; list-style: none; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
  .notices li {
    padding: 6px 8px;
    border-left: 2px solid #8a844a;
    background: rgba(0, 0, 0, 0.28);
    font: 700 10.5px/1.45 system-ui, sans-serif;
    letter-spacing: 0.08em;
    color: #d9b878;
  }

  /* ---- the tape ---- */
  .tape {
    grid-column: 1 / -1;
    margin: 10px -14px 0;
    padding: 5px 0;
    overflow: hidden;
    white-space: nowrap;
    border-top: 1px solid var(--brass);
    background: #0b0903;
    font: 800 11px ui-monospace, monospace;
    letter-spacing: 0.22em;
    color: #c98a2f;
  }
  .tape span { display: inline-block; animation: tape 48s linear infinite; }
  @keyframes tape { to { transform: translateX(-50%); } }
  .bank.floor .tape { margin: 8px 0 0; border-radius: 0 0 10px 10px; }

  /* ---- the screen ---- */
  .glass {
    position: relative;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    margin-top: 44px;
    padding: 16px 20px 14px;
    border: 2px solid #6e6a3a;
    border-radius: 12px;
    background: radial-gradient(120% 100% at 50% 0%, #1a1405 0%, #0b0903 70%);
    color: #ffb43c;
    isolation: isolate;
    box-shadow: 0 0 0 1px #2b2a18, 0 10px 30px #000a;
  }
  .scan {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* LEGIBILITY (Josh, Sep 2026: "the font on the lenders page is kind of
       hard to read"). The phosphor scanlines used to darken every third
       pixel row by 28% — over small amber type that is a screen door. They
       are texture now, not a filter: 8%. */
    background: repeating-linear-gradient(180deg, rgba(0, 0, 0, 0) 0 2px, rgba(0, 0, 0, 0.08) 2px 3px);
    mix-blend-mode: multiply;
    border-radius: 12px;
  }
  .bank.floor .glass { margin-top: 12px; }
  .bank.arrears .glass { color: #ff9a3c; background: radial-gradient(120% 100% at 50% 0%, #200e04 0%, #0b0402 70%); }
  .bank.dire .glass { color: #ff6a4a; box-shadow: 0 0 0 1px #2b2a18, inset 0 0 28px #a3200055, 0 10px 30px #000a; }
  .bank.dire .portrait { border-color: #a3503a; }
  /* Body text is warm CREAM on the dark glass; amber is kept for the
     numbers and the keys, where it is large. Dim amber body copy at 12-13px
     was the unreadable part. */

  .tabs { display: flex; gap: 6px; margin-bottom: 12px; border-bottom: 1px solid #3a3018; }
  .tab {
    padding: 8px 14px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font: 700 13px system-ui, sans-serif;
    letter-spacing: 0.18em;
    color: #b08a3c;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .tab:hover { color: #ffcf6a; }
  .tab.on { color: #ffcf6a; border-bottom-color: #ffcf6a; }
  .pip {
    padding: 0 6px;
    border-radius: 999px;
    font-size: 10px;
    letter-spacing: 0.06em;
    background: #3a3018;
    color: #d9b878;
  }
  .pip.red { background: #4a1a12; color: #ff9a8a; }

  .offer { font: 700 14px system-ui, sans-serif; letter-spacing: 0.16em; color: #dfa64a; margin: 4px 0 10px; }
  .offer.red { color: #ef8068; }
  /* THE LETTER on file — a slip of the goblins' paper pinned over the windows. */
  .letter {
    display: flex; flex-direction: column; gap: 3px;
    margin: 0 0 12px; padding: 10px 14px;
    border: 1px dashed #dfa64a; border-radius: 4px;
    background: linear-gradient(180deg, rgba(223, 166, 74, 0.14), rgba(223, 166, 74, 0.05));
  }
  .letter .lt { font: 700 13px system-ui, sans-serif; letter-spacing: 0.16em; color: #ffd27a; }
  .letter .lb { font: 500 14px/1.4 ui-serif, Georgia, serif; color: #e8dbb9; }
  .key.window.teaser { border-color: #ffd27a; box-shadow: inset 0 0 0 1px rgba(255, 210, 122, 0.35); }
  .key.window .kt s { color: #a08a68; text-decoration-color: #ef8068; margin-right: 0.45em; }
  .sub { margin: -4px 0 10px; font: italic 500 14.5px/1.4 ui-serif, Georgia, serif; color: #cdbb95; }
  .empty { margin: 0 0 12px; font: italic 500 15px ui-serif, Georgia, serif; color: #b3a57f; }
  .section { margin-bottom: 18px; }

  .about {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px solid #3a3018;
    border-radius: 6px;
    background: rgba(58, 48, 24, 0.18);
  }
  .ab-line { font: 500 16.5px ui-serif, Georgia, serif; line-height: 1.5; color: #e8dbb9; }
  .ab-line b { color: #ffab55; }
  .ab-line.dim { font-style: italic; font-size: 14.5px; color: #c4b18a; }

  /* Engraved brass keys, not web buttons. */
  .keys { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
  .key {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 12px 16px;
    border-radius: 6px;
    background: linear-gradient(180deg, #3a3520 0%, #221f12 100%);
    border: 1px solid #6e6a3a;
    box-shadow: inset 0 1px 0 #8a844a55, 0 1px 0 #000;
    color: #ffcf6a;
    cursor: pointer;
    font-family: ui-monospace, monospace;
    text-align: left;
  }
  .key.window { padding: 14px 18px; }
  .key:hover:not(:disabled) { border-color: #d9b44a; color: #ffe9a8; }
  .key:active:not(:disabled) { box-shadow: inset 0 2px 4px #000a; transform: translateY(1px); }
  .key:disabled { opacity: 0.38; cursor: not-allowed; }
  .key.armed { border-color: #ffcf6a; background: linear-gradient(180deg, #55491f, #2c2612); }
  .key.house { border-color: #7fe6ec; color: #7fe6ec; }
  .key.settle { border-color: #4a7a3a; color: #b9e88a; }
  .key.slim { min-width: 0; padding: 7px 12px; }
  .kn { font: 800 22px ui-monospace, monospace; display: inline-flex; align-items: center; gap: 6px; }
  .kn.big { font-size: 28px; }
  .kn.sm { font-size: 15px; }
  .kt { font: 700 13px system-ui, sans-serif; letter-spacing: 0.1em; color: #d3ab5e; }
  .kt.dim { color: #b39a62; font-size: 12.5px; }
  .kx { font: 700 13px system-ui, sans-serif; letter-spacing: 0.08em; color: #d47a66; }
  .ky { font: 700 13px system-ui, sans-serif; letter-spacing: 0.08em; color: #ffcf6a; }
  .smallprint { margin: 12px 0 0; font: 500 13.5px/1.55 system-ui, sans-serif; color: #ab9d7c; }

  /* ---- arrears: where the teeth are ---- */
  .readout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: baseline;
    gap: 6px 16px;
    margin-bottom: 8px;
  }
  .rk { font: 700 13px system-ui, sans-serif; letter-spacing: 0.1em; color: #d3ab5e; }
  .rv { font: 800 22px ui-monospace, monospace; }
  .rv.big { font-size: 32px; }
  .stage.s0 { color: #8fd06a; }
  .stage.s1 { color: #ffcf6a; }
  .stage.s2, .stage.s3 { color: #ff9a3c; }
  .stage.s4, .stage.s5 { color: #ff5a4a; }
  .visit { font: 700 14px ui-monospace, monospace; letter-spacing: 0.1em; color: #d9a35f; margin: 0 0 8px; }
  .visit b { font-size: 17px; color: #ffcf6a; }
  .visit.soon { color: #ff9a3c; }
  .visit.soon b { color: #ff6a4a; }
  .visit .tomorrow { margin-left: 8px; font-size: 12px; letter-spacing: 0.06em; color: #a9946a; }
  .visit .tomorrow b { font-size: 13px; color: #ff9a3c; }
  .blurb { margin: 0 0 10px; font: italic 500 15.5px/1.4 ui-serif, Georgia, serif; color: #dccca8; }
  .ladder { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; padding: 0; list-style: none; }
  .ladder li {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 11px 5px 6px;
    border-radius: 999px;
    font: 700 12px system-ui, sans-serif;
    letter-spacing: 0.08em;
    background: #17150f;
    border: 1px solid #3a352a;
    color: #8e8570;
    cursor: help;
  }
  .rung {
    width: 18px;
    height: 18px;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: #2a2417;
    font-size: 10px;
    color: #8a7a4a;
  }
  .ladder li.on { background: #3a1a12; border-color: #a3503a; color: #e5a183; }
  .ladder li.on .rung { background: #a3503a; color: #fff; }
  .ladder li.next { border-color: #ffcf6a; color: #ffcf6a; box-shadow: 0 0 10px #ffcf6a33; }
  .ladder li.next .rung { background: #55491f; color: #ffcf6a; }
  .acts { display: flex; gap: 10px; flex-wrap: wrap; align-items: stretch; }
  .paybox { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
  .payrow { display: inline-flex; gap: 6px; align-items: center; }
  .paynum {
    width: 130px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #6e6a3a;
    background: #14100a;
    color: #ffcf6a;
    font: 800 18px ui-monospace, monospace;
    text-align: right;
  }
  .paynum.sm { width: 96px; padding: 6px 8px; font-size: 14px; }

  /* ---- the marked + the cells ---- */
  .row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 9px 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid #3a3018;
    margin-bottom: 7px;
    flex-wrap: wrap;
  }
  .who { display: flex; flex-direction: column; gap: 2px; min-width: 160px; flex: 1; }
  .wname { font: 700 16px ui-serif, Georgia, serif; color: #f0e6bd; display: inline-flex; gap: 8px; align-items: center; }
  .wsub { font: 600 13.5px ui-monospace, monospace; color: #c4b18a; }
  .wsub b { color: #d9b878; }
  .wsub b.urgent { color: #ff6a4a; }
  .plea { font: italic 500 14.5px ui-serif, Georgia, serif; color: #e8dbb9; margin-top: 2px; }
  .stagechip { padding: 1px 7px; border-radius: 4px; font: 800 10px system-ui, sans-serif; letter-spacing: 0.1em; border: 1px solid; }
  .stagechip.s1 { color: #ffcf6a; border-color: #ffcf6a55; }
  .stagechip.s2, .stagechip.s3 { color: #ff9a3c; border-color: #ff9a3c55; }
  .stagechip.s4 { color: #ff5a4a; border-color: #ff5a4a55; }
  .rowacts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-left: auto; }
  .you { font: italic 500 12px ui-serif, Georgia, serif; color: #8f8a5a; }
  .cell { margin-bottom: 10px; }
  .cell .row { margin-bottom: 0; border-radius: 8px 8px 0 0; }
  .pot {
    padding: 8px 12px 10px;
    border: 1px solid #3a3018;
    border-top: none;
    border-radius: 0 0 8px 8px;
    background: rgba(0, 0, 0, 0.35);
  }
  .pot-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .pot-num { font: 800 15px ui-monospace, monospace; color: #b9e88a; }
  .pot-num .of { font-size: 11px; font-weight: 600; color: #8a7a4a; }
  .pot-bar { height: 7px; border-radius: 4px; background: #060504; border: 1px solid #3a3020; margin: 6px 0; overflow: hidden; }
  .pot-fill { height: 100%; background: linear-gradient(90deg, #4a7a3a, #b9e88a); transition: width 0.4s ease; }
  .pot-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .pot-who { display: flex; flex-wrap: wrap; gap: 5px; font: 600 12.5px ui-monospace, monospace; color: #c4b18a; }
  .chipname { padding: 1px 7px; border-radius: 999px; background: #1a1610; border: 1px solid #3a3018; }
  .dim { color: #6f6754; font-style: italic; }

  /* ---- the shelf ---- */
  .goods { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
  .good {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 10px 8px 9px;
    border-radius: 8px;
    background: linear-gradient(180deg, #2a2617 0%, #161309 100%);
    border: 1px solid #6e6a3a;
    color: #e8e2d2;
    cursor: pointer;
    font: inherit;
  }
  .good:hover:not(:disabled) { border-color: #d9b44a; transform: translateY(-1px); }
  .good:disabled { opacity: 0.45; cursor: not-allowed; }
  .good.yours { border-color: #a3503a; box-shadow: 0 0 12px #a3503a33; }
  .good img { width: 56px; height: 56px; object-fit: contain; image-rendering: auto; }
  .gname { font: 700 13px ui-serif, Georgia, serif; color: #f0e6bd; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gtier { font: 800 10.5px system-ui, sans-serif; letter-spacing: 0.12em; color: #b39a62; }
  .gtier.t-rare { color: #7fb0ff; }
  .gtier.t-legendary { color: #ffcf6a; }
  .gtier.t-mythic { color: #ff5db1; }
  .gfrom { font: italic 500 11.5px ui-serif, Georgia, serif; color: #c8836e; text-align: center; }
  .good.yours .gfrom { color: #ff9a8a; font-weight: 700; }
  .gprice { display: inline-flex; align-items: center; gap: 4px; font: 800 15px ui-monospace, monospace; color: #ffcf6a; margin-top: 2px; }

  /* YOUR FILE */
  .filetab {
    margin-top: 12px;
    background: none;
    border: none;
    padding: 0;
    font: 700 12px system-ui, sans-serif;
    letter-spacing: 0.2em;
    color: #b08a3c;
    cursor: pointer;
  }
  .filetab:hover { color: #ffcf6a; }
  .file {
    margin-top: 8px;
    max-height: min(44vh, 420px);
    overflow-y: auto;
    border: 1px solid #3a3018;
    border-radius: 6px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.25);
  }
  .fentry { display: grid; grid-template-columns: 64px 1fr auto; gap: 10px; padding: 4px 0; font: 600 14px ui-monospace, monospace; border-bottom: 1px dotted #3a301866; }
  .fentry:last-child { border-bottom: none; }
  .fdate { color: #ab9d7c; }
  .fkind { color: #e8dbb9; letter-spacing: 0.04em; }
  .famt { color: #ffcf6a; }

  /* The machine talks. Engraved, and never apologetic. */
  .ticker { margin: 0 0 12px; padding: 8px 12px; border: 1px solid #3a3018; border-radius: 6px; background: rgba(58, 48, 24, 0.18); }
  .ticker.foot { margin: 12px 0 0; padding: 9px 0 0; border: none; border-top: 1px solid #3a3018; border-radius: 0; background: none; }
  .say { font: italic 500 16.5px ui-serif, Georgia, serif; letter-spacing: 0.03em; color: #e0bd76; }

  @media (max-width: 640px) {
    .fascia { grid-template-columns: auto 1fr; }
    .till { grid-column: 1 / -1; text-align: left; }
    .readout { grid-template-columns: auto auto auto auto; }
    .rowacts { margin-left: 0; width: 100%; }
    .tabs { flex-wrap: wrap; }
  }
  @media (max-width: 900px) {
    /* EVERY ROW IS CONTENT-SIZED ONCE THE HALL IS STACKED — `auto`, never
       `minmax(0, 1fr)`.
       In the two-column room the working screen is a 1fr column that scrolls
       inside itself, which is right: the teller stands beside it. Stacked,
       that same `1fr` makes the screen a LEFTOVER — it gets the container
       height minus whatever the teller column happens to need. The teller is
       `auto` and unbounded, so when it grew (the notices stopped being their
       own scroller, 96px -> 278px) the screen's row collapsed to 52px, and
       because a stacked `.glass` is `overflow: visible` its entire contents —
       the counters, the explanation, the loan windows — spilled out of that
       52px box and painted straight over the notices above and the tape
       below. That is the overlapping mess Josh photographed.
       `.bank` keeps height:100% and its own overflow, so it is still the
       scroll pane; the rows simply take the height they need. */
    .bank { grid-template-columns: 1fr; grid-template-rows: auto auto auto; overflow-y: auto; }
    /* AND `min-height: auto`, which is the other half of the same bug. Both
       columns carry `min-height: 0` so that, side by side, each can scroll
       inside itself. Stacked, that same 0 lets an `auto` ROW shrink BELOW its
       content — the grid then fits all three rows into the container's 810px
       instead of overflowing it, and since a stacked column is
       `overflow: visible`, the content spills out and paints over whatever is
       next. Restoring the automatic minimum makes each row at least as tall
       as what is in it, so the hall grows and `.bank` scrolls, which is what
       a stacked layout should do. */
    .teller,
    .glass { min-height: auto; }
    /* The tape needs a NUMBER rather than `auto`: it is `overflow: hidden` (a
       marquee has to clip), which makes its automatic minimum zero whatever
       else we say, so its row collapsed to the 10px of its own padding and
       the moving text vanished. 24px is the 11px line plus that padding. */
    .tape { min-height: 24px; }
    .teller { overflow: visible; padding-top: 44px; }
    .portrait img { aspect-ratio: 16 / 7; }
    .glass { margin-top: 0; overflow: visible; }

    /* THE NOTICES STOP BEING THEIR OWN SCROLLER once the hall is stacked
       (Josh, Sep 2026: the lenders page "looks bad", and separately that
       scrolling sometimes "drags the browser window"). In the two-column
       room the plaques are a fixed-height panel you scroll inside; stacked,
       that panel sits in the middle of a page that ALSO scrolls, so a swipe
       over it moves the wrong thing and then chains outward. The whole list
       just renders. */
    .notices { flex: none; min-height: 0; }
    .notices ul { overflow-y: visible; max-height: none; padding-right: 0; }

    /* The tape ran to x=0 while every other row is inset by the hall's
       padding, so it read as a stray band across the page. */
    .tape { margin-left: 2px; margin-right: 2px; border-radius: 6px; }
  }

  /* A PHONE. The three counters wrapped 2 + 1, leaving THE SHELF orphaned on
     its own row under a half-empty line — an even three-column grid reads as
     a control, a 2+1 wrap reads as a mistake. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .tabs button {
      width: 100%;
      padding-left: 4px;
      padding-right: 4px;
      font-size: 11px;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }
    /* The house's own line about itself, which wrapped mid-phrase. */
    .teller { padding-top: 12px; }
  }
</style>
