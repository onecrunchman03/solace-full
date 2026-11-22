<script lang="ts">
  // THE VIP ROOM (Josh, Sep 2026) — the side shop behind the rope at
  // Sterling's, for people who have finished a collection. Outsiders see
  // the rope and the four bars (half the prestige is being seen not to be
  // let in); members see the shelves, their own open, the higher ones
  // behind glass with the count still to go. Sterling speaks through the
  // Shop's own bubble (`say`) so the Room has his voice, not a second one.
  import { onMount } from "svelte";
  import { vip, loadVip, buyVip, consolidate, VIP_RANK_NAMES, VIP_METALS, VIP_TIER_LABEL, vipTierOfItem } from "../lib/vip.svelte";
  import { loadLender } from "../lib/lender.svelte";
  import { emporium, equip } from "../lib/emporium.svelte";
  import { wallet } from "../lib/wallet.svelte";
  import { session } from "../lib/session.svelte";
  import { chaChing } from "../lib/shop-audio";
  import { suitPic, suitPicStyle } from "../lib/suitpic.svelte";
  import type { VipItem } from "../lib/api";
  import Coin from "./Coin.svelte";

  let { say }: { say: (line: string) => void } = $props();

  onMount(() => {
    void loadVip();
  });

  const inside = $derived(vip.rank >= 1);
  const rankName = $derived(VIP_RANK_NAMES[vip.rank] ?? "");
  const TIERS = ["common", "rare", "legendary", "mythic"] as const;
  // THE RELICS JOIN THE LADDER (Josh, Sep 2026): every rung also needs its
  // share of the Backrooms' relics (2 · 8 · 14 · all), read off the
  // server's fifth progress row and its per-rank `relicNeed`.
  const relicRow = $derived(vip.progress.find((x) => x.tier === "relic") ?? { owned: 0, total: 0 });
  const shelves = $derived(
    TIERS.map((t, i) => {
      const n = i + 1;
      const p = vip.progress.find((x) => x.tier === t);
      const need = vip.relicNeed[n] ?? 0;
      return {
        n,
        tier: t,
        metal: VIP_METALS[n],
        name: VIP_RANK_NAMES[n],
        owned: p?.owned ?? 0,
        total: p?.total ?? 0,
        relics: Math.min(relicRow.owned, need),
        relicNeed: need,
        open: n <= vip.rank,
        items: vip.items.filter((it) => it.tier === n),
      };
    }),
  );
  const pct = (s: { owned: number; total: number }) => (s.total ? Math.min(100, Math.floor((s.owned / s.total) * 100)) : 0);
  const relicPct = (s: { relics: number; relicNeed: number }) => (s.relicNeed ? Math.min(100, Math.floor((s.relics / s.relicNeed) * 100)) : 0);

  const BOUGHT_LINES: Record<number, string[]> = {
    1: ["Copper. The first metal the Foundry ever poured. Wear it where they can see it.", "Sold, Collector. I'll enter it in the book myself."],
    2: ["Silver — my own currency, cut to fit you.", "A Connoisseur's choice. Naturally."],
    3: ["Gold, from the vault the goblins never found.", "Magnate. The word suits the purchase."],
    4: ["There is nothing above this shelf. There is nothing above you.", "The house keeps very few things for The Complete. Take it."],
  };

  function slotOf(i: VipItem): string | null {
    return i.kind === "suit" ? null : i.kind;
  }
  function isEquipped(i: VipItem): boolean {
    const s = slotOf(i);
    return !!s && (emporium.cosmetics as Record<string, string | undefined>)[s] === i.id;
  }
  async function onBuy(i: VipItem) {
    if (await buyVip(i.id)) {
      chaChing();
      const pool = BOUGHT_LINES[i.tier] ?? BOUGHT_LINES[1];
      say(pool[Math.floor(Math.random() * pool.length)]);
    } else if (vip.error) {
      say(vip.error);
    }
  }
  async function onEquip(i: VipItem) {
    const s = slotOf(i);
    if (!s) return;
    await equip(s, isEquipped(i) ? null : i.id);
  }
  const suitColor = (i: VipItem) => i.id.replace(/^suit-vip\d-/, "");
  async function onConsolidate() {
    const r = await consolidate();
    say(r.ok ? `Settled. ${(r.paid ?? 0).toLocaleString()} silver, off the Foundry's books. The goblins will sulk for a week.` : (r.error ?? "No."));
    if (r.ok) void loadLender();
  }
