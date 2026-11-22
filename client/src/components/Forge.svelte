<script lang="ts">
  // THE FORGE — the Market's fourth counter (Josh, Sep 2026). Two stations:
  // the CRUCIBLE melts emoji down into essence, the ANVIL spends essence to
  // raise one emoji a tier — a random unowned emoji of the next tier, the
  // Wheel's own award rule, all the way up to mythic. Rules + numbers live
  // in src/forge.ts; this is the room they happen in.
  import { onMount } from "svelte";
  import { emoji, refreshOwned } from "../lib/emoji.svelte";
  import { wallet, loadForge, meltEmoji, forgeUpgrade, forge } from "../lib/wallet.svelte";
  import { playSfx } from "../lib/sfx";
  import type { Emoji } from "../lib/api";
  import Essence from "./Essence.svelte";
  import Coin from "./Coin.svelte";

  const TIER_COLOR: Record<string, string> = {
    mythic: "#ff5db1", legendary: "#f39620", rare: "#9d63d2", common: "#7cae5f",
  };
  const TIER_ORDER = ["legendary", "rare", "common"];

  type Station = "melt" | "anvil";
  let station = $state<Station>("anvil");
  let msg = $state("");
  let err = $state("");

  onMount(() => {
    void loadForge();
  });

  // ---- the crucible ----
  let sel = $state<Set<string>>(new Set());
  let melting = $state(false);
  let meltConfirm = $state(false);
  /** Codes mid-melt: their tiles play the drip while the request flies. */
  let dripping = $state<Set<string>>(new Set());

  const meltable = $derived(emoji.owned.filter((e) => (forge.meltYield[e.tier] ?? 0) > 0));
  /** The tiles being melted stay on the bench for the length of the drip —
   *  refreshOwned lands well before the animation ends, and a tile that
   *  vanishes the instant you press Melt never melts on screen. */
  let held = $state<Emoji[]>([]);
  const meltSource = $derived.by(() => {
    if (!held.length) return meltable;
    const have = new Set(meltable.map((e) => e.code));
    return [...meltable, ...held.filter((e) => !have.has(e.code))];
  });
  const meltGroups = $derived(
    TIER_ORDER.map((t) => ({
      tier: t,
      items: meltSource.filter((e) => e.tier === t).slice().sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length),
  );
  const yieldOf = (tier: string): number => forge.meltYield[tier] ?? 0;
  const selYield = $derived([...sel].reduce((n, c) => n + yieldOf(meltable.find((e) => e.code === c)?.tier ?? ""), 0));

  function toggle(code: string): void {
    const next = new Set(sel);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    sel = next;
    meltConfirm = false;
    msg = "";
    err = "";
  }

  async function doMelt(): Promise<void> {
    if (!sel.size || melting) return;
    if (!meltConfirm) {
      meltConfirm = true;
      return;
    }
    melting = true;
    meltConfirm = false;
    err = "";
    dripping = new Set(sel);
    held = meltable.filter((e) => sel.has(e.code));
    playSfx("forge-melt", 0.7);
    const codes = [...sel];
    // Let the drip play before the tiles vanish — the sound is 2s long and
    // the melt should be SEEN.
    const [r] = await Promise.all([meltEmoji(codes), new Promise((res) => setTimeout(res, 1400))]);
    melting = false;
    dripping = new Set();
    held = [];
    if (r.ok) {
      msg = `Melted ${codes.length} emoji into ${r.gained} essence.`;
      sel = new Set();
    } else {
      err = r.error === "not_owned" ? "You no longer own one of those." : r.error === "unmeltable" ? "The crucible won't take that one." : "The crucible went cold — nothing was melted.";
    }
  }

  // ---- the anvil ----
  let pick = $state<string | null>(null);
  let striking = $state(false);
  let sparks = $state(false);
  let result = $state<{ got: Emoji; lost: Emoji } | null>(null);

  const forgeable = $derived(emoji.owned.filter((e) => !!forge.nextTier[e.tier]));
  const anvilGroups = $derived(
    TIER_ORDER.map((t) => ({
      tier: t,
      items: forgeable.filter((e) => e.tier === t).slice().sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length),
  );
  const picked = $derived(pick ? forgeable.find((e) => e.code === pick) ?? null : null);
  const cost = $derived(picked ? (forge.upgradeCost[picked.tier] ?? 0) : 0);
  const to = $derived(picked ? (forge.nextTier[picked.tier] ?? "") : "");
  /** Every step burns silver on top of the essence (src/forge.ts TOLLS;
   *  the mythic step's is the old MYTHIC_TOLL, kept as the fallback). */
  const toll = $derived(picked ? (forge.tolls[picked.tier] ?? (to === "mythic" ? forge.mythicToll : 0)) : 0);
  const canStrike = $derived(!!picked && cost > 0 && wallet.essence >= cost && wallet.coins >= toll && !striking);

  function choose(code: string): void {
    pick = pick === code ? null : code;
    result = null;
    msg = "";
    err = "";
  }

  async function strike(): Promise<void> {
    if (!picked || !canStrike) return;
    striking = true;
    err = "";
    result = null;
    const lost = picked;
    playSfx("forge", 0.8);
    // The hammer falls on the beat of the ring: ~350ms in.
    setTimeout(() => (sparks = true), 330);
    setTimeout(() => (sparks = false), 1100);
    const [r] = await Promise.all([forgeUpgrade(lost.code), new Promise((res) => setTimeout(res, 1150))]);
    striking = false;
    if (r.ok && r.emoji) {
      result = { got: r.emoji, lost };
      pick = null;
      msg = "";
    } else {
      err =
        r.error === "insufficient_essence" ? "Not enough essence." :
        r.error === "insufficient_silver" ? "Not enough silver for the toll." :
        r.error === "tier_complete" ? `You already own every ${to} — the anvil has nothing to give you.` :
        r.error === "in_debt" ? "The house doesn't forge trophies for people who owe the goblins." :
        r.error === "not_owned" ? "You no longer own that emoji." :
        "The strike glanced off — nothing changed.";
    }
  }

  const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
</script>

<div class="forge-scroll">
<div class="forge">
  <header class="hood">
    <div class="fire"><span></span><span></span><span></span></div>
    <div class="title">
      <h2>The Forge</h2>
      <p>Melt what you don't need. Raise what you do.</p>
    </div>
    <div class="essence-chip" title="Emoji essence — what melted emoji leave behind">
      <Essence size={18} /> <b>{wallet.essence.toLocaleString()}</b> essence
    </div>
  </header>

  <div class="stations" role="tablist" aria-label="Forge stations">
    <button class="station" class:on={station === "anvil"} role="tab" aria-selected={station === "anvil"} onclick={() => { station = "anvil"; msg = ""; err = ""; }}>
      <span class="s-name">The Anvil</span><span class="s-sub">spend essence · raise a tier</span>
    </button>
    <button class="station" class:on={station === "melt"} role="tab" aria-selected={station === "melt"} onclick={() => { station = "melt"; msg = ""; err = ""; }}>
      <span class="s-name">The Crucible</span><span class="s-sub">melt emoji · make essence</span>
    </button>
  </div>

  {#if msg}<div class="note ok">{msg}</div>{/if}
  {#if err}<div class="note err">{err}</div>{/if}

  {#if station === "anvil"}
    <section class="bench">
      <div class="anvil-stage" class:striking class:sparks>
        <svg class="hammer" viewBox="0 0 120 120" aria-hidden="true">
          <rect x="56" y="34" width="10" height="70" rx="3" fill="#6b4a2a" />
          <rect x="30" y="18" width="62" height="26" rx="5" fill="#7e858d" />
          <rect x="30" y="18" width="62" height="7" rx="3" fill="#b6bcc3" />
          <rect x="30" y="37" width="62" height="7" rx="3" fill="#4d545b" />
        </svg>
        <div class="workpiece">
          {#if result}
            <div class="reveal" style="--tier:{TIER_COLOR[result.got.tier] ?? '#fff'}">
              <img src={`/emoji/${result.got.file}`} alt={result.got.name} />
            </div>
          {:else if picked}
            <img class="piece" src={`/emoji/${picked.file}`} alt={picked.name} style="--tier:{TIER_COLOR[picked.tier] ?? '#fff'}" />
          {:else}
            <span class="empty">place an emoji</span>
          {/if}
        </div>
        <svg class="anvil" viewBox="0 0 240 110" aria-hidden="true">
          <path d="M20 30h200l-30 22H140v28h30l10 20H60l10-20h30V52H50z" fill="#3a3f46" />
          <path d="M20 30h200l-8 6H28z" fill="#5c636b" />
          <path d="M110 52h30v28h-30z" fill="#2b2f35" />
          <rect x="52" y="98" width="136" height="8" rx="2" fill="#1f2226" />
        </svg>
        <div class="spark-field" aria-hidden="true">
          {#each Array(14) as _, i}
            <i style="--i:{i}"></i>
          {/each}
        </div>
      </div>

      <div class="anvil-panel">
        {#if result}
          <p class="big">
            The hammer falls, and your <b style="color:{TIER_COLOR[result.lost.tier]}">{result.lost.name}</b> becomes
            <b style="color:{TIER_COLOR[result.got.tier]}">{result.got.name}</b> — <b>{cap(result.got.tier)}</b>.
          </p>
          <button class="go" onclick={() => (result = null)}>Forge another</button>
        {:else if picked}
          <p class="big">
            <b style="color:{TIER_COLOR[picked.tier]}">{picked.name}</b> ({picked.tier}) → a random <b style="color:{TIER_COLOR[to]}">{to}</b> you don't own yet.
          </p>
          <p class="cost">
            Costs <Essence size={14} /> <b>{cost}</b> essence and the emoji itself{#if toll > 0}, plus a toll of <Coin size={14} /> <b>{toll.toLocaleString()}</b> silver, burned{/if}.
            {#if wallet.essence < cost}<span class="short">You have {wallet.essence} essence.</span>{/if}
            {#if toll > 0 && wallet.coins < toll}<span class="short">You have {wallet.coins.toLocaleString()} silver.</span>{/if}
          </p>
          <button class="go strike" onclick={strike} disabled={!canStrike}>{striking ? "Striking…" : "Strike"}</button>
        {:else}
          <p class="big">Pick an emoji below to lay it on the anvil.</p>
          <ul class="rates">
            {#each TIER_ORDER.slice().reverse() as t}
              {#if forge.nextTier[t]}
                <li><b style="color:{TIER_COLOR[t]}">{cap(t)}</b> → <b style="color:{TIER_COLOR[forge.nextTier[t]]}">{cap(forge.nextTier[t])}</b> · <Essence size={12} /> {forge.upgradeCost[t]}</li>
              {/if}
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    {#if anvilGroups.length === 0}
      <p class="muted">Nothing to forge — win emoji on the Wheel first.</p>
    {:else}
      {#each anvilGroups as g (g.tier)}
        <div class="tier-row" style="--tier:{TIER_COLOR[g.tier]}">
          <div class="tier-head">{g.tier} · {g.items.length} · <Essence size={11} /> {forge.upgradeCost[g.tier]} each</div>
          <div class="grid">
            {#each g.items as e (e.code)}
              <button class="tile" class:sel={pick === e.code} title={`${e.name} → ${forge.nextTier[e.tier]}`} onclick={() => choose(e.code)} disabled={striking}>
                <img src={`/emoji/${e.file}`} alt={e.name} loading="lazy" />
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  {:else}
    <section class="bench crucible">
      <div class="pot" class:hot={melting}>
        <div class="molten"></div>
        <svg viewBox="0 0 200 120" aria-hidden="true">
          <path d="M30 20h140l-14 80a18 18 0 0 1-18 16H62a18 18 0 0 1-18-16z" fill="#33373d" />
          <path d="M30 20h140l-3 8H33z" fill="#555b63" />
          <ellipse cx="100" cy="22" rx="66" ry="10" fill="#1d2024" />
        </svg>
      </div>
      <div class="anvil-panel">
        <p class="big">Melt emoji into essence. They are gone for good.</p>
        <ul class="rates">
          {#each TIER_ORDER.slice().reverse() as t}
            <li><b style="color:{TIER_COLOR[t]}">{cap(t)}</b> → <Essence size={12} /> {forge.meltYield[t]}</li>
          {/each}
        </ul>
        <p class="fineprint">Mythics, the talisman and specials won't melt.</p>
      </div>
    </section>

    {#if meltGroups.length === 0}
      <p class="muted">Nothing to melt.</p>
    {:else}
      {#each meltGroups as g (g.tier)}
        <div class="tier-row" style="--tier:{TIER_COLOR[g.tier]}">
          <div class="tier-head">{g.tier} · {g.items.length} · <Essence size={11} /> {forge.meltYield[g.tier]} each</div>
          <div class="grid">
            {#each g.items as e (e.code)}
              <button class="tile" class:sel={sel.has(e.code)} class:drip={dripping.has(e.code)} title={`${e.name} — ${yieldOf(e.tier)} essence`} onclick={() => toggle(e.code)} disabled={melting}>
                <img src={`/emoji/${e.file}`} alt={e.name} loading="lazy" />
              </button>
            {/each}
          </div>
        </div>
      {/each}
      <div class="bar">
        {#if meltConfirm}
          <span class="confirm">Melt {sel.size} for <b>{selYield}</b> essence? They will be destroyed.</span>
          <button class="ghost" onclick={() => { sel = new Set(); meltConfirm = false; }} disabled={melting}>Cancel</button>
          <button class="go danger" onclick={doMelt} disabled={melting}>{melting ? "Melting…" : "Melt them"}</button>
        {:else}
          <span class="tally">
            {#if sel.size === 0}Select emoji to melt.{:else}{sel.size} selected · <Essence size={13} /> <b>{selYield}</b> essence{/if}
          </span>
          <button class="go" disabled={sel.size === 0 || melting} onclick={doMelt}>Melt</button>
        {/if}
      </div>
    {/if}
  {/if}
</div>
</div>

<style>
  /* The Market's stall is overflow:hidden and hands the view its height —
     the Shop/Trade/Auction all scroll themselves; this one didn't, so the
     inventory below the bench was unreachable (Josh, Sep 2026). */
  .forge-scroll {
    height: 100%;
    overflow-y: auto;
    padding: clamp(14px, 3vh, 28px) 18px 48px;
  }
  .forge {
    --iron: #23262b;
    --iron-2: #2e3238;
    --ember: #ff7a1a;
    --ember-2: #ffb347;
    --ess: #b36bff;
    max-width: 960px;
    margin: 0 auto;
    color: #ece4d8;
  }
  .hood {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 20px;
    border-radius: 14px 14px 4px 4px;
    background:
      radial-gradient(120% 90% at 50% 110%, rgba(255, 122, 26, 0.35), transparent 60%),
      linear-gradient(180deg, #1a1c20, #121417);
    border: 1px solid #3a3e45;
    border-bottom: 3px solid #0d0e10;
    overflow: hidden;
  }
  .fire {
    position: relative;
    width: 54px;
    height: 54px;
    flex: none;
  }
  .fire span {
    position: absolute;
    left: 50%;
    bottom: 4px;
    width: 26px;
    height: 40px;
    border-radius: 50% 50% 45% 45% / 65% 65% 35% 35%;
    background: radial-gradient(60% 70% at 50% 80%, #fff2a8, var(--ember) 55%, transparent 72%);
    transform: translateX(-50%);
    animation: flick 0.9s ease-in-out infinite alternate;
    filter: blur(0.4px);
  }
  .fire span:nth-child(2) { width: 18px; height: 30px; animation-duration: 0.7s; opacity: 0.9; }
  .fire span:nth-child(3) { width: 12px; height: 20px; animation-duration: 0.55s; background: radial-gradient(60% 70% at 50% 80%, #fff, #ffe08a 60%, transparent 75%); }
  @keyframes flick {
    from { transform: translateX(-50%) scaleY(1) rotate(-3deg); }
    to { transform: translateX(-52%) scaleY(1.14) rotate(3deg); }
  }
  .title h2 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.5rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ember-2);
    text-shadow: 0 0 18px rgba(255, 122, 26, 0.45);
  }
  .title p { margin: 2px 0 0; color: #a99d8c; font-size: 0.85rem; }
  .essence-chip {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ess) 18%, #17181c);
    border: 1px solid color-mix(in srgb, var(--ess) 55%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--ess) 30%, transparent);
    font-size: 0.9rem;
  }
  .stations {
    display: flex;
    gap: 6px;
    margin: 12px 0;
  }
  .station {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--iron);
    border: 1px solid #3a3e45;
    color: #cfc5b6;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .station.on {
    background: linear-gradient(180deg, #3a2a1c, var(--iron-2));
    border-color: var(--ember);
    box-shadow: inset 0 0 0 1px rgba(255, 122, 26, 0.25), 0 0 14px rgba(255, 122, 26, 0.18);
    color: #fff;
  }
  .s-name { font-weight: 800; letter-spacing: 0.04em; }
  .s-sub { font-size: 0.74rem; color: #a99d8c; }
  .note { padding: 8px 12px; border-radius: 8px; font-size: 0.86rem; margin-bottom: 10px; }
  .note.ok { background: rgba(124, 174, 95, 0.16); color: #cfe8bf; }
  .note.err { background: rgba(224, 86, 60, 0.16); color: #ffc7bb; }

  .bench {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 18px;
    align-items: center;
    padding: 16px;
    border-radius: 12px;
    background:
      radial-gradient(80% 60% at 50% 100%, rgba(255, 122, 26, 0.12), transparent 70%),
      linear-gradient(180deg, #1c1e22, #16181b);
    border: 1px solid #33373d;
    margin-bottom: 16px;
  }
  .anvil-stage {
    position: relative;
    height: 230px;
    display: grid;
    place-items: end center;
  }
  .anvil {
    width: 240px;
    filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.6));
  }
  .workpiece {
    position: absolute;
    left: 50%;
    bottom: 86px;
    width: 72px;
    height: 72px;
    transform: translateX(-50%);
    display: grid;
    place-items: center;
  }
  .workpiece .empty { font-size: 0.72rem; color: #6f6659; font-style: italic; white-space: nowrap; }
  .piece {
    width: 64px;
    height: 64px;
    object-fit: contain;
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--tier) 60%, transparent));
  }
  .striking .piece { animation: squash 1.15s ease-in-out; }
  @keyframes squash {
    0%, 26% { transform: none; }
    30% { transform: scaleY(0.72) scaleX(1.18); filter: brightness(2) drop-shadow(0 0 16px #fff); }
    40% { transform: none; }
    100% { transform: none; }
  }
  .reveal {
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--tier) 45%, transparent), transparent 70%);
    animation: reveal 0.6s cubic-bezier(0.2, 1.4, 0.4, 1);
  }
  .reveal img { width: 64px; height: 64px; object-fit: contain; filter: drop-shadow(0 0 14px var(--tier)); }
  @keyframes reveal { from { transform: scale(0.2); opacity: 0; } to { transform: none; opacity: 1; } }
  .hammer {
    position: absolute;
    left: 50%;
    bottom: 120px;
    width: 120px;
    transform-origin: 60px 104px;
    transform: translateX(-18px) rotate(-38deg);
    filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.55));
    transition: transform 0.25s ease;
  }
  .striking .hammer { animation: swing 1.15s cubic-bezier(0.5, 0, 0.7, 1); }
  @keyframes swing {
    0% { transform: translateX(-18px) rotate(-38deg); }
    18% { transform: translateX(-18px) rotate(-70deg); }
    30% { transform: translateX(-18px) rotate(-4deg); }
    36% { transform: translateX(-18px) rotate(-10deg); }
    42% { transform: translateX(-18px) rotate(-4deg); }
    100% { transform: translateX(-18px) rotate(-38deg); }
  }
  .spark-field { position: absolute; left: 50%; bottom: 110px; width: 0; height: 0; pointer-events: none; }
  .spark-field i {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #ffe08a;
    box-shadow: 0 0 6px var(--ember);
    opacity: 0;
    --a: calc(var(--i) * 26deg);
    --d: calc(48px + (var(--i) * 7px) - (var(--i) / 2) * 12px);
  }
  .sparks .spark-field i {
    animation: spark 0.75s ease-out forwards;
    transform: rotate(var(--a)) translateY(calc(var(--d) * -1));
  }
  @keyframes spark {
    0% { opacity: 1; transform: rotate(var(--a)) translateY(-6px) scale(1.2); }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(0.4); }
  }
  .anvil-panel .big { font-size: 1rem; line-height: 1.45; margin: 0 0 10px; }
  .anvil-panel .cost { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 0 0 12px; color: #cfc5b6; font-size: 0.9rem; }
  .short { color: #ff9a8a; margin-left: 6px; }
  .rates { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 0.86rem; color: #cfc5b6; }
  .rates li { display: flex; align-items: center; gap: 5px; }
  .fineprint { margin: 10px 0 0; color: #7f7565; font-size: 0.76rem; }
  .muted { color: #8b8072; }

  .crucible .pot { position: relative; width: 220px; margin: 0 auto; }
  .crucible .pot svg { width: 100%; position: relative; filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.6)); }
  .molten {
    position: absolute;
    left: 20%;
    right: 20%;
    top: 16%;
    height: 12%;
    border-radius: 50%;
    background: radial-gradient(60% 60% at 40% 40%, #fff0a6, var(--ember) 55%, #b33d00 90%);
    box-shadow: 0 0 22px rgba(255, 122, 26, 0.55), 0 0 60px rgba(255, 122, 26, 0.25);
    opacity: 0.55;
    transition: opacity 0.4s ease;
    z-index: 1;
  }
  .pot.hot .molten { opacity: 1; animation: bubble 0.5s ease-in-out infinite alternate; }
  @keyframes bubble { from { transform: scaleY(1); } to { transform: scaleY(1.12) translateY(-1px); } }

  .tier-row { margin-bottom: 16px; padding: 10px 12px 12px; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--tier) 9%, transparent), transparent 80%); border: 1px solid color-mix(in srgb, var(--tier) 22%, #2c2f35); }
  .tier-head { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; color: var(--tier); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 8px; }
  .tile {
    position: relative;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    padding: 6px;
    background: #1d1f23;
    border: 2px solid color-mix(in srgb, var(--tier) 30%, #2c2f35);
    border-radius: 10px;
    cursor: pointer;
    overflow: hidden;
  }
  .tile:disabled { cursor: default; }
  .tile img { width: 100%; height: 100%; object-fit: contain; }
  .tile.sel { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 18%, #1d1f23); box-shadow: 0 0 10px rgba(255, 122, 26, 0.35); }
  .tile.drip img { animation: drip 1.5s ease-in forwards; }
  .tile.drip::after {
    content: "";
    position: absolute;
    inset: auto 0 0 0;
    height: 0;
    background: linear-gradient(180deg, transparent, var(--ember) 40%, #ffd37a);
    animation: pool 1.5s ease-in forwards;
  }
  @keyframes drip {
    0% { transform: none; filter: none; }
    35% { filter: brightness(1.6) saturate(1.4) hue-rotate(-20deg); }
    100% { transform: translateY(60%) scaleY(0.2) scaleX(1.3); filter: brightness(2) blur(2px); opacity: 0; }
  }
  @keyframes pool { 0% { height: 0; } 100% { height: 55%; } }

  .bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: #1c1e22; border: 1px solid #33373d; }
  .tally { display: inline-flex; align-items: center; gap: 4px; flex: 1; color: #cfc5b6; font-size: 0.9rem; }
  .confirm { flex: 1; color: #ffd6c4; font-size: 0.9rem; }
  .go {
    padding: 8px 16px;
    border-radius: 9px;
    border: 1px solid #7a4b1f;
    background: linear-gradient(180deg, #ff9a3c, #d9631a);
    color: #1a0e04;
    font-weight: 800;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
  }
  .go:hover:not(:disabled) { filter: brightness(1.08); }
  .go:disabled { opacity: 0.45; cursor: not-allowed; }
  .go.danger { background: linear-gradient(180deg, #ff6b4a, #c93a1e); }
  .go.strike { font-size: 1rem; padding: 10px 26px; letter-spacing: 0.08em; text-transform: uppercase; box-shadow: 0 0 18px rgba(255, 122, 26, 0.35); }
  .ghost { padding: 8px 14px; border-radius: 9px; border: 1px solid #3a3e45; background: transparent; color: #cfc5b6; cursor: pointer; font: inherit; }

  @media (max-width: 700px) {
    .bench { grid-template-columns: 1fr; }
    .hood { flex-wrap: wrap; }
    .essence-chip { margin-left: 0; }
  }
</style>