</script>

<section class="room" class:inside>
  {#if !vip.loaded}
    <p class="muted">Sterling is checking the book…</p>
  {:else if vip.error && !vip.items.length}
    <p class="muted">{vip.error}</p>
  {:else if !inside}
    <!-- THE ROPE: what everyone who hasn't finished a collection sees. -->
    <div class="rope-wrap" aria-label="Members only">
      <svg class="rope" viewBox="0 0 520 120" aria-hidden="true">
        <defs>
          <linearGradient id="vip-brass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f2d27a" /><stop offset="0.5" stop-color="#b8862c" /><stop offset="1" stop-color="#6e4b12" />
          </linearGradient>
          <linearGradient id="vip-velvet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#b3202c" /><stop offset="1" stop-color="#5a0c14" />
          </linearGradient>
        </defs>
        <!-- posts -->
        {#each [40, 480] as x (x)}
          <ellipse cx={x} cy="112" rx="26" ry="6" fill="#000" opacity="0.35" />
          <rect x={x - 16} y="100" width="32" height="10" rx="3" fill="url(#vip-brass)" />
          <rect x={x - 4} y="24" width="8" height="78" fill="url(#vip-brass)" />
          <circle cx={x} cy="20" r="9" fill="url(#vip-brass)" />
          <circle cx={x - 3} cy="17" r="2.5" fill="#fff" opacity="0.5" />
        {/each}
        <!-- the rope, sagging between them -->
        <path d="M46 30 Q260 96 474 30" fill="none" stroke="#2a0509" stroke-width="16" stroke-linecap="round" opacity="0.45" />
        <path d="M46 30 Q260 92 474 30" fill="none" stroke="url(#vip-velvet)" stroke-width="12" stroke-linecap="round" />
        <path d="M46 30 Q260 92 474 30" fill="none" stroke="#e8404f" stroke-width="3" stroke-dasharray="6 14" stroke-linecap="round" opacity="0.5" />
        <!-- the plate -->
        <rect x="185" y="56" width="150" height="34" rx="5" fill="#1a1208" stroke="url(#vip-brass)" stroke-width="2.5" />
        <text x="260" y="78" text-anchor="middle" font-size="13" font-weight="800" letter-spacing="3" fill="#f2d27a" font-family="Georgia, serif">MEMBERS ONLY</text>
      </svg>
      <h3 class="plate-title">THE VIP ROOM</h3>
      <p class="fine">Reserved for people who have <b>finished a collection</b>. Every common opens the door; every tier above it opens another shelf. Sterling keeps the book.</p>
    </div>
  {:else}
    <div class="hall-head">
      <span class="crest">✦</span>
      <div>
        <h3 class="plate-title">THE VIP ROOM</h3>
        <p class="rank-line">
          {session.user?.displayName ?? "You"} · <b class="rank t{vip.rank}">{rankName}</b> · {VIP_METALS[vip.rank]} tier
          {#if session.user?.isAdmin}<span class="house">the house — every shelf open</span>{/if}
        </p>
      </div>
      <div class="purse">Your purse: <Coin size={13} /> <b>{wallet.coins.toLocaleString()}</b></div>
    </div>
  {/if}

  <!-- The four bars — the ladder, always visible. -->
  <ol class="ladder">
    {#each shelves as s (s.n)}
      <li class="rung" class:open={s.open} class:done={s.owned >= s.total && s.total > 0 && s.relics >= s.relicNeed}>
        <span class="mark t{s.n}">{s.open ? "✦" : "✧"}</span>
        <span class="rung-name">Tier {s.n} · <b>{s.name}</b> <small>{VIP_TIER_LABEL[s.tier]}</small></span>
        <span class="bars">
          <span class="bar"><span class="fill t{s.n}" style="width:{pct(s)}%"></span></span>
          <span class="bar relic" title="Backrooms relics unlocked"><span class="fill t{s.n}" style="width:{relicPct(s)}%"></span></span>
        </span>
        <span class="count">
          {s.owned.toLocaleString()} / {s.total.toLocaleString()}
          <small>🗝 {s.relics} / {s.relicNeed} relic{s.relicNeed === 1 ? "" : "s"}</small>
        </span>
      </li>
    {/each}
  </ol>

  {#if inside}
    {#each shelves as s (s.n)}
      <div class="shelf t{s.n}" class:glass={!s.open}>
        <div class="shelf-head">
          <span class="metal t{s.n}">{s.metal} shelf</span>
          <span class="shelf-sub">
            {#if s.open}open to you{:else}{(s.total - s.owned).toLocaleString()} {s.tier === "common" ? "commons" : s.tier === "rare" ? "rares" : s.tier === "legendary" ? "legendaries" : "mythics"} to go{/if}
          </span>
        </div>
        {#if s.n === 4}
          <!-- THE PERKS ride the rank — nothing to buy, everything to have. -->
          <div class="perks" class:live={vip.perks?.active}>
            <span class="perks-head">{vip.perks?.active ? "YOURS, WITH THE RANK" : "COMES WITH THE RANK"}</span>
            <ul>
              <li>🍾 Drinks at the bar are free.</li>
              <li>🧪 The vial, the canister and the shot at half price.</li>
              <li>⚖ Once a life, when you've missed a day and can't pay, the house pays the goblins what you owe — from the cell too.
                {#if vip.perks?.active}
                  {#if vip.perks.consolidation.used}<span class="pk-note">used this life</span>
                  {:else if vip.perks.consolidation.eligible}
                    <button class="go slim" disabled={vip.busy} onclick={() => void onConsolidate()}>Have the house settle it</button>
                  {:else if vip.perks.consolidation.hasLoan}<span class="pk-note">current — the house steps in once a day is missed</span>
                  {:else}<span class="pk-note">nothing owed</span>{/if}
                {/if}
              </li>
            </ul>
          </div>
        {/if}
        {#if s.items.length === 0}
          <p class="muted fitting">Being fitted. Sterling has the measurements.</p>
        {:else}
          <div class="egrid">
            {#each s.items as i (i.id)}
              <div class="eitem" class:owned={i.owned}>
                <div class="epreview">
                  {#if i.kind === "suit"}
                    <!-- the locker's own suit art, in this colorway, with its brass -->
                    <img class="suit-demo" src={suitPic(suitColor(i))} alt={i.name} style={suitPicStyle(suitColor(i))} />
                  {:else if i.kind === "cardback"}
                    <span class="cardback-demo {i.id}"></span>
                  {:else if i.kind === "dice"}
                    <span class="dice-demo {i.id}">⚄⚂</span>
                  {:else if i.kind === "border"}
                    <span class="ava-demo {i.id}">S</span>
                  {:else if i.kind === "flair"}
                    <span class="flair-demo {i.id}">{session.user?.displayName ?? "Name"}</span>
                  {:else}
                    <span class="title-demo"><span class="vipmark t{vipTierOfItem(i.id)}">✦</span>{i.name}</span>
                  {/if}
                </div>
                <div class="ebody">
                  <span class="ename">{i.name}</span>
                  <span class="eblurb">{i.blurb}</span>
                </div>
                <div class="eact">
                  {#if !i.owned}
                    <button class="go" disabled={vip.busy || i.locked || wallet.coins < i.price} onclick={() => onBuy(i)}>
                      <Coin size={12} /> {i.price.toLocaleString()}
                    </button>
                  {:else if i.kind === "suit"}
                    <span class="hint">In your locker — pick it at the casino door or in the Backrooms.</span>
                  {:else}
                    <button class="go ghosty" class:eq={isEquipped(i)} disabled={emporium.busy} onclick={() => onEquip(i)}>
                      {isEquipped(i) ? "Equipped ✓" : "Equip"}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    <p class="fine">Nothing on these shelves is ever sold outside the rope, and nothing here can be traded. The silver burns, as ever.</p>
  {/if}
</section>

<style>
  /* Velvet and brass — a darker room than the shop outside it. */
  .room {
    max-width: 1040px;
    margin: 0 auto;
    padding: 18px 20px 22px;
    border-radius: 16px;
    border: 1px solid rgba(214, 170, 82, 0.35);
    background:
      radial-gradient(420px 200px at 50% -40px, rgba(214, 170, 82, 0.18), transparent 70%),
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.14) 0 2px, transparent 2px 28px),
      linear-gradient(180deg, #2a0b12 0%, #1a0609 55%, #120306 100%);
    box-shadow: inset 0 -16px 36px rgba(0, 0, 0, 0.5);
    color: #efe3c8;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .muted { color: rgba(239, 227, 200, 0.6); margin: 0; }
  .fine { font-size: 0.78rem; color: rgba(239, 227, 200, 0.7); margin: 0; text-align: center; }
  .fine b { color: #f2d27a; }

  .rope-wrap { text-align: center; display: flex; flex-direction: column; gap: 6px; align-items: center; }
  .rope { width: min(520px, 100%); height: auto; display: block; }
  .plate-title {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.35rem;
    letter-spacing: 0.32em;
    color: #f2d27a;
    text-shadow: 0 0 14px rgba(242, 210, 122, 0.35);
  }

  .hall-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .crest { font-size: 1.9rem; color: #f2d27a; text-shadow: 0 0 16px rgba(242, 210, 122, 0.6); }
  .rank-line { margin: 2px 0 0; font-size: 0.86rem; color: rgba(239, 227, 200, 0.8); }
  .rank { font-weight: 800; letter-spacing: 0.04em; }
  .house { margin-left: 8px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; color: #7fe6ec; }
  .purse { margin-left: auto; font-size: 0.86rem; display: inline-flex; align-items: center; gap: 5px; }

  /* the ladder */
  .ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .rung {
    display: grid;
    grid-template-columns: 22px minmax(140px, 1fr) minmax(120px, 2fr) auto;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 9px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(214, 170, 82, 0.14);
    font-size: 0.8rem;
    opacity: 0.72;
  }
  .rung.open { opacity: 1; border-color: rgba(214, 170, 82, 0.4); }
  .rung-name small { display: block; font-size: 0.68rem; color: rgba(239, 227, 200, 0.55); }
  .bars { display: flex; flex-direction: column; gap: 3px; }
  .bar { height: 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.5); overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.06); }
  .bar.relic { height: 4px; opacity: 0.8; }
  .fill { display: block; height: 100%; border-radius: 999px; transition: width 0.6s ease; }
  .count { font-variant-numeric: tabular-nums; color: rgba(239, 227, 200, 0.85); text-align: right; }
  .count small { display: block; font-size: 0.66rem; color: rgba(239, 227, 200, 0.6); white-space: nowrap; }

  /* the metals */
  .t1, .fill.t1 { --m: #d4874a; }
  .t2, .fill.t2 { --m: #d9dde6; }
  .t3, .fill.t3 { --m: #ffd35c; }
  .t4, .fill.t4 { --m: #ff7ac6; }
  .fill { background: linear-gradient(90deg, color-mix(in srgb, var(--m) 55%, #000), var(--m)); }
  .fill.t4 { background: linear-gradient(90deg, #ff7ac6, #7fe6ec, #ffd35c); }
  .mark, .rank, .metal { color: var(--m); text-shadow: 0 0 8px color-mix(in srgb, var(--m) 60%, transparent); }
  .rank.t4, .metal.t4 {
    background: linear-gradient(90deg, #ff7ac6, #7fe6ec, #ffd35c);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow: none;
  }

  /* the shelves */
  .shelf {
    padding: 12px 14px 14px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--m) 35%, transparent);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.38));
    position: relative;
  }
  .shelf.glass { opacity: 0.55; }
  .shelf.glass::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: linear-gradient(115deg, rgba(255, 255, 255, 0.06), transparent 40%, rgba(255, 255, 255, 0.04) 70%, transparent);
    pointer-events: none;
  }
  .shelf-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
  .metal { font-weight: 800; font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; }
  .shelf-sub { font-size: 0.72rem; color: rgba(239, 227, 200, 0.6); }
  .fitting { font-style: italic; font-size: 0.8rem; }
  .perks { margin-bottom: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(0, 0, 0, 0.3); border: 1px dashed rgba(255, 122, 198, 0.35); }
  .perks.live { border-style: solid; border-color: rgba(127, 230, 236, 0.5); }
  .perks-head { display: block; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.18em; color: #7fe6ec; margin-bottom: 6px; }
  .perks ul { margin: 0; padding-left: 18px; font-size: 0.8rem; line-height: 1.6; color: rgba(239, 227, 200, 0.85); }
  .pk-note { margin-left: 6px; font-size: 0.7rem; color: rgba(239, 227, 200, 0.55); text-transform: uppercase; letter-spacing: 0.08em; }
  .go.slim { margin-left: 8px; padding: 3px 9px; font-size: 0.72rem; }

  /* The Emporium's own card shape (preview · text · action in one row) so
     the Room's shelves read like the shop outside, only darker. */
  .egrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(400px, 100%), 1fr)); gap: 10px; }
  .eitem {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(214, 170, 82, 0.18);
  }
  .eitem.owned { border-color: color-mix(in srgb, var(--m, #f2d27a) 55%, transparent); }
  /* 64px like the Emporium, but a title pill may take up to 120px so a
     one-word title never breaks mid-word. */
  .epreview { flex: none; min-width: 64px; max-width: 120px; display: grid; place-items: center; }
  .ebody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ename { font-weight: 700; font-size: 0.9rem; color: #f6ecd2; }
  .eblurb { font-size: 0.74rem; color: rgba(239, 227, 200, 0.68); line-height: 1.35; }
  .eact { flex: none; display: flex; gap: 6px; align-items: center; max-width: 150px; }
  .hint { font-size: 0.68rem; color: rgba(239, 227, 200, 0.6); text-align: right; }
  .go {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 6px 12px; border-radius: 8px; border: 1px solid #b8862c;
    background: linear-gradient(180deg, #f2d27a, #b8862c); color: #2a1608;
    font: inherit; font-size: 0.8rem; font-weight: 800; cursor: pointer;
  }
  .go:disabled { opacity: 0.45; cursor: default; }
  .go.ghosty { background: none; color: #f2d27a; }
  .go.ghosty.eq { border-color: #7fe6ec; color: #7fe6ec; }

  /* previews (the Shop's shapes, in the Room's light) */
  .cardback-demo { display: block; width: 30px; height: 42px; border-radius: 5px; border: 1.5px solid rgba(255, 255, 255, 0.2); }
  .dice-demo { font-size: 1.7rem; line-height: 1; }
  .ava-demo { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #3a2a1a; color: #f6ecd2; font-weight: 800; }
  .flair-demo { font-weight: 800; font-size: 0.85rem; }
  .title-demo {
    display: inline-block; box-sizing: border-box; max-width: 100%;
    font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
    line-height: 1.25; padding: 3px 7px; border-radius: 12px; background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(242, 210, 122, 0.5); color: #f6ecd2; text-align: center;
    overflow-wrap: anywhere; /* stays inside the 64px preview column */
  }
  .epreview { overflow: hidden; }
  /* the locker's suit art, recoloured exactly as the locker recolours it */
  .suit-demo { width: 56px; height: 64px; object-fit: contain; border-radius: 6px; background: rgba(90, 88, 84, 0.14); }

  /* THE LADDER ON A PHONE (Josh, Sep 2026: the VIP room "need ui scalping
     fixes as well with the text" — his screenshot had "40 / 565" broken
     across three lines, one number per line).

     Two faults. The desktop rung is four columns whose minimums add up to
     312px (22 + 140 + 120 + gaps) inside a 295px row, so something had to
     give. And the phone override that was meant to rescue it targeted
     `.rung .bar` — the fill INSIDE the meter — while the actual grid child
     is `.bars`. So the rule matched nothing, four children went into three
     columns, and the count wrapped onto a second row starting in the 18px
     MARK column. A number in an 18px box wraps one digit at a time.

     Placed explicitly instead of left to auto-flow: mark, name and count on
     the first row, the two meters spanning underneath. And the count says
     `nowrap`, because "40 / 565" is one fact and should never be three. */
  @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
    .rung {
      grid-template-columns: 18px minmax(0, 1fr) auto;
      gap: 5px 8px;
    }
    .mark {
      grid-column: 1;
      grid-row: 1;
    }
    .rung-name {
      grid-column: 2;
      grid-row: 1;
    }
    .count {
      grid-column: 3;
      grid-row: 1;
      white-space: nowrap;
    }
    .count small {
      white-space: nowrap;
    }
    .bars {
      grid-column: 2 / -1;
      grid-row: 2;
    }
    .eitem { flex-wrap: wrap; }
    .eact { max-width: none; width: 100%; justify-content: flex-end; }
  }
</style>
